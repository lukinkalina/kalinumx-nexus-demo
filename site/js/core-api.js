// N2.4s: NEXUS API – one gate over the core action bus for external clients (scripts, AI, MCP).
// A client = token (only its SHA-256 is stored) + scope (owners / hubs, read, write) + trusted actions.
// read  → only READ actions in scope; the same permissions and the same protection of sensitive hubs (identity guard).
// DEFAULT (user decision 2026-10-22): read AND write on; every SAFE_WRITE outside protected owners runs at once (trustSafeWrites);
//         the client can be tightened (write off, or trustSafeWrites off → only the listed trusted actions run directly).
// write → a trusted SAFE_WRITE outside protected owners runs at once; EVERYTHING else (sensitive hubs, FINANCIAL, SENSITIVE,
//         DESTRUCTIVE, not trusted) is only PROPOSED via the core AI action request and runs after the user's approval.
// Never through the API: API management, identity, AI gateway (no escalation, no bypass of approvals).
var KXApi;
(function () {
    const T = 'CORE.API_CLIENT', OWNER = 'APP.KX.NEXUS', APP = 'APP.KX.API';
    const FORBIDDEN = /^ACTION\.CORE\.(API|IDENTITY|AI)\./;
    /* N2.4u: access control and security never through the API (found by listing the MCP tools): privacy unlock, sharing, spaces / members, users, devices, sync, settings, raw entity writes (would bypass hub validation incl. protected owners), handoff, system */
    const FORBIDDEN_SECURITY = /^ACTION\.CORE\.(PRIVACY|SHARING|SPACE|USER|DEVICE|SYNC|SETTING|ENTITY|HANDOFF|SYSTEM|IMPLEMENTATION)\./;
    /* N2.5a: roles and rights never through the API */
    const FORBIDDEN_ACCESS = /^ACTION\.CORE\.(ACCESS|RECOVERY|ORG)\./;
    /* N2.6b: the KEYRON password vault never through the API / MCP – not even its ciphertext (found by the MCP data test) */
    const FORBIDDEN_VAULT = /^ACTION\.VAULT\./;
    const forbidden = (code) => FORBIDDEN.test(code) || FORBIDDEN_SECURITY.test(code) || FORBIDDEN_ACCESS.test(code) || FORBIDDEN_VAULT.test(code);
    const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    async function sha(text) { return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
    function newToken() { const b = new Uint8Array(32); globalThis.crypto.getRandomValues(b); return 'kxapi_' + [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
    function install(core) {
        if (core.api)
            return core.api;
        /* N2.6b: sensitive hubs are ALWAYS proposal-only for API / MCP clients – independent of identity protection (the DEMO workspace switches that off for browsing, which made Finance writes direct for AI) */ const API_SENSITIVE = new Set(['APP.KX.FINANCE', 'APP.KX.HEALTH', 'APP.KX.PEOPLE', 'APP.KX.SUBSCRIPTIONS', 'APP.KX.VAULT']);
        const protectedOwner = (o) => API_SENSITIVE.has(String(o)) || !!core.identity?.isProtected?.(o);
        const inScope = (c, def) => { const o = c.data.scope?.owners || []; return o.includes('*') || o.includes(def.ownerApp); };
        async function client(token) {
            if (typeof token !== 'string' || !token.startsWith('kxapi_'))
                throw new Error('API_TOKEN_INVALID');
            const h = await sha(token);
            const row = (await core.entities.list()).find((r) => r.type === T && r.data.tokenHash === h);
            if (!row)
                throw new Error('API_TOKEN_INVALID');
            if (row.data.revokedAt)
                throw new Error('API_TOKEN_REVOKED');
            return row;
        }
        const ctxFor = (c, def, confirmed) => ({ actorId: c.data.ownerUserId, appCode: APP, deviceId: 'API:' + c.id, permissions: def.permission ? [def.permission] : [], confirmed });
        async function touch(c, code, kind) { try {
            await core.entities.save({ ...c, data: { ...c.data, lastUsedAt: new Date().toISOString(), calls: (c.data.calls || 0) + 1, lastCall: `${kind} ${code}` }, expectedRevision: c.revision }, { actorId: c.data.ownerUserId, appCode: APP, permissions: [], confirmed: true });
        }
        catch { } }
        const defOf = (code) => { const d = core.actions.list().find((x) => x.code === code); if (!d)
            throw new Error('API_ACTION_UNKNOWN'); if (forbidden(code))
            throw new Error('API_ACTION_FORBIDDEN'); return d; };
        const api = {
            /* management (normal core actions, in the app) */
            async createClient(p, ctx) {
                const name = String(p?.name || '').trim();
                if (!name || name.length > 80)
                    throw new Error('API_CLIENT_NAME');
                const owners = Array.isArray(p?.scope?.owners) && p.scope.owners.length ? p.scope.owners.map(String) : [];
                if (!owners.length)
                    throw new Error('API_SCOPE_EMPTY');
                const trusted = (p?.trusted || []).map(String).filter((c) => !forbidden(c));
                const token = newToken();
                const row = await core.entities.save({ type: T, ownerApp: OWNER, schema: 'KX.API_CLIENT/1', spaceIds: [], data: { name, ownerUserId: ctx.actorId, tokenHash: await sha(token), scope: { owners, read: p?.scope?.read !== false, write: p?.scope?.write !== false }, trustSafeWrites: p?.trustSafeWrites !== false, trusted, createdAt: new Date().toISOString(), revokedAt: null, calls: 0 } }, ctx);
                return { client: api.publicView(row), token };
            },
            async revokeClient(p, ctx) { const r = await core.entities.get(p?.id); if (!r || r.type !== T)
                throw new Error('API_CLIENT_NOT_FOUND'); return api.publicView(await core.entities.save({ ...r, data: { ...r.data, revokedAt: new Date().toISOString() }, expectedRevision: r.revision }, ctx)); },
            async listClients() { return (await core.entities.list()).filter((r) => r.type === T).map(api.publicView); },
            publicView(r) { const d = r.data; return { id: r.id, name: d.name, scope: d.scope, trustSafeWrites: d.trustSafeWrites !== false, trusted: d.trusted, createdAt: d.createdAt, revokedAt: d.revokedAt, lastUsedAt: d.lastUsedAt || null, calls: d.calls || 0 }; },
            /* the gate (external callers – authenticated by the token) */
            async describe(token) { const c = await client(token); return core.actions.list().filter((d) => !forbidden(d.code) && inScope(c, d) && (d.risk === 'READ' ? c.data.scope.read : c.data.scope.write)).map((d) => ({ code: d.code, risk: d.risk, owner: d.ownerApp, protected: protectedOwner(d.ownerApp), mode: d.risk === 'READ' ? 'READ' : ((c.data.trustSafeWrites !== false || c.data.trusted.includes(d.code)) && d.risk === 'SAFE_WRITE' && !protectedOwner(d.ownerApp) ? 'DIRECT' : 'PROPOSE') })); },
            async read(token, code, payload) {
                const c = await client(token);
                const def = defOf(code);
                if (!inScope(c, def))
                    throw new Error('API_OUT_OF_SCOPE');
                if (def.risk !== 'READ')
                    throw new Error('API_NOT_READ');
                if (!c.data.scope.read)
                    throw new Error('API_READ_NOT_ALLOWED');
                const out = await core.actions.invoke(code, payload ?? {}, ctxFor(c, def, false));
                await touch(c, code, 'READ');
                return out;
            },
            async write(token, code, payload) {
                const c = await client(token);
                const def = defOf(code);
                if (!inScope(c, def))
                    throw new Error('API_OUT_OF_SCOPE');
                if (def.risk === 'READ')
                    throw new Error('API_USE_READ');
                if (!c.data.scope.write)
                    throw new Error('API_WRITE_NOT_ALLOWED');
                const direct = (c.data.trustSafeWrites !== false || c.data.trusted.includes(code)) && def.risk === 'SAFE_WRITE' && !protectedOwner(def.ownerApp);
                if (direct) {
                    let result;
                    try {
                        result = await core.actions.invoke(code, payload ?? {}, ctxFor(c, def, true));
                    }
                    catch (e) {
                        /* N2.4y: a write that failed in the hub is not lost – it goes to „K zatřídění“ with its data (fix and „Zkusit znovu“) */
                        if (core.inbox) {
                            try {
                                const IT = (k) => globalThis.KXI18n?.UI?.[k]?.cs || k;
                                await core.inbox.add({ source: /mcp/i.test(String(c.data.name)) ? 'MCP' : 'API', reason: 'VALIDATION', title: `${IT('inbox.t.apiFailed')}: ${code} (${c.data.name})`, text: `${String(e?.message || e)}\n\n${JSON.stringify(payload ?? {}, null, 1)}`, target: { hub: def.ownerApp, actionCode: code, payload: payload ?? {} } }, { actorId: c.data.ownerUserId, appCode: APP, permissions: [], confirmed: true });
                            }
                            catch { }
                        }
                        throw e;
                    }
                    await touch(c, code, 'WRITE');
                    return { status: 'EXECUTED', result };
                }
                /* proposal through the core AI action request – the user approves it in NEXUS */
                const AC = { actorId: c.data.ownerUserId, appCode: APP, permissions: ['CORE.AI.CHAT', 'CORE.AI.ACTION.PROPOSE'], confirmed: true };
                let sid = c.data.sessionId;
                if (!sid || !(await core.entities.get(sid))) {
                    const s = await core.aiSessions.create({ userId: c.data.ownerUserId, title: `API: ${c.data.name}` }, AC);
                    sid = s.id;
                    const fresh = await core.entities.get(c.id);
                    await core.entities.save({ ...fresh, data: { ...fresh.data, sessionId: sid }, expectedRevision: fresh.revision }, AC);
                }
                const req = await core.aiGateway.proposeAction({ sessionId: sid, actionCode: code, payload: payload ?? {} }, AC);
                await touch(await core.entities.get(c.id), code, 'PROPOSE');
                return { status: 'PROPOSED', requestId: req.id, reason: protectedOwner(def.ownerApp) ? 'PROTECTED_OWNER' : def.risk !== 'SAFE_WRITE' ? `RISK_${def.risk}` : 'NOT_TRUSTED' };
            }
        };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        /* N2.4u: READ actions the API / MCP clients need (found missing by the MCP test): tasks, calendar, spaces – only the actor's spaces */
        const mySpaces = async (actor) => (await core.propagate.spaces(actor)).map((x) => ({ id: x.id, name: x.name, kind: x.kind }));
        const inMine = async (actor, spaceId) => { const ids = new Set((await mySpaces(actor)).map(x => x.id)); if (spaceId && !ids.has(spaceId))
            throw new Error('API_SPACE_NOT_YOURS'); return spaceId ? new Set([spaceId]) : ids; };
        const lim = (n) => Math.max(1, Math.min(500, Number(n) || 100));
        const regApp = (code, owner, risk, fn) => { try {
            core.actions.register({ code, ownerApp: owner, risk, handler: fn });
        }
        catch { } };
        regApp('ACTION.CORE.SPACES.LIST', 'APP.NEXUS', 'READ', async (_p, c) => mySpaces(c.actorId));
        regApp('ACTION.CORE.TASK.LIST', 'APP.NEXUS', 'READ', async (p, c) => {
            const ids = await inMine(c.actorId, p?.spaceId);
            const from = p?.from ? String(p.from) : '', to = p?.to ? String(p.to) : '';
            return (await core.tasks.list()).filter((t) => !t.archivedAt && (t.spaceIds || []).some((x) => ids.has(x)) && (!p?.status || t.status === p.status) && (!from || String(t.dueAt || '') >= from) && (!to || String(t.dueAt || '') <= to)).sort((a, b) => String(a.dueAt || '9').localeCompare(String(b.dueAt || '9'))).slice(0, lim(p?.limit)).map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt || null, spaceIds: t.spaceIds, ownerApp: t.ownerApp }));
        });
        regApp('ACTION.CORE.CALENDAR.LIST', 'APP.NEXUS', 'READ', async (p, c) => {
            const ids = await inMine(c.actorId, p?.spaceId);
            const from = p?.from ? String(p.from) : new Date(Date.now() - 86400000).toISOString(), to = p?.to ? String(p.to) : new Date(Date.now() + 30 * 86400000).toISOString();
            return (await core.calendar.list()).filter((e) => !e.archivedAt && e.status !== 'CANCELLED' && (e.spaceIds || []).some((x) => ids.has(x)) && String(e.startsAt) >= from && String(e.startsAt) <= to).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, lim(p?.limit)).map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt || null, allDay: !!e.allDay, spaceIds: e.spaceIds, recurrenceRule: e.recurrenceRule || null }));
        });
        reg('ACTION.CORE.API.CLIENT.CREATE', 'SENSITIVE_WRITE', (p, c) => api.createClient(p, c));
        reg('ACTION.CORE.API.CLIENT.REVOKE', 'SAFE_WRITE', (p, c) => api.revokeClient(p, c));
        reg('ACTION.CORE.API.CLIENT.LIST', 'READ', () => api.listClients());
        core.api = api;
        return api;
    }
    KXApi = { install, FORBIDDEN, FORBIDDEN_SECURITY, newToken, sha };
    globalThis.KXApi = KXApi;
})();
