// N2.5g (user 2026-10-24/25): camera – photo / video / document / scan saved INTO NEXUS as ordinary core files (Explorer, trash with
// restore, rights, revisions, audit) – the same pattern as the dictaphone (N2.1o). Capture happens in the UI (getUserMedia /
// MediaRecorder / canvas); the core validates and stores. Location and camera data (EXIF in JPEG) are REMOVED IN THE CORE by default
// – whatever the source. Name from a pattern, tags (kind, size, duration), optional 📎 link to a record, presets per user.
var KXCamera;
(function () {
    const OWNER = 'APP.KX.NEXUS', PRESETS = 'CORE.CAMERA.PRESETS';
    const KINDS = ['PHOTO', 'VIDEO', 'DOC', 'SCAN'];
    const LIMIT = { PHOTO: 30 * 1024 * 1024, DOC: 30 * 1024 * 1024, SCAN: 30 * 1024 * 1024, VIDEO: 200 * 1024 * 1024 };
    const HARD_VIDEO = 2 * 1024 * 1024 * 1024;
    const MAX_MS = 24 * 3600000;
    const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf' };
    /* JPEG: drop APP1 segments carrying „Exif“ (location, camera, time) – the picture itself is untouched */
    function stripJpegExif(bytes) {
        if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8)
            return { bytes, removed: 0 };
        const out = [0xFF, 0xD8];
        let i = 2, removed = 0;
        while (i + 4 <= bytes.length) {
            if (bytes[i] !== 0xFF)
                break;
            const m = bytes[i + 1];
            if (m === 0xDA || m === 0xD9) {
                for (let k = i; k < bytes.length; k++)
                    out.push(bytes[k]);
                return { bytes: Uint8Array.from(out), removed };
            }
            const len = (bytes[i + 2] << 8) | bytes[i + 3];
            if (len < 2 || i + 2 + len > bytes.length)
                break;
            const isExif = m === 0xE1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66;
            if (isExif)
                removed++;
            else
                for (let k = i; k < i + 2 + len; k++)
                    out.push(bytes[k]);
            i += 2 + len;
        }
        return { bytes, removed: 0 }; /* unknown structure – keep the original */
    }
    const pad = (n) => String(n).padStart(2, '0');
    function fileName(pattern, kind, title, mime, at) {
        const d = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, t = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
        const base = String(pattern || '{title}_{date}_{time}').replace('{title}', (title || kind).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)).replace('{kind}', kind).replace('{date}', d).replace('{time}', t);
        return `${base}.${EXT[mime] || 'bin'}`;
    }
    function install(core) {
        if (core.camera)
            return core.camera;
        const C = (a) => ({ actorId: a, appCode: OWNER, permissions: ['CORE.FILE.IMPORT'], confirmed: true });
        const personal = async (u) => ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
        const svc = { KINDS, stripJpegExif, fileName,
            async save(p, ctx) {
                const blob = p?.blob;
                if (!blob || typeof blob.size !== 'number' || typeof blob.arrayBuffer !== 'function')
                    throw new Error('CAMERA_BLOB_REQUIRED');
                const kind = KINDS.includes(p?.kind) ? p.kind : 'PHOTO';
                const mime = String(p?.mime || blob.type || '').split(';')[0].trim().toLowerCase();
                if (kind === 'VIDEO' ? !mime.startsWith('video/') : !(mime.startsWith('image/') || (kind !== 'PHOTO' && mime === 'application/pdf')))
                    throw new Error('CAMERA_MIME_MISMATCH');
                if (blob.size <= 0)
                    throw new Error('CAMERA_EMPTY');
                const limit = kind === 'VIDEO' ? Math.min(HARD_VIDEO, Number(p?.maxBytes) || LIMIT.VIDEO) : LIMIT[kind];
                if (blob.size > limit)
                    throw new Error(`CAMERA_TOO_LARGE ${Math.round(limit / 1048576)} MB`);
                const ms = p?.durationMs == null ? null : Number(p.durationMs);
                if (kind === 'VIDEO' && (ms == null || !Number.isInteger(ms) || ms < 0 || ms > MAX_MS))
                    throw new Error('CAMERA_DURATION_INVALID');
                let data = blob, exifRemoved = 0;
                if (mime === 'image/jpeg' && p?.stripExif !== false) {
                    const r = stripJpegExif(new Uint8Array(await blob.arrayBuffer()));
                    exifRemoved = r.removed;
                    if (r.removed)
                        data = new Blob([r.bytes], { type: mime });
                }
                const space = p?.spaceId || await personal(ctx.actorId);
                const name = fileName(String(p?.pattern || ''), kind, String(p?.title || '').trim(), mime, p?.at ? new Date(p.at) : new Date());
                const tags = [`kx:${kind.toLowerCase()}`, ...(Number(p?.width) > 0 && Number(p?.height) > 0 ? [`kx:size:${Math.round(p.width)}x${Math.round(p.height)}`] : []), ...(ms != null ? [`kx:duration-ms:${ms}`] : []), ...(exifRemoved ? ['kx:exif-removed'] : []), ...(Array.isArray(p?.tags) ? p.tags.map((t) => String(t).slice(0, 40)) : [])];
                const f = await core.files.importBlob(data, name, mime, OWNER, [space], { ...ctx, permissions: [...(ctx.permissions || []), 'CORE.FILE.IMPORT'] }, { tags, description: String(p?.note || '').slice(0, 500) });
                let link = null;
                if (p?.attachTo && core.links) {
                    link = await core.links.link({ from: String(p.attachTo), to: core.deepLinks.build({ kind: 'FILE', id: f.id }), type: 'DOCUMENT_FOR' }, ctx);
                }
                return { id: f.id, name: f.name, mime: f.mime, size: f.size, kind, exifRemoved, link: link?.id || null };
            },
            async list(p, ctx) {
                const want = p?.kind ? `kx:${String(p.kind).toLowerCase()}` : null;
                const out = [];
                for (const f of await core.files.list()) {
                    if (f.trashedAt || f.archivedAt)
                        continue;
                    const tg = f.tags || [];
                    if (!tg.some((t) => /^kx:(photo|video|doc|scan)$/.test(t)))
                        continue;
                    if (want && !tg.includes(want))
                        continue;
                    try {
                        await core.inspector.inspect({ kind: 'FILE', id: f.id }, ctx.actorId);
                    }
                    catch {
                        continue;
                    }
                    out.push({ id: f.id, name: f.name, mime: f.mime, size: f.size, tags: tg, createdAt: f.createdAt });
                }
                return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
            },
            /* presets per user (device-specific values stay in the preset; the UI matches the device) */
            async presets(_p, ctx) { const r = await core.entities.get(`${PRESETS}.${ctx.actorId}`).catch(() => null); return r?.data?.items || []; },
            async savePreset(p, ctx) {
                const id = `${PRESETS}.${ctx.actorId}`;
                const old = await core.entities.get(id).catch(() => null);
                const items = (old?.data?.items || []).filter((x) => x.name !== String(p?.name || ''));
                const name = String(p?.name || '').trim().slice(0, 60);
                if (!name)
                    throw new Error('CAMERA_PRESET_NAME');
                const num = (v, a, b) => v == null || v === '' ? undefined : Math.min(b, Math.max(a, Number(v)));
                items.push({ name, kind: KINDS.includes(p?.kind) ? p.kind : 'PHOTO', deviceLabel: String(p?.deviceLabel || '').slice(0, 120), facing: ['user', 'environment'].includes(p?.facing) ? p.facing : undefined, width: num(p?.width, 160, 7680), height: num(p?.height, 120, 4320), fps: num(p?.fps, 1, 120),
                    format: EXT[String(p?.format || '')] ? p.format : undefined, quality: num(p?.quality, 0.1, 1), bitrate: num(p?.bitrate, 100000, 50000000), audio: p?.audio !== false, stripExif: p?.stripExif !== false, grid: !!p?.grid, timer: num(p?.timer, 0, 30), zoom: num(p?.zoom, 1, 20), torch: !!p?.torch, pattern: String(p?.pattern || '').slice(0, 80) || undefined });
                const sp = await personal(ctx.actorId);
                await core.entities.save({ id, type: PRESETS, ownerApp: OWNER, schema: 'KX.CAMERA_PRESETS/1', spaceIds: [sp], expectedRevision: old?.revision, data: { items: items.slice(-30) } }, { ...ctx, appCode: OWNER });
                return items;
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.CAMERA.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c));
        reg('ACTION.CORE.CAMERA.LIST', 'READ', (p, c) => svc.list(p, c));
        reg('ACTION.CORE.CAMERA.PRESETS', 'READ', (p, c) => svc.presets(p, c));
        reg('ACTION.CORE.CAMERA.PRESET.SAVE', 'SAFE_WRITE', (p, c) => svc.savePreset(p, c));
        core.camera = svc;
        return svc;
    }
    KXCamera = { install, stripJpegExif, fileName, KINDS };
    globalThis.KXCamera = KXCamera;
})();
