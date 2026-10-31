// N2.4f: „🐞 Chyby k opravě“ – a developer notebook: when the user finds a bug, it is captured quickly (text, screenshots, context,
// last program errors) and later copied as ONE task text for an AI (Claude) to fix the main program before the 100 % release.
// Records are personal core entities (revisions, trash); images are core files (as prompts). Off in a public release (setting dev.bugCapture).
var KXBugs;
(function () {
    const OWNER = 'APP.KX.NEXUS', TYPE = 'CORE.BUGNOTE', SCHEMA = 'KX.CORE.BUGNOTE/1';
    const SEV = ['MINOR', 'ANNOYING', 'BLOCKING'], STATUS = ['NEW', 'SENT', 'FIXED', 'REJECTED'];
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
    /* ring buffer of the last program errors (window error + unhandled promise rejection) – attached to a new bug note */
    const ERR = [];
    function pushErr(e) { ERR.push({ at: new Date().toISOString(), msg: String(e?.message || e || '').slice(0, 300), src: String(e?.source || e?.filename || '').slice(-120), line: e?.lineno || null }); while (ERR.length > 5)
        ERR.shift(); }
    class BugService {
        core;
        constructor(core) { this.core = core; }
        async personalSpace(actorId) { const sp = await this.core.propagate.spaces(actorId); const p = sp.find((s) => s.kind === 'PERSONAL'); if (!p)
            throw new Error('BUG_NO_PERSONAL_SPACE'); return p.id; }
        clean(input) {
            const wrong = str(input?.wrong, 4000);
            if (!wrong)
                throw new Error('BUG_WRONG_REQUIRED');
            const severity = input?.severity || 'ANNOYING';
            if (!SEV.includes(severity))
                throw new Error('BUG_SEVERITY_INVALID');
            const status = input?.status || 'NEW';
            if (!STATUS.includes(status))
                throw new Error('BUG_STATUS_INVALID');
            const c = input?.context && typeof input.context === 'object' ? input.context : {};
            const context = {};
            for (const k of ['hub', 'tab', 'record', 'view', 'step', 'url'])
                if (c[k] != null)
                    context[k] = String(c[k]).slice(0, 200);
            if (c.at)
                context.at = String(c.at).slice(0, 40);
            const errors = (Array.isArray(input?.errors) ? input.errors : []).slice(0, 5).map((e) => ({ at: String(e?.at || '').slice(0, 40), msg: String(e?.msg || '').slice(0, 300), src: String(e?.src || '').slice(0, 120), line: e?.line ?? null }));
            return { title: str(input?.title, 160) || wrong.split('\n')[0].slice(0, 80), wrong, expected: str(input?.expected, 4000), steps: str(input?.steps, 4000), severity, status, context, errors };
        }
        async save(input, ctx) {
            const d = this.clean(input);
            if (input?.id) {
                const old = await this.core.entities.get(String(input.id));
                if (!old || old.type !== TYPE)
                    throw new Error('BUG_NOT_FOUND');
                return this.core.entities.save({ id: old.id, type: TYPE, ownerApp: OWNER, schema: SCHEMA, spaceIds: old.spaceIds, expectedRevision: input.expectedRevision ?? old.revision, data: { ...old.data, ...d, fileIds: old.data.fileIds || [] } }, ctx);
            }
            return this.core.entities.save({ type: TYPE, ownerApp: OWNER, schema: SCHEMA, spaceIds: [await this.personalSpace(ctx.actorId)], data: { ...d, fileIds: [] } }, ctx);
        }
        async list(input, ctx) { const all = (await this.core.entities.list()).filter((r) => r.type === TYPE && !r.archivedAt); const st = input?.status; return all.filter((r) => !st || r.data.status === st).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); }
        async setStatus(input, ctx) {
            const r = await this.core.entities.get(String(input?.id || ''));
            if (!r || r.type !== TYPE)
                throw new Error('BUG_NOT_FOUND');
            const status = String(input?.status || '');
            if (!STATUS.includes(status))
                throw new Error('BUG_STATUS_INVALID');
            return this.core.entities.save({ id: r.id, type: TYPE, ownerApp: OWNER, schema: SCHEMA, spaceIds: r.spaceIds, expectedRevision: r.revision, data: { ...r.data, status } }, ctx);
        }
        async addImage(input, ctx) {
            const r = await this.core.entities.get(String(input?.id || ''));
            if (!r || r.type !== TYPE)
                throw new Error('BUG_NOT_FOUND');
            const blob = input?.blob;
            const mime = String(blob?.type || '').toLowerCase();
            if (!mime.startsWith('image/'))
                throw new Error('BUG_IMAGE_NOT_IMAGE');
            const f = await this.core.files.importBlob(blob, String(input?.name || `bug-${Date.now()}.${mime.split('/')[1] || 'png'}`).slice(0, 120), mime, OWNER, r.spaceIds, ctx, { tags: ['kx:bug-image'], description: r.data.title });
            return this.core.entities.save({ id: r.id, type: TYPE, ownerApp: OWNER, schema: SCHEMA, spaceIds: r.spaceIds, expectedRevision: r.revision, data: { ...r.data, fileIds: [...(r.data.fileIds || []), f.id] } }, ctx);
        }
        /* ONE text for an AI: intro with the rules of the project, then every chosen bug with all its context */
        async exportAi(input, ctx) {
            const ids = Array.isArray(input?.ids) && input.ids.length ? input.ids.map(String) : null;
            let rows = await this.list({}, ctx);
            rows = ids ? rows.filter((r) => ids.includes(r.id)) : rows.filter((r) => r.data.status === 'NEW');
            const step = String(input?.step || '');
            const L = [];
            L.push(`# ${TL('bugs.ai.title', 'Bugs to fix – KalinumX NEXUS')}${step ? ` (${step})` : ''}`, '', TL('bugs.ai.intro', 'Fix these bugs in the KalinumX NEXUS repository. Rules: fix the cause, not the symptom; every fix gets a test; manual and news (R73); hub consistency (R75); all runtime tests, integrity and the whole chain before publishing.'), '');
            rows.forEach((r, i) => {
                const d = r.data, c = d.context || {};
                L.push(`## ${i + 1}. ${d.title}  [${TL('bugs.sev.' + d.severity, d.severity)}]`, `- ID: ${r.id}`);
                if (c.hub || c.tab || c.record)
                    L.push(`- ${TL('bugs.ai.where', 'Where')}: ${[c.hub, c.tab, c.record].filter(Boolean).join(' · ')}`);
                if (c.view)
                    L.push(`- ${TL('bugs.ai.view', 'View')}: ${c.view}`);
                if (c.step || c.at)
                    L.push(`- ${TL('bugs.ai.version', 'Version / time')}: ${[c.step, c.at].filter(Boolean).join(' · ')}`);
                L.push(`- ${TL('bugs.ai.wrong', 'What is wrong')}: ${d.wrong}`);
                if (d.expected)
                    L.push(`- ${TL('bugs.ai.expected', 'Expected')}: ${d.expected}`);
                if (d.steps)
                    L.push(`- ${TL('bugs.ai.steps', 'Steps')}: ${d.steps}`);
                if ((d.errors || []).length)
                    L.push(`- ${TL('bugs.ai.errors', 'Program errors')}:`, ...d.errors.map((e) => `  - ${e.at} ${e.msg}${e.src ? ` (${e.src}${e.line ? ':' + e.line : ''})` : ''}`));
                if ((d.fileIds || []).length)
                    L.push(`- ${TL('bugs.ai.images', 'Screenshots')}: ${d.fileIds.length} (${TL('bugs.ai.imagesHint', 'attach them to the chat')})`);
                L.push('');
            });
            return { count: rows.length, ids: rows.map((r) => r.id), text: L.join('\n') };
        }
    }
    KXBugs = { OWNER, TYPE, SEV, STATUS, ERR, pushErr, BugService,
        install(core) {
            if (core.bugs)
                return core.bugs;
            const svc = new BugService(core);
            core.bugs = svc;
            for (const [code, risk, h] of [['ACTION.CORE.BUG.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.CORE.BUG.LIST', 'READ', (p, c) => svc.list(p, c)], ['ACTION.CORE.BUG.STATUS', 'SAFE_WRITE', (p, c) => svc.setStatus(p, c)], ['ACTION.CORE.BUG.ADD_IMAGE', 'SAFE_WRITE', (p, c) => svc.addImage(p, c)], ['ACTION.CORE.BUG.EXPORT_AI', 'READ', (p, c) => svc.exportAi(p, c)]])
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
            return svc;
        },
        /* the Shell calls this once – program errors are captured into the ring buffer */
        captureErrors(win) { if (!win || win.__kxBugErr)
            return; win.__kxBugErr = true; win.addEventListener('error', (e) => pushErr(e)); win.addEventListener('unhandledrejection', (e) => pushErr({ message: 'Unhandled: ' + String(e?.reason?.message || e?.reason || '') })); } };
})();
