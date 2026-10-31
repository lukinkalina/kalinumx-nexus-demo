var KXAppearanceLiveBinding;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const contract = () => KX_APPEARANCE_LIVE_BINDING_CONTRACT || {};
    const raster = () => new Set(contract().rasterLiveMime || []), safeImage = () => new Set([...(contract().rasterLiveMime || []), ...(contract().safeSvgLiveMime || [])]), safeFont = () => new Set(contract().safeFontLiveMime || []);
    const safePath = (s) => s.startsWith('assets/') && !s.includes('..') && !s.startsWith('/');
    const hexLum = (value) => { const m = /^#([0-9a-f]{6})$/i.exec(String(value || '')); if (!m)
        return .5; const n = parseInt(m[1], 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const x = v / 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; };
    const fallback = (role, reason, ref) => ({ role, status: 'FALLBACK', reason, assetCode: ref?.assetCode || null, kind: ref?.kind || null, locator: ref?.locator || null, url: null, mimeType: ref?.mimeType || null });
    function backgroundStyle(bg, bound) {
        if (!bg || bg.mode !== 'ASSET' || bound?.status !== 'BOUND')
            return { active: false, backgroundImage: 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'scroll', opacity: 1, blurPx: 0, scale: 1 };
        const fit = String(bg.fit || 'COVER'), size = fit === 'CONTAIN' ? 'contain' : fit === 'STRETCH' ? '100% 100%' : fit === 'CENTER' ? 'auto' : 'cover';
        const positions = { CENTER: 'center', TOP: 'center top', BOTTOM: 'center bottom', LEFT: 'left center', RIGHT: 'right center' };
        const position = bg.position === 'FOCAL_POINT' ? `${Math.round(Number(bg.focalX ?? .5) * 100)}% ${Math.round(Number(bg.focalY ?? .5) * 100)}%` : (positions[bg.position] || 'center');
        return { active: true, backgroundImage: `url(${JSON.stringify(bound.url)})`, backgroundSize: size, backgroundPosition: position, backgroundAttachment: bg.fixed === false ? 'scroll' : 'fixed', opacity: Number(bg.opacity ?? 1), blurPx: Number(bg.blurPx ?? 0), scale: Number(bg.scale ?? 1) };
    }
    function contrastOverlay(theme, bg, bound) {
        if (!bg || bg.mode !== 'ASSET' || bound?.status !== 'BOUND')
            return { active: false, color: 'transparent', alpha: 0, reason: 'NO_LIVE_BACKGROUND' };
        const resolvedText = KXAppearanceContrastMatrix?.resolveThemeTokens?.(theme || {})?.tokens?.text || theme?.text;
        const guard = KXAppearanceContrastMatrix?.assetBackgroundGuard?.(String(resolvedText || ''), Number(bg.dim ?? 0), 4.5);
        if (guard?.active)
            return { ...guard, resolvedText, guardMode: 'WORST_CASE_ENDPOINT_SCRIM' };
        const textLum = hexLum(resolvedText), base = Math.max(0, Math.min(1, Number(bg.dim ?? 0))), lightText = textLum > .55, minimum = lightText ? .18 : .12, alpha = Math.min(.72, Math.max(base, minimum));
        return { active: true, color: lightText ? '0,0,0' : '255,255,255', alpha, css: `rgba(${lightText ? '0,0,0' : '255,255,255'},${alpha.toFixed(3)})`, reason: 'LEGACY_CONTRAST_FALLBACK', resolvedText, worstCaseRatio: null };
    }
    class AppearanceLiveBindingService {
        runtime;
        contract = 'KX.APPEARANCE_LIVE_BINDING/1';
        constructor(runtime) {
            this.runtime = runtime;
        }
        ingestion() { const x = this.runtime.appearanceAssetIngestion; if (!x)
            throw new Error('Appearance Asset Ingestion service unavailable'); return x; }
        safety() { const x = this.runtime.appearanceAssetSafety; if (!x)
            throw new Error('Appearance Asset Safety service unavailable'); return x; }
        profiles() { const x = this.runtime.appearanceAssets; if (!x)
            throw new Error('Appearance Asset Profile service unavailable'); return x; }
        async bindImage(ref, role, ctx) {
            if (!ref)
                return fallback(role, 'NO_OVERRIDE');
            try {
                if (!safeImage().has(String(ref.mimeType || '')))
                    return fallback(role, 'MIME_UNSUPPORTED', ref);
                if (ref.kind === 'FILE_ID') {
                    const ing = this.ingestion(), state = await ing.freshness(String(ref.locator || ''), ctx);
                    if (state.stale)
                        return fallback(role, `STALE_${state.reasons.join('_') || 'REVISION'}`, ref);
                    const d = state.descriptor.data || {};
                    if (!safeImage().has(String(d.mimeType || '')))
                        return fallback(role, 'DESCRIPTOR_MIME_UNSUPPORTED', ref);
                    if (ref.mimeType && ref.mimeType !== d.mimeType)
                        return fallback(role, 'REF_MIME_MISMATCH', ref);
                    if (ref.checksumSha256 && ref.checksumSha256 !== d.sha256)
                        return fallback(role, 'REF_CHECKSUM_MISMATCH', ref);
                    const p = await ing.preview({ fileId: state.file.id }, ctx);
                    return { role, status: 'BOUND', source: 'FILE_ID', assetCode: ref.assetCode || null, fileId: state.file.id, contentRevision: state.file.contentRevision, mimeType: d.mimeType, url: p.previewUrl, width: d.width, height: d.height, ephemeral: true, safetyArtifactId: p.safetyArtifactId || null, derivedFileId: p.derivedFileId || null, sanitizedSha256: p.sanitizedSha256 || null };
                }
                if (ref.kind === 'BUNDLED_PATH') {
                    if (!raster().has(String(ref.mimeType || '')))
                        return fallback(role, 'BUNDLED_NON_RASTER_REQUIRES_SAFETY_ARTIFACT', ref);
                    if (!safePath(String(ref.locator || '')))
                        return fallback(role, 'UNSAFE_BUNDLED_PATH', ref);
                    return { role, status: 'BOUND', source: 'BUNDLED_PATH', assetCode: ref.assetCode || null, mimeType: ref.mimeType, url: String(ref.locator), ephemeral: false };
                }
                return fallback(role, ref.kind === 'HTTPS_URL' ? 'REMOTE_LIVE_BINDING_NOT_ENABLED' : 'UNSUPPORTED_KIND', ref);
            }
            catch (error) {
                return fallback(role, `FAIL_CLOSED:${String(error?.message || error)}`, ref);
            }
        }
        async bindFont(ref, ctx) {
            if (!ref)
                return { status: 'NONE' };
            try {
                if (ref.kind !== 'FILE_ID')
                    return { status: 'BLOCKED', reason: 'FONT_FILE_ID_REQUIRED', assetCode: ref.assetCode || null };
                if (!safeFont().has(String(ref.mimeType || '')))
                    return { status: 'BLOCKED', reason: 'FONT_MIME_UNSUPPORTED', assetCode: ref.assetCode || null };
                if (String(ref.mimeType || '') === 'font/woff2' && !this.runtime.appearanceWoff2Decoder?.status?.().available)
                    return { status: 'BLOCKED', reason: 'FONT_WOFF2_DECODER_REQUIRED', assetCode: ref.assetCode || null };
                const ing = this.ingestion(), state = await ing.freshness(String(ref.locator || ''), ctx);
                if (state.stale)
                    return { status: 'BLOCKED', reason: `STALE_${state.reasons.join('_') || 'REVISION'}`, assetCode: ref.assetCode || null };
                const d = state.descriptor.data || {};
                if (!safeFont().has(String(d.mimeType || '')) || ref.mimeType !== d.mimeType || ref.checksumSha256 !== d.sha256)
                    return { status: 'BLOCKED', reason: 'FONT_REF_BINDING_MISMATCH', assetCode: ref.assetCode || null };
                const artifact = await this.safety().requireSafe({ fileId: state.file.id }, ctx);
                let blobFile = state.file, bindMime = String(d.mimeType || ''), bindSha = String(d.sha256 || '');
                if (bindMime === 'font/woff2') {
                    const derivedFileId = String(artifact.data?.derivedFileId || '');
                    if (!derivedFileId)
                        throw new Error('FONT_WOFF2_SAFE_DERIVED_REQUIRED');
                    const derived = await this.runtime.files.get(derivedFileId);
                    if (!derived || derived.archivedAt)
                        throw new Error('FONT_WOFF2_SAFE_DERIVED_MISSING');
                    if (!['font/ttf', 'font/otf'].includes(String(derived.mime || '')))
                        throw new Error('FONT_WOFF2_SAFE_DERIVED_MIME');
                    if (String(derived.sha256 || '') !== String(artifact.data?.sanitizedSha256 || ''))
                        throw new Error('FONT_WOFF2_SAFE_DERIVED_SHA256');
                    blobFile = derived;
                    bindMime = derived.mime;
                    bindSha = derived.sha256;
                }
                const blob = await this.runtime.files.getBlob(blobFile.id);
                if (!blob)
                    throw new Error('SAFE_FONT_BYTES_UNAVAILABLE');
                const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
                if (!url.startsWith('blob:'))
                    throw new Error('SAFE_FONT_BLOB_URL_UNAVAILABLE');
                const family = `KXCustom_${String(artifact.data?.sanitizedSha256 || bindSha).slice(0, 16)}`;
                const FontFaceCtor = globalThis.FontFace, fonts = globalThis.document?.fonts;
                if (FontFaceCtor && fonts) {
                    const face = new FontFaceCtor(family, `url(${JSON.stringify(url)})`);
                    await face.load();
                    fonts.add(face);
                }
                return { status: 'BOUND', assetCode: ref.assetCode || null, fileId: state.file.id, contentRevision: state.file.contentRevision, mimeType: d.mimeType, boundMimeType: bindMime, boundFileId: blobFile.id, url, family, safetyArtifactId: artifact.id, sha256: d.sha256, boundSha256: bindSha, decoderProvider: artifact.data?.decoderProvider || null, registered: !!(FontFaceCtor && fonts), ephemeral: true };
            }
            catch (error) {
                return { status: 'BLOCKED', reason: `FAIL_CLOSED:${String(error?.message || error)}`, assetCode: ref?.assetCode || null };
            }
        }
        async resolve(input, ctx) {
            const read = await this.profiles().read({ userId: String(input.userId || ctx?.actorId || ''), workspaceId: input.workspaceId, theme: input.theme || {} }, ctx), p = read.resolved || {};
            const brandSymbol = await this.bindImage(p.brand?.SYMBOL, 'BRAND.SYMBOL', ctx);
            const background = p.background?.mode === 'ASSET' ? await this.bindImage(p.background.asset, 'BACKGROUND.ASSET', ctx) : fallback('BACKGROUND.ASSET', 'NO_ASSET_BACKGROUND');
            const icons = {};
            for (const [code, ref] of Object.entries(p.iconOverrides || {}))
                icons[code] = await this.bindImage(ref, `NAVIGATION.${code}`, ctx);
            const customFont = await this.bindFont(p.typography?.customFontAsset, ctx);
            const responsive = backgroundStyle(p.background, background), contrast = contrastOverlay(input.theme || {}, p.background, background);
            return { contract: this.contract, userId: read.userId, workspaceId: read.workspaceId, profile: clone(read.profile), resolvedProfile: clone(p), live: { brandSymbol, background, icons, customFont }, responsive, contrast, fallbackCount: [brandSymbol, background, ...Object.values(icons)].filter((x) => x?.status === 'FALLBACK').length, persistentMutation: false };
        }
    }
    function install(runtime) { const service = new AppearanceLiveBindingService(runtime); runtime.appearanceLiveBinding = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); if (!existing.has('ACTION.CORE.APPEARANCE.LIVE_BINDING.RESOLVE'))
        runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.LIVE_BINDING.RESOLVE', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: (p, c) => service.resolve(p, c) }); return service; }
    NS.contract = contract;
    NS.backgroundStyle = backgroundStyle;
    NS.contrastOverlay = contrastOverlay;
    NS.AppearanceLiveBindingService = AppearanceLiveBindingService;
    NS.install = install;
})(KXAppearanceLiveBinding || (KXAppearanceLiveBinding = {}));
