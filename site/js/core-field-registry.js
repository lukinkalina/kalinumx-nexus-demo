// N2.1r (R50 + R43): registr polí — the single source of truth for tables, forms, detail listings, AI prompts and exports.
//  - a hub / table registers DEFAULT fields for a scope (key, type, label, info, help, placeholder, unit, options, order,
//    visible, width, pinned);
//  - the user's changes are an OVERLAY (rename, info / help text, placeholder, hide, order, width, pin, custom fields)
//    stored per user and scope as a Core entity; defaults are never modified, so an app update can add new default
//    fields and the user's changes survive (backward compatible); reset per field or for the whole scope;
//  - custom field VALUES of entity records live in record.data.custom[key] (CAS save of the record);
//  - aiContext(): the effective fields (incl. renamed and custom ones) as a text block for AI prompts;
//    exportCsv(): header with the user's labels + a second header line with stable keys for re-import.
var KXFieldRegistry;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_FIELD_REGISTRY/1', TYPE = 'CORE.FIELD.OVERLAY';
    const TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOL', 'LINK', 'PERSON', 'FILE'];
    const KEY_RE = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
    const SCOPE_RE = /^[A-Z][A-Z0-9_.:-]{2,120}$/;
    const PATCHABLE = ['label', 'info', 'help', 'placeholder', 'hidden', 'order', 'width', 'pinned'];
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : undefined;
    const csvCell = (v) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    function normField(f, custom = false) {
        if (!f || !KEY_RE.test(String(f.key)))
            throw new Error('FIELD_KEY_INVALID');
        const type = f.type || 'TEXT';
        if (!TYPES.includes(type))
            throw new Error('FIELD_TYPE_INVALID');
        return { key: String(f.key), type, label: str(f.label, 120) || String(f.key), info: str(f.info, 400) || '', help: str(f.help, 2000) || '', placeholder: str(f.placeholder, 200) || '', unit: str(f.unit, 20) || '',
            options: Array.isArray(f.options) ? f.options.map((o) => String(o).slice(0, 80)).slice(0, 100) : [], required: f.required === true, order: Number.isFinite(f.order) ? Number(f.order) : 1000,
            hidden: f.hidden === true, width: Number.isFinite(f.width) ? Math.max(40, Math.min(800, Number(f.width))) : null, pinned: f.pinned === true, custom, system: f.system === true,
            listId: typeof f.listId === 'string' && /^[A-Z][A-Z0-9_.]{1,80}$/.test(f.listId) ? f.listId : null };
    }
    class FieldRegistryService {
        core;
        opts;
        defaults = new Map();
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        registerDefaults(scope, fields) {
            if (!SCOPE_RE.test(String(scope)))
                throw new Error('FIELD_SCOPE_INVALID');
            if (!Array.isArray(fields) || !fields.length)
                throw new Error('FIELD_DEFAULTS_REQUIRED');
            const n = fields.map((f, i) => ({ ...normField({ order: i * 10, ...f }), default: true }));
            const keys = new Set();
            for (const f of n) {
                if (keys.has(f.key))
                    throw new Error('FIELD_KEY_DUPLICATE');
                keys.add(f.key);
            }
            this.defaults.set(scope, n);
            return n.length;
        }
        scopes() { return [...this.defaults.keys()].sort(); }
        id(scope, actorId) { return `FIELDS.${actorId}.${scope}`; }
        async personal(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('FIELDS_NO_PERSONAL_SPACE'); return s.id; }
        async overlay(scope, actorId) { const r = await this.core.entities.get(this.id(scope, actorId)); return r && r.type === TYPE && !r.archivedAt ? r : null; }
        async effective(scope, actorId) {
            const defs = this.defaults.get(scope);
            if (!defs)
                throw new Error('FIELD_SCOPE_UNKNOWN');
            const ov = await this.overlay(scope, actorId);
            const o = ov?.data || { fields: {}, custom: [], showHelp: true };
            const out = [...defs.map(d => ({ ...d, ...(o.fields?.[d.key] || {}), key: d.key, type: d.type, default: true, custom: false, renamed: !!o.fields?.[d.key]?.label && o.fields[d.key].label !== d.label, defaultLabel: d.label })),
                ...(o.custom || []).filter((c) => !c.removed).map((c) => ({ ...normField(c, true), ...(o.fields?.[c.key] || {}), key: c.key, type: c.type, custom: true, default: false, defaultLabel: c.label }))];
            // N2.1t: SELECT fields bound to an option list (číselník) get their options (stable keys) + labels from Core lists
            for (const f of out)
                if (f.listId && this.core.lists) {
                    try {
                        const l = await this.core.lists.effective(f.listId, actorId);
                        f.options = l.items.filter((i) => !i.archived).map((i) => i.key);
                        f.optionLabels = Object.fromEntries(l.items.map((i) => [i.key, i.label]));
                        f.listName = l.name;
                    }
                    catch {
                        f.optionLabels = {};
                    }
                }
            return { scope, showHelp: o.showHelp !== false, revision: ov?.revision || 0, fields: out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || a.key.localeCompare(b.key)) };
        }
        async writeOverlay(scope, ctx, expected, mut) {
            if (!this.defaults.has(scope))
                throw new Error('FIELD_SCOPE_UNKNOWN');
            const cur = await this.overlay(scope, ctx.actorId);
            const o = structuredClone(cur?.data || { scope, fields: {}, custom: [], showHelp: true });
            mut(o);
            return this.core.entities.save({ id: this.id(scope, ctx.actorId), type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_FIELD_OVERLAY/1', spaceIds: cur ? cur.spaceIds : [await this.personal(ctx.actorId)],
                expectedRevision: Number.isInteger(expected) ? expected : (cur?.revision || 0), data: o }, ctx);
        }
        known(scope, o, key) { return (this.defaults.get(scope) || []).some(d => d.key === key) || (o.custom || []).some((c) => c.key === key && !c.removed); }
        async set(input, ctx) {
            const { scope, key, patch } = input || {};
            if (!patch || typeof patch !== 'object')
                throw new Error('FIELD_PATCH_REQUIRED');
            for (const k of Object.keys(patch))
                if (!PATCHABLE.includes(k))
                    throw new Error(`FIELD_PATCH_NOT_ALLOWED ${k}`);
            return this.writeOverlay(scope, ctx, input.expectedRevision, o => {
                if (!this.known(scope, o, key))
                    throw new Error('FIELD_UNKNOWN');
                const cur = { ...(o.fields[key] || {}) };
                if ('label' in patch) {
                    const l = String(patch.label ?? '').trim().slice(0, 120);
                    if (!l)
                        throw new Error('FIELD_LABEL_REQUIRED');
                    cur.label = l;
                }
                for (const k of ['info', 'help', 'placeholder'])
                    if (k in patch)
                        cur[k] = String(patch[k] ?? '').slice(0, k === 'help' ? 2000 : 400);
                if ('hidden' in patch)
                    cur.hidden = patch.hidden === true;
                if ('pinned' in patch)
                    cur.pinned = patch.pinned === true;
                if ('order' in patch) {
                    if (!Number.isFinite(patch.order))
                        throw new Error('FIELD_ORDER_INVALID');
                    cur.order = Number(patch.order);
                }
                if ('width' in patch)
                    cur.width = Math.max(40, Math.min(800, Number(patch.width) || 120));
                o.fields[key] = cur;
            });
        }
        // move a field before another one (drag & drop) — rewrites the order of all visible fields in one overlay write
        async move(input, ctx) {
            const { scope, key, beforeKey } = input || {};
            const eff = await this.effective(scope, ctx.actorId);
            const keys = eff.fields.map((f) => f.key);
            if (!keys.includes(key))
                throw new Error('FIELD_UNKNOWN');
            if (beforeKey !== null && beforeKey !== undefined && !keys.includes(beforeKey))
                throw new Error('FIELD_UNKNOWN');
            const rest = keys.filter((k) => k !== key);
            const at = beforeKey ? rest.indexOf(beforeKey) : rest.length;
            rest.splice(at, 0, key);
            return this.writeOverlay(scope, ctx, input.expectedRevision, o => { rest.forEach((k, i) => { o.fields[k] = { ...(o.fields[k] || {}), order: i * 10 }; }); });
        }
        async addCustom(input, ctx) {
            const label = String(input?.label || '').trim().slice(0, 120);
            if (!label)
                throw new Error('FIELD_LABEL_REQUIRED');
            const base = 'CUSTOM_' + label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
            let key = base || 'CUSTOM_FIELD';
            const saved = await this.writeOverlay(input?.scope, ctx, input?.expectedRevision, o => {
                let n = 2;
                while (this.known(input.scope, o, key) || (o.custom || []).some((c) => c.key === key))
                    key = `${base}_${n++}`;
                o.custom = [...(o.custom || []), { ...normField({ key, type: input?.type || 'TEXT', label, info: input?.info, help: input?.help, placeholder: input?.placeholder, options: input?.options, listId: input?.listId, order: Number.isFinite(input?.order) ? input.order : 5000 }, true), createdAt: new Date().toISOString() }];
            });
            return { key, revision: saved.revision };
        }
        // custom fields are never physically dropped (values stay in records); removing only hides the definition
        async removeCustom(input, ctx) { return this.writeOverlay(input?.scope, ctx, input?.expectedRevision, o => { const c = (o.custom || []).find((x) => x.key === input?.key && !x.removed); if (!c)
            throw new Error('FIELD_NOT_CUSTOM'); c.removed = true; c.removedAt = new Date().toISOString(); }); }
        async reset(input, ctx) { return this.writeOverlay(input?.scope, ctx, input?.expectedRevision, o => { if (input?.key) {
            if (!this.known(input.scope, o, input.key))
                throw new Error('FIELD_UNKNOWN');
            delete o.fields[input.key];
        }
        else
            o.fields = {}; }); }
        async setShowHelp(input, ctx) { return this.writeOverlay(input?.scope, ctx, input?.expectedRevision, o => { o.showHelp = input?.showHelp !== false; }); }
        // custom value on an entity record (CAS); the field must be a custom field of the scope for this user
        async setValue(input, ctx) {
            const eff = await this.effective(input?.scope, ctx.actorId);
            const f = eff.fields.find((x) => x.key === input?.key);
            if (!f || !f.custom)
                throw new Error('FIELD_NOT_CUSTOM');
            const r = await this.core.entities.get(input?.id);
            if (!r || r.archivedAt)
                throw new Error('FIELD_RECORD_NOT_FOUND');
            let v = input?.value;
            if (f.type === 'NUMBER' && v !== '' && v !== null && v !== undefined) {
                v = Number(v);
                if (!Number.isFinite(v))
                    throw new Error('FIELD_VALUE_NOT_NUMBER');
            }
            if (f.type === 'BOOL')
                v = v === true || v === 'true';
            if (f.type === 'DATE' && v && !/^\d{4}-\d{2}-\d{2}/.test(String(v)))
                throw new Error('FIELD_VALUE_NOT_DATE');
            if (f.type === 'SELECT' && v && f.options.length && !f.options.includes(String(v)))
                throw new Error('FIELD_VALUE_NOT_OPTION');
            if (typeof v === 'string')
                v = v.slice(0, 4000);
            return this.core.entities.save({ id: r.id, type: r.type, ownerApp: r.ownerApp, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: Number.isInteger(input?.expectedRevision) ? input.expectedRevision : r.revision, data: { ...r.data, custom: { ...(r.data?.custom || {}), [f.key]: v } } }, ctx);
        }
        // N2.2b (R53): saved table views — a named snapshot of the column setup + density + sort, per user and scope;
        // ready-made presets per scope (registered by the hub / table) plus generic ones; applying never deletes fields
        presetViews = new Map();
        registerViewPresets(scope, presets) { this.presetViews.set(scope, (presets || []).map((v) => ({ name: String(v.name).slice(0, 60), columns: Array.isArray(v.columns) ? v.columns.map(String) : null, density: v.density || null, sort: v.sort || null, preset: true }))); }
        async views(scope, actorId) {
            const eff = await this.effective(scope, actorId);
            const ov = await this.overlay(scope, actorId);
            const own = Object.entries(ov?.data?.views || {}).map(([name, v]) => ({ name, ...v, preset: false }));
            const generic = [{ name: 'Výchozí', columns: null, density: 'EXTRA', sort: null, preset: true, reset: true }, { name: 'Jen první dva sloupce', columns: eff.fields.filter((f) => !f.hidden).slice(0, 2).map((f) => f.key), density: 'COMPACT', sort: null, preset: true }];
            return { current: ov?.data?.currentView || null, views: [...(this.presetViews.get(scope) || []), ...generic, ...own] };
        }
        async saveView(input, ctx) {
            const name = String(input?.name || '').trim().slice(0, 60);
            if (!name)
                throw new Error('FIELD_VIEW_NAME_REQUIRED');
            const eff = await this.effective(input?.scope, ctx.actorId);
            const sort = input?.sort && eff.fields.some((f) => f.key === input.sort.key) ? { key: input.sort.key, dir: input.sort.dir === 'desc' ? 'desc' : 'asc' } : null;
            return this.writeOverlay(input.scope, ctx, input?.expectedRevision, o => { o.views = { ...(o.views || {}), [name]: { fields: structuredClone(o.fields || {}), density: ['EXTRA', 'COMPACT', 'NORMAL'].includes(input?.density) ? input.density : null, sort, savedAt: new Date().toISOString() } }; o.currentView = name; });
        }
        async applyView(input, ctx) {
            const all = await this.views(input?.scope, ctx.actorId);
            const v = all.views.find((x) => x.name === input?.name);
            if (!v)
                throw new Error('FIELD_VIEW_UNKNOWN');
            const eff = await this.effective(input.scope, ctx.actorId);
            await this.writeOverlay(input.scope, ctx, undefined, o => {
                if (v.reset)
                    o.fields = {};
                else if (v.fields)
                    o.fields = structuredClone(v.fields);
                else if (v.columns) {
                    const keys = eff.fields.map((f) => f.key);
                    const fields = { ...(o.fields || {}) };
                    for (const k of keys) {
                        fields[k] = { ...(fields[k] || {}), hidden: !v.columns.includes(k), order: v.columns.includes(k) ? v.columns.indexOf(k) * 10 : 1000 + keys.indexOf(k) };
                    }
                    o.fields = fields;
                }
                o.currentView = v.name;
            });
            return { name: v.name, density: v.density || null, sort: v.sort || null };
        }
        async deleteView(input, ctx) { return this.writeOverlay(input?.scope, ctx, input?.expectedRevision, o => { if (!o.views?.[input?.name])
            throw new Error('FIELD_VIEW_UNKNOWN'); delete o.views[input.name]; if (o.currentView === input.name)
            o.currentView = null; }); }
        async aiContext(scope, actorId, opts = {}) {
            const eff = await this.effective(scope, actorId);
            const fs = eff.fields.filter((f) => opts.includeHidden || !f.hidden);
            return ['Fields (key — label — type — meaning):', ...fs.map((f) => `- ${f.key} — ${f.label} — ${f.type}${f.unit ? ` [${f.unit}]` : ''}${f.options?.length ? ` (options: ${f.options.join(' / ')})` : ''}${f.info || f.help ? ` — ${(f.info || f.help).replace(/\s+/g, ' ').slice(0, 300)}` : ''}${f.custom ? ' (user-defined field)' : ''}${f.renamed ? ` (renamed from "${f.defaultLabel}")` : ''}`)].join('\n');
        }
        async exportCsv(input, actorId) {
            const eff = await this.effective(input?.scope, actorId);
            const fs = eff.fields.filter((f) => input?.includeHidden || !f.hidden);
            const rows = Array.isArray(input?.rows) ? input.rows : [];
            const lines = [fs.map((f) => csvCell(f.label)).join(';'), fs.map((f) => csvCell(f.key)).join(';'), ...rows.map((r) => fs.map((f) => csvCell(r?.[f.key])).join(';'))];
            return { contract: CONTRACT, columns: fs.map((f) => ({ key: f.key, label: f.label })), csv: '\ufeff' + lines.join('\r\n') };
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.TYPES = TYPES;
    NS.FieldRegistryService = FieldRegistryService;
    NS.install = (core, options = {}) => {
        if (core.fields)
            throw new Error('Field registry already installed');
        if (!core?.entities?.save)
            throw new Error('Field registry requires Core entities');
        const svc = new FieldRegistryService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.FIELDS.EFFECTIVE', 'READ', (p, c) => svc.effective(p?.scope, c.actorId)], ['ACTION.CORE.FIELDS.SET', 'SAFE_WRITE', (p, c) => svc.set(p, c)],
            ['ACTION.CORE.FIELDS.MOVE', 'SAFE_WRITE', (p, c) => svc.move(p, c)], ['ACTION.CORE.FIELDS.ADD_CUSTOM', 'SAFE_WRITE', (p, c) => svc.addCustom(p, c)], ['ACTION.CORE.FIELDS.REMOVE_CUSTOM', 'SAFE_WRITE', (p, c) => svc.removeCustom(p, c)],
            ['ACTION.CORE.FIELDS.RESET', 'SAFE_WRITE', (p, c) => svc.reset(p, c)], ['ACTION.CORE.FIELDS.SHOW_HELP', 'SAFE_WRITE', (p, c) => svc.setShowHelp(p, c)], ['ACTION.CORE.FIELDS.SET_VALUE', 'SAFE_WRITE', (p, c) => svc.setValue(p, c)],
            ['ACTION.CORE.FIELDS.VIEWS', 'READ', (p, c) => svc.views(p?.scope, c.actorId)], ['ACTION.CORE.FIELDS.VIEW_SAVE', 'SAFE_WRITE', (p, c) => svc.saveView(p, c)], ['ACTION.CORE.FIELDS.VIEW_APPLY', 'SAFE_WRITE', (p, c) => svc.applyView(p, c)], ['ACTION.CORE.FIELDS.VIEW_DELETE', 'SAFE_WRITE', (p, c) => svc.deleteView(p, c)],
            ['ACTION.CORE.FIELDS.AI_CONTEXT', 'READ', (p, c) => svc.aiContext(p?.scope, c.actorId, p || {})], ['ACTION.CORE.FIELDS.EXPORT_CSV', 'READ', (p, c) => svc.exportCsv(p, c.actorId)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.fields = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.fields;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXFieldRegistry || (KXFieldRegistry = {}));
