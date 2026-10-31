var KXModules;
(function (NS) {
    const G = (n) => globalThis[n];
    const hub = (id, ns, withCard) => ({ id, kind: 'HUB', requires: ['CORE'], ns,
        install: (c) => G(ns).install(c.core, withCard ? c.personal : undefined, { now: c.now }) });
    const MODULES = [
        { id: 'CORE', kind: 'CORE', requires: [], install: () => ({ contract: 'KX.CORE', builtin: true }) },
        { id: 'CORE.I18N', kind: 'SERVICE', requires: ['CORE'], ns: 'KXI18n', install: (c) => G('KXI18n').install(c.core) },
        { id: 'CORE.RECORD_CONTROLS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXRecordControls', install: (c) => G('KXRecordControls').install(c.core, { now: c.now }) },
        { id: 'CORE.WEB_LINKS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXWebLinks', install: (c) => G('KXWebLinks').install(c.core, { now: c.now }) },
        { id: 'CORE.SYNC_MERGE', kind: 'SERVICE', requires: ['CORE'], ns: 'KXSyncMerge', install: (c) => G('KXSyncMerge').install(c.core, { now: c.now }) },
        { id: 'CORE.HANDOFF', kind: 'SERVICE', requires: ['CORE'], ns: 'KXHandoff', install: (c) => G('KXHandoff').install(c.core, { now: c.now, ...(c.handoffOptions || {}) }) },
        { id: 'CORE.RECORD_CODES', kind: 'SERVICE', requires: ['CORE'], ns: 'KXRecordCodes', install: (c) => G('KXRecordCodes').install(c.core, { now: c.now, ...(c.recordCodesOptions || {}) }) },
        { id: 'CORE.RECORDER', kind: 'SERVICE', requires: ['CORE'], ns: 'KXRecorder', install: (c) => G('KXRecorder').install(c.core, { now: c.now }) },
        { id: 'CORE.PROMPTS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXPrompts', install: (c) => G('KXPrompts').install(c.core, { now: c.now }) },
        { id: 'CORE.FIELDS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXFieldRegistry', install: (c) => G('KXFieldRegistry').install(c.core, { now: c.now }) },
        { id: 'CORE.TIMER', kind: 'SERVICE', requires: ['CORE'], ns: 'KXTimer', install: (c) => G('KXTimer').install(c.core, { now: c.now, ...(c.timerOptions || {}) }) },
        { id: 'CORE.LISTS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXLists', install: (c) => G('KXLists').install(c.core, { now: c.now }) },
        { id: 'CORE.LAYOUT', kind: 'SERVICE', requires: ['CORE'], ns: 'KXLayout', install: (c) => G('KXLayout').install(c.core, { now: c.now }) },
        { id: 'CORE.APP_STATES', kind: 'SERVICE', requires: ['CORE'], ns: 'KXAppStates', install: (c) => G('KXAppStates').install(c.core, { now: c.now }) },
        { id: 'CORE.INSIGHTS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXInsights', install: (c) => G('KXInsights').install(c.core, { now: c.now }) },
        { id: 'CORE.PROCESSES', kind: 'SERVICE', requires: ['CORE'], ns: 'KXProcesses', install: (c) => G('KXProcesses').install(c.core, { now: c.now }) },
        { id: 'CORE.BRAND', kind: 'SERVICE', requires: ['CORE'], ns: 'KXBrand', install: (c) => G('KXBrand').install(c.core, { now: c.now, ...(c.brandOptions || {}) }) },
        { id: 'CORE.APPEARANCE_PACKS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXAppearancePacks', install: (c) => G('KXAppearancePacks').install(c.core, { now: c.now }) },
        { id: 'CORE.NOTES', kind: 'SERVICE', requires: ['CORE'], ns: 'KXNotes', install: (c) => G('KXNotes').install(c.core) },
        { id: 'CORE.PROPAGATE', kind: 'SERVICE', requires: ['CORE'], ns: 'KXPropagate', install: (c) => G('KXPropagate').install(c.core) },
        { id: 'CORE.ISSUES', kind: 'SERVICE', requires: ['CORE'], ns: 'KXIssues', install: (c) => G('KXIssues').install(c.core, { now: c.now }) },
        { id: 'CORE.IDENTITY', kind: 'SERVICE', requires: ['CORE'], ns: 'KXIdentity', install: (c) => G('KXIdentity').install(c.core, { now: c.now, ...(c.identityOptions || {}) }) },
        { id: 'CORE.TAXONOMY', kind: 'SERVICE', requires: ['CORE.I18N'], ns: 'KXTaxonomy', install: (c) => G('KXTaxonomy').install(c.core) },
        { id: 'CORE.NOTIFICATIONS', kind: 'SERVICE', requires: ['CORE'], ns: 'KXNotifications', install: (c) => G('KXNotifications').install(c.core, { now: c.now }) },
        hub('APP.KX.VEHICLES', 'KXVehicles', true), hub('APP.KX.PETS', 'KXPets', true), hub('APP.KX.SCHOOL', 'KXSchool', true),
        { id: 'APP.KX.HOME', kind: 'HUB', requires: ['CORE'], ns: 'KXPersonalHomeComposite', install: (c) => G('KXPersonalHomeComposite').install(c.core, c.personal, { now: c.now, ...(c.homeOptions || {}) }) },
        hub('APP.KX.CONTRACTS', 'KXContracts', false), hub('APP.KX.HEALTH', 'KXHealth', false), hub('APP.KX.CERTIFY', 'KXCertify', false),
        hub('APP.KX.WARRANTY', 'KXWarranty', false), hub('APP.KX.SUBSCRIPTIONS', 'KXSubscriptions', false), hub('APP.KX.GARDEN', 'KXGarden', false), hub('APP.KX.PRINT3D', 'KXPrint3D', false), hub('APP.KX.HOBBY', 'KXHobby', false), hub('APP.KX.SHOP', 'KXShop', false),
        // after every hub: planner-derived cards only for owners without their own provider
        { id: 'SERVICE.PLANNER_OWNER', kind: 'SERVICE', requires: ['CORE'], after: 'HUBS', ns: 'KXPersonalPlannerOwner', install: (c) => G('KXPersonalPlannerOwner').install(c.personal, c.core) },
        // after every hub: connect installed hubs to notifications
        { id: 'SERVICE.NOTIFY_HUBS', kind: 'SERVICE', requires: ['CORE.NOTIFICATIONS'], after: 'HUBS', install: (c, done) => G('KXNotifications').attachInstalledHubs(c.core, done.filter(id => id.startsWith('APP.KX.')).map(id => { const m = MODULES.find(x => x.id === id); return id === 'APP.KX.HOME' ? G('KXHome') : G(m.ns); })) },
    ];
    const byId = new Map(MODULES.map(m => [m.id, m]));
    const PROFILES = { FULL: MODULES.map(m => m.id), CORE_ONLY: ['CORE', 'CORE.I18N', 'CORE.TAXONOMY', 'CORE.NOTIFICATIONS', 'CORE.RECORD_CONTROLS', 'CORE.IDENTITY', 'CORE.WEB_LINKS', 'CORE.SYNC_MERGE', 'CORE.HANDOFF', 'CORE.RECORD_CODES', 'CORE.RECORDER', 'CORE.PROMPTS', 'CORE.FIELDS', 'CORE.TIMER', 'CORE.LISTS', 'CORE.LAYOUT', 'CORE.APP_STATES', 'CORE.INSIGHTS', 'CORE.PROCESSES', 'CORE.BRAND', 'CORE.APPEARANCE_PACKS', 'CORE.NOTES', 'CORE.PROPAGATE', 'CORE.ISSUES'] };
    function resolve(requested) {
        if (!Array.isArray(requested) || !requested.length)
            throw new Error('MODULES_EMPTY_SELECTION');
        const out = new Set();
        const visit = (id, stack) => {
            const m = byId.get(id);
            if (!m)
                throw new Error('MODULE_UNKNOWN ' + id);
            if (stack.includes(id))
                throw new Error('MODULE_CYCLE ' + [...stack, id].join('>'));
            for (const r of m.requires)
                visit(r, [...stack, id]);
            out.add(id);
        };
        for (const id of requested)
            visit(String(id), []);
        const list = [...out];
        const rank = (m) => m.kind === 'CORE' ? 0 : m.kind === 'SERVICE' && !m.after ? 1 : m.kind === 'HUB' ? 2 : 3;
        return list.sort((a, b) => rank(byId.get(a)) - rank(byId.get(b)) || MODULES.indexOf(byId.get(a)) - MODULES.indexOf(byId.get(b)));
    }
    function install(ctx, selection = 'FULL') {
        const requested = typeof selection === 'string' ? PROFILES[selection] : selection;
        if (!requested)
            throw new Error('MODULE_PROFILE_UNKNOWN');
        const pre = ctx.preinstalled || [];
        for (const id of pre)
            if (!byId.has(id))
                throw new Error('MODULE_UNKNOWN ' + id);
        const order = resolve(requested), done = [...pre], reports = {};
        for (const id of order) {
            if (done.includes(id)) {
                reports[id] = 'PREINSTALLED';
                continue;
            }
            const m = byId.get(id);
            if (m.ns && !G(m.ns))
                throw new Error(`MODULE_NOT_LOADED ${id} (${m.ns})`);
            try {
                reports[id] = m.install(ctx, done);
                done.push(id);
            }
            catch (e) {
                throw new Error(`MODULE_INSTALL_FAILED ${id}: ${String(e?.message || e)} (installed: ${done.join(',') || 'none'})`);
            }
        }
        return Object.freeze({ contract: 'KX.MODULES/1', profile: typeof selection === 'string' ? selection : 'CUSTOM', installed: done.filter(x => !pre.includes(x)), preinstalled: pre, reports });
    }
    NS.MODULES = MODULES.map(m => Object.freeze({ id: m.id, kind: m.kind, requires: m.requires.slice(), after: m.after || null }));
    NS.PROFILES = PROFILES;
    NS.resolve = resolve;
    NS.install = install;
})(KXModules || (KXModules = {}));
