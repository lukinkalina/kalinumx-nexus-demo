var KXHubKit;
const PROP_T = () => globalThis.KXI18n?.UI?.['propagate.title']?.cs || 'Propagate…';
(function (KXHubKit) {
    const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
    const localDate = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
    const addMonths = (date, months) => { const d = new Date(date + 'T00:00:00Z'); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtDate = (v) => isDate(v) ? new Date(v + 'T00:00:00').toLocaleDateString() : '—';
    const text = (v, k, max) => { if (typeof v !== 'string')
        throw new Error(`Pole ${k} musí být text`); const t = v.trim(); if (!t || t.length > max)
        throw new Error(`Pole ${k}: 1–${max} znaků`); return t; };
    const pushHistory = (d, entry, nowMs, max = 50) => { d.history = [...(d.history || []), { at: new Date(nowMs).toISOString(), ...entry }].slice(-max); return d; };
    async function editableSpaces(core, actorId) { const out = []; for (const s of await core.memberships.listSpaces()) {
        if (s.archivedAt)
            continue;
        const r = await core.memberships.roleFor(s.id, actorId);
        if (r === 'EDIT' || r === 'MANAGE')
            out.push(s);
    } return out; }
    // Typed access helper bound to one entity type of one owner hub.
    class EntityAccess {
        core;
        type;
        owner;
        constructor(core, type, owner) {
            this.core = core;
            this.type = type;
            this.owner = owner;
            if (!core?.entities?.save || !core?.access?.can || !core?.memberships?.roleFor)
                throw new Error('Hub domain requires Core entities/access/memberships');
        }
        target(r) { return { kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }; }
        async canRead(r, a) { return a === 'SYSTEM' || await this.core.access.can(this.target(r), a, 'READ'); }
        // N2.1g: reads of a protected hub need the verified session of the reader (Core OwnerReadGate); fail closed.
        async gateRead(actorId) { if (this.core.ownerReadGate && !await this.core.ownerReadGate.allows(this.owner, actorId))
            throw new Error(`AUTH_SESSION_REQUIRED_FOR_HUB ${this.owner}`); }
        async list(actorId, o = {}) { await this.gateRead(actorId); const out = []; for (const r of await this.core.entities.list()) {
            if (r.type !== this.type || r.ownerApp !== this.owner)
                continue;
            if (r.archivedAt && !o.includeArchived)
                continue;
            if (this.core.privacy?.isPrivate(r) && !this.core.privacy.isUnlocked(actorId))
                continue; /* N2.3h: private until unlocked */
            if (await this.canRead(r, actorId))
                out.push(r);
        } return out.sort((a, b) => String(a.data?.name || '').localeCompare(String(b.data?.name || ''), 'cs') || a.id.localeCompare(b.id)); }
        async get(id, a) { await this.gateRead(a); const r = await this.core.entities.get(id); if (!r || r.type !== this.type || r.ownerApp !== this.owner)
            return null; return await this.canRead(r, a) ? r : null; }
        async assertSpaces(spaceIds, actorId, missingMsg) {
            if (!Array.isArray(spaceIds) || !spaceIds.length || spaceIds.some((x) => typeof x !== 'string' || !x))
                throw new Error(missingMsg);
            if (actorId === 'SYSTEM')
                return;
            for (const s of new Set(spaceIds)) {
                const role = await this.core.memberships.roleFor(s, actorId);
                if (role !== 'EDIT' && role !== 'MANAGE')
                    throw new Error(`Scope denied: EDIT required for ${s}`);
            }
        }
        async existing(id, actorId, rev, m) {
            if (typeof id !== 'string' || !id)
                throw new Error(m.missingId);
            const r = await this.core.entities.get(id);
            if (!r || r.type !== this.type || r.ownerApp !== this.owner)
                throw new Error(m.notFound(id));
            if (actorId !== 'SYSTEM' && !await this.core.access.can(this.target(r), actorId, 'EDIT'))
                throw new Error(`Scope denied: EDIT required for ${m.scopeTag} ${r.id}`);
            if (!Number.isInteger(rev))
                throw new Error(m.needRev);
            if (r.revision !== rev)
                throw new Error(`Revision conflict ${id}: expected ${rev}, actual ${r.revision}`);
            if (r.archivedAt)
                throw new Error(m.archived);
            return r;
        }
    }
    // ---------- Generic schedule domain: subject + bounded list of scheduled items ----------
    // cfg is pure data (labels, field specs, codes); see src/pets-domain.ts, src/home-domain.ts.
    /* N2.5f: every hub built on the kit is listed (read-only descriptor) – the importer builds its targets from subjectFields + the create action; behaviour of the hubs unchanged */
    KXHubKit.domains = KXHubKit.domains || [];
    function createScheduleDomain(cfg) {
        if (!KXHubKit.domains.some((d) => d.type === cfg.type))
            KXHubKit.domains.push({ owner: cfg.owner, type: cfg.type, label: cfg.label, permission: cfg.permission, createAction: cfg.actions?.create, addItemAction: cfg.actions?.addItem, itemPayloadKey: cfg.itemPayloadKey, itemKinds: cfg.itemKinds, maxItems: cfg.maxItems, subjectFields: cfg.subjectFields, nameKey: cfg.subjectNameKey || 'name' });
        const OWNER = cfg.owner, TYPE = cfg.type, PERM = cfg.permission, ITEMS = cfg.itemsKey, M = cfg.msg, PROVIDER_KIND = 'HUB_DOMAIN_SERVICE';
        const FIELDS = Object.keys(cfg.subjectFields);
        function normalizeSubject(input, old) {
            if (!input || typeof input !== 'object' || Array.isArray(input))
                throw new Error(M.invalidSubject);
            const unknown = Object.keys(input).filter(k => !FIELDS.includes(k));
            if (unknown.length)
                throw new Error(`${M.unknownSubjectFields}: ${unknown.join(',')}`);
            const out = { ...(old || {}) };
            for (const k of FIELDS) {
                if (!(k in input))
                    continue;
                const v = input[k], f = cfg.subjectFields[k];
                if (v === null || (typeof v === 'string' && !v.trim())) {
                    if (f.required)
                        throw new Error(f.requiredMsg || `Pole ${f.label || k} je povinné`);
                    delete out[k];
                    continue;
                }
                if (f.kind === 'text') {
                    const t = text(v, k, f.max);
                    if (f.pattern && !new RegExp(f.pattern).test(t))
                        throw new Error(f.patternMsg);
                    out[k] = t;
                }
                else if (f.kind === 'enum') {
                    if (!f.options[v])
                        throw new Error(f.invalidMsg);
                    out[k] = v;
                }
                else if (f.kind === 'date') {
                    if (!isDate(v))
                        throw new Error(f.invalidMsg);
                    out[k] = v;
                }
            }
            for (const k of FIELDS) {
                const f = cfg.subjectFields[k];
                if (!f.required)
                    continue;
                if (f.kind === 'enum' ? !f.options[out[k]] : !out[k])
                    throw new Error(f.requiredMsg);
            }
            out[ITEMS] = Array.isArray(old?.[ITEMS]) ? old[ITEMS] : [];
            out.history = Array.isArray(old?.history) ? old.history.slice(-50) : [];
            return out;
        }
        function normalizeItem(input) {
            if (!input || typeof input !== 'object')
                throw new Error(M.invalidItem);
            const allowed = ['kind', 'label', 'dueAt', 'intervalDays', 'repeat'];
            const unknown = Object.keys(input).filter(k => !allowed.includes(k));
            if (unknown.length)
                throw new Error(`${M.unknownItemFields}: ${unknown.join(',')}`);
            if (!cfg.itemKinds[input.kind])
                throw new Error(M.invalidItemKind);
            const out = { kind: input.kind, label: input.label === undefined || input.label === '' ? cfg.itemKinds[input.kind] : text(input.label, 'label', 80) };
            if (input.dueAt !== undefined && input.dueAt !== '') {
                if (!isDate(input.dueAt))
                    throw new Error(M.itemDate);
                out.dueAt = input.dueAt;
            }
            if (input.intervalDays !== undefined && input.intervalDays !== '') {
                if (!Number.isInteger(input.intervalDays) || input.intervalDays < 1 || input.intervalDays > 3650)
                    throw new Error(M.itemInterval);
                out.intervalDays = input.intervalDays;
            }
            if (input.repeat !== undefined && input.repeat !== '') {
                const RC = globalThis.KXRecur;
                const rr = RC?.parse?.(String(input.repeat).slice(0, 200));
                if (!rr)
                    throw new Error(M.itemInterval);
                out.repeat = RC.build(rr);
                out.repeatFrom = out.dueAt || localDate(Date.now());
            } /* the rule's ORIGINAL start – COUNT / UNTIL / interval parity are counted from here, never from the moved due date */ /* N2.6b: shared repeat rule (every N hours–years, weekdays, until / count) */
            if (!out.dueAt && !out.intervalDays && !out.repeat)
                throw new Error(M.itemNeedsDue);
            return out;
        }
        function dueItems(subject, today) {
            const d = subject.data || {}, limit = addDays(today, cfg.soonDays), items = [];
            for (const c of d[ITEMS] || []) {
                if (!isDate(c.dueAt))
                    continue;
                const state = c.dueAt < today ? 'OVERDUE' : c.dueAt <= limit ? 'SOON' : null;
                if (!state)
                    continue;
                items.push({ subjectId: subject.id, subjectName: d.name, [cfg.subjectIdKey]: subject.id, [cfg.subjectNameKey]: d.name, itemId: c.id, [cfg.itemIdKey]: c.id, kind: c.kind, label: c.label, state, dueAt: c.dueAt, sensitive: d.kxControls?.sensitive === true || d.kxControls?.items?.[c.id] === true });
            }
            return items;
        }
        const EX = { missingId: M.missingId, notFound: M.notFound, scopeTag: cfg.scopeTag, needRev: M.needRev, archived: M.archived };
        class Service {
            core;
            clock;
            access;
            constructor(core, clock = () => Date.now()) {
                this.core = core;
                this.clock = clock;
                this.access = new EntityAccess(core, TYPE, OWNER);
            }
            list(a, o = {}) { return this.access.list(a, o); }
            get(id, a) { return this.access.get(id, a); }
            /* N2.3d (R67 E2): what this hub offers to propagation – read-only description, no data */
            meta() { return { owner: OWNER, type: TYPE, label: cfg.label, itemsKey: ITEMS, itemPayloadKey: cfg.itemPayloadKey, itemIdKey: cfg.itemIdKey, itemKinds: { ...cfg.itemKinds }, subjectFields: Object.fromEntries(FIELDS.map((k) => [k, { label: cfg.subjectFields[k].label || k, required: !!cfg.subjectFields[k].required, kind: cfg.subjectFields[k].kind, ...(cfg.subjectFields[k].options ? { options: cfg.subjectFields[k].options } : {}) }])) }; }
            push(d, e) { return pushHistory(d, e, this.clock()); }
            save(r, data, ctx, spaceIds) { return this.core.entities.save({ id: r?.id, type: TYPE, ownerApp: OWNER, schema: cfg.schema, spaceIds: spaceIds || r?.spaceIds, data, expectedRevision: r ? r.revision : 0 }, ctx); }
            async create(input, ctx) { const { spaceIds, ...fields } = input || {}; await this.access.assertSpaces(spaceIds, ctx.actorId, M.needSpace); return this.save(null, this.push(normalizeSubject(fields), { kind: 'CREATED' }), ctx, [...new Set(spaceIds)]); }
            async update(input, ctx) { const { id, expectedRevision, ...fields } = input || {}; const r = await this.access.existing(id, ctx.actorId, expectedRevision, EX); if ('spaceIds' in fields || ITEMS in fields)
                throw new Error(M.separateActions); return this.save(r, this.push(normalizeSubject(fields, r.data), { kind: 'UPDATED' }), ctx); }
            async addItem(input, ctx) {
                const r = await this.access.existing(input?.id, ctx.actorId, input?.expectedRevision, EX);
                const list = Array.isArray(r.data[ITEMS]) ? r.data[ITEMS] : [];
                if (list.length >= cfg.maxItems)
                    throw new Error(M.tooMany(cfg.maxItems));
                const item = { id: cfg.itemIdPrefix + crypto.randomUUID(), ...normalizeItem(input[cfg.itemPayloadKey]) };
                return this.save(r, this.push({ ...r.data, [ITEMS]: [...list, item] }, { kind: cfg.history.added, [cfg.itemIdKey]: item.id, label: item.label }), ctx);
            }
            async completeItem(input, ctx) {
                const r = await this.access.existing(input?.id, ctx.actorId, input?.expectedRevision, EX);
                const list = [...(r.data[ITEMS] || [])];
                const i = list.findIndex((c) => c.id === input[cfg.itemIdKey]);
                if (i < 0)
                    throw new Error(M.itemMissing);
                const doneAt = input.doneAt ?? localDate(this.clock());
                if (!isDate(doneAt))
                    throw new Error(M.badDoneDate);
                const c = { ...list[i], lastDoneAt: doneAt };
                if (input.nextDueAt !== undefined && input.nextDueAt !== '') {
                    if (!isDate(input.nextDueAt) || input.nextDueAt <= doneAt)
                        throw new Error(M.nextAfterDone);
                    c.dueAt = input.nextDueAt;
                }
                else if (c.repeat && globalThis.KXRecur) { /* the next occurrence AFTER the later of (current due, done) – done early still moves to the following occurrence */
                    const after = c.dueAt && c.dueAt > doneAt ? c.dueAt : doneAt;
                    const nx = globalThis.KXRecur.next(c.repeat, `${c.repeatFrom || c.dueAt || doneAt}T12:00:00`, `${after}T23:59:59`);
                    if (nx) {
                        const d = new Date(nx);
                        c.dueAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    }
                    else
                        delete c.dueAt;
                }
                else if (Number.isInteger(c.intervalDays))
                    c.dueAt = addDays(doneAt, c.intervalDays);
                else
                    delete c.dueAt;
                list[i] = c;
                return this.save(r, this.push({ ...r.data, [ITEMS]: list }, { kind: cfg.history.done, [cfg.itemIdKey]: c.id, label: c.label, date: doneAt, next: c.dueAt || null }), ctx);
            }
            async removeItem(input, ctx) {
                const r = await this.access.existing(input?.id, ctx.actorId, input?.expectedRevision, EX);
                const list = r.data[ITEMS] || [];
                const hit = list.find((c) => c.id === input[cfg.itemIdKey]);
                if (!hit)
                    throw new Error(M.itemMissing);
                return this.save(r, this.push({ ...r.data, [ITEMS]: list.filter((c) => c.id !== hit.id) }, { kind: cfg.history.removed, [cfg.itemIdKey]: hit.id, label: hit.label }), ctx);
            }
            async archive(input, ctx) { const r = await this.access.existing(input?.id, ctx.actorId, input?.expectedRevision, EX); return this.core.entities.save({ id: r.id, type: TYPE, ownerApp: OWNER, schema: cfg.schema, spaceIds: r.spaceIds, data: this.push({ ...r.data }, { kind: 'ARCHIVED' }), archivedAt: new Date(this.clock()).toISOString(), expectedRevision: r.revision }, ctx); }
            async dueOverview(actorId, nowMs) {
                const today = localDate(nowMs ?? this.clock()), subjects = await this.list(actorId), items = [];
                for (const s of subjects)
                    items.push(...dueItems(s, today));
                items.sort((a, b) => (a.state === b.state ? 0 : a.state === 'OVERDUE' ? -1 : 1) || a.dueAt.localeCompare(b.dueAt));
                return { contract: cfg.contract, today, subjects, [cfg.listKey]: subjects, items, overdue: items.filter(x => x.state === 'OVERDUE').length, soon: items.filter(x => x.state === 'SOON').length };
            }
        }
        function createProjectionAdapter(core, service, options = {}) {
            const P = cfg.projection, clock = typeof options.now === 'function' ? options.now : () => Date.now();
            const planner = typeof KXPersonalPlannerOwner?.createAdapter === 'function' ? KXPersonalPlannerOwner.createAdapter(core, P.code, OWNER, { now: clock }) : null;
            const adapter = async (request) => {
                if (request?.projectionCode !== P.code || request?.ownerApp !== OWNER)
                    throw new Error(`${cfg.label} adapter identity mismatch`);
                const nowMs = clock(), ov = await service.dueOverview(request.subjectId, nowMs);
                let plan = null;
                if (planner) {
                    try {
                        plan = await planner(request);
                    }
                    catch (e) {
                        if (!String(e?.message || e).startsWith('OWNER_NO_SOURCE_RECORDS'))
                            throw e;
                    }
                }
                if (!ov.subjects.length && !plan)
                    throw new Error(`OWNER_NO_SOURCE_RECORDS: subject has no readable ${cfg.scopeTag} records or ${cfg.scopeTag} planner records`);
                const dates = ov.items.filter((x) => x.dueAt >= ov.today).map((x) => x.dueAt).sort();
                let next = dates[0] ? dates[0] + 'T00:00:00.000Z' : null;
                if (plan?.payload?.[P.nextField] && (!next || plan.payload[P.nextField] < next))
                    next = plan.payload[P.nextField];
                const plannerCount = Number(plan?.payload?.[P.countField] || 0), first = ov.items.find((x) => x.state === 'OVERDUE');
                const statusLabel = first ? (first.sensitive ? 'Citlivá položka po termínu' : `${first.label} po termínu (${first.subjectName})`) : ov.items.length ? `Blíží se: ${ov.items.length}` : plannerCount ? plan.payload.statusLabel : `V pořádku · ${cfg.countLabel}: ${ov.subjects.length}`;
                const updated = [...ov.subjects.map((p) => p.updatedAt), plan?.payload?.sourceUpdatedAt].filter(Boolean).sort().pop() || null;
                const sourceRevision = cfg.revisionPrefix + KXPersonalPlannerOwner.sha256Hex(JSON.stringify([ov.subjects.map((p) => [p.id, p.revision]).sort(), ov.today, plan?.sourceRevision || null]));
                return { projectionCode: P.code, ownerApp: OWNER, subjectId: request.subjectId, sourceRevision, generatedAt: nowMs, payload: { [P.countField]: ov.items.length + plannerCount, [P.nextField]: next, statusLabel, sourceUpdatedAt: updated } };
            };
            adapter.kxProviderKind = PROVIDER_KIND;
            return adapter;
        }
        // N2.0 (F2): atomic installation. Any failure (action registration or Personal Home card
        // registration) rolls back every action registered by this call and the service slot, so a
        // retry starts from a clean state. Requires ActionBus.unregister (owner-checked).
        function install(core, personal, options = {}) {
            if (core[cfg.serviceKey])
                throw new Error(`${cfg.label} domain already installed`);
            if (typeof core?.actions?.unregister !== 'function')
                throw new Error(`${cfg.label} domain requires ActionBus.unregister for atomic install`);
            const service = new Service(core, options.now);
            const A = cfg.actions;
            const registered = [];
            const reg = (code, risk, h) => { core.actions.register({ code, ownerApp: OWNER, risk, permission: PERM, handler: h }); registered.push(code); };
            core[cfg.serviceKey] = service;
            try {
                reg(A.create, 'SAFE_WRITE', (p, c) => service.create(p, c));
                reg(A.update, 'SAFE_WRITE', (p, c) => service.update(p, c));
                reg(A.addItem, 'SAFE_WRITE', (p, c) => service.addItem(p, c));
                reg(A.completeItem, 'SAFE_WRITE', (p, c) => service.completeItem(p, c));
                reg(A.removeItem, 'SENSITIVE_WRITE', (p, c) => service.removeItem(p, c));
                reg(A.archive, 'SENSITIVE_WRITE', (p, c) => service.archive(p, c));
                let projection = 'NOT_INSTALLED';
                if (personal?.registerOwnerAdapter) {
                    personal.registerOwnerAdapter(OWNER, createProjectionAdapter(core, service, { now: options.now }));
                    projection = 'REGISTERED';
                }
                return Object.freeze({ contract: cfg.contract, ownerApp: OWNER, providerKind: PROVIDER_KIND, actions: 6, projection, productionVerified: false });
            }
            catch (error) {
                for (const code of registered.reverse())
                    core.actions.unregister(code, OWNER);
                if (core[cfg.serviceKey] === service)
                    delete core[cfg.serviceKey];
                throw error;
            }
        }
        // UI: data attributes data-<P>-*, subject form data-<F>, item form data-<C>, item word <I>.
        async function mountHub(root, core, opts) {
            /* N2.3f (R67): ↗ on every record card and deadline – the Shell opens the propagation window (event, the kit does not know the Shell) */ if (!root.__kxPropagateBound) {
                root.__kxPropagateBound = true;
                root.addEventListener('click', (e) => { const b = e.target?.closest?.('[data-kx-propagate-source]'); if (!b)
                    return; e.preventDefault(); e.stopPropagation(); globalThis.dispatchEvent?.(new CustomEvent('kx:propagate', { detail: { source: { kind: b.dataset.kxPropagateSource, id: b.dataset.kxPropagateId } } })); });
            }
            const U = cfg.ui, P = U.prefix, I = U.itemWord, F = U.subjectForm, C = U.itemForm, A = cfg.actions;
            const svc = core[cfg.serviceKey];
            if (!root)
                return;
            if (!svc) {
                root.innerHTML = `<div class="desk-empty" role="alert">${esc(U.notInstalled)}</div>`;
                return;
            }
            const ui = { form: false, error: '', history: '', itemFor: '', draft: {} };
            const ctx = () => ({ actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [PERM], confirmed: true });
            const run = async (code, payload, ok) => { ui.error = ''; try {
                await core.actions.invoke(code, payload, ctx());
                opts.onToast?.(ok);
                return true;
            }
            catch (e) {
                ui.error = String(e?.message || e);
                return false;
            }
            finally {
                await render();
            } };
            const val = (sel) => root.querySelector(sel)?.value ?? '';
            const fieldInput = (k, f) => f.kind === 'enum' ? `<select data-${F}="${k}">${Object.entries(f.options).map(([o, l]) => `<option value="${esc(o)}" ${ui.draft[k] === o ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input data-${F}="${k}" ${f.kind === 'date' ? 'type="date"' : `maxlength="${esc(f.max)}"`} value="${esc(ui.draft[k] || '')}">`;
            async function render() {
                let ov;
                try {
                    ov = await svc.dueOverview(opts.actorId);
                    if (opts.filter && Array.isArray(ov?.subjects)) { /* N2.3l fix: the cards are drawn from ov.subjects – filter that (and the deadline items of hidden subjects) */
                        const keep = ov.subjects.filter(opts.filter);
                        const ids = new Set(keep.map((x) => x.id));
                        ov = { ...ov, subjects: keep, [cfg.listKey]: keep, items: (ov.items || []).filter((x) => ids.has(x.subjectId || x[cfg.subjectIdKey] || x.recordId || x.id?.split?.('#')[0])) };
                    }
                }
                catch (e) {
                    root.innerHTML = `<div class="desk-empty" role="alert">${esc(e?.message || e)}</div>`;
                    return;
                }
                const spaces = ui.form ? await editableSpaces(core, opts.actorId) : [];
                if (ui.form && !ui.draft.space && opts.defaultSpaceId && spaces.some((s) => s.id === opts.defaultSpaceId))
                    ui.draft.space = opts.defaultSpaceId; /* N2.3m (R72 V1): the hub bar context (Rodina / Firma) preselects the space of a new record */
                const rc = core.recordControls;
                const ctxSpaces = rc ? await rc.contextSpaces(opts.actorId) : null;
                const famId = ctxSpaces?.FAMILY?.id || '', comId = ctxSpaces?.COMPANY?.id || '';
                const badge = (x) => `<span class="veh-badge veh-${esc(x.state.toLowerCase())}">${esc(x.label)} · ${x.state === 'OVERDUE' ? 'po termínu' : 'blíží se'} · ${esc(fmtDate(x.dueAt))}</span>`;
                root.innerHTML = `<section class="veh-hub ${esc(P)}-hub" data-${P}-hub><header class="veh-head"><div><b>${esc(cfg.label)}</b><small>Doménová služba hubu · revize + audit v Core · ${esc(ov.subjects.length)} ${esc(U.countWord)} · ${esc(ov.overdue)} po termínu · ${esc(ov.soon)} blíží se (${esc(cfg.soonDays)} dní)</small></div><button class="btn" data-${P}-add>${ui.form ? 'Zavřít formulář' : esc(U.addLabel)}</button></header>`
                    + (ui.error ? `<div class="ph-error veh-error" role="alert" data-${P}-error>${esc(ui.error)}</div>` : '')
                    + (ui.form ? `<div class="veh-form" data-${P}-form>${(() => { /* N2.4b: opts.prefill fills an empty draft every time the form opens (e.g. HOBBY section); opts.hiddenFields are not shown */ const pf = opts.prefill; if (pf)
                        for (const [k, v] of Object.entries(pf))
                            if (ui.draft[k] == null || ui.draft[k] === '')
                                ui.draft[k] = String(v); return ''; })()}${FIELDS.filter((k) => !(opts.hiddenFields || []).includes(k)).map(k => `<label>${esc(cfg.subjectFields[k].label)}${cfg.subjectFields[k].required ? '*' : ''}${fieldInput(k, cfg.subjectFields[k])}</label>`).join('')}<label>Prostor*<select data-${F}="space">${spaces.map(s => `<option value="${esc(s.id)}" ${ui.draft.space === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><button class="btn" data-${P}-save>${esc(U.saveLabel)}</button></div>` : '')
                    + (ov.subjects.length ? `<div class="veh-list">${ov.subjects.map((p) => {
                        const d = p.data || {}, items = ov.items.filter((x) => x.subjectId === p.id);
                        return `<article class="veh-card" data-${P}-card="${esc(p.id)}" data-${P}-rev="${esc(p.revision)}"><header><b>${esc(d.name)}${d.disambiguation ? (/^\d+$/.test(String(d.disambiguation)) ? ` .${esc(d.disambiguation)}` : ` (${esc(d.disambiguation)})`) : ''}</b><small>${esc(U.subtitle(d, fmtDate))} · rev ${esc(p.revision)}</small><button class="btn ghost compact" data-kx-propagate-source="ENTITY" data-kx-propagate-id="${esc(p.id)}" title="${esc(PROP_T())}">↗</button><button class="btn ghost compact" data-item-menu="${esc(JSON.stringify({ kind: 'HUB_RECORD', id: p.id, ownerApp: OWNER, title: String(d.name || '').slice(0, 80) }))}" title="⋯">⋯</button></header>`
                            + `<div class="veh-badges">${items.length ? items.map(badge).join('') : '<span class="veh-badge veh-ok">V pořádku</span>'}</div>`
                            + (rc ? `<div class="veh-actions kx-record-controls" data-${P}-controls="${esc(p.id)}"><label><input type="checkbox" data-${P}-sensitive="${esc(p.id)}" ${esc(d.kxControls?.sensitive === true ? 'checked' : '')}> Citlivé (skrýt v upozorněních a přehledech)</label><label><input type="checkbox" data-${P}-share-family="${esc(p.id)}" ${esc(famId && (p.spaceIds || []).includes(famId) ? 'checked' : '')} ${esc(famId ? '' : 'disabled')}> Rodina</label><label><input type="checkbox" data-${P}-share-company="${esc(p.id)}" ${esc(comId && (p.spaceIds || []).includes(comId) ? 'checked' : '')} ${esc(comId ? '' : 'disabled')}> Firma</label></div>` : '')
                            + `<ul class="pet-care">${(d[ITEMS] || []).map((c) => `<li data-${P}-${I}="${esc(c.id)}"><span><b>${esc(c.label)}</b><small>${esc(cfg.itemKinds[c.kind] || c.kind)} · termín ${esc(fmtDate(c.dueAt))}${c.repeat && globalThis.KXRecur ? ` · ${esc(globalThis.KXRecur.describe(c.repeat))}` : c.intervalDays ? ` · každých ${esc(c.intervalDays)} dní` : ''}${c.lastDoneAt ? ` · naposledy ${esc(fmtDate(c.lastDoneAt))}` : ''}</small></span><span class="veh-actions">${rc ? `<label><input type="checkbox" data-${P}-item-sensitive="${esc(c.id)}" data-${P}-of="${esc(p.id)}" ${esc(d.kxControls?.sensitive === true || d.kxControls?.items?.[c.id] === true ? 'checked' : '')} ${esc(d.kxControls?.sensitive === true ? 'disabled' : '')}> Citlivé</label>` : ''}<input type="date" aria-label="Příští termín (volitelně)" data-${P}-next="${esc(c.id)}"><button class="btn ghost" data-kx-propagate-source="ITEM" data-kx-propagate-id="${esc(p.id)}#${esc(c.id)}" title="${esc(PROP_T())}">↗</button><button class="btn ghost" data-item-menu="${esc(JSON.stringify({ kind: 'HUB_ITEM', id: p.id + '#' + c.id, ownerApp: OWNER, title: String(c.label || '').slice(0, 80) }))}" title="⋯">⋯</button><button class="btn ghost" data-${P}-done="${esc(c.id)}" data-${P}-of="${esc(p.id)}">Hotovo</button><button class="btn ghost danger" data-${P}-remove="${esc(c.id)}" data-${P}-of="${esc(p.id)}">Odebrat</button></span></li>`).join('') || `<li class="desk-empty">${esc(U.noItems)}</li>`}</ul>`
                            + (ui.itemFor === p.id ? `<div class="veh-form" data-${P}-${I}-form><label>Typ<select data-${C}="kind">${Object.entries(cfg.itemKinds).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label><label>Název<input data-${C}="label" maxlength="80" placeholder="${esc(U.itemPlaceholder)}"></label><label>Termín<input type="date" data-${C}="dueAt"></label><label>Interval (dny)<input type="number" min="1" max="3650" step="1" data-${C}="intervalDays"></label><label>${esc(globalThis.KXTL?.('recur.label') || 'Opakování')}<select data-${C}="repeat" data-kx-recur><option value="">${esc(globalThis.KXTL?.('rw.byInterval') || '—')}</option><option value="FREQ=WEEKLY">${esc(globalThis.KXTL?.('rw.one.WEEKLY') || '')}</option><option value="FREQ=MONTHLY">${esc(globalThis.KXTL?.('rw.one.MONTHLY') || '')}</option><option value="FREQ=YEARLY">${esc(globalThis.KXTL?.('rw.one.YEARLY') || '')}</option></select></label><button class="btn" data-${P}-${I}-save="${esc(p.id)}">${esc(U.addItemLabel)}</button></div>` : '')
                            + `<div class="veh-actions"><button class="btn ghost" data-${P}-${I}-open="${esc(p.id)}">${ui.itemFor === p.id ? 'Zavřít' : esc(U.openItemLabel)}</button><button class="btn ghost" data-${P}-history="${esc(p.id)}">Historie</button><button class="btn ghost danger" data-${P}-archive="${esc(p.id)}">Archivovat</button></div>`
                            + (ui.history === p.id ? `<ol class="veh-history">${[...(d.history || [])].reverse().map((h) => `<li><b>${esc(U.historyText[h.kind] || h.kind)}</b> · ${esc(new Date(h.at).toLocaleString())}${h.label ? ` · ${esc(h.label)}` : ''}${h.next ? ` · příště ${esc(fmtDate(h.next))}` : ''}</li>`).join('')}</ol>` : '')
                            + `</article>`;
                    }).join('')}</div>` : `<div class="desk-empty">${esc(U.empty)}</div>`) + `</section>`;
                const q = (s) => root.querySelector(s), all = (s) => Array.from(root.querySelectorAll(s)), ds = (el, attr) => el.getAttribute(attr) || '';
                const rev = (id) => Number(root.querySelector(`[data-${P}-card="${CSS.escape(id)}"]`)?.getAttribute(`data-${P}-rev`));
                const add = q(`[data-${P}-add]`);
                if (add)
                    add.onclick = async (e) => { e.stopPropagation(); ui.form = !ui.form; ui.error = ''; await render(); };
                const save = q(`[data-${P}-save]`);
                if (save)
                    save.onclick = async (e) => {
                        e.stopPropagation();
                        ui.draft = {};
                        for (const k of [...FIELDS, 'space'])
                            ui.draft[k] = val(`[data-${F}="${k}"]`); /* N2.4b: hidden fields are not in the form – their prefilled values are saved */
                        {
                            const pf = opts.prefill || {};
                            for (const k of (opts.hiddenFields || []))
                                if (pf[k] != null)
                                    ui.draft[k] = String(pf[k]);
                        }
                        const payload = { spaceIds: [ui.draft.space] };
                        for (const k of FIELDS) {
                            const v = ui.draft[k];
                            if (cfg.subjectFields[k].required || String(v).trim())
                                payload[k] = v;
                        }
                        ui.error = '';
                        try {
                            await core.actions.invoke(A.create, payload, ctx());
                            ui.form = false;
                            ui.draft = {};
                            opts.onToast?.(U.savedToast);
                        }
                        catch (err) {
                            ui.error = String(err?.message || err);
                        }
                        await render();
                    };
                all(`[data-${P}-${I}-open]`).forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-${I}-open`); ui.itemFor = ui.itemFor === id ? '' : id; ui.error = ''; await render(); });
                all(`[data-${P}-${I}-save]`).forEach(b => b.onclick = async (e) => {
                    e.stopPropagation();
                    const id = ds(b, `data-${P}-${I}-save`);
                    const interval = val(`[data-${C}="intervalDays"]`).trim();
                    const item = { kind: val(`[data-${C}="kind"]`), label: val(`[data-${C}="label"]`), dueAt: val(`[data-${C}="dueAt"]`) };
                    if (interval)
                        item.intervalDays = Number(interval);
                    {
                        const rp = val(`[data-${C}="repeat"]`).trim();
                        if (rp && rp !== '__custom')
                            item.repeat = rp;
                    }
                    if (await run(A.addItem, { id, expectedRevision: rev(id), [cfg.itemPayloadKey]: item }, U.itemAddedToast)) {
                        ui.itemFor = '';
                        await render();
                    }
                });
                all(`[data-${P}-done]`).forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-of`), itemId = ds(b, `data-${P}-done`); const next = val(`[data-${P}-next="${CSS.escape(itemId)}"]`); await run(A.completeItem, { id, expectedRevision: rev(id), [cfg.itemIdKey]: itemId, nextDueAt: next || undefined }, U.itemDoneToast); });
                all(`[data-${P}-remove]`).forEach(b => b.onclick = async (e) => { e.stopPropagation(); if (!confirm(U.confirmRemove))
                    return; const id = ds(b, `data-${P}-of`); await run(A.removeItem, { id, expectedRevision: rev(id), [cfg.itemIdKey]: ds(b, `data-${P}-remove`) }, U.itemRemovedToast); });
                const rcCtx = () => ({ actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [PERM], confirmed: true });
                const rcRun = async (code, payload) => { ui.error = ''; try {
                    await core.actions.invoke(code, payload, rcCtx());
                }
                catch (e) {
                    ui.error = String(e?.message || e);
                } await render(); };
                all(`[data-${P}-sensitive]`).forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-sensitive`); await rcRun('ACTION.CORE.RECORD.SENSITIVITY.SET', { id, expectedRevision: rev(id), sensitive: b.checked }); });
                all(`[data-${P}-item-sensitive]`).forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-of`); await rcRun('ACTION.CORE.RECORD.SENSITIVITY.SET', { id, expectedRevision: rev(id), items: { [ds(b, `data-${P}-item-sensitive`)]: b.checked } }); });
                all(`[data-${P}-share-family]`).forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-share-family`); await rcRun('ACTION.CORE.RECORD.SHARE', { id, expectedRevision: rev(id), family: b.checked }); });
                all(`[data-${P}-share-company]`).forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-share-company`); await rcRun('ACTION.CORE.RECORD.SHARE', { id, expectedRevision: rev(id), company: b.checked }); });
                all(`[data-${P}-history]`).forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = ds(b, `data-${P}-history`); ui.history = ui.history === id ? '' : id; await render(); });
                all(`[data-${P}-archive]`).forEach(b => b.onclick = async (e) => { e.stopPropagation(); if (!confirm(U.confirmArchive))
                    return; const id = ds(b, `data-${P}-archive`); await run(A.archive, { id, expectedRevision: rev(id) }, U.archivedToast); });
            }
            await render();
        }
        return Object.freeze({ CONTRACT: cfg.contract, OWNER, TYPE, PROVIDER_KIND, SOON_DAYS: cfg.soonDays, config: cfg, normalizeSubject, normalizeItem, dueItems, Service, createProjectionAdapter, install, mountHub });
    }
    Object.assign(KXHubKit, { isDate, localDate, addDays, addMonths, esc, fmtDate, text, pushHistory, editableSpaces, EntityAccess, createScheduleDomain });
})(KXHubKit || (KXHubKit = {}));
