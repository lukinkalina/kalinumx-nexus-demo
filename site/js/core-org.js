// N2.5a: company structure (user 2026-10-24) – company → departments → teams with people and roles, shown as a diagram.
// Every department / team IS a core space (kind CUSTOM) → the same rights and memberships as everywhere: roles in the structure
// are written into the space memberships (LEAD → MANAGE, MEMBER → EDIT, GUEST → READ). The tree is one core entity.
// Only parents / the superadmin change the structure; never through the API / MCP / Kaira.
/* N2.5d (user): shares in % – one module for the company structure AND workload of tasks / projects / orders (home + company):
   default EQUAL (two people 50 / 50, three 33,33 / 33,33 / 33,34 – the sum is exactly 100); typing one share completes the others
   (two people: always the complement; more: typed ones stay, the rest is split among the others; over 100 % refused with the reason) */
var KXShares = globalThis.KXShares || {
    equal(rows) { const n = rows.length; if (!n)
        return rows; const each = Math.floor(10000 / n) / 100; rows.forEach((r, i) => { r.share = i === n - 1 ? Math.round((100 - each * (n - 1)) * 100) / 100 : each; r.shareFixed = false; }); return rows; },
    set(rows, row, value, resetOthers = false) {
        const v = Math.round(Number(String(value).replace(',', '.')) * 100) / 100;
        if (!Number.isFinite(v) || v < 0 || v > 100)
            throw new Error('SHARE_RANGE');
        row.share = v;
        row.shareFixed = true;
        const others = rows.filter((x) => x !== row);
        if (others.length === 1) {
            others[0].share = Math.round((100 - v) * 100) / 100;
            others[0].shareFixed = false;
            return rows;
        }
        const fixed = others.filter((x) => x.shareFixed && !resetOthers);
        const sumFixed = fixed.reduce((a, x) => a + Number(x.share || 0), 0);
        if (v + sumFixed > 100.0001)
            throw new Error(`SHARE_OVER ${Math.round((v + sumFixed) * 100) / 100}`);
        const free = others.filter((x) => !fixed.includes(x));
        if (free.length) {
            const rest = Math.round((100 - v - sumFixed) * 100) / 100;
            const each = Math.floor(rest / free.length * 100) / 100;
            free.forEach((x, i) => { x.share = i === free.length - 1 ? Math.round((rest - each * (free.length - 1)) * 100) / 100 : each; x.shareFixed = false; });
        }
        return rows;
    }
};
globalThis.KXShares = KXShares;
var KXOrg;
(function () {
    const ID = 'CORE.ORG_STRUCTURE.CURRENT', T = 'CORE.ORG_STRUCTURE', OWNER = 'APP.KX.NEXUS', ROOT = 'ORG.COMPANY';
    const TYPES = ['DEPARTMENT', 'TEAM'];
    const ROLES = { LEAD: 'MANAGE', MEMBER: 'EDIT', GUEST: 'READ' };
    const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'NODE';
    function install(core) {
        if (core.orgStructure)
            return core.orgStructure;
        const SYS = (a) => ({ actorId: a || 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true });
        const load = async () => { try {
            const r = await core.entities.get(ID);
            if (r?.data?.nodes)
                return r;
        }
        catch { } return null; };
        const tree = async () => { const r = await load(); return r?.data?.nodes ? r.data.nodes : [{ id: ROOT, name: 'Firma', type: 'COMPANY', parentId: null, spaceId: 'SPACE.COMPANY', members: [], archivedAt: null }]; };
        const save = async (nodes, actor) => { const old = await load(); return core.entities.save({ id: ID, type: T, ownerApp: OWNER, schema: 'KX.ORG_STRUCTURE/1', spaceIds: ['SPACE.COMPANY'], expectedRevision: old?.revision, data: { nodes } }, SYS(actor)); };
        const mayEdit = async (actor) => { const HR = core.hubRights; if (!HR)
            return false; return (await HR.isSuperadmin(actor)) || (await HR.roleOf(actor)) === 'PARENT'; };
        const syncMembers = async (node, actor) => {
            if (!node.spaceId)
                return;
            const ctx = SYS(actor);
            const want = new Map((node.members || []).map((m) => [m.userId, ROLES[m.role] || 'READ']));
            for (const m of await core.memberships.listMemberships(node.spaceId)) {
                if (m.role === 'OWNER')
                    continue;
                if (!want.has(m.userId))
                    await core.memberships.removeMembership(node.spaceId, m.userId, ctx);
            }
            for (const [u, r] of want) {
                if ((await core.memberships.roleFor(node.spaceId, u)) !== r)
                    await core.memberships.setMembership(node.spaceId, u, r, ctx);
            }
        };
        const svc = { TYPES, ROLES, ROOT,
            async structure() {
                const nodes = (await tree()).filter((n) => !n.archivedAt);
                const kids = (id) => nodes.filter((n) => n.parentId === id);
                const build = (n) => ({ ...n, children: kids(n.id).map(build) });
                return { root: build(nodes.find((n) => n.id === ROOT)), count: nodes.length };
            },
            async saveNode(p, ctx) {
                if (!await mayEdit(ctx.actorId))
                    throw new Error('ORG_ONLY_PARENTS');
                const nodes = await tree();
                const name = String(p?.name || '').trim();
                if (!name)
                    throw new Error('ORG_NAME_REQUIRED');
                if (p?.id) {
                    const n = nodes.find((x) => x.id === p.id && !x.archivedAt);
                    if (!n)
                        throw new Error('ORG_NODE_NOT_FOUND');
                    n.name = name;
                    if (n.spaceId && n.id !== ROOT) {
                        const sp = await core.memberships.getSpace(n.spaceId);
                        if (sp)
                            await core.memberships.upsertSpace({ ...sp, name: `Firma · ${name}` }, SYS(ctx.actorId));
                    }
                    await save(nodes, ctx.actorId);
                    return n;
                }
                const parent = nodes.find((x) => x.id === (p?.parentId || ROOT) && !x.archivedAt);
                if (!parent)
                    throw new Error('ORG_PARENT_NOT_FOUND');
                const type = TYPES.includes(p?.type) ? p.type : 'DEPARTMENT';
                let id = 'ORG.' + slug(name), i = 2;
                while (nodes.some((x) => x.id === id))
                    id = 'ORG.' + slug(name) + '_' + (i++);
                const spaceId = 'SPACE.ORG.' + id.slice(4);
                await core.memberships.upsertSpace({ id: spaceId, name: `Firma · ${name}`, kind: 'CUSTOM', ownerUserId: ctx.actorId }, SYS(ctx.actorId));
                const n = { id, name, type, parentId: parent.id, spaceId, members: [], archivedAt: null };
                nodes.push(n);
                await save(nodes, ctx.actorId);
                return n;
            },
            async move(p, ctx) {
                if (!await mayEdit(ctx.actorId))
                    throw new Error('ORG_ONLY_PARENTS');
                const nodes = await tree();
                const n = nodes.find((x) => x.id === p?.id);
                const to = nodes.find((x) => x.id === p?.parentId && !x.archivedAt);
                if (!n || n.id === ROOT || !to)
                    throw new Error('ORG_NODE_NOT_FOUND');
                let a = to;
                while (a) {
                    if (a.id === n.id)
                        throw new Error('ORG_CYCLE');
                    a = nodes.find((x) => x.id === a.parentId);
                }
                n.parentId = to.id;
                await save(nodes, ctx.actorId);
                return n;
            },
            async archive(p, ctx) {
                if (!await mayEdit(ctx.actorId))
                    throw new Error('ORG_ONLY_PARENTS');
                const nodes = await tree();
                const n = nodes.find((x) => x.id === p?.id && !x.archivedAt);
                if (!n || n.id === ROOT)
                    throw new Error('ORG_NODE_NOT_FOUND');
                if (nodes.some((x) => x.parentId === n.id && !x.archivedAt))
                    throw new Error('ORG_HAS_CHILDREN');
                n.archivedAt = new Date().toISOString();
                await save(nodes, ctx.actorId);
                return n;
            },
            async setMember(p, ctx) {
                if (!await mayEdit(ctx.actorId))
                    throw new Error('ORG_ONLY_PARENTS');
                const nodes = await tree();
                const n = nodes.find((x) => x.id === p?.id && !x.archivedAt);
                if (!n)
                    throw new Error('ORG_NODE_NOT_FOUND');
                const u = String(p?.userId || '');
                if (!/^USER\./.test(u))
                    throw new Error('ORG_USER');
                if (p?.role !== null && !ROLES[p?.role])
                    throw new Error('ORG_ROLE');
                if (p?.role && core.hubRights && (await core.hubRights.roleOf(u)) === 'CHILD' && p.role !== 'GUEST' && p?.allowChild !== true)
                    throw new Error('ORG_CHILD_NEEDS_CONSENT');
                const prev = (n.members || []).find((m) => m.userId === u);
                n.members = (n.members || []).filter((m) => m.userId !== u);
                if (p.role)
                    n.members.push({ userId: u, role: p.role, position: prev?.position || '', share: prev?.share ?? null, shareFixed: prev?.shareFixed === true });
                /* default EQUAL while nobody typed a share (user: 50 / 50 for two) */ if (!(n.members || []).some((m) => m.shareFixed))
                    KXShares.equal(n.members || []);
                await save(nodes, ctx.actorId);
                await syncMembers(n, ctx.actorId);
                return n;
            },
            /* N2.5d (user): POSITION and SHARE % of members – typing one share completes the others to 100 % (two people: exactly the other;
               more: the rest is split among those without a fixed share, equally); a total over 100 % is refused with the reason */
            async setShare(p, ctx) {
                if (!await mayEdit(ctx.actorId))
                    throw new Error('ORG_ONLY_PARENTS');
                const nodes = await tree();
                const n = nodes.find((x) => x.id === p?.id && !x.archivedAt);
                if (!n)
                    throw new Error('ORG_NODE_NOT_FOUND');
                const m = (n.members || []).find((x) => x.userId === String(p?.userId || ''));
                if (!m)
                    throw new Error('ORG_NOT_A_MEMBER');
                if (p?.position != null)
                    m.position = String(p.position).trim().slice(0, 60);
                if (p?.share != null && p.share !== '') {
                    try {
                        KXShares.set(n.members || [], m, p.share, p?.resetOthers === true);
                    }
                    catch (e) {
                        throw new Error(String(e?.message || e).replace(/^SHARE_/, 'ORG_SHARE_'));
                    }
                }
                await save(nodes, ctx.actorId);
                return n;
            },
            /* split an amount by the shares of a node (for orders) – cents rounded so the parts add up EXACTLY */
            async split(p, _ctx) {
                const nodes = await tree();
                const n = nodes.find((x) => x.id === (p?.id || ROOT) && !x.archivedAt);
                if (!n)
                    throw new Error('ORG_NODE_NOT_FOUND');
                const amount = Math.round(Number(p?.amount || 0) * 100);
                const ms = (n.members || []).filter((m) => Number(m.share) > 0);
                if (!ms.length)
                    return { parts: [], total: amount / 100 };
                const tot = ms.reduce((a, m) => a + Number(m.share), 0);
                let used = 0;
                const parts = ms.map((m, i) => { const c = i === ms.length - 1 ? amount - used : Math.round(amount * Number(m.share) / tot); used += c; return { userId: m.userId, position: m.position || '', share: Number(m.share), amount: c / 100 }; });
                return { parts, total: amount / 100 };
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.ORG.STRUCTURE', 'READ', () => svc.structure());
        reg('ACTION.CORE.ORG.NODE.SAVE', 'SENSITIVE_WRITE', (p, c) => svc.saveNode(p, c));
        reg('ACTION.CORE.ORG.NODE.MOVE', 'SENSITIVE_WRITE', (p, c) => svc.move(p, c));
        reg('ACTION.CORE.ORG.NODE.ARCHIVE', 'SENSITIVE_WRITE', (p, c) => svc.archive(p, c));
        reg('ACTION.CORE.ORG.MEMBER.SET', 'SENSITIVE_WRITE', (p, c) => svc.setMember(p, c));
        reg('ACTION.CORE.ORG.SHARE.SET', 'SENSITIVE_WRITE', (p, c) => svc.setShare(p, c));
        reg('ACTION.CORE.ORG.SPLIT', 'READ', (p, c) => svc.split(p, c));
        core.orgStructure = svc;
        return svc;
    }
    KXOrg = { install, TYPES, ROLES };
    globalThis.KXOrg = KXOrg;
})();
