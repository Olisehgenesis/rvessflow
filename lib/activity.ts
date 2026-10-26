import "server-only";

import { parseAbiItem, zeroAddress, type Address } from "viem";
import { assetKind } from "@/lib/assets";
import { listActivity, type ActivityRecord } from "@/lib/notes";
import { addresses, loadPortfolio, publicClient, type FlowRow, type Portfolio } from "@/lib/protocol";

export type ActivityView = {
  id: string;
  title: string;
  detail: string;
  direction: "in" | "out";
  amount: string;
  asset: "usdcx" | "ethx";
  at: number;
  href: string;
};

const deposited = parseAbiItem("event Deposited(address indexed from, address indexed token, uint256 amount)");
const withdrawn = parseAbiItem("event Withdrawn(address indexed to, address indexed token, uint256 amount)");
const flowCreated = parseAbiItem("event FlowCreated(uint256 indexed id, uint256 indexed parentId, address indexed recipient, address token, int96 rate)");
const flowSettled = parseAbiItem("event FlowSettled(uint256 indexed id, uint256 refunded)");
const locked = parseAbiItem("event Locked(uint256 indexed id, address indexed owner, address indexed token, uint256 principal, uint64 end, int96 yieldRate)");
const broken = parseAbiItem("event Broken(uint256 indexed id, uint256 payout, uint256 penalty)");
const matured = parseAbiItem("event Matured(uint256 indexed id, uint256 principal, uint256 bonus)");

let fromBlock: bigint | null = null;

async function historyStart(): Promise<bigint> {
  if (fromBlock !== null) return fromBlock;
  const latest = await publicClient.getBlockNumber();
  let lo = latest > 8_000_000n ? latest - 8_000_000n : 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await publicClient.getCode({ address: addresses.factory, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1n;
  }
  fromBlock = lo > 0n ? lo - 1n : 0n;
  return fromBlock;
}

async function safeLogs<T>(load: (start: bigint) => Promise<T[]>): Promise<T[]> {
  try {
    return await load(await historyStart());
  } catch {
    try {
      const latest = await publicClient.getBlockNumber();
      const start = latest > 80_000n ? latest - 80_000n : 0n;
      return await load(start);
    } catch {
      return [];
    }
  }
}

function flowAmount(flow: FlowRow | undefined): bigint {
  if (!flow) return 0n;
  const reserved = BigInt(flow.reserved);
  if (reserved > 0n) return reserved;
  const saved = BigInt(flow.saved);
  if (saved > 0n) return saved;
  return BigInt(flow.goal);
}

export async function loadActivity(owner: Address, portfolio?: Portfolio): Promise<ActivityView[]> {
  const data = portfolio ?? (await loadPortfolio({ address: owner, name: "", index: -1 }));
  const flowsById = new Map(data.flows.map((flow) => [flow.id, flow]));
  const locksById = new Map(data.locks.map((lock) => [lock.id, lock]));
  const drafts: { id: string; title: string; detail: string; direction: "in" | "out"; amount: bigint; asset: "usdcx" | "ethx"; href: string; block: bigint }[] = [];

  if (data.vault && data.vault !== zeroAddress) {
    const vault = data.vault;
    const [deposits, withdraws, created, settled] = await Promise.all([
      safeLogs((start) => publicClient.getLogs({ address: vault, event: deposited, fromBlock: start, toBlock: "latest" })),
      safeLogs((start) => publicClient.getLogs({ address: vault, event: withdrawn, fromBlock: start, toBlock: "latest" })),
      safeLogs((start) => publicClient.getLogs({ address: vault, event: flowCreated, fromBlock: start, toBlock: "latest" })),
      safeLogs((start) => publicClient.getLogs({ address: vault, event: flowSettled, fromBlock: start, toBlock: "latest" })),
    ]);
    for (const log of deposits) {
      if (log.args.amount === undefined || log.blockNumber === null) continue;
      drafts.push({
        id: `${log.transactionHash}:${log.logIndex}`,
        title: "Added money",
        detail: "Wallet",
        direction: "in",
        amount: log.args.amount,
        asset: assetKind(log.args.token ?? addresses.fusdcx),
        href: "/home",
        block: log.blockNumber,
      });
    }
    for (const log of withdraws) {
      if (log.args.amount === undefined || log.blockNumber === null) continue;
      drafts.push({
        id: `${log.transactionHash}:${log.logIndex}`,
        title: "Moved to wallet",
        detail: "Vault",
        direction: "out",
        amount: log.args.amount,
        asset: assetKind(log.args.token ?? addresses.fusdcx),
        href: "/home",
        block: log.blockNumber,
      });
    }
    for (const log of created) {
      if (log.args.parentId !== 0n || log.blockNumber === null || log.args.id === undefined) continue;
      const id = log.args.id.toString();
      const flow = flowsById.get(id);
      const amount = flowAmount(flow);
      if (amount === 0n) continue;
      const saving = flow?.kind === "saving";
      drafts.push({
        id: `${log.transactionHash}:${log.logIndex}`,
        title: saving ? "Saved to goal" : flow?.kind === "expense" ? "Expense" : "Streamed",
        detail: flow?.name || "Goal",
        direction: saving ? "in" : "out",
        amount,
        asset: assetKind(flow?.token ?? log.args.token ?? addresses.fusdcx),
        href: `/goals/${id}`,
        block: log.blockNumber,
      });
    }
    for (const log of settled) {
      if (log.blockNumber === null || log.args.id === undefined) continue;
      const id = log.args.id.toString();
      const flow = flowsById.get(id);
      const amount = log.args.refunded ?? 0n;
      if (amount === 0n) continue;
      drafts.push({
        id: `${log.transactionHash}:${log.logIndex}`,
        title: "Goal closed",
        detail: flow?.name || "Goal",
        direction: "in",
        amount,
        asset: assetKind(flow?.token ?? addresses.fusdcx),
        href: `/goals/${id}`,
        block: log.blockNumber,
      });
    }
  }

  const [opened, breaks, finishes] = await Promise.all([
    safeLogs((start) =>
      publicClient.getLogs({ address: addresses.locks, event: locked, args: { owner }, fromBlock: start, toBlock: "latest" }),
    ),
    safeLogs((start) => publicClient.getLogs({ address: addresses.locks, event: broken, fromBlock: start, toBlock: "latest" })),
    safeLogs((start) => publicClient.getLogs({ address: addresses.locks, event: matured, fromBlock: start, toBlock: "latest" })),
  ]);
  for (const log of opened) {
    if (log.args.principal === undefined || log.blockNumber === null || log.args.id === undefined) continue;
    const id = log.args.id.toString();
    const lock = locksById.get(id);
    drafts.push({
      id: `${log.transactionHash}:${log.logIndex}`,
      title: "Locked",
      detail: lock?.name || "Lock",
      direction: "out",
      amount: log.args.principal,
      asset: assetKind(log.args.token ?? addresses.fusdcx),
      href: `/vaults/${id}`,
      block: log.blockNumber,
    });
  }
  const ownLocks = new Set(data.locks.map((lock) => lock.id));
  for (const log of breaks) {
    if (log.blockNumber === null || log.args.id === undefined || !ownLocks.has(log.args.id.toString())) continue;
    const id = log.args.id.toString();
    drafts.push({
      id: `${log.transactionHash}:${log.logIndex}`,
      title: "Unlocked early",
      detail: locksById.get(id)?.name || "Lock",
      direction: "in",
      amount: log.args.payout ?? 0n,
      asset: assetKind(locksById.get(id)?.token ?? addresses.fusdcx),
      href: `/vaults/${id}`,
      block: log.blockNumber,
    });
  }
  for (const log of finishes) {
    if (log.blockNumber === null || log.args.id === undefined || !ownLocks.has(log.args.id.toString())) continue;
    const id = log.args.id.toString();
    drafts.push({
      id: `${log.transactionHash}:${log.logIndex}`,
      title: "Unlocked",
      detail: locksById.get(id)?.name || "Lock",
      direction: "in",
      amount: (log.args.principal ?? 0n) + (log.args.bonus ?? 0n),
      asset: assetKind(locksById.get(id)?.token ?? addresses.fusdcx),
      href: `/vaults/${id}`,
      block: log.blockNumber,
    });
  }

  const times = new Map<bigint, number>();
  await Promise.all(
    [...new Set(drafts.map((item) => item.block.toString()))].map(async (block) => {
      try {
        const full = await publicClient.getBlock({ blockNumber: BigInt(block) });
        times.set(BigInt(block), Number(full.timestamp));
      } catch {
        times.set(BigInt(block), Math.floor(Date.now() / 1000));
      }
    }),
  );

  const onChain: ActivityView[] = drafts
    .filter((item) => item.amount > 0n)
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      direction: item.direction,
      amount: item.amount.toString(),
      asset: item.asset,
      at: times.get(item.block) ?? Math.floor(Date.now() / 1000),
      href: item.href,
    }));

  let stored: ActivityRecord[] = [];
  try {
    stored = await listActivity(owner);
  } catch {
    stored = [];
  }
  const merged = dedupe([
    ...onChain,
    ...stored.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      direction: item.direction,
      amount: item.amount,
      asset: item.asset,
      at: item.at,
      href: item.href,
    })),
  ]);
  return merged.sort((left, right) => right.at - left.at).slice(0, 100);
}

function dedupe(items: ActivityView[]): ActivityView[] {
  const kept: ActivityView[] = [];
  for (const item of items) {
    const clash = kept.some(
      (other) =>
        other.title === item.title &&
        other.amount === item.amount &&
        other.asset === item.asset &&
        Math.abs(other.at - item.at) < 180,
    );
    if (!clash) kept.push(item);
  }
  return kept.filter((item) => {
    if (item.title !== "Added money") return true;
    return !kept.some(
      (other) =>
        (other.title === "Saved to goal" || other.title === "Streamed" || other.title === "Expense" || other.title === "Locked") &&
        Math.abs(other.at - item.at) < 180,
    );
  });
}
