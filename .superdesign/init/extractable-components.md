# Extractable components

## Shell
- Source: `components/shell.tsx`
- Category: layout
- Description: Phone column, charcoal desktop aside, sticky bottom nav
- Extractable props: activeItem (string, default: "goals")
- Hardcoded: aside copy "Your money, in motion.", nav labels Home Goals Vaults Groups More, lime active pill

## Page
- Source: `components/ui-bits.tsx`
- Category: layout
- Description: Page title row with optional back and action
- Extractable props: title (string), back (string, optional)
- Hardcoded: Manrope title, circular back button

## ProductMark
- Source: `components/product.tsx`
- Category: basic
- Description: Illustrated mark for saving, flow, expense, lock, group
- Extractable props: kind (string, default: "saving")
- Hardcoded: image paths under /marks
