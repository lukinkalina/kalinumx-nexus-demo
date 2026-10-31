var KXAIAgents;
(function (NS) {
    const CONTRACT = 'KX.AI_AGENT_REGISTRY/1';
    const PROFILE_KEY = 'ai.agent.custom.v1';
    const CONTEXT_KINDS = ['CORE', 'HUB', 'NAV_CATEGORY', 'COLLECTION', 'SUBSECTION', 'RECORD', 'WORKFLOW'];
    const RISK_ORDER = { READ: 0, SAFE_WRITE: 1, SENSITIVE_WRITE: 2, EXTERNAL_ACTION: 3, DESTRUCTIVE: 4, FINANCIAL: 4 };
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
    const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
    const uniq = (xs) => [...new Set((xs || []).map(String))];
    const safeCode = (v) => String(v || '').replace(/^APP\.KX\./, '').replace(/^NAV\.CAT\./, '').replace(/[^A-Za-z0-9_.-]/g, '_').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    const text = (v, max, name) => { const s = String(v ?? '').trim(); if (s.length > max)
        throw new Error(`${name} exceeds ${max} chars`); return s; };
    const containsSecret = (v, path = 'payload') => {
        if (!v || typeof v !== 'object')
            return undefined;
        if (Array.isArray(v)) {
            for (let i = 0; i < v.length; i++) {
                const hit = containsSecret(v[i], `${path}[${i}]`);
                if (hit)
                    return hit;
            }
            return undefined;
        }
        for (const [k, val] of Object.entries(v)) {
            if (/secret|password|passwd|token|api[_-]?key|credential|private[_-]?key/i.test(k))
                return `${path}.${k}`;
            const hit = containsSecret(val, `${path}.${k}`);
            if (hit)
                return hit;
        }
        return undefined;
    };
    const navContract = () => KXNavigation?.contract?.() || {};
    const apps = () => Array.isArray(KXUI?.APPS) ? KXUI.APPS : [];
    const categories = () => Array.isArray(navContract().categories) ? navContract().categories : [];
    const actionMeta = (runtime) => new Map((runtime?.actions?.list?.() || []).map((x) => [x.code, x]));
    const explicitSafeOwnerActions = (runtime, ownerApp, ceiling = 'SAFE_WRITE') => (runtime?.actions?.list?.() || [])
        .filter((x) => x.ownerApp === ownerApp && !String(x.code).startsWith('ACTION.CORE.AI.') && (RISK_ORDER[x.risk] ?? 99) <= RISK_ORDER[ceiling])
        .map((x) => x.code).sort();
    const aiReadActions = (runtime) => ['ACTION.CORE.SYSTEM.HEALTH.READ', 'ACTION.CORE.IMPLEMENTATION.STATUS.READ', 'ACTION.CORE.SETTING.DEFAULTS.READ', 'ACTION.CORE.TRASH.LIST', 'ACTION.CORE.TRASH.PURGE.DRY_RUN', 'ACTION.CORE.TRASH.RESTORE.PLAN', 'ACTION.CORE.TRASH.STORAGE.ASSESS'].filter(x => actionMeta(runtime).has(x));
    const permissionsForActions = (runtime, codes) => uniq(codes.map(code => actionMeta(runtime).get(code)?.permission).filter(Boolean));
    function contextScope(kind, extra = {}) { return { kind, ...extra }; }
    function baseDescriptor(input) {
        const code = text(input.code, 160, 'agent.code');
        if (!/^AGENT\.[A-Z0-9_.-]+$/i.test(code))
            throw new Error(`Invalid AGENT.CODE ${code}`);
        const riskCeiling = String(input.riskCeiling || 'READ');
        if (!(riskCeiling in RISK_ORDER))
            throw new Error(`Invalid risk ceiling ${riskCeiling}`);
        const scopes = (input.contextScopes || []).map((x) => canonicalContextScope(x));
        if (!scopes.length)
            throw new Error(`Agent ${code} requires contextScopes`);
        const allowedTypedActions = uniq(input.allowedTypedActions || []);
        for (const a of allowedTypedActions)
            if (!/^ACTION\./.test(a) || a.startsWith('ACTION.CORE.AI.'))
                throw new Error(`Agent ${code} has invalid/recursive action ${a}`);
        return {
            contract: CONTRACT,
            code,
            source: String(input.source || 'BUILT_IN'),
            kind: String(input.kind || 'HUB'),
            name: text(input.name || code, 160, 'agent.name'),
            description: text(input.description || '', 1200, 'agent.description'),
            iconRef: text(input.iconRef || 'ICON.KX.AI', 180, 'agent.iconRef'),
            instructions: text(input.instructions || '', 8000, 'agent.instructions'),
            ownerApp: text(input.ownerApp || 'APP.KX.AI', 120, 'agent.ownerApp'),
            enabled: input.enabled !== false,
            priority: Number.isFinite(Number(input.priority)) ? Math.max(-1000, Math.min(1000, Number(input.priority))) : 0,
            contextScopes: scopes,
            allowedCapabilities: uniq(input.allowedCapabilities || ['CHAT', 'CONTEXT_HELP']),
            allowedTypedActions,
            allowedPermissions: uniq(input.allowedPermissions || []),
            riskCeiling,
            confirmationPolicy: String(input.confirmationPolicy || 'ACTIONBUS_POLICY'),
            scopeMode: String(input.scopeMode || 'GLOBAL'),
            providerPreference: input.providerPreference ? text(input.providerPreference, 120, 'providerPreference') : undefined,
            modelPreference: input.modelPreference ? text(input.modelPreference, 160, 'modelPreference') : undefined,
            contextDataPolicy: String(input.contextDataPolicy || 'PERMISSION_AWARE_REFERENCES_ONLY'),
            sensitiveDataPolicy: String(input.sensitiveDataPolicy || 'NO_RAW_SECRETS'),
            outputFormat: input.outputFormat ? text(input.outputFormat, 300, 'outputFormat') : undefined,
            quickActions: clone(input.quickActions || []),
            revision: Number.isInteger(input.revision) ? Math.max(1, input.revision) : 1,
            auditNote: input.auditNote ? text(input.auditNote, 600, 'auditNote') : undefined
        };
    }
    function canonicalContextScope(input) {
        if (!plain(input))
            throw new Error('Agent context scope must be object');
        const kind = String(input.kind || '');
        if (!CONTEXT_KINDS.includes(kind))
            throw new Error(`Unknown agent context ${kind}`);
        const out = { kind };
        for (const k of ['appCode', 'categoryCode', 'collectionCode', 'subsectionCode', 'recordType', 'recordId', 'workflowCode'])
            if (input[k] !== undefined && input[k] !== null && String(input[k]).trim())
                out[k] = text(input[k], 220, `context.${k}`);
        return out;
    }
    function canonicalContext(input = {}) {
        if (!plain(input))
            throw new Error('Agent context must be object');
        const kind = String(input.kind || 'CORE');
        if (!CONTEXT_KINDS.includes(kind))
            throw new Error(`Unknown agent context ${kind}`);
        const out = { kind };
        for (const k of ['appCode', 'categoryCode', 'collectionCode', 'subsectionCode', 'recordType', 'recordId', 'workflowCode'])
            if (input[k] !== undefined && input[k] !== null && String(input[k]).trim())
                out[k] = text(input[k], 220, `context.${k}`);
        if (input.spaceIds !== undefined)
            out.spaceIds = uniq(input.spaceIds);
        return out;
    }
    function scopeMatches(scope, ctx) {
        if (scope.kind !== ctx.kind)
            return false;
        for (const k of ['appCode', 'categoryCode', 'collectionCode', 'subsectionCode', 'recordType', 'recordId', 'workflowCode'])
            if (scope[k] !== undefined && scope[k] !== ctx[k])
                return false;
        return true;
    }
    function contextMatches(agent, ctx) { return (agent.contextScopes || []).some((s) => scopeMatches(s, ctx)); }
    function hubBuiltIns(runtime) {
        return apps().map((app, i) => baseDescriptor({
            code: `AGENT.HUB.${safeCode(app.code).toUpperCase()}`,
            kind: 'HUB', source: 'BUILT_IN', name: `${app.name} asistent`, description: `Kontextový asistent pro ${app.name}. Canonical data zůstávají ve vlastníkovi domény.`,
            iconRef: `ICON.${app.code.replace(/^APP\./, '')}`, ownerApp: app.code, priority: 200 - i,
            contextScopes: [contextScope('HUB', { appCode: app.code })],
            allowedCapabilities: ['CHAT', 'CONTEXT_HELP', 'ACTION_PROPOSAL'],
            allowedTypedActions: explicitSafeOwnerActions(runtime, app.code, 'SAFE_WRITE'), allowedPermissions: permissionsForActions(runtime, explicitSafeOwnerActions(runtime, app.code, 'SAFE_WRITE')), riskCeiling: 'SAFE_WRITE', confirmationPolicy: 'ACTIONBUS_POLICY',
            quickActions: (KXUI?.AI_CONTEXTS || []).find((x) => x.appCode === app.code)?.quickActions || []
        }));
    }
    function categoryBuiltIns() {
        return categories().map((cat, i) => baseDescriptor({
            code: `AGENT.CATEGORY.${safeCode(cat.code).toUpperCase()}`,
            kind: 'CATEGORY', source: 'BUILT_IN', name: `${cat.label} asistent`, description: `Čtecí a vysvětlující asistent pro navigační kategorii ${cat.label}.`,
            iconRef: `ICON.NAV.${safeCode(cat.code).toUpperCase()}`, ownerApp: 'APP.KX.AI', priority: 100 - i,
            contextScopes: [contextScope('NAV_CATEGORY', { categoryCode: cat.code })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP'], allowedTypedActions: [], riskCeiling: 'READ'
        }));
    }
    function specialistBuiltIns(runtime) {
        const has = (code) => actionMeta(runtime).has(code) ? [code] : [];
        return [
            baseDescriptor({ code: 'AGENT.SPECIALIST.SYSTEM_SUPERVISOR', kind: 'SPECIALIST', source: 'BUILT_IN', name: 'Systémový supervizor', description: 'Read-only diagnostika Core, registrů, recovery a stavu implementace. Opravy pouze navrhuje.', iconRef: 'ICON.KX.AI', ownerApp: 'APP.KX.AI', priority: 500, contextScopes: [contextScope('CORE'), contextScope('WORKFLOW', { workflowCode: 'SYSTEM_REVIEW' })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP', 'ACTION_PROPOSAL'], allowedTypedActions: aiReadActions(runtime), allowedPermissions: permissionsForActions(runtime, aiReadActions(runtime)), riskCeiling: 'READ' }),
            baseDescriptor({ code: 'AGENT.SPECIALIST.LASER_PARAMETER', kind: 'SPECIALIST', source: 'BUILT_IN', name: 'LASER parametrický specialista', description: 'Kontextový specialista pro stroje, profily, čočky, testy a parametry. Produkční P566 commit zůstává zakázán.', iconRef: 'ICON.KX.LASER', ownerApp: 'APP.KX.LASER', priority: 490, contextScopes: [contextScope('HUB', { appCode: 'APP.KX.LASER' }), contextScope('WORKFLOW', { workflowCode: 'LASER_PARAMETER_HELP' })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP', 'ACTION_PROPOSAL'], allowedTypedActions: [...has('ACTION.LASER.DOMAIN.LIST'), ...has('ACTION.LASER.P566.MIGRATION.ANALYZE'), ...has('ACTION.LASER.P566.MIGRATION.PREVIEW'), ...has('ACTION.LASER.P566.PARITY.OWNERS')], allowedPermissions: permissionsForActions(runtime, [...has('ACTION.LASER.DOMAIN.LIST'), ...has('ACTION.LASER.P566.MIGRATION.ANALYZE'), ...has('ACTION.LASER.P566.MIGRATION.PREVIEW'), ...has('ACTION.LASER.P566.PARITY.OWNERS')]), riskCeiling: 'READ' }),
            baseDescriptor({ code: 'AGENT.SPECIALIST.FINANCE_CLASSIFIER', kind: 'SPECIALIST', source: 'BUILT_IN', name: 'Finance klasifikátor', description: 'Navrhuje klasifikaci finančních dokladů a vysvětlení; finanční zápisy nikdy neprovádí autonomně.', iconRef: 'ICON.KX.FINANCE', ownerApp: 'APP.KX.FINANCE', priority: 480, contextScopes: [contextScope('HUB', { appCode: 'APP.KX.FINANCE' }), contextScope('WORKFLOW', { workflowCode: 'FINANCE_CLASSIFY' })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP'], allowedTypedActions: [], riskCeiling: 'READ' }),
            baseDescriptor({ code: 'AGENT.SPECIALIST.SHOP_PERSONALIZATION', kind: 'SPECIALIST', source: 'BUILT_IN', name: 'SHOP personalizační specialista', description: 'Pomáhá s produktem, variantou, šablonou a personalizačním mapováním bez přímého publikování.', iconRef: 'ICON.KX.SHOP', ownerApp: 'APP.KX.SHOP', priority: 470, contextScopes: [contextScope('HUB', { appCode: 'APP.KX.SHOP' }), contextScope('WORKFLOW', { workflowCode: 'SHOP_PERSONALIZATION' })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP'], allowedTypedActions: [], riskCeiling: 'READ' }),
            baseDescriptor({ code: 'AGENT.SPECIALIST.DATA_MAP', kind: 'SPECIALIST', source: 'BUILT_IN', name: 'Data Map specialista', description: 'Kontroluje vazby, orphan stavy a registry bez přímých cross-hub zápisů.', iconRef: 'ICON.KX.DATA', ownerApp: 'APP.KX.DATA', priority: 460, contextScopes: [contextScope('HUB', { appCode: 'APP.KX.DATA' }), contextScope('WORKFLOW', { workflowCode: 'DATA_MAP_REVIEW' })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP', 'ACTION_PROPOSAL'], allowedTypedActions: [...has('ACTION.CORE.IMPLEMENTATION.STATUS.READ')], allowedPermissions: permissionsForActions(runtime, [...has('ACTION.CORE.IMPLEMENTATION.STATUS.READ')]), riskCeiling: 'READ' }),
            baseDescriptor({ code: 'AGENT.SPECIALIST.APPEARANCE_BRAND', kind: 'SPECIALIST', source: 'BUILT_IN', name: 'Appearance / Brand specialista', description: 'Pomáhá s tématy, ikonami, brandem a typografií; assety používají Core FILE.ID a bezpečnostní pipeline.', iconRef: 'ICON.KX.IDENTITY', ownerApp: 'APP.KX.IDENTITY', priority: 450, contextScopes: [contextScope('HUB', { appCode: 'APP.KX.IDENTITY' }), contextScope('WORKFLOW', { workflowCode: 'APPEARANCE_BRAND' })], allowedCapabilities: ['CHAT', 'CONTEXT_HELP'], allowedTypedActions: [], riskCeiling: 'READ' })
        ];
    }
    function builtIns(runtime) { const rows = [...hubBuiltIns(runtime), ...categoryBuiltIns(), ...specialistBuiltIns(runtime)]; const seen = new Set(); for (const x of rows) {
        if (seen.has(x.code))
            throw new Error(`Duplicate built-in agent ${x.code}`);
        seen.add(x.code);
    } return rows; }
    function canonicalCustomDescriptor(input) {
        if (containsSecret(input))
            throw new Error('Custom agent metadata contains secret-like field');
        if (!plain(input))
            throw new Error('Custom agent must be object');
        const code = String(input.code || '');
        if (!/^AGENT\.CUSTOM\.[A-Z0-9_.-]+$/i.test(code))
            throw new Error('Custom AGENT.CODE must start AGENT.CUSTOM.');
        return baseDescriptor({ ...input, source: 'CUSTOM', kind: input.kind || 'CUSTOM', code, revision: Number.isInteger(input.revision) ? input.revision : 1 });
    }
    function canonicalCustomProfile(input = {}) {
        if (!plain(input))
            throw new Error('Custom agent profile must be object');
        const agents = {};
        const rows = Array.isArray(input.agents) ? input.agents : Object.values(input.agents || {});
        for (const row of rows) {
            const a = canonicalCustomDescriptor(row);
            if (agents[a.code])
                throw new Error(`Duplicate custom agent ${a.code}`);
            agents[a.code] = a;
        }
        return { schema: 'KX.AI_AGENT_CUSTOM_PROFILE/1', agents };
    }
    function mergeCustomProfiles(workspace = {}, user = {}) {
        const w = canonicalCustomProfile(workspace), u = canonicalCustomProfile(user), agents = { ...w.agents, ...u.agents };
        return { schema: 'KX.AI_AGENT_CUSTOM_PROFILE/1', agents };
    }
    class AIAgentRegistryService {
        runtime;
        settings;
        workspaceId;
        contract = CONTRACT;
        constructor(runtime, settings, workspaceId) {
            this.runtime = runtime;
            this.settings = settings;
            this.workspaceId = workspaceId;
        }
        async exact(scopeType, scopeId) { const rows = await this.settings.list(PROFILE_KEY), row = rows.find((x) => x.scopeType === scopeType && x.scopeId === scopeId); return row ? canonicalCustomProfile(row.value || {}) : canonicalCustomProfile({}); }
        assertScope(input, ctx) { if (!ctx || ctx.actorId === 'SYSTEM')
            return; if (input.userId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('AI Agent USER scope mismatch'); const ws = input.workspaceId || this.workspaceId; if (this.workspaceId && ws && ws !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('AI Agent WORKSPACE scope mismatch'); }
        validateActions(agent) { const map = actionMeta(this.runtime); for (const code of agent.allowedTypedActions || []) {
            const def = map.get(code);
            if (!def)
                throw new Error(`Agent ${agent.code} references unknown typed action ${code}`);
            if (code.startsWith('ACTION.CORE.AI.'))
                throw new Error(`Agent ${agent.code} cannot allow recursive AI action ${code}`);
            if ((RISK_ORDER[def.risk] ?? 99) > (RISK_ORDER[agent.riskCeiling] ?? -1))
                throw new Error(`Agent ${agent.code} action ${code} exceeds risk ceiling ${agent.riskCeiling}`);
            if (def.permission && !agent.allowedPermissions?.includes(def.permission))
                throw new Error(`Agent ${agent.code} action ${code} exceeds permission ceiling`);
        } return agent; }
        async list(input, ctx) { this.assertScope(input, ctx); const ws = input.workspaceId || this.workspaceId, workspace = ws ? await this.exact('WORKSPACE', ws) : canonicalCustomProfile({}), user = await this.exact('USER', input.userId), custom = mergeCustomProfiles(workspace, user), builtin = builtIns(this.runtime); const rows = [...builtin, ...Object.values(custom.agents)].map((x) => this.validateActions(x)).sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code)); return { contract: this.contract, builtInCount: builtin.length, customCount: Object.keys(custom.agents).length, agents: clone(rows), workspaceId: ws || null, userId: input.userId }; }
        async get(input, ctx) { const x = await this.list(input, ctx), row = x.agents.find((a) => a.code === input.agentCode); if (!row)
            throw new Error(`Unknown agent ${input.agentCode}`); return clone(row); }
        async saveCustom(input, ctx) { if (!['USER', 'WORKSPACE'].includes(input.scopeType))
            throw new Error('Custom agent scope must be USER or WORKSPACE'); if (input.scopeType === 'USER' && input.scopeId !== ctx.actorId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_USERS'))
            throw new Error('AI Agent USER save scope mismatch'); if (input.scopeType === 'WORKSPACE' && this.workspaceId && input.scopeId !== this.workspaceId && !ctx.permissions?.includes('CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('AI Agent WORKSPACE save scope mismatch'); const agent = this.validateActions(canonicalCustomDescriptor(input.agent)), current = await this.exact(input.scopeType, input.scopeId); current.agents[agent.code] = agent; const row = await this.settings.set({ key: PROFILE_KEY, scopeType: input.scopeType, scopeId: input.scopeId, value: current, updatedBy: ctx.actorId }, ctx); return { contract: this.contract, scopeType: input.scopeType, scopeId: input.scopeId, agent: clone(agent), settingId: row.id, revision: row.revision }; }
        async removeCustom(input, ctx) { const current = await this.exact(input.scopeType, input.scopeId); if (!current.agents[input.agentCode])
            return false; delete current.agents[input.agentCode]; if (Object.keys(current.agents).length === 0)
            return this.settings.unset(PROFILE_KEY, input.scopeType, input.scopeId, ctx); await this.settings.set({ key: PROFILE_KEY, scopeType: input.scopeType, scopeId: input.scopeId, value: current, updatedBy: ctx.actorId }, ctx); return true; }
        async resolve(input, ctx) { const context = canonicalContext(input.context), all = await this.list(input, ctx), agents = all.agents.filter((a) => a.enabled && contextMatches(a, context)); return { contract: this.contract, context, agents: clone(agents), primary: clone(agents[0] || null), builtInCount: all.builtInCount, customCount: all.customCount }; }
        async proposeQuickAction(input, ctx) {
            const context = canonicalContext(input.context), agent = await this.get({ userId: input.userId, workspaceId: input.workspaceId, agentCode: input.agentCode }, ctx);
            if (!agent.enabled)
                throw new Error(`Agent ${agent.code} is disabled`);
            if (!contextMatches(agent, context))
                throw new Error(`Agent ${agent.code} does not match current context`);
            if (!agent.allowedTypedActions.includes(input.actionCode))
                throw new Error(`Action ${input.actionCode} is not allow-listed by ${agent.code}`);
            const def = actionMeta(this.runtime).get(input.actionCode);
            if (!def)
                throw new Error(`Unknown action ${input.actionCode}`);
            if ((RISK_ORDER[def.risk] ?? 99) > (RISK_ORDER[agent.riskCeiling] ?? -1))
                throw new Error(`Action ${input.actionCode} exceeds ${agent.code} risk ceiling`);
            if (def.permission && !ctx.permissions?.includes(def.permission))
                throw new Error(`Permission denied: ${def.permission}`);
            if (def.permission && !agent.allowedPermissions?.includes(def.permission))
                throw new Error(`Agent permission ceiling denied: ${def.permission}`);
            if (containsSecret(input.payload))
                throw new Error('Quick Action payload contains secret-like field');
            return this.runtime.aiGateway.proposeAction({ sessionId: input.sessionId, actionCode: input.actionCode, payload: input.payload }, ctx);
        }
    }
    function install(runtime, workspaceId) {
        const service = new AIAgentRegistryService(runtime, runtime.settings, workspaceId || runtime.workspaceProfile?.id);
        runtime.aiAgents = service;
        const existing = new Set(runtime.actions.list().map((x) => x.code));
        const reg = (def) => { if (!existing.has(def.code)) {
            runtime.actions.register(def);
            existing.add(def.code);
        } };
        reg({ code: 'ACTION.CORE.AI.AGENT.REGISTRY.READ', ownerApp: 'APP.KX.AI', risk: 'READ', permission: 'CORE.AI.CHAT', handler: (p, ctx) => service.list(p, ctx) });
        reg({ code: 'ACTION.CORE.AI.AGENT.CONTEXT.RESOLVE', ownerApp: 'APP.KX.AI', risk: 'READ', permission: 'CORE.AI.CHAT', handler: (p, ctx) => service.resolve(p, ctx) });
        reg({ code: 'ACTION.CORE.AI.AGENT.CUSTOM.SAVE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.saveCustom(p, ctx) });
        reg({ code: 'ACTION.CORE.AI.AGENT.CUSTOM.REMOVE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => service.removeCustom(p, ctx) });
        reg({ code: 'ACTION.CORE.AI.AGENT.QUICK_ACTION.PROPOSE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.ACTION.PROPOSE', handler: (p, ctx) => service.proposeQuickAction(p, ctx) });
        return service;
    }
    NS.CONTRACT = CONTRACT;
    NS.PROFILE_KEY = PROFILE_KEY;
    NS.CONTEXT_KINDS = [...CONTEXT_KINDS];
    NS.canonicalContext = canonicalContext;
    NS.canonicalContextScope = canonicalContextScope;
    NS.canonicalCustomDescriptor = canonicalCustomDescriptor;
    NS.canonicalCustomProfile = canonicalCustomProfile;
    NS.mergeCustomProfiles = mergeCustomProfiles;
    NS.builtIns = builtIns;
    NS.contextMatches = contextMatches;
    NS.AIAgentRegistryService = AIAgentRegistryService;
    NS.install = install;
})(KXAIAgents || (KXAIAgents = {}));
