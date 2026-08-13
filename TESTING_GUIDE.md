# Testing Guide for Filmsort

## Overview
This guide explains how to test individual features using the test framework set up for this project.

## Running Tests

To run the test suite:

```bash
npm run test
# or
node src/test.js
```

### Expected Output
```
🧪 Running Tests...

✅ truncateDescription: short text should not be truncated
✅ truncateDescription: empty string should return empty
✅ truncateDescription: undefined should return empty
✅ truncateDescription: long text should be truncated to 300 chars
✅ truncateDescription: text with spaces should break at word boundary
✅ truncateDescription: exactly 300 characters should not be truncated
✅ truncateDescription: 301 characters should be truncated

📊 Results: 7 passed, 0 failed
```

## Adding New Tests

The test framework is located in `src/test.js` and uses a simple assertion-based testing pattern.

### Test Structure

```javascript
test('feature name', () => {
  // Your test logic here
  assertEqual(actual, expected, 'Error message if assertion fails');
});
```

### Example: Testing a New Feature

```javascript
test('myNewFeature: should do something', () => {
  const result = myFunction('input');
  assertEqual(result, 'expected output', 'Result should match expected output');
});

test('myNewFeature: should handle edge case', () => {
  const result = myFunction(null);
  assert(result !== undefined, 'Should not return undefined for null input');
});
```

### Available Assertions

- `assert(condition, message)` - Assert a condition is true
- `assertEqual(actual, expected, message)` - Assert two values are equal

## Features Currently Tested

### 1. Description Truncation (`truncateDescription`)

The utility function that truncates descriptions to 300 characters with a "Show more" indicator.

**Location:** `src/utils/descriptionUtils.ts`

**Features:**
- Truncates text longer than 300 characters
- Breaks at word boundaries (doesn't cut words in half)
- Returns metadata indicating if text was truncated
- Handles edge cases: empty strings, undefined, null

**Used in:**
- `src/screens/DetailsScreen.tsx` - Shows descriptions with expand/collapse functionality

## Implementation Details

### Truncate Description Utility

The `truncateDescription()` function intelligently truncates long text:

```typescript
const { truncated, isTruncated } = truncateDescription(longText);

// Returns:
// {
//   truncated: "Truncated text ending at word boundary...",
//   isTruncated: true  // indicates if truncation occurred
// }
```

### Details Screen UI Enhancement

In the Details screen, descriptions now show:

1. **Truncated view** (default) - First 300 characters with "Show more" button
2. **Expanded view** - Full description with "Show less" button

The button appears only if the description exceeds 300 characters.

**Styling:**
- Blue "Show more/less" text with chevron icons
- Smooth transitions between states
- Mobile-friendly layout

## Adding More Tests

To test other features (e.g., watch progress, badge unlocking), add test cases in `src/test.js`:

```javascript
// Example: Testing watch progress service
test('watchProgressService: should save and retrieve progress', async () => {
  // Import service and test its functionality
});

// Example: Testing badge unlock logic
test('badgeEngine: should unlock correct badge', () => {
  // Test badge unlock conditions
});
```

## CI/CD Integration

To integrate tests into your CI/CD pipeline, add to your workflow:

```bash
npm run test || exit 1
```

This ensures tests pass before deployment.
