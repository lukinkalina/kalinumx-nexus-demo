// N2.5d (user 2026-10-24): 📎 link and assign anything with anything across NEXUS (records, tasks, events, files, contacts, members).
// Built on core relations (no parallel system); both ends must be readable by the actor; a link is a relation record (the other
// record's content is never changed); the same link is never created twice. ASSIGNED_TO with a due date creates a linked task for
// the assignee (→ Můj den + Kalendář). Picker = core search (already skips private / sensitive / gated) + area + members.
var KXLinks;
(function () {
    const OWNER = 'APP.KX.NEXUS';
    const TYPES = ['LINKED', 'ASSIGNED_TO', 'BELONGS_TO', 'USES', 'DOCUMENT_FOR', 'PAYMENT_FOR', 'LENT_TO'];
    const userRef = (id) => `kx://user/${id}`;
    const isUser = (ref) => /^kx:\/\/user\/USER\.[A-Z0-9_]+$/i.test(String(ref || ''));
    function install(core) {
        if (core.links)
            return core.links;
        const RC = (ctx) => ({ ...ctx, appCode: OWNER, permissions: ['CORE.RELATION.CREATE', 'CORE.RELATION.DELETE'], confirmed: true });
        /* an end = {kind,id,ref,title,spaceIds} – only if the actor may read it (inspector refuses gated / private / foreign) */
        async function end(ref, actor) {
            if (isUser(ref)) {
                const id = ref.split('/').pop();
                const u = (await core.memberships.listUsers()).find((x) => x.id === id);
                if (!u)
                    throw new Error('LINK_TARGET_NOT_FOUND');
                return { kind: 'USER', id, ref, title: String(u.displayName || id), spaceIds: [] };
            }
            let target;
            try {
                target = core.routes.resolve(ref).target;
            }
            catch {
                throw new Error('LINK_TARGET_INVALID');
            }
            let snap;
            try {
                snap = await core.inspector.inspect(target, actor);
            }
            catch {
                throw new Error('LINK_NOT_READABLE');
            }
            const rec = snap.task || snap.calendarEvent || snap.entity || snap.file || snap.document || snap.alarm || {};
            return { kind: target.kind, id: target.id, ref: snap.deepLink || ref, title: String(snap.title || target.id), spaceIds: rec.spaceIds || [] };
        }
        const all = async () => core.relations.list();
        /* metadata of a relation is rewritten by delete + create (the relation store keeps no partial update) */
        async function rewrite(r, meta0, ctx) { /* keep WHO and WHEN created the assignment originally */ const meta = { ...meta0, firstCreatedBy: meta0.firstCreatedBy || r.createdBy, firstCreatedAt: meta0.firstCreatedAt || r.createdAt }; await core.actions.invoke('ACTION.CORE.RELATION.DELETE', { id: r.id }, RC(ctx)); return core.actions.invoke('ACTION.CORE.RELATION.CREATE', { sourceType: r.sourceType, sourceId: r.sourceId, targetType: r.targetType, targetId: r.targetId, relationType: r.relationType, code: r.code, ownerApp: r.ownerApp, metadata: meta }, RC(ctx)); }
        async function rebalance(sourceId, ctx) {
            const rows = (await all()).filter((r) => r.relationType === 'ASSIGNED_TO' && r.sourceId === sourceId && String(r.code || '').startsWith('KX.LINK.'));
            if (!rows.length)
                return;
            const items = rows.map((r) => ({ r, share: r.metadata?.share ?? null, shareFixed: r.metadata?.shareFixed === true }));
            if (!items.some((x) => x.shareFixed))
                globalThis.KXShares.equal(items);
            for (const x of items)
                if (x.share !== x.r.metadata?.share || x.shareFixed !== (x.r.metadata?.shareFixed === true))
                    await rewrite(x.r, { ...x.r.metadata, share: x.share, shareFixed: x.shareFixed }, ctx);
        }
        const svc = { TYPES, userRef,
            async link(p, ctx) {
                const type = TYPES.includes(p?.type) ? p.type : 'LINKED';
                const a = await end(String(p?.from || ''), ctx.actorId), b = await end(String(p?.to || ''), ctx.actorId);
                if (a.ref === b.ref)
                    throw new Error('LINK_SELF');
                if (type === 'ASSIGNED_TO' && b.kind !== 'USER' && !(b.kind === 'ENTITY'))
                    throw new Error('LINK_ASSIGN_TO_PERSON');
                const dup = (await all()).find((r) => r.sourceId === a.id && r.targetId === b.id && r.relationType === type);
                if (dup)
                    return { id: dup.id, existing: true };
                const meta = { fromRef: a.ref, toRef: b.ref, fromTitle: a.title, toTitle: b.title, note: String(p?.note || '').slice(0, 300) || undefined, state: 'NEW' };
                /* assignment with a due date → a linked task for the assignee (Můj den + Kalendář) */
                if (type === 'ASSIGNED_TO' && p?.due) {
                    const sp = a.spaceIds.length ? a.spaceIds : [((await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id];
                    const t = await core.actions.invoke('ACTION.CORE.TASK.SAVE', { title: a.title, ownerApp: 'APP.NEXUS', spaceIds: sp, dueAt: new Date(String(p.due)).toISOString(), assigneeIds: b.kind === 'USER' ? [b.id] : [], status: 'TODO', sourceApp: OWNER, sourceEntityType: a.kind, sourceEntityId: a.id }, { ...ctx, permissions: ['CORE.TASK.EDIT'], confirmed: true });
                    meta.taskId = t.id;
                    meta.due = t.dueAt;
                }
                const r = await core.actions.invoke('ACTION.CORE.RELATION.CREATE', { sourceType: a.kind, sourceId: a.id, targetType: b.kind, targetId: b.id, relationType: type, code: `KX.LINK.${type}`, ownerApp: OWNER, metadata: meta }, RC(ctx));
                /* workload: assignees of one record share it – default EQUAL unless someone typed a share */ if (type === 'ASSIGNED_TO')
                    await rebalance(a.id, ctx);
                return { id: r.id, existing: false, taskId: meta.taskId || null };
            },
            async unlink(p, ctx) {
                const r = (await all()).find((x) => x.id === String(p?.id || ''));
                if (!r || !String(r.code || '').startsWith('KX.LINK.'))
                    throw new Error('LINK_NOT_FOUND');
                /* only someone who may read the record it hangs on */ await end(String(r.metadata?.fromRef || ''), ctx.actorId);
                await core.actions.invoke('ACTION.CORE.RELATION.DELETE', { id: r.id }, RC(ctx));
                return true;
            },
            /* links of a record in both directions – only those whose other end the actor may read */
            async list(p, ctx) {
                const me = await end(String(p?.ref || ''), ctx.actorId);
                const out = [], inc = [];
                for (const r of await all()) {
                    if (!String(r.code || '').startsWith('KX.LINK.'))
                        continue;
                    const mine = r.sourceId === me.id, theirs = r.targetId === me.id;
                    if (!mine && !theirs)
                        continue;
                    const otherRef = mine ? r.metadata?.toRef : r.metadata?.fromRef;
                    let o = null;
                    try {
                        o = await end(String(otherRef || ''), ctx.actorId);
                    }
                    catch {
                        continue;
                    }
                    (mine ? out : inc).push({ id: r.id, type: r.relationType, ref: o.ref, kind: o.kind, title: o.title, share: r.metadata?.share ?? null, shareAuto: r.metadata?.shareFixed !== true, due: r.metadata?.due || null, firstCreatedBy: r.metadata?.firstCreatedBy || r.createdBy, firstCreatedAt: r.metadata?.firstCreatedAt || r.createdAt, taskId: r.metadata?.taskId || null, note: r.metadata?.note || null, createdAt: r.createdAt, createdBy: r.createdBy });
                }
                return { linked: out, referencedBy: inc };
            },
            /* the 📎 picker: core search (gated) + members; area filter like smart fields */
            async pick(p, ctx) {
                const q = String(p?.query || '').trim();
                const scope = ['ALL', 'FAMILY', 'COMPANY', 'MINE'].includes(p?.scope) ? p.scope : 'ALL';
                const out = [];
                const sp = new Map();
                for (const s of await core.memberships.listSpaces())
                    sp.set(s.id, s);
                const inScope = (ids) => scope === 'ALL' || !ids?.length || ids.some(id => { const s = sp.get(id); if (!s)
                    return false; if (scope === 'MINE')
                    return s.kind === 'PERSONAL' && s.ownerUserId === ctx.actorId; if (scope === 'COMPANY')
                    return s.kind === 'COMPANY' || String(s.id).startsWith('SPACE.ORG.'); return ['FAMILY', 'HOME', 'SHARED', 'WORKSHOP'].includes(s.kind); });
                if (q) {
                    for (const r of await core.search.search({ text: q, actorId: ctx.actorId, kinds: p?.kinds, limit: 40 })) {
                        if (r.kind === 'ACTION' || r.kind === 'DATA_MAP')
                            continue;
                        if (!inScope(r.spaceIds || []))
                            continue;
                        out.push({ ref: r.deepLink, kind: r.kind, title: r.title, sub: r.breadcrumb || r.subtitle || '', appCode: r.appCode || null });
                    }
                }
                const n = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                for (const u of await core.memberships.listUsers()) {
                    const nm = String(u.displayName || u.id);
                    if (!n || nm.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(n))
                        out.unshift({ ref: userRef(u.id), kind: 'USER', title: nm, sub: 'member' });
                }
                return out.slice(0, Math.min(60, Number(p?.limit) || 30));
            },
            /* workload share of one assignee on a record (task / project / order …) – the others complete (KXShares) */
            async setShare(p, ctx) {
                const me = await end(String(p?.ref || ''), ctx.actorId);
                const rows = (await all()).filter((r) => r.relationType === 'ASSIGNED_TO' && r.sourceId === me.id && String(r.code || '').startsWith('KX.LINK.'));
                const target = rows.find((r) => r.metadata?.toRef === String(p?.to || ''));
                if (!target)
                    throw new Error('LINK_NOT_ASSIGNED');
                const items = rows.map((r) => ({ r, share: r.metadata?.share ?? null, shareFixed: r.metadata?.shareFixed === true }));
                try {
                    globalThis.KXShares.set(items, items.find((x) => x.r === target), p?.share, p?.resetOthers === true);
                }
                catch (e) {
                    throw new Error(String(e?.message || e).replace(/^SHARE_/, 'LINK_SHARE_'));
                }
                for (const x of items)
                    await rewrite(x.r, { ...x.r.metadata, share: x.share, shareFixed: x.shareFixed }, ctx);
                return items.map((x) => ({ to: x.r.metadata?.toRef, title: x.r.metadata?.toTitle, share: x.share, auto: !x.shareFixed }));
            },
            /* workload overview (user: home AND company): per member – assignments, sum of shares (= „how many whole tasks“), by area */
            async workload(p, ctx) {
                const sp = new Map();
                for (const s of await core.memberships.listSpaces())
                    sp.set(s.id, s);
                const by = {};
                for (const r of await all()) {
                    if (r.relationType !== 'ASSIGNED_TO' || !String(r.code || '').startsWith('KX.LINK.') || r.targetType !== 'USER')
                        continue;
                    let a;
                    try {
                        a = await end(String(r.metadata?.fromRef || ''), ctx.actorId);
                    }
                    catch {
                        continue;
                    }
                    if (p?.from && r.metadata?.due && r.metadata.due < p.from)
                        continue;
                    if (p?.to && r.metadata?.due && r.metadata.due > p.to)
                        continue;
                    const area = (a.spaceIds || []).some((id) => { const s = sp.get(id); return s && (s.kind === 'COMPANY' || String(s.id).startsWith('SPACE.ORG.')); }) ? 'COMPANY' : 'HOME';
                    const u = by[r.targetId] || (by[r.targetId] = { userId: r.targetId, items: 0, load: 0, HOME: 0, COMPANY: 0, list: [] });
                    const sh = Number(r.metadata?.share ?? 100) / 100;
                    u.items++;
                    u.load += sh;
                    u[area] += sh;
                    u.list.push({ title: a.title, ref: a.ref, share: Math.round(sh * 10000) / 100, area, due: r.metadata?.due || null });
                }
                return Object.values(by).map((u) => ({ ...u, load: Math.round(u.load * 100) / 100, HOME: Math.round(u.HOME * 100) / 100, COMPANY: Math.round(u.COMPANY * 100) / 100 }));
            },
            /* what is assigned to a member (Můj den) */
            async assignedTo(p, ctx) { const uid = String(p?.userId || ctx.actorId); const rows = []; for (const r of await all()) {
                if (r.relationType !== 'ASSIGNED_TO' || r.targetId !== uid)
                    continue;
                try {
                    const a = await end(String(r.metadata?.fromRef || ''), ctx.actorId);
                    rows.push({ id: r.id, ref: a.ref, title: a.title, due: r.metadata?.due || null, state: r.metadata?.state || 'NEW', share: r.metadata?.share ?? null });
                }
                catch { }
            } return rows; } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.LINK.CREATE', 'SAFE_WRITE', (p, c) => svc.link(p, c));
        reg('ACTION.CORE.LINK.DELETE', 'SAFE_WRITE', (p, c) => svc.unlink(p, c));
        reg('ACTION.CORE.LINK.LIST', 'READ', (p, c) => svc.list(p, c));
        reg('ACTION.CORE.LINK.PICK', 'READ', (p, c) => svc.pick(p, c));
        reg('ACTION.CORE.LINK.SHARE.SET', 'SAFE_WRITE', (p, c) => svc.setShare(p, c));
        reg('ACTION.CORE.LINK.WORKLOAD', 'READ', (p, c) => svc.workload(p, c));
        reg('ACTION.CORE.LINK.ASSIGNED', 'READ', (p, c) => svc.assignedTo(p, c));
        core.links = svc;
        return svc;
    }
    KXLinks = { install, TYPES };
    globalThis.KXLinks = KXLinks;
})();
