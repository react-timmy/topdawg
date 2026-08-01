# Design: "Which one is it?" Disambiguation Modal Redesign

## Overview

The disambiguation modal appears during scanning when a filename resolves to multiple titles with different release years. The current design is functional but generic — it reads like a list picker. The redesign elevates it to feel like a dedicated, polished cinematic decision screen that fits the app's dark, premium aesthetic.

## Reference: Current Implementation

**File:** `src/components/Scanner.tsx`  
**Trigger:** `setDisambiguation(...)` is called inside `resolveMetadata()` during `runScan()`  
**Data shape:**
```ts
type DisambiguationOption = { title: string; year: string; id: string; posterUrl?: string };
type DisambiguationData = {
  filename: string;
  title: string;
  options: DisambiguationOption[];
  resolve: (id: string | null) => void;
};
```

---

## Design Goals

1. **Cinematic card-based picker** — each option is a poster card, not a flat list row
2. **Glanceable** — title + year visible at a glance without reading carefully
3. **Scannable filename context** — user always knows which file triggered the question
4. **Quick escape** — skip action is clearly secondary, not buried
5. **Consistent dark palette** — matches the rest of the app (`#18181b` surfaces, `#60a5fa` accents)

---

## Layout Structure

```
┌─────────────────────────────────────────┐
│  ░░░░░░░░░░░░░ overlay (0,0,0,0.92) ░░░│
│                                         │
│                  ────                   │  ← drag handle
│                                         │
│  [?]  Which one is it?                  │  ← header
│       Tap the right version below       │
│                                         │
│  📄 filename.mkv                        │  ← filename chip
│                                         │
│  ┌──────────┐  ┌──────────┐            │  ← horizontal poster cards
│  │          │  │          │            │
│  │  poster  │  │  poster  │  ···       │
│  │          │  │          │            │
│  │  Title   │  │  Title   │            │
│  │  [2019]  │  │  [2003]  │            │
│  └──────────┘  └──────────┘            │
│                                         │
│  [ Not sure — let AI decide ]           │  ← ghost skip button
└─────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Overlay
- `flex: 1`, `backgroundColor: rgba(0,0,0,0.92)`
- `justifyContent: flex-end` — sheet slides up from bottom (more thumb-friendly than center)
- Modal `animationType: "slide"` for a natural bottom-sheet feel

### 2. Sheet container
- `backgroundColor: #111113`
- `borderTopLeftRadius: 28`, `borderTopRightRadius: 28`
- `borderTopWidth: 1`, `borderColor: rgba(255,255,255,0.1)`
- `paddingTop: 12` (drag handle space), `paddingHorizontal: 20`, `paddingBottom: safeAreaInsets.bottom + 20`

### 3. Drag handle
- Centered `View`, `width: 36`, `height: 4`, `borderRadius: 2`, `backgroundColor: rgba(255,255,255,0.18)`
- `marginBottom: 16`

### 4. Header row
- `flexDirection: row`, `alignItems: center`, `gap: 10`, `marginBottom: 6`
- Left: icon wrap `38×38`, `borderRadius: 11`, `background: rgba(251,191,36,0.12)`, `border: rgba(251,191,36,0.3)`
  - Icon: `HelpCircle` 22px `#fbbf24`
- Right: two-line copy
  - Title: `"Which one is it?"` — `fontSize: 20`, `fontWeight: 900`, `color: #ffffff`
  - Subtitle: `"Tap the right version below"` — `fontSize: 13`, `color: #71717a`

### 5. Filename chip
- Full width, `backgroundColor: rgba(255,255,255,0.04)`, `borderRadius: 10`, `border: rgba(255,255,255,0.08)`
- `paddingHorizontal: 12`, `paddingVertical: 9`
- Left: `FileVideo2` icon 14px `#52525b`
- Text: filename, `fontSize: 12`, monospace, `color: #71717a`, `numberOfLines: 1`, `ellipsizeMode: "middle"`
- `marginBottom: 16`

### 6. Poster card row (FlatList, horizontal)
- `horizontal: true`, `showsHorizontalScrollIndicator: false`
- `contentContainerStyle: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 }`
- Card width: `120`, natural height
- Each card:
  - `backgroundColor: rgba(255,255,255,0.04)`, `borderRadius: 16`, `border: rgba(255,255,255,0.08)`, `overflow: hidden`
  - Pressed state: `border: rgba(96,165,250,0.6)`, `backgroundColor: rgba(96,165,250,0.08)`, scale `0.97`
  - **Poster image**: `width: 120`, `height: 160`, `resizeMode: cover`
    - Placeholder (no posterUrl): `#1c1c1e` bg + `Film` icon centered
  - **Bottom info strip**: `padding: 10`
    - Title: `fontSize: 13`, `fontWeight: 800`, `color: #ffffff`, `numberOfLines: 2`
    - Year badge: pill `backgroundColor: rgba(96,165,250,0.15)`, `borderRadius: 20`, `paddingHorizontal: 8`, `paddingVertical: 3`
      - Text: `fontSize: 12`, `fontWeight: 800`, `color: #60a5fa`

### 7. Skip button
- `marginTop: 12`, full width, `height: 44`, `borderRadius: 14`
- `backgroundColor: transparent`, `borderWidth: 1`, `borderColor: rgba(255,255,255,0.08)`
- Text: `"Not sure — let AI decide"`, `fontSize: 13`, `fontWeight: 600`, `color: #52525b`
- No icon — intentionally de-emphasized

---

## Data Change Required

`DisambiguationOption` needs a `posterUrl?: string` field. The `askUser` mapping in `resolveMetadata` must pass `r.posterUrl`:

```ts
options: results.slice(0, 5).map((r) => ({
  title: r.title,
  year: r.releaseDate ? r.releaseDate.split('-')[0] : 'Unknown',
  id: r.id,
  posterUrl: r.posterUrl,   // ← add this
})),
```

No extra API calls — posterUrl is already on the search result.

---

## Animation

- Modal `animationType: "slide"` (bottom sheet)
- Card press: scale `1.0 → 0.97` on pressIn, back on pressOut
- No entering animations on cards — keeps it snappy

---

## Accessibility

- Each card: `accessibilityRole: "button"`, `accessibilityLabel: "{title}, {year}"`
- Skip: `accessibilityRole: "button"`, `accessibilityLabel: "Skip, let AI decide"`
- Modal `onRequestClose` → resolves with `null` (Android back button)

---

## Files to Change

| File | Change |
|---|---|
| `src/components/Scanner.tsx` | Redesign modal JSX + styles; add `posterUrl` to `DisambiguationOption`; pass posterUrl in `askUser` mapping |

No new files, no new dependencies.
