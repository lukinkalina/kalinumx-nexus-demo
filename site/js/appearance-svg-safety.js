var KXAppearanceSvgSafety;
(function (NS) {
    const contract = () => KX_APPEARANCE_SVG_FONT_SAFETY_CONTRACT || {};
    const escapeText = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const escapeAttr = (s) => escapeText(s).replaceAll('"', '&quot;');
    const nameRe = /^[A-Za-z][A-Za-z0-9-]*$/;
    const idRe = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
    const numericRe = /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?(?:px|pt|pc|mm|cm|in|%)?$/;
    function decodeEntities(value) {
        return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, token) => { if (token === 'amp')
            return '&'; if (token === 'lt')
            return '<'; if (token === 'gt')
            return '>'; if (token === 'quot')
            return '"'; if (token === 'apos')
            return "'"; const cp = token[1].toLowerCase() === 'x' ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10); if (!Number.isInteger(cp) || cp < 0x20 || cp > 0x10ffff || cp === 0x7f)
            throw new Error('SVG_ENTITY_CODEPOINT'); return String.fromCodePoint(cp); }).replace(/&[^;\s]{0,40};/g, () => { throw new Error('SVG_UNKNOWN_ENTITY'); });
    }
    function safeValue(name, value, refs) {
        if (/[\u0000-\u001f\u007f]/.test(value))
            throw new Error('SVG_CONTROL_CHARACTER');
        const lower = value.toLowerCase().replace(/\s+/g, '');
        if (name === 'clip-path' || name === 'mask') {
            const m = /^url\(#([A-Za-z_][A-Za-z0-9_.-]{0,127})\)$/.exec(value.trim());
            if (!m)
                throw new Error('SVG_NONLOCAL_FRAGMENT');
            refs.add(m[1]);
            return value.trim();
        }
        for (const p of contract().svg?.forbiddenValuePatterns || []) {
            if (new RegExp(p, 'i').test(value))
                throw new Error('SVG_FORBIDDEN_VALUE');
        }
        if (lower.includes('javascript:') || lower.includes('data:') || lower.includes('file:'))
            throw new Error('SVG_FORBIDDEN_SCHEME');
        if (['width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'stroke-width', 'offset', 'opacity', 'fill-opacity', 'stroke-opacity'].includes(name) && !numericRe.test(value.trim()))
            throw new Error(`SVG_INVALID_NUMERIC_${name}`);
        return value.trim();
    }
    function sanitize(input) {
        const cfg = contract().svg || {}, source = String(input ?? ''), inputBytes = new TextEncoder().encode(source).length;
        if (!source || inputBytes > Number(cfg.maxInputBytes || 0))
            throw new Error('SVG_SIZE_LIMIT');
        if (/[\u0000]/.test(source) || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?|<%/i.test(source))
            throw new Error('SVG_UNSAFE_XML_DECLARATION');
        const allowedElements = new Set(cfg.allowedElements || []), allowedAttrs = new Set(cfg.allowedAttributes || []), forbiddenElements = new Set((cfg.forbiddenElements || []).map((x) => x.toLowerCase()));
        const attrPatterns = (cfg.forbiddenAttributePatterns || []).map((x) => new RegExp(x, 'i'));
        const stack = [], roots = [], ids = new Set(), refs = new Set();
        let i = 0, elements = 0, pathChars = 0;
        const append = (node) => { const parent = stack[stack.length - 1]; if (parent)
            parent.children.push(node);
        else
            roots.push(node); };
        while (i < source.length) {
            if (source.startsWith('<!--', i)) {
                const end = source.indexOf('-->', i + 4);
                if (end < 0)
                    throw new Error('SVG_UNCLOSED_COMMENT');
                i = end + 3;
                continue;
            }
            if (source[i] !== '<') {
                const end = source.indexOf('<', i), raw = source.slice(i, end < 0 ? source.length : end);
                if (raw.trim()) {
                    const parent = stack[stack.length - 1];
                    if (!parent || !['title', 'desc'].includes(parent.name))
                        throw new Error('SVG_TEXT_OUTSIDE_TITLE_DESC');
                    parent.children.push({ text: decodeEntities(raw) });
                }
                i = end < 0 ? source.length : end;
                continue;
            }
            if (source.startsWith('</', i)) {
                let end = source.indexOf('>', i + 2);
                if (end < 0)
                    throw new Error('SVG_UNCLOSED_CLOSE');
                const name = source.slice(i + 2, end).trim();
                if (!nameRe.test(name) || !stack.length || stack[stack.length - 1].name !== name)
                    throw new Error('SVG_CLOSE_MISMATCH');
                stack.pop();
                i = end + 1;
                continue;
            }
            if (source.startsWith('<!', i))
                throw new Error('SVG_UNSAFE_DECLARATION');
            let p = i + 1;
            while (p < source.length && /\s/.test(source[p]))
                p++;
            let start = p;
            while (p < source.length && /[A-Za-z0-9-]/.test(source[p]))
                p++;
            const name = source.slice(start, p);
            if (!nameRe.test(name))
                throw new Error('SVG_INVALID_ELEMENT_NAME');
            if (forbiddenElements.has(name.toLowerCase()) || !allowedElements.has(name))
                throw new Error(`SVG_ELEMENT_BLOCKED_${name}`);
            elements++;
            if (elements > Number(cfg.maxElements || 0))
                throw new Error('SVG_ELEMENT_LIMIT');
            const attrs = [];
            const seen = new Set();
            let selfClose = false;
            while (p < source.length) {
                while (p < source.length && /\s/.test(source[p]))
                    p++;
                if (source[p] === '>') {
                    p++;
                    break;
                }
                if (source[p] === '/' && source[p + 1] === '>') {
                    selfClose = true;
                    p += 2;
                    break;
                }
                start = p;
                while (p < source.length && /[A-Za-z0-9-]/.test(source[p]))
                    p++;
                const attr = source.slice(start, p);
                if (!nameRe.test(attr) || seen.has(attr))
                    throw new Error('SVG_INVALID_OR_DUPLICATE_ATTRIBUTE');
                seen.add(attr);
                if (attrPatterns.some((x) => x.test(attr)) || !allowedAttrs.has(attr))
                    throw new Error(`SVG_ATTRIBUTE_BLOCKED_${attr}`);
                while (p < source.length && /\s/.test(source[p]))
                    p++;
                if (source[p] !== '=')
                    throw new Error('SVG_ATTRIBUTE_EQUALS');
                p++;
                while (p < source.length && /\s/.test(source[p]))
                    p++;
                const quote = source[p];
                if (quote !== '"' && quote !== "'")
                    throw new Error('SVG_ATTRIBUTE_QUOTE');
                p++;
                const valueStart = p;
                while (p < source.length && source[p] !== quote) {
                    if (source[p] === '<')
                        throw new Error('SVG_ATTRIBUTE_LT');
                    p++;
                }
                if (p >= source.length)
                    throw new Error('SVG_UNCLOSED_ATTRIBUTE');
                let value = decodeEntities(source.slice(valueStart, p));
                p++;
                value = safeValue(attr, value, refs);
                if (attr === 'id') {
                    if (!idRe.test(value) || ids.has(value))
                        throw new Error('SVG_INVALID_OR_DUPLICATE_ID');
                    ids.add(value);
                }
                if (attr === 'd') {
                    pathChars += value.length;
                    if (pathChars > Number(cfg.maxPathDataChars || 0))
                        throw new Error('SVG_PATH_DATA_LIMIT');
                }
                attrs.push([attr, value]);
            }
            if (p > source.length)
                throw new Error('SVG_UNCLOSED_TAG');
            const node = { name, attrs: attrs.sort((a, b) => a[0].localeCompare(b[0])), children: [] };
            append(node);
            if (!selfClose) {
                stack.push(node);
                if (stack.length > Number(cfg.maxDepth || 0))
                    throw new Error('SVG_DEPTH_LIMIT');
            }
            i = p;
        }
        if (stack.length || roots.length !== 1 || roots[0].name !== 'svg')
            throw new Error('SVG_ROOT_OR_BALANCE');
        for (const ref of refs)
            if (!ids.has(ref))
                throw new Error(`SVG_DANGLING_FRAGMENT_${ref}`);
        const render = (node, root = false) => { if (node.text !== undefined)
            return escapeText(node.text); const attrs = [...node.attrs]; if (root)
            attrs.unshift(['xmlns', 'http://www.w3.org/2000/svg']); const body = node.children.map((x) => render(x)).join(''); return `<${node.name}${attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')}>${body}</${node.name}>`; };
        const outputSvg = render(roots[0], true), outputBytes = new TextEncoder().encode(outputSvg).length;
        return { contract: 'KX.APPEARANCE_SVG_FONT_SAFETY/1', state: 'SAFE', outputSvg, inputBytes, outputBytes, elements, maxDepth: Number(cfg.maxDepth || 0), ids: [...ids].sort(), references: [...refs].sort(), processing: 'PARSE_ALLOWLIST_REBUILD' };
    }
    async function sanitizeAndDigest(input) { const result = sanitize(input), hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.outputSvg)); return { ...result, sanitizedSha256: [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('') }; }
    NS.contract = contract;
    NS.sanitize = sanitize;
    NS.sanitizeAndDigest = sanitizeAndDigest;
})(KXAppearanceSvgSafety || (KXAppearanceSvgSafety = {}));
