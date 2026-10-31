var KXPersonal;
(function (KXPersonal) {
    const jsonSafe = (value, seen = new WeakSet(), depth = 0) => {
        if (depth > 40)
            return false;
        if (value === null || typeof value === 'string' || typeof value === 'boolean')
            return true;
        if (typeof value === 'number')
            return Number.isFinite(value);
        if (typeof value !== 'object' || seen.has(value))
            return false;
        if (Object.prototype.toString.call(value) !== '[object Object]' && !Array.isArray(value))
            return false;
        seen.add(value);
        const result = Array.isArray(value) ? value.every(v => jsonSafe(v, seen, depth + 1)) : Object.keys(value).every(k => !['__proto__', 'constructor', 'prototype'].includes(k) && jsonSafe(value[k], seen, depth + 1));
        seen.delete(value);
        return result;
    };
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const bytes = (x) => new TextEncoder().encode(JSON.stringify(x)).length;
    const msHour = 3600000, msDay = 86400000;
    class PersonalProjectionService {
        policy;
        descriptors = new Map();
        snapshots = new Map();
        constructor(policy = {}) {
            this.policy = policy;
            const c = KX_PERSONAL_PROJECTION_CONTRACT || {};
            this.policy = { ...(c.defaultPolicy || {}), ...(policy || {}) };
            for (const d of c.initialDescriptors || [])
                this.registerDescriptor(d);
        }
        registerDescriptor(d) {
            if (typeof d?.projectionCode !== 'string' || !d.projectionCode.trim() || d.projectionCode.length > 256 || typeof d.ownerApp !== 'string' || !/^APP\.KX\.[A-Z][A-Z0-9_]*$/.test(d.ownerApp))
                throw new Error('Invalid projection descriptor');
            if (!Array.isArray(d.allowedFields) || !d.allowedFields.length || d.allowedFields.some((x) => typeof x !== 'string' || !x || x.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(x)))
                throw new Error(`Projection ${d.projectionCode} requires allowedFields`);
            if (new Set(d.allowedFields).size !== d.allowedFields.length)
                throw new Error('Duplicate allowedFields');
            if (!Array.isArray(d.sensitiveFields || []) || new Set(d.sensitiveFields || []).size !== (d.sensitiveFields || []).length)
                throw new Error('Invalid sensitiveFields');
            if ((d.sensitiveFields || []).some((x) => !d.allowedFields.includes(x)))
                throw new Error(`Sensitive field outside allowedFields ${d.projectionCode}`);
            const existing = this.descriptors.get(d.projectionCode);
            if (existing && JSON.stringify(existing) !== JSON.stringify(d))
                throw new Error('Conflicting descriptor registration');
            this.descriptors.set(d.projectionCode, clone(d));
            return clone(d);
        }
        descriptor(code) { const d = this.descriptors.get(code); return d ? clone(d) : null; }
        listDescriptors() { return [...this.descriptors.values()].map(clone); }
        publish(input) {
            const d = this.descriptors.get(input?.projectionCode);
            if (!d)
                throw new Error(`Unknown projection ${input?.projectionCode}`);
            if (input.ownerApp !== d.ownerApp)
                throw new Error(`Owner mismatch ${input.ownerApp} != ${d.ownerApp}`);
            if (input.permissionGranted !== true)
                throw new Error('Projection publish requires permissionGranted=true');
            if (typeof input.subjectId !== 'string' || !input.subjectId.trim() || input.subjectId.length > 256 || typeof input.sourceRevision !== 'string' || !input.sourceRevision.trim() || input.sourceRevision.length > 256 || typeof input.generatedAt !== 'number' || !Number.isFinite(input.generatedAt) || input.generatedAt < 0)
                throw new Error('Projection identity/sourceRevision/generatedAt required');
            const src = input.payload === undefined ? {} : input.payload;
            if (!src || typeof src !== 'object' || Array.isArray(src) || Object.prototype.toString.call(src) !== '[object Object]')
                throw new Error('Projection payload must be a plain object');
            const unknown = Object.keys(src).filter(k => !d.allowedFields.includes(k) || ['__proto__', 'prototype', 'constructor'].includes(k));
            if (unknown.length)
                throw new Error(`Unknown projection fields: ${unknown.join(',')}`);
            const payload = {}, redactedFields = [];
            const sensitive = new Set(d.sensitiveFields || []);
            for (const [k, v] of Object.entries(src)) {
                if (sensitive.has(k) && this.policy.allowSensitiveOfflineSnapshot !== true) {
                    redactedFields.push(k);
                    continue;
                }
                if (JSON.stringify(v) === undefined || !jsonSafe(v))
                    throw new Error('Projection payload contains non-JSON value');
                payload[k] = clone(v);
            }
            if (!Number.isFinite(Number(this.policy.maxPayloadBytes ?? 16384)) || Number(this.policy.maxPayloadBytes ?? 16384) < 1 || Number(this.policy.maxPayloadBytes ?? 16384) > 1048576)
                throw new Error('Invalid payload size policy');
            if (bytes(payload) > Number(this.policy.maxPayloadBytes ?? 16384))
                throw new Error('Projection payload exceeds maxPayloadBytes');
            const key = JSON.stringify([input.projectionCode, input.subjectId]);
            const row = { projectionCode: input.projectionCode, ownerApp: d.ownerApp, subjectId: String(input.subjectId), generatedAt: Number(input.generatedAt), sourceRevision: String(input.sourceRevision), payload, redactedFields, deepLink: d.deepLink || d.ownerApp, verified: true };
            // Owner delivery may be delayed or replayed. Never downgrade a verified
            // snapshot to an older owner revision on out-of-order arrival.
            const previous = this.snapshots.get(key);
            if (previous && row.generatedAt < previous.generatedAt)
                return clone(previous);
            if (previous && row.generatedAt === previous.generatedAt && row.sourceRevision !== previous.sourceRevision)
                throw new Error('Conflicting owner revisions at the same timestamp');
            if (previous && row.generatedAt === previous.generatedAt && row.sourceRevision === previous.sourceRevision) {
                if (JSON.stringify(row.payload) !== JSON.stringify(previous.payload) || JSON.stringify(row.redactedFields) !== JSON.stringify(previous.redactedFields))
                    throw new Error('Conflicting owner payload at the same revision');
                return clone(previous);
            }
            this.snapshots.set(key, row);
            return clone(row);
        }
        read(input) {
            const d = this.descriptors.get(input?.projectionCode);
            if (!d)
                throw new Error(`Unknown projection ${input?.projectionCode}`);
            if (typeof input.subjectId !== 'string' || !input.subjectId.trim() || input.subjectId.length > 256)
                throw new Error('Projection read requires valid subjectId');
            if (input.ownerAvailability !== undefined && !['AVAILABLE', 'DEGRADED', 'UNAVAILABLE'].includes(input.ownerAvailability))
                throw new Error('Invalid owner availability');
            if (input.permissionGranted !== true)
                return { projectionCode: input.projectionCode, subjectId: String(input.subjectId || ''), availability: String(input.ownerAvailability || 'UNAVAILABLE'), freshness: 'UNKNOWN', displayState: 'DENIED', snapshot: null };
            const key = JSON.stringify([input.projectionCode, input.subjectId]), row = this.snapshots.get(key) || null, now = input.now === undefined ? Date.now() : input.now, availability = String(input.ownerAvailability || 'AVAILABLE');
            if (typeof now !== 'number' || !Number.isFinite(now) || now < 0)
                throw new Error('Invalid projection read time');
            if (!['AVAILABLE', 'DEGRADED', 'UNAVAILABLE'].includes(availability))
                throw new Error(`Invalid owner availability ${availability}`);
            if (!row)
                return { projectionCode: input.projectionCode, subjectId: String(input.subjectId || ''), availability, freshness: 'UNKNOWN', displayState: 'UNAVAILABLE', snapshot: null, deepLink: d.deepLink || d.ownerApp };
            // A future-dated owner snapshot is not evidence of fresh live data.
            if (!Number.isFinite(now) || row.generatedAt > now + 60000)
                return { projectionCode: row.projectionCode, subjectId: row.subjectId, availability, freshness: 'UNKNOWN', displayState: 'UNAVAILABLE', snapshot: null, lastVerifiedAt: row.generatedAt, deepLink: row.deepLink };
            const freshH = Number(this.policy.freshHours ?? 6), staleH = Number(this.policy.staleHours ?? 24), lastDays = Number(this.policy.maxLastKnownDays ?? 30);
            if (![freshH, staleH, lastDays].every(x => Number.isFinite(x) && x >= 0) || freshH > staleH || staleH > lastDays * 24)
                throw new Error('Invalid freshness policy');
            const age = Math.max(0, now - row.generatedAt), fresh = freshH * msHour, stale = staleH * msHour, max = lastDays * msDay;
            const freshness = age <= fresh ? 'FRESH' : age <= stale ? 'AGING' : age <= max ? 'STALE' : 'EXPIRED';
            if (freshness === 'EXPIRED')
                return { projectionCode: row.projectionCode, subjectId: row.subjectId, availability, freshness, displayState: 'UNAVAILABLE', snapshot: null, lastVerifiedAt: row.generatedAt, deepLink: row.deepLink };
            let displayState = 'LIVE';
            if (availability !== 'AVAILABLE')
                displayState = freshness === 'STALE' ? 'STALE_LAST_KNOWN' : 'LAST_KNOWN_GOOD';
            else if (freshness === 'STALE')
                displayState = 'STALE_LAST_KNOWN';
            return { projectionCode: row.projectionCode, subjectId: row.subjectId, availability, freshness, displayState, snapshot: clone(row.payload), redactedFields: [...row.redactedFields], lastVerifiedAt: row.generatedAt, sourceRevision: row.sourceRevision, deepLink: row.deepLink };
        }
        // Bounded owner-backed Personal Home card query. Each entry is evaluated with
        // the same permission and availability gates as an individual read; no stub data.
        readBatch(input) {
            if (!input || Object.prototype.toString.call(input) !== '[object Object]' || !Array.isArray(input.requests) || input.requests.length > 48 || input.requests.length === 0)
                throw new Error('Invalid Personal Home batch');
            const results = [];
            const requestKeys = new Set();
            const batchNow = input.now === undefined ? Date.now() : input.now;
            const batchSubject = input.subjectId;
            if (input.now !== undefined && (typeof input.now !== 'number' || !Number.isFinite(input.now) || input.now < 0))
                throw new Error('Invalid batch clock');
            if (batchSubject !== undefined && (typeof batchSubject !== 'string' || !batchSubject.trim() || batchSubject.length > 256))
                throw new Error('Invalid batch subject');
            for (const request of input.requests) {
                if (!request || Object.prototype.toString.call(request) !== '[object Object]')
                    throw new Error('Invalid Personal Home batch request');
                if (!Object.prototype.hasOwnProperty.call(request, 'permissionGranted') || typeof request.permissionGranted !== 'boolean')
                    throw new Error('Invalid batch permission decision');
                if (batchSubject !== undefined && request.subjectId !== batchSubject)
                    throw new Error('Cross-subject Personal Home batch');
                if (typeof request.projectionCode !== 'string' || typeof request.subjectId !== 'string')
                    throw new Error('Invalid batch identity');
                const requestKey = JSON.stringify([request.projectionCode, request.subjectId, request.permissionGranted]);
                if (requestKeys.has(requestKey))
                    throw new Error('Duplicate Personal Home batch request');
                requestKeys.add(requestKey);
                if (input.now !== undefined && request.now !== undefined && request.now !== batchNow)
                    throw new Error('Per-card clock override forbidden');
                results.push(this.read({ ...request, now: input.now === undefined ? (request.now === undefined ? batchNow : request.now) : batchNow }));
            }
            return results;
        }
        stats() { return { descriptors: this.descriptors.size, snapshots: this.snapshots.size, allowSensitiveOfflineSnapshot: this.policy.allowSensitiveOfflineSnapshot === true }; }
    }
    KXPersonal.PersonalProjectionService = PersonalProjectionService;
})(KXPersonal || (KXPersonal = {}));
