// N2.5v (user): IMPORT of calendar files (.ics, RFC 5545) – events with time zones (TZID via Intl), all-day, UTC and floating times,
// VALARM → NEXUS reminders (custom lead in minutes / hours / days / weeks, AT), simple RRULE (daily / weekly / monthly / yearly),
// location kept in the description; preview (dryRun), duplicates (same title + start) skipped – nothing is overwritten.
var KXICal;
(function () {
    const unesc = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    /* offset (minutes) of a time zone at a given UTC instant – via Intl (no library) */
    function tzOffset(tz, utcMs) {
        try {
            const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const p = {};
            for (const x of f.formatToParts(new Date(utcMs)))
                p[x.type] = x.value;
            const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
            return (asUtc - utcMs) / 60000;
        }
        catch {
            return null;
        }
    }
    /* DTSTART / DTEND value → ISO (UTC) + allDay */
    function toIso(value, params) {
        const v = String(value || '').trim();
        if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
            const y = +v.slice(0, 4), m = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
            return { iso: new Date(y, m, d, 0, 0, 0).toISOString(), allDay: true };
        }
        const mt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
        if (!mt)
            throw new Error('ICAL_DATE:' + v);
        const [y, mo, d, h, mi, s] = [+mt[1], +mt[2] - 1, +mt[3], +mt[4], +mt[5], +(mt[6] || 0)];
        if (mt[7])
            return { iso: new Date(Date.UTC(y, mo, d, h, mi, s)).toISOString(), allDay: false };
        if (params.TZID) {
            const guess = Date.UTC(y, mo, d, h, mi, s);
            let off = tzOffset(params.TZID, guess);
            if (off === null)
                return { iso: new Date(y, mo, d, h, mi, s).toISOString(), allDay: false, tzUnknown: params.TZID };
            let t = guess - off * 60000;
            const off2 = tzOffset(params.TZID, t);
            if (off2 !== null && off2 !== off)
                t = guess - off2 * 60000;
            return { iso: new Date(t).toISOString(), allDay: false };
        }
        return { iso: new Date(y, mo, d, h, mi, s).toISOString(), allDay: false };
    }
    /* -P30D / -PT15M / -P1W / -P1DT2H → minutes before (positive); null if not a relative trigger */
    function triggerMinutes(v) {
        const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
        if (!m)
            return null;
        const min = (+(m[2] || 0)) * 10080 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0)) + Math.round((+(m[6] || 0)) / 60);
        return m[1] === '+' ? -min : min;
    }
    const leadOf = (min) => min <= 0 ? { lead: 'AT' } : min % 10080 === 0 ? { custom: { amount: min / 10080, unit: 'WEEK' } } : min % 1440 === 0 ? { custom: { amount: min / 1440, unit: 'DAY' } } : min % 60 === 0 ? { custom: { amount: min / 60, unit: 'HOUR' } } : { custom: { amount: min, unit: 'MIN' } };
    const RR = { DAILY: 'FREQ=DAILY', WEEKLY: 'FREQ=WEEKLY', MONTHLY: 'FREQ=MONTHLY', YEARLY: 'FREQ=YEARLY' };
    function parse(text) {
        const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        const lines = [];
        for (const l of raw) {
            if (/^[ \t]/.test(l) && lines.length)
                lines[lines.length - 1] += l.slice(1);
            else if (l.trim())
                lines.push(l);
        }
        if (!lines.some(l => /^BEGIN:VCALENDAR/i.test(l)))
            throw new Error('ICAL_NOT_CALENDAR');
        const events = [], errors = [];
        let ev = null, alarm = null;
        for (const l of lines) {
            const i = l.indexOf(':');
            if (i < 0)
                continue;
            const head = l.slice(0, i), value = l.slice(i + 1);
            const [name, ...ps] = head.split(';');
            const N = name.toUpperCase();
            const params = {};
            for (const p of ps) {
                const [k, v] = p.split('=');
                params[String(k).toUpperCase()] = String(v || '').replace(/^"|"$/g, '');
            }
            if (N === 'BEGIN' && /^VEVENT$/i.test(value)) {
                ev = { alarms: [], raw: {} };
                continue;
            }
            if (N === 'BEGIN' && /^VALARM$/i.test(value) && ev) {
                alarm = {};
                continue;
            }
            if (N === 'END' && /^VALARM$/i.test(value) && ev && alarm) {
                if (alarm.min != null)
                    ev.alarms.push(alarm.min);
                alarm = null;
                continue;
            }
            if (N === 'END' && /^VEVENT$/i.test(value) && ev) {
                try {
                    if (!ev.dtstart)
                        throw new Error('ICAL_NO_START');
                    const st = toIso(ev.dtstart.v, ev.dtstart.p);
                    let en = ev.dtend ? toIso(ev.dtend.v, ev.dtend.p) : null;
                    if (!en && ev.duration) {
                        const dm = triggerMinutes('-' + ev.duration);
                        if (dm != null)
                            en = { iso: new Date(Date.parse(st.iso) + dm * 60000).toISOString() };
                    }
                    const rr = ev.rrule ? (/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.exec(ev.rrule) || [])[1] : null;
                    events.push({ uid: ev.uid || null, title: unesc(ev.summary || '').trim() || '—', description: unesc(ev.description || ''), location: unesc(ev.location || ''), startsAt: st.iso, endsAt: en?.iso || new Date(Date.parse(st.iso) + (st.allDay ? 86400000 : 3600000)).toISOString(), allDay: !!st.allDay,
                        recurrenceRule: rr ? RR[rr.toUpperCase()] : undefined, rruleRaw: ev.rrule || null, rruleSimplified: !!ev.rrule && !/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)$/i.test(String(ev.rrule).trim()), alarms: [...new Set(ev.alarms)].sort((a, b) => b - a), tzUnknown: st.tzUnknown || null });
                }
                catch (e) {
                    errors.push({ title: unesc(ev.summary || ''), error: String(e?.message || e) });
                }
                ev = null;
                continue;
            }
            if (alarm) {
                if (N === 'TRIGGER' && !params.VALUE) {
                    const m = triggerMinutes(value);
                    if (m != null)
                        alarm.min = m;
                }
                continue;
            }
            if (!ev)
                continue;
            if (N === 'SUMMARY')
                ev.summary = value;
            else if (N === 'DESCRIPTION')
                ev.description = value;
            else if (N === 'LOCATION')
                ev.location = value;
            else if (N === 'UID')
                ev.uid = value;
            else if (N === 'DTSTART')
                ev.dtstart = { v: value, p: params };
            else if (N === 'DTEND')
                ev.dtend = { v: value, p: params };
            else if (N === 'DURATION')
                ev.duration = value;
            else if (N === 'RRULE')
                ev.rrule = value;
        }
        return { events, errors };
    }
    function install(core) {
        if (core.ical)
            return core.ical;
        const svc = { parse, toIso, triggerMinutes, leadOf,
            async importText(p, ctx) {
                const { events, errors } = parse(String(p?.text || ''));
                const spaceIds = Array.isArray(p?.spaceIds) && p.spaceIds.length ? p.spaceIds : [];
                if (!spaceIds.length)
                    throw new Error('ICAL_SPACE_REQUIRED');
                const ownerApp = String(p?.ownerApp || 'APP.NEXUS');
                const existing = await core.calendar.list().catch(() => []);
                const key = (t, s) => `${String(t).trim().toLowerCase()}|${s}`;
                const have = new Set(existing.filter((x) => !x.archivedAt).map((x) => key(x.title, x.startsAt)));
                const out = { events: events.length, created: [], duplicates: [], errors, dryRun: p?.dryRun === true };
                for (const e of events) {
                    if (have.has(key(e.title, e.startsAt))) {
                        out.duplicates.push({ title: e.title, startsAt: e.startsAt });
                        continue;
                    }
                    if (out.dryRun) {
                        out.created.push({ title: e.title, startsAt: e.startsAt, allDay: e.allDay, alarms: e.alarms, recurrence: e.recurrenceRule || null });
                        continue;
                    }
                    const desc = [e.location ? `📍 ${e.location}` : '', e.description].filter(Boolean).join('\n').slice(0, 4000);
                    const ev = await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: e.title.slice(0, 200), description: desc || undefined, ownerApp, spaceIds, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, recurrenceRule: e.recurrenceRule }, { ...ctx, permissions: [...(ctx.permissions || []), 'CORE.CALENDAR.EDIT'] });
                    if (e.alarms.length && core.reminders) {
                        const leads = [];
                        const custom = [];
                        for (const m of e.alarms.slice(0, 12)) {
                            const l = leadOf(m);
                            if (l.lead)
                                leads.push(l.lead);
                            else
                                custom.push(l.custom);
                        }
                        try {
                            await core.actions.invoke('ACTION.CORE.REMINDERS.SET', { target: { kind: 'EVENT', id: ev.id }, leads, custom }, { ...ctx, permissions: [...(ctx.permissions || []), 'CORE.CALENDAR.EDIT', 'CORE.ALARM.EDIT'] });
                        }
                        catch (x) {
                            out.errors.push({ title: e.title, error: 'REMINDER:' + String(x?.message || x) });
                        }
                    }
                    have.add(key(e.title, e.startsAt));
                    out.created.push({ id: ev.id, title: e.title, startsAt: e.startsAt, alarms: e.alarms });
                }
                return out;
            } };
        try {
            core.actions.register({ code: 'ACTION.CORE.CALENDAR.IMPORT_ICS', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', handler: (p, c) => svc.importText(p, c) });
        }
        catch { }
        core.ical = svc;
        return svc;
    }
    KXICal = { parse, toIso, triggerMinutes, leadOf, install };
    globalThis.KXICal = KXICal;
})();
