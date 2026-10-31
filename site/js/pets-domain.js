var KXPets;
(function (KXPets) {
    const SPECIES = { DOG: 'Pes', CAT: 'Kočka', BIRD: 'Pták', RODENT: 'Hlodavec', REPTILE: 'Plaz', FISH: 'Ryba', HORSE: 'Kůň', OTHER: 'Jiné' };
    const domain = KXHubKit.createScheduleDomain({
        contract: 'KX.PETS_DOMAIN/1', owner: 'APP.KX.PETS', type: 'PETS.PET', schema: 'KX.PETS.PET/1', permission: 'PETS.PET.EDIT',
        label: 'Zvířata', scopeTag: 'pet', serviceKey: 'pets', listKey: 'pets', subjectIdKey: 'petId', subjectNameKey: 'petName',
        itemsKey: 'care', itemPayloadKey: 'care', itemIdKey: 'careId', itemIdPrefix: 'CARE.', maxItems: 30, soonDays: 14, countLabel: 'zvířat', revisionPrefix: 'PETS.DOMAIN/1:',
        subjectFields: {
            name: { kind: 'text', max: 80, required: true, label: 'Jméno', requiredMsg: 'Jméno zvířete je povinné' },
            species: { kind: 'enum', options: SPECIES, required: true, label: 'Druh', invalidMsg: 'Neplatný druh zvířete', requiredMsg: 'Druh zvířete je povinný' },
            birthDate: { kind: 'date', label: 'Datum narození', invalidMsg: 'Datum narození musí být RRRR-MM-DD' },
            chipId: { kind: 'text', max: 32, pattern: '^[0-9A-Za-z-]+$', label: 'Číslo čipu', patternMsg: 'Číslo čipu smí obsahovat jen písmena, číslice a pomlčku' },
            note: { kind: 'text', max: 500, label: 'Poznámka' }
        },
        itemKinds: { VACCINATION: 'Očkování', DEWORMING: 'Odčervení', ANTIPARASITIC: 'Antiparazitika', VET_CHECK: 'Veterinář', GROOMING: 'Péče o srst/drápky', OTHER: 'Jiné' },
        history: { added: 'CARE_ADDED', done: 'CARE_DONE', removed: 'CARE_REMOVED' },
        actions: { create: 'ACTION.PETS.PET.CREATE', update: 'ACTION.PETS.PET.UPDATE', addItem: 'ACTION.PETS.CARE.ADD', completeItem: 'ACTION.PETS.CARE.COMPLETE', removeItem: 'ACTION.PETS.CARE.REMOVE', archive: 'ACTION.PETS.PET.ARCHIVE' },
        projection: { code: 'PERSONAL.PETS.CARE', countField: 'dueCount', nextField: 'nextDueAt' },
        msg: { invalidSubject: 'Neplatná data zvířete', unknownSubjectFields: 'Neznámá pole zvířete', invalidItem: 'Neplatná položka péče', unknownItemFields: 'Neznámá pole péče', invalidItemKind: 'Neplatný typ péče',
            itemDate: 'Termín péče musí být RRRR-MM-DD', itemInterval: 'Interval péče: 1–3650 dní', itemNeedsDue: 'Zadejte termín nebo interval péče', needSpace: 'Zvíře musí patřit alespoň do jednoho prostoru',
            separateActions: 'Prostory a péči upravujte samostatnými akcemi', tooMany: (n) => `Nejvýše ${n} položek péče na zvíře`, itemMissing: 'Položka péče neexistuje', badDoneDate: 'Neplatné datum provedení',
            nextAfterDone: 'Příští termín musí být po datu provedení', missingId: 'Chybí ID zvířete', notFound: (id) => `Zvíře ${id} neexistuje`, needRev: 'Úprava zvířete vyžaduje expectedRevision', archived: 'Archivované zvíře nelze upravovat' },
        ui: { prefix: 'pet', itemWord: 'care', subjectForm: 'pf', itemForm: 'pc', countWord: 'zvířat', addLabel: '＋ Zvíře', saveLabel: 'Uložit zvíře', openItemLabel: '＋ Péče', addItemLabel: 'Přidat péči', itemPlaceholder: 'např. Vzteklina',
            noItems: 'Žádná evidovaná péče', empty: 'Zatím žádná zvířata. Data zůstávají v hubu Zvířata, Personal Home je jen čte.', notInstalled: 'Doménová služba Zvířata není nainstalovaná.',
            subtitle: (d, fmt) => `${SPECIES[d.species] || d.species}${d.birthDate ? ` · nar. ${fmt(d.birthDate)}` : ''}${d.chipId ? ` · čip ${d.chipId}` : ''}`,
            historyText: { CREATED: 'Založeno', UPDATED: 'Upraveno', CARE_ADDED: 'Přidána péče', CARE_DONE: 'Péče provedena', CARE_REMOVED: 'Péče odebrána', ARCHIVED: 'Archivováno' },
            savedToast: 'Zvíře uloženo', itemAddedToast: 'Péče přidána', itemDoneToast: 'Péče zapsána', itemRemovedToast: 'Péče odebrána', archivedToast: 'Zvíře archivováno',
            confirmRemove: 'Odebrat položku péče? Záznam zůstane v historii revizí.', confirmArchive: 'Archivovat zvíře? Data i historie zůstanou v revizích Core.' }
    });
    Object.assign(KXPets, domain, { normalizePet: domain.normalizeSubject, normalizeCare: domain.normalizeItem, PetsDomainService: domain.Service });
})(KXPets || (KXPets = {}));
