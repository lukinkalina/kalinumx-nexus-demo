var KXSettingsDomainProfiles;
(function (NS) {
    const CONTRACT = 'KX.SETTINGS_DOMAIN_PROFILE/1';
    const READINESS_CONTRACT = 'KX.SETTINGS_DOMAIN_READINESS/1';
    const PORTABILITY_CONTRACT = 'KX.SETTINGS_PROFILE_PORTABILITY/1';
    const SEARCH_CONTRACT = 'KX.SETTINGS_SEARCH_IMPACT/1';
    const clone = (x) => structuredClone(x);
    const tags = (d) => new Set((d?.tags || []).map(String));
    const isDomain = (d) => tags(d).has('DOMAIN_SETTING');
    const ALLOWED_PROFILE_STATUS = new Set(['BASE_ONLY', 'REFERENCE_VERIFIED', 'DOMAIN_SETTINGS_UNVERIFIED']);
    const ALLOWED_READINESS = new Set(['REFERENCE_VERIFIED', 'NO_VERIFIED_DOMAIN_EVIDENCE', 'EVIDENCE_PRESENT_PROFILE_PENDING', 'DOMAIN_SETTINGS_UNVERIFIED', 'CORE_OWNER_NOT_APPLICABLE']);
    class SettingsDomainProfileService {
        runtime;
        apps;
        definitions;
        profileMap = new Map();
        constructor(runtime, apps, definitions, profiles) {
            this.runtime = runtime;
            this.apps = apps;
            this.definitions = definitions;
            /* N2.3b: no fixed hub count (a new hub must not break settings) – at least the 48 original hubs, and exactly one profile per registered hub */
            if ((apps || []).length < 48)
                throw new Error(`Settings domain profiles require at least 48 registered hubs, got ${(apps || []).length}`);
            if ((profiles || []).length !== (apps || []).length)
                throw new Error(`Settings domain profile registry requires one profile per hub (${(apps || []).length}), got ${(profiles || []).length}`);
            const appCodes = new Set(apps.map((x) => String(x.code)));
            for (const raw of profiles) {
                const p = clone(raw);
                if (p.contract !== CONTRACT || p.schemaVersion !== 1 || !appCodes.has(p.appCode))
                    throw new Error(`Invalid settings domain profile ${p.appCode}`);
                if (this.profileMap.has(p.appCode))
                    throw new Error(`Duplicate settings domain profile ${p.appCode}`);
                if (!ALLOWED_PROFILE_STATUS.has(p.status))
                    throw new Error(`Unknown settings domain profile status ${p.appCode}:${p.status}`);
                if (p.readiness?.contract !== READINESS_CONTRACT || !ALLOWED_READINESS.has(p.readiness?.code))
                    throw new Error(`Invalid settings domain readiness ${p.appCode}`);
                const domainKeys = Array.isArray(p.domainSettingKeys) ? p.domainSettingKeys : [];
                const evidence = Array.isArray(p.evidenceFeatureCodes) ? p.evidenceFeatureCodes : [];
                if (p.status === 'REFERENCE_VERIFIED' && (!domainKeys.length || !evidence.length || p.readiness.code !== 'REFERENCE_VERIFIED'))
                    throw new Error(`Reference profile requires explicit domain settings + verified evidence ${p.appCode}`);
                if (p.status === 'BASE_ONLY' && domainKeys.length)
                    throw new Error(`BASE_ONLY profile cannot contain domain settings ${p.appCode}`);
                if (p.status === 'DOMAIN_SETTINGS_UNVERIFIED' && (!domainKeys.length || evidence.length))
                    throw new Error(`Unverified domain profile must contain settings without trusted evidence ${p.appCode}`);
                if (p.appCode === 'APP.KX.NEXUS' && p.readiness.code !== 'CORE_OWNER_NOT_APPLICABLE')
                    throw new Error('Core owner readiness classification drift');
                if (p.appCode !== 'APP.KX.NEXUS' && p.status === 'BASE_ONLY' && p.readiness.code !== 'NO_VERIFIED_DOMAIN_EVIDENCE' && p.readiness.code !== 'EVIDENCE_PRESENT_PROFILE_PENDING')
                    throw new Error(`BASE_ONLY specialist readiness mismatch ${p.appCode}`);
                this.profileMap.set(p.appCode, p);
            }
            for (const p of this.profileMap.values()) {
                const actualDomainKeys = definitions.filter((d) => d.appCode === p.appCode && isDomain(d)).map((d) => d.key).sort();
                const declaredDomainKeys = [...(p.domainSettingKeys || [])].map(String).sort();
                if (JSON.stringify(actualDomainKeys) !== JSON.stringify(declaredDomainKeys))
                    throw new Error(`Domain profile key catalog drift ${p.appCode}`);
            }
            for (const d of definitions) {
                if (!isDomain(d))
                    continue;
                if (d.appCode === 'CORE')
                    throw new Error(`Domain setting cannot be CORE: ${d.key}`);
                if (!d.key.startsWith(`app.${d.appCode}.`))
                    throw new Error(`Domain setting namespace mismatch ${d.key}`);
                if (!d.domainProfileVersion || d.domainProfileVersion < 1)
                    throw new Error(`Domain setting missing profile version ${d.key}`);
                if (!d.domainCapability)
                    throw new Error(`Domain setting missing capability ${d.key}`);
                if (!d.impact?.services?.length || !d.impact?.modules?.length)
                    throw new Error(`Domain setting missing impact ${d.key}`);
                if (d.impact.dataOwnership !== 'SPECIALIST_OWNER')
                    throw new Error(`Domain setting must preserve specialist ownership ${d.key}`);
            }
            const laser = this.profileMap.get('APP.KX.LASER');
            if (!laser || laser.status !== 'REFERENCE_VERIFIED' || laser.domainSettingKeys.length < 40 || !laser.evidenceFeatureCodes.includes('FEATURE.LASER.SETTINGS_PROFILE'))
                throw new Error('LASER reference settings domain profile incomplete');
            const ai = this.profileMap.get('APP.KX.AI');
            if (!ai || ai.status !== 'REFERENCE_VERIFIED' || ai.domainSettingKeys.length < 16 || !ai.evidenceFeatureCodes.includes('FEATURE.AI.PROVIDER_ACCOUNT_SETTINGS'))
                throw new Error('AI reference settings domain profile incomplete');
            const baseOnly = [...this.profileMap.values()].filter((x) => x.status === 'BASE_ONLY');
            const unverified = [...this.profileMap.values()].filter((x) => x.status === 'DOMAIN_SETTINGS_UNVERIFIED');
            /* all profiles except the two references (LASER, AI) are BASE_ONLY – derived from the hub count (was a fixed 46 = 48 − 2) */ if (baseOnly.length !== this.profileMap.size - 2)
                throw new Error(`Expected ${this.profileMap.size - 2} BASE_ONLY domain profiles, got ${baseOnly.length}`);
            if (unverified.length !== 0)
                throw new Error(`Domain settings without verified evidence are forbidden in current source, got ${unverified.length}`);
            const promotionReady = baseOnly.filter((x) => x.readiness?.code === 'EVIDENCE_PRESENT_PROFILE_PENDING');
            if (promotionReady.length !== 0)
                throw new Error(`No third domain profile is evidence-ready in DELTA057, got ${promotionReady.length}`);
        }
        profile(appCode) { const p = this.profileMap.get(appCode); return p ? clone(p) : undefined; }
        list() { return [...this.profileMap.values()].sort((a, b) => a.appCode.localeCompare(b.appCode)).map(clone); }
        readiness(appCode) {
            const rows = (appCode ? [this.profileMap.get(appCode)].filter(Boolean) : [...this.profileMap.values()]).map((p) => ({ appCode: p.appCode, name: p.name, status: p.status, domainSettings: p.domainSettingKeys.length, evidenceFeatureCodes: clone(p.evidenceFeatureCodes || []), readiness: clone(p.readiness) }));
            if (appCode && !rows.length)
                throw new Error(`Unknown settings domain app ${appCode}`);
            return { contract: READINESS_CONTRACT, rows, summary: this.readinessSummary() };
        }
        readinessSummary() {
            const profiles = [...this.profileMap.values()];
            const count = (code) => profiles.filter((x) => x.readiness?.code === code).length;
            return { registeredApps: profiles.length, referenceVerified: profiles.filter((x) => x.status === 'REFERENCE_VERIFIED').length, baseOnly: profiles.filter((x) => x.status === 'BASE_ONLY').length, coreOwnerNotApplicable: count('CORE_OWNER_NOT_APPLICABLE'), noVerifiedDomainEvidence: count('NO_VERIFIED_DOMAIN_EVIDENCE'), evidencePresentProfilePending: count('EVIDENCE_PRESENT_PROFILE_PENDING'), domainSettingsUnverified: profiles.filter((x) => x.status === 'DOMAIN_SETTINGS_UNVERIFIED').length, promotionReady: profiles.filter((x) => x.readiness?.promotionReady === true).length };
        }
        coverage() {
            const profiles = this.list(), domainDefinitions = this.definitions.filter(isDomain), laserDomainDefinitions = domainDefinitions.filter(x => x.appCode === 'APP.KX.LASER').length, aiDomainDefinitions = domainDefinitions.filter(x => x.appCode === 'APP.KX.AI').length;
            return { contract: CONTRACT, apps: profiles.length, baseOnlyApps: profiles.filter((x) => x.status === 'BASE_ONLY').length, domainApps: profiles.filter((x) => x.status === 'REFERENCE_VERIFIED').length, unverifiedDomainApps: profiles.filter((x) => x.status === 'DOMAIN_SETTINGS_UNVERIFIED').length, domainDefinitions: domainDefinitions.length, laserDomainDefinitions, aiDomainDefinitions, readiness: this.readinessSummary(), profiles };
        }
        impact(key) {
            const definition = this.runtime.settingsDefaults.get(key);
            if (!definition)
                throw new Error(`Unknown setting default ${key}`);
            const classification = definition.appCode === 'CORE' ? 'CORE' : isDomain(definition) ? 'DOMAIN' : 'HUB_BASE';
            return { contract: CONTRACT, key, appCode: definition.appCode, classification, capability: definition.domainCapability, impact: definition.impact ? clone(definition.impact) : undefined, definition, profile: definition.appCode === 'CORE' ? undefined : this.profile(definition.appCode) };
        }
    }
    class SettingsProfilePortabilityService {
        runtime;
        domains;
        maxRows = 256;
        constructor(runtime, domains) {
            this.runtime = runtime;
            this.domains = domains;
        }
        appCode(raw) { const appCode = String(raw || ''); if (appCode === 'CORE')
            return appCode; if (!this.domains.profile(appCode))
            throw new Error(`Unknown settings profile app ${appCode}`); return appCode; }
        scope(raw) { const scopeType = String(raw || ''); if (!['APP', 'USER', 'DEVICE'].includes(scopeType))
            throw new Error(`Settings profile scope must be APP, USER or DEVICE, got ${scopeType}`); return scopeType; }
        definitions(appCode, scopeType) { const rows = this.runtime.settingsDefaults.list(appCode).filter((d) => d.allowedScopes.includes(scopeType)); if (!rows.length)
            throw new Error(`No ${scopeType} profile definitions for ${appCode}`); if (rows.length > this.maxRows)
            throw new Error(`Settings profile exceeds ${this.maxRows} definitions`); return rows; }
        expectedAppScope(appCode) { return appCode === 'CORE' ? 'APP.NEXUS' : appCode; }
        target(appCodeRaw, scopeTypeRaw, scopeIdRaw) { const appCode = this.appCode(appCodeRaw), scopeType = this.scope(scopeTypeRaw), scopeId = String(scopeIdRaw || '').trim(); if (!scopeId)
            throw new Error('Settings profile scopeId is required'); if (scopeType === 'APP' && scopeId !== this.expectedAppScope(appCode))
            throw new Error(`APP profile scope mismatch: ${scopeId} != ${this.expectedAppScope(appCode)}`); return { appCode, scopeType, scopeId, definitions: this.definitions(appCode, scopeType) }; }
        can(ctx, p) { return !!ctx.permissions?.includes(p); }
        assertReadTarget(scopeType, scopeId, ctx) { if (ctx.actorId === 'SYSTEM')
            return; if (!this.can(ctx, 'CORE.SETTING.READ'))
            throw new Error('Permission denied: CORE.SETTING.READ'); if (scopeType === 'USER' && scopeId !== ctx.actorId && !this.can(ctx, 'CORE.SETTING.MANAGE_USERS'))
            throw new Error(`Scope denied: cannot read USER ${scopeId}`); if (scopeType === 'DEVICE' && scopeId !== ctx.deviceId && !this.can(ctx, 'CORE.SETTING.MANAGE_DEVICES'))
            throw new Error(`Scope denied: cannot read DEVICE ${scopeId}`); if (scopeType === 'APP' && !this.can(ctx, 'CORE.SETTING.MANAGE_GLOBAL'))
            throw new Error('Scope denied: APP profile read requires CORE.SETTING.MANAGE_GLOBAL'); }
        async explicitRows(appCode, scopeType, scopeId, definitions) { const keys = new Set(definitions.map(x => x.key)), rows = (await this.runtime.settings.list()).filter((x) => x.scopeType === scopeType && x.scopeId === scopeId && keys.has(x.key)).sort((a, b) => a.key.localeCompare(b.key)); return rows; }
        parseProfile(raw) { let profile = raw; if (typeof raw === 'string') {
            if (raw.length > 262144)
                throw new Error('Settings profile JSON exceeds 256 KiB');
            try {
                profile = JSON.parse(raw);
            }
            catch {
                throw new Error('Settings profile JSON is invalid');
            }
        } if (!profile || typeof profile !== 'object')
            throw new Error('Settings profile payload is required'); if (profile.contract !== PORTABILITY_CONTRACT || profile.schemaVersion !== 1 || profile.mode !== 'EXPLICIT_OVERRIDES')
            throw new Error('Unsupported settings profile contract'); if (JSON.stringify(profile).length > 262144)
            throw new Error('Settings profile payload exceeds 256 KiB'); return clone(profile); }
        async exportProfile(input, ctx) { const t = this.target(input?.appCode, input?.scopeType, input?.scopeId); this.assertReadTarget(t.scopeType, t.scopeId, ctx); const rows = await this.explicitRows(t.appCode, t.scopeType, t.scopeId, t.definitions), profile = { contract: PORTABILITY_CONTRACT, schemaVersion: 1, mode: 'EXPLICIT_OVERRIDES', appCode: t.appCode, scopeType: t.scopeType, scopeId: t.scopeId, exportedAt: new Date().toISOString(), rows: rows.map((x) => ({ key: x.key, value: clone(x.value) })) }; return { contract: PORTABILITY_CONTRACT, readOnly: true, definitionCount: t.definitions.length, explicitOverrideCount: rows.length, profile }; }
        async previewImport(raw, ctx) { const profile = this.parseProfile(raw?.profile ?? raw), t = this.target(profile.appCode, profile.scopeType, profile.scopeId); this.assertReadTarget(t.scopeType, t.scopeId, ctx); const defs = new Map(t.definitions.map((x) => [x.key, x])), incoming = new Map(); for (const item of profile.rows || []) {
            const key = String(item?.key || '');
            if (!defs.has(key))
                throw new Error(`Settings profile key outside selected app/scope: ${key}`);
            if (incoming.has(key))
                throw new Error(`Duplicate settings profile key ${key}`);
            incoming.set(key, this.runtime.settingsDefaults.validateValue(key, item.value));
        } if (incoming.size > this.maxRows)
            throw new Error(`Settings profile import exceeds ${this.maxRows} rows`); const current = await this.explicitRows(t.appCode, t.scopeType, t.scopeId, t.definitions), byKey = new Map(current.map((x) => [x.key, x])), blockers = [], changes = []; for (const old of current) {
            if (old.locked && (!incoming.has(old.key) || JSON.stringify(incoming.get(old.key)) !== JSON.stringify(old.value)))
                blockers.push(`LOCKED_OVERRIDE:${old.key}`);
        } for (const d of t.definitions) {
            const old = byKey.get(d.key), has = incoming.has(d.key), value = incoming.get(d.key);
            if (has && !old)
                changes.push({ key: d.key, operation: 'CREATE' });
            else if (has && old && JSON.stringify(old.value) !== JSON.stringify(value))
                changes.push({ key: d.key, operation: 'UPDATE' });
            else if (!has && old)
                changes.push({ key: d.key, operation: 'REMOVE' });
        } return { contract: PORTABILITY_CONTRACT, mode: 'IMPORT_PREVIEW', appCode: t.appCode, scopeType: t.scopeType, scopeId: t.scopeId, definitionCount: t.definitions.length, incomingRows: incoming.size, currentRows: current.length, changes, blockers, canApply: blockers.length === 0, atomicRepositoryCommit: true, profile: { ...profile, rows: [...incoming.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, value })) } }; }
        async importProfile(raw, ctx) { const preview = await this.previewImport(raw, ctx); if (!preview.canApply)
            throw new Error(`Settings profile import blocked: ${preview.blockers.join(',')}`); const t = this.target(preview.appCode, preview.scopeType, preview.scopeId), rows = preview.profile.rows.map((x) => ({ key: x.key, value: this.runtime.settingsDefaults.validateValue(x.key, x.value) })), result = await this.runtime.settings.replaceProfile(t.definitions.map((x) => x.key), rows, t.scopeType, t.scopeId, ctx); return { contract: PORTABILITY_CONTRACT, mode: 'IMPORT_APPLIED', appCode: t.appCode, ...result, validatedRows: rows.length, atomicRepositoryCommit: true }; }
        async previewReset(input, ctx) { const t = this.target(input?.appCode, input?.scopeType, input?.scopeId); this.assertReadTarget(t.scopeType, t.scopeId, ctx); const current = await this.explicitRows(t.appCode, t.scopeType, t.scopeId, t.definitions), blockers = current.filter((x) => x.locked).map((x) => `LOCKED_OVERRIDE:${x.key}`); return { contract: PORTABILITY_CONTRACT, mode: 'RESET_PREVIEW', appCode: t.appCode, scopeType: t.scopeType, scopeId: t.scopeId, definitionCount: t.definitions.length, explicitOverrideCount: current.length, keys: current.map((x) => x.key), blockers, canApply: blockers.length === 0, atomicRepositoryCommit: true }; }
        async resetProfile(input, ctx) { const preview = await this.previewReset(input, ctx); if (!preview.canApply)
            throw new Error(`Settings profile reset blocked: ${preview.blockers.join(',')}`); const t = this.target(preview.appCode, preview.scopeType, preview.scopeId), result = await this.runtime.settings.resetProfile(t.definitions.map((x) => x.key), t.scopeType, t.scopeId, ctx); return { contract: PORTABILITY_CONTRACT, mode: 'RESET_APPLIED', appCode: t.appCode, ...result, atomicRepositoryCommit: true }; }
        search(input) {
            const query = String(input?.query || '').trim();
            if (!query)
                return { contract: SEARCH_CONTRACT, query: '', results: [], bounded: true, maxResults: 64 };
            if (query.length > 160)
                throw new Error('Settings search query exceeds 160 characters');
            const requestedApp = input?.appCode ? this.appCode(input.appCode) : undefined, limit = Math.max(1, Math.min(64, Number(input?.limit) || 32)), normalize = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), q = normalize(query), terms = q.split(/\s+/).filter(Boolean), defs = this.runtime.settingsDefaults.list(requestedApp), results = [];
            for (const d of defs) {
                const parts = [{ kind: 'KEY', text: d.key, weight: 120 }, { kind: 'LABEL', text: d.label, weight: 100 }, { kind: 'DESCRIPTION', text: d.description, weight: 45 }, { kind: 'CATEGORY', text: d.category, weight: 35 }, { kind: 'CAPABILITY', text: d.domainCapability || '', weight: 70 }, ...(d.tags || []).map((x) => ({ kind: 'TAG', text: x, weight: 30 })), ...(d.impact?.services || []).map((x) => ({ kind: 'SERVICE', text: x, weight: 65 })), ...(d.impact?.modules || []).map((x) => ({ kind: 'MODULE', text: x, weight: 65 })), ...(d.impact?.notes || []).map((x) => ({ kind: 'IMPACT_NOTE', text: x, weight: 25 }))], matches = parts.filter(p => terms.every(t => normalize(parts.map(x => x.text).join(' ')).includes(t)) && terms.some(t => normalize(p.text).includes(t)));
                if (!terms.every(t => normalize(parts.map(x => x.text).join(' ')).includes(t)))
                    continue;
                let score = 0;
                for (const p of matches) {
                    const n = normalize(p.text);
                    score = Math.max(score, p.weight + (n === q ? 80 : n.startsWith(q) ? 45 : n.includes(q) ? 20 : 0));
                }
                const targetApp = d.appCode === 'CORE' ? 'APP.NEXUS' : d.appCode, modules = (d.impact?.modules || []).map((module) => ({ module, deepLink: this.runtime.deepLinks.build({ kind: 'APP', id: targetApp, view: module }) }));
                results.push({ key: d.key, label: d.label, description: d.description, appCode: d.appCode, category: d.category, classification: d.appCode === 'CORE' ? 'CORE' : isDomain(d) ? 'DOMAIN' : 'HUB_BASE', domainCapability: d.domainCapability, score, matchedOn: [...new Set(matches.map(x => x.kind))], impact: d.impact ? clone(d.impact) : undefined, navigation: { appCode: targetApp, appDeepLink: this.runtime.deepLinks.build({ kind: 'APP', id: targetApp }), modules }, profile: d.appCode === 'CORE' ? undefined : this.domains.profile(d.appCode) });
            }
            results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'cs'));
            return { contract: SEARCH_CONTRACT, query, appCode: requestedApp, results: results.slice(0, limit), bounded: true, maxResults: 64, totalMatches: results.length };
        }
    }
    function install(runtime, ui) {
        const svc = new SettingsDomainProfileService(runtime, ui?.APPS || [], runtime.settingsDefaults.list(), ui?.SETTINGS_DOMAIN_PROFILES || []), portability = new SettingsProfilePortabilityService(runtime, svc);
        const existing = new Set(runtime.actions.list().map((x) => x.code));
        if (!existing.has('ACTION.CORE.SETTING.DOMAIN_PROFILES.READ'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.DOMAIN_PROFILES.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: async (p) => ({ coverage: svc.coverage(), profiles: p?.appCode ? [svc.profile(p.appCode)].filter(Boolean) : svc.list() }) });
        if (!existing.has('ACTION.CORE.SETTING.DOMAIN_READINESS.READ'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.DOMAIN_READINESS.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: async (p) => svc.readiness(p?.appCode ? String(p.appCode) : undefined) });
        if (!existing.has('ACTION.CORE.SETTING.IMPACT.READ'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.IMPACT.READ', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: async (p) => svc.impact(String(p?.key || '')) });
        if (!existing.has('ACTION.CORE.SETTING.PROFILE.EXPORT'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.PROFILE.EXPORT', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: (p, ctx) => portability.exportProfile(p, ctx) });
        if (!existing.has('ACTION.CORE.SETTING.PROFILE.IMPORT.PREVIEW'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.PROFILE.IMPORT.PREVIEW', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => portability.previewImport(p, ctx) });
        if (!existing.has('ACTION.CORE.SETTING.PROFILE.IMPORT'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.PROFILE.IMPORT', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => portability.importProfile(p, ctx) });
        if (!existing.has('ACTION.CORE.SETTING.PROFILE.RESET.PREVIEW'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.PROFILE.RESET.PREVIEW', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => portability.previewReset(p, ctx) });
        if (!existing.has('ACTION.CORE.SETTING.PROFILE.RESET'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.PROFILE.RESET', ownerApp: 'APP.NEXUS', risk: 'SENSITIVE_WRITE', permission: 'CORE.SETTING.EDIT', handler: (p, ctx) => portability.resetProfile(p, ctx) });
        if (!existing.has('ACTION.CORE.SETTING.SEARCH'))
            runtime.actions.register({ code: 'ACTION.CORE.SETTING.SEARCH', ownerApp: 'APP.NEXUS', risk: 'READ', permission: 'CORE.SETTING.READ', handler: async (p) => portability.search(p) });
        runtime.settingsDomainProfiles = svc;
        runtime.settingsProfilePortability = portability;
        return svc;
    }
    NS.CONTRACT = CONTRACT;
    NS.READINESS_CONTRACT = READINESS_CONTRACT;
    NS.PORTABILITY_CONTRACT = PORTABILITY_CONTRACT;
    NS.SEARCH_CONTRACT = SEARCH_CONTRACT;
    NS.SettingsDomainProfileService = SettingsDomainProfileService;
    NS.SettingsProfilePortabilityService = SettingsProfilePortabilityService;
    NS.install = install;
})(KXSettingsDomainProfiles || (KXSettingsDomainProfiles = {}));
