var KXAppearanceWoff2Decoder;
(function (NS) {
    const contract = () => KX_APPEARANCE_WOFF2_DECODER_CONTRACT || {};
    const knownTags = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
    const ascii = (b, o, n) => String.fromCharCode(...b.slice(o, o + n));
    const u16 = (b, o) => { if (o < 0 || o + 2 > b.length)
        throw new Error('WOFF2_TRUNCATED'); return new DataView(b.buffer, b.byteOffset + o, 2).getUint16(0, false); };
    const u32 = (b, o) => { if (o < 0 || o + 4 > b.length)
        throw new Error('WOFF2_TRUNCATED'); return new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0, false); };
    const align4 = (n) => (n + 3) & ~3;
    const digest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    function readUIntBase128(bytes, state) {
        let accum = 0;
        for (let i = 0; i < Number(contract().limits?.maxUIntBase128Bytes || 5); i++) {
            if (state.offset >= bytes.length)
                throw new Error('WOFF2_UINTBASE128_TRUNCATED');
            const value = bytes[state.offset++];
            if (i === 0 && value === 0x80)
                throw new Error('WOFF2_UINTBASE128_LEADING_ZERO');
            if (accum & 0xFE000000)
                throw new Error('WOFF2_UINTBASE128_OVERFLOW');
            accum = (accum << 7) | (value & 0x7F);
            if ((value & 0x80) === 0)
                return accum >>> 0;
        }
        throw new Error('WOFF2_UINTBASE128_TOO_LONG');
    }
    function isKnownTransform(tag, version) {
        if (tag === 'glyf' || tag === 'loca')
            return version === 0 || version === 3;
        if (tag === 'hmtx')
            return version === 0 || version === 1;
        return version === 0;
    }
    function transformed(tag, version) { return (tag === 'glyf' || tag === 'loca') ? version !== 3 : (tag === 'hmtx' ? version !== 0 : false); }
    function inspectHeader(bytes) {
        const cfg = contract(), lim = cfg.limits || {};
        if (bytes.length < 48 || bytes.length > Number(lim.maxInputBytes || 0))
            throw new Error('WOFF2_SIZE_LIMIT');
        if (ascii(bytes, 0, 4) !== 'wOF2')
            throw new Error('WOFF2_SIGNATURE');
        const flavor = u32(bytes, 4);
        if (flavor === 0x74746366)
            throw new Error('WOFF2_COLLECTION_REJECTED');
        if (![0x00010000, 0x4F54544F].includes(flavor))
            throw new Error('WOFF2_FLAVOR_UNSUPPORTED');
        const length = u32(bytes, 8);
        if (length !== bytes.length)
            throw new Error('WOFF2_LENGTH_MISMATCH');
        const numTables = u16(bytes, 12);
        if (numTables < 1 || numTables > Number(lim.maxTables || 128))
            throw new Error('WOFF2_TABLE_COUNT');
        const reserved = u16(bytes, 14), totalSfntSize = u32(bytes, 16), totalCompressedSize = u32(bytes, 20);
        if (totalSfntSize < 12 + numTables * 16 || totalSfntSize > Number(lim.maxDecodedBytes || 0))
            throw new Error('WOFF2_TOTAL_SFNT_SIZE_LIMIT');
        if (totalCompressedSize < 1 || totalCompressedSize > bytes.length - 48)
            throw new Error('WOFF2_COMPRESSED_SIZE');
        const majorVersion = u16(bytes, 24), minorVersion = u16(bytes, 26), metaOffset = u32(bytes, 28), metaLength = u32(bytes, 32), metaOrigLength = u32(bytes, 36), privOffset = u32(bytes, 40), privLength = u32(bytes, 44);
        if (metaLength > Number(lim.maxMetadataCompressedBytes || 0) || metaOrigLength > Number(lim.maxMetadataOriginalBytes || 0))
            throw new Error('WOFF2_METADATA_LIMIT');
        if (privLength > Number(lim.maxPrivateBytes || 0))
            throw new Error('WOFF2_PRIVATE_LIMIT');
        if ((metaOffset === 0) !== (metaLength === 0 && metaOrigLength === 0))
            throw new Error('WOFF2_METADATA_FIELDS');
        if ((privOffset === 0) !== (privLength === 0))
            throw new Error('WOFF2_PRIVATE_FIELDS');
        const state = { offset: 48 }, seen = new Set(), tables = [];
        let transformedBytes = 0;
        for (let i = 0; i < numTables; i++) {
            if (state.offset >= bytes.length)
                throw new Error('WOFF2_DIRECTORY_TRUNCATED');
            const flags = bytes[state.offset++], tagIndex = flags & 0x3F, version = flags >>> 6;
            let tag = '';
            if (tagIndex === 63) {
                if (state.offset + 4 > bytes.length)
                    throw new Error('WOFF2_DIRECTORY_TAG_TRUNCATED');
                tag = ascii(bytes, state.offset, 4);
                state.offset += 4;
            }
            else
                tag = knownTags[tagIndex] || '';
            if (!/^[\x20-\x7E]{4}$/.test(tag) || seen.has(tag))
                throw new Error('WOFF2_DUPLICATE_OR_INVALID_TABLE_TAG');
            seen.add(tag);
            if (!isKnownTransform(tag, version))
                throw new Error(`WOFF2_UNKNOWN_TRANSFORM_${tag.trim()}_${version}`);
            const origLength = readUIntBase128(bytes, state);
            if (origLength < 1)
                throw new Error('WOFF2_TABLE_LENGTH');
            let transformLength = null;
            if (transformed(tag, version)) {
                transformLength = readUIntBase128(bytes, state);
                if (tag === 'loca' && transformLength !== 0)
                    throw new Error('WOFF2_TRANSFORMED_LOCA_LENGTH');
            }
            const streamLength = transformLength === null ? origLength : transformLength;
            transformedBytes += streamLength;
            if (transformedBytes > Number(lim.maxDecodedBytes || 0))
                throw new Error('WOFF2_TABLE_STREAM_LIMIT');
            tables.push({ tag, transformVersion: version, origLength, transformLength, streamLength });
        }
        const directoryEnd = state.offset, compressedOffset = directoryEnd, compressedEnd = compressedOffset + totalCompressedSize;
        if (compressedEnd > bytes.length)
            throw new Error('WOFF2_COMPRESSED_BLOCK_BOUNDS');
        let cursor = compressedEnd;
        if (metaOffset) {
            const expected = align4(cursor);
            if (metaOffset !== expected || metaOffset + metaLength > bytes.length)
                throw new Error('WOFF2_METADATA_BOUNDS');
            cursor = metaOffset + metaLength;
        }
        if (privOffset) {
            const expected = align4(cursor);
            if (privOffset !== expected || privOffset + privLength !== bytes.length)
                throw new Error('WOFF2_PRIVATE_BOUNDS');
            cursor = privOffset + privLength;
        }
        else if (cursor !== bytes.length && align4(cursor) !== bytes.length)
            throw new Error('WOFF2_TRAILING_BYTES');
        if (!metaOffset && !privOffset && compressedEnd !== bytes.length)
            throw new Error('WOFF2_TRAILING_BYTES');
        return { signature: 'wOF2', flavor, flavorTag: flavor === 0x4F54544F ? 'OTTO' : '00010000', length, numTables, reserved, totalSfntSize, totalCompressedSize, majorVersion, minorVersion, metaOffset, metaLength, metaOrigLength, privOffset, privLength, directoryEnd, compressedOffset, compressedEnd, tableDataLength: transformedBytes, tables };
    }
    function normalizeProvider(provider) { if (!provider)
        return null; const id = String(provider.id || provider.providerId || '').trim(), version = String(provider.version || '').trim(), decode = provider.decode; if (!id || !version || typeof decode !== 'function')
        throw new Error('WOFF2_DECODER_PROVIDER_INVALID'); return { id, version, decode: decode.bind(provider) }; }
    class AppearanceWoff2DecoderService {
        runtime;
        contract = 'KX.APPEARANCE_WOFF2_DECODER/1';
        provider;
        constructor(runtime, provider) {
            this.runtime = runtime;
            this.provider = normalizeProvider(provider);
        }
        status() { return { contract: this.contract, available: !!this.provider, provider: this.provider ? { id: this.provider.id, version: this.provider.version } : null, boundary: contract().providerBoundary, remoteDecoder: contract().remoteDecoder, browserFontFaceBypass: contract().browserFontFaceBypass }; }
        attachTrustedHostDecoder(provider) { this.provider = normalizeProvider(provider); return this.status(); }
        detachTrustedHostDecoder() { this.provider = null; return this.status(); }
        inspect(bytes) { return inspectHeader(bytes); }
        async decode(input) {
            const raw = input?.bytes, bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw || []), header = inspectHeader(bytes), provider = this.provider;
            if (!provider)
                throw new Error('WOFF2_DECODER_UNAVAILABLE');
            const sourceSha256 = await digest(bytes);
            if (input?.expectedSha256 && sourceSha256 !== String(input.expectedSha256).toLowerCase())
                throw new Error('WOFF2_SOURCE_SHA256_MISMATCH');
            const outRaw = await provider.decode(bytes, { header, contract: contract(), sourceSha256 }), decoded = outRaw instanceof Uint8Array ? outRaw : new Uint8Array(outRaw || []), lim = contract().limits || {};
            if (decoded.length < 12 || decoded.length > Number(lim.maxDecodedBytes || 0))
                throw new Error('WOFF2_DECODED_SIZE_LIMIT');
            if (decoded.length > Math.max(bytes.length, 1) * Number(lim.maxExpansionRatio || 32))
                throw new Error('WOFF2_EXPANSION_RATIO_LIMIT');
            const magic = ascii(decoded, 0, 4);
            if (!['\x00\x01\x00\x00', 'OTTO'].includes(magic))
                throw new Error('WOFF2_DECODED_SFNT_MAGIC');
            const decodedSha256 = await digest(decoded);
            return { contract: this.contract, provider: { id: provider.id, version: provider.version }, header, sourceSha256, decodedSha256, decodedMimeType: magic === 'OTTO' ? 'font/otf' : 'font/ttf', decodedBytes: decoded };
        }
    }
    function install(runtime, provider) { let service = runtime.appearanceWoff2Decoder; if (service instanceof AppearanceWoff2DecoderService) {
        if (provider)
            service.attachTrustedHostDecoder(provider);
        return service;
    } service = new AppearanceWoff2DecoderService(runtime, provider); runtime.appearanceWoff2Decoder = service; const existing = new Set(runtime.actions.list().map((x) => x.code)); if (!existing.has('ACTION.CORE.APPEARANCE.WOFF2_DECODER.STATUS'))
        runtime.actions.register({ code: 'ACTION.CORE.APPEARANCE.WOFF2_DECODER.STATUS', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.APPEARANCE.ASSET.READ', handler: () => service.status() }); return service; }
    NS.contract = contract;
    NS.inspectHeader = inspectHeader;
    NS.AppearanceWoff2DecoderService = AppearanceWoff2DecoderService;
    NS.install = install;
})(KXAppearanceWoff2Decoder || (KXAppearanceWoff2Decoder = {}));
