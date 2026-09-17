# Implementation plan

Read this before implementing the assignment from
[../specs/original-spec.md](../specs/original-spec.md). Reviewed in a two-round
debate with Codex; the decisions below are the reconciled result.

## Stack

Vite + React + TypeScript, Tailwind CSS, TanStack Query, Feature-Sliced Design.
Tests are written alongside each step: Vitest + React Testing Library.
No router, no extra state manager, no GREEN-API SDK — the spec pins the two raw
HTTP methods
([SendMessage](https://green-api.com/v3/docs/api/sending/SendMessage/),
[HTTP API receiving](https://green-api.com/v3/docs/api/receiving/technology-http-api/)).
Styling replicates the MAX web look from `specs/max-web-reference/` with
Tailwind utilities (palette/typography extracted into the Tailwind theme).

## Architecture (FSD layers)

```
src/
  app/        providers (QueryClientProvider), global styles, root composition
  pages/chat/ the single page: login screen vs chat screen
  widgets/    sidebar (chat list + new-chat input), chat-window (messages + composer)
  features/   auth (login form), send-message, create-chat
  entities/   session (credentials), chat, message (types + mapping + UI bits)
  shared/     api (greenApi client), lib (phone helpers), ui primitives
```

- `shared/api/greenApi.ts` — `sendMessage`, `receiveNotification`,
  `deleteNotification`. `apiUrl` comes from the login form (prefilled
  `https://api.green-api.com`; the dashboard may issue a regional host). Never
  log request URLs or raw errors — the token is in the URL path.
- Pure helpers: phone validation/normalization (7–15 digits →
  `<digits>@c.us`, no country-code guessing) in `shared/lib`;
  notification→Message mapping (`textMessage` and `extendedTextMessage`; every
  other type discarded) in `entities/message`.
- State: credentials in `entities/session` (memory only). Chats/messages live
  in the TanStack Query cache under `['chats']`: the send mutation and the
  polling loop write into it via `queryClient.setQueryData`; widgets read it
  with `useQuery`. Send = `useMutation`; receive = one continuous long-poll
  query (immediate refetch, Query's retry/backoff for failures). The
  `seenIdMessages` set lives beside the cache writer so both paths share it.

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

Each step lands with its tests (Vitest; React Testing Library for components
and hooks); `npm run build` and `vitest run` are the check loop throughout.

1. Scaffold Vite react-ts + Tailwind + TanStack Query + Vitest/RTL, FSD folder
   skeleton. **CORS spike**: a real browser POST plus a long poll against a
   live instance. Only if it fails on localhost, add a minimal Vite dev proxy —
   not speculatively.
2. `shared/api` client + pure helpers with unit tests (phone validation,
   notification mapping, dedup). Verify real MAX notification payload fields
   here — the docs are thin on `senderData`.
3. `features/auth` login form (+ component test).
4. Extract colors/typography/layout from the saved reference pages into the
   Tailwind theme (local assets only, desktop-first); static chat UI widgets.
5. Send flow: `useMutation` + cache write (+ hook test with mocked API).
6. Polling receive loop query: process → delete → merge into `['chats']`
   (+ hook test covering dedup, chat re-keying, unknown-type deletion).
7. Error/empty/loading states; README (credentials setup; instance must have
   `incomingWebhook: yes` and an empty `webhookUrl`; the app drains the
   instance notification queue, so it needs exclusive polling use of the
   instance); `docs/architecture.md`.
