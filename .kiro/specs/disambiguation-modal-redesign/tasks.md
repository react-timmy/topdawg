# Tasks: "Which one is it?" Disambiguation Modal Redesign

## Task List

- [x] 1. Add `posterUrl` to `DisambiguationOption` type and pass it through in `askUser`
  - In `src/components/Scanner.tsx`, find the `DisambiguationOption` type definition (inline inside the `Scanner` component): `type DisambiguationOption = { title: string; year: string; id: string };`
  - Add `posterUrl?: string` to that type
  - Find the two `setDisambiguation` calls inside `askUser` (inside `resolveMetadata`) and add `posterUrl: r.posterUrl` to each `options` mapping
  - **File:** `src/components/Scanner.tsx`

- [x] 2. Replace the disambiguation modal JSX with the new bottom-sheet poster-card design
  - Depends on: 1
  - Replace the entire `{disambiguation && ( <Modal ...> ... </Modal> )}` block inside the `Scanner` return statement with the new design
  - Import `FileVideo2` from `lucide-react-native` alongside the existing imports (already has `Film` which is also needed)
  - Import `FlatList` from `react-native` (check if already imported — it is not currently in Scanner.tsx)
  - Import `useSafeAreaInsets` from `react-native-safe-area-context`
  - New Modal structure:
    - `animationType="slide"`, `transparent`, `visible={disambiguation !== null}`, `statusBarTranslucent`
    - `onRequestClose={() => { if (disambiguation) { const r = disambiguation.resolve; setDisambiguation(null); r(null); } }}`
    - Overlay: `flex:1`, `backgroundColor: rgba(0,0,0,0.92)`, `justifyContent: flex-end`
    - Sheet: `backgroundColor: #111113`, `borderTopLeftRadius: 28`, `borderTopRightRadius: 28`, `borderTopWidth: 1`, `borderColor: rgba(255,255,255,0.1)`, padding uses `useSafeAreaInsets().bottom`
    - Drag handle: centered View `width:36 height:4 borderRadius:2 backgroundColor:rgba(255,255,255,0.18)` with `marginBottom:16`
    - Header row: icon wrap (38×38, `borderRadius:11`, amber tint) with `HelpCircle` icon + two-line text ("Which one is it?" bold + "Tap the right version below" muted)
    - Filename chip: row with `FileVideo2` icon + filename text (`numberOfLines:1`, `ellipsizeMode:"middle"`, monospace)
    - Horizontal `FlatList` of poster cards — each card is a `Pressable` with poster `Image` (120×160) or placeholder, title text, and year pill badge
    - Press state: scale to 0.97 using `Animated.Value` or the existing `Pressable` style function with opacity
    - Skip button: ghost button at bottom
  - **File:** `src/components/Scanner.tsx`

- [x] 3. Replace the old disambiguation modal styles with the new bottom-sheet styles
  - Depends on: 2
  - Remove the old modal styles: `modalOverlay`, `modalContent`, `modalHeader`, `modalIconWrap`, `modalTitle`, `modalFilenameChip`, `modalFilenameText`, `modalQuestion`, `modalTitleHighlight`, `modalOptionsScroll`, `modalOptionsContainer`, `modalOptionBtn`, `modalOptionBtnPressed`, `modalOptionInner`, `modalOptionTitle`, `modalOptionYearBadge`, `modalOptionYearText`, `modalSkipBtn`, `modalSkipText`
  - Add new styles:
    - `disambigOverlay`: `{ flex:1, backgroundColor:'rgba(0,0,0,0.92)', justifyContent:'flex-end' }`
    - `disambigSheet`: `{ backgroundColor:'#111113', borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1, borderColor:'rgba(255,255,255,0.1)', paddingTop:12, paddingHorizontal:20 }`
    - `disambigHandle`: `{ width:36, height:4, borderRadius:2, backgroundColor:'rgba(255,255,255,0.18)', alignSelf:'center', marginBottom:16 }`
    - `disambigHeader`: `{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:16 }`
    - `disambigIconWrap`: `{ width:38, height:38, borderRadius:11, backgroundColor:'rgba(251,191,36,0.12)', borderWidth:1, borderColor:'rgba(251,191,36,0.3)', alignItems:'center', justifyContent:'center' }`
    - `disambigTitleBlock`: `{ flex:1, gap:2 }`
    - `disambigTitle`: `{ color:'#ffffff', fontSize:20, fontWeight:'900' }`
    - `disambigSubtitle`: `{ color:'#71717a', fontSize:13 }`
    - `disambigFileChip`: `{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'rgba(255,255,255,0.04)', borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,0.08)', paddingHorizontal:12, paddingVertical:9, marginBottom:16 }`
    - `disambigFileText`: `{ flex:1, color:'#71717a', fontSize:12, fontFamily:'monospace' }`
    - `disambigCardsList`: `{ marginHorizontal:-20 }`  (negative margin to extend past sheet padding)
    - `disambigCardsContent`: `{ paddingHorizontal:20, gap:12, paddingBottom:4 }`
    - `disambigCard`: `{ width:120, borderRadius:16, borderWidth:1, borderColor:'rgba(255,255,255,0.08)', backgroundColor:'rgba(255,255,255,0.04)', overflow:'hidden' }`
    - `disambigCardPressed`: `{ borderColor:'rgba(96,165,250,0.6)', backgroundColor:'rgba(96,165,250,0.08)' }`
    - `disambigPoster`: `{ width:120, height:160 }`
    - `disambigPosterPlaceholder`: `{ width:120, height:160, backgroundColor:'#1c1c1e', alignItems:'center', justifyContent:'center' }`
    - `disambigCardInfo`: `{ padding:10, gap:6 }`
    - `disambigCardTitle`: `{ color:'#ffffff', fontSize:13, fontWeight:'800', lineHeight:17 }`
    - `disambigYearBadge`: `{ alignSelf:'flex-start', backgroundColor:'rgba(96,165,250,0.15)', borderRadius:20, paddingHorizontal:8, paddingVertical:3 }`
    - `disambigYearText`: `{ color:'#60a5fa', fontSize:12, fontWeight:'800' }`
    - `disambigSkipBtn`: `{ marginTop:12, height:44, borderRadius:14, borderWidth:1, borderColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center' }`
    - `disambigSkipText`: `{ color:'#52525b', fontSize:13, fontWeight:'600' }`
  - **File:** `src/components/Scanner.tsx`
