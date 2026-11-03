// N2.1z (R45): pracovní postupy — processes with free steps, step timers, parallel steps, dependencies and a Gantt.
//  - TEMPLATES: built-in (LASER výroba 10 kroků = default, …) + user templates; a process is created from a template
//    or from scratch and its steps can then be freely added / removed / moved / renamed;
//  - STEP lifecycle TODO → RUNNING → DONE (or SKIPPED); several steps may run at once (souběh); a step whose
//    dependencies are not finished is BLOCKED and starts only with an explicit force;
//  - every running step has its own CORE.TIMER (bound to the process record) — stopping the step publishes a time
//    entry, so reports / finance see the real time per step; removing a started step only marks it SKIPPED (history kept);
//  - computed view: progress %, planned vs actual minutes per step, forecast end, Gantt segments (actual for
//    done / running steps, PLANNED forecast for the rest scheduled after their dependencies).
var KXProcesses;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_PROCESSES/1', TYPE = 'CORE.PROCESS', TTYPE = 'CORE.PROCESS.TEMPLATE', MAX_STEPS = 60;
    const S = (title, plannedMin, dependsOn = []) => ({ title, plannedMin, dependsOn });
    const BUILTIN = [
        { id: 'laser-10', name: 'LASER výroba – 10 kroků', description: 'Výchozí šablona výroby (R45).', steps: [S('Příjem zakázky', 10), S('Kontrola podkladů', 15, [0]), S('Příprava grafiky', 30, [1]), S('Výběr materiálu', 10, [1]), S('Nastavení laseru (parametry)', 15, [2, 3]), S('Zkušební vzorek', 20, [4]), S('Výroba', 60, [5]), S('Kontrola kvality', 15, [6]), S('Balení', 10, [7]), S('Expedice', 10, [8])] },
        { id: 'laser-quick', name: 'LASER – rychlé gravírování', description: 'Krátká zakázka bez vzorku.', steps: [S('Příprava grafiky', 15), S('Nastavení laseru', 10, [0]), S('Gravírování', 20, [1]), S('Kontrola', 5, [2])] },
        { id: 'eshop-order', name: 'E-shop – vyřízení objednávky', description: 'Od přijetí po odeslání.', steps: [S('Přijetí objednávky', 5), S('Personalizace', 20, [0]), S('Výroba', 40, [1]), S('Fotodokumentace', 10, [2]), S('Balení a štítek', 10, [2]), S('Odeslání', 5, [3, 4])] },
        { id: 'complaint', name: 'Reklamace', description: 'Postup reklamace (R47).', steps: [S('Příjem reklamace', 10), S('Posouzení', 20, [0]), S('Rozhodnutí', 10, [1]), S('Oprava / náhrada', 45, [2]), S('Odeslání zpět', 10, [3])] },
        { id: 'param-test', name: 'Test parametrů (LASER)', description: 'Hledání parametrů na novém materiálu.', steps: [S('Volba materiálu', 5), S('Mřížka testů', 30, [0]), S('Vyhodnocení', 15, [1]), S('Uložení parametrů', 5, [2])] },
        { id: 'empty', name: 'Prázdný postup', description: 'Kroky přidáte sami.', steps: [] },
        // N2.2b: hub templates (shown in the hub and in "＋ Nový postup"; the process belongs to the hub)
        { id: 'veh-stk', hub: 'APP.KX.VEHICLES', name: 'Vozidlo – příprava na STK', description: 'Od objednání termínu po uložení protokolu.', steps: [S('Objednat termín STK', 10), S('Kontrola světel a pneumatik', 30, [0]), S('Připravit doklady', 10, [0]), S('STK', 60, [1, 2]), S('Uložit protokol', 5, [3])] },
        { id: 'veh-service', hub: 'APP.KX.VEHICLES', name: 'Vozidlo – servis', description: 'Servisní prohlídka.', steps: [S('Objednat servis', 10), S('Předat vůz', 20, [0]), S('Servis', 240, [1]), S('Převzít a zkontrolovat', 20, [2]), S('Uložit fakturu', 5, [3])] },
        { id: 'con-sign', hub: 'APP.KX.CONTRACTS', name: 'Smlouva – od návrhu po archiv', description: 'Schválení a podpis smlouvy.', steps: [S('Návrh smlouvy', 60), S('Kontrola', 30, [0]), S('Připomínky protistrany', 60, [1]), S('Podpis', 15, [2]), S('Archivace a připomínky termínů', 10, [3])] },
        { id: 'home-repair', hub: 'APP.KX.HOME', name: 'Domácnost – oprava', description: 'Oprava v domácnosti.', steps: [S('Popsat závadu', 10), S('Poptat řemeslníka', 30, [0]), S('Termín opravy', 10, [1]), S('Oprava', 120, [2]), S('Uložit doklad', 5, [3])] },
        { id: 'garden-season', hub: 'APP.KX.GARDEN', name: 'Zahrada – jarní příprava', description: 'Sezónní práce.', steps: [S('Úklid po zimě', 120), S('Prořez', 90, [0]), S('Hnojení', 45, [0]), S('Výsev / výsadba', 120, [1, 2])] },
        { id: 'warranty-claim', hub: 'APP.KX.WARRANTY', name: 'Záruka – reklamace', description: 'Reklamace výrobku v záruce.', steps: [S('Najít doklad a záruční list', 10), S('Sepsat reklamaci', 20, [0]), S('Odeslat / předat', 15, [1]), S('Vyřízení', 30, [2]), S('Uložit výsledek', 5, [3])] }
    ];
    class ProcessService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        iso(t = this.now()) { return new Date(t).toISOString(); }
        uid() { return 'S' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
        async personal(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('PROCESS_NO_PERSONAL_SPACE'); return s.id; }
        async can(r, actorId, level) { return await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, level) === true; }
        async templates(actorId) {
            const own = [];
            for (const r of await this.core.entities.list())
                if (r.type === TTYPE && !r.archivedAt && await this.can(r, actorId, 'READ'))
                    own.push({ id: r.id, name: r.data.name, description: r.data.description || '', steps: r.data.steps, user: true });
            return [...BUILTIN.map(t => ({ ...t, hub: t.hub || null, user: false })), ...own];
        }
        async templatesFor(hub, actorId) { const all = await this.templates(actorId); return hub ? all.filter((t) => !t.hub || t.hub === hub) : all; }
        // spaces where the actor may create a process (EDIT / MANAGE, or the own personal space)
        async creatableSpaces(actorId) {
            const out = [];
            for (const sp of await this.core.memberships.listSpaces()) {
                if (sp.archivedAt)
                    continue;
                if (sp.kind === 'PERSONAL') {
                    if (sp.ownerUserId === actorId)
                        out.push({ id: sp.id, name: sp.name || 'Osobní', kind: sp.kind });
                    continue;
                }
                if (['EDIT', 'MANAGE'].includes(await this.core.memberships.roleFor(sp.id, actorId)))
                    out.push({ id: sp.id, name: sp.name || sp.id, kind: sp.kind });
            }
            return out;
        }
        steps(defs) {
            const ids = defs.map(() => this.uid());
            return defs.slice(0, MAX_STEPS).map((d, i) => ({ id: ids[i], title: String(d.title || `Krok ${i + 1}`).slice(0, 160), plannedMin: Math.max(0, Math.min(100000, Number(d.plannedMin) || 0)),
                dependsOn: (d.dependsOn || []).filter((j) => Number.isInteger(j) && j >= 0 && j < i).map((j) => ids[j]), status: 'TODO', startedAt: null, doneAt: null, timerId: null }));
        }
        async create(input, ctx) {
            const name = String(input?.name || '').trim().slice(0, 160);
            const tpl = input?.templateId ? (await this.templates(ctx.actorId)).find((t) => t.id === input.templateId) : null;
            if (input?.templateId && !tpl)
                throw new Error('PROCESS_TEMPLATE_UNKNOWN');
            let target = null;
            if (input?.target) {
                const row = await this.core.entities.get(input.target.id);
                if (!row || !await this.can(row, ctx.actorId, 'READ'))
                    throw new Error('PROCESS_TARGET_NOT_FOUND');
                target = { kind: 'ENTITY', id: row.id, title: String(row.data?.name || row.data?.title || row.id).slice(0, 160) };
            }
            // N2.2b: the target spaces must be writable for the actor (before: any space id was accepted)
            let spaceIds = Array.isArray(input?.spaceIds) && input.spaceIds.length ? [...new Set(input.spaceIds.map(String))] : [await this.personal(ctx.actorId)];
            const okSpaces = new Set((await this.creatableSpaces(ctx.actorId)).map((x) => x.id));
            if (spaceIds.some((x) => !okSpaces.has(x)))
                throw new Error('Scope denied: EDIT required in the target space');
            const ownerApp = typeof input?.ownerApp === 'string' && /^APP\.[A-Z0-9_.]+$/.test(input.ownerApp) ? input.ownerApp : tpl?.hub || OWNER;
            const r = await this.core.entities.save({ type: TYPE, ownerApp, schema: 'KX.CORE_PROCESS/1',
                spaceIds,
                data: { name: name || tpl?.name || 'Postup', templateId: tpl?.id || null, target, steps: this.steps(input?.steps || tpl?.steps || []), createdBy: ctx.actorId, status: 'OPEN', ...this.extra(input) } }, ctx);
            return this.view(r);
        }
        /* N2.6b (user: name etc. missing when creating): optional description, start, due date and responsible person – validated, old processes stay valid */
        extra(input) {
            const o = {};
            const d = String(input?.description ?? '').trim();
            if (d)
                o.description = d.slice(0, 2000);
            const iso = (v) => { const s = String(v ?? '').trim(); if (!s)
                return null; const t = Date.parse(s); if (isNaN(t))
                throw new Error('PROCESS_DATE_INVALID'); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(t).toISOString(); };
            const st = iso(input?.startAt), du = iso(input?.dueAt);
            if (st)
                o.startAt = st;
            if (du)
                o.dueAt = du;
            if (st && du && Date.parse(du) < Date.parse(st))
                throw new Error('PROCESS_DUE_BEFORE_START');
            const r = String(input?.responsible ?? '').trim();
            if (r)
                o.responsible = r.slice(0, 120);
            return o;
        }
        async load(id, ctx, level = 'EDIT') { const r = await this.core.entities.get(id); if (!r || r.type !== TYPE || r.archivedAt)
            throw new Error('PROCESS_NOT_FOUND'); if (!await this.can(r, ctx.actorId, level))
            throw new Error(`Scope denied: ${level} required`); return r; }
        async save(r, data, ctx) {
            const d = { ...data, status: data.steps.length && data.steps.every((s) => s.status === 'DONE' || s.status === 'SKIPPED') ? 'DONE' : 'OPEN' };
            return this.view(await this.core.entities.save({ id: r.id, type: TYPE, ownerApp: r.ownerApp, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: r.revision, data: d }, ctx));
        }
        // N2.1z fix: concurrent edits of one process (e.g. rename on blur + remove click) — re-apply the change on the fresh
        // record when the revision moved (max 3 attempts); validation errors are never retried, nothing is overwritten
        async mutate(id, ctx, fn) {
            for (let a = 0;; a++) {
                const r = await this.load(id, ctx);
                const data = fn(r);
                try {
                    return await this.save(r, data, ctx);
                }
                catch (e) {
                    if (a < 3 && String(e?.message || e).includes('Revision conflict'))
                        continue;
                    throw e;
                }
            }
        }
        stepOf(r, id) { const s = r.data.steps.find((x) => x.id === id); if (!s)
            throw new Error('PROCESS_STEP_UNKNOWN'); return s; }
        blocked(r, s) { return (s.dependsOn || []).some((d) => { const x = r.data.steps.find((y) => y.id === d); return x && x.status !== 'DONE' && x.status !== 'SKIPPED'; }); }
        async addStep(input, ctx) {
            const nid = this.uid();
            return this.mutate(input?.id, ctx, (r) => {
                if (r.data.steps.length >= MAX_STEPS)
                    throw new Error('PROCESS_TOO_MANY_STEPS');
                const st = { id: nid, title: String(input?.title || 'Nový krok').slice(0, 160), plannedMin: Math.max(0, Number(input?.plannedMin) || 0), dependsOn: [], status: 'TODO', startedAt: null, doneAt: null, timerId: null };
                const steps = [...r.data.steps];
                const at = input?.afterStepId ? steps.findIndex((s) => s.id === input.afterStepId) + 1 : steps.length;
                if (input?.afterStepId && at === 0)
                    throw new Error('PROCESS_STEP_UNKNOWN');
                if (input?.dependsOnPrevious !== false && at > 0)
                    st.dependsOn = [steps[at - 1].id];
                steps.splice(at, 0, st);
                return { ...r.data, steps };
            });
        }
        async removeStep(input, ctx) {
            return this.mutate(input?.id, ctx, (r) => {
                const s = this.stepOf(r, input?.stepId);
                if (s.status !== 'TODO') {
                    if (s.status === 'RUNNING')
                        throw new Error('PROCESS_STEP_RUNNING');
                    return { ...r.data, steps: r.data.steps.map((x) => x.id === s.id ? { ...x, status: 'SKIPPED' } : x) };
                }
                // removing a TODO step re-links the steps that depended on it to its own dependencies (the chain stays intact)
                const steps = r.data.steps.filter((x) => x.id !== s.id).map((x) => x.dependsOn.includes(s.id) ? { ...x, dependsOn: [...new Set([...x.dependsOn.filter((d) => d !== s.id), ...s.dependsOn])] } : x);
                return { ...r.data, steps };
            });
        }
        async moveStep(input, ctx) {
            return this.mutate(input?.id, ctx, (r) => {
                const steps = [...r.data.steps];
                const i = steps.findIndex((x) => x.id === input?.stepId);
                if (i < 0)
                    throw new Error('PROCESS_STEP_UNKNOWN');
                const j = Math.max(0, Math.min(steps.length - 1, i + (input?.dir < 0 ? -1 : 1)));
                steps.splice(j, 0, steps.splice(i, 1)[0]);
                return { ...r.data, steps };
            });
        }
        async members(r) {
            const out = new Set();
            const spaces = await this.core.memberships.listSpaces();
            for (const sp of r.spaceIds || []) {
                const row = spaces.find((x) => x.id === sp);
                if (row?.kind === 'PERSONAL' && row.ownerUserId)
                    out.add(row.ownerUserId);
                for (const m of await this.core.memberships.listMemberships(sp))
                    if (!m.revokedAt && !m.archivedAt)
                        out.add(m.userId);
            }
            return [...out];
        }
        async assignable(id, actorId) { const r = await this.load(id, { actorId }, 'READ'); return this.members(r); }
        async editStep(input, ctx) {
            const pre = await this.load(input?.id, ctx);
            const mem = await this.members(pre);
            return this.mutate(input?.id, ctx, (r) => {
                r.__members = mem;
                const s = this.stepOf(r, input?.stepId);
                const p = input?.patch || {};
                for (const k of Object.keys(p))
                    if (!['title', 'plannedMin', 'dependsOn', 'assignee', 'notBefore'].includes(k))
                        throw new Error(`PROCESS_PATCH_NOT_ALLOWED ${k}`);
                const n = { ...s };
                if ('title' in p) {
                    const t = String(p.title || '').trim();
                    if (!t)
                        throw new Error('PROCESS_STEP_TITLE_REQUIRED');
                    n.title = t.slice(0, 160);
                }
                if ('plannedMin' in p) {
                    const m = Number(p.plannedMin);
                    if (!Number.isFinite(m) || m < 0)
                        throw new Error('PROCESS_PLANNED_INVALID');
                    n.plannedMin = m;
                }
                // N2.2a: assignee must be a member of a space of the process (or null); notBefore = earliest planned start (Gantt drag)
                if ('assignee' in p) {
                    if (p.assignee === null || p.assignee === '')
                        n.assignee = null;
                    else {
                        const ok = r.__members?.includes(String(p.assignee));
                        if (!ok)
                            throw new Error('PROCESS_ASSIGNEE_NOT_MEMBER');
                        n.assignee = String(p.assignee);
                    }
                }
                if ('notBefore' in p) {
                    if (p.notBefore === null || p.notBefore === '')
                        n.notBefore = null;
                    else {
                        const t = Date.parse(String(p.notBefore));
                        if (!Number.isFinite(t))
                            throw new Error('PROCESS_NOT_BEFORE_INVALID');
                        n.notBefore = new Date(t).toISOString();
                    }
                }
                if ('dependsOn' in p) {
                    const ids = new Set(r.data.steps.map((x) => x.id));
                    const deps = (p.dependsOn || []).filter((d) => ids.has(d) && d !== s.id);
                    // no cycles: a dependency must not (transitively) depend on this step
                    const reaches = (from, seen = new Set()) => { if (from === s.id)
                        return true; if (seen.has(from))
                        return false; seen.add(from); const x = r.data.steps.find((y) => y.id === from); return (x?.dependsOn || []).some((d) => reaches(d, seen)); };
                    if (deps.some((d) => reaches(d)))
                        throw new Error('PROCESS_DEPENDENCY_CYCLE');
                    n.dependsOn = deps;
                }
                return { ...r.data, steps: r.data.steps.map((x) => x.id === s.id ? n : x) };
            });
        }
        async startStep(input, ctx) {
            const r = await this.load(input?.id, ctx);
            const s = this.stepOf(r, input?.stepId);
            if (s.status !== 'TODO')
                throw new Error('PROCESS_STEP_NOT_TODO');
            if (this.blocked(r, s) && input?.force !== true)
                throw new Error('PROCESS_STEP_BLOCKED');
            let timerId = null;
            if (this.core.timer) {
                const t = await this.core.timer.start({ target: { kind: 'ENTITY', id: r.id }, label: `${r.data.name}: ${s.title}`, ownerApp: r.ownerApp }, ctx);
                timerId = t.id;
            }
            const at = this.iso();
            return this.mutate(r.id, ctx, (f) => ({ ...f.data, steps: f.data.steps.map((x) => x.id === s.id ? { ...x, status: 'RUNNING', startedAt: at, timerId } : x) }));
        }
        async finishStep(input, ctx, status = 'DONE') {
            const r = await this.load(input?.id, ctx);
            const s = this.stepOf(r, input?.stepId);
            if (status === 'DONE' && s.status !== 'RUNNING')
                throw new Error('PROCESS_STEP_NOT_RUNNING');
            if (status === 'SKIPPED' && !['TODO', 'RUNNING'].includes(s.status))
                throw new Error('PROCESS_STEP_FINISHED');
            if (s.timerId && this.core.timer) {
                try {
                    await this.core.timer.stop({ id: s.timerId, ratePerHour: input?.ratePerHour, takeover: true }, ctx);
                }
                catch (e) {
                    if (!String(e?.message).includes('TIMER_STOPPED'))
                        throw e;
                }
            }
            const at = this.iso();
            return this.mutate(r.id, ctx, (f) => ({ ...f.data, steps: f.data.steps.map((x) => x.id === s.id ? { ...x, status, doneAt: at } : x) }));
        }
        async saveAsTemplate(input, ctx) {
            const r = await this.load(input?.id, ctx, 'READ');
            const idx = new Map(r.data.steps.map((s, i) => [s.id, i]));
            const steps = r.data.steps.filter((s) => s.status !== 'SKIPPED').map((s) => ({ title: s.title, plannedMin: s.plannedMin, dependsOn: s.dependsOn.map((d) => idx.get(d)).filter((x) => Number.isInteger(x)) }));
            const t = await this.core.entities.save({ type: TTYPE, ownerApp: OWNER, schema: 'KX.CORE_PROCESS_TEMPLATE/1', spaceIds: r.spaceIds, data: { name: String(input?.name || r.data.name).slice(0, 160), description: 'Uloženo z postupu', steps } }, ctx);
            return { id: t.id };
        }
        // computed view: progress, actual time from timers, forecast, Gantt segments
        async viewAsync(r) {
            const v = this.view(r);
            const at = this.now();
            for (const s of v.steps) {
                if (s.timerId && this.core.timer) {
                    const t = await this.core.entities.get(s.timerId);
                    if (t)
                        s.actualMs = this.core.timer.elapsed(t.data, at);
                }
            }
            v.actualMin = Math.round(v.steps.reduce((a, s) => a + (s.actualMs || 0), 0) / 60000);
            return v;
        }
        view(r) {
            const at = this.now();
            const steps = r.data.steps.map((s) => ({ ...s, assignee: s.assignee || null, notBefore: s.notBefore || null, blocked: s.status === 'TODO' && this.blocked(r, s),
                ready: s.status === 'TODO' && !this.blocked(r, s) && (!s.notBefore || Date.parse(s.notBefore) <= at), overdue: s.status === 'RUNNING' && s.plannedMin > 0 && at > Date.parse(s.startedAt) + s.plannedMin * 60000 }));
            const total = steps.filter((s) => s.status !== 'SKIPPED').length;
            const done = steps.filter((s) => s.status === 'DONE').length;
            const end = new Map();
            const endOf = (s) => {
                if (end.has(s.id))
                    return end.get(s.id);
                let e;
                if (s.status === 'DONE' || s.status === 'SKIPPED')
                    e = s.doneAt ? Date.parse(s.doneAt) : at;
                else if (s.status === 'RUNNING')
                    e = Math.max(at, Date.parse(s.startedAt) + s.plannedMin * 60000);
                else {
                    const deps = s.dependsOn.map((d) => steps.find((x) => x.id === d)).filter(Boolean);
                    const start = Math.max(at, ...deps.map(endOf), s.notBefore ? Date.parse(s.notBefore) : 0);
                    e = start + s.plannedMin * 60000;
                    s.plannedStart = start;
                }
                end.set(s.id, e);
                return e;
            };
            const segs = [];
            for (const s of steps) {
                const e = endOf(s);
                if (s.status === 'SKIPPED')
                    continue;
                if (s.status === 'TODO')
                    segs.push({ key: s.id, row: s.title, label: `${s.title} · plán ${s.plannedMin} min${s.blocked ? ' · čeká na předchozí' : ''}`, start: s.plannedStart ?? at, end: e, color: 'rgba(127,127,127,.55)', planned: true });
                else
                    segs.push({ key: s.id, row: s.title, label: `${s.title} · ${s.status === 'RUNNING' ? 'běží' : 'hotovo'}`, start: Date.parse(s.startedAt || s.doneAt || this.iso(at)), end: s.status === 'RUNNING' ? at : Date.parse(s.doneAt), planned: false });
            }
            const forecast = steps.length ? Math.max(...steps.map(endOf)) : at;
            return { id: r.id, revision: r.revision, name: r.data.name, description: r.data.description || '', startAt: r.data.startAt || null, dueAt: r.data.dueAt || null, responsible: r.data.responsible || '', status: r.data.status, spaceIds: [...(r.spaceIds || [])], target: r.data.target, templateId: r.data.templateId, ownerApp: r.ownerApp, steps,
                progress: total ? Math.round(done / total * 100) : 0, running: steps.filter((s) => s.status === 'RUNNING').length, plannedMin: steps.filter((s) => s.status !== 'SKIPPED').reduce((a, s) => a + s.plannedMin, 0), forecastEnd: new Date(forecast).toISOString(), segments: segs };
        }
        // N2.2a: "Moje kroky" — open steps assigned to me across processes (ready / running / overdue first)
        async mine(actorId) {
            const out = [];
            for (const v of await this.list({ open: true }, actorId))
                for (const s of v.steps)
                    if (s.assignee === actorId && ['TODO', 'RUNNING'].includes(s.status))
                        out.push({ processId: v.id, process: v.name, stepId: s.id, title: s.title, status: s.status, ready: s.ready, blocked: s.blocked, overdue: s.overdue, plannedMin: s.plannedMin, startedAt: s.startedAt });
            const w = (x) => x.overdue ? 0 : x.status === 'RUNNING' ? 1 : x.ready ? 2 : 3;
            return out.sort((a, b) => w(a) - w(b));
        }
        notificationSource() {
            const svc = this;
            return { ownerApp: 'CORE.PROCESSES', kind: 'CORE', async list(actorId) {
                    const day = new Date(svc.now()).toISOString().slice(0, 10);
                    return (await svc.mine(actorId)).filter((x) => x.ready || x.overdue).map((x) => ({ sourceId: `proc:${x.processId}:${x.stepId}:${x.overdue ? 'over' : 'ready'}`, ownerApp: 'CORE.PROCESSES', subject: x.process,
                        label: x.overdue ? `Krok překročil plán: ${x.title}` : `Krok je připraven: ${x.title}`, kindCode: x.overdue ? 'PROCESS_OVERDUE' : 'PROCESS_READY', dueAt: day, revision: 1 }));
                } };
        }
        async list(input, actorId) {
            const out = [];
            for (const r of await this.core.entities.list()) {
                if (r.type !== TYPE || r.archivedAt)
                    continue;
                if (input?.open && r.data.status === 'DONE')
                    continue;
                if (input?.hub && r.ownerApp !== input.hub)
                    continue;
                if (!await this.can(r, actorId, 'READ'))
                    continue;
                out.push(this.view(r));
            }
            return out.sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE') || String(b.id).localeCompare(String(a.id)));
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.BUILTIN = BUILTIN;
    NS.ProcessService = ProcessService;
    NS.install = (core, options = {}) => {
        if (core.processes)
            throw new Error('Processes already installed');
        if (!core?.entities?.save)
            throw new Error('Processes require Core entities');
        const svc = new ProcessService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.PROCESS.TEMPLATES', 'READ', (p, c) => svc.templatesFor(p?.hub, c.actorId)], ['ACTION.CORE.PROCESS.SPACES', 'READ', (_p, c) => svc.creatableSpaces(c.actorId)], ['ACTION.CORE.PROCESS.CREATE', 'SAFE_WRITE', (p, c) => svc.create(p, c)],
            ['ACTION.CORE.PROCESS.LIST', 'READ', (p, c) => svc.list(p || {}, c.actorId)], ['ACTION.CORE.PROCESS.MINE', 'READ', (_p, c) => svc.mine(c.actorId)], ['ACTION.CORE.PROCESS.ASSIGNABLE', 'READ', (p, c) => svc.assignable(p?.id, c.actorId)], ['ACTION.CORE.PROCESS.GET', 'READ', async (p, c) => { const r = await core.entities.get(p?.id); if (!r || r.type !== 'CORE.PROCESS' || r.archivedAt)
                    throw new Error('PROCESS_NOT_FOUND'); if (await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, c.actorId, 'READ') !== true)
                    throw new Error('Scope denied: READ required'); return svc.viewAsync(r); }],
            ['ACTION.CORE.PROCESS.STEP_ADD', 'SAFE_WRITE', (p, c) => svc.addStep(p, c)], ['ACTION.CORE.PROCESS.STEP_REMOVE', 'SAFE_WRITE', (p, c) => svc.removeStep(p, c)], ['ACTION.CORE.PROCESS.STEP_MOVE', 'SAFE_WRITE', (p, c) => svc.moveStep(p, c)],
            ['ACTION.CORE.PROCESS.STEP_EDIT', 'SAFE_WRITE', (p, c) => svc.editStep(p, c)], ['ACTION.CORE.PROCESS.STEP_START', 'SAFE_WRITE', (p, c) => svc.startStep(p, c)], ['ACTION.CORE.PROCESS.STEP_DONE', 'SAFE_WRITE', (p, c) => svc.finishStep(p, c, 'DONE')],
            ['ACTION.CORE.PROCESS.STEP_SKIP', 'SAFE_WRITE', (p, c) => svc.finishStep(p, c, 'SKIPPED')], ['ACTION.CORE.PROCESS.SAVE_TEMPLATE', 'SAFE_WRITE', (p, c) => svc.saveAsTemplate(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.processes = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.processes;
            throw e;
        }
        // Gantt / progress of processes as insight sources (when insights are installed after us they pick these up via registerSource)
        const reg2 = () => {
            if (!core.insights || core.insights.list().some((s) => s.id === 'process.gantt'))
                return;
            core.insights.registerSource({ id: 'process.gantt', title: 'Pracovní postupy – Gantt', kind: 'SEGMENTS', viz: ['GANTT'], fetch: async (p, a) => ({ segments: (await svc.list({ open: true }, a)).filter((x) => !p.processId || x.id === p.processId).flatMap((x) => x.segments.map((s) => ({ ...s, row: `${x.name} › ${s.row}` }))) }) });
            core.insights.registerSource({ id: 'process.progress', title: 'Pracovní postupy – hotovo %', kind: 'SERIES', viz: ['BAR', 'TABLE'], fetch: async (_p, a) => ({ series: (await svc.list({ open: true }, a)).map((x) => ({ key: x.id, label: x.name, value: x.progress, display: `${x.progress} %` })) }) });
        };
        svc.registerInsights = reg2;
        reg2();
        // notifications may be installed before or after us — whoever comes second registers the source
        try {
            if (core.notifications?.registerSource)
                core.notifications.registerSource(svc.notificationSource());
        }
        catch { }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXProcesses || (KXProcesses = {}));
