# Routes

Next.js App Router. Main screens sit in `app/(main)` inside `Shell`.

| URL | File | What it renders |
| --- | --- | --- |
| `/` | `app/page.tsx` | Splash with splash.jpg, wordmark, Get started |
| `/home` | `app/(main)/home/page.tsx` | Total, currency, Save/Stream/Lock/Groups, goal list |
| `/goals` | `app/(main)/goals/page.tsx` | Goal list, or kind chooser when empty |
| `/goals/new` | `app/(main)/goals/new/page.tsx` | Saving / Flow / Expense forms |
| `/goals/[id]` | `app/(main)/goals/[id]/page.tsx` | Goal detail, large mark, amount, actions |
| `/vaults` | `app/(main)/vaults/page.tsx` | Locks list |
| `/vaults/new` | `app/(main)/vaults/new/page.tsx` | Lock form |
| `/vaults/[id]` | `app/(main)/vaults/[id]/page.tsx` | Lock detail |
| `/groups` | `app/(main)/groups/page.tsx` | Groups list or empty forest card |
| `/groups/new` | `app/(main)/groups/new/page.tsx` | Group form |
| `/groups/[id]` | `app/(main)/groups/[id]/page.tsx` | Group detail |
| `/settings` | `app/(main)/settings/page.tsx` | Currency, account, protocol notes |

Layout: `app/(main)/layout.tsx` wraps every main route in `Shell`.
