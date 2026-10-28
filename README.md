# TQA Automatic Upload

Production runs as one Coolify deployment. When `DATABASE_URL` is set, records use PostgreSQL; captured photos and application encryption secrets stay in the persistent `/data` volume. Without `DATABASE_URL`, the local preview uses SQLite. Every company uses the same public domain. The submitted ID and PIN or password are matched together to determine the company, and every session, QC, staged photo, and integration key remains scoped to that company. A repeated technician ID is safe because the app issues a different PIN for that ID in every company and refuses any ambiguous login instead of selecting a company. A local preview can run at `http://127.0.0.1:3000` with its own data under `.tqa-data/`.

Share the same public root URL with admins and technicians. Technicians sign in with the Tech ID and private 5-digit PIN issued in Settings. A new company receives a one-time setup login; its supervisor then creates a globally unique Admin ID of at least four characters and a password of at least eight characters containing letters and numbers. The Admin ID opens the review workspace. Administrative pages and photos require the admin session. Technicians submit a job number, one saved account screenshot, and 3–7 live camera photos. The upload API also checks their PIN session and Tech ID. The technician profile shows rejected QCs and review notes. A browser page cannot prove a camera image came from a live scene against a modified client.

On **Approved / reviewed**, the admin can download approved QCs for all time or one fiscal month. The ZIP opens into one `TQA-approved-QCs` folder, with a separate job-number folder for each QC. Inside are the original account screenshot and live JPG photos, named in capture order for manual upload to Catalyst. Repeated job numbers stay separate because each folder also includes the submission ID.

The Catalyst browser extension has the shared TQA production origin built in and asks only for the Admin ID and password. It exchanges them for a short lived session, discards the password, and loads only that admin's company QCs. One extension installation connects to one company at a time. Legacy integration keys can still be created and revoked in Settings.

Set `TQA_EXTENSION_STORE_URL` to the unlisted Chrome Web Store listing. Company setup messages link to `/extension`, which also offers the latest ZIP after supervisor sign-in. Supervisors can download it from **Settings → Catalyst uploads**. The authenticated download packages the extension source and manifest version from the running app, so deploying a new extension updates the download automatically. It requires no separately uploaded ZIP or system zip utility. Build the same store upload ZIP with `pnpm extension:package`; the generated release file is intentionally not committed.

An unfinished QC is saved in the technician's browser storage after each screenshot or camera photo. The same Tech ID on the same phone and browser restores the job number, screenshot, photos, and submission ID when the link is reopened, including after an hour. The page shows when saving is complete and warns if the phone cannot store the draft. A successful submission clears the local draft. Private browsing or cleared site data can remove it.

Successfully submitted QCs and their JPG files are retained for at least three full calendar months from the submission timestamp. The production container checks for expired QCs at startup and every six hours, removes their individual files, and then removes their database records. Disabling a technician immediately revokes their sessions and prevents new submissions without deleting their submitted QCs; issuing a new PIN reactivates the same Tech ID and keeps any history still inside the retention period.

The six QCs, 27 photos, Tech 7462 account, and five blocked Tech IDs from the earlier Sites deployment were imported into the laptop. The old Sites version is kept intact as a fallback. Any new QC submitted to the old URL after the migration snapshot must be imported separately before retiring it.

## Local start and update

The user LaunchAgent `com.tqa.automatic-upload` starts the production server at login. Check it with `launchctl print gui/$(id -u)/com.tqa.automatic-upload`. After code changes, run `./.tqa-data/node ./node_modules/vinext/dist/cli.js build`, then `launchctl kickstart -k gui/$(id -u)/com.tqa.automatic-upload`. Startup runs `prisma migrate deploy` before opening the web server.

For laptop hosting, `TQA_PUBLIC_ORIGIN` can still be loaded from `.tqa-data/public-origin.txt`. Company selection happens after the complete ID and PIN/password pair has been verified.

Do not publish the local data directory or PINs. Back up `.tqa-data`, including the SQLite database, photos, and secrets, with Time Machine or an equivalent local backup. The PIN encryption key in the secrets file is required to display existing PINs in Settings.

## Coolify database migrations

Deploy the repository with its `Dockerfile`, expose port `3000`, and mount persistent storage at `/data`. Point `qc.leadtechx.com` at the Coolify service. The container runs `scripts/migrate.mjs` before starting Vinext, so every redeployment applies pending database migrations. Add customer companies from the separate **Super admin** dashboard at `/super-admin`; its Tenant ID is generated internally and no additional DNS is needed.

Example (enter it as one line in Coolify):

```json
[{"id":"default","name":"LeadTechX","adminTechId":"1111","adminPin":"74621"}]
```

`TQA_TENANTS_JSON` creates or updates company supervisor accounts. Keep the existing primary company on tenant ID `default` to preserve its data. Cross-company administration now requires the separate super admin login at `/super-admin`. Administrator IDs and credentials must be unique across the complete app. Technician IDs may repeat in different companies; each company receives a distinct PIN and the ID plus PIN identifies the company. Keep this variable secret because it contains the owner PIN. `TQA_PLATFORM_TENANT_ID` no longer grants cross-company access. The older `TQA_ADMIN_TECH_ID`, `TQA_ADMIN_PIN`, `TQA_TENANT_ID`, and `TQA_TENANT_NAME` variables remain supported for a single tenant deployment. `TQA_TENANT_DOMAINS` is accepted for backward compatibility but is no longer used for tenant selection.

The first Prisma migration is a full baseline. A new empty volume receives the complete schema. An existing TQA database is verified and marked with that baseline without recreating its tables or deleting data. If an existing database does not match the expected baseline, startup stops instead of applying an unsafe partial migration.

For a future schema change, update `prisma/schema.prisma`, run `npm run db:generate -- --name descriptive_change`, review the generated SQL under `prisma/migrations`, and commit it. Coolify will run the committed migration during its next deployment. Back up the `/data` volume before deploying schema changes.


## PostgreSQL migration and operation

Set `DATABASE_URL` as a runtime secret to the PostgreSQL service on the private Docker network. The web app, notification worker, and retention job all select the same backend. An unreachable PostgreSQL database fails startup rather than falling back to SQLite.

Before the first PostgreSQL deployment, stop the previous app container so no SQLite writes can occur during or after the snapshot. Back up the whole `/data` volume (including photos and `secrets.json`) outside that volume. Deploy the PostgreSQL-capable app only after that backup succeeds. Startup runs `scripts/migrate-postgres.mjs`: it refuses a nonempty destination, checks SQLite integrity and foreign keys, creates a private SQLite snapshot and secrets backup, imports all application tables in a single PostgreSQL transaction, and verifies row counts plus SHA-256 hashes of every column before committing. A version marker prevents importing stale SQLite data again on subsequent starts.

PostgreSQL schema SQL is in `postgres/migrations/0001_baseline.sql`; the existing Prisma and Drizzle SQLite history is retained for local previews. Do not use the SQLite `db:generate` workflow for PostgreSQL changes. Add reviewed, versioned PostgreSQL migrations and update the PostgreSQL runner for subsequent schema changes.

Existing passwords, PINs, sessions, correction deadlines, archived QC attempts, upload history, goals, and push subscriptions retain their values. Keep the original encryption secrets and picture volume attached. SQLite engine migration metadata remains available in the original backup; it is not needed by PostgreSQL.

Before PostgreSQL receives new writes, rollback can restart the previous SQLite app and original volume. After new PostgreSQL writes, do not restart a stale SQLite copy: restore or repair PostgreSQL, or explicitly migrate the newer data back first. Configure regular PostgreSQL backups and separate photo/secrets backups; the retained SQLite snapshot is only a cutover backup.

## Super admin platform

Set **runtime** environment variables in Coolify (keep both private; do not use `NEXT_PUBLIC_` or build arguments):

- `SUPER_LOGIN`: the owner's separate login, such as an email address.
- `SUPER_PASSWORD`: a strong password of at least 12 characters.

After deployment, use `/super-admin` on the same domain. These credentials are not technician PINs or company supervisor credentials. No super admin login is available until both variables are configured. Passwords are never returned by an API or stored in the browser. Rotating either variable invalidates existing super admin sessions. Sessions expire after eight hours; company dashboard access expires after 30 minutes. The separate super session leaves the existing technician/supervisor cookie unchanged.

The platform dashboard lists customer and demo companies, QC activity, enabled technicians, company setup state, manual subscription status, plan, contact email, renewal/trial end date, and internal notes. Recent administrative activity records sign-ins, company creation/changes, and company dashboard entry/exit. Company administration no longer appears in supervisor Settings and its APIs require the separate super session. One-time supervisor setup credentials are shown only immediately after company creation.

Subscription states are `trial`, `active`, `overdue`, `suspended`, and `cancelled`. Suspended/cancelled companies retain sign-in and viewing access; the submission API and Catalyst integration reject new uploads even for sessions issued before suspension. Dates are informational: subscription status changes are manual. Existing legacy-disabled companies remain disabled until their subscription is explicitly updated. Records are preserved when a company is cancelled.

Creating a demo provisions three sample technician accounts and six QCs with generic illustrated images. The dashboard shows temporary demo credentials after creation. Demo metrics are excluded from customer overview totals. Demo companies can never use the live Catalyst integration, even with valid supervisor credentials. No customer photos are copied and no notifications are sent while seeding demos.

## Optional Catalyst account screenshots

Supervisors can use **Settings → Catalyst uploads → Include account screenshots**. The company-wide setting defaults to on. Turning it off removes the account screenshot from the extension photo lists for passing observations, first failed observations, and approved correction follow-ups. Screenshots remain stored and visible in the app, and OCR is unchanged. Change the setting before starting uploads and refresh the extension queue; existing Catalyst pictures are not removed, and interrupted upload photo checks still prevent duplication.
