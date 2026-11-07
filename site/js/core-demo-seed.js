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
        try {
            await core.actions.invoke('ACTION.CORE.WEB.LINK.RECOMMENDED', { context: 'COMPANY' }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        }
        catch (e) {
            console.warn('DEMO web links', e);
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
        'APP.KX.WARRANTY': ['Laser MOPA 60 W', 'Notebook Dell', 'Pračka Bosch'], 'APP.KX.PRINT3D': ['Prusa MK4', 'Bambu X1C', 'Filament PETG'], 'APP.KX.SHOP': ['Dřevěná krabička', 'Gravírovaná deska', 'Svícen'], 'APP.KX.ASSETS': ['Televize Samsung', 'Sedací souprava', 'Šicí stroj'], 'APP.KX.MAINTENANCE': ['Laser MOPA 60 W', 'Odsávání dílny', 'Kompresor'], 'APP.KX.SERVICE': ['Oprava gravírky zákazníka', 'Výměna zdroje laseru', 'Oprava kávovaru'], 'APP.KX.PROJECTS': ['Vánoční kolekce 2026', 'Nový e-shop', 'Rekonstrukce koupelny'], 'APP.KX.HR': ['Petra – brigáda', 'Martin – externista', 'Jana – účetní'], 'APP.KX.ENERGY': ['Elektřina – dům', 'Plyn – dům', 'Elektřina – dílna'], 'APP.KX.RENTAL': ['Vrtačka sousedovi', 'Přívěs od tchána', 'Pronájem stánku na trhu'], 'APP.KX.DOCUMENTS': ['Pas Lukáš', 'Řidičák Helena', 'Manuál laseru MOPA'], 'APP.KX.FOOD': ['Mléko', 'Kuřecí prsa', 'Rajčata'], 'APP.KX.SALES': ['Kavárna U Mlýna', 'Jan Novák', 'Svatební salon Bella'], 'APP.KX.BUILD': ['Pergola na zahradě', 'Nová kuchyň', 'Plot u silnice'], 'APP.KX.STOCK': ['Dub 4 mm', 'Plexi čiré 3 mm', 'Dárkové krabičky'], 'APP.KX.INVENTORY': ['Aku vrtačka Makita', 'Notebook Dell', 'Žebřík 3 m'], 'APP.KX.FORMS': ['Předávací protokol zakázky', 'Kontrola laseru před směnou', 'Žádost o dovolenou'], 'APP.KX.GUIDE': ['Gravírování dřeva', 'Bezpečnost u laseru', 'Výměna filtru odsávání'], 'APP.KX.SHIPPING': ['Objednávka e-shop #1042', 'Dodávka plexi', 'Vratka – svícen'], 'APP.KX.PRINT': ['Svatební visačky 120 ks', 'Firemní dárky – gravírování', 'Náhradní díl – 3D tisk'], 'APP.KX.GRAPHICS': ['Logo kavárny U Mlýna', 'Vizitky DEMO', 'Podklad – svícen se jménem'] };
    const COMPANY_OWNERS = new Set(['APP.KX.PRINT', 'APP.KX.GRAPHICS', 'APP.KX.SALES', 'APP.KX.STOCK', 'APP.KX.INVENTORY', 'APP.KX.FORMS', 'APP.KX.GUIDE', 'APP.KX.SHIPPING', 'APP.KX.MAINTENANCE', 'APP.KX.SERVICE', 'APP.KX.PROJECTS', 'APP.KX.HR', 'APP.KX.CERTIFY', 'APP.KX.CONTRACTS', 'APP.KX.SUBSCRIPTIONS', 'APP.KX.WARRANTY', 'APP.KX.SHOP', 'APP.KX.PRINT3D', 'APP.KX.LASER', 'APP.KX.ADS', 'APP.KX.PURCHASE']);
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
                        if (!o.length)
                            continue;
                        const nm = String((NAMES[d.owner] || [])[i] || '').toLowerCase();
                        const hint = nm.match(/\(([^)]+)\)/)?.[1] || '';
                        const HINT = { 'papoušek': 'pták' };
                        const h = HINT[hint] || hint;
                        const byLabel = h ? o.find(k => String(def.options[k]?.cs || def.options[k]?.label || def.options[k] || '').toLowerCase().startsWith(h.slice(0, 4))) : null;
                        f[key] = byLabel || o[i % o.length];
                        continue;
                    } /* enum value matches the record name (cat -> Cat), otherwise each option in turn */
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
    /* N2.6b · DEMO data v5: hubs outside the hub kit – Vehicles (all deadlines in every state) and Notes (notebooks, sections, pages) */
    /* DEMO page bodies – every block type of the editor (headings, paragraph, numbered / bullet / checklist, callouts, table) */
    const R = (text) => [{ text }];
    const P = (t, x) => ({ t, runs: R(x) });
    const L = (t, xs) => ({ t, items: xs.map(x => Array.isArray(x) ? { runs: R(x[0]), checked: x[1] } : { runs: R(x) }) });
    const C = (kind, x) => ({ t: 'callout', kind, runs: R(x) });
    const TB = (rows) => ({ t: 'table', head: true, rows: rows.map(r => r.map(c => ({ runs: R(c) }))) });
    function demoDoc(title) {
        const D = {
            'Postup gravírování dřeva': [P('h2', 'DEMO · Postup'), L('ol', ['Přebrousit povrch zrnitostí 240', 'Zakrýt maskovací páskou', 'Nastavit fokus a výkon podle tabulky', 'Gravírovat ve dvou průchodech', 'Odstranit pásku a ošetřit olejem']), C('warn', 'Odsávání musí běžet po celou dobu gravírování.'), P('p', 'Doba na kus cca 12 minut.')],
            'Nastavení laseru MOPA pro kov': [P('h2', 'DEMO · Parametry'), TB([['Materiál', 'Výkon %', 'Rychlost mm/s', 'Frekvence kHz'], ['Nerez – černá', '40', '300', '200'], ['Hliník elox', '70', '1500', '30'], ['Mosaz', '85', '800', '40']]), C('info', 'Hodnoty jsou výchozí – před zakázkou udělejte zkušební čtverec.')],
            'Ceník gravírování': [P('h2', 'DEMO · Ceník'), TB([['Položka', 'Cena bez DPH'], ['Gravírování do 5×5 cm', '150 Kč'], ['Gravírování do 10×10 cm', '290 Kč'], ['Příprava grafiky', '350 Kč / hod']]), C('tip', 'Firemní zakázky nad 50 ks – sleva 15 %.')],
            'Seznam oprav na jaro': [P('h2', 'DEMO · Co opravit'), L('todo', [['Vyčistit okapy', true], ['Natřít plot', false], ['Opravit kohoutek v koupelně', false], ['Servis sekačky', true]]), C('info', 'Řemeslníky najdete na stránce Kontakty na řemeslníky.')],
            'Nápady na terasu': [P('h2', 'DEMO · Nápady'), L('ul', ['Dřevěná pergola s popínavou rostlinou', 'Solární světla podél zábradlí', 'Vyvýšené záhony na bylinky']), C('tip', 'Rozpočet zhruba 25 000 Kč.')],
            'Kontakty na řemeslníky': [P('h2', 'DEMO · Řemeslníci'), TB([['Řemeslo', 'Jméno', 'Telefon'], ['Instalatér', 'DEMO Novák', '+420 600 000 001'], ['Elektrikář', 'DEMO Svoboda', '+420 600 000 002']])],
            'Co zabalit': [P('h2', 'DEMO · Balení'), L('todo', [['Pasy a doklady', true], ['Nabíječky', false], ['Opalovací krém', false], ['Lékárnička', true]])],
            'Rozpočet dovolené': [P('h2', 'DEMO · Rozpočet'), TB([['Položka', 'Kč'], ['Ubytování', '28 000'], ['Doprava', '9 500'], ['Jídlo a výlety', '15 000']]), P('p', 'Celkem 52 500 Kč.')],
            'Vánoční kolekce': [P('h2', 'DEMO · Vánoce 2026'), L('ul', ['Gravírované ozdoby s monogramem', 'Dřevěné krabičky na dárky', 'Svícny s věnováním']), C('warn', 'Objednávky přijímat do 10. 12.')],
            'Svícny a krabičky': [P('h2', 'DEMO · Svícny a krabičky'), P('p', 'Varianty z dubu a ořechu, gravírování jména nebo loga.'), L('ul', ['Svícen dub – 490 Kč', 'Krabička ořech – 690 Kč'])]
        };
        return { schema: 'KX.RICHTEXT/1', blocks: D[title] || [P('p', 'DEMO · ukázková stránka')] };
    }
    const MARK5 = 'CORE.DEMO_SEED.MARKER.V5';
    async function seed5(core, actorId) {
        if (!isDemo(core))
            return { seeded: false };
        if (await core.entities.get(MARK5).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const sp = await core.propagate.spaces(actorId);
        const id = (k) => sp.find((x) => x.kind === k)?.id;
        const fam = id('FAMILY') || id('PERSONAL'), com = id('COMPANY') || fam;
        const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        const out = { vehicles: 0, books: 0, pages: 0, errors: [] };
        const V = [['Škoda Octavia Combi', '2BH 4521', 86420, -12, 20, 95000, 15000, 12, 140, fam, 'Rodinné auto – STK po termínu'], ['Ford Transit (dodávka)', '1BA 7788', 142300, 8, -5, 150000, 30000, 24, 40, com, 'Firemní dodávka – servis po termínu'], ['Přívěsný vozík', '2BC 1203', 0, 210, 365, 0, 0, 0, 300, fam, 'Vozík za auto']];
        for (const [name, plate, km, stk, serv, servKm, intKm, intM, ins, space, note] of V)
            try {
                const f = { spaceIds: [space], name: 'DEMO · ' + name, plate, odometerKm: km, inspectionDueAt: day(stk), serviceDueAt: day(serv), insuranceDueAt: day(ins), note: 'DEMO · ' + note };
                if (servKm)
                    f.serviceDueKm = servKm;
                if (intKm)
                    f.serviceIntervalKm = intKm;
                if (intM)
                    f.serviceIntervalMonths = intM;
                await core.actions.invoke('ACTION.VEHICLES.VEHICLE.CREATE', f, { actorId, appCode: 'APP.KX.VEHICLES', permissions: ['VEHICLES.VEHICLE.EDIT'], confirmed: true });
                out.vehicles++;
            }
            catch (e) {
                out.errors.push('vehicle ' + String(e?.message || e).slice(0, 80));
            }
        const NC = { actorId, appCode: 'APP.KX.NOTES', permissions: [], confirmed: true };
        const B = [['Rodina', fam, [['Dům a zahrada', ['Seznam oprav na jaro', 'Nápady na terasu', 'Kontakty na řemeslníky']], ['Dovolená 2027', ['Co zabalit', 'Rozpočet dovolené']]]],
            ['Dílna KalinumX', com, [['Zakázky', ['Postup gravírování dřeva', 'Nastavení laseru MOPA pro kov', 'Ceník gravírování']], ['Nápady', ['Vánoční kolekce', 'Svícny a krabičky']]]]];
        for (const [bname, space, secs] of B)
            try {
                const b = await core.actions.invoke('ACTION.CORE.NOTES.BOOK_CREATE', { name: 'DEMO · ' + bname, spaceIds: [space] }, NC);
                out.books++;
                const bid = b?.id || b?.entity?.id;
                for (const [sname, pages] of secs) {
                    const s = await core.actions.invoke('ACTION.CORE.NOTES.SECTION_CREATE', { bookId: bid, name: sname }, NC);
                    const sid = s?.id || s?.entity?.id;
                    for (const pt of pages) {
                        try {
                            await core.actions.invoke('ACTION.CORE.NOTES.PAGE_CREATE', { sectionId: sid, title: 'DEMO · ' + pt, doc: demoDoc(pt) }, NC);
                            out.pages++;
                        }
                        catch (e) {
                            out.errors.push('page ' + String(e?.message || e).slice(0, 80));
                        }
                    }
                }
            }
            catch (e) {
                out.errors.push('book ' + String(e?.message || e).slice(0, 80));
            }
        if (out.errors.length)
            console.warn('DEMO seed v5', out.errors.slice(0, 8));
        if (!out.vehicles && !out.books)
            throw new Error('DEMO_SEED_EMPTY');
        await core.entities.save({ id: MARK5, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), vehicles: out.vehicles, books: out.books, pages: out.pages } }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        return { seeded: true, ...out };
    }
    /* DEMO files for the Files hub (names, picture captions, text bodies) – demo content, Czech on purpose */
    const DEMO_FILES = { pictures: [{ name: 'DEMO – gravírovaná krabička.png', title: 'Gravírovaná krabička', a: '#3b2410', b: '#0b0e14' }, { name: 'DEMO – svícen z dubu.png', title: 'Svícen z dubu', a: '#1c3b2b', b: '#0b0e14' }, { name: 'DEMO – laserové pole.png', title: 'Laserové pole MOPA', a: '#102a3b', b: '#0b0e14' }, { name: 'DEMO – zahrada.png', title: 'Zahrada na jaře', a: '#2c3b10', b: '#0b0e14' }],
        pdf: { name: 'DEMO – ceník gravírování.pdf' }, texts: [{ name: 'DEMO – inventura materiálu.csv', mime: 'text/csv', body: 'Materiál;Množství;Jednotka\nDub 4 mm;12;deska\nPlexi čiré 3 mm;8;deska\nPETG filament;3;cívka\n' }, { name: 'DEMO – postup gravírování.txt', mime: 'text/plain', body: 'DEMO – postup gravírování dřeva\n1. Přebrousit povrch\n2. Zakrýt páskou\n3. Gravírovat ve dvou průchodech\n' }] };
    /* N2.6b · DEMO data v6: QR centre samples – fictional data only (the demo is public; never real contacts) */
    const MARK6 = 'CORE.DEMO_SEED.MARKER.V6';
    async function seed6(core, actorId) {
        if (!isDemo(core))
            return { seeded: false };
        if (await core.entities.get(MARK6).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const C = { actorId, appCode: 'APP.KX.QR_SOS', permissions: [], confirmed: true };
        const sp = await core.propagate.spaces(actorId);
        const id = (k) => sp.find((x) => x.kind === k)?.id;
        let n = 0;
        const Q = [['DEMO · Wi-Fi pro hosty', 'WIFI', { ssid: 'DEMO-Host', pass: 'demo-heslo-2026', sec: 'WPA' }, id('FAMILY')], ['DEMO · Vizitka dílny', 'CONTACT', { name: 'DEMO Dílna', tel: '+420 000 000 000', email: 'demo@example.com', org: 'DEMO Gravírování', url: 'https://example.com' }, id('COMPANY')],
            ['DEMO · SOS karta', 'SOS', { name: 'DEMO Osoba', ice: '+420 000 000 001', blood: '0+', allergy: 'žádné', meds: 'žádné' }, id('PERSONAL')], ['DEMO · Web e-shopu', 'WEB', { url: 'https://example.com/eshop' }, id('COMPANY')]];
        for (const [name, kind, fields, space] of Q) {
            try {
                await core.actions.invoke('ACTION.QR.CODE.SAVE', { spaceId: space, data: { name, kind, fields } }, C);
                n++;
            }
            catch (e) {
                console.warn('DEMO qr', e);
            }
        }
        if (!n)
            throw new Error('DEMO_SEED_EMPTY');
        await core.entities.save({ id: MARK6, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), qr: n } }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        return { seeded: true, qr: n };
    }
    /* N2.6b · DEMO data v7: real PLANNED payments in Finance (My day quick actions: pay / move / pause / cancel) – fictional, DEMO only */
    const MARK7 = 'CORE.DEMO_SEED.MARKER.V7';
    async function seed7(core, actorId) {
        if (!isDemo(core))
            return { seeded: false };
        if (await core.entities.get(MARK7).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const C = { actorId, appCode: 'APP.KX.FINANCE', permissions: [], confirmed: true };
        const sp = await core.propagate.spaces(actorId);
        const id = (k) => sp.find((x) => x.kind === k)?.id;
        const fam = id('FAMILY') || id('PERSONAL'), com = id('COMPANY') || fam;
        const D = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        let n = 0;
        const P = [['DEMO · Elektřina ČEZ', fam, 2480, 'ENERGY', 0, 'MONTHLY'], ['DEMO · Nájem bytu', fam, 12000, 'HOUSING', 0, 'MONTHLY'], ['DEMO · Internet O2', fam, 599, 'UTILITIES', 1, 'MONTHLY'],
            ['DEMO · Pojištění domácnosti', fam, 1450, 'INSURANCE', 5, 'QUARTERLY'], ['DEMO · Kroužky dětí', fam, 990, 'KIDS_SCHOOL', 9, 'MONTHLY'], ['DEMO · Faktura materiál (dřevo, plexi)', com, 6300, 'MATERIAL', 4, 'MONTHLY'], ['DEMO · Hosting e-shopu', com, 349, 'SERVICES', 12, 'MONTHLY']];
        for (const [name, space, amount, category, day, every] of P) {
            try {
                await core.actions.invoke('ACTION.FINANCE.PLANNED.SAVE', { spaceId: space, data: { name, kind: 'EXPENSE', amount, currency: 'CZK', category, every, nextDate: D(day) } }, C);
                n++;
            }
            catch (e) {
                console.warn('DEMO planned', name, e);
            }
        }
        await core.entities.save({ id: MARK7, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), planned: n } }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        return { seeded: true, planned: n };
    }
    /* N2.6b · DEMO data v8: Hobby a záliby – devices with deadlines + log entries (fictional; places generic, no real coordinates) */
    const MARK8 = 'CORE.DEMO_SEED.MARKER.V8';
    async function seed8(core, actorId) {
        if (!isDemo(core))
            return { seeded: false };
        if (await core.entities.get(MARK8).catch(() => null))
            return { seeded: false, reason: 'ALREADY' };
        const C = { actorId, appCode: 'APP.KX.HOBBY', permissions: ['HOBBY_DEVICE.DEVICE.EDIT', 'HOBBY_DEVICE.DEVICE.READ', 'HOBBY_DEVICE.DEADLINE.EDIT', 'HOBBY_LOG.ENTRY.EDIT', 'HOBBY_LOG.ENTRY.READ'], confirmed: true };
        const sp = await core.propagate.spaces(actorId);
        const personal = sp.find((x) => x.kind === 'PERSONAL')?.id || sp[0]?.id;
        const D = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        let n = 0, dl = 0, lg = 0;
        const DEV = [{ name: 'DEMO · Rutus Alter 71', kind: 'DETECTOR', manufacturer: 'Rutus', model: 'Alter 71', firmware: '3.1', battery: 'Li-Ion 7.4 V', section: 'DETECTORS', due: [['FIRMWARE', 'Aktualizace firmwaru', 12], ['SERVICE', 'Kontrola cívky a kabelu', 45]] },
            { name: 'DEMO · Nokta PulseDive', kind: 'PINPOINTER', manufacturer: 'Nokta Makro', model: 'PulseDive 2v1', battery: 'vestavěná', section: 'DETECTORS', due: [['CHARGE', 'Nabít před výpravou', 2]] },
            { name: 'DEMO · Traxxas E-Revo', kind: 'RC', manufacturer: 'Traxxas', model: 'E-Revo 2.0', battery: 'LiPo 2× 3S 5000 mAh', section: 'RC', due: [['SERVICE', 'Výměna oleje v tlumičích', 20], ['CHARGE', 'Skladovací napětí baterií', 6]] },
            { name: 'DEMO · DJI Mini 4 Pro', kind: 'DRONE', manufacturer: 'DJI', model: 'Mini 4 Pro', firmware: '01.00.0400', battery: '3× Intelligent Flight', section: 'DRONES', due: [['REGISTRATION', 'Prodloužení registrace a pojištění', 30], ['FIRMWARE', 'Aktualizace firmwaru', 9]] },
            { name: 'DEMO · Horské kolo', kind: 'BIKE', manufacturer: 'Specialized', model: 'Stumpjumper', section: 'BIKE', due: [['SERVICE', 'Servis vidlice a brzd', 25]] }];
        for (const d of DEV) {
            try {
                const pl = { name: d.name, kind: d.kind, manufacturer: d.manufacturer, model: d.model, firmware: d.firmware, battery: d.battery, section: d.section, note: 'DEMO', spaceIds: [personal] };
                for (const k of Object.keys(pl))
                    if (pl[k] === undefined)
                        delete pl[k]; /* send only filled fields */
                const r = await core.actions.invoke('ACTION.HOBBY_DEVICE.DEVICE.CREATE', pl, C);
                n++;
                let rev = r?.revision || 1;
                for (const [k, label, day] of d.due) {
                    try {
                        const x = await core.actions.invoke('ACTION.HOBBY_DEVICE.DEADLINE.ADD', { id: r.id, expectedRevision: rev, deadline: { kind: k, label: 'DEMO · ' + label, dueAt: D(day) } }, C);
                        rev = x?.revision || rev + 1;
                        dl++;
                    }
                    catch (e) {
                        console.warn('DEMO hobby deadline', e);
                    }
                }
            }
            catch (e) {
                console.warn('DEMO hobby device', d.name, e);
            }
        }
        const LOG = [{ name: 'DEMO · Mince – pole za vsí', logKind: 'FIND', date: D(-6), device: 'DEMO · Rutus Alter 71', place: 'pole (obecně, bez souřadnic)', settings: 'Disk 4, citlivost 85', result: 'Mince 20. století', depthCm: '14', section: 'DETECTORS', private: 'YES' },
            { name: 'DEMO · Jízda v lomu', logKind: 'RIDE', date: D(-3), device: 'DEMO · Traxxas E-Revo', place: 'RC dráha', result: '25 min, bez závad', section: 'RC', private: 'NO' },
            { name: 'DEMO · Let – západ slunce', logKind: 'FLIGHT', date: D(-1), device: 'DEMO · DJI Mini 4 Pro', place: 'otevřená krajina, mimo zóny', result: '4 lety, 38 min, fotky v Galerii', section: 'DRONES', private: 'NO' }];
        for (const l of LOG) {
            try {
                await core.actions.invoke('ACTION.HOBBY_LOG.ENTRY.CREATE', { ...l, note: 'DEMO', spaceIds: [personal] }, C);
                lg++;
            }
            catch (e) {
                console.warn('DEMO hobby log', l.name, e);
            }
        }
        if (!n && !lg)
            return { seeded: false, reason: 'FAILED', devices: n, log: lg }; /* never mark as done when nothing was created */
        await core.entities.save({ id: MARK8, type: 'CORE.DEMO_SEED', ownerApp: 'APP.KX.NEXUS', schema: 'KX.DEMO_SEED/1', spaceIds: [], data: { at: new Date().toISOString(), devices: n, deadlines: dl, log: lg } }, { actorId, appCode: 'APP.KX.NEXUS', permissions: [], confirmed: true });
        return { seeded: true, devices: n, deadlines: dl, log: lg };
    }
    KXDemoSeed = { seed, seed2, seed3, seed4, seed5, seed6, seed7, seed8, isDemo, MARK, MARK2, MARK3, MARK4, MARK5, MARK6, MARK7, MARK8, DEMO_FILES };
    globalThis.KXDemoSeed = KXDemoSeed;
})();
