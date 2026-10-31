// Stage 286: UI boundary for Shipping and Food. Never renders raw TaskService rows.
var KXShippingFoodHubPanel;
(function (KXShippingFoodHubPanel) {
    // Mount generations prevent an older asynchronous authorization result overwriting a newer hub view.
    const generations = new WeakMap();
    KXShippingFoodHubPanel.escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function markup(hub, data, editable = false) {
        // Stage 288: a corrupted view must not be silently presented as transit or unchecked.
        if (hub !== 'SHIPPING' && hub !== 'FOOD')
            throw new Error('INVALID_HUB_KIND');
        if (!data || !Array.isArray(data.shipping) || !Array.isArray(data.shopping) || data.shipping.length + data.shopping.length > 10000)
            throw new Error('INVALID_HUB_VIEW');
        const validText = (r) => typeof r?.id === 'string' && !!r.id.trim() && r.id.length <= 256 && typeof r.title === 'string' && r.title.length <= 8192 && (r.revision === undefined || Number.isSafeInteger(r.revision) && r.revision >= 1);
        if (data.shipping.some(r => !validText(r) || !['IN_TRANSIT', 'DELIVERED'].includes(r.state)))
            throw new Error('INVALID_SHIPPING_VIEW_ROW');
        if (data.shopping.some(r => !validText(r) || typeof r.checked !== 'boolean' || r.dueAt !== undefined && typeof r.dueAt !== 'string'))
            throw new Error('INVALID_SHOPPING_VIEW_ROW');
        // Backward compatibility: read-only historical fixtures may omit a revision.
        // Interactive edit buttons must never be rendered without a concrete CAS token.
        if (editable && (data.shipping.some(r => !Number.isSafeInteger(r.revision) || r.revision < 1) || data.shopping.some(r => !Number.isSafeInteger(r.revision) || r.revision < 1)))
            throw new Error('EDITABLE_REVISION_REQUIRED');
        const ids = [...data.shipping.map(r => r.id), ...data.shopping.map(r => r.id)];
        if (new Set(ids).size !== ids.length)
            throw new Error('DUPLICATE_HUB_VIEW_ID');
        if (hub === 'SHIPPING') {
            const rows = data.shipping.map(r => `<li data-shipment-id="${KXShippingFoodHubPanel.escapeHtml(r.id)}"><strong>${KXShippingFoodHubPanel.escapeHtml(r.title)}</strong> <span>${r.state === 'DELIVERED' ? 'Doručeno' : 'Na cestě'}</span>${editable ? ` <button type="button" data-kx-action="shipment" data-kx-id="${KXShippingFoodHubPanel.escapeHtml(r.id)}">${r.state === 'DELIVERED' ? 'Vrátit na cestě' : 'Označit doručeno'}</button>` : ''}</li>`).join('');
            return `<section class="settings-card" data-kx-hub="SHIPPING"><h3>Zásilky</h3><ul>${rows || '<li>Zatím žádné zásilky</li>'}</ul></section>`;
        }
        const rows = data.shopping.map(r => `<li data-shopping-id="${KXShippingFoodHubPanel.escapeHtml(r.id)}"><span>${r.checked ? '☑' : '☐'}</span> <strong>${KXShippingFoodHubPanel.escapeHtml(r.title)}</strong>${r.dueAt ? ` <small>${KXShippingFoodHubPanel.escapeHtml(r.dueAt)}</small>` : ''}${editable ? ` <button type="button" data-kx-action="shopping" data-kx-id="${KXShippingFoodHubPanel.escapeHtml(r.id)}">${r.checked ? 'Vrátit do seznamu' : 'Odškrtnout'}</button>` : ''}</li>`).join('');
        return `<section class="settings-card" data-kx-hub="FOOD"><h3>Nákupní seznam</h3><ul>${rows || '<li>Nákupní seznam je prázdný</li>'}</ul></section>`;
    }
    KXShippingFoodHubPanel.markup = markup;
    async function mount(host, hub, reader, ctx, commands) {
        const generation = (generations.get(host) || 0) + 1;
        generations.set(host, generation);
        host.onclick = null; // invalidate any write handler from the previous generation
        if (!reader || typeof reader.readAuthorized !== 'function') {
            host.innerHTML = '<div class="empty" data-hub-locked>Hub čeká na důvěryhodné přihlášení. Osobní údaje nejsou dostupné.</div>';
            return false;
        }
        host.innerHTML = '<div class="empty">Ověřuji oprávnění…</div>';
        try {
            const data = await reader.readAuthorized(ctx);
            if (!host.isConnected || generations.get(host) !== generation)
                return false;
            host.innerHTML = markup(hub, data, !!commands);
            if (commands) {
                let writeInFlight = false;
                host.onclick = async (event) => {
                    if (generations.get(host) !== generation || !host.isConnected)
                        return;
                    const hit = event.target?.closest?.('button[data-kx-action]');
                    if (!hit || !host.contains(hit) || hit.disabled || writeInFlight)
                        return;
                    const id = hit.dataset.kxId;
                    if (!id)
                        return;
                    const isShipment = hub === 'SHIPPING' && hit.dataset.kxAction === 'shipment';
                    const isShopping = hub === 'FOOD' && hit.dataset.kxAction === 'shopping';
                    const ship = isShipment ? data.shipping.find(r => r.id === id) : undefined;
                    const item = isShopping ? data.shopping.find(r => r.id === id) : undefined;
                    if (!ship && !item)
                        return;
                    writeInFlight = true;
                    hit.disabled = true;
                    try {
                        if (ship)
                            await commands.changeShipmentAuthorized(ship.id, ship.revision, ship.state === 'DELIVERED' ? 'IN_TRANSIT' : 'DELIVERED', ctx);
                        else if (item)
                            await commands.checkShoppingAuthorized(item.id, item.revision, !item.checked, ctx);
                        if (generations.get(host) === generation && host.isConnected)
                            await mount(host, hub, reader, ctx, commands);
                    }
                    catch {
                        if (generations.get(host) === generation && host.isConnected) {
                            host.onclick = null;
                            host.innerHTML = '<div class="empty" data-hub-locked>Změna nebyla povolena. Načtěte hub znovu po ověření oprávnění.</div>';
                        }
                    }
                };
            }
            return true;
        }
        catch {
            if (host.isConnected && generations.get(host) === generation)
                host.innerHTML = '<div class="empty" data-hub-locked>Čtení nebylo povoleno. Přihlaste se ověřenou identitou.</div>';
            return false;
        }
    }
    KXShippingFoodHubPanel.mount = mount;
})(KXShippingFoodHubPanel || (KXShippingFoodHubPanel = {}));
