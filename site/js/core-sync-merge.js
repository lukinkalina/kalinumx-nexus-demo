// N2.1k (R31 základ) — KX.SYNC_PACKAGE: export / PREVIEW / no-loss MERGE. All storage targets (folder, NAS, cloud)
// will only TRANSPORT this package; the safety rules live here, once:
//  - never deletes, never silently overwrites: a record is taken over only when it provably descends from the local one
//    (local revision+SHA appears in the incoming revision history = FAST_FORWARD) or, for rows without revisions,
//    when its updatedAt is strictly newer; identical rows are skipped; everything else becomes a CONFLICT that keeps
//    BOTH versions (local stays, incoming is stored in Core conflicts) for the user to decide;
//  - append-only stores (revisions, audit, lineage) are united, never modified;
//  - apply = the approved preview only (previewToken), one atomic batch with CAS preconditions (N2.1h): if anything
//    changed locally since the preview, nothing is written;
//  - format compatibility: formatVersion + minReaderVersion; unknown stores are skipped and reported, unknown fields
//    are preserved; a package needing a newer app is refused with a clear message, never half-read.
// v1 scope (stated): records, planner, relations, settings, sharing, people/spaces/memberships, history. Files and
// documents with binary content follow in the next package version. The package is NOT encrypted yet (R26).
var KXSyncMerge;
(function (NS) {
    const FORMAT = 'KX.SYNC_PACKAGE', FORMAT_VERSION = 1, READER_VERSION = 1, CONTRACT = 'KX.CORE_SYNC_MERGE/1', OWNER = 'APP.KX.NEXUS';
    const REVISIONED = ['entities', 'tasks', 'calendarEvents', 'alarms'];
    const TIMESTAMPED = ['relations', 'settings', 'shareRules', 'users', 'spaces', 'spaceMemberships'];
    const APPEND_ONLY = ['revisions', 'audit', 'lineage'];
    const STORES = [...REVISIONED, ...TIMESTAMPED, ...APPEND_ONLY];
    const ACCESS_STORES = new Set(['users', 'spaces', 'spaceMemberships', 'shareRules']);
    const stable = (v) => { if (v === null || typeof v !== 'object')
        return JSON.stringify(v) ?? 'null'; if (Array.isArray(v))
        return '[' + v.map(stable).join(',') + ']'; return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'; };
    const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
    const keyOf = (r) => String(r?.id ?? r?.key ?? '');
    // device-local login sessions never travel (rows, their history and their audit trail)
    const exportable = (store, r) => !(store === 'entities' && r?.type === 'CORE.IDENTITY.SESSION') && !(store === 'revisions' && r?.resourceType === 'CORE.IDENTITY.SESSION') && !(store === 'audit' && r?.entityType === 'CORE.IDENTITY.SESSION');
    class SyncMergeService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        // whole-workspace operations: family manager (MANAGE in a FAMILY space) with a verified session if identity is installed
        async authorize(ctx) {
            if (ctx?.actorId === 'SYSTEM')
                return;
            if (!ctx?.confirmed)
                throw new Error('Confirmation required: SYNC');
            if (this.core.identity) {
                let s;
                try {
                    s = await this.core.identity.validate();
                }
                catch (e) {
                    throw new Error(`AUTH_SESSION_REQUIRED_FOR_SYNC (${String(e?.message || e)})`);
                }
                if (s !== ctx.actorId)
                    throw new Error('AUTH_SUBJECT_MISMATCH for SYNC');
            }
            let manager = false;
            for (const sp of await this.core.memberships.listSpaces())
                if (sp.kind === 'FAMILY' && !sp.archivedAt && await this.core.memberships.roleFor(sp.id, ctx.actorId) === 'MANAGE')
                    manager = true;
            if (!manager)
                throw new Error('Scope denied: family manager required for SYNC');
        }
        async exportPackage(ctx) {
            await this.authorize(ctx);
            const repo = this.core.repository;
            const stores = {}, storeSha = {};
            for (const st of STORES) {
                const rows = (await repo.all(st)).filter((r) => exportable(st, r)).sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
                stores[st] = rows;
                storeSha[st] = await sha(stable(rows));
            }
            const head = { format: FORMAT, formatVersion: FORMAT_VERSION, minReaderVersion: 1, appVersion: this.opts.appVersion || 'N2.1k', workspaceId: this.core.workspaceProfile?.id || null, exportedAt: new Date(this.now()).toISOString(), exportedBy: ctx.actorId, storeSha };
            return { ...head, stores, sha256: await sha(stable({ ...head, stores })) };
        }
        async verify(pkg, opts = {}) {
            if (!pkg || typeof pkg !== 'object' || pkg.format !== FORMAT)
                throw new Error('SYNC_PACKAGE_INVALID');
            if (!Number.isInteger(pkg.formatVersion) || !Number.isInteger(pkg.minReaderVersion))
                throw new Error('SYNC_PACKAGE_INVALID');
            if (pkg.minReaderVersion > READER_VERSION)
                throw new Error(`SYNC_PACKAGE_NEEDS_NEWER_APP: package requires reader v${pkg.minReaderVersion}, this app reads v${READER_VERSION}`);
            const { sha256, stores, ...head } = pkg;
            if (!stores || typeof stores !== 'object')
                throw new Error('SYNC_PACKAGE_INVALID');
            if (await sha(stable({ ...head, stores })) !== sha256)
                throw new Error('SYNC_PACKAGE_CORRUPTED: package checksum mismatch');
            for (const [st, rows] of Object.entries(stores)) {
                if (!Array.isArray(rows))
                    throw new Error('SYNC_PACKAGE_INVALID');
                if (pkg.storeSha?.[st] !== await sha(stable(rows)))
                    throw new Error(`SYNC_PACKAGE_CORRUPTED: store ${st}`);
            }
            const ws = this.core.workspaceProfile?.id || null;
            if (pkg.workspaceId && ws && pkg.workspaceId !== ws && opts.allowForeignWorkspace !== true)
                throw new Error('SYNC_PACKAGE_OTHER_WORKSPACE');
            return { ignoredStores: Object.keys(stores).filter(s => !STORES.includes(s)).sort(), newerFormat: pkg.formatVersion > FORMAT_VERSION };
        }
        async plan(pkg, opts = {}) {
            const v = await this.verify(pkg, opts);
            const repo = this.core.repository;
            const items = [];
            const incRevs = new Map();
            for (const r of pkg.stores.revisions || [])
                if (r?.resourceId && Number.isInteger(r.revision))
                    incRevs.set(`${r.resourceId}@${r.revision}`, await sha(stable(r.snapshot)));
            const locRevs = new Map();
            for (const r of await repo.all('revisions'))
                if (r?.resourceId && Number.isInteger(r.revision))
                    locRevs.set(`${r.resourceId}@${r.revision}`, await sha(stable(r.snapshot)));
            for (const st of STORES) {
                const inc = pkg.stores[st];
                if (!Array.isArray(inc))
                    continue;
                const local = new Map();
                for (const r of await repo.all(st))
                    local.set(keyOf(r), r);
                for (const row of inc) {
                    const id = keyOf(row);
                    if (!id || !exportable(st, row)) {
                        items.push({ store: st, id: id || '?', action: 'SKIP_INVALID' });
                        continue;
                    }
                    const loc = local.get(id);
                    const hi = await sha(stable(row));
                    if (!loc) {
                        items.push({ store: st, id, action: 'NEW', hash: hi, expect: null });
                        continue;
                    }
                    const hl = await sha(stable(loc));
                    if (hi === hl) {
                        items.push({ store: st, id, action: 'IDENTICAL' });
                        continue;
                    }
                    if (APPEND_ONLY.includes(st)) {
                        items.push({ store: st, id, action: 'CONFLICT', hash: hi, localHash: hl });
                        continue;
                    }
                    if (REVISIONED.includes(st)) {
                        const ri = row.revision, rl = loc.revision;
                        if (Number.isInteger(ri) && Number.isInteger(rl) && ri > rl && (incRevs.get(`${id}@${rl}`) === hl || (Array.isArray(row.kxSyncAncestry) && row.kxSyncAncestry.some((a) => a && a.revision === rl && a.sha256 === hl)))) {
                            items.push({ store: st, id, action: 'FAST_FORWARD', hash: hi, expect: rl, from: rl, to: ri });
                            continue;
                        }
                        if (Number.isInteger(ri) && Number.isInteger(rl) && rl > ri && locRevs.get(`${id}@${ri}`) === hi) {
                            items.push({ store: st, id, action: 'LOCAL_NEWER' });
                            continue;
                        }
                        items.push({ store: st, id, action: 'CONFLICT', hash: hi, localHash: hl, localRevision: rl, incomingRevision: ri });
                        continue;
                    }
                    const ti = Date.parse(row.updatedAt), tl = Date.parse(loc.updatedAt);
                    if (Number.isFinite(ti) && Number.isFinite(tl) && ti > tl) {
                        items.push({ store: st, id, action: 'INCOMING_NEWER', hash: hi, expectUpdatedAt: loc.updatedAt });
                        continue;
                    }
                    if (Number.isFinite(ti) && Number.isFinite(tl) && tl > ti) {
                        items.push({ store: st, id, action: 'LOCAL_NEWER' });
                        continue;
                    }
                    items.push({ store: st, id, action: 'CONFLICT', hash: hi, localHash: hl });
                }
            }
            const counts = {};
            for (const i of items)
                counts[i.action] = (counts[i.action] || 0) + 1;
            const token = await sha(stable({ pkg: pkg.sha256, items: items.map(i => [i.store, i.id, i.action, i.hash || '', i.expect ?? '', i.expectUpdatedAt ?? '']) }));
            return { contract: CONTRACT, packageSha256: pkg.sha256, exportedAt: pkg.exportedAt, exportedBy: pkg.exportedBy, appVersion: pkg.appVersion, formatVersion: pkg.formatVersion, ...v, counts, items, previewToken: token, deletes: 0 };
        }
        async preview(input, ctx) { await this.authorize(ctx); const p = await this.plan(input?.package, input); return { ...p, items: p.items.filter((i) => i.action !== 'IDENTICAL') }; }
        async apply(input, ctx) {
            await this.authorize(ctx);
            const pkg = input?.package;
            const p = await this.plan(pkg, input);
            if (typeof input?.previewToken !== 'string' || input.previewToken !== p.previewToken)
                throw new Error('SYNC_PREVIEW_STALE: data changed since the preview; run the preview again');
            const byKey = new Map();
            for (const st of STORES)
                for (const r of pkg.stores[st] || [])
                    byKey.set(`${st}/${keyOf(r)}`, r);
            const writes = [], pre = [];
            let access = false;
            for (const i of p.items) {
                const row = byKey.get(`${i.store}/${i.id}`);
                if (i.action === 'NEW') {
                    writes.push({ store: i.store, value: row });
                    pre.push({ store: i.store, key: i.id, field: REVISIONED.includes(i.store) ? 'revision' : 'id', value: null });
                }
                else if (i.action === 'FAST_FORWARD') {
                    writes.push({ store: i.store, value: row });
                    pre.push({ store: i.store, key: i.id, field: 'revision', value: i.expect });
                }
                else if (i.action === 'INCOMING_NEWER') {
                    writes.push({ store: i.store, value: row });
                    pre.push({ store: i.store, key: i.id, field: 'updatedAt', value: i.expectUpdatedAt });
                }
                else
                    continue;
                if (ACCESS_STORES.has(i.store))
                    access = true;
            }
            if (access) {
                const ep = await KX.accessEpochBump(this.core.repository);
                writes.unshift(ep.write);
                pre.push(ep.pre);
            }
            const conflicts = p.items.filter((i) => i.action === 'CONFLICT');
            const at = new Date(this.now()).toISOString();
            // conflicts keep BOTH versions: the local row is untouched, the incoming row is stored in Core conflicts
            for (const c of conflicts)
                writes.push({ store: 'conflicts', value: { id: `CONFLICT.SYNC.${p.packageSha256.slice(0, 16)}.${c.store}.${c.id}`, outboxId: 'SYNC_IMPORT', resourceType: c.store, resourceId: c.id, localRevision: c.localRevision, remoteRevision: c.incomingRevision, rootChangeId: `SYNC.${p.packageSha256.slice(0, 16)}`, status: 'OPEN', detectedAt: at, detail: { source: 'KX.SYNC_PACKAGE', packageSha256: p.packageSha256, exportedBy: p.exportedBy, exportedAt: p.exportedAt, localHash: c.localHash, incomingHash: c.hash, incoming: byKey.get(`${c.store}/${c.id}`) } } });
            writes.push({ store: 'audit', value: { id: `AUDIT.SYNC.${p.packageSha256.slice(0, 16)}.${this.now()}`, at, actorId: ctx.actorId, appCode: ctx.appCode || OWNER, actionCode: 'CORE.SYNC.MERGE.APPLY', entityType: 'KX.SYNC_PACKAGE', entityId: p.packageSha256, rootChangeId: `SYNC.${p.packageSha256.slice(0, 16)}`, result: 'OK', detail: { counts: p.counts, ignoredStores: p.ignoredStores } } });
            try {
                await this.core.repository.atomic(writes, [], pre);
            }
            catch (e) {
                const m = String(e?.message || e);
                if (m.includes('REPOSITORY_CAS_CONFLICT'))
                    throw new Error('SYNC_PREVIEW_STALE: data changed while merging; nothing was written, run the preview again');
                throw e;
            }
            return { contract: CONTRACT, applied: writes.length - conflicts.length - 1 - (access ? 1 : 0), conflicts: conflicts.length, deletes: 0, counts: p.counts, ignoredStores: p.ignoredStores };
        }
    }
    // ---------------- N2.1l (R35): conflict resolution per item AND per field, with content comparison ----------------
    const META = new Set(['id', 'revision', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'kxSyncAncestry']);
    const flat = (row) => {
        const out = {};
        if (!row || typeof row !== 'object')
            return out;
        for (const [k, v] of Object.entries(row)) {
            if (META.has(k))
                continue;
            if (k === 'data' && v && typeof v === 'object' && !Array.isArray(v)) {
                for (const [k2, v2] of Object.entries(v))
                    out['data.' + k2] = v2;
            }
            else
                out[k] = v;
        }
        return out;
    };
    const setPath = (row, path, val, present) => { if (path.startsWith('data.')) {
        row.data = { ...(row.data || {}) };
        const k = path.slice(5);
        if (present)
            row.data[k] = structuredClone(val);
        else
            delete row.data[k];
    }
    else {
        if (present)
            row[path] = structuredClone(val);
        else
            delete row[path];
    } };
    NS.fieldDiff = (local, incoming) => {
        const a = flat(local), b = flat(incoming);
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
        return keys.filter(k => stable(a[k]) !== stable(b[k])).map(k => ({ path: k, local: k in a ? a[k] : undefined, incoming: k in b ? b[k] : undefined, localPresent: k in a, incomingPresent: k in b }));
    };
    SyncMergeService.prototype.conflicts = async function (ctx) {
        await this.authorize(ctx);
        const repo = this.core.repository;
        const out = [];
        for (const c of await repo.all('conflicts')) {
            if (c.status !== 'OPEN' || c.outboxId !== 'SYNC_IMPORT')
                continue;
            const st = c.resourceType, local = await repo.get(st, c.resourceId), incoming = c.detail?.incoming;
            out.push({ id: c.id, store: st, resourceId: c.resourceId, detectedAt: c.detectedAt, exportedBy: c.detail?.exportedBy || null, exportedAt: c.detail?.exportedAt || null,
                localRevision: local?.revision ?? null, incomingRevision: incoming?.revision ?? null, localUpdatedAt: local?.updatedAt ?? null, incomingUpdatedAt: incoming?.updatedAt ?? null,
                title: String(local?.data?.name || local?.data?.title || local?.title || local?.name || c.resourceId), appendOnly: APPEND_ONLY.includes(st), localMissing: !local,
                fields: NS.fieldDiff(local, incoming) });
        }
        return out.sort((a, b) => String(a.detectedAt).localeCompare(String(b.detectedAt)));
    };
    // choice: KEEP_LOCAL (nothing written to the record) | ACCEPT_INCOMING | FIELDS {path:'LOCAL'|'INCOMING'}.
    // The result is a NEW local version (revision+1 / new updatedAt); the version not chosen stays in the conflict
    // history (nothing lost). Commit: one atomic batch, CAS on the record as listed and on the conflict still OPEN.
    SyncMergeService.prototype.resolve = async function (input, ctx) {
        await this.authorize(ctx);
        const repo = this.core.repository;
        const c = await repo.get('conflicts', input?.conflictId);
        if (!c || c.outboxId !== 'SYNC_IMPORT')
            throw new Error('SYNC_CONFLICT_NOT_FOUND');
        if (c.status !== 'OPEN')
            throw new Error('SYNC_CONFLICT_ALREADY_RESOLVED');
        const choice = input?.choice;
        if (!['KEEP_LOCAL', 'ACCEPT_INCOMING', 'FIELDS'].includes(choice))
            throw new Error('SYNC_CONFLICT_CHOICE_INVALID');
        const st = c.resourceType, local = await repo.get(st, c.resourceId), incoming = c.detail?.incoming;
        if (APPEND_ONLY.includes(st) && choice !== 'KEEP_LOCAL')
            throw new Error('SYNC_CONFLICT_APPEND_ONLY_KEEP_LOCAL');
        const isRev = REVISIONED.includes(st);
        const expectRev = local ? (isRev ? local.revision : local.updatedAt) : null;
        if (input.expectedLocal !== undefined && input.expectedLocal !== expectRev)
            throw new Error('SYNC_CONFLICT_LOCAL_CHANGED: the record changed since the comparison; reload');
        const at = new Date(this.now()).toISOString();
        const pre = [{ store: 'conflicts', key: c.id, field: 'status', value: 'OPEN' }];
        const writes = [];
        let resolution, result = local, chosen = {};
        if (choice === 'KEEP_LOCAL') {
            resolution = 'KEEP_LOCAL';
        }
        else {
            const diff = NS.fieldDiff(local, incoming);
            let row = structuredClone(local || incoming);
            if (choice === 'ACCEPT_INCOMING') {
                row = { ...structuredClone(incoming) };
                for (const d of diff)
                    chosen[d.path] = 'INCOMING';
                resolution = 'ACCEPT_REMOTE';
            }
            else {
                const f = input.fields;
                if (!f || typeof f !== 'object')
                    throw new Error('SYNC_CONFLICT_FIELDS_REQUIRED');
                const known = new Set(diff.map((d) => d.path));
                for (const [path, side] of Object.entries(f)) {
                    if (!known.has(path))
                        throw new Error(`SYNC_CONFLICT_FIELD_UNKNOWN ${path}`);
                    if (side !== 'LOCAL' && side !== 'INCOMING')
                        throw new Error('SYNC_CONFLICT_FIELD_SIDE_INVALID');
                }
                for (const d of diff) {
                    const side = f[d.path] || 'LOCAL';
                    chosen[d.path] = side;
                    if (side === 'INCOMING')
                        setPath(row, d.path, d.incoming, d.incomingPresent);
                }
                resolution = Object.values(chosen).every(x => x === 'LOCAL') ? 'KEEP_LOCAL' : 'MERGED';
            }
            if (resolution !== 'KEEP_LOCAL') {
                row.id = c.resourceId;
                // the merged version descends from BOTH sides: the other device will fast-forward to it instead of conflicting again
                if (isRev && incoming && Number.isInteger(incoming.revision))
                    row.kxSyncAncestry = [...((local?.kxSyncAncestry) || []), { revision: incoming.revision, sha256: await sha(stable(incoming)) }].slice(-20);
                if (isRev) {
                    row.revision = (local?.revision || 0) + 1;
                    row.updatedAt = at;
                    row.updatedBy = ctx.actorId;
                    pre.push({ store: st, key: c.resourceId, field: 'revision', value: local ? local.revision : null });
                    writes.push({ store: 'revisions', value: { id: `REV.${row.type || st}.${row.id}.${row.revision}`, resourceType: row.type || st, resourceId: row.id, revision: row.revision, at, actorId: ctx.actorId, appCode: ctx.appCode || OWNER, rootChangeId: `SYNC.RESOLVE.${c.id}`, snapshot: structuredClone(row) } });
                }
                else {
                    row.updatedAt = at;
                    pre.push({ store: st, key: c.resourceId, field: 'updatedAt', value: local ? local.updatedAt : null });
                }
                writes.push({ store: st, value: row });
                result = row;
                if (ACCESS_STORES.has(st)) {
                    const ep = await KX.accessEpochBump(repo);
                    writes.unshift(ep.write);
                    pre.push(ep.pre);
                }
            }
        }
        writes.push({ store: 'conflicts', value: { ...c, status: 'RESOLVED', resolution, resolvedAt: at, detail: { ...c.detail, resolvedBy: ctx.actorId, chosen, localAtResolution: local ?? null } } });
        writes.push({ store: 'audit', value: { id: `AUDIT.SYNC.RESOLVE.${c.id}.${this.now()}`, at, actorId: ctx.actorId, appCode: ctx.appCode || OWNER, actionCode: 'CORE.SYNC.CONFLICT.RESOLVE', entityType: st, entityId: c.resourceId, rootChangeId: `SYNC.RESOLVE.${c.id}`, result: 'OK', detail: { resolution, fields: Object.keys(chosen).length } } });
        try {
            await repo.atomic(writes, [], pre);
        }
        catch (e) {
            const m = String(e?.message || e);
            if (m.includes('REPOSITORY_CAS_CONFLICT conflicts/'))
                throw new Error('SYNC_CONFLICT_ALREADY_RESOLVED');
            if (m.includes('REPOSITORY_CAS_CONFLICT'))
                throw new Error('SYNC_CONFLICT_LOCAL_CHANGED: the record changed meanwhile; nothing was written, reload');
            throw e;
        }
        return { conflictId: c.id, resolution, revision: result?.revision ?? null, chosen };
    };
    NS.CONTRACT = CONTRACT;
    NS.FORMAT = FORMAT;
    NS.FORMAT_VERSION = FORMAT_VERSION;
    NS.READER_VERSION = READER_VERSION;
    NS.STORES = STORES;
    NS.stable = stable;
    NS.SyncMergeService = SyncMergeService;
    NS.install = (core, options = {}) => {
        if (core.syncMerge)
            throw new Error('Sync merge already installed');
        if (!core?.repository?.atomic || !core?.memberships)
            throw new Error('Sync merge requires Core repository/memberships');
        if (core.repository.supportsPreconditions !== true)
            throw new Error('SYNC_REQUIRES_CAS_REPOSITORY');
        const svc = new SyncMergeService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.SYNC.EXPORT', 'SENSITIVE_WRITE', (_p, c) => svc.exportPackage(c)], ['ACTION.CORE.SYNC.PREVIEW', 'SENSITIVE_WRITE', (p, c) => svc.preview(p, c)], ['ACTION.CORE.SYNC.APPLY', 'SENSITIVE_WRITE', (p, c) => svc.apply(p, c)],
            ['ACTION.CORE.SYNC.CONFLICTS', 'SENSITIVE_WRITE', (_p, c) => svc.conflicts(c)], ['ACTION.CORE.SYNC.CONFLICT.RESOLVE', 'SENSITIVE_WRITE', (p, c) => svc.resolve(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.syncMerge = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.syncMerge;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, format: FORMAT, formatVersion: FORMAT_VERSION, readerVersion: READER_VERSION, actions: defs.length });
    };
})(KXSyncMerge || (KXSyncMerge = {}));
