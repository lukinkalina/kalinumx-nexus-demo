// N2.4v: ONE set of DEMO data for the app (workspace DEMO) and nexus-mcp – clearly marked „DEMO“, written once (marker).
// SAFETY: refuses to write anywhere but a DEMO workspace (never into the user's live data).
var KXDemoSeed;
(function () {
    const MARK = 'CORE.DEMO_SEED.MARKER';
    const isDemo = (core) => String(core?.workspaceProfile?.mode || '') === 'DEMO';
    async function seed(core, actorId) {
        if (!isDemo(core))
            throw new Error('DEMO_SEED_NOT_DEMO_WORKSPACE');
        if (await core.entities.get(MARK).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const C = { actorId, appCode: 'APP.KX.NEXUS', permissions: ['CORE.TASK.EDIT', 'CORE.CALENDAR.EDIT'], confirmed: true };
        const sp = await core.propagate.spaces(actorId);
        /* not ready yet (spaces not installed) → no marker, the caller retries */ if (!sp?.length || !sp.find((s) => s.kind === 'PERSONAL'))
            throw new Error('DEMO_SEED_NOT_READY');
        const personal = sp.find((s) => s.kind === 'PERSONAL')?.id, company = sp.find((s) => s.kind === 'COMPANY')?.id || personal;
        const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
        const out = { tasks: 0, events: 0, comparisons: 0 };
        for (const [t, d] of [['DEMO: objednat materiál na gravírování', 1], ['DEMO: připravit kampaň na Vánoce', 3], ['DEMO: servis laseru MOPA', 7]])
            try {
                await core.actions.invoke('ACTION.CORE.TASK.SAVE', { title: t, ownerApp: 'APP.NEXUS', spaceIds: [personal], dueAt: day(d) }, C);
                out.tasks++;
            }
            catch { }
        for (const [t, d] of [['DEMO: schůzka s dodavatelem', 2], ['DEMO: veletrh', 14]])
            try {
                await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: t, ownerApp: 'APP.NEXUS', spaceIds: [personal], startsAt: day(d), allDay: false, attendeeIds: [], status: 'CONFIRMED' }, C);
                out.events++;
            }
            catch { }
        try {
            await core.currency?.setManual({ date: new Date().toISOString().slice(0, 10), rates: { EUR: 25, USD: 22 } }, C);
        }
        catch { }
        try {
            await core.actions.invoke('ACTION.PURCHASE.COMPARISON.SAVE', { name: 'DEMO: termosky', product: 'Termoska', category: 'Dárky', collection: 'DEMO', outputCurrency: 'CZK', spaceIds: [company], offers: [{ name: 'Termoska A', shop: 'demo-a.example', url: 'https://demo-a.example/termoska', price: 1990, currency: 'CZK', qty: 10, shipping: 99 }, { name: 'Termoska B', shop: 'demo-b.example', url: 'https://demo-b.example/termoska', price: 80, currency: 'EUR', qty: 10, shipping: 5, shippingCurrency: 'EUR' }] }, { ...C, appCode: 'APP.KX.PURCHASE' });
            out.comparisons++;
        }
        catch { }
        /* the marker only when something was really created – one failure must not block the DEMO for ever */ if (out.tasks + out.events === 0)
            throw new Error('DEMO_SEED_EMPTY');
        await core.entities.save({ id: MARK, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), ...out } }, C);
        return { seeded: true, ...out };
    }
    KXDemoSeed = { seed, isDemo, MARK };
    globalThis.KXDemoSeed = KXDemoSeed;
})();
