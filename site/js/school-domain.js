var KXSchool;
(function (KXSchool) {
    const LEVELS = { PRESCHOOL: 'Mateřská škola', PRIMARY: 'Základní škola', SECONDARY: 'Střední škola', UNIVERSITY: 'Vysoká škola', COURSE: 'Kurz / kroužek', OTHER: 'Jiné' };
    const domain = KXHubKit.createScheduleDomain({
        contract: 'KX.SCHOOL_DOMAIN/1', owner: 'APP.KX.SCHOOL', type: 'SCHOOL.STUDENT', schema: 'KX.SCHOOL.STUDENT/1', permission: 'SCHOOL.STUDENT.EDIT',
        label: 'Škola', scopeTag: 'student', serviceKey: 'schoolDomain', listKey: 'students', subjectIdKey: 'studentId', subjectNameKey: 'studentName',
        itemsKey: 'agenda', itemPayloadKey: 'agenda', itemIdKey: 'agendaId', itemIdPrefix: 'AGENDA.', maxItems: 60, soonDays: 14, countLabel: 'studentů', revisionPrefix: 'SCHOOL.DOMAIN/1:',
        subjectFields: {
            name: { kind: 'text', max: 80, required: true, label: 'Jméno / kurz', requiredMsg: 'Jméno studenta nebo kurzu je povinné' },
            level: { kind: 'enum', options: LEVELS, required: true, label: 'Stupeň', invalidMsg: 'Neplatný stupeň vzdělávání', requiredMsg: 'Stupeň vzdělávání je povinný' },
            school: { kind: 'text', max: 120, label: 'Škola (volitelně)' },
            className: { kind: 'text', max: 20, label: 'Třída (volitelně)' },
            note: { kind: 'text', max: 500, label: 'Poznámka' }
        },
        itemKinds: { EXAM: 'Písemka / zkouška', HOMEWORK: 'Domácí úkol', PROJECT: 'Projekt / referát', PARENT_MEETING: 'Třídní schůzka', TRIP: 'Výlet / akce', ACTIVITY: 'Kroužek', DAY_OFF: 'Volno / prázdniny', OTHER: 'Jiné' },
        history: { added: 'AGENDA_ADDED', done: 'AGENDA_DONE', removed: 'AGENDA_REMOVED' },
        actions: { create: 'ACTION.SCHOOL.STUDENT.CREATE', update: 'ACTION.SCHOOL.STUDENT.UPDATE', addItem: 'ACTION.SCHOOL.AGENDA.ADD', completeItem: 'ACTION.SCHOOL.AGENDA.COMPLETE', removeItem: 'ACTION.SCHOOL.AGENDA.REMOVE', archive: 'ACTION.SCHOOL.STUDENT.ARCHIVE' },
        projection: { code: 'PERSONAL.SCHOOL.UPCOMING', countField: 'upcomingCount', nextField: 'nextEventAt' },
        msg: { invalidSubject: 'Neplatná data studenta', unknownSubjectFields: 'Neznámá pole studenta', invalidItem: 'Neplatná položka agendy', unknownItemFields: 'Neznámá pole agendy', invalidItemKind: 'Neplatný typ položky agendy',
            itemDate: 'Termín položky musí být RRRR-MM-DD', itemInterval: 'Interval opakování: 1–3650 dní', itemNeedsDue: 'Zadejte termín nebo interval opakování', needSpace: 'Student musí patřit alespoň do jednoho prostoru',
            separateActions: 'Prostory a agendu upravujte samostatnými akcemi', tooMany: (n) => `Nejvýše ${n} položek agendy na studenta`, itemMissing: 'Položka agendy neexistuje', badDoneDate: 'Neplatné datum splnění',
            nextAfterDone: 'Příští termín musí být po datu splnění', missingId: 'Chybí ID studenta', notFound: (id) => `Student ${id} neexistuje`, needRev: 'Úprava studenta vyžaduje expectedRevision', archived: 'Archivovaného studenta nelze upravovat' },
        ui: { prefix: 'school', itemWord: 'agenda', subjectForm: 'sf', itemForm: 'sa', countWord: 'studentů', addLabel: '＋ Student / kurz', saveLabel: 'Uložit', openItemLabel: '＋ Termín', addItemLabel: 'Přidat termín', itemPlaceholder: 'např. Písemka z matematiky',
            noItems: 'Žádné evidované termíny', empty: 'Zatím žádní studenti ani kurzy. Data zůstávají v hubu Škola, Personal Home je jen čte.', notInstalled: 'Doménová služba Škola není nainstalovaná.',
            subtitle: (d) => `${LEVELS[d.level] || d.level}${d.className ? ` · ${d.className}` : ''}${d.school ? ` · ${d.school}` : ''}`,
            historyText: { CREATED: 'Založeno', UPDATED: 'Upraveno', AGENDA_ADDED: 'Přidán termín', AGENDA_DONE: 'Splněno', AGENDA_REMOVED: 'Termín odebrán', ARCHIVED: 'Archivováno' },
            savedToast: 'Uloženo', itemAddedToast: 'Termín přidán', itemDoneToast: 'Splněno', itemRemovedToast: 'Termín odebrán', archivedToast: 'Archivováno',
            confirmRemove: 'Odebrat termín? Záznam zůstane v historii revizí.', confirmArchive: 'Archivovat studenta/kurz? Data i historie zůstanou v revizích Core.' }
    });
    Object.assign(KXSchool, domain);
})(KXSchool || (KXSchool = {}));
