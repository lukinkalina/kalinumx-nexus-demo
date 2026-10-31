var KXAIGenerationApproval;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const contract = () => KX_AI_GENERATION_APPROVAL_CONTRACT || {};
    const now = () => new Date().toISOString();
    const text = (v, max, name) => { const s = String(v ?? '').trim(); if (s.length > max)
        throw new Error(`${name} exceeds ${max} chars`); return s; };
    const uniq = (xs) => [...new Set((xs || []).map(x => String(x || '').trim()).filter(Boolean))];
    const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o; }, {}) : v;
    const stableStringify = (v) => JSON.stringify(stable(v));
    const secretKey = (v) => /secret|password|passwd|token|api[_-]?key|credential|private[_-]?key|authorization|bearer/i.test(v);
    const secretPath = (v, path = 'parameters') => { if (!v || typeof v !== 'object')
        return; if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            const hit = secretPath(v[i], `${path}[${i}]`);
            if (hit)
                return hit;
        }
        return;
    } for (const [k, val] of Object.entries(v)) {
        if (secretKey(k))
            return `${path}.${k}`;
        const hit = secretPath(val, `${path}.${k}`);
        if (hit)
            return hit;
    } return; };
    function sha256Fallback(input) {
        const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
        const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        const padded = Math.ceil((input.length + 9) / 64) * 64, b = new Uint8Array(padded);
        b.set(input);
        b[input.length] = 0x80;
        const view = new DataView(b.buffer), bits = input.length * 8;
        view.setUint32(padded - 8, Math.floor(bits / 0x100000000), false);
        view.setUint32(padded - 4, bits >>> 0, false);
        const w = new Uint32Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
        for (let off = 0; off < b.length; off += 64) {
            for (let i = 0; i < 16; i++)
                w[i] = view.getUint32(off + i * 4, false);
            for (let i = 16; i < 64; i++) {
                const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, c, d, e, f, g, h, j] = H;
            for (let i = 0; i < 64; i++) {
                const s1 = r(f, 6) ^ r(f, 11) ^ r(f, 25), ch = (f & g) ^ (~f & h), t1 = (j + s1 + ch + K[i] + w[i]) >>> 0, s0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), maj = (a & c) ^ (a & d) ^ (c & d), t2 = (s0 + maj) >>> 0;
                j = h;
                h = g;
                g = f;
                f = (e + t1) >>> 0;
                e = d;
                d = c;
                c = a;
                a = (t1 + t2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0;
            H[1] = (H[1] + c) >>> 0;
            H[2] = (H[2] + d) >>> 0;
            H[3] = (H[3] + e) >>> 0;
            H[4] = (H[4] + f) >>> 0;
            H[5] = (H[5] + g) >>> 0;
            H[6] = (H[6] + h) >>> 0;
            H[7] = (H[7] + j) >>> 0;
        }
        return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
    }
    async function digestBytes(bytes) { const subtle = globalThis.crypto?.subtle; if (subtle?.digest) {
        const hash = await subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
    } return sha256Fallback(bytes); }
    const digestText = (s) => digestBytes(new TextEncoder().encode(s));
    const proposalId = () => `AI_GENERATION_PROPOSAL.${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    const actionCodes = () => contract().actions || {};
    class AIGenerationApprovalService {
        runtime;
        contract = 'KX.AI_GENERATION_APPROVAL/1';
        constructor(runtime) {
            this.runtime = runtime;
        }
        actor(ctx) { const actorId = String(ctx?.actorId || '').trim(); if (!actorId)
            throw new Error('AI generation actor required'); return actorId; }
        async session(sessionId, ctx) { return this.runtime.aiSessions.assertSession(String(sessionId || ''), ctx); }
        async fileRef(fileId, ctx) { const file = await this.runtime.files.get(String(fileId || '')); if (!file || file.archivedAt)
            throw new Error(`AI generation FILE missing/archived: ${fileId}`); if (ctx?.actorId !== 'SYSTEM' && !await this.runtime.access.can(this.runtime.access.file(file), ctx.actorId, 'READ'))
            throw new Error(`AI generation FILE READ denied: ${file.id}`); const blob = await this.runtime.files.getBlob(file.id); if (!blob)
            throw new Error(`AI generation FILE bytes unavailable: ${file.id}`); if (blob.size !== file.size)
            throw new Error(`AI generation FILE size mismatch: ${file.id}`); const sha = await digestBytes(new Uint8Array(await blob.arrayBuffer())); if (sha !== file.sha256)
            throw new Error(`AI generation FILE SHA-256 mismatch: ${file.id}`); return { fileId: file.id, fileRevision: file.revision, contentRevision: file.contentRevision, sha256: file.sha256, mimeType: file.mime, size: file.size, name: file.name, ownerApp: file.ownerApp, spaceIds: [...file.spaceIds] }; }
        data(row) { if (!row || row.type !== 'CORE.AI_GENERATION_PROPOSAL')
            throw new Error(`Entity ${row?.id || '<missing>'} is not AI generation proposal`); return row.data || {}; }
        async owned(id, ctx) { const row = await this.runtime.entities.get(String(id || '')); if (!row || row.type !== 'CORE.AI_GENERATION_PROPOSAL')
            throw new Error(`AI generation proposal ${id} not found`); const d = this.data(row), actor = this.actor(ctx); if (actor !== 'SYSTEM' && d.ownerActorId !== actor && !ctx.permissions?.includes('CORE.AI.SESSION.MANAGE_OTHERS'))
            throw new Error('AI generation proposal access denied'); await this.session(d.sessionId, ctx); return row; }
        async provider(session, input, ctx) { const sd = session.data || {}; let providerCode = String(input?.providerCode || '').trim().toUpperCase(), model = text(input?.model || '', 160, 'model'), evidence = 'CALLER_DECLARED'; if (sd.connectionId) {
            const conn = await this.runtime.aiConnections.getForActor(sd.connectionId, ctx, sd.context || {}), cd = conn.data || {};
            if (providerCode && providerCode !== String(cd.providerCode || '').toUpperCase())
                throw new Error(`AI generation provider mismatch: session=${cd.providerCode} input=${providerCode}`);
            providerCode = String(cd.providerCode || '').toUpperCase();
            if (!model)
                model = String(cd.defaultModel || '');
            evidence = 'SESSION_CONNECTION';
        } if (!providerCode)
            providerCode = 'MOCK.LOCAL'; return { providerCode, model: model || null, providerEvidence: evidence }; }
        parameters(input) { const raw = input === undefined ? {} : input; if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new Error('AI generation parameters must be an object'); const hit = secretPath(raw); if (hit)
            throw new Error(`AI generation parameters contain secret-like field: ${hit}`); const json = stableStringify(raw), max = Number(contract().limits?.maxParametersJsonBytes || 16384); if (new TextEncoder().encode(json).length > max)
            throw new Error(`AI generation parameters exceed ${max} bytes`); return { value: clone(raw), json }; }
        async freshness(data, ctx) { let current; try {
            current = await this.fileRef(data.output.fileId, ctx);
        }
        catch (error) {
            return { fresh: false, reasons: ['OUTPUT_UNAVAILABLE'], error: String(error) };
        } const reasons = []; for (const key of ['contentRevision', 'sha256', 'mimeType', 'size'])
            if (current[key] !== data.output[key])
                reasons.push(`OUTPUT_${String(key).toUpperCase()}_MISMATCH`); return { fresh: reasons.length === 0, reasons, current }; }
        async propose(input, ctx) { const actor = this.actor(ctx), session = await this.session(input?.sessionId, ctx), output = await this.fileRef(input?.outputFileId, ctx), targetKind = String(input?.targetKind || 'APPEARANCE_ASSET').toUpperCase(); if (!(contract().targetKinds || ['APPEARANCE_ASSET']).includes(targetKind))
            throw new Error(`Unsupported AI generation target ${targetKind}`); const prompt = text(input?.prompt || '', Number(contract().limits?.maxPromptChars || 12000), 'prompt'); if (!prompt)
            throw new Error('AI generation prompt required'); const promptSha256 = await digestText(prompt), promptExcerpt = prompt.slice(0, Number(contract().limits?.promptExcerptChars || 240)), params = this.parameters(input?.parameters), parametersSha256 = await digestText(params.json), provider = await this.provider(session, input, ctx), inputIds = uniq(input?.inputFileIds || []), maxInputs = Number(contract().limits?.maxInputFiles || 16); if (inputIds.length > maxInputs)
            throw new Error(`AI generation input files exceed ${maxInputs}`); const inputFiles = []; for (const id of inputIds)
            inputFiles.push(await this.fileRef(id, ctx)); const license = text(input?.license || 'UNSPECIFIED', 240, 'license'), source = text(input?.source || output.name, 512, 'source'), agentCode = text(input?.agentCode || '', 160, 'agentCode'), providerMessageRef = text(input?.providerMessageRef || '', 240, 'providerMessageRef'), at = now(), data = { schema: 'KX.AI_GENERATION_PROPOSAL/1', ownerActorId: actor, sessionId: session.id, targetKind, status: 'PROPOSED', output, inputFiles, provenance: { ...provider, agentCode: agentCode || null, providerMessageRef: providerMessageRef || null, promptSha256, promptLength: prompt.length, promptExcerpt, rawPromptStored: false, parametersSha256, parameters: params.value, createdAt: at }, registration: { targetActionCode: 'ACTION.CORE.APPEARANCE.ASSET.REGISTER', provenance: `AI_GENERATED:${provider.providerCode}${provider.model ? `:${provider.model}` : ''}`.slice(0, 160), license, source }, createdAt: at, updatedAt: at, decision: null, result: null }; return this.runtime.entities.save({ id: proposalId(), type: 'CORE.AI_GENERATION_PROPOSAL', ownerApp: 'APP.KX.AI', schema: 'KX.AI_GENERATION_PROPOSAL/1', spaceIds: [...output.spaceIds], data }, ctx); }
        async get(input, ctx) { const row = await this.owned(input?.id, ctx), freshness = await this.freshness(this.data(row), ctx); return { ...clone(row), freshness }; }
        async list(input, ctx) { const actor = this.actor(ctx), limit = Math.max(1, Math.min(Number(contract().limits?.maxListItems || 100), Number(input?.limit || 30))), sessionId = String(input?.sessionId || ''), status = String(input?.status || '').toUpperCase(), rows = (await this.runtime.entities.list()).filter((x) => x.type === 'CORE.AI_GENERATION_PROPOSAL' && !x.archivedAt).filter((x) => actor === 'SYSTEM' || x.data?.ownerActorId === actor).filter((x) => !sessionId || x.data?.sessionId === sessionId).filter((x) => !status || x.data?.status === status).sort((a, b) => String(b.data?.updatedAt || '').localeCompare(String(a.data?.updatedAt || ''))).slice(0, limit), items = []; for (const row of rows) {
            const freshness = await this.freshness(this.data(row), ctx);
            items.push({ id: row.id, revision: row.revision, ...clone(row.data), freshness });
        } return { contract: this.contract, items, total: items.length, limit }; }
        async approve(input, ctx) { if (!ctx?.confirmed)
            throw new Error('AI generation approval requires explicit confirmation'); if (!ctx?.permissions?.includes('CORE.APPEARANCE.ASSET.MANAGE'))
            throw new Error('Permission denied: CORE.APPEARANCE.ASSET.MANAGE'); const row = await this.owned(input?.id, ctx), d = this.data(row); if (d.status !== 'PROPOSED')
            throw new Error(`AI generation proposal ${row.id} is ${d.status}, expected PROPOSED`); const fresh = await this.freshness(d, ctx); if (!fresh.fresh) {
            const at = now(), next = { ...clone(d), status: 'STALE', updatedAt: at, decision: { kind: 'STALE', at, actorId: this.actor(ctx), note: 'Output FILE binding changed before approval', reasons: fresh.reasons } };
            await this.runtime.entities.save({ id: row.id, type: row.type, ownerApp: row.ownerApp, schema: row.schema, spaceIds: row.spaceIds, data: next, expectedRevision: row.revision }, ctx);
            throw new Error(`AI generation output stale: ${fresh.reasons.join(',')}`);
        } const action = d.registration?.targetActionCode; if (action !== 'ACTION.CORE.APPEARANCE.ASSET.REGISTER')
            throw new Error(`AI generation target action denied: ${action}`); const descriptor = await this.runtime.actions.invoke(action, { fileId: d.output.fileId, provenance: d.registration.provenance, license: d.registration.license, source: `${d.registration.source} · proposal ${row.id} · prompt ${d.provenance.promptSha256.slice(0, 12)}`.slice(0, 512) }, { ...ctx, appCode: 'APP.KX.AI', parentChangeId: ctx.rootChangeId }); const at = now(), next = { ...clone(d), status: 'APPROVED', updatedAt: at, decision: { kind: 'APPROVED', at, actorId: this.actor(ctx), note: text(input?.note || '', 240, 'approval note') || null }, result: { descriptorId: descriptor.id, descriptorRevision: descriptor.revision, fileId: d.output.fileId, contentRevision: d.output.contentRevision, sha256: d.output.sha256 } }; return this.runtime.entities.save({ id: row.id, type: row.type, ownerApp: row.ownerApp, schema: row.schema, spaceIds: row.spaceIds, data: next, expectedRevision: row.revision }, ctx); }
        async reject(input, ctx) { const row = await this.owned(input?.id, ctx), d = this.data(row); if (d.status !== 'PROPOSED')
            throw new Error(`AI generation proposal ${row.id} is ${d.status}, expected PROPOSED`); const at = now(), next = { ...clone(d), status: 'REJECTED', updatedAt: at, decision: { kind: 'REJECTED', at, actorId: this.actor(ctx), note: text(input?.note || '', 240, 'rejection note') || null }, result: null }; return this.runtime.entities.save({ id: row.id, type: row.type, ownerApp: row.ownerApp, schema: row.schema, spaceIds: row.spaceIds, data: next, expectedRevision: row.revision }, ctx); }
        async history(input, ctx) { const row = await this.owned(input?.id, ctx), revisions = await this.runtime.revisions.list(row.id), audits = (await this.runtime.audit.list()).filter((x) => x.entityId === row.id); return { contract: this.contract, proposalId: row.id, currentRevision: row.revision, revisions: revisions.map((r) => { const s = r.snapshot || {}, d = s.data || {}; return { revision: r.revision, at: r.at, actorId: r.actorId, status: d.status, updatedAt: d.updatedAt, decision: clone(d.decision), output: { fileId: d.output?.fileId, contentRevision: d.output?.contentRevision, sha256: d.output?.sha256 }, promptSha256: d.provenance?.promptSha256, parametersSha256: d.provenance?.parametersSha256 }; }), audit: audits.map((a) => ({ id: a.id, at: a.at, actorId: a.actorId, actionCode: a.actionCode, entityId: a.entityId, result: a.result, rootChangeId: a.rootChangeId, parentChangeId: a.parentChangeId })) }; }
    }
    function install(runtime) { if (!runtime.appearanceAssetIngestion)
        throw new Error('Appearance Asset Ingestion must be installed before AI Generation Approval'); const service = new AIGenerationApprovalService(runtime); runtime.aiGenerationApproval = service; const existing = new Set(runtime.actions.list().map((x) => x.code)), reg = (code, risk, permission, handler) => { if (!existing.has(code)) {
        runtime.actions.register({ code, ownerApp: 'APP.KX.AI', risk, permission, handler });
        existing.add(code);
    } }; reg('ACTION.CORE.AI.GENERATION.PROPOSE', 'SAFE_WRITE', 'CORE.AI.ACTION.PROPOSE', (p, c) => service.propose(p, c)); reg('ACTION.CORE.AI.GENERATION.GET', 'READ', 'CORE.AI.CHAT', (p, c) => service.get(p, c)); reg('ACTION.CORE.AI.GENERATION.LIST', 'READ', 'CORE.AI.CHAT', (p, c) => service.list(p, c)); reg('ACTION.CORE.AI.GENERATION.APPROVE', 'SENSITIVE_WRITE', 'CORE.AI.ACTION.EXECUTE', (p, c) => service.approve(p, c)); reg('ACTION.CORE.AI.GENERATION.REJECT', 'SAFE_WRITE', 'CORE.AI.ACTION.EXECUTE', (p, c) => service.reject(p, c)); reg('ACTION.CORE.AI.GENERATION.HISTORY', 'READ', 'CORE.AI.CHAT', (p, c) => service.history(p, c)); return service; }
    NS.contract = contract;
    NS.AIGenerationApprovalService = AIGenerationApprovalService;
    NS.install = install;
})(KXAIGenerationApproval || (KXAIGenerationApproval = {}));
