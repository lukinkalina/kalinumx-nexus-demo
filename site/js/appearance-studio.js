var KXAppearanceStudio;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x)), own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k), contract = () => KX_APPEARANCE_STUDIO_CONTRACT || {}, maxUndo = () => Number(contract().maxUndoSteps || 30), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const draftId = (actorId, scopeType, scopeId) => `APPEARANCE_STUDIO_DRAFT.${[actorId, scopeType, scopeId].join('.').replace(/[^A-Za-z0-9_.-]/g, '_')}`;
    function applyDraftPatch(current, patch) { let next = clone(current || {}); patch = patch || {}; if (own(patch, 'iconPackCode'))
        next.iconPackCode = patch.iconPackCode; if (patch.iconOverride) {
        const map = { ...(next.iconOverrides || {}) }, code = String(patch.iconOverride.iconCode || '');
        if (!code)
            throw new Error('Studio iconCode required');
        if (patch.iconOverride.asset === null)
            delete map[code];
        else
            map[code] = clone(patch.iconOverride.asset);
        next.iconOverrides = map;
    } if (patch.brand) {
        const map = { ...(next.brand || {}) }, slot = String(patch.brand.slot || '');
        if (!slot)
            throw new Error('Studio brand slot required');
        if (patch.brand.asset === null)
            delete map[slot];
        else
            map[slot] = clone(patch.brand.asset);
        next.brand = map;
    } if (own(patch, 'background'))
        next.background = clone(patch.background); if (own(patch, 'typography'))
        next.typography = clone(patch.typography); return KXAppearanceAssets.canonicalProfile(next); }
    function threeWay(base, current, draft, path = '', resolutions = {}, conflicts = []) { if (same(draft, base))
        return clone(current); if (same(current, base) || same(draft, current))
        return clone(draft); const objects = [base, current, draft].every(x => x && typeof x === 'object' && !Array.isArray(x)); if (objects) {
        const out = {};
        for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(draft)])) {
            const p = path ? `${path}.${key}` : key, v = threeWay(base[key], current[key], draft[key], p, resolutions, conflicts);
            if (v !== undefined)
                out[key] = v;
        }
        return out;
    } const choice = resolutions[path]; if (choice === 'CURRENT')
        return clone(current); if (choice === 'DRAFT')
        return clone(draft); conflicts.push(path || '$'); return clone(draft); }
    class AppearanceStudioService {
        runtime;
        appearance;
        workspaceId;
        contract = 'KX.APPEARANCE_STUDIO/1';
        sessions = new Map();
        constructor(runtime, appearance, workspaceId) {
            this.runtime = runtime;
            this.appearance = appearance;
            this.workspaceId = workspaceId;
        }
        requireCtx(ctx) { if (!ctx?.actorId)
            throw new Error('Studio actor required'); return ctx; }
        session(id, ctx) { this.requireCtx(ctx); const s = this.sessions.get(id); if (!s)
            throw new Error('Appearance Studio session not found'); if (s.actorId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('Appearance Studio actor mismatch'); return s; }
        snapshot(s) { return { contract: this.contract, sessionId: s.sessionId, actorId: s.actorId, scopeType: s.scopeType, scopeId: s.scopeId, userId: s.userId, workspaceId: s.workspaceId, draft: clone(s.draft), baseline: clone(s.baseline), baselineRevision: s.baselineRevision || 0, draftRevision: s.draftRevision || 0, restored: !!s.restored, dirty: !same(s.draft, s.baseline), historyIndex: s.historyIndex, historyLength: s.history.length, canUndo: s.historyIndex > 0, canRedo: s.historyIndex < s.history.length - 1, persistentTouched: true }; }
        async persist(s, ctx, archived = false) { const old = await this.runtime.entities.get(s.sessionId), row = await this.runtime.entities.save({ id: s.sessionId, type: 'CORE.APPEARANCE_STUDIO_DRAFT', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_STUDIO_DRAFT/1', spaceIds: [], archivedAt: archived ? new Date().toISOString() : null, data: { actorId: s.actorId, scopeType: s.scopeType, scopeId: s.scopeId, userId: s.userId, workspaceId: s.workspaceId, baseline: clone(s.baseline), baselineRevision: s.baselineRevision || 0, draft: clone(s.draft), history: clone(s.history), historyIndex: s.historyIndex, status: archived ? 'ARCHIVED' : 'ACTIVE' }, expectedRevision: old?.revision }, ctx); s.draftRevision = row.revision; return row; }
        async start(input, ctx) { this.requireCtx(ctx); const scopeType = String(input.scopeType || 'USER'); if (!['USER', 'WORKSPACE'].includes(scopeType))
            throw new Error('Studio supports USER or WORKSPACE scope only'); const workspaceId = String(input.workspaceId || this.workspaceId || ''), scopeId = String(input.scopeId || (scopeType === 'USER' ? ctx.actorId : workspaceId)); if (!scopeId)
            throw new Error('Studio scopeId required'); if (scopeType === 'USER' && scopeId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('Studio USER scope mismatch'); if (scopeType === 'WORKSPACE' && this.workspaceId && scopeId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('Studio WORKSPACE scope mismatch'); const userId = String(input.userId || ctx.actorId), baseId = draftId(ctx.actorId, scopeType, scopeId), rows = (await this.runtime.entities.list()).filter((x) => x.type === 'CORE.APPEARANCE_STUDIO_DRAFT' && x.data?.actorId === ctx.actorId && x.data?.scopeType === scopeType && x.data?.scopeId === scopeId), stored = rows.find((x) => !x.archivedAt && x.data?.status === 'ACTIVE'); if (stored) {
            const d = stored.data, sessionId = stored.id, s = { sessionId, actorId: d.actorId, scopeType: d.scopeType, scopeId: d.scopeId, userId: d.userId, workspaceId: d.workspaceId, baseline: clone(d.baseline), baselineRevision: d.baselineRevision || 0, draft: clone(d.draft), history: clone(d.history), historyIndex: d.historyIndex, draftRevision: stored.revision, restored: true };
            this.sessions.set(sessionId, s);
            return this.snapshot(s);
        } const sessionId = rows.length ? `${baseId}.R${rows.length + 1}` : baseId, read = await this.appearance.read({ userId, workspaceId }, ctx), baseline = KXAppearanceAssets.canonicalProfile(scopeType === 'USER' ? (read.userProfile || {}) : (read.workspaceProfile || {})), baselineRevision = scopeType === 'USER' ? read.userRevision : read.workspaceRevision, s = { sessionId, actorId: ctx.actorId, scopeType, scopeId, userId, workspaceId, baseline: clone(baseline), baselineRevision, draft: clone(baseline), history: [clone(baseline)], historyIndex: 0, restored: false }; this.sessions.set(sessionId, s); await this.persist(s, ctx); return this.snapshot(s); }
        read(input, ctx) { return this.snapshot(this.session(String(input.sessionId || ''), ctx)); }
        preview(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx); return { ...this.snapshot(s), resolved: KXAppearanceAssets.resolvedPresentation(s.draft, input.theme || {}) }; }
        async patch(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx), next = applyDraftPatch(s.draft, input.patch || {}); s.history = s.history.slice(0, s.historyIndex + 1); s.history.push(clone(next)); if (s.history.length > maxUndo() + 1)
            s.history.shift(); s.historyIndex = s.history.length - 1; s.draft = clone(next); await this.persist(s, ctx); return this.snapshot(s); }
        async undo(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx); if (s.historyIndex > 0)
            s.historyIndex--; s.draft = clone(s.history[s.historyIndex]); await this.persist(s, ctx); return this.snapshot(s); }
        async redo(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx); if (s.historyIndex < s.history.length - 1)
            s.historyIndex++; s.draft = clone(s.history[s.historyIndex]); await this.persist(s, ctx); return this.snapshot(s); }
        async current(s, ctx) { const read = await this.appearance.read({ userId: s.userId, workspaceId: s.workspaceId }, ctx); return { profile: KXAppearanceAssets.canonicalProfile(s.scopeType === 'USER' ? read.userProfile : read.workspaceProfile), revision: s.scopeType === 'USER' ? read.userRevision : read.workspaceRevision }; }
        async commit(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx), current = await this.current(s, ctx); if (current.revision !== s.baselineRevision)
            throw new Error(`APPEARANCE_STUDIO_COMMIT_CONFLICT:${s.baselineRevision}:${current.revision}`); const saved = await this.appearance.save({ scopeType: s.scopeType, scopeId: s.scopeId, profile: s.draft }, ctx); await this.persist(s, ctx, true); this.sessions.delete(s.sessionId); return { contract: this.contract, sessionId: s.sessionId, committed: true, scopeType: s.scopeType, scopeId: s.scopeId, profile: clone(saved.profile), revision: saved.revision }; }
        async rebase(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx), current = await this.current(s, ctx), conflicts = [], merged = KXAppearanceAssets.canonicalProfile(threeWay(s.baseline, current.profile, s.draft, '', input.resolutions || {}, conflicts)); if (conflicts.length)
            return { ...this.snapshot(s), rebased: false, conflict: true, conflictPaths: [...new Set(conflicts)], currentRevision: current.revision }; s.baseline = clone(current.profile); s.baselineRevision = current.revision; s.draft = clone(merged); s.history = [clone(merged)]; s.historyIndex = 0; await this.persist(s, ctx); return { ...this.snapshot(s), rebased: true, conflict: false, conflictPaths: [] }; }
        async discard(input, ctx) { const s = this.session(String(input.sessionId || ''), ctx); await this.persist(s, ctx, true); this.sessions.delete(s.sessionId); return { contract: this.contract, sessionId: s.sessionId, discarded: true, persistentTouched: true }; }
        activeForActor(actorId) { return [...this.sessions.values()].filter((x) => x.actorId === actorId).map((x) => this.snapshot(x)); }
    }
    function install(runtime, workspaceId) { const appearance = runtime.appearanceAssets || KXAppearanceAssets.install(runtime, workspaceId || runtime.workspaceProfile?.id), service = new AppearanceStudioService(runtime, appearance, workspaceId || runtime.workspaceProfile?.id); runtime.appearanceStudio = service; const existing = new Set(runtime.actions.list().map((x) => x.code)), reg = (code, risk, permission, handler) => { if (!existing.has(code))
        runtime.actions.register({ code, ownerApp: 'APP.NEXUS', risk, permission, handler }); }; reg('ACTION.CORE.APPEARANCE.STUDIO.START', 'READ', 'CORE.SETTING.READ', (p, c) => service.start(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.READ', 'READ', 'CORE.SETTING.READ', (p, c) => service.read(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.PREVIEW', 'READ', 'CORE.SETTING.READ', (p, c) => service.preview(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.PATCH', 'SAFE_WRITE', 'CORE.SETTING.EDIT', (p, c) => service.patch(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.UNDO', 'SAFE_WRITE', 'CORE.SETTING.EDIT', (p, c) => service.undo(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.REDO', 'SAFE_WRITE', 'CORE.SETTING.EDIT', (p, c) => service.redo(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.COMMIT', 'SAFE_WRITE', 'CORE.SETTING.EDIT', (p, c) => service.commit(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.DISCARD', 'SAFE_WRITE', 'CORE.SETTING.EDIT', (p, c) => service.discard(p, c)); reg('ACTION.CORE.APPEARANCE.STUDIO.REBASE', 'SAFE_WRITE', 'CORE.SETTING.EDIT', (p, c) => service.rebase(p, c)); return service; }
    NS.contract = contract;
    NS.draftId = draftId;
    NS.applyDraftPatch = applyDraftPatch;
    NS.threeWay = threeWay;
    NS.AppearanceStudioService = AppearanceStudioService;
    NS.install = install;
})(KXAppearanceStudio || (KXAppearanceStudio = {}));
