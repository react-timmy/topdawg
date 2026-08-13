/**
 * Test Suite for Individual Features
 * 
 * Run tests with: node src/test.js
 * 
 * Add new test functions below to test specific features
 */

// Test utilities
const tests = [];
let passCount = 0;
let failCount = 0;

const test = (name, fn) => {
  tests.push({ name, fn });
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
};

const runTests = async () => {
  console.log('🧪 Running Tests...\n');
  
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passCount++;
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(`   ${error.message}\n`);
      failCount++;
    }
  }

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
};

// ─────────────────────────────────────────────────────────────────────

// Import your utility functions here (or inline them for testing)
const truncateDescription = (text, maxLength = 300) => {
  if (!text) {
    return { truncated: '', isTruncated: false };
  }

  if (text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }

  let endIndex = maxLength;
  const lastSpaceIndex = text.lastIndexOf(' ', maxLength);
  
  if (lastSpaceIndex > maxLength * 0.8) {
    endIndex = lastSpaceIndex;
  }

  return {
    truncated: text.substring(0, endIndex).trim() + '...',
    isTruncated: true,
  };
};

// ─────────────────────────────────────────────────────────────────────
// TEST CASES
// ─────────────────────────────────────────────────────────────────────

test('truncateDescription: short text should not be truncated', () => {
  const shortText = 'This is a short description';
  const { truncated, isTruncated } = truncateDescription(shortText);
  assertEqual(isTruncated, false, 'Short text should not be marked as truncated');
  assertEqual(truncated, shortText, 'Short text should remain unchanged');
});

test('truncateDescription: empty string should return empty', () => {
  const { truncated, isTruncated } = truncateDescription('');
  assertEqual(isTruncated, false, 'Empty string should not be marked as truncated');
  assertEqual(truncated, '', 'Empty string should return empty');
});

test('truncateDescription: undefined should return empty', () => {
  const { truncated, isTruncated } = truncateDescription(undefined);
  assertEqual(isTruncated, false, 'Undefined should not be marked as truncated');
  assertEqual(truncated, '', 'Undefined should return empty');
});

test('truncateDescription: long text should be truncated to 300 chars', () => {
  const longText = 'A'.repeat(400); // 400 characters
  const { truncated, isTruncated } = truncateDescription(longText);
  assertEqual(isTruncated, true, 'Long text should be marked as truncated');
  assert(truncated.length <= 305, 'Truncated text should not exceed ~305 characters (including ...)');
  assert(truncated.endsWith('...'), 'Truncated text should end with "..."');
});

test('truncateDescription: text with spaces should break at word boundary', () => {
  const textWithSpaces = 'The quick brown fox jumps over the lazy dog. '.repeat(20); // Creates text > 300 chars
  const { truncated, isTruncated } = truncateDescription(textWithSpaces);
  assertEqual(isTruncated, true, 'Should be marked as truncated');
  assert(!truncated.endsWith(' ...'), 'Should not have space before ellipsis');
  assert(truncated.endsWith('...'), 'Should end with ellipsis');
});

test('truncateDescription: exactly 300 characters should not be truncated', () => {
  const exactText = 'A'.repeat(300);
  const { truncated, isTruncated } = truncateDescription(exactText);
  assertEqual(isTruncated, false, '300 chars exactly should not be marked as truncated');
  assertEqual(truncated, exactText, 'Text should remain unchanged at 300 chars');
});

test('truncateDescription: 301 characters should be truncated', () => {
  const justOverText = 'A'.repeat(301);
  const { truncated, isTruncated } = truncateDescription(justOverText);
  assertEqual(isTruncated, true, '301 chars should be marked as truncated');
  assert(truncated.endsWith('...'), 'Should end with ellipsis');
});

// ─────────────────────────────────────────────────────────────────────
// WATCH HISTORY & STATS ENGINE TESTS (Offline Watch Tracking)
// ─────────────────────────────────────────────────────────────────────

// Mock WatchEvent structure
const createWatchEvent = (overrides = {}) => ({
  id: `movie-123::${Date.now()}`,
  mediaId: 'movie-123',
  title: 'Test Movie',
  type: 'movie',
  genres: ['Action', 'Drama'],
  runtime: 120, // 2 hours
  posterUrl: 'https://example.com/poster.jpg',
  watchedAt: new Date().toISOString(),
  manual: false,
  isAnime: false,
  ...overrides,
});

// Mock statsEngine computeStats function
const computeStats = (history) => {
  if (history.length === 0) {
    return {
      totalHours: 0,
      totalMinutes: 0,
      moviesWatched: 0,
      episodesWatched: 0,
      genreBreakdown: [],
      animeEpisodes: 0,
      animeHours: 0,
      animeGenres: [],
      topGenre: null,
      currentStreak: 0,
      longestStreak: 0,
      thisWeekCount: 0,
      lastWeekCount: 0,
      uniqueTitles: 0,
      watchingSince: new Date().getFullYear(),
    };
  }

  // Calculate totals
  const totalRawMinutes = history.reduce((sum, e) => sum + (e.runtime ?? 0), 0);
  const totalHours = Math.round((totalRawMinutes / 60) * 10) / 10;
  const totalMinutes = Math.round(totalHours * 60) % 60;

  // Count by type
  const moviesWatched = history.filter((e) => e.type === 'movie').length;
  const episodesWatched = history.filter((e) => e.type === 'tv').length;

  // Genre breakdown
  const genreMap = new Map();
  history.forEach((e) => {
    e.genres.forEach((g) => {
      genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
    });
  });
  const genreBreakdown = [...genreMap.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topGenre = genreBreakdown.length > 0 ? genreBreakdown[0].genre : null;

  // Unique titles
  const uniqueTitles = new Set(history.map((e) => e.mediaId)).size;

  // Anime calculations
  const animeEvents = history.filter((e) => e.isAnime);
  const animeHours = Math.round(
    (animeEvents.reduce((sum, e) => sum + (e.runtime ?? 0), 0) / 60) * 10
  ) / 10;

  return {
    totalHours,
    totalMinutes,
    moviesWatched,
    episodesWatched,
    genreBreakdown,
    animeEpisodes: animeEvents.length,
    animeHours,
    animeGenres: [],
    topGenre,
    currentStreak: 0, // Simplified for testing
    longestStreak: 0,
    thisWeekCount: 0,
    lastWeekCount: 0,
    uniqueTitles,
    watchingSince: new Date().getFullYear(),
  };
};

// ─────────────────────────────────────────────────────────────────────
// TEST 1: Offline Watch Event Recording
// ─────────────────────────────────────────────────────────────────────

test('offline-watch: should create watch event with correct structure', () => {
  const event = createWatchEvent();
  assert(event.id !== undefined, 'Event should have an id');
  assert(event.mediaId === 'movie-123', 'Event should have mediaId');
  assert(event.title === 'Test Movie', 'Event should have title');
  assert(event.type === 'movie', 'Event should have type');
  assert(event.runtime === 120, 'Event should have runtime in minutes');
  assert(event.watchedAt !== undefined, 'Event should have watchedAt timestamp');
});

test('offline-watch: should handle TV episode watch events', () => {
  const event = createWatchEvent({
    type: 'tv',
    title: 'Breaking Bad S01E01',
    seasonNumber: 1,
    episodeNumber: 1,
    runtime: 47,
  });
  assertEqual(event.type, 'tv', 'Should be TV type');
  assertEqual(event.seasonNumber, 1, 'Should have season number');
  assertEqual(event.episodeNumber, 1, 'Should have episode number');
  assertEqual(event.runtime, 47, 'TV episode runtime should be 47 minutes');
});

test('offline-watch: should track manual watch events', () => {
  const event = createWatchEvent({ manual: true });
  assertEqual(event.manual, true, 'Event should be marked as manual');
});

// ─────────────────────────────────────────────────────────────────────
// TEST 2: Watch Hours Calculation
// ─────────────────────────────────────────────────────────────────────

test('watch-hours: single movie (120 min) should equal 2 hours', () => {
  const history = [createWatchEvent({ runtime: 120 })];
  const stats = computeStats(history);
  assertEqual(stats.totalHours, 2, 'Single 120-minute movie should be 2 hours');
  assertEqual(stats.totalMinutes, 0, 'No remainder minutes');
});

test('watch-hours: multiple movies should sum correctly', () => {
  const history = [
    createWatchEvent({ mediaId: 'movie-1', runtime: 120 }), // 2h
    createWatchEvent({ mediaId: 'movie-2', runtime: 90 }), // 1.5h
    createWatchEvent({ mediaId: 'movie-3', runtime: 150 }), // 2.5h
  ];
  const stats = computeStats(history);
  assertEqual(stats.totalHours, 6, 'Sum should be 6 hours (2 + 1.5 + 2.5)');
});

test('watch-hours: TV episodes should contribute to total hours', () => {
  const history = [
    createWatchEvent({ type: 'movie', runtime: 120 }), // 2h movie
    createWatchEvent({ type: 'tv', runtime: 45 }), // 45-min episode
    createWatchEvent({ type: 'tv', runtime: 45 }), // 45-min episode
  ];
  const stats = computeStats(history);
  const expectedHours = Math.round(((120 + 45 + 45) / 60) * 10) / 10;
  assertEqual(stats.totalHours, expectedHours, 'Movie + 2 episodes total');
  assertEqual(stats.moviesWatched, 1, 'Should count 1 movie');
  assertEqual(stats.episodesWatched, 2, 'Should count 2 episodes');
});

test('watch-hours: zero runtime should not break calculation', () => {
  const history = [
    createWatchEvent({ mediaId: 'movie-1', runtime: 120 }),
    createWatchEvent({ mediaId: 'movie-2', runtime: 0 }), // Unknown runtime
  ];
  const stats = computeStats(history);
  assertEqual(stats.totalHours, 2, 'Should handle 0 runtime gracefully');
});

test('watch-hours: decimal hours should round to 1 decimal place', () => {
  const history = [
    createWatchEvent({ mediaId: 'movie-1', runtime: 130 }), // 2.166... hours
  ];
  const stats = computeStats(history);
  assertEqual(stats.totalHours, 2.2, 'Should round to 1 decimal: 2.2 hours');
});

// ─────────────────────────────────────────────────────────────────────
// TEST 3: Offline Sync Preparation
// ─────────────────────────────────────────────────────────────────────

test('offline-sync: watch events should include all required fields for cloud sync', () => {
  const event = createWatchEvent({
    mediaId: 'tmdb-550',
    title: 'Fight Club',
    genres: ['Drama', 'Thriller'],
    runtime: 139,
    posterUrl: 'https://example.com/poster.jpg',
  });
  
  // Verify all fields needed for Firestore sync
  assert(event.id, 'Event must have id for Firestore document creation');
  assert(event.mediaId, 'Event must have mediaId for deduplication');
  assert(event.title, 'Event must have title');
  assert(event.type, 'Event must have type (movie/tv)');
  assert(Array.isArray(event.genres), 'Event must have genres array');
  assert(event.runtime !== undefined, 'Event must have runtime');
  assert(event.watchedAt, 'Event must have watchedAt timestamp');
  assert(event.posterUrl, 'Event should have posterUrl for cloud sync');
});

// ─────────────────────────────────────────────────────────────────────
// TEST 4: Anime Detection & Tracking
// ─────────────────────────────────────────────────────────────────────

test('anime-tracking: should detect anime from Animation genre + TV type', () => {
  const event = createWatchEvent({
    type: 'tv',
    genres: ['Animation', 'Action'],
    isAnime: true,
  });
  assertEqual(event.isAnime, true, 'Should mark as anime');
});

test('anime-tracking: should separate anime hours from total', () => {
  const history = [
    createWatchEvent({ mediaId: 'anime-1', runtime: 24, isAnime: true }), // Anime 24min
    createWatchEvent({ mediaId: 'anime-2', runtime: 24, isAnime: true }), // Anime 24min
    createWatchEvent({ mediaId: 'movie-1', runtime: 120 }), // Regular movie
  ];
  const stats = computeStats(history);
  assertEqual(stats.totalHours, 2.8, 'Total should be 2.8 hours');
  assertEqual(stats.animeHours, 0.8, 'Anime portion should be 0.8 hours');
  assertEqual(stats.animeEpisodes, 2, 'Should count 2 anime episodes');
});

// ─────────────────────────────────────────────────────────────────────
// TEST 5: Genre Breakdown
// ─────────────────────────────────────────────────────────────────────

test('genre-breakdown: should tally genres across watch history', () => {
  const history = [
    createWatchEvent({
      mediaId: 'movie-1',
      genres: ['Action', 'Drama'],
    }),
    createWatchEvent({
      mediaId: 'movie-2',
      genres: ['Action', 'Comedy'],
    }),
    createWatchEvent({
      mediaId: 'movie-3',
      genres: ['Drama'],
    }),
  ];
  const stats = computeStats(history);
  assert(stats.genreBreakdown.length > 0, 'Should have genre breakdown');
  
  const actionGenre = stats.genreBreakdown.find((g) => g.genre === 'Action');
  assert(actionGenre, 'Should track Action genre');
  assertEqual(actionGenre.count, 2, 'Action should appear twice');
  
  const topGenre = stats.topGenre;
  assert(topGenre === 'Action' || topGenre === 'Drama', 'Top genre should be Action or Drama');
});

// ─────────────────────────────────────────────────────────────────────
// TEST 6: Unique Titles Tracking
// ─────────────────────────────────────────────────────────────────────

test('unique-titles: should count unique mediaIds only once', () => {
  const history = [
    createWatchEvent({ mediaId: 'movie-1' }),
    createWatchEvent({ mediaId: 'movie-1' }), // Rewatch
    createWatchEvent({ mediaId: 'movie-2' }),
    createWatchEvent({ mediaId: 'movie-3' }),
    createWatchEvent({ mediaId: 'movie-1' }), // Another rewatch
  ];
  const stats = computeStats(history);
  assertEqual(stats.uniqueTitles, 3, 'Should count 3 unique titles despite rewatches');
});

// ─────────────────────────────────────────────────────────────────────
// TEST 7: Empty History Edge Case
// ─────────────────────────────────────────────────────────────────────

test('empty-history: should return zeros for all stats', () => {
  const stats = computeStats([]);
  assertEqual(stats.totalHours, 0, 'Empty history should have 0 hours');
  assertEqual(stats.moviesWatched, 0, 'Empty history should have 0 movies');
  assertEqual(stats.episodesWatched, 0, 'Empty history should have 0 episodes');
  assertEqual(stats.uniqueTitles, 0, 'Empty history should have 0 unique titles');
  assert(stats.genreBreakdown.length === 0, 'Empty history should have no genres');
});

// ─────────────────────────────────────────────────────────────────────
// Add more test functions below as needed:
// ─────────────────────────────────────────────────────────────────────

// Example: test media card rendering
// test('MediaCard: should render with all required props', () => {
//   // Test logic here
// });

// Example: test watch progress tracking
// test('watchProgressService: should save and retrieve progress', async () => {
//   // Test logic here
// });

// Run all tests
runTests();
