"use client";

import { useEffect, useState } from "react";
import { formatGdx, fromWire, type ChainStats, type ProtocolStats, type ProtocolStatsWire } from "@/lib/protocol-stats-view";

function n(value: number) {
  return value.toLocaleString("en-US");
}

function Kpis({ data }: { data: ProtocolStats }) {
  const cards = [
    { label: "Users", value: n(data.users) },
    { label: "Transactions", value: n(data.txs) },
    { label: "Vaults", value: n(data.vaults) },
    { label: "Groups", value: n(data.groupsCreated) },
    { label: "Groups started", value: n(data.groupsStarted) },
    { label: "Locks", value: n(data.locksOpened) },
    { label: "G$ used", value: formatGdx(data.gdx) },
  ];
  return (
    <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <li key={card.label} className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_0_rgba(20,20,20,0.04)]">
          <p className="text-[1.65rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">{card.value}</p>
          <p className="mt-2 text-sm text-[#5C6572]">{card.label}</p>
        </li>
      ))}
    </ul>
  );
}

function ExplorerLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      className="rounded-full bg-[#F3F1EA] px-3 py-1.5 text-sm font-medium text-[#141414] hover:bg-[#EAE6DC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function ChainCard({ chain }: { chain: ChainStats }) {
  return (
    <section className="rounded-2xl bg-white px-5 py-5 shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <h2 className="text-base font-semibold tracking-[-0.02em]">{chain.name}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-[#5C6572]">Users</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{n(chain.users)}</dd>
        </div>
        <div>
          <dt className="text-[#5C6572]">Transactions</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{n(chain.txs)}</dd>
        </div>
        <div>
          <dt className="text-[#5C6572]">Vaults</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{n(chain.vaults)}</dd>
        </div>
        <div>
          <dt className="text-[#5C6572]">Groups</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{n(chain.groupsCreated)}</dd>
        </div>
        <div>
          <dt className="text-[#5C6572]">Started</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{n(chain.groupsStarted)}</dd>
        </div>
        <div>
          <dt className="text-[#5C6572]">Locks</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{n(chain.locksOpened)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[#5C6572]">G$ used</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{formatGdx(chain.gdx)}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <ExplorerLink href={`${chain.explorer}/address/${chain.factory}`}>Factory</ExplorerLink>
        <ExplorerLink href={`${chain.explorer}/address/${chain.groups}`}>Groups</ExplorerLink>
        <ExplorerLink href={`${chain.explorer}/address/${chain.locks}`}>Locks</ExplorerLink>
      </div>
    </section>
  );
}

function Loading() {
  return (
    <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading on-chain stats">
      {Array.from({ length: 7 }, (_, i) => (
        <li key={i} className="h-[5.5rem] animate-pulse rounded-2xl bg-white" />
      ))}
    </ul>
  );
}

export function ProtocolStatsPanel() {
  const [data, setData] = useState<ProtocolStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/stats")
      .then((res) => {
        if (!res.ok) throw new Error("stats");
        return res.json() as Promise<ProtocolStatsWire>;
      })
      .then((wire) => {
        if (live) setData(fromWire(wire));
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <p className="mt-8 text-sm text-[#6B7280]">
        Could not read Celo and Base right now. Try again in a minute, or open the contract links on each explorer.
      </p>
    );
  }
  if (!data) return <Loading />;

  const when = new Date(data.at).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return (
    <>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#6B7280]">
        Group and lock totals come from the live contracts. Users, vaults, transactions, and G$ are from a recent public RPC window. G$ is Celo only. {when}.
      </p>
      <Kpis data={data} />
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {data.chains.map((chain) => (
          <ChainCard key={chain.name} chain={chain} />
        ))}
      </div>
    </>
  );
}
