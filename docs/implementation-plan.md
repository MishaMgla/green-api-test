# Implementation plan

Read this before implementing the assignment from
[../specs/original-spec.md](../specs/original-spec.md). Reviewed in a two-round
debate with Codex; the decisions below are the reconciled result.

## Stack

Vite + React + TypeScript. No router, no state manager, no UI library, no
GREEN-API SDK — the spec pins the two raw HTTP methods
([SendMessage](https://green-api.com/v3/docs/api/sending/SendMessage/),
[HTTP API receiving](https://green-api.com/v3/docs/api/receiving/technology-http-api/)).
Hand-written CSS replicating the MAX web look from `specs/max-web-reference/`.

## Architecture

- `src/api/greenApi.ts` — `sendMessage`, `receiveNotification`,
  `deleteNotification`. `apiUrl` comes from the login form (prefilled
  `https://api.green-api.com`; the dashboard may issue a regional host). Never
  log request URLs or raw errors — the token is in the URL path.
- `src/lib/` — pure helpers: phone validation/normalization (7–15 digits →
  `<digits>@c.us`, no country-code guessing), notification→Message mapping
  (`textMessage` and `extendedTextMessage`; every other type discarded).
- `src/App.tsx` — state: `credentials | null`, `chats: Chat[]`, `activeChatId`,
  `seenIdMessages: Set<string>`. Components: `LoginForm` (apiUrl, idInstance,
  apiTokenInstance — kept in memory only), `Sidebar` (chat list + new-chat phone
  input), `ChatWindow` (message list + composer).

## Key behaviors

- **Send** — disable the composer while a POST is pending; reject
  whitespace-only input; `maxLength=4000`; keep the text on failure. Append the
  message after a 200 response only if its `idMessage` is not already in
  `seenIdMessages` (echo race guard), then record it. No delivery indicators —
  a 200 means queued, not delivered.
- **Receive** — one session-keyed long-poll loop (`receiveTimeout=20`). Every
  notification that carries a `receiptId` is deleted, including unknown and
  malformed ones; a failed delete counts as a polling failure and triggers
  backoff. Deduplicate by `idMessage`. An incoming chatId that matches no chat:
  exact-digit match against a phone-keyed chat re-keys that chat to the API
  chatId (used for subsequent sends); absent or ambiguous sender data creates a
  new chat — never a fuzzy merge. An `outgoingAPIMessageReceived` echo not in
  `seenIdMessages` is appended as outgoing (covers a lost POST response).
  `AbortError` on logout/unmount is silent.
- **Errors** — in-place banner; only 401/403 offers re-entering credentials.
  No eager credential validation: the polling loop is the first API call
  (an eager `receiveNotification` would claim the queue head).

## Steps

1. Scaffold Vite react-ts. **CORS spike**: a real browser POST plus a long poll
   against a live instance. Only if it fails on localhost, add a minimal Vite
   dev proxy — not speculatively.
2. API module + pure helpers + one runnable check (native `node` TS check if the
   local Node strips types, otherwise a single vitest devDependency), with
   `npm run build` in the check loop. Verify real MAX notification payload
   fields here — the docs are thin on `senderData`.
3. `LoginForm`.
4. Extract colors/typography/layout from the saved reference pages (local
   assets only, desktop-first); static chat UI.
5. Send flow.
6. Polling receive loop.
7. Error/empty/loading states; README (credentials setup; instance must have
   `incomingWebhook: yes` and an empty `webhookUrl`; the app drains the
   instance notification queue, so it needs exclusive polling use of the
   instance); `docs/architecture.md`.
