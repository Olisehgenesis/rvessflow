"use client";

import { useEffect, useState } from "react";
import { percent, show, streamDigits } from "@/lib/display";
import { chainQuote, type Quote } from "@/lib/quote";
import { Progress } from "@/components/ui/progress";

export function useFlowingValue(readAt: number, base: string, perSecond: string, floor?: string, ceiling?: string) {
  const now = useNow(readAt);
  return moved(readAt, now, base, perSecond, floor, ceiling);
}

export function RollingText({ text }: { text: string }) {
  return (
    <span className="inline-flex w-max max-w-full flex-row flex-nowrap whitespace-nowrap tabular-nums" aria-label={text}>
      {text.split("").map((char, index) => (
        <RollChar key={`${index}-${text.length}`} char={char} />
      ))}
    </span>
  );
}

function useNow(readAt: number) {
  const [now, setNow] = useState(readAt);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function asWei(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function moved(readAt: number, now: number, base: string, perSecond: string, floor = "0", ceiling?: string) {
  const delta = Number.isFinite(now) && Number.isFinite(readAt) ? Math.max(0, Math.trunc(now - readAt)) : 0;
  const elapsed = BigInt(delta);
  let value = asWei(base) + asWei(perSecond) * elapsed;
  const low = asWei(floor);
  if (value < low) value = low;
  if (ceiling !== undefined) {
    const high = asWei(ceiling);
    if (value > high) value = high;
  }
  return value;
}

function RollingMoney({ value, quote, digits }: { value: bigint; quote: Quote; digits?: number }) {
  const text = show(value, quote, digits);
  return (
    <span className="inline-flex w-max max-w-full flex-row flex-nowrap whitespace-nowrap tabular-nums" aria-label={text}>
      {text.split("").map((char, index) => (
        <RollChar key={index} char={char} />
      ))}
    </span>
  );
}

function RollChar({ char }: { char: string }) {
  const digit = /\d/.test(char);
  const [snapshot, setSnapshot] = useState({ char, leaving: null as string | null });
  if (char !== snapshot.char) {
    const before = snapshot.char;
    setSnapshot({ char, leaving: digit && /\d/.test(before) ? before : null });
  }
  const leaving = snapshot.leaving;

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => {
      setSnapshot((current) => (current.leaving === leaving ? { ...current, leaving: null } : current));
    }, 280);
    return () => window.clearTimeout(id);
  }, [leaving]);

  if (!digit || leaving === null) return <span className="inline-block">{char}</span>;

  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-bottom">
      <span className="absolute inset-x-0 top-0 motion-safe:animate-[digit-out_280ms_cubic-bezier(0.2,0,0,1)_both]">{leaving}</span>
      <span className="absolute inset-x-0 top-0 motion-safe:animate-[digit-in_280ms_cubic-bezier(0.2,0,0,1)_both]">{char}</span>
    </span>
  );
}

function SecondSweep() {
  const [fraction, setFraction] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(query.matches);
    apply();
    query.addEventListener("change", apply);
    let frame = 0;
    const loop = () => {
      setFraction((Date.now() % 1000) / 1000);
      frame = requestAnimationFrame(loop);
    };
    if (!query.matches) frame = requestAnimationFrame(loop);
    return () => {
      query.removeEventListener("change", apply);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="mt-2 h-1 w-28 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className="h-full origin-left bg-motion"
        style={{ transform: `scaleX(${reduce ? 1 : fraction})` }}
      />
    </div>
  );
}

export function HomeStream({
  readAt,
  wallet,
  idle,
  held,
  locked,
  streams,
  quote,
}: {
  readAt: number;
  wallet: string;
  idle: string;
  held: string;
  locked: string;
  streams: { rate: string; remaining: string; toMe: boolean; live: boolean }[];
  quote: Quote;
}) {
  const now = useNow(readAt);
  const elapsed = BigInt(Math.max(0, now - readAt));
  let liveRate = 0n;
  let streamingNow = 0n;
  let inflow = 0n;
  for (const stream of streams) {
    const rate = stream.live ? BigInt(stream.rate) : 0n;
    const left = BigInt(stream.remaining);
    const gone = rate * elapsed > left ? left : rate * elapsed;
    streamingNow += left - gone;
    liveRate += rate;
    if (stream.toMe) inflow += gone;
  }
  const available = BigInt(wallet) + inflow;
  const total = available + BigInt(idle) + BigInt(held) + streamingNow + BigInt(locked);
  const perDay = liveRate * 86400n;
  const flowing = liveRate > 0n && streamingNow > 0n;
  const fine = flowing ? streamDigits(liveRate, quote) : quote.digits;

  return (
    <>
      {flowing ? (
        <>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[2.6rem] leading-none font-medium tracking-tight tabular-nums">
              <RollingMoney value={streamingNow} quote={quote} digits={fine} />
            </span>
            <span className="text-sm font-medium text-muted-foreground">{quote.unit}</span>
          </p>
          <SecondSweep />
          <p className="mt-2 text-sm text-muted-foreground">
            {show(liveRate, quote, fine)} {quote.unit} each second. {show(perDay, quote)} every 24 hours.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nothing is streaming.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Total {show(total, quote)} {quote.unit}. Wallet, vault, and locks.
          </p>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4">
        <Figure label="Available" value={show(available, quote)} />
        <Figure label="Holding" value={show(held, quote)} />
        <Figure label="Streaming" meter={flowing} value={flowing ? <RollingMoney value={streamingNow} quote={quote} digits={fine} /> : show(streamingNow, quote)} />
        <Figure label="Locked" value={show(locked, quote)} />
      </div>
    </>
  );
}

function Figure({ label, value, meter = false }: { label: string; value: React.ReactNode; meter?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${meter ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

export function FlowingText({
  readAt,
  base,
  perSecond,
  floor = "0",
  ceiling,
  fine = false,
  plain = false,
  places,
  quote = chainQuote(),
}: {
  readAt: number;
  base: string;
  perSecond: string;
  floor?: string;
  ceiling?: string;
  fine?: boolean;
  places?: number;
  /** One text node. Compact rows must not split the amount into a character per line. */
  plain?: boolean;
  quote?: Quote;
}) {
  const now = useNow(readAt);
  const value = moved(readAt, now, base, perSecond, floor, ceiling);
  const digits = places ?? (fine ? streamDigits(BigInt(perSecond.startsWith("-") ? perSecond.slice(1) : perSecond), quote) : quote.digits);
  if (plain || !fine) return show(value, quote, digits);
  return <RollingMoney value={value} quote={quote} digits={digits} />;
}

export function FlowingAmount({
  readAt,
  base,
  perSecond,
  ceiling,
  quote = chainQuote(),
}: {
  readAt: number;
  base: string;
  perSecond: string;
  ceiling?: string;
  quote?: Quote;
}) {
  const now = useNow(readAt);
  const value = moved(readAt, now, base, perSecond, "0", ceiling);
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-mono text-[2.6rem] leading-none font-medium tracking-tight tabular-nums">
        <RollingMoney value={value} quote={quote} digits={streamDigits(BigInt(perSecond), quote)} />
      </span>
      <span className="text-sm font-medium text-muted-foreground">{quote.unit}</span>
    </p>
  );
}

export function FlowingProgress({
  readAt,
  base,
  perSecond,
  ceiling,
  whole,
}: {
  readAt: number;
  base: string;
  perSecond: string;
  ceiling: string;
  whole: string;
}) {
  const now = useNow(readAt);
  const value = moved(readAt, now, base, perSecond, "0", ceiling);
  return <Progress value={percent(value.toString(), whole)} className="mt-4 h-2" />;
}
