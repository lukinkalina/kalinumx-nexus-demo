var KXPersonalRuntime;
(function (KXPersonalRuntime) {
    class Runtime {
        service;
        bridge;
        ownerAdapters = new Map();
        refreshProofs = new Map();
        // In-memory generations prevent an old async adapter read from certifying a newer card.
        proofGenerations = new Map();
        // Stage142: card identity -> sourceRevision delivered by a LIVE owner path in THIS
        // runtime (refreshOwner / publishOwner). Restored durable rows are never in this map.
        liveRevisions = new Map();
        bumpProof(key, invalidate = true) { const next = (this.proofGenerations.get(key) ?? 0) + 1; this.proofGenerations.set(key, next); if (invalidate)
            this.refreshProofs.delete(key); return next; }
        constructor(repository) {
            if (!repository || typeof repository.open !== 'function' || typeof repository.get !== 'function' || typeof repository.atomic !== 'function')
                throw new Error('Personal Home requires a real CoreRepository-compatible storage adapter');
            if (typeof KXPersonal?.PersonalProjectionService !== 'function' || typeof KXPersonalBridge?.PersonalProjectionBridge !== 'function' || typeof KXPersonalPersistence?.PersonalProjectionRepositoryAdapter !== 'function')
                throw new Error('Personal Home runtime modules unavailable');
            this.service = new KXPersonal.PersonalProjectionService();
            this.bridge = new KXPersonalBridge.PersonalProjectionBridge(this.service, new KXPersonalPersistence.PersonalProjectionRepositoryAdapter(repository));
        }
        descriptors() { return this.service.listDescriptors(); }
        // Owner adapters are explicit and local to the active workspace runtime.
        // A provider supplies source data; the caller supplies authorization.
        registerOwnerAdapter(ownerApp, adapter) {
            if (typeof ownerApp !== 'string' || !this.descriptors().some((d) => d.ownerApp === ownerApp))
                throw new Error('Unknown Personal Home owner');
            if (typeof adapter !== 'function')
                throw new Error('Owner adapter must be a function');
            if (this.ownerAdapters.has(ownerApp))
                throw new Error('Owner adapter already registered');
            this.ownerAdapters.set(ownerApp, adapter);
        }
        async refreshOwner(request) {
            if (request?.permissionGranted !== true)
                throw new Error('Owner refresh requires explicit permission');
            const d = this.service.descriptor(request?.projectionCode);
            if (!d || d.ownerApp !== request?.ownerApp)
                throw new Error('Owner projection mismatch');
            if (typeof request?.subjectId !== 'string' || !request.subjectId.trim() || request.subjectId.length > 256)
                throw new Error('Invalid refresh subject');
            const adapter = this.ownerAdapters.get(d.ownerApp);
            if (!adapter)
                throw new Error('Owner adapter not registered');
            const proofKey = JSON.stringify([d.projectionCode, request.subjectId]);
            const proofGeneration = this.bumpProof(proofKey, false);
            const event = await adapter(Object.freeze({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, subjectId: request.subjectId }));
            if (!event || event.projectionCode !== d.projectionCode || event.ownerApp !== d.ownerApp || event.subjectId !== request.subjectId)
                throw new Error('Owner adapter identity mismatch');
            const published = await this.bridge.publishAndSave({ ...event, permissionGranted: true });
            // Runtime evidence is only valid when the persisted/read-back revision is
            // the exact revision supplied by the owner, not merely a successful call.
            // Do not mistake a stale/duplicate owner delivery for fresh owner data.
            if (published?.sourceRevision !== event.sourceRevision || published?.lastVerifiedAt !== event.generatedAt)
                throw new Error('Owner refresh did not publish the supplied revision');
            // An accepted historical owner snapshot is not necessarily live/fresh.
            // Keep the actual persisted result but do not certify stale owner data as
            // a completed live refresh (and do not erase prior evidence on rejection).
            this.liveRevisions.set(proofKey, String(published.sourceRevision));
            if (this.proofGenerations.get(proofKey) === proofGeneration && published.displayState === 'LIVE' && published.freshness === 'FRESH' && published.snapshot !== null)
                this.refreshProofs.set(proofKey, { lastSuccessAt: Date.now(), sourceRevision: published.sourceRevision });
            return published;
        }
        // Per-subject runtime evidence requires a completed, authorized owner read and persist.
        ownerRefreshEvidence(projectionCode, subjectId, permissionGranted) {
            if (permissionGranted !== true)
                throw new Error('Refresh evidence requires explicit permission');
            if (typeof subjectId !== 'string' || !subjectId.trim() || subjectId.length > 256 || !this.service.descriptor(projectionCode))
                throw new Error('Invalid refresh evidence identity');
            const d = this.service.descriptor(projectionCode);
            const key = JSON.stringify([projectionCode, subjectId]);
            let proof = this.refreshProofs.get(key);
            // Stage130: a refresh success is not a perpetual freshness certificate.
            // Check the actual card at the current clock and discard evidence once
            // the card is no longer LIVE/FRESH at its certified source revision.
            if (proof) {
                const current = this.service.read({ projectionCode, subjectId, permissionGranted: true, now: Date.now() });
                if (current.displayState !== 'LIVE' || current.freshness !== 'FRESH' || current.sourceRevision !== proof.sourceRevision || current.snapshot === null) {
                    this.refreshProofs.delete(key);
                    proof = undefined;
                }
            }
            return Object.freeze({ projectionCode, ownerApp: d.ownerApp, subjectId, providerRegistered: this.ownerAdapters.has(d.ownerApp),
                status: proof ? 'RUNTIME_REFRESH_SUCCEEDED' : this.ownerAdapters.has(d.ownerApp) ? 'REGISTERED_UNVERIFIED' : 'MISSING_PROVIDER',
                lastSuccessAt: proof?.lastSuccessAt ?? null, sourceRevision: proof?.sourceRevision ?? null, productionVerified: false });
        }
        // Report only physically registered owner providers. Descriptors do not imply integration.
        ownerSourceCoverage() {
            return this.descriptors().map((d) => Object.freeze({
                projectionCode: d.projectionCode,
                ownerApp: d.ownerApp,
                providerRegistered: this.ownerAdapters.has(d.ownerApp),
                integrationStatus: this.ownerAdapters.has(d.ownerApp) ? 'REGISTERED_UNVERIFIED' : 'MISSING_PROVIDER',
                // Stage140: provenance of the registered provider + explicit sensitive policy gate.
                providerKind: this.ownerAdapters.get(d.ownerApp)?.kxProviderKind ?? (this.ownerAdapters.has(d.ownerApp) ? 'EXPLICIT_CALLER' : null),
                sensitivePersistence: (d.sensitiveFields || []).length ? 'BLOCKED_POLICY' : 'NOT_APPLICABLE'
            }));
        }
        // Stage142 fix: a restored/unconfirmed card must never be reported LIVE just because
        // the caller omitted ownerAvailability. AVAILABLE is granted only to the exact revision
        // delivered live in this runtime; callers may downgrade but never upgrade.
        readCards(input) {
            if (!input || !Array.isArray(input.requests))
                return this.service.readBatch(input);
            const requests = input.requests.map((r) => {
                if (!r || typeof r !== 'object' || r.permissionGranted !== true || typeof r.projectionCode !== 'string' || typeof r.subjectId !== 'string')
                    return r;
                const key = JSON.stringify([r.projectionCode, r.subjectId]), live = this.liveRevisions.get(key);
                let confirmed = false;
                if (live !== undefined) {
                    try {
                        confirmed = this.service.read({ projectionCode: r.projectionCode, subjectId: r.subjectId, permissionGranted: true, ownerAvailability: 'DEGRADED', now: input.now ?? r.now })?.sourceRevision === live;
                    }
                    catch {
                        confirmed = false;
                    }
                }
                if (confirmed)
                    return r;
                return (r.ownerAvailability === undefined || r.ownerAvailability === 'AVAILABLE') ? { ...r, ownerAvailability: 'DEGRADED' } : r;
            });
            return this.service.readBatch({ ...input, requests });
        }
        // Evidence describes the latest successful adapter refresh, not an arbitrary
        // later direct publication or a durable restore from another runtime.
        async publishOwner(input) {
            const key = typeof input?.projectionCode === 'string' && typeof input?.subjectId === 'string'
                ? JSON.stringify([input.projectionCode, input.subjectId]) : null;
            // Fence a concurrent refresh immediately, but only erase valid evidence on commit.
            if (key)
                this.bumpProof(key, false);
            const published = await this.bridge.publishAndSave(input);
            if (key)
                this.refreshProofs.delete(key);
            if (key && published?.sourceRevision !== undefined)
                this.liveRevisions.set(key, String(published.sourceRevision));
            return published;
        }
        async restoreCards(input) {
            const result = await this.bridge.restoreBatch(input);
            this.liveRevisions.clear();
            this.refreshProofs.clear();
            for (const key of this.proofGenerations.keys())
                this.bumpProof(key);
            return result;
        }
        async restoreCard(input) {
            const result = await this.bridge.restore(input);
            this.liveRevisions.clear();
            this.refreshProofs.clear();
            for (const key of this.proofGenerations.keys())
                this.bumpProof(key);
            return result;
        }
    }
    KXPersonalRuntime.create = (repository) => new Runtime(repository);
})(KXPersonalRuntime || (KXPersonalRuntime = {}));
