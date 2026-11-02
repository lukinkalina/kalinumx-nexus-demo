var KXContracts, KXHealth, KXCertify, KXWarranty, KXSubscriptions, KXGarden, KXAssets, KXMaintenance, KXService, KXProjects, KXHr, KXEnergy, KXRental, KXDocuments, KXFood, KXSales, KXBuild, KXStock, KXInventory, KXForms, KXGuide, KXShipping;
(function () {
    function make(o) {
        const S = o.subjectWord, I = o.itemWord;
        return KXHubKit.createScheduleDomain({
            contract: `KX.${o.key}_DOMAIN/1`, owner: `APP.KX.${o.key}`, type: `${o.key}.${o.typeSuffix}`, schema: `KX.${o.key}.${o.typeSuffix}/1`, permission: `${o.key}.${o.typeSuffix}.EDIT`,
            label: o.label, scopeTag: o.scopeTag, serviceKey: o.serviceKey, listKey: o.listKey, subjectIdKey: `${o.scopeTag}Id`, subjectNameKey: `${o.scopeTag}Name`,
            itemsKey: 'deadlines', itemPayloadKey: 'deadline', itemIdKey: 'deadlineId', itemIdPrefix: `${o.key}.DL.`, maxItems: 40, soonDays: 30, countLabel: o.countWord, revisionPrefix: `${o.key}.DOMAIN/1:`,
            subjectFields: o.fields, itemKinds: o.kinds,
            history: { added: 'DEADLINE_ADDED', done: 'DEADLINE_DONE', removed: 'DEADLINE_REMOVED' },
            actions: { create: `ACTION.${o.key}.${o.typeSuffix}.CREATE`, update: `ACTION.${o.key}.${o.typeSuffix}.UPDATE`, addItem: `ACTION.${o.key}.DEADLINE.ADD`, completeItem: `ACTION.${o.key}.DEADLINE.COMPLETE`, removeItem: `ACTION.${o.key}.DEADLINE.REMOVE`, archive: `ACTION.${o.key}.${o.typeSuffix}.ARCHIVE` },
            projection: { code: `PERSONAL.${o.key}.N2`, countField: 'alertsCount', nextField: 'nextDueAt' },
            msg: { invalidSubject: `Neplatná data: ${S}`, unknownSubjectFields: `Neznámá pole: ${S}`, invalidItem: 'Neplatný termín', unknownItemFields: 'Neznámá pole termínu', invalidItemKind: 'Neplatný typ termínu',
                itemDate: 'Termín musí být RRRR-MM-DD', itemInterval: 'Interval: 1–3650 dní', itemNeedsDue: 'Zadejte termín nebo interval', needSpace: `${o.subjectCap} musí patřit alespoň do jednoho prostoru`,
                separateActions: 'Prostory a termíny upravujte samostatnými akcemi', tooMany: (n) => `Nejvýše ${n} termínů`, itemMissing: 'Termín neexistuje', badDoneDate: 'Neplatné datum provedení',
                nextAfterDone: 'Příští termín musí být po datu provedení', missingId: `Chybí ID: ${S}`, notFound: (id) => `${o.subjectCap} ${id} neexistuje`, needRev: 'Úprava vyžaduje expectedRevision', archived: 'Archivovaný záznam nelze upravovat' },
            ui: { prefix: o.prefix, itemWord: 'dl', subjectForm: `${o.prefix}f`, itemForm: `${o.prefix}d`, countWord: o.countWord, addLabel: `＋ ${o.subjectCap}`, saveLabel: 'Uložit', openItemLabel: '＋ Termín', addItemLabel: 'Přidat termín', itemPlaceholder: o.placeholder,
                noItems: 'Žádné termíny', empty: o.empty, notInstalled: `Doménová služba ${o.label} není nainstalovaná.`, subtitle: o.subtitle,
                historyText: { CREATED: 'Založeno', UPDATED: 'Upraveno', DEADLINE_ADDED: 'Přidán termín', DEADLINE_DONE: 'Termín splněn', DEADLINE_REMOVED: 'Termín odebrán', ARCHIVED: 'Archivováno' },
                savedToast: 'Uloženo', itemAddedToast: 'Termín přidán', itemDoneToast: 'Termín zapsán', itemRemovedToast: 'Termín odebrán', archivedToast: 'Archivováno',
                confirmRemove: 'Odebrat termín? Záznam zůstane v historii revizí.', confirmArchive: 'Archivovat? Data i historie zůstanou v revizích Core.' }
        });
    }
    const T = (label, max = 80, extra = {}) => ({ kind: 'text', max, label, ...extra });
    const E = (label, options, required = false) => ({ kind: 'enum', options, required, label, invalidMsg: `Neplatná hodnota: ${label}`, requiredMsg: `${label} je povinné` });
    const D = (label) => ({ kind: 'date', label, invalidMsg: `${label} musí být RRRR-MM-DD` });
    const name = (label, msg) => ({ kind: 'text', max: 80, required: true, label, requiredMsg: msg });
    const CONTRACT_KINDS = { LEASE: 'Nájem', ENERGY: 'Energie', TELCO: 'Telefon a internet', INSURANCE: 'Pojištění', LOAN: 'Úvěr', EMPLOYMENT: 'Pracovní', SERVICE: 'Služby', OTHER: 'Jiné' };
    KXContracts = make({ key: 'CONTRACTS', typeSuffix: 'CONTRACT', label: 'Smlouvy a závazky', scopeTag: 'contract', serviceKey: 'contractsDomain', listKey: 'contracts', prefix: 'ctr',
        subjectWord: 'smlouva', subjectCap: 'Smlouva', countWord: 'smluv', placeholder: 'např. Výpovědní lhůta', empty: 'Zatím žádné smlouvy. Termíny výpovědí a prodloužení přidáte k jednotlivým smlouvám.',
        fields: { name: name('Název', 'Název smlouvy je povinný'), kind: E('Typ', CONTRACT_KINDS, true), counterparty: T('Protistrana', 120), validFrom: D('Platnost od'), validTo: D('Platnost do'), note: T('Poznámka', 500) },
        kinds: { NOTICE_DEADLINE: 'Poslední den výpovědi', RENEWAL: 'Prodloužení / obnova', END: 'Konec smlouvy', PAYMENT: 'Platba', PRICE_CHANGE: 'Změna ceny', OTHER: 'Jiné' },
        subtitle: (d, f) => `${CONTRACT_KINDS[d.kind] || d.kind}${d.counterparty ? ` · ${d.counterparty}` : ''}${d.validTo ? ` · do ${f(d.validTo)}` : ''}` });
    const HEALTH_KINDS = { CHECKUP: 'Preventivní prohlídka', DENTIST: 'Zubař', SPECIALIST: 'Odborný lékař', VACCINATION: 'Očkování', PRESCRIPTION: 'Recept / léky', LAB: 'Odběry', THERAPY: 'Terapie / rehabilitace', OTHER: 'Jiné' };
    KXHealth = make({ key: 'HEALTH', typeSuffix: 'PERSON', label: 'Zdraví a péče', scopeTag: 'person', serviceKey: 'healthDomain', listKey: 'persons', prefix: 'hl',
        subjectWord: 'osoba', subjectCap: 'Osoba', countWord: 'osob', placeholder: 'např. Prohlídka u praktika', empty: 'Zatím žádné osoby. Zdravotní termíny jsou citlivé: v upozorněních se bez souhlasu nezobrazují jména ani detaily.',
        fields: { name: name('Osoba', 'Jméno osoby je povinné'), doctor: T('Lékař / zařízení (volitelně)', 120), note: T('Poznámka', 500) }, kinds: HEALTH_KINDS,
        subtitle: (d) => `${d.doctor ? d.doctor : 'bez uvedeného lékaře'}` });
    const CERT_KINDS = { DEVICE_REVISION: 'Revize zařízení', CERTIFICATE: 'Certifikát', PERMIT: 'Oprávnění / licence', TRAINING: 'Školení', ID_DOCUMENT: 'Doklad totožnosti', DRIVING: 'Řidičský průkaz / profesní průkaz', OTHER: 'Jiné' };
    KXCertify = make({ key: 'CERTIFY', typeSuffix: 'ITEM', label: 'Certifikáty a platnosti', scopeTag: 'cert', serviceKey: 'certifyDomain', listKey: 'items', prefix: 'crt',
        subjectWord: 'položka', subjectCap: 'Položka', countWord: 'položek', placeholder: 'např. Revize elektro', empty: 'Zatím nic. Evidujte revize, certifikáty, školení a doklady s datem platnosti.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Typ', CERT_KINDS, true), issuer: T('Vydal / revizní technik', 120), reference: T('Číslo dokladu', 60), note: T('Poznámka', 500) },
        kinds: { REVISION: 'Revize', EXPIRY: 'Konec platnosti', RENEWAL: 'Obnova', TRAINING_REFRESH: 'Opakované školení', OTHER: 'Jiné' },
        subtitle: (d) => `${CERT_KINDS[d.kind] || d.kind}${d.issuer ? ` · ${d.issuer}` : ''}` });
    KXWarranty = make({ key: 'WARRANTY', typeSuffix: 'PRODUCT', label: 'Záruční listy a reklamace', scopeTag: 'product', serviceKey: 'warrantyDomain', listKey: 'products', prefix: 'wty',
        subjectWord: 'výrobek', subjectCap: 'Výrobek', countWord: 'výrobků', placeholder: 'např. Konec záruky', empty: 'Zatím žádné výrobky. Konec záruky zadáte z účtenky – nic se nedopočítává.',
        fields: { name: name('Výrobek', 'Název výrobku je povinný'), seller: T('Prodejce', 120), purchaseDate: D('Datum nákupu'), serial: T('Výrobní číslo', 60), note: T('Poznámka', 500) },
        kinds: { WARRANTY_END: 'Konec záruky', EXTENDED_END: 'Konec prodloužené záruky', CLAIM_DEADLINE: 'Lhůta reklamace', SERVICE_CHECK: 'Servisní prohlídka', OTHER: 'Jiné' },
        subtitle: (d, f) => `${d.seller || 'bez prodejce'}${d.purchaseDate ? ` · koupeno ${f(d.purchaseDate)}` : ''}` });
    const SUB_KINDS = { STREAMING: 'Streaming', SOFTWARE: 'Software', LICENSE: 'Licence', MEMBERSHIP: 'Členství', INSURANCE: 'Pojištění', NEWS: 'Zprávy a časopisy', OTHER: 'Jiné' };
    KXSubscriptions = make({ key: 'SUBSCRIPTIONS', typeSuffix: 'SUBSCRIPTION', label: 'Předplatná a licence', scopeTag: 'sub', serviceKey: 'subscriptionsDomain', listKey: 'subscriptions', prefix: 'sub',
        subjectWord: 'předplatné', subjectCap: 'Předplatné', countWord: 'předplatných', placeholder: 'např. Obnova ročního plánu', empty: 'Zatím žádná předplatná. Částky se neevidují; jde o termíny obnovy, zkušebních období a výpovědí.',
        fields: { name: name('Služba', 'Název služby je povinný'), kind: E('Typ', SUB_KINDS, true), provider: T('Poskytovatel', 120), note: T('Poznámka', 500) },
        kinds: { RENEWAL: 'Obnova', TRIAL_END: 'Konec zkušební doby', CANCEL_DEADLINE: 'Poslední den zrušení', PRICE_CHANGE: 'Změna ceny', OTHER: 'Jiné' },
        subtitle: (d) => `${SUB_KINDS[d.kind] || d.kind}${d.provider ? ` · ${d.provider}` : ''}` });
    const GARDEN_KINDS = { BED: 'Záhon', TREE: 'Strom / keř', LAWN: 'Trávník', HOUSEPLANT: 'Pokojová rostlina', GREENHOUSE: 'Skleník', OTHER: 'Jiné' };
    KXGarden = make({ key: 'GARDEN', typeSuffix: 'PLANT', label: 'Zahrada a rostliny', scopeTag: 'plant', serviceKey: 'gardenDomain', listKey: 'plants', prefix: 'gdn',
        subjectWord: 'rostlina', subjectCap: 'Rostlina', countWord: 'rostlin', placeholder: 'např. Hnojení', empty: 'Zatím žádné rostliny. Intervaly zalévání a hnojení zadáváte sami.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Typ', GARDEN_KINDS, true), place: T('Umístění', 80), note: T('Poznámka', 500) },
        kinds: { WATERING: 'Zalévání', FERTILIZING: 'Hnojení', PRUNING: 'Řez', SPRAYING: 'Postřik', HARVEST: 'Sklizeň', REPOTTING: 'Přesazení', OTHER: 'Jiné' },
        subtitle: (d) => `${GARDEN_KINDS[d.kind] || d.kind}${d.place ? ` · ${d.place}` : ''}` });
    /* N2.6b · first batch of hubs that had no screen of their own (user: build the missing hubs) – same engine, same invariants */
    const ASSET_KINDS = { ELECTRONICS: 'Elektronika', FURNITURE: 'Nábytek', TOOLS: 'Nástroje a stroje', VALUABLES: 'Cennosti', SPORT: 'Sport a hobby', OTHER: 'Jiné' };
    KXAssets = make({ key: 'ASSETS', typeSuffix: 'ITEM', label: 'Správa majetku', scopeTag: 'asset', serviceKey: 'assetsDomain', listKey: 'assets', prefix: 'ast', subjectWord: 'věc', subjectCap: 'Věc', countWord: 'věcí', placeholder: 'např. Pojištění domácnosti', empty: 'Zatím žádný majetek. Přidejte věc a k ní termíny pojištění, servisu nebo konce záruky.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', ASSET_KINDS, true), place: T('Umístění', 80), bought: D('Datum pořízení'), value: T('Hodnota (Kč)', 20), serial: T('Výrobní číslo', 60), note: T('Poznámka', 500) },
        kinds: { INSURANCE: 'Pojištění', SERVICE: 'Servis', WARRANTY_END: 'Konec záruky', DEPRECIATION: 'Odpis / přecenění', INVENTORY: 'Inventura', OTHER: 'Jiné' },
        subtitle: (d) => `${ASSET_KINDS[d.kind] || d.kind}${d.place ? ` · ${d.place}` : ''}${d.value ? ` · ${d.value} Kč` : ''}` });
    const MACHINE_KINDS = { LASER: 'Laser', PRINTER3D: '3D tiskárna', CNC: 'CNC', COMPRESSOR: 'Kompresor', EXHAUST: 'Odsávání', ELECTRONICS: 'Elektronika', OTHER: 'Jiné' };
    KXMaintenance = make({ key: 'MAINTENANCE', typeSuffix: 'MACHINE', label: 'Servis a údržba', scopeTag: 'machine', serviceKey: 'maintenanceDomain', listKey: 'machines', prefix: 'mnt', subjectWord: 'zařízení', subjectCap: 'Zařízení', countWord: 'zařízení', placeholder: 'např. Čištění optiky', empty: 'Zatím žádná zařízení. Přidejte stroj a k němu pravidelnou údržbu – čištění, kalibraci, výměnu filtrů.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', MACHINE_KINDS, true), model: T('Model', 80), serial: T('Výrobní číslo', 60), place: T('Umístění', 80), note: T('Poznámka', 500) },
        kinds: { CLEANING: 'Čištění', LUBRICATION: 'Mazání', CALIBRATION: 'Kalibrace', PART_REPLACEMENT: 'Výměna dílu', FILTER: 'Výměna filtru', INSPECTION: 'Kontrola', OTHER: 'Jiné' },
        subtitle: (d) => `${MACHINE_KINDS[d.kind] || d.kind}${d.model ? ` · ${d.model}` : ''}${d.place ? ` · ${d.place}` : ''}` });
    const REPAIR_KINDS = { OWN: 'Vlastní', CUSTOMER: 'Zákaznická' }, REPAIR_STATES = { RECEIVED: 'Přijato', DIAGNOSIS: 'Diagnostika', WAITING_PART: 'Čeká na díl', IN_REPAIR: 'Opravuje se', DONE: 'Hotovo', HANDED: 'Předáno' };
    KXService = make({ key: 'SERVICE', typeSuffix: 'REPAIR', label: 'Servis a opravy', scopeTag: 'repair', serviceKey: 'serviceDomain', listKey: 'repairs', prefix: 'srv', subjectWord: 'oprava', subjectCap: 'Oprava', countWord: 'oprav', placeholder: 'např. Předání zákazníkovi', empty: 'Zatím žádné opravy. Přidejte zakázku opravy a k ní termíny – diagnostika, objednání dílu, předání.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', REPAIR_KINDS, true), state: E('Stav', REPAIR_STATES), customer: T('Zákazník', 120), device: T('Zařízení', 120), note: T('Poznámka', 500) },
        kinds: { INTAKE: 'Příjem', DIAGNOSIS: 'Diagnostika', PART_ORDER: 'Objednat díl', HANDOVER: 'Předání', REPAIR_WARRANTY: 'Záruka opravy', OTHER: 'Jiné' },
        subtitle: (d) => `${REPAIR_STATES[d.state] || ''}${d.customer ? ` · ${d.customer}` : ''}${d.device ? ` · ${d.device}` : ''}` });
    const PROJECT_KINDS = { ORDER: 'Zakázka', INTERNAL: 'Interní', FAMILY: 'Rodinný', BUILD: 'Stavba', OTHER: 'Jiné' }, PROJECT_STATES = { PLAN: 'Plán', RUNNING: 'Běží', PAUSED: 'Pozastaveno', DONE: 'Hotovo' };
    KXProjects = make({ key: 'PROJECTS', typeSuffix: 'PROJECT', label: 'Správa projektů', scopeTag: 'project', serviceKey: 'projectsDomain', listKey: 'projects', prefix: 'prj', subjectWord: 'projekt', subjectCap: 'Projekt', countWord: 'projektů', placeholder: 'např. Odevzdání návrhu', empty: 'Zatím žádné projekty. Přidejte projekt a k němu milníky, termíny odevzdání a schůzky.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', PROJECT_KINDS, true), state: E('Stav', PROJECT_STATES), client: T('Klient', 120), start: D('Začátek'), end: D('Konec'), note: T('Poznámka', 500) },
        kinds: { MILESTONE: 'Milník', DEADLINE: 'Odevzdání', MEETING: 'Schůzka', REVIEW: 'Kontrola', INVOICE: 'Fakturace', OTHER: 'Jiné' },
        subtitle: (d, f) => `${PROJECT_STATES[d.state] || ''}${d.client ? ` · ${d.client}` : ''}${d.end ? ` · do ${f(d.end)}` : ''}` });
    const HR_ROLES = { EMPLOYEE: 'Zaměstnanec', PART_TIME: 'Brigádník', CONTRACTOR: 'Externista', SELF: 'OSVČ' };
    KXHr = make({ key: 'HR', typeSuffix: 'PERSON', label: 'Lidé a práce', scopeTag: 'worker', serviceKey: 'hrDomain', listKey: 'workers', prefix: 'hr', subjectWord: 'osoba', subjectCap: 'Osoba', countWord: 'osob', placeholder: 'např. Školení BOZP', empty: 'Zatím žádní lidé. Přidejte osobu a k ní školení, lékařské prohlídky a konec smlouvy.',
        fields: { name: name('Jméno', 'Jméno je povinné'), role: E('Vztah', HR_ROLES, true), position: T('Pozice', 80), started: D('Nástup'), note: T('Poznámka', 500) },
        kinds: { SAFETY_TRAINING: 'Školení BOZP', MEDICAL: 'Lékařská prohlídka', CONTRACT_END: 'Konec smlouvy', REVIEW: 'Hodnocení', VACATION: 'Dovolená', OTHER: 'Jiné' },
        subtitle: (d) => `${HR_ROLES[d.role] || d.role}${d.position ? ` · ${d.position}` : ''}` });
    const ENERGY_KINDS = { POWER: 'Elektřina', GAS: 'Plyn', WATER: 'Voda', HEAT: 'Teplo', SOLAR: 'Solár' };
    KXEnergy = make({ key: 'ENERGY', typeSuffix: 'POINT', label: 'Správa energií', scopeTag: 'point', serviceKey: 'energyDomain', listKey: 'points', prefix: 'nrg', subjectWord: 'odběrné místo', subjectCap: 'Odběrné místo', countWord: 'odběrných míst', placeholder: 'např. Odečet elektroměru', empty: 'Zatím žádná odběrná místa. Přidejte elektřinu, plyn nebo vodu a k nim odečty, zálohy a konec fixace.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', ENERGY_KINDS, true), supplier: T('Dodavatel', 80), ean: T('EAN / číslo místa', 40), address: T('Adresa', 120), note: T('Poznámka', 500) },
        kinds: { METER_READING: 'Odečet', ADVANCE: 'Záloha', BILLING: 'Vyúčtování', FIX_END: 'Konec fixace', REVISION: 'Revize', OTHER: 'Jiné' },
        subtitle: (d) => `${ENERGY_KINDS[d.kind] || d.kind}${d.supplier ? ` · ${d.supplier}` : ''}` });
    const RENTAL_KINDS = { LENT_TO: 'Půjčeno komu', BORROWED: 'Vypůjčeno od', RENTING_OUT: 'Pronajímám', RENTING: 'Pronajímám si' };
    KXRental = make({ key: 'RENTAL', typeSuffix: 'ITEM', label: 'Pronájmy a výpůjčky', scopeTag: 'rental', serviceKey: 'rentalDomain', listKey: 'rentals', prefix: 'rnt', subjectWord: 'položka', subjectCap: 'Položka', countWord: 'položek', placeholder: 'např. Vrácení vrtačky', empty: 'Zatím nic půjčeného ani pronajatého. Přidejte věc a termín vrácení nebo platby.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', RENTAL_KINDS, true), party: T('Protistrana', 120), since: D('Od kdy'), note: T('Poznámka', 500) },
        kinds: { RETURN: 'Vrácení', PAYMENT: 'Platba', HANDOVER: 'Předání', CHECK: 'Kontrola stavu', OTHER: 'Jiné' },
        subtitle: (d) => `${RENTAL_KINDS[d.kind] || d.kind}${d.party ? ` · ${d.party}` : ''}` });
    const DOC_KINDS = { ID_CARD: 'Občanský průkaz', PASSPORT: 'Pas', DRIVING: 'Řidičský průkaz', CERTIFICATE: 'Certifikát / osvědčení', CONTRACT: 'Smlouva', MANUAL: 'Manuál', OTHER: 'Jiné' };
    KXDocuments = make({ key: 'DOCUMENTS', typeSuffix: 'DOC', label: 'Dokumenty a manuály', scopeTag: 'doc', serviceKey: 'documentsDomain', listKey: 'docs', prefix: 'doc', subjectWord: 'dokument', subjectCap: 'Dokument', countWord: 'dokumentů', placeholder: 'např. Konec platnosti pasu', empty: 'Zatím žádné dokumenty. Přidejte doklad nebo manuál a hlídejte konec platnosti a obnovu.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', DOC_KINDS, true), holder: T('Komu patří', 80), number: T('Číslo', 40), validTo: D('Platnost do'), note: T('Poznámka', 500) },
        kinds: { EXPIRY: 'Konec platnosti', RENEWAL: 'Obnova', REVIEW: 'Revize', OTHER: 'Jiné' },
        subtitle: (d, f) => `${DOC_KINDS[d.kind] || d.kind}${d.holder ? ` · ${d.holder}` : ''}${d.validTo ? ` · do ${f(d.validTo)}` : ''}` });
    /* N2.6b · second batch of hubs without their own screen */
    const FOOD_KINDS = { FRIDGE: 'Lednice', FREEZER: 'Mrazák', PANTRY: 'Spíž', DRINKS: 'Nápoje', BABY: 'Dětská výživa', OTHER: 'Jiné' };
    KXFood = make({ key: 'FOOD', typeSuffix: 'STOCK', label: 'Jídlo a nákupy', scopeTag: 'food', serviceKey: 'foodDomain', listKey: 'foods', prefix: 'fd', subjectWord: 'zásoba', subjectCap: 'Zásoba', countWord: 'zásob', placeholder: 'např. Spotřebovat do', empty: 'Zatím žádné zásoby. Přidejte potravinu a hlídejte datum spotřeby a další nákup.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Kde', FOOD_KINDS, true), amount: T('Množství', 40), bought: D('Koupeno'), note: T('Poznámka', 300) },
        kinds: { USE_BY: 'Spotřebovat do', BEST_BEFORE: 'Minimální trvanlivost', BUY: 'Koupit znovu', DEFROST: 'Rozmrazit', OTHER: 'Jiné' },
        subtitle: (d) => `${FOOD_KINDS[d.kind] || d.kind}${d.amount ? ` · ${d.amount}` : ''}` });
    const CUSTOMER_KINDS = { B2C: 'Zákazník', B2B: 'Firma', RESELLER: 'Prodejce', VIP: 'Stálý zákazník' };
    KXSales = make({ key: 'SALES', typeSuffix: 'CUSTOMER', label: 'Prodej a zákazníci', scopeTag: 'customer', serviceKey: 'salesDomain', listKey: 'customers', prefix: 'sal', subjectWord: 'zákazník', subjectCap: 'Zákazník', countWord: 'zákazníků', placeholder: 'např. Poslat nabídku', empty: 'Zatím žádní zákazníci. Přidejte zákazníka a k němu nabídky, follow-upy a splatnosti faktur.',
        fields: { name: name('Jméno / firma', 'Jméno je povinné'), kind: E('Druh', CUSTOMER_KINDS, true), contact: T('Kontakt', 120), ico: T('IČO', 20), note: T('Poznámka', 500) },
        kinds: { OFFER: 'Nabídka', FOLLOW_UP: 'Ozvat se', ORDER_DUE: 'Termín zakázky', INVOICE_DUE: 'Splatnost faktury', REVIEW: 'Žádost o recenzi', OTHER: 'Jiné' },
        subtitle: (d) => `${CUSTOMER_KINDS[d.kind] || d.kind}${d.contact ? ` · ${d.contact}` : ''}` });
    const BUILD_KINDS = { NEW: 'Novostavba', RECONSTRUCTION: 'Rekonstrukce', ASSEMBLY: 'Montáž', REPAIR: 'Oprava', GARDEN: 'Zahrada a terén' };
    KXBuild = make({ key: 'BUILD', typeSuffix: 'SITE', label: 'Stavby a montáže', scopeTag: 'site', serviceKey: 'buildDomain', listKey: 'sites', prefix: 'bld', subjectWord: 'stavba', subjectCap: 'Stavba', countWord: 'staveb', placeholder: 'např. Dodávka materiálu', empty: 'Zatím žádné stavby. Přidejte stavbu nebo montáž a k ní etapy, dodávky a kontroly.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', BUILD_KINDS, true), place: T('Místo', 120), contractor: T('Dodavatel / řemeslník', 120), start: D('Začátek'), note: T('Poznámka', 500) },
        kinds: { STAGE: 'Etapa', DELIVERY: 'Dodávka materiálu', INSPECTION: 'Kontrola / přejímka', PAYMENT: 'Platba', HANDOVER: 'Předání', OTHER: 'Jiné' },
        subtitle: (d) => `${BUILD_KINDS[d.kind] || d.kind}${d.place ? ` · ${d.place}` : ''}` });
    const STOCK_KINDS = { MATERIAL: 'Materiál', GOODS: 'Zboží', PACKAGING: 'Obaly', SPARE: 'Náhradní díly', CONSUMABLE: 'Spotřební materiál' };
    KXStock = make({ key: 'STOCK', typeSuffix: 'ITEM', label: 'Sklady a inventury', scopeTag: 'stock', serviceKey: 'stockDomain', listKey: 'stockItems', prefix: 'stk', subjectWord: 'skladová položka', subjectCap: 'Položka', countWord: 'položek', placeholder: 'např. Doobjednat', empty: 'Zatím žádné skladové položky. Přidejte materiál nebo zboží a hlídejte doobjednání a inventury.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', STOCK_KINDS, true), amount: T('Stav zásoby', 40), minimum: T('Minimum', 40), place: T('Umístění', 80), supplier: T('Dodavatel', 120), note: T('Poznámka', 300) },
        kinds: { REORDER: 'Doobjednat', STOCKTAKE: 'Inventura', EXPIRY: 'Expirace', DELIVERY: 'Dodávka', OTHER: 'Jiné' },
        subtitle: (d) => `${STOCK_KINDS[d.kind] || d.kind}${d.amount ? ` · ${d.amount}` : ''}${d.place ? ` · ${d.place}` : ''}` });
    const INV_KINDS = { TOOL: 'Nářadí', DEVICE: 'Zařízení', FURNITURE: 'Vybavení', IT: 'IT technika', OTHER: 'Jiné' };
    KXInventory = make({ key: 'INVENTORY', typeSuffix: 'PIECE', label: 'Inventury a evidence kusů', scopeTag: 'piece', serviceKey: 'inventoryDomain', listKey: 'pieces', prefix: 'inv', subjectWord: 'kus', subjectCap: 'Kus', countWord: 'kusů', placeholder: 'např. Roční inventura', empty: 'Zatím žádné evidované kusy. Přidejte kus s inventárním číslem a hlídejte inventury a kontroly.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', INV_KINDS, true), code: T('Inventární číslo', 40), place: T('Umístění', 80), holder: T('Kdo má u sebe', 80), note: T('Poznámka', 300) },
        kinds: { STOCKTAKE: 'Inventura', CHECK: 'Kontrola', RETURN: 'Vrácení', DISPOSAL: 'Vyřazení', OTHER: 'Jiné' },
        subtitle: (d) => `${INV_KINDS[d.kind] || d.kind}${d.code ? ` · ${d.code}` : ''}${d.holder ? ` · ${d.holder}` : ''}` });
    const FORM_KINDS = { PROTOCOL: 'Protokol', CHECKLIST: 'Kontrolní seznam', HANDOVER: 'Předávací protokol', REQUEST: 'Žádost', OTHER: 'Jiné' };
    KXForms = make({ key: 'FORMS', typeSuffix: 'FORM', label: 'Formuláře a protokoly', scopeTag: 'form', serviceKey: 'formsDomain', listKey: 'forms', prefix: 'frm', subjectWord: 'formulář', subjectCap: 'Formulář', countWord: 'formulářů', placeholder: 'např. Vyplnit do', empty: 'Zatím žádné formuláře. Přidejte protokol nebo kontrolní seznam a hlídejte vyplnění a revize.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', FORM_KINDS, true), owner: T('Odpovídá', 80), note: T('Poznámka', 500) },
        kinds: { FILL_IN: 'Vyplnit do', SIGN: 'Podepsat', SUBMIT: 'Odevzdat', REVIEW: 'Revize', OTHER: 'Jiné' },
        subtitle: (d) => `${FORM_KINDS[d.kind] || d.kind}${d.owner ? ` · ${d.owner}` : ''}` });
    const GUIDE_KINDS = { WORK: 'Pracovní postup', SAFETY: 'Bezpečnost', MACHINE: 'Obsluha stroje', HOME: 'Domácnost', OTHER: 'Jiné' };
    KXGuide = make({ key: 'GUIDE', typeSuffix: 'GUIDE', label: 'Návody a postupy', scopeTag: 'guide', serviceKey: 'guideDomain', listKey: 'guides', prefix: 'gd', subjectWord: 'návod', subjectCap: 'Návod', countWord: 'návodů', placeholder: 'např. Revize postupu', empty: 'Zatím žádné návody. Přidejte postup a hlídejte jeho revize a školení.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Druh', GUIDE_KINDS, true), author: T('Autor', 80), version: T('Verze', 20), note: T('Poznámka', 500) },
        kinds: { REVIEW: 'Revize postupu', TRAINING: 'Proškolení', UPDATE: 'Aktualizace', OTHER: 'Jiné' },
        subtitle: (d) => `${GUIDE_KINDS[d.kind] || d.kind}${d.version ? ` · v${d.version}` : ''}` });
    const SHIP_KINDS = { OUTGOING: 'Odesílám', INCOMING: 'Přijímám', RETURN: 'Vratka' };
    KXShipping = make({ key: 'SHIPPING', typeSuffix: 'PARCEL', label: 'Zásilky a doručování', scopeTag: 'parcel', serviceKey: 'shippingDomain', listKey: 'parcels', prefix: 'shp', subjectWord: 'zásilka', subjectCap: 'Zásilka', countWord: 'zásilek', placeholder: 'např. Vyzvednout do', empty: 'Zatím žádné zásilky. Přidejte zásilku a hlídejte odeslání, doručení a vyzvednutí.',
        fields: { name: name('Název', 'Název je povinný'), kind: E('Směr', SHIP_KINDS, true), carrier: T('Dopravce', 60), tracking: T('Sledovací číslo', 60), party: T('Odesílatel / příjemce', 120), note: T('Poznámka', 300) },
        kinds: { SEND_BY: 'Odeslat do', DELIVERY: 'Doručení', PICKUP: 'Vyzvednout do', RETURN_BY: 'Vrátit do', OTHER: 'Jiné' },
        subtitle: (d) => `${SHIP_KINDS[d.kind] || d.kind}${d.carrier ? ` · ${d.carrier}` : ''}${d.tracking ? ` · ${d.tracking}` : ''}` });
})();
/* N2.6b · KEYRON – password vault (user priority). Encryption ONLY in the browser: AES-GCM 256, key from the master password via PBKDF2-SHA256 (310 000 iterations).
   The master password is never stored; Core keeps only ciphertext. Owner-only access; AI / Kaira contexts are refused; auto-lock after 5 min idle and when the hub closes. */
var KXVault;
(function (NS) {
    const OWNER = 'APP.KX.VAULT', T_ENTRY = 'VAULT.ENTRY', T_META = 'VAULT.META', ITER = 310000, B64 = /^[A-Za-z0-9+/=]{8,40000}$/;
    const deny = (c) => { const a = String(c?.appCode || ''); if (/AI|KAIRA|AGENT|MCP/i.test(a) || c?.agent)
        throw new Error('VAULT_AI_DENIED'); if (!c?.actorId)
        throw new Error('VAULT_ACTOR_REQUIRED'); };
    function install(core) {
        if (core.vault)
            return core.vault;
        const svc = { async personal(actor) { const sp = await core.propagate.spaces(actor); const s = sp.find((x) => x.kind === 'PERSONAL') || sp[0]; if (!s)
                throw new Error('VAULT_NO_SPACE'); return s.id; },
            async meta(p, c) { deny(c); const r = await core.entities.get(`${T_META}.${c.actorId}`); return r && !r.archivedAt && r.data?.owner === c.actorId ? { exists: true, salt: r.data.salt, iter: r.data.iter, check: r.data.check, revision: r.revision } : { exists: false }; },
            async saveMeta(p, c) {
                deny(c);
                if (!B64.test(String(p?.salt)) || !B64.test(String(p?.check?.iv)) || !B64.test(String(p?.check?.ct)))
                    throw new Error('VAULT_META_INVALID');
                const id = `${T_META}.${c.actorId}`;
                const old = await core.entities.get(id);
                if (old && !old.archivedAt && p?.expectedRevision !== old.revision)
                    throw new Error('VAULT_META_EXISTS');
                return core.entities.save({ id, type: T_META, ownerApp: OWNER, schema: 'KX.VAULT.META/1', spaceIds: [await this.personal(c.actorId)], expectedRevision: old?.revision, data: { owner: c.actorId, salt: p.salt, iter: ITER, check: { iv: p.check.iv, ct: p.check.ct } } }, c);
            },
            async list(p, c) { deny(c); return (await core.entities.list()).filter((r) => r.type === T_ENTRY && !r.archivedAt && r.data?.owner === c.actorId).map((r) => ({ id: r.id, revision: r.revision, iv: r.data.iv, ct: r.data.ct, updatedAt: r.updatedAt })); },
            async save(p, c) {
                deny(c);
                if (!B64.test(String(p?.iv)) || !B64.test(String(p?.ct)))
                    throw new Error('VAULT_ENTRY_INVALID');
                let old = null;
                if (p?.id) {
                    old = await core.entities.get(p.id);
                    if (!old || old.type !== T_ENTRY || old.data?.owner !== c.actorId)
                        throw new Error('VAULT_NOT_FOUND');
                }
                return core.entities.save({ id: p?.id, type: T_ENTRY, ownerApp: OWNER, schema: 'KX.VAULT.ENTRY/1', spaceIds: [await this.personal(c.actorId)], expectedRevision: old?.revision, data: { owner: c.actorId, iv: p.iv, ct: p.ct } }, c);
            },
            async archive(p, c) { deny(c); const r = await core.entities.get(p?.id); if (!r || r.type !== T_ENTRY || r.data?.owner !== c.actorId)
                throw new Error('VAULT_NOT_FOUND'); return core.entities.archive ? core.entities.archive(r.id, c) : core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, c); } };
        const defs = [['ACTION.VAULT.META.GET', 'READ', (p, c) => svc.meta(p, c)], ['ACTION.VAULT.META.SAVE', 'SAFE_WRITE', (p, c) => svc.saveMeta(p, c)], ['ACTION.VAULT.ENTRY.LIST', 'READ', (p, c) => svc.list(p, c)], ['ACTION.VAULT.ENTRY.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.VAULT.ENTRY.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c)]];
        const reg = [];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.vault = svc;
        }
        catch (e) {
            for (const c of reg)
                try {
                    core.actions.unregister(c);
                }
                catch { }
            throw e;
        }
        return svc;
    }
    /* ---------- browser crypto ---------- */
    const enc = new TextEncoder(), dec = new TextDecoder();
    const b64 = (u) => { const a = u instanceof Uint8Array ? u : new Uint8Array(u); let s = ''; for (let i = 0; i < a.length; i++)
        s += String.fromCharCode(a[i]); return btoa(s); };
    const ub = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    async function derive(pw, salt, iter) { const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
    async function seal(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))); return { iv: b64(iv), ct: b64(ct) }; }
    async function open(key, x) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub(x.iv) }, key, ub(x.ct)); return JSON.parse(dec.decode(pt)); }
    function genPassword(n = 20) { const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_=+'; const r = crypto.getRandomValues(new Uint32Array(n)); return Array.from(r, v => cs[v % cs.length]).join(''); }
    /* ---------- hub screen ---------- */
    function mountHub(root, core, opts) {
        const tl = (k) => { try {
            const f = opts?.TL || globalThis.KXTL;
            return f ? f(k) : k;
        }
        catch {
            return k;
        } }; /* translations from the shell (catalogue cs / en) */
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const C = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true };
        const st = { key: null, items: [], q: '', edit: null, timer: 0 };
        const toast = (m) => opts.onToast ? opts.onToast(m) : 0;
        const lock = () => { st.key = null; st.items = []; st.edit = null; draw(); };
        const bump = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { if (st.key) {
            lock();
            toast(tl('vault.autolocked'));
        } }, 5 * 60000); };
        const alive = setInterval(() => { if (!root.isConnected) {
            clearInterval(alive);
            clearTimeout(st.timer);
            st.key = null;
        } }, 2000);
        async function load() { const rows = await core.actions.invoke('ACTION.VAULT.ENTRY.LIST', {}, C); st.items = []; for (const r of rows) {
            try {
                st.items.push({ id: r.id, rev: r.revision, ...(await open(st.key, r)) });
            }
            catch { }
        } st.items.sort((a, b) => String(a.title).localeCompare(String(b.title))); }
        async function draw() {
            const meta = await core.actions.invoke('ACTION.VAULT.META.GET', {}, C);
            if (!meta.exists) {
                root.innerHTML = `<section class="ag-vault ag-card"><h3>🔐 ${esc(tl('vault.setupTitle'))}</h3><p>${esc(tl('vault.setupText'))}</p><p class="ag-vault-warn">⚠ ${esc(tl('vault.noRecovery'))}</p>
        <div class="ag-vault-form"><label class="kx-lf">${esc(tl('vault.master'))}<input type="password" data-v-pw autocomplete="new-password"></label><label class="kx-lf">${esc(tl('vault.masterAgain'))}<input type="password" data-v-pw2 autocomplete="new-password"></label></div><button type="button" class="btn" data-v-setup>🔐 ${esc(tl('vault.create'))}</button><small data-v-msg></small></section>`;
                root.querySelector('[data-v-setup]').onclick = async () => {
                    const a = root.querySelector('[data-v-pw]').value, b = root.querySelector('[data-v-pw2]').value;
                    const msg = root.querySelector('[data-v-msg]');
                    if (a.length < 10) {
                        msg.textContent = tl('vault.tooShort');
                        return;
                    }
                    if (a !== b) {
                        msg.textContent = tl('vault.mismatch');
                        return;
                    }
                    const salt = crypto.getRandomValues(new Uint8Array(16));
                    const key = await derive(a, salt, ITER);
                    const check = await seal(key, { ok: 'KX-VAULT-OK' });
                    await core.actions.invoke('ACTION.VAULT.META.SAVE', { salt: b64(salt), check }, C);
                    st.key = key;
                    await load();
                    bump();
                    draw();
                };
                return;
            }
            if (!st.key) {
                root.innerHTML = `<section class="ag-vault ag-card"><h3>🔒 ${esc(tl('vault.locked'))}</h3><p>${esc(tl('vault.lockedText'))}</p><div class="ag-vault-form"><label class="kx-lf">${esc(tl('vault.master'))}<input type="password" data-v-pw autocomplete="current-password"></label></div><button type="button" class="btn" data-v-unlock>🔓 ${esc(tl('vault.unlock'))}</button><small data-v-msg></small></section>`;
                const go = async () => { const pw = root.querySelector('[data-v-pw]').value; const msg = root.querySelector('[data-v-msg]'); try {
                    const key = await derive(pw, ub(meta.salt), meta.iter || ITER);
                    const ok = await open(key, meta.check);
                    if (ok?.ok !== 'KX-VAULT-OK')
                        throw 0;
                    st.key = key;
                    await load();
                    bump();
                    draw();
                }
                catch {
                    msg.textContent = tl('vault.wrong');
                } };
                root.querySelector('[data-v-unlock]').onclick = go;
                root.querySelector('[data-v-pw]').onkeydown = (e) => { if (e.key === 'Enter')
                    void go(); };
                return;
            }
            bump();
            const q = st.q.toLowerCase();
            const list = st.items.filter((x) => !q || `${x.title} ${x.user} ${x.url} ${x.cat}`.toLowerCase().includes(q));
            const e = st.edit;
            root.innerHTML = `<section class="ag-vault"><div class="ag-vault-bar"><input type="search" data-v-q placeholder="${esc(tl('vault.search'))}" value="${esc(st.q)}"><button type="button" class="btn" data-v-new>＋ ${esc(tl('vault.new'))}</button><button type="button" class="btn ghost" data-v-lock>🔒 ${esc(tl('vault.lock'))}</button></div>
        ${e ? `<div class="ag-card ag-vault-edit"><div class="ag-vault-form">${['title', 'user', 'url', 'cat'].map(f => `<label class="kx-lf">${esc(tl('vault.f.' + f))}<input data-v-f="${f}" value="${esc(e[f] || '')}"></label>`).join('')}<label class="kx-lf">${esc(tl('vault.f.pass'))}<span class="ag-vault-pw"><input data-v-f="pass" type="password" value="${esc(e.pass || '')}" autocomplete="off"><button type="button" class="btn ghost compact" data-v-gen>🎲 ${esc(tl('vault.generate'))}</button></span></label><label class="kx-lf wide">${esc(tl('vault.f.note'))}<textarea data-v-f="note" rows="2">${esc(e.note || '')}</textarea></label></div><button type="button" class="btn" data-v-save>${esc(tl('vault.save'))}</button><button type="button" class="btn ghost" data-v-cancel>${esc(tl('vault.cancel'))}</button></div>` : ''}
        <div class="ag-vault-list">${list.length ? list.map((x) => `<article class="ag-vault-item"><b>${esc(x.title)}</b><small>${esc(x.user || '')}${x.url ? ` · ${esc(x.url)}` : ''}${x.cat ? ` · ${esc(x.cat)}` : ''}</small><code data-v-pwshow="${esc(x.id)}">••••••••</code><span><button type="button" class="btn ghost compact" data-v-show="${esc(x.id)}">👁</button><button type="button" class="btn compact" data-v-copy="${esc(x.id)}">⧉ ${esc(tl('vault.copy'))}</button><button type="button" class="btn ghost compact" data-v-edit="${esc(x.id)}">✎</button><button type="button" class="btn ghost compact" data-v-del="${esc(x.id)}">🗑</button></span></article>`).join('') : `<p class="muted">${esc(tl('vault.empty'))}</p>`}</div></section>`;
            const $ = (s) => root.querySelector(s);
            const all = (s) => Array.from(root.querySelectorAll(s));
            $('[data-v-q]').oninput = (ev) => { st.q = ev.target.value; clearTimeout(st.qt); st.qt = setTimeout(() => { void draw().then(() => { const i = $('[data-v-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); };
            $('[data-v-new]').onclick = () => { st.edit = {}; void draw(); };
            $('[data-v-lock]').onclick = () => { lock(); };
            all('[data-v-edit]').forEach(b => b.onclick = () => { st.edit = { ...st.items.find((x) => x.id === b.dataset.vEdit) }; void draw(); });
            all('[data-v-show]').forEach(b => b.onclick = () => { const x = st.items.find((i) => i.id === b.dataset.vShow); const c = root.querySelector(`[data-v-pwshow="${CSS.escape(String(b.dataset.vShow))}"]`); c.textContent = x?.pass || ''; setTimeout(() => { if (c.isConnected)
                c.textContent = '••••••••'; }, 10000); bump(); });
            all('[data-v-copy]').forEach(b => b.onclick = async () => { const x = st.items.find((i) => i.id === b.dataset.vCopy); try {
                await navigator.clipboard.writeText(x?.pass || '');
                toast(tl('vault.copied'));
                setTimeout(() => { navigator.clipboard.writeText('').catch(() => { }); }, 30000);
            }
            catch {
                toast(tl('vault.copyFail'));
            } bump(); });
            all('[data-v-del]').forEach(b => b.onclick = async () => { const x = st.items.find((i) => i.id === b.dataset.vDel); if (!x || !confirm(tl('vault.confirmDel').replace('{t}', x.title)))
                return; await core.actions.invoke('ACTION.VAULT.ENTRY.ARCHIVE', { id: x.id }, C); await load(); void draw(); });
            if (e) {
                $('[data-v-gen]').onclick = () => { $('[data-v-f="pass"]').value = genPassword(); $('[data-v-f="pass"]').type = 'text'; };
                $('[data-v-cancel]').onclick = () => { st.edit = null; void draw(); };
                $('[data-v-save]').onclick = async () => {
                    const v = {};
                    all('[data-v-f]').forEach(i => v[String(i.dataset.vF)] = i.value.trim());
                    if (!v.title) {
                        toast(tl('vault.needTitle'));
                        return;
                    }
                    const sealed = await seal(st.key, v);
                    await core.actions.invoke('ACTION.VAULT.ENTRY.SAVE', { id: e.id, ...sealed }, C);
                    st.edit = null;
                    await load();
                    void draw();
                    toast(tl('vault.saved'));
                };
            }
        }
        /* the vault has its own bar (search, ＋ New password, Lock) – the generic hub bar would only confuse */ try {
            root.closest('.inspector')?.querySelector(':scope > .kx-hub-bar, :scope > div > .kx-hub-bar')?.classList.add('ag-hide');
        }
        catch { }
        root.addEventListener('pointerdown', bump, true);
        root.addEventListener('keydown', bump, true);
        void draw();
    }
    NS.install = install;
    NS.mountHub = mountHub;
    NS.genPassword = genPassword;
})(KXVault || (KXVault = {}));
/* N2.6b · QR centrum – web, text, Wi-Fi, contact (vCard) and SOS card QR codes with live preview, SVG / PNG download and print (offline encoder KXQRCode, MIT) */
var KXQrHub;
(function (NS) {
    const OWNER = 'APP.KX.QR_SOS', T = 'QR.CODE', KINDS = ['WEB', 'TEXT', 'WIFI', 'CONTACT', 'SOS'];
    function install(core) {
        if (core.qrHub)
            return core.qrHub;
        const clean = (v, max) => String(v ?? '').slice(0, max);
        const svc = { async list(p, c) { const ids = new Set((await core.propagate.spaces(c.actorId)).map((s) => s.id)); return (await core.entities.list()).filter((r) => r.type === T && !r.archivedAt && r.spaceIds.some((x) => ids.has(x))); },
            async save(p, c) {
                if (!KINDS.includes(p?.data?.kind))
                    throw new Error('QR_KIND_INVALID');
                const name = clean(p.data.name, 80).trim();
                if (!name)
                    throw new Error('QR_NAME_REQUIRED');
                const f = {};
                for (const [k, v] of Object.entries(p.data.fields || {}))
                    f[clean(k, 30)] = clean(v, 600);
                const sp = (await core.propagate.spaces(c.actorId)).find((s) => s.id === p.spaceId) || (await core.propagate.spaces(c.actorId))[0];
                if (!sp)
                    throw new Error('QR_NO_SPACE');
                let old = null;
                if (p.id) {
                    old = await core.entities.get(p.id);
                    if (!old || old.type !== T)
                        throw new Error('QR_NOT_FOUND');
                }
                return core.entities.save({ id: p.id, type: T, ownerApp: OWNER, schema: 'KX.QR.CODE/1', spaceIds: old ? old.spaceIds : [sp.id], expectedRevision: old?.revision, data: { name, kind: p.data.kind, fields: f } }, c);
            },
            async archive(p, c) { const r = await core.entities.get(p?.id); if (!r || r.type !== T)
                throw new Error('QR_NOT_FOUND'); return core.entities.archive ? core.entities.archive(r.id, c) : core.entities.save({ ...r, archivedAt: new Date().toISOString(), expectedRevision: r.revision }, c); } };
        const defs = [['ACTION.QR.CODE.LIST', 'READ', (p, c) => svc.list(p, c)], ['ACTION.QR.CODE.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.QR.CODE.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c)]];
        const reg = [];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.qrHub = svc;
        }
        catch (e) {
            for (const x of reg)
                try {
                    core.actions.unregister(x);
                }
                catch { }
            throw e;
        }
        return svc;
    }
    const wifiEsc = (v) => String(v || '').replace(/([\\;,:"])/g, '\\$1');
    function payload(kind, f) {
        if (kind === 'WEB')
            return String(f.url || '');
        if (kind === 'TEXT')
            return String(f.text || '');
        if (kind === 'WIFI')
            return `WIFI:T:${f.sec || 'WPA'};S:${wifiEsc(f.ssid)};P:${wifiEsc(f.pass)};${f.hidden === '1' ? 'H:true;' : ''};`;
        if (kind === 'CONTACT')
            return ['BEGIN:VCARD', 'VERSION:3.0', `N:${f.name || ''}`, `FN:${f.name || ''}`, f.org ? `ORG:${f.org}` : '', f.tel ? `TEL:${f.tel}` : '', f.email ? `EMAIL:${f.email}` : '', f.url ? `URL:${f.url}` : '', 'END:VCARD'].filter(Boolean).join('\n');
        return ['SOS', f.name ? `Jméno: ${f.name}` : '', f.ice ? `Kontakt v nouzi: ${f.ice}` : '', f.blood ? `Krevní skupina: ${f.blood}` : '', f.allergy ? `Alergie: ${f.allergy}` : '', f.meds ? `Léky: ${f.meds}` : '', f.note || ''].filter(Boolean).join('\n');
    }
    function svg(text, size = 200) {
        const Q = globalThis.KXQRCode, L = globalThis.KXQRErrorCorrectLevel;
        if (!Q || !text)
            return '';
        const qr = new Q(-1, L?.M ?? 0);
        qr.addData(unescape(encodeURIComponent(text)));
        qr.make();
        const n = qr.getModuleCount(), m = 4, u = size / (n + 2 * m);
        let d = '';
        for (let r = 0; r < n; r++)
            for (let c = 0; c < n; c++)
                if (qr.isDark(r, c))
                    d += `M${((c + m) * u).toFixed(2)} ${((r + m) * u).toFixed(2)}h${u.toFixed(2)}v${u.toFixed(2)}h-${u.toFixed(2)}z`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    }
    const FIELDS = { WEB: [['url', 'qr.f.url']], TEXT: [['text', 'qr.f.text']], WIFI: [['ssid', 'qr.f.ssid'], ['pass', 'qr.f.wifiPass'], ['sec', 'qr.f.sec']], CONTACT: [['name', 'qr.f.name'], ['tel', 'qr.f.tel'], ['email', 'qr.f.email'], ['org', 'qr.f.org'], ['url', 'qr.f.url']], SOS: [['name', 'qr.f.name'], ['ice', 'qr.f.ice'], ['blood', 'qr.f.blood'], ['allergy', 'qr.f.allergy'], ['meds', 'qr.f.meds'], ['note', 'qr.f.note']] };
    function mountHub(root, core, opts) {
        const tl = (k) => { try {
            const f = opts?.TL || globalThis.KXTL;
            return f ? f(k) : k;
        }
        catch {
            return k;
        } };
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const C = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true };
        const st = { rows: [], q: '', edit: null };
        const toast = (m) => opts.onToast ? opts.onToast(m) : 0;
        try {
            root.closest('.inspector')?.querySelector(':scope > .kx-hub-bar, :scope > div > .kx-hub-bar')?.classList.add('ag-hide');
        }
        catch { }
        const dl = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.addEventListener('click', (e) => e.stopPropagation()); /* the download click must not reach the 'click outside closes the hub' handler */ /* the download click must not reach the 'click outside closes the hub' handler */ document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
        const png = (s, name) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1024, 1024); c.toBlob(b => { if (b)
            dl(name + '.png', b); }, 'image/png'); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); };
        async function load() { st.rows = await core.actions.invoke('ACTION.QR.CODE.LIST', {}, C); }
        function draw() {
            const q = st.q.toLowerCase();
            const list = st.rows.filter((r) => !q || `${r.data.name} ${r.data.kind}`.toLowerCase().includes(q));
            const e = st.edit;
            root.innerHTML = `<section class="ag-qr"><div class="ag-vault-bar"><input type="search" data-q-q placeholder="${esc(tl('qr.search'))}" value="${esc(st.q)}"><button type="button" class="btn" data-q-new>＋ ${esc(tl('qr.new'))}</button></div>
      ${e ? `<div class="ag-card ag-qr-edit"><div class="ag-qr-editgrid"><div><div class="ag-vault-form"><label class="kx-lf">${esc(tl('qr.f.title'))}<input data-q-name value="${esc(e.name || '')}"></label><label class="kx-lf">${esc(tl('qr.f.kind'))}<select data-q-kind>${KINDS.map(k => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${esc(tl('qr.k.' + k))}</option>`).join('')}</select></label>
        ${(FIELDS[e.kind] || []).map(([k, l]) => k === 'sec' ? `<label class="kx-lf">${esc(tl(l))}<select data-q-f="sec">${['WPA', 'WEP', 'nopass'].map(o => `<option ${e.fields?.sec === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>` : `<label class="kx-lf ${k === 'text' || k === 'note' ? 'wide' : ''}">${esc(tl(l))}${k === 'text' ? `<textarea data-q-f="${k}" rows="3">${esc(e.fields?.[k] || '')}</textarea>` : `<input data-q-f="${k}" value="${esc(e.fields?.[k] || '')}">`}</label>`).join('')}</div>
        <button type="button" class="btn" data-q-save>${esc(tl('qr.save'))}</button><button type="button" class="btn ghost" data-q-cancel>${esc(tl('vault.cancel'))}</button></div><div class="ag-qr-preview" data-q-prev></div></div></div>` : ''}
      <div class="ag-qr-grid">${list.length ? list.map((r) => `<article class="ag-qr-card"><div class="ag-qr-img">${svg(payload(r.data.kind, r.data.fields), 160)}</div><b>${esc(r.data.name)}</b><small>${esc(tl('qr.k.' + r.data.kind))}</small><span><button type="button" class="btn compact" data-q-png="${esc(r.id)}">⬇ PNG</button><button type="button" class="btn ghost compact" data-q-svg="${esc(r.id)}">⬇ SVG</button><button type="button" class="btn ghost compact" data-q-print="${esc(r.id)}">🖨</button><button type="button" class="btn ghost compact" data-q-edit="${esc(r.id)}">✎</button><button type="button" class="btn ghost compact" data-q-del="${esc(r.id)}">🗑</button></span></article>`).join('') : `<p class="muted">${esc(tl('qr.empty'))}</p>`}</div></section>`;
            const $ = (x) => root.querySelector(x);
            const all = (x) => Array.from(root.querySelectorAll(x));
            const find = (id) => st.rows.find((r) => r.id === id);
            $('[data-q-q]').oninput = (ev) => { st.q = ev.target.value; clearTimeout(st.qt); st.qt = setTimeout(() => { draw(); const i = $('[data-q-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
            $('[data-q-new]').onclick = () => { st.edit = { kind: 'WEB', fields: {} }; draw(); };
            all('[data-q-edit]').forEach(b => b.onclick = () => { const r = find(b.dataset.qEdit); st.edit = { id: r.id, name: r.data.name, kind: r.data.kind, fields: { ...r.data.fields } }; draw(); });
            all('[data-q-del]').forEach(b => b.onclick = async () => { const r = find(b.dataset.qDel); if (!r || !confirm(tl('vault.confirmDel').replace('{t}', r.data.name)))
                return; await core.actions.invoke('ACTION.QR.CODE.ARCHIVE', { id: r.id }, C); await load(); draw(); });
            all('[data-q-svg]').forEach(b => b.onclick = () => { const r = find(b.dataset.qSvg); dl(r.data.name + '.svg', new Blob([svg(payload(r.data.kind, r.data.fields), 512)], { type: 'image/svg+xml' })); });
            all('[data-q-png]').forEach(b => b.onclick = () => { const r = find(b.dataset.qPng); png(svg(payload(r.data.kind, r.data.fields), 512), r.data.name); });
            all('[data-q-print]').forEach(b => b.onclick = () => { const r = find(b.dataset.qPrint); const w = window.open('', '_blank'); if (!w) {
                toast(tl('qr.popup'));
                return;
            } w.document.write(`<title>${esc(r.data.name)}</title><div style="text-align:center;font-family:sans-serif"><h2>${esc(r.data.name)}</h2>${svg(payload(r.data.kind, r.data.fields), 420)}</div>`); w.document.close(); w.focus(); w.print(); });
            if (e) {
                const read = () => { e.name = $('[data-q-name]').value; const f = { ...(e.fields || {}) }; all('[data-q-f]').forEach(i => f[String(i.dataset.qF)] = i.value); e.fields = f; };
                const prev = () => { read(); const t = payload(e.kind, e.fields); ($('[data-q-prev]')).innerHTML = t ? svg(t, 220) + `<small>${esc(tl('qr.livePreview'))}</small>` : `<small>${esc(tl('qr.fillIn'))}</small>`; };
                root.querySelectorAll('[data-q-f],[data-q-name]').forEach(i => i.oninput = prev);
                $('[data-q-kind]').onchange = (ev) => { read(); e.kind = ev.target.value; draw(); };
                prev();
                $('[data-q-cancel]').onclick = () => { st.edit = null; draw(); };
                $('[data-q-save]').onclick = async () => { read(); if (!String(e.name || '').trim()) {
                    toast(tl('vault.needTitle'));
                    return;
                } try {
                    await core.actions.invoke('ACTION.QR.CODE.SAVE', { id: e.id, data: { name: e.name, kind: e.kind, fields: e.fields } }, C);
                    st.edit = null;
                    await load();
                    draw();
                    toast(tl('qr.saved'));
                }
                catch (err) {
                    toast(String(err?.message || err));
                } };
            }
        }
        void load().then(draw);
    }
    NS.install = install;
    NS.mountHub = mountHub;
    NS.payload = payload;
    NS.svg = svg;
})(KXQrHub || (KXQrHub = {}));
