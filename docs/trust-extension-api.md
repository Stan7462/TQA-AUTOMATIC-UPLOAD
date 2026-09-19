# TQA Automatic Upload → Trust extension API

Version: 1 (2026-09-18)

Base URL: `https://YOUR-TQA-HOST.example`

This document is the contract for a separate browser extension that uploads approved TQA QCs into Trust. The API runs on the owner's Mac. Trust login and Trust page automation belong to the extension; this API does not log into Trust or send files to Trust itself.

## Required extension workflow

1. The owner signs into Trust in the browser, opens the extension, and supplies a TQA API key generated in **TQA → Settings → Trust extension API**. Treat the key as a secret. The TQA admin Tech ID/PIN is never used by the extension.
2. On opening, call `GET /api/integrations/trust/qcs` and display the `qcs` list. Only approved QCs with `uploadStatus` `ready` or `failed` appear by default. Follow `nextCursor` for more pages.
3. On **Start**, process QCs one at a time. Before each QC, call `GET /api/integrations/trust/qcs/{id}` to recheck its status. Fetch every photo with the same bearer key, then upload the screenshot and live photos to the correct Trust job. Show progress in the extension (e.g., 2 of 6 photos and 3 of 10 QCs). The server does not track percentage.
4. Confirm that Trust saved **all** required photos for that QC. Only then call `PATCH /api/integrations/trust/qcs/{id}/upload` with `{"status":"uploaded"}`. If Trust returns a job or upload ID, include it as `externalReference`.
5. Remove that QC from the visible extension queue after the API confirms `uploadStatus: "uploaded"`. Refresh the list to reconcile. If Trust upload fails, report `failed` with a short error; it remains available for retry.
6. A network failure after Trust succeeds but before the TQA PATCH response is ambiguous. Check the QC detail first. If it is still `ready` or `failed`, verify the photos in Trust before retrying the upload. The PATCH is idempotent, but uploading to Trust might not be.

Run one uploader at a time for this key. The API does not reserve QCs or prevent two extension instances from uploading the same job concurrently.

## Authentication and transport

All `/api/integrations/trust/qcs...` and `/api/integrations/trust/photos...` endpoints require:

```http
Authorization: Bearer tqa_trust_<64 lowercase hex characters>
```

The API key is created and revoked from the TQA admin Settings page. It is shown **once** on creation, stored as a SHA-256 hash on the server, and can be revoked. A key permits reading approved QC metadata and images and reporting Trust upload results. It does not permit approving/rejecting QCs, managing technicians, or creating keys. Use HTTPS. Never put the key in a URL, log, Trust page DOM, or content-script message visible to the page. Keep network calls and key storage in the extension background service worker. For Chrome Manifest V3, grant host permission for `https://YOUR-TQA-HOST.example/*`; fetch from the background context, and use a content script only for interaction with Trust.

Image `url` values are **protected API URLs**, not public links. Fetch each with `Authorization`, read the JPEG bytes as a `Blob`, then make a `File` for the Trust file input or upload flow. An ordinary `<img src="...">` request will not include the bearer key.

JSON responses use `Cache-Control: private, no-store`. Times are ISO 8601 UTC. IDs are opaque; use the QC `id` to report a result, never the job number (which may repeat).

## Data and status model

- `reviewStatus`: `approved` for all QCs returned by this integration API. Pending and rejected QCs are inaccessible here.
- `uploadStatus`: `ready` (approved and never reported), `failed` (last Trust attempt failed; retryable), or `uploaded` (Trust upload confirmed; omitted from the default list).
- A QC remains **Approved** in TQA after it becomes **Uploaded** to Trust. These are separate states.
- On first approval, the Trust upload state defaults to `ready`. Existing approved QCs also start as `ready` when this API is installed.
- `photos[0]` is the account screenshot, followed by live QC photos in capture order. All are JPEGs. Do not assume every QC has the same count.

## Endpoints

### List uploadable QCs

```http
GET /api/integrations/trust/qcs?uploadStatus=uploadable&limit=50
Authorization: Bearer <key>
```

`uploadStatus` is optional: `uploadable` (default, `ready` + `failed`), `uploaded`, or `all`. `limit` defaults to 50 and accepts 1–100. To paginate, pass the exact `nextCursor` as the `cursor` query parameter until it is `null`. Results are sorted by approval time, then QC ID, oldest first. `total` counts matching approved QCs across all pages at the time of the request. The queue may change while paging; deduplicate by QC ID.

```json
{
  "qcs": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "jobNumber": "EXAMPLE-JOB-001",
      "techId": "EXAMPLE-TECH",
      "reviewStatus": "approved",
      "uploadStatus": "ready",
      "submittedAt": "2026-09-18T15:02:08.000Z",
      "approvedAt": "2026-09-18T15:10:00.000Z",
      "uploadedAt": null,
      "externalReference": null,
      "lastUploadError": null,
      "uploadAttempts": 0,
      "photos": [
        { "id": "0000000000001-00000000-0000-4000-8000-000000000002.jpg", "kind": "account_screenshot", "order": 0, "contentType": "image/jpeg", "url": "https://YOUR-TQA-HOST.example/api/integrations/trust/photos/0000000000001-00000000-0000-4000-8000-000000000002.jpg" },
        { "id": "0000000000002-00000000-0000-4000-8000-000000000003.jpg", "kind": "live_photo", "order": 1, "contentType": "image/jpeg", "url": "https://YOUR-TQA-HOST.example/api/integrations/trust/photos/0000000000002-00000000-0000-4000-8000-000000000003.jpg" }
      ]
    }
  ],
  "nextCursor": null,
  "total": 1
}
```

### Get one QC (including an uploaded QC)

```http
GET /api/integrations/trust/qcs/{id}
Authorization: Bearer <key>
```

Response `200`: `{ "qc": <QC object in list response> }`. This works for `ready`, `failed`, and `uploaded`, as long as review status is Approved. Missing or non-approved QC: `404`.

### Download one protected photo

```http
GET /api/integrations/trust/photos/{photoId}
Authorization: Bearer <key>
```

Response `200`: raw `image/jpeg` bytes. A photo is available through this API only while it belongs to an Approved QC. Return `404` for an unknown, missing, or non-approved photo. Use the returned bytes in the Trust upload process; do not scrape TQA's admin UI.

### Report upload result

```http
PATCH /api/integrations/trust/qcs/{id}/upload
Authorization: Bearer <key>
Content-Type: application/json

{"status":"uploaded","externalReference":"optional Trust job or upload ID"}
```

`externalReference` is optional, 1–200 characters if supplied. Mark `uploaded` only after confirming the complete set of images reached the correct Trust job. TQA sets `uploadedAt` using server time and increments `uploadAttempts`. A repeated `uploaded` PATCH returns `200` with `alreadyUploaded: true` and does not change the original timestamp/reference.

For a failed attempt:

```http
PATCH /api/integrations/trust/qcs/{id}/upload
Authorization: Bearer <key>
Content-Type: application/json

{"status":"failed","errorMessage":"Trust rejected the third photo"}
```

`errorMessage` is required, 1–500 characters. This sets `failed`, increments `uploadAttempts`, and leaves the QC in the default queue. Never include secrets or personal customer data in this message. `uploaded` is terminal for the extension; `failed` after `uploaded` returns `409`.

Successful response `200`:

```json
{ "qc": { "id": "00000000-0000-4000-8000-000000000001", "uploadStatus": "uploaded", "uploadedAt": "2026-09-18T15:20:00.000Z", "photos": [] }, "alreadyUploaded": false }
```

The example above abbreviates the QC object; actual responses contain all fields shown in the list response, including its full photo array. The request body must be JSON and at most 4 KB.

## Admin key management (TQA website only)

These routes use the owner's existing TQA session cookie, **not** the extension bearer key. Mutations require the TQA site origin. The extension should not call them.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/integrations/trust/keys` | List active key metadata only; never returns secrets. |
| `POST` | `/api/integrations/trust/keys` | Create a key with JSON `{ "label": "Trust browser extension" }`; returns `{ "key": {...}, "token": "..." }` once. |
| `DELETE` | `/api/integrations/trust/keys/{id}` | Revoke a key immediately. |

The Settings page provides these controls; use it rather than making raw admin API calls.

## Errors and retry policy

Integration API errors use the shape:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "API key is invalid or revoked." } }
```

| HTTP | Codes | Extension action |
| --- | --- | --- |
| `400` | `INVALID_FILTER`, `INVALID_LIMIT`, `INVALID_CURSOR`, `INVALID_JSON`, `INVALID_BODY`, `INVALID_STATUS`, `INVALID_REFERENCE`, `INVALID_ERROR` | Fix the request; do not retry unchanged. |
| `401` | `UNAUTHORIZED` | Prompt owner to enter a valid key; stop uploads. |
| `404` | `NOT_FOUND`, `PHOTO_MISSING` | Skip this QC and alert owner; refresh queue. |
| `409` | `QC_NOT_APPROVED`, `ALREADY_UPLOADED` | Refresh QC detail/queue; do not upload it again. |
| `413` | `BODY_TOO_LARGE` | Shorten JSON body. |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Send `Content-Type: application/json`. |
| `503` | `UNAVAILABLE` | Retry with exponential backoff; keep local progress. |

For timeouts, connection loss, and other 5xx errors, retry with backoff. Do not mark a QC Uploaded locally until the API confirms it. If the upload to Trust itself has an uncertain outcome, inspect Trust before retrying to avoid duplicate photos. The owner's Mac and Tailscale Funnel must be online for the API to be reachable.

## Acceptance checks for the extension agent

- With a valid key, opening the extension shows approved `ready` and `failed` QCs with job number, Tech ID, and photo count; pending, rejected, and uploaded QCs do not appear.
- The extension downloads every listed JPEG through bearer-authenticated background requests and uploads all images to the selected Trust job.
- The progress bar advances through individual photos and QCs and reports errors without claiming success.
- After Trust confirms a QC, PATCH returns `uploaded`; reopening the extension no longer lists it.
- A failed upload remains available for retry; a repeated uploaded PATCH is safe; revoked/invalid keys stop the workflow.
