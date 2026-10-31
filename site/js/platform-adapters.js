var KX;
(function (KX) {
    function detectPlatform() {
        const ua = (globalThis.navigator?.userAgent || '').toLowerCase();
        if (/android/.test(ua))
            return 'ANDROID';
        if (/iphone|ipad|ipod/.test(ua))
            return 'IOS';
        if (/windows/.test(ua))
            return 'WINDOWS';
        if (/macintosh|mac os x/.test(ua))
            return 'MACOS';
        return typeof document !== 'undefined' ? 'WEB' : 'UNKNOWN';
    }
    KX.detectPlatform = detectPlatform;
    class TauriWoff2DecoderProvider {
        bridge;
        host;
        id;
        version;
        contract = 'KX.NATIVE_WOFF2_PROVIDER/1';
        constructor(bridge, host) {
            this.bridge = bridge;
            this.host = host;
            this.id = host.providerId;
            this.version = host.providerVersion;
        }
        async decode(bytes, context) {
            if (!(bytes instanceof Uint8Array))
                throw new Error('WOFF2_NATIVE_PROVIDER_BYTES_REQUIRED');
            if (bytes.length < 48 || bytes.length > Number(this.host.maxInputBytes || 0))
                throw new Error('WOFF2_NATIVE_PROVIDER_INPUT_SIZE_LIMIT');
            const expectedSha256 = String(context?.sourceSha256 || '').toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(expectedSha256))
                throw new Error('WOFF2_NATIVE_PROVIDER_SHA256_REQUIRED');
            const result = await this.bridge.invoke('kx_appearance_woff2_decode', { bytes: [...bytes], expectedSha256 });
            if (result.providerId !== this.id || result.providerVersion !== this.version)
                throw new Error('WOFF2_NATIVE_PROVIDER_IDENTITY_MISMATCH');
            if (result.sourceSha256 !== expectedSha256)
                throw new Error('WOFF2_NATIVE_PROVIDER_SOURCE_SHA256_MISMATCH');
            if (!['font/ttf', 'font/otf'].includes(result.decodedMimeType))
                throw new Error('WOFF2_NATIVE_PROVIDER_MIME');
            const decoded = new Uint8Array(result.bytes || []);
            if (decoded.length !== Number(result.declaredSfntSize || 0) || decoded.length > Number(this.host.maxDecodedBytes || 0))
                throw new Error('WOFF2_NATIVE_PROVIDER_DECODED_SIZE');
            if (decoded.length > Math.max(bytes.length, 1) * Number(this.host.maxExpansionRatio || 0))
                throw new Error('WOFF2_NATIVE_PROVIDER_EXPANSION_RATIO');
            const decodedSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', decoded))].map(x => x.toString(16).padStart(2, '0')).join('');
            if (decodedSha256 !== String(result.decodedSha256 || '').toLowerCase())
                throw new Error('WOFF2_NATIVE_PROVIDER_DECODED_SHA256_MISMATCH');
            return decoded;
        }
    }
    KX.TauriWoff2DecoderProvider = TauriWoff2DecoderProvider;
    async function attachNativeWoff2DecoderProvider(runtime) {
        if (!runtime?.appearanceWoff2Decoder)
            return { attached: false, reason: 'WOFF2_ADAPTER_NOT_INSTALLED' };
        if (!KX.TauriGlobalBridge.available())
            return { attached: false, reason: 'NATIVE_HOST_UNAVAILABLE' };
        const bridge = new KX.TauriGlobalBridge();
        try {
            const host = await bridge.invoke('kx_appearance_woff2_decoder_status');
            if (!host?.available)
                return { attached: false, reason: 'NATIVE_WOFF2_DECODER_UNAVAILABLE', host };
            if (host.contractVersion !== 'KX.NATIVE_WOFF2_PROVIDER/1' || host.browserFontFaceBypass !== 'FORBIDDEN' || host.remoteDecoder !== 'FORBIDDEN')
                throw new Error('WOFF2_NATIVE_PROVIDER_CONTRACT_MISMATCH');
            const provider = new TauriWoff2DecoderProvider(bridge, host);
            runtime.appearanceWoff2Decoder.attachTrustedHostDecoder(provider);
            return { attached: true, provider: { id: provider.id, version: provider.version }, host };
        }
        catch (error) {
            runtime.appearanceWoff2Decoder.detachTrustedHostDecoder?.();
            return { attached: false, reason: String(error?.message || error) };
        }
    }
    KX.attachNativeWoff2DecoderProvider = attachNativeWoff2DecoderProvider;
    class InAppNotificationAdapter {
        code = 'ADAPTER.NOTIFY.IN_APP';
        platform = detectPlatform();
        native = false;
        available() { return true; }
        async requestPermission() { return 'GRANTED'; }
        async show(alarm) {
            if (typeof document !== 'undefined')
                document.dispatchEvent(new CustomEvent('kx:alarm', { detail: { alarm } }));
            return { ok: true, adapter: this.code, channel: 'IN_APP' };
        }
    }
    KX.InAppNotificationAdapter = InAppNotificationAdapter;
    class BrowserSystemNotificationAdapter {
        code = 'ADAPTER.NOTIFY.WEB_NOTIFICATION';
        platform = detectPlatform();
        native = false;
        available() { return typeof Notification !== 'undefined'; }
        async requestPermission() { if (!this.available())
            return 'UNSUPPORTED'; const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission; return p === 'granted' ? 'GRANTED' : 'DENIED'; }
        async show(alarm) { if (!this.available())
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: 'Notification API není dostupné' }; if (Notification.permission !== 'granted')
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: 'Oprávnění k notifikacím není uděleno' }; new Notification(alarm.title, { body: `KalinumX · ${new Date(alarm.triggerAt).toLocaleString()}`, tag: alarm.id }); return { ok: true, adapter: this.code, channel: 'SYSTEM' }; }
    }
    KX.BrowserSystemNotificationAdapter = BrowserSystemNotificationAdapter;
    function notificationId(value) { let h = 0; for (let i = 0; i < value.length; i++)
        h = (h * 31 + value.charCodeAt(i)) | 0; return h || 1; }
    class TauriNotificationAdapter {
        code = 'ADAPTER.NOTIFY.TAURI_PLUGIN';
        platform = detectPlatform();
        native = true;
        api() { return globalThis.__TAURI__?.notification; }
        available() { const n = this.api(); return !!n && typeof n.sendNotification === 'function'; }
        async requestPermission() { const n = this.api(); if (!n)
            return 'UNSUPPORTED'; try {
            const granted = typeof n.isPermissionGranted === 'function' ? await n.isPermissionGranted() : false;
            if (granted)
                return 'GRANTED';
            const p = typeof n.requestPermission === 'function' ? await n.requestPermission() : 'denied';
            return p === 'granted' ? 'GRANTED' : 'DENIED';
        }
        catch {
            return 'UNSUPPORTED';
        } }
        async show(alarm) { const n = this.api(); if (!n)
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: 'Tauri notification plugin není dostupný' }; try {
            n.sendNotification({ id: notificationId(alarm.id), title: alarm.title, body: `KalinumX · ${new Date(alarm.triggerAt).toLocaleString()}`, tag: alarm.id, sound: alarm.sound, extra: { alarmId: alarm.id } });
            return { ok: true, adapter: this.code, channel: 'SYSTEM' };
        }
        catch (error) {
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: String(error) };
        } }
        async schedule(alarm) { const n = this.api(); if (!n)
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: 'Tauri notification plugin není dostupný' }; if (!['ANDROID', 'IOS'].includes(this.platform))
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: 'Nativní plánované notifikace plugin podporuje jen na mobilních platformách' }; try {
            if (!n.Schedule?.at)
                throw new Error('Schedule API není dostupné');
            const date = new Date(alarm.status === 'SNOOZED' && alarm.snoozeUntil ? alarm.snoozeUntil : alarm.triggerAt);
            n.sendNotification({ id: notificationId(alarm.id), title: alarm.title, body: 'KalinumX připomínka', tag: alarm.id, sound: alarm.sound, schedule: n.Schedule.at(date, false, true), extra: { alarmId: alarm.id } });
            return { ok: true, adapter: this.code, channel: 'SYSTEM' };
        }
        catch (error) {
            return { ok: false, adapter: this.code, channel: 'SYSTEM', reason: String(error) };
        } }
        async cancel(alarmId) { const n = this.api(); if (n && typeof n.cancel === 'function')
            await n.cancel([notificationId(alarmId)]); }
    }
    KX.TauriNotificationAdapter = TauriNotificationAdapter;
    class DisabledEmailNotificationAdapter {
        code = 'ADAPTER.NOTIFY.EMAIL.DISABLED';
        available() { return false; }
        async send(_alarm) { return { ok: false, adapter: this.code, channel: 'EMAIL', reason: 'E-mailový provider zatím není nakonfigurován' }; }
    }
    KX.DisabledEmailNotificationAdapter = DisabledEmailNotificationAdapter;
    class NotificationCoordinator {
        runtime;
        inApp;
        system;
        email;
        unsubs = [];
        constructor(runtime, inApp = new InAppNotificationAdapter(), system = (KX.TauriGlobalBridge.available() ? new TauriNotificationAdapter() : new BrowserSystemNotificationAdapter()), email = new DisabledEmailNotificationAdapter()) {
            this.runtime = runtime;
            this.inApp = inApp;
            this.system = system;
            this.email = email;
        }
        start() {
            if (this.unsubs.length)
                return;
            this.unsubs.push(this.runtime.events.on('EVENT.CORE.ALARM.FIRED', async (e) => { const id = String(e.payload?.id || ''); if (!id)
                return; const alarm = await this.runtime.alarms.get(id); if (alarm)
                await this.deliver(alarm); }));
            this.unsubs.push(this.runtime.events.on('EVENT.CORE.ALARM.CREATED', async (e) => this.reschedule(String(e.payload?.id || ''))));
            this.unsubs.push(this.runtime.events.on('EVENT.CORE.ALARM.UPDATED', async (e) => this.reschedule(String(e.payload?.id || ''))));
        }
        stop() { for (const x of this.unsubs)
            x(); this.unsubs = []; }
        async reschedule(id) { if (!id || !this.system.schedule)
            return; const alarm = await this.runtime.alarms.get(id); if (!alarm)
            return; if (['CANCELLED', 'ACKNOWLEDGED', 'FIRED'].includes(alarm.status)) {
            await this.system.cancel?.(alarm.id);
            return;
        } if (alarm.channels.includes('SYSTEM'))
            await this.system.schedule(alarm); }
        async reconcile() { for (const alarm of await this.runtime.alarms.list())
            await this.reschedule(alarm.id); }
        async deliver(alarm) { const out = []; if (alarm.channels.includes('IN_APP'))
            out.push(await this.inApp.show(alarm)); if (alarm.channels.includes('SYSTEM'))
            out.push(await this.system.show(alarm)); if (alarm.channels.includes('EMAIL'))
            out.push(await this.email.send(alarm)); return out; }
        status() { return { platform: detectPlatform(), inApp: { code: this.inApp.code, available: this.inApp.available() }, system: { code: this.system.code, available: this.system.available(), native: this.system.native }, email: { code: this.email.code, available: this.email.available() } }; }
    }
    KX.NotificationCoordinator = NotificationCoordinator;
    class DesktopLifecyclePolicyService {
        runtime;
        deviceId;
        bridge;
        nativeAvailable;
        actionCode = 'ACTION.CORE.LIFECYCLE.POLICY.APPLY';
        constructor(runtime, deviceId, bridge = new KX.TauriGlobalBridge(), nativeAvailable = KX.TauriGlobalBridge.available()) {
            this.runtime = runtime;
            this.deviceId = deviceId;
            this.bridge = bridge;
            this.nativeAvailable = nativeAvailable;
            if (!this.runtime.actions.list().some(x => x.code === this.actionCode)) {
                this.runtime.actions.register({
                    code: this.actionCode,
                    ownerApp: 'APP.NEXUS',
                    risk: 'EXTERNAL_ACTION',
                    permission: 'CORE.LIFECYCLE.MANAGE',
                    handler: async (payload) => this.applyNative(payload),
                });
            }
        }
        fallback() { return { supported: false, closeBehavior: 'TERMINATE', autostartRequested: false, autostartEnabled: false, autostartSupported: false, trayAvailable: false }; }
        async applyNative(input) {
            if (!this.nativeAvailable)
                throw new Error('Desktop lifecycle policy vyžaduje native KalinumX host');
            return this.bridge.invoke('kx_lifecycle_policy_set', { closeBehavior: input.closeBehavior, autostart: input.autostart });
        }
        async status() { if (!this.nativeAvailable)
            return this.fallback(); try {
            return await this.bridge.invoke('kx_lifecycle_policy_get');
        }
        catch {
            return this.fallback();
        } }
        async apply(input, confirmed) {
            return this.runtime.actions.invoke(this.actionCode, input, { actorId: 'USER.LUKAS', appCode: 'APP.NEXUS', deviceId: this.deviceId, permissions: ['CORE.LIFECYCLE.MANAGE'], confirmed });
        }
    }
    KX.DesktopLifecyclePolicyService = DesktopLifecyclePolicyService;
    class AISecretEnrollmentService {
        runtime;
        bridge;
        nativeAvailable;
        actionCode = 'ACTION.CORE.AI.SECRET.ENROLLMENT.BEGIN';
        constructor(runtime, bridge = new KX.TauriGlobalBridge(), nativeAvailable = KX.TauriGlobalBridge.available()) {
            this.runtime = runtime;
            this.bridge = bridge;
            this.nativeAvailable = nativeAvailable;
            if (!this.runtime.actions.list().some(x => x.code === this.actionCode)) {
                this.runtime.actions.register({
                    code: this.actionCode,
                    ownerApp: 'APP.KX.AI',
                    risk: 'EXTERNAL_ACTION',
                    permission: 'CORE.AI.CONNECTION.MANAGE',
                    handler: payload => this.beginNative(payload),
                });
            }
        }
        fallback(reason = 'Native secure credential backend není dostupný') { return { supported: false, backend: this.nativeAvailable ? 'UNCONFIGURED' : 'UNAVAILABLE', enrollmentMode: 'NATIVE_PROMPT_ONLY', secretsExportable: false, contractVersion: 'KX.AI_SECRET_BACKEND/1', lifecycleStates: ['NOT_CONFIGURED', 'READY', 'NEEDS_REAUTH', 'DISABLED', 'ERROR'], reason }; }
        async status() { if (!this.nativeAvailable)
            return this.fallback(); try {
            return await this.bridge.invoke('kx_ai_secret_store_status');
        }
        catch (error) {
            return this.fallback(String(error));
        } }
        async connectionStatus(input) {
            if (!this.nativeAvailable)
                return { connectionId: input.connectionId, providerCode: input.providerCode, state: 'NOT_CONFIGURED', usable: false, needsReauth: false, backend: 'UNAVAILABLE', reason: 'Native secure credential backend není dostupný' };
            try {
                return await this.bridge.invoke('kx_ai_secret_connection_status', { connectionId: input.connectionId, providerCode: input.providerCode });
            }
            catch (error) {
                return { connectionId: input.connectionId, providerCode: input.providerCode, state: 'ERROR', usable: false, needsReauth: false, backend: 'UNCONFIGURED', reason: String(error) };
            }
        }
        async beginNative(input) {
            if (!this.nativeAvailable)
                throw new Error('AI secure enrollment vyžaduje native KalinumX host');
            return this.bridge.invoke('kx_ai_secret_enrollment_begin', { connectionId: input.connectionId, providerCode: input.providerCode });
        }
        async begin(input, confirmed = false) { return this.runtime.actions.invoke(this.actionCode, input, { actorId: 'USER.LUKAS', appCode: 'APP.KX.AI', permissions: ['CORE.AI.CONNECTION.MANAGE'], confirmed }); }
    }
    KX.AISecretEnrollmentService = AISecretEnrollmentService;
    class PlatformLifecycleCoordinator {
        runtime;
        sessionId;
        state = 'FOREGROUND';
        listeners = [];
        heartbeatTimer;
        nativeUnlisten;
        nativeListenGeneration = 0;
        schedulerTimer;
        schedulerTickBusy = false;
        heartbeatMs = 30_000;
        schedulerMs = 30_000;
        constructor(runtime, sessionId) {
            this.runtime = runtime;
            this.sessionId = sessionId;
        }
        current() { return this.state; }
        schedulerAllowed(next = this.state) {
            const platform = detectPlatform(), native = KX.TauriGlobalBridge.available();
            return next === 'FOREGROUND' || (next === 'BACKGROUND' && native && ['WINDOWS', 'MACOS'].includes(platform));
        }
        async tickScheduler() {
            if (this.schedulerTickBusy || !this.schedulerAllowed())
                return;
            this.schedulerTickBusy = true;
            try {
                await this.runtime.scheduler.tick(new Date().toISOString(), { actorId: 'SYSTEM', appCode: 'APP.NEXUS', deviceId: undefined });
            }
            catch { }
            finally {
                this.schedulerTickBusy = false;
            }
        }
        refreshScheduler() {
            if (this.schedulerAllowed()) {
                if (!this.schedulerTimer)
                    this.schedulerTimer = setInterval(() => { void this.tickScheduler(); }, this.schedulerMs);
                void this.tickScheduler();
            }
            else if (this.schedulerTimer) {
                clearInterval(this.schedulerTimer);
                this.schedulerTimer = undefined;
            }
        }
        async updateSession(next) {
            if (!this.sessionId)
                return;
            if (next === 'TERMINATING')
                await this.runtime.devices.closeSession(this.sessionId);
            else
                await this.runtime.devices.touchSession(this.sessionId);
        }
        async set(next, reason) {
            if (this.state === next)
                return;
            this.state = next;
            try {
                await this.updateSession(next);
            }
            catch { }
            await this.runtime.events.emit({ id: `EVT.LIFECYCLE.${Date.now()}`, code: 'EVENT.CORE.PLATFORM.LIFECYCLE', at: new Date().toISOString(), actorId: 'SYSTEM', appCode: 'APP.NEXUS', rootChangeId: `CHG.LIFECYCLE.${Date.now()}`, payload: { state: next, reason, platform: detectPlatform(), sessionId: this.sessionId } });
            this.refreshScheduler();
        }
        start() {
            if (typeof document === 'undefined' || this.listeners.length)
                return;
            const visibility = () => { void this.set(document.visibilityState === 'hidden' ? 'BACKGROUND' : 'FOREGROUND', 'visibilitychange'); };
            const pagehide = () => { void this.set('SUSPENDED', 'pagehide'); };
            const pageshow = () => { void this.set('FOREGROUND', 'pageshow'); };
            const terminate = () => { void this.set('TERMINATING', 'beforeunload'); };
            document.addEventListener('visibilitychange', visibility);
            globalThis.addEventListener?.('pagehide', pagehide);
            globalThis.addEventListener?.('pageshow', pageshow);
            globalThis.addEventListener?.('beforeunload', terminate);
            this.listeners = [() => document.removeEventListener('visibilitychange', visibility), () => globalThis.removeEventListener?.('pagehide', pagehide), () => globalThis.removeEventListener?.('pageshow', pageshow), () => globalThis.removeEventListener?.('beforeunload', terminate)];
            const eventApi = globalThis.__TAURI__?.event;
            if (typeof eventApi?.listen === 'function') {
                const generation = ++this.nativeListenGeneration;
                void eventApi.listen('kx://platform/lifecycle', (event) => {
                    const payload = event?.payload || {};
                    const next = String(payload.state || '');
                    if (['FOREGROUND', 'BACKGROUND', 'SUSPENDED', 'TERMINATING'].includes(next))
                        void this.set(next, String(payload.reason || 'native'));
                }).then((unlisten) => {
                    if (typeof unlisten !== 'function')
                        return;
                    if (generation !== this.nativeListenGeneration) {
                        unlisten();
                        return;
                    }
                    this.nativeUnlisten = unlisten;
                }).catch(() => { });
            }
            if (this.sessionId && !this.heartbeatTimer)
                this.heartbeatTimer = setInterval(() => { if (this.state !== 'TERMINATING')
                    void this.runtime.devices.touchSession(this.sessionId); }, this.heartbeatMs);
            this.refreshScheduler();
        }
        stop() { for (const x of this.listeners)
            x(); this.listeners = []; this.nativeListenGeneration++; this.nativeUnlisten?.(); this.nativeUnlisten = undefined; if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        } if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
            this.schedulerTimer = undefined;
        } }
        policy() { const platform = detectPlatform(); const native = KX.TauriGlobalBridge.available(), desktopNative = native && ['WINDOWS', 'MACOS'].includes(platform); return { platform, state: this.state, schedulerWhileForeground: true, schedulerWhileBackground: desktopNative, desktopTrayBridge: desktopNative, sessionHeartbeatMs: this.heartbeatMs, schedulerIntervalMs: this.schedulerMs, staleSessionAfterMs: 300_000, osWakeRequired: ['ANDROID', 'IOS'].includes(platform), trayRecommended: ['WINDOWS', 'MACOS'].includes(platform), note: ['ANDROID', 'IOS'].includes(platform) ? 'Mobilní OS může aplikaci uspat; kritické alarmy potřebují native scheduled notification/background capability.' : desktopNative ? 'Desktop native host může držet scheduler i po zavření okna do tray.' : 'Web drží scheduler jen při aktivní stránce; background běh není garantovaný.' }; }
    }
    KX.PlatformLifecycleCoordinator = PlatformLifecycleCoordinator;
    class CapabilityDiagnosticsService {
        runtime;
        workspace;
        constructor(runtime, workspace) {
            this.runtime = runtime;
            this.workspace = workspace;
        }
        async collect(deviceId) {
            const native = KX.TauriGlobalBridge.available();
            const notification = new NotificationCoordinator(this.runtime).status();
            let nativeWorkspace, nativeLifecycle;
            let aiSecretStore, nativeWoff2Decoder;
            if (native) {
                const bridge = new KX.TauriGlobalBridge();
                try {
                    nativeWorkspace = await bridge.invoke('kx_workspace_status');
                }
                catch { }
                try {
                    nativeLifecycle = await bridge.invoke('kx_lifecycle_policy_get');
                }
                catch { }
                try {
                    aiSecretStore = await bridge.invoke('kx_ai_secret_store_status');
                }
                catch { }
                try {
                    nativeWoff2Decoder = await bridge.invoke('kx_appearance_woff2_decoder_status');
                }
                catch { }
            }
            const nativeRootState = !native ? 'UNAVAILABLE' : nativeWorkspace?.databaseReady ? (nativeWorkspace.rootKind === 'PORTABLE_FALLBACK' ? 'DEGRADED' : 'AVAILABLE') : 'DEGRADED';
            const capabilities = {
                'CORE.STORAGE.LOCAL': 'AVAILABLE',
                'CORE.STORAGE.NATIVE_SQLITE': this.runtime.repository.mode === 'NATIVE_SQLITE' ? 'AVAILABLE' : 'UNAVAILABLE',
                'CORE.STORAGE.INDEXED_DB': this.runtime.repository.mode === 'INDEXED_DB' ? 'AVAILABLE' : 'UNAVAILABLE',
                'CORE.FILE.MANAGED_NATIVE': native ? 'AVAILABLE' : 'UNAVAILABLE',
                'CORE.NOTIFICATION.IN_APP': notification.inApp.available ? 'AVAILABLE' : 'UNAVAILABLE',
                'CORE.NOTIFICATION.SYSTEM': notification.system.available ? 'AVAILABLE' : 'UNAVAILABLE',
                'CORE.NOTIFICATION.EMAIL': notification.email.available ? 'AVAILABLE' : 'UNAVAILABLE',
                'CORE.WORKSPACE.SWITCH': 'AVAILABLE',
                'CORE.WORKSPACE.NATIVE_ROOT': nativeRootState,
                'CORE.SYNC.SERVER': this.workspace.mode === 'SERVER_CONNECTED' ? 'DEGRADED' : 'UNKNOWN',
                'CORE.BACKGROUND.OS': ['ANDROID', 'IOS'].includes(detectPlatform()) && notification.system.native ? 'DEGRADED' : 'UNKNOWN',
                'CORE.BACKGROUND.DESKTOP_TRAY': nativeLifecycle?.trayAvailable ? 'AVAILABLE' : 'UNKNOWN',
                'CORE.LIFECYCLE.CLOSE_POLICY': nativeLifecycle?.supported ? 'AVAILABLE' : native ? 'DEGRADED' : 'UNAVAILABLE',
                'CORE.LIFECYCLE.AUTOSTART': nativeLifecycle?.autostartSupported ? 'AVAILABLE' : native ? 'DEGRADED' : 'UNAVAILABLE',
                'CORE.AI.SECRET_STORE': aiSecretStore?.supported ? 'AVAILABLE' : native ? 'DEGRADED' : 'UNAVAILABLE',
                'CORE.APPEARANCE.WOFF2.NATIVE_DECODER': nativeWoff2Decoder?.available ? 'AVAILABLE' : native ? 'DEGRADED' : 'UNAVAILABLE'
            };
            const row = { id: `CAP.${deviceId}.${Date.now()}`, deviceId, workspaceId: this.workspace.id, at: new Date().toISOString(), platform: detectPlatform(), repository: this.runtime.repository.mode, nativeBridge: native, online: typeof navigator === 'undefined' ? true : navigator.onLine !== false, capabilities, detail: { workspaceMode: this.workspace.mode, notification, nativeWorkspace, nativeLifecycle, aiSecretStore, nativeWoff2Decoder } };
            await this.runtime.devices.recordCapabilities(row);
            return row;
        }
    }
    KX.CapabilityDiagnosticsService = CapabilityDiagnosticsService;
})(KX || (KX = {}));
