// N2.1o (R48): Diktafon + přehrávač nahrávek (KX.CORE_RECORDER/1).
// A recording is an ordinary Core FILE (Průzkumník souborů, Core trash with restore, ACL, revisions, audit) tagged
// kx:recording + kx:duration-ms:<n>. Capture happens in the UI (MediaRecorder); Core only validates and stores.
var KXRecorder;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_RECORDER/1', TAG = 'kx:recording', DUR = 'kx:duration-ms:', MAX_BYTES = 200 * 1024 * 1024, MAX_MS = 24 * 3600000;
    const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
    const durationOf = (f) => { const t = (f?.tags || []).find((x) => String(x).startsWith(DUR)); const n = t ? Number(String(t).slice(DUR.length)) : NaN; return Number.isFinite(n) ? n : null; };
    const fmtDuration = (ms) => { if (!Number.isFinite(ms))
        return '–'; const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };
    class RecorderService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        async personalSpace(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('RECORDER_NO_PERSONAL_SPACE'); return s.id; }
        isRecording(f) { return !!f && Array.isArray(f.tags) && f.tags.includes(TAG); }
        async readable(f, actorId) { return await this.core.access.can({ kind: 'FILE', id: f.id, ownerApp: f.ownerApp, spaceIds: f.spaceIds || [] }, actorId, 'READ') === true; }
        async own(id, actorId) {
            if (typeof id !== 'string' || !id)
                throw new Error('RECORDER_ID_REQUIRED');
            const f = await this.core.files.get(id);
            if (!f || !this.isRecording(f) || f.trashedAt)
                throw new Error('RECORDER_NOT_FOUND');
            if (!await this.readable(f, actorId))
                throw new Error('Scope denied: READ required');
            return f;
        }
        defaultTitle() { const d = new Date(this.now()); const p = (n) => String(n).padStart(2, '0'); return `Nahrávka ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
        async save(input, ctx) {
            const blob = input?.blob;
            if (!blob || typeof blob.size !== 'number' || typeof blob.arrayBuffer !== 'function')
                throw new Error('RECORDER_BLOB_REQUIRED');
            const mime0 = String(input?.mime || blob.type || '').split(';')[0].trim().toLowerCase();
            /* N2.6b+ screen recording: video only when explicitly marked SCREEN (everything else keeps the audio-only rule below) */
            if (input?.kind === 'SCREEN') {
                if (!/^video\/(webm|mp4)$/.test(mime0))
                    throw new Error('RECORDER_SCREEN_MIME');
                if (blob.size <= 0)
                    throw new Error('RECORDER_EMPTY');
                if (blob.size > MAX_BYTES)
                    throw new Error('RECORDER_TOO_LARGE');
                const ms0 = Number(input?.durationMs);
                if (!Number.isInteger(ms0) || ms0 < 0 || ms0 > MAX_MS)
                    throw new Error('RECORDER_DURATION_INVALID');
                const title0 = (typeof input?.title === 'string' && input.title.trim() ? input.title.trim() : this.defaultTitle()).slice(0, 160); /* the UI passes a translated title */
                const space0 = input?.spaceId || await this.personalSpace(ctx.actorId);
                return this.core.files.importBlob(blob, `${title0}.${mime0 === 'video/mp4' ? 'mp4' : 'webm'}`, mime0, OWNER, [space0], ctx, { tags: [TAG, DUR + ms0, 'kx:screen'], description: '' });
            }
            const mime = String(input?.mime || blob.type || '').split(';')[0].trim().toLowerCase();
            if (!mime.startsWith('audio/'))
                throw new Error('RECORDER_MIME_NOT_AUDIO');
            if (blob.size <= 0)
                throw new Error('RECORDER_EMPTY');
            if (blob.size > MAX_BYTES)
                throw new Error('RECORDER_TOO_LARGE');
            const ms = Number(input?.durationMs);
            if (!Number.isInteger(ms) || ms < 0 || ms > MAX_MS)
                throw new Error('RECORDER_DURATION_INVALID');
            const title = (typeof input?.title === 'string' && input.title.trim() ? input.title.trim() : this.defaultTitle()).slice(0, 160);
            const space = input?.spaceId || await this.personalSpace(ctx.actorId);
            const name = `${title}.${EXT[mime] || 'audio'}`;
            return this.core.files.importBlob(blob, name, mime, OWNER, [space], ctx, { tags: [TAG, DUR + ms], description: '' });
        }
        async list(actorId) {
            const out = [];
            for (const f of await this.core.files.list()) {
                if (!this.isRecording(f) || f.trashedAt || f.archivedAt)
                    continue;
                if (!await this.readable(f, actorId))
                    continue;
                out.push({ id: f.id, title: String(f.name).replace(/\.[a-z0-9]{2,4}$/i, ''), fileName: f.name, mime: f.mime, size: f.size, durationMs: durationOf(f), duration: fmtDuration(durationOf(f)), createdAt: f.createdAt, revision: f.revision, spaceIds: f.spaceIds });
            }
            return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        }
        async blob(id, actorId) { const f = await this.own(id, actorId); return this.core.files.getBlob(f.id); }
        async rename(input, ctx) {
            const f = await this.own(input?.id, ctx.actorId);
            const t = typeof input?.title === 'string' ? input.title.trim().slice(0, 160) : '';
            if (!t)
                throw new Error('RECORDER_TITLE_REQUIRED');
            const ext = (String(f.name).match(/\.[a-z0-9]{2,4}$/i) || [''])[0];
            return this.core.files.updateMetadata(f.id, { name: t + ext, expectedRevision: Number.isInteger(input?.expectedRevision) ? input.expectedRevision : f.revision }, ctx);
        }
        async remove(input, ctx) { const f = await this.own(input?.id, ctx.actorId); return this.core.files.trash(f.id, ctx, Number.isInteger(input?.expectedRevision) ? input.expectedRevision : f.revision); }
    }
    NS.CONTRACT = CONTRACT;
    NS.TAG = TAG;
    NS.formatDuration = fmtDuration;
    NS.durationOf = durationOf;
    NS.RecorderService = RecorderService;
    NS.install = (core, options = {}) => {
        if (core.recorder)
            throw new Error('Recorder already installed');
        if (!core?.files?.importBlob || !core?.files?.trash)
            throw new Error('Recorder requires Core files');
        const svc = new RecorderService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.RECORDER.SAVE', 'SAFE_WRITE', (p, c) => svc.save(p, c)], ['ACTION.CORE.RECORDER.LIST', 'READ', (_p, c) => svc.list(c.actorId)],
            ['ACTION.CORE.RECORDER.RENAME', 'SAFE_WRITE', (p, c) => svc.rename(p, c)], ['ACTION.CORE.RECORDER.DELETE', 'SAFE_WRITE', (p, c) => svc.remove(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.recorder = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.recorder;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length });
    };
})(KXRecorder || (KXRecorder = {}));
