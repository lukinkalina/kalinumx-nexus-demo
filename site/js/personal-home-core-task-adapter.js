// D093 Stage215: fail-closed Core ResourceAccessService authorization.
// This is a bounded Core Tasks projection, not the authoritative HOME provider.
var KXPersonalHomeCoreTaskAdapter;
(function (ns) {
    ns.install = (personal, runtime, identityProvider) => {
        if (!personal || typeof personal.registerOwnerAdapter !== 'function' || typeof runtime?.tasks?.list !== 'function' || typeof runtime?.access?.can !== 'function')
            throw new Error('Core TaskService or ResourceAccessService unavailable');
        personal.registerOwnerAdapter('APP.KX.HOME', async (request) => {
            if (request?.projectionCode !== 'PERSONAL.HOME.STATUS' || request?.ownerApp && request.ownerApp !== 'APP.KX.HOME' || typeof request?.subjectId !== 'string' || !request.subjectId.trim() || request.subjectId.length > 256)
                throw new Error('Home owner adapter identity mismatch');
            // No verified session provider exists in the current Shell. Fail closed.
            if (typeof identityProvider?.getAuthenticatedSubjectId !== 'function')
                throw new Error('AUTH_IDENTITY_UNAVAILABLE');
            const ensureCurrentSubject = async () => {
                const actor = await identityProvider.getAuthenticatedSubjectId();
                if (typeof actor !== 'string' || !actor.trim() || actor !== request.subjectId)
                    throw new Error('AUTH_SUBJECT_MISMATCH');
            };
            await ensureCurrentSubject();
            // Stage273: do not keep mutable TaskService row references across awaits.
            // A service may return the very same objects on both reads. If a caller
            // mutates them during an ACL await, comparison of the two live objects
            // would compare the changed row to itself and certify a stale result.
            const captureRows = (list, invalidMessage) => {
                if (!Array.isArray(list))
                    throw new Error(invalidMessage);
                if (list.length > 10000)
                    throw new Error('HOME_TASK_SOURCE_TOO_LARGE');
                return list.map((task) => {
                    if (!task || typeof task !== 'object')
                        return task;
                    return { id: task.id, ownerApp: task.ownerApp, revision: task.revision,
                        status: task.status, dueAt: task.dueAt, archivedAt: task.archivedAt,
                        spaceIds: Array.isArray(task.spaceIds) ? task.spaceIds.slice() : task.spaceIds,
                        assigneeIds: Array.isArray(task.assigneeIds) ? task.assigneeIds.slice() : task.assigneeIds };
                });
            };
            // Capture synchronously BEFORE the identity revalidation awaits.
            const rows = captureRows(await runtime.tasks.list(), 'Core TaskService returned invalid rows');
            await ensureCurrentSubject();
            const home = rows.filter((t) => t && t.ownerApp === 'APP.KX.HOME');
            if (!home.length)
                throw new Error('MISSING_PROVIDER: No HOME-owned Core tasks');
            // Inconsistent IDs make READ decisions and source revisions ambiguous.
            // Reject the entire source response rather than double-counting or saving it.
            const seenTaskIds = new Set();
            for (const task of home) {
                if (typeof task.id !== 'string' || !task.id.trim() || task.id.length > 256)
                    throw new Error('INVALID_TASK_ID');
                if (!Number.isSafeInteger(task.revision) || task.revision < 0)
                    throw new Error('INVALID_TASK_REVISION');
                if (seenTaskIds.has(task.id))
                    throw new Error('DUPLICATE_HOME_TASK_ID');
                seenTaskIds.add(task.id);
            }
            const permitted = [];
            // Stage274: remember assigned tasks that are not readable at the initial
            // ACL check. A concurrent grant must not create a stale aggregate that
            // silently omits newly-readable HOME tasks.
            const initiallyDenied = [];
            for (const t of home) {
                if (typeof t.id !== 'string' || !t.id || !Array.isArray(t.spaceIds) || !Array.isArray(t.assigneeIds))
                    throw new Error('Invalid HOME task access metadata');
                // Stage232: validate every access-scope identifier before crossing the Core ACL boundary.
                // Reject malformed or oversized values instead of passing them to ResourceAccessService.
                for (const ids of [t.spaceIds, t.assigneeIds]) {
                    if (ids.length > 256 || ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 256))
                        throw new Error('INVALID_HOME_TASK_ACCESS_IDENTIFIERS');
                }
                // This check is required even for tasks assigned to the subject.
                if (!t.assigneeIds.includes(request.subjectId))
                    continue;
                const target = { kind: 'TASK', id: t.id, ownerApp: t.ownerApp, spaceIds: t.spaceIds };
                const canRead = await runtime.access.can(target, request.subjectId, 'READ');
                await ensureCurrentSubject();
                if (canRead !== true) {
                    initiallyDenied.push(t);
                    continue;
                }
                permitted.push(t);
            }
            // An inaccessible HOME domain must not become a misleading empty report.
            if (!permitted.length)
                throw new Error('ACCESS_DENIED: No readable assigned HOME tasks');
            const snapshotNow = Date.now();
            // Stage278: validate the authoritative Core TaskRecord state before any
            // aggregation. Unknown statuses and malformed archivedAt used to alter
            // alert counts silently (truthy archivedAt bypassed the due date check).
            const validIsoTimestamp = (value) => {
                if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
                    return false;
                const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
                const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
                const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
                const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
                    Number(parts[4]) <= 23 && Number(parts[5]) <= 59 && Number(parts[6]) <= 59;
            };
            const knownStatuses = new Set(['TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED']);
            for (const t of permitted) {
                if (!knownStatuses.has(t.status))
                    throw new Error('INVALID_HOME_TASK_STATUS');
                if (t.archivedAt !== null && t.archivedAt !== undefined && !validIsoTimestamp(t.archivedAt))
                    throw new Error('INVALID_HOME_ARCHIVED_AT');
                // A completed, cancelled, or archived row never contributes due alerts.
                if (t.archivedAt || t.status === 'DONE' || t.status === 'CANCELLED' || t.dueAt == null)
                    continue;
                if (!validIsoTimestamp(t.dueAt))
                    throw new Error('INVALID_HOME_DUE_AT');
            }
            const due = permitted.filter((t) => !t.archivedAt && t.status !== 'DONE' && t.status !== 'CANCELLED' && typeof t.dueAt === 'string');
            due.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
            // Stage231: permission may have been revoked while loading/processing; recheck
            // each included task before publishing the aggregate. This is best-effort
            // revalidation, not an atomic authorization transaction.
            for (const t of permitted) {
                const stillAllowed = await runtime.access.can({ kind: 'TASK', id: t.id, ownerApp: t.ownerApp, spaceIds: t.spaceIds }, request.subjectId, 'READ');
                await ensureCurrentSubject();
                if (stillAllowed !== true)
                    throw new Error('ACCESS_REVOKED_DURING_PROJECTION');
            }
            // Stage264: re-read the source after awaits; fail closed if an included task
            // changed or disappeared while permission checks were being performed.
            const latest = captureRows(await runtime.tasks.list(), 'HOME_TASK_SNAPSHOT_UNAVAILABLE');
            await ensureCurrentSubject();
            const latestById = new Map();
            for (const t of latest) {
                if (!t || t.ownerApp !== 'APP.KX.HOME')
                    continue;
                if (typeof t.id !== 'string' || !t.id.trim() || t.id.length > 256 || latestById.has(t.id))
                    throw new Error('HOME_TASK_SNAPSHOT_CHANGED');
                latestById.set(t.id, t);
            }
            // Stage269: reject newly assigned HOME tasks inserted during asynchronous
            // authorization. Otherwise a successful readback could publish a stale
            // aggregate that omits a new, potentially overdue maintenance task.
            // Stage270: compare membership for *all* HOME tasks, not just previously
            // readable tasks. A formerly unassigned task may become assigned during
            // asynchronous ACL checks and must invalidate the aggregate.
            const initialById = new Map(home.map((t) => [t.id, t]));
            for (const current of latestById.values()) {
                if (!Array.isArray(current.assigneeIds) || current.assigneeIds.length > 256 ||
                    current.assigneeIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 256))
                    throw new Error('HOME_TASK_SNAPSHOT_CHANGED');
                const original = initialById.get(current.id);
                const newlyRelevant = current.assigneeIds.includes(request.subjectId) &&
                    (!original || !Array.isArray(original.assigneeIds) || !original.assigneeIds.includes(request.subjectId));
                if (newlyRelevant)
                    throw new Error('HOME_TASK_SNAPSHOT_CHANGED');
            }
            for (const original of permitted) {
                const next = latestById.get(original.id);
                if (!next || !Number.isSafeInteger(next.revision) || next.revision !== original.revision ||
                    next.status !== original.status || next.dueAt !== original.dueAt || next.archivedAt !== original.archivedAt ||
                    !Array.isArray(next.spaceIds) || JSON.stringify(next.spaceIds) !== JSON.stringify(original.spaceIds) ||
                    !Array.isArray(next.assigneeIds) || JSON.stringify(next.assigneeIds) !== JSON.stringify(original.assigneeIds))
                    throw new Error('HOME_TASK_SNAPSHOT_CHANGED');
            }
            // Stage265: a source readback may have delayed execution; revalidate every
            // included authorization decision against its *latest* ACL scope and session.
            // This remains best-effort without an atomic Core snapshot/ACL transaction.
            for (const original of permitted) {
                const current = latestById.get(original.id);
                if (!current)
                    throw new Error('HOME_TASK_SNAPSHOT_CHANGED');
                const allowedAtReadback = await runtime.access.can({ kind: 'TASK', id: current.id, ownerApp: current.ownerApp, spaceIds: current.spaceIds }, request.subjectId, 'READ');
                await ensureCurrentSubject();
                if (allowedAtReadback !== true)
                    throw new Error('ACCESS_REVOKED_DURING_PROJECTION');
            }
            // Stage274: prevent a stale success when a task assigned to the subject
            // becomes readable while the projection is being assembled. The new
            // authorization must be reflected by a new read, never silently omitted.
            for (const original of initiallyDenied) {
                const current = latestById.get(original.id);
                if (!current)
                    continue; // still excluded; deletion did not expose data
                const newlyAllowed = await runtime.access.can({ kind: 'TASK', id: current.id, ownerApp: current.ownerApp, spaceIds: current.spaceIds }, request.subjectId, 'READ');
                await ensureCurrentSubject();
                if (newlyAllowed === true)
                    throw new Error('HOME_TASK_VISIBILITY_CHANGED');
            }
            const revision = JSON.stringify(permitted.map((t) => [t.id, t.revision]).sort((a, b) => a[0].localeCompare(b[0])));
            return { projectionCode: request.projectionCode, ownerApp: 'APP.KX.HOME', subjectId: request.subjectId, generatedAt: snapshotNow, sourceRevision: `core-tasks:${revision}`,
                payload: { alertsCount: due.filter((t) => Date.parse(t.dueAt) < snapshotNow).length,
                    ...(due.length ? { nextMaintenanceAt: due[0].dueAt } : {}), statusLabel: 'Core tasks · household maintenance', sourceUpdatedAt: new Date(snapshotNow).toISOString() } };
        });
    };
})(KXPersonalHomeCoreTaskAdapter || (KXPersonalHomeCoreTaskAdapter = {}));
