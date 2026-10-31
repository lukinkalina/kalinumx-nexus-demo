// N2.1u (huby: skrýt / pozastavit / odpojit bez ztráty dat) — KX.CORE_APP_STATES/1.
//  - HIDDEN (per user): the hub is not offered (launcher, panes, navigation helpers); nothing else changes;
//  - PAUSED (workspace, family manager): the hub's data stay readable, every non-READ action of the hub is refused;
//  - DETACHED (workspace, family manager): every action of the hub is refused and its views are not mounted; the data
//    stay untouched in the repository and keep travelling with sync; re-attaching restores everything as it was;
//  - nothing in this service ever reads, rewrites or deletes hub records; the Core / NEXUS shell itself cannot be
//    paused or detached; every workspace change is kept in a history (who, when, from → to, reason).
var KXAppStates;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_APP_STATES/1', TYPE = 'CORE.APP_STATES';
    const STATES = ['ACTIVE', 'PAUSED', 'DETACHED'];
    const CODE_RE = /^APP\.[A-Z0-9_.]{2,80}$/;
    const PROTECTED = new Set([OWNER, 'APP.NEXUS', 'APP.KX.CORE']);
    class AppStateService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        async wsRow() { const r = await this.core.repository.get('entities', 'APPSTATES.WORKSPACE'); return r && r.type === TYPE && !r.archivedAt ? r : null; }
        async userRow(actorId) { const r = await this.core.entities.get(`APPSTATES.USER.${actorId}`); return r && r.type === TYPE && !r.archivedAt ? r : null; }
        async workspaceState(code) { const r = await this.wsRow(); return r?.data?.apps?.[code]?.state || 'ACTIVE'; }
        async state(actorId) {
            const ws = await this.wsRow(), u = await this.userRow(actorId);
            const apps = ws?.data?.apps || {};
            const hidden = u?.data?.hidden || [];
            return { workspace: Object.fromEntries(Object.entries(apps).map(([k, v]) => [k, v.state])), hidden, history: (ws?.data?.history || []).slice(-50),
                effective: (code) => apps[code]?.state === 'DETACHED' ? 'DETACHED' : apps[code]?.state === 'PAUSED' ? 'PAUSED' : hidden.includes(code) ? 'HIDDEN' : 'ACTIVE' };
        }
        async summary(actorId) { const s = await this.state(actorId); return { workspace: s.workspace, hidden: s.hidden, history: s.history }; }
        async setHidden(input, ctx) {
            const code = String(input?.code || '');
            if (!CODE_RE.test(code))
                throw new Error('APP_CODE_INVALID');
            if (PROTECTED.has(code))
                throw new Error('APP_PROTECTED');
            const r = await this.userRow(ctx.actorId);
            const hidden = new Set(r?.data?.hidden || []);
            if (input?.hidden === false)
                hidden.delete(code);
            else
                hidden.add(code);
            let space = r?.spaceIds;
            if (!space) {
                const p = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === ctx.actorId && !x.archivedAt);
                if (!p)
                    throw new Error('APPS_NO_PERSONAL_SPACE');
                space = [p.id];
            }
            await this.core.entities.save({ id: `APPSTATES.USER.${ctx.actorId}`, type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_APP_STATES/1', spaceIds: space, expectedRevision: r?.revision || 0, data: { hidden: [...hidden].sort() } }, ctx);
            return this.summary(ctx.actorId);
        }
        async setWorkspaceState(input, ctx) {
            const code = String(input?.code || '');
            const state = String(input?.state || '');
            if (!CODE_RE.test(code))
                throw new Error('APP_CODE_INVALID');
            if (!STATES.includes(state))
                throw new Error('APP_STATE_INVALID');
            if (PROTECTED.has(code))
                throw new Error('APP_PROTECTED');
            if (!ctx?.confirmed)
                throw new Error('Confirmation required: APP_STATE');
            let fam = null;
            for (const s of await this.core.memberships.listSpaces())
                if (s.kind === 'FAMILY' && !s.archivedAt && await this.core.memberships.roleFor(s.id, ctx.actorId) === 'MANAGE') {
                    fam = s;
                    break;
                }
            if (!fam && ctx.actorId !== 'SYSTEM')
                throw new Error('Scope denied: family manager required to pause / detach hubs');
            const r = await this.wsRow();
            const d = structuredClone(r?.data || { apps: {}, history: [] });
            const from = d.apps[code]?.state || 'ACTIVE';
            if (from === state)
                return this.summary(ctx.actorId);
            d.apps[code] = { state, since: new Date(this.now()).toISOString(), by: ctx.actorId, reason: String(input?.reason || '').slice(0, 300) };
            if (state === 'ACTIVE')
                delete d.apps[code];
            if (state !== 'ACTIVE')
                this.ensureGuard?.();
            d.history = [...(d.history || []), { code, from, to: state, at: new Date(this.now()).toISOString(), by: ctx.actorId, reason: String(input?.reason || '').slice(0, 300) }].slice(-500);
            await this.core.entities.save({ id: 'APPSTATES.WORKSPACE', type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_APP_STATES/1', spaceIds: r?.spaceIds || [fam?.id || 'SPACE.FAMILY'], expectedRevision: r?.revision || 0, data: d }, ctx);
            return this.summary(ctx.actorId);
        }
        // how many records a hub owns (shown so the user sees nothing is lost)
        async dataCount(code) { let n = 0; for (const st of ['entities', 'tasks', 'calendarEvents', 'files', 'documents'])
            for (const r of await this.core.repository.all(st))
                if (r.ownerApp === code && !r.archivedAt)
                    n++; return n; }
    }
    NS.CONTRACT = CONTRACT;
    NS.STATES = STATES;
    NS.AppStateService = AppStateService;
    NS.install = (core, options = {}) => {
        if (core.appStates)
            throw new Error('App states already installed');
        if (typeof core?.actions?.addGuard !== 'function')
            throw new Error('APP_STATES_GUARD_UNAVAILABLE');
        const svc = new AppStateService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.APPS.STATE', 'READ', (_p, c) => svc.summary(c.actorId)], ['ACTION.CORE.APPS.HIDE', 'SAFE_WRITE', (p, c) => svc.setHidden(p, c)],
            ['ACTION.CORE.APPS.SET_WORKSPACE_STATE', 'SENSITIVE_WRITE', (p, c) => svc.setWorkspaceState(p, c)], ['ACTION.CORE.APPS.DATA_COUNT', 'READ', async (p) => ({ code: p?.code, count: await svc.dataCount(String(p?.code || '')) })]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            // the guard is only active while some hub is paused / detached (no extra read per action otherwise); it is
            // enabled immediately when such a state is set and at start-up when one is already stored (svc.ready)
            let guarded = false;
            const ensureGuard = () => {
                if (guarded)
                    return;
                guarded = true;
                core.actions.addGuard('CORE.APP_STATES.GUARD', async (def) => {
                    if (!def?.ownerApp || PROTECTED.has(def.ownerApp))
                        return;
                    const st = await svc.workspaceState(def.ownerApp);
                    if (st === 'DETACHED')
                        throw new Error(`APP_DETACHED ${def.ownerApp}: hub je odpojený (data jsou zachovaná, připojte ho v Nastavení → Huby)`);
                    if (st === 'PAUSED' && def.risk !== 'READ')
                        throw new Error(`APP_PAUSED ${def.ownerApp}: hub je pozastavený – jen čtení`);
                });
            };
            svc.ensureGuard = ensureGuard;
            svc.ready = (async () => { const r = await core.repository.get('entities', 'APPSTATES.WORKSPACE'); if (r && !r.archivedAt && Object.keys(r.data?.apps || {}).length)
                ensureGuard(); })();
            core.appStates = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.appStates;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXAppStates || (KXAppStates = {}));
