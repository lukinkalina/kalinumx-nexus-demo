var KXAppearanceAssetSafety;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const artifactId = (fileId) => `APPEARANCE_ASSET_SAFETY.${String(fileId).replace(/[^A-Za-z0-9_.-]/g, '_')}`;
    const fontMime = new Set(['font/woff2', 'font/woff', 'font/ttf', 'font/otf']);
    class AppearanceAssetSafetyService {
        runtime;
        contract = 'KX.APPEARANCE_SVG_FONT_SAFETY/1';
        constructor(runtime) {
            this.runtime = runtime;
        }
        ingestion() { const svc = this.runtime.appearanceAssetIngestion; if (!svc)
            throw new Error('Appearance Asset Ingestion service unavailable'); return svc; }
        async source(fileId, ctx) { const state = await this.ingestion().freshness(fileId, ctx); if (state.stale)
            throw new Error(`Appearance asset descriptor STALE: ${state.reasons.join(',')}`); return state; }
        stale(data, file) { const reasons = [...(data.fileId !== file.id ? ['FILE_ID'] : []), ...(data.contentRevision !== file.contentRevision ? ['CONTENT_REVISION'] : []), ...(data.sourceSha256 !== file.sha256 ? ['SHA256'] : []), ...(data.mimeType !== file.mime ? ['MIME'] : [])]; return { stale: reasons.length > 0, reasons }; }
        async read(input, ctx) { const state = await this.ingestion().freshness(String(input.fileId || ''), ctx), row = await this.runtime.entities.get(artifactId(state.file.id)); if (!row || row.type !== 'CORE.APPEARANCE_ASSET_SAFETY_ARTIFACT')
            return { artifact: null, state: 'MISSING', stale: true, reasons: ['MISSING'] }; const freshness = this.stale(row.data || {}, state.file); return { artifact: clone(row), state: freshness.stale ? 'STALE' : String(row.data?.state || 'REJECTED'), ...freshness }; }
        async requireSafe(input, ctx) { const result = await this.read(input, ctx); if (!result.artifact)
            throw new Error('APPEARANCE_SAFETY_ARTIFACT_MISSING'); if (result.stale)
            throw new Error(`APPEARANCE_SAFETY_ARTIFACT_STALE:${result.reasons.join(',')}`); if (result.artifact.data?.state !== 'SAFE')
            throw new Error('APPEARANCE_SAFETY_ARTIFACT_NOT_SAFE'); return result.artifact; }
        async save(state, data, ctx) { const id = artifactId(state.file.id), old = await this.runtime.entities.get(id); return this.runtime.entities.save({ id, type: 'CORE.APPEARANCE_ASSET_SAFETY_ARTIFACT', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_ASSET_SAFETY_ARTIFACT/1', spaceIds: [...state.file.spaceIds], data, expectedRevision: old?.revision }, ctx); }
        async validate(input, ctx) {
            const state = await this.source(String(input.fileId || ''), ctx), file = state.file, blob = await this.runtime.files.getBlob(file.id);
            if (!blob)
                throw new Error('Appearance safety source bytes unavailable');
            const bytes = new Uint8Array(await blob.arrayBuffer()), base = { fileId: file.id, contentRevision: file.contentRevision, sourceSha256: file.sha256, mimeType: file.mime, sourceSize: file.size, validatedAt: new Date().toISOString(), validatedBy: ctx.actorId, processingVersion: 'DELTA028.STAGE03' };
            if (file.mime === 'image/svg+xml') {
                const safe = await KXAppearanceSvgSafety.sanitizeAndDigest(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
                let derivedFileId = null;
                const old = await this.runtime.entities.get(artifactId(file.id)), oldDerived = old?.data?.derivedFileId ? await this.runtime.files.get(old.data.derivedFileId) : null;
                const out = new Blob([safe.outputSvg], { type: 'image/svg+xml' }), name = `${String(file.name).replace(/\.svg$/i, '')}.sanitized.svg`;
                if (oldDerived && !oldDerived.archivedAt) {
                    const replaced = await this.runtime.files.replaceContent(oldDerived.id, out, name, 'image/svg+xml', ctx);
                    derivedFileId = replaced.id;
                }
                else {
                    const created = await this.runtime.files.importBlob(out, name, 'image/svg+xml', 'APP.NEXUS', [...file.spaceIds], ctx, { tags: ['APPEARANCE.SANITIZED', 'DELTA028'], description: `Sanitized derivative of ${file.id}` });
                    derivedFileId = created.id;
                }
                const row = await this.save(state, { ...base, state: 'SAFE', kind: 'SVG', sanitizedSha256: safe.sanitizedSha256, derivedFileId, outputBytes: safe.outputBytes, elements: safe.elements, ids: safe.ids, references: safe.references, licenseDeclaration: null, licenseProofRef: null }, ctx);
                return clone(row);
            }
            if (fontMime.has(file.mime)) {
                const safe = await KXAppearanceFontSafety.inspect({ bytes, binding: { fileId: file.id, contentRevision: String(file.contentRevision), sha256: file.sha256, mimeType: file.mime, size: file.size }, licenseDeclaration: input.licenseDeclaration, licenseProofRef: input.licenseProofRef, woff2Decoder: this.runtime.appearanceWoff2Decoder });
                let derivedFileId = null, derivedMimeType = null, decoderProvider = null;
                if (file.mime === 'font/woff2') {
                    const decoded = safe.decodedBytes instanceof Uint8Array ? safe.decodedBytes : new Uint8Array(safe.decodedBytes || []);
                    if (!decoded.length)
                        throw new Error('WOFF2_SAFE_DECODED_BYTES_MISSING');
                    derivedMimeType = String(safe.decodedMimeType || '');
                    if (!['font/ttf', 'font/otf'].includes(derivedMimeType))
                        throw new Error('WOFF2_SAFE_DECODED_MIME_INVALID');
                    const old = await this.runtime.entities.get(artifactId(file.id)), oldDerived = old?.data?.derivedFileId ? await this.runtime.files.get(old.data.derivedFileId) : null, ext = derivedMimeType === 'font/otf' ? 'otf' : 'ttf', name = `${String(file.name).replace(/\.woff2$/i, '')}.decoded.${ext}`, out = new Blob([decoded], { type: derivedMimeType });
                    if (oldDerived && !oldDerived.archivedAt) {
                        const replaced = await this.runtime.files.replaceContent(oldDerived.id, out, name, derivedMimeType, ctx);
                        derivedFileId = replaced.id;
                    }
                    else {
                        const created = await this.runtime.files.importBlob(out, name, derivedMimeType, 'APP.NEXUS', [...file.spaceIds], ctx, { tags: ['APPEARANCE.SAFE_DERIVED', 'WOFF2.DECODED', 'DELTA035'], description: `Validated WOFF2 decoded SFNT derivative of ${file.id}` });
                        derivedFileId = created.id;
                    }
                    decoderProvider = safe.decoderProvider || null;
                }
                const row = await this.save(state, { ...base, state: 'SAFE', kind: 'FONT', sanitizedSha256: safe.sanitizedSha256, derivedFileId, derivedMimeType, sourceContainer: safe.sourceContainer || null, container: safe.container, numTables: safe.numTables, glyphs: safe.glyphs, decoderProvider, licenseDeclaration: safe.license.declaration, licenseProofRef: safe.license.proofRef }, ctx);
                return clone(row);
            }
            throw new Error(`Appearance safety MIME unsupported: ${file.mime}`);
        }
        async list(input, ctx) { const rows = (await this.runtime.entities.list()).filter((x) => x.type === 'CORE.APPEARANCE_ASSET_SAFETY_ARTIFACT'), out = []; for (const row of rows) {
            try {
                const read = await this.read({ fileId: row.data?.fileId }, ctx);
                if (input?.state && read.state !== input.state)
                    continue;
                out.push({ ...clone(row), effectiveState: read.state, stale: read.stale, staleReasons: read.reasons });
            }
            catch { }
        } return out; }
    }
    function install(runtime) { const service = new AppearanceAssetSafetyService(runtime); runtime.appearanceAssetSafety = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); const reg = (code, risk, permission, handler) => { if (!existing.has(code))
        runtime.actions.register({ code, ownerApp: 'APP.NEXUS', risk, permission, handler }); }; reg('ACTION.CORE.APPEARANCE.ASSET.SAFETY.VALIDATE', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.validate(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.SAFETY.READ', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.read(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.SAFETY.LIST', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.list(p, c)); return service; }
    NS.artifactId = artifactId;
    NS.AppearanceAssetSafetyService = AppearanceAssetSafetyService;
    NS.install = install;
})(KXAppearanceAssetSafety || (KXAppearanceAssetSafety = {}));
