"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { ChainTiles, CycleCount, DurationChips, PayoutTiles, TokenChips, field } from "@/components/group-terms";
import { GroupMoney, TokenIcon } from "@/components/token-icon";
import { GroupSection, GroupStepper, MemberCard, groupMark } from "@/components/groups-ui";
import { createDraft, type ActionState } from "@/lib/actions";
import { cyclePlan, spanLabel, type CycleChoice } from "@/lib/cycle";
import { type GroupTokenKind } from "@/lib/group-token";
import { MIN_GROUP_MEMBERS } from "@/lib/group-ui";
import { groupNetLabel, recommendedGroupNet, type GroupNet } from "@/lib/group-network";

const steps = ["Details", "Schedule", "Members", "Review"];
const lime = "h-12 w-full rounded-full bg-[#D6F34A] text-base font-semibold text-[#141414] hover:bg-[#D6F34A] disabled:opacity-40";

export function CreateGroup({ live, organizer }: { live: Record<GroupNet, boolean>; organizer: string }) {
  const [state, action, pending] = useActionState(createDraft, null as ActionState);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contribution, setContribution] = useState("");
  const [cycles, setCycles] = useState("2");
  const [choice, setChoice] = useState<CycleChoice>("week");
  const [days, setDays] = useState("14");
  const [network, setNetwork] = useState<GroupNet>(recommendedGroupNet);
  const [token, setToken] = useState<GroupTokenKind>("usd");
  const [payout, setPayout] = useState(live[recommendedGroupNet] ? "plain" : "stream");
  function pickNetwork(next: GroupNet) {
    setNetwork(next);
    if (next !== "celo") setToken("usd");
    setPayout(live[next] ? payout : "stream");
  }
  function pickToken(next: GroupTokenKind) {
    setToken(next);
    if (next === "gdx") {
      setNetwork("celo");
      if (!live.celo) setPayout("stream");
    }
  }
  const plan = cyclePlan(choice, Number(days));
  const total = Number(contribution) > 0 ? (Number(contribution) * Number(cycles || 0)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";
  const detailsReady = Boolean(name.trim() && Number(contribution) > 0);
  const scheduleReady = Boolean(plan && Number(cycles));
  const mark = step === 4 ? groupMark.success : groupMark.create;

  const hidden = (
    <>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="contribution" value={contribution} />
      <input type="hidden" name="cycles" value={cycles} />
      <input type="hidden" name="cycle" value={choice} />
      <input type="hidden" name="days" value={days} />
      <input type="hidden" name="payout" value={payout} />
      <input type="hidden" name="network" value={network} />
      <input type="hidden" name="token" value={token} />
    </>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-8 lg:max-w-4xl">
      <div>
        <GroupStepper step={step} labels={steps} />
        {step === 1 ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!detailsReady) return;
              setStep(2);
            }}
          >
            <GroupSection title="Group details">
              <p className="mb-4 text-sm leading-relaxed text-[#5C6572]">Name the group and how much each person pays each turn.</p>
              <div className="grid gap-4">
                <label className="block space-y-1.5">
                  <Label htmlFor="name">Group name</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly Boost" className={field} />
                </label>
                <label className="block space-y-1.5">
                  <Label htmlFor="description">What the group is for</Label>
                  <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Save together every week" className={field} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <Label htmlFor="contribution">Contribution amount</Label>
                    <Input id="contribution" value={contribution} onChange={(event) => setContribution(event.target.value)} placeholder="20" inputMode="decimal" className={field} />
                  </label>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <TokenChips network={network} token={token} onToken={pickToken} />
                    <p className="text-xs leading-relaxed text-[#5C6572]">
                      {token === "gdx" ? "Good Dollar on Celo." : network === "celo" ? "Dollar token on Celo (cUSDx)." : "Dollar token on Base (USDCx)."}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>How often</Label>
                  <DurationChips choice={choice} onChoice={setChoice} />
                </div>
              </div>
            </GroupSection>
            <StickyNext>
              <Button type="submit" disabled={!detailsReady} className={lime}>
                Next
              </Button>
            </StickyNext>
          </form>
        ) : null}
        {step === 2 ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!scheduleReady) return;
              setStep(3);
            }}
          >
            <GroupSection title="Schedule">
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cycles">Number of turns</Label>
                  <CycleCount value={cycles} onChange={setCycles} />
                </div>
                {choice === "custom" ? (
                  <label className="block space-y-1.5">
                    <Label htmlFor="days">Days each turn</Label>
                    <Input id="days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} className={field} />
                  </label>
                ) : null}
                <div className="space-y-1.5">
                  <Label>Blockchain</Label>
                  <ChainTiles network={network} onNetwork={pickNetwork} />
                  <p className="text-xs leading-relaxed text-[#5C6572]">Celo is the usual chain for groups here. Base stays available.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>How payouts are sent</Label>
                  <PayoutTiles payout={payout} onPayout={setPayout} live={live[network]} />
                </div>
              </div>
              {plan && Number(contribution) > 0 ? (
                <dl className="mt-5 divide-y divide-[#E6EADF] rounded-2xl bg-[#F7F8F4] text-sm">
                  <Row label="Each member pays" value={<GroupMoney amount={contribution} token={token} network={network} />} />
                  <Row label="How often" value={spanLabel(plan.cycle)} />
                  <Row label="Turns" value={cycles} />
                  <Row label="You post for all turns" value={total ? <GroupMoney amount={total} token={token} network={network} /> : "—"} />
                </dl>
              ) : null}
            </GroupSection>
            <StickyNext>
              <Button type="submit" disabled={!scheduleReady} className={lime}>
                Next
              </Button>
              <Button type="button" variant="outline" className="h-12 w-full rounded-full text-base" onClick={() => setStep(1)}>
                Back
              </Button>
            </StickyNext>
          </form>
        ) : null}
        {step === 3 ? (
          <div className="space-y-4">
            <GroupSection title="Add members">
              <p className="mb-3 text-sm leading-relaxed text-[#5C6572]">
                You start as the organizer. After this draft is saved, add people until there are {MIN_GROUP_MEMBERS}, including you.
              </p>
              <div className="space-y-2">
                <MemberCard name={organizer} role="Organizer" status="Ready" you />
                {Array.from({ length: MIN_GROUP_MEMBERS - 1 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-dashed border-[#E6EADF] px-3 py-4 text-sm text-[#5C6572]">
                    Invite member
                  </div>
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-[#F7F8F4] px-3 py-3">
                  <dt className="text-xs text-[#5C6572]">Minimum members</dt>
                  <dd className="mt-1 font-semibold text-[#141414]">{MIN_GROUP_MEMBERS}</dd>
                </div>
                <div className="rounded-2xl bg-[#F7F8F4] px-3 py-3">
                  <dt className="text-xs text-[#5C6572]">Pending invitations</dt>
                  <dd className="mt-1 font-semibold text-[#141414]">0</dd>
                </div>
              </dl>
            </GroupSection>
            <StickyNext>
              <Button type="button" className={lime} onClick={() => setStep(4)}>
                Next
              </Button>
              <Button type="button" variant="outline" className="h-12 w-full rounded-full text-base" onClick={() => setStep(2)}>
                Back
              </Button>
            </StickyNext>
          </div>
        ) : null}
        {step === 4 ? (
          <form action={action} className="space-y-4">
            {hidden}
            <GroupSection title="Review">
              <p className="text-lg font-semibold text-[#141414]">{name || "Untitled group"}</p>
              {description ? <p className="mt-1 text-sm leading-relaxed text-[#5C6572]">{description}</p> : null}
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Row label="Contribution" value={<GroupMoney amount={contribution} token={token} network={network} />} />
                <Row
                  label="Currency"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <TokenIcon symbol={token === "gdx" ? "G$" : network === "celo" ? "cUSDx" : "USDCx"} className="size-4" withChain={false} />
                      {token === "gdx" ? "G$ on Celo" : `USD on ${groupNetLabel(network)}`}
                    </span>
                  }
                />
                <Row label="Frequency" value={plan ? spanLabel(plan.cycle) : "Choose a cycle length"} />
                <Row label="Turns" value={cycles} />
                <Row label="You pay, all turns" value={total ? <GroupMoney amount={total} token={token} network={network} /> : "—"} />
                <Row label="Payout" value={payout === "plain" ? "Paid each turn" : "Streaming pot"} />
                <Row label="Blockchain" value={groupNetLabel(network)} />
                <Row label="Members" value={`You now. Add ${MIN_GROUP_MEMBERS - 1} more after saving.`} />
              </dl>
            </GroupSection>
            <ErrorNote error={state?.error} />
            <StickyNext>
              <Button type="submit" disabled={pending || !plan} className={lime}>
                {pending ? "Creating…" : "Create group"}
              </Button>
              <Button type="button" variant="outline" className="h-12 w-full rounded-full text-base" onClick={() => setStep(3)}>
                Back
              </Button>
            </StickyNext>
          </form>
        ) : null}
      </div>
      <aside className="mt-6 hidden rounded-[1.6rem] bg-[#F7F8F4] p-6 lg:sticky lg:top-8 lg:mt-12 lg:block">
        <img src={mark} alt="" className="mx-auto w-full max-w-[12rem] object-contain" />
        <p className="mt-4 text-center text-sm leading-relaxed text-[#5C6572]">
          {step === 1
            ? "Start a rotating savings group and grow together."
            : step === 2
              ? "Each member pays the same amount, then takes a turn receiving the pot."
              : step === 3
                ? `You need ${MIN_GROUP_MEMBERS} people, including you, before the group can start on-chain.`
                : "Check the terms. Starting the rotation happens after people join."}
        </p>
      </aside>
    </div>
  );
}

function StickyNext({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-20 z-10 space-y-2 bg-gradient-to-t from-[#f7f6f3] via-[#f7f6f3] to-transparent pb-2 pt-3 lg:static lg:bg-none lg:p-0">{children}</div>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-3 sm:px-0 sm:py-0">
      <dt className="text-xs text-[#5C6572]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#141414]">{value}</dd>
    </div>
  );
}
