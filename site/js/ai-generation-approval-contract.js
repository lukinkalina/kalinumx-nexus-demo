var KX_AI_GENERATION_APPROVAL_CONTRACT = {
  "contract": "KX.AI_GENERATION_APPROVAL/1",
  "entitySchema": "KX.AI_GENERATION_PROPOSAL/1",
  "entityType": "CORE.AI_GENERATION_PROPOSAL",
  "targetKinds": [
    "APPEARANCE_ASSET"
  ],
  "statusVocabulary": [
    "PROPOSED",
    "APPROVED",
    "REJECTED",
    "STALE"
  ],
  "rules": {
    "outputBytesOwner": "CORE_FILE_SERVICE_ONLY",
    "approvalMode": "EXPLICIT_TYPED_ACTION",
    "rawPromptStored": false,
    "promptEvidence": "SHA256_PLUS_BOUNDED_EXCERPT",
    "parameters": "BOUNDED_SECRET_KEY_REJECTING_METADATA",
    "outputBinding": "FILE_ID_CONTENT_REVISION_SHA256_MIME_SIZE",
    "inputBinding": "EXACT_FILE_REVISION_CONTENT_REVISION_SHA256",
    "rejectDeletesOutputFile": false,
    "approvalTarget": "ACTION.CORE.APPEARANCE.ASSET.REGISTER",
    "canonicalAppearanceMutationBeforeApproval": false,
    "history": "CORE_ENTITY_REVISIONS_PLUS_AUDIT"
  },
  "limits": {
    "maxPromptChars": 12000,
    "promptExcerptChars": 240,
    "maxParametersJsonBytes": 16384,
    "maxInputFiles": 16,
    "maxListItems": 100
  },
  "actions": {
    "PROPOSE": "ACTION.CORE.AI.GENERATION.PROPOSE",
    "GET": "ACTION.CORE.AI.GENERATION.GET",
    "LIST": "ACTION.CORE.AI.GENERATION.LIST",
    "APPROVE": "ACTION.CORE.AI.GENERATION.APPROVE",
    "REJECT": "ACTION.CORE.AI.GENERATION.REJECT",
    "HISTORY": "ACTION.CORE.AI.GENERATION.HISTORY"
  }
};
