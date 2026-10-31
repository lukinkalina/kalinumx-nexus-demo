var KXImplementation = {
  "contract": "KX.IMPLEMENTATION_REGISTRY/1",
  "releaseBaseline": "P0009-WIP.10",
  "updatedAt": "2026-10-10T10:30:00+02:00",
  "statusVocabulary": [
    "PLANNED",
    "PARTIAL",
    "IMPLEMENTED",
    "VERIFIED",
    "BLOCKED"
  ],
  "rules": {
    "completeAliasAllowed": false,
    "verifiedRequiresAllCriteria": true,
    "partialRequiresMissing": true,
    "blockedRequiresReason": true,
    "registryEntryIsNotCompletion": true
  },
  "features": [
    {
      "code": "FEATURE.CORE.RUNTIME",
      "name": "Core Runtime / APP-first foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "TYPECHECK",
          "description": "Active TypeScript source passes typecheck",
          "verified": true
        },
        {
          "code": "BUILD",
          "description": "Source-to-build pipeline passes",
          "verified": true
        },
        {
          "code": "RUNTIME_QA",
          "description": "Runtime regression passes in available environment",
          "verified": true
        }
      ],
      "evidence": [
        "qa/P0009_WIP10_FINAL_RELEASE_QA.log",
        "docs/P0007_COMPLETE_MASTER_HANDOFF_CZ.md"
      ],
      "missing": [],
      "notes": [
        "Physical Rust/Cargo compile is tracked separately and is not implied by this status."
      ]
    },
    {
      "code": "FEATURE.CORE.WORKSPACE_DEVICE_LIFECYCLE",
      "name": "Workspace / Device / Session / Desktop lifecycle",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "WORKSPACE_MODES",
          "description": "LOCAL/PORTABLE/SERVER_CONNECTED/RESTORE/DEMO contracts",
          "verified": true
        },
        {
          "code": "DEVICE_SESSION",
          "description": "Device/session/capability lifecycle",
          "verified": true
        },
        {
          "code": "STATIC_NATIVE",
          "description": "Typed native source/static contracts",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0008_WIP7_MASTER_HANDOFF_2026-10-02.md"
      ],
      "missing": [],
      "notes": [
        "Physical native compile remains separately BLOCKED by unavailable Cargo in current runtime."
      ]
    },
    {
      "code": "FEATURE.CORE.FILE_EXPLORER",
      "name": "Live Core File Explorer + scoped writes",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "CANONICAL_FILE",
          "description": "Uses canonical FILE.ID/File Service",
          "verified": true
        },
        {
          "code": "READ_SCOPE",
          "description": "Permission-aware reads",
          "verified": true
        },
        {
          "code": "WRITE_SCOPE",
          "description": "Concrete Space/collection scoped writes",
          "verified": true
        },
        {
          "code": "BROWSER",
          "description": "Import/render/deep-link browser path verified",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP1_MASTER_HANDOFF_2026-10-02.md",
        "docs/P0009_WIP2_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.WORK_DESK",
      "name": "Pracovní stůl",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.FILE_EXPLORER"
      ],
      "completionCriteria": [
        {
          "code": "CANONICAL_REFERENCES",
          "description": "Derived views use same FILE.ID records",
          "verified": true
        },
        {
          "code": "PRIVACY",
          "description": "Shared-with-me and collections are permission-aware",
          "verified": true
        },
        {
          "code": "BROWSER",
          "description": "Inbox/pinned/work-desk interaction verified",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP2_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.MY_DAY",
      "name": "Můj den + Action Center",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.WORK_DESK"
      ],
      "completionCriteria": [
        {
          "code": "SCOPES",
          "description": "Personal/Family/Company/Shared views",
          "verified": true
        },
        {
          "code": "PRIVACY",
          "description": "Private records filtered before UI",
          "verified": true
        },
        {
          "code": "CONTEXT_INSPECTOR",
          "description": "Canonical Inspector preserves caller context",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP3_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.PLANNER_CALENDAR",
      "name": "Planner scoped writes + live Calendar/Agenda",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "MUTATION_SCOPE",
          "description": "Concrete Task/Event/Alarm + Space write checks",
          "verified": true
        },
        {
          "code": "AGENDA",
          "description": "Range/scope/type filters over canonical data",
          "verified": true
        },
        {
          "code": "BROWSER",
          "description": "Create/filter/open calendar item path verified",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP4_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.SETTINGS_SHARING",
      "name": "Settings inheritance + Sharing scope security",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "SETTINGS_SCOPE",
          "description": "Concrete USER/DEVICE/global mutation access",
          "verified": true
        },
        {
          "code": "SHARING_SCOPE",
          "description": "Concrete Space/resource MANAGE checks",
          "verified": true
        },
        {
          "code": "INHERITANCE_UI",
          "description": "Effective source / locked parent / reset inherited",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP5_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.SETTINGS_DEFAULTS",
      "name": "Core + Hub default settings system",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.SETTINGS_SHARING",
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "CORE_DEFAULTS",
          "description": "Core has a declarative immutable product-default catalog",
          "verified": true
        },
        {
          "code": "ALL_HUB_BASE_DEFAULTS",
          "description": "All 48 registered hubs receive namespaced universal default settings",
          "verified": true
        },
        {
          "code": "DEFAULT_FALLBACK",
          "description": "Product default participates below CENTRAL→APP→SUBSYSTEM→VIEW→USER→DEVICE overrides",
          "verified": true
        },
        {
          "code": "GENERIC_SETTINGS_CENTER",
          "description": "Settings Center can inspect/edit/reset effective APP/USER/DEVICE values for Core and hubs",
          "verified": true
        },
        {
          "code": "DOMAIN_PROFILE_SCHEMA",
          "description": "Reusable specialist settings domain-profile schema keeps Core generic and requires capability + impact metadata + specialist ownership",
          "verified": true
        },
        {
          "code": "LASER_REFERENCE_PROFILE",
          "description": "LASER is the first verified specialist reference profile with domain settings/capabilities/impact metadata while remaining owned by APP.KX.LASER",
          "verified": true
        },
        {
          "code": "AI_REFERENCE_PROFILE",
          "description": "AI is the second verified specialist profile; provider/account defaults are consumed by AI connection runtime and security invariants remain locked",
          "verified": true
        },
        {
          "code": "DOMAIN_READINESS_ANTI_INFLATION",
          "description": "Domain profile promotion is evidence-bound; DOMAIN_SETTING rows alone cannot create REFERENCE_VERIFIED and every evidence feature is cross-checked in Hub Integration + Implementation Registry",
          "verified": true
        },
        {
          "code": "DOMAIN_SPECIFIC_DEFAULTS",
          "description": "Every hub declares its own specialist defaults/capability settings beyond the shared base profile",
          "verified": false
        },
        {
          "code": "BULK_PROFILE_RESET",
          "description": "User can reset/import/export a complete Core or hub settings profile safely",
          "verified": true
        },
        {
          "code": "SETTINGS_SEARCH_IMPACT",
          "description": "Settings search explains dependencies/impact and links to affected modules",
          "verified": true
        }
      ],
      "evidence": [
        "qa/SLICE_002_FULL_QA.log",
        "qa/settings_defaults_check.mjs",
        "qa/P0009_WIP10_BROWSER_SMOKE_CDP.json",
        "qa/settings_domain_profile_runtime.mjs",
        "qa/settings_domain_profile_check.py",
        "docs/deltas/KX_DELTA_055_SETTINGS_DOMAIN_PROFILE_LASER_REFERENCE_2026-10-07.txt",
        "docs/deltas/KX_DELTA_056_SETTINGS_DOMAIN_PROFILE_AI_REFERENCE_2026-10-07.txt",
        "qa/settings_domain_readiness_runtime.mjs",
        "qa/settings_domain_readiness_check.py",
        "core/registries/settings-domain-readiness-contract.json",
        "docs/deltas/KX_DELTA_057_SETTINGS_DOMAIN_READINESS_AUDIT_ANTI_INFLATION_2026-10-07.txt",
        "core/registries/settings-profile-portability-contract.json",
        "qa/settings_profile_portability_runtime.mjs",
        "qa/settings_profile_portability_check.py",
        "docs/architecture/CORE_SETTINGS_PROFILE_PORTABILITY_SEARCH_IMPACT_CZ.txt",
        "docs/deltas/KX_DELTA_091_SETTINGS_PROFILE_PORTABILITY_SEARCH_IMPACT_2026-10-10.txt"
      ],
      "missing": [
        "Doménově specifické defaulty zbývajících 45 specialistických BASE_ONLY hubů musí vznikat pouze z jejich skutečných VERIFIED domain kontraktů; APP.KX.NEXUS je Core owner a není specialistický promotion candidate."
      ]
    },
    {
      "code": "FEATURE.CORE.RESPONSIVE_INTERACTION",
      "name": "Responsive / interaction hardening",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "DESKTOP",
          "description": "Desktop interaction/overflow checks",
          "verified": true
        },
        {
          "code": "TABLET",
          "description": "Tablet interaction/overflow checks",
          "verified": true
        },
        {
          "code": "MOBILE",
          "description": "Mobile viewport/fullscreen inspector/search/settings checks",
          "verified": true
        },
        {
          "code": "SIDEBAR_REOPEN",
          "description": "Collapsed main navigation always keeps a visible/clickable reopen control",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP6_MASTER_HANDOFF_2026-10-03.md",
        "qa/P0009_WIP10_BROWSER_SMOKE_CDP.json"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.AI.FOUNDATION",
      "name": "Shared AI foundation + local AI experience",
      "owner": "APP.KX.AI",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "SPECIALIZED_SERVICES",
          "description": "AI-managed entities are specialized-service-only",
          "verified": true
        },
        {
          "code": "ACTION_GATEWAY",
          "description": "Writes use typed ActionBus proposal/execute/reject",
          "verified": true
        },
        {
          "code": "LOCAL_PROVIDER",
          "description": "MOCK.LOCAL chat/session/messages/attachments",
          "verified": true
        },
        {
          "code": "WIDGET_SIZES",
          "description": "MINI/SMALL/MEDIUM/LARGE/MAXI experience",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP7_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.AI.AGENT_REGISTRY_CONTEXT_FOUNDATION",
      "name": "AI Agent Registry / Context Foundation",
      "owner": "APP.KX.AI",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.AI.FOUNDATION",
        "FEATURE.CORE.NAVIGATION_TAXONOMY"
      ],
      "completionCriteria": [
        {
          "code": "BUILT_INS_63",
          "description": "63 deterministic built-ins: 48 hub + 9 category + 6 specialist",
          "verified": true
        },
        {
          "code": "CUSTOM_INHERITANCE",
          "description": "WORKSPACE→USER custom Agent metadata with raw-secret rejection",
          "verified": true
        },
        {
          "code": "CONTEXT_RESOLVER",
          "description": "Core/hub/category/collection/subsection/record/workflow context resolution",
          "verified": true
        },
        {
          "code": "QUICK_ACTION_GATE",
          "description": "Proposal-only typed Action allow-list with permission/risk ceiling",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime + structural QA",
          "verified": true
        }
      ],
      "evidence": [
        "qa/ai_agent_registry_runtime.mjs",
        "qa/ai_agent_registry_check.py",
        "docs/SLICE_021_PROVENANCE.txt",
        "docs/deltas/KX_DELTA_021_AI_AGENT_REGISTRY_CONTEXT_FOUNDATION_2026-10-05.txt"
      ],
      "missing": [],
      "notes": [
        "Reconstructed from preserved DELTA021 handoff. Exact original six specialist names were not recoverable and are explicitly documented as reconstructed semantics."
      ]
    },
    {
      "code": "FEATURE.AI.AGENT_CONTEXT_HOST",
      "name": "Contextual AI Agent Host + Quick Action UI Foundation",
      "owner": "APP.KX.AI",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.AI.AGENT_REGISTRY_CONTEXT_FOUNDATION",
        "FEATURE.AI.FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "HOST_SERVICE",
          "description": "Shared KX.AI_AGENT_CONTEXT_HOST/1 over one Core AI/Agent registry",
          "verified": true
        },
        {
          "code": "CONTEXT_FALLBACK",
          "description": "Exact context with safe HUB/category/Core parent fallback",
          "verified": true
        },
        {
          "code": "READ_GATE",
          "description": "READ actions execute only by re-entering target typed ActionBus permission path",
          "verified": true
        },
        {
          "code": "WRITE_PROPOSAL_ONLY",
          "description": "Non-READ contextual Quick Action creates proposal only; no target write",
          "verified": true
        },
        {
          "code": "UI_FOUNDATION",
          "description": "Shell Agent picker/context/prompt/typed-action panel plus hub/category/collection/record bindings",
          "verified": true
        },
        {
          "code": "ALL_HUBS",
          "description": "All 48 registered hubs resolve their built-in contextual Agent through shared host",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static/browser integration QA",
          "verified": true
        }
      ],
      "evidence": [
        "qa/ai_agent_context_host_runtime.mjs",
        "qa/ai_agent_context_host_check.py",
        "docs/architecture/CORE_AI_AGENT_CONTEXT_HOST_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_022_AI_AGENT_CONTEXT_HOST_QUICK_ACTION_UI_2026-10-05.txt"
      ],
      "missing": [],
      "notes": [
        "Reconstructed from DELTA022 Recovery Bridge semantics. The V6 DELTA_22 overlay did not preserve an original DELTA022 implementation/changelog entry, so byte-identical source is not claimed."
      ]
    },
    {
      "code": "FEATURE.AI.PROVIDER_ACCOUNT_SETTINGS",
      "name": "AI provider/account metadata + scoped defaults",
      "owner": "APP.KX.AI",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.AI.FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "PROVIDER_DESCRIPTORS",
          "description": "Provider availability separated from metadata existence",
          "verified": true
        },
        {
          "code": "SCOPES",
          "description": "Fail-closed Space/App scope intersection",
          "verified": true
        },
        {
          "code": "DEFAULTS",
          "description": "Global/per-Space/per-App defaults respect scope and availability",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP9_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.AI.SECURE_BACKEND_CONTRACT",
      "name": "AI secure credential backend lifecycle contract",
      "owner": "APP.KX.AI",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.AI.PROVIDER_ACCOUNT_SETTINGS"
      ],
      "completionCriteria": [
        {
          "code": "LIFECYCLE",
          "description": "NOT_CONFIGURED/READY/NEEDS_REAUTH/DISABLED/ERROR contract",
          "verified": true
        },
        {
          "code": "METADATA_ONLY_IPC",
          "description": "Status/enrollment IPC carries no raw credential",
          "verified": true
        },
        {
          "code": "FAIL_CLOSED",
          "description": "Unconfigured backend never reports false READY",
          "verified": true
        }
      ],
      "evidence": [
        "docs/P0009_WIP10_MASTER_HANDOFF_2026-10-03.md"
      ],
      "missing": [],
      "notes": [
        "VERIFIED is the contract, not a physical OS vault implementation."
      ]
    },
    {
      "code": "FEATURE.AI.OS_SECURE_VAULT",
      "name": "Physical OS secure credential backend",
      "owner": "APP.KX.AI",
      "status": "BLOCKED",
      "dependencies": [
        "FEATURE.AI.SECURE_BACKEND_CONTRACT"
      ],
      "completionCriteria": [
        {
          "code": "WINDOWS",
          "description": "Windows credential backend compiled and integration tested",
          "verified": false
        },
        {
          "code": "APPLE",
          "description": "Apple Keychain backend compiled and integration tested",
          "verified": false
        },
        {
          "code": "LINUX",
          "description": "Linux Secret Service backend compiled and integration tested",
          "verified": false
        }
      ],
      "evidence": [],
      "missing": [
        "Platform backend implementation",
        "Cargo/native compile and integration environment"
      ],
      "blockedReason": "Current runtime has no Cargo/native integration environment."
    },
    {
      "code": "FEATURE.AI.EVERYWHERE",
      "name": "AI in Core and every Hub with contextual capability packs",
      "owner": "APP.KX.AI",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.AI.FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "CORE_HOST",
          "description": "Shared AI host/widget available in Core",
          "verified": true
        },
        {
          "code": "HUB_CONTEXT",
          "description": "Every Hub declares scoped AI capability pack",
          "verified": true
        },
        {
          "code": "QUICK_ACTIONS",
          "description": "Shared contextual Host + typed Quick Actions resolve and are regression-tested across all 48 hubs",
          "verified": true
        },
        {
          "code": "STORAGE_POLICY",
          "description": "Large AI artifacts/models follow storage quota policy",
          "verified": false
        }
      ],
      "evidence": [
        "docs/P0009_WIP7_MASTER_HANDOFF_2026-10-03.md",
        "qa/ai_agent_registry_runtime.mjs",
        "qa/ai_agent_context_host_runtime.mjs",
        "qa/ai_agent_context_host_check.py"
      ],
      "missing": [
        "Hub-wide contextual Host UI",
        "Storage quota enforcement for large AI artifacts"
      ]
    },
    {
      "code": "FEATURE.AI.SYSTEM_SUPERVISOR",
      "name": "AI/local System Supervisor + repair proposals",
      "owner": "APP.KX.AI",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.AI.FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "LOCAL_DIAGNOSTICS",
          "description": "Read-only local health findings",
          "verified": false
        },
        {
          "code": "BACKGROUND",
          "description": "Background scheduled review",
          "verified": false
        },
        {
          "code": "ADMIN_PROPOSALS",
          "description": "Repair proposals are admin-gated and never auto-execute",
          "verified": false
        },
        {
          "code": "IMPLEMENTATION_REGISTRY",
          "description": "Supervisor detects incomplete/false-complete features",
          "verified": false
        }
      ],
      "evidence": [],
      "missing": [
        "Full QA",
        "Implementation Registry integration",
        "UI review/repair proposal surface"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.THEME_REGISTRY",
      "name": "Theme registry",
      "owner": "APP.NEXUS",
      "status": "IMPLEMENTED",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "COUNT",
          "description": "72 theme records available",
          "verified": true
        },
        {
          "code": "RUNTIME_DISTINCTION",
          "description": "Every theme has materially distinct runtime treatment where intended",
          "verified": false
        }
      ],
      "evidence": [
        "src/ui-registry.ts"
      ],
      "missing": [
        "Complete runtime distinction is tracked under Theme Engine"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.THEME_ENGINE",
      "name": "Complete Theme Runtime Engine",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.APPEARANCE.THEME_REGISTRY"
      ],
      "completionCriteria": [
        {
          "code": "PALETTE",
          "description": "Palette/background/surface variables apply",
          "verified": true
        },
        {
          "code": "STRUCTURE",
          "description": "Surface/pattern/shadow/control/header/motion semantics apply",
          "verified": false
        },
        {
          "code": "ICON_BINDING",
          "description": "iconStyle visibly affects icons",
          "verified": false
        },
        {
          "code": "TYPOGRAPHY",
          "description": "Font profile/typography semantics apply",
          "verified": false
        },
        {
          "code": "PREVIEWS",
          "description": "Preview shows real visual/structural differences",
          "verified": false
        },
        {
          "code": "RESPONSIVE_QA",
          "description": "Representative theme families tested desktop/tablet/mobile",
          "verified": false
        }
      ],
      "evidence": [
        "src/ui-registry.ts",
        "app/styles.css"
      ],
      "missing": [
        "Finish runtime semantics",
        "Icon/font bindings",
        "Distinct previews",
        "Representative browser QA"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.LAYOUT_REGISTRY",
      "name": "Layout registry",
      "owner": "APP.NEXUS",
      "status": "IMPLEMENTED",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "COUNT",
          "description": "36 layout records available",
          "verified": true
        },
        {
          "code": "RUNTIME_BEHAVIOR",
          "description": "All declared nav/inspector/density semantics are applied",
          "verified": false
        }
      ],
      "evidence": [
        "src/ui-registry.ts"
      ],
      "missing": [
        "Complete runtime behavior is tracked under Layout Engine"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.LAYOUT_ENGINE",
      "name": "Complete Layout Runtime Engine",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.APPEARANCE.LAYOUT_REGISTRY"
      ],
      "completionCriteria": [
        {
          "code": "NAV",
          "description": "LEFT/TOP/BOTTOM/COMPACT nav behavior",
          "verified": false
        },
        {
          "code": "INSPECTOR",
          "description": "Inspector policy and panel structure",
          "verified": false
        },
        {
          "code": "DENSITY",
          "description": "Layout density materially affects presentation",
          "verified": false
        },
        {
          "code": "PREVIEW",
          "description": "Preview depicts actual layout structure",
          "verified": false
        },
        {
          "code": "RESPONSIVE",
          "description": "Desktop/tablet/mobile behavior verified",
          "verified": false
        }
      ],
      "evidence": [
        "src/nexus-shell.ts",
        "app/styles.css"
      ],
      "missing": [
        "Finish behavior",
        "Finish previews",
        "Browser QA across layout families"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.ICON_LIBRARY",
      "name": "Icon registry + extensible asset library",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.APPEARANCE.THEME_ENGINE"
      ],
      "completionCriteria": [
        {
          "code": "REGISTRY",
          "description": "Icon style/core icon metadata registry",
          "verified": true
        },
        {
          "code": "PHYSICAL_FOLDER",
          "description": "assets/icons extension folder",
          "verified": true
        },
        {
          "code": "BINDING",
          "description": "UI uses registry consistently",
          "verified": false
        },
        {
          "code": "IMPORT_VALIDATION",
          "description": "Future user/generated icon validation/source/license metadata",
          "verified": false
        }
      ],
      "evidence": [
        "assets/icons/README_CZ.md",
        "core/registries/appearance-asset-contract.json",
        "qa/appearance_assets_runtime.mjs",
        "src/appearance-assets.ts"
      ],
      "missing": [
        "Full UI binding to replace every glyph through Asset Resolver",
        "File Service/import/generation validation + provenance/license workflow"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.FONT_LIBRARY",
      "name": "Font profile registry + extensible metadata folder",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.APPEARANCE.THEME_ENGINE"
      ],
      "completionCriteria": [
        {
          "code": "PROFILES",
          "description": "Font profiles with safe fallback stacks",
          "verified": true
        },
        {
          "code": "NO_UNLICENSED_BINARIES",
          "description": "No unlicensed font binaries bundled",
          "verified": true
        },
        {
          "code": "BINDING",
          "description": "Theme/user typography settings and custom FileService font assets bind only after a current SAFE artifact; WOFF2 uses a validated decoded derivative when a trusted host decoder is attached",
          "verified": true
        },
        {
          "code": "IMPORT_VALIDATION",
          "description": "Font import validates exact FileService binding, SFNT/WOFF structure, table bounds, glyph count and license; WOFF2 is additionally host-decoder-gated",
          "verified": true
        },
        {
          "code": "WOFF2_HOST_PROVIDER",
          "description": "Tauri source integrates the bounded pure-Rust Allsorts 0.17.0 trusted-host provider and exact IPC/hash contract; physical cargo build remains environment-blocked in the current sandbox",
          "verified": false
        }
      ],
      "evidence": [
        "assets/fonts/README_CZ.md",
        "core/registries/appearance-asset-contract.json",
        "src/appearance-assets.ts",
        "src/ui-registry.ts",
        "core/registries/appearance-woff2-decoder-contract.json",
        "src/appearance-woff2-decoder.ts",
        "qa/appearance_woff2_decoder_runtime.mjs",
        "qa/appearance_woff2_decoder_check.py",
        "src/appearance-font-safety.ts",
        "src/appearance-live-binding.ts",
        "src-tauri/Cargo.toml",
        "src-tauri/src/lib.rs",
        "src/platform-adapters.ts",
        "qa/native_woff2_provider_check.py",
        "qa/native_woff2_provider_runtime.mjs",
        "qa/native_host_contract_check.py"
      ],
      "missing": [
        "Physical Rust/Tauri cargo check on supported native build runners remains required before WOFF2_HOST_PROVIDER can become VERIFIED; current sandbox has no cargo/rustc."
      ],
      "notes": [
        "DELTA036 source-integrates KX.NATIVE.WOFF2.ALLSORTS using exact allsorts 0.17.0; Rust 1.83 is the historical minimum for that provider path, while the project MSRV is 1.90 from DELTA048. The native command independently revalidates WOFF2 structure/hash before decode and the TS bridge rechecks output SHA. Browser/remote/Python decoder bypasses remain forbidden. Native compile is not claimed without a Rust toolchain."
      ]
    },
    {
      "code": "FEATURE.CORE.DATA_FEEDS",
      "name": "Weather / News / Crypto / Stocks / Commodities widgets",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "DESCRIPTORS",
          "description": "Feed/provider/storage descriptors",
          "verified": false
        },
        {
          "code": "VISIBILITY",
          "description": "Show/hide/favorites preferences",
          "verified": false
        },
        {
          "code": "WEATHER_PROVIDER",
          "description": "Live weather provider + location/privacy/cache",
          "verified": false
        },
        {
          "code": "NEWS_PROVIDER",
          "description": "Live news provider/source/topic controls",
          "verified": false
        },
        {
          "code": "MARKET_PROVIDER",
          "description": "Live crypto/stocks/commodities provider/watchlists",
          "verified": false
        },
        {
          "code": "NO_FAKE_LIVE",
          "description": "Disconnected feeds never fabricate live values",
          "verified": false
        }
      ],
      "evidence": [
        "src/ui-registry.ts",
        "src/nexus-shell.ts"
      ],
      "missing": [
        "Provider adapters",
        "Location model",
        "Watchlists",
        "Caching/retention enforcement",
        "Browser QA"
      ]
    },
    {
      "code": "FEATURE.CORE.WINDOW_MINIMIZE_RESTORE",
      "name": "Minimize / restore Core views and panels",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "MINIMIZE",
          "description": "Current view/panel can minimize",
          "verified": true
        },
        {
          "code": "RESTORE",
          "description": "Restores where user left off",
          "verified": true
        },
        {
          "code": "PERSISTENCE",
          "description": "Device/user view state persists safely",
          "verified": true
        },
        {
          "code": "PENDING_EDIT",
          "description": "Pending edits protected before context loss",
          "verified": true
        }
      ],
      "evidence": [
        "src/nexus-shell.ts",
        "core/registries/window-minimize-restore-contract.json",
        "src/window-minimize-runtime.ts",
        "qa/window_minimize_restore_runtime.mjs",
        "qa/window_minimize_restore_check.py",
        "qa/P0009_WIP10_BROWSER_SMOKE_CDP.json",
        "docs/deltas/KX_DELTA_090_CORE_WINDOW_MINIMIZE_RESTORE_PERSISTENCE_PENDING_EDIT_2026-10-10.txt"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.QA.GLOBAL_PRODUCT_AUDIT",
      "name": "Global Product Audit + completeness enforcement",
      "owner": "APP.DEV",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "REGISTRY",
          "description": "Machine-readable Implementation Registry",
          "verified": true
        },
        {
          "code": "RELEASE_REVIEW_CONTRACT",
          "description": "Every release reviews whole product + separate layers + expansion opportunities",
          "verified": true
        },
        {
          "code": "VALIDATOR",
          "description": "QA validator blocks false VERIFIED/invalid states",
          "verified": true
        },
        {
          "code": "RUNTIME_READ",
          "description": "Core exposes registry/summary read action",
          "verified": true
        },
        {
          "code": "AI_REVIEW",
          "description": "AI System Supervisor can surface incomplete features",
          "verified": true
        },
        {
          "code": "BUILD_INTEGRATION",
          "description": "Registry generated into app and included in npm run qa",
          "verified": true
        },
        {
          "code": "CURRENT_BUILD_TARGETING",
          "description": "QA that claims CURRENT state resolves the current generated artifact instead of historical WIP files",
          "verified": true
        },
        {
          "code": "CROSS_LAYER_SETTINGS_AUDIT",
          "description": "Settings defaults/inheritance/browser/nav paths are covered end-to-end",
          "verified": true
        },
        {
          "code": "FULL_PROGRAM_CROSS_LAYER_AUDIT",
          "description": "Every Core subsystem and every hub has undergone the expanded cross-layer audit matrix",
          "verified": false
        },
        {
          "code": "DOMAIN_DATA_INVARIANTS",
          "description": "Every hub has domain-specific data invariants and negative/regression tests",
          "verified": false
        }
      ],
      "evidence": [
        "qa/SLICE_002_FULL_QA.log",
        "qa/implementation_registry_check.py",
        "qa/links_functions_audit.py",
        "qa/ui_registry_snapshot_check.py",
        "core/registries/product-review-contract.json",
        "docs/PRODUCT_RELEASE_REVIEW_POLICY_CZ.md"
      ],
      "missing": [
        "Rozšířit stejný cross-layer audit postupně na každý Core subsystem a každý hub.",
        "Přidat doménově specifické data invariants/negative tests pro jednotlivé huby.",
        "Dlouhodobě kontrolovat, že žádný CURRENT QA nečte historický artefakt.",
        "Automatizovat plný per-release product review report pro všech 48 hubů."
      ]
    },
    {
      "code": "FEATURE.HUBS.DOMAIN_COMPLETENESS",
      "name": "Domain Hub implementations",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "REGISTRY",
          "description": "48 app cards/registry entries exist",
          "verified": true
        },
        {
          "code": "PER_HUB_MATRIX",
          "description": "Each Hub has own completeness matrix",
          "verified": false
        },
        {
          "code": "PER_HUB_RUNTIME",
          "description": "Each intended Hub has real domain implementation",
          "verified": false
        },
        {
          "code": "PER_HUB_AI",
          "description": "Each intended Hub has scoped AI capability pack",
          "verified": false
        }
      ],
      "evidence": [
        "src/ui-registry.ts"
      ],
      "missing": [
        "Per-Hub implementation matrices",
        "Most domain implementations",
        "Per-Hub AI capability packs"
      ]
    },
    {
      "code": "FEATURE.CORE.SOURCE_RECOVERY_INTEGRITY",
      "name": "Complete source tree recovery / delta-chain integrity",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "CONTRACT",
          "description": "Source recovery contract exists and is mirrored",
          "verified": true
        },
        {
          "code": "MANIFEST",
          "description": "Hash manifest verifies complete tracked source tree",
          "verified": true
        },
        {
          "code": "HUB_COVERAGE",
          "description": "All registered Core/hub app codes covered by shared source authority",
          "verified": true
        },
        {
          "code": "DELTA_CHAIN",
          "description": "No replay-required delta before implementation",
          "verified": true
        }
      ],
      "evidence": [],
      "missing": []
    },
    {
      "code": "FEATURE.LASER.P566_PRESERVATION_CONTRACT",
      "name": "Laser Parameter Hub P566 preservation contract",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "BASELINE",
          "description": "P566 identity/schema/hash/evidence captured",
          "verified": true
        },
        {
          "code": "CAPABILITIES",
          "description": "Mandatory capability groups encoded",
          "verified": true
        },
        {
          "code": "MIRROR",
          "description": "Core/Data contract mirror byte-equal",
          "verified": true
        }
      ],
      "evidence": [],
      "missing": []
    },
    {
      "code": "FEATURE.LASER.SETTINGS_PROFILE",
      "name": "LASER domain settings profile",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "DOMAIN_DEFAULTS",
          "description": "Specialist LASER defaults exist beyond universal hub defaults",
          "verified": true
        },
        {
          "code": "INHERITANCE",
          "description": "Uses Core Settings inheritance",
          "verified": true
        },
        {
          "code": "P566_KEYS",
          "description": "P566 preservation settings represented",
          "verified": true
        }
      ],
      "evidence": [],
      "missing": []
    },
    {
      "code": "FEATURE.LASER.P566_READONLY_ADAPTER",
      "name": "P566 real read-only migration adapter + parity matrix",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_PRESERVATION_CONTRACT",
        "FEATURE.LASER.CANONICAL_DOMAIN_FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "REAL_SOURCE",
          "description": "Reads actual P566 appStateV5/backup/Reader/portable shapes",
          "verified": true
        },
        {
          "code": "READ_ONLY",
          "description": "Analysis cannot mutate canonical LASER entities and commitAllowed is false",
          "verified": true
        },
        {
          "code": "PARITY",
          "description": "Known fields map to canonical candidates, unknown fields are preserved, unresolved references are BLOCKING",
          "verified": true
        },
        {
          "code": "IDENTITY",
          "description": "KXP/KXT/KXI identity preview remains authoritative",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_adapter_runtime.mjs",
        "qa/laser_p566_real_source_check.py",
        "real P566 standalone SHA-256 reference"
      ],
      "missing": [],
      "notes": [
        "This is analysis only. Transactional migration commit/rollback/roundtrip remains intentionally unavailable."
      ]
    },
    {
      "code": "FEATURE.LASER.P566_CROSS_FEATURE_PARITY_OWNERS",
      "name": "P566 cross-feature parity owners + commit-design guard",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_READONLY_ADAPTER"
      ],
      "completionCriteria": [
        {
          "code": "OWNER_REGISTRY",
          "description": "Every parity-critical P566 cross-feature branch has an explicit owner, target, flow mode and commit policy",
          "verified": true
        },
        {
          "code": "EXACT_SNAPSHOTS",
          "description": "Present cross-feature branches are copied into read-only exact snapshots before any future normalization",
          "verified": true
        },
        {
          "code": "FLOW_MODES",
          "description": "REFERENCE / DERIVED / SNAPSHOT / ACTION_PROJECTION are explicit and target ownership is not bypassed",
          "verified": true
        },
        {
          "code": "COMMIT_GUARD",
          "description": "ZERO BLOCKING enables transaction design only; commitAllowed remains false and unresolved LASER identities still block",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_adapter_runtime.mjs",
        "qa/laser_p566_parity_owners_check.py",
        "ACTION.LASER.P566.PARITY.OWNERS"
      ],
      "missing": [],
      "notes": [
        "This feature authorizes only transactional design, never import execution.",
        "Finance/Calendar/Production projections must later execute through their typed owner actions; raw source snapshots remain available for roundtrip evidence."
      ]
    },
    {
      "code": "FEATURE.LASER.P566_TRANSACTIONAL_STAGING",
      "name": "P566 deterministic transactional staging plan",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_READONLY_ADAPTER",
        "FEATURE.LASER.P566_CROSS_FEATURE_PARITY_OWNERS"
      ],
      "completionCriteria": [
        {
          "code": "SOURCE_HASH",
          "description": "Immutable source snapshot descriptor + SHA-256 and source replay guard",
          "verified": true
        },
        {
          "code": "IDENTITY_MAP",
          "description": "Deterministic legacy→canonical identity map with duplicate/canonical conflict detection",
          "verified": true
        },
        {
          "code": "ACTION_PLAN",
          "description": "Dependency-ordered typed-owner action plan with unavailable transformers/actions exposed as blockers",
          "verified": true
        },
        {
          "code": "READ_ONLY",
          "description": "No canonical LASER writes; commitAllowed remains false",
          "verified": true
        },
        {
          "code": "FAULT_INJECTION",
          "description": "Fault injection proves staging leaves no partial canonical writes",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_staging_runtime.mjs",
        "qa/laser_p566_staging_check.py",
        "ACTION.LASER.P566.MIGRATION.STAGE"
      ],
      "missing": [],
      "notes": [
        "This is staging/design only. Execution engine, readback, rollback/compensation and roundtrip parity are separate future gates."
      ]
    },
    {
      "code": "FEATURE.LASER.P566_TRANSACTION_FRAMEWORK",
      "name": "P566 transaction journal + sandbox executor/rollback framework",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_TRANSACTIONAL_STAGING"
      ],
      "completionCriteria": [
        {
          "code": "SOURCE_REPLAY",
          "description": "Exact source SHA-256 and plan hash are replayed before sandbox execution",
          "verified": true
        },
        {
          "code": "TYPED_ACTION_EXECUTION",
          "description": "READY LASER staging steps execute only through typed LASER owner actions in cloned sandbox runtime",
          "verified": true
        },
        {
          "code": "TRANSACTION_JOURNAL",
          "description": "Every step records start/readback/failure/rollback journal evidence",
          "verified": true
        },
        {
          "code": "READBACK",
          "description": "Deterministic planned ids and recordUid/recordCode are read back after sandbox actions",
          "verified": true
        },
        {
          "code": "ROLLBACK",
          "description": "Fault injection restores sandbox baseline and verifies exact baseline hash",
          "verified": true
        },
        {
          "code": "NO_PRODUCTION_COMMIT",
          "description": "productionCommitAllowed=false; no P566 COMMIT action or production Import button exists",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_transaction_runtime.mjs",
        "qa/laser_p566_transaction_check.py",
        "ACTION.LASER.P566.MIGRATION.VERIFY_TRANSACTION"
      ],
      "missing": [],
      "notes": [
        "This verifies the transaction mechanism only in a cloned Memory repository. It does not authorize production commit.",
        "Full cross-feature P566 stays BLOCKED until all staged cross-feature transformers/actions are executable and separately verified."
      ]
    },
    {
      "code": "FEATURE.LASER.P566_VIEW_TABLE_TEST_SETTINGS_TRANSFORMERS",
      "name": "P566 Saved Views / table state / Test Settings transformers",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_TRANSACTIONAL_STAGING",
        "FEATURE.LASER.P566_TRANSACTION_FRAMEWORK"
      ],
      "completionCriteria": [
        {
          "code": "EXACT_RECOVERY",
          "description": "Handled view/table/Test branches are retained in an exact APP recovery snapshot with deterministic SHA-256",
          "verified": true
        },
        {
          "code": "SAVED_VIEW_REFS",
          "description": "Saved View Machine/Profile refs and active/default/last view semantics are normalized with blocking/warning rules",
          "verified": true
        },
        {
          "code": "TABLE_STATE",
          "description": "Project, Import Lab and Test table state is preserved in scoped Core Settings",
          "verified": true
        },
        {
          "code": "TEST_SCOPE_SPLIT",
          "description": "Shared Test Settings, user table layout and device-local show-type preference remain separate scopes",
          "verified": true
        },
        {
          "code": "SANDBOX_READBACK",
          "description": "ACTION.CORE.SETTING.SET executes only in sandbox verification with exact scope/value readback and no live mutation",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_view_settings_transform_runtime.mjs",
        "qa/laser_p566_view_settings_transform_check.py",
        "KX.LASER_P566_VIEW_SETTINGS_TRANSFORM/1"
      ],
      "missing": [],
      "notes": [
        "DELTA 012 transformer slice only; it does not authorize production P566 commit."
      ]
    },
    {
      "code": "FEATURE.LASER.P566_WORKSPACE_TRASH_TRANSFORMERS",
      "name": "P566 workspace context + Project trash/archive transformers",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_VIEW_TABLE_TEST_SETTINGS_TRANSFORMERS",
        "FEATURE.LASER.P566_TRANSACTION_FRAMEWORK"
      ],
      "completionCriteria": [
        {
          "code": "WORKSPACE_CONTEXT",
          "description": "activeMachineId/activePresetId resolve only to staged canonical Machine/Profile ids; ALL sentinel remains explicit",
          "verified": true
        },
        {
          "code": "EXACT_TRASH_RECOVERY",
          "description": "Workspace context and every Project trash row are retained before normalization with deterministic exact snapshot hash",
          "verified": true
        },
        {
          "code": "STABLE_TRASH_IDENTITY",
          "description": "Project trash resolves by recordUid -> recordCode -> legacy id and detects active/duplicate identity collisions",
          "verified": true
        },
        {
          "code": "NON_DESTRUCTIVE_ARCHIVE",
          "description": "Trash creates/updates canonical APP.LASER.PROJECT using status ARCHIVED + Core archivedAt; no hard delete is planned",
          "verified": true
        },
        {
          "code": "SANDBOX_READBACK",
          "description": "Archived Project and workspace Settings are read back in cloned sandbox while live LASER/Settings remain unchanged",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_workspace_trash_transform_runtime.mjs",
        "qa/laser_p566_workspace_trash_transform_check.py",
        "KX.LASER_P566_WORKSPACE_TRASH_TRANSFORM/1"
      ],
      "missing": [],
      "notes": [
        "DELTA 013 handles Project trash only. P566 state.testTrash remains an explicit later migration backlog item.",
        "No Calendar/Finance/Production/Storage transformer and no production P566 COMMIT is enabled."
      ]
    },
    {
      "code": "FEATURE.LASER.P566_TEST_TRASH_TIMING_TRANSFORMERS",
      "name": "P566 Test trash + detailed timing/stopwatch preservation transformers",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_WORKSPACE_TRASH_TRANSFORMERS",
        "FEATURE.LASER.P566_TRANSACTION_FRAMEWORK"
      ],
      "completionCriteria": [
        {
          "code": "EXACT_RECOVERY",
          "description": "Test trash plus active Project/Test timing branches are retained in deterministic exact recovery snapshot",
          "verified": true
        },
        {
          "code": "DETAILED_TIMING",
          "description": "Project timingCurrent/timingHistory/manual/stopwatch totals, sessions, laps/descriptions and late timer metadata survive canonical staging",
          "verified": true
        },
        {
          "code": "TEST_TRASH_STABLE_IDENTITY",
          "description": "Test trash checks recordUid, recordCode and legacy id for duplicate/active collisions and derives missing KXT/UID deterministically",
          "verified": true
        },
        {
          "code": "TEST_RUN_ARCHIVE",
          "description": "Deleted Test session and every retained Test Run are staged as non-destructive archived canonical records",
          "verified": true
        },
        {
          "code": "TIMER_SAFETY_READBACK",
          "description": "Active Test timers pause safely; deleted timers freeze at deletedAt; timing/archive payloads receive sandbox readback with no live mutation",
          "verified": true
        },
        {
          "code": "DEVICE_RUNTIME_GAP_DOCUMENTED",
          "description": "Non-serialized device-local global/project running stopwatch gap is explicit and continues to block production commit",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_p566_test_trash_timing_transform_runtime.mjs",
        "qa/laser_p566_test_trash_timing_transform_check.py",
        "KX.LASER_P566_TEST_TRASH_TIMING_TRANSFORM/1"
      ],
      "missing": [],
      "notes": [
        "DELTA 014 is migration preservation + sandbox verification, not the final production stopwatch UI/runtime.",
        "Calendar/Finance/Production/Storage and production P566 COMMIT remain outside this slice."
      ]
    },
    {
      "code": "FEATURE.LASER.PARAMETER_HUB_MIGRATION",
      "name": "Full Laser Parameter Hub migration",
      "owner": "APP.KX.LASER",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.LASER.P566_PRESERVATION_CONTRACT",
        "FEATURE.LASER.CANONICAL_DOMAIN_FOUNDATION",
        "FEATURE.LASER.P566_READONLY_ADAPTER",
        "FEATURE.LASER.P566_CROSS_FEATURE_PARITY_OWNERS",
        "FEATURE.LASER.P566_TRANSACTIONAL_STAGING",
        "FEATURE.LASER.P566_TRANSACTION_FRAMEWORK",
        "FEATURE.LASER.P566_VIEW_TABLE_TEST_SETTINGS_TRANSFORMERS",
        "FEATURE.LASER.P566_WORKSPACE_TRASH_TRANSFORMERS",
        "FEATURE.LASER.P566_TEST_TRASH_TIMING_TRANSFORMERS"
      ],
      "completionCriteria": [
        {
          "code": "PRESERVATION_CONTRACT",
          "description": "P566 preservation contract",
          "verified": true
        },
        {
          "code": "DOMAIN_SCHEMA",
          "description": "Canonical LASER domain schema/actions",
          "verified": true
        },
        {
          "code": "PROJECTS_TESTS_IMPORT",
          "description": "Projects/Tests/Import Lab runtime/UI",
          "verified": false
        },
        {
          "code": "PARITY_QA",
          "description": "Real P566 read-only mapping/parity matrix verified; transactional commit/roundtrip still pending",
          "verified": true
        },
        {
          "code": "CROSS_FEATURE_OWNERS",
          "description": "Cross-feature parity owners and ZERO-BLOCKING commit-design guard",
          "verified": true
        },
        {
          "code": "TRANSACTION_STAGING",
          "description": "Deterministic read-only staging plan with source hash, identity map and owner action plan",
          "verified": true
        },
        {
          "code": "TRANSACTION_FRAMEWORK",
          "description": "Sandbox transaction journal/readback/rollback framework verified; production commit still pending",
          "verified": true
        },
        {
          "code": "VIEW_TABLE_TEST_TRANSFORMERS",
          "description": "Saved Views/table/Test Settings reversible transformer slice verified with scoped Setting readback",
          "verified": true
        },
        {
          "code": "WORKSPACE_TRASH_TRANSFORMERS",
          "description": "Active Machine/Profile context and non-destructive Project trash/archive transformer slice verified",
          "verified": true
        },
        {
          "code": "TEST_TRASH_TIMING_TRANSFORMERS",
          "description": "Test trash/Test Run archive plus detailed Project/Test stopwatch/history preservation transformer verified",
          "verified": true
        }
      ],
      "evidence": [],
      "missing": [
        "Production P566 migration commit + rollback/compensation + complete roundtrip QA over the real workspace",
        "Projects/Test/Import Lab complete production runtime and UI",
        "Full production stopwatch/timer runtime parity, including safe device-runtime capture/restore for P566 localStorage-only global/project running timers",
        "Remaining favorites/QR quick-load/print/PDF/CSV/KX-TRANSFER behavior",
        "Calendar/Gantt / Finance / Production / Storage active owner projections and readback",
        "Local/LAN/NAS runtime migration and device capability re-authorization",
        "LASER AI / Depth Map capability pack and final concurrency/browser production QA"
      ]
    },
    {
      "code": "FEATURE.LASER.AI_CAPABILITY_PACK",
      "name": "LASER contextual AI capability pack",
      "owner": "APP.KX.LASER",
      "status": "PARTIAL",
      "dependencies": [],
      "completionCriteria": [
        {
          "code": "DESCRIPTORS",
          "description": "LASER AI quick-action descriptors/settings exist",
          "verified": true
        },
        {
          "code": "TYPED_ACTIONS",
          "description": "Typed runtime LASER AI actions",
          "verified": false
        },
        {
          "code": "DEPTH_MAP",
          "description": "FILE.ID -> Depth Map workflow",
          "verified": false
        }
      ],
      "evidence": [],
      "missing": [
        "Typed LASER AI Action Registry",
        "Depth Map pipeline/storage policy runtime",
        "Project/Test audit runtime"
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.SHELL_PRESETS",
      "name": "Whole Core shell design presets",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.THEME_ENGINE",
        "FEATURE.APPEARANCE.LAYOUT_ENGINE"
      ],
      "completionCriteria": [
        {
          "code": "PRESET_REGISTRY",
          "description": "At least 10 whole-shell presets combine theme/layout/nav/icons/fonts/mood",
          "verified": true
        },
        {
          "code": "LIVE_APPLY",
          "description": "Preset applies whole shell and persists view state",
          "verified": true
        },
        {
          "code": "HIDDEN_NAV_RETURN",
          "description": "Hidden main navigation always has visible restore handle",
          "verified": true
        },
        {
          "code": "PREVIEW",
          "description": "Each preset has structural/graphic preview",
          "verified": true
        },
        {
          "code": "BROWSER_QA",
          "description": "Browser applies multiple distinct presets and restores navigation",
          "verified": true
        }
      ],
      "evidence": [
        "src/ui-registry.ts",
        "src/nexus-shell.ts",
        "app/styles.css",
        "qa/browser_smoke_cdp.mjs"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.WEB_GATEWAY",
      "name": "Web / domain / NAS Gateway",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.RUNTIME",
        "FEATURE.CORE.SETTINGS_SHARING"
      ],
      "completionCriteria": [
        {
          "code": "ARCH_CONTRACT",
          "description": "Gateway contract forbids direct browser SQLite/NAS DB access",
          "verified": true
        },
        {
          "code": "SETTINGS",
          "description": "Core Settings expose mode/origin/ingress/auth/public views",
          "verified": true
        },
        {
          "code": "UI_FOUNDATION",
          "description": "Settings module explains current gateway state and security boundary",
          "verified": true
        },
        {
          "code": "SERVER_ADAPTER",
          "description": "KalinumX Gateway HTTP/API service exists",
          "verified": false
        },
        {
          "code": "REMOTE_AUTH",
          "description": "Remote identity/auth + permissions verified end-to-end",
          "verified": false
        },
        {
          "code": "PWA_CLIENT",
          "description": "Web/PWA client uses same typed contracts",
          "verified": false
        },
        {
          "code": "DEPLOY_QA",
          "description": "NAS/server + domain + TLS/tunnel deployment tested",
          "verified": false
        }
      ],
      "evidence": [
        "core/registries/web-gateway-contract.json",
        "docs/WEB_GATEWAY_ARCHITECTURE_CZ.md",
        "src/ui-registry.ts",
        "src/nexus-shell.ts"
      ],
      "missing": [
        "Gateway server/API adapter",
        "Authenticated remote session flow",
        "PWA client",
        "NAS/domain/tunnel deployment QA"
      ]
    },
    {
      "code": "FEATURE.LASER.CANONICAL_DOMAIN_FOUNDATION",
      "name": "LASER canonical domain foundation",
      "owner": "APP.KX.LASER",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.LASER.P566_PRESERVATION_CONTRACT"
      ],
      "completionCriteria": [
        {
          "code": "ENTITY_MODEL",
          "description": "Machine → Source Module → Profile → Lens → Project → Operation → Test → Test Run → Import canonical entities",
          "verified": true
        },
        {
          "code": "TYPED_ACTIONS",
          "description": "Specialized LASER actions guard all writes; generic Core entity-create bypass is blocked",
          "verified": true
        },
        {
          "code": "IDENTITY",
          "description": "recordUid immutable and KXP/KXT/KXI identity rules validated",
          "verified": true
        },
        {
          "code": "MULTI_LENS",
          "description": "Project/Test multi-lens invariants and operation/test-run concrete lens rules validated",
          "verified": true
        },
        {
          "code": "SCOPE_SECURITY",
          "description": "Concrete Space access and reference privacy are enforced in the service layer",
          "verified": true
        },
        {
          "code": "P566_PREVIEW",
          "description": "P566 migration preview is read-only and reports identity defects without writes",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime and structural QA pass",
          "verified": true
        }
      ],
      "evidence": [
        "qa/laser_domain_foundation_runtime.mjs",
        "qa/laser_domain_foundation_check.py"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.HUB_INTEGRATION_CONTRACT",
      "name": "Core ↔ Hub integration/backfill contract",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME",
        "FEATURE.CORE.SOURCE_RECOVERY_INTEGRITY"
      ],
      "completionCriteria": [
        {
          "code": "ALL_APPS",
          "description": "All 48 registered hubs are present in the integration matrix",
          "verified": true
        },
        {
          "code": "CORE_CONSUME",
          "description": "Shared Core capabilities are explicit before hub implementation",
          "verified": true
        },
        {
          "code": "PUBLISH_BACK",
          "description": "Every hub has mandatory publish-back checklist to Core registries",
          "verified": true
        },
        {
          "code": "RETURN_TO_CORE",
          "description": "Reusable hub capabilities must be evaluated for Core promotion",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Machine-readable contract is covered by permanent QA",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/hub-integration-contract.json",
        "docs/architecture/CORE_HUB_INTEGRATION_CONTRACT_CZ.txt",
        "qa/hub_integration_contract_check.py"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.CORE.TRASH_RETENTION_FOUNDATION",
      "name": "Core global Trash/Retention foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.RUNTIME",
        "FEATURE.CORE.SETTINGS_SHARING",
        "FEATURE.CORE.HUB_INTEGRATION_CONTRACT"
      ],
      "completionCriteria": [
        {
          "code": "GLOBAL_INDEX",
          "description": "CORE.TRASH_ENTRY indexes recoverable deletion metadata across owner hubs without copying canonical payload",
          "verified": true
        },
        {
          "code": "OWNER_PROTOCOL",
          "description": "Restore/purge eligibility resolves owner-published typed capability; direct foreign-hub canonical writes are forbidden",
          "verified": true
        },
        {
          "code": "RETENTION_SETTINGS",
          "description": "Core Settings declare retention, large-delete and storage warning/critical thresholds with safe defaults",
          "verified": true
        },
        {
          "code": "DRY_RUN",
          "description": "Purge dry-run checks retention, protection/hold, dependencies, backup evidence, owner availability/action and impact size",
          "verified": true
        },
        {
          "code": "RESTORE_PLAN",
          "description": "Restore planning is permission-aware and remains non-executable until owner capability is AVAILABLE",
          "verified": true
        },
        {
          "code": "STORAGE_PRESSURE",
          "description": "Storage assessment reports INFO/WARNING/CRITICAL and trash budget without triggering automatic purge",
          "verified": true
        },
        {
          "code": "NO_DESTRUCTIVE_EXECUTION",
          "description": "DELTA 015 exposes no production purge/restore executor and automatic purge stays false",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Runtime/static/integration/source-recovery QA permanently covers the foundation",
          "verified": true
        }
      ],
      "evidence": [
        "src/core-runtime.ts",
        "src/ui-registry.ts",
        "core/registries/core-runtime-contract.json",
        "core/registries/hub-integration-contract.json",
        "qa/core_trash_retention_runtime.mjs",
        "qa/core_trash_retention_check.py",
        "KX.CORE_TRASH_RETENTION/1"
      ],
      "missing": [],
      "notes": [
        "Trash is not Archive, Revision History or Backup. Core keeps a last-known metadata index; owner hub/service remains canonical authority."
      ]
    },
    {
      "code": "FEATURE.CORE.TRASH_RETENTION_PRODUCTION",
      "name": "Core production Trash Center + owner restore/purge execution",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.TRASH_RETENTION_FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "FOUNDATION",
          "description": "Global index/retention/dry-run foundation verified",
          "verified": true
        },
        {
          "code": "OWNER_EXECUTION_ORCHESTRATOR",
          "description": "Core single-entry typed owner execution revalidates plan/dry-run and requires verified owner readback before Trash state transition",
          "verified": true
        },
        {
          "code": "FILESERVICE_OWNER_LIFECYCLE",
          "description": "FileService BROWSER_BLOB publishes tested soft-trash/restore/permanent-purge owner lifecycle with dependency and physical readback; NATIVE_FILE purge remains degraded",
          "verified": true
        },
        {
          "code": "DOCUMENT_OWNER_LIFECYCLE",
          "description": "DocumentService CORE.DOCUMENT publishes tested soft-trash/restore/permanent-purge owner lifecycle; purge removes only document metadata/version refs/outgoing relations/revisions and preserves referenced CORE.FILE bytes",
          "verified": true
        },
        {
          "code": "LASER_RESTORE_OWNER_LIFECYCLE",
          "description": "LaserDomainService PROJECT/TEST/TEST_RUN publishes tested soft-trash + restore owner lifecycle preserving stable identity, relations and timing; purge remains unavailable",
          "verified": true
        },
        {
          "code": "LASER_PURGE_DEPENDENCY_AUDIT",
          "description": "LaserDomainService read-only permanent-purge audit hashes target/relations/revisions and fail-closed inventories archived children, KXI mappings and foreign relations before any future destructive design",
          "verified": true
        },
        {
          "code": "LASER_PURGE_TRANSACTION_SANDBOX",
          "description": "Read-only LASER purge sandbox builds exact backup envelope, explicit KXI repair + entity/relation/revision cleanup plan and proves fault-injection rollback hash parity without live workspace mutation",
          "verified": true
        },
        {
          "code": "LASER_PURGE_REPOSITORY_TRANSACTION_SANDBOX",
          "description": "Physical MemoryCoreRepository atomic purge candidate + repository readback + post-commit compensation writes prove exact backup parity while live workspace remains untouched",
          "verified": true
        },
        {
          "code": "LASER_PURGE_DURABLE_JOURNAL_SANDBOX",
          "description": "Repository purge sandbox stages durable lineage journal + audit + PENDING outbox with exact metadata readback; compensation restores domain, persists COMPENSATED journal/audit and removes pending destructive outbox",
          "verified": true
        },
        {
          "code": "LASER_PURGE_JOURNAL_RECOVERY_DISPATCH_GATE",
          "description": "Restart/replay sandbox verifies exact COMMITTED journal before destructive outbox eligibility; PRIMARY_COMMITTED/incomplete/ambiguous states quarantine, COMPENSATED never dispatches, SyncService skips unverified journal-gated records and replay is idempotent",
          "verified": true
        },
        {
          "code": "LASER_PURGE_DURABLE_ADAPTER_RESTART_PARITY",
          "description": "Physical SQLite file restart/reopen parity verifies DELTA065 journal recovery through NativeSqliteCoreRepository command protocol; COMMITTED dispatches once, replay is idempotent and unsafe states quarantine. IndexedDB full-origin and Tauri/Rust host remain separately blocked/pending.",
          "verified": true
        },
        {
          "code": "LASER_PURGE_SQLITE_ABRUPT_CRASH_RECOVERY_PARITY",
          "description": "Physical SQLite WAL abrupt-process-exit proof: pre-COMMIT leaves zero partial writes; post-COMMIT/pre-ACK survives fully; recovery dispatches once, replay is idempotent and PRIMARY_COMMITTED quarantines.",
          "verified": true
        },
        {
          "code": "LASER_PURGE_OWNER_EXECUTION_PREFLIGHT",
          "description": "READ-only LASER purge owner execution preflight composes dependency audit, exact backup transaction design, repository compensation, durable journal and recovery replay evidence while classifying the active repository adapter; production execution remains disabled until physical adapter/host proof and owner action publication are independently verified.",
          "verified": true
        },
        {
          "code": "OWNER_ACTION_COVERAGE_MATRIX",
          "description": "Read-only bounded matrix enumerates registered Trash owner/resource capabilities and verifies support, AVAILABLE state, ActionBus registration and non-recursive action codes without invoking owner actions or promoting aggregate OWNER_ACTIONS.",
          "verified": true
        },
        {
          "code": "OWNER_ACTION_COVERAGE_MATRIX_UI",
          "description": "Trash Center exposes the bounded owner capability/readiness matrix through an explicit manual READ-only panel; no owner action or aggregate OWNER_ACTIONS promotion is triggered.",
          "verified": true
        },
        {
          "code": "OWNER_ACTIONS",
          "description": "Every participating owner publishes tested restore/purge typed actions with collision/readback semantics",
          "verified": false
        },
        {
          "code": "TRASH_CENTER_UI",
          "description": "Global responsive metadata-only Trash Center provides owner/type/status/storage filters, single-entry restore/purge plans, protected/hold/degraded-owner visibility and explicit permanent-purge confirmation through existing Core typed actions.",
          "verified": true
        },
        {
          "code": "BROWSER_BLOB_STORAGE_READBACK",
          "description": "Read-only CoreRepository adapter physically re-hashes BROWSER_BLOB current/history bytes for TRASHED CORE.FILE and compares exact reclaimableBytes; capacity remains explicitly unknown and native/LAN/NAS are not claimed.",
          "verified": true
        },
        {
          "code": "BROWSER_BLOB_STORAGE_READBACK_BOUNDED",
          "description": "Public BROWSER_BLOB readback requires an explicit trimmed/deduplicated selection of at most 64 unique TrashEntry IDs and never implicitly hashes the whole Trash index.",
          "verified": true
        },
        {
          "code": "BROWSER_BLOB_STORAGE_DIAGNOSTICS_UI",
          "description": "Trash Center exposes explicit single-entry read-only BROWSER_BLOB physical parity diagnostics without capacity/native/LAN/NAS claims or repair/cleanup actions",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_PREVIEW",
          "description": "Explicit permission-filtered selection preview trims/deduplicates max 64 TrashEntry IDs and summarizes purge/restore readiness, reclaimable size, owners/storage and blocker counts without publishing batch execution.",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_PURGE_TRANSACTION_SANDBOX",
          "description": "Explicit max-64 purge-eligible selection can be replayed in an isolated MemoryCoreRepository transaction sandbox with deterministic fault injection, exact compensation hash parity and live Trash hash parity; no owner action or production batch executor is invoked.",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_PURGE_TRANSACTION_SANDBOX_UI",
          "description": "Trash Center exposes the isolated max-64 purge transaction sandbox as a manual read-only commit+rollback proof; no owner action, production commit or batch execute control is published.",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_PURGE_READINESS_GATE",
          "description": "Explicit max-64 selection readiness preflight requires existing purge dry-run eligibility, AVAILABLE owner purge capability, physically registered non-recursive owner action and verified storage readback prerequisite; it never invokes owner actions or authorizes production execution.",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_PREVIEW_UI",
          "description": "Trash Center exposes explicit checkbox multi-selection and a read-only bounded selection preview summary; filter changes clear hidden selection and no batch execute controls are published.",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_PURGE_READINESS_UI",
          "description": "Trash Center exposes the bounded READ-only purge readiness gate for explicit max-64 selection and summarizes prerequisites/blockers without owner invocation, production authorization or execute controls.",
          "verified": true
        },
        {
          "code": "BOUNDED_SELECTION_STORAGE_DIAGNOSTICS_UI",
          "description": "Trash Center can manually run max-64 selected BROWSER_BLOB physical parity readback and summarize VERIFIED/MISMATCH/MISSING/unsupported counts and physical bytes without capacity, repair, cleanup, native or LAN/NAS claims.",
          "verified": true
        },
        {
          "code": "NATIVE_MANAGED_STORAGE_READBACK_PROTOCOL",
          "description": "READ-only explicit max-64 NATIVE_MANAGED protocol readback re-reads immutable FileService revisions through ManagedFileStore and verifies size/SHA-256/reclaimableBytes; physical Tauri/Rust host proof, disk capacity and LAN/NAS remain unclaimed.",
          "verified": true
        },
        {
          "code": "NATIVE_MANAGED_DELETE_PROTOCOL_BOUNDARY",
          "description": "Exact immutable NATIVE_MANAGED revision delete protocol requires canonical Files/<FILE.ID>/rNNNNNN/<name> locator, expected size/SHA-256 pre-delete verification and post-delete absence readback; physical Tauri host execution and production FileService NATIVE_FILE purge remain unverified.",
          "verified": true
        },
        {
          "code": "NATIVE_MANAGED_PURGE_TRANSACTION_SANDBOX",
          "description": "READ-only NATIVE_MANAGED purge transaction candidate re-reads exact immutable revisions, simulates delete only on an isolated byte clone, proves fault-injection compensation hash parity and live storage hash parity without calling live deleteRevision.",
          "verified": true
        },
        {
          "code": "NATIVE_MANAGED_ISOLATED_DELETE_EXECUTOR",
          "description": "READ-only isolated ManagedFileStore executor exercises the DELTA085 deleteRevision(locator, expectedSha256, expectedSize) protocol only on a cloned store, proves exact compensation parity and live storage non-mutation; production native purge remains unpublished.",
          "verified": true
        },
        {
          "code": "NATIVE_MANAGED_PURGE_EXECUTION_PREFLIGHT",
          "description": "READ-only max-64 NATIVE_MANAGED purge execution preflight composes verified storage readback, delete-protocol boundary and isolated commit/rollback evidence while explicitly blocking production execution until physical Tauri host and host compensation proof exist.",
          "verified": true
        },
        {
          "code": "NATIVE_MANAGED_HOST_DELETE_TRANSACTION_SOURCE_BOUNDARY",
          "description": "Rust host source contains a bounded max-64 immutable-revision delete transaction helper with complete preflight/byte backup before first delete, no-overwrite compensation and exact post-readback; helper is not a Tauri command and physical Cargo/Tauri execution remains unproven.",
          "verified": true
        },
        {
          "code": "STORAGE_ADAPTERS",
          "description": "Local/native/LAN/NAS storage size/reclaimable/readback adapters are verified",
          "verified": false
        },
        {
          "code": "NOTIFICATION_SCHEDULER",
          "description": "Retention/storage warnings can schedule safe notifications without destructive cleanup",
          "verified": true
        },
        {
          "code": "PURGE_TRANSACTION",
          "description": "Permanent purge uses preview, confirmation, backup/dependency gates, owner action, readback/audit and rollback/compensation",
          "verified": false
        }
      ],
      "evidence": [
        "core/registries/core-runtime-contract.json",
        "docs/architecture/CORE_TRASH_RETENTION_CONTRACT_CZ.txt",
        "core/registries/core-trash-owner-execution-contract.json",
        "qa/core_trash_owner_execution_runtime.mjs",
        "qa/core_trash_owner_execution_check.py",
        "docs/deltas/KX_DELTA_058_CORE_TRASH_OWNER_EXECUTION_ORCHESTRATOR_2026-10-07.txt",
        "core/registries/core-file-trash-lifecycle-contract.json",
        "qa/core_file_trash_lifecycle_runtime.mjs",
        "qa/core_file_trash_lifecycle_check.py",
        "docs/deltas/KX_DELTA_059_CORE_FILE_TRASH_OWNER_LIFECYCLE_2026-10-07.txt",
        "core/registries/laser-trash-restore-contract.json",
        "qa/laser_trash_restore_runtime.mjs",
        "qa/laser_trash_restore_check.py",
        "docs/deltas/KX_DELTA_060_LASER_TRASH_RESTORE_OWNER_LIFECYCLE_2026-10-07.txt",
        "core/registries/laser-purge-dependency-audit-contract.json",
        "qa/laser_purge_dependency_audit_runtime.mjs",
        "qa/laser_purge_dependency_audit_check.py",
        "docs/deltas/KX_DELTA_061_LASER_PURGE_DEPENDENCY_ROLLBACK_AUDIT_2026-10-07.txt",
        "core/registries/laser-purge-transaction-sandbox-contract.json",
        "qa/laser_purge_transaction_sandbox_runtime.mjs",
        "qa/laser_purge_transaction_sandbox_check.py",
        "docs/deltas/KX_DELTA_062_LASER_PURGE_TRANSACTION_SANDBOX_ROLLBACK_2026-10-07.txt",
        "core/registries/laser-purge-repository-transaction-contract.json",
        "qa/laser_purge_repository_transaction_runtime.mjs",
        "qa/laser_purge_repository_transaction_check.py",
        "docs/deltas/KX_DELTA_063_LASER_PURGE_REPOSITORY_ATOMIC_COMPENSATION_SANDBOX_2026-10-07.txt",
        "core/registries/laser-purge-durable-journal-contract.json",
        "qa/laser_purge_durable_journal_runtime.mjs",
        "qa/laser_purge_durable_journal_check.py",
        "docs/deltas/KX_DELTA_064_LASER_PURGE_DURABLE_JOURNAL_AUDIT_OUTBOX_SANDBOX_2026-10-08.txt",
        "core/registries/laser-purge-journal-recovery-contract.json",
        "qa/laser_purge_journal_recovery_runtime.mjs",
        "qa/laser_purge_journal_recovery_check.py",
        "docs/deltas/KX_DELTA_065_LASER_PURGE_JOURNAL_RECOVERY_REPLAY_OUTBOX_GATE_2026-10-08.txt",
        "core/registries/laser-purge-durable-adapter-restart-contract.json",
        "qa/laser_purge_durable_adapter_restart_runtime.mjs",
        "qa/laser_purge_durable_adapter_restart_check.py",
        "qa/sqlite_core_repo_bridge.py",
        "docs/deltas/KX_DELTA_066_LASER_PURGE_DURABLE_ADAPTER_RESTART_PARITY_2026-10-08.txt",
        "core/registries/laser-purge-sqlite-crash-recovery-contract.json",
        "qa/sqlite_crash_worker.py",
        "qa/laser_purge_sqlite_crash_recovery_runtime.mjs",
        "qa/laser_purge_sqlite_crash_recovery_check.py",
        "docs/deltas/KX_DELTA_067_LASER_PURGE_SQLITE_ABRUPT_CRASH_RECOVERY_PARITY_2026-10-09.txt",
        "core/registries/core-trash-center-ui-contract.json",
        "docs/architecture/CORE_TRASH_CENTER_UI_CONTRACT_CZ.txt",
        "qa/trash_center_ui_check.py",
        "docs/deltas/KX_DELTA_068_CORE_TRASH_CENTER_UI_2026-10-09.txt",
        "core/registries/core-trash-warning-scheduler-contract.json",
        "docs/architecture/CORE_TRASH_WARNING_SCHEDULER_CONTRACT_CZ.txt",
        "qa/core_trash_warning_scheduler_runtime.mjs",
        "qa/core_trash_warning_scheduler_check.py",
        "docs/deltas/KX_DELTA_069_CORE_TRASH_WARNING_SCHEDULER_NOTIFICATIONS_2026-10-09.txt",
        "core/registries/core-trash-storage-readback-contract.json",
        "docs/architecture/CORE_TRASH_STORAGE_READBACK_CONTRACT_CZ.txt",
        "qa/core_trash_storage_readback_runtime.mjs",
        "qa/core_trash_storage_readback_check.py",
        "docs/deltas/KX_DELTA_070_CORE_TRASH_BROWSER_BLOB_STORAGE_READBACK_2026-10-09.txt",
        "core/registries/core-trash-storage-diagnostics-ui-contract.json",
        "docs/architecture/CORE_TRASH_STORAGE_DIAGNOSTICS_UI_CONTRACT_CZ.txt",
        "qa/core_trash_storage_diagnostics_ui_check.py",
        "docs/deltas/KX_DELTA_071_CORE_TRASH_STORAGE_DIAGNOSTICS_UI_2026-10-09.txt",
        "core/registries/core-trash-storage-readback-bounds-contract.json",
        "docs/architecture/CORE_TRASH_STORAGE_READBACK_BOUNDS_CONTRACT_CZ.txt",
        "qa/core_trash_storage_readback_bounds_check.py",
        "docs/deltas/KX_DELTA_072_CORE_TRASH_STORAGE_READBACK_BOUNDED_SELECTION_2026-10-09.txt",
        "core/registries/core-trash-selection-preview-contract.json",
        "docs/architecture/CORE_TRASH_SELECTION_PREVIEW_CONTRACT_CZ.txt",
        "qa/core_trash_selection_preview_runtime.mjs",
        "qa/core_trash_selection_preview_check.py",
        "docs/deltas/KX_DELTA_073_CORE_TRASH_BOUNDED_SELECTION_PREVIEW_2026-10-09.txt",
        "core/registries/core-trash-selection-preview-ui-contract.json",
        "docs/architecture/CORE_TRASH_SELECTION_PREVIEW_UI_CONTRACT_CZ.txt",
        "qa/core_trash_selection_preview_ui_check.py",
        "docs/deltas/KX_DELTA_074_CORE_TRASH_SELECTION_PREVIEW_UI_2026-10-09.txt",
        "core/registries/core-trash-selection-storage-diagnostics-ui-contract.json",
        "docs/architecture/CORE_TRASH_SELECTION_STORAGE_DIAGNOSTICS_UI_CONTRACT_CZ.txt",
        "qa/core_trash_selection_storage_diagnostics_ui_check.py",
        "docs/deltas/KX_DELTA_075_CORE_TRASH_SELECTION_STORAGE_DIAGNOSTICS_UI_2026-10-09.txt",
        "core/registries/core-trash-selection-purge-transaction-sandbox-contract.json",
        "docs/architecture/CORE_TRASH_SELECTION_PURGE_TRANSACTION_SANDBOX_CONTRACT_CZ.txt",
        "qa/core_trash_selection_purge_transaction_sandbox_runtime.mjs",
        "qa/core_trash_selection_purge_transaction_sandbox_check.py",
        "docs/deltas/KX_DELTA_076_CORE_TRASH_SELECTION_PURGE_TRANSACTION_SANDBOX_2026-10-09.txt",
        "docs/deltas/KX_DELTA_077_CORE_TRASH_SELECTION_PURGE_READINESS_GATE_2026-10-09.txt",
        "qa/core_trash_selection_purge_readiness_runtime.mjs",
        "qa/core_trash_selection_purge_readiness_check.py",
        "core/registries/core-trash-selection-purge-readiness-ui-contract.json",
        "docs/architecture/CORE_TRASH_SELECTION_PURGE_READINESS_UI_CONTRACT_CZ.txt",
        "qa/core_trash_selection_purge_readiness_ui_check.py",
        "docs/deltas/KX_DELTA_078_CORE_TRASH_SELECTION_PURGE_READINESS_UI_2026-10-09.txt",
        "core/registries/core-trash-selection-purge-transaction-sandbox-ui-contract.json",
        "docs/architecture/CORE_TRASH_SELECTION_PURGE_TRANSACTION_SANDBOX_UI_CONTRACT_CZ.txt",
        "qa/core_trash_selection_purge_transaction_sandbox_ui_check.py",
        "docs/deltas/KX_DELTA_079_CORE_TRASH_SELECTION_PURGE_TRANSACTION_SANDBOX_UI_2026-10-09.txt",
        "core/registries/core-trash-owner-coverage-contract.json",
        "docs/architecture/CORE_TRASH_OWNER_COVERAGE_CONTRACT_CZ.txt",
        "qa/core_trash_owner_coverage_runtime.mjs",
        "qa/core_trash_owner_coverage_check.py",
        "docs/deltas/KX_DELTA_080_CORE_TRASH_OWNER_COVERAGE_READINESS_MATRIX_2026-10-09.txt",
        "core/registries/core-trash-owner-coverage-ui-contract.json",
        "docs/architecture/CORE_TRASH_OWNER_COVERAGE_UI_CONTRACT_CZ.txt",
        "qa/core_trash_owner_coverage_ui_check.py",
        "docs/deltas/KX_DELTA_081_CORE_TRASH_OWNER_COVERAGE_UI_2026-10-09.txt",
        "core/registries/core-document-trash-lifecycle-contract.json",
        "docs/architecture/CORE_DOCUMENT_TRASH_LIFECYCLE_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_082_CORE_DOCUMENT_TRASH_OWNER_LIFECYCLE_2026-10-09.txt",
        "qa/core_document_trash_lifecycle_runtime.mjs",
        "qa/core_document_trash_lifecycle_check.py",
        "core/registries/laser-purge-owner-execution-preflight-contract.json",
        "qa/laser_purge_owner_execution_preflight_runtime.mjs",
        "qa/laser_purge_owner_execution_preflight_check.py",
        "docs/architecture/LASER_PURGE_OWNER_EXECUTION_PREFLIGHT_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_083_LASER_PURGE_OWNER_EXECUTION_PREFLIGHT_2026-10-09.txt",
        "core/registries/core-trash-native-managed-storage-readback-contract.json",
        "qa/core_trash_native_managed_storage_readback_runtime.mjs",
        "qa/core_trash_native_managed_storage_readback_check.py",
        "docs/deltas/KX_DELTA_084_CORE_TRASH_NATIVE_MANAGED_STORAGE_READBACK_PROTOCOL_2026-10-09.txt",
        "core/registries/core-trash-native-managed-delete-protocol-contract.json",
        "docs/architecture/CORE_TRASH_NATIVE_MANAGED_DELETE_PROTOCOL_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_085_CORE_TRASH_NATIVE_MANAGED_DELETE_PROTOCOL_BOUNDARY_2026-10-10.txt",
        "qa/core_trash_native_managed_delete_protocol_runtime.mjs",
        "qa/core_trash_native_managed_delete_protocol_check.py",
        "core/registries/core-trash-native-managed-purge-transaction-sandbox-contract.json",
        "qa/core_trash_native_managed_purge_transaction_sandbox_runtime.mjs",
        "qa/core_trash_native_managed_purge_transaction_sandbox_check.py",
        "docs/deltas/KX_DELTA_086_CORE_TRASH_NATIVE_MANAGED_PURGE_TRANSACTION_SANDBOX_2026-10-10.txt",
        "qa/core_trash_native_managed_isolated_delete_executor_runtime.mjs",
        "qa/core_trash_native_managed_isolated_delete_executor_check.py",
        "core/registries/core-trash-native-managed-isolated-delete-executor-contract.json",
        "docs/deltas/KX_DELTA_087_CORE_TRASH_NATIVE_MANAGED_ISOLATED_DELETE_EXECUTOR_2026-10-10.txt",
        "core/registries/core-trash-native-managed-purge-execution-preflight-contract.json",
        "qa/core_trash_native_managed_purge_execution_preflight_runtime.mjs",
        "qa/core_trash_native_managed_purge_execution_preflight_check.py",
        "docs/deltas/KX_DELTA_088_CORE_TRASH_NATIVE_MANAGED_PURGE_EXECUTION_PREFLIGHT_2026-10-10.txt",
        "core/registries/core-trash-native-managed-host-delete-transaction-source-contract.json",
        "docs/architecture/CORE_TRASH_NATIVE_MANAGED_HOST_DELETE_TRANSACTION_SOURCE_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_089_CORE_TRASH_NATIVE_MANAGED_HOST_DELETE_TRANSACTION_SOURCE_BOUNDARY_2026-10-10.txt",
        "qa/core_trash_native_managed_host_delete_transaction_source_runtime.mjs",
        "qa/core_trash_native_managed_host_delete_transaction_source_check.py",
        "src-tauri/src/lib.rs"
      ],
      "missing": [
        "LASER permanent purge owner lifecycle",
        "Transaction-safe NATIVE_FILE permanent purge for FileService",
        "LAN/NAS storage deletion adapters",
        "Multi-item purge transaction rollback/compensation"
      ],
      "notes": [
        "No automatic permanent deletion is authorized merely because a size/percentage threshold is reached.",
        "DELTA058 verifies generic single-entry owner action dispatch + readback.",
        "DELTA060 makes LaserDomainService restore AVAILABLE for Project/Test/Test Run with identity/relation/timing readback; LASER purge remains DECLARED_ONLY.",
        "DELTA061 verifies a read-only LASER permanent-purge dependency/rollback audit; purge execution remains unpublished and DECLARED_ONLY.",
        "DELTA062 verifies a read-only LASER purge transaction sandbox with exact backup envelope, explicit KXI mapping repair and fault-injection rollback parity; no live destructive purge action is published.",
        "DELTA063 verifies physical MemoryCoreRepository atomic commit + repository readback + compensation atomic write parity in an isolated sandbox; IndexedDB/native SQLite remain statically bound and production LASER purge remains unpublished.",
        "DELTA064 verifies durable lineage journal + audit/outbox staging/readback and compensation cleanup of pending destructive outbox in an isolated MemoryCoreRepository sandbox; production LASER purge remains unpublished.",
        "DELTA065 verifies restart/replay journal recovery and binds SyncService to journalGateRequired/journalDispatchVerified: only exact COMMITTED sandbox records dispatch once; PRIMARY_COMMITTED/incomplete/SENDING quarantine and COMPENSATED never dispatches. Production LASER purge remains unpublished.",
        "DELTA066 physically verifies restart/reopen parity over a real SQLite file through NativeSqliteCoreRepository command protocol; this is durable SQLite protocol evidence, not a claim of physical Tauri/Rust host execution. Managed Chromium still blocks full-origin IndexedDB proof; production LASER purge remains unpublished.",
        "DELTA067 physically verifies abrupt SQLite process exits with os._exit(): uncommitted batch leaves zero partial writes, committed batch survives and recovers exactly once. Tauri/Rust host and full-origin IndexedDB remain blocked/pending; production LASER purge remains unpublished.",
        "DELTA068 verifies the responsive metadata-only Trash Center UI; DELTA069 verifies warning-only retention/storage scheduling through Core Alarm/BackgroundJob/NotificationCoordinator. Neither stage authorizes automatic purge or verifies storage adapters.",
        "DELTA070 physically verifies read-only BROWSER_BLOB repository bytes/revisions/reclaimable parity only. capacityKnown=false; native/LAN/NAS adapters and the aggregate STORAGE_ADAPTERS criterion remain unverified.",
        "DELTA071 exposes DELTA070 BROWSER_BLOB physical parity as explicit single-entry read-only Trash Center diagnostics. It never auto-runs, never repairs/deletes, rejects capacity claims and leaves native/LAN/NAS plus aggregate STORAGE_ADAPTERS unverified.",
        "DELTA072 hardens ACTION.CORE.TRASH.STORAGE.READBACK: entryIds are required, trimmed/deduplicated and capped at 64 unique items; empty selection can no longer trigger an implicit whole-Trash hash scan. Aggregate STORAGE_ADAPTERS remains unverified.",
        "DELTA073 adds a permission-filtered explicit multi-item preview capped at 64 unique TrashEntry IDs. It publishes no batch restore/purge executor and leaves OWNER_ACTIONS, STORAGE_ADAPTERS and PURGE_TRANSACTION unverified.",
        "DELTA074 exposes DELTA073 as explicit max-64 checkbox selection preview UI; filter changes clear hidden selection, preview validates destructiveExecutionAllowed=false/batchExecutionPublished=false and no batch restore/purge controls are published.",
        "DELTA075 exposes manual max-64 physical parity readback for the current explicit selection using only the existing BROWSER_BLOB read-only action. Capacity, Native/LAN/NAS, repair/cleanup and aggregate STORAGE_ADAPTERS remain unverified.",
        "DELTA076 verifies a max-64 purge-eligible multi-item transaction/compensation candidate only inside an isolated MemoryCoreRepository: injected AFTER_ITEM_N faults restore exact sandbox hash and live Trash hash remains unchanged. No owner action, production batch executor, Native/LAN/NAS adapter or aggregate PURGE_TRANSACTION is claimed.",
        "DELTA077 adds a READ-only bounded purge readiness gate. Only BROWSER_BLOB + CORE.FILE currently satisfies the verified storage readback prerequisite; Native/LAN/NAS/LASER destructive paths remain unverified and OWNER_ACTIONS/STORAGE_ADAPTERS/PURGE_TRANSACTION stay false.",
        "DELTA078 exposes DELTA077 purge readiness as an explicit manual read-only Trash Center diagnostic. It adds no execute control, invokes no owner action and leaves OWNER_ACTIONS, STORAGE_ADAPTERS and PURGE_TRANSACTION unverified.",
        "DELTA081 exposes DELTA080 owner coverage as a manual read-only Trash Center panel. It invokes no owner action, publishes no execute control and leaves OWNER_ACTIONS/STORAGE_ADAPTERS/PURGE_TRANSACTION unverified.",
        "DELTA082 verifies the CORE.DOCUMENT owner lifecycle with owner-side incoming-relation recheck and referenced FILE preservation; aggregate OWNER_ACTIONS remains false because LASER permanent purge is still unavailable.",
        "DELTA086 verifies an isolated NATIVE_MANAGED byte-clone purge transaction candidate with fault-injection compensation hash parity; it never calls live deleteRevision and does not publish production NATIVE_FILE purge.",
        "DELTA087 exercises the DELTA085 immutable deleteRevision protocol only inside an IsolatedManagedFileStore clone; live managed bytes remain unchanged and aggregate OWNER_ACTIONS/STORAGE_ADAPTERS/PURGE_TRANSACTION remain false.",
        "DELTA088 composes D084-D087 native-managed evidence into a bounded READ-only purge execution preflight. It remains productionReady=false because physical Tauri host proof and host transactional compensation proof are unavailable; aggregate OWNER_ACTIONS/STORAGE_ADAPTERS/PURGE_TRANSACTION remain false.",
        "DELTA089 adds a source-only Rust host delete-transaction boundary and repairs the duplicate Rust SHA validator namespace. It is deliberately not a Tauri command; cargo/rustc are absent, so physical host proof and production NATIVE_FILE purge remain unpublished and aggregate OWNER_ACTIONS/STORAGE_ADAPTERS/PURGE_TRANSACTION stay false."
      ]
    },
    {
      "code": "FEATURE.CORE.NAVIGATION_TAXONOMY",
      "name": "Scalable Hub Navigation taxonomy + resolver foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.LAYOUT_REGISTRY"
      ],
      "completionCriteria": [
        {
          "code": "CONTRACT",
          "description": "Machine-readable navigation contract covers all registered hubs and Core quick tools",
          "verified": true
        },
        {
          "code": "THEME_INDEPENDENCE",
          "description": "Explicit navigation mode remains unchanged when Theme changes",
          "verified": true
        },
        {
          "code": "MULTI_PLACEMENT",
          "description": "One canonical hub target may appear in multiple category projections without duplicated data identity",
          "verified": true
        },
        {
          "code": "PROFILE_VALIDATION",
          "description": "Favorites/pinned/hidden/order/category overrides reject unknown phantom references",
          "verified": true
        },
        {
          "code": "SCALABILITY",
          "description": "Contract is designed for at least 100 registered launcher items",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static navigation QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/navigation-contract.json",
        "src/navigation-registry.ts",
        "qa/navigation_registry_runtime.mjs",
        "qa/navigation_contract_check.py",
        "docs/architecture/NEXUS_NAVIGATION_TAXONOMY_CONTRACT_CZ.txt"
      ],
      "missing": [],
      "notes": [
        "Foundation verifies taxonomy and deterministic resolver only; full interactive render/persistence is tracked separately."
      ]
    },
    {
      "code": "FEATURE.CORE.NAVIGATION_RUNTIME",
      "name": "Interactive multi-mode NEXUS navigation runtime",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.NAVIGATION_TAXONOMY",
        "FEATURE.APPEARANCE.LAYOUT_ENGINE"
      ],
      "completionCriteria": [
        {
          "code": "PERSISTENCE",
          "description": "USER/WORKSPACE navigation profile persists typed drag/drop order and overrides through Core Settings",
          "verified": true
        },
        {
          "code": "VISUAL_HOST",
          "description": "Shared visual renderer host maps declared menu modes to reusable renderer families and consumes persisted profile",
          "verified": true
        },
        {
          "code": "RENDERERS",
          "description": "Sidebar/Dock/Grid/Mega/Orbit/Command/Mobile renderers consume one resolver contract",
          "verified": false
        },
        {
          "code": "INTERACTION",
          "description": "Drag/drop, hover, long-press, keyboard and badges are wired",
          "verified": false
        },
        {
          "code": "RESPONSIVE",
          "description": "Desktop/tablet/mobile representative browser QA",
          "verified": false
        }
      ],
      "evidence": [
        "core/registries/navigation-contract.json",
        "src/navigation-registry.ts",
        "src/navigation-profile.ts",
        "qa/navigation_profile_runtime.mjs",
        "qa/navigation_profile_check.py",
        "src/navigation-visual-runtime.ts",
        "qa/navigation_visual_runtime.mjs",
        "qa/navigation_visual_check.py"
      ],
      "missing": [
        "Drag/drop + long-press + keyboard bindings",
        "Recent/context feed integration",
        "Responsive/accessibility/browser QA",
        "Final per-mode interaction/polish beyond shared renderer families"
      ]
    },
    {
      "code": "FEATURE.CORE.NAVIGATION_CONTEXT_PROFILES",
      "name": "One-user WORK/HOME/ALL Navigation Context Profiles",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.NAVIGATION_TAXONOMY",
        "FEATURE.CORE.NAVIGATION_PROFILE_PERSISTENCE",
        "FEATURE.CORE.NAVIGATION_RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "ONE_USER",
          "description": "WORK/HOME/ALL are perspectives under one USER identity; no canonical APP/domain data duplication",
          "verified": true
        },
        {
          "code": "EXPLICIT_MEMBERSHIP",
          "description": "All 56 launcher items have explicit WORK/HOME/BOTH defaults with preserved named defaults and recorded reconstruction basis",
          "verified": true
        },
        {
          "code": "SCOPED_OVERRIDES",
          "description": "WORKSPACE→USER membership and context-profile overrides persist through Core Settings",
          "verified": true
        },
        {
          "code": "FIVE_ACTIONS",
          "description": "READ/SWITCH/MEMBERSHIP.SAVE/PROFILE.SAVE/RESET typed actions registered",
          "verified": true
        },
        {
          "code": "CONTEXT_UI",
          "description": "NEXUS Apps launcher exposes WORK/HOME/ALL switch, membership editor and badges",
          "verified": true
        },
        {
          "code": "PER_CONTEXT_ORDER",
          "description": "WORK/HOME order/mode persists independently; ALL uses ordinary Navigation profile",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static/browser integration QA",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/navigation-context-contract.json",
        "src/navigation-context-profile.ts",
        "qa/navigation_context_profile_runtime.mjs",
        "qa/navigation_context_profile_check.py",
        "docs/architecture/NEXUS_WORK_HOME_CONTEXT_PROFILE_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_023_WORK_HOME_ALL_CONTEXT_PROFILES_2026-10-05.txt"
      ],
      "missing": [],
      "notes": [
        "Reconstructed from preserved DELTA023 changelog. Exact original values for non-explicit launcher memberships were not preserved; deterministic reconstruction basis is stored per defaultMembership row."
      ]
    },
    {
      "code": "FEATURE.CORE.NAVIGATION_PROFILE_PERSISTENCE",
      "name": "Persistent USER/WORKSPACE navigation profile + drag/drop foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.NAVIGATION_TAXONOMY",
        "FEATURE.CORE.SETTINGS_SHARING"
      ],
      "completionCriteria": [
        {
          "code": "TYPED_PROFILE",
          "description": "Versioned profile is persisted in Core Settings with USER/WORKSPACE scopes only",
          "verified": true
        },
        {
          "code": "INHERITANCE",
          "description": "WORKSPACE profile is deterministically merged with USER overrides without copying APP data",
          "verified": true
        },
        {
          "code": "DRAG_ITEM",
          "description": "Item drag/drop order persists and resolves deterministically",
          "verified": true
        },
        {
          "code": "DRAG_CATEGORY",
          "description": "Category order and per-item category placement persist without phantom references",
          "verified": true
        },
        {
          "code": "REQUIRED_GUARD",
          "description": "Required Core launchers cannot be hidden by persisted profile",
          "verified": true
        },
        {
          "code": "SCOPE_SECURITY",
          "description": "USER profile read/write/reset/drag scope is isolated unless manage-users permission is present; WORKSPACE writes use Core global settings policy",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "src/navigation-profile.ts",
        "src/navigation-registry.ts",
        "src/ui-registry.ts",
        "qa/navigation_profile_runtime.mjs",
        "qa/navigation_profile_check.py",
        "docs/architecture/NEXUS_NAVIGATION_PROFILE_CONTRACT_CZ.txt",
        "docs/deltas/KX_DELTA_018_NEXUS_NAVIGATION_PROFILE_PERSISTENCE_2026-10-03.txt"
      ],
      "missing": [],
      "notes": [
        "Full visual renderers, long-press/hover/keyboard and responsive accessibility remain in FEATURE.CORE.NAVIGATION_RUNTIME."
      ]
    },
    {
      "code": "FEATURE.CORE.PERSONAL_PROJECTIONS",
      "name": "Personal projection + last-known-good foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.NAVIGATION_TAXONOMY"
      ],
      "completionCriteria": [
        {
          "code": "OWNER_PROJECTION",
          "description": "Personal surface consumes owner descriptors/snapshots instead of copied canonical owner data",
          "verified": true
        },
        {
          "code": "LKG",
          "description": "Unavailable/degraded owner can return bounded last-known-good projection with explicit freshness",
          "verified": true
        },
        {
          "code": "PERMISSION",
          "description": "Permission denial hides cached projection payload",
          "verified": true
        },
        {
          "code": "SENSITIVE_REDACTION",
          "description": "Sensitive fields are excluded from offline/LKG snapshot by default",
          "verified": true
        },
        {
          "code": "NO_FABRICATION",
          "description": "Missing snapshot never fabricates a fresh Personal card value",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static projection QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/personal-projection-contract.json",
        "src/personal-projection.ts",
        "qa/personal_projection_runtime.mjs",
        "qa/personal_projection_check.py",
        "docs/architecture/PERSONAL_PROJECTION_LKG_CONTRACT_CZ.txt"
      ],
      "missing": [],
      "notes": [
        "Persistent audited cross-session projection store and full Personal Home card UI are tracked separately."
      ]
    },
    {
      "code": "FEATURE.SHOP.PERSONALIZATION_STUDIO",
      "name": "SHOP Personalization Studio + product/variant/template map",
      "owner": "APP.KX.SHOP",
      "status": "PLANNED",
      "dependencies": [
        "FEATURE.CORE.NAVIGATION_TAXONOMY"
      ],
      "completionCriteria": [
        {
          "code": "BUILDER",
          "description": "Revisioned personalization template builder/subprogram",
          "verified": false
        },
        {
          "code": "MAP",
          "description": "Template -> Product -> Variant -> SKU/Stock -> Shopify -> Laser/Production mapping",
          "verified": false
        },
        {
          "code": "IMPORT_EXPORT",
          "description": "Identity-preserving template/binding import/export",
          "verified": false
        },
        {
          "code": "AI",
          "description": "AI assists mapping/audit through typed owner actions",
          "verified": false
        }
      ],
      "evidence": [
        "docs/architecture/SHOP_PERSONALIZATION_STUDIO_FUTURE_CZ.txt"
      ],
      "missing": []
    },
    {
      "code": "FEATURE.APPEARANCE.ASSET_PERSONALIZATION",
      "name": "Icon/Logo/Background platform asset personalization",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.APPEARANCE.ICON_LIBRARY",
        "FEATURE.APPEARANCE.THEME_ENGINE",
        "FEATURE.CORE.NAVIGATION_TAXONOMY"
      ],
      "completionCriteria": [
        {
          "code": "ICON_PACKS",
          "description": "Replaceable icon packs and per-item overrides with stable ICON.CODE",
          "verified": true
        },
        {
          "code": "PLATFORM_ICONS",
          "description": "Windows/macOS/Android unsigned application-icon export creates FileService-owned ICO/ICNS/AppIconset/adaptive-icon artifacts with exact source/output binding; signing/installers remain native release work",
          "verified": true
        },
        {
          "code": "BRAND_BACKGROUND",
          "description": "Logo/background responsive styling is live for safe raster assets; platform export remains separate",
          "verified": true
        },
        {
          "code": "FALLBACK",
          "description": "Live raster stale/unsafe fallback + derived contrast are active; broader rollback/export safety remains separate",
          "verified": true
        },
        {
          "code": "THUMBNAIL_CACHE",
          "description": "Permission/freshness-aware thumbnails use exact source binding, bounded memory LRU and actor-scoped device-derived IndexedDB cache with quota/invalidation/reconciliation",
          "verified": true
        },
        {
          "code": "ASSET_LIBRARY_BROWSING",
          "description": "Permission-aware bounded Asset Library windows use a database-native actor-scoped derived SQLite projection when READY, with fixed SQL/search/filter/sort paging and automatic portable fallback when unavailable/EMPTY/STALE/ERROR; canonical FileService ownership is unchanged",
          "verified": true
        },
        {
          "code": "ASSET_LIBRARY_METADATA",
          "description": "Actor-scoped categories/tags/favorites/collections with bounded bulk metadata edit and library filters; canonical FILE bytes remain FileService-owned",
          "verified": true
        },
        {
          "code": "CONTRAST_MATRIX",
          "description": "72-theme readability matrix derives non-persistent fallback role colors and worst-case asset-background scrim without mutating canonical Theme/Profile data",
          "verified": true
        },
        {
          "code": "AI_GENERATION_APPROVAL",
          "description": "AI-generated FILE.ID outputs require exact provenance binding, explicit approval and stale fail-closed verification before existing Appearance Asset registration",
          "verified": true
        },
        {
          "code": "WOFF2_SAFE_RUNTIME",
          "description": "WOFF2 adapter validates bounded container metadata, requires a trusted host decoder, re-validates decoded SFNT and binds only the FileService-owned SAFE derivative; default without provider is fail-closed",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/appearance-asset-contract.json",
        "docs/architecture/CORE_APPEARANCE_ASSET_PERSONALIZATION_FUTURE_CZ.txt",
        "qa/appearance_assets_check.py",
        "qa/appearance_assets_runtime.mjs",
        "src/appearance-assets.ts",
        "core/registries/appearance-asset-ingestion-contract.json",
        "src/appearance-asset-ingestion.ts",
        "qa/appearance_asset_ingestion_runtime.mjs",
        "core/registries/appearance-live-binding-contract.json",
        "src/appearance-live-binding.ts",
        "qa/appearance_live_binding_runtime.mjs",
        "qa/appearance_asset_ingestion_check.py",
        "docs/recovery/DELTA030_STAGE00_CONTRACT_LOCK_STATUS_CZ.txt",
        "docs/deltas/KX_DELTA_030_APPEARANCE_ASSET_THUMBNAIL_CACHE_2026-10-06.txt",
        "docs/deltas/KX_DELTA_031_APPEARANCE_ASSET_LIBRARY_BROWSING_DIAGNOSTICS_2026-10-06.txt",
        "docs/recovery/DELTA031_STAGE01_STATUS_CZ.txt",
        "docs/deltas/KX_DELTA_031_APPEARANCE_ASSET_LIBRARY_METADATA_COLLECTIONS_BULK_2026-10-06.txt",
        "docs/recovery/DELTA031_STAGE02_STATUS_CZ.txt",
        "core/registries/appearance-contrast-matrix-contract.json",
        "src/appearance-contrast-matrix.ts",
        "qa/appearance_contrast_matrix_runtime.mjs",
        "qa/appearance_contrast_matrix_check.py",
        "core/registries/ai-generation-approval-contract.json",
        "src/ai-generation-approval.ts",
        "qa/ai_generation_approval_runtime.mjs",
        "qa/ai_generation_approval_check.py",
        "core/registries/appearance-platform-export-contract.json",
        "src/appearance-platform-export.ts",
        "scripts/generate-appearance-platform-export-contract.mjs",
        "qa/appearance_platform_export_runtime.mjs",
        "qa/appearance_platform_export_check.py",
        "core/registries/appearance-woff2-decoder-contract.json",
        "src/appearance-woff2-decoder.ts",
        "scripts/generate-appearance-woff2-decoder-contract.mjs",
        "qa/appearance_woff2_decoder_runtime.mjs",
        "qa/appearance_woff2_decoder_check.py",
        "src-tauri/Cargo.toml",
        "src-tauri/src/lib.rs",
        "src/platform-adapters.ts",
        "qa/native_woff2_provider_check.py",
        "qa/native_woff2_provider_runtime.mjs",
        "core/registries/appearance-asset-library-index-contract.json",
        "src/appearance-asset-library-index.ts",
        "scripts/generate-appearance-asset-library-index-contract.mjs",
        "qa/appearance_asset_library_index_runtime.mjs",
        "qa/appearance_asset_library_index_check.py"
      ],
      "missing": [
        "Native cargo check/build evidence for the DELTA036 trusted-host WOFF2 provider remains environment-blocked; signed installer/package build also remain separate work."
      ],
      "notes": [
        "DELTA030 Stage01 implements runtime thumbnails + bounded memory LRU; Stage02 adds actor-scoped device-derived cache, quota, invalidation and reconciliation. STRICT FULL_ORIGIN remains environment-blocked, so DELTA030 is not recovery-closed.",
        "DELTA031 Stage01 adds bounded library browsing and storage/cache diagnostics without changing FileService canonical byte ownership; DELTA030 STRICT FULL_ORIGIN remains environment-blocked and is not retroactively closed.",
        "DELTA031 Stage02 adds actor-scoped categories/tags/favorites/collections and bounded bulk metadata actions/UI; metadata is separate from shared descriptors and never duplicates canonical FileService bytes.",
        "DELTA032 Stage01 adds a 72-theme / 7-pair contrast-readability matrix, derived runtime role fallbacks and conservative live asset-background scrim; canonical Theme registry/Profile data remain unchanged.",
        "DELTA033 Stage01 adds generation-specific proposal/provenance/history: raw prompts are not persisted, output binding is exact, APPROVE routes through the existing Appearance Asset register action, REJECT is non-destructive and stale output fails closed.",
        "DELTA034 Stage01 adds real FileService-owned unsigned Windows ICO, macOS ICNS/AppIconset and Android adaptive-icon export with exact source/output SHA binding and VERIFY; OS installer signing/notarization/store packaging remains separate native release work.",
        "DELTA035 Stage01 adds the bounded trusted-host WOFF2 decoder adapter, decoded-SFNT safety revalidation, FileService-owned derivative and live binding; browser FontFace decoding and remote decoders remain forbidden.",
        "DELTA036 Stage01 source-integrates the pure-Rust Allsorts native WOFF2 provider behind the DELTA035 trusted-host adapter, repeats bounded WOFF2 preflight inside the Tauri command, verifies source/output hashes, and stays fail-closed on web/no-host. Native compilation is explicitly unverified in this sandbox because cargo/rustc are unavailable.",
        "DELTA037 Stage01 adds actor-scoped database-native SQLite derived indexing/pagination for Asset Library with explicit rebuild, mutation-sequence stale detection, fixed bounded SQL and automatic permission-aware portable fallback; canonical bytes and metadata ownership remain unchanged."
      ]
    },
    {
      "code": "FEATURE.AI.AGENT_STUDIO",
      "name": "Contextual AI Agent Studio + category/subsection helpers",
      "owner": "APP.KX.AI",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.AI.AGENT_REGISTRY_CONTEXT_FOUNDATION",
        "FEATURE.AI.EVERYWHERE",
        "FEATURE.CORE.NAVIGATION_TAXONOMY"
      ],
      "completionCriteria": [
        {
          "code": "AGENT_REGISTRY",
          "description": "Versioned AGENT.CODE registry with instructions, owner/scope, capabilities and permissions",
          "verified": true
        },
        {
          "code": "CONTEXT_BINDING",
          "description": "Agents bind to hub/category/collection/subsection/record/workspace context without copying canonical data",
          "verified": true
        },
        {
          "code": "QUICK_ACTIONS",
          "description": "Contextual quick-action agents call only allowed typed actions",
          "verified": true
        },
        {
          "code": "EDITOR",
          "description": "Agent Studio can create/edit/duplicate/import/export user/workspace agents",
          "verified": false
        },
        {
          "code": "APPROVAL",
          "description": "Write/financial/destructive/external actions remain ActionBus/approval gated",
          "verified": true
        }
      ],
      "evidence": [
        "docs/architecture/CORE_AI_AGENT_STUDIO_FUTURE_CZ.txt",
        "qa/ai_agent_registry_runtime.mjs",
        "docs/deltas/KX_DELTA_021_AI_AGENT_REGISTRY_CONTEXT_FOUNDATION_2026-10-05.txt"
      ],
      "missing": [
        "Full Agent Studio editor/version/import/export",
        "Contextual Agent Host UI across all surfaces (DELTA022)",
        "Agent picker/test sandbox/audit proposal history UI"
      ]
    },
    {
      "code": "FEATURE.CORE.PERSONAL_HOME_RUNTIME",
      "name": "Personal Home resilient card runtime",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.PERSONAL_PROJECTIONS",
        "FEATURE.CORE.NAVIGATION_RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "PERSISTENCE",
          "description": "Projection snapshots persist across restart with audit/revision policy",
          "verified": false
        },
        {
          "code": "OWNER_ADAPTERS",
          "description": "Health/Home/Finance/etc publish through real owner capabilities",
          "verified": false
        },
        {
          "code": "CARD_UI",
          "description": "Personal cards display live/LKG/stale/unavailable states consistently",
          "verified": false
        },
        {
          "code": "SENSITIVE_STORAGE",
          "description": "Sensitive opt-in storage/encryption capability is explicit and tested",
          "verified": false
        },
        {
          "code": "RESPONSIVE",
          "description": "Desktop/tablet/mobile browser QA",
          "verified": true,
          "evidence": "D093 Stage142 qa/browser_smoke_cdp.mjs FULL_ORIGIN Chromium 141: Personal Home grid 1280px desktop, 820px tablet (3 cols), 390px mobile (1 col), no horizontal overflow; this environment only"
        }
      ],
      "evidence": [
        "core/registries/personal-projection-contract.json",
        "qa/browser_smoke_cdp.mjs",
        "qa/home_domain_runtime.mjs",
        "qa/personal_d093_suite.mjs",
        "qa/personal_home_ui_check.py",
        "qa/personal_planner_owner_adapter_runtime.mjs",
        "qa/personal_restored_card_live_guard_runtime.mjs",
        "qa/personal_shell_runtime_access_check.py",
        "qa/pets_domain_runtime.mjs",
        "qa/school_domain_runtime.mjs",
        "qa/vehicles_domain_runtime.mjs",
        "src/home-domain.ts",
        "src/hub-domain-kit.ts",
        "src/nexus-shell.ts",
        "src/personal-planner-owner-adapter.ts",
        "src/personal-projection-bridge.ts",
        "src/personal-projection-persistence.ts",
        "src/personal-projection.ts",
        "src/personal-runtime-bootstrap.ts",
        "src/pets-domain.ts",
        "src/school-domain.ts",
        "src/vehicles-domain.ts"
      ],
      "missing": [
        "PERSISTENCE: restart readback proven (browser IndexedDB reload -> LAST_KNOWN_GOOD; SQLite cross-process fixture) and revision guards exist, but no audit trail for projection writes and no native Tauri restart",
        "OWNER_ADAPTERS: 4/9 hub-native (VEHICLES, PETS, HOME, SCHOOL = HUB_DOMAIN_SERVICE); 2 CORE_PLANNER_DERIVED (SHIPPING/FOOD); HEALTH/FINANCE/SUBSCRIPTIONS no provider (sensitive policy)",
        "CARD_UI: LIVE / LAST_KNOWN_GOOD / UNAVAILABLE verified in browser; STALE_LAST_KNOWN and DENIED only verified in runtime tests, not rendered in a browser run",
        "SENSITIVE_STORAGE: sensitive persistence remains BLOCKED_POLICY; no encryption-at-rest/key management/consent flow",
        "Accessibility audit beyond role=alert errors not performed"
      ],
      "notes": [
        "D093 Stage139-142 (2026-10-11): planner-derived owner providers, Personal Home card UI, restored-card LIVE defect fixed in Runtime.readCards, RESPONSIVE promoted on browser evidence. Feature remains PARTIAL; productionVerified=false."
      ]
    },
    {
      "code": "FEATURE.CORE.NAVIGATION_VISUAL_FOUNDATION",
      "name": "Shared multi-mode navigation visual renderer foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.CORE.NAVIGATION_TAXONOMY",
        "FEATURE.CORE.NAVIGATION_PROFILE_PERSISTENCE",
        "FEATURE.APPEARANCE.THEME_ENGINE"
      ],
      "completionCriteria": [
        {
          "code": "SHARED_HOST",
          "description": "One renderer host consumes resolved navigation instead of copying hub data",
          "verified": true
        },
        {
          "code": "MODE_FAMILIES",
          "description": "All concrete declared modes map to GRID/SIDEBAR/MEGA/DOCK/COMMAND/ORBIT renderer families",
          "verified": true
        },
        {
          "code": "APPEARANCE_TOKENS",
          "description": "Theme/layout/icon/density are independent render tokens and do not rewrite navigation profile",
          "verified": true
        },
        {
          "code": "INTERACTION_BASELINE",
          "description": "Mode switching, search, keyboard focus and desktop drag/drop are wired through typed profile actions",
          "verified": true
        },
        {
          "code": "IDENTITY",
          "description": "Multiple visual placements keep one canonical APP target and Core quick tools do not fabricate hub copies",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static visual navigation QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "src/navigation-visual-runtime.ts",
        "src/nexus-shell.ts",
        "app/styles.css",
        "qa/navigation_visual_runtime.mjs",
        "qa/navigation_visual_check.py",
        "docs/architecture/NEXUS_NAVIGATION_VISUAL_RUNTIME_CONTRACT_CZ.txt"
      ],
      "missing": [],
      "notes": [
        "Full touch/long-press/badge/recent-context/accessibility polish remains in FEATURE.CORE.NAVIGATION_RUNTIME."
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.ASSET_PERSONALIZATION_FOUNDATION",
      "name": "Appearance Asset Profile + metadata registry foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.ICON_LIBRARY",
        "FEATURE.CORE.NAVIGATION_TAXONOMY",
        "FEATURE.CORE.SETTINGS_DEFAULTS"
      ],
      "completionCriteria": [
        {
          "code": "CONTRACT",
          "description": "KX.APPEARANCE_ASSET_PERSONALIZATION/1 defines independent icon/brand/background/typography/platform layers",
          "verified": true
        },
        {
          "code": "SCOPED_PROFILE",
          "description": "Typed WORKSPACE -> USER profile persistence uses Core Settings and audited actions",
          "verified": true
        },
        {
          "code": "STABLE_IDS",
          "description": "56 current navigation items derive stable ICON.CODE slots and per-icon override never changes APP identity",
          "verified": true
        },
        {
          "code": "METADATA_ONLY",
          "description": "Asset refs reject embedded bytes/data URI/path traversal and keep binary payload outside Core records",
          "verified": true
        },
        {
          "code": "PLATFORM_PROFILES",
          "description": "Windows/macOS/Android/In-app export target metadata and Android adaptive foreground/background shape are declared",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated runtime/static Appearance Asset QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/appearance-asset-contract.json",
        "src/appearance-assets.ts",
        "scripts/generate-appearance-asset-contract.mjs",
        "qa/appearance_assets_runtime.mjs",
        "qa/appearance_assets_check.py",
        "docs/architecture/CORE_APPEARANCE_ASSET_PERSONALIZATION_CONTRACT_CZ.txt"
      ],
      "missing": [],
      "notes": [
        "Foundation remains VERIFIED; full Appearance evolution is tracked under FEATURE.APPEARANCE.ASSET_PERSONALIZATION. DELTA034 adds unsigned platform icon export; DELTA035 adds the bounded WOFF2 adapter; DELTA036 source-integrates the native Allsorts provider but keeps native build verification pending until cargo/rustc are available."
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.BRAND_PRESET_FOUNDATION",
      "name": "Brand / Typography / Visual Preset Registry foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.ASSET_PERSONALIZATION_FOUNDATION",
        "FEATURE.APPEARANCE.THEME_ENGINE",
        "FEATURE.APPEARANCE.LAYOUT_ENGINE"
      ],
      "completionCriteria": [
        {
          "code": "PRESETS",
          "description": "12 composable replaceable brand presets are declared over existing Appearance layers",
          "verified": true
        },
        {
          "code": "REFERENCE_PROVENANCE",
          "description": "20 USER references + 4 generated planning boards are preserved with SHA-256 and authority classification",
          "verified": true
        },
        {
          "code": "TYPOGRAPHY_METADATA",
          "description": "6 font stacks + 18 text roles are metadata only",
          "verified": true
        },
        {
          "code": "STATE_METADATA",
          "description": "14 icon states + 9 splash/loading states are metadata only",
          "verified": true
        },
        {
          "code": "PRESERVE_OVERRIDES",
          "description": "Preset apply preserves per-icon, brand/logo and platform app-icon overrides",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated Brand preset runtime/static QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/appearance-brand-preset-contract.json",
        "src/appearance-brand-presets.ts",
        "qa/appearance_brand_presets_runtime.mjs",
        "qa/appearance_brand_presets_check.py"
      ],
      "missing": [],
      "notes": [
        "Full interactive Appearance/Brand Studio remains PARTIAL and starts in DELTA025+."
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.STUDIO_EDITOR_FOUNDATION",
      "name": "Appearance / Brand Studio editor draft foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.BRAND_PRESET_FOUNDATION",
        "FEATURE.APPEARANCE.ASSET_PERSONALIZATION_FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "ACTOR_DRAFT",
          "description": "USER/WORKSPACE Studio draft is actor-bound and separate from active profile",
          "verified": true
        },
        {
          "code": "UNDO_REDO",
          "description": "30-step bounded undo/redo is enforced",
          "verified": true
        },
        {
          "code": "EDIT_LAYERS",
          "description": "Icon pack/background/typography and FILE.ID logo/per-icon metadata edit through canonical validator",
          "verified": true
        },
        {
          "code": "COMMIT_DISCARD",
          "description": "Persistent Appearance changes only on explicit COMMIT; DISCARD leaves profile untouched",
          "verified": true
        },
        {
          "code": "PERSISTENT_DRAFT",
          "description": "Actor/scope-bound Studio draft survives runtime reload through CORE.APPEARANCE_STUDIO_DRAFT",
          "verified": true
        },
        {
          "code": "CONFLICT_REBASE",
          "description": "Commit is bound to the exact baseline revision; conflicts block overwrite and use explicit three-way rebase",
          "verified": true
        },
        {
          "code": "UI",
          "description": "Appearance drawer exposes Studio draft workflow and live draft preview",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated 12/12 Studio runtime and static QA pass",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/appearance-studio-contract.json",
        "src/appearance-studio.ts",
        "qa/appearance_studio_runtime.mjs",
        "qa/appearance_studio_persistence_runtime.mjs",
        "qa/appearance_studio_check.py"
      ],
      "missing": [],
      "notes": [
        "DELTA029 is recovery-closed: reload-safe Core persistence, exact baseline revision binding, blocking conflicts, explicit three-way rebase and per-path CURRENT/DRAFT conflict UI are implemented and verified."
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.ASSET_INGESTION_FOUNDATION",
      "name": "Appearance FileService asset ingestion / preview / provenance foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.ASSET_PERSONALIZATION_FOUNDATION",
        "FEATURE.APPEARANCE.STUDIO_EDITOR_FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "FILE_OWNER",
          "description": "Core FileService remains the only binary owner; Appearance persists descriptor/reference metadata only",
          "verified": true
        },
        {
          "code": "VALIDATION",
          "description": "SHA-256, MIME/extension, size and raster dimensions are verified from canonical bytes",
          "verified": true
        },
        {
          "code": "PROVENANCE",
          "description": "Descriptor records provenance/license metadata and exact contentRevision",
          "verified": true
        },
        {
          "code": "STALE_GUARD",
          "description": "Changed contentRevision/hash blocks stale preview/ref until re-registration",
          "verified": true
        },
        {
          "code": "PERMISSION_PREVIEW",
          "description": "Catalog/inspect/preview/ref enforce concrete FILE READ; raster preview uses ephemeral blob URL",
          "verified": true
        },
        {
          "code": "ACTIONS_QA",
          "description": "Nineteen typed actions cover ingestion, thumbnail/device cache maintenance, bounded Asset Library browsing/metadata/collections and DELTA037 native-index STATUS/REBUILD; dedicated runtime + static QA verify parity and fail-closed fallback",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/appearance-asset-ingestion-contract.json",
        "src/appearance-asset-ingestion.ts",
        "scripts/generate-appearance-asset-ingestion-contract.mjs",
        "qa/appearance_asset_ingestion_runtime.mjs",
        "qa/appearance_asset_ingestion_check.py",
        "core/registries/appearance-asset-library-index-contract.json",
        "src/appearance-asset-library-index.ts",
        "qa/appearance_asset_library_index_runtime.mjs",
        "qa/appearance_asset_library_index_check.py"
      ],
      "missing": [],
      "notes": [
        "DELTA028 adds SAFE-only SVG sanitization, font inspection and live binding.",
        "DELTA030 Stage01 adds permission/freshness-aware runtime thumbnails; Stage02 adds actor-scoped IndexedDB-derived cache with quota/invalidation/reconciliation while FileService remains the only canonical binary owner.",
        "DELTA035 adds the trusted-host WOFF2 adapter; DELTA036 source-integrates a bounded Allsorts Tauri provider while native cargo verification remains environment-blocked. SAFE decoded artifacts remain FileService-owned.",
        "DELTA037 adds two index actions (STATUS/REBUILD) and native SQL acceleration while preserving the existing bounded permission-aware fallback; total ingestion/library action count is 19."
      ]
    },
    {
      "code": "FEATURE.APPEARANCE.LIVE_BINDING_FOUNDATION",
      "name": "Appearance live raster binding / fallback / contrast foundation",
      "owner": "APP.NEXUS",
      "status": "VERIFIED",
      "dependencies": [
        "FEATURE.APPEARANCE.ASSET_INGESTION_FOUNDATION",
        "FEATURE.APPEARANCE.ASSET_PERSONALIZATION_FOUNDATION"
      ],
      "completionCriteria": [
        {
          "code": "EFFECTIVE_PROFILE",
          "description": "Live binding resolves effective WORKSPACE -> USER Appearance profile through existing Core service",
          "verified": true
        },
        {
          "code": "SAFE_RASTER",
          "description": "PNG/JPEG/WEBP brand/background/navigation overrides render from current validated descriptors only",
          "verified": true
        },
        {
          "code": "FAIL_CLOSED",
          "description": "Stale revision, checksum/MIME mismatch, permission denial or unsafe locator falls back without changing canonical identity",
          "verified": true
        },
        {
          "code": "RESPONSIVE",
          "description": "Background fit/focal point/fixed/opacity/blur/scale become derived responsive runtime presentation",
          "verified": true
        },
        {
          "code": "CONTRAST",
          "description": "Contrast overlay is derived through the DELTA032 readability matrix/worst-case background guard and never mutates persisted Appearance profile or canonical Theme tokens",
          "verified": true
        },
        {
          "code": "SAFE_FONT",
          "description": "WOFF1/TTF/OTF bind after current SAFE artifact; WOFF2 binds only a current exact-hash FileService decoded SFNT derivative from the trusted-host decoder adapter",
          "verified": true
        },
        {
          "code": "QA",
          "description": "Dedicated 9/9 runtime + static Live Binding QA passes",
          "verified": true
        }
      ],
      "evidence": [
        "core/registries/appearance-live-binding-contract.json",
        "src/appearance-live-binding.ts",
        "scripts/generate-appearance-live-binding-contract.mjs",
        "qa/appearance_live_binding_runtime.mjs",
        "qa/appearance_live_binding_check.py",
        "core/registries/appearance-contrast-matrix-contract.json",
        "src/appearance-contrast-matrix.ts",
        "qa/appearance_contrast_matrix_runtime.mjs",
        "core/registries/appearance-woff2-decoder-contract.json",
        "src/appearance-woff2-decoder.ts"
      ],
      "missing": [],
      "notes": [
        "DELTA028 establishes sanitized SVG and SAFE font binding. DELTA035 extends WOFF2 through a trusted-host decoder adapter and FileService-owned decoded derivative; without a host provider it remains fail-closed. The RESOLVE action code is reconstructed because the preserved DELTA027 handoff did not contain the exact original typed action code."
      ]
    },
    {
      "code": "FEATURE.CORE.RELEASE_PACKAGE_FOUNDATION",
      "name": "Signed/package release build foundation",
      "owner": "APP.NEXUS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.SOURCE_RECOVERY_INTEGRITY"
      ],
      "completionCriteria": [
        {
          "code": "CONTRACT",
          "description": "Deterministic Windows/macOS/Android package/signing readiness contract and evidence schema",
          "verified": true
        },
        {
          "code": "READINESS_PLANNER",
          "description": "Planner separates unsigned build, signing readiness and cryptographically verified release evidence without source credentials",
          "verified": true
        },
        {
          "code": "UNSIGNED_CI_RUNNER_SOURCE",
          "description": "Manual Windows/macOS physical unsigned CI build workflow + SHA evidence collector source integrated",
          "verified": true
        },
        {
          "code": "RUNNER_EVIDENCE_INGESTION",
          "description": "Physical unsigned runner evidence is re-hashed from local artifact bytes, source-revision bound and cannot escalate signing/notarization/publication claims",
          "verified": true
        },
        {
          "code": "TRUST_VERIFIER_BOUNDARY",
          "description": "Physical Windows Authenticode and macOS Developer ID/notarization verifier boundary requires DELTA040 provenance, signing handoff lineage, re-hashed signed bytes and native platform tools; verifier never signs or publishes",
          "verified": true
        },
        {
          "code": "SIGNING_PRODUCER_FOUNDATION",
          "description": "Secure Windows/macOS signing producer source uses GitHub release-signing Environment Secrets, re-hashes DELTA040 unsigned inputs, emits physical signed outputs plus lineage-only KX.RELEASE_SIGNING_HANDOFF/1, and cannot establish trust by itself",
          "verified": true
        },
        {
          "code": "RELEASE_CANDIDATE_ORCHESTRATION",
          "description": "DELTA043 binds DELTA040 provenance + DELTA042 handoff + DELTA041 native trust verification to re-hashed physical signed bytes and emits release-candidate evidence without publication",
          "verified": true
        },
        {
          "code": "RELEASE_CHANNEL_GATE",
          "description": "DELTA044 re-hashes DELTA043 physical candidate bytes and records INTERNAL/BETA/STABLE release-channel gate evidence behind GitHub environment release-publication without publishing/tagging/promoting",
          "verified": true
        },
        {
          "code": "GITHUB_RELEASE_PUBLICATION_EXECUTOR",
          "description": "DELTA045 validates DELTA044 gate evidence + physical signed bytes, requires explicit GitHub Actions execution acknowledgement, publishes only BETA/STABLE GitHub Releases, then re-downloads and re-hashes release assets before emitting publication evidence; update-channel/store publication remain separate",
          "verified": true
        },
        {
          "code": "TAURI_UPDATE_CHANNEL_BOUNDARY",
          "description": "DELTA046 re-hashes physical Tauri updater bundle + .sig files, binds DELTA045 publication evidence, validates Tauri static manifest shape and source readiness blockers, and remains read-only/non-promoting until updater signature trust + runtime configuration are physically enabled",
          "verified": true
        },
        {
          "code": "TAURI_UPDATER_ARTIFACT_PRODUCER_CRYPTO_VERIFIER",
          "description": "DELTA047 binds verified publication+candidate evidence to exact updater bundle production and performs real Minisign/Ed25519 artifact + trusted-comment signed-version verification; source-integrated workflow remains non-promoting and production-key execution is separate",
          "verified": true
        },
        {
          "code": "TAURI_2_12_RUST_1_90_COMPATIBILITY_BOUNDARY",
          "description": "DELTA048 migrates the native source boundary to Rust 1.90 with exact Tauri 2.12.0 / tauri-build 2.7.0 pins and an exact CI MSRV toolchain while keeping updater runtime/configuration disabled until physical cargo resolution + reviewed Cargo.lock evidence exists",
          "verified": true
        },
        {
          "code": "NATIVE_CARGO_PHYSICAL_PROOF_BOUNDARY",
          "description": "DELTA049 source-integrates an exact Rust 1.90.0 canonical Cargo.lock producer plus Windows/macOS/Linux cargo check --locked evidence collector/aggregator; physical runner execution remains pending until real evidence is ingested",
          "verified": true
        },
        {
          "code": "NATIVE_CARGO_LOCK_PHYSICAL_PROOF_INGESTION_ACCEPTANCE_BOUNDARY",
          "description": "DELTA050 source-integrates exact GitHub proof-run metadata binding, re-download/re-hash of all DELTA049 physical proof artifacts, independent three-platform log re-verification and candidate Cargo.lock acceptance evidence without source mutation",
          "verified": true
        },
        {
          "code": "NATIVE_CARGO_EXECUTION_TARGET_BOUNDARY",
          "description": "DELTA051 Stage00 source-integrates exact GitHub repository/source/workflow hash verification before DELTA049 physical Cargo proof execution; current physical NEXUS execution target remains unavailable",
          "verified": true
        },
        {
          "code": "NATIVE_CARGO_REPOSITORY_BOOTSTRAP_BOUNDARY",
          "description": "DELTA052 Stage00 verifies every Source Recovery tracked file by size/SHA and emits a deterministic source-only repository bootstrap inventory without inventing or creating a remote repository; physical target remains blocked until a private NEXUS repository is created or connected",
          "verified": true
        },
        {
          "code": "NATIVE_GIT_PROVENANCE_BOOTSTRAP_BOUNDARY",
          "description": "DELTA053 Stage00 materializes the exact Source Recovery source into a deterministic local Git root commit and verified Git bundle while explicitly forbidding remote push/source-authority transfer",
          "verified": true
        },
        {
          "code": "NATIVE_GIT_REMOTE_HANDOFF_BOUNDARY",
          "description": "DELTA054 Stage00 adds a fail-closed Git remote handoff protocol that permits only empty-remote initial push, exact-parent fast-forward or already-exact idempotent verification; force/delete/ref rewrite are forbidden and post-push refs must read back exactly",
          "verified": true
        },
        {
          "code": "WINDOWS_SIGNED_ARTIFACT",
          "description": "Physical MSI/NSIS build and Authenticode verification on Windows release runner",
          "verified": false
        },
        {
          "code": "MACOS_NOTARIZED_ARTIFACT",
          "description": "Physical app/DMG signing, notarization and staple verification on macOS release runner",
          "verified": false
        },
        {
          "code": "ANDROID_SIGNED_ARTIFACT",
          "description": "Initialized Android target with physical signed AAB/APK and signature verification",
          "verified": false
        },
        {
          "code": "STORE_PUBLICATION",
          "description": "Store publication evidence where applicable",
          "verified": false
        }
      ],
      "evidence": [
        "core/registries/release-package-contract.json",
        "src/release-package-foundation.ts",
        "scripts/release-package-plan.mjs",
        "qa/release_package_foundation_runtime.mjs",
        "qa/release_package_foundation_check.py",
        "core/registries/release-runner-contract.json",
        ".github/workflows/release-runner.yml",
        "scripts/check-release-version-alignment.mjs",
        "scripts/collect-release-runner-evidence.mjs",
        "qa/release_runner_integration_runtime.mjs",
        "qa/release_runner_integration_check.py",
        "core/registries/release-evidence-ingestion-contract.json",
        "scripts/ingest-release-runner-evidence.mjs",
        "qa/release_evidence_ingestion_runtime.mjs",
        "qa/release_evidence_ingestion_check.py",
        "core/registries/release-trust-verifier-contract.json",
        "scripts/verify-release-trust-evidence.mjs",
        "qa/release_trust_verifier_runtime.mjs",
        "qa/release_trust_verifier_check.py",
        ".github/workflows/release-trust-verifier.yml",
        "core/registries/release-signing-producer-contract.json",
        "scripts/release-signing-producer.mjs",
        "qa/release_signing_producer_runtime.mjs",
        "qa/release_signing_producer_check.py",
        ".github/workflows/release-signing-producer.yml",
        "core/registries/release-candidate-contract.json",
        "scripts/assemble-release-candidate.mjs",
        "qa/release_candidate_runtime.mjs",
        "qa/release_candidate_check.py",
        "core/registries/release-channel-gate-contract.json",
        "scripts/approve-release-channel-gate.mjs",
        "qa/release_channel_gate_runtime.mjs",
        "qa/release_channel_gate_check.py",
        ".github/workflows/release-channel-gate.yml",
        "core/registries/release-publication-executor-contract.json",
        "scripts/release-publication-executor.mjs",
        "qa/release_publication_executor_runtime.mjs",
        "qa/release_publication_executor_check.py",
        ".github/workflows/release-publication-executor.yml",
        "core/registries/release-update-channel-contract.json",
        "scripts/release-update-channel-boundary.mjs",
        "qa/release_update_channel_boundary_runtime.mjs",
        "qa/release_update_channel_boundary_check.py",
        ".github/workflows/release-update-channel-boundary.yml",
        "core/registries/release-updater-artifact-producer-contract.json",
        "scripts/release-updater-artifact-producer.mjs",
        "qa/release_updater_artifact_producer_runtime.mjs",
        "qa/release_updater_artifact_producer_check.py",
        ".github/workflows/release-updater-artifact-producer.yml",
        "docs/architecture/CORE_RELEASE_UPDATER_ARTIFACT_PRODUCER_CZ.txt",
        "core/registries/release-updater-runtime-compatibility-contract.json",
        "scripts/release-updater-runtime-compatibility.mjs",
        "qa/release_updater_runtime_compatibility_runtime.mjs",
        "qa/release_updater_runtime_compatibility_check.py",
        "docs/architecture/CORE_RELEASE_UPDATER_RUNTIME_COMPATIBILITY_CZ.txt",
        "core/registries/native-cargo-proof-contract.json",
        "scripts/native-cargo-proof.mjs",
        "qa/native_cargo_proof_runtime.mjs",
        "qa/native_cargo_proof_check.py",
        ".github/workflows/native-cargo-proof.yml",
        "docs/architecture/CORE_NATIVE_CARGO_PROOF_BOUNDARY_CZ.txt",
        "core/registries/native-cargo-lock-acceptance-contract.json",
        "scripts/native-cargo-lock-acceptance.mjs",
        "qa/native_cargo_lock_acceptance_runtime.mjs",
        "qa/native_cargo_lock_acceptance_check.py",
        ".github/workflows/native-cargo-lock-acceptance.yml",
        "docs/architecture/CORE_NATIVE_CARGO_LOCK_ACCEPTANCE_BOUNDARY_CZ.txt",
        "core/registries/native-cargo-execution-target-contract.json",
        "scripts/native-cargo-execution-target.mjs",
        "qa/native_cargo_execution_target_runtime.mjs",
        "qa/native_cargo_execution_target_check.py",
        ".github/workflows/native-cargo-execution-target.yml",
        "docs/architecture/CORE_NATIVE_CARGO_EXECUTION_TARGET_BOUNDARY_CZ.txt",
        "core/registries/native-cargo-repository-bootstrap-contract.json",
        "scripts/native-cargo-repository-bootstrap.mjs",
        "qa/native_cargo_repository_bootstrap_runtime.mjs",
        "qa/native_cargo_repository_bootstrap_check.py",
        "docs/architecture/CORE_NATIVE_CARGO_REPOSITORY_BOOTSTRAP_BOUNDARY_CZ.txt",
        "core/registries/native-git-bootstrap-contract.json",
        "scripts/native-git-bootstrap.mjs",
        "qa/native_git_bootstrap_runtime.mjs",
        "qa/native_git_bootstrap_check.py",
        "docs/architecture/CORE_NATIVE_GIT_BOOTSTRAP_BOUNDARY_CZ.txt",
        "core/registries/native-git-remote-handoff-contract.json",
        "scripts/native-git-remote-handoff.mjs",
        "qa/native_git_remote_handoff_runtime.mjs",
        "qa/native_git_remote_handoff_check.py",
        "docs/architecture/CORE_NATIVE_GIT_REMOTE_HANDOFF_BOUNDARY_CZ.txt"
      ],
      "missing": [
        "Physical Windows/macOS runner execution + ingested provenance evidence from a real GitHub run",
        "Physical Windows/macOS release-candidate evidence from a real GitHub signing + native trust-verifier run",
        "Physical release-channel gate evidence from a real DELTA043 candidate and GitHub Actions release-publication environment run",
        "Physical GitHub Release publication evidence from a real DELTA044 gate + signed-artifact execution run",
        "Windows signed MSI/NSIS artifact evidence",
        "macOS signed+notarized app/DMG evidence",
        "Android initialized project + signed AAB/APK evidence",
        "Store publication evidence",
        "Physical update-channel promotion/public endpoint evidence",
        "Physical DELTA047 production updater workflow evidence using the protected production updater key/public key",
        "Physical DELTA049 three-platform Rust 1.90.0 cargo check --locked execution + DELTA050 exact-run physical proof re-ingestion/acceptance + reviewed canonical Cargo.lock source adoption",
        "Tauri updater runtime configuration after compatibility gate (createUpdaterArtifacts/plugin/pubkey/endpoints/requireSignedVersion)",
        "Physical NEXUS GitHub repository execution target verification (DELTA051 Stage00) before DELTA049/050 workflow execution",
        "Physical private NEXUS GitHub repository creation/connection and DELTA054 exact remote handoff/read-back before DELTA051 execution-target verification"
      ],
      "notes": [
        "DELTA038 Stage01 is a release/package foundation only. No certificate/private key/keystore secret is stored in source and no signed/notarized/published artifact is claimed without platform verification evidence.",
        "DELTA039 Stage01 intentionally aligns release base 0.0.9 across package base/Tauri/Cargo and integrates a manual GitHub unsigned build runner. Source integration is not physical runner execution evidence; signed/notarized/published claims remain false.",
        "DELTA040 Stage01 adds physical-byte rehash/source-revision-bound ingestion. A successful ingest proves only UNSIGNED_BUILD_VERIFIED and cannot set signed/notarized/published claims.",
        "DELTA041 Stage01 adds a fail-closed physical trust verifier boundary: signing handoff JSON cannot establish trust; Windows requires native Authenticode+timestamp verification and macOS requires codesign/Gatekeeper/stapler over physical signed bytes. No signing/notarization submission is performed.",
        "DELTA042 Stage01 adds the secure signing-producer/handoff foundation. Credentials exist only as protected GitHub Environment Secrets at runner execution time; produced handoff claims remain false until DELTA041 native trust verification succeeds. Source integration is not physical signing evidence.",
        "DELTA043 Stage01 adds release-candidate orchestration after DELTA041 native trust verification. Candidate evidence re-hashes physical signed bytes and binds provenance/handoff/trust-verification hashes; store publication remains a separate false claim.",
        "DELTA044 Stage01 adds a candidate-bound release-channel gate behind GitHub environment release-publication. It re-hashes physical candidate bytes and records policy evidence only; human reviewer configuration is external repository state and no tag/GitHub Release/update-channel/store publication is executed.",
        "DELTA045 Stage01 adds a GitHub Release publication executor boundary for BETA/STABLE only. It requires DELTA044 gate evidence, explicit execution acknowledgement, exact source revision, re-hashed signed inputs, and post-publication re-download/re-hash verification; update-channel promotion and store publication remain separate false claims. Source integration is not physical publication evidence.",
        "DELTA046 Stage01 adds a read-only Tauri update-channel boundary. It re-hashes physical updater bundle/signature files and builds a Tauri-compatible static manifest draft, but platform code signing is not treated as the updater signature; cryptographic updater-signature verification, updater runtime configuration and physical channel promotion remain separate false/pending claims.",
        "DELTA047 Stage01 adds a publication+candidate-bound Tauri updater artifact producer and independent Minisign/Ed25519 crypto verifier with signed file/version checks. Windows reuses exact published signed installer bytes; macOS packages a candidate-bound APP extracted from the published DMG. DELTA048 subsequently migrates the project boundary to Rust 1.90 with exact Tauri 2.12.0 / tauri-build 2.7.0 pins, while updater runtime enablement remains a separate physical cargo/Cargo.lock/configuration gate.",
        "DELTA048 Stage01 closes the source-level MSRV/reproducibility gap: project rust-version is 1.90, Tauri and tauri-build are exact pinned, CI requests Rust 1.90.0, updater dependency/config/createUpdaterArtifacts stay disabled, and no Cargo.lock/native compile proof is synthesized in an environment without cargo/rustc.",
        "DELTA049 Stage01 source-integrates a read-only physical Cargo proof workflow: canonical lock generation on Ubuntu, identical lock SHA across Windows/macOS/Linux cargo check --locked evidence, exact source/log/hash binding and fail-closed aggregation. Current sandbox has no cargo/rustc, so no physical proof or Cargo.lock is claimed.",
        "DELTA050 Stage01 source-integrates a read-only physical proof ingestion/acceptance workflow. It binds an exact successful DELTA049 proof run to the current repository/source revision, re-downloads all lock/platform/aggregate artifacts, re-hashes physical cargo-check logs, independently recomputes KX.NATIVE_CARGO_PROOF/1, requires every Cargo.lock copy to be byte-identical and emits only CANDIDATE_LOCK_ACCEPTANCE_VERIFIED. Canonical src-tauri/Cargo.lock adoption remains a separate gate and updater runtime stays disabled.",
        "DELTA051 Stage00 adds a read-only exact GitHub execution-target gate binding repository metadata, source revision, Source Recovery Manifest, Cargo.toml and DELTA051/049/050 workflow hashes. The connected GitHub installation currently exposes no NEXUS repository and the local sandbox has no Rust toolchain/network path, so physical target/proof execution remains BLOCKED and no Cargo.lock/runtime enablement is claimed.",
        "DELTA052 Stage00 adds a deterministic Source Recovery Manifest-bound repository bootstrap export boundary. Every tracked source file is physically re-hashed; build/dist/node_modules/.git and canonical Cargo.lock are forbidden. The output is inventory/hash evidence only and does not create or upload a GitHub repository. Connected GitHub access still has no NEXUS repository and available connector actions do not include repository creation, so the remote execution target remains BLOCKED.",
        "DELTA053 Stage00 converts the exact Source Recovery tree into a deterministic local Git root commit + verified Git bundle. Git metadata/bundle are external provenance and do not become source authority; no remote repository creation/push or Cargo/updater trust claim is made.",
        "DELTA054 Stage00 adds a fail-closed Git remote handoff/push safety protocol. Local bare-remote QA physically proves initial push, exact-parent fast-forward, idempotent read-back and conflict rejection, but the actual private NEXUS GitHub repository still does not exist in the connected installation, so GitHub push/execution-target claims remain false."
      ]
    },
    {
      "code": "FEATURE.VEHICLES.DOMAIN_SERVICE",
      "name": "Vozidla – nativní doménová služba hubu (vozidla, STK, servis, pojištění)",
      "owner": "APP.KX.VEHICLES",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.PERSONAL_HOME_RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "DOMAIN_MODEL",
          "description": "Validated vehicle model persisted via Core EntityService with atomic revision/audit/outbox; unknown fields rejected; odometer monotonic",
          "verified": true
        },
        {
          "code": "ACCESS",
          "description": "Read/edit via Space membership + ResourceAccessService; foreign space and READ-only member edits denied (runtime tested)",
          "verified": true
        },
        {
          "code": "ACTIONS",
          "description": "Six typed ActionBus actions with VEHICLES.VEHICLE.EDIT permission, optimistic concurrency (expectedRevision), archive requires confirmation",
          "verified": true
        },
        {
          "code": "NO_INVENTED_RULES",
          "description": "Next STK date is mandatory user input; next service derived only from user intervals, otherwise cleared",
          "verified": true
        },
        {
          "code": "HUB_UI",
          "description": "Hub panel in APP inspector: create/odometer/service/STK/history/archive; browser FULL_ORIGIN desktop + 390px mobile; HTML injection test",
          "verified": true
        },
        {
          "code": "PERSONAL_HOME_PROJECTION",
          "description": "HUB_DOMAIN_SERVICE owner adapter (merges VEHICLES planner items) -> LIVE in browser; LKG after reload",
          "verified": true
        },
        {
          "code": "NATIVE_PERSISTENCE",
          "description": "Domain data survives native Tauri/SQLite application restart",
          "verified": false
        },
        {
          "code": "ATTACHMENTS",
          "description": "Service receipts/documents linked through FileService relations",
          "verified": false
        },
        {
          "code": "REMINDERS",
          "description": "Due items create Core alarms/notifications on user opt-in",
          "verified": false
        }
      ],
      "evidence": [
        "qa/browser_smoke_cdp.mjs",
        "qa/evidence/vehicles_domain_runtime.json",
        "qa/vehicles_domain_runtime.mjs",
        "qa/vehicles_hub_ui_check.py",
        "src/hub-domain-kit.ts",
        "src/vehicles-domain.ts"
      ],
      "missing": [
        "Native Tauri/SQLite restart not executed",
        "Attachments (FileService relations) not implemented",
        "Alarm/notification reminders not implemented",
        "Tablet layout of hub panel not separately asserted"
      ],
      "notes": [
        "D093 Stage143 (2026-10-11): first hub-native domain service for Gate A. productionVerified=false.",
        "Stage145: refactored onto shared src/hub-domain-kit.ts; original runtime assertions unchanged and passing; blank required field now returns a readable Czech message."
      ]
    },
    {
      "code": "FEATURE.PETS.DOMAIN_SERVICE",
      "name": "Zvířata – nativní doménová služba hubu (zvířata a plán péče)",
      "owner": "APP.KX.PETS",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.PERSONAL_HOME_RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "DOMAIN_MODEL",
          "description": "Pet + bounded care plan (max 30 items, stable CARE ids) via Core EntityService with atomic revision/audit/outbox; unknown fields rejected",
          "verified": true
        },
        {
          "code": "ACCESS",
          "description": "Space membership + ResourceAccessService; foreign space and READ-only member mutations denied (runtime tested)",
          "verified": true
        },
        {
          "code": "ACTIONS",
          "description": "Six typed ActionBus actions with PETS.PET.EDIT; expectedRevision required; care removal and archive require confirmation",
          "verified": true
        },
        {
          "code": "NO_INVENTED_RULES",
          "description": "No assumed vaccination/deworming intervals: next due from user interval or explicit date, otherwise cleared",
          "verified": true
        },
        {
          "code": "HUB_UI",
          "description": "Hub panel in APP inspector: pets, care plan add/complete/remove, history, archive; browser FULL_ORIGIN desktop + 390px mobile; HTML injection test",
          "verified": true
        },
        {
          "code": "PERSONAL_HOME_PROJECTION",
          "description": "HUB_DOMAIN_SERVICE adapter for PERSONAL.PETS.CARE (merges PETS planner items); chip id never leaves the hub; LIVE in browser",
          "verified": true
        },
        {
          "code": "NATIVE_PERSISTENCE",
          "description": "Domain data survives native Tauri/SQLite application restart",
          "verified": false
        },
        {
          "code": "ATTACHMENTS",
          "description": "Vet records/vaccination certificates linked through FileService relations",
          "verified": false
        },
        {
          "code": "REMINDERS",
          "description": "Due care items create Core alarms/notifications on user opt-in",
          "verified": false
        }
      ],
      "evidence": [
        "qa/browser_smoke_cdp.mjs",
        "qa/evidence/pets_domain_runtime.json",
        "qa/hub_domain_ui_check.py",
        "qa/pets_domain_runtime.mjs",
        "src/hub-domain-kit.ts",
        "src/pets-domain.ts"
      ],
      "missing": [
        "Native Tauri/SQLite restart not executed",
        "Attachments (FileService relations) not implemented",
        "Alarm/notification reminders not implemented"
      ],
      "notes": [
        "D093 Stage144 (2026-10-11): second hub-native domain service for Gate A. productionVerified=false.",
        "Stage145: refactored onto shared src/hub-domain-kit.ts; original runtime assertions unchanged and passing; blank required field now returns a readable Czech message."
      ]
    },
    {
      "code": "FEATURE.HOME.DOMAIN_SERVICE",
      "name": "Domácnost – nativní doménová služba hubu (nemovitosti a plán údržby) na sdíleném enginu",
      "owner": "APP.KX.HOME",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.PERSONAL_HOME_RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "DOMAIN_MODEL",
          "description": "Property + bounded maintenance plan (max 40, stable MAINT ids) via shared KXHubKit schedule engine on Core EntityService (atomic revision/audit/outbox)",
          "verified": true
        },
        {
          "code": "ACCESS",
          "description": "Space membership + ResourceAccessService; foreign space / READ-only member mutations denied; shared house space EDIT works (runtime tested)",
          "verified": true
        },
        {
          "code": "ACTIONS",
          "description": "Six typed actions with HOME.PROPERTY.EDIT; expectedRevision; removal + archive require confirmation",
          "verified": true
        },
        {
          "code": "NO_INVENTED_RULES",
          "description": "No assumed legal revision intervals (boiler/gas/electro/chimney): next due from user interval or explicit date, else cleared",
          "verified": true
        },
        {
          "code": "HUB_UI",
          "description": "Hub panel (shared engine UI): property, maintenance add/complete/remove, history, archive; browser FULL_ORIGIN desktop + 390px; injection test; reload persistence",
          "verified": true
        },
        {
          "code": "PERSONAL_HOME_PROJECTION",
          "description": "HUB_DOMAIN_SERVICE adapter for PERSONAL.HOME.STATUS (merges HOME planner items); location text never leaves the hub",
          "verified": true
        },
        {
          "code": "NATIVE_PERSISTENCE",
          "description": "Domain data survives native Tauri/SQLite application restart",
          "verified": false
        },
        {
          "code": "ATTACHMENTS",
          "description": "Revision reports/protocols linked through FileService relations",
          "verified": false
        },
        {
          "code": "REMINDERS",
          "description": "Due maintenance creates Core alarms/notifications on user opt-in",
          "verified": false
        }
      ],
      "evidence": [
        "src/hub-domain-kit.ts",
        "src/home-domain.ts",
        "qa/home_domain_runtime.mjs",
        "qa/hub_domain_ui_check.py",
        "qa/browser_smoke_cdp.mjs",
        "qa/evidence/home_domain_runtime.json"
      ],
      "missing": [
        "Native Tauri/SQLite restart not executed",
        "Attachments (FileService relations) not implemented",
        "Alarm/notification reminders not implemented",
        "Meter readings stored only as maintenance items (no consumption values/units yet)"
      ],
      "notes": [
        "D093 Stage145 (2026-10-11): third hub-native domain; first hub built entirely on the shared KXHubKit engine. Pets refactored onto the same engine (Stage144 tests unchanged, 47/47); Vehicles uses shared helpers (54/54). productionVerified=false."
      ]
    },
    {
      "code": "FEATURE.SCHOOL.DOMAIN_SERVICE",
      "name": "Škola – nativní doménová služba hubu (studenti/kurzy a školní agenda) na sdíleném enginu",
      "owner": "APP.KX.SCHOOL",
      "status": "PARTIAL",
      "dependencies": [
        "FEATURE.CORE.PERSONAL_HOME_RUNTIME"
      ],
      "completionCriteria": [
        {
          "code": "DOMAIN_MODEL",
          "description": "Student/course + bounded agenda (max 60, stable AGENDA ids) via shared KXHubKit engine on Core EntityService (atomic revision/audit/outbox); no birth numbers or other identifiers accepted",
          "verified": true
        },
        {
          "code": "ACCESS",
          "description": "Family space: parents MANAGE edit, child READ sees own agenda but cannot edit (runtime tested)",
          "verified": true
        },
        {
          "code": "ACTIONS",
          "description": "Six typed actions with SCHOOL.STUDENT.EDIT; expectedRevision; removal + archive require confirmation",
          "verified": true
        },
        {
          "code": "NO_INVENTED_RULES",
          "description": "One-off items get no invented next date; recurring only from user interval",
          "verified": true
        },
        {
          "code": "HUB_UI",
          "description": "Shared engine UI; browser FULL_ORIGIN: create, add exam, mark done (rev 3)",
          "verified": true
        },
        {
          "code": "PERSONAL_HOME_PROJECTION",
          "description": "HUB_DOMAIN_SERVICE adapter for PERSONAL.SCHOOL.UPCOMING (merges SCHOOL planner items); school name/class never leave the hub; LIVE in browser",
          "verified": true
        },
        {
          "code": "NATIVE_PERSISTENCE",
          "description": "Domain data survives native Tauri/SQLite application restart",
          "verified": false
        },
        {
          "code": "ATTACHMENTS",
          "description": "Homework/report files linked through FileService relations",
          "verified": false
        },
        {
          "code": "REMINDERS",
          "description": "Due agenda items create Core alarms/notifications on user opt-in",
          "verified": false
        }
      ],
      "evidence": [
        "src/hub-domain-kit.ts",
        "src/school-domain.ts",
        "qa/school_domain_runtime.mjs",
        "qa/hub_domain_ui_check.py",
        "qa/browser_smoke_cdp.mjs",
        "qa/evidence/school_domain_runtime.json"
      ],
      "missing": [
        "Native Tauri/SQLite restart not executed",
        "Attachments not implemented",
        "Reminders not implemented",
        "School reload persistence covered by shared engine (Home/Pets) but not separately asserted for School in browser"
      ],
      "notes": [
        "D093 Stage146 (2026-10-11): fourth hub-native domain (pure engine configuration). productionVerified=false."
      ]
    }
  ]
};
