# QC push notifications

## Local preview

Visit `/notifications` while signed in as a technician or supervisor. Supervisor
Settings → Technicians has a separate “Notify when QC uploaded” switch for each
technician. A completed submission for approval triggers that alert, including
a fixed submission. This switch belongs to the signed-in supervisor.

Supervisor-only general alert preferences are in the Monthly QC goal panel.
They apply to all technicians in that company. Technicians only connect their
device; they cannot select individual alert types. Each technician row has a
Notification settings button for that supervisor's upload monitoring switch.

Local HTTP previews support preference editing but do not register devices with
the production OneSignal app or send notifications.

## Production setup

1. In OneSignal, configure Web Push with **Custom Code Setup** and the exact
   HTTPS site origin, currently `https://qc.leadtechx.com`. Disable automatic
   permission prompts; the app provides its own Enable notifications button.
2. Set these server environment variables in Coolify:
   - `ONESIGNAL_APP_ID`: the OneSignal app ID.
   - `ONESIGNAL_API_KEY`: the app REST API key; server only, never a public variable.
   - `TQA_PUBLIC_URL`: the HTTPS origin for notification links.
   - `TQA_PUSH_ENABLED=1`: enables delivery after deployment.
3. Deploy normally. The migration adds account preferences, supervisor watches,
   and a durable delivery queue. The container starts a worker every 15 seconds;
   network requests are asynchronous and do not hold database transactions.
4. On iPhone with iOS 16.4 or newer, add the app to Home Screen using Safari,
   open it from that icon, sign in, and visit Notification settings. Tap Enable
   notifications, then Allow. Supervisors also enable individual technician watches.
5. Test with one consenting technician and supervisor: submit, reject, fix, and
   verify alert delivery and links. Phone delivery has not yet been verified locally.

The root service worker is `/OneSignalSDKWorker.js`. If another service worker
is introduced, avoid overlapping its scope with the OneSignal worker.

## Timing and separation

- Upload alerts: new completed QC submissions after the supervisor enabled watching.
- Rejection: starts with the existing 72-hour correction deadline.
- Approaching deadline: one alert when 24 hours or less remain.
- Overdue: one alert when the correction deadline expires.
- Monthly goal: one reminder in the final three days of the fiscal month, only
  when approved QCs are below the technician's effective individual/company goal.
- Fiscal month follows the Chicago calendar, from the 22nd through the 21st.
- Fixing a QC cancels queued correction reminders. A fresh rejection starts a
  new correction cycle. Previous fiscal-month QCs do not trigger current alerts.
- All watches, preferences, and recipients are company scoped. Opaque recipient
  IDs separate accounts even when companies share the same technician ID.
- Delivery uses stable provider idempotency IDs, bounded retries, and expiry to
  avoid duplicate or stale alerts. Disabled accounts/companies are skipped.

Delivery depends on the user's permission, phone settings, network, and the push
provider. QC submissions remain independent of notification delivery.

The ignored `.tqa-data/onesignal.json` can supply appId/apiKey locally. Production
should use the environment variables above. Never commit that file or the key.

Reference: https://documentation.onesignal.com/docs/web-sdk-reference
