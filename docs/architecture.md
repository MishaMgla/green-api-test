# Architecture

Read this when implementing session state, chat identity, or API integration.
Scope and review findings are in [implementation-plan.md](implementation-plan.md).

## Stack and boundaries

Keep the selected Vite + React + TypeScript, Tailwind CSS, TanStack Query, and
Vitest + React Testing Library stack. React satisfies the assignment; TypeScript
checks internal models, Tailwind holds reference-derived styling, and Query
provides the shared chat cache and mutation state. Use native fetch and a
small serial receive loop; no SDK, router, or additional state library.

Use FSD boundaries without empty scaffolding: app composes providers; pages/chat
owns the session's receive lifecycle; widgets compose sidebar and chat window;
features implement auth, create-chat, and send-message. Entities contain session
and conversation models; keep chats and their messages in one conversation
slice to avoid imports between entity slices. Shared contains HTTP, phone
validation, and genuinely reusable UI. Imports point down the layers.

## Session and cache

Keep credentials in memory and take apiUrl from the user's GREEN-API dashboard.
Require an HTTPS origin without userinfo, path, query, or fragment. Validate the
instance ID and nonempty token, encode path segments, and mask the token input.
Never persist credentials, place them in query keys, or log request URLs/raw
errors. Do not load scripts or tracking from the saved reference pages.

Create a fresh QueryClient for each login session. The `['chats']` cache is
local session data: initialize it empty, use disabled observers, and prevent
garbage collection while the session exists. There is no chat-list fetch.
Use functional cache updates so send and receive cannot overwrite each other.
Keep selected chat and per-chat drafts in local React state.

Ending a session aborts requests, stops the loop and timers, clears its cache
and drafts, and discards late completions. Mutation cancellation requires our
own abort signal and session guard. Logout is local; it must not log the MAX
instance out of GREEN-API. A reload also ends the local session.

## Recipient and message identity

Creating a chat normalizes permitted phone punctuation without guessing country
codes, then resolves the number using
[CheckAccount](https://green-api.com/v3/docs/api/service/CheckAccount/).
Use the supported Russian/Belarusian formats in validation and UI guidance.
Store phone digits as a string; convert only for the lookup request. A lookup
must positively identify an existing account and return a usable chat ID.
Represent no-account, unavailable-instance, and lookup failures separately.

Use the canonical chat ID as a string everywhere. Repeated creation selects
the existing chat; if reception creates it during lookup, merge by that same ID.
Do not infer identity from names or optional sender phone data. This follows
[GREEN-API's recommendation](https://green-api.com/v3/docs/api/chat-id/).

Send and receive share one idempotent message insertion function, keyed by chat
ID and message ID. Deduplicate against existing messages; a second global
`seenIdMessages` store is unnecessary for this in-memory assignment. Preserve
arrival order and use the server timestamp when available.

## Send and receive

Send captures the chat ID and draft at submission. Block concurrent submission,
reject blank or over-limit input, preserve the draft on failure, and clear only
the submitted chat's unchanged draft on success. An accepted response adds the
outgoing message once; it is not a delivery confirmation. Disable automatic
send retries because a lost response may still mean the message was accepted.
See [SendMessage](https://green-api.com/v3/docs/api/sending/SendMessage/).

Mount one receive owner for the active session, independent of selected chat.
Each cycle awaits receive, validates/maps the payload, merges a supported
message, then awaits deletion before receiving again. Empty responses start
the next cycle; never use overlapping interval requests. Use a 20-second long
poll and a client deadline longer than that. Pass cancellation through requests
and retry waits; cleanup must also work under React StrictMode.

Only direct-chat text and extended text are rendered, as plain React text.
Unseen incoming direct chats are added without stealing selection. API echoes
use the same insertion path as send responses, including when the POST response
was lost. Unsupported/group/malformed notification bodies with a valid receipt
are deliberately discarded and acknowledged so they cannot block the queue.
A malformed envelope without a usable receipt is an error, not a tight loop.

On deletion failure, retain the already-merged message and back off before
receiving the head again. Redelivery is harmless; if the previous delete
succeeded but its response was lost, receiving again permits progress. Treat
`result: false` as an unsuccessful acknowledgement, not as success. Never
acknowledge a supported message after an unexpected processing failure.
See [HTTP receiving](https://green-api.com/v3/docs/api/receiving/technology-http-api/).

Transient receive/delete failures use capped backoff (1, 2, 4, 8, 16, 30 seconds),
reset after a successful cycle. Authentication/configuration failures pause
polling with a recovery action; a manual retry must not create another loop.
Keep messages/drafts while showing safe errors. Handle account suspension
separately from invalid credentials; do not echo raw provider errors or URLs.
See [standard errors](https://green-api.com/v3/docs/api/common-errors/).

## Runtime prerequisites

Use an authorized MAX instance with an empty webhookUrl, incoming notifications
enabled, and outgoing API notifications enabled for echo recovery. Configure
these in the dashboard; the app does not mutate instance settings. Exactly one
client must own the instance queue — not merely one tab: any other application
or script polling the same instance steals notifications from this one. The
owner drains notifications, including ignored types. Aborting a request cancels
it in the browser only; it does not prove the provider stopped processing one
already issued, so ownership is a prerequisite, not something the client enforces.
See [echo setup](https://green-api.com/v3/docs/api/receiving/notifications-format/outgoing-message/OutgoingApiMessage/).

Browser access is confirmed, so no proxy and no backend are needed. A preflight
against `https://api.green-api.com` from a localhost origin answers `204` with
`Access-Control-Allow-Origin: *` and allows `GET, POST, OPTIONS, DELETE` — the
three verbs this app uses. Should that ever change, a development proxy is the
answer only after an observed CORS failure: fix the upstream, and redact
credential-bearing access logs.
