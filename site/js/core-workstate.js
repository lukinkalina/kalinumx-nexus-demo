// N2.5o (user 2026-10-26): DRAFT / IN PROGRESS / WAITING / DONE across NEXUS. „Save is not Done“: a thing stays in progress until the person
// clicks Done. The state lives NEXT TO the record (CORE.WORKSTATE, in the record spaces – like the identification), so no hub schema changes.
// An action observer marks a newly saved / edited hub record IN PROGRESS (saving never means done); editing a DONE record does not reopen it
// (only „edited after done“). Done checks required fields (warns, may be forced). Tasks keep their own statuses (mapped). Lists for the main
// screen: in-progress (Company / Family / Personal, forgotten > 14 days) and the LAST N THINGS I DID (all states, from the audit, one row per
// thing, 5 / 10 / 15 / 20 / 30). Counting in totals is a CHOICE per person (in progress yes / no, drafts yes / no; defaults yes / no).
var KXWorkState;
(function () {
    const OWNER = 'APP.KX.NEXUS', TYPE = 'CORE.WORKSTATE', PREFS = 'CORE.WORKSTATE.PREFS';
    const STATES = ['DRAFT', 'IN_PROGRESS', 'WAITING', 'DONE'];
    const LIMITS = [5, 10, 15, 20, 30];
    const TASK_MAP = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'IN_PROGRESS', WAITING: 'WAITING', DONE: 'DONE' };
    const sid = (id) => `${TYPE}.${String(id).replace(/[^A-Z0-9_.-]/gi, '_')}`;
    /* records that are not „things“ of a person (core internals) never get a state */
    const INTERNAL = /^(CORE\.|APP\.KX\.NEXUS\.|KX\.)/;
    /* for the LAST THINGS: skip only technical records – tasks, events and hub records ARE things a person did */
    const TECHNICAL = /^(CORE\.(WORKSTATE|KAIRA|IDENTITY|NOTIFICATION|INBOX|POKE|SETTING|APPEARANCE|ASSET\.IDENT|BLACKBOX|RECOVERY|LEARN|GUIDE\.PROMPT|SESSION)|KX\.|APP\.KX\.NEXUS\.)/;
    function install(core, opts = {}) {
        if (core.workState)
            return core.workState;
        const now = () => opts.now ? opts.now() : Date.now();
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const group = async (r) => {
            const sp = await core.memberships.listSpaces().catch(() => []);
            const kinds = (r?.spaceIds || []).map((id) => (sp.find((s) => s.id === id) || {}).kind);
            return kinds.includes('COMPANY') ? 'COMPANY' : kinds.includes('FAMILY') ? 'FAMILY' : 'PERSONAL';
        };
        const title = (r) => String(r?.data?.name || r?.data?.title || r?.data?.text || r?.title || r?.type || r?.id || '').slice(0, 80);
        const domains = () => (globalThis.KXHubKit?.domains || []);
        async function prefs(u) { const r = await core.entities.get(`${PREFS}.${String(u).replace(/[^A-Z0-9_.]/gi, '_')}`).catch(() => null); return { row: r, data: { includeInProgress: true, includeDrafts: false, recentLimit: 10, ...(r?.data || {}) } }; }
        const svc = { STATES, LIMITS,
            async get(p) {
                const id = String(p?.id || '');
                const t = await core.tasks.get(id).catch(() => null);
                if (t)
                    return { id, kind: 'TASK', state: TASK_MAP[t.status] || null, task: true };
                const w = await core.entities.get(sid(id)).catch(() => null);
                return w ? { id, kind: 'RECORD', ...w.data } : { id, kind: 'RECORD', state: null };
            },
            /* set a state; DONE checks required fields of the hub (warns, can be forced); history kept */
            async set(p, ctx) {
                const id = String(p?.id || '');
                const state = String(p?.state || '');
                if (!STATES.includes(state))
                    throw new Error('WORKSTATE_INVALID');
                const t = await core.tasks.get(id).catch(() => null);
                if (t) {
                    const map = { DRAFT: 'TODO', IN_PROGRESS: 'IN_PROGRESS', WAITING: 'WAITING', DONE: 'DONE' };
                    await core.tasks.save({ ...t, status: map[state], expectedRevision: t.revision }, { ...ctx, appCode: t.ownerApp || OWNER });
                    return { id, state, task: true };
                }
                const r = await core.entities.get(id);
                if (!r)
                    throw new Error('WORKSTATE_RECORD_NOT_FOUND');
                if (!await readable(r, ctx.actorId))
                    throw new Error('WORKSTATE_FORBIDDEN');
                if (state === 'DONE' && p?.force !== true) {
                    const d = domains().find((x) => x.type === r.type);
                    const missing = Object.entries(d?.subjectFields || {}).filter(([k, f]) => f?.required && (r.data?.[k] === undefined || r.data?.[k] === null || String(r.data?.[k]).trim() === '')).map(([k, f]) => String(f?.label || k));
                    if (missing.length)
                        return { id, state: null, needsConfirm: true, missing };
                }
                const w = await core.entities.get(sid(id)).catch(() => null);
                const at = new Date(now()).toISOString();
                const hist = [...((w?.data?.history) || []), { state, at, by: ctx.actorId, ...(p?.waitingFor ? { waitingFor: String(p.waitingFor).slice(0, 200) } : {}) }].slice(-50);
                const data = { ref: core.deepLinks.build({ kind: 'ENTITY', type: r.type, id: r.id }), targetId: r.id, targetType: r.type, ownerApp: r.ownerApp, state, waitingFor: state === 'WAITING' ? String(p?.waitingFor || '').slice(0, 200) : '', editedAfterDone: false, lastTouchedAt: at, changedAt: at, history: hist };
                await core.entities.save(w ? { ...w, expectedRevision: w.revision, data } : { id: sid(id), type: TYPE, ownerApp: OWNER, schema: 'KX.WORKSTATE/1', spaceIds: r.spaceIds || [], data }, { ...ctx, appCode: OWNER });
                return { id, state };
            },
            /* automatic: after a successful write of a hub record → IN PROGRESS (if none); DONE → edited after done; else touched */
            async touch(id, ctx) {
                const r = await core.entities.get(id).catch(() => null);
                if (!r || r.archivedAt || INTERNAL.test(String(r.type)) || r.type === TYPE)
                    return;
                const w = await core.entities.get(sid(id)).catch(() => null);
                const at = new Date(now()).toISOString();
                if (!w) {
                    await core.entities.save({ id: sid(id), type: TYPE, ownerApp: OWNER, schema: 'KX.WORKSTATE/1', spaceIds: r.spaceIds || [], data: { ref: core.deepLinks.build({ kind: 'ENTITY', type: r.type, id: r.id }), targetId: r.id, targetType: r.type, ownerApp: r.ownerApp, state: 'IN_PROGRESS', waitingFor: '', editedAfterDone: false, lastTouchedAt: at, changedAt: at, history: [{ state: 'IN_PROGRESS', at, by: ctx.actorId, auto: true }] } }, { ...ctx, appCode: OWNER });
                    return;
                }
                await core.entities.save({ ...w, expectedRevision: w.revision, data: { ...w.data, lastTouchedAt: at, editedAfterDone: w.data.state === 'DONE' ? true : !!w.data.editedAfterDone } }, { ...ctx, appCode: OWNER });
            },
            /* the main screen: in progress (+ waiting + drafts) grouped Company / Family / Personal; forgotten > 14 days */
            async inProgress(p, ctx) {
                const want = new Set(Array.isArray(p?.states) && p.states.length ? p.states : ['DRAFT', 'IN_PROGRESS', 'WAITING']);
                const out = [];
                const t0 = now();
                for (const w of await core.entities.list()) {
                    if (w.type !== TYPE || w.archivedAt || !want.has(w.data?.state))
                        continue;
                    const r = await core.entities.get(w.data.targetId).catch(() => null);
                    if (!r || r.archivedAt || !await readable(r, ctx.actorId))
                        continue;
                    out.push({ id: r.id, ref: w.data.ref, title: title(r), hub: r.ownerApp, state: w.data.state, waitingFor: w.data.waitingFor || '', lastTouchedAt: w.data.lastTouchedAt, forgotten: t0 - new Date(w.data.lastTouchedAt).getTime() > 14 * 86400000, group: await group(r) });
                }
                for (const t of await core.tasks.list().catch(() => [])) {
                    const st = TASK_MAP[t.status]; /* a task not done is in progress until Done (TODO included – the persons rule) */
                    if (!st || !want.has(st) || t.archivedAt)
                        continue;
                    if (!(t.assigneeIds || []).includes(ctx.actorId) && t.createdBy !== ctx.actorId)
                        continue;
                    out.push({ id: t.id, ref: core.deepLinks.build({ kind: 'TASK', id: t.id }), title: String(t.title || ''), hub: t.ownerApp, state: st, waitingFor: '', lastTouchedAt: t.updatedAt || t.createdAt, forgotten: t0 - new Date(t.updatedAt || t.createdAt).getTime() > 14 * 86400000, group: await group(t), task: true });
                }
                return out.sort((a, b) => String(b.lastTouchedAt).localeCompare(String(a.lastTouchedAt)));
            },
            /* the LAST N THINGS I DID – all states, from the audit (my writes, not reading), one row per thing */
            async recent(p, ctx) {
                const pr = (await prefs(ctx.actorId)).data;
                const lim = LIMITS.includes(Number(p?.limit)) ? Number(p.limit) : pr.recentLimit;
                const seen = new Set();
                const out = [];
                const aud = (await core.audit.list()).filter((a) => a.actorId === ctx.actorId && a.result === 'OK' && a.entityId && !TECHNICAL.test(String(a.entityType || ''))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
                for (const a of aud) {
                    if (seen.has(a.entityId))
                        continue;
                    seen.add(a.entityId);
                    const r = await core.entities.get(a.entityId).catch(() => null) || await core.tasks.get(a.entityId).catch(() => null) || await core.calendar.get(a.entityId).catch(() => null);
                    if (!r || r.archivedAt && false)
                        continue;
                    if (r.type && TECHNICAL.test(String(r.type)))
                        continue;
                    if (r.type && !await readable(r, ctx.actorId))
                        continue;
                    const st = await svc.get({ id: r.id });
                    out.push({ id: r.id, ref: r.type ? core.deepLinks.build({ kind: 'ENTITY', type: r.type, id: r.id }) : core.deepLinks.build({ kind: 'TASK', id: r.id }), title: title(r), hub: r.ownerApp, state: st.state, at: a.at, action: a.actionCode, group: await group(r), task: !r.type });
                    if (out.length >= lim)
                        break;
                }
                return { limit: lim, items: out };
            },
            async prefs(p, ctx) { return (await prefs(ctx.actorId)).data; },
            async setPrefs(p, ctx) {
                const u = ctx.actorId;
                const { row, data } = await prefs(u);
                const d = { ...data };
                if (typeof p?.includeInProgress === 'boolean')
                    d.includeInProgress = p.includeInProgress;
                if (typeof p?.includeDrafts === 'boolean')
                    d.includeDrafts = p.includeDrafts;
                if (p?.recentLimit !== undefined) {
                    if (!LIMITS.includes(Number(p.recentLimit)))
                        throw new Error('WORKSTATE_LIMIT_INVALID');
                    d.recentLimit = Number(p.recentLimit);
                }
                const sp = ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
                await core.entities.save(row ? { ...row, expectedRevision: row.revision, data: d } : { id: `${PREFS}.${String(u).replace(/[^A-Z0-9_.]/gi, '_')}`, type: PREFS, ownerApp: OWNER, schema: 'KX.WORKSTATE_PREFS/1', spaceIds: [sp], data: d }, { ...ctx, appCode: OWNER });
                return d;
            },
            /* counting in totals: does this record count, by the person's choice? (+ how many were left out – shown next to a total) */
            async countFilter(p, ctx) {
                const pr = (await prefs(ctx.actorId)).data;
                const ids = (p?.ids || []).map(String);
                let excluded = 0, inProgress = 0, drafts = 0;
                const keep = [];
                for (const id of ids) {
                    const st = (await svc.get({ id })).state;
                    if (st === 'DRAFT') {
                        drafts++;
                        if (!pr.includeDrafts) {
                            excluded++;
                            continue;
                        }
                    }
                    if (st === 'IN_PROGRESS' || st === 'WAITING') {
                        inProgress++;
                        if (!pr.includeInProgress) {
                            excluded++;
                            continue;
                        }
                    }
                    keep.push(id);
                }
                return { keep, excluded, inProgress, drafts, includeInProgress: pr.includeInProgress, includeDrafts: pr.includeDrafts };
            } };
        try {
            core.actions.observe('KX.WORKSTATE.AUTO', async (def, payload, result, ctx) => {
                const risk = core.actions.list?.().find((x) => x.code === def.code)?.risk;
                if (!risk || risk === 'READ')
                    return;
                if (/^ACTION\.CORE\.(WORKSTATE|KAIRA|BLACKBOX|RESTORE|AUDIT|IDENT|LINK|POKE|NOTIFICATION)\b/.test(def.code))
                    return;
                const id = result?.id || result?.entity?.id || result?.record?.id;
                if (!id)
                    return;
                try {
                    await svc.touch(String(id), ctx);
                }
                catch { }
            });
        }
        catch { }
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.WORKSTATE.GET', 'READ', (p) => svc.get(p));
        reg('ACTION.CORE.WORKSTATE.SET', 'SAFE_WRITE', (p, c) => svc.set(p, c));
        reg('ACTION.CORE.WORKSTATE.IN_PROGRESS', 'READ', (p, c) => svc.inProgress(p, c));
        reg('ACTION.CORE.WORKSTATE.RECENT', 'READ', (p, c) => svc.recent(p, c));
        reg('ACTION.CORE.WORKSTATE.PREFS', 'READ', (p, c) => svc.prefs(p, c));
        reg('ACTION.CORE.WORKSTATE.PREFS.SET', 'SAFE_WRITE', (p, c) => svc.setPrefs(p, c));
        reg('ACTION.CORE.WORKSTATE.COUNT_FILTER', 'READ', (p, c) => svc.countFilter(p, c));
        core.workState = svc;
        return svc;
    }
    KXWorkState = { install, STATES, LIMITS };
    globalThis.KXWorkState = KXWorkState;
})();
