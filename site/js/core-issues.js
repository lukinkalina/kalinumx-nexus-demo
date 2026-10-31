// N2.3e (R68 E1): Hlášky a kontroly – one centre for problems NEXUS detects itself (KX.CORE_ISSUES/1).
//  - CHECKS (detectors) are registered by Core and by hubs (owner = hub); each reads only what the actor may read and
//    returns issues with a stable FINGERPRINT (code + subject). Issues are computed live – when a check no longer finds
//    the problem, the issue is gone (nothing stale). Nothing is changed by a check; fixes are offered as buttons.
//  - SEVERITY INFO < WARN < ERROR < CRITICAL (the bell shows the highest open one; CRITICAL blinks in the Shell).
//  - Personal DECISIONS by fingerprint: MUTED (until a time – grey, not counted, returns afterwards), IGNORED (grey for
//    good, not counted), back to OPEN (watch again). Stored per user in the personal space (revision + audit).
//  - REPORT: the program itself can report a problem (e.g. a sync failure); such issues are RESOLVED by hand.
var KXIssues;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_ISSUES/1', T_STATE = 'CORE.ISSUES.STATE', T_REPORT = 'CORE.ISSUE.REPORT';
    const SEV = ['INFO', 'WARN', 'ERROR', 'CRITICAL'], RANK = { INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
    const TXT = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const DATE_RE = /(^|[^\d])(\d{1,2})\.\s?(\d{1,2})\.(\s?(\d{4}))?(?!\d)/, TIME_RE = /(^|[^\d])([01]?\d|2[0-3]):[0-5]\d(?!\d)/;
    class IssueService {
        core;
        now;
        checks = new Map();
        constructor(core, opt = {}) { this.core = core; this.now = typeof opt.now === 'function' ? opt.now : () => Date.now(); }
        /* defaults: {hours?} = threshold the user may change; rules are personal, general per check and with hub exceptions */
        registerCheck(c) { if (!c || !/^[A-Z0-9_.]+$/.test(String(c.id)) || typeof c.run !== 'function')
            throw new Error('ISSUE_CHECK_INVALID'); if (this.checks.has(c.id))
            throw new Error('ISSUE_CHECK_DUPLICATE'); this.checks.set(c.id, { ...c, defaults: { ...(c.defaults || {}) } }); }
        async rulesOf(actorId) { return (await this.stateRow(actorId))?.data?.rules || {}; }
        ruleFor(rules, check, hub) {
            const g = rules[check.id] || {}, h = (g.byHub || {})[hub] || {};
            const pick = (k) => h[k] !== undefined ? h[k] : g[k] !== undefined ? g[k] : check.defaults?.[k];
            return { enabled: pick('enabled') !== false, hours: pick('hours'), severity: pick('severity') || null };
        }
        async rules(actorId) { const rules = await this.rulesOf(actorId); return { checks: [...this.checks.values()].map((c) => ({ id: c.id, owner: c.owner, title: c.title, defaults: c.defaults, rule: rules[c.id] || {} })) }; }
        async setRule(input, ctx) {
            const c = this.checks.get(String(input?.checkId || ''));
            if (!c)
                throw new Error('ISSUE_CHECK_UNKNOWN');
            const hub = input?.hub ? String(input.hub) : '';
            if (hub && !/^APP\.[A-Z0-9_.]+$/.test(hub))
                throw new Error('ISSUE_RULE_HUB_INVALID');
            const patch = {};
            if (input?.enabled !== undefined)
                patch.enabled = input.enabled === true;
            if (input?.hours !== undefined && input.hours !== null) {
                const h = Number(input.hours);
                if (!(h >= 0.25 && h <= 24 * 30))
                    throw new Error('ISSUE_RULE_HOURS_INVALID');
                patch.hours = h;
            }
            if (input?.severity !== undefined && input.severity !== null) {
                if (!SEV.includes(input.severity))
                    throw new Error('ISSUE_RULE_SEVERITY_INVALID');
                patch.severity = input.severity;
            }
            const r = await this.stateRow(ctx.actorId);
            const rules = JSON.parse(JSON.stringify(r?.data?.rules || {}));
            const g = rules[c.id] || (rules[c.id] = {});
            const target = hub ? ((g.byHub || (g.byHub = {}))[hub] || (g.byHub[hub] = {})) : g;
            if (input?.clear === true) {
                if (hub)
                    delete g.byHub[hub];
                else {
                    const bh = g.byHub;
                    rules[c.id] = bh ? { byHub: bh } : {};
                }
            }
            else
                Object.assign(target, patch);
            const data = { owner: ctx.actorId, decisions: r?.data?.decisions || {}, rules };
            if (r)
                await this.core.entities.save({ id: r.id, type: T_STATE, ownerApp: OWNER, schema: CONTRACT, spaceIds: r.spaceIds, expectedRevision: r.revision, data }, ctx);
            else
                await this.core.entities.save({ type: T_STATE, ownerApp: OWNER, schema: CONTRACT, spaceIds: [await this.personal(ctx.actorId)], data }, ctx);
            return { checkId: c.id, hub: hub || null, rule: hub ? (rules[c.id]?.byHub || {})[hub] || null : rules[c.id] };
        }
        async personal(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('ISSUES_NO_PERSONAL_SPACE'); return s.id; }
        async stateRow(actorId) { return (await this.core.entities.list()).find((r) => r.type === T_STATE && r.data?.owner === actorId && !r.archivedAt) || null; }
        async decisions(actorId) { return (await this.stateRow(actorId))?.data?.decisions || {}; }
        async decide(fp, decision, ctx) {
            if (!/^[A-Za-z0-9_.:#@-]{3,300}$/.test(String(fp || '')))
                throw new Error('ISSUE_FINGERPRINT_INVALID');
            const r = await this.stateRow(ctx.actorId);
            const d = { ...(r?.data?.decisions || {}) };
            if (decision)
                d[fp] = { ...decision, at: new Date(this.now()).toISOString() };
            else
                delete d[fp];
            const keys = Object.keys(d);
            if (keys.length > 2000)
                for (const k of keys.slice(0, keys.length - 2000))
                    delete d[k];
            if (r)
                return this.core.entities.save({ id: r.id, type: T_STATE, ownerApp: OWNER, schema: CONTRACT, spaceIds: r.spaceIds, expectedRevision: r.revision, data: { owner: ctx.actorId, decisions: d, rules: r.data?.rules || {} } }, ctx);
            return this.core.entities.save({ type: T_STATE, ownerApp: OWNER, schema: CONTRACT, spaceIds: [await this.personal(ctx.actorId)], data: { owner: ctx.actorId, decisions: d } }, ctx);
        }
        norm(i, check) {
            const sev = SEV.includes(i?.severity) ? i.severity : 'INFO';
            return { fingerprint: String(i.fingerprint), code: String(i.code || check.id), severity: sev, owner: String(i.owner || check.owner), title: String(i.title || '').slice(0, 200), detail: String(i.detail || '').slice(0, 500),
                fix: (Array.isArray(i.fix) ? i.fix : []).slice(0, 4).map((f) => ({ kind: String(f.kind), label: String(f.label || '').slice(0, 60), ...(f.target ? { target: f.target } : {}), ...(f.address ? { address: String(f.address) } : {}), ...(f.action ? { action: String(f.action), payload: f.payload || {}, confirm: f.confirm === true } : {}) })), source: 'CHECK', checkId: check.id };
        }
        async list(input, actorId) {
            const out = [], errors = [];
            const dec = await this.decisions(actorId), t = this.now();
            const rules = await this.rulesOf(actorId);
            for (const c of this.checks.values()) {
                if (this.ruleFor(rules, c, '').enabled === false && !Object.values(rules[c.id]?.byHub || {}).some((h) => h.enabled === true))
                    continue;
                try {
                    for (const i of (await c.run(actorId, (hub) => this.ruleFor(rules, c, hub))) || []) {
                        if (!i?.fingerprint)
                            continue;
                        const n = this.norm(i, c);
                        const rl = this.ruleFor(rules, c, n.owner);
                        if (!rl.enabled)
                            continue;
                        if (rl.severity) {
                            n.severity = rl.severity;
                            n.severityByRule = true;
                        }
                        out.push(n);
                    }
                }
                catch (e) {
                    errors.push({ check: c.id, owner: c.owner, error: String(e?.message || e).slice(0, 160) });
                }
            }
            for (const r of (await this.core.entities.list()).filter((x) => x.type === T_REPORT && !x.archivedAt && !x.data?.resolvedAt)) {
                if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') !== true)
                    continue;
                out.push({ fingerprint: 'REPORT:' + r.id, code: r.data.code, severity: r.data.severity, owner: r.data.owner, title: r.data.title, detail: r.data.detail, fix: r.data.fix || [], source: 'REPORT', reportId: r.id, reportedAt: r.data.reportedAt });
            }
            for (const i of out) {
                const d = dec[i.fingerprint];
                i.state = 'OPEN';
                if (d?.state === 'IGNORED')
                    i.state = 'IGNORED';
                else if (d?.state === 'MUTED' && Date.parse(d.until) > t) {
                    i.state = 'MUTED';
                    i.mutedUntil = d.until;
                }
            }
            const rows = out.filter(i => (!input?.owner || i.owner === input.owner) && (!input?.state || i.state === input.state)).sort((a, b) => (a.state === 'OPEN' ? 0 : 1) - (b.state === 'OPEN' ? 0 : 1) || RANK[b.severity] - RANK[a.severity] || a.title.localeCompare(b.title, 'cs'));
            return { items: rows, errors };
        }
        async summary(actorId) {
            const { items, errors } = await this.list({}, actorId);
            const open = items.filter((i) => i.state === 'OPEN');
            const by = { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
            for (const i of open)
                by[i.severity]++;
            const top = SEV.slice().reverse().find(s => by[s] > 0) || null;
            return { open: open.length, muted: items.filter((i) => i.state === 'MUTED').length, ignored: items.filter((i) => i.state === 'IGNORED').length, bySeverity: by, top, blink: top === 'CRITICAL', checkErrors: errors.length };
        }
        async mute(input, ctx) {
            const until = input?.until ? new Date(input.until) : new Date(this.now() + Math.max(5, Math.min(60 * 24 * 90, Number(input?.minutes) || 60)) * 60000);
            if (!Number.isFinite(until.getTime()) || until.getTime() <= this.now())
                throw new Error('ISSUE_MUTE_UNTIL_INVALID');
            await this.decide(input?.fingerprint, { state: 'MUTED', until: until.toISOString() }, ctx);
            return { fingerprint: input.fingerprint, state: 'MUTED', until: until.toISOString() };
        }
        async ignore(input, ctx) { await this.decide(input?.fingerprint, { state: 'IGNORED' }, ctx); return { fingerprint: input.fingerprint, state: 'IGNORED' }; }
        async reopen(input, ctx) { await this.decide(input?.fingerprint, null, ctx); return { fingerprint: input.fingerprint, state: 'OPEN' }; }
        async report(input, ctx) {
            const sev = SEV.includes(input?.severity) ? input.severity : 'WARN';
            const title = String(input?.title || '').trim().slice(0, 200);
            if (!title)
                throw new Error('ISSUE_TITLE_REQUIRED');
            const owner = /^APP\.[A-Z0-9_.]+$/.test(String(input?.owner || '')) ? input.owner : OWNER;
            return this.core.entities.save({ type: T_REPORT, ownerApp: owner, schema: CONTRACT, spaceIds: [await this.personal(ctx.actorId)], data: { code: String(input?.code || 'PROGRAM.REPORT').slice(0, 80), severity: sev, owner, title, detail: String(input?.detail || '').slice(0, 500), fix: Array.isArray(input?.fix) ? input.fix.slice(0, 4) : [], reportedAt: new Date(this.now()).toISOString(), resolvedAt: null } }, ctx);
        }
        async resolve(input, ctx) {
            const r = await this.core.entities.get(String(input?.reportId || ''));
            if (!r || r.type !== T_REPORT || r.archivedAt)
                throw new Error('ISSUE_REPORT_NOT_FOUND');
            if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, ctx.actorId, 'EDIT') !== true)
                throw new Error('Scope denied: EDIT required');
            return this.core.entities.save({ id: r.id, type: T_REPORT, ownerApp: r.ownerApp, schema: CONTRACT, spaceIds: r.spaceIds, expectedRevision: r.revision, data: { ...r.data, resolvedAt: new Date(this.now()).toISOString() } }, ctx);
        }
        /* ---------- built-in Core checks (E1) ---------- */
        installCoreChecks() {
            const core = this.core, now = () => this.now();
            const can = async (r, a) => await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, a, 'READ') === true;
            this.registerCheck({ id: 'CORE.PROPAGATE.BROKEN', owner: OWNER, title: TXT('issues.check.propagate', 'Broken propagations'), run: async (a) => {
                    if (!core.propagate?.broken)
                        return [];
                    return (await core.propagate.broken(a)).map((b) => ({ fingerprint: 'PROPAGATE.BROKEN:' + b.relationId, severity: 'WARN',
                        title: TXT('issues.propagateBroken', 'Propagated place no longer exists'), detail: `${b.sourceTitle} → ${TXT('notes.link.' + b.kind, b.kind)}`, fix: [{ kind: 'OPEN_RECORD', label: TXT('issues.openSource', 'Open source'), target: b.source }, { kind: 'RUN_ACTION', label: TXT('issues.unlink', 'Unlink'), action: 'ACTION.CORE.PROPAGATE.UNLINK', payload: { relationId: b.relationId }, confirm: true }] }));
                } });
            this.registerCheck({ id: 'CORE.NOTES.DATE_NOT_PROPAGATED', owner: 'APP.KX.NOTES', title: TXT('issues.check.notesDate', 'Date in a note not propagated'), run: async (a) => {
                    const out = [];
                    const today = new Date(now());
                    today.setHours(0, 0, 0, 0);
                    for (const r of (await core.entities.list()).filter((x) => x.type === 'CORE.NOTE.PAGE' && !x.archivedAt)) {
                        if (!await can(r, a))
                            continue;
                        for (const b of r.data?.doc?.blocks || [])
                            for (const it of b.items || []) {
                                if (it.links?.length || !it.id)
                                    continue;
                                const text = (it.runs || []).map((x) => x.text).join('');
                                const m = DATE_RE.exec(text);
                                if (!m && !TIME_RE.test(text))
                                    continue;
                                if (b.t === 'todo' && it.checked)
                                    continue;
                                let past = false;
                                if (m) {
                                    const y = m[5] ? Number(m[5]) : today.getFullYear();
                                    const d = new Date(y, Number(m[3]) - 1, Number(m[2]));
                                    past = Number.isFinite(d.getTime()) && d < today;
                                }
                                out.push({ fingerprint: 'NOTES.DATE:' + r.id + '#' + it.id, severity: past && b.t === 'todo' ? 'WARN' : 'INFO', title: TXT('issues.dateNotPropagated', 'Line with a date is not in the calendar or tasks'), detail: `${r.data.title}: ${text.slice(0, 120)}`,
                                    fix: [{ kind: 'OPEN_NOTE', label: TXT('issues.openLine', 'Open the line and propagate'), target: { kind: 'NOTE_LINE', pageId: r.id, itemId: it.id } }] });
                            }
                    }
                    return out;
                } });
            this.registerCheck({ id: 'CORE.RECORD_CODE.COLLISION', owner: OWNER, title: TXT('issues.check.codes', 'Record code collisions'), run: async (a) => {
                    if (!core.recordCodes?.collisions)
                        return [];
                    return (await core.recordCodes.collisions(a)).map((g) => ({ fingerprint: 'CODE.COLLISION:' + (g.code || g.id), severity: 'ERROR',
                        title: TXT('issues.codeCollision', 'Two records have the same code'), detail: String(g.code || ''), fix: [{ kind: 'OPEN_SETTINGS', label: TXT('issues.openSync', 'Sync → code collisions'), address: 'link:sync' }] }));
                } });
            this.registerCheck({ id: 'CORE.TIMER.FORGOTTEN', owner: OWNER, title: TXT('issues.check.timer', 'Forgotten timers'), defaults: { hours: 8 }, run: async (a, rule) => {
                    if (!core.timer?.list)
                        return [];
                    const stepTimers = new Set();
                    for (const p of (await core.entities.list()).filter((x) => x.type === 'CORE.PROCESS' && !x.archivedAt))
                        for (const s of p.data?.steps || [])
                            if (s.timerId)
                                stepTimers.add(s.timerId);
                    return (await core.timer.list({ active: true }, a)).filter((t) => t.state === 'RUNNING' && !stepTimers.has(t.id) && Number(t.elapsedMs) > Number(rule(t.ownerApp || OWNER).hours || 8) * 3600000).map((t) => ({ fingerprint: 'TIMER.FORGOTTEN:' + t.id, owner: t.ownerApp || OWNER, severity: 'WARN', title: TXT('issues.timerForgotten', 'Timer running longer than set') + ` (${rule(t.ownerApp || OWNER).hours || 8} h)`, detail: `${t.label || ''} · ${t.elapsed}`, fix: [{ kind: 'OPEN_SETTINGS', label: TXT('issues.openTimers', 'Open timers'), address: 'link:timers' }] }));
                } });
            this.registerCheck({ id: 'CORE.PROCESS.STEP_FORGOTTEN', owner: OWNER, title: TXT('issues.check.step', 'Forgotten process step'), defaults: { hours: 12 }, run: async (a, rule) => {
                    const out = [];
                    for (const p of (await core.entities.list()).filter((x) => x.type === 'CORE.PROCESS' && !x.archivedAt)) {
                        if (!await can(p, a))
                            continue;
                        const hrs = Number(rule(p.ownerApp || OWNER).hours || 12);
                        for (const s of p.data?.steps || [])
                            if (s.status === 'RUNNING' && s.startedAt && now() - Date.parse(s.startedAt) > hrs * 3600000)
                                out.push({ fingerprint: 'PROCESS.STEP:' + p.id + '#' + s.id, owner: p.ownerApp || OWNER, severity: 'WARN', title: TXT('issues.stepForgotten', 'Process step running longer than set') + ` (${hrs} h)`, detail: `${p.data.name} › ${s.title}`, fix: [{ kind: 'OPEN_RECORD', label: TXT('issues.openProcess', 'Open process'), target: { kind: 'PROCESS', id: p.id } }] });
                    }
                    return out;
                } });
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.SEVERITIES = SEV;
    NS.IssueService = IssueService;
    NS.DATE_RE = DATE_RE;
    NS.install = (core, opt = {}) => {
        if (core.issues)
            throw new Error('Issues already installed');
        const svc = new IssueService(core, opt);
        svc.installCoreChecks();
        const reg = [];
        const defs = [['ACTION.CORE.ISSUES.LIST', 'READ', (p, c) => svc.list(p || {}, c.actorId)], ['ACTION.CORE.ISSUES.SUMMARY', 'READ', (_p, c) => svc.summary(c.actorId)], ['ACTION.CORE.ISSUES.RULES', 'READ', (_p, c) => svc.rules(c.actorId)], ['ACTION.CORE.ISSUES.RULE_SET', 'SAFE_WRITE', (p, c) => svc.setRule(p, c)],
            ['ACTION.CORE.ISSUES.MUTE', 'SAFE_WRITE', (p, c) => svc.mute(p, c)], ['ACTION.CORE.ISSUES.IGNORE', 'SAFE_WRITE', (p, c) => svc.ignore(p, c)], ['ACTION.CORE.ISSUES.REOPEN', 'SAFE_WRITE', (p, c) => svc.reopen(p, c)],
            ['ACTION.CORE.ISSUES.REPORT', 'SAFE_WRITE', (p, c) => svc.report(p, c)], ['ACTION.CORE.ISSUES.RESOLVE', 'SAFE_WRITE', (p, c) => svc.resolve(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.issues = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.issues;
            throw e;
        }
        return svc;
    };
})(KXIssues || (KXIssues = {}));
