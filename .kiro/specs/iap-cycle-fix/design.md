# IAP Cycle Fix — Design

## Problem Summary

Two issues exist with the current IAP integration:

1. **Circular dependency**: `proStatusService.ts` imports `iapService` (for `purchase`/`restore`), and `iapService` imports `setPro` from `proStatusService`. Metro bundler warns about this on every start and it can cause initialization order bugs.

2. **Native module crash**: `expo-iap` requires a native development build. When run in Expo Go or on web, the app crashes with `Cannot find native module 'ExpoIap'` during `iapService.init()`.

---

## Solution Overview

### 1. Extract `proStorage.ts` — break the cycle

Create `src/storage/proStorage.ts` as a dependency-free module that owns all raw AsyncStorage reads/writes for Pro status and scan counters.

**Dependency graph after the fix:**

```
proStorage.ts          (no imports from this project)
    ↑                       ↑
iapService.ts          proStatusService.ts
```

The cycle is eliminated. `iapService` only needs `setPro` from `proStorage`, not from `proStatusService`.

### 2. Native module guard in `iapService.ts`

Wrap the `expo-iap` import in a try/catch. If the native module is unavailable, the service operates in a no-op "unavailable" mode:

- `init()` — logs a warning, sets `_connected = false`, returns without throwing
- `purchase()` — throws with a user-friendly message: "In-app purchases are not available in this build."
- `restore()` — throws with the same message
- `getLocalizedPrice()` — returns `null`

This allows the app to start and render normally in Expo Go and web. The Pro upgrade UI should check `iapService.isAvailable()` to conditionally show/hide the purchase button.

---

## File Changes

### New file: `src/storage/proStorage.ts`

Owns:
- `KEY_PRO`, `KEY_MONTH`, `KEY_FILES` constants
- `setPro()` — writes `@filmsort:pro_unlocked = "true"`
- `clearPro()` — removes all three keys (used by `resetProStatus`)
- `getRawProFlag()` — reads the raw stored value
- `getRawScanData()` — reads month + count in one `multiGet`
- `setRawScanData(month, count)` — writes month + count

`proStatusService.ts` delegates all AsyncStorage calls to this module.  
`iapService.ts` imports only `setPro` from this module.

### Modified: `src/services/iapService.ts`

- Change import: `setPro` now comes from `../storage/proStorage` (not `proStatusService`)
- Wrap `expo-iap` imports with a try/catch to handle missing native module
- Add `_available: boolean` module flag (true only when native module loaded)
- Add `isAvailable(): boolean` to the public API
- `init()` returns early with a warning when `_available` is false
- `purchase()` and `restore()` throw with a clear message when `_available` is false

### Modified: `src/storage/proStatusService.ts`

- Remove import of `iapService`
- Remove local AsyncStorage logic (delegated to `proStorage`)
- Import storage helpers from `./proStorage`
- Keep all existing public exports and their signatures unchanged
- `purchasePro()` and `restorePro()` still delegate to `iapService` — but imported directly here (one-way, no cycle)

---

## Public API — No Breaking Changes

All existing call sites in the app (`App.tsx`, screens, `ProContext`, etc.) continue to work without modification. The only new addition is `iapService.isAvailable()`.

---

## Testing Considerations

- In a development build with the native module linked: full IAP flow works as before
- In Expo Go / web: app starts, no crash, purchase/restore throw with a readable message
- The cycle warning from Metro is eliminated
