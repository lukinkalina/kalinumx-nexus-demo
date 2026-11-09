// N2.4q: home strip tiles – clock (seconds small), holiday / name day today, weather (opt-in, network) – defaults per layout family
// (all 72 LAYOUT.* get one by their family), user overrides (visible / order / size) on top; ↺ returns the layout default.
var KXHomeTiles;
(function () {
    const TILES = ['clock', 'holiday', 'weather'];
    const SIZES = ['S', 'M', 'L'];
    /* family defaults: order, size, visibility (weather stays off until consent, but its place is prepared) */
    const T = (id, size, visible = true) => ({ id, size, visible });
    const FAMILY = {
        STANDARD: [T('clock', 'M'), T('holiday', 'M'), T('weather', 'M')], CARDS: [T('clock', 'M'), T('holiday', 'M'), T('weather', 'M')], MULTI: [T('clock', 'S'), T('holiday', 'S'), T('weather', 'S')],
        DENSE: [T('clock', 'S'), T('holiday', 'S'), T('weather', 'S')], TABLE: [T('clock', 'S'), T('holiday', 'S'), T('weather', 'S')], TERMINAL: [T('clock', 'S'), T('holiday', 'S'), T('weather', 'S', false)],
        EXECUTIVE: [T('clock', 'L'), T('weather', 'M'), T('holiday', 'M')], COCKPIT: [T('clock', 'L'), T('weather', 'M'), T('holiday', 'S')], WORKFLOW: [T('clock', 'M'), T('holiday', 'S'), T('weather', 'S')],
        FOCUS: [T('clock', 'L'), T('holiday', 'S'), T('weather', 'S', false)], READER: [T('clock', 'M'), T('holiday', 'M'), T('weather', 'S', false)],
        SIMPLE: [T('clock', 'L'), T('holiday', 'M'), T('weather', 'M')], ULTRA_SIMPLE: [T('clock', 'L'), T('holiday', 'L'), T('weather', 'L')],
        MOBILE: [T('clock', 'M'), T('holiday', 'S'), T('weather', 'S')], TEEN: [T('clock', 'L'), T('weather', 'M'), T('holiday', 'M')], STUDIO: [T('clock', 'M'), T('weather', 'M'), T('holiday', 'S')],
        COMPARE: [T('clock', 'S'), T('holiday', 'S'), T('weather', 'S')], WALL: [T('clock', 'L'), T('weather', 'L'), T('holiday', 'M')], KIOSK: [T('clock', 'L'), T('weather', 'L'), T('holiday', 'L')], WORKSHOP: [T('clock', 'L'), T('weather', 'M'), T('holiday', 'S')]
    };
    function familyOf(code) { const c = String(code || '').replace(/^LAYOUT\./, '').replace(/^X_/, '').replace(/_(DUO|PLUS|\d+)$/, ''); if (c === 'WALLBOARD')
        return 'WALL'; return FAMILY[c] ? c : 'STANDARD'; }
    function defaults(code) { return FAMILY[familyOf(code)].map((t) => ({ ...t })); }
    /* user override: {tiles:[{id,size,visible}]} in the given order; unknown ids / sizes dropped; missing tiles appended hidden */
    function effective(code, override) {
        const base = defaults(code);
        if (!override || !Array.isArray(override.tiles))
            return base;
        const seen = new Set();
        const out = [];
        for (const t of override.tiles) {
            if (!TILES.includes(t?.id) || seen.has(t.id))
                continue;
            seen.add(t.id);
            out.push({ id: t.id, size: SIZES.includes(t.size) ? t.size : 'M', visible: t.visible !== false });
        }
        for (const t of base)
            if (!seen.has(t.id))
                out.push({ ...t, visible: false });
        return out;
    }
    /* clock text: hours:minutes + small seconds (the shell updates it every second) */
    function clockParts(d, locale = 'cs-CZ') { const p = (n) => String(n).padStart(2, '0'); return { hm: `${p(d.getHours())}:${p(d.getMinutes())}`, s: p(d.getSeconds()), date: d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }), weekday: d.toLocaleDateString(locale, { weekday: 'long' }) }; }
    /* holiday today: state / other / significant days of the chosen countries + name days of the chosen calendars */
    function today(dateIso, countries = ['CZ'], calendars = ['CZ']) {
        const H = globalThis.KXHolidays;
        if (!H)
            return { holidays: [], names: [] };
        const y = +dateIso.slice(0, 4);
        const hol = countries.flatMap((c) => H.forYear(y, c)).filter((h) => h.date === dateIso && h.kind !== 'CUSTOM');
        const custom = countries.flatMap((c) => H.forYear(y, c)).filter((h) => h.date === dateIso && h.kind === 'CUSTOM');
        const names = H.namedays(y, calendars).filter((h) => h.date === dateIso);
        return { holidays: hol, custom, names };
    }
    /* default countries by the app language (cs → CZ); a user's choice in the settings wins */
    const byLanguage = (lang) => ({ cs: ['CZ'], sk: ['SK'], de: ['DE'], pl: ['PL'], en: ['GB'] }[String(lang || 'cs').slice(0, 2)] || ['CZ']);
    /* weather – Open-Meteo (no key); only coordinates / city name leave the device; never called unless the user enabled it */
    const WX_HOSTS = ['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com'];
    function weatherUrl(lat, lon, days = 7) { if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180))
        throw new Error('WEATHER_COORDS'); return `${WX_HOSTS[0]}/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=${Math.max(2, Math.min(16, Math.round(days || 7)))}`; } /* N2.6b+ Weather v2: 48 h + 7–16 days */
    function geocodeUrl(city, lang = 'cs') { const c = String(city || '').trim(); if (!c || c.length > 80)
        throw new Error('WEATHER_CITY'); return `${WX_HOSTS[1]}/v1/search?name=${encodeURIComponent(c)}&count=1&language=${encodeURIComponent(lang)}&format=json`; }
    /* WMO weather code → group (text key wx.*) + icon */
    function wmo(code) { const c = Number(code); if (c === 0)
        return ['CLEAR', '☀️']; if (c <= 2)
        return ['PARTLY', '⛅']; if (c === 3)
        return ['CLOUDY', '☁️']; if (c === 45 || c === 48)
        return ['FOG', '🌫️']; if (c >= 51 && c <= 57)
        return ['DRIZZLE', '🌦️']; if (c >= 61 && c <= 67)
        return ['RAIN', '🌧️']; if (c >= 71 && c <= 77)
        return ['SNOW', '🌨️']; if (c >= 80 && c <= 82)
        return ['SHOWERS', '🌦️']; if (c >= 85 && c <= 86)
        return ['SNOW', '🌨️']; if (c >= 95)
        return ['STORM', '⛈️']; return ['UNKNOWN', '🌡️']; }
    function parseWeather(j) {
        const cur = j?.current || {}, d = j?.daily || {};
        if (cur.temperature_2m == null)
            throw new Error('WEATHER_DATA');
        const [group, icon] = wmo(cur.weather_code);
        return { temp: Math.round(cur.temperature_2m), group, icon, max: d.temperature_2m_max?.[0] != null ? Math.round(d.temperature_2m_max[0]) : null, min: d.temperature_2m_min?.[0] != null ? Math.round(d.temperature_2m_min[0]) : null, rain: d.precipitation_sum?.[0] ?? null, at: new Date().toISOString(),
            feels: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null, humidity: cur.relative_humidity_2m ?? null, wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null, isDay: cur.is_day !== 0,
            hours: (() => { const h = j?.hourly || {}; const T = h.time || []; const now = Date.now() - 3600000; const out = []; for (let i = 0; i < T.length && out.length < 48; i++) {
                if (Date.parse(T[i]) < now)
                    continue;
                out.push({ t: T[i], temp: h.temperature_2m?.[i] != null ? Math.round(h.temperature_2m[i]) : null, pop: h.precipitation_probability?.[i] ?? null, icon: wmo(h.weather_code?.[i])[1] });
            } return out; })(),
            days: (d.time || []).map((t, i) => ({ date: t, icon: wmo(d.weather_code?.[i])[1], max: d.temperature_2m_max?.[i] != null ? Math.round(d.temperature_2m_max[i]) : null, min: d.temperature_2m_min?.[i] != null ? Math.round(d.temperature_2m_min[i]) : null, rain: d.precipitation_sum?.[i] ?? null, pop: d.precipitation_probability_max?.[i] ?? null, sunrise: d.sunrise?.[i] || null, sunset: d.sunset?.[i] || null })) };
    }
    async function fetchWeather(src, fetcher = globalThis.fetch, lang = 'cs') {
        let lat = src.lat, lon = src.lon, place = '';
        if (lat == null || lon == null) {
            const g = await (await fetcher(geocodeUrl(String(src.city || ''), lang))).json();
            const r = g?.results?.[0];
            if (!r)
                throw new Error('WEATHER_CITY_NOT_FOUND');
            lat = r.latitude;
            lon = r.longitude;
            place = r.name;
        }
        const w = parseWeather(await (await fetcher(weatherUrl(Number(lat), Number(lon), src.days || 7))).json());
        return { ...w, place };
    }
    KXHomeTiles = { WX_HOSTS, weatherUrl, geocodeUrl, wmo, parseWeather, fetchWeather, TILES, SIZES, FAMILY, familyOf, defaults, effective, clockParts, today, byLanguage };
    globalThis.KXHomeTiles = KXHomeTiles;
})();
