// N2.1t (R53/R54): číselníky (option lists) + mapa nastavení (settings navigation) — KX.CORE_LISTS/1.
//  Option lists: a hub registers a DEFAULT list (id, name, items with stable keys); the workspace keeps an OVERLAY
//  (rename, colour, icon, order, archive, new items, user-defined lists) as one Core entity per list in a shared
//  space (family by default) so every member and every hub uses the same list. Records store the item KEY, never the
//  label, so renaming an item never breaks data; archived items stay readable for old records but are not offered.
//  Settings navigation: every settings section has an address ("fields:TABLE:…", "lists:…", "link:sync", hub
//  sections…), a breadcrumb path and keywords — the Shell opens any section directly (proklik) and finds it in search.
var KXLists;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_LISTS/1', TYPE = 'CORE.LIST';
    const ID_RE = /^[A-Z][A-Z0-9_.]{1,80}$/;
    const KEY_RE = /^[A-Z0-9_]{1,64}$/;
    const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
    const ascii = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const normItem = (it, i) => {
        if (!KEY_RE.test(String(it?.key)))
            throw new Error('LIST_ITEM_KEY_INVALID');
        return { key: String(it.key), label: String(it.label || it.key).slice(0, 120), color: COLOR_RE.test(String(it.color || '')) ? it.color : '', icon: String(it.icon || '').slice(0, 8), order: Number.isFinite(it.order) ? it.order : i * 10, archived: it.archived === true };
    };
    class ListService {
        core;
        opts;
        defaults = new Map();
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        registerList(id, def) {
            if (!ID_RE.test(String(id)))
                throw new Error('LIST_ID_INVALID');
            const items = (def?.items || []).map(normItem);
            const keys = new Set();
            for (const it of items) {
                if (keys.has(it.key))
                    throw new Error('LIST_ITEM_KEY_DUPLICATE');
                keys.add(it.key);
            }
            this.defaults.set(id, { id, name: String(def?.name || id).slice(0, 120), description: String(def?.description || '').slice(0, 400), owner: String(def?.owner || OWNER), items });
            return items.length;
        }
        rowId(id) { return `LIST.${id}`; }
        // shared lists live in the family space: only members with EDIT / MANAGE there may change them (never a private copy
        // that would hide the list from the others); a workspace without any family space falls back to the personal space
        async sharedSpace(actorId) {
            const sp = (await this.core.memberships.listSpaces()).filter((x) => !x.archivedAt);
            const fam = sp.filter((x) => x.kind === 'FAMILY');
            for (const s of fam)
                if (['EDIT', 'MANAGE'].includes(await this.core.memberships.roleFor(s.id, actorId)))
                    return s.id;
            if (fam.length)
                throw new Error('Scope denied: EDIT required in the shared space to change lists');
            const p = sp.find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId);
            if (!p)
                throw new Error('LISTS_NO_SPACE');
            return p.id;
        }
        async overlay(id) { const r = await this.core.entities.get(this.rowId(id)); return r && r.type === TYPE && !r.archivedAt ? r : null; }
        async ids(actorId) { const out = new Set(this.defaults.keys()); for (const r of await this.core.entities.list())
            if (r.type === TYPE && !r.archivedAt && r.data?.userDefined && await this.readable(r, actorId))
                out.add(r.data.id); return [...out].sort(); }
        async readable(r, actorId) { return await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') === true; }
        async effective(id, actorId, opts = {}) {
            const def = this.defaults.get(id);
            const ov = await this.overlay(id);
            if (ov && !await this.readable(ov, actorId))
                throw new Error('Scope denied: READ required');
            if (!def && !ov?.data?.userDefined)
                throw new Error('LIST_UNKNOWN');
            const o = ov?.data || { items: {}, added: [] };
            const items = [...(def?.items || []).map((it) => ({ ...it, ...(o.items?.[it.key] || {}), key: it.key, default: true, defaultLabel: it.label })), ...(o.added || []).map((it) => ({ ...it, ...(o.items?.[it.key] || {}), key: it.key, default: false, defaultLabel: it.label }))]
                .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
            return { id, name: o.name || def?.name || id, description: def?.description || '', owner: def?.owner || OWNER, userDefined: !def, revision: ov?.revision || 0, items: opts.includeArchived === false ? items.filter((i) => !i.archived) : items };
        }
        async label(id, key, actorId) { try {
            return (await this.effective(id, actorId)).items.find((i) => i.key === key)?.label ?? key;
        }
        catch {
            return key;
        } }
        async write(id, ctx, expected, mut, create = false) {
            const ov = await this.overlay(id);
            if (!ov && !create && !this.defaults.has(id))
                throw new Error('LIST_UNKNOWN');
            if (ov && await this.core.access.can({ kind: 'ENTITY', id: ov.id, ownerApp: ov.ownerApp, spaceIds: ov.spaceIds || [] }, ctx.actorId, 'EDIT') !== true)
                throw new Error('Scope denied: EDIT required to change lists');
            const o = structuredClone(ov?.data || { id, items: {}, added: [] });
            mut(o);
            return this.core.entities.save({ id: this.rowId(id), type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_LIST/1', spaceIds: ov ? ov.spaceIds : [await this.sharedSpace(ctx.actorId)], expectedRevision: Number.isInteger(expected) ? expected : (ov?.revision || 0), data: o }, ctx);
        }
        async createList(input, ctx) {
            const name = String(input?.name || '').trim().slice(0, 120);
            if (!name)
                throw new Error('LIST_NAME_REQUIRED');
            let id = 'USER.' + (ascii(name).slice(0, 60) || 'LIST');
            let n = 2;
            while (this.defaults.has(id) || await this.overlay(id))
                id = `USER.${ascii(name).slice(0, 56)}_${n++}`;
            await this.write(id, ctx, 0, o => { o.userDefined = true; o.name = name; o.added = (input?.items || []).map((x, i) => normItem({ key: ascii(x?.label || x) || `ITEM_${i + 1}`, label: x?.label || x, order: i * 10 }, i)); }, true);
            return { id };
        }
        async addItem(input, ctx) {
            const label = String(input?.label || '').trim().slice(0, 120);
            if (!label)
                throw new Error('LIST_ITEM_LABEL_REQUIRED');
            const eff = await this.effective(input?.listId, ctx.actorId);
            let key = ascii(label).slice(0, 60) || 'ITEM';
            const base = key;
            let n = 2;
            while (eff.items.some((i) => i.key === key))
                key = `${base}_${n++}`;
            await this.write(input.listId, ctx, input?.expectedRevision, o => { o.added = [...(o.added || []), normItem({ key, label, color: input?.color, icon: input?.icon, order: Number.isFinite(input?.order) ? input.order : (eff.items.at(-1)?.order ?? 0) + 10 }, 0)]; });
            return { key };
        }
        async setItem(input, ctx) {
            const eff = await this.effective(input?.listId, ctx.actorId);
            const it = eff.items.find((i) => i.key === input?.key);
            if (!it)
                throw new Error('LIST_ITEM_UNKNOWN');
            const p = input?.patch || {};
            for (const k of Object.keys(p))
                if (!['label', 'color', 'icon', 'archived', 'order'].includes(k))
                    throw new Error(`LIST_PATCH_NOT_ALLOWED ${k}`);
            if ('label' in p && !String(p.label || '').trim())
                throw new Error('LIST_ITEM_LABEL_REQUIRED');
            if ('color' in p && p.color && !COLOR_RE.test(String(p.color)))
                throw new Error('LIST_COLOR_INVALID');
            return this.write(input.listId, ctx, input?.expectedRevision, o => {
                const cur = { ...(o.items[it.key] || {}) };
                if ('label' in p)
                    cur.label = String(p.label).trim().slice(0, 120);
                if ('color' in p)
                    cur.color = p.color || '';
                if ('icon' in p)
                    cur.icon = String(p.icon || '').slice(0, 8);
                if ('archived' in p)
                    cur.archived = p.archived === true;
                if ('order' in p) {
                    if (!Number.isFinite(p.order))
                        throw new Error('LIST_ORDER_INVALID');
                    cur.order = Number(p.order);
                }
                o.items[it.key] = cur;
            });
        }
        async moveItem(input, ctx) {
            const eff = await this.effective(input?.listId, ctx.actorId);
            const keys = eff.items.map((i) => i.key);
            const i = keys.indexOf(input?.key);
            if (i < 0)
                throw new Error('LIST_ITEM_UNKNOWN');
            const j = Math.max(0, Math.min(keys.length - 1, i + (input?.dir < 0 ? -1 : 1)));
            if (i === j)
                return { moved: false };
            keys.splice(j, 0, keys.splice(i, 1)[0]);
            await this.write(input.listId, ctx, input?.expectedRevision, o => { keys.forEach((k, n) => { o.items[k] = { ...(o.items[k] || {}), order: n * 10 }; }); });
            return { moved: true };
        }
        async resetItem(input, ctx) { return this.write(input?.listId, ctx, input?.expectedRevision, o => { delete o.items[input?.key]; }); }
    }
    // settings navigation: addressable sections (in memory, registered by Core modules, hubs and the Shell)
    class SettingsNavService {
        sections = new Map();
        register(sec) {
            const id = String(sec?.id || '');
            if (!/^[a-z]+:[A-Za-z0-9_.:-]{1,160}$/.test(id))
                throw new Error('SETTINGS_SECTION_ID_INVALID');
            if (!Array.isArray(sec.path) || !sec.path.length)
                throw new Error('SETTINGS_SECTION_PATH_REQUIRED');
            const s = { id, title: String(sec.title || sec.path.at(-1)).slice(0, 120), path: sec.path.map((p) => String(p).slice(0, 60)), hub: String(sec.hub || 'CORE'), icon: String(sec.icon || '⚙').slice(0, 4), keywords: (sec.keywords || []).map((k) => String(k).slice(0, 40)), order: Number.isFinite(sec.order) ? sec.order : 1000 };
            this.sections.set(id, s);
            return s;
        }
        get(id) { return this.sections.get(id) || null; }
        list() { return [...this.sections.values()].sort((a, b) => a.path.join('›').localeCompare(b.path.join('›'), 'cs') || a.order - b.order); }
        search(q) {
            const n = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const t = n(String(q || '').trim());
            if (t.length < 2)
                return [];
            return this.list().filter(s => n([s.title, ...s.path, ...s.keywords].join(' ')).includes(t)).slice(0, 10);
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.ListService = ListService;
    NS.SettingsNavService = SettingsNavService;
    NS.install = (core, options = {}) => {
        if (core.lists)
            throw new Error('Lists already installed');
        if (!core?.entities?.save)
            throw new Error('Lists require Core entities');
        const svc = new ListService(core, options);
        const nav = new SettingsNavService();
        const reg = [];
        const defs = [['ACTION.CORE.LISTS.IDS', 'READ', (_p, c) => svc.ids(c.actorId)], ['ACTION.CORE.LISTS.GET', 'READ', (p, c) => svc.effective(p?.listId, c.actorId, p || {})],
            ['ACTION.CORE.LISTS.CREATE', 'SAFE_WRITE', (p, c) => svc.createList(p, c)], ['ACTION.CORE.LISTS.ITEM_ADD', 'SAFE_WRITE', (p, c) => svc.addItem(p, c)], ['ACTION.CORE.LISTS.ITEM_SET', 'SAFE_WRITE', (p, c) => svc.setItem(p, c)],
            ['ACTION.CORE.LISTS.ITEM_MOVE', 'SAFE_WRITE', (p, c) => svc.moveItem(p, c)], ['ACTION.CORE.LISTS.ITEM_RESET', 'SAFE_WRITE', (p, c) => svc.resetItem(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.lists = svc;
            core.settingsNav = nav;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.lists;
            delete core.settingsNav;
            throw e;
        }
        nav.register({ id: 'lists:ALL', title: 'Číselníky', path: ['Jádro', 'Číselníky'], keywords: ['seznamy', 'výběry', 'volby', 'stavy', 'materiály'] });
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXLists || (KXLists = {}));
