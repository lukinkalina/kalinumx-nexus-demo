var KXPrint3D;
(function () {
    const OWNER = 'APP.KX.PRINT3D';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (label, max = 80, extra = {}) => ({ kind: 'text', max, label, ...extra });
    const E = (label, options, required = false) => ({ kind: 'enum', options, required, label, invalidMsg: `Neplatná hodnota: ${label}`, requiredMsg: `${label} je povinné` });
    const D = (label) => ({ kind: 'date', label });
    const NAME = (label) => ({ kind: 'text', max: 120, required: true, label, requiredMsg: `${label} je povinné` });
    function part(o) {
        const S = o.subjectWord;
        return KXHubKit.createScheduleDomain({
            contract: `KX.${o.key}_DOMAIN/1`, owner: OWNER, type: `${o.key}.${o.typeSuffix}`, schema: `KX.${o.key}.${o.typeSuffix}/1`, permission: `${o.key}.${o.typeSuffix}.EDIT`,
            label: o.label, scopeTag: o.scopeTag, serviceKey: o.serviceKey, listKey: o.listKey, subjectIdKey: `${o.scopeTag}Id`, subjectNameKey: `${o.scopeTag}Name`,
            itemsKey: 'deadlines', itemPayloadKey: 'deadline', itemIdKey: 'deadlineId', itemIdPrefix: `${o.key}.DL.`, maxItems: 60, soonDays: 30, countLabel: o.countWord, revisionPrefix: `${o.key}.DOMAIN/1:`,
            subjectFields: o.fields, itemKinds: o.kinds, history: { added: 'DEADLINE_ADDED', done: 'DEADLINE_DONE', removed: 'DEADLINE_REMOVED' },
            actions: { create: `ACTION.${o.key}.${o.typeSuffix}.CREATE`, update: `ACTION.${o.key}.${o.typeSuffix}.UPDATE`, addItem: `ACTION.${o.key}.DEADLINE.ADD`, completeItem: `ACTION.${o.key}.DEADLINE.COMPLETE`, removeItem: `ACTION.${o.key}.DEADLINE.REMOVE`, archive: `ACTION.${o.key}.${o.typeSuffix}.ARCHIVE`, list: `ACTION.${o.key}.${o.typeSuffix}.LIST`, overview: `ACTION.${o.key}.DUE.OVERVIEW` },
            projection: { code: `PERSONAL.${o.key}.N2`, countField: 'alertsCount', nextField: 'nextDueAt' },
            msg: { invalidSubject: `Neplatná data: ${S}`, unknownSubjectFields: `Neznámá pole: ${S}`, invalidItem: 'Neplatný termín', unknownItemFields: 'Neznámá pole termínu', invalidItemKind: 'Neplatný typ termínu',
                itemDate: 'Termín musí být RRRR-MM-DD', itemInterval: 'Interval: 1–3650 dní', itemNeedsDue: 'Zadejte termín nebo interval', needSpace: `${o.subjectCap} musí patřit alespoň do jednoho prostoru`,
                separateActions: 'Prostory a termíny upravujte samostatnými akcemi', tooMany: (n) => `Nejvýše ${n} termínů`, itemMissing: 'Termín neexistuje', badDoneDate: 'Neplatné datum provedení',
                nextAfterDone: 'Příští termín musí být po datu provedení', missingId: `Chybí ID: ${S}`, notFound: (id) => `${o.subjectCap} ${id} neexistuje`, needRev: 'Úprava vyžaduje expectedRevision', archived: 'Archivovaný záznam nelze upravovat' },
            ui: { prefix: o.prefix, itemWord: 'dl', subjectForm: `${o.prefix}f`, itemForm: `${o.prefix}d`, countWord: o.countWord, addLabel: `＋ ${o.subjectCap}`, saveLabel: 'Uložit', openItemLabel: '＋ Termín', addItemLabel: 'Přidat termín', itemPlaceholder: o.placeholder,
                noItems: 'Žádné termíny', empty: o.empty, notInstalled: `Doménová služba ${o.label} není nainstalovaná.`, subtitle: o.subtitle,
                historyText: { CREATED: 'Založeno', UPDATED: 'Upraveno', DEADLINE_ADDED: 'Přidán termín', DEADLINE_DONE: 'Termín splněn', DEADLINE_REMOVED: 'Termín odebrán', ARCHIVED: 'Archivováno' },
                savedToast: 'Uloženo', itemAddedToast: 'Termín přidán', itemDoneToast: 'Termín zapsán', itemRemovedToast: 'Termín odebrán', archivedToast: 'Archivováno',
                confirmRemove: 'Odebrat termín? Záznam zůstane v historii revizí.', confirmArchive: 'Archivovat? Data i historie zůstanou v revizích Core.' }
        });
    }
    const KIND = { FDM: 'FDM / FFF', SLA: 'SLA', MSLA: 'MSLA', OTHER: 'Jiné' }, CHAMBER = { NONE: 'bez komory', PASSIVE: 'uzavřená (pasivní)', ACTIVE: 'aktivně vyhřívaná' };
    const MAT = Object.fromEntries((KXPrint3DRef?.MATERIALS || []).map((m) => [m.code, m.row[0]]));
    const STATUS = { IDEA: 'Nápad', READY: 'Připraveno', PRINTING: 'Tiskne se', DONE: 'Hotovo', ARCHIVE: 'Archiv' };
    const Printers = part({ key: 'PRINT3D_PRINTER', typeSuffix: 'PRINTER', label: '3D tiskárny', scopeTag: 'printer', serviceKey: 'print3dPrinters', listKey: 'printers', prefix: 'fpr', subjectWord: 'tiskárna', subjectCap: 'Tiskárna', countWord: 'tiskáren', placeholder: 'např. Promazání tyčí',
        empty: 'Zatím žádná tiskárna.', fields: { name: NAME('Název'), manufacturer: T('Výrobce'), model: T('Model'), kind: E('Typ', KIND, true), volume: T('Pracovní prostor', 60), chamber: E('Komora', CHAMBER), maxTemps: T('Max. teploty', 140),
            nozzles: T('Trysky', 200), plates: T('Podložky', 200), multimaterial: T('Multimateriál / AMS', 140), amsUnits: T('Počet AMS', 4), nozzleInstalled: T('Nainstalovaná tryska', 60), plateInstalled: T('Nainstalovaná podložka', 60), network: T('Síť', 140), filtration: T('Filtrace', 140), powerW: T('Příkon (W)', 10),
            purchasePrice: T('Pořizovací cena', 20), purchased: D('Datum nákupu'), lifetimeH: T('Životnost (h, amortizace)', 10), serial: T('Sériové číslo', 60), note: T('Poznámka', 500) },
        kinds: KXPrint3DRef?.MAINTENANCE || { OTHER: 'Jiné' }, subtitle: (d) => `${d.manufacturer || ''} ${d.model || ''}${d.chamber ? ` · ${CHAMBER[d.chamber] || ''}` : ''}`.trim() });
    const Filaments = part({ key: 'PRINT3D_FILAMENT', typeSuffix: 'SPOOL', label: 'Filamenty', scopeTag: 'spool', serviceKey: 'print3dFilaments', listKey: 'spools', prefix: 'ffl', subjectWord: 'cívka', subjectCap: 'Cívka', countWord: 'cívek', placeholder: 'např. Sušení',
        empty: 'Zatím žádná cívka.', fields: { name: NAME('Název / odstín'), material: E('Materiál', { ...MAT, OTHER: 'Jiný' }, true), brand: T('Značka'), color: T('Barva (hex)', 9), diameter: E('Průměr', { '1.75': '1,75 mm', '2.85': '2,85 mm' }),
            remainingG: T('Zbývá (g)', 8), slot: T('Slot AMS', 20), location: T('Umístění', 80), pricePerKg: T('Cena / kg', 20), opened: D('Otevřeno'), dried: D('Sušeno'), note: T('Poznámka', 500) },
        kinds: { DRY: 'Sušení', CHECK: 'Kontrola vlhkosti', REORDER: 'Doobjednat', OTHER: 'Jiné' }, subtitle: (d) => `${MAT[d.material] || d.material || ''}${d.brand ? ` · ${d.brand}` : ''}${d.remainingG ? ` · ${d.remainingG} g` : ''}` });
    const Projects = part({ key: 'PRINT3D_PROJECT', typeSuffix: 'PROJECT', label: '3D projekty', scopeTag: 'project', serviceKey: 'print3dProjects', listKey: 'projects', prefix: 'fpj', subjectWord: 'projekt', subjectCap: 'Projekt', countWord: 'projektů', placeholder: 'např. Tisk dílu A',
        empty: 'Zatím žádný projekt.', fields: { name: NAME('Název'), category: T('Kategorie', 60), status: E('Stav', STATUS, true), files: T('Umístění souborů (NAS / PC / web)', 1000), private: E('Soukromé', { NO: 'Ne', YES: 'Ano' }), source: T('Zdroj a licence', 300), tags: T('Štítky', 200), note: T('Poznámka', 1000) },
        kinds: { PRINT: 'Tisk', HANDOVER: 'Odevzdání', REVIEW: 'Kontrola', OTHER: 'Jiné' }, subtitle: (d) => `${STATUS[d.status] || d.status || ''}${d.category ? ` · ${d.category}` : ''}` });
    const PARTS = [Printers, Filaments, Projects];
    const table = (head, rows) => `<div class="kx-print3d-table"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    function materialsHtml(filter) {
        const R = KXPrint3DRef;
        let rows = R.MATERIALS;
        if (filter === 'OUT')
            rows = rows.filter((m) => m.outdoor);
        if (filter === 'AMS')
            rows = rows.filter((m) => m.ams);
        if (filter === 'ABR')
            rows = rows.filter((m) => m.abrasive);
        return `<div class="kx-print3d-filters">${[['ALL', TL('print3d.filterAll', 'All')], ['OUT', TL('print3d.filterOutdoor', 'Outdoor')], ['AMS', TL('print3d.filterAms', 'AMS')], ['ABR', TL('print3d.filterAbrasive', 'Abrasive')]].map(([k, l]) => `<button class="chip ${filter === k ? 'active' : ''}" data-print3d-mat-filter="${k}">${esc(l)}</button>`).join('')}</div>
      <p class="muted">${esc(TL('print3d.orientation', 'Orientation values – the spool data win.'))}</p>${table(R.MATERIAL_COLUMNS, rows.map((m) => m.row))}
      <p><b>${esc(TL('print3d.notSupported', 'Not for this printer'))}:</b> ${esc(R.NOT_SUPPORTED)}</p><p><b>${esc(TL('print3d.medical', 'Medical'))}:</b> ${esc(R.MEDICAL)}</p><p><b>${esc(TL('print3d.food', 'Food'))}:</b> ${esc(R.FOOD)}</p>
      <h3>${esc(TL('print3d.shore', 'Shore hardness'))}</h3>${table(['Shore', TL('print3d.example', 'Example'), TL('print3d.filament', 'Filament')], R.SHORE)}
      <h3>${esc(TL('print3d.howto', 'How to print'))}</h3>${table([TL('print3d.material', 'Material'), TL('print3d.plate', 'Plate'), TL('print3d.glue', 'Glue'), TL('print3d.chamber', 'Chamber / door'), TL('print3d.cooling', 'Cooling'), TL('print3d.tips', 'Tips')], R.HOWTO)}
      <h3>${esc(TL('print3d.nozzles', 'Nozzles'))}</h3>${table([TL('print3d.nozzle', 'Nozzle'), TL('print3d.goodFor', 'Good for'), TL('print3d.note', 'Note')], R.NOZZLES)}`;
    }
    function guidesHtml() {
        const R = KXPrint3DRef;
        return `<h3>${esc(TL('print3d.settings', 'Slicer settings'))}</h3>${table([TL('print3d.field', 'Field'), TL('print3d.where', 'Where'), TL('print3d.what', 'What it does'), TL('print3d.effect', 'Effect and why')], R.SETTINGS)}
      ${Object.entries(R.PRINTER_FEATURES || {}).map(([k, rows]) => `<h3 data-print3d-features="${esc(k)}">${esc(TL('print3d.features', 'Printer functions and options'))} · ${esc(k === 'BAMBU_X1E' ? 'Bambulab X1E' : k)}</h3>${table([TL('print3d.function', 'Function'), TL('print3d.where', 'Where'), TL('print3d.what', 'What it does'), TL('print3d.recommendation', 'Recommendation')], rows)}`).join('')}
      ${R.GUIDES.map((g) => `<h3 data-print3d-guide="${esc(g.code)}">${esc(g.title)}</h3><ul>${g.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join('')}
      <h3>${esc(TL('print3d.glossary', 'Abbreviations'))}</h3>${table([TL('print3d.abbr', 'Abbreviation'), TL('print3d.meaning', 'Meaning')], R.GLOSSARY)}
      <h3>${esc(TL('print3d.spareParts', 'Spare parts (default list)'))}</h3><ul>${R.SPARE_PARTS.PRINT3D.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
    }
    /* ---------- calculators (KXPrint3DCalc) – live, any field can be filled, the rest is computed ---------- */
    const CL = (k, fb) => TL('print3d.calc.' + k, fb);
    const fld = (id, label, v, extra = '') => `<label class="kx-calc-f">${esc(label)}<input data-calc="${id}" value="${esc(v ?? '')}" inputmode="decimal" ${extra}></label>`;
    const fmt = (n, d = 2) => Number.isFinite(Number(n)) && n !== null ? Number(n).toLocaleString(undefined, { maximumFractionDigits: d }) : '—';
    function mountCalc(body, st, printers) {
        const C = globalThis.KXPrint3DCalc;
        const R = KXPrint3DRef;
        st.calc = st.calc || { conv: { weightG: 1000, priceSpool: '', pricePerKg: '', pricePerM: '', lengthM: '', diameter: 1.75, material: 'PLA' }, offers: [{ name: 'A', spools: 1, spoolWeightG: 1000, pricePerSpool: '', shipping: 0 }, { name: 'B', spools: 4, spoolWeightG: 1000, pricePerSpool: '', shipping: 0 }],
            cost: { printerId: '', mainG: '', mainKg: '', supG: '', supKg: '', purgeG: '', hours: '', minutes: '', powerW: 350, printerPrice: '', lifetimeHours: 5000, laborMin: 0, quantity: 1, kWhPrice: 6, maintenancePerHour: 2, laborRate: 300, failurePct: 5, markupPct: 0, vatPct: 0, ...(st.calcDefaults || {}) }, rem: { grossG: '', tareG: 250, diameter: 1.75, material: 'PLA' } };
        const S = st.calc;
        const mats = Object.keys(C.DENSITY);
        const matSel = (id, v) => `<label class="kx-calc-f">${esc(CL('material', 'Material'))}<select data-calc="${id}">${mats.map(m => `<option ${m === v ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>`;
        body.innerHTML = `<div class="kx-calc" data-print3d-calc>
      <section data-calc-box="conv"><h3>${esc(CL('convTitle', 'Filament price – fill any two'))}</h3><div class="kx-calc-grid">${matSel('conv.material', S.conv.material)}${fld('conv.diameter', CL('diameter', 'Diameter (mm)'), S.conv.diameter)}${fld('conv.weightG', CL('weight', 'Filament on spool (g)'), S.conv.weightG)}${fld('conv.lengthM', CL('length', 'Length (m)'), S.conv.lengthM)}${fld('conv.priceSpool', CL('priceSpool', 'Price per spool'), S.conv.priceSpool)}${fld('conv.pricePerKg', CL('pricePerKg', 'Price per kg'), S.conv.pricePerKg)}${fld('conv.pricePerM', CL('pricePerM', 'Price per metre'), S.conv.pricePerM)}</div><small data-calc-out="conv"></small></section>
      <section data-calc-box="cmp"><h3>${esc(CL('cmpTitle', 'Purchase comparison'))}</h3><div data-calc-offers></div><button class="btn ghost compact" data-calc-add-offer>＋ ${esc(CL('addOffer', 'Offer'))}</button><div data-calc-out="cmp"></div></section>
      <section data-calc-box="cost"><h3>${esc(CL('costTitle', 'Print cost'))} <button class="btn ghost compact" data-kx-setting="print3d.calc.kWhPrice">⚙ ${esc(CL('defaults', 'Defaults in Settings'))}</button></h3><div class="kx-calc-grid"><label class="kx-calc-f">${esc(CL('printer', 'Printer'))}<select data-calc="cost.printerId"><option value="">—</option>${printers.map((p) => `<option value="${esc(p.id)}" ${S.cost.printerId === p.id ? 'selected' : ''}>${esc(p.data?.name || p.name || p.id)}</option>`).join('')}</select></label>
        ${fld('cost.mainG', CL('mainG', 'Model (g)'), S.cost.mainG)}${fld('cost.mainKg', CL('mainKg', 'Model price / kg'), S.cost.mainKg)}${fld('cost.supG', CL('supG', 'Supports – 2nd material (g)'), S.cost.supG)}${fld('cost.supKg', CL('supKg', 'Supports price / kg'), S.cost.supKg)}${fld('cost.purgeG', CL('purgeG', 'Purge / waste (g)'), S.cost.purgeG)}
        ${fld('cost.hours', CL('hours', 'Time (h)'), S.cost.hours)}${fld('cost.minutes', CL('minutes', '+ minutes'), S.cost.minutes)}${fld('cost.powerW', CL('powerW', 'Average power (W)'), S.cost.powerW)}${fld('cost.kWhPrice', CL('kWhPrice', 'Electricity / kWh'), S.cost.kWhPrice)}${fld('cost.printerPrice', CL('printerPrice', 'Printer price'), S.cost.printerPrice)}${fld('cost.lifetimeHours', CL('lifetime', 'Printer lifetime (h)'), S.cost.lifetimeHours)}
        ${fld('cost.maintenancePerHour', CL('maint', 'Maintenance / h'), S.cost.maintenancePerHour)}${fld('cost.laborMin', CL('laborMin', 'Work (min)'), S.cost.laborMin)}${fld('cost.laborRate', CL('laborRate', 'Work / h'), S.cost.laborRate)}${fld('cost.failurePct', CL('failure', 'Failure reserve %'), S.cost.failurePct)}${fld('cost.markupPct', CL('markup', 'Markup %'), S.cost.markupPct)}${fld('cost.vatPct', CL('vat', 'VAT %'), S.cost.vatPct)}${fld('cost.quantity', CL('qty', 'Pieces'), S.cost.quantity)}</div><div data-calc-out="cost"></div></section>
      <section data-calc-box="rem"><h3>${esc(CL('remTitle', 'What is left on a spool'))}</h3><div class="kx-calc-grid">${matSel('rem.material', S.rem.material)}${fld('rem.diameter', CL('diameter', 'Diameter (mm)'), S.rem.diameter)}${fld('rem.grossG', CL('gross', 'Spool on scale (g)'), S.rem.grossG)}${fld('rem.tareG', CL('tare', 'Empty spool (g)'), S.rem.tareG)}</div><div data-calc-out="rem"></div></section></div>`;
        const get = (path) => { const [a, b] = path.split('.'); return S[a][b]; };
        const set = (path, v) => { const [a, b] = path.split('.'); S[a][b] = v; };
        const put = (path, v) => { const i = body.querySelector(`[data-calc="${path}"]`); if (i && document.activeElement !== i)
            i.value = v === null || v === undefined || Number.isNaN(v) ? '' : String(v); };
        const runConv = (edited) => {
            const c = S.conv;
            const r = C.convert({ ...c, density: C.DENSITY[c.material], edited });
            for (const k of ['weightG', 'lengthM', 'priceSpool', 'pricePerKg', 'pricePerM'])
                if (k !== edited) {
                    c[k] = Number.isNaN(r[k]) ? c[k] : r[k];
                    put('conv.' + k, c[k]);
                }
            body.querySelector('[data-calc-out="conv"]').textContent = `${CL('gpm', 'g / m')}: ${fmt(r.gramsPerMetre, 3)} · ${fmt(r.lengthM)} m · ${fmt(r.pricePerKg)} / kg · ${fmt(r.pricePerM, 3)} / m · ${fmt(r.priceSpool)} / ${CL('spool', 'spool')}`;
        };
        const drawOffers = () => {
            body.querySelector('[data-calc-offers]').innerHTML = S.offers.map((o, i) => `<div class="kx-calc-offer" data-calc-offer="${i}"><div class="kx-calc-grid">${['name', 'spools', 'spoolWeightG', 'pricePerSpool', 'priceTotal', 'shipping'].map(k => `<label class="kx-calc-f">${esc(CL('o_' + k, k))}<input data-offer-k="${k}" value="${esc(o[k] ?? '')}" ${k === 'name' ? '' : 'inputmode="decimal"'}></label>`).join('')}</div><button class="icon-btn" data-calc-del-offer="${i}" title="×">×</button></div>`).join('');
            body.querySelectorAll('[data-calc-offer] input').forEach((inp) => inp.oninput = () => { const i = Number(inp.closest('[data-calc-offer]').dataset.calcOffer); S.offers[i][inp.dataset.offerK] = inp.value; runCmp(); });
            body.querySelectorAll('[data-calc-del-offer]').forEach((b) => b.onclick = () => { S.offers.splice(Number(b.dataset.calcDelOffer), 1); drawOffers(); runCmp(); });
        };
        const runCmp = () => { const r = C.compare(S.offers); body.querySelector('[data-calc-out="cmp"]').innerHTML = `<table class="kx-calc-table"><tr><th>#</th><th>${esc(CL('o_name', 'name'))}</th><th>kg</th><th>${esc(CL('total', 'Total'))}</th><th>/ kg</th><th>/ ${esc(CL('spool', 'spool'))}</th><th>%</th></tr>${r.rows.map((x) => `<tr class="${x.rank === 1 ? 'kx-calc-best' : ''}" data-calc-rank="${x.rank ?? ''}"><td>${x.rank ?? '—'}</td><td>${esc(x.name)}</td><td>${fmt(x.kg, 3)}</td><td>${fmt(x.total)}</td><td>${fmt(x.perKg)}</td><td>${fmt(x.perSpool)}</td><td>${x.overBestPct === null ? '—' : x.overBestPct === 0 ? '✓' : '+' + fmt(x.overBestPct)}</td></tr>`).join('')}</table>`; };
        const runCost = () => {
            const c = S.cost;
            const r = C.printCost({ materials: [{ grams: c.mainG, pricePerKg: c.mainKg, role: 'MAIN' }, { grams: c.supG, pricePerKg: c.supKg || c.mainKg, role: 'SUPPORT' }, { grams: c.purgeG, pricePerKg: c.mainKg, role: 'PURGE' }], hours: (Number(c.hours) || 0) + (Number(c.minutes) || 0) / 60, powerW: c.powerW, kWhPrice: c.kWhPrice, printerPrice: c.printerPrice, lifetimeHours: c.lifetimeHours, maintenancePerHour: c.maintenancePerHour, laborMin: c.laborMin, laborRate: c.laborRate, failurePct: c.failurePct, markupPct: c.markupPct, vatPct: c.vatPct, quantity: c.quantity });
            const rows = [[CL('rMaterial', 'Material'), r.material], [CL('rEnergy', 'Energy'), r.energy], [CL('rAmort', 'Amortisation'), r.amortisation], [CL('rMaint', 'Maintenance'), r.maintenance], [CL('rLabor', 'Work'), r.labor], [CL('rFailure', 'Failure reserve'), r.failure], [CL('rSubtotal', 'Subtotal'), r.subtotal], [CL('rMarkup', 'Markup'), r.markup], [CL('rVat', 'VAT'), r.vat]];
            body.querySelector('[data-calc-out="cost"]').innerHTML = `<table class="kx-calc-table">${rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${fmt(v)}</td></tr>`).join('')}<tr class="kx-calc-best"><td><b>${esc(CL('rTotal', 'Total'))}</b></td><td data-calc-total><b>${fmt(r.total)}</b></td></tr><tr><td>${esc(CL('rPiece', 'Per piece'))}</td><td data-calc-piece>${fmt(r.perPiece)}</td></tr><tr><td>${esc(CL('rGrams', 'Filament total (g)'))}</td><td>${fmt(r.grams)}</td></tr></table>`;
        };
        const runRem = () => { const c = S.rem; const r = C.remaining({ ...c, density: C.DENSITY[c.material] }); body.querySelector('[data-calc-out="rem"]').innerHTML = `<b data-calc-rem>${fmt(r.grams)} g · ${fmt(r.metres)} m</b>`; };
        body.querySelectorAll('[data-calc]').forEach((inp) => {
            const path = inp.dataset.calc;
            const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
            inp.addEventListener(ev, () => {
                set(path, inp.value);
                const box = path.split('.')[0];
                if (path === 'cost.printerId') {
                    const p = printers.find((x) => x.id === inp.value);
                    const d = p?.data || p || {};
                    if (d.powerW)
                        S.cost.powerW = d.powerW;
                    if (d.purchasePrice)
                        S.cost.printerPrice = d.purchasePrice;
                    if (d.lifetimeH)
                        S.cost.lifetimeHours = d.lifetimeH;
                    for (const k of ['powerW', 'printerPrice', 'lifetimeHours'])
                        put('cost.' + k, S.cost[k]);
                }
                if (box === 'conv')
                    runConv(path.split('.')[1]);
                if (box === 'cost' || path === 'cost.printerId')
                    runCost();
                if (box === 'rem')
                    runRem();
            });
        });
        body.querySelector('[data-calc-add-offer]').addEventListener('click', () => { S.offers.push({ name: String.fromCharCode(65 + S.offers.length), spools: 1, spoolWeightG: 1000, pricePerSpool: '', shipping: 0 }); drawOffers(); runCmp(); });
        drawOffers();
        runConv('');
        runCmp();
        runCost();
        runRem();
    }
    /* N2.3j (R73 D2): calculator defaults come from Settings (print3d.calc.*) – nothing hard-coded the user would want to change */
    const CALC_SETTINGS = [['kWhPrice', 'print3d.calc.kWhPrice'], ['laborRate', 'print3d.calc.laborRate'], ['maintenancePerHour', 'print3d.calc.maintenancePerHour'], ['failurePct', 'print3d.calc.failurePct'], ['markupPct', 'print3d.calc.markupPct'], ['vatPct', 'print3d.calc.vatPct']];
    async function calcDefaults(core, actorId) {
        const out = {};
        const scopes = [{ scopeType: 'CENTRAL', scopeId: 'GLOBAL' }, { scopeType: 'APP', scopeId: OWNER }, { scopeType: 'USER', scopeId: actorId }];
        for (const [k, key] of CALC_SETTINGS) {
            try {
                const x = await core.settingsDefaults?.explain(core.settings, key, scopes);
                if (x && x.effectiveValue !== undefined && x.effectiveValue !== null)
                    out[k] = x.effectiveValue;
            }
            catch { }
        }
        return out;
    }
    async function personalSpace(core, actorId) { const s = (await core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); return s?.id; }
    /* first run: the user's printer from a template (default Lenochod X1E) */
    async function addFromTemplate(core, code, actorId) {
        const t = (KXPrint3DRef.PRINTER_TEMPLATES || []).find((x) => x.code === code);
        if (!t)
            throw new Error('PRINT3D_TEMPLATE_UNKNOWN');
        const sp = await personalSpace(core, actorId);
        const f = {};
        for (const k of ['name', 'manufacturer', 'model', 'kind', 'volume', 'chamber', 'maxTemps', 'nozzles', 'plates', 'multimaterial', 'amsUnits', 'nozzleInstalled', 'plateInstalled', 'network', 'filtration', 'powerW', 'lifetimeH', 'note'])
            if (t[k])
                f[k] = t[k];
        return core.actions.invoke('ACTION.PRINT3D_PRINTER.PRINTER.CREATE', { ...f, spaceIds: [sp] }, { actorId, appCode: OWNER, permissions: ['PRINT3D_PRINTER.PRINTER.EDIT'], confirmed: true });
    }
    KXPrint3D = { OWNER, CALCULATORS: [{ id: 'p3.conv', tab: 'CALC', box: 'conv', tags: ['3d', 'price', 'material'] }, { id: 'p3.cmp', tab: 'CALC', box: 'cmp', tags: ['3d', 'purchase'] }, { id: 'p3.cost', tab: 'CALC', box: 'cost', tags: ['3d', 'price'] }, { id: 'p3.rem', tab: 'CALC', box: 'rem', tags: ['3d', 'material'] }], get TABS() { return [['PRINTERS', TL('print3d.tabPrinters', 'Printers')], ['FILAMENTS', TL('print3d.tabFilaments', 'Filaments')], ['PROJECTS', TL('print3d.tabProjects', 'Projects')], ['MATERIALS', TL('print3d.tabMaterials', 'Materials')], ['CALC', TL('print3d.tabCalc', 'Calculators')], ['PRIVATE', TL('print3d.tabPrivate', 'Private')], ['GUIDES', TL('print3d.tabGuides', 'Guides')]]; }, parts: { Printers, Filaments, Projects }, addFromTemplate, calcDefaults,
        install(core, personal, opt = {}) { return PARTS.map(p => p.install(core, personal, opt)); },
        async mountHub(root, core, opts) {
            const st = root.__print3d || (root.__print3d = { tab: 'PRINTERS', mat: 'ALL' });
            const tabs = [['PRINTERS', TL('print3d.tabPrinters', 'Printers')], ['FILAMENTS', TL('print3d.tabFilaments', 'Filaments')], ['PROJECTS', TL('print3d.tabProjects', 'Projects')], ['MATERIALS', TL('print3d.tabMaterials', 'Materials')], ['CALC', TL('print3d.tabCalc', 'Calculators')], ['PRIVATE', TL('print3d.tabPrivate', 'Private')], ['GUIDES', TL('print3d.tabGuides', 'Guides')]];
            const req = globalThis.KXHubTabRequest?.[OWNER];
            if (req && tabs.some(([k]) => k === req)) {
                st.tab = req;
                delete globalThis.KXHubTabRequest[OWNER];
            } /* N2.3o: the tree opens a tab directly */
            const MAN_SEC = { CALC: 'kalkulacky' };
            root.innerHTML = `<div data-print3d-hub><div class="kx-print3d-tabs">${tabs.map(([k, l]) => `<button class="chip ${st.tab === k ? 'active' : ''}" data-print3d-tab="${k}">${esc(l)}</button>`).join('')}<button class="icon-btn" data-kx-manual="HUB:APP.KX.PRINT3D§${MAN_SEC[st.tab] || 'zalozky'}" title="📖">📖</button></div><div data-print3d-body></div></div>`;
            const body = root.querySelector('[data-print3d-body]');
            root.querySelectorAll('[data-print3d-tab]').forEach((b) => b.onclick = () => { st.tab = b.dataset.print3dTab; void KXPrint3D.mountHub(root, core, opts); });
            if (st.tab === 'MATERIALS') {
                body.innerHTML = materialsHtml(st.mat);
                body.querySelectorAll('[data-print3d-mat-filter]').forEach((b) => b.onclick = () => { st.mat = b.dataset.print3dMatFilter; void KXPrint3D.mountHub(root, core, opts); });
                return;
            }
            if (st.tab === 'GUIDES') {
                body.innerHTML = guidesHtml();
                return;
            }
            if (st.tab === 'CALC') {
                let printers = [];
                try {
                    printers = await core.print3dPrinters.list(opts.actorId);
                }
                catch { }
                if (!st.calc)
                    st.calcDefaults = await calcDefaults(core, opts.actorId);
                mountCalc(body, st, printers);
                return;
            }
            const isPriv = (r) => r?.private === 'YES' || r?.data?.private === 'YES';
            if (st.tab === 'PRIVATE') {
                const s = await core.actions.invoke('ACTION.CORE.PRIVACY.STATUS', {}, { actorId: opts.actorId, appCode: OWNER, permissions: [], confirmed: true });
                if (!s.unlocked) {
                    body.innerHTML = `<div class="kx-print3d-first" data-print3d-private-locked><p>${esc(TL('print3d.privateHint', 'Private projects are hidden from overviews, search and reminders.'))}</p><button class="btn" data-print3d-unlock>🔓 ${esc(TL('print3d.unlock', 'Unlock'))}</button></div>`;
                    body.querySelector('[data-print3d-unlock]').addEventListener('click', async () => { if (!confirm(TL('print3d.unlockConfirm', 'Unlock private projects for 15 minutes?')))
                        return; await core.actions.invoke('ACTION.CORE.PRIVACY.UNLOCK', {}, { actorId: opts.actorId, appCode: OWNER, permissions: [], confirmed: true }); void KXPrint3D.mountHub(root, core, opts); });
                    return;
                }
                const bar = document.createElement('div');
                bar.className = 'kx-print3d-first';
                bar.dataset.print3dPrivateOpen = '1';
                bar.innerHTML = `<small>🔓 ${esc(TL('print3d.unlockedUntil', 'Unlocked until'))} ${esc(new Date(s.until).toLocaleTimeString())}</small> <button class="btn ghost compact" data-print3d-lock>🔒 ${esc(TL('print3d.lock', 'Lock'))}</button>`;
                body.appendChild(bar);
                bar.querySelector('[data-print3d-lock]').addEventListener('click', async () => { await core.actions.invoke('ACTION.CORE.PRIVACY.LOCK', {}, { actorId: opts.actorId, appCode: OWNER, permissions: [], confirmed: true }); void KXPrint3D.mountHub(root, core, opts); });
                const host = document.createElement('div');
                body.appendChild(host);
                await Projects.mountHub(host, core, { ...opts, filter: (r) => isPriv(r) && (!opts.filter || opts.filter(r)) });
                return;
            }
            const p = st.tab === 'FILAMENTS' ? Filaments : st.tab === 'PROJECTS' ? Projects : Printers;
            if (st.tab === 'PRINTERS') {
                let count = 0;
                try {
                    count = (await core.print3dPrinters.list(opts.actorId)).length;
                }
                catch { }
                if (!count) {
                    const tpl = (KXPrint3DRef.PRINTER_TEMPLATES || []).filter((t) => t.code !== 'OTHER');
                    const top = document.createElement('div');
                    top.className = 'kx-print3d-first';
                    top.innerHTML = `<p>${esc(TL('print3d.firstRun', 'Add your printer from a template:'))}</p>${tpl.map((t) => `<button class="btn" data-print3d-template="${esc(t.code)}">＋ ${esc(t.name)} (${esc(t.manufacturer)} ${esc(t.model)})</button>`).join(' ')}`;
                    body.appendChild(top);
                    top.querySelectorAll('[data-print3d-template]').forEach((b) => b.onclick = async () => { try {
                        await addFromTemplate(core, b.dataset.print3dTemplate, opts.actorId);
                        opts.onToast?.(TL('print3d.added', 'Added'));
                    }
                    catch (e) {
                        opts.onToast?.(String(e?.message || e));
                    } void KXPrint3D.mountHub(root, core, opts); });
                }
            }
            const host = document.createElement('div');
            body.appendChild(host);
            await p.mountHub(host, core, st.tab === 'PROJECTS' ? { ...opts, filter: (r) => !isPriv(r) && (!opts.filter || opts.filter(r)) } : opts); /* N2.3l: hub bar filter composed with Soukromé */
        } };
})();
