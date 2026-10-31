// N2.1m (R39/R40): QR + link for every record, "open NEXUS from a QR" and "send to another device".
//  - recordUrl(deepLink): <NEXUS address>#kx=<kx:// deep link>; only kx:// links that Core can parse are accepted;
//    from file:// there is no address a phone can open -> reported as UNAVAILABLE (never a fake QR);
//  - qrSvg(text): offline QR (vendor MIT, see core-qr-vendor.ts), ASCII only (URLs are percent-encoded);
//  - handoff = Core entity CORE.HANDOFF in the sender's personal space; it travels with KX.SYNC_PACKAGE (shared
//    folder / NAS / cloud) and shows up on the OTHER devices of the same user as "Přijaté odkazy"; opening marks it (CAS).
var KXHandoff;
(function (NS) {
    const TYPE = 'CORE.HANDOFF', OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_HANDOFF/1', MAX_AGE_MS = 7 * 86400000, MAX_QR_TEXT = 1200;
    function qrMatrix(text, utf8 = false) {
        if (typeof text !== 'string' || !text)
            throw new Error('QR_TEXT_REQUIRED');
        /* N2.5c: vCard / text with Czech letters – UTF-8 bytes in byte mode (phones read vCards as UTF-8); links stay ASCII-only */
        if (utf8) {
            text = unescape(encodeURIComponent(text.replace(/\r?\n/g, '\r\n')));
            if (text.length > MAX_QR_TEXT * 2)
                throw new Error('QR_TEXT_TOO_LONG');
        }
        else {
            if (text.length > MAX_QR_TEXT)
                throw new Error('QR_TEXT_TOO_LONG');
            if (/[^\x20-\x7e]/.test(text))
                throw new Error('QR_TEXT_NOT_ASCII');
        }
        const Q = globalThis.KXQRCode, L = globalThis.KXQRErrorCorrectLevel;
        if (typeof Q !== 'function' || !L)
            throw new Error('QR_ENCODER_UNAVAILABLE');
        const qr = new Q(0, L.M);
        qr.addData(text);
        qr.make();
        const n = qr.getModuleCount();
        const dark = [];
        for (let r = 0; r < n; r++) {
            const row = [];
            for (let c = 0; c < n; c++)
                row.push(!!qr.isDark(r, c));
            dark.push(row);
        }
        return { size: n, dark };
    }
    function qrSvg(text, opts = {}) {
        const m = qrMatrix(text, opts.utf8 === true), pad = 4, size = m.size + pad * 2;
        let d = '';
        for (let r = 0; r < m.size; r++)
            for (let c = 0; c < m.size; c++)
                if (m.dark[r][c])
                    d += `M${c + pad} ${r + pad}h1v1h-1z`;
        const label = String(opts.label || 'QR').replace(/[<>&"]/g, '');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges" data-qr-modules="${m.size}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    }
    class HandoffService {
        core;
        opts;
        constructor(core, opts = {}) {
            this.core = core;
            this.opts = opts;
        }
        now() { return typeof this.opts.now === 'function' ? this.opts.now() : Date.now(); }
        device() { return typeof this.opts.deviceId === 'function' ? this.opts.deviceId() : this.opts.deviceId || null; }
        checkLink(deepLink) { if (typeof deepLink !== 'string' || !deepLink.startsWith('kx://') || deepLink.length > 900)
            throw new Error('HANDOFF_LINK_INVALID'); this.core.deepLinks.parse(deepLink); return deepLink; }
        baseUrl() { const loc = globalThis.location; const b = this.opts.baseUrl || (loc && /^https?:$/.test(loc.protocol) ? `${loc.origin}${loc.pathname}` : null); return b; }
        recordUrl(deepLink) {
            this.checkLink(deepLink);
            const base = this.baseUrl();
            if (!base)
                return { available: false, reason: 'NO_NETWORK_ADDRESS', hint: 'NEXUS je otevřený ze souboru (file://) – telefon tuto adresu neotevře. Otevřete NEXUS přes web / domácí síť / NAS.', deepLink };
            return { available: true, url: `${base}#kx=${encodeURIComponent(deepLink)}`, deepLink };
        }
        parseHash(hash) { if (typeof hash !== 'string' || !hash.startsWith('#kx='))
            return null; try {
            return this.checkLink(decodeURIComponent(hash.slice(4)));
        }
        catch {
            return null;
        } }
        async personalSpace(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('HANDOFF_NO_PERSONAL_SPACE'); return s.id; }
        async send(input, ctx) {
            const deepLink = this.checkLink(input?.deepLink);
            const title = typeof input?.title === 'string' ? input.title.trim().slice(0, 160) : '';
            const dev = this.device() || ctx?.deviceId || null;
            return this.core.entities.save({ type: TYPE, ownerApp: OWNER, schema: 'KX.CORE_HANDOFF/1', spaceIds: [await this.personalSpace(ctx.actorId)],
                data: { deepLink, title: title || deepLink, fromDeviceId: dev, fromActorId: ctx.actorId, sentAt: new Date(this.now()).toISOString(), openedAt: null, openedOnDeviceId: null } }, ctx);
        }
        async inbox(actorId) {
            const dev = this.device(), t = this.now(), out = [];
            for (const r of await this.core.entities.list()) {
                if (r.type !== TYPE || r.archivedAt || r.data?.fromActorId !== actorId || r.data?.openedAt)
                    continue;
                if (dev && r.data.fromDeviceId === dev)
                    continue;
                if (t - Date.parse(r.data.sentAt) > MAX_AGE_MS)
                    continue;
                if (await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, 'READ') !== true)
                    continue;
                out.push(r);
            }
            return out.sort((a, b) => String(b.data.sentAt).localeCompare(String(a.data.sentAt)));
        }
        async open(input, ctx) {
            const r = await this.core.entities.get(input?.id);
            if (!r || r.type !== TYPE || r.data?.fromActorId !== ctx.actorId)
                throw new Error('HANDOFF_NOT_FOUND');
            if (r.data.openedAt)
                throw new Error('HANDOFF_ALREADY_OPENED');
            const row = await this.core.entities.save({ id: r.id, type: TYPE, ownerApp: OWNER, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: Number.isInteger(input?.expectedRevision) ? input.expectedRevision : r.revision,
                data: { ...r.data, openedAt: new Date(this.now()).toISOString(), openedOnDeviceId: this.device() || ctx?.deviceId || null } }, ctx);
            return { deepLink: row.data.deepLink, revision: row.revision };
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.qrMatrix = qrMatrix;
    NS.qrSvg = qrSvg;
    NS.HandoffService = HandoffService;
    NS.install = (core, options = {}) => {
        if (core.handoff)
            throw new Error('Handoff already installed');
        if (!core?.deepLinks?.parse || !core?.entities?.save)
            throw new Error('Handoff requires Core deep links/entities');
        const svc = new HandoffService(core, options);
        const reg = [];
        const defs = [['ACTION.CORE.HANDOFF.SEND', 'SAFE_WRITE', (p, c) => svc.send(p, c)], ['ACTION.CORE.HANDOFF.INBOX', 'READ', (_p, c) => svc.inbox(c.actorId)], ['ACTION.CORE.HANDOFF.OPEN', 'SAFE_WRITE', (p, c) => svc.open(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.handoff = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.handoff;
            throw e;
        }
        return Object.freeze({ contract: CONTRACT, actions: defs.length, qr: typeof globalThis.KXQRCode === 'function' });
    };
})(KXHandoff || (KXHandoff = {}));
