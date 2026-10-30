import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import Loading from "../../../../loading";
import { FlowingAmount, FlowingProgress } from "@/components/flowing";
import { ProductMark } from "@/components/product";
import { IconCalendar } from "@/components/icons";
import { Amount, Page, when } from "@/components/ui-bits";
import { labeled, percent } from "@/lib/display";
import { tokenUsdWei } from "@/lib/flow-value";
import { loadPrices } from "@/lib/prices";
import { loadQuote } from "@/lib/rates";
import { loadIncoming } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import { requestNowSeconds } from "@/lib/request-time";
import { Progress } from "@/components/ui/progress";

export default function IncomingGoalPage({ params }: { params: Promise<{ vault: string; id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <IncomingBody params={params} />
    </Suspense>
  );
}

async function IncomingBody({ params }: { params: Promise<{ vault: string; id: string }> }) {
  const { vault, id } = await params;
  if (!isAddress(vault) || !/^\d+$/.test(id)) notFound();
  const who = await viewer();
  const [incoming, quote, priced] = await Promise.all([loadIncoming(who.address), loadQuote(), loadPrices()]);
  const item = incoming.find((entry) => entry.vault.toLowerCase() === vault.toLowerCase() && entry.flow.id === id);
  if (!item) notFound();
  const flow = item.flow;
  const px = { usdcUsd8: priced.usdcUsd8, ethUsd8: priced.ethUsd8, gdxUsd8: priced.gdxUsd8 };
  const whole = tokenUsdWei(BigInt(flow.reserved), flow.token, px).toString();
  const part = tokenUsdWei(BigInt(flow.reserved) - BigInt(flow.remaining), flow.token, px).toString();
  const rate = tokenUsdWei(BigInt(flow.rate), flow.token, px).toString();
  const live = flow.active && !flow.paused && !flow.settled;
  const readAt = await requestNowSeconds();
  const status = flow.settled ? "Closed" : flow.paused ? "Paused" : flow.active ? "Active" : "Waiting";
  return (
    <Page title={flow.name} back="/goals/flow">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProductMark kind={flow.kind} size="md" token={flow.token} />
          <div>
            <p className="font-medium">{flow.name}</p>
            <p className="text-sm text-muted-foreground">From {item.from}</p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">{status}</span>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">This streams into your wallet. {item.from} owns the goal, so only they can pause or close it.</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          {live ? <FlowingAmount readAt={readAt} base={part} perSecond={rate} ceiling={whole} quote={quote} /> : <Amount value={part} quote={quote} />}
          <p className="text-sm text-muted-foreground">of {labeled(whole, quote)}</p>
        </div>
        <p className="text-sm font-medium tabular-nums">{percent(part, whole)}%</p>
      </div>
      {live ? (
        <FlowingProgress readAt={readAt} base={part} perSecond={rate} ceiling={whole} whole={whole} />
      ) : (
        <Progress value={percent(part, whole)} className="mt-4 h-2" />
      )}
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <IconCalendar className="size-4" />
        Ends · {when(flow.end || flow.earliestStart)}
      </div>
    </Page>
  );
}
