var KXContracts, KXHealth, KXCertify, KXWarranty, KXSubscriptions, KXGarden;
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
})();
