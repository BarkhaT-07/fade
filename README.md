# Fade

Fade is an account-free web app for sharing short, sensitive text through a
link that destroys itself. There are three ways to share:

1. **Quick note**: no password. Choose how many times it can be opened
   (1 to 10; 1 means burn after read) and an expiry of 24 to 72 hours.
2. **Password note**: same, but the recipient needs a password. Five wrong
   guesses destroy the note.
3. **Custom link**: you pick the link name (`/c/my-team-notes`). One link holds
   several separate notes, each with its own label, view count and expiry.
   Readers use a **viewer password**. You use a different **owner password** to
   view (without using a view), edit, add and delete notes. Notes that expire or are fully viewed show as ended in
   the list (their content is erased at once) and the entry disappears 3 days
   later.

Stack: Next.js 14 (TypeScript) for pages and API, Prisma + SQLite for storage,
AES-256-GCM for note content, bcrypt for passwords, no user accounts.

## Requirements

- Node.js 18.18 or newer (Node 20 LTS recommended)
- npm

## Setup

Use a fresh folder (do not unzip over an older copy of the project, the database
schema changed).

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` creates `.env` with a fresh `NOTE_KEY` (the key used to encrypt
notes), then creates the SQLite database. It will not overwrite an existing
`.env`. Open **http://localhost:3000**.

Manual version:

```bash
cp .env.example .env
# put a real key in NOTE_KEY:  openssl rand -hex 32
npx prisma migrate dev --name init
npm run dev
```

Never commit `.env` or `prisma/dev.db`. Both are in `.gitignore`.

## Project structure

```
app/
  page.tsx                          Home: tabs for the three modes
  NoteFields.tsx                    Shared form fields (text, views, expiry, label)
  ThemeToggle.tsx                   Light/dark toggle
  n/[id]/                           Recipient page for quick and password notes
  c/[slug]/                         Custom link page (unlock, list, reveal, manage)
  api/notes/route.ts                POST create a quick or password note
  api/notes/[id]/reveal/route.ts    POST reveal a note
  api/collections/route.ts          POST create a custom link with its first note
  api/collections/[slug]/open/      POST unlock and list notes (no content)
  api/collections/[slug]/password/  PATCH change viewer or owner password (owner)
  api/collections/[slug]/notes/     POST add a note (owner)
  api/collections/[slug]/notes/[noteId]/        PATCH edit, DELETE remove (owner)
  api/collections/[slug]/notes/[noteId]/preview/ POST owner reads a note for free
  api/collections/[slug]/notes/[noteId]/reveal/ POST reveal a note (viewer)
lib/
  notes.ts        Constants, view counting, ending notes, cleanup sweep
  collections.ts  Password check and lockout for custom links
  validate.ts     Input validation (slug, passwords, note fields)
  crypto.ts       AES-256-GCM helpers
  rateLimit.ts    Simple in-memory rate limiter
prisma/schema.prisma   Note and Collection tables
scripts/cleanup.js     Same cleanup as the sweep, for cron
instrumentation.ts     Runs the sweep every 15 minutes
```

## How it works

- **View counting is atomic.** A view is taken with a compare-and-swap on
  `viewCount`, so when several requests race for the last view only one wins.
  This also covers password notes (the old race window is gone).
- **Wrong passwords on a note**: the counter uses an atomic increment. After 5
  wrong guesses the note is destroyed.
- **Custom links lock instead of destroy.** After 5 wrong passwords the link
  is locked for 15 minutes. It is not destroyed, otherwise anyone could wipe
  someone's notes by guessing.
- **Standalone notes** are deleted the moment they end.
- **Notes in a custom link** are wiped (content set to empty) the moment they end
  and kept as a small record for 3 days so the list can show "Expired" or
  "Fully viewed". Labels are typed by the sender, stored encrypted, and never
  taken from the note text.
- **Empty custom links** are removed, which frees the link name.
- **Bots cannot burn a note by accident.** Opening `/n/[id]` only reads state.
  Only the Reveal button (a POST) takes a view.
- **Cleanup** runs every 15 minutes through `instrumentation.ts` (enabled in
  `next.config.js`), or with `npm run cleanup` from cron.

## Data model

| Table | Important fields |
|---|---|
| `Note` | `contentEncrypted`, `labelEncrypted`, `viewLimit`, `viewCount`, `passwordHash`, `failedAttempts`, `expiresAt`, `endedAt`, `endReason`, `collectionId` |
| `Collection` | `slug` (unique), `viewHash`, `ownerHash`, `failedAttempts`, `lockedUntil` |

## Rules worth knowing

- Passwords: 8 to 72 bytes (bcrypt only uses the first 72).
- Link names: 3 to 40 characters, lowercase letters, numbers and single hyphens.
  A few names are reserved (`api`, `n`, `c`, `admin`, and so on).
- The owner password must differ from the viewer password. The owner can view notes
  for free (no view is used), edit them while active, add and delete notes. The
  viewer can only read, and each read uses a view. Anyone holding the owner
  password can read active notes at any time, so keep it private.
- A custom link holds at most 20 notes at a time.
- There is no "forgot password" (no accounts or email to prove who you are).
  The owner can change either password while signed in. If the owner password is
  lost, the notes simply expire and the link name is freed. A one-time recovery
  code at creation would be a possible future addition.

## Known limitations (by design, for a mini project)

- **Rate limiting is in memory.** It resets on restart and is not shared between
  instances. The client address comes from `x-forwarded-for`, which can be
  spoofed unless a trusted proxy sets it. Without any proxy header, everyone
  shares one bucket.
- **Custom link passwords stay in the browser tab's memory** after unlocking and
  are sent with each request. Closing the tab forgets them.
- **A server-side encryption key** protects the database file at rest but not
  against someone who has both the database and `.env`.
- No file uploads, accounts or collaboration.

## License

MIT, see `LICENSE`.
