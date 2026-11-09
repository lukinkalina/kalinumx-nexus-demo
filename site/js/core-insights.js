// N2.1v: Přehledy — data sources, offline SVG/HTML renderers (bar, line, donut, Gantt, month, week, day, agenda),
// comparator and saved widgets (KX.CORE_INSIGHTS/1). One mechanism for the whole NEXUS:
//  - a SOURCE returns data only (series / segments / items), never markup; Core registers built-in sources over the
//    planner agenda (calendar + tasks + alarms of all hubs), timers / time entries, records per hub, prompts per kind;
//    hubs can register their own sources; every source takes the same params (hub filter, range, scope);
//  - RENDERERS are pure functions (string in, string out), escaped, theme-aware via CSS variables, with text
//    alternatives for screen readers; they are used in Můj den, panes (INSIGHT:<id>), the studio and inside hubs;
//  - the SAME calendar / day / agenda / Gantt views work for everything or filtered to one hub (params.hub);
//  - COMPARATOR: 2–4 records side by side, field by field from the field registry (user labels, list labels),
//    differences flagged;
//  - WIDGETS: saved (source + visualisation + params + where pinned) per user; reading a source never writes.
var KXInsights;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_INSIGHTS/1', WTYPE = 'CORE.INSIGHT.WIDGET', VSTYPE = 'CORE.INSIGHT.VIEWSTATE';
    // N2.1w boards: HOME (Můj den) or HUB:<code> (the hub's own overview); a widget can sit on several boards
    const BOARD_RE = /^(HOME|HUB:APP\.[A-Z0-9_.]{2,80})$/;
    const PLACE_RE = /^[A-Za-z0-9_.:@-]{2,160}$/;
    const VIZ = ['BAR', 'LINE', 'DONUT', 'GANTT', 'TABLE', 'MONTH', 'WEEK', 'DAY', 'AGENDA', 'NUMBER'];
    const RANGES = ['TODAY', '7D', '30D', 'THIS_WEEK', 'THIS_MONTH', 'NEXT_7D', 'NEXT_30D', '90D'];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const day = (t) => new Date(t).toISOString().slice(0, 10);
    const DAY = 86400000;
    function range(code, now) {
        const d = new Date(now);
        d.setUTCHours(0, 0, 0, 0);
        const t = d.getTime();
        const dow = (d.getUTCDay() + 6) % 7;
        switch (code) {
            case 'TODAY': return { from: t, to: t + DAY };
            case '7D': return { from: t - 6 * DAY, to: t + DAY };
            case '30D': return { from: t - 29 * DAY, to: t + DAY };
            case '90D': return { from: t - 89 * DAY, to: t + DAY };
            case 'THIS_WEEK': return { from: t - dow * DAY, to: t + (7 - dow) * DAY };
            case 'THIS_MONTH': {
                const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
                return { from: a, to: b };
            }
            case 'NEXT_7D': return { from: t, to: t + 7 * DAY };
            case 'NEXT_30D': return { from: t, to: t + 30 * DAY };
            default: return { from: t - 6 * DAY, to: t + DAY };
        }
    }
    /* N2.4t: chart series follow the user's colour vision mode (CSS variables set by KXA11y) */ const PAL = ['var(--kx-series-1,var(--accent,#c9a227))', 'var(--kx-series-2,#4f7cac)', 'var(--kx-series-3,#6aa84f)', 'var(--kx-series-4,#c0392b)', 'var(--kx-series-5,#8e44ad)', 'var(--kx-series-6,#16a085)', 'var(--kx-series-7,#d35400)', 'var(--kx-series-8,#7f8c8d)'];
    // ---------- renderers (pure) ----------
    function bar(series, o = {}) {
        const W = o.width || 520, H = o.height || 200, pad = 28;
        const max = Math.max(1, ...series.map(s => Number(s.value) || 0));
        const n = Math.max(1, series.length);
        const bw = (W - pad * 2) / n;
        const bars = series.map((s, i) => { const h = (H - pad * 2) * (Number(s.value) || 0) / max; const x = pad + i * bw + bw * 0.12, y = H - pad - h; return `<g data-viz-item="${esc(s.key)}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${PAL[i % PAL.length]}"><title>${esc(s.label)}: ${esc(s.display ?? s.value)}</title></rect>${n <= 16 ? `<text x="${(x + bw * 0.38).toFixed(1)}" y="${H - pad + 12}" font-size="9" text-anchor="middle" fill="currentColor">${esc(String(s.label).slice(0, 10))}</text>` : ''}</g>`; }).join('');
        return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'Sloupcový graf')}" data-viz="BAR" style="width:100%;height:auto"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="currentColor" opacity=".3"/>${bars}<text x="${pad}" y="14" font-size="10" fill="currentColor" opacity=".7">max ${esc(max)}</text></svg>`;
    }
    function line(series, o = {}) {
        const W = o.width || 520, H = o.height || 200, pad = 28;
        const max = Math.max(1, ...series.map(s => Number(s.value) || 0));
        const n = Math.max(2, series.length);
        const pts = series.map((s, i) => [pad + (W - pad * 2) * i / (n - 1), H - pad - (H - pad * 2) * (Number(s.value) || 0) / max]);
        return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'Čárový graf')}" data-viz="LINE" style="width:100%;height:auto"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="currentColor" opacity=".3"/><polyline fill="none" stroke="${PAL[0]}" stroke-width="2" points="${pts.map(p => p.map(x => x.toFixed(1)).join(',')).join(' ')}"/>${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${PAL[0]}" data-viz-item="${esc(series[i].key)}"><title>${esc(series[i].label)}: ${esc(series[i].display ?? series[i].value)}</title></circle>`).join('')}</svg>`;
    }
    function donut(series, o = {}) {
        const S = o.size || 200, r = 70, c = S / 2;
        const tot = series.reduce((a, s) => a + (Number(s.value) || 0), 0);
        if (!tot)
            return `<p class="empty" data-viz="DONUT" data-viz-empty>Žádná data</p>`;
        let a0 = -Math.PI / 2;
        const arcs = series.filter(s => Number(s.value) > 0).map((s, i) => {
            const frac = Number(s.value) / tot, a1 = a0 + frac * Math.PI * 2;
            const big = frac > 0.5 ? 1 : 0;
            const p = (a) => `${(c + r * Math.cos(a)).toFixed(1)} ${(c + r * Math.sin(a)).toFixed(1)}`;
            const d = frac >= 0.9999 ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r}` : `M ${p(a0)} A ${r} ${r} 0 ${big} 1 ${p(a1)}`;
            a0 = a1;
            return `<path d="${d}" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="26" data-viz-item="${esc(s.key)}"><title>${esc(s.label)}: ${esc(s.display ?? s.value)} (${Math.round(frac * 100)} %)</title></path>`;
        }).join('');
        const legend = series.filter(s => Number(s.value) > 0).map((s, i) => `<li><span style="color:${PAL[i % PAL.length]}">●</span> ${esc(s.label)} <b>${esc(s.display ?? s.value)}</b></li>`).join('');
        return `<div data-viz="DONUT" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(o.title || 'Prstencový graf')}" style="width:${S}px;max-width:45%">${arcs}<text x="${c}" y="${c + 5}" text-anchor="middle" font-size="16" fill="currentColor">${esc(tot)}</text></svg><ul style="list-style:none;padding:0;margin:0;font-size:12px">${legend}</ul></div>`;
    }
    function gantt(segs, o = {}) {
        const W = o.width || 640, rowH = 20, pad = 110;
        const rows = [...new Set(segs.map(s => s.row))];
        const H = rows.length * rowH + 30;
        const from = o.from ?? Math.min(...segs.map(s => s.start)), to = o.to ?? Math.max(...segs.map(s => s.end));
        const span = Math.max(1, to - from);
        const X = (t) => pad + (W - pad - 10) * (t - from) / span;
        if (!segs.length)
            return `<p class="empty" data-viz="GANTT" data-viz-empty>Žádné úseky v tomto období</p>`;
        const now = o.now ?? Date.now();
        const nowLine = now >= from && now <= to ? `<line x1="${X(now).toFixed(1)}" y1="0" x2="${X(now).toFixed(1)}" y2="${H}" stroke="var(--kx-bad,#c0392b)" stroke-dasharray="3 3" data-viz-now><title>teď</title></line>` : '';
        const bars = segs.map((s, i) => {
            const y = rows.indexOf(s.row) * rowH + 4;
            const x = X(Math.max(from, s.start)), w = Math.max(3, X(Math.min(to, s.end)) - x);
            return `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH - 8}" rx="3" fill="${s.color || PAL[rows.indexOf(s.row) % PAL.length]}" data-viz-item="${esc(s.key || i)}"><title>${esc(s.label)}: ${esc(new Date(s.start).toLocaleString())} – ${esc(new Date(s.end).toLocaleString())}</title></rect>`;
        }).join('');
        const labels = rows.map((r, i) => `<text x="4" y="${i * rowH + 15}" font-size="10" fill="currentColor">${esc(String(r).slice(0, 18))}</text>`).join('');
        return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'Ganttův diagram')}" data-viz="GANTT" style="width:100%;height:auto">${labels}${bars}${nowLine}<text x="${pad}" y="${H - 4}" font-size="9" fill="currentColor" opacity=".7">${esc(day(from))}</text><text x="${W - 10}" y="${H - 4}" font-size="9" text-anchor="end" fill="currentColor" opacity=".7">${esc(day(to))}</text></svg>`;
    }
    function table(series) { return `<table data-viz="TABLE" style="width:100%;font-size:12px;border-collapse:collapse"><tbody>${series.map(s => `<tr data-viz-item="${esc(s.key)}"><td>${esc(s.label)}</td><td style="text-align:right"><b>${esc(s.display ?? s.value)}</b></td></tr>`).join('')}</tbody></table>`; }
    const vLoc = () => String(globalThis.document?.documentElement?.lang || 'cs').startsWith('en') ? 'en-GB' : 'cs-CZ';
    const hubName = (h) => String(globalThis.KXHubLabel?.(h) || String(h || '').replace(/^APP\.(KX\.)?/, ''));
    const shortT = (t) => String(t || '').replace(/^DEMO\s*[·:–-]\s*/, '');
    const dayTitle = (k) => { const s2 = new Date(k + 'T00:00:00').toLocaleDateString(vLoc(), { weekday: 'long', day: 'numeric', month: 'numeric' }); return s2.charAt(0).toUpperCase() + s2.slice(1); };
    const itemLi = (it) => `<li data-viz-item="${esc(it.key)}" data-viz-link="${esc(it.deepLink || '')}" style="cursor:pointer"><small>${esc(new Date(it.at).toLocaleTimeString(vLoc(), { hour: '2-digit', minute: '2-digit' }))}</small> ${esc(it.title)}${it.hub ? ` <small>· ${esc(it.hubLabel || hubName(it.hub))}</small>` : ''}</li>`;
    function month(items, o = {}) {
        const base = new Date(o.from ?? Date.now());
        const y = base.getUTCFullYear(), m = base.getUTCMonth();
        const first = Date.UTC(y, m, 1), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const lead = (new Date(first).getUTCDay() + 6) % 7;
        const by = new Map();
        for (const it of items) {
            const k = day(it.at);
            by.set(k, [...(by.get(k) || []), it]);
        }
        const today = day(o.now ?? Date.now());
        let cells = '';
        for (let i = 0; i < lead; i++)
            cells += '<td></td>';
        for (let d = 1; d <= days; d++) {
            const k = day(Date.UTC(y, m, d));
            const its = by.get(k) || [];
            cells += `<td data-viz-day="${k}" style="vertical-align:top;border:1px solid var(--line,#ddd);padding:2px;height:54px;${k === today ? 'outline:2px solid var(--accent,#c9a227);' : ''}"><b style="font-size:11px">${d}</b>${its.slice(0, 3).map(it => `<div data-viz-item="${esc(it.key)}" data-viz-link="${esc(it.deepLink || '')}" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" title="${esc(it.title)}">• ${esc(shortT(it.title))}</div>`).join('')}${its.length > 3 ? `<small>+${its.length - 3}</small>` : ''}</td>`;
            if ((lead + d) % 7 === 0)
                cells += '</tr><tr>';
        }
        return `<table data-viz="MONTH" style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>${['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(x => `<th style="font-size:11px">${x}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
    }
    function week(items, o = {}) {
        const r = range('THIS_WEEK', o.from ?? o.now ?? Date.now());
        let cols = '';
        for (let i = 0; i < 7; i++) {
            const t = r.from + i * DAY, k = day(t);
            const its = items.filter(x => day(x.at) === k).sort((a, b) => a.at - b.at);
            cols += `<div data-viz-day="${k}" style="border:1px solid var(--line,#ddd);border-radius:6px;padding:4px;min-height:90px"><b style="font-size:11px">${['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'][i]} ${new Date(t).getUTCDate()}.</b><ul style="list-style:none;padding:0;margin:0;font-size:11px">${its.map(itemLi).join('')}</ul></div>`;
        }
        return `<div data-viz="WEEK" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cols}</div>`;
    }
    function dayView(items, o = {}) {
        const k = day(o.from ?? o.now ?? Date.now());
        const its = items.filter(x => day(x.at) === k).sort((a, b) => a.at - b.at);
        let rows = '';
        for (let h = 6; h <= 22; h++) {
            const hs = its.filter(x => new Date(x.at).getUTCHours() === h);
            rows += `<div data-viz-hour="${h}" style="display:grid;grid-template-columns:44px 1fr;border-top:1px solid var(--line,#eee);min-height:22px"><small>${String(h).padStart(2, '0')}:00</small><ul style="list-style:none;padding:0;margin:0;font-size:12px">${hs.map(itemLi).join('')}</ul></div>`;
        }
        const outside = its.filter(x => { const h = new Date(x.at).getUTCHours(); return h < 6 || h > 22; });
        return `<div data-viz="DAY"><b>${esc(k)}</b> · ${its.length} položek${outside.length ? `<ul style="font-size:12px">${outside.map(itemLi).join('')}</ul>` : ''}${rows}</div>`;
    }
    function agenda(items) {
        const by = new Map();
        for (const it of [...items].sort((a, b) => a.at - b.at)) {
            const k = day(it.at);
            by.set(k, [...(by.get(k) || []), it]);
        }
        return `<div data-viz="AGENDA">${[...by].map(([k, its]) => `<h4 style="margin:6px 0 2px" data-viz-date="${esc(k)}">${esc(dayTitle(k))}</h4><ul style="list-style:none;padding:0;margin:0;font-size:12px">${its.map(itemLi).join('')}</ul>`).join('') || '<p class="empty" data-viz-empty>Nic naplánováno</p>'}</div>`;
    }
    function number(series, o = {}) { const tot = series.reduce((a, s) => a + (Number(s.value) || 0), 0); return `<div data-viz="NUMBER" style="font-size:32px;font-weight:700">${esc(o.format ? o.format(tot) : tot)}<small style="font-size:12px;font-weight:400;display:block">${esc(o.title || '')}</small></div>`; }
    function render(viz, data, o = {}) {
        if (!VIZ.includes(viz))
            throw new Error('INSIGHT_VIZ_INVALID');
        const s = data?.series || [], it = data?.items || [], sg = data?.segments || [];
        switch (viz) {
            case 'BAR': return bar(s, o);
            case 'LINE': return line(s, o);
            case 'DONUT': return donut(s, o);
            case 'TABLE': return table(s);
            case 'NUMBER': return number(s, o);
            case 'GANTT': return gantt(sg.length ? sg : it.filter((x) => x.end).map((x) => ({ key: x.key, row: x.hubLabel || x.hub || x.kind, label: x.title, start: x.at, end: x.end })), { ...o, from: data.from, to: data.to });
            case 'MONTH': return month(it, { ...o, from: data.from });
            case 'WEEK': return week(it, { ...o, from: data.from });
            case 'DAY': return dayView(it, { ...o, from: data.from });
            case 'AGENDA': return agenda(it);
        }
        return '';
    }
    // ---------- service ----------
    class InsightService {
        core;
        opts;
        sources = new Map();
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        registerSource(src) {
            const id = String(src?.id || '');
            if (!/^[a-z][a-z0-9_.]{2,80}$/.test(id))
                throw new Error('INSIGHT_SOURCE_ID_INVALID');
            if (typeof src.fetch !== 'function')
                throw new Error('INSIGHT_SOURCE_FETCH_REQUIRED');
            this.sources.set(id, { id, title: String(src.title || id).slice(0, 120), kind: src.kind || 'SERIES', viz: (src.viz || []).filter((v) => VIZ.includes(v)), hubAware: src.hubAware === true, fetch: src.fetch });
            return id;
        }
        list() { return [...this.sources.values()].map(s => ({ id: s.id, title: s.title, kind: s.kind, viz: s.viz, hubAware: s.hubAware })); }
        async run(input, actorId) {
            const s = this.sources.get(input?.sourceId);
            if (!s)
                throw new Error('INSIGHT_SOURCE_UNKNOWN');
            const p = input?.params || {};
            const rc = RANGES.includes(p.range) ? p.range : '7D';
            const r = p.from && p.to ? { from: Number(p.from), to: Number(p.to) } : range(rc, this.now());
            const data = await s.fetch({ ...p, range: rc, from: r.from, to: r.to }, actorId);
            return { sourceId: s.id, params: { ...p, range: rc }, from: r.from, to: r.to, ...data };
        }
        async agendaItems(p, actorId) {
            const snap = await this.core.plannerAgenda.snapshot({ userId: actorId, scope: p.scope || 'ALL', from: new Date(p.from).toISOString(), to: new Date(p.to).toISOString(), types: p.types, limit: 5000 }); /* review fix: aggregates (per day / per hub) need the whole range – 500 silently cut them */
            const base = (snap.items || []).filter((x) => !p.hub || x.ownerApp === p.hub).map((x, i) => {
                const at = Date.parse(x.at);
                const end = x.endsAt ? Date.parse(x.endsAt) : null;
                return { key: x.id || String(i), title: String(x.title || x.label || x.kind), kind: x.kind, hub: x.ownerApp, at, end: Number.isFinite(end) ? end : null, deepLink: x.deepLink || '' };
            });
            /* occurrences of recurring events now come from the planner agenda itself (core) */ return base;
        }
        async compare(input, actorId) {
            const ids = Array.isArray(input?.ids) ? [...new Set(input.ids)].slice(0, 4) : [];
            if (ids.length < 2)
                throw new Error('INSIGHT_COMPARE_NEEDS_2');
            const rows = [];
            for (const id of ids) {
                const r = await this.core.entities.get(id);
                if (!r || r.archivedAt)
                    throw new Error('INSIGHT_COMPARE_RECORD_NOT_FOUND');
                if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') !== true)
                    throw new Error('Scope denied: READ required');
                rows.push(r);
            }
            let fields;
            if (input?.scope && this.core.fields) {
                fields = (await this.core.fields.effective(input.scope, actorId)).fields.filter((f) => !f.hidden);
            }
            else {
                const keys = new Set();
                for (const r of rows)
                    for (const k of Object.keys(r.data || {}))
                        keys.add(k);
                fields = [...keys].sort().map(k => ({ key: k, label: k }));
            }
            const val = (r, f) => { const v = f.custom ? r.data?.custom?.[f.key] : r.data?.[f.key]; return f.optionLabels && v != null && f.optionLabels[v] !== undefined ? f.optionLabels[v] : v; };
            const out = fields.map((f) => { const vals = rows.map(r => val(r, f)); const norm = vals.map(v => v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)); return { key: f.key, label: f.label, values: vals, differs: new Set(norm).size > 1 }; });
            return { contract: CONTRACT, records: rows.map(r => ({ id: r.id, title: String(r.data?.name || r.data?.title || r.id), revision: r.revision })), fields: out, differences: out.filter(x => x.differs).length };
        }
        // saved widgets (per user)
        boardsOf(d) { const b = new Set((Array.isArray(d?.boards) ? d.boards : []).filter((x) => BOARD_RE.test(String(x)))); if (d?.pinHome)
            b.add('HOME'); return [...b]; }
        async widgets(actorId, board) {
            const out = [];
            for (const r of await this.core.entities.list()) {
                if (r.type !== WTYPE || r.archivedAt || r.data?.owner !== actorId)
                    continue;
                const boards = this.boardsOf(r.data);
                if (board && !boards.includes(board))
                    continue;
                out.push({ id: r.id, revision: r.revision, ...r.data, boards, pinHome: boards.includes('HOME') });
            }
            const ord = (w) => board ? (w.orderOn?.[board] ?? w.order ?? 0) : (w.order ?? 0);
            return out.sort((a, b) => ord(a) - ord(b) || String(a.title).localeCompare(String(b.title), 'cs'));
        }
        async saveWidget(input, ctx) {
            const title = String(input?.title || '').trim().slice(0, 120);
            if (!title)
                throw new Error('INSIGHT_WIDGET_TITLE_REQUIRED');
            if (!this.sources.has(input?.sourceId))
                throw new Error('INSIGHT_SOURCE_UNKNOWN');
            if (!VIZ.includes(input?.viz))
                throw new Error('INSIGHT_VIZ_INVALID');
            const p = input?.params || {};
            if (p.range && !RANGES.includes(p.range))
                throw new Error('INSIGHT_RANGE_INVALID');
            const old = input?.id ? await this.core.entities.get(input.id) : null;
            if (input?.id && (!old || old.type !== WTYPE || old.data.owner !== ctx.actorId))
                throw new Error('INSIGHT_WIDGET_NOT_FOUND');
            let space = old?.spaceIds;
            if (!space) {
                const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === ctx.actorId && !x.archivedAt);
                if (!s)
                    throw new Error('INSIGHTS_NO_PERSONAL_SPACE');
                space = [s.id];
            }
            const r = await this.core.entities.save({ ...(old ? { id: old.id, expectedRevision: Number.isInteger(input.expectedRevision) ? input.expectedRevision : old.revision } : {}), type: WTYPE, ownerApp: OWNER, schema: 'KX.CORE_INSIGHT_WIDGET/1', spaceIds: space,
                data: { owner: ctx.actorId, title, sourceId: input.sourceId, viz: input.viz, params: { hub: typeof p.hub === 'string' ? p.hub : null, range: p.range || '7D', scope: p.scope || 'ALL' },
                    boards: (() => { const b = new Set(Array.isArray(input?.boards) ? input.boards.filter((x) => BOARD_RE.test(String(x))) : (old ? this.boardsOf(old.data) : [])); if (input?.pinHome === true)
                        b.add('HOME'); if (input?.pinHome === false)
                        b.delete('HOME'); return [...b]; })(),
                    orderOn: old?.data.orderOn || {}, order: Number.isFinite(input?.order) ? input.order : (old?.data.order ?? 0) } }, ctx);
            return { id: r.id, revision: r.revision, ...r.data, boards: r.data.boards, pinHome: r.data.boards.includes('HOME') };
        }
        async ownWidget(id, actorId) { const r = await this.core.entities.get(id); if (!r || r.type !== WTYPE || r.archivedAt || r.data.owner !== actorId)
            throw new Error('INSIGHT_WIDGET_NOT_FOUND'); return r; }
        saveData(r, data, ctx) { return this.core.entities.save({ id: r.id, type: WTYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, data }, ctx); }
        // place on / remove from a board (removing from the last board keeps the widget in "Moje přehledy" – nothing is lost)
        async place(input, ctx) {
            const board = String(input?.board || '');
            if (!BOARD_RE.test(board))
                throw new Error('INSIGHT_BOARD_INVALID');
            const r = await this.ownWidget(input?.id, ctx.actorId);
            const b = new Set(this.boardsOf(r.data));
            if (input?.on === false)
                b.delete(board);
            else
                b.add(board);
            const orderOn = { ...(r.data.orderOn || {}) };
            if (input?.on !== false && orderOn[board] === undefined) {
                const others = await this.widgets(ctx.actorId, board);
                orderOn[board] = (others.reduce((m, w) => Math.max(m, w.orderOn?.[board] ?? 0), 0)) + 10;
            }
            const saved = await this.saveData(r, { ...r.data, boards: [...b], pinHome: b.has('HOME'), orderOn }, ctx);
            if (input?.markCustomized !== false)
                await this.markBoard(board, ctx, { customized: true });
            return { id: saved.id, boards: saved.data.boards };
        }
        async move(input, ctx) {
            const from = String(input?.from || ''), to = String(input?.to || '');
            if (!BOARD_RE.test(from) || !BOARD_RE.test(to))
                throw new Error('INSIGHT_BOARD_INVALID');
            const r = await this.ownWidget(input?.id, ctx.actorId);
            const b = new Set(this.boardsOf(r.data));
            if (!b.has(from))
                throw new Error('INSIGHT_WIDGET_NOT_ON_BOARD');
            b.delete(from);
            b.add(to);
            const orderOn = { ...(r.data.orderOn || {}) };
            delete orderOn[from];
            const others = await this.widgets(ctx.actorId, to);
            orderOn[to] = (others.reduce((m, w) => Math.max(m, w.orderOn?.[to] ?? 0), 0)) + 10;
            const saved = await this.saveData(r, { ...r.data, boards: [...b], pinHome: b.has('HOME'), orderOn }, ctx);
            return { id: saved.id, boards: saved.data.boards };
        }
        async reorder(input, ctx) {
            const board = String(input?.board || '');
            if (!BOARD_RE.test(board))
                throw new Error('INSIGHT_BOARD_INVALID');
            const list = await this.widgets(ctx.actorId, board);
            const i = list.findIndex((w) => w.id === input?.id);
            if (i < 0)
                throw new Error('INSIGHT_WIDGET_NOT_ON_BOARD');
            const j = Math.max(0, Math.min(list.length - 1, i + (input?.dir < 0 ? -1 : 1)));
            if (i === j)
                return { moved: false };
            list.splice(j, 0, list.splice(i, 1)[0]);
            for (let k = 0; k < list.length; k++) {
                const r = await this.ownWidget(list[k].id, ctx.actorId);
                if ((r.data.orderOn || {})[board] === k * 10)
                    continue;
                await this.saveData(r, { ...r.data, orderOn: { ...(r.data.orderOn || {}), [board]: k * 10 } }, ctx);
            }
            return { moved: true };
        }
        presets(board) {
            if (!BOARD_RE.test(String(board)))
                throw new Error('INSIGHT_BOARD_INVALID');
            const hub = board.startsWith('HUB:') ? board.slice(4) : null;
            const variants = VARIANTS.filter(v => this.sources.has(v.sourceId) && !(hub && v.homeOnly)).map(v => { const src = this.sources.get(v.sourceId); return { id: v.id, title: v.title, sourceId: v.sourceId, viz: v.viz, params: { range: v.range, hub: hub && src.hubAware ? hub : null } }; });
            const ids = new Set(variants.map(v => v.id));
            const compositions = COMPOSITIONS.map(([id, title, vs]) => ({ id, title, variantIds: vs.filter(x => ids.has(x)) })).filter(c => c.variantIds.length);
            return { board, variants, compositions, defaultComposition: compositions[0]?.id || null };
        }
        async boardMeta(board, actorId) { const r = await this.core.entities.get(this.vsId(actorId)); return r?.data?.boards?.[board] || { customized: false }; }
        async markBoard(board, ctx, meta) {
            const r = await this.core.entities.get(this.vsId(ctx.actorId));
            let space = r?.spaceIds;
            if (!space) {
                const sp = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === ctx.actorId && !x.archivedAt);
                if (!sp)
                    throw new Error('INSIGHTS_NO_PERSONAL_SPACE');
                space = [sp.id];
            }
            await this.core.entities.save({ id: this.vsId(ctx.actorId), type: VSTYPE, ownerApp: OWNER, schema: 'KX.CORE_INSIGHT_VIEWSTATE/1', spaceIds: space, expectedRevision: r?.revision || 0, data: { ...(r?.data || {}), places: r?.data?.places || {}, boards: { ...(r?.data?.boards || {}), [board]: { ...meta, at: new Date(this.now()).toISOString() } } } }, ctx);
        }
        async applyPreset(input, ctx) {
            const board = String(input?.board || '');
            const P = this.presets(board);
            const comp = P.compositions.find((c) => c.id === input?.compositionId);
            if (!comp)
                throw new Error('INSIGHT_PRESET_UNKNOWN');
            const mode = input?.mode === 'ADD' ? 'ADD' : 'REPLACE';
            let removed = 0;
            if (mode === 'REPLACE')
                for (const w of await this.widgets(ctx.actorId, board)) {
                    await this.place({ id: w.id, board, on: false }, ctx);
                    removed++;
                }
            const created = [];
            for (const vid of comp.variantIds) {
                const v = P.variants.find((x) => x.id === vid);
                const w = await this.saveWidget({ title: v.title, sourceId: v.sourceId, viz: v.viz, params: v.params, boards: [board] }, ctx);
                await this.place({ id: w.id, board, on: true }, ctx);
                created.push(w.id);
            }
            await this.markBoard(board, ctx, { customized: true, composition: comp.id });
            return { board, composition: comp.id, mode, created: created.length, removedFromBoard: removed };
        }
        async addVariant(input, ctx) {
            const board = String(input?.board || '');
            const v = this.presets(board).variants.find((x) => x.id === input?.variantId);
            if (!v)
                throw new Error('INSIGHT_VARIANT_UNKNOWN');
            const w = await this.saveWidget({ title: v.title, sourceId: v.sourceId, viz: v.viz, params: v.params, boards: [board] }, ctx);
            await this.place({ id: w.id, board, on: true }, ctx);
            await this.markBoard(board, ctx, { customized: true });
            return { id: w.id };
        }
        async resetBoard(input, ctx) {
            const board = String(input?.board || '');
            if (!BOARD_RE.test(board))
                throw new Error('INSIGHT_BOARD_INVALID');
            let removed = 0;
            for (const w of await this.widgets(ctx.actorId, board)) {
                await this.place({ id: w.id, board, on: false }, ctx);
                removed++;
            }
            await this.markBoard(board, ctx, { customized: false });
            return { board, removedFromBoard: removed };
        }
        // remembered view state per place (pane view, hub section, board widget…): what you picked stays
        vsId(actorId) { return `INSIGHT.VIEWSTATE.${actorId}`; }
        async viewState(place, actorId) { if (!PLACE_RE.test(String(place)))
            return null; const r = await this.core.entities.get(this.vsId(actorId)); return r?.data?.places?.[place] || null; }
        async setViewState(input, ctx) {
            const place = String(input?.place || '');
            if (!PLACE_RE.test(place))
                throw new Error('INSIGHT_PLACE_INVALID');
            const v = input?.state || {};
            if (v.viz && !VIZ.includes(v.viz))
                throw new Error('INSIGHT_VIZ_INVALID');
            if (v.range && !RANGES.includes(v.range))
                throw new Error('INSIGHT_RANGE_INVALID');
            const clean = { viz: v.viz || null, range: v.range || null, hub: typeof v.hub === 'string' && /^APP\.[A-Z0-9_.]{2,80}$/.test(v.hub) ? v.hub : null, sourceId: this.sources.has(v.sourceId) ? v.sourceId : null, at: new Date(this.now()).toISOString() };
            const r = await this.core.entities.get(this.vsId(ctx.actorId));
            let space = r?.spaceIds;
            if (!space) {
                const sp = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === ctx.actorId && !x.archivedAt);
                if (!sp)
                    throw new Error('INSIGHTS_NO_PERSONAL_SPACE');
                space = [sp.id];
            }
            const places = { ...(r?.data?.places || {}), [place]: clean };
            const keys = Object.keys(places);
            if (keys.length > 400)
                for (const k of keys.sort((a, b) => String(places[a].at).localeCompare(String(places[b].at))).slice(0, keys.length - 400))
                    delete places[k];
            await this.core.entities.save({ id: this.vsId(ctx.actorId), type: VSTYPE, ownerApp: OWNER, schema: 'KX.CORE_INSIGHT_VIEWSTATE/1', spaceIds: space, expectedRevision: r?.revision || 0, data: { ...(r?.data || {}), places } }, ctx);
            return clean;
        }
        async forgetViewState(input, ctx) {
            const r = await this.core.entities.get(this.vsId(ctx.actorId));
            if (!r)
                return { forgotten: false };
            const places = { ...(r.data.places || {}) };
            const had = input?.place in places;
            delete places[input?.place];
            await this.core.entities.save({ id: r.id, type: VSTYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, data: { ...r.data, places } }, ctx);
            return { forgotten: had };
        }
        async deleteWidget(input, ctx) {
            const r = await this.core.entities.get(input?.id);
            if (!r || r.type !== WTYPE || r.data.owner !== ctx.actorId)
                throw new Error('INSIGHT_WIDGET_NOT_FOUND');
            return this.core.entities.save({ id: r.id, type: WTYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, archivedAt: new Date().toISOString(), data: r.data }, ctx);
        }
    }
    function builtins(svc, core) {
        const hubCount = (items) => { const m = new Map(); for (const it of items)
            m.set(it.hub || '—', (m.get(it.hub || '—') || 0) + 1); return [...m].map(([k, v]) => ({ key: k, label: k.replace('APP.KX.', ''), value: v })); };
        const perDay = (from, to, f, disp) => { const out = []; for (let t = from; t < to; t += DAY) {
            const k = day(t);
            const v = f(k);
            out.push({ key: k, label: k.slice(5), value: v, display: disp ? disp(v) : undefined });
        } return out; };
        svc.registerSource({ id: 'agenda.items', title: 'Kalendář, úkoly a alarmy', kind: 'ITEMS', hubAware: true, viz: ['MONTH', 'WEEK', 'DAY', 'AGENDA', 'GANTT'], fetch: async (p, a) => ({ items: await svc.agendaItems(p, a) }) });
        svc.registerSource({ id: 'agenda.per_day', title: 'Počet položek kalendáře po dnech', kind: 'SERIES', hubAware: true, viz: ['BAR', 'LINE', 'TABLE', 'NUMBER'], fetch: async (p, a) => { const it = await svc.agendaItems(p, a); return { series: perDay(p.from, p.to, k => it.filter(x => day(x.at) === k).length) }; } });
        svc.registerSource({ id: 'agenda.per_hub', title: 'Položky kalendáře podle hubu', kind: 'SERIES', viz: ['DONUT', 'BAR', 'TABLE'], fetch: async (p, a) => ({ series: hubCount(await svc.agendaItems(p, a)) }) });
        const entries = async (p, a) => {
            const out = [];
            for (const r of await core.entities.list()) {
                if (r.type !== 'CORE.TIME.ENTRY' || r.archivedAt)
                    continue;
                if (p.hub && r.ownerApp !== p.hub)
                    continue;
                if (await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, a, 'READ') !== true)
                    continue;
                const s = Date.parse(r.data.start), e = Date.parse(r.data.end);
                if (e < p.from || s >= p.to)
                    continue;
                out.push({ ...r.data, id: r.id, ownerApp: r.ownerApp, s, e });
            }
            return out;
        };
        const fmtMin = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')} h`;
        svc.registerSource({ id: 'time.per_day', title: 'Odpracovaný čas po dnech (stopky)', kind: 'SERIES', hubAware: true, viz: ['BAR', 'LINE', 'TABLE', 'NUMBER'], fetch: async (p, a) => { const es = await entries(p, a); return { series: perDay(p.from, p.to, k => Math.round(es.filter(x => day(x.s) === k).reduce((t, x) => t + x.minutes, 0)), fmtMin) }; } });
        svc.registerSource({ id: 'time.per_target', title: 'Čas podle záznamu (stopky)', kind: 'SERIES', hubAware: true, viz: ['DONUT', 'BAR', 'TABLE'], fetch: async (p, a) => {
                const es = await entries(p, a);
                const m = new Map();
                for (const x of es) {
                    const k = x.target?.title || x.label;
                    m.set(k, (m.get(k) || 0) + x.minutes);
                }
                return { series: [...m].map(([k, v]) => ({ key: k, label: k, value: Math.round(v), display: fmtMin(v) })) };
            } });
        svc.registerSource({ id: 'time.gantt', title: 'Měření času na časové ose (stopky)', kind: 'SEGMENTS', hubAware: true, viz: ['GANTT'], fetch: async (p, a) => ({ segments: (await entries(p, a)).map((x) => ({ key: x.id, row: x.target?.title || x.label, label: `${x.label} · ${fmtMin(x.minutes)}`, start: x.s, end: x.e })) }) });
        svc.registerSource({ id: 'records.per_hub', title: 'Záznamy podle hubu', kind: 'SERIES', viz: ['DONUT', 'BAR', 'TABLE'], fetch: async (_p, a) => {
                const m = new Map();
                for (const r of await core.entities.list()) {
                    if (r.archivedAt || !String(r.ownerApp).startsWith('APP.KX.') || r.ownerApp === 'APP.KX.NEXUS')
                        continue;
                    if (await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, a, 'READ') !== true)
                        continue;
                    m.set(r.ownerApp, (m.get(r.ownerApp) || 0) + 1);
                }
                return { series: [...m].sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ key: k, label: k.replace('APP.KX.', ''), value: v })) };
            } });
        svc.registerSource({ id: 'prompts.per_kind', title: 'Prompty podle druhu', kind: 'SERIES', viz: ['DONUT', 'BAR', 'TABLE'], fetch: async (_p, a) => {
                if (!core.prompts)
                    return { series: [] };
                const m = new Map();
                for (const r of await core.prompts.list({}, a))
                    m.set(r.data.kind, (m.get(r.data.kind) || 0) + 1);
                const lab = async (k) => core.lists ? await core.lists.label('PROMPT.KIND', k, a) : k;
                const out = [];
                for (const [k, v] of m)
                    out.push({ key: k, label: await lab(k), value: v });
                return { series: out };
            } });
    }
    // N2.1x: ready-made widget VARIANTS (26 for Můj den, 22 for every hub) and board COMPOSITIONS (22 per board); a board
    // that the user has not customised yet shows composition #1; applying REPLACE only takes widgets off the board
    // (they stay in Moje přehledy), ADD appends — nothing is ever deleted by a preset
    const V = (id, title, sourceId, viz, range, hubOnly = false, homeOnly = false) => ({ id, title, sourceId, viz, range, hubOnly, homeOnly });
    const VARIANTS = [V('cal-month', 'Kalendář – měsíc', 'agenda.items', 'MONTH', 'THIS_MONTH'), V('cal-week', 'Kalendář – týden', 'agenda.items', 'WEEK', 'THIS_WEEK'), V('cal-day', 'Den', 'agenda.items', 'DAY', 'TODAY'),
        V('agenda-7', 'Agenda 7 dní', 'agenda.items', 'AGENDA', 'NEXT_7D'), V('agenda-30', 'Agenda 30 dní', 'agenda.items', 'AGENDA', 'NEXT_30D'), V('gantt-30', 'Gantt 30 dní', 'agenda.items', 'GANTT', 'NEXT_30D'), V('gantt-7', 'Gantt 7 dní', 'agenda.items', 'GANTT', 'NEXT_7D'),
        V('perday-bar-30', 'Položky po dnech (30 dní)', 'agenda.per_day', 'BAR', '30D'), V('perday-line-30', 'Vývoj položek (30 dní)', 'agenda.per_day', 'LINE', '30D'), V('perday-bar-next30', 'Co mě čeká (30 dní)', 'agenda.per_day', 'BAR', 'NEXT_30D'),
        V('perday-table-7', 'Položky po dnech – tabulka', 'agenda.per_day', 'TABLE', '7D'), V('count-next7', 'Počet na příštích 7 dní', 'agenda.per_day', 'NUMBER', 'NEXT_7D'), V('count-today', 'Dnes naplánováno', 'agenda.per_day', 'NUMBER', 'TODAY'),
        V('time-bar-7', 'Čas po dnech (7 dní)', 'time.per_day', 'BAR', '7D'), V('time-line-30', 'Vývoj času (30 dní)', 'time.per_day', 'LINE', '30D'), V('time-num-7', 'Čas za 7 dní', 'time.per_day', 'NUMBER', '7D'), V('time-table-30', 'Čas po dnech – tabulka', 'time.per_day', 'TABLE', '30D'),
        V('target-donut-30', 'Čas podle záznamu (30 dní)', 'time.per_target', 'DONUT', '30D'), V('target-bar-7', 'Čas podle záznamu (7 dní)', 'time.per_target', 'BAR', '7D'), V('time-gantt-7', 'Měření času – Gantt (7 dní)', 'time.gantt', 'GANTT', '7D'), V('time-gantt-today', 'Měření času dnes', 'time.gantt', 'GANTT', 'TODAY'),
        V('time-gantt-30', 'Měření času – Gantt (30 dní)', 'time.gantt', 'GANTT', '30D'),
        V('hubs-donut', 'Položky podle hubu', 'agenda.per_hub', 'DONUT', '30D', false, true), V('records-donut', 'Záznamy podle hubu', 'records.per_hub', 'DONUT', '30D', false, true), V('records-bar', 'Záznamy podle hubu – sloupce', 'records.per_hub', 'BAR', '30D', false, true), V('prompts-donut', 'Prompty podle druhu', 'prompts.per_kind', 'DONUT', '30D', false, true),
        // N2.2d +26 (22 for every board + 4 Můj den only)
        V('agenda-90', 'Agenda 90 dní', 'agenda.items', 'AGENDA', '90D'), V('gantt-90', 'Gantt 90 dní', 'agenda.items', 'GANTT', '90D'), V('perday-bar-90', 'Položky po dnech (90 dní)', 'agenda.per_day', 'BAR', '90D'), V('perday-line-90', 'Vývoj položek (90 dní)', 'agenda.per_day', 'LINE', '90D'), V('perday-line-7', 'Vývoj položek (7 dní)', 'agenda.per_day', 'LINE', '7D'), V('perday-table-30', 'Položky po dnech – tabulka (30 dní)', 'agenda.per_day', 'TABLE', '30D'), V('count-30', 'Počet za 30 dní', 'agenda.per_day', 'NUMBER', '30D'), V('count-90', 'Počet za 90 dní', 'agenda.per_day', 'NUMBER', '90D'), V('perday-bar-7', 'Položky po dnech (7 dní)', 'agenda.per_day', 'BAR', '7D'), V('time-bar-30', 'Čas po dnech (30 dní)', 'time.per_day', 'BAR', '30D'), V('time-line-7', 'Vývoj času (7 dní)', 'time.per_day', 'LINE', '7D'), V('time-line-90', 'Vývoj času (90 dní)', 'time.per_day', 'LINE', '90D'), V('time-num-30', 'Čas za 30 dní', 'time.per_day', 'NUMBER', '30D'), V('time-num-today', 'Čas dnes', 'time.per_day', 'NUMBER', 'TODAY'), V('time-table-7', 'Čas po dnech – tabulka (7 dní)', 'time.per_day', 'TABLE', '7D'), V('target-donut-7', 'Čas podle záznamu (7 dní)', 'time.per_target', 'DONUT', '7D'), V('target-donut-90', 'Čas podle záznamu (90 dní)', 'time.per_target', 'DONUT', '90D'), V('target-table-30', 'Čas podle záznamu – tabulka', 'time.per_target', 'TABLE', '30D'), V('target-bar-30', 'Čas podle záznamu (30 dní)', 'time.per_target', 'BAR', '30D'), V('time-gantt-90', 'Měření času – Gantt (90 dní)', 'time.gantt', 'GANTT', '90D'), V('time-bar-90', 'Čas po dnech (90 dní)', 'time.per_day', 'BAR', '90D'), V('week-agenda-next', 'Agenda týdne', 'agenda.items', 'AGENDA', 'THIS_WEEK'),
        V('process-gantt-7', 'Postupy – Gantt (7 dní)', 'process.gantt', 'GANTT', '7D', false, true), V('process-gantt-30', 'Postupy – Gantt (30 dní)', 'process.gantt', 'GANTT', '30D', false, true), V('process-progress-bar', 'Postupy – hotovo %', 'process.progress', 'BAR', '30D', false, true), V('process-progress-table', 'Postupy – hotovo % (tabulka)', 'process.progress', 'TABLE', '30D', false, true)];
    const COMPOSITIONS = [['planner', 'Plánovač', ['cal-month', 'agenda-7']], ['today', 'Dnes', ['cal-day', 'count-today', 'agenda-7']], ['week', 'Týden', ['cal-week', 'perday-bar-next30']],
        ['month-gantt', 'Měsíc + Gantt', ['cal-month', 'gantt-30']], ['upcoming', 'Co mě čeká', ['agenda-30', 'count-next7', 'perday-bar-next30']], ['time', 'Čas a výkazy', ['time-bar-7', 'target-donut-30', 'time-gantt-7']],
        ['time-month', 'Čas za měsíc', ['time-line-30', 'time-table-30']], ['focus-day', 'Soustředěný den', ['cal-day', 'time-gantt-today']], ['manager', 'Manažerský přehled', ['count-next7', 'time-num-7', 'perday-line-30', 'target-bar-7']],
        ['gantt-only', 'Jen Gantt', ['gantt-30', 'time-gantt-30']], ['minimal', 'Minimalistický', ['agenda-7']], ['numbers', 'Jen čísla', ['count-today', 'count-next7', 'time-num-7']],
        ['calendar-full', 'Celý kalendář', ['cal-month', 'cal-week', 'cal-day']], ['trends', 'Trendy', ['perday-line-30', 'time-line-30']], ['review', 'Týdenní revize', ['cal-week', 'time-bar-7', 'target-bar-7']],
        ['agenda-time', 'Agenda + čas', ['agenda-7', 'time-bar-7']], ['project', 'Projektový', ['gantt-30', 'agenda-30', 'target-donut-30']], ['daily-log', 'Denní deník', ['cal-day', 'time-gantt-today', 'count-today']],
        ['plan-ahead', 'Plán dopředu', ['gantt-7', 'agenda-7', 'perday-bar-next30']], ['tables', 'Tabulky', ['perday-table-7', 'time-table-30']], ['balanced', 'Vyvážený', ['cal-month', 'time-bar-7', 'agenda-7', 'count-next7']],
        ['compact-week', 'Kompaktní týden', ['cal-week', 'count-next7']],
        // N2.2d +22
        ['quarter', 'Čtvrtletí', ['agenda-90', 'perday-bar-90', 'count-90']],
        ['time-quarter', 'Čas za čtvrtletí', ['time-line-90', 'time-bar-90', 'target-donut-90']],
        ['long-gantt', 'Dlouhý Gantt', ['gantt-90', 'time-gantt-90']],
        ['week-numbers', 'Týden v číslech', ['count-next7', 'perday-bar-7', 'time-num-7']],
        ['time-today', 'Čas dnes', ['time-num-today', 'time-gantt-today']],
        ['month-review', 'Revize měsíce', ['cal-month', 'perday-table-30', 'time-bar-30']],
        ['targets', 'Kam jde čas', ['target-donut-30', 'target-table-30', 'target-bar-30']],
        ['trend-week', 'Trend týdne', ['perday-line-7', 'time-line-7']],
        ['compact-day', 'Kompaktní den', ['cal-day', 'count-today']],
        ['agenda-only', 'Jen agenda', ['agenda-30']],
        ['week-agenda', 'Týden + agenda', ['cal-week', 'week-agenda-next']],
        ['numbers-month', 'Čísla za měsíc', ['count-30', 'time-num-30']],
        ['tables-plus', 'Tabulky+', ['perday-table-30', 'time-table-7', 'target-table-30']],
        ['gantt-month', 'Gantt měsíce', ['gantt-30', 'cal-month']],
        ['busy-week', 'Vytížení týdne', ['perday-bar-7', 'time-bar-7', 'target-donut-7']],
        ['calendar-time', 'Kalendář + čas', ['cal-month', 'time-line-30']],
        ['planner-plus', 'Plánovač+', ['cal-month', 'agenda-30', 'gantt-30']],
        ['long-term', 'Dlouhodobě', ['perday-line-90', 'time-line-90']],
        ['simple-time', 'Jednoduše čas', ['time-num-7']],
        ['daily-plus', 'Den+', ['cal-day', 'agenda-7', 'time-num-today']],
        ['team-week', 'Týmový týden', ['cal-week', 'gantt-7', 'perday-bar-7']],
        ['everything', 'Vše v kostce', ['cal-month', 'count-next7', 'time-num-7', 'agenda-7']]];
    NS.VARIANTS = VARIANTS;
    NS.COMPOSITIONS = COMPOSITIONS;
    NS.CONTRACT = CONTRACT;
    NS.VIZ = VIZ;
    NS.RANGES = RANGES;
    NS.range = range;
    NS.render = render;
    NS.esc = esc;
    NS.InsightService = InsightService;
    NS.install = (core, options = {}) => {
        if (core.insights)
            throw new Error('Insights already installed');
        if (!core?.plannerAgenda)
            throw new Error('Insights require the planner agenda');
        const svc = new InsightService(core, options);
        builtins(svc, core);
        const reg = [];
        const defs = [['ACTION.CORE.INSIGHT.SOURCES', 'READ', async () => svc.list()], ['ACTION.CORE.INSIGHT.COMPARE', 'READ', (p, c) => svc.compare(p, c.actorId)],
            ['ACTION.CORE.INSIGHT.WIDGETS', 'READ', (p, c) => svc.widgets(c.actorId, p?.board)], ['ACTION.CORE.INSIGHT.PLACE', 'SAFE_WRITE', (p, c) => svc.place(p, c)], ['ACTION.CORE.INSIGHT.MOVE', 'SAFE_WRITE', (p, c) => svc.move(p, c)], ['ACTION.CORE.INSIGHT.PRESETS', 'READ', async (p) => svc.presets(p?.board)], ['ACTION.CORE.INSIGHT.APPLY_PRESET', 'SAFE_WRITE', (p, c) => svc.applyPreset(p, c)], ['ACTION.CORE.INSIGHT.ADD_VARIANT', 'SAFE_WRITE', (p, c) => svc.addVariant(p, c)], ['ACTION.CORE.INSIGHT.RESET_BOARD', 'SAFE_WRITE', (p, c) => svc.resetBoard(p, c)], ['ACTION.CORE.INSIGHT.BOARD_META', 'READ', (p, c) => svc.boardMeta(String(p?.board || ''), c.actorId)], ['ACTION.CORE.INSIGHT.REORDER', 'SAFE_WRITE', (p, c) => svc.reorder(p, c)],
            ['ACTION.CORE.INSIGHT.VIEWSTATE_SET', 'SAFE_WRITE', (p, c) => svc.setViewState(p, c)], ['ACTION.CORE.INSIGHT.VIEWSTATE_FORGET', 'SAFE_WRITE', (p, c) => svc.forgetViewState(p, c)], ['ACTION.CORE.INSIGHT.WIDGET_SAVE', 'SAFE_WRITE', (p, c) => svc.saveWidget(p, c)], ['ACTION.CORE.INSIGHT.WIDGET_DELETE', 'SAFE_WRITE', (p, c) => svc.deleteWidget(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.insights = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.insights;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, sources: svc.list().length });
    };
})(KXInsights || (KXInsights = {}));
