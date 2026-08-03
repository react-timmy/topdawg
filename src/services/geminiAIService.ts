/**
 * Gemini AI Service — Batch Filename Parser
 *
 * Gemini calls now route through the Cloudflare Worker proxy.
 * The API key never ships in the app bundle — it lives in Cloudflare Secrets.
 *
 * Key lanes:
 *   Free — worker uses GEMINI_API_KEY secret
 *   Pro  — worker uses GEMINI_PRO_API_KEY secret (isPro: true in request body)
 *
 * Fast path (unchanged):
 *   1. Cache hits (instant)
 *   2. High-confidence local parse — no network call at all
 *   3. Proxy batch for the rest (progress callbacks keep UI alive)
 */

import { resolveIsAnime } from '../utils/mediaHints';
import { parseLocalFilename } from '../utils/localFilenameParser';
import { sourcesForPrompt } from '../utils/releaseSources';
import { GEMINI_MODELS } from '../config/env';
import { bulkGetCached, bulkSetCached } from '../storage/aiParseCache';
import { proxyFetch, isProxyAvailable, ProxyError } from './proxyClient';

// ── Types ──────────────────────────────────────────────────────────────────────

type KeyLane = 'free' | 'pro';

export type GeminiCallOptions = {
  /** When true, the proxy uses the Pro VIP key (Skip the Line). */
  isPro?: boolean;
  /** Fired while the proxy is rate-limited and we're waiting to retry. */
  onQueue?: (lane: KeyLane) => void;
};

type GenerateContentParams = GeminiCallOptions & {
  contents: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
};

/**
 * Calls the Cloudflare Worker Gemini proxy.
 * Retries up to 3 times on 429 with exponential back-off.
 * Returns response text or null on failure.
 */
async function generateContentWithKeys(
  params: GenerateContentParams,
): Promise<string | null> {
  const isPro = params.isPro === true;
  const lane: KeyLane = isPro ? 'pro' : 'free';

  if (!isProxyAvailable()) {
    console.warn('[GeminiAI] Proxy not available — user not signed in');
    return null;
  }

  const MAX_ATTEMPTS = 4;
  const BASE_WAIT_MS = 15_000; // 15s base for 429 back-off

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await proxyFetch<{ text: string }>('gemini', {
        contents: params.contents,
        ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
        temperature: params.temperature ?? 0.1,
        maxOutputTokens: params.maxOutputTokens ?? 2048,
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        isPro,
      });

      return result.text ?? null;
    } catch (err) {
      const isRateLimit =
        err instanceof ProxyError && (err.status === 429 || err.status === 503);

      if (isRateLimit && attempt < MAX_ATTEMPTS - 1) {
        const wait = BASE_WAIT_MS * (attempt + 1);
        console.warn(
          `[GeminiAI] Proxy rate-limited (${lane}). Waiting ${Math.ceil(wait / 1000)}s… (attempt ${attempt + 1})`,
        );
        params.onQueue?.(lane);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (err instanceof ProxyError && err.status === 401) {
        console.warn('[GeminiAI] Proxy 401 — user not authenticated');
        return null;
      }

      console.error('[GeminiAI] Proxy request failed:', err);
      return null;
    }
  }

  console.error('[GeminiAI] All proxy attempts exhausted');
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedFilename {
  title: string;
  type: 'movie' | 'tv';
  year: number | null;
  season: number | null;
  episode: number | null;
  confidence: number;
  isAnime?: boolean;
}

export interface BatchParseResult {
  /** Map of original filename → parsed result */
  results: Record<string, ParsedFilename>;
  /** Filenames that failed to parse */
  failed: string[];
  /** How many filenames were actually sent to Gemini (not cache / local). */
  aiRequested?: number;
}

export type AiParseProgress = {
  stage: 'cache' | 'local' | 'sending' | 'waiting' | 'received' | 'done';
  message: string;
  total: number;
  cached?: number;
  local?: number;
  sending?: number;
  parsed?: number;
  batchIndex?: number;
  batchCount?: number;
};

export type AiParseProgressCb = (p: AiParseProgress) => void;

/** Local parses at or above this skip Gemini entirely. */
const LOCAL_CONFIDENCE_SKIP_AI = 0.8;

/**
 * One Gemini request can handle a large set. Keep a ceiling so JSON
 * responses don't truncate (malformed `}` bugs). Progress reports each batch.
 */
const BATCH_SIZE = 60;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a video filename parser. Output ONLY valid JSON, no markdown.

Output shape:
{"results":{"<exact filename>":{"title":"...","type":"movie"|"tv","year":number|null,"season":number|null,"episode":number|null,"confidence":0.0-1.0,"isAnime":true|false}}}

RULES:
1. Key = EXACT original filename, character-for-character (including extension, underscores, brackets).
2. Parse ALL filenames. Never skip any.
3. Title: strip extension, site prefixes, www.domains, dots/underscores→spaces, release groups, CRC32, quality/codec/audio tags (Eng Dub, Dual Audio, BD, 1080p, x264, BluRay…). Keep title punctuation.
4. type="tv" if: S##E##, S##EP##, ##x##, "- ##" anime episode pattern, or date-based (YYYY.MM.DD). Otherwise "movie".
5. season/episode: S##E## or S##EP## → both. "- ##" anime (no S) → season=1, episode=##. EP## alone → season=1.
6. year: 4-digit 1888-2030, prefer parens, skip if part of title.
7. confidence: 1.0=perfect, 0.9=clear, 0.7-0.8=good, 0.5-0.6=weak, 0.2-0.4=bare.
8. isAnime=true ONLY from filename signals (anime sites/groups, Eng Dub + episode, [1080p] fansub style). isAnime=false for Western tags (Netflix, NF, AMZN, YTS, RARBG, …). NEVER set isAnime from title recognition alone.
9. Never put year/season/episode/quality/codec in the title. Numbered sequels are movies (Rocky IV). Resolutions are not episodes (1080p ≠ 1080).

Known sources (strip these from titles):
${sourcesForPrompt()}

EXAMPLES:
AnimePahe_Dandadan_Eng_Dub_-_07_BD_360p_CRUCiBLE.mp4 → {"title":"Dandadan","type":"tv","season":1,"episode":7,"year":null,"confidence":0.9,"isAnime":true}
[SubsPlease] Frieren - 18 (1080p).mkv → {"title":"Frieren","type":"tv","season":1,"episode":18,"year":null,"confidence":0.95,"isAnime":true}
The.Matrix.1999.1080p.BluRay.x264-[YTS.MX].mkv → {"title":"The Matrix","type":"movie","season":null,"episode":null,"year":1999,"confidence":1.0,"isAnime":false}
Breaking.Bad.S01E01.720p.HDTV.mkv → {"title":"Breaking Bad","type":"tv","season":1,"episode":1,"year":null,"confidence":1.0,"isAnime":false}
Shutter Island (2010) [NaijaPrey.com].mkv → {"title":"Shutter Island","type":"movie","season":null,"episode":null,"year":2010,"confidence":0.95,"isAnime":false}
One Piece [netflix]-S2E3-480P.mp4 → {"title":"One Piece","type":"tv","season":2,"episode":3,"year":null,"confidence":0.95,"isAnime":false}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(name: string): string {
  const basename = name.trim().toLowerCase().replace(/\\/g, '/').split('/').pop() ?? name;
  return basename.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg|rmvb|3gp)$/i, '');
}

function parseModelJson(content: string): any {
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  const attempts: string[] = [text];
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(text.slice(firstBrace, lastBrace + 1));
  }

  let lastErr: unknown;
  for (const raw of attempts) {
    for (const candidate of [
      raw,
      raw.replace(/,\s*([}\]])/g, '$1'),
      raw.replace(/\}\s*\}(\s*)$/g, '}$1'),
      raw.replace(/\}\s*,\s*\}/g, '}}'),
    ]) {
      try {
        return JSON.parse(candidate);
      } catch (e) {
        lastErr = e;
      }
    }
  }

  const salvaged: Record<string, any> = {};
  const entryRe =
    /"([^"]+\.(?:mp4|mkv|avi|mov|wmv|webm|m4v|ts))"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(text)) !== null) {
    try {
      salvaged[m[1]] = JSON.parse(m[2].replace(/,\s*([}\]])/g, '$1'));
    } catch {
      /* skip */
    }
  }
  if (Object.keys(salvaged).length > 0) {
    console.warn(
      `[GeminiAI] Salvaged ${Object.keys(salvaged).length} entr(y/ies) from malformed JSON`,
    );
    return { results: salvaged };
  }

  const preview = text.slice(0, 280).replace(/\s+/g, ' ');
  console.error(`[GeminiAI] JSON parse failed. Preview: ${preview}…`);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function parseResponseIntoResults(
  filenames: string[],
  rawResults: Record<string, any>,
): BatchParseResult {
  const results: Record<string, ParsedFilename> = {};
  const matchedFilenames = new Set<string>();
  const originalByNorm = new Map<string, string>();
  for (const f of filenames) {
    originalByNorm.set(normalizeKey(f), f);
  }

  for (const [returnedName, item] of Object.entries(rawResults)) {
    if (!item || !item.title) continue;

    let key: string;
    if (filenames.includes(returnedName)) {
      key = returnedName;
    } else {
      const normMatch = originalByNorm.get(normalizeKey(returnedName));
      if (normMatch) {
        key = normMatch;
      } else {
        const contained = filenames.find(
          (f) =>
            f.toLowerCase().includes(returnedName.toLowerCase()) ||
            returnedName.toLowerCase().includes(normalizeKey(f)),
        );
        key = contained ?? returnedName;
      }
    }

    const aiIsAnime = typeof item.isAnime === 'boolean' ? item.isAnime : false;
    results[key] = {
      title: String(item.title),
      type: item.type === 'tv' ? 'tv' : 'movie',
      year: typeof item.year === 'number' ? item.year : null,
      season: typeof item.season === 'number' ? item.season : null,
      episode: typeof item.episode === 'number' ? item.episode : null,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
      isAnime: resolveIsAnime(key, aiIsAnime),
    };
    matchedFilenames.add(key);
  }

  return {
    results,
    failed: filenames.filter((f) => !matchedFilenames.has(f)),
  };
}

function localToParsed(local: NonNullable<ReturnType<typeof parseLocalFilename>>): ParsedFilename {
  return {
    title: local.title,
    type: local.type,
    year: local.year,
    season: local.season,
    episode: local.episode,
    confidence: local.confidence,
    isAnime: local.isAnime,
  };
}

// ─── Internal API call ────────────────────────────────────────────────────────

async function parseBatch(
  filenames: string[],
  options?: GeminiCallOptions,
): Promise<BatchParseResult> {
  try {
    const content = await generateContentWithKeys({
      isPro: options?.isPro,
      onQueue: options?.onQueue,
      contents: `Parse these filenames and use each filename EXACTLY as the key:\n${JSON.stringify(filenames)}`,
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    });

    if (!content) {
      return { results: {}, failed: [...filenames] };
    }

    const parsed = parseModelJson(content);
    const rawResults: Record<string, any> =
      parsed?.results ??
      parsed?.data ??
      (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
    return parseResponseIntoResults(filenames, rawResults);
  } catch (error) {
    console.error('[GeminiAI] Batch parse failed:', error);
    return { results: {}, failed: [...filenames] };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type BatchParseOptions = GeminiCallOptions & {
  /** When false, skip Gemini and use cache + local only (free-tier exhausted). */
  allowGemini?: boolean;
  /** Cap how many uncached low-confidence names may hit Gemini (free tier). */
  maxAiFiles?: number;
};

/**
 * Parse filenames: cache → local high-confidence → one Gemini batch for the rest.
 * Call `onProgress` so the UI never looks frozen.
 */
export async function batchParseFilenames(
  filenames: string[],
  onProgress?: AiParseProgressCb,
  options?: BatchParseOptions,
): Promise<BatchParseResult> {
  if (filenames.length === 0) {
    return { results: {}, failed: [] };
  }

  const allowGemini = options?.allowGemini !== false;
  const maxAiFiles = options?.maxAiFiles;
  const isPro = options?.isPro === true;
  const total = filenames.length;
  const report = (p: Omit<AiParseProgress, 'total'> & { total?: number }) => {
    onProgress?.({ total, ...p });
  };

  // ── 1. Cache ───────────────────────────────────────────────────────────────
  report({ stage: 'cache', message: `Checking cache for ${total} filename(s)…` });
  const { hits: cachedResults, misses } = await bulkGetCached(filenames);
  const cachedCount = Object.keys(cachedResults).length;

  if (cachedCount > 0) {
    console.log(`[GeminiAI] Cache: ${cachedCount} hit(s), ${misses.length} miss(es)`);
  }

  if (misses.length === 0) {
    report({
      stage: 'done',
      message: `All ${total} filename(s) loaded from cache`,
      cached: cachedCount,
      parsed: total,
    });
    return { results: cachedResults, failed: [], aiRequested: 0 };
  }

  // ── 2. Local high-confidence pre-pass (skips Gemini — big speed win) ─────
  report({
    stage: 'local',
    message: `Local parse for ${misses.length} uncached file(s)…`,
    cached: cachedCount,
  });

  const localResults: Record<string, ParsedFilename> = {};
  const needAi: string[] = [];

  for (let i = 0; i < misses.length; i++) {
    const name = misses[i];
    const local = parseLocalFilename(name);
    // Fast path: high-confidence local, or any local when Gemini is off
    if (
      local?.title &&
      (local.confidence >= LOCAL_CONFIDENCE_SKIP_AI || !allowGemini)
    ) {
      localResults[name] = localToParsed(local);
    } else {
      needAi.push(name);
    }
    if (i % 8 === 0 || i === misses.length - 1) {
      report({
        stage: 'local',
        message: `Local parse ${i + 1}/${misses.length} · ${Object.keys(localResults).length} ready${allowGemini ? `, ${needAi.length} need AI` : ''}`,
        cached: cachedCount,
        local: Object.keys(localResults).length,
        parsed: cachedCount + Object.keys(localResults).length,
      });
    }
  }

  // Gemini disabled or over soft cap: local-parse leftovers
  if (!allowGemini && needAi.length > 0) {
    for (const name of needAi) {
      const local = parseLocalFilename(name);
      if (local?.title) localResults[name] = localToParsed(local);
    }
    needAi.length = 0;
  } else if (
    allowGemini &&
    typeof maxAiFiles === 'number' &&
    maxAiFiles >= 0 &&
    needAi.length > maxAiFiles
  ) {
    const overflow = needAi.splice(maxAiFiles);
    for (const name of overflow) {
      const local = parseLocalFilename(name);
      if (local?.title) localResults[name] = localToParsed(local);
    }
    report({
      stage: 'local',
      message: `Free AI quota: ${maxAiFiles} via Gemini, ${overflow.length} via local`,
      cached: cachedCount,
      local: Object.keys(localResults).length,
    });
  }

  console.log(
    `[GeminiAI] Local high-confidence: ${Object.keys(localResults).length}; ` +
      (allowGemini
        ? `sending ${needAi.length} to Gemini`
        : 'Gemini skipped (quota / disabled)'),
  );

  // ── 3. Gemini for leftovers (single batch when possible) ───────────────────
  const allNewResults: Record<string, ParsedFilename> = { ...localResults };
  const allFailed: string[] = [];
  const aiRequested = allowGemini ? needAi.length : 0;

  if (allowGemini && needAi.length > 0) {
    const batches: string[][] = [];
    for (let i = 0; i < needAi.length; i += BATCH_SIZE) {
      batches.push(needAi.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      report({
        stage: 'sending',
        message:
          batches.length === 1
            ? `Sending ${batch.length} filename(s) to Gemini AI…`
            : `Sending batch ${i + 1}/${batches.length} (${batch.length} files) to Gemini…`,
        cached: cachedCount,
        local: Object.keys(localResults).length,
        sending: batch.length,
        batchIndex: i + 1,
        batchCount: batches.length,
        parsed: cachedCount + Object.keys(allNewResults).length,
      });

      report({
        stage: 'waiting',
        message:
          batches.length === 1
            ? `Waiting for Gemini… parsing ${batch.length} filename(s)`
            : `Waiting for Gemini batch ${i + 1}/${batches.length}…`,
        cached: cachedCount,
        local: Object.keys(localResults).length,
        sending: batch.length,
        batchIndex: i + 1,
        batchCount: batches.length,
        parsed: cachedCount + Object.keys(allNewResults).length,
      });

      const batchResult = await parseBatch(batch, {
        isPro,
        onQueue: (lane) => {
          report({
            stage: 'waiting',
            message:
              lane === 'pro'
                ? 'Pro priority lane busy — retrying shortly…'
                : 'High traffic! You are in queue. Scanning will begin shortly…',
            cached: cachedCount,
            local: Object.keys(localResults).length,
            sending: batch.length,
            batchIndex: i + 1,
            batchCount: batches.length,
            parsed: cachedCount + Object.keys(allNewResults).length,
          });
        },
      });
      Object.assign(allNewResults, batchResult.results);
      allFailed.push(...batchResult.failed);

      // Local fallback for anything Gemini still missed
      for (const failedName of batchResult.failed) {
        if (allNewResults[failedName]) continue;
        const fallback = parseLocalFilename(failedName);
        if (fallback?.title) {
          allNewResults[failedName] = localToParsed(fallback);
          // no longer failed
          const idx = allFailed.indexOf(failedName);
          if (idx >= 0) allFailed.splice(idx, 1);
        }
      }

      report({
        stage: 'received',
        message: `Gemini returned ${Object.keys(batchResult.results).length}/${batch.length} · total parsed ${cachedCount + Object.keys(allNewResults).length}/${total}`,
        cached: cachedCount,
        local: Object.keys(localResults).length,
        parsed: cachedCount + Object.keys(allNewResults).length,
        batchIndex: i + 1,
        batchCount: batches.length,
      });
    }
  }

  // ── 4. Cache new AI + local results ────────────────────────────────────────
  if (Object.keys(allNewResults).length > 0) {
    await bulkSetCached(allNewResults);
  }

  const mergedResults = { ...cachedResults, ...allNewResults };
  const stillFailed = filenames.filter((f) => !mergedResults[f]);

  console.log(
    `[GeminiAI] Parsed ${Object.keys(mergedResults).length}/${total} ` +
      `(${cachedCount} cached, ${Object.keys(localResults).length} local, ` +
      `${Object.keys(allNewResults).length - Object.keys(localResults).length} AI)`,
  );

  if (stillFailed.length > 0) {
    console.warn(`[GeminiAI] Failed to parse: ${stillFailed.join(', ')}`);
  }

  report({
    stage: 'done',
    message: `Parsed ${Object.keys(mergedResults).length}/${total} filenames`,
    cached: cachedCount,
    local: Object.keys(localResults).length,
    parsed: Object.keys(mergedResults).length,
  });

  return { results: mergedResults, failed: stillFailed, aiRequested };
}

export async function parseSingleFilename(
  filename: string,
  callOptions?: GeminiCallOptions,
): Promise<ParsedFilename | null> {
  const result = await batchParseFilenames([filename], undefined, {
    isPro: callOptions?.isPro,
    onQueue: callOptions?.onQueue,
  });
  return result.results[filename] ?? null;
}

export async function parseEpisodeWithContext(
  filename: string,
  showTitle: string,
  callOptions?: GeminiCallOptions,
): Promise<{ season: number | null; episode: number | null; episodeName?: string }> {
  try {
    const systemPrompt = `You are a TV episode parser.
Extract the season number, episode number, and episode title (if present in the filename).
Do not guess the episode title from external knowledge, only extract it if it's explicitly written in the filename (after the season/episode markers).
If it's an anime with absolute numbering (e.g. - 14), season is 1, episode is 14.
Output ONLY valid JSON with no markdown formatting.
Schema: {"season": number|null, "episode": number|null, "episodeName": string|null}`;

    const content = await generateContentWithKeys({
      isPro: callOptions?.isPro,
      onQueue: callOptions?.onQueue,
      contents: `The user has a file named: "${filename}"
This file belongs to the TV show: "${showTitle}"`,
      systemInstruction: systemPrompt,
      temperature: 0.1,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
    });

    if (!content) {
      console.warn('[GeminiAI] Empty response in parseEpisodeWithContext. Returning default.');
      return { season: null, episode: null };
    }

    const text = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(text);
    return {
      season: typeof parsed.season === 'number' ? parsed.season : null,
      episode: typeof parsed.episode === 'number' ? parsed.episode : null,
      episodeName:
        typeof parsed.episodeName === 'string' && parsed.episodeName.trim()
          ? parsed.episodeName.trim()
          : undefined,
    };
  } catch (e) {
    console.error('[GeminiAI] Failed to parse episode with context:', e);
    return { season: null, episode: null };
  }
}

export async function batchParseEpisodesWithContext(
  filenames: string[],
  showTitle: string,
  callOptions?: GeminiCallOptions,
): Promise<Record<string, { season: number | null; episode: number | null; episodeName?: string }>> {
  if (filenames.length === 0) return {};
  try {
    const content = await generateContentWithKeys({
      isPro: callOptions?.isPro,
      onQueue: callOptions?.onQueue,
      contents: `You are a TV episode parser.
The user has a TV show: "${showTitle}"
Extract the season number, episode number, and episode title (if present in the filename) for each of these files.
Do not guess the episode title from external knowledge, only extract it if it's explicitly written in the filename.
If it's an anime with absolute numbering (e.g. - 14), season is 1, episode is 14.
Output ONLY valid JSON with no markdown formatting.
Schema: {"<exact filename>": {"season": number|null, "episode": number|null, "episodeName": string|null}}

Files to parse:
${JSON.stringify(filenames)}
`,
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    });

    if (!content) {
      console.warn('[GeminiAI] Empty response in batchParseEpisodesWithContext. Returning empty object.');
      return {};
    }

    const text = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(text);

    const results: Record<
      string,
      { season: number | null; episode: number | null; episodeName?: string }
    > = {};
    for (const filename of filenames) {
      const p = parsed[filename];
      if (p) {
        results[filename] = {
          season: typeof p.season === 'number' ? p.season : null,
          episode: typeof p.episode === 'number' ? p.episode : null,
          episodeName:
            typeof p.episodeName === 'string' && p.episodeName.trim()
              ? p.episodeName.trim()
              : undefined,
        };
      }
    }
    return results;
  } catch (e) {
    console.error('[GeminiAI] Failed to batch parse episodes with context:', e);
    return {};
  }
}

export async function disambiguateMatch(
  filename: string,
  options: { id: string; title: string; year?: string }[],
  userHint: string,
  callOptions?: GeminiCallOptions,
): Promise<string | null> {
  if (options.length === 0) return null;
  try {
    const systemPrompt = `You are a TV/Movie matcher helping to resolve an ambiguous file.
The user will provide a filename, a list of matches, and a hint they provided.
Based on their hint, identify which ID from the options is the correct match.
Output ONLY valid JSON with no markdown formatting.
Schema: {"id": string|null}`;

    const content = await generateContentWithKeys({
      isPro: callOptions?.isPro,
      onQueue: callOptions?.onQueue,
      contents: `Filename: "${filename}"
Matches:
${JSON.stringify(options, null, 2)}

User's hint: "${userHint}"`,
      systemInstruction: systemPrompt,
      temperature: 0.1,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
    });

    if (!content) {
      console.warn('[GeminiAI] Empty response in disambiguateMatch. Returning null.');
      return null;
    }

    const text = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(text);
    if (parsed.id !== undefined && parsed.id !== null) {
      return String(parsed.id);
    }
    return null;
  } catch (e) {
    console.error('[GeminiAI] Failed to disambiguate:', e);
    return null;
  }
}

export const geminiAIService = {
  batchParseFilenames,
  parseSingleFilename,
  parseEpisodeWithContext,
  batchParseEpisodesWithContext,
  disambiguateMatch,
};
