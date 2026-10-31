var KX;
(function (KX) {
    class RelationLineagePanelController {
        runtime;
        constructor(runtime) {
            this.runtime = runtime;
        }
        async load(entityId) {
            const data = await this.runtime.relationManagement.inspect(entityId);
            return {
                ...data,
                relations: [...data.relations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
                lineage: [...data.lineage].sort((a, b) => b.at.localeCompare(a.at)),
            };
        }
        async deleteRelation(relation, ctx) {
            return this.runtime.relationManagement.removeRelation(relation.id, { ...ctx, confirmed: true });
        }
    }
    KX.RelationLineagePanelController = RelationLineagePanelController;
    function relEl(tag, cls, text) {
        const el = document.createElement(tag);
        if (cls)
            el.className = cls;
        if (text !== undefined)
            el.textContent = text;
        return el;
    }
    async function mountRelationLineagePanel(root, runtime, options) {
        const controller = new RelationLineagePanelController(runtime);
        root.innerHTML = '';
        root.classList.add('kx-rel-panel');
        const style = relEl('style');
        style.textContent = `
      .kx-rel-panel{font:12px/1.45 system-ui,sans-serif;color:var(--text,#eee)}
      .kx-rel-tabs{display:flex;gap:6px;margin-bottom:12px}.kx-rel-tabs button{border:1px solid var(--border,#444);background:var(--surface,#111);color:inherit;border-radius:9px;padding:7px 10px;cursor:pointer}
      .kx-rel-tabs button.active{border-color:var(--accent,#c9a76b);color:var(--accent,#c9a76b)}
      .kx-rel-list{display:grid;gap:8px}.kx-rel-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid var(--border,#333);border-radius:10px;padding:9px;background:var(--surface2,#151515)}
      .kx-rel-row small{display:block;color:var(--muted,#999);margin-top:3px}.kx-rel-actions{display:flex;gap:5px}.kx-rel-actions button{border:1px solid var(--border,#444);background:transparent;color:inherit;border-radius:8px;padding:5px 7px;cursor:pointer}.kx-rel-actions .danger{color:#ff7889}
      .kx-rel-empty{color:var(--muted,#999);padding:16px;border:1px dashed var(--border,#444);border-radius:10px}.kx-rel-graph{display:grid;gap:8px}.kx-rel-node{padding:8px;border:1px solid var(--border,#444);border-radius:9px}.kx-rel-edge{padding:6px 8px;color:var(--muted,#aaa)}
    `;
        root.append(style);
        const tabs = relEl('div', 'kx-rel-tabs');
        const body = relEl('div');
        root.append(tabs, body);
        const modes = ['RELATIONS', 'LINEAGE', 'GRAPH'];
        let mode = 'RELATIONS';
        let state = await controller.load(options.entityId);
        const render = () => {
            body.innerHTML = '';
            for (const b of Array.from(tabs.querySelectorAll('button')))
                b.classList.toggle('active', b.dataset.mode === mode);
            if (mode === 'RELATIONS') {
                const list = relEl('div', 'kx-rel-list');
                if (!state.relations.length)
                    list.append(relEl('div', 'kx-rel-empty', 'Žádné explicitní vazby.'));
                for (const relation of state.relations) {
                    const row = relEl('div', 'kx-rel-row');
                    const otherId = relation.sourceId === options.entityId ? relation.targetId : relation.sourceId;
                    const info = relEl('div');
                    const title = relEl('strong', undefined, relation.relationType);
                    const meta = relEl('small', undefined, `${relation.sourceId} → ${relation.targetId} · ${relation.code}`);
                    info.append(title, meta);
                    const actions = relEl('div', 'kx-rel-actions');
                    const otherType = relation.sourceId === options.entityId ? relation.targetType : relation.sourceType;
                    const open = relEl('button', undefined, 'Otevřít');
                    open.onclick = () => options.onOpenEntity?.(otherId, otherType);
                    const del = relEl('button', 'danger', 'Odebrat');
                    del.onclick = async () => {
                        const allowed = options.confirmDelete ? await options.confirmDelete(relation) : false;
                        if (!allowed)
                            return;
                        await controller.deleteRelation(relation, options.context);
                        state = await controller.load(options.entityId);
                        render();
                    };
                    actions.append(open, del);
                    row.append(info, actions);
                    list.append(row);
                }
                body.append(list);
            }
            else if (mode === 'LINEAGE') {
                const list = relEl('div', 'kx-rel-list');
                if (!state.lineage.length)
                    list.append(relEl('div', 'kx-rel-empty', 'Žádné zaznamenané propisování.'));
                for (const line of state.lineage) {
                    const row = relEl('div', 'kx-rel-row');
                    const info = relEl('div');
                    info.append(relEl('strong', undefined, line.flowCode), relEl('small', undefined, `${line.source.entityId}${line.source.fieldCode ? ' · ' + line.source.fieldCode : ''} → ${line.target.entityId}${line.target.fieldCode ? ' · ' + line.target.fieldCode : ''} · ${line.mode} · ${line.at}`));
                    row.append(info);
                    list.append(row);
                }
                body.append(list);
            }
            else {
                const graph = relEl('div', 'kx-rel-graph');
                graph.append(relEl('div', 'kx-rel-empty', `${state.graph.nodes.length} uzlů · ${state.graph.edges.length} hran`));
                for (const node of state.graph.nodes) {
                    const n = relEl('div', 'kx-rel-node');
                    n.append(relEl('strong', undefined, node.label), relEl('small', undefined, `${node.type}${node.appCode ? ' · ' + node.appCode : ''}`));
                    n.onclick = () => options.onOpenEntity?.(node.id, node.type);
                    graph.append(n);
                }
                for (const edge of state.graph.edges)
                    graph.append(relEl('div', 'kx-rel-edge', `${edge.kind}: ${edge.source} → ${edge.target} · ${edge.label}`));
                body.append(graph);
            }
        };
        for (const m of modes) {
            const b = relEl('button', undefined, m === 'RELATIONS' ? 'Vazby' : m === 'LINEAGE' ? 'Propisování' : 'Graf');
            b.dataset.mode = m;
            b.onclick = () => { mode = m; render(); };
            tabs.append(b);
        }
        render();
        return { reload: async () => { state = await controller.load(options.entityId); render(); }, destroy: () => { root.innerHTML = ''; } };
    }
    KX.mountRelationLineagePanel = mountRelationLineagePanel;
})(KX || (KX = {}));
