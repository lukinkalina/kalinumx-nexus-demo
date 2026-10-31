// N2.5k (user 2026-10-25): „🔖 Identifikace a přístupy“ – ONE set of fields in the core for machines, devices, spare parts, materials /
// filaments, software, accounts, vehicles (and anywhere it fits): serial number, internal / inventory number, manufacturer, model,
// supplier order number (SKU), manufacturer part number (MPN), EAN, purchase, warranty, licence validity, login e-mail / user, group,
// category, status, service. Presets per kind show only the fields that make sense. Attached to any record (one identification per
// record, readable = the record is readable). Duplicate serial numbers (same manufacturer) are reported. SECRETS (passwords, licence
// keys, PINs) are NEVER stored here – refused with a pointer to the Trezor (vault step).
var KXAssetIdent;
(function () {
    const OWNER = 'APP.KX.NEXUS', TYPE = 'CORE.ASSET.IDENT';
    const KINDS = ['MACHINE', 'PART', 'MATERIAL', 'SOFTWARE', 'ACCOUNT', 'VEHICLE', 'GENERAL'];
    const STATUS = ['IN_USE', 'IN_REPAIR', 'RETIRED', 'LENT', 'IN_STOCK'];
    const F = { MACHINE: ['manufacturer', 'model', 'serial', 'inventoryNo', 'revision', 'year', 'firmware', 'mac', 'ip', 'location', 'supplier', 'sku', 'mpn', 'ean', 'purchaseDate', 'price', 'warrantyUntil', 'serviceLast', 'serviceNext', 'counter', 'group', 'category', 'status', 'note'],
        PART: ['name', 'manufacturer', 'mpn', 'sku', 'supplier', 'ean', 'compatibleWith', 'minStock', 'group', 'category', 'note'], MATERIAL: ['name', 'manufacturer', 'material', 'color', 'size', 'pack', 'sku', 'supplier', 'ean', 'minStock', 'group', 'category', 'note'],
        SOFTWARE: ['name', 'edition', 'version', 'licenseValidUntil', 'seats', 'loginEmail', 'accountUrl', 'supplier', 'purchaseDate', 'price', 'group', 'category', 'note'], ACCOUNT: ['name', 'loginEmail', 'accountUrl', 'group', 'category', 'note'],
        VEHICLE: ['manufacturer', 'model', 'serial', 'inventoryNo', 'year', 'purchaseDate', 'warrantyUntil', 'serviceLast', 'serviceNext', 'counter', 'note'], GENERAL: ['name', 'manufacturer', 'model', 'serial', 'inventoryNo', 'sku', 'mpn', 'ean', 'group', 'category', 'note'] };
    const SECRET = /pass|heslo|pin\b|secret|token|license.?key|licen[cč]n[ií].?kl[ií][cč]|klic|apikey|api.?key/i;
    const DATE = ['purchaseDate', 'warrantyUntil', 'serviceLast', 'serviceNext', 'licenseValidUntil'];
    const NUM = ['price', 'year', 'counter', 'minStock', 'seats'];
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    function install(core) {
        if (core.assetIdent)
            return core.assetIdent;
        const readable = async (ref, actor) => { try {
            await core.inspector.inspect(core.deepLinks.parse(ref), actor);
            return true;
        }
        catch {
            return false;
        } };
        const all = async () => (await core.entities.list()).filter((r) => r.type === TYPE && !r.archivedAt);
        const svc = { KINDS, FIELDS: F, STATUS,
            clean(p) {
                const kind = KINDS.includes(p?.kind) ? p.kind : 'GENERAL';
                const fields = F[kind];
                const v = p?.values || {};
                const out = {};
                for (const k of Object.keys(v)) {
                    if (SECRET.test(k))
                        throw new Error('IDENT_SECRET_TREZOR ' + k);
                }
                for (const k of fields) {
                    let x = v[k];
                    if (x === undefined || x === null || x === '')
                        continue;
                    if (DATE.includes(k)) {
                        x = String(x).trim();
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(x) || new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) !== x)
                            throw new Error('IDENT_DATE_INVALID ' + k);
                    }
                    else if (NUM.includes(k)) {
                        const n = Number(String(x).replace(/\s/g, '').replace(',', '.'));
                        if (!Number.isFinite(n) || n < 0)
                            throw new Error('IDENT_NUMBER_INVALID ' + k);
                        x = n;
                    }
                    else if (k === 'status') {
                        if (!STATUS.includes(String(x)))
                            throw new Error('IDENT_STATUS_INVALID');
                    }
                    else if (k === 'accountUrl') {
                        x = String(x).trim();
                        if (!/^https?:\/\//i.test(x))
                            throw new Error('IDENT_URL_NOT_WEB');
                    }
                    else if (k === 'loginEmail') {
                        x = String(x).trim();
                        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
                            throw new Error('IDENT_EMAIL_INVALID');
                    }
                    else if (k === 'ean') {
                        x = String(x).replace(/\s/g, '');
                        if (!/^\d{8}$|^\d{12,14}$/.test(x))
                            throw new Error('IDENT_EAN_INVALID');
                    }
                    else
                        x = String(x).trim().slice(0, k === 'note' ? 1000 : 200);
                    out[k] = x;
                }
                const custom = {};
                for (const [k, x] of Object.entries(p?.custom || {})) {
                    if (SECRET.test(k))
                        throw new Error('IDENT_SECRET_TREZOR ' + k);
                    const kk = String(k).slice(0, 40);
                    if (kk)
                        custom[kk] = String(x ?? '').slice(0, 300);
                }
                return { kind, values: out, custom };
            },
            async get(p, ctx) { const ref = String(p?.ref || ''); if (!await readable(ref, ctx.actorId))
                throw new Error('IDENT_NOT_READABLE'); const r = (await all()).find((x) => x.data?.ref === ref); return r ? { id: r.id, revision: r.revision, ...r.data } : null; },
            /* one identification per record; saved in the record's spaces (readable together with it) */
            async save(p, ctx) {
                const ref = String(p?.ref || '');
                let tgt;
                try {
                    tgt = await core.inspector.inspect(core.deepLinks.parse(ref), ctx.actorId);
                }
                catch {
                    throw new Error('IDENT_NOT_READABLE');
                }
                const c = svc.clean(p);
                const ex = (await all()).find((x) => x.data?.ref === ref); /* the identification lives in the SAME spaces as the record (the inspector returns them under entity / file / task …) – never silently in a personal space */
                const spaces = (tgt?.entity?.spaceIds || tgt?.file?.spaceIds || tgt?.task?.spaceIds || tgt?.event?.spaceIds || tgt?.target?.spaceIds || []);
                if (!spaces.length)
                    throw new Error('IDENT_RECORD_SPACE_UNKNOWN');
                const sp = spaces;
                const data = { ref, ...c, updatedBy: ctx.actorId, updatedAt: new Date().toISOString() };
                const rec = ex ? await core.entities.save({ ...ex, expectedRevision: p.expectedRevision ?? ex.revision, data: { ...ex.data, ...data } }, { ...ctx, appCode: OWNER }) : await core.entities.save({ type: TYPE, ownerApp: OWNER, schema: 'KX.ASSET_IDENT/1', spaceIds: sp, data }, { ...ctx, appCode: OWNER });
                const dup = c.values.serial ? await svc.duplicates({ serial: c.values.serial, manufacturer: c.values.manufacturer }, ctx) : [];
                return { id: rec.id, revision: rec.revision, duplicates: dup.filter((x) => x.ref !== ref) };
            },
            /* same serial (+ same manufacturer when given) on another readable record */
            async duplicates(p, ctx) {
                const s = norm(p?.serial);
                if (!s)
                    return [];
                const m = norm(p?.manufacturer);
                const out = [];
                for (const r of await all()) {
                    const v = r.data?.values || {};
                    if (norm(v.serial) !== s)
                        continue;
                    if (m && v.manufacturer && norm(v.manufacturer) !== m)
                        continue;
                    if (!await readable(r.data.ref, ctx.actorId))
                        continue;
                    out.push({ ref: r.data.ref, serial: v.serial, manufacturer: v.manufacturer, model: v.model });
                }
                return out;
            },
            /* find by S/N, inventory no., SKU, MPN, EAN (only readable records) */
            async find(p, ctx) {
                const q = norm(p?.q);
                if (q.length < 2)
                    return [];
                const out = [];
                for (const r of await all()) {
                    const v = r.data?.values || {};
                    const hit = ['serial', 'inventoryNo', 'sku', 'mpn', 'ean', 'name', 'model'].find(k => norm(v[k]).includes(q));
                    if (!hit)
                        continue;
                    if (!await readable(r.data.ref, ctx.actorId))
                        continue;
                    out.push({ ref: r.data.ref, kind: r.data.kind, field: hit, value: v[hit], name: v.name || v.model || '' });
                }
                return out;
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.IDENT.GET', 'READ', (p, c) => svc.get(p, c));
        reg('ACTION.CORE.IDENT.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c));
        reg('ACTION.CORE.IDENT.DUPLICATES', 'READ', (p, c) => svc.duplicates(p, c));
        reg('ACTION.CORE.IDENT.FIND', 'READ', (p, c) => svc.find(p, c));
        core.assetIdent = svc;
        return svc;
    }
    KXAssetIdent = { install, FIELDS: F, KINDS };
    globalThis.KXAssetIdent = KXAssetIdent;
})();
