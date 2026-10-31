var KXAIAgentHost;
(function (NS) {
    const CONTRACT = 'KX.AI_AGENT_CONTEXT_HOST/1';
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const uniq = (xs) => [...new Set((xs || []).map(String))];
    const actionMap = (runtime) => new Map((runtime?.actions?.list?.() || []).map((x) => [x.code, x]));
    const promptRows = (agent) => (agent?.quickActions || []).map((row) => Array.isArray(row) ? { code: String(row[0] || ''), label: String(row[1] || row[0] || ''), prompt: String(row[2] || row[1] || '') } : { code: String(row?.code || ''), label: String(row?.label || row?.code || ''), prompt: String(row?.prompt || row?.description || '') }).filter((x) => x.code && x.label);
    const canonical = (input) => KXAIAgents.canonicalContext(input || { kind: 'CORE' });
    const key = (ctx) => JSON.stringify(ctx);
    function fallbackContexts(input) {
        const c = canonical(input), rows = [c];
        if (c.kind !== 'HUB' && c.appCode)
            rows.push(canonical({ kind: 'HUB', appCode: c.appCode }));
        if (c.kind !== 'NAV_CATEGORY' && c.categoryCode)
            rows.push(canonical({ kind: 'NAV_CATEGORY', categoryCode: c.categoryCode }));
        if (c.kind !== 'CORE')
            rows.push(canonical({ kind: 'CORE' }));
        const seen = new Set();
        return rows.filter(x => { const k = key(x); if (seen.has(k))
            return false; seen.add(k); return true; });
    }
    class AIAgentContextHostService {
        runtime;
        workspaceId;
        contract = CONTRACT;
        constructor(runtime, workspaceId) {
            this.runtime = runtime;
            this.workspaceId = workspaceId;
        }
        async resolveHierarchy(input, ctx) {
            const contexts = fallbackContexts(input.context), agents = [];
            const seen = new Set();
            for (const current of contexts) {
                const resolved = await this.runtime.aiAgents.resolve({ userId: input.userId, workspaceId: input.workspaceId || this.workspaceId, context: current }, ctx);
                for (const agent of resolved.agents || [])
                    if (!seen.has(agent.code)) {
                        seen.add(agent.code);
                        agents.push({ ...agent, matchedContext: current });
                    }
            }
            agents.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.code.localeCompare(b.code));
            return { requestedContext: contexts[0], contexts, agents };
        }
        async resolve(input, ctx) {
            const hierarchy = await this.resolveHierarchy(input, ctx), selected = hierarchy.agents.find(x => x.code === input.agentCode) || hierarchy.agents[0] || null, map = actionMap(this.runtime);
            const typedQuickActions = selected ? (selected.allowedTypedActions || []).map((code) => map.get(code)).filter(Boolean).map((def) => ({ code: def.code, ownerApp: def.ownerApp, risk: def.risk, permission: def.permission || null, mode: def.risk === 'READ' ? 'READ_EXECUTE' : 'PROPOSAL_ONLY' })) : [];
            return { contract: this.contract, requestedContext: clone(hierarchy.requestedContext), contextChain: clone(hierarchy.contexts), agents: clone(hierarchy.agents), selectedAgent: clone(selected), promptQuickActions: clone(promptRows(selected)), typedQuickActions: clone(typedQuickActions), rules: { read: 'ACTIONBUS_PERMISSION_PATH', write: 'PROPOSAL_ONLY_THEN_ACTIONBUS_CONFIRMATION', autonomousWrite: false } };
        }
        async selected(input, ctx) { const model = await this.resolve(input, ctx); if (!model.selectedAgent)
            throw new Error('No contextual AI agent is available'); return model; }
        async executeRead(input, ctx) {
            const model = await this.selected(input, ctx), action = model.typedQuickActions.find((x) => x.code === input.actionCode);
            if (!action)
                throw new Error(`Action ${input.actionCode} is not allow-listed by contextual Agent`);
            if (action.mode !== 'READ_EXECUTE')
                throw new Error(`Action ${input.actionCode} is not READ; use proposal path`);
            return this.runtime.actions.invoke(input.actionCode, input.payload || {}, ctx);
        }
        async propose(input, ctx) {
            const model = await this.selected(input, ctx), agent = model.selectedAgent, action = model.typedQuickActions.find((x) => x.code === input.actionCode);
            if (!action)
                throw new Error(`Action ${input.actionCode} is not allow-listed by contextual Agent`);
            if (action.mode === 'READ_EXECUTE')
                throw new Error(`Action ${input.actionCode} is READ; use read path`);
            if (!input.sessionId)
                throw new Error('Proposal-only Quick Action requires AI sessionId');
            return this.runtime.actions.invoke('ACTION.CORE.AI.AGENT.QUICK_ACTION.PROPOSE', { userId: input.userId, workspaceId: input.workspaceId || this.workspaceId, context: model.requestedContext, agentCode: agent.code, sessionId: input.sessionId, actionCode: input.actionCode, payload: input.payload || {} }, ctx);
        }
    }
    function install(runtime, workspaceId) {
        if (!runtime?.aiAgents)
            throw new Error('AI Agent Registry must be installed before Context Host');
        const service = new AIAgentContextHostService(runtime, workspaceId || runtime.workspaceProfile?.id);
        runtime.aiAgentHost = service;
        const existing = new Set(runtime.actions.list().map((x) => x.code));
        const reg = (d) => { if (!existing.has(d.code)) {
            runtime.actions.register(d);
            existing.add(d.code);
        } };
        reg({ code: 'ACTION.CORE.AI.AGENT.HOST.RESOLVE', ownerApp: 'APP.KX.AI', risk: 'READ', permission: 'CORE.AI.CHAT', handler: (p, ctx) => service.resolve(p, ctx) });
        reg({ code: 'ACTION.CORE.AI.AGENT.HOST.READ.EXECUTE', ownerApp: 'APP.KX.AI', risk: 'READ', permission: 'CORE.AI.CHAT', handler: (p, ctx) => service.executeRead(p, ctx) });
        reg({ code: 'ACTION.CORE.AI.AGENT.HOST.ACTION.PROPOSE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.ACTION.PROPOSE', handler: (p, ctx) => service.propose(p, ctx) });
        return service;
    }
    NS.CONTRACT = CONTRACT;
    NS.fallbackContexts = fallbackContexts;
    NS.AIAgentContextHostService = AIAgentContextHostService;
    NS.install = install;
})(KXAIAgentHost || (KXAIAgentHost = {}));
