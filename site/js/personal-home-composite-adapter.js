var KXPersonalHomeComposite;
(function (ns) {
    const OWNER = 'APP.KX.HOME', CODE = 'PERSONAL.HOME.STATUS', PROVIDER_KIND = 'HUB_COMPOSITE', CONTRACT = 'KX.PERSONAL_HOME_COMPOSITE/1';
    const isEmptyA = (e) => String(e?.message || e).startsWith('OWNER_NO_SOURCE_RECORDS');
    const isEmptyB = (e) => String(e?.message || e).startsWith('MISSING_PROVIDER');
    const fail = (part, e) => new Error(`HOME_COMPOSITE_SOURCE_FAILED[${part}]: ${String(e?.message || e)}`);
    // Capture shim: accepts exactly one APP.KX.HOME adapter function and nothing else.
    function captureShim() {
        let captured = null;
        const shim = Object.freeze({ registerOwnerAdapter(ownerApp, adapter) {
                if (ownerApp !== OWNER)
                    throw new Error('HOME_COMPOSITE_SHIM_FOREIGN_OWNER');
                if (typeof adapter !== 'function')
                    throw new Error('Owner adapter must be a function');
                if (captured)
                    throw new Error('HOME_COMPOSITE_SHIM_DUPLICATE');
                captured = adapter;
            } });
        return { shim, get: () => captured };
    }
    const checkPart = (part, ev, req) => {
        if (!ev || ev.projectionCode !== CODE || ev.ownerApp !== OWNER || ev.subjectId !== req.subjectId)
            throw fail(part, 'identity mismatch');
        if (typeof ev.sourceRevision !== 'string' || !ev.sourceRevision)
            throw fail(part, 'missing sourceRevision');
        if (!Number.isFinite(ev.generatedAt))
            throw fail(part, 'missing generatedAt');
        const p = ev.payload;
        if (!p || typeof p !== 'object' || Array.isArray(p))
            throw fail(part, 'invalid payload');
        if (!Number.isSafeInteger(p.alertsCount) || p.alertsCount < 0)
            throw fail(part, 'invalid alertsCount');
        const n = p.nextMaintenanceAt;
        if (n !== undefined && n !== null && (typeof n !== 'string' || !Number.isFinite(Date.parse(n))))
            throw fail(part, 'invalid nextMaintenanceAt');
        return ev;
    };
    function createAdapter(parts, flags, sha) {
        const adapter = async (request) => {
            if (request?.projectionCode !== CODE || request?.ownerApp !== OWNER || typeof request?.subjectId !== 'string' || !request.subjectId.trim() || request.subjectId.length > 256)
                throw new Error('Home composite adapter identity mismatch');
            const req = Object.freeze({ projectionCode: CODE, ownerApp: OWNER, subjectId: request.subjectId });
            let a = null, b = null;
            if (flags.includeHomeMaintenance) {
                try {
                    a = checkPart('HOME_MAINTENANCE', await parts.a(req), req);
                }
                catch (e) {
                    if (!isEmptyA(e))
                        throw String(e?.message || e).startsWith('HOME_COMPOSITE_SOURCE_FAILED') ? e : fail('HOME_MAINTENANCE', e);
                }
            }
            if (flags.includeCoreTasks) {
                try {
                    b = checkPart('CORE_TASKS', await parts.b(req), req);
                }
                catch (e) {
                    if (!isEmptyB(e))
                        throw String(e?.message || e).startsWith('HOME_COMPOSITE_SOURCE_FAILED') ? e : fail('CORE_TASKS', e);
                }
            }
            if (!a && !b)
                throw new Error(`OWNER_NO_SOURCE_RECORDS: no HOME source records (maintenance=${flags.includeHomeMaintenance ? 'ON' : 'OFF'}, coreTasks=${flags.includeCoreTasks ? 'ON' : 'OFF'})`);
            const present = [a, b].filter(Boolean);
            const alertsCount = present.reduce((s, e) => s + e.payload.alertsCount, 0);
            const nexts = present.map((e) => e.payload.nextMaintenanceAt).filter((x) => typeof x === 'string').sort((x, y) => Date.parse(x) - Date.parse(y) || x.localeCompare(y));
            const updated = present.map((e) => e.payload.sourceUpdatedAt).filter((x) => typeof x === 'string' && Number.isFinite(Date.parse(x))).sort((x, y) => Date.parse(x) - Date.parse(y)).pop() || null;
            let statusLabel = (a || b).payload.statusLabel;
            if (a && b && b.payload.alertsCount > 0)
                statusLabel = `${a.payload.statusLabel} · Úkoly Core po termínu: ${b.payload.alertsCount}`;
            const sourceRevision = 'HOME.COMPOSITE/1:' + sha(JSON.stringify([flags.includeHomeMaintenance, flags.includeCoreTasks, a?.sourceRevision ?? null, b?.sourceRevision ?? null]));
            const payload = { alertsCount, nextMaintenanceAt: nexts[0] ?? null, statusLabel, sourceUpdatedAt: updated };
            return { projectionCode: CODE, ownerApp: OWNER, subjectId: req.subjectId, sourceRevision, generatedAt: Math.min(...present.map((e) => e.generatedAt)), payload };
        };
        adapter.kxProviderKind = PROVIDER_KIND;
        adapter.kxSourceParts = Object.freeze([
            Object.freeze({ source: 'HOME_MAINTENANCE', enabled: flags.includeHomeMaintenance }),
            Object.freeze({ source: 'CORE_TASKS', enabled: flags.includeCoreTasks })
        ]);
        return adapter;
    }
    // install(core, personal, options): installs KXHome domain (actions + service) through the shim,
    // captures the Core Tasks adapter through the shim, then registers ONE composite adapter.
    ns.install = (core, personal, options = {}) => {
        if (!personal || typeof personal.registerOwnerAdapter !== 'function')
            throw new Error('Personal Home runtime unavailable');
        if (typeof KXHome?.install !== 'function' || typeof KXPersonalHomeCoreTaskAdapter?.install !== 'function')
            throw new Error('HOME composite parts unavailable');
        const sha = typeof KXPersonalPlannerOwner?.sha256Hex === 'function' ? KXPersonalPlannerOwner.sha256Hex : null;
        if (!sha)
            throw new Error('HOME composite requires KXPersonalPlannerOwner.sha256Hex');
        const flags = { includeHomeMaintenance: options.includeHomeMaintenance !== false, includeCoreTasks: options.includeCoreTasks !== false };
        // Preflight (no side effects): HOME must not already have an owner adapter.
        if (typeof personal.ownerSourceCoverage === 'function' && personal.ownerSourceCoverage().some((c) => c.ownerApp === OWNER && c.providerRegistered))
            throw new Error('Owner adapter already registered');
        const capA = captureShim(), capB = captureShim();
        // (b) first: pure capture, validates Core TaskService/ResourceAccessService, no side effects.
        KXPersonalHomeCoreTaskAdapter.install(capB.shim, options.coreTasksRuntime || core, options.identityProvider);
        // (a) second: installs the HOME domain service + actions (atomic since N2.0 F2), captures the adapter.
        const homeReport = KXHome.install(core, capA.shim, { now: options.now });
        const a = capA.get(), b = capB.get();
        if (typeof a !== 'function' || typeof b !== 'function')
            throw new Error('HOME composite capture failed');
        personal.registerOwnerAdapter(OWNER, createAdapter({ a, b }, flags, sha));
        return Object.freeze({ contract: CONTRACT, ownerApp: OWNER, providerKind: PROVIDER_KIND, homeDomain: homeReport,
            parts: Object.freeze({ HOME_MAINTENANCE: flags.includeHomeMaintenance ? 'ENABLED' : 'DISABLED_BY_CALLER',
                CORE_TASKS: flags.includeCoreTasks ? (typeof options.identityProvider?.getAuthenticatedSubjectId === 'function' ? 'ENABLED' : 'ENABLED_FAILS_CLOSED_NO_IDENTITY') : 'DISABLED_BY_CALLER' }),
            registrations: 1, productionVerified: false });
    };
    ns.OWNER = OWNER;
    ns.PROVIDER_KIND = PROVIDER_KIND;
    ns.CONTRACT = CONTRACT;
})(KXPersonalHomeComposite || (KXPersonalHomeComposite = {}));
