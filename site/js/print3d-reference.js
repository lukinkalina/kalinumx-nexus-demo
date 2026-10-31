// N2.3h (R70 F1): PRINT3D reference data – Czech edition DATA (encyclopedia), not UI chrome. Values are orientation
// starting points; the spool manufacturer's data and own calibration always win. X1E data verified from Bambu Lab
// technical sheets / resellers (2026-10-18). An EN edition adds a parallel data set (R63 / R64).
var KXPrint3DRef;
(function (NS) {
    NS.EDITION = 'CZ';
    NS.PRINTER_TEMPLATES = [
        { code: 'BAMBU_X1E', name: 'Bambulab X1E', manufacturer: 'Bambu Lab', model: 'X1E', kind: 'FDM', volume: '256 × 256 × 256 mm', chamber: 'ACTIVE',
            maxTemps: 'tryska 320 °C · podložka 110 °C (220 V) · komora 60 °C', nozzles: 'kalená ocel 0,4 (0,2 / 0,6 / 0,8)', plates: 'Smooth PEI (volitelně Textured PEI, High Temp, Cool)',
            multimaterial: 'AMS až 4 jednotky = 16 cívek', network: 'Ethernet + Wi-Fi, provoz jen v LAN bez cloudu', filtration: 'G3 + HEPA H12 + aktivní uhlí', powerW: '1000', lifetimeH: '5000', nozzleInstalled: 'kalená ocel 0,4', plateInstalled: 'Smooth PEI', amsUnits: '1',
            note: 'CoreXY, až 500 mm/s a 20 000 mm/s², lidar, kamera 1080p, AI detekce vad' },
        { code: 'BAMBU_X1C', name: 'Bambu Lab X1C', manufacturer: 'Bambu Lab', model: 'X1 Carbon', kind: 'FDM', volume: '256 × 256 × 256 mm', chamber: 'PASSIVE', maxTemps: 'tryska 300 °C · podložka 110 °C', nozzles: 'kalená ocel 0,4', plates: 'Textured PEI', multimaterial: 'AMS', network: 'Wi-Fi', filtration: 'aktivní uhlí', powerW: '1000', note: '' },
        { code: 'OTHER', name: '', manufacturer: '', model: '', kind: 'FDM', volume: '', chamber: 'NONE', maxTemps: '', nozzles: '', plates: '', multimaterial: '', network: '', filtration: '', powerW: '', note: '' }
    ];
    /* Bambulab X1E – functions and options: where, what, recommendation (orientation) */
    NS.PRINTER_FEATURES = { BAMBU_X1E: [
            ['Provoz jen v LAN', 'tiskárna → Nastavení → Síť', 'tisk bez Bambu cloudu, ovládání z Bambu Studia v místní síti', 'doporučeno pro soukromí a firmy'],
            ['Odpojení sítě / vyjímatelný síťový modul', 'tiskárna → Síť', 'fyzicky / softwarově vypne Wi-Fi a Ethernet', 'při tisku citlivých dat'],
            ['802.1X / WPA2-Enterprise', 'tiskárna → Síť', 'přihlášení do firemní sítě', 'podle IT firmy'],
            ['Aktivní ohřev komory (až 60 °C)', 'profil filamentu → teplota komory', 'předehřeje a drží komoru', 'ABS / ASA / PC / PA / PPA 50–60 °C; PLA / TPU vypnout a otevřít víko'],
            ['Filtrace G3 + HEPA H12 + aktivní uhlí', 'tiskárna → Údržba', 'zachytí částice a VOC', 'zapnuto u ABS / ASA / PC; výměna filtrů dle hodin (údržba)'],
            ['Lidar – kalibrace průtoku', 'před tiskem / Bambu Studio', 'změří a nastaví Pressure Advance', 'zapnout u nových filamentů'],
            ['Lidar – kontrola první vrstvy', 'před tiskem', 'zkontroluje první vrstvu', 'zapnuto u důležitých tisků'],
            ['AI detekce vad (špagety, přetečení trysky)', 'tiskárna → Nastavení', 'zastaví / upozorní při vadě', 'zapnuto, citlivost střední'],
            ['Kamera 1080p a časosběr', 'tiskárna / Bambu Studio', 'sledování a video', 'časosběr volitelně (prodlužuje tisk)'],
            ['Kompenzace vibrací a kalibrace motoru', 'kalibrace', 'potlačí rezonance (ringing)', 'po přestěhování / údržbě'],
            ['Automatické vyrovnání podložky', 'před tiskem', 'mapa podložky', 'zapnuto, po výměně podložky vždy'],
            ['AMS 1–4 jednotky (16 cívek)', 'AMS', 'RFID cívek Bambu, automatická náhradní cívka stejného materiálu', 'TPU a vlhké materiály přes externí cívku'],
            ['Detekce konce filamentu / ucpání', 'tiskárna', 'pozastaví tisk', 'zapnuto'],
            ['Obnovení po výpadku proudu', 'tiskárna → Nastavení', 'pokračuje v tisku', 'zapnuto'],
            ['Výměna trysky 0,2 / 0,4 / 0,6 / 0,8', 'hotend', 'rychlá výměna (kalená ocel)', 'v profilu změnit průměr trysky'],
            ['Podložky Smooth PEI / Textured PEI / High Temp / Cool', 'podložka', 'povrch a přilnavost', 'podle tabulky Jak tisknout']
        ] };
    NS.MAINTENANCE = { LUBE_RODS: 'Promazání a čištění tyčí', NOZZLE: 'Tryska (čištění / výměna)', PTFE: 'PTFE trubičky', DESICCANT: 'Vysoušedlo AMS', FILTERS: 'Filtry (G3 / HEPA / uhlí)', BELTS: 'Řemeny', PLATE: 'Podložka', FIRMWARE: 'Firmware', CALIBRATION: 'Kalibrace', OTHER: 'Jiné' };
    NS.NOZZLES = [
        ['Mosaz', 'PLA, PETG, ABS, ASA, TPU', 'nejlepší vedení tepla, neodolá abrazi (CF / GF / glow / dřevo)'],
        ['Nerez', 'totéž, čistší', 'méně tepla než mosaz, ne pro abrazi'],
        ['Kalená ocel (X1E)', 'vše vč. CF / GF / PPA / PPS', 'odolná abrazi, horší vedení tepla → o 5–10 °C výš'],
        ['Rubín / wolfram-karbid', 'dlouhodobě CF / GF', 'nejodolnější, drahé'],
        ['Průměr 0,2', 'detaily, miniatury, litofány', 'pomalé, citlivé na ucpání'], ['Průměr 0,4', 'univerzální', 'výchozí'],
        ['Průměr 0,6', 'rychlé funkční díly, CF materiály', 'silnější stěny, méně detailu'], ['Průměr 0,8', 'velké rychlé díly, vázy', 'hrubý povrch']
    ];
    /* materials usable with the X1E (manufacturer: PLA / PETG / TPU / PVA / BVOH optimal; ABS / ASA / PC / PA / PET superior;
       CF / GF of PLA, PETG, PA, PET, PC, ABS, ASA superior; PPA-CF / GF, PPS, PPS-CF / GF ideal) */
    NS.MATERIAL_COLUMNS = ['Materiál', 'Tryska °C', 'Podložka °C', 'Komora X1E', 'Sušení', 'Vlastnosti', 'Teplota použití ~', 'Venku / UV', 'Abraze', 'AMS', 'Použití'];
    NS.MATERIALS = [
        { code: 'PLA', row: ['PLA / PLA+ / Matte / Silk', '190–230', '55–65', 'otevřít dvířka / víko', '50 °C 8 h', 'tuhé, snadné', '~55 °C', 'ne', 'ne', '✓', 'modely, prototypy'], outdoor: false, abrasive: false, ams: true, shore: '80–85D' },
        { code: 'PLA-CF', row: ['PLA-CF', '210–240', '55–65', 'otevřít', '55 °C 8 h', 'tuhé, matné', '~60 °C', 'ne', 'ano', '✓ (kalená)', 'přípravky'], outdoor: false, abrasive: true, ams: true, shore: '~85D' },
        { code: 'PETG', row: ['PETG / PETG-HF', '230–260', '70–80', 'volné', '65 °C 8 h', 'houževnaté', '~70 °C', 'ano', 'ne', '✓', 'funkční díly, venku'], outdoor: true, abrasive: false, ams: true, shore: '~75D' },
        { code: 'PETG-CF', row: ['PETG-CF', '240–270', '70–80', 'volné', '65 °C 8 h', 'tuhé', '~75 °C', 'ano', 'ano', '✓', 'konstrukční díly'], outdoor: true, abrasive: true, ams: true, shore: '~80D' },
        { code: 'PET-CF', row: ['PET-CF', '260–290', '80–100', '40–60 °C', '80 °C 10 h', 'tuhé, rozměrově stálé', '~100–180 °C', 'ano', 'ano', '✓ suché', 'přesné díly'], outdoor: true, abrasive: true, ams: true, shore: '~85D' },
        { code: 'ABS', row: ['ABS / ABS-GF', '240–270', '90–110', '50–60 °C', '80 °C 8 h', 'houževnaté', '~95 °C', 'omezeně', 'GF ano', '✓', 'technické díly'], outdoor: false, abrasive: false, ams: true, shore: '~80D' },
        { code: 'ASA', row: ['ASA / ASA-CF', '240–270', '90–110', '50–60 °C', '80 °C 8 h', 'houževnaté, UV', '~95 °C', 'ano – nejlepší', 'CF ano', '✓', 'venkovní díly'], outdoor: true, abrasive: false, ams: true, shore: '~80D' },
        { code: 'PC', row: ['PC / PC-CF / PC-ABS', '260–300', '100–110', '60 °C', '80–90 °C 8 h', 'velmi pevné', '~115 °C', 'ano', 'CF ano', '✓', 'odolné díly'], outdoor: true, abrasive: false, ams: true, shore: '~85D' },
        { code: 'PA', row: ['PA6 / PA12 (nylon)', '260–290', '90–110', '60 °C', '80–90 °C 12 h', 'houževnaté, kluzné', '~80–150 °C', 'ano', 'ne', 'jen suché', 'ozubení, panty'], outdoor: true, abrasive: false, ams: true, shore: '~75D' },
        { code: 'PA-CF', row: ['PA-CF / PAHT-CF / PA-GF', '270–300', '90–110', '60 °C', '80–90 °C 12 h', 'velmi tuhé', '~150–190 °C', 'ano', 'ano', 'opatrně', 'motorový prostor'], outdoor: true, abrasive: true, ams: true, shore: '~80D' },
        { code: 'PPA', row: ['PPA-CF / PPA-GF', '290–320', '100–110', '60 °C', '90–100 °C 12 h', 'vysokoteplotní, tuhé', '~200+ °C', 'ano', 'ano', 'opatrně', 'inženýrské díly'], outdoor: true, abrasive: true, ams: true, shore: '~85D' },
        { code: 'PPS', row: ['PPS / PPS-CF / PPS-GF', '300–320', '100–110', '60 °C', '90–100 °C', 'chemicky a teplotně odolné', '~200+ °C', 'ano', 'CF / GF ano', 'opatrně', 'chemie, elektro'], outdoor: true, abrasive: true, ams: true, shore: '~85D' },
        { code: 'TPU95A', row: ['TPU 95A / 90A', '210–240', '35–45', 'otevřít', '55 °C 8 h', 'pružné', '~60 °C', 'ano', 'ne', 'ne (externí cívka)', 'těsnění, pouzdra'], outdoor: true, abrasive: false, ams: false, shore: '90–95A' },
        { code: 'TPU68D', row: ['TPU 68D (pro AMS)', '220–240', '35–45', 'otevřít', '55 °C', 'tvrdší pružné', '~60 °C', 'ano', 'ne', '✓', 'odolné kryty'], outdoor: true, abrasive: false, ams: true, shore: '64–68D' },
        { code: 'PVA', row: ['PVA / BVOH', '190–220', '45–60', '—', '50 °C, suché', 'rozpustné ve vodě', '—', 'ne', 'ne', '✓ suché', 'podpory'], outdoor: false, abrasive: false, ams: true, shore: '—' },
        { code: 'SUPPORT', row: ['Support for PLA / PETG / ABS / PA', 'dle typu', 'dle typu', 'dle typu', 'dle typu', 'odlupovací podpory', '—', '—', '—', '✓', 'čisté plochy'], outdoor: false, abrasive: false, ams: true, shore: '—' },
        { code: 'HIPS', row: ['HIPS', '230–250', '90–100', '50 °C', '70 °C', 'lehké', '~90 °C', 'ne', 'ne', '✓', 'podpory pro ABS'], outdoor: false, abrasive: false, ams: true, shore: '~75D' },
        { code: 'PP', row: ['PP / PP-CF / PP-GF', '220–250', '85–100 (speciální podložka)', '40–60 °C', '60 °C', 'pružné, chemie', '~90 °C', 'střední', 'CF / GF ano', '✓', 'nádoby, panty'], outdoor: true, abrasive: false, ams: true, shore: '~70D' },
        { code: 'DECOR', row: ['Wood / Marble / Glow PLA', '200–220', '55–60', 'otevřít', '50 °C', 'dekorativní', '~55 °C', 'ne', 'ano', '✓ (0,6 doporučeno)', 'dekorace'], outdoor: false, abrasive: true, ams: true, shore: '~80D' }
    ];
    NS.NOT_SUPPORTED = 'PEEK, PEI (ULTEM), PEKK, PSU – vyžadují 350–420 °C trysku a komoru 90–150 °C.';
    NS.MEDICAL = 'Filament s certifikátem materiálu (ISO 10993 / USP Class VI) ≠ certifikovaný výrobek: výsledek ovlivní tiskárna, tryska (kontaminace), tisk, úprava a sterilizace. NEXUS je jen eviduje s upozorněním.';
    NS.FOOD = 'Běžný FDM výtisk není bezpečný pro opakovaný styk s potravinami (spáry vrstev).';
    NS.SHORE = [['00-30', 'gelová vložka', '—'], ['20A–30A', 'gumový medvídek, gumička', 'speciální TPE'], ['40A–50A', 'guma na gumování', 'velmi měkké TPE'], ['60A–70A', 'podrážka, pneumatika', 'TPU / TPE 60–70A'],
        ['80A–85A', 'podpatek, těsnění', 'TPU 85A'], ['90A–95A', 'kolečko vozíku, pouzdro telefonu', 'TPU 95A'], ['98A ≈ 50D', 'tvrdé kolečko', 'TPU 98A'], ['64D–68D', 'tvrdé gumové kryty', 'TPU 64D / 68D'],
        ['75D', 'přilba, tvrdé plasty', 'PP, PETG'], ['80D–85D', 'kostky LEGO', 'PLA, ABS, ASA, PC']];
    NS.GLOSSARY = [['FDM / FFF', 'tisk z taveného vlákna'], ['SLA / MSLA', 'tisk z pryskyřice vytvrzované světlem (laser / maska LCD)'], ['AMS', 'zásobník 4 cívek Bambu Lab'], ['PEI', 'polyetherimid – povrch podložky'],
        ['PLA', 'kyselina polymléčná'], ['PETG / PET', 'polyetylentereftalát (glykol)'], ['ABS', 'akrylonitril-butadien-styren'], ['ASA', 'akrylonitril-styren-akrylát (UV odolný)'], ['PC', 'polykarbonát'],
        ['PA6 / PA12', 'polyamid (nylon)'], ['PPA', 'polyftalamid'], ['PPS', 'polyfenylensulfid'], ['TPU / TPE', 'termoplastický polyuretan / elastomer (pružné)'], ['PVA / BVOH', 've vodě rozpustné podpory'],
        ['HIPS', 'houževnatý polystyren'], ['PP', 'polypropylen'], ['POM', 'polyoxymetylen'], ['PEEK / PEI / PEKK', 'vysokoteplotní plasty (mimo X1E)'], ['CF / GF', 'plněno uhlíkovými / skelnými vlákny (abrazivní)'],
        ['HF / HT / HS', 'High Flow / High Temp / High Speed'], ['Tg', 'teplota skelného přechodu'], ['HDT', 'teplota průhybu pod zatížením'], ['Shore A / D', 'stupnice tvrdosti (A měkké, D tvrdé)'],
        ['MVS', 'maximální objemová rychlost (mm³/s)'], ['PA / K-faktor', 'Pressure Advance – předtlak'], ['Flow ratio', 'násobek průtoku'], ['Z-hop', 'zdvih trysky při přejezdu'], ['VFA', 'vertikální artefakty na stěnách'],
        ['CoreXY', 'kinematika se dvěma motory pro X / Y'], ['G-code / 3MF / STL / STEP / OBJ', 'příkazy tiskárny / projekt sliceru / síť / CAD / síť s barvami'], ['HEPA / VOC', 'filtr částic / těkavé organické látky'],
        ['CMYK / RGB', 'tiskové / světelné barvy'], ['TD', 'propustnost filamentu pro světlo (malování filamentem)'], ['ISO 10993 / USP Class VI', 'normy biokompatibility materiálu']];
    NS.SETTINGS = [['Výška vrstvy', 'Kvalita', 'tloušťka vrstvy', 'menší = hladší a pomalejší (0,08–0,12 detail, 0,2 standard, 0,28 rychlé); max ~75 % trysky'],
        ['Výška první vrstvy', 'Kvalita', 'první vrstva', 'vyšší (0,2–0,3) lépe drží a vyrovná nerovnost'], ['Šířka čáry', 'Kvalita', 'šířka extruze', '~100–120 % trysky; širší = pevnější'],
        ['Počet stěn', 'Pevnost', 'perimetry', 'hlavní pevnost dílu: 2 běžně, 3–5 funkční'], ['Horní / spodní vrstvy', 'Pevnost', 'uzavření', 'málo = díry nahoře; 4–6 / 3–5'],
        ['Hustota a vzor výplně', 'Pevnost', 'vnitřek', '10–20 % modely, 30–50 % funkční; gyroid všesměrově'], ['Generátor stěn', 'Kvalita', 'Arachne / klasický', 'Arachne lépe tenké stěny a text'],
        ['Poloha švu', 'Kvalita', 'začátek vrstvy', 'zadní / zarovnaný schová šev'], ['Rychlosti', 'Rychlost', 'mm/s podle části', 'vnější stěna pomaleji = hezčí povrch; první vrstva pomalu'],
        ['Zrychlení / jerk', 'Rychlost', 'dynamika', 'nižší = méně VFA a ringingu'], ['MVS', 'Filament', 'strop průtoku', 'překročení = podextruze; PLA ~21, PETG ~12–16, TPU ~3–5 mm³/s'],
        ['Teplota trysky / podložky', 'Filament', 'teploty', 'vyšší = lepší spojení vrstev, víc vláken'], ['Teplota komory (X1E)', 'Filament', 'ohřev komory', 'ABS / ASA / PC / PA 50–60 °C; ne pro PLA / TPU'],
        ['Chlazení', 'Filament', 'ofuk dílu', 'PLA hodně, PETG středně, ABS / ASA / PC / PA málo'], ['Převisy / mosty', 'Kvalita', 'převisy', 'pomaleji a víc chlazení'],
        ['Podpory', 'Podpory', 'normální / strom, úhel, Z mezera', 'strom šetří materiál; Z mezera 0,1–0,2 snadné odlomení'], ['Brim / raft', 'Ostatní', 'lem', 'proti kroucení'],
        ['Retrakce, Z-hop', 'Filament / Ostatní', 'stažení vlákna', 'proti vláknům; TPU minimum'], ['Pressure Advance (K)', 'Kalibrace', 'předtlak', 'ostré rohy – kalibrovat'],
        ['Flow ratio', 'Kalibrace', 'průtok', 'přeextruze / podextruze – kalibrovat'], ['Žehlení', 'Kvalita', 'vyhlazení vršku', 'hladké vršky, delší tisk'],
        ['Kompenzace sloní nohy / XY', 'Kvalita', 'rozměrové korekce', 'přesné otvory a zámky'], ['Proplach / prime tower', 'Multimateriál', 'čištění při změně barvy', 'proplach do výplně / objektu šetří materiál']];
    NS.HOWTO = [['PLA', 'Smooth / Textured PEI, Cool', 'ne / tyčinka na Cool', 'dvířka otevřít', '100 %', 'v zavřené komoře hrozí ucpání (heat creep)'],
        ['PETG', 'Textured PEI', 'tyčinka na Smooth', 'zavřeno bez ohřevu', '30–50 %', 'lepí se k PEI až příliš; pomaleji = méně vláken'],
        ['ABS / ASA', 'Smooth / Textured PEI, High Temp', 'tyčinka', 'komora 50–60 °C', '0–30 %', 'brim, filtr zapnutý'], ['PC', 'High Temp / Engineering', 'tyčinka', 'komora 60 °C', '0–20 %', 'sušit, brim, pomaleji'],
        ['PA / PA-CF / PPA', 'Engineering / High Temp', 'tyčinka', 'komora 60 °C', '0–20 %', 'vždy sušit, tisknout ze sušičky'], ['TPU 95A', 'Textured PEI', 'ne', 'otevřít', '50–100 %', 'externí cívka, MVS ~3–5, minimální retrakce'],
        ['CF / GF', 'dle základu', 'dle základu', 'dle základu', 'dle základu', 'kalená tryska, raději 0,6; sledovat opotřebení']];
    NS.GUIDES = [
        { code: 'LITHO', title: 'Litofán (jednobarevný)', body: ['Model: obrázek → generátor litofánu (např. ItsLitho, 3dp.rocks) – tloušťka 0,8 mm (nejsvětlejší) až 2,8–3,2 mm (nejtmavší), rámeček.', 'Materiál: bílý / přírodní matný PLA, stálá šarže.', 'Nastavení: vrstva 0,08–0,12, 100 % výplň, tryska 0,4 (0,2 detail), pomalá vnější stěna, bez žehlení.', 'Orientace: na výšku = lepší detail; naležato rychlejší a stabilnější.', 'Světlo: neutrální bílé LED 4000 K zezadu, difuzor.'] },
        { code: 'LITHO_CMYK', title: 'Barevný litofán CMYK', body: ['Generátor barevného litofánu (např. ItsLitho Color) rozloží obrázek na tenké vrstvy Cyan, Magenta, Yellow a bílou vrstvu jasu; export 3MF s přiřazením filamentů → AMS se 4 sloty (C / M / Y / W).', 'Filamenty: syté průsvitné C / M / Y PLA + bílý PLA, stejný výrobce.', 'Tisk naležato, vrstva 0,08–0,1, 100 % výplň, proplach do výplně / objektu.', 'Kalibrace: zkušební barevná tabulka (vzorník) → upravit sytost v generátoru.', 'Světlo bílé 5000–6500 K zezadu.'] },
        { code: 'HUEFORGE', title: 'Malování filamentem (HueForge)', body: ['Obraz skládaný z vrstev podle hodnoty TD (propustnost) každého filamentu; 4–8 barev, výměny podle výšky vrstvy (AMS nebo ruční pauzy).', 'Funguje prosvícený i neprosvícený; TD změřit nebo převzít z databáze.'] },
        { code: 'TIPS', title: 'Vychytávky a kalibrace', body: ['Kalibrace: flow, Pressure Advance, MVS, teplotní věž, retrakce.', 'První vrstva: čistá podložka (myčka / izopropylalkohol), PEI nemastit.', 'Sušení a skladování: vlhkost < 20 %, sušička jako zásobník.', 'AMS: TPU ne, CF opatrně, kartonové cívky → adaptéry.', 'Šetření materiálu: proplach do výplně / objektu.', 'Tolerance spojů 0,15–0,3 mm; závitové vložky pájkou; tisk v kuse.', 'Pevnost podle orientace vrstev; kroucení: brim, komora, myšky.', 'Vlákna: teplota, retrakce, sušení; sloní noha: kompenzace.', 'Úprava povrchu: broušení, plnič, acetonové páry jen ABS / ASA; žíhání PLA / PA opatrně (smrštění).', 'Bezpečnost: VOC, filtr, větrání, kouřový hlásič.'] }
    ];
    NS.SPARE_PARTS = { PRINT3D: ['Kompletní hotend', 'Trysky kalená ocel 0,2 / 0,4 / 0,6 / 0,8', 'Ozubená kola extruderu', 'Řezák filamentu', 'PTFE trubičky', 'Silikonová ponožka', 'Stěrka / skluz proplachu', 'Podložky (Smooth PEI, Textured PEI, High Temp, Cool)', 'Karbonové tyče a ložiska', 'Řemeny', 'Ventilátory (ofuk, hotend, pomocný, komora, deska)', 'Filtry (G3, HEPA H12, aktivní uhlí)', 'Ohřev komory', 'Termistor / topné tělísko', 'Díly AMS (podavač, PTFE, vysoušedlo, hub)', 'Ochranné sklo lidaru / kamery'],
        LASER: ['Čočka', 'Ochranné okénko', 'Zrcadla', 'Tryska / kužel air assistu', 'Laserový modul', 'Řemeny', 'Včelí plástev / nožová podložka', 'Odsávání a filtry', 'Čidlo plamene'] };
})(KXPrint3DRef || (KXPrint3DRef = {}));
