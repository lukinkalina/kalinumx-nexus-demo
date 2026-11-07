var KXAppearanceAssets;
(function (NS) {
    const PROFILE_KEY = 'ui.appearance.assetProfile.v1', schemaVersion = 1;
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
    const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
    const bounded = (v, min, max, name) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max)
        throw new Error(`${name} out of range ${min}..${max}`); return n; };
    const text = (v, max, name) => { const s = String(v ?? ''); if (s.length > max)
        throw new Error(`${name} exceeds ${max} chars`); return s; };
    const contract = () => KX_APPEARANCE_ASSET_CONTRACT || {};
    const iconCodeForItem = (itemCode) => `ICON.${String(itemCode).replace(/^APP\.KX\.NOTES$/, 'APP.KX.NOTEPAD') /* N2.6b: the pack names the Notes icon NOTEPAD */.replace(/^APP\./, '').replace(/^CORE\.LAUNCH\./, 'CORE.').replace(/[^A-Za-z0-9_.-]/g, '_')}`;
    const iconSlots = () => ((KXNavigation?.contract?.().items) || []).map((x) => ({ iconCode: iconCodeForItem(x.itemCode), itemCode: x.itemCode, label: x.label, kind: x.kind, required: !!x.required }));
    const builtInPacks = () => ((KXUI?.ICON_STYLES) || []).map((x) => ({ packCode: `ICONPACK.KX.${x.code}`, name: x.name, styleCode: x.code, description: x.description, source: 'BUILT_IN_STYLE', assetPayloadStored: false }));
    const fontCodes = () => new Set(['AUTO', ...((KXUI?.FONT_PROFILES) || []).map((x) => x.code)]);
    const packCodes = () => new Set(['AUTO', ...builtInPacks().map((x) => x.packCode)]);
    const iconCodes = () => new Set(iconSlots().map((x) => x.iconCode));
    const brandSlots = () => new Set(contract().brandSlots || []);
    const platformCodes = () => new Set((contract().platformProfiles || []).map((x) => x.code));
    const assetKinds = () => new Set(contract().assetReference?.kinds || []), assetStatuses = () => new Set(contract().assetReference?.statuses || []);
    function canonicalAssetRef(input, usage = 'IMAGE') {
        if (!plain(input))
            throw new Error('Asset reference must be an object');
        const kind = String(input.kind || ''), status = String(input.status || 'DRAFT'), assetCode = text(input.assetCode, 160, 'assetCode'), locator = text(input.locator, Number(contract().assetReference?.maxLocatorLength || 2048), 'locator'), mimeType = text(input.mimeType || '', 120, 'mimeType');
        if (!assetCode.startsWith('ASSET.'))
            throw new Error('assetCode must start ASSET.');
        if (!assetKinds().has(kind))
            throw new Error(`Unsupported asset reference kind ${kind}`);
        if (!assetStatuses().has(status))
            throw new Error(`Unsupported asset status ${status}`);
        if (!locator)
            throw new Error('Asset locator required');
        if (/^data:/i.test(locator) || /;base64,/i.test(locator))
            throw new Error('Embedded data URI/bytes forbidden');
        if (kind === 'BUNDLED_PATH') {
            if (!locator.startsWith('assets/') || locator.includes('..') || locator.startsWith('/'))
                throw new Error('Invalid bundled asset path');
        }
        if (kind === 'FILE_ID' && !locator.startsWith('FILE.'))
            throw new Error('FILE_ID locator must be canonical FILE.ID');
        if (kind === 'HTTPS_URL' && !/^https:\/\//i.test(locator))
            throw new Error('HTTPS_URL must use https://');
        const allowed = new Set(usage === 'FONT' ? (contract().assetReference?.allowedFontMime || []) : (contract().assetReference?.allowedImageMime || []));
        if (mimeType && !allowed.has(mimeType))
            throw new Error(`Unsupported ${usage} mimeType ${mimeType}`);
        const out = { assetCode, kind, locator, status };
        if (mimeType)
            out.mimeType = mimeType;
        for (const k of ['checksumSha256', 'source', 'license', 'promptVersion'])
            if (input[k] !== undefined)
                out[k] = text(input[k], 512, k);
        if (input.width !== undefined) {
            const n = Number(input.width);
            if (!Number.isInteger(n) || n < 1 || n > 16384)
                throw new Error('Invalid asset width');
            out.width = n;
        }
        if (input.height !== undefined) {
            const n = Number(input.height);
            if (!Number.isInteger(n) || n < 1 || n > 16384)
                throw new Error('Invalid asset height');
            out.height = n;
        }
        if (input.transparent !== undefined)
            out.transparent = !!input.transparent;
        return out;
    }
    function canonicalBackground(input) {
        if (!plain(input))
            throw new Error('background must be an object');
        const c = contract().background || {}, modes = new Set(c.modes || []), fits = new Set(c.fits || []), positions = new Set(c.positions || []), lim = c.limits || {};
        const mode = String(input.mode || 'NONE');
        if (!modes.has(mode))
            throw new Error(`Unknown background mode ${mode}`);
        const out = { mode, fit: String(input.fit || 'COVER'), position: String(input.position || 'CENTER'), opacity: bounded(input.opacity ?? 1, lim.opacityMin ?? 0, lim.opacityMax ?? 1, 'background.opacity'), dim: bounded(input.dim ?? 0, lim.dimMin ?? 0, lim.dimMax ?? 1, 'background.dim'), blurPx: bounded(input.blurPx ?? 0, lim.blurPxMin ?? 0, lim.blurPxMax ?? 48, 'background.blurPx'), scale: bounded(input.scale ?? 1, lim.scaleMin ?? .5, lim.scaleMax ?? 3, 'background.scale'), focalX: bounded(input.focalX ?? .5, lim.focalMin ?? 0, lim.focalMax ?? 1, 'background.focalX'), focalY: bounded(input.focalY ?? .5, lim.focalMin ?? 0, lim.focalMax ?? 1, 'background.focalY'), fixed: input.fixed !== false };
        if (!fits.has(out.fit) || !positions.has(out.position))
            throw new Error('Unknown background fit/position');
        if (mode === 'ASSET') {
            if (!input.asset)
                throw new Error('ASSET background requires asset');
            out.asset = canonicalAssetRef(input.asset, 'IMAGE');
        }
        else if (input.asset)
            throw new Error(`${mode} background cannot carry asset`);
        if (mode === 'GRADIENT_TOKEN') {
            out.gradientToken = text(input.gradientToken || '', 120, 'gradientToken');
            if (!out.gradientToken)
                throw new Error('GRADIENT_TOKEN requires gradientToken');
        }
        if (input.overlayToken !== undefined)
            out.overlayToken = text(input.overlayToken, 120, 'overlayToken');
        return out;
    }
    function canonicalTypography(input) {
        if (!plain(input))
            throw new Error('typography must be an object');
        const lim = contract().typography?.limits || {}, fontProfile = String(input.fontProfile || 'AUTO'), headingProfile = String(input.headingProfile || 'AUTO');
        if (!fontCodes().has(fontProfile) || !fontCodes().has(headingProfile))
            throw new Error('Unknown typography font profile');
        const out = { fontProfile, headingProfile, scale: bounded(input.scale ?? 1, lim.scaleMin ?? .75, lim.scaleMax ?? 1.5, 'typography.scale'), letterSpacingEm: bounded(input.letterSpacingEm ?? 0, lim.letterSpacingEmMin ?? -.08, lim.letterSpacingEmMax ?? .2, 'typography.letterSpacingEm') };
        if (input.customFontAsset)
            out.customFontAsset = canonicalAssetRef(input.customFontAsset, 'FONT');
        return out;
    }
    function canonicalProfile(input = {}) {
        if (!plain(input))
            throw new Error('Appearance asset profile must be an object');
        const out = {};
        if (own(input, 'iconPackCode')) {
            const code = String(input.iconPackCode);
            if (!packCodes().has(code))
                throw new Error(`Unknown icon pack ${code}`);
            out.iconPackCode = code;
        }
        if (own(input, 'iconOverrides')) {
            if (!plain(input.iconOverrides))
                throw new Error('iconOverrides must be an object');
            const map = {};
            for (const [code, ref] of Object.entries(input.iconOverrides)) {
                if (!iconCodes().has(code))
                    throw new Error(`Unknown ICON.CODE ${code}`);
                map[code] = canonicalAssetRef(ref, 'IMAGE');
            }
            out.iconOverrides = map;
        }
        if (own(input, 'brand')) {
            if (!plain(input.brand))
                throw new Error('brand must be an object');
            const map = {};
            for (const [slot, ref] of Object.entries(input.brand)) {
                if (!brandSlots().has(slot))
                    throw new Error(`Unknown brand slot ${slot}`);
                map[slot] = canonicalAssetRef(ref, 'IMAGE');
            }
            out.brand = map;
        }
        if (own(input, 'background'))
            out.background = canonicalBackground(input.background);
        if (own(input, 'typography'))
            out.typography = canonicalTypography(input.typography);
        if (own(input, 'platformAppIcons')) {
            if (!plain(input.platformAppIcons))
                throw new Error('platformAppIcons must be an object');
            const map = {};
            for (const [code, value] of Object.entries(input.platformAppIcons)) {
                if (!platformCodes().has(code))
                    throw new Error(`Unknown platform icon profile ${code}`);
                if (code === 'PLATFORM_ICON.ANDROID') {
                    if (!plain(value) || !value.foreground || !value.background)
                        throw new Error('Android adaptive icon requires foreground + background');
                    map[code] = { foreground: canonicalAssetRef(value.foreground, 'IMAGE'), background: canonicalAssetRef(value.background, 'IMAGE') };
                }
                else
                    map[code] = canonicalAssetRef(value, 'IMAGE');
            }
            out.platformAppIcons = map;
        }
        return out;
    }
    function mergeProfiles(workspace = {}, user = {}) {
        const w = canonicalProfile(workspace || {}), u = canonicalProfile(user || {}), out = { ...clone(w), ...clone(u) };
        if (w.iconOverrides || u.iconOverrides)
            out.iconOverrides = { ...(w.iconOverrides || {}), ...(u.iconOverrides || {}) };
        if (w.brand || u.brand)
            out.brand = { ...(w.brand || {}), ...(u.brand || {}) };
        if (w.platformAppIcons || u.platformAppIcons)
            out.platformAppIcons = { ...(w.platformAppIcons || {}), ...(u.platformAppIcons || {}) };
        return canonicalProfile(out);
    }
    function resolvedPresentation(profile, theme = {}) {
        const p = canonicalProfile(profile || {}), iconPackCode = p.iconPackCode && p.iconPackCode !== 'AUTO' ? p.iconPackCode : `ICONPACK.KX.${String(theme.iconStyle || 'OUTLINE')}`;
        return { contract: contract().contract, schemaVersion, iconPackCode, iconOverrides: clone(p.iconOverrides || {}), brand: clone(p.brand || {}), background: clone(p.background || { mode: 'NONE', fit: 'COVER', position: 'CENTER', opacity: 1, dim: 0, blurPx: 0, scale: 1, focalX: .5, focalY: .5, fixed: true }), typography: clone(p.typography || { fontProfile: 'AUTO', headingProfile: 'AUTO', scale: 1, letterSpacingEm: 0 }), platformAppIcons: clone(p.platformAppIcons || {}), fallback: 'CORE_FALLBACK_GLYPH' };
    }
    class AppearanceAssetProfileService {
        settings;
        workspaceId;
        contract = 'KX.APPEARANCE_ASSET_PERSONALIZATION/1';
        constructor(settings, workspaceId) {
            this.settings = settings;
            this.workspaceId = workspaceId;
        }
        async exactRow(scopeType, scopeId) { const rows = await this.settings.list(PROFILE_KEY); return rows.find((x) => x.scopeType === scopeType && x.scopeId === scopeId); }
        async exact(scopeType, scopeId) { const row = await this.exactRow(scopeType, scopeId); return row ? canonicalProfile(row.value || {}) : {}; }
        assertReadScope(input, ctx) { if (!ctx || ctx.actorId === 'SYSTEM')
            return; if (input.userId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('Appearance USER profile read scope mismatch'); const workspaceId = input.workspaceId || this.workspaceId; if (this.workspaceId && workspaceId && workspaceId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('Appearance WORKSPACE profile read scope mismatch'); }
        registry() { return { contract: this.contract, iconSlots: iconSlots(), iconPacks: builtInPacks(), brandSlots: [...(contract().brandSlots || [])], platformProfiles: clone(contract().platformProfiles || []), fontProfiles: clone((KXUI?.FONT_PROFILES) || []), assetReference: clone(contract().assetReference || {}) }; }
        async read(input, ctx) { this.assertReadScope(input, ctx); const workspaceId = input.workspaceId || this.workspaceId, workspaceRow = workspaceId ? await this.exactRow('WORKSPACE', workspaceId) : undefined, userRow = await this.exactRow('USER', input.userId), workspace = workspaceRow ? canonicalProfile(workspaceRow.value || {}) : {}, user = userRow ? canonicalProfile(userRow.value || {}) : {}, profile = mergeProfiles(workspace, user); return { contract: this.contract, schemaVersion, profile, workspaceProfile: workspace, userProfile: user, workspaceRevision: workspaceRow?.revision || 0, userRevision: userRow?.revision || 0, resolved: resolvedPresentation(profile, input.theme || {}), workspaceId: workspaceId || null, userId: input.userId }; }
        async save(input, ctx) { if (!['USER', 'WORKSPACE'].includes(input.scopeType))
            throw new Error('Appearance profile supports USER or WORKSPACE scope only'); if (input.scopeType === 'USER' && input.scopeId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('Appearance USER profile scope mismatch'); if (input.scopeType === 'WORKSPACE' && this.workspaceId && input.scopeId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('Appearance WORKSPACE profile scope mismatch'); const profile = canonicalProfile(input.profile), row = await this.settings.set({ key: PROFILE_KEY, scopeType: input.scopeType, scopeId: input.scopeId, value: profile, updatedBy: ctx.actorId }, ctx); return { contract: this.contract, schemaVersion, profile, settingId: row.id, revision: row.revision, scopeType: input.scopeType, scopeId: input.scopeId }; }
        async reset(input, ctx) { const removed = await this.settings.unset(PROFILE_KEY, input.scopeType, input.scopeId, ctx); return { contract: this.contract, removed, scopeType: input.scopeType, scopeId: input.scopeId }; }
    }
    function install(runtime, workspaceId) { const service = new AppearanceAssetProfileService(runtime.settings, workspaceId || runtime.workspaceProfile?.id); runtime.appearanceAssets = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); if (!existing.has('ACTION.CORE.APPEARANCE.ASSET_PROFILE.READ'))
        runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.ASSET_PROFILE.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: (p, ctx) => service.read(p, ctx) }); if (!existing.has('ACTION.CORE.APPEARANCE.ASSET_PROFILE.SAVE'))
        runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.ASSET_PROFILE.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.save(p, ctx) }); if (!existing.has('ACTION.CORE.APPEARANCE.ASSET_PROFILE.RESET'))
        runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.ASSET_PROFILE.RESET', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.reset(p, ctx) }); return service; }
    NS.PROFILE_KEY = PROFILE_KEY;
    NS.contract = contract;
    NS.iconCodeForItem = iconCodeForItem;
    NS.iconSlots = iconSlots;
    NS.builtInPacks = builtInPacks;
    NS.canonicalAssetRef = canonicalAssetRef;
    NS.canonicalProfile = canonicalProfile;
    NS.mergeProfiles = mergeProfiles;
    NS.resolvedPresentation = resolvedPresentation;
    NS.AppearanceAssetProfileService = AppearanceAssetProfileService;
    NS.install = install;
})(KXAppearanceAssets || (KXAppearanceAssets = {}));
