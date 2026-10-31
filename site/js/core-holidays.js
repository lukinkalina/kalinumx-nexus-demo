// N2.4m: holidays layer – Czech public holidays per Act 245/2000 Sb. (as amended up to 59/2026 Sb., verified 2026-10-21),
// Easter-based days by the Gregorian computus, verified significant days, customary days marked as custom (not law).
// Name days: NOT included until taken from a verified list (no data from memory).
var KXHolidays;
(function () {
    const LAW = '245/2000 Sb. (59/2026 Sb.)';
    /* N2.4m: countries – a country is offered with data only when its source is verified; the others are listed as „in preparation“ */
    const COUNTRIES = { CZ: { verified: true, source: 'Act 245/2000 Sb. as amended by 59/2026 Sb. (Collection of Laws, e-Sbirka / PSP)', verifiedAt: '2026-10-21' }, SK: { verified: false }, DE: { verified: false }, AT: { verified: false }, PL: { verified: false }, GB: { verified: false }, US: { verified: false } };
    const KINDS = ['STATE', 'OTHER', 'SIGNIFICANT', 'CUSTOM', 'NAMEDAY'];
    const NAMEDAY_CALENDARS = { CZ: { verified: true, source: 'publisher calendar (no official list): calendar.center + finmag.cz / penize.cz, 2026-10-22' }, SK: { verified: false }, PL: { verified: false }, DE: { verified: false }, HU: { verified: false } };
    const tl = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    /* Anonymous Gregorian algorithm (Meeus / Jones / Butcher) → Easter Sunday */
    function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(y, month - 1, day)); }
    const iso = (d) => d.toISOString().slice(0, 10);
    const add = (d, n) => new Date(+d + n * 86400000);
    /* n-th weekday (0 = Sunday) of a month */
    function nthWeekday(y, month, weekday, n) { const d = new Date(Date.UTC(y, month - 1, 1)); const shift = (weekday - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, month - 1, 1 + shift + (n - 1) * 7)); }
    const FIXED = [
        ['01-01', 'STATE', 'cz.h.0101s', 'Restoration Day of the Independent Czech State'], ['01-01', 'OTHER', 'cz.h.0101o', 'New Year\'s Day'], ['05-01', 'OTHER', 'cz.h.0501', 'Labour Day'], ['05-08', 'STATE', 'cz.h.0508', 'Victory Day'],
        ['07-05', 'STATE', 'cz.h.0705', 'Saints Cyril and Methodius Day'], ['07-06', 'STATE', 'cz.h.0706', 'Jan Hus Day'], ['09-28', 'STATE', 'cz.h.0928', 'Czech Statehood Day'],
        ['10-28', 'STATE', 'cz.h.1028', 'Independent Czechoslovak State Day'], ['11-17', 'STATE', 'cz.h.1117', 'Struggle for Freedom and Democracy Day'],
        ['12-24', 'OTHER', 'cz.h.1224', 'Christmas Eve'], ['12-25', 'OTHER', 'cz.h.1225', 'Christmas Day'], ['12-26', 'OTHER', 'cz.h.1226', 'St. Stephen\'s Day'],
        ['03-30', 'SIGNIFICANT', 'cz.s.0330', 'Czech Flag Day']
    ];
    const CUSTOM = [['02-14', 'cz.c.0214', 'Valentine\'s Day'], ['10-31', 'cz.c.1031', 'Halloween'], ['12-05', 'cz.c.1205', 'St. Nicholas (eve)']];
    function forYear(y, country = 'CZ') {
        if (!COUNTRIES[country]?.verified)
            return [];
        const out = [];
        for (const [md, kind, key, fb] of FIXED)
            out.push({ date: `${y}-${md}`, name: tl(key, fb), kind, dayOff: kind !== 'SIGNIFICANT', source: LAW, verified: true });
        const e = easter(y);
        out.push({ date: iso(add(e, -2)), name: tl('cz.h.goodfriday', 'Good Friday'), kind: 'OTHER', dayOff: true, source: LAW, verified: true });
        out.push({ date: iso(add(e, 1)), name: tl('cz.h.eastermonday', 'Easter Monday'), kind: 'OTHER', dayOff: true, source: LAW, verified: true });
        out.push({ date: iso(e), name: tl('cz.c.easter', 'Easter Sunday'), kind: 'CUSTOM', dayOff: false, source: 'EASTER', verified: true });
        out.push({ date: iso(nthWeekday(y, 5, 0, 2)), name: tl('cz.c.mothers', 'Mother\'s Day'), kind: 'CUSTOM', dayOff: false, source: 'CUSTOM_RULE', verified: false });
        out.push({ date: iso(nthWeekday(y, 6, 0, 3)), name: tl('cz.c.fathers', 'Father\'s Day'), kind: 'CUSTOM', dayOff: false, source: 'CUSTOM_RULE', verified: false });
        for (const [md, key, fb] of CUSTOM)
            out.push({ date: `${y}-${md}`, name: tl(key, fb), kind: 'CUSTOM', dayOff: false, source: 'CUSTOM', verified: false });
        for (const h of out)
            h.country = country;
        return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'STATE' ? -1 : 1));
    }
    /* the user's choice: several countries and kinds at once */
    function chosen(y, countries = ['CZ'], kinds = KINDS, calendars = []) { return [...countries.flatMap(c => forYear(y, c)), ...(kinds.includes('NAMEDAY') ? namedays(y, calendars) : [])].filter((h) => kinds.includes(h.kind)).sort((a, b) => a.date.localeCompare(b.date) || String(a.country).localeCompare(String(b.country))); }
    /* name days by nationality (kind NAMEDAY, country = calendar code); only verified calendars have data */
    function namedays(y, calendars = ['CZ']) {
        const out = [];
        for (const c of calendars) {
            if (!NAMEDAY_CALENDARS[c]?.verified)
                continue;
            const data = globalThis['KXNameDays' + c];
            if (!data)
                continue;
            data.months.forEach((m, mi) => m.forEach((n, di) => { if (!n)
                return; if (mi === 1 && di === 28 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)))
                return; out.push({ date: `${y}-${String(mi + 1).padStart(2, '0')}-${String(di + 1).padStart(2, '0')}`, name: n, kind: 'NAMEDAY', country: c, dayOff: false, source: data.source, verified: true }); }));
        }
        return out;
    }
    function between(fromIso, toIso, country = 'CZ') { const y1 = +fromIso.slice(0, 4), y2 = +toIso.slice(0, 4); const out = []; for (let y = y1; y <= y2; y++)
        out.push(...forYear(y, country).filter((h) => h.date >= fromIso.slice(0, 10) && h.date <= toIso.slice(0, 10))); return out; }
    function search(q, y, country = 'CZ', calendars = []) { const n = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const qq = n(q); return [...forYear(y, country), ...namedays(y, calendars)].filter((h) => n(h.name).includes(qq)); }
    /* N2.4o: date rule for the rolling recurrence – HOL:<country>:<name> → the next date of the same holiday */
    function nextDate(id, fromIso) { const [country, ...n] = id.split(':'); const name = n.join(':'); const y = +fromIso.slice(0, 4); for (const yy of [y, y + 1]) {
        const h = [...forYear(yy, country), ...namedays(yy, [country])].find((x) => (x.name === name || (x.kind === 'NAMEDAY' && String(x.name).split(/\s*,\s*/).includes(name))) && x.date >= fromIso.slice(0, 10));
        if (h)
            return h.date;
    } return null; } /* N2.4x: a name day shared by several names („Iveta, Slavoj“) matches each name */
    try {
        globalThis.KXReminders?.registerDateRule('HOL', nextDate);
    }
    catch { }
    KXHolidays = { nextDate, easter, nthWeekday, forYear, namedays, chosen, between, search, LAW, COUNTRIES, KINDS, NAMEDAY_CALENDARS };
    globalThis.KXHolidays = KXHolidays;
})();
