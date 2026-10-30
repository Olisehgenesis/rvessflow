"use client";

import { useEffect, useState } from "react";
import { useSignedAction } from "@/components/sign-action";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote } from "@/components/ui-bits";
import { previewGdxSwap, swapGdx } from "@/lib/actions";
import { type GdxSide } from "@/lib/gdx-reserve";
import { gdxVias, type GdxVia } from "@/lib/gdx-route";
import type { GdxTradeBalances } from "@/lib/token-face";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function GdxSwap({
  trade,
  initialVia = "usdm",
  initialSide = "buy",
}: {
  trade: GdxTradeBalances;
  initialVia?: GdxVia;
  initialSide?: GdxSide;
}) {
  const [side, setSide] = useState<GdxSide>(initialSide);
  const [via, setVia] = useState<GdxVia>(initialVia);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [outLabel, setOutLabel] = useState(initialSide === "buy" ? "G$" : "USDm");
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [state, swap, pending] = useSignedAction(swapGdx);
  const wallet = side === "buy" ? trade[via] : trade.gdx;
  const inLabel = side === "buy" ? gdxVias.find((row) => row.id === via)?.label ?? "USDm" : "G$";

  useEffect(() => {
    const clean = amount.replace(/,/g, "").trim();
    if (!clean) {
      setQuote(null);
      setQuoteError("");
      setQuoting(false);
      return;
    }
    let live = true;
    setQuoting(true);
    const timer = window.setTimeout(() => {
      void previewGdxSwap({ side, amount: clean, via }).then((result) => {
        if (!live) return;
        setQuoting(false);
        if (result.error) {
          setQuote(null);
          setQuoteError(result.error);
          return;
        }
        setQuoteError("");
        setQuote(result.out ?? null);
        setOutLabel(result.outLabel ?? (side === "buy" ? "G$" : inLabel));
      });
    }, 280);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [side, amount, via, inLabel]);

  return (
    <form action={swap} className="space-y-3">
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="via" value={via} />
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Direction</legend>
        {(["buy", "sell"] as const).map((next) => (
          <button
            key={next}
            type="button"
            aria-pressed={side === next}
            onClick={() => {
              setSide(next);
              setAmount("");
            }}
            className={`h-11 rounded-full text-sm font-medium ${side === next ? "border-2 border-foreground bg-card" : "border border-border bg-card"}`}
          >
            {next === "buy" ? "Buy G$" : "Sell G$"}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{side === "buy" ? "Pay with" : "Receive"}</legend>
        <div className="flex flex-wrap gap-2">
          {gdxVias.map((row) => {
            const on = via === row.id;
            return (
              <button
                key={row.id}
                type="button"
                aria-pressed={on}
                aria-label={row.label}
                title={row.label}
                onClick={() => {
                  setVia(row.id);
                  setAmount("");
                }}
                className={`grid size-12 place-items-center rounded-full ${on ? "ring-2 ring-foreground" : "ring-1 ring-border"}`}
              >
                <TokenIcon symbol={row.label} network="Celo" className="size-10" />
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{gdxVias.find((row) => row.id === via)?.label}</p>
      </fieldset>
      <label className="block space-y-1.5">
        <Input
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label={side === "buy" ? `${inLabel} to spend` : "G$ to sell"}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={field}
        />
        <button type="button" className="text-xs font-medium text-muted-foreground" onClick={() => setAmount(wallet.replace(/,/g, ""))}>
          Wallet {wallet} {inLabel}
        </button>
      </label>
      <p className="text-sm text-muted-foreground">
        {quoting ? "Quote…" : quote ? `About ${quote} ${outLabel}` : "Enter an amount."}
      </p>
      {side === "sell" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">Selling G$ keeps 10% in the Reserve. Other tokens go USDm on Uniswap after that.</p>
      ) : via === "usdm" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">Buys G$ from the GoodDollar Reserve with USDm.</p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">Uniswap turns {inLabel} into USDm, then the Reserve mints G$. No SDK — the same contracts this app already calls.</p>
      )}
      {quoteError ? <ErrorNote error={quoteError} /> : null}
      {state?.error && !state.sign ? <ErrorNote error={state.error} /> : null}
      <Button type="submit" disabled={pending || !amount.trim()} className="h-12 w-full rounded-full text-base">
        {pending ? "Sending…" : side === "buy" ? "Buy G$" : "Sell G$"}
      </Button>
    </form>
  );
}
