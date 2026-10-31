// N2.5j (user 2026-10-25): guides BELONG TO HUBS – also to a place in the hub (tab); own guides as core records (write, edit, share by
// space, revisions, trash); one overview of all guides (by hub, kind, verification) with clickable paths – the UI merges them with the
// built-in library (core-guides + guides-manuals). Same content rules as the built-in guides (every section has content, web-only
// links, table rows = columns). Rights: a guide only for hubs the author may see; readers see only guides of readable hubs (children never
// see guides of hidden hubs). Creation with Kaira / another AI: our methodology prompt + the exact JSON format → import target CORE.GUIDE.
var KXGuidesUser;
(function () {
    const OWNER = 'APP.KX.NEXUS', TYPE = 'CORE.GUIDE';
    const CATS = ['LASER', 'FAMILY', 'BUSINESS', 'GENERAL'];
    const VERIFY = ['OFFICIAL', 'MAKER', 'FORUM', 'OURS'];
    const TX = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    const str = (v, n) => String(v ?? '').trim().slice(0, n);
    function cleanSection(s) {
        if (!s || typeof s !== 'object')
            return null;
        const o = {};
        if (s.h)
            o.h = str(s.h, 160);
        if (Array.isArray(s.p))
            o.p = s.p.slice(0, 40).map((x) => str(x, 2000)).filter(Boolean);
        if (Array.isArray(s.list))
            o.list = s.list.slice(0, 60).map((x) => str(x, 600)).filter(Boolean);
        if (Array.isArray(s.ol))
            o.ol = s.ol.slice(0, 60).map((x) => str(x, 600)).filter(Boolean);
        if (Array.isArray(s.warn))
            o.warn = s.warn.slice(0, 20).map((x) => str(x, 600)).filter(Boolean);
        if (s.note)
            o.note = str(s.note, 800);
        if (s.table && Array.isArray(s.table.cols) && Array.isArray(s.table.rows)) {
            const cols = s.table.cols.slice(0, 10).map((x) => str(x, 80));
            const rows = s.table.rows.slice(0, 200).map((r) => (Array.isArray(r) ? r : []).slice(0, cols.length).map((x) => str(x, 300)));
            if (rows.some((r) => r.length !== cols.length))
                throw new Error('GUIDE_TABLE_ROW_COLUMNS');
            o.table = { cols, rows };
        }
        if (Array.isArray(s.links)) {
            o.links = s.links.slice(0, 40).map((l) => [str(l?.[0], 160), str(l?.[1], 600)]);
            if (o.links.some((l) => !/^https?:\/\//i.test(l[1])))
                throw new Error('GUIDE_LINK_NOT_WEB');
        }
        for (const k of ['p', 'list', 'ol', 'warn'])
            if (o[k] && !o[k].length)
                delete o[k];
        if (!(o.h || o.p || o.list || o.ol || o.table || o.warn || o.links))
            throw new Error('GUIDE_SECTION_EMPTY');
        return o;
    }
    function install(core) {
        if (core.userGuides)
            return core.userGuides;
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const hubsOk = async (hubs, actor) => { for (const h of hubs) {
            try {
                if (!await core.ownerReadGate.allows(h, actor))
                    return false;
            }
            catch {
                return false;
            }
        } return true; };
        const svc = { CATS, VERIFY, cleanSection,
            normalize(p) {
                const title = str(p?.title, 160);
                if (!title)
                    throw new Error('GUIDE_TITLE_REQUIRED');
                const hubs = (Array.isArray(p?.hubs) ? p.hubs : []).map((h) => str(h, 60)).filter((h) => /^APP\.[A-Z0-9_.]+$/.test(h));
                if (!hubs.length)
                    throw new Error('GUIDE_HUB_REQUIRED');
                const sections = (Array.isArray(p?.sections) ? p.sections : []).map(cleanSection).filter(Boolean);
                if (!sections.length)
                    throw new Error('GUIDE_SECTIONS_REQUIRED');
                const places = (Array.isArray(p?.places) ? p.places : []).slice(0, 10).map((x) => ({ hub: str(x?.hub, 60), tab: x?.tab ? str(x.tab, 80) : undefined })).filter((x) => hubs.includes(x.hub));
                return { title, summary: str(p?.summary, 600), cat: CATS.includes(p?.cat) ? p.cat : 'GENERAL', hubs, places, verify: VERIFY.includes(p?.verify) ? p.verify : 'OURS', source: str(p?.source, 300), meta: str(p?.meta, 300), sections };
            },
            async save(p, ctx) {
                const g = svc.normalize(p);
                if (!await hubsOk(g.hubs, ctx.actorId))
                    throw new Error('GUIDE_HUB_NOT_ALLOWED');
                if (p?.id) {
                    const r = await core.entities.get(String(p.id));
                    if (!r || r.type !== TYPE)
                        throw new Error('GUIDE_NOT_FOUND');
                    if (!await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds }, ctx.actorId, 'EDIT'))
                        throw new Error('GUIDE_NOT_ALLOWED');
                    return core.entities.save({ ...r, expectedRevision: p.expectedRevision ?? r.revision, data: { ...r.data, ...g, updatedBy: ctx.actorId } }, { ...ctx, appCode: OWNER });
                }
                const space = p?.spaceId || ((await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id;
                return core.entities.save({ type: TYPE, ownerApp: OWNER, schema: 'KX.GUIDE/1', spaceIds: [space], data: { ...g, createdBy: ctx.actorId } }, { ...ctx, appCode: OWNER });
            },
            async list(p, ctx) {
                const out = [];
                for (const r of await core.entities.list()) {
                    if (r.type !== TYPE || r.archivedAt)
                        continue;
                    if (!await readable(r, ctx.actorId))
                        continue;
                    const d = r.data || {};
                    if (!await hubsOk(d.hubs || [], ctx.actorId))
                        continue;
                    if (p?.hub && !(d.hubs || []).includes(p.hub))
                        continue;
                    if (p?.tab && !(d.places || []).some((x) => x.hub === p.hub && x.tab === p.tab))
                        continue;
                    out.push({ id: r.id, revision: r.revision, own: true, spaceIds: r.spaceIds, ...d });
                }
                return out.sort((a, b) => String(a.title).localeCompare(String(b.title), 'cs'));
            },
            /* built-in guides visible to this person (guides of hidden hubs never) */
            async builtins(p, ctx) { const G = globalThis.KXGuides?.GUIDES || []; const out = []; for (const g of G) {
                if (!await hubsOk(g.hubs || [], ctx.actorId))
                    continue;
                if (p?.hub && !(g.hubs || []).includes(p.hub))
                    continue;
                out.push({ id: g.id, own: false, title: g.title, summary: g.summary, cat: g.cat, hubs: g.hubs, meta: g.meta || '' });
            } return out; },
            async archive(p, ctx) {
                if (p?.confirmed !== true)
                    throw new Error('GUIDE_DELETE_NEEDS_CONFIRM');
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || r.type !== TYPE)
                    throw new Error('GUIDE_NOT_FOUND');
                if (!await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds }, ctx.actorId, 'EDIT'))
                    throw new Error('GUIDE_NOT_ALLOWED');
                await core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, { ...ctx, appCode: OWNER });
                return { id: r.id, archived: true };
            },
            /* our methodology as a prompt (Kaira / another AI) + the exact JSON format */
            prompt(p) {
                const hub = str(p?.hub, 60) || 'APP.KX.LASER';
                const ex = { title: '…', summary: '2–4 věty: co to je, k čemu, hlavní zásada', cat: 'LASER', hubs: [hub], verify: 'OFFICIAL', source: 'https://…', meta: 'zdroj · verze · materiály', sections: [{ h: 'Hlavní data', table: { cols: ['Parametr', 'Hodnota'], rows: [['…', '… (rozsah, jednotka)']] } }, { h: 'Postup', ol: ['…'] }, { h: 'Chyby a pasti', warn: ['…'] }, { h: 'Pro naše stroje', list: ['…'] }, { h: 'Zdroje', links: [['Originál', 'https://…']] }] };
                return { text: [TX('gd.p.intro'), TX('gd.p.rules'), TX('gd.p.format'), '```json', JSON.stringify(ex, null, 1), '```'].join('\n'), example: ex };
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.GUIDE.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c));
        reg('ACTION.CORE.GUIDE.LIST', 'READ', (p, c) => svc.list(p, c));
        reg('ACTION.CORE.GUIDE.BUILTINS', 'READ', (p, c) => svc.builtins(p, c));
        reg('ACTION.CORE.GUIDE.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c));
        reg('ACTION.CORE.GUIDE.PROMPT', 'READ', (p, _c) => svc.prompt(p));
        /* import target: a guide (or several) as JSON from Kaira / another AI – preview + the same content rules */
        try {
            core.importer?.registerTarget?.('CORE.GUIDE', { label: TX('gd.target'), recordType: TYPE, nameKey: 'title',
                fields: () => [{ key: 'title', label: TX('gd.f.title'), type: 'TEXT', required: true, max: 160 }, { key: 'summary', label: TX('gd.f.summary'), type: 'TEXT' }, { key: 'cat', label: TX('gd.f.cat'), type: 'SELECT', options: CATS }, { key: 'hubs', label: TX('gd.f.hubs'), type: 'TEXT', required: true }, { key: 'sections', label: TX('gd.f.sections'), type: 'TEXT', required: true }],
                parse: async (text) => {
                    const m = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
                    const js = (m ? m[1] : String(text || '')).trim();
                    try {
                        const v = JSON.parse(js);
                        const arr = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [v];
                        return arr.map((g) => { try {
                            const n = svc.normalize(g);
                            return { title: n.title, summary: n.summary, cat: n.cat, hubs: n.hubs.join(','), sections: JSON.stringify(n.sections), _full: JSON.stringify(n) };
                        }
                        catch (e) {
                            return { title: str(g?.title, 160), hubs: '', sections: '', _error: String(e?.message || e) };
                        } });
                    }
                    catch {
                        return [];
                    }
                },
                save: (it, ctx, o) => { if (it._error)
                    throw new Error(it._error); const g = it._full ? JSON.parse(it._full) : { ...it, hubs: String(it.hubs || '').split(',').map((x) => x.trim()), sections: JSON.parse(it.sections || '[]') }; return svc.save({ ...g, spaceId: o.spaceId }, ctx); } });
        }
        catch { }
        core.userGuides = svc;
        return svc;
    }
    KXGuidesUser = { install, cleanSection };
    globalThis.KXGuidesUser = KXGuidesUser;
})();
