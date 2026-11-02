// N2.4y: „K zatřídění“ – ONE inbox in the core for everything that did not go through: missing data (a name day without a date),
// import lines that failed, AI / API / MCP writes waiting (PIN / approval), drafts. Nothing is lost: text always, attachments
// (core file ids) when given, the original target (hub, action, payload) so it can be retried. Dedupe by key.
// Sensitive (protected) targets: without a signed-in session only „1 item from Finance waits“ – no content.
var KXInbox;
(function () {
    const T = 'CORE.INBOX_ITEM', OWNER = 'APP.KX.NEXUS';
    const SOURCES = ['AI', 'API', 'MCP', 'IMPORT', 'DRAFT', 'MISSING_DATA', 'MANUAL'];
    const REASONS = ['PIN_REQUIRED', 'APPROVAL', 'IMPORT_ERROR', 'VALIDATION', 'DRAFT', 'MISSING_DATA'];
    function install(core) {
        if (core.inbox)
            return core.inbox;
        const prot = (o) => !!(o && core.identity?.isProtected?.(o));
        const signedIn = async (actor) => { try {
            return (await core.identity?.validate?.()) === actor;
        }
        catch {
            return false;
        } };
        const C = (ctx) => ({ actorId: ctx.actorId, appCode: OWNER, deviceId: ctx.deviceId, permissions: [], confirmed: true });
        const svc = {
            async add(item, ctx) {
                if (!SOURCES.includes(item?.source))
                    throw new Error('INBOX_SOURCE');
                if (!REASONS.includes(item?.reason))
                    throw new Error('INBOX_REASON');
                const title = String(item?.title || '').trim();
                if (!title)
                    throw new Error('INBOX_TITLE');
                const key = item.key ? String(item.key).slice(0, 200) : null;
                if (key) {
                    const ex = (await core.entities.list()).find((r) => r.type === T && r.data.key === key && r.data.status === 'NEW' && r.data.ownerUserId === ctx.actorId);
                    if (ex)
                        return ex;
                }
                const sp = (await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL');
                return core.entities.save({ type: T, ownerApp: OWNER, schema: 'KX.INBOX_ITEM/1', spaceIds: sp ? [sp.id] : [], data: { key, source: item.source, reason: item.reason, title: title.slice(0, 200), text: String(item.text || '').slice(0, 20000), target: item.target ? { hub: String(item.target.hub || ''), actionCode: item.target.actionCode ? String(item.target.actionCode) : null, payload: item.target.payload ?? null } : null, attachments: (item.attachments || []).map(String).slice(0, 20), status: 'NEW', ownerUserId: ctx.actorId, createdAt: new Date().toISOString(), resolvedAt: null, lastError: null } }, C(ctx));
            },
            async list(p, ctx) {
                const rows = (await core.entities.list()).filter((r) => r.type === T && r.data.ownerUserId === ctx.actorId && (!p?.status || r.data.status === p.status)).sort((a, b) => String(b.data.createdAt).localeCompare(String(a.data.createdAt)));
                const ok = await signedIn(ctx.actorId);
                return rows.map((r) => { const locked = prot(r.data.target?.hub) && !ok; return locked ? { id: r.id, locked: true, hub: r.data.target.hub, status: r.data.status, createdAt: r.data.createdAt, source: r.data.source, reason: r.data.reason } : { id: r.id, locked: false, ...r.data }; });
            },
            async count(ctx) { return (await core.entities.list()).filter((r) => r.type === T && r.data.ownerUserId === ctx.actorId && r.data.status === 'NEW').length; },
            async resolve(p, ctx) {
                const r = await core.entities.get(p?.id);
                if (!r || r.type !== T || r.data.ownerUserId !== ctx.actorId)
                    throw new Error('INBOX_NOT_FOUND');
                const st = p?.status === 'DISCARDED' ? 'DISCARDED' : 'DONE';
                return core.entities.save({ ...r, data: { ...r.data, status: st, resolvedAt: new Date().toISOString() }, expectedRevision: r.revision }, C(ctx));
            },
            /* retry the original action (same permissions / protection as a click); success → DONE, failure → stays NEW with the error */
            async retry(p, ctx) {
                const r = await core.entities.get(p?.id);
                if (!r || r.type !== T || r.data.ownerUserId !== ctx.actorId)
                    throw new Error('INBOX_NOT_FOUND');
                const t = r.data.target;
                if (!t?.actionCode)
                    throw new Error('INBOX_NO_ACTION');
                if (/^ACTION\.CORE\.(INBOX|API|IDENTITY|AI)\./.test(t.actionCode))
                    throw new Error('INBOX_ACTION_FORBIDDEN');
                /* the user's explicit retry click = the permission of the original action (as the click in its own form); protected owners still need the session */
                const def = core.actions.list().find((d) => d.code === t.actionCode);
                const perms = [...(ctx.permissions || []), ...(def?.permission ? [def.permission] : [])];
                try {
                    const out = await core.actions.invoke(t.actionCode, t.payload ?? {}, { ...ctx, permissions: perms, confirmed: true });
                    await core.entities.save({ ...r, data: { ...r.data, status: 'DONE', resolvedAt: new Date().toISOString(), lastError: null }, expectedRevision: r.revision }, C(ctx));
                    return { status: 'DONE', result: out };
                }
                catch (e) {
                    const fresh = await core.entities.get(r.id);
                    await core.entities.save({ ...fresh, data: { ...fresh.data, lastError: String(e?.message || e).slice(0, 300) }, expectedRevision: fresh.revision }, C(ctx));
                    return { status: 'NEW', error: String(e?.message || e) };
                }
            }
        };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.INBOX.ADD', 'SAFE_WRITE', (p, c) => svc.add(p, c));
        reg('ACTION.CORE.INBOX.LIST', 'READ', (p, c) => svc.list(p, c));
        reg('ACTION.CORE.INBOX.COUNT', 'READ', (_p, c) => svc.count(c));
        reg('ACTION.CORE.INBOX.RESOLVE', 'SAFE_WRITE', (p, c) => svc.resolve(p, c));
        reg('ACTION.CORE.INBOX.RETRY', 'SAFE_WRITE', (p, c) => svc.retry(p, c));
        core.inbox = svc;
        return svc;
    }
    /* N2.4y: drafts registry – a form registers an opener; save() makes a new draft or updates the one being continued */
    const OPENERS = {};
    const drafts = { register(form, opener) { OPENERS[form] = opener; }, opener(form) { return OPENERS[form] || null; },
        async save(core, ctx, form, hub, values, title, draftId) {
            const IB = core.inbox;
            if (!IB)
                return null;
            const IT = (k) => globalThis.KXI18n?.UI?.[k]?.cs || k;
            const t = `${IT('draft.prefix')}: ${String(title || '').trim() || IT('draft.untitled')}`;
            const C = { actorId: ctx.actorId, appCode: 'APP.KX.NEXUS', deviceId: ctx.deviceId, permissions: [], confirmed: true };
            if (draftId) {
                const r = await core.entities.get(draftId).catch(() => null);
                if (r && r.type === T && r.data.status === 'NEW' && r.data.ownerUserId === ctx.actorId)
                    return core.entities.save({ ...r, data: { ...r.data, title: t, text: JSON.stringify(values, null, 1), target: { hub, actionCode: null, payload: { form, values } } }, expectedRevision: r.revision }, C);
            }
            return IB.add({ source: 'DRAFT', reason: 'DRAFT', title: t, text: JSON.stringify(values, null, 1), target: { hub, actionCode: null, payload: { form, values } } }, C);
        } };
    /* N2.4y: LEAVE GUARD across the whole NEXUS – a form that disappears (another hub / section, inspector closed, re-render)
       with unsaved user input is saved as a draft (labels + values) – nothing lost. Values are readable from the detached nodes.
       Never captured: passwords / PINs, identity, AI connections, API tokens, search and filters, file inputs. A save click marks the
       form committed; if the form is still on screen 1.5 s later (save failed) the mark is cleared. Forms with their own draft
       handling (data-kx-draft-own) are watched through drafts.watch(el, collect). */
    const NEVER = '[type="password"],[type="file"],[type="search"],[data-no-draft],[data-man-search],[data-identity],#identitySecret,#identityUser,[data-ai-conn-modal] *,[data-api-modal] *,[data-api-token]';
    const NEVER_CONTAINER = '[data-calc-box],[data-no-draft],[data-ai-conn-modal],[data-api-modal],[data-identity-section],.sidebar,.topbar,header,[data-profile-menu],[data-inbox-modal],[data-mynd-modal]';
    const CONT = '[data-kx-draft-own],[data-kx-draft],.modal,[data-lh-form],[data-veh-form],.kx-lcard,.ins-section';
    /* view / filter controls are not data (filter, scope, sort, search, range, view, mode, tab, language, month, period, theme …) */
    const CONTROL = /(filter|scope|sort|search|range|view|mode|tab|locale|lang|page|zoom|month|year|period|preset|layout|theme|query|(^|-)q$|settingsapp)/i;
    const isControl = (f) => CONTROL.test(String(f.id || '')) || [...(f.attributes || [])].some((a) => /^data-/.test(a.name) && CONTROL.test(a.name.slice(5)));
    const SAVE_ATTR = /^data-[a-z0-9-]*-(save|create-save|apply|create)$/;
    const isSaveBtn = (b) => [...(b.attributes || [])].some((a) => SAVE_ATTR.test(a.name)) || /^(uložit|vytvořit|save|create)\b/i.test((b.textContent || '').trim());
    const hasSave = (c) => Array.from(c.querySelectorAll('button')).some(isSaveBtn);
    const watches = [];
    let core0 = null, ctx0 = null;
    const fieldLabel = (f) => { /* prefer the visible label, then the placeholder, then the field key */ const l = f.closest('label'); const t = (l?.querySelector('span')?.textContent || l?.childNodes?.[0]?.textContent || f.getAttribute('placeholder') || f.dataset?.ff || f.name || f.id || '').trim(); return t.slice(0, 60) || '?'; };
    /* only the fields the user actually changed (defaults are not user input) */ const collectGeneric = (el, touched) => { const out = {}; el.querySelectorAll('input,select,textarea').forEach((f) => { if (f.matches(NEVER) || f.closest(NEVER_CONTAINER))
        return; if (touched && !touched.has(f))
        return; const lb = fieldLabel(f); if (lb === '?')
        return; /* an unlabeled field says nothing to the user */ /* an unlabeled field says nothing to the user */ if (f.type === 'checkbox' || f.type === 'radio') {
        if (f.checked)
            out[lb] = '✓';
        return;
    } const v = String(f.value || '').trim(); if (v)
        out[lb] = v.slice(0, 2000); }); return out; };
    const placeOf = (el) => { const hub = document.querySelector('#inspector [data-hub-manual]')?.dataset.hubManual || 'APP.NEXUS'; const title = (el.closest('.modal')?.querySelector('.drawer-head b')?.textContent || document.querySelector('#inspector h2,#inspector .drawer-head b')?.textContent || '').trim().slice(0, 80); return { hub, title }; };
    async function flush(w) {
        if (!core0 || !ctx0 || w.committed || !w.dirty)
            return; /* N2.6b: saved recently and every edited field has since been re-rendered = the save went through (slow machines re-render later than the 1.5 s mark) -> not a draft */
        if (w.savedAt && Date.now() - w.savedAt < 60000 && w.touched && w.touched.size && ![...w.touched].some((f) => f?.isConnected)) {
            w.dirty = false;
            w.touched.clear();
            return;
        }
        let info;
        try {
            info = w.collect();
        }
        catch {
            return;
        }
        if (!info)
            return;
        if (info.form) {
            if (!info.filled)
                return;
            await drafts.save(core0, ctx0, info.form, info.hub, info.values, info.title, info.draftId);
            return;
        }
        const vals = info.values || {};
        if (!Object.keys(vals).length)
            return;
        const IT = (k) => globalThis.KXI18n?.UI?.[k]?.cs || k;
        try {
            await core0.inbox?.add({ source: 'DRAFT', reason: 'DRAFT', title: `${IT('draft.prefix')}: ${info.title || IT('draft.untitled')}`, text: Object.entries(vals).map(([k, v]) => `${k}: ${v}`).join('\n'), target: { hub: info.hub || 'APP.NEXUS', actionCode: null, payload: { form: 'GENERIC', values: vals } } }, { actorId: ctx0.actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        }
        catch { }
    }
    function watch(el, collect) { if (watches.some(w => w.el === el))
        return; watches.push({ el, collect, dirty: false, committed: false, own: true }); }
    function start(core, ctx) {
        core0 = core;
        ctx0 = ctx;
        if (typeof document === 'undefined' || globalThis.__kxLeaveGuard)
            return;
        globalThis.__kxLeaveGuard = true;
        const findWatch = (t) => {
            const own = watches.find(w => w.own && w.el.contains(t));
            if (own)
                return own; /* the nearest container that has a save / create button (the field may sit in a smaller card) */
            let c = t.closest?.(CONT);
            while (c && !hasSave(c))
                c = c.parentElement?.closest(CONT) || null;
            if (!c || c.closest(NEVER_CONTAINER) || c.closest('[data-kx-draft-own]') || c.querySelector('[data-kx-draft-own]'))
                return null;
            /* only real forms: a container with a save / create button (calculators and inline edits that save themselves are not drafts) */
            if (!c)
                return null;
            let w = watches.find(x => x.el === c);
            if (!w) { /* the place (hub + title) is remembered NOW – at flush time another hub may be open */
                const place = placeOf(c);
                const touched = new Set();
                const nw = { el: c, collect: () => ({ values: collectGeneric(c, touched), ...place }), dirty: false, committed: false, own: false, touched, place };
                watches.push(nw);
                w = nw;
            }
            return w;
        };
        document.addEventListener('input', (e) => { const t = e.target; if (!t?.matches || t.matches(NEVER) || t.closest(NEVER_CONTAINER) || isControl(t))
            return; const w = findWatch(t); if (w) {
            w.dirty = true;
            w.committed = false;
            w.touched?.add(t);
        } }, true);
        document.addEventListener('change', (e) => { const t = e.target; if (!t?.matches || t.matches(NEVER) || t.closest(NEVER_CONTAINER) || isControl(t) || t.tagName !== 'SELECT')
            return; const w = findWatch(t); if (w) {
            w.dirty = true;
            w.committed = false;
            w.touched?.add(t);
        } }, true);
        document.addEventListener('click', (e) => { const b = e.target?.closest?.('button'); if (!b)
            return; const isSave = [...b.attributes].some((a) => /^data-[a-z0-9-]*-(save|create-save|apply|create|draft)$/.test(a.name)) || /^(uložit|vytvořit|save|create)\b/i.test((b.textContent || '').trim()); if (!isSave)
            return; const w = watches.find(x => x.el.contains(b)); if (!w)
            return; w.committed = true; w.savedAt = Date.now(); setTimeout(() => { if (!(w.el.isConnected && w.dirty && !w.el.closest('.modal-wrap:not(.open)')))
            return; /* N2.6b: a form that stays open after a SUCCESSFUL save (it re-rendered: the edited fields are gone) is clean – no false draft; same fields still on screen = save did not go through -> keep capturing */ /* N2.6b: a form that stays open after a SUCCESSFUL save (it re-rendered: the edited fields are gone) is clean – no false draft; same fields still on screen = save did not go through -> keep capturing */ const still = [...(w.touched || [])].some((f) => f?.isConnected); if (w.touched && w.touched.size && !still) {
            w.dirty = false;
            w.touched.clear();
            w.committed = false;
        }
        else
            w.committed = false; }, 1500); }, true);
        /* gone from the page, or its window closed (windows stay in the page, only hidden) */ const gone = (w) => !w.el.isConnected || !!w.el.closest('.modal-wrap:not(.open)');
        const mo = new MutationObserver(() => { for (let i = watches.length - 1; i >= 0; i--) {
            const w = watches[i];
            if (gone(w)) {
                watches.splice(i, 1);
                void flush(w);
            }
        } });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        window.addEventListener('pagehide', () => { for (const w of watches)
            void flush(w); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden')
            for (const w of watches)
                void flush(w); });
    }
    drafts.watch = watch;
    drafts.start = start;
    drafts.collectGeneric = (el) => collectGeneric(el);
    drafts.NEVER = NEVER;
    drafts.isControl = isControl;
    KXInbox = { T, SOURCES, REASONS, install, drafts };
    globalThis.KXInbox = KXInbox;
})();
