var KXNavigationVisual;
(function (NS) {
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    const uniq = (xs) => [...new Set((xs || []).map(String))];
    const family = (mode) => ({
        DASHBOARD_TILES: 'GRID', COMPACT_GRID: 'GRID', MOBILE_LAUNCHER: 'GRID', FAVORITES_HOME: 'GRID',
        SIDEBAR: 'SIDEBAR', TWO_LEVEL_SIDEBAR: 'SIDEBAR', MEGA_MENU: 'MEGA', DOCK: 'DOCK', COMMAND_PALETTE: 'COMMAND', ORBIT: 'ORBIT'
    }[mode] || 'GRID');
    const initials = (row) => String(row.label || row.itemCode || '?').replace(/^KalinumX\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase().slice(0, 2) || '•';
    function itemButton(row, variant = 'CARD', canDrag = true) {
        const targetAttr = row.kind === 'HUB' ? `data-nav-app="${esc(row.target)}"` : `data-nav-core="${esc(row.target)}"`;
        const flags = [row.pinned ? 'PIN' : '', row.favorite ? 'FAV' : '', row.recent ? 'RECENT' : '', row.contextual ? 'CTX' : ''].filter(Boolean).join(' ');
        const text = `${row.itemCode || ''} ${row.label || ''} ${row.subtitle || ''} ${(row.categoryCodes || []).join(' ')}`.toLowerCase();
        return `<button class="hub-nav-item hub-nav-${variant.toLowerCase()}" data-nav-item="${esc(row.itemCode)}" ${targetAttr} data-nav-categories="${esc((row.categoryCodes || []).join('|'))}" data-nav-text="${esc(text)}" data-nav-flags="${esc(flags)}" draggable="${canDrag ? 'true' : 'false'}" aria-label="${esc(row.label)}"><span class="hub-nav-glyph" aria-hidden="true">${esc(initials(row))}</span><span class="hub-nav-copy"><b>${esc(row.label)}</b><small>${esc(row.subtitle || '')}</small></span>${row.pinned ? '<i class="hub-nav-pin" title="Připnuto">●</i>' : row.favorite ? '<i class="hub-nav-pin" title="Oblíbené">★</i>' : ''}</button>`;
    }
    function groupSection(group, variant = 'CARD') {
        return `<section class="hub-nav-group" data-nav-group="${esc(group.category.code)}"><header><span>${esc(group.category.label)}</span><small>${group.items.length}</small></header><div class="hub-nav-group-items">${group.items.map((x) => itemButton(x, variant)).join('')}</div></section>`;
    }
    function grid(resolved, mode) {
        let rows = resolved.flat || [];
        if (mode === 'FAVORITES_HOME') {
            const selected = rows.filter((x) => x.favorite || x.pinned || x.required);
            rows = selected.length ? selected : rows.slice(0, 12);
            return `<div class="hub-nav-grid hub-nav-favorites">${rows.map((x) => itemButton(x, 'CARD')).join('')}</div>`;
        }
        if (mode === 'MOBILE_LAUNCHER')
            return `<div class="hub-nav-grid hub-nav-mobile">${rows.map((x) => itemButton(x, 'ICON')).join('')}</div>`;
        return `<div class="hub-nav-grid ${mode === 'COMPACT_GRID' ? 'hub-nav-compact' : ''}">${rows.map((x) => itemButton(x, mode === 'COMPACT_GRID' ? 'COMPACT' : 'CARD')).join('')}</div>`;
    }
    function sidebar(resolved) { return `<div class="hub-nav-sidebar"><div class="hub-nav-category-rail">${resolved.groups.map((g, i) => `<button data-nav-category-filter="${esc(g.category.code)}" class="${i === 0 ? 'active' : ''}"><span>${esc(g.category.label)}</span><small>${g.items.length}</small></button>`).join('')}<button data-nav-category-filter="ALL"><span>Všechny</span><small>${resolved.flat.length}</small></button></div><div class="hub-nav-sidebar-body">${resolved.groups.map((g) => groupSection(g, 'ROW')).join('')}</div></div>`; }
    function mega(resolved) { return `<div class="hub-nav-mega">${resolved.groups.map((g) => groupSection(g, 'COMPACT')).join('')}</div>`; }
    function dock(resolved) { const all = resolved.flat || [], preferred = all.filter((x) => x.pinned || x.favorite || x.required), rows = (preferred.length ? preferred : all).slice(0, 18); return `<div class="hub-nav-dock-stage"><div class="hub-nav-dock">${rows.map((x) => itemButton(x, 'DOCK')).join('')}</div><div class="hub-nav-dock-rest">${all.length > rows.length ? `${all.length - rows.length} dalších položek · použij hledání nebo jiný režim` : ''}</div></div>`; }
    function command(resolved) { return `<div class="hub-nav-command"><div class="hub-nav-command-hint">Ctrl/⌘ + K · ↑ ↓ · Enter</div><div class="hub-nav-command-list">${(resolved.flat || []).map((x) => itemButton(x, 'COMMAND')).join('')}</div></div>`; }
    function orbit(resolved) { const all = resolved.flat || [], preferred = all.filter((x) => x.pinned || x.favorite || x.required), ring = (preferred.length ? uniq(preferred.map((x) => x.itemCode)).map(code => all.find((x) => x.itemCode === code)).filter(Boolean) : all).slice(0, 10), rest = all.filter((x) => !ring.some((r) => r.itemCode === x.itemCode)); return `<div class="hub-nav-orbit"><div class="hub-nav-orbit-ring" style="--orbit-count:${ring.length}"><div class="hub-nav-orbit-center"><b>NEXUS</b><small>${all.length} nástrojů</small></div>${ring.map((x, i) => `<div class="hub-nav-orbit-slot" style="--orbit-index:${i}">${itemButton(x, 'ORBIT')}</div>`).join('')}</div>${rest.length ? `<div class="hub-nav-orbit-rest"><b>Další</b><div class="hub-nav-grid hub-nav-compact">${rest.map((x) => itemButton(x, 'COMPACT')).join('')}</div></div>` : ''}</div>`; }
    function render(resolved, options = {}) {
        if (!resolved || !Array.isArray(resolved.flat))
            throw new Error('Navigation visual renderer requires resolved KX.NEXUS_NAVIGATION snapshot');
        const mode = String(resolved.mode || 'COMPACT_GRID'), renderFamily = family(mode), themeCode = String(options.themeCode || ''), layoutCode = String(options.layoutCode || ''), iconStyle = String(options.iconStyle || 'AUTO'), density = String(options.density || 'STANDARD');
        let body = '';
        if (renderFamily === 'SIDEBAR')
            body = sidebar(resolved);
        else if (renderFamily === 'MEGA')
            body = mega(resolved);
        else if (renderFamily === 'DOCK')
            body = dock(resolved);
        else if (renderFamily === 'COMMAND')
            body = command(resolved);
        else if (renderFamily === 'ORBIT')
            body = orbit(resolved);
        else
            body = grid(resolved, mode);
        const modes = typeof KXNavigation !== 'undefined' && typeof KXNavigation.contract === 'function' ? (KXNavigation.contract().modes || []) : [];
        const modeDefinition = modes.find((m) => m.code === mode);
        const canDrag = modeDefinition?.supportsDragDrop === true;
        const dynamic = (resolved.dynamic || []).filter((g) => Array.isArray(g.items) && g.items.length).map((g) => `<section class="hub-nav-dynamic-group" data-nav-dynamic="${esc(g.code)}"><header>${esc(g.label)}</header><div class="hub-nav-dynamic-items">${g.items.map((x) => itemButton(x, 'COMPACT', canDrag)).join('')}</div></section>`).join('');
        if (!canDrag)
            body = body.replace(/draggable="true"/g, 'draggable="false"');
        const html = `<div class="hub-nav-host hub-nav-family-${renderFamily.toLowerCase()}" data-nav-mode="${esc(mode)}" data-nav-family="${esc(renderFamily)}" data-theme-code="${esc(themeCode)}" data-layout-code="${esc(layoutCode)}" data-icon-style="${esc(iconStyle)}" data-density="${esc(density)}">${dynamic}${body}</div>`;
        return { contract: 'KX.NEXUS_NAVIGATION_VISUAL/1', mode, family: renderFamily, itemCount: resolved.flat.length, groupCount: resolved.groups?.length || 0, dynamicGroupCount: (resolved.dynamic || []).filter((g) => g.items?.length).length, canDrag, html };
    }
    NS.family = family;
    NS.render = render;
    NS.itemButton = itemButton;
})(KXNavigationVisual || (KXNavigationVisual = {}));
