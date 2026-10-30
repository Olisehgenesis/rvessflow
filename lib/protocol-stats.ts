import "server-only";

import { createPublicClient, http, parseAbi, parseAbiItem, type Address, type Log, type PublicClient } from "viem";
import { base, celo } from "viem/chains";
import { connection } from "next/server";
import { celoRpcForno } from "@/lib/network";
import { type ChainStats, formatGdx, sumStats, type ProtocolStats } from "@/lib/protocol-stats-view";

export type { ChainStats, ProtocolStats };
export { formatGdx, sumStats };

const vaultCreated = parseAbiItem("event VaultCreated(address indexed owner, address indexed vault)");
const locked = parseAbiItem("event Locked(uint256 indexed id, address indexed owner, address indexed token, uint256 principal, uint64 end, int96 yieldRate)");
const groupCreated = parseAbiItem("event GroupCreated(uint256 indexed id, address indexed creator, address indexed token, uint16 members, uint16 cycles)");
const groupStarted = parseAbiItem("event GroupStarted(uint256 indexed id, uint64 startTime, address pool)");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const nextIdAbi = parseAbi(["function nextId() view returns (uint256)"]);

const GDX = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as Address;
/** Forno rejects getLogs over ~2000 blocks. One window stays under that cap. */
const LOG_SPAN = 1_800n;

const celoSite = {
  name: "Celo",
  explorer: "https://celoscan.io",
  factory: "0x0060f57E447e5E2D310b61cAD372Ae83959aF3B7" as Address,
  locks: "0x0A55056218036f3396b00115e44569eb7D33e951" as Address,
  groups: "0xc9c9483ab7BB269Ce50Ff265A5b0583268e39F63" as Address,
  goodDollar: GDX,
};

const baseSite = {
  name: "Base",
  explorer: "https://basescan.org",
  factory: "0xc21B7Bd68F8235b7DB2827334d2039fD8B3C118d" as Address,
  locks: "0x68B0667E098A62b3e3F437DBeb0aEdB746cD4c41" as Address,
  groups: "0x13008059FAd0348Fb8848A0737F9E826C82199fa" as Address,
  goodDollar: null as Address | null,
};

type Site = typeof celoSite | typeof baseSite;
type LogEvent = typeof vaultCreated | typeof locked | typeof groupCreated | typeof groupStarted | typeof transfer;

function rpc(url: string) {
  return http(url, { timeout: 8_000, retryCount: 1 });
}

function blank(site: Site): ChainStats {
  return {
    name: site.name,
    explorer: site.explorer,
    factory: site.factory,
    locks: site.locks,
    groups: site.groups,
    vaults: 0,
    groupsCreated: 0,
    groupsStarted: 0,
    locksOpened: 0,
    txs: 0,
    users: 0,
    gdx: 0n,
  };
}

function withBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

type Rpc = Pick<PublicClient, "getBlockNumber" | "getLogs" | "readContract">;

async function logsInRange(
  client: Rpc,
  params: { address: Address; event: LogEvent; args?: object },
  from: bigint,
  to: bigint,
): Promise<Log[]> {
  return withBudget(
    client.getLogs({
      address: params.address,
      event: params.event,
      args: params.args as never,
      fromBlock: from,
      toBlock: to,
    }) as Promise<Log[]>,
    6_000,
    [],
  );
}

function accountOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) return null;
  return value.toLowerCase();
}

function argsOf(log: Log): Record<string, unknown> {
  return ((log as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>;
}

async function readChain(client: Rpc, site: Site): Promise<ChainStats> {
  const latest = await client.getBlockNumber();
  const from = latest > LOG_SPAN ? latest - LOG_SPAN : 0n;
  const to = latest;

  const [vaultLogs, lockLogs, groupLogs, startLogs, nextGroup, nextLock] = await Promise.all([
    logsInRange(client, { address: site.factory, event: vaultCreated }, from, to),
    logsInRange(client, { address: site.locks, event: locked }, from, to),
    logsInRange(client, { address: site.groups, event: groupCreated }, from, to),
    logsInRange(client, { address: site.groups, event: groupStarted }, from, to),
    client.readContract({ address: site.groups, abi: nextIdAbi, functionName: "nextId" }).catch(() => 1n),
    client.readContract({ address: site.locks, abi: nextIdAbi, functionName: "nextId" }).catch(() => 1n),
  ]);

  const vaults = [...new Set(vaultLogs.map((log) => argsOf(log).vault).filter((value): value is Address => typeof value === "string"))] as Address[];
  const people = new Set<string>();
  const txs = new Set<string>();

  for (const log of vaultLogs) {
    const owner = accountOf(argsOf(log).owner);
    if (owner) people.add(owner);
    if (log.transactionHash) txs.add(log.transactionHash);
  }
  for (const log of lockLogs) {
    const owner = accountOf(argsOf(log).owner);
    if (owner) people.add(owner);
    if (log.transactionHash) txs.add(log.transactionHash);
  }
  for (const log of groupLogs) {
    const creator = accountOf(argsOf(log).creator);
    if (creator) people.add(creator);
    if (log.transactionHash) txs.add(log.transactionHash);
  }
  for (const log of startLogs) {
    if (log.transactionHash) txs.add(log.transactionHash);
  }

  let gdx = 0n;
  const token = site.goodDollar;
  if (token) {
    const touch = [site.locks, site.groups];
    const legs = await Promise.all(
      touch.flatMap((addr) => [
        logsInRange(client, { address: token, event: transfer, args: { to: addr } }, from, to),
        logsInRange(client, { address: token, event: transfer, args: { from: addr } }, from, to),
      ]),
    );
    const seen = new Set<string>();
    for (const log of legs.flat()) {
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (log.transactionHash) txs.add(log.transactionHash);
      const value = argsOf(log).value;
      if (typeof value === "bigint") gdx += value;
    }
  }

  const groupsFromId = Math.max(0, Number(nextGroup) - 1);
  const locksFromId = Math.max(0, Number(nextLock) - 1);

  return {
    name: site.name,
    explorer: site.explorer,
    factory: site.factory,
    locks: site.locks,
    groups: site.groups,
    vaults: Math.max(vaultLogs.length, vaults.length),
    groupsCreated: Math.max(groupLogs.length, groupsFromId),
    groupsStarted: startLogs.length,
    locksOpened: Math.max(lockLogs.length, locksFromId),
    txs: txs.size,
    users: people.size,
    gdx,
  };
}

export async function loadProtocolStats(): Promise<ProtocolStats> {
  await connection();
  const celoClient = createPublicClient({ chain: celo, transport: rpc(celoRpcForno) });
  const baseClient = createPublicClient({
    chain: base,
    transport: rpc(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
  });

  const [celoStats, baseStats] = await Promise.all([
    readChain(celoClient as Rpc, celoSite).catch(() => blank(celoSite)),
    readChain(baseClient as Rpc, baseSite).catch(() => blank(baseSite)),
  ]);

  const chains = [celoStats, baseStats];
  return { at: Date.now(), chains, ...sumStats(chains) };
}
