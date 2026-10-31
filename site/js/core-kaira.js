// N2.5e (user 2026-10-24): Kaira – learns PER USER and helps fully. Local-first, explainable, always optional.
//  - LEARNS from the user's OWN audit trail (what, when, in which hub) – no hub has to be changed; per-user profile record in
//    the user's personal space (never shared, never exported for others, resettable): hub / action counts, hour-of-day
//    histogram, „what follows what“ (sequences within 30 min), feedback weights per suggestion type.
//  - SUGGESTS (only from data the user may read): „usually now“ (hour habits), „next step“ (sequences), recurring payments
//    (≥ 3 similar monthly movements without a series), contacts' birthdays / name days in 7 days, overdue tasks; every
//    suggestion says WHY; accept / dismiss trains the weights (per user); dismissed ones rest for 14 days.
//  - BRIEFING: greeting, today (events, tasks, payments due), top suggestions, one joke (own clean collection, no repeats
//    until all were used), news only with a connected AI / news source (otherwise says so).
//  - Children get Kaira too – the same rules, they only ever see their own readable data.
var KXKaira;
(function () {
    const OWNER = 'APP.KX.NEXUS', PROFILE = 'CORE.KAIRA.PROFILE', DAY = 86400000;
    /* jokes live in the text catalogue (ka.joke.N) – translatable like the rest of NEXUS */
    const JOKES = [['tech', 'ka.joke.1'], ['tech', 'ka.joke.2'], ['tech', 'ka.joke.3'], ['tech', 'ka.joke.4'], ['tech', 'ka.joke.5'], ['tech', 'ka.joke.6'], ['tech', 'ka.joke.7'], ['tech', 'ka.joke.8'], ['tech', 'ka.joke.9'], ['rodina', 'ka.joke.10'], ['rodina', 'ka.joke.11'], ['rodina', 'ka.joke.12'], ['rodina', 'ka.joke.13'], ['rodina', 'ka.joke.14'], ['rodina', 'ka.joke.15'], ['skola', 'ka.joke.16'], ['skola', 'ka.joke.17'], ['skola', 'ka.joke.18'], ['sport', 'ka.joke.19'], ['sport', 'ka.joke.20'], ['sport', 'ka.joke.21'], ['prace', 'ka.joke.22'], ['prace', 'ka.joke.23'], ['prace', 'ka.joke.24'], ['prace', 'ka.joke.25'], ['obecne', 'ka.joke.26'], ['obecne', 'ka.joke.27'], ['obecne', 'ka.joke.28'], ['obecne', 'ka.joke.29'], ['obecne', 'ka.joke.30']];
    const TX = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    function install(core) {
        if (core.kaira)
            return core.kaira;
        const C = (a) => ({ actorId: a, appCode: OWNER, permissions: [], confirmed: true });
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const pid = (u) => `${PROFILE}.${String(u).replace(/[^A-Z0-9_.]/gi, '_')}`;
        const empty = () => ({ hubs: {}, actions: {}, hours: {}, next: {}, feedback: {}, rested: {}, jokesSeen: [], lastAuditAt: '', learnedFrom: 0, persona: null });
        /* N2.5e (user): Kaira's personality per user – groups of choices; CHARMING only for adults (never children) */
        const PERSONA = { tone: ['DIRECT', 'HONEST', 'KIND', 'CHARMING', 'FORMAL'], honesty: ['DIPLOMATIC', 'HONEST', 'VERY_DIRECT'], length: ['SHORT', 'NORMAL', 'DETAILED'], humor: ['NONE', 'SOMETIMES', 'LOTS'], address: ['TY', 'VY'] };
        const DEF_PERSONA = { tone: 'KIND', honesty: 'HONEST', length: 'NORMAL', humor: 'SOMETIMES', address: 'TY', nickname: '', voice: { name: '', rate: 1, pitch: 1, volume: 1 }, voiceProfiles: [] };
        const personaOf = (d) => ({ ...DEF_PERSONA, ...(d.persona || {}), voice: { ...DEF_PERSONA.voice, ...(d.persona?.voice || {}) } });
        /* providers – ANY hub or core service can feed Kaira: registerProvider(code, async (actorId, now) => suggestions[]) */
        const providers = new Map();
        async function profile(u) { const r = await core.entities.get(pid(u)).catch(() => null); return { row: r, data: { ...empty(), ...(r?.data || {}) } }; }
        async function store(u, row, data) {
            const sp = ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
            if (!sp)
                return null;
            return core.entities.save({ id: pid(u), type: PROFILE, ownerApp: OWNER, schema: 'KX.KAIRA_PROFILE/1', spaceIds: [sp], expectedRevision: row?.revision, data }, C(u));
        }
        const hubOf = (a) => String(a.appCode || 'APP.KX.NEXUS').replace(/^APP\.NEXUS$/, 'APP.KX.NEXUS');
        const svc = { JOKES, PERSONA,
            registerProvider(code, fn) { if (!/^[A-Z0-9_.]+$/.test(String(code)) || typeof fn !== 'function')
                throw new Error('KAIRA_PROVIDER_INVALID'); if (providers.has(code))
                throw new Error('KAIRA_PROVIDER_EXISTS'); providers.set(code, fn); }, providerCodes() { return [...providers.keys()]; },
            async persona(_p, ctx) { const { data } = await profile(ctx.actorId); return personaOf(data); },
            async setPersona(p, ctx) {
                const u = ctx.actorId;
                const { row, data } = await profile(u);
                const cur = personaOf(data);
                const nx = { ...cur };
                for (const [k, opts] of Object.entries(PERSONA))
                    if (p?.[k] != null) {
                        if (!opts.includes(p[k]))
                            throw new Error(`KAIRA_PERSONA_${k.toUpperCase()}`);
                        nx[k] = p[k];
                    }
                if (nx.tone === 'CHARMING' && core.hubRights && (await core.hubRights.roleOf(u)) === 'CHILD')
                    throw new Error('KAIRA_PERSONA_NOT_FOR_CHILDREN');
                if (p?.nickname != null)
                    nx.nickname = String(p.nickname).slice(0, 30);
                if (p?.voice) {
                    const v = p.voice;
                    nx.voice = { name: String(v.name ?? cur.voice.name).slice(0, 80), rate: Math.min(2, Math.max(0.5, Number(v.rate ?? cur.voice.rate))), pitch: Math.min(2, Math.max(0, Number(v.pitch ?? cur.voice.pitch))), volume: Math.min(1, Math.max(0, Number(v.volume ?? cur.voice.volume))) };
                }
                if (Array.isArray(p?.voiceProfiles))
                    nx.voiceProfiles = p.voiceProfiles.slice(0, 10).map((x) => ({ name: String(x?.name || '').slice(0, 40), voice: String(x?.voice || '').slice(0, 80), rate: Number(x?.rate) || 1, pitch: Number(x?.pitch) || 1, volume: Number(x?.volume) || 1 })).filter((x) => x.name);
                data.persona = nx;
                await store(u, row, data);
                return nx;
            },
            /* learn from the user's OWN audit entries since the last run (idempotent) */
            async learn(_p, ctx) {
                const u = ctx.actorId;
                const { row, data } = await profile(u);
                const since = String(data.lastAuditAt || '');
                /* N2.5j: learn only from what the PERSON did – read actions (lists, status checks, capability probes) run automatically
                   while the screen is drawn and are skipped; writes (save, add, move …) are the user's intent */
                const riskOf = new Map();
                try {
                    for (const d of core.actions.list())
                        riskOf.set(d.code, String(d.risk || ''));
                }
                catch { }
                const mine = (await core.audit.list()).filter((a) => a.actorId === u && a.result === 'OK' && riskOf.get(String(a.actionCode)) !== 'READ' && String(a.at) > since && !/(^|\.)KAIRA\./.test(String(a.actionCode)) && a.entityType !== PROFILE /* Kaira never learns from herself */).sort((a, b) => String(a.at).localeCompare(String(b.at)));
                let prev = null;
                for (const a of mine) {
                    const hub = hubOf(a), act = String(a.actionCode);
                    data.hubs[hub] = (data.hubs[hub] || 0) + 1;
                    data.actions[act] = (data.actions[act] || 0) + 1;
                    const h = new Date(a.at).getHours();
                    (data.hours[hub] = data.hours[hub] || Array(24).fill(0))[h]++;
                    if (prev && new Date(a.at).getTime() - new Date(prev.at).getTime() < 30 * 60000 && hubOf(prev) !== hub) {
                        const k = hubOf(prev);
                        data.next[k] = data.next[k] || {};
                        data.next[k][hub] = (data.next[k][hub] || 0) + 1;
                    }
                    prev = a;
                }
                if (!mine.length)
                    return { learned: 0, total: data.learnedFrom };
                data.lastAuditAt = mine[mine.length - 1].at;
                data.learnedFrom += mine.length;
                await store(u, row, data);
                return { learned: mine.length, total: data.learnedFrom };
            },
            /* what Kaira learned – shown to the user (transparency) */
            async insights(_p, ctx) {
                const { data } = await profile(ctx.actorId);
                const top = (o, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
                return { learnedFrom: data.learnedFrom, topHubs: top(data.hubs), busyHours: Object.fromEntries(Object.entries(data.hours).map(([h, arr]) => [h, arr.indexOf(Math.max(...arr))])), feedback: data.feedback };
            },
            async reset(_p, ctx) { const { row } = await profile(ctx.actorId); await store(ctx.actorId, row, empty()); return true; },
            /* suggestions – only from readable data; each with WHY; weighted by the user's feedback */
            async suggest(p, ctx) {
                const u = ctx.actorId;
                const now = p?.now ? new Date(p.now) : new Date();
                const { data } = await profile(u);
                const out = [];
                const w = (t) => { const f = data.feedback[t] || { a: 0, d: 0 }; return (f.a + 1) / (f.d + 1); };
                const hour = now.getHours();
                /* the home hub (NEXUS itself) is never suggested – the user is already there */ const HOME = new Set(['APP.KX.NEXUS', 'APP.NEXUS']);
                for (const [hub, arr] of Object.entries(data.hours)) {
                    if (HOME.has(hub))
                        continue;
                    const n = arr[hour] || 0;
                    if (n >= 3)
                        out.push({ id: `NOW:${hub}:${hour}`, type: 'HABIT', title: hub, why: TX('ka.why.habit', { n }), action: { kind: 'OPEN_HUB', hub }, score: n * w('HABIT') });
                }
                const lastHub = Object.keys(data.next).length ? (() => { let best = null; for (const [a, m] of Object.entries(data.next))
                    for (const [b, n] of Object.entries(m))
                        if (!HOME.has(b) && (!best || n > best.n))
                            best = { a, b, n }; return best; })() : null;
                if (lastHub && lastHub.n >= 3)
                    out.push({ id: `NEXT:${lastHub.a}:${lastHub.b}`, type: 'NEXT', title: lastHub.b, why: TX('ka.why.next', { from: lastHub.a, n: lastHub.n }), action: { kind: 'OPEN_HUB', hub: lastHub.b }, score: lastHub.n * w('NEXT') });
                /* recurring payments without a series: ≥ 3 movements of one counterparty, ~monthly, similar amount */
                const groups = new Map();
                for (const r of await core.entities.list()) {
                    if (r.type !== 'APP.FINANCE.MOVEMENT' || r.archivedAt || r.data?.seriesId)
                        continue;
                    if (!await readable(r, u))
                        continue;
                    const k = norm(r.data?.counterparty);
                    if (!k)
                        continue;
                    if (!groups.has(k))
                        groups.set(k, []);
                    groups.get(k).push(r);
                }
                for (const [k, rows] of groups) {
                    if (rows.length < 3)
                        continue;
                    const ds = rows.map((r) => new Date(r.data?.date || r.createdAt).getTime()).sort((a, b) => a - b);
                    const gaps = ds.slice(1).map((d, i) => (d - ds[i]) / DAY);
                    const am = rows.map((r) => Math.abs(Number(r.data?.amount) || 0));
                    const avg = am.reduce((a, b) => a + b, 0) / am.length;
                    if (gaps.every(g => g >= 25 && g <= 35) && am.every(a => Math.abs(a - avg) <= avg * 0.1)) { /* monthly on the same day („21. každý měsíc“) → the same day next month; otherwise the average gap */
                        const dom = ds.map(d => new Date(d).getDate());
                        const last = new Date(ds[ds.length - 1]);
                        const next = dom.every(d => Math.abs(d - dom[0]) <= 1) ? new Date(last.getFullYear(), last.getMonth() + 1, Math.min(dom[dom.length - 1], new Date(last.getFullYear(), last.getMonth() + 2, 0).getDate()), 12) : new Date(ds[ds.length - 1] + Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) * DAY);
                        out.push({ id: `RECUR:${k}`, type: 'RECURRING', title: String(rows[0].data?.counterparty), why: TX('ka.why.recurring', { n: rows.length, amount: Math.round(avg), cur: rows[0].data?.currency || 'CZK', next: next.toISOString().slice(0, 10) }), action: { kind: 'CREATE_SERIES', counterparty: rows[0].data?.counterparty, amount: Math.round(avg * 100) / 100, next: next.toISOString().slice(0, 10) }, score: (rows.length + 2) * w('RECURRING') });
                    }
                }
                /* contacts' birthdays / name days in the next 7 days (yearly events made by contacts) */
                const in7 = new Date(now.getTime() + 7 * DAY).toISOString();
                for (const e of await core.calendar.list()) {
                    if (e.archivedAt || e.sourceEntityType !== 'CORE.CONTACT')
                        continue;
                    if (String(e.startsAt) < now.toISOString() || String(e.startsAt) > in7)
                        continue;
                    try {
                        await core.inspector.inspect({ kind: 'CALENDAR_EVENT', id: e.id }, u);
                    }
                    catch {
                        continue;
                    }
                    out.push({ id: `DATE:${e.id}`, type: 'DATES', title: e.title, why: TX('ka.why.inDays', { n: Math.max(0, Math.ceil((new Date(e.startsAt).getTime() - now.getTime()) / DAY)) }), action: { kind: 'OPEN', ref: core.deepLinks.build({ kind: 'CALENDAR_EVENT', id: e.id }) }, score: 5 * w('DATES') });
                }
                /* overdue tasks of the user */
                for (const t of await core.tasks.list()) {
                    if (t.archivedAt || t.status === 'DONE' || !t.dueAt || t.dueAt > now.toISOString())
                        continue;
                    if (!(t.assigneeIds || []).includes(u) && t.createdBy !== u)
                        continue;
                    try {
                        await core.inspector.inspect({ kind: 'TASK', id: t.id }, u);
                    }
                    catch {
                        continue;
                    }
                    out.push({ id: `LATE:${t.id}`, type: 'OVERDUE', title: t.title, why: TX('ka.why.overdue', { date: String(t.dueAt).slice(0, 10) }), action: { kind: 'OPEN', ref: core.deepLinks.build({ kind: 'TASK', id: t.id }) }, score: 6 * w('OVERDUE') });
                }
                /* registered providers (hubs / core services) – each guarded, each suggestion must carry WHY */
                for (const [code, fn] of providers) {
                    try {
                        for (const x of (await fn(u, now)) || []) {
                            if (!x?.id || !x?.why)
                                continue;
                            out.push({ ...x, provider: code, score: (Number(x.score) || 3) * w(String(x.type || code)) });
                        }
                    }
                    catch { }
                }
                const resting = (id) => data.rested[id] && now.getTime() - new Date(data.rested[id]).getTime() < 14 * DAY;
                return out.filter(x => !resting(x.id)).sort((a, b) => b.score - a.score).slice(0, Math.min(20, Number(p?.limit) || 8));
            },
            /* accept / dismiss → learns (per user, per suggestion type) */
            async feedback(p, ctx) { const u = ctx.actorId; const { row, data } = await profile(u); const t = String(p?.type || 'OTHER'); const f = data.feedback[t] || { a: 0, d: 0 }; if (p?.accepted)
                f.a++;
            else {
                f.d++;
                data.rested[String(p?.id || '')] = new Date().toISOString();
            } data.feedback[t] = f; await store(u, row, data); return { type: t, weight: (f.a + 1) / (f.d + 1) }; },
            /* morning briefing – today + suggestions + a joke (no repeats until all used); news only with a connected source */
            async briefing(p, ctx) {
                const u = ctx.actorId;
                const now = p?.now ? new Date(p.now) : new Date();
                const { row, data } = await profile(u);
                const users = await core.memberships.listUsers();
                const name = String(users.find((x) => x.id === u)?.displayName || '').split(' ')[0];
                const h = now.getHours();
                const per = personaOf(data);
                const who = per.nickname || name;
                const part = h < 10 ? 'morning' : h < 18 ? 'day' : 'evening';
                const greeting = TX(`ka.hi.${part}.${per.tone}.${per.address}`) !== `ka.hi.${part}.${per.tone}.${per.address}` ? TX(`ka.hi.${part}.${per.tone}.${per.address}`, { name: who }) : TX('ka.hi.' + part) + (who ? ', ' + who : '');
                const dayEnd = new Date(now);
                dayEnd.setHours(23, 59, 59, 999);
                const today = [];
                for (const e of await core.calendar.list()) {
                    if (e.archivedAt || String(e.startsAt) < new Date(new Date(now).setHours(0, 0, 0, 0)).toISOString() || String(e.startsAt) > dayEnd.toISOString())
                        continue;
                    try {
                        await core.inspector.inspect({ kind: 'CALENDAR_EVENT', id: e.id }, u);
                        today.push({ kind: 'EVENT', title: e.title, at: e.startsAt });
                    }
                    catch { }
                }
                for (const t of await core.tasks.list()) {
                    if (t.archivedAt || t.status === 'DONE' || !t.dueAt || t.dueAt > dayEnd.toISOString())
                        continue;
                    if (!(t.assigneeIds || []).includes(u) && t.createdBy !== u)
                        continue;
                    try {
                        await core.inspector.inspect({ kind: 'TASK', id: t.id }, u);
                        today.push({ kind: 'TASK', title: t.title, at: t.dueAt });
                    }
                    catch { }
                }
                let joke = null;
                const humor = personaOf(data).humor;
                if (p?.jokes !== false && humor !== 'NONE' && (humor === 'LOTS' || now.getDate() % 2 === 0 || p?.jokes === true)) {
                    let pool = JOKES.map((_, i) => i).filter(i => !data.jokesSeen.includes(i));
                    if (!pool.length) {
                        data.jokesSeen = [];
                        pool = JOKES.map((_, i) => i);
                    }
                    const i = pool[(now.getDate() + now.getMonth() * 31 + u.length) % pool.length];
                    data.jokesSeen.push(i);
                    joke = { category: JOKES[i][0], key: JOKES[i][1], text: TX(JOKES[i][1]) };
                    await store(u, row, data);
                }
                const suggestions = await svc.suggest({ now: now.toISOString(), limit: { SHORT: 2, NORMAL: 3, DETAILED: 5 }[personaOf(data).length] || 3 }, ctx);
                return { persona: { tone: personaOf(data).tone, length: personaOf(data).length, humor: personaOf(data).humor }, greeting, today: today.sort((a, b) => String(a.at).localeCompare(String(b.at))), suggestions, joke, news: { available: false, note: TX('ka.news.needSource') } };
            } };
        /* built-in providers – the core services NEXUS already has (each only reads what the actor may read) */
        const T2 = (k, v) => TX(k, v);
        svc.registerProvider('CORE.INBOX', async (u) => { const n = core.inbox ? await core.inbox.count({ actorId: u }) : 0; return n ? [{ id: 'INBOX:' + n, type: 'INBOX', title: T2('ka.p.inbox'), why: T2('ka.why.inbox', { n }), action: { kind: 'OPEN_INBOX' }, score: 2 + Math.min(n, 5) }] : []; });
        svc.registerProvider('CORE.ISSUES', async (u) => { if (!core.issues?.list)
            return []; const r = await core.issues.list({}, u); const xs = Array.isArray(r) ? r : (r?.issues || []); const bad = xs.filter((x) => ['ERROR', 'WARNING'].includes(String(x.severity))); return bad.length ? [{ id: 'ISSUES:' + bad.length, type: 'ISSUES', title: T2('ka.p.issues'), why: T2('ka.why.issues', { n: bad.length }), action: { kind: 'OPEN_ISSUES' }, score: 3 + Math.min(bad.length, 5) }] : []; });
        svc.registerProvider('CORE.ASSIGNED', async (u, now) => { if (!core.links?.assignedTo)
            return []; const a = await core.links.assignedTo({ userId: u }, { actorId: u }); const soon = a.filter((x) => x.due && new Date(x.due).getTime() - now.getTime() < 2 * DAY); return soon.map((x) => ({ id: 'ASSIGNED:' + x.id, type: 'ASSIGNED', title: x.title, why: T2('ka.why.assigned', { date: String(x.due).slice(0, 10) }), action: { kind: 'OPEN', ref: x.ref }, score: 5 })); });
        svc.registerProvider('CORE.CONTACT_DUPLICATES', async (u) => { if (!core.contacts?.duplicates)
            return []; const d = await core.contacts.duplicates({}, { actorId: u }); return d.length ? [{ id: 'DUPS:' + d.length, type: 'CLEANUP', title: T2('ka.p.dups'), why: T2('ka.why.dups', { n: d.length }), action: { kind: 'OPEN_CONTACTS_DUPLICATES' }, score: 2 }] : []; });
        svc.registerProvider('CORE.SAME_NAMES', async (u) => { if (!core.names?.duplicates)
            return []; const d = await core.names.duplicates({}, { actorId: u }); return d.length ? [{ id: 'NAMES:' + d.length, type: 'CLEANUP', title: T2('ka.p.names'), why: T2('ka.why.names', { n: d.length }), action: { kind: 'OPEN_ISSUES' }, score: 1.5 }] : []; });
        svc.registerProvider('CORE.WORKLOAD', async (u) => { if (!core.links?.workload)
            return []; const me = (await core.links.workload({}, { actorId: u })).find((x) => x.userId === u); return me && me.load >= 3 ? [{ id: 'LOAD:' + Math.round(me.load), type: 'WORKLOAD', title: T2('ka.p.load'), why: T2('ka.why.load', { n: String(me.load).replace('.', ',') }), action: { kind: 'OPEN_WORKLOAD' }, score: 3 }] : []; });
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.KAIRA.LEARN', 'SAFE_WRITE', (p, c) => svc.learn(p, c));
        reg('ACTION.CORE.KAIRA.SUGGEST', 'READ', (p, c) => svc.suggest(p, c));
        reg('ACTION.CORE.KAIRA.FEEDBACK', 'SAFE_WRITE', (p, c) => svc.feedback(p, c));
        reg('ACTION.CORE.KAIRA.BRIEFING', 'SAFE_WRITE', (p, c) => svc.briefing(p, c));
        reg('ACTION.CORE.KAIRA.INSIGHTS', 'READ', (p, c) => svc.insights(p, c));
        reg('ACTION.CORE.KAIRA.RESET', 'SAFE_WRITE', (p, c) => svc.reset(p, c));
        reg('ACTION.CORE.KAIRA.PERSONA.GET', 'READ', (p, c) => svc.persona(p, c));
        reg('ACTION.CORE.KAIRA.PERSONA.SET', 'SAFE_WRITE', (p, c) => svc.setPersona(p, c));
        core.kaira = svc;
        return svc;
    }
    KXKaira = { install, JOKES }; /* PERSONA lists exported via core.kaira.PERSONA */
    globalThis.KXKaira = KXKaira;
})();
