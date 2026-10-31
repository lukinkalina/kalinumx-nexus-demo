// N2.4t: AI providers chosen by the user – Claude (Anthropic Messages API) + one OpenAI-compatible adapter for OpenAI, Grok (xAI),
// Mistral, OpenRouter, DeepSeek, Groq, Gemini (OpenAI-compatible endpoint) and local Ollama / LM Studio. Base URLs editable.
// The connection carries only a secretRef; the key is taken from the session vault (web: memory only, never stored).
// Desktop: the Rust side has a secret store but no HTTP client yet → calls from the desktop app come in a later step.
// Models are never invented: the connection must name its model (list fetched from the provider).
var KXAiProviders;
(function () {
    const P = {
        'ANTHROPIC': { name: 'Claude (Anthropic)', kind: 'ANTHROPIC', base: 'https://api.anthropic.com/v1', family: 'CLOUD' },
        'OPENAI': { name: 'ChatGPT / OpenAI (API)', kind: 'OPENAI_COMPAT', base: 'https://api.openai.com/v1', family: 'CLOUD' },
        'XAI.GROK': { name: 'Grok (xAI)', kind: 'OPENAI_COMPAT', base: 'https://api.x.ai/v1', family: 'CLOUD', verify: true },
        'GOOGLE.GEMINI': { name: 'Gemini (Google, OpenAI-compatible)', kind: 'OPENAI_COMPAT', base: 'https://generativelanguage.googleapis.com/v1beta/openai', family: 'CLOUD', verify: true },
        'MISTRAL': { name: 'Mistral', kind: 'OPENAI_COMPAT', base: 'https://api.mistral.ai/v1', family: 'CLOUD', verify: true },
        'OPENROUTER': { name: 'OpenRouter', kind: 'OPENAI_COMPAT', base: 'https://openrouter.ai/api/v1', family: 'CLOUD', verify: true },
        'DEEPSEEK': { name: 'DeepSeek', kind: 'OPENAI_COMPAT', base: 'https://api.deepseek.com/v1', family: 'CLOUD', verify: true },
        'GROQ': { name: 'Groq', kind: 'OPENAI_COMPAT', base: 'https://api.groq.com/openai/v1', family: 'CLOUD', verify: true },
        'LOCAL.OPENAI_COMPAT': { name: 'Local – Ollama / LM Studio', kind: 'OPENAI_COMPAT', base: 'http://localhost:11434/v1', family: 'LOCAL' }
    };
    /* session vault: secretRef → key, memory only (cleared on reload) */
    const vault = new Map();
    const putKey = (ref, key) => { /* same reference format as the core (opaque SECURE_REF:…) */ if (!/^SECURE_REF:[A-Za-z0-9._-]{3,80}$/.test(ref))
        throw new Error('AI_SECRET_REF_INVALID'); if (!key || String(key).length < 8)
        throw new Error('AI_KEY_TOO_SHORT'); vault.set(ref, String(key)); };
    const forget = (ref) => vault.delete(ref);
    const hasKey = (ref) => vault.has(ref);
    let fetcher = globalThis.fetch?.bind(globalThis);
    const setFetcher = (f) => { fetcher = f; };
    const baseOf = (code, conn) => String(conn?.defaults?.baseUrl || conn?.baseUrl || P[code].base).replace(/\/+$/, '');
    /* the gateway passes the PUBLIC connection (no secretRef) – the reference is looked up in the connection record by its id; the key itself stays in the vault */
    let coreRef = null;
    async function refOf(conn) { if (conn?.secretRef)
        return conn.secretRef; if (conn?.id && coreRef) {
        try {
            const r = await coreRef.entities.get(conn.id);
            return r?.data?.secretRef;
        }
        catch { }
    } return undefined; }
    async function keyFor(code, conn) { const ref = await refOf(conn); if (P[code].family === 'LOCAL')
        return ref ? vault.get(ref) || '' : ''; const k = ref ? vault.get(ref) : undefined; if (!k)
        throw new Error('AI_KEY_MISSING'); return k; }
    async function http(url, init) { const r = await fetcher(url, init); let j = null; try {
        j = await r.json();
    }
    catch { } if (!r.ok)
        throw new Error(`AI_HTTP_${r.status}${j?.error?.message ? ': ' + String(j.error.message).slice(0, 160) : ''}`); return j; }
    const roleOf = (r) => r === 'ASSISTANT' ? 'assistant' : r === 'SYSTEM' ? 'system' : 'user';
    function adapter(code) {
        const spec = P[code];
        return { code, name: spec.name, capabilities: { chat: true, attachments: false, tools: false, recentChats: false, projects: false, folders: false },
            async chat(req) {
                const conn = req.connection || {};
                const model = conn.defaultModel;
                if (!model)
                    throw new Error('AI_MODEL_REQUIRED');
                const key = await keyFor(code, conn);
                const base = baseOf(code, conn);
                const msgs = (req.messages || []).map((m) => ({ role: roleOf(m.role), content: String(m.content || '') }));
                if (spec.kind === 'ANTHROPIC') {
                    const system = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n') || undefined;
                    const j = await http(`${base}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 1024, system, messages: msgs.filter((m) => m.role !== 'system') }) });
                    return { content: (j?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'), providerMessageRef: j?.id };
                }
                const headers = { 'content-type': 'application/json' };
                if (key)
                    headers.authorization = `Bearer ${key}`;
                const j = await http(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, messages: msgs }) });
                return { content: String(j?.choices?.[0]?.message?.content || ''), providerMessageRef: j?.id };
            } };
    }
    /* models from the provider (never invented) */
    async function listModels(code, conn) {
        const spec = P[code];
        if (!spec)
            throw new Error('AI_PROVIDER_UNKNOWN');
        const key = await keyFor(code, conn);
        const base = baseOf(code, conn);
        const headers = spec.kind === 'ANTHROPIC' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : (key ? { authorization: `Bearer ${key}` } : {});
        const j = await http(`${base}/models`, { method: 'GET', headers });
        return (j?.data || j?.models || []).map((m) => String(m.id || m.name || '')).filter(Boolean).sort();
    }
    /* hosts the app may call for AI – the Tauri CSP must contain exactly the allowlist (weather + these) */
    const hosts = () => [...new Set(Object.values(P).map(p => new URL(p.base).origin))];
    function install(core) {
        coreRef = core;
        if (core.__kxAiProviders)
            return;
        core.__kxAiProviders = true;
        const reg = core.aiProviders;
        for (const [code, spec] of Object.entries(P)) {
            try {
                if (!reg.list().some((d) => d.code === code))
                    reg.registerDescriptor({ code, name: spec.name, family: spec.family, description: `${spec.kind === 'ANTHROPIC' ? 'Anthropic Messages API' : 'OpenAI-compatible API'} · ${spec.base}${spec.verify ? ' · ověřit při zapojení' : ''}`, authModes: spec.family === 'LOCAL' ? ['NONE', 'SECURE_REF'] : ['SECURE_REF'], capabilities: { CHAT: 'AVAILABLE', ATTACHMENTS: 'UNAVAILABLE', TOOLS: 'UNAVAILABLE', MODELS: 'AVAILABLE', OAUTH: 'UNAVAILABLE', API_CREDENTIAL: 'AVAILABLE', USAGE: 'UNAVAILABLE', RECENT_CHATS: 'UNAVAILABLE', PROJECTS: 'UNAVAILABLE', FOLDERS: 'UNAVAILABLE' } });
            }
            catch (e) { }
            try {
                reg.register(adapter(code));
            }
            catch (e) { }
        }
    }
    KXAiProviders = { P, install, adapter, listModels, putKey, forget, hasKey, setFetcher, hosts };
    globalThis.KXAiProviders = KXAiProviders;
})();
