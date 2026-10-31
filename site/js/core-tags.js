// N2.5d (user 2026-10-24): one set of tags for the whole NEXUS – a tag is a core record (name, colour, icon, description, area);
// tagging = a core relation TAGGED (record → tag) – hub data are never changed. Only readable records / tags; no two tags with the
// same name in one area; catalogue with usage per hub, unused, similar (merge suggestions); merge moves the relations.
var KXTags;
(function () {
    const OWNER = 'APP.KX.NEXUS', T = 'CORE.TAG', REL = 'KX.TAG';
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2', '#dc2626', '#4b5563'];
    /* N2.5d (user – a colour-blind son): colour is NEVER the only difference – every tag has its own SYMBOL; a new tag gets the first
       symbol no other tag uses (shapes first, then emoji); the user can change it */
    /* graphic line icons in the NEXUS UI style (24×24 stroke, round caps) – user: no DOS-like text symbols */
    const ICONS = { 'star': 'M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6L12 16.2l-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z', 'heart': 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', 'home': 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6', 'car': 'M3 16v-4l2-5h14l2 5v4zM3 16v2h3v-2M18 16v2h3v-2M7 13h.01M17 13h.01', 'bike': 'M3 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0M6 17l4-7h5l3 7M10 10l2 7M14 6h3', 'ball': 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M3.5 9h17M3.5 15h17M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', 'school': 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6', 'tree': 'M12 3l6 8h-3l4 6H5l4-6H6zM12 17v4', 'leaf': 'M5 19C5 9 11 5 20 4c-1 9-5 15-15 15zM5 19l8-8', 'paw': 'M8 15c0-2 2-3 4-3s4 1 4 3-2 4-4 4-4-2-4-4zM4.5 10a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M8.5 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M12.5 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M16.5 10a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0', 'dumbbell': 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12', 'glove': 'M7 10V6a3 3 0 0 1 6 0v1a3 3 0 0 1 4 3v4a6 6 0 0 1-6 6H9a2 2 0 0 1-2-2zM7 14H5v-3h2', 'briefcase': 'M3 8h18v11H3zM9 8V5h6v3M3 13h18', 'cart': 'M3 4h2l2 11h11l2-8H6M8.5 20a1 1 0 1 0 1 0M16.5 20a1 1 0 1 0 1 0', 'wrench': 'M14.5 6.5a4 4 0 0 0 5 5l-9.5 9.5-3-3 9.5-9.5a4 4 0 0 0-2-2z', 'laser': 'M4 20l8-8M14 10l2-2M18 6l2-2M12 4v3M20 12h-3M6 6l2 2', 'coin': 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M15 9h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9M12 7v2M12 15v2', 'flag': 'M5 21V4M5 4h11l-2 4 2 4H5', 'bookmark': 'M6 3h12v18l-6-4-6 4z', 'bell': 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0', 'gift': 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0', 'camera': 'M4 8h4l2-2h4l2 2h4v11H4zM8.5 13.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0', 'music': 'M9 18V5l11-2v13M3 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0M14 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0', 'plane': 'M2 13l20-8-6 16-4-6-6-2zM12 15l4-6', 'phone': 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z', 'cake': 'M4 12h16v8H4zM4 16c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1M12 12V8M12 5v.01', 'shield': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'bolt': 'M13 2L4 14h7l-1 8 9-12h-7z', 'book': 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7', 'palette': 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5S13 18 13 17s.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M9.5 7.5h.01M14.5 7.5h.01', 'tag': 'M3 12V4h8l10 10-8 8zM7 8h.01' };
    const SYMBOLS = Object.keys(ICONS);
    const iconSvg = (code, size = 14) => { const d = ICONS[code]; return d ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>` : ''; };
    function close(a, b) { if (!a || !b || a === b)
        return false; if (a.startsWith(b) || b.startsWith(a))
        return Math.min(a.length, b.length) >= 3; let d = 0, i = 0, j = 0; while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i++;
            j++;
            continue;
        }
        if (++d > 1)
            return false;
        if (a.length > b.length)
            i++;
        else if (b.length > a.length)
            j++;
        else {
            i++;
            j++;
        }
    } return d + (a.length - i) + (b.length - j) <= 1; }
    function install(core) {
        if (core.tags)
            return core.tags;
        const RC = (ctx) => ({ ...ctx, appCode: OWNER, permissions: ['CORE.RELATION.CREATE', 'CORE.RELATION.DELETE'], confirmed: true });
        const readableRow = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const target = async (ref, actor) => {
            let t;
            try {
                t = core.routes.resolve(String(ref || '')).target;
            }
            catch {
                throw new Error('TAG_TARGET_INVALID');
            }
            let snap;
            try {
                snap = await core.inspector.inspect(t, actor);
            }
            catch {
                throw new Error('TAG_NOT_READABLE');
            }
            const rec = snap.task || snap.calendarEvent || snap.entity || snap.file || snap.document || snap.alarm || {};
            return { kind: t.kind, id: t.id, ref: snap.deepLink || ref, title: String(snap.title || t.id), ownerApp: rec.ownerApp || snap.app?.code || null };
        };
        const tagsOf = async (actor) => { const out = []; for (const r of await core.entities.list()) {
            if (r.type !== T || r.archivedAt)
                continue;
            if (await readableRow(r, actor))
                out.push(r);
        } return out; };
        const view = (r) => ({ id: r.id, ref: core.deepLinks.build({ kind: 'ENTITY', id: r.id }), name: String(r.data?.name || ''), color: r.data?.color || COLORS[0], icon: ICONS[r.data?.icon] ? r.data.icon : 'tag', description: r.data?.description || '', spaceIds: r.spaceIds });
        const rels = async () => (await core.relations.list()).filter((x) => x.code === REL);
        const svc = { norm, COLORS, SYMBOLS,
            async ensure(p, ctx) {
                const name = String(p?.name || '').trim().slice(0, 40);
                if (!name)
                    throw new Error('TAG_NAME_REQUIRED');
                const tags = await tagsOf(ctx.actorId);
                const hit = tags.find((x) => norm(x.data?.name) === norm(name));
                if (hit)
                    return view(hit);
                const sp = p?.spaceId || ((await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === (p?.scope === 'MINE' ? 'PERSONAL' : p?.scope === 'COMPANY' ? 'COMPANY' : 'FAMILY')) || (await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id;
                const used = new Set(tags.map((x) => String(x.data?.icon || '')));
                const icon = (ICONS[String(p?.icon || '')] ? String(p.icon) : '') || SYMBOLS.find(x => !used.has(x)) || SYMBOLS[tags.length % SYMBOLS.length];
                const r = await core.entities.save({ type: T, ownerApp: OWNER, schema: 'KX.TAG/1', spaceIds: [sp], data: { name, color: p?.color || COLORS[tags.length % COLORS.length], icon, description: String(p?.description || '').slice(0, 200) } }, { ...ctx, appCode: OWNER });
                return view(r);
            },
            async tag(p, ctx) {
                const t = await target(p?.ref, ctx.actorId);
                const tg = p?.tagId ? view(await (async () => { const r = await core.entities.get(String(p.tagId)); if (!r || r.type !== T || !await readableRow(r, ctx.actorId))
                    throw new Error('TAG_NOT_FOUND'); return r; })()) : await svc.ensure(p, ctx);
                const dup = (await rels()).find((x) => x.sourceId === t.id && x.targetId === tg.id);
                if (dup)
                    return { tag: tg, existing: true };
                await core.actions.invoke('ACTION.CORE.RELATION.CREATE', { sourceType: t.kind, sourceId: t.id, targetType: 'ENTITY', targetId: tg.id, relationType: 'TAGGED', code: REL, ownerApp: OWNER, metadata: { ref: t.ref, title: t.title, ownerApp: t.ownerApp } }, RC(ctx));
                return { tag: tg, existing: false };
            },
            async untag(p, ctx) { const t = await target(p?.ref, ctx.actorId); const r = (await rels()).find((x) => x.sourceId === t.id && x.targetId === String(p?.tagId || '')); if (!r)
                return false; await core.actions.invoke('ACTION.CORE.RELATION.DELETE', { id: r.id }, RC(ctx)); return true; },
            async of(p, ctx) { const t = await target(p?.ref, ctx.actorId); const tags = new Map((await tagsOf(ctx.actorId)).map((x) => [x.id, x])); return (await rels()).filter((x) => x.sourceId === t.id && tags.has(x.targetId)).map((x) => view(tags.get(x.targetId))); },
            /* catalogue: every readable tag, usage per hub (only readable records count), unused, similar names */
            async catalog(_p, ctx) {
                const tags = await tagsOf(ctx.actorId);
                const R = await rels();
                const out = [];
                for (const tg of tags) {
                    const by = {};
                    let n = 0;
                    for (const x of R) {
                        if (x.targetId !== tg.id)
                            continue;
                        const row = await core.entities.get(x.sourceId).catch(() => null);
                        if (row ? (!row.archivedAt && await readableRow(row, ctx.actorId)) : false) {
                            const h = String(row.ownerApp || '');
                            by[h] = (by[h] || 0) + 1;
                            n++;
                        }
                        else if (!row) {
                            try {
                                await target(x.metadata?.ref, ctx.actorId);
                                const h = String(x.metadata?.ownerApp || '');
                                by[h] = (by[h] || 0) + 1;
                                n++;
                            }
                            catch { }
                        }
                    }
                    out.push({ ...view(tg), count: n, byHub: by, unused: n === 0 });
                }
                const similar = [];
                for (let i = 0; i < out.length; i++)
                    for (let j = i + 1; j < out.length; j++)
                        if (close(norm(out[i].name), norm(out[j].name)))
                            similar.push({ a: out[i].id, b: out[j].id, aName: out[i].name, bName: out[j].name });
                return { tags: out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'cs')), similar };
            },
            async records(p, ctx) { const out = []; for (const x of await rels()) {
                if (x.targetId !== String(p?.tagId || ''))
                    continue;
                try {
                    const t = await target(x.metadata?.ref, ctx.actorId);
                    out.push(t);
                }
                catch { }
            } return out; },
            async update(p, ctx) {
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || r.type !== T || !await readableRow(r, ctx.actorId))
                    throw new Error('TAG_NOT_FOUND');
                const name = p?.name != null ? String(p.name).trim().slice(0, 40) : r.data.name;
                if (norm(name) !== norm(r.data.name)) {
                    const clash = (await tagsOf(ctx.actorId)).find((x) => x.id !== r.id && norm(x.data?.name) === norm(name));
                    if (clash)
                        throw new Error(`TAG_NAME_TAKEN ${clash.data.name}`);
                }
                const saved = await core.entities.save({ ...r, data: { ...r.data, name, color: p?.color || r.data.color, icon: ICONS[String(p?.icon || '')] ? String(p.icon) : (ICONS[r.data.icon] ? r.data.icon : 'tag'), description: p?.description != null ? String(p.description).slice(0, 200) : r.data.description }, expectedRevision: r.revision }, { ...ctx, appCode: OWNER });
                return view(saved);
            },
            /* merge: the relations of DROP move to KEEP (no duplicates), DROP archived */
            async merge(p, ctx) {
                const K = await core.entities.get(String(p?.keepId || '')), D = await core.entities.get(String(p?.dropId || ''));
                if (!K || !D || K.type !== T || D.type !== T || K.id === D.id || !await readableRow(K, ctx.actorId) || !await readableRow(D, ctx.actorId))
                    throw new Error('TAG_NOT_FOUND');
                const R = await rels();
                let moved = 0;
                for (const x of R.filter((r) => r.targetId === D.id)) {
                    if (!R.some((r) => r.targetId === K.id && r.sourceId === x.sourceId))
                        await core.actions.invoke('ACTION.CORE.RELATION.CREATE', { sourceType: x.sourceType, sourceId: x.sourceId, targetType: 'ENTITY', targetId: K.id, relationType: 'TAGGED', code: REL, ownerApp: OWNER, metadata: x.metadata }, RC(ctx));
                    await core.actions.invoke('ACTION.CORE.RELATION.DELETE', { id: x.id }, RC(ctx));
                    moved++;
                }
                await core.entities.save({ ...D, archivedAt: new Date().toISOString(), expectedRevision: D.revision }, { ...ctx, appCode: OWNER });
                return { moved, kept: view(K) };
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.TAG.ENSURE', 'SAFE_WRITE', (p, c) => svc.ensure(p, c));
        reg('ACTION.CORE.TAG.ADD', 'SAFE_WRITE', (p, c) => svc.tag(p, c));
        reg('ACTION.CORE.TAG.REMOVE', 'SAFE_WRITE', (p, c) => svc.untag(p, c));
        reg('ACTION.CORE.TAG.OF', 'READ', (p, c) => svc.of(p, c));
        reg('ACTION.CORE.TAG.CATALOG', 'READ', (p, c) => svc.catalog(p, c));
        reg('ACTION.CORE.TAG.RECORDS', 'READ', (p, c) => svc.records(p, c));
        reg('ACTION.CORE.TAG.UPDATE', 'SAFE_WRITE', (p, c) => svc.update(p, c));
        reg('ACTION.CORE.TAG.MERGE', 'SAFE_WRITE', (p, c) => svc.merge(p, c));
        core.tags = svc;
        return svc;
    }
    KXTags = { install, norm, SYMBOLS, ICONS, iconSvg };
    globalThis.KXTags = KXTags;
})();
