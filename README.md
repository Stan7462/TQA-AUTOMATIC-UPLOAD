# TQA Automatic Upload

Production runs as one Coolify deployment with one SQLite database and captured photos in the persistent `/data` volume. Each hostname maps to a tenant, and every technician, session, QC, staged photo, and integration key is scoped to that tenant. A local preview can run at `http://127.0.0.1:3000` with its own data under `.tqa-data/`.

Share the same public root URL with admins and technicians. It opens one sign-in form for Tech ID and the private 5-digit PIN issued in Settings. The admin Tech ID opens the review workspace; all other active Tech IDs open `/capture` for QC submission. Administrative pages and photos require the admin Tech ID session. Technicians submit a job number, one saved account screenshot, and 3–7 live camera photos. The upload API also checks their PIN session and Tech ID. The technician profile shows rejected QCs and review notes. A browser page cannot prove a camera image came from a live scene against a modified client.

On **Approved / reviewed**, the admin can download approved QCs for all time or one fiscal month. The ZIP opens into one `TQA-approved-QCs` folder, with a separate job-number folder for each QC. Inside are the original account screenshot and live JPG photos, named in capture order for manual upload to Catalyst. Repeated job numbers stay separate because each folder also includes the submission ID.

The Catalyst browser extension asks for the tenant domain, admin Tech ID, and 5-digit PIN. It exchanges them for a short lived session, discards the PIN, and loads only that tenant's approved QCs. One extension installation connects to one tenant at a time. Legacy integration keys can still be created and revoked in Settings.

An unfinished QC is saved in the technician's browser storage after each screenshot or camera photo. The same Tech ID on the same phone and browser restores the job number, screenshot, photos, and submission ID when the link is reopened, including after an hour. The page shows when saving is complete and warns if the phone cannot store the draft. A successful submission clears the local draft. Private browsing or cleared site data can remove it.

Successfully submitted QCs and their JPG files are retained for at least three full calendar months from the submission timestamp. The production container checks for expired QCs at startup and every six hours, removes their individual files, and then removes their database records. Disabling a technician immediately revokes their sessions and prevents new submissions without deleting their submitted QCs; issuing a new PIN reactivates the same Tech ID and keeps any history still inside the retention period.

The six QCs, 27 photos, Tech 7462 account, and five blocked Tech IDs from the earlier Sites deployment were imported into the laptop. The old Sites version is kept intact as a fallback. Any new QC submitted to the old URL after the migration snapshot must be imported separately before retiring it.

## Local start and update

The user LaunchAgent `com.tqa.automatic-upload` starts the production server at login. Check it with `launchctl print gui/$(id -u)/com.tqa.automatic-upload`. After code changes, run `./.tqa-data/node ./node_modules/vinext/dist/cli.js build`, then `launchctl kickstart -k gui/$(id -u)/com.tqa.automatic-upload`. Startup runs `prisma migrate deploy` before opening the web server.

For laptop hosting, `TQA_PUBLIC_ORIGIN` can still be loaded from `.tqa-data/public-origin.txt`. Tenant selection itself uses the incoming hostname.

Do not publish the local data directory or PINs. Back up `.tqa-data`, including the SQLite database, photos, and secrets, with Time Machine or an equivalent local backup. The PIN encryption key in the secrets file is required to display existing PINs in Settings.

## Coolify database migrations

Deploy the repository with its `Dockerfile`, expose port `3000`, and mount persistent storage at `/data`. Point every tenant domain at the same Coolify service and set `TQA_TENANTS_JSON` to the complete tenant list. The container runs `scripts/migrate.mjs` before starting Vinext, so every redeployment applies pending Prisma migrations to `/data/tqa.sqlite`.

Example (enter it as one line in Coolify):

```json
[{"id":"leadtechx","name":"LeadTechX","domains":["qc.leadtechx.com"],"adminTechId":"1111","adminPin":"74621"},{"id":"second-team","name":"Second Team","domains":["qc.second-company.com"],"adminTechId":"2222","adminPin":"12345"}]
```

`TQA_TENANTS_JSON` creates or updates the tenants it lists without deleting tenants created later in Settings. Tenant IDs should stay unchanged. Domains can be changed or moved between tenants. Keep this variable secret because it contains admin PINs. Set `TQA_PLATFORM_TENANT_ID` only if the company allowed to manage other companies is not `default`. The older `TQA_ADMIN_TECH_ID`, `TQA_ADMIN_PIN`, `TQA_TENANT_ID`, `TQA_TENANT_NAME`, and `TQA_TENANT_DOMAINS` variables remain supported for a single tenant deployment.

The first Prisma migration is a full baseline. A new empty volume receives the complete schema. An existing TQA database is verified and marked with that baseline without recreating its tables or deleting data. If an existing database does not match the expected baseline, startup stops instead of applying an unsafe partial migration.

For a future schema change, update `prisma/schema.prisma`, run `npm run db:generate -- --name descriptive_change`, review the generated SQL under `prisma/migrations`, and commit it. Coolify will run the committed migration during its next deployment. Back up the `/data` volume before deploying schema changes.
