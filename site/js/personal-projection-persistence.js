// DELTA093 Stage47-56: bounded, permission-gated projection persistence.
// This adapter does not claim domain owner verification or live data access.
var KXPersonalPersistence;
(function (KXPersonalPersistence) {
    const enc = (x) => new TextEncoder().encode(JSON.stringify(x)).length;
    const validId = (x) => typeof x === 'string' && x.trim().length > 0 && x.length <= 256;
    const safe = (x, seen = new WeakSet(), depth = 0) => {
        if (depth > 40)
            return false;
        if (x === null || typeof x === 'string' || typeof x === 'boolean')
            return true;
        if (typeof x === 'number')
            return Number.isFinite(x);
        if (typeof x !== 'object' || seen.has(x))
            return false;
        if (Array.isArray(x)) {
            seen.add(x);
            const ok = x.every(v => safe(v, seen, depth + 1));
            seen.delete(x);
            return ok;
        }
        if (Object.prototype.toString.call(x) !== '[object Object]')
            return false;
        const proto = Object.getPrototypeOf(x);
        if (proto !== null && Object.getPrototypeOf(proto) !== null)
            return false;
        seen.add(x);
        const ok = Object.keys(x).every(k => !['__proto__', 'constructor', 'prototype'].includes(k) && safe(x[k], seen, depth + 1));
        seen.delete(x);
        return ok;
    };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    class PersonalProjectionRepositoryAdapter {
        repo;
        maxBytes;
        constructor(repo, maxBytes = 16384) {
            this.repo = repo;
            this.maxBytes = maxBytes;
            if (!repo || typeof repo.atomic !== 'function' || typeof repo.get !== 'function' || typeof repo.open !== 'function')
                throw new Error('CoreRepository required');
            if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576)
                throw new Error('Invalid payload limit');
        }
        key(projectionCode, subjectId) { return 'PERSONAL.PROJECTION:' + JSON.stringify([projectionCode, subjectId]); }
        check(input) {
            if (!input || !validId(input.projectionCode) || !validId(input.subjectId))
                throw new Error('Invalid projection identity');
            if (input.permissionGranted !== true)
                throw new Error('Personal projection permission required');
            if (input.sensitive === true || input.redactedFields?.length || input.allowSensitiveOfflineSnapshot === true)
                throw new Error('Sensitive snapshot persistence disabled');
        }
        async save(input) {
            this.check(input);
            const row = input.snapshot;
            if (!row || typeof row !== 'object' || Array.isArray(row) || !validId(row.projectionCode) || !validId(row.subjectId) || row.projectionCode !== input.projectionCode || row.subjectId !== input.subjectId || row.verified !== true || typeof row.generatedAt !== 'number' || !Number.isFinite(row.generatedAt) || row.generatedAt < 0 || !validId(row.sourceRevision) || !row.payload || Object.prototype.toString.call(row.payload) !== '[object Object]' || Array.isArray(row.payload))
                throw new Error('Invalid verified owner snapshot');
            if (row.redactedFields?.length)
                throw new Error('Sensitive projection cannot persist');
            if (!safe(row) || !safe(row.payload))
                throw new Error('Projection contains non-JSON or unsafe data');
            if (row.generatedAt > Date.now() + 60000)
                throw new Error('Future owner snapshot cannot persist');
            const allowed = new Set(['projectionCode', 'subjectId', 'ownerApp', 'generatedAt', 'sourceRevision', 'payload', 'redactedFields', 'deepLink', 'verified']);
            if (Object.keys(row).some(k => !allowed.has(k)) || !validId(row.ownerApp) || !/^APP\.KX\.[A-Z][A-Z0-9_]*$/.test(row.ownerApp))
                throw new Error('Untrusted snapshot fields');
            let data;
            try {
                data = clone(row);
            }
            catch {
                throw new Error('Non-serializable snapshot');
            }
            if (enc(data) > this.maxBytes || enc(data) > 1048576)
                throw new Error('Snapshot exceeds limit');
            const id = this.key(input.projectionCode, input.subjectId);
            await this.repo.open();
            const prev = await this.repo.get('recoverySnapshots', id);
            if (prev) {
                if (prev.subjectId !== input.subjectId || prev.projectionCode !== input.projectionCode)
                    throw new Error('Stored projection identity mismatch');
                if (prev.kind !== 'PERSONAL_PROJECTION' || !safe(prev) || !prev.snapshot || !safe(prev.snapshot))
                    throw new Error('Untrusted previously persisted projection');
                if (prev.generatedAt > data.generatedAt)
                    throw new Error('Older owner snapshot rejected');
                if (prev.generatedAt === data.generatedAt) {
                    if (prev.sourceRevision !== data.sourceRevision || JSON.stringify(prev.snapshot) !== JSON.stringify(data))
                        throw new Error('Conflicting owner snapshot');
                    return { id, unchanged: true };
                }
            }
            const saved = { id, kind: 'PERSONAL_PROJECTION', projectionCode: input.projectionCode, subjectId: input.subjectId, generatedAt: data.generatedAt, sourceRevision: data.sourceRevision, snapshot: data };
            const audit = { id: 'AUDIT.PERSONAL.' + encodeURIComponent(id) + '.' + data.generatedAt, ownerApp: 'APP.KX.NEXUS', action: 'PERSONAL_PROJECTION_SAVE', subjectId: input.subjectId, projectionCode: input.projectionCode, generatedAt: data.generatedAt };
            await this.repo.atomic([{ store: 'recoverySnapshots', value: saved }, { store: 'audit', value: audit }]);
            const check = await this.repo.get('recoverySnapshots', id);
            if (JSON.stringify(check) !== JSON.stringify(saved))
                throw new Error('Projection durable readback mismatch');
            return { id, unchanged: false };
        }
        async load(input) {
            this.check(input);
            await this.repo.open();
            const row = await this.repo.get('recoverySnapshots', this.key(input.projectionCode, input.subjectId));
            if (!row)
                return null;
            if (!safe(row) || !safe(row.snapshot) || row.kind !== 'PERSONAL_PROJECTION' || row.projectionCode !== input.projectionCode || row.subjectId !== input.subjectId || row.snapshot?.verified !== true || row.snapshot?.subjectId !== input.subjectId || row.snapshot?.projectionCode !== input.projectionCode || row.snapshot?.redactedFields?.length)
                throw new Error('Untrusted persisted projection');
            if (!validId(row.snapshot.ownerApp) || !/^APP\.KX\.[A-Z][A-Z0-9_]*$/.test(row.snapshot.ownerApp) || Object.keys(row).some(k => !['id', 'kind', 'projectionCode', 'subjectId', 'generatedAt', 'sourceRevision', 'snapshot'].includes(k)) || row.id !== this.key(input.projectionCode, input.subjectId))
                throw new Error('Untrusted persisted owner envelope');
            if (!validId(row.snapshot.sourceRevision) || row.snapshot.sourceRevision !== row.sourceRevision || row.snapshot.generatedAt !== row.generatedAt || !Number.isFinite(row.generatedAt) || row.generatedAt < 0 || !safe(row.snapshot.payload) || row.snapshot.generatedAt > Date.now() + 60000)
                throw new Error('Corrupt persisted owner snapshot');
            return clone(row.snapshot);
        }
    }
    KXPersonalPersistence.PersonalProjectionRepositoryAdapter = PersonalProjectionRepositoryAdapter;
})(KXPersonalPersistence || (KXPersonalPersistence = {}));
