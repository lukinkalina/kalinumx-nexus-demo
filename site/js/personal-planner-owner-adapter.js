// D093 Stage140: first REAL data provider for Personal Home owner projections.
// Source of truth = canonical Core Planner records (tasks / calendarEvents / alarms)
// that are physically stored in the active workspace CoreRepository and carry the
// owner hub's ownerApp. Every record is filtered by the SUBJECT's own READ access
// (ResourceAccessService) - the adapter never widens visibility.
//
// What this is NOT:
//  - not a hub-native domain database (none of the nine owner hubs has one yet);
//  - not a production verification (status stays REGISTERED_UNVERIFIED);
//  - no data is fabricated: a subject with zero readable owner records gets an
//    error (card stays UNAVAILABLE), never a synthetic "all good" card;
//  - sensitive descriptors (HEALTH / FINANCE / SUBSCRIPTIONS) are never registered:
//    persistence of sensitive projections is blocked by policy (fail closed).
var KXPersonalPlannerOwner;
(function (KXPersonalPlannerOwner) {
    const PROVIDER_KIND = 'CORE_PLANNER_DERIVED';
    const CONTRACT = 'KX.PERSONAL_PLANNER_OWNER_ADAPTER/1';
    // projectionCode -> [countField,nextField]. Field names come from the existing
    // personal-projection-contract descriptors; nothing outside allowedFields is emitted.
    const FIELD_MAP = {
        'PERSONAL.HOME.STATUS': ['alertsCount', 'nextMaintenanceAt'],
        'PERSONAL.VEHICLES.STATUS': ['alertsCount', 'nextServiceAt'],
        'PERSONAL.SCHOOL.UPCOMING': ['upcomingCount', 'nextEventAt'],
        'PERSONAL.PETS.CARE': ['dueCount', 'nextDueAt'],
        'PERSONAL.SHIPPING.ACTIVE': ['activeCount', 'nextEta'],
        'PERSONAL.FOOD.PLAN': ['shoppingCount', 'nextPlanAt']
    };
    const MS_DAY = 86400000;
    // Synchronous SHA-256 (FIPS 180-4) so that sourceRevision is deterministic in every host.
    function sha256Hex(text) {
        const input = new TextEncoder().encode(text);
        const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
        const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const len = Math.ceil((input.length + 9) / 64) * 64, bytes = new Uint8Array(len);
        bytes.set(input);
        bytes[input.length] = 0x80;
        const view = new DataView(bytes.buffer);
        view.setUint32(len - 8, Math.floor(input.length * 8 / 0x100000000), false);
        view.setUint32(len - 4, (input.length * 8) >>> 0, false);
        const w = new Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
        for (let o = 0; o < len; o += 64) {
            for (let i = 0; i < 16; i++)
                w[i] = view.getUint32(o + i * 4, false);
            for (let i = 16; i < 64; i++) {
                const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, b, c, d, e, f, g, h] = H;
            for (let i = 0; i < 64; i++) {
                const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) >>> 0, S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
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
        return H.map(x => x.toString(16).padStart(8, '0')).join('');
    }
    const iso = (ms) => new Date(ms).toISOString();
    const parse = (x) => { if (typeof x !== 'string' || !x)
        return NaN; return Date.parse(x); };
    // Pure derivation over records already filtered to (ownerApp + subject READ).
    // Exposed for deterministic QA; the runtime path is createAdapter().
    function derive(input) {
        const map = FIELD_MAP[input.projectionCode];
        if (!map)
            throw new Error('Projection is not planner-derivable');
        const [countField, nextField] = map, nowMs = input.nowMs, horizon = nowMs + input.horizonDays * MS_DAY;
        const all = [...input.tasks.map(x => ['TASK', x]), ...input.events.map(x => ['CALENDAR_EVENT', x]), ...input.alarms.map(x => ['ALARM', x])];
        if (!all.length)
            throw new Error('OWNER_NO_SOURCE_RECORDS: subject has no readable planner records for this owner');
        let pending = 0, overdue = 0, next = Infinity, updated = -Infinity;
        for (const [kind, row] of all) {
            const u = parse(row.updatedAt);
            if (Number.isFinite(u))
                updated = Math.max(updated, u);
            if (row.archivedAt)
                continue;
            let at = NaN;
            if (kind === 'TASK') {
                if (row.status === 'DONE' || row.status === 'CANCELLED')
                    continue;
                at = parse(row.dueAt);
                if (!Number.isFinite(at))
                    continue;
            }
            else if (kind === 'CALENDAR_EVENT') {
                if (row.status === 'CANCELLED')
                    continue;
                at = parse(row.startsAt);
                const end = parse(row.endsAt || row.startsAt);
                if (!Number.isFinite(at) || (Number.isFinite(end) ? end : at) < nowMs)
                    continue;
            }
            else {
                if (row.status !== 'SCHEDULED' && row.status !== 'SNOOZED')
                    continue;
                at = parse(row.status === 'SNOOZED' && row.snoozeUntil ? row.snoozeUntil : row.triggerAt);
                if (!Number.isFinite(at))
                    continue;
            }
            if (at > horizon)
                continue;
            pending++;
            if (at < nowMs && kind === 'TASK')
                overdue++;
            if (at >= nowMs && at < next)
                next = at;
        }
        // Deterministic owner revision: every readable record identity + revision + state.
        const identity = all.map(([kind, row]) => [kind, String(row.id), Number(row.revision) || 0, String(row.status || ''), row.archivedAt ? 1 : 0]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const sourceRevision = 'CORE.PLANNER/1:' + sha256Hex(JSON.stringify([input.projectionCode, identity]));
        const statusLabel = overdue > 0 ? `Po termínu: ${overdue}` : pending > 0 ? `Naplánováno: ${pending}` : 'Nic v horizontu';
        const payload = { [countField]: pending, [nextField]: Number.isFinite(next) ? iso(next) : null, statusLabel, sourceUpdatedAt: Number.isFinite(updated) ? iso(updated) : null };
        return { payload, sourceRevision, records: all.length, pending, overdue };
    }
    function createAdapter(core, projectionCode, ownerApp, options = {}) {
        if (!core?.tasks?.list || !core?.calendar?.list || !core?.alarms?.list || !core?.access?.can)
            throw new Error('Core Planner services required');
        if (!FIELD_MAP[projectionCode])
            throw new Error('Projection is not planner-derivable');
        const horizonDays = Number(options.horizonDays ?? 30);
        if (!Number.isFinite(horizonDays) || horizonDays < 1 || horizonDays > 366)
            throw new Error('Invalid planner horizon');
        const clock = typeof options.now === 'function' ? options.now : () => Date.now();
        const adapter = async (request) => {
            if (request?.projectionCode !== projectionCode || request?.ownerApp !== ownerApp)
                throw new Error('Planner adapter identity mismatch');
            const subject = request.subjectId;
            const readable = async (kind, rows) => { const out = []; for (const row of rows) {
                if (row?.ownerApp !== ownerApp)
                    continue;
                if (await core.access.can({ kind, id: row.id, ownerApp: row.ownerApp, spaceIds: row.spaceIds || [] }, subject, 'READ'))
                    out.push(row);
            } return out; };
            const [tasks, events, alarms] = await Promise.all([core.tasks.list(), core.calendar.list(), core.alarms.list()]);
            const nowMs = clock();
            const d = derive({ projectionCode, tasks: await readable('TASK', tasks), events: await readable('CALENDAR_EVENT', events), alarms: await readable('ALARM', alarms), nowMs, horizonDays });
            return { projectionCode, ownerApp, subjectId: subject, sourceRevision: d.sourceRevision, generatedAt: nowMs, payload: d.payload };
        };
        adapter.kxProviderKind = PROVIDER_KIND;
        return adapter;
    }
    // Registers planner providers on an EXISTING workspace-scoped Personal Home runtime.
    // Returns an honest per-descriptor report; sensitive descriptors stay unregistered.
    function install(personal, core, options = {}) {
        if (!personal?.registerOwnerAdapter || !personal?.descriptors)
            throw new Error('Personal Home runtime required');
        const report = [];
        for (const d of personal.descriptors()) {
            if ((d.sensitiveFields || []).length) {
                report.push({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, result: 'BLOCKED_SENSITIVE_POLICY' });
                continue;
            }
            if (!FIELD_MAP[d.projectionCode]) {
                report.push({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, result: 'NOT_PLANNER_DERIVABLE' });
                continue;
            }
            // Stage143: a hub-native domain provider (registered earlier) takes precedence; it
            // already merges the owner's planner items, so the planner provider is skipped.
            const existing = typeof personal.ownerSourceCoverage === 'function' ? personal.ownerSourceCoverage().find((c) => c.ownerApp === d.ownerApp) : null;
            if (existing?.providerRegistered) {
                report.push({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, result: 'SKIPPED_OWNER_HAS_PROVIDER', providerKind: existing.providerKind });
                continue;
            }
            const [c, n] = FIELD_MAP[d.projectionCode];
            if (!d.allowedFields.includes(c) || !d.allowedFields.includes(n) || !d.allowedFields.includes('statusLabel') || !d.allowedFields.includes('sourceUpdatedAt')) {
                report.push({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, result: 'DESCRIPTOR_FIELD_MISMATCH' });
                continue;
            }
            try {
                personal.registerOwnerAdapter(d.ownerApp, createAdapter(core, d.projectionCode, d.ownerApp, options));
                report.push({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, result: 'REGISTERED', providerKind: PROVIDER_KIND });
            }
            catch (error) {
                report.push({ projectionCode: d.projectionCode, ownerApp: d.ownerApp, result: 'REGISTRATION_FAILED', error: String(error?.message || error) });
            }
        }
        return Object.freeze({ contract: CONTRACT, providerKind: PROVIDER_KIND, productionVerified: false, report });
    }
    KXPersonalPlannerOwner.PROVIDER_KIND = PROVIDER_KIND;
    KXPersonalPlannerOwner.CONTRACT = CONTRACT;
    KXPersonalPlannerOwner.FIELD_MAP = FIELD_MAP;
    KXPersonalPlannerOwner.sha256Hex = sha256Hex;
    KXPersonalPlannerOwner.derive = derive;
    KXPersonalPlannerOwner.createAdapter = createAdapter;
    KXPersonalPlannerOwner.install = install;
})(KXPersonalPlannerOwner || (KXPersonalPlannerOwner = {}));
