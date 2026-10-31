// N2.1q (R52): Prompty — Core prompt library + generators (KX.CORE_PROMPTS/1).
//  - category TREE (sub-categories, max depth 6, unique names among siblings, no cycles, delete only when empty);
//  - prompt = template with [PLACEHOLDERS] (KalinumX syntax "[INSERT X – a / b / c]": options after the dash),
//    per-variable label / help / example / options, gallery (Core image files + external image URLs), contexts
//    HOME / COMPANY (view "Vše" = both), kind IMAGE / TEXT / PRODUCT_PHOTO / OTHER, favorite, tags, source URL;
//  - render: values replace placeholders, empty ones stay visible as [..] and are reported as missing; optional
//    "universal suffix" (production-friendly fiber-laser concept) appended once;
//  - builders (text generator from kalinumx.com + product-photo generator): fields + toggles -> SHORT and DETAILED prompt;
//  - AI: a meta-prompt to improve / extend / translate a prompt or create a new one (copy to any AI tool) and
//    "paste the AI answer back" which saves a new prompt / new revision — nothing is sent anywhere by Core itself.
var KXPrompts;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_PROMPTS/1', CAT = 'CORE.PROMPT.CATEGORY', PROMPT = 'CORE.PROMPT', MAX_DEPTH = 6;
    const KINDS = ['IMAGE', 'TEXT', 'PRODUCT_PHOTO', 'OTHER'], CONTEXTS = ['HOME', 'COMPANY'];
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    // "[INSERT STYLE – funny / proud / calm]" -> {raw, key:'INSERT_STYLE', label:'INSERT STYLE', options:['funny','proud','calm']}
    function parsePlaceholders(template) {
        const out = [];
        const seen = new Set();
        for (const m of String(template || '').matchAll(/\[([^\[\]\n]{1,160})\]/g)) {
            const raw = m[0], inner = m[1].trim();
            const parts = inner.split(/\s+[–—-]\s+/);
            const label = parts[0].trim();
            const options = parts.length > 1 ? parts.slice(1).join(' – ').split('/').map(x => x.trim()).filter(Boolean) : [];
            const key = norm(label);
            if (!key || seen.has(raw))
                continue;
            seen.add(raw);
            out.push({ raw, key, label, options });
        }
        return out;
    }
    function render(template, values = {}, opts = {}) {
        const ph = parsePlaceholders(template);
        let text = String(template || '');
        const missing = [];
        for (const p of ph) {
            const v = values[p.key] ?? values[p.raw];
            if (typeof v === 'string' && v.trim()) {
                text = text.split(p.raw).join(v.trim());
            }
            else
                missing.push(p.key);
        }
        if (opts.suffix && typeof opts.suffix === 'string' && !text.includes(opts.suffix.trim()))
            text = text.trim() + '\n\n' + opts.suffix.trim();
        return { text, missing, placeholders: ph.length };
    }
    // ---- builders (field-based generators) ----------------------------------------------------------------------------------
    const line = (label, v) => typeof v === 'string' && v.trim() ? `${label}: ${v.trim()}` : '';
    function buildPrompt(builder, values = {}, toggles = {}) {
        if (!builder || !Array.isArray(builder.fields))
            throw new Error('PROMPT_BUILDER_INVALID');
        const filled = builder.fields.map((f) => ({ f, v: values[f.key] })).filter((x) => typeof x.v === 'string' && x.v.trim());
        const facts = filled.map((x) => line(x.f.label, x.v)).filter(Boolean);
        const extras = (builder.toggles || []).filter((t) => toggles[t.key] === true || (toggles[t.key] === undefined && t.default === true)).map((t) => t.instruction);
        const keep = values.KEEP_EXACT ? `Do not translate or change these exact texts: ${values.KEEP_EXACT.trim()}.` : '';
        const avoid = values.AVOID ? `Avoid: ${values.AVOID.trim()}.` : '';
        const detailed = [builder.intro, facts.length ? 'Brief:\n- ' + facts.join('\n- ') : '', builder.rules || '', keep, avoid, extras.length ? 'Additionally:\n- ' + extras.join('\n- ') : '', builder.outro || ''].filter(Boolean).join('\n\n');
        const short = [builder.shortIntro || builder.intro, facts.map((x) => x.replace(/^[^:]+: /, '')).join(', '), keep, avoid].filter(Boolean).join(' ');
        return { short: short.trim(), detailed: detailed.trim(), used: filled.map((x) => x.f.key) };
    }
    class PromptService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        async space(ctx, input) { if (input?.spaceId)
            return input.spaceId; const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === ctx.actorId && !x.archivedAt); if (!s)
            throw new Error('PROMPTS_NO_PERSONAL_SPACE'); return s.id; }
        async readable(r, actorId) { return await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') === true; }
        async rows(type, actorId) { const out = []; for (const r of await this.core.entities.list()) {
            if (r.type !== type || r.archivedAt)
                continue;
            if (await this.readable(r, actorId))
                out.push(r);
        } return out; }
        // ---- categories ----
        async categories(actorId) { return (await this.rows(CAT, actorId)).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || String(a.data.name).localeCompare(String(b.data.name), 'cs')); }
        async depth(id, actorId) { let d = 0, cur = id; const all = await this.categories(actorId); const seen = new Set(); while (cur) {
            if (seen.has(cur))
                throw new Error('PROMPT_CATEGORY_CYCLE');
            seen.add(cur);
            const c = all.find((x) => x.id === cur);
            if (!c)
                break;
            d++;
            cur = c.data.parentId || null;
        } return d; }
        async saveCategory(input, ctx) {
            const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 80) : '';
            if (!name)
                throw new Error('PROMPT_CATEGORY_NAME_REQUIRED');
            const parentId = input?.parentId || null;
            const all = await this.categories(ctx.actorId);
            if (parentId && !all.some((x) => x.id === parentId))
                throw new Error('PROMPT_CATEGORY_PARENT_UNKNOWN');
            if (input?.id && parentId) {
                let cur = parentId;
                while (cur) {
                    if (cur === input.id)
                        throw new Error('PROMPT_CATEGORY_CYCLE');
                    cur = all.find((x) => x.id === cur)?.data.parentId || null;
                }
            }
            if (parentId && await this.depth(parentId, ctx.actorId) >= MAX_DEPTH)
                throw new Error('PROMPT_CATEGORY_TOO_DEEP');
            if (all.some((x) => x.id !== input?.id && (x.data.parentId || null) === parentId && norm(x.data.name) === norm(name)))
                throw new Error('PROMPT_CATEGORY_DUPLICATE');
            const old = input?.id ? all.find((x) => x.id === input.id) : null;
            if (input?.id && !old)
                throw new Error('PROMPT_CATEGORY_NOT_FOUND');
            return this.core.entities.save({ ...(old ? { id: old.id, expectedRevision: Number.isInteger(input.expectedRevision) ? input.expectedRevision : old.revision } : {}), type: CAT, ownerApp: OWNER, schema: 'KX.CORE_PROMPT_CATEGORY/1', spaceIds: old ? old.spaceIds : [await this.space(ctx, input)],
                data: { name, parentId, icon: typeof input?.icon === 'string' ? input.icon.slice(0, 8) : (old?.data.icon || ''), order: Number.isFinite(input?.order) ? input.order : (old?.data.order ?? all.length), seedKey: old?.data.seedKey || input?.seedKey || null } }, ctx);
        }
        async deleteCategory(input, ctx) {
            const c = (await this.categories(ctx.actorId)).find((x) => x.id === input?.id);
            if (!c)
                throw new Error('PROMPT_CATEGORY_NOT_FOUND');
            if ((await this.categories(ctx.actorId)).some((x) => x.data.parentId === c.id))
                throw new Error('PROMPT_CATEGORY_NOT_EMPTY');
            if ((await this.rows(PROMPT, ctx.actorId)).some((p) => p.data.categoryId === c.id))
                throw new Error('PROMPT_CATEGORY_NOT_EMPTY');
            return this.core.entities.save({ id: c.id, type: CAT, ownerApp: OWNER, schema: c.schema, spaceIds: c.spaceIds, expectedRevision: c.revision, archivedAt: new Date().toISOString(), data: c.data }, ctx);
        }
        tree(cats) {
            const by = new Map();
            for (const c of cats) {
                const k = c.data.parentId || null;
                by.set(k, [...(by.get(k) || []), c]);
            }
            const walk = (p, d) => (by.get(p) || []).map(c => ({ id: c.id, name: c.data.name, icon: c.data.icon, depth: d, children: walk(c.id, d + 1) }));
            return walk(null, 0);
        }
        // ---- prompts ----
        validVars(vars) {
            if (vars === undefined)
                return [];
            if (!Array.isArray(vars) || vars.length > 60)
                throw new Error('PROMPT_VARIABLES_INVALID');
            return vars.map((v) => { const key = norm(v?.key || v?.label); if (!key)
                throw new Error('PROMPT_VARIABLES_INVALID'); return { key, label: String(v.label || key).slice(0, 120), help: String(v.help || '').slice(0, 400), example: String(v.example || '').slice(0, 200), options: Array.isArray(v.options) ? v.options.map((o) => String(o).slice(0, 80)).slice(0, 40) : [] }; });
        }
        async save(input, ctx) {
            const title = typeof input?.title === 'string' ? input.title.trim().slice(0, 160) : '';
            if (!title)
                throw new Error('PROMPT_TITLE_REQUIRED');
            const kind = input?.kind || 'OTHER';
            if (!KINDS.includes(kind))
                throw new Error('PROMPT_KIND_INVALID');
            const contexts = Array.isArray(input?.contexts) && input.contexts.length ? [...new Set(input.contexts)] : ['HOME', 'COMPANY'];
            if (contexts.some((c) => !CONTEXTS.includes(c)))
                throw new Error('PROMPT_CONTEXT_INVALID');
            const template = typeof input?.template === 'string' ? input.template : '';
            if (!template.trim() && !input?.builder)
                throw new Error('PROMPT_TEMPLATE_REQUIRED');
            if (template.length > 20000)
                throw new Error('PROMPT_TEMPLATE_TOO_LONG');
            if (input?.categoryId && !(await this.categories(ctx.actorId)).some((c) => c.id === input.categoryId))
                throw new Error('PROMPT_CATEGORY_UNKNOWN');
            const urls = (Array.isArray(input?.imageUrls) ? input.imageUrls : []).filter((u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u))).slice(0, 24);
            const files = (Array.isArray(input?.imageFileIds) ? input.imageFileIds : []).filter((x) => typeof x === 'string').slice(0, 48);
            const declared = this.validVars(input?.variables);
            const ph = parsePlaceholders(template);
            const variables = [...declared, ...ph.filter((p) => !declared.some((d) => d.key === p.key)).map((p) => ({ key: p.key, label: p.label, help: '', example: '', options: p.options }))];
            const old = input?.id ? await this.core.entities.get(input.id) : null;
            if (input?.id && (!old || old.type !== PROMPT))
                throw new Error('PROMPT_NOT_FOUND');
            return this.core.entities.save({ ...(old ? { id: old.id, expectedRevision: Number.isInteger(input.expectedRevision) ? input.expectedRevision : old.revision } : {}), type: PROMPT, ownerApp: OWNER, schema: 'KX.CORE_PROMPT/1', spaceIds: old ? old.spaceIds : [await this.space(ctx, input)],
                data: { title, description: String(input?.description || '').slice(0, 2000), kind, contexts, categoryId: input?.categoryId || null, template, variables, builder: input?.builder || null,
                    imageUrls: urls, imageFileIds: files, tags: (Array.isArray(input?.tags) ? input.tags : []).map((t) => String(t).slice(0, 40)).slice(0, 20), favorite: input?.favorite === true,
                    source: input?.source && typeof input.source === 'object' ? { url: String(input.source.url || '').slice(0, 400), label: String(input.source.label || '').slice(0, 120) } : (old?.data.source || null), seedKey: old?.data.seedKey || input?.seedKey || null,
                    suffixable: input?.suffixable !== false } }, ctx);
        }
        async list(input, actorId) {
            const ctxF = input?.context || 'ALL';
            const q = norm(input?.query || '');
            const cat = input?.categoryId || null;
            const cats = await this.categories(actorId);
            const under = (id) => { const s = new Set(); if (!id)
                return s; const st = [id]; while (st.length) {
                const x = st.pop();
                s.add(x);
                for (const c of cats)
                    if (c.data.parentId === x)
                        st.push(c.id);
            } return s; };
            const inCat = under(cat);
            return (await this.rows(PROMPT, actorId)).filter((p) => (ctxF === 'ALL' || p.data.contexts.includes(ctxF)) && (!cat || inCat.has(p.data.categoryId)) && (input?.kind ? p.data.kind === input.kind : true) && (input?.favorite ? p.data.favorite : true)
                && (!q || norm([p.data.title, p.data.description, p.data.template, (p.data.tags || []).join(' ')].join(' ')).includes(q)))
                .sort((a, b) => Number(b.data.favorite) - Number(a.data.favorite) || String(a.data.title).localeCompare(String(b.data.title), 'cs'));
        }
        async remove(input, ctx) {
            const p = await this.core.entities.get(input?.id);
            if (!p || p.type !== PROMPT || p.archivedAt)
                throw new Error('PROMPT_NOT_FOUND');
            return this.core.entities.save({ id: p.id, type: PROMPT, ownerApp: OWNER, schema: p.schema, spaceIds: p.spaceIds, expectedRevision: Number.isInteger(input?.expectedRevision) ? input.expectedRevision : p.revision, archivedAt: new Date().toISOString(), data: p.data }, ctx);
        }
        async duplicate(input, ctx) {
            const p = await this.core.entities.get(input?.id);
            if (!p || p.type !== PROMPT)
                throw new Error('PROMPT_NOT_FOUND');
            if (!await this.readable(p, ctx.actorId))
                throw new Error('Scope denied: READ required');
            return this.save({ ...p.data, title: `${p.data.title} (kopie)`, seedKey: null, favorite: false }, ctx);
        }
        async addImage(input, ctx) {
            const p = await this.core.entities.get(input?.id);
            if (!p || p.type !== PROMPT)
                throw new Error('PROMPT_NOT_FOUND');
            const blob = input?.blob;
            const mime = String(blob?.type || '').toLowerCase();
            if (!mime.startsWith('image/'))
                throw new Error('PROMPT_IMAGE_NOT_IMAGE');
            const f = await this.core.files.importBlob(blob, String(input?.name || `prompt-${Date.now()}.${mime.split('/')[1] || 'img'}`).slice(0, 120), mime, OWNER, p.spaceIds, ctx, { tags: ['kx:prompt-image'], description: p.data.title });
            return this.core.entities.save({ id: p.id, type: PROMPT, ownerApp: OWNER, schema: p.schema, spaceIds: p.spaceIds, expectedRevision: p.revision, data: { ...p.data, imageFileIds: [...(p.data.imageFileIds || []), f.id] } }, ctx);
        }
        async render(input, actorId) {
            const p = await this.core.entities.get(input?.id);
            if (!p || p.type !== PROMPT || p.archivedAt)
                throw new Error('PROMPT_NOT_FOUND');
            if (!await this.readable(p, actorId))
                throw new Error('Scope denied: READ required');
            if (p.data.builder)
                return { ...buildPrompt(p.data.builder, input?.values || {}, input?.toggles || {}), builder: true };
            let suffix = '';
            if (input?.universal && p.data.suffixable) {
                const u = (await this.rows(PROMPT, actorId)).find((x) => x.data.seedKey === 'KX.IMG.UNIVERSAL');
                if (u)
                    suffix = u.data.template;
            }
            return render(p.data.template, input?.values || {}, { suffix });
        }
        // AI: meta-prompt to copy into any AI tool; the answer is pasted back with aiApply (new prompt or new revision)
        aiRequest(input) {
            const mode = input?.mode || 'IMPROVE';
            const MODES = { IMPROVE: 'Improve the following prompt: make it clearer, more specific and production-friendly. Keep every [PLACEHOLDER] in square brackets and keep its meaning.',
                EXTEND: 'Extend the following prompt with useful optional details (style, composition, material, lighting, constraints). Keep every [PLACEHOLDER] and add new ones in the same [INSERT X – option / option] syntax only where useful.',
                VARIANTS: 'Write 3 alternative variants of the following prompt (different style directions). Keep the [PLACEHOLDER] syntax. Separate the variants with a line containing only ---.',
                TRANSLATE: 'Translate the following prompt into natural English for an AI image or text generator. Keep every [PLACEHOLDER] unchanged.',
                NEW: 'Create a new reusable prompt for the following request. Use [INSERT X – option / option] placeholders for everything the user should fill in.' };
            if (!MODES[mode])
                throw new Error('PROMPT_AI_MODE_INVALID');
            const src = String(input?.template || input?.request || '').slice(0, 20000);
            if (!src.trim())
                throw new Error('PROMPT_AI_SOURCE_REQUIRED');
            return { mode, text: `${MODES[mode]}\nAnswer with the prompt text only, without explanations.${input?.goal ? `\nGoal / context: ${String(input.goal).slice(0, 1000)}` : ''}\n\n---\n${src}\n---` };
        }
        async aiApply(input, ctx) {
            const answer = typeof input?.answer === 'string' ? input.answer.trim() : '';
            if (!answer)
                throw new Error('PROMPT_AI_ANSWER_REQUIRED');
            const clean = answer.replace(/^```[a-z]*\n?|```$/gim, '').trim();
            if (input?.id && input?.asNew !== true) {
                const p = await this.core.entities.get(input.id);
                if (!p || p.type !== PROMPT)
                    throw new Error('PROMPT_NOT_FOUND');
                return this.save({ ...p.data, id: p.id, expectedRevision: Number.isInteger(input?.expectedRevision) ? input.expectedRevision : p.revision, template: clean, variables: p.data.variables.filter((v) => parsePlaceholders(clean).some((x) => x.key === v.key)) }, ctx);
            }
            const base = input?.id ? await this.core.entities.get(input.id) : null;
            return this.save({ title: String(input?.title || (base ? `${base.data.title} (AI)` : 'Nový prompt (AI)')), kind: base?.data.kind || input?.kind || 'OTHER', contexts: base?.data.contexts, categoryId: base?.data.categoryId || input?.categoryId || null, template: clean, tags: ['ai'] }, ctx);
        }
        // ---- seed (kalinumx.com library) — idempotent by seedKey, never overwrites user's changes ----
        async seed(pack, ctx) {
            if (!pack || !Array.isArray(pack.categories) || !Array.isArray(pack.prompts))
                throw new Error('PROMPT_SEED_INVALID');
            const cats = await this.categories(ctx.actorId);
            const bySeed = new Map();
            for (const c of cats)
                if (c.data.seedKey)
                    bySeed.set(c.data.seedKey, c.id);
            let cAdded = 0, pAdded = 0, skipped = 0;
            for (const c of pack.categories) {
                if (bySeed.has(c.key))
                    continue;
                const parentId = c.parent ? bySeed.get(c.parent) || null : null;
                try {
                    const r = await this.saveCategory({ name: c.name, parentId, icon: c.icon || '', order: c.order, seedKey: c.key }, ctx);
                    bySeed.set(c.key, r.id);
                    cAdded++;
                }
                catch (e) {
                    if (!String(e?.message || e).includes('PROMPT_CATEGORY_DUPLICATE'))
                        throw e;
                    const ex = (await this.categories(ctx.actorId)).find((x) => (x.data.parentId || null) === parentId && norm(x.data.name) === norm(c.name));
                    if (ex)
                        bySeed.set(c.key, ex.id);
                }
            }
            const existing = new Set((await this.rows(PROMPT, ctx.actorId)).map((p) => p.data.seedKey).filter(Boolean));
            for (const p of pack.prompts) {
                if (existing.has(p.key)) {
                    skipped++;
                    continue;
                }
                await this.save({ ...p, seedKey: p.key, categoryId: p.category ? bySeed.get(p.category) || null : null }, ctx);
                pAdded++;
            }
            return { contract: CONTRACT, categoriesAdded: cAdded, promptsAdded: pAdded, skipped };
        }
        // ---- import / export (KX.PROMPTS/1) ----
        async exportPack(actorId) {
            const cats = await this.categories(actorId);
            const ps = await this.rows(PROMPT, actorId);
            return { format: 'KX.PROMPTS', formatVersion: 1, exportedAt: new Date().toISOString(), categories: cats.map((c) => ({ key: c.data.seedKey || c.id, name: c.data.name, parent: c.data.parentId ? (cats.find((x) => x.id === c.data.parentId)?.data.seedKey || c.data.parentId) : null, icon: c.data.icon, order: c.data.order })),
                prompts: ps.map((p) => ({ key: p.data.seedKey || p.id, title: p.data.title, description: p.data.description, kind: p.data.kind, contexts: p.data.contexts, category: p.data.categoryId ? (cats.find((x) => x.id === p.data.categoryId)?.data.seedKey || p.data.categoryId) : null, template: p.data.template, variables: p.data.variables, builder: p.data.builder, imageUrls: p.data.imageUrls, tags: p.data.tags, source: p.data.source })) };
        }
    }
    // default columns of the prompt table (registered in the field registry, the user's overlay sits on top)
    NS.TABLE_SCOPE = 'TABLE:CORE.PROMPTS';
    NS.KIND_LIST = { name: 'Druh promptu', owner: OWNER, items: [{ key: 'IMAGE', label: '🖼 obrázek' }, { key: 'TEXT', label: '✍ text' }, { key: 'PRODUCT_PHOTO', label: '📸 produktová fotka' }, { key: 'OTHER', label: '◦ jiné' }] };
    NS.TABLE_FIELDS = [{ key: 'title', type: 'TEXT', label: 'Název', info: 'Název promptu.', width: 260 }, { key: 'kind', type: 'SELECT', label: 'Druh', listId: 'PROMPT.KIND', width: 120 },
        { key: 'category', type: 'TEXT', label: 'Kategorie', width: 160 }, { key: 'contexts', type: 'TEXT', label: 'Kontext', info: 'Firma / Rodina', width: 110 }, { key: 'tags', type: 'TEXT', label: 'Štítky', width: 140 },
        { key: 'favorite', type: 'BOOL', label: 'Oblíbené', width: 70 }, { key: 'updatedAt', type: 'DATE', label: 'Změněno', width: 120 }, { key: 'source', type: 'LINK', label: 'Zdroj', hidden: true, width: 160 }];
    NS.TABLE_VIEWS = [{ name: 'Přehled (název, druh, kategorie)', columns: ['title', 'kind', 'category'], density: 'EXTRA' }, { name: 'Oblíbené nahoře', columns: null, density: 'COMPACT', sort: { key: 'favorite', dir: 'desc' } },
        { name: 'Nedávno změněné', columns: ['title', 'category', 'updatedAt'], density: 'COMPACT', sort: { key: 'updatedAt', dir: 'desc' } }, { name: 'Podle kategorie', columns: ['category', 'title', 'kind'], density: 'EXTRA', sort: { key: 'category', dir: 'asc' } }, { name: 'Podrobný', columns: ['title', 'kind', 'category', 'contexts', 'tags', 'favorite', 'updatedAt', 'source'], density: 'NORMAL' }];
    NS.CONTRACT = CONTRACT;
    NS.parsePlaceholders = parsePlaceholders;
    NS.render = render;
    NS.buildPrompt = buildPrompt;
    NS.norm = norm;
    NS.PromptService = PromptService;
    NS.install = (core, options = {}) => {
        if (core.prompts)
            throw new Error('Prompts already installed');
        if (!core?.entities?.save || !core?.files?.importBlob)
            throw new Error('Prompts require Core entities/files');
        const svc = new PromptService(core, options);
        const reg = [];
        const defs = [
            ['ACTION.CORE.PROMPT.CATEGORY.SAVE', 'SAFE_WRITE', (p, c) => svc.saveCategory(p, c)], ['ACTION.CORE.PROMPT.CATEGORY.DELETE', 'SAFE_WRITE', (p, c) => svc.deleteCategory(p, c)],
            ['ACTION.CORE.PROMPT.CATEGORIES', 'READ', async (_p, c) => svc.tree(await svc.categories(c.actorId))],
            ['ACTION.CORE.PROMPT.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.CORE.PROMPT.LIST', 'READ', (p, c) => svc.list(p, c.actorId)],
            ['ACTION.CORE.PROMPT.DELETE', 'SAFE_WRITE', (p, c) => svc.remove(p, c)], ['ACTION.CORE.PROMPT.DUPLICATE', 'SAFE_WRITE', (p, c) => svc.duplicate(p, c)],
            ['ACTION.CORE.PROMPT.ADD_IMAGE', 'SAFE_WRITE', (p, c) => svc.addImage(p, c)], ['ACTION.CORE.PROMPT.RENDER', 'READ', (p, c) => svc.render(p, c.actorId)],
            ['ACTION.CORE.PROMPT.AI_REQUEST', 'READ', async (p) => svc.aiRequest(p)], ['ACTION.CORE.PROMPT.AI_APPLY', 'SAFE_WRITE', (p, c) => svc.aiApply(p, c)],
            ['ACTION.CORE.PROMPT.SEED', 'SAFE_WRITE', (p, c) => svc.seed(p?.pack || globalThis.KXPromptSeed?.PACK, c)], ['ACTION.CORE.PROMPT.EXPORT', 'READ', (_p, c) => svc.exportPack(c.actorId)]
        ];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.prompts = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.prompts;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXPrompts || (KXPrompts = {}));
