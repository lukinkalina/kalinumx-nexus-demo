var KXHobby;
(function () {
    const OWNER = 'APP.KX.HOBBY';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (label, max = 80, extra = {}) => ({ kind: 'text', max, label, ...extra });
    const E = (label, options, required = false) => ({ kind: 'enum', options, required, label, invalidMsg: `${TL('hobby.invalid', 'Invalid value')}: ${label}`, requiredMsg: `${label}: ${TL('hobby.required', 'required')}` });
    const D = (label) => ({ kind: 'date', label });
    const NAME = (label) => ({ kind: 'text', max: 120, required: true, label, requiredMsg: `${label}: ${TL('hobby.required', 'required')}` });
    function part(o) {
        return KXHubKit.createScheduleDomain({
            contract: `KX.${o.key}_DOMAIN/1`, owner: OWNER, type: `${o.key}.${o.typeSuffix}`, schema: `KX.${o.key}.${o.typeSuffix}/1`, permission: `${o.key}.${o.typeSuffix}.EDIT`,
            label: o.label, scopeTag: o.scopeTag, serviceKey: o.serviceKey, listKey: o.listKey, subjectIdKey: `${o.scopeTag}Id`, subjectNameKey: `${o.scopeTag}Name`,
            itemsKey: 'deadlines', itemPayloadKey: 'deadline', itemIdKey: 'deadlineId', itemIdPrefix: `${o.key}.DL.`, maxItems: 60, soonDays: 30, countLabel: o.countWord, revisionPrefix: `${o.key}.DOMAIN/1:`,
            subjectFields: o.fields, itemKinds: o.kinds, history: { added: 'DEADLINE_ADDED', done: 'DEADLINE_DONE', removed: 'DEADLINE_REMOVED' },
            actions: { create: `ACTION.${o.key}.${o.typeSuffix}.CREATE`, update: `ACTION.${o.key}.${o.typeSuffix}.UPDATE`, addItem: `ACTION.${o.key}.DEADLINE.ADD`, completeItem: `ACTION.${o.key}.DEADLINE.COMPLETE`, removeItem: `ACTION.${o.key}.DEADLINE.REMOVE`, archive: `ACTION.${o.key}.${o.typeSuffix}.ARCHIVE` },
            projection: { code: `PERSONAL.${o.key}.N2`, countField: 'alertsCount', nextField: 'nextDueAt' },
            msg: { invalidSubject: TL('hobby.msg.invalid', 'Invalid data'), unknownSubjectFields: TL('hobby.msg.unknownFields', 'Unknown fields'), invalidItem: TL('hobby.msg.invalidItem', 'Invalid deadline'), unknownItemFields: TL('hobby.msg.unknownItemFields', 'Unknown deadline fields'), invalidItemKind: TL('hobby.msg.invalidKind', 'Invalid deadline type'),
                itemDate: TL('hobby.msg.date', 'Date must be YYYY-MM-DD'), itemInterval: TL('hobby.msg.interval', 'Interval: 1–3650 days'), itemNeedsDue: TL('hobby.msg.needDue', 'Enter a date or an interval'), needSpace: TL('hobby.msg.space', 'The record must belong to at least one space'),
                separateActions: TL('hobby.msg.separate', 'Edit spaces and deadlines with separate actions'), tooMany: (n) => `${TL('hobby.msg.tooMany', 'At most')} ${n}`, itemMissing: TL('hobby.msg.itemMissing', 'The deadline does not exist'), badDoneDate: TL('hobby.msg.badDone', 'Invalid date'),
                nextAfterDone: TL('hobby.msg.nextAfter', 'The next date must be after the completion date'), missingId: TL('hobby.msg.missingId', 'Missing ID'), notFound: (id) => `${id}: ${TL('hobby.msg.notFound', 'not found')}`, needRev: TL('hobby.msg.needRev', 'Editing requires expectedRevision'), archived: TL('hobby.msg.archived', 'An archived record cannot be edited') },
            ui: { prefix: o.prefix, itemWord: 'dl', subjectForm: `${o.prefix}f`, itemForm: `${o.prefix}d`, countWord: o.countWord, addLabel: `＋ ${o.subjectCap}`, saveLabel: TL('hobby.save', 'Save'), openItemLabel: `＋ ${TL('hobby.deadline', 'Deadline')}`, addItemLabel: TL('hobby.addDeadline', 'Add deadline'), itemPlaceholder: o.placeholder,
                noItems: TL('hobby.noDeadlines', 'No deadlines'), empty: o.empty, notInstalled: TL('hobby.notInstalled', 'Domain service not installed'), subtitle: o.subtitle,
                historyText: { CREATED: TL('hobby.h.created', 'Created'), UPDATED: TL('hobby.h.updated', 'Updated'), DEADLINE_ADDED: TL('hobby.h.dlAdded', 'Deadline added'), DEADLINE_DONE: TL('hobby.h.dlDone', 'Deadline done'), DEADLINE_REMOVED: TL('hobby.h.dlRemoved', 'Deadline removed'), ARCHIVED: TL('hobby.h.archived', 'Archived') },
                savedToast: TL('hobby.saved', 'Saved'), itemAddedToast: TL('hobby.h.dlAdded', 'Deadline added'), itemDoneToast: TL('hobby.h.dlDone', 'Deadline done'), itemRemovedToast: TL('hobby.h.dlRemoved', 'Deadline removed'), archivedToast: TL('hobby.h.archived', 'Archived'),
                confirmRemove: TL('hobby.confirmRemove', 'Remove the deadline? It stays in the revision history.'), confirmArchive: TL('hobby.confirmArchive', 'Archive? Data and history stay in Core revisions.') }
        });
    }
    const KINDS = { DETECTOR: TL('hobby.kind.DETECTOR', 'Metal detector'), PINPOINTER: TL('hobby.kind.PINPOINTER', 'Pinpointer'), RC: TL('hobby.kind.RC', 'RC car'), DRONE: TL('hobby.kind.DRONE', 'Drone'), BIKE: TL('hobby.kind.BIKE', 'Bike'), OTHER: TL('hobby.kind.OTHER', 'Other') };
    /* device templates from the design (R71) – a user picks one when adding a device */
    const TEMPLATES = [{ id: 'RUTUS_ALTER_71', kind: 'DETECTOR', manufacturer: 'Rutus', model: 'Alter 71' }, { id: 'GARRETT_ACE_200I', kind: 'DETECTOR', manufacturer: 'Garrett', model: 'ACE 200i' }, { id: 'NOKTA_PULSEDIVE', kind: 'PINPOINTER', manufacturer: 'Nokta Makro', model: 'PulseDive 2v1' }, { id: 'TRAXXAS_EREVO', kind: 'RC', manufacturer: 'Traxxas', model: 'E-Revo' }, { id: 'DJI_MAVIC2_ZOOM', kind: 'DRONE', manufacturer: 'DJI', model: 'Mavic 2 Zoom' }];
    const Devices = part({ key: 'HOBBY_DEVICE', typeSuffix: 'DEVICE', label: TL('hobby.devices', 'Devices'), scopeTag: 'device', serviceKey: 'hobbyDevices', listKey: 'devices', prefix: 'hdv', subjectCap: TL('hobby.device', 'Device'), countWord: TL('hobby.devicesCount', 'devices'), placeholder: TL('hobby.devicePlaceholder', 'e.g. charging, firmware'),
        empty: TL('hobby.noDevices', 'No device yet.'), fields: { name: NAME(TL('hobby.f.name', 'Name')), kind: E(TL('hobby.f.kind', 'Kind'), KINDS, true), manufacturer: T(TL('hobby.f.manufacturer', 'Manufacturer')), model: T(TL('hobby.f.model', 'Model')), serial: T(TL('hobby.f.serial', 'Serial number'), 60), firmware: T(TL('hobby.f.firmware', 'Firmware'), 60),
            battery: T(TL('hobby.f.battery', 'Battery'), 140), price: T(TL('hobby.f.price', 'Price'), 20), purchased: D(TL('hobby.f.purchased', 'Purchased')), template: T(TL('hobby.f.template', 'Template'), 60), section: T(TL('hobby.f.section', 'Section'), 60), note: T(TL('hobby.f.note', 'Note'), 500) },
        kinds: { CHARGE: TL('hobby.dl.CHARGE', 'Charging'), SERVICE: TL('hobby.dl.SERVICE', 'Service'), FIRMWARE: TL('hobby.dl.FIRMWARE', 'Firmware'), REGISTRATION: TL('hobby.dl.REGISTRATION', 'Registration / insurance'), OTHER: TL('hobby.dl.OTHER', 'Other') },
        subtitle: (d) => `${KINDS[d.kind] || ''}${d.manufacturer ? ` · ${d.manufacturer}` : ''}${d.model ? ` ${d.model}` : ''}` });
    const LOGKIND = { FIND: TL('hobby.log.FIND', 'Find'), RIDE: TL('hobby.log.RIDE', 'Ride'), FLIGHT: TL('hobby.log.FLIGHT', 'Flight'), OTHER: TL('hobby.log.OTHER', 'Other') };
    const Log = part({ key: 'HOBBY_LOG', typeSuffix: 'ENTRY', label: TL('hobby.log', 'Log'), scopeTag: 'entry', serviceKey: 'hobbyLog', listKey: 'entries', prefix: 'hlg', subjectCap: TL('hobby.entry', 'Entry'), countWord: TL('hobby.entriesCount', 'entries'), placeholder: TL('hobby.entryPlaceholder', 'e.g. identify, clean'),
        empty: TL('hobby.noEntries', 'No entry yet.'), fields: { name: NAME(TL('hobby.f.title', 'Title')), logKind: E(TL('hobby.f.logKind', 'Type'), LOGKIND, true), date: D(TL('hobby.f.date', 'Date')), device: T(TL('hobby.f.device', 'Device'), 120),
            place: T(TL('hobby.f.place', 'Place (private)'), 300), gps: T('GPS', 60), settings: T(TL('hobby.f.settings', 'Settings used'), 300), result: T(TL('hobby.f.result', 'Result'), 300), depthCm: T(TL('hobby.f.depth', 'Depth (cm)'), 8), targetId: T(TL('hobby.f.targetId', 'Target ID'), 20),
            private: E(TL('hobby.f.private', 'Private'), { YES: TL('hobby.yes', 'Yes'), NO: TL('hobby.no', 'No') }), section: T(TL('hobby.f.section', 'Section'), 60), note: T(TL('hobby.f.note', 'Note'), 1000) },
        kinds: { IDENTIFY: TL('hobby.dl.IDENTIFY', 'Identify'), CLEAN: TL('hobby.dl.CLEAN', 'Clean / conserve'), REPORT: TL('hobby.dl.REPORT', 'Report (museum / authority)'), OTHER: TL('hobby.dl.OTHER', 'Other') },
        subtitle: (d) => `${LOGKIND[d.logKind] || ''}${d.date ? ` · ${d.date}` : ''}${d.private !== 'NO' ? ' · 🔒' : ''}` });
    const PARTS = [Devices, Log];
    /* ---- presets: chapter 13 of the user's document, read from the text (not retyped) ---- */
    function presets(text) {
        const i = text.indexOf('# 13.');
        const j = text.indexOf('\n# 14.', i);
        const blk = text.slice(i, j > 0 ? j : undefined);
        const out = [];
        for (const m of blk.matchAll(/### Preset ([A-Z]) – ([^\n]+)\n((?:- [^\n]*\n?)+)/g)) {
            const lines = {};
            for (const l of m[3].trim().split('\n')) {
                const mm = l.match(/^- ([^:]+):\s*(.+)$/);
                if (mm)
                    lines[mm[1].trim()] = mm[2].trim();
            }
            out.push({ id: m[1], name: m[2].trim(), lines });
        }
        return out;
    }
    /* ---- advisor: chapter 11 of the user's document ---- */
    const WHAT = ['GOLD', 'SILVER', 'COINS', 'RELICS', 'MILITARIA', 'JEWELRY', 'ALL'], WHERE = ['FIELD', 'FOREST', 'MEADOW', 'PARK', 'BEACH_DRY', 'BEACH_WET', 'WATER', 'TRASH'], SOIL = ['SANDY', 'LOAMY', 'CLAY', 'STONY', 'MINERAL', 'FOREST', 'PEAT'], MOIST = ['DRY', 'DAMP', 'WET', 'FROZEN'];
    function advise(i, all) {
        const P = (id) => all.find(p => p.id === id);
        let base = 'A';
        const rules = [];
        const warn = [];
        if (i.where === 'BEACH_WET' || i.where === 'WATER')
            base = 'G';
        else if (i.where === 'BEACH_DRY')
            base = 'F';
        else if (i.where === 'TRASH')
            base = 'H';
        else if (i.what === 'RELICS' || i.what === 'MILITARIA')
            base = 'B';
        else if (i.what === 'GOLD' || i.what === 'JEWELRY')
            base = 'E';
        else if (i.where === 'FOREST')
            base = 'C';
        else if (i.what === 'COINS' && (i.where === 'PARK' || i.where === 'MEADOW'))
            base = 'D';
        else if (i.soil === 'MINERAL' || i.soil === 'STONY')
            base = 'I';
        const small = i.what === 'GOLD' || i.what === 'JEWELRY', wetSaltMin = i.where === 'BEACH_WET' || i.where === 'WATER' || i.moisture === 'WET' || i.soil === 'MINERAL';
        if (small)
            rules.push(1);
        if (i.what === 'COINS' || i.what === 'SILVER' || i.what === 'RELICS')
            rules.push(2);
        if (wetSaltMin)
            rules.push(3);
        if (i.where === 'TRASH' || i.where === 'PARK')
            rules.push(4);
        if (i.soil === 'STONY')
            rules.push(5);
        if (i.what === 'RELICS' || i.what === 'MILITARIA') {
            rules.push(6);
            warn.push('MUNITION');
        }
        if (i.moisture === 'FROZEN') {
            rules.push(7);
            warn.push('FROZEN');
        }
        const conflict = small && wetSaltMin;
        if (conflict) {
            rules.push(8);
            warn.push('CONFLICT');
        }
        return { preset: P(base) || null, rules, warn, conflict, compromise: conflict ? { rutusKHz: '10–12', sensitivity: '50–60', digLowSignals: true, recommendPulseDive: true } : null };
    }
    function ruleTexts(text) { const i = text.indexOf('# 11.'); const j = text.indexOf('\n# 12.', i); const blk = text.slice(i, j > 0 ? j : undefined); const out = {}; for (const m of blk.matchAll(/^(\d)\. ([^\n]+)$/gm)) {
        const n = Number(m[1]);
        if (blk.indexOf('**Pravidla:**') < m.index)
            out[n] = m[2].replace(/\*\*/g, '');
    } return out; }
    function chapters(text) { const out = []; for (const b of text.split(/\n(?=# \d+\. )/)) {
        const m = b.match(/^# (\d+)\. ([^\n]+)/);
        if (m)
            out.push({ n: Number(m[1]), title: m[2].trim(), body: b.split('\n').slice(1).join('\n') });
    } return out; }
    /* N2.4b: HOBBY is split into SECTIONS (one per hobby) – built-ins + user sections ("＋ Sekce"); each section has its devices and log,
       metal detectors also the advisor, presets and encyclopedia. Records without a section fall back to the kind of the device. */
    const SECTIONS = [{ id: 'DETECTORS', icon: '🔎', kinds: ['DETECTOR', 'PINPOINTER'], detectors: true }, { id: 'RC', icon: '🚗', kinds: ['RC'] }, { id: 'DRONES', icon: '🛸', kinds: ['DRONE'] }, { id: 'BIKE', icon: '🚲', kinds: ['BIKE'] }];
    const SETTING_KEY = 'hobby.sections';
    function parseCustom(v) { return String(v || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const [name, icon] = x.split('|'); const id = 'C_' + String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30); return { id, name: String(name).trim(), icon: (icon || '⭐').trim(), kinds: [], custom: true }; }).filter(x => x.id !== 'C_'); }
    function serializeCustom(list) { return list.map(x => `${String(x.name).replace(/[;|]/g, ' ')}|${x.icon || '⭐'}`).join('; '); }
    function sectionOf(r) { const d = r?.data || r || {}; if (d.section)
        return String(d.section); const k = String(d.kind || ''); const s = SECTIONS.find(x => x.kinds.includes(k)); return s ? s.id : ''; }
    const TABS = SECTIONS.map(x => [x.id, `${x.icon} ${TL('hobby.sec.' + x.id, x.id)}`]);
    async function customSections(core, actorId) { try {
        const x = await core.settingsDefaults.explain(core.settings, SETTING_KEY, [{ scopeType: 'USER', scopeId: actorId }]);
        return parseCustom(String(x?.effectiveValue || ''));
    }
    catch {
        return [];
    } }
    KXHobby = { OWNER, PARTS, parts: { devices: Devices, log: Log }, TEMPLATES, KINDS, LOGKIND, WHAT, WHERE, SOIL, MOIST, SECTIONS, SETTING_KEY, parseCustom, serializeCustom, sectionOf, presets, advise, ruleTexts, chapters, TABS,
        install(core, personal, opt = {}) { return PARTS.map(p => p.install(core, personal, opt)); },
        async mountHub(root, core, opts) {
            const st = root.__hb || (root.__hb = { sec: 'DETECTORS', sub: 'DEVICES', ch: 1, adv: { what: 'ALL', where: 'FIELD', soil: 'LOAMY', moisture: 'DRY' } });
            const req = globalThis.KXHubTabRequest?.[OWNER];
            if (req) {
                st.sec = req;
                st.sub = 'DEVICES';
                delete globalThis.KXHubTabRequest[OWNER];
            }
            const custom = await customSections(core, opts.actorId);
            const all = [...SECTIONS, ...custom];
            if (!all.some(x => x.id === st.sec))
                st.sec = 'DETECTORS';
            const cur = all.find(x => x.id === st.sec);
            const subs = [['DEVICES', TL('hobby.tab.DEVICES', 'Devices')], ['LOG', TL('hobby.tab.LOG', 'Log')], ...(cur.detectors ? [['ADVISOR', TL('hobby.sub.ADVISOR', 'Settings advisor')], ['PRESETS', TL('hobby.sub.PRESETS', 'Presets')], ['BOOK', TL('hobby.sub.BOOK', 'Encyclopedia')]] : [])];
            if (!subs.some(([k]) => k === st.sub))
                st.sub = 'DEVICES';
            const secName = (x) => x.custom ? x.name : TL('hobby.sec.' + x.id, x.id);
            root.innerHTML = `<div data-hobby-hub><div class="kx-print3d-tabs kx-hobby-secs">${all.map(x => `<button class="chip ${st.sec === x.id ? 'active' : ''}" data-hobby-sec="${esc(x.id)}">${esc(x.icon)} ${esc(secName(x))}</button>`).join('')}<button class="chip" data-hobby-addsec>＋ ${esc(TL('hobby.addSection', 'Section'))}</button><button class="icon-btn" data-kx-manual="HUB:APP.KX.HOBBY" title="📖">📖</button></div>
        <div class="kx-hobby-addsec" data-hobby-addsec-form hidden><input data-hobby-secname placeholder="${esc(TL('hobby.secNamePh', 'e.g. Fishing'))}" maxlength="40"><input data-hobby-secicon placeholder="🎣" maxlength="4" style="width:4em"><button class="btn" data-hobby-secsave>${esc(TL('hobby.save', 'Save'))}</button>${cur.custom ? `<button class="btn ghost" data-hobby-secdel>${esc(TL('hobby.removeSection', 'Remove this section'))}</button>` : ''}</div>
        <div class="kx-print3d-tabs">${subs.map(([k, l]) => `<button class="chip ${st.sub === k ? 'active' : ''}" data-hobby-sub="${k}">${esc(l)}</button>`).join('')}</div><div data-hobby-body data-hobby-current="${esc(cur.id)}"></div></div>`;
            const again = () => void KXHobby.mountHub(root, core, opts);
            root.querySelectorAll('[data-hobby-sec]').forEach(b => b.onclick = () => { st.sec = b.dataset.hobbySec; st.sub = 'DEVICES'; again(); });
            root.querySelectorAll('[data-hobby-sub]').forEach(b => b.onclick = () => { st.sub = b.dataset.hobbySub; again(); });
            const form = root.querySelector('[data-hobby-addsec-form]');
            root.querySelector('[data-hobby-addsec]').onclick = () => { form.hidden = !form.hidden; form.querySelector('[data-hobby-secname]')?.focus(); };
            const saveCustom = async (list) => { try {
                await core.actions.invoke('ACTION.CORE.SETTING.SET', { key: SETTING_KEY, scopeType: 'USER', scopeId: opts.actorId, value: serializeCustom(list) }, { actorId: opts.actorId, appCode: 'APP.KX.HOBBY', deviceId: opts.deviceId, permissions: ['CORE.SETTING.EDIT'], confirmed: true });
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            } };
            root.querySelector('[data-hobby-secsave]').onclick = async () => {
                const name = form.querySelector('[data-hobby-secname]').value.trim();
                const icon = form.querySelector('[data-hobby-secicon]').value.trim() || '⭐';
                if (!name)
                    return;
                const list = [...custom.filter(x => x.name !== name), { name, icon }];
                await saveCustom(list);
                st.sec = parseCustom(serializeCustom(list)).find(x => x.name === name)?.id || st.sec;
                st.sub = 'DEVICES';
                again();
            };
            root.querySelector('[data-hobby-secdel]')?.addEventListener('click', async () => { if (!confirm(TL('hobby.removeSectionConfirm', 'Remove the section? Its records stay (shown under their device kind).')))
                return; await saveCustom(custom.filter(x => x.id !== cur.id)); st.sec = 'DETECTORS'; again(); });
            const body = root.querySelector('[data-hobby-body]');
            const inSec = (r) => sectionOf(r) === cur.id && (!opts.filter || opts.filter(r));
            const prefillDev = { section: cur.id };
            if (cur.kinds?.[0])
                prefillDev.kind = cur.kinds[0];
            else
                prefillDev.kind = 'OTHER';
            if (st.sub === 'DEVICES') {
                const host = document.createElement('div');
                host.dataset.hubRoot = OWNER;
                body.appendChild(host);
                return Devices.mountHub(host, core, { ...opts, filter: inSec, prefill: prefillDev, hiddenFields: ['section'] });
            }
            if (st.sub === 'LOG') {
                const note = document.createElement('p');
                note.className = 'muted';
                note.dataset.hobbyPrivacy = '';
                note.textContent = TL('hobby.privacyNote', 'The place of a find is private by default – it is not shared or propagated.');
                body.appendChild(note);
                const host = document.createElement('div');
                host.dataset.hubRoot = OWNER;
                body.appendChild(host);
                return Log.mountHub(host, core, { ...opts, filter: (r) => (r?.data?.section || '') === cur.id && (!opts.filter || opts.filter(r)), prefill: { section: cur.id, private: 'YES', logKind: cur.id === 'DETECTORS' ? 'FIND' : cur.id === 'DRONES' ? 'FLIGHT' : cur.id === 'RC' || cur.id === 'BIKE' ? 'RIDE' : 'OTHER' }, hiddenFields: ['section'] });
            }
            const doc = globalThis.KXHobbyDetectorsCS;
            const md = globalThis.KXTrackWork?.md || ((x) => `<pre>${esc(x)}</pre>`);
            if (!doc) {
                body.innerHTML = `<p class="muted">${esc(TL('hobby.noDoc', 'Document not loaded.'))}</p>`;
                return;
            }
            const allP = presets(doc.text);
            const presetHtml = (p) => `<div class="kx-calc" data-hobby-preset="${esc(p.id)}"><h3>${esc(TL('hobby.preset', 'Preset'))} ${esc(p.id)} – ${esc(p.name)}</h3><ul>${Object.entries(p.lines).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join('')}</ul></div>`;
            let html = '';
            if (st.sub === 'PRESETS')
                html = `<div class="kx-tw-calcs">${allP.map(presetHtml).join('')}</div>`;
            else if (st.sub === 'BOOK') {
                const ch = chapters(doc.text);
                const c = ch.find(x => x.n === st.ch) || ch[0];
                html = `<div class="kx-tw"><div class="kx-tw-trades">${ch.map(x => `<button class="kx-tree-row ${x.n === c.n ? 'on' : ''}" data-hobby-ch="${x.n}">${x.n}. ${esc(x.title)}</button>`).join('')}</div><div class="kx-tw-main kx-tw-sec" data-hobby-chapter="${c.n}">${md(c.body)}</div></div><p class="muted kx-tw-src-note">${esc(TL('tw.sourceNote', 'Source'))}: ${esc(doc.source)}</p>`;
            }
            else {
                const sel = (k, list) => `<label class="kx-calc-f">${esc(TL('hobby.adv.' + k, k))}<select data-hobby-adv="${k}">${list.map(v => `<option value="${v}" ${st.adv[k] === v ? 'selected' : ''}>${esc(TL('hobby.' + k + '.' + v, v))}</option>`).join('')}</select></label>`;
                const r = advise(st.adv, allP);
                const rt = ruleTexts(doc.text);
                html = `<div class="kx-calc" data-hobby-advisor><div class="kx-calc-grid">${sel('what', WHAT)}${sel('where', WHERE)}${sel('soil', SOIL)}${sel('moisture', MOIST)}</div>
          ${r.warn.map(w => `<div class="kx-tw-safety" data-hobby-warn="${w}">⚠ ${esc(TL('hobby.warn.' + w, w))}</div>`).join('')}
          ${r.preset ? presetHtml(r.preset) : ''}${r.compromise ? `<div class="kx-calc-res" data-hobby-compromise>${esc(TL('hobby.compromise', 'Compromise'))}: Rutus ${esc(r.compromise.rutusKHz)} kHz · ${esc(TL('hobby.sensitivity', 'sensitivity'))} ${esc(r.compromise.sensitivity)} · ${esc(TL('hobby.digLow', 'dig low signals too'))} · ${esc(TL('hobby.usePulseDive', 'use PulseDive'))}</div>` : ''}
          <h4>${esc(TL('hobby.rulesApplied', 'Rules applied (chapter 11)'))}</h4><ul data-hobby-rules>${r.rules.map(n => `<li>${n}. ${esc(rt[n] || '')}</li>`).join('')}</ul></div>`;
            }
            body.innerHTML = html;
            body.querySelectorAll('[data-hobby-ch]').forEach(b => b.onclick = () => { st.ch = Number(b.dataset.hobbyCh); again(); });
            body.querySelectorAll('[data-hobby-adv]').forEach(x => x.onchange = () => { st.adv[String(x.dataset.hobbyAdv)] = x.value; again(); });
        } };
})();
