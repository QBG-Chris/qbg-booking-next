# BlendIQ Booking — Next.js

This is the standalone Next.js + shadcn/ui booking project. It was copied from the Next.js migration in the sibling `qbg-booking` Flutter project and runs independently of that project.

## Run locally

Requires Node.js **22+** and npm. Dependencies are pinned in `package-lock.json`.

```sh
cd /Users/dev/Documents/GitHub/qbg-booking-nextjs
npm ci
# Only when .env.local is missing:
cp .env.example .env.local
```

The existing `.env.local` configuration was copied with this project. For a fresh checkout, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using your Supabase project’s API settings. Use the anonymous/publishable client key for the `NEXT_PUBLIC_` setting. Existing Supabase row-level security policies continue to apply to bookings. Optional photo uploads also need the server-only key described below.

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000).

For an isolated preview without database access:

```sh
npm run dev:demo
```

Enter **jane-doe**, or open [/jane-doe](http://localhost:3000/jane-doe). The demo uses the Flutter test profile and services. Requests return a sample confirmation and never write to Supabase. A banner identifies demo mode. Restart after changing environment settings; `NEXT_PUBLIC_` values are also embedded at build time.

## Features and routes

| Route                                                  | Behavior                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `/`                                                    | Manual stylist lookup. `/?slug=jane-doe` redirects to the profile.                                                       |
| `/:slug`                                               | Stylist profile, bio, avatar, phone, email, and location.                                                                |
| `/book/:slug`                                          | Service → date and time → client details → review.                                                                       |
| `/book/:slug/confirmation`                             | Request receipt, including a short booking reference.                                                                    |
| `GET /api/stylists/:slug/availability?date=YYYY-MM-DD` | Busy start/end times only; no client contact details.                                                                    |
| `POST /api/bookings`                                   | Validates details and consent, resolves the stylist's active service, rechecks availability, and inserts an appointment. |
| `POST /api/bookings/:id/images`                        | Attaches one validated photo using the appointment-scoped upload token issued with a new booking.                        |

The interface uses official shadcn/ui components (Base UI), Tailwind CSS 4, and the existing warm BlendIQ color palette. It follows the system theme, provides a theme toggle, and adapts the appointment overview and sticky action bar for smaller screens. Keyboard-accessible native radio inputs select services and times.

Details remain intact when moving between steps. Required fields are first name, last name, email, and a 10-digit US phone number. Phone numbers format as you type, with an optional `+1` country code; submissions still use national digits. Notes are optional; explicit SMS consent is required before sending. Failed availability checks block progression and offer retry. Failed submissions retain the request for retry. Confirmation data is stored in this tab's `sessionStorage` so refresh works; opening a confirmation in another browser/tab offers a path to start booking.

## Optional appointment photos

The details step includes optional **Inspo photo** and **Selfie** uploads with drag and drop, keyboard-accessible file selection, previews, replacement, and removal. Either, both, or neither can be attached. JPG, PNG, and WebP files up to **4 MB each** are supported; HEIC must be converted first. Selected files stay in memory when moving between steps, and appear on review. They upload only after the appointment is requested.

Selfies offer **Choose file** and **Take photo**. The camera option requests the front-facing camera, shows a live preview, and saves a captured photo as JPG. Cancelling keeps any previously selected selfie. Camera tracks stop when capturing, cancelling, or leaving the details step, including when a pending permission request resolves after leaving. [Browser camera access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) requires permission and HTTPS (or localhost); unavailable or blocked cameras offer file selection instead.

Before enabling live uploads:

1. Run `supabase/migrations/202610190001_request_images.sql` in your Supabase SQL editor (or apply it through your migration workflow). It creates/configures the **private** `RequestImages` bucket and its MIME/size restrictions. If the bucket already exists, it makes it private; review any existing consumers that rely on public URLs first.
2. Set `SUPABASE_SECRET_KEY` in `.env.local` and the deployed server environment. A legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. Never prefix this key with `NEXT_PUBLIC_`. The privileged client is confined to the server-only photo module; appointment queries continue using the existing public key.
3. Keep `RequestImages` free of public/anonymous read or write policies, including broad existing policies on `storage.objects`. A private bucket still permits access through matching RLS policies. For stylist access, use an authenticated policy scoped to appointment ownership, or authorize the stylist on a server and generate a short-lived signed download URL. This booking app does not expose a public photo-reading endpoint.

To troubleshoot **“Photo uploads are unavailable right now”**, run:

```sh
npm run check:uploads
```

This read-only check loads the same `.env*` files as Next.js and checks the server key, bucket visibility, file size limit, and supported formats. It never prints keys, uploads photos, or creates appointments. That error appears before an appointment is inserted; the Next.js terminal also records the storage check that failed.

If the key is missing, open your project's **Settings → API Keys** in Supabase and copy a secret key into `.env.local` as `SUPABASE_SECRET_KEY=sb_secret_...`. The existing anonymous/public key cannot replace it. Restart Next.js after changing the environment. For a deployment, set the same server-only variable in the hosting environment and redeploy. If the bucket is missing or has incompatible settings, apply the SQL migration above to the same Supabase project, then run the check again. A passing check confirms configuration access; an actual photo upload still needs to be verified.

Objects are organized as `RequestImages/<appointment-id>/inspo/<upload-id>.jpg` and `RequestImages/<appointment-id>/selfie/<upload-id>.jpg` (or `.png`/`.webp`). Supabase creates these virtual folders from the paths. The appointment ID links the photos to the existing appointment without extra appointment columns; list the appointment's `inspo` and `selfie` prefixes to find them. The receipt stores bucket-relative paths, never public URLs or expiring download URLs. Object metadata also records `appointment_id` and `kind`. Original filenames are not included in storage paths.

The booking endpoint checks storage configuration before creating an appointment with photos. It issues a signed upload token valid for one hour, restricted to that appointment and the selected photo kinds and formats. The photo endpoint checks the token, request size, MIME type, and file signature. Stable object paths make upload retries safe. If an upload fails, review explains that the appointment is already requested and offers **Retry photos** or **Continue without remaining photos**; retrying never inserts another appointment, and already attached photos are retained. The receipt is saved as soon as the booking succeeds. Selected files and upload permission are not persisted across page reloads; opening the confirmation page still shows the saved booking and successfully attached photos.

Demo mode exercises the same selection, validation, authorization, retry, and confirmation flow without storing photos or appointments. Live storage needs the setup above and is not exercised by local tests. See [Supabase bucket privacy](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [server API keys](https://supabase.com/docs/guides/api/api-keys).

## Data compatibility

The repository uses the existing `BookingProfiles`, `BookingServices`, `Availability`, and `Appointments` tables. IDs returned as numbers are normalized to strings. Availability uses the existing Monday=0 through Sunday=6 convention. Cancelled appointments do not block slots.

The insert keeps the original column contract: `stylist_slug`, `services`, `client_name`, `client_email`, `client_phone`, `appointment_date`, `appointment_start_time`, `appointment_end_time`, `notes`, `status`, `price`, and `is_online_booking`. Requests use `requested` status, national phone digits, local `YYYY-MM-DD` dates, and 24-hour times. Service price, duration, and name are resolved on the server.

The `Appointments` primary key is `appointment_id`. The repository returns it as `id` in the booking receipt and uses that same value for photo paths and upload permission. Insert failures log their database code and HTTP status in the Next.js terminal without client details.

Availability now excludes any overlap with an existing appointment and requires the entire service to fit within a working window. Times retain the original browser-local interpretation; the request includes the browser's IANA time zone so same-day server validation uses the same clock. The source schema has no stylist time-zone field. Supporting clients and stylists in different time zones would require that schema/product decision.

The server rechecks availability before insertion. Preventing simultaneous requests from claiming the same time requires a database constraint or transactional RPC; this migration does not change the existing database schema. It also preserves the existing SMS consent UI and appointment insert, without introducing a separate SMS delivery service or consent column.

## Structure

- `src/app/`: App Router pages, loading/error screens, and API routes.
- `src/components/booking/`: Booking steps and request orchestration.
- `src/components/ui/`: Components generated by the official shadcn CLI.
- `src/lib/models.ts`: Shared data types and runtime schemas.
- `src/lib/booking.ts`: Validation, date/time handling, availability, and insert mapping.
- `src/lib/server/repository.ts`: Server-only Supabase access and isolated demo adapter.
- `tests/unit/`: Domain and API regression checks using mocked repositories.
- `tests/e2e/`: Chrome checks using demo data, including mobile/desktop and both themes.

Add UI components with the standard [shadcn CLI](https://ui.shadcn.com/docs/installation/next):

```sh
npx shadcn@latest add dialog
```

## Validate

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Google Chrome, start their own demo server on port **3100** with Webpack and isolated output under `.next/playwright/`, and stop it afterward. They never connect to the live database. Screenshots and traces are written to ignored `test-results/` folders. If Chrome is unavailable, install it or change the Playwright project to a locally installed browser.

`npm audit --omit=dev` reports no production dependency vulnerabilities at migration time. The full audit reports upstream `braces` advisories through the ESLint/shadcn development tools; compatible audit fixes do not currently resolve them. Avoid the suggested forced downgrades, which replace the selected framework tooling with incompatible older versions.

## Deploy

Deploy this directory as a separate Next.js application, using `npm ci`, `npm run build`, and `npm start`. Configure the Supabase environment variables and set `NEXT_PUBLIC_DEMO_MODE=false` **before building**. This app needs a Next.js server/runtime for its API routes; it is not a static Flutter/web export. The sibling Flutter project’s deployment configuration is separate. For Netlify, configure a new site with this project root as its base directory and the Next.js runtime.

No production database writes or deployment are required to validate the migration locally.
