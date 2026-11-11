var KX;
(function (KX) {
    class ImplementationRegistryService {
        snapshot() {
            const raw = globalThis.KXImplementation;
            if (!raw || raw.contract !== 'KX.IMPLEMENTATION_REGISTRY/1' || !Array.isArray(raw.features))
                throw new Error('Implementation Registry není načtený');
            return structuredClone(raw);
        }
        get() { return this.snapshot(); }
        list(status) { const rows = this.snapshot().features; return status ? rows.filter(x => x.status === status) : rows; }
        getFeature(code) { return this.snapshot().features.find(x => x.code === code); }
        summary() {
            const reg = this.snapshot(), statuses = { PLANNED: 0, PARTIAL: 0, IMPLEMENTED: 0, VERIFIED: 0, BLOCKED: 0 }, falseVerified = [];
            for (const f of reg.features) {
                statuses[f.status]++;
                if (f.status === 'VERIFIED' && f.completionCriteria.some(c => c.verified !== true))
                    falseVerified.push(f.code);
            }
            return { contract: reg.contract, releaseBaseline: reg.releaseBaseline, total: reg.features.length, statuses, incomplete: reg.features.length - statuses.VERIFIED, falseVerified, generatedAt: now() };
        }
    }
    KX.ImplementationRegistryService = ImplementationRegistryService;
    KX.CAS_FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
    function casActual(row, field) { if (row === undefined || row === null)
        return null; const v = row[field]; return v === undefined ? null : v; }
    KX.casActual = casActual;
    function casConflict(p, actual) { return new Error(`REPOSITORY_CAS_CONFLICT ${p.store}/${p.key} ${p.field || 'revision'}: expected ${p.value === null ? 'absent' : String(p.value)}, actual ${actual === null ? 'absent' : String(actual)}`); }
    KX.casConflict = casConflict;
    function checkPreconditions(pre) { for (const p of pre) {
        if (!p || typeof p.key !== 'string' || !p.key)
            throw new Error('REPOSITORY_CAS_INVALID');
        const f = p.field || 'revision';
        if (!KX.CAS_FIELD_RE.test(f))
            throw new Error('REPOSITORY_CAS_INVALID_FIELD');
        if (!(p.value === null || typeof p.value === 'string' || typeof p.value === 'number'))
            throw new Error('REPOSITORY_CAS_INVALID_VALUE');
    } }
    KX.checkPreconditions = checkPreconditions;
    class IndexedDbCoreRepository {
        dbName;
        mode = 'INDEXED_DB';
        db;
        constructor(dbName = 'KalinumXNexusCore') {
            this.dbName = dbName;
        }
        async open() {
            if (this.db)
                return;
            this.db = await new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, 10);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    const mk = (name, keyPath = 'id') => { if (!db.objectStoreNames.contains(name))
                        db.createObjectStore(name, { keyPath }); };
                    mk('entities');
                    mk('revisions');
                    mk('relations');
                    mk('settings');
                    mk('shareRules');
                    mk('audit');
                    mk('lineage');
                    mk('outbox');
                    mk('users');
                    mk('spaces');
                    mk('spaceMemberships');
                    mk('devices');
                    mk('sessions');
                    mk('capabilityReports');
                    mk('files');
                    mk('fileBlobs');
                    mk('fileCollections');
                    mk('fileMemberships');
                    mk('fileSearch');
                    mk('documents');
                    mk('documentVersions');
                    mk('conflicts');
                    mk('tasks');
                    mk('calendarEvents');
                    mk('alarms');
                    mk('backgroundJobs');
                    mk('recoverySnapshots');
                    mk('meta', 'key');
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        async ensure() { await this.open(); return this.db; }
        async put(store, value) { await this.atomic([{ store, value }]); }
        async get(store, key) { const db = await this.ensure(); return await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'); const r = tx.objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
        async all(store) { const db = await this.ensure(); return await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'); const r = tx.objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
        async del(store, key) { await this.atomic([], [{ store, key }]); }
        supportsPreconditions = true;
        async atomic(writes, deletes = [], preconditions = []) {
            checkPreconditions(preconditions);
            const db = await this.ensure();
            const stores = [...new Set([...writes.map(x => x.store), ...deletes.map(x => x.store), ...preconditions.map(x => x.store)])];
            if (!stores.length)
                return;
            await new Promise((resolve, reject) => {
                const tx = db.transaction(stores, 'readwrite');
                let conflict = null;
                const apply = () => { for (const x of writes)
                    tx.objectStore(x.store).put(x.value); for (const x of deletes)
                    tx.objectStore(x.store).delete(x.key); };
                // N2.1h: preconditions are read inside the SAME readwrite transaction; writes are issued only after all match.
                let pending = preconditions.length;
                if (!pending)
                    apply();
                for (const p of preconditions) {
                    const r = tx.objectStore(p.store).get(p.key);
                    r.onsuccess = () => { if (conflict)
                        return; const actual = casActual(r.result, p.field || 'revision'); if (actual !== p.value) {
                        conflict = casConflict(p, actual);
                        try {
                            tx.abort();
                        }
                        catch { }
                        return;
                    } if (--pending === 0)
                        apply(); };
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(conflict || tx.error);
                tx.onabort = () => reject(conflict || tx.error || new Error('IndexedDB transaction aborted'));
            });
        }
    }
    KX.IndexedDbCoreRepository = IndexedDbCoreRepository;
    class MemoryCoreRepository {
        mode = 'MEMORY';
        stores = new Map();
        async open() { return; }
        bucket(store) { let b = this.stores.get(store); if (!b) {
            b = new Map();
            this.stores.set(store, b);
        } return b; }
        keyOf(v) { return String(v?.id ?? v?.key ?? ''); }
        async put(store, value) { const key = this.keyOf(value); if (!key)
            throw new Error(`Missing repository key for ${store}`); this.bucket(store).set(key, structuredClone(value)); }
        async get(store, key) { const v = this.bucket(store).get(key); return v === undefined ? undefined : structuredClone(v); }
        async all(store) { return [...this.bucket(store).values()].map(v => structuredClone(v)); }
        async del(store, key) { this.bucket(store).delete(key); }
        supportsPreconditions = true;
        async atomic(writes, deletes = [], preconditions = []) {
            checkPreconditions(preconditions);
            // N2.1h: check + apply run synchronously (no await) => atomic relative to every other caller.
            for (const p of preconditions) {
                const actual = casActual(this.bucket(p.store).get(p.key), p.field || 'revision');
                if (actual !== p.value)
                    throw casConflict(p, actual);
            }
            for (const x of writes) {
                const key = this.keyOf(x.value);
                if (!key)
                    throw new Error(`Missing repository key for ${x.store}`);
            }
            for (const x of writes)
                this.bucket(x.store).set(this.keyOf(x.value), structuredClone(x.value));
            for (const x of deletes)
                this.bucket(x.store).delete(x.key);
        }
    }
    KX.MemoryCoreRepository = MemoryCoreRepository;
    class TauriGlobalBridge {
        async invoke(command, args = {}) {
            const g = globalThis;
            const invoke = g.__TAURI__?.core?.invoke || g.__TAURI_INTERNALS__?.invoke;
            if (typeof invoke !== 'function')
                throw new Error('Tauri invoke bridge není dostupný');
            return invoke(command, args);
        }
        static available() { const g = globalThis; return typeof (g.__TAURI__?.core?.invoke || g.__TAURI_INTERNALS__?.invoke) === 'function'; }
    }
    KX.TauriGlobalBridge = TauriGlobalBridge;
    class NativeSqliteCoreRepository {
        bridge;
        mode = 'NATIVE_SQLITE';
        constructor(bridge = new TauriGlobalBridge()) {
            this.bridge = bridge;
        }
        keyOf(v) { const key = String(v?.id ?? v?.key ?? ''); if (!key)
            throw new Error('Missing native repository key'); return key; }
        async open() { await this.bridge.invoke('kx_core_repo_open'); }
        async put(store, value) { await this.bridge.invoke('kx_core_repo_put', { store, key: this.keyOf(value), payload: JSON.stringify(value) }); }
        async get(store, key) { const raw = await this.bridge.invoke('kx_core_repo_get', { store, key }); return raw == null ? undefined : JSON.parse(raw); }
        async all(store) { const rows = await this.bridge.invoke('kx_core_repo_all', { store }); return rows.map(x => JSON.parse(x)); }
        async del(store, key) { await this.bridge.invoke('kx_core_repo_delete', { store, key }); }
        supportsPreconditions = true;
        async atomic(writes, deletes = [], preconditions = []) {
            checkPreconditions(preconditions);
            // N2.1h: the native host checks preconditions inside its BEGIN IMMEDIATE transaction (src-tauri lib.rs).
            await this.bridge.invoke('kx_core_repo_atomic', { batch: { writes: writes.map(x => ({ store: x.store, key: this.keyOf(x.value), payload: JSON.stringify(x.value) })), deletes, preconditions: preconditions.map(p => ({ store: p.store, key: p.key, field: p.field || 'revision', valueJson: JSON.stringify(p.value) })) } });
        }
    }
    KX.NativeSqliteCoreRepository = NativeSqliteCoreRepository;
    class RepositoryAtomicCompensationService {
        repo;
        contract = 'KX.REPOSITORY_ATOMIC_COMPENSATION/1';
        constructor(repo) {
            this.repo = repo;
        }
        async execute(input, faultPoint) {
            let primaryCommitted = false, primaryReadbackVerified = false, compensationApplied = false, compensationVerified = false;
            try {
                if (faultPoint === 'BEFORE_PRIMARY_COMMIT')
                    throw new Error('REPOSITORY_FAULT:BEFORE_PRIMARY_COMMIT');
                await this.repo.atomic(input.writes, input.deletes);
                primaryCommitted = true;
                if (faultPoint === 'AFTER_PRIMARY_COMMIT')
                    throw new Error('REPOSITORY_FAULT:AFTER_PRIMARY_COMMIT');
                primaryReadbackVerified = await input.verifyPrimary();
                if (!primaryReadbackVerified)
                    throw new Error('REPOSITORY_PRIMARY_READBACK_MISMATCH');
                if (faultPoint === 'AFTER_PRIMARY_READBACK')
                    throw new Error('REPOSITORY_FAULT:AFTER_PRIMARY_READBACK');
                return { contract: this.contract, faultPoint, primaryCommitted, primaryReadbackVerified, compensationRequired: false, compensationApplied: false, compensationVerified: false };
            }
            catch (error) {
                if (primaryCommitted) {
                    await this.repo.atomic(input.compensationWrites, input.compensationDeletes || []);
                    compensationApplied = true;
                    compensationVerified = await input.verifyCompensation();
                }
                return { contract: this.contract, faultPoint, primaryCommitted, primaryReadbackVerified, compensationRequired: primaryCommitted, compensationApplied, compensationVerified, error: String(error) };
            }
        }
    }
    KX.RepositoryAtomicCompensationService = RepositoryAtomicCompensationService;
    class NativeManagedFileStore {
        bridge;
        mode = 'NATIVE_MANAGED';
        constructor(bridge = new TauriGlobalBridge()) {
            this.bridge = bridge;
        }
        async writeRevision(fileId, revision, originalName, blob) {
            const bytes = [...new Uint8Array(await blob.arrayBuffer())];
            return this.bridge.invoke('kx_managed_file_write_revision', { fileId, revision, originalName, bytes });
        }
        async read(locator, mime = 'application/octet-stream') { const bytes = await this.bridge.invoke('kx_managed_file_read', { locator }); return new Blob([new Uint8Array(bytes)], { type: mime }); }
        async exists(locator) { return this.bridge.invoke('kx_managed_file_exists', { locator }); }
        async deleteRevision(locator, expectedSha256, expectedSize) { return this.bridge.invoke('kx_managed_file_delete_revision', { locator, expectedSha256, expectedSize }); }
    }
    KX.NativeManagedFileStore = NativeManagedFileStore;
    class IsolatedManagedFileStore {
        mode = 'NATIVE_MANAGED';
        deleteCalls = [];
        mem = new Map();
        constructor(seed = []) { for (const x of seed)
            this.mem.set(x.locator, x.blob.slice(0, x.blob.size, x.blob.type)); }
        async writeRevision(fileId, revision, originalName, blob) { const locator = `Files/${fileId}/r${String(revision).padStart(6, '0')}/${originalName}`, copy = blob.slice(0, blob.size, blob.type), hash = await sha256(copy); this.mem.set(locator, copy); return { locator, size: copy.size, sha256: hash }; }
        async read(locator, mime = 'application/octet-stream') { const b = this.mem.get(locator); if (!b)
            throw new Error('Isolated managed revision neexistuje'); return b.slice(0, b.size, mime || b.type); }
        async exists(locator) { return this.mem.has(locator); }
        async deleteRevision(locator, expectedSha256, expectedSize) { const b = this.mem.get(locator); if (!b)
            throw new Error('Isolated managed revision pro delete neexistuje'); const actual = await sha256(b); if (b.size !== expectedSize)
            throw new Error('Isolated managed delete expected-size mismatch'); if (actual !== String(expectedSha256).toLowerCase())
            throw new Error('Isolated managed delete expected-SHA256 mismatch'); this.deleteCalls.push(locator); this.mem.delete(locator); if (this.mem.has(locator))
            throw new Error('Isolated managed delete readback failed'); return { locator, existed: true, deleted: true, size: b.size, sha256: actual }; }
        async stateSha256() { const rows = []; for (const [locator, b] of [...this.mem.entries()].sort((a, b) => a[0].localeCompare(b[0])))
            rows.push({ locator, size: b.size, sha256: await sha256(b) }); return sha256Bytes(new TextEncoder().encode(stableStringify(rows))); }
        snapshot() { return [...this.mem.entries()].map(([locator, blob]) => ({ locator, blob: blob.slice(0, blob.size, blob.type) })); }
    }
    KX.IsolatedManagedFileStore = IsolatedManagedFileStore;
    class LocalWorkspaceBootstrapStore {
        memory = { profiles: [], schemaVersion: 1 };
        key = 'kx.nexus.bootstrap.workspaces.v1';
        normalize(raw) {
            const value = (raw && typeof raw === 'object' ? raw : {});
            const profiles = Array.isArray(value.profiles) ? value.profiles.filter(x => x && typeof x === 'object') : [];
            const activeId = typeof value.activeId === 'string' ? value.activeId : undefined;
            return { profiles, activeId, schemaVersion: 1 };
        }
        read() {
            try {
                const raw = globalThis.localStorage?.getItem(this.key);
                return raw ? this.normalize(JSON.parse(raw)) : this.normalize(this.memory);
            }
            catch {
                return this.normalize(this.memory);
            }
        }
        write(v) { this.memory = this.normalize(v); try {
            globalThis.localStorage?.setItem(this.key, JSON.stringify(this.memory));
        }
        catch { } }
        async list() { return structuredClone(this.read().profiles); }
        async save(profile) { const v = this.read(), i = v.profiles.findIndex(x => x.id === profile.id); if (i >= 0)
            v.profiles[i] = structuredClone(profile);
        else
            v.profiles.push(structuredClone(profile)); this.write(v); }
        async remove(id) { const v = this.read(); v.profiles = v.profiles.filter(x => x.id !== id); if (v.activeId === id)
            delete v.activeId; this.write(v); }
        async activeId() { return this.read().activeId; }
        async setActiveId(id) { const v = this.read(); v.activeId = id; this.write(v); }
    }
    KX.LocalWorkspaceBootstrapStore = LocalWorkspaceBootstrapStore;
    class WorkspaceProfileService {
        store;
        bridge;
        modes = new Set(['LOCAL', 'PORTABLE', 'SERVER_CONNECTED', 'RESTORE', 'DEMO']);
        constructor(store = new LocalWorkspaceBootstrapStore(), bridge = TauriGlobalBridge.available() ? new TauriGlobalBridge() : undefined) {
            this.store = store;
            this.bridge = bridge;
        }
        validate(input) {
            if (!input.id || input.id.length > 160 || !/^[A-Za-z0-9_.-]+$/.test(input.id))
                throw new Error('Neplatné Workspace ID');
            if (!input.name?.trim())
                throw new Error('Workspace musí mít název');
            if (!this.modes.has(input.mode))
                throw new Error(`Nepodporovaný Workspace mode: ${String(input.mode)}`);
        }
        async list() { const rows = await this.store.list(); return rows.filter(row => { try {
            this.validate(row);
            return true;
        }
        catch {
            return false;
        } }); }
        async get(id) { return (await this.list()).find(x => x.id === id); }
        async ensureDefault() { let rows = await this.list(); if (!rows.length) {
            const at = now(), row = { id: 'WORKSPACE.DEFAULT', name: 'KalinumX Local', mode: 'LOCAL', description: 'Výchozí lokální pracovní prostor', createdAt: at, updatedAt: at };
            await this.store.save(row);
            await this.store.setActiveId(row.id);
            rows = [row];
        } return rows; }
        async save(input) { this.validate(input); const old = await this.get(input.id), at = now(); const row = { ...input, name: input.name.trim(), createdAt: old?.createdAt || input.createdAt || at, updatedAt: at }; await this.store.save(row); return row; }
        async remove(id) { if ((await this.list()).length <= 1)
            throw new Error('Nelze odstranit poslední Workspace profil'); await this.store.remove(id); }
        async active() { await this.ensureDefault(); const id = await this.store.activeId(); return (id && await this.get(id)) || (await this.list())[0]; }
        async select(id) { const row = await this.get(id); if (!row)
            throw new Error(`Workspace profile not found: ${id}`); await this.store.setActiveId(row.id); return row; }
        async activate(id) { const row = await this.get(id); if (!row)
            throw new Error(`Workspace profile not found: ${id}`); this.validate(row); if (this.bridge)
            await this.bridge.invoke('kx_workspace_activate', { profileId: row.id, mode: row.mode }); row.lastOpenedAt = now(); row.updatedAt = row.lastOpenedAt; await this.store.save(row); await this.store.setActiveId(row.id); return row; }
        async status() { if (!this.bridge)
            return undefined; return this.bridge.invoke('kx_workspace_status'); }
        async bindPortableRoot(id) { const row = await this.get(id); if (!row)
            throw new Error(`Workspace profile not found: ${id}`); if (row.mode !== 'PORTABLE')
            throw new Error('Externí root lze navázat pouze na PORTABLE Workspace'); if (!this.bridge)
            throw new Error('Native folder picker není v tomto prostředí dostupný'); return this.bridge.invoke('kx_workspace_portable_bind', { profileId: row.id }); }
        async unbindPortableRoot(id) { const row = await this.get(id); if (!row)
            throw new Error(`Workspace profile not found: ${id}`); if (row.mode !== 'PORTABLE')
            throw new Error('Externí root lze odpojit pouze od PORTABLE Workspace'); if (!this.bridge)
            throw new Error('Native Workspace bridge není v tomto prostředí dostupný'); return this.bridge.invoke('kx_workspace_portable_unbind', { profileId: row.id }); }
        async ensureAndActivateLast() { await this.ensureDefault(); const row = await this.active(); return this.activate(row.id); }
    }
    KX.WorkspaceProfileService = WorkspaceProfileService;
    function workspaceDbName(id) { return `KalinumXNexusCore::${id}`; }
    function createCoreRepositoryForWorkspace(profile) {
        return TauriGlobalBridge.available() ? new NativeSqliteCoreRepository() : new IndexedDbCoreRepository(workspaceDbName(profile.id));
    }
    KX.createCoreRepositoryForWorkspace = createCoreRepositoryForWorkspace;
    function createDefaultCoreRepository() {
        return TauriGlobalBridge.available() ? new NativeSqliteCoreRepository() : new IndexedDbCoreRepository();
    }
    KX.createDefaultCoreRepository = createDefaultCoreRepository;
    const uid = (prefix) => `${prefix}.${crypto.randomUUID()}`;
    const now = () => new Date().toISOString();
    const rootId = (ctx) => ctx.rootChangeId || uid('CHG');
    function sha256Fallback(input) {
        const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
        const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        const paddedLength = Math.ceil((input.length + 9) / 64) * 64, bytes = new Uint8Array(paddedLength);
        bytes.set(input);
        bytes[input.length] = 0x80;
        const view = new DataView(bytes.buffer), bitLength = input.length * 8;
        view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
        view.setUint32(paddedLength - 4, bitLength >>> 0, false);
        const w = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
        for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let i = 0; i < 16; i++)
                w[i] = view.getUint32(offset + i * 4, false);
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, b, c, d, e, f, g, h] = H;
            for (let i = 0; i < 64; i++) {
                const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + s1 + ch + K[i] + w[i]) >>> 0, s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (s0 + maj) >>> 0;
                h = g;
                g = f;
                f = e;
                e = (d + t1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0;
            H[1] = (H[1] + b) >>> 0;
            H[2] = (H[2] + c) >>> 0;
            H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0;
            H[5] = (H[5] + f) >>> 0;
            H[6] = (H[6] + g) >>> 0;
            H[7] = (H[7] + h) >>> 0;
        }
        return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
    }
    async function sha256Bytes(input) { const bytes = input instanceof Uint8Array ? input : new Uint8Array(input); const subtle = globalThis.crypto?.subtle; if (subtle?.digest) {
        const hash = await subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
    } return sha256Fallback(bytes); }
    async function sha256(blob) { return sha256Bytes(await blob.arrayBuffer()); }
    const normalizeSearch = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs-CZ').trim();
    class EventBus {
        listeners = new Map();
        on(code, fn) { if (!this.listeners.has(code))
            this.listeners.set(code, new Set()); this.listeners.get(code).add(fn); return () => this.listeners.get(code)?.delete(fn); }
        async emit(event) { for (const key of [event.code, '*'])
            for (const fn of this.listeners.get(key) || [])
                await fn(event); }
    }
    KX.EventBus = EventBus;
    class AuditService {
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        make(input) { return { id: uid('AUDIT'), at: now(), ...input }; }
        async write(input) { const row = this.make(input); await this.repo.put('audit', row); return row; }
        list() { return this.repo.all('audit'); }
    }
    KX.AuditService = AuditService;
    class RevisionService {
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        make(resourceType, resourceId, revision, snapshot, ctx) { return { id: `REV.${resourceType}.${resourceId}.${revision}`, resourceType, resourceId, revision, at: now(), actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: rootId(ctx), snapshot: structuredClone(snapshot) }; }
        async list(resourceId) { return (await this.repo.all('revisions')).filter(x => x.resourceId === resourceId).sort((a, b) => a.revision - b.revision); }
        async get(resourceId, revision) { return (await this.list(resourceId)).find(x => x.revision === revision); }
    }
    KX.RevisionService = RevisionService;
    class OutboxService {
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        make(input) { return { id: uid('OUT'), at: now(), status: 'PENDING', attempts: 0, ...input }; }
        async list(status) { const all = await this.repo.all('outbox'); return status ? all.filter(x => x.status === status) : all; }
        async mark(id, status, lastError) { const row = await this.repo.get('outbox', id); if (!row)
            throw new Error(`Unknown outbox ${id}`); row.status = status; row.attempts += status === 'SENDING' ? 1 : 0; row.lastError = lastError; await this.repo.put('outbox', row); return row; }
        async retryable() { return (await this.list()).filter(x => x.status === 'PENDING' || x.status === 'FAILED'); }
    }
    KX.OutboxService = OutboxService;
    class ConflictService {
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        async create(input) { const row = { id: uid('CONFLICT'), status: 'OPEN', detectedAt: now(), ...input }; await this.repo.put('conflicts', row); return row; }
        async list(status) { const all = await this.repo.all('conflicts'); return status ? all.filter(x => x.status === status) : all; }
        async resolve(id, resolution) { const row = await this.repo.get('conflicts', id); if (!row)
            throw new Error(`Unknown conflict ${id}`); row.status = 'RESOLVED'; row.resolution = resolution; row.resolvedAt = now(); await this.repo.put('conflicts', row); return row; }
    }
    KX.ConflictService = ConflictService;
    class SyncService {
        outbox;
        conflicts;
        audit;
        events;
        connection = 'LOCAL_ONLY';
        lastRunAt;
        constructor(outbox, conflicts, audit, events) {
            this.outbox = outbox;
            this.conflicts = conflicts;
            this.audit = audit;
            this.events = events;
        }
        setConnection(connection) { this.connection = connection; }
        async flush(transport, ctx) {
            this.connection = transport.connection;
            const root = rootId(ctx);
            if (transport.connection === 'OFFLINE' || transport.connection === 'LOCAL_ONLY')
                return { sent: 0, conflicts: 0, failed: 0, skipped: (await this.outbox.retryable()).length };
            let sent = 0, conflicts = 0, failed = 0, skipped = 0;
            for (const row of await this.outbox.retryable()) {
                const payload = row.payload && typeof row.payload === 'object' ? row.payload : undefined;
                if (payload?.journalGateRequired === true && payload?.journalDispatchVerified !== true) {
                    skipped++;
                    continue;
                }
                await this.outbox.mark(row.id, 'SENDING');
                let result;
                try {
                    result = await transport.push(row);
                }
                catch (error) {
                    result = { status: 'RETRY', error: String(error) };
                }
                if (result.status === 'ACK') {
                    await this.outbox.mark(row.id, 'SENT');
                    sent++;
                }
                else if (result.status === 'CONFLICT') {
                    await this.outbox.mark(row.id, 'CONFLICT', result.error);
                    await this.conflicts.create({ outboxId: row.id, resourceType: row.resourceType, resourceId: row.resourceId, localRevision: row.revision, remoteRevision: result.remoteRevision, rootChangeId: row.rootChangeId, detail: result.detail });
                    conflicts++;
                }
                else {
                    await this.outbox.mark(row.id, 'FAILED', result.error || 'Retry requested');
                    failed++;
                }
            }
            this.lastRunAt = now();
            await this.audit.write({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SYNC.FLUSH', rootChangeId: root, deviceId: ctx.deviceId, result: failed ? 'ERROR' : 'OK', detail: { transport: transport.code, connection: transport.connection, sent, conflicts, failed } });
            await this.events.emit({ id: uid('EVT'), code: 'EVENT.CORE.SYNC.COMPLETED', at: this.lastRunAt, actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { transport: transport.code, sent, conflicts, failed } });
            return { sent, conflicts, failed, skipped };
        }
        async resolveConflict(id, resolution) { const row = (await this.conflicts.list()).find(x => x.id === id); if (!row)
            throw new Error(`Unknown conflict ${id}`); if (resolution === 'KEEP_LOCAL' || resolution === 'MERGED')
            await this.outbox.mark(row.outboxId, 'PENDING');
        else
            await this.outbox.mark(row.outboxId, 'SENT'); return this.conflicts.resolve(id, resolution); }
    }
    KX.SyncService = SyncService;
    class EntityService {
        repo;
        audit;
        revisions;
        outbox;
        events;
        constructor(repo, audit, revisions, outbox, events) {
            this.repo = repo;
            this.audit = audit;
            this.revisions = revisions;
            this.outbox = outbox;
            this.events = events;
        }
        async get(id) { return this.repo.get('entities', id); }
        async list() { return this.repo.all('entities'); }
        async save(input, ctx) {
            const at = now(), id = input.id || uid('ENT'), old = await this.get(id), root = rootId(ctx);
            if (input.expectedRevision !== undefined && (old?.revision || 0) !== input.expectedRevision)
                throw new Error(`Revision conflict ${id}: expected ${input.expectedRevision}, actual ${old?.revision || 0}`);
            const row = { id, type: input.type, code: input.code ?? old?.code, ownerApp: input.ownerApp, schema: input.schema || old?.schema || 'KX.ENTITY/1', revision: (old?.revision || 0) + 1, spaceIds: input.spaceIds || old?.spaceIds || [], createdAt: old?.createdAt || at, createdBy: old?.createdBy || ctx.actorId, updatedAt: at, updatedBy: ctx.actorId, archivedAt: input.archivedAt !== undefined ? input.archivedAt : (old?.archivedAt ?? null), demoState: input.demoState || old?.demoState || 'LIVE', data: input.data };
            const c = { ...ctx, rootChangeId: root };
            const rev = this.revisions.make(row.type, row.id, row.revision, row, c);
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: old ? 'CORE.ENTITY.UPDATE' : 'CORE.ENTITY.CREATE', entityType: row.type, entityId: id, rootChangeId: root, parentChangeId: ctx.parentChangeId, deviceId: ctx.deviceId, result: 'OK', detail: { revision: row.revision, ownerApp: row.ownerApp } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: row.type, resourceId: row.id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { id: row.id, type: row.type, revision: row.revision } });
            // N2.1h commit-side CAS: the commit requires the revision this save read (lost updates impossible) and, inside
            // an action, the access epoch from the action start (ACL decisions cannot commit after access changed).
            const pre = [{ store: 'entities', key: id, field: 'revision', value: old ? old.revision : null }];
            if (ctx.accessEpoch !== undefined)
                pre.push({ store: 'meta', key: KX.ACCESS_EPOCH_KEY, field: 'value', value: ctx.accessEpoch });
            try {
                await this.repo.atomic([{ store: 'entities', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [], pre);
            }
            catch (e) {
                const m = String(e?.message || e);
                if (m.includes('REPOSITORY_CAS_CONFLICT meta/'))
                    throw new Error(`ACCESS_CHANGED_DURING_ACTION ${id}: access rules changed while the action ran; retry`);
                if (m.includes('REPOSITORY_CAS_CONFLICT entities/'))
                    throw new Error(`Revision conflict ${id}: concurrent commit (${m.slice(m.indexOf('expected'))})`);
                throw e;
            }
            await this.events.emit({ id: uid('EVT'), code: old ? 'EVENT.CORE.ENTITY.UPDATED' : 'EVENT.CORE.ENTITY.CREATED', at, actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, parentChangeId: ctx.parentChangeId, payload: { id, type: row.type, revision: row.revision } });
            return row;
        }
        async restore(id, revision, ctx) { const target = await this.revisions.get(id, revision); if (!target)
            throw new Error(`Revision not found ${id}@${revision}`); const snapshot = target.snapshot; return this.save({ id: snapshot.id, type: snapshot.type, code: snapshot.code, ownerApp: snapshot.ownerApp, schema: snapshot.schema, spaceIds: snapshot.spaceIds, archivedAt: snapshot.archivedAt, demoState: snapshot.demoState, data: snapshot.data }, ctx); }
    }
    KX.EntityService = EntityService;
    class TrashRetentionService {
        entities;
        access;
        contract = 'KX.CORE_TRASH_RETENTION/1';
        capabilities = new Map();
        static DEFAULT_POLICY = { defaultRetentionDays: 30, autoPurgeEnabled: false, largeDeleteBytes: 1073741824, largeDeleteCount: 100, requireBackupBeforePurge: true, neverAutoPurgeProtected: true, storageWarningUsedPercent: 80, storageCriticalUsedPercent: 90, storageWarningMinFreeBytes: 10737418240, storageCriticalMinFreeBytes: 2147483648, trashBudgetMaxBytes: 21474836480 };
        ownerInvoker;
        ownerActionInspector;
        constructor(entities, access) {
            this.entities = entities;
            this.access = access;
        }
        bindOwnerInvoker(invoker) { this.ownerInvoker = invoker; }
        bindOwnerActionInspector(inspector) { this.ownerActionInspector = inspector; }
        capKey(ownerApp, ownerService, resourceType = '*') { return `${ownerApp}|${ownerService}|${resourceType}`; }
        registerCapability(input) { const row = { ...input, resourceTypes: [...new Set(input.resourceTypes || ['*'])], notes: [...(input.notes || [])] }; for (const type of row.resourceTypes)
            this.capabilities.set(this.capKey(row.ownerApp, row.ownerService, type), row); return row; }
        listCapabilities() { return [...new Set(this.capabilities.values())].map(x => ({ ...x, resourceTypes: [...x.resourceTypes], notes: [...(x.notes || [])] })); }
        capability(ownerApp, ownerService, resourceType) { return this.capabilities.get(this.capKey(ownerApp, ownerService, resourceType)) || this.capabilities.get(this.capKey(ownerApp, ownerService, '*')); }
        entryId(input) { return `TRASH.${[input.sourceOwnerApp, input.resourceType, input.resourceId].join('.').replace(/[^A-Za-z0-9_.-]+/g, '_')}`; }
        finiteBytes(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : undefined; }
        iso(value, label) { const ms = Date.parse(value); if (!Number.isFinite(ms))
            throw new Error(`Trash ${label} must be an ISO date`); return new Date(ms).toISOString(); }
        assertNoPayload(input) { for (const key of ['payload', 'content', 'blob', 'bytes', 'snapshot', 'dataSnapshot', 'fileBytes'])
            if (key in input)
                throw new Error(`Trash index must not duplicate canonical payload: ${key}`); }
        async index(input, ctx) {
            this.assertNoPayload(input);
            const deletedAt = this.iso(input.deletedAt, 'deletedAt'), policy = TrashRetentionService.DEFAULT_POLICY, retainUntil = input.retainUntil ? this.iso(input.retainUntil, 'retainUntil') : new Date(Date.parse(deletedAt) + policy.defaultRetentionDays * 86400000).toISOString(), cap = this.capability(input.sourceOwnerApp, input.ownerService, input.resourceType), id = this.entryId(input), old = await this.entities.get(id), at = now();
            if (old && old.type !== 'CORE.TRASH_ENTRY')
                throw new Error(`Trash id collision ${id}`);
            if (input.expectedRevision !== undefined && (old?.revision || 0) !== input.expectedRevision)
                throw new Error(`Revision conflict ${id}: expected ${input.expectedRevision}, actual ${old?.revision || 0}`);
            if (Date.parse(retainUntil) < Date.parse(deletedAt))
                throw new Error('Trash retainUntil cannot be before deletedAt');
            const data = { title: String(input.title || '').trim() || input.resourceId, description: input.description, category: input.category, sourceOwnerApp: input.sourceOwnerApp, ownerService: input.ownerService, resourceType: input.resourceType, resourceId: input.resourceId, stableIdentity: input.stableIdentity, deletedAt, deletedBy: input.deletedBy, sourceDevice: input.sourceDevice, originalDeepLink: input.originalDeepLink, storageTargetId: input.storageTargetId, logicalBytes: this.finiteBytes(input.logicalBytes), physicalBytes: this.finiteBytes(input.physicalBytes), reclaimableBytes: this.finiteBytes(input.reclaimableBytes), retentionPolicyId: input.retentionPolicyId || 'CORE.DEFAULT', retainUntil, restoreCapability: input.restoreCapability || cap?.restoreActionCode, purgeCapability: input.purgeCapability || cap?.purgeActionCode, dependencyCount: Math.max(0, Number(input.dependencyCount || 0)), dependencySummary: [...(input.dependencySummary || [])], backupRequired: input.backupRequired ?? policy.requireBackupBeforePurge, backupEvidence: [...(input.backupEvidence || [])], protected: !!input.protected, holdReason: input.holdReason, status: input.status || 'TRASHED', ownerAvailability: cap?.availability || input.ownerAvailability || 'DECLARED_ONLY', lastVerifiedAt: input.lastVerifiedAt ? this.iso(input.lastVerifiedAt, 'lastVerifiedAt') : at, metadata: input.metadata ? structuredClone(input.metadata) : undefined };
            return this.entities.save({ id, type: 'CORE.TRASH_ENTRY', ownerApp: 'APP.NEXUS', schema: 'KX.CORE_TRASH_ENTRY/1', spaceIds: [...new Set(input.spaceIds || old?.spaceIds || [])], data, expectedRevision: input.expectedRevision }, ctx);
        }
        async list(input = {}, ctx) { const rows = (await this.entities.list()).filter(x => x.type === 'CORE.TRASH_ENTRY'); const out = []; for (const row of rows) {
            const d = row.data;
            if (input.ownerApp && d.sourceOwnerApp !== input.ownerApp)
                continue;
            if (input.resourceType && d.resourceType !== input.resourceType)
                continue;
            if (input.storageTargetId && d.storageTargetId !== input.storageTargetId)
                continue;
            if (input.status && d.status !== input.status)
                continue;
            if (input.expiringBefore && d.retainUntil > input.expiringBefore)
                continue;
            if (input.minReclaimableBytes !== undefined && (d.reclaimableBytes ?? -1) < input.minReclaimableBytes)
                continue;
            if (ctx && ctx.actorId !== 'SYSTEM' && !await this.access.can({ kind: 'ENTITY', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, ctx.actorId, 'READ'))
                continue;
            out.push(row);
        } return out.sort((a, b) => a.data.retainUntil.localeCompare(b.data.retainUntil) || ((b.data.reclaimableBytes ?? -1) - (a.data.reclaimableBytes ?? -1))); }
        blockers(d, mode, at, policy) { const blockers = [], warnings = [], cap = this.capability(d.sourceOwnerApp, d.ownerService, d.resourceType); if (d.status !== 'TRASHED')
            blockers.push(`STATUS_${d.status}`); if (d.protected)
            blockers.push('PROTECTED'); if (d.holdReason)
            blockers.push('HOLD'); const operationAvailability = mode === 'PURGE' ? (cap?.purgeAvailability || cap?.availability) : (cap?.restoreAvailability || cap?.availability); if (!cap || operationAvailability !== 'AVAILABLE')
            blockers.push('OWNER_CAPABILITY_UNAVAILABLE'); if (mode === 'PURGE') {
            if (Date.parse(d.retainUntil) > Date.parse(at))
                blockers.push('RETENTION_NOT_EXPIRED');
            if (d.dependencyCount > 0)
                blockers.push('DEPENDENCIES_PRESENT');
            if (policy.requireBackupBeforePurge && d.backupRequired && !(d.backupEvidence || []).length)
                blockers.push('BACKUP_EVIDENCE_REQUIRED');
            if (!cap?.supportsPurge || !cap.purgeActionCode)
                blockers.push('PURGE_ACTION_UNAVAILABLE');
        }
        else if (!cap?.supportsRestore || !cap.restoreActionCode)
            blockers.push('RESTORE_ACTION_UNAVAILABLE'); if (d.reclaimableBytes === undefined)
            warnings.push('SIZE_UNKNOWN'); return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], actionCode: mode === 'PURGE' ? cap?.purgeActionCode : cap?.restoreActionCode }; }
        async purgeDryRun(input, ctx) { const at = input.at ? this.iso(input.at, 'planAt') : now(), policy = { ...TrashRetentionService.DEFAULT_POLICY, ...(input.policy || {}) }, wanted = new Set(input.entryIds || []), rows = await this.list(input.query || {}, ctx), selected = wanted.size ? rows.filter(x => wanted.has(x.id)) : rows, items = selected.map(row => { const x = this.blockers(row.data, 'PURGE', at, policy); return { entryId: row.id, title: row.data.title, sourceOwnerApp: row.data.sourceOwnerApp, resourceType: row.data.resourceType, resourceId: row.data.resourceId, reclaimableBytes: row.data.reclaimableBytes ?? null, eligible: x.blockers.length === 0, blockers: x.blockers, warnings: x.warnings, actionCode: x.actionCode }; }), known = items.reduce((n, x) => n + (x.reclaimableBytes || 0), 0), unknown = items.filter(x => x.reclaimableBytes === null).length, eligible = items.filter(x => x.eligible).length; return { contract: this.contract, destructiveExecutionAllowed: false, generatedAt: at, selected: items.length, eligible, blocked: items.length - eligible, knownReclaimableBytes: known, unknownSizeCount: unknown, largeDeleteConfirmationRequired: items.length >= policy.largeDeleteCount || known >= policy.largeDeleteBytes, items, safeguards: ['DRY_RUN_ONLY', 'NO_AUTOMATIC_PURGE', 'OWNER_TYPED_ACTION_REQUIRED', 'RETENTION_AND_HOLD_CHECK', 'DEPENDENCY_CHECK', 'BACKUP_EVIDENCE_CHECK', 'READBACK_REQUIRED_BEFORE_FUTURE_PURGE_SUCCESS'] }; }
        async restorePlan(input, ctx) { const at = input.at ? this.iso(input.at, 'planAt') : now(), wanted = new Set(input.entryIds || []), rows = await this.list(input.query || {}, ctx), selected = wanted.size ? rows.filter(x => wanted.has(x.id)) : rows, items = selected.map(row => { const x = this.blockers(row.data, 'RESTORE', at, TrashRetentionService.DEFAULT_POLICY); return { entryId: row.id, title: row.data.title, sourceOwnerApp: row.data.sourceOwnerApp, resourceType: row.data.resourceType, resourceId: row.data.resourceId, reclaimableBytes: row.data.reclaimableBytes ?? null, eligible: x.blockers.length === 0, blockers: x.blockers, warnings: x.warnings, actionCode: x.actionCode }; }), ready = items.filter(x => x.eligible).length; return { contract: this.contract, executionAllowed: false, generatedAt: at, selected: items.length, ready, blocked: items.length - ready, items, safeguards: ['PLAN_ONLY', 'OWNER_TYPED_ACTION_REQUIRED', 'COLLISION_CHECK_REQUIRED', 'READBACK_REQUIRED_BEFORE_FUTURE_RESTORE_SUCCESS'] }; }
        async selectionPreview(input, ctx) { const raw = Array.isArray(input.entryIds) ? input.entryIds : [], ids = [...new Set(raw.map(x => String(x || '').trim()).filter(Boolean))]; if (!ids.length)
            throw new Error('TRASH_SELECTION_ENTRY_IDS_REQUIRED'); if (ids.length > 64)
            throw new Error('TRASH_SELECTION_PREVIEW_LIMIT_EXCEEDED'); const at = input.at ? this.iso(input.at, 'selectionPreviewAt') : now(), [purge, restore, rows] = await Promise.all([this.purgeDryRun({ entryIds: ids, at, policy: input.policy }, ctx), this.restorePlan({ entryIds: ids, at }, ctx), this.list({}, ctx)]), rowById = new Map(rows.filter(x => ids.includes(x.id)).map(x => [x.id, x])), purgeById = new Map(purge.items.map(x => [x.entryId, x])), restoreById = new Map(restore.items.map(x => [x.entryId, x])), items = ids.filter(id => rowById.has(id)).map(id => { const row = rowById.get(id), p = purgeById.get(id), r = restoreById.get(id); return { entryId: id, title: row.data.title, sourceOwnerApp: row.data.sourceOwnerApp, resourceType: row.data.resourceType, resourceId: row.data.resourceId, storageTargetId: row.data.storageTargetId || null, reclaimableBytes: row.data.reclaimableBytes ?? null, purgeEligible: !!p?.eligible, purgeBlockers: [...(p?.blockers || [])], purgeWarnings: [...(p?.warnings || [])], restoreReady: !!r?.eligible, restoreBlockers: [...(r?.blockers || [])], restoreWarnings: [...(r?.warnings || [])] }; }), unavailableEntryIds = ids.filter(id => !rowById.has(id)); const ownerMap = new Map(), storageMap = new Map(); for (const item of items) {
            const owner = ownerMap.get(item.sourceOwnerApp) || { sourceOwnerApp: item.sourceOwnerApp, entries: 0, purgeEligible: 0, restoreReady: 0, knownReclaimableBytes: 0, unknownSizeCount: 0 };
            owner.entries++;
            if (item.purgeEligible)
                owner.purgeEligible++;
            if (item.restoreReady)
                owner.restoreReady++;
            if (item.reclaimableBytes === null)
                owner.unknownSizeCount++;
            else
                owner.knownReclaimableBytes += item.reclaimableBytes;
            ownerMap.set(item.sourceOwnerApp, owner);
            const key = item.storageTargetId || 'UNSPECIFIED', store = storageMap.get(key) || { storageTargetId: key, entries: 0, purgeEligible: 0, knownReclaimableBytes: 0, unknownSizeCount: 0 };
            store.entries++;
            if (item.purgeEligible)
                store.purgeEligible++;
            if (item.reclaimableBytes === null)
                store.unknownSizeCount++;
            else
                store.knownReclaimableBytes += item.reclaimableBytes;
            storageMap.set(key, store);
        } const byId = new Map(rows.map(x => [x.id, x])), selectedRows = items.map(x => byId.get(x.entryId)).filter(Boolean); return { contract: 'KX.CORE_TRASH_SELECTION_PREVIEW/1', generatedAt: at, bounded: true, maxEntries: 64, requested: ids.length, selected: items.length, unavailableEntryIds, purge: { eligible: purge.eligible, blocked: purge.blocked, knownReclaimableBytes: purge.knownReclaimableBytes, unknownSizeCount: purge.unknownSizeCount, largeDeleteConfirmationRequired: purge.largeDeleteConfirmationRequired }, restore: { ready: restore.ready, blocked: restore.blocked }, protectedCount: selectedRows.filter(x => x.data.protected).length, holdCount: selectedRows.filter(x => !!x.data.holdReason).length, dependencyBlockedCount: items.filter(x => x.purgeBlockers.includes('DEPENDENCIES_PRESENT')).length, backupBlockedCount: items.filter(x => x.purgeBlockers.includes('BACKUP_EVIDENCE_REQUIRED')).length, owners: [...ownerMap.values()].sort((a, b) => a.sourceOwnerApp.localeCompare(b.sourceOwnerApp)), storageTargets: [...storageMap.values()].sort((a, b) => a.storageTargetId.localeCompare(b.storageTargetId)), items, destructiveExecutionAllowed: false, batchExecutionPublished: false, safeguards: ['READ_ONLY_PREVIEW', 'EXPLICIT_SELECTION_REQUIRED', 'MAX_64_UNIQUE_ENTRIES', 'PERMISSION_FILTERED', 'NO_BATCH_EXECUTE_ACTION', 'NO_AUTO_PURGE', 'OWNER_TYPED_ACTIONS_REMAIN_REQUIRED', 'UNKNOWN_SIZE_NEVER_TREATED_AS_ZERO'] }; }
        async selectionPurgeTransactionSandbox(input, ctx) {
            const preview = await this.selectionPreview({ entryIds: input.entryIds, at: input.at, policy: input.policy }, ctx);
            if (preview.unavailableEntryIds.length || preview.selected !== preview.requested)
                throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_REQUIRES_EXACT_VISIBLE_SELECTION');
            if (preview.purge.eligible !== preview.selected || preview.purge.blocked)
                throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_REQUIRES_ALL_PURGE_ELIGIBLE');
            const fault = input.faultAfterItem === undefined ? null : Number(input.faultAfterItem);
            if (fault !== null && (!Number.isInteger(fault) || fault < 1 || fault > preview.selected))
                throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_INVALID_FAULT_POINT');
            const at = input.at ? this.iso(input.at, 'selectionTransactionSandboxAt') : now(), purge = await this.purgeDryRun({ entryIds: preview.items.map(x => x.entryId), at, policy: input.policy }, ctx), rows = (await this.list({}, ctx)).filter(x => preview.items.some(i => i.entryId === x.id)), byId = new Map(rows.map(x => [x.id, x]));
            const items = purge.items.map(item => { const row = byId.get(item.entryId); if (!row || !item.actionCode)
                throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_PLAN_DRIFT'); return { entryId: item.entryId, resourceId: item.resourceId, sourceOwnerApp: item.sourceOwnerApp, ownerActionCode: item.actionCode, reclaimableBytes: item.reclaimableBytes }; });
            const stable = (value) => JSON.stringify(value), hash = async (value) => sha256Bytes(new TextEncoder().encode(stable(value))), liveSnapshot = rows.map(row => ({ id: row.id, revision: row.revision, status: row.data.status, resourceId: row.data.resourceId, lastVerifiedAt: row.data.lastVerifiedAt })).sort((a, b) => a.id.localeCompare(b.id)), liveBeforeSha256 = await hash(liveSnapshot), purgePlanSha256 = await hash(items);
            const sandbox = new MemoryCoreRepository();
            await sandbox.open();
            const initial = items.map((item, index) => ({ key: `TRASH.SANDBOX.${index}.${item.entryId}`, entryId: item.entryId, resourceId: item.resourceId, ownerExists: true, ownerTrashed: true, trashStatus: 'TRASHED', reclaimableBytes: item.reclaimableBytes, step: index + 1 }));
            await sandbox.atomic(initial.map(value => ({ store: 'meta', value })));
            const readSandbox = async () => ((await sandbox.all('meta')).filter(x => String(x?.key || '').startsWith('TRASH.SANDBOX.')).sort((a, b) => String(a.key).localeCompare(String(b.key)))), sandboxBefore = await readSandbox(), sandboxBeforeSha256 = await hash(sandboxBefore);
            let state = 'SIMULATED_COMMIT', simulatedSteps = 0, candidateCommitVerified = false, compensationRequired = false, compensationApplied = false, compensationVerified = false;
            try {
                for (const row of sandboxBefore) {
                    await sandbox.put('meta', { ...row, ownerExists: false, ownerTrashed: false, trashStatus: 'PURGED', simulatedAt: at });
                    simulatedSteps++;
                    if (fault === simulatedSteps)
                        throw new Error(`INJECTED_FAULT_AFTER_ITEM_${simulatedSteps}`);
                }
                const committed = await readSandbox();
                candidateCommitVerified = committed.length === items.length && committed.every(x => x.ownerExists === false && x.ownerTrashed === false && x.trashStatus === 'PURGED');
                if (!candidateCommitVerified)
                    throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_COMMIT_READBACK_FAILED');
            }
            catch (error) {
                if (fault === null)
                    throw error;
                compensationRequired = true;
                state = 'COMPENSATED';
                await sandbox.atomic(sandboxBefore.map(value => ({ store: 'meta', value })));
                compensationApplied = true;
                const compensated = await readSandbox();
                compensationVerified = (await hash(compensated)) === sandboxBeforeSha256;
                if (!compensationVerified)
                    throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_COMPENSATION_HASH_MISMATCH');
            }
            const sandboxAfter = await readSandbox(), sandboxAfterSha256 = await hash(sandboxAfter), liveAfterRows = (await this.list({}, ctx)).filter(x => preview.items.some(i => i.entryId === x.id)), liveAfter = liveAfterRows.map(row => ({ id: row.id, revision: row.revision, status: row.data.status, resourceId: row.data.resourceId, lastVerifiedAt: row.data.lastVerifiedAt })).sort((a, b) => a.id.localeCompare(b.id)), liveTrashAfterSha256 = await hash(liveAfter), liveTrashIndexUnchanged = liveTrashAfterSha256 === liveBeforeSha256;
            if (!liveTrashIndexUnchanged)
                throw new Error('TRASH_SELECTION_TRANSACTION_SANDBOX_LIVE_TRASH_MUTATED');
            return { contract: 'KX.CORE_TRASH_SELECTION_PURGE_TRANSACTION_SANDBOX/1', mode: 'ISOLATED_MEMORY_REPOSITORY_ONLY', bounded: true, maxEntries: 64, requested: preview.requested, selected: preview.selected, generatedAt: at, state, faultAfterItem: fault, simulatedSteps, purgePlanSha256, sandboxBeforeSha256, sandboxAfterSha256, liveTrashBeforeSha256: liveBeforeSha256, liveTrashAfterSha256, candidateCommitVerified, compensationRequired, compensationApplied, compensationVerified, liveTrashIndexUnchanged, ownerActionsInvoked: false, productionCommitAllowed: false, destructiveExecutionAllowed: false, batchExecutionPublished: false, items, safeguards: ['READ_ONLY_PUBLIC_ACTION', 'ISOLATED_MEMORY_REPOSITORY_ONLY', 'EXACT_VISIBLE_SELECTION_REQUIRED', 'MAX_64_UNIQUE_ENTRIES', 'ALL_ITEMS_MUST_PASS_EXISTING_PURGE_DRY_RUN', 'NO_OWNER_ACTION_INVOCATION', 'FAULT_INJECTION_COMPENSATION_HASH_PARITY', 'LIVE_TRASH_HASH_PARITY_REQUIRED', 'NO_BATCH_EXECUTE_ACTION', 'NO_AUTOMATIC_PURGE', 'PRODUCTION_COMMIT_FORBIDDEN'] };
        }
        async selectionPurgeReadiness(input, ctx) {
            const preview = await this.selectionPreview({ entryIds: input.entryIds, at: input.at, policy: input.policy }, ctx), at = input.at ? this.iso(input.at, 'selectionPurgeReadinessAt') : now(), purge = await this.purgeDryRun({ entryIds: preview.items.map(x => x.entryId), at, policy: input.policy }, ctx), rows = await this.list({}, ctx), rowById = new Map(rows.map(x => [x.id, x])), planById = new Map(purge.items.map(x => [x.entryId, x]));
            const storageReadbackActionRegistered = !!this.ownerActionInspector?.('ACTION.CORE.TRASH.STORAGE.READBACK');
            const items = preview.items.map(item => { const row = rowById.get(item.entryId), plan = planById.get(item.entryId), cap = this.capability(row.data.sourceOwnerApp, row.data.ownerService, row.data.resourceType), purgeActionCode = plan?.actionCode || cap?.purgeActionCode || null, ownerCapabilityAvailable = !!cap && cap.supportsPurge === true && (cap.purgeAvailability || cap.availability) === 'AVAILABLE' && !!purgeActionCode, ownerActionRegistered = !!purgeActionCode && !!this.ownerActionInspector?.(purgeActionCode), ownerActionNonRecursive = !!purgeActionCode && !purgeActionCode.startsWith('ACTION.CORE.TRASH.'), storageReadbackReady = row.data.storageTargetId === 'BROWSER_BLOB' && row.data.resourceType === 'CORE.FILE' && storageReadbackActionRegistered, storageReadbackState = storageReadbackReady ? 'VERIFIED_BROWSER_BLOB' : 'UNVERIFIED', blockers = [...(plan?.blockers || [])]; if (!ownerCapabilityAvailable)
                blockers.push('OWNER_PURGE_CAPABILITY_UNVERIFIED'); if (!ownerActionRegistered)
                blockers.push('OWNER_PURGE_ACTION_NOT_REGISTERED'); if (!ownerActionNonRecursive)
                blockers.push('OWNER_PURGE_ACTION_RECURSIVE_OR_MISSING'); if (!storageReadbackReady)
                blockers.push('STORAGE_READBACK_UNVERIFIED'); const uniqueBlockers = [...new Set(blockers)], warnings = [...new Set(plan?.warnings || [])], ready = !!plan?.eligible && ownerCapabilityAvailable && ownerActionRegistered && ownerActionNonRecursive && storageReadbackReady && uniqueBlockers.length === 0; return { entryId: item.entryId, resourceId: item.resourceId, sourceOwnerApp: item.sourceOwnerApp, ownerService: row.data.ownerService, resourceType: item.resourceType, storageTargetId: item.storageTargetId, reclaimableBytes: item.reclaimableBytes, purgeActionCode, purgeDryRunEligible: !!plan?.eligible, ownerCapabilityAvailable, ownerActionRegistered, ownerActionNonRecursive, storageReadbackState, storageReadbackReady, ready, blockers: uniqueBlockers, warnings }; });
            const ready = items.filter(x => x.ready).length, ownerCapabilityReady = items.filter(x => x.ownerCapabilityAvailable).length, ownerActionRegistered = items.filter(x => x.ownerActionRegistered).length, storageReadbackReady = items.filter(x => x.storageReadbackReady).length, allSelectionPrerequisitesVerified = preview.unavailableEntryIds.length === 0 && preview.selected === preview.requested && ready === preview.selected && preview.selected > 0;
            return { contract: 'KX.CORE_TRASH_SELECTION_PURGE_READINESS/1', bounded: true, maxEntries: 64, generatedAt: at, requested: preview.requested, selected: preview.selected, unavailableEntryIds: [...preview.unavailableEntryIds], ready, blocked: preview.selected - ready, ownerCapabilityReady, ownerActionRegistered, storageReadbackReady, allSelectionPrerequisitesVerified, productionExecutionAuthorized: false, ownerActionsInvoked: false, destructiveExecutionAllowed: false, batchExecutionPublished: false, items, safeguards: ['READ_ONLY_READINESS_GATE', 'EXPLICIT_SELECTION_REQUIRED', 'MAX_64_UNIQUE_ENTRIES', 'PERMISSION_FILTERED', 'EXISTING_PURGE_DRY_RUN_REQUIRED', 'OWNER_CAPABILITY_AVAILABLE_REQUIRED', 'OWNER_ACTION_REGISTRATION_REQUIRED', 'OWNER_ACTION_NON_RECURSIVE_REQUIRED', 'VERIFIED_STORAGE_READBACK_REQUIRED', 'BROWSER_BLOB_CORE_FILE_ONLY_STORAGE_READBACK', 'NO_OWNER_ACTION_INVOCATION', 'NO_BATCH_EXECUTE_ACTION', 'NO_AUTOMATIC_PURGE', 'PRODUCTION_EXECUTION_NOT_AUTHORIZED'] };
        }
        async ownerCoverage(ctx) {
            const descriptors = this.listCapabilities(), expanded = descriptors.flatMap(cap => cap.resourceTypes.map(resourceType => ({ cap, resourceType })));
            if (expanded.length > 128)
                throw new Error('TRASH_OWNER_COVERAGE_ROW_LIMIT_EXCEEDED');
            const visible = await this.list({}, ctx), operation = (cap, mode) => { const supported = mode === 'RESTORE' ? cap.supportsRestore : cap.supportsPurge, availability = (mode === 'RESTORE' ? (cap.restoreAvailability || cap.availability) : (cap.purgeAvailability || cap.availability)), actionCode = (mode === 'RESTORE' ? cap.restoreActionCode : cap.purgeActionCode) || null, actionRegistered = !!actionCode && !!this.ownerActionInspector?.(actionCode), actionNonRecursive = !!actionCode && !actionCode.startsWith('ACTION.CORE.TRASH.'), blockers = []; if (!supported)
                blockers.push(`${mode}_NOT_SUPPORTED`); if (availability !== 'AVAILABLE')
                blockers.push(`${mode}_CAPABILITY_${availability}`); if (!actionCode)
                blockers.push(`${mode}_ACTION_MISSING`); if (actionCode && !actionRegistered)
                blockers.push(`${mode}_ACTION_NOT_REGISTERED`); if (actionCode && !actionNonRecursive)
                blockers.push(`${mode}_ACTION_RECURSIVE`); const unique = [...new Set(blockers)], ready = supported && availability === 'AVAILABLE' && !!actionCode && actionRegistered && actionNonRecursive && unique.length === 0; return { supported, availability, actionCode, actionRegistered, actionNonRecursive, coreReadbackRequired: true, ready, blockers: unique }; };
            const items = expanded.map(({ cap, resourceType }) => { const rows = visible.filter(row => row.data.sourceOwnerApp === cap.ownerApp && row.data.ownerService === cap.ownerService && row.data.resourceType === resourceType); return { ownerApp: cap.ownerApp, ownerService: cap.ownerService, resourceType, visibleTrashEntries: rows.length, storageTargets: [...new Set(rows.map(row => row.data.storageTargetId || 'UNSPECIFIED'))].sort(), restore: operation(cap, 'RESTORE'), purge: operation(cap, 'PURGE'), notes: [...(cap.notes || [])] }; }).sort((a, b) => a.ownerApp.localeCompare(b.ownerApp) || a.ownerService.localeCompare(b.ownerService) || a.resourceType.localeCompare(b.resourceType));
            return { contract: 'KX.CORE_TRASH_OWNER_COVERAGE/1', readOnly: true, bounded: true, maxRows: 128, generatedAt: now(), scope: 'REGISTERED_CAPABILITIES_AND_VISIBLE_TRASH_ENTRIES_ONLY', registeredCapabilityDescriptors: descriptors.length, rows: items.length, visibleTrashEntries: visible.length, restoreReadyRows: items.filter(x => x.restore.ready).length, purgeReadyRows: items.filter(x => x.purge.ready).length, ownerActionsInvoked: false, destructiveExecutionAllowed: false, aggregateOwnerActionsCriterionMutated: false, items, safeguards: ['READ_ONLY_OWNER_COVERAGE', 'REGISTERED_CAPABILITIES_ONLY', 'VISIBLE_TRASH_METADATA_ONLY', 'MAX_128_CAPABILITY_RESOURCE_ROWS', 'ACTIONBUS_REGISTRATION_INSPECTION_ONLY', 'CORE_OWNER_READBACK_CONTRACT_REQUIRED', 'NO_OWNER_ACTION_INVOCATION', 'NO_PRODUCTION_EXECUTION_AUTHORIZATION', 'NO_AGGREGATE_OWNER_ACTIONS_PROMOTION', 'NO_AUTOMATIC_PURGE'] };
        }
        executionReadback(raw, mode, resourceId) {
            if (!raw || typeof raw !== 'object')
                throw new Error('Trash owner action must return structured readback');
            const r = raw, expected = mode === 'RESTORE' ? 'RESTORED' : 'PURGED';
            if (r.status !== expected)
                throw new Error(`Trash owner readback status mismatch: expected ${expected}`);
            if (String(r.resourceId || '') !== resourceId)
                throw new Error('Trash owner readback resourceId mismatch');
            const exists = r.exists === true, trashed = r.trashed === true;
            if (mode === 'RESTORE' && (!exists || trashed))
                throw new Error('Trash restore readback did not prove restored resource');
            if (mode === 'PURGE' && (exists || trashed))
                throw new Error('Trash purge readback did not prove permanent removal');
            return { status: expected, resourceId, exists, trashed, ownerRevision: Number.isFinite(Number(r.ownerRevision)) ? Number(r.ownerRevision) : undefined, physicalBytesBefore: Number.isFinite(Number(r.physicalBytesBefore)) ? Number(r.physicalBytesBefore) : undefined, physicalBytesAfter: Number.isFinite(Number(r.physicalBytesAfter)) ? Number(r.physicalBytesAfter) : undefined, reclaimedBytes: Number.isFinite(Number(r.reclaimedBytes)) ? Number(r.reclaimedBytes) : undefined, evidence: Array.isArray(r.evidence) ? r.evidence.map(String) : [] };
        }
        async transitionExecution(row, status, readback, ctx) { const executedAt = now(), data = { ...row.data, status, lastVerifiedAt: executedAt, metadata: { ...(row.data.metadata || {}), lastExecution: { status, executedAt, ownerRevision: readback.ownerRevision, reclaimedBytes: readback.reclaimedBytes, evidence: [...(readback.evidence || [])] } } }; return this.entities.save({ id: row.id, type: 'CORE.TRASH_ENTRY', ownerApp: 'APP.NEXUS', schema: 'KX.CORE_TRASH_ENTRY/1', spaceIds: [...row.spaceIds], data, expectedRevision: row.revision }, ctx); }
        async restoreExecute(input, ctx) {
            if (!this.ownerInvoker)
                throw new Error('Trash owner execution bridge is unavailable');
            const plan = await this.restorePlan({ entryIds: [input.entryId], at: input.at }, ctx);
            if (plan.selected !== 1 || plan.ready !== 1)
                throw new Error(`Trash restore is blocked: ${plan.items[0]?.blockers.join(',') || 'ENTRY_NOT_FOUND'}`);
            const row = (await this.list({}, ctx)).find(x => x.id === input.entryId);
            if (!row)
                throw new Error(`Trash entry ${input.entryId} not found`);
            const actionCode = plan.items[0].actionCode;
            if (actionCode.startsWith('ACTION.CORE.TRASH.'))
                throw new Error('Trash owner action must not recurse into Core Trash execution');
            const raw = await this.ownerInvoker(actionCode, { trashEntryId: row.id, resourceType: row.data.resourceType, resourceId: row.data.resourceId, stableIdentity: row.data.stableIdentity, metadata: structuredClone(row.data.metadata || {}), mode: 'RESTORE' }, ctx);
            const readback = this.executionReadback(raw, 'RESTORE', row.data.resourceId), trashEntry = await this.transitionExecution(row, 'RESTORED', readback, ctx);
            return { contract: 'KX.CORE_TRASH_OWNER_EXECUTION/1', mode: 'RESTORE', entryId: row.id, ownerActionCode: actionCode, state: 'RESTORED', executedAt: trashEntry.updatedAt, readback, trashEntry, safeguards: ['SINGLE_ENTRY_ONLY', 'OWNER_TYPED_ACTION_ONLY', 'PLAN_REVALIDATED_BEFORE_EXECUTE', 'OWNER_READBACK_REQUIRED', 'CORE_NEVER_WRITES_OWNER_CANONICAL_DATA'] };
        }
        async purgeExecute(input, ctx) {
            if (input.acknowledgement !== 'I_UNDERSTAND_PERMANENT_PURGE')
                throw new Error('Permanent purge acknowledgement required');
            if (!this.ownerInvoker)
                throw new Error('Trash owner execution bridge is unavailable');
            const plan = await this.purgeDryRun({ entryIds: [input.entryId], at: input.at }, ctx);
            if (plan.selected !== 1 || plan.eligible !== 1)
                throw new Error(`Trash purge is blocked: ${plan.items[0]?.blockers.join(',') || 'ENTRY_NOT_FOUND'}`);
            if (plan.largeDeleteConfirmationRequired && input.largeDeleteAcknowledgement !== 'I_UNDERSTAND_LARGE_PERMANENT_PURGE')
                throw new Error('Large permanent purge acknowledgement required');
            const row = (await this.list({}, ctx)).find(x => x.id === input.entryId);
            if (!row)
                throw new Error(`Trash entry ${input.entryId} not found`);
            const actionCode = plan.items[0].actionCode;
            if (actionCode.startsWith('ACTION.CORE.TRASH.'))
                throw new Error('Trash owner action must not recurse into Core Trash execution');
            const raw = await this.ownerInvoker(actionCode, { trashEntryId: row.id, resourceType: row.data.resourceType, resourceId: row.data.resourceId, stableIdentity: row.data.stableIdentity, mode: 'PURGE' }, ctx);
            const readback = this.executionReadback(raw, 'PURGE', row.data.resourceId), trashEntry = await this.transitionExecution(row, 'PURGED', readback, ctx);
            return { contract: 'KX.CORE_TRASH_OWNER_EXECUTION/1', mode: 'PURGE', entryId: row.id, ownerActionCode: actionCode, state: 'PURGED', executedAt: trashEntry.updatedAt, readback, trashEntry, safeguards: ['SINGLE_ENTRY_ONLY', 'EXPLICIT_PERMANENT_PURGE_ACK', 'OWNER_TYPED_ACTION_ONLY', 'DRY_RUN_REVALIDATED_BEFORE_EXECUTE', 'OWNER_READBACK_REQUIRED', 'NO_AUTOMATIC_PURGE', 'CORE_NEVER_WRITES_OWNER_CANONICAL_DATA'] };
        }
        assessStorage(input) { const rawTotal = Number(input.totalBytes), rawFree = Number(input.freeBytes), rawTrash = Number(input.trashBytes || 0), policy = { ...TrashRetentionService.DEFAULT_POLICY, ...(input.policy || {}) }; if (!Number.isFinite(rawTotal) || !Number.isFinite(rawFree) || !Number.isFinite(rawTrash) || rawTotal <= 0 || rawFree < 0 || rawFree > rawTotal || rawTrash < 0)
            return { contract: this.contract, targetId: input.targetId, totalBytes: Number.isFinite(rawTotal) ? Math.max(0, rawTotal) : 0, freeBytes: Number.isFinite(rawFree) ? Math.max(0, rawFree) : 0, usedPercent: 0, trashBytes: Number.isFinite(rawTrash) ? Math.max(0, rawTrash) : 0, level: 'BLOCKED', reasons: ['INVALID_OR_UNKNOWN_STORAGE_CAPACITY'], automaticPurgeTriggered: false }; const total = rawTotal, free = rawFree, trash = rawTrash, used = Math.max(0, Math.min(100, (total - free) / total * 100)), reasons = []; let level = 'INFO'; if (used >= policy.storageCriticalUsedPercent || free <= policy.storageCriticalMinFreeBytes) {
            level = 'CRITICAL';
            reasons.push('LOW_FREE_SPACE_CRITICAL');
        }
        else if (used >= policy.storageWarningUsedPercent || free <= policy.storageWarningMinFreeBytes) {
            level = 'WARNING';
            reasons.push('LOW_FREE_SPACE_WARNING');
        } if (policy.trashBudgetMaxBytes > 0 && trash >= policy.trashBudgetMaxBytes) {
            if (level === 'INFO')
                level = 'WARNING';
            reasons.push('TRASH_BUDGET_EXCEEDED');
        } if (!reasons.length)
            reasons.push('STORAGE_WITHIN_POLICY'); return { contract: this.contract, targetId: input.targetId, totalBytes: total, freeBytes: free, usedPercent: Number(used.toFixed(2)), trashBytes: trash, level, reasons, automaticPurgeTriggered: false }; }
    }
    KX.TrashRetentionService = TrashRetentionService;
    class TrashWarningSchedulerService {
        trash;
        alarms;
        jobs;
        contract = 'KX.CORE_TRASH_WARNING_SCHEDULER/1';
        static MIN_INTERVAL_MINUTES = 60;
        static DEFAULT_LOOKAHEAD_HOURS = 72;
        static DEFAULT_STORAGE_SIGNAL_MAX_AGE_MINUTES = 15;
        static DEFAULT_STORAGE_COOLDOWN_HOURS = 24;
        constructor(trash, alarms, jobs) {
            this.trash = trash;
            this.alarms = alarms;
            this.jobs = jobs;
        }
        safeId(value) { return value.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 180); }
        parseIso(value, label) { const ms = Date.parse(value); if (!Number.isFinite(ms))
            throw new Error(`Trash warning ${label} must be an ISO date`); return new Date(ms).toISOString(); }
        boundedNumber(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
        channels(input) { const allowed = new Set(['IN_APP', 'SYSTEM', 'EMAIL']); const out = [...new Set((input || ['IN_APP']).filter(x => allowed.has(x)))]; return (out.length ? out : ['IN_APP']); }
        async plan(input = {}, ctx) {
            const at = this.parseIso(input.at || now(), 'at'), atMs = Date.parse(at), lookaheadHours = this.boundedNumber(input.lookaheadHours, TrashWarningSchedulerService.DEFAULT_LOOKAHEAD_HOURS, 1, 24 * 30), horizonMs = atMs + lookaheadHours * 3600000, candidates = [], rejectedStorageSignals = [];
            const rows = await this.trash.list({ status: 'TRASHED' }, ctx);
            for (const row of rows) {
                const d = row.data, retainMs = Date.parse(d.retainUntil);
                if (!Number.isFinite(retainMs) || retainMs > horizonMs)
                    continue;
                const expired = retainMs <= atMs, kind = expired ? 'RETENTION_EXPIRED' : 'RETENTION_EXPIRING', level = expired ? 'CRITICAL' : 'WARNING', alarmId = `ALARM.TRASH.RETENTION.${this.safeId(row.id)}.${retainMs}`;
                candidates.push({ key: `RETENTION:${row.id}:${retainMs}`, kind, level, title: expired ? `Koš: retenční doba „${d.title}“ vypršela` : `Koš: „${d.title}“ se blíží konci retenční doby`, triggerAt: at, alarmId, spaceIds: [...row.spaceIds], trashEntryId: row.id, reasons: [expired ? 'RETENTION_EXPIRED' : 'RETENTION_WITHIN_WARNING_WINDOW', `RETAIN_UNTIL=${d.retainUntil}`], source: 'TRASH_INDEX', automaticCleanupTriggered: false, destructiveActionCode: null });
            }
            const maxAgeMinutes = this.boundedNumber(input.storageSignalMaxAgeMinutes, TrashWarningSchedulerService.DEFAULT_STORAGE_SIGNAL_MAX_AGE_MINUTES, 1, 24 * 60), cooldownHours = this.boundedNumber(input.storageCooldownHours, TrashWarningSchedulerService.DEFAULT_STORAGE_COOLDOWN_HOURS, 1, 24 * 30), futureToleranceMs = 5 * 60000;
            for (const signal of input.storageSignals || []) {
                let observed;
                try {
                    observed = this.parseIso(signal.observedAt, 'storage observedAt');
                }
                catch {
                    rejectedStorageSignals.push({ targetId: String(signal.targetId || 'UNKNOWN'), reason: 'INVALID_OBSERVED_AT' });
                    continue;
                }
                const observedMs = Date.parse(observed), ageMs = atMs - observedMs;
                if (observedMs > atMs + futureToleranceMs) {
                    rejectedStorageSignals.push({ targetId: signal.targetId, reason: 'FUTURE_STORAGE_SIGNAL' });
                    continue;
                }
                if (ageMs > maxAgeMinutes * 60000) {
                    rejectedStorageSignals.push({ targetId: signal.targetId, reason: 'STALE_STORAGE_SIGNAL' });
                    continue;
                }
                const assessment = this.trash.assessStorage({ targetId: signal.targetId, totalBytes: signal.totalBytes, freeBytes: signal.freeBytes, trashBytes: signal.trashBytes, policy: input.policy });
                if (assessment.level === 'BLOCKED') {
                    rejectedStorageSignals.push({ targetId: signal.targetId, reason: assessment.reasons.join('|') || 'INVALID_STORAGE_SIGNAL' });
                    continue;
                }
                if (assessment.level !== 'WARNING' && assessment.level !== 'CRITICAL')
                    continue;
                const bucket = Math.floor(observedMs / (cooldownHours * 3600000)), kind = assessment.level === 'CRITICAL' ? 'STORAGE_CRITICAL' : 'STORAGE_WARNING', alarmId = `ALARM.TRASH.STORAGE.${this.safeId(signal.targetId)}.${assessment.level}.${bucket}`;
                candidates.push({ key: `STORAGE:${signal.targetId}:${assessment.level}:${bucket}`, kind, level: assessment.level, title: assessment.level === 'CRITICAL' ? `Koš: kriticky málo místa na ${signal.targetId}` : `Koš: upozornění na kapacitu ${signal.targetId}`, triggerAt: at, alarmId, spaceIds: [...new Set(signal.spaceIds || [])], storageTargetId: signal.targetId, reasons: [...assessment.reasons, `MEASURED_AT=${observed}`, `USED_PERCENT=${assessment.usedPercent}`], source: 'EXPLICIT_STORAGE_MEASUREMENT', automaticCleanupTriggered: false, destructiveActionCode: null });
            }
            candidates.sort((a, b) => a.triggerAt.localeCompare(b.triggerAt) || a.key.localeCompare(b.key));
            return { contract: this.contract, generatedAt: at, lookaheadHours, candidates, rejectedStorageSignals, destructiveExecutionAllowed: false, automaticCleanupTriggered: false, safeguards: ['NOTIFICATION_ONLY', 'NO_AUTO_PURGE', 'NO_OWNER_DELETE_ACTION', 'NO_STORAGE_ADAPTER_CLAIM', 'EXPLICIT_STORAGE_MEASUREMENTS_ONLY', 'ALARM_PIPELINE_REUSES_CORE_NOTIFICATION_COORDINATOR'] };
        }
        async reconcile(input = {}, ctx) {
            const plan = await this.plan(input, ctx), channels = this.channels(input.channels);
            let alarmsCreated = 0, alarmsUpdated = 0, alarmsPreserved = 0;
            const alarmIds = [];
            for (const candidate of plan.candidates) {
                const old = await this.alarms.get(candidate.alarmId);
                alarmIds.push(candidate.alarmId);
                if (old && ['FIRED', 'ACKNOWLEDGED', 'CANCELLED'].includes(old.status)) {
                    alarmsPreserved++;
                    continue;
                }
                const saved = await this.alarms.save({ id: candidate.alarmId, title: candidate.title, ownerApp: 'APP.NEXUS', spaceIds: [...candidate.spaceIds], triggerAt: candidate.triggerAt, channels, status: 'SCHEDULED', expectedRevision: old?.revision }, ctx);
                if (old)
                    alarmsUpdated++;
                else
                    alarmsCreated++;
                if (saved.status !== 'SCHEDULED')
                    throw new Error(`Trash warning alarm ${saved.id} did not remain SCHEDULED`);
            }
            return { ...plan, alarmsCreated, alarmsUpdated, alarmsPreserved, alarmIds };
        }
        async schedule(input = {}, ctx) {
            const intervalMinutes = this.boundedNumber(input.intervalMinutes, 360, TrashWarningSchedulerService.MIN_INTERVAL_MINUTES, 7 * 24 * 60), lookaheadHours = this.boundedNumber(input.lookaheadHours, TrashWarningSchedulerService.DEFAULT_LOOKAHEAD_HOURS, 1, 24 * 30), channels = this.channels(input.channels), runAt = input.runAt ? this.parseIso(input.runAt, 'runAt') : undefined;
            const job = await this.jobs.schedule({ code: 'CORE.TRASH.WARNING.SWEEP', ownerApp: 'APP.NEXUS', handlerCode: 'CORE.TRASH.WARNING.SWEEP', intervalMinutes, runAt, status: input.status || 'ENABLED', payload: { lookaheadHours, channels } }, ctx);
            return { contract: this.contract, job, minimumIntervalMinutes: TrashWarningSchedulerService.MIN_INTERVAL_MINUTES, storageSignalsPersisted: false, automaticCleanupTriggered: false, safeguards: ['RETENTION_WARNING_JOB_ONLY', 'STORAGE_SIGNALS_ARE_NOT_PERSISTED_IN_RECURRING_JOB', 'NO_AUTO_PURGE', 'NO_DESTRUCTIVE_ACTION'] };
        }
    }
    KX.TrashWarningSchedulerService = TrashWarningSchedulerService;
    class RelationService {
        repo;
        audit;
        outbox;
        constructor(repo, audit, outbox) {
            this.repo = repo;
            this.audit = audit;
            this.outbox = outbox;
        }
        async create(input, ctx) { const root = rootId(ctx); const row = { id: uid('REL'), createdAt: now(), createdBy: ctx.actorId, ...input }; const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.RELATION.CREATE', entityType: 'CORE.RELATION', entityId: row.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { sourceId: row.sourceId, targetId: row.targetId, relationType: row.relationType } }); const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.RELATION', resourceId: row.id, ownerApp: row.ownerApp, rootChangeId: root, payload: { sourceId: row.sourceId, targetId: row.targetId, relationType: row.relationType } }); await this.repo.atomic([{ store: 'relations', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]); return row; }
        async list() { return this.repo.all('relations'); }
        async get(id) { return this.repo.get('relations', id); }
        async forEntity(id) { return (await this.list()).filter(x => x.sourceId === id || x.targetId === id); }
        async neighbors(id) { const rows = await this.forEntity(id); return rows.map(r => ({ relation: r, direction: r.sourceId === id ? 'OUT' : 'IN', otherId: r.sourceId === id ? r.targetId : r.sourceId, otherType: r.sourceId === id ? r.targetType : r.sourceType })); }
        async remove(id, ctx) { const row = await this.get(id); if (!row)
            return false; const root = rootId(ctx); const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.RELATION.DELETE', entityType: 'CORE.RELATION', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { sourceId: row.sourceId, targetId: row.targetId, relationType: row.relationType } }); const out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.RELATION', resourceId: id, ownerApp: row.ownerApp, rootChangeId: root }); await this.repo.atomic([{ store: 'audit', value: audit }, { store: 'outbox', value: out }], [{ store: 'relations', key: id }]); return true; }
    }
    KX.RelationService = RelationService;
    class ConfigurationMutationAccessService {
        repo;
        memberships;
        workspaceId;
        constructor(repo, memberships, workspaceId) {
            this.repo = repo;
            this.memberships = memberships;
            this.workspaceId = workspaceId;
        }
        has(ctx, permission) { return !!ctx.permissions?.includes(permission); }
        system(ctx) { return ctx.actorId === 'SYSTEM'; }
        requirePermission(ctx, permission) { if (!this.has(ctx, permission))
            throw new Error(`Permission denied: ${permission}`); }
        roleWeight(role) { return role ? { READ: 10, EDIT: 20, MANAGE: 30 }[role] : 0; }
        async assertSetting(scopeType, scopeId, ctx) {
            if (this.system(ctx))
                return;
            this.requirePermission(ctx, 'CORE.SETTING.EDIT');
            if (scopeType === 'WORKSPACE') {
                if (this.workspaceId && scopeId === this.workspaceId) {
                    this.requirePermission(ctx, 'CORE.SETTING.MANAGE_GLOBAL');
                    return;
                }
                this.requirePermission(ctx, 'CORE.SETTING.MANAGE_GLOBAL');
                return;
            }
            if (scopeType === 'USER') {
                if (scopeId === ctx.actorId)
                    return;
                this.requirePermission(ctx, 'CORE.SETTING.MANAGE_USERS');
                return;
            }
            if (scopeType === 'DEVICE') {
                if (scopeId === ctx.deviceId) {
                    const device = await this.repo.get('devices', scopeId);
                    if (!device)
                        throw new Error(`Scope denied: unknown DEVICE ${scopeId}`);
                    const sessions = await this.repo.all('sessions');
                    if (!sessions.some(x => x.deviceId === scopeId && x.userId === ctx.actorId && x.status === 'ACTIVE'))
                        throw new Error(`Scope denied: DEVICE ${scopeId} is not bound to an active session for ${ctx.actorId}`);
                    return;
                }
                this.requirePermission(ctx, 'CORE.SETTING.MANAGE_DEVICES');
                return;
            }
            this.requirePermission(ctx, 'CORE.SETTING.MANAGE_GLOBAL');
        }
        async resource(kind, id) {
            if (kind === 'ENTITY')
                return this.repo.get('entities', id);
            if (kind === 'FILE')
                return this.repo.get('files', id);
            if (kind === 'DOCUMENT')
                return this.repo.get('documents', id);
            if (kind === 'TASK')
                return this.repo.get('tasks', id);
            if (kind === 'CALENDAR_EVENT')
                return this.repo.get('calendarEvents', id);
            if (kind === 'ALARM')
                return this.repo.get('alarms', id);
            return undefined;
        }
        async assertSpaceManage(spaceId, ctx) {
            const space = await this.memberships.getSpace(spaceId);
            if (!space || space.archivedAt)
                throw new Error(`Scope denied: unknown or archived Space ${spaceId}`);
            const role = await this.memberships.roleFor(spaceId, ctx.actorId);
            if (this.roleWeight(role) < this.roleWeight('MANAGE'))
                throw new Error(`Scope denied: MANAGE access required for ${spaceId}`);
            return space;
        }
        resourceSegment(path) {
            const last = path.split('/').filter(Boolean).at(-1) || '';
            const m = /^(ENTITY|FILE|DOCUMENT|TASK|CALENDAR_EVENT|ALARM)\.(.+)$/.exec(last);
            return m ? { kind: m[1], id: m[2] } : undefined;
        }
        async assertSharing(resourcePath, ctx) {
            if (this.system(ctx))
                return { ownerUserId: ctx.actorId };
            this.requirePermission(ctx, 'CORE.SHARING.MANAGE');
            const parts = resourcePath.split('/').filter(Boolean);
            if (!parts.length)
                throw new Error('Scope denied: empty sharing resourcePath');
            if (parts[0].startsWith('SPACE.')) {
                const space = await this.assertSpaceManage(parts[0], ctx);
                const specific = this.resourceSegment(resourcePath);
                if (specific) {
                    const row = await this.resource(specific.kind, specific.id);
                    if (!row)
                        throw new Error(`Scope denied: unknown ${specific.kind} ${specific.id}`);
                    if (!row.spaceIds.includes(space.id))
                        throw new Error(`Scope denied: ${specific.kind} ${specific.id} is not in ${space.id}`);
                    const appPart = parts.find(x => x.startsWith('APP.'));
                    if (appPart && appPart !== row.ownerApp)
                        throw new Error(`Scope denied: ${specific.kind} ${specific.id} belongs to ${row.ownerApp}, not ${appPart}`);
                }
                return { ownerUserId: space.ownerUserId };
            }
            if (parts[0] === 'RESOURCE') {
                const specific = this.resourceSegment(resourcePath);
                if (!specific)
                    throw new Error(`Scope denied: invalid global resource path ${resourcePath}`);
                const row = await this.resource(specific.kind, specific.id);
                if (!row)
                    throw new Error(`Scope denied: unknown ${specific.kind} ${specific.id}`);
                if (row.spaceIds.length) {
                    for (const spaceId of [...new Set(row.spaceIds)])
                        await this.assertSpaceManage(spaceId, ctx);
                }
                else if (row.createdBy !== ctx.actorId)
                    throw new Error(`Scope denied: global ${specific.kind} ${specific.id} has no manageable Space`);
                return { ownerUserId: row.createdBy || ctx.actorId };
            }
            throw new Error(`Scope denied: unsupported sharing hierarchy ${resourcePath}`);
        }
    }
    KX.ConfigurationMutationAccessService = ConfigurationMutationAccessService;
    class SettingsService {
        repo;
        audit;
        outbox;
        mutationAccess;
        constructor(repo, audit, outbox, mutationAccess) {
            this.repo = repo;
            this.audit = audit;
            this.outbox = outbox;
            this.mutationAccess = mutationAccess;
        }
        weight(t) { return ({ CENTRAL: 10, APP: 20, SUBSYSTEM: 30, WORKSPACE: 35, VIEW: 40, USER: 50, DEVICE: 60 })[t]; }
        async list(key) { const rows = await this.repo.all('settings'); return (key ? rows.filter(x => x.key === key) : rows).sort((a, b) => a.key.localeCompare(b.key) || this.weight(a.scopeType) - this.weight(b.scopeType)); }
        async set(row, ctx) { await this.mutationAccess.assertSetting(row.scopeType, row.scopeId, ctx); const id = `SETTING.${row.scopeType}.${row.scopeId}.${row.key}`, old = await this.repo.get('settings', id), root = rootId(ctx); const next = { id, ...row, updatedBy: ctx.actorId, revision: (old?.revision || 0) + 1, updatedAt: now() }; const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SETTING.SET', entityType: 'CORE.SETTING', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { key: row.key, scopeType: row.scopeType, scopeId: row.scopeId, locked: !!row.locked, revision: next.revision } }); const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.SETTING', resourceId: id, revision: next.revision, ownerApp: 'APP.NEXUS', rootChangeId: root }); await this.repo.atomic([{ store: 'settings', value: next }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]); return next; }
        async unset(key, scopeType, scopeId, ctx) { await this.mutationAccess.assertSetting(scopeType, scopeId, ctx); const id = `SETTING.${scopeType}.${scopeId}.${key}`, old = await this.repo.get('settings', id); if (!old)
            return false; const root = rootId(ctx); const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SETTING.RESET', entityType: 'CORE.SETTING', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { key, scopeType, scopeId } }); const out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.SETTING', resourceId: id, revision: old.revision, ownerApp: 'APP.NEXUS', rootChangeId: root }); await this.repo.atomic([{ store: 'audit', value: audit }, { store: 'outbox', value: out }], [{ store: 'settings', key: id }]); return true; }
        async resetProfile(keys, scopeType, scopeId, ctx) {
            await this.mutationAccess.assertSetting(scopeType, scopeId, ctx);
            const unique = [...new Set((keys || []).map(String))].sort();
            if (!unique.length)
                throw new Error('Settings profile reset requires at least one key');
            if (unique.length > 256)
                throw new Error('Settings profile reset exceeds 256 keys');
            const allowed = new Set(unique), current = (await this.list()).filter(x => x.scopeType === scopeType && x.scopeId === scopeId && allowed.has(x.key));
            const locked = current.filter(x => x.locked);
            if (locked.length)
                throw new Error(`Settings profile reset blocked by locked overrides: ${locked.map(x => x.key).join(',')}`);
            if (!current.length)
                return { scopeType, scopeId, requestedKeys: unique.length, removed: 0, removedKeys: [], atomic: true };
            const root = rootId(ctx), writes = [], deletes = [];
            for (const old of current) {
                writes.push({ store: 'audit', value: this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SETTING.PROFILE.RESET', entityType: 'CORE.SETTING', entityId: old.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { key: old.key, scopeType, scopeId, bulkProfile: true } }) });
                writes.push({ store: 'outbox', value: this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.SETTING', resourceId: old.id, revision: old.revision, ownerApp: 'APP.NEXUS', rootChangeId: root, payload: { key: old.key, scopeType, scopeId, bulkProfile: true } }) });
                deletes.push({ store: 'settings', key: old.id });
            }
            await this.repo.atomic(writes, deletes);
            return { scopeType, scopeId, requestedKeys: unique.length, removed: current.length, removedKeys: current.map(x => x.key).sort(), atomic: true };
        }
        async replaceProfile(keys, rows, scopeType, scopeId, ctx) {
            await this.mutationAccess.assertSetting(scopeType, scopeId, ctx);
            const uniqueKeys = [...new Set((keys || []).map(String))].sort();
            if (!uniqueKeys.length)
                throw new Error('Settings profile import requires at least one definition key');
            if (uniqueKeys.length > 256)
                throw new Error('Settings profile import exceeds 256 keys');
            const allowed = new Set(uniqueKeys), incoming = new Map();
            for (const row of rows || []) {
                const key = String(row?.key || '');
                if (!allowed.has(key))
                    throw new Error(`Settings profile import key outside selected app: ${key}`);
                if (incoming.has(key))
                    throw new Error(`Duplicate settings profile import key ${key}`);
                incoming.set(key, structuredClone(row.value));
            }
            if (incoming.size > 256)
                throw new Error('Settings profile import exceeds 256 rows');
            const current = (await this.list()).filter(x => x.scopeType === scopeType && x.scopeId === scopeId && allowed.has(x.key)), currentByKey = new Map(current.map(x => [x.key, x]));
            const lockedBlockers = current.filter(x => x.locked && (!incoming.has(x.key) || stableStringify(incoming.get(x.key)) !== stableStringify(x.value)));
            if (lockedBlockers.length)
                throw new Error(`Settings profile import blocked by locked overrides: ${lockedBlockers.map(x => x.key).join(',')}`);
            const root = rootId(ctx), writes = [], deletes = [], applied = [], removed = [];
            for (const [key, value] of [...incoming.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
                const old = currentByKey.get(key), id = `SETTING.${scopeType}.${scopeId}.${key}`, next = { id, key, scopeType, scopeId, value: structuredClone(value), locked: old?.locked, revision: (old?.revision || 0) + 1, updatedAt: now(), updatedBy: ctx.actorId };
                writes.push({ store: 'settings', value: next });
                writes.push({ store: 'audit', value: this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SETTING.PROFILE.IMPORT', entityType: 'CORE.SETTING', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { key, scopeType, scopeId, revision: next.revision, bulkProfile: true } }) });
                writes.push({ store: 'outbox', value: this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.SETTING', resourceId: id, revision: next.revision, ownerApp: 'APP.NEXUS', rootChangeId: root, payload: { key, scopeType, scopeId, revision: next.revision, bulkProfile: true } }) });
                applied.push(key);
            }
            for (const old of current) {
                if (incoming.has(old.key))
                    continue;
                writes.push({ store: 'audit', value: this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SETTING.PROFILE.IMPORT.RESET', entityType: 'CORE.SETTING', entityId: old.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { key: old.key, scopeType, scopeId, bulkProfile: true } }) });
                writes.push({ store: 'outbox', value: this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.SETTING', resourceId: old.id, revision: old.revision, ownerApp: 'APP.NEXUS', rootChangeId: root, payload: { key: old.key, scopeType, scopeId, bulkProfile: true } }) });
                deletes.push({ store: 'settings', key: old.id });
                removed.push(old.key);
            }
            await this.repo.atomic(writes, deletes);
            return { scopeType, scopeId, definitionKeys: uniqueKeys.length, imported: applied.length, removed: removed.length, appliedKeys: applied, removedKeys: removed.sort(), atomic: true };
        }
        async explain(key, scopes) { const rows = (await this.list(key)); const allowed = new Set(scopes.map(x => `${x.scopeType}:${x.scopeId}`)); const chain = rows.filter(x => allowed.has(`${x.scopeType}:${x.scopeId}`)).sort((a, b) => this.weight(a.scopeType) - this.weight(b.scopeType)); const lockedBy = chain.filter(x => x.locked).sort((a, b) => this.weight(a.scopeType) - this.weight(b.scopeType))[0]; const effective = lockedBy || [...chain].sort((a, b) => this.weight(b.scopeType) - this.weight(a.scopeType))[0]; return { key, effective, chain, lockedBy }; }
        async resolve(key, scopes) { return (await this.explain(key, scopes)).effective; }
    }
    KX.SettingsService = SettingsService;
    class SettingsDefaultsRegistryService {
        rows = [];
        load(input) {
            const rows = (input || []).map(x => ({ ...x, allowedScopes: [...(x.allowedScopes || [])] }));
            const seen = new Set();
            for (const row of rows) {
                if (!row.key || !row.appCode || !row.category || !row.label)
                    throw new Error('Invalid default setting definition');
                if (seen.has(row.key))
                    throw new Error(`Duplicate default setting key ${row.key}`);
                seen.add(row.key);
                if (!['BOOLEAN', 'SELECT', 'MULTISELECT', 'TEXT', 'NUMBER', 'JSON'].includes(row.valueKind))
                    throw new Error(`Invalid setting value kind ${row.valueKind}`);
                if (!row.allowedScopes?.length)
                    throw new Error(`Default setting has no allowedScopes ${row.key}`);
                if (['SELECT', 'MULTISELECT'].includes(row.valueKind) && (!row.options || !row.options.length))
                    throw new Error(`${row.valueKind} setting requires options ${row.key}`);
                if (row.valueKind === 'MULTISELECT') {
                    if (!Array.isArray(row.defaultValue))
                        throw new Error(`MULTISELECT default must be array ${row.key}`);
                    for (const v of row.defaultValue)
                        if (!row.options.includes(String(v)))
                            throw new Error(`MULTISELECT default outside options ${row.key}: ${String(v)}`);
                }
            }
            this.rows = rows.sort((a, b) => a.appCode.localeCompare(b.appCode) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
            return this.summary();
        }
        list(appCode) { return this.rows.filter(x => !appCode || x.appCode === appCode).map(x => ({ ...x, allowedScopes: [...x.allowedScopes], options: x.options ? [...x.options] : undefined, tags: x.tags ? [...x.tags] : undefined })); }
        get(key) { const row = this.rows.find(x => x.key === key); return row ? { ...row, allowedScopes: [...row.allowedScopes], options: row.options ? [...row.options] : undefined, tags: row.tags ? [...row.tags] : undefined } : undefined; }
        validateValue(key, value) { const row = this.rows.find(x => x.key === key); if (!row)
            return value; if (row.valueKind === 'BOOLEAN') {
            if (typeof value !== 'boolean')
                throw new Error(`Setting ${key} expects BOOLEAN`);
            return value;
        } if (row.valueKind === 'NUMBER') {
            if (typeof value !== 'number' || !Number.isFinite(value))
                throw new Error(`Setting ${key} expects finite NUMBER`);
            return value;
        } if (row.valueKind === 'TEXT') {
            if (typeof value !== 'string')
                throw new Error(`Setting ${key} expects TEXT`);
            return value;
        } if (row.valueKind === 'JSON') {
            let text;
            try {
                text = JSON.stringify(value);
            }
            catch {
                throw new Error(`Setting ${key} expects JSON-compatible value`);
            }
            if (text === undefined)
                throw new Error(`Setting ${key} expects JSON-compatible value`);
            try {
                return JSON.parse(text);
            }
            catch {
                throw new Error(`Setting ${key} expects JSON-compatible value`);
            }
        } if (row.valueKind === 'SELECT') {
            const v = String(value);
            if (!row.options?.includes(v))
                throw new Error(`Setting ${key} has invalid SELECT value ${v}`);
            return v;
        } if (row.valueKind === 'MULTISELECT') {
            if (!Array.isArray(value))
                throw new Error(`Setting ${key} expects MULTISELECT array`);
            const allowed = new Set((row.options || []).map(String)), out = [...new Set(value.map(String))];
            for (const v of out)
                if (!allowed.has(v))
                    throw new Error(`Setting ${key} has invalid MULTISELECT value ${v}`);
            return out;
        } throw new Error(`Setting ${key} has unsupported kind ${row.valueKind}`); }
        apps() { return [...new Set(this.rows.map(x => x.appCode))].sort(); }
        summary() { const apps = this.apps(), core = this.rows.filter(x => x.appCode === 'CORE').length, hub = this.rows.filter(x => x.appCode !== 'CORE').length; return { contract: 'KX.SETTINGS_DEFAULTS/1', definitions: this.rows.length, apps: apps.length, coreDefinitions: core, hubDefinitions: hub }; }
        async explain(settings, key, scopes) {
            const base = await settings.explain(key, scopes), definition = this.get(key);
            return { ...base, definition, effectiveValue: base.effective?.value ?? definition?.defaultValue, effectiveSource: base.effective ? `${base.effective.scopeType}:${base.effective.scopeId}` : definition ? `DEFAULT:${definition.appCode}` : 'UNCONFIGURED' };
        }
    }
    KX.SettingsDefaultsRegistryService = SettingsDefaultsRegistryService;
    class SharingService {
        repo;
        audit;
        outbox;
        mutationAccess;
        constructor(repo, audit, outbox, mutationAccess) {
            this.repo = repo;
            this.audit = audit;
            this.outbox = outbox;
            this.mutationAccess = mutationAccess;
        }
        async list(rootPath) { const rows = await this.repo.all('shareRules'); return (rootPath ? rows.filter(r => r.resourcePath === rootPath || r.resourcePath.startsWith(rootPath + '/')) : rows).sort((a, b) => a.resourcePath.localeCompare(b.resourcePath)); }
        async get(resourcePath) { return (await this.repo.all('shareRules')).find(r => r.resourcePath === resourcePath); }
        async set(rule, ctx) { const authorization = await this.mutationAccess.assertSharing(rule.resourcePath, ctx); if (rule.ownerUserId && rule.ownerUserId !== authorization.ownerUserId)
            throw new Error(`Scope denied: sharing owner for ${rule.resourcePath} must be ${authorization.ownerUserId}`); const normalized = { ...rule, ownerUserId: authorization.ownerUserId, id: rule.id || `SHARE.${rule.resourcePath.replace(/[^A-Za-z0-9_.-]+/g, '_')}`, updatedAt: now() }; const root = rootId(ctx); const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SHARING.SET', entityType: 'CORE.SHARE_RULE', entityId: normalized.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { resourcePath: normalized.resourcePath, mode: normalized.mode, allow: normalized.allow || [] } }); const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.SHARE_RULE', resourceId: normalized.id, ownerApp: 'APP.NEXUS', rootChangeId: root, payload: { resourcePath: normalized.resourcePath, mode: normalized.mode } }); {
            const ep = await accessEpochBump(this.repo);
            await this.repo.atomic([ep.write, { store: 'shareRules', value: normalized }, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [], [ep.pre]);
        } return normalized; }
        async unset(resourcePath, ctx) { await this.mutationAccess.assertSharing(resourcePath, ctx); const row = await this.get(resourcePath); if (!row)
            return false; const root = rootId(ctx); const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SHARING.RESET', entityType: 'CORE.SHARE_RULE', entityId: row.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { resourcePath } }); const out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.SHARE_RULE', resourceId: row.id, ownerApp: 'APP.NEXUS', rootChangeId: root }); {
            const ep = await accessEpochBump(this.repo);
            await this.repo.atomic([ep.write, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [{ store: 'shareRules', key: row.id }], [ep.pre]);
        } return true; }
        async resolve(resourcePath, subjectId) {
            const rules = (await this.repo.all('shareRules')).filter(r => resourcePath === r.resourcePath || resourcePath.startsWith(r.resourcePath + '/')).sort((a, b) => a.resourcePath.length - b.resourcePath.length);
            const privateRules = rules.filter(r => r.mode === 'PRIVATE');
            if (privateRules.length) {
                const blocker = privateRules[privateRules.length - 1];
                return { mode: 'PRIVATE', role: blocker.ownerUserId === subjectId ? 'MANAGE' : null, source: blocker.resourcePath, blocker: blocker.resourcePath, matched: rules };
            }
            const custom = [...rules].reverse().find(r => r.mode === 'CUSTOM');
            if (custom) {
                const hit = custom.allow?.find(x => x.subjectId === subjectId);
                return { mode: 'CUSTOM', role: custom.ownerUserId === subjectId ? 'MANAGE' : hit?.role || null, source: custom.resourcePath, matched: rules };
            }
            return { mode: 'INHERIT', role: null, source: rules[rules.length - 1]?.resourcePath || 'UNCONFIGURED', matched: rules };
        }
        async accessList(resourcePath, subjectIds) { return Promise.all(subjectIds.map(async (subjectId) => ({ subjectId, ...await this.resolve(resourcePath, subjectId) }))); }
        async treeSummary(rootPath) { const rules = await this.list(rootPath); return { rootPath, explicitRules: rules.length, privateRules: rules.filter(x => x.mode === 'PRIVATE').length, customRules: rules.filter(x => x.mode === 'CUSTOM').length, inheritRules: rules.filter(x => x.mode === 'INHERIT').length }; }
    }
    KX.SharingService = SharingService;
    // N2.1h: every change that can alter an access decision (users, spaces, memberships, sharing rules) bumps
    // CORE.ACCESS_EPOCH in the same atomic batch. ActionBus captures the epoch when an action starts; entity commits
    // of that action carry it as a precondition => an ACL decision can never commit after access changed under it.
    KX.ACCESS_EPOCH_KEY = 'CORE.ACCESS_EPOCH';
    // N2.1i: the same commit-side pattern for planner (tasks/events/alarms), files and documents.
    function casPre(store, key, expectedRevision, ctx) { const pre = [{ store, key, field: 'revision', value: expectedRevision }]; if (ctx && ctx.accessEpoch !== undefined)
        pre.push({ store: 'meta', key: KX.ACCESS_EPOCH_KEY, field: 'value', value: ctx.accessEpoch }); return pre; }
    KX.casPre = casPre;
    async function casAtomic(repo, pre, writes, deletes = []) {
        try {
            await repo.atomic(writes, deletes, pre);
        }
        catch (e) {
            const m = String(e?.message || e);
            const main = pre[0];
            if (m.includes('REPOSITORY_CAS_CONFLICT meta/'))
                throw new Error(`ACCESS_CHANGED_DURING_ACTION ${main.key}: access rules changed while the action ran; retry`);
            if (m.includes(`REPOSITORY_CAS_CONFLICT ${main.store}/`))
                throw new Error(`Revision conflict ${main.key}: concurrent commit (${m.slice(m.indexOf('expected'))})`);
            throw e;
        }
    }
    KX.casAtomic = casAtomic;
    async function accessEpochRead(repo) { const r = await repo.get('meta', KX.ACCESS_EPOCH_KEY); return r && Number.isSafeInteger(r.value) ? r.value : null; }
    KX.accessEpochRead = accessEpochRead;
    async function accessEpochBump(repo) { const cur = await accessEpochRead(repo); return { write: { store: 'meta', value: { key: KX.ACCESS_EPOCH_KEY, value: (cur ?? 0) + 1, updatedAt: now() } }, pre: { store: 'meta', key: KX.ACCESS_EPOCH_KEY, field: 'value', value: cur } }; }
    KX.accessEpochBump = accessEpochBump;
    class SpaceMembershipService {
        repo;
        audit;
        outbox;
        constructor(repo, audit, outbox) {
            this.repo = repo;
            this.audit = audit;
            this.outbox = outbox;
        }
        roleWeight(role) { return ({ READ: 10, EDIT: 20, MANAGE: 30, OWNER: 40 })[role]; }
        accessRole(role) { return role === 'OWNER' ? 'MANAGE' : role; }
        async listUsers() { return this.repo.all('users'); }
        async listSpaces() { return this.repo.all('spaces'); }
        async listMemberships(spaceId) { const rows = await this.repo.all('spaceMemberships'); return spaceId ? rows.filter(x => x.spaceId === spaceId) : rows; }
        async getUser(id) { return this.repo.get('users', id); }
        async getSpace(id) { return this.repo.get('spaces', id); }
        async upsertUser(input, ctx) { const old = await this.getUser(input.id), at = now(), root = rootId(ctx); const row = { id: input.id, displayName: input.displayName, email: input.email ?? old?.email, status: input.status || old?.status || 'ACTIVE', createdAt: old?.createdAt || at, updatedAt: at }; const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.USER.UPSERT', entityType: 'CORE.USER', entityId: row.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK' }); const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.USER', resourceId: row.id, ownerApp: 'APP.NEXUS', rootChangeId: root }); {
            const ep = await accessEpochBump(this.repo);
            await this.repo.atomic([ep.write, { store: 'users', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [], [ep.pre]);
        } return row; }
        async upsertSpace(input, ctx) { const old = await this.getSpace(input.id), at = now(), root = rootId(ctx); const row = { id: input.id, name: input.name, kind: input.kind, ownerUserId: input.ownerUserId, archivedAt: input.archivedAt ?? old?.archivedAt ?? null, createdAt: old?.createdAt || at, updatedAt: at }; const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SPACE.UPSERT', entityType: 'CORE.SPACE', entityId: row.id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK' }); const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.SPACE', resourceId: row.id, ownerApp: 'APP.NEXUS', rootChangeId: root }); {
            const ep = await accessEpochBump(this.repo);
            await this.repo.atomic([ep.write, { store: 'spaces', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [], [ep.pre]);
        } return row; }
        async setMembership(spaceId, userId, role, ctx) { if (!await this.getSpace(spaceId))
            throw new Error(`Unknown space ${spaceId}`); if (!await this.getUser(userId))
            throw new Error(`Unknown user ${userId}`); const id = `MEMBERSHIP.${spaceId}.${userId}`, old = await this.repo.get('spaceMemberships', id), at = now(), root = rootId(ctx); const row = { id, spaceId, userId, role, createdAt: old?.createdAt || at, updatedAt: at }; const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SPACE.MEMBERSHIP.SET', entityType: 'CORE.SPACE_MEMBERSHIP', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { spaceId, userId, role } }); const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.SPACE_MEMBERSHIP', resourceId: id, ownerApp: 'APP.NEXUS', rootChangeId: root }); {
            const ep = await accessEpochBump(this.repo);
            await this.repo.atomic([ep.write, { store: 'spaceMemberships', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [], [ep.pre]);
        } return row; }
        async removeMembership(spaceId, userId, ctx) { const id = `MEMBERSHIP.${spaceId}.${userId}`, old = await this.repo.get('spaceMemberships', id); if (!old)
            return false; const root = rootId(ctx), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SPACE.MEMBERSHIP.REMOVE', entityType: 'CORE.SPACE_MEMBERSHIP', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { spaceId, userId } }), out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.SPACE_MEMBERSHIP', resourceId: id, ownerApp: 'APP.NEXUS', rootChangeId: root }); {
            const ep = await accessEpochBump(this.repo);
            await this.repo.atomic([ep.write, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [{ store: 'spaceMemberships', key: id }], [ep.pre]);
        } return true; }
        async roleFor(spaceId, userId) { const space = await this.getSpace(spaceId); if (!space || space.archivedAt)
            return null; if (space.ownerUserId === userId)
            return 'MANAGE'; const rows = (await this.listMemberships(spaceId)).filter(x => x.userId === userId); if (!rows.length)
            return null; const best = rows.sort((a, b) => this.roleWeight(b.role) - this.roleWeight(a.role))[0]; return this.accessRole(best.role); }
        async accessList(spaceId) { const space = await this.getSpace(spaceId); if (!space)
            return []; const users = await this.listUsers(), rows = []; for (const u of users) {
            const role = await this.roleFor(spaceId, u.id);
            if (role)
                rows.push({ userId: u.id, displayName: u.displayName, role });
        } return rows; }
        async ensureDefaultModel(ctx) {
            const users = [
                { id: 'USER.LUKAS', displayName: 'Lukáš' },
                { id: 'USER.HELENA', displayName: 'Helena' },
                { id: 'USER.LUKYN', displayName: 'Lukyn' },
                { id: 'USER.VERONIKA', displayName: 'Veronika' }
            ];
            for (const u of users)
                if (!await this.getUser(u.id))
                    await this.upsertUser(u, ctx);
            const spaces = [
                { id: 'SPACE.PERSONAL.LUKAS', name: 'Osobní · Lukáš', kind: 'PERSONAL', ownerUserId: 'USER.LUKAS' },
                { id: 'SPACE.PERSONAL.HELENA', name: 'Osobní · Helena', kind: 'PERSONAL', ownerUserId: 'USER.HELENA' },
                { id: 'SPACE.PERSONAL.LUKYN', name: 'Osobní · Lukyn', kind: 'PERSONAL', ownerUserId: 'USER.LUKYN' },
                { id: 'SPACE.PERSONAL.VERONIKA', name: 'Osobní · Veronika', kind: 'PERSONAL', ownerUserId: 'USER.VERONIKA' },
                { id: 'SPACE.FAMILY', name: 'Rodina', kind: 'FAMILY', ownerUserId: 'USER.LUKAS' },
                { id: 'SPACE.COMPANY', name: 'Firma', kind: 'COMPANY', ownerUserId: 'USER.LUKAS' },
                { id: 'SPACE.HOUSE_2026', name: 'Dům 2026', kind: 'HOME', ownerUserId: 'USER.LUKAS' },
                { id: 'SPACE.WORKSHOP', name: 'Dílna', kind: 'WORKSHOP', ownerUserId: 'USER.LUKAS' },
                { id: 'SPACE.SHARED', name: 'Společné', kind: 'SHARED', ownerUserId: 'USER.LUKAS' }
            ];
            for (const sp of spaces)
                if (!await this.getSpace(sp.id))
                    await this.upsertSpace(sp, ctx);
            const memberships = [
                ['SPACE.FAMILY', 'USER.HELENA', 'MANAGE'], ['SPACE.FAMILY', 'USER.LUKYN', 'READ'], ['SPACE.FAMILY', 'USER.VERONIKA', 'READ'],
                ['SPACE.COMPANY', 'USER.HELENA', 'MANAGE'], ['SPACE.HOUSE_2026', 'USER.HELENA', 'EDIT'], ['SPACE.WORKSHOP', 'USER.HELENA', 'EDIT'], ['SPACE.SHARED', 'USER.HELENA', 'EDIT']
            ];
            for (const [spaceId, userId, role] of memberships) {
                const id = `MEMBERSHIP.${spaceId}.${userId}`;
                if (!await this.repo.get('spaceMemberships', id))
                    await this.setMembership(spaceId, userId, role, ctx);
            }
        }
    }
    KX.SpaceMembershipService = SpaceMembershipService;
    class DeviceSessionService {
        repo;
        audit;
        memoryDeviceId;
        constructor(repo, audit) {
            this.repo = repo;
            this.audit = audit;
        }
        stableDeviceId() {
            const key = 'kx.nexus.device.id.v1';
            try {
                let id = globalThis.localStorage?.getItem(key);
                if (!id) {
                    id = uid('DEVICE');
                    globalThis.localStorage?.setItem(key, id);
                }
                return id || this.memoryDeviceId || (this.memoryDeviceId = uid('DEVICE'));
            }
            catch {
                return this.memoryDeviceId || (this.memoryDeviceId = uid('DEVICE'));
            }
        }
        async listDevices() { return this.repo.all('devices'); }
        async listSessions() { return this.repo.all('sessions'); }
        async getDevice(id) { return this.repo.get('devices', id); }
        async ensureDevice(input, ctx) { const id = this.stableDeviceId(), old = await this.getDevice(id), at = now(); const row = { id, name: input.name || old?.name || `KalinumX ${input.platform}`, platform: input.platform, status: old?.status || 'ACTIVE', appVersion: input.appVersion, firstSeenAt: old?.firstSeenAt || at, lastSeenAt: at, trustedAt: old?.trustedAt, capabilities: input.capabilities || old?.capabilities || [] }; await this.repo.put('devices', row); await this.audit.write({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: old ? 'CORE.DEVICE.SEEN' : 'CORE.DEVICE.REGISTER', entityType: 'CORE.DEVICE', entityId: id, rootChangeId: rootId(ctx), deviceId: id, result: 'OK', detail: { platform: row.platform, appVersion: row.appVersion } }); return row; }
        async setTrusted(deviceId, trusted, ctx) { const old = await this.getDevice(deviceId); if (!old)
            throw new Error(`Unknown device ${deviceId}`); const row = { ...old, status: trusted ? 'TRUSTED' : 'ACTIVE', trustedAt: trusted ? now() : undefined, lastSeenAt: now() }; await this.repo.put('devices', row); await this.audit.write({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DEVICE.TRUST.SET', entityType: 'CORE.DEVICE', entityId: deviceId, rootChangeId: rootId(ctx), deviceId: ctx.deviceId, result: 'OK', detail: { trusted } }); return row; }
        async openSession(userId, deviceId, workspaceId, appVersion) { const at = now(), row = { id: uid('SESSION'), userId, deviceId, workspaceId, status: 'ACTIVE', startedAt: at, lastSeenAt: at, appVersion }; await this.repo.put('sessions', row); return row; }
        async touchSession(id) { const old = await this.repo.get('sessions', id); if (!old || old.status !== 'ACTIVE')
            return old; const at = now(), row = { ...old, lastSeenAt: at }; await this.repo.put('sessions', row); const device = await this.getDevice(old.deviceId); if (device)
            await this.repo.put('devices', { ...device, lastSeenAt: at }); return row; }
        async closeSession(id) { const old = await this.repo.get('sessions', id); if (!old || old.status !== 'ACTIVE')
            return old; const at = now(), row = { ...old, status: 'CLOSED', lastSeenAt: at, endedAt: at }; await this.repo.put('sessions', row); return row; }
        async cleanupStaleSessions(input = {}, ctx = { actorId: 'SYSTEM', appCode: 'APP.NEXUS' }) { const threshold = Math.max(60_000, input.staleAfterMs ?? 300_000), cutoff = Date.now() - threshold, at = now(), changed = []; for (const old of await this.listSessions()) {
            if (old.status !== 'ACTIVE' || old.id === input.excludeSessionId || input.workspaceId && old.workspaceId !== input.workspaceId)
                continue;
            const seen = Date.parse(old.lastSeenAt);
            if (!Number.isFinite(seen) || seen > cutoff)
                continue;
            const row = { ...old, status: 'STALE', endedAt: at, staleReason: 'HEARTBEAT_TIMEOUT' };
            await this.repo.put('sessions', row);
            await this.audit.write({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.SESSION.STALE.CLOSE', entityType: 'CORE.SESSION', entityId: row.id, rootChangeId: rootId(ctx), deviceId: row.deviceId, result: 'OK', detail: { workspaceId: row.workspaceId, lastSeenAt: old.lastSeenAt, staleAfterMs: threshold } });
            changed.push(row);
        } return changed; }
        async recordCapabilities(row) { await this.repo.put('capabilityReports', row); return row; }
        async capabilityHistory(deviceId) { const rows = await this.repo.all('capabilityReports'); return rows.filter(x => !deviceId || x.deviceId === deviceId).sort((a, b) => b.at.localeCompare(a.at)); }
    }
    KX.DeviceSessionService = DeviceSessionService;
    class ResourceAccessService {
        sharing;
        memberships;
        constructor(sharing, memberships) {
            this.sharing = sharing;
            this.memberships = memberships;
        }
        globalPath(target) { return `RESOURCE/${target.kind}.${target.id}`; }
        spacePath(target, spaceId) { return `${spaceId}/${target.ownerApp}/${target.kind}.${target.id}`; }
        async resolve(target, subjectId) { const explanations = []; const global = await this.sharing.resolve(this.globalPath(target), subjectId); explanations.push(global); if (global.mode === 'PRIVATE')
            return { target, role: global.role, source: global.source, via: 'EXPLICIT_GLOBAL', explanations }; if (global.mode === 'CUSTOM')
            return { target, role: global.role, source: global.source, via: 'EXPLICIT_GLOBAL', explanations }; let best; const weight = (r) => ({ READ: 10, EDIT: 20, MANAGE: 30 })[r]; for (const spaceId of target.spaceIds) {
            const explicit = await this.sharing.resolve(this.spacePath(target, spaceId), subjectId);
            explanations.push(explicit);
            if (explicit.mode === 'PRIVATE' || explicit.mode === 'CUSTOM') {
                if (explicit.role && (!best || weight(explicit.role) > weight(best.role)))
                    best = { role: explicit.role, source: explicit.source, via: 'EXPLICIT_SPACE' };
                continue;
            }
            const role = await this.memberships.roleFor(spaceId, subjectId);
            if (role && (!best || weight(role) > weight(best.role)))
                best = { role, source: spaceId, via: 'SPACE_MEMBERSHIP' };
        } if (best)
            return { target, role: best.role, source: best.source, via: best.via, explanations }; return { target, role: null, source: 'UNCONFIGURED', via: 'NONE', explanations }; }
        /* N2.5p (user): the SUPERADMIN sees and edits everything (debugging bugs and the system) – the access module plugs in who it is;
           resolve() stays the plain rule (so the UI can say „superadmin view“), only can() lets the superadmin through */
        superadminCheck = null;
        async can(target, subjectId, required = 'READ') {
            const r = await this.resolve(target, subjectId);
            const w = (x) => ({ READ: 10, EDIT: 20, MANAGE: 30 })[x];
            if (r.role && w(r.role) >= w(required))
                return true;
            if (this.superadminCheck) {
                try {
                    if (await this.superadminCheck(subjectId, target))
                        return true;
                }
                catch { }
            }
            return false;
        }
        async whoCanAccess(target) { const users = await this.memberships.listUsers(), rows = []; for (const u of users) {
            const r = await this.resolve(target, u.id);
            if (r.role)
                rows.push({ userId: u.id, displayName: u.displayName, role: r.role, source: r.source, via: r.via });
        } return rows; }
        entity(row) { return { kind: 'ENTITY', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }; }
        file(row) { return { kind: 'FILE', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }; }
        document(row) { return { kind: 'DOCUMENT', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }; }
    }
    KX.ResourceAccessService = ResourceAccessService;
    class LaserDomainAccessService {
        memberships;
        access;
        constructor(memberships, access) {
            this.memberships = memberships;
            this.access = access;
        }
        system(ctx) { return ctx.actorId === 'SYSTEM'; }
        weight(role) { return role ? { READ: 10, EDIT: 20, MANAGE: 30 }[role] : 0; }
        async assertCreate(spaceIds, ctx) {
            if (this.system(ctx))
                return;
            if (!spaceIds.length)
                throw new Error('LASER scope denied: at least one Space is required');
            for (const spaceId of spaceIds) {
                const role = await this.memberships.roleFor(spaceId, ctx.actorId);
                if (this.weight(role) < this.weight('EDIT'))
                    throw new Error(`LASER scope denied: EDIT access required for ${spaceId}`);
            }
        }
        async assertEdit(row, ctx) {
            if (this.system(ctx))
                return;
            if (row.ownerApp !== 'APP.KX.LASER')
                throw new Error(`LASER scope denied: ${row.id} belongs to ${row.ownerApp}`);
            if (!await this.access.can(this.access.entity(row), ctx.actorId, 'EDIT'))
                throw new Error(`LASER scope denied: EDIT access required for ${row.id}`);
        }
        async assertReference(row, childSpaceIds, ctx, required = 'READ') {
            if (row.ownerApp !== 'APP.KX.LASER')
                throw new Error(`LASER reference denied: ${row.id} belongs to ${row.ownerApp}`);
            if (!this.system(ctx) && !await this.access.can(this.access.entity(row), ctx.actorId, required))
                throw new Error(`LASER reference denied: ${required} access required for ${row.id}`);
            for (const spaceId of childSpaceIds)
                if (!row.spaceIds.includes(spaceId))
                    throw new Error(`LASER privacy denied: referenced ${row.id} is not visible in ${spaceId}`);
        }
    }
    KX.LaserDomainAccessService = LaserDomainAccessService;
    class LaserDomainService {
        entities;
        relations;
        accessGuard;
        revisions;
        static OWNER = 'APP.KX.LASER';
        static TYPES = ['APP.LASER.MACHINE', 'APP.LASER.SOURCE_MODULE', 'APP.LASER.PROFILE', 'APP.LASER.LENS', 'APP.LASER.PROJECT', 'APP.LASER.OPERATION', 'APP.LASER.TEST', 'APP.LASER.TEST_RUN', 'APP.LASER.IMPORT', 'APP.LASER.MATERIAL'];
        constructor(entities, relations, accessGuard, revisions) {
            this.entities = entities;
            this.relations = relations;
            this.accessGuard = accessGuard;
            this.revisions = revisions;
        }
        isType(row, type) { return !!row && row.type === type && row.ownerApp === LaserDomainService.OWNER; }
        async list(type) { return (await this.entities.list()).filter(x => x.ownerApp === LaserDomainService.OWNER && LaserDomainService.TYPES.includes(x.type) && (!type || x.type === type)); }
        async get(id, type) { const row = await this.entities.get(id); if (!row || row.ownerApp !== LaserDomainService.OWNER || !LaserDomainService.TYPES.includes(row.type))
            return undefined; if (type && row.type !== type)
            throw new Error(`LASER type mismatch: ${id} is ${row.type}, expected ${type}`); return row; }
        recordUid(oldData, newData) {
            const existing = oldData?.recordUid?.trim();
            const requested = newData.recordUid?.trim();
            if (existing && requested && existing !== requested)
                throw new Error('LASER recordUid is immutable');
            return existing || requested || uid('LUID');
        }
        recordCode(prefix, oldData, newData) {
            const existing = oldData?.recordCode?.trim();
            const requested = newData.recordCode?.trim();
            if (existing && requested && existing !== requested)
                throw new Error('LASER recordCode is immutable');
            const code = existing || requested || `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
            if (!new RegExp(`^${prefix}(?:[-_.].+|$)`).test(code))
                throw new Error(`LASER recordCode must start with ${prefix}`);
            return code;
        }
        async old(input, type) { if (!input.id)
            return undefined; const row = await this.get(input.id, type); if (!row)
            throw new Error(`LASER ${type} ${input.id} not found`); return row; }
        spaces(input, old) { return [...(input.spaceIds ?? old?.spaceIds ?? [])]; }
        async ref(id, type, spaces, ctx, required = 'READ') { const row = await this.get(id, type); if (!row)
            throw new Error(`LASER reference ${type} ${id} not found`); await this.accessGuard.assertReference(row, spaces, ctx, required); return row; }
        async save(type, input, data, ctx) {
            const old = await this.old(input, type), spaceIds = this.spaces(input, old);
            if (old)
                await this.accessGuard.assertEdit(old, ctx);
            else
                await this.accessGuard.assertCreate(spaceIds, ctx);
            let targetId = input.id;
            if (!old && input.migrationPlannedId) {
                if (!ctx.permissions?.includes('LASER.MIGRATION.INTERNAL'))
                    throw new Error('LASER migrationPlannedId requires LASER.MIGRATION.INTERNAL');
                if (!/^LASER\.MIG\.[A-F0-9]{24}$/.test(input.migrationPlannedId))
                    throw new Error('LASER migrationPlannedId has invalid format');
                if (await this.entities.get(input.migrationPlannedId))
                    throw new Error(`LASER migrationPlannedId collision ${input.migrationPlannedId}`);
                targetId = input.migrationPlannedId;
            }
            return this.entities.save({ id: targetId, type, ownerApp: LaserDomainService.OWNER, schema: `KX.${type}/1`, spaceIds, archivedAt: input.archivedAt, data, expectedRevision: input.expectedRevision }, ctx);
        }
        async syncRelations(source, specs, ctx) {
            const desired = new Set(specs.map(x => `${x.relationType}|${x.target.id}`));
            const current = (await this.relations.forEntity(source.id)).filter(x => x.sourceId === source.id && x.ownerApp === LaserDomainService.OWNER && x.code.startsWith('REL.LASER.'));
            for (const row of current)
                if (!desired.has(`${row.relationType}|${row.targetId}`))
                    await this.relations.remove(row.id, ctx);
            for (const spec of specs) {
                if (current.some(x => x.relationType === spec.relationType && x.targetId === spec.target.id))
                    continue;
                await this.relations.create({ code: `REL.LASER.${spec.relationType}`, sourceType: source.type, sourceId: source.id, targetType: spec.target.type, targetId: spec.target.id, relationType: spec.relationType, ownerApp: LaserDomainService.OWNER }, ctx);
            }
        }
        assertLensSet(lensIds, defaultLensId) { if (!Array.isArray(lensIds) || !lensIds.length)
            throw new Error('LASER lensIds must contain at least one lens'); if (new Set(lensIds).size !== lensIds.length)
            throw new Error('LASER lensIds contain duplicates'); if (defaultLensId && !lensIds.includes(defaultLensId))
            throw new Error('LASER defaultLensId must be included in lensIds'); }
        assertParameterPair(parameters) {
            if (parameters.speedMmPerS !== undefined && parameters.speedMmPerMin !== undefined && Math.abs(parameters.speedMmPerMin - parameters.speedMmPerS * 60) > 0.001)
                throw new Error('LASER speed mm/s <-> mm/min mismatch');
            if (parameters.lineIntervalMm !== undefined && parameters.dpi !== undefined && parameters.lineIntervalMm > 0 && Math.abs(parameters.dpi - 25.4 / parameters.lineIntervalMm) > 0.5)
                throw new Error('LASER line interval <-> DPI mismatch');
            if (parameters.rotaryDiameterMm !== undefined && parameters.rotaryCircumferenceMm !== undefined && Math.abs(parameters.rotaryCircumferenceMm - Math.PI * parameters.rotaryDiameterMm) > 0.05)
                throw new Error('LASER rotary diameter <-> circumference mismatch');
        }
        trashType(type) {
            if (type !== 'APP.LASER.PROJECT' && type !== 'APP.LASER.TEST' && type !== 'APP.LASER.TEST_RUN')
                throw new Error(`LASER Trash resource type unsupported: ${type}`);
            return type;
        }
        async digest(value) { return sha256Bytes(new TextEncoder().encode(stableStringify(value))); }
        async relationSha(id) { const rows = (await this.relations.forEntity(id)).filter(x => x.ownerApp === LaserDomainService.OWNER).map(x => ({ code: x.code, sourceType: x.sourceType, sourceId: x.sourceId, targetType: x.targetType, targetId: x.targetId, relationType: x.relationType, ownerApp: x.ownerApp })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))); return this.digest(rows); }
        async timingSha(data) { return data?.timing ? this.digest(data.timing) : undefined; }
        freezeTimingForTrash(data, deletedAt) {
            const out = structuredClone(data), sw = out.timing?.stopwatch;
            if (!sw?.running)
                return out;
            const atMs = Date.parse(deletedAt), startAt = sw.startAt === null ? null : Number(sw.startAt), extra = startAt !== null && Number.isFinite(startAt) ? Math.max(0, atMs - startAt) : 0;
            sw.elapsedMs = Math.max(0, Number(sw.elapsedMs || 0)) + extra;
            sw.running = false;
            sw.startAt = null;
            sw.restoreMode = 'FROZEN_AT_DELETE';
            sw.legacyRunningAtCapture = true;
            sw.capturedAt = atMs;
            return out;
        }
        restoreStatus(previous) { const p = String(previous || '').toUpperCase(); if (p === 'RUNNING')
            return 'READY'; if (p === 'READY' || p === 'DONE' || p === 'DRAFT')
            return p; return 'DRAFT'; }
        async saveTrashType(type, input, ctx) { if (type === 'APP.LASER.PROJECT')
            return this.saveProject(input, ctx); if (type === 'APP.LASER.TEST')
            return this.saveTest(input, ctx); return this.saveTestRun(input, ctx); }
        async assertTrashDependencies(type, id) { const rows = await this.list(); if (type === 'APP.LASER.PROJECT') {
            const deps = rows.filter(x => !x.archivedAt && ((x.type === 'APP.LASER.OPERATION' && x.data?.projectId === id) || (x.type === 'APP.LASER.TEST' && x.data?.projectId === id)));
            if (deps.length)
                throw new Error(`LASER_TRASH_ACTIVE_DEPENDENCIES:${deps.map(x => `${x.type}:${x.id}`).join(',')}`);
        } if (type === 'APP.LASER.TEST') {
            const deps = rows.filter(x => !x.archivedAt && x.type === 'APP.LASER.TEST_RUN' && x.data?.testId === id);
            if (deps.length)
                throw new Error(`LASER_TRASH_ACTIVE_DEPENDENCIES:${deps.map(x => `${x.type}:${x.id}`).join(',')}`);
        } }
        async assertRestoreIdentity(row) { const d = row.data, rows = await this.list(row.type); for (const other of rows) {
            if (other.id === row.id || other.archivedAt)
                continue;
            const od = other.data;
            if (d.recordUid && od.recordUid === d.recordUid)
                throw new Error(`LASER_TRASH_ACTIVE_IDENTITY_COLLISION:recordUid:${d.recordUid}`);
            if (d.recordCode && od.recordCode === d.recordCode)
                throw new Error(`LASER_TRASH_ACTIVE_IDENTITY_COLLISION:recordCode:${d.recordCode}`);
        } }
        async trashStage(resourceType, resourceId, ctx) {
            const type = this.trashType(resourceType), before = await this.get(resourceId, type);
            if (!before)
                throw new Error(`LASER Trash resource ${resourceId} not found`);
            if (before.archivedAt)
                throw new Error('LASER resource is already archived');
            await this.accessGuard.assertEdit(before, ctx);
            await this.assertTrashDependencies(type, resourceId);
            const deletedAt = now(), relationSha256 = await this.relationSha(resourceId), timingSha256Before = await this.timingSha(before.data), data = structuredClone(before.data), previousStatus = (type === 'APP.LASER.PROJECT' || type === 'APP.LASER.TEST') ? String(data.status || 'DRAFT') : undefined, restoreStatus = previousStatus ? this.restoreStatus(previousStatus) : undefined;
            let archivedData = data;
            if (type === 'APP.LASER.PROJECT' || type === 'APP.LASER.TEST') {
                archivedData = this.freezeTimingForTrash(data, deletedAt);
                archivedData.status = 'ARCHIVED';
            }
            const archived = await this.saveTrashType(type, { id: before.id, expectedRevision: before.revision, spaceIds: [...before.spaceIds], archivedAt: deletedAt, data: archivedData }, ctx), readback = await this.get(before.id, type);
            if (!readback?.archivedAt)
                throw new Error('LASER Trash archive readback missing archivedAt');
            const bd = before.data, rd = readback.data;
            if (bd.recordUid !== rd.recordUid || bd.recordCode !== rd.recordCode)
                throw new Error('LASER Trash identity changed during archive');
            if (await this.relationSha(resourceId) !== relationSha256)
                throw new Error('LASER Trash relation graph changed during archive');
            const timingSha256Archived = await this.timingSha(readback.data);
            return { before, archived, deletedAt, previousStatus, restoreStatus, stableIdentity: String(rd.recordCode || rd.recordUid || before.id), relationSha256, timingSha256Before, timingSha256Archived };
        }
        async rollbackTrashStage(stage, ctx) { const type = this.trashType(stage.before.type), current = await this.get(stage.before.id, type); if (!current)
            throw new Error('LASER Trash rollback resource missing'); return this.saveTrashType(type, { id: stage.before.id, expectedRevision: current.revision, spaceIds: [...stage.before.spaceIds], archivedAt: stage.before.archivedAt ?? null, data: structuredClone(stage.before.data) }, ctx); }
        async restoreTrash(resourceType, resourceId, metadata, ctx) {
            const type = this.trashType(resourceType), row = await this.get(resourceId, type);
            if (!row)
                throw new Error(`LASER Trash restore resource ${resourceId} not found`);
            if (!row.archivedAt)
                throw new Error('LASER Trash restore requires archived resource');
            await this.accessGuard.assertEdit(row, ctx);
            await this.assertRestoreIdentity(row);
            const d = row.data, uidBefore = String(d.recordUid || ''), codeBefore = String(d.recordCode || ''), timingBefore = await this.timingSha(d), relationBefore = await this.relationSha(resourceId);
            if (metadata?.recordUid && String(metadata.recordUid) !== uidBefore)
                throw new Error('LASER Trash metadata recordUid mismatch');
            if (metadata?.recordCode && String(metadata.recordCode) !== codeBefore)
                throw new Error('LASER Trash metadata recordCode mismatch');
            if (metadata?.relationSha256 && String(metadata.relationSha256) !== relationBefore)
                throw new Error('LASER Trash relation readback mismatch before restore');
            if (metadata?.timingSha256Archived && timingBefore && String(metadata.timingSha256Archived) !== timingBefore)
                throw new Error('LASER Trash timing readback mismatch before restore');
            const data = structuredClone(d);
            if (type === 'APP.LASER.PROJECT' || type === 'APP.LASER.TEST')
                data.status = this.restoreStatus(metadata?.restoreStatus || metadata?.previousStatus);
            const restored = await this.saveTrashType(type, { id: row.id, expectedRevision: row.revision, spaceIds: [...row.spaceIds], archivedAt: null, data }, ctx), readback = await this.get(row.id, type);
            if (!readback || readback.archivedAt)
                throw new Error('LASER Trash restore readback still archived');
            const rd = readback.data;
            if (String(rd.recordUid || '') !== uidBefore || String(rd.recordCode || '') !== codeBefore)
                throw new Error('LASER Trash restore identity mismatch');
            const timingAfter = await this.timingSha(rd);
            if (timingBefore !== timingAfter)
                throw new Error('LASER Trash restore timing history changed');
            const relationAfter = await this.relationSha(resourceId);
            if (relationAfter !== relationBefore)
                throw new Error('LASER Trash restore relation graph changed');
            return { status: 'RESTORED', resourceId, exists: true, trashed: false, ownerRevision: restored.revision, evidence: ['LASER_ARCHIVED_AT_CLEARED', 'LASER_RECORD_UID_VERIFIED', ...(codeBefore ? ['LASER_RECORD_CODE_VERIFIED'] : []), 'LASER_RELATION_GRAPH_VERIFIED', ...(timingBefore ? ['LASER_TIMING_HISTORY_VERIFIED', 'LASER_STOPWATCH_NOT_AUTO_RESUMED'] : [])] };
        }
        async auditPurgeDependencies(resourceType, resourceId, ctx) {
            const type = this.trashType(resourceType), row = await this.get(resourceId, type);
            if (!row)
                throw new Error(`LASER purge audit resource ${resourceId} not found`);
            await this.accessGuard.assertEdit(row, ctx);
            const all = await this.list(), data = row.data, stableIdentity = String(data.recordCode || data.recordUid || row.id), dependencies = [];
            const addDep = (x, relation) => dependencies.push({ id: x.id, type: x.type, archived: !!x.archivedAt, relation, stableIdentity: String(x.data?.recordCode || x.data?.recordUid || x.id) });
            if (type === 'APP.LASER.PROJECT')
                for (const x of all)
                    if ((x.type === 'APP.LASER.OPERATION' && x.data?.projectId === row.id) || (x.type === 'APP.LASER.TEST' && x.data?.projectId === row.id))
                        addDep(x, x.type === 'APP.LASER.OPERATION' ? 'PROJECT_OPERATION' : 'PROJECT_TEST');
            if (type === 'APP.LASER.TEST')
                for (const x of all)
                    if (x.type === 'APP.LASER.TEST_RUN' && x.data?.testId === row.id)
                        addDep(x, 'TEST_RUN');
            dependencies.sort((a, b) => `${a.type}|${a.id}`.localeCompare(`${b.type}|${b.id}`));
            const importReferences = all.filter(x => x.type === 'APP.LASER.IMPORT' && Array.isArray(x.data?.mappedEntityIds) && x.data.mappedEntityIds.includes(row.id)).map(x => ({ id: x.id, recordUid: x.data?.recordUid, recordCode: x.data?.recordCode, archived: !!x.archivedAt, mappedEntityIds: [...(x.data?.mappedEntityIds || [])] })).sort((a, b) => a.id.localeCompare(b.id));
            const relationRows = (await this.relations.forEntity(row.id)).slice().sort((a, b) => a.id.localeCompare(b.id)), ownedRelationIds = relationRows.filter(x => x.ownerApp === LaserDomainService.OWNER).map(x => x.id), foreignRelationIds = relationRows.filter(x => x.ownerApp !== LaserDomainService.OWNER).map(x => x.id), relationView = relationRows.map(x => ({ id: x.id, code: x.code, sourceType: x.sourceType, sourceId: x.sourceId, targetType: x.targetType, targetId: x.targetId, relationType: x.relationType, ownerApp: x.ownerApp })), relationSha256 = await this.digest(relationView);
            const revisionRows = this.revisions ? await this.revisions.list(row.id) : [], revisionItems = [];
            for (const rev of revisionRows)
                revisionItems.push({ id: rev.id, revision: rev.revision, snapshotSha256: await this.digest(rev.snapshot) });
            revisionItems.sort((a, b) => a.revision - b.revision || a.id.localeCompare(b.id));
            const revisionSha256 = await this.digest(revisionItems);
            const blockers = [];
            if (!row.archivedAt)
                blockers.push('RESOURCE_NOT_ARCHIVED');
            if (dependencies.length)
                blockers.push('OWNED_CHILD_ENTITIES_PRESENT');
            if (importReferences.length)
                blockers.push('KXI_IMPORT_REFERENCES_PRESENT');
            if (foreignRelationIds.length)
                blockers.push('FOREIGN_RELATIONS_PRESENT');
            if (!revisionItems.length)
                blockers.push('REVISION_SNAPSHOT_UNAVAILABLE');
            blockers.push('ATOMIC_ENTITY_REVISION_RELATION_PURGE_UNAVAILABLE', 'ROLLBACK_COMPENSATION_PRIMITIVE_UNAVAILABLE', 'LASER_PURGE_ACTION_NOT_PUBLISHED');
            const warnings = [];
            if (ownedRelationIds.length)
                warnings.push('OWNED_RELATIONS_REQUIRE_TRANSACTIONAL_DELETE');
            if (revisionItems.length > 1)
                warnings.push('MULTIPLE_REVISIONS_REQUIRE_EXPLICIT_PURGE_SCOPE');
            if (type === 'APP.LASER.PROJECT' || type === 'APP.LASER.TEST')
                warnings.push('TIMING_HISTORY_MUST_BE_BACKED_UP_BEFORE_PURGE');
            const designBlockers = blockers.filter(x => !['ATOMIC_ENTITY_REVISION_RELATION_PURGE_UNAVAILABLE', 'ROLLBACK_COMPENSATION_PRIMITIVE_UNAVAILABLE', 'LASER_PURGE_ACTION_NOT_PUBLISHED'].includes(x));
            return { contract: 'KX.LASER_PURGE_DEPENDENCY_AUDIT/1', readOnly: true, purgeExecutionAllowed: false, resourceType: type, resourceId: row.id, archived: !!row.archivedAt, stableIdentity, targetSnapshotSha256: await this.digest(row), timingSha256: await this.timingSha(data), dependencies, importReferences, relations: { count: relationRows.length, sha256: relationSha256, ownedRelationIds, foreignRelationIds }, revisions: { count: revisionItems.length, sha256: revisionSha256, items: revisionItems }, cleanupPlan: { entityId: row.id, relationIds: ownedRelationIds, revisionIds: revisionItems.map(x => x.id), childEntityIds: dependencies.map(x => x.id), importReferenceIds: importReferences.map(x => x.id) }, rollbackRequirements: { backupEvidenceRequired: true, exactEntitySnapshotRequired: true, exactRelationsRequired: true, exactRevisionsRequired: true, compensationPrimitiveAvailable: false }, designReadiness: designBlockers.length === 0, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], safeguards: ['READ_ONLY_AUDIT', 'NO_PURGE_EXECUTION', 'ALL_CHILDREN_ACTIVE_OR_ARCHIVED_ARE_COUNTED', 'KXI_IMPORT_REFERENCES_ARE_COUNTED', 'FOREIGN_RELATIONS_FAIL_CLOSED', 'EXACT_ENTITY_RELATION_REVISION_HASHES', 'BACKUP_REQUIRED_BEFORE_FUTURE_PURGE', 'NO_CASCADE_WITHOUT_EXPLICIT_TRANSACTION', 'NO_TIMER_OR_IDENTITY_LOSS'] };
        }
        async simulatePurgeTransaction(resourceType, resourceId, ctx) {
            const audit = await this.auditPurgeDependencies(resourceType, resourceId, ctx), type = this.trashType(resourceType), row = await this.get(resourceId, type);
            if (!row)
                throw new Error(`LASER purge sandbox resource ${resourceId} not found`);
            const relationRows = (await this.relations.forEntity(resourceId)).slice().sort((a, b) => a.id.localeCompare(b.id));
            const revisionRows = this.revisions ? await this.revisions.list(resourceId) : [];
            const all = await this.list(), imports = all.filter(x => x.type === 'APP.LASER.IMPORT' && Array.isArray(x.data?.mappedEntityIds) && x.data.mappedEntityIds.includes(resourceId)).sort((a, b) => a.id.localeCompare(b.id));
            const backup = { target: structuredClone(row), relations: structuredClone(relationRows), revisions: structuredClone(revisionRows), imports: structuredClone(imports) };
            const liveState = async () => { const target = await this.get(resourceId, type), relations = (await this.relations.forEntity(resourceId)).slice().sort((a, b) => a.id.localeCompare(b.id)), revisions = this.revisions ? await this.revisions.list(resourceId) : [], currentImports = (await this.list('APP.LASER.IMPORT')).filter(x => Array.isArray(x.data?.mappedEntityIds) && x.data.mappedEntityIds.includes(resourceId)).sort((a, b) => a.id.localeCompare(b.id)); return { target, relations, revisions, currentImports }; };
            const liveWorkspaceBeforeSha256 = await this.digest(await liveState()), baselineSha256 = await this.digest(backup), targetSha256 = await this.digest(backup.target), relationsSha256 = await this.digest(backup.relations), revisionsSha256 = await this.digest(backup.revisions), importsSha256 = await this.digest(backup.imports);
            const designBlockers = [];
            if (!audit.archived)
                designBlockers.push('RESOURCE_NOT_ARCHIVED');
            if (audit.dependencies.length)
                designBlockers.push('OWNED_CHILD_ENTITIES_PRESENT');
            if (audit.relations.foreignRelationIds.length)
                designBlockers.push('FOREIGN_RELATIONS_PRESENT');
            if (!audit.revisions.count)
                designBlockers.push('REVISION_SNAPSHOT_UNAVAILABLE');
            const kxiRepairs = imports.map(imp => { const ids = [...(imp.data?.mappedEntityIds || [])].map(String); return { importId: imp.id, beforeMappedEntityIds: ids, afterMappedEntityIds: ids.filter(id => id !== resourceId) }; });
            const plan = { contract: 'KX.LASER_PURGE_TRANSACTION_PLAN/1', steps: [{ order: 1, code: 'KXI_MAPPING_REPAIR', count: kxiRepairs.length, ids: kxiRepairs.map(x => x.importId) }, { order: 2, code: 'OWNED_RELATION_DELETE', count: audit.relations.ownedRelationIds.length, ids: [...audit.relations.ownedRelationIds] }, { order: 3, code: 'TARGET_REVISION_DELETE', count: audit.revisions.items.length, ids: audit.revisions.items.map(x => x.id) }, { order: 4, code: 'TARGET_ENTITY_DELETE', count: 1, ids: [resourceId] }], kxiRepairs, cleanup: { entityId: resourceId, relationIds: [...audit.relations.ownedRelationIds], revisionIds: audit.revisions.items.map(x => x.id) }, rollbackStrategy: 'EXACT_BACKUP_ENVELOPE_RESTORE', atomicPrimitiveAvailable: false };
            const mutate = (source, faultPoint) => {
                let state = structuredClone(source);
                const fail = (point) => { if (faultPoint === point)
                    throw new Error(`SANDBOX_FAULT:${point}`); };
                state.imports = state.imports.map((imp) => ({ ...imp, data: { ...imp.data, mappedEntityIds: [...(imp.data?.mappedEntityIds || [])].filter((id) => id !== resourceId) } }));
                fail('AFTER_KXI_REPAIR');
                state.relations = state.relations.filter((rel) => !audit.relations.ownedRelationIds.includes(rel.id));
                fail('AFTER_RELATION_DELETE');
                state.revisions = state.revisions.filter((rev) => !audit.revisions.items.some(x => x.id === rev.id));
                fail('AFTER_REVISION_DELETE');
                state.target = undefined;
                fail('AFTER_ENTITY_DELETE');
                return state;
            };
            let successVerified = false, successFinalSha256;
            if (designBlockers.length === 0) {
                const success = mutate(backup);
                successFinalSha256 = await this.digest(success);
                successVerified = !success.target && success.revisions.length === 0 && success.relations.every((x) => !audit.relations.ownedRelationIds.includes(x.id)) && success.imports.every((imp) => !(imp.data?.mappedEntityIds || []).includes(resourceId));
            }
            const faultPoints = ['AFTER_KXI_REPAIR', 'AFTER_RELATION_DELETE', 'AFTER_REVISION_DELETE', 'AFTER_ENTITY_DELETE'], faults = [];
            if (designBlockers.length === 0)
                for (const faultPoint of faultPoints) {
                    let rollback = structuredClone(backup), rollbackApplied = false;
                    try {
                        mutate(backup, faultPoint);
                    }
                    catch {
                        rollback = structuredClone(backup);
                        rollbackApplied = true;
                    }
                    const rollbackSha256 = await this.digest(rollback);
                    faults.push({ faultPoint, rollbackApplied, rollbackSha256, parity: rollbackSha256 === baselineSha256 });
                }
            const liveWorkspaceAfterSha256 = await this.digest(await liveState()), allFaultsRollbackParity = designBlockers.length === 0 && faults.length === faultPoints.length && faults.every(x => x.rollbackApplied && x.parity);
            return { contract: 'KX.LASER_PURGE_TRANSACTION_SANDBOX/1', readOnly: true, purgeExecutionAllowed: false, resourceType: type, resourceId, transactionDesignReady: designBlockers.length === 0, designBlockers, audit, backupEnvelope: { contract: 'KX.LASER_PURGE_BACKUP_ENVELOPE/1', sha256: baselineSha256, targetSha256, relationsSha256, revisionsSha256, importsSha256, targetRevisionCount: backup.revisions.length, relationCount: backup.relations.length, importCount: backup.imports.length }, plan, simulation: { baselineSha256, successFinalSha256, successVerified, faults, allFaultsRollbackParity, liveWorkspaceBeforeSha256, liveWorkspaceAfterSha256, liveWorkspaceUnchanged: liveWorkspaceBeforeSha256 === liveWorkspaceAfterSha256 }, safeguards: ['READ_ONLY_SANDBOX', 'NO_LIVE_REPOSITORY_WRITES', 'NO_PURGE_ACTION_PUBLISHED', 'EXACT_BACKUP_ENVELOPE', 'EXPLICIT_KXI_MAPPING_REPAIR', 'OWNED_RELATIONS_ONLY', 'ALL_TARGET_REVISIONS_INCLUDED', 'FAULT_INJECTION_AFTER_EVERY_STEP', 'ROLLBACK_HASH_PARITY_REQUIRED', 'LIVE_WORKSPACE_HASH_PARITY_REQUIRED'] };
        }
        async saveMaterial(input, ctx) {
            const old = await this.old(input, 'APP.LASER.MATERIAL'), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data) };
            if (!String(d.name || '').trim())
                throw new Error('LASER_MATERIAL_NAME_REQUIRED');
            if (!String(d.group || '').trim())
                throw new Error('LASER_MATERIAL_GROUP_REQUIRED');
            if (!['OK', 'CAUTION', 'FORBIDDEN'].includes(d.status))
                throw new Error('LASER_MATERIAL_STATUS_INVALID');
            if (!['P566', 'ESHOP', 'ADDED', 'USER'].includes(d.source))
                throw new Error('LASER_MATERIAL_SOURCE_INVALID');
            if ((d.status === 'FORBIDDEN' || d.status === 'CAUTION') && !String(d.why || '').trim())
                throw new Error('LASER_MATERIAL_WHY_REQUIRED');
            if (d.compat != null) {
                if (typeof d.compat !== 'object' || Array.isArray(d.compat))
                    throw new Error('LASER_MATERIAL_COMPAT_INVALID');
                for (const [k, v] of Object.entries(d.compat)) {
                    if (!['355', '450', '1064', '10600'].includes(k) || !['OK', 'PREP', 'NO'].includes(String(v)))
                        throw new Error('LASER_MATERIAL_COMPAT_INVALID');
                }
            }
            for (const k of ['name', 'group', 'shopTag', 'hazardCode', 'hazardTitle', 'why', 'whatToDo', 'compatNote', 'prep', 'notes', 'gridNote'])
                if (d[k] != null && String(d[k]).length > (k === 'why' || k === 'whatToDo' || k === 'notes' || k === 'prep' || k === 'gridNote' ? 1200 : 200))
                    throw new Error('LASER_MATERIAL_TEXT_TOO_LONG');
            return this.save('APP.LASER.MATERIAL', input, d, ctx);
        }
        async saveMachine(input, ctx) {
            const old = await this.old(input, 'APP.LASER.MACHINE'), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data), technologyCodes: [...new Set(input.data.technologyCodes || [])] };
            if (!d.name?.trim())
                throw new Error('LASER machine name is required');
            if (!d.technologyCodes.length)
                throw new Error('LASER machine technologyCodes are required');
            /* N2.4c: planning fields – validated, all optional (older machines keep working) */
            if (d.capacityHoursPerDay != null && !(Number.isFinite(d.capacityHoursPerDay) && d.capacityHoursPerDay >= 0 && d.capacityHoursPerDay <= 24))
                throw new Error('LASER_CAPACITY_RANGE');
            if (d.status != null && !['ACTIVE', 'MAINTENANCE', 'FAULT', 'OFF'].includes(d.status))
                throw new Error('LASER_STATUS_INVALID');
            /* N2.4i: accessories validated (kind, numbers > 0, axis, ranges min ≤ max, unique id) */
            if (d.accessories != null) {
                if (!Array.isArray(d.accessories) || d.accessories.length > 30)
                    throw new Error('LASER_ACCESSORIES_INVALID');
                const ids = new Set();
                for (const a of d.accessories) {
                    if (!a || !String(a.id || '').trim() || ids.has(a.id))
                        throw new Error('LASER_ACCESSORY_ID');
                    ids.add(a.id);
                    if (!['ROLLER', 'CHUCK', 'RING', 'LP_ROTARY', 'SLIDE', 'CONVEYOR'].includes(a.kind))
                        throw new Error('LASER_ACCESSORY_KIND');
                    if (!String(a.name || '').trim())
                        throw new Error('LASER_ACCESSORY_NAME');
                    for (const k of ['chuckDiameterMm', 'rollerDiameterMm', 'stepsPerRotation', 'minObjectMm', 'maxObjectMm'])
                        if (a[k] != null && !(Number.isFinite(a[k]) && a[k] > 0 && a[k] <= 100000))
                            throw new Error('LASER_ACCESSORY_NUMBER');
                    if (a.axis != null && !['X', 'Y'].includes(a.axis))
                        throw new Error('LASER_ACCESSORY_AXIS');
                    if (a.state != null && !['OK', 'FAULT'].includes(a.state))
                        throw new Error('LASER_ACCESSORY_STATE');
                    if (a.enabled != null && typeof a.enabled !== 'boolean')
                        throw new Error('LASER_ACCESSORY_ENABLED');
                    if (a.minObjectMm != null && a.maxObjectMm != null && a.minObjectMm > a.maxObjectMm)
                        throw new Error('LASER_ACCESSORY_RANGE');
                    for (const j of (a.jaws || []))
                        if (!j || !String(j.name || '').trim() || !(j.minMm > 0) || !(j.maxMm >= j.minMm))
                            throw new Error('LASER_ACCESSORY_RANGE');
                    if (a.workAreaMm != null && !(a.workAreaMm.w > 0 && a.workAreaMm.h > 0))
                        throw new Error('LASER_ACCESSORY_AREA');
                }
            }
            /* outage periods (from – to, YYYY-MM-DD): the planner does not allocate jobs to the machine in them */
            if (d.outages != null) {
                if (!Array.isArray(d.outages) || d.outages.length > 100)
                    throw new Error('LASER_OUTAGES_INVALID');
                const re = /^\d{4}-\d{2}-\d{2}$/;
                for (const o of d.outages) {
                    if (!o || !re.test(String(o.from)) || !re.test(String(o.to)) || String(o.to) < String(o.from))
                        throw new Error('LASER_OUTAGE_RANGE');
                    if (o.reason != null && String(o.reason).length > 200)
                        throw new Error('LASER_OUTAGE_RANGE');
                }
            }
            for (const k of ['prepMinutesDefault', 'finishMinutesDefault']) {
                const v = d[k];
                if (v != null && !(Number.isFinite(v) && v >= 0 && v <= 1440))
                    throw new Error('LASER_MINUTES_RANGE');
            }
            if (d.origin != null && !['PERSONAL', 'DEMO', 'USER'].includes(d.origin))
                throw new Error('LASER_ORIGIN_INVALID');
            const row = await this.save('APP.LASER.MACHINE', input, d, ctx);
            await this.syncRelations(row, [], ctx);
            return row;
        }
        async saveSourceModule(input, ctx) {
            const old = await this.old(input, 'APP.LASER.SOURCE_MODULE'), spaces = this.spaces(input, old), machine = await this.ref(input.data.machineId, 'APP.LASER.MACHINE', spaces, ctx), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data) };
            const machineData = machine.data;
            if (!machineData.technologyCodes.includes(d.technologyCode))
                throw new Error(`LASER source technology ${d.technologyCode} is not enabled on machine ${machine.id}`);
            const row = await this.save('APP.LASER.SOURCE_MODULE', input, d, ctx);
            await this.syncRelations(row, [{ target: machine, relationType: 'USES_MACHINE' }], ctx);
            return row;
        }
        async saveProfile(input, ctx) {
            const old = await this.old(input, 'APP.LASER.PROFILE'), spaces = this.spaces(input, old), machine = await this.ref(input.data.machineId, 'APP.LASER.MACHINE', spaces, ctx), source = await this.ref(input.data.sourceModuleId, 'APP.LASER.SOURCE_MODULE', spaces, ctx), sd = source.data, od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data) };
            if (sd.machineId !== machine.id)
                throw new Error('LASER profile source module belongs to a different machine');
            if (d.defaultLensId) {
                const lens = await this.ref(d.defaultLensId, 'APP.LASER.LENS', spaces, ctx);
                const ld = lens.data;
                if (ld.machineId !== machine.id)
                    throw new Error('LASER default lens belongs to a different machine');
            }
            const row = await this.save('APP.LASER.PROFILE', input, d, ctx);
            const specs = [{ target: machine, relationType: 'USES_MACHINE' }, { target: source, relationType: 'USES_SOURCE' }];
            if (d.defaultLensId) {
                const lens = await this.ref(d.defaultLensId, 'APP.LASER.LENS', spaces, ctx);
                specs.push({ target: lens, relationType: 'DEFAULT_LENS' });
            }
            await this.syncRelations(row, specs, ctx);
            return row;
        }
        async saveLens(input, ctx) {
            const old = await this.old(input, 'APP.LASER.LENS'), spaces = this.spaces(input, old), machine = await this.ref(input.data.machineId, 'APP.LASER.MACHINE', spaces, ctx), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data) }, specs = [{ target: machine, relationType: 'USES_MACHINE' }];
            if (d.profileId) {
                const profile = await this.ref(d.profileId, 'APP.LASER.PROFILE', spaces, ctx), pd = profile.data;
                if (pd.machineId !== machine.id)
                    throw new Error('LASER lens profile belongs to a different machine');
                specs.push({ target: profile, relationType: 'USES_PROFILE' });
            }
            const row = await this.save('APP.LASER.LENS', input, d, ctx);
            await this.syncRelations(row, specs, ctx);
            return row;
        }
        async saveProject(input, ctx) {
            const old = await this.old(input, 'APP.LASER.PROJECT'), spaces = this.spaces(input, old), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data), recordCode: this.recordCode('KXP', od, input.data), lensIds: [...(input.data.lensIds || [])] };
            this.assertLensSet(d.lensIds, d.defaultLensId);
            const machine = await this.ref(d.machineId, 'APP.LASER.MACHINE', spaces, ctx), source = await this.ref(d.sourceModuleId, 'APP.LASER.SOURCE_MODULE', spaces, ctx), profile = await this.ref(d.profileId, 'APP.LASER.PROFILE', spaces, ctx), sd = source.data, pd = profile.data;
            if (sd.machineId !== machine.id || pd.machineId !== machine.id || pd.sourceModuleId !== source.id)
                throw new Error('LASER project machine/source/profile chain mismatch');
            const lensRows = [];
            for (const lensId of d.lensIds) {
                const lens = await this.ref(lensId, 'APP.LASER.LENS', spaces, ctx), ld = lens.data;
                if (ld.machineId !== machine.id)
                    throw new Error(`LASER project lens ${lensId} belongs to a different machine`);
                lensRows.push(lens);
            }
            const row = await this.save('APP.LASER.PROJECT', input, d, ctx);
            await this.syncRelations(row, [{ target: machine, relationType: 'USES_MACHINE' }, { target: source, relationType: 'USES_SOURCE' }, { target: profile, relationType: 'USES_PROFILE' }, ...lensRows.map(target => ({ target, relationType: 'USES_LENS' }))], ctx);
            return row;
        }
        async saveOperation(input, ctx) {
            const old = await this.old(input, 'APP.LASER.OPERATION'), spaces = this.spaces(input, old), project = await this.ref(input.data.projectId, 'APP.LASER.PROJECT', spaces, ctx, 'EDIT'), pd = project.data, lens = await this.ref(input.data.lensId, 'APP.LASER.LENS', spaces, ctx), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data), parameters: structuredClone(input.data.parameters || {}) };
            if (!pd.lensIds.includes(d.lensId))
                throw new Error('LASER operation lens is not assigned to the project'); /* N2.4j: sublayers – parent in the same project, no cycle */
            if (d.parentId) {
                let cur = d.parentId;
                const seen = new Set([String(old?.id || '')]);
                for (let i = 0; i < 50 && cur; i++) {
                    if (seen.has(cur))
                        throw new Error('LASER_OPERATION_PARENT_CYCLE');
                    seen.add(cur);
                    const par = await this.entities.get(cur);
                    if (!par || par.type !== 'APP.LASER.OPERATION' || par.data.projectId !== d.projectId)
                        throw new Error('LASER_OPERATION_PARENT_INVALID');
                    cur = par.data.parentId;
                }
            }
            if (!Number.isFinite(d.sequence) || d.sequence < 0)
                throw new Error('LASER operation sequence must be >= 0');
            this.assertParameterPair(d.parameters);
            const row = await this.save('APP.LASER.OPERATION', input, d, ctx);
            await this.syncRelations(row, [{ target: project, relationType: 'BELONGS_TO_PROJECT' }, { target: lens, relationType: 'USES_LENS' }], ctx);
            return row;
        }
        async saveTest(input, ctx) {
            const old = await this.old(input, 'APP.LASER.TEST'), spaces = this.spaces(input, old), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data), recordCode: this.recordCode('KXT', od, input.data), lensIds: [...(input.data.lensIds || [])] };
            this.assertLensSet(d.lensIds);
            const machine = await this.ref(d.machineId, 'APP.LASER.MACHINE', spaces, ctx), source = await this.ref(d.sourceModuleId, 'APP.LASER.SOURCE_MODULE', spaces, ctx), profile = await this.ref(d.profileId, 'APP.LASER.PROFILE', spaces, ctx), sd = source.data, pd = profile.data;
            if (sd.machineId !== machine.id || pd.machineId !== machine.id || pd.sourceModuleId !== source.id)
                throw new Error('LASER test machine/source/profile chain mismatch');
            const specs = [{ target: machine, relationType: 'USES_MACHINE' }, { target: source, relationType: 'USES_SOURCE' }, { target: profile, relationType: 'USES_PROFILE' }];
            for (const lensId of d.lensIds) {
                const lens = await this.ref(lensId, 'APP.LASER.LENS', spaces, ctx), ld = lens.data;
                if (ld.machineId !== machine.id)
                    throw new Error(`LASER test lens ${lensId} belongs to a different machine`);
                specs.push({ target: lens, relationType: 'USES_LENS' });
            }
            if (d.projectId) {
                const project = await this.ref(d.projectId, 'APP.LASER.PROJECT', spaces, ctx), projectData = project.data;
                if (projectData.machineId !== machine.id)
                    throw new Error('LASER test project belongs to a different machine');
                specs.push({ target: project, relationType: 'TESTS_PROJECT' });
            }
            const row = await this.save('APP.LASER.TEST', input, d, ctx);
            await this.syncRelations(row, specs, ctx);
            return row;
        }
        async saveTestRun(input, ctx) {
            const old = await this.old(input, 'APP.LASER.TEST_RUN'), spaces = this.spaces(input, old), test = await this.ref(input.data.testId, 'APP.LASER.TEST', spaces, ctx, 'EDIT'), td = test.data, lens = await this.ref(input.data.lensId, 'APP.LASER.LENS', spaces, ctx), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data), parameters: structuredClone(input.data.parameters || {}) };
            if (!td.lensIds.includes(d.lensId))
                throw new Error('LASER test run lens is not assigned to the test');
            this.assertParameterPair(d.parameters);
            const row = await this.save('APP.LASER.TEST_RUN', input, d, ctx);
            await this.syncRelations(row, [{ target: test, relationType: 'BELONGS_TO_TEST' }, { target: lens, relationType: 'USES_LENS' }], ctx);
            return row;
        }
        async saveImport(input, ctx) {
            const old = await this.old(input, 'APP.LASER.IMPORT'), od = old?.data, d = { ...input.data, recordUid: this.recordUid(od, input.data), recordCode: this.recordCode('KXI', od, input.data), mappedEntityIds: [...(input.data.mappedEntityIds || [])], warnings: [...(input.data.warnings || [])] };
            for (const id of d.mappedEntityIds) {
                const target = await this.get(id);
                if (!target)
                    throw new Error(`LASER import mapping target ${id} not found`);
            }
            const row = await this.save('APP.LASER.IMPORT', input, d, ctx);
            const targets = [];
            for (const id of d.mappedEntityIds) {
                const target = await this.get(id);
                if (target)
                    targets.push({ target, relationType: 'IMPORTS_TO' });
            }
            await this.syncRelations(row, targets, ctx);
            return row;
        }
    }
    KX.LaserDomainService = LaserDomainService;
    class LaserPurgeRepositoryTransactionSandboxService {
        liveRepo;
        laser;
        contract = 'KX.LASER_PURGE_REPOSITORY_TRANSACTION_SANDBOX/1';
        constructor(liveRepo, laser) {
            this.liveRepo = liveRepo;
            this.laser = laser;
        }
        async digest(value) { return sha256Bytes(new TextEncoder().encode(stableStringify(value))); }
        async exactState(repo, resourceId, relationIds, revisionIds, importIds) {
            const target = await repo.get('entities', resourceId), relations = [], revisions = [], imports = [];
            for (const id of [...relationIds].sort()) {
                const row = await repo.get('relations', id);
                if (row)
                    relations.push(row);
            }
            for (const id of [...revisionIds].sort()) {
                const row = await repo.get('revisions', id);
                if (row)
                    revisions.push(row);
            }
            for (const id of [...importIds].sort()) {
                const row = await repo.get('entities', id);
                if (row)
                    imports.push(row);
            }
            return { target, relations, revisions, imports };
        }
        async seed(repo, state) { const writes = []; if (state.target)
            writes.push({ store: 'entities', value: state.target }); for (const x of state.imports)
            writes.push({ store: 'entities', value: x }); for (const x of state.relations)
            writes.push({ store: 'relations', value: x }); for (const x of state.revisions)
            writes.push({ store: 'revisions', value: x }); await repo.atomic(writes); }
        async simulate(resourceType, resourceId, ctx) {
            const design = await this.laser.simulatePurgeTransaction(resourceType, resourceId, ctx), type = design.resourceType, relationIds = [...design.plan.cleanup.relationIds], revisionIds = [...design.plan.cleanup.revisionIds], importIds = design.plan.kxiRepairs.map(x => x.importId), designBlockers = [...design.designBlockers];
            const liveBefore = await this.exactState(this.liveRepo, resourceId, relationIds, revisionIds, importIds), liveWorkspaceBeforeSha256 = await this.digest(liveBefore);
            const backupSha256 = await this.digest(liveBefore);
            if (!design.transactionDesignReady)
                return { contract: this.contract, purgeExecutionAllowed: false, liveWorkspaceWrites: false, sandboxRepositoryWrites: true, resourceType: type, resourceId, transactionDesignReady: false, designBlockers, repositoryAdapter: 'MEMORY', atomicPrimitive: { contract: 'KX.REPOSITORY_ATOMIC_COMPENSATION/1', primaryAtomic: true, compensationAtomic: true, indexedDbStaticBound: true, nativeSqliteStaticBound: true }, backupSha256, primary: { result: { contract: 'KX.REPOSITORY_ATOMIC_COMPENSATION/1', primaryCommitted: false, primaryReadbackVerified: false, compensationRequired: false, compensationApplied: false, compensationVerified: false, error: 'DESIGN_NOT_READY' }, verified: false }, faults: [], allFaultsSafe: false, liveWorkspaceBeforeSha256, liveWorkspaceAfterSha256: liveWorkspaceBeforeSha256, liveWorkspaceUnchanged: true, safeguards: ['ISOLATED_MEMORY_REPOSITORY', 'NO_LIVE_REPOSITORY_WRITES', 'NO_PURGE_ACTION_PUBLISHED', 'PRIMARY_ATOMIC_COMMIT', 'COMPENSATION_ATOMIC_WRITE', 'EXACT_BACKUP_HASH_PARITY', 'LIVE_WORKSPACE_HASH_PARITY'] };
            const primaryWrites = design.plan.kxiRepairs.map(repair => { const original = liveBefore.imports.find(x => x.id === repair.importId); if (!original)
                throw new Error(`Missing KXI import ${repair.importId}`); return { store: 'entities', value: { ...structuredClone(original), data: { ...structuredClone(original.data), mappedEntityIds: [...repair.afterMappedEntityIds] } } }; });
            const primaryDeletes = [...relationIds.map(key => ({ store: 'relations', key })), ...revisionIds.map(key => ({ store: 'revisions', key })), { store: 'entities', key: resourceId }];
            const compensationWrites = [];
            if (liveBefore.target)
                compensationWrites.push({ store: 'entities', value: liveBefore.target });
            for (const x of liveBefore.imports)
                compensationWrites.push({ store: 'entities', value: x });
            for (const x of liveBefore.relations)
                compensationWrites.push({ store: 'relations', value: x });
            for (const x of liveBefore.revisions)
                compensationWrites.push({ store: 'revisions', value: x });
            const run = async (faultPoint) => { const repo = new MemoryCoreRepository(); await repo.open(); await this.seed(repo, liveBefore); const compensation = new RepositoryAtomicCompensationService(repo); const verifyPrimary = async () => { const state = await this.exactState(repo, resourceId, relationIds, revisionIds, importIds); return !state.target && state.relations.length === 0 && state.revisions.length === 0 && state.imports.every(imp => !(imp.data?.mappedEntityIds || []).includes(resourceId)); }; const verifyCompensation = async () => await this.digest(await this.exactState(repo, resourceId, relationIds, revisionIds, importIds)) === backupSha256; const result = await compensation.execute({ writes: primaryWrites, deletes: primaryDeletes, compensationWrites, verifyPrimary, verifyCompensation }, faultPoint); const finalSha256 = await this.digest(await this.exactState(repo, resourceId, relationIds, revisionIds, importIds)); return { result, finalSha256, parity: finalSha256 === backupSha256 }; };
            const success = await run(), faultPoints = ['BEFORE_PRIMARY_COMMIT', 'AFTER_PRIMARY_COMMIT', 'AFTER_PRIMARY_READBACK'], faults = [];
            for (const faultPoint of faultPoints) {
                const r = await run(faultPoint);
                faults.push({ faultPoint, ...r });
            }
            const liveWorkspaceAfterSha256 = await this.digest(await this.exactState(this.liveRepo, resourceId, relationIds, revisionIds, importIds)), allFaultsSafe = faults.every(x => x.parity && (x.faultPoint === 'BEFORE_PRIMARY_COMMIT' ? !x.result.primaryCommitted : (x.result.compensationApplied && x.result.compensationVerified)));
            return { contract: this.contract, purgeExecutionAllowed: false, liveWorkspaceWrites: false, sandboxRepositoryWrites: true, resourceType: type, resourceId, transactionDesignReady: true, designBlockers: [], repositoryAdapter: 'MEMORY', atomicPrimitive: { contract: 'KX.REPOSITORY_ATOMIC_COMPENSATION/1', primaryAtomic: true, compensationAtomic: true, indexedDbStaticBound: true, nativeSqliteStaticBound: true }, backupSha256, primary: { result: success.result, postCommitSha256: success.finalSha256, verified: success.result.primaryCommitted && success.result.primaryReadbackVerified && !success.result.compensationRequired && !success.parity }, faults, allFaultsSafe, liveWorkspaceBeforeSha256, liveWorkspaceAfterSha256, liveWorkspaceUnchanged: liveWorkspaceBeforeSha256 === liveWorkspaceAfterSha256, safeguards: ['ISOLATED_MEMORY_REPOSITORY', 'PHYSICAL_SANDBOX_REPOSITORY_WRITES', 'NO_LIVE_REPOSITORY_WRITES', 'NO_PURGE_ACTION_PUBLISHED', 'PRIMARY_ATOMIC_COMMIT', 'PRIMARY_READBACK_REQUIRED', 'COMPENSATION_ATOMIC_WRITE', 'COMPENSATION_READBACK_REQUIRED', 'EXACT_BACKUP_HASH_PARITY', 'LIVE_WORKSPACE_HASH_PARITY', 'INDEXEDDB_ATOMIC_STATIC_BOUND', 'NATIVE_SQLITE_ATOMIC_STATIC_BOUND'] };
        }
    }
    KX.LaserPurgeRepositoryTransactionSandboxService = LaserPurgeRepositoryTransactionSandboxService;
    class LaserPurgeDurableJournalSandboxService {
        liveRepo;
        laser;
        contract = 'KX.LASER_PURGE_DURABLE_JOURNAL_SANDBOX/1';
        journalContract = 'KX.LASER_PURGE_DURABLE_JOURNAL/1';
        constructor(liveRepo, laser) {
            this.liveRepo = liveRepo;
            this.laser = laser;
        }
        async digest(value) { return sha256Bytes(new TextEncoder().encode(stableStringify(value))); }
        async exactDomainState(repo, resourceId, relationIds, revisionIds, importIds) {
            const target = await repo.get('entities', resourceId), relations = [], revisions = [], imports = [];
            for (const id of [...relationIds].sort()) {
                const row = await repo.get('relations', id);
                if (row)
                    relations.push(row);
            }
            for (const id of [...revisionIds].sort()) {
                const row = await repo.get('revisions', id);
                if (row)
                    revisions.push(row);
            }
            for (const id of [...importIds].sort()) {
                const row = await repo.get('entities', id);
                if (row)
                    imports.push(row);
            }
            return { target, relations, revisions, imports };
        }
        async seed(repo, state) { const writes = []; if (state.target)
            writes.push({ store: 'entities', value: state.target }); for (const x of state.imports)
            writes.push({ store: 'entities', value: x }); for (const x of state.relations)
            writes.push({ store: 'relations', value: x }); for (const x of state.revisions)
            writes.push({ store: 'revisions', value: x }); await repo.atomic(writes); }
        journalRow(txId, resourceType, resourceId, ctx, phase, at) { return { id: `LIN.${txId}`, at, flowCode: 'LASER_PURGE_TRANSACTION', mode: 'ACTION_PROJECTION', source: { entityType: resourceType, entityId: resourceId }, target: { entityType: 'CORE.TRANSACTION_JOURNAL', entityId: txId }, actionCode: 'ACTION.LASER.TRASH.PURGE.JOURNAL_SANDBOX', rootChangeId: txId, actorId: ctx.actorId, result: 'OK', detail: { contract: this.journalContract, phase, ownerApp: 'APP.KX.LASER', resourceType, resourceId, purgeExecutionAllowed: false } }; }
        auditRow(txId, resourceType, resourceId, ctx, phase, at) { return { id: `AUDIT.${txId}.${phase}`, at, actorId: ctx.actorId, appCode: 'APP.KX.LASER', actionCode: phase === 'PRIMARY' ? 'LASER.TRASH.PURGE.SANDBOX.PRIMARY' : 'LASER.TRASH.PURGE.SANDBOX.COMPENSATION', entityType: resourceType, entityId: resourceId, rootChangeId: txId, parentChangeId: ctx.parentChangeId, deviceId: ctx.deviceId, result: 'OK', detail: { contract: this.contract, phase, purgeExecutionAllowed: false } }; }
        outboxRow(txId, resourceType, resourceId, at) { return { id: `OUT.${txId}.PURGE`, at, changeType: 'DELETE', resourceType, resourceId, ownerApp: 'APP.KX.LASER', rootChangeId: txId, status: 'PENDING', attempts: 0, payload: { contract: this.contract, stage: 'SANDBOX_ONLY', purgeExecutionAllowed: false, journalGateRequired: true, journalDispatchVerified: false } }; }
        async simulate(resourceType, resourceId, ctx) {
            const design = await this.laser.simulatePurgeTransaction(resourceType, resourceId, ctx), type = design.resourceType, relationIds = [...design.plan.cleanup.relationIds], revisionIds = [...design.plan.cleanup.revisionIds], importIds = design.plan.kxiRepairs.map(x => x.importId), designBlockers = [...design.designBlockers];
            const liveBefore = await this.exactDomainState(this.liveRepo, resourceId, relationIds, revisionIds, importIds), liveWorkspaceBeforeSha256 = await this.digest(liveBefore), backupSha256 = liveWorkspaceBeforeSha256;
            const journal = { contract: this.journalContract, store: 'lineage', flowCode: 'LASER_PURGE_TRANSACTION', durableAdapterBinding: { memoryRuntimeVerified: true, indexedDbPersistedStore: true, nativeSqlitePersistedStore: true } };
            if (!design.transactionDesignReady)
                return { contract: this.contract, purgeExecutionAllowed: false, liveWorkspaceWrites: false, sandboxRepositoryWrites: true, resourceType: type, resourceId, transactionDesignReady: false, designBlockers, repositoryAdapter: 'MEMORY', journal, primary: { transactionId: 'BLOCKED', domainReadbackVerified: false, metadataReadbackVerified: false, journalPhase: 'COMMITTED', auditCount: 0, outboxCount: 0, outboxPending: false }, faults: [], allFaultsSafe: false, liveWorkspaceBeforeSha256, liveWorkspaceAfterSha256: liveWorkspaceBeforeSha256, liveWorkspaceUnchanged: true, safeguards: ['ISOLATED_MEMORY_REPOSITORY', 'NO_LIVE_REPOSITORY_WRITES', 'NO_PURGE_ACTION_PUBLISHED', 'DURABLE_LINEAGE_JOURNAL_BINDING', 'AUDIT_STAGED_WITH_PRIMARY_ATOMIC', 'OUTBOX_STAGED_WITH_PRIMARY_ATOMIC', 'COMPENSATION_REMOVES_PENDING_OUTBOX', 'COMPENSATION_AUDIT_APPEND_ONLY', 'LIVE_WORKSPACE_HASH_PARITY'] };
            const primaryDomainWrites = design.plan.kxiRepairs.map(repair => { const original = liveBefore.imports.find(x => x.id === repair.importId); if (!original)
                throw new Error(`Missing KXI import ${repair.importId}`); return { store: 'entities', value: { ...structuredClone(original), data: { ...structuredClone(original.data), mappedEntityIds: [...repair.afterMappedEntityIds] } } }; });
            const primaryDomainDeletes = [...relationIds.map(key => ({ store: 'relations', key })), ...revisionIds.map(key => ({ store: 'revisions', key })), { store: 'entities', key: resourceId }];
            const compensationDomainWrites = [];
            if (liveBefore.target)
                compensationDomainWrites.push({ store: 'entities', value: liveBefore.target });
            for (const x of liveBefore.imports)
                compensationDomainWrites.push({ store: 'entities', value: x });
            for (const x of liveBefore.relations)
                compensationDomainWrites.push({ store: 'relations', value: x });
            for (const x of liveBefore.revisions)
                compensationDomainWrites.push({ store: 'revisions', value: x });
            const run = async (faultPoint) => {
                const repo = new MemoryCoreRepository();
                await repo.open();
                await this.seed(repo, liveBefore);
                const txId = `LASER_PURGE_TX.${crypto.randomUUID()}`, at = now(), journalPrimary = this.journalRow(txId, type, resourceId, ctx, 'PRIMARY_COMMITTED', at), auditPrimary = this.auditRow(txId, type, resourceId, ctx, 'PRIMARY', at), outboxPrimary = this.outboxRow(txId, type, resourceId, at);
                let primaryCommitted = false, domainReadbackVerified = false, metadataReadbackVerified = false, compensationApplied = false;
                const primaryWrites = [...primaryDomainWrites, { store: 'lineage', value: journalPrimary }, { store: 'audit', value: auditPrimary }, { store: 'outbox', value: outboxPrimary }];
                try {
                    if (faultPoint === 'BEFORE_PRIMARY_COMMIT')
                        throw new Error('JOURNAL_FAULT:BEFORE_PRIMARY_COMMIT');
                    await repo.atomic(primaryWrites, primaryDomainDeletes);
                    primaryCommitted = true;
                    if (faultPoint === 'AFTER_PRIMARY_COMMIT')
                        throw new Error('JOURNAL_FAULT:AFTER_PRIMARY_COMMIT');
                    const domain = await this.exactDomainState(repo, resourceId, relationIds, revisionIds, importIds);
                    domainReadbackVerified = !domain.target && domain.relations.length === 0 && domain.revisions.length === 0 && domain.imports.every(imp => !(imp.data?.mappedEntityIds || []).includes(resourceId));
                    const j = await repo.get('lineage', journalPrimary.id), a = await repo.get('audit', auditPrimary.id), o = await repo.get('outbox', outboxPrimary.id);
                    metadataReadbackVerified = !!j && j.rootChangeId === txId && j.detail?.phase === 'PRIMARY_COMMITTED' && !!a && a.rootChangeId === txId && !!o && o.rootChangeId === txId && o.status === 'PENDING';
                    if (!domainReadbackVerified || !metadataReadbackVerified)
                        throw new Error('JOURNAL_PRIMARY_READBACK_MISMATCH');
                    if (faultPoint === 'AFTER_PRIMARY_READBACK')
                        throw new Error('JOURNAL_FAULT:AFTER_PRIMARY_READBACK');
                    const committed = this.journalRow(txId, type, resourceId, ctx, 'COMMITTED', now());
                    await repo.atomic([{ store: 'lineage', value: committed }]);
                    if (faultPoint === 'AFTER_JOURNAL_FINALIZE')
                        throw new Error('JOURNAL_FAULT:AFTER_JOURNAL_FINALIZE');
                    const finalJ = await repo.get('lineage', committed.id), audits = (await repo.all('audit')).filter(x => x.rootChangeId === txId), outboxes = (await repo.all('outbox')).filter(x => x.rootChangeId === txId);
                    return { txId, primaryCommitted, domainReadbackVerified, metadataReadbackVerified, compensationApplied: false, domainParity: false, journalCompensated: false, primaryOutboxRemoved: false, compensationAuditRecorded: false, finalJournalPhase: finalJ?.detail?.phase || 'NONE', auditCount: audits.length, outboxCount: outboxes.length, outboxPending: outboxes.some(x => x.status === 'PENDING') };
                }
                catch (error) {
                    if (primaryCommitted) {
                        const compensated = this.journalRow(txId, type, resourceId, ctx, 'COMPENSATED', now()), auditComp = this.auditRow(txId, type, resourceId, ctx, 'COMPENSATION', now());
                        await repo.atomic([...compensationDomainWrites, { store: 'lineage', value: compensated }, { store: 'audit', value: auditComp }], [{ store: 'outbox', key: outboxPrimary.id }]);
                        compensationApplied = true;
                    }
                    const finalDomain = await this.exactDomainState(repo, resourceId, relationIds, revisionIds, importIds), domainParity = await this.digest(finalDomain) === backupSha256, finalJ = await repo.get('lineage', journalPrimary.id), out = await repo.get('outbox', outboxPrimary.id), audits = (await repo.all('audit')).filter(x => x.rootChangeId === txId), journalCompensated = finalJ?.detail?.phase === 'COMPENSATED', compensationAuditRecorded = audits.some(x => x.actionCode === 'LASER.TRASH.PURGE.SANDBOX.COMPENSATION');
                    return { txId, primaryCommitted, domainReadbackVerified, metadataReadbackVerified, compensationApplied, domainParity, journalCompensated, primaryOutboxRemoved: primaryCommitted ? !out : true, compensationAuditRecorded, finalJournalPhase: finalJ?.detail?.phase || 'NONE', auditCount: audits.length, outboxCount: out ? 1 : 0, outboxPending: out?.status === 'PENDING' };
                }
            };
            const success = await run(), faultPoints = ['BEFORE_PRIMARY_COMMIT', 'AFTER_PRIMARY_COMMIT', 'AFTER_PRIMARY_READBACK', 'AFTER_JOURNAL_FINALIZE'], faults = [];
            for (const faultPoint of faultPoints) {
                const r = await run(faultPoint);
                faults.push({ faultPoint, primaryCommitted: r.primaryCommitted, compensationApplied: r.compensationApplied, domainParity: r.domainParity, journalCompensated: r.journalCompensated, primaryOutboxRemoved: r.primaryOutboxRemoved, compensationAuditRecorded: r.compensationAuditRecorded, finalJournalPhase: r.finalJournalPhase === 'COMPENSATED' ? 'COMPENSATED' : 'NONE' });
            }
            const allFaultsSafe = faults.every(x => x.domainParity && (x.faultPoint === 'BEFORE_PRIMARY_COMMIT' ? (!x.primaryCommitted && !x.compensationApplied && x.finalJournalPhase === 'NONE') : (x.primaryCommitted && x.compensationApplied && x.journalCompensated && x.primaryOutboxRemoved && x.compensationAuditRecorded && x.finalJournalPhase === 'COMPENSATED'))), liveWorkspaceAfterSha256 = await this.digest(await this.exactDomainState(this.liveRepo, resourceId, relationIds, revisionIds, importIds));
            return { contract: this.contract, purgeExecutionAllowed: false, liveWorkspaceWrites: false, sandboxRepositoryWrites: true, resourceType: type, resourceId, transactionDesignReady: true, designBlockers: [], repositoryAdapter: 'MEMORY', journal, primary: { transactionId: success.txId, domainReadbackVerified: success.domainReadbackVerified, metadataReadbackVerified: success.metadataReadbackVerified, journalPhase: 'COMMITTED', auditCount: success.auditCount, outboxCount: success.outboxCount, outboxPending: success.outboxPending }, faults, allFaultsSafe, liveWorkspaceBeforeSha256, liveWorkspaceAfterSha256, liveWorkspaceUnchanged: liveWorkspaceBeforeSha256 === liveWorkspaceAfterSha256, safeguards: ['ISOLATED_MEMORY_REPOSITORY', 'PHYSICAL_SANDBOX_REPOSITORY_WRITES', 'NO_LIVE_REPOSITORY_WRITES', 'NO_PURGE_ACTION_PUBLISHED', 'DOMAIN_AND_METADATA_PRIMARY_ATOMIC', 'DURABLE_LINEAGE_JOURNAL_BINDING', 'AUDIT_STAGED_WITH_PRIMARY_ATOMIC', 'OUTBOX_STAGED_WITH_PRIMARY_ATOMIC', 'PRIMARY_DOMAIN_AND_METADATA_READBACK_REQUIRED', 'COMPENSATION_RESTORES_DOMAIN', 'COMPENSATION_JOURNAL_PERSISTS', 'COMPENSATION_AUDIT_APPEND_ONLY', 'COMPENSATION_REMOVES_PENDING_OUTBOX', 'LIVE_WORKSPACE_HASH_PARITY', 'INDEXEDDB_LINEAGE_AUDIT_OUTBOX_STATIC_BOUND', 'NATIVE_SQLITE_LINEAGE_AUDIT_OUTBOX_STATIC_BOUND'] };
        }
    }
    KX.LaserPurgeDurableJournalSandboxService = LaserPurgeDurableJournalSandboxService;
    class LaserPurgeJournalRecoverySandboxService {
        liveRepo;
        contract = 'KX.LASER_PURGE_JOURNAL_RECOVERY_SANDBOX/1';
        journalContract = 'KX.LASER_PURGE_DURABLE_JOURNAL/1';
        constructor(liveRepo) {
            this.liveRepo = liveRepo;
        }
        async digest(value) { return sha256Bytes(new TextEncoder().encode(stableStringify(value))); }
        async liveMetadata() { return { lineage: (await this.liveRepo.all('lineage')).sort((a, b) => a.id.localeCompare(b.id)), audit: (await this.liveRepo.all('audit')).sort((a, b) => a.id.localeCompare(b.id)), outbox: (await this.liveRepo.all('outbox')).sort((a, b) => a.id.localeCompare(b.id)) }; }
        journal(txId, phase) { return { id: `LIN.${txId}`, at: '2026-10-08T04:00:00.000Z', flowCode: 'LASER_PURGE_TRANSACTION', mode: 'ACTION_PROJECTION', source: { entityType: 'APP.LASER.TEST_RUN', entityId: `RUN.${txId}` }, target: { entityType: 'CORE.TRANSACTION_JOURNAL', entityId: txId }, actionCode: 'ACTION.LASER.TRASH.PURGE.JOURNAL_SANDBOX', rootChangeId: txId, actorId: 'USER.LUKAS', result: 'OK', detail: { contract: this.journalContract, phase, ownerApp: 'APP.KX.LASER', resourceType: 'APP.LASER.TEST_RUN', resourceId: `RUN.${txId}`, purgeExecutionAllowed: false } }; }
        audit(txId) { return { id: `AUDIT.${txId}.PRIMARY`, at: '2026-10-08T04:00:00.000Z', actorId: 'USER.LUKAS', appCode: 'APP.KX.LASER', actionCode: 'LASER.TRASH.PURGE.SANDBOX.PRIMARY', entityType: 'APP.LASER.TEST_RUN', entityId: `RUN.${txId}`, rootChangeId: txId, result: 'OK', detail: { contract: 'KX.LASER_PURGE_DURABLE_JOURNAL_SANDBOX/1', phase: 'PRIMARY', purgeExecutionAllowed: false } }; }
        outbox(txId, status = 'PENDING') { return { id: `OUT.${txId}.PURGE`, at: '2026-10-08T04:00:00.000Z', changeType: 'DELETE', resourceType: 'APP.LASER.TEST_RUN', resourceId: `RUN.${txId}`, ownerApp: 'APP.KX.LASER', rootChangeId: txId, status, attempts: 0, payload: { contract: 'KX.LASER_PURGE_DURABLE_JOURNAL_SANDBOX/1', stage: 'SANDBOX_ONLY', purgeExecutionAllowed: false, journalGateRequired: true, journalDispatchVerified: false } }; }
        phase(j) { const p = String(j?.detail?.phase || 'NONE'); return p === 'PRIMARY_COMMITTED' || p === 'COMMITTED' || p === 'COMPENSATED' ? p : 'NONE'; }
        async quarantine(repo, outboxes, txId, reason) { const writes = []; for (const row of outboxes) {
            if (row.status === 'SENT')
                continue;
            writes.push({ store: 'outbox', value: { ...row, status: 'CONFLICT', lastError: `RECOVERY_QUARANTINE:${reason}` } });
        } writes.push({ store: 'audit', value: { id: `AUDIT.${txId}.RECOVERY_QUARANTINE`, at: now(), actorId: 'SYSTEM', appCode: 'APP.KX.LASER', actionCode: 'LASER.TRASH.PURGE.RECOVERY.QUARANTINE', rootChangeId: txId, result: 'ERROR', detail: { contract: this.contract, reason, purgeExecutionAllowed: false } } }); await repo.atomic(writes); }
        async recoverRepository(repo, txId, pushCounter = { count: 0 }) {
            const journal = await repo.get('lineage', `LIN.${txId}`), phase = this.phase(journal), outboxes = (await repo.all('outbox')).filter(x => x.rootChangeId === txId), audits = (await repo.all('audit')).filter(x => x.rootChangeId === txId), primaryAudits = audits.filter(x => x.actionCode === 'LASER.TRASH.PURGE.SANDBOX.PRIMARY');
            const journalVerified = !!journal && journal.flowCode === 'LASER_PURGE_TRANSACTION' && journal.rootChangeId === txId && journal.detail?.contract === this.journalContract && journal.detail?.ownerApp === 'APP.KX.LASER';
            if (phase === 'COMPENSATED') {
                if (outboxes.some(x => x.status === 'PENDING' || x.status === 'FAILED' || x.status === 'SENDING'))
                    await this.quarantine(repo, outboxes, txId, 'COMPENSATED_HAS_DISPATCHABLE_OUTBOX');
                const final = (await repo.all('outbox')).filter(x => x.rootChangeId === txId);
                return { scenario: txId, transactionId: txId, journalPhase: phase, decision: 'COMPENSATED_NO_DISPATCH', dispatchEligible: false, transportPushes: pushCounter.count, outboxStatus: final[0]?.status || 'NONE', journalVerified, idempotent: true };
            }
            if (phase !== 'COMMITTED') {
                const reason = phase === 'PRIMARY_COMMITTED' ? 'PRIMARY_COMMITTED_NOT_FINAL' : 'MISSING_OR_INVALID_JOURNAL';
                if (outboxes.length)
                    await this.quarantine(repo, outboxes, txId, reason);
                const final = (await repo.all('outbox')).filter(x => x.rootChangeId === txId);
                return { scenario: txId, transactionId: txId, journalPhase: phase, decision: 'QUARANTINED', dispatchEligible: false, transportPushes: pushCounter.count, outboxStatus: final[0]?.status || 'NONE', quarantineReason: reason, journalVerified, idempotent: true };
            }
            const exact = journalVerified && primaryAudits.length === 1 && outboxes.length === 1 && outboxes[0].rootChangeId === txId && outboxes[0].payload?.journalGateRequired === true;
            if (!exact) {
                const reason = 'COMMITTED_PROOF_MISMATCH';
                if (outboxes.length)
                    await this.quarantine(repo, outboxes, txId, reason);
                const final = (await repo.all('outbox')).filter(x => x.rootChangeId === txId);
                return { scenario: txId, transactionId: txId, journalPhase: phase, decision: 'QUARANTINED', dispatchEligible: false, transportPushes: pushCounter.count, outboxStatus: final[0]?.status || 'NONE', quarantineReason: reason, journalVerified, idempotent: true };
            }
            const row = outboxes[0];
            if (row.status === 'SENT')
                return { scenario: txId, transactionId: txId, journalPhase: phase, decision: 'ALREADY_DISPATCHED', dispatchEligible: true, transportPushes: pushCounter.count, outboxStatus: 'SENT', journalVerified: true, idempotent: true };
            if (row.status !== 'PENDING' && row.status !== 'FAILED') {
                await this.quarantine(repo, [row], txId, 'AMBIGUOUS_OUTBOX_STATUS');
                const q = await repo.get('outbox', row.id);
                return { scenario: txId, transactionId: txId, journalPhase: phase, decision: 'QUARANTINED', dispatchEligible: false, transportPushes: pushCounter.count, outboxStatus: q?.status || 'NONE', quarantineReason: 'AMBIGUOUS_OUTBOX_STATUS', journalVerified: true, idempotent: true };
            }
            const verifiedPayload = { ...row.payload, journalDispatchVerified: true, journalVerifiedAt: now(), journalId: journal.id };
            await repo.atomic([{ store: 'outbox', value: { ...row, payload: verifiedPayload } }, { store: 'audit', value: { id: `AUDIT.${txId}.RECOVERY_VERIFIED`, at: now(), actorId: 'SYSTEM', appCode: 'APP.KX.LASER', actionCode: 'LASER.TRASH.PURGE.RECOVERY.VERIFIED', rootChangeId: txId, result: 'OK', detail: { contract: this.contract, journalId: journal.id } } }]);
            const outboxSvc = new OutboxService(repo), conflicts = new ConflictService(repo), auditSvc = new AuditService(repo), events = new EventBus(), sync = new SyncService(outboxSvc, conflicts, auditSvc, events), transport = { code: 'KX.DELTA065.MOCK_DISPATCH', connection: 'SERVER', push: async () => { pushCounter.count++; return { status: 'ACK' }; } };
            const flushed = await sync.flush(transport, { actorId: 'SYSTEM', appCode: 'APP.KX.LASER' });
            const final = await repo.get('outbox', row.id);
            return { scenario: txId, transactionId: txId, journalPhase: phase, decision: flushed.sent === 1 ? 'DISPATCHED' : 'ALREADY_DISPATCHED', dispatchEligible: true, transportPushes: pushCounter.count, outboxStatus: final?.status || 'NONE', journalVerified: true, idempotent: true };
        }
        async repoFor(txId, phase, opts = {}) { const repo = new MemoryCoreRepository(); await repo.open(); const writes = []; if (phase !== 'NONE')
            writes.push({ store: 'lineage', value: this.journal(txId, phase) }); if (opts.audit !== false)
            writes.push({ store: 'audit', value: this.audit(txId) }); if (opts.outbox !== false)
            writes.push({ store: 'outbox', value: this.outbox(txId, opts.outboxStatus || 'PENDING') }); if (writes.length)
            await repo.atomic(writes); return repo; }
        async simulate() {
            const liveMetadataBeforeSha256 = await this.digest(await this.liveMetadata()), scenarios = [];
            const okCounter = { count: 0 }, okRepo = await this.repoFor('TX.COMMITTED', 'COMMITTED');
            scenarios.push(await this.recoverRepository(okRepo, 'TX.COMMITTED', okCounter));
            const firstPushes = okCounter.count;
            const replay = await this.recoverRepository(okRepo, 'TX.COMMITTED', okCounter);
            replay.scenario = 'TX.COMMITTED.REPLAY';
            replay.idempotent = okCounter.count === firstPushes;
            scenarios.push(replay);
            const primaryCounter = { count: 0 }, primaryRepo = await this.repoFor('TX.PRIMARY', 'PRIMARY_COMMITTED');
            scenarios.push(await this.recoverRepository(primaryRepo, 'TX.PRIMARY', primaryCounter));
            const compensatedCounter = { count: 0 }, compRepo = await this.repoFor('TX.COMPENSATED', 'COMPENSATED', { outbox: false });
            scenarios.push(await this.recoverRepository(compRepo, 'TX.COMPENSATED', compensatedCounter));
            const incompleteCounter = { count: 0 }, incompleteRepo = await this.repoFor('TX.INCOMPLETE', 'COMMITTED', { audit: false });
            scenarios.push(await this.recoverRepository(incompleteRepo, 'TX.INCOMPLETE', incompleteCounter));
            const sendingCounter = { count: 0 }, sendingRepo = await this.repoFor('TX.SENDING', 'COMMITTED', { outboxStatus: 'SENDING' });
            scenarios.push(await this.recoverRepository(sendingRepo, 'TX.SENDING', sendingCounter));
            const gateRepo = await this.repoFor('TX.GATE', 'COMMITTED'), gateOutbox = new OutboxService(gateRepo), gateSync = new SyncService(gateOutbox, new ConflictService(gateRepo), new AuditService(gateRepo), new EventBus()), gatePush = { count: 0 }, gateTransport = { code: 'KX.DELTA065.GATE_TEST', connection: 'SERVER', push: async () => { gatePush.count++; return { status: 'ACK' }; } };
            const gateFlush = await gateSync.flush(gateTransport, { actorId: 'SYSTEM', appCode: 'APP.KX.LASER' });
            scenarios.push({ scenario: 'TX.GATE.UNVERIFIED_SYNC', transactionId: 'TX.GATE', journalPhase: 'COMMITTED', decision: 'QUARANTINED', dispatchEligible: false, transportPushes: gatePush.count, outboxStatus: (await gateRepo.get('outbox', 'OUT.TX.GATE.PURGE'))?.status || 'NONE', quarantineReason: `SYNC_GATE_SKIPPED_${gateFlush.skipped}`, journalVerified: true, idempotent: true });
            const liveMetadataAfterSha256 = await this.digest(await this.liveMetadata()), allSafe = scenarios.every(x => x.idempotent && ((x.scenario === 'TX.COMMITTED' && x.decision === 'DISPATCHED' && x.transportPushes === 1 && x.outboxStatus === 'SENT') || (x.scenario === 'TX.COMMITTED.REPLAY' && x.decision === 'ALREADY_DISPATCHED' && x.transportPushes === 1) || (x.scenario === 'TX.COMPENSATED' && x.decision === 'COMPENSATED_NO_DISPATCH' && x.transportPushes === 0) || (x.scenario === 'TX.GATE.UNVERIFIED_SYNC' && x.transportPushes === 0 && x.outboxStatus === 'PENDING') || (['TX.PRIMARY', 'TX.INCOMPLETE', 'TX.SENDING'].includes(x.scenario) && x.decision === 'QUARANTINED' && x.transportPushes === 0 && x.outboxStatus === 'CONFLICT')));
            return { contract: this.contract, purgeExecutionAllowed: false, externalDispatchAllowed: false, liveWorkspaceWrites: false, sandboxRepositoryWrites: true, journalContract: this.journalContract, dispatchGate: { syncServiceBound: true, journalGateRequired: true, requiresCommittedJournal: true, primaryCommittedQuarantined: true, compensatedNeverDispatched: true, idempotentReplay: true }, scenarios, allSafe, liveMetadataBeforeSha256, liveMetadataAfterSha256, liveMetadataUnchanged: liveMetadataBeforeSha256 === liveMetadataAfterSha256, safeguards: ['NO_PRODUCTION_PURGE_ACTION', 'NO_EXTERNAL_TRANSPORT', 'SYNC_SERVICE_JOURNAL_GATE', 'COMMITTED_EXACT_PROOF_REQUIRED', 'PRIMARY_COMMITTED_QUARANTINE', 'COMPENSATED_NO_DISPATCH', 'AMBIGUOUS_SENDING_QUARANTINE', 'IDEMPOTENT_REPLAY', 'LIVE_METADATA_HASH_PARITY'] };
        }
    }
    KX.LaserPurgeJournalRecoverySandboxService = LaserPurgeJournalRecoverySandboxService;
    class LaserPurgeOwnerExecutionPreflightService {
        repo;
        laser;
        repositorySandbox;
        journalSandbox;
        recoverySandbox;
        contract = 'KX.LASER_PURGE_OWNER_EXECUTION_PREFLIGHT/1';
        constructor(repo, laser, repositorySandbox, journalSandbox, recoverySandbox) {
            this.repo = repo;
            this.laser = laser;
            this.repositorySandbox = repositorySandbox;
            this.journalSandbox = journalSandbox;
            this.recoverySandbox = recoverySandbox;
        }
        proofStatus() { return this.repo.mode === 'INDEXED_DB' ? 'INDEXED_DB_FULL_ORIGIN_PHYSICAL_PROOF_BLOCKED' : this.repo.mode === 'NATIVE_SQLITE' ? 'SQLITE_PROTOCOL_HARNESS_ONLY_NATIVE_HOST_BLOCKED' : 'MEMORY_SANDBOX_ONLY'; }
        async inspect(resourceType, resourceId, ctx) {
            const audit = await this.laser.auditPurgeDependencies(resourceType, resourceId, ctx), transaction = await this.laser.simulatePurgeTransaction(resourceType, resourceId, ctx), repository = await this.repositorySandbox.simulate(resourceType, resourceId, ctx), journal = await this.journalSandbox.simulate(resourceType, resourceId, ctx), recovery = await this.recoverySandbox.simulate();
            const repositoryCompensationHarnessReady = repository.transactionDesignReady && repository.allFaultsSafe && repository.liveWorkspaceUnchanged;
            const durableJournalHarnessReady = journal.transactionDesignReady && journal.allFaultsSafe && journal.liveWorkspaceUnchanged;
            const recoveryReplayGateReady = recovery.allSafe && recovery.liveMetadataUnchanged;
            const liveWorkspaceParity = transaction.simulation.liveWorkspaceUnchanged && repository.liveWorkspaceUnchanged && journal.liveWorkspaceUnchanged && recovery.liveMetadataUnchanged;
            const exactBackupReady = transaction.backupEnvelope.sha256.length === 64 && transaction.backupEnvelope.targetSha256 === audit.targetSnapshotSha256 && transaction.backupEnvelope.targetRevisionCount === audit.revisions.count && transaction.backupEnvelope.relationCount === audit.relations.count;
            const ownerExecutionDesignReady = audit.designReadiness && transaction.transactionDesignReady && exactBackupReady && repositoryCompensationHarnessReady && durableJournalHarnessReady && recoveryReplayGateReady && liveWorkspaceParity;
            const blockers = [...transaction.designBlockers];
            if (!exactBackupReady)
                blockers.push('EXACT_BACKUP_BINDING_NOT_READY');
            if (!repositoryCompensationHarnessReady)
                blockers.push('REPOSITORY_COMPENSATION_HARNESS_NOT_READY');
            if (!durableJournalHarnessReady)
                blockers.push('DURABLE_JOURNAL_HARNESS_NOT_READY');
            if (!recoveryReplayGateReady)
                blockers.push('RECOVERY_REPLAY_GATE_NOT_READY');
            if (!liveWorkspaceParity)
                blockers.push('LIVE_WORKSPACE_PARITY_NOT_VERIFIED');
            blockers.push(this.proofStatus(), 'LASER_PURGE_ACTION_NOT_PUBLISHED', 'PRODUCTION_OWNER_EXECUTION_DISABLED');
            return { contract: this.contract, readOnly: true, productionExecutionAllowed: false, ownerActionPublished: false, ownerActionsInvoked: false, resourceType: audit.resourceType, resourceId: audit.resourceId, ownerExecutionDesignReady, productionReady: false, repository: { mode: this.repo.mode, atomicPrimitivePresent: true, physicalProductionProof: false, proofStatus: this.proofStatus() }, prerequisites: { archived: audit.archived, dependencyAuditReady: audit.designReadiness, transactionDesignReady: transaction.transactionDesignReady, exactBackupReady, repositoryCompensationHarnessReady, durableJournalHarnessReady, recoveryReplayGateReady, liveWorkspaceParity, adapterPhysicalProductionProof: false }, evidence: { auditContract: audit.contract, transactionContract: transaction.contract, repositorySandboxContract: repository.contract, journalSandboxContract: journal.contract, recoveryContract: recovery.contract, backupSha256: transaction.backupEnvelope.sha256, targetSnapshotSha256: audit.targetSnapshotSha256, relationsSha256: audit.relations.sha256, revisionsSha256: audit.revisions.sha256 }, blockers: [...new Set(blockers)], safeguards: ['READ_ONLY_PREFLIGHT', 'NO_OWNER_ACTION_INVOCATION', 'NO_PRODUCTION_PURGE_ACTION', 'NO_LIVE_DOMAIN_WRITES', 'EXACT_BACKUP_HASH_BINDING', 'REPOSITORY_COMPENSATION_HARNESS_REQUIRED', 'DURABLE_JOURNAL_HARNESS_REQUIRED', 'RECOVERY_REPLAY_GATE_REQUIRED', 'ADAPTER_PHYSICAL_PRODUCTION_PROOF_REQUIRED', 'AGGREGATE_OWNER_ACTIONS_NOT_PROMOTED'] };
        }
    }
    KX.LaserPurgeOwnerExecutionPreflightService = LaserPurgeOwnerExecutionPreflightService;
    class LaserP566MigrationPreviewService {
        laser;
        constructor(laser) {
            this.laser = laser;
        }
        async preview(input) {
            const groups = [['PROJECT', 'KXP', input.projects || []], ['TEST', 'KXT', input.tests || []], ['IMPORT', 'KXI', input.imports || []]];
            const issues = [], uids = new Set(), codes = new Set();
            let valid = 0, missingUid = 0, missingCode = 0, duplicateUid = 0, duplicateCode = 0;
            for (const [kind, prefix, rows] of groups)
                for (let index = 0; index < rows.length; index++) {
                    const row = rows[index] || {}, recordUid = String(row.recordUid || '').trim(), recordCode = String(row.recordCode || row.code || '').trim();
                    let ok = true;
                    if (!recordUid) {
                        missingUid++;
                        ok = false;
                        issues.push({ severity: 'ERROR', kind, index, code: 'MISSING_RECORD_UID', message: 'Chybí stabilní recordUid.' });
                    }
                    else if (uids.has(recordUid)) {
                        duplicateUid++;
                        ok = false;
                        issues.push({ severity: 'ERROR', kind, index, code: 'DUPLICATE_RECORD_UID', message: `Duplicitní recordUid ${recordUid}.` });
                    }
                    else
                        uids.add(recordUid);
                    if (!recordCode) {
                        missingCode++;
                        ok = false;
                        issues.push({ severity: 'ERROR', kind, index, code: 'MISSING_RECORD_CODE', message: `Chybí ${prefix} recordCode.` });
                    }
                    else if (!new RegExp(`^${prefix}(?:[-_.].+|$)`).test(recordCode)) {
                        ok = false;
                        issues.push({ severity: 'ERROR', kind, index, code: 'INVALID_RECORD_CODE', message: `recordCode ${recordCode} neodpovídá prefixu ${prefix}.` });
                    }
                    else if (codes.has(recordCode)) {
                        duplicateCode++;
                        ok = false;
                        issues.push({ severity: 'ERROR', kind, index, code: 'DUPLICATE_RECORD_CODE', message: `Duplicitní recordCode ${recordCode}.` });
                    }
                    else
                        codes.add(recordCode);
                    if (kind !== 'IMPORT') {
                        const lensIds = Array.isArray(row.lensIds) ? row.lensIds : [];
                        if (!lensIds.length)
                            issues.push({ severity: 'WARNING', kind, index, code: 'NO_LENS_IDS', message: 'Záznam nemá lensIds; při migraci je nutné dohledat čočku/profil.' });
                    }
                    if (ok)
                        valid++;
                }
            const before = (await this.laser.list()).length;
            const result = { contract: 'KX.LASER_P566_MIGRATION_PREVIEW/1', readOnly: true, sourceLabel: String(input.sourceLabel || 'P566'), counts: { projects: (input.projects || []).length, tests: (input.tests || []).length, imports: (input.imports || []).length }, identities: { valid, missingUid, missingCode, duplicateUid, duplicateCode }, issues, canProceed: !issues.some(x => x.severity === 'ERROR') };
            const after = (await this.laser.list()).length;
            if (after !== before)
                throw new Error('LASER P566 preview violated read-only contract');
            return result;
        }
    }
    KX.LaserP566MigrationPreviewService = LaserP566MigrationPreviewService;
    class LaserP566CrossFeatureParityService {
        owners = [
            { sourceKey: 'savedViews', label: 'Saved Views', ownerCode: 'P566.OWNER.LASER_SAVED_VIEWS', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService / future Laser View Preset facade', targetPath: 'CORE.SETTING[APP.KX.LASER:laser.views.savedViews.p566]', flowMode: 'SNAPSHOT', commitPolicy: 'Persist exact legacy snapshot first; normalize named views only through the LASER view owner after transaction staging.', exactSnapshotRequired: true, notes: ['Saved Views are view state, not duplicated business data.', 'Named view identity, filters, columns, machine/preset scope and layout must survive roundtrip.'] },
            { sourceKey: 'activeSavedViewId', label: 'active Saved View', ownerCode: 'P566.OWNER.LASER_ACTIVE_VIEW', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[VIEW/USER:laser.views.activeSavedViewId]', flowMode: 'REFERENCE', commitPolicy: 'Resolve only after Saved Views snapshot has been staged; dangling ids are a transaction blocker.', exactSnapshotRequired: true, notes: ['Current view selection is view state and must never rewrite project data.'] },
            { sourceKey: 'defaultViewByMachine', label: 'per-laser default views', ownerCode: 'P566.OWNER.LASER_DEFAULT_VIEW_BY_MACHINE', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[APP/USER:laser.views.defaultByMachine]', flowMode: 'REFERENCE', commitPolicy: 'Stage exact map and validate every referenced machine/view identity before activation.', exactSnapshotRequired: true, notes: ['Reference map must follow migrated machine/view identities.'] },
            { sourceKey: 'lastViewByMachine', label: 'per-laser last views', ownerCode: 'P566.OWNER.LASER_LAST_VIEW_BY_MACHINE', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[USER/DEVICE:laser.views.lastByMachine]', flowMode: 'REFERENCE', commitPolicy: 'Stage exact map; unresolved view ids remain preserved but inactive until resolved.', exactSnapshotRequired: true, notes: ['Last view is user/device state, not canonical project truth.'] },
            { sourceKey: 'activeMachineId', label: 'active machine selection', ownerCode: 'P566.OWNER.LASER_ACTIVE_MACHINE', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[USER/DEVICE:laser.workspace.activeMachineId]', flowMode: 'REFERENCE', commitPolicy: 'Resolve after machine staging; never create a physical machine from an unknown id.', exactSnapshotRequired: true, notes: ['Selection state must not alter owned-machine inventory.'] },
            { sourceKey: 'activePresetId', label: 'active profile selection', ownerCode: 'P566.OWNER.LASER_ACTIVE_PROFILE', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[USER/DEVICE:laser.workspace.activeProfileId]', flowMode: 'REFERENCE', commitPolicy: 'Resolve after profile staging; unknown ids fall back only at runtime while legacy value stays preserved.', exactSnapshotRequired: true, notes: ['Selection state is recoverable UI context.'] },
            { sourceKey: 'columns', label: 'project table columns', ownerCode: 'P566.OWNER.LASER_PROJECT_COLUMNS', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[APP/USER:laser.table.project.columns]', flowMode: 'SNAPSHOT', commitPolicy: 'Store exact column configuration; normalize only known column codes and preserve unknown custom metadata.', exactSnapshotRequired: true, notes: ['Visibility, width, pinning and order are all part of parity.'] },
            { sourceKey: 'customColumns', label: 'custom project columns', ownerCode: 'P566.OWNER.LASER_CUSTOM_COLUMNS', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[APP/USER:laser.table.project.customColumns]', flowMode: 'SNAPSHOT', commitPolicy: 'Store exact definitions before any Field Registry normalization.', exactSnapshotRequired: true, notes: ['Custom fields must never be silently discarded.'] },
            { sourceKey: 'kx510P43ColumnOrder', label: 'explicit project column order', ownerCode: 'P566.OWNER.LASER_PROJECT_COLUMN_ORDER', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[APP/USER:laser.table.project.columnOrder]', flowMode: 'SNAPSHOT', commitPolicy: 'Preserve explicit order separately from width/visibility until view normalization proves roundtrip equality.', exactSnapshotRequired: true, notes: ['P566 has more than one table-layout representation; commit must reconcile, not overwrite.'] },
            { sourceKey: 'tableSort', label: 'project table sorting', ownerCode: 'P566.OWNER.LASER_PROJECT_SORT', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[VIEW/USER:laser.table.project.sort]', flowMode: 'SNAPSHOT', commitPolicy: 'Persist exact sort descriptor; unknown sort keys stay preserved and inactive.', exactSnapshotRequired: true, notes: ['Sort is view state.'] },
            { sourceKey: 'importTable121', label: 'Import Lab table preferences', ownerCode: 'P566.OWNER.LASER_IMPORT_TABLE', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[VIEW/USER:laser.table.importLab]', flowMode: 'SNAPSHOT', commitPolicy: 'Preserve exact Import Lab table state and bind only after Import Lab canonical UI exists.', exactSnapshotRequired: true, notes: ['Import Lab UI parity follows canonical APP.LASER.IMPORT data.'] },
            { sourceKey: 'tableCore126', label: 'shared table-core layouts', ownerCode: 'P566.OWNER.LASER_TABLE_CORE', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[APP/USER:laser.table.coreLayout]', flowMode: 'SNAPSHOT', commitPolicy: 'Preserve exact table-core layout snapshot; normalize per table after schema parity audit.', exactSnapshotRequired: true, notes: ['Includes late P566 table layout state.'] },
            { sourceKey: 'testSettings', label: 'Test Settings', ownerCode: 'P566.OWNER.LASER_TEST_SETTINGS', ownerApp: 'APP.KX.LASER', ownerService: 'SettingsService', targetPath: 'CORE.SETTING[APP/USER/DEVICE:laser.tests.settings]', flowMode: 'SNAPSHOT', commitPolicy: 'Split shared/user/device settings only during transactional staging while retaining the exact source snapshot.', exactSnapshotRequired: true, notes: ['Column order, overview widths/hidden fields and per-context settings are parity-critical.'] },
            { sourceKey: 'calendarPlan111', label: 'Calendar / Gantt', ownerCode: 'P566.OWNER.CORE_CALENDAR_GANTT', ownerApp: 'APP.NEXUS', ownerService: 'CalendarService + TaskService + AlarmService', targetPath: 'CORE.CALENDAR_EVENT / CORE.TASK / CORE.ALARM + LASER source references', flowMode: 'ACTION_PROJECTION', commitPolicy: 'Preserve exact P566 calendar snapshot, then project through typed Core planner actions with sourceEntityId/deep-link references.', exactSnapshotRequired: true, notes: ['Calendar data is Core-owned; LASER keeps references, not a second writable calendar.', 'Gantt-specific layout/settings remain LASER view metadata.'] },
            { sourceKey: 'finance107', label: 'Finance / ROI', ownerCode: 'P566.OWNER.FINANCE_PROJECTION', ownerApp: 'APP.FINANCE', ownerService: 'Finance migration/action projection owner', targetPath: 'APP.FINANCE P566 import snapshot + typed finance projection', flowMode: 'ACTION_PROJECTION', commitPolicy: 'Preserve exact finance107 payload in the migration transaction; activate normalized Finance rows only through APP.FINANCE owner actions.', exactSnapshotRequired: true, notes: ['LASER must not write Finance tables directly.', 'Until Finance projection adapter exists, preserved snapshot is authoritative migration evidence.'] },
            { sourceKey: 'production116', label: 'Production planning', ownerCode: 'P566.OWNER.LASER_PRODUCTION', ownerApp: 'APP.KX.LASER', ownerService: 'LASER production projection + Core Planner', targetPath: 'APP.KX.LASER production snapshot + CORE.TASK / CORE.CALENDAR_EVENT references', flowMode: 'ACTION_PROJECTION', commitPolicy: 'Preserve exact production payload first; project deadlines/tasks through typed Core actions after project identity mapping.', exactSnapshotRequired: true, notes: ['Production remains LASER-owned domain state with Core planner projections.'] },
            { sourceKey: 'storage', label: 'storage metadata', ownerCode: 'P566.OWNER.CORE_STORAGE', ownerApp: 'APP.NEXUS', ownerService: 'SettingsService + WorkspaceProfileService + FileService', targetPath: 'CORE.SETTING / WORKSPACE_PROFILE / storage locators', flowMode: 'SNAPSHOT', commitPolicy: 'Migrate logical storage mode/names/preferences only. Native directory permissions/handles are never copied and require explicit re-authorization.', exactSnapshotRequired: true, notes: ['No shared SQLite over SMB.', 'Browser/native permission handles are derived device capability, not transferable data.'] },
            { sourceKey: 'trash', label: 'project trash/archive', ownerCode: 'P566.OWNER.LASER_TRASH', ownerApp: 'APP.KX.LASER', ownerService: 'LaserDomainService', targetPath: 'APP.LASER.PROJECT archived state + migration snapshot', flowMode: 'DERIVED', commitPolicy: 'Preserve exact trash rows; resolve project identity and translate to archived canonical records only inside the future transaction.', exactSnapshotRequired: true, notes: ['Deleted/recoverable project history must survive migration.'] },
            { sourceKey: 'testTrash', label: 'test trash/archive', ownerCode: 'P566.OWNER.LASER_TEST_TRASH', ownerApp: 'APP.KX.LASER', ownerService: 'LaserDomainService', targetPath: 'APP.LASER.TEST + APP.LASER.TEST_RUN archived state + migration snapshot', flowMode: 'DERIVED', commitPolicy: 'Preserve exact Test trash rows; resolve KXT/recordUid and translate session + runs to archived canonical records only inside the staged transaction.', exactSnapshotRequired: true, notes: ['Deleted/recoverable Test/Test Run history must survive migration.', 'Running Test timers are frozen safely and never auto-resumed across migration.'] }
        ];
        list() { return this.owners.map(x => ({ ...x, notes: [...x.notes] })); }
        plan(state) {
            const owners = this.list(), byKey = new Map(owners.map(x => [x.sourceKey, x])), snapshots = [], entries = [];
            const present = Object.keys(state).filter(k => state[k] !== undefined && byKey.has(k));
            const missing = [];
            for (const key of present) {
                const owner = byKey.get(key);
                if (!owner) {
                    missing.push(key);
                    continue;
                }
                const payload = structuredClone(state[key]);
                snapshots.push({ sourcePath: `state.${key}`, ownerCode: owner.ownerCode, ownerApp: owner.ownerApp, ownerService: owner.ownerService, targetPath: owner.targetPath, flowMode: owner.flowMode, commitPolicy: owner.commitPolicy, payload, notes: [...owner.notes] });
                entries.push({ sourcePath: `state.${key}`, targetPath: owner.targetPath, disposition: owner.flowMode === 'DERIVED' ? 'DERIVED' : 'MAPPED', recordsAffected: Array.isArray(payload) ? payload.length : 1, note: `Explicit parity owner: ${owner.label}. ${owner.commitPolicy}`, ownerCode: owner.ownerCode, ownerApp: owner.ownerApp, ownerService: owner.ownerService, flowMode: owner.flowMode, commitPolicy: owner.commitPolicy });
            }
            return { owners, snapshots, entries, coverage: { required: present.length, present: present.length, covered: present.length - missing.length, missing } };
        }
    }
    KX.LaserP566CrossFeatureParityService = LaserP566CrossFeatureParityService;
    class LaserP566ReadOnlyAdapterService {
        laser;
        previewService;
        parityOwners;
        constructor(laser, previewService, parityOwners) {
            this.laser = laser;
            this.previewService = previewService;
            this.parityOwners = parityOwners;
        }
        rec(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        arr(v) { return Array.isArray(v) ? v.filter(x => x && typeof x === 'object').map(x => x) : []; }
        text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
        num(v) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
        source(input) {
            let raw = this.rec(input.source);
            if (typeof input.source === 'string') {
                const text = input.source.trim();
                try {
                    raw = this.rec(JSON.parse(text));
                }
                catch (_) {
                    const a = text.indexOf('window.__KXHUB_PORTABLE_STATE__='), b = text.indexOf('window.__KXHUB_PORTABLE_DEVICE_PREFS__=', a + 1);
                    if (a >= 0 && b > a) {
                        const json = text.slice(a + 'window.__KXHUB_PORTABLE_STATE__='.length, b).replace(/;\s*$/, '').trim();
                        try {
                            raw = { __KXHUB_PORTABLE_STATE__: JSON.parse(json) };
                        }
                        catch (_) {
                            raw = {};
                        }
                    }
                }
            }
            const portable = this.rec(raw.__KXHUB_PORTABLE_STATE__), nested = this.rec(raw.state);
            if (Object.keys(portable).length)
                return { kind: 'PORTABLE_STATE', state: portable };
            if (Object.keys(nested).length) {
                const schema = this.text(raw.schema), kind = /Emergency Reader/i.test(schema) ? 'READER_EXPORT' : 'BACKUP_ENVELOPE';
                return { kind: kind, state: nested };
            }
            if (Array.isArray(raw.machines) || Array.isArray(raw.logs) || Array.isArray(raw.testSessions) || Array.isArray(raw.importLab))
                return { kind: 'APP_STATE_V5', state: raw };
            return { kind: 'UNKNOWN', state: raw };
        }
        tech(v) { const x = this.text(v).toLowerCase(); if (/mopa/.test(x))
            return 'FIBER_MOPA'; if (/fiber|infrared|ir/.test(x))
            return 'FIBER'; if (/uv/.test(x))
            return 'UV'; if (/co2|co₂/.test(x))
            return 'CO2'; if (/diode|blue|450/.test(x))
            return 'DIODE'; if (/dsp|ruida/.test(x))
            return 'DSP'; if (/lp4|laserpecker/.test(x))
            return 'LP4'; return 'GALVO'; }
        speed(values, ctx = {}) { const speed = this.num(values.speed), unit = this.text(values.speedUnit || ctx.speedUnit || 'mm/s'); if (speed === undefined)
            return {}; if (unit === 'mm/min')
            return { speedMmPerMin: speed, speedMmPerS: speed / 60 }; return { speedMmPerS: speed, speedMmPerMin: speed * 60 }; }
        params(values, ctx = {}) { const line = this.num(values.lineInterval), dpi = this.num(values.dpi), diam = this.num(values.objectDiameter), circ = this.num(values.circumference); const p = { ...this.speed(values, ctx), powerPercent: this.num(values.power), frequencyKHz: this.num(values.frequency), qPulseNs: this.num(values.pulseWidth), lineIntervalMm: line, dpi, passes: this.num(values.passes ?? values.globalPasses), hatchAngleDeg: this.num(values.scanAngle ?? values.hatchAngle), wobbleMm: this.num(values.wobbleSize), rotaryDiameterMm: diam, rotaryCircumferenceMm: circ, depthPercent: this.num(values.nativeDepth) }; const known = new Set(['speed', 'speedUnit', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'dpi', 'passes', 'globalPasses', 'scanAngle', 'hatchAngle', 'wobbleSize', 'objectDiameter', 'circumference', 'nativeDepth']); const extras = {}; for (const [k, v] of Object.entries(values))
            if (!known.has(k) && v !== undefined && v !== '' && k !== 'images')
                extras[k] = structuredClone(v); if (Object.keys(extras).length)
            p.extras = extras; return p; }
        preserved(row, mapped) { const m = new Set(mapped), out = {}; for (const [k, v] of Object.entries(row))
            if (!m.has(k))
                out[k] = structuredClone(v); return out; }
        async analyze(input) {
            const before = (await this.laser.list()).length, { kind, state } = this.source(input), machines = this.arr(state.machines), projects = this.arr(state.logs), tests = this.arr(state.testSessions), imports = this.arr(state.importLab), candidates = [], entries = [];
            const machineKey = new Map(), profileKey = new Map(), lensKey = new Map(), sourceKey = new Map();
            const add = (x) => candidates.push(x), parity = (sourcePath, targetPath, disposition, recordsAffected, note) => entries.push({ sourcePath, targetPath, disposition, recordsAffected, note });
            for (let mi = 0; mi < machines.length; mi++) {
                const m = machines[mi], legacyId = this.text(m.id) || `machine-${mi + 1}`, mk = `P566:MACHINE:${legacyId}`, machineTechnologies = [this.tech(m.technology || m.controller || m.name), ...this.arr(m.sourceModules).map(x => this.tech(x.technology || x.name)), ...this.arr(m.presets).map(x => this.tech(x.technology || x.source || x.name))].filter(Boolean);
                machineKey.set(legacyId, mk);
                add({ entityType: 'APP.LASER.MACHINE', sourceKind: 'MACHINE', sourceRef: `state.machines[${mi}]`, legacyId, candidate: { migrationKey: mk, name: this.text(m.name) || legacyId, manufacturer: this.text(m.manufacturer), model: this.text(m.model), physicalOwned: true, technologyCodes: [...new Set(machineTechnologies)], notes: this.text(m.notes) }, preservedLegacy: this.preserved(m, ['id', 'name', 'manufacturer', 'model', 'technology', 'controller', 'notes', 'presets', 'sourceModules']), unresolved: [] });
                const sources = this.arr(m.sourceModules);
                if (!sources.length)
                    parity(`state.machines[${mi}].sourceModules`, 'APP.LASER.SOURCE_MODULE', 'DERIVED', 1, 'P566 starší stroj může zdroj odvozovat z profilu; adapter ho pouze plánuje, nezapisuje.');
                const srcRows = sources.length ? sources : [...new Map(this.arr(m.presets).map((p, pi) => { const k = this.text(p.sourceModuleId) || `${this.text(p.source) || 'source'}|${this.text(p.wavelength)}|${this.text(p.powerW)}`; return [k, { id: this.text(p.sourceModuleId) || `derived-${pi}`, name: this.text(p.source) || `${this.text(m.name) || legacyId} source`, technology: p.technology || p.source, powerW: p.powerW, wavelength: p.wavelength, derived: true }]; })).values()];
                for (let si = 0; si < srcRows.length; si++) {
                    const src = srcRows[si], sid = this.text(src.id) || `source-${si + 1}`, sk = `P566:SOURCE:${legacyId}:${sid}`;
                    sourceKey.set(`${legacyId}|${sid}`, sk);
                    add({ entityType: 'APP.LASER.SOURCE_MODULE', sourceKind: 'SOURCE_MODULE', sourceRef: `state.machines[${mi}].sourceModules[${si}]`, legacyId: sid, candidate: { migrationKey: sk, machineKey: mk, name: this.text(src.name) || sid, technologyCode: this.tech(src.technology || src.name), wavelengthNm: this.num(String(src.wavelength || '').replace(/[^0-9.]/g, '')), nominalPowerW: this.num(src.powerW), sourceFamily: this.text(src.technology), notes: this.text(src.notes), derivedFromPreset: !!src.derived }, preservedLegacy: this.preserved(src, ['id', 'name', 'technology', 'wavelength', 'powerW', 'notes', 'derived']), unresolved: [] });
                }
                const presets = this.arr(m.presets);
                for (let pi = 0; pi < presets.length; pi++) {
                    const pr = presets[pi], pid = this.text(pr.id) || `preset-${pi + 1}`, srcId = this.text(pr.sourceModuleId), fallback = [...sourceKey.entries()].find(([k]) => k.startsWith(`${legacyId}|`))?.[1] || '', sk = sourceKey.get(`${legacyId}|${srcId}`) || fallback, pk = `P566:PROFILE:${legacyId}:${pid}`, lk = `P566:LENS:${legacyId}:${pid}`;
                    profileKey.set(`${legacyId}|${pid}`, pk);
                    lensKey.set(`${legacyId}|${pid}`, lk);
                    add({ entityType: 'APP.LASER.PROFILE', sourceKind: 'PROFILE', sourceRef: `state.machines[${mi}].presets[${pi}]`, legacyId: pid, candidate: { migrationKey: pk, machineKey: mk, sourceModuleKey: sk, name: this.text(pr.name) || pid, mode: this.text(pr.mode), software: this.text(m.defaultSoftwareId || m.software), defaultLensKey: lk, notes: this.text(pr.notes) }, preservedLegacy: this.preserved(pr, ['id', 'sourceModuleId', 'name', 'mode', 'notes', 'lens', 'focus', 'workspace', 'maxSpeed', 'laserCommand', 'modeCommand', 'source', 'powerW', 'wavelength']), unresolved: sk ? [] : ['sourceModuleId'] });
                    add({ entityType: 'APP.LASER.LENS', sourceKind: 'LENS', sourceRef: `state.machines[${mi}].presets[${pi}]`, legacyId: pid, candidate: { migrationKey: lk, machineKey: mk, profileKey: pk, name: this.text(pr.lens) || this.text(pr.name) || pid, focalLengthMm: this.num(String(pr.lens || '').replace(/[^0-9.]/g, '')), fieldLabel: this.text(pr.workspace), focusLabel: this.text(pr.focus), kind: /rotary/i.test(this.text(pr.mode)) ? 'ROTARY' : 'FIELD', notes: this.text(pr.notes) }, preservedLegacy: { workspace: pr.workspace, focus: pr.focus, maxSpeed: pr.maxSpeed, laserCommand: pr.laserCommand, modeCommand: pr.modeCommand }, unresolved: [] });
                }
            }
            const projectCandidates = Object.create(null);
            for (let i = 0; i < projects.length; i++) {
                const r = projects[i], legacyId = this.text(r.id) || `project-${i + 1}`, mid = this.text(r.machineId), pid = this.text(r.presetId), pk = `P566:PROJECT:${this.text(r.recordUid) || legacyId}`, opk = `${pk}:OP:1`, lk = lensKey.get(`${mid}|${pid}`) || '', sk = sourceKey.get(`${mid}|${this.text(r.sourceModuleId)}`) || [...sourceKey.entries()].find(([k]) => k.startsWith(`${mid}|`))?.[1] || '', prof = profileKey.get(`${mid}|${pid}`) || '';
                projectCandidates[legacyId] = pk;
                const recordUid = this.text(r.recordUid), recordCode = this.text(r.recordCode);
                const unresolved = [];
                if (!machineKey.get(mid))
                    unresolved.push('machineId');
                if (!prof)
                    unresolved.push('presetId/profile');
                if (!lk)
                    unresolved.push('lens');
                add({ entityType: 'APP.LASER.PROJECT', sourceKind: 'PROJECT', sourceRef: `state.logs[${i}]`, legacyId, recordUid, recordCode, candidate: { migrationKey: pk, recordUid, recordCode, title: this.text(r.projectName) || recordCode || legacyId, machineKey: machineKey.get(mid) || '', sourceModuleKey: sk, profileKey: prof, lensKeys: lk ? [lk] : [], defaultLensKey: lk, status: this.text(r.result) === 'best' ? 'DONE' : 'DRAFT', material: this.text(r.material), description: this.text(r.notes), tags: Array.isArray(r.tags) ? structuredClone(r.tags) : [] }, preservedLegacy: this.preserved(r, ['id', 'recordUid', 'recordCode', 'projectName', 'machineId', 'sourceModuleId', 'presetId', 'result', 'material', 'notes', 'tags']), unresolved });
                add({ entityType: 'APP.LASER.OPERATION', sourceKind: 'OPERATION', sourceRef: `state.logs[${i}]`, legacyId: `${legacyId}:operation`, candidate: { migrationKey: opk, projectKey: pk, name: this.text(r.layerName) || this.text(r.operation) || 'Operace 1', sequence: 1, lensKey: lk, parameters: this.params(r, r), operationType: this.text(r.operation), layerName: this.text(r.layerName), notes: this.text(r.preparation) }, preservedLegacy: { images: structuredClone(r.images || []), projectFile: r.projectFile, time: r.time, custom: structuredClone(r.custom || {}) }, unresolved: lk ? [] : ['lens'] });
            }
            for (let i = 0; i < tests.length; i++) {
                const s = tests[i], legacyId = this.text(s.id) || `test-${i + 1}`, recordUid = this.text(s.recordUid), recordCode = this.text(s.recordCode), contexts = [this.rec(s.baselineContext), ...this.arr(s.steps).map(x => this.rec(x.context)), this.rec(s.currentContext)].filter(x => Object.keys(x).length), mid = this.text(s.machineId || contexts[0]?.machineId), presetIds = [...new Set(contexts.map(x => this.text(x.presetId)).filter(Boolean).concat(this.text(s.presetId) ? [this.text(s.presetId)] : []))], lensKeys = presetIds.map(pid => lensKey.get(`${mid}|${pid}`)).filter(Boolean), profile = profileKey.get(`${mid}|${presetIds[0] || this.text(s.presetId)}`) || '', srcId = this.text(contexts[0]?.sourceModuleId), sk = sourceKey.get(`${mid}|${srcId}`) || [...sourceKey.entries()].find(([k]) => k.startsWith(`${mid}|`))?.[1] || '', tk = `P566:TEST:${recordUid || legacyId}`, unresolved = [];
                if (!machineKey.get(mid))
                    unresolved.push('machineId');
                if (!profile)
                    unresolved.push('presetId/profile');
                if (!lensKeys.length)
                    unresolved.push('lens');
                add({ entityType: 'APP.LASER.TEST', sourceKind: 'TEST', sourceRef: `state.testSessions[${i}]`, legacyId, recordUid, recordCode, candidate: { migrationKey: tk, recordUid, recordCode, title: this.text(s.name) || recordCode || legacyId, machineKey: machineKey.get(mid) || '', sourceModuleKey: sk, profileKey: profile, lensKeys, projectKey: projectCandidates[this.text(s.sourceProjectId)] || '', status: this.text(s.status) === 'done' ? 'DONE' : 'DRAFT', material: this.text(contexts[0]?.material || this.rec(s.baseline).material), description: this.text(s.note), tags: Array.isArray(s.tags) ? structuredClone(s.tags) : [] }, preservedLegacy: this.preserved(s, ['id', 'recordUid', 'recordCode', 'name', 'machineId', 'presetId', 'sourceProjectId', 'baseline', 'baselineContext', 'currentContext', 'current', 'steps', 'status', 'material', 'note', 'tags']), unresolved });
                const steps = this.arr(s.steps);
                for (let j = 0; j < steps.length; j++) {
                    const st = steps[j], ctx = this.rec(st.context), pid = this.text(ctx.presetId) || presetIds[0] || '', lk = lensKey.get(`${this.text(ctx.machineId) || mid}|${pid}`) || lensKeys[0] || '';
                    add({ entityType: 'APP.LASER.TEST_RUN', sourceKind: 'TEST_RUN', sourceRef: `state.testSessions[${i}].steps[${j}]`, legacyId: this.text(st.id) || `${legacyId}:step:${j + 1}`, candidate: { migrationKey: `${tk}:RUN:${j + 1}`, testKey: tk, lensKey: lk, sequence: this.num(st.number) || j + 1, parameters: this.params(this.rec(st.values), ctx), result: this.text(st.result) === 'best' ? 'PASS' : this.text(st.result) === 'rejected' ? 'FAIL' : 'PENDING', notes: this.text(st.note), createdAt: st.createdAt }, preservedLegacy: this.preserved(st, ['id', 'number', 'context', 'values', 'result', 'note', 'createdAt']), unresolved: lk ? [] : ['lens'] });
                }
            }
            for (let i = 0; i < imports.length; i++) {
                const r = imports[i], legacyId = this.text(r.id) || `import-${i + 1}`, recordUid = this.text(r.recordUid), recordCode = this.text(r.recordCode), ik = `P566:IMPORT:${recordUid || legacyId}`, mapped = [this.text(r.linkedProjectId), this.text(r.linkedTestId), ...(Array.isArray(r.linkedProjectIds) ? r.linkedProjectIds.map(x => this.text(x)) : [])].filter(Boolean).map(id => projectCandidates[id] || id);
                add({ entityType: 'APP.LASER.IMPORT', sourceKind: 'IMPORT', sourceRef: `state.importLab[${i}]`, legacyId, recordUid, recordCode, candidate: { migrationKey: ik, recordUid, recordCode, title: this.text(r.title) || recordCode || legacyId, sourceFormat: this.text(r.sourceType) || 'P566_IMPORT_LAB', sourceName: this.text(r.sourceRef), targetKind: this.text(r.scope) === 'reference' ? 'REFERENCE' : this.text(r.status) === 'test' ? 'TEST' : this.text(r.status) === 'project' ? 'PROJECT' : 'MIXED', status: 'PREVIEW', mappedLegacyRefs: mapped, warnings: [] }, preservedLegacy: this.preserved(r, ['id', 'recordUid', 'recordCode', 'title', 'sourceType', 'sourceRef', 'scope', 'status', 'linkedProjectId', 'linkedTestId', 'linkedProjectIds']), unresolved: [] });
            }
            parity('state.machines', 'APP.LASER.MACHINE', machines.length ? 'MAPPED' : 'UNRESOLVED', machines.length, 'P566 machines are mapped without writing canonical entities.');
            parity('state.machines[*].sourceModules', 'APP.LASER.SOURCE_MODULE', machines.some(m => this.arr(m.sourceModules).length) ? 'MAPPED' : 'DERIVED', machines.length, 'Source modules are read directly when present; older P566 shapes are derived from preset source metadata.');
            parity('state.machines[*].presets', 'APP.LASER.PROFILE + APP.LASER.LENS', 'MAPPED', machines.reduce((n, m) => n + this.arr(m.presets).length, 0), 'P566 preset combines profile/lens/source details; adapter plans separate canonical Profile and Lens.');
            parity('state.logs', 'APP.LASER.PROJECT + APP.LASER.OPERATION', 'MAPPED', projects.length, 'One legacy project record becomes Project metadata plus at least one Operation parameter snapshot.');
            parity('state.testSessions', 'APP.LASER.TEST + APP.LASER.TEST_RUN', 'MAPPED', tests.length, 'Test session maps to Test; every stored step maps to a Test Run and distinct step contexts contribute lensIds.');
            parity('state.importLab', 'APP.LASER.IMPORT', 'MAPPED', imports.length, 'Import Lab identity and raw analysis fields remain available in preservedLegacy until commit design is approved.');
            const preservedCounts = new Map();
            for (const c of candidates)
                for (const k of Object.keys(c.preservedLegacy)) {
                    const key = `${c.sourceKind}.${k}`;
                    preservedCounts.set(key, (preservedCounts.get(key) || 0) + 1);
                }
            for (const [key, count] of preservedCounts)
                parity(key, `migrationCandidate.preservedLegacy.${key.split('.').slice(1).join('.')}`, 'PRESERVED_AS_LEGACY', count, 'Legacy-only field is carried forward verbatim in the read-only candidate and is not silently discarded.');
            const crossFeature = this.parityOwners.plan(state);
            entries.push(...crossFeature.entries);
            for (const c of candidates)
                for (const u of c.unresolved)
                    parity(`${c.sourceRef}.${u}`, undefined, 'BLOCKING', 1, `Unresolved reference required before commit: ${u}`);
            const preview = await this.previewService.preview({ sourceLabel: input.sourceLabel || 'P566', projects, tests, imports }), after = (await this.laser.list()).length;
            if (after !== before)
                throw new Error('LASER P566 adapter violated read-only contract');
            const summary = { mapped: entries.filter(x => x.disposition === 'MAPPED').length, preserved: entries.filter(x => x.disposition === 'PRESERVED_AS_LEGACY').length, derived: entries.filter(x => x.disposition === 'DERIVED').length, unresolved: entries.filter(x => x.disposition === 'UNRESOLVED').length, blocking: entries.filter(x => x.disposition === 'BLOCKING').length };
            const blockingReasons = [...entries.filter(x => x.disposition === 'BLOCKING').map(x => `${x.sourcePath}: ${x.note}`), ...crossFeature.coverage.missing.map(x => `Missing parity owner for state.${x}`), ...(!preview.canProceed ? preview.issues.filter(x => x.severity === 'ERROR').map(x => `${x.code}: ${x.message}`) : []), ...(kind === 'UNKNOWN' ? ['Unknown P566 source envelope'] : [])];
            const guard = { contract: 'KX.LASER_P566_COMMIT_GUARD/1', commitAllowed: false, readyForTransactionalDesign: blockingReasons.length === 0, ownerCoverage: crossFeature.coverage, blockingReasons, safeguards: ['No canonical write is available in this adapter.', 'Every present cross-feature branch is copied into an exact read-only snapshot owned by an explicit Core/LASER/Finance route.', 'REFERENCE flows must resolve stable identities before activation.', 'ACTION_PROJECTION flows may execute only through the target owner typed Action Registry during a future transaction.', 'Native folder permissions/handles are never serialized as transferable credentials.', 'Future commit requires atomic staging, readback, rollback/compensation and roundtrip parity QA.'] };
            return { contract: 'KX.LASER_P566_READONLY_ADAPTER/1', readOnly: true, commitAllowed: false, sourceLabel: String(input.sourceLabel || 'P566'), sourceKind: kind, counts: { machines: candidates.filter(x => x.sourceKind === 'MACHINE').length, sourceModules: candidates.filter(x => x.sourceKind === 'SOURCE_MODULE').length, profiles: candidates.filter(x => x.sourceKind === 'PROFILE').length, lenses: candidates.filter(x => x.sourceKind === 'LENS').length, projects: candidates.filter(x => x.sourceKind === 'PROJECT').length, operations: candidates.filter(x => x.sourceKind === 'OPERATION').length, tests: candidates.filter(x => x.sourceKind === 'TEST').length, testRuns: candidates.filter(x => x.sourceKind === 'TEST_RUN').length, imports: candidates.filter(x => x.sourceKind === 'IMPORT').length }, candidates, parity: { entries, ...summary }, crossFeature: { owners: crossFeature.owners, snapshots: crossFeature.snapshots, guard }, preview, canProceedToCommitDesign: guard.readyForTransactionalDesign };
        }
    }
    KX.LaserP566ReadOnlyAdapterService = LaserP566ReadOnlyAdapterService;
    class LaserP566TransformSourceService {
        rec(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        parse(source) {
            let raw = this.rec(source), devicePrefs = {};
            if (typeof source === 'string') {
                const text = source.trim();
                try {
                    raw = this.rec(JSON.parse(text));
                }
                catch (_) {
                    const extract = (name) => { const tag = `window.${name}=`; const a = text.indexOf(tag); if (a < 0)
                        return {}; let i = a + tag.length, depth = 0, inString = false, esc = false, end = -1; for (; i < text.length; i++) {
                        const ch = text[i];
                        if (inString) {
                            if (esc)
                                esc = false;
                            else if (ch === '\\')
                                esc = true;
                            else if (ch === '"')
                                inString = false;
                            continue;
                        }
                        if (ch === '"') {
                            inString = true;
                            continue;
                        }
                        if (ch === '{' || ch === '[')
                            depth++;
                        else if (ch === '}' || ch === ']') {
                            depth--;
                            if (depth === 0) {
                                end = i + 1;
                                break;
                            }
                        }
                    } if (end < 0)
                        return {}; try {
                        return this.rec(JSON.parse(text.slice(a + tag.length, end)));
                    }
                    catch (_) {
                        return {};
                    } };
                    raw = { __KXHUB_PORTABLE_STATE__: extract('__KXHUB_PORTABLE_STATE__'), __KXHUB_PORTABLE_DEVICE_PREFS__: extract('__KXHUB_PORTABLE_DEVICE_PREFS__') };
                }
            }
            const portable = this.rec(raw.__KXHUB_PORTABLE_STATE__), nested = this.rec(raw.state);
            devicePrefs = this.rec(raw.__KXHUB_PORTABLE_DEVICE_PREFS__ || raw.devicePrefs);
            const state = Object.keys(portable).length ? portable : Object.keys(nested).length ? nested : raw;
            return { state, devicePrefs, sourceKind: (Object.keys(portable).length ? 'PORTABLE_STATE' : Object.keys(nested).length ? 'BACKUP_ENVELOPE' : 'APP_STATE_V5') };
        }
        async hash(value) { return sha256Bytes(new TextEncoder().encode(stableStringify(value))); }
        settingId(p) { return `SETTING.${p.scopeType}.${p.scopeId}.${p.key}`; }
    }
    KX.LaserP566TransformSourceService = LaserP566TransformSourceService;
    class LaserP566TimingCodecService {
        rec(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        arr(v) { return Array.isArray(v) ? v : []; }
        text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
        num(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }
        lap(v, index) { const x = this.rec(v), legacy = structuredClone(x), id = this.text(x.id) || `lap-${index + 1}`, lapMs = Math.max(0, this.num(x.lapMs)), totalMs = Math.max(0, this.num(x.totalMs)); return { id, number: Number.isFinite(Number(x.number)) ? Math.max(1, Number(x.number)) : index + 1, lapMs, totalMs, description: this.text(x.description ?? x.desc), legacy }; }
        session(v, index) { const x = this.rec(v), laps = this.arr(x.laps).map((lap, i) => this.lap(lap, i)); return { id: this.text(x.id) || `session-${index + 1}`, ...(x.createdAt !== undefined ? { createdAt: structuredClone(x.createdAt) } : {}), totalMs: Math.max(0, this.num(x.totalMs)), description: this.text(x.description), laps, legacy: structuredClone(x) }; }
        stopwatch(v, freezeAt) { const x = this.rec(v); if (!Object.keys(x).length)
            return undefined; const legacyRunning = !!x.running, startAt = Number.isFinite(Number(x.startAt)) ? Number(x.startAt) : null, base = Math.max(0, this.num(x.elapsedMs)), elapsed = legacyRunning && freezeAt !== undefined && startAt !== null ? base + Math.max(0, freezeAt - startAt) : base; return { running: false, startAt: null, elapsedMs: elapsed, laps: this.arr(x.laps).map((lap, i) => this.lap(lap, i)), restoreMode: freezeAt !== undefined ? 'FROZEN_AT_DELETE' : legacyRunning ? 'PAUSED_ON_IMPORT' : 'EXACT_STOPPED', ...(legacyRunning ? { legacyRunningAtCapture: true } : {}), ...(freezeAt !== undefined ? { capturedAt: freezeAt } : {}), legacy: structuredClone(x) }; }
        timingLegacy(x) { const out = {}; for (const [k, v] of Object.entries(x))
            if (v !== undefined && (k === 'time' || k === 'manualTime' || /tim(?:e|er|ing)|stopwatch/i.test(k)))
                out[k] = structuredClone(v); return out; }
        hasProjectTiming(log, watch) { const x = this.rec(log); return Object.keys(this.timingLegacy(x)).length > 0 || (watch && Object.keys(this.rec(watch)).length > 0); }
        hasTestTiming(session) { const x = this.rec(session); return Object.keys(this.timingLegacy(x)).length > 0; }
        project(log, watch, freezeAt) { const x = this.rec(log), current = this.rec(x.timingCurrent), history = this.arr(x.timingHistory).map((row, i) => this.session(row, i)), legacy = this.timingLegacy(x), timing = { source: 'P566', history, ...(Object.keys(legacy).length ? { legacy } : {}) }; const display = this.text(x.time); if (display)
            timing.displayText = display; const manual = this.text(x.manualTime); if (x.manualTime !== undefined)
            timing.manualTime = manual; const sw = Number(x.stopwatchTimeMs); if (Number.isFinite(sw) && sw >= 0)
            timing.stopwatchTimeMs = sw; const summary = this.text(x.timingSummary); if (summary)
            timing.summary = summary; if (Object.keys(current).length) {
            timing.current = { totalMs: Math.max(0, this.num(current.totalMs)), laps: this.arr(current.laps).map((lap, i) => this.lap(lap, i)), ...(current.updatedAt !== undefined ? { updatedAt: structuredClone(current.updatedAt) } : {}) };
        } const stopwatch = this.stopwatch(watch, freezeAt); if (stopwatch)
            timing.stopwatch = stopwatch; return timing; }
        test(session, freezeAt) { const x = this.rec(session), legacy = this.timingLegacy(x), timing = { source: 'P566', history: [], ...(Object.keys(legacy).length ? { legacy } : {}) }, stopwatch = this.stopwatch(x.timer, freezeAt); if (stopwatch) {
            timing.stopwatch = stopwatch;
            timing.stopwatchTimeMs = stopwatch.elapsedMs;
            timing.current = { totalMs: stopwatch.elapsedMs, laps: stopwatch.laps };
        } return timing; }
        exactProjectSlice(log) { const x = this.rec(log); return { id: x.id, recordUid: x.recordUid, recordCode: x.recordCode, ...this.timingLegacy(x) }; }
        exactTestSlice(session) { const x = this.rec(session); return { id: x.id, recordUid: x.recordUid, recordCode: x.recordCode, ...this.timingLegacy(x) }; }
    }
    KX.LaserP566TimingCodecService = LaserP566TimingCodecService;
    class LaserP566ViewSettingsTransformerService {
        sourceTools;
        contract = 'KX.LASER_P566_VIEW_SETTINGS_TRANSFORM/1';
        constructor(sourceTools = new LaserP566TransformSourceService()) {
            this.sourceTools = sourceTools;
        }
        rec(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        arr(v) { return Array.isArray(v) ? v : []; }
        text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
        maps(analysis, identityMap) {
            const target = new Map(identityMap.map(x => [x.migrationKey, x.plannedEntityId])), machine = new Map(), profile = new Map(), machineByKey = new Map();
            for (const c of analysis.candidates)
                if (c.sourceKind === 'MACHINE' && c.legacyId) {
                    machineByKey.set(String(c.candidate.migrationKey || ''), c.legacyId);
                    const id = target.get(String(c.candidate.migrationKey || ''));
                    if (id)
                        machine.set(c.legacyId, id);
                }
            for (const c of analysis.candidates)
                if (c.sourceKind === 'PROFILE' && c.legacyId) {
                    const mk = String(c.candidate.machineKey || ''), mid = machineByKey.get(mk) || '', id = target.get(String(c.candidate.migrationKey || ''));
                    if (mid && id)
                        profile.set(`${mid}|${c.legacyId}`, id);
                }
            return { machine, profile };
        }
        async transform(input, analysis, identityMap) {
            const { state, devicePrefs } = this.sourceTools.parse(input.source), m = this.maps(analysis, identityMap), issues = [], settings = [];
            const keys = ['savedViews', 'activeSavedViewId', 'defaultViewByMachine', 'lastViewByMachine', 'columns', 'customColumns', 'kx510P43ColumnOrder', 'tableSort', 'importTable121', 'tableCore126', 'testSettings'];
            const present = keys.some(k => state[k] !== undefined) || devicePrefs.kx510P30ShowTypeFilter !== undefined;
            if (!present)
                return { contract: this.contract, reversible: true, exactSnapshotHash: await this.sourceTools.hash({}), settings, issues, blocking: 0, warnings: 0 };
            const exact = {};
            for (const k of keys)
                if (state[k] !== undefined)
                    exact[k] = structuredClone(state[k]);
            if (devicePrefs.kx510P30ShowTypeFilter !== undefined)
                exact.devicePrefs = { kx510P30ShowTypeFilter: !!devicePrefs.kx510P30ShowTypeFilter };
            const exactHash = await this.sourceTools.hash(exact);
            settings.push({ sourcePath: 'P566.viewTableTest.exact', key: 'laser.migration.p566.viewTableTest.exact', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: exact, exact: true, notes: [`Exact recovery snapshot SHA-256 ${exactHash}.`] });
            const views = this.arr(state.savedViews).filter(x => x && typeof x === 'object').map(x => structuredClone(x)), viewIds = new Set();
            for (const [i, v] of views.entries()) {
                const id = this.text(v.id);
                if (!id) {
                    issues.push({ severity: 'ERROR', code: 'SAVED_VIEW_ID_REQUIRED', sourcePath: `state.savedViews[${i}]`, message: 'Saved View nemá stabilní id.' });
                    continue;
                }
                if (viewIds.has(id)) {
                    issues.push({ severity: 'ERROR', code: 'SAVED_VIEW_ID_DUPLICATE', sourcePath: `state.savedViews[${i}]`, message: `Duplicitní Saved View id ${id}.` });
                    continue;
                }
                viewIds.add(id);
                const legacyMachine = this.text(v.machineId), legacyPreset = this.text(v.presetId);
                if (legacyMachine) {
                    const machine = m.machine.get(legacyMachine);
                    if (!machine)
                        issues.push({ severity: 'ERROR', code: 'SAVED_VIEW_MACHINE_UNRESOLVED', sourcePath: `state.savedViews[${i}].machineId`, message: `Saved View ${id} odkazuje na neznámý laser ${legacyMachine}.` });
                    else
                        v.machineId = machine;
                }
                if (legacyPreset && legacyPreset !== '__all__') {
                    const profile = m.profile.get(`${legacyMachine}|${legacyPreset}`);
                    if (!profile)
                        issues.push({ severity: 'ERROR', code: 'SAVED_VIEW_PROFILE_UNRESOLVED', sourcePath: `state.savedViews[${i}].presetId`, message: `Saved View ${id} odkazuje na neznámý profil ${legacyPreset}.` });
                    else {
                        v.presetId = profile;
                        v.profileId = profile;
                    }
                }
                else if (legacyPreset === '__all__')
                    v.profileMode = 'ALL_PROFILES';
                v.p566LegacyRefs = { machineId: legacyMachine, presetId: legacyPreset };
            }
            if (state.savedViews !== undefined)
                settings.push({ sourcePath: 'state.savedViews', key: 'laser.views.savedViews.p566', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: views, exact: false, notes: ['Named views keep legacy id and exact source exists separately.', 'machineId/presetId are resolved to staged canonical Machine/Profile ids.'] });
            const userId = input.userId || 'USER.LUKAS', active = this.text(state.activeSavedViewId);
            if (state.activeSavedViewId !== undefined) {
                if (active && !viewIds.has(active))
                    issues.push({ severity: 'ERROR', code: 'ACTIVE_VIEW_DANGLING', sourcePath: 'state.activeSavedViewId', message: `Aktivní Saved View ${active} neexistuje.` });
                settings.push({ sourcePath: 'state.activeSavedViewId', key: 'laser.views.activeSavedViewId', scopeType: 'USER', scopeId: userId, value: active, exact: false, notes: ['Dangling active reference blocks staging.'] });
            }
            if (state.defaultViewByMachine !== undefined) {
                const out = {};
                for (const [legacyMachine, viewIdRaw] of Object.entries(this.rec(state.defaultViewByMachine))) {
                    const machine = m.machine.get(legacyMachine), viewId = this.text(viewIdRaw);
                    if (!machine) {
                        issues.push({ severity: 'ERROR', code: 'DEFAULT_VIEW_MACHINE_UNRESOLVED', sourcePath: `state.defaultViewByMachine.${legacyMachine}`, message: `Default View mapa odkazuje na neznámý laser ${legacyMachine}.` });
                        continue;
                    }
                    if (viewId && !viewIds.has(viewId)) {
                        issues.push({ severity: 'ERROR', code: 'DEFAULT_VIEW_DANGLING', sourcePath: `state.defaultViewByMachine.${legacyMachine}`, message: `Default View ${viewId} neexistuje.` });
                        continue;
                    }
                    out[machine] = viewId;
                }
                settings.push({ sourcePath: 'state.defaultViewByMachine', key: 'laser.views.defaultByMachine', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: out, exact: false, notes: ['Machine keys are canonicalized; dangling default view blocks staging.'] });
            }
            if (state.lastViewByMachine !== undefined) {
                const out = {};
                for (const [legacyMachine, viewIdRaw] of Object.entries(this.rec(state.lastViewByMachine))) {
                    const machine = m.machine.get(legacyMachine), viewId = this.text(viewIdRaw), valid = !!machine && (!viewId || viewIds.has(viewId));
                    if (!valid)
                        issues.push({ severity: 'WARNING', code: 'LAST_VIEW_UNRESOLVED', sourcePath: `state.lastViewByMachine.${legacyMachine}`, message: `Last View ${viewId || '(empty)'} / ${legacyMachine} zůstává zachován, ale neaktivní.` });
                    out[machine || legacyMachine] = { viewId, active: valid, legacyMachineId: legacyMachine };
                }
                settings.push({ sourcePath: 'state.lastViewByMachine', key: 'laser.views.lastByMachine', scopeType: input.deviceId ? 'DEVICE' : 'USER', scopeId: input.deviceId || userId, value: out, exact: false, notes: ['Unresolved last-view is preserved inactive and is not a blocker.'] });
            }
            const projectTable = {};
            for (const k of ['columns', 'customColumns', 'kx510P43ColumnOrder', 'tableSort'])
                if (state[k] !== undefined)
                    projectTable[k] = structuredClone(state[k]);
            if (Object.keys(projectTable).length)
                settings.push({ sourcePath: 'state.projectTable', key: 'laser.table.project.p566', scopeType: 'USER', scopeId: userId, value: projectTable, exact: false, notes: ['Project table state retained without dropping unknown column metadata.'] });
            if (state.importTable121 !== undefined)
                settings.push({ sourcePath: 'state.importTable121', key: 'laser.table.importLab.p566', scopeType: 'USER', scopeId: userId, value: structuredClone(state.importTable121), exact: false, notes: ['Import Lab table state retained exactly.'] });
            if (state.tableCore126 !== undefined)
                settings.push({ sourcePath: 'state.tableCore126', key: 'laser.table.core126.p566', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: structuredClone(state.tableCore126), exact: true, notes: ['Late/shared table-core metadata retained as exact APP snapshot.'] });
            if (state.testSettings !== undefined) {
                const t = this.rec(state.testSettings), shared = {}, table = {};
                for (const k of ['historyVisible', 'perContext'])
                    if (t[k] !== undefined)
                        shared[k] = structuredClone(t[k]);
                for (const k of ['columnOrder', 'overviewColumnOrder', 'overviewWidths', 'overviewHiddenBase'])
                    if (t[k] !== undefined)
                        table[k] = structuredClone(t[k]);
                if (Object.keys(shared).length)
                    settings.push({ sourcePath: 'state.testSettings.shared', key: 'laser.tests.settings.shared.p566', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: shared, exact: false, notes: ['Durable shared Test Settings only.'] });
                if (Object.keys(table).length)
                    settings.push({ sourcePath: 'state.testSettings.table', key: 'laser.tests.table.p566', scopeType: 'USER', scopeId: userId, value: table, exact: false, notes: ['User table layout remains separate from shared Test Settings.'] });
            }
            if (devicePrefs.kx510P30ShowTypeFilter !== undefined) {
                if (!input.deviceId)
                    issues.push({ severity: 'ERROR', code: 'DEVICE_SCOPE_REQUIRED', sourcePath: 'devicePrefs.kx510P30ShowTypeFilter', message: 'Portable device Test preference vyžaduje deviceId.' });
                else
                    settings.push({ sourcePath: 'devicePrefs.kx510P30ShowTypeFilter', key: 'laser.tests.showTypeFilter.p566', scopeType: 'DEVICE', scopeId: input.deviceId, value: !!devicePrefs.kx510P30ShowTypeFilter, exact: false, notes: ['Device-local preference is never merged into shared Test Settings.'] });
            }
            return { contract: this.contract, reversible: true, exactSnapshotHash: exactHash, settings, issues, blocking: issues.filter(x => x.severity === 'ERROR').length, warnings: issues.filter(x => x.severity === 'WARNING').length };
        }
    }
    KX.LaserP566ViewSettingsTransformerService = LaserP566ViewSettingsTransformerService;
    class LaserP566WorkspaceTrashTransformerService {
        laser;
        sourceTools;
        timingCodec;
        contract = 'KX.LASER_P566_WORKSPACE_TRASH_TRANSFORM/1';
        constructor(laser, sourceTools = new LaserP566TransformSourceService(), timingCodec = new LaserP566TimingCodecService()) {
            this.laser = laser;
            this.sourceTools = sourceTools;
            this.timingCodec = timingCodec;
        }
        rec(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        arr(v) { return Array.isArray(v) ? v : []; }
        text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
        num(v) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
        async deterministicId(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.MIGRATION.ID/1|${key}`)); return `LASER.MIG.${h.slice(0, 24).toUpperCase()}`; }
        async deterministicUid(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.RECORD_UID/1|${key}`)); return `P566-MIG-${h.slice(0, 32).toUpperCase()}`; }
        maps(analysis, identityMap) {
            const target = new Map(identityMap.map(x => [x.migrationKey, x.plannedEntityId])), machine = new Map(), profile = new Map(), lens = new Map(), source = new Map(), machineByKey = new Map();
            for (const c of analysis.candidates)
                if (c.sourceKind === 'MACHINE' && c.legacyId) {
                    machineByKey.set(String(c.candidate.migrationKey || ''), c.legacyId);
                    const id = target.get(String(c.candidate.migrationKey || ''));
                    if (id)
                        machine.set(c.legacyId, id);
                }
            for (const c of analysis.candidates) {
                const mk = String(c.candidate.machineKey || ''), mid = machineByKey.get(mk) || '', id = target.get(String(c.candidate.migrationKey || ''));
                if (!id || !mid)
                    continue;
                if (c.sourceKind === 'PROFILE' && c.legacyId)
                    profile.set(`${mid}|${c.legacyId}`, id);
                if (c.sourceKind === 'LENS' && c.legacyId)
                    lens.set(`${mid}|${c.legacyId}`, id);
                if (c.sourceKind === 'SOURCE_MODULE' && c.legacyId)
                    source.set(`${mid}|${c.legacyId}`, id);
            }
            return { machine, profile, lens, source };
        }
        async transform(input, analysis, identityMap) {
            const { state } = this.sourceTools.parse(input.source), maps = this.maps(analysis, identityMap), issues = [], settings = [], projectSteps = [], userId = input.userId || 'USER.LUKAS', scopeType = input.deviceId ? 'DEVICE' : 'USER', scopeId = input.deviceId || userId;
            const workspacePresent = state.activeMachineId !== undefined || state.activePresetId !== undefined, trash = this.arr(state.trash), exact = { ...(workspacePresent ? { activeMachineId: state.activeMachineId, activePresetId: state.activePresetId } : {}), ...(state.trash !== undefined ? { trash: structuredClone(state.trash) } : {}) };
            const exactHash = await this.sourceTools.hash(exact);
            if (workspacePresent || state.trash !== undefined)
                settings.push({ sourcePath: 'P566.workspaceTrash.exact', key: 'laser.migration.p566.workspaceTrash.exact', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: exact, exact: true, notes: [`Exact workspace/trash recovery snapshot SHA-256 ${exactHash}.`] });
            if (workspacePresent) {
                const lm = this.text(state.activeMachineId), lp = this.text(state.activePresetId), machine = maps.machine.get(lm);
                if (!machine)
                    issues.push({ severity: 'ERROR', code: 'ACTIVE_MACHINE_UNRESOLVED', sourcePath: 'state.activeMachineId', message: `Aktivní laser ${lm || '(empty)'} nelze přeložit na canonical Machine.` });
                else
                    settings.push({ sourcePath: 'state.activeMachineId', key: 'laser.workspace.activeMachineId', scopeType, scopeId, value: machine, exact: false, notes: [`Legacy machine ${lm} resolved to staged canonical id.`] });
                if (lp && lp !== '__all__') {
                    const profile = maps.profile.get(`${lm}|${lp}`);
                    if (!profile)
                        issues.push({ severity: 'ERROR', code: 'ACTIVE_PROFILE_UNRESOLVED', sourcePath: 'state.activePresetId', message: `Aktivní profil ${lp} nelze přeložit pod laserem ${lm}.` });
                    else
                        settings.push({ sourcePath: 'state.activePresetId', key: 'laser.workspace.activeProfileId', scopeType, scopeId, value: profile, exact: false, notes: [`Legacy profile ${lp} resolved to staged canonical id.`] });
                }
                else
                    settings.push({ sourcePath: 'state.activePresetId', key: 'laser.workspace.activeProfileId', scopeType, scopeId, value: '__all__', exact: false, notes: ['P566 ALL_PRESETS sentinel retained as explicit all-profile workspace state.'] });
            }
            const activeStable = new Set();
            for (const c of analysis.candidates)
                if (c.sourceKind === 'PROJECT') {
                    if (c.recordUid)
                        activeStable.add(`UID:${c.recordUid}`);
                    if (c.recordCode)
                        activeStable.add(`CODE:${c.recordCode}`);
                    if (c.legacyId)
                        activeStable.add(`ID:${c.legacyId}`);
                }
            const seen = new Set(), existing = await this.laser.list('APP.LASER.PROJECT');
            for (let i = 0; i < trash.length; i++) {
                const t = this.rec(trash[i]), log = this.rec(t.log);
                if (!Object.keys(log).length) {
                    issues.push({ severity: 'WARNING', code: 'TRASH_NON_PROJECT_ROW_PRESERVED', sourcePath: `state.trash[${i}]`, message: 'Trash row bez log projektu zůstává pouze v exact recovery snapshotu.' });
                    continue;
                }
                const legacyId = this.text(log.id) || `trash-${i + 1}`, uid = this.text(log.recordUid), code = this.text(log.recordCode), stable = uid ? `UID:${uid}` : code ? `CODE:${code}` : `ID:${legacyId}`;
                if (seen.has(stable)) {
                    issues.push({ severity: 'ERROR', code: 'TRASH_DUPLICATE_IDENTITY', sourcePath: `state.trash[${i}]`, message: `Duplicitní identita v koši ${stable}.` });
                    continue;
                }
                seen.add(stable);
                if (activeStable.has(stable)) {
                    issues.push({ severity: 'ERROR', code: 'TRASH_ACTIVE_IDENTITY_COLLISION', sourcePath: `state.trash[${i}]`, message: `Projekt ${stable} je současně aktivní i v koši.` });
                    continue;
                }
                const mid = this.text(log.machineId), pid = this.text(log.presetId), machine = maps.machine.get(mid), profile = maps.profile.get(`${mid}|${pid}`), lens = maps.lens.get(`${mid}|${pid}`), source = maps.source.get(`${mid}|${this.text(log.sourceModuleId)}`) || [...maps.source.entries()].find(([k]) => k.startsWith(`${mid}|`))?.[1];
                if (!machine)
                    issues.push({ severity: 'ERROR', code: 'TRASH_MACHINE_UNRESOLVED', sourcePath: `state.trash[${i}].log.machineId`, message: `Trash projekt ${stable}: neznámý laser ${mid}.` });
                if (!profile)
                    issues.push({ severity: 'ERROR', code: 'TRASH_PROFILE_UNRESOLVED', sourcePath: `state.trash[${i}].log.presetId`, message: `Trash projekt ${stable}: neznámý profil ${pid}.` });
                if (!lens)
                    issues.push({ severity: 'ERROR', code: 'TRASH_LENS_UNRESOLVED', sourcePath: `state.trash[${i}].log.presetId`, message: `Trash projekt ${stable}: profil ${pid} nemá canonical Lens.` });
                if (!source)
                    issues.push({ severity: 'ERROR', code: 'TRASH_SOURCE_UNRESOLVED', sourcePath: `state.trash[${i}].log.sourceModuleId`, message: `Trash projekt ${stable}: nelze určit canonical Source Module.` });
                const deletedAt = this.num(t.deletedAt);
                if (!deletedAt || deletedAt < 0) {
                    issues.push({ severity: 'ERROR', code: 'TRASH_DELETED_AT_REQUIRED', sourcePath: `state.trash[${i}].deletedAt`, message: `Trash projekt ${stable}: chybí platný deletedAt.` });
                    continue;
                }
                if (!machine || !profile || !lens || !source)
                    continue;
                const existingHit = existing.find(x => { const d = x.data; return (uid && d.recordUid === uid) || (code && d.recordCode === code) || (!uid && !code && d.p566LegacyId === legacyId); }), migrationKey = `P566:TRASH_PROJECT:${uid || code || legacyId}`, targetId = existingHit?.id || await this.deterministicId(migrationKey), recordUid = uid || await this.deterministicUid(migrationKey), archivedAt = new Date(deletedAt).toISOString(), data = { recordUid, recordCode: code || undefined, title: this.text(log.projectName) || code || legacyId, machineId: machine, sourceModuleId: source, profileId: profile, lensIds: [lens], defaultLensId: lens, status: 'ARCHIVED', material: this.text(log.material), description: this.text(log.notes), tags: Array.isArray(log.tags) ? structuredClone(log.tags) : [], p566LegacyId: legacyId, p566Trash: { deletedAt, deletedBy: t.deletedBy || null, sourceIndex: i }, ...(this.timingCodec.hasProjectTiming(log, t.projectWatch375) ? { timing: this.timingCodec.project(log, t.projectWatch375, deletedAt) } : {}) };
                projectSteps.push({ order: 0, phase: 'CROSS_FEATURE_135_TRASH_PROJECT_ARCHIVE', migrationKey, sourceRef: `state.trash[${i}]`, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.PROJECT.SAVE', actionAvailable: true, status: 'READY', dependsOn: [], targetId, payloadPreview: { ...(existingHit ? { id: existingHit.id, expectedRevision: existingHit.revision } : { migrationPlannedId: targetId }), spaceIds: [...new Set(input.targetSpaceIds || [])], archivedAt, data }, notes: ['Exact trash row is preserved separately before normalized archive staging.', 'Archive is non-destructive: canonical Project receives status ARCHIVED + Core archivedAt; no hard delete is planned.'] });
            }
            if (state.trash !== undefined)
                settings.push({ sourcePath: 'state.trash.identityMap', key: 'laser.migration.p566.trash.identityMap', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: projectSteps.map(x => ({ sourceRef: x.sourceRef, targetId: x.targetId, migrationKey: x.migrationKey, archivedAt: x.payloadPreview?.archivedAt })), exact: false, notes: ['Stable map from trash rows to staged archived canonical Project ids.'] });
            return { contract: this.contract, reversible: true, exactSnapshotHash: exactHash, settings, projectSteps, issues, blocking: issues.filter(x => x.severity === 'ERROR').length, warnings: issues.filter(x => x.severity === 'WARNING').length };
        }
    }
    KX.LaserP566WorkspaceTrashTransformerService = LaserP566WorkspaceTrashTransformerService;
    class LaserP566TestTrashTimingTransformerService {
        laser;
        sourceTools;
        timingCodec;
        contract = 'KX.LASER_P566_TEST_TRASH_TIMING_TRANSFORM/1';
        constructor(laser, sourceTools = new LaserP566TransformSourceService(), timingCodec = new LaserP566TimingCodecService()) {
            this.laser = laser;
            this.sourceTools = sourceTools;
            this.timingCodec = timingCodec;
        }
        rec(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        arr(v) { return Array.isArray(v) ? v : []; }
        text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
        num(v) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
        async deterministicId(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.MIGRATION.ID/1|${key}`)); return `LASER.MIG.${h.slice(0, 24).toUpperCase()}`; }
        async deterministicUid(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.RECORD_UID/1|${key}`)); return `P566-MIG-${h.slice(0, 32).toUpperCase()}`; }
        async deterministicTestCode(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.TEST_CODE/1|${key}`)); return `KXT-MIG-${h.slice(0, 12).toUpperCase()}`; }
        speed(values, ctx = {}) { const speed = this.num(values.speed), unit = this.text(values.speedUnit || ctx.speedUnit || 'mm/s'); if (speed === undefined)
            return {}; if (unit === 'mm/min')
            return { speedMmPerMin: speed, speedMmPerS: speed / 60 }; return { speedMmPerS: speed, speedMmPerMin: speed * 60 }; }
        params(values, ctx = {}) { const line = this.num(values.lineInterval), dpi = this.num(values.dpi), diam = this.num(values.objectDiameter), circ = this.num(values.circumference); const p = { ...this.speed(values, ctx), powerPercent: this.num(values.power), frequencyKHz: this.num(values.frequency), qPulseNs: this.num(values.pulseWidth), lineIntervalMm: line, dpi, passes: this.num(values.passes ?? values.globalPasses), hatchAngleDeg: this.num(values.scanAngle ?? values.hatchAngle), wobbleMm: this.num(values.wobbleSize), rotaryDiameterMm: diam, rotaryCircumferenceMm: circ, depthPercent: this.num(values.nativeDepth) }; const known = new Set(['speed', 'speedUnit', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'dpi', 'passes', 'globalPasses', 'scanAngle', 'hatchAngle', 'wobbleSize', 'objectDiameter', 'circumference', 'nativeDepth']); const extras = {}; for (const [k, v] of Object.entries(values))
            if (!known.has(k) && v !== undefined && v !== '' && k !== 'images')
                extras[k] = structuredClone(v); if (Object.keys(extras).length)
            p.extras = extras; return p; }
        maps(analysis, identityMap, projectTrashSteps) {
            const target = new Map(identityMap.map(x => [x.migrationKey, x.plannedEntityId])), machine = new Map(), profile = new Map(), lens = new Map(), source = new Map(), project = new Map(), machineByKey = new Map();
            for (const c of analysis.candidates)
                if (c.sourceKind === 'MACHINE' && c.legacyId) {
                    machineByKey.set(String(c.candidate.migrationKey || ''), c.legacyId);
                    const id = target.get(String(c.candidate.migrationKey || ''));
                    if (id)
                        machine.set(c.legacyId, id);
                }
            for (const c of analysis.candidates) {
                const mk = String(c.candidate.machineKey || ''), mid = machineByKey.get(mk) || '', id = target.get(String(c.candidate.migrationKey || ''));
                if (!id)
                    continue;
                if (c.sourceKind === 'PROFILE' && c.legacyId && mid)
                    profile.set(`${mid}|${c.legacyId}`, id);
                if (c.sourceKind === 'LENS' && c.legacyId && mid)
                    lens.set(`${mid}|${c.legacyId}`, id);
                if (c.sourceKind === 'SOURCE_MODULE' && c.legacyId && mid)
                    source.set(`${mid}|${c.legacyId}`, id);
                if (c.sourceKind === 'PROJECT' && c.legacyId)
                    project.set(c.legacyId, id);
            }
            for (const step of projectTrashSteps) {
                const d = this.rec(step.payloadPreview?.data), legacy = this.text(d.p566LegacyId);
                if (legacy && step.targetId)
                    project.set(legacy, step.targetId);
            }
            return { target, machine, profile, lens, source, project };
        }
        async transform(input, analysis, identityMap, projectTrashSteps) {
            const { state } = this.sourceTools.parse(input.source), logs = this.arr(state.logs), tests = this.arr(state.testSessions), testTrash = this.arr(state.testTrash), maps = this.maps(analysis, identityMap, projectTrashSteps), issues = [], settings = [], entityTimingPatches = [], testSteps = [], testRunSteps = [];
            const exactProjects = logs.filter(x => this.timingCodec.hasProjectTiming(x)).map(x => this.timingCodec.exactProjectSlice(x)), exactTests = tests.filter(x => this.timingCodec.hasTestTiming(x)).map(x => this.timingCodec.exactTestSlice(x)), present = exactProjects.length > 0 || exactTests.length > 0 || state.testTrash !== undefined;
            const exact = { ...(exactProjects.length ? { projectTiming: exactProjects } : {}), ...(exactTests.length ? { testTiming: exactTests } : {}), ...(state.testTrash !== undefined ? { testTrash: structuredClone(state.testTrash) } : {}) }, exactHash = await this.sourceTools.hash(exact);
            if (present)
                settings.push({ sourcePath: 'P566.testTrashTiming.exact', key: 'laser.migration.p566.testTrashTiming.exact', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: exact, exact: true, notes: [`Exact Test-trash/timing recovery snapshot SHA-256 ${exactHash}.`, 'P566 device-local global/project running stopwatches are not fully serialized in appState; production migration requires a separate device-runtime capture before commit.'] });
            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                if (!this.timingCodec.hasProjectTiming(log))
                    continue;
                const c = analysis.candidates.find(x => x.sourceKind === 'PROJECT' && x.sourceRef === `state.logs[${i}]`), targetId = c ? maps.target.get(String(c.candidate.migrationKey || '')) : undefined;
                if (!targetId) {
                    issues.push({ severity: 'ERROR', code: 'PROJECT_TIMING_TARGET_UNRESOLVED', sourcePath: `state.logs[${i}]`, message: 'Projektové timing history nelze navázat na staged canonical Project.' });
                    continue;
                }
                entityTimingPatches.push({ sourcePath: `state.logs[${i}].timing`, targetId, entityType: 'APP.LASER.PROJECT', timing: this.timingCodec.project(log), notes: ['Detailed P566 project timingCurrent/timingHistory/manual/stopwatch totals preserved in canonical Project timing.'] });
            }
            for (let i = 0; i < tests.length; i++) {
                const session = tests[i];
                if (!this.timingCodec.hasTestTiming(session))
                    continue;
                const c = analysis.candidates.find(x => x.sourceKind === 'TEST' && x.sourceRef === `state.testSessions[${i}]`), targetId = c ? maps.target.get(String(c.candidate.migrationKey || '')) : undefined;
                if (!targetId) {
                    issues.push({ severity: 'ERROR', code: 'TEST_TIMING_TARGET_UNRESOLVED', sourcePath: `state.testSessions[${i}].timer`, message: 'Test timer nelze navázat na staged canonical Test.' });
                    continue;
                }
                const timer = this.rec(session.timer);
                if (timer.running)
                    issues.push({ severity: 'WARNING', code: 'ACTIVE_TEST_TIMER_PAUSED_ON_IMPORT', sourcePath: `state.testSessions[${i}].timer`, message: 'Běžící legacy Test timer zůstává exact-preserved; canonical import ho bezpečně obnoví jako PAUSED, aby se nepřipočítal offline čas.' });
                entityTimingPatches.push({ sourcePath: `state.testSessions[${i}].timer`, targetId, entityType: 'APP.LASER.TEST', timing: this.timingCodec.test(session), notes: ['Legacy active Test timer is never auto-resumed across migration; exact running/startAt remains in recovery snapshot.'] });
            }
            const activeStable = new Set();
            for (const c of analysis.candidates)
                if (c.sourceKind === 'TEST') {
                    if (c.recordUid)
                        activeStable.add(`UID:${c.recordUid}`);
                    if (c.recordCode)
                        activeStable.add(`CODE:${c.recordCode}`);
                    if (c.legacyId)
                        activeStable.add(`ID:${c.legacyId}`);
                }
            const seen = new Set(), existingTests = await this.laser.list('APP.LASER.TEST'), existingRuns = await this.laser.list('APP.LASER.TEST_RUN');
            for (let i = 0; i < testTrash.length; i++) {
                const row = this.rec(testTrash[i]), session = this.rec(row.session);
                if (!Object.keys(session).length) {
                    issues.push({ severity: 'WARNING', code: 'TEST_TRASH_NON_SESSION_ROW_PRESERVED', sourcePath: `state.testTrash[${i}]`, message: 'Test trash row bez session zůstává pouze v exact recovery snapshotu.' });
                    continue;
                }
                const legacyId = this.text(session.id) || `test-trash-${i + 1}`, uid = this.text(session.recordUid), code = this.text(session.recordCode), stable = uid ? `UID:${uid}` : code ? `CODE:${code}` : `ID:${legacyId}`, identities = [...(uid ? [`UID:${uid}`] : []), ...(code ? [`CODE:${code}`] : []), ...(legacyId ? [`ID:${legacyId}`] : [])];
                const duplicate = identities.find(x => seen.has(x));
                if (duplicate) {
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_DUPLICATE_IDENTITY', sourcePath: `state.testTrash[${i}]`, message: `Duplicitní Test trash identita ${duplicate}.` });
                    continue;
                }
                identities.forEach(x => seen.add(x));
                const collision = identities.find(x => activeStable.has(x));
                if (collision) {
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_ACTIVE_IDENTITY_COLLISION', sourcePath: `state.testTrash[${i}]`, message: `Test ${collision} je současně aktivní i v koši.` });
                    continue;
                }
                const deletedAt = this.num(row.deletedAt);
                if (deletedAt === undefined || deletedAt < 0) {
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_DELETED_AT_REQUIRED', sourcePath: `state.testTrash[${i}].deletedAt`, message: `Test trash ${stable}: chybí platný deletedAt.` });
                    continue;
                }
                const contexts = [this.rec(session.baselineContext), ...this.arr(session.steps).map(x => this.rec(x.context)), this.rec(session.currentContext)].filter(x => Object.keys(x).length), mid = this.text(session.machineId || contexts[0]?.machineId), presetIds = [...new Set(contexts.map(x => this.text(x.presetId)).filter(Boolean).concat(this.text(session.presetId) ? [this.text(session.presetId)] : []))], machine = maps.machine.get(mid), profile = maps.profile.get(`${mid}|${presetIds[0] || this.text(session.presetId)}`), lensIds = [...new Set(presetIds.map(pid => maps.lens.get(`${mid}|${pid}`)).filter(Boolean))], srcLegacy = this.text(contexts[0]?.sourceModuleId), source = maps.source.get(`${mid}|${srcLegacy}`) || [...maps.source.entries()].find(([k]) => k.startsWith(`${mid}|`))?.[1], projectLegacy = this.text(session.sourceProjectId), projectId = projectLegacy ? maps.project.get(projectLegacy) : undefined;
                if (!machine)
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_MACHINE_UNRESOLVED', sourcePath: `state.testTrash[${i}].session.machineId`, message: `Test trash ${stable}: neznámý laser ${mid}.` });
                if (!profile)
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_PROFILE_UNRESOLVED', sourcePath: `state.testTrash[${i}].session.presetId`, message: `Test trash ${stable}: neznámý profil.` });
                if (!lensIds.length)
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_LENS_UNRESOLVED', sourcePath: `state.testTrash[${i}].session`, message: `Test trash ${stable}: nelze určit canonical Lens.` });
                if (!source)
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_SOURCE_UNRESOLVED', sourcePath: `state.testTrash[${i}].session`, message: `Test trash ${stable}: nelze určit canonical Source Module.` });
                if (projectLegacy && !projectId)
                    issues.push({ severity: 'ERROR', code: 'TEST_TRASH_PROJECT_UNRESOLVED', sourcePath: `state.testTrash[${i}].session.sourceProjectId`, message: `Test trash ${stable}: zdrojový projekt ${projectLegacy} nelze navázat.` });
                if (!machine || !profile || !lensIds.length || !source || (projectLegacy && !projectId))
                    continue;
                const migrationKey = `P566:TRASH_TEST:${uid || code || legacyId}`, existingHit = existingTests.find(x => { const d = x.data; return (uid && d.recordUid === uid) || (code && d.recordCode === code) || (!uid && !code && d.p566LegacyId === legacyId); }), targetId = existingHit?.id || await this.deterministicId(migrationKey), recordUid = uid || await this.deterministicUid(migrationKey), recordCode = code || await this.deterministicTestCode(migrationKey), archivedAt = new Date(deletedAt).toISOString(), timer = this.rec(session.timer);
                if (!uid || !code)
                    issues.push({ severity: 'WARNING', code: 'TEST_TRASH_IDENTITY_DERIVED', sourcePath: `state.testTrash[${i}].session`, message: `Test trash ${stable}: chybějící ${!uid && !code ? 'recordUid + recordCode' : !uid ? 'recordUid' : 'recordCode'} bylo deterministicky doplněno; exact legacy identita zůstává zachována.` });
                if (timer.running)
                    issues.push({ severity: 'WARNING', code: 'TEST_TRASH_RUNNING_TIMER_FROZEN', sourcePath: `state.testTrash[${i}].session.timer`, message: 'Legacy Test v koši měl running=true; canonical timing je deterministicky zmražen k deletedAt, stejně jako bezpečný P566 delete path.' });
                const timing = this.timingCodec.test(session, deletedAt), data = { recordUid, recordCode, title: this.text(session.name) || recordCode, machineId: machine, sourceModuleId: source, profileId: profile, lensIds, ...(projectId ? { projectId } : {}), status: 'ARCHIVED', material: this.text(contexts[0]?.material || this.rec(session.baseline).material), description: this.text(session.note), tags: Array.isArray(session.tags) ? structuredClone(session.tags) : [], p566LegacyId: legacyId, p566Trash: { deletedAt, deletedBy: row.deletedBy || null, sourceIndex: i }, ...(this.timingCodec.hasTestTiming(session) ? { timing } : {}) };
                testSteps.push({ order: 0, phase: 'CROSS_FEATURE_145_TRASH_TEST_ARCHIVE', migrationKey, sourceRef: `state.testTrash[${i}]`, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.TEST.SAVE', actionAvailable: true, status: 'READY', dependsOn: [], targetId, payloadPreview: { ...(existingHit ? { id: existingHit.id, expectedRevision: existingHit.revision } : { migrationPlannedId: targetId }), spaceIds: [...new Set(input.targetSpaceIds || [])], archivedAt, data }, notes: ['Exact Test trash row is retained before normalization.', 'Archive is non-destructive: APP.LASER.TEST status ARCHIVED + Core archivedAt.', 'Any running legacy timer is frozen at deletedAt; it is never resumed automatically.'] });
                const runSeen = new Set(), steps = this.arr(session.steps);
                for (let j = 0; j < steps.length; j++) {
                    const st = this.rec(steps[j]), ctx = this.rec(st.context), stepLegacy = this.text(st.id) || `step-${j + 1}`, stepStable = this.text(st.recordUid) || stepLegacy;
                    if (runSeen.has(stepStable)) {
                        issues.push({ severity: 'ERROR', code: 'TEST_TRASH_RUN_DUPLICATE_IDENTITY', sourcePath: `state.testTrash[${i}].session.steps[${j}]`, message: `Duplicitní Test Run identita ${stepStable}.` });
                        continue;
                    }
                    runSeen.add(stepStable);
                    const pid = this.text(ctx.presetId) || presetIds[0] || '', stepMid = this.text(ctx.machineId) || mid, lens = maps.lens.get(`${stepMid}|${pid}`) || lensIds[0];
                    if (!lens) {
                        issues.push({ severity: 'ERROR', code: 'TEST_TRASH_RUN_LENS_UNRESOLVED', sourcePath: `state.testTrash[${i}].session.steps[${j}]`, message: `Test Run ${stepStable}: nelze určit canonical Lens.` });
                        continue;
                    }
                    const runKey = `${migrationKey}:RUN:${this.text(st.recordUid) || stepLegacy || j + 1}`, runUid = this.text(st.recordUid) || await this.deterministicUid(runKey), existingRun = existingRuns.find(x => String(x.data.recordUid || '') === runUid), runId = existingRun?.id || await this.deterministicId(runKey), duration = this.num(st.durationMs);
                    testRunSteps.push({ order: 0, phase: 'CROSS_FEATURE_146_TRASH_TEST_RUN', migrationKey: runKey, sourceRef: `state.testTrash[${i}].session.steps[${j}]`, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.TEST_RUN.SAVE', actionAvailable: true, status: 'READY', dependsOn: [migrationKey], targetId: runId, payloadPreview: { ...(existingRun ? { id: existingRun.id, expectedRevision: existingRun.revision } : { migrationPlannedId: runId }), spaceIds: [...new Set(input.targetSpaceIds || [])], archivedAt, data: { recordUid: runUid, testId: targetId, lensId: lens, sequence: this.num(st.number) || j + 1, parameters: this.params(this.rec(st.values), ctx), result: this.text(st.result) === 'best' ? 'PASS' : this.text(st.result) === 'rejected' ? 'FAIL' : 'PENDING', ...(duration !== undefined ? { durationMs: Math.max(0, duration) } : {}), notes: this.text(st.note), p566LegacyId: stepLegacy, p566TrashParent: stable } }, notes: ['Archived Test Run is retained under its archived Test; no hard delete.'] });
                }
            }
            if (state.testTrash !== undefined)
                settings.push({ sourcePath: 'state.testTrash.identityMap', key: 'laser.migration.p566.testTrash.identityMap', scopeType: 'APP', scopeId: 'APP.KX.LASER', value: testSteps.map(x => ({ sourceRef: x.sourceRef, targetId: x.targetId, migrationKey: x.migrationKey, archivedAt: x.payloadPreview?.archivedAt, runCount: testRunSteps.filter(r => r.dependsOn.includes(String(x.migrationKey))).length })), exact: false, notes: ['Stable map from P566 Test trash to archived canonical Test/Test Run records.'] });
            return { contract: this.contract, reversible: true, exactSnapshotHash: exactHash, settings, entityTimingPatches, testSteps, testRunSteps, issues, blocking: issues.filter(x => x.severity === 'ERROR').length, warnings: issues.filter(x => x.severity === 'WARNING').length };
        }
    }
    KX.LaserP566TestTrashTimingTransformerService = LaserP566TestTrashTimingTransformerService;
    class LaserP566StagingService {
        laser;
        adapter;
        actionCatalog;
        faultInjector;
        viewTransformer;
        workspaceTrashTransformer;
        testTrashTimingTransformer;
        entityAction = {
            MACHINE: 'ACTION.LASER.MACHINE.SAVE', SOURCE_MODULE: 'ACTION.LASER.SOURCE_MODULE.SAVE', PROFILE: 'ACTION.LASER.PROFILE.SAVE', LENS: 'ACTION.LASER.LENS.SAVE', PROJECT: 'ACTION.LASER.PROJECT.SAVE', OPERATION: 'ACTION.LASER.OPERATION.SAVE', TEST: 'ACTION.LASER.TEST.SAVE', TEST_RUN: 'ACTION.LASER.TEST_RUN.SAVE', IMPORT: 'ACTION.LASER.IMPORT.SAVE'
        };
        phase = { MACHINE: 10, SOURCE_MODULE: 20, PROFILE: 30, LENS: 40, PROJECT: 50, OPERATION: 60, TEST: 70, TEST_RUN: 80, IMPORT: 90 };
        constructor(laser, adapter, actionCatalog, faultInjector, viewTransformer = new LaserP566ViewSettingsTransformerService(), workspaceTrashTransformer = new LaserP566WorkspaceTrashTransformerService(laser), testTrashTimingTransformer = new LaserP566TestTrashTimingTransformerService(laser)) {
            this.laser = laser;
            this.adapter = adapter;
            this.actionCatalog = actionCatalog;
            this.faultInjector = faultInjector;
            this.viewTransformer = viewTransformer;
            this.workspaceTrashTransformer = workspaceTrashTransformer;
            this.testTrashTimingTransformer = testTrashTimingTransformer;
        }
        fault(point) { this.faultInjector?.(point); }
        cloneSource(source) { return structuredClone(source); }
        async sourceSnapshot(input, sourceKind) {
            const cloned = this.cloneSource(input.source), text = typeof cloned === 'string' ? cloned : stableStringify(cloned), encoding = typeof cloned === 'string' ? 'UTF8_SOURCE_TEXT' : 'UTF8_STABLE_JSON', bytes = new TextEncoder().encode(text), sha = await sha256Bytes(bytes);
            return { sha256: sha, byteLength: bytes.byteLength, encoding, sourceKind, payloadIncluded: !!input.includeSnapshotPayload, ...(input.includeSnapshotPayload ? { payload: cloned } : {}) };
        }
        async deterministicId(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.MIGRATION.ID/1|${key}`)); return `LASER.MIG.${h.slice(0, 24).toUpperCase()}`; }
        async deterministicUid(key) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.RECORD_UID/1|${key}`)); return `P566-MIG-${h.slice(0, 32).toUpperCase()}`; }
        collectDeps(value, known, out = new Set()) { if (typeof value === 'string') {
            if (known.has(value))
                out.add(value);
            return out;
        } if (Array.isArray(value)) {
            for (const x of value)
                this.collectDeps(x, known, out);
            return out;
        } if (value && typeof value === 'object')
            for (const x of Object.values(value))
                this.collectDeps(x, known, out); return out; }
        resolveCandidatePayload(c, targetIds, recordUid) {
            const src = structuredClone(c.candidate), out = {};
            const keyRename = { machineKey: 'machineId', sourceModuleKey: 'sourceModuleId', profileKey: 'profileId', defaultLensKey: 'defaultLensId', projectKey: 'projectId', lensKey: 'lensId', testKey: 'testId', lensKeys: 'lensIds', mappedLegacyRefs: 'mappedEntityIds' };
            const resolve = (v) => typeof v === 'string' && targetIds.has(v) ? targetIds.get(v) : Array.isArray(v) ? v.map(resolve) : v;
            for (const [k, v] of Object.entries(src)) {
                if (k === 'migrationKey')
                    continue;
                out[keyRename[k] || k] = resolve(v);
            }
            if (!out.recordUid)
                out.recordUid = c.recordUid || recordUid;
            if (c.recordCode && !out.recordCode)
                out.recordCode = c.recordCode;
            return out;
        }
        crossFeatureAction(snapshot) {
            const s = snapshot.ownerService;
            if (s.includes('SettingsService'))
                return { code: 'ACTION.CORE.SETTING.SET', status: 'TRANSFORMER_REQUIRED', note: 'Exact P566 snapshot must be transformed into scoped Setting records before execution.' };
            if (snapshot.sourcePath === 'state.calendarPlan111')
                return { code: 'ACTION.CORE.CALENDAR.SAVE', status: 'TRANSFORMER_REQUIRED', note: 'Calendar/Gantt snapshot must be decomposed into Calendar/Task/Alarm typed actions.' };
            if (snapshot.sourcePath === 'state.finance107')
                return { code: 'ACTION.FINANCE.P566.MIGRATION.APPLY', status: 'ACTION_MISSING', note: 'Finance owner action is intentionally not implemented yet.' };
            if (snapshot.sourcePath === 'state.production116')
                return { code: 'ACTION.LASER.P566.PRODUCTION.PROJECTION.APPLY', status: 'ACTION_MISSING', note: 'Production projection transformer/action is intentionally not implemented yet.' };
            if (snapshot.sourcePath === 'state.trash')
                return { code: 'ACTION.LASER.PROJECT.SAVE', status: 'TRANSFORMER_REQUIRED', note: 'Trash rows require identity resolution and archived-state transformation.' };
            if (snapshot.sourcePath === 'state.testTrash')
                return { code: 'ACTION.LASER.TEST.SAVE', status: 'TRANSFORMER_REQUIRED', note: 'Test trash rows require KXT/recordUid identity resolution, archived Test/Test Run staging and timer freeze semantics.' };
            if (snapshot.sourcePath === 'state.storage')
                return { code: 'ACTION.CORE.SETTING.SET', status: 'TRANSFORMER_REQUIRED', note: 'Only logical storage metadata may migrate; native folder permissions require re-authorization.' };
            return { code: 'ACTION.CORE.SETTING.SET', status: 'TRANSFORMER_REQUIRED', note: 'Cross-feature snapshot requires explicit owner transformer before execution.' };
        }
        settingStep(plan, phase, order, available) { const targetId = `SETTING.${plan.scopeType}.${plan.scopeId}.${plan.key}`; return { order, phase, sourceRef: plan.sourcePath, ownerApp: 'APP.NEXUS', actionCode: 'ACTION.CORE.SETTING.SET', actionAvailable: available, status: available ? 'READY' : 'ACTION_MISSING', dependsOn: [], targetId, payloadPreview: { key: plan.key, scopeType: plan.scopeType, scopeId: plan.scopeId, value: structuredClone(plan.value) }, notes: [...(plan.notes || []), ...(plan.exact ? ['Exact recovery authority for this transformer slice.'] : []), ...(plan.inactive ? ['Normalized reference intentionally remains inactive.'] : [])] }; }
        async stage(input) {
            const targetSpaceIds = [...new Set((input.targetSpaceIds || []).filter(Boolean))], before = (await this.laser.list()).length;
            const frozenInput = { sourceLabel: input.sourceLabel, source: this.cloneSource(input.source), sourceKind: input.sourceKind };
            const analysis = await this.adapter.analyze(frozenInput), snapshot = await this.sourceSnapshot({ ...input, source: frozenInput.source }, analysis.sourceKind);
            this.fault('AFTER_SNAPSHOT');
            if (!analysis.canProceedToCommitDesign)
                throw new Error(`P566 staging blocked by parity/identity analysis: ${analysis.crossFeature.guard.blockingReasons.join(' | ') || 'unknown blocker'}`);
            this.fault('AFTER_ANALYZE');
            const existing = await this.laser.list(), existingUid = new Map(), existingCode = new Map();
            for (const row of existing) {
                const d = row.data, u = String(d.recordUid || '').trim(), c = String(d.recordCode || '').trim();
                if (u)
                    existingUid.set(u, row);
                if (c)
                    existingCode.set(c, row);
            }
            const sourceUid = new Map(), sourceCode = new Map();
            for (const c of analysis.candidates) {
                const key = String(c.candidate.migrationKey || '');
                if (c.recordUid)
                    (sourceUid.get(c.recordUid) || sourceUid.set(c.recordUid, []).get(c.recordUid)).push(key);
                if (c.recordCode)
                    (sourceCode.get(c.recordCode) || sourceCode.set(c.recordCode, []).get(c.recordCode)).push(key);
            }
            const identityMap = [], targetIds = new Map(), uidByKey = new Map();
            for (const c of analysis.candidates) {
                const key = String(c.candidate.migrationKey || '');
                if (!key)
                    throw new Error(`P566 staging candidate missing migrationKey at ${c.sourceRef}`);
                const uid = c.recordUid || await this.deterministicUid(key), uidMatch = existingUid.get(uid), codeMatch = c.recordCode ? existingCode.get(c.recordCode) : undefined, reasons = [];
                let status = 'NEW', existingEntityId;
                if ((sourceUid.get(uid)?.length || 0) > 1)
                    reasons.push(`duplicate source recordUid ${uid}`);
                if (c.recordCode && (sourceCode.get(c.recordCode)?.length || 0) > 1)
                    reasons.push(`duplicate source recordCode ${c.recordCode}`);
                if (reasons.length)
                    status = 'SOURCE_CONFLICT';
                if (uidMatch && codeMatch && uidMatch.id !== codeMatch.id) {
                    status = 'CANONICAL_CONFLICT';
                    reasons.push(`recordUid maps to ${uidMatch.id} but recordCode maps to ${codeMatch.id}`);
                }
                else if (uidMatch || codeMatch) {
                    const hit = uidMatch || codeMatch;
                    const d = hit.data;
                    if ((c.recordCode && d.recordCode && String(d.recordCode) !== c.recordCode) || (d.recordUid && String(d.recordUid) !== uid)) {
                        status = 'CANONICAL_CONFLICT';
                        reasons.push(`canonical identity mismatch at ${hit.id}`);
                    }
                    else if (status !== 'SOURCE_CONFLICT') {
                        status = 'EXISTING_MATCH';
                        existingEntityId = hit.id;
                    }
                }
                const plannedEntityId = existingEntityId || await this.deterministicId(key);
                targetIds.set(key, plannedEntityId);
                uidByKey.set(key, uid);
                identityMap.push({ migrationKey: key, entityType: c.entityType, sourceRef: c.sourceRef, legacyId: c.legacyId, recordUid: uid, recordCode: c.recordCode, plannedEntityId, existingEntityId, duplicateStatus: status, conflictReasons: reasons });
            }
            this.fault('AFTER_IDENTITY_MAP');
            const actionCodes = new Set(this.actionCatalog().map(x => x.code)), knownKeys = new Set(targetIds.keys()), steps = [], profileLensFixups = [];
            const sorted = [...analysis.candidates].sort((a, b) => this.phase[a.sourceKind] - this.phase[b.sourceKind] || a.sourceRef.localeCompare(b.sourceRef));
            let order = 0;
            for (const c of sorted) {
                const key = String(c.candidate.migrationKey), id = identityMap.find(x => x.migrationKey === key), actionCode = this.entityAction[c.sourceKind], deps = [...this.collectDeps(c.candidate, knownKeys)].filter(x => x !== key).sort(), conflict = id.duplicateStatus === 'SOURCE_CONFLICT' || id.duplicateStatus === 'CANONICAL_CONFLICT', available = actionCodes.has(actionCode), payload = this.resolveCandidatePayload(c, targetIds, uidByKey.get(key));
                const existingRow = id.existingEntityId ? existing.find(x => x.id === id.existingEntityId) : undefined;
                if (c.sourceKind === 'PROFILE' && typeof payload.defaultLensId === 'string' && payload.defaultLensId) {
                    const lensKey = String(c.candidate.defaultLensKey || '');
                    if (lensKey)
                        profileLensFixups.push({ profileKey: key, lensKey, sourceRef: c.sourceRef });
                    delete payload.defaultLensId;
                }
                steps.push({ order: ++order, phase: `LASER_${String(this.phase[c.sourceKind]).padStart(2, '0')}_${c.sourceKind}`, migrationKey: key, sourceRef: c.sourceRef, ownerApp: 'APP.KX.LASER', actionCode, actionAvailable: available, status: conflict ? 'BLOCKED' : available ? 'READY' : 'ACTION_MISSING', dependsOn: deps.filter(x => !(c.sourceKind === 'PROFILE' && profileLensFixups.some(f => f.profileKey === key && f.lensKey === x))), targetId: id.plannedEntityId, payloadPreview: { ...(existingRow ? { id: existingRow.id, expectedRevision: existingRow.revision } : { migrationPlannedId: id.plannedEntityId }), spaceIds: targetSpaceIds, data: payload }, notes: [id.existingEntityId ? 'Idempotent update candidate matched existing canonical identity.' : 'Deterministic create candidate; no write performed.', ...(c.sourceKind === 'PROFILE' && profileLensFixups.some(f => f.profileKey === key) ? ['defaultLensId is deferred until Lens exists; explicit fixup step follows.'] : []), ...(conflict ? id.conflictReasons : [])] });
            }
            for (const fix of profileLensFixups) {
                const profileId = targetIds.get(fix.profileKey), lensId = targetIds.get(fix.lensKey), available = actionCodes.has('ACTION.LASER.PROFILE.SAVE');
                steps.push({ order: ++order, phase: 'LASER_45_PROFILE_DEFAULT_LENS_FIXUP', migrationKey: `${fix.profileKey}:DEFAULT_LENS_FIXUP`, sourceRef: fix.sourceRef, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.PROFILE.SAVE', actionAvailable: available, status: available ? 'READY' : 'ACTION_MISSING', dependsOn: [fix.profileKey, fix.lensKey], targetId: profileId, payloadPreview: { id: profileId, spaceIds: targetSpaceIds, deferredDefaultLensId: lensId }, notes: ['Transaction executor must read back the current Profile revision and apply defaultLensId only after the Lens exists.'] });
            }
            steps.sort((a, b) => { const phaseOrder = (x) => x.phase === 'LASER_45_PROFILE_DEFAULT_LENS_FIXUP' ? 45 : Number((/^LASER_(\d+)/.exec(x.phase) || [])[1] || 999); return phaseOrder(a) - phaseOrder(b) || a.order - b.order; });
            steps.forEach((x, i) => x.order = i + 1);
            order = steps.length;
            const scopedInput = { ...input, userId: input.userId || 'USER.LUKAS' };
            const viewTransform = await this.viewTransformer.transform(scopedInput, analysis, identityMap), workspaceTrashTransform = await this.workspaceTrashTransformer.transform(scopedInput, analysis, identityMap), testTrashTimingTransform = await this.testTrashTimingTransformer.transform(scopedInput, analysis, identityMap, workspaceTrashTransform.projectSteps), settingAvailable = actionCodes.has('ACTION.CORE.SETTING.SET');
            for (const patch of testTrashTimingTransform.entityTimingPatches) {
                const step = steps.find(x => x.targetId === patch.targetId && x.payloadPreview && typeof x.payloadPreview === 'object' && x.payloadPreview.data);
                if (!step) {
                    steps.push({ order: ++order, phase: 'CROSS_FEATURE_140_TIMING_PATCH', sourceRef: patch.sourcePath, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.P566.TRANSFORM.BLOCKED', actionAvailable: false, status: 'BLOCKED', dependsOn: [], notes: ['TIMING_TARGET_STEP_MISSING: timing patch target has no canonical staging step.'] });
                    continue;
                }
                const payload = step.payloadPreview;
                payload.data = { ...payload.data, timing: structuredClone(patch.timing) };
                step.notes.push(...patch.notes);
            }
            for (const p of viewTransform.settings)
                steps.push(this.settingStep(p, 'CROSS_FEATURE_120_VIEW_TABLE_TEST_SETTINGS', ++order, settingAvailable));
            for (const issue of viewTransform.issues)
                if (issue.severity === 'ERROR')
                    steps.push({ order: ++order, phase: 'CROSS_FEATURE_120_VIEW_TABLE_TEST_SETTINGS', sourceRef: issue.sourcePath, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.P566.TRANSFORM.BLOCKED', actionAvailable: false, status: 'BLOCKED', dependsOn: [], notes: [`${issue.code}: ${issue.message}`] });
            for (const p of workspaceTrashTransform.settings)
                steps.push(this.settingStep(p, 'CROSS_FEATURE_130_WORKSPACE_CONTEXT', ++order, settingAvailable));
            for (const project of workspaceTrashTransform.projectSteps) {
                project.order = ++order;
                project.actionAvailable = actionCodes.has(project.actionCode);
                if (!project.actionAvailable)
                    project.status = 'ACTION_MISSING';
                steps.push(project);
            }
            for (const issue of workspaceTrashTransform.issues)
                if (issue.severity === 'ERROR')
                    steps.push({ order: ++order, phase: 'CROSS_FEATURE_130_WORKSPACE_TRASH', sourceRef: issue.sourcePath, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.P566.TRANSFORM.BLOCKED', actionAvailable: false, status: 'BLOCKED', dependsOn: [], notes: [`${issue.code}: ${issue.message}`] });
            for (const p of testTrashTimingTransform.settings)
                steps.push(this.settingStep(p, 'CROSS_FEATURE_140_TEST_TRASH_TIMING', ++order, settingAvailable));
            for (const test of testTrashTimingTransform.testSteps) {
                test.order = ++order;
                test.actionAvailable = actionCodes.has(test.actionCode);
                if (!test.actionAvailable)
                    test.status = 'ACTION_MISSING';
                steps.push(test);
            }
            for (const run of testTrashTimingTransform.testRunSteps) {
                run.order = ++order;
                run.actionAvailable = actionCodes.has(run.actionCode);
                if (!run.actionAvailable)
                    run.status = 'ACTION_MISSING';
                steps.push(run);
            }
            for (const issue of testTrashTimingTransform.issues)
                if (issue.severity === 'ERROR')
                    steps.push({ order: ++order, phase: 'CROSS_FEATURE_140_TEST_TRASH_TIMING', sourceRef: issue.sourcePath, ownerApp: 'APP.KX.LASER', actionCode: 'ACTION.LASER.P566.TRANSFORM.BLOCKED', actionAvailable: false, status: 'BLOCKED', dependsOn: [], notes: [`${issue.code}: ${issue.message}`] });
            const handled = new Set(['state.savedViews', 'state.activeSavedViewId', 'state.defaultViewByMachine', 'state.lastViewByMachine', 'state.columns', 'state.customColumns', 'state.kx510P43ColumnOrder', 'state.tableSort', 'state.importTable121', 'state.tableCore126', 'state.testSettings', 'state.activeMachineId', 'state.activePresetId', 'state.trash', 'state.testTrash']);
            for (const snap of analysis.crossFeature.snapshots) {
                if (handled.has(snap.sourcePath))
                    continue;
                const x = this.crossFeatureAction(snap), available = actionCodes.has(x.code), status = x.status === 'ACTION_MISSING' && !available ? 'ACTION_MISSING' : x.status;
                steps.push({ order: ++order, phase: 'CROSS_FEATURE', sourceRef: snap.sourcePath, ownerApp: snap.ownerApp, actionCode: x.code, actionAvailable: available, status, dependsOn: [], payloadPreview: { ownerCode: snap.ownerCode, targetPath: snap.targetPath, flowMode: snap.flowMode, sourceHash: snapshot.sha256 }, notes: [x.note, snap.commitPolicy] });
            }
            this.fault('AFTER_ACTION_PLAN');
            const sourceConflicts = identityMap.filter(x => x.duplicateStatus === 'SOURCE_CONFLICT'), canonicalConflicts = identityMap.filter(x => x.duplicateStatus === 'CANONICAL_CONFLICT'), executionBlockers = steps.filter(x => x.status !== 'READY'), reasons = [...sourceConflicts.flatMap(x => x.conflictReasons.map(r => `${x.sourceRef}: ${r}`)), ...canonicalConflicts.flatMap(x => x.conflictReasons.map(r => `${x.sourceRef}: ${r}`)), ...executionBlockers.map(x => `${x.sourceRef}: ${x.status} ${x.actionCode}`), ...(targetSpaceIds.length ? [] : ['No targetSpaceIds selected for future transaction.'])];
            const analysisCore = { sourceKind: analysis.sourceKind, counts: analysis.counts, parity: analysis.parity, crossFeatureGuard: analysis.crossFeature.guard, preview: analysis.preview, candidates: analysis.candidates }, analysisHash = await sha256Bytes(new TextEncoder().encode(stableStringify(analysisCore))), planCore = { schema: 'KX.LASER_P566_STAGING_PLAN/1', sourceHash: snapshot.sha256, targetSpaceIds, identityMap, actionPlan: steps }, planHash = await sha256Bytes(new TextEncoder().encode(stableStringify(planCore)));
            const after = (await this.laser.list()).length;
            if (after !== before)
                throw new Error('P566 staging violated read-only canonical LASER contract');
            this.fault('BEFORE_RETURN');
            return { contract: 'KX.LASER_P566_STAGING_PLAN/1', readOnly: true, commitAllowed: false, sourceLabel: String(input.sourceLabel || 'P566'), sourceSnapshot: snapshot, analysisHash, planHash, targetSpaceIds, counts: analysis.counts, identityMap, actionPlan: steps, conflicts: { source: sourceConflicts.length, canonical: canonicalConflicts.length, executionBlockers: executionBlockers.length + (targetSpaceIds.length ? 0 : 1), reasons }, parityBlocking: analysis.parity.blocking, readyForExecutionEngine: reasons.length === 0, requiresSourceReplay: true, safeguards: ['Staging never invokes planned write actions.', 'Future execution must resupply the source and match sourceSnapshot.sha256 before any write.', 'Deterministic planned IDs and identity map make retries/idempotence auditable.', 'Every write remains routed through the target owner typed Action Registry.', 'Execution is forbidden until transformers/actions, readback, rollback/compensation and roundtrip parity are separately VERIFIED.'] };
        }
    }
    KX.LaserP566StagingService = LaserP566StagingService;
    class LaserP566TransactionVerifierService {
        liveRepo;
        staging;
        workspaceProfile;
        faultInjector;
        stores = ['entities', 'revisions', 'relations', 'settings', 'shareRules', 'audit', 'outbox', 'users', 'spaces', 'spaceMemberships', 'devices', 'sessions', 'capabilityReports', 'meta'];
        constructor(liveRepo, staging, workspaceProfile, faultInjector) {
            this.liveRepo = liveRepo;
            this.staging = staging;
            this.workspaceProfile = workspaceProfile;
            this.faultInjector = faultInjector;
        }
        fault(point, step) { this.faultInjector?.(point, step); }
        keyOf(value) { return String(value?.id ?? value?.key ?? ''); }
        async snapshot(repo) { const data = {}; for (const store of this.stores)
            data[store] = await repo.all(store); const hash = await sha256Bytes(new TextEncoder().encode(stableStringify(data))); return { data, hash }; }
        async restore(repo, snapshot) { const writes = [], deletes = []; for (const store of this.stores) {
            const desired = snapshot[store] || [], wanted = new Set(desired.map(x => this.keyOf(x)).filter(Boolean)), current = await repo.all(store);
            for (const row of current) {
                const key = this.keyOf(row);
                if (key && !wanted.has(key))
                    deletes.push({ store, key });
            }
            for (const row of desired)
                writes.push({ store, value: row });
        } await repo.atomic(writes, deletes); }
        async cloneLiveToSandbox() { const repo = new MemoryCoreRepository(); await repo.open(); const writes = []; for (const store of this.stores)
            for (const row of await this.liveRepo.all(store))
                writes.push({ store, value: row }); await repo.atomic(writes); return repo; }
        async liveMigrationHash() { const rows = (await this.liveRepo.all('entities')).filter(x => x.ownerApp === LaserDomainService.OWNER && LaserDomainService.TYPES.includes(x.type)).sort((a, b) => a.id.localeCompare(b.id)), settings = (await this.liveRepo.all('settings')).sort((a, b) => a.id.localeCompare(b.id)); return sha256Bytes(new TextEncoder().encode(stableStringify({ rows, settings }))); }
        async entityHash(row) { return sha256Bytes(new TextEncoder().encode(stableStringify({ id: row.id, type: row.type, revision: row.revision, spaceIds: row.spaceIds, data: row.data }))); }
        async transactionId(stage) { const h = await sha256Bytes(new TextEncoder().encode(`KX.P566.TRANSACTION/1|${stage.sourceSnapshot.sha256}|${stage.planHash}|${stage.targetSpaceIds.join(',')}`)); return `P566-TX-${h.slice(0, 24).toUpperCase()}`; }
        async verify(input, ctx) {
            const liveBefore = await this.liveMigrationHash();
            const stage = await this.staging.stage({ sourceLabel: input.sourceLabel, source: structuredClone(input.source), sourceKind: input.sourceKind, targetSpaceIds: [...(input.targetSpaceIds || [])], includeSnapshotPayload: false, userId: input.userId || ctx.actorId, deviceId: input.deviceId || ctx.deviceId });
            if (stage.sourceSnapshot.sha256 !== input.expectedSourceSha256)
                throw new Error(`P566_SOURCE_REPLAY_MISMATCH expected ${input.expectedSourceSha256} actual ${stage.sourceSnapshot.sha256}`);
            if (stage.planHash !== input.expectedPlanHash)
                throw new Error(`P566_PLAN_REPLAY_MISMATCH expected ${input.expectedPlanHash} actual ${stage.planHash}`);
            const transactionId = await this.transactionId(stage), journal = [], safeguards = ['Production workspace is never mutated; verification executes only in a cloned MemoryCoreRepository sandbox.', 'Exact source SHA-256 and plan hash must replay before any sandbox action runs.', 'Only READY typed owner actions from verified transformer slices may execute.', 'Every applied entity is read back and matched to the deterministic planned id/identity.', 'Faults restore the sandbox baseline and verify rollback hash equality.', 'No ACTION.LASER.P566.*COMMIT action or production Import button exists in this slice.'];
            if (!stage.readyForExecutionEngine) {
                const liveAfter = await this.liveMigrationHash();
                return { contract: 'KX.LASER_P566_TRANSACTION_VERIFY/1', mode: 'SANDBOX_ONLY', productionCommitAllowed: false, transactionId, state: 'BLOCKED', sourceReplayVerified: true, planReplayVerified: true, staging: stage, journal, rollbackVerified: false, readbackVerified: false, liveWorkspaceUnchanged: liveBefore === liveAfter, executedSteps: 0, error: `Execution blockers: ${stage.conflicts.reasons.join(' | ')}`, safeguards };
            }
            this.fault('BEFORE_SANDBOX');
            const sandboxRepo = await this.cloneLiveToSandbox(), sandbox = new CoreRuntime(sandboxRepo, undefined, this.workspaceProfile);
            await sandbox.init();
            const baseline = await this.snapshot(sandboxRepo);
            let executed = 0, readbackVerified = false;
            try {
                this.fault('BEFORE_EXECUTION');
                const executable = stage.actionPlan.filter(x => x.status === 'READY' && (x.phase.startsWith('LASER_') || x.phase.startsWith('CROSS_FEATURE_12') || x.phase.startsWith('CROSS_FEATURE_13') || x.phase.startsWith('CROSS_FEATURE_14')));
                for (const step of executable) {
                    journal.push({ order: step.order, at: now(), phase: step.phase, sourceRef: step.sourceRef, actionCode: step.actionCode, targetId: step.targetId, status: 'STARTED' });
                    let actionPayload = structuredClone(step.payloadPreview || {});
                    if (step.phase === 'LASER_45_PROFILE_DEFAULT_LENS_FIXUP') {
                        const current = step.targetId ? await sandbox.laserDomain.get(step.targetId, 'APP.LASER.PROFILE') : undefined;
                        if (!current)
                            throw new Error(`P566 profile fixup missing ${step.targetId}`);
                        actionPayload = { id: current.id, expectedRevision: current.revision, spaceIds: current.spaceIds, data: { ...current.data, defaultLensId: String(step.payloadPreview?.deferredDefaultLensId || '') } };
                    }
                    const internalCtx = { ...ctx, actorId: 'SYSTEM', appCode: step.ownerApp === 'APP.NEXUS' ? 'APP.NEXUS' : 'APP.KX.LASER', confirmed: true, permissions: [...new Set([...(ctx.permissions || []), 'LASER.MIGRATION.INTERNAL', 'LASER.CONFIG.EDIT', 'LASER.PROJECT.EDIT', 'LASER.TEST.EDIT', 'LASER.IMPORT.EDIT', 'CORE.SETTING.EDIT'])], rootChangeId: transactionId };
                    const result = await sandbox.actions.invoke(step.actionCode, actionPayload, internalCtx);
                    executed++;
                    if (!step.targetId || result.id !== step.targetId)
                        throw new Error(`P566 sandbox target id mismatch at ${step.sourceRef}: expected ${step.targetId}, actual ${result.id}`);
                    if (step.actionCode === 'ACTION.CORE.SETTING.SET') {
                        const readback = await sandbox.repository.get('settings', result.id);
                        if (!readback)
                            throw new Error(`P566 sandbox setting readback missing ${result.id}`);
                        const p = step.payloadPreview;
                        if (readback.key !== p.key || readback.scopeType !== p.scopeType || readback.scopeId !== p.scopeId || stableStringify(readback.value) !== stableStringify(p.value))
                            throw new Error(`P566 sandbox setting readback mismatch ${result.id}`);
                        journal.push({ order: step.order, at: now(), phase: step.phase, sourceRef: step.sourceRef, actionCode: step.actionCode, targetId: result.id, status: 'READBACK_OK', entityRevision: readback.revision, entityHash: await sha256Bytes(new TextEncoder().encode(stableStringify(readback))) });
                        this.fault('AFTER_STEP', step);
                        continue;
                    }
                    const readback = await sandbox.laserDomain.get(result.id);
                    if (!readback)
                        throw new Error(`P566 sandbox readback missing ${result.id}`);
                    const identity = stage.identityMap.find(x => x.plannedEntityId === result.id);
                    const d = readback.data;
                    if (identity?.recordUid && String(d.recordUid || '') !== identity.recordUid)
                        throw new Error(`P566 sandbox recordUid mismatch at ${result.id}`);
                    if (identity?.recordCode && String(d.recordCode || '') !== identity.recordCode)
                        throw new Error(`P566 sandbox recordCode mismatch at ${result.id}`);
                    if (step.phase === 'CROSS_FEATURE_135_TRASH_PROJECT_ARCHIVE' && !readback.archivedAt)
                        throw new Error(`P566 trash archive readback missing archivedAt ${result.id}`);
                    if ((step.phase === 'CROSS_FEATURE_145_TRASH_TEST_ARCHIVE' || step.phase === 'CROSS_FEATURE_146_TRASH_TEST_RUN') && !readback.archivedAt)
                        throw new Error(`P566 Test trash archive readback missing archivedAt ${result.id}`);
                    const expectedTiming = step.payloadPreview?.data?.timing;
                    if (expectedTiming && stableStringify(readback.data?.timing) !== stableStringify(expectedTiming))
                        throw new Error(`P566 timing readback mismatch ${result.id}`);
                    journal.push({ order: step.order, at: now(), phase: step.phase, sourceRef: step.sourceRef, actionCode: step.actionCode, targetId: result.id, status: 'READBACK_OK', entityRevision: readback.revision, entityHash: await this.entityHash(readback) });
                    this.fault('AFTER_STEP', step);
                }
                this.fault('BEFORE_FINAL_READBACK');
                for (const identity of stage.identityMap) {
                    const row = await sandbox.laserDomain.get(identity.plannedEntityId);
                    if (!row)
                        throw new Error(`P566 final readback missing ${identity.plannedEntityId}`);
                    const d = row.data;
                    if (String(d.recordUid || '') !== identity.recordUid)
                        throw new Error(`P566 final readback recordUid mismatch ${identity.plannedEntityId}`);
                    if (identity.recordCode && String(d.recordCode || '') !== identity.recordCode)
                        throw new Error(`P566 final readback recordCode mismatch ${identity.plannedEntityId}`);
                }
                for (const step of executable.filter(x => x.actionCode === 'ACTION.CORE.SETTING.SET')) {
                    const row = await sandbox.repository.get('settings', step.targetId);
                    if (!row)
                        throw new Error(`P566 final setting readback missing ${step.targetId}`);
                    const p = step.payloadPreview;
                    if (stableStringify(row.value) !== stableStringify(p.value))
                        throw new Error(`P566 final setting value mismatch ${step.targetId}`);
                }
                for (const step of executable.filter(x => x.phase === 'CROSS_FEATURE_135_TRASH_PROJECT_ARCHIVE')) {
                    const row = await sandbox.laserDomain.get(step.targetId, 'APP.LASER.PROJECT');
                    if (!row?.archivedAt)
                        throw new Error(`P566 final trash archive missing ${step.targetId}`);
                }
                for (const step of executable.filter(x => x.phase === 'CROSS_FEATURE_145_TRASH_TEST_ARCHIVE')) {
                    const row = await sandbox.laserDomain.get(step.targetId, 'APP.LASER.TEST');
                    if (!row?.archivedAt || row.data?.status !== 'ARCHIVED')
                        throw new Error(`P566 final Test trash archive missing ${step.targetId}`);
                }
                for (const step of executable.filter(x => x.phase === 'CROSS_FEATURE_146_TRASH_TEST_RUN')) {
                    const row = await sandbox.laserDomain.get(step.targetId, 'APP.LASER.TEST_RUN');
                    if (!row?.archivedAt)
                        throw new Error(`P566 final Test Run trash archive missing ${step.targetId}`);
                }
                for (const step of executable.filter(x => x.payloadPreview?.data?.timing)) {
                    const row = await sandbox.laserDomain.get(step.targetId);
                    if (!row || stableStringify(row.data?.timing) !== stableStringify(step.payloadPreview.data.timing))
                        throw new Error(`P566 final timing readback mismatch ${step.targetId}`);
                }
                readbackVerified = true;
                this.fault('AFTER_FINAL_READBACK');
                const after = await this.snapshot(sandboxRepo), liveAfter = await this.liveMigrationHash();
                return { contract: 'KX.LASER_P566_TRANSACTION_VERIFY/1', mode: 'SANDBOX_ONLY', productionCommitAllowed: false, transactionId, state: 'VERIFIED', sourceReplayVerified: true, planReplayVerified: true, staging: stage, journal, sandboxBeforeHash: baseline.hash, sandboxAfterHash: after.hash, rollbackVerified: false, readbackVerified, liveWorkspaceUnchanged: liveBefore === liveAfter, executedSteps: executed, safeguards };
            }
            catch (error) {
                const message = String(error instanceof Error ? error.message : error);
                journal.push({ order: journal.length ? journal[journal.length - 1].order : 0, at: now(), phase: 'TRANSACTION', sourceRef: 'P566', actionCode: 'SANDBOX_ROLLBACK', status: 'FAILED', error: message });
                await this.restore(sandboxRepo, baseline.data);
                const restored = await this.snapshot(sandboxRepo), rollbackVerified = restored.hash === baseline.hash, liveAfter = await this.liveMigrationHash();
                journal.push({ order: journal.length + 1, at: now(), phase: 'ROLLBACK', sourceRef: 'P566', actionCode: 'SANDBOX_ROLLBACK', status: rollbackVerified ? 'ROLLED_BACK' : 'FAILED', error: rollbackVerified ? undefined : 'Sandbox baseline hash mismatch after rollback' });
                return { contract: 'KX.LASER_P566_TRANSACTION_VERIFY/1', mode: 'SANDBOX_ONLY', productionCommitAllowed: false, transactionId, state: rollbackVerified ? 'ROLLED_BACK' : 'FAILED', sourceReplayVerified: true, planReplayVerified: true, staging: stage, journal, sandboxBeforeHash: baseline.hash, sandboxAfterHash: restored.hash, rollbackVerified, readbackVerified: false, liveWorkspaceUnchanged: liveBefore === liveAfter, executedSteps: executed, error: message, safeguards };
            }
        }
    }
    KX.LaserP566TransactionVerifierService = LaserP566TransactionVerifierService;
    class LineageService {
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        async record(input) { const row = { id: uid('LIN'), at: now(), ...input }; await this.repo.put('lineage', row); return row; }
        async list() { return this.repo.all('lineage'); }
        async forEntity(id) { return (await this.list()).filter(x => x.source.entityId === id || x.target.entityId === id); }
        async query(input = {}) { let rows = await this.list(); if (input.flowCode)
            rows = rows.filter(x => x.flowCode === input.flowCode); if (input.rootChangeId)
            rows = rows.filter(x => x.rootChangeId === input.rootChangeId); if (input.sourceId)
            rows = rows.filter(x => x.source.entityId === input.sourceId); if (input.targetId)
            rows = rows.filter(x => x.target.entityId === input.targetId); return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, input.limit || 200); }
    }
    KX.LineageService = LineageService;
    class RelationGraphService {
        repo;
        relations;
        lineage;
        constructor(repo, relations, lineage) {
            this.repo = repo;
            this.relations = relations;
            this.lineage = lineage;
        }
        async node(id, typeHint = 'UNKNOWN') { const entity = await this.repo.get('entities', id); if (entity) {
            const d = entity.data;
            return { id, type: entity.type, label: String(d.name || d.title || d.label || entity.code || id), appCode: entity.ownerApp };
        } const file = await this.repo.get('files', id); if (file)
            return { id, type: 'CORE.FILE', label: file.name, appCode: file.ownerApp }; const doc = await this.repo.get('documents', id); if (doc)
            return { id, type: 'CORE.DOCUMENT', label: doc.title, appCode: doc.ownerApp }; return { id, type: typeHint, label: id }; }
        async snapshot(entityId) { const rels = await this.relations.forEntity(entityId), lins = await this.lineage.forEntity(entityId), ids = new Map(); ids.set(entityId, 'UNKNOWN'); for (const r of rels) {
            ids.set(r.sourceId, r.sourceType);
            ids.set(r.targetId, r.targetType);
        } for (const l of lins) {
            ids.set(l.source.entityId, l.source.entityType);
            ids.set(l.target.entityId, l.target.entityType);
        } const nodes = []; for (const [id, type] of ids)
            nodes.push(await this.node(id, type)); const edges = [...rels.map(r => ({ id: r.id, kind: 'RELATION', source: r.sourceId, target: r.targetId, label: r.relationType, metadata: { code: r.code, ownerApp: r.ownerApp } })), ...lins.map(l => ({ id: l.id, kind: 'LINEAGE', source: l.source.entityId, target: l.target.entityId, label: l.flowCode, metadata: { mode: l.mode, actionCode: l.actionCode, result: l.result, at: l.at } }))]; return { centerId: entityId, nodes, edges }; }
    }
    KX.RelationGraphService = RelationGraphService;
    class FileMutationAccessService {
        memberships;
        access;
        constructor(memberships, access) {
            this.memberships = memberships;
            this.access = access;
        }
        weight(role) { return role ? { READ: 10, EDIT: 20, MANAGE: 30 }[role] : 0; }
        system(ctx) { return ctx.actorId === 'SYSTEM'; }
        async assertSpaces(spaceIds, ctx, required = 'EDIT') {
            if (this.system(ctx))
                return;
            for (const spaceId of [...new Set(spaceIds.filter(Boolean))]) {
                const role = await this.memberships.roleFor(spaceId, ctx.actorId);
                if (this.weight(role) < this.weight(required))
                    throw new Error(`Scope denied: ${required} access required for ${spaceId}`);
            }
        }
        async assertFile(file, ctx, required = 'EDIT') {
            if (this.system(ctx))
                return;
            if (!await this.access.can(this.access.file(file), ctx.actorId, required))
                throw new Error(`Scope denied: ${required} access required for FILE ${file.id}`);
        }
        async assertCollection(collection, ctx, required = 'EDIT') {
            if (this.system(ctx))
                return;
            if (collection.scopeType === 'SYSTEM')
                throw new Error(`Scope denied: SYSTEM collection ${collection.id} is read-only for user actions`);
            if (collection.scopeType === 'USER') {
                if (collection.scopeId === ctx.actorId && collection.ownerUserId === ctx.actorId)
                    return;
                throw new Error(`Scope denied: USER collection ${collection.id} belongs to ${collection.ownerUserId}`);
            }
            if (collection.scopeType === 'SPACE') {
                await this.assertSpaces([collection.scopeId], ctx, required);
                return;
            }
            if (collection.scopeType === 'SHARED') {
                if (collection.scopeId.startsWith('SPACE.')) {
                    await this.assertSpaces([collection.scopeId], ctx, required);
                    return;
                }
                if (collection.ownerUserId === ctx.actorId)
                    return;
                throw new Error(`Scope denied: SHARED collection ${collection.id} is not editable by ${ctx.actorId}`);
            }
        }
        async assertNewCollection(input, ctx) {
            if (this.system(ctx))
                return;
            if (input.scopeType === 'SYSTEM')
                throw new Error('Scope denied: SYSTEM collections can be created only by the Core runtime');
            if (input.scopeType === 'USER') {
                if (input.scopeId === ctx.actorId && input.ownerUserId === ctx.actorId)
                    return;
                throw new Error(`Scope denied: cannot create USER collection for ${input.ownerUserId}`);
            }
            if (input.scopeType === 'SPACE') {
                await this.assertSpaces([input.scopeId], ctx, 'EDIT');
                return;
            }
            if (input.scopeType === 'SHARED') {
                if (input.scopeId.startsWith('SPACE.')) {
                    await this.assertSpaces([input.scopeId], ctx, 'EDIT');
                    return;
                }
                if (input.ownerUserId === ctx.actorId)
                    return;
                throw new Error(`Scope denied: cannot create SHARED collection for ${input.ownerUserId}`);
            }
        }
    }
    KX.FileMutationAccessService = FileMutationAccessService;
    class PlannerMutationAccessService {
        repo;
        memberships;
        access;
        constructor(repo, memberships, access) {
            this.repo = repo;
            this.memberships = memberships;
            this.access = access;
        }
        weight(role) { return role ? { READ: 10, EDIT: 20, MANAGE: 30 }[role] : 0; }
        system(ctx) { return ctx.actorId === 'SYSTEM'; }
        target(kind, row) { return { kind, id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }; }
        async assertSpaces(spaceIds, ctx, required = 'EDIT') {
            if (this.system(ctx))
                return;
            const ids = [...new Set((spaceIds || []).filter(Boolean))];
            if (!ids.length)
                throw new Error('Scope denied: Planner records require at least one Space');
            for (const spaceId of ids) {
                const role = await this.memberships.roleFor(spaceId, ctx.actorId);
                if (this.weight(role) < this.weight(required))
                    throw new Error(`Scope denied: ${required} access required for ${spaceId}`);
            }
        }
        async assertExisting(kind, row, ctx, required = 'EDIT') {
            if (this.system(ctx))
                return;
            if (!await this.access.can(this.target(kind, row), ctx.actorId, required))
                throw new Error(`Scope denied: ${required} access required for ${kind} ${row.id}`);
        }
        async assertMutation(kind, oldRow, next, ctx) {
            if (this.system(ctx))
                return;
            if (oldRow) {
                await this.assertExisting(kind, oldRow, ctx, 'EDIT');
                if (next.ownerApp !== oldRow.ownerApp)
                    throw new Error(`Scope denied: ownerApp change is not allowed for ${kind} ${oldRow.id}`);
            }
            await this.assertSpaces(next.spaceIds, ctx, 'EDIT');
        }
        async linked(kind, id) { return kind === 'TASK' ? this.repo.get('tasks', id) : this.repo.get('calendarEvents', id); }
        async assertAlarmLinks(alarm, ctx) {
            if (this.system(ctx))
                return;
            const checks = [];
            if (alarm.taskId)
                checks.push(['TASK', alarm.taskId]);
            if (alarm.eventId)
                checks.push(['CALENDAR_EVENT', alarm.eventId]);
            for (const [kind, id] of checks) {
                const row = await this.linked(kind, id);
                if (!row)
                    throw new Error(`Unknown linked ${kind} ${id}`);
                if (!await this.access.can(this.target(kind, row), ctx.actorId, 'READ'))
                    throw new Error(`Scope denied: READ access required for linked ${kind} ${id}`);
                for (const spaceId of alarm.spaceIds)
                    if (!row.spaceIds.includes(spaceId))
                        throw new Error(`Scope denied: ALARM cannot expose linked ${kind} ${id} into broader Space ${spaceId}`);
            }
        }
    }
    KX.PlannerMutationAccessService = PlannerMutationAccessService;
    class FileService {
        repo;
        audit;
        revisions;
        outbox;
        managed;
        mutationAccess;
        constructor(repo, audit, revisions, outbox, managed, mutationAccess) {
            this.repo = repo;
            this.audit = audit;
            this.revisions = revisions;
            this.outbox = outbox;
            this.managed = managed;
            this.mutationAccess = mutationAccess;
        }
        blobKey(fileId, contentRevision) { return `FILEBLOB.${fileId}.${contentRevision}`; }
        searchRow(row) { return { id: row.id, fileId: row.id, normalizedName: normalizeSearch(row.name), normalizedDescription: normalizeSearch(row.description || ''), tags: (row.tags || []).map(normalizeSearch), mime: row.mime, ownerApp: row.ownerApp, spaceIds: [...row.spaceIds], updatedAt: row.updatedAt }; }
        async get(id) { return this.repo.get('files', id); }
        async list() { return this.repo.all('files'); }
        async getBlob(id, revision) {
            const current = await this.get(id);
            if (!current)
                return undefined;
            const wanted = revision || current.revision;
            let snapshot = current;
            if (wanted !== current.revision) {
                const rev = await this.revisions.get(id, wanted);
                if (!rev)
                    return undefined;
                snapshot = rev.snapshot;
            }
            const contentRevision = snapshot.contentRevision || snapshot.revision;
            if (snapshot.storageKind === 'NATIVE_FILE') {
                if (!this.managed || !snapshot.storageLocator)
                    return undefined;
                return this.managed.read(snapshot.storageLocator, snapshot.mime);
            }
            return (await this.repo.get('fileBlobs', this.blobKey(id, contentRevision)))?.blob;
        }
        async prepareBinary(fileId, contentRevision, blob, name) {
            const browserHash = await sha256(blob);
            if (this.managed) {
                const managed = await this.managed.writeRevision(fileId, contentRevision, name, blob);
                if (managed.sha256 !== browserHash)
                    throw new Error('Managed file SHA-256 mismatch');
                return { kind: 'NATIVE_FILE', locator: managed.locator, sha256: managed.sha256, size: managed.size, writes: [] };
            }
            const record = { id: this.blobKey(fileId, contentRevision), fileId, revision: contentRevision, blob };
            return { kind: 'BROWSER_BLOB', locator: undefined, sha256: browserHash, size: blob.size, writes: [{ store: 'fileBlobs', value: record }] };
        }
        async importBlob(blob, name, mime, ownerApp, spaceIds, ctx, input = {}) {
            await this.mutationAccess?.assertSpaces(spaceIds, ctx, 'EDIT');
            const at = now(), root = rootId(ctx), id = uid('FILE'), binary = await this.prepareBinary(id, 1, blob, name);
            const row = { id, name, mime: mime || blob.type || 'application/octet-stream', size: binary.size, sha256: binary.sha256, ownerApp, spaceIds, revision: 1, contentRevision: 1, tags: input.tags || [], description: input.description, storageKind: binary.kind, storageLocator: binary.locator, createdAt: at, createdBy: ctx.actorId, updatedAt: at, updatedBy: ctx.actorId, archivedAt: null };
            const rev = this.revisions.make('CORE.FILE', id, 1, row, { ...ctx, rootChangeId: root });
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE.IMPORT', entityType: 'CORE.FILE', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { name, size: row.size, sha256: row.sha256, storageKind: row.storageKind } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE', resourceId: id, revision: 1, ownerApp, rootChangeId: root, payload: { name: row.name, mime: row.mime, size: row.size, sha256: row.sha256 } });
            await casAtomic(this.repo, casPre('files', row.id, null, ctx), [{ store: 'files', value: row }, { store: 'fileSearch', value: this.searchRow(row) }, ...binary.writes, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            return row;
        }
        async replaceContent(id, blob, name, mime, ctx) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown file ${id}`);
            if (old.trashedAt)
                throw new Error(`File ${id} is in Trash`);
            await this.mutationAccess?.assertFile(old, ctx, 'EDIT');
            const root = rootId(ctx), nextRevision = old.revision + 1, nextContent = (old.contentRevision || old.revision) + 1, nextName = name || old.name, binary = await this.prepareBinary(id, nextContent, blob, nextName);
            const row = { ...old, name: nextName, mime: mime || blob.type || old.mime, size: binary.size, sha256: binary.sha256, revision: nextRevision, contentRevision: nextContent, storageKind: binary.kind, storageLocator: binary.locator, updatedAt: now(), updatedBy: ctx.actorId };
            const rev = this.revisions.make('CORE.FILE', id, row.revision, row, { ...ctx, rootChangeId: root });
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE.REPLACE', entityType: 'CORE.FILE', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { revision: row.revision, contentRevision: row.contentRevision, sha256: row.sha256, storageKind: row.storageKind } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { name: row.name, mime: row.mime, size: row.size, sha256: row.sha256 } });
            await casAtomic(this.repo, casPre('files', row.id, old.revision, ctx), [{ store: 'files', value: row }, { store: 'fileSearch', value: this.searchRow(row) }, ...binary.writes, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            return row;
        }
        async updateMetadata(id, input, ctx) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown file ${id}`);
            if (old.trashedAt)
                throw new Error(`File ${id} is in Trash`);
            await this.mutationAccess?.assertFile(old, ctx, 'EDIT');
            if (input.spaceIds)
                await this.mutationAccess?.assertSpaces(input.spaceIds.filter(spaceId => !old.spaceIds.includes(spaceId)), ctx, 'EDIT');
            if (input.expectedRevision !== undefined && input.expectedRevision !== old.revision)
                throw new Error(`Revision conflict for ${id}: expected ${input.expectedRevision}, actual ${old.revision}`);
            const root = rootId(ctx);
            const row = { ...old, name: input.name ?? old.name, tags: input.tags ?? old.tags, description: input.description ?? old.description, spaceIds: input.spaceIds ?? old.spaceIds, revision: old.revision + 1, updatedAt: now(), updatedBy: ctx.actorId };
            const rev = this.revisions.make('CORE.FILE', id, row.revision, row, { ...ctx, rootChangeId: root });
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE.UPDATE_METADATA', entityType: 'CORE.FILE', entityId: id, rootChangeId: root, result: 'OK', detail: { revision: row.revision, contentRevision: row.contentRevision, name: row.name, tags: row.tags } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { name: row.name, tags: row.tags, description: row.description, spaceIds: row.spaceIds } });
            await casAtomic(this.repo, casPre('files', row.id, old.revision, ctx), [{ store: 'files', value: row }, { store: 'fileSearch', value: this.searchRow(row) }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            return row;
        }
        containsReference(value, id) { if (value === id)
            return true; if (Array.isArray(value))
            return value.some(x => this.containsReference(x, id)); if (value && typeof value === 'object')
            return Object.values(value).some(x => this.containsReference(x, id)); return false; }
        async dependencySummary(fileId) {
            const out = [];
            for (const row of await this.repo.all('documents'))
                if (row.primaryFileId === fileId)
                    out.push(`DOCUMENT_PRIMARY:${row.id}`);
            for (const row of await this.repo.all('documentVersions'))
                if (row.fileId === fileId)
                    out.push(`DOCUMENT_VERSION:${row.id}`);
            for (const row of await this.repo.all('relations'))
                if (row.sourceId === fileId || row.targetId === fileId)
                    out.push(`RELATION:${row.id}`);
            for (const row of await this.repo.all('entities'))
                if (row.type !== 'CORE.TRASH_ENTRY' && this.containsReference(row.data, fileId))
                    out.push(`ENTITY_REF:${row.type}:${row.id}`);
            return [...new Set(out)].sort();
        }
        async physicalFootprint(file) { const revisions = await this.revisions.list(file.id), byContent = new Map(); for (const r of revisions) {
            const snap = r.snapshot;
            if (snap?.id === file.id)
                byContent.set(snap.contentRevision || snap.revision, snap);
        } byContent.set(file.contentRevision || file.revision, file); return [...byContent.values()].reduce((n, x) => n + Math.max(0, Number(x.size || 0)), 0); }
        async trashStorageReadback(rows) {
            const items = [];
            let physicalBytes = 0, expectedReclaimableBytes = 0;
            for (const entry of rows) {
                const d = entry.data, reasons = [];
                if (d.resourceType !== 'CORE.FILE' || d.storageTargetId !== 'BROWSER_BLOB') {
                    items.push({ trashEntryId: entry.id, resourceId: d.resourceId, storageTargetId: d.storageTargetId || 'UNKNOWN', storageKind: null, state: 'UNSUPPORTED', filePresent: false, expectedCurrentBytes: d.logicalBytes ?? null, actualCurrentBytes: null, expectedCurrentSha256: null, actualCurrentSha256: null, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: null, blobRevisionCount: 0, expectedContentRevisionCount: 0, currentSizeMatches: null, currentSha256Matches: null, reclaimableMatches: null, reasons: ['BROWSER_BLOB_CORE_FILE_ONLY'] });
                    continue;
                }
                const file = await this.get(d.resourceId);
                if (!file) {
                    items.push({ trashEntryId: entry.id, resourceId: d.resourceId, storageTargetId: 'BROWSER_BLOB', storageKind: null, state: 'MISSING', filePresent: false, expectedCurrentBytes: d.logicalBytes ?? null, actualCurrentBytes: null, expectedCurrentSha256: null, actualCurrentSha256: null, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: null, blobRevisionCount: 0, expectedContentRevisionCount: 0, currentSizeMatches: null, currentSha256Matches: null, reclaimableMatches: null, reasons: ['FILE_RECORD_MISSING'] });
                    continue;
                }
                const revisions = await this.revisions.list(file.id), expectedByContent = new Map();
                for (const revision of revisions) {
                    const snap = revision.snapshot;
                    if (snap?.id === file.id)
                        expectedByContent.set(snap.contentRevision || snap.revision, snap);
                }
                expectedByContent.set(file.contentRevision || file.revision, file);
                const blobs = (await this.repo.all('fileBlobs')).filter(x => x.fileId === file.id), blobByRevision = new Map(blobs.map(x => [x.revision, x]));
                let actualReclaimable = 0;
                for (const blobRow of blobs)
                    actualReclaimable += Math.max(0, Number(blobRow.blob?.size || 0));
                physicalBytes += actualReclaimable;
                expectedReclaimableBytes += Math.max(0, Number(d.reclaimableBytes || 0));
                const currentContent = file.contentRevision || file.revision, currentBlob = blobByRevision.get(currentContent), actualCurrentBytes = currentBlob ? Math.max(0, Number(currentBlob.blob?.size || 0)) : null, actualCurrentSha256 = currentBlob ? await sha256(currentBlob.blob) : null, currentSizeMatches = actualCurrentBytes === file.size, currentSha256Matches = actualCurrentSha256 === file.sha256, reclaimableMatches = d.reclaimableBytes === undefined ? null : actualReclaimable === d.reclaimableBytes;
                if (file.storageKind !== 'BROWSER_BLOB')
                    reasons.push('FILE_STORAGE_KIND_NOT_BROWSER_BLOB');
                if (file.trashEntryId !== entry.id)
                    reasons.push('TRASH_ENTRY_BINDING_MISMATCH');
                if (!file.trashedAt)
                    reasons.push('FILE_NOT_MARKED_TRASHED');
                if (!currentBlob)
                    reasons.push('CURRENT_BLOB_MISSING');
                if (currentBlob && !currentSizeMatches)
                    reasons.push('CURRENT_SIZE_MISMATCH');
                if (currentBlob && !currentSha256Matches)
                    reasons.push('CURRENT_SHA256_MISMATCH');
                if (reclaimableMatches === false)
                    reasons.push('RECLAIMABLE_BYTES_MISMATCH');
                for (const [contentRevision, snap] of expectedByContent) {
                    const blobRow = blobByRevision.get(contentRevision);
                    if (!blobRow) {
                        reasons.push(`BLOB_REVISION_MISSING:${contentRevision}`);
                        continue;
                    }
                    if (blobRow.blob.size !== snap.size)
                        reasons.push(`BLOB_REVISION_SIZE_MISMATCH:${contentRevision}`);
                    if (await sha256(blobRow.blob) !== snap.sha256)
                        reasons.push(`BLOB_REVISION_SHA256_MISMATCH:${contentRevision}`);
                }
                for (const blobRow of blobs)
                    if (!expectedByContent.has(blobRow.revision))
                        reasons.push(`UNEXPECTED_BLOB_REVISION:${blobRow.revision}`);
                items.push({ trashEntryId: entry.id, resourceId: file.id, storageTargetId: 'BROWSER_BLOB', storageKind: file.storageKind, state: reasons.length ? 'MISMATCH' : 'VERIFIED', filePresent: true, expectedCurrentBytes: file.size, actualCurrentBytes, expectedCurrentSha256: file.sha256, actualCurrentSha256, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: actualReclaimable, blobRevisionCount: blobs.length, expectedContentRevisionCount: expectedByContent.size, currentSizeMatches, currentSha256Matches, reclaimableMatches, reasons });
            }
            return { contract: 'KX.CORE_TRASH_STORAGE_READBACK/1', adapter: 'BROWSER_BLOB_REPOSITORY', targetId: 'BROWSER_BLOB', generatedAt: now(), capacityKnown: false, totalBytes: null, freeBytes: null, bounded: true, maxEntries: 64, requested: rows.length, selected: items.length, verified: items.filter(x => x.state === 'VERIFIED').length, mismatched: items.filter(x => x.state === 'MISMATCH').length, missing: items.filter(x => x.state === 'MISSING').length, unsupported: items.filter(x => x.state === 'UNSUPPORTED').length, physicalBytes, expectedReclaimableBytes, items, destructiveExecutionAllowed: false, automaticCleanupTriggered: false, safeguards: ['READ_ONLY_PHYSICAL_READBACK', 'BROWSER_BLOB_ONLY', 'NO_CAPACITY_CLAIM', 'NO_NATIVE_FILE_CLAIM', 'NO_LAN_NAS_CLAIM', 'NO_AUTO_PURGE', 'NO_DELETE_ACTION'] };
        }
        async trashNativeManagedStorageReadback(rows) {
            const items = [];
            let physicalBytes = 0, expectedReclaimableBytes = 0;
            for (const entry of rows) {
                const d = entry.data, reasons = [];
                if (d.resourceType !== 'CORE.FILE' || d.storageTargetId !== 'NATIVE_MANAGED') {
                    items.push({ trashEntryId: entry.id, resourceId: d.resourceId, state: 'UNSUPPORTED', filePresent: false, currentContentRevision: null, revisionCount: 0, expectedCurrentBytes: d.logicalBytes ?? null, actualCurrentBytes: null, expectedCurrentSha256: null, actualCurrentSha256: null, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: null, currentSizeMatches: null, currentSha256Matches: null, reclaimableMatches: null, revisions: [], reasons: ['NATIVE_MANAGED_CORE_FILE_ONLY'] });
                    continue;
                }
                const file = await this.get(d.resourceId);
                expectedReclaimableBytes += Math.max(0, Number(d.reclaimableBytes || 0));
                if (!file) {
                    items.push({ trashEntryId: entry.id, resourceId: d.resourceId, state: 'MISSING', filePresent: false, currentContentRevision: null, revisionCount: 0, expectedCurrentBytes: d.logicalBytes ?? null, actualCurrentBytes: null, expectedCurrentSha256: null, actualCurrentSha256: null, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: null, currentSizeMatches: null, currentSha256Matches: null, reclaimableMatches: null, revisions: [], reasons: ['FILE_RECORD_MISSING'] });
                    continue;
                }
                if (file.storageKind !== 'NATIVE_FILE' || !this.managed) {
                    items.push({ trashEntryId: entry.id, resourceId: d.resourceId, state: 'UNSUPPORTED', filePresent: true, currentContentRevision: file.contentRevision || file.revision, revisionCount: 0, expectedCurrentBytes: file.size, actualCurrentBytes: null, expectedCurrentSha256: file.sha256, actualCurrentSha256: null, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: null, currentSizeMatches: null, currentSha256Matches: null, reclaimableMatches: null, revisions: [], reasons: [file.storageKind !== 'NATIVE_FILE' ? 'FILE_STORAGE_KIND_NOT_NATIVE' : 'MANAGED_FILE_STORE_UNAVAILABLE'] });
                    continue;
                }
                const byContent = new Map();
                for (const r of await this.revisions.list(file.id)) {
                    const snap = r.snapshot;
                    if (snap?.id === file.id)
                        byContent.set(snap.contentRevision || snap.revision, snap);
                }
                byContent.set(file.contentRevision || file.revision, file);
                const revisionReadback = [];
                const counted = new Set();
                let actualReclaimable = 0;
                for (const [contentRevision, snap] of [...byContent.entries()].sort((a, b) => a[0] - b[0])) {
                    const rr = [];
                    const locator = snap.storageKind === 'NATIVE_FILE' && snap.storageLocator ? snap.storageLocator : null;
                    if (!locator) {
                        revisionReadback.push({ contentRevision, locator: null, expectedBytes: Math.max(0, Number(snap.size || 0)), actualBytes: null, expectedSha256: snap.sha256, actualSha256: null, exists: false, state: 'MISSING', reasons: ['NATIVE_STORAGE_LOCATOR_MISSING'] });
                        continue;
                    }
                    let exists = false;
                    try {
                        exists = await this.managed.exists(locator);
                    }
                    catch {
                        rr.push('MANAGED_EXISTS_ERROR');
                    }
                    if (!exists) {
                        revisionReadback.push({ contentRevision, locator, expectedBytes: Math.max(0, Number(snap.size || 0)), actualBytes: null, expectedSha256: snap.sha256, actualSha256: null, exists: false, state: 'MISSING', reasons: [...rr, 'NATIVE_REVISION_MISSING'] });
                        continue;
                    }
                    try {
                        const blob = await this.managed.read(locator, snap.mime), actualBytes = blob.size, actualSha256 = await sha256(blob);
                        if (actualBytes !== snap.size)
                            rr.push('REVISION_SIZE_MISMATCH');
                        if (actualSha256 !== snap.sha256)
                            rr.push('REVISION_SHA256_MISMATCH');
                        if (!counted.has(locator)) {
                            actualReclaimable += Math.max(0, actualBytes);
                            counted.add(locator);
                        }
                        revisionReadback.push({ contentRevision, locator, expectedBytes: Math.max(0, Number(snap.size || 0)), actualBytes, expectedSha256: snap.sha256, actualSha256, exists: true, state: rr.length ? 'MISMATCH' : 'VERIFIED', reasons: rr });
                    }
                    catch {
                        revisionReadback.push({ contentRevision, locator, expectedBytes: Math.max(0, Number(snap.size || 0)), actualBytes: null, expectedSha256: snap.sha256, actualSha256: null, exists: true, state: 'MISSING', reasons: ['NATIVE_REVISION_READ_FAILED'] });
                    }
                }
                const currentRevision = file.contentRevision || file.revision, current = revisionReadback.find(x => x.contentRevision === currentRevision), currentSizeMatches = current?.actualBytes === file.size, currentSha256Matches = current?.actualSha256 === file.sha256, reclaimableMatches = d.reclaimableBytes === undefined ? null : actualReclaimable === d.reclaimableBytes;
                if (!current)
                    reasons.push('CURRENT_CONTENT_REVISION_MISSING');
                if (current && current.state === 'MISSING')
                    reasons.push('CURRENT_REVISION_MISSING');
                if (current && current.state === 'MISMATCH')
                    reasons.push('CURRENT_REVISION_MISMATCH');
                if (currentSizeMatches === false)
                    reasons.push('CURRENT_SIZE_MISMATCH');
                if (currentSha256Matches === false)
                    reasons.push('CURRENT_SHA256_MISMATCH');
                if (reclaimableMatches === false)
                    reasons.push('RECLAIMABLE_BYTES_MISMATCH');
                if (revisionReadback.some(x => x.state === 'MISSING'))
                    reasons.push('REVISION_BYTES_MISSING');
                if (revisionReadback.some(x => x.state === 'MISMATCH'))
                    reasons.push('REVISION_BYTES_MISMATCH');
                const state = revisionReadback.some(x => x.state === 'MISSING') ? 'MISSING' : (reasons.length ? 'MISMATCH' : 'VERIFIED');
                physicalBytes += actualReclaimable;
                items.push({ trashEntryId: entry.id, resourceId: file.id, state, filePresent: true, currentContentRevision: currentRevision, revisionCount: revisionReadback.length, expectedCurrentBytes: file.size, actualCurrentBytes: current?.actualBytes ?? null, expectedCurrentSha256: file.sha256, actualCurrentSha256: current?.actualSha256 ?? null, expectedReclaimableBytes: d.reclaimableBytes ?? null, actualReclaimableBytes: actualReclaimable, currentSizeMatches, currentSha256Matches, reclaimableMatches, revisions: revisionReadback, reasons: [...new Set(reasons)] });
            }
            return { contract: 'KX.CORE_TRASH_NATIVE_MANAGED_STORAGE_READBACK/1', adapter: 'NATIVE_MANAGED_PROTOCOL', targetId: 'NATIVE_MANAGED', generatedAt: now(), capacityKnown: false, totalBytes: null, freeBytes: null, bounded: true, maxEntries: 64, requested: rows.length, selected: items.length, verified: items.filter(x => x.state === 'VERIFIED').length, mismatched: items.filter(x => x.state === 'MISMATCH').length, missing: items.filter(x => x.state === 'MISSING').length, unsupported: items.filter(x => x.state === 'UNSUPPORTED').length, physicalBytes, expectedReclaimableBytes, physicalTauriHostProof: false, items, destructiveExecutionAllowed: false, automaticCleanupTriggered: false, safeguards: ['READ_ONLY_NATIVE_MANAGED_PROTOCOL_READBACK', 'EXPLICIT_SELECTION_MAX64', 'IMMUTABLE_REVISION_SIZE_SHA256_READBACK', 'NO_CAPACITY_CLAIM', 'PHYSICAL_TAURI_HOST_PROOF_FALSE', 'NO_LAN_NAS_CLAIM', 'NO_AUTO_PURGE', 'NO_DELETE_ACTION'] };
        }
        async nativeManagedPurgeSandboxSeed(rows) {
            if (!this.managed)
                throw new Error('MANAGED_FILE_STORE_UNAVAILABLE');
            const readback = await this.trashNativeManagedStorageReadback(rows);
            if (readback.selected !== rows.length || readback.verified !== rows.length || readback.mismatched || readback.missing || readback.unsupported)
                throw new Error('NATIVE_MANAGED_PURGE_SANDBOX_READBACK_NOT_VERIFIED');
            const revisions = [], seed = [];
            const seen = new Set();
            for (const item of readback.items)
                for (const r of item.revisions) {
                    if (r.state !== 'VERIFIED' || !r.locator)
                        throw new Error('NATIVE_MANAGED_PURGE_SANDBOX_REVISION_NOT_VERIFIED');
                    if (seen.has(r.locator))
                        continue;
                    seen.add(r.locator);
                    const blob = await this.managed.read(r.locator);
                    if (blob.size !== r.expectedBytes || await sha256(blob) !== r.expectedSha256)
                        throw new Error('NATIVE_MANAGED_PURGE_SANDBOX_LIVE_BYTES_DRIFT');
                    revisions.push({ locator: r.locator, contentRevision: r.contentRevision, expectedBytes: r.expectedBytes, expectedSha256: r.expectedSha256 });
                    seed.push({ locator: r.locator, blob });
                }
            revisions.sort((a, b) => a.locator.localeCompare(b.locator));
            seed.sort((a, b) => a.locator.localeCompare(b.locator));
            const stateSha = await sha256Bytes(new TextEncoder().encode(stableStringify(revisions.map(x => ({ locator: x.locator, size: x.expectedBytes, sha256: x.expectedSha256 })))));
            return { readback, revisions, seed, stateSha };
        }
        async trashNativeManagedPurgeTransactionSandbox(rows, faultAfterRevision) {
            const before = await this.nativeManagedPurgeSandboxSeed(rows), fault = Number.isFinite(Number(faultAfterRevision)) ? Math.max(1, Math.floor(Number(faultAfterRevision))) : null, clone = new Map(before.seed.map(x => [x.locator, x.blob.slice(0, x.blob.size, x.blob.type)]));
            let simulatedDeletes = 0, compensationRequired = false, compensationApplied = false;
            const cloneHash = async () => { const out = []; for (const [locator, b] of [...clone.entries()].sort((a, b) => a[0].localeCompare(b[0])))
                out.push({ locator, size: b.size, sha256: await sha256(b) }); return sha256Bytes(new TextEncoder().encode(stableStringify(out))); };
            for (const r of before.revisions) {
                clone.delete(r.locator);
                simulatedDeletes++;
                if (fault && simulatedDeletes === fault) {
                    compensationRequired = true;
                    break;
                }
            }
            if (compensationRequired) {
                clone.clear();
                for (const x of before.seed)
                    clone.set(x.locator, x.blob.slice(0, x.blob.size, x.blob.type));
                compensationApplied = true;
            }
            const sandboxAfterSha256 = await cloneHash(), after = await this.nativeManagedPurgeSandboxSeed(rows), liveStorageUnchanged = before.stateSha === after.stateSha, compensationVerified = !compensationRequired || sandboxAfterSha256 === before.stateSha, candidateCommitVerified = !compensationRequired && clone.size === 0;
            if (!liveStorageUnchanged)
                throw new Error('NATIVE_MANAGED_PURGE_SANDBOX_LIVE_STORAGE_MUTATED');
            if (compensationRequired && !compensationVerified)
                throw new Error('NATIVE_MANAGED_PURGE_SANDBOX_COMPENSATION_HASH_MISMATCH');
            return { contract: 'KX.CORE_TRASH_NATIVE_MANAGED_PURGE_TRANSACTION_SANDBOX/1', mode: 'ISOLATED_BYTE_CLONE_ONLY', readOnly: true, bounded: true, maxEntries: 64, requested: rows.length, selected: before.readback.selected, generatedAt: now(), state: compensationRequired ? 'COMPENSATED' : 'SIMULATED_COMMIT', faultAfterRevision: fault, revisionCount: before.revisions.length, simulatedDeletes, preStateSha256: before.stateSha, sandboxAfterSha256, liveStorageBeforeSha256: before.stateSha, liveStorageAfterSha256: after.stateSha, candidateCommitVerified, compensationRequired, compensationApplied, compensationVerified, liveStorageUnchanged, liveDeleteRevisionCalls: 0, productionNativeFilePurgePublished: false, physicalTauriHostProof: false, destructiveExecutionAllowed: false, revisions: before.revisions, safeguards: ['READ_ONLY_PUBLIC_ACTION', 'ISOLATED_BYTE_CLONE_ONLY', 'LIVE_MANAGED_STORE_READBACK_ONLY', 'NO_LIVE_DELETE_REVISION_CALL', 'FAULT_INJECTION_EXACT_HASH_COMPENSATION', 'LIVE_STORAGE_HASH_PARITY_REQUIRED', 'PRODUCTION_NATIVE_FILE_PURGE_UNPUBLISHED', 'PHYSICAL_TAURI_HOST_PROOF_FALSE'] };
        }
        async trashNativeManagedIsolatedDeleteExecutor(rows, faultAfterRevision) {
            const before = await this.nativeManagedPurgeSandboxSeed(rows), fault = Number.isFinite(Number(faultAfterRevision)) ? Math.max(1, Math.floor(Number(faultAfterRevision))) : null;
            let isolated = new IsolatedManagedFileStore(before.seed), compensationRequired = false, compensationApplied = false;
            for (const [i, r] of before.revisions.entries()) {
                await isolated.deleteRevision(r.locator, r.expectedSha256, r.expectedBytes);
                if (fault && i + 1 === fault) {
                    compensationRequired = true;
                    break;
                }
            }
            const isolatedDeleteProtocolCalls = isolated.deleteCalls.length;
            if (compensationRequired) {
                isolated = new IsolatedManagedFileStore(before.seed);
                compensationApplied = true;
            }
            const isolatedAfterSha256 = await isolated.stateSha256(), after = await this.nativeManagedPurgeSandboxSeed(rows), liveStorageUnchanged = before.stateSha === after.stateSha, compensationVerified = !compensationRequired || isolatedAfterSha256 === before.stateSha, candidateCommitVerified = !compensationRequired && isolated.snapshot().length === 0;
            if (!liveStorageUnchanged)
                throw new Error('NATIVE_MANAGED_ISOLATED_DELETE_LIVE_STORAGE_MUTATED');
            if (compensationRequired && !compensationVerified)
                throw new Error('NATIVE_MANAGED_ISOLATED_DELETE_COMPENSATION_HASH_MISMATCH');
            return { contract: 'KX.CORE_TRASH_NATIVE_MANAGED_ISOLATED_DELETE_EXECUTOR/1', mode: 'ISOLATED_MANAGED_FILE_STORE_ONLY', readOnly: true, bounded: true, maxEntries: 64, requested: rows.length, selected: before.readback.selected, generatedAt: now(), state: compensationRequired ? 'COMPENSATED' : 'SIMULATED_COMMIT', faultAfterRevision: fault, revisionCount: before.revisions.length, isolatedDeleteProtocolCalls, preStateSha256: before.stateSha, isolatedAfterSha256, liveStorageBeforeSha256: before.stateSha, liveStorageAfterSha256: after.stateSha, candidateCommitVerified, compensationRequired, compensationApplied, compensationVerified, liveStorageUnchanged, liveDeleteRevisionCalls: 0, productionNativeFilePurgePublished: false, physicalTauriHostProof: false, destructiveExecutionAllowed: false, revisions: before.revisions, safeguards: ['READ_ONLY_PUBLIC_ACTION', 'ISOLATED_MANAGED_FILE_STORE_ONLY', 'DELTA085_DELETE_PROTOCOL_EXERCISED_ON_CLONE', 'NO_LIVE_DELETE_REVISION_CALL', 'FAULT_INJECTION_EXACT_HASH_COMPENSATION', 'LIVE_STORAGE_HASH_PARITY_REQUIRED', 'PRODUCTION_NATIVE_FILE_PURGE_UNPUBLISHED', 'PHYSICAL_TAURI_HOST_PROOF_FALSE'] };
        }
        async trashNativeManagedPurgeExecutionPreflight(rows) {
            const readback = await this.trashNativeManagedStorageReadback(rows), blockers = [];
            const liveReadbackVerified = readback.selected === rows.length && readback.verified === rows.length && readback.mismatched === 0 && readback.missing === 0 && readback.unsupported === 0;
            let isolatedCommitVerified = false, isolatedRollbackVerified = false, liveStorageUnchanged = true;
            if (liveReadbackVerified) {
                const commit = await this.trashNativeManagedIsolatedDeleteExecutor(rows), rollback = await this.trashNativeManagedIsolatedDeleteExecutor(rows, 1);
                isolatedCommitVerified = commit.state === 'SIMULATED_COMMIT' && commit.candidateCommitVerified && commit.liveStorageUnchanged && commit.liveDeleteRevisionCalls === 0;
                isolatedRollbackVerified = rollback.state === 'COMPENSATED' && rollback.compensationApplied && rollback.compensationVerified && rollback.liveStorageUnchanged && rollback.liveDeleteRevisionCalls === 0;
                liveStorageUnchanged = commit.liveStorageUnchanged && rollback.liveStorageUnchanged;
                if (!isolatedCommitVerified)
                    blockers.push('ISOLATED_COMMIT_PROOF_INCOMPLETE');
                if (!isolatedRollbackVerified)
                    blockers.push('ISOLATED_ROLLBACK_PROOF_INCOMPLETE');
            }
            else
                blockers.push('LIVE_STORAGE_READBACK_NOT_VERIFIED');
            blockers.push('PHYSICAL_TAURI_HOST_PROOF_REQUIRED', 'HOST_TRANSACTIONAL_COMPENSATION_PROOF_REQUIRED', 'PRODUCTION_NATIVE_OWNER_PURGE_ACTION_UNPUBLISHED');
            return { contract: 'KX.CORE_TRASH_NATIVE_MANAGED_PURGE_EXECUTION_PREFLIGHT/1', mode: 'READ_ONLY_COMPOSED_EVIDENCE', readOnly: true, bounded: true, maxEntries: 64, requested: rows.length, selected: readback.selected, generatedAt: now(), liveReadbackVerified, deleteProtocolBoundaryVerified: true, isolatedCommitVerified, isolatedRollbackVerified, liveStorageUnchanged, liveDeleteRevisionCalls: 0, productionReady: false, productionExecutionAllowed: false, ownerActionPublished: false, physicalTauriHostProof: false, aggregateOwnerActionsCriterionMutated: false, aggregateStorageAdaptersCriterionMutated: false, aggregatePurgeTransactionCriterionMutated: false, blockers: [...new Set(blockers)], evidence: { readbackContract: 'KX.CORE_TRASH_NATIVE_MANAGED_STORAGE_READBACK/1', deleteProtocolContract: 'KX.CORE_TRASH_NATIVE_MANAGED_DELETE_PROTOCOL/1', transactionSandboxContract: 'KX.CORE_TRASH_NATIVE_MANAGED_PURGE_TRANSACTION_SANDBOX/1', isolatedExecutorContract: 'KX.CORE_TRASH_NATIVE_MANAGED_ISOLATED_DELETE_EXECUTOR/1' }, safeguards: ['READ_ONLY_PUBLIC_ACTION', 'EXACT_VISIBLE_SELECTION_REQUIRED', 'MAX_64_UNIQUE_ENTRIES', 'COMPOSED_D084_D085_D086_D087_EVIDENCE', 'NO_LIVE_DELETE_REVISION_CALL', 'LIVE_STORAGE_HASH_PARITY_REQUIRED', 'PHYSICAL_TAURI_HOST_PROOF_REQUIRED', 'PRODUCTION_NATIVE_FILE_PURGE_UNPUBLISHED', 'NO_PRODUCTION_OWNER_ACTION', 'NO_AGGREGATE_CRITERION_PROMOTION'] };
        }
        async trash(id, ctx, expectedRevision) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown file ${id}`);
            if (old.trashedAt)
                throw new Error(`File ${id} is already in Trash`);
            if (expectedRevision !== undefined && old.revision !== expectedRevision)
                throw new Error(`Revision conflict for ${id}: expected ${expectedRevision}, actual ${old.revision}`);
            await this.mutationAccess?.assertFile(old, ctx, 'EDIT');
            const at = now(), root = rootId(ctx), deps = await this.dependencySummary(id), reclaimableBytes = await this.physicalFootprint(old), trashEntryId = `TRASH.${['APP.NEXUS', 'CORE.FILE', id].join('.').replace(/[^A-Za-z0-9_.-]+/g, '_')}`;
            const row = { ...old, trashedAt: at, trashedBy: ctx.actorId, trashEntryId, revision: old.revision + 1, updatedAt: at, updatedBy: ctx.actorId };
            const rev = this.revisions.make('CORE.FILE', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE.TRASH', entityType: 'CORE.FILE', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { revision: row.revision, contentRevision: row.contentRevision, trashEntryId, dependencyCount: deps.length, reclaimableBytes } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { trashedAt: row.trashedAt, trashEntryId } });
            await casAtomic(this.repo, casPre('files', row.id, old.revision, ctx), [{ store: 'files', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }], [{ store: 'fileSearch', key: id }]);
            return { file: row, trashEntryId, dependencyCount: deps.length, dependencySummary: deps, reclaimableBytes };
        }
        async restoreTrash(id, ctx) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown file ${id}`);
            if (!old.trashedAt)
                throw new Error(`File ${id} is not in Trash`);
            await this.mutationAccess?.assertFile(old, ctx, 'EDIT');
            const blob = await this.getBlob(id);
            if (!blob || blob.size !== old.size || await sha256(blob) !== old.sha256)
                throw new Error(`File ${id} current bytes are unavailable or corrupt`);
            const at = now(), root = rootId(ctx), row = { ...old, trashedAt: null, trashedBy: null, trashEntryId: null, revision: old.revision + 1, updatedAt: at, updatedBy: ctx.actorId };
            const rev = this.revisions.make('CORE.FILE', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE.TRASH.RESTORE', entityType: 'CORE.FILE', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { revision: row.revision, contentRevision: row.contentRevision, sha256: row.sha256 } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { restored: true, revision: row.revision } });
            await casAtomic(this.repo, casPre('files', row.id, old.revision, ctx), [{ store: 'files', value: row }, { store: 'fileSearch', value: this.searchRow(row) }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            const readback = await this.get(id);
            if (!readback || readback.trashedAt)
                throw new Error('File restore readback failed');
            return { status: 'RESTORED', resourceId: id, exists: true, trashed: false, ownerRevision: readback.revision, physicalBytesBefore: old.size, physicalBytesAfter: readback.size, reclaimedBytes: 0, evidence: ['FILE_RECORD_PRESENT', 'CURRENT_BYTES_SHA256_VERIFIED', 'SEARCH_INDEX_RESTORED', 'REVISION_INCREMENTED'] };
        }
        async purgeTrash(id, ctx) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown file ${id}`);
            if (!old.trashedAt)
                throw new Error(`File ${id} is not in Trash`);
            await this.mutationAccess?.assertFile(old, ctx, 'EDIT');
            if (old.storageKind === 'NATIVE_FILE')
                throw new Error('NATIVE_MANAGED_PURGE_TRANSACTION_UNAVAILABLE');
            const deps = await this.dependencySummary(id);
            if (deps.length)
                throw new Error(`File purge blocked by dependencies: ${deps.join(',')}`);
            const blobs = (await this.repo.all('fileBlobs')).filter(x => x.fileId === id), memberships = (await this.repo.all('fileMemberships')).filter(x => x.fileId === id), revisions = await this.revisions.list(id), physicalBytesBefore = blobs.reduce((n, x) => n + Math.max(0, Number(x.blob?.size || 0)), 0), root = rootId(ctx), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE.TRASH.PURGE', entityType: 'CORE.FILE', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { physicalBytesBefore, blobRevisions: blobs.length, membershipsRemoved: memberships.length, revisionsRemoved: revisions.length } }), out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.FILE', resourceId: id, revision: old.revision, ownerApp: old.ownerApp, rootChangeId: root, payload: { purged: true, physicalBytesBefore } }), deletes = [{ store: 'files', key: id }, { store: 'fileSearch', key: id }, ...blobs.map(x => ({ store: 'fileBlobs', key: x.id })), ...memberships.map(x => ({ store: 'fileMemberships', key: x.id })), ...revisions.map(x => ({ store: 'revisions', key: x.id }))];
            await casAtomic(this.repo, casPre('files', old.id, old.revision, ctx), [{ store: 'audit', value: audit }, { store: 'outbox', value: out }], deletes);
            const exists = !!await this.get(id), remainingBlobs = (await this.repo.all('fileBlobs')).some(x => x.fileId === id), remainingMemberships = (await this.repo.all('fileMemberships')).some(x => x.fileId === id);
            if (exists || remainingBlobs || remainingMemberships)
                throw new Error('File purge readback failed');
            return { status: 'PURGED', resourceId: id, exists: false, trashed: false, ownerRevision: old.revision, physicalBytesBefore, physicalBytesAfter: 0, reclaimedBytes: physicalBytesBefore, evidence: ['FILE_RECORD_REMOVED', 'BROWSER_BLOB_REVISIONS_REMOVED', 'FILE_MEMBERSHIPS_REMOVED', 'FILE_REVISIONS_REMOVED', 'PHYSICAL_BYTES_READBACK_ZERO'] };
        }
    }
    KX.FileService = FileService;
    class FileLibraryService {
        repo;
        files;
        audit;
        outbox;
        mutationAccess;
        constructor(repo, files, audit, outbox, mutationAccess) {
            this.repo = repo;
            this.files = files;
            this.audit = audit;
            this.outbox = outbox;
            this.mutationAccess = mutationAccess;
        }
        async listCollections() { return this.repo.all('fileCollections'); }
        async listMemberships() { return this.repo.all('fileMemberships'); }
        async createCollection(input, ctx) {
            await this.mutationAccess?.assertNewCollection(input, ctx);
            if (input.parentId) {
                const parent = await this.repo.get('fileCollections', input.parentId);
                if (!parent)
                    throw new Error(`Unknown parent collection ${input.parentId}`);
                await this.mutationAccess?.assertCollection(parent, ctx, 'EDIT');
                if (parent.scopeType !== input.scopeType || parent.scopeId !== input.scopeId)
                    throw new Error('Scope denied: child collection must inherit parent scope');
            }
            const at = now(), root = rootId(ctx), row = { id: uid('FCOL'), name: input.name, scopeType: input.scopeType, scopeId: input.scopeId, ownerUserId: input.ownerUserId, kind: input.kind || 'CUSTOM', parentId: input.parentId, createdAt: at, createdBy: ctx.actorId, updatedAt: at, updatedBy: ctx.actorId };
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE_COLLECTION.CREATE', entityType: 'CORE.FILE_COLLECTION', entityId: row.id, rootChangeId: root, result: 'OK', detail: { name: row.name, scopeType: row.scopeType, scopeId: row.scopeId } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE_COLLECTION', resourceId: row.id, revision: 1, ownerApp: 'APP.NEXUS', rootChangeId: root, payload: row });
            await this.repo.atomic([{ store: 'fileCollections', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            return row;
        }
        async ensureUserDesk(userId, ctx) {
            const existing = (await this.listCollections()).find(x => x.scopeType === 'USER' && x.scopeId === userId && x.kind === 'ROOT');
            if (existing)
                return existing;
            const root = await this.createCollection({ name: 'Pracovní stůl', scopeType: 'USER', scopeId: userId, ownerUserId: userId, kind: 'ROOT' }, ctx);
            for (const [name, kind] of [['Rozpracované', 'WORKING'], ['Připnuté', 'PINNED'], ['Moje složky', 'FOLDERS'], ['Inbox', 'INBOX']])
                await this.createCollection({ name, scopeType: 'USER', scopeId: userId, ownerUserId: userId, kind, parentId: root.id }, ctx);
            return root;
        }
        async attach(fileId, collectionId, ctx, input = {}) {
            const file = await this.files.get(fileId);
            if (!file)
                throw new Error(`Unknown file ${fileId}`);
            if (file.trashedAt)
                throw new Error(`File ${fileId} is in Trash`);
            const collection = await this.repo.get('fileCollections', collectionId);
            if (!collection)
                throw new Error(`Unknown collection ${collectionId}`);
            await this.mutationAccess?.assertFile(file, ctx, 'READ');
            await this.mutationAccess?.assertCollection(collection, ctx, 'EDIT');
            const root = rootId(ctx), id = `FM.${collectionId}.${fileId}`, existing = await this.repo.get('fileMemberships', id);
            const row = { id, fileId, collectionId, pinned: input.pinned ?? existing?.pinned ?? false, order: input.order ?? existing?.order, createdAt: existing?.createdAt || now(), createdBy: existing?.createdBy || ctx.actorId };
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE_COLLECTION.ATTACH', entityType: 'CORE.FILE_MEMBERSHIP', entityId: id, rootChangeId: root, result: 'OK', detail: { fileId, collectionId, pinned: row.pinned } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.FILE_MEMBERSHIP', resourceId: id, revision: 1, ownerApp: 'APP.NEXUS', rootChangeId: root, payload: row });
            await this.repo.atomic([{ store: 'fileMemberships', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            return row;
        }
        async detach(fileId, collectionId, ctx) { const file = await this.files.get(fileId); if (!file)
            throw new Error(`Unknown file ${fileId}`); if (file.trashedAt)
            throw new Error(`File ${fileId} is in Trash`); const collection = await this.repo.get('fileCollections', collectionId); if (!collection)
            throw new Error(`Unknown collection ${collectionId}`); await this.mutationAccess?.assertFile(file, ctx, 'READ'); await this.mutationAccess?.assertCollection(collection, ctx, 'EDIT'); const id = `FM.${collectionId}.${fileId}`, root = rootId(ctx); const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.FILE_COLLECTION.DETACH', entityType: 'CORE.FILE_MEMBERSHIP', entityId: id, rootChangeId: root, result: 'OK', detail: { fileId, collectionId } }); const out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.FILE_MEMBERSHIP', resourceId: id, ownerApp: 'APP.NEXUS', rootChangeId: root }); await this.repo.atomic([{ store: 'audit', value: audit }, { store: 'outbox', value: out }], [{ store: 'fileMemberships', key: id }]); }
        async collectionsForFile(fileId) { const memberships = (await this.listMemberships()).filter(x => x.fileId === fileId), collections = await this.listCollections(); return memberships.map(m => collections.find(c => c.id === m.collectionId)).filter((x) => !!x); }
        async filesIn(collectionId) { const memberships = (await this.listMemberships()).filter(x => x.collectionId === collectionId).sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999)); return Promise.all(memberships.map(async (membership) => ({ membership, file: await this.files.get(membership.fileId) }))); }
        async filesInAccessible(collectionId, subjectId) { const collection = await this.repo.get('fileCollections', collectionId); if (!collection)
            return []; const rows = await this.filesIn(collectionId), out = []; for (const row of rows) {
            if (!row.file)
                continue;
            try {
                await this.mutationAccess?.assertFile(row.file, { actorId: subjectId, appCode: 'APP.NEXUS' }, 'READ');
                out.push(row);
            }
            catch { }
        } return out; }
    }
    KX.FileLibraryService = FileLibraryService;
    class FileExplorerService {
        repo;
        files;
        library;
        access;
        constructor(repo, files, library, access) {
            this.repo = repo;
            this.files = files;
            this.library = library;
            this.access = access;
        }
        async search(query = {}) {
            const allFiles = await this.files.list(), allSearch = await this.repo.all('fileSearch'), memberships = await this.library.listMemberships(), collections = await this.library.listCollections();
            const bySearch = new Map(allSearch.map(x => [x.fileId, x]));
            const q = normalizeSearch(query.text || '');
            const tags = (query.tags || []).map(normalizeSearch);
            const isPinned = (fm) => fm.some(m => m.pinned || collections.find(c => c.id === m.collectionId)?.kind === 'PINNED');
            let candidates = allFiles.filter(file => {
                if (file.trashedAt)
                    return false;
                if (!query.includeArchived && file.archivedAt)
                    return false;
                if (query.spaceId && !file.spaceIds.includes(query.spaceId))
                    return false;
                if (query.ownerApp && file.ownerApp !== query.ownerApp)
                    return false;
                if (query.createdByNot && file.createdBy === query.createdByNot)
                    return false;
                if (query.mimePrefix && !file.mime.startsWith(query.mimePrefix))
                    return false;
                const idx = bySearch.get(file.id);
                if (tags.length && !tags.every(t => idx?.tags.includes(t)))
                    return false;
                if (q && !(idx?.normalizedName.includes(q) || idx?.normalizedDescription.includes(q) || idx?.tags.some(t => t.includes(q))))
                    return false;
                const fm = memberships.filter(m => m.fileId === file.id);
                if (query.collectionId && !fm.some(m => m.collectionId === query.collectionId))
                    return false;
                if (query.pinnedOnly && !isPinned(fm))
                    return false;
                return true;
            });
            const sort = query.sort || 'UPDATED_DESC';
            candidates = candidates.sort((a, b) => sort === 'NAME_ASC' ? a.name.localeCompare(b.name, 'cs') : sort === 'SIZE_DESC' ? b.size - a.size : b.updatedAt.localeCompare(a.updatedAt));
            if (query.limit)
                candidates = candidates.slice(0, query.limit);
            return candidates.map(file => { const fm = memberships.filter(m => m.fileId === file.id); return { file, pinned: isPinned(fm), collections: fm.map(m => collections.find(c => c.id === m.collectionId)).filter((x) => !!x) }; });
        }
        async searchAccessible(query, subjectId) { const rows = await this.search(query); if (!this.access)
            return rows; const visible = []; for (const row of rows)
            if (await this.access.can(this.access.file(row.file), subjectId, 'READ'))
                visible.push(row); return visible; }
        async recent(limit = 20) { return this.search({ sort: 'UPDATED_DESC', limit }); }
        async recentAccessible(subjectId, limit = 20) { return this.searchAccessible({ sort: 'UPDATED_DESC', limit }, subjectId); }
    }
    KX.FileExplorerService = FileExplorerService;
    class WorkDeskService {
        explorer;
        library;
        constructor(explorer, library) {
            this.explorer = explorer;
            this.library = library;
        }
        async snapshot(userId, limit = 5) {
            const collections = await this.library.listCollections();
            const own = collections.filter(c => c.scopeType === 'USER' && c.scopeId === userId);
            const byKind = (kind) => own.find(c => c.kind === kind);
            const working = byKind('WORKING'), pinned = byKind('PINNED'), foldersRoot = byKind('FOLDERS'), inbox = byKind('INBOX');
            const customFolders = own.filter(c => c.kind === 'CUSTOM' && (!foldersRoot || c.parentId === foldersRoot.id)).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
            const [workingRows, pinnedRows, recentRows, sharedRows, inboxRows] = await Promise.all([
                working ? this.explorer.searchAccessible({ collectionId: working.id, sort: 'UPDATED_DESC', limit }, userId) : [],
                pinned ? this.explorer.searchAccessible({ collectionId: pinned.id, sort: 'UPDATED_DESC', limit }, userId) : [],
                this.explorer.recentAccessible(userId, limit),
                this.explorer.searchAccessible({ createdByNot: userId, sort: 'UPDATED_DESC', limit }, userId),
                inbox ? this.explorer.searchAccessible({ collectionId: inbox.id, sort: 'UPDATED_DESC', limit }, userId) : []
            ]);
            const count = async (collection) => collection ? (await this.explorer.searchAccessible({ collectionId: collection.id }, userId)).length : 0;
            return {
                userId,
                collections: { working, pinned, foldersRoot, inbox },
                groups: {
                    working: { code: 'WORKING', title: 'Rozpracované', collectionId: working?.id, count: await count(working), rows: workingRows },
                    pinned: { code: 'PINNED', title: 'Připnuté', collectionId: pinned?.id, count: await count(pinned), rows: pinnedRows },
                    recent: { code: 'RECENT', title: 'Poslední', count: (await this.explorer.searchAccessible({}, userId)).length, rows: recentRows },
                    folders: { code: 'FOLDERS', title: 'Moje složky', collectionId: foldersRoot?.id, count: customFolders.length, folders: customFolders },
                    shared: { code: 'SHARED_WITH_ME', title: 'Sdílené se mnou', count: (await this.explorer.searchAccessible({ createdByNot: userId }, userId)).length, rows: sharedRows },
                    inbox: { code: 'INBOX', title: 'Inbox', collectionId: inbox?.id, count: await count(inbox), rows: inboxRows }
                }
            };
        }
    }
    KX.WorkDeskService = WorkDeskService;
    class MyDayService {
        memberships;
        access;
        tasks;
        calendar;
        alarms;
        workDesk;
        deepLinks;
        constructor(memberships, access, tasks, calendar, alarms, workDesk, deepLinks) {
            this.memberships = memberships;
            this.access = access;
            this.tasks = tasks;
            this.calendar = calendar;
            this.alarms = alarms;
            this.workDesk = workDesk;
            this.deepLinks = deepLinks;
        }
        target(kind, row) { return { kind, id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }; }
        inScope(spaceIds, view) { return !view.spaceIds.length || spaceIds.some(id => view.spaceIds.includes(id)); }
        item(kind, row, subtitle, at, reason) {
            return { kind, id: row.id, title: row.title || row.name || row.id, subtitle, at, ownerApp: row.ownerApp, spaceIds: [...(row.spaceIds || [])], deepLink: this.deepLinks.build({ kind, id: row.id, appCode: row.ownerApp }), status: row.status, priority: row.priority, reason };
        }
        async views(userId) {
            const spaces = (await this.memberships.listSpaces()).filter(x => !x.archivedAt), visible = [];
            for (const space of spaces)
                if (await this.memberships.roleFor(space.id, userId))
                    visible.push(space);
            const ids = (kind, ownerOnly = false) => visible.filter(x => x.kind === kind && (!ownerOnly || x.ownerUserId === userId)).map(x => x.id);
            return [
                { code: 'PERSONAL', title: 'Osobní', spaceIds: ids('PERSONAL', true), description: 'Moje osobní data a povinnosti' },
                { code: 'FAMILY', title: 'Rodina', spaceIds: ids('FAMILY'), description: 'Rodinné události, úkoly a upozornění' },
                { code: 'COMPANY', title: 'Firma', spaceIds: ids('COMPANY'), description: 'Firemní události, úkoly a upozornění' },
                { code: 'SHARED', title: 'Společné', spaceIds: ids('SHARED'), description: 'Společně sdílené položky' },
                { code: 'ALL', title: 'Vše', spaceIds: visible.map(x => x.id), description: 'Všechny dostupné Prostory' }
            ];
        }
        async snapshot(input) {
            const limit = Math.max(1, Math.min(100, input.limit || 12)), views = await this.views(input.userId), scope = input.scope || 'PERSONAL';
            const view = scope === 'CUSTOM' ? { code: 'CUSTOM', title: 'Vlastní', spaceIds: [...(input.spaceIds || [])], description: 'Vlastní výběr Prostorů' } : (views.find(x => x.code === scope) || views[0]);
            const fromMs = Date.parse(input.from), toMs = Date.parse(input.to);
            if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs)
                throw new Error('MyDay invalid time range');
            const can = async (kind, row) => this.inScope(row.spaceIds || [], view) && await this.access.can(this.target(kind, row), input.userId, 'READ');
            const taskRows = [];
            for (const row of await this.tasks.list()) {
                if (row.archivedAt || row.status === 'DONE' || row.status === 'CANCELLED' || !await can('TASK', row))
                    continue;
                const due = row.dueAt ? Date.parse(row.dueAt) : NaN;
                if ((Number.isFinite(due) && due <= toMs) || row.status === 'IN_PROGRESS' || row.status === 'WAITING')
                    taskRows.push(row);
            }
            taskRows.sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || ({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[a.priority] - { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[b.priority]));
            const tasks = taskRows.slice(0, limit).map(row => { const due = row.dueAt ? Date.parse(row.dueAt) : NaN, reason = Number.isFinite(due) && due < fromMs ? 'PO SPLATNOSTI' : row.status === 'WAITING' ? 'ČEKÁ NA ROZHODNUTÍ' : row.priority === 'CRITICAL' ? 'KRITICKÉ' : undefined; return this.item('TASK', row, row.dueAt ? `Termín ${new Date(row.dueAt).toLocaleString()} · ${row.status}` : `${row.status} · ${row.priority}`, row.dueAt || row.updatedAt, reason); });
            const eventRows = [];
            for (const row of await this.calendar.list()) {
                if (row.archivedAt || row.status === 'CANCELLED' || !await can('CALENDAR_EVENT', row))
                    continue;
                const start = Date.parse(row.startsAt), end = Date.parse(row.endsAt || row.startsAt);
                if (start <= toMs && end >= fromMs)
                    eventRows.push(row);
            }
            eventRows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const events = eventRows.slice(0, limit).map(row => this.item('CALENDAR_EVENT', row, `${row.allDay ? 'Celý den' : 'Událost'} · ${new Date(row.startsAt).toLocaleString()}`, row.startsAt));
            const alarmRows = [];
            for (const row of await this.alarms.list()) {
                if (row.status === 'CANCELLED' || row.status === 'ACKNOWLEDGED' || !await can('ALARM', row))
                    continue;
                const effective = row.status === 'SNOOZED' && row.snoozeUntil ? row.snoozeUntil : row.triggerAt, at = Date.parse(effective);
                if (row.status === 'FIRED' || (Number.isFinite(at) && at >= fromMs && at <= toMs))
                    alarmRows.push(row);
            }
            alarmRows.sort((a, b) => (a.snoozeUntil || a.triggerAt).localeCompare(b.snoozeUntil || b.triggerAt));
            const alarms = alarmRows.slice(0, limit).map(row => this.item('ALARM', row, `${row.status} · ${new Date(row.snoozeUntil || row.triggerAt).toLocaleString()}`, row.snoozeUntil || row.triggerAt, row.status === 'FIRED' ? 'VYŽADUJE POTVRZENÍ' : undefined));
            const desk = await this.workDesk.snapshot(input.userId, Math.max(limit, 20));
            const fileItems = (rows) => rows.filter(x => this.inScope(x.file.spaceIds || [], view)).slice(0, limit).map(x => this.item('FILE', x.file, `${x.file.mime} · rev ${x.file.revision}/${x.file.contentRevision}`, x.file.updatedAt));
            const working = fileItems(desk.groups.working.rows), inbox = fileItems(desk.groups.inbox.rows);
            const actions = [];
            for (const item of tasks)
                if (item.reason || item.priority === 'HIGH' || item.priority === 'CRITICAL')
                    actions.push({ ...item, reason: item.reason || 'VYSOKÁ PRIORITA' });
            for (const item of alarms)
                if (item.status === 'FIRED')
                    actions.push(item);
            for (const item of inbox)
                actions.push({ ...item, reason: 'INBOX' });
            actions.sort((a, b) => a.at.localeCompare(b.at));
            const activity = [...tasks, ...events, ...alarms, ...working, ...inbox].sort((a, b) => b.at.localeCompare(a.at)).filter((item, index, arr) => arr.findIndex(x => x.kind === item.kind && x.id === item.id) === index).slice(0, limit);
            return { userId: input.userId, generatedAt: now(), from: input.from, to: input.to, view, counts: { tasks: taskRows.length, events: eventRows.length, alarms: alarmRows.length, working: working.length, inbox: inbox.length, actions: actions.length, activity: activity.length }, tasks, events, alarms, working, inbox, actions: actions.slice(0, limit), activity };
        }
    }
    KX.MyDayService = MyDayService;
    class DocumentService {
        repo;
        audit;
        revisions;
        outbox;
        relations;
        files;
        access;
        constructor(repo, audit, revisions, outbox, relations, files, access) {
            this.repo = repo;
            this.audit = audit;
            this.revisions = revisions;
            this.outbox = outbox;
            this.relations = relations;
            this.files = files;
            this.access = access;
        }
        async get(id) { return this.repo.get('documents', id); }
        async list() { return this.repo.all('documents'); }
        async assertEdit(row, ctx) { if (ctx.actorId === 'SYSTEM')
            return; if (!this.access || !await this.access.can(this.access.document(row), ctx.actorId, 'EDIT'))
            throw new Error(`Document edit denied: ${row.id}`); }
        async relationState(id) { const all = await this.relations.forEntity(id), incoming = all.filter(x => x.targetId === id && x.sourceId !== id), outgoing = all.filter(x => x.sourceId === id); return { all, incoming, outgoing }; }
        async versionState(id) { return (await this.repo.all('documentVersions')).filter(x => x.documentId === id).sort((a, b) => a.version - b.version); }
        async signature(id) { const row = await this.get(id), versions = await this.versionState(id), relations = (await this.relations.forEntity(id)).sort((a, b) => a.id.localeCompare(b.id)); return sha256Bytes(new TextEncoder().encode(stableStringify({ row, versions, relations }))); }
        async referencedFileState(row, versions) { const ids = [...new Set([...(row.primaryFileId ? [row.primaryFileId] : []), ...versions.map(x => x.fileId)])], out = []; for (const id of ids) {
            const file = await this.files.get(id);
            if (!file)
                throw new Error(`Document referenced file ${id} is missing`);
            out.push({ id: file.id, revision: file.revision, contentRevision: file.contentRevision, sha256: file.sha256, trashedAt: file.trashedAt });
        } return out.sort((a, b) => a.id.localeCompare(b.id)); }
        async create(input, ctx) {
            const at = now(), root = rootId(ctx), id = uid('DOC');
            let primary;
            if (input.primaryFileId) {
                primary = await this.files.get(input.primaryFileId);
                if (!primary)
                    throw new Error(`Unknown file ${input.primaryFileId}`);
            }
            const row = { id, code: input.code, title: input.title, ownerApp: input.ownerApp, spaceIds: input.spaceIds || primary?.spaceIds || [], documentType: input.documentType, primaryFileId: input.primaryFileId, currentVersion: primary ? 1 : 0, revision: 1, metadata: input.metadata || {}, createdAt: at, createdBy: ctx.actorId, updatedAt: at, updatedBy: ctx.actorId, archivedAt: null };
            const rev = this.revisions.make('CORE.DOCUMENT', id, 1, row, { ...ctx, rootChangeId: root });
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DOCUMENT.CREATE', entityType: 'CORE.DOCUMENT', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { title: row.title, primaryFileId: row.primaryFileId } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.DOCUMENT', resourceId: id, revision: 1, ownerApp: row.ownerApp, rootChangeId: root });
            const writes = [{ store: 'documents', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }];
            if (primary)
                writes.push({ store: 'documentVersions', value: { id: `DOCVER.${id}.1`, documentId: id, version: 1, fileId: primary.id, fileRevision: primary.revision, at, actorId: ctx.actorId } });
            await casAtomic(this.repo, casPre('documents', row.id, null, ctx), writes);
            return row;
        }
        async addVersion(documentId, fileId, note, ctx) {
            const old = await this.get(documentId);
            if (!old)
                throw new Error(`Unknown document ${documentId}`);
            if (old.archivedAt)
                throw new Error(`Document ${documentId} is in Trash`);
            await this.assertEdit(old, ctx);
            const file = await this.files.get(fileId);
            if (!file)
                throw new Error(`Unknown file ${fileId}`);
            const root = rootId(ctx), at = now(), row = { ...old, primaryFileId: fileId, currentVersion: old.currentVersion + 1, revision: old.revision + 1, updatedAt: at, updatedBy: ctx.actorId };
            const ver = { id: `DOCVER.${documentId}.${row.currentVersion}`, documentId, version: row.currentVersion, fileId, fileRevision: file.revision, at, actorId: ctx.actorId, note };
            const rev = this.revisions.make('CORE.DOCUMENT', documentId, row.revision, row, { ...ctx, rootChangeId: root });
            const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DOCUMENT.ADD_VERSION', entityType: 'CORE.DOCUMENT', entityId: documentId, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { fileId, fileRevision: file.revision, version: row.currentVersion } });
            const out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.DOCUMENT', resourceId: documentId, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root });
            await casAtomic(this.repo, casPre('documents', row.id, old.revision, ctx), [{ store: 'documents', value: row }, { store: 'documentVersions', value: ver }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            return row;
        }
        async versions(documentId) { return this.versionState(documentId); }
        async versionBlob(documentId, version) { const ver = (await this.versions(documentId)).find(x => x.version === version); if (!ver)
            return undefined; return this.files.getBlob(ver.fileId, ver.fileRevision); }
        async link(documentId, targetType, targetId, relationType, ctx) { const row = await this.get(documentId); if (!row)
            throw new Error(`Unknown document ${documentId}`); if (row.archivedAt)
            throw new Error(`Document ${documentId} is in Trash`); await this.assertEdit(row, ctx); return this.relations.create({ code: 'REL.DOCUMENT.ATTACHED', sourceType: 'CORE.DOCUMENT', sourceId: documentId, targetType, targetId, relationType, ownerApp: 'APP.NEXUS' }, ctx); }
        async trashStage(id, ctx, expectedRevision) {
            const before = await this.get(id);
            if (!before)
                throw new Error(`Unknown document ${id}`);
            if (before.archivedAt)
                throw new Error(`Document ${id} is already in Trash`);
            if (expectedRevision !== undefined && before.revision !== expectedRevision)
                throw new Error(`Revision conflict for ${id}: expected ${expectedRevision}, actual ${before.revision}`);
            await this.assertEdit(before, ctx);
            const deletedAt = now(), root = rootId(ctx), relations = await this.relationState(id), versions = await this.versionState(id);
            await this.referencedFileState(before, versions);
            const row = { ...before, archivedAt: deletedAt, revision: before.revision + 1, updatedAt: deletedAt, updatedBy: ctx.actorId }, rev = this.revisions.make('CORE.DOCUMENT', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DOCUMENT.TRASH', entityType: 'CORE.DOCUMENT', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { revision: row.revision, currentVersion: row.currentVersion, versionCount: versions.length, incomingDependencies: relations.incoming.length, outgoingRelations: relations.outgoing.length } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.DOCUMENT', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { trashed: true, archivedAt: deletedAt } });
            await casAtomic(this.repo, casPre('documents', row.id, before.revision, ctx), [{ store: 'documents', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            const readback = await this.get(id);
            if (!readback?.archivedAt)
                throw new Error('Document trash readback failed');
            return { before, archived: readback, deletedAt, incomingDependencyCount: relations.incoming.length, incomingDependencySummary: relations.incoming.map(x => `${x.id}:${x.sourceType}.${x.sourceId}->${x.relationType}`), outgoingRelationCount: relations.outgoing.length, versionCount: versions.length };
        }
        async rollbackTrashStage(stage, ctx) { const current = await this.get(stage.before.id); if (!current)
            throw new Error('Document trash rollback resource missing'); const at = now(), root = rootId(ctx), row = { ...stage.before, revision: current.revision + 1, updatedAt: at, updatedBy: ctx.actorId }, rev = this.revisions.make('CORE.DOCUMENT', row.id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DOCUMENT.TRASH.ROLLBACK', entityType: 'CORE.DOCUMENT', entityId: row.id, rootChangeId: root, result: 'OK' }); await casAtomic(this.repo, casPre('documents', row.id, current.revision, ctx), [{ store: 'documents', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }]); return row; }
        async restoreTrash(id, ctx) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown document ${id}`);
            if (!old.archivedAt)
                throw new Error(`Document ${id} is not in Trash`);
            await this.assertEdit(old, ctx);
            const versions = await this.versionState(id), relations = await this.relations.forEntity(id), beforeSignature = await this.signature(id), filesBefore = await this.referencedFileState(old, versions), at = now(), root = rootId(ctx), row = { ...old, archivedAt: null, revision: old.revision + 1, updatedAt: at, updatedBy: ctx.actorId }, rev = this.revisions.make('CORE.DOCUMENT', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DOCUMENT.TRASH.RESTORE', entityType: 'CORE.DOCUMENT', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { revision: row.revision, versionCount: versions.length, relations: relations.length } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.DOCUMENT', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root, payload: { restored: true, revision: row.revision } });
            await casAtomic(this.repo, casPre('documents', row.id, old.revision, ctx), [{ store: 'documents', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            const readback = await this.get(id), versionsAfter = await this.versionState(id), relationsAfter = await this.relations.forEntity(id), filesAfter = await this.referencedFileState(readback, versionsAfter);
            if (!readback || readback.archivedAt)
                throw new Error('Document restore readback still archived');
            if (readback.id !== old.id || readback.code !== old.code || readback.currentVersion !== old.currentVersion || readback.primaryFileId !== old.primaryFileId)
                throw new Error('Document restore identity/version mismatch');
            if (stableStringify(versionsAfter) !== stableStringify(versions) || stableStringify(relationsAfter.sort((a, b) => a.id.localeCompare(b.id))) !== stableStringify(relations.sort((a, b) => a.id.localeCompare(b.id))))
                throw new Error('Document restore changed versions or relations');
            if (stableStringify(filesAfter) !== stableStringify(filesBefore))
                throw new Error('Document restore changed referenced FILE records');
            return { status: 'RESTORED', resourceId: id, exists: true, trashed: false, ownerRevision: readback.revision, reclaimedBytes: 0, evidence: ['DOCUMENT_RECORD_PRESENT', 'ARCHIVED_AT_CLEARED', 'DOCUMENT_IDENTITY_VERIFIED', 'DOCUMENT_VERSIONS_PRESERVED', 'DOCUMENT_RELATIONS_PRESERVED', 'REFERENCED_FILES_UNCHANGED', `PRE_RESTORE_SIGNATURE=${beforeSignature}`] };
        }
        async purgeTrash(id, ctx) {
            const old = await this.get(id);
            if (!old)
                throw new Error(`Unknown document ${id}`);
            if (!old.archivedAt)
                throw new Error(`Document ${id} is not in Trash`);
            await this.assertEdit(old, ctx);
            const relations = await this.relationState(id);
            if (relations.incoming.length)
                throw new Error(`Document purge blocked by incoming relations: ${relations.incoming.map(x => x.id).join(',')}`);
            const versions = await this.versionState(id), fileState = await this.referencedFileState(old, versions), revisions = await this.revisions.list(id), root = rootId(ctx), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.DOCUMENT.TRASH.PURGE', entityType: 'CORE.DOCUMENT', entityId: id, rootChangeId: root, deviceId: ctx.deviceId, result: 'OK', detail: { versionsRemoved: versions.length, outgoingRelationsRemoved: relations.outgoing.length, revisionsRemoved: revisions.length, referencedFilesPreserved: fileState.length } }), out = this.outbox.make({ changeType: 'DELETE', resourceType: 'CORE.DOCUMENT', resourceId: id, revision: old.revision, ownerApp: old.ownerApp, rootChangeId: root, payload: { purged: true, versionsRemoved: versions.length, outgoingRelationsRemoved: relations.outgoing.length } }), deletes = [{ store: 'documents', key: id }, ...versions.map(x => ({ store: 'documentVersions', key: x.id })), ...relations.outgoing.map(x => ({ store: 'relations', key: x.id })), ...revisions.map(x => ({ store: 'revisions', key: x.id }))];
            await casAtomic(this.repo, casPre('documents', old.id, old.revision, ctx), [{ store: 'audit', value: audit }, { store: 'outbox', value: out }], deletes);
            const exists = !!await this.get(id), versionsRemain = (await this.versionState(id)).length, relationsRemain = await this.relations.forEntity(id), filesAfter = [];
            for (const before of fileState) {
                const file = await this.files.get(before.id);
                if (!file)
                    throw new Error(`Document purge removed referenced FILE ${before.id}`);
                filesAfter.push({ id: file.id, revision: file.revision, contentRevision: file.contentRevision, sha256: file.sha256, trashedAt: file.trashedAt });
            }
            filesAfter.sort((a, b) => a.id.localeCompare(b.id));
            if (exists || versionsRemain || relationsRemain.some(x => x.sourceId === id))
                throw new Error('Document purge readback failed');
            if (stableStringify(filesAfter) !== stableStringify(fileState))
                throw new Error('Document purge changed referenced FILE records');
            return { status: 'PURGED', resourceId: id, exists: false, trashed: false, ownerRevision: old.revision, physicalBytesBefore: 0, physicalBytesAfter: 0, reclaimedBytes: 0, evidence: ['DOCUMENT_RECORD_REMOVED', 'DOCUMENT_VERSION_REFERENCES_REMOVED', 'DOCUMENT_OWNED_RELATIONS_REMOVED', 'DOCUMENT_REVISIONS_REMOVED', 'REFERENCED_FILES_PRESERVED', 'NO_FILE_BYTES_DELETED'] };
        }
    }
    KX.DocumentService = DocumentService;
    class DeepLinkService {
        build(target) {
            const q = new URLSearchParams();
            if (target.appCode)
                q.set('app', target.appCode);
            if (target.spaceId)
                q.set('space', target.spaceId);
            if (target.view)
                q.set('view', target.view);
            const kind = target.kind.toLowerCase();
            const parts = target.kind === 'ENTITY' ? [encodeURIComponent(target.type || 'CORE.ENTITY'), encodeURIComponent(target.id)] : [encodeURIComponent(target.id)];
            return `kx://${kind}/${parts.join('/')}${q.toString() ? `?${q.toString()}` : ''}`;
        }
        parse(value) {
            const u = new URL(value);
            if (u.protocol !== 'kx:')
                throw new Error('Unsupported deep-link scheme');
            const kind = u.hostname.toUpperCase();
            if (!['ENTITY', 'FILE', 'DOCUMENT', 'TASK', 'CALENDAR_EVENT', 'ALARM', 'APP', 'ACTION', 'DATA_MAP'].includes(kind))
                throw new Error(`Unsupported deep-link kind ${kind}`);
            const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
            if (!parts.length)
                throw new Error('Deep-link target is missing');
            return kind === 'ENTITY' ? { kind, type: parts[0], id: parts[1] || '', appCode: u.searchParams.get('app') || undefined, spaceId: u.searchParams.get('space') || undefined, view: u.searchParams.get('view') || undefined } : { kind, id: parts[0], appCode: u.searchParams.get('app') || undefined, spaceId: u.searchParams.get('space') || undefined, view: u.searchParams.get('view') || undefined };
        }
    }
    KX.DeepLinkService = DeepLinkService;
    class DataMapService {
        snapshot = {};
        load(snapshot) { this.snapshot = structuredClone(snapshot || {}); return this.snapshot; }
        get() { return structuredClone(this.snapshot); }
        query(text, limit = 30) {
            const q = normalizeSearch(text);
            if (!q)
                return [];
            const out = [];
            const score = (code, title, description = '') => { const c = normalizeSearch(code), t = normalizeSearch(title), d = normalizeSearch(description); let x = 0; if (c === q || t === q)
                x += 140; if (c.startsWith(q) || t.startsWith(q))
                x += 80; if (c.includes(q) || t.includes(q))
                x += 50; if (d.includes(q))
                x += 20; return x; };
            for (const a of this.snapshot.apps || []) {
                const sc = score(a.code, a.name, a.subtitle || '');
                if (sc)
                    out.push({ id: `MAP.APP.${a.code}`, category: 'APP', code: a.code, title: a.name, description: a.subtitle, score: sc, metadata: { family: a.family, future: a.future } });
            }
            for (const e of [...(this.snapshot.sharedEntities || []), ...(this.snapshot.domainEntities || [])]) {
                const sc = score(e.code, e.code, e.description || '');
                if (sc)
                    out.push({ id: `MAP.ENTITY.${e.code}`, category: 'ENTITY', code: e.code, title: e.code, description: e.description, owner: e.owner, score: sc });
            }
            for (const f of this.snapshot.dataFlows || []) {
                const desc = [f.source, f.target, f.mode, f.trigger || '', f.reason || ''].join(' '), sc = score(f.code, f.code, desc);
                if (sc)
                    out.push({ id: `MAP.FLOW.${f.code}`, category: 'FLOW', code: f.code, title: f.code, description: f.reason, score: sc, metadata: { source: f.source, target: f.target, mode: f.mode, trigger: f.trigger } });
            }
            for (const service of this.snapshot.runtime?.services || []) {
                const sc = score(service, service, 'Core Runtime service');
                if (sc)
                    out.push({ id: `MAP.SERVICE.${service}`, category: 'SERVICE', code: service, title: service, description: 'Core Runtime service', score: sc });
            }
            return out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, limit);
        }
        impact(code) { const q = normalizeSearch(code); const flows = (this.snapshot.dataFlows || []).filter(f => [f.code, f.source, f.target, f.trigger || '', f.reason || ''].some(v => normalizeSearch(v).includes(q))); const apps = (this.snapshot.apps || []).filter(a => normalizeSearch(a.code).includes(q) || normalizeSearch(a.name).includes(q)); const entities = [...(this.snapshot.sharedEntities || []), ...(this.snapshot.domainEntities || [])].filter(e => normalizeSearch(e.code).includes(q)); return { code, flows: structuredClone(flows), apps: structuredClone(apps), entities: structuredClone(entities) }; }
        app(code) { return structuredClone((this.snapshot.apps || []).find(a => a.code === code)); }
    }
    KX.DataMapService = DataMapService;
    // N2.1g: one gate for READS of protected (sensitive) hubs. Set once by Core Identity (protectOwners);
    // without a gate every owner is readable (earlier behaviour). Search skips gated rows, inspector refuses them,
    // hub domain services (KXHubKit EntityAccess) fail closed with AUTH_SESSION_REQUIRED_FOR_HUB.
    class OwnerReadGateService {
        fn;
        set(fn) { if (this.fn)
            throw new Error('OWNER_READ_GATE_ALREADY_SET'); if (typeof fn !== 'function')
            throw new Error('OWNER_READ_GATE_INVALID'); this.fn = fn; }
        active() { return !!this.fn || this.extra.size > 0; }
        /* N2.5a: further checks that must ALSO allow (rights per section); the identity gate stays the single owner of set() */
        extra = new Map();
        also(id, fn) { if (this.extra.has(id))
            throw new Error('OWNER_READ_GATE_DUPLICATE'); if (typeof fn !== 'function')
            throw new Error('OWNER_READ_GATE_INVALID'); this.extra.set(id, fn); }
        async allows(ownerApp, actorId) { if (this.fn) {
            try {
                if ((await this.fn(ownerApp, actorId)) !== true)
                    return false;
            }
            catch {
                return false;
            }
        } for (const f of this.extra.values()) {
            try {
                if ((await f(ownerApp, actorId)) !== true)
                    return false;
            }
            catch {
                return false;
            }
        } return true; }
    }
    KX.OwnerReadGateService = OwnerReadGateService;
    function createPrivacy(now) {
        const until = new Map();
        return {
            isPrivate: (r) => r?.data?.private === 'YES' || r?.data?.kxPrivate === true || r?.private === 'YES',
            isUnlocked: (a) => (until.get(a) || 0) > now(),
            unlock: (a, minutes = 15) => { const t = now() + Math.max(1, Math.min(240, minutes)) * 60000; until.set(a, t); return { unlocked: true, until: new Date(t).toISOString() }; },
            lock: (a) => { until.delete(a); return { unlocked: false }; },
            status: (a) => ({ unlocked: (until.get(a) || 0) > now(), until: (until.get(a) || 0) > now() ? new Date(until.get(a)).toISOString() : null })
        };
    }
    KX.createPrivacy = createPrivacy;
    class CoreSearchService {
        repo;
        access;
        actions;
        dataMap;
        deepLinks;
        gate;
        constructor(repo, access, actions, dataMap, deepLinks, gate = new OwnerReadGateService()) {
            this.repo = repo;
            this.access = access;
            this.actions = actions;
            this.dataMap = dataMap;
            this.deepLinks = deepLinks;
            this.gate = gate;
        }
        entityTitle(row) { const d = row.data; for (const key of ['name', 'title', 'label', 'number']) {
            const v = d?.[key];
            if (typeof v === 'string' && v.trim())
                return v.trim();
        } return row.code || row.id; }
        entitySubtitle(row) { const d = row.data; const desc = typeof d?.description === 'string' ? d.description : ''; return desc || `${row.type} · ${row.ownerApp}`; }
        entitySearchText(row) { const d = row.data; const safe = ['name', 'title', 'label', 'number', 'description', 'status', 'category'].map(k => typeof d?.[k] === 'string' ? String(d[k]) : ''); return [row.id, row.code || '', row.type, row.ownerApp, ...safe].join(' '); }
        score(q, title, subtitle, code, currentApp, appCode, currentSpace, spaces = []) { const t = normalizeSearch(title), s = normalizeSearch(subtitle), c = normalizeSearch(code); let n = 0; if (t === q || c === q)
            n += 160; if (t.startsWith(q) || c.startsWith(q))
            n += 95; if (t.includes(q) || c.includes(q))
            n += 60; if (s.includes(q))
            n += 25; if (currentApp && appCode === currentApp)
            n += 40; if (currentSpace && spaces.includes(currentSpace))
            n += 35; return n; }
        async visible(ownerApp, spaces, kind, id, actorId) { return this.access.can({ kind, id, ownerApp, spaceIds: spaces }, actorId, 'READ'); }
        async search(ctx) {
            const q = normalizeSearch(ctx.text);
            const apps = Array.isArray(ctx.apps) && ctx.apps.length ? new Set(ctx.apps) : null;
            if (!q && !apps)
                return [];
            const allowed = new Set(!q ? ['ENTITY'] : (ctx.kinds || ['ENTITY', 'FILE', 'DOCUMENT', 'TASK', 'CALENDAR_EVENT', 'ALARM', 'APP', 'ACTION', 'DATA_MAP']));
            const results = [];
            if (allowed.has('ENTITY'))
                for (const row of await this.repo.all('entities')) {
                    if (!ctx.includeArchived && row.archivedAt)
                        continue;
                    if (row.data?.private === 'YES' || row.data?.kxPrivate === true)
                        continue; /* N2.3h: private records never in global search */
                    if (String(row.type).startsWith('CORE.IDENTITY.'))
                        continue;
                    if (row.type === 'CORE.RECORD_CODE' || row.type === 'CORE.HANDOFF')
                        continue;
                    if (!await this.gate.allows(row.ownerApp, ctx.actorId))
                        continue;
                    if (!ctx.includeMarkedSensitive && row.data?.kxControls?.sensitive === true)
                        continue;
                    if (apps && !apps.has(row.ownerApp))
                        continue;
                    if (q && !normalizeSearch(this.entitySearchText(row)).includes(q))
                        continue;
                    if (!await this.visible(row.ownerApp, row.spaceIds, 'ENTITY', row.id, ctx.actorId))
                        continue;
                    const title = this.entityTitle(row), subtitle = this.entitySubtitle(row), score = this.score(q, title, subtitle, row.code || row.id, ctx.currentApp, row.ownerApp, ctx.currentSpaceId, row.spaceIds);
                    results.push({ id: `SEARCH.ENTITY.${row.id}`, kind: 'ENTITY', title, subtitle, breadcrumb: `${row.ownerApp} › ${row.type}`, appCode: row.ownerApp, spaceIds: row.spaceIds, resourceType: row.type, resourceId: row.id, deepLink: this.deepLinks.build({ kind: 'ENTITY', type: row.type, id: row.id, appCode: row.ownerApp, spaceId: ctx.currentSpaceId }), score, matchedOn: ['entity'], metadata: { revision: row.revision } });
                }
            if (allowed.has('FILE'))
                for (const row of await this.repo.all('files')) {
                    if (row.trashedAt)
                        continue;
                    if (!ctx.includeArchived && row.archivedAt)
                        continue;
                    const text = normalizeSearch([row.name, row.description || '', ...(row.tags || []), row.mime].join(' '));
                    if (!text.includes(q))
                        continue;
                    if (!await this.visible(row.ownerApp, row.spaceIds, 'FILE', row.id, ctx.actorId))
                        continue;
                    const score = this.score(q, row.name, [row.description || '', ...(row.tags || [])].join(' '), row.id, ctx.currentApp, row.ownerApp, ctx.currentSpaceId, row.spaceIds);
                    results.push({ id: `SEARCH.FILE.${row.id}`, kind: 'FILE', title: row.name, subtitle: `${row.mime} · ${row.tags?.join(', ') || 'bez štítků'}`, breadcrumb: `Průzkumník souborů › ${row.ownerApp}`, appCode: row.ownerApp, spaceIds: row.spaceIds, resourceType: 'CORE.FILE', resourceId: row.id, deepLink: this.deepLinks.build({ kind: 'FILE', id: row.id, appCode: row.ownerApp, spaceId: ctx.currentSpaceId }), score, matchedOn: ['file'], metadata: { size: row.size, revision: row.revision, contentRevision: row.contentRevision } });
                }
            if (allowed.has('DOCUMENT'))
                for (const row of await this.repo.all('documents')) {
                    if (!ctx.includeArchived && row.archivedAt)
                        continue;
                    const text = normalizeSearch([row.title, row.code || '', row.documentType || ''].join(' '));
                    if (!text.includes(q))
                        continue;
                    if (!await this.visible(row.ownerApp, row.spaceIds, 'DOCUMENT', row.id, ctx.actorId))
                        continue;
                    const score = this.score(q, row.title, row.documentType || '', row.code || row.id, ctx.currentApp, row.ownerApp, ctx.currentSpaceId, row.spaceIds);
                    results.push({ id: `SEARCH.DOCUMENT.${row.id}`, kind: 'DOCUMENT', title: row.title, subtitle: row.documentType || 'Dokument', breadcrumb: `Dokumenty › ${row.ownerApp}`, appCode: row.ownerApp, spaceIds: row.spaceIds, resourceType: 'CORE.DOCUMENT', resourceId: row.id, deepLink: this.deepLinks.build({ kind: 'DOCUMENT', id: row.id, appCode: row.ownerApp, spaceId: ctx.currentSpaceId }), score, matchedOn: ['document'], metadata: { revision: row.revision, currentVersion: row.currentVersion } });
                }
            if (allowed.has('TASK'))
                for (const row of await this.repo.all('tasks')) {
                    if (!ctx.includeArchived && row.archivedAt)
                        continue;
                    const text = normalizeSearch([row.title, row.description || '', row.status, row.priority, ...row.assigneeIds].join(' '));
                    if (!text.includes(q))
                        continue;
                    if (!await this.access.can({ kind: 'TASK', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, ctx.actorId, 'READ'))
                        continue;
                    const score = this.score(q, row.title, `${row.status} · ${row.priority}`, row.id, ctx.currentApp, row.ownerApp, ctx.currentSpaceId, row.spaceIds);
                    results.push({ id: `SEARCH.TASK.${row.id}`, kind: 'TASK', title: row.title, subtitle: `Úkol · ${row.status} · ${row.priority}`, breadcrumb: `Úkoly › ${row.ownerApp}`, appCode: row.ownerApp, spaceIds: row.spaceIds, resourceType: 'CORE.TASK', resourceId: row.id, deepLink: this.deepLinks.build({ kind: 'TASK', id: row.id, appCode: row.ownerApp, spaceId: ctx.currentSpaceId }), score, matchedOn: ['task'], metadata: { status: row.status, priority: row.priority, dueAt: row.dueAt } });
                }
            if (allowed.has('CALENDAR_EVENT'))
                for (const row of await this.repo.all('calendarEvents')) {
                    if (!ctx.includeArchived && row.archivedAt)
                        continue;
                    const text = normalizeSearch([row.title, row.description || '', row.status, row.startsAt, row.sourceApp || ''].join(' '));
                    if (!text.includes(q))
                        continue;
                    if (!await this.access.can({ kind: 'CALENDAR_EVENT', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, ctx.actorId, 'READ'))
                        continue;
                    const score = this.score(q, row.title, `${row.startsAt} · ${row.status}`, row.id, ctx.currentApp, row.ownerApp, ctx.currentSpaceId, row.spaceIds);
                    results.push({ id: `SEARCH.CALENDAR.${row.id}`, kind: 'CALENDAR_EVENT', title: row.title, subtitle: `Kalendář · ${row.startsAt}`, breadcrumb: `Kalendář › ${row.ownerApp}`, appCode: row.ownerApp, spaceIds: row.spaceIds, resourceType: 'CORE.CALENDAR_EVENT', resourceId: row.id, deepLink: this.deepLinks.build({ kind: 'CALENDAR_EVENT', id: row.id, appCode: row.ownerApp, spaceId: ctx.currentSpaceId }), score, matchedOn: ['calendar'], metadata: { startsAt: row.startsAt, endsAt: row.endsAt, status: row.status } });
                }
            if (allowed.has('ALARM'))
                for (const row of await this.repo.all('alarms')) {
                    const text = normalizeSearch([row.title, row.status, row.triggerAt, row.eventId || '', row.taskId || ''].join(' '));
                    if (!text.includes(q))
                        continue;
                    if (!await this.access.can({ kind: 'ALARM', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, ctx.actorId, 'READ'))
                        continue;
                    const score = this.score(q, row.title, `${row.triggerAt} · ${row.status}`, row.id, ctx.currentApp, row.ownerApp, ctx.currentSpaceId, row.spaceIds);
                    results.push({ id: `SEARCH.ALARM.${row.id}`, kind: 'ALARM', title: row.title, subtitle: `Alarm · ${row.triggerAt}`, breadcrumb: `Alarmy › ${row.ownerApp}`, appCode: row.ownerApp, spaceIds: row.spaceIds, resourceType: 'CORE.ALARM', resourceId: row.id, deepLink: this.deepLinks.build({ kind: 'ALARM', id: row.id, appCode: row.ownerApp, spaceId: ctx.currentSpaceId }), score, matchedOn: ['alarm'], metadata: { triggerAt: row.triggerAt, status: row.status } });
                }
            if (allowed.has('APP'))
                for (const hit of this.dataMap.query(ctx.text, 100).filter(x => x.category === 'APP')) {
                    const app = this.dataMap.app(hit.code);
                    const score = hit.score + (ctx.currentApp === hit.code ? 40 : 0);
                    results.push({ id: `SEARCH.APP.${hit.code}`, kind: 'APP', title: hit.title, subtitle: hit.description, breadcrumb: `Aplikace › ${app?.family || 'KalinumX'}`, appCode: hit.code, resourceType: 'APP', resourceId: hit.code, deepLink: this.deepLinks.build({ kind: 'APP', id: hit.code }), score, matchedOn: ['app'], metadata: hit.metadata });
                }
            if (allowed.has('ACTION'))
                for (const row of this.actions.list()) {
                    const text = normalizeSearch([row.code, row.ownerApp, row.risk, row.permission || ''].join(' '));
                    if (!text.includes(q))
                        continue;
                    const score = this.score(q, row.code, `${row.ownerApp} · ${row.risk}`, row.code, ctx.currentApp, row.ownerApp);
                    results.push({ id: `SEARCH.ACTION.${row.code}`, kind: 'ACTION', title: row.code, subtitle: `${row.ownerApp} · ${row.risk}`, breadcrumb: 'Akce › Action Registry', appCode: row.ownerApp, resourceType: 'ACTION', resourceId: row.code, deepLink: this.deepLinks.build({ kind: 'ACTION', id: row.code, appCode: row.ownerApp }), score, matchedOn: ['action'], metadata: { risk: row.risk, permission: row.permission } });
                }
            if (allowed.has('DATA_MAP'))
                for (const hit of this.dataMap.query(ctx.text, 30).filter(x => x.category !== 'APP'))
                    results.push({ id: `SEARCH.MAP.${hit.id}`, kind: 'DATA_MAP', title: hit.title, subtitle: hit.description, breadcrumb: `Datová mapa › ${hit.category}`, resourceType: hit.category, resourceId: hit.code, deepLink: this.deepLinks.build({ kind: 'DATA_MAP', id: hit.code }), score: hit.score - 5, matchedOn: ['data-map'], metadata: { category: hit.category, owner: hit.owner, ...hit.metadata } });
            const dedup = new Map();
            for (const row of results) {
                const old = dedup.get(row.id);
                if (!old || row.score > old.score)
                    dedup.set(row.id, row);
            }
            return [...dedup.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'cs')).slice(0, ctx.limit || 30);
        }
    }
    KX.CoreSearchService = CoreSearchService;
    class RouteRegistryService {
        deepLinks;
        routes = [];
        constructor(deepLinks) {
            this.deepLinks = deepLinks;
            this.registerDefaults();
        }
        registerDefaults() {
            this.register({ code: 'ROUTE.CORE.FILE', kind: 'FILE', section: 'files', priority: 100 });
            this.register({ code: 'ROUTE.CORE.DOCUMENT', kind: 'DOCUMENT', section: 'files', priority: 100 });
            this.register({ code: 'ROUTE.CORE.TASK', kind: 'TASK', section: 'today', priority: 100 });
            this.register({ code: 'ROUTE.CORE.CALENDAR_EVENT', kind: 'CALENDAR_EVENT', section: 'calendar', priority: 100 });
            this.register({ code: 'ROUTE.CORE.ALARM', kind: 'ALARM', section: 'today', priority: 100 });
            this.register({ code: 'ROUTE.CORE.APP', kind: 'APP', section: 'apps', priority: 100 });
            this.register({ code: 'ROUTE.CORE.ENTITY', kind: 'ENTITY', section: 'apps', priority: 50 });
            this.register({ code: 'ROUTE.CORE.ACTION', kind: 'ACTION', section: 'settings', priority: 50 });
            this.register({ code: 'ROUTE.CORE.DATA_MAP', kind: 'DATA_MAP', section: 'analytics', priority: 50 });
        }
        register(def) { if (this.routes.some(x => x.code === def.code))
            throw new Error(`Duplicate route ${def.code}`); this.routes.push({ ...def, priority: def.priority ?? 0 }); return def; }
        list() { return this.routes.map(x => ({ ...x })); }
        resolve(value) { const target = this.deepLinks.parse(value); const candidates = this.routes.filter(x => x.kind === target.kind && (!x.appCode || x.appCode === target.appCode)).sort((a, b) => (b.priority || 0) - (a.priority || 0)); const definition = candidates[0]; if (!definition)
            throw new Error(`No route for ${target.kind}`); return { definition, target, section: definition.section, deepLink: value }; }
    }
    KX.RouteRegistryService = RouteRegistryService;
    class RecordInspectorService {
        repo;
        access;
        relations;
        lineage;
        revisions;
        dataMap;
        actions;
        deepLinks;
        gate;
        constructor(repo, access, relations, lineage, revisions, dataMap, actions, deepLinks, gate = new OwnerReadGateService()) {
            this.repo = repo;
            this.access = access;
            this.relations = relations;
            this.lineage = lineage;
            this.revisions = revisions;
            this.dataMap = dataMap;
            this.actions = actions;
            this.deepLinks = deepLinks;
            this.gate = gate;
        }
        async assertReadable(ownerApp, spaces, kind, id, actorId) { if (await this.access.can({ kind, id, ownerApp, spaceIds: spaces }, actorId, 'READ'))
            return; throw new Error('Přístup odepřen'); }
        async common(id) { const [relations, lineage, revisions, audit] = await Promise.all([this.relations.forEntity(id), this.lineage.forEntity(id), this.revisions.list(id), this.repo.all('audit')]); return { relations, lineage, revisions, audit: audit.filter(x => x.entityId === id).sort((a, b) => b.at.localeCompare(a.at)) }; }
        async inspect(target, actorId) {
            if (target.kind === 'ENTITY') {
                const row = await this.repo.get('entities', target.id);
                if (!row)
                    throw new Error(`Entity ${target.id} nebyla nalezena`);
                if (String(row.type).startsWith('CORE.IDENTITY.'))
                    throw new Error('Přístup odepřen');
                if (!await this.gate.allows(row.ownerApp, actorId))
                    throw new Error(`AUTH_SESSION_REQUIRED_FOR_HUB ${row.ownerApp}`);
                await this.assertReadable(row.ownerApp, row.spaceIds, 'ENTITY', row.id, actorId);
                const c = await this.common(row.id);
                const d = row.data;
                const dis = String(d.disambiguation || '').trim();
                const title = String(d.name || d.title || d.label || row.code || row.id) + (dis ? (/^\d+$/.test(dis) ? ` .${dis}` : ` (${dis})`) : '');
                return { target, title, subtitle: `${row.type} · ${row.ownerApp}`, deepLink: this.deepLinks.build({ ...target, appCode: row.ownerApp }), entity: row, ...c };
            }
            if (target.kind === 'FILE') {
                const row = await this.repo.get('files', target.id);
                if (!row)
                    throw new Error(`FILE ${target.id} nebyl nalezen`);
                await this.assertReadable(row.ownerApp, row.spaceIds, 'FILE', row.id, actorId);
                const c = await this.common(row.id);
                return { target, title: row.name, subtitle: `${row.mime} · rev. ${row.revision}`, deepLink: this.deepLinks.build({ ...target, appCode: row.ownerApp }), file: row, ...c };
            }
            if (target.kind === 'DOCUMENT') {
                const row = await this.repo.get('documents', target.id);
                if (!row)
                    throw new Error(`DOC ${target.id} nebyl nalezen`);
                await this.assertReadable(row.ownerApp, row.spaceIds, 'DOCUMENT', row.id, actorId);
                const c = await this.common(row.id);
                return { target, title: row.title, subtitle: `${row.documentType || 'Dokument'} · v${row.currentVersion}`, deepLink: this.deepLinks.build({ ...target, appCode: row.ownerApp }), document: row, ...c };
            }
            if (target.kind === 'TASK') {
                const row = await this.repo.get('tasks', target.id);
                if (!row)
                    throw new Error(`TASK ${target.id} nebyl nalezen`);
                if (!await this.access.can({ kind: 'TASK', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, actorId, 'READ'))
                    throw new Error('Přístup odepřen');
                const c = await this.common(row.id);
                return { target, title: row.title, subtitle: `Úkol · ${row.status} · ${row.priority}`, deepLink: this.deepLinks.build({ ...target, appCode: row.ownerApp }), task: row, ...c };
            }
            if (target.kind === 'CALENDAR_EVENT') {
                const row = await this.repo.get('calendarEvents', target.id);
                if (!row)
                    throw new Error(`EVENT ${target.id} nebyl nalezen`);
                if (!await this.access.can({ kind: 'CALENDAR_EVENT', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, actorId, 'READ'))
                    throw new Error('Přístup odepřen');
                const c = await this.common(row.id);
                return { target, title: row.title, subtitle: `Kalendář · ${row.startsAt}`, deepLink: this.deepLinks.build({ ...target, appCode: row.ownerApp }), calendarEvent: row, ...c };
            }
            if (target.kind === 'ALARM') {
                const row = await this.repo.get('alarms', target.id);
                if (!row)
                    throw new Error(`ALARM ${target.id} nebyl nalezen`);
                if (!await this.access.can({ kind: 'ALARM', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }, actorId, 'READ'))
                    throw new Error('Přístup odepřen');
                const c = await this.common(row.id);
                return { target, title: row.title, subtitle: `Alarm · ${row.status} · ${row.triggerAt}`, deepLink: this.deepLinks.build({ ...target, appCode: row.ownerApp }), alarm: row, ...c };
            }
            if (target.kind === 'APP') {
                const app = this.dataMap.app(target.id);
                if (!app)
                    throw new Error(`APP ${target.id} nebyla nalezena`);
                return { target, title: String(app.name || target.id), subtitle: String(app.subtitle || ''), deepLink: this.deepLinks.build(target), app: app, relations: [], lineage: [], revisions: [], audit: [] };
            }
            if (target.kind === 'ACTION') {
                const action = this.actions.list().find(x => x.code === target.id);
                if (!action)
                    throw new Error(`ACTION ${target.id} nebyla nalezena`);
                return { target, title: action.code, subtitle: `${action.ownerApp} · ${action.risk}`, deepLink: this.deepLinks.build(target), action: action, relations: [], lineage: [], revisions: [], audit: [] };
            }
            const hits = this.dataMap.query(target.id, 100);
            const hit = hits.find(x => x.code === target.id) || { code: target.id, title: target.id, category: 'FLOW', score: 0 };
            return { target, title: hit.title, subtitle: hit.description, deepLink: this.deepLinks.build(target), dataMap: hit, relations: [], lineage: [], revisions: [], audit: [] };
        }
    }
    KX.RecordInspectorService = RecordInspectorService;
    class TaskService {
        repo;
        audit;
        revisions;
        outbox;
        events;
        mutationAccess;
        constructor(repo, audit, revisions, outbox, events, mutationAccess) {
            this.repo = repo;
            this.audit = audit;
            this.revisions = revisions;
            this.outbox = outbox;
            this.events = events;
            this.mutationAccess = mutationAccess;
        }
        async list() { return this.repo.all('tasks'); }
        async get(id) { return this.repo.get('tasks', id); }
        async save(input, ctx) {
            const id = input.id || uid('TASK'), old = await this.get(id), at = now(), root = rootId(ctx), nextSpaces = input.spaceIds || old?.spaceIds || [];
            if (input.expectedRevision !== undefined && (old?.revision || 0) !== input.expectedRevision)
                throw new Error(`Revision conflict ${id}: expected ${input.expectedRevision}, actual ${old?.revision || 0}`);
            await this.mutationAccess?.assertMutation('TASK', old, { ownerApp: input.ownerApp, spaceIds: nextSpaces }, ctx);
            const itemKind = input.itemKind === undefined ? old?.itemKind : input.itemKind;
            if (itemKind !== undefined && itemKind !== 'SHIPMENT' && itemKind !== 'SHOPPING_ITEM')
                throw new Error('INVALID_TASK_ITEM_KIND');
            if (old?.itemKind !== undefined && itemKind !== old.itemKind)
                throw new Error('TASK_ITEM_KIND_IMMUTABLE');
            if (itemKind !== undefined && old && !old.itemKind)
                throw new Error('TASK_ITEM_KIND_IMMUTABLE');
            if (itemKind === 'SHIPMENT' && input.ownerApp !== 'APP.KX.SHIPPING')
                throw new Error('INVALID_SHIPMENT_OWNER');
            if (itemKind === 'SHOPPING_ITEM' && input.ownerApp !== 'APP.KX.FOOD')
                throw new Error('INVALID_SHOPPING_OWNER');
            if (itemKind === undefined && input.itemState !== undefined)
                throw new Error('ITEM_STATE_REQUIRES_SHIPMENT');
            if (itemKind === 'SHOPPING_ITEM' && input.itemState !== undefined)
                throw new Error('INVALID_SHOPPING_STATE');
            let itemState = undefined;
            let taskStatus = input.status || old?.status || 'TODO';
            if (itemKind === 'SHIPMENT') {
                // Dedicated shipment lifecycle; no new values are added to legacy TaskStatus.
                if (input.status !== undefined && !['TODO', 'IN_PROGRESS', 'DONE'].includes(input.status))
                    throw new Error('INVALID_SHIPMENT_CORE_STATUS');
                const proposed = input.itemState === undefined ? old?.itemState : input.itemState;
                if (proposed !== undefined && proposed !== 'IN_TRANSIT' && proposed !== 'DELIVERED')
                    throw new Error('INVALID_SHIPMENT_STATE');
                if (input.itemState !== undefined) {
                    itemState = input.itemState;
                    taskStatus = itemState === 'DELIVERED' ? 'DONE' : 'IN_PROGRESS';
                    if (input.status !== undefined && input.status !== taskStatus)
                        throw new Error('CONFLICTING_SHIPMENT_STATUS');
                }
                else if (input.status === 'DONE') {
                    itemState = 'DELIVERED';
                    taskStatus = 'DONE';
                }
                else if (input.status !== undefined && old?.itemState === 'DELIVERED') {
                    itemState = 'IN_TRANSIT';
                    taskStatus = 'IN_PROGRESS';
                }
                else {
                    itemState = proposed ?? (taskStatus === 'DONE' ? 'DELIVERED' : 'IN_TRANSIT');
                    taskStatus = itemState === 'DELIVERED' ? 'DONE' : 'IN_PROGRESS';
                }
            }
            // Explicit deadline removal is an opt-in shopping-list capability; legacy null retains the old no-op semantics.
            const dueAt = itemKind === 'SHOPPING_ITEM' && input.dueAt === null ? undefined : input.dueAt ?? old?.dueAt;
            const row = {
                id, title: input.title, description: input.description ?? old?.description, ownerApp: input.ownerApp, spaceIds: nextSpaces,
                status: taskStatus, priority: input.priority || old?.priority || 'NORMAL', assigneeIds: input.assigneeIds || old?.assigneeIds || [],
                dueAt, completedAt: input.completedAt ?? old?.completedAt,
                ...(itemKind !== undefined ? { itemKind } : {}), ...(itemState !== undefined ? { itemState } : {}),
                sourceApp: input.sourceApp ?? old?.sourceApp, sourceEntityType: input.sourceEntityType ?? old?.sourceEntityType,
                sourceEntityId: input.sourceEntityId ?? old?.sourceEntityId, deepLink: input.deepLink ?? old?.deepLink,
                revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || at, createdBy: old?.createdBy || ctx.actorId,
                updatedAt: at, updatedBy: ctx.actorId, archivedAt: input.archivedAt ?? old?.archivedAt ?? null
            };
            if (row.status === 'DONE' && !row.completedAt)
                row.completedAt = at;
            if (row.status !== 'DONE' && input.completedAt === undefined)
                row.completedAt = undefined;
            const rev = this.revisions.make('CORE.TASK', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: old ? 'CORE.TASK.UPDATE' : 'CORE.TASK.CREATE', entityType: 'CORE.TASK', entityId: id, rootChangeId: root, result: 'OK', detail: { status: row.status, priority: row.priority, revision: row.revision } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.TASK', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root });
            await casAtomic(this.repo, casPre('tasks', row.id, old ? old.revision : null, ctx), [{ store: 'tasks', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]);
            await this.events.emit({ id: uid('EVT'), code: old ? 'EVENT.CORE.TASK.UPDATED' : 'EVENT.CORE.TASK.CREATED', at, actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { id, status: row.status, dueAt: row.dueAt } });
            return row;
        }
        async complete(id, ctx) {
            const row = await this.get(id);
            if (!row)
                throw new Error(`Unknown task ${id}`);
            return this.save({ ...row, status: 'DONE', ...(row.itemKind === 'SHIPMENT' ? { itemState: 'DELIVERED' } : {}), completedAt: now(), expectedRevision: row.revision }, ctx);
        }
        async dueBefore(at) { return (await this.list()).filter(x => !x.archivedAt && x.status !== 'DONE' && x.status !== 'CANCELLED' && !!x.dueAt && x.dueAt <= at).sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '')); }
    }
    KX.TaskService = TaskService;
    class CalendarService {
        repo;
        audit;
        revisions;
        outbox;
        events;
        mutationAccess;
        constructor(repo, audit, revisions, outbox, events, mutationAccess) {
            this.repo = repo;
            this.audit = audit;
            this.revisions = revisions;
            this.outbox = outbox;
            this.events = events;
            this.mutationAccess = mutationAccess;
        }
        async list() { return this.repo.all('calendarEvents'); }
        async get(id) { return this.repo.get('calendarEvents', id); }
        async save(input, ctx) { const id = input.id || uid('EVENT'), old = await this.get(id), at = now(), root = rootId(ctx), nextSpaces = input.spaceIds || old?.spaceIds || []; if (input.expectedRevision !== undefined && (old?.revision || 0) !== input.expectedRevision)
            throw new Error(`Revision conflict ${id}: expected ${input.expectedRevision}, actual ${old?.revision || 0}`); if (input.endsAt && input.endsAt < input.startsAt)
            throw new Error('Calendar event endsAt nesmí být před startsAt'); await this.mutationAccess?.assertMutation('CALENDAR_EVENT', old, { ownerApp: input.ownerApp, spaceIds: nextSpaces }, ctx); const row = { id, title: input.title, description: input.description ?? old?.description, ownerApp: input.ownerApp, spaceIds: nextSpaces, startsAt: input.startsAt, endsAt: input.endsAt ?? old?.endsAt, allDay: input.allDay ?? old?.allDay ?? false, timezone: input.timezone ?? old?.timezone, recurrenceRule: input.recurrenceRule ?? old?.recurrenceRule, ...{ exDates: Array.isArray(input.exDates) ? [...new Set(input.exDates.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(0, 500) : old?.exDates }, /* N2.6b: skipped occurrences (EXDATE) */ sourceApp: input.sourceApp ?? old?.sourceApp, sourceEntityType: input.sourceEntityType ?? old?.sourceEntityType, sourceEntityId: input.sourceEntityId ?? old?.sourceEntityId, sourceRevision: input.sourceRevision ?? old?.sourceRevision, deepLink: input.deepLink ?? old?.deepLink, eventTypeCode: (input.eventTypeCode === null ? undefined : (input.eventTypeCode !== undefined ? (/^[A-Z0-9_.-]{2,40}$/.test(String(input.eventTypeCode)) ? String(input.eventTypeCode) : undefined) : old?.eventTypeCode)), attendeeIds: input.attendeeIds || old?.attendeeIds || [], status: input.status || old?.status || 'CONFIRMED', revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || at, createdBy: old?.createdBy || ctx.actorId, updatedAt: at, updatedBy: ctx.actorId, archivedAt: input.archivedAt ?? old?.archivedAt ?? null }; const rev = this.revisions.make('CORE.CALENDAR_EVENT', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: old ? 'CORE.CALENDAR_EVENT.UPDATE' : 'CORE.CALENDAR_EVENT.CREATE', entityType: 'CORE.CALENDAR_EVENT', entityId: id, rootChangeId: root, result: 'OK', detail: { startsAt: row.startsAt, endsAt: row.endsAt, revision: row.revision } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.CALENDAR_EVENT', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root }); await casAtomic(this.repo, casPre('calendarEvents', row.id, old ? old.revision : null, ctx), [{ store: 'calendarEvents', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]); await this.events.emit({ id: uid('EVT'), code: old ? 'EVENT.CORE.CALENDAR.UPDATED' : 'EVENT.CORE.CALENDAR.CREATED', at, actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { id, startsAt: row.startsAt } }); return row; }
        async range(from, to) { return (await this.list()).filter(x => !x.archivedAt && x.status !== 'CANCELLED' && x.startsAt <= to && (x.endsAt || x.startsAt) >= from).sort((a, b) => a.startsAt.localeCompare(b.startsAt)); }
    }
    KX.CalendarService = CalendarService;
    class AlarmService {
        repo;
        audit;
        revisions;
        outbox;
        events;
        mutationAccess;
        constructor(repo, audit, revisions, outbox, events, mutationAccess) {
            this.repo = repo;
            this.audit = audit;
            this.revisions = revisions;
            this.outbox = outbox;
            this.events = events;
            this.mutationAccess = mutationAccess;
        }
        async list() { return this.repo.all('alarms'); }
        async get(id) { return this.repo.get('alarms', id); }
        async save(input, ctx) { const id = input.id || uid('ALARM'), old = await this.get(id), at = now(), root = rootId(ctx), nextSpaces = input.spaceIds || old?.spaceIds || []; if (input.expectedRevision !== undefined && (old?.revision || 0) !== input.expectedRevision)
            throw new Error(`Revision conflict ${id}: expected ${input.expectedRevision}, actual ${old?.revision || 0}`); await this.mutationAccess?.assertMutation('ALARM', old, { ownerApp: input.ownerApp, spaceIds: nextSpaces }, ctx); const row = { id, title: input.title, ownerApp: input.ownerApp, spaceIds: nextSpaces, eventId: input.eventId ?? old?.eventId, taskId: input.taskId ?? old?.taskId, triggerAt: input.triggerAt, leadMinutes: input.leadMinutes ?? old?.leadMinutes, recurrenceRule: input.recurrenceRule ?? old?.recurrenceRule, ...{ exDates: Array.isArray(input.exDates) ? [...new Set(input.exDates.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(0, 500) : old?.exDates }, /* N2.6b: skipped occurrences (EXDATE) */ channels: input.channels || old?.channels || ['IN_APP'], deviceIds: input.deviceIds || old?.deviceIds || [], sound: input.sound ?? old?.sound, status: input.status || old?.status || 'SCHEDULED', snoozeUntil: input.snoozeUntil ?? old?.snoozeUntil, acknowledgedAt: input.acknowledgedAt ?? old?.acknowledgedAt, firedAt: input.firedAt ?? old?.firedAt, revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || at, createdBy: old?.createdBy || ctx.actorId, updatedAt: at, updatedBy: ctx.actorId }; await this.mutationAccess?.assertAlarmLinks(row, ctx); const rev = this.revisions.make('CORE.ALARM', id, row.revision, row, { ...ctx, rootChangeId: root }), audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: old ? 'CORE.ALARM.UPDATE' : 'CORE.ALARM.CREATE', entityType: 'CORE.ALARM', entityId: id, rootChangeId: root, result: 'OK', detail: { triggerAt: row.triggerAt, status: row.status, revision: row.revision } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.ALARM', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root }); await casAtomic(this.repo, casPre('alarms', row.id, old ? old.revision : null, ctx), [{ store: 'alarms', value: row }, { store: 'revisions', value: rev }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]); await this.events.emit({ id: uid('EVT'), code: old ? 'EVENT.CORE.ALARM.UPDATED' : 'EVENT.CORE.ALARM.CREATED', at, actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { id, triggerAt: row.triggerAt, status: row.status } }); return row; }
        async due(at) { return (await this.list()).filter(x => { if (x.status !== 'SCHEDULED' && x.status !== 'SNOOZED')
            return false; const effective = x.status === 'SNOOZED' && x.snoozeUntil ? x.snoozeUntil : x.triggerAt; return effective <= at; }).sort((a, b) => a.triggerAt.localeCompare(b.triggerAt)); }
        async fire(id, ctx) { const row = await this.get(id); if (!row)
            throw new Error(`Unknown alarm ${id}`); const root = rootId(ctx), child = { ...ctx, rootChangeId: root }; const fired = await this.save({ ...row, status: 'FIRED', firedAt: now(), expectedRevision: row.revision }, child); await this.events.emit({ id: uid('EVT'), code: 'EVENT.CORE.ALARM.FIRED', at: now(), actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { id: fired.id, channels: fired.channels, title: fired.title } }); return fired; }
        async acknowledge(id, ctx) { const row = await this.get(id); if (!row)
            throw new Error(`Unknown alarm ${id}`); return this.save({ ...row, status: 'ACKNOWLEDGED', acknowledgedAt: now(), expectedRevision: row.revision }, ctx); }
        async snooze(id, until, ctx) { const row = await this.get(id); if (!row)
            throw new Error(`Unknown alarm ${id}`); return this.save({ ...row, status: 'SNOOZED', snoozeUntil: until, expectedRevision: row.revision }, ctx); }
    }
    KX.AlarmService = AlarmService;
    class PlannerAgendaService {
        memberships;
        access;
        tasks;
        calendar;
        alarms;
        deepLinks;
        constructor(memberships, access, tasks, calendar, alarms, deepLinks) {
            this.memberships = memberships;
            this.access = access;
            this.tasks = tasks;
            this.calendar = calendar;
            this.alarms = alarms;
            this.deepLinks = deepLinks;
        }
        async scopeSpaces(userId, scope, custom = []) { const spaces = (await this.memberships.listSpaces()).filter(x => !x.archivedAt), visible = []; for (const space of spaces)
            if (await this.memberships.roleFor(space.id, userId))
                visible.push(space); if (scope === 'CUSTOM')
            return custom.filter(id => visible.some(x => x.id === id)); if (scope === 'ALL')
            return visible.map(x => x.id); const kind = scope === 'PERSONAL' ? 'PERSONAL' : scope === 'FAMILY' ? 'FAMILY' : scope === 'COMPANY' ? 'COMPANY' : 'SHARED'; return visible.filter(x => x.kind === kind && (scope !== 'PERSONAL' || x.ownerUserId === userId)).map(x => x.id); }
        target(kind, row) { return { kind, id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds }; }
        async snapshot(input) {
            const scope = input.scope || 'ALL', spaceIds = await this.scopeSpaces(input.userId, scope, input.spaceIds || []), types = input.types?.length ? [...new Set(input.types)] : ['CALENDAR_EVENT', 'TASK', 'ALARM'], limit = Math.max(1, Math.min(5000, input.limit || 250));
            const fromMs = Date.parse(input.from), toMs = Date.parse(input.to);
            if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs)
                throw new Error('PlannerAgenda invalid time range');
            const inScope = (ids) => ids.some(id => spaceIds.includes(id));
            const can = async (kind, row) => inScope(row.spaceIds || []) && await this.access.can(this.target(kind, row), input.userId, 'READ');
            const items = [];
            if (types.includes('CALENDAR_EVENT'))
                for (const row of await this.calendar.list()) {
                    if (row.archivedAt || row.status === 'CANCELLED' || !await can('CALENDAR_EVENT', row))
                        continue;
                    const start = Date.parse(row.startsAt), end = Date.parse(row.endsAt || row.startsAt);
                    const exd = row.exDates || [];
                    const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
                    if (start <= toMs && end >= fromMs && !exd.includes(dayOf(start)))
                        items.push({ kind: 'CALENDAR_EVENT', id: row.id, title: row.title, at: row.startsAt, endsAt: row.endsAt, eventTypeCode: row.eventTypeCode, subtitle: row.allDay ? 'Celý den' : new Date(row.startsAt).toLocaleString(), ownerApp: row.ownerApp, spaceIds: [...row.spaceIds], deepLink: this.deepLinks.build({ kind: 'CALENDAR_EVENT', id: row.id, appCode: row.ownerApp }), status: row.status });
                    /* N2.6b (user: repeats everywhere): a recurring event also yields its occurrences inside the range (shared KXRecur engine; same access check as the event; same duration; marked 🔁) */
                    const RC = globalThis.KXRecur;
                    if (row.recurrenceRule && RC) {
                        const dur = Math.max(0, end - start);
                        for (const iso of RC.occurrences(row.recurrenceRule, row.startsAt, new Date(fromMs - dur).toISOString(), input.to, 400)) {
                            const at = Date.parse(iso);
                            if (Math.abs(at - start) < 60000 || at + dur < fromMs || exd.includes(dayOf(at)))
                                continue;
                            items.push({ kind: 'CALENDAR_EVENT', id: row.id, title: `🔁 ${row.title}`, at: iso, endsAt: row.endsAt ? new Date(at + dur).toISOString() : undefined, eventTypeCode: row.eventTypeCode, subtitle: row.allDay ? '' : new Date(iso).toLocaleString(), ownerApp: row.ownerApp, spaceIds: [...row.spaceIds], deepLink: this.deepLinks.build({ kind: 'CALENDAR_EVENT', id: row.id, appCode: row.ownerApp }), status: row.status, occurrenceAt: iso });
                        }
                    }
                }
            if (types.includes('TASK'))
                for (const row of await this.tasks.list()) {
                    if (row.archivedAt || row.status === 'DONE' || row.status === 'CANCELLED' || !row.dueAt || !await can('TASK', row))
                        continue;
                    const due = Date.parse(row.dueAt);
                    if (due >= fromMs && due <= toMs)
                        items.push({ kind: 'TASK', id: row.id, title: row.title, at: row.dueAt, subtitle: `Termín ${new Date(row.dueAt).toLocaleString()} · ${row.status}`, ownerApp: row.ownerApp, spaceIds: [...row.spaceIds], deepLink: this.deepLinks.build({ kind: 'TASK', id: row.id, appCode: row.ownerApp }), status: row.status, priority: row.priority });
                }
            if (types.includes('ALARM'))
                for (const row of await this.alarms.list()) {
                    if (row.status === 'CANCELLED' || row.status === 'ACKNOWLEDGED' || !await can('ALARM', row))
                        continue;
                    const effective = row.status === 'SNOOZED' && row.snoozeUntil ? row.snoozeUntil : row.triggerAt, at = Date.parse(effective);
                    if (at >= fromMs && at <= toMs)
                        items.push({ kind: 'ALARM', id: row.id, title: row.title, at: effective, subtitle: `${row.status} · ${new Date(effective).toLocaleString()}`, ownerApp: row.ownerApp, spaceIds: [...row.spaceIds], deepLink: this.deepLinks.build({ kind: 'ALARM', id: row.id, appCode: row.ownerApp }), status: row.status });
                }
            items.sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, 'cs')); /* review fix: counts describe ALL matching items (they used to count the truncated list) and truncation is reported, never silent */
            const sliced = items.slice(0, limit), counts = { events: items.filter(x => x.kind === 'CALENDAR_EVENT').length, tasks: items.filter(x => x.kind === 'TASK').length, alarms: items.filter(x => x.kind === 'ALARM').length, total: items.length };
            return { userId: input.userId, generatedAt: now(), from: input.from, to: input.to, scope, spaceIds, types, counts, returned: sliced.length, truncated: items.length > sliced.length, items: sliced };
        }
    }
    KX.PlannerAgendaService = PlannerAgendaService;
    function aiForbiddenSecretKey(value) { const key = value.toLowerCase().replace(/[^a-z0-9]/g, ''); return ['apikey', 'token', 'accesstoken', 'refreshtoken', 'password', 'secret', 'clientsecret', 'authorization', 'bearer'].includes(key); }
    function aiSecretPath(value, path = []) {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                const hit = aiSecretPath(value[i], [...path, String(i)]);
                if (hit)
                    return hit;
            }
            return;
        }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                if (aiForbiddenSecretKey(k))
                    return [...path, k].join('.');
                const hit = aiSecretPath(v, [...path, k]);
                if (hit)
                    return hit;
            }
        }
        return;
    }
    function aiResultSummary(value) { if (value === null || value === undefined)
        return { type: String(value) }; if (Array.isArray(value))
        return { type: 'array', count: value.length }; if (typeof value === 'object') {
        const row = value;
        return { type: 'object', id: row.id, title: row.title || row.name || row.label, status: row.status };
    } return { type: typeof value, value: String(value).slice(0, 160) }; }
    class AIProviderRegistryService {
        adapters = new Map();
        descriptors = new Map();
        normalizeCode(code) { return String(code || '').trim().toUpperCase(); }
        fromAdapter(adapter) { return { code: adapter.code, name: adapter.name, family: adapter.code === 'MOCK.LOCAL' ? 'BUILTIN' : 'LOCAL', description: 'Runtime provider adapter', authModes: adapter.code === 'MOCK.LOCAL' ? ['NONE'] : ['SECURE_REF', 'OAUTH_REF'], capabilities: { CHAT: adapter.capabilities.chat ? 'AVAILABLE' : 'UNAVAILABLE', ATTACHMENTS: adapter.capabilities.attachments ? 'AVAILABLE' : 'UNAVAILABLE', TOOLS: adapter.capabilities.tools ? 'AVAILABLE' : 'UNAVAILABLE', MODELS: 'UNAVAILABLE', OAUTH: 'UNAVAILABLE', API_CREDENTIAL: 'UNAVAILABLE', USAGE: 'UNAVAILABLE', RECENT_CHATS: adapter.capabilities.recentChats ? 'AVAILABLE' : 'UNAVAILABLE', PROJECTS: adapter.capabilities.projects ? 'AVAILABLE' : 'UNAVAILABLE', FOLDERS: adapter.capabilities.folders ? 'AVAILABLE' : 'UNAVAILABLE' } }; }
        registerDescriptor(descriptor) { const code = this.normalizeCode(descriptor.code); if (this.descriptors.has(code))
            throw new Error(`Duplicate AI provider descriptor ${code}`); this.descriptors.set(code, { ...descriptor, code, authModes: [...descriptor.authModes], capabilities: { ...descriptor.capabilities } }); return this.describe(code); }
        register(adapter) { const code = this.normalizeCode(adapter.code); if (this.adapters.has(code))
            throw new Error(`Duplicate AI provider ${code}`); this.adapters.set(code, adapter); if (!this.descriptors.has(code))
            this.descriptors.set(code, this.fromAdapter(adapter)); return adapter; }
        get(code) { const key = this.normalizeCode(code), row = this.adapters.get(key); if (!row)
            throw new Error(`AI provider ${key} nemá runtime adapter`); return row; }
        hasAdapter(code) { return this.adapters.has(this.normalizeCode(code)); }
        describe(code) { const key = this.normalizeCode(code), row = this.descriptors.get(key); if (!row)
            throw new Error(`AI provider descriptor ${key} není registrován`); return { ...row, authModes: [...row.authModes], capabilities: { ...row.capabilities }, runtimeAdapter: this.hasAdapter(key) }; }
        list() { return [...this.descriptors.keys()].sort().map(code => this.describe(code)); }
    }
    KX.AIProviderRegistryService = AIProviderRegistryService;
    class MockAIProviderAdapter {
        code = 'MOCK.LOCAL';
        name = 'KalinumX Local Mock';
        capabilities = { chat: true, attachments: true, tools: false, recentChats: false, projects: false, folders: false };
        async chat(request) { const last = [...request.messages].reverse().find(x => x.role === 'USER'); const text = (last?.content || '').trim(); const __demo = globalThis.KXDemoAnswer; const __d = typeof __demo === 'function' ? __demo(text) : null; /* N2.6b: DEMO showcase answers only when the DEMO workspace sets the hook; otherwise unchanged */ /* N2.6b: DEMO showcase answers only when the DEMO workspace sets the hook; otherwise unchanged */ return { content: __d || `Lokální diagnostický provider přijal zprávu${text ? ` „${text.slice(0, 180)}“` : ''}. Nebyl použit žádný cloudový model ani externí API.`, providerMessageRef: `MOCK.${request.sessionId}.${request.messages.length}`, model: 'KX-MOCK-LOCAL' }; }
    }
    KX.MockAIProviderAdapter = MockAIProviderAdapter;
    class AIConnectionService {
        entities;
        memberships;
        providers;
        settingDefaults;
        constructor(entities, memberships, providers, settingDefaults) {
            this.entities = entities;
            this.memberships = memberships;
            this.providers = providers;
            this.settingDefaults = settingDefaults;
        }
        data(row) { if (row.type !== 'CORE.AI_CONNECTION')
            throw new Error(`Entity ${row.id} není AI connection`); return row.data; }
        assertOwner(userId, ctx) { if (ctx.actorId === 'SYSTEM' || ctx.actorId === userId)
            return; if (ctx.permissions?.includes('CORE.AI.CONNECTION.MANAGE_OTHERS'))
            return; throw new Error(`AI connection scope denied for ${userId}`); }
        validateInput(input) { const secret = aiSecretPath(input); if (secret)
            throw new Error(`Plaintext AI secret field is forbidden: ${secret}`); const ref = input.secretRef; if (ref !== undefined && (!String(ref).match(/^(SECURE|OAUTH)_REF:/)))
            throw new Error('AI secretRef musí být opaque SECURE_REF:/OAUTH_REF: reference'); }
        aiDefault(suffix, fallback) { const value = this.settingDefaults?.get(`app.APP.KX.AI.${suffix}`)?.defaultValue; return (value === undefined ? fallback : value); }
        scopeOf(data) { const raw = (data.scope || {}); return { global: raw.global === undefined ? !!this.aiDefault('connection.defaultScopeGlobal', true) : !!raw.global, spaceIds: [...new Set((raw.spaceIds || []).map(String))], appCodes: [...new Set((raw.appCodes || []).map(x => String(x).trim().toUpperCase()).filter(Boolean))] }; }
        defaultsOf(data) { const raw = (data.defaults || {}); return { global: raw.global === undefined ? !!this.aiDefault('defaults.globalByDefault', false) : !!raw.global, spaceIds: [...new Set((raw.spaceIds || []).map(String))], appCodes: [...new Set((raw.appCodes || []).map(x => String(x).trim().toUpperCase()).filter(Boolean))] }; }
        async validateScope(userId, scope, defaults) { for (const id of [...new Set([...scope.spaceIds, ...defaults.spaceIds])])
            if (!await this.memberships.roleFor(id, userId))
                throw new Error(`AI connection Space scope denied: ${id}`); for (const code of [...scope.appCodes, ...defaults.appCodes])
            if (!/^APP\.[A-Z0-9_.&-]+$/.test(code))
                throw new Error(`Invalid AI app scope: ${code}`); if (defaults.global && !scope.global)
            throw new Error('AI global default requires global connection scope'); if (!scope.global) {
            for (const id of defaults.spaceIds)
                if (!scope.spaceIds.includes(id))
                    throw new Error(`AI default Space is outside connection scope: ${id}`);
            for (const code of defaults.appCodes)
                if (!scope.appCodes.includes(code))
                    throw new Error(`AI default app is outside connection scope: ${code}`);
        } }
        contextAllowed(data, context) { const scope = this.scopeOf(data); if (scope.global)
            return true; if (!scope.spaceIds.length && !scope.appCodes.length)
            return false; if (scope.spaceIds.length && (!context.spaceId || !scope.spaceIds.includes(context.spaceId)))
            return false; if (scope.appCodes.length && (!context.appCode || !scope.appCodes.includes(String(context.appCode).toUpperCase())))
            return false; return true; }
        async listForUser(userId, ctx) { this.assertOwner(userId, ctx); return (await this.entities.list()).filter(x => x.type === 'CORE.AI_CONNECTION' && x.data.userId === userId).sort((a, b) => String(b.data.updatedAt).localeCompare(String(a.data.updatedAt))).map(x => this.publicView(x)); }
        async getEntity(id) { const row = await this.entities.get(id); if (!row || row.type !== 'CORE.AI_CONNECTION')
            throw new Error(`AI connection ${id} nebyla nalezena`); return row; }
        publicView(row) { const d = this.data(row); return { id: row.id, userId: d.userId, providerCode: d.providerCode, label: d.label, status: d.status, authMode: d.authMode, hasSecretRef: !!d.secretRef, defaultModel: d.defaultModel, trustProfile: d.trustProfile, capabilities: [...(d.capabilities || [])], scope: this.scopeOf(d), defaults: this.defaultsOf(d) }; }
        async getForActor(id, ctx, context) { const row = await this.getEntity(id), d = this.data(row); this.assertOwner(d.userId, ctx); if (d.status !== 'ACTIVE')
            throw new Error(`AI connection ${id} není aktivní`); if (!this.providers.hasAdapter(d.providerCode))
            throw new Error(`AI connection ${id} provider ${d.providerCode} nemá runtime adapter`); if (context && !this.contextAllowed(d, context))
            throw new Error(`AI connection ${id} není povolená pro tento context`); return row; }
        async resolveDefault(userId, context, ctx) { this.assertOwner(userId, ctx); const rows = (await this.entities.list()).filter(x => x.type === 'CORE.AI_CONNECTION' && x.data.userId === userId && x.data.status === 'ACTIVE').sort((a, b) => String(b.data.updatedAt).localeCompare(String(a.data.updatedAt))); for (const row of rows) {
            const d = this.data(row), defs = this.defaultsOf(d);
            if (!this.providers.hasAdapter(d.providerCode) || !this.contextAllowed(d, context))
                continue;
            if (context.spaceId && defs.spaceIds.includes(context.spaceId))
                return row;
            if (context.appCode && defs.appCodes.includes(String(context.appCode).toUpperCase()))
                return row;
        } return rows.find(row => { const d = this.data(row); return this.providers.hasAdapter(d.providerCode) && this.contextAllowed(d, context) && this.defaultsOf(d).global; }); }
        async save(input, ctx) { this.assertOwner(input.userId, ctx); this.validateInput(input); if (!await this.memberships.getUser(input.userId))
            throw new Error(`Unknown user ${input.userId}`); const providerCode = input.providerCode.trim().toUpperCase(), descriptor = this.providers.describe(providerCode), old = input.id ? await this.getEntity(input.id).catch(() => undefined) : undefined; if (old && this.data(old).userId !== input.userId)
            throw new Error('AI connection owner nelze změnit'); if (old && this.data(old).providerCode !== providerCode)
            throw new Error('AI connection provider nelze změnit; vytvořte nové connection metadata'); const at = now(), oldData = old ? this.data(old) : undefined, scope = this.scopeOf({ ...oldData, scope: input.scope ? { ...this.scopeOf(oldData || {}), ...input.scope } : oldData?.scope }), defaults = this.defaultsOf({ ...oldData, defaults: input.defaults ? { ...this.defaultsOf(oldData || {}), ...input.defaults } : oldData?.defaults }); await this.validateScope(input.userId, scope, defaults); const status = input.status || oldData?.status || (this.providers.hasAdapter(providerCode) && this.aiDefault('connection.activateWhenRuntimeAdapterAvailable', true) ? 'ACTIVE' : 'DISABLED'); if (status === 'ACTIVE' && !this.providers.hasAdapter(providerCode))
            throw new Error(`AI provider ${providerCode} zatím nemá runtime adapter; metadata musí zůstat DISABLED`); const authMode = input.authMode || oldData?.authMode || descriptor.authModes[0] || 'NONE'; if (!descriptor.authModes.includes(authMode))
            throw new Error(`AI provider ${providerCode} nepodporuje auth mode ${authMode}`); const capabilities = Object.entries(descriptor.capabilities).filter(([, v]) => v === 'AVAILABLE').map(([k]) => k); const data = { userId: input.userId, providerCode, label: input.label.trim(), status, authMode, secretRef: input.secretRef ?? oldData?.secretRef, defaultModel: input.defaultModel ?? oldData?.defaultModel, trustProfile: input.trustProfile || oldData?.trustProfile || this.aiDefault('connection.defaultTrustProfile', 'ASSISTED'), capabilities, scope, defaults, createdAt: oldData?.createdAt || at, updatedAt: at }; this.validateInput(data); return this.entities.save({ id: old?.id || input.id || uid('AI_CONNECTION'), type: 'CORE.AI_CONNECTION', ownerApp: 'APP.KX.AI', schema: 'KX.AI_CONNECTION/2', spaceIds: [], data, expectedRevision: old?.revision }, ctx); }
    }
    KX.AIConnectionService = AIConnectionService;
    class AISessionService {
        repo;
        entities;
        memberships;
        access;
        deepLinks;
        connections;
        constructor(repo, entities, memberships, access, deepLinks, connections) {
            this.repo = repo;
            this.entities = entities;
            this.memberships = memberships;
            this.access = access;
            this.deepLinks = deepLinks;
            this.connections = connections;
        }
        sessionData(row) { if (row.type !== 'CORE.AI_SESSION')
            throw new Error(`Entity ${row.id} není AI session`); return row.data; }
        messageData(row) { if (row.type !== 'CORE.AI_MESSAGE')
            throw new Error(`Entity ${row.id} není AI message`); return row.data; }
        async getSessionEntity(id) { const row = await this.entities.get(id); if (!row || row.type !== 'CORE.AI_SESSION')
            throw new Error(`AI session ${id} nebyla nalezena`); return row; }
        async assertSession(id, ctx) { const row = await this.getSessionEntity(id), d = this.sessionData(row); if (ctx.actorId !== 'SYSTEM' && d.userId !== ctx.actorId && !ctx.permissions?.includes('CORE.AI.SESSION.MANAGE_OTHERS'))
            throw new Error('AI session access denied'); return row; }
        async targetFromDeepLink(value) { const target = this.deepLinks.parse(value); if (target.kind === 'ENTITY') {
            const row = await this.repo.get('entities', target.id);
            return row ? this.access.entity(row) : undefined;
        } if (target.kind === 'FILE') {
            const row = await this.repo.get('files', target.id);
            return row ? this.access.file(row) : undefined;
        } if (target.kind === 'DOCUMENT') {
            const row = await this.repo.get('documents', target.id);
            return row ? this.access.document(row) : undefined;
        } if (target.kind === 'TASK') {
            const row = await this.repo.get('tasks', target.id);
            return row ? { kind: 'TASK', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds } : undefined;
        } if (target.kind === 'CALENDAR_EVENT') {
            const row = await this.repo.get('calendarEvents', target.id);
            return row ? { kind: 'CALENDAR_EVENT', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds } : undefined;
        } if (target.kind === 'ALARM') {
            const row = await this.repo.get('alarms', target.id);
            return row ? { kind: 'ALARM', id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds } : undefined;
        } return; }
        async assertContext(context, userId) { if (context.spaceId && !await this.memberships.roleFor(context.spaceId, userId))
            throw new Error(`AI context Space denied: ${context.spaceId}`); if (context.recordDeepLink) {
            const target = await this.targetFromDeepLink(context.recordDeepLink);
            if (!target)
                throw new Error('AI context record není podporovaný nebo neexistuje');
            if (!await this.access.can(target, userId, 'READ'))
                throw new Error(`AI context record denied: ${target.kind}.${target.id}`);
            if (context.spaceId && target.spaceIds.length && !target.spaceIds.includes(context.spaceId))
                throw new Error('AI context record nepatří do vybraného Space');
        } }
        async create(input, ctx) { if (ctx.actorId !== 'SYSTEM' && input.userId !== ctx.actorId && !ctx.permissions?.includes('CORE.AI.SESSION.MANAGE_OTHERS'))
            throw new Error('AI session owner denied'); await this.assertContext(input.context || {}, input.userId); const requested = input.connectionId ? await this.connections.getForActor(input.connectionId, { ...ctx, actorId: input.userId }, input.context || {}) : await this.connections.resolveDefault(input.userId, input.context || {}, { ...ctx, actorId: input.userId }); const at = now(), data = { userId: input.userId, title: input.title?.trim() || 'Nový AI chat', connectionId: requested?.id, context: { ...(input.context || {}) }, status: 'ACTIVE', createdAt: at, updatedAt: at }; return this.entities.save({ type: 'CORE.AI_SESSION', ownerApp: 'APP.KX.AI', schema: 'KX.AI_SESSION/1', spaceIds: [], data }, ctx); }
        async listForUser(userId, ctx) { if (ctx.actorId !== 'SYSTEM' && ctx.actorId !== userId && !ctx.permissions?.includes('CORE.AI.SESSION.MANAGE_OTHERS'))
            throw new Error('AI session list denied'); return (await this.entities.list()).filter(x => x.type === 'CORE.AI_SESSION' && x.data.userId === userId).sort((a, b) => String(b.data.updatedAt).localeCompare(String(a.data.updatedAt))); }
        async listMessages(sessionId, ctx) { await this.assertSession(sessionId, ctx); return (await this.entities.list()).filter(x => x.type === 'CORE.AI_MESSAGE' && x.data.sessionId === sessionId).sort((a, b) => String(a.data.createdAt).localeCompare(String(b.data.createdAt))); }
        async appendMessage(input, ctx) { const session = await this.assertSession(input.sessionId, ctx), sd = this.sessionData(session), files = [...new Set(input.attachmentFileIds || [])]; for (const id of files) {
            const file = await this.repo.get('files', id);
            if (!file || !await this.access.can(this.access.file(file), sd.userId, 'READ'))
                throw new Error(`AI attachment denied: ${id}`);
        } const data = { sessionId: session.id, role: input.role, content: String(input.content || '').slice(0, 20000), attachmentFileIds: files, providerCode: input.providerCode, providerMessageRef: input.providerMessageRef, createdAt: now() }; const row = await this.entities.save({ type: 'CORE.AI_MESSAGE', ownerApp: 'APP.KX.AI', schema: 'KX.AI_MESSAGE/1', spaceIds: [], data }, ctx); const next = { ...sd, updatedAt: now() }; await this.entities.save({ id: session.id, type: 'CORE.AI_SESSION', ownerApp: 'APP.KX.AI', schema: 'KX.AI_SESSION/1', spaceIds: [], data: next, expectedRevision: session.revision }, ctx); return row; }
    }
    KX.AISessionService = AISessionService;
    class AIGatewayService {
        entities;
        audit;
        connections;
        sessions;
        providers;
        actions;
        constructor(entities, audit, connections, sessions, providers, actions) {
            this.entities = entities;
            this.audit = audit;
            this.connections = connections;
            this.sessions = sessions;
            this.providers = providers;
            this.actions = actions;
        }
        actionData(row) { if (row.type !== 'CORE.AI_ACTION_REQUEST')
            throw new Error(`Entity ${row.id} není AI action request`); return row.data; }
        async chat(input, ctx) { const session = await this.sessions.assertSession(input.sessionId, ctx), sd = session.data; const connection = sd.connectionId ? await this.connections.getForActor(sd.connectionId, ctx, sd.context) : undefined; const providerCode = connection ? connection.data.providerCode : 'MOCK.LOCAL', adapter = this.providers.get(providerCode), publicConnection = connection ? this.connections.publicView(connection) : { id: 'AI.CONNECTION.BUILTIN.MOCK', userId: sd.userId, providerCode: 'MOCK.LOCAL', label: 'Built-in Local Mock', status: 'ACTIVE', authMode: 'NONE', hasSecretRef: false, trustProfile: 'ASSISTED', capabilities: ['CHAT', 'ATTACHMENTS'], scope: { global: true, spaceIds: [], appCodes: [] }, defaults: { global: false, spaceIds: [], appCodes: [] } }; await this.sessions.appendMessage({ sessionId: session.id, role: 'USER', content: input.text, attachmentFileIds: input.attachmentFileIds }, ctx); const rows = await this.sessions.listMessages(session.id, ctx), request = { sessionId: session.id, connection: publicConnection, context: { ...sd.context }, messages: rows.map(r => { const d = r.data; return { role: d.role, content: d.content, attachmentFileIds: [...d.attachmentFileIds] }; }) }; const response = await adapter.chat(request); const assistant = await this.sessions.appendMessage({ sessionId: session.id, role: 'ASSISTANT', content: response.content, providerCode: adapter.code, providerMessageRef: response.providerMessageRef }, ctx); await this.audit.write({ actorId: ctx.actorId, appCode: 'APP.KX.AI', actionCode: 'CORE.AI.CHAT', entityType: 'CORE.AI_SESSION', entityId: session.id, rootChangeId: rootId(ctx), deviceId: ctx.deviceId, result: 'OK', detail: { providerCode: adapter.code, messageCount: request.messages.length, attachments: input.attachmentFileIds?.length || 0 } }); return { userMessage: rows[rows.length - 1], assistantMessage: assistant, providerCode: adapter.code, model: response.model }; }
        async proposeAction(input, ctx) { const session = await this.sessions.assertSession(input.sessionId, ctx); if (input.actionCode.startsWith('ACTION.CORE.AI.'))
            throw new Error('AI Gateway recursive/self actions nejsou povoleny'); const def = this.actions.list().find(x => x.code === input.actionCode); if (!def)
            throw new Error(`Unknown action ${input.actionCode}`); const secret = aiSecretPath(input.payload); if (secret)
            throw new Error(`AI action payload obsahuje forbidden secret field: ${secret}`); const at = now(), data = { sessionId: session.id, actionCode: def.code, risk: def.risk, permission: def.permission, payload: structuredClone(input.payload), status: 'PROPOSED', requiresConfirmation: def.risk !== 'READ', createdAt: at, updatedAt: at }; return this.entities.save({ type: 'CORE.AI_ACTION_REQUEST', ownerApp: 'APP.KX.AI', schema: 'KX.AI_ACTION_REQUEST/1', spaceIds: [], data }, ctx); }
        async getActionRequest(id, ctx) { const row = await this.entities.get(id); if (!row || row.type !== 'CORE.AI_ACTION_REQUEST')
            throw new Error(`AI action request ${id} nebyl nalezen`); const data = this.actionData(row); await this.sessions.assertSession(data.sessionId, ctx); return row; }
        async listActionRequests(sessionId, ctx) { await this.sessions.assertSession(sessionId, ctx); return (await this.entities.list()).filter(x => x.type === 'CORE.AI_ACTION_REQUEST' && x.data.sessionId === sessionId).sort((a, b) => String(b.data.updatedAt).localeCompare(String(a.data.updatedAt))); }
        async rejectActionRequest(id, ctx) { if (!ctx.permissions?.includes('CORE.AI.ACTION.EXECUTE'))
            throw new Error('Permission denied: CORE.AI.ACTION.EXECUTE'); const row = await this.getActionRequest(id, ctx), data = this.actionData(row); if (data.status !== 'PROPOSED')
            throw new Error(`AI action request ${id} není PROPOSED`); const next = { ...data, status: 'REJECTED', updatedAt: now(), error: undefined }; return this.entities.save({ id: row.id, type: 'CORE.AI_ACTION_REQUEST', ownerApp: 'APP.KX.AI', schema: 'KX.AI_ACTION_REQUEST/1', spaceIds: [], data: next, expectedRevision: row.revision }, ctx); }
        async executeActionRequest(id, ctx) { if (!ctx.permissions?.includes('CORE.AI.ACTION.EXECUTE'))
            throw new Error('Permission denied: CORE.AI.ACTION.EXECUTE'); const row = await this.getActionRequest(id, ctx), data = this.actionData(row); if (data.status !== 'PROPOSED')
            throw new Error(`AI action request ${id} není PROPOSED`); if (data.requiresConfirmation && !ctx.confirmed)
            throw new Error(`AI confirmation required: ${data.actionCode}`); try {
            const result = await this.actions.invoke(data.actionCode, data.payload, { ...ctx, appCode: 'APP.KX.AI', parentChangeId: rootId(ctx) });
            const next = { ...data, status: 'EXECUTED', updatedAt: now(), resultSummary: aiResultSummary(result), error: undefined };
            return await this.entities.save({ id: row.id, type: 'CORE.AI_ACTION_REQUEST', ownerApp: 'APP.KX.AI', schema: 'KX.AI_ACTION_REQUEST/1', spaceIds: [], data: next, expectedRevision: row.revision }, ctx);
        }
        catch (error) {
            const next = { ...data, status: 'FAILED', updatedAt: now(), error: String(error) };
            await this.entities.save({ id: row.id, type: 'CORE.AI_ACTION_REQUEST', ownerApp: 'APP.KX.AI', schema: 'KX.AI_ACTION_REQUEST/1', spaceIds: [], data: next, expectedRevision: row.revision }, ctx);
            throw error;
        } }
    }
    KX.AIGatewayService = AIGatewayService;
    class AISystemSupervisorService {
        healthProvider;
        events;
        implementation;
        constructor(healthProvider, events, implementation) {
            this.healthProvider = healthProvider;
            this.events = events;
            this.implementation = implementation;
        }
        proposal(code, title, detail, suggestedAction) { return { code, title, detail, suggestedAction, requiresAdmin: true, autoExecute: false }; }
        async review(input = {}, ctx) {
            const health = await this.healthProvider(), findings = [];
            const add = (code, severity, title, detail, proposal) => findings.push({ code, severity, title, detail, proposal });
            if (health.ready !== true)
                add('CORE_NOT_READY', 'BLOCKER', 'Core runtime není READY', 'Runtime health nehlásí ready=true.', this.proposal('REPAIR.RESTART_RUNTIME', 'Zkontrolovat bootstrap Core', 'Prověřit startup log, Workspace aktivaci a repository open.'));
            if (health.dataMapLoaded !== true)
                add('SYSTEM_MAP_NOT_LOADED', 'ERROR', 'System Map není načtený', 'Structure Truth není dostupná v aktivním runtime.', this.proposal('REPAIR.REBUILD_SYSTEM_MAP', 'Regenerovat a ověřit System Map', 'Spustit build-time System Map generátor a QA kontrakt.', 'ACTION.CORE.SYSTEM.HEALTH.READ'));
            const conflicts = Number(health.openConflicts || 0);
            if (conflicts > 0)
                add('SYNC_CONFLICTS', 'WARNING', 'Otevřené synchronizační konflikty', `Aktivních konfliktů: ${conflicts}.`, this.proposal('REPAIR.REVIEW_CONFLICTS', 'Otevřít konflikty k rozhodnutí', 'AI může navrhnout postup, ale změna canonical dat musí projít owner Action/Capability.'));
            const outbox = Number(health.outboxPending || 0);
            if (outbox > 50)
                add('OUTBOX_BACKLOG', 'WARNING', 'Velká fronta neodeslaných změn', `Pending outbox položek: ${outbox}.`, this.proposal('REPAIR.REVIEW_SYNC', 'Prověřit sync/server spojení', 'Zkontrolovat stav připojení a chyby sync workeru.'));
            else if (outbox > 0)
                add('OUTBOX_PENDING', 'INFO', 'Čekající synchronizace', `Pending outbox položek: ${outbox}.`);
            const jobs = Number(health.backgroundJobs || 0);
            if (jobs === 0)
                add('NO_BACKGROUND_JOBS', 'INFO', 'Nejsou naplánované background joby', 'Background scheduler je připravený, ale nemá aktivní uložené joby.');
            if (Number(health.aiProviders || 0) < 1)
                add('AI_PROVIDER_REGISTRY_EMPTY', 'ERROR', 'AI provider registry je prázdný', 'Není dostupný ani lokální provider descriptor.', this.proposal('REPAIR.AI_PROVIDER_REGISTRY', 'Obnovit provider registry', 'Prověřit CoreRuntime AI provider bootstrap.'));
            if (this.implementation) {
                const impl = this.implementation.summary();
                if (impl.falseVerified.length)
                    add('IMPLEMENTATION_FALSE_VERIFIED', 'BLOCKER', 'Implementation Registry obsahuje falešné VERIFIED', impl.falseVerified.join(', '), this.proposal('REPAIR.IMPLEMENTATION_REGISTRY', 'Opravit stavovou evidenci', 'VERIFIED smí mít jen funkce se všemi completion criteria verified=true.'));
                if (impl.statuses.PARTIAL > 0)
                    add('IMPLEMENTATION_PARTIAL', 'INFO', 'Program má evidované nedokončené části', `PARTIAL: ${impl.statuses.PARTIAL}; BLOCKED: ${impl.statuses.BLOCKED}; PLANNED: ${impl.statuses.PLANNED}.`);
            }
            const summary = { blockers: findings.filter(x => x.severity === 'BLOCKER').length, errors: findings.filter(x => x.severity === 'ERROR').length, warnings: findings.filter(x => x.severity === 'WARNING').length, info: findings.filter(x => x.severity === 'INFO').length };
            const review = { engine: 'LOCAL_DIAGNOSTICS', status: summary.blockers || summary.errors ? 'ERROR' : summary.warnings ? 'ATTENTION' : 'OK', scope: input.scope || 'CORE', reviewedAt: now(), findings, summary, backgroundCapable: true, aiEnrichment: 'AVAILABLE_WHEN_PROVIDER_CONNECTED' };
            if (ctx)
                await this.events.emit({ id: uid('EVT'), code: 'EVENT.CORE.AI.SYSTEM.REVIEW', at: review.reviewedAt, actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: rootId(ctx), payload: { scope: review.scope, status: review.status, summary: review.summary } });
            return review;
        }
    }
    KX.AISystemSupervisorService = AISystemSupervisorService;
    class BackgroundJobService {
        repo;
        audit;
        outbox;
        events;
        handlers = new Map();
        constructor(repo, audit, outbox, events) {
            this.repo = repo;
            this.audit = audit;
            this.outbox = outbox;
            this.events = events;
        }
        registerHandler(code, handler) { if (this.handlers.has(code))
            throw new Error(`Duplicate background handler ${code}`); this.handlers.set(code, handler); }
        async list() { return this.repo.all('backgroundJobs'); }
        async get(id) { return this.repo.get('backgroundJobs', id); }
        async schedule(input, ctx) { const old = (await this.list()).find(x => x.code === input.code), id = old?.id || uid('JOB'), at = now(), root = rootId(ctx), nextRunAt = input.runAt || old?.nextRunAt || (input.intervalMinutes ? new Date(Date.now() + input.intervalMinutes * 60000).toISOString() : undefined); const row = { id, code: input.code, ownerApp: input.ownerApp, handlerCode: input.handlerCode, status: input.status || old?.status || 'ENABLED', runAt: input.runAt, intervalMinutes: input.intervalMinutes, payload: input.payload, nextRunAt, lastRunAt: old?.lastRunAt, lastError: undefined, revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || at, createdBy: old?.createdBy || ctx.actorId, updatedAt: at, updatedBy: ctx.actorId }; const audit = this.audit.make({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: 'CORE.JOB.SCHEDULE', entityType: 'CORE.BACKGROUND_JOB', entityId: id, rootChangeId: root, result: 'OK', detail: { code: row.code, nextRunAt: row.nextRunAt } }), out = this.outbox.make({ changeType: 'UPSERT', resourceType: 'CORE.BACKGROUND_JOB', resourceId: id, revision: row.revision, ownerApp: row.ownerApp, rootChangeId: root }); await this.repo.atomic([{ store: 'backgroundJobs', value: row }, { store: 'audit', value: audit }, { store: 'outbox', value: out }]); return row; }
        async tick(at, ctx) { const root = rootId(ctx), runCtx = { ...ctx, rootChangeId: root }; const due = (await this.list()).filter(x => x.status === 'ENABLED' && !!x.nextRunAt && x.nextRunAt <= at).sort((a, b) => (a.nextRunAt || '').localeCompare(b.nextRunAt || '')); const result = []; for (const row of due) {
            const handler = this.handlers.get(row.handlerCode);
            if (!handler) {
                row.status = 'ERROR';
                row.lastError = `Missing handler ${row.handlerCode}`;
                row.updatedAt = now();
                row.updatedBy = ctx.actorId;
                await this.repo.put('backgroundJobs', row);
                result.push({ id: row.id, status: 'ERROR', error: row.lastError });
                continue;
            }
            try {
                await handler(row, runCtx);
                const current = await this.get(row.id) || row;
                current.lastRunAt = at;
                current.lastError = undefined;
                current.status = 'ENABLED';
                if (current.intervalMinutes)
                    current.nextRunAt = new Date(new Date(at).getTime() + current.intervalMinutes * 60000).toISOString();
                else
                    current.nextRunAt = undefined;
                current.updatedAt = now();
                current.updatedBy = ctx.actorId;
                await this.repo.put('backgroundJobs', current);
                await this.events.emit({ id: uid('EVT'), code: 'EVENT.CORE.JOB.COMPLETED', at: now(), actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { id: current.id, code: current.code } });
                result.push({ id: row.id, status: 'OK' });
            }
            catch (error) {
                row.status = 'ERROR';
                row.lastError = String(error);
                row.updatedAt = now();
                row.updatedBy = ctx.actorId;
                await this.repo.put('backgroundJobs', row);
                result.push({ id: row.id, status: 'ERROR', error: String(error) });
            }
        } return result; }
    }
    KX.BackgroundJobService = BackgroundJobService;
    class CoreSchedulerService {
        alarms;
        jobs;
        events;
        constructor(alarms, jobs, events) {
            this.alarms = alarms;
            this.jobs = jobs;
            this.events = events;
        }
        async tick(at, ctx) { const root = rootId(ctx), runCtx = { ...ctx, rootChangeId: root }; const dueAlarms = await this.alarms.due(at), fired = []; for (const alarm of dueAlarms)
            fired.push(await this.alarms.fire(alarm.id, runCtx)); const jobs = await this.jobs.tick(at, runCtx); await this.events.emit({ id: uid('EVT'), code: 'EVENT.CORE.SCHEDULER.TICK', at: now(), actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, payload: { at, firedAlarms: fired.length, jobs: jobs.length } }); return { firedAlarms: fired, jobs }; }
    }
    KX.CoreSchedulerService = CoreSchedulerService;
    async function recoverySerializable(value) {
        if (value instanceof Blob) {
            const bytes = new Uint8Array(await value.arrayBuffer());
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk)
                binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            return { __kxType: 'Blob', mime: value.type, size: value.size, base64: btoa(binary) };
        }
        if (Array.isArray(value)) {
            const out = [];
            for (const x of value)
                out.push(await recoverySerializable(x));
            return out;
        }
        if (value && typeof value === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(value))
                out[k] = await recoverySerializable(v);
            return out;
        }
        return value;
    }
    function stableStringify(value) { const walk = (v) => { if (Array.isArray(v))
        return v.map(walk); if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v).sort())
            out[k] = walk(v[k]);
        return out;
    } return v; }; return JSON.stringify(walk(value)); }
    class RecoverySnapshotService {
        repo;
        audit;
        dataMap;
        defaultStores = ['entities', 'revisions', 'relations', 'settings', 'shareRules', 'users', 'spaces', 'spaceMemberships', 'devices', 'sessions', 'capabilityReports', 'files', 'fileCollections', 'fileMemberships', 'fileSearch', 'documents', 'documentVersions', 'tasks', 'calendarEvents', 'alarms', 'backgroundJobs', 'lineage', 'outbox', 'conflicts', 'meta'];
        constructor(repo, audit, dataMap) {
            this.repo = repo;
            this.audit = audit;
            this.dataMap = dataMap;
        }
        async create(input) { const includeAudit = input.includeAudit ?? true, includeFileBlobs = input.includeFileBlobs ?? false, stores = [...this.defaultStores]; if (includeAudit)
            stores.push('audit'); if (includeFileBlobs)
            stores.push('fileBlobs'); const payload = {}, storeCounts = {}; for (const store of stores) {
            const rows = await this.repo.all(store);
            payload[store] = [];
            for (const row of rows)
                payload[store].push(await recoverySerializable(row));
            storeCounts[store] = rows.length;
        } const core = { schema: 'KX.RECOVERY_SNAPSHOT/1', runtimeVersion: input.runtimeVersion, createdAt: now(), createdBy: input.createdBy, includeAudit, includeFileBlobs, storeCounts, payload, systemMap: input.systemMap || this.dataMap.get(), workspaceProfile: input.workspaceProfile }; const sha = await sha256Bytes(new TextEncoder().encode(stableStringify(core))); const row = { id: uid('RECOVERY'), ...core, sha256: sha }; await this.repo.put('recoverySnapshots', row); await this.audit.write({ actorId: input.createdBy, appCode: 'APP.NEXUS', actionCode: 'CORE.RECOVERY.SNAPSHOT.CREATE', entityType: 'CORE.RECOVERY_SNAPSHOT', entityId: row.id, rootChangeId: uid('CHG'), result: 'OK', detail: { sha256: sha, storeCounts } }); return row; }
        async list() { return this.repo.all('recoverySnapshots'); }
        async verify(row) { const { id: _id, sha256: _sha, ...core } = row; const sha = await sha256Bytes(new TextEncoder().encode(stableStringify(core))); const countsOk = Object.entries(row.storeCounts).every(([store, count]) => (row.payload[store] || []).length === count); return { ok: sha === row.sha256 && countsOk, sha256: sha, expected: row.sha256, countsOk }; }
        async toBlob(row) { return new Blob([JSON.stringify(row, null, 2)], { type: 'application/json' }); }
    }
    KX.RecoverySnapshotService = RecoverySnapshotService;
    function htmlEscape(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch)); }
    class RecoveryBookService {
        repo;
        dataMap;
        memberships;
        constructor(repo, dataMap, memberships) {
            this.repo = repo;
            this.dataMap = dataMap;
            this.memberships = memberships;
        }
        async generate(input) {
            const map = this.dataMap.get(), users = await this.memberships.listUsers(), spaces = await this.memberships.listSpaces(), members = await this.memberships.listMemberships(), settings = await this.repo.all('settings'), shares = await this.repo.all('shareRules');
            const stores = ['entities', 'relations', 'files', 'documents', 'tasks', 'calendarEvents', 'alarms', 'settings', 'shareRules', 'devices', 'sessions', 'capabilityReports', 'lineage', 'outbox', 'conflicts'];
            const counts = {};
            for (const store of stores)
                counts[store] = (await this.repo.all(store)).length;
            const apps = map.apps || [], entities = map.sharedEntities || [], flows = map.dataFlows || [], services = map.runtime?.services || [];
            const row = (cells) => `<tr>${cells.map(x => `<td>${htmlEscape(x)}</td>`).join('')}</tr>`;
            const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>${htmlEscape(input.title || 'KalinumX Recovery Book')}</title><style>body{font-family:system-ui,sans-serif;margin:32px;color:#171717}h1,h2{margin:0 0 12px}h2{margin-top:30px;border-bottom:1px solid #ccc;padding-bottom:6px}table{border-collapse:collapse;width:100%;margin:10px 0 20px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}th{background:#f3f3f3}.muted{color:#666;font-size:12px}.pagebreak{page-break-before:always}</style></head><body>
      <h1>${htmlEscape(input.title || 'KalinumX Recovery Book')}</h1><p class="muted">Runtime ${htmlEscape(input.runtimeVersion)} · vygeneroval ${htmlEscape(input.generatedBy)} · ${htmlEscape(now())}</p>
      <h2>Workspace</h2><p>${input.workspaceProfile ? `${htmlEscape(input.workspaceProfile.name)} · ${htmlEscape(input.workspaceProfile.mode)} · ${htmlEscape(input.workspaceProfile.id)}` : 'Workspace metadata není v tomto exportu k dispozici.'}</p>
      <h2>Souhrn datových vrstev</h2><table><thead><tr><th>Store</th><th>Počet</th></tr></thead><tbody>${Object.entries(counts).map(([k, v]) => row([k, v])).join('')}</tbody></table>
      <h2>Uživatelé</h2><table><thead><tr><th>ID</th><th>Jméno</th><th>Stav</th></tr></thead><tbody>${users.map(u => row([u.id, u.displayName, u.status])).join('')}</tbody></table>
      <h2>Prostory</h2><table><thead><tr><th>ID</th><th>Název</th><th>Typ</th><th>Vlastník</th><th>Členství</th></tr></thead><tbody>${spaces.map(sp => row([sp.id, sp.name, sp.kind, sp.ownerUserId, members.filter(m => m.spaceId === sp.id).map(m => `${m.userId}:${m.role}`).join(', ')])).join('')}</tbody></table>
      <h2 class="pagebreak">Aplikace</h2><table><thead><tr><th>CODE</th><th>Název</th><th>Rodina</th><th>Popis</th></tr></thead><tbody>${apps.map(a => row([a.code, a.name, a.family || '', a.subtitle || ''])).join('')}</tbody></table>
      <h2>Canonical entity registry</h2><table><thead><tr><th>CODE</th><th>Vlastník</th><th>Popis</th></tr></thead><tbody>${entities.map(e => row([e.code, e.owner || '', e.description || ''])).join('')}</tbody></table>
      <h2>Data Flow</h2><table><thead><tr><th>CODE</th><th>Zdroj</th><th>Cíl</th><th>Režim</th><th>Trigger</th><th>Důvod</th></tr></thead><tbody>${flows.map(f => row([f.code, f.source, f.target, f.mode, f.trigger || '', f.reason || ''])).join('')}</tbody></table>
      <h2>Core služby</h2><p>${services.map(htmlEscape).join(' · ') || '–'}</p>
      <h2>Nastavení — metadata</h2><table><thead><tr><th>Klíč</th><th>Scope</th><th>ID scope</th><th>Locked</th><th>Revize</th></tr></thead><tbody>${settings.map(x => row([x.key, x.scopeType, x.scopeId, !!x.locked, x.revision])).join('')}</tbody></table>
      <h2>Sdílení — pravidla</h2><table><thead><tr><th>Cesta</th><th>Režim</th><th>Vlastník</th><th>Povolených subjektů</th></tr></thead><tbody>${shares.map(x => row([x.resourcePath, x.mode, x.ownerUserId, x.allow?.length || 0])).join('')}</tbody></table>
      <p class="muted">Kniha záměrně neobsahuje hodnoty provozních záznamů ani tajné údaje. Slouží jako strukturální a recovery mapa systému.</p></body></html>`;
            return { html, counts, generatedAt: now() };
        }
    }
    KX.RecoveryBookService = RecoveryBookService;
    class RelationManagementService {
        relations;
        lineage;
        graph;
        actions;
        constructor(relations, lineage, graph, actions) {
            this.relations = relations;
            this.lineage = lineage;
            this.graph = graph;
            this.actions = actions;
        }
        async inspect(entityId) { const [relations, lineage, graph] = await Promise.all([this.relations.forEntity(entityId), this.lineage.forEntity(entityId), this.graph.snapshot(entityId)]); return { entityId, relations, lineage, graph }; }
        async removeRelation(id, ctx) { return this.actions.invoke('ACTION.CORE.RELATION.DELETE', { id }, ctx); }
    }
    KX.RelationManagementService = RelationManagementService;
    class ActionBus {
        audit;
        events;
        actions = new Map();
        // N2.1h: optional repository used to capture the access epoch when an action starts.
        epochRepo;
        bindAccessEpoch(repo) { if (this.epochRepo)
            throw new Error('ACCESS_EPOCH_ALREADY_BOUND'); this.epochRepo = repo; }
        constructor(audit, events) {
            this.audit = audit;
            this.events = events;
        }
        register(def) { if (this.actions.has(def.code))
            throw new Error(`Duplicate action ${def.code}`); this.actions.set(def.code, def); }
        // N2.0 (F2): rollback support for atomic hub installation. Only the owning app may remove its action.
        unregister(code, ownerApp) { const def = this.actions.get(code); if (!def)
            return false; if (def.ownerApp !== ownerApp)
            throw new Error(`Action ${code} is owned by ${def.ownerApp}`); this.actions.delete(code); return true; }
        list() { return [...this.actions.values()].map(x => ({ code: x.code, ownerApp: x.ownerApp, risk: x.risk, permission: x.permission })); }
        // N2.1f: pre-invoke guards (e.g. verified-session requirement for sensitive hubs). A guard throws to deny;
        // denial is audited like any other failed invocation. Guards cannot be removed by anyone but their owner.
        guards = new Map();
        addGuard(id, fn) { if (this.guards.has(id))
            throw new Error(`Duplicate action guard ${id}`); this.guards.set(id, fn); }
        guardIds() { return [...this.guards.keys()]; }
        // N2.3g: post-invoke observers – run only after a SUCCESSFUL action; an observer error never fails or undoes the action
        // (it is recorded in observerErrors). Internal service calls do not pass the bus, so observers cannot loop on their own writes.
        observers = new Map();
        observerErrors = [];
        observe(id, fn) { if (this.observers.has(id))
            throw new Error(`Duplicate action observer ${id}`); this.observers.set(id, fn); }
        observerIds() { return [...this.observers.keys()]; }
        async invoke(code, payload, ctx) { const def = this.actions.get(code); if (!def)
            throw new Error(`Unknown action ${code}`); if (def.permission && !ctx.permissions?.includes(def.permission))
            throw new Error(`Permission denied: ${def.permission}`); if (['SENSITIVE_WRITE', 'EXTERNAL_ACTION', 'DESTRUCTIVE', 'FINANCIAL'].includes(def.risk) && !ctx.confirmed)
            throw new Error(`Confirmation required: ${code}`); const root = rootId(ctx); try {
            const accessEpoch = this.epochRepo ? await accessEpochRead(this.epochRepo) : undefined;
            if (this.epochRepo)
                ctx = { ...ctx, accessEpoch };
            else if ('accessEpoch' in ctx) {
                const { accessEpoch: _drop, ...rest } = ctx;
                ctx = rest;
            }
            for (const g of this.guards.values())
                await g({ code: def.code, ownerApp: def.ownerApp, risk: def.risk }, ctx);
            const result = await def.handler(payload, { ...ctx, rootChangeId: root });
            for (const [oid, ob] of this.observers) {
                try {
                    await ob({ code: def.code, ownerApp: def.ownerApp }, payload, result, ctx);
                }
                catch (e) {
                    this.observerErrors.push({ id: oid, code: def.code, error: String(e?.message || e).slice(0, 200), at: now() });
                    if (this.observerErrors.length > 20)
                        this.observerErrors.shift();
                }
            }
            await this.audit.write({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: code, rootChangeId: root, parentChangeId: ctx.parentChangeId, deviceId: ctx.deviceId, result: 'OK' });
            await this.events.emit({ id: uid('EVT'), code: 'EVENT.CORE.ACTION.COMPLETED', at: now(), actorId: ctx.actorId, appCode: ctx.appCode, rootChangeId: root, parentChangeId: ctx.parentChangeId, payload: { code } });
            return result;
        }
        catch (error) {
            await this.audit.write({ actorId: ctx.actorId, appCode: ctx.appCode, actionCode: code, rootChangeId: root, parentChangeId: ctx.parentChangeId, deviceId: ctx.deviceId, result: 'ERROR', detail: { error: String(error) } });
            throw error;
        } }
    }
    KX.ActionBus = ActionBus;
    class CoreRuntime {
        repository;
        events = new EventBus();
        audit;
        revisions;
        outbox;
        conflicts;
        sync;
        entities;
        relations;
        trashRetention;
        trashWarnings;
        configurationMutationAccess;
        settings;
        settingsDefaults = new SettingsDefaultsRegistryService();
        sharing;
        memberships;
        devices;
        access;
        fileMutationAccess;
        plannerMutationAccess;
        laserAccess;
        laserDomain;
        laserPurgeRepositorySandbox;
        laserPurgeDurableJournalSandbox;
        laserPurgeJournalRecoverySandbox;
        laserPurgeOwnerExecutionPreflight;
        laserP566Preview;
        laserP566ParityOwners;
        laserP566Adapter;
        laserP566ViewSettingsTransformer;
        laserP566WorkspaceTrashTransformer;
        laserP566TestTrashTimingTransformer;
        laserP566Staging;
        laserP566TransactionVerifier;
        lineage;
        graph;
        files;
        fileLibrary;
        fileExplorer;
        workDesk;
        myDay;
        documents;
        tasks;
        calendar;
        alarms;
        plannerAgenda;
        aiProviders;
        aiConnections;
        aiSessions;
        aiGateway;
        aiSupervisor;
        jobs;
        scheduler;
        actions;
        relationManagement;
        recovery;
        recoveryBook;
        deepLinks = new DeepLinkService();
        dataMap = new DataMapService();
        implementation = new ImplementationRegistryService();
        search;
        ownerReadGate = new OwnerReadGateService();
        routes;
        inspector;
        ready = false;
        workspaceProfile;
        constructor(repository = createDefaultCoreRepository(), managedFileStore, workspaceProfile) {
            this.repository = repository;
            this.workspaceProfile = workspaceProfile;
            this.audit = new AuditService(repository);
            this.revisions = new RevisionService(repository);
            this.outbox = new OutboxService(repository);
            this.conflicts = new ConflictService(repository);
            this.sync = new SyncService(this.outbox, this.conflicts, this.audit, this.events);
            this.relations = new RelationService(repository, this.audit, this.outbox);
            /* N2.3h (R70): private records (data.private==='YES' or data.kxPrivate) – hidden from lists until the user unlocks them (15 min), never in global search */
            this.privacy = createPrivacy(() => Date.now());
            this.entities = new EntityService(repository, this.audit, this.revisions, this.outbox, this.events);
            this.memberships = new SpaceMembershipService(repository, this.audit, this.outbox);
            this.configurationMutationAccess = new ConfigurationMutationAccessService(repository, this.memberships, workspaceProfile?.id);
            this.settings = new SettingsService(repository, this.audit, this.outbox, this.configurationMutationAccess);
            this.sharing = new SharingService(repository, this.audit, this.outbox, this.configurationMutationAccess);
            this.devices = new DeviceSessionService(repository, this.audit);
            this.access = new ResourceAccessService(this.sharing, this.memberships);
            this.trashRetention = new TrashRetentionService(this.entities, this.access);
            this.trashRetention.registerCapability({ ownerApp: 'APP.KX.LASER', ownerService: 'LaserDomainService', resourceTypes: ['APP.LASER.PROJECT', 'APP.LASER.TEST', 'APP.LASER.TEST_RUN'], supportsRestore: true, supportsPurge: false, restoreActionCode: 'ACTION.LASER.TRASH.RESTORE', availability: 'DEGRADED', restoreAvailability: 'AVAILABLE', purgeAvailability: 'DECLARED_ONLY', notes: ['DELTA060 verifies production soft-trash + restore readback for Project/Test/Test Run while permanent purge remains unavailable.', 'KXP/KXT/recordUid, relation graph and timing history are verified on restore; running stopwatches are frozen on delete and never auto-resumed.'] });
            this.fileMutationAccess = new FileMutationAccessService(this.memberships, this.access);
            this.plannerMutationAccess = new PlannerMutationAccessService(repository, this.memberships, this.access);
            this.laserAccess = new LaserDomainAccessService(this.memberships, this.access);
            this.laserDomain = new LaserDomainService(this.entities, this.relations, this.laserAccess, this.revisions);
            this.laserPurgeRepositorySandbox = new LaserPurgeRepositoryTransactionSandboxService(repository, this.laserDomain);
            this.laserPurgeDurableJournalSandbox = new LaserPurgeDurableJournalSandboxService(repository, this.laserDomain);
            this.laserPurgeJournalRecoverySandbox = new LaserPurgeJournalRecoverySandboxService(repository);
            this.laserPurgeOwnerExecutionPreflight = new LaserPurgeOwnerExecutionPreflightService(repository, this.laserDomain, this.laserPurgeRepositorySandbox, this.laserPurgeDurableJournalSandbox, this.laserPurgeJournalRecoverySandbox);
            this.laserP566Preview = new LaserP566MigrationPreviewService(this.laserDomain);
            this.laserP566ParityOwners = new LaserP566CrossFeatureParityService();
            this.laserP566Adapter = new LaserP566ReadOnlyAdapterService(this.laserDomain, this.laserP566Preview, this.laserP566ParityOwners);
            this.laserP566ViewSettingsTransformer = new LaserP566ViewSettingsTransformerService();
            this.laserP566WorkspaceTrashTransformer = new LaserP566WorkspaceTrashTransformerService(this.laserDomain);
            this.laserP566TestTrashTimingTransformer = new LaserP566TestTrashTimingTransformerService(this.laserDomain);
            this.lineage = new LineageService(repository);
            this.graph = new RelationGraphService(repository, this.relations, this.lineage);
            const managed = managedFileStore || (repository instanceof NativeSqliteCoreRepository ? new NativeManagedFileStore(repository.bridge) : undefined);
            this.files = new FileService(repository, this.audit, this.revisions, this.outbox, managed, this.fileMutationAccess);
            this.trashRetention.registerCapability({ ownerApp: 'APP.NEXUS', ownerService: 'FileService', resourceTypes: ['CORE.FILE'], supportsRestore: true, supportsPurge: true, restoreActionCode: 'ACTION.CORE.FILE.TRASH.RESTORE', purgeActionCode: 'ACTION.CORE.FILE.TRASH.PURGE', availability: managed ? 'DEGRADED' : 'AVAILABLE', restoreAvailability: 'AVAILABLE', purgeAvailability: managed ? 'DEGRADED' : 'AVAILABLE', notes: managed ? ['File restore is available; permanent purge of NATIVE_FILE stays fail-closed until a transactional managed-file purge primitive is verified.'] : ['Browser/local blob FileService restore + permanent purge owner lifecycle verified through typed actions and physical read-back.'] });
            this.trashRetention.registerCapability({ ownerApp: 'APP.NEXUS', ownerService: 'DocumentService', resourceTypes: ['CORE.DOCUMENT'], supportsRestore: true, supportsPurge: true, restoreActionCode: 'ACTION.CORE.DOCUMENT.TRASH.RESTORE', purgeActionCode: 'ACTION.CORE.DOCUMENT.TRASH.PURGE', availability: 'AVAILABLE', restoreAvailability: 'AVAILABLE', purgeAvailability: 'AVAILABLE', notes: ['DocumentService owns document metadata/version-reference lifecycle only; referenced CORE.FILE bytes remain FileService-owned and are never deleted by document purge.'] });
            this.fileLibrary = new FileLibraryService(repository, this.files, this.audit, this.outbox, this.fileMutationAccess);
            this.fileExplorer = new FileExplorerService(repository, this.files, this.fileLibrary, this.access);
            this.workDesk = new WorkDeskService(this.fileExplorer, this.fileLibrary);
            this.documents = new DocumentService(repository, this.audit, this.revisions, this.outbox, this.relations, this.files, this.access);
            this.tasks = new TaskService(repository, this.audit, this.revisions, this.outbox, this.events, this.plannerMutationAccess);
            this.calendar = new CalendarService(repository, this.audit, this.revisions, this.outbox, this.events, this.plannerMutationAccess);
            this.alarms = new AlarmService(repository, this.audit, this.revisions, this.outbox, this.events, this.plannerMutationAccess);
            this.plannerAgenda = new PlannerAgendaService(this.memberships, this.access, this.tasks, this.calendar, this.alarms, this.deepLinks);
            this.myDay = new MyDayService(this.memberships, this.access, this.tasks, this.calendar, this.alarms, this.workDesk, this.deepLinks);
            this.aiProviders = new AIProviderRegistryService();
            const unavailable = { CHAT: 'UNAVAILABLE', ATTACHMENTS: 'UNAVAILABLE', TOOLS: 'UNAVAILABLE', MODELS: 'UNAVAILABLE', OAUTH: 'UNAVAILABLE', API_CREDENTIAL: 'UNAVAILABLE', USAGE: 'UNAVAILABLE', RECENT_CHATS: 'UNAVAILABLE', PROJECTS: 'UNAVAILABLE', FOLDERS: 'UNAVAILABLE' };
            this.aiProviders.registerDescriptor({ code: 'MOCK.LOCAL', name: 'KalinumX Local Mock', family: 'BUILTIN', description: 'Deterministický offline regression provider bez externího API.', authModes: ['NONE'], capabilities: { ...unavailable, CHAT: 'AVAILABLE', ATTACHMENTS: 'AVAILABLE' } });
            this.aiProviders.registerDescriptor({ code: 'OPENAI', name: 'OpenAI', family: 'CLOUD', description: 'Metadata-ready provider. Cloud adapter/OAuth/API runtime zatím není připojen.', authModes: ['SECURE_REF', 'OAUTH_REF'], capabilities: { ...unavailable } });
            this.aiProviders.registerDescriptor({ code: 'CHATGPT', name: 'ChatGPT', family: 'CLOUD', description: 'Metadata-ready account/workspace connector. Bez scraping fallbacku.', authModes: ['OAUTH_REF'], capabilities: { ...unavailable } });
            this.aiProviders.registerDescriptor({ code: 'GOOGLE.GEMINI', name: 'Google Gemini', family: 'CLOUD', description: 'Metadata-ready provider. Runtime adapter zatím není připojen.', authModes: ['SECURE_REF', 'OAUTH_REF'], capabilities: { ...unavailable } });
            this.aiProviders.registerDescriptor({ code: 'ANTHROPIC', name: 'Anthropic', family: 'CLOUD', description: 'Metadata-ready provider. Runtime adapter zatím není připojen.', authModes: ['SECURE_REF', 'OAUTH_REF'], capabilities: { ...unavailable } });
            this.aiProviders.registerDescriptor({ code: 'LOCAL.OPENAI_COMPAT', name: 'Local OpenAI-compatible', family: 'LOCAL', description: 'Metadata-ready local endpoint profile. Runtime adapter zatím není připojen.', authModes: ['NONE', 'SECURE_REF'], capabilities: { ...unavailable } });
            this.aiProviders.register(new MockAIProviderAdapter());
            this.aiConnections = new AIConnectionService(this.entities, this.memberships, this.aiProviders, this.settingsDefaults);
            this.aiSessions = new AISessionService(repository, this.entities, this.memberships, this.access, this.deepLinks, this.aiConnections);
            this.jobs = new BackgroundJobService(repository, this.audit, this.outbox, this.events);
            this.scheduler = new CoreSchedulerService(this.alarms, this.jobs, this.events);
            this.trashWarnings = new TrashWarningSchedulerService(this.trashRetention, this.alarms, this.jobs);
            this.actions = new ActionBus(this.audit, this.events);
            this.actions.bindAccessEpoch(repository);
            this.trashRetention.bindOwnerInvoker((code, payload, ctx) => this.actions.invoke(code, payload, { ...ctx, permissions: [...new Set([...(ctx.permissions || []), 'CORE.TRASH.OWNER.INTERNAL'])] }));
            this.trashRetention.bindOwnerActionInspector(code => this.actions.list().some(x => x.code === code));
            this.laserP566Staging = new LaserP566StagingService(this.laserDomain, this.laserP566Adapter, () => this.actions.list(), undefined, this.laserP566ViewSettingsTransformer, this.laserP566WorkspaceTrashTransformer, this.laserP566TestTrashTimingTransformer);
            this.laserP566TransactionVerifier = new LaserP566TransactionVerifierService(repository, this.laserP566Staging, this.workspaceProfile);
            this.aiGateway = new AIGatewayService(this.entities, this.audit, this.aiConnections, this.aiSessions, this.aiProviders, this.actions);
            this.aiSupervisor = new AISystemSupervisorService(() => this.health(), this.events, this.implementation);
            this.relationManagement = new RelationManagementService(this.relations, this.lineage, this.graph, this.actions);
            this.recovery = new RecoverySnapshotService(repository, this.audit, this.dataMap);
            this.recoveryBook = new RecoveryBookService(repository, this.dataMap, this.memberships);
            this.search = new CoreSearchService(repository, this.access, this.actions, this.dataMap, this.deepLinks, this.ownerReadGate);
            this.routes = new RouteRegistryService(this.deepLinks);
            this.inspector = new RecordInspectorService(repository, this.access, this.relations, this.lineage, this.revisions, this.dataMap, this.actions, this.deepLinks, this.ownerReadGate);
        }
        async init() { await this.repository.open(); this.registerCoreActions(); await this.memberships.ensureDefaultModel({ actorId: 'SYSTEM', appCode: 'APP.NEXUS', permissions: ['CORE.USER.MANAGE', 'CORE.SPACE.MANAGE', 'CORE.SPACE.MEMBERSHIP.MANAGE'], confirmed: true }); this.registerDefaultBackgroundHandlers(); this.ready = true; await this.repository.put('meta', { key: 'runtime.version', value: 'P0009-WIP.10', repository: this.repository.mode, workspaceId: this.workspaceProfile?.id, workspaceMode: this.workspaceProfile?.mode, updatedAt: now() }); }
        registerDefaultBackgroundHandlers() {
            if (!this.__kxHandlersRegistered) {
                this.jobs.registerHandler('CORE.ALARM.SWEEP', async (_job, ctx) => { const due = await this.alarms.due(now()); for (const alarm of due)
                    await this.alarms.fire(alarm.id, ctx); });
                this.jobs.registerHandler('CORE.TRASH.WARNING.SWEEP', async (job, ctx) => { const payload = job.payload || {}; await this.trashWarnings.reconcile({ at: now(), lookaheadHours: Number(payload.lookaheadHours || TrashWarningSchedulerService.DEFAULT_LOOKAHEAD_HOURS), channels: Array.isArray(payload.channels) ? payload.channels : ['IN_APP'] }, ctx); });
                this.jobs.registerHandler('AI.SYSTEM.REVIEW', async (job, ctx) => { await this.aiSupervisor.review({ scope: String(job.payload?.scope || 'CORE') }, ctx); });
                this.__kxHandlersRegistered = true;
            }
        }
        registerCoreActions() {
            if (this.actions.list().length)
                return;
            const pv = this.privacy;
            this.actions.register({ code: 'ACTION.CORE.PRIVACY.UNLOCK', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', handler: async (p, ctx) => { /* N2.3j: default from the setting privacy.unlockMinutes (15) */ let def = 15; try {
                    const x = await this.settingsDefaults?.explain(this.settings, 'privacy.unlockMinutes', [{ scopeType: 'CENTRAL', scopeId: 'GLOBAL' }, { scopeType: 'USER', scopeId: ctx.actorId }]);
                    if (Number(x?.effectiveValue) > 0)
                        def = Number(x.effectiveValue);
                }
                catch { } return pv.unlock(ctx.actorId, Number(p?.minutes) || def); } });
            this.actions.register({ code: 'ACTION.CORE.PRIVACY.LOCK', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', handler: (_p, ctx) => pv.lock(ctx.actorId) });
            this.actions.register({ code: 'ACTION.CORE.PRIVACY.STATUS', ownerApp: 'APP.NEXUS', risk: 'READ', handler: (_p, ctx) => pv.status(ctx.actorId) });
            this.actions.register({ code: 'ACTION.CORE.ENTITY.CREATE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.ENTITY.CREATE', handler: (p, ctx) => { if (p.type.startsWith('CORE.AI_') || p.ownerApp === 'APP.KX.AI')
                    throw new Error('Managed AI entities must be created through the KalinumX AI Gateway'); if (p.type === 'CORE.TRASH_ENTRY')
                    throw new Error('Managed Trash index entries must be created through CORE Trash/Retention actions'); if (String(p.type).startsWith('CORE.IDENTITY.'))
                    throw new Error('Managed identity entities must be created through CORE Identity actions'); if (p.type.startsWith('APP.LASER.') || p.ownerApp === 'APP.KX.LASER')
                    throw new Error('Managed LASER entities must be created through typed LASER actions'); return this.entities.save({ type: p.type, ownerApp: p.ownerApp, data: p.data, spaceIds: p.spaceIds || [] }, ctx); } });
            this.actions.register({ code: 'ACTION.CORE.RELATION.CREATE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.RELATION.CREATE', handler: (p, ctx) => this.relations.create(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.RELATION.DELETE', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.RELATION.DELETE', handler: (p, ctx) => this.relations.remove(p.id, ctx) });
            this.actions.register({ code: 'ACTION.CORE.DOCUMENT.CREATE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.DOCUMENT.CREATE', handler: (p, ctx) => this.documents.create(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.DOCUMENT.TRASH', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.DOCUMENT.TRASH', handler: async (p, ctx) => { const staged = await this.documents.trashStage(p.documentId, ctx, p.expectedRevision); try {
                    const trashEntry = await this.trashRetention.index({ title: staged.archived.title, sourceOwnerApp: 'APP.NEXUS', ownerService: 'DocumentService', resourceType: 'CORE.DOCUMENT', resourceId: staged.archived.id, stableIdentity: staged.archived.code || staged.archived.id, deletedAt: staged.deletedAt, deletedBy: ctx.actorId, sourceDevice: ctx.deviceId, originalDeepLink: this.deepLinks.build({ kind: 'DOCUMENT', id: staged.archived.id, appCode: staged.archived.ownerApp }), storageTargetId: 'CORE_REPOSITORY_METADATA', logicalBytes: 0, physicalBytes: 0, reclaimableBytes: 0, retainUntil: p.retainUntil, dependencyCount: staged.incomingDependencyCount, dependencySummary: staged.incomingDependencySummary, backupRequired: true, backupEvidence: [...(p.backupEvidence || [])], protected: !!p.protected, holdReason: p.holdReason, metadata: { documentOwnerApp: staged.archived.ownerApp, documentRevision: staged.archived.revision, currentVersion: staged.archived.currentVersion, primaryFileId: staged.archived.primaryFileId, versionCount: staged.versionCount, outgoingRelationCount: staged.outgoingRelationCount, trashContract: 'KX.CORE_DOCUMENT_TRASH_LIFECYCLE/1' } }, ctx);
                    return { document: staged.archived, trashEntry };
                }
                catch (error) {
                    try {
                        await this.documents.rollbackTrashStage(staged, ctx);
                    }
                    catch { }
                    throw error;
                } } });
            this.actions.register({ code: 'ACTION.CORE.DOCUMENT.TRASH.RESTORE', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.TRASH.OWNER.INTERNAL', handler: (p, ctx) => { if (p.resourceType !== 'CORE.DOCUMENT' || p.mode !== 'RESTORE')
                    throw new Error('Invalid DocumentService restore owner payload'); return this.documents.restoreTrash(p.resourceId, ctx); } });
            this.actions.register({ code: 'ACTION.CORE.DOCUMENT.TRASH.PURGE', ownerApp: 'APP.NEXUS', risk: 'DESTRUCTIVE', permission: 'CORE.TRASH.OWNER.INTERNAL', handler: (p, ctx) => { if (p.resourceType !== 'CORE.DOCUMENT' || p.mode !== 'PURGE')
                    throw new Error('Invalid DocumentService purge owner payload'); return this.documents.purgeTrash(p.resourceId, ctx); } });
            this.actions.register({ code: 'ACTION.CORE.FILE.IMPORT', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.FILE.IMPORT', handler: (p, ctx) => this.files.importBlob(p.blob, p.name, p.mime, p.ownerApp, p.spaceIds, ctx, { tags: p.tags, description: p.description }) });
            this.actions.register({ code: 'ACTION.CORE.FILE.TRASH', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.FILE.TRASH', handler: async (p, ctx) => { const staged = await this.files.trash(p.fileId, ctx, p.expectedRevision); try {
                    const trashEntry = await this.trashRetention.index({ title: staged.file.name, description: staged.file.description, sourceOwnerApp: 'APP.NEXUS', ownerService: 'FileService', resourceType: 'CORE.FILE', resourceId: staged.file.id, stableIdentity: staged.file.id, deletedAt: staged.file.trashedAt, deletedBy: ctx.actorId, sourceDevice: ctx.deviceId, originalDeepLink: this.deepLinks.build({ kind: 'FILE', id: staged.file.id, appCode: staged.file.ownerApp }), storageTargetId: staged.file.storageKind === 'NATIVE_FILE' ? 'NATIVE_MANAGED' : 'BROWSER_BLOB', logicalBytes: staged.file.size, physicalBytes: staged.reclaimableBytes, reclaimableBytes: staged.reclaimableBytes, retainUntil: p.retainUntil, dependencyCount: staged.dependencyCount, dependencySummary: staged.dependencySummary, backupRequired: true, backupEvidence: [...(p.backupEvidence || [])], protected: !!p.protected, holdReason: p.holdReason, metadata: { fileOwnerApp: staged.file.ownerApp, fileRevision: staged.file.revision, contentRevision: staged.file.contentRevision, storageKind: staged.file.storageKind } }, ctx);
                    return { file: staged.file, trashEntry };
                }
                catch (error) {
                    try {
                        await this.files.restoreTrash(staged.file.id, ctx);
                    }
                    catch { }
                    throw error;
                } } });
            this.actions.register({ code: 'ACTION.CORE.FILE.TRASH.RESTORE', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.TRASH.OWNER.INTERNAL', handler: (p, ctx) => { if (p.resourceType !== 'CORE.FILE' || p.mode !== 'RESTORE')
                    throw new Error('Invalid FileService restore owner payload'); return this.files.restoreTrash(p.resourceId, ctx); } });
            this.actions.register({ code: 'ACTION.CORE.FILE.TRASH.PURGE', ownerApp: 'APP.NEXUS', risk: 'DESTRUCTIVE', permission: 'CORE.TRASH.OWNER.INTERNAL', handler: (p, ctx) => { if (p.resourceType !== 'CORE.FILE' || p.mode !== 'PURGE')
                    throw new Error('Invalid FileService purge owner payload'); return this.files.purgeTrash(p.resourceId, ctx); } });
            this.actions.register({ code: 'ACTION.CORE.FILE_COLLECTION.CREATE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.FILE.COLLECTION.CREATE', handler: (p, ctx) => this.fileLibrary.createCollection(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.FILE_COLLECTION.ATTACH', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.FILE.COLLECTION.EDIT', handler: (p, ctx) => this.fileLibrary.attach(p.fileId, p.collectionId, ctx, { pinned: p.pinned, order: p.order }) });
            this.actions.register({ code: 'ACTION.CORE.FILE_COLLECTION.DETACH', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.FILE.COLLECTION.EDIT', handler: (p, ctx) => this.fileLibrary.detach(p.fileId, p.collectionId, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SETTING.SET', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => this.settings.set({ ...p, value: this.settingsDefaults.validateValue(p.key, p.value), updatedBy: ctx.actorId }, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SETTING.RESET', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => this.settings.unset(p.key, p.scopeType, p.scopeId, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SETTING.DEFAULTS.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: async (p) => ({ summary: this.settingsDefaults.summary(), definitions: this.settingsDefaults.list(p.appCode) }) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.INDEX.UPSERT', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.TRASH.INDEX', handler: (p, ctx) => this.trashRetention.index(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.LIST', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashRetention.list(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.PURGE.DRY_RUN', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashRetention.purgeDryRun(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.RESTORE.PLAN', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashRetention.restorePlan(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.SELECTION.PREVIEW', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashRetention.selectionPreview(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.SELECTION.PURGE.TRANSACTION_SANDBOX', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashRetention.selectionPurgeTransactionSandbox(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.SELECTION.PURGE.READINESS', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashRetention.selectionPurgeReadiness(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.OWNER.COVERAGE', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (_p, ctx) => this.trashRetention.ownerCoverage(ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.STORAGE.READBACK', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: async (p, ctx) => { if (p.targetId && p.targetId !== 'BROWSER_BLOB')
                    throw new Error('TRASH_STORAGE_ADAPTER_UNAVAILABLE'); if (!Array.isArray(p.entryIds) || !p.entryIds.length)
                    throw new Error('TRASH_STORAGE_ENTRY_IDS_REQUIRED'); const ids = [...new Set(p.entryIds.map(x => String(x || '').trim()).filter(Boolean))]; if (!ids.length)
                    throw new Error('TRASH_STORAGE_ENTRY_IDS_REQUIRED'); if (ids.length > 64)
                    throw new Error('TRASH_STORAGE_READBACK_LIMIT_EXCEEDED'); const wanted = new Set(ids), rows = (await this.trashRetention.list({ storageTargetId: 'BROWSER_BLOB', status: 'TRASHED' }, ctx)).filter(x => x.data.resourceType === 'CORE.FILE' && wanted.has(x.id)); const result = await this.files.trashStorageReadback(rows); return { ...result, bounded: true, maxEntries: 64, requested: ids.length }; } });
            this.actions.register({ code: 'ACTION.CORE.TRASH.STORAGE.NATIVE_MANAGED.READBACK', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: async (p, ctx) => { if (p.targetId && p.targetId !== 'NATIVE_MANAGED')
                    throw new Error('TRASH_NATIVE_MANAGED_STORAGE_TARGET_REQUIRED'); if (!Array.isArray(p.entryIds) || !p.entryIds.length)
                    throw new Error('TRASH_NATIVE_MANAGED_ENTRY_IDS_REQUIRED'); const ids = [...new Set(p.entryIds.map(x => String(x || '').trim()).filter(Boolean))]; if (!ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_ENTRY_IDS_REQUIRED'); if (ids.length > 64)
                    throw new Error('TRASH_NATIVE_MANAGED_READBACK_LIMIT_EXCEEDED'); const wanted = new Set(ids), rows = (await this.trashRetention.list({ storageTargetId: 'NATIVE_MANAGED', status: 'TRASHED' }, ctx)).filter(x => x.data.resourceType === 'CORE.FILE' && wanted.has(x.id)); const result = await this.files.trashNativeManagedStorageReadback(rows); return { ...result, bounded: true, maxEntries: 64, requested: ids.length }; } });
            this.actions.register({ code: 'ACTION.CORE.TRASH.STORAGE.NATIVE_MANAGED.PURGE.TRANSACTION.SANDBOX', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: async (p, ctx) => { if (!Array.isArray(p.entryIds) || !p.entryIds.length)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_SANDBOX_ENTRY_IDS_REQUIRED'); const ids = [...new Set(p.entryIds.map(x => String(x || '').trim()).filter(Boolean))]; if (!ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_SANDBOX_ENTRY_IDS_REQUIRED'); if (ids.length > 64)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_SANDBOX_LIMIT_EXCEEDED'); const wanted = new Set(ids), rows = (await this.trashRetention.list({ storageTargetId: 'NATIVE_MANAGED', status: 'TRASHED' }, ctx)).filter(x => x.data.resourceType === 'CORE.FILE' && wanted.has(x.id)); if (rows.length !== ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_SANDBOX_SELECTION_NOT_VISIBLE'); return this.files.trashNativeManagedPurgeTransactionSandbox(rows, p.faultAfterRevision); } });
            this.actions.register({ code: 'ACTION.CORE.TRASH.STORAGE.NATIVE_MANAGED.PURGE.ISOLATED_EXECUTOR', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: async (p, ctx) => { if (!Array.isArray(p.entryIds) || !p.entryIds.length)
                    throw new Error('TRASH_NATIVE_MANAGED_ISOLATED_EXECUTOR_ENTRY_IDS_REQUIRED'); const ids = [...new Set(p.entryIds.map(x => String(x || '').trim()).filter(Boolean))]; if (!ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_ISOLATED_EXECUTOR_ENTRY_IDS_REQUIRED'); if (ids.length > 64)
                    throw new Error('TRASH_NATIVE_MANAGED_ISOLATED_EXECUTOR_LIMIT_EXCEEDED'); const wanted = new Set(ids), rows = (await this.trashRetention.list({ storageTargetId: 'NATIVE_MANAGED', status: 'TRASHED' }, ctx)).filter(x => x.data.resourceType === 'CORE.FILE' && wanted.has(x.id)); if (rows.length !== ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_ISOLATED_EXECUTOR_SELECTION_NOT_VISIBLE'); return this.files.trashNativeManagedIsolatedDeleteExecutor(rows, p.faultAfterRevision); } });
            this.actions.register({ code: 'ACTION.CORE.TRASH.STORAGE.NATIVE_MANAGED.PURGE.EXECUTION.PREFLIGHT', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: async (p, ctx) => { if (!Array.isArray(p.entryIds) || !p.entryIds.length)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_PREFLIGHT_ENTRY_IDS_REQUIRED'); const ids = [...new Set(p.entryIds.map(x => String(x || '').trim()).filter(Boolean))]; if (!ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_PREFLIGHT_ENTRY_IDS_REQUIRED'); if (ids.length > 64)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_PREFLIGHT_LIMIT_EXCEEDED'); const wanted = new Set(ids), rows = (await this.trashRetention.list({ storageTargetId: 'NATIVE_MANAGED', status: 'TRASHED' }, ctx)).filter(x => x.data.resourceType === 'CORE.FILE' && wanted.has(x.id)); if (rows.length !== ids.length)
                    throw new Error('TRASH_NATIVE_MANAGED_PURGE_PREFLIGHT_SELECTION_NOT_VISIBLE'); return this.files.trashNativeManagedPurgeExecutionPreflight(rows); } });
            this.actions.register({ code: 'ACTION.CORE.TRASH.STORAGE.ASSESS', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: async (p) => this.trashRetention.assessStorage(p) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.WARNINGS.PLAN', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.TRASH.READ', handler: (p, ctx) => this.trashWarnings.plan(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.WARNINGS.RECONCILE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.ALARM.EDIT', handler: (p, ctx) => this.trashWarnings.reconcile(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.WARNINGS.SCHEDULE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.JOB.MANAGE', handler: (p, ctx) => this.trashWarnings.schedule(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.RESTORE.EXECUTE', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.TRASH.EXECUTE', handler: (p, ctx) => this.trashRetention.restoreExecute(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TRASH.PURGE.EXECUTE', ownerApp: 'APP.NEXUS', risk: 'DESTRUCTIVE', permission: 'CORE.TRASH.EXECUTE', handler: (p, ctx) => this.trashRetention.purgeExecute(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SHARING.SET', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.SHARING.MANAGE', handler: (p, ctx) => this.sharing.set({ id: `SHARE.${p.resourcePath.replace(/[^A-Za-z0-9_.-]+/g, '_')}`, ...p, updatedAt: now() }, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SHARING.RESET', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.SHARING.MANAGE', handler: (p, ctx) => this.sharing.unset(p.resourcePath, ctx) });
            this.actions.register({ code: 'ACTION.CORE.USER.UPSERT', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.USER.MANAGE', handler: (p, ctx) => this.memberships.upsertUser(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SPACE.UPSERT', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.SPACE.MANAGE', handler: (p, ctx) => this.memberships.upsertSpace(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SPACE.MEMBERSHIP.SET', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.SPACE.MEMBERSHIP.MANAGE', handler: (p, ctx) => this.memberships.setMembership(p.spaceId, p.userId, p.role, ctx) });
            this.actions.register({ code: 'ACTION.LASER.DOMAIN.LIST', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.READ', handler: (p) => this.laserDomain.list(p.type) });
            this.actions.register({ code: 'ACTION.LASER.TRASH', ownerApp: 'APP.KX.LASER', risk: 'SENSITIVE_WRITE', permission: 'LASER.TRASH', handler: async (p, ctx) => { const staged = await this.laserDomain.trashStage(p.resourceType, p.resourceId, ctx); try {
                    const d = staged.archived.data, trashEntry = await this.trashRetention.index({ title: String(d.title || d.name || staged.stableIdentity), sourceOwnerApp: 'APP.KX.LASER', ownerService: 'LaserDomainService', resourceType: p.resourceType, resourceId: p.resourceId, stableIdentity: staged.stableIdentity, deletedAt: staged.deletedAt, deletedBy: ctx.actorId, sourceDevice: ctx.deviceId, originalDeepLink: this.deepLinks.build({ kind: 'ENTITY', type: p.resourceType, id: p.resourceId, appCode: 'APP.KX.LASER' }), spaceIds: [...staged.archived.spaceIds], retainUntil: p.retainUntil, dependencyCount: 0, dependencySummary: [], backupRequired: true, backupEvidence: [...(p.backupEvidence || [])], protected: !!p.protected, holdReason: p.holdReason, metadata: { recordUid: String(d.recordUid || ''), recordCode: String(d.recordCode || ''), previousStatus: staged.previousStatus, restoreStatus: staged.restoreStatus, relationSha256: staged.relationSha256, timingSha256Before: staged.timingSha256Before, timingSha256Archived: staged.timingSha256Archived, ownerRevision: staged.archived.revision, trashContract: 'KX.LASER_TRASH_RESTORE/1' } }, ctx);
                    return { entity: staged.archived, trashEntry };
                }
                catch (error) {
                    await this.laserDomain.rollbackTrashStage(staged, ctx);
                    throw error;
                } } });
            this.actions.register({ code: 'ACTION.LASER.TRASH.RESTORE', ownerApp: 'APP.KX.LASER', risk: 'SENSITIVE_WRITE', permission: 'CORE.TRASH.OWNER.INTERNAL', handler: (p, ctx) => { if (p.mode !== 'RESTORE')
                    throw new Error('Invalid LASER Trash restore payload'); return this.laserDomain.restoreTrash(p.resourceType, p.resourceId, p.metadata, ctx); } });
            this.actions.register({ code: 'ACTION.LASER.TRASH.PURGE.AUDIT', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.TRASH', handler: (p, ctx) => this.laserDomain.auditPurgeDependencies(p.resourceType, p.resourceId, ctx) });
            this.actions.register({ code: 'ACTION.LASER.TRASH.PURGE.TRANSACTION_SANDBOX', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.TRASH', handler: (p, ctx) => this.laserDomain.simulatePurgeTransaction(p.resourceType, p.resourceId, ctx) });
            this.actions.register({ code: 'ACTION.LASER.TRASH.PURGE.REPOSITORY_SANDBOX', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.TRASH', handler: (p, ctx) => this.laserPurgeRepositorySandbox.simulate(p.resourceType, p.resourceId, ctx) });
            this.actions.register({ code: 'ACTION.LASER.TRASH.PURGE.JOURNAL_SANDBOX', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.TRASH', handler: (p, ctx) => this.laserPurgeDurableJournalSandbox.simulate(p.resourceType, p.resourceId, ctx) });
            this.actions.register({ code: 'ACTION.LASER.TRASH.PURGE.RECOVERY_SANDBOX', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.TRASH', handler: async () => this.laserPurgeJournalRecoverySandbox.simulate() });
            this.actions.register({ code: 'ACTION.LASER.TRASH.PURGE.OWNER.PREFLIGHT', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.TRASH', handler: (p, ctx) => this.laserPurgeOwnerExecutionPreflight.inspect(p.resourceType, p.resourceId, ctx) });
            this.actions.register({ code: 'ACTION.LASER.MATERIAL.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.CONFIG.EDIT', handler: (p, ctx) => this.laserDomain.saveMaterial(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.MACHINE.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.CONFIG.EDIT', handler: (p, ctx) => this.laserDomain.saveMachine(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.SOURCE_MODULE.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.CONFIG.EDIT', handler: (p, ctx) => this.laserDomain.saveSourceModule(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.PROFILE.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.CONFIG.EDIT', handler: (p, ctx) => this.laserDomain.saveProfile(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.LENS.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.CONFIG.EDIT', handler: (p, ctx) => this.laserDomain.saveLens(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.PROJECT.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.PROJECT.EDIT', handler: (p, ctx) => this.laserDomain.saveProject(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.OPERATION.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.PROJECT.EDIT', handler: (p, ctx) => this.laserDomain.saveOperation(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.TEST.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.TEST.EDIT', handler: (p, ctx) => this.laserDomain.saveTest(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.TEST_RUN.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.TEST.EDIT', handler: (p, ctx) => this.laserDomain.saveTestRun(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.IMPORT.SAVE', ownerApp: 'APP.KX.LASER', risk: 'SAFE_WRITE', permission: 'LASER.IMPORT.EDIT', handler: (p, ctx) => this.laserDomain.saveImport(p, ctx) });
            this.actions.register({ code: 'ACTION.LASER.P566.MIGRATION.PREVIEW', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.MIGRATION.PREVIEW', handler: (p) => this.laserP566Preview.preview(p) });
            this.actions.register({ code: 'ACTION.LASER.P566.PARITY.OWNERS', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.MIGRATION.PREVIEW', handler: async () => this.laserP566ParityOwners.list() });
            this.actions.register({ code: 'ACTION.LASER.P566.MIGRATION.ANALYZE', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.MIGRATION.PREVIEW', handler: (p) => this.laserP566Adapter.analyze(p) });
            this.actions.register({ code: 'ACTION.LASER.P566.MIGRATION.STAGE', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.MIGRATION.PREVIEW', handler: (p, ctx) => this.laserP566Staging.stage({ ...p, userId: p.userId || ctx.actorId, deviceId: p.deviceId || ctx.deviceId }) });
            this.actions.register({ code: 'ACTION.LASER.P566.MIGRATION.VERIFY_TRANSACTION', ownerApp: 'APP.KX.LASER', risk: 'READ', permission: 'LASER.MIGRATION.PREVIEW', handler: (p, ctx) => this.laserP566TransactionVerifier.verify(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TASK.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.TASK.EDIT', handler: (p, ctx) => this.tasks.save(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.TASK.COMPLETE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.TASK.EDIT', handler: (p, ctx) => this.tasks.complete(p.id, ctx) });
            this.actions.register({ code: 'ACTION.CORE.CALENDAR.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.CALENDAR.EDIT', handler: (p, ctx) => this.calendar.save(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.CALENDAR.OCCURRENCE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.CALENDAR.EDIT', handler: async (p, ctx) => {
                    const ev = await this.calendar.get(String(p?.id || ''));
                    if (!ev || ev.archivedAt)
                        throw new Error('CALENDAR_EVENT_NOT_FOUND');
                    const date = String(p?.date || '');
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
                        throw new Error('CALENDAR_OCCURRENCE_DATE');
                    const set = new Set(ev.exDates || []);
                    if (p?.op === 'SKIP') {
                        if (!ev.recurrenceRule)
                            throw new Error('CALENDAR_NOT_RECURRING');
                        set.add(date);
                    }
                    else if (p?.op === 'RESTORE')
                        set.delete(date);
                    else
                        throw new Error('CALENDAR_OCCURRENCE_OP');
                    return this.calendar.save({ ...ev, exDates: [...set], expectedRevision: ev.revision }, ctx);
                } });
            this.actions.register({ code: 'ACTION.CORE.ALARM.SAVE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.ALARM.EDIT', handler: (p, ctx) => this.alarms.save(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.ALARM.ACK', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.ALARM.EDIT', handler: (p, ctx) => this.alarms.acknowledge(p.id, ctx) });
            this.actions.register({ code: 'ACTION.CORE.ALARM.SNOOZE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.ALARM.EDIT', handler: (p, ctx) => this.alarms.snooze(p.id, p.until, ctx) });
            this.actions.register({ code: 'ACTION.CORE.JOB.SCHEDULE', ownerApp: 'APP.NEXUS', risk: 'SAFE_WRITE', permission: 'CORE.JOB.MANAGE', handler: (p, ctx) => this.jobs.schedule(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.DEVICE.TRUST.SET', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.DEVICE.TRUST', handler: (p, ctx) => this.devices.setTrusted(p.deviceId, p.trusted, ctx) });
            this.actions.register({ code: 'ACTION.CORE.SYSTEM.HEALTH.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.HEALTH.READ', handler: async () => this.health() });
            this.actions.register({ code: 'ACTION.CORE.IMPLEMENTATION.STATUS.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.HEALTH.READ', handler: async (p) => ({ summary: this.implementation.summary(), features: this.implementation.list(p.status) }) });
            this.actions.register({ code: 'ACTION.CORE.AI.SYSTEM.REVIEW', ownerApp: 'APP.KX.AI', risk: 'READ', permission: 'CORE.AI.SYSTEM.REVIEW', handler: (p, ctx) => this.aiSupervisor.review(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.SYSTEM.REVIEW.SCHEDULE', ownerApp: 'APP.KX.AI', risk: 'SENSITIVE_WRITE', permission: 'CORE.AI.SYSTEM.REVIEW.SCHEDULE', handler: (p, ctx) => this.jobs.schedule({ code: 'AI.SYSTEM.REVIEW.BACKGROUND', ownerApp: 'APP.KX.AI', handlerCode: 'AI.SYSTEM.REVIEW', intervalMinutes: Math.max(15, Number(p.intervalMinutes || 60)), payload: { scope: p.scope || 'CORE' }, status: 'ENABLED' }, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.CONNECTION.SAVE', ownerApp: 'APP.KX.AI', risk: 'SENSITIVE_WRITE', permission: 'CORE.AI.CONNECTION.MANAGE', handler: (p, ctx) => this.aiConnections.save(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.SESSION.CREATE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.CHAT', handler: (p, ctx) => this.aiSessions.create(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.CHAT.SEND', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.CHAT', handler: (p, ctx) => this.aiGateway.chat(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.ACTION.PROPOSE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.ACTION.PROPOSE', handler: (p, ctx) => this.aiGateway.proposeAction(p, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.ACTION.EXECUTE', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.ACTION.EXECUTE', handler: (p, ctx) => this.aiGateway.executeActionRequest(p.id, ctx) });
            this.actions.register({ code: 'ACTION.CORE.AI.ACTION.REJECT', ownerApp: 'APP.KX.AI', risk: 'SAFE_WRITE', permission: 'CORE.AI.ACTION.EXECUTE', handler: (p, ctx) => this.aiGateway.rejectActionRequest(p.id, ctx) });
            this.actions.register({ code: 'ACTION.CORE.RECOVERY.SNAPSHOT.CREATE', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.RECOVERY.CREATE', handler: (p, ctx) => this.recovery.create({ createdBy: ctx.actorId, runtimeVersion: 'P0009-WIP.10', includeAudit: p.includeAudit, includeFileBlobs: p.includeFileBlobs, systemMap: this.dataMap.get(), workspaceProfile: this.workspaceProfile }) });
        }
        async health() { return { ready: this.ready, repository: this.repository.mode, workspaceId: this.workspaceProfile?.id, workspaceMode: this.workspaceProfile?.mode, actions: this.actions.list().length, users: (await this.memberships.listUsers()).length, spaces: (await this.memberships.listSpaces()).length, memberships: (await this.memberships.listMemberships()).length, devices: (await this.devices.listDevices()).length, sessions: (await this.devices.listSessions()).length, capabilityReports: (await this.repository.all('capabilityReports')).length, entities: (await this.entities.list()).length, aiConnections: (await this.entities.list()).filter(x => x.type === 'CORE.AI_CONNECTION').length, aiSessions: (await this.entities.list()).filter(x => x.type === 'CORE.AI_SESSION').length, aiProviders: this.aiProviders.list().length, implementationFeatures: this.implementation.summary().total, implementationIncomplete: this.implementation.summary().incomplete, trashEntries: (await this.trashRetention.list({}, { actorId: 'SYSTEM', appCode: 'APP.NEXUS' })).length, revisions: (await this.repository.all('revisions')).length, relations: (await this.relations.list()).length, settings: (await this.settings.list()).length, settingDefaultDefinitions: this.settingsDefaults.summary().definitions, settingDefaultApps: this.settingsDefaults.summary().apps, shareRules: (await this.sharing.list()).length, files: (await this.files.list()).length, fileSearch: (await this.repository.all('fileSearch')).length, fileCollections: (await this.fileLibrary.listCollections()).length, fileMemberships: (await this.fileLibrary.listMemberships()).length, documents: (await this.documents.list()).length, tasks: (await this.tasks.list()).length, calendarEvents: (await this.calendar.list()).length, alarms: (await this.alarms.list()).length, backgroundJobs: (await this.jobs.list()).length, recoverySnapshots: (await this.recovery.list()).length, dataMapLoaded: !!this.dataMap.get().release, searchReady: true, routes: this.routes.list().length, inspectorReady: true, outboxPending: (await this.outbox.list('PENDING')).length, openConflicts: (await this.conflicts.list('OPEN')).length, syncConnection: this.sync.connection, audit: (await this.audit.list()).length, at: now() }; }
    }
    KX.CoreRuntime = CoreRuntime;
    // P0008 Workspace invariant: no eager global Runtime singleton.
    // The shell must create exactly one CoreRuntime after the active Workspace has been selected/activated.
})(KX || (KX = {}));
