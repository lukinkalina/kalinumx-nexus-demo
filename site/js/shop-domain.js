var KXShop;
(function () {
    const OWNER = 'APP.KX.SHOP', T_COMP = 'SHOP.COMPONENT', CONTRACT = 'KX.SHOP_DOMAIN/1';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (label, max = 80) => ({ kind: 'text', max, label });
    const E = (label, options, required = false) => ({ kind: 'enum', options, required, label, invalidMsg: `Neplatná hodnota: ${label}`, requiredMsg: `${label} je povinné` });
    const KIND = { OWN: 'Vlastní výroba', BOUGHT: 'Nakupované', MIXED: 'Kombinované', SERVICE: 'Služba' };
    const Products = KXHubKit.createScheduleDomain({
        contract: 'KX.SHOP_PRODUCT_DOMAIN/1', owner: OWNER, type: 'SHOP_PRODUCT.PRODUCT', schema: 'KX.SHOP_PRODUCT.PRODUCT/1', permission: 'SHOP_PRODUCT.PRODUCT.EDIT',
        label: 'Produkty', scopeTag: 'product', serviceKey: 'shopProducts', listKey: 'products', subjectIdKey: 'productId', subjectNameKey: 'productName',
        itemsKey: 'deadlines', itemPayloadKey: 'deadline', itemIdKey: 'deadlineId', itemIdPrefix: 'SHOP_PRODUCT.DL.', maxItems: 40, soonDays: 30, countLabel: 'produktů', revisionPrefix: 'SHOP_PRODUCT.DOMAIN/1:',
        subjectFields: { name: { kind: 'text', max: 120, required: true, label: 'Název', requiredMsg: 'Název je povinný' }, sku: T('Kód / SKU', 40), kind: E('Druh', KIND, true), price: T('Prodejní cena', 20), vatPct: T('DPH %', 6),
            description: T('Popis', 1000), files: T('Soubory a fotky (umístění)', 1000), note: T('Poznámka', 500) },
        itemKinds: { RESTOCK: 'Doplnit sklad', PRICE: 'Kontrola ceny', LAUNCH: 'Uvedení na trh', OTHER: 'Jiné' },
        history: { added: 'DEADLINE_ADDED', done: 'DEADLINE_DONE', removed: 'DEADLINE_REMOVED' },
        actions: { create: 'ACTION.SHOP_PRODUCT.PRODUCT.CREATE', update: 'ACTION.SHOP_PRODUCT.PRODUCT.UPDATE', addItem: 'ACTION.SHOP_PRODUCT.DEADLINE.ADD', completeItem: 'ACTION.SHOP_PRODUCT.DEADLINE.COMPLETE', removeItem: 'ACTION.SHOP_PRODUCT.DEADLINE.REMOVE', archive: 'ACTION.SHOP_PRODUCT.PRODUCT.ARCHIVE', list: 'ACTION.SHOP_PRODUCT.PRODUCT.LIST', overview: 'ACTION.SHOP_PRODUCT.DUE.OVERVIEW' },
        projection: { code: 'PERSONAL.SHOP_PRODUCT.N2', countField: 'alertsCount', nextField: 'nextDueAt' },
        msg: { invalidSubject: 'Neplatná data: produkt', unknownSubjectFields: 'Neznámá pole: produkt', invalidItem: 'Neplatný termín', unknownItemFields: 'Neznámá pole termínu', invalidItemKind: 'Neplatný typ termínu',
            itemDate: 'Termín musí být RRRR-MM-DD', itemInterval: 'Interval: 1–3650 dní', itemNeedsDue: 'Zadejte termín nebo interval', needSpace: 'Produkt musí patřit alespoň do jednoho prostoru',
            separateActions: 'Prostory a termíny upravujte samostatnými akcemi', tooMany: (n) => `Nejvýše ${n} termínů`, itemMissing: 'Termín neexistuje', badDoneDate: 'Neplatné datum provedení',
            nextAfterDone: 'Příští termín musí být po datu provedení', missingId: 'Chybí ID: produkt', notFound: (id) => `Produkt ${id} neexistuje`, needRev: 'Úprava vyžaduje expectedRevision', archived: 'Archivovaný záznam nelze upravovat' },
        ui: { prefix: 'shp', itemWord: 'dl', subjectForm: 'shpf', itemForm: 'shpd', countWord: 'produktů', addLabel: '＋ Produkt', saveLabel: 'Uložit', openItemLabel: '＋ Termín', addItemLabel: 'Přidat termín', itemPlaceholder: 'např. Doplnit sklad',
            noItems: 'Žádné termíny', empty: 'Zatím žádný produkt.', notInstalled: 'Doménová služba Produkty není nainstalovaná.', subtitle: (d) => `${KIND[d.kind] || d.kind || ''}${d.sku ? ` · ${d.sku}` : ''}${d.price ? ` · ${(() => { const x = Number(String(d.price).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? new Intl.NumberFormat('cs-CZ').format(x) + ' Kč' : String(d.price); })()}` : ''}${d.vatPct ? ` (DPH ${d.vatPct} %)` : ''}`,
            historyText: { CREATED: 'Založeno', UPDATED: 'Upraveno', DEADLINE_ADDED: 'Přidán termín', DEADLINE_DONE: 'Termín splněn', DEADLINE_REMOVED: 'Termín odebrán', ARCHIVED: 'Archivováno' },
            savedToast: 'Uloženo', itemAddedToast: 'Termín přidán', itemDoneToast: 'Termín zapsán', itemRemovedToast: 'Termín odebrán', archivedToast: 'Archivováno',
            confirmRemove: 'Odebrat termín? Záznam zůstane v historii revizí.', confirmArchive: 'Archivovat? Data i historie zůstanou v revizích Core.' }
    });
    const METHODS = ['LASER', 'PRINT3D', 'BOUGHT', 'MANUAL', 'OTHER'];
    const num = (v, def = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : def; };
    /* production calculation – product × quantity → per component and totals (per method, per machine) */
    function calc(components, quantity) {
        const q = Math.max(1, Math.floor(num(quantity, 1)));
        const rows = components.map((c) => {
            const d = c.data || c;
            const pieces = q * Math.max(1, num(d.qty, 1));
            const per = Math.max(1, Math.floor(num(d.perBatch, 1)));
            const batches = Math.ceil(pieces / per);
            const minutes = d.method === 'BOUGHT' ? 0 : batches * (num(d.minutesPerBatch) + num(d.setupMinutes));
            const material = pieces * num(d.materialPerPiece);
            const cost = d.method === 'BOUGHT' ? pieces * num(d.unitCost) : 0;
            return { id: c.id, name: d.name, method: d.method, machineId: d.machineId || null, accKind: d.accKind || null, objectDiameterMm: d.objectDiameterMm ?? null, fixtureMinutes: d.fixtureMinutes != null ? num(d.fixtureMinutes) : 0, cylinder: d.cylinder || null, laserMaterialId: d.laserMaterialId || null, materialConfirm: d.materialConfirm && d.materialConfirm.materialId === d.laserMaterialId ? d.materialConfirm : null, laserIds: Array.isArray(d.laserIds) ? d.laserIds : [], prepMinutes: d.prepMinutes != null ? num(d.prepMinutes) : null, pieces, batches, minutes: Math.round(minutes * 10) / 10, material: Math.round(material * 100) / 100, materialUnit: d.material || '', cost: Math.round(cost * 100) / 100, modelFile: d.modelFile || '', modelLocation: d.modelLocation || '' };
        });
        const byMethod = {}, byMachine = {};
        for (const r of rows) {
            byMethod[r.method] = (byMethod[r.method] || 0) + r.minutes;
            if (r.machineId)
                byMachine[r.machineId] = (byMachine[r.machineId] || 0) + r.minutes;
        }
        return { quantity: q, rows, minutesByMethod: byMethod, minutesByMachine: byMachine, totalMinutes: Math.round(rows.reduce((s, r) => s + r.minutes, 0) * 10) / 10, purchaseCost: Math.round(rows.reduce((s, r) => s + r.cost, 0) * 100) / 100 };
    }
    class ComponentService {
        core;
        constructor(core) { this.core = core; }
        async product(id, actorId, action) {
            const p = await this.core.entities.get(String(id || ''));
            if (!p || p.type !== 'SHOP_PRODUCT.PRODUCT' || p.archivedAt)
                throw new Error('SHOP_PRODUCT_NOT_FOUND');
            if (await this.core.access.can({ kind: 'ENTITY', id: p.id, ownerApp: p.ownerApp, spaceIds: p.spaceIds || [] }, actorId, action) !== true)
                throw new Error(`Scope denied: ${action} required`);
            return p;
        }
        async list(productId, actorId) { const p = await this.product(productId, actorId, 'READ'); return (await this.core.entities.list()).filter((r) => r.type === T_COMP && r.data?.productId === p.id && !r.archivedAt).sort((a, b) => String(a.data.name).localeCompare(String(b.data.name), 'cs')); }
        async save(input, ctx) {
            const p = await this.product(input?.productId, ctx.actorId, 'EDIT');
            const name = String(input?.name || '').trim().slice(0, 120);
            if (!name)
                throw new Error('SHOP_COMPONENT_NAME_REQUIRED');
            const method = String(input?.method || '');
            if (!METHODS.includes(method))
                throw new Error('SHOP_COMPONENT_METHOD_INVALID');
            const d = { productId: p.id, name, method };
            for (const k of ['modelFile', 'modelLocation', 'modelVersion', 'material', 'note', 'linkedProjectId', 'machineId'])
                if (input?.[k])
                    d[k] = String(input[k]).slice(0, k === 'modelLocation' || k === 'note' ? 500 : 160);
            /* N2.4i: accessory needed (rotary kind / slide), object diameter, cylinder correction (galvo only, no rotary), clamping time per batch */
            if (input?.accKind !== undefined) {
                const k = String(input.accKind || '');
                if (k && !['CHUCK', 'RING', 'ROLLER', 'LP_ROTARY', 'SLIDE', 'CONVEYOR'].includes(k))
                    throw new Error('SHOP_COMPONENT_ACC_KIND');
                if (k)
                    d.accKind = k;
                else
                    delete d.accKind;
            }
            for (const k of ['objectDiameterMm', 'fixtureMinutes']) {
                if (input?.[k] === undefined)
                    continue;
                const v = input[k];
                if (v === '' || v === null) {
                    delete d[k];
                    continue;
                }
                const n = Number(String(v).replace(',', '.'));
                if (!(Number.isFinite(n) && n >= 0 && n <= 10000))
                    throw new Error('SHOP_COMPONENT_NUMBER');
                d[k] = n;
            }
            if (input?.cylinder !== undefined) {
                const c = input.cylinder;
                if (!c || c === '') {
                    delete d.cylinder;
                }
                else {
                    if (d.accKind && d.accKind !== 'SLIDE' && d.accKind !== 'CONVEYOR')
                        throw new Error('SHOP_COMPONENT_CYL_WITH_ROTARY');
                    const conv = c.shape === 'CONCAVE' ? 'CONCAVE' : 'CONVEX';
                    const ax = c.axis === 'Y' ? 'Y' : 'X';
                    d.cylinder = { shape: conv, axis: ax };
                }
            }
            /* N2.4h: material from the laser material library + confirmation (reason) – a forbidden material is counted only after it */
            if (input?.laserMaterialId !== undefined) {
                const id = String(input.laserMaterialId || '');
                if (id) {
                    const m = this.core.laserDomain ? await this.core.laserDomain.get(id, 'APP.LASER.MATERIAL') : null;
                    if (!m)
                        throw new Error('SHOP_COMPONENT_MATERIAL_NOT_FOUND');
                    d.laserMaterialId = id;
                }
            }
            if (input?.materialConfirm !== undefined) {
                const c = input.materialConfirm;
                if (c === null || c === '') { /* cleared */ }
                else {
                    const reason = String(c?.reason || '').trim();
                    if (reason.length < 3)
                        throw new Error('SHOP_MATERIAL_CONFIRM_REASON_REQUIRED');
                    d.materialConfirm = { reason: reason.slice(0, 300), at: new Date().toISOString(), by: ctx.actorId, materialId: d.laserMaterialId || String(input.laserMaterialId || '') };
                }
            }
            /* N2.4d: lasers that can make this component (core laser domain machines) */ if (input?.laserIds !== undefined) {
                if (!Array.isArray(input.laserIds) || input.laserIds.length > 20)
                    throw new Error('SHOP_COMPONENT_LASERS_INVALID');
                const ids = [...new Set(input.laserIds.map((x) => String(x)))];
                for (const id of ids) {
                    const m = this.core.laserDomain ? await this.core.laserDomain.get(id, 'APP.LASER.MACHINE') : null;
                    if (!m)
                        throw new Error('SHOP_COMPONENT_LASER_NOT_FOUND');
                }
                if (ids.length)
                    d.laserIds = ids;
            }
            for (const k of ['qty', 'perBatch', 'minutesPerBatch', 'setupMinutes', 'materialPerPiece', 'unitCost', 'prepMinutes']) {
                if (input?.[k] === undefined || input[k] === '')
                    continue;
                const n = num(input[k], NaN);
                if (!Number.isFinite(n) || n < 0)
                    throw new Error('SHOP_COMPONENT_NUMBER_INVALID');
                d[k] = n;
            }
            if (input?.id) {
                const old = await this.core.entities.get(String(input.id));
                if (!old || old.type !== T_COMP || old.data?.productId !== p.id)
                    throw new Error('SHOP_COMPONENT_NOT_FOUND');
                return this.core.entities.save({ id: old.id, type: T_COMP, ownerApp: OWNER, schema: CONTRACT, spaceIds: p.spaceIds, expectedRevision: input.expectedRevision ?? old.revision, data: d }, ctx);
            }
            return this.core.entities.save({ type: T_COMP, ownerApp: OWNER, schema: CONTRACT, spaceIds: p.spaceIds, data: d }, ctx);
        }
        async archive(input, ctx) {
            const c = await this.core.entities.get(String(input?.id || ''));
            if (!c || c.type !== T_COMP)
                throw new Error('SHOP_COMPONENT_NOT_FOUND');
            await this.product(c.data.productId, ctx.actorId, 'EDIT');
            return this.core.entities.save({ id: c.id, type: T_COMP, ownerApp: OWNER, schema: CONTRACT, spaceIds: c.spaceIds, expectedRevision: c.revision, data: c.data, archivedAt: new Date().toISOString() }, ctx);
        }
        async calc(input, actorId) { return calc(await this.list(input?.productId, actorId), input?.quantity); }
    }
    function installComponents(core) {
        if (core.shopComponents)
            return core.shopComponents;
        const svc = new ComponentService(core);
        const defs = [['ACTION.SHOP.COMPONENT.LIST', 'READ', (p, c) => svc.list(p?.productId, c.actorId)], ['ACTION.SHOP.COMPONENT.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.SHOP.COMPONENT.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c)], ['ACTION.SHOP.PRODUCTION.CALC', 'READ', (p, c) => svc.calc(p, c.actorId)]];
        for (const [code, risk, h] of defs)
            core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
        core.shopComponents = svc;
        return svc;
    }
    /* ---------- N2.3n (R72 V2): ORDERS – product × quantity × due date → machine load vs capacity, material vs 3D-printing stock, tasks ---------- */
    const T_ORDER = 'SHOP.ORDER', ORDER_STATUS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
    const CAP_KEYS = { LASER: 'production.capacity.laserHours', PRINT3D: 'production.capacity.print3dHours', MANUAL: 'production.capacity.manualHours', OTHER: 'production.capacity.manualHours' };
    const CAP_DEF = { LASER: 8, PRINT3D: 16, MANUAL: 8, OTHER: 8 };
    function workDays(fromIso, toIso, weekends) { const a = new Date(fromIso + 'T12:00:00Z'), b = new Date(toIso + 'T12:00:00Z'); let n = 0; for (let d = new Date(a); d <= b; d = new Date(d.getTime() + 86400000)) {
        const w = d.getUTCDay();
        if (weekends || (w !== 0 && w !== 6))
            n++;
    } return Math.max(1, n); }
    /* N2.4d: laser planning – each LASER operation goes to one machine of the core laser domain. Capacity = capacity h/day × available days
       (state, outages – the same rule as the LASER hub), weekends per setting; overnight runs outside the day capacity only where the machine allows it. */
    function laserAvailable(d, day) { const f = globalThis.KXLaserHub?.availableOn; if (f)
        return f(d, day); if (!d || (d.status && d.status !== 'ACTIVE'))
        return false; if (!(Number(d.capacityHoursPerDay) > 0))
        return false; return !(d.outages || []).some((o) => day >= o.from && day <= o.to); }
    function laserCapacityMinutes(d, fromIso, toIso, weekends) { let m = 0; const a = new Date(fromIso + 'T12:00:00Z'), b = new Date(toIso + 'T12:00:00Z'); for (let x = new Date(a); x <= b; x = new Date(x.getTime() + 86400000)) {
        const w = x.getUTCDay();
        if (!weekends && (w === 0 || w === 6))
            continue;
        const day = x.toISOString().slice(0, 10);
        if (laserAvailable(d, day))
            m += Number(d.capacityHoursPerDay) * 60;
    } return m; }
    /* orders (sorted by due date) × their LASER rows → assignments; least loaded eligible machine unless the order assigns one manually */
    function planLasers(orders, machines, today, weekends, mats = {}, srcs = () => []) {
        const load = {};
        const out = {};
        const warn = [];
        /* N2.4h: material of the operation – forbidden without confirmation is not counted; caution without confirmation warns; machines whose sources are NOT suitable are skipped */
        const matOf = (r) => r.laserMaterialId ? mats[r.laserMaterialId] : null;
        const compatOn = (m, mat) => { const c = mat?.data?.compat; if (!c)
            return 'UNKNOWN'; const v = srcs(m.id).map((w) => c[w]).filter(Boolean); return !v.length ? 'UNKNOWN' : v.includes('OK') ? 'OK' : v.includes('PREP') ? 'PREP' : 'NO'; };
        const cap = (m, due) => laserCapacityMinutes(m.data, today, due < today ? today : due, weekends);
        for (const o of orders) {
            const rows = o.rows.filter((r) => r.method === 'LASER');
            out[o.id] = [];
            for (const r of rows) {
                const night = !!(o.overnight || {})[r.id];
                const mat = matOf(r);
                const conf = !!r.materialConfirm;
                if (mat && mat.data.status === 'FORBIDDEN' && !conf) {
                    warn.push({ kind: 'MATERIAL_FORBIDDEN', orderId: o.id, componentId: r.id, material: mat.data.name });
                    out[o.id].push({ componentId: r.id, name: r.name, machineId: null, minutes: r.minutes, material: mat.data.name, notCounted: true });
                    continue;
                }
                if (mat && mat.data.status === 'CAUTION' && !conf)
                    warn.push({ kind: 'MATERIAL_CAUTION', orderId: o.id, componentId: r.id, material: mat.data.name });
                let elig = machines.filter((m) => (!r.laserIds.length || r.laserIds.includes(m.id)) && (!(o.laserIds || []).length || o.laserIds.includes(m.id)) && cap(m, o.dueDate) > 0);
                /* N2.4i: accessory needed – only machines with an ENABLED and WORKING accessory of that kind, object within its range; cylinder correction – galvo only */
                let acc = null;
                if (r.accKind) {
                    const fits = (a) => a.kind === r.accKind && a.enabled !== false && a.state !== 'FAULT' && (r.objectDiameterMm == null || ((a.maxObjectMm == null || r.objectDiameterMm <= a.maxObjectMm) && (!(a.jaws || []).length || (a.jaws || []).some((j) => r.objectDiameterMm >= j.minMm && r.objectDiameterMm <= j.maxMm))));
                    const withAcc = elig.filter((m) => (m.data.accessories || []).some(fits));
                    if (!withAcc.length) {
                        const off = machines.flatMap((m) => (m.data.accessories || []).filter((a) => a.kind === r.accKind && (a.enabled === false || a.state === 'FAULT')).map((a) => `${m.data.name}: ${a.name} (${a.enabled === false ? 'OFF' : 'FAULT'})`));
                        warn.push({ kind: 'ACCESSORY_NONE', orderId: o.id, componentId: r.id, accKind: r.accKind, objectDiameterMm: r.objectDiameterMm, unavailable: off });
                        out[o.id].push({ componentId: r.id, name: r.name, machineId: null, minutes: r.minutes, notCounted: true });
                        continue;
                    }
                    elig = withAcc;
                    r.__fits = fits;
                }
                if (r.cylinder) {
                    const g = elig.filter((m) => (m.data.technologyCodes || []).includes('GALVO'));
                    if (!g.length) {
                        warn.push({ kind: 'CYL_NO_GALVO', orderId: o.id, componentId: r.id });
                        out[o.id].push({ componentId: r.id, name: r.name, machineId: null, minutes: r.minutes, notCounted: true });
                        continue;
                    }
                    elig = g;
                }
                if (mat) {
                    const ok = elig.filter((m) => compatOn(m, mat) !== 'NO');
                    if (ok.length < elig.length) {
                        const sug = machines.filter((m) => compatOn(m, mat) === 'OK').map((m) => m.data.name);
                        warn.push({ kind: 'MATERIAL_LASER_UNSUITABLE', orderId: o.id, componentId: r.id, material: mat.data.name, skipped: elig.filter((m) => !ok.includes(m)).map((m) => m.data.name), suggest: sug });
                    }
                    elig = ok;
                }
                const manual = (o.assign || {})[r.id];
                let chosen = manual && elig.find((m) => m.id === manual);
                if (manual && !chosen)
                    warn.push({ kind: 'MANUAL_NOT_AVAILABLE', orderId: o.id, componentId: r.id, machineId: manual });
                if (!chosen && elig.length)
                    chosen = elig.slice().sort((a, b) => ((load[a.id] || 0) / cap(a, o.dueDate)) - ((load[b.id] || 0) / cap(b, o.dueDate)))[0];
                if (!chosen) {
                    warn.push({ kind: 'NO_LASER', orderId: o.id, componentId: r.id });
                    out[o.id].push({ componentId: r.id, name: r.name, machineId: null, minutes: r.minutes });
                    continue;
                }
                const d = chosen.data;
                const prep = r.prepMinutes != null ? r.prepMinutes : num(d.prepMinutesDefault, 0);
                const finish = num(d.finishMinutesDefault, 0);
                acc = r.__fits ? (d.accessories || []).find(r.__fits) : null;
                const fixture = num(r.fixtureMinutes, 0) * (r.batches || 1);
                const nightOk = night && d.allowOvernight === true;
                if (night && !nightOk)
                    warn.push({ kind: 'NIGHT_NOT_ALLOWED', orderId: o.id, componentId: r.id, machineId: chosen.id });
                const blocking = (nightOk ? 0 : r.minutes) + (d.prepBlocksMachine === false ? 0 : prep) + fixture;
                load[chosen.id] = (load[chosen.id] || 0) + blocking;
                out[o.id].push({ componentId: r.id, name: r.name, machineId: chosen.id, machineName: d.name, minutes: r.minutes, prep, finish, night: nightOk, fixture, accessory: acc ? { id: acc.id, name: acc.name } : null, cylinder: r.cylinder || null, blockingMinutes: Math.round(blocking * 10) / 10, auto: !manual });
            }
        }
        const maxDue = orders.reduce((m, o) => o.dueDate > m ? o.dueDate : m, today);
        const util = machines.map((m) => { const c = cap(m, maxDue); const mi = Math.round((load[m.id] || 0) * 10) / 10; return { machineId: m.id, name: m.data.name, minutes: mi, capacityMinutes: c, pct: c > 0 ? Math.round(mi / c * 1000) / 10 : null, counted: c > 0 }; });
        for (const u of util)
            if (u.pct != null && u.pct > 100)
                warn.push({ kind: 'OVERLOAD', machineId: u.machineId, pct: u.pct });
        return { assignments: out, utilisation: util, warnings: warn };
    }
    class OrderService {
        core;
        comps;
        constructor(core, comps) { this.core = core; this.comps = comps; }
        /* N2.4d: one plan for all open orders (needed for utilisation across orders) */
        async laserPlanAll(actorId, today) {
            const machines = this.core.laserDomain ? (await this.core.laserDomain.list('APP.LASER.MACHINE')).filter((m) => !m.archivedAt) : [];
            const weekends = (await this.setting('production.capacity.weekends', actorId, false)) === true;
            const orders = [];
            for (const o of await this.list(actorId)) {
                if (!['OPEN', 'IN_PROGRESS'].includes(o.data.status || 'OPEN'))
                    continue;
                let comps = [];
                try {
                    comps = await this.comps.list(o.data.productId, actorId);
                }
                catch {
                    continue;
                }
                orders.push({ id: o.id, dueDate: o.data.dueDate, laserIds: o.data.laserIds || [], assign: o.data.laserAssign || {}, overnight: o.data.laserNight || {}, rows: calc(comps, o.data.quantity).rows });
            }
            const mats = {};
            const srcMap = {};
            try {
                for (const m of (await this.core.laserDomain.list('APP.LASER.MATERIAL')))
                    mats[m.id] = m;
                for (const x of (await this.core.laserDomain.list('APP.LASER.SOURCE_MODULE')))
                    if (!x.archivedAt)
                        (srcMap[x.data.machineId] = srcMap[x.data.machineId] || []).push(String(x.data.wavelengthNm));
            }
            catch { }
            return planLasers(orders, machines, today, weekends, mats, (id) => srcMap[id] || []);
        }
        async setting(key, actorId, fb) { try {
            const x = await this.core.settingsDefaults?.explain(this.core.settings, key, [{ scopeType: 'CENTRAL', scopeId: 'GLOBAL' }, { scopeType: 'APP', scopeId: OWNER }, { scopeType: 'USER', scopeId: actorId }]);
            return x && x.effectiveValue !== undefined && x.effectiveValue !== null ? x.effectiveValue : fb;
        }
        catch {
            return fb;
        } }
        async canRow(r, actorId, action) { return await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, action) === true; }
        async list(actorId) { const out = []; for (const r of (await this.core.entities.list()).filter((x) => x.type === T_ORDER && !x.archivedAt))
            if (await this.canRow(r, actorId, 'READ'))
                out.push(r); return out.sort((a, b) => String(a.data.dueDate).localeCompare(String(b.data.dueDate))); }
        async save(input, ctx) {
            const p = await this.core.entities.get(String(input?.productId || ''));
            if (!p || p.type !== 'SHOP_PRODUCT.PRODUCT' || p.archivedAt)
                throw new Error('SHOP_PRODUCT_NOT_FOUND');
            if (!await this.canRow(p, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            const q = Math.floor(num(input?.quantity, 0));
            if (!(q >= 1 && q <= 100000))
                throw new Error('SHOP_ORDER_QUANTITY_INVALID');
            const due = String(input?.dueDate || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(due))
                throw new Error('SHOP_ORDER_DUE_INVALID');
            const status = input?.status ? String(input.status) : 'OPEN';
            if (!ORDER_STATUS.includes(status))
                throw new Error('SHOP_ORDER_STATUS_INVALID');
            const d = { productId: p.id, productName: p.data?.name || '', name: String(input?.name || p.data?.name || '').slice(0, 120), quantity: q, dueDate: due, status, note: String(input?.note || '').slice(0, 500) };
            /* N2.4d: lasers included in the order, manual assignment of a LASER operation to a machine, overnight per operation (default off) */
            if (input?.laserIds !== undefined) {
                if (!Array.isArray(input.laserIds) || input.laserIds.length > 20)
                    throw new Error('SHOP_ORDER_LASERS_INVALID');
                d.laserIds = [...new Set(input.laserIds.map((x) => String(x)))];
            }
            for (const [k, kind] of [['laserAssign', 'STR'], ['laserNight', 'BOOL']]) {
                const v = input?.[k];
                if (v === undefined)
                    continue;
                if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 200)
                    throw new Error('SHOP_ORDER_LASERS_INVALID');
                const o = {};
                for (const [ck, cv] of Object.entries(v)) {
                    if (kind === 'BOOL') {
                        if (cv === true)
                            o[String(ck)] = true;
                    }
                    else if (cv)
                        o[String(ck)] = String(cv).slice(0, 120);
                }
                d[k] = o;
            }
            for (const id of [...(d.laserIds || []), ...Object.values(d.laserAssign || {})]) {
                const m = this.core.laserDomain ? await this.core.laserDomain.get(id, 'APP.LASER.MACHINE') : null;
                if (!m)
                    throw new Error('SHOP_ORDER_LASER_NOT_FOUND');
            }
            if (input?.id) {
                const old = await this.core.entities.get(String(input.id));
                if (!old || old.type !== T_ORDER)
                    throw new Error('SHOP_ORDER_NOT_FOUND');
                if (!await this.canRow(old, ctx.actorId, 'EDIT'))
                    throw new Error('Scope denied: EDIT required');
                return this.core.entities.save({ id: old.id, type: T_ORDER, ownerApp: OWNER, schema: CONTRACT, spaceIds: old.spaceIds, expectedRevision: input.expectedRevision ?? old.revision, data: { ... /* N2.4g: an edit keeps what the request does not change – task bindings and the laser choices (they used to be dropped) */Object.fromEntries(['laserIds', 'laserAssign', 'laserNight', 'taskMeta'].filter(k => d[k] === undefined && old.data?.[k] !== undefined).map(k => [k, old.data[k]])), ...d, taskIds: old.data?.taskIds || [] } }, ctx);
            }
            const sp = Array.isArray(input?.spaceIds) && input.spaceIds.length ? input.spaceIds : p.spaceIds;
            return this.core.entities.save({ type: T_ORDER, ownerApp: OWNER, schema: CONTRACT, spaceIds: sp, data: { ...d, taskIds: [] } }, ctx);
        }
        async plan(input, actorId) {
            const o = await this.core.entities.get(String(input?.orderId || ''));
            if (!o || o.type !== T_ORDER)
                throw new Error('SHOP_ORDER_NOT_FOUND');
            if (!await this.canRow(o, actorId, 'READ'))
                throw new Error('Scope denied: READ required');
            const comps = await this.comps.list(o.data.productId, actorId);
            const c = calc(comps, o.data.quantity);
            const today = String(input?.today || new Date().toISOString().slice(0, 10));
            const weekends = (await this.setting('production.capacity.weekends', actorId, false)) === true;
            const days = o.data.dueDate < today ? 1 : workDays(today, o.data.dueDate, weekends);
            const load = [];
            for (const [method, min] of Object.entries(c.minutesByMethod)) {
                if (!(min > 0))
                    continue;
                const h = Number(await this.setting(CAP_KEYS[method] || CAP_KEYS.OTHER, actorId, CAP_DEF[method] || 8)) || 8;
                const cap = days * h * 60;
                load.push({ key: method, kind: 'METHOD', minutes: min, capacityMinutes: cap, pct: Math.round(min / cap * 1000) / 10 });
            }
            for (const [mid, min] of Object.entries(c.minutesByMachine)) {
                const h = Number(await this.setting(CAP_KEYS.PRINT3D, actorId, 16)) || 16;
                const cap = days * h * 60;
                const m = await this.core.entities.get(mid);
                load.push({ key: mid, kind: 'MACHINE', name: m?.data?.name || mid, minutes: min, capacityMinutes: cap, pct: Math.round(min / cap * 1000) / 10 });
            }
            /* material vs 3D-printing stock: components printed in a material whose code matches a filament (PLA, PETG, …) */
            const spools = this.core.print3dFilaments ? await this.core.print3dFilaments.list(actorId) : [];
            const need = {};
            for (const r of c.rows) {
                if (r.method !== 'PRINT3D' || !r.material)
                    continue;
                const code = String(r.materialUnit || '').trim().toUpperCase().split(/\s+/)[0];
                if (!code)
                    continue;
                need[code] = (need[code] || 0) + r.material;
            }
            const material = Object.entries(need).map(([code, g]) => { const have = spools.filter((s) => String(s.data?.material || '').toUpperCase() === code).reduce((s, x) => s + num(x.data?.remainingG, 0), 0); return { material: code, needG: Math.round(g), haveG: Math.round(have), missingG: Math.max(0, Math.round(g - have)) }; });
            let done = 0;
            const ids = o.data.taskIds || [];
            for (const id of ids) {
                const t = await this.core.tasks.get(id);
                if (t?.status === 'DONE')
                    done++;
            }
            const lp = await this.laserPlanAll(actorId, today);
            const lasers = { assignments: lp.assignments[o.id] || [], utilisation: lp.utilisation, warnings: lp.warnings.filter((w) => !w.orderId || w.orderId === o.id) };
            return { orderId: o.id, quantity: o.data.quantity, dueDate: o.data.dueDate, days, calc: c, load, lasers, overloaded: load.filter(x => x.pct > 100), material, shortages: material.filter(x => x.missingG > 0), tasks: { total: ids.length, done } };
        }
        /* N2.4g: the order's tasks keep their binding – each task carries its source (order + operation) and the order remembers per task
           the laser, its name and the minutes, so a renamed laser, a moved operation or a changed time is detected (stale) and „Aktualizovat úkoly“
           updates the existing tasks (title, due) keeping their status; missing tasks are added */
        async taskDraft(o, ctx) {
            const comps = await this.comps.list(o.data.productId, ctx.actorId);
            const c = calc(comps, o.data.quantity);
            const label = o.data.name || o.data.productName;
            const MN = { LASER: TL('shop.method.LASER', 'Laser'), PRINT3D: TL('shop.method.PRINT3D', '3D print'), MANUAL: TL('shop.method.MANUAL', 'Manual'), OTHER: TL('shop.method.OTHER', 'Other'), BOUGHT: TL('shop.method.BOUGHT', 'Buy') };
            let lasersOf = [];
            try {
                lasersOf = (await this.laserPlanAll(ctx.actorId, new Date().toISOString().slice(0, 10))).assignments[o.id] || [];
            }
            catch { }
            return c.rows.map((r) => {
                const la = r.method === 'LASER' ? lasersOf.find((x) => x.componentId === r.id) : null;
                const minutes = Math.round(r.minutes + (la?.prep || 0));
                const title = la?.machineId ? `${MN.LASER} (${la.machineName}): ${r.name} – ${r.batches}× (${minutes} min${la.prep ? ` ${TL('shop.inclPrep', 'incl. preparation')} ${la.prep}` : ''}${la.night ? ' · ' + TL('shop.night', 'overnight') : ''}) – ${label}` : r.method === 'BOUGHT' ? `${MN.BOUGHT}: ${r.name} × ${r.pieces} – ${label}` : `${MN[r.method] || r.method}: ${r.name} – ${r.batches}× (${Math.round(r.minutes)} min) – ${label}`;
                return { componentId: r.id, method: r.method, title: title.slice(0, 200), description: r.modelFile ? `${r.modelLocation ? r.modelLocation + ' / ' : ''}${r.modelFile}` : '', ownerApp: r.method === 'BOUGHT' ? 'APP.KX.FOOD' : OWNER, itemKind: r.method === 'BOUGHT' ? 'SHOPPING_ITEM' : undefined,
                    meta: { componentId: r.id, machineId: la?.machineId || null, machineName: la?.machineName || null, minutes: la?.machineId ? minutes : Math.round(r.minutes) } };
            });
        }
        async tasks(input, ctx) {
            const o = await this.core.entities.get(String(input?.orderId || ''));
            if (!o || o.type !== T_ORDER)
                throw new Error('SHOP_ORDER_NOT_FOUND');
            if (!await this.canRow(o, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            if ((o.data.taskIds || []).length)
                throw new Error('SHOP_ORDER_TASKS_EXIST');
            const draft = await this.taskDraft(o, ctx);
            const ids = [];
            const meta = {};
            for (const d of draft) {
                const t = await this.core.tasks.save({ title: d.title, description: d.description, dueAt: o.data.dueDate + 'T15:00:00.000Z', ownerApp: d.ownerApp /* the shopping list belongs to the Food & shopping hub */, spaceIds: o.spaceIds, itemKind: d.itemKind, sourceApp: OWNER, sourceEntityType: 'SHOP.ORDER.OPERATION', sourceEntityId: `${o.id}#${d.componentId}` }, ctx);
                ids.push(t.id);
                meta[t.id] = d.meta;
            }
            await this.core.entities.save({ id: o.id, type: T_ORDER, ownerApp: OWNER, schema: CONTRACT, spaceIds: o.spaceIds, expectedRevision: o.revision, data: { ...o.data, taskIds: ids, taskMeta: meta, status: o.data.status === 'OPEN' ? 'IN_PROGRESS' : o.data.status } }, ctx);
            return { created: ids.length, taskIds: ids };
        }
        /* which tasks no longer match the plan (laser moved / renamed, time changed, operation added) – older orders without taskMeta are matched by order of creation */
        async taskStale(o, ctx) {
            if (!(o.data.taskIds || []).length)
                return [];
            const draft = await this.taskDraft(o, ctx);
            const meta = o.data.taskMeta || {};
            const out = [];
            const byComp = {};
            (o.data.taskIds || []).forEach((tid, i) => { const m = meta[tid] || (draft[i] ? { componentId: draft[i].componentId, legacy: true } : null); if (m)
                byComp[m.componentId] = { tid, m }; });
            for (const d of draft) {
                const cur = byComp[d.componentId];
                if (!cur) {
                    out.push({ componentId: d.componentId, reason: 'MISSING' });
                    continue;
                }
                const m = cur.m;
                if (m.legacy)
                    out.push({ componentId: d.componentId, taskId: cur.tid, reason: 'NO_BINDING' });
                else if ((m.machineId || null) !== (d.meta.machineId || null))
                    out.push({ componentId: d.componentId, taskId: cur.tid, reason: 'LASER_MOVED', from: m.machineName, to: d.meta.machineName });
                else if ((m.machineName || null) !== (d.meta.machineName || null))
                    out.push({ componentId: d.componentId, taskId: cur.tid, reason: 'LASER_RENAMED', from: m.machineName, to: d.meta.machineName });
                else if (Number(m.minutes) !== Number(d.meta.minutes))
                    out.push({ componentId: d.componentId, taskId: cur.tid, reason: 'TIME_CHANGED', from: m.minutes, to: d.meta.minutes });
            }
            return out;
        }
        async tasksSync(input, ctx) {
            const o = await this.core.entities.get(String(input?.orderId || ''));
            if (!o || o.type !== T_ORDER)
                throw new Error('SHOP_ORDER_NOT_FOUND');
            if (!await this.canRow(o, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            if (!(o.data.taskIds || []).length)
                return this.tasks(input, ctx);
            const draft = await this.taskDraft(o, ctx);
            const meta = { ...(o.data.taskMeta || {}) };
            const ids = [...o.data.taskIds];
            const byComp = {};
            ids.forEach((tid, i) => { const m = meta[tid] || (draft[i] ? { componentId: draft[i].componentId } : null); if (m)
                byComp[m.componentId] = tid; });
            let updated = 0, created = 0;
            for (const d of draft) {
                const tid = byComp[d.componentId];
                if (tid) {
                    const t = (await this.core.tasks.list()).find((x) => x.id === tid);
                    if (t) {
                        await this.core.tasks.save({ id: t.id, title: d.title, description: d.description || t.description, dueAt: o.data.dueDate + 'T15:00:00.000Z', ownerApp: t.ownerApp, spaceIds: t.spaceIds, itemKind: t.itemKind, status: t.status, sourceApp: OWNER, sourceEntityType: 'SHOP.ORDER.OPERATION', sourceEntityId: `${o.id}#${d.componentId}`, expectedRevision: t.revision }, ctx);
                        meta[tid] = d.meta;
                        updated++;
                        continue;
                    }
                }
                const t = await this.core.tasks.save({ title: d.title, description: d.description, dueAt: o.data.dueDate + 'T15:00:00.000Z', ownerApp: d.ownerApp, spaceIds: o.spaceIds, itemKind: d.itemKind, sourceApp: OWNER, sourceEntityType: 'SHOP.ORDER.OPERATION', sourceEntityId: `${o.id}#${d.componentId}` }, ctx);
                ids.push(t.id);
                meta[t.id] = d.meta;
                created++;
            }
            await this.core.entities.save({ id: o.id, type: T_ORDER, ownerApp: OWNER, schema: CONTRACT, spaceIds: o.spaceIds, expectedRevision: o.revision, data: { ...o.data, taskIds: ids, taskMeta: meta } }, ctx);
            return { updated, created, taskIds: ids };
        }
        async archive(input, ctx) {
            const o = await this.core.entities.get(String(input?.id || ''));
            if (!o || o.type !== T_ORDER)
                throw new Error('SHOP_ORDER_NOT_FOUND');
            if (!await this.canRow(o, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            return this.core.entities.save({ id: o.id, type: T_ORDER, ownerApp: OWNER, schema: CONTRACT, spaceIds: o.spaceIds, expectedRevision: o.revision, data: o.data, archivedAt: new Date().toISOString() }, ctx);
        }
    }
    function installOrders(core, comps) {
        if (core.shopOrders)
            return core.shopOrders;
        const svc = new OrderService(core, comps);
        for (const [code, risk, h] of [['ACTION.SHOP.ORDER.LIST', 'READ', (_p, c) => svc.list(c.actorId)], ['ACTION.SHOP.ORDER.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.SHOP.ORDER.PLAN', 'READ', (p, c) => svc.plan(p, c.actorId)], ['ACTION.SHOP.ORDER.TASKS', 'SAFE_WRITE', (p, c) => svc.tasks(p, c)], ['ACTION.SHOP.ORDER.TASKS_SYNC', 'SAFE_WRITE', (p, c) => svc.tasksSync(p, c)], ['ACTION.SHOP.ORDER.TASKS_STALE', 'READ', async (p, c) => { const o = await core.entities.get(String(p?.orderId || '')); return o ? svc.taskStale(o, c) : []; }], ['ACTION.SHOP.ORDER.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c)]])
            core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
        /* R68: an order that overloads a machine or lacks material shows up in Hlášky (owner = SHOP, with a fix button) */
        if (core.issues?.registerCheck)
            core.issues.registerCheck({ id: 'SHOP.ORDER.PLAN', owner: OWNER, title: TL('shop.check', 'Orders: capacity and material'), run: async (a) => {
                    const out = [];
                    const today = new Date().toISOString().slice(0, 10);
                    for (const o of await svc.list(a)) {
                        if (!['OPEN', 'IN_PROGRESS'].includes(o.data.status) || o.data.dueDate < today)
                            continue;
                        let p;
                        try {
                            p = await svc.plan({ orderId: o.id }, a);
                        }
                        catch {
                            continue;
                        }
                        for (const l of p.overloaded)
                            out.push({ fingerprint: `SHOP.ORDER.LOAD:${o.id}:${l.key}`, severity: l.pct > 150 ? 'ERROR' : 'WARN', title: `${TL('shop.overload', 'Order overloads')} ${l.name || TL('shop.method.' + l.key, l.key)} (${l.pct} %)`, detail: `${o.data.name} · ${o.data.quantity} ks · ${o.data.dueDate}`, fix: [{ kind: 'OPEN_RECORD', label: TL('issues.openSource', 'Open'), target: { kind: 'APP', id: OWNER } }] });
                        for (const s of p.shortages)
                            out.push({ fingerprint: `SHOP.ORDER.MATERIAL:${o.id}:${s.material}`, severity: 'WARN', title: `${TL('shop.shortage', 'Material missing')}: ${s.material} ${s.missingG} g`, detail: `${o.data.name} · ${TL('shop.need', 'need')} ${s.needG} g, ${TL('shop.have', 'in stock')} ${s.haveG} g`, fix: [{ kind: 'OPEN_RECORD', label: TL('issues.openSource', 'Open'), target: { kind: 'APP', id: OWNER } }] });
                    }
                    /* N2.4g: order tasks out of date (laser moved / renamed, time changed, operation added, no binding) */
                    try {
                        for (const o of await svc.list(a)) {
                            if (!['OPEN', 'IN_PROGRESS'].includes(o.data.status || 'OPEN') || !(o.data.taskIds || []).length)
                                continue;
                            const st = await svc.taskStale(o, { actorId: a });
                            if (!st.length)
                                continue;
                            out.push({ fingerprint: `SHOP.ORDER.TASKS_STALE:${o.id}`, severity: 'WARN', title: `${TL('shop.tasksStale', 'Order tasks are out of date')}: ${o.data.name || o.data.productName}`, detail: st.map((x) => TL('shop.stale.' + x.reason, x.reason) + (x.from != null || x.to != null ? ` (${x.from ?? '—'} → ${x.to ?? '—'})` : '')).join('; '), fix: [{ kind: 'OPEN_RECORD', label: TL('issues.openSource', 'Open'), target: { kind: 'APP', id: OWNER } }] });
                        }
                    }
                    catch { }
                    /* N2.4d: lasers across all open orders – overload of a machine, operation without a suitable laser, overnight where the machine does not allow it */
                    try {
                        const lp = await svc.laserPlanAll(a, today);
                        const nm = (id) => (lp.utilisation.find((u) => u.machineId === id)?.name) || id;
                        const fixL = [{ kind: 'OPEN_RECORD', label: TL('issues.openSource', 'Open'), target: { kind: 'APP', id: 'APP.KX.LASER' } }], fixS = [{ kind: 'OPEN_RECORD', label: TL('issues.openSource', 'Open'), target: { kind: 'APP', id: OWNER } }];
                        for (const w of lp.warnings) {
                            if (w.kind === 'OVERLOAD')
                                out.push({ fingerprint: `SHOP.LASER.OVERLOAD:${w.machineId}`, severity: w.pct > 150 ? 'ERROR' : 'WARN', title: `${TL('shop.laserOverload', 'Laser overloaded')}: ${nm(w.machineId)} (${w.pct} %)`, detail: TL('shop.laserOverloadHint', 'Move an operation to another laser in the order, extend the capacity or the due date.'), fix: fixL });
                            else if (w.kind === 'NO_LASER')
                                out.push({ fingerprint: `SHOP.LASER.NONE:${w.orderId}:${w.componentId}`, severity: 'ERROR', title: TL('shop.noLaser', 'A laser operation has no suitable available laser'), detail: TL('shop.noLaserHint', 'Not counted until a laser is available.'), fix: fixS });
                            else if (w.kind === 'NIGHT_NOT_ALLOWED')
                                out.push({ fingerprint: `SHOP.LASER.NIGHT:${w.orderId}:${w.componentId}`, severity: 'WARN', title: `${TL('shop.nightNotAllowed', 'Overnight is not allowed on')} ${nm(w.machineId)}`, detail: TL('shop.nightNotAllowedHint', 'Counted in the day capacity.'), fix: fixL });
                            else if (w.kind === 'ACCESSORY_NONE')
                                out.push({ fingerprint: `SHOP.ACC.NONE:${w.orderId}:${w.componentId}`, severity: 'ERROR', title: `${TL('shop.accNone', 'No laser with a usable accessory')}: ${TL('laser.acc.kind.' + w.accKind, w.accKind)}${w.objectDiameterMm != null ? ` Ø ${w.objectDiameterMm} mm` : ''}`, detail: (w.unavailable || []).length ? `${TL('shop.accUnavailable', 'Unavailable')}: ${(w.unavailable || []).join(' · ')}` : TL('shop.accNoneHint', 'Not counted – add / turn on the accessory at the laser or check the object diameter.'), fix: fixL });
                            else if (w.kind === 'CYL_NO_GALVO')
                                out.push({ fingerprint: `SHOP.CYL.NOGALVO:${w.orderId}:${w.componentId}`, severity: 'ERROR', title: TL('shop.cylNoGalvo', 'Cylinder correction needs a galvo laser'), detail: TL('shop.cylNoGalvoHint', 'Not counted – include a galvo laser (MOPA) in the component / order, or use a rotary.'), fix: fixL });
                            else if (w.kind === 'MATERIAL_FORBIDDEN')
                                out.push({ fingerprint: `SHOP.MATERIAL.FORBIDDEN:${w.orderId}:${w.componentId}`, severity: 'ERROR', title: `${TL('shop.matForbidden', 'Forbidden material – not counted')}: ${w.material}`, detail: TL('shop.matForbiddenHint', 'Confirm with a reason at the component, or change the material.'), fix: fixS });
                            else if (w.kind === 'MATERIAL_CAUTION')
                                out.push({ fingerprint: `SHOP.MATERIAL.CAUTION:${w.orderId}:${w.componentId}`, severity: 'WARN', title: `${TL('shop.matCaution', 'Material needs confirmation')}: ${w.material}`, detail: TL('shop.matCautionHint', 'Read „Why?“ at the component and confirm.'), fix: fixS });
                            else if (w.kind === 'MATERIAL_LASER_UNSUITABLE')
                                out.push({ fingerprint: `SHOP.MATERIAL.LASER:${w.orderId}:${w.componentId}`, severity: 'WARN', title: `${TL('shop.matLaser', 'Material not suitable for')} ${(w.skipped || []).join(', ')}: ${w.material}`, detail: `${TL('shop.matLaserSuggest', 'Suitable lasers')}: ${(w.suggest || []).join(', ') || '—'}`, fix: fixL });
                            else if (w.kind === 'MANUAL_NOT_AVAILABLE')
                                out.push({ fingerprint: `SHOP.LASER.MANUAL:${w.orderId}:${w.componentId}`, severity: 'WARN', title: `${TL('shop.manualLaserUnavailable', 'The chosen laser is not available')}: ${nm(w.machineId)}`, detail: TL('shop.manualLaserUnavailableHint', 'Planned on another suitable laser.'), fix: fixS });
                        }
                    }
                    catch { }
                    return out;
                } });
        core.shopOrders = svc;
        return svc;
    }
    KXShop = { OWNER, METHODS, calc, workDays, CALCULATORS: [{ id: 'shop.bom', tab: 'BOM', box: '', tags: ['production', 'time', 'material'] }, { id: 'shop.orders', tab: 'ORDERS', box: '', tags: ['production', 'capacity'] }], TABS: [['PRODUCTS', TL('shop.tabProducts', 'Products')], ['BOM', TL('shop.tabBom', 'Bill of materials')], ['ORDERS', TL('shop.tabOrders', 'Orders')]], parts: { Products },
        install(core, personal, opt = {}) { const r = Products.install(core, personal, opt); const comps = installComponents(core); installOrders(core, comps); return r; },
        async mountHub(root, core, opts) {
            const st = root.__shop || (root.__shop = { tab: 'PRODUCTS', productId: '', qty: 1 });
            const req = globalThis.KXHubTabRequest?.[OWNER];
            if (req && ['PRODUCTS', 'BOM', 'ORDERS'].includes(req)) {
                st.tab = req;
                delete globalThis.KXHubTabRequest[OWNER];
            }
            root.innerHTML = `<div data-shop-hub><div class="kx-print3d-tabs"><button class="chip ${st.tab === 'PRODUCTS' ? 'active' : ''}" data-shop-tab="PRODUCTS">${esc(TL('shop.tabProducts', 'Products'))}</button><button class="chip ${st.tab === 'BOM' ? 'active' : ''}" data-shop-tab="BOM">${esc(TL('shop.tabBom', 'Bill of materials'))}</button><button class="chip ${st.tab === 'ORDERS' ? 'active' : ''}" data-shop-tab="ORDERS">${esc(TL('shop.tabOrders', 'Orders'))}</button><button class="icon-btn" data-kx-manual="HUB:APP.KX.SHOP§${st.tab === 'BOM' ? 'kusovnik' : st.tab === 'ORDERS' ? 'zakazky' : 'produkty'}" title="📖">📖</button></div><div data-shop-body></div></div>`;
            root.querySelectorAll('[data-shop-tab]').forEach((b) => b.onclick = () => { st.tab = b.dataset.shopTab; void KXShop.mountHub(root, core, opts); });
            const body = root.querySelector('[data-shop-body]');
            if (st.tab === 'PRODUCTS') {
                const host = document.createElement('div');
                body.appendChild(host);
                await Products.mountHub(host, core, opts);
                return;
            }
            if (st.tab === 'ORDERS') {
                await mountOrders(body, core, opts, st, () => void KXShop.mountHub(root, core, opts));
                return;
            }
            await mountBom(body, core, opts, st, () => void KXShop.mountHub(root, core, opts));
        } };
    async function mountOrders(body, core, opts, st, again) {
        const C = { actorId: opts.actorId, appCode: OWNER, permissions: ['CORE.TASK.EDIT'], confirmed: true };
        let products = [];
        try {
            products = await core.shopProducts.list(opts.actorId);
        }
        catch { }
        let orders = [];
        try {
            orders = await core.actions.invoke('ACTION.SHOP.ORDER.LIST', {}, C);
        }
        catch { }
        if (opts.filter)
            orders = orders.filter(opts.filter);
        const staleOf = {};
        for (const o of orders) {
            if ((o.data.taskIds || []).length) {
                try {
                    staleOf[o.id] = await core.actions.invoke('ACTION.SHOP.ORDER.TASKS_STALE', { orderId: o.id }, C);
                }
                catch { }
            }
        }
        let lasersAll = [];
        try {
            lasersAll = core.laserDomain ? (await core.laserDomain.list('APP.LASER.MACHINE')).filter((x) => !x.archivedAt) : [];
        }
        catch { }
        const plans = {};
        for (const o of orders) {
            try {
                plans[o.id] = await core.actions.invoke('ACTION.SHOP.ORDER.PLAN', { orderId: o.id }, C);
            }
            catch { }
        }
        const fmtMin = (m) => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
        const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        body.innerHTML = `<div data-shop-orders><details data-shop-order-new ${orders.length ? '' : 'open'}><summary>＋ ${esc(TL('shop.newOrder', 'Order'))}</summary><div class="kx-calc-grid">
        <label class="kx-calc-f">${esc(TL('shop.product', 'Product'))}*<select data-so="productId">${products.map((p) => `<option value="${esc(p.id)}">${esc(p.data?.name)}</option>`).join('')}</select></label>
        <label class="kx-calc-f">${esc(TL('shop.quantity', 'Quantity'))}*<input data-so="quantity" value="10" inputmode="numeric"></label><label class="kx-calc-f">${esc(TL('shop.due', 'Due date'))}*<input type="date" data-so="dueDate" value="${due}"></label>
        <label class="kx-calc-f">${esc(TL('shop.orderName', 'Name / customer'))}<input data-so="name"></label></div><button class="btn" data-shop-order-save ${products.length ? '' : 'disabled'}>${esc(TL('shop.save', 'Save'))}</button></details>
      ${orders.length ? orders.map((o) => {
            const p = plans[o.id];
            return `<article class="veh-card" data-shop-order="${esc(o.id)}"><header><b>${esc(o.data.name)}</b><small>${esc(o.data.quantity)} ${esc(TL('shop.pcs', 'pcs'))} · ${esc(TL('shop.dueLabel', 'due'))} ${esc(new Date(o.data.dueDate + 'T12:00:00').toLocaleDateString('cs-CZ'))} · ${esc(TL('shop.status.' + o.data.status, o.data.status))}${p ? ` · ${esc(TL('shop.daysLeft', 'working days to the due date'))}: ${p.days}` : ''}</small>
          <button class="btn ghost compact" data-kx-propagate-source="ENTITY" data-kx-propagate-id="${esc(o.id)}" title="↗">↗</button><button class="btn ghost compact" data-item-menu="${esc(JSON.stringify({ kind: 'HUB_RECORD', id: o.id, ownerApp: OWNER, title: String(o.data.name || '').slice(0, 80) }))}" title="⋯">⋯</button></header>
        ${p ? `<div class="kx-load">${(p.lasers?.utilisation || []).filter((u) => u.minutes > 0).map((u) => `<div class="kx-load-row ${u.pct > 100 ? 'over' : ''}" data-shop-laser-load="${esc(u.machineId)}"><span>🔦 ${esc(u.name)}</span><span class="kx-load-bar"><i style="width:${Math.min(100, u.pct || 0)}%"></i></span><b>${u.pct ?? '—'} %</b><small>${esc(TL('shop.planned', 'planned'))} ${fmtMin(u.minutes)} ${esc(TL('shop.ofCap', 'of'))} ${fmtMin(u.capacityMinutes)} ${esc(TL('shop.capAllOrders', 'capacity (all orders)'))}</small></div>`).join('')}${p.load.filter((l) => !(l.key === 'LASER' && (p.lasers?.assignments || []).length)).map((l) => `<div class="kx-load-row ${l.pct > 100 ? 'over' : ''}" data-shop-load="${esc(l.key)}"><span>${esc(l.name || TL('shop.method.' + l.key, l.key))}</span><span class="kx-load-bar"><i style="width:${Math.min(100, l.pct)}%"></i></span><b>${l.pct} %</b><small>${esc(TL('shop.planned', 'planned'))} ${fmtMin(l.minutes)} ${esc(TL('shop.ofCap', 'of'))} ${fmtMin(l.capacityMinutes)} ${esc(TL('shop.capToDue', 'capacity to the due date'))}</small></div>`).join('')}</div>
          ${p.material.map((m) => `<div class="kx-load-row ${m.missingG ? 'over' : ''}" data-shop-material="${esc(m.material)}"><span>${esc(m.material)}</span><small>${esc(TL('shop.need', 'need'))} ${m.needG} g · ${esc(TL('shop.have', 'in stock'))} ${m.haveG} g${m.missingG ? ` · <b>${esc(TL('shop.missing', 'missing'))} ${m.missingG} g</b>` : ''}</small></div>`).join('')}
          ${p.lasers && (p.lasers.assignments.length || p.lasers.warnings.length) ? `<section class="kx-olasers" data-shop-lasers="${esc(o.id)}"><h4>🔦 ${esc(TL('shop.lasers', 'Lasers'))}</h4>
             <div class="kx-olasers-inc">${esc(TL('shop.lasersIncluded', 'Included'))}: ${lasersAll.map((m) => `<label class="kx-chk"><input type="checkbox" data-so-inc="${esc(m.id)}" ${!(o.data.laserIds || []).length || (o.data.laserIds || []).includes(m.id) ? 'checked' : ''}> ${esc(m.data.name)}</label>`).join('')}</div>
             <table class="kx-calc-table"><tr><th>${esc(TL('shop.operation', 'Operation'))}</th><th>${esc(TL('shop.laser', 'Laser'))}</th><th>${esc(TL('shop.timeProd', 'Production time'))}</th><th>${esc(TL('shop.prep', 'Preparation'))}</th><th>${esc(TL('shop.night', 'overnight'))}</th></tr>
             ${p.lasers.assignments.map((a) => `<tr data-shop-laser-row="${esc(a.componentId)}" class="${a.machineId ? '' : 'kx-err'}"><td>${esc(a.name)}${a.accessory ? `<br><small data-shop-laser-acc>🔄 ${esc(a.accessory.name)}${a.fixture ? ` · ${esc(TL('shop.fixtureShort', 'clamping'))} ${fmtMin(a.fixture)}` : ''}</small>` : ''}${a.cylinder ? `<br><small data-shop-laser-cyl>◠ ${esc(TL('shop.cylShort', 'cylinder correction'))} ${esc(TL('shop.cyl.' + a.cylinder.shape + 'Short', a.cylinder.shape))} · ${esc(a.cylinder.axis)}</small>` : ''}</td><td><select data-so-assign="${esc(a.componentId)}"><option value="">${esc(TL('shop.auto', 'auto'))}${a.auto && a.machineName ? ` – ${esc(a.machineName)}` : ''}</option>${lasersAll.map((m) => `<option value="${esc(m.id)}" ${!a.auto && a.machineId === m.id ? 'selected' : ''}>${esc(m.data.name)}</option>`).join('')}</select></td><td>${fmtMin(a.minutes)}</td><td>${a.prep != null ? fmtMin(a.prep) : '—'}</td><td><input type="checkbox" data-so-night="${esc(a.componentId)}" ${(o.data.laserNight || {})[a.componentId] ? 'checked' : ''}>${a.night ? ' 🌙' : ''}</td></tr>`).join('')}</table>
             ${p.lasers.warnings.filter((w) => w.kind !== 'OVERLOAD').map((w) => `<div class="kx-tw-safety" data-shop-laser-warn="${esc(w.kind)}">⚠ ${esc(TL('shop.laserWarn.' + w.kind, w.kind))}</div>`).join('')}
             <button class="btn compact" data-shop-lasers-save="${esc(o.id)}">${esc(TL('shop.save', 'Save'))}</button></section>` : ''}${(staleOf[o.id] || []).length ? `<div class="kx-tw-safety" data-shop-tasks-stale="${esc(o.id)}">⚠ ${esc(TL('shop.tasksStale', 'Order tasks are out of date'))}: ${(staleOf[o.id] || []).map((x) => esc(TL('shop.stale.' + x.reason, x.reason)) + (x.from != null || x.to != null ? ` (${esc(String(x.from ?? '—'))} → ${esc(String(x.to ?? '—'))})` : '')).join('; ')} <button class="btn compact" data-shop-tasks-sync="${esc(o.id)}">↻ ${esc(TL('shop.tasksSync', 'Update tasks'))}</button></div>` : ''}<div class="kx-issue-actions">${p.tasks.total ? `<span class="chip" data-shop-tasks-progress>${esc(TL('shop.tasks', 'Tasks'))} ${p.tasks.done} / ${p.tasks.total}</span>` : `<button class="btn compact" data-shop-order-tasks="${esc(o.id)}">${esc(TL('shop.makeTasks', 'Create tasks'))}</button>`}</div>` : ''}</article>`;
        }).join('') : `<p class="muted" data-shop-orders-empty>${esc(TL('shop.noOrders', 'No orders yet.'))}</p>`}</div>`;
        body.querySelector('[data-shop-order-save]')?.addEventListener('click', async () => {
            const p = {};
            body.querySelectorAll('[data-so]').forEach((x) => { p[x.dataset.so] = x.value; });
            if (opts.defaultSpaceId)
                p.spaceIds = [opts.defaultSpaceId];
            try {
                await core.actions.invoke('ACTION.SHOP.ORDER.SAVE', p, C);
                opts.onToast?.(TL('shop.saved', 'Saved'));
                again();
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            }
        });
        body.querySelectorAll('[data-shop-tasks-sync]').forEach((b) => b.onclick = async () => { try {
            const r = await core.actions.invoke('ACTION.SHOP.ORDER.TASKS_SYNC', { orderId: b.dataset.shopTasksSync }, C);
            opts.onToast?.(`${TL('shop.tasksSynced', 'Tasks updated')}: ${r.updated}${r.created ? ` + ${r.created}` : ''}`);
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } again(); });
        body.querySelectorAll('[data-shop-lasers-save]').forEach((b) => b.onclick = async () => {
            const id = String(b.dataset.shopLasersSave);
            const o = orders.find((x) => x.id === id);
            if (!o)
                return;
            const sec = body.querySelector(`[data-shop-lasers="${CSS.escape(id)}"]`);
            const inc = Array.from(sec.querySelectorAll('[data-so-inc]'));
            const laserIds = inc.every(x => x.checked) ? [] : inc.filter(x => x.checked).map(x => String(x.dataset.soInc));
            const laserAssign = {};
            sec.querySelectorAll('[data-so-assign]').forEach(x => { if (x.value)
                laserAssign[String(x.dataset.soAssign)] = x.value; });
            const laserNight = {};
            sec.querySelectorAll('[data-so-night]').forEach(x => { if (x.checked)
                laserNight[String(x.dataset.soNight)] = true; });
            try {
                await core.actions.invoke('ACTION.SHOP.ORDER.SAVE', { id, productId: o.data.productId, quantity: o.data.quantity, dueDate: o.data.dueDate, name: o.data.name, status: o.data.status, note: o.data.note, laserIds, laserAssign, laserNight }, C);
                opts.onToast?.(TL('shop.saved', 'Saved'));
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            }
            again();
        });
        body.querySelectorAll('[data-shop-order-tasks]').forEach((b) => b.onclick = async () => { try {
            const r = await core.actions.invoke('ACTION.SHOP.ORDER.TASKS', { orderId: b.dataset.shopOrderTasks }, C);
            opts.onToast?.(`${TL('shop.tasksCreated', 'Tasks created')}: ${r.created}`);
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } again(); });
    }
    const M = (k) => TL('shop.method.' + k, k);
    async function mountBom(body, core, opts, st, again) {
        const C = { actorId: opts.actorId, appCode: OWNER, permissions: [], confirmed: true };
        let products = [];
        try {
            products = await core.shopProducts.list(opts.actorId);
        }
        catch { }
        if (opts.filter)
            products = products.filter(opts.filter);
        if (!products.length) {
            body.innerHTML = `<p class="muted" data-shop-bom-empty>${esc(TL('shop.noProducts', 'Add a product first.'))}</p>`;
            return;
        }
        if (!products.some((p) => p.id === st.productId))
            st.productId = products[0].id;
        let comps = [];
        try {
            comps = await core.actions.invoke('ACTION.SHOP.COMPONENT.LIST', { productId: st.productId }, C);
        }
        catch { }
        let lasersAll = [];
        let matsAll = [];
        let srcsAll = [];
        try {
            lasersAll = core.laserDomain ? (await core.laserDomain.list('APP.LASER.MACHINE')).filter((x) => !x.archivedAt) : [];
            matsAll = core.laserDomain ? (await core.laserDomain.list('APP.LASER.MATERIAL')).filter((x) => !x.archivedAt).sort((a, b) => String(a.data.group).localeCompare(String(b.data.group), 'cs') || String(a.data.name).localeCompare(String(b.data.name), 'cs')) : [];
            srcsAll = core.laserDomain ? (await core.laserDomain.list('APP.LASER.SOURCE_MODULE')).filter((x) => !x.archivedAt) : [];
        }
        catch { }
        let printers = [], projects = [];
        try {
            printers = await core.print3dPrinters?.list(opts.actorId) || [];
            projects = await core.print3dProjects?.list(opts.actorId) || [];
        }
        catch { }
        const r = calc(comps, st.qty);
        const nm = (id, list) => list.find((x) => x.id === id)?.data?.name || '';
        const fmtMin = (m) => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
        body.innerHTML = `<div data-shop-bom><label class="kx-calc-f">${esc(TL('shop.product', 'Product'))}<select data-shop-product>${products.map((p) => `<option value="${esc(p.id)}" ${p.id === st.productId ? 'selected' : ''}>${esc(p.data?.name || p.id)}</option>`).join('')}</select></label>
      <table class="kx-calc-table" data-shop-components><tr><th>${esc(TL('shop.component', 'Component'))}</th><th>${esc(TL('shop.methodLabel', 'How'))}</th><th>${esc(TL('shop.qty', 'Pcs / product'))}</th><th>${esc(TL('shop.model', 'Model file'))}</th><th>${esc(TL('shop.machine', 'Machine / project'))}</th><th>${esc(TL('shop.batch', 'Batch'))}</th><th></th></tr>
        ${comps.map((c) => {
            const d = c.data;
            return `<tr data-shop-comp="${esc(c.id)}"><td><b>${esc(d.name)}</b>${d.material ? `<br><small>${esc(d.material)}${d.materialPerPiece ? ` · ${esc(d.materialPerPiece)} / ks` : ''}</small>` : ''}</td><td>${esc(M(d.method))}</td><td>${esc(d.qty ?? 1)}</td>
          <td>${d.modelFile ? `<code data-shop-model>${esc(d.modelFile)}</code>${d.modelVersion ? ` <small>v${esc(d.modelVersion)}</small>` : ''}${d.modelLocation ? `<br><small>${esc(d.modelLocation)}</small> <button class="icon-btn" data-shop-copy="${esc(d.modelLocation.replace(/[\\/]*$/, '') + (/[\\\\]/.test(d.modelLocation) ? '\\\\' : '/') + d.modelFile)}" title="⧉">⧉</button>` : ''}` : '—'}</td>
          <td>${esc(nm(d.machineId, printers) || '')}${d.linkedProjectId ? `<br><small>${esc(nm(d.linkedProjectId, projects))}</small>` : ''}</td><td>${d.method === 'BOUGHT' ? esc(d.unitCost ?? '') + ' / ks' : `${esc(d.perBatch ?? 1)} ks · ${esc(d.minutesPerBatch ?? 0)} + ${esc(d.setupMinutes ?? 0)} min`}</td>
          <td><button class="icon-btn" data-shop-comp-del="${esc(c.id)}" title="🗑">🗑</button></td></tr>`;
        }).join('') || `<tr><td colspan="7" class="muted">${esc(TL('shop.noComponents', 'No components yet.'))}</td></tr>`}</table>
      <details data-shop-add><summary>＋ ${esc(TL('shop.addComponent', 'Component'))}</summary><div class="kx-calc-grid">
        <label class="kx-calc-f">${esc(TL('shop.component', 'Component'))}*<input data-sc="name"></label><label class="kx-calc-f">${esc(TL('shop.methodLabel', 'How'))}*<select data-sc="method">${KXShop.METHODS.map((m) => `<option value="${m}">${esc(M(m))}</option>`).join('')}</select></label>
        <label class="kx-calc-f">${esc(TL('shop.qty', 'Pcs / product'))}<input data-sc="qty" value="1" inputmode="decimal"></label><label class="kx-calc-f">${esc(TL('shop.modelFile', 'Model file (exact name)'))}<input data-sc="modelFile" placeholder="drzak_noze_v3.3mf"></label>
        <label class="kx-calc-f">${esc(TL('shop.modelLocation', 'Location (NAS / PC / URL)'))}<input data-sc="modelLocation" placeholder="\\\\NAS\\3D\\Kuchyne"></label><label class="kx-calc-f">${esc(TL('shop.modelVersion', 'Version'))}<input data-sc="modelVersion"></label>
        ${lasersAll.length ? `<fieldset class="kx-calc-f kx-sc-acc" data-sc-accbox><legend>${esc(TL('shop.accLegend', 'Holding / curved surface (LASER)'))}</legend>
          <label class="kx-calc-f">${esc(TL('shop.accKind', 'Accessory'))}<select data-sc="accKind"><option value="">${esc(TL('shop.accNoneOpt', 'none (flat)'))}</option>${['CHUCK', 'RING', 'ROLLER', 'LP_ROTARY', 'SLIDE', 'CONVEYOR'].map(k => `<option value="${k}">${esc(TL('laser.acc.kind.' + k, k))}</option>`).join('')}</select></label>
          <label class="kx-calc-f">${esc(TL('shop.objectDiameter', 'Object Ø (mm)'))}<input data-sc="objectDiameterMm" inputmode="decimal" title="${esc(TL('shop.objectDiameterHelp', 'Largest diameter of the object, measured exactly – the planner checks the jaws / max. object of the rotary.'))}"></label>
          <label class="kx-calc-f">${esc(TL('shop.fixtureMinutes', 'Clamping (min / batch)'))}<input data-sc="fixtureMinutes" inputmode="decimal" title="${esc(TL('shop.fixtureHelp', 'Time to clamp / align the object – the laser is blocked meanwhile.'))}"></label>
          <label class="kx-calc-f">${esc(TL('shop.cylinder', 'Cylinder correction (galvo, no rotary)'))}<select data-sc-cyl><option value="">—</option><option value="CONVEX">${esc(TL('shop.cyl.CONVEX', 'convex (outside of a cylinder – mug, thermos)'))}</option><option value="CONCAVE">${esc(TL('shop.cyl.CONCAVE', 'concave (inside – ring inside)'))}</option></select></label>
          <label class="kx-calc-f">${esc(TL('shop.cylAxis', 'Cylinder axis'))}<select data-sc-cylaxis><option value="X">X</option><option value="Y">Y</option></select></label>
          <small class="muted">${esc(TL('shop.accHelp', 'Only lasers with this accessory turned on and working get the operation. Cylinder correction (LightBurn) distorts the design so it lands undistorted on a cylinder – galvo only; focus below the top of the cylinder.'))}</small></fieldset>` : ''}${matsAll.length ? `<label class="kx-calc-f">${esc(TL('shop.laserMaterial', 'Material (laser library)'))}<select data-sc="laserMaterialId"><option value="">—</option>${[...new Set(matsAll.map((m) => m.data.group))].map((g) => `<optgroup label="${esc(g)}">${matsAll.filter((m) => m.data.group === g).map((m) => `<option value="${esc(m.id)}">${m.data.status === 'FORBIDDEN' ? '⛔ ' : m.data.status === 'CAUTION' ? '⚠ ' : ''}${esc(m.data.name)}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="kx-sc-matwarn" data-sc-matwarn></div>` : ''}${lasersAll.length ? `<fieldset class="kx-calc-f kx-sc-lasers" data-sc-lasers><legend>${esc(TL('shop.lasersForComp', 'Lasers that can make it (LASER)'))}</legend>${lasersAll.map((m) => `<label class="kx-chk"><input type="checkbox" data-sc-laser="${esc(m.id)}"> ${esc(m.data.name)}</label>`).join('')}</fieldset><label class="kx-calc-f">${esc(TL('shop.prepMinutes', 'Preparation (min)'))}<input data-sc="prepMinutes" inputmode="numeric" placeholder="${esc(TL('shop.prepFromMachine', 'from the laser'))}"></label>` : ''}<label class="kx-calc-f">${esc(TL('shop.printer', 'Printer'))}<select data-sc="machineId"><option value="">—</option>${printers.map((p) => `<option value="${esc(p.id)}">${esc(p.data?.name)}</option>`).join('')}</select></label>
        <label class="kx-calc-f">${esc(TL('shop.project', '3D project'))}<select data-sc="linkedProjectId"><option value="">—</option>${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.data?.name)}</option>`).join('')}</select></label>
        <label class="kx-calc-f">${esc(TL('shop.perBatch', 'Pieces per batch'))}<input data-sc="perBatch" value="1" inputmode="decimal"></label><label class="kx-calc-f">${esc(TL('shop.minutesPerBatch', 'Minutes per batch'))}<input data-sc="minutesPerBatch" inputmode="decimal"></label>
        <label class="kx-calc-f">${esc(TL('shop.setup', 'Setup (min)'))}<input data-sc="setupMinutes" inputmode="decimal"></label><label class="kx-calc-f">${esc(TL('shop.material', 'Material'))}<input data-sc="material" placeholder="PETG / překližka 3 mm"></label>
        <label class="kx-calc-f">${esc(TL('shop.materialPerPiece', 'Material per piece (g / m²)'))}<input data-sc="materialPerPiece" inputmode="decimal"></label><label class="kx-calc-f">${esc(TL('shop.unitCost', 'Purchase price / pc'))}<input data-sc="unitCost" inputmode="decimal"></label>
      </div><button class="btn" data-shop-comp-save>${esc(TL('shop.save', 'Save'))}</button></details>
      <section class="kx-calc" data-shop-calc><h3>${esc(TL('shop.calcTitle', 'Production calculation'))} <label class="kx-calc-f" style="display:inline-flex">${esc(TL('shop.quantity', 'Quantity'))}<input data-shop-qty value="${esc(st.qty)}" inputmode="decimal" style="width:80px"></label></h3>
        <table class="kx-calc-table">${r.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(M(x.method))}</td><td>${x.pieces} ks</td><td>${x.method === 'BOUGHT' ? esc(x.cost) : `${x.batches}× · ${fmtMin(x.minutes)}`}</td><td>${x.material ? `${x.material} ${esc(x.materialUnit)}` : ''}</td></tr>`).join('')}
        ${Object.entries(r.minutesByMethod).filter(([, m]) => m > 0).map(([k, m]) => `<tr class="kx-calc-best" data-shop-total="${esc(k)}"><td colspan="3">${esc(M(k))}</td><td colspan="2">${fmtMin(m)}</td></tr>`).join('')}
        <tr><td colspan="3">${esc(TL('shop.purchaseCost', 'Purchased parts'))}</td><td colspan="2" data-shop-purchase>${esc(r.purchaseCost)}</td></tr></table></section></div>`;
        body.querySelector('[data-shop-product]').onchange = (e) => { st.productId = e.target.value; again(); };
        const qi = body.querySelector('[data-shop-qty]');
        qi.onchange = () => { st.qty = Math.max(1, Math.floor(num(qi.value, 1))); again(); };
        body.querySelectorAll('[data-shop-copy]').forEach((b) => b.onclick = async () => { try {
            await navigator.clipboard.writeText(b.dataset.shopCopy);
            opts.onToast?.(TL('quick.copied', 'Copied'));
        }
        catch {
            prompt('', b.dataset.shopCopy);
        } });
        body.querySelectorAll('[data-shop-comp-del]').forEach((b) => b.onclick = async () => { if (!confirm(TL('quick.archive', 'Archive') + '?'))
            return; try {
            await core.actions.invoke('ACTION.SHOP.COMPONENT.ARCHIVE', { id: b.dataset.shopCompDel }, C);
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } again(); });
        /* N2.4h: material warning right under the field – state, hazard, ▸ Why?, what to do, compatibility with the ticked lasers, reason to confirm */
        const matSel = body.querySelector('[data-sc="laserMaterialId"]');
        const matBox = body.querySelector('[data-sc-matwarn]');
        const renderMat = () => {
            if (!matSel || !matBox)
                return;
            const m = matsAll.find((x) => x.id === matSel.value);
            if (!m) {
                matBox.innerHTML = '';
                return;
            }
            const LH = globalThis.KXLaserHub;
            const srcOf = (id) => srcsAll.filter((x) => x.data.machineId === id);
            const ticked = Array.from(body.querySelectorAll('[data-sc-laser]')).filter(x => x.checked).map(x => lasersAll.find((l) => l.id === x.dataset.scLaser)).filter(Boolean);
            const rows = (ticked.length ? ticked : lasersAll.filter((l) => l.data.origin !== 'DEMO')).map((l) => { const c = LH ? LH.checkMaterial(m, l, srcOf, lasersAll) : { compat: 'UNKNOWN', others: [] }; return `<li data-sc-matcompat="${esc(c.compat)}">${esc(l.data.name)}: <b>${esc(TL('laser.compat.' + c.compat, c.compat === 'UNKNOWN' ? TL('shop.compatUnknown', 'unknown – not in the library yet') : c.compat))}</b>${c.others?.length ? ` → ${esc(TL('shop.matLaserSuggest', 'Suitable lasers'))}: ${esc(c.others.map((o) => o.name).join(', '))}` : ''}</li>`; }).join('');
            const lvl = m.data.status === 'FORBIDDEN' ? 'err' : m.data.status === 'CAUTION' ? 'warn' : 'ok';
            matBox.innerHTML = `<div class="kx-matwarn kx-matwarn-${lvl}" data-sc-matlevel="${lvl}"><b>${lvl === 'err' ? '⛔' : lvl === 'warn' ? '⚠' : '✓'} ${esc(TL('laser.matStatus.' + m.data.status, m.data.status))}${m.data.hazardTitle ? ` – ${esc(m.data.hazardTitle)}` : ''}</b>${m.data.why ? `<details data-sc-matwhy><summary>▸ ${esc(TL('shop.why', 'Why?'))}</summary><p>${esc(m.data.why)}</p>${m.data.whatToDo ? `<p><b>${esc(TL('shop.whatToDo', 'What to do'))}:</b> ${esc(m.data.whatToDo)}</p>` : ''}<p class="muted">${esc(TL('laser.mat.source', 'Source'))}: ${esc(TL('laser.matSource.' + m.data.source, m.data.source))}${m.data.verified ? '' : ' · ' + esc(TL('shop.notVerified', 'not verified'))}</p></details>` : ''}<ul>${rows}</ul>${LH ? `<details data-sc-matgrid><summary>▦ ${esc(TL('laser.grid.title', 'Grid test'))}</summary>${(ticked.length ? ticked : lasersAll.filter((l) => l.data.origin !== 'DEMO')).map((l) => `<h5>${esc(l.data.name)}</h5>${LH.gridGuideHtml(LH.gridGuide(m, l, srcOf))}`).join('')}</details>` : ''}
         ${lvl !== 'ok' ? `<label class="kx-calc-f">${esc(lvl === 'err' ? TL('shop.confirmForbidden', 'I understand the risk – continue (reason, required)') : TL('shop.confirmCaution', 'Confirm (reason)'))}<input data-sc-matreason maxlength="300" placeholder="${esc(TL('shop.reasonPh', 'e.g. verified without chlorine per SDS'))}"></label>` : ''}</div>`;
        };
        if (matSel) {
            matSel.onchange = renderMat;
            body.querySelectorAll('[data-sc-laser]').forEach((x) => x.addEventListener('change', renderMat));
            renderMat();
        }
        body.querySelector('[data-shop-comp-save]').addEventListener('click', async () => {
            const p = { productId: st.productId };
            const rsn = body.querySelector('[data-sc-matreason]')?.value.trim();
            if (rsn)
                p.materialConfirm = { reason: rsn };
            const cyl = body.querySelector('[data-sc-cyl]')?.value;
            if (cyl)
                p.cylinder = { shape: cyl, axis: body.querySelector('[data-sc-cylaxis]').value };
            body.querySelectorAll('[data-sc]').forEach((x) => { p[x.dataset.sc] = x.value; });
            const lz = Array.from(body.querySelectorAll('[data-sc-laser]'));
            if (lz.length)
                p.laserIds = lz.filter(x => x.checked).map(x => String(x.dataset.scLaser));
            try {
                await core.actions.invoke('ACTION.SHOP.COMPONENT.SAVE', p, C);
                opts.onToast?.(TL('shop.saved', 'Saved'));
                again();
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            }
        });
    }
})();
