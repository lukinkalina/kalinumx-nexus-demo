// N2.2c (R61): načítací obrazovka — pure renderer (string in → string out) + live updater.
// One mechanism for all 24 progress styles: the progress value 0..1 lives in the CSS variable --kx-p on the root;
// bars, rings, arcs, fills and segments are drawn from it in CSS; text styles (%, counter, terminal, letters, steps)
// are updated by update(). Everything shown comes from the brand snapshot (escaped); no external resources.
var KXSplash;
(function (NS) {
    const STYLES = ['BAR', 'BAR_STEPS', 'BAR_STRIPED', 'BAR_GRADIENT', 'BAR_THICK', 'TOPLINE', 'SEGMENTS', 'CIRCLE', 'RING_THIN', 'RING_DUAL', 'ARC', 'ARC_HALF',
        'DOTS', 'DOTS_WAVE', 'SQUARES', 'PULSE_LOGO', 'LOGO_FILL', 'LOGO_SPIN', 'PERCENT', 'TERMINAL', 'COUNTER', 'LETTERS', 'SPINNER', 'SKELETON'];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const okUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(u);
    const okImg = (u) => typeof u === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u);
    const FONT_STACK = { 'system-ui': 'system-ui,sans-serif', Inter: 'Inter,system-ui,sans-serif', Georgia: 'Georgia,serif', Montserrat: 'Montserrat,system-ui,sans-serif', 'Playfair Display': "'Playfair Display',Georgia,serif",
        'Roboto Mono': "'Roboto Mono',ui-monospace,monospace", Oswald: 'Oswald,Impact,sans-serif', Lora: 'Lora,Georgia,serif', 'Segoe UI': "'Segoe UI',system-ui,sans-serif", Verdana: 'Verdana,sans-serif',
        'Trebuchet MS': "'Trebuchet MS',sans-serif", 'Courier New': "'Courier New',monospace", Garamond: 'Garamond,Georgia,serif', Raleway: 'Raleway,system-ui,sans-serif', Poppins: 'Poppins,system-ui,sans-serif', 'Bebas Neue': "'Bebas Neue',Impact,sans-serif" };
    function progressMarkup(style, brand, steps) {
        const logo = okImg(brand?.logo?.src) && brand.logo.show ? `<img src="${brand.logo.src}" alt="" style="width:72px;height:72px;object-fit:contain">` : '<span style="font-size:48px">◆</span>';
        const ring = (r, w, frac = 1, extra = '') => `<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="${w}" ${frac < 1 ? `stroke-dasharray="${(2 * Math.PI * r * frac).toFixed(1)} 999" transform="rotate(${frac < 0.6 ? 180 : 135} 60 60)"` : ''}/><circle class="kxs-ring" cx="60" cy="60" r="${r}" fill="none" stroke="var(--kxs-accent)" stroke-width="${w}" stroke-linecap="round" style="--kxs-len:${(2 * Math.PI * r * frac).toFixed(1)}" transform="rotate(${frac < 1 ? (frac < 0.6 ? 180 : 135) : -90} 60 60)"/>${extra}</svg>`;
        switch (style) {
            case 'BAR':
            case 'BAR_STEPS':
            case 'BAR_STRIPED':
            case 'BAR_GRADIENT':
            case 'BAR_THICK': return `<div class="kxs-bar kxs-${style.toLowerCase()}"><i></i></div>${style === 'BAR_STEPS' ? `<ol class="kxs-steps">${steps.map((s, i) => `<li data-kxs-step="${i}">${esc(s)}</li>`).join('')}</ol>` : ''}`;
            case 'TOPLINE': return `<div class="kxs-topline"><i></i></div>`;
            case 'SEGMENTS': return `<div class="kxs-segments">${(steps.length ? steps : ['', '', '', '', '']).map((_, i) => `<b data-kxs-seg="${i}"></b>`).join('')}</div>`;
            case 'CIRCLE': return `<div class="kxs-ringbox">${ring(52, 8)}<span class="kxs-pct" data-kxs-pct>0 %</span></div>`;
            case 'RING_THIN': return `<div class="kxs-ringbox">${ring(54, 3)}<span class="kxs-pct" data-kxs-pct>0 %</span></div>`;
            case 'RING_DUAL': return `<div class="kxs-ringbox">${ring(54, 4)}<div class="kxs-inner">${ring(40, 4)}</div><span class="kxs-pct" data-kxs-pct>0 %</span></div>`;
            case 'ARC': return `<div class="kxs-ringbox">${ring(52, 8, 0.75)}<span class="kxs-pct" data-kxs-pct>0 %</span></div>`;
            case 'ARC_HALF': return `<div class="kxs-ringbox kxs-half">${ring(52, 8, 0.5)}<span class="kxs-pct" data-kxs-pct>0 %</span></div>`;
            case 'DOTS':
            case 'DOTS_WAVE': return `<div class="kxs-dots kxs-${style.toLowerCase()}"><b></b><b></b><b></b><b></b><b></b></div>`;
            case 'SQUARES': return `<div class="kxs-squares"><b></b><b></b><b></b><b></b></div>`;
            case 'PULSE_LOGO': return `<div class="kxs-pulse">${logo}</div><div class="kxs-topline"><i></i></div>`;
            case 'LOGO_FILL': return `<div class="kxs-logofill"><div class="kxs-logofill-bg">${logo}</div><div class="kxs-logofill-fg">${logo}</div></div>`;
            case 'LOGO_SPIN': return `<div class="kxs-logospin">${logo}</div><div class="kxs-topline"><i></i></div>`;
            case 'PERCENT': return `<div class="kxs-bigpct" data-kxs-pct>0 %</div>`;
            case 'TERMINAL': return `<pre class="kxs-terminal" data-kxs-terminal>$ kalinumx --start\n</pre>`;
            case 'COUNTER': return `<div class="kxs-counter" data-kxs-counter>0 / ${steps.length || '?'}</div><div class="kxs-topline"><i></i></div>`;
            case 'LETTERS': {
                const t = String(brand?.name?.text || 'NEXUS');
                return `<div class="kxs-letters" data-kxs-letters>${[...t].map((c, i) => `<span data-kxs-letter="${i}">${esc(c)}</span>`).join('')}</div>`;
            }
            case 'SPINNER': return `<div class="kxs-spinner"></div>`;
            case 'SKELETON': return `<div class="kxs-skeleton"><b></b><b></b><b></b><b></b></div><div class="kxs-topline"><i></i></div>`;
        }
        return `<div class="kxs-bar"><i></i></div>`;
    }
    function render(snap, opts = {}) {
        const b = snap?.brand || {}, s = snap?.splash || {};
        const style = STYLES.includes(s.progress?.style) ? s.progress.style : 'BAR';
        const steps = opts.steps || [];
        const bg = s.background || {};
        const dim = Math.max(0, Math.min(0.95, Number(bg.dim) || 0));
        const theme = s.theme === 'LIGHT' ? 'light' : s.theme === 'DARK' ? 'dark' : (opts.prefersLight ? 'light' : 'dark');
        const bgCss = bg.type === 'GRADIENT' && Array.isArray(bg.gradient) ? `linear-gradient(135deg,${esc(bg.gradient[0])},${esc(bg.gradient[1])})` : esc(bg.color || '#0b0d12');
        const img = bg.type === 'IMAGE' ? (okImg(b.image?.src) && b.image.show ? b.image.src : opts.fallbackImage || null) : null;
        const n = b.name || {};
        const nameStyle = `font-family:${FONT_STACK[n.font] || FONT_STACK['system-ui']};font-size:${Number(n.size) || 44}px;font-weight:${Number(n.weight) || 800};letter-spacing:${Number(n.spacing) || 0}px;${Array.isArray(n.gradient) ? `background:linear-gradient(90deg,${esc(n.gradient[0])},${esc(n.gradient[1])});-webkit-background-clip:text;color:transparent;` : `color:${esc(n.color || '#f5d26b')};`}${n.shadow ? 'text-shadow:0 2px 18px rgba(0,0,0,.45);' : ''}`;
        const tips = (s.tips?.show && Array.isArray(s.tips.items)) ? s.tips.items : [];
        const footer = [b.website?.show && okUrl(b.website.url) ? `<a href="${esc(b.website.url)}" target="_blank" rel="noopener" data-kxs-web>${esc(b.website.label || b.website.url)}</a>` : '',
            b.email?.show && b.email.address ? `<a href="mailto:${esc(b.email.address)}" data-kxs-mail>${esc(b.email.address)}</a>` : '', b.version?.show && opts.version ? `<span data-kxs-version>v${esc(opts.version)}</span>` : ''].filter(Boolean).join(' · ');
        return `<div class="kxs-root kxs-${theme} kxs-anim-${esc(String(s.animation || 'FADE').toLowerCase())}" data-kxs-style="${style}" data-kxs-template="${esc(s.template || 'custom')}" style="--kx-p:0;--kxs-accent:${esc(n.color || '#f5d26b')};background:${bgCss}" role="status" aria-live="polite" aria-label="Načítání">
      ${img ? `<div class="kxs-img" style="background-image:url('${img}');opacity:${Number(b.image?.opacity ?? 0.55)};filter:blur(${Number(bg.blur) || 0}px)"></div>` : ''}<div class="kxs-dim" style="opacity:${dim}"></div>
      <div class="kxs-center">${b.logo?.show && okImg(b.logo.src) && !['PULSE_LOGO', 'LOGO_FILL', 'LOGO_SPIN'].includes(style) ? `<img class="kxs-logo" data-kxs-logo src="${b.logo.src}" alt="" style="width:${Number(b.logo.size) || 96}px">` : ''}
        ${n.show !== false ? `<div class="kxs-name" data-kxs-name style="${nameStyle}">${esc(n.text || 'KalinumX NEXUS')}</div>` : ''}${b.tagline?.show && b.tagline.text ? `<div class="kxs-tagline" data-kxs-tagline>${esc(b.tagline.text)}</div>` : ''}
        <div class="kxs-progress" data-kxs-progress>${progressMarkup(style, b, steps)}</div>
        ${s.progress?.showStep !== false ? `<div class="kxs-step" data-kxs-status>Spouštím…</div>` : ''}${s.progress?.showPercent && !['CIRCLE', 'RING_THIN', 'RING_DUAL', 'ARC', 'ARC_HALF', 'PERCENT'].includes(style) ? `<div class="kxs-small" data-kxs-pct>0 %</div>` : ''}
        ${s.progress?.showElapsed ? `<div class="kxs-small" data-kxs-elapsed>0,0 s</div>` : ''}${tips.length ? `<div class="kxs-tip" data-kxs-tip>${esc(tips[0])}</div>` : ''}
        ${b.donate?.show && okUrl(b.donate.url) ? `<a class="kxs-donate kxs-donate-${esc(String(b.donate.style || 'GOLD').toLowerCase())}" data-kxs-donate href="${esc(b.donate.url)}" target="_blank" rel="noopener">${esc(b.donate.label || 'Podpořit')}</a>` : ''}
        ${s.skippable ? `<button class="kxs-skip" data-kxs-skip type="button">Přeskočit</button>` : ''}</div>
      ${footer ? `<div class="kxs-footer" data-kxs-footer>${footer}</div>` : ''}</div>`;
    }
    function update(root, i, n, label, elapsedMs) {
        if (!root)
            return;
        const p = n > 0 ? Math.max(0, Math.min(1, i / n)) : 0;
        const r = root.querySelector?.('.kxs-root') || root;
        r.style.setProperty('--kx-p', String(p));
        r.dataset.kxsProgress = String(Math.round(p * 100));
        const pct = `${Math.round(p * 100)} %`;
        r.querySelectorAll('[data-kxs-pct]').forEach((x) => x.textContent = pct);
        const st = r.querySelector('[data-kxs-status]');
        if (st && label)
            st.textContent = label;
        r.querySelectorAll('[data-kxs-step]').forEach((x) => { const k = Number(x.dataset.kxsStep); x.className = k < i ? 'done' : k === i ? 'active' : ''; });
        r.querySelectorAll('[data-kxs-seg]').forEach((x) => x.classList.toggle('on', Number(x.dataset.kxsSeg) < Math.ceil(p * r.querySelectorAll('[data-kxs-seg]').length)));
        const c = r.querySelector('[data-kxs-counter]');
        if (c)
            c.textContent = `${Math.min(i, n)} / ${n}`;
        const t = r.querySelector('[data-kxs-terminal]');
        if (t && label && !t.textContent.includes(label))
            t.textContent += `> ${label}${p >= 1 ? ' … OK' : ''}\n`;
        const ls = r.querySelectorAll('[data-kxs-letter]');
        ls.forEach((x, k) => x.classList.toggle('on', k < Math.round(p * ls.length)));
        const el = r.querySelector('[data-kxs-elapsed]');
        if (el && Number.isFinite(elapsedMs))
            el.textContent = `${((elapsedMs || 0) / 1000).toFixed(1).replace('.', ',')} s`;
    }
    const CSS = `.kxs-root{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;color:#f5f7fb;font-family:system-ui,sans-serif;overflow:hidden;transition:opacity .35s}
.kxs-root.kxs-light{color:#111}.kxs-img{position:absolute;inset:-20px;background-size:cover;background-position:center}.kxs-dim{position:absolute;inset:0;background:#000}.kxs-light .kxs-dim{background:#fff}
.kxs-center{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;max-width:min(560px,90vw)}.kxs-tagline{opacity:.8}.kxs-step,.kxs-small{font-size:13px;opacity:.85}.kxs-tip{font-size:12px;opacity:.7;font-style:italic}
.kxs-footer{position:absolute;bottom:14px;left:0;right:0;text-align:center;font-size:12px;opacity:.8}.kxs-footer a,.kxs-center a{color:inherit}
.kxs-bar{width:min(420px,80vw);height:6px;border-radius:6px;background:rgba(127,127,127,.25);overflow:hidden}.kxs-bar i,.kxs-topline i{display:block;height:100%;width:calc(var(--kx-p)*100%);background:var(--kxs-accent);transition:width .25s}
.kxs-bar_thick{height:14px}.kxs-bar_gradient i{background:linear-gradient(90deg,var(--kxs-accent),#fff)}.kxs-bar_striped i{background:repeating-linear-gradient(45deg,var(--kxs-accent) 0 10px,rgba(255,255,255,.35) 10px 20px)}
.kxs-topline{position:fixed;top:0;left:0;right:0;height:3px}.kxs-steps{list-style:none;padding:0;margin:4px 0 0;font-size:12px;text-align:left;opacity:.9}.kxs-steps li:before{content:'○ ';opacity:.5}.kxs-steps li.active:before{content:'◐ '}.kxs-steps li.done:before{content:'✓ ';color:var(--kxs-accent)}
.kxs-segments{display:flex;gap:4px}.kxs-segments b{width:28px;height:8px;border-radius:3px;background:rgba(127,127,127,.25)}.kxs-segments b.on{background:var(--kxs-accent)}
.kxs-ringbox{position:relative;width:120px;height:120px}.kxs-ringbox .kxs-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700}.kxs-inner{position:absolute;inset:0;transform:scale(.72)}
.kxs-ring{stroke-dasharray:var(--kxs-len) 999;stroke-dashoffset:calc((1 - var(--kx-p)) * var(--kxs-len));transition:stroke-dashoffset .3s}
.kxs-dots,.kxs-squares{display:flex;gap:8px}.kxs-dots b{width:10px;height:10px;border-radius:50%;background:var(--kxs-accent);animation:kxsBlink 1.2s infinite}.kxs-dots b:nth-child(2){animation-delay:.15s}.kxs-dots b:nth-child(3){animation-delay:.3s}.kxs-dots b:nth-child(4){animation-delay:.45s}.kxs-dots b:nth-child(5){animation-delay:.6s}
.kxs-dots_wave b{animation-name:kxsWave}.kxs-squares b{width:14px;height:14px;background:var(--kxs-accent);animation:kxsSpin 1.6s infinite}.kxs-squares b:nth-child(2){animation-delay:.2s}.kxs-squares b:nth-child(3){animation-delay:.4s}.kxs-squares b:nth-child(4){animation-delay:.6s}
.kxs-pulse{animation:kxsPulse 1.4s infinite}.kxs-logospin{animation:kxsSpin 2.4s linear infinite}.kxs-logofill{position:relative}.kxs-logofill-bg{opacity:.2}.kxs-logofill-fg{position:absolute;inset:0;clip-path:inset(calc((1 - var(--kx-p))*100%) 0 0 0);transition:clip-path .3s}
.kxs-bigpct{font-size:64px;font-weight:800;color:var(--kxs-accent)}.kxs-terminal{text-align:left;font:12px/1.4 ui-monospace,monospace;min-width:min(420px,80vw);max-height:40vh;overflow:hidden;background:rgba(0,0,0,.4);padding:10px;border-radius:8px;color:#33ff99}
.kxs-counter{font-size:28px;font-weight:700}.kxs-letters{font-size:40px;font-weight:800;letter-spacing:4px}.kxs-letters span{opacity:.2;transition:opacity .2s}.kxs-letters span.on{opacity:1;color:var(--kxs-accent)}
.kxs-spinner{width:44px;height:44px;border-radius:50%;border:4px solid rgba(127,127,127,.25);border-top-color:var(--kxs-accent);animation:kxsSpin 1s linear infinite}
.kxs-skeleton{display:grid;grid-template-columns:repeat(2,140px);gap:8px}.kxs-skeleton b{height:46px;border-radius:8px;background:linear-gradient(90deg,rgba(127,127,127,.18),rgba(127,127,127,.32),rgba(127,127,127,.18));background-size:200% 100%;animation:kxsShimmer 1.2s infinite}
.kxs-donate{display:inline-block;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700}.kxs-donate-gold{background:#d4af37;color:#111}.kxs-donate-outline{border:2px solid currentColor}.kxs-donate-pill{background:var(--kxs-accent);color:#111;border-radius:999px}.kxs-donate-link{text-decoration:underline;padding:0}
.kxs-skip{position:absolute;top:-40px;right:-40px;background:none;border:1px solid currentColor;color:inherit;border-radius:6px;padding:4px 10px;opacity:.6;cursor:pointer}.kxs-root.kxs-hide{opacity:0;pointer-events:none}
@keyframes kxsBlink{0%,100%{opacity:.2}50%{opacity:1}}@keyframes kxsWave{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@keyframes kxsSpin{to{transform:rotate(360deg)}}@keyframes kxsPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}@keyframes kxsShimmer{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.kxs-root *{animation:none!important;transition:none!important}}`;
    NS.STYLES = STYLES;
    NS.FONT_STACK = FONT_STACK;
    NS.render = render;
    NS.update = update;
    NS.CSS = CSS;
    NS.esc = esc;
})(KXSplash || (KXSplash = {}));
