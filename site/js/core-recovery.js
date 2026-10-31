// N2.5a: recovery key + emergency access of the superadmin (user 2026-10-24).
// - Generate: only the signed-in superadmin; shown ONCE; stored only as PBKDF2-SHA-256 (salt, 100 000 iterations) – never the key.
// - Emergency: key + reason + NEW PIN (mandatory) → the superadmin PIN is replaced (identity recovery reset revokes other sessions),
//   the used key stops working, a NEW key is generated and shown once (to print), audit + notice to the parents (inbox).
// - Brute force: failed attempts lock with a growing pause, kept in the core (survives a restart). Never through API / MCP / Kaira.
var KXRecovery;
(function () {
    const ID = 'CORE.RECOVERY_KEY.CURRENT', T = 'CORE.RECOVERY_KEY', OWNER = 'APP.KX.NEXUS', ITER = 100000;
    const A32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const enc = (b) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
    async function derive(key, salt) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, k, 256); return enc(new Uint8Array(bits)); }
    const norm = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    function newKey() { const r = crypto.getRandomValues(new Uint8Array(25)); const c = Array.from(r).map(x => A32[x % 32]).join(''); return [0, 5, 10, 15, 20].map(i => c.slice(i, i + 5)).join('-'); }
    const same = (a, b) => { if (a.length !== b.length)
        return false; let d = 0; for (let i = 0; i < a.length; i++)
        d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
    const IT = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    function install(core) {
        if (core.recoveryKey)
            return core.recoveryKey;
        const SYS = (actor) => ({ actorId: actor || 'SYSTEM', appCode: OWNER, permissions: [], confirmed: true });
        const get = async () => { try {
            const r = await core.entities.get(ID);
            return r && r.type === T ? r : null;
        }
        catch {
            return null;
        } };
        const put = async (data, actor) => { const old = await get(); return core.entities.save({ id: ID, type: T, ownerApp: OWNER, schema: 'KX.RECOVERY_KEY/1', spaceIds: [], expectedRevision: old?.revision, data }, SYS(actor)); };
        const sa = async () => core.hubRights ? await core.hubRights.superadmin() : null;
        const audit = async (actor, code, detail) => { try {
            await core.audit.write({ actorId: actor, appCode: OWNER, actionCode: code, entityType: 'RECOVERY', entityId: ID, rootChangeId: 'RECOVERY.' + Date.now(), result: 'OK', detail });
        }
        catch { } };
        const make = async (actor) => {
            const key = newKey();
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const old = await get();
            await put({ hash: await derive(norm(key), salt), salt: enc(salt), iterations: ITER, status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: actor, failed: 0, lockedUntil: null, generation: (old?.data?.generation || 0) + 1 }, actor);
            return key;
        };
        const svc = {
            async status() { const r = await get(); return r ? { status: r.data.status, createdAt: r.data.createdAt, generation: r.data.generation, lockedUntil: r.data.lockedUntil } : { status: 'NONE' }; },
            /* only the signed-in superadmin creates (or replaces) the key; shown once */
            async generate(ctx) {
                const s = await sa();
                if (!s || ctx?.actorId !== s)
                    throw new Error('RECOVERY_ONLY_SUPERADMIN');
                let who = null;
                try {
                    who = await core.identity.validate();
                }
                catch {
                    who = null;
                }
                if (who !== s)
                    throw new Error('AUTH_SESSION_REQUIRED');
                const key = await make(s);
                await audit(s, 'AUDIT.RECOVERY.KEY_GENERATED', {});
                return { key };
            },
            /* the verifier used by identity – consumes the key on success; locks on failures */
            async verify(userId, key) {
                const s = await sa();
                const r = await get();
                if (!s || userId !== s || !r || r.data.status !== 'ACTIVE')
                    return false;
                if (r.data.lockedUntil && Date.parse(r.data.lockedUntil) > Date.now())
                    throw new Error('RECOVERY_LOCKED');
                const ok = same(await derive(norm(key), new Uint8Array((r.data.salt.match(/../g) || []).map((h) => parseInt(h, 16)))), r.data.hash);
                if (!ok) {
                    const f = (r.data.failed || 0) + 1;
                    const pause = f >= 3 ? Math.min(24 * 60, 2 ** (f - 3)) * 60000 : 0;
                    await put({ ...r.data, failed: f, lockedUntil: pause ? new Date(Date.now() + pause).toISOString() : null }, s);
                    await audit(s, 'AUDIT.RECOVERY.KEY_FAILED', { failed: f });
                    return false;
                }
                await put({ ...r.data, status: 'USED', usedAt: new Date().toISOString(), failed: 0, lockedUntil: null }, s);
                return true;
            },
            /* emergency: key + reason + new PIN → new PIN, key used, NEW key, audit, notice to parents */
            async emergency(p, ctx) {
                const s = await sa();
                if (!s)
                    throw new Error('RECOVERY_NO_SUPERADMIN');
                const reason = String(p?.reason || '').trim();
                if (reason.length < 5)
                    throw new Error('RECOVERY_REASON_REQUIRED');
                if (typeof p?.newSecret !== 'string' || p.newSecret.length < 6)
                    throw new Error('RECOVERY_NEW_PIN_REQUIRED');
                await core.identity.recoveryReset({ userId: s, secret: p.newSecret, recoveryKey: String(p?.key || '') }, { ...SYS(s), deviceId: ctx?.deviceId });
                const key = await make(s);
                const det = { reason, deviceId: ctx?.deviceId || null, at: new Date().toISOString() };
                await audit(s, 'AUDIT.RECOVERY.EMERGENCY_USED', det);
                try {
                    if (core.inbox && core.hubRights) {
                        for (const u of await core.memberships.listUsers()) {
                            if (u.id === s)
                                continue;
                            if ((await core.hubRights.roleOf(u.id)) !== 'PARENT')
                                continue;
                            await core.inbox.add({ source: 'MANUAL', reason: 'VALIDATION', title: IT('recovery.notice.title', {}), text: IT('recovery.notice.text', { reason, at: det.at, device: det.deviceId || '—' }), target: { hub: OWNER, actionCode: null, payload: null } }, { actorId: u.id, appCode: OWNER, permissions: [], confirmed: true });
                        }
                    }
                }
                catch { }
                return { newKey: key };
            }
        };
        try {
            core.identity?.setRecoveryVerifier((u, k) => svc.verify(u, k));
        }
        catch { }
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.RECOVERY.STATUS', 'READ', () => svc.status());
        reg('ACTION.CORE.RECOVERY.GENERATE', 'SENSITIVE_WRITE', (_p, c) => svc.generate(c));
        reg('ACTION.CORE.RECOVERY.EMERGENCY', 'SENSITIVE_WRITE', (p, c) => svc.emergency(p, c));
        core.recoveryKey = svc;
        return svc;
    }
    KXRecovery = { install, newKey };
    globalThis.KXRecovery = KXRecovery;
})();
