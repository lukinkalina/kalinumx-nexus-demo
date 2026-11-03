// N2.4m: reminders with several lead times – one set per event / task (record CORE.REMINDER_SET), each lead = one core alarm.
// Months / years are calendar-based (same day in an earlier month, clamped to its end). Yearly events re-arm for the next occurrence.
var KXReminders;
(function () {
    const T_SET = 'CORE.REMINDER_SET', OWNER = 'APP.KX.NEXUS';
    const LEADS = { AT: { min: 0 }, '15M': { min: 15 }, '1H': { min: 60 }, '3H': { min: 180 }, '1D': { min: 1440 }, '2D': { min: 2880 }, '1W': { min: 10080 }, '2W': { min: 20160 }, '3W': { min: 30240 }, '1M': { months: 1 }, '2M': { months: 2 }, '3M': { months: 3 }, '6M': { months: 6 }, '1Y': { months: 12 } };
    const ORDER = Object.keys(LEADS);
    const TEMPLATES = { BIRTHDAY: ['2M', '1M', '3W', '1W', '1D'], MEETING: ['1D', '1H'], TASK: ['1W', '1D', '3H'], CAMPAIGN: ['3M', '2M', '1M', '2W', '1W'], HOLIDAY: ['1M', '1W'] };
    const UNITS = { MIN: 1, HOUR: 60, DAY: 1440, WEEK: 10080 };
    /* same text lookup as the other modules (catalogue KXI18n.UI) */ const tl = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    function minusMonths(d, m) { const y = d.getUTCFullYear(), mo = d.getUTCMonth() - m, day = d.getUTCDate(); const t = new Date(Date.UTC(y, mo, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)); return t; }
    function triggerFor(startIso, lead) {
        const s = new Date(startIso);
        if (isNaN(+s))
            throw new Error('REMINDER_START_INVALID');
        if (lead.key) {
            const L = LEADS[lead.key];
            if (!L)
                throw new Error('REMINDER_LEAD_UNKNOWN');
            return L.months ? minusMonths(s, L.months).toISOString() : new Date(+s - (L.min || 0) * 60000).toISOString();
        }
        const a = Number(lead.amount);
        if (!(Number.isFinite(a) && a > 0 && a <= 1000))
            throw new Error('REMINDER_CUSTOM_INVALID');
        if (lead.unit === 'MONTH')
            return minusMonths(s, a).toISOString();
        if (lead.unit === 'YEAR')
            return minusMonths(s, a * 12).toISOString();
        const u = UNITS[String(lead.unit)];
        if (!u)
            throw new Error('REMINDER_CUSTOM_INVALID');
        return new Date(+s - a * u * 60000).toISOString();
    }
    /* next occurrence: a yearly event (FREQ=YEARLY) moves to the first anniversary not earlier than now */
    function occurrence(startIso, rule, nowIso) {
        if (!rule || !/FREQ=YEARLY/.test(rule))
            return startIso;
        const s = new Date(startIso), n = new Date(nowIso);
        let y = Math.max(s.getUTCFullYear(), n.getUTCFullYear());
        for (let i = 0; i < 3; i++) {
            const c = new Date(s);
            c.setUTCFullYear(y + i);
            if (+c >= +n)
                return c.toISOString();
        }
        return startIso;
    }
    /* N2.4o: rolling recurrence – the calendar does not expand rules, so a repeated event MOVES to its next occurrence when it is past.
       FREQ=WEEKLY / MONTHLY / YEARLY by the calendar; sourceEntityType DATE_RULE = a computed date (moving holidays, ad occasions) via a registered resolver */
    const DATE_RULES = {};
    function registerDateRule(prefix, resolver) { DATE_RULES[prefix] = resolver; }
    function stepFreq(iso, rule) {
        const d = new Date(iso);
        if (/FREQ=WEEKLY/.test(rule))
            return new Date(+d + 7 * 86400000).toISOString();
        if (/FREQ=MONTHLY/.test(rule)) {
            const day = d.getUTCDate();
            const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, d.getUTCHours(), d.getUTCMinutes()));
            t.setUTCDate(Math.min(day, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()));
            return t.toISOString();
        }
        if (/FREQ=YEARLY/.test(rule)) {
            const t = new Date(d);
            t.setUTCFullYear(d.getUTCFullYear() + 1);
            return t.toISOString();
        }
        return null;
    }
    function nextStart(e, todayIso) {
        const day = todayIso.slice(0, 10);
        if (e.startsAt.slice(0, 10) >= day)
            return null;
        if (e.sourceEntityType === 'DATE_RULE' && e.sourceEntityId) {
            const [prefix, ...rest] = String(e.sourceEntityId).split(':');
            const fn = DATE_RULES[prefix];
            if (!fn)
                return null;
            const d = fn(rest.join(':'), day);
            return d ? `${d}${e.startsAt.slice(10)}` : null;
        }
        /* N2.6b: richer rules (interval, weekdays, daily / hourly, until, count) – first occurrence on or after the day via the shared engine; simple rules keep the original path below */
        if (e.recurrenceRule && /INTERVAL=|BYDAY=|FREQ=(DAILY|HOURLY)|COUNT=|UNTIL=/.test(e.recurrenceRule) && globalThis.KXRecur) {
            return globalThis.KXRecur.next(e.recurrenceRule, e.startsAt, new Date(Date.parse(day + 'T00:00:00') - 1).toISOString());
        }
        /* monthly / yearly count from the ORIGINAL day (31. 1. → 28. 2. → 31. 3. …), never from the previous, shortened occurrence */
        if (e.recurrenceRule && /FREQ=(MONTHLY|YEARLY)/.test(e.recurrenceRule)) {
            const o = new Date(e.startsAt);
            const step = /FREQ=YEARLY/.test(e.recurrenceRule) ? 12 : 1;
            for (let k = step; k <= step * 600; k += step) {
                const t = new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth() + k, 1, o.getUTCHours(), o.getUTCMinutes(), o.getUTCSeconds()));
                t.setUTCDate(Math.min(o.getUTCDate(), new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()));
                const iso = t.toISOString();
                if (iso.slice(0, 10) >= day)
                    return iso;
            }
            return null;
        }
        if (e.recurrenceRule && /FREQ=WEEKLY/.test(e.recurrenceRule)) {
            let s = e.startsAt;
            for (let i = 0; i < 5000 && s.slice(0, 10) < day; i++) {
                const n = stepFreq(s, e.recurrenceRule);
                if (!n)
                    return null;
                s = n;
            }
            return s;
        }
        return null;
    }
    function leadLabel(l) { return l.key ? tl('rem.lead.' + l.key, l.key) : `${l.amount} ${tl('rem.unit.' + l.unit, String(l.unit).toLowerCase())}`; }
    class ReminderService {
        core;
        constructor(core) {
            this.core = core;
        }
        async target(t) {
            if (t?.kind === 'EVENT') {
                const e = (await this.core.calendar.list()).find((x) => x.id === t.id);
                if (!e)
                    throw new Error('REMINDER_TARGET_NOT_FOUND');
                return { start: e.startsAt, rule: e.recurrenceRule, title: e.title, spaceIds: e.spaceIds, ownerApp: e.ownerApp, ref: { eventId: e.id } };
            }
            if (t?.kind === 'TASK') {
                const k = (await this.core.tasks.list()).find((x) => x.id === t.id);
                if (!k)
                    throw new Error('REMINDER_TARGET_NOT_FOUND');
                if (!k.dueAt)
                    throw new Error('REMINDER_TASK_NO_DUE');
                return { start: k.dueAt, rule: undefined, title: k.title, spaceIds: k.spaceIds, ownerApp: k.ownerApp, ref: { taskId: k.id } };
            }
            throw new Error('REMINDER_TARGET_KIND');
        }
        async setRow(t) { return (await this.core.entities.list()).find((r) => r.type === T_SET && !r.archivedAt && r.data.targetKind === t.kind && r.data.targetId === t.id) || null; }
        async set(input, ctx, nowIso = new Date().toISOString()) {
            const t = input?.target;
            const tg = await this.target(t);
            const leads = [...new Set((input.leads || []).map(String))].filter(k => { if (!LEADS[k])
                throw new Error('REMINDER_LEAD_UNKNOWN'); return true; });
            const custom = (input.custom || []).map((c) => ({ amount: Number(c.amount), unit: String(c.unit) }));
            if (leads.length + custom.length > 12)
                throw new Error('REMINDER_TOO_MANY');
            const occ = occurrence(tg.start, tg.rule, nowIso);
            const old = await this.setRow(t);
            let cancelled = 0;
            for (const id of (old?.data.alarmIds || [])) {
                const a = await this.core.alarms.get(id);
                if (a && (a.status === 'SCHEDULED' || a.status === 'SNOOZED')) {
                    await this.core.alarms.save({ ...a, status: 'CANCELLED', expectedRevision: a.revision }, ctx);
                    cancelled++;
                }
            }
            /* longest lead first (2 months … 1 day) */ leads.sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a));
            const all = [...leads.map(k => ({ key: k })), ...custom];
            const alarmIds = [];
            const skipped = [];
            for (const l of all) {
                const at = triggerFor(occ, l);
                if (at <= nowIso) {
                    skipped.push(leadLabel(l));
                    continue;
                }
                const a = await this.core.alarms.save({ title: `${tg.title} – ${leadLabel(l)}`, ownerApp: tg.ownerApp || OWNER, spaceIds: tg.spaceIds, ...tg.ref, triggerAt: at, leadMinutes: Math.round((+new Date(occ) - +new Date(at)) / 60000), channels: input.channels || ['IN_APP'], deviceIds: [], status: 'SCHEDULED' }, ctx);
                alarmIds.push(a.id);
            }
            const data = { targetKind: t.kind, targetId: t.id, leads, custom, occurrence: occ, yearly: !!(tg.rule && /FREQ=YEARLY/.test(tg.rule)), alarmIds, template: input.template || null };
            const row = old ? await this.core.entities.save({ id: old.id, type: T_SET, ownerApp: OWNER, schema: 'KX.REMINDER_SET/1', spaceIds: old.spaceIds, expectedRevision: old.revision, data }, ctx) : await this.core.entities.save({ type: T_SET, ownerApp: OWNER, schema: 'KX.REMINDER_SET/1', spaceIds: tg.spaceIds, data }, ctx);
            return { setId: row.id, created: alarmIds.length, cancelled, skipped, occurrence: occ, summary: this.summary(data) };
        }
        summary(d) { const parts = [...(d.leads || []).map((k) => leadLabel({ key: k })), ...(d.custom || []).map(leadLabel)]; return parts.length ? `${parts.length} ${tl('rem.count', 'reminders')}: ${parts.join(' · ')}` : tl('rem.none', 'no reminders'); }
        async get(input) { const r = await this.setRow(input?.target); return r ? { ...r.data, summary: this.summary(r.data) } : { leads: [], custom: [], alarmIds: [], summary: this.summary({}) }; }
        /* N2.4o: move past repeated events to their next occurrence (duration kept) and re-plan their reminder set */
        async roll(ctx, nowIso = new Date().toISOString()) {
            let moved = 0;
            for (const e of (await this.core.calendar.list())) {
                if (e.archivedAt || e.status === 'CANCELLED')
                    continue;
                const ns = nextStart(e, nowIso);
                if (!ns || ns === e.startsAt)
                    continue;
                const dur = e.endsAt ? (+new Date(e.endsAt) - +new Date(e.startsAt)) : 0;
                await this.core.calendar.save({ ...e, startsAt: ns, endsAt: e.endsAt ? new Date(+new Date(ns) + dur).toISOString() : undefined, expectedRevision: e.revision }, ctx);
                moved++;
                const set = await this.setRow({ kind: 'EVENT', id: e.id });
                if (set && ((set.data.leads || []).length || (set.data.custom || []).length))
                    await this.set({ target: { kind: 'EVENT', id: e.id }, leads: set.data.leads, custom: set.data.custom, template: set.data.template }, ctx, nowIso);
            }
            return { moved };
        }
        /* yearly events: when every alarm of the set is past, plan the set again for the next occurrence */
        async rearm(ctx, nowIso = new Date().toISOString()) {
            const rolled = await this.roll(ctx, nowIso);
            let n = 0;
            for (const r of (await this.core.entities.list()).filter((x) => x.type === T_SET && !x.archivedAt && x.data.yearly)) {
                const al = await Promise.all((r.data.alarmIds || []).map((id) => this.core.alarms.get(id)));
                if (al.some((a) => a && (a.status === 'SCHEDULED' || a.status === 'SNOOZED') && a.triggerAt > nowIso))
                    continue;
                if (r.data.occurrence > nowIso)
                    continue;
                await this.set({ target: { kind: r.data.targetKind, id: r.data.targetId }, leads: r.data.leads, custom: r.data.custom, template: r.data.template }, ctx, nowIso);
                n++;
            }
            return { rearmed: n, moved: rolled.moved };
        }
    }
    function install(core) {
        if (core.reminders)
            return core.reminders;
        const svc = new ReminderService(core);
        core.reminders = svc;
        for (const [code, risk, fn] of [['ACTION.CORE.REMINDERS.SET', 'SAFE_WRITE', (p, c) => svc.set(p, c)], ['ACTION.CORE.REMINDERS.GET', 'READ', (p) => svc.get(p)], ['ACTION.CORE.REMINDERS.REARM', 'SAFE_WRITE', (_p, c) => svc.rearm(c)]]) {
            try {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
            }
            catch (e) { /* already registered */ }
        }
        return svc;
    }
    KXReminders = { install, LEADS, ORDER, TEMPLATES, triggerFor, occurrence, minusMonths, leadLabel, registerDateRule, nextStart, stepFreq };
    globalThis.KXReminders = KXReminders;
})();
/* N2.6b (user: custom repeat schedules everywhere) – ONE shared recurrence engine for calendar, hub deadlines and planned payments.
   Standard calendar rules (RFC 5545 subset): FREQ=HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY;INTERVAL=n;BYDAY=MO,TU,…;UNTIL=YYYYMMDD;COUNT=n. Local time; month ends clamp (31 Jan + 1 month = 28/29 Feb). */
var KXRecur;
(function () {
    const FREQS = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
    function parse(rule) {
        const r = String(rule || '').trim().replace(/^RRULE:/i, '');
        if (!r)
            return null;
        const o = { freq: '', interval: 1, byday: [] };
        for (const part of r.split(';')) {
            const [k, v] = part.split('=');
            const K = String(k || '').toUpperCase(), V = String(v || '').toUpperCase();
            if (K === 'FREQ' && FREQS.includes(V))
                o.freq = V;
            else if (K === 'INTERVAL') {
                const n = parseInt(V, 10);
                if (n >= 1 && n <= 999)
                    o.interval = n;
            }
            else if (K === 'BYDAY')
                o.byday = V.split(',').map(x => x.replace(/^[+-]?\d+/, '')).filter(x => DAYS.includes(x));
            else if (K === 'UNTIL' && /^\d{8}/.test(V))
                o.until = `${V.slice(0, 4)}-${V.slice(4, 6)}-${V.slice(6, 8)}`;
            else if (K === 'COUNT') {
                const n = parseInt(V, 10);
                if (n >= 1 && n <= 9999)
                    o.count = n;
            }
        }
        if (!o.freq)
            return null;
        o.byday = DAYS.filter(d => o.byday.includes(d));
        return o;
    }
    function build(o) {
        if (!o || !FREQS.includes(o.freq))
            return '';
        const a = [`FREQ=${o.freq}`];
        const n = Math.max(1, Math.min(999, parseInt(o.interval, 10) || 1));
        if (n > 1)
            a.push(`INTERVAL=${n}`);
        const bd = DAYS.filter(d => (o.byday || []).includes(d));
        if (bd.length && (o.freq === 'WEEKLY' || o.freq === 'DAILY'))
            a.push(`BYDAY=${bd.join(',')}`);
        if (o.until && /^\d{4}-\d{2}-\d{2}$/.test(o.until))
            a.push(`UNTIL=${o.until.replace(/-/g, '')}`);
        else if (o.count)
            a.push(`COUNT=${Math.max(1, Math.min(9999, parseInt(o.count, 10) || 1))}`);
        return a.join(';');
    }
    const dim = (y, m) => new Date(y, m + 1, 0).getDate();
    const dow = (d) => DAYS[(d.getDay() + 6) % 7];
    function addMonths(a, k) { const y = a.getFullYear(), m = a.getMonth() + k; const Y = y + Math.floor(m / 12), M = ((m % 12) + 12) % 12; const d = new Date(a); d.setFullYear(Y, M, Math.min(a.getDate(), dim(Y, M))); return d; }
    /* generator of occurrences from the anchor (inclusive), in order */
    function* gen(o, anchor) {
        const n = o.interval || 1;
        let emitted = 0;
        const untilEnd = o.until ? new Date(`${o.until}T23:59:59`) : null;
        const ok = (d) => { if (untilEnd && d > untilEnd)
            return false; if (o.count && emitted >= o.count)
            return false; return true; };
        if (o.freq === 'WEEKLY' && o.byday.length) {
            const ws = new Date(anchor);
            ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
            for (let w = 0; w < 5200; w++) {
                for (const dd of o.byday) {
                    const d = new Date(ws);
                    d.setDate(ws.getDate() + w * 7 * n + DAYS.indexOf(dd));
                    if (d < anchor)
                        continue;
                    if (!ok(d))
                        return;
                    emitted++;
                    yield d;
                }
            }
            return;
        }
        for (let k = 0; k < 100000; k++) {
            let d;
            if (o.freq === 'HOURLY')
                d = new Date(anchor.getTime() + k * n * 3600000);
            else if (o.freq === 'DAILY') {
                d = new Date(anchor);
                d.setDate(anchor.getDate() + k * n);
            }
            else if (o.freq === 'WEEKLY') {
                d = new Date(anchor);
                d.setDate(anchor.getDate() + k * 7 * n);
            }
            else if (o.freq === 'MONTHLY')
                d = addMonths(anchor, k * n);
            else
                d = addMonths(anchor, k * 12 * n);
            if (o.freq === 'DAILY' && o.byday.length && !o.byday.includes(dow(d)))
                continue;
            if (!ok(d))
                return;
            emitted++;
            yield d;
        }
    }
    function next(rule, anchorIso, afterIso) {
        const o = typeof rule === 'string' ? parse(rule) : rule;
        const a = new Date(anchorIso);
        if (!o || isNaN(a.getTime()))
            return null;
        const after = afterIso ? new Date(afterIso) : new Date(a.getTime() - 1);
        for (const d of gen(o, a)) {
            if (d > after)
                return d.toISOString();
        }
        return null;
    }
    function occurrences(rule, anchorIso, fromIso, toIso, max = 500) {
        const o = typeof rule === 'string' ? parse(rule) : rule;
        const a = new Date(anchorIso);
        if (!o || isNaN(a.getTime()))
            return [];
        const f = new Date(fromIso), t = new Date(toIso);
        const out = [];
        for (const d of gen(o, a)) {
            if (d > t || out.length >= max)
                break;
            if (d >= f)
                out.push(d.toISOString());
        }
        return out;
    }
    /* words come from the app catalogue (globalThis.KXRecurWords, set by the shell from TL); English fallback only – no hard-coded Czech here */
    const EN_W = { once: 'Once', one: { HOURLY: 'Every hour', DAILY: 'Every day', WEEKLY: 'Every week', MONTHLY: 'Every month', YEARLY: 'Every year' }, few: 'Every {n} {u}', many: 'Every {n} {u}',
        units: { HOURLY: ['hour', 'hours', 'hours'], DAILY: ['day', 'days', 'days'], WEEKLY: ['week', 'weeks', 'weeks'], MONTHLY: ['month', 'months', 'months'], YEARLY: ['year', 'years', 'years'] }, days: { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }, on: ' on {d}', until: ', until {d}', times: ', {n} times' };
    function describe(rule, lang = 'cs') {
        const W = (lang !== 'en' && globalThis.KXRecurWords) || EN_W;
        const o = typeof rule === 'string' ? parse(rule) : rule;
        if (!o)
            return W.once;
        const n = o.interval || 1;
        let t = n === 1 ? W.one[o.freq] : String(n >= 2 && n <= 4 ? W.few : W.many).replace('{n}', String(n)).replace('{u}', W.units[o.freq][n >= 2 && n <= 4 ? 1 : 2]);
        if (o.byday.length)
            t += String(W.on).replace('{d}', o.byday.map((d) => W.days[d]).join(', '));
        if (o.until) {
            const [y, m, d] = o.until.split('-');
            t += String(W.until).replace('{d}', lang === 'en' ? o.until : `${+d}. ${+m}. ${y}`);
        }
        else if (o.count)
            t += String(W.times).replace('{n}', String(o.count));
        return t;
    }
    KXRecur = { parse, build, next, occurrences, describe, FREQS, DAYS };
})();
