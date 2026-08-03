/**
 * SRT subtitle parser
 *
 * Converts raw .srt file text into an array of SubtitleCue objects sorted by
 * start time.  The parser is intentionally lenient — it tolerates Windows
 * line-endings, missing sequence numbers, extra blank lines, and common BOM
 * characters so real-world subtitle files work without pre-processing.
 */

export interface SubtitleCue {
  /** 1-based sequence number from the SRT file (may be 0 for malformed files) */
  index: number;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Display text — HTML tags stripped, multiple lines joined with '\n' */
  text: string;
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

/**
 * Parses "HH:MM:SS,mmm" or "HH:MM:SS.mmm" into seconds (float).
 * Returns -1 on parse failure so the caller can discard the cue.
 */
function parseTimestamp(raw: string): number {
  // Accept both comma and period as millisecond separator
  const cleaned = raw.trim().replace(',', '.');
  // HH:MM:SS.mmm
  const match = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (!match) return -1;
  const [, hh, mm, ss, ms] = match;
  const millis = parseInt(ms.padEnd(3, '0'), 10); // '1' → 100ms, '12' → 120ms
  return (
    parseInt(hh, 10) * 3600 +
    parseInt(mm, 10) * 60 +
    parseInt(ss, 10) +
    millis / 1000
  );
}

// ─── HTML / tag stripping ─────────────────────────────────────────────────────

/**
 * Strips common SRT inline tags (<b>, <i>, <u>, <font …>) and leftover angle
 * brackets so the plain text is safe to render in a React Native <Text>.
 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // remove all tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .trim();
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a complete SRT string and return an array of SubtitleCue objects,
 * sorted by start time.  Invalid cues (bad timestamps, empty text) are silently
 * discarded.
 */
export function parseSRT(raw: string): SubtitleCue[] {
  // Normalise line endings and strip BOM
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on one or more blank lines — each chunk is one cue block
  const blocks = text.split(/\n{2,}/);

  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let lineIdx = 0;

    // Optional sequence number — skip if the first line is a pure integer
    let sequenceNumber = 0;
    if (/^\d+$/.test(lines[lineIdx])) {
      sequenceNumber = parseInt(lines[lineIdx], 10);
      lineIdx++;
    }

    // Timestamp line: "HH:MM:SS,mmm --> HH:MM:SS,mmm"
    if (lineIdx >= lines.length) continue;
    const timeLine = lines[lineIdx];
    lineIdx++;

    const arrowIdx = timeLine.indexOf('-->');
    if (arrowIdx === -1) continue;

    const start = parseTimestamp(timeLine.slice(0, arrowIdx));
    // Timestamp may have positioning info after the end time — take only the
    // first token after '-->'
    const endRaw = timeLine.slice(arrowIdx + 3).trim().split(/\s/)[0];
    const end = parseTimestamp(endRaw);

    if (start < 0 || end < 0 || end < start) continue;

    // Remaining lines are the subtitle text
    if (lineIdx >= lines.length) continue;
    const textLines = lines.slice(lineIdx);
    const displayText = stripTags(textLines.join('\n'));
    if (!displayText) continue;

    cues.push({ index: sequenceNumber, start, end, text: displayText });
  }

  // Sort by start time in case the file is out of order
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

// ─── Binary-search active cue ─────────────────────────────────────────────────

/**
 * Returns the cue that should be displayed at `currentSeconds`, or null if
 * none applies.  Uses binary search (O(log n)) so it's cheap to call every
 * 250 ms even with thousands of cues.
 */
export function findActiveCue(
  cues: SubtitleCue[],
  currentSeconds: number,
): SubtitleCue | null {
  if (cues.length === 0) return null;

  let lo = 0;
  let hi = cues.length - 1;
  let result: SubtitleCue | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cue = cues[mid];
    if (currentSeconds >= cue.start && currentSeconds <= cue.end) {
      result = cue;
      break;
    } else if (currentSeconds < cue.start) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return result;
}
