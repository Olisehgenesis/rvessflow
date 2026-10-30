import { gdxPoolHref, gdxScreenHref, gdxSwaps } from "@/lib/gdx-swap";

export function GdxSwap() {
  return (
    <section id="swap" className="scroll-mt-20">
      <h2 className="text-base font-semibold">Swap G$</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        GoodDollar lives on Celo. Uniswap has a G$/USDm pool. That pool is small, so large swaps move the price. This account stays here; Uniswap opens in a new tab.
      </p>
      <ul className="mt-3 space-y-2">
        {gdxSwaps.map((row) => (
          <li key={row.id}>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
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
        Pool on{" "}
        <a href={gdxPoolHref} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          Uniswap
        </a>
        {" · "}
        <a href={gdxScreenHref} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          DexScreener
        </a>
        . Token 0x62B8…c7A.
      </p>
    </section>
  );
}
