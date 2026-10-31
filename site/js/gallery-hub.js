// N2.5u (user): PRO GALLERY in the hub „Galerie a média“ (APP.KX.MEDIA) – built ONLY on the core file services (no second storage):
// files visible by the same rules as Files (fileExplorer.searchAccessible), folders = file collections kind FOLDERS (USER = private, SPACE = shared, parentId = subfolders),
// ★ favourites = a personal PINNED collection (no copies), upload = FILE.IMPORT + attach, trash = FILE.TRASH. Browser: thumbnails, lightbox (zoom, arrows, swipe, info),
// layouts mosaic (default) / grid S–XL / list / timeline, sort, filters, bulk select (move to folder, ★, trash), drag & drop upload.
var KXGalleryHub;
(function () {
    const OWNER = 'APP.KX.MEDIA';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const st = { scope: 'SHARED', folder: '', quick: 'ALL', layout: 'MOSAIC', size: 'M', sort: 'ADDED', dir: 'DESC', q: '', sel: new Set(), view: null, group: 'NONE', f: { kind: 'ALL', by: 'ALL', from: '', to: '', size: 'ALL', favOnly: false, hidden: false }, showF: false };
    /* N2.5u (user): reusable – galleryKey MAIN (Galerie a média) or NSFW (the future 18+ hub: own ownerApp, never shown in the main gallery) */
    const GK = { MAIN: { owner: 'APP.KX.MEDIA' }, NSFW: { owner: 'APP.KX.ADULT' } };
    const MAX_DEPTH = 3;
    try {
        const s = JSON.parse(localStorage.getItem('kx.gallery') || '{}');
        for (const k of ['scope', 'layout', 'size', 'sort', 'dir', 'group'])
            if (s[k])
                st[k] = s[k];
    }
    catch { }
    const remember = () => { try {
        localStorage.setItem('kx.gallery', JSON.stringify({ scope: st.scope, layout: st.layout, size: st.size, sort: st.sort, dir: st.dir, group: st.group }));
    }
    catch { } };
    const isMedia = (f) => /^(image|video)\//.test(String(f?.mime || ''));
    const isVideo = (f) => /^video\//.test(String(f?.mime || ''));
    const visibleFor = (key, f) => (key || 'MAIN') === 'NSFW' ? f?.ownerApp === GK.NSFW.owner : f?.ownerApp !== GK.NSFW.owner;
    const canAddSub = (fs, parentId) => !parentId || depthOf(fs, parentId) < MAX_DEPTH;
    const urls = new Map();
    async function urlOf(core, f) { const k = f.id + ':' + f.contentRevision; if (urls.has(k))
        return urls.get(k); let u = ''; try {
        const b = await core.files.getBlob(f.id);
        if (b)
            u = URL.createObjectURL(b);
    }
    catch { } urls.set(k, u); return u; }
    const size = (n) => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB';
    function ctxOf(opts) { return { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['CORE.FILE.IMPORT', 'CORE.FILE.COLLECTION.CREATE', 'CORE.FILE.COLLECTION.EDIT', 'CORE.FILE.TRASH'], confirmed: true }; }
    async function personalSpace(core, u) { return ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id; }
    async function folders(core, u, gkey) {
        const out = [];
        for (const c of await core.fileLibrary.listCollections()) {
            if (c.kind !== 'FOLDERS')
                continue;
            if (c.scopeType === 'USER' && c.scopeId === u) {
                out.push({ ...c, scope: 'PRIVATE' });
                continue;
            }
            if (c.scopeType === 'SPACE' && await core.memberships.roleFor(c.scopeId, u).catch(() => null))
                out.push({ ...c, scope: 'SHARED' });
        }
        for (const f of out) {
            const m = await metaOf(core, f.id);
            f.meta = m?.data || {};
        }
        return out.filter((f) => (f.meta.galleryKey || 'MAIN') === (gkey || 'MAIN')).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    }
    /* folder meta (cover = main picture, hidden = „Schováno“, galleryKey) – an entity per folder, visible with the folder (space / personal) */
    const metaId = (cid) => 'CORE.GALLERY.FMETA.' + String(cid).replace(/[^A-Za-z0-9_.-]/g, '_');
    async function metaOf(core, cid) { try {
        return (await core.entities.get(metaId(cid))) || null;
    }
    catch {
        return null;
    } }
    async function metaSet(core, opts, folder, patch) {
        const cur = await metaOf(core, folder.id);
        const sp = folder.scopeType === 'SPACE' ? folder.scopeId : await personalSpace(core, opts.actorId);
        const d = { galleryKey: opts.galleryKey || 'MAIN', ...(cur?.data || {}), ...patch };
        return core.entities.save(cur ? { ...cur, expectedRevision: cur.revision, data: d } : { id: metaId(folder.id), type: 'CORE.GALLERY.FOLDER_META', ownerApp: GK[opts.galleryKey || 'MAIN'].owner, schema: 'KX.GALLERY_FOLDER_META/1', spaceIds: [sp], data: d }, { actorId: opts.actorId, appCode: GK[opts.galleryKey || 'MAIN'].owner, permissions: ['CORE.ENTITY.CREATE'], confirmed: true });
    }
    const prefsId = (u, k) => 'CORE.GALLERY.PREFS.' + k + '.' + String(u).replace(/[^A-Za-z0-9_.]/g, '_');
    async function prefs(core, opts) { try {
        return (await core.entities.get(prefsId(opts.actorId, opts.galleryKey || 'MAIN'))) || null;
    }
    catch {
        return null;
    } }
    async function prefsSet(core, opts, patch) {
        const cur = await prefs(core, opts);
        const d = { ...(cur?.data || {}), ...patch };
        const sp = await personalSpace(core, opts.actorId);
        return core.entities.save(cur ? { ...cur, expectedRevision: cur.revision, data: d } : { id: prefsId(opts.actorId, opts.galleryKey || 'MAIN'), type: 'CORE.GALLERY.PREFS', ownerApp: GK[opts.galleryKey || 'MAIN'].owner, schema: 'KX.GALLERY_PREFS/1', spaceIds: [sp], data: d }, { actorId: opts.actorId, appCode: GK[opts.galleryKey || 'MAIN'].owner, permissions: ['CORE.ENTITY.CREATE'], confirmed: true });
    }
    const depthOf = (fs, id) => { let d = 0, cur = fs.find((f) => f.id === id); while (cur) {
        d++;
        cur = cur.parentId ? fs.find((f) => f.id === cur.parentId) : null;
    } return d; };
    async function favCollection(core, opts, create = false) {
        const u = opts.actorId;
        const all = await core.fileLibrary.listCollections();
        let c = all.find((x) => x.kind === 'PINNED' && x.scopeType === 'USER' && x.scopeId === u && x.name === '★ Galerie');
        if (!c && create)
            c = await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.CREATE', { name: '★ Galerie', scopeType: 'USER', scopeId: u, ownerUserId: u, kind: 'PINNED' }, ctxOf(opts));
        return c || null;
    }
    /* the files of the current view (rights = same as Files) */
    async function files(core, opts) {
        const u = opts.actorId;
        const ps = await personalSpace(core, u);
        const fav = await favCollection(core, opts);
        const rows = (await core.fileExplorer.searchAccessible({ text: st.q || undefined, collectionId: st.folder || (st.quick === 'FAV' && fav ? fav.id : undefined) }, u)).map((r) => r.file || r).filter((f) => f && isMedia(f) && !f.trashedAt);
        let out = rows.filter((f) => st.folder || st.quick === 'FAV' || st.hub ? true : (st.scope === 'PRIVATE' ? (f.spaceIds || []).includes(ps) && (f.spaceIds || []).length === 1 : !((f.spaceIds || []).length === 1 && (f.spaceIds || []).includes(ps))));
        /* gallery key: the main gallery never shows files of the NSFW gallery and vice versa */ out = out.filter((f) => visibleFor(opts.galleryKey, f));
        /* hidden folders („Schováno“): their files are left out unless shown on purpose */ const mem = await core.fileLibrary.listMemberships();
        const fsAll = await folders(core, u, opts.galleryKey);
        const hiddenF = new Set(fsAll.filter((f) => f.meta.hidden).map((f) => f.id));
        const inHidden = new Set(mem.filter((m) => hiddenF.has(m.collectionId)).map((m) => m.fileId));
        const curHidden = st.folder && hiddenF.has(st.folder);
        if (st.quick === 'HIDDEN')
            out = out.filter((f) => inHidden.has(f.id));
        else if (!curHidden && !st.f.hidden)
            out = out.filter((f) => !inHidden.has(f.id));
        if (st.hub)
            out = out.filter((f) => f.ownerApp === st.hub);
        const F = st.f;
        if (F.kind === 'PHOTO')
            out = out.filter((f) => !isVideo(f));
        if (F.kind === 'VIDEO')
            out = out.filter(isVideo);
        if (F.by === 'ME')
            out = out.filter((f) => f.createdBy === u);
        if (F.by === 'OTHERS')
            out = out.filter((f) => f.createdBy !== u);
        if (F.from)
            out = out.filter((f) => String(f.createdAt).slice(0, 10) >= F.from);
        if (F.to)
            out = out.filter((f) => String(f.createdAt).slice(0, 10) <= F.to);
        if (F.size === 'S')
            out = out.filter((f) => f.size < 1048576);
        if (F.size === 'M')
            out = out.filter((f) => f.size >= 1048576 && f.size <= 5242880);
        if (F.size === 'L')
            out = out.filter((f) => f.size > 5242880);
        if (st.quick === 'VIDEO')
            out = out.filter(isVideo);
        if (st.quick === 'UNTAGGED')
            out = out.filter((f) => !(f.tags || []).length);
        if (st.quick === 'RECENT') {
            const lim = Date.now() - 14 * 86400000;
            out = out.filter((f) => Date.parse(f.createdAt) >= lim);
        }
        const key = { ADDED: (f) => f.createdAt, TAKEN: (f) => f.createdAt, NAME: (f) => String(f.name).toLowerCase(), SIZE: (f) => f.size };
        const k = key[st.sort] || key.ADDED;
        out.sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * (st.dir === 'ASC' ? 1 : -1); });
        const favIds = new Set();
        if (fav) {
            for (const m of mem)
                if (m.collectionId === fav.id)
                    favIds.add(m.fileId);
        }
        if (st.f.favOnly)
            out = out.filter((f) => favIds.has(f.id));
        const byFolder = new Map();
        for (const m of mem) {
            if (!byFolder.has(m.collectionId))
                byFolder.set(m.collectionId, []);
            byFolder.get(m.collectionId).push(m.fileId);
        }
        return { files: out, favIds, fav, byFolder, hiddenF };
    }
    async function mountHub(root, core, opts) {
        const u = opts.actorId;
        const C = ctxOf(opts);
        const again = () => void mountHub(root, core, opts);
        const toast = (m) => opts.onToast?.(m);
        const fs = await folders(core, u, opts.galleryKey);
        const { files: list, favIds, byFolder, hiddenF } = await files(core, opts);
        const pr = (await prefs(core, opts))?.data || {};
        const favF = new Set(pr.favFolders || []);
        /* superadmin sees everything (decision 2026-10-26) – other members' PRIVATE photos get a visible label */ const ownPs = await personalSpace(core, u);
        const otherPersonal = new Set((await core.memberships.listSpaces().catch(() => [])).filter((x) => x.kind === 'PERSONAL' && x.id !== ownPs).map((x) => x.id));
        const mine = fs.filter((f) => f.scope === st.scope && (st.f.hidden || st.quick === 'HIDDEN' || !f.meta.hidden || st.folder === f.id));
        /* N2.5u (user): the main gallery contains the galleries of ALL hubs (files grouped by their hub – no copies; rights as in Files) */
        let hubCards = [];
        if ((opts.galleryKey || 'MAIN') === 'MAIN' && !st.folder && !st.hub && st.quick === 'ALL') {
            const all = (await core.fileExplorer.searchAccessible({}, u)).map((r) => r.file || r).filter((f) => f && isMedia(f) && !f.trashedAt && f.ownerApp !== GK.NSFW.owner && f.ownerApp !== OWNER);
            const by = new Map();
            for (const f of all) {
                if (!by.has(f.ownerApp))
                    by.set(f.ownerApp, []);
                by.get(f.ownerApp).push(f);
            }
            hubCards = [...by.entries()].map(([code, fl]) => ({ code, files: fl }));
        }
        const nameOf = (code) => opts.hubName ? opts.hubName(code) : String(globalThis.KXI18n?.HUBS?.[code]?.cs?.[0] || code);
        const coverFile = (fid, ids) => { const want = fid && ids.includes(fid) ? fid : ids[0]; return want; };
        const nF = ['kind', 'by', 'size'].filter(k => st.f[k] !== 'ALL').length + (st.f.from ? 1 : 0) + (st.f.to ? 1 : 0) + (st.f.favOnly ? 1 : 0) + (st.f.hidden ? 1 : 0);
        const tree = (parent, depth) => mine.filter((f) => (f.parentId || undefined) === parent).map((f) => `<button type="button" class="kx-gl-f ${st.folder === f.id ? 'on' : ''}" style="padding-left:${8 + depth * 14}px" data-gl-folder="${esc(f.id)}">${f.meta.hidden ? '🙈' : '📁'} ${esc(f.name)}</button>${tree(f.id, depth + 1)}`).join('');
        const tile = (f) => `<div class="kx-gl-t ${st.sel.has(f.id) ? 'sel' : ''}" data-gl-tile="${esc(f.id)}"><button type="button" class="kx-gl-open" data-gl-open="${esc(f.id)}" title="${esc(f.name)}"><span class="kx-gl-ph" data-gl-thumb="${esc(f.id)}">${isVideo(f) ? '▶' : '🖼'}</span>${isVideo(f) ? '<i class="kx-gl-badge">▶</i>' : ''}${favIds.has(f.id) ? '<i class="kx-gl-star">★</i>' : ''}${(f.spaceIds || []).some((x) => otherPersonal.has(x)) ? `<i class="kx-gl-sa" title="${esc(TL('gl.saView', 'Superadmin view – private photo of another member'))}">🛠</i>` : ''}</button><label class="kx-gl-ck"><input type="checkbox" data-gl-sel="${esc(f.id)}" ${st.sel.has(f.id) ? 'checked' : ''}></label>${st.layout === 'LIST' ? '' : `<small class="kx-gl-name">${esc(f.name)}</small>`}</div>`;
        const kids = mine.filter((f) => (f.parentId || '') === (st.folder || ''));
        const fileById = new Map();
        const cardF = (f) => { const ids = (byFolder.get(f.id) || []); const cid = coverFile(f.meta.cover, ids); return `<div class="kx-gl-card ${f.meta.hidden ? 'hid' : ''}"><button type="button" class="kx-gl-card-b" data-gl-folder="${esc(f.id)}"><span class="kx-gl-ph" data-gl-cover="${esc(cid || '')}">📁</span><b>${f.meta.hidden ? '🙈 ' : ''}${esc(f.name)}</b><small>${ids.length} ${esc(TL('gl.items', 'items'))}</small></button><button type="button" class="kx-gl-card-fav" data-gl-favf="${esc(f.id)}" title="${esc(TL('gl.favFolder', 'Favourite folder'))}">${favF.has(f.id) ? '★' : '☆'}</button></div>`; };
        const cardH = (h) => `<div class="kx-gl-card hub"><button type="button" class="kx-gl-card-b" data-gl-hub="${esc(h.code)}"><span class="kx-gl-ph" data-gl-cover="${esc(h.files[0]?.id || '')}">🗂</span><b>${esc(nameOf(h.code))}</b><small>${h.files.length} ${esc(TL('gl.items', 'items'))}</small></button></div>`;
        for (const h of hubCards)
            for (const f of h.files)
                fileById.set(f.id, f);
        const cardsHtml = (kids.length || hubCards.length) ? `${kids.length ? `<h4 class="kx-gl-sub">${esc(TL(st.folder ? 'gl.subgalleries' : 'gl.galleries', 'Galleries'))}</h4><div class="kx-gl-cards">${kids.map(cardF).join('')}</div>` : ''}${hubCards.length ? `<h4 class="kx-gl-sub">🗂 ${esc(TL('gl.hubGalleries', 'Galleries of hubs'))}</h4><div class="kx-gl-cards">${hubCards.map(cardH).join('')}</div>` : ''}` : '';
        let body = '';
        if (!list.length)
            body = `<div class="kx-gl-empty"><b>${esc(TL('gl.empty', 'Nothing here yet.'))}</b><p class="muted">${esc(TL('gl.emptyHelp', 'Drop photos or videos here, or use ⬆ Upload.'))}</p></div>`;
        else if (st.layout === 'LIST')
            body = `<table class="kx-calc-table kx-gl-list"><tr><th></th><th>${esc(TL('gl.name', 'Name'))}</th><th>${esc(TL('gl.type', 'Type'))}</th><th>${esc(TL('gl.size', 'Size'))}</th><th>${esc(TL('gl.added', 'Added'))}</th></tr>${list.map((f) => `<tr><td><label><input type="checkbox" data-gl-sel="${esc(f.id)}" ${st.sel.has(f.id) ? 'checked' : ''}></label></td><td><button type="button" class="linkish" data-gl-open="${esc(f.id)}">${favIds.has(f.id) ? '★ ' : ''}${esc(f.name)}</button></td><td>${esc(f.mime)}</td><td>${esc(size(f.size))}</td><td>${esc(new Date(f.createdAt).toLocaleString('cs-CZ'))}</td></tr>`).join('')}</table>`;
        else if (st.layout === 'ALBUMS')
            body = '';
        else if (st.layout === 'TIMELINE' || st.group !== 'NONE') {
            const g = st.layout === 'TIMELINE' && st.group === 'NONE' ? 'MONTH' : st.group;
            const keyOf = (f) => g === 'DAY' ? String(f.createdAt).slice(0, 10) : g === 'YEAR' ? String(f.createdAt).slice(0, 4) : g === 'TYPE' ? (isVideo(f) ? 'VIDEO' : 'PHOTO') : g === 'FOLDER' ? (fs.find((x) => (byFolder.get(x.id) || []).includes(f.id))?.name || '—') : String(f.createdAt).slice(0, 7);
            const label = (k) => g === 'DAY' ? new Date(k + 'T12:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : g === 'YEAR' ? k : g === 'TYPE' ? TL('gl.kind.' + k, k) : g === 'FOLDER' ? k : new Date(k + '-01T12:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
            const by = new Map();
            for (const f of list) {
                const m = keyOf(f);
                if (!by.has(m))
                    by.set(m, []);
                by.get(m).push(f);
            }
            const cls = st.layout === 'MASONRY' ? 'kx-gl-masonry' : st.layout === 'MOSAIC' ? 'kx-gl-mosaic' : 'kx-gl-grid s-' + esc(st.size);
            body = [...by.entries()].map(([m, fs2]) => `<h4 class="kx-gl-month">${esc(label(m))} <small class="muted">${fs2.length}</small></h4><div class="${cls}">${fs2.map(tile).join('')}${st.layout === 'MOSAIC' ? '<i class="kx-gl-fill" aria-hidden="true"></i>' : ''}</div>`).join('');
        }
        else if (st.layout === 'MASONRY')
            body = `<div class="kx-gl-masonry">${list.map(tile).join('')}</div>`;
        else if (false) {
            const by = new Map();
            for (const f of list) {
                const m = String(f.createdAt).slice(0, 7);
                if (!by.has(m))
                    by.set(m, []);
                by.get(m).push(f);
            }
            body = [...by.entries()].map(([m, fs2]) => `<h4 class="kx-gl-month">${esc(new Date(m + '-01T12:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }))} <small class="muted">${fs2.length}</small></h4><div class="kx-gl-grid s-${esc(st.size)}">${fs2.map(tile).join('')}</div>`).join('');
        }
        else
            body = `<div class="${st.layout === 'MOSAIC' ? 'kx-gl-mosaic' : 'kx-gl-grid s-' + esc(st.size)}">${list.map(tile).join('')}${st.layout === 'MOSAIC' ? '<i class="kx-gl-fill" aria-hidden="true"></i>' : ''}</div>`;
        const seg = (attr, vals, cur, key) => `<span class="kx-sf-scope">${vals.map(v => `<button type="button" class="${cur === v ? 'active' : ''}" ${attr}="${v}" title="${esc(TL(key + v, v))}">${esc(TL(key + v, v))}</button>`).join('')}</span>`;
        root.innerHTML = `<div class="kx-gl" data-gallery>
      <aside class="kx-gl-side">${seg('data-gl-scope', ['SHARED', 'PRIVATE'], st.scope, 'gl.scope.')}
        <div class="kx-gl-quick">${['ALL', 'RECENT', 'FAV', 'VIDEO', 'UNTAGGED', 'HIDDEN'].map(q => `<button type="button" class="kx-gl-f ${!st.folder && st.quick === q ? 'on' : ''}" data-gl-quick="${q}">${esc(TL('gl.q.' + q, q))}</button>`).join('')}</div>
        ${favF.size ? `<div class="kx-gl-tree"><b>★ ${esc(TL('gl.favFolders', 'Favourite folders'))}</b>${fs.filter((f) => favF.has(f.id)).map((f) => `<button type="button" class="kx-gl-f ${st.folder === f.id ? 'on' : ''}" data-gl-folder="${esc(f.id)}">★ ${esc(f.name)}</button>`).join('')}</div>` : ''}<div class="kx-gl-tree"><b>${esc(TL('gl.folders', 'Folders'))}</b>${tree(undefined, 0) || `<small class="muted">${esc(TL('gl.noFolders', 'No folders yet.'))}</small>`}</div>
        <button type="button" class="btn ghost compact" data-gl-newfolder>＋ ${esc(TL(st.folder ? 'gl.newSub' : 'gl.newFolder', st.folder ? 'Subfolder' : 'New folder'))}</button></aside>
      <section class="kx-gl-main" data-gl-drop><div class="kx-gl-bar"><input class="kx-gl-q" data-gl-q value="${esc(st.q)}" placeholder="${esc(TL('gl.search', 'Search name, tag…'))}">
        ${seg('data-gl-layout', ['MOSAIC', 'GRID', 'MASONRY', 'LIST', 'TIMELINE', 'ALBUMS'], st.layout, 'gl.l.')}${st.layout === 'GRID' || st.layout === 'TIMELINE' ? seg('data-gl-size', ['S', 'M', 'L', 'XL'], st.size, 'gl.s.') : ''}
        <select data-gl-sort data-keep-select>${['ADDED', 'NAME', 'SIZE'].map(k => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${esc(TL('gl.sort.' + k, k))}</option>`).join('')}</select><button type="button" class="icon-btn" data-gl-dir title="${esc(TL('gl.dir', 'Order'))}">${st.dir === 'ASC' ? '↑' : '↓'}</button>
        <select data-gl-group data-keep-select title="${esc(TL('gl.group', 'Group by'))}">${['NONE', 'DAY', 'MONTH', 'YEAR', 'TYPE', 'FOLDER'].map(k => `<option value="${k}" ${st.group === k ? 'selected' : ''}>${esc(TL('gl.g.' + k, k))}</option>`).join('')}</select>
        <button type="button" class="btn ghost compact ${nF ? 'on' : ''}" data-gl-filters>⛃ ${esc(TL('gl.filters', 'Filters'))}${nF ? ` (${nF})` : ''}</button>
        <label class="btn compact">⬆ ${esc(TL('gl.upload', 'Upload'))}<input type="file" accept="image/*,video/*" multiple data-gl-file hidden></label></div>
        ${st.showF ? `<div class="kx-gl-fp" data-gl-fpanel><label>${esc(TL('gl.f.kind', 'Type'))}<select data-gl-f="kind" data-keep-select>${['ALL', 'PHOTO', 'VIDEO'].map(k => `<option value="${k}" ${st.f.kind === k ? 'selected' : ''}>${esc(TL('gl.fk.' + k, k))}</option>`).join('')}</select></label><label>${esc(TL('gl.f.by', 'Uploaded by'))}<select data-gl-f="by" data-keep-select>${['ALL', 'ME', 'OTHERS'].map(k => `<option value="${k}" ${st.f.by === k ? 'selected' : ''}>${esc(TL('gl.fb.' + k, k))}</option>`).join('')}</select></label><label>${esc(TL('gl.f.from', 'From'))}<input type="date" data-gl-f="from" value="${esc(st.f.from)}"></label><label>${esc(TL('gl.f.to', 'To'))}<input type="date" data-gl-f="to" value="${esc(st.f.to)}"></label><label>${esc(TL('gl.f.size', 'Size'))}<select data-gl-f="size" data-keep-select>${['ALL', 'S', 'M', 'L'].map(k => `<option value="${k}" ${st.f.size === k ? 'selected' : ''}>${esc(TL('gl.fs.' + k, k))}</option>`).join('')}</select></label><label class="kx-gl-ck2"><input type="checkbox" data-gl-f="favOnly" ${st.f.favOnly ? 'checked' : ''}> ★ ${esc(TL('gl.f.favOnly', 'favourites only'))}</label><label class="kx-gl-ck2"><input type="checkbox" data-gl-f="hidden" ${st.f.hidden ? 'checked' : ''}> 🙈 ${esc(TL('gl.f.hidden', 'include hidden'))}</label><button type="button" class="btn ghost compact" data-gl-freset>${esc(TL('gl.f.reset', 'Clear filters'))}</button></div>` : ''}
        ${cardsHtml}
        <div class="kx-gl-info muted"><span>${list.length} ${esc(TL('gl.items', 'items'))}</span>${list.length ? ` <button type="button" class="btn ghost compact" data-gl-selall>${st.sel.size === list.length ? '☐ ' + esc(TL('gl.selNone', 'Select none')) : '☑ ' + esc(TL('gl.selAll', 'Select all'))}</button>` : ''}${st.folder ? ` · 📁 ${esc((fs.find((f) => f.id === st.folder) || {}).name || '')} <button type="button" class="btn ghost compact" data-gl-hidefolder>${(fs.find((f) => f.id === st.folder) || { meta: {} }).meta.hidden ? '👁 ' + esc(TL('gl.unhideFolder', 'Show folder')) : '🙈 ' + esc(TL('gl.hideFolder', 'Hide folder'))}</button>` : ''}${st.hub ? ` · 🗂 ${esc(nameOf(st.hub))} <button type="button" class="btn ghost compact" data-gl-hubclear>× ${esc(TL('gl.allGalleries', 'All galleries'))}</button>` : ''}${st.sel.size ? ` · <b>${st.sel.size} ${esc(TL('gl.selected', 'selected'))}</b> <select data-gl-move data-keep-select><option value="">${esc(TL('gl.moveTo', 'Move to folder…'))}</option>${fs.map((f) => `<option value="${esc(f.id)}">${f.scope === 'PRIVATE' ? '🔒' : '🌐'} ${esc(f.name)}</option>`).join('')}</select> <button type="button" class="btn ghost compact" data-gl-favsel>★</button> <button type="button" class="btn ghost compact" data-gl-hide>🙈 ${esc(TL('gl.hide', 'Hide'))}</button> <button type="button" class="btn ghost compact" data-gl-trash>🗑 ${esc(TL('gl.trash', 'To trash'))}</button> <button type="button" class="btn ghost compact" data-gl-clear>${esc(TL('gl.clearSel', 'Clear'))}</button>` : ''}</div>
        ${body}</section></div>`;
        /* thumbnails – lazy (only visible), small canvas copies kept as data URLs */
        const io = new IntersectionObserver(async (ents) => {
            for (const e of ents) {
                if (!e.isIntersecting)
                    continue;
                io.unobserve(e.target);
                const el2 = e.target;
                const f = list.find((x) => x.id === el2.dataset.glThumb);
                if (!f)
                    continue;
                const u2 = await urlOf(core, f);
                if (!u2)
                    continue;
                if (isVideo(f))
                    el2.innerHTML = `<video src="${esc(u2)}#t=0.1" muted preload="metadata"></video>`;
                else {
                    const im = new Image();
                    im.onload = () => { const t = root.querySelector(`[data-gl-tile="${f.id}"]`); if (t && st.layout === 'MOSAIC') {
                        t.style.flexGrow = String(Math.max(.5, Math.min(3, im.naturalWidth / Math.max(1, im.naturalHeight))));
                    } };
                    im.src = u2;
                    im.alt = f.name;
                    im.loading = 'lazy';
                    el2.innerHTML = '';
                    el2.appendChild(im);
                }
            }
        }, { rootMargin: '200px' });
        root.querySelectorAll('[data-gl-thumb]').forEach(x => io.observe(x));
        /* covers of sub-galleries (main picture; default = the first) */
        const coverIo = new IntersectionObserver(async (ents) => {
            for (const e of ents) {
                if (!e.isIntersecting)
                    continue;
                coverIo.unobserve(e.target);
                const el2 = e.target;
                const id = String(el2.dataset.glCover || '');
                if (!id)
                    continue;
                const f = fileById.get(id) || list.find((x) => x.id === id) || await core.files.get(id).catch(() => null);
                if (!f || !isMedia(f))
                    continue;
                const u2 = await urlOf(core, f);
                if (!u2)
                    continue;
                el2.innerHTML = isVideo(f) ? `<video src="${esc(u2)}#t=0.1" muted preload="metadata"></video>` : `<img src="${esc(u2)}" alt="" loading="lazy">`;
            }
        }, { rootMargin: '200px' });
        root.querySelectorAll('[data-gl-cover]').forEach(x => coverIo.observe(x));
        const bind = (sel, fn, ev = 'click') => root.querySelectorAll(sel).forEach(b => b.addEventListener(ev, (e) => fn(b, e)));
        bind('[data-gl-scope]', b => { st.scope = String(b.dataset.glScope); st.folder = ''; st.sel.clear(); remember(); again(); });
        bind('[data-gl-quick]', b => { st.quick = String(b.dataset.glQuick); st.folder = ''; st.hub = ''; again(); });
        bind('[data-gl-hub]', b => { st.hub = String(b.dataset.glHub); st.folder = ''; again(); });
        bind('[data-gl-hubclear]', () => { st.hub = ''; again(); });
        bind('[data-gl-favf]', async (b) => { const id = String(b.dataset.glFavf); const set = new Set(pr.favFolders || []); if (set.has(id))
            set.delete(id);
        else
            set.add(id); await prefsSet(core, opts, { favFolders: [...set] }).catch((e) => toast(String(e?.message || e))); again(); });
        bind('[data-gl-group]', b => { st.group = b.value; remember(); again(); }, 'change');
        bind('[data-gl-filters]', () => { st.showF = !st.showF; again(); });
        bind('[data-gl-f]', b => { const k = String(b.dataset.glF); st.f[k] = b.type === 'checkbox' ? b.checked : b.value; again(); }, 'change');
        bind('[data-gl-freset]', () => { st.f = { kind: 'ALL', by: 'ALL', from: '', to: '', size: 'ALL', favOnly: false, hidden: false }; again(); });
        bind('[data-gl-hidefolder]', async () => { const fo = fs.find((f) => f.id === st.folder); if (!fo)
            return; try {
            await metaSet(core, opts, fo, { hidden: !fo.meta.hidden });
            toast(TL(fo.meta.hidden ? 'gl.unhidden' : 'gl.hiddenDone', ''));
        }
        catch (e) {
            toast(String(e?.message || e));
        } if (!fo.meta.hidden)
            st.folder = ''; again(); });
        /* hide selected → the folder „🙈 Schováno“ of the current scope (created on demand, hidden) */
        bind('[data-gl-hide]', async () => {
            let hf = fs.find((f) => f.scope === st.scope && f.meta.hidden && f.name === TL('gl.hiddenName', 'Hidden') && !f.parentId);
            try {
                if (!hf) {
                    let scopeType = 'USER', scopeId = u;
                    if (st.scope === 'SHARED') {
                        scopeType = 'SPACE';
                        scopeId = opts.defaultSpaceId || ((await core.propagate.spaces(u)).find((x) => x.kind !== 'PERSONAL') || {}).id;
                    }
                    const c = await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.CREATE', { name: TL('gl.hiddenName', 'Hidden'), scopeType, scopeId, ownerUserId: u, kind: 'FOLDERS' }, C);
                    hf = { ...c, meta: {} };
                    await metaSet(core, opts, hf, { hidden: true });
                }
                let n = 0;
                for (const id of st.sel) {
                    await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.ATTACH', { fileId: id, collectionId: hf.id }, C).catch(() => { });
                    if (st.folder && st.folder !== hf.id)
                        await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.DETACH', { fileId: id, collectionId: st.folder }, C).catch(() => { });
                    n++;
                }
                toast(TL('gl.hiddenN', 'Hidden: {n}').replace('{n}', String(n)));
            }
            catch (e) {
                toast(String(e?.message || e));
            }
            st.sel.clear();
            again();
        });
        bind('[data-gl-folder]', b => { st.folder = String(b.dataset.glFolder); st.quick = 'ALL'; st.hub = ''; again(); });
        bind('[data-gl-layout]', b => { st.layout = String(b.dataset.glLayout); remember(); again(); });
        bind('[data-gl-size]', b => { st.size = String(b.dataset.glSize); remember(); again(); });
        bind('[data-gl-sort]', b => { st.sort = b.value; remember(); again(); }, 'change');
        bind('[data-gl-dir]', () => { st.dir = st.dir === 'ASC' ? 'DESC' : 'ASC'; remember(); again(); });
        let qT = null;
        bind('[data-gl-q]', b => { clearTimeout(qT); qT = setTimeout(() => { st.q = b.value; again(); }, 300); }, 'input');
        bind('[data-gl-sel]', b => { const id = String(b.dataset.glSel); if (b.checked)
            st.sel.add(id);
        else
            st.sel.delete(id); again(); }, 'change');
        bind('[data-gl-clear]', () => { st.sel.clear(); again(); });
        bind('[data-gl-selall]', () => { if (st.sel.size === list.length)
            st.sel.clear();
        else
            for (const f of list)
                st.sel.add(f.id); again(); });
        bind('[data-gl-newfolder]', async () => {
            if (!canAddSub(fs, st.folder || undefined)) {
                toast(TL('gl.maxDepth', 'At most 3 levels of folders.'));
                return;
            }
            const name = (prompt(TL('gl.folderName', 'Folder name')) || '').trim().slice(0, 80);
            if (!name)
                return;
            const parent = st.folder ? fs.find((f) => f.id === st.folder) : null;
            let scopeType = 'USER', scopeId = u;
            if (st.scope === 'SHARED') {
                scopeType = 'SPACE';
                scopeId = parent?.scopeId || opts.defaultSpaceId || ((await core.propagate.spaces(u)).find((s) => s.kind !== 'PERSONAL') || {}).id;
            }
            try {
                const c = await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.CREATE', { name, scopeType, scopeId, ownerUserId: u, kind: 'FOLDERS', parentId: parent?.id }, C);
                st.folder = c.id;
                toast(TL('gl.folderCreated', 'Folder created.'));
            }
            catch (e) {
                toast(String(e?.message || e));
            }
            again();
        });
        /* upload (button + drag & drop) into the current folder and its space */
        const upload = async (fl) => {
            const arr = Array.from(fl).filter((f) => /^(image|video)\//.test(f.type));
            if (!arr.length) {
                toast(TL('gl.onlyMedia', 'Only photos and videos.'));
                return;
            }
            const fo = st.folder ? fs.find((f) => f.id === st.folder) : null;
            const sp = fo ? (fo.scopeType === 'SPACE' ? fo.scopeId : await personalSpace(core, u)) : (st.scope === 'PRIVATE' ? await personalSpace(core, u) : opts.defaultSpaceId || ((await core.propagate.spaces(u)).find((s) => s.kind !== 'PERSONAL') || {}).id);
            let n = 0;
            for (const f of arr) {
                try {
                    const r = await core.actions.invoke('ACTION.CORE.FILE.IMPORT', { blob: f, name: f.name, mime: f.type, ownerApp: OWNER, spaceIds: [sp] }, C);
                    if (fo)
                        await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.ATTACH', { fileId: r.id, collectionId: fo.id }, C);
                    n++;
                }
                catch (e) {
                    toast(`${f.name}: ${String(e?.message || e)}`);
                }
            }
            toast(TL('gl.uploaded', 'Uploaded: {n}').replace('{n}', String(n)));
            again();
        };
        bind('[data-gl-file]', b => { const fl = b.files; if (fl)
            void upload(fl); }, 'change');
        const drop = root.querySelector('[data-gl-drop]');
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer?.files?.length)
            void upload(e.dataTransfer.files); });
        /* bulk */
        bind('[data-gl-move]', async (b) => { const to = b.value; if (!to)
            return; let n = 0; for (const id of st.sel) {
            try {
                await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.ATTACH', { fileId: id, collectionId: to }, C);
                if (st.folder && st.folder !== to)
                    await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.DETACH', { fileId: id, collectionId: st.folder }, C).catch(() => { });
                n++;
            }
            catch { }
        } toast(TL('gl.moved', 'Moved: {n}').replace('{n}', String(n))); st.sel.clear(); again(); }, 'change');
        bind('[data-gl-favsel]', async () => { const fav = await favCollection(core, opts, true); for (const id of st.sel) {
            if (!favIds.has(id))
                await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.ATTACH', { fileId: id, collectionId: fav.id, pinned: true }, C).catch(() => { });
        } st.sel.clear(); again(); });
        bind('[data-gl-trash]', async () => { if (!confirm(TL('gl.trashQ', 'Move the selected items to the trash (can be restored)?')))
            return; let n = 0; for (const id of st.sel) {
            const f = list.find((x) => x.id === id);
            try {
                await core.actions.invoke('ACTION.CORE.FILE.TRASH', { fileId: id, expectedRevision: f?.revision }, C);
                n++;
            }
            catch (e) {
                toast(String(e?.message || e));
            }
        } toast(TL('gl.trashed', 'In the trash: {n}').replace('{n}', String(n))); st.sel.clear(); again(); });
        bind('[data-gl-open]', b => void lightbox(core, opts, list, String(b.dataset.glOpen), favIds, again, st.folder ? fs.find((f) => f.id === st.folder) : null));
    }
    /* LIGHTBOX – full screen, zoom (wheel / pinch / double click), pan, ← → / swipe, info, ★, download, Esc */
    async function lightbox(core, opts, list, id, favIds, again, folder) {
        let i = Math.max(0, list.findIndex((f) => f.id === id));
        let z = 1, px = 0, py = 0, info = false;
        /* inside the hub window (clicks outside the window would close it) */ const host = document.querySelector('[data-gallery]')?.closest('#inspector') || document.body;
        const lb = document.createElement('div');
        lb.className = 'kx-gl-lb';
        lb.dataset.galleryLightbox = '1';
        host.appendChild(lb);
        const close = () => { document.removeEventListener('keydown', key, true); lb.remove(); };
        const draw = async () => {
            const f = list[i];
            const u = await urlOf(core, f);
            z = 1;
            px = 0;
            py = 0;
            lb.innerHTML = `<div class="kx-gl-lb-top"><b>${esc(f.name)}</b><small>${i + 1} / ${list.length}</small><span style="flex:1"></span><button type="button" class="icon-btn" data-lb-fav title="★">${favIds.has(f.id) ? '★' : '☆'}</button><a class="icon-btn" data-lb-dl href="${esc(u)}" download="${esc(f.name)}" title="${esc(TL('gl.download', 'Download'))}">⬇</a>${folder && !isVideo(f) ? `<button type="button" class="icon-btn" data-lb-cover title="${esc(TL('gl.setCover', 'Set as the main picture of the folder'))}">🖼</button>` : ''}<button type="button" class="icon-btn" data-lb-info title="${esc(TL('gl.info', 'Info'))}">ⓘ</button><button type="button" class="icon-btn" data-lb-close title="Esc">×</button></div>
        <button type="button" class="kx-gl-lb-nav prev" data-lb-prev aria-label="‹">‹</button><div class="kx-gl-lb-stage" data-lb-stage>${isVideo(f) ? `<video src="${esc(u)}" controls autoplay></video>` : `<img src="${esc(u)}" alt="${esc(f.name)}" data-lb-img draggable="false">`}</div><button type="button" class="kx-gl-lb-nav next" data-lb-next aria-label="›">›</button>
        <aside class="kx-gl-lb-info" ${info ? '' : 'hidden'}><dl><dt>${esc(TL('gl.name', 'Name'))}</dt><dd>${esc(f.name)}</dd><dt>${esc(TL('gl.type', 'Type'))}</dt><dd>${esc(f.mime)}</dd><dt>${esc(TL('gl.size', 'Size'))}</dt><dd>${esc(size(f.size))}</dd><dt>${esc(TL('gl.added', 'Added'))}</dt><dd>${esc(new Date(f.createdAt).toLocaleString('cs-CZ'))}</dd><dt>${esc(TL('gl.by', 'By'))}</dt><dd>${esc(f.createdBy)}</dd>${(f.tags || []).length ? `<dt>${esc(TL('gl.tags', 'Tags'))}</dt><dd>${esc((f.tags || []).join(', '))}</dd>` : ''}${f.description ? `<dt>${esc(TL('gl.desc', 'Note'))}</dt><dd>${esc(f.description)}</dd>` : ''}</dl><small class="muted" data-lb-dim></small></aside>`;
            const img = lb.querySelector('[data-lb-img]');
            const stage = lb.querySelector('[data-lb-stage]');
            const apply = () => { if (img)
                img.style.transform = `translate(${px}px,${py}px) scale(${z})`; };
            if (img) {
                img.onload = () => { const d = lb.querySelector('[data-lb-dim]'); if (d)
                    d.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`; };
                stage.addEventListener('wheel', (e) => { e.preventDefault(); z = Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (z === 1) {
                    px = 0;
                    py = 0;
                } apply(); }, { passive: false });
                img.addEventListener('dblclick', () => { z = z > 1 ? 1 : 2; px = 0; py = 0; apply(); });
                let drag = null;
                img.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px, py }; img.setPointerCapture(e.pointerId); });
                img.addEventListener('pointermove', (e) => { if (!drag)
                    return; if (z > 1) {
                    px = drag.px + (e.clientX - drag.x);
                    py = drag.py + (e.clientY - drag.y);
                    apply();
                } });
                img.addEventListener('pointerup', (e) => { if (drag && z === 1) {
                    const dx = e.clientX - drag.x;
                    if (Math.abs(dx) > 60)
                        go(dx < 0 ? 1 : -1);
                } drag = null; });
            }
            lb.querySelector('[data-lb-cover]')?.addEventListener('click', async () => { try {
                await metaSet(core, opts, folder, { cover: f.id });
                opts.onToast?.(TL('gl.coverSet', 'Main picture of the folder set.'));
                again();
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            } });
            lb.querySelector('[data-lb-close]').onclick = close;
            lb.querySelector('[data-lb-prev]').onclick = () => go(-1);
            lb.querySelector('[data-lb-next]').onclick = () => go(1);
            lb.querySelector('[data-lb-info]').onclick = () => { info = !info; lb.querySelector('.kx-gl-lb-info').hidden = !info; };
            lb.querySelector('[data-lb-fav]').onclick = async () => { const C = ctxOf(opts); const fav = await favCollection(core, opts, true); try {
                if (favIds.has(f.id)) {
                    await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.DETACH', { fileId: f.id, collectionId: fav.id }, C);
                    favIds.delete(f.id);
                }
                else {
                    await core.actions.invoke('ACTION.CORE.FILE_COLLECTION.ATTACH', { fileId: f.id, collectionId: fav.id, pinned: true }, C);
                    favIds.add(f.id);
                }
            }
            catch { } void draw(); again(); };
        };
        const go = (d) => { i = (i + d + list.length) % list.length; void draw(); };
        /* keys belong to the lightbox only (capture + stop) – Esc must not close the hub window behind it */ const key = (e) => { if (['Escape', 'ArrowLeft', 'ArrowRight', 'i', 'I'].includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        } if (e.key === 'Escape')
            close();
        else if (e.key === 'ArrowRight')
            go(1);
        else if (e.key === 'ArrowLeft')
            go(-1);
        else if (e.key === 'i' || e.key === 'I') {
            info = !info;
            const a = lb.querySelector('.kx-gl-lb-info');
            if (a)
                a.hidden = !info;
        } };
        document.addEventListener('keydown', key, true);
        await draw();
    }
    KXGalleryHub = { OWNER, mountHub, st, GK, MAX_DEPTH, visibleFor, canAddSub, depthOf, isMedia, isVideo };
    globalThis.KXGalleryHub = KXGalleryHub;
})();
