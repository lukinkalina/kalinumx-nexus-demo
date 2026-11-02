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
