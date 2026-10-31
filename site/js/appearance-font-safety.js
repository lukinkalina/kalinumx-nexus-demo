var KXAppearanceFontSafety;
(function (NS) {
    const contract = () => KX_APPEARANCE_SVG_FONT_SAFETY_CONTRACT || {};
    const ascii = (b, o, n) => String.fromCharCode(...b.slice(o, o + n));
    const u16 = (b, o) => { if (o < 0 || o + 2 > b.length)
        throw new Error('FONT_TRUNCATED'); return new DataView(b.buffer, b.byteOffset + o, 2).getUint16(0, false); };
    const u32 = (b, o) => { if (o < 0 || o + 4 > b.length)
        throw new Error('FONT_TRUNCATED'); return new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0, false); };
    const hex = (b, o, n) => [...b.slice(o, o + n)].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    const digest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    function checkLicense(input) {
        const policy = contract().font?.license || {}, declaration = String(input?.licenseDeclaration || '').toUpperCase();
        if (!policy.allowedDeclarations?.includes(declaration))
            throw new Error('FONT_LICENSE_UNKNOWN_OR_UNSPECIFIED');
        const proof = String(input?.licenseProofRef || '').trim();
        if (policy.proofRequiredFor?.includes(declaration) && !proof)
            throw new Error('FONT_LICENSE_PROOF_REQUIRED');
        return { declaration, proofRef: proof || null };
    }
    function binding(input, bytes) {
        const b = input?.binding || {};
        for (const key of contract().inputBinding || [])
            if (!String(b[key] ?? '').trim())
                throw new Error(`FONT_INPUT_BINDING_${key.toUpperCase()}_REQUIRED`);
        if (Number(b.size || bytes.length) !== bytes.length)
            throw new Error('FONT_INPUT_SIZE_MISMATCH');
        return { fileId: String(b.fileId), contentRevision: String(b.contentRevision), sha256: String(b.sha256).toLowerCase(), mimeType: String(b.mimeType) };
    }
    function validateTags(tags, tables) {
        const cfg = contract().font || {}, set = new Set(tags);
        for (const tag of cfg.rejectedTables || [])
            if (set.has(tag))
                throw new Error(`FONT_TABLE_REJECTED_${tag.trim()}`);
        for (const tag of cfg.requiredCommonTables || [])
            if (!set.has(tag))
                throw new Error(`FONT_REQUIRED_TABLE_${tag.trim()}`);
        if (!(cfg.requiredTablesAny || []).some((group) => group.every(tag => set.has(tag))))
            throw new Error('FONT_OUTLINE_TABLES_REQUIRED');
        const maxp = tables.find(x => x.tag === 'maxp');
        if (!maxp)
            throw new Error('FONT_REQUIRED_TABLE_maxp');
        return maxp;
    }
    function validateRanges(tables, directoryEnd, total) {
        const sorted = tables.filter(x => x.length > 0).sort((a, b) => a.offset - b.offset);
        for (const t of sorted) {
            if (t.offset < directoryEnd || t.offset + t.length > total)
                throw new Error(`FONT_TABLE_BOUNDS_${t.tag.trim()}`);
        }
        for (let i = 1; i < sorted.length; i++)
            if (sorted[i].offset < sorted[i - 1].offset + sorted[i - 1].length)
                throw new Error('FONT_TABLE_OVERLAP');
    }
    function parseSfnt(bytes) {
        const cfg = contract().font || {}, magic = hex(bytes, 0, 4);
        if (!['00010000', '4F54544F'].includes(magic))
            throw new Error('FONT_SFNT_MAGIC');
        const numTables = u16(bytes, 4);
        if (numTables < 1 || numTables > Number(cfg.maxTables || 128))
            throw new Error('FONT_TABLE_COUNT');
        const directoryEnd = 12 + numTables * 16;
        if (directoryEnd > bytes.length)
            throw new Error('FONT_DIRECTORY_TRUNCATED');
        const seen = new Set(), tables = [];
        for (let i = 0; i < numTables; i++) {
            const o = 12 + i * 16, tag = ascii(bytes, o, 4);
            if (!/^[\x20-\x7E]{4}$/.test(tag) || seen.has(tag))
                throw new Error('FONT_DUPLICATE_OR_INVALID_TABLE_TAG');
            seen.add(tag);
            tables.push({ tag, checksum: u32(bytes, o + 4), offset: u32(bytes, o + 8), length: u32(bytes, o + 12) });
        }
        validateRanges(tables, directoryEnd, bytes.length);
        const maxp = validateTags([...seen], tables);
        if (maxp.length < 6)
            throw new Error('FONT_MAXP_TRUNCATED');
        const glyphs = u16(bytes, maxp.offset + 4);
        if (glyphs < 1 || glyphs > Number(cfg.maxGlyphs || 65535))
            throw new Error('FONT_GLYPH_COUNT');
        return { container: magic === '4F54544F' ? 'OTF_CFF' : 'SFNT_TRUETYPE', numTables, glyphs, tables: tables.map(x => ({ tag: x.tag, offset: x.offset, length: x.length })) };
    }
    function parseWoff(bytes) {
        const cfg = contract().font || {};
        if (ascii(bytes, 0, 4) !== 'wOFF')
            throw new Error('FONT_WOFF_MAGIC');
        if (bytes.length < 44)
            throw new Error('FONT_WOFF_HEADER_TRUNCATED');
        const declaredLength = u32(bytes, 8);
        if (declaredLength !== bytes.length)
            throw new Error('FONT_WOFF_LENGTH_MISMATCH');
        if (u16(bytes, 14) !== 0)
            throw new Error('FONT_WOFF_RESERVED');
        const numTables = u16(bytes, 12);
        if (numTables < 1 || numTables > Number(cfg.maxTables || 128))
            throw new Error('FONT_TABLE_COUNT');
        const directoryEnd = 44 + numTables * 20;
        if (directoryEnd > bytes.length)
            throw new Error('FONT_DIRECTORY_TRUNCATED');
        const seen = new Set(), tables = [];
        for (let i = 0; i < numTables; i++) {
            const o = 44 + i * 20, tag = ascii(bytes, o, 4);
            if (!/^[\x20-\x7E]{4}$/.test(tag) || seen.has(tag))
                throw new Error('FONT_DUPLICATE_OR_INVALID_TABLE_TAG');
            seen.add(tag);
            const offset = u32(bytes, o + 4), compLength = u32(bytes, o + 8), origLength = u32(bytes, o + 12);
            if (compLength > origLength)
                throw new Error('FONT_WOFF_COMPRESSION_LENGTH');
            tables.push({ tag, offset, length: compLength, origLength });
        }
        validateRanges(tables, directoryEnd, bytes.length);
        const maxp = validateTags([...seen], tables);
        if (maxp.length !== maxp.origLength)
            throw new Error('FONT_WOFF_COMPRESSED_MAXP_UNSUPPORTED');
        if (maxp.origLength < 6)
            throw new Error('FONT_MAXP_TRUNCATED');
        const glyphs = u16(bytes, maxp.offset + 4);
        if (glyphs < 1 || glyphs > Number(cfg.maxGlyphs || 65535))
            throw new Error('FONT_GLYPH_COUNT');
        return { container: 'WOFF1', numTables, glyphs, tables: tables.map(x => ({ tag: x.tag, offset: x.offset, compressedLength: x.length, originalLength: x.origLength })) };
    }
    async function inspect(input) {
        const raw = input?.bytes, bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw || []), cfg = contract().font || {};
        if (bytes.length < 4 || bytes.length > Number(cfg.maxInputBytes || 0))
            throw new Error('FONT_SIZE_LIMIT');
        const exact = binding(input, bytes), actualSha = await digest(bytes);
        if (actualSha !== exact.sha256)
            throw new Error('FONT_INPUT_SHA256_MISMATCH');
        const license = checkLicense(input);
        const signature = ascii(bytes, 0, 4);
        if (signature === 'ttcf')
            throw new Error('FONT_COLLECTION_REJECTED');
        if (signature === 'wOF2') {
            const decoder = input?.woff2Decoder;
            if (!decoder || typeof decoder.decode !== 'function')
                throw new Error('FONT_WOFF2_DECODER_REQUIRED');
            const decoded = await decoder.decode({ bytes, expectedSha256: actualSha }), decodedBytes = decoded?.decodedBytes instanceof Uint8Array ? decoded.decodedBytes : new Uint8Array(decoded?.decodedBytes || []);
            const parsed = parseSfnt(decodedBytes);
            return { contract: 'KX.APPEARANCE_SVG_FONT_SAFETY/1', state: 'SAFE', processing: 'WOFF2_HOST_DECODE_THEN_SFNT_PARSE', binding: exact, license, sourceSha256: actualSha, sanitizedSha256: String(decoded.decodedSha256 || await digest(decodedBytes)), sourceContainer: 'WOFF2', decodedMimeType: String(decoded.decodedMimeType || ''), decoderProvider: decoded.provider || null, decodedBytes, ...parsed };
        }
        const parsed = signature === 'wOFF' ? parseWoff(bytes) : parseSfnt(bytes);
        return { contract: 'KX.APPEARANCE_SVG_FONT_SAFETY/1', state: 'SAFE', processing: 'BINARY_CONTAINER_PARSE_NO_EXECUTION', binding: exact, license, sourceSha256: actualSha, sanitizedSha256: actualSha, ...parsed };
    }
    NS.contract = contract;
    NS.inspect = inspect;
})(KXAppearanceFontSafety || (KXAppearanceFontSafety = {}));
