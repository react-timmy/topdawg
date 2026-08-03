# FilmSort — Cloudflare Worker Proxy Setup Guide

Your TMDB and Gemini API keys now live **server-side only** inside Cloudflare's
encrypted Secret store. The app bundle contains zero secrets — only the worker's
HTTPS URL, which is useless without a valid Firebase account.

---

## Is This Free?

**Yes, completely free.**

Cloudflare Workers free plan includes:
- **100,000 requests/day** — resets every 24 hours
- **10ms CPU time per request** — more than enough for a proxy
- **No credit card required** to sign up or deploy
- Secrets storage is also free

A typical FilmSort user makes ~20–100 TMDB + Gemini calls per session.
You'd need thousands of daily active users before approaching the limit.

---

## What Changed in the App

| Before | After |
|--------|-------|
| `TMDB_API_KEY` hardcoded in `app.config.js` | Stored in Cloudflare Worker Secret |
| `GEMINI_API_KEY` hardcoded in `app.config.js` | Stored in Cloudflare Worker Secret |
| App called TMDB directly | App calls `POST /tmdb` on your Worker |
| App called Gemini directly | App calls `POST /gemini` on your Worker |
| APK unpackers could read your keys | Worker requires a valid Firebase ID token |

---

## Prerequisites

### 1. Node.js (v18+)

Check if you have it:
```bash
node --version
```
If missing → download from https://nodejs.org (choose the LTS version)

### 2. Wrangler CLI (Cloudflare's deploy tool)

You don't install it globally — it's already in the worker's package.json as a
dev dependency. You run it with `npx` which downloads it on demand.

---

## Step-by-Step Setup

### Step 1 — Log in to Cloudflare

```bash
cd /home/timmy/Downloads/buildreal/filmsort-copy/worker
npx wrangler login
```

This opens your browser. Sign in with your Cloudflare account.
After approving, return to the terminal — it will confirm you're logged in.

---

### Step 2 — Install worker dependencies

```bash
cd /home/timmy/Downloads/buildreal/filmsort-copy/worker
npm install
```

This installs Wrangler locally. Takes about 30 seconds.

---

### Step 3 — Store your API keys as Secrets

Run each command below. Wrangler will prompt you to **paste the key value**
then press Enter. The key is sent encrypted to Cloudflare — it never appears
in your source code or terminal history.

```bash
# TMDB API key — from https://www.themoviedb.org/settings/api
npx wrangler secret put TMDB_API_KEY

# Gemini free-tier key — from https://aistudio.google.com/app/apikey
npx wrangler secret put GEMINI_API_KEY

# Optional: Pro VIP key for the "Skip the Line" lane
# Skip this command if you don't have a separate Pro key yet
npx wrangler secret put GEMINI_PRO_API_KEY
```

To confirm a secret was saved:
```bash
npx wrangler secret list
```
You should see `TMDB_API_KEY` and `GEMINI_API_KEY` listed (values are hidden).

---

### Step 4 — Deploy the Worker

```bash
cd /home/timmy/Downloads/buildreal/filmsort-copy/worker
npx wrangler deploy
```

Expected output:
```
Total Upload: 12.34 KiB / gzip: 4.56 KiB
Your worker has access to the following bindings:
- Vars:
  - FIREBASE_PROJECT_ID: "filmoor-49db3"
- Secrets:
  - TMDB_API_KEY
  - GEMINI_API_KEY

Uploaded filmsort-proxy (1.23 sec)
Deployed filmsort-proxy triggers (0.45 sec)
  https://filmsort-proxy.YOUR_SUBDOMAIN.workers.dev
```

**Copy that URL** — you need it in the next step.
It will look like: `https://filmsort-proxy.yourname.workers.dev`

---

### Step 5 — Add the Worker URL to your .env

Open `/home/timmy/Downloads/buildreal/filmsort-copy/.env` and set:

```
EXPO_PUBLIC_PROXY_BASE_URL=https://filmsort-proxy.YOUR_SUBDOMAIN.workers.dev
```

Replace `YOUR_SUBDOMAIN` with your actual subdomain from the deploy output.

---

### Step 6 — Rebuild the app

```bash
cd /home/timmy/Downloads/buildreal/filmsort-copy
npx expo start --clear
```

The `--clear` flag forces Expo to reload the updated `.env` values.

For a production build:
```bash
eas build --platform android
eas build --platform ios
```

---

## Verifying It Works

### Check the Worker dashboard

Go to https://dash.cloudflare.com → **Workers & Pages** → **filmsort-proxy**

You'll see a live request count and logs.

### Test manually with curl

Sign in to the app first, then add a temporary log in the app to print the
current user's ID token:

```typescript
// Temporary debug — remove after testing
import auth from '@react-native-firebase/auth';
const token = await auth().currentUser?.getIdToken();
console.log('ID TOKEN:', token);
```

Then test from your terminal:

```bash
# Test TMDB proxy
curl -X POST https://filmsort-proxy.YOUR_SUBDOMAIN.workers.dev/tmdb \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  -d '{"path": "/trending/movie/week", "params": {}}'

# Expected: JSON response with TMDB trending movies
```

---

## Rotating Keys Later

If you ever need to change a key (e.g. if it gets compromised):

```bash
cd /home/timmy/Downloads/buildreal/filmsort-copy/worker

# Overwrite the secret — same command as setting it
npx wrangler secret put TMDB_API_KEY
# paste the new key when prompted

# Re-deploy to pick up the change
npx wrangler deploy
```

No app rebuild needed. The new key is live within seconds of deploying.

---

## How the Security Works

```
App (signed-in user)
  │
  │  POST /tmdb  { path, params }
  │  Authorization: Bearer <Firebase ID token>
  ▼
Cloudflare Worker (filmsort-proxy)
  │
  ├─ Verifies Firebase ID token signature using Google's public keys
  ├─ Rejects unsigned/expired tokens with 401
  │
  ├─ Injects TMDB_API_KEY from Cloudflare Secrets
  │
  └─ Forwards request to TMDB / Gemini
        ▼
     Real API
```

Even if someone decompiles your APK:
- They find only the worker URL (not the keys)
- They can't call the worker without a valid Firebase account in your project
- You control who can sign up in your Firebase Console

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `wrangler: command not found` | Run `npx wrangler` instead of `wrangler` |
| `Error: Not logged in` | Run `npx wrangler login` again |
| `401 Unauthorized` from the app | User not signed in — proxy requires Firebase auth |
| `403 Forbidden` from proxy | Secret not set — re-run Step 3 |
| `App shows empty results everywhere` | Check `EXPO_PUBLIC_PROXY_BASE_URL` in `.env`, run `expo start --clear` |
| `Worker not found` error | Re-run `npx wrangler deploy` from the `worker/` directory |
| `TypeError: Cannot read property 'text'` in Gemini | Check `GEMINI_API_KEY` secret is set — run `npx wrangler secret list` |

---

## File Structure

```
filmsort-copy/
├── worker/                         ← Cloudflare Worker (deployed separately)
│   ├── src/
│   │   └── index.ts                ← /tmdb and /gemini endpoints + Firebase auth
│   ├── wrangler.toml               ← Worker name, project ID config
│   └── package.json
├── src/
│   ├── config/
│   │   └── env.ts                  ← PROXY_BASE_URL only (zero keys)
│   └── services/
│       ├── proxyClient.ts          ← Shared fetch with Firebase ID token
│       ├── tmdbService.ts          ← Calls proxy instead of TMDB directly
│       └── geminiAIService.ts      ← Calls proxy instead of Gemini directly
├── app.config.js                   ← proxyBaseUrl only (zero keys)
└── .env                            ← EXPO_PUBLIC_PROXY_BASE_URL (not a secret)
```

**Keys stored in:** Cloudflare Worker Secrets (encrypted, server-side only)
**Keys NOT in:** `.env`, `app.config.js`, any source file, the app bundle
