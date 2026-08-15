# Timmy Portfolio Website Plan

## Summary

Build a fresh standalone Next.js portfolio website for Vercel. The public brand angle is AI web development: practical websites, AI-powered tools, mobile apps, and shipping from idea to production. FilmSort should be the centerpiece project, with SHAZAM, client website deliveries, CineVault, Buildoors, and web3/community work supporting the broader story.

The portfolio should include a protected admin page so new projects can be added, edited, featured, reordered, or unpublished without changing code.

## Positioning

Primary positioning:

> Full-stack AI developer building practical web and mobile products from concept to production.

Hero direction:

> Timmy (@_devTimmy) builds AI-powered web and mobile applications that solve real problems.

Supporting themes:

- Independent developer and creator.
- React, Next.js, React Native, Node.js, TypeScript, MERN, APIs, AI integrations, and deployment.
- Terminal-first workflow with AI coding assistants and CLIs.
- Product-minded builder who cares about UI, shipping, deployment, and repeatable systems.
- Web3 and AI community contributor across Bless Network, Billions Network, Sentient AGI, and similar projects.

## Recommended Stack

- Framework: Next.js App Router with TypeScript.
- Styling: Tailwind CSS plus custom CSS variables for a distinctive visual system.
- Hosting: Vercel.
- Database: Supabase Postgres or Vercel Postgres.
- Auth: simple protected admin login using NextAuth, Clerk, Supabase Auth, or a password-gated admin route for v1.
- Media storage: Supabase Storage, UploadThing, or Vercel Blob.
- Forms: server action or API route for contact submissions.
- Analytics: Vercel Analytics.

Default choice for implementation:

- Next.js + TypeScript + Tailwind.
- Supabase for auth, database, and project image storage.
- Vercel for deployment and analytics.

## Public Site Structure

### Home / Hero

Goal: make Timmy and the offer obvious in the first viewport.

Include:

- Name: Timmy.
- Handle: @_devTimmy.
- Main headline focused on AI-powered web and mobile apps.
- Short supporting line about shipping practical products with modern tools.
- CTAs: View Projects, Contact Me, X Profile.
- Strong visual direction with dark editorial energy, code/product motifs, and motion that feels intentional.

### About

Use the supplied copy, tightened for public portfolio use:

> I'm Timmy (@_devTimmy), a full-stack web and mobile developer building practical products with React, React Native, Node.js, TypeScript, and AI APIs. I work end-to-end: shaping the spec, building the interface, wiring real data, debugging deployment, and polishing the product until it is usable.
>
> My workflow is fast, terminal-first, and AI-assisted. I use tools like Codex, Claude Code, GitHub Copilot CLI, and Antigravity CLI to move faster, but the goal stays practical: ship websites, apps, and systems people can actually use.
>
> I am especially interested in AI tools, mobile apps, recommendation systems, content automation, decentralized compute, privacy, identity, and open AGI.

### Featured Projects

Show 3-6 strong projects with image, summary, tags, role, status, and links.

Initial projects:

- FilmSort: offline-first Android media organizer built with React Native and Expo.
- SHAZAM: AI design intelligence tool powered by OpenRouter.
- Client Website Deliveries: terminal-first client websites shipped with AI CLI workflows.
- CineVault: React Native / Expo mobile app.
- Buildoors: React, Vite, and Node.js full-stack web project.
- Web3 Community Contributions: Bless Network, Billions Network, Sentient AGI, and related narrative work.

### FilmSort Feature Section

FilmSort should be treated as the flagship case study.

Include:

- Problem: downloaded anime and media files become messy across uneven seasons and filenames.
- Solution: offline-first Android media organizer with metadata parsing, TMDB enrichment, Gemini fallback, and built-in playback.
- Tech: React Native, Expo SDK 54, TypeScript, TMDB API, Gemini API, Firebase, Android.
- Highlights: offline-first behavior, anime-aware parsing, AI fallback, collections, profile, stats, built-in player.
- Portfolio protection: describe outcomes and architecture at a high level without exposing proprietary parsing prompts, exact heuristics, or private implementation details.

### Skills / Stack

Group skills by category:

- Languages: JavaScript, TypeScript, HTML, CSS, SQL.
- Frontend: React, Next.js, Vite.
- Backend: Node.js, Express, REST APIs, MERN.
- Mobile: React Native, Expo, EAS Build.
- Databases: MongoDB, Postgres or Supabase if added.
- AI and APIs: Gemini API, OpenRouter, NVIDIA AI APIs, external API integration, recommendation systems.
- Deployment: Vercel, Railway, GitHub.
- Workflow: Git, terminal-first development, Termux, Linux Mint, AI coding assistants.

### Web3 / Community Impact

Purpose: show public visibility and narrative-building without presenting it as core protocol engineering.

Include:

- Bless Network: early and consistent supporter, content contributor, leaderboard effort.
- Billions Network: privacy, identity, ZK human verification, anti-bot narrative.
- Sentient AGI: open AGI advocacy, project amplification, research update commentary.
- Other public activity: X posts, threads, InfoFi campaigns, and project support.

Use screenshots or metrics only where they are safe and public.

### Contact

Include:

- Email.
- X / Twitter.
- GitHub.
- LinkedIn if available.
- Optional Telegram if public.
- Contact form with name, email, project type, budget range, and message.

## Admin Page Requirements

Route:

- `/admin`

Core admin features:

- Login-protected access.
- Create project.
- Edit project.
- Delete or archive project.
- Toggle featured status.
- Reorder featured projects.
- Upload screenshots.
- Add external links.
- Preview public project card before publishing.

Project fields:

- `id`
- `slug`
- `title`
- `subtitle`
- `summary`
- `caseStudy`
- `category`
- `status`
- `featured`
- `priority`
- `tags`
- `techStack`
- `role`
- `year`
- `coverImageUrl`
- `galleryImageUrls`
- `liveUrl`
- `githubUrl`
- `demoUrl`
- `xPostUrl`
- `createdAt`
- `updatedAt`
- `publishedAt`

Recommended project statuses:

- `draft`
- `published`
- `archived`

Recommended categories:

- `mobile`
- `web`
- `ai-tool`
- `client-work`
- `community`
- `experiment`

## Data Model

Minimum tables:

- `projects`
- `project_images`
- `profile_settings`
- `contact_messages`

Public site data flow:

- Public pages read only published projects.
- Featured sections read published projects where `featured = true`, sorted by `priority`.
- Admin pages read all projects after authentication.
- Project images are stored in media storage and referenced by URL in the database.

## Design Direction

Avoid generic portfolio templates. The site should feel like a working builder's operating room: dark, sharp, editorial, and product-focused.

Visual direction:

- Dark base with off-white text.
- Accent colors should not be dominated by purple.
- Use a mixed palette: electric green, red/orange highlights, steel gray, and controlled cyan accents.
- Strong typography with a display face for hero headings and a readable sans for body text.
- Use project screenshots, UI crops, terminal-style elements, and content metrics as real artifacts.
- Avoid fake dashboards, decorative orbs, stock-like visuals, and overly generic gradients.

Motion:

- Subtle page-load reveal.
- Staggered project cards.
- Hover states on project cards and admin controls.
- No excessive animation that hurts readability.

Responsive behavior:

- Mobile-first.
- Hero must show the next section hint on mobile and desktop.
- Project cards must remain readable on small screens.
- Admin forms must be usable on mobile but optimized for desktop editing.

## SEO and Portfolio Protection

SEO targets:

- Full-stack developer.
- AI developer.
- React Native developer.
- Next.js developer.
- Web developer Nigeria.
- AI-powered web and mobile applications.

Protect the idea:

- Keep FilmSort implementation details high-level.
- Do not publish private prompts, exact filename parsing rules, internal sync logic, or monetization specifics.
- Use case-study framing: problem, role, stack, challenges, results.
- Keep private repos private unless a project is intentionally open source.
- Show screenshots and outcomes instead of exposing the full codebase.

## Vercel Deployment Plan

1. Create a fresh standalone Next.js repo for the portfolio.
2. Add environment variables for database, auth, storage, and contact form.
3. Connect the repo to Vercel.
4. Configure preview and production deployments.
5. Add custom domain when ready.
6. Enable Vercel Analytics.
7. Verify metadata, Open Graph image, sitemap, and robots file.

Required environment variables will depend on the chosen services, but likely include:

- `NEXT_PUBLIC_SITE_URL`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`
- `AUTH_SECRET`
- `CONTACT_TO_EMAIL`

## Test Plan

Public site:

- Home page loads on mobile and desktop.
- Hero CTAs navigate correctly.
- Published projects render in the correct order.
- Draft and archived projects do not appear publicly.
- Project links open correctly.
- Contact form validates required fields.
- SEO metadata and Open Graph previews render correctly.

Admin:

- Unauthenticated users cannot access `/admin`.
- Authenticated admin can create a project.
- Admin can upload and replace a cover image.
- Admin can publish, unpublish, archive, and reorder projects.
- Public site updates after admin changes.
- Invalid slugs, missing titles, and missing summaries show clear validation errors.

Deployment:

- Vercel preview build succeeds.
- Production build succeeds.
- Environment variables are configured.
- Database migrations or setup scripts are documented.

## Implementation Phases

### Phase 1: Foundation

- Scaffold standalone Next.js project.
- Add styling system and base layout.
- Build static homepage with hardcoded initial content.
- Add responsive public sections.

### Phase 2: Content System

- Add database schema.
- Seed initial projects.
- Replace hardcoded project data with database reads.
- Add image storage.

### Phase 3: Admin

- Add authentication.
- Build project list, create, edit, upload, and publish flows.
- Add validation and preview states.

### Phase 4: Production Polish

- Add SEO metadata, sitemap, robots, Open Graph image, analytics, and contact form.
- Test mobile and desktop.
- Deploy to Vercel.

## Open Inputs Needed From Timmy

Before implementation, collect:

- Preferred domain name.
- Public email address.
- GitHub profile URL.
- LinkedIn URL if available.
- X profile URL.
- Profile photo or preferred avatar.
- Screenshots or demo clips for FilmSort, SHAZAM, CineVault, Buildoors, and client work.
- Links for live demos, GitHub repos, or private-demo-only projects.
- Whether client work can be named or should stay anonymized.
- Whether the admin should use Supabase login, Clerk login, or simple password protection for v1.

## Default Decisions

- Build as a fresh standalone Next.js repo.
- Deploy with Vercel.
- Use AI web development as the main portfolio angle.
- Make FilmSort the flagship case study.
- Use custom admin plus database instead of Markdown-only project content.
- Keep sensitive project details private and present public-facing case studies.
