// N2.1n (R41): human record codes for the whole NEXUS, compatible with LASER P598 (KXP/KXT/KXI-000123).
//  - format PREFIX-NNNNNN (6 digits, compatible with files KXP-000001_1.ext, labels, QR text);
//  - prefix registry is DATA (defaults below, more can be registered); one prefix per rule, validated;
//  - assignment = Core entity CORE.RECORD_CODE (synced with KX.SYNC_PACKAGE), id derived from the TARGET, so two
//    devices can never write the same row for different records; the per-prefix counter is device-local (meta) and
//    always continues after the highest code known (incl. codes received by sync);
//  - offline collision (two devices allocated the same number) is detected by reconcile(): the younger assignment
//    gets a new code and keeps the old one as alias (never silently dropped, audited);
//  - resolve(code) finds primary codes first, then aliases (marked "dříve"); QR/links keep using ids, so a printed
//    label never points to the wrong record even when a code is reassigned.
var KXRecordCodes;
(function (NS) {
    const TYPE = 'CORE.RECORD_CODE', OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_RECORD_CODES/1', COUNTER_KEY = 'CORE.RECORD_CODES.COUNTER.';
    /* N2.3i: a prefix may contain digits after the first letter (e.g. P3D, K3D) */ const CODE_RE = /^([A-Z][A-Z0-9]{1,4})-(\d{6})$/;
    const PREFIX_RE = /^[A-Z][A-Z0-9]{1,4}$/;
    const DEFAULT_RULES = [
        { type: 'APP.LASER.PROJECT', prefix: 'KXP' }, { type: 'APP.LASER.TEST', prefix: 'KXT' }, { type: 'APP.LASER.TEST_RUN', prefix: 'KXT' }, { type: 'APP.LASER.IMPORT', prefix: 'KXI' },
        { type: 'APP.LASER.MACHINE', prefix: 'KXL' }, { type: 'APP.LASER.PROFILE', prefix: 'KXL' },
        { type: 'CORE.WEB.LINK', prefix: 'KXW' },
        { kind: 'TASK', prefix: 'KXU' }, { kind: 'CALENDAR_EVENT', prefix: 'KXE' }, { kind: 'ALARM', prefix: 'KXA' }, { kind: 'FILE', prefix: 'KXF' }, { kind: 'DOCUMENT', prefix: 'KXD' },
        { ownerApp: 'APP.KX.TRACKWORK', prefix: 'KXK' }, { ownerApp: 'APP.KX.PRINT3D', prefix: 'K3D' }, { ownerApp: 'APP.KX.HOBBY', prefix: 'KHB' },
        { kind: 'ENTITY', prefix: 'KXR' }
    ];
    const STORE = { ENTITY: 'entities', TASK: 'tasks', CALENDAR_EVENT: 'calendarEvents', ALARM: 'alarms', FILE: 'files', DOCUMENT: 'documents' };
    const fmt = (prefix, n) => `${prefix}-${String(n).padStart(6, '0')}`;
    const normalize = (q) => { if (typeof q !== 'string')
        return null; const u = q.trim().toUpperCase(); /* a prefix with a digit needs a separator (P3D-123), a letters-only prefix may be glued (KXP123) – no ambiguity */ /* a prefix with a digit needs a separator (P3D-123), a letters-only prefix may be glued (KXP123) – no ambiguity */ const m0 = u.match(/^([A-Z][A-Z0-9]{1,4})[-\s](\d{1,6})$/) || u.match(/^([A-Z]{2,5})(\d{1,6})$/); const m = m0; return m ? fmt(m[1], Number(m[2])) : null; };
    class RecordCodesService {
        core;
        opts;
        rules = DEFAULT_RULES.map(r => ({ ...r }));
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        device() { return typeof this.opts.deviceId === 'function' ? this.opts.deviceId() : this.opts.deviceId || null; }
        registerPrefix(rule) {
            const r = { type: rule?.type, ownerApp: rule?.ownerApp, kind: rule?.kind, prefix: rule?.prefix };
            if (!PREFIX_RE.test(String(r.prefix)))
                throw new Error('RECORD_CODE_PREFIX_INVALID');
            if (!r.type && !r.ownerApp && !r.kind)
                throw new Error('RECORD_CODE_RULE_EMPTY');
            if (this.rules.some(x => x.type === r.type && x.ownerApp === r.ownerApp && x.kind === r.kind))
                throw new Error('RECORD_CODE_RULE_EXISTS');
            this.rules.unshift(r);
            return r;
        }
        prefixRules() { return this.rules.map(r => ({ ...r })); }
        prefixFor(kind, row) { for (const r of this.rules) {
            if (r.kind && r.kind !== kind)
                continue;
            if (r.type && r.type !== row?.type)
                continue;
            if (r.ownerApp && r.ownerApp !== row?.ownerApp)
                continue;
            if (!r.kind && !r.type && !r.ownerApp)
                continue;
            return r.prefix;
        } return 'KXR'; }
        codeId(kind, id) { return `CODE.${kind}.${id}`; }
        async target(t, actorId) {
            if (!t || !STORE[t.kind] || typeof t.id !== 'string' || !t.id)
                throw new Error('RECORD_CODE_TARGET_INVALID');
            const row = await this.core.repository.get(STORE[t.kind], t.id);
            if (!row)
                throw new Error('RECORD_CODE_TARGET_NOT_FOUND');
            if (t.kind === 'ENTITY' && (String(row.type).startsWith('CORE.IDENTITY.') || row.type === TYPE || row.type === 'CORE.HANDOFF'))
                throw new Error('RECORD_CODE_TARGET_NOT_ALLOWED');
            if (actorId !== 'SYSTEM' && await this.core.access.can({ kind: t.kind, id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds || [] }, actorId, 'READ') !== true)
                throw new Error('Scope denied: READ required');
            return row;
        }
        async all() { return (await this.core.entities.list()).filter((r) => r.type === TYPE && !r.archivedAt); }
        async codeOf(t) { const r = await this.core.entities.get(this.codeId(t?.kind, t?.id)); return r && r.type === TYPE && !r.archivedAt ? r.data : null; }
        async highest(prefix) { let n = 0; for (const r of await this.all())
            for (const c of [r.data.code, ...(r.data.aliases || []).map((a) => a.code)]) {
                const m = String(c || '').match(CODE_RE);
                if (m && m[1] === prefix)
                    n = Math.max(n, Number(m[2]));
            } return n; }
        // device-local counter (meta, not synced) – CAS on its value; always > every code known locally (incl. synced ones)
        async allocate(prefix) {
            const repo = this.core.repository;
            for (let i = 0; i < 8; i++) {
                const row = await repo.get('meta', COUNTER_KEY + prefix);
                const cur = row && Number.isSafeInteger(row.value) ? row.value : null;
                const next = Math.max(cur || 0, await this.highest(prefix)) + 1;
                if (next > 999999)
                    throw new Error('RECORD_CODE_PREFIX_EXHAUSTED');
                try {
                    await repo.atomic([{ store: 'meta', value: { key: COUNTER_KEY + prefix, value: next, updatedAt: new Date(this.now()).toISOString() } }], [], [{ store: 'meta', key: COUNTER_KEY + prefix, field: 'value', value: cur }]);
                    return fmt(prefix, next);
                }
                catch (e) {
                    if (!String(e?.message || e).includes('REPOSITORY_CAS_CONFLICT'))
                        throw e;
                }
            }
            throw new Error('RECORD_CODE_ALLOCATION_BUSY');
        }
        async spacesFor(row) { return Array.isArray(row.spaceIds) && row.spaceIds.length ? [...row.spaceIds] : []; }
        async ensure(input, ctx) {
            const t = { kind: input?.target?.kind, id: input?.target?.id };
            const row = await this.target(t, ctx.actorId);
            const existing = await this.core.entities.get(this.codeId(t.kind, t.id));
            if (existing && !existing.archivedAt)
                return existing.data;
            const prefix = this.prefixFor(t.kind, row);
            for (let i = 0; i < 5; i++) {
                const code = await this.allocate(prefix);
                if ((await this.all()).some((r) => r.data.code === code))
                    continue; // taken meanwhile (sync) -> next number
                try {
                    const saved = await this.core.entities.save({ id: this.codeId(t.kind, t.id), type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_RECORD_CODE/1', spaceIds: await this.spacesFor(row), expectedRevision: 0,
                        data: { code, prefix, target: t, aliases: [], assignedAt: new Date(this.now()).toISOString(), deviceId: this.device() || ctx?.deviceId || null } }, ctx);
                    return saved.data;
                }
                catch (e) {
                    const m = String(e?.message || e);
                    if (m.includes('Revision conflict')) {
                        const now = await this.core.entities.get(this.codeId(t.kind, t.id));
                        if (now)
                            return now.data;
                    }
                    throw e;
                }
            }
            throw new Error('RECORD_CODE_ALLOCATION_BUSY');
        }
        // keep an existing code (e.g. KXP-000123 from LASER P598) if it is free, otherwise allocate a new one and keep the old one as alias
        async adopt(input, ctx) {
            const t = { kind: input?.target?.kind, id: input?.target?.id };
            const row = await this.target(t, ctx.actorId);
            const wanted = normalize(input?.code);
            if (!wanted)
                throw new Error('RECORD_CODE_INVALID');
            if (await this.core.entities.get(this.codeId(t.kind, t.id)))
                throw new Error('RECORD_CODE_ALREADY_ASSIGNED');
            const taken = (await this.all()).some((r) => r.data.code === wanted);
            const prefix = wanted.split('-')[0];
            if (!taken) {
                const saved = await this.core.entities.save({ id: this.codeId(t.kind, t.id), type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_RECORD_CODE/1', spaceIds: await this.spacesFor(row), expectedRevision: 0,
                    data: { code: wanted, prefix, target: t, aliases: [], assignedAt: new Date(this.now()).toISOString(), deviceId: this.device() || ctx?.deviceId || null, adopted: true } }, ctx);
                return { ...saved.data, adoptedAsIs: true };
            }
            const code = await this.allocate(prefix);
            const saved = await this.core.entities.save({ id: this.codeId(t.kind, t.id), type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_RECORD_CODE/1', spaceIds: await this.spacesFor(row), expectedRevision: 0,
                data: { code, prefix, target: t, aliases: [{ code: wanted, reason: 'ADOPT_TAKEN', at: new Date(this.now()).toISOString() }], assignedAt: new Date(this.now()).toISOString(), deviceId: this.device() || ctx?.deviceId || null, adopted: true } }, ctx);
            return { ...saved.data, adoptedAsIs: false };
        }
        // offline collisions after sync: the YOUNGER assignment (assignedAt, then id) gets a new code, old one kept as alias
        async reconcile(ctx) {
            const by = new Map();
            for (const r of await this.all()) {
                const k = r.data.code;
                by.set(k, [...(by.get(k) || []), r]);
            }
            const changed = [];
            for (const [code, rows] of by) {
                if (rows.length < 2)
                    continue;
                rows.sort((a, b) => String(a.data.assignedAt).localeCompare(String(b.data.assignedAt)) || String(a.id).localeCompare(String(b.id)));
                for (const r of rows.slice(1)) {
                    const fresh = await this.allocate(r.data.prefix);
                    const saved = await this.core.entities.save({ id: r.id, type: TYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision,
                        data: { ...r.data, code: fresh, aliases: [...(r.data.aliases || []), { code, reason: 'SYNC_COLLISION', at: new Date(this.now()).toISOString() }] } }, ctx);
                    changed.push({ target: r.data.target, from: code, to: saved.data.code });
                }
            }
            return { contract: CONTRACT, reassigned: changed.length, changed };
        }
        // N2.1p: collision decisions by the user — keep the code on ONE record (the others get a new code, the released code
        // is kept in their history, not as alias) or keep BOTH (the others get a new code and keep the old one as alias).
        // Each candidate shows who created / last changed the record and when, plus the device that assigned the code.
        async whoWhen(row) {
            const name = async (id) => { if (!id)
                return null; if (id === 'SYSTEM')
                return 'Systém'; const u = await this.core.memberships.getUser(id); return u?.displayName || id; };
            return { createdBy: row?.createdBy || null, createdByName: await name(row?.createdBy), createdAt: row?.createdAt || null, updatedBy: row?.updatedBy || null, updatedByName: await name(row?.updatedBy), updatedAt: row?.updatedAt || null };
        }
        async groups() {
            const rows = await this.all();
            const by = new Map();
            const add = (c, r) => { if (!by.has(c))
                by.set(c, new Set()); by.get(c).add(r); };
            for (const r of rows)
                add(r.data.code, r);
            for (const r of rows)
                for (const a of r.data.aliases || [])
                    if (a.reason === 'SYNC_COLLISION')
                        add(a.code, r);
            const out = [];
            for (const [code, set] of by) {
                const members = [...set];
                if (members.length < 2)
                    continue;
                const primaries = members.filter((r) => r.data.code === code);
                const decided = members.some((r) => r.data.collisionDecision?.code === code);
                out.push({ code, members, state: primaries.length > 1 ? 'OPEN' : decided ? 'DECIDED' : 'AUTO_DECIDED' });
            }
            return out.sort((a, b) => a.code.localeCompare(b.code));
        }
        async collisions(actorId, opts = {}) {
            const out = [];
            for (const g of await this.groups()) {
                if (g.state === 'DECIDED' && !opts.includeDecided)
                    continue;
                const cands = [];
                let hidden = 0;
                for (const r of g.members) {
                    let row;
                    try {
                        row = await this.target(r.data.target, actorId);
                    }
                    catch {
                        hidden++;
                        continue;
                    }
                    cands.push({ target: r.data.target, codeRowId: r.id, currentCode: r.data.code, holdsCode: r.data.code === g.code, ownerApp: row.ownerApp, type: row.type || STORE[r.data.target.kind],
                        title: String(row.data?.name || row.data?.title || row.title || row.name || row.id), assignedAt: r.data.assignedAt, deviceId: r.data.deviceId || null, ...await this.whoWhen(row) });
                }
                if (cands.length)
                    out.push({ code: g.code, state: g.state, candidates: cands.sort((a, b) => String(a.assignedAt).localeCompare(String(b.assignedAt))), hidden });
            }
            return out;
        }
        async resolveCollision(input, ctx) {
            const code = normalize(input?.code);
            if (!code)
                throw new Error('RECORD_CODE_INVALID');
            const mode = input?.mode;
            if (mode !== 'ONE' && mode !== 'BOTH')
                throw new Error('RECORD_CODE_COLLISION_MODE_INVALID');
            const g = (await this.groups()).find((x) => x.code === code);
            if (!g)
                throw new Error('RECORD_CODE_NO_COLLISION');
            for (const r of g.members)
                await this.target(r.data.target, ctx.actorId); // READ on every member, otherwise refused
            const keep = input?.keepTarget;
            let winner = keep ? g.members.find((r) => r.data.target.kind === keep.kind && r.data.target.id === keep.id) : null;
            if (keep && !winner)
                throw new Error('RECORD_CODE_COLLISION_TARGET_UNKNOWN');
            if (!winner) {
                if (mode === 'ONE')
                    throw new Error('RECORD_CODE_COLLISION_KEEP_REQUIRED');
                winner = [...g.members].sort((a, b) => String(a.data.assignedAt).localeCompare(String(b.data.assignedAt)) || String(a.id).localeCompare(String(b.id)))[0];
            }
            const at = new Date(this.now()).toISOString(), decision = { code, mode, winner: winner.data.target, by: ctx.actorId, at };
            const changed = [];
            for (const r of g.members) {
                const isW = r === winner;
                let data = { ...r.data, aliases: [...(r.data.aliases || [])], history: [...(r.data.history || [])], collisionDecision: decision };
                if (isW) {
                    if (data.code !== code) {
                        data.history.push({ code: data.code, reason: 'RELEASED_BY_DECISION', at });
                        data.code = code;
                    }
                    data.aliases = data.aliases.filter((a) => a.code !== code);
                }
                else {
                    if (data.code === code)
                        data.code = await this.allocate(r.data.prefix);
                    data.aliases = data.aliases.filter((a) => a.code !== code);
                    if (mode === 'BOTH')
                        data.aliases.push({ code, reason: 'SYNC_COLLISION', at, decidedBy: ctx.actorId });
                    else
                        data.history.push({ code, reason: 'RELEASED_TO', to: winner.data.target, at, decidedBy: ctx.actorId });
                }
                const saved = await this.core.entities.save({ id: r.id, type: TYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, data }, ctx);
                changed.push({ target: saved.data.target, code: saved.data.code, winner: isW });
            }
            return { contract: CONTRACT, code, mode, changed };
        }
        async resolve(q, actorId) {
            const code = normalize(q);
            if (!code)
                return [];
            const out = [];
            for (const r of await this.all()) {
                const primary = r.data.code === code, alias = (r.data.aliases || []).some((a) => a.code === code);
                if (!primary && !alias)
                    continue;
                try {
                    const row = await this.target(r.data.target, actorId);
                    out.push({ code: r.data.code, matched: code, via: primary ? 'CODE' : 'ALIAS', target: r.data.target, ownerApp: row.ownerApp, type: row.type || STORE[r.data.target.kind], title: String(row.data?.name || row.data?.title || row.title || row.name || row.id) });
                }
                catch { /* not readable -> not listed */ }
            }
            return out.sort((a, b) => (a.via === 'CODE' ? 0 : 1) - (b.via === 'CODE' ? 0 : 1));
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.normalize = normalize;
    NS.format = fmt;
    NS.DEFAULT_RULES = DEFAULT_RULES;
    NS.RecordCodesService = RecordCodesService;
    NS.install = (core, options = {}) => {
        if (core.recordCodes)
            throw new Error('Record codes already installed');
        if (!core?.repository?.atomic || core.repository.supportsPreconditions !== true)
            throw new Error('RECORD_CODES_REQUIRE_CAS_REPOSITORY');
        const svc = new RecordCodesService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.RECORD_CODE.ENSURE', 'SAFE_WRITE', (p, c) => svc.ensure(p, c)], ['ACTION.CORE.RECORD_CODE.ADOPT', 'SAFE_WRITE', (p, c) => svc.adopt(p, c)],
            ['ACTION.CORE.RECORD_CODE.RECONCILE', 'SAFE_WRITE', (_p, c) => svc.reconcile(c)], ['ACTION.CORE.RECORD_CODE.COLLISIONS', 'READ', (p, c) => svc.collisions(c.actorId, p || {})], ['ACTION.CORE.RECORD_CODE.COLLISION.RESOLVE', 'SAFE_WRITE', (p, c) => svc.resolveCollision(p, c)], ['ACTION.CORE.RECORD_CODE.RESOLVE', 'READ', (p, c) => svc.resolve(p?.code, c.actorId)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.recordCodes = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.recordCodes;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, rules: svc.prefixRules().length });
    };
})(KXRecordCodes || (KXRecordCodes = {}));
