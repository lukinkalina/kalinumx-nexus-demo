var KXWindowMinimize;
(function (NS) {
    const VALID_SECTIONS = ['today', 'calendar', 'desk', 'files', 'trash', 'apps', 'analytics', 'ai', 'settings'];
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const text = (x) => String(x ?? '').trim();
    const boundedInt = (x, min, max, fallback = 0) => { const n = Math.trunc(Number(x)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; };
    const contract = {
        contract: 'KX.CORE_WINDOW_MINIMIZE_RESTORE/1', stage: 'DELTA090_STAGE00', maxMinimizedViews: 8,
        persistence: 'WORKSPACE_UI_STATE_DEVICE_BOUND_ROWS', restoreIdentity: 'WINDOW_ID_PRIMARY_INDEX_FALLBACK',
        pendingEditPolicy: 'FAIL_CLOSED_UNAPPLIED_OR_UNPERSISTED', sections: [...VALID_SECTIONS]
    };
    function restoreIndex(row, windows = []) {
        const id = text(row?.windowId);
        if (id) {
            const i = windows.findIndex(x => text(x?.id) === id);
            if (i >= 0)
                return i;
        }
        return boundedInt(row?.window, 0, Math.max(0, windows.length - 1), 0);
    }
    function makeRow(input) {
        const section = text(input?.section);
        if (!VALID_SECTIONS.includes(section))
            throw new Error('MINIMIZE_SECTION_INVALID');
        const windowId = text(input?.windowId);
        if (!windowId)
            throw new Error('MINIMIZE_WINDOW_ID_REQUIRED');
        const workspaceId = text(input?.workspaceId);
        if (!workspaceId)
            throw new Error('MINIMIZE_WORKSPACE_REQUIRED');
        return {
            id: `${section}:${windowId}`, section, windowId, window: boundedInt(input?.window, 0, 9999, 0),
            title: text(input?.title) || section, windowName: text(input?.windowName), scrollTop: boundedInt(input?.scrollTop, 0, 10_000_000, 0),
            workspaceId, deviceId: text(input?.deviceId), pendingEditProtection: text(input?.pendingEditProtection) || 'NONE',
            minimizedAt: text(input?.minimizedAt) || new Date().toISOString(), schema: 'KX.MINIMIZED_VIEW/1'
        };
    }
    function canonicalRows(rows, ctx = {}) {
        const windows = Array.isArray(ctx.windows) ? ctx.windows : [], workspaceId = text(ctx.workspaceId), deviceId = text(ctx.deviceId), max = boundedInt(ctx.max, 1, 32, contract.maxMinimizedViews);
        const out = [];
        for (const raw of Array.isArray(rows) ? rows : []) {
            if (!raw || typeof raw !== 'object')
                continue;
            const section = text(raw.section);
            if (!VALID_SECTIONS.includes(section))
                continue;
            if (workspaceId && raw.workspaceId && text(raw.workspaceId) !== workspaceId)
                continue;
            if (deviceId && raw.deviceId && text(raw.deviceId) !== deviceId)
                continue;
            const idx = restoreIndex(raw, windows), win = windows[idx], windowId = text(raw.windowId) || text(win?.id);
            if (!windowId)
                continue;
            const row = makeRow({ ...raw, section, windowId, window: idx, workspaceId: text(raw.workspaceId) || workspaceId || 'LEGACY', deviceId: text(raw.deviceId) || deviceId });
            const existing = out.findIndex(x => x.id === row.id);
            if (existing >= 0)
                out.splice(existing, 1);
            out.push(row);
        }
        return out.slice(-max);
    }
    function upsert(rows, row, ctx = {}) { return canonicalRows([...(Array.isArray(rows) ? rows : []), row], ctx); }
    function pendingDecision(input) {
        if (input?.hasUnappliedEdit)
            return { allowed: false, reason: 'UNAPPLIED_EDIT', protection: 'BLOCKED_UNAPPLIED_EDIT' };
        if (input?.hasPendingEdit) {
            if (input?.saveBeforeMinimize !== true)
                return { allowed: false, reason: 'PENDING_EDIT_SAVE_DISABLED', protection: 'BLOCKED_SAVE_POLICY' };
            if (input?.persistedRevisionOk !== true)
                return { allowed: false, reason: 'PENDING_EDIT_NOT_PERSISTED', protection: 'BLOCKED_UNPERSISTED' };
            return { allowed: true, reason: 'PERSISTED_DRAFT_VERIFIED', protection: 'PERSISTED_DRAFT_VERIFIED' };
        }
        return { allowed: true, reason: 'NO_PENDING_EDIT', protection: 'NONE' };
    }
    function persistedState(state, persistMinimized) { const out = clone(state || {}); if (!persistMinimized)
        out.minimizedViews = []; return out; }
    NS.contract = () => clone(contract);
    NS.makeRow = makeRow;
    NS.canonicalRows = canonicalRows;
    NS.upsert = upsert;
    NS.restoreIndex = restoreIndex;
    NS.pendingDecision = pendingDecision;
    NS.persistedState = persistedState;
})(KXWindowMinimize || (KXWindowMinimize = {}));
