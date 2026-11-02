// N2.1j — Weby a odkazy (KX.CORE_WEB_LINKS/1), a Core service usable from EVERY hub (no new APP code):
//  - two contexts: HOME (Domov) and COMPANY (Firma), each with its own user-mapped category tree, max 3 levels
//    (kategorie > podkategorie > podpodkategorie); defaults offered once by an explicit action, never forced;
//  - a link = Core entity CORE.WEB.LINK (title, http/https URL normalised, category, note, tags) in the context's
//    default space (HOME -> actor's personal space, COMPANY -> the COMPANY space); R23/R24 controls apply as to any record;
//  - attachments: a link can be attached to any record across NEXUS (ENTITY, TASK, CALENDAR_EVENT, ALARM, FILE, DOCUMENT)
//    with role OWNER ("komu web patří") or RELATED; reverse lookup "which webs does this record have";
//  - every write: action, ACL (EDIT on the link, READ on the attached target), revision CAS (N2.1h/N2.1i), audit.
//  - no page is ever fetched or opened by Core (no network); the UI opens links with rel="noopener noreferrer".
var KXWebLinks;
(function (NS) {
    const LINK = 'CORE.WEB.LINK', CAT = 'CORE.WEB.CATEGORY', OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_WEB_LINKS/1', MAX_DEPTH = 3;
    const CONTEXTS = ['HOME', 'COMPANY'];
    const ROLES = ['OWNER', 'RELATED'];
    const KINDS = ['ENTITY', 'TASK', 'CALENDAR_EVENT', 'ALARM', 'FILE', 'DOCUMENT'];
    const DEFAULTS = {
        HOME: [['Jídlo'], ['Oblečení'], ['Boty'], ['Škola'], ['Zahrada', ['Stromy', 'Květiny']], ['Různé']],
        COMPANY: [['Materiály'], ['Produkty'], ['Služby'], ['Konkurence'], ['Dodavatelé'], ['Různé']]
    };
    /* N2.6b (user): recommended links, one by one – added by 'fill in defaults' only when missing (matched by URL), never overwritten */
    const RECOMMENDED = { COMPANY: [['Úpravy obrázků', [['Idea.ai – zvětšení obrázku (upscaler)', 'https://www.idea.ai/image-upscaler', 'Zvětšení a zostření obrázku pomocí AI.'], ['HiCompress – změna DPI', 'https://hicompress.com/convert/dpi-converter', 'Převod a nastavení DPI obrázku (např. pro tisk a laser).'], ['Dither It! – rastrování obrázku', 'https://ditherit.com/', 'Dithering – převod obrázku na body, vhodné pro gravírování laserem.'], ['PineTools – inverze barev', 'https://pinetools.com/invert-image-colors', 'Převrácení barev obrázku (negativ).']]]] };
    const str = (v, max, code, required = true) => { if (v === undefined || v === null || v === '') {
        if (required)
            throw new Error(code + '_REQUIRED');
        return '';
    } if (typeof v !== 'string')
        throw new Error(code + '_INVALID'); const t = v.trim(); if (required && !t)
        throw new Error(code + '_REQUIRED'); if (t.length > max)
        throw new Error(code + '_TOO_LONG'); return t; };
    // URL: only http/https, no credentials, lower-case host, no default port, no fragment; returns {url, key}
    function normalizeUrl(raw) {
        let s = str(raw, 2048, 'WEB_URL');
        if (!/^[a-z][a-z0-9+.-]*:/i.test(s))
            s = 'https://' + s;
        let u;
        try {
            u = new URL(s);
        }
        catch {
            throw new Error('WEB_URL_INVALID');
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:')
            throw new Error('WEB_URL_SCHEME_NOT_ALLOWED');
        if (u.username || u.password)
            throw new Error('WEB_URL_CREDENTIALS_NOT_ALLOWED');
        if (!u.hostname || !u.hostname.includes('.') && u.hostname !== 'localhost')
            throw new Error('WEB_URL_INVALID');
        u.hash = '';
        if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80'))
            u.port = '';
        const url = u.toString();
        const key = (u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
        return { url, key, host: u.hostname.replace(/^www\./, '').toLowerCase() };
    }
    class WebLinksService {
        core;
        clock;
        constructor(core, clock = () => Date.now()) {
            this.core = core;
            this.clock = clock;
        }
        ctxCheck(c) { if (!CONTEXTS.includes(c))
            throw new Error('WEB_CONTEXT_INVALID'); return c; }
        async defaultSpace(context, actorId) {
            const spaces = (await this.core.memberships.listSpaces()).filter((s) => !s.archivedAt);
            const s = context === 'COMPANY' ? spaces.find((x) => x.kind === 'COMPANY') : spaces.find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId);
            if (!s)
                throw new Error(`WEB_NO_${context}_SPACE`);
            return s.id;
        }
        async canWriteSpace(spaceId, actorId) { const r = await this.core.memberships.roleFor(spaceId, actorId); return r === 'EDIT' || r === 'MANAGE'; }
        target(r, kind = 'ENTITY') { return { kind, id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }; }
        async readable(r, actorId) { return actorId === 'SYSTEM' || await this.core.access.can(this.target(r), actorId, 'READ') === true; }
        async editable(id, expectedRevision, type, actorId) {
            if (typeof id !== 'string' || !id)
                throw new Error('WEB_ID_REQUIRED');
            if (!Number.isInteger(expectedRevision))
                throw new Error('WEB_EXPECTED_REVISION_REQUIRED');
            const r = await this.core.entities.get(id);
            if (!r || r.type !== type)
                throw new Error('WEB_NOT_FOUND');
            if (r.archivedAt)
                throw new Error('WEB_ARCHIVED_READ_ONLY');
            if (actorId !== 'SYSTEM' && await this.core.access.can(this.target(r), actorId, 'EDIT') !== true)
                throw new Error('Scope denied: EDIT required');
            if (r.revision !== expectedRevision)
                throw new Error(`Revision conflict ${id}: expected ${expectedRevision}, actual ${r.revision}`);
            return r;
        }
        // ---------------- categories ----------------
        async categories(context, actorId) {
            this.ctxCheck(context);
            const out = [];
            for (const r of await this.core.entities.list())
                if (r.type === CAT && !r.archivedAt && r.data?.context === context && await this.readable(r, actorId))
                    out.push(r);
            return out.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || String(a.data.name).localeCompare(String(b.data.name), 'cs'));
        }
        async tree(context, actorId) {
            const cats = await this.categories(context, actorId);
            const by = (p) => cats.filter(c => (c.data.parentId || null) === p);
            const build = (p, depth) => by(p).map(c => ({ id: c.id, name: c.data.name, revision: c.revision, depth, children: depth < MAX_DEPTH ? build(c.id, depth + 1) : [] }));
            return build(null, 1);
        }
        async depthOf(id) { let d = 0, cur = id; const seen = new Set(); while (cur) {
            if (seen.has(cur))
                throw new Error('WEB_CATEGORY_CYCLE');
            seen.add(cur);
            const r = await this.core.entities.get(cur);
            if (!r || r.type !== CAT || r.archivedAt)
                throw new Error('WEB_CATEGORY_PARENT_NOT_FOUND');
            d++;
            cur = r.data.parentId || null;
        } return d; }
        async subtreeHeight(id, actorId) { const kids = (await this.core.entities.list()).filter((r) => r.type === CAT && !r.archivedAt && r.data?.parentId === id); let h = 0; for (const k of kids)
            h = Math.max(h, await this.subtreeHeight(k.id, actorId)); return h + 1; }
        async saveCategory(input, ctx) {
            const name = str(input?.name, 80, 'WEB_CATEGORY_NAME');
            const parentId = input?.parentId ?? null;
            if (parentId !== null && typeof parentId !== 'string')
                throw new Error('WEB_CATEGORY_PARENT_INVALID');
            let context, old = null;
            if (input?.id) {
                old = await this.editable(input.id, input.expectedRevision, CAT, ctx.actorId);
                context = old.data.context;
            }
            else
                context = this.ctxCheck(input?.context);
            if (parentId) {
                const p = await this.core.entities.get(parentId);
                if (!p || p.type !== CAT || p.archivedAt || p.data.context !== context)
                    throw new Error('WEB_CATEGORY_PARENT_NOT_FOUND');
                if (old && (parentId === old.id))
                    throw new Error('WEB_CATEGORY_CYCLE');
            }
            const parentDepth = await this.depthOf(parentId);
            if (old) {
                let cur = parentId;
                while (cur) {
                    if (cur === old.id)
                        throw new Error('WEB_CATEGORY_CYCLE');
                    cur = (await this.core.entities.get(cur))?.data?.parentId || null;
                }
                if (parentDepth + await this.subtreeHeight(old.id, ctx.actorId) > MAX_DEPTH)
                    throw new Error('WEB_CATEGORY_TOO_DEEP');
            }
            else if (parentDepth + 1 > MAX_DEPTH)
                throw new Error('WEB_CATEGORY_TOO_DEEP');
            const siblings = (await this.categories(context, ctx.actorId)).filter(c => (c.data.parentId || null) === parentId && c.id !== old?.id);
            if (siblings.some(c => String(c.data.name).toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs')))
                throw new Error('WEB_CATEGORY_DUPLICATE_NAME');
            const spaceIds = old ? old.spaceIds : [await this.defaultSpace(context, ctx.actorId)];
            if (!old && ctx.actorId !== 'SYSTEM' && !await this.canWriteSpace(spaceIds[0], ctx.actorId))
                throw new Error('Scope denied: EDIT required');
            const data = { ...(old?.data || {}), context, name, parentId, order: Number.isInteger(input?.order) ? input.order : (old?.data?.order ?? siblings.length) };
            return this.core.entities.save({ id: old?.id, type: CAT, ownerApp: OWNER, schema: 'KX.CORE_WEB_CATEGORY/1', spaceIds, data, expectedRevision: old ? old.revision : undefined }, ctx);
        }
        async deleteCategory(input, ctx) {
            const r = await this.editable(input?.id, input?.expectedRevision, CAT, ctx.actorId);
            const all = await this.core.entities.list();
            if (all.some((x) => x.type === CAT && !x.archivedAt && x.data?.parentId === r.id))
                throw new Error('WEB_CATEGORY_HAS_CHILDREN');
            if (all.some((x) => x.type === LINK && !x.archivedAt && x.data?.categoryId === r.id))
                throw new Error('WEB_CATEGORY_HAS_LINKS');
            return this.core.entities.save({ id: r.id, type: CAT, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, data: r.data, archivedAt: new Date(this.clock()).toISOString(), expectedRevision: r.revision }, ctx);
        }
        async seedDefaults(input, ctx) {
            const context = this.ctxCheck(input?.context);
            if ((await this.categories(context, ctx.actorId)).length)
                return { context, created: 0, skipped: 'CATEGORIES_EXIST' };
            let created = 0;
            for (const [i, [name, subs]] of DEFAULTS[context].entries()) {
                const c = await this.saveCategory({ context, name, order: i }, ctx);
                created++;
                for (const [j, s] of (subs || []).entries()) {
                    await this.saveCategory({ context, name: s, parentId: c.id, order: j }, ctx);
                    created++;
                }
            }
            return { context, created };
        }
        /* N2.6b (user): recommended links, one by one, as a separate action – only missing ones (matched by URL), never overwritten; image tools go under 'Služby' */
        async addRecommended(input, ctx) {
            const context = this.ctxCheck(input?.context);
            let created = 0, links = 0;
            for (const [catName, list] of (RECOMMENDED[context] || [])) {
                const cats = await this.categories(context, ctx.actorId);
                const nm = (c) => c.data?.name || c.name, pid = (c) => c.data?.parentId || c.parentId || null;
                const parent = cats.find((c) => nm(c) === 'Služby' && !pid(c)) || null;
                let cat = cats.find((c) => nm(c) === catName && pid(c) === (parent ? parent.id : null)) || cats.find((c) => nm(c) === catName);
                if (!cat) {
                    cat = await this.saveCategory({ context, name: catName, parentId: parent ? parent.id : null, order: 99 }, ctx);
                    created++;
                }
                for (const [title, url, note] of list) {
                    if (await this.findByUrl(context, url, ctx.actorId))
                        continue;
                    await this.saveLink({ context, url, title, note, categoryId: cat.id }, ctx);
                    links++;
                }
            }
            return { context, created, links };
        }
        // ---------------- links ----------------
        async findByUrl(context, url, actorId) {
            const { key } = normalizeUrl(url);
            for (const r of await this.core.entities.list())
                if (r.type === LINK && !r.archivedAt && r.data?.context === context && r.data?.urlKey === key && await this.readable(r, actorId))
                    return r;
            return null;
        }
        async list(q, actorId) {
            const context = this.ctxCheck(q?.context);
            let catIds = null;
            if (q?.categoryId) {
                catIds = new Set([q.categoryId]);
                if (q.includeSubcategories !== false) {
                    const cats = await this.categories(context, actorId);
                    let grew = true;
                    while (grew) {
                        grew = false;
                        for (const c of cats)
                            if (c.data.parentId && catIds.has(c.data.parentId) && !catIds.has(c.id)) {
                                catIds.add(c.id);
                                grew = true;
                            }
                    }
                }
            }
            const text = typeof q?.text === 'string' ? q.text.trim().toLocaleLowerCase('cs') : '';
            const out = [];
            for (const r of await this.core.entities.list()) {
                if (r.type !== LINK || r.archivedAt || r.data?.context !== context)
                    continue;
                if (catIds && !catIds.has(r.data.categoryId))
                    continue;
                if (text && !(`${r.data.title} ${r.data.url} ${r.data.note || ''} ${(r.data.tags || []).join(' ')}`.toLocaleLowerCase('cs').includes(text)))
                    continue;
                if (await this.readable(r, actorId))
                    out.push(r);
            }
            return out.sort((a, b) => String(a.data.title).localeCompare(String(b.data.title), 'cs'));
        }
        async saveLink(input, ctx) {
            let old = null, context;
            if (input?.id) {
                old = await this.editable(input.id, input.expectedRevision, LINK, ctx.actorId);
                context = old.data.context;
            }
            else
                context = this.ctxCheck(input?.context);
            const n = input?.url !== undefined || !old ? normalizeUrl(input?.url) : { url: old.data.url, key: old.data.urlKey, host: old.data.host };
            const title = str(input?.title ?? old?.data?.title ?? n.host, 160, 'WEB_TITLE');
            const note = str(input?.note ?? old?.data?.note ?? '', 2000, 'WEB_NOTE', false);
            const tags = input?.tags !== undefined ? (Array.isArray(input.tags) && input.tags.length <= 20 && input.tags.every((t) => typeof t === 'string' && t.trim() && t.length <= 40) ? [...new Set(input.tags.map((t) => t.trim()))] : (() => { throw new Error('WEB_TAGS_INVALID'); })()) : (old?.data?.tags || []);
            const categoryId = input?.categoryId !== undefined ? input.categoryId : (old?.data?.categoryId ?? null);
            if (categoryId !== null) {
                const c = await this.core.entities.get(categoryId);
                if (!c || c.type !== CAT || c.archivedAt || c.data.context !== context)
                    throw new Error('WEB_CATEGORY_NOT_FOUND');
            }
            const dup = await this.findByUrl(context, n.url, ctx.actorId);
            if (dup && dup.id !== old?.id && input?.allowDuplicate !== true)
                throw new Error(`WEB_DUPLICATE_URL ${dup.id}`);
            const spaceIds = old ? old.spaceIds : [await this.defaultSpace(context, ctx.actorId)];
            if (!old && ctx.actorId !== 'SYSTEM' && !await this.canWriteSpace(spaceIds[0], ctx.actorId))
                throw new Error('Scope denied: EDIT required');
            const data = { ...(old?.data || {}), context, title, url: n.url, urlKey: n.key, host: n.host, note, tags, categoryId, attachedTo: old?.data?.attachedTo || [] };
            return this.core.entities.save({ id: old?.id, type: LINK, ownerApp: OWNER, schema: 'KX.CORE_WEB_LINK/1', spaceIds, data, expectedRevision: old ? old.revision : undefined }, ctx);
        }
        async archiveLink(input, ctx) {
            const r = await this.editable(input?.id, input?.expectedRevision, LINK, ctx.actorId);
            return this.core.entities.save({ id: r.id, type: LINK, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, data: r.data, archivedAt: new Date(this.clock()).toISOString(), expectedRevision: r.revision }, ctx);
        }
        // ---------------- attachments across hubs ----------------
        async readTarget(t, actorId) {
            if (!t || !KINDS.includes(t.kind) || typeof t.id !== 'string' || !t.id)
                throw new Error('WEB_TARGET_INVALID');
            const store = { ENTITY: 'entities', TASK: 'tasks', CALENDAR_EVENT: 'calendarEvents', ALARM: 'alarms', FILE: 'files', DOCUMENT: 'documents' }[t.kind];
            const r = await this.core.repository.get(store, t.id);
            if (!r)
                throw new Error('WEB_TARGET_NOT_FOUND');
            if (t.kind === 'ENTITY' && (String(r.type).startsWith('CORE.IDENTITY.') || r.type === LINK || r.type === CAT))
                throw new Error('WEB_TARGET_NOT_ALLOWED');
            if (actorId !== 'SYSTEM' && await this.core.access.can({ kind: t.kind, id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') !== true)
                throw new Error('Scope denied: READ required on target');
            return { kind: t.kind, id: r.id, ownerApp: r.ownerApp, title: String(r.data?.name || r.data?.title || r.title || r.name || r.id).slice(0, 160) };
        }
        async attach(input, ctx) {
            const r = await this.editable(input?.id, input?.expectedRevision, LINK, ctx.actorId);
            const role = input?.role ?? 'RELATED';
            if (!ROLES.includes(role))
                throw new Error('WEB_ROLE_INVALID');
            const t = await this.readTarget(input?.target, ctx.actorId);
            const list = (r.data.attachedTo || []).filter((a) => !(a.kind === t.kind && a.id === t.id));
            if (list.length >= 50)
                throw new Error('WEB_TOO_MANY_ATTACHMENTS');
            return this.core.entities.save({ id: r.id, type: LINK, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, data: { ...r.data, attachedTo: [...list, { kind: t.kind, id: t.id, ownerApp: t.ownerApp, role, at: new Date(this.clock()).toISOString() }] }, expectedRevision: r.revision }, ctx);
        }
        async detach(input, ctx) {
            const r = await this.editable(input?.id, input?.expectedRevision, LINK, ctx.actorId);
            const t = input?.target;
            const list = (r.data.attachedTo || []).filter((a) => !(a.kind === t?.kind && a.id === t?.id));
            if (list.length === (r.data.attachedTo || []).length)
                return r;
            return this.core.entities.save({ id: r.id, type: LINK, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, data: { ...r.data, attachedTo: list }, expectedRevision: r.revision }, ctx);
        }
        // "which webs does this record have" (only links the actor can READ)
        async forTarget(t, actorId) {
            if (!t || typeof t.id !== 'string')
                throw new Error('WEB_TARGET_INVALID');
            const out = [];
            for (const r of await this.core.entities.list())
                if (r.type === LINK && !r.archivedAt && (r.data?.attachedTo || []).some((a) => a.id === t.id && (!t.kind || a.kind === t.kind)) && await this.readable(r, actorId))
                    out.push({ link: r, role: (r.data.attachedTo.find((a) => a.id === t.id) || {}).role });
            return out.sort((a, b) => (a.role === 'OWNER' ? 0 : 1) - (b.role === 'OWNER' ? 0 : 1) || String(a.link.data.title).localeCompare(String(b.link.data.title), 'cs'));
        }
        // "komu web patří": attached records the actor can READ (others are counted, never named)
        async owners(id, actorId) {
            const r = await this.core.entities.get(id);
            if (!r || r.type !== LINK || !await this.readable(r, actorId))
                throw new Error('WEB_NOT_FOUND');
            const out = [];
            let hidden = 0;
            for (const a of r.data.attachedTo || []) {
                try {
                    out.push({ ...(await this.readTarget(a, actorId)), role: a.role });
                }
                catch {
                    hidden++;
                }
            }
            return { items: out, hidden };
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.MAX_DEPTH = MAX_DEPTH;
    NS.DEFAULTS = DEFAULTS;
    NS.normalizeUrl = normalizeUrl;
    NS.WebLinksService = WebLinksService;
    NS.install = (core, options = {}) => {
        if (core.webLinks)
            throw new Error('Web links already installed');
        if (!core?.entities?.save || !core?.access?.can || !core?.memberships?.listSpaces)
            throw new Error('Web links require Core entities/access/memberships');
        const svc = new WebLinksService(core, options.now);
        const reg = [];
        const defs = [
            ['ACTION.CORE.WEB.CATEGORY.SAVE', 'SAFE_WRITE', (p, c) => svc.saveCategory(p, c)], ['ACTION.CORE.WEB.CATEGORY.DELETE', 'SAFE_WRITE', (p, c) => svc.deleteCategory(p, c)],
            ['ACTION.CORE.WEB.CATEGORY.SEED', 'SAFE_WRITE', (p, c) => svc.seedDefaults(p, c)], ['ACTION.CORE.WEB.LINK.RECOMMENDED', 'SAFE_WRITE', (p, c) => svc.addRecommended(p, c)], ['ACTION.CORE.WEB.LINK.SAVE', 'SAFE_WRITE', (p, c) => svc.saveLink(p, c)],
            ['ACTION.CORE.WEB.LINK.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archiveLink(p, c)], ['ACTION.CORE.WEB.LINK.ATTACH', 'SAFE_WRITE', (p, c) => svc.attach(p, c)],
            ['ACTION.CORE.WEB.LINK.DETACH', 'SAFE_WRITE', (p, c) => svc.detach(p, c)]
        ];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.webLinks = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.webLinks;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, contexts: CONTEXTS, maxDepth: MAX_DEPTH });
    };
})(KXWebLinks || (KXWebLinks = {}));
