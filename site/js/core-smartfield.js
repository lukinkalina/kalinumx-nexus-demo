// N2.5b: smart fields (user 2026-10-24) – type freely AND get suggestions of what already exists; pick = link (chip → card),
// nothing fits → „＋ Nový …“ (create + link) or „keep as text“. Values stay {text, ref?} – old free text keeps working.
// Sources: field HISTORY (earlier values of the same field), CONTACTS (new core record CORE.CONTACT), USERS, SPACES, ENTITY:<type>.
// Matching ignores diacritics and case, tolerates one typo; frequently used values per user go first.
var KXSmartField;
(function () {
    const OWNER = 'APP.KX.NEXUS', CONTACT = 'CORE.CONTACT', USAGE = 'CORE.SMARTFIELD.USAGE';
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    function lev1(a, b) { if (Math.abs(a.length - b.length) > 1)
        return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) {
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
    /* 100 exact, 80 prefix, 70 word prefix, 50 contains, 30 one typo (query ≥ 4), 0 = no match */
    function score(label, q) { const l = norm(label), n = norm(q); if (!n)
        return 10; if (l === n)
        return 100; if (l.startsWith(n))
        return 80; if (l.split(' ').some(w => w.startsWith(n)))
        return 70; if (l.includes(n))
        return 50; if (n.length >= 4 && l.split(' ').some(w => lev1(w.slice(0, n.length + 1), n) || lev1(w, n)))
        return 30; return 0; }
    function install(core) {
        if (core.smartFields)
            return core.smartFields;
        const C = (a) => ({ actorId: a || 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true });
        /* a suggestion may come only from a record the user may read: the space (access.can) AND the hub gate (rights per section, protected hubs without a session) */
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        /* N2.5b (user): pick the AREA first – ALL · FAMILY (family + shared spaces) · COMPANY (company + its departments / teams) · MINE (own personal space) */
        const SCOPES = ['ALL', 'FAMILY', 'COMPANY', 'MINE'];
        const kinds = async () => { const m = new Map(); for (const sp of await core.memberships.listSpaces())
            m.set(sp.id, sp); return m; };
        const inScope = (r, scope, actor, m) => {
            if (!scope || scope === 'ALL')
                return true;
            return (r.spaceIds || []).some((id) => {
                const sp = m.get(id);
                if (!sp)
                    return false;
                if (scope === 'MINE')
                    return sp.kind === 'PERSONAL' && sp.ownerUserId === actor;
                if (scope === 'COMPANY')
                    return sp.kind === 'COMPANY' || String(sp.id).startsWith('SPACE.ORG.');
                if (scope === 'FAMILY')
                    return ['FAMILY', 'HOME', 'SHARED', 'WORKSHOP'].includes(sp.kind);
                return false;
            });
        };
        const scopeSpace = async (scope, actor) => {
            const sp = await core.propagate.spaces(actor);
            const pick = (f) => (sp.find(f) || {}).id;
            if (scope === 'COMPANY')
                return pick((x) => x.kind === 'COMPANY');
            if (scope === 'FAMILY')
                return pick((x) => x.kind === 'FAMILY') || pick((x) => x.kind === 'SHARED');
            return pick((x) => x.kind === 'PERSONAL');
        };
        const sources = {
            HISTORY: { label: 'history', async list(actor, f, sc) {
                    const [type, key] = String(f || '').split('#');
                    if (!type || !key)
                        return [];
                    const seen = new Map();
                    /* key may point into a list: „offers[].shop“ = the shop of every offer */ const [arr, sub] = key.includes('[].') ? key.split('[].') : [null, null];
                    const m = await kinds();
                    for (const r of await core.entities.list()) {
                        if (r.type !== type || r.archivedAt)
                            continue;
                        if (!inScope(r, sc, actor, m))
                            continue;
                        if (!await readable(r, actor))
                            continue;
                        const vals = arr ? (Array.isArray(r.data?.[arr]) ? r.data[arr].map((x) => x?.[sub]) : []) : [r.data?.[key]];
                        for (const raw of vals) {
                            const v = String(raw ?? '').trim();
                            if (v)
                                seen.set(v, (seen.get(v) || 0) + 1);
                        }
                    }
                    return [...seen.entries()].map(([v, n]) => ({ label: v, sub: `${n}×`, ref: null, source: 'HISTORY', weight: Math.min(10, n) }));
                } },
            CONTACTS: { label: 'contacts', async list(actor, _f, sc) {
                    const out = [];
                    const m = await kinds();
                    for (const r of await core.entities.list()) {
                        if (r.type !== CONTACT || r.archivedAt)
                            continue;
                        if (!inScope(r, sc, actor, m))
                            continue;
                        if (!await readable(r, actor))
                            continue;
                        out.push({ label: String(r.data?.name || '') + (r.data?.disambiguation ? (/^\d+$/.test(String(r.data.disambiguation)) ? ` .${r.data.disambiguation}` : ` (${r.data.disambiguation})`) : ''), sub: [r.data?.kind === 'COMPANY' ? 'firma' : 'osoba', r.data?.note].filter(Boolean).join(' · '), ref: core.deepLinks.build({ kind: 'ENTITY', id: r.id }), source: 'CONTACTS', weight: 0 });
                    }
                    return out;
                },
                async create(name, ctx, extra) {
                    const sp = extra?.spaceId || await scopeSpace(String(extra?.scope || 'MINE'), ctx.actorId);
                    if (!sp)
                        throw new Error('SMARTFIELD_NO_SPACE');
                    const r = await core.entities.save({ type: CONTACT, ownerApp: OWNER, schema: 'KX.CONTACT/1', spaceIds: [sp], data: { name, kind: extra?.kind === 'COMPANY' ? 'COMPANY' : 'PERSON', note: String(extra?.note || '') } }, { ...ctx, appCode: OWNER });
                    return { label: name, ref: core.deepLinks.build({ kind: 'ENTITY', id: r.id }), source: 'CONTACTS' };
                } },
            USERS: { label: 'members', async list() { return (await core.memberships.listUsers()).map((u) => ({ label: String(u.displayName || u.id), sub: u.id, ref: 'kx://user/' + u.id, source: 'USERS', weight: 0 })); } },
            SPACES: { label: 'spaces', async list(actor) { return (await core.propagate.spaces(actor)).map((s) => ({ label: s.name, sub: s.kind, ref: 'kx://space/' + s.id, source: 'SPACES', weight: 0 })); } }
        };
        const usageId = (u) => `${USAGE}.${String(u).replace(/[^A-Z0-9_.]/gi, '_')}`;
        const usage = async (u) => { try {
            return (await core.entities.get(usageId(u)))?.data?.counts || {};
        }
        catch {
            return {};
        } };
        const svc = { norm, score, sources, SCOPES,
            register(code, src) { if (sources[code])
                throw new Error('SMARTFIELD_SOURCE_EXISTS'); sources[code] = src; },
            /* suggestions for a field: {field:'FINANCE.MOVEMENTS#counterparty', sources:['CONTACTS','HISTORY'], query} */
            async suggest(p, ctx) {
                const actor = ctx?.actorId;
                const q = String(p?.query || '');
                const sc = SCOPES.includes(p?.scope) ? p.scope : 'ALL';
                const want = (p?.sources || ['HISTORY']).filter((s) => sources[s] || /^ENTITY:/.test(s));
                const counts = await usage(actor);
                const fieldKey = String(p?.field || '');
                const all = [];
                for (const s of want) {
                    let items = [];
                    if (/^ENTITY:/.test(s)) {
                        const type = s.slice(7);
                        const m = await kinds();
                        for (const r of await core.entities.list()) {
                            if (r.type !== type || r.archivedAt)
                                continue;
                            if (!inScope(r, sc, actor, m))
                                continue;
                            if (!await readable(r, actor))
                                continue;
                            items.push({ label: String(r.data?.name || r.data?.title || r.data?.label || r.id), sub: type, ref: core.deepLinks.build({ kind: 'ENTITY', id: r.id }), source: s, weight: 0 });
                        }
                    }
                    else
                        items = await sources[s].list(actor, s === 'HISTORY' ? fieldKey : undefined, sc);
                    for (const it of items) {
                        const sc = score(it.label, q);
                        if (!sc)
                            continue;
                        const used = counts[`${fieldKey}|${it.ref || norm(it.label)}`] || 0;
                        all.push({ ...it, score: sc + Math.min(15, used * 3) + (it.weight || 0) });
                    }
                }
                /* the same label from history and a linked record → keep the linked one */
                const byLabel = new Map();
                for (const it of all.sort((a, b) => b.score - a.score)) {
                    const k = norm(it.label);
                    const ex = byLabel.get(k);
                    if (!ex || (!ex.ref && it.ref))
                        byLabel.set(k, it);
                }
                const items = [...byLabel.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'cs')).slice(0, Math.min(30, Number(p?.limit) || 12));
                const exact = items.some(it => norm(it.label) === norm(q));
                return { scope: sc, items, canCreate: !!q.trim() && !exact && want.some((s) => sources[s]?.create), canKeepText: !!q.trim() && !exact };
            },
            async create(p, ctx) { const s = sources[p?.source]; if (!s?.create)
                throw new Error('SMARTFIELD_CANNOT_CREATE'); const name = String(p?.name || '').trim(); if (!name)
                throw new Error('SMARTFIELD_NAME_REQUIRED'); return s.create(name, ctx, p); },
            /* remember a pick (per user, per field) – frequently used go first */
            async remember(p, ctx) {
                const u = ctx?.actorId;
                if (!u || u === 'SYSTEM')
                    return false;
                const id = usageId(u);
                const old = await core.entities.get(id).catch(() => null);
                const counts = { ...(old?.data?.counts || {}) };
                const k = `${String(p?.field || '')}|${p?.ref || norm(p?.label)}`;
                counts[k] = (counts[k] || 0) + 1;
                const sp = ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
                if (!sp)
                    return false;
                await core.entities.save({ id, type: USAGE, ownerApp: OWNER, schema: 'KX.SMARTFIELD_USAGE/1', spaceIds: [sp], expectedRevision: old?.revision, data: { counts } }, { ...C(u) });
                return true;
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.SMARTFIELD.SUGGEST', 'READ', (p, c) => svc.suggest(p, c));
        reg('ACTION.CORE.SMARTFIELD.CREATE', 'SAFE_WRITE', (p, c) => svc.create(p, c));
        reg('ACTION.CORE.SMARTFIELD.REMEMBER', 'SAFE_WRITE', (p, c) => svc.remember(p, c));
        core.smartFields = svc;
        return svc;
    }
    /* UI (browser only): one shared smart field for any hub – suggestions under the field, keyboard, 🔗 chip, ＋ new, keep as text */
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (k, d, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || d).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    const ICON = { CONTACTS: '👤', HISTORY: '🕘', USERS: '👪', SPACES: '🗂' };
    const SCOPE_MEM = {};
    function mount(input, core, o) {
        if (typeof document === 'undefined' || !input || input.dataset.sfMounted)
            return;
        input.dataset.sfMounted = '1';
        input.setAttribute('autocomplete', 'off');
        const wrap = document.createElement('span');
        wrap.className = 'kx-sf';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'kx-sf-chip';
        chip.setAttribute('data-sf-chip', '');
        chip.textContent = '🔗';
        wrap.appendChild(chip);
        const list = document.createElement('div');
        list.className = 'kx-sf-list';
        list.setAttribute('data-sf-list', '');
        list.hidden = true;
        wrap.appendChild(list);
        const C = { actorId: o.actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true };
        let items = [], extra = [], hi = -1, timer = null, picked = '';
        const SCK = 'sf.scope.' + o.field;
        let scope = String(SCOPE_MEM[SCK] || 'ALL');
        const showChip = () => { chip.hidden = !input.dataset.ref; chip.title = T('sf.chip', 'Linked – open') + ': ' + (input.value || ''); };
        showChip();
        const close = () => { list.hidden = true; hi = -1; };
        const pick = async (it) => {
            if (it.kind === 'NEW') {
                try {
                    const r = await core.actions.invoke('ACTION.CORE.SMARTFIELD.CREATE', { source: o.create, name: it.label, scope: scope === 'ALL' ? 'MINE' : scope }, C);
                    it = { label: r.label, ref: r.ref };
                }
                catch (e) {
                    list.innerHTML = `<div class="kx-sf-err">${esc(e?.message || e)}</div>`;
                    return;
                }
            }
            input.value = it.label;
            input.dataset.ref = it.kind === 'TEXT' ? '' : (it.ref || '');
            picked = input.value;
            showChip();
            close();
            if (input.dataset.ref) {
                try {
                    await core.actions.invoke('ACTION.CORE.SMARTFIELD.REMEMBER', { field: o.field, ref: input.dataset.ref, label: it.label }, C);
                }
                catch { }
            }
        };
        const render = () => {
            const rows = [...items, ...extra];
            const groups = [`<div class="kx-sf-scope" data-sf-scopes>${['ALL', 'FAMILY', 'COMPANY', 'MINE'].map(x => `<button type="button" class="${x === scope ? 'active' : ''}" data-sf-scope="${x}">${esc(T('sf.scope.' + x, x))}</button>`).join('')}</div>`];
            let last = '';
            if (!rows.length)
                groups.push(`<div class="kx-sf-group">${esc(T('sf.none', 'Nothing here'))}</div>`);
            rows.forEach((it, i) => {
                const g = it.kind ? '' : (it.source || '');
                if (g && g !== last) {
                    groups.push(`<div class="kx-sf-group">${esc(T('sf.src.' + g.split(':')[0], g))}</div>`);
                    last = g;
                }
                groups.push(`<button type="button" class="kx-sf-item ${i === hi ? 'active' : ''}" data-sf-i="${i}">${it.kind === 'NEW' ? '＋' : it.kind === 'TEXT' ? '✎' : (ICON[String(it.source).split(':')[0]] || '•')} ${esc(it.kind === 'NEW' ? T('sf.new', 'New contact "{name}"', { name: it.label }) : it.kind === 'TEXT' ? T('sf.keep', 'Keep as text "{name}"', { name: it.label }) : it.label)}${it.sub && !it.kind ? `<small>${esc(it.sub)}</small>` : ''}${!it.kind && it.ref && String(it.source) === 'CONTACTS' ? `<span class="kx-sf-edit" data-sf-edit="${esc(it.ref)}" title="${esc(T('sf.edit', 'Edit'))}">✎</span>` : ''}</button>`);
            });
            list.innerHTML = groups.join('');
            list.hidden = false;
            list.querySelectorAll('[data-sf-i]').forEach(b => b.onmousedown = (e) => { e.preventDefault(); const ed = e.target.closest('[data-sf-edit]'); if (ed) {
                close();
                try {
                    globalThis.KXOpenRef?.(ed.dataset.sfEdit, 'RECORD');
                }
                catch { }
                return;
            } void pick(rows[Number(b.dataset.sfI)]); });
            list.querySelectorAll('[data-sf-scope]').forEach(b => b.onmousedown = (e) => { e.preventDefault(); scope = String(b.dataset.sfScope); SCOPE_MEM[SCK] = scope; void ask(); });
        };
        const ask = async () => { const q = input.value; try {
            const r = await core.actions.invoke('ACTION.CORE.SMARTFIELD.SUGGEST', { field: o.field, sources: o.sources, query: q, scope }, C);
            items = r.items || [];
            extra = [];
            if (r.canCreate && o.create)
                extra.push({ kind: 'NEW', label: q.trim() });
            if (r.canKeepText)
                extra.push({ kind: 'TEXT', label: q.trim() });
            hi = -1;
            render();
        }
        catch {
            close();
        } };
        input.addEventListener('input', () => { if (input.value !== picked) {
            input.dataset.ref = '';
            showChip();
        } clearTimeout(timer); timer = setTimeout(() => void ask(), 140); });
        input.addEventListener('focus', () => { clearTimeout(timer); timer = setTimeout(() => void ask(), 60); });
        input.addEventListener('blur', () => setTimeout(close, 150));
        input.addEventListener('keydown', (e) => {
            const rows = [...items, ...extra];
            if (list.hidden || !rows.length)
                return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                hi = Math.min(rows.length - 1, hi + 1);
                render();
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                hi = Math.max(0, hi - 1);
                render();
            }
            else if (e.key === 'Enter' && hi >= 0) {
                e.preventDefault();
                void pick(rows[hi]);
            }
            else if (e.key === 'Tab' && items.length) {
                void pick(items[hi >= 0 ? hi : 0]);
            }
            else if (e.key === 'Escape') {
                close();
            }
        });
        /* chip click – configurable (user): CARD (default) · RECORD · COPY · NONE */
        chip.onclick = () => {
            const ref = input.dataset.ref;
            if (!ref)
                return;
            const mode = String(globalThis.KXSmartFieldClick || 'CARD');
            if (mode === 'COPY') {
                try {
                    navigator.clipboard?.writeText(input.value);
                }
                catch { }
                return;
            }
            if (mode === 'NONE')
                return;
            try {
                globalThis.KXOpenRef?.(ref, mode);
            }
            catch { }
        };
    }
    KXSmartField = { install, norm, score, mount };
    globalThis.KXSmartField = KXSmartField;
})();
