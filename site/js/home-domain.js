var KXHome;
(function (KXHome) {
    const KINDS = { HOUSE: 'Dům', FLAT: 'Byt', COTTAGE: 'Chata/chalupa', GARAGE: 'Garáž', OFFICE: 'Kancelář/dílna', OTHER: 'Jiné' };
    const domain = KXHubKit.createScheduleDomain({
        contract: 'KX.HOME_DOMAIN/1', owner: 'APP.KX.HOME', type: 'HOME.PROPERTY', schema: 'KX.HOME.PROPERTY/1', permission: 'HOME.PROPERTY.EDIT',
        label: 'Domácnost', scopeTag: 'property', serviceKey: 'homeDomain', listKey: 'properties', subjectIdKey: 'propertyId', subjectNameKey: 'propertyName',
        itemsKey: 'maintenance', itemPayloadKey: 'maintenance', itemIdKey: 'maintenanceId', itemIdPrefix: 'MAINT.', maxItems: 40, soonDays: 30, countLabel: 'nemovitostí', revisionPrefix: 'HOME.DOMAIN/1:',
        subjectFields: {
            name: { kind: 'text', max: 80, required: true, label: 'Název', requiredMsg: 'Název nemovitosti je povinný' },
            kind: { kind: 'enum', options: KINDS, required: true, label: 'Typ', invalidMsg: 'Neplatný typ nemovitosti', requiredMsg: 'Typ nemovitosti je povinný' },
            location: { kind: 'text', max: 120, label: 'Místo (volitelně)' },
            note: { kind: 'text', max: 500, label: 'Poznámka' }
        },
        itemKinds: { BOILER_SERVICE: 'Servis kotle', CHIMNEY: 'Kontrola komínu', GAS_REVISION: 'Revize plynu', ELECTRICAL_REVISION: 'Revize elektro', FIRE_EXTINGUISHER: 'Hasicí přístroj', SMOKE_DETECTOR: 'Detektor kouře', FILTER_CHANGE: 'Výměna filtrů', WATER_HEATER: 'Ohřívač vody', METER_READING: 'Odečet měřidel', OTHER: 'Jiné' },
        history: { added: 'MAINT_ADDED', done: 'MAINT_DONE', removed: 'MAINT_REMOVED' },
        actions: { create: 'ACTION.HOME.PROPERTY.CREATE', update: 'ACTION.HOME.PROPERTY.UPDATE', addItem: 'ACTION.HOME.MAINTENANCE.ADD', completeItem: 'ACTION.HOME.MAINTENANCE.COMPLETE', removeItem: 'ACTION.HOME.MAINTENANCE.REMOVE', archive: 'ACTION.HOME.PROPERTY.ARCHIVE' },
        projection: { code: 'PERSONAL.HOME.STATUS', countField: 'alertsCount', nextField: 'nextMaintenanceAt' },
        msg: { invalidSubject: 'Neplatná data nemovitosti', unknownSubjectFields: 'Neznámá pole nemovitosti', invalidItem: 'Neplatná položka údržby', unknownItemFields: 'Neznámá pole údržby', invalidItemKind: 'Neplatný typ údržby',
            itemDate: 'Termín údržby musí být RRRR-MM-DD', itemInterval: 'Interval údržby: 1–3650 dní', itemNeedsDue: 'Zadejte termín nebo interval údržby', needSpace: 'Nemovitost musí patřit alespoň do jednoho prostoru',
            separateActions: 'Prostory a údržbu upravujte samostatnými akcemi', tooMany: (n) => `Nejvýše ${n} položek údržby na nemovitost`, itemMissing: 'Položka údržby neexistuje', badDoneDate: 'Neplatné datum provedení',
            nextAfterDone: 'Příští termín musí být po datu provedení', missingId: 'Chybí ID nemovitosti', notFound: (id) => `Nemovitost ${id} neexistuje`, needRev: 'Úprava nemovitosti vyžaduje expectedRevision', archived: 'Archivovanou nemovitost nelze upravovat' },
        ui: { prefix: 'home', itemWord: 'maint', subjectForm: 'hf', itemForm: 'hm', countWord: 'nemovitostí', addLabel: '＋ Nemovitost', saveLabel: 'Uložit nemovitost', openItemLabel: '＋ Údržba', addItemLabel: 'Přidat údržbu', itemPlaceholder: 'např. Revize kotle Vaillant',
            noItems: 'Žádná evidovaná údržba', empty: 'Zatím žádné nemovitosti. Data zůstávají v hubu Domácnost, Personal Home je jen čte.', notInstalled: 'Doménová služba Domácnost není nainstalovaná.',
            subtitle: (d) => `${KINDS[d.kind] || d.kind}${d.location ? ` · ${d.location}` : ''}`,
            historyText: { CREATED: 'Založeno', UPDATED: 'Upraveno', MAINT_ADDED: 'Přidána údržba', MAINT_DONE: 'Údržba provedena', MAINT_REMOVED: 'Údržba odebrána', ARCHIVED: 'Archivováno' },
            savedToast: 'Nemovitost uložena', itemAddedToast: 'Údržba přidána', itemDoneToast: 'Údržba zapsána', itemRemovedToast: 'Údržba odebrána', archivedToast: 'Nemovitost archivována',
            confirmRemove: 'Odebrat položku údržby? Záznam zůstane v historii revizí.', confirmArchive: 'Archivovat nemovitost? Data i historie zůstanou v revizích Core.' }
    });
    Object.assign(KXHome, domain);
})(KXHome || (KXHome = {}));
