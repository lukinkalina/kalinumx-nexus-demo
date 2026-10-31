// N2.4x: name days of MY people – a pasted list („Helena, Lukáš, Barča …“) → each name resolved in the name-day calendar
// (nicknames mapped, ambiguous ones never guessed), yearly rolling events „Svátek: …“ with reminders, pending names kept
// („Čekající“ – e.g. a name that is not in the calendar until the user gives a date). Stored per user (setting), never in the app.
var KXMyNameDays;
(function () {
    const NICK = { 'barca': 'Barbora', 'bara': 'Barbora', 'barunka': 'Barbora', 'tonda': 'Antonín', 'tonik': 'Antonín', 'lada': 'Ladislav', 'jarda': 'Jaroslav', 'verca': 'Veronika', 'helca': 'Helena', 'janca': 'Jana', 'luky': 'Lukáš', 'misa': ['Michaela', 'Michal'], 'pepa': 'Josef', 'honza': 'Jan', 'franta': 'František', 'kuba': 'Jakub', 'vasek': 'Václav', 'zuzka': 'Zuzana', 'peta': ['Petra', 'Petr'], 'saša': ['Alexandra', 'Alexandr'] };
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    function parse(text) { return String(text || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).filter((x, i, a) => a.findIndex(y => norm(y) === norm(x)) === i).slice(0, 200); }
    /* one name → {input,name,date(MM-DD)|null,status:OK|PENDING_NO_DATE|AMBIGUOUS,options?} */
    function resolve(input, year = new Date().getFullYear()) {
        const H = globalThis.KXHolidays;
        const n = norm(input);
        const nick = NICK[n];
        if (Array.isArray(nick))
            return { input, name: null, date: null, status: 'AMBIGUOUS', options: nick };
        const want = nick || input.trim();
        const nd = H ? H.namedays(year, ['CZ']) : [];
        const hit = nd.find((x) => String(x.name).split(/\s*,\s*/).some((t) => norm(t) === norm(want)));
        if (!hit)
            return { input, name: want.charAt(0).toUpperCase() + want.slice(1), date: null, status: 'PENDING_NO_DATE' };
        const exact = String(hit.name).split(/\s*,\s*/).find((t) => norm(t) === norm(want));
        return { input, name: exact, date: hit.date.slice(5), status: 'OK' };
    }
    /* a missing comma („iveta ladislav“): split only when EVERY word is a name of its own in the calendar */
    function smartParse(text, year = new Date().getFullYear()) { const out = []; for (const t of parse(text)) {
        const w = t.split(/\s+/).filter(Boolean);
        if (w.length > 1 && w.every(x => resolve(x, year).status === 'OK'))
            out.push(...w);
        else
            out.push(t);
    } return out.filter((x, i, a) => a.findIndex(y => norm(y) === norm(x)) === i); }
    const IT = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    function install(core) {
        if (core.myNameDays)
            return core.myNameDays;
        const svc = {
            /* create (or keep) one rolling yearly event per resolved name; pending names returned for „Čekající“; idempotent */
            async apply(entries, ctx, opts = {}) {
                const sp = (await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL');
                if (!sp)
                    throw new Error('MYNAMEDAYS_NO_SPACE');
                const existing = (await core.calendar.list()).filter((e) => !e.archivedAt && e.sourceEntityType === 'DATE_RULE' && String(e.sourceEntityId || '').startsWith('HOL:CZ:'));
                const out = { created: 0, kept: 0, pending: [] };
                const H = globalThis.KXHolidays;
                const today = (opts.today || new Date().toISOString()).slice(0, 10);
                for (const e of entries) {
                    if (e.status !== 'OK' || !e.name) {
                        out.pending.push(e);
                        continue;
                    }
                    const rule = `HOL:CZ:${e.name}`;
                    if (existing.some((x) => x.sourceEntityId === rule)) {
                        out.kept++;
                        continue;
                    }
                    const next = H.nextDate(`CZ:${e.name}`, today);
                    if (!next) {
                        out.pending.push({ ...e, status: 'PENDING_NO_DATE' });
                        continue;
                    }
                    const ev = await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: `${opts.prefix || globalThis.KXI18n?.UI?.['hol.eventPrefix']?.cs || 'Name day'}: ${e.name}`, ownerApp: 'APP.NEXUS', spaceIds: [sp.id], startsAt: `${next}T08:00:00.000Z`, allDay: true, attendeeIds: [], status: 'CONFIRMED', sourceEntityType: 'DATE_RULE', sourceEntityId: rule }, { ...ctx, permissions: ['CORE.CALENDAR.EDIT'] });
                    try {
                        if (core.reminders)
                            await core.actions.invoke('ACTION.CORE.REMINDERS.SET', { target: { kind: 'EVENT', id: ev.id }, leads: ['1D', 'AT'], template: 'HOLIDAY' }, { ...ctx, permissions: ['CORE.CALENDAR.EDIT', 'CORE.ALARM.EDIT'] });
                    }
                    catch { }
                    out.created++;
                }
                /* N2.4y: pending names into „K zatřídění“ (once per name) */
                if (core.inbox)
                    for (const e of out.pending) {
                        try {
                            await core.inbox.add({ key: `MYNAMEDAYS:${String(e.name || e.input)}`, source: 'MISSING_DATA', reason: 'MISSING_DATA', title: IT('inbox.t.nameday', { name: e.name || e.input }), text: e.status === 'AMBIGUOUS' ? IT('inbox.x.namedayAmbiguous', { input: e.input, options: (e.options || []).join(' / ') }) : IT('inbox.x.nameday', { input: e.input }), target: { hub: 'APP.NEXUS', actionCode: null, payload: { input: e.input } } }, ctx);
                        }
                        catch { }
                    }
                return out;
            },
            /* names of my people who celebrate on the given day */
            todays(entries, dateIso) { const md = dateIso.slice(5, 10); return entries.filter((e) => e.status === 'OK' && e.date === md).map((e) => e.name); }
        };
        core.myNameDays = svc;
        return svc;
    }
    KXMyNameDays = { NICK, parse, smartParse, resolve, install, norm };
    globalThis.KXMyNameDays = KXMyNameDays;
})();
