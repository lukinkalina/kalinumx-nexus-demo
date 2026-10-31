// N2.3a (R66 / R66a): Notes (KX.CORE_NOTES/1) – notebooks → sections → pages (+ sub-pages), rich text KX.RICHTEXT/1,
// tags, diacritics-insensitive search and version history.
//  - RICH TEXT is stored as a validated structured document, NEVER as HTML: blocks (paragraph, headings 1–3, quote, code,
//    divider, bullet / numbered / check lists, callouts) and inline runs with marks (bold, italic, underline, strike, code,
//    sup / sub, colour / highlight as #hex or theme colour, size, link http(s) / kx:// / #, tag, status badge). Anything
//    else is dropped; the Shell renders it back with escaping, so scripts and remote content cannot enter.
//  - ACCESS follows spaces like everywhere (personal / family / company); a section and its pages inherit the notebook's spaces.
//  - HISTORY: every save keeps the previous content as a version (last 50 per page); a version can be restored (the current
//    content becomes a version first – nothing is lost).
var KXNotes;
(function (NS) {
    const OWNER = 'APP.KX.NEXUS', CONTRACT = 'KX.CORE_NOTES/1', T_BOOK = 'CORE.NOTE.BOOK', T_SEC = 'CORE.NOTE.SECTION', T_PAGE = 'CORE.NOTE.PAGE', T_VER = 'CORE.NOTE.VERSION';
    const BLOCKS = ['p', 'h1', 'h2', 'h3', 'quote', 'code', 'hr', 'ul', 'ol', 'todo', 'callout', 'img', 'file', 'table'] /* N2.5z: image / attachment (reference to a stored file only) and table */;
    const FILE_ID_RE = /^[A-Za-z0-9_.:-]{6,140}$/, IMG_W = [25, 50, 75, 100], MAX_ROWS = 200, MAX_COLS = 20, LISTS = ['ul', 'ol', 'todo'], CALLOUTS = ['info', 'warn', 'tip', 'success'];
    const BADGES = ['done', 'wait', 'important', 'due', 'info', 'idea'], SIZES = ['s', 'l', 'xl'], ALIGN = ['left', 'center', 'right'];
    const ITEM_ID_RE = /^[a-z0-9]{6,20}$/, LINK_KINDS = ['TASK', 'SHOPPING', 'EVENT', 'REMINDER', 'DEADLINE', 'RECORD', 'STEP'];
    const THEME_COLORS = ['accent', 'accent2', 'text', 'muted', 'danger', 'success', 'warning'];
    const MAX_BLOCKS = 3000, MAX_RUNS = 400, MAX_TEXT = 20000, MAX_ITEMS = 500, MAX_DOC_CHARS = 1500000, MAX_VERSIONS = 50, MAX_NAME = 160;
    const PALETTE = ['#d4a24c', '#e06c75', '#61afef', '#98c379', '#c678dd', '#56b6c2', '#e5c07b', '#abb2bf'];
    const color = (v) => typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || THEME_COLORS.includes(v)) ? v.toLowerCase() : undefined;
    const link = (v) => { if (typeof v !== 'string')
        return undefined; const x = v.trim(); return x.length <= 2000 && /^(https?:\/\/[^\s<>"']+|kx:\/\/[^\s<>"']+|#[\w-]{1,80})$/i.test(x) ? x : undefined; };
    const tagName = (v) => { const x = String(v || '').replace(/^#/, '').trim().slice(0, 40); return /^[\p{L}\p{N}_-]{1,40}$/u.test(x) ? x : undefined; };
    const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function cleanRun(r) {
        const text = String(r?.text ?? '').slice(0, MAX_TEXT);
        const o = { text };
        for (const k of ['b', 'i', 'u', 's', 'code', 'sup', 'sub'])
            if (r?.[k] === true)
                o[k] = true;
        const c = color(r?.color), bg = color(r?.bg), l = link(r?.link), t = r?.tag != null ? tagName(r.tag) : undefined;
        if (c)
            o.color = c;
        if (bg)
            o.bg = bg;
        if (SIZES.includes(r?.size))
            o.size = r.size;
        if (l)
            o.link = l;
        if (t)
            o.tag = t;
        if (BADGES.includes(r?.badge))
            o.badge = r.badge;
        return o;
    }
    function cleanRuns(runs) { if (!Array.isArray(runs))
        return []; if (runs.length > MAX_RUNS)
        throw new Error('RICHTEXT_TOO_MANY_RUNS'); return runs.map(cleanRun).filter((r) => r.text || r.badge || r.tag); }
    function validateDoc(doc) {
        if (doc == null)
            return { schema: 'KX.RICHTEXT/1', blocks: [] };
        if (typeof doc !== 'object' || doc.schema !== 'KX.RICHTEXT/1' || !Array.isArray(doc.blocks))
            throw new Error('RICHTEXT_SCHEMA_INVALID (expected KX.RICHTEXT/1)');
        if (doc.blocks.length > MAX_BLOCKS)
            throw new Error('RICHTEXT_TOO_MANY_BLOCKS');
        const blocks = doc.blocks.map((b) => {
            const t = String(b?.t || '');
            if (!BLOCKS.includes(t))
                throw new Error('RICHTEXT_BLOCK_INVALID: ' + t.slice(0, 20));
            if (t === 'hr')
                return { t };
            /* N2.5z: image and attachment = only a reference to a file in the storage (no inline data, no outside URL) */
            if (t === 'img') {
                if (typeof b.fileId !== 'string' || !FILE_ID_RE.test(b.fileId))
                    throw new Error('RICHTEXT_FILE_REF_INVALID');
                const o = { t, fileId: b.fileId };
                if (b.alt)
                    o.alt = String(b.alt).slice(0, 200);
                const w = Number(b.w);
                if (IMG_W.includes(w))
                    o.w = w;
                if (ALIGN.includes(b.align))
                    o.align = b.align;
                return o;
            }
            if (t === 'file') {
                if (typeof b.fileId !== 'string' || !FILE_ID_RE.test(b.fileId))
                    throw new Error('RICHTEXT_FILE_REF_INVALID');
                return { t, fileId: b.fileId, name: String(b.name || '').slice(0, 200), size: Math.max(0, Math.floor(Number(b.size) || 0)) };
            }
            if (t === 'table') {
                if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > MAX_ROWS)
                    throw new Error('RICHTEXT_TABLE_INVALID');
                const cols = Math.min(MAX_COLS, Math.max(...b.rows.map((r) => Array.isArray(r) ? r.length : 0)));
                if (!cols)
                    throw new Error('RICHTEXT_TABLE_INVALID');
                return { t, head: b.head === true, rows: b.rows.map((r) => Array.from({ length: cols }, (_, i) => ({ runs: cleanRuns(Array.isArray(r) ? r[i]?.runs : []) }))) };
            }
            if (LISTS.includes(t)) {
                if (!Array.isArray(b.items) || b.items.length > MAX_ITEMS)
                    throw new Error('RICHTEXT_LIST_INVALID');
                return { t, items: b.items.map((it) => {
                        const o = { runs: cleanRuns(it?.runs) };
                        if (t === 'todo')
                            o.checked = it?.checked === true;
                        const lv = Number(it?.level) || 0;
                        if (lv > 0)
                            o.level = Math.min(6, Math.max(0, Math.floor(lv)));
                        /* N2.3c: stable item id + link to the record created from the line (task / shopping / event / reminder) */ if (typeof it?.id === 'string' && ITEM_ID_RE.test(it.id))
                            o.id = it.id;
                        /* several links per line (one per kind); a legacy single `link` is converted */ const raw = [...(Array.isArray(it?.links) ? it.links : []), ...(it?.link ? [it.link] : [])];
                        const seen = new Set();
                        const lkey = (l) => ['DEADLINE', 'STEP'].includes(l.kind) ? l.kind + ':' + String(l.id).split('#')[0] : l.kind === 'RECORD' ? l.kind + ':' + l.id : l.kind;
                        const links = raw.filter((l) => l && LINK_KINDS.includes(l.kind) && typeof l.id === 'string' && l.id.length <= 120 && !seen.has(lkey(l)) && seen.add(lkey(l))).slice(0, 8).map((l) => ({ kind: l.kind, id: l.id }));
                        if (o.id && links.length)
                            o.links = links;
                        return o;
                    }) };
            }
            const o = { t, runs: cleanRuns(b.runs) };
            if (t === 'callout')
                o.kind = CALLOUTS.includes(b.kind) ? b.kind : 'info';
            if (ALIGN.includes(b.align) && b.align !== 'left')
                o.align = b.align;
            return o;
        });
        const out = { schema: 'KX.RICHTEXT/1', blocks };
        if (JSON.stringify(out).length > MAX_DOC_CHARS)
            throw new Error('RICHTEXT_TOO_LARGE');
        return out;
    }
    /* N2.5z: tables, attachment names and image captions are searchable and carry tags too */
    const runsOf = (doc) => (doc?.blocks || []).flatMap((b) => b.runs || (b.t === 'table' ? (b.rows || []).flatMap((r) => r.flatMap((c) => c.runs || [])) : (b.items || []).flatMap((i) => i.runs || [])));
    function docText(doc) { return (doc?.blocks || []).map((b) => b.runs ? b.runs.map((r) => r.text).join('') : b.t === 'table' ? (b.rows || []).map((r) => r.map((x) => (x.runs || []).map((q) => q.text).join('')).join(' | ')).join('\n') : b.t === 'file' ? String(b.name || '') : b.t === 'img' ? String(b.alt || '') : (b.items || []).map((i) => (i.runs || []).map((r) => r.text).join('')).join('\n')).join('\n'); }
    function docTags(doc) { const s = new Set(); for (const r of runsOf(doc))
        if (r.tag)
            s.add(r.tag); for (const m of docText(doc).matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{2,40})/gu))
        s.add(m[1]); return [...s].slice(0, 100); }
    function openTodos(doc) { return (doc?.blocks || []).filter((b) => b.t === 'todo').reduce((n, b) => n + (b.items || []).filter((i) => !i.checked).length, 0); }
    // ---------- rendering (Shell): structured document → escaped HTML for the editor ----------
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cssColor = (c) => THEME_COLORS.includes(c) ? `var(--${c === 'danger' ? 'danger,#e06c75' : c === 'success' ? 'success,#98c379' : c === 'warning' ? 'warning,#e5c07b' : c})` : c;
    const TXT = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const BADGE_LABEL = new Proxy({}, { get: (_t, k) => TXT('notes.badge.' + String(k), String(k)) });
    function runHtml(r) {
        if (r.badge)
            return `<span class="kx-badge kx-badge-${r.badge}" data-badge="${r.badge}" contenteditable="false">${esc(r.text || BADGE_LABEL[r.badge])}</span>`;
        let h = esc(r.text).replace(/\n/g, '<br>');
        if (r.tag)
            return `<span class="kx-tag" data-tag="${esc(r.tag)}">${h || '#' + esc(r.tag)}</span>`;
        if (r.code)
            h = `<code>${h}</code>`;
        if (r.sup)
            h = `<sup>${h}</sup>`;
        if (r.sub)
            h = `<sub>${h}</sub>`;
        if (r.s)
            h = `<s>${h}</s>`;
        if (r.u)
            h = `<u>${h}</u>`;
        if (r.i)
            h = `<i>${h}</i>`;
        if (r.b)
            h = `<b>${h}</b>`;
        const st = [r.color ? `color:${cssColor(r.color)}` : '', r.bg ? `background-color:${cssColor(r.bg)}` : ''].filter(Boolean).join(';');
        if (st || r.size)
            h = `<span${st ? ` style="${st}"` : ''}${r.size ? ` data-size="${r.size}"` : ''}${r.color ? ` data-color="${r.color}"` : ''}${r.bg ? ` data-bg="${r.bg}"` : ''}>${h}</span>`;
        if (r.link)
            h = `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${h}</a>`;
        return h;
    }
    const runsHtml = (runs) => runs.map(runHtml).join('') || '<br>';
    function toHtml(doc) {
        const d = validateDoc(doc);
        return d.blocks.map((b) => {
            const al = b.align ? ` style="text-align:${b.align}"` : '';
            if (b.t === 'hr')
                return '<hr>';
            if (b.t === 'img')
                return `<figure data-block="img" data-file-id="${esc(b.fileId)}"${b.w ? ` data-w="${b.w}"` : ''}${b.align ? ` data-align="${b.align}"` : ''} contenteditable="false" class="kx-note-img"><img alt="${esc(b.alt || '')}" data-kx-file="${esc(b.fileId)}"></figure>`;
            if (b.t === 'file')
                return `<div data-block="file" data-file-id="${esc(b.fileId)}" data-name="${esc(b.name)}" data-size="${b.size}" contenteditable="false" class="kx-note-file">📎 <b>${esc(b.name)}</b> <small>${b.size >= 1048576 ? (b.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b.size / 1024)) + ' kB'}</small></div>`;
            if (b.t === 'table')
                return `<table data-block="table" class="kx-note-table"${b.head ? ' data-head="1"' : ''}><tbody>${b.rows.map((r, ri) => `<tr>${r.map((c) => `<${b.head && ri === 0 ? 'th' : 'td'}>${runsHtml(c.runs) || '<br>'}</${b.head && ri === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table>`;
            if (LISTS.includes(b.t)) {
                const tag = b.t === 'ol' ? 'ol' : 'ul';
                return `<${tag}${b.t === 'todo' ? ' data-todo="1"' : ''}>${b.items.map((i) => `<li${i.id ? ` data-id="${esc(i.id)}"` : ''}${i.links ? ` data-links="${esc(i.links.map((l) => l.kind + ':' + l.id).join(';'))}"` : ''}${b.t === 'todo' ? ` data-checked="${i.checked ? '1' : '0'}"` : ''}${i.level ? ` data-level="${i.level}"` : ''}>${runsHtml(i.runs)}${(i.links || []).map((l) => `<span class="kx-linkmark" data-linkmark="${esc(l.kind)}" contenteditable="false">↗ ${esc(TXT('notes.link.' + l.kind, l.kind))}</span>`).join('')}</li>`).join('')}</${tag}>`;
            }
            if (b.t === 'callout')
                return `<div data-callout="${b.kind}" class="kx-callout kx-callout-${b.kind}"${al}>${runsHtml(b.runs)}</div>`;
            if (b.t === 'code')
                return `<pre data-block="code"${al}>${runsHtml(b.runs)}</pre>`;
            const tag = b.t === 'quote' ? 'blockquote' : b.t;
            return `<${tag}${al}>${runsHtml(b.runs)}</${tag}>`;
        }).join('') || '<p><br></p>';
    }
    // ---------- editor DOM → structured document (browser only; anything unknown becomes plain text) ----------
    const newItemId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    function rgbToHex(v) { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v || ''); if (!m)
        return /^#[0-9a-f]{6}$/i.test(v) ? v : undefined; if (m[4] !== undefined && Number(m[4]) === 0)
        return undefined; return '#' + [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join(''); }
    function fromDom(root) {
        const blocks = [];
        const inline = (node, marks, out) => {
            for (const n of Array.from(node.childNodes)) {
                if (n.nodeType === 3) {
                    if (n.nodeValue)
                        out.push({ ...marks, text: n.nodeValue });
                    continue;
                }
                if (n.nodeType !== 1)
                    continue;
                if (n.dataset?.linkmark !== undefined)
                    continue; /* the link mark is display only */
                const tg = n.tagName.toLowerCase();
                if (tg === 'br') {
                    out.push({ ...marks, text: '\n' });
                    continue;
                }
                if (n.dataset?.badge) {
                    out.push({ text: n.textContent || '', badge: n.dataset.badge });
                    continue;
                }
                if (n.dataset?.tag) {
                    out.push({ ...marks, text: n.textContent || '', tag: n.dataset.tag });
                    continue;
                }
                const m = { ...marks };
                if (tg === 'b' || tg === 'strong')
                    m.b = true;
                if (tg === 'i' || tg === 'em')
                    m.i = true;
                if (tg === 'u')
                    m.u = true;
                if (tg === 's' || tg === 'strike' || tg === 'del')
                    m.s = true;
                if (tg === 'code')
                    m.code = true;
                if (tg === 'sup')
                    m.sup = true;
                if (tg === 'sub')
                    m.sub = true;
                if (tg === 'a' && n.getAttribute('href'))
                    m.link = n.getAttribute('href');
                const st = n.style || {};
                if (n.dataset?.color)
                    m.color = n.dataset.color;
                else if (st.color)
                    m.color = rgbToHex(st.color);
                if (tg === 'font' && n.getAttribute('color'))
                    m.color = rgbToHex(n.getAttribute('color')) || n.getAttribute('color');
                if (n.dataset?.bg)
                    m.bg = n.dataset.bg;
                else if (st.backgroundColor)
                    m.bg = rgbToHex(st.backgroundColor);
                if (n.dataset?.size)
                    m.size = n.dataset.size;
                if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600)
                    m.b = true;
                if (st.fontStyle === 'italic')
                    m.i = true;
                if (String(st.textDecorationLine || st.textDecoration || '').includes('underline'))
                    m.u = true;
                if (String(st.textDecorationLine || st.textDecoration || '').includes('line-through'))
                    m.s = true;
                inline(n, m, out);
            }
        };
        const merge = (runs) => {
            const out = [];
            for (const r of runs) {
                const p = out[out.length - 1];
                const same = p && !p.badge && !r.badge && !p.tag && !r.tag && JSON.stringify({ ...p, text: '' }) === JSON.stringify({ ...r, text: '' });
                if (same)
                    p.text += r.text;
                else
                    out.push({ ...r });
            }
            while (out.length && !out[out.length - 1].badge && /^\n+$/.test(out[out.length - 1].text))
                out.pop();
            return out;
        };
        const runsOf = (n) => merge((() => { const o = []; inline(n, {}, o); return o; })());
        const align = (n) => { const a = n.style?.textAlign; return ALIGN.includes(a) && a !== 'left' ? a : undefined; };
        const block = (n) => {
            if (n.nodeType === 3) {
                if ((n.nodeValue || '').trim())
                    blocks.push({ t: 'p', runs: [{ text: n.nodeValue }] });
                return;
            }
            if (n.nodeType !== 1)
                return;
            const tg = n.tagName.toLowerCase();
            if (tg === 'hr') {
                blocks.push({ t: 'hr' });
                return;
            }
            /* N2.5z: image / attachment blocks keep only the file reference; a pasted HTML table (Excel, Word, web) becomes a table block */
            if (n.dataset?.block === 'img' && n.dataset.fileId) {
                blocks.push({ t: 'img', fileId: n.dataset.fileId, alt: n.querySelector?.('img')?.getAttribute('alt') || '', w: Number(n.dataset.w) || undefined, align: n.dataset.align || undefined });
                return;
            }
            if (n.dataset?.block === 'file' && n.dataset.fileId) {
                blocks.push({ t: 'file', fileId: n.dataset.fileId, name: n.dataset.name || '', size: Number(n.dataset.size) || 0 });
                return;
            }
            if (tg === 'table') {
                const trs = Array.from(n.querySelectorAll('tr')).slice(0, MAX_ROWS);
                const rows = trs.map((tr) => Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName)).slice(0, MAX_COLS).map((c) => ({ runs: runsOf(c) })));
                if (rows.length && rows.some((r) => r.length)) {
                    blocks.push({ t: 'table', head: !!trs[0]?.querySelector('th') || n.dataset?.head === '1', rows: rows.map((r) => r.length ? r : [{ runs: [] }]) });
                    return;
                }
            }
            if (tg === 'img') {
                return;
            } /* a bare pasted <img> (outside image) is dropped – images come in via the file storage */
            if (tg === 'ul' || tg === 'ol') {
                const todo = n.dataset?.todo === '1';
                blocks.push({ t: todo ? 'todo' : tg, items: Array.from(n.children).filter((li) => li.tagName === 'LI').map((li) => ({ runs: runsOf(li), checked: li.dataset?.checked === '1', level: Number(li.dataset?.level) || 0, id: li.dataset?.id || newItemId(), links: String(li.dataset?.links || '').split(';').filter(Boolean).map((x) => { const i = x.indexOf(':'); return { kind: x.slice(0, i), id: x.slice(i + 1) }; }) })) });
                return;
            }
            if (n.dataset?.callout) {
                blocks.push({ t: 'callout', kind: n.dataset.callout, runs: runsOf(n) });
                return;
            }
            const map = { h1: 'h1', h2: 'h2', h3: 'h3', blockquote: 'quote', pre: 'code', p: 'p' };
            /* browsers nest blocks inside a paragraph (<p><ul>…</ul></p> after "list" in an empty line) – split it into its blocks */
            const hasBlockKids = (x) => Array.from(x.childNodes).some((k) => k.nodeType === 1 && /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|PRE|HR|DIV)$/.test(k.tagName));
            if ((tg === 'p' || tg === 'blockquote') && hasBlockKids(n)) {
                const inl = [];
                const flush = () => { if (inl.length) {
                    const w = { childNodes: inl.splice(0) };
                    const r = runsOf(w);
                    if (r.length)
                        blocks.push({ t: map[tg], runs: r });
                } };
                for (const k of Array.from(n.childNodes)) {
                    if (k.nodeType === 1 && /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|PRE|HR|DIV)$/.test(k.tagName)) {
                        flush();
                        block(k);
                    }
                    else
                        inl.push(k);
                }
                flush();
                return;
            }
            if (map[tg]) {
                blocks.push({ t: map[tg], runs: runsOf(n), align: align(n) });
                return;
            }
            if (tg === 'div') {
                const kids = Array.from(n.childNodes);
                if (kids.some((k) => k.nodeType === 1 && /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|PRE|HR|DIV)$/.test(k.tagName))) {
                    kids.forEach(block);
                    return;
                }
                blocks.push({ t: 'p', runs: runsOf(n), align: align(n) });
                return;
            }
            blocks.push({ t: 'p', runs: runsOf({ childNodes: [n] }) });
        };
        Array.from(root.childNodes).forEach(block);
        return validateDoc({ schema: 'KX.RICHTEXT/1', blocks: blocks.filter((b) => b.t === 'hr' || b.t === 'img' || b.t === 'file' || b.t === 'table' || LISTS.includes(b.t) || b.runs?.length || b.t !== 'p') });
    }
    // ---------- service ----------
    class NotesService {
        core;
        constructor(core) { this.core = core; }
        async personal(actorId) { const s = (await this.core.memberships.listSpaces()).find((x) => x.kind === 'PERSONAL' && x.ownerUserId === actorId && !x.archivedAt); if (!s)
            throw new Error('NOTES_NO_PERSONAL_SPACE'); return s.id; }
        async spaces(actorId) {
            const out = [];
            for (const sp of await this.core.memberships.listSpaces()) {
                if (sp.archivedAt)
                    continue;
                if (sp.kind === 'PERSONAL') {
                    if (sp.ownerUserId === actorId)
                        out.push({ id: sp.id, name: sp.name || TXT('notes.default.space', 'Personal'), kind: sp.kind });
                    continue;
                }
                if (['EDIT', 'MANAGE'].includes(await this.core.memberships.roleFor(sp.id, actorId)))
                    out.push({ id: sp.id, name: sp.name || sp.id, kind: sp.kind });
            }
            return out;
        }
        async can(r, actorId, level) { return await this.core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actorId, level) === true; }
        async row(id, type, actorId, level) { const r = await this.core.entities.get(String(id || '')); if (!r || r.type !== type || r.archivedAt)
            throw new Error('NOTES_NOT_FOUND'); if (!await this.can(r, actorId, level))
            throw new Error(`Scope denied: ${level} required`); return r; }
        name(v, fallback) { const n = String(v ?? '').trim().slice(0, MAX_NAME); return n || fallback; }
        async put(r, data, ctx, extra = {}) { return this.core.entities.save({ id: r.id, type: r.type, ownerApp: r.ownerApp, schema: r.schema, spaceIds: r.spaceIds, expectedRevision: extra.expectedRevision ?? r.revision, data: { ...r.data, ...data }, ...(extra.archivedAt ? { archivedAt: extra.archivedAt } : {}) }, ctx); }
        async createBook(input, ctx) {
            let spaceIds = Array.isArray(input?.spaceIds) && input.spaceIds.length ? [...new Set(input.spaceIds.map(String))] : [await this.personal(ctx.actorId)];
            const ok = new Set((await this.spaces(ctx.actorId)).map((x) => x.id));
            if (spaceIds.some((x) => !ok.has(x)))
                throw new Error('Scope denied: EDIT required in the target space');
            const books = (await this.core.entities.list()).filter((r) => r.type === T_BOOK && !r.archivedAt).length;
            return this.core.entities.save({ type: T_BOOK, ownerApp: OWNER, schema: CONTRACT, spaceIds, data: { name: this.name(input?.name, TXT('notes.default.book', 'Notebook')), color: color(input?.color) || PALETTE[books % PALETTE.length], order: books } }, ctx);
        }
        async createSection(input, ctx) {
            const b = await this.row(input?.bookId, T_BOOK, ctx.actorId, 'EDIT');
            const n = (await this.core.entities.list()).filter((r) => r.type === T_SEC && !r.archivedAt && r.data?.bookId === b.id).length;
            return this.core.entities.save({ type: T_SEC, ownerApp: OWNER, schema: CONTRACT, spaceIds: b.spaceIds, data: { bookId: b.id, name: this.name(input?.name, TXT('notes.default.section', 'Section')), color: color(input?.color) || PALETTE[(n + 3) % PALETTE.length], order: n } }, ctx);
        }
        async createPage(input, ctx) {
            const sec = await this.row(input?.sectionId, T_SEC, ctx.actorId, 'EDIT');
            let parentId = null;
            if (input?.parentId) {
                const p = await this.row(input.parentId, T_PAGE, ctx.actorId, 'READ');
                if (p.data?.sectionId !== sec.id)
                    throw new Error('NOTES_PARENT_OTHER_SECTION');
                parentId = p.id;
            }
            const doc = validateDoc(input?.doc ?? null);
            const n = (await this.core.entities.list()).filter((r) => r.type === T_PAGE && !r.archivedAt && r.data?.sectionId === sec.id).length;
            return this.core.entities.save({ type: T_PAGE, ownerApp: OWNER, schema: CONTRACT, spaceIds: sec.spaceIds, data: { sectionId: sec.id, bookId: sec.data.bookId, parentId, title: this.name(input?.title, TXT('notes.default.page', 'Untitled')), doc, tags: docTags(doc), openTodos: openTodos(doc), pinned: false, order: n, editedBy: ctx.actorId, editedAt: new Date().toISOString() } }, ctx);
        }
        async savePage(input, ctx) {
            const r = await this.row(input?.id, T_PAGE, ctx.actorId, 'EDIT');
            if (input?.expectedRevision != null && Number(input.expectedRevision) !== r.revision)
                throw new Error('NOTES_REVISION_CONFLICT: the page changed meanwhile');
            const doc = input?.doc !== undefined ? this.keepKnownLinks(validateDoc(input.doc), r.data.doc, input?._allowLinks || {}) : r.data.doc;
            if (input?.doc !== undefined)
                await this.pushTicks(doc, r.data.doc, ctx);
            const title = input?.title !== undefined ? this.name(input.title, TXT('notes.default.page', 'Untitled')) : r.data.title;
            const changed = JSON.stringify(doc) !== JSON.stringify(r.data.doc) || title !== r.data.title;
            if (changed)
                await this.version(r, ctx);
            const pinned = input?.pinned !== undefined ? input.pinned === true : r.data.pinned;
            return this.put(r, { title, doc, tags: docTags(doc), openTodos: openTodos(doc), pinned, editedBy: ctx.actorId, editedAt: new Date().toISOString() }, ctx);
        }
        async version(r, ctx) {
            await this.core.entities.save({ type: T_VER, ownerApp: OWNER, schema: CONTRACT, spaceIds: r.spaceIds, data: { pageId: r.id, pageRevision: r.revision, title: r.data.title, doc: r.data.doc, savedAt: r.data.editedAt || r.updatedAt || new Date().toISOString(), savedBy: r.data.editedBy || ctx.actorId } }, ctx);
            const vers = (await this.core.entities.list()).filter((v) => v.type === T_VER && !v.archivedAt && v.data?.pageId === r.id).sort((a, b) => String(b.data.savedAt).localeCompare(String(a.data.savedAt)) || b.data.pageRevision - a.data.pageRevision);
            for (const old of vers.slice(MAX_VERSIONS))
                await this.core.entities.save({ id: old.id, type: T_VER, ownerApp: old.ownerApp, schema: old.schema, spaceIds: old.spaceIds, expectedRevision: old.revision, archivedAt: new Date().toISOString(), data: old.data }, ctx);
        }
        /* ---------- N2.3c: line actions (task / shopping / event / reminder) + two-way ticking ---------- */
        items(doc) { return (doc?.blocks || []).flatMap((b) => (b.items || []).map((it) => ({ it, todo: b.t === 'todo' }))); }
        /* links survive only if the same item already had them (or a line action just created them) – a pasted link is dropped */
        keepKnownLinks(doc, prev, allow = {}) {
            const known = new Map();
            const key = (l) => l.kind + ':' + l.id;
            for (const { it } of this.items(prev))
                if (it.id && it.links)
                    known.set(it.id, new Set(it.links.map(key)));
            for (const { it } of this.items(doc)) {
                if (!it.links)
                    continue;
                const ok = new Set([...(known.get(it.id) || []), ...((allow[it.id] || []).map(key))]);
                it.links = it.links.filter((l) => ok.has(key(l)));
                if (!it.links.length)
                    delete it.links;
            }
            return doc;
        }
        async linkedTasks(it) { const out = []; for (const l of it.links || []) {
            if (!['TASK', 'SHOPPING'].includes(l.kind))
                continue;
            const t = await this.core.tasks.get(l.id);
            if (t && !t.archivedAt)
                out.push(t);
        } return out; }
        async pullTicks(doc) { for (const { it, todo } of this.items(doc)) {
            if (!todo || !it.links)
                continue;
            const ts = await this.linkedTasks(it);
            if (ts.length) {
                it.checked = ts[0].status === 'DONE';
                continue;
            }
            for (const l of it.links) {
                if (!['DEADLINE', 'STEP'].includes(l.kind) || !this.core.propagate)
                    continue;
                const d = await this.core.propagate.itemDone(l);
                if (d !== null) {
                    it.checked = d;
                    break;
                }
            }
        } return doc; }
        /* compare with the EFFECTIVE previous state – a linked line shows its task's state, not the stored one */
        async pushTicks(doc, prev, ctx) { if (this.core.propagate?.quietly)
            return this.core.propagate.quietly(() => this.pushTicksRaw(doc, prev, ctx)); return this.pushTicksRaw(doc, prev, ctx); }
        async pushTicksRaw(doc, prev, ctx) {
            const before = new Map();
            const eff = await this.pullTicks(JSON.parse(JSON.stringify(prev || { blocks: [] })));
            for (const { it, todo } of this.items(eff))
                if (todo && it.id)
                    before.set(it.id, !!it.checked);
            for (const { it, todo } of this.items(doc)) {
                if (!todo || !it.links || !before.has(it.id) || before.get(it.id) === !!it.checked)
                    continue;
                /* a ticked line also completes linked deadlines / process steps (completing is one-way: a recurring deadline moves on) */ if (it.checked && this.core.propagate)
                    for (const l of it.links)
                        if (['DEADLINE', 'STEP'].includes(l.kind) && await this.core.propagate.itemDone(l) === false)
                            await this.core.propagate.completeItem(l, ctx);
                for (const t of await this.linkedTasks(it)) {
                    if (it.checked && t.status !== 'DONE')
                        await this.core.tasks.complete(t.id, ctx);
                    else if (!it.checked && t.status === 'DONE')
                        await this.core.tasks.save({ id: t.id, title: t.title, ownerApp: t.ownerApp, spaceIds: t.spaceIds, status: 'TODO', ...(t.itemKind ? { itemKind: t.itemKind } : {}) }, ctx);
                }
            }
        }
        /* one line → several places at once (TASK / SHOPPING / EVENT / REMINDER), each kind once; records + relation graph via CORE.PROPAGATE */
        /* one line → several places at once (core kinds, deadlines in hub records, new hub records, process steps; space choice); via CORE.PROPAGATE */
        async lineAction(input, ctx) {
            const r = await this.row(input?.pageId, T_PAGE, ctx.actorId, 'EDIT');
            const P = this.core.propagate;
            if (!P)
                throw new Error('NOTES_PROPAGATE_UNAVAILABLE');
            const targets = Array.isArray(input?.targets) ? input.targets.map((t) => ({ kind: String(t?.kind || ''), at: t?.at || input?.at || null, place: t?.place || null, spaceId: t?.spaceId || input?.spaceId || null })) : (Array.isArray(input?.kinds) ? input.kinds : input?.kind ? [input.kind] : []).map((k) => ({ kind: String(k), at: input?.at || null, place: null, spaceId: input?.spaceId || null }));
            if (!targets.length || targets.length > 8 || targets.some(t => !LINK_KINDS.includes(t.kind)))
                throw new Error('NOTES_LINE_KIND_INVALID');
            const keys = targets.map(t => P.keyOf(t));
            if (new Set(keys).size !== keys.length)
                throw new Error('NOTES_LINE_KIND_INVALID');
            const doc = JSON.parse(JSON.stringify(r.data.doc));
            const hit = this.items(doc).find((x) => x.it.id === input?.itemId);
            if (!hit)
                throw new Error('NOTES_LINE_NOT_FOUND');
            const have = new Set((hit.it.links || []).map((l) => ['DEADLINE', 'STEP'].includes(l.kind) ? l.kind + ':' + String(l.id).split('#')[0] : l.kind === 'RECORD' ? 'RECORD:' + l.id : l.kind + ':'));
            const dup = targets.find(t => have.has(['DEADLINE', 'STEP'].includes(t.kind) ? P.keyOf(t) : t.kind === 'RECORD' ? '__new__' : t.kind + ':'));
            if (dup)
                throw new Error('NOTES_LINE_ALREADY_LINKED: ' + dup.kind);
            const title = (hit.it.runs || []).map((x) => x.text).join('').replace(/\s+/g, ' ').trim().slice(0, 200);
            if (!title)
                throw new Error('NOTES_LINE_EMPTY');
            for (const t of targets) {
                if (['EVENT', 'REMINDER', 'DEADLINE'].includes(t.kind) && !t.at)
                    throw new Error('NOTES_LINE_TIME_REQUIRED');
                if (t.at && !Number.isFinite(new Date(t.at).getTime()))
                    throw new Error('NOTES_LINE_TIME_INVALID');
            }
            const added = [];
            for (const t of targets)
                added.push(await P.createTarget({ kind: t.kind, title, spaceIds: r.spaceIds, ownerApp: 'APP.KX.NOTES', at: t.at, done: !!hit.it.checked, source: { type: T_PAGE, id: r.id }, place: t.place, spaceId: t.spaceId }, ctx));
            hit.it.links = [...(hit.it.links || []), ...added];
            const saved = await this.savePage({ id: r.id, doc, expectedRevision: r.revision, _allowLinks: { [hit.it.id]: added } }, ctx);
            return { links: hit.it.links, link: added[0], revision: saved.revision };
        }
        /* N2.3f: a propagated record lands as a checklist line at the end of a page (kept in history like any edit) */
        async appendLine(input, ctx) {
            const r = await this.row(input?.pageId, T_PAGE, ctx.actorId, 'EDIT');
            const doc = JSON.parse(JSON.stringify(r.data.doc));
            const text = String(input?.text || '').slice(0, MAX_TEXT);
            if (!text.trim())
                throw new Error('NOTES_LINE_EMPTY');
            const itemId = newItemId();
            let last = doc.blocks[doc.blocks.length - 1];
            if (!last || last.t !== 'todo') {
                last = { t: 'todo', items: [] };
                doc.blocks.push(last);
            }
            last.items.push({ id: itemId, runs: [{ text }], checked: input?.checked === true });
            await this.savePage({ id: r.id, doc, expectedRevision: r.revision }, ctx);
            return { pageId: r.id, itemId };
        }
        async setLineChecked(input, ctx) {
            const r = await this.row(input?.pageId, T_PAGE, ctx.actorId, 'EDIT');
            const doc = JSON.parse(JSON.stringify(r.data.doc));
            let hit = false;
            for (const b of doc.blocks)
                if (b.t === 'todo')
                    for (const it of b.items || [])
                        if (it.id === input?.itemId) {
                            it.checked = input?.checked === true;
                            hit = true;
                        }
            if (!hit)
                throw new Error('NOTES_LINE_NOT_FOUND');
            await this.put(r, { doc }, ctx);
            return { checked: input?.checked === true };
        }
        /* N2.3e: remove a link (unlinked propagation) from every line of a page */
        async dropLinks(pageId, targetId, ctx) {
            const r = await this.core.entities.get(pageId);
            if (!r || r.type !== T_PAGE || r.archivedAt)
                return { dropped: 0 };
            const doc = JSON.parse(JSON.stringify(r.data.doc));
            let n = 0;
            for (const { it } of this.items(doc)) {
                if (!it.links)
                    continue;
                const before = it.links.length;
                it.links = it.links.filter((l) => l.id !== targetId);
                n += before - it.links.length;
                if (!it.links.length)
                    delete it.links;
            }
            if (n)
                await this.put(r, { doc }, ctx);
            return { dropped: n };
        }
        async history(pageId, actorId) {
            const p = await this.row(pageId, T_PAGE, actorId, 'READ');
            return (await this.core.entities.list()).filter((v) => v.type === T_VER && !v.archivedAt && v.data?.pageId === p.id)
                .sort((a, b) => b.data.pageRevision - a.data.pageRevision).map((v) => ({ id: v.id, pageRevision: v.data.pageRevision, title: v.data.title, savedAt: v.data.savedAt, savedBy: v.data.savedBy, chars: docText(v.data.doc).length }));
        }
        async restore(input, ctx) {
            const v = await this.core.entities.get(String(input?.versionId || ''));
            if (!v || v.type !== T_VER || v.archivedAt)
                throw new Error('NOTES_VERSION_NOT_FOUND');
            const r = await this.row(v.data.pageId, T_PAGE, ctx.actorId, 'EDIT');
            return this.savePage({ id: r.id, title: v.data.title, doc: v.data.doc }, ctx);
        }
        async rename(input, ctx) {
            const r = await this.core.entities.get(String(input?.id || ''));
            if (!r || ![T_BOOK, T_SEC, T_PAGE].includes(r.type) || r.archivedAt)
                throw new Error('NOTES_NOT_FOUND');
            if (!await this.can(r, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            const patch = r.type === T_PAGE ? { title: this.name(input?.name, r.data.title) } : { name: this.name(input?.name, r.data.name) };
            if (input?.color !== undefined && r.type !== T_PAGE) {
                const c = color(input.color);
                if (c)
                    patch.color = c;
            }
            if (r.type === T_PAGE)
                return this.savePage({ id: r.id, title: patch.title }, ctx);
            return this.put(r, patch, ctx);
        }
        async movePage(input, ctx) {
            const r = await this.row(input?.id, T_PAGE, ctx.actorId, 'EDIT');
            const sec = input?.sectionId ? await this.row(input.sectionId, T_SEC, ctx.actorId, 'EDIT') : await this.row(r.data.sectionId, T_SEC, ctx.actorId, 'EDIT');
            let parentId = input?.parentId ?? null;
            if (parentId) {
                const p = await this.row(parentId, T_PAGE, ctx.actorId, 'READ');
                if (p.data.sectionId !== sec.id)
                    throw new Error('NOTES_PARENT_OTHER_SECTION');
                let q = p;
                while (q) {
                    if (q.id === r.id)
                        throw new Error('NOTES_PARENT_CYCLE');
                    q = q.data.parentId ? await this.core.entities.get(q.data.parentId) : null;
                }
            }
            const data = { sectionId: sec.id, bookId: sec.data.bookId, parentId };
            if (Number.isFinite(Number(input?.order)))
                data.order = Number(input.order);
            return this.core.entities.save({ id: r.id, type: T_PAGE, ownerApp: r.ownerApp, schema: r.schema, spaceIds: sec.spaceIds, expectedRevision: r.revision, data: { ...r.data, ...data } }, ctx);
        }
        async archive(input, ctx) {
            const r = await this.core.entities.get(String(input?.id || ''));
            if (!r || ![T_BOOK, T_SEC, T_PAGE].includes(r.type) || r.archivedAt)
                throw new Error('NOTES_NOT_FOUND');
            if (!await this.can(r, ctx.actorId, 'EDIT'))
                throw new Error('Scope denied: EDIT required');
            const at = new Date().toISOString();
            const all = await this.core.entities.list();
            const ids = new Set([r.id]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const x of all) {
                    if (ids.has(x.id) || x.archivedAt)
                        continue;
                    const d = x.data || {};
                    if ((x.type === T_SEC && ids.has(d.bookId)) || (x.type === T_PAGE && (ids.has(d.sectionId) || ids.has(d.parentId) || ids.has(d.bookId)))) {
                        ids.add(x.id);
                        grew = true;
                    }
                }
            }
            for (const id of ids) {
                const x = all.find((y) => y.id === id);
                if (x && !x.archivedAt)
                    await this.put(x, {}, ctx, { archivedAt: at });
            }
            return { archived: ids.size };
        }
        async tree(actorId) {
            const all = (await this.core.entities.list()).filter((r) => [T_BOOK, T_SEC, T_PAGE].includes(r.type) && !r.archivedAt);
            const vis = [];
            for (const r of all)
                if (await this.can(r, actorId, 'READ'))
                    vis.push(r);
            const by = (t) => vis.filter(r => r.type === t).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || String(a.data.name || a.data.title).localeCompare(String(b.data.name || b.data.title), 'cs'));
            const pages = by(T_PAGE).map((p) => ({ id: p.id, title: p.data.title, sectionId: p.data.sectionId, parentId: p.data.parentId, pinned: !!p.data.pinned, tags: p.data.tags || [], openTodos: p.data.openTodos || 0, revision: p.revision, editedAt: p.data.editedAt }));
            return by(T_BOOK).map((b) => ({ id: b.id, name: b.data.name, color: b.data.color, spaceIds: b.spaceIds, sections: by(T_SEC).filter((s) => s.data.bookId === b.id).map((s) => ({ id: s.id, name: s.data.name, color: s.data.color, pages: pages.filter((p) => p.sectionId === s.id) })) }));
        }
        async getPage(id, actorId) { const r = await this.row(id, T_PAGE, actorId, 'READ'); return { id: r.id, revision: r.revision, title: r.data.title, doc: await this.pullTicks(JSON.parse(JSON.stringify(r.data.doc))), tags: r.data.tags || [], pinned: !!r.data.pinned, sectionId: r.data.sectionId, bookId: r.data.bookId, parentId: r.data.parentId, editedAt: r.data.editedAt, editedBy: r.data.editedBy, canEdit: await this.can(r, actorId, 'EDIT') }; }
        async search(input, actorId) {
            const q = fold(String(input?.text || '').trim()), tag = input?.tag ? fold(String(input.tag).replace(/^#/, '')) : '';
            const out = [];
            for (const r of (await this.core.entities.list()).filter((x) => x.type === T_PAGE && !x.archivedAt)) {
                if (!await this.can(r, actorId, 'READ'))
                    continue;
                const text = docText(r.data.doc), tags = (r.data.tags || []).map(fold);
                if (tag && !tags.includes(tag))
                    continue;
                const hay = fold(r.data.title + '\n' + text);
                if (q && !hay.includes(q))
                    continue;
                const i = q ? hay.indexOf(q) : -1;
                out.push({ id: r.id, title: r.data.title, sectionId: r.data.sectionId, bookId: r.data.bookId, tags: r.data.tags || [], snippet: i >= 0 ? (r.data.title + '\n' + text).slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' ') : text.slice(0, 120).replace(/\s+/g, ' '), editedAt: r.data.editedAt });
            }
            return out.sort((a, b) => String(b.editedAt).localeCompare(String(a.editedAt))).slice(0, 200);
        }
        async tags(actorId) {
            const m = new Map();
            for (const r of (await this.core.entities.list()).filter((x) => x.type === T_PAGE && !x.archivedAt)) {
                if (!await this.can(r, actorId, 'READ'))
                    continue;
                for (const t of r.data.tags || [])
                    m.set(t, (m.get(t) || 0) + 1);
            }
            return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'cs'));
        }
    }
    NS.CONTRACT = CONTRACT;
    NS.BLOCKS = BLOCKS;
    NS.BADGES = BADGES;
    NS.CALLOUTS = CALLOUTS;
    NS.BADGE_LABEL = BADGE_LABEL;
    NS.PALETTE = PALETTE;
    NS.THEME_COLORS = THEME_COLORS;
    NS.validateDoc = validateDoc;
    NS.LINK_KINDS = LINK_KINDS;
    NS.docText = docText;
    NS.docTags = docTags;
    NS.toHtml = toHtml;
    NS.fromDom = fromDom;
    NS.NotesService = NotesService;
    NS.install = (core) => {
        if (core.notes)
            throw new Error('Notes already installed');
        if (!core?.entities?.save)
            throw new Error('Notes require Core entities');
        const svc = new NotesService(core);
        const reg = [];
        const defs = [['ACTION.CORE.NOTES.TREE', 'READ', (_p, c) => svc.tree(c.actorId)], ['ACTION.CORE.NOTES.SPACES', 'READ', (_p, c) => svc.spaces(c.actorId)],
            ['ACTION.CORE.NOTES.BOOK_CREATE', 'SAFE_WRITE', (p, c) => svc.createBook(p, c)], ['ACTION.CORE.NOTES.SECTION_CREATE', 'SAFE_WRITE', (p, c) => svc.createSection(p, c)], ['ACTION.CORE.NOTES.PAGE_CREATE', 'SAFE_WRITE', (p, c) => svc.createPage(p, c)],
            ['ACTION.CORE.NOTES.PAGE_GET', 'READ', (p, c) => svc.getPage(p?.id, c.actorId)], ['ACTION.CORE.NOTES.PAGE_SAVE', 'SAFE_WRITE', (p, c) => svc.savePage(p, c)], ['ACTION.CORE.NOTES.PAGE_MOVE', 'SAFE_WRITE', (p, c) => svc.movePage(p, c)],
            ['ACTION.CORE.NOTES.RENAME', 'SAFE_WRITE', (p, c) => svc.rename(p, c)], ['ACTION.CORE.NOTES.ARCHIVE', 'SAFE_WRITE', (p, c) => svc.archive(p, c)],
            ['ACTION.CORE.NOTES.SEARCH', 'READ', (p, c) => svc.search(p, c.actorId)], ['ACTION.CORE.NOTES.TAGS', 'READ', (_p, c) => svc.tags(c.actorId)],
            ['ACTION.CORE.NOTES.HISTORY', 'READ', (p, c) => svc.history(p?.id, c.actorId)], ['ACTION.CORE.NOTES.LINE_ACTION', 'SAFE_WRITE', (p, c) => svc.lineAction(p, c)], ['ACTION.CORE.NOTES.RESTORE', 'SAFE_WRITE', (p, c) => svc.restore(p, c)]];
        try {
            for (const [code, risk, h] of defs) {
                core.actions.register({ code, ownerApp: OWNER, risk, handler: h });
                reg.push(code);
            }
            core.notes = svc;
        }
        catch (e) {
            for (const c of reg)
                core.actions.unregister?.(c, OWNER);
            delete core.notes;
            throw e;
        }
        return svc;
    };
})(KXNotes || (KXNotes = {}));
