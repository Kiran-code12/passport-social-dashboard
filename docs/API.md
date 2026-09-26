# API Reference

Base URL (production): `https://144-24-140-31.sslip.io`
Base URL (local development): `http://localhost:5000`

All endpoints are public — there is no authentication, API key, or session mechanism on this API.

All responses are JSON except the two export endpoints, which stream a file (CSV or PDF).

## Error handling

- Routes under `/api/posts` catch their own errors and return `500` inline with `{ success: false, message, error }`.
- `POST /api/translate` forwards errors to a global error handler (`server.js`), which returns `400` if the error message contains `"Cannot translate"`, `"Unsupported target language"`, `"Source language"`, or `"Text is required"` (validation-style failures), and `500` with a generic `"Internal server error"` message otherwise.
- Any unregistered route returns `404` with `{ "success": false, "message": "Route not found" }`.

---

## GET /api/health

Liveness check.

**Response `200`**
```json
{ "success": true, "message": "Passport Dashboard API is running" }
```

---

## GET /api/test-db

Diagnostic endpoint. Confirms the backend can reach Supabase by selecting one row's `id` from the `posts` table. Intended for manual verification, not for the dashboard itself to call.

**Response `200`**
```json
{ "success": true, "message": "Supabase connection is working", "data": [{ "id": "..." }] }
```

**Response `500`**
```json
{ "success": false, "message": "Database connection failed", "error": "<supabase error message>" }
```

---

## GET /api/posts

Returns posts where `is_relevant = true` and `is_gibberish = false`, with optional filtering and sorting.

**Query parameters** (all optional):

| Parameter | Type | Behavior |
|---|---|---|
| `platform` | string | Exact match, case-insensitive (`youtube`, `reddit`, `bluesky`) |
| `region` | string | Whitespace is stripped, then matched as a case-insensitive substring against the stored region value (e.g. `united states` → `UnitedStates`) |
| `creator` | string | Case-insensitive substring match against `creator_name` or `creator_handle` |
| `language` | string | Exact match against the stored language code (an ISO 639-3 code such as `eng`, `hin`) |
| `category` | string | Case-insensitive substring match |
| `sentiment` | string | Exact match: `Positive`, `Neutral`, or `Negative` |
| `from` | ISO date string | Only posts with `published_at >= from` |
| `to` | ISO date string | Only posts with `published_at <= to` |
| `last24h` | `"true"` | Overrides the above to `published_at >= (now - 24h)` |
| `minEngagement` | number | Only posts whose calculated engagement is at least this value |
| `sort` | `published_at` \| `created_at` \| `platform` \| `category` \| `engagement` | Defaults to `published_at`; any other value falls back to the default |
| `order` | `asc` \| `desc` | Defaults to `desc` |

Each returned post includes a computed `total_engagement` field (not a stored column): YouTube = `views + likes + comments`, Reddit = `score (or likes) + comments`, Bluesky = `likes + reposts + comments`.

**Response `200`**
```json
{
  "success": true,
  "count": 42,
  "filters": {
    "platform": null, "region": null, "creator": null, "language": null,
    "category": null, "sentiment": null, "minEngagement": null,
    "from": null, "to": null, "last24h": false,
    "sort": "published_at", "order": "desc"
  },
  "data": [ /* post rows, each with an added total_engagement field */ ]
}
```

**Example request**
```
GET /api/posts?platform=youtube&category=Renewal&sentiment=Positive&last24h=true&sort=engagement&order=desc
```

**Response `500`**
```json
{ "success": false, "message": "Failed to fetch posts", "error": "<error message>" }
```

---

## GET /api/posts/search

Keyword search across a post's original text, AI summary, and any saved translations. Fetches every relevant, non-gibberish post and filters in memory (this endpoint does not accept the filter parameters above).

**Query parameters**

| Parameter | Required | Behavior |
|---|---|---|
| `q` | Yes | Search term. Matched (case-insensitive) against `original_text`, `summary`, and every value in the `translations` object |

**Example request**
```
GET /api/posts/search?q=tatkal
```

**Response `200`**
```json
{ "success": true, "query": "tatkal", "count": 7, "data": [ /* matching post rows */ ] }
```

**Response `400`** — empty or missing `q`
```json
{ "success": false, "message": "Search query is required" }
```

**Response `500`**
```json
{ "success": false, "message": "Search failed", "error": "<error message>" }
```

---

## GET /api/posts/export/csv

Exports the filtered/searched/sorted result set as a CSV file. Accepts every filter parameter from `GET /api/posts`, plus an optional `q` (applies the same search matching as `/api/posts/search`).

**Query parameters**: same as `GET /api/posts`, plus optional `q`.

**Response `200`** — `Content-Type: text/csv`, `Content-Disposition: attachment; filename="passport-posts.csv"`. Columns: `platform, post_id, creator_name, creator_handle, original_text, post_url, published_at, language, region, category, sentiment, total_engagement, summary`.

**Response `500`**
```json
{ "success": false, "message": "CSV export failed", "error": "<error message>" }
```

---

## GET /api/posts/export/pdf

Exports the same filtered/searched/sorted result set as a PDF report (built with `pdfkit`). Same parameters as the CSV export.

**Response `200`** — `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="passport-posts.pdf"`. Contains a title, the total exported count, and one block per post (platform, creator, category, sentiment, total engagement, original text, summary, and source URL when present).

**Response `500`** — only if the PDF stream hasn't already started
```json
{ "success": false, "message": "PDF export failed", "error": "<error message>" }
```

---

## GET /api/translate/languages

Lists the target languages the backend can translate into.

**Response `200`**
```json
{
  "success": true,
  "languages": ["english", "hindi", "spanish", "french", "german", "arabic", "chinese", "russian", "japanese", "vietnamese", "indonesian", "punjabi"]
}
```

---

## POST /api/translate

Translates text into one of the supported target languages, on demand.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | Yes | The text to translate |
| `sourceLanguage` | string | No | An ISO 639-3 code, a common language name, or empty/omitted. If omitted, the source language is detected from the text |
| `targetLanguage` | string | Yes | One of the values returned by `GET /api/translate/languages` (case-insensitive) |
| `postId` | string | No | When provided, a successful translation is cached on that post's `translations` column; a repeat request for the same post and language is then served from the cache instantly |

**Example request**
```json
{
  "text": "How long does a Tatkal passport renewal take?",
  "sourceLanguage": "eng",
  "targetLanguage": "hindi",
  "postId": "4525c62b-1b83-40d1-b9f6-f674ebb23581"
}
```

**Behavior**: depending on the backend's `TRANSLATION_MODE` setting, translation runs either through local ONNX models (`local`, the default) or the MyMemory API (`remote`). Either way, if `postId` is given and a translation for that post/language already exists, it is returned immediately with `"method": "cached"` and no new translation work is done.

**Response `200`**
```json
{
  "success": true,
  "sourceLanguage": "eng",
  "targetLanguage": "hindi",
  "originalText": "How long does a Tatkal passport renewal take?",
  "translatedText": "तत्काल पासपोर्ट रिन्यू में कितना समय लगता है?",
  "method": "cached | local_model | local_model_pivot_via_english | remote_mymemory | remote_libretranslate | no_translation_needed",
  "truncatedAt": null
}
```

`truncatedAt` reports the character offset if the input had to be truncated (512 characters) before translation; otherwise `null`.

**Response `400`** — missing/invalid `text`, invalid `sourceLanguage` type, missing `targetLanguage`, an unsupported `targetLanguage`, or a source language that couldn't be resolved
```json
{ "success": false, "error": "text is required and must be a string" }
```
or, for a server-detected translation failure routed through the global error handler:
```json
{ "success": false, "message": "Cannot translate: ..." }
```

**Response `500`** — an unexpected failure
```json
{ "success": false, "message": "Internal server error" }
```
