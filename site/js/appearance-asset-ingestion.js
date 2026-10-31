var KXAppearanceAssetIngestion;
(function (NS) {
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    const contract = () => KX_APPEARANCE_ASSET_INGESTION_CONTRACT || {};
    const imageMime = () => new Set(contract().imageMime || []), fontMime = () => new Set(contract().fontMime || []), previewMime = () => new Set(contract().rasterPreviewMime || []);
    const thumbConfig = () => contract().thumbnailCache || {};
    const libraryConfig = () => contract().library || {};
    const metadataConfig = () => libraryConfig().metadata || {};
    const deviceConfig = () => thumbConfig().device || {};
    const thumbSizes = () => new Set((thumbConfig().sizes || [64, 96, 128, 256]).map((x) => Number(x)));
    const extMap = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/svg+xml': ['svg'], 'font/woff2': ['woff2'], 'font/woff': ['woff'], 'font/ttf': ['ttf'], 'font/otf': ['otf'] };
    const extension = (name) => { const m = /\.([^.]+)$/.exec(String(name || '').toLowerCase()); return m ? m[1] : ''; };
    const text = (v, max, name) => { const s = String(v ?? '').trim(); if (s.length > max)
        throw new Error(`${name} exceeds ${max} chars`); return s; };
    const iso = () => new Date().toISOString();
    async function digest(blob) { const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    function pngDimensions(bytes) { if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47)
        return null; const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return { width: v.getUint32(16, false), height: v.getUint32(20, false) }; }
    function jpegDimensions(bytes) { if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
        return null; let i = 2; while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
            i++;
            continue;
        }
        const marker = bytes[i + 1];
        if (marker === 0xd8 || marker === 0xd9) {
            i += 2;
            continue;
        }
        if (i + 4 > bytes.length)
            break;
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (len < 2 || i + 2 + len > bytes.length)
            break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
            return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
        i += 2 + len;
    } return null; }
    function webpDimensions(bytes) { if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP')
        return null; const kind = String.fromCharCode(...bytes.slice(12, 16)); if (kind === 'VP8X')
        return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }; return null; }
    function rasterDimensions(mime, bytes) { if (mime === 'image/png')
        return pngDimensions(bytes); if (mime === 'image/jpeg')
        return jpegDimensions(bytes); if (mime === 'image/webp')
        return webpDimensions(bytes); return null; }
    function descriptorId(fileId) { return `APPEARANCE_ASSET_DESCRIPTOR.${String(fileId).replace(/[^A-Za-z0-9_.-]/g, '_')}`; }
    function safeEntityPart(value) { return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 180); }
    function metadataEntityId(actorId, fileId) { return `APPEARANCE_ASSET_METADATA.${safeEntityPart(actorId)}.${safeEntityPart(fileId)}`; }
    function collectionEntityId(actorId, seed) { return `APPEARANCE_ASSET_COLLECTION.${safeEntityPart(actorId)}.${safeEntityPart(seed)}`; }
    function normalizedLabels(value, maxCount, maxChars, label) { if (!Array.isArray(value))
        throw new Error(`${label} must be an array`); const out = [], seen = new Set(); for (const raw of value) {
        const v = text(raw, maxChars, label).replace(/\s+/g, ' ').trim();
        if (!v)
            continue;
        if (/[\u0000-\u001f\u007f]/.test(v))
            throw new Error(`${label} contains control characters`);
        const key = v.toLocaleLowerCase('cs');
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(v);
        if (out.length > maxCount)
            throw new Error(`${label} exceeds ${maxCount} items`);
    } return out; }
    class MemoryThumbnailDeviceCacheStore {
        persistent;
        mode;
        rows = new Map();
        constructor(persistent = false, mode) {
            this.persistent = persistent;
            this.mode = mode || (persistent ? 'MEMORY_TEST_PERSISTENT' : 'MEMORY_FALLBACK');
        }
        async get(key) { return this.rows.get(key); }
        async put(row) { this.rows.set(row.key, row); }
        async all() { return [...this.rows.values()]; }
        async del(key) { this.rows.delete(key); }
        async clear() { this.rows.clear(); }
    }
    class IndexedDbThumbnailDeviceCacheStore {
        dbName;
        mode = 'INDEXED_DB_DERIVED';
        persistent = true;
        db;
        constructor(dbName = 'KalinumXNexusAppearanceDerivedCache') {
            this.dbName = dbName;
        }
        async open() { if (this.db)
            return this.db; if (typeof indexedDB === 'undefined')
            throw new Error('APPEARANCE_DEVICE_CACHE_INDEXED_DB_UNAVAILABLE'); this.db = await new Promise((resolve, reject) => { const req = indexedDB.open(this.dbName, 1); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('thumbnailEntries'))
            db.createObjectStore('thumbnailEntries', { keyPath: 'key' }); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); return this.db; }
        async get(key) { const db = await this.open(); return await new Promise((resolve, reject) => { const tx = db.transaction('thumbnailEntries', 'readonly'), r = tx.objectStore('thumbnailEntries').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
        async put(row) { const db = await this.open(); await new Promise((resolve, reject) => { const tx = db.transaction('thumbnailEntries', 'readwrite'); tx.objectStore('thumbnailEntries').put(row); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('APPEARANCE_DEVICE_CACHE_TX_ABORTED')); }); }
        async all() { const db = await this.open(); return await new Promise((resolve, reject) => { const tx = db.transaction('thumbnailEntries', 'readonly'), r = tx.objectStore('thumbnailEntries').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
        async del(key) { const db = await this.open(); await new Promise((resolve, reject) => { const tx = db.transaction('thumbnailEntries', 'readwrite'); tx.objectStore('thumbnailEntries').delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('APPEARANCE_DEVICE_CACHE_TX_ABORTED')); }); }
        async clear() { const db = await this.open(); await new Promise((resolve, reject) => { const tx = db.transaction('thumbnailEntries', 'readwrite'); tx.objectStore('thumbnailEntries').clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('APPEARANCE_DEVICE_CACHE_TX_ABORTED')); }); }
    }
    function defaultDeviceStore() { return typeof indexedDB !== 'undefined' ? new IndexedDbThumbnailDeviceCacheStore() : new MemoryThumbnailDeviceCacheStore(false); }
    class AppearanceAssetIngestionService {
        runtime;
        deviceStore;
        libraryIndex;
        contract = 'KX.APPEARANCE_ASSET_INGESTION/1';
        previews = new Map();
        thumbnails = new Map();
        thumbnailBytes = 0;
        deviceCacheLastError;
        constructor(runtime, deviceStore = defaultDeviceStore(), libraryIndex = (typeof KXAppearanceAssetLibraryIndex !== 'undefined' && KXAppearanceAssetLibraryIndex?.createDefaultProvider) ? KXAppearanceAssetLibraryIndex.createDefaultProvider(runtime) : null) {
            this.runtime = runtime;
            this.deviceStore = deviceStore;
            this.libraryIndex = libraryIndex;
        }
        async file(fileId) { const row = await this.runtime.files.get(String(fileId || '')); if (!row || row.archivedAt)
            throw new Error(`Unknown/archived FILE.ID ${fileId}`); return row; }
        async assertRead(row, ctx) { if (ctx?.actorId === 'SYSTEM')
            return; if (!ctx?.actorId)
            throw new Error('Appearance asset actor required'); if (!await this.runtime.access.can(this.runtime.access.file(row), ctx.actorId, 'READ'))
            throw new Error(`Appearance asset FILE READ denied: ${row.id}`); }
        actorScope(ctx) { const id = String(ctx?.actorId || '').trim(); if (!id)
            throw new Error('Appearance asset actor required'); return id; }
        deviceEnabled() { return deviceConfig().enabled !== false && this.deviceStore.persistent === true; }
        usage(mime) { if (imageMime().has(mime))
            return 'IMAGE'; if (fontMime().has(mime))
            return 'FONT'; throw new Error(`Unsupported Appearance asset MIME ${mime}`); }
        validateNameMime(name, mime) { const ext = extension(name), allowed = extMap[mime] || []; if (!ext || !allowed.includes(ext))
            throw new Error(`Appearance asset extension/MIME mismatch: .${ext || '?'} vs ${mime}`); return ext; }
        async inspect(input, ctx) { const row = await this.file(input.fileId); await this.assertRead(row, ctx); const usage = this.usage(row.mime), ext = this.validateNameMime(row.name, row.mime); if (row.size < 1 || row.size > Number(contract().maxBytes || 67108864))
            throw new Error('Appearance asset size out of range'); const blob = await this.runtime.files.getBlob(row.id); if (!blob)
            throw new Error(`Appearance asset bytes unavailable: ${row.id}`); if (blob.size !== row.size)
            throw new Error('Appearance asset byte size mismatch'); const sha256 = await digest(blob); if (sha256 !== row.sha256)
            throw new Error('Appearance asset SHA-256 mismatch'); const bytes = new Uint8Array(await blob.arrayBuffer()); const dims = rasterDimensions(row.mime, bytes); if (previewMime().has(row.mime) && (!dims || dims.width < 1 || dims.height < 1 || dims.width > 16384 || dims.height > 16384))
            throw new Error(`Invalid/unsupported raster dimensions for ${row.mime}`); return { contract: this.contract, fileId: row.id, fileRevision: row.revision, contentRevision: row.contentRevision, name: row.name, mimeType: row.mime, extension: ext, size: row.size, sha256, usage, width: dims?.width, height: dims?.height, spaceIds: [...row.spaceIds], ownerApp: row.ownerApp, validatedAt: iso(), safetyStage: usage === 'FONT' || row.mime === 'image/svg+xml' ? 'DELTA028_REQUIRED' : 'RASTER_FOUNDATION_VALIDATED' }; }
        async register(input, ctx) { const inspected = await this.inspect(input, ctx), id = descriptorId(inspected.fileId), old = await this.runtime.entities.get(id); const provenance = text(input.provenance || 'USER_IMPORT', 160, 'provenance'), license = text(input.license || 'UNSPECIFIED', 240, 'license'), source = text(input.source || inspected.name, 512, 'source'); const data = { ...inspected, provenance, license, source, status: 'VALID', registeredAt: iso(), registeredBy: ctx.actorId }; const row = await this.runtime.entities.save({ id, type: 'CORE.APPEARANCE_ASSET_DESCRIPTOR', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_ASSET_DESCRIPTOR/1', spaceIds: inspected.spaceIds, data, expectedRevision: old?.revision }, ctx); await this.invalidateThumbnails(inspected.fileId); return clone(row); }
        async descriptor(fileId) { const row = await this.runtime.entities.get(descriptorId(fileId)); if (!row || row.type !== 'CORE.APPEARANCE_ASSET_DESCRIPTOR')
            throw new Error(`Appearance asset descriptor not registered: ${fileId}`); return row; }
        async freshness(fileId, ctx) { const d = await this.descriptor(fileId), f = await this.file(fileId); await this.assertRead(f, ctx); const data = d.data || {}, stale = data.contentRevision !== f.contentRevision || data.sha256 !== f.sha256 || data.mimeType !== f.mime; return { descriptor: d, file: f, stale, reasons: [...(data.contentRevision !== f.contentRevision ? ['CONTENT_REVISION'] : []), ...(data.sha256 !== f.sha256 ? ['SHA256'] : []), ...(data.mimeType !== f.mime ? ['MIME'] : [])] }; }
        async list(input, ctx) { const rows = (await this.runtime.entities.list()).filter((x) => x.type === 'CORE.APPEARANCE_ASSET_DESCRIPTOR'), out = []; for (const row of rows) {
            const file = await this.runtime.files.get(row.data?.fileId);
            if (!file || file.archivedAt)
                continue;
            try {
                await this.assertRead(file, ctx);
            }
            catch {
                continue;
            }
            const data = row.data || {}, stale = data.contentRevision !== file.contentRevision || data.sha256 !== file.sha256 || data.mimeType !== file.mime;
            if (input?.usage && data.usage !== input.usage)
                continue;
            out.push({ id: row.id, revision: row.revision, ...clone(data), stale });
        } return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs')); }
        metadataDefaults(actorId, fileId) { return { schema: 'KX.APPEARANCE_ASSET_METADATA/1', ownerActorId: actorId, fileId, categories: [], tags: [], favorite: false, collectionIds: [] }; }
        async visibleAsset(fileId, ctx) { const descriptor = await this.descriptor(fileId), file = await this.file(fileId); await this.assertRead(file, ctx); return { descriptor, file }; }
        async actorMetadataRows(actorId) { return (await this.runtime.entities.list()).filter((x) => x.type === 'CORE.APPEARANCE_ASSET_METADATA' && !x.archivedAt && x.data?.ownerActorId === actorId); }
        async actorCollectionRows(actorId) { return (await this.runtime.entities.list()).filter((x) => x.type === 'CORE.APPEARANCE_ASSET_COLLECTION' && !x.archivedAt && x.data?.ownerActorId === actorId && x.data?.status !== 'ARCHIVED'); }
        metadataData(row, actorId, fileId) { const base = this.metadataDefaults(actorId, fileId), d = row?.data || {}; return { ...base, categories: Array.isArray(d.categories) ? [...d.categories] : [], tags: Array.isArray(d.tags) ? [...d.tags] : [], favorite: !!d.favorite, collectionIds: Array.isArray(d.collectionIds) ? [...d.collectionIds] : [], updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || null }; }
        async validateCollectionIds(ids, actorId) { const cfg = metadataConfig(), max = Math.max(1, Number(cfg.maxCollectionsPerAsset || 16)), uniq = [...new Set(ids.map(x => String(x || '').trim()).filter(Boolean))]; if (uniq.length > max)
            throw new Error(`collectionIds exceeds ${max} items`); for (const id of uniq) {
            const row = await this.runtime.entities.get(id), d = row?.data || {};
            if (!row || row.type !== 'CORE.APPEARANCE_ASSET_COLLECTION' || row.archivedAt || d.status === 'ARCHIVED' || d.ownerActorId !== actorId)
                throw new Error(`Unknown/foreign Appearance collection ${id}`);
        } return uniq; }
        async metadataGet(input, ctx) { const fileId = String(input?.fileId || '').trim(), actorId = this.actorScope(ctx); await this.visibleAsset(fileId, ctx); const row = await this.runtime.entities.get(metadataEntityId(actorId, fileId)); if (row && row.type !== 'CORE.APPEARANCE_ASSET_METADATA')
            throw new Error(`Appearance metadata id collision ${row.id}`); return { contract: this.contract, id: row?.id || metadataEntityId(actorId, fileId), revision: row?.revision || 0, ...this.metadataData(row, actorId, fileId) }; }
        async metadataPatch(input, ctx) { const fileId = String(input?.fileId || '').trim(), actorId = this.actorScope(ctx), cfg = metadataConfig(); const vis = await this.visibleAsset(fileId, ctx), id = metadataEntityId(actorId, fileId), old = await this.runtime.entities.get(id); if (old && old.type !== 'CORE.APPEARANCE_ASSET_METADATA')
            throw new Error(`Appearance metadata id collision ${id}`); const prev = this.metadataData(old, actorId, fileId), maxCats = Math.max(1, Number(cfg.maxCategories || 8)), maxTags = Math.max(1, Number(cfg.maxTags || 32)), labelMax = Math.max(8, Number(cfg.labelMaxChars || 48)); const categories = input?.categories === undefined ? prev.categories : normalizedLabels(input.categories, maxCats, labelMax, 'categories'), tags = input?.tags === undefined ? prev.tags : normalizedLabels(input.tags, maxTags, labelMax, 'tags'); if (input?.favorite !== undefined && typeof input.favorite !== 'boolean')
            throw new Error('favorite must be boolean'); const favorite = input?.favorite === undefined ? prev.favorite : input.favorite, collectionIds = input?.collectionIds === undefined ? prev.collectionIds : await this.validateCollectionIds(input.collectionIds, actorId), data = { schema: 'KX.APPEARANCE_ASSET_METADATA/1', ownerActorId: actorId, fileId, categories, tags, favorite, collectionIds, updatedAt: iso(), updatedBy: actorId }; const row = await this.runtime.entities.save({ id, type: 'CORE.APPEARANCE_ASSET_METADATA', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_ASSET_METADATA/1', spaceIds: [...vis.file.spaceIds], data, expectedRevision: old?.revision }, ctx); return { contract: this.contract, id: row.id, revision: row.revision, ...clone(row.data) }; }
        async collectionList(_input, ctx) { const actorId = this.actorScope(ctx), rows = await this.actorCollectionRows(actorId); const items = rows.sort((a, b) => String(a.data?.name || '').localeCompare(String(b.data?.name || ''), 'cs', { numeric: true, sensitivity: 'base' })).map((row) => ({ id: row.id, revision: row.revision, ...clone(row.data) })); return { contract: this.contract, actorId, items, total: items.length }; }
        async collectionUpsert(input, ctx) { const actorId = this.actorScope(ctx), cfg = metadataConfig(), name = text(input?.name || '', Number(cfg.collectionNameMaxChars || 80), 'collection name').replace(/\s+/g, ' ').trim(), description = text(input?.description || '', Number(cfg.collectionDescriptionMaxChars || 240), 'collection description'); if (!name)
            throw new Error('Appearance collection name required'); let old = null, id = String(input?.collectionId || '').trim(); if (id) {
            old = await this.runtime.entities.get(id);
            const od = old?.data || {};
            if (!old || old.type !== 'CORE.APPEARANCE_ASSET_COLLECTION' || old.archivedAt || od.ownerActorId !== actorId)
                throw new Error(`Unknown/foreign Appearance collection ${id}`);
        }
        else {
            const active = await this.actorCollectionRows(actorId), max = Math.max(1, Number(cfg.maxCollections || 128));
            if (active.length >= max)
                throw new Error(`Appearance collections limit ${max} reached`);
            const seed = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            id = collectionEntityId(actorId, seed);
        } for (const row of await this.actorCollectionRows(actorId))
            if (row.id !== id && String(row.data?.name || '').toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'))
                throw new Error(`Appearance collection name already exists: ${name}`); const data = { schema: 'KX.APPEARANCE_ASSET_COLLECTION/1', ownerActorId: actorId, name, description, status: 'ACTIVE', updatedAt: iso(), updatedBy: actorId }, row = await this.runtime.entities.save({ id, type: 'CORE.APPEARANCE_ASSET_COLLECTION', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_ASSET_COLLECTION/1', spaceIds: old?.spaceIds || [], data, expectedRevision: old?.revision }, ctx); return { contract: this.contract, id: row.id, revision: row.revision, ...clone(row.data) }; }
        async collectionDelete(input, ctx) { const actorId = this.actorScope(ctx), id = String(input?.collectionId || '').trim(), row = await this.runtime.entities.get(id), d = row?.data || {}; if (!row || row.type !== 'CORE.APPEARANCE_ASSET_COLLECTION' || row.archivedAt || d.ownerActorId !== actorId)
            throw new Error(`Unknown/foreign Appearance collection ${id}`); let detached = 0; for (const meta of await this.actorMetadataRows(actorId)) {
            const md = this.metadataData(meta, actorId, String(meta.data?.fileId || ''));
            if (!md.collectionIds.includes(id))
                continue;
            const next = { ...md, collectionIds: md.collectionIds.filter(x => x !== id), updatedAt: iso(), updatedBy: actorId };
            await this.runtime.entities.save({ id: meta.id, type: 'CORE.APPEARANCE_ASSET_METADATA', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_ASSET_METADATA/1', spaceIds: meta.spaceIds, data: next, expectedRevision: meta.revision }, ctx);
            detached++;
        } const archivedAt = iso(), nextData = { ...clone(d), status: 'ARCHIVED', updatedAt: archivedAt, updatedBy: actorId }; await this.runtime.entities.save({ id: row.id, type: 'CORE.APPEARANCE_ASSET_COLLECTION', ownerApp: 'APP.NEXUS', schema: 'KX.APPEARANCE_ASSET_COLLECTION/1', spaceIds: row.spaceIds, data: nextData, archivedAt, expectedRevision: row.revision }, ctx); return { contract: this.contract, collectionId: id, detachedMetadata: detached, archived: true }; }
        async metadataBulk(input, ctx) { const actorId = this.actorScope(ctx), cfg = metadataConfig(), maxItems = Math.max(1, Number(cfg.bulkMaxItems || 64)), fileIds = [...new Set((Array.isArray(input?.fileIds) ? input.fileIds : []).map((x) => String(x || '').trim()).filter(Boolean))]; if (!fileIds.length)
            throw new Error('Bulk metadata requires fileIds'); if (fileIds.length > maxItems)
            throw new Error(`Bulk metadata exceeds ${maxItems} items`); const patch = input?.patch || {}, labelMax = Math.max(8, Number(cfg.labelMaxChars || 48)), addCategories = patch.addCategories ? normalizedLabels(patch.addCategories, Number(cfg.maxCategories || 8), labelMax, 'addCategories') : [], removeCategories = patch.removeCategories ? normalizedLabels(patch.removeCategories, Number(cfg.maxCategories || 8), labelMax, 'removeCategories') : [], addTags = patch.addTags ? normalizedLabels(patch.addTags, Number(cfg.maxTags || 32), labelMax, 'addTags') : [], removeTags = patch.removeTags ? normalizedLabels(patch.removeTags, Number(cfg.maxTags || 32), labelMax, 'removeTags') : [], addCollectionIds = patch.addCollectionIds ? await this.validateCollectionIds(patch.addCollectionIds, actorId) : [], removeCollectionIds = [...new Set((Array.isArray(patch.removeCollectionIds) ? patch.removeCollectionIds : []).map((x) => String(x || '').trim()).filter(Boolean))]; if (patch.favorite !== undefined && typeof patch.favorite !== 'boolean')
            throw new Error('bulk favorite must be boolean'); for (const fileId of fileIds)
            await this.visibleAsset(fileId, ctx); const lower = (x) => x.toLocaleLowerCase('cs'), results = [], failed = []; for (const fileId of fileIds) {
            try {
                const old = await this.metadataGet({ fileId }, ctx), catMap = new Map(old.categories.map((x) => [lower(x), x])), tagMap = new Map(old.tags.map((x) => [lower(x), x]));
                for (const x of removeCategories)
                    catMap.delete(lower(x));
                for (const x of addCategories)
                    catMap.set(lower(x), x);
                for (const x of removeTags)
                    tagMap.delete(lower(x));
                for (const x of addTags)
                    tagMap.set(lower(x), x);
                const collections = new Set(old.collectionIds);
                for (const x of removeCollectionIds)
                    collections.delete(x);
                for (const x of addCollectionIds)
                    collections.add(x);
                const saved = await this.metadataPatch({ fileId, categories: [...catMap.values()], tags: [...tagMap.values()], favorite: patch.favorite === undefined ? old.favorite : patch.favorite, collectionIds: [...collections] }, ctx);
                results.push(saved);
            }
            catch (error) {
                failed.push({ fileId, error: String(error) });
            }
        } return { contract: this.contract, mode: 'BOUNDED_BULK_METADATA', actorId, requested: fileIds.length, updated: results.length, failed, results }; }
        libraryQuery(input) { const cfg = libraryConfig(), maxPageSize = Math.max(1, Number(cfg.maxPageSize || 96)), defaultPageSize = Math.max(1, Math.min(maxPageSize, Number(cfg.defaultPageSize || 32))), rawLimit = Number(input?.limit ?? defaultPageSize), limit = Math.max(1, Math.min(maxPageSize, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : defaultPageSize)), rawOffset = Number(input?.offset ?? 0), offset = Math.max(0, Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0), query = text(input?.query || '', 160, 'query').toLocaleLowerCase('cs'), usage = ['ALL', 'IMAGE', 'FONT'].includes(String(input?.usage || 'ALL')) ? String(input?.usage || 'ALL') : 'ALL', state = ['ALL', 'VALID', 'STALE'].includes(String(input?.state || 'ALL')) ? String(input?.state || 'ALL') : 'ALL', sort = ['NAME_ASC', 'NAME_DESC', 'NEWEST', 'OLDEST', 'SIZE_DESC', 'SIZE_ASC'].includes(String(input?.sort || 'NAME_ASC')) ? String(input?.sort || 'NAME_ASC') : 'NAME_ASC', favorite = ['ALL', 'YES', 'NO'].includes(String(input?.favorite || 'ALL')) ? String(input?.favorite || 'ALL') : 'ALL', category = text(input?.category || '', Number(metadataConfig().labelMaxChars || 48), 'category filter').toLocaleLowerCase('cs'), tag = text(input?.tag || '', Number(metadataConfig().labelMaxChars || 48), 'tag filter').toLocaleLowerCase('cs'), collectionId = text(input?.collectionId || '', 200, 'collectionId'); return { query, usage, state, sort, favorite, category, tag, collectionId, offset, limit, maxPageSize }; }
        async libraryRows(ctx) { const actorId = this.actorScope(ctx), metadataRows = await this.actorMetadataRows(actorId), metadataByFile = new Map(metadataRows.map((x) => [x.data?.fileId, x])), collectionRows = await this.actorCollectionRows(actorId), collectionNames = new Map(collectionRows.map((x) => [x.id, String(x.data?.name || '')])); return (await this.list({}, ctx)).map((x) => { const md = this.metadataData(metadataByFile.get(x.fileId), actorId, x.fileId), names = md.collectionIds.map(id => collectionNames.get(id)).filter(Boolean); return { ...x, metadata: { favorite: md.favorite, categories: md.categories, tags: md.tags, collectionIds: md.collectionIds, collectionNames: names } }; }); }
        async portableLibraryPage(input, ctx) { const q = this.libraryQuery(input); let rows = await this.libraryRows(ctx); if (q.usage !== 'ALL')
            rows = rows.filter((x) => x.usage === q.usage); if (q.state !== 'ALL')
            rows = rows.filter((x) => q.state === 'STALE' ? x.stale : !x.stale); if (q.favorite !== 'ALL')
            rows = rows.filter((x) => q.favorite === 'YES' ? x.metadata.favorite : !x.metadata.favorite); if (q.category)
            rows = rows.filter((x) => x.metadata.categories.some((v) => v.toLocaleLowerCase('cs') === q.category)); if (q.tag)
            rows = rows.filter((x) => x.metadata.tags.some((v) => v.toLocaleLowerCase('cs') === q.tag)); if (q.collectionId)
            rows = rows.filter((x) => x.metadata.collectionIds.includes(q.collectionId)); if (q.query)
            rows = rows.filter((x) => [x.name, x.mimeType, x.fileId, x.provenance, x.license, x.source, ...x.metadata.categories, ...x.metadata.tags, ...x.metadata.collectionNames].some(v => String(v || '').toLocaleLowerCase('cs').includes(q.query))); const cmpName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'cs', { numeric: true, sensitivity: 'base' }), cmpDate = (a, b) => String(a.registeredAt || '').localeCompare(String(b.registeredAt || '')), cmpSize = (a, b) => Number(a.size || 0) - Number(b.size || 0); rows.sort(q.sort === 'NAME_DESC' ? (a, b) => -cmpName(a, b) : q.sort === 'NEWEST' ? (a, b) => -cmpDate(a, b) : q.sort === 'OLDEST' ? cmpDate : q.sort === 'SIZE_DESC' ? (a, b) => -cmpSize(a, b) : q.sort === 'SIZE_ASC' ? cmpSize : cmpName); const total = rows.length, safeOffset = total ? Math.min(q.offset, Math.floor((total - 1) / q.limit) * q.limit) : 0, items = rows.slice(safeOffset, safeOffset + q.limit), nextOffset = safeOffset + q.limit < total ? safeOffset + q.limit : null, prevOffset = safeOffset > 0 ? Math.max(0, safeOffset - q.limit) : null; return { contract: this.contract, mode: 'BOUNDED_WINDOW', queryMode: 'PORTABLE_BOUNDED_FALLBACK', query: q, total, offset: safeOffset, limit: q.limit, maxPageSize: q.maxPageSize, nextOffset, prevOffset, items }; }
        async libraryIndexStatus(_input, ctx) { const actorId = this.actorScope(ctx); if (!this.libraryIndex?.status)
            return { contract: 'KX.APPEARANCE_ASSET_LIBRARY_INDEX/1', available: false, state: 'UNAVAILABLE', mode: 'PORTABLE_BOUNDED_FALLBACK', actorId, rows: 0, sourceSequence: null, indexSourceSequence: null, rebuildRequired: false, reason: 'INDEX_PROVIDER_UNAVAILABLE' }; try {
            return await this.libraryIndex.status(actorId);
        }
        catch (error) {
            return { contract: 'KX.APPEARANCE_ASSET_LIBRARY_INDEX/1', available: false, state: 'ERROR', mode: String(this.libraryIndex?.mode || 'UNKNOWN'), actorId, rows: 0, sourceSequence: null, indexSourceSequence: null, rebuildRequired: false, reason: String(error) };
        } }
        async libraryIndexRebuild(_input, ctx) { const actorId = this.actorScope(ctx); if (!this.libraryIndex?.native || !this.libraryIndex?.replaceActor)
            throw new Error('APPEARANCE_ASSET_LIBRARY_NATIVE_INDEX_UNAVAILABLE'); const rows = await this.libraryRows(ctx), max = Math.max(1, Number((typeof KXAppearanceAssetLibraryIndex !== 'undefined' ? KXAppearanceAssetLibraryIndex.contract?.() : null)?.maxRebuildRows || 20000)); if (rows.length > max)
            throw new Error(`APPEARANCE_ASSET_LIBRARY_INDEX_REBUILD_LIMIT:${max}`); const out = await this.libraryIndex.replaceActor(actorId, rows); return { ...out, canonicalRowsRead: rows.length, canonicalBinaryOwner: 'CORE_FILE_SERVICE_ONLY' }; }
        async libraryPage(input, ctx) { const q = this.libraryQuery(input), actorId = this.actorScope(ctx), status = await this.libraryIndexStatus({}, ctx); if (status?.available && status?.state === 'READY' && this.libraryIndex?.page) {
            try {
                const page = await this.libraryIndex.page({ actorId, ...q });
                return { ...page, contract: this.contract, query: q, indexStatus: status };
            }
            catch (error) {
                const fallback = await this.portableLibraryPage(q, ctx);
                return { ...fallback, indexStatus: { ...status, state: 'ERROR', rebuildRequired: true, reason: String(error) }, nativeIndexFallback: true };
            }
        } const fallback = await this.portableLibraryPage(q, ctx); return { ...fallback, indexStatus: status }; }
        async libraryDiagnostics(_input, ctx) { const cfg = libraryConfig(), actorId = this.actorScope(ctx), rows = await this.list({}, ctx), cache = await this.thumbnailCacheStatus({}, ctx), index = await this.libraryIndexStatus({}, ctx), images = rows.filter((x) => x.usage === 'IMAGE').length, fonts = rows.filter((x) => x.usage === 'FONT').length, stale = rows.filter((x) => x.stale).length, visibleIds = new Set(rows.map((x) => x.fileId)), metadataRows = (await this.actorMetadataRows(actorId)).filter((x) => visibleIds.has(x.data?.fileId)), collections = await this.actorCollectionRows(actorId), favorites = metadataRows.filter((x) => !!x.data?.favorite).length, categorized = metadataRows.filter((x) => Array.isArray(x.data?.categories) && x.data.categories.length).length, tagged = metadataRows.filter((x) => Array.isArray(x.data?.tags) && x.data.tags.length).length, memberships = metadataRows.reduce((n, x) => n + (Array.isArray(x.data?.collectionIds) ? x.data.collectionIds.length : 0), 0), est = cache.storageEstimate || null, usage = Number(est?.usage), quota = Number(est?.quota), ratio = Number.isFinite(usage) && Number.isFinite(quota) && quota > 0 ? usage / quota : null, warn = Math.max(0, Math.min(1, Number(cfg.storagePressureWarn ?? 0.75))), critical = Math.max(warn, Math.min(1, Number(cfg.storagePressureCritical ?? 0.90))), level = ratio === null ? 'UNAVAILABLE' : ratio >= critical ? 'CRITICAL' : ratio >= warn ? 'WARN' : 'OK'; return { contract: this.contract, scope: 'ACTOR_VISIBLE_ASSET_LIBRARY', actorId, canonicalBinaryOwner: 'CORE_FILE_SERVICE_ONLY', visibleDescriptors: rows.length, images, fonts, stale, valid: rows.length - stale, metadata: { favorites, categorized, tagged, collections: collections.length, collectionMemberships: memberships, entity: 'CORE.APPEARANCE_ASSET_METADATA', collectionEntity: 'CORE.APPEARANCE_ASSET_COLLECTION' }, window: { defaultPageSize: Number(cfg.defaultPageSize || 32), maxPageSize: Number(cfg.maxPageSize || 96), uiWindowSize: Number(cfg.uiWindowSize || 32) }, index, cache, storagePressure: { level, ratio, usage: Number.isFinite(usage) ? usage : null, quota: Number.isFinite(quota) ? quota : null, warnAt: warn, criticalAt: critical, recommendation: level === 'CRITICAL' ? 'RECONCILE_OR_PURGE_DERIVED_CACHE' : level === 'WARN' ? 'REVIEW_DERIVED_CACHE' : 'NONE' } }; }
        async imageSource(state, ctx) { const d = state.descriptor.data || {}; if (d.usage !== 'IMAGE')
            throw new Error(`Thumbnail/preview unsupported for ${d.usage || 'UNKNOWN'}`); let blobFile = state.file, safetyArtifact = null; if (d.mimeType === 'image/svg+xml') {
            const safety = this.runtime.appearanceAssetSafety;
            if (!safety)
                throw new Error('APPEARANCE_SAFETY_SERVICE_UNAVAILABLE');
            safetyArtifact = await safety.requireSafe({ fileId: state.file.id }, ctx);
            const derivedId = safetyArtifact.data?.derivedFileId;
            if (!derivedId)
                throw new Error('APPEARANCE_SAFE_SVG_DERIVATIVE_MISSING');
            blobFile = await this.runtime.files.get(derivedId);
            if (!blobFile || blobFile.archivedAt || blobFile.mime !== 'image/svg+xml' || blobFile.sha256 !== safetyArtifact.data?.sanitizedSha256)
                throw new Error('APPEARANCE_SAFE_SVG_DERIVATIVE_INVALID');
            await this.assertRead(blobFile, ctx);
        }
        else if (!previewMime().has(d.mimeType))
            throw new Error(`Preview deferred/safety-blocked for ${d.mimeType}`); return { descriptor: d, blobFile, safetyArtifact }; }
        async preview(input, ctx) { const state = await this.freshness(input.fileId, ctx); if (state.stale)
            throw new Error(`Appearance asset descriptor STALE: ${state.reasons.join(',')}`); const source = await this.imageSource(state, ctx); const blob = await this.runtime.files.getBlob(source.blobFile.id); if (!blob)
            throw new Error('Appearance asset preview bytes unavailable'); const old = this.previews.get(state.file.id); if (old && typeof URL.revokeObjectURL === 'function')
            URL.revokeObjectURL(old); const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : ''; if (!previewUrl.startsWith('blob:'))
            throw new Error('Ephemeral blob preview unavailable'); this.previews.set(state.file.id, previewUrl); return { contract: this.contract, fileId: state.file.id, contentRevision: state.file.contentRevision, mimeType: source.descriptor.mimeType, width: source.descriptor.width, height: source.descriptor.height, previewUrl, ephemeral: true, persistable: false, safetyArtifactId: source.safetyArtifact?.id || null, derivedFileId: source.safetyArtifact?.data?.derivedFileId || null, sanitizedSha256: source.safetyArtifact?.data?.sanitizedSha256 || null }; }
        thumbnailKey(state, source, size, ownerActorId) { return [ownerActorId, state.file.id, state.file.contentRevision, state.file.sha256, source.blobFile.id, source.blobFile.contentRevision, source.blobFile.sha256, size].join('|'); }
        revokeThumbnailEntry(key) { const row = this.thumbnails.get(key); if (!row)
            return; if (row.url && typeof URL.revokeObjectURL === 'function')
            URL.revokeObjectURL(row.url); this.thumbnailBytes = Math.max(0, this.thumbnailBytes - row.bytes); this.thumbnails.delete(key); }
        trimThumbnailCache() { const cfg = thumbConfig(), maxEntries = Math.max(1, Number(cfg.maxEntries || 96)), maxBytes = Math.max(1024, Number(cfg.maxBytes || 16777216)); while (this.thumbnails.size > maxEntries || this.thumbnailBytes > maxBytes) {
            const key = this.thumbnails.keys().next().value;
            if (!key)
                break;
            this.revokeThumbnailEntry(key);
        } }
        putMemoryThumbnail(entry) { const old = this.thumbnails.get(entry.key); if (old)
            this.revokeThumbnailEntry(entry.key); this.thumbnails.set(entry.key, entry); this.thumbnailBytes += entry.bytes; this.trimThumbnailCache(); return this.thumbnails.has(entry.key); }
        async invalidateDeviceForFile(fileId) { if (!this.deviceEnabled())
            return; try {
            for (const row of await this.deviceStore.all())
                if (row.fileId === fileId)
                    await this.deviceStore.del(row.key);
            this.deviceCacheLastError = undefined;
        }
        catch (error) {
            this.deviceCacheLastError = String(error);
        } }
        async invalidateThumbnails(fileId) { for (const [key, row] of [...this.thumbnails.entries()])
            if (row.fileId === fileId)
                this.revokeThumbnailEntry(key); await this.invalidateDeviceForFile(fileId); }
        async renderThumbnail(blob, size) { const create = globalThis.createImageBitmap; if (typeof create !== 'function')
            throw new Error('APPEARANCE_THUMBNAIL_RENDERER_UNAVAILABLE'); const bitmap = await create(blob); try {
            const sw = Number(bitmap?.width || 0), sh = Number(bitmap?.height || 0);
            if (!Number.isFinite(sw) || !Number.isFinite(sh) || sw < 1 || sh < 1)
                throw new Error('APPEARANCE_THUMBNAIL_INVALID_SOURCE_DIMENSIONS');
            const noUpscale = thumbConfig().noUpscale !== false, ratio = Math.min(noUpscale ? 1 : Number.POSITIVE_INFINITY, size / Math.max(sw, sh)), width = Math.max(1, Math.round(sw * ratio)), height = Math.max(1, Math.round(sh * ratio));
            let out = null;
            const OC = globalThis.OffscreenCanvas;
            if (typeof OC === 'function') {
                const canvas = new OC(width, height), g = canvas.getContext('2d');
                if (!g || typeof g.drawImage !== 'function')
                    throw new Error('APPEARANCE_THUMBNAIL_2D_CONTEXT_UNAVAILABLE');
                g.clearRect?.(0, 0, width, height);
                g.drawImage(bitmap, 0, 0, width, height);
                if (typeof canvas.convertToBlob !== 'function')
                    throw new Error('APPEARANCE_THUMBNAIL_ENCODER_UNAVAILABLE');
                out = await canvas.convertToBlob({ type: String(thumbConfig().outputMime || 'image/webp'), quality: Number(thumbConfig().quality || 0.84) });
            }
            else if (typeof document !== 'undefined' && document.createElement) {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const g = canvas.getContext('2d');
                if (!g)
                    throw new Error('APPEARANCE_THUMBNAIL_2D_CONTEXT_UNAVAILABLE');
                g.drawImage(bitmap, 0, 0, width, height);
                out = await new Promise(resolve => canvas.toBlob(resolve, String(thumbConfig().outputMime || 'image/webp'), Number(thumbConfig().quality || 0.84)));
            }
            else
                throw new Error('APPEARANCE_THUMBNAIL_CANVAS_UNAVAILABLE');
            if (!out || out.size < 1)
                throw new Error('APPEARANCE_THUMBNAIL_ENCODE_FAILED');
            return { blob: out, width, height };
        }
        finally {
            try {
                bitmap?.close?.();
            }
            catch { }
        } }
        responseFrom(state, source, size, width, height, blob, thumbnailUrl, cacheLayer, cacheHit) { return { contract: this.contract, fileId: state.file.id, contentRevision: state.file.contentRevision, sourceSha256: state.file.sha256, sourceFileId: source.blobFile.id, sourceContentRevision: source.blobFile.contentRevision, sourceMimeType: source.blobFile.mime, size, width, height, outputMime: blob.type || String(thumbConfig().outputMime || 'image/webp'), bytes: blob.size, thumbnailUrl, cacheScope: cacheLayer === 'DEVICE' ? 'DEVICE_DERIVED_CACHE' : 'RUNTIME_MEMORY_LRU', cacheLayer, cacheHit, persistentCacheHit: cacheLayer === 'DEVICE', ephemeral: true, persistable: false, safetyArtifactId: source.safetyArtifact?.id || null, derivedFileId: source.safetyArtifact?.data?.derivedFileId || null, sanitizedSha256: source.safetyArtifact?.data?.sanitizedSha256 || null }; }
        async deviceRows(actorId) { if (!this.deviceEnabled())
            return []; try {
            const rows = await this.deviceStore.all();
            this.deviceCacheLastError = undefined;
            return actorId && actorId !== 'SYSTEM' ? rows.filter(x => x.ownerActorId === actorId) : rows;
        }
        catch (error) {
            this.deviceCacheLastError = String(error);
            return [];
        } }
        async trimDeviceCache() { if (!this.deviceEnabled())
            return { evicted: 0 }; const cfg = deviceConfig(), maxEntries = Math.max(1, Number(cfg.maxEntries || 512)), maxBytes = Math.max(4096, Number(cfg.maxBytes || 67108864)), targetEntries = Math.max(1, Math.min(maxEntries, Number(cfg.targetEntries || 448))), targetBytes = Math.max(4096, Math.min(maxBytes, Number(cfg.targetBytes || 58720256))); try {
            const rows = await this.deviceStore.all();
            let entries = rows.length, bytes = rows.reduce((n, x) => n + Number(x.bytes || 0), 0), evicted = 0;
            if (entries <= maxEntries && bytes <= maxBytes)
                return { evicted };
            for (const row of [...rows].sort((a, b) => String(a.lastAccessedAt).localeCompare(String(b.lastAccessedAt)))) {
                if (entries <= targetEntries && bytes <= targetBytes)
                    break;
                await this.deviceStore.del(row.key);
                entries--;
                bytes = Math.max(0, bytes - Number(row.bytes || 0));
                evicted++;
            }
            this.deviceCacheLastError = undefined;
            return { evicted };
        }
        catch (error) {
            this.deviceCacheLastError = String(error);
            return { evicted: 0, error: String(error) };
        } }
        async readDeviceThumbnail(key, state, source, size, ctx) { if (!this.deviceEnabled())
            return null; try {
            const row = await this.deviceStore.get(key);
            if (!row)
                return null;
            const actorId = this.actorScope(ctx), validMeta = row.schema === 'KX.APPEARANCE_THUMBNAIL_CACHE_ENTRY/1' && row.ownerActorId === actorId && row.fileId === state.file.id && row.contentRevision === state.file.contentRevision && row.fileSha256 === state.file.sha256 && row.sourceFileId === source.blobFile.id && row.sourceContentRevision === source.blobFile.contentRevision && row.sourceSha256 === source.blobFile.sha256 && row.size === size;
            if (!validMeta || row.blob.size !== row.bytes || row.blob.type !== row.outputMime || await digest(row.blob) !== row.thumbnailSha256) {
                await this.deviceStore.del(key);
                return null;
            }
            row.lastAccessedAt = iso();
            await this.deviceStore.put(row);
            const thumbnailUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(row.blob) : '';
            if (!thumbnailUrl.startsWith('blob:'))
                throw new Error('Ephemeral thumbnail blob URL unavailable');
            const response = this.responseFrom(state, source, size, row.width, row.height, row.blob, thumbnailUrl, 'DEVICE', true);
            const entry = { key, ownerActorId: actorId, fileId: state.file.id, contentRevision: state.file.contentRevision, sourceFileId: source.blobFile.id, sourceContentRevision: source.blobFile.contentRevision, sourceSha256: source.blobFile.sha256, size, url: thumbnailUrl, bytes: row.bytes, response };
            this.putMemoryThumbnail(entry);
            this.deviceCacheLastError = undefined;
            return clone(response);
        }
        catch (error) {
            this.deviceCacheLastError = String(error);
            return null;
        } }
        async writeDeviceThumbnail(key, state, source, size, width, height, blob, ctx) { if (!this.deviceEnabled())
            return false; const cfg = deviceConfig(), maxBytes = Math.max(4096, Number(cfg.maxBytes || 67108864)); if (blob.size > maxBytes)
            return false; try {
            const actorId = this.actorScope(ctx), at = iso(), row = { key, schema: 'KX.APPEARANCE_THUMBNAIL_CACHE_ENTRY/1', ownerActorId: actorId, fileId: state.file.id, contentRevision: state.file.contentRevision, fileSha256: state.file.sha256, sourceFileId: source.blobFile.id, sourceContentRevision: source.blobFile.contentRevision, sourceSha256: source.blobFile.sha256, size, width, height, outputMime: blob.type || String(thumbConfig().outputMime || 'image/webp'), bytes: blob.size, thumbnailSha256: await digest(blob), blob, safetyArtifactId: source.safetyArtifact?.id || null, derivedFileId: source.safetyArtifact?.data?.derivedFileId || null, sanitizedSha256: source.safetyArtifact?.data?.sanitizedSha256 || null, createdAt: at, lastAccessedAt: at };
            await this.deviceStore.put(row);
            await this.trimDeviceCache();
            this.deviceCacheLastError = undefined;
            return !!await this.deviceStore.get(key);
        }
        catch (error) {
            this.deviceCacheLastError = String(error);
            return false;
        } }
        async thumbnail(input, ctx) { const state = await this.freshness(input.fileId, ctx); if (state.stale)
            throw new Error(`Appearance asset descriptor STALE: ${state.reasons.join(',')}`); const size = Number(input?.size ?? thumbConfig().defaultSize ?? 96); if (!Number.isInteger(size) || !thumbSizes().has(size))
            throw new Error(`Unsupported thumbnail size ${size}`); const source = await this.imageSource(state, ctx), actorId = this.actorScope(ctx), key = this.thumbnailKey(state, source, size, actorId), hit = this.thumbnails.get(key); if (hit) {
            this.thumbnails.delete(key);
            this.thumbnails.set(key, hit);
            return { ...clone(hit.response), thumbnailUrl: hit.url, cacheHit: true, cacheLayer: 'MEMORY', cacheScope: 'RUNTIME_MEMORY_LRU', persistentCacheHit: false };
        } const deviceHit = await this.readDeviceThumbnail(key, state, source, size, ctx); if (deviceHit)
            return deviceHit; const blob = await this.runtime.files.getBlob(source.blobFile.id); if (!blob)
            throw new Error('Appearance asset thumbnail bytes unavailable'); const rendered = await this.renderThumbnail(blob, size), maxBytes = Math.max(1024, Number(thumbConfig().maxBytes || 16777216)); if (rendered.blob.size > maxBytes)
            throw new Error('APPEARANCE_THUMBNAIL_EXCEEDS_CACHE_BUDGET'); const thumbnailUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(rendered.blob) : ''; if (!thumbnailUrl.startsWith('blob:'))
            throw new Error('Ephemeral thumbnail blob URL unavailable'); const response = this.responseFrom(state, source, size, rendered.width, rendered.height, rendered.blob, thumbnailUrl, 'GENERATED', false), entry = { key, ownerActorId: actorId, fileId: state.file.id, contentRevision: state.file.contentRevision, sourceFileId: source.blobFile.id, sourceContentRevision: source.blobFile.contentRevision, sourceSha256: source.blobFile.sha256, size, url: thumbnailUrl, bytes: rendered.blob.size, response }; this.putMemoryThumbnail(entry); if (!this.thumbnails.has(key))
            throw new Error('APPEARANCE_THUMBNAIL_CACHE_BUDGET_TOO_SMALL'); const persisted = await this.writeDeviceThumbnail(key, state, source, size, rendered.width, rendered.height, rendered.blob, ctx); return { ...clone(response), persistentCacheStored: persisted }; }
        thumbnailStats() { return { scope: 'RUNTIME_MEMORY_LRU', entries: this.thumbnails.size, bytes: this.thumbnailBytes, maxEntries: Number(thumbConfig().maxEntries || 96), maxBytes: Number(thumbConfig().maxBytes || 16777216), deviceMode: this.deviceStore.mode, devicePersistent: this.deviceEnabled(), deviceLastError: this.deviceCacheLastError }; }
        async thumbnailCacheStatus(_input, ctx) { const actorId = this.actorScope(ctx), rows = await this.deviceRows(actorId), cfg = deviceConfig(), bytes = rows.reduce((n, x) => n + Number(x.bytes || 0), 0); let storageEstimate = null; try {
            const nav = globalThis.navigator;
            if (nav?.storage?.estimate)
                storageEstimate = await nav.storage.estimate();
        }
        catch { } return { contract: this.contract, scope: 'DEVICE_DERIVED_CACHE', mode: this.deviceStore.mode, persistent: this.deviceEnabled(), actorScoped: true, actorId, entries: rows.length, bytes, maxEntries: Number(cfg.maxEntries || 512), maxBytes: Number(cfg.maxBytes || 67108864), targetEntries: Number(cfg.targetEntries || 448), targetBytes: Number(cfg.targetBytes || 58720256), storageEstimate, lastError: this.deviceCacheLastError || null }; }
        async reconcileThumbnailCache(_input, ctx) { const actorId = this.actorScope(ctx); if (!this.deviceEnabled())
            return { contract: this.contract, mode: this.deviceStore.mode, persistent: false, checked: 0, removed: 0, remaining: 0, reasons: { UNAVAILABLE: 1 } }; const rows = await this.deviceRows(actorId), reasons = {}, bump = (x) => reasons[x] = (reasons[x] || 0) + 1; let removed = 0; for (const row of rows) {
            let reason = '';
            try {
                const descriptor = await this.runtime.entities.get(descriptorId(row.fileId)), file = await this.runtime.files.get(row.fileId), source = await this.runtime.files.get(row.sourceFileId);
                if (!descriptor || descriptor.type !== 'CORE.APPEARANCE_ASSET_DESCRIPTOR')
                    reason = 'DESCRIPTOR_MISSING';
                else if (!file || file.archivedAt)
                    reason = 'FILE_MISSING';
                else if (!source || source.archivedAt)
                    reason = 'SOURCE_MISSING';
                else {
                    await this.assertRead(file, ctx);
                    await this.assertRead(source, ctx);
                    const d = descriptor.data || {};
                    if (d.contentRevision !== file.contentRevision || d.sha256 !== file.sha256 || d.mimeType !== file.mime)
                        reason = 'DESCRIPTOR_STALE';
                    else if (row.contentRevision !== file.contentRevision || row.fileSha256 !== file.sha256)
                        reason = 'FILE_REVISION_MISMATCH';
                    else if (row.sourceContentRevision !== source.contentRevision || row.sourceSha256 !== source.sha256)
                        reason = 'SOURCE_REVISION_MISMATCH';
                    else if (row.blob.size !== row.bytes || row.blob.type !== row.outputMime || await digest(row.blob) !== row.thumbnailSha256)
                        reason = 'DERIVED_BYTES_CORRUPT';
                }
            }
            catch (error) {
                reason = String(error).includes('READ denied') ? 'PERMISSION_DENIED' : 'RECONCILE_ERROR';
            }
            if (reason) {
                await this.deviceStore.del(row.key);
                const mem = this.thumbnails.get(row.key);
                if (mem)
                    this.revokeThumbnailEntry(row.key);
                removed++;
                bump(reason);
            }
        } const trim = await this.trimDeviceCache(); if (trim.evicted) {
            removed += trim.evicted;
            bump('QUOTA_EVICTION');
        } const remaining = (await this.deviceRows(actorId)).length; return { contract: this.contract, mode: this.deviceStore.mode, persistent: true, checked: rows.length, removed, remaining, reasons }; }
        async purgeThumbnailCache(input, ctx) { const actorId = this.actorScope(ctx), fileId = String(input?.fileId || '').trim(); let removedDevice = 0, removedMemory = 0; if (this.deviceEnabled()) {
            try {
                for (const row of await this.deviceStore.all())
                    if ((actorId === 'SYSTEM' || row.ownerActorId === actorId) && (!fileId || row.fileId === fileId)) {
                        await this.deviceStore.del(row.key);
                        removedDevice++;
                    }
                this.deviceCacheLastError = undefined;
            }
            catch (error) {
                this.deviceCacheLastError = String(error);
            }
        } for (const [key, row] of [...this.thumbnails.entries()])
            if ((actorId === 'SYSTEM' || row.ownerActorId === actorId) && (!fileId || row.fileId === fileId)) {
                this.revokeThumbnailEntry(key);
                removedMemory++;
            } return { contract: this.contract, actorId, fileId: fileId || null, removedDevice, removedMemory, deviceMode: this.deviceStore.mode }; }
        async ref(input, ctx) { const state = await this.freshness(input.fileId, ctx); if (state.stale)
            throw new Error(`Appearance asset descriptor STALE: ${state.reasons.join(',')}`); const d = state.descriptor.data, usage = d.usage === 'FONT' ? 'FONT' : 'IMAGE'; let safetyArtifact = null; if (usage === 'FONT' || d.mimeType === 'image/svg+xml') {
            const safety = this.runtime.appearanceAssetSafety;
            if (!safety)
                throw new Error('APPEARANCE_SAFETY_SERVICE_UNAVAILABLE');
            safetyArtifact = await safety.requireSafe({ fileId: state.file.id }, ctx);
        } const assetCode = text(input.assetCode, 160, 'assetCode'); const ref = KXAppearanceAssets.canonicalAssetRef({ assetCode, kind: 'FILE_ID', locator: state.file.id, mimeType: d.mimeType, status: String(input.status || 'DRAFT'), checksumSha256: d.sha256, source: d.source, license: d.license, width: d.width, height: d.height }, usage); return { contract: this.contract, descriptorId: state.descriptor.id, fileId: state.file.id, contentRevision: state.file.contentRevision, safetyArtifactId: safetyArtifact?.id || null, sanitizedSha256: safetyArtifact?.data?.sanitizedSha256 || null, derivedFileId: safetyArtifact?.data?.derivedFileId || null, ref }; }
        async revokePreview(fileId) { const old = this.previews.get(fileId); if (old && typeof URL.revokeObjectURL === 'function')
            URL.revokeObjectURL(old); this.previews.delete(fileId); await this.invalidateThumbnails(fileId); }
    }
    function install(runtime, deviceStore, libraryIndex) { const service = new AppearanceAssetIngestionService(runtime, deviceStore, libraryIndex || (typeof KXAppearanceAssetLibraryIndex !== 'undefined' ? KXAppearanceAssetLibraryIndex.createDefaultProvider(runtime) : null)); runtime.appearanceAssetIngestion = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); const reg = (code, risk, permission, handler) => { if (!existing.has(code))
        runtime.actions.register({ code, ownerApp: 'APP.NEXUS', risk, permission, handler }); }; reg('ACTION.CORE.APPEARANCE.ASSET.INSPECT', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.inspect(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.REGISTER', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.register(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIST', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.list(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.PREVIEW', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.preview(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.THUMBNAIL', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.thumbnail(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.THUMBNAIL.CACHE.STATUS', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.thumbnailCacheStatus(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.THUMBNAIL.CACHE.RECONCILE', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.reconcileThumbnailCache(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.THUMBNAIL.CACHE.PURGE', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.purgeThumbnailCache(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.PAGE', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.libraryPage(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.DIAGNOSTICS', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.libraryDiagnostics(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.INDEX.STATUS', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.libraryIndexStatus(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.INDEX.REBUILD', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.libraryIndexRebuild(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.METADATA.GET', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.metadataGet(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.METADATA.PATCH', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.metadataPatch(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.METADATA.BULK', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.metadataBulk(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.COLLECTION.LIST', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.collectionList(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.COLLECTION.UPSERT', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.collectionUpsert(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.LIBRARY.COLLECTION.DELETE', 'SAFE_WRITE', 'CORE.APPEARANCE.ASSET.MANAGE', (p, c) => service.collectionDelete(p, c)); reg('ACTION.CORE.APPEARANCE.ASSET.REF', 'READ', 'CORE.APPEARANCE.ASSET.READ', (p, c) => service.ref(p, c)); return service; }
    NS.contract = contract;
    NS.descriptorId = descriptorId;
    NS.MemoryThumbnailDeviceCacheStore = MemoryThumbnailDeviceCacheStore;
    NS.IndexedDbThumbnailDeviceCacheStore = IndexedDbThumbnailDeviceCacheStore;
    NS.AppearanceAssetIngestionService = AppearanceAssetIngestionService;
    NS.install = install;
})(KXAppearanceAssetIngestion || (KXAppearanceAssetIngestion = {}));
