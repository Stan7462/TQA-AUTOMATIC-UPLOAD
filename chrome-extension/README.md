# TQA Catalyst Uploader

Unpacked Chrome Manifest V3 extension for the [Trust extension API](../docs/trust-extension-api.md).

## Install and use

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `chrome-extension` folder.
2. Stay signed in to Catalyst QMS through the Comcast VPN. Open the extension popup, paste the TQA API key, and click **Save**. The key is held in Chrome extension storage and is never placed in source code or the Catalyst page.
3. Click **Refresh queue** to see approved `ready` and `failed` QCs, then **Start upload**. The extension opens a dedicated Catalyst tab and processes one QC at a time. Keep Chrome and the VPN open.

The extension searches by job number, requires exactly one row with both the same job number and Tech ID, and verifies those identifiers again on the observation page. It selects **After the Fact**, **No** for Customer Contact, uploads the account screenshot and each live photo one at a time, selects **Displayed** for every TQA check, and clicks **Complete → OK**. It waits for **Observation Saved** before reporting `uploaded` to the TQA API. The popup shows QC and photo progress.

The popup's **Activity log** keeps the latest 200 timestamped steps, including Catalyst page responses, API errors, and navigation timeouts. Use **Copy log** to share the exact diagnostic text. The API key and image bytes are never written to this log. Reload the unpacked extension in `chrome://extensions` after changing its files.

No match or multiple matches are reported as failed for manual review. If any photos may have reached Catalyst but completion is uncertain, the run stops with **needs review**. Inspect that Catalyst observation. If it fully completed, click **Confirm already uploaded** to report success to TQA. If it did not complete, remove any partial upload before clicking **Retry after cleanup**. A Chrome restart during a run also requires review.

This extension has not been run against a live Catalyst upload during development. Verify one approved QC end to end before running a large queue; Catalyst may change its page structure or upload confirmation UI.
