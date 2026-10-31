// N2.4n: ADS hub workspace – occasions calendar (table in the one table engine, market / kind filter, plan a campaign → calendar event + reminders)
var KXAdsHub;
(function () {
    const OWNER = 'APP.KX.ADS';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const TABS = [['OCCASIONS', TL('ads.tab.OCCASIONS', 'Occasions')]];
    const SCOPE = 'ADS.OCCASIONS';
    const st = { markets: [], kind: 'ALL', sel: new Set() };
    const name = (o) => TL('ads.occ.' + o.key, o.key);
    function rows(fromIso) { const A = globalThis.KXAdsOccasions; return A.OCCASIONS.map((o) => ({ id: o.key, o, ...A.next(o, fromIso) })).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')); }
    function registerTable(core) {
        if (core.__adsTable)
            return;
        core.__adsTable = true;
        try {
            core.fields?.registerDefaults(SCOPE, [
                { key: 'name', type: 'TEXT', label: TL('ads.col.name', 'Occasion'), width: 200 }, { key: 'date', type: 'DATE', label: TL('ads.col.date', 'Next date'), width: 110, info: TL('ads.help.date', 'Computed by rule; lunar / other calendars need a verified source.') },
                { key: 'start', type: 'DATE', label: TL('ads.col.start', 'Campaign start'), width: 120, info: TL('ads.help.start', 'Next date minus the recommended lead time.') }, { key: 'lead', type: 'NUMBER', label: TL('ads.col.lead', 'Lead'), unit: TL('ads.weeks', 'wk'), width: 70 },
                { key: 'kind', type: 'TEXT', label: TL('ads.col.kind', 'Kind'), width: 110 }, { key: 'markets', type: 'TEXT', label: TL('ads.col.markets', 'Markets'), width: 150 }, { key: 'traditions', type: 'TEXT', label: TL('ads.col.traditions', 'Traditions and symbols'), width: 320 }, { key: 'idea', type: 'TEXT', label: TL('ads.col.idea', 'Ad idea'), width: 260 }
            ]);
        }
        catch (e) {
            globalThis.KXBugs?.pushErr?.(e);
        }
    }
    async function plan(core, opts, r) {
        if (!r.campaignStart)
            throw new Error('ADS_NO_DATE');
        const C = { actorId: opts.actorId, appCode: 'APP.NEXUS', deviceId: opts.deviceId, permissions: ['CORE.CALENDAR.EDIT'], confirmed: true };
        const sp = (await core.propagate.spaces(opts.actorId)).find((x) => x.kind === 'PERSONAL');
        const today = new Date().toISOString().slice(0, 10);
        const at = r.campaignStart >= today ? r.campaignStart : today;
        const ev = await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: `${TL('ads.campaignPrefix', 'Campaign')}: ${name(r.o)}`, ownerApp: 'APP.NEXUS', spaceIds: [sp.id], startsAt: `${at}T08:00:00.000Z`, allDay: true, attendeeIds: [], status: 'CONFIRMED', sourceEntityType: 'DATE_RULE', sourceEntityId: `ADS:${r.o.key}`, description: `${TL('ads.col.idea', 'Ad idea')}: ${TL('ads.idea.' + r.o.key, r.o.idea)}` }, C);
        const R = globalThis.KXReminders;
        let rem = null;
        if (R && core.reminders) {
            try {
                rem = await core.actions.invoke('ACTION.CORE.REMINDERS.SET', { target: { kind: 'EVENT', id: ev.id }, leads: ['1W', '1D'], template: 'CAMPAIGN' }, C);
            }
            catch { }
        }
        return { event: ev, reminders: rem, startedLate: at !== r.campaignStart };
    }
    async function mountHub(root, core, opts) {
        registerTable(core);
        const all = rows(new Date().toISOString().slice(0, 10));
        const countries = [...new Set(all.flatMap((r) => r.o.markets.map((m) => m.country)))].sort();
        const shown = all.filter((r) => (st.kind === 'ALL' || r.o.kind === st.kind) && (!st.markets.length || r.o.markets.some((m) => st.markets.includes(m.country))));
        root.innerHTML = `<div class="kx-ads" data-ads-hub><div class="kx-tw-safety">⚠ ${esc(TL('ads.banner', 'Traditions, symbols, ideas and lead times are written in NEXUS – to verify. Dates are computed by rule; occasions on lunar / other calendars have no date until taken from a verified source.'))}</div>
      <div class="kx-print3d-tabs" data-ads-kinds>${['ALL', 'OCCASION', 'NATIONAL'].map(k => `<button class="chip ${st.kind === k ? 'active' : ''}" data-ads-kind="${k}">${esc(TL('ads.kind.' + k, k))}</button>`).join('')}</div>
      <div class="kx-olasers-inc" data-ads-markets>${countries.map((c) => `<label class="kx-chk" data-kx-country="${esc(c)}"><input type="checkbox" data-ads-market="${esc(c)}" data-kx-country="${esc(c)}" ${st.markets.includes(c) ? 'checked' : ''}> ${globalThis.KXCountries?.flag(c) || ''} ${esc(c)}</label><button type="button" class="kx-info-i" data-kx-country-info="${esc(c)}" aria-label="${esc(globalThis.KXCountries?.label(c) || c)}">ⓘ</button>`).join('')}</div>
      <div data-ads-table></div></div>`;
        root.querySelectorAll('[data-ads-kind]').forEach(b => b.onclick = () => { st.kind = String(b.dataset.adsKind); void mountHub(root, core, opts); });
        root.querySelectorAll('[data-ads-market]').forEach(x => x.onchange = () => { const c = String(x.dataset.adsMarket); st.markets = x.checked ? [...st.markets, c] : st.markets.filter((m) => m !== c); void mountHub(root, core, opts); });
        const val = (r, f) => {
            switch (f.key) {
                case 'name': return name(r.o);
                case 'date': return r.date || TL('ads.noDate', 'date – from a source');
                case 'start': return r.campaignStart || '';
                case 'lead': return r.o.leadWeeks;
                case 'kind': return TL('ads.kind.' + r.o.kind, r.o.kind);
                case 'markets': return r.o.markets.map((m) => m.country).join(', ');
                case 'traditions': return r.o.markets.map((m) => `${m.country}: ${TL('ads.tr.' + r.o.key + '.' + m.country, m.note)}`).join(' · ') + (r.o.note ? ` · ${r.o.note}` : '');
                case 'idea': return TL('ads.idea.' + r.o.key, r.o.idea);
                default: return '';
            }
        };
        const host = root.querySelector('[data-ads-table]');
        if (globalThis.KXTable)
            await globalThis.KXTable(host, { scope: SCOPE, rows: shown, rowId: (r) => r.id, value: val, exportValue: val, filterState: () => st.filter || {}, onFilter: (x) => { st.filter = x; }, density: st.density || 'COMPACT', onDensity: (d) => { st.density = d; }, selection: st.sel, sortState: () => st.sort, onSort: (x) => { st.sort = x; },
                onOpen: () => { }, onChange: () => void mountHub(root, core, opts), isStale: () => false, rowMenu: (r) => r.campaignStart ? [{ label: `📅 ${TL('ads.plan', 'Plan the campaign')}`, run: async () => { try {
                            const x = await plan(core, opts, r);
                            opts.onToast?.(`${TL('ads.planned', 'Campaign added to the calendar')}${x.reminders ? ` · ${x.reminders.summary}` : ''}${x.startedLate ? ` · ${TL('ads.late', 'the recommended start is already past – starts today')}` : ''}`);
                        }
                        catch (e) {
                            opts.onToast?.(String(e?.message || e));
                        } } }] : [] });
    }
    KXAdsHub = { OWNER, TABS, SCOPE, rows, plan, mountHub, registerTable };
    globalThis.KXAdsHub = KXAdsHub;
})();
