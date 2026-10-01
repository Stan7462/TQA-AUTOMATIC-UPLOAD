# TQA Automatic Upload

Production runs as one Coolify deployment with one SQLite database and captured photos in the persistent `/data` volume. Every company uses the same public domain. The submitted ID and PIN or password are matched together to determine the company, and every session, QC, staged photo, and integration key remains scoped to that company. A repeated technician ID is safe because the app issues a different PIN for that ID in every company and refuses any ambiguous login instead of selecting a company. A local preview can run at `http://127.0.0.1:3000` with its own data under `.tqa-data/`.

Share the same public root URL with admins and technicians. Technicians sign in with the Tech ID and private 5-digit PIN issued in Settings. A new company receives a one-time setup login; its supervisor then creates a globally unique Admin ID of at least four characters and a password of at least eight characters containing letters and numbers. The Admin ID opens the review workspace. Administrative pages and photos require the admin session. Technicians submit a job number, one saved account screenshot, and 3–7 live camera photos. The upload API also checks their PIN session and Tech ID. The technician profile shows rejected QCs and review notes. A browser page cannot prove a camera image came from a live scene against a modified client.

On **Approved / reviewed**, the admin can download approved QCs for all time or one fiscal month. The ZIP opens into one `TQA-approved-QCs` folder, with a separate job-number folder for each QC. Inside are the original account screenshot and live JPG photos, named in capture order for manual upload to Catalyst. Repeated job numbers stay separate because each folder also includes the submission ID.

The Catalyst browser extension has the shared TQA production origin built in and asks only for the Admin ID and password. It exchanges them for a short lived session, discards the password, and loads only that admin's company QCs. One extension installation connects to one company at a time. Legacy integration keys can still be created and revoked in Settings.

Set `TQA_EXTENSION_STORE_URL` to the unlisted Chrome Web Store listing. Company setup messages link to `/extension`, which reads that variable at runtime and sends supervisors to the current store listing. Build the store upload ZIP with `pnpm extension:package`; the generated release file is intentionally not committed.

An unfinished QC is saved in the technician's browser storage after each screenshot or camera photo. The same Tech ID on the same phone and browser restores the job number, screenshot, photos, and submission ID when the link is reopened, including after an hour. The page shows when saving is complete and warns if the phone cannot store the draft. A successful submission clears the local draft. Private browsing or cleared site data can remove it.

Successfully submitted QCs and their JPG files are retained for at least three full calendar months from the submission timestamp. The production container checks for expired QCs at startup and every six hours, removes their individual files, and then removes their database records. Disabling a technician immediately revokes their sessions and prevents new submissions without deleting their submitted QCs; issuing a new PIN reactivates the same Tech ID and keeps any history still inside the retention period.

The six QCs, 27 photos, Tech 7462 account, and five blocked Tech IDs from the earlier Sites deployment were imported into the laptop. The old Sites version is kept intact as a fallback. Any new QC submitted to the old URL after the migration snapshot must be imported separately before retiring it.

## Local start and update

The user LaunchAgent `com.tqa.automatic-upload` starts the production server at login. Check it with `launchctl print gui/$(id -u)/com.tqa.automatic-upload`. After code changes, run `./.tqa-data/node ./node_modules/vinext/dist/cli.js build`, then `launchctl kickstart -k gui/$(id -u)/com.tqa.automatic-upload`. Startup runs `prisma migrate deploy` before opening the web server.

For laptop hosting, `TQA_PUBLIC_ORIGIN` can still be loaded from `.tqa-data/public-origin.txt`. Company selection happens after the complete ID and PIN/password pair has been verified.

Do not publish the local data directory or PINs. Back up `.tqa-data`, including the SQLite database, photos, and secrets, with Time Machine or an equivalent local backup. The PIN encryption key in the secrets file is required to display existing PINs in Settings.

## Coolify database migrations

Deploy the repository with its `Dockerfile`, expose port `3000`, and mount persistent storage at `/data`. Point `qc.leadtechx.com` at the Coolify service. The container runs `scripts/migrate.mjs` before starting Vinext, so every redeployment applies pending Prisma migrations to `/data/tqa.sqlite`. Add customer companies from the owner-only **Companies** settings tab; its Tenant ID is generated internally and no additional DNS is needed.

Example (enter it as one line in Coolify):

```json
[{"id":"default","name":"LeadTechX","adminTechId":"1111","adminPin":"74621"}]
```

`TQA_TENANTS_JSON` creates or updates the platform owner account. Keep the primary company on tenant ID `default` so its admin can open the **Companies** settings tab. Administrator IDs and credentials must be unique across the complete app. Technician IDs may repeat in different companies; each company receives a distinct PIN and the ID plus PIN identifies the company. Keep this variable secret because it contains the owner PIN. Set `TQA_PLATFORM_TENANT_ID` only if the company allowed to manage other companies uses a different ID. The older `TQA_ADMIN_TECH_ID`, `TQA_ADMIN_PIN`, `TQA_TENANT_ID`, and `TQA_TENANT_NAME` variables remain supported for a single tenant deployment. `TQA_TENANT_DOMAINS` is accepted for backward compatibility but is no longer used for tenant selection.

The first Prisma migration is a full baseline. A new empty volume receives the complete schema. An existing TQA database is verified and marked with that baseline without recreating its tables or deleting data. If an existing database does not match the expected baseline, startup stops instead of applying an unsafe partial migration.

For a future schema change, update `prisma/schema.prisma`, run `npm run db:generate -- --name descriptive_change`, review the generated SQL under `prisma/migrations`, and commit it. Coolify will run the committed migration during its next deployment. Back up the `/data` volume before deploying schema changes.
