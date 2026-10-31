var KX;
(function (KX) {
    function recEl(tag, cls, text) {
        const el = document.createElement(tag);
        if (cls)
            el.className = cls;
        if (text !== undefined)
            el.textContent = text;
        return el;
    }
    function downloadBlob(name, blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    class RecoverySettingsController {
        runtime;
        options;
        constructor(runtime, options) {
            this.runtime = runtime;
            this.options = options;
        }
        ctx(confirmed = true) { return { actorId: this.options.actorId, appCode: this.options.appCode || 'APP.NEXUS', permissions: this.options.permissions || ['CORE.RECOVERY.CREATE'], confirmed }; }
        async createSnapshot(includeFileBlobs = false) { return this.runtime.actions.invoke('ACTION.CORE.RECOVERY.SNAPSHOT.CREATE', { includeAudit: true, includeFileBlobs }, this.ctx(true)); }
        async list() { return (await this.runtime.recovery.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
        verify(row) { return this.runtime.recovery.verify(row); }
        async exportSnapshot(row) { downloadBlob(`KalinumX_Recovery_${row.createdAt.replace(/[:.]/g, '-')}.json`, await this.runtime.recovery.toBlob(row)); }
        async exportBook() { const book = await this.runtime.recoveryBook.generate({ runtimeVersion: 'P0009-WIP.10', generatedBy: this.options.actorId, workspaceProfile: this.runtime.workspaceProfile }); downloadBlob(`KalinumX_Recovery_Book_${book.generatedAt.replace(/[:.]/g, '-')}.html`, new Blob([book.html], { type: 'text/html;charset=utf-8' })); return book; }
    }
    KX.RecoverySettingsController = RecoverySettingsController;
    async function mountRecoverySettingsPanel(root, runtime, options) {
        const controller = new RecoverySettingsController(runtime, options);
        root.innerHTML = '';
        root.classList.add('kx-recovery-panel');
        const style = recEl('style');
        style.textContent = `
      .kx-recovery-panel{font:12px/1.45 var(--font,system-ui);color:var(--text,#eee)}
      .kx-rec-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.kx-rec-actions button,.kx-rec-row button{border:1px solid var(--border,#444);background:var(--surface2,#161616);color:inherit;border-radius:9px;padding:8px 10px;cursor:pointer}.kx-rec-actions .primary{border-color:var(--accent,#c9a76b);color:var(--accent,#c9a76b)}
      .kx-rec-note{color:var(--muted,#999);margin:8px 0 14px}.kx-rec-list{display:grid;gap:8px}.kx-rec-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;border:1px solid var(--border,#333);border-radius:12px;padding:10px;background:var(--surface2,#151515)}.kx-rec-row small{display:block;color:var(--muted,#999);margin-top:3px}.kx-rec-status{font-weight:700}.kx-rec-status.ok{color:#7cd992}.kx-rec-status.bad{color:#ff7a86}.kx-rec-empty{padding:14px;border:1px dashed var(--border,#444);border-radius:10px;color:var(--muted,#999)}
    `;
        root.append(style);
        const head = recEl('div');
        head.innerHTML = `<h3 style="margin:0 0 4px">Zálohy a obnova</h3><div class="kx-rec-note">Snapshot je konzistentní export canonical Core dat. Běžný snapshot neobsahuje binární obsah souborů; úplný snapshot s binárními daty je větší a používá se pro recovery.</div>`;
        root.append(head);
        const actions = recEl('div', 'kx-rec-actions');
        const create = recEl('button', 'primary', 'Vytvořit Recovery Snapshot');
        const full = recEl('button', undefined, 'Úplný snapshot včetně souborů');
        const book = recEl('button', undefined, 'Vygenerovat Knihu systému');
        actions.append(create, full, book);
        root.append(actions);
        const list = recEl('div', 'kx-rec-list');
        root.append(list);
        let rows = await controller.list();
        const toast = (m) => options.onToast?.(m);
        const render = async () => {
            list.innerHTML = '';
            rows = await controller.list();
            if (!rows.length) {
                list.append(recEl('div', 'kx-rec-empty', 'Zatím nebyl vytvořen žádný Recovery Snapshot.'));
                return;
            }
            for (const row of rows) {
                const verify = await controller.verify(row);
                const item = recEl('div', 'kx-rec-row');
                const info = recEl('div');
                info.innerHTML = `<b>${row.createdAt}</b><small>${row.runtimeVersion} · ${Object.values(row.storeCounts).reduce((a, b) => a + b, 0)} záznamů · ${row.includeFileBlobs ? 'včetně binárních souborů' : 'bez binárních souborů'}</small><small>SHA-256 ${row.sha256.slice(0, 18)}… · <span class="kx-rec-status ${verify.ok ? 'ok' : 'bad'}">${verify.ok ? 'ověřeno' : 'CHYBA INTEGRITY'}</span></small>`;
                const act = recEl('div');
                const check = recEl('button', undefined, 'Ověřit');
                const dl = recEl('button', undefined, 'Export JSON');
                check.onclick = async () => { const r = await controller.verify(row); toast(r.ok ? 'Integrita snapshotu je v pořádku' : 'Snapshot neprošel kontrolou integrity'); await render(); };
                dl.onclick = () => controller.exportSnapshot(row);
                act.append(check, dl);
                item.append(info, act);
                list.append(item);
            }
        };
        create.onclick = async () => { create.disabled = true; try {
            await controller.createSnapshot(false);
            toast('Recovery Snapshot vytvořen');
            await render();
        }
        finally {
            create.disabled = false;
        } };
        full.onclick = async () => { if (!confirm('Vytvořit úplný snapshot včetně binárního obsahu souborů? Může být výrazně větší.'))
            return; full.disabled = true; try {
            await controller.createSnapshot(true);
            toast('Úplný Recovery Snapshot vytvořen');
            await render();
        }
        finally {
            full.disabled = false;
        } };
        book.onclick = async () => { await controller.exportBook(); toast('Kniha systému byla vygenerována'); };
        await render();
        return { reload: render, destroy: () => { root.innerHTML = ''; } };
    }
    KX.mountRecoverySettingsPanel = mountRecoverySettingsPanel;
})(KX || (KX = {}));
