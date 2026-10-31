// N2.5w (user): IMPORT OF A DATA PACKAGE – all personal / family / company data at once (KX.DATA_PACKAGE/1, one JSON file).
// Sections run through the EXISTING imports only (contacts vCard, calendar .ics, table import into hubs, Finance movements) – nothing writes around them.
// Guard: sensitive data (birth numbers, card numbers – Luhn) refused; preview first (dry run of every section); apply = restore point first, then sections in order.
var KXDataPack;
(function () {
    const KINDS = ['VCARD', 'ICS', 'TABLE', 'FINANCE'];
    const SPACE_KINDS = ['FAMILY', 'PERSONAL', 'COMPANY', 'SHARED'];
    const MAX_TEXT = 2 * 1024 * 1024;
    const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) {
        let n = +d[i];
        if (alt) {
            n *= 2;
            if (n > 9)
                n -= 9;
        }
        s += n;
        alt = !alt;
    } return s % 10 === 0; };
    /* sensitive data finder – never import birth numbers (rodné číslo) or payment card numbers; passwords / PINs by key words */
    function sensitive(text) {
        const out = [];
        const t = String(text || '');
        if (/\b\d{2}[0156]\d[0-3]\d\s?\/\s?\d{3,4}\b/.test(t))
            out.push('BIRTH_NUMBER');
        for (const m of t.match(/\b(?:\d[ -]?){13,19}\b/g) || []) {
            const d = m.replace(/\D/g, '');
            if (d.length >= 13 && d.length <= 19 && luhn(d) && !/^0+$/.test(d)) {
                out.push('CARD_NUMBER');
                break;
            }
        }
        if (/\b(heslo|password|passwd|pin)\s*[:=]/i.test(t))
            out.push('SECRET');
        return [...new Set(out)];
    }
    function validate(pkg) {
        if (!pkg || pkg.schema !== 'KX.DATA_PACKAGE/1')
            throw new Error('DATAPACK_SCHEMA');
        if (!Array.isArray(pkg.sections) || !pkg.sections.length)
            throw new Error('DATAPACK_EMPTY');
        if (pkg.sections.length > 50)
            throw new Error('DATAPACK_TOO_MANY_SECTIONS');
        return pkg.sections.map((s, i) => {
            const kind = String(s?.kind || '');
            if (!KINDS.includes(kind))
                return { i, kind, error: 'DATAPACK_KIND' };
            const text = String(s.text ?? s.csv ?? '');
            if (!text.trim())
                return { i, kind, error: 'DATAPACK_SECTION_EMPTY' };
            if (text.length > MAX_TEXT)
                return { i, kind, error: 'DATAPACK_SECTION_TOO_BIG' };
            const space = String(s.space || 'FAMILY').toUpperCase();
            if (!SPACE_KINDS.includes(space))
                return { i, kind, error: 'DATAPACK_SPACE' };
            if (kind === 'TABLE' && !String(s.target || '').trim())
                return { i, kind, error: 'DATAPACK_TARGET' };
            const sens = sensitive(text);
            if (sens.length)
                return { i, kind, error: 'DATAPACK_SENSITIVE:' + sens.join(',') };
            return { i, kind, title: String(s.title || kind).slice(0, 120), text, space, area: s.area ? String(s.area) : undefined, target: s.target ? String(s.target) : undefined };
        });
    }
    function install(core) {
        if (core.datapack)
            return core.datapack;
        /* the user's spaces by kind – via memberships (always in the core), editable ones only */ const spaceId = async (u, kind) => { const all = []; for (const sp of await core.memberships.listSpaces()) {
            if (sp.archivedAt)
                continue;
            const r = await core.memberships.roleFor(sp.id, u).catch(() => null);
            if (r && r !== 'READ')
                all.push(sp);
        } const s = all.find((x) => x.kind === kind) || all.find((x) => x.kind === 'PERSONAL'); if (!s)
            throw new Error('DATAPACK_NO_SPACE'); return s.id; };
        async function run(sec, ctx, dry) {
            const u = ctx.actorId;
            const sp = await spaceId(u, sec.space);
            const C = { ...ctx, permissions: [...(ctx.permissions || []), 'CORE.CALENDAR.EDIT', 'CORE.ALARM.EDIT', 'CORE.CONTACT.EDIT', 'CORE.ENTITY.CREATE'] };
            if (sec.kind === 'VCARD') {
                const r = await core.actions.invoke('ACTION.CORE.CONTACT.IMPORT_VCARD', dry ? { text: sec.text, spaceId: sp } : { text: sec.text, spaceId: sp, dryRun: false }, C);
                return { created: (r.created || []).length, duplicates: (r.duplicates || []).length, errors: (r.errors || []).length, errorDetail: (r.errors || []).slice(0, 3) };
            }
            if (sec.kind === 'ICS') {
                const r = await core.actions.invoke('ACTION.CORE.CALENDAR.IMPORT_ICS', { text: sec.text, spaceIds: [sp], ownerApp: sec.area || 'APP.NEXUS', dryRun: dry }, C);
                return { created: r.created.length, duplicates: r.duplicates.length, errors: r.errors.length };
            }
            if (sec.kind === 'TABLE') {
                if (dry) {
                    const r = await core.actions.invoke('ACTION.CORE.IMPORT.PREVIEW', { target: sec.target, text: sec.text }, C);
                    const rows = r.rows || [];
                    return { created: rows.filter((x) => !x.error).length, errors: rows.filter((x) => x.error).length };
                }
                const r = await core.actions.invoke('ACTION.CORE.IMPORT.APPLY', { target: sec.target, text: sec.text, spaceId: sp }, C);
                return { created: (r.created || []).length, errors: (r.failed || []).length, skipped: (r.skipped || []).length };
            }
            if (sec.kind === 'FINANCE') {
                if (dry) {
                    const r = await core.actions.invoke('ACTION.FINANCE.IMPORT.PREVIEW', { text: sec.text, spaceId: sp }, C);
                    return { created: r.ready, errors: (r.errors || []).length };
                }
                const r = await core.actions.invoke('ACTION.FINANCE.IMPORT.APPLY', { text: sec.text, spaceId: sp }, C);
                return { created: r.saved ?? r.created ?? 0 };
            }
            throw new Error('DATAPACK_KIND');
        }
        const svc = { validate, sensitive,
            async preview(p, ctx) { const secs = validate(p?.package); const out = []; for (const s of secs) {
                if (s.error) {
                    out.push({ i: s.i, kind: s.kind, title: s.title || s.kind, error: s.error });
                    continue;
                }
                try {
                    out.push({ i: s.i, kind: s.kind, title: s.title, space: s.space, ...(await run(s, ctx, true)) });
                }
                catch (e) {
                    out.push({ i: s.i, kind: s.kind, title: s.title, error: String(e?.message || e) });
                }
            } return { sections: out }; },
            async apply(p, ctx) {
                if (ctx?.confirmed !== true)
                    throw new Error('DATAPACK_CONFIRM_REQUIRED');
                const secs = validate(p?.package);
                const skip = new Set((Array.isArray(p?.skip) ? p.skip : []).map(Number));
                /* restore point FIRST – everything can be returned */ let snapshot = null;
                try {
                    snapshot = await core.actions.invoke('ACTION.CORE.RECOVERY.SNAPSHOT.CREATE', { includeAudit: false, includeFileBlobs: false, reason: 'DATAPACK_IMPORT' }, { ...ctx, permissions: [...(ctx.permissions || []), 'CORE.RECOVERY.CREATE'] });
                }
                catch (e) {
                    if (p?.withoutSnapshot !== true)
                        throw new Error('DATAPACK_SNAPSHOT_FAILED:' + String(e?.message || e));
                }
                const out = [];
                for (const s of secs) {
                    if (skip.has(s.i)) {
                        out.push({ i: s.i, kind: s.kind, title: s.title, skipped: true });
                        continue;
                    }
                    if (s.error) {
                        out.push({ i: s.i, kind: s.kind, error: s.error });
                        continue;
                    }
                    try {
                        out.push({ i: s.i, kind: s.kind, title: s.title, ...(await run(s, ctx, false)) });
                    }
                    catch (e) {
                        out.push({ i: s.i, kind: s.kind, title: s.title, error: String(e?.message || e) });
                    }
                }
                return { snapshotId: snapshot?.id || null, sections: out };
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: 'APP.NEXUS', risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.DATAPACK.PREVIEW', 'READ', (p, c) => svc.preview(p, c));
        reg('ACTION.CORE.DATAPACK.APPLY', 'SAFE_WRITE', (p, c) => svc.apply(p, c));
        core.datapack = svc;
        return svc;
    }
    KXDataPack = { validate, sensitive, install };
    globalThis.KXDataPack = KXDataPack;
})();
