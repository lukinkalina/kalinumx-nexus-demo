// N2.5l (user 2026-10-25): BLACK BOX + RESTORE POINTS. The black box is a device-local journal (core store 'meta', never synced):
// sessions with a heartbeat (start / last beat / end – a session without an end = the app did not close properly), opened places,
// program errors, Kaira events. After a crash the next start shows what happened last (audit of that session + journal). Nothing secret:
// payload values are never stored (keys only, secrets dropped). RESTORE POINTS build on the core snapshot service (core.recovery:
// whole-store snapshot with SHA-256): daily + automatically BEFORE risky actions (action guard – a failure never blocks the action, it is
// journalled), manual with a note; preview of differences; FORWARD restore (records get a NEW revision with the old state, records created
// after the point go to the trash – nothing is deleted; a new point is made first, so the restore itself can be undone); retention.
var KXBlackbox;
(function () {
    const OWNER = 'APP.KX.NEXUS';
    const P_SES = 'blackbox:session:', P_EV = 'blackbox:ev:', MAX_EV = 3000, BEAT_MS = 30000;
    const RISKY = ['ACTION.CORE.IMPORT.APPLY', 'ACTION.CORE.SYNC.APPLY', 'ACTION.CORE.SYNC.CONFLICT.RESOLVE', 'ACTION.CORE.CONTACT.MERGE', 'ACTION.CORE.TAGS.MERGE', 'ACTION.CORE.RESTORE.APPLY'];
    const SECRET = /pass|heslo|pin\b|secret|token|key|klic|cvc|cvv|card/i;
    const RESTORABLE = ['entities', 'tasks', 'calendarEvents', 'alarms'];
    const clean = (d, depth = 0) => { if (d == null || depth > 3)
        return undefined; if (Array.isArray(d))
        return d.slice(0, 20).map(x => clean(x, depth + 1)); if (typeof d === 'object') {
        const o = {};
        for (const [k, v] of Object.entries(d)) {
            if (SECRET.test(k))
                continue;
            o[k] = clean(v, depth + 1);
        }
        return o;
    } if (typeof d === 'string')
        return d.slice(0, 300); return d; };
    function install(core, opts = {}) {
        if (core.blackbox)
            return core.blackbox;
        const repo = core.repository;
        const now = () => opts.now ? opts.now() : Date.now();
        let session = null;
        let lastBeat = 0;
        const meta = async () => (await repo.all('meta'));
        const bb = { RISKY,
            /* start a session; a previous session of this device without an end = it crashed */
            async start(p) {
                const all = await meta();
                const dev = String(p?.deviceId || '');
                const prev = all.filter((r) => String(r.key).startsWith(P_SES) && r.deviceId === dev && !r.endedAt).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
                /* a session closed normally whose async end did not make it (page closed first) is reported by the shell synchronously as cleanExitId –
                   NOT a crash; only the others are */
                const crashed = [];
                for (const s of prev) { /* several workspaces / profiles (e.g. DEMO with its own database) each leave their own clean-exit mark – a LIST */
                    const clean = new Set([...(Array.isArray(p?.cleanExitIds) ? p.cleanExitIds : []), ...(p?.cleanExitId ? [p.cleanExitId] : [])].map(String));
                    if (clean.has(String(s.id))) {
                        await repo.put('meta', { ...s, endedAt: s.lastBeatAt || s.startedAt, endKind: 'NORMAL' });
                        continue;
                    }
                    await repo.put('meta', { ...s, crashed: true, endedAt: s.lastBeatAt || s.startedAt, endKind: 'CRASH' });
                    crashed.push(s);
                }
                const id = 'SES.' + now().toString(36) + '.' + Math.random().toString(36).slice(2, 8);
                session = { key: P_SES + id, id, deviceId: dev, actorId: p?.actorId || null, version: String(p?.version || ''), startedAt: new Date(now()).toISOString(), lastBeatAt: new Date(now()).toISOString(), lastPlace: null };
                await repo.put('meta', session);
                return { session: id, crashed: crashed.length ? { id: crashed[0].id, startedAt: crashed[0].startedAt, lastBeatAt: crashed[0].lastBeatAt, lastPlace: crashed[0].lastPlace || null } : null };
            },
            async beat(p = {}) { if (!session)
                return null; const t = now(); if (!p.force && t - lastBeat < BEAT_MS)
                return null; lastBeat = t; session = { ...session, lastBeatAt: new Date(t).toISOString(), lastPlace: p.place ? clean(p.place) : session.lastPlace }; await repo.put('meta', session); return session.lastBeatAt; },
            async end() { if (!session)
                return; session = { ...session, endedAt: new Date(now()).toISOString(), endKind: 'NORMAL' }; await repo.put('meta', session); },
            /* journal: PLACE / ERROR / KAIRA / RESTORE / NOTE – sanitized, capped */
            async log(kind, p) {
                const k = ['PLACE', 'ERROR', 'KAIRA', 'RESTORE', 'NOTE', 'WARN'].includes(kind) ? kind : 'NOTE';
                const at = new Date(now()).toISOString();
                const row = { key: P_EV + at + ':' + Math.random().toString(36).slice(2, 8), kind: k, at, sessionId: session?.id || null, actorId: p?.actorId || session?.actorId || null, text: String(p?.text || '').slice(0, 400), detail: clean(p?.detail) };
                await repo.put('meta', row);
                const evs = (await meta()).filter((r) => String(r.key).startsWith(P_EV)).sort((a, b) => String(a.key).localeCompare(String(b.key)));
                for (const r of evs.slice(0, Math.max(0, evs.length - MAX_EV)))
                    await repo.del('meta', r.key);
                return row.key;
            },
            async journal(p = {}) { const evs = (await meta()).filter((r) => String(r.key).startsWith(P_EV) && (!p.sessionId || r.sessionId === p.sessionId) && (!p.kind || r.kind === p.kind) && (!p.actorId || r.actorId === p.actorId)); return evs.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, Math.min(500, p.limit || 200)); },
            async sessions() { return (await meta()).filter((r) => String(r.key).startsWith(P_SES)).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 100); },
            /* what happened last in a (crashed) session: its journal + the audit of the actor in that time window */
            async report(p, ctx) {
                const s = (await bb.sessions()).find((x) => x.id === String(p?.id || ''));
                if (!s)
                    throw new Error('BLACKBOX_SESSION_NOT_FOUND');
                const from = String(s.startedAt), to = String(s.endedAt || s.lastBeatAt || new Date(now()).toISOString());
                const aud = (await core.audit.list()).filter((a) => a.actorId === ctx.actorId && String(a.at || a.createdAt || '') >= from && String(a.at || a.createdAt || '') <= to + '~');
                return { session: s, actions: aud.slice(-30).reverse().map((a) => ({ at: a.at || a.createdAt, actionCode: a.actionCode, result: a.result, entityType: a.entityType })), journal: (await bb.journal({ sessionId: s.id, limit: 60 })) };
            },
            /* Kaira history: her actions in the audit + Kaira journal entries */
            async kaira(ctx) {
                const aud = (await core.audit.list()).filter((a) => a.actorId === ctx.actorId && /^ACTION\.CORE\.KAIRA\./.test(String(a.actionCode))).slice(-100).reverse().map((a) => ({ at: a.at || a.createdAt, actionCode: a.actionCode, result: a.result }));
                return { actions: aud, journal: await bb.journal({ kind: 'KAIRA', actorId: ctx.actorId, limit: 100 }) };
            } };
        /* ---- restore points ---- */
        /* the point label (reason, note, who) is stored NEXT TO the snapshot (meta 'blackbox:point:<id>') – the snapshot itself stays untouched,
           so its SHA-256 verification keeps working */
        const P_PT = 'blackbox:point:';
        const snaps = async () => {
            const tags = new Map(((await meta()).filter((r) => String(r.key).startsWith(P_PT))).map((r) => [r.snapshotId, r]));
            return (await core.recovery.list()).filter((r) => r && tags.has(r.id)).map((r) => ({ ...r, kxPoint: tags.get(r.id) })).sort((a, b) => String(b.kxPoint.at).localeCompare(String(a.kxPoint.at)));
        };
        const lastAuto = {};
        const rp = { RESTORABLE,
            async create(p, ctx) {
                const reason = String(p?.reason || 'MANUAL').slice(0, 40);
                const note = String(p?.note || '').slice(0, 300);
                const row = await core.recovery.create({ createdBy: ctx.actorId, runtimeVersion: String(opts.version || 'N2.5l'), includeAudit: false, includeFileBlobs: !!p?.includeFiles });
                const tag = { key: P_PT + row.id, snapshotId: row.id, reason, note, at: new Date(now()).toISOString(), by: ctx.actorId, manual: reason === 'MANUAL' };
                await repo.put('meta', tag);
                const tagged = { kxPoint: tag };
                /* the file copy (for the data folder / emergency viewer) is made for manual and daily points; a point BEFORE a risky action stays in the
                   database only, so the action is not delayed */ let fileId = null;
                try {
                    if (core.files?.importBlob && !reason.startsWith('BEFORE')) {
                        const sp = ((await core.propagate.spaces(ctx.actorId)).find((x) => x.kind === 'PERSONAL') || {}).id; /* the file is the snapshot row as JSON (independent of the Blob implementation of the environment) */
                        const data = new Blob([JSON.stringify(row)], { type: 'application/json' });
                        const f = await core.files.importBlob(data, `KX_BOD_OBNOVY_${tag.at.replace(/[:.]/g, '-')}.json`, 'application/json', OWNER, [sp], { ...ctx, permissions: [...(ctx.permissions || []), 'CORE.FILE.IMPORT'] }, { tags: ['kx:restore-point', 'kx:reason:' + reason], description: note });
                        fileId = f?.id || null;
                        await repo.put('meta', { ...tag, fileId });
                    }
                }
                catch (e) {
                    await bb.log('WARN', { actorId: ctx.actorId, text: 'POINT_FILE_COPY_FAILED', detail: { id: row.id, error: String(e?.message || e).slice(0, 160) } });
                }
                await bb.log('RESTORE', { actorId: ctx.actorId, text: 'POINT_CREATED', detail: { id: row.id, reason, fileCopy: !!fileId } });
                await rp.prune();
                return { id: row.id, reason, at: tagged.kxPoint.at, counts: row.storeCounts, fileId };
            },
            /* bring a point back from its FILE (e.g. into a new / repaired database) – verified by SHA-256 before it is accepted */
            async importFile(p, ctx) {
                let txt = String(p?.text || '');
                if (!txt && p?.fileId && core.files?.getBlob) {
                    const b = await core.files.getBlob(String(p.fileId));
                    txt = await b.text();
                }
                let row;
                try {
                    row = JSON.parse(txt);
                }
                catch {
                    throw new Error('RESTORE_FILE_INVALID');
                }
                if (!row?.id || !row?.sha256 || !row?.payload)
                    throw new Error('RESTORE_FILE_INVALID');
                const v = await core.recovery.verify(row).catch(() => ({ ok: false }));
                if (!v || v.ok === false)
                    throw new Error('RESTORE_POINT_CORRUPTED');
                if (!(await core.recovery.list()).some((x) => x.id === row.id))
                    await repo.put('recoverySnapshots', row);
                const tag = { key: P_PT + row.id, snapshotId: row.id, reason: 'FROM_FILE', note: String(p?.note || '').slice(0, 300), at: new Date(now()).toISOString(), by: ctx.actorId, manual: true, fileId: p?.fileId || null };
                await repo.put('meta', tag);
                await bb.log('RESTORE', { actorId: ctx.actorId, text: 'POINT_IMPORTED', detail: { id: row.id } });
                return { id: row.id, verified: true };
            },
            async list() { return (await snaps()).map((r) => ({ id: r.id, reason: r.kxPoint.reason, note: r.kxPoint.note, at: r.kxPoint.at, by: r.kxPoint.by, manual: !!r.kxPoint.manual, counts: r.storeCounts })); },
            /* keep all manual points (max 50), the last 14 automatic daily and the last 20 before risky actions */
            async prune() {
                const all = await snaps();
                const keep = new Set();
                const man = all.filter((r) => r.kxPoint.manual).slice(0, 50), daily = all.filter((r) => r.kxPoint.reason === 'DAILY').slice(0, 14), risky = all.filter((r) => !r.kxPoint.manual && r.kxPoint.reason !== 'DAILY').slice(0, 20);
                for (const r of [...man, ...daily, ...risky])
                    keep.add(r.id);
                for (const r of all)
                    if (!keep.has(r.id)) {
                        await repo.del('recoverySnapshots', r.id);
                        await repo.del('meta', P_PT + r.id);
                    }
            },
            async daily(ctx) { const today = new Date(now()).toISOString().slice(0, 10); if ((await snaps()).some((r) => r.kxPoint.reason === 'DAILY' && String(r.kxPoint.at).slice(0, 10) === today))
                return null; return rp.create({ reason: 'DAILY' }, ctx); },
            async get(id) { const r = (await snaps()).find((x) => x.id === id); if (!r)
                throw new Error('RESTORE_POINT_NOT_FOUND'); const { kxPoint, ...raw } = r; const v = await core.recovery.verify(raw).catch(() => ({ ok: false })); if (v && v.ok === false)
                throw new Error('RESTORE_POINT_CORRUPTED'); return r; },
            /* differences between now and the point (only what this person may restore = readable records) */
            /* N2.5m: restore TYPES – mode ALL / MISSING (only what disappeared – never overwrites) / CHANGED (only changed, keeps new);
               scope hubs[] and / or recordIds[]; a by-hub summary = „what will be affected“ */
            async preview(p, ctx) {
                const pt = await rp.get(String(p?.id || ''));
                const mode = ['ALL', 'MISSING', 'CHANGED'].includes(p?.mode) ? p.mode : 'ALL';
                const out = { id: pt.id, at: pt.kxPoint.at, mode, stores: {}, byHub: {} };
                const hubs = [...(Array.isArray(p?.hubs) ? p.hubs : []), ...(p?.hub ? [p.hub] : [])].map(String), ids = [...(Array.isArray(p?.recordIds) ? p.recordIds : []), ...(p?.recordId ? [p.recordId] : [])].map(String);
                for (const st of RESTORABLE) {
                    const then = new Map(((pt.payload || {})[st] || []).map((r) => [r.id, r]));
                    const nowRows = new Map((await repo.all(st)).map((r) => [r.id, r]));
                    const inScope = (r) => (!hubs.length || hubs.includes(String(r?.ownerApp || ''))) && (!ids.length || ids.includes(String(r?.id || '')));
                    const owner = new Map();
                    const changed = [], removed = [], added = [];
                    for (const [id, old] of then) {
                        if (!inScope(old))
                            continue;
                        owner.set(id, String(old.ownerApp || ''));
                        const cur = nowRows.get(id);
                        if (!cur || cur.archivedAt && !old.archivedAt)
                            removed.push(id);
                        else if (JSON.stringify(cur.data ?? cur) !== JSON.stringify(old.data ?? old) || !!cur.archivedAt !== !!old.archivedAt)
                            changed.push(id);
                    }
                    for (const [id, cur] of nowRows) {
                        if (!inScope(cur))
                            continue;
                        if (!then.has(id) && !cur.archivedAt) {
                            added.push(id);
                            owner.set(id, String(cur.ownerApp || ''));
                        }
                    }
                    if (mode === 'MISSING') {
                        changed.length = 0;
                        added.length = 0;
                    }
                    if (mode === 'CHANGED') {
                        removed.length = 0;
                        added.length = 0;
                    }
                    for (const [k, arr] of [['changed', changed], ['returning', removed], ['added', added]]) {
                        for (const id of arr) {
                            const h = owner.get(id) || '?';
                            out.byHub[h] = out.byHub[h] || { changed: 0, returning: 0, added: 0 };
                            out.byHub[h][k]++;
                        }
                    }
                    out.stores[st] = { changed: changed.length, returning: removed.length, added: added.length, ids: { changed: changed.slice(0, 500), returning: removed.slice(0, 500), added: added.slice(0, 500) } };
                }
                return out;
            },
            /* forward restore: a new point first; then changed / returning records get a new revision with the old state, records created after
               the point go to the trash (archived). Entities through the entity service (revision + audit); tasks / events / alarms through their services. */
            async dryRun(p, ctx) {
                const pt = await rp.get(String(p?.id || ''));
                const pv = await rp.preview(p, ctx);
                const issues = [];
                let ok = 0;
                for (const st of RESTORABLE) {
                    const then = new Map(((pt.payload || {})[st] || []).map((r) => [r.id, r]));
                    for (const id of [...pv.stores[st].ids.changed, ...pv.stores[st].ids.returning, ...pv.stores[st].ids.added]) {
                        const cur = await repo.get(st, id);
                        const old = then.get(id);
                        if (!cur && !old) {
                            issues.push({ store: st, id, reason: 'MISSING' });
                            continue;
                        }
                        if (old && (typeof old !== 'object' || !old.id))
                            issues.push({ store: st, id, reason: 'SNAPSHOT_ROW_INVALID' });
                        else
                            ok++;
                    }
                }
                return { id: pt.id, dryRun: true, wouldRestore: Object.values(pv.stores).reduce((a, x) => a + x.changed + x.returning, 0), wouldArchive: Object.values(pv.stores).reduce((a, x) => a + x.added, 0), checked: ok, issues, preview: pv };
            },
            async apply(p, ctx) {
                if (p?.confirmed !== true)
                    throw new Error('RESTORE_NEEDS_CONFIRM');
                const pt = await rp.get(String(p?.id || ''));
                /* always a dry run first – a plan with problems is not applied (unless the person explicitly accepts the listed problems) */
                const dry = await rp.dryRun(p, ctx);
                if (dry.issues.length && p?.acceptIssues !== true)
                    throw new Error('RESTORE_DRY_RUN_ISSUES ' + dry.issues.length);
                const before = await rp.create({ reason: 'BEFORE_RESTORE', note: '↺ ' + pt.kxPoint.at }, ctx);
                const pv = await rp.preview(p, ctx);
                const res = { before: before.id, restored: 0, archived: 0, failed: [] };
                const svc = { entities: core.entities, tasks: core.tasks, calendarEvents: core.calendar, alarms: core.alarms };
                for (const st of RESTORABLE) {
                    const then = new Map(((pt.payload || {})[st] || []).map((r) => [r.id, r]));
                    const S = svc[st];
                    for (const id of [...pv.stores[st].ids.changed, ...pv.stores[st].ids.returning]) {
                        try {
                            const cur = await repo.get(st, id);
                            const old = then.get(id); /* back from the trash needs an EXPLICIT empty archive date (undefined = keep the current one) */
                            const row = { ...old, expectedRevision: cur?.revision, archivedAt: old.archivedAt || null };
                            if (st === 'entities')
                                await S.save(row, { ...ctx, appCode: old.ownerApp || OWNER });
                            else
                                await S.save(row, { ...ctx, appCode: old.ownerApp || OWNER });
                            res.restored++;
                        }
                        catch (e) {
                            res.failed.push({ store: st, id, reason: String(e?.message || e).slice(0, 160) });
                        }
                    }
                    for (const id of pv.stores[st].ids.added) {
                        try {
                            const cur = await repo.get(st, id);
                            await S.save({ ...cur, expectedRevision: cur.revision, archivedAt: new Date(now()).toISOString() }, { ...ctx, appCode: cur.ownerApp || OWNER });
                            res.archived++;
                        }
                        catch (e) {
                            res.failed.push({ store: st, id, reason: String(e?.message || e).slice(0, 160) });
                        }
                    }
                }
                await bb.log('RESTORE', { actorId: ctx.actorId, text: 'RESTORED', detail: { point: pt.id, before: before.id, restored: res.restored, archived: res.archived, failed: res.failed.length } });
                return res;
            } };
        const SKIP = new Set(['revision', 'updatedAt', 'createdAt', 'expectedRevision', 'lineage']);
        const flat = (r) => { const o = {}; const d = r?.data && typeof r.data === 'object' ? r.data : null; if (d) {
            for (const [k, v] of Object.entries(d))
                o['data.' + k] = v;
            for (const k of ['archivedAt', 'spaceIds', 'ownerApp'])
                if (r[k] !== undefined)
                    o[k] = r[k];
        }
        else
            for (const [k, v] of Object.entries(r || {}))
                if (!SKIP.has(k) && k !== 'id')
                    o[k] = v; return o; };
        const svcOf = (st) => ({ entities: core.entities, tasks: core.tasks, calendarEvents: core.calendar, alarms: core.alarms }[st]);
        const storeOf = async (id) => { for (const st of RESTORABLE)
            if (await repo.get(st, id))
                return st; return null; };
        Object.assign(rp, {
            /* side-by-side comparison of one record: now × in the point (field by field) */
            async diff(p, ctx) {
                const pt = await rp.get(String(p?.id || ''));
                const rid = String(p?.recordId || '');
                const st = String(p?.store || '') || await storeOf(rid) || 'entities';
                const old = ((pt.payload || {})[st] || []).find((r) => r.id === rid);
                const cur = await repo.get(st, rid);
                if (!old && !cur)
                    throw new Error('RESTORE_RECORD_NOT_FOUND');
                const a = flat(cur), b = flat(old);
                const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
                return { store: st, recordId: rid, existsNow: !!cur, existsThen: !!old, fields: keys.map(k => ({ field: k, now: a[k] ?? null, then: b[k] ?? null, same: JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null) })) };
            },
            /* bring back ONE field from the point (new revision) */
            async restoreField(p, ctx) {
                if (p?.confirmed !== true)
                    throw new Error('RESTORE_NEEDS_CONFIRM');
                const d = await rp.diff(p, ctx);
                const f = d.fields.find((x) => x.field === String(p?.field || ''));
                if (!f)
                    throw new Error('RESTORE_FIELD_NOT_FOUND');
                if (f.same)
                    return { unchanged: true };
                const cur = await repo.get(d.store, d.recordId);
                if (!cur)
                    throw new Error('RESTORE_RECORD_NOT_FOUND');
                const k = String(p.field);
                const row = { ...cur, expectedRevision: cur.revision };
                if (k.startsWith('data.')) {
                    row.data = { ...(cur.data || {}) };
                    if (f.then === null)
                        delete row.data[k.slice(5)];
                    else
                        row.data[k.slice(5)] = f.then;
                }
                else
                    row[k] = f.then === null && k === 'archivedAt' ? null : f.then;
                await svcOf(d.store).save(row, { ...ctx, appCode: cur.ownerApp || OWNER });
                await bb.log('RESTORE', { actorId: ctx.actorId, text: 'FIELD_RESTORED', detail: { record: d.recordId, field: k } });
                return { restored: k };
            },
            /* what changed between two points */
            async comparePoints(p) {
                const A = await rp.get(String(p?.a || '')), B = await rp.get(String(p?.b || ''));
                const out = { a: A.kxPoint.at, b: B.kxPoint.at, stores: {}, byHub: {} };
                for (const st of RESTORABLE) {
                    const ma = new Map(((A.payload || {})[st] || []).map((r) => [r.id, r])), mb = new Map(((B.payload || {})[st] || []).map((r) => [r.id, r]));
                    let ch = 0, ad = 0, rm = 0;
                    const bump = (r, k) => { const h = String(r?.ownerApp || '?'); out.byHub[h] = out.byHub[h] || { changed: 0, added: 0, removed: 0 }; out.byHub[h][k]++; };
                    for (const [id, r] of mb) {
                        const o = ma.get(id);
                        if (!o) {
                            ad++;
                            bump(r, 'added');
                        }
                        else if (JSON.stringify(flat(o)) !== JSON.stringify(flat(r))) {
                            ch++;
                            bump(r, 'changed');
                        }
                    }
                    for (const [id, r] of ma)
                        if (!mb.has(id)) {
                            rm++;
                            bump(r, 'removed');
                        }
                    out.stores[st] = { changed: ch, added: ad, removed: rm };
                }
                return out;
            },
            /* previous versions of one record: its revisions + restore points that contain it */
            async versions(p, ctx) {
                const rid = String(p?.recordId || '');
                const st = String(p?.store || '') || await storeOf(rid);
                if (!st)
                    throw new Error('RESTORE_RECORD_NOT_FOUND');
                const revs = (await core.revisions.list(rid)).map((r) => ({ revision: r.revision, at: r.at, actorId: r.actorId }));
                const pts = (await snaps()).filter((x) => ((x.payload || {})[st] || []).some((r) => r.id === rid)).map((x) => ({ id: x.id, at: x.kxPoint.at, reason: x.kxPoint.reason }));
                const cur = await repo.get(st, rid);
                return { store: st, recordId: rid, current: cur?.revision ?? null, revisions: revs.reverse(), points: pts };
            },
            async restoreVersion(p, ctx) {
                if (p?.confirmed !== true)
                    throw new Error('RESTORE_NEEDS_CONFIRM');
                const rid = String(p?.recordId || '');
                const st = await storeOf(rid);
                if (!st)
                    throw new Error('RESTORE_RECORD_NOT_FOUND');
                const rv = await core.revisions.get(rid, Number(p?.revision));
                if (!rv)
                    throw new Error('RESTORE_VERSION_NOT_FOUND');
                const cur = await repo.get(st, rid);
                const snap = rv.snapshot || {};
                await svcOf(st).save({ ...snap, id: rid, expectedRevision: cur.revision, archivedAt: snap.archivedAt || null }, { ...ctx, appCode: cur.ownerApp || OWNER });
                await bb.log('RESTORE', { actorId: ctx.actorId, text: 'VERSION_RESTORED', detail: { record: rid, revision: rv.revision } });
                return { restored: rid, fromRevision: rv.revision };
            }
        });
        /* automatic point BEFORE risky actions (at most once per 10 minutes per action); a failure never blocks the action */
        try {
            core.actions.addGuard('KX.BLACKBOX.RESTORE_POINT', async (def, ctx) => {
                if (!RISKY.includes(def.code) || def.code === 'ACTION.CORE.RESTORE.APPLY')
                    return;
                const t = now();
                if (lastAuto[def.code] && t - lastAuto[def.code] < 600000)
                    return;
                lastAuto[def.code] = t;
                try {
                    await rp.create({ reason: 'BEFORE:' + def.code.replace('ACTION.CORE.', '') }, ctx);
                }
                catch (e) {
                    try {
                        await bb.log('WARN', { actorId: ctx.actorId, text: 'POINT_FAILED', detail: { action: def.code, error: String(e?.message || e).slice(0, 160) } });
                    }
                    catch { }
                }
            });
        }
        catch { }
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.BLACKBOX.SESSIONS', 'READ', () => bb.sessions());
        reg('ACTION.CORE.BLACKBOX.REPORT', 'READ', (p, c) => bb.report(p, c));
        reg('ACTION.CORE.BLACKBOX.JOURNAL', 'READ', (p, c) => bb.journal({ ...p, actorId: c.actorId }));
        reg('ACTION.CORE.BLACKBOX.KAIRA', 'READ', (_p, c) => bb.kaira(c));
        reg('ACTION.CORE.RESTORE.CREATE', 'SAFE_WRITE', (p, c) => rp.create({ ...p, reason: 'MANUAL' }, c));
        reg('ACTION.CORE.RESTORE.LIST', 'READ', () => rp.list());
        reg('ACTION.CORE.RESTORE.EXPORT', 'READ', async (p) => { const r = await rp.get(String(p?.id || '')); const { kxPoint, ...raw } = r; return { name: `KX_BOD_OBNOVY_${String(kxPoint.at).replace(/[:.]/g, '-')}.json`, text: JSON.stringify(raw) }; });
        reg('ACTION.CORE.RESTORE.PREVIEW', 'READ', (p, c) => rp.preview(p, c));
        reg('ACTION.CORE.RESTORE.APPLY', 'SENSITIVE_WRITE', (p, c) => rp.apply(p, c));
        reg('ACTION.CORE.RESTORE.DIFF', 'READ', (p, c) => rp.diff(p, c));
        reg('ACTION.CORE.RESTORE.FIELD', 'SENSITIVE_WRITE', (p, c) => rp.restoreField(p, c));
        reg('ACTION.CORE.RESTORE.COMPARE', 'READ', (p) => rp.comparePoints(p));
        reg('ACTION.CORE.RESTORE.VERSIONS', 'READ', (p, c) => rp.versions(p, c));
        reg('ACTION.CORE.RESTORE.VERSION_APPLY', 'SENSITIVE_WRITE', (p, c) => rp.restoreVersion(p, c));
        reg('ACTION.CORE.RESTORE.DRY_RUN', 'READ', (p, c) => rp.dryRun(p, c));
        reg('ACTION.CORE.RESTORE.IMPORT_FILE', 'SENSITIVE_WRITE', (p, c) => rp.importFile(p, c));
        core.blackbox = bb;
        core.restorePoints = rp;
        return bb;
    }
    KXBlackbox = { install, RISKY };
    globalThis.KXBlackbox = KXBlackbox;
})();
