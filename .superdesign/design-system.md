# RvessFlow design system

Everyday savings on a phone. Calm, plain, trustworthy. Money that is already arranged, not a market.

## Product

- Named savings holds, real Superfluid streams, dated locks, and small rotating groups.
- One primary action per screen. Numbers are the hierarchy.
- Holds do not tick. Only a live non-saving stream moves.
- Show real chain state, including zeros and empty lists. Do not invent balances in a reproduction of the current empty Goals screen.

## Color

- Background `#FAF9F6`. Card `#FFFFFF`. Text `#0B0F14`.
- Primary fill `#D9FF38` with charcoal text. Used for the one main button and the active nav pill.
- Muted text `#4E5560`. Hairline border `#E7E2D8`. Soft paper `#F3F1EA`.
- Lavender `#A78BFA` is secondary only: flow and expense marks, not large fills.
- Product marks keep their own object colors: lime plant, lavender bolt, lavender arrow, orange padlock, blue people. Do not recolor those illustrations.
- No purple gradients, no neon, no extra palette.

## Type

- Manrope for headings and currency amounts.
- Inter for body, labels, and forms.
- Amounts are tabular. Do not introduce a serif or a display script.

## Shape

- Cards `rounded-3xl` (about 1.5rem), white, no heavy shadow.
- Buttons and the active nav item are full pills.
- Page width is a phone column, max about 32rem, on the off-white ground.
- On a wide screen, a charcoal panel sits to the left with the lime eyebrow “RvessFlow”, the Manrope line “Your money, in motion.”, and the subline “Your savings are moving toward your goals.”

## Navigation

Sticky bottom bar, five items: Home, Goals, Vaults, Groups, More. Active item is a lime pill with charcoal icon and label. Inactive items are muted.

## Goal identity

- Saving: plant in a lime pot. Holds until a date. Status pill “Holding” on lime.
- Flow: lavender disc with a white bolt. Streams back to you. Status “Streaming” on a pale lavender pill.
- Expense: lavender disc with a white arrow. Streams to someone else.
- Lock: orange padlock. Status “Locked” on a pale warm pill. Progress bar warm orange.
- Group: three blue figures.

A goal row is: mark, name, kind line, status pill, amount / target, date, thin progress bar in that kind’s color.

## Motion

Digit roll and a one-second lime sweep only while a real stream is live. Holds, locks, and empty states stay still.
