/**
 * Deterministic local filename parser — used when Gemini AI fails or is off,
 * and as a fast pre-pass so high-confidence names never wait on the network.
 *
 *   AnimePahe_Dandadan_Eng_Dub_-_08_BD_360p_CRUCiBLE.mp4
 *   → { title: "Dandadan", type: "tv", season: 1, episode: 8, isAnime: true }
 *
 *   The.Matrix.1999.1080p.BluRay.x264-[YTS.MX].mkv
 *   → { title: "The Matrix", type: "movie", year: 1999, isAnime: false }
 */

import { resolveIsAnime } from './mediaHints';
import {
  ANIME_SOURCES,
  MOVIE_SOURCES,
  JUNK_TOKENS,
  alt,
} from './releaseSources';

export interface LocalParseResult {
  title: string;
  type: 'movie' | 'tv';
  year: number | null;
  season: number | null;
  episode: number | null;
  isAnime: boolean;
  confidence: number;
}

const EXT_RE = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg|rmvb|3gp)$/i;

const ALL_PREFIX_SOURCES = [...ANIME_SOURCES, ...MOVIE_SOURCES];

/** Leading site/group prefix: AnimePahe_ / www.YTS.MX. / [RARBG] already stripped separately */
const PREFIX_RE = new RegExp(
  `^(?:www\\.)?(?:${alt(ALL_PREFIX_SOURCES)})(?:\\.com|\\.mx|\\.am|\\.lt|\\.to|\\.org)?[\\s._-]*`,
  'i',
);

const JUNK_TOKEN_RE = new RegExp(
  `^(?:${alt(JUNK_TOKENS)}|${alt(ALL_PREFIX_SOURCES)}|[0-9]{3,4}p|[0-9]{3,4}x[0-9]{3,4}|[A-F0-9]{8}|v\\d+)$`,
  'i',
);

const RELEASE_GROUP_TAIL_RE = new RegExp(
  `[\\s._-]+(?:${alt(ALL_PREFIX_SOURCES)})(?:[\\s._-].*)?$`,
  'i',
);

const WWW_DOMAIN_RE =
  /\bwww\.[a-z0-9][-a-z0-9.]*\.(?:com|net|org|mx|am|lt|to|me|tv|info|xyz)\b/gi;

/**
 * Parse a single video filename without network / AI.
 * Returns null only if we cannot extract any usable title.
 */
export function parseLocalFilename(filename: string): LocalParseResult | null {
  if (!filename?.trim()) return null;

  const isAnimeHint = resolveIsAnime(filename, false);
  let name = filename.trim().replace(/\\/g, '/').split('/').pop() ?? filename;
  name = name.replace(EXT_RE, '');

  // Bracket tags: [SubsPlease] [YTS.MX] [NaijaPrey.com] [ABCD1234]
  name = name.replace(/^\[[^\]]+\]\s*/g, '');
  name = name.replace(/\s*\[[A-Fa-f0-9]{8}\]\s*$/g, '');
  name = name.replace(/\s*\[[^\]]+\]/g, ' ');
  name = name.replace(/\s*\([^)]*?(?:1080|720|480|360|2160|p|x264|x265|HEVC)[^)]*\)/gi, ' ');
  name = name.replace(WWW_DOMAIN_RE, ' ');

  let work = name.replace(/[._+]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip one or more leading source prefixes
  for (let i = 0; i < 3; i++) {
    const next = work.replace(PREFIX_RE, '').trim();
    if (next === work) break;
    work = next;
  }

  let season: number | null = null;
  let episode: number | null = null;
  let year: number | null = null;
  let type: 'movie' | 'tv' = 'movie';
  let title = work;
  let confidence = 0.55;

  // S01E02 / S1EP3 / 1x02
  const se =
    work.match(/^(.*?)\s*[sS](\d{1,2})\s*[eE][pP]?(\d{1,3})\b(.*)$/) ||
    work.match(/^(.*?)\s*(\d{1,2})\s*[xX]\s*(\d{1,3})\b(.*)$/);
  if (se) {
    title = se[1].trim();
    season = parseInt(se[2], 10);
    episode = parseInt(se[3], 10);
    type = 'tv';
    confidence = 0.9;
  } else {
    // Anime: "Title Eng Dub - 08 BD 360p GROUP"
    const animeEp = work.match(
      /^(.*?)(?:\s+(?:Eng(?:lish)?\s*Dub|Dual\s*Audio|Multi\s*Audio))?\s*[-–—]\s*(\d{1,3})(?:\s*v\d+)?(?:\s+.*)?$/i,
    );
    if (animeEp && animeEp[1].trim().length >= 1) {
      title = animeEp[1].trim();
      episode = parseInt(animeEp[2], 10);
      season = 1;
      type = 'tv';
      confidence = isAnimeHint ? 0.9 : 0.8;
    } else {
      const dashEp = work.match(/^(.*?)\s+-\s+(\d{1,3})\b/);
      if (dashEp && dashEp[1].trim().length >= 2) {
        title = dashEp[1].trim();
        episode = parseInt(dashEp[2], 10);
        season = 1;
        type = 'tv';
        confidence = 0.75;
      }
    }
  }

  // Year
  const yearMatch = title.match(/\b((?:19\d{2}|20[0-3]\d))\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 1888 && y <= 2035) {
      year = y;
      title = title.replace(new RegExp(`\\b${y}\\b`), ' ').replace(/\s+/g, ' ').trim();
      if (type === 'movie') confidence = Math.max(confidence, 0.85);
    }
  }

  title = title
    .replace(/\b(?:Eng(?:lish)?\s*Dub|English\s*Dubbed|Dual\s*Audio|Multi\s*Audio|Dubbed|Subbed)\b/gi, ' ')
    .replace(RELEASE_GROUP_TAIL_RE, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = title.split(/[\s._-]+/).filter(Boolean);
  const kept = tokens.filter((t) => !JUNK_TOKEN_RE.test(t));
  title = kept.join(' ').replace(/\s+/g, ' ').trim();

  title = title
    .replace(/^[\s._\-–—]+|[\s._\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title || title.length < 1) return null;

  title = title.replace(/\s+\d{1,3}$/u, '').trim() || title;

  if (episode != null) type = 'tv';
  if (type === 'tv' && season == null) season = 1;

  // Boost confidence when we recognised a known source in the original name
  if (isAnimeHint && episode != null) confidence = Math.max(confidence, 0.9);
  if (PREFIX_RE.test(filename.replace(EXT_RE, ''))) {
    confidence = Math.max(confidence, 0.8);
  }

  return {
    title,
    type,
    year,
    season,
    episode,
    isAnime:
      isAnimeHint ||
      (type === 'tv' && episode != null && resolveIsAnime(filename, true)),
    confidence,
  };
}
