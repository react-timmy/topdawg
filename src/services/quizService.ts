/**
 * quizService.ts
 *
 * Generates verification quiz questions from TMDB metadata to confirm
 * a user has actually watched a movie or TV show before adding it to a collection.
 *
 * Question types:
 *  - Genre identification (multiple choice from TMDB genres)
 *  - Release year (with ±2 year tolerance)
 *  - Number of seasons (for TV shows)
 *  - Runtime range (for movies)
 *
 * Strategy: Use existing TMDB data to avoid external AI API calls.
 */

import { MediaItem, QuizQuestion } from '../types';
import { tmdbService } from './tmdbService';

// ─── Genre mapping ────────────────────────────────────────────────────────────

const GENRE_MAP: Record<number, string> = {
  // Movies
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  // TV
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

// ─── Question generators ──────────────────────────────────────────────────────

/**
 * Generate a genre question with 4 multiple choice options.
 * Uses the actual genres from TMDB as the correct answer.
 */
function genreQuestion(item: MediaItem): QuizQuestion | null {
  if (!item.genre_ids || item.genre_ids.length === 0) return null;

  const correctGenreId = item.genre_ids[0];
  const correctGenre = GENRE_MAP[correctGenreId];
  if (!correctGenre) return null;

  // Generate 3 plausible wrong answers
  const allGenres = Object.entries(GENRE_MAP)
    .filter(([id]) => !item.genre_ids?.includes(parseInt(id, 10)))
    .map(([_, name]) => name);

  const shuffled = allGenres.sort(() => Math.random() - 0.5);
  const wrongAnswers = shuffled.slice(0, 3);

  const options = [correctGenre, ...wrongAnswers].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(correctGenre);

  return {
    question: `What genre best describes "${item.title}"?`,
    options,
    correctIndex,
    mediaId: item.id,
    mediaTitle: item.title,
  };
}

/**
 * Generate a release year question with 4 options (±2 years from correct).
 */
function releaseYearQuestion(item: MediaItem): QuizQuestion | null {
  if (!item.releaseDate) return null;

  const correctYear = new Date(item.releaseDate).getFullYear();
  if (isNaN(correctYear)) return null;

  // Generate 3 wrong years (±1-3 years from correct)
  const offsets = [-3, -2, -1, 1, 2, 3];
  const shuffled = offsets.sort(() => Math.random() - 0.5);
  const wrongYears = shuffled.slice(0, 3).map((offset) => correctYear + offset);

  const options = [String(correctYear), ...wrongYears.map(String)].sort(
    () => Math.random() - 0.5,
  );
  const correctIndex = options.indexOf(String(correctYear));

  const mediaType = item.type === 'movie' ? 'released' : 'first aired';

  return {
    question: `When was "${item.title}" ${mediaType}?`,
    options,
    correctIndex,
    mediaId: item.id,
    mediaTitle: item.title,
  };
}

/**
 * Generate a number of seasons question for TV shows.
 */
function seasonsQuestion(item: MediaItem): QuizQuestion | null {
  if (item.type !== 'tv' || !item.numberOfSeasons) return null;

  const correctSeasons = item.numberOfSeasons;

  // Generate 3 plausible wrong answers (±1-2 seasons from correct)
  const offsets = [-2, -1, 1, 2];
  const wrongSeasons = offsets
    .map((offset) => correctSeasons + offset)
    .filter((s) => s > 0 && s !== correctSeasons)
    .slice(0, 3);

  // If we don't have enough wrong answers, add some random ones
  while (wrongSeasons.length < 3) {
    const random = Math.floor(Math.random() * 10) + 1;
    if (random !== correctSeasons && !wrongSeasons.includes(random)) {
      wrongSeasons.push(random);
    }
  }

  const options = [String(correctSeasons), ...wrongSeasons.map(String)].sort(
    () => Math.random() - 0.5,
  );
  const correctIndex = options.indexOf(String(correctSeasons));

  return {
    question: `How many seasons does "${item.title}" have?`,
    options,
    correctIndex,
    mediaId: item.id,
    mediaTitle: item.title,
  };
}

/**
 * Generate a runtime range question for movies.
 */
function runtimeQuestion(item: MediaItem): QuizQuestion | null {
  if (item.type !== 'movie' || !item.runtime || item.runtime === 0) return null;

  const correctRuntime = item.runtime;

  // Create runtime ranges (in minutes)
  const ranges = [
    { label: 'Under 90 minutes', min: 0, max: 89 },
    { label: '90-120 minutes', min: 90, max: 120 },
    { label: '2-2.5 hours', min: 121, max: 150 },
    { label: 'Over 2.5 hours', min: 151, max: 999 },
  ];

  const correctRange = ranges.find(
    (r) => correctRuntime >= r.min && correctRuntime <= r.max,
  );
  if (!correctRange) return null;

  const options = ranges.map((r) => r.label);
  const correctIndex = options.indexOf(correctRange.label);

  return {
    question: `How long is "${item.title}"?`,
    options,
    correctIndex,
    mediaId: item.id,
    mediaTitle: item.title,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const quizService = {
  /**
   * Generate a quiz question for a media item.
   * Returns null if insufficient metadata is available.
   *
   * Strategy:
   *  1. For TV shows: prefer seasons question if available
   *  2. For movies: prefer runtime question if available
   *  3. Fallback to genre question if available
   *  4. Fallback to release year question
   */
  async generateQuestion(item: MediaItem): Promise<QuizQuestion | null> {
    // Fetch full details from TMDB if we don't have enough metadata
    let enrichedItem = item;
    if (!item.genre_ids || !item.releaseDate || (!item.numberOfSeasons && item.type === 'tv')) {
      try {
        const details = await tmdbService.getDetails(item.id, item.type);
        enrichedItem = { ...item, ...details };
      } catch (err) {
        console.warn('[QuizService] Failed to fetch details for quiz:', err);
      }
    }

    // TV shows: prefer seasons question
    if (enrichedItem.type === 'tv') {
      const seasonsQ = seasonsQuestion(enrichedItem);
      if (seasonsQ) return seasonsQ;
    }

    // Movies: prefer runtime question
    if (enrichedItem.type === 'movie') {
      const runtimeQ = runtimeQuestion(enrichedItem);
      if (runtimeQ) return runtimeQ;
    }

    // Fallback to genre question
    const genreQ = genreQuestion(enrichedItem);
    if (genreQ) return genreQ;

    // Final fallback to release year
    const yearQ = releaseYearQuestion(enrichedItem);
    if (yearQ) return yearQ;

    // Not enough metadata to generate a question
    return null;
  },

  /**
   * Validate a user's answer to a quiz question.
   * Returns true if correct, false otherwise.
   */
  validateAnswer(question: QuizQuestion, selectedIndex: number): boolean {
    return selectedIndex === question.correctIndex;
  },

  /**
   * Generate multiple quiz questions for a media item (for harder verification).
   * Returns up to 3 questions of different types.
   */
  async generateMultipleQuestions(item: MediaItem): Promise<QuizQuestion[]> {
    // Fetch full details
    let enrichedItem = item;
    try {
      const details = await tmdbService.getDetails(item.id, item.type);
      enrichedItem = { ...item, ...details };
    } catch (err) {
      console.warn('[QuizService] Failed to fetch details for multi-quiz:', err);
    }

    const questions: QuizQuestion[] = [];

    // Try to generate different question types
    const generators = [
      enrichedItem.type === 'tv' ? seasonsQuestion : runtimeQuestion,
      genreQuestion,
      releaseYearQuestion,
    ];

    for (const generator of generators) {
      const q = generator(enrichedItem);
      if (q) questions.push(q);
      if (questions.length >= 3) break;
    }

    return questions;
  },
};
