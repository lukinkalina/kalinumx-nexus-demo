// N2.3c (R66 b, extended): "↗ Propsat" as a Core function for every hub (KX.CORE_PROPAGATE/1).
//  - SOURCE: a hub record (Core entity), a task, a calendar event – or an inline source (title + spaces + a source
//    record for the relation graph), used by Notes for one line of a page;
//  - TARGETS (several at once, each kind at most once per source): TASK, SHOPPING (shopping item of Jídlo a nákupy),
//    EVENT (1 h calendar event), REMINDER (alarm); created in the SAME spaces as the source, the actor must be allowed
//    to read the source;
//  - every target is recorded in the Core relation graph (REL.CORE.PROPAGATED, PROPAGATED_TO), so the relation panel
//    shows it and LINKS lists the live state (done / time);
//  - SET_DONE: the source marked done / not done → linked task-like targets follow (two-way ticking for any hub).
var KXPropagate;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_PROPAGATE/1', CODE = 'REL.CORE.PROPAGATED', REL = 'PROPAGATED_TO';
    const CORE_KINDS = ['TASK', 'SHOPPING', 'EVENT', 'REMINDER'], HUB_KINDS = ['DEADLINE', 'RECORD', 'STEP', 'NOTE'], KINDS = [...CORE_KINDS, ...HUB_KINDS], ITEM_REL = 'PROPAGATED_TO_ITEM:';
    const TARGET_TYPE = { TASK: 'CORE.TASK', SHOPPING: 'CORE.TASK', EVENT: 'CORE.CALENDAR_EVENT', REMINDER: 'CORE.ALARM' };
    const TXT = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    class PropagateService {
        core;
        internal = 0;
        constructor(core) { this.core = core; }
        /* while propagation itself completes places (incl. nested actions like STEP_START / STEP_DONE), the reverse observer stays quiet */
        async quietly(fn) { this.internal++; try {
            return await fn();
        }
        finally {
            this.internal--;
        } }
        /* ---------- N2.3d (R67 E2): places deeper in the hub tree ---------- */
        domains() { const out = []; for (const k of Object.keys(this.core)) {
            const v = this.core[k];
            if (v && typeof v === 'object' && typeof v.meta === 'function' && typeof v.addItem === 'function') {
                try {
                    out.push({ serviceKey: k, svc: v, meta: v.meta() });
                }
                catch { }
            }
        } return out; }
        domain(serviceKey) { const d = this.domains().find(x => x.serviceKey === serviceKey); if (!d)
            throw new Error('PROPAGATE_HUB_UNKNOWN'); return d; }
        domainByType(type) { return this.domains().find(x => x.meta.type === type) || null; }
        async spaces(actorId) {
            const out = [];
            for (const sp of await this.core.memberships.listSpaces()) {
                if (sp.archivedAt)
                    continue;
                if (sp.kind === 'PERSONAL') {
                    if (sp.ownerUserId === actorId)
                        out.push({ id: sp.id, name: sp.name || TXT('notes.default.space', 'Personal'), kind: sp.kind });
                    continue;
                }
                if (['EDIT', 'MANAGE'].includes(await this.core.memberships.roleFor(sp.id, actorId)))
                    out.push({ id: sp.id, name: sp.name || sp.id, kind: sp.kind });
            }
            return out;
        }
        nameOf(r) { const d = r?.data || r || {}; return String(d.name || d.title || r?.id || ''); }
        /* every place the actor may write to: spaces (= calendars), hubs with records (deadlines / new record), open processes (steps) */
        async places(actorId) {
            const hubs = [];
            for (const d of this.domains()) {
                let rows = [];
                try {
                    rows = await d.svc.list(actorId);
                }
                catch {
                    continue;
                }
                const f = d.meta.subjectFields;
                hubs.push({ serviceKey: d.serviceKey, hub: d.meta.owner, label: d.meta.label, itemKinds: d.meta.itemKinds, required: Object.entries(f).filter(([k, x]) => x.required && k !== 'name').map(([k, x]) => ({ field: k, label: x.label, options: x.options || null })),
                    records: rows.map((r) => ({ id: r.id, name: this.nameOf(r), spaceIds: r.spaceIds || [] })) });
            }
            let processes = [];
            try {
                processes = ((await this.core.processes?.list({ open: true }, actorId)) || []).map((x) => ({ id: x.id, name: x.name }));
            }
            catch { }
            let notes = [];
            try {
                if (this.core.notes?.tree)
                    for (const b of await this.core.notes.tree(actorId))
                        for (const sc of b.sections || [])
                            for (const pg of sc.pages || [])
                                notes.push({ id: pg.id, name: `${b.name} › ${sc.name} › ${pg.title}` });
            }
            catch { }
            return { spaces: await this.spaces(actorId), hubs, processes, notes };
        }
        async targetSpaces(spaceId, fallback, actorId) { if (!spaceId)
            return fallback; const ok = (await this.spaces(actorId)).some((x) => x.id === spaceId); if (!ok)
            throw new Error('Scope denied: EDIT required in the target space'); return [String(spaceId)]; }
        keyOf(t) { const p = t?.place || {}; return String(t?.kind || '') + ':' + String(p.recordId || p.processId || p.pageId || (t?.kind === 'RECORD' ? p.serviceKey : '') || ''); }
        async can(rec, actorId, level) { return await this.core.access.can({ kind: 'ENTITY', id: rec.id, ownerApp: rec.ownerApp, spaceIds: rec.spaceIds || [] }, actorId, level) === true; }
        /* resolve a source record → {type,id,title,ownerApp,spaceIds,status} */
        async source(src, actorId) {
            const kind = String(src?.kind || ''), id = String(src?.id || '');
            let r = null, type = '', title = '';
            if (kind === 'ENTITY') {
                r = await this.core.entities.get(id);
                if (r) {
                    type = r.type;
                    const d = r.data || {};
                    title = String(d.title || d.name || d.label || d.text || r.id);
                }
            }
            else if (kind === 'TASK') {
                r = await this.core.tasks.get(id);
                if (r) {
                    type = 'CORE.TASK';
                    title = r.title;
                }
            }
            else if (kind === 'CALENDAR_EVENT' || kind === 'EVENT') {
                r = await this.core.calendar.get(id);
                if (r) {
                    type = 'CORE.CALENDAR_EVENT';
                    title = r.title;
                }
            }
            /* N2.3f: a deadline of a hub record (ITEM, id record#item) or a process step (STEP, id process#step) is a source too */
            else if (kind === 'ITEM' || kind === 'STEP') {
                const [rid, iid] = id.split('#');
                const rec = await this.core.entities.get(rid);
                if (rec && !rec.archivedAt && iid) {
                    let it = null;
                    if (kind === 'STEP') {
                        if (rec.type === 'CORE.PROCESS')
                            it = (rec.data?.steps || []).find((x) => x.id === iid);
                        if (it) {
                            title = it.title;
                            r = { ...rec, id, status: it.status };
                            type = 'CORE.PROCESS.STEP';
                        }
                    }
                    else {
                        const d = this.domainByType(rec.type);
                        if (d) {
                            it = (rec.data?.[d.meta.itemsKey] || []).find((x) => x.id === iid);
                            if (it) {
                                title = `${this.nameOf(rec)} – ${it.label || d.meta.itemKinds[it.kind] || it.kind}`;
                                r = { ...rec, id, status: it.lastDoneAt ? 'DONE' : 'TODO' };
                                type = d.meta.type + '.ITEM';
                            }
                        }
                    }
                }
                if (r) {
                    const ok = await this.can(rec, actorId, 'READ');
                    if (!ok)
                        throw new Error('Scope denied: READ required');
                    return { kind, type, id, title: String(title).replace(/\s+/g, ' ').trim().slice(0, 200), ownerApp: /^APP\.[A-Z0-9_.]+$/.test(String(rec.ownerApp || '')) ? rec.ownerApp : OWNER, spaceIds: rec.spaceIds || [], status: r.status };
                }
            }
            else
                throw new Error('PROPAGATE_SOURCE_KIND_INVALID');
            if (!r || r.archivedAt || r.deletedAt)
                throw new Error('PROPAGATE_SOURCE_NOT_FOUND');
            if (!await this.can(r, actorId, 'READ'))
                throw new Error('Scope denied: READ required');
            if (this.core.privacy?.isPrivate(r))
                title = TXT('privacy.title', 'Private item'); /* N2.3h: a private record never leaks its name */
            return { kind, type, id: r.id, title: String(title).replace(/\s+/g, ' ').trim().slice(0, 200), ownerApp: /^APP\.[A-Z0-9_.]+$/.test(String(r.ownerApp || '')) ? r.ownerApp : OWNER, spaceIds: r.spaceIds || [], status: r.status };
        }
        async live(rel) {
            const id = rel.targetId;
            if (String(rel.relationType || '').startsWith(ITEM_REL)) {
                const itemId = rel.relationType.slice(ITEM_REL.length);
                if (rel.targetType === 'CORE.NOTE.PAGE') {
                    const pg = await this.core.entities.get(id);
                    if (!pg || pg.archivedAt)
                        return null;
                    let ln = null;
                    for (const b of pg.data?.doc?.blocks || [])
                        for (const it of b.items || [])
                            if (it.id === itemId)
                                ln = { it, todo: b.t === 'todo' };
                    if (!ln)
                        return null;
                    const text = (ln.it.runs || []).map((x) => x.text).join('');
                    return { kind: 'NOTE', id: id + '#' + itemId, key: 'NOTE:' + id, title: text, done: ln.todo ? !!ln.it.checked : null, at: null, address: { hub: TXT('tools.notes', 'Notes'), record: pg.data?.title || id, item: text.slice(0, 60) } };
                }
                if (rel.targetType === 'CORE.PROCESS') {
                    const pr = await this.core.entities.get(id);
                    if (!pr || pr.archivedAt)
                        return null;
                    const st = (pr.data?.steps || []).find((x) => x.id === itemId);
                    if (!st)
                        return null;
                    return { kind: 'STEP', id: id + '#' + itemId, key: 'STEP:' + id, title: st.title, done: st.status === 'DONE', at: null, address: { hub: TXT('propagate.hub.processes', 'Processes'), record: pr.data?.name || id, item: st.title } };
                }
                const d = this.domainByType(rel.targetType);
                if (!d)
                    return null;
                const r = await this.core.entities.get(id);
                if (!r || r.archivedAt)
                    return null;
                const it = (r.data?.[d.meta.itemsKey] || []).find((x) => x.id === itemId);
                if (!it)
                    return null;
                return { kind: 'DEADLINE', id: id + '#' + itemId, key: 'DEADLINE:' + id, title: it.label || d.meta.itemKinds[it.kind] || it.kind, done: !!it.lastDoneAt, at: it.dueAt || null, address: { hub: d.meta.label, record: this.nameOf(r), item: it.label || d.meta.itemKinds[it.kind] } };
            }
            {
                const d = this.domainByType(rel.targetType);
                if (d) {
                    const r = await this.core.entities.get(id);
                    if (!r || r.archivedAt)
                        return null;
                    return { kind: 'RECORD', id, key: 'RECORD:' + d.serviceKey, title: this.nameOf(r), done: null, at: null, address: { hub: d.meta.label, record: this.nameOf(r) } };
                }
            }
            if (rel.targetType === 'CORE.TASK') {
                const t = await this.core.tasks.get(id);
                if (!t || t.archivedAt || t.deletedAt)
                    return null;
                const k = t.itemKind === 'SHOPPING_ITEM' ? 'SHOPPING' : 'TASK';
                return { kind: k, id, key: k + ':', title: t.title, done: t.status === 'DONE', at: t.dueAt || null, address: { space: (t.spaceIds || [])[0] || '' } };
            }
            if (rel.targetType === 'CORE.CALENDAR_EVENT') {
                const e = await this.core.calendar.get(id);
                if (!e || e.archivedAt || e.deletedAt)
                    return null;
                return { kind: 'EVENT', id, key: 'EVENT:', title: e.title, done: null, at: e.startsAt, address: { space: (e.spaceIds || [])[0] || '' } };
            }
            if (rel.targetType === 'CORE.ALARM') {
                const a = await this.core.alarms.get(id);
                if (!a || a.archivedAt || a.deletedAt)
                    return null;
                return { kind: 'REMINDER', id, key: 'REMINDER:', title: a.title, done: null, at: a.triggerAt, address: { space: (a.spaceIds || [])[0] || '' } };
            }
            return null;
        }
        async links(sourceId) { const out = []; for (const rel of (await this.core.relations.forEntity(String(sourceId || ''))).filter((x) => x.code === CODE && x.sourceId === sourceId)) {
            const l = await this.live(rel);
            if (l)
                out.push({ ...l, relationId: rel.id });
        } return out; }
        /* create one target; used directly by Notes (inline source = one line of a page) */
        async createTarget(input, ctx) {
            const kind = String(input.kind || '');
            if (!KINDS.includes(kind))
                throw new Error('PROPAGATE_KIND_INVALID');
            const title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            if (!title)
                throw new Error('PROPAGATE_TITLE_EMPTY');
            const at = input.at ? new Date(input.at) : null;
            if (at && !Number.isFinite(at.getTime()))
                throw new Error('PROPAGATE_TIME_INVALID');
            if ((kind === 'EVENT' || kind === 'REMINDER' || kind === 'DEADLINE') && !at)
                throw new Error('PROPAGATE_TIME_REQUIRED');
            const spaceIds = await this.targetSpaces(input.spaceId, input.spaceIds, ctx.actorId), ownerApp = input.ownerApp || OWNER;
            let rec;
            const P = input.place || {};
            if (kind === 'DEADLINE') {
                const d = this.domain(String(P.serviceKey || ''));
                const r = await this.core.entities.get(String(P.recordId || ''));
                if (!r || r.type !== d.meta.type || r.archivedAt)
                    throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                const ik = d.meta.itemKinds[P.itemKind] ? P.itemKind : ('OTHER' in d.meta.itemKinds ? 'OTHER' : Object.keys(d.meta.itemKinds)[0]);
                const loc = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                await d.svc.addItem({ id: r.id, expectedRevision: r.revision, [d.meta.itemPayloadKey]: { kind: ik, label: title, dueAt: loc } }, ctx);
                const after = await this.core.entities.get(r.id);
                const list = after.data[d.meta.itemsKey] || [];
                const item = list[list.length - 1];
                await this.core.relations.create({ code: CODE, sourceType: input.source.type, sourceId: input.source.id, targetType: d.meta.type, targetId: r.id, relationType: ITEM_REL + item.id, ownerApp: OWNER }, ctx);
                return { kind, id: r.id + '#' + item.id };
            }
            if (kind === 'NOTE') {
                if (!this.core.notes?.appendLine)
                    throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                const line = await this.core.notes.appendLine({ pageId: String(P.pageId || ''), text: title, checked: !!input.done }, ctx);
                await this.core.relations.create({ code: CODE, sourceType: input.source.type, sourceId: input.source.id, targetType: 'CORE.NOTE.PAGE', targetId: line.pageId, relationType: ITEM_REL + line.itemId, ownerApp: OWNER }, ctx);
                return { kind, id: line.pageId + '#' + line.itemId };
            }
            if (kind === 'STEP') {
                if (!this.core.processes)
                    throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                const pr = await this.core.entities.get(String(P.processId || ''));
                if (!pr || pr.type !== 'CORE.PROCESS' || pr.archivedAt)
                    throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                const before = new Set((pr.data.steps || []).map((x) => x.id));
                await this.core.processes.addStep({ id: pr.id, title }, ctx);
                const after = await this.core.entities.get(pr.id);
                const st = (after.data.steps || []).find((x) => !before.has(x.id));
                await this.core.relations.create({ code: CODE, sourceType: input.source.type, sourceId: input.source.id, targetType: 'CORE.PROCESS', targetId: pr.id, relationType: ITEM_REL + st.id, ownerApp: OWNER }, ctx);
                return { kind, id: pr.id + '#' + st.id };
            }
            if (kind === 'RECORD') {
                const d = this.domain(String(P.serviceKey || ''));
                const fields = { name: title };
                for (const [k, f] of Object.entries(d.meta.subjectFields)) {
                    if (k === 'name' || !f.required)
                        continue;
                    const v = P.fields?.[k];
                    fields[k] = f.options && v in f.options ? v : (f.options && 'OTHER' in f.options ? 'OTHER' : f.options ? Object.keys(f.options)[0] : v);
                    if (fields[k] == null)
                        throw new Error('PROPAGATE_FIELD_REQUIRED: ' + k);
                }
                const nr = await d.svc.create({ ...fields, spaceIds }, ctx);
                await this.core.relations.create({ code: CODE, sourceType: input.source.type, sourceId: input.source.id, targetType: d.meta.type, targetId: nr.id, relationType: REL, ownerApp: OWNER }, ctx);
                return { kind, id: nr.id };
            }
            if (kind === 'TASK')
                rec = await this.core.tasks.save({ title, ownerApp, spaceIds, status: input.done ? 'DONE' : 'TODO', ...(at ? { dueAt: at.toISOString() } : {}) }, ctx);
            else if (kind === 'SHOPPING')
                rec = await this.core.tasks.save({ title, ownerApp: 'APP.KX.FOOD', itemKind: 'SHOPPING_ITEM', spaceIds, status: input.done ? 'DONE' : 'TODO' }, ctx);
            else if (kind === 'EVENT')
                rec = await this.core.calendar.save({ title, ownerApp, spaceIds, startsAt: at.toISOString(), endsAt: new Date(at.getTime() + 3600000).toISOString() }, ctx);
            else
                rec = await this.core.alarms.save({ title, ownerApp, spaceIds, triggerAt: at.toISOString(), channels: ['IN_APP'] }, ctx);
            await this.core.relations.create({ code: CODE, sourceType: input.source.type, sourceId: input.source.id, targetType: TARGET_TYPE[kind], targetId: rec.id, relationType: REL, ownerApp: OWNER }, ctx);
            return { kind, id: rec.id };
        }
        /* "↗ Propsat" for any record: several targets at once, each kind at most once per source */
        async propagate(input, ctx) {
            const src = await this.source(input?.source, ctx.actorId);
            const raw = Array.isArray(input?.targets) ? input.targets : [];
            if (!raw.length || raw.length > 4)
                throw new Error('PROPAGATE_TARGETS_INVALID');
            const kinds = raw.map((t) => String(t?.kind || ''));
            if (kinds.some((k) => !KINDS.includes(k)))
                throw new Error('PROPAGATE_KIND_INVALID');
            const keys = raw.map((t) => this.keyOf(t));
            if (new Set(keys).size !== keys.length)
                throw new Error('PROPAGATE_DUPLICATE_KIND');
            if (kinds.some((k) => (k === 'TASK' && src.kind === 'TASK') || (k === 'EVENT' && src.type === 'CORE.CALENDAR_EVENT')))
                throw new Error('PROPAGATE_SAME_KIND');
            const existing = new Set((await this.links(src.id)).map((l) => l.key));
            const dupT = raw.find((t) => existing.has(this.keyOf(t)));
            if (dupT)
                throw new Error('PROPAGATE_ALREADY_LINKED: ' + dupT.kind);
            for (const t of raw) {
                if ((t.kind === 'EVENT' || t.kind === 'REMINDER' || t.kind === 'DEADLINE') && !t.at)
                    throw new Error('PROPAGATE_TIME_REQUIRED');
                if (t.spaceId)
                    await this.targetSpaces(t.spaceId, [], ctx.actorId);
                if (t.kind === 'DEADLINE' || t.kind === 'RECORD') {
                    const d = this.domain(String(t.place?.serviceKey || ''));
                    if (t.kind === 'DEADLINE') {
                        const r = await this.core.entities.get(String(t.place?.recordId || ''));
                        if (!r || r.type !== d.meta.type || r.archivedAt || !await this.can(r, ctx.actorId, 'EDIT'))
                            throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                    }
                }
                if (t.kind === 'NOTE') {
                    const pg = await this.core.entities.get(String(t.place?.pageId || ''));
                    if (!pg || pg.type !== 'CORE.NOTE.PAGE' || pg.archivedAt || !await this.can(pg, ctx.actorId, 'EDIT'))
                        throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                }
                if (t.kind === 'STEP') {
                    const pr = await this.core.entities.get(String(t.place?.processId || ''));
                    if (!pr || pr.type !== 'CORE.PROCESS' || pr.archivedAt || !await this.can(pr, ctx.actorId, 'EDIT'))
                        throw new Error('PROPAGATE_PLACE_NOT_FOUND');
                }
            } /* all checks before the first write */
            const title = String(input?.title || src.title);
            const created = [];
            for (const t of raw)
                created.push(await this.createTarget({ kind: t.kind, title, spaceIds: src.spaceIds, ownerApp: src.ownerApp, at: t.at || null, done: src.status === 'DONE', source: { type: src.type, id: src.id }, place: t.place, spaceId: t.spaceId }, ctx));
            return { source: { kind: src.kind, id: src.id }, created, links: await this.links(src.id) };
        }
        /* done state of a deadline / step link (Notes pull), null when unknown */
        async itemDone(link) {
            const [rid, iid] = String(link?.id || '').split('#');
            if (!iid)
                return null;
            const r = await this.core.entities.get(rid);
            if (!r || r.archivedAt)
                return null;
            if (link.kind === 'STEP') {
                const st = (r.data?.steps || []).find((x) => x.id === iid);
                return st ? st.status === 'DONE' : null;
            }
            const d = this.domainByType(r.type);
            if (!d)
                return null;
            const it = (r.data?.[d.meta.itemsKey] || []).find((x) => x.id === iid);
            return it ? !!it.lastDoneAt : null;
        }
        /* complete a propagated deadline / process step (used by SET_DONE and by Notes ticking) */
        async completeItem(link, ctx) { return this.quietly(() => this.completeItemRaw(link, ctx)); }
        async completeItemRaw(link, ctx) {
            const [rid, iid] = String(link.id).split('#');
            if (link.kind === 'NOTE') {
                await this.core.notes.setLineChecked({ pageId: rid, itemId: iid, checked: true }, ctx);
                return;
            }
            if (link.kind === 'STEP') { /* a step is done only from RUNNING (it has its own stopwatch): start it first – the same dependency checks as a manual start */
                const pr = await this.core.entities.get(rid);
                const st = (pr?.data?.steps || []).find((x) => x.id === iid);
                if (st && st.status === 'TODO')
                    await this.core.actions.invoke('ACTION.CORE.PROCESS.STEP_START', { id: rid, stepId: iid }, ctx);
                await this.core.actions.invoke('ACTION.CORE.PROCESS.STEP_DONE', { id: rid, stepId: iid }, ctx);
                return;
            }
            const r = await this.core.entities.get(rid);
            const d = r && this.domainByType(r.type);
            if (!d)
                throw new Error('PROPAGATE_PLACE_NOT_FOUND');
            await d.svc.completeItem({ id: rid, expectedRevision: r.revision, [d.meta.itemIdKey]: iid }, ctx);
        }
        /* N2.3e (R68): propagations whose place no longer exists (deleted / archived) – the source must be readable */
        async sourceRow(type, id) { if (type === 'CORE.TASK')
            return this.core.tasks.get(id); if (type === 'CORE.CALENDAR_EVENT')
            return this.core.calendar.get(id); return this.core.entities.get(id); }
        kindOfRel(rel) { const it = String(rel.relationType || '').startsWith(ITEM_REL); if (rel.targetType === 'CORE.NOTE.PAGE')
            return 'NOTE'; if (rel.targetType === 'CORE.PROCESS')
            return 'STEP'; if (it)
            return 'DEADLINE'; if (rel.targetType === 'CORE.ALARM')
            return 'REMINDER'; if (rel.targetType === 'CORE.CALENDAR_EVENT')
            return 'EVENT'; if (rel.targetType === 'CORE.TASK')
            return 'TASK'; return 'RECORD'; }
        async broken(actorId) {
            const out = [];
            for (const rel of (await this.core.relations.list()).filter((x) => x.code === CODE)) {
                const src = await this.sourceRow(rel.sourceType, rel.sourceId);
                if (!src || src.archivedAt || src.deletedAt)
                    continue;
                if (!await this.can(src, actorId, 'READ'))
                    continue;
                if (await this.live(rel))
                    continue;
                const kind = rel.sourceType === 'CORE.TASK' ? 'TASK' : rel.sourceType === 'CORE.CALENDAR_EVENT' ? 'CALENDAR_EVENT' : 'ENTITY';
                out.push({ relationId: rel.id, kind: this.kindOfRel(rel), source: { kind, id: src.id, type: rel.sourceType }, sourceTitle: String(src.title || src.data?.title || src.data?.name || src.id) });
            }
            return out;
        }
        async unlink(input, ctx) {
            const rel = await this.core.relations.get(String(input?.relationId || ''));
            if (!rel || rel.code !== CODE)
                throw new Error('PROPAGATE_LINK_NOT_FOUND');
            const src = await this.sourceRow(rel.sourceType, rel.sourceId);
            if (!src || !await this.can(src, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            await this.core.relations.remove(rel.id, ctx);
            if (rel.sourceType === 'CORE.NOTE.PAGE' && this.core.notes?.dropLinks)
                await this.core.notes.dropLinks(rel.sourceId, String(rel.relationType).startsWith(ITEM_REL) ? rel.targetId + '#' + String(rel.relationType).slice(ITEM_REL.length) : rel.targetId, ctx);
            return { unlinked: rel.id };
        }
        /* ---------- N2.3g: automatic reverse "done" – a place done anywhere → its source done → the other places done ---------- */
        async placeDone(place, ctx) { return this.quietly(() => this.placeDoneRaw(place, ctx)); }
        async placeDoneRaw(place, ctx) {
            let n = 0;
            const rels = (await this.core.relations.list()).filter((r) => r.code === CODE && r.targetId === place.id && (place.itemId ? r.relationType === ITEM_REL + place.itemId : !String(r.relationType).startsWith(ITEM_REL)));
            for (const rel of rels) {
                const targetKey = place.itemId ? place.id + '#' + place.itemId : place.id;
                if (rel.sourceType === 'CORE.NOTE.PAGE') { /* a note line is the source: tick it and complete the line's other places */
                    if (!this.core.notes)
                        continue;
                    const pg = await this.core.entities.get(rel.sourceId);
                    if (!pg || pg.archivedAt)
                        continue;
                    for (const b of pg.data?.doc?.blocks || [])
                        if (b.t === 'todo')
                            for (const it of b.items || []) {
                                if (!(it.links || []).some((l) => l.id === targetKey))
                                    continue;
                                if (!it.checked) {
                                    await this.core.notes.setLineChecked({ pageId: pg.id, itemId: it.id, checked: true }, ctx);
                                    n++;
                                }
                                for (const l of it.links || []) {
                                    if (l.id === targetKey)
                                        continue;
                                    if (['TASK', 'SHOPPING'].includes(l.kind)) {
                                        const tk = await this.core.tasks.get(l.id);
                                        if (tk && !tk.archivedAt && tk.status !== 'DONE') {
                                            await this.core.tasks.complete(tk.id, ctx);
                                            n++;
                                        }
                                    }
                                    else if (['DEADLINE', 'STEP'].includes(l.kind) && await this.itemDone(l) === false) {
                                        await this.completeItem(l, ctx);
                                        n++;
                                    }
                                }
                            }
                    continue;
                }
                const kind = rel.sourceType === 'CORE.TASK' ? 'TASK' : rel.sourceType === 'CORE.PROCESS.STEP' ? 'STEP' : String(rel.sourceType).endsWith('.ITEM') ? 'ITEM' : null;
                if (!kind)
                    continue; /* a hub record / event has no done state */
                let src;
                try {
                    src = await this.source({ kind, id: rel.sourceId }, ctx.actorId);
                }
                catch {
                    continue;
                }
                if (src.status !== 'DONE') {
                    if (kind === 'TASK')
                        await this.core.tasks.complete(rel.sourceId, ctx);
                    else
                        await this.completeItem({ kind: kind === 'ITEM' ? 'DEADLINE' : 'STEP', id: rel.sourceId }, ctx);
                    n++;
                }
                for (const l of await this.links(rel.sourceId)) {
                    if (l.id === targetKey || l.done !== false)
                        continue;
                    if (['TASK', 'SHOPPING'].includes(l.kind)) {
                        await this.core.tasks.complete(l.id, ctx);
                        n++;
                    }
                    else {
                        await this.completeItem(l, ctx);
                        n++;
                    }
                }
            }
            return { changed: n };
        }
        async setDone(input, ctx) {
            const src = await this.source(input?.source, ctx.actorId);
            if (!await this.can({ ...src, id: String(src.id).split('#')[0] }, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            const done = input?.done === true;
            let changed = 0;
            for (const l of await this.links(src.id)) {
                if (l.done === null || l.done === done)
                    continue;
                if (l.kind === 'DEADLINE' || l.kind === 'STEP' || l.kind === 'NOTE') {
                    if (done) {
                        await this.completeItem(l, ctx);
                        changed++;
                    }
                    else if (l.kind === 'NOTE') {
                        const [pid, iid] = String(l.id).split('#');
                        await this.core.notes.setLineChecked({ pageId: pid, itemId: iid, checked: false }, ctx);
                        changed++;
                    }
                    continue;
                }
                const t = await this.core.tasks.get(l.id);
                if (done)
                    await this.core.tasks.complete(t.id, ctx);
                else
                    await this.core.tasks.save({ id: t.id, title: t.title, ownerApp: t.ownerApp, spaceIds: t.spaceIds, status: 'TODO', ...(t.itemKind ? { itemKind: t.itemKind } : {}) }, ctx);
                changed++;
            }
            return { changed, links: await this.links(src.id) };
        }
    }
    /* which actions finish a place: task complete / save DONE, deadline complete in any hub, process step done, note line ticked */
    NS.reverseObserver = (core, svc) => async (def, p, res, ctx) => {
        if (svc.internal > 0)
            return;
        const c = def.code;
        if (c === 'ACTION.CORE.TASK.COMPLETE' && p?.id) {
            await svc.placeDone({ type: 'CORE.TASK', id: String(p.id) }, ctx);
            return;
        }
        if (c === 'ACTION.CORE.TASK.SAVE' && res?.status === 'DONE' && res?.id) {
            await svc.placeDone({ type: 'CORE.TASK', id: res.id }, ctx);
            return;
        }
        if (c === 'ACTION.CORE.PROCESS.STEP_DONE' && p?.id && p?.stepId) {
            await svc.placeDone({ type: 'CORE.PROCESS', id: String(p.id), itemId: String(p.stepId) }, ctx);
            return;
        }
        if (/^ACTION\.[A-Z][A-Z0-9_]*\.DEADLINE\.COMPLETE$/.test(c) && p?.id) { /* N2.3i: digits allowed (PRINT3D_PRINTER) */
            const r = await core.entities.get(String(p.id));
            const d = r && svc.domains().find((x) => x.meta.type === r.type);
            const iid = d && p[d.meta.itemIdKey];
            if (iid)
                await svc.placeDone({ type: r.type, id: r.id, itemId: String(iid) }, ctx);
            return;
        }
        if (c === 'ACTION.CORE.NOTES.PAGE_SAVE' && p?.id && p?.doc) {
            for (const b of p.doc.blocks || [])
                if (b.t === 'todo')
                    for (const it of b.items || [])
                        if (it.checked && it.id)
                            await svc.placeDone({ type: 'CORE.NOTE.PAGE', id: String(p.id), itemId: String(it.id) }, ctx);
        }
    };
    NS.CONTRACT = CONTRACT;
    NS.KINDS = KINDS;
    NS.CORE_KINDS = CORE_KINDS;
    NS.HUB_KINDS = HUB_KINDS;
    NS.CODE = CODE;
    NS.PropagateService = PropagateService;
    NS.install = (core) => {
        if (core.propagate)
            throw new Error('Propagate already installed');
        if (!core?.relations?.create)
            throw new Error('Propagate requires Core relations');
        const svc = new PropagateService(core);
        const reg = [];
        const defs = [['ACTION.CORE.PROPAGATE.CREATE', 'SAFE_WRITE', (p, c) => svc.propagate(p, c)],
            ['ACTION.CORE.PROPAGATE.UNLINK', 'SAFE_WRITE', (p, c) => svc.unlink(p, c)], ['ACTION.CORE.PROPAGATE.PLACES', 'READ', (_p, c) => svc.places(c.actorId)], ['ACTION.CORE.PROPAGATE.LINKS', 'READ', async (p, c) => { const s = await svc.source(p?.source, c.actorId); return svc.links(s.id); }], ['ACTION.CORE.PROPAGATE.SET_DONE', 'SAFE_WRITE', (p, c) => svc.setDone(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.propagate = svc;
            if (typeof core.actions.observe === 'function' && !core.actions.observerIds?.().includes('propagate.reverse-done'))
                core.actions.observe('propagate.reverse-done', NS.reverseObserver(core, svc));
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.propagate;
            throw e;
        }
        return svc;
    };
})(KXPropagate || (KXPropagate = {}));
