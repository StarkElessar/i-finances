# Receipt Pipeline: In-Process LiteLLM Processing Design

## Problem

The shipped receipt-import pipeline (upload → recognize → review → approve)
is architecturally complete but relies on pieces that don't hold up in
production:

- `scripts/receipt-claude-worker.ts` calls `claude -p` under a personal
  Claude Pro/Max subscription. Anthropic's terms prohibit routing an
  automated backend through subscription credentials — this needs a paid
  API key or a different model entirely.
- The worker is a separate long-running process meant for a Mac Mini
  (chosen back when the plan assumed a local .NET model with no inbound
  connectivity). Nobody currently runs it — on the VPS or anywhere else —
  so uploaded receipts sit in `queued` forever.
- The review screen is read-only: the user can approve the AI's raw
  categorization or send the whole receipt back for full reprocessing, but
  cannot fix a single wrong category/contact/description inline.
- The receipts list only refreshes on manual action; there is no live
  status feedback while a receipt is processing.

The household already has a corporate LiteLLM proxy
(`https://litellm.holdingbp.ru:4000/v1`, OpenAI-compatible) with DeepSeek
models available at no marginal cost to this project. This design replaces
the Claude-CLI worker with two LiteLLM calls, run in-process inside the API,
and closes the review-screen and live-status gaps at the same time since
they're part of the same user-facing feature.

## Goal

1. Remove the external worker process and its lease/heartbeat protocol;
   the API processes the queue itself.
2. Recognize receipts via two LiteLLM calls: `deepseek-v4-flash-vision-exp`
   for OCR, `deepseek-v4-flash` for JSON assembly, categorization, and
   contact matching.
3. Give the review screen editable fields (per-item category, per-receipt
   contact, per-operation description) so a wrong AI guess doesn't force a
   full re-processing round trip.
4. Give the receipts list a live status via short client-side polling.

## Non-goals (this pass)

- Auto-creating a new contact from a receipt's merchant (still requires a
  confirmation UI that doesn't exist; out of scope here as it was before).
- Multi-instance / distributed processing. Exactly one API process ever
  runs, so there is no lease arbitration to design for.
- Server-push (SSE/WebSockets) for status updates — evaluated and
  rejected in favor of polling; see Approach.
- Any Gemini/OpenRouter integration. The corporate LiteLLM path was
  confirmed working end-to-end (see Verification below); no secondary
  provider is needed.
- Changing the "account currency must equal receipt currency" v1
  restriction.

## Verification already done

Before committing to this design, `deepseek-v4-flash-vision-exp` through
`https://litellm.holdingbp.ru:4000/v1/chat/completions` was tested directly
with a locally generated PNG (not hand-typed — script-generated, so no
transcription risk) sent as a standard OpenAI `image_url` content block.
3 out of 3 requests correctly identified the test image's color, with
short, sane `reasoning_content` each time. Earlier "the model can't see
the image" results in this same investigation traced to two unrelated
causes (a corrupted hand-copied base64 string in ad-hoc curl tests, and an
unrelated VS Code Copilot Chat attachment-button bug) — not a real
limitation of the model or the proxy. The vision path is trustworthy.

## Approach

**Remove the worker; process the queue inside the API process itself.**

The original pull/lease/heartbeat protocol existed because the model was
meant to run on a Mac Mini with no inbound connectivity, pulling jobs over
an outbound connection. LiteLLM is a plain outbound HTTPS call the API
server (which already has outbound internet) can make directly. With that
constraint gone, keeping a second deployable process, a worker-only API
key, and lease-token arbitration is solving a problem that no longer
exists.

A background loop inside `apps/api`, started from `main.ts`, polls
`receipt_processing_jobs` for `queued` rows, claims one, processes it, and
writes the result — all as plain function calls against the same SQLite
connection the HTTP handlers use. Since exactly one process ever runs this
loop, there is no concurrent claimant to race against; a crash mid-job is
handled by resetting stray `processing` rows back to `queued` on API boot,
which is simpler and sufficient at this scale (replaces lease-expiry with
"restart recovers").

Rejected alternative: keep the external worker script, just swap
`claude -p` for a LiteLLM HTTP call inside it. This keeps the deployment
story (a process nobody currently runs) and the lease/heartbeat machinery
that no longer serves its original purpose. Not worth the extra moving
parts for a single-household, low-volume feature.

**Live status: short client polling, not SSE/WebSockets.**

The client only needs to learn about server-side state changes — a plain
one-directional signal. WebSockets solve two-directional real-time
communication, which this doesn't need, at the cost of an upgrade
handshake, client-side reconnect logic, and nginx `Upgrade` header
configuration. SSE is a legitimate lighter alternative but still needs a
dedicated streaming endpoint and `proxy_buffering off` on nginx. Given the
household-scale traffic (a handful of receipts a day), a 2.5s client poll
against the existing `getReceiptImports` query — only while a receipt is
in an active status — is materially simpler and imperceptible in latency
terms.

**Two LiteLLM calls, not one.**

`deepseek-v4-flash-vision-exp` only needs to transcribe the receipt
accurately; it doesn't need the household's full category/contact list in
context. `deepseek-v4-flash` (text-only) does the reasoning — assembling
structured JSON, categorizing each line, and picking a contact — over a
larger, more instruction-heavy prompt, without spending vision tokens on
it. This also matches the result schema's existing separation of
`rawOcrText` from `categorizedItems`/`receipt`, which already anticipated
this split.

## Data model

### `receipt_processing_jobs` — drop lease/heartbeat columns

Migration removes: `worker_id`, `lease_token_hash`, `lease_expires_at`,
`last_heartbeat_at`. None of them mean anything once there is a single
in-process claimant. `attempt`, `status`, `requested_pipeline_version`,
`result_sha256`, `last_error`, timestamps stay as-is.

### `receipt_imports` — add a contacts snapshot

New columns, mirroring the existing categories snapshot:

| Column | Type | Notes |
|---|---|---|
| `contacts_snapshot_json` | `text NOT NULL` | Household contacts at creation time: `{id, name}[]` |
| `contacts_snapshot_version` | `text NOT NULL` | Hash of the snapshot, same pattern as `categories_snapshot_version` |

Captured in `createFromImage`, same place the categories snapshot is
captured today.

### Result schema (`packages/contracts/src/receipt.ts`)

`receiptWorkerResultSchema.receipt` gains `contactId: string | null` —
the categorization model's pick from the contacts snapshot. The service
validates it against the snapshot with the same guard already used for
`categorizedItems[].categoryId` (reject the job if it references a
contact that wasn't in the snapshot). This replaces
`resolveContactIdByMerchantName`'s exact-name matching entirely; the
model gets a real shot at fuzzy matching, and the existing review-screen
edit (below) is the safety net if it still picks wrong.

### Contracts to remove

`workerIdentitySchema`, `receiptWorkerLeaseResponseSchema`,
`heartbeatReceiptJobInputSchema`, `receiptHeartbeatResponseSchema`,
`completeReceiptJobInputSchema`, `failReceiptJobInputSchema`,
`receiptWorkerResultResponseSchema`, `LeasedReceiptProcessingJob` — all of
it was HTTP-worker-protocol surface that disappears once nothing crosses
a process boundary. `receiptWorkerResultSchema` (the actual recognition
result shape) stays; it's still what the in-process pipeline produces and
validates against.

### `approveReceiptInputSchema` — accept edited operations

Today `approve()` re-derives operation groups from the raw stored result.
To support the review-screen edits, the client instead submits the
finalized groups explicitly:

```ts
{
  id: string;
  version: number;
  accountId: string;
  contactId: string | null;
  operations: Array<{
    categoryId: string | null;
    title: string;
    amountMinor: number;
    itemIndexes: number[]; // indexes into receipt.items, for traceability
  }>;
}
```

Server-side validation (replacing today's grouped-sum check):
every `itemIndexes` value used exactly once across all groups and in
range; every non-null `categoryId` exists in the stored categories
snapshot; `contactId` (if not null) exists in the stored contacts
snapshot; `sum(operations[].amountMinor) === result.receipt.totalAmountMinor`.
This is a strict superset of today's check, so a client that submits the
model's groups untouched behaves exactly as before.

## Components

### Removed

- `apps/api/src/http/receipt-worker-controller.ts`
- `apps/api/src/modules/receipt-import/receipt-worker-auth.ts`
- `apps/api/scripts/receipt-claude-worker.ts`
- `/api/receipt-worker/*` routes in `apps/api/src/app.ts`
- Worker-protocol contracts listed above
- `RECEIPT_WORKER_*` environment variables

### Added

- `apps/api/src/modules/receipt-import/receipt-processing-loop.ts` — the
  in-process poll loop; started once from `composition-root.ts`/`main.ts`.
- `apps/api/src/modules/receipt-import/litellm-client.ts` — thin fetch
  wrapper for the two LiteLLM calls (OCR, categorization), with timeout
  via `AbortController` and the existing `extractJsonObject`-style
  defensive JSON parsing ported over from the old worker script.
- `apps/api/src/modules/receipt-import/receipt-image-normalizer.ts` — uses
  `sharp` (new dependency) to convert any stored receipt image (including
  HEIC) to a resized JPEG for the outbound OCR request only. Storage and
  the UI viewer keep the original bytes untouched.
- Simplified repository methods replacing the lease-based ones:
  `claimNextQueuedJob()`, `markJobCompleted(...)`, `markJobFailed(...)`.

### Environment variables

New:

```
RECEIPT_LITELLM_BASE_URL=https://litellm.holdingbp.ru:4000/v1
RECEIPT_LITELLM_API_KEY=
RECEIPT_LITELLM_OCR_MODEL=deepseek-v4-flash-vision-exp
RECEIPT_LITELLM_CATEGORIZATION_MODEL=deepseek-v4-flash
RECEIPT_PROCESSING_POLL_INTERVAL_MS=5000
RECEIPT_PROCESSING_TIMEOUT_MS=120000
```

Removed: every `RECEIPT_WORKER_*` variable.

## Processing flow

1. Loop tick: `claimNextQueuedJob()` — atomically flips the oldest
   `queued` job to `processing` and returns it with its parent import
   (categories snapshot, contacts snapshot, review comment, previous
   result if this is a revision).
2. Read image bytes from storage directly (no HTTP, no lease token —
   same process). Normalize to JPEG via `sharp`.
3. Call `deepseek-v4-flash-vision-exp`: single message, image + a plain
   "transcribe everything visible, don't infer" instruction. Output:
   raw OCR text string.
4. Call `deepseek-v4-flash`: text-only. Input is the OCR text, the
   categories snapshot, the contacts snapshot, and (if this is a
   revision) the user's comment and previous result. Output: the
   `receiptWorkerResultSchema` JSON (receipt fields, items,
   `categorizedItems`, `contactId`, warnings).
5. Validate the combined result against `receiptWorkerResultSchema` plus
   the categories/contacts snapshot guards.
6. `markJobCompleted(...)` on success (writes `resultJson`, flips the
   import to `needs_review`) or `markJobFailed(...)` on any failure
   (network, timeout, schema validation) — same terminal-failure
   semantics as today, no automatic retry (the user's "request revision"
   flow is still what creates a new attempt).
7. Sleep `RECEIPT_PROCESSING_POLL_INTERVAL_MS` if the queue was empty;
   otherwise loop immediately to drain it.

On API startup: any job still `processing` (from a crash) is reset to
`queued` before the loop starts.

## UI changes (`apps/web/src/views/receipts/page.tsx`)

### Live status

A `createEffect` sets a 2.5s interval calling the existing
`handleRefresh` whenever `receiptImports()` contains a row in
`ACTIVE_STATUSES`; `onCleanup` clears it. No interval runs when nothing
is active.

### Editable review

`ReviewDialog`'s operation-preview list becomes editable:

- **Per item**: a category `<select>` next to each line (not just a
  read-only group), defaulting to the model's pick. Changing it moves the
  item into a different group in the local preview state.
- **Contact**: a single field for the whole receipt (a receipt has one
  merchant), defaulting to the model's `contactId`, editable via the
  existing contact picker pattern used elsewhere in the app.
- **Per resulting group**: an editable title/description text field,
  defaulting to what's shown today (category name + item list).

State lives locally in the dialog until submit; `handleApprove` builds
the `operations[]` array described above from current local state and
sends it as the new `approve()` payload shape.

## Testing

- `receipt-import-service.test.ts`: rewritten around `claimNextQueuedJob`
  / `markJobCompleted` / `markJobFailed` instead of lease/heartbeat;
  `approve()` tests updated for the new input shape and its validation
  (item coverage, category/contact snapshot membership, sum check).
- `receipt-worker-auth.test.ts`: deleted with the module.
- New `litellm-client.test.ts`: request-shape construction for both
  calls, defensive JSON extraction from a response, timeout behavior.
- New `receipt-image-normalizer.test.ts`: HEIC/PNG/JPEG all normalize to
  a decodable JPEG.
- `receipt-import-client.test.ts` (web): updated for the new `approve()`
  payload.

## Out of scope follow-ups

- Auto-creating a new contact from an unmatched merchant, with user
  confirmation.
- SSE/WebSocket live status, if polling ever proves insufficient at a
  much larger household/volume scale.
- Any secondary LLM provider (Gemini, OpenRouter, Claude API) — only
  worth revisiting if the corporate LiteLLM path stops being viable.
