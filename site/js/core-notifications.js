// N2.1a: Core notifications across every hub (contracts, doctors, revisions, STK, vaccinations, …).
// Rules:
//  - Sources are the hubs' own services (read with the actor's ACL); nothing is generated or invented.
//  - No invented lead times: by default a notification appears on the due day and stays while overdue.
//    "N days before" exists only when the USER sets leadDays for that hub.
//  - Sensitive hubs (health, finance, HR, subscriptions, vault) are redacted by default (no names).
//  - A failing source is reported in sourceErrors, never silently dropped.
//  - N2.1g: a protected hub without the reader's verified session is reported in lockedSources (no data, no names).
//  - Per-user rules and read/dismiss state live in Core SettingsService (USER scope, revision + audit).
var KXNotifications;
(function (NS) {
    const SENSITIVE = new Set(['APP.KX.HEALTH', 'APP.KX.FINANCE', 'APP.KX.HR', 'APP.KX.SUBSCRIPTIONS', 'APP.KX.VAULT']);
    // N2.1c (R22): names for health are SHOWN by default (user decision); other sensitive hubs stay hidden by default.
    const SENSITIVE_SHOW_DEFAULT = { 'APP.KX.HEALTH': true };
    const RULES_KEY = 'notifications.rules', STATE_KEY = 'notifications.state', MAX_STATE = 2000;
    const pad = (n) => String(n).padStart(2, '0');
    const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
    const dayOf = (v) => isDate(v) ? v : (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? localDate(Date.parse(v)) : null);
    const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
    async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    function defaultRules() { return { version: 1, enabled: true, systemNotifications: true, showSensitiveDetails: false, showMarkedSensitive: false, sensitiveShow: { ...SENSITIVE_SHOW_DEFAULT }, quietHours: null, hubs: {} }; }
    function validateRules(r) {
        if (!r || typeof r !== 'object' || Array.isArray(r))
            throw new Error('NOTIFY_RULES_INVALID');
        const out = defaultRules();
        out.enabled = r.enabled !== false;
        out.systemNotifications = r.systemNotifications !== false;
        out.showSensitiveDetails = r.showSensitiveDetails === true;
        out.showMarkedSensitive = r.showMarkedSensitive === true;
        for (const [hub, v] of Object.entries(r.sensitiveShow || {})) {
            if (!SENSITIVE.has(hub))
                throw new Error('NOTIFY_SENSITIVE_UNKNOWN_HUB');
            if (typeof v !== 'boolean')
                throw new Error('NOTIFY_SENSITIVE_BOOLEAN');
            out.sensitiveShow[hub] = v;
        }
        if (r.quietHours != null) {
            const q = r.quietHours;
            const hm = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
            if (!hm(q?.from) || !hm(q?.to))
                throw new Error('NOTIFY_QUIET_HOURS_HH_MM');
            out.quietHours = { from: q.from, to: q.to };
        }
        for (const [hub, v] of Object.entries(r.hubs || {})) {
            if (!/^APP\.KX\.[A-Z][A-Z0-9_]*$|^CORE\.[A-Z][A-Z0-9_]*$/.test(hub))
                throw new Error('NOTIFY_RULE_UNKNOWN_HUB'); /* N2.3i: hub codes may contain digits (PRINT3D) */
            const lead = v?.leadDays;
            if (lead !== null && lead !== undefined && (!Number.isInteger(lead) || lead < 0 || lead > 365))
                throw new Error('NOTIFY_LEAD_DAYS_0_365');
            out.hubs[hub] = { enabled: v?.enabled !== false, leadDays: lead ?? null };
        }
        return out;
    }
    const inQuiet = (q, ms) => { if (!q)
        return false; const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes(), [fh, fm] = q.from.split(':').map(Number), [th, tm] = q.to.split(':').map(Number), f = fh * 60 + fm, t = th * 60 + tm; return f <= t ? (m >= f && m < t) : (m >= f || m < t); };
    // ---- source adapters (read-only, ACL of the actor) ----
    function scheduleDomainSource(ownerApp, service, cfg) {
        return { ownerApp, kind: 'HUB_DOMAIN', async list(actorId) {
                const out = [];
                for (const s of await service.list(actorId)) {
                    const d = s.data || {};
                    for (const it of (d[cfg.itemsKey] || [])) {
                        if (!isDate(it.dueAt))
                            continue;
                        out.push({ sourceId: `${s.id}:${it.id}`, ownerApp, subject: String(d.name || ''), label: String(it.label || cfg.itemKinds?.[it.kind] || it.kind), kindCode: String(it.kind), dueAt: it.dueAt, revision: s.revision, marked: d.kxControls?.sensitive === true || d.kxControls?.items?.[it.id] === true });
                    }
                }
                return out;
            } };
    }
    function vehiclesSource(service) {
        return { ownerApp: 'APP.KX.VEHICLES', kind: 'HUB_DOMAIN', async list(actorId) {
                const out = [];
                for (const v of await service.list(actorId)) {
                    const d = v.data || {};
                    for (const [k, label] of [['inspectionDueAt', 'STK'], ['serviceDueAt', 'Servis'], ['insuranceDueAt', 'Pojištění']])
                        if (isDate(d[k]))
                            out.push({ sourceId: `${v.id}:${k}`, ownerApp: 'APP.KX.VEHICLES', subject: String(d.name || ''), label, kindCode: k.toUpperCase(), dueAt: d[k], revision: v.revision, marked: d.kxControls?.sensitive === true });
                }
                return out;
            } };
    }
    function coreTasksSource(core) {
        return { ownerApp: 'CORE.TASKS', kind: 'CORE', async list(actorId) {
                const out = [];
                for (const t of await core.tasks.list()) {
                    if (!t || t.archivedAt || t.status === 'DONE' || t.status === 'CANCELLED' || typeof t.dueAt !== 'string')
                        continue;
                    if (!Array.isArray(t.assigneeIds) || !t.assigneeIds.includes(actorId))
                        continue;
                    if (await core.access.can({ kind: 'TASK', id: t.id, ownerApp: t.ownerApp, spaceIds: t.spaceIds || [] }, actorId, 'READ') !== true)
                        continue;
                    const due = dayOf(t.dueAt);
                    if (!due)
                        continue;
                    out.push({ sourceId: `task:${t.id}`, ownerApp: t.ownerApp || 'CORE.TASKS', subject: '', label: String(t.title || 'Úkol'), kindCode: 'TASK', dueAt: due, revision: t.revision });
                }
                return out;
            } };
    }
    /* N2.5q: notification levels (icon + text in the UI); POSTPONED = moved to „unfinished“ */
    const LEVELS = ['ALARM', 'WARNING', 'NOTICE', 'INFO', 'POSTPONED'];
    class NotificationService {
        core;
        clock;
        sources = new Map();
        constructor(core, clock = () => Date.now()) {
            this.core = core;
            this.clock = clock;
        }
        registerSource(src) { if (!src || typeof src.list !== 'function' || typeof src.ownerApp !== 'string')
            throw new Error('NOTIFY_SOURCE_INVALID'); const key = `${src.ownerApp}#${src.kind || 'X'}`; if (this.sources.has(key))
            throw new Error('NOTIFY_SOURCE_DUPLICATE ' + key); this.sources.set(key, src); return key; }
        unregisterSource(key) { return this.sources.delete(key); }
        sourceKeys() { return [...this.sources.keys()].sort(); }
        async setting(key, actorId) { const r = (await this.core.settings.list(key)).find((x) => x.scopeType === 'USER' && x.scopeId === actorId); return r?.value; }
        async rules(actorId) { const v = await this.setting(RULES_KEY, actorId); return v ? validateRules(v) : defaultRules(); }
        async setRules(input, ctx) { const r = validateRules(input); await this.core.settings.set({ key: RULES_KEY, scopeType: 'USER', scopeId: ctx.actorId, value: r }, ctx); return r; }
        async state(actorId) {
            const v = await this.setting(STATE_KEY, actorId);
            return { read: { ...(v?.read || {}) }, dismissed: { ...(v?.dismissed || {}) }, delivered: { ...(v?.delivered || {}) },
                /* N2.5q (user): levels per notification, muting until a time, level rules for similar ones (hub or hub|kind) */ levels: { ...(v?.levels || {}) }, muted: { ...(v?.muted || {}) }, levelRules: { ...(v?.levelRules || {}) } };
        }
        async saveState(st, ctx) {
            const ids = [...new Set([...Object.keys(st.read), ...Object.keys(st.dismissed), ...Object.keys(st.delivered || {}), ...Object.keys(st.levels || {}), ...Object.keys(st.muted || {})])];
            if (ids.length > MAX_STATE) {
                const keep = new Set(ids.slice(-MAX_STATE));
                for (const part of ['read', 'dismissed', 'delivered', 'levels', 'muted'])
                    for (const k of Object.keys(st[part] || {}))
                        if (!keep.has(k))
                            delete st[part][k];
            }
            await this.core.settings.set({ key: STATE_KEY, scopeType: 'USER', scopeId: ctx.actorId, value: st }, ctx);
        }
        /* N2.5q: change a level (null = back to default), mute until a time, rule for similar ones */
        async setLevel(p, ctx) { const id = String(p?.id || ''); if (!/^NTF\./.test(id))
            throw new Error('NOTIFY_ID'); const lv = p?.level == null ? null : String(p.level); if (lv && !LEVELS.includes(lv))
            throw new Error('NOTIFY_LEVEL'); const st = await this.state(ctx.actorId); if (lv)
            st.levels[id] = lv;
        else
            delete st.levels[id]; await this.saveState(st, ctx); return { id, level: lv }; }
        async mute(p, ctx) { const id = String(p?.id || ''); if (!/^NTF\./.test(id))
            throw new Error('NOTIFY_ID'); const min = Number(p?.minutes); if (!(min >= 0 && min <= 60 * 24 * 31))
            throw new Error('NOTIFY_MUTE_MINUTES'); const st = await this.state(ctx.actorId); if (min === 0)
            delete st.muted[id];
        else
            st.muted[id] = new Date(this.clock() + min * 60000).toISOString(); await this.saveState(st, ctx); return { id, until: st.muted[id] || null }; }
        async setLevelRule(p, ctx) { const owner = String(p?.ownerApp || ''); if (!/^APP\./.test(owner))
            throw new Error('NOTIFY_RULE_OWNER'); const key = p?.kindCode ? `${owner}|${String(p.kindCode)}` : owner; const lv = p?.level == null ? null : String(p.level); if (lv && !LEVELS.includes(lv))
            throw new Error('NOTIFY_LEVEL'); const st = await this.state(ctx.actorId); if (lv)
            st.levelRules[key] = lv;
        else
            delete st.levelRules[key]; await this.saveState(st, ctx); return { rule: key, level: lv }; }
        async inbox(actorId, opts = {}) {
            if (typeof actorId !== 'string' || !actorId.trim())
                throw new Error('NOTIFY_ACTOR_REQUIRED');
            const nowMs = this.clock(), today = localDate(nowMs), rules = await this.rules(actorId), st = await this.state(actorId);
            const items = [], sourceErrors = [], lockedSources = [];
            if (rules.enabled) {
                for (const src of this.sources.values()) {
                    const hubRule = rules.hubs[src.ownerApp] || { enabled: true, leadDays: null };
                    if (!hubRule.enabled)
                        continue;
                    let rows;
                    try {
                        rows = await src.list(actorId);
                    }
                    catch (e) {
                        const m = String(e?.message || e);
                        if (m.startsWith('AUTH_SESSION_REQUIRED_FOR_HUB')) {
                            lockedSources.push(src.ownerApp);
                            continue;
                        }
                        sourceErrors.push({ ownerApp: src.ownerApp, error: m.slice(0, 160) });
                        continue;
                    }
                    for (const r of rows) {
                        const due = dayOf(r.dueAt);
                        if (!due)
                            continue;
                        const diff = daysBetween(today, due);
                        let state = null;
                        if (diff < 0)
                            state = 'OVERDUE';
                        else if (diff === 0)
                            state = 'DUE_TODAY';
                        else if (hubRule.leadDays != null && diff <= hubRule.leadDays)
                            state = 'UPCOMING';
                        if (!state)
                            continue;
                        const owner = r.ownerApp || src.ownerApp, marked = r.marked === true, sensitive = SENSITIVE.has(owner) || marked;
                        const id = 'NTF.' + (await sha(JSON.stringify([owner, r.sourceId, due]))).slice(0, 32);
                        if (st.dismissed[id] && !opts.includeDismissed)
                            continue;
                        // R23: an item the user marked sensitive stays hidden unless showMarkedSensitive; hub-level rules (R22) do not override it
                        const redacted = marked ? !rules.showMarkedSensitive : (sensitive && !(rules.showSensitiveDetails || rules.sensitiveShow[owner] === true));
                        items.push({ id, ownerApp: owner, state, dueAt: due, daysUntil: diff, kindCode: r.kindCode, sensitive, marked, redacted, read: !!st.read[id], dismissed: !!st.dismissed[id],
                            title: redacted ? null : r.label, subject: redacted ? null : (r.subject || null), deepLink: { kind: 'APP', id: owner } });
                    }
                }
            }
            /* N2.5q: level = own change > rule for similar (hub|kind, hub) > default by state; POSTPONED goes to „unfinished“, muted ones do not count */
            const DEF = { OVERDUE: 'WARNING', DUE_TODAY: 'NOTICE', UPCOMING: 'INFO' };
            const postponed = [];
            const nowIso = new Date(nowMs).toISOString();
            for (let i = items.length - 1; i >= 0; i--) {
                const it = items[i];
                const own = st.levels[it.id];
                const rule = st.levelRules[`${it.ownerApp}|${it.kindCode || ''}`] || st.levelRules[it.ownerApp];
                it.level = own || rule || DEF[it.state] || 'NOTICE';
                it.levelSource = own ? 'OWN' : rule ? 'RULE' : 'DEFAULT';
                it.muted = !!(st.muted[it.id] && String(st.muted[it.id]) > nowIso);
                it.mutedUntil = it.muted ? st.muted[it.id] : null;
                if (it.level === 'POSTPONED') {
                    postponed.push(it);
                    items.splice(i, 1);
                }
            }
            const rank = { OVERDUE: 0, DUE_TODAY: 1, UPCOMING: 2 };
            const lr = { ALARM: 0, WARNING: 1, NOTICE: 2, INFO: 3 };
            items.sort((a, b) => lr[a.level] - lr[b.level] || rank[a.state] - rank[b.state] || a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
            return { contract: 'KX.CORE_NOTIFICATIONS/1', generatedAt: new Date(nowMs).toISOString(), today, enabled: rules.enabled, quiet: inQuiet(rules.quietHours, nowMs),
                counts: { total: items.length, unread: items.filter(i => !i.read).length, overdue: items.filter(i => i.state === 'OVERDUE').length,
                    badge: items.filter((i) => !i.read && !i.muted && ['ALARM', 'WARNING', 'NOTICE'].includes(i.level)).length, warnings: items.filter((i) => ['ALARM', 'WARNING'].includes(i.level)).length, postponed: postponed.length }, items, postponed, sourceErrors, lockedSources };
        }
        // N2.1b (F16): OS/system delivery. Each notification is delivered once (state.delivered), never during
        // quiet hours, never when disabled; sensitive hubs carry no names unless the user opted in.
        // A failed delivery is returned (not hidden) and retried next time.
        async deliver(sink, ctx) {
            if (typeof sink !== 'function')
                throw new Error('NOTIFY_SINK_REQUIRED');
            const rules = await this.rules(ctx.actorId);
            if (!rules.enabled || !rules.systemNotifications)
                return { delivered: 0, failed: [], skipped: 'DISABLED' };
            const box = await this.inbox(ctx.actorId);
            if (box.quiet)
                return { delivered: 0, failed: [], skipped: 'QUIET_HOURS' };
            const st = await this.state(ctx.actorId);
            const loc = this.core.i18n?.getLocale ? await this.core.i18n.getLocale(ctx.actorId) : 'cs';
            const tr = (k, f) => this.core.i18n?.t ? this.core.i18n.t(k, loc) : f;
            const failed = [];
            let delivered = 0;
            for (const n of box.items) {
                if (n.read || st.delivered[n.id])
                    continue;
                const hub = this.core.i18n?.label?.(n.ownerApp, loc, { short: true }) || n.ownerApp;
                const msg = { id: n.id, title: `${tr('notify.state.' + n.state, n.state)} · ${hub} · ${n.redacted ? tr('notify.sensitiveShort', 'citlivý termín') : [n.subject, n.title].filter(Boolean).join(' – ')}`, dueAt: n.dueAt, ownerApp: n.ownerApp, sensitive: n.sensitive };
                let r;
                try {
                    r = await sink(msg);
                }
                catch (e) {
                    r = { ok: false, reason: String(e?.message || e) };
                }
                if (r?.ok === true) {
                    st.delivered[n.id] = true;
                    delivered++;
                }
                else
                    failed.push({ id: n.id, reason: String(r?.reason || 'DELIVERY_FAILED').slice(0, 120) });
            }
            if (delivered)
                await this.saveState(st, ctx);
            return { delivered, failed, skipped: null };
        }
        async mark(input, ctx, what) {
            const ids = Array.isArray(input?.ids) ? input.ids : [];
            if (!ids.length || ids.length > 500 || ids.some((x) => typeof x !== 'string' || !/^NTF\.[0-9a-f]{32}$/.test(x)))
                throw new Error('NOTIFY_IDS_INVALID');
            const st = await this.state(ctx.actorId); /* N2.5i: restore = back from Skryté (nothing was deleted) */
            for (const id of ids) {
                if (what === 'restore')
                    delete st.dismissed[id];
                else
                    st[what][id] = true;
            }
            await this.saveState(st, ctx);
            return { marked: ids.length };
        }
    }
    NS.SENSITIVE = [...SENSITIVE];
    NS.NotificationService = NotificationService;
    NS.validateRules = validateRules;
    NS.scheduleDomainSource = scheduleDomainSource;
    NS.vehiclesSource = vehiclesSource;
    NS.coreTasksSource = coreTasksSource;
    NS.install = (core, options = {}) => {
        if (core.notifications)
            throw new Error('Notifications already installed');
        if (!core?.settings?.set || !core?.actions?.register)
            throw new Error('Notifications require Core settings + ActionBus');
        const svc = new NotificationService(core, options.now);
        const reg = [];
        core.notifications = svc;
        try {
            if (core.processes?.notificationSource)
                svc.registerSource(core.processes.notificationSource());
        }
        catch { }
        ;
        try {
            for (const [code, h] of [['ACTION.CORE.NOTIFICATION.READ', (p, c) => svc.mark(p, c, 'read')], ['ACTION.CORE.NOTIFICATION.DISMISS', (p, c) => svc.mark(p, c, 'dismissed')], ['ACTION.CORE.NOTIFICATION.RESTORE', (p, c) => svc.mark(p, c, 'restore')], ['ACTION.CORE.NOTIFICATION.RULES.SET', (p, c) => svc.setRules(p, c)], ['ACTION.CORE.NOTIFICATION.LEVEL', (p, c) => svc.setLevel(p, c)], ['ACTION.CORE.NOTIFICATION.MUTE', (p, c) => svc.mute(p, c)], ['ACTION.CORE.NOTIFICATION.LEVEL_RULE', (p, c) => svc.setLevelRule(p, c)]]) {
                core.actions.register({ code, ownerApp: 'APP.KX.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: h });
                reg.push(code);
            }
            if (options.coreTasks !== false && core.tasks?.list && core.access?.can)
                svc.registerSource(coreTasksSource(core));
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, 'APP.KX.NEXUS');
            delete core.notifications;
            throw e;
        }
        return Object.freeze({ contract: 'KX.CORE_NOTIFICATIONS/1', actions: 3, sources: svc.sourceKeys() });
    };
    // Attach every installed hub domain as a source (call after hub installs; idempotent per hub).
    NS.attachInstalledHubs = (core, domains) => {
        const svc = core.notifications;
        if (!svc)
            throw new Error('Notifications not installed');
        const attached = [];
        for (const m of domains) {
            if (!m)
                continue;
            if (m.OWNER === 'APP.KX.VEHICLES' && core.vehicles) {
                attached.push(svc.registerSource(vehiclesSource(core.vehicles)));
                continue;
            }
            /* N2.3h: a composite hub (e.g. PRINT3D: printers / filaments / projects) attaches every hub-kit part as its own source */
            const parts = m.parts ? Object.values(m.parts) : [m];
            for (const part of parts) {
                const cfg = part?.config;
                if (!cfg || !core[cfg.serviceKey])
                    continue;
                const src = scheduleDomainSource(cfg.owner, core[cfg.serviceKey], cfg);
                if (parts.length > 1)
                    src.kind = `HUB_DOMAIN.${cfg.serviceKey}`;
                attached.push(svc.registerSource(src));
            }
        }
        return attached;
    };
})(KXNotifications || (KXNotifications = {}));
