// N2.2c (R61): profil značky + načítací obrazovka (KX.CORE_BRAND/1).
//  - ONE profile per workspace (shared family space): brand name (+ typography), tagline, logo, image, website, e-mail,
//    Donate button, version line — every element: value + show / hide + ADMIN LOCK;
//  - splash settings: template, progress style (12 styles), percent / current step / step list / elapsed, threshold
//    (show only when start-up is slower), minimal time, skippable, background, tips, animation, reduced motion;
//  - locks: changing a LOCKED element or any lock itself needs MANAGE in the shared space; other edits need EDIT;
//  - strict validation: http(s) links only, mailto-safe e-mail, #hex colours, bounded sizes, raster images only
//    (png / jpeg / webp / gif data URLs ≤ 512 kB — no SVG / script payloads);
//  - snapshot(): compact copy the Shell caches locally, because the splash is shown BEFORE Core / IndexedDB load.
var KXBrand;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_BRAND/1', TYPE = 'CORE.BRAND', ID = 'BRAND.WORKSPACE';
    // N2.2c: doubled — 24 progress styles (same list as KXSplash.STYLES), 16 brand fonts, 40 templates
    const PROGRESS = ['BAR', 'BAR_STEPS', 'BAR_STRIPED', 'BAR_GRADIENT', 'BAR_THICK', 'TOPLINE', 'SEGMENTS', 'CIRCLE', 'RING_THIN', 'RING_DUAL', 'ARC', 'ARC_HALF', 'DOTS', 'DOTS_WAVE', 'SQUARES', 'PULSE_LOGO', 'LOGO_FILL', 'LOGO_SPIN', 'PERCENT', 'TERMINAL', 'COUNTER', 'LETTERS', 'SPINNER', 'SKELETON'];
    const FONTS = ['system-ui', 'Inter', 'Georgia', 'Montserrat', 'Playfair Display', 'Roboto Mono', 'Oswald', 'Lora', 'Segoe UI', 'Verdana', 'Trebuchet MS', 'Courier New', 'Garamond', 'Raleway', 'Poppins', 'Bebas Neue'];
    const ANIM = ['FADE', 'SLIDE', 'ZOOM', 'NONE'];
    const BG = ['COLOR', 'GRADIENT', 'IMAGE'];
    const HEX = /^#[0-9a-fA-F]{6}$/;
    const URL_RE = /^https?:\/\/[^\s"'<>]{3,500}$/;
    const MAIL = /^[^\s@"'<>]{1,64}@[^\s@"'<>]{1,190}\.[a-z]{2,24}$/i;
    const IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
    const MAX_IMG = 512 * 1024;
    const el = (extra = {}) => ({ show: true, locked: false, ...extra });
    const DEFAULT = () => ({ brand: { name: el({ text: 'KalinumX NEXUS', font: 'system-ui', size: 44, weight: 800, color: '#f5d26b', gradient: null, spacing: 0, shadow: true }),
            tagline: el({ text: 'Vše na jednom místě' }), logo: el({ src: null, size: 96 }), image: el({ src: null, fit: 'cover', opacity: 0.55 }),
            website: el({ url: 'https://kalinumx.com', label: 'kalinumx.com', show: true }), email: el({ address: null, show: false }),
            donate: el({ label: 'Podpořit vývoj', url: null, style: 'GOLD', show: false }), version: el({ show: true }) },
        splash: { template: 'laser-classic', progress: { style: 'BAR_STEPS', showPercent: true, showStep: true, showSteps: true, showElapsed: false }, thresholdMs: 400, minMs: 0, skippable: true,
            background: { type: 'IMAGE', color: '#0b0d12', gradient: ['#0b0d12', '#2a2112'], blur: 0, dim: 0.45 }, tips: { show: true, items: ['Ctrl/Cmd + K otevře hledání i nastavení.', '⊞ Rozložení otevře huby a nástroje vedle sebe.', '📊 Přehledy si připnete na Můj den.'] },
            animation: 'FADE', reducedMotion: true, theme: 'AUTO', locked: false } });
    // 20 splash templates: style of the splash + typography of the brand name (content – texts, links, images – is kept)
    const T = (id, name, progress, bg, nameStyle, extra = {}) => ({ id, name, splash: { progress: { style: progress }, background: bg, ...extra }, nameStyle });
    const TEMPLATES = [
        T('laser-classic', 'LASER Classic', 'BAR_STEPS', { type: 'IMAGE', dim: 0.45 }, { font: 'system-ui', color: '#f5d26b', weight: 800 }),
        T('minimal', 'Minimal', 'TOPLINE', { type: 'COLOR', color: '#ffffff' }, { font: 'Inter', color: '#111111', weight: 600 }, { theme: 'LIGHT' }),
        T('brand-center', 'Značka uprostřed', 'CIRCLE', { type: 'COLOR', color: '#0b0d12' }, { font: 'Montserrat', color: '#ffffff', weight: 800 }),
        T('photo-full', 'Fotografie přes celou plochu', 'BAR', { type: 'IMAGE', dim: 0.25, blur: 0 }, { font: 'Playfair Display', color: '#ffffff', weight: 700 }),
        T('neon', 'Neon', 'ARC', { type: 'GRADIENT', gradient: ['#05010f', '#1b0a3a'] }, { font: 'Oswald', color: '#39ff14', weight: 700, shadow: true }),
        T('gradient', 'Přechod', 'DOTS', { type: 'GRADIENT', gradient: ['#1e3c72', '#2a5298'] }, { font: 'Inter', color: '#ffffff', weight: 700 }),
        T('terminal', 'Terminál', 'TERMINAL', { type: 'COLOR', color: '#000000' }, { font: 'Roboto Mono', color: '#33ff99', weight: 500 }, { tips: { show: false } }),
        T('corporate', 'Firemní', 'BAR', { type: 'COLOR', color: '#f4f6f9' }, { font: 'Inter', color: '#0a2540', weight: 700 }, { theme: 'LIGHT' }),
        T('family', 'Rodinná', 'PULSE_LOGO', { type: 'GRADIENT', gradient: ['#fff1e6', '#ffd6a5'] }, { font: 'Lora', color: '#7a3e00', weight: 700 }, { theme: 'LIGHT' }),
        T('circle', 'Kruh s procenty', 'CIRCLE', { type: 'GRADIENT', gradient: ['#0b0d12', '#1c2333'] }, { font: 'Montserrat', color: '#e8eaf0', weight: 700 }),
        T('gold-arc', 'Zlatý oblouk', 'ARC', { type: 'COLOR', color: '#111111' }, { font: 'Playfair Display', color: '#d4af37', weight: 700 }),
        T('dots', 'Tečky', 'DOTS', { type: 'COLOR', color: '#121212' }, { font: 'system-ui', color: '#ffffff', weight: 700 }),
        T('glass', 'Sklo', 'BAR_STEPS', { type: 'IMAGE', blur: 12, dim: 0.2 }, { font: 'Inter', color: '#ffffff', weight: 600 }),
        T('retro', 'Retro', 'PERCENT', { type: 'COLOR', color: '#2b1d0e' }, { font: 'Oswald', color: '#ffb347', weight: 700 }),
        T('mono', 'Mono', 'SPINNER', { type: 'COLOR', color: '#ffffff' }, { font: 'Roboto Mono', color: '#000000', weight: 600 }, { theme: 'LIGHT' }),
        T('workshop', 'Dílna', 'BAR_STEPS', { type: 'GRADIENT', gradient: ['#1a1a1a', '#3a2a10'] }, { font: 'Oswald', color: '#f5d26b', weight: 700 }),
        T('logo-fill', 'Plnící se logo', 'LOGO_FILL', { type: 'COLOR', color: '#0b0d12' }, { font: 'Montserrat', color: '#f5d26b', weight: 800 }),
        T('skeleton', 'Kostra stránky', 'SKELETON', { type: 'COLOR', color: '#f7f7f9' }, { font: 'Inter', color: '#222222', weight: 600 }, { theme: 'LIGHT' }),
        T('night', 'Noc', 'TOPLINE', { type: 'GRADIENT', gradient: ['#000000', '#0f2027'] }, { font: 'system-ui', color: '#9ecbff', weight: 600 }),
        T('festive', 'Slavnostní', 'PULSE_LOGO', { type: 'GRADIENT', gradient: ['#3a0ca3', '#f72585'] }, { font: 'Playfair Display', color: '#ffffff', weight: 800 }),
        T('striped', 'Pruhovaný pás', 'BAR_STRIPED', { type: 'COLOR', color: '#101820' }, { font: 'Poppins', color: '#fee715', weight: 800 }),
        T('sunrise', 'Východ slunce', 'BAR_GRADIENT', { type: 'GRADIENT', gradient: ['#ff7e5f', '#feb47b'] }, { font: 'Raleway', color: '#ffffff', weight: 800 }),
        T('industrial', 'Průmysl', 'BAR_THICK', { type: 'COLOR', color: '#2b2b2b' }, { font: 'Bebas Neue', color: '#ff9f1c', weight: 700 }),
        T('segments', 'Segmenty kroků', 'SEGMENTS', { type: 'COLOR', color: '#0f172a' }, { font: 'Inter', color: '#38bdf8', weight: 700 }),
        T('ring-thin', 'Tenký prstenec', 'RING_THIN', { type: 'COLOR', color: '#ffffff' }, { font: 'Raleway', color: '#1f2937', weight: 600 }, { theme: 'LIGHT' }),
        T('dual-ring', 'Dvojitý prstenec', 'RING_DUAL', { type: 'GRADIENT', gradient: ['#000428', '#004e92'] }, { font: 'Montserrat', color: '#7dd3fc', weight: 700 }),
        T('half-arc', 'Půloblouk', 'ARC_HALF', { type: 'COLOR', color: '#1c1917' }, { font: 'Garamond', color: '#fbbf24', weight: 700 }),
        T('wave', 'Vlna teček', 'DOTS_WAVE', { type: 'GRADIENT', gradient: ['#0f766e', '#115e59'] }, { font: 'Poppins', color: '#ccfbf1', weight: 700 }),
        T('blocks', 'Kostky', 'SQUARES', { type: 'COLOR', color: '#111827' }, { font: 'Verdana', color: '#f472b6', weight: 700 }),
        T('logo-spin', 'Otáčející se logo', 'LOGO_SPIN', { type: 'COLOR', color: '#0b0d12' }, { font: 'Montserrat', color: '#f5d26b', weight: 800 }),
        T('counter', 'Počítadlo kroků', 'COUNTER', { type: 'COLOR', color: '#18181b' }, { font: 'Courier New', color: '#a3e635', weight: 700 }),
        T('letters', 'Rozsvěcená písmena', 'LETTERS', { type: 'COLOR', color: '#020617' }, { font: 'Bebas Neue', color: '#facc15', weight: 700 }),
        T('office', 'Kancelář', 'BAR', { type: 'COLOR', color: '#eef2f7' }, { font: 'Segoe UI', color: '#1e3a8a', weight: 700 }, { theme: 'LIGHT' }),
        T('forest', 'Les', 'DOTS', { type: 'GRADIENT', gradient: ['#134e5e', '#71b280'] }, { font: 'Lora', color: '#f0fdf4', weight: 700 }),
        T('ocean', 'Oceán', 'CIRCLE', { type: 'GRADIENT', gradient: ['#2193b0', '#6dd5ed'] }, { font: 'Trebuchet MS', color: '#ffffff', weight: 700 }),
        T('paper', 'Papír', 'TOPLINE', { type: 'COLOR', color: '#fbf7ef' }, { font: 'Georgia', color: '#3f3f46', weight: 700 }, { theme: 'LIGHT' }),
        T('cyber', 'Kyber', 'TERMINAL', { type: 'GRADIENT', gradient: ['#0d0221', '#261447'] }, { font: 'Roboto Mono', color: '#ff2a6d', weight: 600 }),
        T('luxury', 'Luxus', 'ARC', { type: 'GRADIENT', gradient: ['#0b0b0b', '#2a2216'] }, { font: 'Playfair Display', color: '#e6c76a', weight: 800 }),
        T('kids', 'Dětská', 'PULSE_LOGO', { type: 'GRADIENT', gradient: ['#fde68a', '#fca5a5'] }, { font: 'Poppins', color: '#7c2d12', weight: 800 }, { theme: 'LIGHT' }),
        T('aurora', 'Polární záře', 'BAR_GRADIENT', { type: 'GRADIENT', gradient: ['#0f2027', '#2c5364'] }, { font: 'Raleway', color: '#a7f3d0', weight: 800 })
    ];
    const clampN = (v, a, b, f) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : f; };
    const merge = (base, add) => { if (!add || typeof add !== 'object' || Array.isArray(add))
        return add === undefined ? base : add; const o = { ...base }; for (const k of Object.keys(add))
        o[k] = base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? merge(base[k], add[k]) : add[k]; return o; };
    function validateImage(v, f) { if (v === null)
        return null; if (typeof v !== 'string' || !IMG.test(v))
        throw new Error(`BRAND_IMAGE_INVALID ${f} (png / jpeg / webp / gif)`); if (Math.ceil(v.length * 0.75) > MAX_IMG)
        throw new Error(`BRAND_IMAGE_TOO_LARGE ${f} (max 512 kB)`); return v; }
    function clean(d) {
        const b = d.brand, s = d.splash;
        if (typeof b.name.text !== 'string' || !b.name.text.trim())
            throw new Error('BRAND_NAME_REQUIRED');
        b.name.text = b.name.text.slice(0, 80);
        if (!FONTS.includes(b.name.font))
            throw new Error('BRAND_FONT_INVALID');
        b.name.size = clampN(b.name.size, 12, 120, 44);
        b.name.weight = clampN(b.name.weight, 300, 900, 800);
        b.name.spacing = clampN(b.name.spacing, -5, 20, 0);
        if (!HEX.test(b.name.color))
            throw new Error('BRAND_COLOR_INVALID');
        if (b.name.gradient !== null && !(Array.isArray(b.name.gradient) && b.name.gradient.length === 2 && b.name.gradient.every((c) => HEX.test(c))))
            throw new Error('BRAND_GRADIENT_INVALID');
        b.tagline.text = String(b.tagline.text ?? '').slice(0, 160);
        b.logo.src = validateImage(b.logo.src, 'logo');
        b.logo.size = clampN(b.logo.size, 24, 320, 96);
        b.image.src = validateImage(b.image.src, 'image');
        b.image.opacity = clampN(b.image.opacity, 0, 1, 0.55);
        if (!['cover', 'contain'].includes(b.image.fit))
            throw new Error('BRAND_FIT_INVALID');
        if (b.website.url !== null && !URL_RE.test(String(b.website.url)))
            throw new Error('BRAND_URL_INVALID website (http/https)');
        b.website.label = String(b.website.label ?? '').slice(0, 80);
        if (b.email.address !== null && !MAIL.test(String(b.email.address)))
            throw new Error('BRAND_EMAIL_INVALID');
        if (b.donate.url !== null && !URL_RE.test(String(b.donate.url)))
            throw new Error('BRAND_URL_INVALID donate (http/https)');
        b.donate.label = String(b.donate.label || 'Podpořit').slice(0, 40);
        if (!['GOLD', 'OUTLINE', 'PILL', 'LINK'].includes(b.donate.style))
            throw new Error('BRAND_DONATE_STYLE_INVALID');
        if (!PROGRESS.includes(s.progress.style))
            throw new Error('SPLASH_PROGRESS_INVALID');
        s.thresholdMs = clampN(s.thresholdMs, 0, 10000, 400);
        s.minMs = clampN(s.minMs, 0, 10000, 0);
        if (!BG.includes(s.background.type))
            throw new Error('SPLASH_BACKGROUND_INVALID');
        if (!HEX.test(s.background.color))
            throw new Error('SPLASH_COLOR_INVALID');
        if (!(Array.isArray(s.background.gradient) && s.background.gradient.length === 2 && s.background.gradient.every((c) => HEX.test(c))))
            throw new Error('SPLASH_GRADIENT_INVALID');
        s.background.blur = clampN(s.background.blur, 0, 40, 0);
        s.background.dim = clampN(s.background.dim, 0, 0.95, 0.45);
        if (!ANIM.includes(s.animation))
            throw new Error('SPLASH_ANIMATION_INVALID');
        if (!['AUTO', 'DARK', 'LIGHT'].includes(s.theme))
            throw new Error('SPLASH_THEME_INVALID');
        s.tips.items = (Array.isArray(s.tips.items) ? s.tips.items : []).map((x) => String(x).slice(0, 160)).slice(0, 30);
        if (!TEMPLATES.some(t => t.id === s.template))
            s.template = 'custom';
        return d;
    }
    // locked paths: brand.<el>.locked and splash.locked
    const lockedOf = (d) => { const out = {}; for (const k of Object.keys(d.brand))
        out['brand.' + k] = !!d.brand[k].locked; out.splash = !!d.splash.locked; return out; };
    const touched = (patch) => { const out = new Set(); for (const k of Object.keys(patch?.brand || {}))
        out.add('brand.' + k); if (patch?.splash)
        out.add('splash'); return out; };
    class BrandService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        async row() { const r = await this.core.repository.get('entities', ID); return r && r.type === TYPE && !r.archivedAt ? r : null; }
        async get(actorId) {
            const r = await this.row();
            const d = clean(merge(DEFAULT(), r?.data || {}));
            let role = null;
            if (actorId)
                role = await this.sharedRole(actorId);
            return { ...d, revision: r?.revision || 0, canEdit: role === 'EDIT' || role === 'MANAGE', canManage: role === 'MANAGE', version: this.opts.version || null, templates: TEMPLATES.map(t => ({ id: t.id, name: t.name, progress: t.splash.progress.style })) };
        }
        async sharedSpace() { const fam = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'FAMILY' && !x.archivedAt); return fam || null; }
        async sharedRole(actorId) { const fam = await this.sharedSpace(); if (!fam) {
            return actorId ? 'MANAGE' : null;
        } return this.core.memberships.roleFor(fam.id, actorId); }
        // N2.2c fix: quick successive edits (each field saves on change) used to collide on the revision and the later one was
        // lost — without an explicit expectedRevision the patch is re-applied on the fresh record (max 3 attempts)
        async set(input, ctx) { for (let a = 0;; a++) {
            try {
                return await this.setOnce(input, ctx);
            }
            catch (e) {
                if (a < 3 && !Number.isInteger(input?.expectedRevision) && String(e?.message || e).includes('Revision conflict'))
                    continue;
                throw e;
            }
        } }
        async setOnce(input, ctx) {
            const role = await this.sharedRole(ctx.actorId);
            if (!['EDIT', 'MANAGE'].includes(role))
                throw new Error('Scope denied: EDIT required to change the brand profile');
            const r = await this.row();
            const cur = clean(merge(DEFAULT(), r?.data || {}));
            const patch = input?.patch || {};
            for (const k of Object.keys(patch))
                if (!['brand', 'splash'].includes(k))
                    throw new Error(`BRAND_PATCH_NOT_ALLOWED ${k}`);
            for (const k of Object.keys(patch.brand || {}))
                if (!(k in cur.brand))
                    throw new Error(`BRAND_PATCH_NOT_ALLOWED brand.${k}`);
            const locks = lockedOf(cur);
            const t = touched(patch);
            if (role !== 'MANAGE') {
                for (const p of t)
                    if (locks[p])
                        throw new Error(`BRAND_LOCKED ${p}: zamčeno správcem`);
                for (const k of Object.keys(patch.brand || {}))
                    if ('locked' in (patch.brand[k] || {}))
                        throw new Error('Scope denied: only a manager can lock / unlock');
                if (patch.splash && 'locked' in patch.splash)
                    throw new Error('Scope denied: only a manager can lock / unlock');
            }
            const next = clean(merge(cur, patch));
            const fam = await this.sharedSpace();
            await this.core.entities.save({ id: ID, type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_BRAND/1', spaceIds: r?.spaceIds || (fam ? [fam.id] : []), expectedRevision: Number.isInteger(input?.expectedRevision) ? input.expectedRevision : (r?.revision || 0), data: { brand: next.brand, splash: next.splash } }, ctx);
            return this.get(ctx.actorId);
        }
        async applyTemplate(input, ctx) {
            const t = TEMPLATES.find(x => x.id === input?.templateId);
            if (!t)
                throw new Error('SPLASH_TEMPLATE_UNKNOWN');
            const cur = await this.get(ctx.actorId);
            const patch = { splash: { ...t.splash, progress: { ...cur.splash.progress, ...t.splash.progress }, background: { ...cur.splash.background, ...t.splash.background }, template: t.id } };
            if (!cur.brand.name.locked || cur.canManage)
                patch.brand = { name: { ...t.nameStyle } };
            return this.set({ patch }, ctx);
        }
        async snapshot() { const d = await this.get(); return { v: 1, at: new Date().toISOString(), brand: d.brand, splash: d.splash, version: d.version }; }
    }
    NS.CONTRACT = CONTRACT;
    NS.PROGRESS = PROGRESS;
    NS.FONTS = FONTS;
    NS.TEMPLATES = TEMPLATES;
    NS.DEFAULT = DEFAULT;
    NS.BrandService = BrandService;
    NS.install = (core, options = {}) => {
        if (core.brand)
            throw new Error('Brand already installed');
        if (!core?.entities?.save)
            throw new Error('Brand requires Core entities');
        const svc = new BrandService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.BRAND.GET', 'READ', (_p, c) => svc.get(c.actorId)], ['ACTION.CORE.BRAND.SET', 'SAFE_WRITE', (p, c) => svc.set(p, c)], ['ACTION.CORE.BRAND.APPLY_TEMPLATE', 'SAFE_WRITE', (p, c) => svc.applyTemplate(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.brand = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.brand;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, templates: TEMPLATES.length });
    };
})(KXBrand || (KXBrand = {}));
