// N2.4v: ONE currency service for the whole NEXUS – catalogue (names in the i18n catalogue „cur.XXX“), default currency (setting
// currency.default), ONE set of exchange rates (ČNB daily text or entered by hand) kept in the core with date and source,
// convert() never guesses a missing rate (returns null). Used by Finance, the price comparator and the imports.
var KXCurrency;
(function () {
    const CODES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'CHF', 'HUF', 'JPY', 'CNY', 'SEK', 'DKK', 'NOK', 'CAD', 'AUD'];
    const ID = 'CORE.FX_RATES.CURRENT', T = 'CORE.FX_RATES', OWNER = 'APP.KX.NEXUS';
    const CNB_URL = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
    const tl = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const name = (c) => tl('cur.' + c, c);
    const label = (c) => `${c} – ${name(c)}`;
    /* ČNB daily text: „22.10.2026 #205“, header, „země|měna|množství|kód|kurz“ (comma decimals) → CZK per 1 unit */
    function parseCnb(text) {
        const lines = String(text || '').trim().split(/\r?\n/);
        const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(lines[0] || '');
        if (!m)
            throw new Error('RATES_FORMAT');
        const date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const rates = { CZK: 1 };
        for (const l of lines.slice(2)) {
            const p = l.split('|');
            if (p.length < 5)
                continue;
            const amount = Number(p[2]);
            const rate = Number(String(p[4]).replace(',', '.'));
            if (/^[A-Z]{3}$/.test(p[3]) && amount > 0 && rate > 0)
                rates[p[3]] = rate / amount;
        }
        if (Object.keys(rates).length < 5)
            throw new Error('RATES_FORMAT');
        return { date, source: 'CNB', rates };
    }
    function convertWith(rates, amount, from, to) { if (from === to)
        return amount; const a = rates?.[from], b = rates?.[to]; if (!(a > 0) || !(b > 0))
        return null; return amount * a / b; }
    function install(core) {
        if (core.currency)
            return core.currency;
        let cache = null;
        const C = (ctx) => ctx || { actorId: 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true };
        const svc = { CODES, name, label,
            async rates() { if (cache)
                return cache; try {
                const r = await core.entities.get(ID);
                if (r && r.type === T)
                    cache = r.data;
            }
            catch { } return cache; },
            async save(data, ctx) { const old = await core.entities.get(ID).catch(() => null); const r = await core.entities.save({ id: ID, type: T, ownerApp: OWNER, schema: 'KX.FX_RATES/1', spaceIds: [], expectedRevision: old?.revision, data }, C(ctx)); cache = r.data; return cache; },
            async loadCnb(fetcher = globalThis.fetch?.bind(globalThis), ctx) { const r = await fetcher(CNB_URL); if (!r.ok)
                throw new Error(`RATES_HTTP_${r.status}`); return svc.save(parseCnb(await r.text()), ctx); },
            async setManual(x, ctx) {
                const cur = (await svc.rates())?.rates || { CZK: 1 };
                const rr = { ...cur, CZK: 1 };
                for (const [k, v] of Object.entries(x?.rates || {})) {
                    if (/^[A-Z]{3}$/.test(k) && Number(v) > 0)
                        rr[k] = Number(v);
                }
                return svc.save({ date: String(x?.date || new Date().toISOString().slice(0, 10)), source: 'MANUAL', rates: rr }, ctx);
            },
            async convert(amount, from, to) { const r = await svc.rates(); return convertWith(r?.rates || { CZK: 1 }, amount, from, to); },
            /* default currency from the settings (USER), CZK when not set */
            async defaultCurrency(actorId) { try {
                const x = await core.settingsDefaults.explain(core.settings, 'currency.default', [{ scopeType: 'USER', scopeId: actorId }]);
                const v = x?.effectiveValue;
                return CODES.includes(v) ? v : 'CZK';
            }
            catch {
                return 'CZK';
            } } };
        core.currency = svc;
        return svc;
    }
    KXCurrency = { CODES, CNB_URL, parseCnb, convertWith, name, label, install };
    globalThis.KXCurrency = KXCurrency;
})();
