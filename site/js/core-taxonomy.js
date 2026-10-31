var KXTaxonomy;
(function (NS) {
    const BUILTIN = {
        'CAT.CORE': { family: 'CORE', cs: 'Jádro', en: 'Core' }, 'CAT.PLATFORM': { family: 'Platforma a systém', cs: 'Platforma a systém', en: 'Platform & System' },
        'CAT.PRODUCTION': { family: 'Výroba a technika', cs: 'Výroba a technika', en: 'Production & Engineering' }, 'CAT.BUSINESS': { family: 'Práce a firma', cs: 'Práce a firma', en: 'Work & Business' },
        'CAT.COLLAB': { family: 'Spolupráce a organizace', cs: 'Spolupráce a organizace', en: 'Collaboration & Organisation' }, 'CAT.CONTENT': { family: 'Obsah a média', cs: 'Obsah a média', en: 'Content & Media' },
        'CAT.LOGISTICS': { family: 'Logistika', cs: 'Logistika', en: 'Logistics' }, 'CAT.FAMILY': { family: 'Rodina a domácnost', cs: 'Rodina a domácnost', en: 'Family & Household' },
        'CAT.ANALYTICS': { family: 'Analýzy', cs: 'Analýzy', en: 'Analytics' }
    };
    const KEY = 'taxonomy.custom', MAX = 200, MAX_DEPTH = 3, LOCALES = ['cs', 'en'];
    const clean = (v) => { if (typeof v !== 'string')
        throw new Error('TAXONOMY_LABEL_INVALID'); const t = v.normalize('NFC').trim(); if (!t || t.length > 60)
        throw new Error('TAXONOMY_LABEL_LENGTH_1_60'); if (/[\u0000-\u001f\u007f<>]/.test(t))
        throw new Error('TAXONOMY_LABEL_FORBIDDEN_CHARS'); return t; };
    const empty = () => ({ version: 1, categories: {}, hubPlacement: {} });
    class TaxonomyService {
        core;
        constructor(core) {
            this.core = core;
        }
        i18n() { if (!this.core.i18n)
            throw new Error('TAXONOMY_REQUIRES_I18N'); return this.core.i18n; }
        scopeOf(input, ctx) { const t = input?.scope === 'WORKSPACE' ? 'WORKSPACE' : 'USER'; const id = t === 'USER' ? ctx.actorId : String(input?.scopeId || ''); if (!id)
            throw new Error('TAXONOMY_SCOPE_ID_REQUIRED'); return { t, id }; }
        async read(t, id) { const r = (await this.core.settings.list(KEY)).find((x) => x.scopeType === t && x.scopeId === id); return r?.value ? { ...empty(), ...r.value, categories: { ...(r.value.categories || {}) }, hubPlacement: { ...(r.value.hubPlacement || {}) } } : empty(); }
        async write(t, id, v, ctx) { await this.core.settings.set({ key: KEY, scopeType: t, scopeId: id, value: v }, ctx); }
        async tree(actorId, workspaceId, locale = 'cs') {
            const ws = workspaceId ? await this.read('WORKSPACE', workspaceId) : empty(), me = await this.read('USER', actorId);
            const cats = {};
            for (const [code, b] of Object.entries(BUILTIN))
                cats[code] = { code, parent: null, builtin: true, label: b[locale] || b.cs, children: [], hubs: [] };
            for (const src of [ws, me])
                for (const [code, c] of Object.entries(src.categories))
                    cats[code] = { code, parent: c.parent, builtin: false, label: c.labels?.[locale] || c.labels?.cs || code, children: [], hubs: [], scope: src === me ? 'USER' : 'WORKSPACE' };
            for (const c of Object.values(cats))
                if (c.parent && cats[c.parent])
                    cats[c.parent].children.push(c.code);
            const i = this.i18n();
            const fam2cat = Object.fromEntries(Object.entries(BUILTIN).map(([k, b]) => [b.family, k]));
            for (const hub of i.hubs()) {
                const placed = me.hubPlacement[hub] || ws.hubPlacement[hub];
                const target = placed && cats[placed] ? placed : fam2cat[i.defaults(hub, 'cs').family];
                cats[target].hubs.push(hub);
            }
            return { contract: 'KX.CORE_TAXONOMY/1', locale, roots: Object.keys(BUILTIN), categories: cats };
        }
        async depthOf(code, store) { let d = 1, cur = store.categories[code]; while (cur && cur.parent && !BUILTIN[cur.parent]) {
            d++;
            cur = store.categories[cur.parent];
            if (d > MAX_DEPTH + 1)
                break;
        } return d; }
        async addCategory(input, ctx) {
            const { t, id } = this.scopeOf(input, ctx);
            const store = await this.read(t, id);
            const parent = String(input?.parent || '');
            if (!BUILTIN[parent] && !store.categories[parent])
                throw new Error('TAXONOMY_PARENT_UNKNOWN');
            if (Object.keys(store.categories).length >= MAX)
                throw new Error('TAXONOMY_TOO_MANY');
            const labels = { cs: clean(input?.labels?.cs) };
            if (input?.labels?.en !== undefined)
                labels.en = clean(input.labels.en);
            const code = 'CAT.U.' + crypto.randomUUID();
            const parentDepth = BUILTIN[parent] ? 0 : await this.depthOf(parent, store);
            if (parentDepth + 1 > MAX_DEPTH)
                throw new Error('TAXONOMY_TOO_DEEP');
            store.categories[code] = { parent, labels };
            await this.write(t, id, store, ctx);
            return { code, parent, labels };
        }
        async renameCategory(input, ctx) {
            const { t, id } = this.scopeOf(input, ctx);
            const store = await this.read(t, id);
            const c = store.categories[input?.code];
            if (!c)
                throw new Error(BUILTIN[input?.code] ? 'TAXONOMY_BUILTIN_RENAME_VIA_I18N_PLANNED' : 'TAXONOMY_CATEGORY_UNKNOWN');
            if (!LOCALES.includes(input?.locale))
                throw new Error('TAXONOMY_UNKNOWN_LOCALE');
            c.labels = { ...c.labels, [input.locale]: clean(input?.label) };
            await this.write(t, id, store, ctx);
            return { code: input.code, labels: c.labels };
        }
        async removeCategory(input, ctx) {
            const { t, id } = this.scopeOf(input, ctx);
            const store = await this.read(t, id);
            const code = input?.code;
            if (!store.categories[code])
                throw new Error('TAXONOMY_CATEGORY_UNKNOWN');
            if (Object.values(store.categories).some(c => c.parent === code))
                throw new Error('TAXONOMY_HAS_CHILDREN');
            if (Object.values(store.hubPlacement).includes(code))
                throw new Error('TAXONOMY_HAS_HUBS');
            delete store.categories[code];
            await this.write(t, id, store, ctx);
            return { removed: code };
        }
        async moveHub(input, ctx) {
            const { t, id } = this.scopeOf(input, ctx);
            const store = await this.read(t, id);
            const i = this.i18n();
            const hub = String(input?.hub || '');
            if (i.resolve(hub) !== hub || !i.defaults(hub, 'cs'))
                throw new Error('TAXONOMY_HUB_UNKNOWN_OR_ALIAS');
            const target = String(input?.category || '');
            if (!BUILTIN[target] && !store.categories[target])
                throw new Error('TAXONOMY_TARGET_UNKNOWN');
            store.hubPlacement[hub] = target;
            await this.write(t, id, store, ctx);
            return { hub, category: target };
        }
    }
    NS.BUILTIN = BUILTIN;
    NS.TaxonomyService = TaxonomyService;
    NS.install = (core) => {
        if (core.taxonomy)
            throw new Error('Taxonomy already installed');
        if (!core.i18n)
            throw new Error('Taxonomy requires CORE.I18N');
        const svc = new TaxonomyService(core);
        core.taxonomy = svc;
        const reg = [];
        try {
            for (const [code, h] of [['ACTION.CORE.TAXONOMY.CATEGORY.ADD', (p, c) => svc.addCategory(p, c)], ['ACTION.CORE.TAXONOMY.CATEGORY.RENAME', (p, c) => svc.renameCategory(p, c)],
                ['ACTION.CORE.TAXONOMY.CATEGORY.REMOVE', (p, c) => svc.removeCategory(p, c)], ['ACTION.CORE.TAXONOMY.HUB.MOVE', (p, c) => svc.moveHub(p, c)]]) {
                core.actions.register({ code, ownerApp: 'APP.KX.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: h });
                reg.push(code);
            }
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, 'APP.KX.NEXUS');
            delete core.taxonomy;
            throw e;
        }
        return Object.freeze({ contract: 'KX.CORE_TAXONOMY/1', builtinCategories: Object.keys(BUILTIN).length, actions: 4 });
    };
})(KXTaxonomy || (KXTaxonomy = {}));
