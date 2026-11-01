// N2.1d (R23/R24) — valid for every entity-based hub in NEXUS:
//  R23: any record AND any single item inside it can be marked sensitive. Marked data is hidden in
//       notifications, Personal Home cards and system messages unless the user explicitly allows it.
//  R24: in the record's own edit window the record can be added to Family and to Company separately.
// Stored on the record itself (data.kxControls) => Core revision + audit + outbox, same ACL as the record.
var KXRecordControls;
(function (NS) {
    const ok = (v) => v === true || v === false;
    const ctl = (r) => { const c = r?.data?.kxControls; return { sensitive: c?.sensitive === true, items: { ...(c?.items || {}) } }; };
    const isSensitive = (r) => ctl(r).sensitive;
    const isItemSensitive = (r, itemId) => ctl(r).sensitive || ctl(r).items[itemId] === true;
    class RecordControlsService {
        core;
        clock;
        constructor(core, clock = () => Date.now()) {
            this.core = core;
            this.clock = clock;
        }
        async editable(input, ctx) {
            if (typeof input?.id !== 'string' || !input.id)
                throw new Error('RECORD_ID_REQUIRED');
            if (!Number.isInteger(input?.expectedRevision))
                throw new Error('RECORD_EXPECTED_REVISION_REQUIRED');
            const r = await this.core.entities.get(input.id);
            if (!r)
                throw new Error('RECORD_NOT_FOUND');
            if (String(r.type).startsWith('CORE.IDENTITY.'))
                throw new Error('RECORD_TYPE_PROTECTED');
            if (ctx.actorId !== 'SYSTEM' && await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, ctx.actorId, 'EDIT') !== true)
                throw new Error('Scope denied: EDIT required');
            if (r.revision !== input.expectedRevision)
                throw new Error(`Revision conflict ${r.id}: expected ${input.expectedRevision}, actual ${r.revision}`);
            if (r.archivedAt)
                throw new Error('RECORD_ARCHIVED_READ_ONLY');
            return r;
        }
        history(data, entry) { if (Array.isArray(data.history))
            data.history = [...data.history, { at: new Date(this.clock()).toISOString(), ...entry }].slice(-50); return data; }
        save(r, data, spaceIds, ctx) { return this.core.entities.save({ id: r.id, type: r.type, ownerApp: r.ownerApp, schema: r.schema, spaceIds, data, expectedRevision: r.revision }, ctx); }
        async contextSpaces(actorId) {
            const out = { FAMILY: null, COMPANY: null };
            for (const s of await this.core.memberships.listSpaces()) {
                if (s.archivedAt || !['FAMILY', 'COMPANY'].includes(s.kind) || out[s.kind])
                    continue;
                out[s.kind] = { id: s.id, name: s.name, role: await this.core.memberships.roleFor(s.id, actorId) };
            }
            return out;
        }
        async status(record, actorId) {
            const sp = await this.contextSpaces(actorId);
            const ids = record?.spaceIds || [];
            const c = ctl(record);
            return { sensitive: c.sensitive, items: c.items, family: !!sp.FAMILY && ids.includes(sp.FAMILY.id), company: !!sp.COMPANY && ids.includes(sp.COMPANY.id), spaces: sp };
        }
        async setSensitivity(input, ctx) {
            const r = await this.editable(input, ctx);
            const c = ctl(r);
            if (input.sensitive !== undefined) {
                if (!ok(input.sensitive))
                    throw new Error('RECORD_SENSITIVE_BOOLEAN');
                c.sensitive = input.sensitive;
            }
            if (input.items !== undefined) {
                if (!input.items || typeof input.items !== 'object' || Array.isArray(input.items))
                    throw new Error('RECORD_ITEMS_INVALID');
                const known = new Set();
                for (const v of Object.values(r.data || {}))
                    if (Array.isArray(v))
                        for (const it of v)
                            if (it && typeof it.id === 'string')
                                known.add(it.id);
                for (const [id, v] of Object.entries(input.items)) {
                    if (!known.has(id))
                        throw new Error('RECORD_ITEM_UNKNOWN');
                    if (!ok(v))
                        throw new Error('RECORD_SENSITIVE_BOOLEAN');
                    if (v)
                        c.items[id] = true;
                    else
                        delete c.items[id];
                }
            }
            const data = this.history({ ...r.data, kxControls: { sensitive: c.sensitive, items: c.items } }, { kind: 'SENSITIVITY', sensitive: c.sensitive, items: Object.keys(c.items).length });
            return this.save(r, data, r.spaceIds || [], ctx);
        }
        // N2.1f (R23): export of a hub's records (JSON, KX.CORE_RECORD_EXPORT/1). Only records the actor can READ;
        // records marked sensitive are left out and marked items replaced by {id,redacted:true}, unless the caller
        // explicitly asks (includeMarkedSensitive, confirmation required). Identity rows are never exported.
        async exportRecords(input, ctx) {
            const ownerApp = input?.ownerApp;
            if (typeof ownerApp !== 'string' || !/^APP\.KX\.[A-Z0-9_]+$/.test(ownerApp))
                throw new Error('RECORD_EXPORT_OWNER_INVALID');
            const withMarked = input?.includeMarkedSensitive === true;
            if (input?.includeMarkedSensitive !== undefined && !ok(input.includeMarkedSensitive))
                throw new Error('RECORD_EXPORT_BOOLEAN');
            if (withMarked && !ctx?.confirmed)
                throw new Error('Confirmation required: RECORD_EXPORT_MARKED');
            const out = [];
            let omitted = 0, redactedItems = 0;
            /* N2.5a: optional choice of spaces (own + selected shared) – always intersected with what the actor may read */
            const pick = Array.isArray(input?.spaceIds) && input.spaceIds.length ? new Set(input.spaceIds.map(String)) : null;
            for (const r of await this.core.entities.list()) {
                if (r.ownerApp !== ownerApp || r.archivedAt || String(r.type).startsWith('CORE.IDENTITY.'))
                    continue;
                if (pick && !(r.spaceIds || []).some((x) => pick.has(x)))
                    continue;
                if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, ctx.actorId, 'READ') !== true)
                    continue;
                const c = ctl(r);
                if (c.sensitive && !withMarked) {
                    omitted++;
                    continue;
                }
                const data = structuredClone(r.data || {});
                if (!withMarked)
                    for (const [k, v] of Object.entries(data))
                        if (Array.isArray(v))
                            data[k] = v.map((it) => { if (it && typeof it.id === 'string' && c.items[it.id]) {
                                redactedItems++;
                                return { id: it.id, redacted: true };
                            } return it; });
                out.push({ id: r.id, type: r.type, revision: r.revision, spaceIds: [...(r.spaceIds || [])], updatedAt: r.updatedAt, data });
            }
            return { contract: 'KX.CORE_RECORD_EXPORT/1', ownerApp, exportedAt: new Date(this.clock()).toISOString(), actorId: ctx.actorId, includeMarkedSensitive: withMarked, count: out.length, omittedMarkedRecords: omitted, redactedItems, records: out };
        }
        async share(input, ctx) {
            const r = await this.editable(input, ctx);
            const sp = await this.contextSpaces(ctx.actorId);
            let ids = [...(r.spaceIds || [])];
            for (const [key, kind] of [['family', 'FAMILY'], ['company', 'COMPANY']]) {
                const want = input?.[key];
                if (want === undefined)
                    continue;
                if (!ok(want))
                    throw new Error('RECORD_SHARE_BOOLEAN');
                const s = sp[kind];
                if (!s)
                    throw new Error(`RECORD_NO_${kind}_SPACE`);
                const has = ids.includes(s.id);
                if (want === has)
                    continue;
                if (ctx.actorId !== 'SYSTEM' && s.role !== 'EDIT' && s.role !== 'MANAGE')
                    throw new Error(`Scope denied: EDIT required for ${s.id}`);
                ids = want ? [...ids, s.id] : ids.filter(x => x !== s.id);
            }
            if (!ids.length)
                throw new Error('RECORD_NEEDS_ONE_SPACE');
            if (ids.length === (r.spaceIds || []).length && ids.every(x => (r.spaceIds || []).includes(x)))
                return r;
            const data = this.history({ ...r.data }, { kind: 'SHARED', family: !!sp.FAMILY && ids.includes(sp.FAMILY.id), company: !!sp.COMPANY && ids.includes(sp.COMPANY.id) });
            return this.save(r, data, ids, ctx);
        }
    }
    NS.ctl = ctl;
    NS.isSensitive = isSensitive;
    NS.isItemSensitive = isItemSensitive;
    NS.RecordControlsService = RecordControlsService;
    NS.install = (core, options = {}) => {
        if (core.recordControls)
            throw new Error('Record controls already installed');
        if (!core?.entities?.save || !core?.access?.can || !core?.memberships?.listSpaces)
            throw new Error('Record controls require Core entities/access/memberships');
        const svc = new RecordControlsService(core, options.now);
        core.recordControls = svc;
        const reg = [];
        try {
            core.actions.register({ code: 'ACTION.CORE.RECORD.SENSITIVITY.SET', ownerApp: 'APP.KX.NEXUS', risk: 'SENSITIVE_WRITE', handler: (p, c) => svc.setSensitivity(p, c) });
            reg.push('ACTION.CORE.RECORD.SENSITIVITY.SET');
            core.actions.register({ code: 'ACTION.CORE.RECORD.SHARE', ownerApp: 'APP.KX.NEXUS', risk: 'SENSITIVE_WRITE', handler: (p, c) => svc.share(p, c) });
            reg.push('ACTION.CORE.RECORD.SHARE');
            // export runs under the owning hub's code so hub-level guards (verified session for sensitive hubs) apply to it too
            core.actions.register({ code: 'ACTION.CORE.RECORD.EXPORT', ownerApp: 'APP.KX.NEXUS', risk: 'READ', handler: async (p, c) => { if (core.identity?.isProtected?.(p?.ownerApp) && String(core?.workspaceProfile?.mode || '') !== 'DEMO') {
                    let s;
                    try {
                        s = await core.identity.validate();
                    }
                    catch (e) {
                        throw new Error(`AUTH_SESSION_REQUIRED_FOR_HUB ${p.ownerApp} (${String(e?.message || e)})`);
                    }
                    if (s !== c?.actorId)
                        throw new Error(`AUTH_SUBJECT_MISMATCH for ${p.ownerApp}`);
                } return svc.exportRecords(p, c); } });
            reg.push('ACTION.CORE.RECORD.EXPORT');
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, 'APP.KX.NEXUS');
            delete core.recordControls;
            throw e;
        }
        return Object.freeze({ contract: 'KX.CORE_RECORD_CONTROLS/1', actions: 3 });
    };
})(KXRecordControls || (KXRecordControls = {}));
