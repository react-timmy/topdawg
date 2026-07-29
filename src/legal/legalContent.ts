/**
 * Legal content for FilmSort.
 * Bump PRIVACY_VERSION or TERMS_VERSION whenever text changes materially.
 */

export const APP_NAME = 'FilmSort';
export const SUPPORT_EMAIL = 'support@filmsorter.app';
export const LAST_UPDATED = 'July 2026';

export const PRIVACY_VERSION = '1.0';
export const TERMS_VERSION = '1.0';

export const PRIVACY_POLICY_URL = 'https://filmsorthub.blogspot.com/p/our-privacy-policy.html';
export const TERMS_OF_USE_URL = 'https://filmsorthub.blogspot.com/p/terms-of-use.html';

// ─── Privacy Policy sections ──────────────────────────────────────────────────

export const PRIVACY_POLICY_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Overview',
    body: `FilmSort ("we", "our", or "the app") is a local media organiser. It scans video files stored on your device and uses third-party APIs to enrich them with metadata such as posters, titles, and ratings.`,
  },
  {
    heading: 'What we collect and transmit',
    body: `The app collects and transmits media filenames and metadata via HTTPS to TMDB and Gemini API for matching. No video file content is uploaded, shared, or stored on remote servers.\n\n• Filenames are sent to Google Gemini AI to parse titles, years, and episode info.\n• Parsed titles are sent to TMDB to retrieve poster art, ratings, and plot summaries.\n• No audio, video content, thumbnails, or personally identifiable information is ever uploaded.\n• We do not maintain any server-side user accounts or databases.`,
  },
  {
    heading: 'Data stored on your device',
    body: `All library data, watch progress, notification history, and preferences are stored exclusively in local storage (AsyncStorage). You can delete all stored data at any time from Settings → Clear Library.`,
  },
  {
    heading: 'Third-party services',
    body: `• The Movie Database (TMDB) — for movie/TV metadata. See tmdb.org/privacy-policy.\n• Google Gemini AI — for filename parsing. See policies.google.com/privacy.\n• Jikan (MyAnimeList proxy) — for anime metadata. No credentials transmitted.\n\nThis product uses the TMDB API but is not endorsed or certified by TMDB.`,
  },
  {
    heading: 'Permissions',
    body: `• READ_MEDIA_VIDEO / READ_MEDIA_VISUAL_USER_SELECTED — to scan video files. The app never modifies or deletes your files.\n• READ_EXTERNAL_STORAGE — on older Android versions to access video files.\n• POST_NOTIFICATIONS — optional, for upcoming release reminders.`,
  },
  {
    heading: "Children's privacy",
    body: `FilmSort is not directed at children under 13. We do not knowingly collect personal information from children.`,
  },
  {
    heading: 'Changes to this policy',
    body: `If we make material changes, we will update the version number and prompt you to re-accept before continuing to use the Scan feature.`,
  },
  {
    heading: 'Contact',
    body: `Questions? Contact us at support@filmsorter.app.`,
  },
  {
    heading: 'Cloud Account & Data Sync',
    body: `FilmSort offers an optional Google Sign-In feature that backs up your watch history, badges, and stats to Google Firebase (Firestore), hosted by Google LLC.\n\n**What is collected (sign-in only):**\n• Your Google display name, email address, and profile photo URL — stored locally on your device and in your personal Firestore document.\n• Watch events (title, type, watched date, genres, runtime) — stored under your unique Firebase UID. No file paths, local URIs, or device identifiers are ever uploaded.\n\n**Sign-in is entirely optional.** All local features — scanning, library, history, badges, and stats — work fully without an account. Users who do not sign in have zero data sent to Firebase.\n\n**Data location:** Your watch history is stored in Google Firestore under a document path accessible only to you (enforced by Firestore security rules). Google may process this data in accordance with their privacy policy: policies.google.com/privacy.\n\n**How to delete your data:** Sign in to the app, go to Settings → Account → Sign Out. To request full deletion of your Firestore data, email support@filmsorter.app with your account email address.`,
  },
];

// ─── Terms of Use sections ────────────────────────────────────────────────────

export const TERMS_OF_USE_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Acceptance',
    body: `By using FilmSort, you agree to these Terms of Use. If you do not agree, do not use the app.`,
  },
  {
    heading: 'What FilmSort does',
    body: `FilmSort is a local media library organiser. It scans video files on your device, parses filenames using AI, and fetches publicly available metadata from third-party databases. FilmSort does not host, stream, download, or provide access to any copyrighted content.`,
  },
  {
    heading: 'Your responsibility for content',
    body: `You are solely responsible for ensuring that video files on your device are legally obtained. FilmSort does not endorse, facilitate, or condone copyright infringement or piracy.`,
  },
  {
    heading: 'No affiliation with streaming services',
    body: `FilmSort is an independent application and is not affiliated with, endorsed by, or certified by Netflix, Amazon, Disney, TMDB, Google, or any other third-party service whose data it may display. All trademarks are property of their respective owners.`,
  },
  {
    heading: 'AI matching limitations',
    body: `Filename parsing and metadata matching are provided on a best-effort basis. FilmSort does not guarantee accuracy. Results may be incorrect for unusual, foreign-language, or obscure filenames.`,
  },
  {
    heading: 'Disclaimer of warranties',
    body: `FilmSort is provided "as is" without warranties of any kind. Your use of the app is at your own risk.`,
  },
  {
    heading: 'Limitation of liability',
    body: `To the maximum extent permitted by law, FilmSort and its developers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app.`,
  },
  {
    heading: 'Changes to these terms',
    body: `We may update these terms at any time. We will update the version number and prompt re-acceptance before continuing to use the Scan feature.`,
  },
  {
    heading: 'Contact',
    body: `Questions? Contact us at support@filmsorter.app.`,
  },
];
