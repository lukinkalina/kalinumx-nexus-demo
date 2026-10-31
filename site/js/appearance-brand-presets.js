var KXAppearanceBrandPresets;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const contract = () => KX_APPEARANCE_BRAND_PRESET_CONTRACT || {};
    const presets = () => clone(contract().presets || []);
    const preset = (code) => { const row = (contract().presets || []).find((x) => x.code === code); if (!row)
        throw new Error(`Unknown Brand preset ${code}`); return clone(row); };
    const exactProfile = (read, scopeType) => clone(scopeType === 'USER' ? (read.userProfile || {}) : (read.workspaceProfile || {}));
    function composeProfile(existing, p) {
        const next = clone(existing || {});
        next.iconPackCode = p.iconPackCode;
        next.background = clone(p.background);
        next.typography = { fontProfile: p.fontProfile, headingProfile: p.headingProfile || p.fontProfile, scale: 1, letterSpacingEm: 0 };
        // DELTA024 invariant: these explicit user/workspace overrides survive preset apply.
        if (existing?.iconOverrides)
            next.iconOverrides = clone(existing.iconOverrides);
        if (existing?.brand)
            next.brand = clone(existing.brand);
        if (existing?.platformAppIcons)
            next.platformAppIcons = clone(existing.platformAppIcons);
        return KXAppearanceAssets.canonicalProfile(next);
    }
    class BrandPresetService {
        appearance;
        workspaceId;
        contract = 'KX.APPEARANCE_BRAND_PRESETS/1';
        constructor(appearance, workspaceId) {
            this.appearance = appearance;
            this.workspaceId = workspaceId;
        }
        registry() { const c = contract(); return { contract: c.contract, presets: presets(), fontStacks: clone(c.fontStacks || []), textRoles: clone(c.textRoles || []), iconStates: clone(c.iconStates || []), splashStates: clone(c.splashStates || []), referenceManifest: clone(c.referenceManifest || {}), authorityPriority: clone(c.authorityPriority || []) }; }
        async resolve(input, ctx) {
            const p = preset(input.presetCode), workspaceId = input.workspaceId || this.workspaceId;
            const read = await this.appearance.read({ userId: input.userId, workspaceId }, ctx);
            const scopeType = input.scopeType || 'USER', base = exactProfile(read, scopeType), profile = composeProfile(base, p);
            return { contract: this.contract, preset: p, scopeType, scopeId: scopeType === 'USER' ? input.userId : String(workspaceId || ''), profile, shell: { themeCode: p.themeCode, layoutCode: p.layoutCode, navigationMode: p.navigationMode, iconPackCode: p.iconPackCode, fontProfile: p.fontProfile } };
        }
        async apply(input, ctx) {
            const resolved = await this.resolve(input, ctx), scopeType = resolved.scopeType;
            const scopeId = input.scopeId || (scopeType === 'USER' ? input.userId : String(input.workspaceId || this.workspaceId || ''));
            if (!scopeId)
                throw new Error('Brand preset scopeId required');
            const saved = await this.appearance.save({ scopeType, scopeId, profile: resolved.profile }, ctx);
            return { ...resolved, scopeId, savedRevision: saved.revision, applied: true };
        }
    }
    function install(runtime, workspaceId) {
        const appearance = runtime.appearanceAssets || KXAppearanceAssets.install(runtime, workspaceId || runtime.workspaceProfile?.id);
        const service = new BrandPresetService(appearance, workspaceId || runtime.workspaceProfile?.id);
        runtime.appearanceBrandPresets = service;
        const existing = new Set(runtime.actions.list().map((x) => x.code));
        if (!existing.has('ACTION.CORE.APPEARANCE.BRAND_PRESET.REGISTRY.READ'))
            runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.BRAND_PRESET.REGISTRY.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: async () => service.registry() });
        if (!existing.has('ACTION.CORE.APPEARANCE.BRAND_PRESET.RESOLVE'))
            runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.BRAND_PRESET.RESOLVE', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: (p, ctx) => service.resolve(p, ctx) });
        if (!existing.has('ACTION.CORE.APPEARANCE.BRAND_PRESET.APPLY'))
            runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.BRAND_PRESET.APPLY', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.apply(p, ctx) });
        return service;
    }
    NS.contract = contract;
    NS.presets = presets;
    NS.preset = preset;
    NS.composeProfile = composeProfile;
    NS.BrandPresetService = BrandPresetService;
    NS.install = install;
})(KXAppearanceBrandPresets || (KXAppearanceBrandPresets = {}));
