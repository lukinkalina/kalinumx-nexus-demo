var KXAppearanceContrastMatrix;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const contract = () => KX_APPEARANCE_CONTRAST_MATRIX_CONTRACT || {};
    const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
    const hex = (value) => { const m = /^#([0-9a-f]{6})$/i.exec(String(value || '')); if (!m)
        return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const hexOut = (rgb) => '#' + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
    const channel = (v) => { const x = clamp(v / 255); return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); };
    const luminance = (value) => { const rgb = hex(value); if (!rgb)
        return null; return .2126 * channel(rgb[0]) + .7152 * channel(rgb[1]) + .0722 * channel(rgb[2]); };
    function contrastRatio(a, b) { const x = luminance(a), y = luminance(b); if (x === null || y === null)
        return null; const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + .05) / (lo + .05); }
    const blend = (a, b, t) => { const x = hex(a), y = hex(b); if (!x || !y)
        return b; return hexOut(x.map((v, i) => v + (y[i] - v) * clamp(t))); };
    const minRatio = (fg, backgrounds) => Math.min(...backgrounds.map(bg => contrastRatio(fg, bg) ?? 0));
    function deriveReadableColor(original, backgrounds, target) {
        const current = minRatio(original, backgrounds);
        if (current >= target)
            return { color: original, ratio: current, changed: false, resolved: true, toward: null, blend: 0 };
        const candidates = ['#000000', '#FFFFFF'].map(toward => ({ toward, ratio: minRatio(toward, backgrounds) })).sort((a, b) => b.ratio - a.ratio), best = candidates[0];
        if (best.ratio < target)
            return { color: best.toward, ratio: best.ratio, changed: true, resolved: false, toward: best.toward, blend: 1 };
        let lo = 0, hi = 1;
        for (let i = 0; i < 28; i++) {
            const mid = (lo + hi) / 2, c = blend(original, best.toward, mid);
            if (minRatio(c, backgrounds) >= target)
                hi = mid;
            else
                lo = mid;
        }
        const color = blend(original, best.toward, hi), ratio = minRatio(color, backgrounds);
        return { color, ratio, changed: color.toUpperCase() !== String(original || '').toUpperCase(), resolved: ratio >= target, toward: best.toward, blend: hi };
    }
    const roleSpecs = () => clone(contract().roles || [
        { role: 'TEXT_PRIMARY', token: 'text', backgrounds: ['bg', 'surface', 'surface2'], target: 4.5, kind: 'TEXT' },
        { role: 'TEXT_MUTED', token: 'muted', backgrounds: ['bg', 'surface'], target: 4.5, kind: 'TEXT' },
        { role: 'UI_ACCENT', token: 'accent', backgrounds: ['surface'], target: 3, kind: 'UI' },
        { role: 'UI_ACCENT_SECONDARY', token: 'accent2', backgrounds: ['surface'], target: 3, kind: 'UI' }
    ]);
    function resolveThemeTokens(theme) {
        const original = { text: String(theme?.text || ''), muted: String(theme?.muted || ''), accent: String(theme?.accent || ''), accent2: String(theme?.accent2 || '') }, tokens = { ...original }, roles = [];
        for (const spec of roleSpecs()) {
            const backgrounds = (spec.backgrounds || []).map((k) => String(theme?.[k] || '')).filter((x) => !!hex(x));
            const source = String(original[spec.token] || '');
            if (!hex(source) || !backgrounds.length) {
                roles.push({ ...spec, status: 'INVALID_COLOR', original: source, resolvedColor: source, ratio: 0, changed: false, resolved: false });
                continue;
            }
            const out = deriveReadableColor(source, backgrounds, Number(spec.target || 4.5));
            tokens[spec.token] = out.color;
            roles.push({ ...spec, status: out.resolved ? 'PASS' : 'UNRESOLVED', original: source, resolvedColor: out.color, ratio: Number(out.ratio.toFixed(3)), changed: out.changed, resolved: out.resolved, toward: out.toward, blend: Number(out.blend.toFixed(4)) });
        }
        const fallbackCount = roles.filter(r => r.changed).length, unresolvedCount = roles.filter(r => !r.resolved).length;
        return { themeCode: String(theme?.code || 'CUSTOM'), tokens, original, roles, fallbackCount, unresolvedCount, pass: unresolvedCount === 0 };
    }
    function auditTheme(theme) {
        const resolved = resolveThemeTokens(theme), pairs = [];
        for (const spec of roleSpecs())
            for (const bgToken of spec.backgrounds || []) {
                const fg = String(theme?.[spec.token] || ''), bg = String(theme?.[bgToken] || ''), ratio = contrastRatio(fg, bg), fallback = String(resolved.tokens?.[spec.token] || fg), fallbackRatio = contrastRatio(fallback, bg);
                pairs.push({ role: spec.role, kind: spec.kind, foregroundToken: spec.token, backgroundToken: bgToken, foreground: fg, background: bg, target: Number(spec.target), ratio: ratio === null ? null : Number(ratio.toFixed(3)), pass: ratio !== null && ratio >= Number(spec.target), resolvedColor: fallback, resolvedRatio: fallbackRatio === null ? null : Number(fallbackRatio.toFixed(3)), resolvedPass: fallbackRatio !== null && fallbackRatio >= Number(spec.target) });
            }
        const rawFailures = pairs.filter(x => !x.pass), resolvedFailures = pairs.filter(x => !x.resolvedPass);
        return { contract: contract().contract || 'KX.APPEARANCE_CONTRAST_MATRIX/1', themeCode: String(theme?.code || 'CUSTOM'), themeName: String(theme?.name || theme?.code || 'Custom'), pairs, rawFailureCount: rawFailures.length, resolvedFailureCount: resolvedFailures.length, fallbackCount: resolved.fallbackCount, pass: resolvedFailures.length === 0, resolvedTokens: resolved.tokens, mutatesCanonical: false };
    }
    function matrix(themes = (KXUI?.THEMES || [])) {
        const rows = (themes || []).map(auditTheme), rawFailThemes = rows.filter(r => r.rawFailureCount > 0), resolvedFailThemes = rows.filter(r => r.resolvedFailureCount > 0);
        return { contract: contract().contract || 'KX.APPEARANCE_CONTRAST_MATRIX/1', themeCount: rows.length, pairCount: rows.reduce((n, r) => n + r.pairs.length, 0), rawFailThemes: rawFailThemes.length, rawFailures: rows.reduce((n, r) => n + r.rawFailureCount, 0), resolvedFailThemes: resolvedFailThemes.length, resolvedFailures: rows.reduce((n, r) => n + r.resolvedFailureCount, 0), fallbackThemes: rows.filter(r => r.fallbackCount > 0).length, rows, canonicalMutation: false };
    }
    function worstCaseAfterOverlay(textColor, overlay, alpha) { const endpoint = overlay === 'BLACK' ? '#FFFFFF' : '#000000', overlayColor = overlay === 'BLACK' ? '#000000' : '#FFFFFF', composited = blend(endpoint, overlayColor, alpha); return contrastRatio(textColor, composited) ?? 0; }
    function assetBackgroundGuard(textColor, requestedAlpha = 0, target = 4.5) {
        const requested = clamp(Number(requestedAlpha || 0));
        if (!hex(textColor))
            return { active: false, pass: false, reason: 'INVALID_TEXT_COLOR', color: 'transparent', alpha: requested, css: 'transparent', targetRatio: target, worstCaseRatio: 0 };
        const choices = ['BLACK', 'WHITE'].map(overlay => ({ overlay, max: worstCaseAfterOverlay(textColor, overlay, 1) })).sort((a, b) => b.max - a.max), best = choices[0];
        let alpha = requested, ratio = worstCaseAfterOverlay(textColor, best.overlay, alpha);
        if (ratio < target && best.max >= target) {
            let lo = alpha, hi = 1;
            for (let i = 0; i < 30; i++) {
                const mid = (lo + hi) / 2;
                if (worstCaseAfterOverlay(textColor, best.overlay, mid) >= target)
                    hi = mid;
                else
                    lo = mid;
            }
            alpha = hi;
            ratio = worstCaseAfterOverlay(textColor, best.overlay, alpha);
        }
        const rgb = best.overlay === 'BLACK' ? '0,0,0' : '255,255,255';
        return { active: true, pass: ratio >= target, overlay: best.overlay, color: rgb, alpha: Number(alpha.toFixed(4)), requestedAlpha: requested, css: `rgba(${rgb},${alpha.toFixed(4)})`, targetRatio: target, worstCaseRatio: Number(ratio.toFixed(3)), reason: alpha > requested + 0.0001 ? 'READABILITY_GUARD_RAISED_SCRIM' : 'REQUESTED_SCRIM_SUFFICIENT', mutatesCanonical: false };
    }
    class AppearanceContrastMatrixService {
        contract = 'KX.APPEARANCE_CONTRAST_MATRIX/1';
        auditTheme(input) { return auditTheme(input?.theme || input || {}); }
        matrix(input = {}) { const source = Array.isArray(input?.themes) ? input.themes : (KXUI?.THEMES || []); return matrix(source); }
        backgroundGuard(input) { return assetBackgroundGuard(String(input?.textColor || ''), Number(input?.requestedAlpha || 0), Number(input?.targetRatio || 4.5)); }
    }
    function install(runtime) { const service = new AppearanceContrastMatrixService(); runtime.appearanceContrastMatrix = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); const add = (code, handler) => { if (!existing.has(code))
        runtime.actions.register({ code, ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler }); }; add('ACTION.CORE.APPEARANCE.CONTRAST.AUDIT_THEME', (p) => service.auditTheme(p)); add('ACTION.CORE.APPEARANCE.CONTRAST.MATRIX', (p) => service.matrix(p)); add('ACTION.CORE.APPEARANCE.CONTRAST.BACKGROUND_GUARD', (p) => service.backgroundGuard(p)); return service; }
    NS.contract = contract;
    NS.luminance = luminance;
    NS.contrastRatio = contrastRatio;
    NS.deriveReadableColor = deriveReadableColor;
    NS.resolveThemeTokens = resolveThemeTokens;
    NS.auditTheme = auditTheme;
    NS.matrix = matrix;
    NS.assetBackgroundGuard = assetBackgroundGuard;
    NS.AppearanceContrastMatrixService = AppearanceContrastMatrixService;
    NS.install = install;
})(KXAppearanceContrastMatrix || (KXAppearanceContrastMatrix = {}));
