"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FlowingText } from "@/components/flowing";
import { IconMark } from "@/components/icons";
import { ProductGlyph } from "@/components/landing-icons";
import { rememberPlace } from "@/lib/actions";
import { show, streamDigits } from "@/lib/display";
import { currencyForCountry } from "@/lib/place";
import type { Quote } from "@/lib/quote";

const quick = [
  { name: "save" as const, label: "Save", well: "bg-[#E5F6D4]", ink: "text-[#3C9A34]" },
  { name: "stream" as const, label: "Stream", well: "bg-[#EDE6FF]", ink: "text-[#7A5CDB]" },
  { name: "lock" as const, label: "Lock", well: "bg-[#F1F0EC]", ink: "text-[#1A1C1F]" },
  { name: "groups" as const, label: "Groups", well: "bg-[#E4F0FF]", ink: "text-[#3B82F6]" },
];

const STREAM_PER_DAY = 45;
const SAVE_PER_DAY = 8;

function usdToWei(usd: number): string {
  const micro = BigInt(Math.round(usd * 1e8));
  return (micro * 10n ** 10n).toString();
}

function useLocalQuote(quote: Quote, placed: boolean) {
  const [current, setCurrent] = useState(quote);
  const [basis, setBasis] = useState(quote);
  if (quote.code !== basis.code || quote.perToken !== basis.perToken || quote.unit !== basis.unit) {
    setBasis(quote);
    setCurrent(quote);
  }

  useEffect(() => {
    if (placed) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("https://get.geojs.io/v1/ip/country.json", { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { country?: string };
        const code = currencyForCountry(body.country);
        if (!code || code === quote.code) return;
        const priced = await fetch(`/api/quote?code=${code}`, { signal: controller.signal });
        if (!priced.ok) return;
        const next = (await priced.json()) as Quote;
        if (!next.code || !(next.perToken > 0)) return;
        setCurrent(next);
        void rememberPlace(body.country ?? "");
      } catch {
        // Keep the currency from the server when this browser's country cannot be read.
      }
    })();
    return () => controller.abort();
  }, [placed, quote.code]);

  return current;
}

function useStill() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return reduce;
}

function LiveMoney({
  usd,
  perDay,
  ceilingUsd,
  quote,
  readAt,
  still,
  hold = false,
  className,
}: {
  usd: number;
  perDay: number;
  ceilingUsd?: number;
  quote: Quote;
  readAt: number | null;
  still: boolean;
  hold?: boolean;
  className?: string;
}) {
  if (hold) return <span className={className}>—</span>;
  const perSecond = perDay / 86400;
  const step = perSecond * quote.perToken;
  const fine = !still && step < 1;
  const digits = fine ? streamDigits(BigInt(usdToWei(perSecond)), quote) : undefined;
  return (
    <span className={className}>
      {readAt === null || still ? (
        show(usdToWei(usd), quote, digits)
      ) : (
        <FlowingText
          readAt={readAt}
          base={usdToWei(usd)}
          perSecond={usdToWei(perSecond)}
          ceiling={ceilingUsd === undefined ? undefined : usdToWei(ceilingUsd)}
          fine={fine}
          quote={quote}
        />
      )}
    </span>
  );
}

function Device({ quote, readAt, still, hold }: { quote: Quote; readAt: number | null; still: boolean; hold: boolean }) {
  const perSecond = STREAM_PER_DAY / 86400;
  const step = perSecond * quote.perToken;
  const rateDigits = step >= 1 ? quote.digits : streamDigits(BigInt(usdToWei(perSecond)), quote);
  const balanceSize = step < 1 ? "text-[1.22rem]" : "text-[1.42rem]";
  return (
    <div className="relative rounded-[2.6rem] bg-[#161616] p-[10px] shadow-[0_30px_50px_-28px_rgba(17,17,17,0.7)]">
      <span className="absolute top-24 -left-[3px] h-7 w-[3px] rounded-l-sm bg-[#3a3a3a]" />
      <span className="absolute top-36 -left-[3px] h-12 w-[3px] rounded-l-sm bg-[#3a3a3a]" />
      <span className="absolute top-32 -right-[3px] h-16 w-[3px] rounded-r-sm bg-[#3a3a3a]" />
      <div className="overflow-hidden rounded-[2.15rem] bg-white">
        <div className="relative flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-semibold tracking-tight">
          <span>9:41</span>
          <span className="absolute top-2.5 left-1/2 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-[#161616]" />
          <span className="flex items-center gap-1" aria-hidden="true">
            <svg viewBox="0 0 16 12" className="h-2.5 w-3.5" fill="currentColor">
              <rect x="0" y="7" width="2.2" height="5" rx="0.4" />
              <rect x="3.4" y="5" width="2.2" height="7" rx="0.4" />
              <rect x="6.8" y="2.6" width="2.2" height="9.4" rx="0.4" />
              <rect x="10.2" y="0" width="2.2" height="12" rx="0.4" />
            </svg>
            <svg viewBox="0 0 16 12" className="h-2.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M1.5 4.6c3.4-3 9.6-3 13 0" strokeLinecap="round" />
              <path d="M4 7.2c2.1-1.8 5.9-1.8 8 0" strokeLinecap="round" />
              <circle cx="8" cy="10" r="0.9" fill="currentColor" stroke="none" />
            </svg>
            <svg viewBox="0 0 24 12" className="h-2.5 w-5">
              <rect x="0.6" y="1" width="18" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="2" y="2.4" width="13" height="7.2" rx="1.2" fill="currentColor" />
              <path d="M20 4.2v3.6c.8-.2 1.4-1 1.4-1.8S20.8 4.4 20 4.2Z" fill="currentColor" />
            </svg>
          </span>
        </div>
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
              <IconMark className="size-5 [--background:#ffffff]" />
              RvessFlow
            </p>
            <span className="grid size-6 place-items-center rounded-full bg-[#F4F3EF]">
              <ProductGlyph name="lock" className="size-3.5" />
            </span>
          </div>
          <p className="mt-3.5 text-[11px] text-[#8B919A]">Total balance{hold ? "" : ` · ${quote.unit}`}</p>
          <p className={`mt-0.5 leading-none font-semibold tracking-[-0.045em] tabular-nums ${balanceSize}`}>
            <LiveMoney usd={2480} perDay={STREAM_PER_DAY} quote={quote} readAt={readAt} still={still} hold={hold} />
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#3C9A34]">
            <svg viewBox="0 0 12 12" className="size-2.5" fill="none" aria-hidden="true">
              <path d="M6 9.5V2.5M6 2.5 3.2 5.2M6 2.5l2.8 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            12% this month
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-[#3C9A34] tabular-nums">
            {hold ? "—" : `+${show(usdToWei(perSecond), quote, rateDigits)} ${quote.unit} each second`}
          </p>
          <ul className="mt-4 grid grid-cols-4 gap-1">
            {quick.map((item) => (
              <li key={item.label} className="flex flex-col items-center gap-1">
                <span className={`grid size-9 place-items-center rounded-full ${item.well} ${item.ink}`}>
                  <ProductGlyph name={item.name} className="size-4" />
                </span>
                <span className="text-[10px] font-medium text-[#3A4048]">{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3.5 text-[11px] font-medium text-[#8B919A]">Active</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-2">
            <li className="rounded-[1.05rem] bg-[#F5F4F1] px-2.5 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-[#E5F6D4] text-[#3C9A34]">
                <ProductGlyph name="save" className="size-3.5" />
              </span>
              <p className="mt-2 text-[11px] leading-tight font-semibold">Travel Goal</p>
              <p className="mt-0.5 text-[10px] leading-tight text-[#8B919A] tabular-nums">
                <LiveMoney usd={820} perDay={SAVE_PER_DAY} ceilingUsd={1000} quote={quote} readAt={readAt} still={still} hold={hold} />
                <span> / {hold ? "—" : show(usdToWei(1000), quote)}</span>
              </p>
            </li>
            <li className="rounded-[1.05rem] bg-[#F5F4F1] px-2.5 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-[#EDE6FF] text-[#7A5CDB]">
                <ProductGlyph name="stream" className="size-3.5" />
              </span>
              <p className="mt-2 text-[11px] leading-tight font-semibold">Stream Plan</p>
              <p className="mt-0.5 text-[10px] leading-tight text-[#8B919A] tabular-nums">
                <LiveMoney usd={12.4} perDay={STREAM_PER_DAY} ceilingUsd={STREAM_PER_DAY} quote={quote} readAt={readAt} still={still} hold={hold} />
                <span> / {hold ? "—" : `${show(usdToWei(STREAM_PER_DAY), quote)} today`}</span>
              </p>
            </li>
            <li className="rounded-[1.05rem] bg-[#F5F4F1] px-2.5 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-[#F1F0EC] text-[#1A1C1F]">
                <ProductGlyph name="lock" className="size-3.5" />
              </span>
              <p className="mt-2 text-[11px] leading-tight font-semibold">Lock Vault</p>
              <p className="mt-0.5 text-[10px] leading-tight text-[#8B919A] tabular-nums">{hold ? "—" : `${show(usdToWei(1000), quote)} · 3 months`}</p>
            </li>
            <li className="rounded-[1.05rem] bg-[#F5F4F1] px-2.5 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-[#E4F0FF] text-[#3B82F6]">
                <ProductGlyph name="groups" className="size-3.5" />
              </span>
              <p className="mt-1.5 text-[10px] font-medium text-[#8B919A]">Group</p>
              <p className="text-[11px] leading-tight font-semibold">Group Rotation</p>
              <p className="mt-0.5 text-[10px] leading-tight text-[#8B919A]">Next turn: 3 days</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

let stageClock = 0;

function stageReadAt() {
  if (!stageClock) stageClock = Math.floor(Date.now() / 1000);
  return stageClock;
}

export function PhoneStage({ quote, placed, hold = false }: { quote: Quote; placed: boolean; hold?: boolean }) {
  const current = useLocalQuote(quote, placed);
  const still = useStill();
  const readAt = useSyncExternalStore(() => () => undefined, stageReadAt, () => 0);
  return (
    <div className="relative mx-auto h-[430px] w-full max-w-[440px] sm:h-[500px] lg:h-[620px] lg:max-w-[560px]" aria-hidden="true">
      <div className="absolute top-0 left-1/2 w-[520px] origin-top -translate-x-1/2 scale-[0.74] sm:scale-[0.86] lg:scale-100">
        <div className="relative h-[600px]">
          <div className="absolute top-[18%] left-[2%] h-48 w-48 rounded-full bg-[#E3D6FB] blur-2xl" />
          <div className="absolute top-[42%] left-[8%] h-36 w-40 rounded-full bg-[#D5C4F8]/90 blur-xl" />
          <div className="absolute right-[2%] bottom-[16%] h-36 w-40 rounded-full bg-[#E6DBFC] blur-2xl" />

          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 520 600" fill="none">
            <path
              d="M36 250c-8 90 40 170 130 196 92 26 150-20 196-78 36-46 78-52 112-18"
              stroke="#D2F241"
              strokeWidth="28"
              strokeLinecap="round"
            />
            <path
              d="M36 250c-8 90 40 170 130 196 92 26 150-20 196-78 36-46 78-52 112-18"
              stroke="#F3FF9A"
              strokeWidth="10"
              strokeLinecap="round"
              opacity="0.55"
            />
          </svg>

          <div className="absolute top-[18px] left-1/2 w-[278px] -translate-x-1/2">
            <Device quote={current} readAt={readAt || null} still={still} hold={hold} />
          </div>

          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" viewBox="0 0 520 600" fill="none">
            <path d="M300 548c62 34 150 8 176-48" stroke="#D2F241" strokeWidth="26" strokeLinecap="round" />
            <path d="M300 548c62 34 150 8 176-48" stroke="#F4FFA4" strokeWidth="8" strokeLinecap="round" opacity="0.5" />
          </svg>

          <div className="stage-float absolute top-[108px] right-[18px] z-20 w-[62px]">
            <svg viewBox="0 0 80 90" className="h-auto w-full drop-shadow-[0_12px_12px_rgba(170,200,30,0.28)]">
              <path d="M40 6 72 24 40 42 8 24Z" fill="#E9FF78" />
              <path d="M8 24 40 42 40 78 8 60Z" fill="#A8D414" />
              <path d="M40 42 72 24 72 60 40 78Z" fill="#C8EE38" />
            </svg>
          </div>
          <div className="absolute right-[28px] bottom-[36px] z-20 w-[58px]">
            <svg viewBox="0 0 80 90" className="h-auto w-full drop-shadow-[0_10px_12px_rgba(120,90,200,0.2)]">
              <path d="M40 8 70 24 40 40 10 24Z" fill="#DDD0FC" />
              <path d="M10 24 40 40 40 74 10 58Z" fill="#9B7FE6" />
              <path d="M40 40 70 24 70 58 40 74Z" fill="#C4B0F6" />
            </svg>
          </div>

          <div className="absolute -top-1 -right-2 z-20 hidden w-[132px] lg:block">
            <p className="font-script text-[1.65rem] leading-[0.95] text-[#1c1c1c]">
              Real savings.
              <br />
              Real progress.
            </p>
            <svg viewBox="0 0 90 64" className="-mt-1 ml-1 h-10 w-14 -rotate-[28deg]">
              <path d="M80 6C36 8 14 26 12 56" fill="none" stroke="#1c1c1c" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M4 46c5 6 9 11 11 13 1-7 6-11 13-13" fill="none" stroke="#1c1c1c" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
