# Rvess Receive

Public checkout at `/r/:identifier` for **Give once** (ERC-20 / native transfer) and **Stream** (expense flow via FlowVault).

## Visual language

Public `/r` matches the main Rvess product: cream `#F7F6F3`, white surfaces, dark `#141414`, muted `#5C6572`, lime `#D6F34A` for selected states and primary actions. Soft pale-green accents only. No orange/blue checkout theme.

## Identifier resolution

| Input | Resolution |
|-------|------------|
| `0x` + 40 hex | Wallet address (registered profile optional) |
| Digits only | Member code / numeric ID |
| Alphanumeric 3–32 | Member code, then unique name slug |

Unregistered addresses get a minimal page (truncated address as identity) with default open config.

## Owner configuration

Settings → **Receive link** (`/settings/receive`):

- Enable / disable the link
- Toggle Stream and Give once independently
- Fixed / Flexible / Open stream modes
- Presets, min/max, anonymous + messages, cover, goal, socials
- Optional receiving wallet override

Editing settings never mutates existing streams.

## Checkout reuse

| Contribution | Existing path |
|--------------|---------------|
| Give once | `planSend` / `sendFunds` intent (`kind: "send"`) |
| Stream | `planStream` expense / `createStream` (`flowKind: "expense"`) |

Public actions: `contributeOnce`, `contributeStream`, `openContributeSession`.

Success only after on-chain confirmation (`useSignedAction` + `continueIntent`). Events are recorded in `receive_events` after success.

## Missing / partial capabilities

1. **Direct wallet CFA** — Streams still require the payer’s FlowVault (`createFlow`). Visitors without a vault get the existing vault-creation steps. ROADMAP §8.3 (wallet-only CFA checkout) is not implemented.
2. **On-chain funding indexer** — Received vs committed stats use `receive_events` for contributions made through this page, not a full subgraph of all inbound transfers/streams.
3. **Anonymous persistence** — UI supports anonymous; post-success event rows currently store the contributor address when available (privacy hardening TBD).
4. **Numeric user IDs** — Resolved as member codes; there is no separate auto-increment profile ID column.
5. **Cover uploads** — Cover is a URL string; no media upload pipeline yet (default art at `/receive/cover.jpg`).

## Test seed

Unit tests: `test/receive.test.ts` (classification + commitment math).

Manual checks:

- `/r/0x…` registered and unregistered
- `/r/<member_code>` and `/r/<digits>`
- Disabled link, fixed/flexible/open, once-only / stream-only
- Give once never creates a stream
- Mobile + desktop layout
