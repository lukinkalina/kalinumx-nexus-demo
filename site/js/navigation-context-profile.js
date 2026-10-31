var KXNavigationContextProfiles;
(function (NS) {
    const CONTRACT_KEY = 'KX.NEXUS_NAVIGATION_CONTEXT_PROFILE/1';
    const ACTIVE_KEY = 'ui.navigation.context.active.v1';
    const MEMBERSHIP_KEY = 'ui.navigation.context.memberships.v1';
    const WORK_PROFILE_KEY = 'ui.navigation.context.work.profile.v1';
    const HOME_PROFILE_KEY = 'ui.navigation.context.home.profile.v1';
    const contexts = new Set(['WORK', 'HOME', 'ALL']);
    const memberships = new Set(['WORK', 'HOME', 'BOTH']);
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const contract = () => KX_NAVIGATION_CONTEXT_CONTRACT || {};
    const itemCodes = () => new Set((KXNavigation.contract().items || []).map((x) => String(x.itemCode)));
    const defaultMemberships = () => Object.fromEntries((contract().defaults || []).map((x) => [String(x.itemCode), String(x.membership)]));
    function normalizeContext(value) { const v = String(value || 'ALL').toUpperCase(); if (!contexts.has(v))
        throw new Error(`Unknown navigation context ${v}`); return v; }
    function normalizeMembership(value) { const v = String(value || '').toUpperCase(); if (!memberships.has(v))
        throw new Error(`Unknown navigation membership ${v}`); return v; }
    function canonicalMembershipMap(input = {}) { if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Navigation memberships must be an object'); const valid = itemCodes(), out = {}; for (const [item, value] of Object.entries(input)) {
        if (!valid.has(String(item)))
            throw new Error(`Unknown navigation item ${item}`);
        out[String(item)] = normalizeMembership(value);
    } return out; }
    function mergeStates(workspace = {}, user = {}) {
        const profiles = {};
        for (const ctx of ['WORK', 'HOME'])
            profiles[ctx] = KXNavigationProfiles.mergeProfiles(workspace.profiles?.[ctx] || {}, user.profiles?.[ctx] || {});
        profiles.ALL = {};
        return { activeContext: normalizeContext(user.activeContext || workspace.activeContext || contract().defaultActiveContext || 'ALL'), memberships: { ...defaultMemberships(), ...(workspace.memberships || {}), ...(user.memberships || {}) }, profiles };
    }
    function includesMembership(contextCode, membership) { return contextCode === 'ALL' || membership === 'BOTH' || membership === contextCode; }
    function profileForContext(base, state, contextCode) {
        const ctx = normalizeContext(contextCode);
        if (ctx === 'ALL')
            return KXNavigationProfiles.canonicalProfile(base || {});
        const overlay = state.profiles?.[ctx] || {}, merged = KXNavigationProfiles.mergeProfiles(base || {}, overlay || {}), hiddenByContext = Object.entries(state.memberships || {}).filter(([, m]) => !includesMembership(ctx, String(m))).map(([code]) => code), hidden = [...new Set([...(merged.hidden || []), ...hiddenByContext])];
        return KXNavigationProfiles.canonicalProfile({ ...merged, hidden });
    }
    class NavigationContextProfileService {
        settings;
        navigationProfiles;
        workspaceId;
        contract = CONTRACT_KEY;
        constructor(settings, navigationProfiles, workspaceId) {
            this.settings = settings;
            this.navigationProfiles = navigationProfiles;
            this.workspaceId = workspaceId;
        }
        assertScope(scopeType, scopeId, ctx) { if (!ctx || ctx.actorId === 'SYSTEM')
            return; if (scopeType === 'USER' && scopeId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('Navigation context USER scope mismatch'); if (scopeType === 'WORKSPACE' && this.workspaceId && scopeId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('Navigation context WORKSPACE scope mismatch'); }
        async value(key, scopeType, scopeId) { const rows = await this.settings.list(key), row = rows.find((x) => x.scopeType === scopeType && x.scopeId === scopeId); return row?.value; }
        async exact(scopeType, scopeId) {
            const [active, membership, work, home] = await Promise.all([this.value(ACTIVE_KEY, scopeType, scopeId), this.value(MEMBERSHIP_KEY, scopeType, scopeId), this.value(WORK_PROFILE_KEY, scopeType, scopeId), this.value(HOME_PROFILE_KEY, scopeType, scopeId)]);
            return { activeContext: active ? normalizeContext(active) : undefined, memberships: membership ? canonicalMembershipMap(membership) : {}, profiles: { WORK: work ? KXNavigationProfiles.canonicalProfile(work) : {}, HOME: home ? KXNavigationProfiles.canonicalProfile(home) : {} } };
        }
        async setValue(key, scopeType, scopeId, value, ctx) { this.assertScope(scopeType, scopeId, ctx); return this.settings.set({ key, scopeType, scopeId, value, updatedBy: ctx.actorId }, ctx); }
        async read(input, ctx) {
            if (ctx && ctx.actorId !== 'SYSTEM' && input.userId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
                throw new Error('Navigation context USER read scope mismatch');
            const workspaceId = input.workspaceId || this.workspaceId;
            if (ctx && ctx.actorId !== 'SYSTEM' && this.workspaceId && workspaceId && workspaceId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
                throw new Error('Navigation context WORKSPACE read scope mismatch');
            const workspace = workspaceId ? await this.exact('WORKSPACE', workspaceId) : { memberships: {}, profiles: { WORK: {}, HOME: {} } }, user = await this.exact('USER', input.userId), state = mergeStates(workspace, user), activeContext = normalizeContext(input.context || state.activeContext), nav = await this.navigationProfiles.read({ userId: input.userId, workspaceId }, ctx), profile = profileForContext(nav.profile, state, activeContext), visibleItemCodes = (KXNavigation.resolve(profile, {}).flat || []).map((x) => x.itemCode);
            return { contract: this.contract, activeContext, memberships: clone(state.memberships), profiles: clone(state.profiles), profile, baseProfile: nav.profile, baseUserProfile: nav.userProfile, baseWorkspaceProfile: nav.workspaceProfile, workspaceState: workspace, userState: user, workspaceId: workspaceId || null, userId: input.userId, visibleItemCodes };
        }
        async switchContext(input, ctx) { const scopeType = input.scopeType || 'USER', scopeId = input.scopeId || (scopeType === 'USER' ? input.userId : (input.workspaceId || this.workspaceId)); if (!scopeId)
            throw new Error('Navigation context switch scopeId required'); const context = normalizeContext(input.context); await this.setValue(ACTIVE_KEY, scopeType, scopeId, context, ctx); return this.read({ userId: input.userId, workspaceId: input.workspaceId, context }, ctx); }
        async saveMembership(input, ctx) { const valid = itemCodes(); if (!valid.has(String(input.itemCode)))
            throw new Error(`Unknown navigation item ${input.itemCode}`); const membership = normalizeMembership(input.membership), current = await this.value(MEMBERSHIP_KEY, input.scopeType, input.scopeId) || {}, next = { ...canonicalMembershipMap(current), [String(input.itemCode)]: membership }; await this.setValue(MEMBERSHIP_KEY, input.scopeType, input.scopeId, next, ctx); return this.read({ userId: input.userId, workspaceId: input.workspaceId }, ctx); }
        async saveProfile(input, ctx) { const context = normalizeContext(input.context), profile = KXNavigationProfiles.canonicalProfile(input.profile || {}); if (context === 'ALL') {
            await this.navigationProfiles.save({ scopeType: input.scopeType, scopeId: input.scopeId, profile }, ctx);
        }
        else
            await this.setValue(context === 'WORK' ? WORK_PROFILE_KEY : HOME_PROFILE_KEY, input.scopeType, input.scopeId, profile, ctx); return this.read({ userId: input.userId, workspaceId: input.workspaceId, context }, ctx); }
        async reset(input, ctx) { this.assertScope(input.scopeType, input.scopeId, ctx); let removed = 0; for (const key of [ACTIVE_KEY, MEMBERSHIP_KEY, WORK_PROFILE_KEY, HOME_PROFILE_KEY])
            removed += await this.settings.unset(key, input.scopeType, input.scopeId, ctx) ? 1 : 0; return { contract: this.contract, removed, ...await this.read({ userId: input.userId, workspaceId: input.workspaceId }, ctx) }; }
    }
    function install(runtime, workspaceId) { const base = runtime.navigationProfiles; if (!base)
        throw new Error('NavigationProfileService must be installed before NavigationContextProfileService'); const service = new NavigationContextProfileService(runtime.settings, base, workspaceId || runtime.workspaceProfile?.id); runtime.navigationContextProfiles = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); if (!existing.has('ACTION.CORE.NAVIGATION.CONTEXT.READ'))
        runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.CONTEXT.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: (p, ctx) => service.read(p, ctx) }); if (!existing.has('ACTION.CORE.NAVIGATION.CONTEXT.SWITCH'))
        runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.CONTEXT.SWITCH', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.switchContext(p, ctx) }); if (!existing.has('ACTION.CORE.NAVIGATION.CONTEXT.MEMBERSHIP.SAVE'))
        runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.CONTEXT.MEMBERSHIP.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.saveMembership(p, ctx) }); if (!existing.has('ACTION.CORE.NAVIGATION.CONTEXT.PROFILE.SAVE'))
        runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.CONTEXT.PROFILE.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.saveProfile(p, ctx) }); if (!existing.has('ACTION.CORE.NAVIGATION.CONTEXT.RESET'))
        runtime.actions.register({ code: 'ACTION.CORE.NAVIGATION.CONTEXT.RESET', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.reset(p, ctx) }); return service; }
    NS.CONTRACT_KEY = CONTRACT_KEY;
    NS.KEYS = { ACTIVE_KEY, MEMBERSHIP_KEY, WORK_PROFILE_KEY, HOME_PROFILE_KEY };
    NS.contract = contract;
    NS.canonicalMembershipMap = canonicalMembershipMap;
    NS.mergeStates = mergeStates;
    NS.profileForContext = profileForContext;
    NS.NavigationContextProfileService = NavigationContextProfileService;
    NS.install = install;
})(KXNavigationContextProfiles || (KXNavigationContextProfiles = {}));
