var KXNavigationProfiles;
(function (NS) {
    const PROFILE_KEY = 'ui.navigation.profile.v1';
    const schemaVersion = 1;
    const uniq = (xs) => [...new Set((xs || []).map(String))];
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const allowedGroups = new Set(['CATEGORY', 'FLAT', 'SMART']);
    const profileKeys = ['mode', 'grouping', 'showRecent', 'showContextual', 'favorites', 'pinned', 'hidden', 'itemOrder', 'categoryOrder', 'categoryOverrides', 'activeCategory'];
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
    function canonicalProfile(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Navigation profile must be an object');
        const out = {};
        if (own(input, 'mode'))
            out.mode = String(input.mode);
        if (own(input, 'grouping')) {
            const v = String(input.grouping);
            if (!allowedGroups.has(v))
                throw new Error(`Unknown navigation grouping ${v}`);
            out.grouping = v;
        }
        if (own(input, 'showRecent'))
            out.showRecent = !!input.showRecent;
        if (own(input, 'showContextual'))
            out.showContextual = !!input.showContextual;
        for (const key of ['favorites', 'pinned', 'hidden', 'itemOrder', 'categoryOrder'])
            if (own(input, key))
                out[key] = uniq(input[key]);
        if (own(input, 'categoryOverrides')) {
            const map = {};
            if (!input.categoryOverrides || typeof input.categoryOverrides !== 'object' || Array.isArray(input.categoryOverrides))
                throw new Error('categoryOverrides must be an object');
            for (const [item, cats] of Object.entries(input.categoryOverrides))
                map[String(item)] = uniq(cats);
            out.categoryOverrides = map;
        }
        if (own(input, 'activeCategory'))
            out.activeCategory = input.activeCategory === null ? null : String(input.activeCategory);
        KXNavigation.validateProfile(out);
        const required = new Set((KXNavigation.contract().items || []).filter((x) => x.required).map((x) => x.itemCode));
        if (out.hidden)
            out.hidden = out.hidden.filter((x) => !required.has(x));
        return out;
    }
    function mergeProfiles(workspace = {}, user = {}) {
        const w = canonicalProfile(workspace || {}), u = canonicalProfile(user || {}), out = { ...w };
        for (const key of profileKeys) {
            if (!own(u, key))
                continue;
            if (key === 'categoryOverrides')
                out.categoryOverrides = { ...(w.categoryOverrides || {}), ...(u.categoryOverrides || {}) };
            else
                out[key] = clone(u[key]);
        }
        KXNavigation.validateProfile(out);
        return out;
    }
    class NavigationProfileService {
        settings;
        workspaceId;
        contract = 'KX.NEXUS_NAVIGATION_PROFILE/1';
        constructor(settings, workspaceId) {
            this.settings = settings;
            this.workspaceId = workspaceId;
        }
        async exact(scopeType, scopeId) {
            const rows = await this.settings.list(PROFILE_KEY), row = rows.find((x) => x.scopeType === scopeType && x.scopeId === scopeId);
            return row ? canonicalProfile(row.value || {}) : {};
        }
        assertReadScope(input, ctx) {
            if (!ctx || ctx.actorId === 'SYSTEM')
                return;
            if (input.userId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
                throw new Error('Navigation USER profile read scope mismatch');
            const workspaceId = input.workspaceId || this.workspaceId;
            if (this.workspaceId && workspaceId && workspaceId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
                throw new Error('Navigation WORKSPACE profile read scope mismatch');
        }
        async read(input, ctx) {
            this.assertReadScope(input, ctx);
            const workspaceId = input.workspaceId || this.workspaceId;
            const workspace = workspaceId ? await this.exact('WORKSPACE', workspaceId) : {};
            const user = await this.exact('USER', input.userId);
            const profile = mergeProfiles(workspace, user);
            return { contract: this.contract, schemaVersion, profile, workspaceProfile: workspace, userProfile: user, workspaceId: workspaceId || null, userId: input.userId, resolved: KXNavigation.resolve(profile, {}) };
        }
        async save(input, ctx) {
            if (!['USER', 'WORKSPACE'].includes(input.scopeType))
                throw new Error('Navigation profile supports USER or WORKSPACE scope only');
            if (input.scopeType === 'USER' && input.scopeId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
                throw new Error('Navigation USER profile scope mismatch');
            if (input.scopeType === 'WORKSPACE' && this.workspaceId && input.scopeId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
                throw new Error('Navigation WORKSPACE profile scope mismatch');
            const profile = canonicalProfile(input.profile);
            const row = await this.settings.set({ key: PROFILE_KEY, scopeType: input.scopeType, scopeId: input.scopeId, value: profile, updatedBy: ctx.actorId }, ctx);
            return { contract: this.contract, schemaVersion, profile, settingId: row.id, revision: row.revision, scopeType: input.scopeType, scopeId: input.scopeId };
        }
        async reset(input, ctx) {
            const removed = await this.settings.unset(PROFILE_KEY, input.scopeType, input.scopeId, ctx);
            return { contract: this.contract, removed, scopeType: input.scopeType, scopeId: input.scopeId };
        }
        baseOrder(profile, kind) {
            if (kind === 'ITEM')
                return KXNavigation.resolve(profile, {}).flat.map((x) => x.itemCode);
            const contract = KXNavigation.contract();
            const explicit = uniq(profile.categoryOrder || []), rest = (contract.categories || []).map((x) => x.code).filter((x) => !explicit.includes(x));
            return [...explicit, ...rest];
        }
        moved(order, code, beforeCode) {
            if (!order.includes(code))
                throw new Error(`Navigation drag item not found: ${code}`);
            const out = order.filter(x => x !== code);
            if (beforeCode === null || beforeCode === undefined || beforeCode === '') {
                out.push(code);
                return out;
            }
            const at = out.indexOf(beforeCode);
            if (at < 0)
                throw new Error(`Navigation drag target not found: ${beforeCode}`);
            out.splice(at, 0, code);
            return out;
        }
        async dragDrop(input, ctx) {
            this.assertReadScope({ userId: input.userId, workspaceId: input.workspaceId }, ctx);
            const effective = (await this.read({ userId: input.userId, workspaceId: input.workspaceId }, ctx)).profile;
            const exact = await this.exact(input.scopeType, input.scopeId), next = { ...exact };
            if (input.kind === 'ITEM_ORDER')
                next.itemOrder = this.moved(this.baseOrder(effective, 'ITEM'), input.code, input.beforeCode);
            else if (input.kind === 'CATEGORY_ORDER')
                next.categoryOrder = this.moved(this.baseOrder(effective, 'CATEGORY'), input.code, input.beforeCode);
            else {
                const contract = KXNavigation.contract(), items = new Set((contract.items || []).map((x) => x.itemCode)), cats = new Set((contract.categories || []).map((x) => x.code));
                if (!items.has(input.code))
                    throw new Error(`Unknown navigation item ${input.code}`);
                const target = uniq(input.categoryCodes?.length ? input.categoryCodes : (input.categoryCode ? [input.categoryCode] : []));
                if (!target.length)
                    throw new Error('ITEM_CATEGORY requires categoryCode(s)');
                for (const c of target)
                    if (!cats.has(c))
                        throw new Error(`Unknown navigation category ${c}`);
                next.categoryOverrides = { ...(exact.categoryOverrides || {}), [input.code]: target };
            }
            return this.save({ scopeType: input.scopeType, scopeId: input.scopeId, profile: next }, ctx);
        }
    }
    function install(runtime, workspaceId) {
        const service = new NavigationProfileService(runtime.settings, workspaceId || runtime.workspaceProfile?.id);
        runtime.navigationProfiles = service;
        const existing = new Set(runtime.actions.list().map((x) => x.code));
        if (!existing.has('ACTION.CORE.NAVIGATION.PROFILE.READ'))
            runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.PROFILE.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: (p, ctx) => service.read(p, ctx) });
        if (!existing.has('ACTION.CORE.NAVIGATION.PROFILE.SAVE'))
            runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.PROFILE.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.save(p, ctx) });
        if (!existing.has('ACTION.CORE.NAVIGATION.PROFILE.DRAG_DROP'))
            runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.PROFILE.DRAG_DROP', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.dragDrop(p, ctx) });
        if (!existing.has('ACTION.CORE.NAVIGATION.PROFILE.RESET'))
            runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.PROFILE.RESET', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.reset(p, ctx) });
        return service;
    }
    NS.PROFILE_KEY = PROFILE_KEY;
    NS.canonicalProfile = canonicalProfile;
    NS.mergeProfiles = mergeProfiles;
    NS.NavigationProfileService = NavigationProfileService;
    NS.install = install;
})(KXNavigationProfiles || (KXNavigationProfiles = {}));
