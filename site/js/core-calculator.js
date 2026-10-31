// N2.5r (user „kalkulačku propracuj“): ONE safe expression engine (no eval / Function) + calculator services for the whole NEXUS:
// expressions (+ − × ÷ ^, brackets, decimal comma, functions, π, e, Ans, „200 + 10 %“ = 220 like a desk calculator), currency conversion by
// the ONE core rate set (ČNB, never guessed), crypto ↔ currency by a cached price (CoinGecko when online; missing = null, never guessed),
// unit price (per kg / l / 100 g / pcs, packs), lists and notes with check boxes, quantities, prices and totals (personal).
var KXCalcEngine;
(function () {
    const FN = { sqrt: Math.sqrt, round: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; }, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, min: Math.min, max: Math.max,
        ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, pow: Math.pow, exp: Math.exp };
    function tokenize(src) {
        const s = String(src || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').trim();
        const t = [];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (/\s/.test(c)) {
                i++;
                continue;
            }
            if (/[0-9.,]/.test(c)) {
                let j = i;
                while (j < s.length && /[0-9.,]/.test(s[j]))
                    j++;
                let num = s.slice(i, j);
                /* decimal comma; a comma between digits inside a function call is an argument separator only when followed by space */ if ((num.match(/[.,]/g) || []).length > 1)
                    throw new Error('CALC_NUMBER');
                num = num.replace(',', '.');
                if (num === '.')
                    throw new Error('CALC_NUMBER');
                t.push({ k: 'n', v: Number(num) });
                i = j;
                continue;
            }
            if (/[a-zA-Z]/.test(c)) {
                let j = i;
                while (j < s.length && /[a-zA-Z0-9]/.test(s[j]))
                    j++;
                t.push({ k: 'id', v: s.slice(i, j).toLowerCase() });
                i = j;
                continue;
            }
            if ('+-*/^()%;'.includes(c)) {
                t.push({ k: c });
                i++;
                continue;
            }
            throw new Error('CALC_CHAR');
        }
        return t;
    }
    /* recursive descent: expr = term (('+'|'-') term)*; „x + y%“ → x·(1 ± y/100); term = power (('*'|'/') power)*; power = unary ('^' power)?; unary = '-' unary | postfix; postfix = primary '%'? */
    function evaluate(src, ans = 0) {
        const t = tokenize(src);
        let p = 0;
        const peek = () => t[p];
        const eat = (k) => { if (t[p]?.k === k) {
            p++;
            return true;
        } return false; };
        const primary = () => {
            const x = t[p++];
            if (!x)
                throw new Error('CALC_END');
            if (x.k === 'n')
                return x.v;
            if (x.k === '(') {
                const v = expr();
                if (!eat(')'))
                    throw new Error('CALC_BRACKET');
                return v;
            }
            if (x.k === 'id') {
                if (x.v === 'pi')
                    return Math.PI;
                if (x.v === 'e')
                    return Math.E;
                if (x.v === 'ans')
                    return ans;
                const f = FN[x.v];
                if (!f)
                    throw new Error('CALC_UNKNOWN:' + x.v);
                if (!eat('('))
                    throw new Error('CALC_BRACKET');
                const args = [];
                if (!eat(')')) {
                    do {
                        args.push(expr());
                    } while (eat(';'));
                    if (!eat(')'))
                        throw new Error('CALC_BRACKET');
                }
                return f(...args);
            }
            throw new Error('CALC_SYNTAX');
        };
        const postfix = () => { const v = primary(); if (eat('%'))
            return { v, pct: true }; return { v, pct: false }; };
        const unary = () => { if (eat('-')) {
            const u = unary();
            return { v: -u.v, pct: u.pct };
        } if (eat('+'))
            return unary(); return postfix(); };
        const power = () => { const b = unary(); if (eat('^')) {
            const e = power();
            return { v: Math.pow(b.pct ? b.v / 100 : b.v, e.pct ? e.v / 100 : e.v), pct: false };
        } return b; };
        const term = () => { let a = power(); while (peek() && (peek().k === '*' || peek().k === '/')) {
            const op = t[p++].k;
            const b = power();
            const av = a.pct ? a.v / 100 : a.v, bv = b.pct ? b.v / 100 : b.v;
            a = { v: op === '*' ? av * bv : av / bv, pct: false };
        } return a; };
        function expr() { let a = term(); let v = a.pct ? a.v / 100 : a.v; while (peek() && (peek().k === '+' || peek().k === '-')) {
            const op = t[p++].k;
            const b = term();
            if (b.pct)
                v = op === '+' ? v * (1 + b.v / 100) : v * (1 - b.v / 100);
            else
                v = op === '+' ? v + b.v : v - b.v;
        } return v; }
        const r = expr();
        if (p < t.length)
            throw new Error('CALC_SYNTAX');
        if (typeof r !== 'number' || !Number.isFinite(r))
            throw new Error('CALC_RESULT'); /* 12 significant digits like a desk calculator (0,1 + 0,2 = 0,3) */
        return Number(r.toPrecision(12));
    }
    const UNITS = { MASS: [['g', 0.001], ['kg', 1], ['t', 1000], ['100 g', 0.1]], VOLUME: [['ml', 0.001], ['l', 1], ['100 ml', 0.1], ['m³', 1000]], COUNT: [['ks', 1]], LENGTH: [['mm', 0.001], ['cm', 0.01], ['m', 1], ['km', 1000]], AREA: [['cm²', 0.0001], ['m²', 1]] };
    /* unit price: price for a pack (count × size unit) → price per base unit (kg / l / ks / m / m²) and per 100 g / 100 ml */
    function unitPrice(p) {
        const price = Number(p?.price), size = Number(p?.size), count = Math.max(1, Number(p?.count) || 1);
        const kind = Object.keys(UNITS).find(k => UNITS[k].some(u => u[0] === p?.unit));
        if (!kind || !(price > 0) || !(size > 0))
            throw new Error('CALC_UNIT_PRICE_INPUT');
        const f = UNITS[kind].find(u => u[0] === p.unit)[1];
        const base = size * f * count;
        const per = price / base;
        const r = (n) => Math.round(n * 100) / 100;
        return { kind, base: r(base), perBase: r(per), baseUnit: kind === 'MASS' ? 'kg' : kind === 'VOLUME' ? 'l' : kind === 'COUNT' ? 'ks' : kind === 'LENGTH' ? 'm' : 'm²', per100: kind === 'MASS' || kind === 'VOLUME' ? r(per * 0.1) : null, perPiece: r(price / count) };
    }
    /* N2.5r: LASER formulas (the laser hub had none) – DPI ↔ line interval, engraving time, kerf offset, cutting time */
    const r3 = (n) => Math.round(n * 1000) / 1000;
    function laserDpi(p) { const dpi = Number(p?.dpi), mm = Number(p?.interval); if (dpi > 0)
        return { dpi, interval: r3(25.4 / dpi) }; if (mm > 0)
        return { dpi: Math.round(25.4 / mm), interval: mm }; throw new Error('CALC_LASER_INPUT'); }
    function laserTime(p) {
        const w = Number(p?.width), h = Number(p?.height), iv = Number(p?.interval), v = Number(p?.speed), n = Math.max(1, Number(p?.passes) || 1), ov = Math.max(0, Number(p?.overscan) || 0);
        if (!(w > 0 && h > 0 && iv > 0 && v > 0))
            throw new Error('CALC_LASER_INPUT');
        const lines = Math.ceil(h / iv);
        const sec = lines * (w * (1 + ov / 100)) / v * n;
        return { lines, seconds: Math.round(sec), minutes: Math.round(sec / 6) / 10 };
    }
    function laserKerf(p) { const k = Number(p?.kerf), sz = Number(p?.size); if (!(k >= 0 && sz > 0))
        throw new Error('CALC_LASER_INPUT'); return { offset: r3(k / 2), outsideCut: r3(sz + k), insideCut: r3(Math.max(0, sz - k)), note: 'outside: part keeps the size when the path goes kerf/2 outside; inside (hole): kerf/2 inside' }; }
    function laserCutTime(p) { const len = Number(p?.length), v = Number(p?.speed), n = Math.max(1, Number(p?.passes) || 1); if (!(len > 0 && v > 0))
        throw new Error('CALC_LASER_INPUT'); const sec = len / v * n; return { seconds: Math.round(sec), minutes: Math.round(sec / 6) / 10 }; }
    function install(core, opts = {}) {
        if (core.calculator)
            return core.calculator;
        const OWNER = 'APP.KX.NEXUS', LIST = 'CORE.CALC.LIST', CRYPTO = 'CORE.CRYPTO_PRICES.CURRENT';
        const now = () => opts.now ? opts.now() : Date.now();
        const COINS = ['bitcoin', 'ethereum', 'solana', 'tether', 'usd-coin', 'binancecoin', 'ripple', 'cardano', 'dogecoin', 'slothana'];
        const svc = { evaluate, unitPrice, UNITS, COINS,
            async convertCurrency(p) { const a = Number(p?.amount); if (!Number.isFinite(a))
                throw new Error('CALC_AMOUNT'); const r = core.currency ? await core.currency.rates() : null; const v = core.currency ? await core.currency.convert(a, String(p.from), String(p.to)) : null; return { value: v == null ? null : Math.round(v * 1e6) / 1e6, date: r?.date || null, source: r?.source || null }; },
            /* crypto prices – cache with time; refresh only when online (fetch injectable for tests); never guessed */
            async cryptoPrices() { try {
                return (await core.entities.get(CRYPTO))?.data || null;
            }
            catch {
                return null;
            } },
            async refreshCrypto(p, ctx) {
                const f = opts.fetch || globalThis.fetch;
                if (typeof f !== 'function')
                    throw new Error('CALC_OFFLINE');
                const ids = (Array.isArray(p?.ids) && p.ids.length ? p.ids : COINS).map(String).filter((x) => /^[a-z0-9-]{2,40}$/.test(x));
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=czk,usd,eur`;
                let j;
                try {
                    const res = await f(url);
                    if (!res.ok)
                        throw new Error('HTTP_' + res.status);
                    j = await res.json();
                }
                catch (e) {
                    throw new Error('CALC_CRYPTO_UNAVAILABLE');
                }
                const prices = {};
                for (const id of ids)
                    if (j?.[id])
                        prices[id] = { czk: Number(j[id].czk) || null, usd: Number(j[id].usd) || null, eur: Number(j[id].eur) || null };
                const data = { at: new Date(now()).toISOString(), source: 'CoinGecko', prices };
                const cur = await core.entities.get(CRYPTO).catch(() => null);
                await core.entities.save(cur ? { ...cur, expectedRevision: cur.revision, data } : { id: CRYPTO, type: 'CORE.CRYPTO_PRICES', ownerApp: OWNER, schema: 'KX.CRYPTO_PRICES/1', spaceIds: [], data }, { ...ctx, appCode: OWNER });
                return data;
            },
            async convertCrypto(p) {
                const a = Number(p?.amount);
                if (!Number.isFinite(a))
                    throw new Error('CALC_AMOUNT');
                const d = await svc.cryptoPrices();
                const coin = String(p?.coin || '');
                const fiat = String(p?.fiat || 'CZK').toLowerCase();
                const px = d?.prices?.[coin]?.[fiat];
                if (!px)
                    return { value: null, at: d?.at || null, source: d?.source || null };
                return { value: p?.direction === 'FROM_FIAT' ? Math.round(a / px * 1e8) / 1e8 : Math.round(a * px * 100) / 100, price: px, at: d.at, source: d.source };
            },
            /* lists and notes (personal): items with check box, quantity, price, note; totals */
            async lists(p, ctx) { const u = ctx.actorId; const out = []; for (const r of await core.entities.list()) {
                if (r.type !== LIST || r.archivedAt || r.data?.owner !== u)
                    continue;
                out.push(svc.listView(r));
            } return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated))); },
            listView(r) { const items = r.data.items || []; const sum = (f) => Math.round(items.filter(f).reduce((a, x) => a + (Number(x.qty) || 1) * (Number(x.price) || 0), 0) * 100) / 100; return { id: r.id, name: r.data.name, items, updated: r.updatedAt || r.data.updated, total: sum(() => true), done: sum((x) => x.done), left: sum((x) => !x.done), count: items.length, checked: items.filter((x) => x.done).length }; },
            async saveList(p, ctx) {
                const u = ctx.actorId;
                const d = p?.data || {};
                const name = String(d.name || '').trim().slice(0, 120);
                if (!name)
                    throw new Error('CALC_LIST_NAME');
                const items = (Array.isArray(d.items) ? d.items : []).slice(0, 500).map((x) => ({ text: String(x?.text || '').slice(0, 200), qty: Number.isFinite(Number(x?.qty)) ? Number(x.qty) : null, price: Number.isFinite(Number(x?.price)) ? Number(x.price) : null, done: x?.done === true, note: String(x?.note || '').slice(0, 300), expr: String(x?.expr || '').slice(0, 200) })).filter((x) => x.text || x.price != null);
                const sp = ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
                const cur = p?.id ? await core.entities.get(String(p.id)) : null;
                if (cur && cur.data?.owner !== u)
                    throw new Error('CALC_LIST_FORBIDDEN');
                const data = { name, items, owner: u, updated: new Date(now()).toISOString() };
                const r = await core.entities.save(cur ? { ...cur, expectedRevision: cur.revision, data } : { type: LIST, ownerApp: OWNER, schema: 'KX.CALC_LIST/1', spaceIds: [sp], data }, { ...ctx, appCode: OWNER });
                return svc.listView(r);
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.CALC.EVAL', 'READ', (p) => ({ value: evaluate(String(p?.expr || ''), Number(p?.ans) || 0) }));
        reg('ACTION.CORE.CALC.UNIT_PRICE', 'READ', (p) => unitPrice(p));
        reg('ACTION.CORE.CALC.CURRENCY', 'READ', (p) => svc.convertCurrency(p));
        reg('ACTION.CORE.CALC.CRYPTO', 'READ', (p) => svc.convertCrypto(p));
        reg('ACTION.CORE.CALC.CRYPTO.REFRESH', 'SAFE_WRITE', (p, c) => svc.refreshCrypto(p, c));
        reg('ACTION.CORE.CALC.LISTS', 'READ', (p, c) => svc.lists(p, c));
        reg('ACTION.CORE.CALC.LIST.SAVE', 'SAFE_WRITE', (p, c) => svc.saveList(p, c));
        core.calculator = svc;
        return svc;
    }
    KXCalcEngine = { evaluate, unitPrice, install, UNITS, laserDpi, laserTime, laserKerf, laserCutTime };
    globalThis.KXCalcEngine = KXCalcEngine;
})();
