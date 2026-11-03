// N2.5p: EXTENSION OF THE FINANCE HUB (same protected owner APP.KX.FINANCE – no new hub, user 2026-10-26). From the old Finance hub P7
// (looked at, not copied): ACCOUNTS + balance snapshots (balance = last snapshot + movements after it, difference check), MONTHLY BUDGET
// (plan per category × actual, counting of in-progress / drafts by the person's choice – N2.5o), PLANNED PAYMENTS → OUTLOOK for 36 MONTHS
// (user) + RESERVES (how much to put aside monthly for non-monthly payments), SAVING GOALS (progress, monthly need to the deadline),
// REIMBURSEMENTS (open amounts by state) and TRANSFER TYPES totals. All records in the spaces they belong to; only readable ones count.
var KXFinancePlan;
(function () {
    const OWNER = 'APP.KX.FINANCE', MOV = 'APP.FINANCE.MOVEMENT', ACC = 'APP.FINANCE.ACCOUNT', BAL = 'APP.FINANCE.BALANCE', BUD = 'APP.FINANCE.BUDGET', PLN = 'APP.FINANCE.PLANNED', GOAL = 'APP.FINANCE.GOAL';
    const ACC_KINDS = ['BANK', 'CASH', 'CARD', 'SAVINGS', 'LOAN'];
    const EVERY = { MONTHLY: 1, QUARTERLY: 3, HALFYEAR: 6, YEARLY: 12, ONCE: 0 };
    /* N2.5q: more intervals – weekly, every 14 days, every N months, chosen months (e.g. September + January) */ const EXTRA = ['WEEKLY', 'BIWEEKLY', 'EVERY_N', 'MONTHS', 'RULE']; /* N2.6b: RULE = shared repeat rule (KXRecur) */
    const CAPEX_T = 'APP.FINANCE.CAPEX', CASE_T = 'APP.FINANCE.CASE', PREF_T = 'APP.FINANCE.PREFS';
    const r2 = (n) => Math.round(n * 100) / 100;
    const CT = (k, d) => String(globalThis.KXI18n?.UI?.[k]?.cs || d);
    const ym = (d) => String(d).slice(0, 7);
    const isoD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const addM = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
    function install(core, opts = {}) {
        if (core.financePlan)
            return core.financePlan;
        const now = () => opts.now ? opts.now() : Date.now();
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const rows = async (type, u, spaceId) => { const out = []; for (const r of await core.entities.list()) {
            if (r.type !== type || r.archivedAt)
                continue;
            if (spaceId && !(r.spaceIds || []).includes(spaceId))
                continue;
            if (await readable(r, u))
                out.push(r);
        } return out; };
        const link = (r) => core.deepLinks.build({ kind: 'ENTITY', type: r.type, id: r.id });
        const put = async (type, p, ctx, data) => {
            const id = p?.id ? String(p.id) : null;
            const cur = id ? await core.entities.get(id) : null;
            if (cur && (cur.type !== type))
                throw new Error('FINANCE_PLAN_TYPE');
            const sp = cur ? cur.spaceIds : [String(p?.spaceId || '')];
            if (!sp[0])
                throw new Error('FINANCE_PLAN_SPACE');
            return core.entities.save(cur ? { ...cur, expectedRevision: cur.revision, data } : { type, ownerApp: OWNER, schema: 'KX.' + type + '/1', spaceIds: sp, data }, { ...ctx, appCode: OWNER });
        };
        /* N2.5q: occurrence dates of a planned payment between two dates (any interval) */
        const occRaw = (d, from, to) => {
            const out = [];
            const start = d.nextDate;
            const end = d.endDate && d.endDate < to ? d.endDate : to;
            if (start > end)
                return out;
            let guard = 0;
            if (d.every === 'RULE') {
                const RC = globalThis.KXRecur;
                if (!RC)
                    return out;
                for (const iso of RC.occurrences(String(d.rule || ''), start + 'T12:00:00', from + 'T00:00:00', end + 'T23:59:59', 2000)) {
                    const x = new Date(iso);
                    const ds = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
                    if (ds >= from && ds <= end && !out.includes(ds))
                        out.push(ds);
                }
                return out;
            }
            if (d.every === 'WEEKLY' || d.every === 'BIWEEKLY') {
                const step = (d.every === 'WEEKLY' ? 7 : 14) * 86400000;
                for (let t = Date.parse(start + 'T00:00:00Z'); guard++ < 2000; t += step) {
                    const x = new Date(t).toISOString().slice(0, 10);
                    if (x > end)
                        break;
                    if (x >= from)
                        out.push(x);
                }
                return out;
            }
            if (d.every === 'MONTHS') {
                const day = start.slice(8, 10);
                let y = Number(start.slice(0, 4));
                for (; guard++ < 80; y++) {
                    for (const m of d.months) {
                        const x = `${y}-${String(m).padStart(2, '0')}-${day}`;
                        if (x < start)
                            continue;
                        if (x > end)
                            return out;
                        if (x >= from)
                            out.push(x);
                    }
                }
                return out;
            }
            const step = d.every === 'EVERY_N' ? Number(d.n) : EVERY[d.every];
            let x = start;
            while (x <= end && guard++ < 800) {
                if (x >= from)
                    out.push(x);
                if (!step)
                    break;
                const nm = addM(x.slice(0, 7), step);
                x = `${nm}-${x.slice(8, 10)}`;
            }
            return out;
        };
        /* N2.6b (user: pay / move to next month / pause / cancel this month / cancel the repeat): per-occurrence exceptions and a pause applied in ONE place – outlook, reserves, matching and My day all read occ() */
        const occ = (d, from, to) => {
            const ex = d.exceptions || {};
            const pz = d.paused && d.paused.from ? String(d.paused.from) : null;
            const out = [];
            for (const x of occRaw(d, from, to)) {
                if (pz && x >= pz)
                    continue;
                const e = ex[x];
                if (e && (e.op === 'SKIP' || e.op === 'MOVE'))
                    continue;
                out.push(x);
            }
            for (const k of Object.keys(ex)) {
                const e = ex[k];
                if (e?.op === 'MOVE' && isoD(e.to) && e.to >= from && e.to <= to && !(pz && e.to >= pz))
                    out.push(e.to);
            }
            return out.sort();
        }; /* a moved payment is an EXTRA payment on its new date – never merged with the regular one on the same day */
        const movedFrom = (d, x) => { for (const k of Object.keys(d.exceptions || {})) {
            const e = d.exceptions[k];
            if (e?.op === 'MOVE' && e.to === x)
                return k;
        } return null; };
        const nextMonthSameDay = (date) => { const nm = addM(date.slice(0, 7), 1); const y = Number(nm.slice(0, 4)), m = Number(nm.slice(5, 7)); const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${nm}-${String(Math.min(Number(date.slice(8, 10)), dim)).padStart(2, '0')}`; };
        async function fprefs(u) { const id = PREF_T + '.' + String(u).replace(/[^A-Z0-9_.]/gi, '_'); const r = await core.entities.get(id).catch(() => null); return { id, row: r, data: { outlookMonths: 1, payday: 15, periodMode: 'MONTH_END', ...(r?.data || {}) } }; }
        const svc = { ACC_KINDS, EVERY: [...Object.keys(EVERY), ...EXTRA], occ,
            async plannedChange(p, ctx) {
                const id = String(p?.id || '');
                const cur = await core.entities.get(id);
                if (!cur || cur.type !== PLN || cur.archivedAt)
                    throw new Error('FINANCE_PLANNED_NOT_FOUND');
                const d = { ...cur.data, exceptions: { ...(cur.data?.exceptions || {}) } };
                const op = String(p?.op || '');
                const date = String(p?.date || '');
                const nowIso = new Date().toISOString();
                const today = nowIso.slice(0, 10);
                if (op === 'SKIP' || op === 'MOVE') {
                    if (!isoD(date) || !occRaw(d, date, date).includes(date))
                        throw new Error('FINANCE_PLANNED_NOT_AN_OCCURRENCE');
                    let to = null;
                    if (op === 'MOVE') {
                        to = p?.to ? String(p.to) : nextMonthSameDay(date);
                        if (!isoD(to) || to === date)
                            throw new Error('FINANCE_PLANNED_MOVE_DATE');
                    }
                    d.exceptions[date] = { op, to, at: nowIso, by: ctx.actorId };
                }
                else if (op === 'RESTORE') {
                    if (!d.exceptions[date])
                        throw new Error('FINANCE_PLANNED_NO_CHANGE');
                    delete d.exceptions[date];
                }
                else if (op === 'PAUSE') {
                    d.paused = { from: isoD(p?.from) ? String(p.from) : today, at: nowIso, by: ctx.actorId };
                }
                else if (op === 'RESUME') {
                    if (!d.paused)
                        throw new Error('FINANCE_PLANNED_NO_CHANGE');
                    delete d.paused;
                }
                else if (op === 'STOP') {
                    if (!isoD(date))
                        throw new Error('FINANCE_PLANNED_STOP_DATE');
                    d.endDate = new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
                    d.stoppedAt = nowIso;
                }
                else
                    throw new Error('FINANCE_PLANNED_OP');
                if (!Object.keys(d.exceptions).length)
                    delete d.exceptions;
                return put(PLN, { id }, ctx, d);
            },
            async plannedChanges(p, ctx) {
                const out = [];
                for (const r of await rows(PLN, ctx.actorId, p?.spaceId)) {
                    const d = r.data || {};
                    const base = { id: r.id, name: d.name, amount: d.amount, kind: d.kind };
                    for (const k of Object.keys(d.exceptions || {})) {
                        const e = d.exceptions[k];
                        out.push({ ...base, date: k, op: e.op, to: e.to || null, at: e.at });
                    }
                    if (d.paused)
                        out.push({ ...base, date: d.paused.from, op: 'PAUSE', at: d.paused.at });
                    if (d.stoppedAt)
                        out.push({ ...base, date: d.endDate, op: 'STOP', at: d.stoppedAt });
                }
                return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
            },
            async saveAccount(p, ctx) {
                const d = p?.data || {};
                if (!String(d.name || '').trim())
                    throw new Error('FINANCE_ACCOUNT_NAME');
                if (!ACC_KINDS.includes(d.kind))
                    throw new Error('FINANCE_ACCOUNT_KIND');
                if (!/^[A-Z]{3}$/.test(String(d.currency || '')))
                    throw new Error('FINANCE_CURRENCY');
                return put(ACC, p, ctx, { name: String(d.name).slice(0, 120), kind: d.kind, currency: d.currency, note: String(d.note || '').slice(0, 500) });
            },
            async saveBalance(p, ctx) {
                const d = p?.data || {};
                const acc = await core.entities.get(String(d.account || ''));
                if (!acc || acc.type !== ACC)
                    throw new Error('FINANCE_ACCOUNT_UNKNOWN');
                if (!isoD(d.date))
                    throw new Error('FINANCE_DATE');
                const a = Number(d.amount);
                if (!Number.isFinite(a))
                    throw new Error('FINANCE_AMOUNT');
                return put(BAL, { spaceId: acc.spaceIds[0] }, ctx, { account: acc.id, date: d.date, amount: r2(a) });
            },
            /* balance of an account at a date: last snapshot ≤ date + movements after it (by account reference or name); difference check vs a newer snapshot */
            async balances(p, ctx) {
                const u = ctx.actorId;
                const at = isoD(p?.date) ? p.date : new Date(now()).toISOString().slice(0, 10);
                const accs = await rows(ACC, u, p?.spaceId);
                const snaps = await rows(BAL, u);
                const movs = await rows(MOV, u);
                return accs.map((a) => {
                    const ref = link(a);
                    const own = (m) => m.data.accountRef === ref || (!m.data.accountRef && m.data.account && m.data.account === a.data.name);
                    const to = (m) => m.data.toAccountRef === ref || (!m.data.toAccountRef && m.data.toAccount && m.data.toAccount === a.data.name);
                    const ss = snaps.filter((s) => s.data.account === a.id && s.data.date <= at).sort((x, y) => x.data.date.localeCompare(y.data.date));
                    const base = ss[ss.length - 1];
                    const from = base ? base.data.date : '0000-00-00';
                    let bal = base ? base.data.amount : 0;
                    for (const m of movs) {
                        if (m.data.currency !== a.data.currency || m.data.date <= from || m.data.date > at)
                            continue;
                        if (own(m))
                            bal += m.data.kind === 'INCOME' ? m.data.amount : -m.data.amount;
                        else if (m.data.kind === 'TRANSFER' && to(m))
                            bal += m.data.amount;
                    }
                    return { id: a.id, name: a.data.name, kind: a.data.kind, currency: a.data.currency, balance: r2(bal), fromSnapshot: base ? base.data.date : null, snapshots: ss.length };
                });
            },
            /* check: snapshot vs computed from the previous snapshot + movements – the difference shows missing / wrong movements */
            async balanceCheck(p, ctx) {
                const u = ctx.actorId;
                const acc = await core.entities.get(String(p?.account || ''));
                if (!acc)
                    throw new Error('FINANCE_ACCOUNT_UNKNOWN');
                const ss = (await rows(BAL, u)).filter((s) => s.data.account === acc.id).sort((x, y) => x.data.date.localeCompare(y.data.date));
                if (ss.length < 2)
                    return { account: acc.id, checks: [] };
                const out = [];
                for (let i = 1; i < ss.length; i++) {
                    const prev = ss[i - 1], cur = ss[i];
                    const before = new Date(new Date(cur.data.date + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
                    const b = (await svc.balances({ date: before, spaceId: acc.spaceIds[0] }, ctx)).find((x) => x.id === acc.id);
                    const computed = b ? b.balance : prev.data.amount;
                    out.push({ date: cur.data.date, snapshot: cur.data.amount, computed, difference: r2(cur.data.amount - computed) });
                }
                return { account: acc.id, checks: out };
            },
            async saveBudget(p, ctx) {
                const d = p?.data || {};
                if (!/^\d{4}-\d{2}$/.test(String(d.month || '')))
                    throw new Error('FINANCE_BUDGET_MONTH');
                const lines = {};
                for (const [k, v] of Object.entries(d.lines || {})) {
                    const n = Number(v);
                    if (!Number.isFinite(n) || n < 0)
                        throw new Error('FINANCE_BUDGET_AMOUNT');
                    lines[String(k)] = r2(n);
                }
                const ex = (await rows(BUD, ctx.actorId, p?.spaceId)).find((b) => b.data.month === d.month && b.data.currency === (d.currency || 'CZK'));
                return put(BUD, ex ? { id: ex.id } : p, ctx, { month: d.month, currency: d.currency || 'CZK', lines });
            },
            /* plan × actual per category; actual respects the person's counting choice (in progress / drafts – N2.5o) and says what was left out */
            async budget(p, ctx) {
                const u = ctx.actorId;
                const month = String(p?.month || new Date(now()).toISOString().slice(0, 7));
                const cur = String(p?.currency || 'CZK');
                const b = (await rows(BUD, u, p?.spaceId)).find((x) => x.data.month === month && x.data.currency === cur);
                let movs = (await rows(MOV, u, p?.spaceId)).filter((m) => m.data.kind === 'EXPENSE' && ym(m.data.date) === month && m.data.currency === cur);
                let cf = null;
                if (core.workState) {
                    cf = await core.workState.countFilter({ ids: movs.map((m) => m.id) }, ctx);
                    const keep = new Set(cf.keep);
                    movs = movs.filter((m) => keep.has(m.id));
                }
                const actual = {};
                for (const m of movs)
                    actual[m.data.category] = r2((actual[m.data.category] || 0) + m.data.amount);
                const cats = [...new Set([...Object.keys(b?.data?.lines || {}), ...Object.keys(actual)])].sort();
                const lines = cats.map(c => { const plan = b?.data?.lines?.[c] ?? 0, act = actual[c] ?? 0; return { category: c, plan, actual: act, left: r2(plan - act), over: plan > 0 && act > plan }; });
                return { month, currency: cur, lines, totals: { plan: r2(lines.reduce((a, x) => a + x.plan, 0)), actual: r2(lines.reduce((a, x) => a + x.actual, 0)) }, counted: cf ? { excluded: cf.excluded, inProgress: cf.inProgress, drafts: cf.drafts, includeInProgress: cf.includeInProgress, includeDrafts: cf.includeDrafts } : null };
            },
            async savePlanned(p, ctx) {
                const d = p?.data || {};
                if (!String(d.name || '').trim())
                    throw new Error('FINANCE_PLANNED_NAME');
                const a = Number(d.amount);
                if (!(Number.isFinite(a) && a > 0))
                    throw new Error('FINANCE_AMOUNT');
                if (!(d.every in EVERY) && !EXTRA.includes(d.every))
                    throw new Error('FINANCE_PLANNED_EVERY');
                if (d.every === 'EVERY_N' && !(Number(d.n) >= 1 && Number(d.n) <= 60))
                    throw new Error('FINANCE_PLANNED_N');
                if (d.every === 'RULE' && !globalThis.KXRecur?.parse?.(String(d.rule || '')))
                    throw new Error('FINANCE_PLANNED_EVERY');
                if (d.every === 'MONTHS' && !(Array.isArray(d.months) && d.months.length && d.months.every((m) => Number(m) >= 1 && Number(m) <= 12)))
                    throw new Error('FINANCE_PLANNED_MONTHS');
                if (!isoD(d.nextDate))
                    throw new Error('FINANCE_DATE');
                if (!['INCOME', 'EXPENSE'].includes(d.kind || 'EXPENSE'))
                    throw new Error('FINANCE_KIND');
                const cur0 = p?.id ? await core.entities.get(String(p.id)).catch(() => null) : null; /* keep exceptions / pause / stop when the payment is edited */
                return put(PLN, p, ctx, { ...(cur0?.data?.exceptions ? { exceptions: cur0.data.exceptions } : {}), ...(cur0?.data?.paused ? { paused: cur0.data.paused } : {}), ...(cur0?.data?.stoppedAt ? { stoppedAt: cur0.data.stoppedAt } : {}), name: String(d.name).slice(0, 120), kind: d.kind || 'EXPENSE', amount: r2(a), currency: /^[A-Z]{3}$/.test(String(d.currency || '')) ? d.currency : 'CZK', category: String(d.category || 'OTHER'), every: d.every, n: d.every === 'EVERY_N' ? Number(d.n) : null, months: d.every === 'MONTHS' ? [...new Set(d.months.map(Number))].sort((a, b) => a - b) : null, rule: d.every === 'RULE' ? globalThis.KXRecur.build(globalThis.KXRecur.parse(String(d.rule))) : null, /* N2.6b: the shared repeat rule is stored (canonical) */ nextDate: d.nextDate, endDate: isoD(d.endDate) ? d.endDate : null, source: d.source || null,
                    /* N2.5q: payee account (CZ number or IBAN) and variable symbol – for pairing and the QR payment */ payeeAccount: String(d.payeeAccount || '').replace(/\s+/g, '').slice(0, 40), vs: /^\d{1,10}$/.test(String(d.vs || '')) ? String(d.vs) : '' });
            },
            /* OUTLOOK: planned payments projected per month (default 36 months – user), + RESERVES for non-monthly expenses */
            async outlook(p, ctx) {
                const u = ctx.actorId;
                const n = Math.max(1, Math.min(60, Number(p?.months) || 36));
                const start = String(p?.from || new Date(now()).toISOString().slice(0, 7));
                const cur = String(p?.currency || 'CZK');
                const months = [];
                for (let i = 0; i < n; i++)
                    months.push({ month: addM(start, i), income: 0, expense: 0, items: [] });
                const end = addM(start, n - 1);
                for (const r of await rows(PLN, u, p?.spaceId)) {
                    const d = r.data;
                    if (d.currency !== cur)
                        continue;
                    const step = EVERY[d.every];
                    let m = ym(d.nextDate);
                    let guard = 0;
                    void step;
                    void m;
                    void guard;
                    for (const x of occ(d, start + '-01', end + '-31')) {
                        const slot = months.find((q) => q.month === ym(x));
                        if (slot) {
                            slot[d.kind === 'INCOME' ? 'income' : 'expense'] += d.amount;
                            slot.items.push({ id: r.id, name: d.name, amount: d.amount, kind: d.kind, date: x, movedFrom: movedFrom(d, x) });
                        }
                    }
                }
                /* N2.5q: CAPEX financing payments (loan / lease) count into the outlook */ for (const r of await rows(CAPEX_T, u, p?.spaceId)) {
                    const d = r.data;
                    if (d.currency !== cur || d.financing === 'CASH')
                        continue;
                    for (let i = 1; i <= d.finMonths; i++) {
                        const m = addM(ym(d.date), i);
                        const slot = months.find((q) => q.month === m);
                        if (slot) {
                            slot.expense += d.finMonthly;
                            slot.items.push({ id: r.id, name: '🏗 ' + d.name, amount: d.finMonthly, kind: 'EXPENSE', capex: true });
                        }
                    }
                }
                /* gifts planned at contacts' occasions (birthdays, anniversaries …) count into the outlook every year – only readable contacts, in this space */
                let gifts = 0;
                if (core.contacts && p?.includeGifts !== false) {
                    try {
                        const g = await core.contacts.gifts({ days: 400 }, ctx);
                        for (const x of g.items) {
                            if (x.done || !(x.budget > 0))
                                continue;
                            if (p?.spaceId && !(x.spaceIds || []).includes(p.spaceId))
                                continue;
                            for (let y = 0; y < 4; y++) {
                                const m = ym(String(Number(x.date.slice(0, 4)) + y) + x.date.slice(4));
                                const slot = months.find((q) => q.month === m);
                                if (slot && cur === 'CZK') {
                                    slot.expense += x.budget;
                                    slot.items.push({ id: x.contactId, name: '🎁 ' + x.name, amount: x.budget, kind: 'EXPENSE', gift: true });
                                    gifts += x.budget;
                                }
                            }
                        }
                    }
                    catch { }
                }
                for (const s of months) {
                    s.income = r2(s.income);
                    s.expense = r2(s.expense);
                    s.net = r2(s.income - s.expense);
                }
                /* reserves: payments less often than monthly → amount per year / 12 */ const perYear = (d) => d.every === 'EVERY_N' ? 12 / Number(d.n) : d.every === 'MONTHS' ? d.months.length : d.every === 'ONCE' || d.every === 'MONTHLY' || d.every === 'WEEKLY' || d.every === 'BIWEEKLY' ? 0 : 12 / EVERY[d.every];
                const reserves = (await rows(PLN, u, p?.spaceId)).filter((r) => r.data.kind === 'EXPENSE' && r.data.currency === cur && perYear(r.data) > 0 && perYear(r.data) < 12).map((r) => ({ id: r.id, name: r.data.name, every: r.data.every, amount: r.data.amount, monthly: r2(r.data.amount * perYear(r.data) / 12), nextDate: r.data.nextDate }));
                return { from: start, months: n, currency: cur, outlook: months, reserves, reserveMonthly: r2(reserves.reduce((a, x) => a + x.monthly, 0)), giftsTotal: r2(gifts), totals: { income: r2(months.reduce((a, x) => a + x.income, 0)), expense: r2(months.reduce((a, x) => a + x.expense, 0)) } };
            },
            async saveGoal(p, ctx) {
                const d = p?.data || {};
                if (!String(d.name || '').trim())
                    throw new Error('FINANCE_GOAL_NAME');
                const t = Number(d.target);
                if (!(Number.isFinite(t) && t > 0))
                    throw new Error('FINANCE_AMOUNT');
                return put(GOAL, p, ctx, { name: String(d.name).slice(0, 120), target: r2(t), currency: /^[A-Z]{3}$/.test(String(d.currency || '')) ? d.currency : 'CZK', deadline: isoD(d.deadline) ? d.deadline : null, start: Number(d.start) > 0 ? r2(Number(d.start)) : 0 });
            },
            /* goals: saved = start + movements linked to the goal (income / transfer into it count +, expense from it −); monthly need to the deadline */
            async goals(p, ctx) {
                const u = ctx.actorId;
                const movs = await rows(MOV, u);
                const t0 = new Date(now()).toISOString().slice(0, 7);
                return (await rows(GOAL, u, p?.spaceId)).map((g) => {
                    const ref = link(g);
                    let saved = g.data.start || 0;
                    for (const m of movs) {
                        if (m.data.goalRef !== ref || m.data.currency !== g.data.currency)
                            continue;
                        saved += m.data.kind === 'EXPENSE' ? -m.data.amount : m.data.amount;
                    }
                    const left = r2(Math.max(0, g.data.target - saved));
                    let monthsLeft = null;
                    if (g.data.deadline) {
                        const [y1, m1] = t0.split('-').map(Number), [y2, m2] = ym(g.data.deadline).split('-').map(Number);
                        monthsLeft = Math.max(1, (y2 * 12 + m2) - (y1 * 12 + m1));
                    }
                    return { id: g.id, ref, name: g.data.name, target: g.data.target, currency: g.data.currency, saved: r2(saved), left, percent: Math.min(100, Math.round(100 * saved / g.data.target)), deadline: g.data.deadline, monthlyNeed: monthsLeft ? r2(left / monthsLeft) : null };
                });
            },
            /* N2.5q: PERIOD – to the end of the month or TO PAYDAY (day set by the person): balance now + what still comes in / goes out, reserves, left and per day */
            async period(p, ctx) {
                const u = ctx.actorId;
                const pr = (await fprefs(u)).data;
                const mode = String(p?.mode || pr.periodMode);
                const payday = Math.max(1, Math.min(28, Number(p?.payday || pr.payday)));
                const cur = String(p?.currency || 'CZK');
                const today = String(p?.today || new Date(now()).toISOString().slice(0, 10));
                let end;
                if (mode === 'PAYDAY') {
                    const d = Number(today.slice(8, 10));
                    const m = d < payday ? today.slice(0, 7) : addM(today.slice(0, 7), 1);
                    end = `${m}-${String(payday).padStart(2, '0')}`;
                }
                else {
                    const nm = addM(today.slice(0, 7), 1);
                    end = new Date(Date.parse(nm + '-01T00:00:00Z') - 86400000).toISOString().slice(0, 10);
                }
                const bal = (await svc.balances({ date: today, spaceId: p?.spaceId }, ctx)).filter((a) => a.currency === cur && a.kind !== 'LOAN');
                const balance = r2(bal.reduce((a, x) => a + x.balance, 0));
                let incoming = 0, outgoing = 0;
                const items = [];
                for (const r of await rows(PLN, u, p?.spaceId)) {
                    if (r.data.currency !== cur)
                        continue;
                    for (const x of occ(r.data, today, end)) {
                        if (r.data.kind === 'INCOME')
                            incoming += r.data.amount;
                        else
                            outgoing += r.data.amount;
                        items.push({ date: x, name: r.data.name, amount: r.data.amount, kind: r.data.kind });
                    }
                }
                const o = await svc.outlook({ months: 1, spaceId: p?.spaceId, currency: cur, includeGifts: false }, ctx);
                const reserve = o.reserveMonthly;
                const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(today)) / 86400000));
                const left = r2(balance + incoming - outgoing - reserve);
                return { mode, payday, from: today, to: end, days, balance, incoming: r2(incoming), outgoing: r2(outgoing), reserve, left, perDay: r2(left / days), items: items.sort((a, b) => a.date.localeCompare(b.date)), accounts: bal.length };
            },
            async prefs(p, ctx) { return (await fprefs(ctx.actorId)).data; },
            async setPrefs(p, ctx) {
                const u = ctx.actorId;
                const { id, row, data } = await fprefs(u);
                const d = { ...data };
                if (p?.outlookMonths !== undefined) {
                    if (![1, 3, 6, 12, 24, 36].includes(Number(p.outlookMonths)))
                        throw new Error('FINANCE_OUTLOOK_MONTHS');
                    d.outlookMonths = Number(p.outlookMonths);
                }
                if (p?.payday !== undefined) {
                    const n = Number(p.payday);
                    if (!(n >= 1 && n <= 28))
                        throw new Error('FINANCE_PAYDAY');
                    d.payday = n;
                }
                if (p?.periodMode !== undefined) {
                    if (!['MONTH_END', 'PAYDAY'].includes(p.periodMode))
                        throw new Error('FINANCE_PERIOD_MODE');
                    d.periodMode = p.periodMode;
                }
                const sp = ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
                await core.entities.save(row ? { ...row, expectedRevision: row.revision, data: d } : { id, type: PREF_T, ownerApp: OWNER, schema: 'KX.FINANCE_PREFS/1', spaceIds: [sp], data: d }, { ...ctx, appCode: OWNER });
                return d;
            },
            /* N2.5q: CAPEX – investment: cost, depreciation (straight line), book value, financing (cash / loan / lease → monthly payments into the outlook), benefit, payback */
            async saveCapex(p, ctx) {
                const d = p?.data || {};
                if (!String(d.name || '').trim())
                    throw new Error('FINANCE_CAPEX_NAME');
                const cost = Number(d.cost);
                if (!(cost > 0))
                    throw new Error('FINANCE_AMOUNT');
                if (!isoD(d.date))
                    throw new Error('FINANCE_DATE');
                const life = Number(d.lifeMonths);
                if (!(life >= 1 && life <= 600))
                    throw new Error('FINANCE_CAPEX_LIFE');
                const fin = ['CASH', 'LOAN', 'LEASE'].includes(d.financing) ? d.financing : 'CASH';
                const finMonths = fin === 'CASH' ? 0 : Number(d.finMonths) || 0;
                if (fin !== 'CASH' && !(finMonths >= 1 && finMonths <= 120))
                    throw new Error('FINANCE_CAPEX_FIN_MONTHS');
                return put(CAPEX_T, p, ctx, { name: String(d.name).slice(0, 120), cost: r2(cost), currency: /^[A-Z]{3}$/.test(String(d.currency || '')) ? d.currency : 'CZK', date: d.date, lifeMonths: life, salvage: Number(d.salvage) > 0 ? r2(Number(d.salvage)) : 0, financing: fin, finMonths, finMonthly: fin === 'CASH' ? 0 : r2(Number(d.finMonthly) || 0), downPayment: Number(d.downPayment) > 0 ? r2(Number(d.downPayment)) : 0, benefitMonthly: Number(d.benefitMonthly) > 0 ? r2(Number(d.benefitMonthly)) : 0, assetRef: /^kx:\/\//.test(String(d.assetRef || '')) ? d.assetRef : null, source: d.source || null, note: String(d.note || '').slice(0, 500) });
            },
            capexCalc(d, at) {
                const monthsSince = Math.max(0, (Number(at.slice(0, 4)) * 12 + Number(at.slice(5, 7))) - (Number(d.date.slice(0, 4)) * 12 + Number(d.date.slice(5, 7))));
                const dep = r2((d.cost - d.salvage) / d.lifeMonths);
                const used = Math.min(d.lifeMonths, monthsSince);
                const paid = d.financing === 'CASH' ? d.cost : r2(d.downPayment + d.finMonthly * d.finMonths);
                return { monthlyDepreciation: dep, bookValue: r2(Math.max(d.salvage, d.cost - dep * used)), depreciated: r2(dep * used), monthsUsed: used, totalPaid: paid, financingCost: r2(paid - d.cost), paybackMonths: d.benefitMonthly > 0 ? Math.ceil(paid / d.benefitMonthly) : null };
            },
            async capex(p, ctx) { const at = String(p?.at || new Date(now()).toISOString().slice(0, 10)); return (await rows(CAPEX_T, ctx.actorId, p?.spaceId)).map((r) => ({ id: r.id, ...r.data, ...svc.capexCalc(r.data, at) })); },
            /* demo CAPEX (marked DEMO – yellow dot, can be removed) */
            async capexDemo(p, ctx) {
                const t = new Date(now()).toISOString().slice(0, 7);
                const mk = (x) => svc.saveCapex({ spaceId: p?.spaceId, data: { ...x, source: 'DEMO' } }, ctx);
                return [await mk({ name: CT('fin.cxd.1.name', 'Galvo laser 60 W MOPA (demo)'), cost: 180000, date: t + '-01', lifeMonths: 60, financing: 'LEASE', finMonths: 36, finMonthly: 5600, downPayment: 20000, benefitMonthly: 9000, note: CT('fin.cxd.1.note', 'Demo: lease 36 months, depreciation 5 years, benefit = extra orders.') }),
                    await mk({ name: CT('fin.cxd.2.name', '3D printer (demo)'), cost: 32000, date: t + '-01', lifeMonths: 36, financing: 'CASH', benefitMonthly: 2500, note: CT('fin.cxd.2.note', 'Demo: cash, depreciation 3 years.') }),
                    await mk({ name: CT('fin.cxd.3.name', 'Van (demo)'), cost: 650000, date: t + '-01', lifeMonths: 60, salvage: 150000, financing: 'LOAN', finMonths: 60, finMonthly: 12400, downPayment: 100000, benefitMonthly: 0, note: CT('fin.cxd.3.note', 'Demo: loan 5 years, residual value 150 000.') })];
            },
            /* N2.5q: BUSINESS CASE – investment + operating costs vs benefits over a horizon: payback, NPV (rate / year), simple IRR, sensitivity ±20 % */
            async saveCase(p, ctx) {
                const d = p?.data || {};
                if (!String(d.name || '').trim())
                    throw new Error('FINANCE_CASE_NAME');
                const h = Number(d.horizonMonths);
                if (!(h >= 1 && h <= 240))
                    throw new Error('FINANCE_CASE_HORIZON');
                return put(CASE_T, p, ctx, { name: String(d.name).slice(0, 120), horizonMonths: h, invest: r2(Number(d.invest) || 0), opexMonthly: r2(Number(d.opexMonthly) || 0), benefitMonthly: r2(Number(d.benefitMonthly) || 0), ratePct: Number(d.ratePct) >= 0 ? Number(d.ratePct) : 5, note: String(d.note || '').slice(0, 1000), source: d.source || null, state: d.state || 'DRAFT' });
            },
            caseCalc(d, benefitFactor = 1) {
                const net = d.benefitMonthly * benefitFactor - d.opexMonthly;
                const rm = Math.pow(1 + d.ratePct / 100, 1 / 12) - 1;
                let npv = -d.invest, cum = -d.invest, payback = null;
                for (let m = 1; m <= d.horizonMonths; m++) {
                    npv += net / Math.pow(1 + rm, m);
                    cum += net;
                    if (payback === null && cum >= 0)
                        payback = m;
                }
                const npvAt = (r) => { let v = -d.invest; for (let m = 1; m <= d.horizonMonths; m++)
                    v += net / Math.pow(1 + r, m); return v; };
                let lo = -0.99, hi = 1, irr = null;
                if (npvAt(lo) > 0 && npvAt(hi) < 0 || npvAt(lo) * npvAt(hi) < 0) {
                    for (let i = 0; i < 80; i++) {
                        const mid = (lo + hi) / 2;
                        if (npvAt(lo) * npvAt(mid) <= 0)
                            hi = mid;
                        else
                            lo = mid;
                    }
                    irr = r2((Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100);
                }
                return { netMonthly: r2(net), total: r2(net * d.horizonMonths - d.invest), npv: r2(npv), irrPct: irr, paybackMonths: payback };
            },
            async cases(p, ctx) { return (await rows(CASE_T, ctx.actorId, p?.spaceId)).map((r) => ({ id: r.id, ...r.data, ...svc.caseCalc(r.data), sensitivity: { minus20: svc.caseCalc(r.data, 0.8), plus20: svc.caseCalc(r.data, 1.2) } })); },
            /* N2.5q: remove the demo examples (yellow dot) of this hub – archived (trash), never live data */
            /* N2.5q (user): one demo item – remove it, or ADOPT it as your own (a new live record with the demo data, no dot) */
            async adoptDemo(p, ctx) {
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || r.data?.source !== 'DEMO')
                    throw new Error('FINANCE_NOT_DEMO');
                if (!await readable(r, ctx.actorId))
                    throw new Error('FINANCE_FORBIDDEN');
                const data = { ...r.data, source: null, name: String(r.data.name || '').replace(/\s*\((demo|ukázka|příklad|example)\)\s*$/i, '') };
                const n = await core.entities.save({ type: r.type, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, data }, { ...ctx, appCode: OWNER });
                if (p?.removeDemo === true)
                    await core.entities.save({ ...r, expectedRevision: r.revision, archivedAt: new Date(now()).toISOString() }, { ...ctx, appCode: OWNER });
                return { id: n.id, from: r.id };
            },
            async removeDemo(p, ctx) { if (ctx?.confirmed !== true)
                throw new Error('FINANCE_CONFIRM_REQUIRED'); let n = 0; if (p?.id) {
                const r = await core.entities.get(String(p.id));
                if (!r || r.data?.source !== 'DEMO')
                    throw new Error('FINANCE_NOT_DEMO');
                await core.entities.save({ ...r, expectedRevision: r.revision, archivedAt: new Date(now()).toISOString() }, { ...ctx, appCode: OWNER });
                return { removed: 1 };
            } for (const t of [CAPEX_T, CASE_T, PLN, GOAL, ACC, BUD]) {
                for (const r of await rows(t, ctx.actorId, p?.spaceId)) {
                    if (r.data?.source !== 'DEMO')
                        continue;
                    await core.entities.save({ ...r, expectedRevision: r.revision, archivedAt: new Date(now()).toISOString() }, { ...ctx, appCode: OWNER });
                    n++;
                }
            } return { removed: n }; },
            /* N2.5q: PAIRING a month – planned occurrences × movements (amount ±1 %, date ±5 days, or the same variable symbol in the note): paid / missing / extra */
            async match(p, ctx) {
                const u = ctx.actorId;
                const month = String(p?.month || new Date(now()).toISOString().slice(0, 7));
                const from = month + '-01', to = addM(month, 1) + '-01';
                const today = new Date(now()).toISOString().slice(0, 10);
                const movs = (await rows(MOV, u, p?.spaceId)).filter((m) => m.data.kind !== 'TRANSFER' && m.data.date >= addM(month, -1) + '-20' && m.data.date < addM(month, 1) + '-06');
                const used = new Set();
                const paid = [], missing = [];
                for (const r of await rows(PLN, u, p?.spaceId)) {
                    for (const x of occ(r.data, from, to).filter(x => x < to)) {
                        const near = (m) => Math.abs(Date.parse(m.data.date) - Date.parse(x)) <= 5 * 86400000;
                        const hit = movs.find((m) => !used.has(m.id) && m.data.kind === r.data.kind && m.data.currency === r.data.currency && ((r.data.vs && String(m.data.note || '').includes(r.data.vs)) || (near(m) && Math.abs(m.data.amount - r.data.amount) <= Math.max(1, r.data.amount * 0.01))));
                        if (hit) {
                            used.add(hit.id);
                            paid.push({ planned: r.id, name: r.data.name, date: x, amount: r.data.amount, movement: hit.id, paidOn: hit.data.date, paidAmount: hit.data.amount });
                        }
                        else
                            missing.push({ planned: r.id, name: r.data.name, date: x, amount: r.data.amount, overdue: x < today });
                    }
                }
                const extra = movs.filter((m) => !used.has(m.id) && m.data.date >= from && m.data.date < to).map((m) => ({ movement: m.id, date: m.data.date, amount: m.data.amount, kind: m.data.kind, counterparty: m.data.counterparty }));
                return { month, paid, missing, extra, counts: { paid: paid.length, missing: missing.length, overdue: missing.filter(x => x.overdue).length, extra: extra.length } };
            },
            /* N2.5q: QR payment (Czech SPD) for a planned payment – CZ account → IBAN (mod 97 check) */
            iban(acc) {
                const a = String(acc || '').replace(/\s+/g, '').toUpperCase();
                if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(a))
                    return a;
                const m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(a);
                if (!m)
                    return null;
                const bban = m[3] + (m[1] || '').padStart(6, '0') + m[2].padStart(10, '0');
                const num = (bban + '123500').split('').reduce((r, c) => (r * 10 + Number(c)) % 97, 0);
                const ck = String(98 - num).padStart(2, '0');
                return 'CZ' + ck + bban;
            },
            async qr(p, ctx) {
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || r.type !== PLN)
                    throw new Error('FINANCE_PLANNED_UNKNOWN');
                if (!await readable(r, ctx.actorId))
                    throw new Error('FINANCE_FORBIDDEN');
                const ib = svc.iban(r.data.payeeAccount);
                if (!ib)
                    throw new Error('FINANCE_QR_ACCOUNT');
                const clean = (t) => String(t || '').replace(/[*]/g, ' ').slice(0, 60);
                const parts = ['SPD*1.0', `ACC:${ib}`, `AM:${Number(p?.amount || r.data.amount).toFixed(2)}`, `CC:${r.data.currency}`];
                if (r.data.vs)
                    parts.push(`X-VS:${r.data.vs}`);
                parts.push(`MSG:${clean(r.data.name)}`);
                return { spd: parts.join('*'), iban: ib };
            },
            /* reimbursements: open amounts by state and by who */
            async reimbursements(p, ctx) {
                const open = (await rows(MOV, ctx.actorId, p?.spaceId)).filter((m) => m.data.reimburse && m.data.reimburse !== 'PAID');
                const byState = {}, byWho = {};
                for (const m of open) {
                    byState[m.data.reimburse] = r2((byState[m.data.reimburse] || 0) + m.data.amount);
                    const w = m.data.reimburseWho || '?';
                    byWho[w] = r2((byWho[w] || 0) + m.data.amount);
                }
                return { open: open.map((m) => ({ id: m.id, date: m.data.date, amount: m.data.amount, currency: m.data.currency, state: m.data.reimburse, who: m.data.reimburseWho, counterparty: m.data.counterparty })), byState, byWho, total: r2(open.reduce((a, m) => a + m.data.amount, 0)) };
            },
            /* transfer types in a month (pocket money, boarding …) – transfers are never income / expense */
            async transfers(p, ctx) {
                const month = String(p?.month || new Date(now()).toISOString().slice(0, 7));
                const out = {};
                for (const m of await rows(MOV, ctx.actorId, p?.spaceId)) {
                    if (m.data.kind !== 'TRANSFER' || ym(m.data.date) !== month)
                        continue;
                    const k = m.data.transferType || 'OTHER';
                    out[k] = r2((out[k] || 0) + m.data.amount);
                }
                return { month, byType: out };
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.FINANCE.ACCOUNT.SAVE', 'SAFE_WRITE', (p, c) => svc.saveAccount(p, c));
        reg('ACTION.FINANCE.BALANCE.SAVE', 'SAFE_WRITE', (p, c) => svc.saveBalance(p, c));
        reg('ACTION.FINANCE.ACCOUNT.BALANCES', 'READ', (p, c) => svc.balances(p, c));
        reg('ACTION.FINANCE.ACCOUNT.CHECK', 'READ', (p, c) => svc.balanceCheck(p, c));
        reg('ACTION.FINANCE.BUDGET.SAVE', 'SAFE_WRITE', (p, c) => svc.saveBudget(p, c));
        reg('ACTION.FINANCE.BUDGET.GET', 'READ', (p, c) => svc.budget(p, c));
        reg('ACTION.FINANCE.PLANNED.SAVE', 'SAFE_WRITE', (p, c) => svc.savePlanned(p, c));
        reg('ACTION.FINANCE.PLANNED.CHANGE', 'SAFE_WRITE', (p, c) => svc.plannedChange(p, c));
        reg('ACTION.FINANCE.PLANNED.CHANGES', 'READ', (p, c) => svc.plannedChanges(p, c));
        reg('ACTION.FINANCE.OUTLOOK', 'READ', (p, c) => svc.outlook(p, c));
        reg('ACTION.FINANCE.GOAL.SAVE', 'SAFE_WRITE', (p, c) => svc.saveGoal(p, c));
        reg('ACTION.FINANCE.GOALS', 'READ', (p, c) => svc.goals(p, c));
        reg('ACTION.FINANCE.PERIOD', 'READ', (p, c) => svc.period(p, c));
        reg('ACTION.FINANCE.PREFS', 'READ', (p, c) => svc.prefs(p, c));
        reg('ACTION.FINANCE.PREFS.SET', 'SAFE_WRITE', (p, c) => svc.setPrefs(p, c));
        reg('ACTION.FINANCE.CAPEX.SAVE', 'SAFE_WRITE', (p, c) => svc.saveCapex(p, c));
        reg('ACTION.FINANCE.CAPEX.LIST', 'READ', (p, c) => svc.capex(p, c));
        reg('ACTION.FINANCE.CAPEX.DEMO', 'SAFE_WRITE', (p, c) => svc.capexDemo(p, c));
        reg('ACTION.FINANCE.MATCH', 'READ', (p, c) => svc.match(p, c));
        reg('ACTION.FINANCE.QR', 'READ', (p, c) => svc.qr(p, c));
        reg('ACTION.FINANCE.DEMO.REMOVE', 'SAFE_WRITE', (p, c) => svc.removeDemo(p, c));
        reg('ACTION.FINANCE.DEMO.ADOPT', 'SAFE_WRITE', (p, c) => svc.adoptDemo(p, c));
        reg('ACTION.FINANCE.CASE.SAVE', 'SAFE_WRITE', (p, c) => svc.saveCase(p, c));
        reg('ACTION.FINANCE.CASES', 'READ', (p, c) => svc.cases(p, c));
        reg('ACTION.FINANCE.REIMBURSEMENTS', 'READ', (p, c) => svc.reimbursements(p, c));
        reg('ACTION.FINANCE.TRANSFERS', 'READ', (p, c) => svc.transfers(p, c));
        core.financePlan = svc;
        return svc;
    }
    KXFinancePlan = { install };
    globalThis.KXFinancePlan = KXFinancePlan;
})();
