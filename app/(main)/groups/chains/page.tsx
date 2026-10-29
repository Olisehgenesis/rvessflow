import Link from "next/link";
import { Page } from "@/components/ui-bits";
import { groupChainFacts, recommendedGroupNet } from "@/lib/group-network";
import { groupPlainOn } from "@/lib/group-site";
import { groupUpgradeLine } from "@/lib/group-upgrade";

export default async function GroupChainsPage() {
  const [celo, base] = await Promise.all([groupPlainOn("celo"), groupPlainOn("base")]);
  const status = { celo, base };
  return (
    <Page title="Base and Celo" back="/groups/new">
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        One address holds tokens on both chains. A group lives on the chain you pick when you create it. Members pay in that chain&apos;s dollar token. You cannot move a running group across.
      </p>
      <ul className="space-y-4">
        {(["celo", "base"] as const).map((net) => {
          const fact = groupChainFacts[net];
          const wait = groupUpgradeLine(status[net]);
          return (
            <li key={net} className="rounded-3xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{fact.title}</h2>
                {fact.recommend ? <span className="rounded-full bg-[#E7F4C4] px-2.5 py-1 text-xs font-medium">Recommended</span> : null}
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-medium">Network fee</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{fact.fee}</dd>
                </div>
                <div>
                  <dt className="font-medium">Each turn</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{wait ?? fact.turn}</dd>
                </div>
                <div>
                  <dt className="font-medium">The pot</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{fact.token}</dd>
                </div>
                <div>
                  <dt className="font-medium">Passkeys</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{fact.passkey}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        {groupChainFacts[recommendedGroupNet].title} is the default for a new group because a wallet can pay the fee in a dollar token and paid each turn is already live. Pick Base if the circle already holds USDC there, or if you sign with a passkey and want the USDC fee on this app.
      </p>
      <Link href="/groups/new" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        Create a group
      </Link>
    </Page>
  );
}
