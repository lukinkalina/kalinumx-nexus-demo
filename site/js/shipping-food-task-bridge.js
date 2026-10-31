// Staged hub integration for the opt-in Core Task item engine.
// Read APIs consume ONLY rows already authorized by the caller; never call tasks.list() here.
var KXShippingFoodTaskBridge;
(function (KXShippingFoodTaskBridge) {
    const shipping = 'APP.KX.SHIPPING', food = 'APP.KX.FOOD';
    function shippingRows(authorizedRows) {
        if (!Array.isArray(authorizedRows))
            throw new Error('AUTHORIZED_ROWS_REQUIRED');
        return authorizedRows.filter(x => x.ownerApp === shipping && x.itemKind === 'SHIPMENT' && !x.archivedAt).map(x => {
            if (!((x.itemState === 'DELIVERED' && x.status === 'DONE') || (x.itemState === 'IN_TRANSIT' && x.status === 'IN_PROGRESS')))
                throw new Error('INCONSISTENT_SHIPMENT_STATE');
            return { id: x.id, title: x.title, state: x.itemState, revision: x.revision, dueAt: x.dueAt };
        });
    }
    KXShippingFoodTaskBridge.shippingRows = shippingRows;
    function shoppingRows(authorizedRows) {
        if (!Array.isArray(authorizedRows))
            throw new Error('AUTHORIZED_ROWS_REQUIRED');
        return authorizedRows.filter(x => x.ownerApp === food && x.itemKind === 'SHOPPING_ITEM' && !x.archivedAt).map(x => ({ id: x.id, title: x.title, checked: x.status === 'DONE', revision: x.revision, dueAt: x.dueAt }));
    }
    KXShippingFoodTaskBridge.shoppingRows = shoppingRows;
    class Bridge {
        runtime;
        identityProvider;
        constructor(runtime, identityProvider) {
            this.runtime = runtime;
            this.identityProvider = identityProvider;
        }
        // Instance-scoped single-flight protection for opt-in verified writes.
        // Not a database CAS or cross-window/device synchronization primitive.
        pendingWrites = new Set();
        // Fail closed until a trusted session identity is wired; actorId from a caller is not proof.
        async readAuthorized(ctx) {
            if (!this.identityProvider || typeof this.identityProvider.getAuthenticatedSubjectId !== 'function' || !this.runtime.tasks?.list || !this.runtime.access?.can)
                throw new Error('TRUSTED_READ_PROVIDER_REQUIRED');
            const identity = async () => {
                const subject = await this.identityProvider.getAuthenticatedSubjectId();
                if (typeof subject !== 'string' || !subject.trim() || subject !== ctx?.actorId)
                    throw new Error('UNTRUSTED_READ_IDENTITY');
                return subject;
            };
            const subject = await identity();
            const rows = await this.runtime.tasks.list();
            if (!Array.isArray(rows) || rows.length > 10000)
                throw new Error('INVALID_READ_ROWS');
            const candidates = rows.filter(r => r && ((r.ownerApp === shipping && r.itemKind === 'SHIPMENT') || (r.ownerApp === food && r.itemKind === 'SHOPPING_ITEM')) && !r.archivedAt);
            // Copy before the first await to prevent mutable repository rows changing underneath us.
            // Stage 287: fail closed on ambiguous task identities and malformed records before authorization.
            // A duplicated ID must never be resolved by the later readback Map's last-write-wins behavior.
            const seenIds = new Set();
            const snapshots = candidates.map(r => {
                if (typeof r.id !== 'string' || !r.id.trim() || r.id.length > 256 ||
                    typeof r.title !== 'string' || r.title.length > 8192 ||
                    !Number.isSafeInteger(r.revision) || r.revision < 1 ||
                    !Array.isArray(r.spaceIds))
                    throw new Error('INVALID_READ_ROW');
                if (seenIds.has(r.id))
                    throw new Error('DUPLICATE_READ_ROW_ID');
                seenIds.add(r.id);
                if (r.itemKind === 'SHIPMENT' && !((r.itemState === 'IN_TRANSIT' && r.status === 'IN_PROGRESS') ||
                    (r.itemState === 'DELIVERED' && r.status === 'DONE')))
                    throw new Error('INCONSISTENT_SHIPMENT_STATE');
                const spaces = r.spaceIds;
                if (spaces.length > 256 || spaces.some((v) => typeof v !== 'string' || !v.trim() || v.length > 256))
                    throw new Error('INVALID_READ_SCOPE');
                return { ...r, spaceIds: [...spaces] };
            });
            const allowed = [];
            const denied = [];
            for (const r of snapshots) {
                const target = { kind: 'TASK', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds };
                if (await this.runtime.access.can(target, subject, 'READ'))
                    allowed.push(r);
                else
                    denied.push(r);
            }
            await identity();
            // Stage 298: move the second snapshot readback AFTER all permission/identity
            // checks. This preserves the original two list reads and catches mutations
            // that arrive during async permission rechecks rather than before them.
            const tracked = new Map(snapshots.map(r => [r.id, JSON.stringify(r)]));
            const assertSnapshotStable = async () => {
                const current = await this.runtime.tasks.list();
                if (!Array.isArray(current) || current.length > 10000)
                    throw new Error('READ_SNAPSHOT_CHANGED');
                const fresh = current.filter(r => r && ((r.ownerApp === shipping && r.itemKind === 'SHIPMENT') || (r.ownerApp === food && r.itemKind === 'SHOPPING_ITEM')) && !r.archivedAt);
                if (fresh.length !== snapshots.length || fresh.some(r => !tracked.has(r.id) || tracked.get(r.id) !== JSON.stringify(r)))
                    throw new Error('READ_SNAPSHOT_CHANGED');
            };
            for (const r of allowed) {
                if (!await this.runtime.access.can({ kind: 'TASK', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds }, subject, 'READ'))
                    throw new Error('READ_PERMISSION_REVOKED');
            }
            // A newly granted READ changes the visible result just as a revocation does.
            // Never publish an incomplete view based on a stale authorization snapshot.
            for (const r of denied) {
                if (await this.runtime.access.can({ kind: 'TASK', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds }, subject, 'READ'))
                    throw new Error('READ_PERMISSION_GRANTED_DURING_READ');
            }
            await identity();
            // The final repository read catches edits during the authorization checks;
            // this remains non-transactional READ+permission isolation.
            await assertSnapshotStable();
            return { shipping: shippingRows(allowed), shopping: shoppingRows(allowed) };
        }
        // Opt-in EDIT boundary for future interactive panels. This deliberately does NOT
        // enable editing in the live Shell: no production trusted identity source is wired.
        // Legacy commands below remain available for existing trusted internal callers.
        async authorizedUpdate(id, revision, ownerApp, kind, patch, ctx) {
            if (!this.identityProvider || typeof this.identityProvider.getAuthenticatedSubjectId !== 'function' || !this.runtime.tasks?.get || !this.runtime.access?.can)
                throw new Error('TRUSTED_WRITE_PROVIDER_REQUIRED');
            if (typeof id !== 'string' || !id.trim() || id.length > 256 || !Number.isSafeInteger(revision) || revision < 1)
                throw new Error('INVALID_WRITE_TARGET');
            if (this.pendingWrites.has(id))
                throw new Error('WRITE_IN_PROGRESS');
            this.pendingWrites.add(id);
            try {
                const identity = async () => {
                    const subject = await this.identityProvider.getAuthenticatedSubjectId();
                    if (typeof subject !== 'string' || !subject.trim() || subject !== ctx?.actorId)
                        throw new Error('UNTRUSTED_WRITE_IDENTITY');
                    return subject;
                };
                const subject = await identity();
                const before = await this.runtime.tasks.get(id);
                if (!before || before.ownerApp !== ownerApp || before.itemKind !== kind || before.archivedAt)
                    throw new Error('WRONG_WRITE_TARGET');
                if (before.revision !== revision)
                    throw new Error('STALE_WRITE_REVISION');
                if (typeof before.title !== 'string' || !Array.isArray(before.spaceIds) ||
                    before.spaceIds.length > 256 || before.spaceIds.some((s) => typeof s !== 'string' || !s.trim() || s.length > 256))
                    throw new Error('INVALID_WRITE_RECORD');
                const snapshot = JSON.stringify(before);
                const target = { kind: 'TASK', id, ownerApp, spaceIds: before.spaceIds };
                if (!await this.runtime.access.can(target, subject, 'EDIT'))
                    throw new Error('WRITE_PERMISSION_DENIED');
                await identity();
                const current = await this.runtime.tasks.get(id);
                if (!current || JSON.stringify(current) !== snapshot)
                    throw new Error('WRITE_RECORD_CHANGED');
                if (!await this.runtime.access.can(target, subject, 'EDIT'))
                    throw new Error('WRITE_PERMISSION_REVOKED');
                await identity();
                // The last EDIT check is asynchronous. Re-read after it, because a task
                // may have changed or been archived inside that check's await window.
                const preDispatch = await this.runtime.tasks.get(id);
                if (!preDispatch || JSON.stringify(preDispatch) !== snapshot)
                    throw new Error('WRITE_RECORD_CHANGED');
                // Optimistic revision remains mandatory at Core commit. The ActionBus permission
                // context is NOT a native session credential; its production binding is BLOCKED.
                return await this.runtime.actions.invoke('ACTION.CORE.TASK.SAVE', { id, title: before.title, ownerApp, expectedRevision: revision, ...patch }, { ...ctx, actorId: subject });
            }
            finally {
                this.pendingWrites.delete(id);
            }
        }
        async changeShipmentAuthorized(id, revision, state, ctx) {
            if (state !== 'IN_TRANSIT' && state !== 'DELIVERED')
                throw new Error('INVALID_SHIPMENT_STATE');
            return this.authorizedUpdate(id, revision, shipping, 'SHIPMENT', { itemState: state }, ctx);
        }
        async checkShoppingAuthorized(id, revision, checked, ctx) {
            if (typeof checked !== 'boolean')
                throw new Error('INVALID_CHECKED');
            return this.authorizedUpdate(id, revision, food, 'SHOPPING_ITEM', { status: checked ? 'DONE' : 'TODO' }, ctx);
        }
        async clearShoppingDeadlineAuthorized(id, revision, ctx) {
            return this.authorizedUpdate(id, revision, food, 'SHOPPING_ITEM', { dueAt: null }, ctx);
        }
        async addShipment(input, ctx) {
            return this.runtime.actions.invoke('ACTION.CORE.TASK.SAVE', { title: input.title, spaceIds: input.spaceIds, ownerApp: shipping, itemKind: 'SHIPMENT', itemState: 'IN_TRANSIT', dueAt: input.dueAt }, ctx);
        }
        async setShipmentState(row, state, ctx) {
            if (row.ownerApp !== shipping || row.itemKind !== 'SHIPMENT')
                throw new Error('NOT_A_SHIPMENT');
            if (state !== 'IN_TRANSIT' && state !== 'DELIVERED')
                throw new Error('INVALID_SHIPMENT_STATE');
            return this.runtime.actions.invoke('ACTION.CORE.TASK.SAVE', { id: row.id, title: row.title, ownerApp: shipping, itemState: state, expectedRevision: row.revision }, ctx);
        }
        async addShoppingItem(input, ctx) {
            return this.runtime.actions.invoke('ACTION.CORE.TASK.SAVE', { title: input.title, spaceIds: input.spaceIds, ownerApp: food, itemKind: 'SHOPPING_ITEM', ...(input.dueAt ? { dueAt: input.dueAt } : {}) }, ctx);
        }
        async setShoppingChecked(row, checked, ctx) {
            if (row.ownerApp !== food || row.itemKind !== 'SHOPPING_ITEM')
                throw new Error('NOT_A_SHOPPING_ITEM');
            if (typeof checked !== 'boolean')
                throw new Error('INVALID_CHECKED');
            return this.runtime.actions.invoke('ACTION.CORE.TASK.SAVE', { id: row.id, title: row.title, ownerApp: food, status: checked ? 'DONE' : 'TODO', expectedRevision: row.revision }, ctx);
        }
        async clearShoppingDeadline(row, ctx) {
            if (row.ownerApp !== food || row.itemKind !== 'SHOPPING_ITEM')
                throw new Error('NOT_A_SHOPPING_ITEM');
            return this.runtime.actions.invoke('ACTION.CORE.TASK.SAVE', { id: row.id, title: row.title, ownerApp: food, dueAt: null, expectedRevision: row.revision }, ctx);
        }
    }
    KXShippingFoodTaskBridge.Bridge = Bridge;
})(KXShippingFoodTaskBridge || (KXShippingFoodTaskBridge = {}));
