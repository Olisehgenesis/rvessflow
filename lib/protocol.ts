import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  parseAbi,
  stringToHex,
  hexToString,
  formatUnits,
  parseUnits,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { money, shortAddress } from "@/lib/display";
import { appGroupNet, groupKey, parseGroupKey, type GroupNet } from "@/lib/group-network";
import { groupTokenAddress } from "@/lib/group-token";
import { groupPlainOn, groupsOfOn, groupSite, otherGroupNet } from "@/lib/group-site";
import { vaultSite } from "@/lib/vault-site";
import { appChain, appNetwork, appRpc, celoTransport, explorerUrl, networkLabel, stableName } from "@/lib/network";
import { requestNowSeconds } from "@/lib/request-time";

const network = appNetwork();

const celoDeployed = {
  CELO_ALLOWLIST: "0xfc48D9CaeBb63Ac94D1170E921E126d9722B6C4E",
  CELO_FACTORY: "0x0060f57E447e5E2D310b61cAD372Ae83959aF3B7",
  CELO_LOCKS: "0x0A55056218036f3396b00115e44569eb7D33e951",
  CELO_GROUPS: "0xc9c9483ab7BB269Ce50Ff265A5b0583268e39F63",
} as const;

function configured(name: keyof typeof celoDeployed): Address {
  const value = process.env[name];
  if (value && isAddress(value)) return getAddress(value);
  return celoDeployed[name];
}

export const chain = appChain();
export const rpcUrl = appRpc();
export const explorer = explorerUrl();
export const networkName = networkLabel();
export const stableLabel = stableName();

export const addresses = network === "celo"
  ? {
      allowlist: configured("CELO_ALLOWLIST"),
      factory: configured("CELO_FACTORY"),
      locks: configured("CELO_LOCKS"),
      groups: configured("CELO_GROUPS"),
      fusdcx: "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e" as Address,
      ethx: "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240" as Address,
      cfa: "0xcfA132E353cB4E398080B9700609bb008eceB125" as Address,
    }
  : network === "sepolia"
  ? {
      allowlist: "0xed115A3Ac77036fD7f4ec4B597d655B486d7AB6D" as Address,
      factory: "0x18E484ca13A7e63511343EB474C13e04C0929354" as Address,
      locks: "0x99F4f175e117a16D554AEAbee4a2a5b754c2540E" as Address,
      groups: "0x70f5CF80052E8a8E0e5e252d33cd15F059956E3D" as Address,
      fusdcx: "0x1650581F573eAd727B92073B5Ef8B4f5B94D1648" as Address,
      ethx: "0x143ea239159155B408e71CDbE836e8CFD6766732" as Address,
      cfa: "0xcfA132E353cB4E398080B9700609bb008eceB125" as Address,
    }
  : {
      allowlist: "0x34e748f13c294ED3b8Cdd1dd65C45b58981dBe8b" as Address,
      factory: "0xc21B7Bd68F8235b7DB2827334d2039fD8B3C118d" as Address,
      locks: "0x68B0667E098A62b3e3F437DBeb0aEdB746cD4c41" as Address,
      groups: "0x13008059FAd0348Fb8848A0737F9E826C82199fa" as Address,
      fusdcx: "0xD04383398dD2426297da660F9CCA3d439AF9ce1b" as Address,
      ethx: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93" as Address,
      cfa: "0xcfA132E353cB4E398080B9700609bb008eceB125" as Address,
    };

const appTransport = appNetwork() === "celo" ? celoTransport() : http(rpcUrl);
export const publicClient = createPublicClient({ chain, transport: appTransport });

export const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export const factoryAbi = parseAbi([
  "function vaultOf(address) view returns (address)",
  "function allowlist() view returns (address)",
  "function owner() view returns (address)",
  "function createVault() returns (address)",
]);

export const allowAbi = parseAbi([
  "function isAllowed(address) view returns (bool)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
]);

export const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function unallocated(address) view returns (uint256)",
  "function flowCount() view returns (uint256)",
  "function flowIdAt(uint256) view returns (uint256)",
  "function getFlow(uint256) view returns ((address token, address recipient, address conduit, uint8 kind, uint8 chainMode, uint8 rateMode, uint16 shareBps, uint8 depth, bool allowSubflows, bool keeperGated, bool triggered, bool active, bool settled, bytes32 name, uint64 earliestStart, uint64 duration, uint64 createdAt, uint64 triggeredAt, uint64 start, uint64 end, int96 rate, int96 childRate, int96 liveRate, uint256 parentId, uint256 predecessorId, uint256 goalAmount, uint256 reserved, uint256 buffers, uint256 cushion, bool paused, uint64 remaining, uint64 ran))",
  "function balanceSheet(address) view returns (uint256 idle, uint256 held, uint256 streaming)",
  "function depositSuper(address token, uint256 amount)",
  "function depositUnderlying(address token, uint256 underlyingAmount)",
  "function withdraw(address token, uint256 amount)",
  "function withdrawUnderlying(address token, uint256 amount)",
  "function openSavings(address token, uint256 amount, uint64 duration, bytes32 name, uint256 target) returns (uint256)",
  "function createFlow((address token, address recipient, uint8 kind, uint256 amount, uint64 earliestStart, uint64 duration, uint256 goalAmount, bool allowSubflows, uint256 predecessorId, uint8 chainMode, bool keeperGated, bytes32 name)) returns (uint256)",
  "function activate(uint256 id)",
  "function pause(uint256 id)",
  "function resume(uint256 id)",
  "function topUp(uint256 id, uint256 amount)",
  "function release(uint256 id, uint256 amount)",
  "function cancel(uint256 id)",
  "function settle(uint256 id)",
]);

export const cfaAbi = parseAbi([
  "function getBufferAmountByFlowrate(address token, int96 flowrate) view returns (uint256)",
]);

export const lockAbi = parseAbi([
  "function owner() view returns (address)",
  "function penaltyBps() view returns (uint16)",
  "function yieldBudget(address) view returns (uint256)",
  "function yieldPerTokenPerSecond(address) view returns (uint256)",
  "function locksOf(address) view returns (uint256[])",
  "function locks(uint256) view returns (address owner, address token, uint128 principal, uint64 start, uint64 end, uint256 weight, int96 yieldRate, bool settled, uint16 lockedPenaltyBps, bytes32 name, uint128 targetAmount, uint256 yieldPerWei)",
  "function previewBreak(uint256) view returns (uint256 payout, uint256 penalty)",
  "function previewMature(uint256) view returns (uint256 principal, uint256 bonus)",
  "function lockGoal(address token, uint128 amount, uint64 duration, bool earnYield, bytes32 name, uint128 target) returns (uint256)",
  "function topUp(uint256 id, uint128 amount) returns (uint256)",
  "function breakEarly(uint256 id) returns (uint256 payout, uint256 penalty)",
  "function withdrawMature(uint256 id) returns (uint256 payout, uint256 bonus)",
]);

export const groupAbi = parseAbi([
  "function owner() view returns (address)",
  "function nextId() view returns (uint256)",
  "function groupsOf(address) view returns (uint256[])",
  "function groups(uint256) view returns (address creator, address token, address pool, uint128 contribution, uint128 collateralRequired, uint64 cycleDuration, uint64 windowDuration, uint64 graceDuration, uint64 startTime, uint16 totalCycles, uint16 memberCount, bool started, bool cancelled, bool finalized, uint16 streamingCycle, address streamingTo, int96 rate, uint64 rateUpdatedAt, bool cycleOpen, uint256 receivedSnapshot, bool plain)",
  "function getMember(uint256 id, uint256 index) view returns (address account, uint64 offset, uint128 collateral, bool collateralPosted, bool defaulted, uint256 given, uint256 received, uint256 owed, uint16 missed)",
  "function currentCycle(uint256) view returns (uint256 cycle, bool open)",
  "function createGroup(address token, uint128 contribution, uint64 cycleDuration, uint64 windowDuration, uint64 graceDuration, uint16 totalCycles, address[] accounts, uint64[] offsets) returns (uint256)",
  "function createPlainGroup(address token, uint128 contribution, uint64 cycleDuration, uint64 windowDuration, uint64 graceDuration, uint16 totalCycles, address[] accounts, uint64[] offsets) returns (uint256)",
  "function postCollateral(uint256 id)",
  "function start(uint256 id)",
  "function contribute(uint256 id)",
  "function exitBeforeStart(uint256 id)",
  "function cancelBeforeStart(uint256 id)",
  "function claimCollateral(uint256 id) returns (uint256)",
  "function memberPhone(uint256 id, address account) view returns (bytes32)",
  "function payoutOrder(uint256 id) view returns (uint16[])",
  "function setMemberPhone(uint256 id, address account, bytes32 phone)",
  "function setPayoutOrder(uint256 id, uint16[] indexes)",
]);

const groupLegacyAbi = parseAbi([
  "function groups(uint256) view returns (address creator, address token, address pool, uint128 contribution, uint128 collateralRequired, uint64 cycleDuration, uint64 windowDuration, uint64 graceDuration, uint64 startTime, uint16 totalCycles, uint16 memberCount, bool started, bool cancelled, bool finalized, uint16 streamingCycle, address streamingTo, int96 rate, uint64 rateUpdatedAt, bool cycleOpen, uint256 receivedSnapshot)",
]);

/// Reads a group from the live proxy. Contracts that have not been upgraded yet
/// return one fewer field, and those groups are streaming.
export async function readGroup(id: bigint, net: GroupNet = appGroupNet()) {
  const site = groupSite(net);
  const data = await site.client.call({
    to: site.groups,
    data: encodeFunctionData({ abi: groupAbi, functionName: "groups", args: [id] }),
  });
  const raw = data.data ?? "0x";
  const words = Math.floor((raw.length - 2) / 64);
  return decodeFunctionResult({
    abi: words >= 21 ? groupAbi : groupLegacyAbi,
    functionName: "groups",
    data: raw,
  });
}

/** Live proxy already has paid-each-turn. Celo shipped with it. Base still waits on the scheduled upgrade. */
export async function groupPlainStatus(net: GroupNet = appGroupNet()): Promise<{ live: boolean; readyAt: number }> {
  return groupPlainOn(net);
}

export type Person = { name: string; address: Address };

type Stored = { name: string; address: Address; privateKey: Hex };

/** Local test keys. Production does not ship this file, and a real sign-in does not need it. */
function storedAccounts(): Stored[] {
  const file = path.join(process.cwd(), "wallet", "testers.json");
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    const missing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
    if (missing) return [];
    throw error;
  }
  const parsed = JSON.parse(raw) as { accounts?: Stored[] };
  if (!Array.isArray(parsed.accounts) || parsed.accounts.length === 0) return [];
  return parsed.accounts;
}

export function people(): Person[] {
  return storedAccounts().map(({ name, address }) => ({ name, address }));
}

export function personName(address: Address): string {
  const found = people().find((person) => person.address.toLowerCase() === address.toLowerCase());
  return found?.name ?? shortAddress(address);
}

/** The key for this test account, only when the address matches that slot. */
export function accountKey(index: number, address: Address): Hex | null {
  const chosen = storedAccounts()[index];
  if (!chosen || chosen.address.toLowerCase() !== address.toLowerCase()) return null;
  return chosen.privateKey;
}

function signer(index: number) {
  const accounts = storedAccounts();
  const chosen = accounts[index];
  if (!chosen) throw new Error("That account is not one of the funded test accounts.");
  const account = privateKeyToAccount(chosen.privateKey);
  const wallet = createWalletClient({ account, chain, transport: appTransport });
  return { account, wallet, person: { name: chosen.name, address: chosen.address } };
}

export async function broadcastCalls(index: number, calls: { to: Address; data: Hex; value: string }[]) {
  const { wallet } = signer(index);
  for (const item of calls) {
    const hash = await wallet.sendTransaction({
      to: item.to,
      data: item.data,
      value: BigInt(item.value || "0"),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction reverted.");
  }
}

async function write(index: number, args: Parameters<ReturnType<typeof signer>["wallet"]["writeContract"]>[0]) {
  const { wallet } = signer(index);
  const hash = await wallet.writeContract(args);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction reverted.");
  return hash;
}

async function ensureAllowance(index: number, owner: Address, spender: Address, amount: bigint, token: Address = addresses.fusdcx) {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return;
  await write(index, {
    address: token,
    abi: erc20,
    functionName: "approve",
    args: [spender, amount],
  });
}

export async function depositIdle(index: number, amountRaw: string) {
  const amount = parseAmount(amountRaw);
  const vault = await vaultFor(index);
  await deposit(index, vault, amount);
}

export function readName(value: Hex): string {
  const text = hexToString(value, { size: 32 }).replaceAll("\u0000", "").trim();
  return text;
}

function quietName(value: Hex): string {
  try {
    return readName(value);
  } catch {
    return "";
  }
}

export function toName(value: string): Hex {
  const clean = value.trim();
  if (!clean) throw new Error("Give this a name.");
  if (clean.length > 31) throw new Error("Use 31 characters or fewer.");
  return stringToHex(clean, { size: 32 });
}

export function withProtocolFee(amount: bigint): bigint {
  return amount + (amount * 30n) / 10_000n;
}

export function parseAmount(value: string): bigint {
  const clean = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,18})?$/.test(clean) || Number(clean) <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  return parseUnits(clean, 18);
}

const kindName = ["expense", "saving", "flow"] as const;

export type FlowRow = {
  id: string;
  network: GroupNet;
  name: string;
  kind: "expense" | "saving" | "flow";
  token: Address;
  recipient: Address;
  recipientName: string;
  active: boolean;
  paused: boolean;
  settled: boolean;
  start: number;
  end: number;
  earliestStart: number;
  duration: number;
  createdAt: number;
  rate: string;
  reserved: string;
  goal: string;
  saved: string;
  remaining: string;
};

export type LockRow = {
  id: string;
  network: GroupNet;
  name: string;
  token: Address;
  principal: string;
  target: string;
  start: number;
  end: number;
  settled: boolean;
  penaltyBps: number;
  yieldRate: string;
  breakPayout: string;
  breakPenalty: string;
  matureBonus: string;
};

export type MemberRow = {
  account: Address;
  name: string;
  phone: string;
  posted: boolean;
  collateral: string;
  given: string;
  received: string;
  owed: string;
  missed: number;
};

export type GroupRow = {
  id: string;
  network: string;
  creator: Address;
  creatorName: string;
  contribution: string;
  collateral: string;
  cycleSeconds: number;
  windowSeconds: number;
  graceSeconds: number;
  cycles: number;
  members: MemberRow[];
  /** Member indexes in the order they receive. Empty means the contract has no turn-order call. */
  payout: number[];
  canArrange: boolean;
  canPhone: boolean;
  started: boolean;
  cancelled: boolean;
  finalized: boolean;
  startTime: number;
  cycle: string;
  cycleOpen: boolean;
  token: Address;
};

export type Portfolio = {
  me: Person;
  index: number;
  people: Person[];
  wallet: string;
  eth: string;
  vault: Address | null;
  idle: string;
  held: string;
  streaming: string;
  locked: string;
  total: string;
  readAt: number;
  flows: FlowRow[];
  locks: LockRow[];
  groups: GroupRow[];
  protocol: {
    admin: Address;
    penaltyBps: number;
    yieldBudget: string;
    yieldRate: string;
    tokenAllowed: boolean;
    paused: boolean;
    upgradeReadyAt: number;
  };
};

type FlowRecord = {
  kind: number;
  settled: boolean;
  paused: boolean;
  active: boolean;
  reserved: bigint;
  rate: bigint;
  start: bigint;
  end: bigint;
  duration: bigint;
  remaining: bigint;
  token: Address;
  recipient: Address;
  name: Hex;
  earliestStart: bigint;
  createdAt: bigint;
  goalAmount: bigint;
};

function toFlowRow(id: bigint, flow: FlowRecord, now: bigint, net: GroupNet = appGroupNet()): FlowRow {
  const kind = Number(flow.kind);
  const remaining = kind === 1 && !flow.settled ? flow.reserved : streamRemaining({ ...flow, kind }, now);
  return {
    id: groupKey(net, id),
    network: net,
    name: readName(flow.name) || "Untitled",
    kind: kindName[kind] ?? "flow",
    token: flow.token,
    recipient: flow.recipient,
    recipientName: personName(flow.recipient),
    active: flow.active,
    paused: flow.paused,
    settled: flow.settled,
    start: Number(flow.start),
    end: Number(flow.end),
    earliestStart: Number(flow.earliestStart),
    duration: Number(flow.duration),
    createdAt: Number(flow.createdAt),
    rate: flow.rate.toString(),
    reserved: flow.reserved.toString(),
    goal: flow.goalAmount.toString(),
    saved: (kind === 1 && !flow.settled ? flow.reserved : 0n).toString(),
    remaining: remaining.toString(),
  };
}

export async function loadFlow(owner: Address, key: string): Promise<FlowRow | null> {
  const { net, id } = parseGroupKey(key);
  const site = vaultSite(net);
  const vault = await site.client.readContract({
    address: site.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [owner],
  });
  if (vault === zeroAddress) return null;
  const flow = (await site.client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "getFlow",
    args: [id],
  })) as unknown as FlowRecord;
  if (!flow?.createdAt) return null;
  const now = BigInt(await requestNowSeconds());
  return toFlowRow(id, flow, now, net);
}

function streamRemaining(flow: {
  kind: number;
  settled: boolean;
  paused: boolean;
  active: boolean;
  reserved: bigint;
  rate: bigint;
  start: bigint;
  end: bigint;
  duration: bigint;
  remaining: bigint;
}, now: bigint): bigint {
  if (flow.settled || flow.kind === 1) return 0n;
  if (flow.paused) return flow.rate > 0n ? flow.rate * flow.remaining : 0n;
  if (!flow.active) return flow.reserved;
  const elapsed = now >= flow.end ? flow.duration : now - flow.start;
  const streamed = flow.rate * elapsed;
  return flow.reserved > streamed ? flow.reserved - streamed : 0n;
}

async function loadSitePositions(net: GroupNet, owner: Address, now: bigint) {
  const site = vaultSite(net);
  const vault = await site.client.readContract({ address: site.factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] });
  const lockIds = await site.client.readContract({ address: site.locks, abi: lockAbi, functionName: "locksOf", args: [owner] });
  let idle = 0n;
  let held = 0n;
  let streaming = 0n;
  let flows: FlowRow[] = [];
  if (vault !== zeroAddress) {
    const [sheet, count] = await Promise.all([
      site.client.readContract({ address: vault, abi: vaultAbi, functionName: "balanceSheet", args: [site.fusdcx] }),
      site.client.readContract({ address: vault, abi: vaultAbi, functionName: "flowCount" }),
    ]);
    idle = sheet[0];
    held = sheet[1];
    streaming = sheet[2];
    const totalFlows = Number(count);
    if (totalFlows > 0) {
      const ids = await site.client.multicall({
        contracts: Array.from({ length: totalFlows }, (_, i) => ({
          address: vault,
          abi: vaultAbi,
          functionName: "flowIdAt" as const,
          args: [BigInt(i)] as const,
        })),
        allowFailure: false,
      });
      const records = await site.client.multicall({
        contracts: ids.map((id) => ({
          address: vault,
          abi: vaultAbi,
          functionName: "getFlow" as const,
          args: [id] as const,
        })),
        allowFailure: false,
      });
      flows = records.map((flow, i) => toFlowRow(ids[i], flow, now, net));
    }
  }
  const lockRecords = lockIds.length
    ? await site.client.multicall({
        contracts: lockIds.flatMap((id) => [
          { address: site.locks, abi: lockAbi, functionName: "locks" as const, args: [id] as const },
          { address: site.locks, abi: lockAbi, functionName: "previewBreak" as const, args: [id] as const },
          { address: site.locks, abi: lockAbi, functionName: "previewMature" as const, args: [id] as const },
        ]),
        allowFailure: false,
      })
    : [];
  const locks: LockRow[] = [];
  let locked = 0n;
  for (let i = 0; i < lockIds.length; i++) {
    const entry = lockRecords[i * 3] as readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, boolean, number, Hex, bigint, bigint];
    const preview = lockRecords[i * 3 + 1] as readonly [bigint, bigint];
    const mature = lockRecords[i * 3 + 2] as readonly [bigint, bigint];
    const principal = entry[2];
    const settled = entry[7];
    const token = entry[1];
    if (!settled && token.toLowerCase() === site.fusdcx.toLowerCase()) locked += principal;
    locks.push({
      id: groupKey(net, lockIds[i]),
      network: net,
      name: readName(entry[9]) || "Lock",
      token,
      principal: principal.toString(),
      target: entry[10].toString(),
      start: Number(entry[3]),
      end: Number(entry[4]),
      settled,
      penaltyBps: Number(entry[8]),
      yieldRate: entry[6].toString(),
      breakPayout: preview[0].toString(),
      breakPenalty: preview[1].toString(),
      matureBonus: mature[1].toString(),
    });
  }
  return { vault, idle, held, streaming, locked, flows, locks };
}

export const loadPortfolio = cache(async (who: { address: Address; name: string; index: number }, scope: "full" | "home" = "full"): Promise<Portfolio> => {
  const roster = people();
  const me = { name: who.name, address: who.address };
  const index = who.index;

  const [walletBal, ethBal, vault, penaltyBps, yieldBudget, yieldRate, tokenAllowed, paused, admin, lockIds, groupIds, otherGroupIds] =
    await Promise.all([
      publicClient.readContract({ address: addresses.fusdcx, abi: erc20, functionName: "balanceOf", args: [me.address] }),
      publicClient.getBalance({ address: me.address }),
      publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "vaultOf", args: [me.address] }),
      publicClient.readContract({ address: addresses.locks, abi: lockAbi, functionName: "penaltyBps" }),
      publicClient.readContract({ address: addresses.locks, abi: lockAbi, functionName: "yieldBudget", args: [addresses.fusdcx] }),
      publicClient.readContract({
        address: addresses.locks,
        abi: lockAbi,
        functionName: "yieldPerTokenPerSecond",
        args: [addresses.fusdcx],
      }),
      publicClient.readContract({ address: addresses.allowlist, abi: allowAbi, functionName: "isAllowed", args: [addresses.fusdcx] }),
      publicClient.readContract({ address: addresses.allowlist, abi: allowAbi, functionName: "paused" }),
      publicClient.readContract({ address: addresses.allowlist, abi: allowAbi, functionName: "owner" }),
      publicClient.readContract({ address: addresses.locks, abi: lockAbi, functionName: "locksOf", args: [me.address] }),
      groupsOfOn(appGroupNet(), me.address),
      groupsOfOn(otherGroupNet(), me.address).catch(() => [] as bigint[]),
    ]);

  const hasVault = vault !== zeroAddress;
  let idle = 0n;
  let held = 0n;
  let streaming = 0n;
  let flows: FlowRow[] = [];
  let readAt = await requestNowSeconds();

  if (hasVault) {
    const [sheet, count] = await Promise.all([
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "balanceSheet", args: [addresses.fusdcx] }),
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "flowCount" }),
    ]);
    idle = sheet[0];
    held = sheet[1];
    streaming = sheet[2];
    const totalFlows = Number(count);
    if (totalFlows > 0) {
      const ids = await publicClient.multicall({
        contracts: Array.from({ length: totalFlows }, (_, i) => ({
          address: vault,
          abi: vaultAbi,
          functionName: "flowIdAt" as const,
          args: [BigInt(i)] as const,
        })),
        allowFailure: false,
      });
      const records = await publicClient.multicall({
        contracts: ids.map((id) => ({
          address: vault,
          abi: vaultAbi,
          functionName: "getFlow" as const,
          args: [id] as const,
        })),
        allowFailure: false,
      });
      readAt = await requestNowSeconds();
      const now = BigInt(readAt);
      flows = records.map((flow, i) => toFlowRow(ids[i], flow, now, appGroupNet()));
    }
  }

  const lockRecords = lockIds.length
    ? await publicClient.multicall({
        contracts: lockIds.flatMap((id) => [
          { address: addresses.locks, abi: lockAbi, functionName: "locks" as const, args: [id] as const },
          { address: addresses.locks, abi: lockAbi, functionName: "previewBreak" as const, args: [id] as const },
          { address: addresses.locks, abi: lockAbi, functionName: "previewMature" as const, args: [id] as const },
        ]),
        allowFailure: false,
      })
    : [];

  const locks: LockRow[] = [];
  let locked = 0n;
  for (let i = 0; i < lockIds.length; i++) {
    const entry = lockRecords[i * 3] as readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, boolean, number, Hex, bigint, bigint];
    const preview = lockRecords[i * 3 + 1] as readonly [bigint, bigint];
    const mature = lockRecords[i * 3 + 2] as readonly [bigint, bigint];
    const principal = entry[2];
    const settled = entry[7];
    const token = entry[1];
    if (!settled && token.toLowerCase() === addresses.fusdcx.toLowerCase()) locked += principal;
    locks.push({
      id: groupKey(appGroupNet(), lockIds[i]),
      network: appGroupNet(),
      name: readName(entry[9]) || "Lock",
      token,
      principal: principal.toString(),
      target: entry[10].toString(),
      start: Number(entry[3]),
      end: Number(entry[4]),
      settled,
      penaltyBps: Number(entry[8]),
      yieldRate: entry[6].toString(),
      breakPayout: preview[0].toString(),
      breakPenalty: preview[1].toString(),
      matureBonus: mature[1].toString(),
    });
  }

  const otherBook = await loadSitePositions(otherGroupNet(), me.address, BigInt(readAt)).catch(() => ({
    vault: zeroAddress as Address,
    idle: 0n,
    held: 0n,
    streaming: 0n,
    locked: 0n,
    flows: [] as FlowRow[],
    locks: [] as LockRow[],
  }));
  idle += otherBook.idle;
  held += otherBook.held;
  streaming += otherBook.streaming;
  locked += otherBook.locked;
  flows = [...flows, ...otherBook.flows];
  locks.push(...otherBook.locks);

  const total = walletBal + idle + held + streaming + locked;
  const [groupRows, otherRows, upgradeReadyAt] = await Promise.all([
    scope === "home"
      ? Promise.resolve(groupIds.map((id) => homeGroup(id, appGroupNet())))
      : Promise.all(groupIds.map((id) => readGroupRow(id, appGroupNet()))),
    scope === "home"
      ? Promise.resolve(otherGroupIds.map((id) => homeGroup(id, otherGroupNet())))
      : Promise.all(otherGroupIds.map((id) => readGroupRow(id, otherGroupNet()))),
    readUpgradeReady(),
  ]);

  return {
    me,
    index,
    people: roster,
    wallet: walletBal.toString(),
    eth: formatUnits(ethBal, 18),
    vault: hasVault ? vault : null,
    idle: idle.toString(),
    held: held.toString(),
    streaming: streaming.toString(),
    locked: locked.toString(),
    total: total.toString(),
    readAt,
    flows,
    locks,
    groups: [...groupRows, ...otherRows],
    protocol: {
      admin,
      penaltyBps: Number(penaltyBps),
      yieldBudget: yieldBudget.toString(),
      yieldRate: yieldRate.toString(),
      tokenAllowed,
      paused,
      upgradeReadyAt,
    },
  };
});

export type IncomingItem = { flow: FlowRow; vault: Address; from: string };

/** Goals that live in someone else's vault and pay this wallet. */
export const loadIncoming = cache(async (me: Address): Promise<IncomingItem[]> => {
  const others = people().filter((person) => person.address.toLowerCase() !== me.toLowerCase());
  if (others.length === 0) return [];
  const vaults = await publicClient.multicall({
    contracts: others.map((person) => ({
      address: addresses.factory,
      abi: factoryAbi,
      functionName: "vaultOf" as const,
      args: [person.address] as const,
    })),
    allowFailure: false,
  });
  const now = BigInt(await requestNowSeconds());
  const mine = me.toLowerCase();
  const found = await Promise.all(
    others.map(async (person, index) => {
      const vault = vaults[index];
      if (vault === zeroAddress) return [];
      const count = Number(await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "flowCount" }));
      if (count === 0) return [];
      const ids = await publicClient.multicall({
        contracts: Array.from({ length: count }, (_, position) => ({
          address: vault,
          abi: vaultAbi,
          functionName: "flowIdAt" as const,
          args: [BigInt(position)] as const,
        })),
        allowFailure: false,
      });
      const records = await publicClient.multicall({
        contracts: ids.map((id) => ({
          address: vault,
          abi: vaultAbi,
          functionName: "getFlow" as const,
          args: [id] as const,
        })),
        allowFailure: false,
      });
      const items: IncomingItem[] = [];
      records.forEach((record, position) => {
        const flow = toFlowRow(ids[position], record, now, appGroupNet());
        if (flow.settled || flow.recipient.toLowerCase() !== mine) return;
        items.push({ flow, vault, from: person.name });
      });
      return items;
    }),
  );
  return found.flat();
});

async function vaultFor(index: number): Promise<Address> {
  const { account } = signer(index);
  const existing = await publicClient.readContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [account.address],
  });
  if (existing !== zeroAddress) return existing;
  await write(index, { address: addresses.factory, abi: factoryAbi, functionName: "createVault" });
  const created = await publicClient.readContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [account.address],
  });
  if (created === zeroAddress) throw new Error("The vault was not created.");
  return created;
}

async function deposit(index: number, vault: Address, amount: bigint) {
  if (amount === 0n) return;
  const { account } = signer(index);
  const balance = await publicClient.readContract({
    address: addresses.fusdcx,
    abi: erc20,
    functionName: "balanceOf",
    args: [account.address],
  });
  const due = withProtocolFee(amount);
  if (balance < due) {
    throw new Error(`This needs ${money(due)} USD in the wallet, including the 0.3% protocol fee. This account has ${money(balance)}.`);
  }
  await ensureAllowance(index, account.address, vault, due);
  await write(index, {
    address: vault,
    abi: vaultAbi,
    functionName: "depositSuper",
    args: [addresses.fusdcx, amount],
  });
}

async function latestFlowId(vault: Address): Promise<string> {
  const count = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "flowCount" });
  if (count === 0n) throw new Error("The goal was not created.");
  const id = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "flowIdAt",
    args: [count - 1n],
  });
  return id.toString();
}

export async function streamNeed(amount: bigint, duration: bigint): Promise<bigint> {
  const perSecond = amount / duration;
  if (perSecond === 0n) throw new Error("That duration is too long for this amount. The stream would be less than 1 wei per second.");
  const reserved = perSecond * duration;
  const buffer = await publicClient.readContract({
    address: addresses.cfa,
    abi: cfaAbi,
    functionName: "getBufferAmountByFlowrate",
    args: [addresses.fusdcx, perSecond],
  });
  const cushion = perSecond * 3600n;
  return reserved + buffer * 2n + cushion;
}

export async function openSaving(index: number, input: { name: string; amount: string; target: string; duration: number; startAt?: number }) {
  const amount = parseAmount(input.amount);
  const target = input.target.trim() ? parseAmount(input.target) : amount;
  const vault = await vaultFor(index);
  const idle = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  if (idle < amount) await deposit(index, vault, amount - idle);
  const startAt = input.startAt ?? 0;
  if (startAt > Math.floor(Date.now() / 1000)) {
    const { account } = signer(index);
    await write(index, {
      address: vault,
      abi: vaultAbi,
      functionName: "createFlow",
      args: [
        {
          token: addresses.fusdcx,
          recipient: account.address,
          kind: 1,
          amount,
          earliestStart: BigInt(startAt),
          duration: BigInt(input.duration),
          goalAmount: target,
          allowSubflows: false,
          predecessorId: 0n,
          chainMode: 0,
          keeperGated: false,
          name: toName(input.name),
        },
      ],
    });
    return latestFlowId(vault);
  }
  await write(index, {
    address: vault,
    abi: vaultAbi,
    functionName: "openSavings",
    args: [addresses.fusdcx, amount, BigInt(input.duration), toName(input.name), target],
  });
  return latestFlowId(vault);
}

export async function openStream(
  index: number,
  input: { name: string; amount: string; duration: number; kind: "flow" | "expense"; recipient: Address; startAt: number },
) {
  const amount = parseAmount(input.amount);
  const duration = BigInt(input.duration);
  const need = await streamNeed(amount, duration);
  const { account } = signer(index);
  const recipient = input.kind === "flow" ? account.address : input.recipient;
  if (recipient.toLowerCase() === account.address.toLowerCase() && input.kind === "expense") {
    throw new Error("An expense streams to someone else. Pick another account.");
  }
  const vault = await vaultFor(index);
  const idle = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  if (idle < need) await deposit(index, vault, need - idle);
  const perSecond = amount / duration;
  const reserved = perSecond * duration;
  const goal = input.kind === "flow" ? reserved : 0n;
  const hash = await write(index, {
    address: vault,
    abi: vaultAbi,
    functionName: "createFlow",
    args: [
      {
        token: addresses.fusdcx,
        recipient,
        kind: input.kind === "expense" ? 0 : 2,
        amount,
        earliestStart: BigInt(input.startAt),
        duration,
        goalAmount: goal,
        allowSubflows: false,
        predecessorId: 0n,
        chainMode: 0,
        keeperGated: false,
        name: toName(input.name),
      },
    ],
  });
  if (input.startAt === 0 || input.startAt <= Math.floor(Date.now() / 1000)) {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const created = receipt.logs.find((log) => log.address.toLowerCase() === vault.toLowerCase());
    void created;
    const count = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "flowCount" });
    const id = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "flowIdAt",
      args: [count - 1n],
    });
    await write(index, { address: vault, abi: vaultAbi, functionName: "activate", args: [id] });
  }
  return latestFlowId(vault);
}

async function requireVault(index: number): Promise<Address> {
  const { account } = signer(index);
  const vault = await publicClient.readContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [account.address],
  });
  if (vault === zeroAddress) throw new Error("Open a goal first. That creates your vault.");
  return vault;
}

export async function addToGoal(index: number, id: bigint, amountRaw: string) {
  const amount = parseAmount(amountRaw);
  const vault = await requireVault(index);
  const idle = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  if (idle < amount) await deposit(index, vault, amount - idle);
  await write(index, { address: vault, abi: vaultAbi, functionName: "topUp", args: [id, amount] });
}

export async function releaseGoal(index: number, id: bigint, amountRaw: string) {
  const vault = await requireVault(index);
  await write(index, { address: vault, abi: vaultAbi, functionName: "release", args: [id, parseAmount(amountRaw)] });
}

export async function vaultCall(index: number, fn: "pause" | "resume" | "cancel" | "settle" | "withdraw", idOrAmount: bigint) {
  const vault = await requireVault(index);
  if (fn === "withdraw") {
    await write(index, { address: vault, abi: vaultAbi, functionName: "withdraw", args: [addresses.fusdcx, idOrAmount] });
    return;
  }
  await write(index, { address: vault, abi: vaultAbi, functionName: fn, args: [idOrAmount] });
}

export async function openLock(index: number, input: { name: string; amount: string; target: string; duration: number; earnYield: boolean; token?: Address }) {
  const amount = parseAmount(input.amount);
  if (amount > BigInt("0xffffffffffffffffffffffffffffffff")) throw new Error("That amount is too large for a lock.");
  const target = input.target.trim() ? parseAmount(input.target) : amount;
  const token = input.token ?? addresses.fusdcx;
  const { account } = signer(index);
  await ensureAllowance(index, account.address, addresses.locks, withProtocolFee(amount), token);
  await write(index, {
    address: addresses.locks,
    abi: lockAbi,
    functionName: "lockGoal",
    args: [token, amount, BigInt(input.duration), input.earnYield, toName(input.name), target],
  });
  const ids = await publicClient.readContract({
    address: addresses.locks,
    abi: lockAbi,
    functionName: "locksOf",
    args: [account.address],
  });
  return ids[ids.length - 1]?.toString() ?? "";
}

export async function lockTopUp(index: number, id: bigint, amountRaw: string) {
  const amount = parseAmount(amountRaw);
  const { account } = signer(index);
  await ensureAllowance(index, account.address, addresses.locks, withProtocolFee(amount));
  await write(index, { address: addresses.locks, abi: lockAbi, functionName: "topUp", args: [id, amount] });
}

export async function lockBreak(index: number, id: bigint) {
  await write(index, { address: addresses.locks, abi: lockAbi, functionName: "breakEarly", args: [id] });
}

export async function lockMature(index: number, id: bigint) {
  await write(index, { address: addresses.locks, abi: lockAbi, functionName: "withdrawMature", args: [id] });
}

export async function openGroup(
  index: number,
  input: {
    contribution: string;
    members: Address[];
    cycles: number;
    cycleSeconds: number;
    windowSeconds: number;
    graceSeconds: number;
    plain?: boolean;
    token?: "usd" | "gdx";
  },
) {
  const contribution = parseAmount(input.contribution);
  const { account } = signer(index);
  const unique = [...new Set(input.members.map((item) => item.toLowerCase()))].map((item) => item as Address);
  if (!unique.some((item) => item.toLowerCase() === account.address.toLowerCase())) {
    throw new Error("You have to be a member of the group you create.");
  }
  if (unique.length < 3) throw new Error("A group needs at least 3 members.");
  if (contribution > BigInt("0xffffffffffffffffffffffffffffffff")) throw new Error("That contribution is too large.");
  const cycle = BigInt(input.cycleSeconds);
  const window = BigInt(input.windowSeconds);
  const grace = BigInt(input.graceSeconds);
  if (cycle < 3600n || cycle > 366n * 86400n || window <= 0n || window + grace > cycle) {
    throw new Error("That cycle length is outside what the contract allows.");
  }
  const before = await publicClient.readContract({
    address: addresses.groups,
    abi: groupAbi,
    functionName: "groupsOf",
    args: [account.address],
  });
  await write(index, {
    address: addresses.groups,
    abi: groupAbi,
    functionName: input.plain ? "createPlainGroup" : "createGroup",
    args: [groupTokenAddress(appGroupNet(), input.token === "gdx" ? "gdx" : "usd"), contribution, cycle, window, grace, input.cycles, unique, unique.map(() => 0n)],
  });
  const after = await publicClient.readContract({
    address: addresses.groups,
    abi: groupAbi,
    functionName: "groupsOf",
    args: [account.address],
  });
  const fresh = after.find((item) => !before.some((old) => old === item));
  return (fresh ?? after[after.length - 1])?.toString() ?? "";
}

function homeGroup(id: bigint, net: GroupNet): GroupRow {
  return {
    id: groupKey(net, id),
    network: groupSite(net).name,
    creator: zeroAddress,
    creatorName: "",
    contribution: "0",
    collateral: "0",
    cycleSeconds: 0,
    windowSeconds: 0,
    graceSeconds: 0,
    cycles: 0,
    members: [],
    payout: [],
    canArrange: false,
    canPhone: false,
    started: false,
    cancelled: false,
    finalized: false,
    startTime: 0,
    cycle: "0",
    cycleOpen: false,
    token: groupSite(net).token,
  };
}

async function readUpgradeReady(): Promise<number> {
  try {
    return Number(
      await publicClient.readContract({
        address: addresses.locks,
        abi: parseAbi(["function upgradeReadyAt() view returns (uint64)"]),
        functionName: "upgradeReadyAt",
      }),
    );
  } catch {
    return 0;
  }
}

async function readGroupRow(id: bigint, net: GroupNet): Promise<GroupRow> {
  const site = groupSite(net);
  const group = await readGroup(id, net);
  const creator = group[0];
  const contribution = group[3];
  const collateralRequired = group[4];
  const count = Number(group[10]);
  const running = group[11] && !group[13];
  const [members, seating, current] = await Promise.all([
    count
      ? site.client.multicall({
          contracts: Array.from({ length: count }, (_, index) => ({
            address: site.groups,
            abi: groupAbi,
            functionName: "getMember" as const,
            args: [id, BigInt(index)] as const,
          })),
          allowFailure: false as const,
        })
      : Promise.resolve([]),
    readPayout(id, count, net),
    running
      ? site.client.readContract({
          address: site.groups,
          abi: groupAbi,
          functionName: "currentCycle",
          args: [id],
        })
      : Promise.resolve(null),
  ]);
  const phoneRows = count
    ? await site.client.multicall({
        contracts: members.map((member) => ({
          address: site.groups,
          abi: groupAbi,
          functionName: "memberPhone" as const,
          args: [id, member[0]] as const,
        })),
        allowFailure: true as const,
      })
    : [];
  const phonesLive = phoneRows.some((row) => row.status === "success");
  return {
    id: groupKey(net, id),
    network: site.name,
    creator,
    creatorName: personName(creator),
    contribution: contribution.toString(),
    collateral: collateralRequired.toString(),
    cycleSeconds: Number(group[5]),
    windowSeconds: Number(group[6]),
    graceSeconds: Number(group[7]),
    cycles: Number(group[9]),
    started: group[11],
    cancelled: group[12],
    finalized: group[13],
    startTime: Number(group[8]),
    cycle: (current?.[0] ?? 0n).toString(),
    cycleOpen: current?.[1] ?? false,
    token: group[1],
    members: members.map((member, index) => ({
      account: member[0],
      name: personName(member[0]),
      phone: phonesLive && phoneRows[index]?.status === "success" ? quietName(phoneRows[index].result) : "",
      posted: member[3],
      collateral: member[2].toString(),
      given: member[5].toString(),
      received: member[6].toString(),
      owed: member[7].toString(),
      missed: Number(member[8]),
    })),
    payout: seating.order,
    canArrange: seating.known,
    canPhone: phonesLive,
  };
}

async function readPayout(id: bigint, count: number, net: GroupNet = appGroupNet()): Promise<{ order: number[]; known: boolean }> {
  const identity = Array.from({ length: count }, (_, index) => index);
  if (!count) return { order: [], known: false };
  const site = groupSite(net);
  try {
    const order = await site.client.readContract({
      address: site.groups,
      abi: groupAbi,
      functionName: "payoutOrder",
      args: [id],
    });
    const seats = order.map(Number);
    const valid = seats.length === count && seats.every((seat, index) => seat >= 0 && seat < count && seats.indexOf(seat) === index);
    return { order: valid ? seats : identity, known: true };
  } catch {
    return { order: identity, known: false };
  }
}

export async function shiftPayout(index: number, id: bigint, from: number, dir: -1 | 1) {
  const group = await readGroup(id);
  if (group[11] || group[12]) throw new Error("The turn order is fixed once the group has started.");
  const count = Number(group[10]);
  const seating = await readPayout(id, count);
  if (!seating.known) throw new Error("This group contract cannot rearrange turns.");
  const to = from + dir;
  if (!Number.isInteger(from) || to < 0 || to >= seating.order.length) {
    throw new Error("That person is already at the end of the order.");
  }
  const next = seating.order.slice();
  const hold = next[from];
  next[from] = next[to];
  next[to] = hold;
  await write(index, {
    address: addresses.groups,
    abi: groupAbi,
    functionName: "setPayoutOrder",
    args: [id, next],
  });
}

export async function publishPhones(index: number, id: bigint, rows: { account: Address; phone: string }[]) {
  for (const row of rows) {
    const phone = row.phone.replace(/\D/g, "");
    if (phone.length < 7 || phone.length > 31) continue;
    await write(index, {
      address: addresses.groups,
      abi: groupAbi,
      functionName: "setMemberPhone",
      args: [id, row.account, toName(phone)],
    });
  }
}

export async function linkPhone(index: number, id: bigint, phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 31) throw new Error("Add a phone number with the country code in Settings first.");
  const { account } = signer(index);
  await write(index, {
    address: addresses.groups,
    abi: groupAbi,
    functionName: "setMemberPhone",
    args: [id, account.address, toName(digits)],
  });
}

export async function groupAct(
  index: number,
  id: bigint,
  fn: "postCollateral" | "start" | "contribute" | "exitBeforeStart" | "cancelBeforeStart" | "claimCollateral",
) {
  if (fn === "postCollateral" || fn === "contribute") {
    const group = await readGroup(id);
    const amount = fn === "postCollateral" ? group[4] : group[3];
    const { account } = signer(index);
    await ensureAllowance(index, account.address, addresses.groups, withProtocolFee(amount));
  }
  await write(index, { address: addresses.groups, abi: groupAbi, functionName: fn, args: [id] });
}

export function explain(error: unknown): string {
  const text = error instanceof Error ? error.message : "The transaction failed.";
  const known: Record<string, string> = {
    Insufficient: "The vault does not have enough USD set aside for this.",
    TooEarly: "This is not ready yet.",
    TooLate: "The payment window for this cycle has closed.",
    WindowOutOfRange: "The payment window does not fit inside that cycle.",
    BadDuration: "That length is outside what the contract allows.",
    BadAmount: "That amount does not fit this position.",
    MissingCollateral: "Every member has to post collateral before the group can start.",
    AlreadyPosted: "You already posted collateral for this group.",
    AlreadyPaid: "You already paid this cycle.",
    NotCreator: "Only the person who created the group can do that.",
    VaultExists: "This account already has a vault.",
    NotActive: "That position is not running.",
    StillActive: "It has not reached its date yet.",
    Paused: "The protocol is paused for new positions.",
    TokenNotAllowed: "USD is not on the allowlist.",
  };
  for (const [key, message] of Object.entries(known)) {
    if (text.includes(key)) return message;
  }
  const line = text.split("\n").find((item) => item.trim()) ?? text;
  return line.replace(/^Error:\s*/, "").slice(0, 220);
}
