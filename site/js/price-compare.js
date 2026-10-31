// N2.4u: price comparator (hub Nákup a dodavatelé) – several offers (pages / products): price, quantity in the offer, shipping,
// each in its own currency (CZK, EUR, USD …) → total and price per piece in the chosen output currency by the daily rate (ČNB),
// saved by product / category / collection with names and web addresses. Rates: ČNB daily text (public data) or entered by hand;
// a rate is never invented – without it the offer is reported as „rate missing“.
var KXPriceCompare;
(function () {
    const T = 'APP.PURCHASE.COMPARISON', OWNER = 'APP.KX.PURCHASE';
    const CUR = ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'CHF', 'HUF', 'JPY', 'CNY', 'SEK', 'DKK', 'NOK', 'CAD', 'AUD'];
    const CNB_URL = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
    /* ČNB daily text: line 1 „22.10.2026 #205“, line 2 header, then „země|měna|množství|kód|kurz“ (comma decimals) → CZK per 1 unit */
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
    /* convert between currencies via CZK; null when a rate is missing (never guessed) */
    function convert(amount, from, to, rates) { if (from === to)
        return amount; const a = rates[from], b = rates[to]; if (!(a > 0) || !(b > 0))
        return null; return amount * a / b; }
    const r2 = (n) => Math.round(n * 100) / 100;
    function validateOffer(o) {
        const price = Number(o?.price), qty = Number(o?.qty ?? 1), ship = Number(o?.shipping ?? 0);
        if (!String(o?.name || '').trim())
            throw new Error('CMP_OFFER_NAME');
        if (!(Number.isFinite(price) && price >= 0 && price <= 1e9))
            throw new Error('CMP_PRICE');
        if (!(Number.isFinite(qty) && qty > 0 && qty <= 1e7))
            throw new Error('CMP_QTY');
        if (!(Number.isFinite(ship) && ship >= 0 && ship <= 1e9))
            throw new Error('CMP_SHIPPING');
        for (const k of ['currency', 'shippingCurrency'])
            if (o?.[k] && !/^[A-Z]{3}$/.test(o[k]))
                throw new Error('CMP_CURRENCY');
        if (o?.url && !/^https?:\/\/[^\s]{3,2000}$/.test(String(o.url)))
            throw new Error('CMP_URL');
        return { name: String(o.name).trim().slice(0, 160), shop: String(o.shop || '').slice(0, 160), url: String(o.url || ''), price, currency: o.currency || 'CZK', qty, shipping: ship, shippingCurrency: o.shippingCurrency || o.currency || 'CZK', note: String(o.note || '').slice(0, 1000) };
    }
    /* evaluate: total = price + shipping, per piece = total / qty, all in the output currency; best = lowest per piece */
    function evaluate(offers, out, rates) {
        const rows = offers.map((o, i) => {
            const p = convert(o.price, o.currency, out, rates), s = convert(o.shipping, o.shippingCurrency, out, rates);
            if (p == null || s == null)
                return { ...o, index: i, missingRate: [...new Set([p == null ? o.currency : null, s == null ? o.shippingCurrency : null].filter(Boolean))], total: null, perPiece: null };
            const total = p + s;
            return { ...o, index: i, priceOut: r2(p), shippingOut: r2(s), total: r2(total), perPiece: Math.round(total / o.qty * 10000) / 10000 };
        });
        const ok = rows.filter((r) => r.perPiece != null).sort((a, b) => a.perPiece - b.perPiece);
        const best = ok[0] || null;
        for (const r of rows)
            r.diffPct = best && r.perPiece != null && best.perPiece > 0 ? Math.round((r.perPiece / best.perPiece - 1) * 1000) / 10 : null;
        return { currency: out, rows, best: best ? best.index : null, ranking: ok.map((r) => r.index) };
    }
    /* N2.4w: offers from CSV (same CSV reading as Finance): name / shop / url / price / currency / qty / shipping / shipping currency / note,
       Czech or English headers; the file currency is used when a row has none; rows with errors are reported, not added */
    function parseOffersCsv(text, fileCurrency = 'CZK') {
        const lines = String(text || '').replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2)
            throw new Error('CMP_IMPORT_EMPTY');
        const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
        const split = (l) => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (q) {
                if (ch === '"' && l[i + 1] === '"') {
                    c += '"';
                    i++;
                }
                else if (ch === '"')
                    q = false;
                else
                    c += ch;
            }
            else if (ch === '"')
                q = true;
            else if (ch === sep) {
                o.push(c);
                c = '';
            }
            else
                c += ch;
        } o.push(c); return o.map(x => x.trim()); };
        const head = split(lines[0]).map(h => h.toLowerCase());
        const col = (n) => head.findIndex(h => n.some(x => h === x || h.startsWith(x)));
        const ci = { name: col(['name', 'název', 'nazev', 'nabídka', 'nabidka']), shop: col(['shop', 'obchod', 'prodejce']), url: col(['url', 'adresa', 'odkaz']), price: col(['price', 'cena']), currency: col(['currency', 'měna', 'mena']), qty: col(['qty', 'ks', 'kusů', 'kusu', 'množství', 'mnozstvi']), shipping: col(['shipping', 'poštovné', 'postovne', 'doprava']), shippingCurrency: col(['shippingcurrency', 'měna poštovného', 'mena postovneho']), note: col(['note', 'poznámka', 'poznamka']) };
        if (ci.name < 0 || ci.price < 0)
            throw new Error('CMP_IMPORT_COLUMNS');
        const num = (v) => Number(String(v || '').replace(/\s/g, '').replace(',', '.'));
        const offers = [], errors = [];
        lines.slice(1).forEach((l, i) => { const c = split(l); const g = (k) => ci[k] >= 0 ? c[ci[k]] || '' : ''; try {
            const cur = (g('currency') || fileCurrency).toUpperCase();
            offers.push(validateOffer({ name: g('name'), shop: g('shop'), url: g('url'), price: num(g('price')), currency: cur, qty: g('qty') ? num(g('qty')) : 1, shipping: g('shipping') ? num(g('shipping')) : 0, shippingCurrency: (g('shippingCurrency') || cur).toUpperCase(), note: g('note') }));
        }
        catch (e) {
            errors.push({ line: i + 2, error: String(e?.message || e) });
        } });
        return { offers, errors, separator: sep };
    }
    function install(core) {
        if (core.priceCompare)
            return core.priceCompare; /* N2.4v: rates are the ONE shared set of the core currency service */
        const FX = globalThis.KXCurrency?.install(core);
        let rates = null;
        const sync = async () => { if (FX) {
            const r = await FX.rates();
            if (r)
                rates = r;
        } return rates; };
        const svc = {
            async save(p, ctx) {
                const name = String(p?.name || '').trim();
                if (!name)
                    throw new Error('CMP_NAME');
                const out = p?.outputCurrency || 'CZK';
                if (!/^[A-Z]{3}$/.test(out))
                    throw new Error('CMP_CURRENCY');
                const offers = (p?.offers || []).map(validateOffer);
                if (offers.length > 50)
                    throw new Error('CMP_TOO_MANY');
                const old = p.id ? await core.entities.get(p.id) : null;
                const data = { name: name.slice(0, 160), product: String(p?.product || '').slice(0, 160), category: String(p?.category || '').slice(0, 160), collection: String(p?.collection || '').slice(0, 160), outputCurrency: out, offers, note: String(p?.note || '').slice(0, 2000) };
                return core.entities.save({ id: p.id, type: T, ownerApp: OWNER, schema: 'KX.PURCHASE.COMPARISON/1', spaceIds: p.spaceIds || old?.spaceIds || [], expectedRevision: old?.revision, data }, ctx);
            },
            async list() { return (await core.entities.list()).filter((r) => r.type === T && !r.archivedAt); },
            async archive(p, ctx) { const r = await core.entities.get(p.id); if (!r || r.type !== T)
                throw new Error('CMP_NOT_FOUND'); return core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, ctx); },
            /* rates: ČNB (network allowlist) or by hand; the last rates are kept with their date */
            async loadCnb(fetcher = globalThis.fetch?.bind(globalThis)) { if (FX) {
                rates = await FX.loadCnb(fetcher);
                return rates;
            } const r = await fetcher(CNB_URL); if (!r.ok)
                throw new Error(`RATES_HTTP_${r.status}`); rates = parseCnb(await r.text()); return rates; },
            sync,
            setRates(x) { if (!x || typeof x.rates !== 'object')
                throw new Error('RATES_FORMAT'); const rr = { CZK: 1 }; for (const [k, v] of Object.entries(x.rates)) {
                if (/^[A-Z]{3}$/.test(k) && Number(v) > 0)
                    rr[k] = Number(v);
            } rates = { date: String(x.date || new Date().toISOString().slice(0, 10)), source: String(x.source || 'MANUAL'), rates: rr }; if (FX)
                void FX.setManual({ date: rates.date, rates: rr }); return rates; },
            rates: () => rates,
            evaluate(row, outputCurrency) { const d = row.data || row; return evaluate(d.offers || [], outputCurrency || d.outputCurrency || 'CZK', rates?.rates || { CZK: 1 }); }
        };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.PURCHASE.COMPARISON.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c));
        reg('ACTION.PURCHASE.COMPARISON.LIST', 'READ', () => svc.list());
        reg('ACTION.PURCHASE.COMPARISON.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c));
        core.priceCompare = svc;
        return svc;
    }
    KXPriceCompare = { T, OWNER, CUR, CNB_URL, parseCnb, convert, validateOffer, evaluate, parseOffersCsv, install };
    globalThis.KXPriceCompare = KXPriceCompare;
})();
// N2.4u: comparator workspace (hub Nákup a dodavatelé)
var KXPurchaseHub;
(function () {
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const PC = () => globalThis.KXPriceCompare;
    const TABS = [['COMPARE', TL('cmp.tab.COMPARE', 'Price comparator')]];
    const st = { open: '', filter: '', draft: null };
    const money = (n, c, d = 2) => n == null ? '—' : `${Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d })} ${c}`;
    const curSel = (name, val) => `<select data-co="${name}">${PC().CUR.map((c) => `<option value="${c}" ${c === val ? 'selected' : ''} title="${esc(globalThis.KXCurrency?.label(c) || c)}">${c}</option>`).join('')}</select>`;
    async function mountHub(root, core, opts) {
        const K = PC();
        if (!K)
            return;
        const svc = K.install(core);
        await svc.sync();
        const C = { actorId: opts.actorId, appCode: K.OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true };
        const all = await svc.list();
        const f = st.filter.toLowerCase();
        const shown = all.filter((r) => !f || [r.data.name, r.data.product, r.data.category, r.data.collection].join(' ').toLowerCase().includes(f));
        const groups = {};
        for (const r of shown) {
            const g = r.data.collection || r.data.category || TL('cmp.noGroup', '(without collection)');
            (groups[g] = groups[g] || []).push(r);
        }
        const cur = st.draft || (st.open ? all.find((r) => r.id === st.open)?.data : null);
        const rates = svc.rates();
        root.innerHTML = `<div class="kx-cmp" data-cmp-hub>
      <div class="kx-fin-head"><input data-cmp-filter placeholder="${esc(TL('cmp.filterPh', 'collection / category / product'))}" value="${esc(st.filter)}"><button class="btn" data-cmp-new>＋ ${esc(TL('cmp.new', 'New comparison'))}</button>
        <span class="muted" data-cmp-rates>${esc(TL('cmp.rates', 'Rates'))}: ${rates ? `${esc(rates.source)} · ${esc(rates.date)}` : esc(TL('cmp.noRates', 'not loaded'))}</span><button class="btn ghost compact" data-cmp-cnb>${esc(TL('cmp.loadCnb', 'Load CNB rates'))}</button></div>
      <div data-cmp-list>${Object.entries(groups).map(([g, rows]) => `<details open><summary>${esc(g)} (${rows.length})</summary>${rows.map((r) => { const e = svc.evaluate(r); const b = e.best != null ? e.rows.find((x) => x.index === e.best) : null; return `<div class="kx-ai-conn" data-cmp-row="${esc(r.id)}"><b>${esc(r.data.name)}</b> <small class="muted">${esc([r.data.product, r.data.category].filter(Boolean).join(' · '))} · ${esc(TL('cmp.offers', 'offers'))}: ${r.data.offers.length}${b ? ` · ${esc(TL('cmp.best', 'best'))}: ${esc(b.name)} ${money(b.perPiece, e.currency, 4)}/${esc(TL('cmp.pc', 'pc'))}` : ''}</small> <button class="btn ghost compact" data-cmp-open="${esc(r.id)}">${esc(TL('cmp.open', 'Open'))}</button></div>`; }).join('')}</details>`).join('') || `<p class="muted">${esc(TL('cmp.empty', 'No comparison yet.'))}</p>`}</div>
      <div data-cmp-detail></div></div>`;
        root.querySelector('[data-cmp-filter]').onchange = (e) => { st.filter = e.target.value; void mountHub(root, core, opts); };
        root.querySelector('[data-cmp-new]').onclick = () => { st.open = ''; st.draft = { name: '', product: '', category: '', collection: '', outputCurrency: 'CZK', offers: [{ name: '', shop: '', url: '', price: 0, currency: 'CZK', qty: 1, shipping: 0, shippingCurrency: 'CZK', note: '' }] }; void mountHub(root, core, opts); };
        root.querySelector('[data-cmp-cnb]').onclick = async () => { try {
            await svc.loadCnb();
        }
        catch (e) {
            opts.onToast?.(TL('cmp.cnbFail', 'Rates could not be loaded – enter them by hand.') + ' (' + String(e?.message || e) + ')');
        } void mountHub(root, core, opts); };
        root.querySelectorAll('[data-cmp-open]').forEach(b => b.onclick = () => { st.open = String(b.dataset.cmpOpen); st.draft = null; void mountHub(root, core, opts); });
        if (!cur)
            return;
        const det = root.querySelector('[data-cmp-detail]');
        const ev = K.evaluate((cur.offers || []).map((o) => { try {
            return K.validateOffer(o);
        }
        catch {
            return { ...o, price: Number(o.price) || 0, qty: Number(o.qty) || 1, shipping: Number(o.shipping) || 0, currency: o.currency || 'CZK', shippingCurrency: o.shippingCurrency || o.currency || 'CZK' };
        } }), cur.outputCurrency || 'CZK', rates?.rates || { CZK: 1 });
        const missing = [...new Set(ev.rows.flatMap((r) => r.missingRate || []))];
        det.innerHTML = `<section class="kx-lcard open" data-cmp-detail-open><div class="kx-calc-grid">
        <label class="kx-lf"><span>${esc(TL('cmp.name', 'Name'))}*</span><input data-cf="name" value="${esc(cur.name)}"></label><label class="kx-lf"><span>${esc(TL('cmp.product', 'Product'))}</span><input data-cf="product" value="${esc(cur.product)}"></label>
        <label class="kx-lf"><span>${esc(TL('cmp.category', 'Category'))}</span><input data-cf="category" value="${esc(cur.category)}"></label><label class="kx-lf"><span>${esc(TL('cmp.collection', 'Collection'))}</span><input data-cf="collection" value="${esc(cur.collection)}"></label>
        <label class="kx-lf"><span>${esc(TL('cmp.outCur', 'Result currency'))}</span>${curSel('out', cur.outputCurrency || 'CZK')}</label></div>
      <table class="kx-calc-table" data-cmp-offers><tr><th>${esc(TL('cmp.offer', 'Offer'))}</th><th>${esc(TL('cmp.shop', 'Shop'))}</th><th>URL</th><th>${esc(TL('cmp.price', 'Price'))}</th><th></th><th>${esc(TL('cmp.qty', 'Pcs in offer'))}</th><th>${esc(TL('cmp.shipping', 'Shipping'))}</th><th></th><th>${esc(TL('cmp.total', 'Total'))}</th><th>${esc(TL('cmp.perPiece', 'Per piece'))}</th><th>Δ</th><th></th></tr>
      ${(cur.offers || []).map((o, i) => {
            const r = ev.rows[i];
            const best = ev.best === i;
            return `<tr data-cmp-offer="${i}" class="${best ? 'kx-cell-best' : ''}"><td><input data-o="name" value="${esc(o.name)}" style="width:130px"></td><td><input data-o="shop" value="${esc(o.shop)}" style="width:90px"></td><td><input data-o="url" value="${esc(o.url)}" style="width:150px">${/^https?:\/\//.test(o.url || '') ? ` <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</td>
        <td><input data-o="price" value="${esc(o.price)}" inputmode="decimal" style="width:70px"></td><td>${curSel('o-currency', o.currency || 'CZK').replace('data-co="o-currency"', 'data-o="currency"')}</td><td><input data-o="qty" value="${esc(o.qty)}" inputmode="decimal" style="width:60px"></td><td><input data-o="shipping" value="${esc(o.shipping)}" inputmode="decimal" style="width:60px"></td><td>${curSel('o-sc', o.shippingCurrency || o.currency || 'CZK').replace('data-co="o-sc"', 'data-o="shippingCurrency"')}</td>
        <td data-cmp-total>${r?.total != null ? money(r.total, ev.currency) : `<span class="kx-off">${esc(TL('cmp.rateMissing', 'rate missing'))} ${esc((r?.missingRate || []).join(', '))}</span>`}</td><td data-cmp-pp><b>${money(r?.perPiece ?? null, ev.currency, 4)}</b></td><td>${best ? '★' : r?.diffPct != null ? `+${r.diffPct} %` : ''}</td><td><button class="icon-btn" data-o-del="${i}">🗑</button></td></tr>`;
        }).join('')}</table>
      ${missing.length ? `<div class="kx-tw-safety" data-cmp-missing>${esc(TL('cmp.missingNote', 'Missing rate'))}: ${missing.map(c => `${esc(c)} <input data-rate="${esc(c)}" inputmode="decimal" placeholder="CZK" style="width:70px">`).join(' ')} <button class="btn compact" data-rate-save>✓</button></div>` : ''}
      <button class="btn ghost compact" data-o-add>＋ ${esc(TL('cmp.addOffer', 'Offer'))}</button> <label class="btn ghost compact">⇧ ${esc(TL('cmp.import', 'Offers from CSV'))}<input type="file" accept=".csv,text/csv" data-cmp-import hidden></label> <button class="btn" data-cmp-save>${esc(TL('laser.save', 'Save'))}</button> <span class="kx-lf-help" data-cmp-err></span></section>`;
        /* N2.5b: smart fields – product, category (history), shop (contacts + history incl. offers of every comparison) */ try {
            const SFM = globalThis.KXSmartField;
            if (SFM?.mount && core.smartFields) {
                const m = (sel, field, src, cr) => det.querySelectorAll(sel).forEach(el => SFM.mount(el, core, { field, sources: src, actorId: opts.actorId, create: cr }));
                m('[data-cf="product"]', 'APP.PURCHASE.COMPARISON#product', ['HISTORY']);
                m('[data-cf="category"]', 'APP.PURCHASE.COMPARISON#category', ['HISTORY']);
                m('[data-o="shop"]', 'APP.PURCHASE.COMPARISON#offers[].shop', ['CONTACTS', 'HISTORY'], 'CONTACTS');
            }
        }
        catch { }
        const read = () => {
            const q = (k) => det.querySelector(`[data-cf="${k}"]`).value.trim();
            const offers = Array.from(det.querySelectorAll('[data-cmp-offer]')).map(tr => { const g = (k) => tr.querySelector(`[data-o="${k}"]`).value.trim(); const n = (k) => Number(g(k).replace(/\s/g, '').replace(',', '.')); return { name: g('name'), shop: g('shop'), url: g('url'), price: n('price'), currency: g('currency'), qty: n('qty'), shipping: n('shipping'), shippingCurrency: g('shippingCurrency') }; });
            return { name: q('name'), product: q('product'), category: q('category'), collection: q('collection'), outputCurrency: det.querySelector('[data-co="out"]').value, offers };
        };
        det.querySelectorAll('input,select').forEach(x => x.onchange = () => { st.draft = read(); void mountHub(root, core, opts); });
        det.querySelector('[data-cmp-import]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f)
            return; const d = read(); try {
            const r = K.parseOffersCsv(await f.text(), d.outputCurrency);
            d.offers = [...d.offers.filter((o) => o.name), ...r.offers];
            st.draft = d;
            opts.onToast?.(`${TL('cmp.imported', 'Offers added')}: ${r.offers.length}${r.errors.length ? ` · ${TL('cmp.badLines', 'bad lines')}: ${r.errors.map((x) => x.line).join(', ')}` : ''}`);
        }
        catch (x) {
            opts.onToast?.(TL('cmp.err.' + String(x?.message || ''), String(x?.message || x)));
        } void mountHub(root, core, opts); };
        det.querySelector('[data-o-add]').onclick = () => { const d = read(); d.offers.push({ name: '', shop: '', url: '', price: 0, currency: d.outputCurrency, qty: 1, shipping: 0, shippingCurrency: d.outputCurrency }); st.draft = d; void mountHub(root, core, opts); };
        det.querySelectorAll('[data-o-del]').forEach(b => b.onclick = () => { const d = read(); d.offers.splice(Number(b.dataset.oDel), 1); st.draft = d; void mountHub(root, core, opts); });
        det.querySelector('[data-rate-save]')?.addEventListener('click', () => { const r = { ...(svc.rates()?.rates || { CZK: 1 }) }; det.querySelectorAll('[data-rate]').forEach(x => { const v = Number(x.value.replace(',', '.')); if (v > 0)
            r[String(x.dataset.rate)] = v; }); svc.setRates({ date: new Date().toISOString().slice(0, 10), source: 'MANUAL', rates: r }); st.draft = read(); void mountHub(root, core, opts); });
        det.querySelector('[data-cmp-save]').onclick = async () => { try {
            const sp = (await core.propagate.spaces(opts.actorId)).find((s) => s.kind === 'COMPANY') || (await core.propagate.spaces(opts.actorId))[0];
            const row = await core.actions.invoke('ACTION.PURCHASE.COMPARISON.SAVE', { id: st.open || undefined, ...read(), spaceIds: [sp.id] }, C);
            st.open = row.id;
            st.draft = null;
            opts.onToast?.(TL('cmp.saved', 'Saved'));
            void mountHub(root, core, opts);
        }
        catch (e) {
            det.querySelector('[data-cmp-err]').textContent = TL('cmp.err.' + String(e?.message || ''), String(e?.message || e));
        } };
    }
    KXPurchaseHub = { TABS, mountHub, st };
    globalThis.KXPurchaseHub = KXPurchaseHub;
})();
