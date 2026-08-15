#!/bin/bash
# Move variables before storageService
sed -i -e '/\/\/ ─── Sync hook (v1.2)/i \
\
\/\/ Add scan status key and hook definitions after exports (module-scoped)\
const SCAN_STATUS_KEY = '\''@cinescan:scan_status'\'';\
let _onScanStatusChanged: ((s: string) => void) | null = null;\
\
export function setOnScanStatusChanged(cb: ((s: string) => void) | null) {\
  _onScanStatusChanged = cb;\
}\
\
\/\/ Scan FAB visibility key + hook\
const SCAN_FAB_VISIBLE_KEY = '\''@cinescan:scan_fab_visible'\'';\
let _onScanFabVisibilityChanged: ((v: boolean) => void) | null = null;\
let lastSavedVisibility: boolean | null = null;\
\
export function setOnScanFabVisibilityChanged(cb: ((v: boolean) => void) | null) {\
  _onScanFabVisibilityChanged = cb;\
}\
\
\/\/ ── Last scan summary persistence ───────────────────────────────────────────\
const LAST_SCAN_KEY = '\''@cinescan:last_scan_result'\'';\
\
export type LastScanResult = {\
  timestamp: string;\
  progress?: {\
    total?: number;\
    processed?: number;\
    scanned?: number;\
    matched?: number;\
    added?: number;\
    skipped?: number;\
    phase?: string;\
  };\
  matched?: Array<{ id?: string; title?: string; posterUrl?: string; filename?: string }>;\
  unmatched?: Array<{ uri?: string; filename?: string }>;\
};\
\
export async function saveLastScanResult(result: LastScanResult | null): Promise<void> {\
  try {\
    if (result === null) {\
      await AsyncStorage.removeItem(LAST_SCAN_KEY);\
      return;\
    }\
    await AsyncStorage.setItem(LAST_SCAN_KEY, JSON.stringify(result));\
  } catch (err) {\
    console.error('\''[Storage] saveLastScanResult failed:'\'', err);\
  }\
}\
\
export async function getLastScanResult(): Promise<LastScanResult | null> {\
  try {\
    const raw = await AsyncStorage.getItem(LAST_SCAN_KEY);\
    if (!raw) return null;\
    return JSON.parse(raw) as LastScanResult;\
  } catch (err) {\
    return null;\
  }\
}\
\
export async function clearLastScanResult(): Promise<void> {\
  try {\
    await AsyncStorage.removeItem(LAST_SCAN_KEY);\
  } catch (err) {\
  }\
}\
' src/storage/asyncStorage.ts
