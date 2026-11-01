// N2.1e — trusted LOCAL identity + session (KX.CORE_IDENTITY/1), valid for the whole NEXUS.
// What it is:
//  - a per-user local secret (PIN/passphrase, >= 6 chars) stored ONLY as PBKDF2-SHA-256 (random 16 B salt,
//    >= 100 000 iterations) on a Core entity CORE.IDENTITY.CREDENTIAL in the user's personal space
//    (Core revision + audit + outbox); constant-time comparison; lockout with exponential back-off;
//  - a session = Core entity CORE.IDENTITY.SESSION bound to subject, device, workspace and the credential's
//    secretVersion; the 256-bit session token exists ONLY in this runtime's memory (the entity keeps its
//    SHA-256). A reload therefore always requires a new sign-in; a persisted ACTIVE row alone never authenticates;
//  - absolute lifetime 12 h, idle timeout 15 min, explicit sign-out, PIN change revokes the user's other sessions;
//  - provider() => {getAuthenticatedSubjectId} used by the Core Tasks adapter (fails closed with AUTH_SESSION_*).
// What it is NOT (stated, never simulated): no encryption of data at rest, no server, no SSO.
// Google / Apple / Microsoft sign-in are UNAVAILABLE until a real Client ID is configured.
var KXIdentity;
(function (NS) {
    const CRED = 'CORE.IDENTITY.CREDENTIAL', SESS = 'CORE.IDENTITY.SESSION', OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_IDENTITY/1';
    const POLICY = Object.freeze({ kdf: 'PBKDF2-SHA-256', iterations: 210000, minIterations: 100000, saltBytes: 16, minSecretLength: 6, maxSecretLength: 128,
        maxFailedBeforeLock: 5, lockBaseMs: 30000, lockMaxMs: 15 * 60000, idleTimeoutMs: 15 * 60000, absoluteTtlMs: 12 * 3600000, touchThrottleMs: 30000 });
    const EXTERNAL = Object.freeze(['GOOGLE', 'APPLE', 'MICROSOFT'].map(p => Object.freeze({ provider: p, status: 'UNAVAILABLE', reason: 'CLIENT_ID_NOT_CONFIGURED' })));
    const enc = (s) => new TextEncoder().encode(s);
    const b64 = (u) => { let s = ''; for (const x of u)
        s += String.fromCharCode(x); return btoa(s); };
    const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const rnd = (n) => { const u = new Uint8Array(n); crypto.getRandomValues(u); return u; };
    const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    const sha256 = async (u) => hex(await crypto.subtle.digest('SHA-256', u));
    async function derive(secret, salt, iterations) {
        const key = await crypto.subtle.importKey('raw', enc(secret), 'PBKDF2', false, ['deriveBits']);
        return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
    }
    const same = (a, b) => { if (a.length !== b.length)
        return false; let d = 0; for (let i = 0; i < a.length; i++)
        d |= a[i] ^ b[i]; return d === 0; };
    const credId = (userId) => `IDENTITY.CREDENTIAL.${userId}`;
    const isProtectedType = (type) => typeof type === 'string' && type.startsWith('CORE.IDENTITY.');
    const checkSecret = (s) => {
        if (typeof s !== 'string')
            throw new Error('IDENTITY_SECRET_REQUIRED');
        if (s.length < POLICY.minSecretLength)
            throw new Error('IDENTITY_SECRET_TOO_SHORT');
        if (s.length > POLICY.maxSecretLength)
            throw new Error('IDENTITY_SECRET_TOO_LONG');
        if (/^(.)\1+$/.test(s))
            throw new Error('IDENTITY_SECRET_TRIVIAL');
        return s;
    };
    class IdentityService {
        core;
        opts;
        current = null;
        lastTouch = 0;
        policy;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
            const it = Number.isInteger(opts.iterations) ? opts.iterations : POLICY.iterations;
            if (it < POLICY.minIterations)
                throw new Error('IDENTITY_KDF_ITERATIONS_TOO_LOW');
            this.policy = Object.freeze({ ...POLICY, iterations: it });
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        iso(ms) { return new Date(ms).toISOString(); }
        sys(ctx) { return { actorId: ctx?.actorId || 'SYSTEM', appCode: ctx?.appCode || OWNER, deviceId: ctx?.deviceId, rootChangeId: ctx?.rootChangeId }; }
        async personalSpace(userId) {
            const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === userId && !x.archivedAt);
            if (!s)
                throw new Error('IDENTITY_NO_PERSONAL_SPACE');
            return s.id;
        }
        async credential(userId) { const r = await this.core.entities.get(credId(userId)); return r && r.type === CRED && r.data?.subjectId === userId && !r.archivedAt ? r : null; }
        async enrolledUsers() { return (await this.core.entities.list()).filter((r) => r.type === CRED && r.id === credId(r.data?.subjectId) && !r.archivedAt).map((r) => r.data.subjectId).sort(); }
        async activeUser(userId) {
            if (typeof userId !== 'string' || !userId)
                throw new Error('IDENTITY_USER_REQUIRED');
            const u = await this.core.memberships.getUser(userId);
            if (!u)
                throw new Error('IDENTITY_UNKNOWN_USER');
            if (u.status && u.status !== 'ACTIVE')
                throw new Error('IDENTITY_USER_DISABLED');
            return u;
        }
        async isAdmin(subjectId) { for (const s of await this.core.memberships.listSpaces()) {
            if (s.archivedAt || s.kind !== 'FAMILY')
                continue;
            if (await this.core.memberships.roleFor(s.id, subjectId) === 'MANAGE')
                return true;
        } return false; }
        // ---- session --------------------------------------------------------------------------------
        async closeRow(row, status, reason, ctx) {
            if (!row || row.data?.status !== 'ACTIVE')
                return row;
            try {
                return await this.core.entities.save({ id: row.id, type: SESS, ownerApp: OWNER, schema: row.schema, spaceIds: row.spaceIds, expectedRevision: row.revision,
                    data: { ...row.data, status, endedAt: this.iso(this.now()), endReason: reason } }, this.sys(ctx));
            }
            catch {
                return row;
            }
        }
        fail(code) { this.current = null; throw new Error(code); }
        async validate() {
            const cur = this.current;
            if (!cur)
                throw new Error('AUTH_SESSION_REQUIRED');
            const row = await this.core.entities.get(cur.sessionId);
            if (!row || row.type !== SESS || row.data?.status !== 'ACTIVE')
                this.fail('AUTH_SESSION_REVOKED');
            if (await sha256(cur.token) !== row.data.tokenSha256)
                this.fail('AUTH_SESSION_TOKEN_MISMATCH');
            const t = this.now(), d = row.data;
            if (t >= Date.parse(d.expiresAt)) {
                await this.closeRow(row, 'EXPIRED', 'ABSOLUTE_TTL', { actorId: 'SYSTEM' });
                this.fail('AUTH_SESSION_EXPIRED');
            }
            if (t - Date.parse(d.lastSeenAt) >= this.policy.idleTimeoutMs) {
                await this.closeRow(row, 'EXPIRED', 'IDLE_TIMEOUT', { actorId: 'SYSTEM' });
                this.fail('AUTH_SESSION_IDLE');
            }
            const u = await this.core.memberships.getUser(d.subjectId);
            if (!u || (u.status && u.status !== 'ACTIVE')) {
                await this.closeRow(row, 'REVOKED', 'USER_DISABLED', { actorId: 'SYSTEM' });
                this.fail('AUTH_SESSION_REVOKED');
            }
            const c = await this.credential(d.subjectId);
            if (!c || c.data.secretVersion !== d.secretVersion) {
                await this.closeRow(row, 'REVOKED', 'CREDENTIAL_CHANGED', { actorId: 'SYSTEM' });
                this.fail('AUTH_SESSION_REVOKED');
            }
            if (t - this.lastTouch >= this.policy.touchThrottleMs) {
                this.lastTouch = t;
                try {
                    await this.core.entities.save({ id: row.id, type: SESS, ownerApp: OWNER, schema: row.schema, spaceIds: row.spaceIds, expectedRevision: row.revision, data: { ...d, lastSeenAt: this.iso(t) } }, { actorId: d.subjectId, appCode: OWNER });
                }
                catch { /* concurrent touch: the other writer refreshed lastSeenAt */ }
            }
            return d.subjectId;
        }
        provider() { return Object.freeze({ getAuthenticatedSubjectId: () => this.validate() }); }
        // N2.1f: every action owned by a protected hub requires a verified session whose subject is the acting user
        // (Core-level guard on the ActionBus, not only the UI). SYSTEM is not exempt for protected hubs.
        protectedOwners = null;
        protectOwners(owners) {
            if (this.protectedOwners)
                throw new Error('IDENTITY_PROTECTED_OWNERS_ALREADY_SET');
            if (!Array.isArray(owners) || !owners.length || owners.some(o => typeof o !== 'string' || !/^APP\.KX\.[A-Z0-9_]+$/.test(o)))
                throw new Error('IDENTITY_PROTECTED_OWNERS_INVALID');
            if (typeof this.core.actions.addGuard !== 'function')
                throw new Error('IDENTITY_ACTION_GUARD_UNAVAILABLE');
            const set = new Set(owners);
            this.core.actions.addGuard('CORE.IDENTITY.SESSION_GUARD', async (def, ctx) => {
                if (!set.has(def.ownerApp))
                    return;
                /* N2.6b: DEMO prostor = jen vymyšlená, oddělená data → chráněné huby bez přihlášení (ostrý prostor beze změny) */ if (String(this.core?.workspaceProfile?.mode || '') === 'DEMO')
                    return;
                let subject;
                try {
                    subject = await this.validate();
                }
                catch (e) {
                    throw new Error(`AUTH_SESSION_REQUIRED_FOR_HUB ${def.ownerApp} (${String(e?.message || e)})`);
                }
                if (subject !== ctx?.actorId)
                    throw new Error(`AUTH_SUBJECT_MISMATCH for ${def.ownerApp}`);
            });
            if (this.core.ownerReadGate?.set)
                this.core.ownerReadGate.set(async (owner, actor) => { if (!set.has(owner))
                    return true; /* N2.6b: DEMO prostor = jen vymyšlená, oddělená data → chráněné huby bez přihlášení (ostrý prostor beze změny) */ /* N2.6b: DEMO prostor = jen vymyšlená, oddělená data → chráněné huby bez přihlášení (ostrý prostor beze změny) */ if (String(this.core?.workspaceProfile?.mode || '') === 'DEMO')
                    return true; try {
                    return (await this.validate()) === actor;
                }
                catch {
                    return false;
                } });
            this.protectedOwners = set;
            return [...set].sort();
        }
        isProtected(ownerApp) { return !!this.protectedOwners?.has(ownerApp); }
        protectedList() { return this.protectedOwners ? [...this.protectedOwners].sort() : []; }
        async status() {
            const enrolled = await this.enrolledUsers();
            let subjectId = null, session = null, error = null;
            if (this.current) {
                try {
                    subjectId = await this.validate();
                    const r = await this.core.entities.get(this.current.sessionId);
                    session = { id: r.id, startedAt: r.data.startedAt, expiresAt: r.data.expiresAt, idleExpiresAt: this.iso(Date.parse(r.data.lastSeenAt) + this.policy.idleTimeoutMs), deviceId: r.data.deviceId || null };
                }
                catch (e) {
                    error = String(e?.message || e);
                }
            }
            /* N2.5p: members with a valid PIN request (they may create their own PIN) */ const requested = [];
            try {
                for (const r of await this.core.entities.list()) {
                    if (r.type === 'CORE.IDENTITY.PIN_REQUEST' && !r.archivedAt && r.data?.used !== true && String(r.data?.expiresAt || '') > this.iso(this.now()) && !enrolled.includes(r.data.userId))
                        requested.push(r.data.userId);
                }
            }
            catch { }
            return { contract: CONTRACT, authenticated: !!subjectId, subjectId, session, error, enrolled, requested, external: EXTERNAL, protectedOwners: this.protectedList(),
                policy: { kdf: this.policy.kdf, iterations: this.policy.iterations, minSecretLength: this.policy.minSecretLength, idleTimeoutMs: this.policy.idleTimeoutMs, absoluteTtlMs: this.policy.absoluteTtlMs, maxFailedBeforeLock: this.policy.maxFailedBeforeLock },
                dataAtRestEncrypted: false };
        }
        // ---- credential -----------------------------------------------------------------------------
        async verifySecret(c, secret, ctx) {
            const t = this.now(), d = c.data;
            if (d.lockedUntil && Date.parse(d.lockedUntil) > t)
                throw new Error(`IDENTITY_LOCKED_UNTIL:${d.lockedUntil}`);
            const okSecret = same(await derive(secret, unb64(d.salt), d.iterations), unb64(d.hash));
            if (okSecret) {
                if (d.failedAttempts || d.lockedUntil)
                    await this.core.entities.save({ id: c.id, type: CRED, ownerApp: OWNER, schema: c.schema, spaceIds: c.spaceIds, expectedRevision: c.revision, data: { ...d, failedAttempts: 0, lockedUntil: null } }, this.sys(ctx));
                return true;
            }
            const failed = (d.failedAttempts || 0) + 1, over = failed - this.policy.maxFailedBeforeLock;
            const lockedUntil = over >= 0 ? this.iso(t + Math.min(this.policy.lockMaxMs, this.policy.lockBaseMs * 2 ** over)) : null;
            await this.core.entities.save({ id: c.id, type: CRED, ownerApp: OWNER, schema: c.schema, spaceIds: c.spaceIds, expectedRevision: c.revision, data: { ...d, failedAttempts: failed, lockedUntil, lastFailedAt: this.iso(t) } }, this.sys(ctx));
            return false;
        }
        /* N2.5a: emergency recovery – ONE verifier (set once, like the gates) decides whether a recovery key is valid;
           without it the path does not exist. A recovery reset = a new secret without the old one and without a session. */
        recoveryVerifier = null;
        recoveryBypass = null;
        setRecoveryVerifier(fn) { if (this.recoveryVerifier)
            throw new Error('IDENTITY_RECOVERY_VERIFIER_ALREADY_SET'); if (typeof fn !== 'function')
            throw new Error('IDENTITY_RECOVERY_VERIFIER_INVALID'); this.recoveryVerifier = fn; }
        async recoveryReset(input, ctx) {
            const userId = input?.userId;
            await this.activeUser(userId);
            checkSecret(input?.secret);
            if (!this.recoveryVerifier)
                throw new Error('IDENTITY_RECOVERY_UNAVAILABLE');
            if (typeof input?.recoveryKey !== 'string' || !await this.recoveryVerifier(userId, input.recoveryKey))
                throw new Error('IDENTITY_RECOVERY_KEY_INVALID');
            this.current = null;
            this.recoveryBypass = userId;
            try {
                return await this.enroll({ userId, secret: input.secret }, { ...ctx, actorId: userId });
            }
            finally {
                this.recoveryBypass = null;
            }
        }
        /* N2.5p: PIN request – a signed-in manager asks a member without a PIN to create one (valid 7 days, used once) */
        async requestPin(input, ctx) {
            const userId = String(input?.userId || '');
            await this.activeUser(userId);
            let auth = null;
            try {
                auth = this.current ? await this.validate() : null;
            }
            catch {
                auth = null;
            }
            if (!auth || auth !== ctx?.actorId || !await this.isAdmin(auth))
                throw new Error('AUTH_SESSION_REQUIRED');
            if (await this.credential(userId))
                throw new Error('IDENTITY_ALREADY_ENROLLED');
            const id = 'CORE.IDENTITY.PIN_REQUEST.' + String(userId).replace(/[^A-Z0-9_.]/gi, '_');
            const cur = await this.core.entities.get(id).catch(() => null);
            const t = this.now();
            const data = { userId, by: auth, at: this.iso(t), expiresAt: this.iso(Number(t) + 7 * 86400000), used: false };
            await this.core.entities.save(cur ? { ...cur, expectedRevision: cur.revision, data } : { id, type: 'CORE.IDENTITY.PIN_REQUEST', ownerApp: OWNER, schema: 'KX.CORE_IDENTITY.PIN_REQUEST/1', spaceIds: [await this.personalSpace(userId)], data }, { ...ctx, appCode: OWNER });
            return { userId, expiresAt: data.expiresAt };
        }
        async pinRequestValid(userId) { const r = await this.core.entities.get('CORE.IDENTITY.PIN_REQUEST.' + String(userId).replace(/[^A-Z0-9_.]/gi, '_')).catch(() => null); return !!r && !r.archivedAt && r.data?.used !== true && String(r.data?.expiresAt || '') > this.iso(this.now()); }
        async enroll(input, ctx) {
            const userId = input?.userId;
            await this.activeUser(userId);
            const secret = checkSecret(input?.secret);
            const old = await this.credential(userId);
            let auth = null;
            try {
                auth = this.current ? await this.validate() : null;
            }
            catch {
                auth = null;
            }
            if (auth && ctx?.actorId !== auth)
                throw new Error('IDENTITY_ACTOR_MISMATCH');
            let mode;
            if (old) {
                if (this.recoveryBypass === userId)
                    mode = 'RECOVERY_RESET';
                else if (auth === userId) {
                    if (typeof input?.currentSecret !== 'string' || !await this.verifySecret(await this.credential(userId), input.currentSecret, ctx))
                        throw new Error('IDENTITY_CURRENT_SECRET_INVALID');
                    mode = 'CHANGE_OWN';
                }
                else if (auth && await this.isAdmin(auth))
                    mode = 'ADMIN_RESET';
                else
                    throw new Error('AUTH_SESSION_REQUIRED');
            }
            else {
                if (auth && (auth === userId || await this.isAdmin(auth)))
                    mode = auth === userId ? 'ENROLL_OWN' : 'ADMIN_ENROLL';
                else if (!auth && (await this.enrolledUsers()).length === 0 && ctx?.actorId === userId)
                    mode = 'FIRST_RUN_BOOTSTRAP';
                /* N2.5p (user): the member creates their OWN first PIN on a valid request of the family manager – the manager never types or knows it */
                else if (ctx?.actorId === userId && await this.pinRequestValid(userId))
                    mode = 'ENROLL_BY_REQUEST';
                else
                    throw new Error('AUTH_SESSION_REQUIRED');
            }
            const salt = rnd(this.policy.saltBytes), hash = await derive(secret, salt, this.policy.iterations), t = this.iso(this.now());
            const fresh = old ? await this.credential(userId) : null;
            const row = await this.core.entities.save({ id: credId(userId), type: CRED, ownerApp: OWNER, schema: 'KX.CORE_IDENTITY.CREDENTIAL/1', spaceIds: [await this.personalSpace(userId)], expectedRevision: fresh ? fresh.revision : 0,
                data: { subjectId: userId, kdf: this.policy.kdf, iterations: this.policy.iterations, salt: b64(salt), hash: b64(hash), secretVersion: (fresh?.data?.secretVersion || 0) + 1,
                    failedAttempts: 0, lockedUntil: null, createdAt: fresh?.data?.createdAt || t, rotatedAt: t, lastMode: mode } }, { ...this.sys(ctx), actorId: auth || ctx?.actorId || userId });
            // a changed secret revokes every other ACTIVE session of that user (the current one is re-bound below)
            for (const s of (await this.core.entities.list()).filter((r) => r.type === SESS && r.data?.subjectId === userId && r.data?.status === 'ACTIVE')) {
                if (this.current && s.id === this.current.sessionId && auth === userId) {
                    await this.core.entities.save({ id: s.id, type: SESS, ownerApp: OWNER, schema: s.schema, spaceIds: s.spaceIds, expectedRevision: s.revision, data: { ...s.data, secretVersion: row.data.secretVersion } }, this.sys(ctx));
                    continue;
                }
                await this.closeRow(s, 'REVOKED', 'CREDENTIAL_CHANGED', ctx);
            }
            /* N2.5p: a request is used once */ if (mode === 'ENROLL_BY_REQUEST') {
                try {
                    const rq = await this.core.entities.get('CORE.IDENTITY.PIN_REQUEST.' + String(userId).replace(/[^A-Z0-9_.]/gi, '_'));
                    if (rq)
                        await this.core.entities.save({ ...rq, expectedRevision: rq.revision, data: { ...rq.data, used: true, usedAt: this.iso(this.now()) } }, { ...ctx, appCode: OWNER });
                }
                catch { }
            }
            return { userId, mode, secretVersion: row.data.secretVersion, revision: row.revision };
        }
        async signIn(input, ctx) {
            const userId = input?.userId;
            await this.activeUser(userId);
            if (typeof input?.secret !== 'string' || !input.secret)
                throw new Error('IDENTITY_SECRET_REQUIRED');
            const c = await this.credential(userId);
            if (!c)
                throw new Error('IDENTITY_NOT_ENROLLED');
            if (!await this.verifySecret(c, input.secret, ctx)) {
                const after = await this.credential(userId);
                throw new Error(after?.data?.lockedUntil ? `IDENTITY_LOCKED_UNTIL:${after.data.lockedUntil}` : 'IDENTITY_INVALID_SECRET');
            }
            if (this.current) {
                const prev = await this.core.entities.get(this.current.sessionId);
                await this.closeRow(prev, 'CLOSED', 'REPLACED_BY_SIGN_IN', ctx);
                this.current = null;
            }
            const t = this.now(), token = rnd(32), cred = await this.credential(userId);
            const deviceId = typeof this.opts.deviceId === 'function' ? this.opts.deviceId() : ctx?.deviceId;
            const row = await this.core.entities.save({ type: SESS, ownerApp: OWNER, schema: 'KX.CORE_IDENTITY.SESSION/1', spaceIds: [await this.personalSpace(userId)],
                data: { subjectId: userId, status: 'ACTIVE', tokenSha256: await sha256(token), secretVersion: cred.data.secretVersion, deviceId: deviceId || null,
                    workspaceId: this.opts.workspaceId || this.core.workspaceProfile?.id || null, startedAt: this.iso(t), lastSeenAt: this.iso(t), expiresAt: this.iso(t + this.policy.absoluteTtlMs) } }, { ...this.sys(ctx), actorId: userId });
            this.current = { sessionId: row.id, token };
            this.lastTouch = t;
            return { authenticated: true, subjectId: userId, sessionId: row.id, expiresAt: row.data.expiresAt };
        }
        async signOut(ctx) {
            const cur = this.current;
            this.current = null;
            if (!cur)
                return { authenticated: false, closed: false };
            const row = await this.core.entities.get(cur.sessionId);
            await this.closeRow(row, 'CLOSED', 'SIGN_OUT', ctx);
            return { authenticated: false, closed: true };
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.POLICY = POLICY;
    NS.EXTERNAL = EXTERNAL;
    NS.isProtectedType = isProtectedType;
    NS.IdentityService = IdentityService;
    NS.install = (core, options = {}) => {
        if (core.identity)
            throw new Error('Identity already installed');
        if (!core?.entities?.save || !core?.memberships?.getUser || !core?.actions?.register)
            throw new Error('Identity requires Core entities/memberships/actions');
        const svc = new IdentityService(core, options);
        const reg = [];
        const defs = [
            { code: 'ACTION.CORE.IDENTITY.ENROLL', risk: 'SENSITIVE_WRITE', handler: (p, c) => svc.enroll(p, c) }, { code: 'ACTION.CORE.IDENTITY.PIN_REQUEST', risk: 'SAFE_WRITE', handler: (p, c) => svc.requestPin(p, c) },
            { code: 'ACTION.CORE.IDENTITY.SIGN_IN', risk: 'SAFE_WRITE', handler: (p, c) => svc.signIn(p, c) },
            { code: 'ACTION.CORE.IDENTITY.SIGN_OUT', risk: 'SAFE_WRITE', handler: (_p, c) => svc.signOut(c) },
            { code: 'ACTION.CORE.IDENTITY.STATUS', risk: 'READ', handler: () => svc.status() }
        ];
        try {
            for (const d of defs) {
                core.actions.register({ ...d, ownerApp: OWNER });
                reg.push(d.code);
            }
            core.identity = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.identity;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, external: EXTERNAL.map(x => `${x.provider}:${x.status}`), dataAtRestEncrypted: false });
    };
})(KXIdentity || (KXIdentity = {}));
