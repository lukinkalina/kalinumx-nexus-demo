// N2.5c (user 2026-10-24): no two records with the same name in one hub – across the whole NEXUS and its sub-hubs.
// A record may carry data.disambiguation (a separate value, the name itself stays): shown as „Name (Brno)“ / „Name (2)“
// in the inspector, card, search and hub-kit lists. Suggestion: the first distinguishing detail nobody with the same name
// uses yet (city, company, e-mail domain, space, date), else the next free number. Only readable records count.
// Check „Stejný název v hubu“ in Hlášky a kontroly.
var KXNames;
(function () {
    const OWNER = 'APP.KX.NEXUS';
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const baseName = (d) => String(d?.name || d?.title || d?.label || '').trim();
    /* numbers at the end „Name .1“ (user), a distinguishing detail in brackets „Name (Brno)“ */
    const fmt = (b, x) => !x ? b : /^\d+$/.test(x) ? `${b} .${x}` : `${b} (${x})`;
    const label = (d) => fmt(baseName(d), String(d?.disambiguation || '').trim());
    /* candidate details of a record (contacts and hub records alike) */
    function details(d, spaceName) {
        const out = [];
        const add = (v) => { const s = String(v ?? '').trim(); if (s && s.length <= 40 && !out.includes(s))
            out.push(s); };
        for (const a of (Array.isArray(d?.addresses) ? d.addresses : []))
            add(a?.city);
        add(d?.city);
        add(d?.company);
        add(d?.place);
        add(d?.location);
        for (const e of (Array.isArray(d?.emails) ? d.emails : [])) {
            const m = String(e?.value || e || '').split('@')[1];
            if (m)
                add(m);
        }
        add(spaceName);
        return out;
    }
    function install(core) {
        if (core.names)
            return core.names;
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const siblings = async (r, actor) => { const k = norm(baseName(r.data)); const out = []; if (!k)
            return out; for (const x of await core.entities.list()) {
            if (x.archivedAt || x.type !== r.type || x.ownerApp !== r.ownerApp || norm(baseName(x.data)) !== k)
                continue;
            if (await readable(x, actor))
                out.push(x);
        } return out; };
        const svc = { norm, label,
            /* the suggestion for record id: a detail the same-named records do not use, else the next free number */
            async suggest(p, ctx) {
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || !await readable(r, ctx.actorId))
                    throw new Error('NAMES_NOT_FOUND');
                const sib = (await siblings(r, ctx.actorId)).filter((x) => x.id !== r.id);
                const used = new Set(sib.map((x) => norm(x.data?.disambiguation)));
                const spName = async (x) => { try {
                    return (await core.memberships.getSpace((x.spaceIds || [])[0]))?.name || '';
                }
                catch {
                    return '';
                } };
                const spaceName = await spName(r);
                /* the others' details INCLUDING their space – a space tells apart only records in different spaces */ const others = [];
                for (const x of sib)
                    others.push(details(x.data, await spName(x)));
                const det = details(r.data, spaceName).find(v => !used.has(norm(v)) && !others.some((o) => o.map(norm).includes(norm(v))));
                if (det)
                    return { value: det, kind: 'DETAIL', label: fmt(baseName(r.data), det) };
                let n = 1;
                while (used.has(String(n)))
                    n++;
                return { value: String(n), kind: 'NUMBER', label: fmt(baseName(r.data), String(n)) };
            },
            /* set (or clear) the disambiguation of any readable record – the name itself never changes */
            async set(p, ctx) {
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || !await readable(r, ctx.actorId))
                    throw new Error('NAMES_NOT_FOUND');
                const v = String(p?.value ?? '').trim().replace(/^\.+/, '').slice(0, 40);
                /* refused WITH the reason: which same-named record already uses the value */ if (v) {
                    const clash = (await siblings(r, ctx.actorId)).find((x) => x.id !== r.id && norm(x.data?.disambiguation) === norm(v));
                    if (clash)
                        throw new Error(`NAMES_TAKEN ${label(clash.data)}`);
                }
                const saved = await core.entities.save({ ...r, data: { ...r.data, disambiguation: v || undefined }, expectedRevision: r.revision }, { ...ctx, appCode: ctx?.appCode || OWNER });
                return { id: saved.id, label: label(saved.data) };
            },
            /* groups of same-named records in one hub and type that are not told apart */
            async duplicates(_p, ctx) {
                const groups = new Map();
                for (const x of await core.entities.list()) {
                    if (x.archivedAt)
                        continue;
                    const b = norm(baseName(x.data));
                    if (!b || String(x.type).startsWith('CORE.IDENTITY.'))
                        continue;
                    const k = `${x.ownerApp}|${x.type}|${b}|${norm(x.data?.disambiguation)}`;
                    if (!groups.has(k))
                        groups.set(k, []);
                    groups.get(k).push(x);
                }
                const out = [];
                for (const [k, rows] of groups) {
                    if (rows.length < 2)
                        continue;
                    const vis = [];
                    for (const r of rows)
                        if (await readable(r, ctx.actorId))
                            vis.push(r);
                    if (vis.length < 2)
                        continue;
                    const [owner, type] = k.split('|');
                    out.push({ ownerApp: owner, type, name: label(vis[0].data), ids: vis.map((r) => r.id) });
                }
                return out;
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.NAMES.SUGGEST', 'READ', (p, c) => svc.suggest(p, c));
        reg('ACTION.CORE.NAMES.SET', 'SAFE_WRITE', (p, c) => svc.set(p, c));
        reg('ACTION.CORE.NAMES.DUPLICATES', 'READ', (p, c) => svc.duplicates(p, c));
        /* Hlášky a kontroly: same name in one hub */
        try {
            core.issues?.registerCheck?.({ id: 'CORE.NAMES.SAME_NAME', owner: OWNER, title: 'Same name in a hub', run: async (a) => (await svc.duplicates({}, { actorId: a })).map((g) => ({ fingerprint: 'NAME.SAME:' + g.ownerApp + ':' + g.type + ':' + norm(g.name), severity: 'INFO',
                    title: `${g.name} ×${g.ids.length}`, detail: `${g.ownerApp} · ${g.type}`, fix: [{ kind: 'OPEN_RECORD', label: 'Open', target: core.deepLinks.build({ kind: 'ENTITY', id: g.ids[g.ids.length - 1] }) }] })) });
        }
        catch { }
        core.names = svc;
        return svc;
    }
    KXNames = { install, norm, label, fmt, details };
    globalThis.KXNames = KXNames;
})();
