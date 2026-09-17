# Implementation plan

Read this before implementing or checking coverage of the
[assignment](../specs/original-spec.md). Follow the executable breakdown in
[technical-tasks.md](technical-tasks.md); decisions live in
[architecture.md](architecture.md).

## Review result — 2026-09-17

The original plan covered the happy path but needed the following corrections.
These are incorporated into the architecture and technical tasks.

1. **Resolve the recipient before creating the chat.** Use
   [CheckAccount](https://green-api.com/v3/docs/api/service/CheckAccount/) to
   obtain the canonical MAX chat ID. The specification fixes the sending and
   receiving methods; it does not prohibit recipient lookup. This removes the
   phone-to-ID re-keying heuristic and keeps replies in the original chat even
   when a notification omits the phone number. Validate against the supported
   phone formats, not an arbitrary 7–15 digit range. See the provider's
   [chat-ID guidance](https://green-api.com/v3/docs/api/chat-id/).
2. **Give queue consumption one explicit owner.** Replace the unspecified
   continuous query with a cancellable serial receive loop. Cache queries must
   not start additional consumers on focus, reconnect, or remount.
3. **Merge before acknowledging.** The previous step order deleted before
   merging. Record a supported message first, then acknowledge its receipt;
   retries must not duplicate it. Handle unsuccessful deletion bodies as well
   as HTTP errors. See
   [DeleteNotification](https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/).
4. **Complete session and send lifecycles.** Abort work, cancel retry timers,
   clear session data, and reject late results after credentials change. Capture
   the destination when sending; changing the selected chat must not redirect
   the result. Never automatically retry an uncertain send.
5. **Complete instance setup and errors.** Echo recovery depends on enabling
   [outgoing API notifications](https://green-api.com/v3/docs/api/receiving/notifications-format/outgoing-message/OutgoingApiMessage/).
   A suspended-account 403 is not necessarily a bad token; preserve drafts and
   give the relevant recovery action.
6. **Make verification explicit.** Add create-chat acceptance checks, DELETE
   preflight coverage, and a real send/reply test from the intended serving
   origin. A localhost proxy alone does not establish production compatibility.

## Requirement coverage

| Assignment requirement | Implementation | Task |
|---|---|---|
| React UI | Vite React application | T01 |
| Enter GREEN-API credentials | Memory-only session and login form | T04 |
| Enter phone and create chat | Validate, resolve, select canonical chat | T05 |
| Match the saved MAX reference | Sidebar, conversation, composer | T06 |
| Send text with SendMessage | Explicit send mutation | T07 |
| Receive text through HTTP API | Receive, merge, acknowledge loop | T08 |
| See the recipient's reply in the chat | Shared canonical chat ID | T05, T08, T10 |
| Minimal feature set | Text and direct chats only | All |

## Completion boundary

No attachments, groups UI, contact sync, history API, read receipts, typing
indicators, router, or persistent credentials/messages. Reload starts a fresh
local session; acknowledged messages are not restored.

The repository currently contains documentation and saved references only.
All technical tasks remain open. Live CORS and send/reply validation require a
user-provided authorized MAX instance and test recipient; neither has been
verified during this documentation review.
