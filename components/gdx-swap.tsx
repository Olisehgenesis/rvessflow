"use client";

import { useEffect, useState } from "react";
import { useSignedAction } from "@/components/sign-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { previewGdxSwap, swapGdx } from "@/lib/actions";
import { gdxPoolHref, gdxReserveHref, gdxScreenHref, gdxSwaps } from "@/lib/gdx-swap";
import { exitContributionPct, type GdxSide } from "@/lib/gdx-reserve";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";
const exitPct = exitContributionPct();

export function GdxSwap({ usdm, gdx }: { usdm: string; gdx: string }) {
  const [side, setSide] = useState<GdxSide>("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [state, swap, pending] = useSignedAction(swapGdx);
  const inLabel = side === "buy" ? "USDm" : "G$";
  const outLabel = side === "buy" ? "G$" : "USDm";
  const wallet = side === "buy" ? usdm : gdx;

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
      void previewGdxSwap({ side, amount: clean }).then((result) => {
        if (!live) return;
        setQuoting(false);
        if (result.error) {
          setQuote(null);
          setQuoteError(result.error);
          return;
        }
        setQuoteError("");
        setQuote(result.out ?? null);
      });
    }, 280);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [side, amount]);

  return (
    <section id="swap" className="scroll-mt-20">
      <h2 className="text-base font-semibold">Swap G$</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        GoodDollar prices G$ against USDm in its Celo Reserve. Buy and sell here. Selling G$ pays a {exitPct}% exit contribution to that Reserve.
      </p>

      <form action={swap} className="mt-4 space-y-4">
        <input type="hidden" name="side" value={side} />
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

        <label className="block space-y-1.5">
          <Label htmlFor="gdx-amount">{side === "buy" ? "USDm to spend" : "G$ to sell"}</Label>
          <Input
            id="gdx-amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={field}
          />
          <button type="button" className="text-xs font-medium text-muted-foreground" onClick={() => setAmount(wallet.replace(/,/g, ""))}>
            Wallet {wallet} {inLabel}
          </button>
        </label>

        <p className="text-sm text-muted-foreground">
          {quoting ? "Quote from the Reserve…" : quote ? `You receive about ${quote} ${outLabel}.` : "Enter an amount for a Reserve quote."}
        </p>
        {side === "sell" ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            The Reserve keeps {exitPct}% when you sell. The quote already subtracts that.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">Buy uses Celo USDm (Mento). USDC on Celo is a different token.</p>
        )}
        {quoteError ? <ErrorNote error={quoteError} /> : null}
        {state?.error && !state.sign ? <ErrorNote error={state.error} /> : null}
        <Button type="submit" disabled={pending || !amount.trim()} className="h-12 w-full rounded-full text-base">
          {pending ? "Sending…" : side === "buy" ? "Buy G$" : "Sell G$"}
        </Button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Reserve on{" "}
        <a href={gdxReserveHref} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          Celo
        </a>
        . Uniswap is a thin backup if you hold CELO or USDC instead of USDm.
      </p>
      <ul className="mt-2 space-y-2">
        {gdxSwaps.map((row) => (
          <li key={row.id}>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{row.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{row.body}</span>
              </span>
              <span className="shrink-0 text-sm font-medium">Open</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Uniswap pool on{" "}
        <a href={gdxPoolHref} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          Uniswap
        </a>
        {" · "}
        <a href={gdxScreenHref} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          DexScreener
        </a>
        .
      </p>
    </section>
  );
}
