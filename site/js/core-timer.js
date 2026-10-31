// N2.1s (R42): CORE.TIMER — one stopwatch / countdown core for LASER, TrackWork and every hub (KX.CORE_TIMER/1).
//  - a timer is a Core entity with SEGMENTS of real timestamps (start/end); elapsed time is always computed from them,
//    so it survives a crash, reload or app restart (no running counter in memory);
//  - several timers can run at once, each optionally bound to a record (project, test, import, step, task…);
//  - laps with notes, manual corrections with a mandatory reason (audited), countdowns (EXPIRED when time is up);
//  - a timer runs on ONE device; other devices see it; resuming elsewhere needs an explicit takeover;
//  - a running segment longer than SUSPICIOUS_MS is flagged (computer slept / forgotten timer) instead of trusted blindly;
//  - STOP publishes a time entry (CORE.TIME.ENTRY: minutes, interval, optional rate -> cost) for reports and finance,
//    and the time stays visible on the record (summary per record);
//  - TRANSFER moves (part of) the measured time to another record — the source gets a negative correction, the target
//    a new stopped timer with the same amount; nothing disappears.
var KXTimer;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_TIMER/1', TYPE = 'CORE.TIMER', ENTRY = 'CORE.TIME.ENTRY', SUSPICIOUS_MS = 12 * 3600000, MAX_MS = 7 * 24 * 3600000;
    const KINDS = ['ENTITY', 'TASK', 'CALENDAR_EVENT', 'FILE', 'DOCUMENT'];
    const STORE = { ENTITY: 'entities', TASK: 'tasks', CALENDAR_EVENT: 'calendarEvents', FILE: 'files', DOCUMENT: 'documents' };
    const fmt = (ms) => { const neg = ms < 0; ms = Math.abs(Math.round(ms)); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (neg ? '-' : '') + (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };
    class TimerService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        device(ctx) { return (typeof this.opts.deviceId === 'function' ? this.opts.deviceId() : this.opts.deviceId) || ctx?.deviceId || null; }
        iso(t) { return new Date(t).toISOString(); }
        async space(ctx, target) {
            if (target) {
                const row = await this.core.repository.get(STORE[target.kind], target.id);
                if (row?.spaceIds?.length)
                    return row.spaceIds;
            }
            const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === ctx.actorId && !x.archivedAt);
            if (!s)
                throw new Error('TIMER_NO_PERSONAL_SPACE');
            return [s.id];
        }
        async checkTarget(t, actorId) {
            if (t == null)
                return null;
            if (!KINDS.includes(t.kind) || typeof t.id !== 'string')
                throw new Error('TIMER_TARGET_INVALID');
            const row = await this.core.repository.get(STORE[t.kind], t.id);
            if (!row)
                throw new Error('TIMER_TARGET_NOT_FOUND');
            if (await this.core.access.can({ kind: t.kind, id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds || [] }, actorId, 'READ') !== true)
                throw new Error('Scope denied: READ required');
            return { kind: t.kind, id: t.id, title: String(row.data?.name || row.data?.title || row.title || row.name || row.id).slice(0, 160) };
        }
        elapsed(d, at = this.now()) { let ms = 0; for (const s of d.segments || []) {
            const a = Date.parse(s.start), b = s.end ? Date.parse(s.end) : at;
            ms += Math.max(0, b - a);
        } for (const c of d.corrections || [])
            ms += c.deltaMs; return ms; }
        view(r, at = this.now()) {
            const d = r.data;
            const el = this.elapsed(d, at);
            const open = (d.segments || []).find((s) => !s.end);
            const remaining = d.kind === 'COUNTDOWN' ? d.countdownMs - el : null;
            return { id: r.id, revision: r.revision, label: d.label, kind: d.kind, state: d.state === 'RUNNING' && remaining !== null && remaining <= 0 ? 'EXPIRED' : d.state, target: d.target, ownerApp: r.ownerApp,
                elapsedMs: el, elapsed: fmt(el), remainingMs: remaining, remaining: remaining === null ? null : fmt(Math.max(0, remaining)), laps: d.laps || [], corrections: d.corrections || [],
                runningOn: open ? open.deviceId : null, suspicious: !!open && at - Date.parse(open.start) > SUSPICIOUS_MS, createdBy: r.createdBy, stoppedAt: d.stoppedAt || null, entryId: d.entryId || null };
        }
        async load(id, ctx) {
            const r = await this.core.entities.get(id);
            if (!r || r.type !== TYPE || r.archivedAt)
                throw new Error('TIMER_NOT_FOUND');
            if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, ctx.actorId, 'EDIT') !== true)
                throw new Error('Scope denied: EDIT required');
            return r;
        }
        save(r, data, ctx) { return this.core.entities.save({ id: r.id, type: TYPE, ownerApp: r.ownerApp, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, data }, ctx); }
        async start(input, ctx) {
            const kind = input?.kind === 'COUNTDOWN' ? 'COUNTDOWN' : 'STOPWATCH';
            const target = await this.checkTarget(input?.target ?? null, ctx.actorId);
            let countdownMs = null;
            if (kind === 'COUNTDOWN') {
                countdownMs = Number(input?.countdownMs);
                if (!Number.isInteger(countdownMs) || countdownMs < 1000 || countdownMs > MAX_MS)
                    throw new Error('TIMER_COUNTDOWN_INVALID');
            }
            const label = (typeof input?.label === 'string' && input.label.trim() ? input.label.trim() : target?.title || (kind === 'COUNTDOWN' ? 'Odpočet' : 'Stopky')).slice(0, 160);
            const ownerApp = typeof input?.ownerApp === 'string' && /^APP\.[A-Z0-9_.]+$/.test(input.ownerApp) ? input.ownerApp : OWNER;
            const t = this.iso(this.now());
            return this.view(await this.core.entities.save({ type: TYPE, ownerApp, schema: 'KX.CORE_TIMER/1', spaceIds: await this.space(ctx, target),
                data: { kind, label, target, countdownMs, state: 'RUNNING', segments: [{ start: t, end: null, deviceId: this.device(ctx) }], laps: [], corrections: [], startedBy: ctx.actorId } }, ctx));
        }
        async pause(input, ctx) {
            const r = await this.load(input?.id, ctx);
            if (r.data.state !== 'RUNNING')
                throw new Error('TIMER_NOT_RUNNING');
            const open = r.data.segments.find((s) => !s.end);
            if (open.deviceId && this.device(ctx) && open.deviceId !== this.device(ctx) && input?.takeover !== true)
                throw new Error('TIMER_RUNNING_ON_OTHER_DEVICE');
            const t = this.iso(this.now());
            return this.view(await this.save(r, { ...r.data, state: 'PAUSED', segments: r.data.segments.map((s) => s === open ? { ...s, end: t } : s) }, ctx));
        }
        async resume(input, ctx) {
            const r = await this.load(input?.id, ctx);
            if (r.data.state !== 'PAUSED')
                throw new Error('TIMER_NOT_PAUSED');
            return this.view(await this.save(r, { ...r.data, state: 'RUNNING', segments: [...r.data.segments, { start: this.iso(this.now()), end: null, deviceId: this.device(ctx) }] }, ctx));
        }
        async lap(input, ctx) {
            const r = await this.load(input?.id, ctx);
            if (r.data.state === 'STOPPED')
                throw new Error('TIMER_STOPPED');
            const at = this.now();
            return this.view(await this.save(r, { ...r.data, laps: [...(r.data.laps || []), { at: this.iso(at), elapsedMs: this.elapsed(r.data, at), note: String(input?.note || '').slice(0, 200) }].slice(-500) }, ctx));
        }
        async correct(input, ctx) {
            const r = await this.load(input?.id, ctx);
            const d = Number(input?.deltaMs);
            const reason = String(input?.reason || '').trim();
            if (!Number.isInteger(d) || d === 0 || Math.abs(d) > MAX_MS)
                throw new Error('TIMER_CORRECTION_INVALID');
            if (!reason)
                throw new Error('TIMER_CORRECTION_REASON_REQUIRED');
            if (this.elapsed(r.data) + d < 0)
                throw new Error('TIMER_CORRECTION_NEGATIVE_TOTAL');
            return this.view(await this.save(r, { ...r.data, corrections: [...(r.data.corrections || []), { deltaMs: d, reason: reason.slice(0, 300), at: this.iso(this.now()), by: ctx.actorId }] }, ctx));
        }
        async stop(input, ctx) {
            const r = await this.load(input?.id, ctx);
            if (r.data.state === 'STOPPED')
                throw new Error('TIMER_STOPPED');
            const at = this.now();
            const t = this.iso(at);
            const open = r.data.segments.find((s) => !s.end);
            if (open && open.deviceId && this.device(ctx) && open.deviceId !== this.device(ctx) && input?.takeover !== true)
                throw new Error('TIMER_RUNNING_ON_OTHER_DEVICE');
            const data = { ...r.data, state: 'STOPPED', stoppedAt: t, segments: r.data.segments.map((s) => s.end ? s : { ...s, end: t }) };
            const ms = this.elapsed(data, at);
            let entryId = null;
            if (input?.publish !== false && ms > 0) {
                const rate = Number(input?.ratePerHour);
                const minutes = Math.round(ms / 60000 * 100) / 100;
                const e = await this.core.entities.save({ type: ENTRY, ownerApp: r.ownerApp, schema: 'KX.CORE_TIME_ENTRY/1', spaceIds: r.spaceIds, data: { timerId: r.id, label: data.label, target: data.target,
                        start: data.segments[0]?.start, end: t, ms, minutes, ratePerHour: Number.isFinite(rate) && rate > 0 ? rate : null, cost: Number.isFinite(rate) && rate > 0 ? Math.round(minutes / 60 * rate * 100) / 100 : null, by: ctx.actorId } }, ctx);
                entryId = e.id;
            }
            return this.view(await this.save(r, { ...data, entryId }, ctx), at);
        }
        async transfer(input, ctx) {
            const r = await this.load(input?.id, ctx);
            const to = await this.checkTarget(input?.toTarget, ctx.actorId);
            if (!to)
                throw new Error('TIMER_TARGET_INVALID');
            const avail = this.elapsed(r.data);
            const ms = input?.ms === undefined ? avail : Number(input.ms);
            if (!Number.isInteger(ms) || ms <= 0 || ms > avail)
                throw new Error('TIMER_TRANSFER_INVALID');
            const at = this.iso(this.now());
            const reason = `Přeneseno na ${to.title}`;
            const src = await this.save(r, { ...r.data, corrections: [...(r.data.corrections || []), { deltaMs: -ms, reason, at, by: ctx.actorId, transferTo: to }] }, ctx);
            const dst = await this.core.entities.save({ type: TYPE, ownerApp: r.ownerApp, schema: 'KX.CORE_TIMER/1', spaceIds: await this.space(ctx, to),
                data: { kind: 'STOPWATCH', label: `${r.data.label} (přeneseno)`, target: to, countdownMs: null, state: 'STOPPED', stoppedAt: at, segments: [], laps: [], corrections: [{ deltaMs: ms, reason: `Přeneseno z ${r.data.label}`, at, by: ctx.actorId, transferFrom: r.data.target || { timerId: r.id } }], startedBy: ctx.actorId } }, ctx);
            return { from: this.view(src), to: this.view(dst), ms };
        }
        async list(input, actorId) {
            const at = this.now();
            const out = [];
            for (const r of await this.core.entities.list()) {
                if (r.type !== TYPE || r.archivedAt)
                    continue;
                if (input?.active && r.data.state === 'STOPPED')
                    continue;
                if (input?.target && !(r.data.target && r.data.target.kind === input.target.kind && r.data.target.id === input.target.id))
                    continue;
                if (input?.ownerApp && r.ownerApp !== input.ownerApp)
                    continue;
                if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') !== true)
                    continue;
                out.push(this.view(r, at));
            }
            return out.sort((a, b) => Number(b.state !== 'STOPPED') - Number(a.state !== 'STOPPED') || String(b.id).localeCompare(String(a.id)));
        }
        async summary(input, actorId) {
            const rows = await this.list({ target: input?.target }, actorId);
            const ms = rows.reduce((a, r) => a + r.elapsedMs, 0);
            return { target: input?.target, totalMs: ms, total: fmt(ms), timers: rows.length, running: rows.filter((r) => r.state === 'RUNNING' || r.state === 'EXPIRED').length };
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.format = fmt;
    NS.SUSPICIOUS_MS = SUSPICIOUS_MS;
    NS.TimerService = TimerService;
    NS.install = (core, options = {}) => {
        if (core.timer)
            throw new Error('Timer already installed');
        if (!core?.entities?.save)
            throw new Error('Timer requires Core entities');
        const svc = new TimerService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.TIMER.START', 'SAFE_WRITE', (p, c) => svc.start(p, c)], ['ACTION.CORE.TIMER.PAUSE', 'SAFE_WRITE', (p, c) => svc.pause(p, c)],
            ['ACTION.CORE.TIMER.RESUME', 'SAFE_WRITE', (p, c) => svc.resume(p, c)], ['ACTION.CORE.TIMER.LAP', 'SAFE_WRITE', (p, c) => svc.lap(p, c)], ['ACTION.CORE.TIMER.CORRECT', 'SAFE_WRITE', (p, c) => svc.correct(p, c)],
            ['ACTION.CORE.TIMER.STOP', 'SAFE_WRITE', (p, c) => svc.stop(p, c)], ['ACTION.CORE.TIMER.TRANSFER', 'SAFE_WRITE', (p, c) => svc.transfer(p, c)],
            ['ACTION.CORE.TIMER.LIST', 'READ', (p, c) => svc.list(p || {}, c.actorId)], ['ACTION.CORE.TIMER.SUMMARY', 'READ', (p, c) => svc.summary(p, c.actorId)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.timer = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.timer;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXTimer || (KXTimer = {}));
