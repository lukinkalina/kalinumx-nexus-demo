var KXAppearanceAssetLibraryIndex;
(function (NS) {
    const contract = () => KX_APPEARANCE_ASSET_LIBRARY_INDEX_CONTRACT || {};
    const lower = (v) => String(v ?? '').toLocaleLowerCase('cs');
    const jsonArray = (v) => JSON.stringify(Array.isArray(v) ? v : []);
    class PortableAppearanceAssetLibraryIndexProvider {
        mode = 'PORTABLE_BOUNDED_FALLBACK';
        native = false;
        async status(actorId) { return { contract: contract().contract || 'KX.APPEARANCE_ASSET_LIBRARY_INDEX/1', available: false, state: 'UNAVAILABLE', mode: this.mode, actorId, rows: 0, sourceSequence: null, indexSourceSequence: null, rebuildRequired: false, reason: 'NATIVE_SQLITE_UNAVAILABLE' }; }
        async replaceActor(_actorId, _rows) { throw new Error('APPEARANCE_ASSET_LIBRARY_NATIVE_INDEX_UNAVAILABLE'); }
        async page(_input) { throw new Error('APPEARANCE_ASSET_LIBRARY_NATIVE_INDEX_UNAVAILABLE'); }
    }
    class TauriAppearanceAssetLibraryIndexProvider {
        bridge;
        mode = 'NATIVE_SQLITE_DERIVED_INDEX';
        native = true;
        constructor(bridge = new KX.TauriGlobalBridge()) {
            this.bridge = bridge;
        }
        async status(actorId) { return this.bridge.invoke('kx_appearance_asset_index_status', { actorId }); }
        projection(row) { const md = row?.metadata || {}, maxSearch = Math.max(512, Number(contract().maxSearchChars || 8192)), search = [row?.name, row?.mimeType, row?.fileId, row?.provenance, row?.license, row?.source, ...(md.categories || []), ...(md.tags || []), ...(md.collectionNames || [])].map(lower).join('\n').slice(0, maxSearch); return { fileId: String(row?.fileId || ''), itemJson: JSON.stringify(row), searchText: search, usage: String(row?.usage || ''), stale: !!row?.stale, favorite: !!md.favorite, nameSort: lower(row?.name), size: Math.max(0, Number(row?.size || 0)), registeredAt: String(row?.registeredAt || ''), categoriesJson: JSON.stringify((md.categories || []).map(lower)), tagsJson: JSON.stringify((md.tags || []).map(lower)), collectionIdsJson: jsonArray(md.collectionIds), collectionNamesJson: JSON.stringify((md.collectionNames || []).map(lower)) }; }
        async replaceActor(actorId, rows) { const max = Math.max(1, Number(contract().maxRebuildRows || 20000)); if (!Array.isArray(rows))
            throw new Error('Appearance asset index rows must be an array'); if (rows.length > max)
            throw new Error(`APPEARANCE_ASSET_LIBRARY_INDEX_REBUILD_LIMIT:${max}`); const payload = rows.map(x => this.projection(x)); for (const row of payload)
            if (!row.fileId)
                throw new Error('Appearance asset index row missing FILE.ID'); return this.bridge.invoke('kx_appearance_asset_index_replace', { actorId, rows: payload }); }
        async page(input) { const out = await this.bridge.invoke('kx_appearance_asset_index_page', { input }); const items = (out?.itemsJson || []).map((x) => JSON.parse(x)); return { ...out, items, itemsJson: undefined, mode: 'BOUNDED_WINDOW', queryMode: this.mode }; }
    }
    function createDefaultProvider(runtime) { const repo = runtime?.repository; if (repo?.mode === 'NATIVE_SQLITE' && KX.TauriGlobalBridge.available())
        return new TauriAppearanceAssetLibraryIndexProvider(repo.bridge || new KX.TauriGlobalBridge()); return new PortableAppearanceAssetLibraryIndexProvider(); }
    NS.contract = contract;
    NS.PortableAppearanceAssetLibraryIndexProvider = PortableAppearanceAssetLibraryIndexProvider;
    NS.TauriAppearanceAssetLibraryIndexProvider = TauriAppearanceAssetLibraryIndexProvider;
    NS.createDefaultProvider = createDefaultProvider;
})(KXAppearanceAssetLibraryIndex || (KXAppearanceAssetLibraryIndex = {}));
