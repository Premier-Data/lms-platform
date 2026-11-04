# Premier Data Training Platform — Technical Architecture & Engineering Case Study

**Product:** Premier Data Training & Learning (LMS)
**Live:** training.premierdata-technology.com
**Repository:** alphahawk01/lms-platform
**Status:** Production, single-organisation deployment (multi-tenant SaaS on the roadmap)

---

## 1. Executive Summary

Premier Data Training is a production learning-management system (LMS) purpose-built
for onboarding and continuously assessing sports-video analysts. It delivers
structured courses (modules → lessons → pages/blocks), image/video-rich content,
quizzes with automated grading, learning paths with sequential gating, learner
progress reporting, real-time chat, and an in-app notification system. It runs as
an installable Progressive Web App (PWA) so learners can use it like a native
mobile app.

The platform is a **server-rendered Next.js application** deployed on **Vercel**,
backed by **Supabase** (Postgres, Auth, Realtime, Storage) for structured data and
identity, and **Cloudflare R2** for large binary assets (videos, chat files).
Transactional email is handled by **Resend**.

The engineering emphasis throughout has been: ship a correct, secure, low-cost
product on managed infrastructure, with a schema and boundary design that can
graduate to a multi-tenant commercial SaaS without a rewrite.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.3.2 (App Router, Turbopack) | Server Components for data-heavy admin pages; API routes for privileged server logic; single deployable. |
| Language | TypeScript 5 (strict) | Type safety across the client/server boundary. |
| UI | React 19, Tailwind CSS 4 | Utility-first styling, consistent design tokens (`pd-red`, `pd-navy`). |
| Icons | lucide-react | Lightweight, tree-shakeable icon set. |
| Rich text | TipTap 3 (StarterKit + extensions) | Lesson content authoring (headings, color, alignment, links, highlight). |
| Identity & DB | Supabase (Postgres + Auth + Realtime) | Managed Postgres with row-level security, built-in auth, realtime subscriptions. |
| Large file storage | Cloudflare R2 (S3-compatible) via AWS SDK v3 | Zero egress fees, presigned direct-to-storage uploads for large videos. |
| Email | Resend | Invitations, password resets, notifications. |
| Hosting | Vercel | Git-push deploys, edge network, serverless functions, Analytics + Speed Insights. |

**Notable stack decisions**

- **Next.js 16 "proxy" convention.** Next 16 renamed the `middleware` file to
  `proxy.ts`. The session-refresh logic lives there and runs on the Node.js
  runtime.
- **No client-side state library.** Server Components fetch data directly;
  interactive islands are client components with local `useState`/`useMemo`.
  This keeps the bundle small and avoids cache-invalidation complexity.
- **No heavyweight component kit.** UI is hand-built with Tailwind for full
  control and a consistent brand.

---

## 3. High-Level Architecture

```
                          ┌───────────────────────────────────────┐
                          │              Browser / PWA             │
                          │  React 19 client islands, TipTap,      │
                          │  Supabase JS client (realtime + auth)  │
                          └───────────────┬───────────────────────┘
                                          │ HTTPS
                          ┌───────────────▼───────────────────────┐
                          │            Vercel (Next.js 16)         │
                          │                                        │
                          │  proxy.ts  ── session refresh + route  │
                          │             guard on every request     │
                          │                                        │
                          │  Server Components ── data fetch (RLS) │
                          │  Route Handlers   ── privileged ops    │
                          │                      (service role)    │
                          └───┬───────────────┬───────────────┬────┘
                              │               │               │
              ┌───────────────▼──┐   ┌────────▼───────┐  ┌────▼──────────┐
              │    Supabase      │   │  Cloudflare R2 │  │    Resend     │
              │  Postgres + RLS  │   │  (S3 API)      │  │  (email)      │
              │  Auth (JWT)      │   │  videos, chat  │  │  invites,     │
              │  Realtime (chat) │   │  files         │  │  resets       │
              │  Storage (images)│   └────────────────┘  └───────────────┘
              └──────────────────┘
```

**Two distinct data-access paths** (a core security principle):

1. **User-scoped path** — Server Components and most Route Handlers use the
   request's Supabase session (anon/publishable key). All access is enforced by
   Postgres **Row-Level Security (RLS)**. A user can only read/write what their
   JWT permits.
2. **Privileged path** — A small set of Route Handlers use the **service-role
   key** (`createAdminClient()`), which bypasses RLS. These are used only for
   genuine admin operations (listing all auth users, inviting/deleting users,
   cross-user reporting, provisioning) and **always** verify the caller's admin
   role in-code before proceeding.

The service-role key is never imported into any client component and never sent
to the browser.

---

## 4. Directory Structure

```
lms-platform/
├── app/
│   ├── layout.tsx              # Root layout: fonts, PWA metadata, Analytics
│   ├── manifest.ts             # PWA manifest (installable app)
│   ├── page.tsx                # Landing / redirect
│   ├── login/ forgot-password/ reset-password/   # Auth flows (public)
│   ├── auth/                   # Supabase auth callback + confirm
│   ├── (app)/                  # Authenticated app shell (route group)
│   │   ├── layout.tsx          # Sidebar + top bar shell
│   │   ├── dashboard/          # Learner dashboard
│   │   ├── courses/            # Learner: My Learning + course viewer
│   │   ├── messages/           # Chat
│   │   ├── account/            # Profile / account settings
│   │   └── admin/              # Admin area
│   │       ├── courses/        # Course Builder (+ [id], lessons, archived)
│   │       ├── allocations/    # Course assignment ("Courses")
│   │       ├── learning-paths/ # Sequenced course groups
│   │       ├── people/         # User management
│   │       ├── gallery/        # File browser (Explorer-style)
│   │       └── reports/        # Analytics dashboards
│   └── api/                    # Route Handlers (server-only)
│       ├── admin/…             # Privileged admin operations
│       ├── conversations/…     # Chat REST
│       ├── notifications/      # In-app notifications
│       ├── provision/          # User provisioning
│       ├── upload-video/       # R2 presigned upload (large)
│       └── upload-file/        # R2 presigned upload (chat/docs)
├── components/                 # Client component library (24 components)
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser client (publishable key)
│   │   ├── server.ts           # Server component client (cookies)
│   │   └── admin.ts            # Service-role client (privileged, server-only)
│   ├── storage.ts              # Storage usage/limit helper
│   ├── notifications.ts        # Notification helpers
│   └── create-notification.ts  # Bulk notification insert
├── supabase/migrations/        # Schema reference docs (001–003)
├── proxy.ts                    # Session refresh + auth route guard
├── next.config.ts
└── tsconfig.json               # @/* path alias → repo root
```

**Route groups.** The `(app)` group applies the authenticated shell (sidebar +
top bar) to everything inside it without adding a URL segment. Auth pages sit
outside it so they render without the shell.

---

## 5. Authentication & Session Management

### 5.1 Identity

Supabase Auth issues JWTs. Roles are stored in a dedicated `user_roles` table
(`learner`, `admin`, `super_admin`) rather than JWT claims, so a role change
takes effect immediately without re-issuing tokens.

### 5.2 Session refresh (`proxy.ts`)

The single most important reliability fix in the platform. Supabase access
tokens are short-lived; Server Components **cannot reliably write cookies**, so
without a refresh layer users get logged out mid-session even with a valid
refresh token. `proxy.ts`:

- Runs on every matched request (Node.js runtime).
- Creates a server Supabase client wired to read/write request cookies.
- Calls `getUser()` (never inserting code between client creation and this call,
  per Supabase guidance) to refresh the session and re-write cookies.
- Uses a **400-day cookie max-age** so installed PWAs keep users signed in across
  full app restarts — a deliberate mobile-app-like experience.
- Redirects unauthenticated users away from protected pages; API routes are
  excluded from the matcher and enforce their own auth.

### 5.3 Authorisation

- **Page/route protection:** handled by `proxy.ts` for page routes.
- **API authorisation:** each privileged Route Handler independently verifies the
  caller with a `verifyAdmin()` pattern — fetch the caller's roles, confirm
  `admin`/`super_admin`, else return 403.
- **Data authorisation:** RLS in Postgres is the real enforcement boundary for
  user-scoped reads/writes.

---

## 6. Data Model (Postgres / Supabase)

Tables in active use (derived from the codebase):

**Identity & org**
- `profiles` — `id`, `full_name`, `avatar_url`, `location`, timestamps
- `user_roles` — `user_id`, `role`

**Courses & content**
- `courses` — `id`, `title`, `description`, `status` (draft/published/archived), `thumbnail_url`
- `modules` — `course_id`, `title`, `description`, `position`
- `lessons` — `module_id`, `title`, `lesson_type`, `position`, `video_url`, `image_url`, `content`
- `lesson_pages` — `lesson_id`, `title`, `position`
- `lesson_blocks` — `page_id`, `lesson_id`, `block_type` (heading/text/image/video), `content` (jsonb), `position`
- `course_categories` + `course_category_links` — many-to-many categorisation

**Quizzes**
- `quiz_config` — per-lesson settings (pass mark, time limit, attempts, randomise, intro/end slides)
- `quiz_questions` — `lesson_id`, `question_text`, `question_type`, `media_url/type`, `points`, `explanation`, `position`
- `quiz_options` — `question_id`, `content`, `is_correct`, `image_url`, `position`
- `quiz_attempts` — score, max_score, percentage, passed, timing
- `quiz_answers` — per-question correctness for analytics

**Assignment & progress**
- `course_assignments` — `course_id`, `user_id`, `status`, `assigned_at`, `completed_at`
- `learning_paths`, `learning_path_courses` (ordered), `learning_path_assignments`

**Communication**
- `conversations` (direct/group), `conversation_members` (+ `last_read_at`), `messages`
- `notifications` — `user_id`, `title`, `message`, `link`, `read`, `created_at`

**Storage governance**
- `files` — registry of uploaded assets (name, url, r2_key, type, size, uploader)
- `storage_settings` — single-row org storage limit (`limit_bytes`)

### 6.1 Schema migration reality

This Supabase project's SQL Editor lacks table-owner privileges (`must be owner
of table`), so DDL is applied via the **Supabase Table Editor UI**. The
`supabase/migrations/*.sql` files therefore serve as **reference documentation +
intended DDL** rather than an automated migration runner. Each documents the
exact column to add (e.g. `003_profile_location.sql` → `profiles.location text`).
This is a pragmatic constraint of the hosting tier, documented so a fresh
environment can be reconstructed.

### 6.2 Cascading deletes

The tree relies on `ON DELETE CASCADE` FKs: deleting a course removes its
modules → lessons → blocks/pages/quizzes; deleting a module or lesson cascades to
its children. UI delete actions delete only the top row and trust the cascade.

---

## 7. Content Architecture: Courses → Modules → Lessons → Pages → Blocks

Course content is a five-level tree that gives authors flexibility while keeping
the learner experience linear:

```
Course
 └── Module (ordered)
      └── Lesson (ordered)   [text | video | quiz | assessment]
           └── Page (ordered)
                └── Block (ordered)  [heading | text | image | video]
```

- **Course Builder** (Server Component page) renders the tree; interactive
  islands (`module-lessons`, `module-menu`, `lesson-menu`) handle drag-to-reorder,
  rename, edit, and delete.
- **Lesson editor** is a client component managing pages + blocks in local state.
  On save it **replaces** the lesson's pages and blocks transactionally (delete
  then re-insert in array order), which makes reordering trivial and avoids
  per-row position churn. A live preview pane mirrors the learner view.
- **Ordering** is a `position` integer. Drag-and-drop uses native HTML5 DnD (no
  external library); the lesson-in-module reorder persists each row's new
  position, while page/block reorder persists on save via array order.

### 7.1 Publish gating

Any structural edit (add/rename/reorder/delete a module or lesson, edit a quiz)
calls `POST /api/admin/unpublish-on-edit`, which walks the lesson/module → course
relationship and flips a published course back to `draft`. This prevents learners
from seeing half-edited content and forces an explicit re-publish.

---

## 8. Assessments (Quizzes)

- **Authoring** (`quiz-editor`): single/multiple choice and short answer,
  per-question media (image or video), **image-based answer options**, points,
  and a per-question feedback message. Quiz-level config: pass mark, timer, max
  attempts, question randomisation, and custom intro/end slides.
- **Taking** (`quiz-taker`): renders questions, enforces the timer, records each
  answer's correctness, computes score/percentage/pass, and writes a
  `quiz_attempts` row plus `quiz_answers` rows.
- **Grading** is automatic for choice questions; short answers match against
  accepted correct values (case-insensitive, trimmed).
- **Persistence pattern:** the quiz API replaces a question's options on each save
  (delete + insert), consistent with the lesson editor's replace-on-save model.

---

## 9. File & Media Storage Strategy

Two storage backends are used deliberately by asset type:

| Asset | Backend | Why |
|---|---|---|
| Lesson images | Supabase Storage (`lesson-images` bucket) | Small, benefits from Supabase's CDN + RLS; keyed `supabase:bucket/path`. |
| Videos, chat files, documents | Cloudflare R2 (S3 API) | Large; R2 has **zero egress fees** and supports presigned direct uploads. |

### 9.1 Presigned direct-to-R2 uploads

Large videos never pass through the Vercel function (which has a ~4.5 MB body
limit and short timeouts). Instead:

1. Client requests a presigned `PutObject` URL from `POST /api/upload-video`
   (`{ fileName, fileType }`).
2. Server checks the storage quota, generates a unique key
   (`lesson-videos/<uuid>.<ext>`), and returns a 10-minute presigned URL plus the
   eventual public URL.
3. Client `PUT`s the file **directly to R2**, bypassing the serverless function
   entirely.
4. The public URL is stored on the content record and registered in `files`.

A legacy multipart path remains for small files.

### 9.2 Storage governance

- Every registered upload adds a `files` row (size tracked).
- `storage_settings.limit_bytes` defines the org quota (default 2 GB, admin-
  editable in the Gallery UI, per-plan/fixed in the future commercial model).
- Uploads are blocked with HTTP `507` when the quota is exceeded.
- The **Gallery** is a Windows-Explorer-style browser: List (sortable
  Name/Type/Date/Size) and Gallery (thumbnail) views, in-line preview
  (image/video/PDF), and a **delete-with-usage-check** that scans courses,
  lessons, quizzes, and chat for references before allowing deletion — including
  correctly matching `lesson_blocks.content` (a jsonb column, matched in JS since
  `ilike` can't operate on jsonb).

---

## 10. Real-Time Chat

- **Model:** `conversations` (direct or group) with `conversation_members`
  (tracking `last_read_at`) and `messages`.
- **Rules:** learners can start direct chats with a chosen admin and attach files;
  only admins create group conversations.
- **Realtime:** Supabase Realtime subscriptions push new messages live.
- **Unread + notifications:** unread counts drive a Messages badge; each new
  message creates a single bell notification per conversation (deleted and
  recreated to avoid stacking), keeping course/admin alerts and message alerts
  visually distinct.

---

## 11. Notifications

- In-app **bell** for course allocations and admin events, plus a separate
  **Messages** unread badge.
- `notifications` table read via `GET /api/notifications`; mark-one / mark-all
  read via `POST`.
- Bulk fan-out (e.g. "course allocated to N learners") is a single batched insert
  in `lib/create-notification.ts`.
- Optional email via Resend for high-signal events.

---

## 12. Learning Paths & Assignment

- **Course assignment:** individual (`course_assignments`) for one-off courses.
- **Learning paths:** ordered course groups (`learning_path_courses.position`)
  with **sequential gating** — a learner cannot access the next course until the
  previous is complete. Path assignments render every path course (upcoming /
  locked / in-progress), not just individually assigned ones.
- This dual model (a required main path plus one-off allocations) is the
  foundation for role/plan-based curricula in the commercial version.

---

## 13. Reporting & Analytics

The Reports page is a Server Component that fetches users, courses, assignments,
quiz attempts/answers/questions, and category links **in parallel** (`Promise.all`)
and computes:

- **Overview KPIs** — users, courses, completion rate, avg quiz score, pass rate.
- **User Progress** — per-learner assigned/completed/in-progress/avg score
  (client table: search, multi-key sort, scrollable).
- **Course Performance** — per-course assignment funnel, completion %, avg days to
  complete, and **category** (client table: search, status + category filter,
  sort, scrollable).
- **Quiz analytics** — attempts, unique users, avg score, pass rate, avg time.
- **Question accuracy** — hardest / easiest questions by correctness.

Data-heavy computation runs on the server; only the interactive
sort/filter/scroll layer is a client island — a recurring pattern that keeps
payloads small.

---

## 14. Progressive Web App (PWA)

- `manifest.ts` defines the installable app (icons, theme, display mode).
- A **splash screen** shows on mobile load; desktop shows the app icon while
  loading.
- The 400-day session cookie means reopening the installed app goes straight to
  the dashboard rather than the login screen.
- Updates ship via normal deploys — no app-store round-trip, no reinstall.

---

## 15. Deployment & Environments

- **Hosting:** Vercel, deploying on push to `main`. Build = `next build`
  (Turbopack).
- **Analytics:** Vercel Analytics + Speed Insights.
- **Secrets** (Vercel env + local `.env.local`): Supabase URL + publishable key +
  **service role key** (server-only), R2 credentials (`R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`),
  Resend API key.
- **Custom domain:** training.premierdata-technology.com.

---

## 16. Security Model (Summary)

1. **RLS-first data access** for all user-scoped reads/writes.
2. **Service-role key is server-only**, never in a client bundle, and every
   privileged endpoint re-verifies the caller's admin role in code.
3. **Presigned uploads** are short-lived (10 min) and scoped to a single key.
4. **Auth route guard** in `proxy.ts`; API routes self-enforce.
5. **Secrets in environment variables**, never committed.
6. **Publish gating** prevents leaking in-progress content to learners.
7. **Destructive actions** (deletes) are confirmed in the UI and scoped by
   usage-checks where references may exist.

---

## 17. Notable Engineering Decisions & Trade-offs

- **jsonb content matching.** `lesson_blocks.content` is `jsonb`. A gallery
  usage-check bug (files reported "not used" when they were) traced to `ilike`
  being invalid on jsonb. Fix: fetch candidate blocks and match in JS. Lesson:
  know your column types before choosing an operator.
- **Global session refresh over per-page checks.** Centralising refresh in
  `proxy.ts` fixed random logouts and enabled durable PWA sessions.
- **Replace-on-save for trees.** Lessons (pages+blocks) and quiz options are
  fully replaced on save. Simpler and less bug-prone than diffing positions, at
  the cost of a few extra writes on save — an acceptable trade for authoring
  tools.
- **Native drag-and-drop.** Avoided a DnD dependency for simple list reordering
  to keep the bundle lean.
- **Rule-based, not LLM, insights** (in the analyst-comparison tooling that later
  moved to the reporting-ui project). Deterministic, zero per-request cost, no
  key management — with a clean path to add generative narrative later.
- **Two storage backends.** Images on Supabase Storage (small, CDN, RLS); videos
  and chat files on R2 (large, zero egress). Cost- and performance-driven.

---

## 18. Scalability & The Path to Multi-Tenant SaaS

Today the platform is a **single-organisation** deployment with a single shared
storage pool and one `storage_settings` row. The design was chosen to make the
commercial, multi-tenant version an evolution rather than a rewrite:

- **Introduce an `organisations` table** and add `org_id` to the tenant-scoped
  tables (profiles, courses, files, conversations, notifications, assignments).
- **Extend RLS policies** to filter by the caller's `org_id`, giving hard tenant
  isolation at the database layer — the security model is already RLS-first, so
  this is additive.
- **Per-plan storage limits.** `storage_settings` becomes per-org (or a column on
  `organisations`), and the limit is derived from the price plan rather than a
  free-form admin field. The admin "edit limit" control becomes owner/super-admin
  only.
- **Org-scoped storage prefixes** in R2 (`<org_id>/lesson-videos/...`) for clean
  isolation and per-tenant usage accounting.
- **Role model already separates** `learner` / `admin` / `super_admin`, ready to
  layer org-scoped admin vs. platform super-admin.

The current boundaries — RLS enforcement, a thin privileged API surface, a file
registry with quota governance, and role-based access — are exactly the seams a
multi-tenant SaaS needs.

---

## 19. Repository Facts (Quick Reference)

- **App routes (authenticated):** dashboard, courses (viewer), messages, account,
  and admin (courses/builder, allocations, learning-paths, people, gallery,
  reports).
- **API route handlers:** ~23, split between privileged `admin/*` operations and
  user-scoped `conversations/*`, `notifications`, `provision`, and the two upload
  endpoints.
- **Client component library:** 24 components (course builder, lesson/quiz
  editors, chat, tables, uploaders, menus, splash, sidebar, etc.).
- **Supabase access clients:** `client.ts` (browser), `server.ts` (server
  components), `admin.ts` (service role, server-only).
- **Migrations documented:** course categories (001), quiz option images (002),
  profile location (003).

---

*This document reflects the platform as implemented in the `lms-platform`
repository and is intended as an engineering case study of a production LMS built
on managed infrastructure with a deliberate path to commercial multi-tenancy.*
