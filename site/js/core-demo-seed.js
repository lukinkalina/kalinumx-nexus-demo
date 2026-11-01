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
    /* N2.6b · DEMO data v2 (rozhodnutí uživatele „ukázková data nastav všechna“): platby se splatností, výplata, úkoly a události na celý měsíc,
       účty se zůstatky a rodinná rezerva – vlastní značka V2, doplní se i do existujícího DEMO prostoru, nic nezdvojí; jen v DEMO workspace */
    const MARK2 = 'CORE.DEMO_SEED.MARKER.V2';
    async function seed2(core, actorId) {
        if (!isDemo(core))
            return { seeded: false, reason: 'NOT_DEMO' };
        if (await core.entities.get(MARK2).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const C = { actorId, appCode: 'APP.KX.NEXUS', permissions: ['CORE.TASK.EDIT', 'CORE.CALENDAR.EDIT'], confirmed: true };
        const sp = await core.propagate.spaces(actorId);
        if (!sp?.length)
            throw new Error('DEMO_SEED_NOT_READY');
        const id = (k) => sp.find((s) => s.kind === k)?.id;
        const personal = id('PERSONAL'), family = id('FAMILY') || personal, company = id('COMPANY') || personal;
        const day = (n, h = 9) => { const d = new Date(); d.setHours(h, 0, 0, 0); return new Date(d.getTime() + n * 86400000).toISOString(); };
        const out = { tasks: 0, events: 0, accounts: 0, goals: 0 };
        const T = [['Nájem bytu – 12 000 Kč', 0, family], ['Elektřina ČEZ – 2 480 Kč', 0, family], ['Nákup potravin – 2 500 Kč', 0, family], ['Příprava daňového přiznání', 0, company], ['Internet O2 – 599 Kč', 1, family],
            ['Faktura materiál (dřevo, plexi) – 6 300 Kč', 4, company], ['Pojištění auta – 1 450 Kč', 5, family], ['Záloha ZP MV ČR – 3 143 Kč', 8, personal], ['Hypotéka – 18 900 Kč', 9, family], ['Objednat vánoční dárky', 10, family],
            ['Telefony Vodafone – 890 Kč', 12, family], ['Leasing laseru MOPA – 7 900 Kč', 15, company], ['Kontrolní hlášení DPH', 20, company], ['Školné – kroužky dětí – 1 800 Kč', 24, family], ['Platba za vodu – 1 120 Kč', -3, family], ['Vrátit knihy do knihovny', -1, family]].map(([a, b, c]) => ['DEMO · ' + a, b, c]);
        for (const [t, d, s] of T)
            try {
                await core.actions.invoke('ACTION.CORE.TASK.SAVE', { title: t, ownerApp: 'APP.NEXUS', spaceIds: [s], dueAt: day(d) }, C);
                out.tasks++;
            }
            catch { }
        const E = [['Výplata (mzda)', 3, 8, family], ['Výplata (mzda)', 33, 8, family], ['Kontrola Lukáška – ortopedie', 0, 15, family], ['Sport – fotbal (děti)', 1, 17, family], ['Schůzka s účetní', 6, 10, company],
            ['Rodinná oslava – narozeniny', 13, 16, family], ['Servis auta', 18, 8, family], ['Veletrh dárků Brno', 22, 9, company], ['Dovoz materiálu', 27, 11, company]].map(([a, b, c, d]) => ['DEMO · ' + a, b, c, d]);
        for (const [t, d, h, s] of E)
            try {
                await core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: t, ownerApp: 'APP.NEXUS', spaceIds: [s], startsAt: day(d, h), allDay: false, attendeeIds: [], status: 'CONFIRMED' }, C);
                out.events++;
            }
            catch { }
        const CF = { ...C, appCode: 'APP.KX.FINANCE' };
        const today = new Date().toISOString().slice(0, 10);
        for (const [name, kind, space, amount] of [['Běžný účet – rodina', 'BANK', family, 54300], ['Firemní účet KalinumX', 'BANK', company, 32120]])
            try {
                const a = await core.actions.invoke('ACTION.FINANCE.ACCOUNT.SAVE', { spaceId: space, data: { name, kind, currency: 'CZK', note: 'DEMO' } }, CF);
                const accId = a?.id || a?.entity?.id;
                if (accId) {
                    await core.actions.invoke('ACTION.FINANCE.BALANCE.SAVE', { data: { account: accId, date: today, amount } }, CF);
                }
                out.accounts++;
            }
            catch (e) {
                console.warn('DEMO account', e);
            }
        try {
            await core.actions.invoke('ACTION.FINANCE.GOAL.SAVE', { spaceId: family, data: { name: 'Rodinná rezerva', target: 500000, currency: 'CZK', start: 412000 } }, CF);
            out.goals++;
        }
        catch (e) {
            console.warn('DEMO goal', e);
        }
        if (out.tasks + out.events === 0)
            throw new Error('DEMO_SEED_EMPTY');
        await core.entities.save({ id: MARK2, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), ...out } }, C);
        return { seeded: true, ...out };
    }
    /* N2.6b · DEMO data v3: příjmy a výdaje za posledních 31 dní (grafy přehledu) – vlastní značka V3, jen DEMO */
    const MARK3 = 'CORE.DEMO_SEED.MARKER.V3';
    async function seed3(core, actorId) {
        if (!isDemo(core))
            return { seeded: false };
        if (await core.entities.get(MARK3).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const C = { actorId, appCode: 'APP.KX.FINANCE', permissions: [], confirmed: true };
        const sp = await core.propagate.spaces(actorId);
        const id = (k) => sp.find((x) => x.kind === k)?.id;
        const fam = id('FAMILY') || id('PERSONAL'), com = id('COMPANY');
        const D = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
        let n = 0;
        const mv = async (space, kind, day, amount, category, counterparty) => { try {
            await core.actions.invoke('ACTION.FINANCE.MOVEMENT.SAVE', { spaceId: space, data: { kind, date: D(day), amount, currency: 'CZK', category, counterparty, note: 'DEMO' } }, C);
            n++;
        }
        catch (e) {
            console.warn('DEMO movement', e);
        } };
        const F = [['INCOME', 27, 42500, 'SALARY', 'Zaměstnavatel'], ['INCOME', 12, 3200, 'OTHER_INCOME', 'Prodej na bazaru'], ['EXPENSE', 29, 12000, 'HOUSING', 'Nájem'], ['EXPENSE', 26, 2480, 'ENERGY', 'ČEZ'],
            ['EXPENSE', 24, 1890, 'FOOD', 'Albert'], ['EXPENSE', 21, 1450, 'INSURANCE', 'Kooperativa'], ['EXPENSE', 19, 2310, 'FOOD', 'Lidl'], ['EXPENSE', 17, 1200, 'TRANSPORT', 'Benzina'], ['EXPENSE', 15, 990, 'KIDS_SCHOOL', 'Kroužky'],
            ['EXPENSE', 13, 2650, 'FOOD', 'Kaufland'], ['EXPENSE', 10, 599, 'SUBSCRIPTIONS', 'O2'], ['EXPENSE', 8, 1750, 'CAR', 'Servis'], ['EXPENSE', 6, 2120, 'FOOD', 'Albert'], ['EXPENSE', 4, 890, 'HEALTH', 'Lékárna'], ['EXPENSE', 2, 1980, 'FOOD', 'Lidl'], ['INCOME', 1, 1500, 'OTHER_INCOME', 'Vrácení přeplatku']];
        for (const [k, d, a, c, cp] of F)
            await mv(fam, k, d, a, c, cp);
        if (com) {
            const Cm = [['INCOME', 28, 8900, 'SALES', 'E-shop'], ['INCOME', 25, 12400, 'SALES', 'Zakázka gravírování'], ['EXPENSE', 23, 6300, 'MATERIAL', 'Dřevo, plexi'], ['INCOME', 20, 5600, 'SALES', 'E-shop'],
                ['EXPENSE', 18, 1200, 'SHIPPING', 'Zásilkovna'], ['INCOME', 16, 15800, 'SALES', 'Firemní dárky'], ['EXPENSE', 14, 7900, 'TOOLS_MACHINES', 'Leasing laseru'], ['INCOME', 11, 7300, 'SALES', 'E-shop'], ['EXPENSE', 9, 2400, 'MARKETING', 'Reklama'],
                ['INCOME', 7, 9900, 'SALES', 'Zakázka'], ['EXPENSE', 5, 980, 'SOFTWARE', 'Licence'], ['INCOME', 3, 11200, 'SALES', 'E-shop'], ['EXPENSE', 2, 1650, 'SHIPPING', 'PPL']];
            for (const [k, d, a, c, cp] of Cm)
                await mv(com, k, d, a, c, cp);
        }
        if (!n)
            throw new Error('DEMO_SEED_EMPTY');
        await core.entities.save({ id: MARK3, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), movements: n } }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        return { seeded: true, movements: n };
    }
    /* N2.6b · DEMO data v4 (user: "demo everywhere, marked DEMO, covering the whole range of functions and values"):
       EVERY hub built on the hub kit gets 3 records with ALL fields filled (each enum option used in turn) and items of EVERY kind
       spread over overdue / soon / later / recurring – generic, so hubs added later are covered too; through the same actions as the user */
    const MARK4 = 'CORE.DEMO_SEED.MARKER.V4';
    const NAMES = { 'APP.KX.PETS': ['Rex (pes)', 'Micka (kočka)', 'Kuba (papoušek)'], 'APP.KX.HOME': ['Kotel a topení', 'Střecha a okapy', 'Zahradní technika'], 'APP.KX.HOBBY': ['RC model Buggy', 'Dron DJI', 'Kolo Specialized'],
        'APP.KX.SCHOOL': ['Lukášek – 3. třída', 'Veronika – gymnázium', 'Kroužek angličtiny'], 'APP.KX.HEALTH': ['Lukáš', 'Helena', 'Lukášek'], 'APP.KX.GARDEN': ['Rajčata', 'Jabloň', 'Levandule'], 'APP.KX.VEHICLES': ['Škoda Octavia', 'Dodávka Transit', 'Vozík'],
        'APP.KX.CERTIFY': ['Revize elektro dílna', 'Hasicí přístroje', 'Kalibrace laseru'], 'APP.KX.CONTRACTS': ['Nájem dílny', 'Smlouva s dodavatelem dřeva', 'Pojištění firmy'], 'APP.KX.SUBSCRIPTIONS': ['Adobe CC', 'Shopify', 'LightBurn'],
        'APP.KX.WARRANTY': ['Laser MOPA 60 W', 'Notebook Dell', 'Pračka Bosch'], 'APP.KX.PRINT3D': ['Prusa MK4', 'Bambu X1C', 'Filament PETG'], 'APP.KX.SHOP': ['Dřevěná krabička', 'Gravírovaná deska', 'Svícen'] };
    const COMPANY_OWNERS = new Set(['APP.KX.CERTIFY', 'APP.KX.CONTRACTS', 'APP.KX.SUBSCRIPTIONS', 'APP.KX.WARRANTY', 'APP.KX.SHOP', 'APP.KX.PRINT3D', 'APP.KX.LASER', 'APP.KX.ADS', 'APP.KX.PURCHASE']);
    async function seed4(core, actorId) {
        if (!isDemo(core))
            return { seeded: false };
        if (await core.entities.get(MARK4).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const K = globalThis.KXHubKit;
        const doms = (K?.domains || []).filter((d) => d.createAction);
        if (!doms.length)
            throw new Error('DEMO_SEED_NOT_READY');
        const sp = await core.propagate.spaces(actorId);
        const id = (k) => sp.find((x) => x.kind === k)?.id;
        const fam = id('FAMILY') || id('PERSONAL'), com = id('COMPANY') || fam;
        const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        const out = { subjects: 0, items: 0, hubs: 0, errors: [] };
        for (const d of doms) {
            const C = { actorId, appCode: d.owner, permissions: d.permission ? [d.permission] : [], confirmed: true };
            const space = COMPANY_OWNERS.has(d.owner) ? com : fam;
            let made = 0;
            const SF = d.subjectFields || {};
            const nameField = SF[d.nameKey] ? d.nameKey : (SF.name ? 'name' : SF.title ? 'title' : (Object.keys(SF).find(k => SF[k].kind === 'text' && SF[k].required) || d.nameKey));
            for (let i = 0; i < 3; i++) {
                const f = { spaceIds: [space] };
                for (const [key, def] of Object.entries(SF)) {
                    if (key === nameField) {
                        f[key] = ('DEMO · ' + ((NAMES[d.owner] || [])[i] || `${d.label} ${i + 1}`)).slice(0, def.max || 80);
                        continue;
                    }
                    if (def.kind === 'enum') {
                        const o = Object.keys(def.options || {});
                        if (o.length)
                            f[key] = o[(i + o.indexOf(o[i % o.length])) % o.length];
                        continue;
                    }
                    if (def.kind === 'date') {
                        f[key] = day(-400 * (i + 1));
                        continue;
                    }
                    if (def.kind === 'number' || def.kind === 'int' || def.kind === 'money') {
                        const mn = Number(def.min ?? 1), mx = Number(def.max ?? 1000);
                        f[key] = Math.min(mx, Math.max(mn, Math.round(mn + (mx - mn) * (i + 1) / 4)));
                        continue;
                    }
                    if (def.kind === 'bool' || def.kind === 'boolean') {
                        f[key] = i % 2 === 0;
                        continue;
                    }
                    if (def.kind === 'text') {
                        let v = `DEMO ${def.label || key} ${i + 1}`;
                        if (def.pattern) {
                            v = `DEMO-${100 + i}`;
                            if (!new RegExp(def.pattern).test(v))
                                continue;
                        }
                        f[key] = v.slice(0, def.max || 80);
                    }
                }
                try {
                    const r = await core.actions.invoke(d.createAction, f, C);
                    made++;
                    out.subjects++;
                    const rid = r?.id || r?.entity?.id;
                    let rev = r?.revision ?? r?.entity?.revision;
                    if (rid && d.addItemAction && d.itemKinds) {
                        const kinds = Object.keys(d.itemKinds).slice(0, Math.min(d.maxItems || 8, 8));
                        let j = 0;
                        for (const kd of kinds) {
                            const due = [-3, 5, 40, 12, 90, -10, 25, 60][(j + i) % 8];
                            const item = { kind: kd, label: `DEMO · ${d.itemKinds[kd]}` };
                            if (j % 3 === 2)
                                item.intervalDays = [30, 90, 365][i % 3];
                            else
                                item.dueAt = day(due);
                            try {
                                const r2 = await core.actions.invoke(d.addItemAction, { id: rid, expectedRevision: rev, [d.itemPayloadKey]: item }, C);
                                rev = r2?.revision ?? r2?.entity?.revision ?? rev;
                                out.items++;
                            }
                            catch (e) {
                                out.errors.push(d.owner + ' item ' + String(e?.message || e).slice(0, 60));
                            }
                            j++;
                        }
                    }
                }
                catch (e) {
                    out.errors.push(d.owner + ' ' + String(e?.message || e).slice(0, 80));
                }
            }
            if (made)
                out.hubs++;
        }
        if (!out.subjects)
            throw new Error('DEMO_SEED_EMPTY');
        if (out.errors.length)
            console.warn('DEMO seed v4', out.errors.slice(0, 12));
        await core.entities.save({ id: MARK4, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), subjects: out.subjects, items: out.items, hubs: out.hubs } }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        return { seeded: true, ...out };
    }
    KXDemoSeed = { seed, seed2, seed3, seed4, isDemo, MARK, MARK2, MARK3, MARK4 };
    globalThis.KXDemoSeed = KXDemoSeed;
})();
