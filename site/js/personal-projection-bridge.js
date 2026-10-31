var KXPersonalBridge;
(function (KXPersonalBridge) {
    class PersonalProjectionBridge {
        service;
        persistence;
        publishQueues = new Map();
        constructor(service, persistence) {
            this.service = service;
            this.persistence = persistence;
            if (!service || typeof service.descriptor !== 'function' || typeof service.publish !== 'function' || typeof service.read !== 'function')
                throw Error('Personal projection service required');
            if (!persistence || typeof persistence.save !== 'function' || typeof persistence.load !== 'function')
                throw Error('Projection persistence required');
        }
        descriptor(projectionCode) { const d = this.service.descriptor(projectionCode); if (!d)
            throw Error('Unregistered owner projection'); if ((d.sensitiveFields || []).length)
            throw Error('Sensitive owner projection persistence requires separate policy'); return d; }
        async publishAndSave(input) {
            // Serialize read/check/save/publish per owner-card identity. Concurrent
            // callers must not both pass a stale preflight before either save settles.
            const key = JSON.stringify([input?.projectionCode, input?.subjectId]);
            const predecessor = this.publishQueues.get(key) ?? Promise.resolve();
            const operation = predecessor.catch(() => undefined).then(() => this.publishAndSaveLocked(input));
            const settled = operation.then(() => undefined, () => undefined);
            this.publishQueues.set(key, settled);
            void settled.then(() => { if (this.publishQueues.get(key) === settled)
                this.publishQueues.delete(key); });
            return operation;
        }
        async publishAndSaveLocked(input) {
            if (input?.permissionGranted !== true)
                throw Error('Owner publish permission required');
            const d = this.descriptor(input.projectionCode);
            if (input.ownerApp !== d.ownerApp)
                throw Error('Owner descriptor mismatch');
            // The source owner supplies real data; no generated placeholders.
            // Validate in an isolated service before touching either durable state or LIVE memory.
            const CandidateService = KXPersonal?.PersonalProjectionService;
            if (typeof CandidateService !== 'function')
                throw Error('Personal projection validator unavailable');
            const candidate = new CandidateService();
            candidate.registerDescriptor(d);
            const snapshot = candidate.publish(input);
            if (snapshot.redactedFields?.length)
                throw Error('Redacted projection cannot be persisted');
            // Do not advance durable storage with an out-of-order owner event that the
            // active service would ignore or reject. Check BEFORE the durable write.
            const active = this.service.read({ projectionCode: input.projectionCode, subjectId: input.subjectId, permissionGranted: true, ownerAvailability: 'DEGRADED' });
            if (active.lastVerifiedAt !== undefined) {
                if (active.lastVerifiedAt > snapshot.generatedAt)
                    throw Error('Stale owner publish rejected before persistence');
                if (active.lastVerifiedAt === snapshot.generatedAt && active.sourceRevision !== undefined && active.sourceRevision !== snapshot.sourceRevision)
                    throw Error('Conflicting owner revision before persistence');
                // A retry of an identical revision must not overwrite durable data with a
                // different payload. The active service already enforces this on publish;
                // apply the same check BEFORE persistence.save.
                if (active.lastVerifiedAt === snapshot.generatedAt && active.sourceRevision === snapshot.sourceRevision && active.snapshot !== null &&
                    JSON.stringify(active.snapshot) !== JSON.stringify(snapshot.payload))
                    throw Error('Conflicting owner payload before persistence');
            }
            // A failed durable write must never leave behind a fabricated LIVE card.
            await this.persistence.save({ projectionCode: input.projectionCode, subjectId: input.subjectId, permissionGranted: true, snapshot });
            this.service.publish(input);
            return this.service.read({ projectionCode: input.projectionCode, subjectId: input.subjectId, permissionGranted: true, ownerAvailability: 'AVAILABLE' });
        }
        // Restore a bounded set of persisted cards. Each card retains its own
        // permission boundary and restores as degraded/LKG, never fabricated LIVE.
        async restoreBatch(input) {
            // Reserve all authorized card identities synchronously, BEFORE any async
            // restore read. Subsequent publish operations must queue behind restore,
            // not overtake it between its preflight and publication.
            if (!input || !Array.isArray(input.requests) || input.requests.length < 1 || input.requests.length > 48)
                throw Error('Invalid persisted Personal Home batch');
            const keys = [...new Set(input.requests.filter((r) => r?.permissionGranted === true)
                    .map((r) => JSON.stringify([r.projectionCode, r.subjectId])))].sort();
            const predecessors = keys.map(key => this.publishQueues.get(key)).filter(Boolean);
            let release;
            const reservation = new Promise(resolve => { release = resolve; });
            for (const key of keys)
                this.publishQueues.set(key, reservation);
            try {
                await Promise.all(predecessors);
                return await this.restoreBatchLocked(input);
            }
            finally {
                release();
                for (const key of keys)
                    if (this.publishQueues.get(key) === reservation)
                        this.publishQueues.delete(key);
            }
        }
        async restoreBatchLocked(input) {
            if (!input || !Array.isArray(input.requests) || input.requests.length < 1 || input.requests.length > 48)
                throw Error('Invalid persisted Personal Home batch');
            if (input.now !== undefined && (!Number.isFinite(input.now) || input.now < 0))
                throw Error('Invalid restore batch clock');
            if (input.subjectId !== undefined && (typeof input.subjectId !== 'string' || !input.subjectId.trim() || input.subjectId.length > 256))
                throw Error('Invalid restore batch subject');
            const seen = new Set();
            const output = [];
            // Validate the entire batch before any restore may publish into the service.
            for (const request of input.requests) {
                if (!request || typeof request.projectionCode !== 'string' || typeof request.subjectId !== 'string' || typeof request.permissionGranted !== 'boolean')
                    throw Error('Invalid persisted card request');
                if (input.subjectId !== undefined && request.subjectId !== input.subjectId)
                    throw Error('Cross-subject persisted batch');
                const key = JSON.stringify([request.projectionCode, request.subjectId, request.permissionGranted]);
                if (seen.has(key))
                    throw Error('Duplicate persisted card request');
                seen.add(key);
                if (request.now !== undefined && (!Number.isFinite(request.now) || request.now < 0))
                    throw Error('Invalid card restore clock');
                if (request.now !== undefined && input.now !== undefined && request.now !== input.now)
                    throw Error('Conflicting restore clock');
            }
            // Exclusive card reservations above cover the entire load/preflight/publish
            // lifecycle, including writes submitted after restoration starts.
            // Read and authenticate every persisted row before mutating Personal Home.
            // A corrupted later row must not leave earlier cards partially restored.
            const prepared = [];
            for (const request of input.requests) {
                if (request.permissionGranted !== true) {
                    prepared.push({ request, row: null, state: 'DENIED' });
                    continue;
                }
                const d = this.descriptor(request.projectionCode);
                const row = await this.persistence.load({ projectionCode: request.projectionCode, subjectId: request.subjectId, permissionGranted: true });
                if (row && (row.ownerApp !== d.ownerApp || row.redactedFields?.length || row.projectionCode !== request.projectionCode || row.subjectId !== request.subjectId || row.verified !== true))
                    throw Error('Untrusted owner restore');
                prepared.push({ request, row, state: row ? 'READY' : 'UNAVAILABLE' });
            }
            // Validate every authenticated durable snapshot against its real descriptor
            // in an isolated projection service before mutating the active service.
            const Validator = KXPersonal?.PersonalProjectionService;
            if (typeof Validator !== 'function')
                throw Error('Personal projection validator unavailable');
            const staging = new Validator();
            for (const item of prepared) {
                if (item.state !== 'READY')
                    continue;
                staging.registerDescriptor(this.descriptor(item.request.projectionCode));
                const validated = staging.publish({ ...item.row, permissionGranted: true });
                if (validated.sourceRevision !== item.row.sourceRevision || validated.generatedAt !== item.row.generatedAt)
                    throw Error('Untrusted persisted projection content');
            }
            // Preflight current in-memory revisions for every card before any publication.
            // A later stale row must never cause a partially restored earlier card.
            for (const item of prepared) {
                if (item.state !== 'READY')
                    continue;
                const current = this.service.read({ projectionCode: item.request.projectionCode, subjectId: item.request.subjectId, permissionGranted: true, ownerAvailability: 'DEGRADED', now: input.now ?? item.request.now });
                if (current.lastVerifiedAt !== undefined) {
                    if (current.lastVerifiedAt > item.row.generatedAt)
                        throw Error('Restored owner revision superseded');
                    if (current.lastVerifiedAt === item.row.generatedAt && current.sourceRevision !== undefined && current.sourceRevision !== item.row.sourceRevision)
                        throw Error('Conflicting restored owner revision');
                    if (current.lastVerifiedAt === item.row.generatedAt && current.sourceRevision === item.row.sourceRevision && current.snapshot !== null && JSON.stringify(current.snapshot) !== JSON.stringify(item.row.payload))
                        throw Error('Conflicting restored owner payload');
                }
            }
            for (const item of prepared) {
                if (item.state !== 'READY') {
                    output.push({ displayState: item.state, snapshot: null });
                    continue;
                }
                const published = this.service.publish({ ...item.row, permissionGranted: true });
                if (published.sourceRevision !== item.row.sourceRevision || published.generatedAt !== item.row.generatedAt)
                    throw Error('Restored owner revision superseded');
                output.push(this.service.read({ projectionCode: item.request.projectionCode, subjectId: item.request.subjectId, permissionGranted: true, ownerAvailability: 'DEGRADED', now: input.now ?? item.request.now }));
            }
            return output;
        }
        async restore(input) {
            if (input?.permissionGranted !== true)
                return { displayState: 'DENIED', snapshot: null };
            // Single-card restore must use the exact same durable row authentication,
            // descriptor content validation and degraded-only publication as batch restore.
            const results = await this.restoreBatch({ requests: [{
                        projectionCode: input.projectionCode, subjectId: input.subjectId,
                        permissionGranted: true, now: input.now
                    }] });
            return results[0];
        }
    }
    KXPersonalBridge.PersonalProjectionBridge = PersonalProjectionBridge;
})(KXPersonalBridge || (KXPersonalBridge = {}));
