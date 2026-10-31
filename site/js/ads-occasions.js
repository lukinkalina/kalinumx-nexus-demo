// N2.4n: occasions calendar for advertising – world holidays with traditions per country, ad idea, campaign lead time.
// CONTENT (traditions, symbols, ideas, lead times) was written in NEXUS and is marked to verify (verified:false).
// DATES: fixed / Easter (Gregorian) / Orthodox Easter (Julian computus → Gregorian) / n-th weekday are computed;
// lunar or other calendars (Lunar New Year, Diwali, Eid, Hanukkah …) have NO date until taken from a verified source.
var KXAdsOccasions;
(function () {
    const iso = (d) => d.toISOString().slice(0, 10);
    const add = (d, n) => new Date(+d + n * 86400000);
    function nth(y, m, wd, n) { if (n > 0) {
        const d = new Date(Date.UTC(y, m - 1, 1));
        return new Date(Date.UTC(y, m - 1, 1 + ((wd - d.getUTCDay() + 7) % 7) + (n - 1) * 7));
    } const last = new Date(Date.UTC(y, m, 0)); return new Date(Date.UTC(y, m - 1, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7))); }
    function orthodoxEaster(y) { const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1; const julian = new Date(Date.UTC(y, month - 1, day)); return add(julian, Math.floor(y / 100) - Math.floor(y / 400) - 2); }
    const easter = (y) => globalThis.KXHolidays?.easter(y);
    /* rule: {fixed:'MM-DD'} | {easter:offset} | {orthodox:offset} | {nth:[month,weekday,n]} | {source:'NEEDED'} */
    function dateOf(rule, y) { if (rule.fixed)
        return `${y}-${rule.fixed}`; if (rule.easter != null) {
        const e = easter(y);
        return e ? iso(add(e, rule.easter)) : null;
    } if (rule.orthodox != null)
        return iso(add(orthodoxEaster(y), rule.orthodox)); if (rule.nth)
        return iso(nth(y, rule.nth[0], rule.nth[1], rule.nth[2])); if (rule.onOrAfter) {
        const [md, wd] = rule.onOrAfter;
        const d = new Date(`${y}-${md}T00:00:00Z`);
        return iso(add(d, (wd - d.getUTCDay() + 7) % 7));
    } return null; }
    const O = (key, rule, leadWeeks, markets, idea, opts = {}) => ({ key, rule, leadWeeks, markets: markets.map(([country, note]) => ({ country, note })), idea, verified: false, kind: 'OCCASION', ...opts });
    const OCCASIONS = [
        O('NEW_YEAR', { fixed: '01-01' }, 6, [['CZ', 'Silvestr, ohňostroj, přípitek'], ['DE', 'Silvester, Bleigießen (dnes vosk), štěstí – prasátko, čtyřlístek'], ['US', 'New Year\'s Eve, ball drop, předsevzetí']], 'Kalendáře, plánovače, personalizované sklenice na přípitek'),
        O('VALENTINE', { fixed: '02-14' }, 5, [['CZ', 'Valentýn – mladší tradice, srdce, růže'], ['US', 'Valentine\'s Day – karty, čokoláda, šperky'], ['DE', 'Valentinstag – květiny'], ['JP', 'muži dostávají čokoládu, ženy oplácejí 14. 3. (White Day)']], 'Páry: iniciály, datum seznámení, srdce; klíčenky, náramky, dog tagy pro dva'),
        O('WOMENS_DAY', { fixed: '03-08' }, 3, [['CZ', 'MDŽ – karafiát, kytička'], ['PL', 'Dzień Kobiet – květiny'], ['UA', 'Mezinárodní den žen – významný svátek']], 'Drobné dárky: přívěsky se jménem, gravírované zrcátko'),
        O('EASTER', { easter: 0 }, 5, [['CZ', 'pomlázka, kraslice, beránek'], ['SK', 'oblievačka (polévání), kraslice'], ['PL', 'Śmigus-dyngus (polévání), pisanki'], ['DE', 'Osterhase, Ostereier, Osterbrunnen'], ['AT', 'Osterhase, posvěcení košíku'], ['US', 'Easter Bunny, hledání vajíček'], ['GB', 'Easter eggs, hot cross buns']], 'Gravírovaná dřevěná vajíčka, cedulky na pomlázku, jmenovky na košík'),
        O('EASTER_ORTHODOX', { orthodox: 0 }, 5, [['UA', 'Великдень – paska, malovaná vejce'], ['RS', 'Vaskrs – ťukání vejci'], ['GR', 'Pascha – červená vejce'], ['BG', 'Великден']], 'Stejné motivy jako Velikonoce, datum jinak – kampaň zvlášť'),
        O('MOTHERS_DAY', { nth: [5, 0, 2] }, 4, [['CZ', '2. neděle v květnu'], ['DE', 'Muttertag – 2. neděle v květnu'], ['US', 'Mother\'s Day – 2. neděle v květnu'], ['AT', '2. neděle v květnu']], 'Přívěsky se jmény dětí, gravírované krabičky, fotogravír', { note: 'GB slaví Mothering Sunday 3 týdny před Velikonocemi (jiné datum)' }),
        O('MOTHERING_SUNDAY_GB', { easter: -21 }, 4, [['GB', 'Mothering Sunday – 4. neděle postní']], 'Jako Den matek, termín podle Velikonoc'),
        O('CHILDRENS_DAY', { fixed: '06-01' }, 3, [['CZ', 'Den dětí'], ['PL', 'Dzień Dziecka'], ['SK', 'MDD']], 'Jmenovky na batohy, dog tagy s kontaktem rodiče, gravírované penály'),
        O('FATHERS_DAY', { nth: [6, 0, 3] }, 4, [['CZ', '3. neděle v červnu'], ['US', 'Father\'s Day – 3. neděle v červnu'], ['GB', '3. neděle v červnu']], 'Dog tag, spona na peníze, kapesní nůž, otvírák – s textem / datem', { note: 'DE slaví Vatertag na Nanebevstoupení Páně (Velikonoce + 39 dní)' }),
        O('FATHERS_DAY_DE', { easter: 39 }, 4, [['DE', 'Vatertag / Herrentag – výlety s vozíkem'], ['AT', 'Vatertag v Rakousku je 2. neděle v červnu (jiné datum)']], 'Otvíráky, placatky, dog tagy'),
        O('SCHOOL_START', { fixed: '09-01' }, 4, [['CZ', 'začátek školního roku'], ['SK', 'začátek školního roku'], ['DE', 'Schultüte – termíny podle spolkových zemí']], 'Jmenovky, penály, štítky na věci'),
        O('HALLOWEEN', { fixed: '10-31' }, 5, [['US', 'trick-or-treat, dýně'], ['GB', 'Halloween'], ['CZ', 'rostoucí zvyk, dýně']], 'Sezónní série (dýně, netopýři) – bez personalizace, rychlá výroba'),
        O('BLACK_FRIDAY', { nth: [11, 4, 4], plus: 1 }, 6, [['US', 'den po Thanksgiving – slevy'], ['CZ', 'přebírá se, e-shopy'], ['DE', 'Black Friday / Cyber Monday']], 'Slevové kampaně, balíčky; plánovat sklad a kapacitu laserů', { note: 'datum = 4. čtvrtek v listopadu + 1 den' }),
        O('THANKSGIVING_US', { nth: [11, 4, 4] }, 6, [['US', 'Thanksgiving – krocan, rodina'], ['CA', 'v Kanadě 2. pondělí v říjnu (jiné datum)']], 'Rodinné dárky, prkénka s gravírem'),
        O('ST_NICHOLAS', { fixed: '12-05' }, 5, [['CZ', 'Mikuláš, čert, anděl (večer 5. 12.)'], ['NL', 'Sinterklaas – dárky 5. 12. večer'], ['DE', 'Nikolaus – boty 6. 12. ráno'], ['AT', 'Nikolaus a Krampus']], 'Malé dárky, jmenovky na punčochy / boty'),
        O('CHRISTMAS', { fixed: '12-24' }, 10, [['CZ', 'Ježíšek nosí dárky 24. 12. večer'], ['SK', 'Ježiško, 24. 12.'], ['AT', 'Christkind, 24. 12.'], ['DE', 'jih Christkind, sever Weihnachtsmann; 24. 12.'], ['US', 'Santa Claus, dárky 25. 12. ráno'], ['GB', 'Father Christmas, 25. 12.'], ['IT', 'dárky i 6. 1. (Befana)'], ['ES', 'Tři králové 6. 1.'], ['RU', 'Děda Mráz na Nový rok, Vánoce 7. 1.']], 'Personalizované ozdoby, termosky, sady; doručení do 20. 12. podle státu', { note: 'poslední den objednávky a doručení podle země a dopravce' }),
        /* N2.4n (user): main national / significant days of EU countries, the USA and the UK – kind NATIONAL, one market each; content to verify */
        O('IE_ST_PATRICK', { fixed: '03-17' }, 4, [['IE', 'St. Patrick\'s Day – zelená, jetel, průvody'], ['US', 'St. Patrick\'s Day – zelená, irská kultura'], ['GB', 'slaví se hlavně v Severním Irsku']], 'Zelené motivy, jetel, irské symboly', { kind: 'NATIONAL' }),
        O('US_MLK', { nth: [1, 1, 3] }, 3, [['US', 'Martin Luther King Jr. Day – 3. pondělí v lednu']], 'Bez komerčních motivů – spíš ne pro slevy', { kind: 'NATIONAL' }),
        O('US_PRESIDENTS', { nth: [2, 1, 3] }, 3, [['US', 'Presidents\' Day – 3. pondělí v únoru, víkendové výprodeje']], 'Výprodejová kampaň', { kind: 'NATIONAL' }),
        O('US_MEMORIAL', { nth: [5, 1, -1] }, 4, [['US', 'Memorial Day – poslední pondělí v květnu, začátek léta, výprodeje']], 'Letní série, vojenské motivy (dog tagy) s respektem', { kind: 'NATIONAL' }),
        O('US_INDEPENDENCE', { fixed: '07-04' }, 5, [['US', 'Independence Day – ohňostroje, grilování, hvězdy a pruhy']], 'Motivy USA, grilovací nářadí s gravírem, otvíráky', { kind: 'NATIONAL' }),
        O('US_LABOR', { nth: [9, 1, 1] }, 4, [['US', 'Labor Day – 1. pondělí v září, konec léta, výprodeje']], 'Výprodeje, zpátky do školy', { kind: 'NATIONAL' }),
        O('US_VETERANS', { fixed: '11-11' }, 4, [['US', 'Veterans Day – veteráni']], 'Dog tagy, vojenské motivy s respektem', { kind: 'NATIONAL' }),
        O('GB_BOXING_DAY', { fixed: '12-26' }, 4, [['GB', 'Boxing Day – povánoční výprodeje'], ['IE', 'St. Stephen\'s Day']], 'Povánoční slevy', { kind: 'NATIONAL' }),
        O('GB_GUY_FAWKES', { fixed: '11-05' }, 3, [['GB', 'Bonfire Night – ohně a ohňostroje']], 'Zimní sezónní motivy', { kind: 'NATIONAL' }),
        O('DE_UNITY', { fixed: '10-03' }, 3, [['DE', 'Tag der Deutschen Einheit – státní svátek']], 'Spíš ne prodejní; den volna – doručení', { kind: 'NATIONAL' }),
        O('DE_OKTOBERFEST', { onOrAfter: ['09-16', 6] }, 5, [['DE', 'Oktoberfest (Mnichov) – začíná v sobotu kolem poloviny září; termín podle pořadatele'], ['AT', 'pivní slavnosti']], 'Pivní korbele, otvíráky, dřevěné cedule', { kind: 'NATIONAL', note: 'začátek = první sobota od 16. 9. – ověřit podle pořadatele' }),
        O('AT_NATIONAL', { fixed: '10-26' }, 3, [['AT', 'Nationalfeiertag – státní svátek']], 'Rakouské motivy', { kind: 'NATIONAL' }),
        O('SK_CONSTITUTION', { fixed: '09-01' }, 3, [['SK', 'Deň Ústavy SR']], 'Slovenské motivy', { kind: 'NATIONAL' }),
        O('SK_SNP', { fixed: '08-29' }, 3, [['SK', 'Výročie SNP – státní svátek']], 'Spíš ne prodejní', { kind: 'NATIONAL' }),
        O('PL_CONSTITUTION', { fixed: '05-03' }, 3, [['PL', 'Święto Konstytucji 3 Maja']], 'Polské motivy', { kind: 'NATIONAL' }),
        O('PL_INDEPENDENCE', { fixed: '11-11' }, 3, [['PL', 'Narodowe Święto Niepodległości']], 'Polské motivy, bílá a červená', { kind: 'NATIONAL' }),
        O('HU_NATIONAL', { fixed: '03-15' }, 3, [['HU', 'Nemzeti ünnep – 1848'], ['HU', 'další: 20. 8. sv. Štěpán, 23. 10.']], 'Maďarské motivy', { kind: 'NATIONAL' }),
        O('FR_BASTILLE', { fixed: '07-14' }, 4, [['FR', 'Fête nationale – ohňostroje, přehlídka']], 'Francouzské motivy, trikolóra', { kind: 'NATIONAL' }),
        O('IT_REPUBLIC', { fixed: '06-02' }, 3, [['IT', 'Festa della Repubblica']], 'Italské motivy', { kind: 'NATIONAL' }),
        O('ES_NATIONAL', { fixed: '10-12' }, 3, [['ES', 'Fiesta Nacional de España']], 'Španělské motivy', { kind: 'NATIONAL' }),
        O('NL_KINGS_DAY', { fixed: '04-27' }, 4, [['NL', 'Koningsdag – oranžová, trhy (při neděli o den dřív – ověřit)']], 'Oranžové motivy', { kind: 'NATIONAL' }),
        O('BE_NATIONAL', { fixed: '07-21' }, 3, [['BE', 'Fête nationale / Nationale feestdag']], 'Belgické motivy', { kind: 'NATIONAL' }),
        O('SE_MIDSUMMER', { onOrAfter: ['06-19', 5] }, 4, [['SE', 'Midsommarafton – pátek mezi 19. a 25. 6., věnce, májka'], ['FI', 'Juhannus – podobný termín']], 'Letní motivy, věnce, piknik', { kind: 'NATIONAL' }),
        O('SE_LUCIA', { fixed: '12-13' }, 4, [['SE', 'Lucia – svíčky, průvody'], ['FI', 'Lucia']], 'Svícny, zimní světla', { kind: 'NATIONAL' }),
        O('EU_EUROPE_DAY', { fixed: '05-09' }, 2, [['EU', 'Den Evropy – v některých státech EU (LU svátek)']], 'Evropské motivy', { kind: 'NATIONAL' }),
        O('LUNAR_NEW_YEAR', { source: 'NEEDED' }, 6, [['CN', 'Jarní svátek – červená a zlatá, znamení roku'], ['VN', 'Tết'], ['KR', 'Seollal']], 'Znamení roku (zvíře), červená a zlatá', { dateSource: 'lunisolární kalendář – doplnit ze zdroje' }),
        O('DIWALI', { source: 'NEEDED' }, 6, [['IN', 'svátek světel – lampy (diya), sladkosti']], 'Světla, lucerny, gravírované svícny', { dateSource: 'hinduistický kalendář – doplnit ze zdroje' }),
        O('EID_AL_FITR', { source: 'NEEDED' }, 5, [['TR', 'Ramazan Bayramı'], ['ID', 'Lebaran'], ['AE', 'Eid al-Fitr']], 'Dárkové sady, kaligrafie', { dateSource: 'islámský kalendář – doplnit ze zdroje' }),
        O('HANUKKAH', { source: 'NEEDED' }, 5, [['IL', 'Chanuka – menora, 8 dní'], ['US', 'Hanukkah']], 'Menora, dárky na 8 dní', { dateSource: 'hebrejský kalendář – doplnit ze zdroje' })
    ];
    /* next date of an occasion from a given day; campaign start = date − lead weeks */
    function next(o, fromIso) { const y = +fromIso.slice(0, 4); for (const yy of [y, y + 1]) {
        let d = dateOf(o.rule, yy);
        if (d && o.rule.plus)
            d = iso(add(new Date(d + 'T00:00:00Z'), o.rule.plus));
        if (d && d >= fromIso.slice(0, 10))
            return { date: d, campaignStart: iso(add(new Date(d + 'T00:00:00Z'), -7 * o.leadWeeks)) };
    } return { date: null, campaignStart: null }; }
    try {
        globalThis.KXReminders?.registerDateRule('ADS', (key, fromIso) => { const o = OCCASIONS.find((x) => x.key === key); if (!o)
            return null; const n = next(o, fromIso); if (n.campaignStart && n.campaignStart >= fromIso.slice(0, 10))
            return n.campaignStart; const later = next(o, n.date ? `${+n.date.slice(0, 4) + 1}-01-01` : fromIso); return later.campaignStart; });
    }
    catch { }
    KXAdsOccasions = { OCCASIONS, dateOf, next, orthodoxEaster, nth };
    globalThis.KXAdsOccasions = KXAdsOccasions;
})();
