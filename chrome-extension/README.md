# TQA Catalyst Uploader

Unpacked Chrome Manifest V3 extension for the [Trust extension API](../docs/trust-extension-api.md).

## Install and use

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `chrome-extension` folder.
2. Stay signed in to Catalyst QMS through the Comcast VPN. Click the extension icon to open its persistent Chrome side panel and enter the supervisor's Admin ID and password. While signed out, the side panel shows only this connection form. The extension connects to the built-in shared TQA app at `https://qc.leadtechx.com`. The server verifies the complete credential pair and returns a session scoped to exactly that company. The password is discarded after sign in; the extension stores a 12-hour session for one company at a time.
3. After a successful sign in, the upload controls, sliders, queue, and activity log appear. Choose the wait between successful QC uploads with the first slider: 5, 15, 30, 60, 90, or 120 seconds. Choose the Ride Along percentage with the second slider, from 0% to 100% in 10% steps. The saved default is 50%. Click **Refresh queue** to see passing observations, failed observations, and approved correction follow-ups, then **Start upload**. The extension randomly selects the requested share of passing new observations as Ride Along and uses After the Fact for the rest. It opens a dedicated Catalyst tab and processes one QC at a time. Keep Chrome and the VPN open.

The extension searches by job number, requires exactly one row with both the same job number and Tech ID, and verifies those identifiers again on the observation page. Passing observations select **Displayed** for every TQA check. Failed observations select **Not Displayed** for the supervisor's exact TQA categories, choose the saved Additional Information reasons, and add the supervisor comment. Correction follow-ups reopen the linked failed observation, select **Complete**, upload the corrected pictures one at a time, select **Issues Corrected**, add **Issues are fixed.**, and save. It waits for **Observation Saved** before reporting `uploaded` to TQA.

The side panel remains open while Catalyst refreshes or navigates between jobs. Its **Activity log** keeps the latest 200 timestamped steps, including Catalyst page responses, API errors, and navigation timeouts. Use **Copy log** to share the exact diagnostic text. The admin password, session token, and image bytes are never written to this log. Disconnect to discard the current session and connect another supervisor. Reload the unpacked extension in `chrome://extensions` after changing its files.

No match or multiple matches are reported as failed for manual review. If any photos may have reached Catalyst but completion is uncertain, the run stops with **needs review**. Inspect that Catalyst observation. If it fully completed, click **Confirm already uploaded** to report success to TQA. If it did not complete, remove any partial upload before clicking **Retry after cleanup**. A Chrome restart during a run also requires review.

This extension has not been run against a live Catalyst upload during development. Verify one approved QC end to end before running a large queue; Catalyst may change its page structure or upload confirmation UI.

Version 0.7.1 refreshes the queue after successful uploads and picks up newly unlocked approved Fix follow-ups during the same run. Technicians can redo before the first Fail uploads. Only the first Fail and final approved Fix are sent; rejected intermediate attempts remain in TQA history. Reload or update the extension to use this behavior.


### Interrupted observation recovery (v0.7.5)
The extension saves the matched Catalyst job ID and confirmed photo identifiers locally before proceeding. Retrying a saved QC reopens that same job directly, even if it disappeared from Jobs Pool. **Resume saved progress** keeps confirmed photos; recovery skips them only when Catalyst's saved thumbnail identifiers exactly match the checkpoint. Missing, extra, or changed photos pause the run. Uncertain completion also requires review, rather than creating another observation.

**Retry after cleanup** resets the saved photo progress but retains the job ID. Use it only after removing the partial photos and verifying the observation is still incomplete. If photos remain, the next run pauses instead of duplicating them.

The legacy per-QC manual recovery buttons were removed in v0.7.19. Use the run-level review controls for interrupted uploads with saved progress. Failed QCs always use **After the Fact** and **Customer Contact: No**, including recovered observations. The reason dropdown uses a keyboard fallback if Catalyst ignores the mouse event and verifies the selected value before proceeding.

Recovery checkpoints belong to the local Chrome extension installation. Uninstalling it or clearing its storage removes them. Correction follow-ups still use the existing manual review protections after interruption.

Version 0.7.6 recognizes both single-value fields and multi-select reason tags. Recovery keeps an already selected failure reason, closes its menu, and continues to the remaining checks without selecting it again.

Version 0.7.7 waits until both Observer/Technician search controls have loaded, matches completed rows by exact job number and Tech ID, and saves confirmed completion separately from success reporting. If reporting fails after Catalyst saves, resuming retries only observation lookup/reporting, without uploading photos or completing a second observation. For earlier saved-but-unreported QCs, use **Confirm already uploaded** after reviewing the completed Catalyst record.

Version 0.7.8 introduced **Confirm already uploaded** on each observation queue card. Those per-QC buttons were removed in v0.7.19; confirmation remains available in the run-level needs-review controls.

### v0.7.9

Supports multiple selected rejection reasons within the same TQA category. All selected reasons are retained in Catalyst’s Additional Information field. Update the extension before uploading QCs with multiple reasons under one category.

### v0.7.10

Fixed correction follow-ups: select Status = Complete first, then wait for Catalyst to reveal Disposition before uploading corrected photos and saving Issues Corrected. Preparation has a longer command timeout to allow the conditional fields to load.

### v0.7.11

Fixed saved-correction reporting. Follow-ups are verified from persisted Complete / Issues Corrected fields, a completed work-log entry, and the expected corrected-photo count rather than an Observation Saved toast. Retrying an already saved correction reports success to TQA without uploading or saving again. Confirmed reporting progress is retained if the TQA API is temporarily unavailable. Existing photos in unfinished follow-ups cause a review stop instead of duplicate uploads.

### v0.7.12

Fixed delayed loading of completed follow-ups. Catalyst can render disabled Complete / Issues Corrected fields and the completed work log before the correction photos and file input. The extension now waits for the saved record and expected photo count rather than falling back to an editable Status field. Read-only verification no longer depends on the upload input being mounted.

### v0.7.13

Treats Catalyst's **Observation Saved** message as the successful upload confirmation for both passing and failed observations. A failed observation is reported to TQA and removed from the queue even when Catalyst cannot find the technician in its completed-observation name search. The extension still saves the Catalyst observation ID whenever that optional lookup succeeds.

### v0.7.14

Moves the uploader from Chrome's temporary toolbar popup into a persistent side panel. The panel stays open when Catalyst refreshes or navigates to another job and adapts to the panel width. Click the extension icon to open it.

### v0.7.15

Moves the wait-time and Ride Along percentage sliders into a compact **Settings** dropdown. The queue progress display now uses a thicker high-contrast bar with the current job, percentage, QC position, and photo position.

### v0.7.16

Collapses the Activity log into a compact row by default. The log count and dropdown arrow remain visible; opening the row reveals Copy log, Clear log, and the full timestamped history.

### v0.7.18

The Ride Along slider is a per-technician **fiscal-month target (22nd–21st)**, not a per-batch allocation. Before starting each new passing observation, the extension reads the company's confirmed monthly upload totals from TQA and chooses the type that gets that technician closest to the target. Original failed observations always use After the Fact and count in those totals. Corrected follow-ups update the original observation and do not count as another observation. Only confirmed uploads advance the totals; saved checkpoints retain their selected type through retries. The app stores the confirmed type so new batches and other connected supervisors use the same history.

Passing uploads made before type tracking was available have an unknown type. The log identifies these; their actual types need to be reconciled from Catalyst to include them in the balance. Types are never guessed. Odd totals or more failures than the selected target allows can prevent an exact split.

Deploy the app's observation-type migration and API before using this extension version.

### v0.7.20 — required updates

Every newly deployed extension version is mandatory. The panel displays an update banner with a link to the TQA download page, and Chrome's toolbar icon displays an UPD badge. Checks run when Chrome/the extension starts, when the panel opens, every five minutes, and at QC boundaries. New uploads require a verified matching server version. An in-progress QC finishes saving and reporting before the next QC is blocked. The app also rejects queue/detail requests from outdated clients, including older versions without a version header. Photo reads and reporting remain available so deployments do not interrupt current QC completion. Network/check failures block new QCs without discarding saved progress. Replace the extracted files and reload the extension to update; ZIP installations do not self-update.
