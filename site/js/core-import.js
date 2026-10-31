// N2.5f (user 2026-10-25): import via AI EVERYWHERE – one importer for the whole NEXUS, independent of the source (clipboard, file,
// folder, drag & drop, camera, link – the UI gives text / files). Targets: automatically every hub built on the hub kit (its
// subjectFields + its own CREATE action → the same validation as manual entry), contacts, tasks, events; more can register.
// Flow: prompt from the fields (for Kaira or another AI) → answer (JSON / CSV / TSV from Excel / vCard) → PREVIEW (valid / errors
// with the reason / uncertain „?“ / duplicates) → APPLY only the approved rows via the hub's actions; failures go to K zatřídění.
// Sensitive fields (passwords, PIN, card numbers …) are never part of a prompt and never imported here (Trezor only, after PIN).
var KXImport;
(function () {
    const OWNER = 'APP.KX.NEXUS', ENVELOPE = 'KX.IMPORT/1';
    const SENSITIVE = /pass|heslo|pin\b|cvc|cvv|card.?num|rodne|birth.?number|secret|token/i;
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const TX = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    const KIND = { text: 'TEXT', enum: 'SELECT', date: 'DATE', number: 'NUMBER', int: 'NUMBER', bool: 'BOOL', boolean: 'BOOL' };
    /* answer parsing: JSON (also inside ``` fences, {items:[]}, envelope, single object), CSV / TSV with a header (+ optional key row) */
    function parseAnswer(text, fields) {
        const raw = String(text || '').trim();
        if (!raw)
            return { rows: [], format: 'EMPTY' };
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const js = fence ? fence[1].trim() : raw;
        if (/^[\[{]/.test(js)) {
            try {
                const v = JSON.parse(js);
                const arr = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [v];
                return { rows: arr.filter((x) => x && typeof x === 'object'), format: 'JSON' };
            }
            catch {
                return { rows: [], format: 'JSON_INVALID' };
            }
        }
        const lines = raw.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2)
            return { rows: [], format: 'UNKNOWN' };
        const delim = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
        const cells = (l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (q) {
                if (ch === '"' && l[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else if (ch === '"')
                    q = false;
                else
                    cur += ch;
            }
            else if (ch === '"')
                q = true;
            else if (ch === delim) {
                out.push(cur);
                cur = '';
            }
            else
                cur += ch;
        } out.push(cur); return out.map(x => x.trim()); };
        const byKey = new Map();
        for (const f of fields) {
            byKey.set(norm(f.key), f.key);
            byKey.set(norm(f.label), f.key);
        }
        let head = cells(lines[0]).map(h => byKey.get(norm(h)) || '');
        let start = 1;
        const second = cells(lines[1]);
        if (second.every(c => !c || byKey.has(norm(c))) && second.some(c => byKey.has(norm(c)))) {
            head = second.map(h => byKey.get(norm(h)) || '');
            start = 2;
        }
        const rows = lines.slice(start).map(l => { const c = cells(l); const o = {}; head.forEach((k, i) => { if (k && c[i] !== undefined && c[i] !== '')
            o[k] = c[i]; }); return o; }).filter(o => Object.keys(o).length);
        return { rows, format: delim === '\t' ? 'TSV' : 'CSV', unmapped: cells(lines[start - 1]).filter((h, i) => !head[i] && h) };
    }
    function install(core) {
        if (core.importer)
            return core.importer;
        const targets = new Map();
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const svc = { ENVELOPE, parseAnswer,
            registerTarget(code, t) { if (!/^[A-Z0-9_.]+$/.test(code) || typeof t?.fields !== 'function' || typeof t?.save !== 'function')
                throw new Error('IMPORT_TARGET_INVALID'); if (targets.has(code))
                throw new Error('IMPORT_TARGET_EXISTS'); targets.set(code, { code, ...t }); },
            /* hub-kit hubs appear automatically (they may install after the importer) */
            syncKit() {
                for (const d of (globalThis.KXHubKit?.domains || [])) {
                    const code = 'HUB.' + d.type;
                    if (targets.has(code) || !d.createAction)
                        continue;
                    /* the NAME of a record = the subject field „name“ (or the first required text field) – subjectNameKey is only the projection key */ const sf = d.subjectFields || {};
                    const nameKey = sf.name ? 'name' : (Object.entries(sf).find(([_k, f]) => f.required && (f.kind || 'text') === 'text') || [null])[0];
                    targets.set(code, { code, label: d.label || d.type, ownerApp: d.owner, recordType: d.type, nameKey,
                        fields: () => Object.entries(d.subjectFields || {}).map(([key, f]) => ({ key, label: f.label || key, type: KIND[f.kind] || 'TEXT', required: !!f.required, options: Array.isArray(f.options) ? f.options : (f.options ? Object.keys(f.options) : undefined), max: f.max, pattern: f.pattern, unit: f.unit })),
                        save: (item, ctx, o) => core.actions.invoke(d.createAction, { spaceIds: [o.spaceId], ...item }, { ...ctx, appCode: d.owner, permissions: [d.permission].filter(Boolean), confirmed: true }) });
                }
            },
            async targets(_p, ctx) { svc.syncKit(); const out = []; for (const t of targets.values()) {
                if (t.ownerApp) {
                    try {
                        if (!await core.ownerReadGate.allows(t.ownerApp, ctx.actorId))
                            continue;
                    }
                    catch {
                        continue;
                    }
                }
                out.push({ code: t.code, label: t.label, ownerApp: t.ownerApp || OWNER, fields: t.fields().filter((f) => !SENSITIVE.test(f.key)).length });
            } return out.sort((a, b) => String(a.label).localeCompare(String(b.label), 'cs')); },
            target(code, actor) { svc.syncKit(); const t = targets.get(String(code || '')); if (!t)
                throw new Error('IMPORT_TARGET_UNKNOWN'); return t; },
            /* the prompt for Kaira / another AI – built from the fields; sensitive fields left out */
            async prompt(p, ctx) {
                const t = svc.target(p?.target);
                if (t.ownerApp && !await core.ownerReadGate.allows(t.ownerApp, ctx.actorId))
                    throw new Error('IMPORT_NOT_ALLOWED');
                const fs = t.fields().filter((f) => !SENSITIVE.test(f.key));
                const line = (f) => `- ${f.key} („${f.label}“): ${TX('imp.type.' + f.type)}${f.required ? ' – ' + TX('imp.required') : ''}${f.options ? ' – ' + TX('imp.options') + ': ' + f.options.join(', ') : ''}${f.max ? ' – max ' + f.max : ''}${f.unit ? ' – ' + f.unit : ''}`;
                const ex = {};
                for (const f of fs.slice(0, 4))
                    ex[f.key] = f.options ? f.options[0] : f.type === 'DATE' ? '2026-10-25' : f.type === 'NUMBER' ? 12.5 : '…';
                const text = [TX('imp.p.intro', { label: t.label }), TX('imp.p.fields'), ...fs.map(line), TX('imp.p.rules'), TX('imp.p.format', { env: ENVELOPE }), '```json', JSON.stringify({ kx: ENVELOPE, target: t.code, items: [ex] }, null, 1), '```', TX('imp.p.csv', { keys: fs.map((f) => f.key).join(';') }), TX('imp.p.privacy')].join('\n');
                return { target: t.code, label: t.label, text, fields: fs };
            },
            /* preview – nothing is written */
            async preview(p, ctx) {
                const t = svc.target(p?.target);
                if (t.ownerApp && !await core.ownerReadGate.allows(t.ownerApp, ctx.actorId))
                    throw new Error('IMPORT_NOT_ALLOWED');
                const fs = t.fields().filter((f) => !SENSITIVE.test(f.key));
                const byKey = new Map(fs.map((f) => [f.key, f]));
                const parsed = Array.isArray(p?.rows) ? { rows: p.rows, format: 'ROWS' } : t.parse ? { rows: await t.parse(String(p?.text || '')), format: 'CUSTOM' } : parseAnswer(String(p?.text || ''), fs);
                const existing = new Set();
                if (t.recordType) {
                    for (const r of await core.entities.list()) {
                        if (r.type !== t.recordType || r.archivedAt)
                            continue;
                        if (await readable(r, ctx.actorId))
                            existing.add(norm(r.data?.[t.nameKey || 'name']));
                    }
                }
                const seen = new Set();
                const rows = parsed.rows.map((src, i) => {
                    const item = {}, errors = [], uncertain = [], ignored = [];
                    /* N2.5j: a target's own parser may give a row-level reason (_error) and the full record (_full) – kept, never shown as fields */ if (src && src._error)
                        errors.push(String(src._error).slice(0, 200));
                    for (const [k, v0] of Object.entries(src)) {
                        if (k === '_error' || k === '_full')
                            continue;
                        if (SENSITIVE.test(k)) {
                            ignored.push(k);
                            continue;
                        }
                        const f = byKey.get(k);
                        if (!f) {
                            if (!['kx', 'target'].includes(k))
                                ignored.push(k);
                            continue;
                        }
                        let v = v0;
                        if (v === null || v === '' || v === undefined)
                            continue;
                        if (typeof v === 'string' && /\?\s*$/.test(v)) {
                            uncertain.push(k);
                            v = v.replace(/\?\s*$/, '').trim();
                            if (!v)
                                continue;
                        }
                        if (f.type === 'NUMBER') {
                            const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
                            if (!Number.isFinite(n)) {
                                errors.push(TX('imp.err.number', { f: f.label }));
                                continue;
                            }
                            v = n;
                        }
                        else if (f.type === 'DATE') {
                            const s = String(v).trim();
                            const m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
                            const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s; /* exact calendar date – 2019-02-30 must NOT slip through as 2. 3. */
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso + 'T00:00:00Z')) || new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso) {
                                errors.push(TX('imp.err.date', { f: f.label }));
                                continue;
                            }
                            v = iso;
                        }
                        else if (f.type === 'BOOL') {
                            v = /^(1|true|ano|yes|ok)$/i.test(String(v));
                        }
                        else {
                            v = String(v).trim();
                            if (f.options && !f.options.includes(v)) {
                                const hit = f.options.find((o) => norm(o) === norm(v));
                                if (hit)
                                    v = hit;
                                else {
                                    errors.push(TX('imp.err.option', { f: f.label, v, o: f.options.join(', ') }));
                                    continue;
                                }
                            }
                            if (f.max && v.length > f.max) {
                                errors.push(TX('imp.err.max', { f: f.label, n: f.max }));
                                continue;
                            }
                            if (f.pattern && !new RegExp(f.pattern).test(v)) {
                                errors.push(TX('imp.err.pattern', { f: f.label }));
                                continue;
                            }
                        }
                        item[k] = v;
                    }
                    if (!(src && src._error))
                        for (const f of fs)
                            if (f.required && (item[f.key] === undefined || item[f.key] === ''))
                                errors.push(TX('imp.err.required', { f: f.label }));
                    if (src && typeof src._full === 'string')
                        Object.defineProperty(item, '_full', { value: src._full, enumerable: false });
                    const nk = t.nameKey ? norm(item[t.nameKey]) : '';
                    const duplicate = nk ? (existing.has(nk) ? 'EXISTING' : seen.has(nk) ? 'IN_BATCH' : null) : null;
                    if (nk)
                        seen.add(nk);
                    return { n: i + 1, item, errors, uncertain, ignored, duplicate, ok: !errors.length };
                });
                return { target: t.code, label: t.label, format: parsed.format, unmapped: parsed.unmapped || [], total: rows.length, valid: rows.filter((r) => r.ok).length, rows };
            },
            /* apply only approved rows through the hub's own actions; failures (incl. the hub's own validation) → K zatřídění */
            async apply(p, ctx) {
                const pv = await svc.preview(p, ctx);
                const t = svc.target(p?.target);
                const take = Array.isArray(p?.include) ? new Set(p.include.map(Number)) : null;
                const spaceId = String(p?.spaceId || ((await core.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id || '');
                const out = { created: [], failed: [], skipped: [] };
                for (const r of pv.rows) {
                    if (take && !take.has(r.n)) {
                        out.skipped.push(r.n);
                        continue;
                    }
                    if (!r.ok || (r.duplicate && p?.allowDuplicates !== true)) {
                        out.skipped.push(r.n);
                        continue;
                    }
                    try {
                        const rec = await t.save(r.item, ctx, { spaceId });
                        out.created.push({ n: r.n, id: rec?.id || null });
                    }
                    catch (e) {
                        const reason = String(e?.message || e);
                        out.failed.push({ n: r.n, reason });
                        try {
                            await core.actions.invoke('ACTION.CORE.INBOX.ADD', { source: 'IMPORT', reason: 'IMPORT_ERROR', title: TX('imp.inbox', { label: t.label, n: r.n }), detail: { target: t.code, row: r.item, reason }, key: `IMPORT:${t.code}:${JSON.stringify(r.item).slice(0, 120)}` }, ctx);
                        }
                        catch { }
                    }
                }
                return { target: t.code, ...out };
            } };
        /* core targets: contacts (also vCard), tasks, events */
        svc.registerTarget('CORE.CONTACT', { label: TX('imp.t.contacts'), recordType: 'CORE.CONTACT', nameKey: 'name',
            fields: () => [{ key: 'firstName', label: TX('ct.f.firstName'), type: 'TEXT' }, { key: 'lastName', label: TX('ct.f.lastName'), type: 'TEXT' }, { key: 'company', label: TX('ct.f.company'), type: 'TEXT' }, { key: 'phone', label: TX('ct.f.phones'), type: 'TEXT' }, { key: 'email', label: TX('ct.f.emails'), type: 'TEXT' }, { key: 'ico', label: TX('ct.f.ico'), type: 'TEXT' }, { key: 'note', label: TX('imp.note'), type: 'TEXT' }],
            parse: async (text) => /BEGIN:VCARD/i.test(text) && core.contacts ? core.contacts.parseVcards(text).map((c) => { const d = core.contacts.normalize(c); return { firstName: d.firstName, lastName: d.lastName, company: d.company, phone: d.phones[0]?.value, email: d.emails[0]?.value, ico: d.ico }; }) : parseAnswer(text, svc.target('CORE.CONTACT').fields()).rows,
            save: (it, ctx, o) => core.actions.invoke('ACTION.CORE.CONTACT.SAVE', { spaceId: o.spaceId, data: { kind: it.company && !it.firstName && !it.lastName ? 'COMPANY' : 'PERSON', firstName: it.firstName, lastName: it.lastName, company: it.company, ico: it.ico, phones: it.phone ? [it.phone] : [], emails: it.email ? [it.email] : [], notes: it.note ? [{ text: it.note }] : [] }, allowInvalidIco: true }, ctx) });
        svc.registerTarget('CORE.TASK', { label: TX('imp.t.tasks'), fields: () => [{ key: 'title', label: TX('imp.f.title'), type: 'TEXT', required: true, max: 200 }, { key: 'due', label: TX('imp.f.due'), type: 'DATE' }, { key: 'note', label: TX('imp.note'), type: 'TEXT' }],
            save: (it, ctx, o) => core.actions.invoke('ACTION.CORE.TASK.SAVE', { title: it.title, ownerApp: 'APP.NEXUS', spaceIds: [o.spaceId], dueAt: it.due ? new Date(it.due + 'T09:00:00').toISOString() : undefined, assigneeIds: [ctx.actorId], status: 'TODO', description: it.note }, { ...ctx, permissions: ['CORE.TASK.EDIT'], confirmed: true }) });
        svc.registerTarget('CORE.EVENT', { label: TX('imp.t.events'), fields: () => [{ key: 'title', label: TX('imp.f.title'), type: 'TEXT', required: true, max: 200 }, { key: 'date', label: TX('imp.f.date'), type: 'DATE', required: true }, { key: 'time', label: TX('imp.f.time'), type: 'TEXT', pattern: '^\\d{1,2}:\\d{2}$' }, { key: 'place', label: TX('imp.f.place'), type: 'TEXT' }],
            save: (it, ctx, o) => core.actions.invoke('ACTION.CORE.CALENDAR.SAVE', { title: it.title, ownerApp: 'APP.NEXUS', spaceIds: [o.spaceId], startsAt: new Date(`${it.date}T${(it.time || '08:00').padStart(5, '0')}:00`).toISOString(), allDay: !it.time, attendeeIds: [], status: 'CONFIRMED', location: it.place }, { ...ctx, permissions: ['CORE.CALENDAR.EDIT'], confirmed: true }) });
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.IMPORT.TARGETS', 'READ', (p, c) => svc.targets(p, c));
        reg('ACTION.CORE.IMPORT.PROMPT', 'READ', (p, c) => svc.prompt(p, c));
        reg('ACTION.CORE.IMPORT.PREVIEW', 'READ', (p, c) => svc.preview(p, c));
        reg('ACTION.CORE.IMPORT.APPLY', 'SAFE_WRITE', (p, c) => svc.apply(p, c));
        core.importer = svc;
        return svc;
    }
    KXImport = { install, parseAnswer };
    globalThis.KXImport = KXImport;
})();
