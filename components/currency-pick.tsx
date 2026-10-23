"use client";

import { setCurrency } from "@/lib/actions";
import { CURRENCIES } from "@/lib/quote";

export function CurrencyPick({ code }: { code: string }) {
  return (
    <form action={setCurrency} key={code}>
      <label className="sr-only" htmlFor="currency">
        Currency
      </label>
      <select
        id="currency"
        name="currency"
        defaultValue={code}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 max-w-full rounded-full border border-border bg-white px-3 text-sm text-foreground"
      >
        {CURRENCIES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.country}, {item.label}
          </option>
        ))}
      </select>
    </form>
  );
}
