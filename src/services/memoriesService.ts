/**
 * memoriesService.ts
 *
 * Builds a "Memories" recap of every unique title the user has ever watched.
 * Generates a self-contained HTML email that looks like a YouTube play-button
 * thumbnail — a grid of poster art with a red play button overlay — and opens
 * the device's native share sheet so the user can send it to their email client.
 *
 * The HTML is intentionally inline-styled so it renders correctly in Gmail,
 * Apple Mail, Outlook, etc., without any external stylesheet dependency.
 *
 * Public API
 * ──────────
 *   memoriesService.buildUniqueTitles(history)  → UniqueTitleEntry[]
 *   memoriesService.shareMemories(history)       → Promise<void>
 */

import { Share } from 'react-native';
import { WatchEvent } from '../storage/watchHistoryService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UniqueTitleEntry {
  mediaId: string;
  title: string;
  type: 'movie' | 'tv';
  posterUrl?: string;
  /** ISO string of the first time this title was watched. */
  firstWatchedAt: string;
  /** Total number of watch events for this title. */
  watchCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** De-duplicate watch history into one entry per unique mediaId. */
function deduplicateHistory(history: WatchEvent[]): UniqueTitleEntry[] {
  const map = new Map<string, UniqueTitleEntry>();

  // History is newest-first — iterate in reverse so earliest event wins for
  // firstWatchedAt.
  const reversed = [...history].reverse();

  for (const event of reversed) {
    const existing = map.get(event.mediaId);
    if (existing) {
      existing.watchCount++;
      // Keep earliest watchedAt
      if (event.watchedAt < existing.firstWatchedAt) {
        existing.firstWatchedAt = event.watchedAt;
      }
      // Prefer a poster if we didn't have one
      if (!existing.posterUrl && event.posterUrl) {
        existing.posterUrl = event.posterUrl;
      }
    } else {
      map.set(event.mediaId, {
        mediaId: event.mediaId,
        title: event.title,
        type: event.type,
        posterUrl: event.posterUrl,
        firstWatchedAt: event.watchedAt,
        watchCount: 1,
      });
    }
  }

  // Return sorted: movies first, then TV, both alphabetical within group
  return [...map.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'movie' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

// ─── HTML generation ──────────────────────────────────────────────────────────

const POSTER_W = 80;
const POSTER_H = 120;
const GRID_COLS = 4;

/** YouTube-style red play button SVG, centered on a dark overlay. */
const PLAY_BUTTON_SVG = `
<div style="
  position:absolute;
  top:50%;left:50%;
  transform:translate(-50%,-50%);
  width:56px;height:40px;
  background:#FF0000;
  border-radius:8px;
  display:flex;align-items:center;justify-content:center;
">
  <div style="
    width:0;height:0;
    border-top:10px solid transparent;
    border-bottom:10px solid transparent;
    border-left:18px solid #ffffff;
    margin-left:4px;
  "></div>
</div>`.trim();

function buildPosterGrid(titles: UniqueTitleEntry[]): string {
  // Use up to 40 posters for the hero grid (5 rows × 8 cols at mobile width)
  const forGrid = titles.filter((t) => !!t.posterUrl).slice(0, 40);
  const fallback = titles.filter((t) => !t.posterUrl).slice(0, Math.max(0, 40 - forGrid.length));
  const gridItems = [...forGrid, ...fallback];

  const cells = gridItems.map((t) => {
    if (t.posterUrl) {
      return `
      <td style="padding:2px;">
        <img
          src="${t.posterUrl}"
          width="${POSTER_W}"
          height="${POSTER_H}"
          alt="${t.title.replace(/"/g, '&quot;')}"
          style="display:block;border-radius:6px;object-fit:cover;width:${POSTER_W}px;height:${POSTER_H}px;"
        />
      </td>`;
    }
    // Coloured placeholder for titles without a poster
    const hue = (t.title.charCodeAt(0) * 37) % 360;
    const initial = t.title.charAt(0).toUpperCase();
    return `
    <td style="padding:2px;">
      <div style="
        width:${POSTER_W}px;height:${POSTER_H}px;
        border-radius:6px;
        background:hsl(${hue},40%,22%);
        display:flex;align-items:center;justify-content:center;
        font-family:sans-serif;font-size:28px;font-weight:900;
        color:hsl(${hue},60%,70%);
      ">${initial}</div>
    </td>`;
  });

  // Chunk into rows
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += GRID_COLS * 2) {
    const rowCells = cells.slice(i, i + GRID_COLS * 2).join('');
    rows.push(`<tr>${rowCells}</tr>`);
  }

  return `
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
    ${rows.join('\n')}
  </table>`;
}

function buildMovieListSection(titles: UniqueTitleEntry[]): string {
  const movies = titles.filter((t) => t.type === 'movie');
  const shows  = titles.filter((t) => t.type === 'tv');

  function titleRow(t: UniqueTitleEntry): string {
    const year = new Date(t.firstWatchedAt).getFullYear();
    const watchLabel = t.watchCount > 1 ? ` · watched ${t.watchCount}×` : '';
    return `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #2a2a2a;vertical-align:middle;">
        ${t.posterUrl
          ? `<img src="${t.posterUrl}" width="28" height="42" style="border-radius:3px;object-fit:cover;display:inline-block;vertical-align:middle;" alt="" />`
          : `<div style="width:28px;height:42px;background:#2a2a2a;border-radius:3px;display:inline-block;vertical-align:middle;"></div>`
        }
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;vertical-align:middle;">
        <span style="font-family:sans-serif;font-size:14px;color:#f0f0f0;font-weight:600;">${t.title}</span>
        <br/>
        <span style="font-family:sans-serif;font-size:11px;color:#888888;">${year}${watchLabel}</span>
      </td>
    </tr>`;
  }

  function section(label: string, items: UniqueTitleEntry[], emoji: string): string {
    if (items.length === 0) return '';
    return `
    <h3 style="font-family:sans-serif;color:#ffffff;font-size:16px;font-weight:800;margin:28px 0 10px;letter-spacing:0.5px;">
      ${emoji} ${label} <span style="color:#888;font-weight:500;font-size:13px;">(${items.length})</span>
    </h3>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
      ${items.map(titleRow).join('')}
    </table>`;
  }

  return section('Movies', movies, '🎬') + section('TV Shows', shows, '📺');
}

function buildEmailHTML(titles: UniqueTitleEntry[]): string {
  const totalTitles = titles.length;
  const movies = titles.filter((t) => t.type === 'movie').length;
  const shows  = titles.filter((t) => t.type === 'tv').length;
  const year   = new Date().getFullYear();

  const posterGrid  = buildPosterGrid(titles);
  const listSection = buildMovieListSection(titles);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>My FilmSort Memories</title>
</head>
<body style="margin:0;padding:0;background:#000000;">

  <!-- Outer wrapper -->
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000000;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card -->
        <table cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;background:#111111;border-radius:20px;overflow:hidden;border:1px solid #222222;">

          <!-- Hero block: poster grid + play button overlay -->
          <tr>
            <td style="position:relative;background:#0a0a0a;padding:0;overflow:hidden;">

              <!-- Dimmed poster mosaic -->
              <div style="opacity:0.55;overflow:hidden;">
                ${posterGrid}
              </div>

              <!-- Dark overlay gradient -->
              <div style="
                position:absolute;top:0;left:0;right:0;bottom:0;
                background:linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%);
              "></div>

              <!-- YouTube-style play button -->
              <div style="
                position:absolute;
                top:50%;left:50%;
                transform:translate(-50%,-50%);
              ">
                <div style="
                  width:72px;height:50px;
                  background:#FF0000;
                  border-radius:12px;
                  display:flex;align-items:center;justify-content:center;
                  box-shadow:0 4px 24px rgba(255,0,0,0.5);
                ">
                  <!-- Play triangle (HTML/CSS only, no SVG needed) -->
                  <div style="
                    width:0;height:0;
                    border-top:13px solid transparent;
                    border-bottom:13px solid transparent;
                    border-left:22px solid #ffffff;
                    margin-left:5px;
                  "></div>
                </div>
              </div>

              <!-- App name watermark -->
              <div style="
                position:absolute;bottom:16px;left:0;right:0;
                text-align:center;
                font-family:sans-serif;font-size:11px;font-weight:700;
                color:rgba(255,255,255,0.5);
                letter-spacing:2px;text-transform:uppercase;
              ">FilmSort</div>

            </td>
          </tr>

          <!-- Stats row -->
          <tr>
            <td style="padding:28px 28px 0;">
              <h1 style="
                font-family:sans-serif;
                font-size:26px;font-weight:900;
                color:#ffffff;margin:0 0 6px;
                letter-spacing:-0.5px;
              ">Your ${year} Memories</h1>
              <p style="
                font-family:sans-serif;font-size:15px;color:#888888;
                margin:0 0 24px;line-height:1.5;
              ">
                Here's every title you've ever watched in FilmSort.
              </p>

              <!-- Stat pills -->
              <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <tr>
                  <td style="width:33%;padding:0 4px 0 0;">
                    <div style="
                      background:#1a1a1a;border-radius:12px;
                      padding:14px;text-align:center;
                      border:1px solid #2a2a2a;
                    ">
                      <div style="font-family:sans-serif;font-size:28px;font-weight:900;color:#ffffff;">${totalTitles}</div>
                      <div style="font-family:sans-serif;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Titles</div>
                    </div>
                  </td>
                  <td style="width:33%;padding:0 4px;">
                    <div style="
                      background:#1a1a1a;border-radius:12px;
                      padding:14px;text-align:center;
                      border:1px solid #2a2a2a;
                    ">
                      <div style="font-family:sans-serif;font-size:28px;font-weight:900;color:#f59e0b;">${movies}</div>
                      <div style="font-family:sans-serif;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Films</div>
                    </div>
                  </td>
                  <td style="width:33%;padding:0 0 0 4px;">
                    <div style="
                      background:#1a1a1a;border-radius:12px;
                      padding:14px;text-align:center;
                      border:1px solid #2a2a2a;
                    ">
                      <div style="font-family:sans-serif;font-size:28px;font-weight:900;color:#60a5fa;">${shows}</div>
                      <div style="font-family:sans-serif;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Shows</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Full title list -->
          <tr>
            <td style="padding:4px 28px 32px;">
              ${listSection}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              padding:20px 28px;
              border-top:1px solid #1e1e1e;
              font-family:sans-serif;font-size:11px;color:#444444;
              text-align:center;line-height:1.6;
            ">
              Generated by FilmSort · Your local media library<br/>
              ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const memoriesService = {
  /**
   * Returns a de-duplicated, sorted list of all unique titles ever watched.
   */
  buildUniqueTitles(history: WatchEvent[]): UniqueTitleEntry[] {
    return deduplicateHistory(history);
  },

  /**
   * Opens the native share sheet with the Memories HTML.
   * The user can share to their email client, save as a file, etc.
   *
   * On iOS the HTML is shared as a `.html` file attachment.
   * On Android it goes as plain text (HTML body) since Share doesn't support
   * file attachments natively — the user pastes it into Gmail / compose.
   *
   * For a richer experience, pair this with expo-sharing and expo-file-system
   * to write a temp .html file and call Sharing.shareAsync().
   */
  async shareMemories(history: WatchEvent[]): Promise<void> {
    const titles = deduplicateHistory(history);
    if (titles.length === 0) {
      throw new Error('NO_HISTORY');
    }

    const html = buildEmailHTML(titles);

    // Plain-text fallback for the share message
    const movieList = titles
      .slice(0, 50)
      .map((t, i) => `${i + 1}. ${t.title} (${t.type === 'movie' ? 'Movie' : 'TV'})`)
      .join('\n');

    const moreCount = titles.length > 50 ? `\n…and ${titles.length - 50} more` : '';

    const shareMessage =
      `🎬 My FilmSort Memories\n\n` +
      `${titles.length} titles watched — here's a taste:\n\n` +
      movieList +
      moreCount +
      `\n\n---\nFull visual recap (HTML) copied below ↓\n\n` +
      html;

    await Share.share(
      {
        title: 'My FilmSort Memories',
        message: shareMessage,
      },
      {
        dialogTitle: 'Share your Memories',
        subject: `My FilmSort Memories — ${titles.length} titles watched`,
      },
    );
  },
};
