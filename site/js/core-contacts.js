// N2.5c: contacts – proper (user 2026-10-24): kind + subtype (bank, insurer, doctor …), full name / company (IČO checked), photo,
// many phones / e-mails / addresses / websites (network detected from the domain – own symbols, never brand logos), dates (birthday,
// name day computed from the first name, anniversaries), relations, works at, tags, groups, favourite, notes (with author / time, 🔒),
// linked member (= „Můj profil“). vCard 3.0 export / import (duplicates by e-mail / phone / IČO), merge. Only readable records.
// Record CORE.CONTACT (schema KX.CONTACT/2); the minimal N2.5b record (KX.CONTACT/1 – name, kind, note) is read as /2 automatically.
var KXContacts;
(function () {
    /* N2.5p: relation kinds (family, friends, work) with the inverse – looked at the old Finance hub P7, re-done */
    const REL_KINDS = ['SPOUSE', 'PARTNER', 'MOTHER', 'FATHER', 'SON', 'DAUGHTER', 'CHILD', 'PARENT', 'BROTHER', 'SISTER', 'SIBLING', 'GRANDMOTHER', 'GRANDFATHER', 'GRANDCHILD', 'AUNT', 'UNCLE', 'NIECE_NEPHEW', 'COUSIN', 'IN_LAW', 'GODPARENT', 'FRIEND', 'NEIGHBOUR', 'COLLEAGUE', 'BOSS', 'EMPLOYEE', 'CUSTOMER', 'SUPPLIER', 'DOCTOR', 'TEACHER', 'RELATED', 'OTHER'];
    const REL_INVERSE = { SPOUSE: 'SPOUSE', PARTNER: 'PARTNER', MOTHER: 'CHILD', FATHER: 'CHILD', SON: 'PARENT', DAUGHTER: 'PARENT', CHILD: 'PARENT', PARENT: 'CHILD', BROTHER: 'SIBLING', SISTER: 'SIBLING', SIBLING: 'SIBLING', GRANDMOTHER: 'GRANDCHILD', GRANDFATHER: 'GRANDCHILD', GRANDCHILD: 'GRANDCHILD', AUNT: 'NIECE_NEPHEW', UNCLE: 'NIECE_NEPHEW', NIECE_NEPHEW: 'RELATED', COUSIN: 'COUSIN', IN_LAW: 'IN_LAW', GODPARENT: 'RELATED', FRIEND: 'FRIEND', NEIGHBOUR: 'NEIGHBOUR', COLLEAGUE: 'COLLEAGUE', BOSS: 'EMPLOYEE', EMPLOYEE: 'BOSS', CUSTOMER: 'SUPPLIER', SUPPLIER: 'CUSTOMER', DOCTOR: 'RELATED', TEACHER: 'RELATED', RELATED: 'RELATED', OTHER: 'OTHER' };
    const T = 'CORE.CONTACT', OWNER = 'APP.KX.NEXUS', SCHEMA = 'KX.CONTACT/2';
    const KINDS = ['PERSON', 'COMPANY', 'SERVICE', 'GROUP'];
    const SUBTYPES = ['BANK', 'INSURER', 'AUTHORITY', 'DOCTOR', 'CLINIC', 'PHARMACY', 'SCHOOL', 'SERVICE_SHOP', 'ESHOP', 'CRAFTSMAN', 'VET', 'OTHER'];
    const PHONE_L = ['MOBILE', 'WORK', 'HOME', 'FAX', 'OTHER'], MAIL_L = ['PERSONAL', 'WORK', 'INVOICE', 'OTHER'], ADDR_L = ['HOME', 'WORK', 'BILLING', 'DELIVERY', 'OTHER'], DATE_K = ['BIRTHDAY', 'NAMEDAY', 'ANNIVERSARY', 'WEDDING_ANNIVERSARY', 'DEATH_ANNIVERSARY', 'OTHER'];
    const NETWORKS = [[/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'FACEBOOK', 'Facebook', 'f'], [/(^|\.)instagram\.com$/, 'INSTAGRAM', 'Instagram', '◎'], [/(^|\.)linkedin\.com$/, 'LINKEDIN', 'LinkedIn', 'in'],
        [/(^|\.)(x|twitter)\.com$/, 'X', 'X', '𝕏'], [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YOUTUBE', 'YouTube', '▶'], [/(^|\.)tiktok\.com$/, 'TIKTOK', 'TikTok', '♪'], [/(^|\.)pinterest\.[a-z.]+$/, 'PINTEREST', 'Pinterest', 'P'],
        [/(^|\.)github\.com$/, 'GITHUB', 'GitHub', '</>'], [/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/, 'WHATSAPP', 'WhatsApp', '✆'], [/(^|\.)t\.me$|(^|\.)telegram\.me$/, 'TELEGRAM', 'Telegram', '✈']];
    const str = (x, max = 300) => String(x ?? '').trim().slice(0, max);
    /* CZ IČO: 8 digits, weights 8..2, check = (11 − sum mod 11) mod 10 */
    function icoValid(ico) { const s = String(ico ?? '').replace(/\s/g, ''); if (!/^\d{8}$/.test(s))
        return false; let sum = 0; for (let i = 0; i < 7; i++)
        sum += Number(s[i]) * (8 - i); return (11 - (sum % 11)) % 10 === Number(s[7]); }
    /* N2.5c (user): numbers by COUNTRY – the default country is chosen (remembered per user) or taken from the device locale;
       national numbers get the calling code, a trunk „0“ is dropped where countries use it (DE, AT, GB, HU 06, IT keeps 0) */
    const COUNTRIES = { CZ: { code: '420', trunk: '', len: [9] }, SK: { code: '421', trunk: '0', len: [9] }, DE: { code: '49', trunk: '0', len: [6, 7, 8, 9, 10, 11] }, AT: { code: '43', trunk: '0', len: [6, 7, 8, 9, 10, 11, 12, 13] },
        PL: { code: '48', trunk: '', len: [9] }, HU: { code: '36', trunk: '06', len: [8, 9] }, GB: { code: '44', trunk: '0', len: [9, 10] }, IT: { code: '39', trunk: '', len: [6, 7, 8, 9, 10, 11] }, FR: { code: '33', trunk: '0', len: [9] }, ES: { code: '34', trunk: '', len: [9] },
        NL: { code: '31', trunk: '0', len: [9] }, BE: { code: '32', trunk: '0', len: [8, 9] }, CH: { code: '41', trunk: '0', len: [9] }, UA: { code: '380', trunk: '0', len: [9] }, US: { code: '1', trunk: '1', len: [10] }, CA: { code: '1', trunk: '1', len: [10] } };
    function localeCountry() { try {
        const l = String(globalThis.navigator?.language || '');
        const m = l.match(/-([A-Z]{2})$/i);
        const c = m ? m[1].toUpperCase() : (/^cs/i.test(l) ? 'CZ' : /^sk/i.test(l) ? 'SK' : '');
        return COUNTRIES[c] ? c : 'CZ';
    }
    catch {
        return 'CZ';
    } }
    function phone(raw, country) {
        let p = String(raw ?? '').replace(/[^\d+]/g, '');
        if (!p)
            return '';
        if (p.startsWith('00'))
            p = '+' + p.slice(2);
        if (p.startsWith('+'))
            return p;
        const c = COUNTRIES[String(country || '').toUpperCase()] ? String(country).toUpperCase() : localeCountry();
        const k = COUNTRIES[c];
        let n = p;
        if (k.trunk && n.startsWith(k.trunk))
            n = n.slice(k.trunk.length);
        return k.len.includes(n.length) ? '+' + k.code + n : p;
    }
    const mailOk = (m) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);
    function network(url) {
        let u = str(url, 500);
        if (!u)
            return null;
        if (!/^https?:\/\//i.test(u))
            u = 'https://' + u;
        let host = '';
        try {
            host = new URL(u).hostname.toLowerCase();
        }
        catch {
            return { url: u, code: 'WEB', label: 'Web', symbol: '🌐' };
        }
        for (const [re, code, label, symbol] of NETWORKS)
            if (re.test(host))
                return { url: u, code, label, symbol };
        return { url: u, code: 'WEB', label: host.replace(/^www\./, ''), symbol: '🌐' };
    }
    const list = (a, fn) => (Array.isArray(a) ? a : []).map(fn).filter(Boolean);
    function displayName(d) { if (d.kind === 'PERSON') {
        const n = [d.prefix, d.firstName, d.middleName, d.lastName, d.suffix].map((x) => str(x)).filter(Boolean).join(' ');
        return n || str(d.name) || str(d.nickname);
    } return str(d.company) || str(d.name); }
    /* any input (incl. the N2.5b /1 record) → a clean /2 record */
    function normalize(inp, opt) {
        const d = { ...(inp || {}), phoneCountry: (inp || {}).phoneCountry || opt?.phoneCountry };
        const kind = KINDS.includes(d.kind) ? d.kind : 'PERSON';
        const out = { kind, subtype: SUBTYPES.includes(d.subtype) ? d.subtype : null, prefix: str(d.prefix, 30), firstName: str(d.firstName, 80), middleName: str(d.middleName, 80), lastName: str(d.lastName, 80), suffix: str(d.suffix, 30), nickname: str(d.nickname, 60),
            company: str(d.company, 160), ico: str(d.ico, 12).replace(/\s/g, ''), dic: str(d.dic, 16).replace(/\s/g, '').toUpperCase(), legalForm: str(d.legalForm, 40), bankCode: str(d.bankCode, 4), bic: str(d.bic, 11).toUpperCase(), position: str(d.position, 80),
            photoFileId: str(d.photoFileId, 120) || null,
            phones: list(d.phones, (x) => { const v = phone(x?.value ?? x, x?.country || d.phoneCountry); return v ? { value: v, label: PHONE_L.includes(x?.label) ? x.label : 'MOBILE', primary: x?.primary === true } : null; }),
            emails: list(d.emails, (x) => { const v = str(x?.value ?? x, 160).toLowerCase(); return v && mailOk(v) ? { value: v, label: MAIL_L.includes(x?.label) ? x.label : 'PERSONAL', primary: x?.primary === true } : null; }),
            addresses: list(d.addresses, (x) => { const a = { street: str(x?.street, 120), city: str(x?.city, 80), zip: str(x?.zip, 10).replace(/\s/g, ''), country: str(x?.country, 60) || 'Česko', label: ADDR_L.includes(x?.label) ? x.label : 'HOME' }; return a.street || a.city ? a : null; }),
            websites: list(d.websites, (x) => network(x?.url ?? x)),
            dates: list(d.dates, (x) => {
                const v = str(x?.date, 10);
                return /^(\d{4}-)?\d{2}-\d{2}$/.test(v) && DATE_K.includes(x?.kind) ? { kind: x.kind, date: v, label: str(x?.label, 60),
                    /* N2.5p: reminder lead (days) and a gift plan per occasion */ leadDays: Number.isInteger(Number(x?.leadDays)) && Number(x.leadDays) >= 0 && Number(x.leadDays) <= 60 ? Number(x.leadDays) : null,
                    gift: x?.gift && (x.gift.idea || Number(x.gift.budget) > 0) ? { idea: str(x.gift.idea, 200), budget: Number(x.gift.budget) > 0 ? Math.round(Number(x.gift.budget) * 100) / 100 : 0, done: x.gift.done === true } : null } : null;
            }),
            relations: list(d.relations, (x) => /^kx:\/\//.test(String(x?.ref || '')) ? { ref: x.ref, kind: REL_KINDS.includes(String(x?.kind)) ? String(x.kind) : 'RELATED' } : null),
            worksAt: /^kx:\/\//.test(String(d.worksAt || '')) ? d.worksAt : null,
            tags: [...new Set(list(d.tags, (x) => str(x, 40)))], groups: [...new Set(list(d.groups, (x) => str(x, 40)))], favorite: d.favorite === true,
            notes: list(d.notes, (x) => { const t = str(x?.text ?? x, 4000); return t ? { text: t, by: str(x?.by, 80) || null, at: str(x?.at, 30) || null, private: x?.private === true } : null; }),
            userId: /^USER\./.test(String(d.userId || '')) ? d.userId : null,
            /* N2.5c: telling same-named contacts apart – a separate value, the name stays */ disambiguation: str(d.disambiguation, 40) || undefined };
        if (!out.notes.length && str(d.note))
            out.notes = [{ text: str(d.note, 4000), by: null, at: null, private: false }];
        if (kind !== 'PERSON' && !out.company)
            out.company = str(d.name, 160);
        if (kind === 'PERSON' && !out.firstName && !out.lastName && str(d.name)) {
            const p = str(d.name).split(/\s+/);
            out.firstName = p[0];
            out.lastName = p.slice(1).join(' ');
        }
        for (const k of ['phones', 'emails'])
            if (out[k].length && !out[k].some((x) => x.primary))
                out[k][0].primary = true;
        out.name = displayName(out);
        out.icoValid = out.ico ? icoValid(out.ico) : null;
        return out;
    }
    function nameDay(d) { if (d.kind !== 'PERSON' || !d.firstName)
        return null; try {
        const r = globalThis.KXMyNameDays?.resolve(d.firstName);
        return r?.status === 'OK' ? r.date : null;
    }
    catch {
        return null;
    } }
    /* vCard 3.0 */
    const ve = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const VT = { MOBILE: 'CELL', WORK: 'WORK', HOME: 'HOME', FAX: 'FAX', OTHER: 'VOICE', PERSONAL: 'HOME', INVOICE: 'WORK', BILLING: 'WORK', DELIVERY: 'HOME' };
    function vcard(raw) {
        const d = normalize(raw);
        const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${ve(d.lastName)};${ve(d.firstName)};${ve(d.middleName)};${ve(d.prefix)};${ve(d.suffix)}`, `FN:${ve(d.name)}`];
        if (d.nickname)
            L.push(`NICKNAME:${ve(d.nickname)}`);
        if (d.company)
            L.push(`ORG:${ve(d.company)}`);
        if (d.position)
            L.push(`TITLE:${ve(d.position)}`);
        for (const p of d.phones)
            L.push(`TEL;TYPE=${VT[p.label] || 'VOICE'}${p.primary ? ',PREF' : ''}:${p.value}`);
        for (const m of d.emails)
            L.push(`EMAIL;TYPE=INTERNET,${VT[m.label] || 'HOME'}${m.primary ? ',PREF' : ''}:${m.value}`);
        for (const a of d.addresses)
            L.push(`ADR;TYPE=${VT[a.label] || 'HOME'}:;;${ve(a.street)};${ve(a.city)};;${ve(a.zip)};${ve(a.country)}`);
        for (const w of d.websites)
            L.push(`URL:${w.url}`);
        const b = d.dates.find((x) => x.kind === 'BIRTHDAY');
        if (b)
            L.push(`BDAY:${b.date}`);
        const nt = d.notes.filter((n) => !n.private).map((n) => n.text).join('\n');
        if (nt)
            L.push(`NOTE:${ve(nt)}`);
        L.push('END:VCARD');
        return L.join('\r\n');
    }
    const vu = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    function parseVcards(text) {
        const lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
        const out = [];
        let cur = null;
        for (const ln of lines) {
            const i = ln.indexOf(':');
            if (i < 0)
                continue;
            const head = ln.slice(0, i), val = ln.slice(i + 1);
            const [prop, ...params] = head.split(';');
            const P = prop.toUpperCase().replace(/^ITEM\d+\./, '');
            const types = params.join(';').toUpperCase();
            if (P === 'BEGIN' && /VCARD/i.test(val)) {
                cur = { kind: 'PERSON', phones: [], emails: [], addresses: [], websites: [], dates: [], notes: [] };
                continue;
            }
            if (!cur)
                continue;
            if (P === 'END') {
                out.push(cur);
                cur = null;
                continue;
            }
            if (P === 'N') {
                const [l, f, m, pre, suf] = val.split(/(?<!\\);/).map(vu);
                Object.assign(cur, { lastName: l || '', firstName: f || '', middleName: m || '', prefix: pre || '', suffix: suf || '' });
            }
            else if (P === 'FN' && !cur.firstName && !cur.lastName)
                cur.name = vu(val);
            else if (P === 'NICKNAME')
                cur.nickname = vu(val);
            else if (P === 'ORG') {
                cur.company = vu(val.split(/(?<!\\);/)[0]);
            }
            else if (P === 'TITLE')
                cur.position = vu(val);
            else if (P === 'TEL')
                cur.phones.push({ value: val, label: /CELL/.test(types) ? 'MOBILE' : /WORK/.test(types) ? 'WORK' : /HOME/.test(types) ? 'HOME' : /FAX/.test(types) ? 'FAX' : 'OTHER', primary: /PREF/.test(types) });
            else if (P === 'EMAIL')
                cur.emails.push({ value: val, label: /WORK/.test(types) ? 'WORK' : 'PERSONAL', primary: /PREF/.test(types) });
            else if (P === 'ADR') {
                const a = val.split(/(?<!\\);/).map(vu);
                cur.addresses.push({ street: a[2] || '', city: a[3] || '', zip: a[5] || '', country: a[6] || '', label: /WORK/.test(types) ? 'WORK' : 'HOME' });
            }
            else if (P === 'URL')
                cur.websites.push(val);
            else if (P === 'BDAY') {
                const m = val.match(/(\d{4})-?(\d{2})-?(\d{2})/);
                if (m)
                    cur.dates.push({ kind: 'BIRTHDAY', date: `${m[1]}-${m[2]}-${m[3]}` });
            }
            else if (P === 'NOTE')
                cur.notes.push({ text: vu(val) });
        }
        /* a card without a personal name (N empty) but with ORG is a company – FN of such cards usually repeats the brand */
        for (const c of out)
            if (!c.firstName && !c.lastName && c.company) {
                c.kind = 'COMPANY';
                delete c.name;
            }
        return out;
    }
    function install(core) {
        if (core.contacts)
            return core.contacts;
        const C = (a) => ({ actorId: a, appCode: OWNER, permissions: [], confirmed: true });
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const view = (r) => { const d = normalize(r.data); const x = String(d.disambiguation || ''); return { label: !x ? d.name : /^\d+$/.test(x) ? `${d.name} .${x}` : `${d.name} (${x})`, created: r.createdAt || null, id: r.id, ref: core.deepLinks.build({ kind: 'ENTITY', id: r.id }), revision: r.revision, spaceIds: r.spaceIds, ...d, nameDay: nameDay(d) }; };
        /* N2.5c: the contact's birthday, name day (computed) and anniversaries → yearly calendar events (FREQ=YEARLY) with reminders
           the day before and on the day; in the CONTACT's spaces (seen by whoever sees the contact); a changed date moves the event
           (no copy), a removed date / archived contact archives it. Source: CORE.CONTACT „<id>#<KIND>“. */
        const CAL = ['BIRTHDAY', 'NAMEDAY', 'ANNIVERSARY', 'WEDDING_ANNIVERSARY', 'DEATH_ANNIVERSARY'];
        /* N2.5p: lead days → reminder codes (the day itself always) */ const leadsFor = (n) => n == null ? ['1D', 'AT'] : n <= 0 ? ['AT'] : n === 1 ? ['1D', 'AT'] : n === 2 ? ['2D', '1D', 'AT'] : n <= 7 ? ['1W', '1D', 'AT'] : n <= 14 ? ['2W', '1D', 'AT'] : n <= 21 ? ['3W', '1D', 'AT'] : ['1M', '1W', 'AT'];
        const ET = (k, d) => String(globalThis.KXI18n?.UI?.[k]?.cs || d);
        const nextDate = (mmdd, today) => { const y = Number(today.slice(0, 4)); let d = `${y}-${mmdd}`; if (d < today)
            d = `${y + 1}-${mmdd}`; return d; };
        async function syncCalendar(r, ctx, remove = false) {
            if (!core.calendar)
                return { created: 0, moved: 0, archived: 0 };
            const d = normalize(r.data);
            const label = d.disambiguation ? (/^\d+$/.test(d.disambiguation) ? `${d.name} .${d.disambiguation}` : `${d.name} (${d.disambiguation})`) : d.name;
            const want = new Map();
            const leadOf = new Map();
            if (!remove && !r.archivedAt) {
                for (const x of d.dates) {
                    if (CAL.includes(x.kind) && !want.has(x.kind)) {
                        want.set(x.kind, x.date.slice(-5));
                        leadOf.set(x.kind, x.leadDays ?? null);
                    }
                }
                const nd = nameDay(d);
                if (nd)
                    want.set('NAMEDAY', nd);
            }
            const today = new Date().toISOString().slice(0, 10);
            const C2 = { ...ctx, appCode: 'APP.NEXUS', permissions: ['CORE.CALENDAR.EDIT'], confirmed: true };
            const out = { created: 0, moved: 0, archived: 0 };
            const mine = (await core.calendar.list()).filter((e) => !e.archivedAt && e.sourceEntityType === T && String(e.sourceEntityId || '').startsWith(r.id + '#'));
            for (const e of mine) {
                const kind = String(e.sourceEntityId).split('#')[1];
                const mmdd = want.get(kind);
                if (!mmdd) {
                    await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { ...e, archivedAt: new Date().toISOString(), expectedRevision: e.revision }, C2).catch(async () => { try {
                        await core.entities.save({ ...e, archivedAt: new Date().toISOString(), expectedRevision: e.revision }, C2);
                    }
                    catch { } });
                    out.archived++;
                    continue;
                }
                const title = `${ET('ct.ev.' + kind, kind)}: ${label}`;
                if (String(e.startsAt).slice(5, 10) !== mmdd || e.title !== title || JSON.stringify(e.spaceIds) !== JSON.stringify(r.spaceIds)) {
                    await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { ...e, title, spaceIds: r.spaceIds, startsAt: `${nextDate(mmdd, today)}T08:00:00.000Z`, expectedRevision: e.revision }, C2);
                    out.moved++;
                }
                want.delete(kind);
            }
            for (const [kind, mmdd] of want) {
                const ev = await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: `${ET('ct.ev.' + kind, kind)}: ${label}`, ownerApp: 'APP.NEXUS', spaceIds: r.spaceIds, startsAt: `${nextDate(mmdd, today)}T08:00:00.000Z`, allDay: true, attendeeIds: [], status: 'CONFIRMED', recurrenceRule: 'FREQ=YEARLY', sourceEntityType: T, sourceEntityId: `${r.id}#${kind}` }, C2);
                try {
                    if (core.reminders)
                        await core.actions.invoke('ACTION.CORE.REMINDERS.SET', { target: { kind: 'EVENT', id: ev.id }, leads: leadsFor(leadOf.get(kind) ?? null), template: 'HOLIDAY' }, { ...C2, permissions: ['CORE.CALENDAR.EDIT', 'CORE.ALARM.EDIT'] });
                }
                catch { }
                out.created++;
            }
            return out;
        }
        const all = async (actor) => { const out = []; for (const r of await core.entities.list()) {
            if (r.type !== T || r.archivedAt)
                continue;
            if (await readable(r, actor))
                out.push(r);
        } return out; };
        const IGN = 'CORE.CONTACT_DUPLICATE_IGNORE.CURRENT';
        const ignored = async () => { try {
            return new Set((await core.entities.get(IGN))?.data?.pairs || []);
        }
        catch {
            return new Set();
        } };
        const pairKey = (a, b) => [a, b].sort().join('|');
        const meta = (r) => ({ id: r.id, created: r.createdAt || null, updated: r.updatedAt || null });
        const keyset = (d) => [...d.emails.map((x) => 'e:' + x.value), ...d.phones.map((x) => 'p:' + x.value), ...(d.ico ? ['i:' + d.ico] : [])];
        const svc = { REL_KINDS, REL_INVERSE,
            /* N2.5p: gifts – upcoming occasions with a gift plan (idea, budget, bought) in the next N days + budget total */
            async gifts(p, ctx) {
                const days = Math.max(1, Math.min(400, Number(p?.days) || 60));
                const t0 = new Date();
                const today = t0.toISOString().slice(0, 10);
                const end = new Date(t0.getTime() + days * 86400000).toISOString().slice(0, 10);
                const out = [];
                for (const r of await all(ctx.actorId)) {
                    const d = normalize(r.data);
                    for (const x of d.dates) {
                        if (!x.gift)
                            continue;
                        const when = nextDate(x.date.slice(-5), today);
                        if (when > end)
                            continue;
                        out.push({ contactId: r.id, name: d.name, kind: x.kind, date: when, idea: x.gift.idea, budget: x.gift.budget, done: x.gift.done, spaceIds: r.spaceIds });
                    }
                }
                out.sort((a, b) => a.date.localeCompare(b.date));
                return { days, items: out, budget: Math.round(out.filter(x => !x.done).reduce((a, x) => a + x.budget, 0) * 100) / 100 };
            },
            KINDS, SUBTYPES, icoValid, phone, network, normalize, displayName, vcard, parseVcards, nameDay,
            async get(p, ctx) { const r = await core.entities.get(String(p?.id || '')); if (!r || r.type !== T || !await readable(r, ctx.actorId))
                throw new Error('CONTACT_NOT_FOUND'); return view(r); },
            async save(p, ctx) {
                const d = normalize(p?.data, { phoneCountry: p?.phoneCountry });
                if (!d.name)
                    throw new Error('CONTACT_NAME_REQUIRED');
                if (d.ico && !d.icoValid && p?.allowInvalidIco !== true)
                    throw new Error('CONTACT_ICO_INVALID');
                let old = null;
                if (p?.id) {
                    old = await core.entities.get(String(p.id));
                    if (!old || old.type !== T || !await readable(old, ctx.actorId))
                        throw new Error('CONTACT_NOT_FOUND');
                }
                const spaceIds = old ? old.spaceIds : [String(p?.spaceId || ((await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id || '')].filter(Boolean);
                if (!spaceIds.length)
                    throw new Error('CONTACT_NO_SPACE');
                const r = await core.entities.save({ ...(old ? { id: old.id, expectedRevision: p?.expectedRevision ?? old.revision } : {}), type: T, ownerApp: OWNER, schema: SCHEMA, spaceIds, data: d }, { ...ctx, appCode: OWNER });
                try {
                    await syncCalendar(r, ctx);
                }
                catch { }
                return view(r);
            },
            async calendarSync(p, ctx) { const r = await core.entities.get(String(p?.id || '')); if (!r || r.type !== T || !await readable(r, ctx.actorId))
                throw new Error('CONTACT_NOT_FOUND'); return syncCalendar(r, ctx); },
            async archive(p, ctx) { const r = await core.entities.get(String(p?.id || '')); if (!r || r.type !== T || !await readable(r, ctx.actorId))
                throw new Error('CONTACT_NOT_FOUND'); await core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, { ...ctx, appCode: OWNER }); try {
                await syncCalendar(r, ctx, true);
            }
            catch { } return true; },
            async list(p, ctx) {
                const q = String(p?.query || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                let rows = (await all(ctx.actorId)).map(view);
                if (p?.kind)
                    rows = rows.filter((c) => c.kind === p.kind);
                if (p?.subtype)
                    rows = rows.filter((c) => c.subtype === p.subtype);
                if (p?.tag)
                    rows = rows.filter((c) => c.tags.includes(p.tag));
                if (p?.group)
                    rows = rows.filter((c) => c.groups.includes(p.group));
                if (p?.favorite)
                    rows = rows.filter((c) => c.favorite);
                if (q)
                    rows = rows.filter((c) => [c.name, c.company, c.nickname, c.ico, ...c.emails.map((x) => x.value), ...c.phones.map((x) => x.value), ...c.tags].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q));
                /* the NEWER of same-named contacts gets the badge „newer“ (user) */ const byName = new Map();
                for (const c of rows) {
                    const k = c.name.toLowerCase();
                    if (!byName.has(k))
                        byName.set(k, []);
                    byName.get(k).push(c);
                }
                /* the badge goes WITH the told-apart contact (the newer of a kept pair) */ for (const g of byName.values())
                    if (g.length > 1)
                        for (const c of g)
                            if (c.disambiguation)
                                c.newer = true;
                return rows.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name, 'cs'));
            },
            /* export – only what the actor may read */
            async exportVcard(p, ctx) { const ids = Array.isArray(p?.ids) ? new Set(p.ids.map(String)) : null; const rows = (await all(ctx.actorId)).filter((r) => !ids || ids.has(r.id)); return { count: rows.length, text: rows.map((r) => vcard(r.data)).join('\r\n') }; },
            /* import – preview by default; duplicates (e-mail / phone / IČO) are skipped unless asked */
            async importVcard(p, ctx) {
                const items = parseVcards(String(p?.text || '')).map(normalize).filter((d) => d.name);
                const existing = new Map();
                for (const r of await all(ctx.actorId)) {
                    const d = normalize(r.data);
                    for (const k of keyset(d))
                        existing.set(k, { id: r.id, name: d.name });
                }
                const res = { total: items.length, created: [], duplicates: [], errors: [] };
                for (const d of items) {
                    const dup = keyset(d).map(k => existing.get(k)).find(Boolean);
                    if (dup && p?.includeDuplicates !== true) {
                        res.duplicates.push({ name: d.name, existing: dup });
                        continue;
                    }
                    if (p?.dryRun !== false) {
                        res.created.push({ name: d.name, preview: true });
                        continue;
                    }
                    try {
                        const c = await svc.save({ spaceId: p?.spaceId, data: d, allowInvalidIco: true }, ctx);
                        res.created.push({ name: c.name, id: c.id });
                        for (const k of keyset(d))
                            existing.set(k, { id: c.id, name: c.name });
                    }
                    catch (e) {
                        res.errors.push({ name: d.name, error: String(e?.message || e) });
                    }
                }
                return res;
            },
            /* duplicates with dates (created / updated, which is newer) – pairs marked „keep both“ are not offered again */
            async duplicates(p, ctx) {
                const ign = p?.includeIgnored === true ? new Set() : await ignored();
                const seen = new Map();
                const pairs = [];
                for (const r of await all(ctx.actorId)) {
                    const d = normalize(r.data);
                    for (const k of [...keyset(d), 'n:' + d.name.toLowerCase()]) {
                        const o = seen.get(k);
                        if (o && o.id !== r.id && !pairs.some(x => pairKey(x.a, x.b) === pairKey(o.id, r.id)) && !ign.has(pairKey(o.id, r.id))) {
                            const A = o.meta, B = meta(r); /* „newer“ = created later (an edit – e.g. adding „.1“ – must not make a record newer) */
                            const newer = String(B.created || B.updated || '') > String(A.created || A.updated || '') ? 'b' : 'a';
                            pairs.push({ a: o.id, b: r.id, why: k.split(':')[0] === 'n' ? 'NAME' : k.startsWith('e:') ? 'EMAIL' : k.startsWith('p:') ? 'PHONE' : 'ICO', aName: o.name, bName: d.name, aCreated: A.created, aUpdated: A.updated, bCreated: B.created, bUpdated: B.updated, newer });
                        }
                        else if (!o)
                            seen.set(k, { id: r.id, name: d.name, meta: meta(r) });
                    }
                }
                return pairs;
            },
            /* side by side before deciding: every field, same / different */
            async compare(p, ctx) {
                const a = await svc.get({ id: p?.a }, ctx), b = await svc.get({ id: p?.b }, ctx);
                const show = (c, k) => { const v = c[k]; if (Array.isArray(v))
                    return v.map((x) => typeof x === 'object' ? (x.value || x.url || [x.street, x.city].filter(Boolean).join(', ') || x.date || x.text || '') : x).filter(Boolean).join(' · '); return v == null ? '' : String(v); };
                const keys = ['name', 'kind', 'subtype', 'company', 'ico', 'position', 'phones', 'emails', 'addresses', 'websites', 'dates', 'tags', 'groups', 'notes'];
                const ra = await core.entities.get(a.id), rb = await core.entities.get(b.id);
                return { a: { id: a.id, name: a.name, ...meta(ra) }, b: { id: b.id, name: b.name, ...meta(rb) }, rows: keys.map(k => ({ field: k, a: show(a, k), b: show(b, k), same: show(a, k) === show(b, k) })) };
            },
            /* keep both – mark the pair as not a duplicate (stays in the core, both records untouched) */
            async keepBoth(p, ctx) {
                await svc.get({ id: p?.a }, ctx);
                await svc.get({ id: p?.b }, ctx);
                const old = await core.entities.get(IGN).catch(() => null);
                const pairs = new Set(old?.data?.pairs || []);
                pairs.add(pairKey(String(p.a), String(p.b)));
                const sp = ((await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'FAMILY') || (await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id;
                await core.entities.save({ id: IGN, type: 'CORE.CONTACT_DUPLICATE_IGNORE', ownerApp: OWNER, schema: 'KX.CONTACT_DUP_IGNORE/1', spaceIds: old ? old.spaceIds : [sp], expectedRevision: old?.revision, data: { pairs: [...pairs] } }, { ...ctx, appCode: OWNER }); /* same names → the NEWER one gets a disambiguation (the user's text, else the suggestion: a distinguishing detail or the next number) */
                const ra = await core.entities.get(String(p.a)), rb = await core.entities.get(String(p.b));
                let told = null;
                if (ra && rb && normalize(ra.data).name.toLowerCase() === normalize(rb.data).name.toLowerCase() && core.names) {
                    const newer = String(rb.createdAt || rb.updatedAt || '') > String(ra.createdAt || ra.updatedAt || '') ? rb : ra;
                    const v = String(p?.value || '').trim() || (await core.names.suggest({ id: newer.id }, ctx)).value;
                    told = await core.names.set({ id: newer.id, value: v }, ctx);
                }
                return { kept: true, disambiguated: told };
            },
            /* merge: keep A, take everything missing from B (lists united), archive B */
            async merge(p, ctx) {
                const A = await core.entities.get(String(p?.keepId || '')), B = await core.entities.get(String(p?.dropId || ''));
                if (!A || !B || A.type !== T || B.type !== T || A.id === B.id || !await readable(A, ctx.actorId) || !await readable(B, ctx.actorId))
                    throw new Error('CONTACT_NOT_FOUND');
                const a = normalize(A.data), b = normalize(B.data);
                const m = { ...a };
                for (const k of Object.keys(b))
                    if ((m[k] === '' || m[k] == null) && b[k] !== '' && b[k] != null)
                        m[k] = b[k];
                const uni = (x, y, key) => { const s = new Set(x.map(key)); return [...x, ...y.filter(z => !s.has(key(z)))]; };
                m.phones = uni(a.phones, b.phones, (z) => z.value);
                m.emails = uni(a.emails, b.emails, (z) => z.value);
                m.addresses = uni(a.addresses, b.addresses, (z) => z.street + '|' + z.city);
                m.websites = uni(a.websites, b.websites, (z) => z.url);
                m.dates = uni(a.dates, b.dates, (z) => z.kind + z.date);
                m.notes = [...a.notes, ...b.notes];
                m.tags = [...new Set([...a.tags, ...b.tags])];
                m.groups = [...new Set([...a.groups, ...b.groups])];
                const kept = await svc.save({ id: A.id, data: m }, ctx);
                await svc.archive({ id: B.id }, ctx);
                return kept;
            },
            /* „Můj profil“ – one contact per member, created on first use in their personal space */
            async myProfile(_p, ctx) {
                const me = ctx.actorId;
                for (const r of await all(me)) {
                    if (normalize(r.data).userId === me)
                        return view(r);
                }
                const u = (await core.memberships.listUsers()).find((x) => x.id === me);
                const parts = String(u?.displayName || me).split(/\s+/);
                return svc.save({ data: { kind: 'PERSON', firstName: parts[0], lastName: parts.slice(1).join(' '), userId: me } }, ctx);
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.CONTACT.GET', 'READ', (p, c) => svc.get(p, c));
        reg('ACTION.CORE.CONTACT.GIFTS', 'READ', (p, c) => svc.gifts(p, c));
        reg('ACTION.CORE.CONTACT.LIST', 'READ', (p, c) => svc.list(p, c));
        reg('ACTION.CORE.CONTACT.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c));
        reg('ACTION.CORE.CONTACT.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c));
        reg('ACTION.CORE.CONTACT.EXPORT_VCARD', 'READ', (p, c) => svc.exportVcard(p, c));
        reg('ACTION.CORE.CONTACT.IMPORT_VCARD', 'SAFE_WRITE', (p, c) => svc.importVcard(p, c));
        reg('ACTION.CORE.CONTACT.DUPLICATES', 'READ', (p, c) => svc.duplicates(p, c));
        reg('ACTION.CORE.CONTACT.COMPARE', 'READ', (p, c) => svc.compare(p, c));
        reg('ACTION.CORE.CONTACT.KEEP_BOTH', 'SAFE_WRITE', (p, c) => svc.keepBoth(p, c));
        reg('ACTION.CORE.CONTACT.MERGE', 'SAFE_WRITE', (p, c) => svc.merge(p, c));
        reg('ACTION.CORE.CONTACT.MY_PROFILE', 'SAFE_WRITE', (p, c) => svc.myProfile(p, c));
        reg('ACTION.CORE.CONTACT.CALENDAR_SYNC', 'SAFE_WRITE', (p, c) => svc.calendarSync(p, c));
        core.contacts = svc;
        return svc;
    }
    KXContacts = { REL_KINDS, REL_INVERSE, install, KINDS, SUBTYPES, COUNTRIES, localeCountry, icoValid, phone, network, normalize, displayName, vcard, parseVcards, nameDay };
    globalThis.KXContacts = KXContacts;
})();
