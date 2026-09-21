# TQA Automatic Upload

Production runs in Coolify at `https://qc.leadtechx.com` and keeps the SQLite database and captured photos in the persistent `/data` volume. A local preview can run at `http://127.0.0.1:3000` with its own data under `.tqa-data/`.

Share the same public root URL with admins and technicians. It opens one sign-in form for Tech ID and the private 5-digit PIN issued in Settings. The admin Tech ID opens the review workspace; all other active Tech IDs open `/capture` for QC submission. Administrative pages and photos require the admin Tech ID session. Technicians submit a job number, one saved account screenshot, and 3–7 live camera photos. The upload API also checks their PIN session and Tech ID. The technician profile shows rejected QCs and review notes. A browser page cannot prove a camera image came from a live scene against a modified client.

On **Approved / reviewed**, the admin can download approved QCs for all time or one fiscal month. The ZIP opens into one `TQA-approved-QCs` folder, with a separate job-number folder for each QC. Inside are the original account screenshot and live JPG photos, named in capture order for manual upload to Catalyst. Repeated job numbers stay separate because each folder also includes the submission ID.

For the planned Trust browser extension, the owner can create or revoke a dedicated API key in Settings. The API settings section also displays and copies the full [Trust extension API documentation](docs/trust-extension-api.md). It covers the approved QC queue, protected photo downloads, upload-result reporting, and errors. Trust upload status is separate from QC approval.

An unfinished QC is saved in the technician's browser storage after each screenshot or camera photo. The same Tech ID on the same phone and browser restores the job number, screenshot, photos, and submission ID when the link is reopened, including after an hour. The page shows when saving is complete and warns if the phone cannot store the draft. A successful submission clears the local draft. Private browsing or cleared site data can remove it.

The six QCs, 27 photos, Tech 7462 account, and five blocked Tech IDs from the earlier Sites deployment were imported into the laptop. The old Sites version is kept intact as a fallback. Any new QC submitted to the old URL after the migration snapshot must be imported separately before retiring it.

## Local start and update

The user LaunchAgent `com.tqa.automatic-upload` starts the production server at login. Check it with `launchctl print gui/$(id -u)/com.tqa.automatic-upload`. After code changes, run `./.tqa-data/node ./node_modules/vinext/dist/cli.js build`, then `launchctl kickstart -k gui/$(id -u)/com.tqa.automatic-upload`. Startup runs `prisma migrate deploy` before opening the web server.

For laptop hosting, `TQA_PUBLIC_ORIGIN` can be loaded from `.tqa-data/public-origin.txt`. For Coolify, set it to `https://qc.leadtechx.com` in the application environment. This keeps upload, sign-in, and API photo URLs on the public HTTPS origin.

Do not publish the local data directory or PINs. Back up `.tqa-data`, including the SQLite database, photos, and secrets, with Time Machine or an equivalent local backup. The PIN encryption key in the secrets file is required to display existing PINs in Settings.

## Coolify database migrations

Deploy the repository with its `Dockerfile`, expose port `3000`, and mount persistent storage at `/data`. Set `TQA_PUBLIC_ORIGIN` to the public HTTPS origin. The container runs `scripts/migrate.mjs` before starting Vinext, so every redeployment applies pending Prisma migrations to `/data/tqa.sqlite`.

The first Prisma migration is a full baseline. A new empty volume receives the complete schema. An existing TQA database is verified and marked with that baseline without recreating its tables or deleting data. If an existing database does not match the expected baseline, startup stops instead of applying an unsafe partial migration.

For a future schema change, update `prisma/schema.prisma`, run `npm run db:generate -- --name descriptive_change`, review the generated SQL under `prisma/migrations`, and commit it. Coolify will run the committed migration during its next deployment. Back up the `/data` volume before deploying schema changes.
