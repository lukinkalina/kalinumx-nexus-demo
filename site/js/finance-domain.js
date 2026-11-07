// N2.4r: Finance – movements (income / expense / transfer) per SPACE (Personal / Family / Company), categories by space kind,
// company extras (VAT, document number, counterparty), monthly summary, CSV for the accountant. Owner APP.KX.FINANCE is a protected
// (sensitive) owner → every action needs a signed-in session (core identity guard). Nothing leaves the device.
var KXFinance;
(function () {
    const OWNER = 'APP.KX.FINANCE', T = 'APP.FINANCE.MOVEMENT';
    const KINDS = ['INCOME', 'EXPENSE', 'TRANSFER'];
    /* N2.5p: household transfer types (from the old Finance hub P7 – not copied, re-done) and reimbursement states */
    const TRANSFER_TYPES = ['HOUSEHOLD', 'POCKET_MONEY', 'BOARDING', 'SCHOOL', 'SAVINGS', 'LOAN', 'REFUND', 'GIFT', 'OWN', 'OTHER'];
    const REIMB = ['TO_REIMBURSE', 'HELD', 'APPROVED', 'READY_TO_PAY', 'PAID'];
    const CATS = {
        HOUSEHOLD: ['HOUSING', 'ENERGY', 'FOOD', 'TRANSPORT', 'CAR', 'HEALTH', 'KIDS_SCHOOL', 'PETS', 'HOBBY', 'HOLIDAY', 'GIFTS', 'SUBSCRIPTIONS', 'INSURANCE', 'SAVINGS', 'SALARY', 'OTHER_INCOME', 'OTHER'],
        COMPANY: ['MATERIAL', 'TOOLS_MACHINES', 'WORKSHOP_ENERGY', 'MARKETING', 'SHIPPING', 'SERVICES', 'SOFTWARE', 'RENT', 'WAGES', 'TAXES_FEES', 'SALES', 'OTHER_INCOME', 'OTHER']
    };
    /* CZ VAT rates valid from 1. 1. 2024 (21 %, 12 %, 0 %) – to verify against the VAT Act when used for accounting */
    const VAT_RATES = [21, 12, 0];
    const group = (spaceKind) => spaceKind === 'COMPANY' ? 'COMPANY' : 'HOUSEHOLD';
    const iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    function validate(d, spaceKind) {
        if (!KINDS.includes(d?.kind))
            throw new Error('FINANCE_KIND');
        if (!iso(d.date))
            throw new Error('FINANCE_DATE');
        const a = Number(d.amount);
        if (!(Number.isFinite(a) && a > 0 && a <= 1e9))
            throw new Error('FINANCE_AMOUNT');
        if (!/^[A-Z]{3}$/.test(String(d.currency || '')))
            throw new Error('FINANCE_CURRENCY');
        if (d.kind !== 'TRANSFER' && !CATS[group(spaceKind)].includes(d.category))
            throw new Error('FINANCE_CATEGORY');
        if (d.kind === 'TRANSFER' && (!d.account || !d.toAccount || d.account === d.toAccount))
            throw new Error('FINANCE_TRANSFER_ACCOUNTS');
        if (d.vatRate != null) {
            if (spaceKind !== 'COMPANY')
                throw new Error('FINANCE_VAT_ONLY_COMPANY');
            if (!VAT_RATES.includes(Number(d.vatRate)))
                throw new Error('FINANCE_VAT_RATE');
        }
        for (const k of ['counterparty', 'account', 'toAccount', 'note', 'docNo'])
            if (d[k] != null && String(d[k]).length > (k === 'note' ? 2000 : 160))
                throw new Error('FINANCE_TEXT_LONG');
        return { kind: d.kind, date: d.date, amount: Math.round(a * 100) / 100, currency: d.currency, category: d.kind === 'TRANSFER' ? null : d.category, counterparty: d.counterparty || '', account: d.account || '', toAccount: d.toAccount || '', counterpartyRef: /^kx:\/\//.test(String(d.counterpartyRef || '')) ? d.counterpartyRef : null, accountRef: /^kx:\/\//.test(String(d.accountRef || '')) ? d.accountRef : null, toAccountRef: /^kx:\/\//.test(String(d.toAccountRef || '')) ? d.toAccountRef : null, note: d.note || '', docNo: d.docNo || '', vatRate: d.vatRate != null ? Number(d.vatRate) : null, source: d.source || null,
            /* N2.5p (extension of THIS hub): transfer type, reimbursement, saving goal, person */
            transferType: d.kind === 'TRANSFER' && TRANSFER_TYPES.includes(d.transferType) ? d.transferType : (d.kind === 'TRANSFER' ? 'OTHER' : null),
            reimburse: REIMB.includes(d.reimburse) ? d.reimburse : null, reimburseWho: d.reimburse ? String(d.reimburseWho || '').slice(0, 120) : '',
            goalRef: /^kx:\/\//.test(String(d.goalRef || '')) ? d.goalRef : null, personRef: /^kx:\/\//.test(String(d.personRef || '')) ? d.personRef : null };
    }
    /* VAT split of a gross amount (company) */
    const vatSplit = (gross, rate) => { const base = Math.round(gross / (1 + rate / 100) * 100) / 100; return { base, vat: Math.round((gross - base) * 100) / 100 }; };
    /* monthly summary of the given rows (one currency at a time – amounts in different currencies are never added) */
    function summary(rows, month, currency = 'CZK') {
        const r = rows.filter((x) => !x.archivedAt && x.data.date.startsWith(month) && x.data.currency === currency);
        const sum = (k) => Math.round(r.filter((x) => x.data.kind === k).reduce((n, x) => n + x.data.amount, 0) * 100) / 100;
        const income = sum('INCOME'), expense = sum('EXPENSE');
        const byCategory = {};
        for (const x of r.filter((x) => x.data.kind === 'EXPENSE'))
            byCategory[x.data.category] = Math.round(((byCategory[x.data.category] || 0) + x.data.amount) * 100) / 100;
        return { month, currency, income, expense, balance: Math.round((income - expense) * 100) / 100, count: r.length, byCategory, otherCurrencies: [...new Set(rows.filter((x) => x.data.date.startsWith(month) && x.data.currency !== currency).map((x) => x.data.currency))] };
    }
    /* N2.4v: summary in ONE currency – other currencies converted by the shared rates; a missing rate is listed, never guessed */
    function summaryConverted(rows, month, to, rates) {
        const conv = globalThis.KXCurrency?.convertWith;
        const r = rows.filter((x) => !x.archivedAt && x.data.date.startsWith(month));
        const missing = new Set();
        const cv = (x) => { const v = conv ? conv(rates, x.data.amount, x.data.currency, to) : (x.data.currency === to ? x.data.amount : null); if (v == null) {
            missing.add(x.data.currency);
            return null;
        } return v; };
        let income = 0, expense = 0;
        const byCategory = {};
        for (const x of r) {
            if (x.data.kind === 'TRANSFER')
                continue;
            const v = cv(x);
            if (v == null)
                continue;
            if (x.data.kind === 'INCOME')
                income += v;
            else {
                expense += v;
                byCategory[x.data.category] = (byCategory[x.data.category] || 0) + v;
            }
        }
        const R = (n) => Math.round(n * 100) / 100;
        for (const k of Object.keys(byCategory))
            byCategory[k] = R(byCategory[k]);
        return { month, currency: to, converted: true, income: R(income), expense: R(expense), balance: R(income - expense), count: r.length, byCategory, missingRates: [...missing].sort() };
    }
    /* N2.4v: CSV import – own export or a bank statement; „;“ or „,“; dates 22.10.2030 / 2030-10-22; decimal comma; sign → kind;
       currency column or the chosen source currency; optional conversion to a target currency (original amount, currency, rate, date kept) */
    function parseCsvLine(line, sep) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            }
            else if (ch === '"')
                q = false;
            else
                cur += ch;
        }
        else if (ch === '"')
            q = true;
        else if (ch === sep) {
            out.push(cur);
            cur = '';
        }
        else
            cur += ch;
    } out.push(cur); return out.map(x => x.trim()); }
    function parseImport(text, opt) {
        const lines = String(text || '').replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2)
            throw new Error('FINANCE_IMPORT_EMPTY');
        const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
        const head = parseCsvLine(lines[0], sep).map(h => h.toLowerCase());
        const col = (names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
        const ci = { date: col(['date', 'datum']), amount: col(['amount', 'částka', 'castka', 'objem']), currency: col(['currency', 'měna', 'mena']), kind: col(['kind', 'druh']), category: col(['category', 'kategorie']), counterparty: col(['counterparty', 'protistrana', 'název protiúčtu', 'nazev protiuctu', 'příjemce', 'prijemce']), note: col(['note', 'poznámka', 'poznamka', 'zpráva', 'zprava']), account: col(['account', 'účet', 'ucet']) };
        if (ci.date < 0 || ci.amount < 0)
            throw new Error('FINANCE_IMPORT_COLUMNS');
        const rows = [], errors = [];
        lines.slice(1).forEach((l, i) => {
            const c = parseCsvLine(l, sep);
            const g = (k) => ci[k] >= 0 ? c[ci[k]] || '' : '';
            let d = g('date');
            const m = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/.exec(d);
            if (m)
                d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            const raw = Number(g('amount').replace(/\s/g, '').replace(/\u00a0/g, '').replace(',', '.'));
            const cur = (g('currency') || opt.sourceCurrency || 'CZK').toUpperCase();
            const kind = (g('kind') || '').toUpperCase() || (raw < 0 ? 'EXPENSE' : 'INCOME');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(raw) || raw === 0 || !/^[A-Z]{3}$/.test(cur)) {
                errors.push({ line: i + 2, text: l.slice(0, 120) });
                return;
            }
            rows.push({ date: d, amount: Math.abs(raw), currency: cur, kind: ['INCOME', 'EXPENSE', 'TRANSFER'].includes(kind) ? kind : (raw < 0 ? 'EXPENSE' : 'INCOME'), category: g('category') || null, counterparty: g('counterparty'), note: g('note'), account: g('account') });
        });
        return { rows, errors, separator: sep };
    }
    function csv(rows, spaceName) {
        const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const head = ['date', 'kind', 'amount', 'currency', 'category', 'counterparty', 'account', 'toAccount', 'docNo', 'vatRate', 'vatBase', 'vat', 'note', 'space'];
        return [head.join(';'), ...rows.filter((x) => !x.archivedAt).sort((a, b) => a.data.date.localeCompare(b.data.date)).map((x) => {
                const d = x.data;
                const v = d.vatRate != null ? vatSplit(d.amount, d.vatRate) : { base: '', vat: '' };
                return [d.date, d.kind, String(d.amount).replace('.', ','), d.currency, d.category || '', d.counterparty, d.account, d.toAccount, d.docNo, d.vatRate ?? '', String(v.base).replace('.', ','), String(v.vat).replace('.', ','), d.note, spaceName(x.spaceIds[0])].map(q).join(';');
            })].join('\n');
    }
    /* catalogue text with {placeholders} */
    const IT = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    function install(core) {
        if (core.finance)
            return core.finance;
        const spaceOf = async (id, actor) => { const sp = (await core.propagate.spaces(actor)).find((s) => s.id === id); if (!sp)
            throw new Error('FINANCE_SPACE'); return sp; };
        const svc = {
            async save(p, ctx) {
                const sp = await spaceOf(p.spaceId, ctx.actorId);
                const data = validate(p.data || {}, sp.kind);
                const old = p.id ? await core.entities.get(p.id) : null;
                if (p.id && (!old || old.type !== T))
                    throw new Error('FINANCE_NOT_FOUND');
                return core.entities.save({ id: p.id, type: T, ownerApp: OWNER, schema: 'KX.FINANCE.MOVEMENT/1', spaceIds: [sp.id], expectedRevision: old?.revision, data }, ctx);
            },
            async list(p, ctx) { const ids = new Set((await core.propagate.spaces(ctx.actorId)).filter((s) => !p?.spaceId || s.id === p.spaceId).map((s) => s.id)); return (await core.entities.list()).filter((r) => r.type === T && !r.archivedAt && r.spaceIds.some((s) => ids.has(s))); },
            async archive(p, ctx) { const r = await core.entities.get(p.id); if (!r || r.type !== T)
                throw new Error('FINANCE_NOT_FOUND'); return core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, ctx); }
        };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.FINANCE.MOVEMENT.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c));
        reg('ACTION.FINANCE.MOVEMENT.LIST', 'READ', (p, c) => svc.list(p, c));
        reg('ACTION.FINANCE.MOVEMENT.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c));
        reg('ACTION.FINANCE.SUMMARY', 'READ', async (p, c) => { const rows = await svc.list(p, c); if (p.convert && core.currency) {
            const r = await core.currency.rates();
            return summaryConverted(rows, String(p.month), p.currency || 'CZK', r?.rates || { CZK: 1 });
        } return summary(rows, String(p.month), p.currency || 'CZK'); });
        /* N2.4v: CSV import – preview (no write) and apply; conversion keeps the original amount / currency / rate / date */
        const importRows = async (p, c) => {
            const sp = await spaceOf(p.spaceId, c.actorId);
            const parsed = parseImport(p.text, { sourceCurrency: p.sourceCurrency });
            const g = group(sp.kind);
            const fallback = g === 'COMPANY' ? 'OTHER' : 'OTHER';
            const rr = p.convertTo && core.currency ? (await core.currency.rates())?.rates || { CZK: 1 } : null;
            const rdate = p.convertTo && core.currency ? (await core.currency.rates())?.date : null;
            const out = parsed.rows.map((x) => {
                let amount = x.amount, currency = x.currency, fx = null;
                if (rr && p.convertTo !== x.currency) {
                    const v = globalThis.KXCurrency.convertWith(rr, x.amount, x.currency, p.convertTo);
                    if (v == null)
                        return { ...x, error: 'FINANCE_RATE_MISSING' };
                    fx = { originalAmount: x.amount, originalCurrency: x.currency, fxRate: Math.round(v / x.amount * 1e6) / 1e6, fxDate: rdate };
                    amount = Math.round(v * 100) / 100;
                    currency = p.convertTo;
                }
                const category = x.kind === 'TRANSFER' ? null : (CATS[g].includes(String(x.category || '').toUpperCase()) ? String(x.category).toUpperCase() : (p.category && CATS[g].includes(p.category) ? p.category : fallback));
                return { ...x, amount, currency, category, fx };
            });
            return { rows: out, errors: parsed.errors, separator: parsed.separator, space: sp };
        };
        reg('ACTION.FINANCE.IMPORT.PREVIEW', 'READ', async (p, c) => { const r = await importRows(p, c); return { rows: r.rows, errors: r.errors, separator: r.separator, ready: r.rows.filter((x) => !x.error).length }; });
        reg('ACTION.FINANCE.IMPORT.APPLY', 'SAFE_WRITE', async (p, c) => {
            const r = await importRows(p, c);
            let saved = 0;
            for (const x of r.rows) {
                if (x.error)
                    continue;
                const data = { kind: x.kind, date: x.date, amount: x.amount, currency: x.currency, category: x.category, counterparty: x.counterparty, note: x.note, account: x.kind === 'TRANSFER' ? (x.account || '?') : x.account, toAccount: x.kind === 'TRANSFER' ? '?' : undefined, source: 'IMPORT' };
                if (x.kind === 'TRANSFER') { /* N2.4y: a transfer from a statement has no target account – not lost, goes to „K zatřídění“ */
                    if (core.inbox) {
                        try {
                            await core.inbox.add({ source: 'IMPORT', reason: 'MISSING_DATA', title: IT('inbox.t.transfer', { date: x.date, amount: x.amount, currency: x.currency }), text: JSON.stringify(x), target: { hub: OWNER, actionCode: null, payload: x } }, c);
                        }
                        catch { }
                    }
                    continue;
                }
                const row = await svc.save({ spaceId: p.spaceId, data }, c);
                if (x.fx) {
                    await core.entities.save({ ...row, data: { ...row.data, ...x.fx }, expectedRevision: row.revision }, c);
                }
                saved++;
            }
            /* N2.4y: every line that did not go through → „K zatřídění“ with the original text (nothing lost) */
            if (core.inbox) {
                for (const er of r.errors) {
                    try {
                        await core.inbox.add({ source: 'IMPORT', reason: 'IMPORT_ERROR', title: IT('inbox.t.importLine', { line: er.line }), text: er.text, target: { hub: OWNER, actionCode: null, payload: { spaceId: p.spaceId, line: er.line } } }, c);
                    }
                    catch { }
                }
                for (const x of r.rows.filter((x) => x.error)) {
                    try {
                        await core.inbox.add({ source: 'IMPORT', reason: 'IMPORT_ERROR', title: IT('inbox.t.importRow', { date: x.date, amount: x.amount, currency: x.currency, error: x.error }), text: JSON.stringify(x), target: { hub: OWNER, actionCode: null, payload: x } }, c);
                    }
                    catch { }
                }
            }
            return { saved, skipped: r.rows.length - saved, errors: r.errors };
        });
        reg('ACTION.FINANCE.EXPORT_CSV', 'READ', async (p, c) => { const sp = await core.propagate.spaces(c.actorId); return csv((await svc.list(p, c)).filter((x) => !p.month || x.data.date.startsWith(p.month)), (id) => sp.find((s) => s.id === id)?.name || id); });
        core.finance = svc;
        return svc;
    }
    KXFinance = { OWNER, T, KINDS, CATS, VAT_RATES, TRANSFER_TYPES, REIMB, group, validate, vatSplit, summary, summaryConverted, parseImport, csv, install };
    globalThis.KXFinance = KXFinance;
})();
// N2.4r: Finance hub workspace – space filter (Personal / Family / Company), month, summary, movement form (company: VAT, document no.),
// table in the one table engine, CSV; without a signed-in session the hub shows only the lock notice (protected owner).
var KXFinanceHub;
(function () {
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const F = () => globalThis.KXFinance;
    const TABS = [['MOVEMENTS', TL('fin.tab.MOVEMENTS', 'Movements')], ['BUDGET', TL('fin.tab.BUDGET', 'Budget')], ['OUTLOOK', TL('fin.tab.OUTLOOK', 'Outlook and reserves')], ['ACCOUNTS', TL('fin.tab.ACCOUNTS', 'Accounts and balances')], ['GOALS', TL('fin.tab.GOALS', 'Goals')], ['REIMBURSE', TL('fin.tab.REIMBURSE', 'Reimbursements')], ['CAPEX', TL('fin.tab.CAPEX', 'CAPEX – investments')], ['CASE', TL('fin.tab.CASE', 'Business case')]];
    const SCOPE = 'FINANCE.MOVEMENTS';
    const st = { space: '', month: new Date().toISOString().slice(0, 7), sel: new Set(), kind: 'EXPENSE', sumCur: '', convert: true, imp: null };
    const money = (n, c) => `${Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
    function registerTable(core) {
        if (core.__finTable)
            return;
        core.__finTable = true;
        try {
            core.fields?.registerDefaults(SCOPE, [{ key: 'date', type: 'DATE', label: TL('fin.col.date', 'Date'), width: 100 }, { key: 'kind', type: 'TEXT', label: TL('fin.col.kind', 'Kind'), width: 90 },
                { key: 'amount', type: 'NUMBER', label: TL('fin.col.amount', 'Amount'), width: 110 }, { key: 'currency', type: 'TEXT', label: TL('fin.col.currency', 'Currency'), width: 70 }, { key: 'category', type: 'TEXT', label: TL('fin.col.category', 'Category'), width: 150 },
                { key: 'counterparty', type: 'TEXT', label: TL('fin.col.counterparty', 'Counterparty'), width: 160 }, { key: 'account', type: 'TEXT', label: TL('fin.col.account', 'Account'), width: 120 }, { key: 'docNo', type: 'TEXT', label: TL('fin.col.docNo', 'Document'), width: 110 },
                { key: 'vat', type: 'TEXT', label: TL('fin.col.vat', 'VAT'), width: 120 }, { key: 'note', type: 'TEXT', label: TL('fin.col.note', 'Note'), width: 200 }]);
        }
        catch { }
    }
    /* N2.4y: continue a finance draft – the shell opens the hub, the form is prefilled */
    /* the opener is registered when the hub mounts – this module loads BEFORE core-inbox, a registration at load time would be lost */
    const regOpener = () => { try {
        globalThis.KXInbox?.drafts.register('FINANCE_MOVEMENT', (v, id) => { st.prefill = v; st.draftId = id; if (v?.space)
            st.space = v.space; document.querySelector('[data-tree-hub="APP.KX.FINANCE"]')?.click(); });
    }
    catch { } };
    regOpener();
    /* N2.5p: plan views of the Finance hub – budget, outlook 36 months + reserves, accounts + balances, goals, reimbursements */
    /* N2.5q: templates of planned payments – household and company (amount is yours to fill) */
    const TPL_HOME = [{ k: 'RENT', every: 'MONTHLY', cat: 'HOUSING' }, { k: 'MORTGAGE', every: 'MONTHLY', cat: 'HOUSING' }, { k: 'ENERGY', every: 'MONTHLY', cat: 'ENERGY' }, { k: 'ENERGY_BILL', every: 'YEARLY', cat: 'ENERGY' }, { k: 'INTERNET', every: 'MONTHLY', cat: 'SUBSCRIPTIONS' }, { k: 'PHONE', every: 'MONTHLY', cat: 'SUBSCRIPTIONS' }, { k: 'HOME_INS', every: 'YEARLY', cat: 'INSURANCE' }, { k: 'CAR_INS', every: 'YEARLY', cat: 'CAR' }, { k: 'STK', every: 'EVERY_N', n: 24, cat: 'CAR' }, { k: 'SCHOOL', every: 'MONTHS', months: [9, 1], cat: 'KIDS_SCHOOL' }, { k: 'POCKET', every: 'WEEKLY', cat: 'KIDS_SCHOOL' }, { k: 'SALARY', every: 'MONTHLY', kind: 'INCOME', cat: 'SALARY' }];
    const TPL_CO = [{ k: 'VAT', every: 'QUARTERLY', cat: 'TAXES_FEES' }, { k: 'TAX_ADV', every: 'QUARTERLY', cat: 'TAXES_FEES' }, { k: 'SOCIAL', every: 'MONTHLY', cat: 'TAXES_FEES' }, { k: 'HEALTH', every: 'MONTHLY', cat: 'TAXES_FEES' }, { k: 'WAGES', every: 'MONTHLY', cat: 'WAGES' }, { k: 'WORKSHOP_RENT', every: 'MONTHLY', cat: 'RENT' }, { k: 'LEASING', every: 'MONTHLY', cat: 'TOOLS_MACHINES' }, { k: 'ACCOUNTANT', every: 'MONTHLY', cat: 'SERVICES' }, { k: 'SOFTWARE', every: 'MONTHLY', cat: 'SOFTWARE' }, { k: 'WORKSHOP_ENERGY', every: 'MONTHLY', cat: 'WORKSHOP_ENERGY' }, { k: 'SALES', every: 'MONTHLY', kind: 'INCOME', cat: 'SALES' }];
    /* N2.5q: per demo item – adopt as own / remove */
    const demoBtns = (id) => ` <span class="kx-demo-acts"><button type="button" class="btn ghost compact" data-fin-demo-adopt="${esc(id)}">${esc(TL('fin.demoAdopt', 'Adopt as own'))}</button><button type="button" class="btn ghost compact" data-fin-demo-del="${esc(id)}">🗑</button></span>`;
    async function renderPlan(root, core, opts, C, sp, cats, head) {
        const IV = (c, p) => core.actions.invoke(c, p, C);
        const mo = (n, c = 'CZK') => `${Number(n || 0).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} ${c}`;
        const cat = (c) => TL('fin.cat.' + c, c);
        const none = `<li class="muted">${esc(TL('fin.p.none', 'Nothing yet.'))}</li>`;
        let body = '';
        const v = st.view;
        const inp = (attr, lbl, type = 'text', extra = '') => `<label class="kx-lf"><span>${esc(lbl)}</span><input ${attr} type="${type}" ${extra}></label>`;
        if (v === 'BUDGET') {
            const b = await IV('ACTION.FINANCE.BUDGET.GET', { month: st.month, spaceId: st.space }).catch(() => null);
            const plan = {};
            for (const l of b?.lines || [])
                plan[l.category] = l.plan;
            body = `<div class="kx-fin-head"><label>${esc(TL('fin.month', 'Month'))} <input type="month" data-fin-month value="${esc(st.month)}"></label></div>
        <table class="kx-calc-table"><tr><th>${esc(TL('fin.p.cat', 'Category'))}</th><th>${esc(TL('fin.p.plan', 'Plan'))}</th><th>${esc(TL('fin.p.actual', 'Actual'))}</th><th>${esc(TL('fin.p.left', 'Left'))}</th></tr>${(b?.lines || []).map((l) => `<tr><th>${esc(cat(l.category))}</th><td>${mo(l.plan)}</td><td>${mo(l.actual)}</td><td>${l.over ? `<span class="kx-ws-chip ws-WAITING">${esc(TL('fin.p.over', 'over budget'))}</span> ` : ''}${mo(l.left)}</td></tr>`).join('')}<tr><th>${esc(TL('fin.p.total', 'Total'))}</th><td><b>${mo(b?.totals?.plan || 0)}</b></td><td><b>${mo(b?.totals?.actual || 0)}</b></td><td></td></tr></table>
        ${b?.counted ? `<p class="muted">${esc(TL('fin.p.counted', 'Counted by your choice'))}: ${esc(TL('fin.p.inProg', 'in progress'))} ${esc(b.counted.includeInProgress ? TL('ws.yes', 'yes') : TL('ws.no', 'no'))} · ${esc(TL('fin.p.drafts', 'drafts'))} ${esc(b.counted.includeDrafts ? TL('ws.yes', 'yes') : TL('ws.no', 'no'))}${b.counted.excluded ? ` · ${esc(TL('fin.p.leftOut', 'left out'))}: ${b.counted.excluded}` : ''}</p>` : ''}
        <h4>${esc(TL('fin.p.setPlan', 'Plan for the month'))}</h4><div class="kx-calc-grid">${cats.filter(c => !/SALARY|INCOME|SALES/.test(c)).map(c => `<label class="kx-lf"><span>${esc(cat(c))}</span><input type="number" min="0" step="100" data-fin-plan="${esc(c)}" value="${plan[c] ?? ''}"></label>`).join('')}</div><button class="btn" data-fin-plan-save>${esc(TL('fin.p.save', 'Save the budget'))}</button>`;
        }
        else if (v === 'OUTLOOK') {
            const fp = await IV('ACTION.FINANCE.PREFS', {}).catch(() => ({ outlookMonths: 1, payday: 15, periodMode: 'MONTH_END' }));
            const n = st.outlookN || fp.outlookMonths || 1;
            const o = await IV('ACTION.FINANCE.OUTLOOK', { months: n, spaceId: st.space }).catch(() => null);
            const pe = await IV('ACTION.FINANCE.PERIOD', { spaceId: st.space }).catch(() => null);
            const mx = Math.max(1, ...(o?.outlook || []).map((m) => Math.max(m.income, m.expense)));
            const periodBox = pe ? `<div class="kx-fin-period" data-fin-period><div class="kx-sf-scope">${['MONTH_END', 'PAYDAY'].map(k => `<button type="button" class="${pe.mode === k ? 'active' : ''}" data-fin-pmode="${k}">${esc(TL('fin.pm.' + k, k))}</button>`).join('')}</div>${pe.mode === 'PAYDAY' ? `<label>${esc(TL('fin.p.payday', 'Payday'))} <input type="number" min="1" max="28" data-fin-payday value="${pe.payday}" style="width:60px"></label>` : ''}
        <span class="kx-fin-sum"><span>${esc(TL('fin.p.to', 'until'))} <b>${esc(pe.to)}</b> · ${pe.days} ${esc(TL('fin.p.daysShort', 'days'))}</span><span>${esc(TL('fin.p.balanceNow', 'Balance now'))} <b>${mo(pe.balance)}</b></span><span>+ <b>${mo(pe.incoming)}</b></span><span>− <b>${mo(pe.outgoing)}</b></span><span>${esc(TL('fin.p.reserve', 'Put aside monthly'))} <b>${mo(pe.reserve)}</b></span><span class="kx-fin-left">${esc(TL('fin.p.leftP', 'Left'))} <b>${mo(pe.left)}</b> · ${esc(TL('fin.p.perDay', 'per day'))} <b>${mo(pe.perDay)}</b></span></span>${pe.accounts ? '' : `<small class="muted">${esc(TL('fin.p.noAcc', 'Add an account with a balance (tab Accounts) – then the balance is counted.'))}</small>`}</div>` : '';
            const mt = await IV('ACTION.FINANCE.MATCH', { spaceId: st.space, month: st.month }).catch(() => null);
            const matchBox = mt ? `<details class="kx-fin-match" data-fin-match ${mt.counts.missing || mt.counts.extra ? 'open' : ''}><summary>🔗 ${esc(TL('fin.mt.title', 'Pairing of the month'))} ${esc(mt.month)} · ✓ ${mt.counts.paid} · ⏳ ${mt.counts.missing}${mt.counts.overdue ? ` (${esc(TL('fin.mt.overdue', 'overdue'))} ${mt.counts.overdue})` : ''} · ➕ ${mt.counts.extra}</summary><p class="muted">${esc(TL('fin.mt.help', 'Planned payments against movements (also imported from a bank statement): amount ±1 % and date ±5 days, or the same variable symbol.'))}</p>
        <ul class="kx-gd-list">${mt.missing.map((x) => `<li><span class="kx-gd-t"><b>⏳ ${esc(x.name)}</b><small>${esc(x.date)} · ${mo(x.amount)}${x.overdue ? ' · ' + esc(TL('fin.mt.overdue', 'overdue')) : ''}</small></span><span class="veh-actions"><button class="btn ghost compact" data-fin-qr="${esc(x.planned)}">QR</button></span></li>`).join('')}${mt.paid.map((x) => `<li><span class="kx-gd-t"><b>✓ ${esc(x.name)}</b><small>${esc(x.date)} · ${esc(TL('fin.mt.paidOn', 'paid'))} ${esc(x.paidOn)} · ${mo(x.paidAmount)}</small></span></li>`).join('')}${mt.extra.map((x) => `<li><span class="kx-gd-t"><b>➕ ${esc(x.counterparty || TL('fin.mt.extraT', 'Unplanned'))}</b><small>${esc(x.date)} · ${mo(x.amount)}</small></span></li>`).join('')}</ul><div data-fin-qr-out></div></details>` : '';
            const chart = `<div class="kx-fin-chart" role="img" aria-label="${esc(TL('fin.p.chart', 'Income and expense by month'))}">${(o?.outlook || []).map((m) => `<div class="kx-fin-col" title="${esc(m.month)}: +${mo(m.income)} / −${mo(m.expense)}"><i class="inc" style="height:${Math.round(100 * m.income / mx)}%"></i><i class="exp" style="height:${Math.round(100 * m.expense / mx)}%"></i><small>${esc(m.month.slice(5))}</small></div>`).join('')}</div><p class="muted kx-fin-legend"><span class="kx-fin-key inc"></span> ${esc(TL('fin.income', 'Income'))} · <span class="kx-fin-key exp"></span> ${esc(TL('fin.expense', 'Expense'))}</p>`;
            body = `${periodBox}${matchBox}<div class="kx-fin-head"><label>${esc(TL('fin.p.months', 'Months'))} <select data-fin-outn>${[1, 3, 6, 12, 24, 36].map(x => `<option value="${x}" ${n === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><span class="kx-fin-sum"><span>${esc(TL('fin.p.reserve', 'Put aside monthly'))} <b>${mo(o?.reserveMonthly || 0)}</b></span><span>${esc(TL('fin.income', 'Income'))} <b>${mo(o?.totals?.income || 0)}</b></span><span>${esc(TL('fin.expense', 'Expense'))} <b>${mo(o?.totals?.expense || 0)}</b></span></span></div>
        ${chart}<div class="kx-fin-outlook"><table class="kx-calc-table"><tr><th>${esc(TL('fin.month', 'Month'))}</th><th>${esc(TL('fin.income', 'Income'))}</th><th>${esc(TL('fin.expense', 'Expense'))}</th><th>${esc(TL('fin.p.net', 'Net'))}</th><th>${esc(TL('fin.p.items', 'Items'))}</th></tr>${(o?.outlook || []).map((m) => `<tr><th>${esc(m.month)}</th><td>${mo(m.income)}</td><td>${mo(m.expense)}</td><td>${mo(m.net)}</td><td><small>${esc(m.items.map((x) => x.name).join(', '))}</small></td></tr>`).join('')}</table></div>
        <h4>${esc(TL('fin.p.reserves', 'Reserves for non-monthly payments'))}</h4><ul class="kx-gd-list">${(o?.reserves || []).map((r) => `<li><span class="kx-gd-t"><b>${esc(r.name)}</b><small>${esc(TL('fin.every.' + r.every, r.every))} · ${mo(r.amount)} · ${esc(TL('fin.p.next', 'next'))} ${esc(r.nextDate)}</small></span><span class="veh-actions"><b>${mo(r.monthly)}</b> / ${esc(TL('fin.p.mo', 'month'))}</span></li>`).join('') || none}</ul>
        <h4>${esc(TL('fin.p.addPlanned', 'Add a planned payment'))}</h4><div class="kx-ka-opts" data-pl-templates><span class="kx-gd-lbl">${esc(TL('fin.tpl.title', 'Templates:'))}</span>${(sp?.kind === 'COMPANY' ? TPL_CO : TPL_HOME).map((x, i) => `<button type="button" class="chip" data-pl-tpl="${i}">${esc(TL('fin.tpl.' + x.k, x.k))}</button>`).join('')}</div><div class="kx-calc-grid">${inp('data-pl="name"', TL('fin.p.name', 'Name'))}<label class="kx-lf"><span>${esc(TL('fin.kind', 'Kind'))}</span><select data-pl="kind"><option value="EXPENSE">${esc(TL('fin.expense', 'Expense'))}</option><option value="INCOME">${esc(TL('fin.income', 'Income'))}</option></select></label>${inp('data-pl="amount"', TL('fin.amount', 'Amount'), 'number', 'min="0"')}
          <label class="kx-lf"><span>${esc(TL('fin.p.every', 'Every'))}</span><select data-pl="every" data-keep-select data-kx-recur>${['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'QUARTERLY', 'HALFYEAR', 'YEARLY', 'EVERY_N', 'MONTHS', 'ONCE'].map(x => `<option value="${x}">${esc(TL('fin.every.' + x, x))}</option>`).join('')}</select></label>${inp('data-pl="nextDate"', TL('fin.p.nextDate', 'Next date'), 'date')}${inp('data-pl="n"', TL('fin.p.everyN', 'Every N months'), 'number', 'min="1" max="60"')}${inp('data-pl="payeeAccount"', TL('fin.p.payee', 'Payee account (for QR)'))}${inp('data-pl="vs"', TL('fin.p.vs', 'Variable symbol'))}${inp('data-pl="months"', TL('fin.p.monthsList', 'Months (e.g. 9, 1)'))}<label class="kx-lf"><span>${esc(TL('fin.p.cat', 'Category'))}</span><select data-pl="category" data-keep-select>${cats.map(c => `<option value="${esc(c)}">${esc(cat(c))}</option>`).join('')}</select></label></div><button class="btn" data-pl-save>${esc(TL('fin.p.add', 'Add'))}</button>`;
        }
        else if (v === 'ACCOUNTS') {
            const b = await IV('ACTION.FINANCE.ACCOUNT.BALANCES', { spaceId: st.space }).catch(() => []);
            body = `<table class="kx-calc-table"><tr><th>${esc(TL('fin.p.account', 'Account'))}</th><th>${esc(TL('fin.kind', 'Kind'))}</th><th>${esc(TL('fin.p.balance', 'Balance'))}</th><th>${esc(TL('fin.p.fromSnap', 'From snapshot'))}</th><th></th></tr>${b.map((a) => `<tr><th>${esc(a.name)}</th><td>${esc(TL('fin.acc.' + a.kind, a.kind))}</td><td><b>${mo(a.balance, a.currency)}</b></td><td>${esc(a.fromSnapshot || '–')}</td><td><button class="btn ghost compact" data-acc-check="${esc(a.id)}">${esc(TL('fin.p.check', 'Check'))}</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted">${esc(TL('fin.p.none', 'Nothing yet.'))}</td></tr>`}</table><p class="kx-lf-help" data-acc-out></p>
        <h4>${esc(TL('fin.p.addAccount', 'Add an account'))}</h4><div class="kx-calc-grid">${inp('data-ac="name"', TL('fin.p.name', 'Name'))}<label class="kx-lf"><span>${esc(TL('fin.kind', 'Kind'))}</span><select data-ac="kind">${['BANK', 'CASH', 'CARD', 'SAVINGS', 'LOAN'].map(x => `<option value="${x}">${esc(TL('fin.acc.' + x, x))}</option>`).join('')}</select></label>${inp('data-ac="currency"', TL('fin.sumCur', 'Currency'), 'text', 'value="CZK" maxlength="3"')}</div><button class="btn" data-ac-save>${esc(TL('fin.p.add', 'Add'))}</button>
        <h4>${esc(TL('fin.p.addSnap', 'Balance at a date (snapshot)'))}</h4><div class="kx-calc-grid"><label class="kx-lf"><span>${esc(TL('fin.p.account', 'Account'))}</span><select data-sn="account">${b.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>${inp('data-sn="date"', TL('fin.date', 'Date'), 'date')}${inp('data-sn="amount"', TL('fin.amount', 'Amount'), 'number', 'step="0.01"')}</div><button class="btn" data-sn-save>${esc(TL('fin.p.save2', 'Save'))}</button>`;
        }
        else if (v === 'GOALS') {
            const g = await IV('ACTION.FINANCE.GOALS', { spaceId: st.space }).catch(() => []);
            body = `<ul class="kx-gd-list">${g.map((x) => `<li><span class="kx-gd-t"><b>${esc(x.name)}</b><small>${mo(x.saved, x.currency)} / ${mo(x.target, x.currency)} · ${x.percent} %${x.deadline ? ` · ${esc(TL('fin.p.until', 'until'))} ${esc(x.deadline)}` : ''}${x.monthlyNeed != null ? ` · ${esc(TL('fin.p.need', 'monthly'))} ${mo(x.monthlyNeed, x.currency)}` : ''}</small><span class="kx-fin-bar" role="img" aria-label="${x.percent} %"><i style="width:${x.percent}%"></i></span></span></li>`).join('') || none}</ul>
        <h4>${esc(TL('fin.p.addGoal', 'Add a goal'))}</h4><div class="kx-calc-grid">${inp('data-gl="name"', TL('fin.p.name', 'Name'))}${inp('data-gl="target"', TL('fin.p.target', 'Target'), 'number', 'min="0"')}${inp('data-gl="deadline"', TL('fin.p.deadline', 'Deadline'), 'date')}${inp('data-gl="start"', TL('fin.p.start', 'Already saved'), 'number', 'min="0"')}</div><button class="btn" data-gl-save>${esc(TL('fin.p.add', 'Add'))}</button><p class="muted">${esc(TL('fin.p.goalHelp', 'Link a movement to the goal – it counts into the goal.'))}</p>`;
        }
        else if (v === 'REIMBURSE') {
            const r = await IV('ACTION.FINANCE.REIMBURSEMENTS', { spaceId: st.space }).catch(() => null);
            body = `<p><b>${esc(TL('fin.p.openTotal', 'Open'))}: ${mo(r?.total || 0)}</b>${Object.entries(r?.byWho || {}).map(([w, a]) => ` · ${esc(w)} ${mo(a)}`).join('')}</p><table class="kx-calc-table"><tr><th>${esc(TL('fin.date', 'Date'))}</th><th>${esc(TL('fin.amount', 'Amount'))}</th><th>${esc(TL('fin.p.who', 'Who'))}</th><th>${esc(TL('fin.p.state', 'State'))}</th><th>${esc(TL('fin.counterparty', 'Counterparty'))}</th></tr>${(r?.open || []).map((m) => `<tr><td>${esc(m.date)}</td><td>${mo(m.amount, m.currency)}</td><td>${esc(m.who || '–')}</td><td>${esc(TL('fin.reimb.' + m.state, m.state))}</td><td>${esc(m.counterparty || '')}</td></tr>`).join('') || `<tr><td colspan="5" class="muted">${esc(TL('fin.p.none', 'Nothing yet.'))}</td></tr>`}</table>`;
        }
        else if (v === 'CAPEX') {
            const cx = await IV('ACTION.FINANCE.CAPEX.LIST', { spaceId: st.space }).catch(() => []);
            const dot = (x) => x.source === 'DEMO' ? `<span class="kx-demo-dot" title="${esc(TL('fin.demo', 'demo'))}">●</span> ` : '';
            body = `<details class="kx-fin-explain" open><summary>${esc(TL('fin.cx.what', 'What is CAPEX and how it is counted'))}</summary><p>${esc(TL('fin.cx.help', 'CAPEX = an investment used for years (machine, laser, car, renovation). It is not a one-off expense: its cost is spread as depreciation over its life. Counted from: price, date, life in months, residual value, financing (cash / loan / lease – instalments go into the outlook) and the monthly benefit (saving or extra sales) → book value, total paid, cost of financing and payback. OPEX = running costs (energy, material, service).'))}</p></details>
        <table class="kx-calc-table"><tr><th>${esc(TL('fin.p.name', 'Name'))}</th><th>${esc(TL('fin.cx.cost', 'Cost'))}</th><th>${esc(TL('fin.cx.dep', 'Depreciation / month'))}</th><th>${esc(TL('fin.cx.book', 'Book value'))}</th><th>${esc(TL('fin.cx.fin', 'Financing'))}</th><th>${esc(TL('fin.cx.paid', 'Total paid'))}</th><th>${esc(TL('fin.cx.payback', 'Payback'))}</th></tr>${cx.map((x) => `<tr><th>${dot(x)}${esc(x.name)}${x.source === 'DEMO' ? demoBtns(x.id) : ''}</th><td>${mo(x.cost, x.currency)}</td><td>${mo(x.monthlyDepreciation, x.currency)}</td><td>${mo(x.bookValue, x.currency)}</td><td>${esc(TL('fin.cx.f.' + x.financing, x.financing))}${x.finMonths ? ` · ${x.finMonths} × ${mo(x.finMonthly, x.currency)}` : ''}</td><td>${mo(x.totalPaid, x.currency)}${x.financingCost > 0 ? ` <small class="muted">(+${mo(x.financingCost, x.currency)})</small>` : ''}</td><td>${x.paybackMonths != null ? x.paybackMonths + ' ' + esc(TL('fin.p.moShort', 'mo.')) : '–'}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">${esc(TL('fin.p.none', 'Nothing yet.'))}</td></tr>`}</table>
        <button class="btn ghost compact" data-cx-demo>● ${esc(TL('fin.cx.demo', 'Add demo investments'))}</button>${cx.some((x) => x.source === 'DEMO') ? ` <button class="btn ghost compact" data-fin-demo-remove>🗑 ${esc(TL('fin.demoRemove', 'Remove demo examples'))}</button>` : ''}
        <h4>${esc(TL('fin.cx.add', 'Add an investment'))}</h4><div class="kx-calc-grid">${inp('data-cx="name"', TL('fin.p.name', 'Name'))}${inp('data-cx="cost"', TL('fin.cx.cost', 'Cost'), 'number', 'min="0"')}${inp('data-cx="date"', TL('fin.date', 'Date'), 'date')}${inp('data-cx="lifeMonths"', TL('fin.cx.life', 'Life (months)'), 'number', 'min="1" value="60"')}${inp('data-cx="salvage"', TL('fin.cx.salvage', 'Residual value'), 'number', 'min="0"')}
          <label class="kx-lf"><span>${esc(TL('fin.cx.fin', 'Financing'))}</span><select data-cx="financing">${['CASH', 'LOAN', 'LEASE'].map(k => `<option value="${k}">${esc(TL('fin.cx.f.' + k, k))}</option>`).join('')}</select></label>${inp('data-cx="finMonths"', TL('fin.cx.finMonths', 'Instalments (months)'), 'number', 'min="0"')}${inp('data-cx="finMonthly"', TL('fin.cx.finMonthly', 'Instalment / month'), 'number', 'min="0"')}${inp('data-cx="downPayment"', TL('fin.cx.down', 'Down payment'), 'number', 'min="0"')}${inp('data-cx="benefitMonthly"', TL('fin.cx.benefit', 'Benefit / month'), 'number', 'min="0"')}</div><button class="btn" data-cx-save>${esc(TL('fin.p.add', 'Add'))}</button>`;
        }
        else if (v === 'CASE') {
            const cs = await IV('ACTION.FINANCE.CASES', { spaceId: st.space }).catch(() => []);
            body = `<details class="kx-fin-explain" open><summary>${esc(TL('fin.bc.what', 'Business case – how it works'))}</summary><p>${esc(TL('fin.bc.help', 'A decision about an investment or a project: investment (CAPEX) + running costs (OPEX) against the monthly benefit over a horizon → net per month, total, payback, NPV (today’s value at an interest rate) and IRR (yield). Sensitivity shows what happens with a benefit 20 % lower or higher. Examples: a new laser, an e-shop, solar panels at home.'))}</p></details>
        <table class="kx-calc-table"><tr><th>${esc(TL('fin.p.name', 'Name'))}</th><th>${esc(TL('fin.bc.invest', 'Investment'))}</th><th>${esc(TL('fin.bc.net', 'Net / month'))}</th><th>${esc(TL('fin.cx.payback', 'Payback'))}</th><th>NPV</th><th>IRR</th><th>${esc(TL('fin.bc.sens', '−20 % / +20 %'))}</th></tr>${cs.map((x) => `<tr><th>${x.source === 'DEMO' ? '<span class="kx-demo-dot">●</span> ' : ''}${esc(x.name)}${x.source === 'DEMO' ? demoBtns(x.id) : ''}<small class="muted"> · ${x.horizonMonths} ${esc(TL('fin.p.moShort', 'mo.'))}</small></th><td>${mo(x.invest)}</td><td>${mo(x.netMonthly)}</td><td>${x.paybackMonths != null ? x.paybackMonths + ' ' + esc(TL('fin.p.moShort', 'mo.')) : '–'}</td><td>${mo(x.npv)}</td><td>${x.irrPct != null ? x.irrPct + ' %' : '–'}</td><td>${x.sensitivity.minus20.paybackMonths ?? '–'} / ${x.sensitivity.plus20.paybackMonths ?? '–'}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">${esc(TL('fin.p.none', 'Nothing yet.'))}</td></tr>`}</table>
        <button class="btn ghost compact" data-bc-demo>● ${esc(TL('fin.bc.demo', 'Add examples'))}</button>${cs.some((x) => x.source === 'DEMO') ? ` <button class="btn ghost compact" data-fin-demo-remove>🗑 ${esc(TL('fin.demoRemove', 'Remove demo examples'))}</button>` : ''}
        <h4>${esc(TL('fin.bc.add', 'New business case'))}</h4><div class="kx-calc-grid">${inp('data-bc="name"', TL('fin.p.name', 'Name'))}${inp('data-bc="horizonMonths"', TL('fin.bc.horizon', 'Horizon (months)'), 'number', 'min="1" value="36"')}${inp('data-bc="invest"', TL('fin.bc.invest', 'Investment'), 'number', 'min="0"')}${inp('data-bc="opexMonthly"', TL('fin.bc.opex', 'Running cost / month'), 'number', 'min="0"')}${inp('data-bc="benefitMonthly"', TL('fin.cx.benefit', 'Benefit / month'), 'number', 'min="0"')}${inp('data-bc="ratePct"', TL('fin.bc.rate', 'Interest rate % / year'), 'number', 'min="0" value="5"')}</div><button class="btn" data-bc-save>${esc(TL('fin.p.add', 'Add'))}</button>`;
        }
        root.innerHTML = `<div class="kx-fin" data-fin-hub data-fin-view="${esc(v)}">${head}${body}</div>`;
        bindSpaces(root, core, opts);
        /* N2.6b (user: overview of moved / paused / cancelled payments): changes of planned payments with Undo / Resume – the outlook recomputes right away */
        if (v === 'OUTLOOK') {
            void (async () => {
                let ch = [];
                try {
                    ch = await IV('ACTION.FINANCE.PLANNED.CHANGES', {});
                }
                catch { } /* all spaces the user may see – it is a summary */
                const host = root.querySelector('[data-fin-hub]');
                if (!host)
                    return;
                const dd = (x) => x ? new Date(String(x) + 'T12:00:00').toLocaleDateString() : '';
                const L = { MOVE: (x) => TL('fin.ch.move', '').replace('{a}', dd(x.date)).replace('{b}', dd(x.to)), SKIP: (x) => TL('fin.ch.skip', '').replace('{a}', dd(x.date)), PAID: (x) => TL('fin.ch.paid', '').replace('{a}', dd(x.date)), PAUSE: (x) => TL('fin.ch.pause', '').replace('{a}', dd(x.date)), STOP: (x) => TL('fin.ch.stop', '').replace('{a}', dd(x.date)) };
                const sec = document.createElement('section');
                sec.className = 'kx-fin-changes';
                sec.dataset.finChanges = '1';
                sec.innerHTML = `<h3>${esc(TL('fin.ch.title', ''))}</h3>${ch.length ? `<ul>${ch.map((x) => `<li><b>${esc(String(x.name || ''))}</b><span class="kx-fin-ch-op op-${esc(x.op)}">${esc((L[x.op] || (() => x.op))(x))}</span><em>${esc(Number(x.amount || 0).toLocaleString('cs-CZ'))} ${esc(TL('viz.czk', ''))}</em>${x.op === 'MOVE' || x.op === 'SKIP' ? `<button class="btn ghost compact" data-fin-ch-undo="${esc(x.id)}" data-fin-ch-date="${esc(x.date)}">↶ ${esc(TL('fin.ch.undo', ''))}</button>` : x.op === 'PAUSE' ? `<button class="btn ghost compact" data-fin-ch-resume="${esc(x.id)}">▶ ${esc(TL('fin.ch.resume', ''))}</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(TL('fin.ch.none', ''))}</p>`}`;
                host.appendChild(sec);
                sec.querySelectorAll('[data-fin-ch-undo]').forEach(b => b.onclick = async () => { try {
                    await IV('ACTION.FINANCE.PLANNED.CHANGE', { id: b.dataset.finChUndo, op: 'RESTORE', date: b.dataset.finChDate });
                    t(TL('fin.ch.undone', ''));
                    again();
                }
                catch (e) {
                    t(String(e?.message || e));
                } });
                sec.querySelectorAll('[data-fin-ch-resume]').forEach(b => b.onclick = async () => { try {
                    await IV('ACTION.FINANCE.PLANNED.CHANGE', { id: b.dataset.finChResume, op: 'RESUME' });
                    t(TL('fin.ch.resumed', ''));
                    again();
                }
                catch (e) {
                    t(String(e?.message || e));
                } });
            })();
        }
        const again = () => mountHub(root, core, opts);
        const val = (sel) => root.querySelector(sel)?.value || '';
        const t = (e) => { (opts.onToast || (() => { }))(String(e?.message || e)); };
        root.querySelector('[data-fin-month]')?.addEventListener('change', (e) => { st.month = e.target.value; void again(); });
        root.querySelector('[data-fin-outn]')?.addEventListener('change', async (e) => { st.outlookN = Number(e.target.value); try {
            await IV('ACTION.FINANCE.PREFS.SET', { outlookMonths: st.outlookN });
        }
        catch { } void again(); });
        root.querySelectorAll('[data-fin-pmode]').forEach(b => b.onclick = async () => { try {
            await IV('ACTION.FINANCE.PREFS.SET', { periodMode: b.dataset.finPmode });
        }
        catch (e) {
            t(e);
        } void again(); });
        root.querySelector('[data-fin-payday]')?.addEventListener('change', async (e) => { try {
            await IV('ACTION.FINANCE.PREFS.SET', { payday: Number(e.target.value) });
        }
        catch (x) {
            t(x);
        } void again(); });
        /* N2.5q: QR payment (Czech SPD) for a missing planned payment */ root.querySelectorAll('[data-fin-qr]').forEach(b => b.onclick = async () => {
            const out = root.querySelector('[data-fin-qr-out]');
            try {
                const r = await IV('ACTION.FINANCE.QR', { id: b.dataset.finQr }); /* NEXUS own QR generator (same as Contacts) */
                const H = globalThis.KXHandoff;
                const svg = H?.qrSvg ? H.qrSvg(r.spd, { label: 'QR platba' }) : '';
                out.innerHTML = `<div class="kx-fin-qr">${svg}<small>${esc(r.iban)} · ${esc(TL('fin.mt.qrHelp', 'Scan in the bank app on your phone.'))}</small></div>`;
            }
            catch (e) {
                out.innerHTML = `<p class="muted">${esc(String(e?.message || '').includes('FINANCE_QR_ACCOUNT') ? TL('fin.mt.qrNoAcc', 'Add the payee account to the planned payment – then the QR can be made.') : String(e?.message || e))}</p>`;
            }
        });
        root.querySelectorAll('[data-fin-demo-adopt]').forEach(b => b.onclick = async () => { try {
            await IV('ACTION.FINANCE.DEMO.ADOPT', { id: b.dataset.finDemoAdopt });
            (opts.onToast || (() => { }))(TL('fin.demoAdopted', 'Adopted – a new record of your own was created.'));
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelectorAll('[data-fin-demo-del]').forEach(b => b.onclick = async () => { try {
            await core.actions.invoke('ACTION.FINANCE.DEMO.REMOVE', { id: b.dataset.finDemoDel }, { ...C, confirmed: true });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelectorAll('[data-fin-demo-remove]').forEach(b => b.onclick = async () => { if (!confirm(TL('fin.demoRemoveQ', 'Remove all demo examples of Finance (to the trash)?')))
            return; try {
            await core.actions.invoke('ACTION.FINANCE.DEMO.REMOVE', { spaceId: st.space }, { ...C, confirmed: true });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-cx-demo]')?.addEventListener('click', async () => { try {
            await IV('ACTION.FINANCE.CAPEX.DEMO', { spaceId: st.space });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-cx-save]')?.addEventListener('click', async () => { const g = (k) => val(`[data-cx="${k}"]`); try {
            await IV('ACTION.FINANCE.CAPEX.SAVE', { spaceId: st.space, data: { name: g('name'), cost: Number(g('cost')), date: g('date'), lifeMonths: Number(g('lifeMonths')), salvage: Number(g('salvage') || 0), financing: g('financing'), finMonths: Number(g('finMonths') || 0), finMonthly: Number(g('finMonthly') || 0), downPayment: Number(g('downPayment') || 0), benefitMonthly: Number(g('benefitMonthly') || 0) } });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-bc-save]')?.addEventListener('click', async () => { const g = (k) => val(`[data-bc="${k}"]`); try {
            await IV('ACTION.FINANCE.CASE.SAVE', { spaceId: st.space, data: { name: g('name'), horizonMonths: Number(g('horizonMonths')), invest: Number(g('invest') || 0), opexMonthly: Number(g('opexMonthly') || 0), benefitMonthly: Number(g('benefitMonthly') || 0), ratePct: Number(g('ratePct') || 5) } });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-bc-demo]')?.addEventListener('click', async () => {
            const ex = [{ name: TL('fin.bc.ex1', 'New laser (example)'), horizonMonths: 60, invest: 200000, opexMonthly: 1500, benefitMonthly: 9000 }, { name: TL('fin.bc.ex2', 'E-shop (example)'), horizonMonths: 36, invest: 60000, opexMonthly: 2000, benefitMonthly: 6000 }, { name: TL('fin.bc.ex3', 'Solar panels at home (example)'), horizonMonths: 180, invest: 280000, opexMonthly: 200, benefitMonthly: 2300 }];
            try {
                for (const x of ex)
                    await IV('ACTION.FINANCE.CASE.SAVE', { spaceId: st.space, data: { ...x, ratePct: 5, source: 'DEMO' } });
                void again();
            }
            catch (e) {
                t(e);
            }
        });
        root.querySelector('[data-fin-plan-save]')?.addEventListener('click', async () => { const lines = {}; root.querySelectorAll('[data-fin-plan]').forEach(i => { if (i.value !== '')
            lines[String(i.dataset.finPlan)] = Number(i.value); }); try {
            await IV('ACTION.FINANCE.BUDGET.SAVE', { spaceId: st.space, data: { month: st.month, currency: 'CZK', lines } });
            void again();
        }
        catch (e) {
            t(e);
        } });
        /* N2.5q: templates of planned payments (household / company) prefill the form */ root.querySelectorAll('[data-pl-tpl]').forEach(b => b.onclick = () => {
            const x = (sp?.kind === 'COMPANY' ? TPL_CO : TPL_HOME)[Number(b.dataset.plTpl)];
            const set = (k, v) => { const e = root.querySelector(`[data-pl="${k}"]`); if (e) {
                e.value = String(v ?? '');
                e.dispatchEvent(new Event('change', { bubbles: true }));
            } };
            set('name', TL('fin.tpl.' + x.k, x.k));
            set('kind', x.kind || 'EXPENSE');
            set('every', x.every);
            set('n', x.n || '');
            set('months', (x.months || []).join(', '));
            if (cats.includes(x.cat))
                set('category', x.cat);
            root.querySelector('[data-pl="amount"]')?.focus();
        });
        root.querySelector('[data-pl-save]')?.addEventListener('click', async () => { try {
            await IV('ACTION.FINANCE.PLANNED.SAVE', { spaceId: st.space, data: { name: val('[data-pl="name"]'), kind: val('[data-pl="kind"]'), amount: Number(val('[data-pl="amount"]')), ...(String(val('[data-pl="every"]')).startsWith('FREQ=') ? { every: 'RULE', rule: val('[data-pl="every"]') } : { every: val('[data-pl="every"]') }), n: Number(val('[data-pl="n"]')) || undefined, months: val('[data-pl="months"]').split(/[,; ]+/).map(Number).filter(Boolean), payeeAccount: val('[data-pl="payeeAccount"]'), vs: val('[data-pl="vs"]'), nextDate: val('[data-pl="nextDate"]'), category: val('[data-pl="category"]'), currency: 'CZK' } });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-ac-save]')?.addEventListener('click', async () => { try {
            await IV('ACTION.FINANCE.ACCOUNT.SAVE', { spaceId: st.space, data: { name: val('[data-ac="name"]'), kind: val('[data-ac="kind"]'), currency: val('[data-ac="currency"]').toUpperCase() } });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-sn-save]')?.addEventListener('click', async () => { try {
            await IV('ACTION.FINANCE.BALANCE.SAVE', { data: { account: val('[data-sn="account"]'), date: val('[data-sn="date"]'), amount: Number(val('[data-sn="amount"]')) } });
            void again();
        }
        catch (e) {
            t(e);
        } });
        root.querySelectorAll('[data-acc-check]').forEach(b => b.onclick = async () => { try {
            const r = await IV('ACTION.FINANCE.ACCOUNT.CHECK', { account: b.dataset.accCheck });
            const o = root.querySelector('[data-acc-out]');
            o.textContent = r.checks.length ? r.checks.map((c) => `${c.date}: ${TL('fin.p.diff', 'difference')} ${c.difference}`).join(' · ') : TL('fin.p.needTwo', 'Two snapshots are needed for a check.');
        }
        catch (e) {
            t(e);
        } });
        root.querySelector('[data-gl-save]')?.addEventListener('click', async () => { try {
            await IV('ACTION.FINANCE.GOAL.SAVE', { spaceId: st.space, data: { name: val('[data-gl="name"]'), target: Number(val('[data-gl="target"]')), deadline: val('[data-gl="deadline"]'), start: Number(val('[data-gl="start"]') || 0), currency: 'CZK' } });
            void again();
        }
        catch (e) {
            t(e);
        } });
    }
    async function mountHub(root, core, opts) {
        regOpener();
        const K = F();
        if (!K)
            return;
        K.install(core);
        registerTable(core);
        /* N2.5p: tabs of THIS hub (the tree can open one directly) */ const req = globalThis.KXHubTabRequest?.[K.OWNER];
        if (req && TABS.some(([k]) => k === req)) {
            st.view = req;
            delete globalThis.KXHubTabRequest[K.OWNER];
        }
        if (!st.view)
            st.view = 'MOVEMENTS';
        const C = { actorId: opts.actorId, appCode: K.OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true };
        const spaces = (await core.propagate.spaces(opts.actorId)).filter((s) => ['PERSONAL', 'FAMILY', 'COMPANY'].includes(s.kind));
        if (!st.space || !spaces.some((s) => s.id === st.space))
            st.space = spaces[0]?.id || '';
        const sp = spaces.find((s) => s.id === st.space);
        /* N2.5p: goals of this space for the movement form */ let goalsForForm = [];
        try {
            if (core.financePlan)
                goalsForForm = await core.actions.invoke('ACTION.FINANCE.GOALS', { spaceId: st.space }, C);
        }
        catch { }
        const finExtraFields = () => `<label class="kx-lf" data-ff-tronly><span>${esc(TL('fin.f.transferType', 'Transfer type'))}</span><select data-ff="transferType">${K.TRANSFER_TYPES.map((k) => `<option value="${k}" ${k === 'HOUSEHOLD' ? 'selected' : ''}>${esc(TL('fin.transfer.' + k, k))}</option>`).join('')}</select></label>
       <label class="kx-lf"><span>${esc(TL('fin.f.reimburse', 'Reimbursement'))}</span><select data-ff="reimburse"><option value="">${esc(TL('fin.f.noReimb', 'not reimbursed'))}</option>${K.REIMB.map((k) => `<option value="${k}">${esc(TL('fin.reimb.' + k, k))}</option>`).join('')}</select></label><label class="kx-lf"><span>${esc(TL('fin.f.who', 'Who (reimbursement)'))}</span><input data-ff="reimburseWho" maxlength="120"></label>
       ${goalsForForm.length ? `<label class="kx-lf"><span>${esc(TL('fin.f.goal', 'Saving goal'))}</span><select data-ff="goalRef"><option value="">—</option>${goalsForForm.map((g) => `<option value="${esc(g.ref)}">${esc(g.name)}</option>`).join('')}</select></label>` : ''}`;
        let rows = [];
        let locked = false;
        try {
            rows = await core.actions.invoke('ACTION.FINANCE.MOVEMENT.LIST', { spaceId: st.space }, C);
        }
        catch (e) {
            if (/AUTH_SESSION_REQUIRED/.test(String(e?.message)))
                locked = true;
            else
                throw e;
        }
        const spaceChips = `<div class="kx-print3d-tabs" data-fin-spaces>${spaces.map((s) => `<button class="chip ${s.id === st.space ? 'active' : ''}" data-fin-space="${esc(s.id)}">${(() => { const k = TL('fin.space.' + s.kind, s.kind); const nm = String(s.name || ''); return nm.toLowerCase().startsWith(String(k).toLowerCase()) ? esc(nm) : `${esc(k)} · ${esc(nm)}`; })()}</button>`).join('')}</div>`;
        const tabBar = `<div class="kx-sf-scope" data-fin-tabs>${TABS.map(([k, l]) => `<button type="button" class="${st.view === k ? 'active' : ''}" data-fin-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
        if (locked) {
            root.innerHTML = `<div class="kx-fin" data-fin-hub data-fin-locked>${spaceChips}<div class="kx-tw-safety">🔒 ${esc(TL('fin.locked', 'Finance is sensitive – sign in to see and record movements.'))} <span class="kx-fix"><button type="button" class="btn ghost compact" data-fix-place="IDENTITY">🔐 ${esc(TL('fix.place.IDENTITY', 'Sign in'))}</button><button type="button" class="btn ghost compact" data-fix-manual="${esc(TL('fix.idManual', 'identity'))}">📘 ${esc(TL('fix.manual', 'Manual'))}</button></span></div></div>`;
            bindSpaces(root, core, opts);
            return;
        }
        const grp = K.group(sp?.kind || 'PERSONAL');
        const cats = K.CATS[grp];
        const isCo = sp?.kind === 'COMPANY';
        if (st.view !== 'MOVEMENTS' && core.financePlan) {
            await renderPlan(root, core, opts, C, sp, cats, spaceChips + tabBar);
            return;
        }
        const FX = globalThis.KXCurrency;
        const CODES = FX?.CODES || ['CZK'];
        const defCur = core.currency ? await core.currency.defaultCurrency(opts.actorId) : 'CZK';
        if (!st.sumCur)
            st.sumCur = defCur;
        const mRows = rows.filter((r) => r.data.date.startsWith(st.month));
        const rates = core.currency ? (await core.currency.rates())?.rates || { CZK: 1 } : { CZK: 1 };
        const sum = st.convert ? K.summaryConverted(rows, st.month, st.sumCur, rates) : K.summary(rows, st.month, st.sumCur);
        root.innerHTML = `<div class="kx-fin" data-fin-hub>${spaceChips}${tabBar}
      <div class="kx-fin-head"><label>${esc(TL('fin.month', 'Month'))} <input type="month" data-fin-month value="${esc(st.month)}"></label>
        <label>${esc(TL('fin.sumCur', 'Currency'))} <select data-fin-sumcur>${CODES.map((c) => `<option value="${c}" ${c === st.sumCur ? 'selected' : ''} title="${esc(FX?.label(c) || c)}">${c}</option>`).join('')}</select></label><label class="kx-chk"><input type="checkbox" data-fin-convert ${st.convert ? 'checked' : ''}> ${esc(TL('fin.convert', 'convert other currencies'))}</label>
        <div class="kx-fin-sum" data-fin-summary><span>${esc(TL('fin.income', 'Income'))} <b data-fin-income>${money(sum.income, st.sumCur)}</b></span><span>${esc(TL('fin.expense', 'Expense'))} <b data-fin-expense>${money(sum.expense, st.sumCur)}</b></span><span>${esc(TL('fin.balance', 'Balance'))} <b data-fin-balance class="${sum.balance < 0 ? 'kx-neg' : ''}">${money(sum.balance, st.sumCur)}</b></span>${(sum.otherCurrencies || []).length ? `<small class="muted">${esc(TL('fin.otherCurrencies', 'other currencies not added'))}: ${esc(sum.otherCurrencies.join(', '))}</small>` : ''}${(sum.missingRates || []).length ? `<small class="kx-off" data-fin-missing>${esc(TL('fin.missingRates', 'no rate (not added)'))}: ${esc(sum.missingRates.join(', '))}</small>` : ''}</div>
        <button class="btn ghost compact" data-fin-csv>⇩ CSV</button> <label class="btn ghost compact">⇧ ${esc(TL('fin.import', 'Import CSV'))}<input type="file" accept=".csv,text/csv" data-fin-import hidden></label></div>
      <div data-fin-import-box></div>
      ${Object.keys(sum.byCategory).length ? `<div class="kx-fin-cats" data-fin-cats>${Object.entries(sum.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(TL('fin.cat.' + k, k))} <b>${money(v, 'CZK')}</b></span>`).join('')}</div>` : ''}
      <details class="kx-lcols" data-fin-new ${mRows.length ? '' : 'open'}><summary>＋ ${esc(TL('fin.new', 'New movement'))}</summary><div class="kx-calc-grid">
        <label class="kx-lf"><span>${esc(TL('fin.col.kind', 'Kind'))}</span><select data-ff="kind">${K.KINDS.map((k) => `<option value="${k}" ${k === st.kind ? 'selected' : ''}>${esc(TL('fin.kind.' + k, k))}</option>`).join('')}</select></label>
        <label class="kx-lf"><span>${esc(TL('fin.col.date', 'Date'))}</span><input type="date" data-ff="date" value="${esc(new Date().toISOString().slice(0, 10))}"></label>
        <label class="kx-lf"><span>${esc(TL('fin.col.amount', 'Amount'))}*</span><input data-ff="amount" inputmode="decimal"></label>
        <label class="kx-lf"><span>${esc(TL('fin.col.currency', 'Currency'))}</span><select data-ff="currency">${CODES.map((c) => `<option value="${c}" ${c === defCur ? 'selected' : ''} title="${esc(FX?.label(c) || c)}">${c}</option>`).join('')}</select></label>
        <label class="kx-lf" data-ff-cat><span>${esc(TL('fin.col.category', 'Category'))}</span><select data-ff="category">${cats.map((c) => `<option value="${c}">${esc(TL('fin.cat.' + c, c))}</option>`).join('')}</select></label>
        <label class="kx-lf"><span>${esc(TL('fin.col.counterparty', 'Counterparty'))}</span><input data-ff="counterparty" maxlength="160"></label>
        <label class="kx-lf"><span>${esc(TL('fin.col.account', 'Account'))}</span><input data-ff="account" maxlength="160" placeholder="${esc(TL('fin.accountPh', 'cash / bank / card'))}"></label>
        <label class="kx-lf" data-ff-to hidden><span>${esc(TL('fin.toAccount', 'To account'))}</span><input data-ff="toAccount" maxlength="160"></label>
        ${isCo ? `<label class="kx-lf"><span>${esc(TL('fin.col.docNo', 'Document'))}</span><input data-ff="docNo" maxlength="160"></label><label class="kx-lf"><span>${esc(TL('fin.vatRate', 'VAT rate'))}</span><select data-ff="vatRate"><option value="">—</option>${K.VAT_RATES.map((r) => `<option value="${r}">${r} %</option>`).join('')}</select></label>` : ''}
        <label class="kx-lf"><span>${esc(TL('fin.col.note', 'Note'))}</span><input data-ff="note" maxlength="2000"></label>${finExtraFields()}</div>
        <button class="btn" data-fin-save>${esc(TL('laser.save', 'Save'))}</button> <button class="btn ghost" data-fin-draft>💾 ${esc(TL('draft.save', 'Save as draft'))}</button> <span class="kx-lf-help" data-fin-err></span>${isCo ? `<small class="muted"> ${esc(TL('fin.vatNote', 'VAT rates 21 / 12 / 0 % (from 1. 1. 2024) – verify for accounting.'))}</small>` : ''}</details>
      <div data-fin-table></div></div>`;
        bindSpaces(root, core, opts);
        root.querySelector('[data-fin-month]').onchange = (e) => { st.month = e.target.value || st.month; void mountHub(root, core, opts); };
        root.querySelector('[data-fin-sumcur]').onchange = (e) => { st.sumCur = e.target.value; void mountHub(root, core, opts); };
        root.querySelector('[data-fin-convert]').onchange = (e) => { st.convert = !!e.target.checked; void mountHub(root, core, opts); };
        /* N2.4v: CSV import – preview first, then apply; source currency (when the file has none) and optional conversion */
        const impBox = root.querySelector('[data-fin-import-box]');
        const showImport = async () => {
            if (!st.imp) {
                impBox.innerHTML = '';
                return;
            }
            try {
                const pv = await core.actions.invoke('ACTION.FINANCE.IMPORT.PREVIEW', { spaceId: st.space, text: st.imp.text, sourceCurrency: st.imp.src, convertTo: st.imp.to || undefined }, C);
                impBox.innerHTML = `<section class="kx-lcard open" data-fin-import-preview><b>⇧ ${esc(st.imp.name)}</b> · ${esc(TL('fin.impReady', 'ready'))}: <b data-fin-imp-ready>${pv.ready}</b>${pv.errors.length ? ` · ${esc(TL('fin.impErrors', 'bad lines'))}: ${pv.errors.map((x) => x.line).join(', ')}` : ''}
          <div class="kx-calc-grid"><label class="kx-lf"><span>${esc(TL('fin.impSrc', 'Currency of the file (when missing)'))}</span><select data-fin-imp-src>${CODES.map((c) => `<option ${c === st.imp.src ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="kx-lf"><span>${esc(TL('fin.impTo', 'Convert to'))}</span><select data-fin-imp-to><option value="">${esc(TL('fin.impKeep', 'keep currencies'))}</option>${CODES.map((c) => `<option ${c === st.imp.to ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
          <table class="kx-calc-table"><tr><th>${esc(TL('fin.col.date', 'Date'))}</th><th>${esc(TL('fin.col.kind', 'Kind'))}</th><th>${esc(TL('fin.col.amount', 'Amount'))}</th><th>${esc(TL('fin.col.counterparty', 'Counterparty'))}</th><th></th></tr>${pv.rows.slice(0, 50).map((x) => `<tr class="${x.error ? 'kx-cell-warn' : ''}"><td>${esc(x.date)}</td><td>${esc(TL('fin.kind.' + x.kind, x.kind))}</td><td>${money(x.amount, x.currency)}${x.fx ? ` <small class="muted">(${money(x.fx.originalAmount, x.fx.originalCurrency)})</small>` : ''}</td><td>${esc(x.counterparty)}</td><td>${x.error ? esc(TL('fin.err.' + x.error, x.error)) : ''}</td></tr>`).join('')}</table>
          <button class="btn" data-fin-imp-apply ${pv.ready ? '' : 'disabled'}>${esc(TL('fin.impApply', 'Import'))} (${pv.ready})</button> <button class="btn ghost" data-fin-imp-cancel>${esc(TL('fin.impCancel', 'Cancel'))}</button></section>`;
                impBox.querySelector('[data-fin-imp-src]').onchange = (e) => { st.imp.src = e.target.value; void showImport(); };
                impBox.querySelector('[data-fin-imp-to]').onchange = (e) => { st.imp.to = e.target.value; void showImport(); };
                impBox.querySelector('[data-fin-imp-cancel]').onclick = () => { st.imp = null; void showImport(); };
                impBox.querySelector('[data-fin-imp-apply]').onclick = async () => { try {
                    const r = await core.actions.invoke('ACTION.FINANCE.IMPORT.APPLY', { spaceId: st.space, text: st.imp.text, sourceCurrency: st.imp.src, convertTo: st.imp.to || undefined }, C);
                    opts.onToast?.(`${TL('fin.impDone', 'Imported')}: ${r.saved}`);
                    st.imp = null;
                    void mountHub(root, core, opts);
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                } };
            }
            catch (e) {
                impBox.innerHTML = `<div class="kx-tw-safety">${esc(TL('fin.err.' + String(e?.message || '').split(' ')[0], String(e?.message || e)))}</div>`;
            }
        };
        root.querySelector('[data-fin-import]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f)
            return; st.imp = { name: f.name, text: await f.text(), src: defCur, to: '' }; void showImport(); };
        if (st.imp)
            void showImport();
        const kindSel = root.querySelector('[data-ff="kind"]');
        const sync = () => { const tr = kindSel.value === 'TRANSFER'; root.querySelector('[data-ff-to]').hidden = !tr; root.querySelector('[data-ff-cat]').hidden = tr; const tro = root.querySelector('[data-ff-tronly]'); if (tro)
            tro.hidden = !tr; };
        kindSel.onchange = () => { st.kind = kindSel.value; sync(); };
        sync();
        /* N2.4y: drafts – „Uložit jako návrh“, auto-save when the app is hidden / closed with a filled form, continue prefilled (draft = Finance → locked without a session) */
        const FIELDS = ['kind', 'date', 'amount', 'currency', 'category', 'counterparty', 'account', 'toAccount', 'note', 'docNo', 'vatRate'];
        /* values read from a given form element – the leave guard reads the DETACHED old form, not the re-rendered one */
        const fvFrom = (el) => { const o = { space: st.space }; for (const k of FIELDS) {
            const e = el.querySelector(`[data-ff="${k}"]`);
            if (e)
                o[k] = e.value;
        } return o; };
        const fv = () => fvFrom(root);
        const filledV = (v) => !!(String(v.amount || '').trim() || String(v.counterparty || '').trim() || String(v.note || '').trim());
        const filled = () => filledV(fv());
        const DCTX = { actorId: opts.actorId, deviceId: opts.deviceId };
        const IBX = globalThis.KXInbox;
        const saveDraft = async () => { const v = fv(); await IBX?.drafts.save(core, DCTX, 'FINANCE_MOVEMENT', 'APP.KX.FINANCE', v, `${TL('fin.kind.' + v.kind, v.kind)} ${v.amount || ''} ${v.currency || ''} ${v.counterparty || ''}`.trim(), st.draftId); };
        if (st.prefill) {
            const v = st.prefill;
            for (const k of FIELDS) {
                const e = root.querySelector(`[data-ff="${k}"]`);
                if (e && v[k] != null && v[k] !== '')
                    e.value = String(v[k]);
            }
            st.prefill = null;
        }
        root.querySelector('[data-fin-draft]').onclick = async () => { await saveDraft(); opts.onToast?.(TL('draft.saved', 'Draft saved')); st.draftId = null; void mountHub(root, core, opts); };
        /* leave guard: another hub / section / closing / re-render / app hidden → draft (unless saved) */
        const formEl = root.querySelector('[data-fin-save]').parentElement;
        formEl.setAttribute('data-kx-draft-own', '');
        const draftIdNow = st.draftId;
        try {
            IBX?.drafts.watch(formEl, () => { if (st.saving)
                return null; const v = fvFrom(formEl); return { form: 'FINANCE_MOVEMENT', hub: 'APP.KX.FINANCE', values: v, filled: filledV(v), title: `${TL('fin.kind.' + v.kind, v.kind)} ${v.amount || ''} ${v.currency || ''} ${v.counterparty || ''}`.trim(), draftId: draftIdNow }; });
        }
        catch { }
        /* N2.5b: smart fields – counterparty (contacts + history, ＋ new contact), accounts (history until account records exist) */
        try {
            const SFM = globalThis.KXSmartField;
            if (SFM?.mount && core.smartFields) {
                const mnt = (k, src, cr) => { const el = root.querySelector(`[data-ff="${k}"]`); if (el)
                    SFM.mount(el, core, { field: 'APP.FINANCE.MOVEMENT#' + k, sources: src, actorId: opts.actorId, create: cr }); };
                mnt('counterparty', ['CONTACTS', 'HISTORY'], 'CONTACTS');
                mnt('account', ['HISTORY']);
                mnt('toAccount', ['HISTORY']);
            }
        }
        catch { }
        root.querySelector('[data-fin-save]').onclick = async () => {
            st.saving = true;
            const q = (k) => root.querySelector(`[data-ff="${k}"]`)?.value?.trim() ?? '';
            const d = { kind: q('kind'), date: q('date'), amount: Number(q('amount').replace(/\s/g, '').replace(',', '.')), currency: q('currency').toUpperCase(), category: q('category'), counterparty: q('counterparty'), account: q('account'), toAccount: q('toAccount'), note: q('note'),
                /* N2.5p */ transferType: q('transferType') || undefined, reimburse: q('reimburse') || undefined, reimburseWho: q('reimburseWho'), goalRef: q('goalRef') || null };
            /* N2.5b: smart fields – the link next to the text */ const rf = (k) => root.querySelector(`[data-ff="${k}"]`)?.dataset.ref || '';
            d.counterpartyRef = rf('counterparty') || null;
            d.accountRef = rf('account') || null;
            d.toAccountRef = rf('toAccount') || null;
            if (isCo) {
                d.docNo = q('docNo');
                if (q('vatRate') !== '')
                    d.vatRate = Number(q('vatRate'));
            }
            try {
                await core.actions.invoke('ACTION.FINANCE.MOVEMENT.SAVE', { spaceId: st.space, data: d }, C);
                if (st.draftId) {
                    try {
                        await core.inbox?.resolve({ id: st.draftId, status: 'DONE' }, { actorId: opts.actorId });
                    }
                    catch { }
                    st.draftId = null;
                }
                st.saving = false;
                void mountHub(root, core, opts);
            }
            catch (e) {
                st.saving = false;
                root.querySelector('[data-fin-err]').textContent = TL('fin.err.' + String(e?.message || '').split(' ')[0], String(e?.message || e));
            }
        };
        root.querySelector('[data-fin-csv]').onclick = async () => { try {
            const text = await core.actions.invoke('ACTION.FINANCE.EXPORT_CSV', { spaceId: st.space, month: st.month }, C);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
            a.download = `finance-${st.month}.csv`;
            a.click();
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } };
        const val = (r, f) => {
            const d = r.data;
            switch (f.key) {
                case 'date': return d.date;
                case 'kind': return TL('fin.kind.' + d.kind, d.kind);
                case 'amount': return d.kind === 'EXPENSE' ? -d.amount : d.amount;
                case 'currency': return d.currency;
                case 'category': return d.category ? TL('fin.cat.' + d.category, d.category) : '';
                case 'counterparty': return d.counterparty;
                case 'account': return d.kind === 'TRANSFER' ? `${d.account} → ${d.toAccount}` : d.account;
                case 'docNo': return d.docNo;
                case 'vat':
                    if (d.vatRate == null)
                        return '';
                    const v = K.vatSplit(d.amount, d.vatRate);
                    return `${d.vatRate} % · ${v.vat}`;
                case 'note': return d.note;
                default: return '';
            }
        };
        if (globalThis.KXTable)
            await globalThis.KXTable(root.querySelector('[data-fin-table]'), { scope: SCOPE, rows: mRows.sort((a, b) => b.data.date.localeCompare(a.data.date)), rowId: (r) => r.id, value: val, exportValue: val, filterState: () => st.filter || {}, onFilter: (x) => { st.filter = x; }, density: 'COMPACT', onDensity: () => { }, selection: st.sel, sortState: () => st.sort, onSort: (x) => { st.sort = x; },
                onOpen: () => { }, onChange: () => void mountHub(root, core, opts), isStale: () => false, rowMenu: (r) => [{ label: `🗑 ${TL('fin.archive', 'Remove (stays in history)')}`, run: async () => { try {
                            await core.actions.invoke('ACTION.FINANCE.MOVEMENT.ARCHIVE', { id: r.id }, C);
                            void mountHub(root, core, opts);
                        }
                        catch (e) {
                            opts.onToast?.(String(e?.message || e));
                        } } }] });
    }
    function bindSpaces(root, core, opts) {
        root.querySelectorAll('[data-fin-space]').forEach(b => b.onclick = () => { st.space = String(b.dataset.finSpace); void mountHub(root, core, opts); });
        /* N2.5p: tabs */ root.querySelectorAll('[data-fin-tab]').forEach(b => b.onclick = () => { st.view = String(b.dataset.finTab); void mountHub(root, core, opts); });
    }
    /* N2.5r: calculators of Finance in the ONE calculator registry (open the tab here – no copy) */ const CALCULATORS = [{ id: 'fin.outlook', tab: 'OUTLOOK', tags: ['finance', 'price'] }, { id: 'fin.budget', tab: 'BUDGET', tags: ['finance'] }, { id: 'fin.capex', tab: 'CAPEX', tags: ['finance', 'price'] }, { id: 'fin.case', tab: 'CASE', tags: ['finance'] }];
    KXFinanceHub = { TABS, SCOPE, mountHub, st, CALCULATORS };
    globalThis.KXFinanceHub = KXFinanceHub;
})();
