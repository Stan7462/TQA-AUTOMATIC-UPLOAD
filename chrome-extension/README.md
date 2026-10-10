# TQA Catalyst Uploader

Unpacked Chrome Manifest V3 extension for the [Trust extension API](../docs/trust-extension-api.md).

## Install and use

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `chrome-extension` folder.
2. Stay signed in to Catalyst QMS through the Comcast VPN. Open the extension popup and enter the supervisor's Admin ID and password. While signed out, the popup shows only this connection form. The extension connects to the built-in shared TQA app at `https://qc.leadtechx.com`. The server verifies the complete credential pair and returns a session scoped to exactly that company. The password is discarded after sign in; the extension stores a 12-hour session for one company at a time.
3. After a successful sign in, the upload controls, sliders, queue, and activity log appear. Choose the wait between successful QC uploads with the first slider: 5, 15, 30, 60, 90, or 120 seconds. Choose the Ride Along percentage with the second slider, from 0% to 100% in 10% steps. The saved default is 50%. Click **Refresh queue** to see passing observations, failed observations, and approved correction follow-ups, then **Start upload**. The extension randomly selects the requested share of new observations as Ride Along and uses After the Fact for the rest. It opens a dedicated Catalyst tab and processes one QC at a time. Keep Chrome and the VPN open.

The extension searches by job number, requires exactly one row with both the same job number and Tech ID, and verifies those identifiers again on the observation page. Passing observations select **Displayed** for every TQA check. Failed observations select **Not Displayed** for the supervisor's exact TQA categories, choose the saved Additional Information reasons, and add the supervisor comment. Correction follow-ups reopen the linked failed observation, select **Complete**, upload the corrected pictures one at a time, select **Issues Corrected**, add **Issues are fixed.**, and save. It waits for **Observation Saved** before reporting `uploaded` to TQA.

The popup's **Activity log** keeps the latest 200 timestamped steps, including Catalyst page responses, API errors, and navigation timeouts. Use **Copy log** to share the exact diagnostic text. The admin password, session token, and image bytes are never written to this log. Disconnect to discard the current session and connect another supervisor. Reload the unpacked extension in `chrome://extensions` after changing its files.

No match or multiple matches are reported as failed for manual review. If any photos may have reached Catalyst but completion is uncertain, the run stops with **needs review**. Inspect that Catalyst observation. If it fully completed, click **Confirm already uploaded** to report success to TQA. If it did not complete, remove any partial upload before clicking **Retry after cleanup**. A Chrome restart during a run also requires review.

This extension has not been run against a live Catalyst upload during development. Verify one approved QC end to end before running a large queue; Catalyst may change its page structure or upload confirmation UI.

Version 0.7.1 refreshes the queue after successful uploads and picks up newly unlocked approved Fix follow-ups during the same run. Technicians can redo before the first Fail uploads. Only the first Fail and final approved Fix are sent; rejected intermediate attempts remain in TQA history. Reload or update the extension to use this behavior.
