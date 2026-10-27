# Page dependency trees

## /goals
Entry: `app/(main)/goals/page.tsx`
Dependencies:
- `components/product.tsx` (GoalLink, KindChoices, ProductMark)
- `components/ui-bits.tsx` (Page)
- `components/ui/progress.tsx`
- `components/flowing.tsx` (live stream digits only)
- `app/(main)/layout.tsx`
  - `components/shell.tsx` (aside + BottomNav)
    - `components/icons.tsx`

## /home
Entry: `app/(main)/home/page.tsx`
Dependencies:
- `components/product.tsx`
- `components/flowing.tsx` (HomeStream)
- `components/currency-pick.tsx`
- `components/icons.tsx`
- `components/forms.tsx` (WithdrawIdle)
- `components/shell.tsx`

## /goals/new
Entry: `app/(main)/goals/new/page.tsx`
Dependencies:
- `components/forms.tsx` (SavingForm, StreamForm)
- `components/product.tsx` (KindIntro)
- `components/ui/tabs.tsx`
- `components/ui-bits.tsx`

## /vaults
Entry: `app/(main)/vaults/page.tsx`
Dependencies:
- `components/product.tsx` (KindIntro, LockLink)
- `components/ui-bits.tsx`
- `components/shell.tsx`

## /groups
Entry: `app/(main)/groups/page.tsx`
Dependencies:
- `components/product.tsx` (GroupLink, ProductMark)
- `components/ui-bits.tsx`
- `public/steps.jpg`
- `components/shell.tsx`
