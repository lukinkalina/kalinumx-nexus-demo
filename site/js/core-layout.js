// N2.1u (revize: okna / záložky / rozložení): view registry + layouts per user and device class (KX.CORE_LAYOUT/1).
//  - VIEW = anything that can be shown: HUB:<code> (multi-instance), TOOL:<id>, SECTION:<id> (singleton), INSIGHT:<id>;
//  - LAYOUT = NORMAL (classic, one area) or main area + panes: SPLIT_2V, SPLIT_2H, MAIN_SIDE, SPLIT_3, GRID_4, TABS;
//    each pane holds TABS of views; sizes are fractions; named layouts can be saved / applied / deleted;
//  - normalize() is the stability guarantee: unknown layout type -> NORMAL, unknown / unregistered views dropped,
//    singleton views de-duplicated, empty panes kept as empty (never crash), active tab clamped, sizes clamped and
//    re-normalised; narrow devices (MOBILE) always get TABS with every tab merged into one pane.
var KXLayout;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_LAYOUT/1', TYPE = 'CORE.LAYOUT';
    const PANES = { NORMAL: 0, SPLIT_2V: 1, SPLIT_2H: 1, MAIN_SIDE: 1, SPLIT_3: 2, GRID_4: 3, TABS: 1 };
    const DEVICE = ['DESKTOP', 'TABLET', 'MOBILE'];
    const VIEW_RE = /^(HUB|TOOL|SECTION|INSIGHT):[A-Za-z0-9_.:-]{1,120}$/;
    const MAX_TABS = 12;
    const DEFAULT_SIZES = { NORMAL: [1], SPLIT_2V: [0.5, 0.5], SPLIT_2H: [0.5, 0.5], MAIN_SIDE: [0.68, 0.32], SPLIT_3: [0.4, 0.3, 0.3], GRID_4: [0.5, 0.5], TABS: [1] };
    class LayoutService {
        core;
        opts;
        views = new Map();
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        registerView(v) {
            const id = String(v?.id || '');
            if (!VIEW_RE.test(id))
                throw new Error('LAYOUT_VIEW_ID_INVALID');
            const kind = id.split(':')[0];
            const r = { id, kind, title: String(v.title || id).slice(0, 80), icon: String(v.icon || '▢').slice(0, 4), singleton: kind === 'SECTION' || kind === 'TOOL' || v.singleton === true, group: String(v.group || kind).slice(0, 40) };
            this.views.set(id, r);
            return r;
        }
        viewList() { return [...this.views.values()].sort((a, b) => a.group.localeCompare(b.group, 'cs') || a.title.localeCompare(b.title, 'cs')); }
        types() { return Object.keys(PANES); }
        presets() {
            const out = GENERAL.map(([id, title, type, panes]) => ({ id, title, group: 'Obecné', layout: { type, panes } }));
            for (const v of this.viewList().filter(x => x.kind === 'HUB')) {
                const code = v.id.slice(4);
                out.push({ id: `hub-side:${code}`, title: `${v.title} vedle`, group: v.title, layout: { type: 'MAIN_SIDE', panes: [T(v.id)] } });
                out.push({ id: `hub-cal:${code}`, title: `${v.title} + kalendář`, group: v.title, layout: { type: 'SPLIT_3', panes: [T(v.id), T('INSIGHT:calendar.month')] } });
                out.push({ id: `hub-gantt:${code}`, title: `${v.title} + Gantt`, group: v.title, layout: { type: 'SPLIT_3', panes: [T(v.id), T('INSIGHT:calendar.gantt')] } });
                out.push({ id: `hub-work:${code}`, title: `${v.title} + postupy + stopky`, group: v.title, layout: { type: 'GRID_4', panes: [T(v.id), T('TOOL:processes'), T('TOOL:timers')] } });
            }
            return out;
        }
        tabSets() {
            const out = TABSETS.map(([id, title, views]) => ({ id, title, group: 'Obecné', views }));
            for (const v of this.viewList().filter(x => x.kind === 'HUB')) {
                const code = v.id.slice(4);
                out.push({ id: `hub:${code}`, title: `${v.title} + kalendář`, group: v.title, views: [v.id, 'INSIGHT:calendar.month'] });
                out.push({ id: `hub-plan:${code}`, title: `${v.title} + plánování`, group: v.title, views: [v.id, 'INSIGHT:calendar.agenda', 'INSIGHT:calendar.gantt'] });
                out.push({ id: `hub-time:${code}`, title: `${v.title} + čas`, group: v.title, views: [v.id, 'TOOL:timers', 'INSIGHT:time.per_day'] });
                out.push({ id: `hub-work:${code}`, title: `${v.title} + postupy`, group: v.title, views: [v.id, 'TOOL:processes', 'INSIGHT:process.gantt'] });
            }
            return out;
        }
        async applyTabSet(input, ctx) {
            const ts = this.tabSets().find(x => x.id === input?.tabSetId);
            if (!ts)
                throw new Error('LAYOUT_TABSET_UNKNOWN');
            const dc = this.dc(input?.deviceClass);
            const cur = await this.get({ deviceClass: dc }, ctx.actorId);
            let L = { type: cur.type, panes: structuredClone(cur.panes), sizes: cur.sizes };
            if (L.type === 'NORMAL')
                L = { type: dc === 'MOBILE' ? 'TABS' : 'MAIN_SIDE', panes: [{ tabs: [], active: 0 }], sizes: DEFAULT_SIZES[dc === 'MOBILE' ? 'TABS' : 'MAIN_SIDE'] };
            const pi = Number.isInteger(input?.pane) && input.pane >= 0 && input.pane < L.panes.length ? input.pane : L.panes.length - 1;
            const replace = input?.mode === 'REPLACE';
            const before = replace ? [] : L.panes[pi].tabs;
            L.panes[pi].tabs = [...before, ...ts.views.filter((v) => this.views.has(v)).map((v) => ({ viewId: v }))].slice(0, MAX_TABS);
            L.panes[pi].active = replace ? 0 : Math.min(before.length, L.panes[pi].tabs.length - 1);
            return this.set({ deviceClass: dc, layout: L }, ctx);
        }
        async applyPreset(input, ctx) { const pr = this.presets().find(x => x.id === input?.presetId); if (!pr)
            throw new Error('LAYOUT_PRESET_UNKNOWN'); return this.set({ deviceClass: input?.deviceClass, layout: pr.layout }, ctx); }
        normalize(input, deviceClass = 'DESKTOP') {
            const out = { type: 'NORMAL', panes: [], sizes: [1], dropped: [] };
            try {
                let type = PANES[input?.type] !== undefined ? input.type : 'NORMAL';
                const src = Array.isArray(input?.panes) ? input.panes : [];
                let panes = src.map((p) => ({ tabs: (Array.isArray(p?.tabs) ? p.tabs : []).filter((t) => { const ok = typeof t?.viewId === 'string' && this.views.has(t.viewId); if (!ok && t?.viewId)
                        out.dropped.push(String(t.viewId).slice(0, 140)); return ok; }).slice(0, MAX_TABS).map((t) => ({ viewId: t.viewId })), active: Number.isInteger(p?.active) ? p.active : 0 }));
                if (deviceClass === 'MOBILE' && type !== 'NORMAL') {
                    panes = [{ tabs: panes.flatMap((p) => p.tabs).slice(0, MAX_TABS), active: 0 }];
                    type = 'TABS';
                }
                const n = PANES[type];
                while (panes.length < n)
                    panes.push({ tabs: [], active: 0 });
                if (panes.length > n) {
                    const extra = panes.slice(n).flatMap((p) => p.tabs);
                    panes = panes.slice(0, n);
                    if (n)
                        panes[n - 1].tabs = [...panes[n - 1].tabs, ...extra].slice(0, MAX_TABS);
                }
                const seen = new Set();
                for (const p of panes) {
                    p.tabs = p.tabs.filter((t) => { const v = this.views.get(t.viewId); if (!v.singleton)
                        return true; if (seen.has(t.viewId))
                        return false; seen.add(t.viewId); return true; });
                    p.active = Math.max(0, Math.min(p.tabs.length - 1, p.active));
                    if (!p.tabs.length)
                        p.active = 0;
                }
                const def = DEFAULT_SIZES[type];
                let sizes = Array.isArray(input?.sizes) && input.sizes.length === def.length && input.sizes.every((x) => Number.isFinite(x)) ? input.sizes.map((x) => Math.max(0.15, Math.min(0.85, x))) : def.slice();
                const sum = sizes.reduce((a, b) => a + b, 0);
                sizes = sizes.map((x) => Math.round(x / sum * 1000) / 1000);
                Object.assign(out, { type, panes, sizes });
            }
            catch {
                Object.assign(out, { type: 'NORMAL', panes: [], sizes: [1] });
            }
            return out;
        }
        id(actorId, dc) { return `LAYOUT.${actorId}.${dc}`; }
        dc(x) { return DEVICE.includes(x) ? x : 'DESKTOP'; }
        async row(actorId, dc) { const r = await this.core.entities.get(this.id(actorId, dc)); return r && r.type === TYPE && !r.archivedAt ? r : null; }
        async get(input, actorId) {
            const dc = this.dc(input?.deviceClass);
            const r = await this.row(actorId, dc);
            const cur = this.normalize(r?.data?.current || { type: 'NORMAL' }, dc);
            return { ...cur, deviceClass: dc, revision: r?.revision || 0, saved: (r?.data?.saved || []).map((s) => s.name) };
        }
        async write(actorId, dc, ctx, mut, expected) {
            const r = await this.row(actorId, dc);
            const d = structuredClone(r?.data || { current: { type: 'NORMAL' }, saved: [] });
            mut(d);
            let space = r?.spaceIds;
            if (!space) {
                const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt);
                if (!s)
                    throw new Error('LAYOUT_NO_PERSONAL_SPACE');
                space = [s.id];
            }
            await this.core.entities.save({ id: this.id(actorId, dc), type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_LAYOUT/1', spaceIds: space, expectedRevision: Number.isInteger(expected) ? expected : (r?.revision || 0), data: d }, ctx);
            return this.get({ deviceClass: dc }, actorId);
        }
        async set(input, ctx) { const dc = this.dc(input?.deviceClass); const n = this.normalize(input?.layout, dc); return this.write(ctx.actorId, dc, ctx, d => { d.current = { type: n.type, panes: n.panes, sizes: n.sizes }; }, input?.expectedRevision); }
        async openView(input, ctx) {
            const dc = this.dc(input?.deviceClass);
            const v = this.views.get(input?.viewId);
            if (!v)
                throw new Error('LAYOUT_VIEW_UNKNOWN');
            const cur = await this.get({ deviceClass: dc }, ctx.actorId);
            let L = { type: cur.type, panes: structuredClone(cur.panes), sizes: cur.sizes };
            if (L.type === 'NORMAL')
                L = { type: dc === 'MOBILE' ? 'TABS' : 'MAIN_SIDE', panes: [{ tabs: [], active: 0 }], sizes: DEFAULT_SIZES[dc === 'MOBILE' ? 'TABS' : 'MAIN_SIDE'] };
            for (let i = 0; i < L.panes.length; i++) {
                const j = L.panes[i].tabs.findIndex((t) => t.viewId === v.id);
                if (j >= 0 && v.singleton) {
                    L.panes[i].active = j;
                    return this.write(ctx.actorId, dc, ctx, d => { d.current = this.normalize(L, dc); });
                }
            }
            // "open next to": grow the layout by one pane (main+side -> 3 columns -> 2x2 grid) when the last pane is not empty
            if (input?.placement === 'NEW_PANE' && cur.type !== 'NORMAL' && dc !== 'MOBILE' && L.panes[L.panes.length - 1].tabs.length) {
                const grow = { SPLIT_2V: 'SPLIT_3', SPLIT_2H: 'SPLIT_3', MAIN_SIDE: 'SPLIT_3', SPLIT_3: 'GRID_4' };
                if (grow[L.type]) {
                    L.type = grow[L.type];
                    L.panes.push({ tabs: [], active: 0 });
                    L.sizes = DEFAULT_SIZES[L.type];
                }
            }
            const pi = input?.placement === 'NEW_PANE' ? L.panes.length - 1 : Number.isInteger(input?.pane) && input.pane >= 0 && input.pane < L.panes.length ? input.pane : L.panes.length - 1;
            if (L.panes[pi].tabs.length >= MAX_TABS)
                throw new Error('LAYOUT_PANE_FULL');
            L.panes[pi].tabs.push({ viewId: v.id });
            L.panes[pi].active = L.panes[pi].tabs.length - 1;
            const n = this.normalize(L, dc);
            return this.write(ctx.actorId, dc, ctx, d => { d.current = { type: n.type, panes: n.panes, sizes: n.sizes }; });
        }
        async saveNamed(input, ctx) {
            const name = String(input?.name || '').trim().slice(0, 60);
            if (!name)
                throw new Error('LAYOUT_NAME_REQUIRED');
            const dc = this.dc(input?.deviceClass);
            const cur = await this.get({ deviceClass: dc }, ctx.actorId);
            return this.write(ctx.actorId, dc, ctx, d => { d.saved = [...(d.saved || []).filter((s) => s.name !== name), { name, layout: { type: cur.type, panes: cur.panes, sizes: cur.sizes } }].slice(-30); });
        }
        async applyNamed(input, ctx) {
            const dc = this.dc(input?.deviceClass);
            const r = await this.row(ctx.actorId, dc);
            const s = (r?.data?.saved || []).find((x) => x.name === input?.name);
            if (!s)
                throw new Error('LAYOUT_NAMED_UNKNOWN');
            const n = this.normalize(s.layout, dc);
            return this.write(ctx.actorId, dc, ctx, d => { d.current = { type: n.type, panes: n.panes, sizes: n.sizes }; });
        }
        async deleteNamed(input, ctx) { const dc = this.dc(input?.deviceClass); return this.write(ctx.actorId, dc, ctx, d => { const before = (d.saved || []).length; d.saved = (d.saved || []).filter((s) => s.name !== input?.name); if (d.saved.length === before)
            throw new Error('LAYOUT_NAMED_UNKNOWN'); }); }
    }
    // N2.1x: ready-made layouts (22 general + 2 per registered hub) — applied through normalize(), so a preset that
    // mentions a view that is not available is simply reduced (never breaks)
    const T = (...ids) => ({ tabs: ids.map(v => ({ viewId: v })), active: 0 });
    const GENERAL = [
        ['cal-side', 'Kalendář vedle', 'MAIN_SIDE', [T('INSIGHT:calendar.month')]], ['day-side', 'Den vedle', 'MAIN_SIDE', [T('INSIGHT:calendar.day')]],
        ['week-agenda', 'Týden + Agenda', 'SPLIT_3', [T('INSIGHT:calendar.week'), T('INSIGHT:calendar.agenda')]], ['plan-grid', 'Plánovací mřížka (měsíc, týden, den)', 'GRID_4', [T('INSIGHT:calendar.month'), T('INSIGHT:calendar.week'), T('INSIGHT:calendar.day')]],
        ['gantt-bottom', 'Gantt událostí dole', 'SPLIT_2H', [T('INSIGHT:calendar.gantt')]], ['workshop', 'Dílna: Prompty + Stopky', 'SPLIT_3', [T('TOOL:prompts'), T('TOOL:timers')]],
        ['timers-side', 'Stopky vedle', 'MAIN_SIDE', [T('TOOL:timers')]], ['time-grid', 'Čas: stopky, čas po dnech, Gantt času', 'GRID_4', [T('TOOL:timers'), T('INSIGHT:time.per_day'), T('INSIGHT:time.gantt')]],
        ['time-report', 'Výkaz času (záložky)', 'SPLIT_2V', [T('INSIGHT:time.per_day', 'INSIGHT:time.gantt')]], ['insights-side', 'Přehledy vedle', 'MAIN_SIDE', [T('TOOL:insights')]],
        ['insights-wide', 'Studio přehledů napůl', 'SPLIT_2V', [T('TOOL:insights')]], ['records-agenda', 'Záznamy podle hubu + Agenda', 'SPLIT_3', [T('INSIGHT:records.per_hub'), T('INSIGHT:calendar.agenda')]],
        ['recorder-side', 'Diktafon vedle', 'MAIN_SIDE', [T('TOOL:recorder')]], ['prompts-side', 'Prompty vedle', 'MAIN_SIDE', [T('TOOL:prompts')]],
        ['weblinks-side', 'Weby a odkazy vedle', 'MAIN_SIDE', [T('TOOL:weblinks')]], ['admin', 'Správa: Nastavení + Synchronizace', 'SPLIT_3', [T('TOOL:settings'), T('TOOL:sync')]],
        ['mobile-tabs', 'Mobilní: Den, Stopky, Agenda (záložky)', 'TABS', [T('INSIGHT:calendar.day', 'TOOL:timers', 'INSIGHT:calendar.agenda')]], ['morning', 'Ranní přehled', 'GRID_4', [T('INSIGHT:calendar.day'), T('INSIGHT:calendar.agenda'), T('INSIGHT:records.per_hub')]],
        ['weekly', 'Týdenní porada: Týden + Gantt', 'SPLIT_3', [T('INSIGHT:calendar.week'), T('INSIGHT:calendar.gantt')]], ['office', 'Kancelář: Kalendář, Weby, Přijaté odkazy', 'GRID_4', [T('INSIGHT:calendar.month'), T('TOOL:weblinks'), T('TOOL:handoff')]],
        ['all-tabs', 'Vše v záložkách', 'TABS', [T('INSIGHT:calendar.month', 'INSIGHT:calendar.week', 'INSIGHT:calendar.day', 'INSIGHT:calendar.agenda', 'TOOL:insights', 'TOOL:timers', 'TOOL:prompts')]],
        ['creative', 'Tvorba: Prompty + Diktafon', 'SPLIT_3', [T('TOOL:prompts'), T('TOOL:recorder')]],
        // N2.2d +22
        ['day-agenda-grid', 'Den + agenda + čas', 'GRID_4', [T('INSIGHT:calendar.day'), T('INSIGHT:calendar.agenda'), T('INSIGHT:time.per_day')]],
        ['month-time', 'Měsíc + čas po dnech', 'SPLIT_2V', [T('INSIGHT:calendar.month', 'INSIGHT:time.per_day')]],
        ['agenda-side', 'Agenda vedle', 'MAIN_SIDE', [T('INSIGHT:calendar.agenda')]],
        ['gantt-side', 'Gantt vedle', 'MAIN_SIDE', [T('INSIGHT:calendar.gantt')]],
        ['process-gantt-side', 'Gantt postupů vedle', 'MAIN_SIDE', [T('INSIGHT:process.gantt')]],
        ['processes-side', 'Postupy vedle', 'MAIN_SIDE', [T('TOOL:processes')]],
        ['processes-gantt', 'Postupy + Gantt postupů', 'SPLIT_3', [T('TOOL:processes'), T('INSIGHT:process.gantt')]],
        ['production', 'Výroba: postupy, stopky, Gantt', 'GRID_4', [T('TOOL:processes'), T('TOOL:timers'), T('INSIGHT:process.gantt')]],
        ['week-time', 'Týden + čas', 'SPLIT_3', [T('INSIGHT:calendar.week'), T('INSIGHT:time.per_day')]],
        ['calendar-tabs', 'Kalendář v záložkách vedle', 'MAIN_SIDE', [T('INSIGHT:calendar.month', 'INSIGHT:calendar.week', 'INSIGHT:calendar.day', 'INSIGHT:calendar.agenda')]],
        ['top-bottom-calendar', 'Kalendář dole', 'SPLIT_2H', [T('INSIGHT:calendar.month')]],
        ['top-bottom-time', 'Čas dole', 'SPLIT_2H', [T('INSIGHT:time.per_day', 'INSIGHT:time.gantt')]],
        ['studio-prompts', 'Studio + Prompty', 'SPLIT_3', [T('TOOL:insights'), T('TOOL:prompts')]],
        ['records-side', 'Záznamy podle hubu vedle', 'MAIN_SIDE', [T('INSIGHT:records.per_hub')]],
        ['handoff-side', 'Přijaté odkazy vedle', 'MAIN_SIDE', [T('TOOL:handoff')]],
        ['sync-side', 'Synchronizace vedle', 'MAIN_SIDE', [T('TOOL:sync')]],
        ['settings-side', 'Nastavení vedle', 'MAIN_SIDE', [T('TOOL:settings')]],
        ['manager-grid', 'Manažer: týden, Gantt, záznamy', 'GRID_4', [T('INSIGHT:calendar.week'), T('INSIGHT:calendar.gantt'), T('INSIGHT:records.per_hub')]],
        ['focus-day', 'Soustředění: den', 'SPLIT_2V', [T('INSIGHT:calendar.day')]],
        ['evening-review', 'Večerní revize', 'SPLIT_3', [T('INSIGHT:calendar.day'), T('INSIGHT:time.gantt')]],
        ['mobile-calendar', 'Mobilní: kalendář (záložky)', 'TABS', [T('INSIGHT:calendar.day', 'INSIGHT:calendar.agenda', 'INSIGHT:calendar.month')]],
        ['mobile-work', 'Mobilní: práce (záložky)', 'TABS', [T('TOOL:processes', 'TOOL:timers', 'TOOL:recorder')]]
    ];
    // N2.1y: ready-made TAB SETS for one pane (22 general + 2 per hub) — added as tabs, singletons de-duplicated
    const TABSETS = [['calendar', 'Kalendář (měsíc, týden, den, agenda)', ['INSIGHT:calendar.month', 'INSIGHT:calendar.week', 'INSIGHT:calendar.day', 'INSIGHT:calendar.agenda']],
        ['planning', 'Plánování (měsíc + Gantt)', ['INSIGHT:calendar.month', 'INSIGHT:calendar.gantt']], ['today', 'Dnes (den + agenda)', ['INSIGHT:calendar.day', 'INSIGHT:calendar.agenda']],
        ['week', 'Týden (týden + Gantt)', ['INSIGHT:calendar.week', 'INSIGHT:calendar.gantt']], ['time', 'Čas (stopky, po dnech, Gantt)', ['TOOL:timers', 'INSIGHT:time.per_day', 'INSIGHT:time.gantt']],
        ['time-report', 'Výkaz (po dnech, Gantt)', ['INSIGHT:time.per_day', 'INSIGHT:time.gantt']], ['workshop', 'Dílna (prompty, stopky, diktafon)', ['TOOL:prompts', 'TOOL:timers', 'TOOL:recorder']],
        ['creative', 'Tvorba (prompty, diktafon)', ['TOOL:prompts', 'TOOL:recorder']], ['insights', 'Přehledy (studio, záznamy podle hubu)', ['TOOL:insights', 'INSIGHT:records.per_hub']],
        ['admin', 'Správa (nastavení, synchronizace)', ['TOOL:settings', 'TOOL:sync']], ['office', 'Kancelář (weby, přijaté odkazy)', ['TOOL:weblinks', 'TOOL:handoff']],
        ['tools', 'Všechny nástroje', ['TOOL:prompts', 'TOOL:timers', 'TOOL:recorder', 'TOOL:insights', 'TOOL:weblinks', 'TOOL:settings', 'TOOL:sync', 'TOOL:handoff']],
        ['all-calendar', 'Celý kalendář + Gantt', ['INSIGHT:calendar.month', 'INSIGHT:calendar.week', 'INSIGHT:calendar.day', 'INSIGHT:calendar.agenda', 'INSIGHT:calendar.gantt']],
        ['gantts', 'Ganttovy diagramy', ['INSIGHT:calendar.gantt', 'INSIGHT:time.gantt']], ['charts', 'Grafy', ['INSIGHT:time.per_day', 'INSIGHT:records.per_hub']],
        ['day-time', 'Den + čas', ['INSIGHT:calendar.day', 'TOOL:timers']], ['agenda-time', 'Agenda + stopky', ['INSIGHT:calendar.agenda', 'TOOL:timers']],
        ['morning', 'Ráno (den, agenda, záznamy)', ['INSIGHT:calendar.day', 'INSIGHT:calendar.agenda', 'INSIGHT:records.per_hub']], ['review', 'Revize (týden, čas, přehledy)', ['INSIGHT:calendar.week', 'INSIGHT:time.per_day', 'TOOL:insights']],
        ['minimal', 'Minimální (agenda)', ['INSIGHT:calendar.agenda']], ['phone', 'Telefon (den, stopky, agenda, diktafon)', ['INSIGHT:calendar.day', 'TOOL:timers', 'INSIGHT:calendar.agenda', 'TOOL:recorder']],
        ['notes', 'Poznámky (diktafon, weby)', ['TOOL:recorder', 'TOOL:weblinks']],
        // N2.2d +22
        ['processes', 'Postupy (postupy, Gantt postupů)', ['TOOL:processes', 'INSIGHT:process.gantt']],
        ['production', 'Výroba (postupy, stopky, Gantt)', ['TOOL:processes', 'TOOL:timers', 'INSIGHT:process.gantt']],
        ['month-week', 'Měsíc + týden', ['INSIGHT:calendar.month', 'INSIGHT:calendar.week']],
        ['day-week', 'Den + týden', ['INSIGHT:calendar.day', 'INSIGHT:calendar.week']],
        ['agenda-gantt', 'Agenda + Gantt', ['INSIGHT:calendar.agenda', 'INSIGHT:calendar.gantt']],
        ['time-all', 'Čas – vše', ['TOOL:timers', 'INSIGHT:time.per_day', 'INSIGHT:time.gantt']],
        ['insights-all', 'Přehledy – vše', ['TOOL:insights', 'INSIGHT:records.per_hub', 'INSIGHT:time.per_day']],
        ['admin-all', 'Správa – vše', ['TOOL:settings', 'TOOL:sync', 'TOOL:handoff']],
        ['writing', 'Psaní (prompty, weby)', ['TOOL:prompts', 'TOOL:weblinks']],
        ['voice', 'Hlas (diktafon, stopky)', ['TOOL:recorder', 'TOOL:timers']],
        ['daily', 'Denní (den, agenda, stopky)', ['INSIGHT:calendar.day', 'INSIGHT:calendar.agenda', 'TOOL:timers']],
        ['weekly', 'Týdenní (týden, Gantt, čas)', ['INSIGHT:calendar.week', 'INSIGHT:calendar.gantt', 'INSIGHT:time.per_day']],
        ['monthly', 'Měsíční (měsíc, záznamy)', ['INSIGHT:calendar.month', 'INSIGHT:records.per_hub']],
        ['planning-plus', 'Plánování+ (měsíc, týden, Gantt)', ['INSIGHT:calendar.month', 'INSIGHT:calendar.week', 'INSIGHT:calendar.gantt']],
        ['gantt-all', 'Všechny Gantty', ['INSIGHT:calendar.gantt', 'INSIGHT:time.gantt', 'INSIGHT:process.gantt']],
        ['office-plus', 'Kancelář+ (weby, odkazy, nastavení)', ['TOOL:weblinks', 'TOOL:handoff', 'TOOL:settings']],
        ['creative-plus', 'Tvorba+ (prompty, diktafon, přehledy)', ['TOOL:prompts', 'TOOL:recorder', 'TOOL:insights']],
        ['records', 'Záznamy (podle hubu, agenda)', ['INSIGHT:records.per_hub', 'INSIGHT:calendar.agenda']],
        ['focus', 'Soustředění (den)', ['INSIGHT:calendar.day']],
        ['review-plus', 'Revize+ (týden, čas, Gantt času)', ['INSIGHT:calendar.week', 'INSIGHT:time.per_day', 'INSIGHT:time.gantt']],
        ['phone-plus', 'Telefon+ (den, postupy, stopky)', ['INSIGHT:calendar.day', 'TOOL:processes', 'TOOL:timers']],
        ['everything', 'Vše důležité', ['INSIGHT:calendar.day', 'INSIGHT:calendar.agenda', 'TOOL:processes', 'TOOL:timers', 'TOOL:insights']]];
    NS.CONTRACT = CONTRACT;
    NS.PANES = PANES;
    NS.DEFAULT_SIZES = DEFAULT_SIZES;
    NS.LayoutService = LayoutService;
    NS.install = (core, options = {}) => {
        if (core.layout)
            throw new Error('Layout already installed');
        if (!core?.entities?.save)
            throw new Error('Layout requires Core entities');
        const svc = new LayoutService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.LAYOUT.GET', 'READ', (p, c) => svc.get(p, c.actorId)], ['ACTION.CORE.LAYOUT.SET', 'SAFE_WRITE', (p, c) => svc.set(p, c)],
            ['ACTION.CORE.LAYOUT.OPEN_VIEW', 'SAFE_WRITE', (p, c) => svc.openView(p, c)], ['ACTION.CORE.LAYOUT.PRESETS', 'READ', async () => svc.presets()], ['ACTION.CORE.LAYOUT.TABSETS', 'READ', async () => svc.tabSets()], ['ACTION.CORE.LAYOUT.APPLY_TABSET', 'SAFE_WRITE', (p, c) => svc.applyTabSet(p, c)], ['ACTION.CORE.LAYOUT.APPLY_PRESET', 'SAFE_WRITE', (p, c) => svc.applyPreset(p, c)], ['ACTION.CORE.LAYOUT.SAVE_NAMED', 'SAFE_WRITE', (p, c) => svc.saveNamed(p, c)],
            ['ACTION.CORE.LAYOUT.APPLY_NAMED', 'SAFE_WRITE', (p, c) => svc.applyNamed(p, c)], ['ACTION.CORE.LAYOUT.DELETE_NAMED', 'SAFE_WRITE', (p, c) => svc.deleteNamed(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.layout = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.layout;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXLayout || (KXLayout = {}));
