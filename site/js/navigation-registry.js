var KXNavigation;
(function (KXNavigation) {
    const c = () => KX_NAVIGATION_CONTRACT || {};
    const uniq = (xs) => [...new Set((xs || []).map(String))];
    const itemMap = () => new Map((c().items || []).map((x) => [x.itemCode, x]));
    const catSet = () => new Set((c().categories || []).map((x) => x.code));
    const priorityWeight = () => new Map((c().priorityTiers || []).map((x) => [String(x.code), Number(x.weight) || 0]));
    KXNavigation.contract = () => c();
    KXNavigation.validateProfile = (profile = {}) => {
        const im = itemMap(), cs = catSet(), modes = new Set((c().modes || []).map((x) => x.code));
        const badItems = [];
        const badCats = [];
        for (const key of ['favorites', 'pinned', 'hidden', 'itemOrder'])
            for (const code of uniq(profile[key] || []))
                if (!im.has(code))
                    badItems.push(code);
        for (const code of uniq(profile.categoryOrder || []))
            if (!cs.has(code))
                badCats.push(code);
        for (const [item, codes] of Object.entries(profile.categoryOverrides || {})) {
            if (!im.has(item))
                badItems.push(item);
            for (const code of uniq(codes))
                if (!cs.has(code))
                    badCats.push(code);
        }
        if (profile.mode && !modes.has(profile.mode))
            throw new Error(`Unknown navigation mode ${profile.mode}`);
        if (profile.activeCategory && !cs.has(profile.activeCategory))
            badCats.push(profile.activeCategory);
        if (badItems.length || badCats.length)
            throw new Error(`Invalid navigation profile items=${uniq(badItems).join(',')} categories=${uniq(badCats).join(',')}`);
        return true;
    };
    KXNavigation.resolveMode = (profile = {}, context = {}) => {
        KXNavigation.validateProfile(profile);
        if (profile.mode && profile.mode !== 'AUTO')
            return profile.mode;
        const recommended = context.navigationModeRecommendation;
        if (recommended && recommended !== 'AUTO' && (c().modes || []).some((x) => x.code === recommended))
            return recommended;
        const device = String(context.deviceClass || 'DESKTOP').toUpperCase();
        return c().deviceDefaults?.[device] || 'TWO_LEVEL_SIDEBAR';
    };
    KXNavigation.resolve = (profile = {}, context = {}) => {
        KXNavigation.validateProfile(profile);
        const im = itemMap(), cs = catSet(), pw = priorityWeight();
        const favorites = new Set(uniq(profile.favorites || [])), pinned = new Set(uniq(profile.pinned || [])), hidden = new Set(uniq(profile.hidden || []));
        const explicitOrder = new Map(uniq(profile.itemOrder || []).map((x, i) => [String(x), i]));
        const categorySequence = uniq([...uniq(profile.categoryOrder || []), ...(c().categories || []).map((x) => x.code)]);
        const categoryOrder = new Map(categorySequence.map((x, i) => [String(x), i]));
        const recent = uniq(context.recentCodes || []).filter(x => im.has(x));
        const contextual = uniq(context.contextCodes || []).filter(x => im.has(x));
        const rows = [];
        for (const src of c().items || []) {
            if (hidden.has(src.itemCode) && !src.required)
                continue;
            const override = profile.categoryOverrides?.[src.itemCode];
            const categories = override?.length ? uniq(override) : uniq(src.categoryCodes || [src.primaryCategory]);
            for (const x of categories)
                if (!cs.has(x))
                    throw new Error(`Unknown category ${x} for ${src.itemCode}`);
            rows.push({ ...src, categoryCodes: categories, favorite: favorites.has(src.itemCode), pinned: pinned.has(src.itemCode), recent: recent.includes(src.itemCode), contextual: contextual.includes(src.itemCode) });
        }
        const sort = (a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite) || (explicitOrder.has(a.itemCode) || explicitOrder.has(b.itemCode) ? ((explicitOrder.get(a.itemCode) ?? 1e9) - (explicitOrder.get(b.itemCode) ?? 1e9)) : 0) || ((pw.get(a.priority) || 99) - (pw.get(b.priority) || 99)) || (Number(a.defaultOrder) || 0) - (Number(b.defaultOrder) || 0) || String(a.label).localeCompare(String(b.label), 'cs');
        rows.sort(sort);
        const active = profile.activeCategory || null;
        const categories = (c().categories || []).slice().sort((a, b) => (categoryOrder.get(a.code) ?? 999) - (categoryOrder.get(b.code) ?? 999));
        const groups = categories.map((cat) => ({ category: cat, items: rows.filter(x => x.categoryCodes.includes(cat.code)) })).filter((g) => g.items.length && (!active || g.category.code === active));
        const dynamic = [];
        if (profile.showRecent !== false && recent.length)
            dynamic.push({ code: 'NAV.DYNAMIC.RECENT', label: 'Nedávné', items: recent.map(x => rows.find(r => r.itemCode === x)).filter(Boolean) });
        if (profile.showContextual !== false && contextual.length)
            dynamic.push({ code: 'NAV.DYNAMIC.CONTEXT', label: 'Pro tento kontext', items: contextual.map(x => rows.find(r => r.itemCode === x)).filter(Boolean) });
        return { contract: c().contract, mode: KXNavigation.resolveMode(profile, context), themeCode: context.themeCode || null, capacity: c().capacity, groups, dynamic, flat: rows };
    };
})(KXNavigation || (KXNavigation = {}));
