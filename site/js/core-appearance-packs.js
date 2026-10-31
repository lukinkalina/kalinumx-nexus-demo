// N2.2e (R62): písma, import / export motivu a balíčky vzhledu (KX.CORE_APPEARANCE_PACKS/1).
//  - FONT CATALOG (40): system / widely available fonts with a generic fallback; each declares the scripts it
//    covers (Latin basic / Central-European / Baltic / Turkish / Romanian / Vietnamese / Cyrillic / Greek) and a style;
//    languages map to required scripts, so the catalog can be filtered per language / country. The declaration is
//    the typical coverage of the font — the Shell additionally checks availability ON THE DEVICE (nothing is downloaded);
//  - CUSTOM THEMES: import of a theme JSON (schema KX.THEME/1) with strict validation and the same readability rules as
//    the contrast matrix (text 4.5:1 on bg / surface / surface2, muted 4.5:1 on bg / surface, accents 3:1 on surface);
//    a failing theme is refused or AUTO-FIXED (lightness moved until every pair passes); export of any theme;
//  - APPEARANCE PACKAGE (KX.APPEARANCE_PACKAGE/1): theme + icon style + font profile / font + layout in one file with
//    a SHA-256 of the canonical content; import refuses a tampered package.
var KXAppearancePacks;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_APPEARANCE_PACKS/1', CTYPE = 'CORE.APPEARANCE.CUSTOM_THEME';
    const SCRIPTS = { LATIN: 'Latinka (základní)', LATIN_CE: 'Latinka – střední Evropa', BALTIC: 'Pobaltí', TURKISH: 'Turečtina', ROMANIAN: 'Rumunština', VIETNAMESE: 'Vietnamština', CYRILLIC: 'Cyrilice', GREEK: 'Řečtina' };
    // language → required scripts + countries + a test sentence with the characters that matter
    const LANGS = {
        cs: { name: 'Čeština', countries: ['CZ'], scripts: ['LATIN', 'LATIN_CE'], sample: 'Příliš žluťoučký kůň úpěl ďábelské ódy' }, sk: { name: 'Slovenčina', countries: ['SK'], scripts: ['LATIN', 'LATIN_CE'], sample: 'Kŕdeľ šťastných ďatľov učí pri ústí Váhu mĺkveho koňa' },
        pl: { name: 'Polski', countries: ['PL'], scripts: ['LATIN', 'LATIN_CE'], sample: 'Zażółć gęślą jaźń' }, hu: { name: 'Magyar', countries: ['HU'], scripts: ['LATIN', 'LATIN_CE'], sample: 'Árvíztűrő tükörfúrógép' },
        sl: { name: 'Slovenščina', countries: ['SI'], scripts: ['LATIN', 'LATIN_CE'], sample: 'Šerif bo za vajo spet kuhal domače žgance' }, hr: { name: 'Hrvatski', countries: ['HR', 'BA'], scripts: ['LATIN', 'LATIN_CE'], sample: 'Gojazni đačić s biciklom drži hmelj i finu vatu u džepu nošnje' },
        de: { name: 'Deutsch', countries: ['DE', 'AT', 'CH'], scripts: ['LATIN'], sample: 'Falsches Üben von Xylophonmusik quält jeden größeren Zwerg' }, en: { name: 'English', countries: ['GB', 'US', 'IE'], scripts: ['LATIN'], sample: 'The quick brown fox jumps over the lazy dog' },
        fr: { name: 'Français', countries: ['FR', 'BE', 'CH'], scripts: ['LATIN'], sample: 'Portez ce vieux whisky au juge blond qui fume' }, es: { name: 'Español', countries: ['ES'], scripts: ['LATIN'], sample: 'El veloz murciélago hindú comía feliz cardillo y kiwi' },
        it: { name: 'Italiano', countries: ['IT'], scripts: ['LATIN'], sample: 'Quel vituperabile xenofobo zelante assaggia il whisky ed esclama: alleluja!' }, pt: { name: 'Português', countries: ['PT', 'BR'], scripts: ['LATIN'], sample: 'À noite, vovô Kowalsky vê o ímã cair no pé do pingüim' },
        lt: { name: 'Lietuvių', countries: ['LT'], scripts: ['LATIN', 'BALTIC'], sample: 'Įlinkdama fechtuotojo špaga sublykčiojusi pragręžė apvalų arbūzą' }, lv: { name: 'Latviešu', countries: ['LV'], scripts: ['LATIN', 'BALTIC'], sample: 'Glāžšķūņa rūķīši dzērumā čiepj Baha koncertflīģeļu vākus' },
        et: { name: 'Eesti', countries: ['EE'], scripts: ['LATIN', 'BALTIC'], sample: 'Põdur Zagrebi tšellomängija-följetonist Ciqo külmetas kehvas garaažis' }, tr: { name: 'Türkçe', countries: ['TR'], scripts: ['LATIN', 'TURKISH'], sample: 'Pijamalı hasta yağız şoföre çabucak güvendi' },
        ro: { name: 'Română', countries: ['RO', 'MD'], scripts: ['LATIN', 'ROMANIAN'], sample: 'Înjurând pițigăiat, zoofobul comandă vexat whisky și tequila' }, vi: { name: 'Tiếng Việt', countries: ['VN'], scripts: ['LATIN', 'VIETNAMESE'], sample: 'Tiếng Việt có dấu: Trăm năm trong cõi người ta' },
        ru: { name: 'Русский', countries: ['RU'], scripts: ['CYRILLIC'], sample: 'Съешь же ещё этих мягких французских булок, да выпей чаю' }, uk: { name: 'Українська', countries: ['UA'], scripts: ['CYRILLIC'], sample: 'Чуєш їх, доцю, га? Кумедна ж ти, прощайся без ґольфів!' },
        bg: { name: 'Български', countries: ['BG'], scripts: ['CYRILLIC'], sample: 'Жълтата дюля беше щастлива, че пухът, който цъфна, замръзна като гьон' }, sr: { name: 'Српски', countries: ['RS'], scripts: ['CYRILLIC', 'LATIN', 'LATIN_CE'], sample: 'Љубазни фењерџија чађавог лица хоће да ми покаже штос' },
        el: { name: 'Ελληνικά', countries: ['GR', 'CY'], scripts: ['GREEK'], sample: 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία' }
    };
    const ALL = ['LATIN', 'LATIN_CE', 'BALTIC', 'TURKISH', 'ROMANIAN', 'VIETNAMESE', 'CYRILLIC', 'GREEK'], EU = ['LATIN', 'LATIN_CE', 'BALTIC', 'TURKISH', 'ROMANIAN'], WEST = ['LATIN', 'LATIN_CE'];
    const F = (code, name, family, generic, style, scripts, note = '') => ({ code, name, stack: `${family}, ${generic}`, family, generic, style, scripts, note });
    const FONTS = [
        F('SEGOE_UI', 'Segoe UI', "'Segoe UI'", 'sans-serif', 'SANS', [...ALL], 'Windows'), F('ARIAL', 'Arial', 'Arial', 'sans-serif', 'SANS', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE']), F('HELVETICA', 'Helvetica', 'Helvetica, Arial', 'sans-serif', 'SANS', [...EU, 'CYRILLIC', 'GREEK'], 'macOS'),
        F('VERDANA', 'Verdana', 'Verdana', 'sans-serif', 'READABLE', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE']), F('TAHOMA', 'Tahoma', 'Tahoma', 'sans-serif', 'SANS', [...ALL]), F('CALIBRI', 'Calibri', 'Calibri', 'sans-serif', 'SANS', [...ALL], 'Office'),
        F('CANDARA', 'Candara', 'Candara', 'sans-serif', 'ROUNDED', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE'], 'Office'), F('TREBUCHET', 'Trebuchet MS', "'Trebuchet MS'", 'sans-serif', 'SANS', [...EU, 'CYRILLIC', 'GREEK']),
        F('GILL_SANS', 'Gill Sans', "'Gill Sans', 'Gill Sans MT'", 'sans-serif', 'HUMANIST', [...WEST]), F('OPTIMA', 'Optima', 'Optima, Candara', 'sans-serif', 'HUMANIST', [...WEST], 'macOS'),
        F('NOTO_SANS', 'Noto Sans', "'Noto Sans'", 'sans-serif', 'SANS', [...ALL], 'Android / Linux'), F('DEJAVU_SANS', 'DejaVu Sans', "'DejaVu Sans'", 'sans-serif', 'SANS', [...ALL], 'Linux'),
        F('LIBERATION_SANS', 'Liberation Sans', "'Liberation Sans', Arial", 'sans-serif', 'SANS', [...EU, 'CYRILLIC', 'GREEK'], 'Linux'), F('ROBOTO', 'Roboto', 'Roboto', 'sans-serif', 'SANS', [...ALL], 'Android'),
        F('OPEN_SANS', 'Open Sans', "'Open Sans'", 'sans-serif', 'SANS', [...ALL]), F('UBUNTU', 'Ubuntu', 'Ubuntu', 'sans-serif', 'SANS', [...EU, 'CYRILLIC', 'GREEK'], 'Ubuntu'),
        F('SAN_FRANCISCO', 'San Francisco (systém Apple)', '-apple-system, BlinkMacSystemFont', 'sans-serif', 'SANS', [...ALL], 'macOS / iOS'), F('SYSTEM_UI', 'Systémové písmo', 'system-ui', 'sans-serif', 'SANS', [...WEST], 'podle zařízení'),
        F('TIMES', 'Times New Roman', "'Times New Roman', Times", 'serif', 'SERIF', [...ALL]), F('GEORGIA', 'Georgia', 'Georgia', 'serif', 'SERIF', [...EU, 'CYRILLIC', 'GREEK']), F('CAMBRIA', 'Cambria', 'Cambria', 'serif', 'SERIF', [...ALL], 'Office'),
        F('CONSTANTIA', 'Constantia', 'Constantia', 'serif', 'SERIF', [...EU, 'CYRILLIC', 'GREEK'], 'Office'), F('PALATINO', 'Palatino', 'Palatino, "Palatino Linotype", "Book Antiqua"', 'serif', 'SERIF', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE']),
        F('GARAMOND', 'Garamond', 'Garamond, "EB Garamond"', 'serif', 'SERIF', [...WEST]), F('NOTO_SERIF', 'Noto Serif', "'Noto Serif'", 'serif', 'SERIF', [...ALL]), F('DEJAVU_SERIF', 'DejaVu Serif', "'DejaVu Serif'", 'serif', 'SERIF', [...ALL], 'Linux'),
        F('ROCKWELL', 'Rockwell (slab)', 'Rockwell, "Roboto Slab"', 'serif', 'SLAB', [...WEST]), F('COURIER', 'Courier New', "'Courier New', Courier", 'monospace', 'MONO', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE']),
        F('CONSOLAS', 'Consolas', 'Consolas', 'monospace', 'MONO', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE'], 'Windows'), F('DEJAVU_MONO', 'DejaVu Sans Mono', "'DejaVu Sans Mono'", 'monospace', 'MONO', [...ALL], 'Linux'),
        F('CASCADIA', 'Cascadia Code', "'Cascadia Code', 'Cascadia Mono'", 'monospace', 'MONO', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE'], 'Windows'), F('MENLO', 'Menlo / SF Mono', 'Menlo, "SF Mono", Monaco', 'monospace', 'MONO', [...EU, 'CYRILLIC', 'GREEK'], 'macOS'),
        F('IMPACT', 'Impact (titulky)', 'Impact, Haettenschweiler', 'sans-serif', 'DISPLAY', [...EU, 'CYRILLIC', 'GREEK']), F('ARIAL_NARROW', 'Arial Narrow', '"Arial Narrow"', 'sans-serif', 'CONDENSED', [...EU, 'CYRILLIC', 'GREEK']),
        F('FRANKLIN', 'Franklin Gothic', '"Franklin Gothic Medium", "Franklin Gothic"', 'sans-serif', 'DISPLAY', [...EU, 'CYRILLIC', 'GREEK']), F('COMIC', 'Comic Sans MS (dyslexie)', '"Comic Sans MS", "Comic Neue"', 'cursive', 'HANDWRITING', [...EU, 'CYRILLIC', 'GREEK'], 'přátelské k dyslexii'),
        F('SEGOE_PRINT', 'Segoe Print (ručně psané)', '"Segoe Print", "Bradley Hand"', 'cursive', 'HANDWRITING', [...EU, 'CYRILLIC', 'GREEK'], 'Windows'), F('ATKINSON', 'Atkinson Hyperlegible', '"Atkinson Hyperlegible", Verdana', 'sans-serif', 'READABLE', [...WEST], 'pro slabozraké'),
        F('OPENDYSLEXIC', 'OpenDyslexic', 'OpenDyslexic, "Comic Sans MS"', 'sans-serif', 'READABLE', [...WEST], 'pro dyslexii'), F('SITKA', 'Sitka (čitelnost)', 'Sitka, Georgia', 'serif', 'READABLE', [...EU, 'CYRILLIC', 'GREEK', 'VIETNAMESE'], 'Windows')
    ];
    const STYLES = { SANS: 'Bezpatkové', SERIF: 'Patkové', SLAB: 'Slab', MONO: 'Neproporcionální', DISPLAY: 'Titulkové', CONDENSED: 'Úzké', ROUNDED: 'Zaoblené', HUMANIST: 'Humanistické', HANDWRITING: 'Ručně psané', READABLE: 'Čitelnostní' };
    // ---------- readability (same targets as the contrast matrix) ----------
    const HEX = /^#[0-9a-fA-F]{6}$/;
    const lum = (c) => { const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const PAIRS = [['text', ['bg', 'surface', 'surface2'], 4.5], ['muted', ['bg', 'surface'], 4.5], ['accent', ['surface'], 3], ['accent2', ['surface'], 3]];
    function audit(t) { const out = []; for (const [fg, bgs, target] of PAIRS)
        for (const b of bgs) {
            const r = ratio(t[fg], t[b]);
            out.push({ fg, bg: b, ratio: Math.round(r * 100) / 100, target, pass: r >= target });
        } return { pairs: out, failures: out.filter(x => !x.pass) }; }
    const toHsl = (c) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
    } return [h, s, l]; };
    const fromHsl = (h, s, l) => {
        const f = (p, q, t) => { if (t < 0)
            t += 1; if (t > 1)
            t -= 1; if (t < 1 / 6)
            return p + (q - p) * 6 * t; if (t < 1 / 2)
            return q; if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6; return p; };
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        }
        else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
            r = f(p, q, h + 1 / 3);
            g = f(p, q, h);
            b = f(p, q, h - 1 / 3);
        }
        return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
    };
    function autofix(t) {
        const x = { ...t };
        const dark = lum(x.bg) < 0.2;
        for (const [fg, bgs, target] of PAIRS) {
            let [h, s, l] = toHsl(x[fg]);
            for (let k = 0; k < 120 && !bgs.every(b => ratio(x[fg], x[b]) >= target + 0.05); k++) {
                l = dark ? Math.min(1, l + 0.01) : Math.max(0, l - 0.01);
                x[fg] = fromHsl(h, s, l);
            }
        }
        return x;
    }
    function cleanTheme(input) {
        if (!input || input.schema !== 'KX.THEME/1')
            throw new Error('THEME_SCHEMA_INVALID (expected KX.THEME/1)');
        const name = String(input.name || '').trim().slice(0, 60);
        if (!name)
            throw new Error('THEME_NAME_REQUIRED');
        const t = { name, surface2: input.surface2 || input.surface };
        for (const k of ['bg', 'surface', 'surface2', 'text', 'muted', 'accent', 'accent2']) {
            const v = k === 'surface2' ? (input.surface2 || input.surface) : input[k];
            if (!HEX.test(String(v)))
                throw new Error(`THEME_COLOR_INVALID ${k}`);
            t[k] = String(v).toLowerCase();
        }
        t.radius = Math.max(0, Math.min(32, Number(input.radius ?? 14)));
        t.iconStyle = /^[A-Z][A-Z0-9_]{1,29}$/.test(String(input.iconStyle || '')) ? input.iconStyle : 'OUTLINE';
        t.description = String(input.description || 'Importovaný motiv').slice(0, 160);
        return t;
    }
    async function sha256(text) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    const canon = (o) => Array.isArray(o) ? `[${o.map(canon).join(',')}]` : o && typeof o === 'object' ? `{${Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',')}}` : JSON.stringify(o);
    // ---------- N2.2g: icon packs (KX.ICON_PACK/1) ----------
    const CORE_UI = ['TODAY', 'CALENDAR', 'DESK', 'FILES', 'APPS', 'ANALYTICS', 'AI', 'SETTINGS', 'WEATHER', 'NEWS', 'MARKET', 'MINIMIZE'];
    const UI_EXTRA = ['HOME', 'BACK', 'MENU', 'MORE', 'CLOSE', 'LAYOUT', 'WINDOW_FLOAT', 'DOCK_LEFT', 'DOCK_RIGHT', 'PROFILE', 'USERS', 'NOTIFICATIONS', 'HELP', 'INFO', 'ABOUT', 'LOCK', 'UNLOCK', 'SYNC', 'OFFLINE', 'BACKUP',
        'ADD', 'EDIT', 'DELETE', 'SAVE', 'UNDO', 'COPY', 'PIN', 'STAR', 'FILTER', 'SORT', 'SEARCH_ADVANCED', 'IMPORT', 'EXPORT', 'UPLOAD', 'DOWNLOAD', 'SHARE', 'PRINT', 'QR', 'LINK', 'STATISTICS', 'CHART_BAR', 'CHART_LINE', 'GANTT', 'TIMER', 'PROCESS', 'BOARD', 'TABLE',
        'SHOP', 'CART', 'DONATE', 'WEB', 'EMAIL', 'PHONE', 'LOCATION', 'CAMERA', 'MICROPHONE', 'IMAGE', 'VIDEO', 'PROMPT_AI', 'NOTES'];
    const STATES = ['SUCCESS', 'WARNING', 'ERROR', 'RUNNING', 'PAUSED', 'DONE', 'OVERDUE'];
    const UI_ROLES = [...CORE_UI.map(x => 'ICON.UI.' + x), ...UI_EXTRA.filter(x => !CORE_UI.includes(x)).map(x => 'ICON.UI.' + x), ...STATES.map(x => 'ICON.STATE.' + x)];
    /* hubs announced before they are registered (accepted + stored as reserved until the hub exists) and accepted aliases from Icon Studio */
    const RESERVED_HUB_ROLES = ['ICON.KX.NOTES'];
    const ROLE_ALIASES = { 'ICON.KX.NOTEPAD': 'ICON.KX.NOTES', 'ICON.UI.NOTEPAD': 'ICON.UI.NOTES' };
    const PLACED_UI = new Set(CORE_UI.map(x => 'ICON.UI.' + x)); // shown in the UI today (others are stored, reserved for upcoming placements)
    const ICON_MIME = { webp: 'image/webp', png: 'image/png', svg: 'image/svg+xml' };
    const MAX_ICON = 600 * 1024, MAX_PACK = 16 * 1024 * 1024, PTYPE = 'CORE.APPEARANCE.ICON_PACK';
    const UNSAFE_SVG = /<\s*script|<\s*foreignObject|\son[a-z]+\s*=|(?:xlink:)?href\s*=\s*["']?\s*(?:https?:|javascript:|data:)|url\(\s*["']?\s*(?:https?:|javascript:)|<!ENTITY|<\s*iframe|<\s*object|<\s*embed/i;
    /* KX.SVG_SAFETY/1 (icon packs): rules, not only a blacklist. Entities are decoded and white space removed before the checks, so encoded
       or split "javascript:" is caught; SMIL animation (<set>/<animate…>) and links (<a>) are refused; every href must stay inside the file (#id). */
    const TXT = (k) => globalThis.KXI18n?.UI?.[k]?.cs || k;
    const SVG_FORBIDDEN_ELEMENTS = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'a', 'set', 'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'handler', 'listener', 'discard'];
    /* a numeric entity outside Unicode (e.g. &#99999999;) is unsafe content – it used to throw RangeError and abort the WHOLE pack check */
    function svgUnsafe(raw) {
        let bad = false;
        const cp = (n) => { if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) {
            bad = true;
            return '\ufffd';
        } return String.fromCodePoint(n); };
        const decoded = raw.replace(/&#x([0-9a-f]+);?/gi, (_, h) => cp(parseInt(h, 16))).replace(/&#(\d+);?/g, (_, d) => cp(Number(d))).replace(/&colon;/gi, ':').replace(/&tab;|&newline;/gi, '');
        if (bad)
            return TXT('icons.svg.entity');
        if (/<!DOCTYPE|<!ENTITY/i.test(decoded))
            return TXT('icons.svg.doctype');
        if (UNSAFE_SVG.test(decoded))
            return TXT('icons.svg.script');
        const flat = decoded.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
        if (/(?:java|vb)script:/.test(flat))
            return 'javascript: / vbscript:';
        for (const m of decoded.matchAll(/<\s*([a-zA-Z][\w:-]*)/g)) {
            const el = m[1].toLowerCase().replace(/^svg:/, '');
            if (SVG_FORBIDDEN_ELEMENTS.includes(el))
                return `${TXT('icons.svg.element')} <${el}>`;
        }
        for (const m of decoded.matchAll(/(?:xlink:)?href\s*=\s*(["']?)([^"'\s>]*)/gi)) {
            if (!m[2].trim().startsWith('#'))
                return TXT('icons.svg.href');
        }
        /* KX.SVG_SAFETY/1.1 (after the Icon Studio 2.3.0 audit): every url(…) must stay inside the file (#id) – also without a scheme (//host),
           data: and relative files; no @import / @font-face; no src attribute; the root element must be <svg> */
        if (/@import|@font-face/i.test(flat))
            return TXT('icons.svg.css');
        for (const m of flat.matchAll(/url\(([^)]*)\)/g)) {
            const v = m[1].replace(/^["']|["']$/g, '');
            if (!v.startsWith('#'))
                return TXT('icons.svg.url');
        }
        if (/(?:^|[\s"'])src\s*=/i.test(decoded))
            return TXT('icons.svg.src');
        const body = decoded.replace(/^\uFEFF/, '').replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trimStart();
        if (!/^<svg[\s>/]/i.test(body))
            return TXT('icons.svg.root');
        return '';
    }
    const b64bytes = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++)
        u[i] = bin.charCodeAt(i); return u; };
    async function shaBytes(u) { const d = await crypto.subtle.digest('SHA-256', u); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    function knownHubRole(r) { const slots = globalThis.KXAppearanceAssets?.iconSlots?.(); if (Array.isArray(slots) && slots.length)
        return slots.some((x) => x.iconCode === r); return /^ICON\.(KX|CORE)\.[A-Z0-9_]{2,40}$/.test(r); }
    class AppearancePacksService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        fonts(input = {}) {
            const lang = LANGS[input?.language];
            return FONTS.filter(f => (!input?.style || f.style === input.style) && (!lang || lang.scripts.every((s) => f.scripts.includes(s)))).map(f => ({ ...f, styleName: STYLES[f.style], scriptNames: f.scripts.map(s => SCRIPTS[s]),
                languages: Object.entries(LANGS).filter(([, l]) => l.scripts.every((s) => f.scripts.includes(s))).map(([k]) => k) }));
        }
        languages() { return Object.entries(LANGS).map(([code, l]) => ({ code, ...l, fonts: FONTS.filter(f => l.scripts.every((s) => f.scripts.includes(s))).length })); }
        validateTheme(input) { const t = cleanTheme(input); const a = audit(t); return { theme: t, ...a, ok: a.failures.length === 0 }; }
        fixTheme(input) { const t = cleanTheme(input); const fixed = autofix(t); const a = audit(fixed); return { theme: fixed, changed: ['text', 'muted', 'accent', 'accent2'].filter(k => fixed[k] !== t[k]), ...a, ok: a.failures.length === 0 }; }
        exportTheme(t) { return { schema: 'KX.THEME/1', name: t.name, description: t.description || '', bg: t.bg, surface: t.surface, surface2: t.surface2 || t.surface, text: t.text, muted: t.muted, accent: t.accent, accent2: t.accent2, radius: t.radius ?? 14, iconStyle: t.iconStyle || 'OUTLINE', sourceCode: t.code || null }; }
        async personal(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('APPEARANCE_NO_PERSONAL_SPACE'); return s.id; }
        async saveCustomTheme(input, ctx) {
            const v = input?.autofix ? this.fixTheme(input.theme) : this.validateTheme(input?.theme);
            if (!v.ok)
                throw new Error(`THEME_NOT_READABLE: ${v.failures.map((f) => `${f.fg}/${f.bg} ${f.ratio}:1 < ${f.target}:1`).join(', ')}`);
            const r = await this.core.entities.save({ type: CTYPE, ownerApp: OWNER, schema: 'KX.THEME/1', spaceIds: [await this.personal(ctx.actorId)], data: { ...v.theme, owner: ctx.actorId } }, ctx);
            return { id: r.id, code: `THEME.CUSTOM_${r.id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`, theme: v.theme, changed: v.changed || [] };
        }
        async customThemes(actorId) { const out = []; for (const r of await this.core.entities.list()) {
            if (r.type !== CTYPE || r.archivedAt || r.data?.owner !== actorId)
                continue;
            out.push({ id: r.id, code: `THEME.CUSTOM_${r.id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`, ...r.data });
        } return out; }
        async deleteCustomTheme(input, ctx) {
            const r = await this.core.entities.get(input?.id);
            if (!r || r.type !== CTYPE || r.data?.owner !== ctx.actorId)
                throw new Error('THEME_NOT_FOUND');
            return this.core.entities.save({ id: r.id, type: CTYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, archivedAt: new Date().toISOString(), data: r.data }, ctx);
        }
        iconRoles() { const slots = globalThis.KXAppearanceAssets?.iconSlots?.() || []; return { hubAndCore: slots.map((x) => ({ role: x.iconCode, label: x.label, kind: x.kind, required: !!x.required, placed: true })), ui: UI_ROLES.map(r => ({ role: r, placed: PLACED_UI.has(r) })) }; }
        // pack = {manifest, files:{'icons/X.webp':'data:image/webp;base64,…'}} (the Shell unzips *.kxicons.zip in the browser)
        async verifyIconPack(input) {
            const m = input?.manifest, files = input?.files || {};
            if (!m || m.schema !== 'KX.ICON_PACK/1')
                throw new Error('ICON_PACK_SCHEMA_INVALID (expected KX.ICON_PACK/1)');
            const name = String(m.name || '').trim().slice(0, 60);
            if (!name)
                throw new Error('ICON_PACK_NAME_REQUIRED');
            const fmt = String(m.format || '');
            if (!ICON_MIME[fmt])
                throw new Error('ICON_PACK_FORMAT_INVALID (webp / png / svg)');
            const size = Number(m.size);
            if (fmt !== 'svg' && !(Number.isInteger(size) && size >= 128 && size <= 2048))
                throw new Error('ICON_PACK_SIZE_INVALID (128–2048 px, doporučeno 512)');
            if (!Array.isArray(m.icons) || !m.icons.length || m.icons.length > 400)
                throw new Error('ICON_PACK_ICONS_INVALID');
            const seen = new Set(), icons = {}, report = { accepted: [], placed: [], reserved: [], unknown: [], rejected: [], aliased: [], withSmall: [], smallRejected: [] };
            let total = 0;
            const small = {};
            /* one file = the same checks for the main icon and its small variant */
            const checkFile = async (pathRaw, shaRaw) => {
                const path = String(pathRaw || '');
                const ext = path.split('.').pop()?.toLowerCase() || '';
                const url = files[path];
                if (!url || typeof url !== 'string')
                    return { reason: 'soubor chybí v balíčku' };
                const mm = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
                if (!mm || mm[1] !== ICON_MIME[fmt] || ICON_MIME[ext] !== mm[1])
                    return { reason: 'typ souboru neodpovídá formátu sady' };
                const bytes = b64bytes(mm[2]);
                /* content check (magic numbers), not only the extension: WebP = RIFF....WEBP, PNG = 89 50 4E 47 0D 0A 1A 0A, SVG = text with an <svg element */
                const isWebp = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50, isPng = bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b), isSvg = /<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 4096)));
                if (!(fmt === 'webp' ? isWebp : fmt === 'png' ? isPng : isSvg))
                    return { reason: TXT('icons.reason.content') };
                if (bytes.length > MAX_ICON)
                    return { reason: `soubor ${Math.round(bytes.length / 1024)} kB > 600 kB` };
                if (String(shaRaw || '') !== await shaBytes(bytes))
                    return { reason: 'kontrolní součet nesedí (soubor změněn / poškozen)' };
                if (fmt === 'svg') {
                    let why = '';
                    try {
                        why = svgUnsafe(new TextDecoder().decode(bytes));
                    }
                    catch {
                        why = TXT('icons.svg.entity');
                    } /* fail closed per icon, never abort the whole pack */
                    if (why)
                        return { reason: TXT('icons.reason.svg') + ': ' + why };
                }
                return { url, bytes: bytes.length };
            };
            for (const e of m.icons) {
                const asked = String(e?.role || '');
                const role = ROLE_ALIASES[asked] || asked;
                if (role !== asked)
                    (report.aliased = report.aliased || []).push({ from: asked, to: role });
                if (seen.has(role)) {
                    report.rejected.push({ role, reason: 'duplicitní role' });
                    continue;
                }
                seen.add(role);
                const isUi = UI_ROLES.includes(role), isHub = !isUi && knownHubRole(role), isFutureHub = !isUi && !isHub && RESERVED_HUB_ROLES.includes(role);
                if (!isUi && !isHub && !isFutureHub) {
                    report.unknown.push(role);
                    continue;
                }
                const main = await checkFile(e?.file, e?.sha256);
                if (main.reason) {
                    report.rejected.push({ role, reason: main.reason });
                    continue;
                }
                total += main.bytes;
                if (total > MAX_PACK)
                    throw new Error('ICON_PACK_TOO_LARGE (max 16 MB)');
                icons[role] = main.url;
                report.accepted.push(role);
                ((isHub || PLACED_UI.has(role)) && !isFutureHub ? report.placed : report.reserved).push(role);
                /* optional small variant for ≤ 24 CSS px places (sidebar 19 px); a faulty small variant never rejects the main icon */
                if (e?.small?.file) {
                    const sm = await checkFile(e.small.file, e.small.sha256);
                    if (sm.reason)
                        report.smallRejected.push({ role, reason: sm.reason });
                    else {
                        total += sm.bytes;
                        if (total > MAX_PACK)
                            throw new Error('ICON_PACK_TOO_LARGE (max 16 MB)');
                        small[role] = sm.url;
                        report.withSmall.push(role);
                    }
                }
            }
            if (!report.accepted.length)
                throw new Error('ICON_PACK_EMPTY: žádná platná ikona (' + report.rejected.map((x) => x.role + ': ' + x.reason).slice(0, 3).join('; ') + ')');
            return { name, style: String(m.style?.code || 'CUSTOM').slice(0, 40), format: fmt, size: fmt === 'svg' ? null : size, shape: m.shape || 'free', icons, small, report };
        }
        /* every import is a NEW pack (nothing is overwritten); an empty or already used name becomes the catalogue name + number */
        async uniquePackName(actorId, wanted) {
            const used = new Set((await this.iconPacks(actorId)).map((x) => String(x.name).toLowerCase()));
            const w = String(wanted || '').trim().slice(0, 60);
            if (w && !used.has(w.toLowerCase()))
                return w;
            const base = globalThis.KXI18n?.UI?.['icons.customPack']?.cs || 'Custom icon set';
            for (let n = 1; n < 1000; n++) {
                const c = `${base} ${n}`;
                if (!used.has(c.toLowerCase()))
                    return c;
            }
            return `${base} ${Date.now()}`;
        }
        async renameIconPack(input, ctx) {
            const r = await this.core.entities.get(input?.id);
            if (!r || r.type !== PTYPE || r.archivedAt || r.data?.owner !== ctx.actorId)
                throw new Error('ICON_PACK_NOT_FOUND');
            const name = String(input?.name || '').trim().slice(0, 60);
            if (!name)
                throw new Error('ICON_PACK_NAME_REQUIRED');
            if ((await this.iconPacks(ctx.actorId)).some((x) => x.id !== r.id && String(x.name).toLowerCase() === name.toLowerCase()))
                throw new Error('ICON_PACK_NAME_USED');
            await this.core.entities.save({ id: r.id, type: PTYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, data: { ...r.data, name, originalName: r.data.originalName ?? r.data.name } }, ctx);
            return { id: r.id, name };
        }
        async importIconPack(input, ctx) {
            const v0 = await this.verifyIconPack(input);
            const v = { ...v0, originalName: v0.name, name: await this.uniquePackName(ctx.actorId, input?.name ?? v0.name) };
            const r = await this.core.entities.save({ type: PTYPE, ownerApp: OWNER, schema: 'KX.ICON_PACK/1', spaceIds: [await this.personal(ctx.actorId)], data: { ...v, owner: ctx.actorId, importedAt: new Date().toISOString() } }, ctx);
            if (input?.activate)
                await this.activateIconPack({ id: r.id }, ctx);
            return { id: r.id, name: v.name, report: v.report };
        }
        async iconPacks(actorId) {
            const active = await this.activePackId(actorId);
            const out = [];
            for (const r of await this.core.entities.list()) {
                if (r.type !== PTYPE || r.archivedAt || r.data?.owner !== actorId)
                    continue;
                out.push({ id: r.id, name: r.data.name, style: r.data.style, format: r.data.format, size: r.data.size, count: Object.keys(r.data.icons || {}).length, active: r.id === active, report: r.data.report });
            }
            return out;
        }
        async activePackId(actorId) { const rows = await this.core.settings.list('appearance.iconPack.active'); return rows.find((x) => x.scopeType === 'USER' && x.scopeId === actorId)?.value || null; }
        async activateIconPack(input, ctx) {
            const id = input?.id || null;
            if (id) {
                const r = await this.core.entities.get(id);
                if (!r || r.type !== PTYPE || r.archivedAt || r.data?.owner !== ctx.actorId)
                    throw new Error('ICON_PACK_NOT_FOUND');
            }
            /* the user's own USER-scoped setting only: the permission is granted narrowly for this one key */ await this.core.settings.set({ key: 'appearance.iconPack.active', scopeType: 'USER', scopeId: ctx.actorId, value: id }, { ...ctx, permissions: [...new Set([...(ctx.permissions || []), 'CORE.SETTING.READ', 'CORE.SETTING.EDIT'])] });
            return { active: id };
        }
        async activeIcons(actorId) { const id = await this.activePackId(actorId); if (!id)
            return { id: null, icons: {} }; const r = await this.core.entities.get(id); if (!r || r.archivedAt || r.data?.owner !== actorId)
            return { id: null, icons: {} }; return { id, name: r.data.name, icons: r.data.icons || {}, small: r.data.small || {} }; }
        async deleteIconPack(input, ctx) {
            const r = await this.core.entities.get(input?.id);
            if (!r || r.type !== PTYPE || r.data?.owner !== ctx.actorId)
                throw new Error('ICON_PACK_NOT_FOUND');
            if (await this.activePackId(ctx.actorId) === r.id)
                await this.activateIconPack({ id: null }, ctx);
            return this.core.entities.save({ id: r.id, type: PTYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, archivedAt: new Date().toISOString(), data: r.data }, ctx);
        }
        async buildPackage(input) {
            const content = { theme: this.exportTheme(input?.theme || {}), iconStyle: String(input?.iconStyle || 'AUTO'), fontProfile: String(input?.fontProfile || 'AUTO'), font: input?.font || null, layout: input?.layout || null };
            this.validateTheme(content.theme);
            return { schema: 'KX.APPEARANCE_PACKAGE/1', name: String(input?.name || content.theme.name).slice(0, 60), createdAt: new Date().toISOString(), content, sha256: await sha256(canon(content)) };
        }
        async verifyPackage(pkg) {
            if (!pkg || pkg.schema !== 'KX.APPEARANCE_PACKAGE/1')
                throw new Error('PACKAGE_SCHEMA_INVALID');
            const h = await sha256(canon(pkg.content || {}));
            if (h !== pkg.sha256)
                throw new Error('PACKAGE_CHECKSUM_MISMATCH (soubor byl změněn nebo poškozen)');
            const v = this.validateTheme(pkg.content.theme);
            if (pkg.content.font && !FONTS.some(f => f.code === pkg.content.font))
                throw new Error('PACKAGE_FONT_UNKNOWN');
            return { ok: true, themeReadable: v.ok, failures: v.failures, content: pkg.content };
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.FONTS = FONTS;
    NS.LANGS = LANGS;
    NS.SCRIPTS = SCRIPTS;
    NS.STYLES = STYLES;
    NS.ratio = ratio;
    NS.audit = audit;
    NS.UI_ROLES = UI_ROLES;
    NS.RESERVED_HUB_ROLES = RESERVED_HUB_ROLES;
    NS.ROLE_ALIASES = ROLE_ALIASES;
    NS.svgUnsafe = svgUnsafe;
    NS.SVG_FORBIDDEN_ELEMENTS = SVG_FORBIDDEN_ELEMENTS;
    NS.PLACED_UI = [...PLACED_UI];
    NS.AppearancePacksService = AppearancePacksService;
    NS.install = (core, options = {}) => {
        if (core.appearancePacks)
            throw new Error('Appearance packs already installed');
        if (!core?.entities?.save)
            throw new Error('Appearance packs require Core entities');
        const svc = new AppearancePacksService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.APPEARANCE.FONTS', 'READ', async (p) => svc.fonts(p || {})], ['ACTION.CORE.APPEARANCE.LANGUAGES', 'READ', async () => svc.languages()],
            ['ACTION.CORE.APPEARANCE.THEME.VALIDATE', 'READ', async (p) => svc.validateTheme(p?.theme)], ['ACTION.CORE.APPEARANCE.THEME.FIX', 'READ', async (p) => svc.fixTheme(p?.theme)],
            ['ACTION.CORE.APPEARANCE.THEME.IMPORT', 'SAFE_WRITE', (p, c) => svc.saveCustomTheme(p, c)], ['ACTION.CORE.APPEARANCE.THEME.CUSTOM_LIST', 'READ', (_p, c) => svc.customThemes(c.actorId)],
            ['ACTION.CORE.APPEARANCE.THEME.CUSTOM_DELETE', 'SAFE_WRITE', (p, c) => svc.deleteCustomTheme(p, c)], ['ACTION.CORE.APPEARANCE.PACKAGE.BUILD', 'READ', async (p) => svc.buildPackage(p)],
            ['ACTION.CORE.APPEARANCE.ICONS.ROLES', 'READ', async () => svc.iconRoles()], ['ACTION.CORE.APPEARANCE.ICONS.VERIFY', 'READ', async (p) => { const v = await svc.verifyIconPack(p); return { name: v.name, format: v.format, size: v.size, report: v.report }; }],
            ['ACTION.CORE.APPEARANCE.ICONS.IMPORT', 'SAFE_WRITE', (p, c) => svc.importIconPack(p, c)], ['ACTION.CORE.APPEARANCE.ICONS.PACKS', 'READ', (_p, c) => svc.iconPacks(c.actorId)],
            ['ACTION.CORE.APPEARANCE.ICONS.ACTIVATE', 'SAFE_WRITE', (p, c) => svc.activateIconPack(p, c)], ['ACTION.CORE.APPEARANCE.ICONS.ACTIVE', 'READ', (_p, c) => svc.activeIcons(c.actorId)], ['ACTION.CORE.APPEARANCE.ICONS.DELETE', 'SAFE_WRITE', (p, c) => svc.deleteIconPack(p, c)], ['ACTION.CORE.APPEARANCE.ICONS.RENAME', 'SAFE_WRITE', (p, c) => svc.renameIconPack(p, c)], ['ACTION.CORE.APPEARANCE.PACKAGE.VERIFY', 'READ', async (p) => svc.verifyPackage(p?.package)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.appearancePacks = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.appearancePacks;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, fonts: FONTS.length });
    };
})(KXAppearancePacks || (KXAppearancePacks = {}));
