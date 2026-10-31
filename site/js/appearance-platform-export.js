var KXAppearancePlatformExport;
(function (NS) {
    const contract = () => KX_APPEARANCE_PLATFORM_EXPORT_CONTRACT || {};
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const now = () => new Date().toISOString();
    const uniq = (xs) => [...new Set((xs || []).map(x => String(x || '')).filter(Boolean))];
    const text = (v, max, name) => { const s = String(v ?? '').trim(); if (s.length > max)
        throw new Error(`${name} exceeds ${max} chars`); return s; };
    const exportId = () => `APPEARANCE_PLATFORM_EXPORT.${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
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
    async function digestBlob(blob) { return digestBytes(new Uint8Array(await blob.arrayBuffer())); }
    function be32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
    function le16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
    function le32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
    async function icoBlob(items) { const parts = await Promise.all(items.map(async (x) => ({ size: x.size, bytes: new Uint8Array(await x.blob.arrayBuffer()) }))), head = new Uint8Array(6); head.set(le16(0), 0); head.set(le16(1), 2); head.set(le16(parts.length), 4); const dirs = new Uint8Array(parts.length * 16); let offset = 6 + dirs.length; for (let i = 0; i < parts.length; i++) {
        const p = parts[i], o = i * 16, s = p.size === 256 ? 0 : p.size;
        dirs[o] = s;
        dirs[o + 1] = s;
        dirs[o + 2] = 0;
        dirs[o + 3] = 0;
        dirs.set(le16(1), o + 4);
        dirs.set(le16(32), o + 6);
        dirs.set(le32(p.bytes.length), o + 8);
        dirs.set(le32(offset), o + 12);
        offset += p.bytes.length;
    } return new Blob([head, dirs, ...parts.map(x => x.bytes)], { type: 'image/x-icon' }); }
    const icnsType = (size) => ({ 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' }[size]);
    async function icnsBlob(items) { const chunks = []; let total = 8; for (const x of items) {
        const type = icnsType(x.size);
        if (!type)
            continue;
        const bytes = new Uint8Array(await x.blob.arrayBuffer()), head = new Uint8Array(8);
        for (let i = 0; i < 4; i++)
            head[i] = type.charCodeAt(i);
        head.set(be32(bytes.length + 8), 4);
        chunks.push(head, bytes);
        total += bytes.length + 8;
    } const head = new Uint8Array(8); head.set([105, 99, 110, 115], 0); head.set(be32(total), 4); return new Blob([head, ...chunks], { type: 'image/icns' }); }
    class BrowserPlatformIconRenderer {
        async renderPng(blob, size, mode = 'CONTAIN') {
            if (typeof createImageBitmap !== 'function')
                throw new Error('PLATFORM_EXPORT_RENDERER_UNAVAILABLE:createImageBitmap');
            const bitmap = await createImageBitmap(blob);
            try {
                let canvas;
                if (typeof OffscreenCanvas !== 'undefined')
                    canvas = new OffscreenCanvas(size, size);
                else if (typeof document !== 'undefined') {
                    canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                }
                else
                    throw new Error('PLATFORM_EXPORT_RENDERER_UNAVAILABLE:canvas');
                const g = canvas.getContext('2d');
                if (!g)
                    throw new Error('PLATFORM_EXPORT_RENDERER_UNAVAILABLE:2d');
                g.clearRect(0, 0, size, size);
                const sw = Number(bitmap.width || size), sh = Number(bitmap.height || size), scale = mode === 'COVER' ? Math.max(size / sw, size / sh) : Math.min(size / sw, size / sh), dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale)), dx = Math.round((size - dw) / 2), dy = Math.round((size - dh) / 2);
                g.drawImage(bitmap, dx, dy, dw, dh);
                let out;
                if (typeof canvas.convertToBlob === 'function')
                    out = await canvas.convertToBlob({ type: 'image/png' });
                else
                    out = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('PNG encode failed')), 'image/png'));
                if (out.type !== 'image/png' || !out.size)
                    throw new Error('PLATFORM_EXPORT_PNG_ENCODE_FAILED');
                return out;
            }
            finally {
                bitmap.close?.();
            }
        }
    }
    class AppearancePlatformExportService {
        runtime;
        renderer;
        contract = 'KX.APPEARANCE_PLATFORM_EXPORT/1';
        constructor(runtime, renderer = new BrowserPlatformIconRenderer()) {
            this.runtime = runtime;
            this.renderer = renderer;
        }
        actor(ctx) { const actor = String(ctx?.actorId || '').trim(); if (!actor)
            throw new Error('Platform export actor required'); return actor; }
        platform(input) { const p = String(input?.platform || '').toUpperCase(); if (!contract().platforms?.[p])
            throw new Error(`Unsupported platform export ${p}`); return p; }
        async profileSource(platform, input, ctx) { const explicit = {}; if (platform === 'ANDROID') {
            if (input?.foregroundFileId)
                explicit.foreground = String(input.foregroundFileId);
            if (input?.backgroundFileId)
                explicit.background = String(input.backgroundFileId);
            if (explicit.foreground || explicit.background) {
                if (!explicit.foreground || !explicit.background)
                    throw new Error('Android export requires foregroundFileId + backgroundFileId');
                return { mode: 'EXPLICIT', refs: explicit };
            }
        }
        else if (input?.fileId)
            return { mode: 'EXPLICIT', refs: { primary: String(input.fileId) } }; const svc = this.runtime.appearanceAssets; if (!svc)
            throw new Error('Appearance Asset Profile service unavailable'); const read = await svc.read({ userId: String(input?.userId || this.actor(ctx)), workspaceId: input?.workspaceId }, ctx), code = contract().platforms[platform].profileCode, value = read.profile?.platformAppIcons?.[code]; if (!value)
            throw new Error(`Platform icon profile ${code} is not configured`); if (platform === 'ANDROID')
            return { mode: 'PROFILE', refs: { foreground: value.foreground?.locator, background: value.background?.locator }, profileCode: code }; return { mode: 'PROFILE', refs: { primary: value.locator }, profileCode: code }; }
        async source(fileId, label, ctx) { const id = String(fileId || ''); if (!id)
            throw new Error(`Platform export ${label} FILE.ID required`); const ingestion = this.runtime.appearanceAssetIngestion; if (!ingestion)
            throw new Error('Appearance Asset Ingestion unavailable'); const verified = await ingestion.ref({ fileId: id, assetCode: `ASSET.PLATFORM_EXPORT.${label}`, status: 'APPROVED' }, ctx), file = await this.runtime.files.get(id); if (!file || file.archivedAt)
            throw new Error(`Platform export source missing: ${id}`); if (file.size > Number(contract().limits?.maxSourceBytes || 33554432))
            throw new Error('Platform export source exceeds byte limit'); let renderFileId = verified.derivedFileId || id, renderFile = await this.runtime.files.get(renderFileId); if (!renderFile || renderFile.archivedAt)
            throw new Error(`Platform export render source missing: ${renderFileId}`); const blob = await this.runtime.files.getBlob(renderFileId); if (!blob)
            throw new Error(`Platform export render bytes unavailable: ${renderFileId}`); const actual = await digestBlob(blob); if (actual !== renderFile.sha256)
            throw new Error(`Platform export render SHA mismatch: ${renderFileId}`); return { label, fileId: file.id, fileRevision: file.revision, contentRevision: file.contentRevision, sha256: file.sha256, mimeType: file.mime, size: file.size, name: file.name, spaceIds: [...(file.spaceIds || [])], descriptorId: verified.descriptorId, safetyArtifactId: verified.safetyArtifactId || null, renderFileId, renderContentRevision: renderFile.contentRevision, renderSha256: renderFile.sha256, renderMimeType: renderFile.mime, blob }; }
        async sources(platform, input, ctx) { const selected = await this.profileSource(platform, input, ctx), out = { mode: selected.mode, profileCode: selected.profileCode || null }; if (platform === 'ANDROID') {
            out.foreground = await this.source(selected.refs.foreground, 'ANDROID.FOREGROUND', ctx);
            out.background = await this.source(selected.refs.background, 'ANDROID.BACKGROUND', ctx);
        }
        else
            out.primary = await this.source(selected.refs.primary, platform, ctx); return out; }
        outputSpaces(sources) { const rows = [sources.primary, sources.foreground, sources.background].filter(Boolean); return uniq(rows.flatMap((x) => x.spaceIds || [])); }
        async plan(input, ctx) { const platform = this.platform(input), cfg = contract().platforms[platform], sources = await this.sources(platform, input, ctx), base = text(input?.name || 'KalinumX-AppIcon', 120, 'export name') || 'KalinumX-AppIcon'; let outputs = []; if (platform === 'WINDOWS') {
            outputs = [...cfg.sizes.map((s) => ({ path: `windows/png/app-${s}.png`, mime: 'image/png', size: s, kind: 'RASTER' })), { path: 'windows/app.ico', mime: 'image/x-icon', kind: 'ICO' }, { path: 'windows/manifest.json', mime: 'application/json', kind: 'MANIFEST' }];
        }
        else if (platform === 'MACOS') {
            outputs = [...cfg.sizes.map((s) => ({ path: `macos/AppIcon.appiconset/icon_${s}x${s}.png`, mime: 'image/png', size: s, kind: 'RASTER' })), { path: 'macos/AppIcon.appiconset/Contents.json', mime: 'application/json', kind: 'ASSET_CATALOG' }, { path: 'macos/AppIcon.icns', mime: 'image/icns', kind: 'ICNS' }, { path: 'macos/manifest.json', mime: 'application/json', kind: 'MANIFEST' }];
        }
        else {
            const density = { 48: 'mdpi', 72: 'hdpi', 96: 'xhdpi', 144: 'xxhdpi', 192: 'xxxhdpi', 512: 'play' };
            for (const s of cfg.sizes) {
                const d = density[s];
                outputs.push({ path: `android/mipmap-${d}/ic_launcher_foreground.png`, mime: 'image/png', size: s, kind: 'FOREGROUND' }, { path: `android/mipmap-${d}/ic_launcher_background.png`, mime: 'image/png', size: s, kind: 'BACKGROUND' });
            }
            outputs.push({ path: 'android/mipmap-anydpi-v26/ic_launcher.xml', mime: 'application/xml', kind: 'ADAPTIVE_XML' }, { path: 'android/manifest.json', mime: 'application/json', kind: 'MANIFEST' });
        } return { contract: this.contract, platform, name: base, sourceMode: sources.mode, profileCode: sources.profileCode, sourceBindings: this.publicSources(sources), outputSpaces: this.outputSpaces(sources), outputs, releaseClaims: { signedInstallerBuild: false, signingNotarization: false, packageClaim: 'UNSIGNED_APP_ICON_ARTIFACTS_ONLY' } }; }
        publicSources(s) { const pick = (x) => x ? { label: x.label, fileId: x.fileId, fileRevision: x.fileRevision, contentRevision: x.contentRevision, sha256: x.sha256, mimeType: x.mimeType, size: x.size, descriptorId: x.descriptorId, safetyArtifactId: x.safetyArtifactId, renderFileId: x.renderFileId, renderContentRevision: x.renderContentRevision, renderSha256: x.renderSha256, renderMimeType: x.renderMimeType } : null; return { primary: pick(s.primary), foreground: pick(s.foreground), background: pick(s.background) }; }
        async persist(blob, name, mime, spaces, platform, id, ctx, kind) { const row = await this.runtime.files.importBlob(blob, name, mime, 'APP.NEXUS', spaces, ctx, { tags: ['appearance-platform-export', `platform:${platform.toLowerCase()}`, `export:${id}`, `kind:${kind.toLowerCase()}`], description: `Derived Appearance platform export ${platform} · ${kind} · ${id}` }); return { fileId: row.id, name: row.name, mimeType: row.mime, size: row.size, sha256: row.sha256, contentRevision: row.contentRevision, kind }; }
        async renderSet(source, sizes, mode = 'CONTAIN') { const out = []; for (const size of sizes) {
            const blob = await this.renderer.renderPng(source.blob, size, mode);
            if (blob.type !== 'image/png' || !blob.size)
                throw new Error(`Platform export renderer invalid PNG ${size}`);
            out.push({ size, blob, sha256: await digestBlob(blob) });
        } return out; }
        async export(input, ctx) { if (!ctx?.confirmed)
            throw new Error('Platform export requires explicit confirmation'); const platform = this.platform(input), plan = await this.plan(input, ctx), sources = await this.sources(platform, input, ctx), id = exportId(), spaces = this.outputSpaces(sources), cfg = contract().platforms[platform], createdAt = now(), outputs = []; let manifestPayload = { schema: 'KX.APPEARANCE_PLATFORM_EXPORT_MANIFEST/1', exportId: id, platform, name: plan.name, createdAt, createdBy: this.actor(ctx), sourceMode: plan.sourceMode, profileCode: plan.profileCode, sourceBindings: plan.sourceBindings, releaseClaims: plan.releaseClaims, outputs: [] }; if (platform === 'WINDOWS') {
            const pngs = await this.renderSet(sources.primary, cfg.sizes, 'CONTAIN');
            for (const p of pngs)
                outputs.push(await this.persist(p.blob, `windows/png/app-${p.size}.png`, 'image/png', spaces, platform, id, ctx, 'RASTER'));
            const ico = await icoBlob(pngs);
            outputs.push(await this.persist(ico, 'windows/app.ico', 'image/x-icon', spaces, platform, id, ctx, 'ICO'));
        }
        else if (platform === 'MACOS') {
            const pngs = await this.renderSet(sources.primary, cfg.sizes, 'CONTAIN');
            for (const p of pngs)
                outputs.push(await this.persist(p.blob, `macos/AppIcon.appiconset/icon_${p.size}x${p.size}.png`, 'image/png', spaces, platform, id, ctx, 'RASTER'));
            const contents = { images: cfg.sizes.map((s) => ({ filename: `icon_${s}x${s}.png`, idiom: 'mac', scale: '1x', size: `${s}x${s}` })), info: { author: 'KalinumX NEXUS', version: 1 } };
            outputs.push(await this.persist(new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' }), 'macos/AppIcon.appiconset/Contents.json', 'application/json', spaces, platform, id, ctx, 'ASSET_CATALOG'));
            const icns = await icnsBlob(pngs);
            outputs.push(await this.persist(icns, 'macos/AppIcon.icns', 'image/icns', spaces, platform, id, ctx, 'ICNS'));
        }
        else {
            const fg = await this.renderSet(sources.foreground, cfg.sizes, 'CONTAIN'), bg = await this.renderSet(sources.background, cfg.sizes, 'COVER'), density = { 48: 'mdpi', 72: 'hdpi', 96: 'xhdpi', 144: 'xxhdpi', 192: 'xxxhdpi', 512: 'play' };
            for (let i = 0; i < cfg.sizes.length; i++) {
                const s = cfg.sizes[i], d = density[s];
                outputs.push(await this.persist(fg[i].blob, `android/mipmap-${d}/ic_launcher_foreground.png`, 'image/png', spaces, platform, id, ctx, 'FOREGROUND'));
                outputs.push(await this.persist(bg[i].blob, `android/mipmap-${d}/ic_launcher_background.png`, 'image/png', spaces, platform, id, ctx, 'BACKGROUND'));
            }
            const xml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@mipmap/ic_launcher_background" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`;
            outputs.push(await this.persist(new Blob([xml], { type: 'application/xml' }), 'android/mipmap-anydpi-v26/ic_launcher.xml', 'application/xml', spaces, platform, id, ctx, 'ADAPTIVE_XML'));
        } manifestPayload.outputs = outputs.map(clone); const manifestBlob = new Blob([JSON.stringify(manifestPayload, null, 2)], { type: 'application/json' }), manifestFile = await this.persist(manifestBlob, `${platform.toLowerCase()}/manifest.json`, 'application/json', spaces, platform, id, ctx, 'MANIFEST'); const data = { ...manifestPayload, outputs, manifestFile, status: 'EXPORTED', updatedAt: createdAt }; return this.runtime.entities.save({ id, type: contract().entityType, ownerApp: 'APP.NEXUS', schema: contract().entitySchema, spaceIds: spaces, data }, ctx); }
        async owned(id, ctx) { const row = await this.runtime.entities.get(String(id || '')); if (!row || row.type !== contract().entityType)
            throw new Error(`Platform export ${id} not found`); const actor = this.actor(ctx), d = row.data || {}; if (actor !== 'SYSTEM' && d.createdBy !== actor && !ctx.permissions?.includes('CORE.APPEARANCE.ASSET.MANAGE'))
            throw new Error('Platform export access denied'); return row; }
        async get(input, ctx) { const row = await this.owned(input?.id, ctx); return clone(row); }
        async list(input, ctx) { const actor = this.actor(ctx), limit = Math.max(1, Math.min(Number(contract().limits?.maxListItems || 100), Number(input?.limit || 30))), platform = String(input?.platform || '').toUpperCase(), rows = (await this.runtime.entities.list()).filter((x) => x.type === contract().entityType && !x.archivedAt).filter((x) => actor === 'SYSTEM' || x.data?.createdBy === actor || ctx.permissions?.includes('CORE.APPEARANCE.ASSET.MANAGE')).filter((x) => !platform || x.data?.platform === platform).sort((a, b) => String(b.data?.createdAt || '').localeCompare(String(a.data?.createdAt || ''))).slice(0, limit); return { contract: this.contract, items: clone(rows), total: rows.length, limit }; }
        async verify(input, ctx) { const row = await this.owned(input?.id, ctx), d = row.data || {}, reasons = []; const checkSource = async (s) => { if (!s)
            return; const f = await this.runtime.files.get(s.fileId); if (!f || f.archivedAt) {
            reasons.push(`SOURCE_MISSING:${s.fileId}`);
            return;
        } for (const k of ['contentRevision', 'sha256', 'mimeType', 'size']) {
            const actual = k === 'mimeType' ? f.mime : f[k];
            if (actual !== s[k])
                reasons.push(`SOURCE_${String(k).toUpperCase()}_MISMATCH:${s.fileId}`);
        } }; await checkSource(d.sourceBindings?.primary); await checkSource(d.sourceBindings?.foreground); await checkSource(d.sourceBindings?.background); for (const o of [...(d.outputs || []), d.manifestFile].filter(Boolean)) {
            const f = await this.runtime.files.get(o.fileId);
            if (!f || f.archivedAt) {
                reasons.push(`OUTPUT_MISSING:${o.fileId}`);
                continue;
            }
            if (f.contentRevision !== o.contentRevision || f.sha256 !== o.sha256 || f.mime !== o.mimeType || f.size !== o.size) {
                reasons.push(`OUTPUT_RECORD_MISMATCH:${o.fileId}`);
                continue;
            }
            const b = await this.runtime.files.getBlob(o.fileId);
            if (!b || await digestBlob(b) !== o.sha256)
                reasons.push(`OUTPUT_BYTES_MISMATCH:${o.fileId}`);
        } return { contract: this.contract, exportId: row.id, platform: d.platform, valid: reasons.length === 0, status: reasons.length ? 'STALE' : 'EXPORTED', reasons, checkedOutputs: (d.outputs || []).length + 1, releaseClaims: clone(d.releaseClaims) }; }
    }
    function install(runtime, renderer) { if (!runtime.appearanceAssetIngestion)
        throw new Error('Appearance Asset Ingestion must be installed before Platform Export'); const service = new AppearancePlatformExportService(runtime, renderer); runtime.appearancePlatformExport = service; const existing = new Set(runtime.actions.list().map((x) => x.code)), reg = (code, risk, permission, handler) => { if (!existing.has(code)) {
        runtime.actions.register({ code, ownerApp: 'APP.NEXUS', risk, permission, handler });
        existing.add(code);
    } }; reg('ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.PLAN', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.plan(p, c)); reg('ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.EXPORT', 'SENSITIVE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.export(p, c)); reg('ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.GET', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.get(p, c)); reg('ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.LIST', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.list(p, c)); reg('ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.VERIFY', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.verify(p, c)); return service; }
    NS.contract = contract;
    NS.BrowserPlatformIconRenderer = BrowserPlatformIconRenderer;
    NS.AppearancePlatformExportService = AppearancePlatformExportService;
    NS.icoBlob = icoBlob;
    NS.icnsBlob = icnsBlob;
    NS.install = install;
})(KXAppearancePlatformExport || (KXAppearancePlatformExport = {}));
