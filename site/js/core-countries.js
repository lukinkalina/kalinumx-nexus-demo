// N2.4p: one country catalogue for all hubs – code → name (Czech names in the i18n catalogue „country.XX“, English fallback here), flag.
// Every element with data-kx-country gets the full name on hover; a checked checkbox shows a short popup; on touch devices an ⓘ shows it.
var KXCountries;
(function () {
    const EN = { AE: 'United Arab Emirates', AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CA: 'Canada', CN: 'China', CZ: 'Czechia', DE: 'Germany', ES: 'Spain', EU: 'European Union', FI: 'Finland', FR: 'France', GB: 'United Kingdom', GR: 'Greece', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India', IT: 'Italy', JP: 'Japan', KR: 'South Korea', NL: 'Netherlands', PL: 'Poland', RS: 'Serbia', RU: 'Russia', SE: 'Sweden', SK: 'Slovakia', TR: 'Turkey', UA: 'Ukraine', US: 'United States', VN: 'Vietnam' };
    const tl = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const flag = (c) => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '';
    const known = (c) => Object.prototype.hasOwnProperty.call(EN, String(c || '').toUpperCase());
    const name = (c) => { const k = String(c || '').toUpperCase(); return known(k) ? tl('country.' + k, EN[k]) : k; };
    const label = (c) => known(c) ? `${String(c).toUpperCase()} – ${name(c)}` : String(c);
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    /* a code with its explanation: hover title, ⓘ for touch devices (hidden where a mouse can hover) */
    const tag = (c) => known(c) ? `<span class="kx-country" data-kx-country="${esc(c)}" title="${esc(label(c))}">${esc(c)}</span><button type="button" class="kx-info-i" data-kx-country-info="${esc(c)}" aria-label="${esc(label(c))}">ⓘ</button>` : esc(c);
    function pop(el, text) {
        if (typeof document === 'undefined')
            return;
        document.querySelectorAll('.kx-country-pop').forEach(x => x.remove());
        const r = el.getBoundingClientRect();
        const p = document.createElement('div');
        p.className = 'kx-country-pop';
        p.setAttribute('role', 'status');
        p.textContent = text;
        p.style.left = `${Math.max(4, Math.min(window.innerWidth - 260, r.left))}px`;
        p.style.top = `${r.bottom + 6}px`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 2600);
        return p;
    }
    /* one delegated behaviour for every hub */
    function install(doc) {
        if (doc.__kxCountries)
            return;
        doc.__kxCountries = true;
        doc.addEventListener('mouseover', (e) => { const el = e.target?.closest?.('[data-kx-country]'); if (el && !el.getAttribute('title'))
            el.setAttribute('title', label(el.dataset.kxCountry)); }, true);
        doc.addEventListener('change', (e) => { const el = e.target; if (el?.matches?.('input[type="checkbox"][data-kx-country]') && el.checked)
            pop(el, `✓ ${label(el.dataset.kxCountry)}`); }, true);
        doc.addEventListener('click', (e) => { const b = e.target?.closest?.('[data-kx-country-info]'); if (b) {
            e.preventDefault();
            e.stopPropagation();
            pop(b, label(b.dataset.kxCountryInfo));
        } }, true);
    }
    KXCountries = { EN, known, name, label, flag, tag, pop, install };
    globalThis.KXCountries = KXCountries;
})();
