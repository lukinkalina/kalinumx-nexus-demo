var KXVehicles;
(function (KXVehicles) {
    const KTL = (k) => { const v2 = globalThis.KXTL?.(k); return v2 && v2 !== k ? v2 : k; }; /* N2.6b+ catalogue texts */
    const CONTRACT = 'KX.VEHICLES_DOMAIN/1', OWNER = 'APP.KX.VEHICLES', TYPE = 'VEHICLES.VEHICLE', SCHEMA = 'KX.VEHICLES.VEHICLE/1';
    const PROVIDER_KIND = 'HUB_DOMAIN_SERVICE', PERM = 'VEHICLES.VEHICLE.EDIT', SOON_DAYS = 30, SOON_KM = 1000, HISTORY_MAX = 50;
    const FIELDS = ['name', 'plate', 'odometerKm', 'inspectionDueAt', 'serviceDueAt', 'serviceDueKm', 'serviceIntervalKm', 'serviceIntervalMonths', 'insuranceDueAt', 'note'];
    const DATE_FIELDS = ['inspectionDueAt', 'serviceDueAt', 'insuranceDueAt'];
    const KM_FIELDS = ['odometerKm', 'serviceDueKm', 'serviceIntervalKm'];
    // Stage145: shared helpers from src/hub-domain-kit.ts (previously duplicated here).
    const { isDate, localDate, addDays, addMonths } = KXHubKit;
    const isKm = (v) => Number.isInteger(v) && v >= 0 && v <= 5000000;
    // Strict normalisation of user-supplied vehicle data. Unknown fields are rejected.
    function normalize(input, old) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Neplatná data vozidla');
        const unknown = Object.keys(input).filter(k => !FIELDS.includes(k));
        if (unknown.length)
            throw new Error(`Neznámá pole vozidla: ${unknown.join(',')}`);
        const out = { ...(old || {}) };
        for (const k of FIELDS) {
            if (!(k in input))
                continue;
            const v = input[k];
            // Stage145: human-readable Czech message instead of the internal field key.
            if (v === null || v === '' || (typeof v === 'string' && !v.trim())) {
                if (k === 'name')
                    throw new Error('Název vozidla je povinný');
                if (k === 'odometerKm')
                    throw new Error('Stav tachometru je povinný');
                delete out[k];
                continue;
            }
            if (k === 'name' || k === 'plate' || k === 'note') {
                if (typeof v !== 'string')
                    throw new Error(`Pole ${k} musí být text`);
                const t = v.trim();
                const max = k === 'note' ? 500 : k === 'plate' ? 20 : 120;
                if (!t || t.length > max)
                    throw new Error(`Pole ${k}: 1–${max} znaků`);
                out[k] = t;
                continue;
            }
            if (DATE_FIELDS.includes(k)) {
                if (!isDate(v))
                    throw new Error(`Pole ${k} musí být datum RRRR-MM-DD`);
                out[k] = v;
                continue;
            }
            if (KM_FIELDS.includes(k)) {
                if (!isKm(v))
                    throw new Error(`Pole ${k} musí být celé číslo 0–5000000 km`);
                out[k] = v;
                continue;
            }
            if (k === 'serviceIntervalMonths') {
                if (!Number.isInteger(v) || v < 1 || v > 120)
                    throw new Error('Interval servisu: 1–120 měsíců');
                out[k] = v;
                continue;
            }
        }
        if (typeof out.name !== 'string' || !out.name)
            throw new Error('Název vozidla je povinný');
        if (!isKm(out.odometerKm))
            throw new Error('Stav tachometru je povinný');
        if (old && isKm(old.odometerKm) && out.odometerKm < old.odometerKm)
            throw new Error('Stav tachometru nesmí klesnout');
        if (out.serviceIntervalKm === 0)
            throw new Error('Interval servisu v km musí být kladný');
        out.history = Array.isArray(old?.history) ? old.history.slice(-HISTORY_MAX) : [];
        return out;
    }
    // Pure due evaluation for one vehicle at a local calendar date.
    function dueItems(vehicle, today) {
        const d = vehicle.data || {}, items = [], soonLimit = addDays(today, SOON_DAYS);
        const sensitive = d.kxControls?.sensitive === true;
        const dateItem = (kind, label, at) => { if (!isDate(at))
            return; if (at < today)
            items.push({ vehicleId: vehicle.id, vehicleName: d.name, kind, label, state: 'OVERDUE', dueAt: at, sensitive });
        else if (at <= soonLimit)
            items.push({ vehicleId: vehicle.id, vehicleName: d.name, kind, label, state: 'SOON', dueAt: at }); };
        dateItem('INSPECTION', 'STK', d.inspectionDueAt);
        dateItem('SERVICE_DATE', 'Servis', d.serviceDueAt);
        dateItem('INSURANCE', 'Pojištění', d.insuranceDueAt);
        if (isKm(d.serviceDueKm) && isKm(d.odometerKm)) {
            const rest = d.serviceDueKm - d.odometerKm;
            if (rest <= 0)
                items.push({ vehicleId: vehicle.id, vehicleName: d.name, kind: 'SERVICE_KM', label: 'Servis (km)', state: 'OVERDUE', remainingKm: rest });
            else if (rest <= SOON_KM)
                items.push({ vehicleId: vehicle.id, vehicleName: d.name, kind: 'SERVICE_KM', label: 'Servis (km)', state: 'SOON', remainingKm: rest });
        }
        return items;
    }
    class VehiclesDomainService {
        core;
        clock;
        access;
        static EX = { missingId: 'Chybí ID vozidla', notFound: (id) => `Vozidlo ${id} neexistuje`, scopeTag: 'vehicle', needRev: 'Úprava vozidla vyžaduje expectedRevision', archived: 'Archivované vozidlo nelze upravovat' };
        constructor(core, clock = () => Date.now()) {
            this.core = core;
            this.clock = clock;
            this.access = new KXHubKit.EntityAccess(core, TYPE, OWNER);
        }
        assertSpaces(spaceIds, actorId) { return this.access.assertSpaces(spaceIds, actorId, 'Vozidlo musí patřit alespoň do jednoho prostoru'); }
        list(actorId, options = {}) { return this.access.list(actorId, options); }
        get(id, actorId) { return this.access.get(id, actorId); }
        existing(id, actorId, expectedRevision) { return this.access.existing(id, actorId, expectedRevision, VehiclesDomainService.EX); }
        historyPush(data, entry) { return KXHubKit.pushHistory(data, entry, this.clock(), HISTORY_MAX); }
        save(row, data, ctx, spaceIds) { return this.core.entities.save({ id: row?.id, type: TYPE, ownerApp: OWNER, schema: SCHEMA, spaceIds: spaceIds || row?.spaceIds, data, expectedRevision: row ? row.revision : 0 }, ctx); }
        async create(input, ctx) {
            await this.assertSpaces(input?.spaceIds, ctx.actorId);
            const { spaceIds, ...fields } = input || {};
            const data = this.historyPush(normalize(fields), { kind: 'CREATED', km: fields.odometerKm });
            return this.save(null, data, ctx, [...new Set(spaceIds)]);
        }
        async update(input, ctx) {
            const { id, expectedRevision, ...fields } = input || {};
            const row = await this.existing(id, ctx.actorId, expectedRevision);
            if ('spaceIds' in fields)
                throw new Error('Změna prostorů vozidla zde není povolená');
            return this.save(row, this.historyPush(normalize(fields, row.data), { kind: 'UPDATED' }), ctx);
        }
        async recordOdometer(input, ctx) {
            const row = await this.existing(input?.id, ctx.actorId, input?.expectedRevision);
            if (!isKm(input.odometerKm))
                throw new Error('Neplatný stav tachometru');
            if (input.odometerKm < row.data.odometerKm)
                throw new Error('Stav tachometru nesmí klesnout');
            return this.save(row, this.historyPush(normalize({ odometerKm: input.odometerKm }, row.data), { kind: 'ODOMETER', km: input.odometerKm }), ctx);
        }
        // Service done: next due values come ONLY from user intervals or explicit input.
        async completeService(input, ctx) {
            const row = await this.existing(input?.id, ctx.actorId, input?.expectedRevision);
            const d = row.data;
            const doneAt = input.doneAt ?? localDate(this.clock());
            if (!isDate(doneAt))
                throw new Error('Neplatné datum servisu');
            const km = input.odometerKm ?? d.odometerKm;
            if (!isKm(km) || km < d.odometerKm)
                throw new Error('Neplatný stav tachometru při servisu');
            const next = { odometerKm: km };
            if (input.nextServiceDueAt !== undefined)
                next.serviceDueAt = input.nextServiceDueAt;
            else if (Number.isInteger(d.serviceIntervalMonths))
                next.serviceDueAt = addMonths(doneAt, d.serviceIntervalMonths);
            else
                next.serviceDueAt = null;
            if (input.nextServiceDueKm !== undefined)
                next.serviceDueKm = input.nextServiceDueKm;
            else if (isKm(d.serviceIntervalKm))
                next.serviceDueKm = km + d.serviceIntervalKm;
            else
                next.serviceDueKm = null;
            const data = normalize(next, d);
            data.lastServiceAt = doneAt;
            data.lastServiceKm = km;
            return this.save(row, this.historyPush(data, { kind: 'SERVICE_DONE', km, date: doneAt }), ctx);
        }
        // STK done: legal intervals differ by vehicle/age/country, so the next date is mandatory input.
        async completeInspection(input, ctx) {
            const row = await this.existing(input?.id, ctx.actorId, input?.expectedRevision);
            if (!isDate(input.nextInspectionDueAt))
                throw new Error('Zadejte datum příští STK (RRRR-MM-DD)');
            const doneAt = input.doneAt ?? localDate(this.clock());
            if (!isDate(doneAt) || input.nextInspectionDueAt <= doneAt)
                throw new Error('Příští STK musí být po datu provedení');
            const data = normalize({ inspectionDueAt: input.nextInspectionDueAt }, row.data);
            data.lastInspectionAt = doneAt;
            return this.save(row, this.historyPush(data, { kind: 'INSPECTION_DONE', date: doneAt, next: input.nextInspectionDueAt }), ctx);
        }
        async archive(input, ctx) {
            const row = await this.existing(input?.id, ctx.actorId, input?.expectedRevision);
            return this.core.entities.save({ id: row.id, type: TYPE, ownerApp: OWNER, schema: SCHEMA, spaceIds: row.spaceIds, data: this.historyPush({ ...row.data }, { kind: 'ARCHIVED' }), archivedAt: new Date(this.clock()).toISOString(), expectedRevision: row.revision }, ctx);
        }
        async dueOverview(actorId, nowMs) {
            const today = localDate(nowMs ?? this.clock()), vehicles = await this.list(actorId), items = [];
            for (const v of vehicles)
                items.push(...dueItems(v, today));
            items.sort((a, b) => (a.state === b.state ? 0 : a.state === 'OVERDUE' ? -1 : 1) || String(a.dueAt || '').localeCompare(String(b.dueAt || '')));
            return { contract: CONTRACT, today, vehicles, items, overdue: items.filter(x => x.state === 'OVERDUE').length, soon: items.filter(x => x.state === 'SOON').length };
        }
    }
    // Personal Home projection over the REAL domain service (+ VEHICLES-owned planner items).
    function createProjectionAdapter(core, service, options = {}) {
        const clock = typeof options.now === 'function' ? options.now : () => Date.now();
        const planner = typeof KXPersonalPlannerOwner?.createAdapter === 'function' ? KXPersonalPlannerOwner.createAdapter(core, 'PERSONAL.VEHICLES.STATUS', OWNER, { now: clock }) : null;
        const adapter = async (request) => {
            if (request?.projectionCode !== 'PERSONAL.VEHICLES.STATUS' || request?.ownerApp !== OWNER)
                throw new Error('Vehicles adapter identity mismatch');
            const nowMs = clock(), overview = await service.dueOverview(request.subjectId, nowMs);
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
            if (!overview.vehicles.length && !plan)
                throw new Error('OWNER_NO_SOURCE_RECORDS: subject has no readable vehicles or vehicle planner records');
            const dates = overview.items.filter((x) => x.dueAt && x.dueAt >= overview.today).map((x) => x.dueAt).sort();
            let next = dates[0] ? dates[0] + 'T00:00:00.000Z' : null;
            if (plan?.payload?.nextServiceAt && (!next || plan.payload.nextServiceAt < next))
                next = plan.payload.nextServiceAt;
            const plannerCount = Number(plan?.payload?.alertsCount || 0), alerts = overview.items.length + plannerCount;
            const firstOverdue = overview.items.find((x) => x.state === 'OVERDUE');
            const statusLabel = firstOverdue ? (firstOverdue.sensitive ? 'Citlivá položka po termínu' : `${firstOverdue.label} po termínu (${firstOverdue.vehicleName})`) : overview.items.length ? `Blíží se: ${overview.items.length}` : plannerCount ? (plan.payload.statusLabel) : `V pořádku · vozidel: ${overview.vehicles.length}`;
            const updated = [...overview.vehicles.map((v) => v.updatedAt), plan?.payload?.sourceUpdatedAt].filter(Boolean).sort().pop() || null;
            const identity = overview.vehicles.map((v) => [v.id, v.revision]).sort();
            const sourceRevision = 'VEHICLES.DOMAIN/1:' + KXPersonalPlannerOwner.sha256Hex(JSON.stringify([identity, overview.today, plan?.sourceRevision || null]));
            return { projectionCode: 'PERSONAL.VEHICLES.STATUS', ownerApp: OWNER, subjectId: request.subjectId, sourceRevision, generatedAt: nowMs, payload: { alertsCount: alerts, nextServiceAt: next, statusLabel, sourceUpdatedAt: updated } };
        };
        adapter.kxProviderKind = PROVIDER_KIND;
        return adapter;
    }
    // N2.1b (N2-F11): atomic like KXHubKit.install (N2.0 F2): any failure rolls back own actions + service slot.
    function install(core, personal, options = {}) {
        if (core.vehicles)
            throw new Error('Vehicles domain already installed');
        if (typeof core?.actions?.unregister !== 'function')
            throw new Error('Vehicles domain requires ActionBus.unregister for atomic install');
        const service = new VehiclesDomainService(core, options.now);
        const registered = [];
        core.vehicles = service;
        const reg = (code, risk, handler) => { core.actions.register({ code, ownerApp: OWNER, risk, permission: PERM, handler }); registered.push(code); };
        try {
            reg('ACTION.VEHICLES.VEHICLE.CREATE', 'SAFE_WRITE', (p, c) => service.create(p, c));
            reg('ACTION.VEHICLES.VEHICLE.UPDATE', 'SAFE_WRITE', (p, c) => service.update(p, c));
            reg('ACTION.VEHICLES.ODOMETER.RECORD', 'SAFE_WRITE', (p, c) => service.recordOdometer(p, c));
            reg('ACTION.VEHICLES.SERVICE.COMPLETE', 'SAFE_WRITE', (p, c) => service.completeService(p, c));
            reg('ACTION.VEHICLES.INSPECTION.COMPLETE', 'SAFE_WRITE', (p, c) => service.completeInspection(p, c));
            reg('ACTION.VEHICLES.VEHICLE.ARCHIVE', 'SENSITIVE_WRITE', (p, c) => service.archive(p, c));
            let projection = 'NOT_INSTALLED';
            if (personal?.registerOwnerAdapter) {
                personal.registerOwnerAdapter(OWNER, createProjectionAdapter(core, service, { now: options.now }));
                projection = 'REGISTERED';
            }
            return Object.freeze({ contract: CONTRACT, ownerApp: OWNER, providerKind: PROVIDER_KIND, actions: 6, projection, productionVerified: false });
        }
        catch (error) {
            for (const code of registered.reverse())
                core.actions.unregister(code, OWNER);
            if (core.vehicles === service)
                delete core.vehicles;
            throw error;
        }
    }
    // ---------------- Hub UI (mounted into the APP inspector) ----------------
    const { esc, fmtDate } = KXHubKit;
    const KM = (v) => { const x = Number(v); return Number.isFinite(x) ? new Intl.NumberFormat(String(globalThis.document?.documentElement?.lang || 'cs').startsWith('en') ? 'en-GB' : 'cs-CZ').format(x) : String(v ?? ''); }; /* N2.6b+: 142 300 km */
    const KIND_TEXT = { CREATED: 'Založeno', UPDATED: 'Upraveno', ODOMETER: 'Tachometr', SERVICE_DONE: 'Servis proveden', INSPECTION_DONE: 'STK provedena', ARCHIVED: 'Archivováno' };
    async function mountHub(root, core, opts) {
        const svc = core.vehicles;
        if (!root)
            return;
        if (!svc) {
            root.innerHTML = '<div class="desk-empty" role="alert">Doménová služba Vozidla není nainstalovaná.</div>';
            return;
        }
        const ui = { form: false, error: '', expanded: '', draft: {} };
        const ctx = () => ({ actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [PERM], confirmed: true });
        const run = async (code, payload, ok) => { ui.error = ''; try {
            await core.actions.invoke(code, payload, ctx());
            opts.onToast?.(ok);
        }
        catch (e) {
            ui.error = String(e?.message || e);
        } await render(); };
        const editableSpaces = () => KXHubKit.editableSpaces(core, opts.actorId);
        const num = (v) => { const t = String(v ?? '').trim(); if (!t)
            return undefined; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
        async function render() {
            let ov;
            try {
                ov = await svc.dueOverview(opts.actorId);
                if (opts.filter && Array.isArray(ov?.vehicles))
                    ov = { ...ov, vehicles: ov.vehicles.filter(opts.filter) }; /* N2.3l: hub bar filter */
            }
            catch (e) {
                root.innerHTML = `<div class="desk-empty" role="alert">${esc(e?.message || e)}</div>`;
                return;
            }
            const spaces = ui.form ? await editableSpaces() : [];
            if (ui.form && !ui.draft.space && opts.defaultSpaceId && spaces.some((s) => s.id === opts.defaultSpaceId))
                ui.draft.space = opts.defaultSpaceId; /* N2.3m (R72 V1): the hub bar context (Rodina / Firma) preselects the space of a new record */
            const rc = core.recordControls;
            const ctxSpaces = rc ? await rc.contextSpaces(opts.actorId) : null;
            const famId = ctxSpaces?.FAMILY?.id || '', comId = ctxSpaces?.COMPANY?.id || '';
            const byVehicle = (id) => ov.items.filter((x) => x.vehicleId === id);
            const badge = (x) => `<span class="veh-badge veh-${esc(x.state.toLowerCase())}">${esc(x.label)} · ${x.state === 'OVERDUE' ? 'po termínu' : 'blíží se'}${x.dueAt ? ` · ${esc(fmtDate(x.dueAt))}` : ''}${x.remainingKm !== undefined ? ` · ${esc(KM(x.remainingKm))} km` : ''}</span>`;
            root.innerHTML = `<section class="veh-hub" data-veh-hub><header class="veh-head"><div><b>Vozidla</b><small>Doménová služba hubu · revize + audit v Core · ${ov.vehicles.length} vozidel · ${ov.overdue} po termínu · ${ov.soon} blíží se</small></div><button class="btn" data-veh-add>${ui.form ? 'Zavřít formulář' : '＋ Vozidlo'}</button></header>`
                + (ui.error ? `<div class="ph-error veh-error" role="alert" data-veh-error>${esc(ui.error)}</div>` : '')
                + (ui.form ? `<div class="veh-form" data-veh-form><label>Název*<input data-vf="name" value="${esc(ui.draft["name"] || "")}" maxlength="120"></label><label>SPZ<input data-vf="plate" value="${esc(ui.draft["plate"] || "")}" maxlength="20"></label><label>Prostor*<select data-vf="space">${spaces.map(s => `<option value="${esc(s.id)}" ${ui.draft.space === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><label>Tachometr (km)*<input data-vf="odometerKm" value="${esc(ui.draft["odometerKm"] || "")}" type="number" min="0" step="1"></label><label>Příští STK<input data-vf="inspectionDueAt" value="${esc(ui.draft["inspectionDueAt"] || "")}" type="date"></label><label>Servis do data<input data-vf="serviceDueAt" value="${esc(ui.draft["serviceDueAt"] || "")}" type="date"></label><label>Servis při km<input data-vf="serviceDueKm" value="${esc(ui.draft["serviceDueKm"] || "")}" type="number" min="0" step="1"></label><label>Interval servisu (km)<input data-vf="serviceIntervalKm" value="${esc(ui.draft["serviceIntervalKm"] || "")}" type="number" min="1" step="1"></label><label>Interval servisu (měsíce)<input data-vf="serviceIntervalMonths" value="${esc(ui.draft["serviceIntervalMonths"] || "")}" type="number" min="1" max="120" step="1"></label><label>Pojištění do<input data-vf="insuranceDueAt" value="${esc(ui.draft["insuranceDueAt"] || "")}" type="date"></label><button class="btn" data-veh-save>Uložit vozidlo</button></div>` : '')
                + (ov.vehicles.length ? `<div class="veh-list">${ov.vehicles.map((v) => {
                    const d = v.data || {}, items = byVehicle(v.id);
                    return `<article class="veh-card" data-veh-card="${esc(v.id)}" data-veh-rev="${esc(v.revision)}"><header><b>${esc(d.name)}</b><small>${esc(d.plate || 'bez SPZ')}${Number(d.odometerKm) > 0 ? ` · ${esc(KM(d.odometerKm))} km` : ''} · rev ${esc(v.revision)}</small><button class="btn ghost compact" data-kx-propagate-source="ENTITY" data-kx-propagate-id="${esc(v.id)}" title="↗">↗</button><button class="btn ghost compact" data-item-menu="${esc(JSON.stringify({ kind: 'HUB_RECORD', id: v.id, ownerApp: OWNER, title: String(d.name || '').slice(0, 80) }))}" title="⋯">⋯</button></header>`
                        + `<div class="veh-badges">${items.length ? items.map(badge).join('') : '<span class="veh-badge veh-ok">V pořádku</span>'}</div>`
                        + (rc ? `<details class="kx-rc-det"><summary title="${esc(KTL('rc2.hint'))}">${(() => { const fam = !!famId && (v.spaceIds || []).includes(famId), com = !!comId && (v.spaceIds || []).includes(comId), sen = d.kxControls?.sensitive === true; const parts = [fam ? '👪 ' + KTL('rc2.family') : '', com ? '🏢 ' + KTL('rc2.company') : ''].filter(Boolean); return esc(`${parts.length ? parts.join(' · ') : '👤 ' + KTL('rc2.me')}${sen ? ' · 🔒 ' + KTL('rc2.sensitive') : ''}`); })()}</summary><div class="veh-actions kx-record-controls" data-veh-controls="${esc(v.id)}"><label><input type="checkbox" data-veh-sensitive="${esc(v.id)}" ${esc(d.kxControls?.sensitive === true ? 'checked' : '')}> Citlivé (skrýt v upozorněních a přehledech)</label><label><input type="checkbox" data-veh-share-family="${esc(v.id)}" ${esc(famId && (v.spaceIds || []).includes(famId) ? 'checked' : '')} ${esc(famId ? '' : 'disabled')}> Rodina</label><label><input type="checkbox" data-veh-share-company="${esc(v.id)}" ${esc(comId && (v.spaceIds || []).includes(comId) ? 'checked' : '')} ${esc(comId ? '' : 'disabled')}> Firma</label></div></details>` : '')
                        + `<dl class="veh-facts"><div><dt>STK</dt><dd>${esc(fmtDate(d.inspectionDueAt))}</dd></div><div><dt>Servis</dt><dd>${esc(fmtDate(d.serviceDueAt))}${isKm(d.serviceDueKm) ? ` / ${esc(KM(d.serviceDueKm))} km` : ''}</dd></div><div><dt>Pojištění</dt><dd>${esc(fmtDate(d.insuranceDueAt))}</dd></div><div><dt>Poslední servis</dt><dd>${esc(fmtDate(d.lastServiceAt))}${isKm(d.lastServiceKm) ? ` · ${esc(KM(d.lastServiceKm))} km` : ''}</dd></div></dl>`
                        + `<div class="veh-actions"><input type="number" min="${esc(d.odometerKm)}" step="1" placeholder="nový stav km" data-veh-km-input="${esc(v.id)}"><button class="btn ghost" data-veh-km="${esc(v.id)}">Zapsat km</button><button class="btn ghost" data-veh-service="${esc(v.id)}" title="${d.serviceIntervalKm || d.serviceIntervalMonths ? 'Další termín z vašeho intervalu' : 'Bez intervalu: další termín se vymaže'}">Servis hotov</button><input type="date" data-veh-stk-input="${esc(v.id)}" aria-label="Příští STK"><button class="btn ghost" data-veh-stk="${esc(v.id)}">STK hotova</button><button class="btn ghost" data-veh-history="${esc(v.id)}">Historie</button><button class="btn ghost danger" data-veh-archive="${esc(v.id)}">Archivovat</button></div>`
                        + (ui.expanded === v.id ? `<ol class="veh-history" data-veh-history-list>${[...(d.history || [])].reverse().map((h) => `<li><b>${esc(KIND_TEXT[h.kind] || h.kind)}</b> · ${esc(new Date(h.at).toLocaleString())}${h.km !== undefined ? ` · ${esc(KM(h.km))} km` : ''}${h.next ? ` · příští ${esc(fmtDate(h.next))}` : ''}</li>`).join('')}</ol>` : '')
                        + `</article>`;
                }).join('')}</div>` : `<div class="desk-empty">Zatím žádná vozidla. Přidejte první vozidlo — data zůstávají v hubu Vozidla, Personal Home je jen čte.</div>`)
                + `</section>`;
            const q = (s) => root.querySelector(s), all = (s) => Array.from(root.querySelectorAll(s));
            const rev = (id) => Number(root.querySelector(`[data-veh-card="${CSS.escape(id)}"]`)?.dataset.vehRev);
            const add = q('[data-veh-add]');
            if (add)
                add.onclick = async (e) => { e.stopPropagation(); ui.form = !ui.form; ui.error = ''; await render(); };
            const save = q('[data-veh-save]');
            if (save)
                save.onclick = async (e) => {
                    e.stopPropagation();
                    const f = (k) => root.querySelector(`[data-vf="${k}"]`)?.value ?? '';
                    const payload = { name: f('name'), spaceIds: [f('space')], odometerKm: num(f('odometerKm')) };
                    if (f('plate').trim())
                        payload.plate = f('plate');
                    for (const k of ['inspectionDueAt', 'serviceDueAt', 'insuranceDueAt'])
                        if (f(k))
                            payload[k] = f(k);
                    for (const k of ['serviceDueKm', 'serviceIntervalKm', 'serviceIntervalMonths']) {
                        const n = num(f(k));
                        if (n !== undefined)
                            payload[k] = n;
                    }
                    ui.draft = {};
                    for (const k of ['name', 'plate', 'space', 'odometerKm', 'inspectionDueAt', 'serviceDueAt', 'serviceDueKm', 'serviceIntervalKm', 'serviceIntervalMonths', 'insuranceDueAt'])
                        ui.draft[k] = f(k);
                    ui.error = '';
                    try {
                        await core.actions.invoke('ACTION.VEHICLES.VEHICLE.CREATE', payload, ctx());
                        ui.form = false;
                        ui.draft = {};
                        opts.onToast?.('Vozidlo uloženo');
                    }
                    catch (err) {
                        ui.error = String(err?.message || err);
                    }
                    await render();
                };
            all('[data-veh-km]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = b.dataset.vehKm; const v = root.querySelector(`[data-veh-km-input="${CSS.escape(id)}"]`)?.value; await run('ACTION.VEHICLES.ODOMETER.RECORD', { id, expectedRevision: rev(id), odometerKm: num(v) }, 'Stav tachometru zapsán'); });
            all('[data-veh-service]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = b.dataset.vehService; await run('ACTION.VEHICLES.SERVICE.COMPLETE', { id, expectedRevision: rev(id) }, 'Servis zapsán'); });
            all('[data-veh-stk]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = b.dataset.vehStk; const v = root.querySelector(`[data-veh-stk-input="${CSS.escape(id)}"]`)?.value; await run('ACTION.VEHICLES.INSPECTION.COMPLETE', { id, expectedRevision: rev(id), nextInspectionDueAt: v || undefined }, 'STK zapsána'); });
            const rcRun = async (code, payload) => { ui.error = ''; try {
                await core.actions.invoke(code, payload, ctx());
            }
            catch (e) {
                ui.error = String(e?.message || e);
            } await render(); };
            all('[data-veh-sensitive]').forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = b.dataset.vehSensitive; await rcRun('ACTION.CORE.RECORD.SENSITIVITY.SET', { id, expectedRevision: rev(id), sensitive: b.checked }); });
            all('[data-veh-share-family]').forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = b.dataset.vehShareFamily; await rcRun('ACTION.CORE.RECORD.SHARE', { id, expectedRevision: rev(id), family: b.checked }); });
            all('[data-veh-share-company]').forEach(b => b.onchange = async (e) => { e.stopPropagation(); const id = b.dataset.vehShareCompany; await rcRun('ACTION.CORE.RECORD.SHARE', { id, expectedRevision: rev(id), company: b.checked }); });
            all('[data-veh-history]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = b.dataset.vehHistory; ui.expanded = ui.expanded === id ? '' : id; await render(); });
            all('[data-veh-archive]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); const id = b.dataset.vehArchive; if (!confirm('Archivovat vozidlo? Data i historie zůstanou v revizích Core.'))
                return; await run('ACTION.VEHICLES.VEHICLE.ARCHIVE', { id, expectedRevision: rev(id) }, 'Vozidlo archivováno'); });
        }
        await render();
    }
    KXVehicles.CONTRACT = CONTRACT;
    KXVehicles.OWNER = OWNER;
    KXVehicles.TYPE = TYPE;
    KXVehicles.PROVIDER_KIND = PROVIDER_KIND;
    KXVehicles.normalize = normalize;
    KXVehicles.dueItems = dueItems;
    KXVehicles.addMonths = addMonths;
    KXVehicles.VehiclesDomainService = VehiclesDomainService;
    KXVehicles.createProjectionAdapter = createProjectionAdapter;
    KXVehicles.install = install;
    KXVehicles.mountHub = mountHub;
})(KXVehicles || (KXVehicles = {}));
