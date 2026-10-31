// N2.5a: rights per section – member role (PARENT / CHILD) and a level per hub (HIDDEN / READ / EDIT) by role, with per-user overrides.
// Enforced IN THE CORE: the owner read gate (search, inspector, hub kit, tree) and an action guard (writes) – not only hidden in menus.
// Default: parents everything; children everything EXCEPT the hidden list (Finance, Vault, People & work, Subscriptions, Contracts).
// Only parents change roles / rights; never through the API / MCP / AI (forbidden there).
var KXAccess;
(function () {
    const LEVELS = ['HIDDEN', 'READ', 'EDIT'];
    const ROLES = ['PARENT', 'CHILD'];
    const ID = 'CORE.ACCESS.CURRENT', T = 'CORE.ACCESS', OWNER = 'APP.KX.NEXUS';
    /* default for children (user 2026-10-24): company OFF, bank accounts / payments OFF, sensitive data OFF; contacts (core), school, home,
       games, media, SOS … stay visible. Parents switch anything on per hub / tab / folder / file / feature and per child.
       (N2.5a fix: „APP.KX.PEOPLE“ never existed – „Lidé a práce“ is APP.KX.HR.) */
    const CHILD_HIDDEN = [
        /* money */ 'APP.KX.FINANCE', 'APP.KX.SUBSCRIPTIONS', 'APP.KX.ASSETS',
        /* company */ 'APP.KX.SHOP', 'APP.KX.SALES', 'APP.KX.PURCHASE', 'APP.KX.STOCK', 'APP.KX.INVENTORY', 'APP.KX.SHIPPING', 'APP.KX.RENTAL', 'APP.KX.SERVICE', 'APP.KX.BUILD', 'APP.KX.ADS', 'APP.KX.HR', 'APP.KX.TIME', 'APP.KX.CONTRACTS', 'APP.KX.CERTIFY', 'APP.KX.LASER', 'APP.KX.PRINT', 'APP.KX.PRINT3D',
        /* sensitive */ 'APP.KX.HEALTH', 'APP.KX.VAULT', 'APP.KX.IDENTITY',
        /* system */ 'APP.KX.INSIGHT', 'APP.KX.ARCHIVE', 'APP.KX.DATA', 'APP.KX.DEV', 'APP.KX.BACKUP', 'APP.KX.AUTOMATE', 'APP.KX.CONNECT', 'APP.KX.LAB'
    ];
    /* the seeded family of the core (users of the core seed) – a new user is an adult until a parent sets the role */
    const SEED_ROLES = { 'USER.LUKAS': 'PARENT', 'USER.HELENA': 'PARENT', 'USER.LUKYN': 'CHILD', 'USER.VERONIKA': 'CHILD', 'USER.SUPERADMIN': 'PARENT' };
    const CORE_OWNERS = ['APP.NEXUS', 'APP.KX.NEXUS'];
    /* N2.5a: ONE superadmin above parents and the company (user decision): sees everything – rights never hide anything from them;
       reads of protected hubs are audited (once per hub per 10 min); PINs / vault secrets stay unreadable for everyone (technical). */
    /* N2.5a (user 2026-10-24): rights also for sub-hubs / tabs, folders, files and features (chat, Kaira, export, share, delete …).
       Keys: APP.X (hub) · APP.X#TAB:Y (sub-hub / tab – inherits the hub) · FOLDER:<id> · FILE:<id> (inherits its folder if given) · FEATURE:<NAME>.
       The most specific setting wins; without one the parent applies (tab → hub, file → folder → its hub). */
    const KEY = /^(APP\.[A-Z0-9_.]+(#TAB:[A-Z0-9_.-]+)?|FOLDER:[A-Za-z0-9_.:-]+|FILE:[A-Za-z0-9_.:-]+|FEATURE:[A-Z_]+)$/;
    const FEATURES = ['CHAT', 'AI', 'EXPORT', 'SHARE', 'DELETE', 'PRINT', 'IMPORT', 'API'];
    /* the superadmin is a SEPARATE account (user 2026-10-24) – Lukáš keeps his own parent account; own PIN; not used day to day */
    /* features enforced IN THE CORE (only EDIT may trigger them): which actions belong to a feature. PRINT has no core actions
       (browser print – UI only); a bare „PRINT“ match would wrongly hit 3D printers (ACTION.PRINT3D_…). */
    const FEATURE_ACTIONS = {
        EXPORT: (d) => /(^|\.)[A-Z_]*EXPORT[A-Z_]*(\.|$)/.test(d.code),
        IMPORT: (d) => /(^|\.)[A-Z_]*IMPORT[A-Z_]*(\.|$)/.test(d.code),
        SHARE: (d) => /(^|\.)[A-Z_]*SHARE[A-Z_]*(\.|$)/.test(d.code) && !/^ACTION\.CORE\.SHARING\./.test(d.code),
        DELETE: (d) => d.risk === 'DESTRUCTIVE' || /(^|\.)(DELETE|PURGE)[A-Z_]*(\.|$)/.test(d.code) || /[A-Z]_DELETE(\.|$)/.test(d.code),
        AI: (d) => /^ACTION\.CORE\.AI\./.test(d.code),
        API: (d) => /^ACTION\.CORE\.API\./.test(d.code)
    };
    const SEED_SUPERADMIN = 'USER.SUPERADMIN';
    const AUDIT_EVERY = 10 * 60000;
    function install(core) {
        if (core.hubRights)
            return core.hubRights;
        let cache = null;
        const C = (ctx) => ({ actorId: ctx?.actorId || 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true });
        const load = async () => { if (cache)
            return cache; try {
            const r = await core.entities.get(ID);
            cache = r?.data || { roles: {}, byRole: {}, byUser: {} };
        }
        catch {
            cache = { roles: {}, byRole: {}, byUser: {} };
        } return cache; };
        const save = async (data, ctx) => { const old = await core.entities.get(ID).catch(() => null); const r = await core.entities.save({ id: ID, type: T, ownerApp: OWNER, schema: 'KX.ACCESS/1', spaceIds: [], expectedRevision: old?.revision, data }, C(ctx)); cache = r.data; return cache; };
        const lastAudit = new Map();
        const svc = { LEVELS, ROLES, CHILD_HIDDEN,
            async superadmin() { const d = await load(); return d.superadmin === undefined ? SEED_SUPERADMIN : d.superadmin; },
            async isSuperadmin(userId) { return !!userId && (await svc.superadmin()) === userId; },
            async roleOf(userId) { const d = await load(); return d.roles?.[userId] || SEED_ROLES[userId] || 'PARENT'; },
            /* any key: own setting (user → role) → parent key → default */
            async levelOf(userId, key, parent) {
                if (!userId || userId === 'SYSTEM')
                    return 'EDIT'; /* a whole hub = the hub rule (incl. the children defaults) */
                if (/^APP\./.test(key) && !key.includes('#TAB:'))
                    return svc.levelFor(userId, key);
                if (await svc.isSuperadmin(userId))
                    return 'EDIT';
                const d = await load();
                const u = d.byUser?.[userId]?.[key];
                if (LEVELS.includes(u))
                    return u;
                const role = await svc.roleOf(userId);
                const r = d.byRole?.[role]?.[key];
                if (LEVELS.includes(r))
                    return r;
                if (key.includes('#TAB:'))
                    return svc.levelFor(userId, key.split('#TAB:')[0]);
                if (parent)
                    return /^(FOLDER|FILE):/.test(parent) ? svc.levelOf(userId, parent) : svc.levelFor(userId, parent);
                return 'EDIT';
            },
            async feature(userId, name) { return svc.levelOf(userId, 'FEATURE:' + String(name).toUpperCase()); },
            async levelFor(userId, hub) {
                if (!userId || userId === 'SYSTEM' || !hub || CORE_OWNERS.includes(hub))
                    return 'EDIT';
                if (await svc.isSuperadmin(userId))
                    return 'EDIT';
                if (hub.includes('#TAB:'))
                    return svc.levelOf(userId, hub);
                const d = await load();
                const u = d.byUser?.[userId]?.[hub];
                if (LEVELS.includes(u))
                    return u;
                const role = await svc.roleOf(userId);
                const r = d.byRole?.[role]?.[hub];
                if (LEVELS.includes(r))
                    return r;
                return role === 'CHILD' && CHILD_HIDDEN.includes(hub) ? 'HIDDEN' : 'EDIT';
            },
            async matrix() { const d = await load(); return { superadmin: await svc.superadmin(), roles: { ...SEED_ROLES, ...(d.roles || {}) }, byRole: d.byRole || {}, byUser: d.byUser || {}, childHidden: CHILD_HIDDEN, levels: LEVELS }; },
            async setRole(p, ctx) {
                if (!ROLES.includes(p?.role))
                    throw new Error('ACCESS_ROLE');
                if (!/^USER\./.test(String(p?.userId || '')))
                    throw new Error('ACCESS_USER');
                if (p.userId === ctx.actorId && p.role !== 'PARENT')
                    throw new Error('ACCESS_SELF_DEMOTE');
                if (p.role === 'CHILD' && await svc.isSuperadmin(p.userId))
                    throw new Error('ACCESS_SUPERADMIN_NOT_CHILD');
                const d = JSON.parse(JSON.stringify(await load()));
                d.roles = { ...(d.roles || {}), [p.userId]: p.role };
                return save(d, ctx);
            },
            async setLevel(p, ctx) {
                if (!LEVELS.includes(p?.level) && p?.level !== null)
                    throw new Error('ACCESS_LEVEL');
                if (!KEY.test(String(p?.hub || '')) || CORE_OWNERS.includes(p.hub))
                    throw new Error('ACCESS_HUB');
                if (/^FEATURE:/.test(p.hub) && !FEATURES.includes(p.hub.slice(8)))
                    throw new Error('ACCESS_FEATURE');
                const d = JSON.parse(JSON.stringify(await load()));
                const key = p.scope === 'USER' ? 'byUser' : 'byRole';
                if (p.scope === 'USER' ? !/^USER\./.test(String(p.key)) : !ROLES.includes(p.key))
                    throw new Error('ACCESS_SCOPE');
                d[key] = d[key] || {};
                d[key][p.key] = d[key][p.key] || {};
                if (p.level === null)
                    delete d[key][p.key][p.hub];
                else
                    d[key][p.key][p.hub] = p.level;
                return save(d, ctx);
            },
            /* transfer: only the current superadmin (or a parent when none is set); never a child */
            async setSuperadmin(p, ctx) {
                const cur = await svc.superadmin();
                if (cur && cur !== ctx.actorId)
                    throw new Error('ACCESS_ONLY_SUPERADMIN');
                if (!cur && (await svc.roleOf(ctx.actorId)) !== 'PARENT')
                    throw new Error('ACCESS_ONLY_PARENTS');
                if (!/^USER\./.test(String(p?.userId || '')) || (await svc.roleOf(p.userId)) === 'CHILD')
                    throw new Error('ACCESS_SUPERADMIN_ADULT');
                const d = JSON.parse(JSON.stringify(await load()));
                d.superadmin = p.userId;
                return save(d, ctx);
            },
            /* explicit, audited: the superadmin becomes MANAGE member of every space (other people's personal spaces too) – never silently */
            async grantAllSpaces(ctx) {
                const sa = await svc.superadmin();
                if (!sa || sa !== ctx.actorId)
                    throw new Error('ACCESS_ONLY_SUPERADMIN');
                let n = 0;
                for (const sp of await core.memberships.listSpaces()) {
                    const r = await core.memberships.roleFor(sp.id, sa);
                    if (r === 'OWNER' || r === 'MANAGE')
                        continue;
                    await core.memberships.setMembership(sp.id, sa, 'MANAGE', { actorId: sa, appCode: OWNER, permissions: [], confirmed: true });
                    n++;
                }
                return { granted: n };
            },
            reset() { cache = null; } };
        /* read: hidden hubs are not readable anywhere (search, inspector, hub kit, tree) */
        try {
            core.ownerReadGate.also('KX.ACCESS', async (owner, actor) => {
                const ok = (await svc.levelFor(actor, owner)) !== 'HIDDEN';
                /* the superadmin reading a protected hub – audited once per hub per 10 minutes */
                if (ok && core.identity?.isProtected?.(owner) && await svc.isSuperadmin(actor)) {
                    const k = actor + '|' + owner, now = Date.now();
                    if ((lastAudit.get(k) || 0) + AUDIT_EVERY < now) {
                        lastAudit.set(k, now);
                        try {
                            await core.audit.write({ actorId: actor, appCode: OWNER, actionCode: 'AUDIT.SUPERADMIN.SENSITIVE_READ', entityType: 'HUB', entityId: owner, rootChangeId: 'SUPERADMIN.' + now, result: 'OK', detail: { hub: owner } });
                        }
                        catch { }
                    }
                }
                return ok;
            });
        }
        catch { }
        /* write: hidden → nothing, read-only → only READ actions; changing rights → parents only */
        try {
            core.actions.addGuard('KX.ACCESS', async (def, ctx) => {
                const actor = ctx?.actorId;
                if (!actor || actor === 'SYSTEM')
                    return;
                if (/^ACTION\.CORE\.ACCESS\./.test(def.code) && def.risk !== 'READ' && (await svc.roleOf(actor)) !== 'PARENT' && !(await svc.isSuperadmin(actor)))
                    throw new Error('ACCESS_ONLY_PARENTS');
                const lvl = await svc.levelFor(actor, def.ownerApp);
                if (lvl === 'HIDDEN')
                    throw new Error(`HUB_ACCESS_HIDDEN ${def.ownerApp}`);
                if (lvl === 'READ' && def.risk !== 'READ')
                    throw new Error(`HUB_ACCESS_READ_ONLY ${def.ownerApp}`);
                /* exports (user 2026-10-24): a child exports only own + shared data – never the whole workspace (sync export) */
                if (/^ACTION\.CORE\.SYNC\.EXPORT$/.test(def.code) && (await svc.roleOf(actor)) === 'CHILD')
                    throw new Error('EXPORT_WHOLE_WORKSPACE_PARENTS_ONLY');
                /* features: only EDIT may trigger export / import / share / delete / Kaira / API actions */
                if (!/^ACTION\.CORE\.ACCESS\./.test(def.code))
                    for (const [f, match] of Object.entries(FEATURE_ACTIONS)) {
                        if (match(def) && (await svc.feature(actor, f)) !== 'EDIT')
                            throw new Error(`FEATURE_OFF ${f}`);
                    }
            });
        }
        catch { }
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.ACCESS.MATRIX', 'READ', () => svc.matrix());
        reg('ACTION.CORE.ACCESS.SET_ROLE', 'SENSITIVE_WRITE', (p, c) => svc.setRole(p, c));
        reg('ACTION.CORE.ACCESS.SET_LEVEL', 'SENSITIVE_WRITE', (p, c) => svc.setLevel(p, c));
        reg('ACTION.CORE.ACCESS.SET_SUPERADMIN', 'SENSITIVE_WRITE', (p, c) => svc.setSuperadmin(p, c));
        reg('ACTION.CORE.ACCESS.SUPERADMIN.ALL_SPACES', 'SENSITIVE_WRITE', (_p, c) => svc.grantAllSpaces(c));
        /* the superadmin account exists (part of the default model, like the family seed) */
        void (async () => {
            try {
                if (!await core.memberships.getUser(SEED_SUPERADMIN) && typeof core.memberships.upsertUser === 'function')
                    await core.memberships.upsertUser({ id: SEED_SUPERADMIN, displayName: 'Superadmin' }, { actorId: 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true });
                /* sign-in with a PIN needs the account's own personal space (as every member has) */ if (!await core.memberships.getSpace('SPACE.PERSONAL.SUPERADMIN') && typeof core.memberships.upsertSpace === 'function')
                    await core.memberships.upsertSpace({ id: 'SPACE.PERSONAL.SUPERADMIN', name: 'Osobní · Superadmin', kind: 'PERSONAL', ownerUserId: SEED_SUPERADMIN }, { actorId: 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true });
            }
            catch { }
        })();
        /* N2.5p (user): the superadmin passes every record check; an opened private record of someone else is noted once per session in the black box */
        try {
            if (core.access && 'superadminCheck' in core.access) {
                const seen = new Set();
                core.access.superadminCheck = async (u, target) => { if (!await svc.isSuperadmin(u))
                    return false; const k = String(target?.id || ''); if (k && !seen.has(k)) {
                    seen.add(k);
                    try {
                        await core.blackbox?.log('NOTE', { actorId: u, text: 'SUPERADMIN_VIEW', detail: { target: k, ownerApp: target?.ownerApp } });
                    }
                    catch { }
                } return true; };
            }
        }
        catch { }
        core.hubRights = svc;
        return svc;
    }
    KXAccess = { LEVELS, ROLES, CHILD_HIDDEN, SEED_ROLES, FEATURES, KEY, FEATURE_ACTIONS, install };
    globalThis.KXAccess = KXAccess;
})();
