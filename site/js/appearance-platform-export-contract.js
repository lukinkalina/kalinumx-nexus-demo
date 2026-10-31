var KX_APPEARANCE_PLATFORM_EXPORT_CONTRACT = {
  "contract": "KX.APPEARANCE_PLATFORM_EXPORT/1",
  "entityType": "CORE.APPEARANCE_PLATFORM_EXPORT",
  "entitySchema": "KX.APPEARANCE_PLATFORM_EXPORT/1",
  "statusVocabulary": [
    "EXPORTED",
    "STALE",
    "INVALID"
  ],
  "rules": {
    "sourceBytesOwner": "CORE_FILE_SERVICE_ONLY",
    "outputBytesOwner": "CORE_FILE_SERVICE_ONLY",
    "sourceBinding": "FILE_ID_CONTENT_REVISION_SHA256_MIME_SIZE",
    "descriptorFreshnessRequired": true,
    "safeSvgDerivativeRequired": true,
    "exportRequiresConfirmation": true,
    "profileMutation": false,
    "signedInstallerBuild": false,
    "signingNotarization": false,
    "packageClaim": "UNSIGNED_APP_ICON_ARTIFACTS_ONLY"
  },
  "limits": {
    "maxListItems": 100,
    "manifestVersion": 1,
    "maxSourceBytes": 33554432
  },
  "platforms": {
    "WINDOWS": {
      "profileCode": "PLATFORM_ICON.WINDOWS",
      "sourceCount": 1,
      "sizes": [
        16,
        24,
        32,
        48,
        64,
        128,
        256
      ],
      "primary": "app.ico",
      "primaryMime": "image/x-icon",
      "extras": "PNG_SET"
    },
    "MACOS": {
      "profileCode": "PLATFORM_ICON.MACOS",
      "sourceCount": 1,
      "sizes": [
        16,
        32,
        64,
        128,
        256,
        512,
        1024
      ],
      "primary": "AppIcon.icns",
      "primaryMime": "image/icns",
      "extras": "APPICONSET"
    },
    "ANDROID": {
      "profileCode": "PLATFORM_ICON.ANDROID",
      "sourceCount": 2,
      "sizes": [
        48,
        72,
        96,
        144,
        192,
        512
      ],
      "primary": "mipmap-anydpi-v26/ic_launcher.xml",
      "primaryMime": "application/xml",
      "extras": "ADAPTIVE_ICON_SET"
    }
  },
  "actions": {
    "PLAN": "ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.PLAN",
    "EXPORT": "ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.EXPORT",
    "GET": "ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.GET",
    "LIST": "ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.LIST",
    "VERIFY": "ACTION.CORE.APPEARANCE.PLATFORM_EXPORT.VERIFY"
  }
};
