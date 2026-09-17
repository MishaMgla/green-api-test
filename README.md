# green-api-test

A minimal React interface for sending and receiving **text** messages in MAX
through [GREEN-API](https://green-api.com/max). It is the whole application:
the browser talks to GREEN-API directly, with no backend and no proxy.

Built against the [specification](specs/original-spec.md); the chat is modelled
on the reference in `specs/max-web-reference/`. Project decisions live in
[docs/architecture.md](docs/architecture.md), conventions in [CLAUDE.md](CLAUDE.md).

## Requirements

Node `^22.12.0 || >=24.0.0` (enforced by `engines`), and a GREEN-API instance
for MAX. Nothing else — no database, no server, no environment file.

## Commands

```sh
npm ci          # install exactly the locked dependencies
npm run dev     # development server on http://localhost:5173
npm test        # run the test suite once
npm run build   # typecheck, then build into dist/
npm run preview # serve the built dist/ to check the production bundle
```

`npm test` runs once and exits. `npm run test:watch` is the watching variant.

## Instance setup

Configure this once in the GREEN-API dashboard. The application never changes
instance settings.

| Setting | Value | Why |
|---|---|---|
| `webhookUrl` | **empty** | Notifications go to the instance's own queue, which this app polls. Set it, and they are posted to that URL instead and polling fails. |
| `incomingWebhook` | **yes** | Produces `incomingMessageReceived` — without it no reply can ever arrive. |
| `outgoingAPIMessageWebhook` | **yes** | Produces the echo of messages sent through the API, which carries the provider's timestamp and recovers a send whose response was lost. |
| `outgoingWebhook` | no | Delivery and read statuses are not shown, and every extra notification still has to be drained. |

These settings decide **whether a notification is produced at all**; `webhookUrl`
decides **where it goes**. The names say "webhook", but with `webhookUrl` empty
nothing is pushed anywhere — the app pulls from the queue.

## Logging in

Enter `idInstance` and `apiTokenInstance` from the dashboard. The API host is
fixed to `https://3100.api.green-api.com`; there is no API URL input.

Credentials live in memory for the session only. They are never written to
`localStorage`, `sessionStorage`, a cookie, a query key or a log, so a reload is
a new login. "Сменить данные" ends the session and clears everything with it.

## Exclusive queue ownership

A GREEN-API instance has **one** notification queue, and reading a notification
removes it for everyone. Run exactly one client against an instance — not merely
one browser tab, but no other application or script polling it either. A second
reader silently steals messages from the first.

The app enforces one polling owner per session: a single serial
receive → merge → acknowledge cycle, never overlapping requests. It cannot
enforce anything beyond its own tab.

## Phone numbers

A new chat accepts Russian and Belarusian numbers, with or without `+`, spaces,
brackets or dashes:

```
+7 (999) 123-45-67    79991234567     8-999-123-45-67 is not accepted
+375 29 123-45-67     375291234567
```

A number in any other format is rejected rather than silently reshaped, because
guessing a country code would send the message to a stranger. The number is then
checked against MAX before the chat is created.

## What the app keeps

Credentials, drafts, contacts, and loaded messages stay in memory. Reloading the
page or changing credentials clears the local session and chat list.

Opening a chat loads its available text history from GREEN-API and retrieves the
contact's name and avatar. Older messages can be requested with “Загрузить ещё”.
History is merged with live messages by message ID, so an API echo does not create
a duplicate. Reopen a conversation by its phone number after logging in again to
load the provider's available history. Availability is limited by GREEN-API's
[history retention](https://green-api.com/v3/docs/api/journals/GetChatHistory/).

The interface is in Russian and follows the saved MAX reference. Missing or
private contact photos use initials.

## Scope

Text only, in both directions, as the specification requires. Anything else in
the queue — media, group chats, statuses — is acknowledged and discarded, so an
unsupported message cannot block the queue behind it.
