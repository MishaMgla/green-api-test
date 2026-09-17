# Technical tasks

Read this when executing the [implementation plan](implementation-plan.md).
Follow [architecture.md](architecture.md) for decisions and constraints.
Every task is open; check it off only when its acceptance checks pass.

## Execution and checks

Sequence: T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10.
T02's live checks may remain pending while independent mocked work proceeds,
but T10 cannot pass without them. Dependencies below name the actual inputs.
Keep tests beside non-trivial logic, using mocked fetch and fake timers where
needed. Run `npm run build` and `npm test -- --run` after each implementation
task; define these scripts in T01. No real credentials in fixtures or snapshots.

## T01 — [x] Establish the runnable application

Depends on: none. Area: project config and `src/app`.

- Scaffold Vite React/TypeScript in the existing repository, preserving docs and
  references; record the supported Node version and commit the package lock.
- Configure Tailwind, Query provider, Vitest, RTL, and the DOM test environment.
  Create FSD directories only as their first implementation needs them.
- Remove template demo UI and add one application mount check.
- Done when: development server, build, and test scripts work from a clean install.

## T02 — [x] Establish the API client and browser compatibility

Depends on: T01. Area: `src/shared/api`.

- Implement native-fetch wrappers for CheckAccount, SendMessage,
  ReceiveNotification, and DeleteNotification, following the linked provider docs.
- Accept runtime credentials and AbortSignal; validate relevant response shapes,
  handle empty receives, and expose safe operation/status errors. Add bounded
  request deadlines, with the receive deadline longer than its server timeout.
- Check POST/GET/DELETE and their preflights in a real browser using credentials
  entered at runtime. Use only an agreed test recipient and dedicated queue.
- Done when: mocked checks cover request construction, empty/invalid responses,
  unsuccessful acknowledgement, HTTP failures, and cancellation. Record live
  CORS results separately; keep them pending if no instance is available.

## T03 — [x] Define conversation data and pure transformations

Depends on: T02. Area: `src/entities/conversation`, `src/shared/lib`.

- Define only fields needed for chat identity, display, message direction/text,
  timestamp, and deduplication. Keep provider IDs as strings.
- Normalize supported phone input; reject unsupported formats and alphabetic
  input instead of silently stripping arbitrary characters.
- Map direct incoming/API-echo text and extended text; discard unsupported
  types and groups. Use one functional cache updater for chat/message insertion.
- Done when: a compact table-driven check covers phone boundaries, malformed
  bodies, both text forms/directions, duplicates, and independent chat IDs.

## T04 — [x] Implement login and session cleanup

Depends on: T02, T03. Area: `src/features/auth`, `src/entities/session`, app.

- Add labeled instance ID, masked token, and dashboard API-origin fields with
  local validation. Login starts a memory-only session; no eager queue probe.
- Create the session's QueryClient and empty non-fetching chat cache; provide
  a local change-credentials action and a guard for asynchronous completions.
- Done when: invalid input cannot start a session; ending it aborts registered
  work, clears data, and prevents late results reaching a replacement session.
  Check that credentials never enter storage or cache keys.

## T05 — [x] Create and select a chat by phone number

Depends on: T03, T04. Area: `src/features/create-chat`, conversation cache.

- Validate input, disable duplicate submission, resolve the canonical chat ID,
  then insert/select that chat. Reuse a known phone/chat mapping in this session.
- Show lookup/no-account/instance errors beside the form and retain the input.
  Do not create a chat on an unsuccessful or malformed response.
- Done when: repeated numbers and alternate formatting select one chat; an
  incoming chat inserted during lookup is reused; cancellation cannot add a
  chat to another session. Cover these with a component/mutation check.

## T06 — [x] Build the MAX reference interface

Depends on: T04, T05. Area: widgets, `src/pages/chat`, app styles.

- Inspect saved HTML/CSS/assets in `specs/max-web-reference/`; extract the
  palette, typography, spacing, sidebar, header, bubbles, and composer layout.
- Compose the sidebar, new-chat form, selection, conversation, and composer.
  Keep per-chat drafts; provide empty states and scrolling for long threads.
- Use local assets, English labels, accessible form names, visible keyboard
  focus, and readable contrast. Render message text without HTML interpretation.
- Done when: browser comparison matches the relevant reference layout; long
  text wraps, the composer stays reachable, keyboard navigation works, and chat
  switching preserves the correct draft. Omit unsupported reference controls.

## T07 — [x] Send text into the selected conversation

Depends on: T02–T06. Area: `src/features/send-message`.

- Use a mutation with retries disabled. Capture destination/text, enforce the
  4000-character limit, reject whitespace-only drafts, and prevent double send.
- Insert the accepted message through the shared updater. Preserve failed
  drafts and show a safe error; a transport failure can mean uncertain delivery.
- Done when: checks cover success, failure, blank/long input, chat switching
  while pending, and POST/echo completion in either order without duplicates.

## T08 — [x] Receive and acknowledge notifications serially

Depends on: T02–T04, T07. Area: `src/pages/chat` receive lifecycle.

- Run one cancellable receive → map/merge → delete loop per session, following
  the architecture's empty-result, acknowledgement, and backoff policies.
- Handle incoming direct chats and API echoes through the same cache updater.
  Keep polling independent of chat selection; stop cleanly on session teardown.
- Done when: fake-timer/hook checks cover null/empty receives, valid text,
  duplicate receipts, ignored/group/malformed bodies, absent receipt IDs,
  processing failure, failed/lost deletion responses, and transient recovery.
  StrictMode cleanup/remount and credential changes must leave one live owner
  with no orphan requests or timers; tab focus must not start another owner.

## T09 — [x] Complete recovery and interaction states

Depends on: T05–T08. Area: auth, chat page, widgets.

- Show distinct empty, lookup-pending, send-pending, and receive-error states
  without replacing the whole chat with a spinner during each long poll.
- Provide credential correction for authentication failures and setup guidance
  for unauthorized instances/webhook configuration; distinguish suspension.
  Retry recoverable receive failures through the existing loop owner.
- Done when: messages/drafts survive errors, recovery works without a reload,
  errors contain no credentials, and a focused integration check covers
  login → create → send → receive → change credentials.

## T10 — [ ] Verify the assignment and document the handoff

Depends on: T01–T09, including successful live checks from T02.

- From the intended serving origin, enter runtime credentials, create a chat
  by phone, send text, reply from MAX, and confirm the reply appears in that
  same chat. Exercise empty queue, another chat, reconnect, and session reset.
- Verify echo deduplication, queue acknowledgement, and no browser CORS errors.
  Confirm accepted messages actually reach the recipient in the live test.
- Update README with install/run/build/test commands, Node version, dashboard
  setup, queue exclusivity, supported phone formats, and memory-only history.
  Document any required serving proxy and its credential-log precautions.
- Done when: clean-install build/tests and live flow pass, visual comparison is
  complete, and docs match the implementation. Report any unavailable live
  check as pending; mocked tests do not replace it. Deployment is not a separate
  feature required by the assignment.
