// N2.5i (user 2026-10-25): „👉 Štouchnout“ – send a PLACE (record, hub + tab, a window with its settings, a setting, a guide, a field) to
// myself (all / one of my devices) or to another member; it arrives in their notifications WITH a label who sent it; one click opens
// exactly that place (a draft of a half-filled form can travel too). Built like the handoff (N2.1m): a core entity that travels with the
// sync package. Rights: a member only receives what they may see (refused with the reason). Only the place (+ draft without secrets)
// is sent. States: NEW · OPENED · DRAFT (rozpracované) · HIDDEN (skryté) – nothing is deleted except by an explicit, confirmed delete
// (→ core trash with restore).
var KXPoke;
(function () {
    const OWNER = 'APP.KX.NEXUS', TYPE = 'CORE.POKE';
    const KINDS = ['RECORD', 'HUB', 'WINDOW', 'SETTING', 'GUIDE'];
    const WINDOWS = ['IMPORT', 'CAMERA', 'CONTACTS', 'LISTS', 'KAIRA', 'WORKLOAD', 'INBOX'];
    const STATUS = ['NEW', 'OPENED', 'DRAFT', 'HIDDEN'];
    const SECRET = /pass|heslo|pin\b|cvc|cvv|card.?num|secret|token|klic|key/i;
    const MAX_DRAFT = 20000;
    function cleanDraft(d, depth = 0) {
        if (d == null || depth > 4)
            return undefined;
        if (Array.isArray(d))
            return d.slice(0, 200).map(x => cleanDraft(x, depth + 1));
        if (typeof d === 'object') {
            const o = {};
            for (const [k, v] of Object.entries(d)) {
                if (SECRET.test(k))
                    continue;
                const c = cleanDraft(v, depth + 1);
                if (c !== undefined)
                    o[k] = c;
            }
            return o;
        }
        if (typeof d === 'string')
            return d.slice(0, 4000);
        if (typeof d === 'number' || typeof d === 'boolean')
            return d;
        return undefined;
    }
    function install(core) {
        if (core.pokes)
            return core.pokes;
        const users = async () => { try {
            return await core.memberships.listUsers();
        }
        catch {
            return [];
        } };
        const nameOf = async (id) => String((await users()).find((u) => u.id === id)?.displayName || id);
        /* may the recipient see the place? (same gates as everywhere: hub read gate + record inspector) */
        async function canSee(place, who) {
            try {
                if (place.kind === 'RECORD') {
                    await core.inspector.inspect(core.deepLinks.parse(String(place.ref)), who);
                    return true;
                }
                const hub = place.hub || place.params?.hub || place.params?.ownerApp;
                if (hub)
                    return await core.ownerReadGate.allows(String(hub), who);
                if (place.kind === 'WINDOW' && place.window === 'IMPORT' && place.params?.target) {
                    const t = core.importer?.target?.(String(place.params.target));
                    if (t?.ownerApp)
                        return await core.ownerReadGate.allows(t.ownerApp, who);
                }
                return true;
            }
            catch {
                return false;
            }
        }
        async function commonSpace(a, b) {
            const sa = await core.propagate.spaces(a), sb = new Set((await core.propagate.spaces(b)).map((s) => s.id));
            const both = sa.filter((s) => sb.has(s.id) && s.kind !== 'PERSONAL');
            for (const k of ['FAMILY', 'SHARED', 'COMPANY'])
                for (const s of both)
                    if (s.kind === k || String(s.id).includes(k))
                        return s.id;
            return both[0]?.id || null;
        }
        const svc = { KINDS, WINDOWS, cleanDraft,
            async send(p, ctx) {
                const me = ctx.actorId;
                const place = p?.place || {};
                if (!KINDS.includes(place.kind))
                    throw new Error('POKE_PLACE_INVALID');
                if (place.kind === 'RECORD') {
                    try {
                        core.deepLinks.parse(String(place.ref));
                    }
                    catch {
                        throw new Error('POKE_PLACE_INVALID');
                    }
                }
                if (place.kind === 'WINDOW' && !WINDOWS.includes(place.window))
                    throw new Error('POKE_WINDOW_UNKNOWN');
                if (!await canSee(place, me))
                    throw new Error('POKE_NOT_ALLOWED');
                const to = p?.to || { kind: 'SELF' };
                let toUser = me, deviceId = null;
                if (to.kind === 'DEVICE') {
                    deviceId = String(to.deviceId || '').slice(0, 80) || null;
                }
                else if (to.kind === 'USER') {
                    toUser = String(to.userId || '');
                    if (!(await users()).some((u) => u.id === toUser))
                        throw new Error('POKE_RECIPIENT_UNKNOWN');
                }
                else if (to.kind !== 'SELF')
                    throw new Error('POKE_RECIPIENT_UNKNOWN');
                if (toUser !== me && !await canSee(place, toUser))
                    throw new Error(`POKE_RECIPIENT_CANNOT_SEE ${await nameOf(toUser)}`);
                const space = toUser === me ? ((await core.propagate.spaces(me)).find((s) => s.kind === 'PERSONAL') || {}).id : await commonSpace(me, toUser);
                if (!space)
                    throw new Error('POKE_NO_COMMON_SPACE');
                let draft = p?.draft != null ? cleanDraft(p.draft) : undefined;
                if (draft && JSON.stringify(draft).length > MAX_DRAFT)
                    throw new Error('POKE_DRAFT_TOO_LARGE');
                const path = (Array.isArray(p?.path) ? p.path : []).slice(0, 8).map((x) => String(x).slice(0, 60));
                const rec = await core.entities.save({ type: TYPE, ownerApp: OWNER, schema: 'KX.POKE/1', spaceIds: [space], data: { fromUserId: me, toUserId: toUser, toDeviceId: deviceId, fromDeviceId: ctx.deviceId || null,
                        place: { kind: place.kind, ref: place.ref ? String(place.ref) : undefined, hub: place.hub ? String(place.hub) : undefined, tab: place.tab ? String(place.tab).slice(0, 80) : undefined, field: place.field ? String(place.field).slice(0, 80) : undefined, window: place.window, params: place.params ? cleanDraft(place.params) : undefined, guide: place.guide ? String(place.guide).slice(0, 80) : undefined, setting: place.setting ? String(place.setting).slice(0, 120) : undefined },
                        path, note: String(p?.note || '').slice(0, 500), draft, status: 'NEW', sentAt: new Date().toISOString() } }, { ...ctx, appCode: OWNER });
                return { id: rec.id, space, toUserId: toUser };
            },
            /* the recipient's box – only pokes addressed to the actor (and to this device or to all devices) */
            async inbox(p, ctx) {
                const me = ctx.actorId;
                const want = p?.status ? String(p.status) : null;
                const out = [];
                for (const r of await core.entities.list()) {
                    if (r.type !== TYPE || r.archivedAt || r.trashedAt)
                        continue;
                    const d = r.data || {};
                    if (d.toUserId !== me)
                        continue;
                    if (d.toDeviceId && ctx.deviceId && d.toDeviceId !== ctx.deviceId)
                        continue;
                    if (want ? d.status !== want : d.status === 'HIDDEN')
                        continue;
                    out.push({ id: r.id, revision: r.revision, from: d.fromUserId, fromName: await nameOf(d.fromUserId), self: d.fromUserId === me, place: d.place, path: d.path || [], note: d.note || '', hasDraft: !!d.draft, draft: d.draft, status: d.status, sentAt: d.sentAt });
                }
                return out.sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
            },
            async mark(p, ctx) {
                const r = await core.entities.get(String(p?.id || ''));
                if (!r || r.type !== TYPE || r.data?.toUserId !== ctx.actorId)
                    throw new Error('POKE_NOT_FOUND');
                const st = String(p?.status || '');
                if (!STATUS.includes(st))
                    throw new Error('POKE_STATUS_INVALID');
                await core.entities.save({ ...r, expectedRevision: r.revision, data: { ...r.data, status: st, [st === 'OPENED' ? 'openedAt' : st === 'HIDDEN' ? 'hiddenAt' : 'changedAt']: new Date().toISOString() } }, { ...ctx, appCode: OWNER });
                return { id: r.id, status: st };
            },
            /* delete only when explicitly confirmed – into the core trash (restore possible) */
            async remove(p, ctx) { if (p?.confirmed !== true)
                throw new Error('POKE_DELETE_NEEDS_CONFIRM'); const r = await core.entities.get(String(p?.id || '')); if (!r || r.type !== TYPE || r.data?.toUserId !== ctx.actorId)
                throw new Error('POKE_NOT_FOUND'); /* like contacts: archived = in the NEXUS trash, restorable */ /* like contacts: archived = in the NEXUS trash, restorable */ await core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, { ...ctx, appCode: OWNER }); return { id: r.id, trashed: true }; } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.POKE.SEND', 'SAFE_WRITE', (p, c) => svc.send(p, c));
        reg('ACTION.CORE.POKE.INBOX', 'READ', (p, c) => svc.inbox(p, c));
        reg('ACTION.CORE.POKE.MARK', 'SAFE_WRITE', (p, c) => svc.mark(p, c));
        reg('ACTION.CORE.POKE.DELETE', 'SAFE_WRITE', (p, c) => svc.remove(p, c));
        core.pokes = svc;
        return svc;
    }
    KXPoke = { install, cleanDraft };
    globalThis.KXPoke = KXPoke;
})();
