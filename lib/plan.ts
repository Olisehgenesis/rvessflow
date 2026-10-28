import "server-only";

import { encodeFunctionData, getAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { assetByAddress } from "@/lib/assets";
import { fundingCalls, superForUsd, superForWithdraw, withdrawCalls } from "@/lib/funding";
import type { Intent, Plan, PreparedCall } from "@/lib/intent";
import { readPay, type PayAsset } from "@/lib/pay-math";
import { sendLabel, sendRoute, sendToken, walletBalance } from "@/lib/send";
import { isSendAsset, parseSendAmount, spendableEth } from "@/lib/send-math";
import { readName, stableLabel, toName } from "@/lib/protocol";
import {
  addresses,
  allowAbi,
  readGroup,
  erc20,
  factoryAbi,
  groupAbi,
  lockAbi,
  publicClient,
  vaultAbi,
  parseAmount,
  streamNeed,
  withProtocolFee,
} from "@/lib/protocol";

const slack = 15;

function encode(to: Address, abi: Parameters<typeof encodeFunctionData>[0]["abi"], functionName: string, args: readonly unknown[] = [], value = 0n): PreparedCall {
  return {
    to,
    data: encodeFunctionData({ abi, functionName, args: args as never }),
    value: value.toString(),
  };
}

function pending(intent: Intent): Plan {
  return { calls: [], intent, done: false, pending: true };
}

function done(intent: Intent, extra: { id?: string; href?: string } = {}): Plan {
  return { calls: [], intent, done: true, ...extra };
}

async function vaultOf(owner: Address): Promise<Address> {
  return publicClient.readContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [owner],
  });
}

async function balanceOf(owner: Address, token: Address) {
  return publicClient.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
}

async function sizedAmount(pay: PayAsset | undefined, amount: string): Promise<bigint> {
  return pay ? superForUsd(amount) : parseAmount(amount);
}

async function coverVault(calls: PreparedCall[], owner: Address, vault: Address, pay: PayAsset | undefined, shortfall: bigint) {
  if (shortfall <= 0n) return;
  if (!pay || pay === "usdcx") {
    await approveIfNeeded(calls, owner, addresses.fusdcx, vault, withProtocolFee(shortfall));
    calls.push(encode(vault, vaultAbi, "depositSuper", [addresses.fusdcx, shortfall]));
    return;
  }
  calls.push(...(await fundingCalls(owner, vault, pay, shortfall, "vault")));
}

async function coverWallet(calls: PreparedCall[], owner: Address, pay: PayAsset, due: bigint) {
  const balance = await balanceOf(owner, addresses.fusdcx);
  if (balance >= due) return;
  if (pay === "usdcx") throw new Error(`Not enough ${stableLabel} in this wallet.`);
  calls.push(...(await fundingCalls(owner, owner, pay, due - balance, "wallet")));
}

async function approveIfNeeded(calls: PreparedCall[], owner: Address, token: Address, spender: Address, amount: bigint) {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance < amount) calls.push(encode(token, erc20, "approve", [spender, amount]));
}

async function flows(owner: Address) {
  const vault = await vaultOf(owner);
  if (vault === zeroAddress) return { vault, rows: [] as FlowSnap[] };
  const count = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "flowCount" });
  if (count === 0n) return { vault, rows: [] as FlowSnap[] };
  const ids = await publicClient.multicall({
    contracts: Array.from({ length: Number(count) }, (_, index) => ({
      address: vault,
      abi: vaultAbi,
      functionName: "flowIdAt" as const,
      args: [BigInt(index)] as const,
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
  return {
    vault,
    rows: records.map((flow, index) => ({
      id: ids[index],
      createdAt: Number(flow.createdAt),
      name: readName(flow.name),
      kind: Number(flow.kind),
      active: flow.active,
      paused: flow.paused,
      settled: flow.settled,
      reserved: flow.reserved,
    })),
  };
}

type FlowSnap = {
  id: bigint;
  createdAt: number;
  name: string;
  kind: number;
  active: boolean;
  paused: boolean;
  settled: boolean;
  reserved: bigint;
};

function recentMatch(rows: FlowSnap[], name: string, kind: number, startedAt: number) {
  return rows
    .filter((row) => row.kind === kind && row.name === name.trim() && row.createdAt >= startedAt - slack)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

async function planSaving(owner: Address, intent: Extract<Intent, { kind: "saving" }>): Promise<Plan> {
  const found = await flows(owner);
  const match = recentMatch(found.rows, intent.name, 1, intent.startedAt);
  if (match) return done(intent, { id: match.id.toString(), href: `/goals/${match.id.toString()}?fresh=1` });
  if (intent.submitted) return pending(intent);
  if (found.vault === zeroAddress) {
    return { calls: [encode(addresses.factory, factoryAbi, "createVault")], intent, done: false };
  }
  const pay = intent.pay ? readPay(intent.pay) : undefined;
  const amount = await sizedAmount(pay, intent.amount);
  const idle = await publicClient.readContract({
    address: found.vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  const calls: PreparedCall[] = [];
  if (idle < amount) await coverVault(calls, owner, found.vault, pay, amount - idle);
  const startAt = intent.startAt ?? 0;
  const later = startAt > Math.floor(Date.now() / 1000);
  calls.push(
    later
      ? encode(found.vault, vaultAbi, "createFlow", [
          {
            token: addresses.fusdcx,
            recipient: owner,
            kind: 1,
            amount,
            earliestStart: BigInt(startAt),
            duration: BigInt(intent.duration),
            goalAmount: amount,
            allowSubflows: false,
            predecessorId: 0n,
            chainMode: 0,
            keeperGated: false,
            name: toName(intent.name),
          },
        ])
      : encode(found.vault, vaultAbi, "openSavings", [addresses.fusdcx, amount, BigInt(intent.duration), toName(intent.name), amount]),
  );
  return { calls, intent: { ...intent, submitted: true }, done: false };
}

async function planStream(owner: Address, intent: Extract<Intent, { kind: "stream" }>): Promise<Plan> {
  if (!isAddress(intent.recipient)) throw new Error("Pick who receives this stream.");
  const recipient = intent.flowKind === "flow" ? owner : getAddress(intent.recipient);
  if (intent.flowKind === "expense" && recipient.toLowerCase() === owner.toLowerCase()) {
    throw new Error("An expense streams to someone else. Pick another account.");
  }
  const found = await flows(owner);
  const match = recentMatch(found.rows, intent.name, intent.flowKind === "expense" ? 0 : 2, intent.startedAt);
  if (match) {
    const ready = intent.startAt === 0 || intent.startAt <= Math.floor(Date.now() / 1000);
    if (ready && !match.active && !match.paused && !match.settled) {
      if (intent.submitted && intent.seen === "activate") return pending(intent);
      return {
        calls: [encode(found.vault, vaultAbi, "activate", [match.id])],
        intent: { ...intent, submitted: true, seen: "activate" },
        done: false,
      };
    }
    return done(intent, { id: match.id.toString(), href: `/goals/${match.id.toString()}?fresh=1` });
  }
  if (intent.submitted) return pending(intent);
  if (found.vault === zeroAddress) {
    return { calls: [encode(addresses.factory, factoryAbi, "createVault")], intent, done: false };
  }
  const pay = intent.pay ? readPay(intent.pay) : undefined;
  const amount = await sizedAmount(pay, intent.amount);
  const duration = BigInt(intent.duration);
  const need = await streamNeed(amount, duration);
  const idle = await publicClient.readContract({
    address: found.vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  const calls: PreparedCall[] = [];
  if (idle < need) await coverVault(calls, owner, found.vault, pay, need - idle);
  const perSecond = amount / duration;
  const reserved = perSecond * duration;
  calls.push(
    encode(found.vault, vaultAbi, "createFlow", [
      {
        token: addresses.fusdcx,
        recipient,
        kind: intent.flowKind === "expense" ? 0 : 2,
        amount,
        earliestStart: BigInt(intent.startAt),
        duration,
        goalAmount: intent.flowKind === "flow" ? reserved : 0n,
        allowSubflows: false,
        predecessorId: 0n,
        chainMode: 0,
        keeperGated: false,
        name: toName(intent.name),
      },
    ]),
  );
  return { calls, intent: { ...intent, submitted: true }, done: false };
}

type LockSnap = readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, boolean, number, Hex, bigint, bigint];

function asLock(entry: unknown): LockSnap {
  return entry as LockSnap;
}

async function planLock(owner: Address, intent: Extract<Intent, { kind: "lock" }>): Promise<Plan> {
  const pay = intent.pay ? readPay(intent.pay) : undefined;
  if (!pay && !isAddress(intent.token)) throw new Error("Pick an asset.");
  const token = pay ? addresses.fusdcx : getAddress(intent.token);
  const allowed = await publicClient.readContract({
    address: addresses.allowlist,
    abi: allowAbi,
    functionName: "isAllowed",
    args: [token],
  });
  if (!allowed) throw new Error(`${assetByAddress(token).symbol} is not on the allowlist.`);
  const ids = await publicClient.readContract({ address: addresses.locks, abi: lockAbi, functionName: "locksOf", args: [owner] });
  if (ids.length) {
    const records = await publicClient.multicall({
      contracts: ids.map((id) => ({ address: addresses.locks, abi: lockAbi, functionName: "locks" as const, args: [id] as const })),
      allowFailure: false,
    });
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const entry = asLock(records[index]);
      const start = Number(entry[3]);
      const settled = entry[7];
      if (settled || entry[1].toLowerCase() !== token.toLowerCase()) continue;
      if (readName(entry[9]) === intent.name.trim() && start >= intent.startedAt - slack) {
        return done(intent, { id: ids[index].toString(), href: `/vaults/${ids[index].toString()}?fresh=1` });
      }
    }
  }
  if (intent.submitted) return pending(intent);
  const amount = await sizedAmount(pay, intent.amount);
  if (amount > BigInt("0xffffffffffffffffffffffffffffffff")) throw new Error("That amount is too large for a lock.");
  const calls: PreparedCall[] = [];
  const due = withProtocolFee(amount);
  if (pay) await coverWallet(calls, owner, pay, due);
  await approveIfNeeded(calls, owner, token, addresses.locks, due);
  calls.push(
    encode(addresses.locks, lockAbi, "lockGoal", [token, amount, BigInt(intent.duration), intent.earnYield, toName(intent.name), amount]),
  );
  return { calls, intent: { ...intent, submitted: true }, done: false };
}

async function planDeposit(owner: Address, intent: Extract<Intent, { kind: "deposit" }>): Promise<Plan> {
  const pay = intent.pay ? readPay(intent.pay) : undefined;
  if (pay) {
    const net = await superForUsd(intent.amount);
    const vault = await vaultOf(owner);
    if (vault === zeroAddress) return { calls: [encode(addresses.factory, factoryAbi, "createVault")], intent, done: false };
    const idle = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "unallocated",
      args: [addresses.fusdcx],
    });
    if (intent.seen && idle > BigInt(intent.seen)) return done(intent, { href: "/home/add/status?done=1" });
    if (intent.submitted) return pending(intent);
    const calls = await fundingCalls(owner, vault, pay, net, "vault");
    return { calls, intent: { ...intent, seen: idle.toString(), submitted: true }, done: false };
  }
  if (!isAddress(intent.token)) throw new Error("Pick an asset.");
  const token = getAddress(intent.token);
  const amount = parseAmount(intent.amount);
  const balance = await balanceOf(owner, token);
  if (intent.seen && balance <= BigInt(intent.seen) - amount) return done(intent, { href: "/home/add/status?done=1" });
  const vault = await vaultOf(owner);
  const next = { ...intent, seen: intent.seen ?? balance.toString() };
  if (vault === zeroAddress) return { calls: [encode(addresses.factory, factoryAbi, "createVault")], intent: next, done: false };
  if (balance < withProtocolFee(amount)) {
    throw new Error(`This needs ${assetByAddress(token).symbol} in the wallet, including the 0.3% protocol fee.`);
  }
  const calls: PreparedCall[] = [];
  await approveIfNeeded(calls, owner, token, vault, withProtocolFee(amount));
  calls.push(encode(vault, vaultAbi, "depositSuper", [token, amount]));
  return { calls, intent: { ...next, submitted: true }, done: false };
}

async function planSend(owner: Address, intent: Extract<Intent, { kind: "send" }>): Promise<Plan> {
  if (!isSendAsset(intent.asset)) throw new Error("Pick a token.");
  if (!isAddress(intent.to)) throw new Error("Enter a wallet address.");
  const recipient = getAddress(intent.to);
  if (recipient === zeroAddress) throw new Error("Enter a wallet address.");
  if (recipient.toLowerCase() === owner.toLowerCase()) throw new Error("That address is this account.");
  const amount = parseSendAmount(intent.asset, intent.amount);
  const balance = await walletBalance(owner, intent.asset);
  if (intent.seen) {
    const before = BigInt(intent.seen);
    if (balance < before && before - balance >= amount) return done(intent, { href: "/home" });
  }
  if (intent.submitted) return pending(intent);
  const route = sendRoute(intent.asset);
  const spendable = route.fee === "native" ? spendableEth(balance) : balance;
  const label = sendLabel(intent.asset);
  if (amount > spendable) {
    throw new Error(
      route.fee === "native" && amount <= balance
        ? `Leave a little ${label} in the wallet for the network fee.`
        : `The wallet does not have that much ${label} on ${route.network}.`,
    );
  }
  const token = sendToken(intent.asset);
  const calls: PreparedCall[] = token
    ? [encode(token, erc20, "transfer", [recipient, amount])]
    : [{ to: recipient, data: "0x", value: amount.toString() }];
  return { calls, intent: { ...intent, to: recipient, seen: balance.toString(), submitted: true }, done: false, chainId: route.chainId };
}

async function planWithdraw(owner: Address, intent: Extract<Intent, { kind: "withdraw" }>): Promise<Plan> {
  const vault = await vaultOf(owner);
  if (vault === zeroAddress) throw new Error("Open a goal first. That creates your vault.");
  const receive = intent.receive;
  const amount = receive ? await superForWithdraw(intent.amount) : BigInt(intent.amount);
  if (amount <= 0n) throw new Error("Enter the amount in USD.");
  const idle = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  if (intent.seen && BigInt(intent.seen) - idle >= amount) return done(intent, { href: "/home" });
  if (idle < amount) throw new Error("The vault does not have that much idle USD.");
  if (intent.submitted) return pending(intent);
  const calls = receive
    ? await withdrawCalls(owner, vault, amount, receive)
    : [encode(vault, vaultAbi, "withdraw", [addresses.fusdcx, amount])];
  return {
    calls,
    intent: { ...intent, seen: idle.toString(), submitted: true },
    done: false,
  };
}

async function oneFlow(owner: Address, id: bigint) {
  const found = await flows(owner);
  if (found.vault === zeroAddress) throw new Error("Open a goal first. That creates your vault.");
  const flow = await publicClient.readContract({
    address: found.vault,
    abi: vaultAbi,
    functionName: "getFlow",
    args: [id],
  });
  return { vault: found.vault, flow };
}

async function planGoal(owner: Address, intent: Extract<Intent, { kind: "goal" }>): Promise<Plan> {
  const id = BigInt(intent.id);
  const { vault, flow } = await oneFlow(owner, id);
  const href = `/goals/${intent.id}`;
  if (intent.fn === "pause") {
    if (Number(flow.kind) === 1) throw new Error("A saving goal does not stream. Pause it from the app.");
    if (flow.paused) return done(intent, { href });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(vault, vaultAbi, "pause", [id])], intent: { ...intent, submitted: true }, done: false };
  }
  if (intent.fn === "resume") {
    if (!flow.paused) return done(intent, { href });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(vault, vaultAbi, "resume", [id])], intent: { ...intent, submitted: true }, done: false };
  }
  if (intent.fn === "cancel" || intent.fn === "settle") {
    if (flow.settled) return done(intent, { href: "/goals" });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(vault, vaultAbi, intent.fn, [id])], intent: { ...intent, submitted: true }, done: false };
  }
  const pay = intent.pay ? readPay(intent.pay) : undefined;
  const amount = await sizedAmount(pay, intent.amount);
  if (intent.fn === "release") {
    if (intent.seen && flow.reserved < BigInt(intent.seen)) return done(intent, { href });
    if (intent.submitted) return pending(intent);
    return {
      calls: [encode(vault, vaultAbi, "release", [id, amount])],
      intent: { ...intent, seen: flow.reserved.toString(), submitted: true },
      done: false,
    };
  }
  if (intent.seen && flow.reserved > BigInt(intent.seen)) return done(intent, { href });
  if (intent.submitted) return pending(intent);
  const idle = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "unallocated",
    args: [addresses.fusdcx],
  });
  const calls: PreparedCall[] = [];
  if (idle < amount) {
    if (!pay) {
      const deposit = amount - idle;
      const balance = await balanceOf(owner, addresses.fusdcx);
      if (balance < withProtocolFee(deposit)) {
        throw new Error("The wallet does not have enough USD for this, including the 0.3% protocol fee.");
      }
    }
    await coverVault(calls, owner, vault, pay, amount - idle);
  }
  calls.push(encode(vault, vaultAbi, "topUp", [id, amount]));
  return { calls, intent: { ...intent, seen: flow.reserved.toString(), submitted: true }, done: false };
}

async function planLockAct(owner: Address, intent: Extract<Intent, { kind: "lockAct" }>): Promise<Plan> {
  const id = BigInt(intent.id);
  const entry = asLock(await publicClient.readContract({ address: addresses.locks, abi: lockAbi, functionName: "locks", args: [id] }));
  if (entry[0].toLowerCase() !== owner.toLowerCase()) throw new Error("That lock belongs to another account.");
  const href = "/vaults";
  if (intent.fn === "break" || intent.fn === "mature") {
    if (entry[7]) return done(intent, { href });
    if (intent.submitted) return pending(intent);
    const fn = intent.fn === "break" ? "breakEarly" : "withdrawMature";
    return { calls: [encode(addresses.locks, lockAbi, fn, [id])], intent: { ...intent, submitted: true }, done: false };
  }
  if (intent.seen && entry[2] > BigInt(intent.seen)) return done(intent, { href: `/vaults/${intent.id}` });
  if (intent.submitted) return pending(intent);
  const pay = intent.pay ? readPay(intent.pay) : undefined;
  const amount = await sizedAmount(pay, intent.amount);
  if (amount > BigInt("0xffffffffffffffffffffffffffffffff")) throw new Error("That amount is too large for a lock.");
  const calls: PreparedCall[] = [];
  const due = withProtocolFee(amount);
  if (pay) {
    if (entry[1].toLowerCase() !== addresses.fusdcx.toLowerCase()) throw new Error("This lock is not in USD.");
    await coverWallet(calls, owner, pay, due);
  }
  await approveIfNeeded(calls, owner, entry[1], addresses.locks, due);
  calls.push(encode(addresses.locks, lockAbi, "topUp", [id, amount]));
  return { calls, intent: { ...intent, seen: entry[2].toString(), submitted: true }, done: false };
}

async function groupOf(id: bigint) {
  return readGroup(id);
}

async function membersOf(id: bigint, count: number) {
  if (!count) return [];
  return publicClient.multicall({
    contracts: Array.from({ length: count }, (_, index) => ({
      address: addresses.groups,
      abi: groupAbi,
      functionName: "getMember" as const,
      args: [id, BigInt(index)] as const,
    })),
    allowFailure: false,
  });
}

async function planGroup(owner: Address, intent: Extract<Intent, { kind: "group" }>): Promise<Plan> {
  const id = BigInt(intent.id);
  const group = await groupOf(id);
  const href = `/groups/${intent.id}`;
  const count = Number(group[10]);
  const members = await membersOf(id, count);
  const mine = members.findIndex((member) => member[0].toLowerCase() === owner.toLowerCase());
  if (intent.fn === "start") {
    if (group[11]) return done(intent, { href });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(addresses.groups, groupAbi, "start", [id])], intent: { ...intent, submitted: true }, done: false };
  }
  if (intent.fn === "cancelBeforeStart") {
    if (group[12]) return done(intent, { href: "/groups" });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(addresses.groups, groupAbi, "cancelBeforeStart", [id])], intent: { ...intent, submitted: true }, done: false };
  }
  if (intent.fn === "exitBeforeStart") {
    if (mine < 0) return done(intent, { href: "/groups" });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(addresses.groups, groupAbi, "exitBeforeStart", [id])], intent: { ...intent, submitted: true }, done: false };
  }
  if (mine < 0) throw new Error("You are not a member of this group.");
  if (intent.fn === "postCollateral") {
    if (members[mine][3]) return done(intent, { href: `/groups/${intent.id}/paid` });
    if (intent.submitted) return pending(intent);
    const calls: PreparedCall[] = [];
    const due = withProtocolFee(group[4]);
    if (intent.pay) await coverWallet(calls, owner, readPay(intent.pay), due);
    await approveIfNeeded(calls, owner, addresses.fusdcx, addresses.groups, due);
    calls.push(encode(addresses.groups, groupAbi, "postCollateral", [id]));
    return { calls, intent: { ...intent, submitted: true }, done: false };
  }
  if (intent.fn === "claimCollateral") {
    if (group[13] && members[mine][2] === 0n) return done(intent, { href });
    if (intent.submitted) return pending(intent);
    return { calls: [encode(addresses.groups, groupAbi, "claimCollateral", [id])], intent: { ...intent, submitted: true }, done: false };
  }
  const given = members[mine][5];
  if (intent.seen && given > BigInt(intent.seen)) return done(intent, { href: `/groups/${intent.id}/paid` });
  if (intent.submitted) return pending(intent);
  const calls: PreparedCall[] = [];
  const due = withProtocolFee(group[3]);
  if (intent.pay) await coverWallet(calls, owner, readPay(intent.pay), due);
  await approveIfNeeded(calls, owner, addresses.fusdcx, addresses.groups, due);
  calls.push(encode(addresses.groups, groupAbi, "contribute", [id]));
  return { calls, intent: { ...intent, seen: given.toString(), submitted: true }, done: false };
}

async function planGroupCreate(owner: Address, intent: Extract<Intent, { kind: "groupCreate" }>): Promise<Plan> {
  const ids = (
    await publicClient.readContract({ address: addresses.groups, abi: groupAbi, functionName: "groupsOf", args: [owner] })
  ).map((id) => id.toString());
  if (!intent.knownIds) {
    const contribution = parseAmount(intent.contribution);
    if (contribution > BigInt("0xffffffffffffffffffffffffffffffff")) throw new Error("That contribution is too large.");
    const members = intent.members.map((item) => {
      if (!isAddress(item)) throw new Error("A member address is not valid.");
      return getAddress(item);
    });
    if (!members.some((item) => item.toLowerCase() === owner.toLowerCase())) {
      throw new Error("You have to be a member of the group you create.");
    }
    return {
      calls: [
        encode(addresses.groups, groupAbi, intent.plain ? "createPlainGroup" : "createGroup", [
          addresses.fusdcx,
          contribution,
          BigInt(intent.cycleSeconds),
          BigInt(intent.windowSeconds),
          BigInt(intent.graceSeconds),
          intent.cycles,
          members,
          members.map(() => 0n),
        ]),
      ],
      intent: { ...intent, knownIds: ids, submitted: true },
      done: false,
    };
  }
  const fresh = ids.find((id) => !intent.knownIds?.includes(id));
  const groupId = intent.groupId ?? fresh;
  if (!groupId) return pending(intent);
  const next = { ...intent, groupId };
  if (next.phones.length && !next.phonesQueued) {
    const calls = next.phones.flatMap((row) => {
      const digits = row.phone.replace(/\D/g, "");
      if (!isAddress(row.account) || digits.length < 7 || digits.length > 31) return [];
      return [encode(addresses.groups, groupAbi, "setMemberPhone", [BigInt(groupId), getAddress(row.account), toName(digits)])];
    });
    if (calls.length) return { calls, intent: { ...next, phonesQueued: true }, done: false };
  }
  return done(next, { id: groupId, href: `/groups/${groupId}` });
}

async function planPayout(owner: Address, intent: Extract<Intent, { kind: "payout" }>): Promise<Plan> {
  const id = BigInt(intent.id);
  const group = await groupOf(id);
  if (group[0].toLowerCase() !== owner.toLowerCase()) throw new Error("Only the person who created the group can do that.");
  if (group[11] || group[12]) throw new Error("The turn order is fixed once the group has started.");
  const count = Number(group[10]);
  let seats: number[];
  try {
    const order = await publicClient.readContract({
      address: addresses.groups,
      abi: groupAbi,
      functionName: "payoutOrder",
      args: [id],
    });
    const mapped = order.map(Number);
    const valid = mapped.length === count && mapped.every((seat, index) => seat >= 0 && seat < count && mapped.indexOf(seat) === index);
    seats = valid ? mapped : Array.from({ length: count }, (_, index) => index);
  } catch {
    throw new Error("This group contract cannot rearrange turns.");
  }
  if (intent.seen && seats.join(",") === intent.seen) return done(intent, { href: `/groups/${intent.id}` });
  if (intent.submitted) return pending(intent);
  const to = intent.from + intent.dir;
  if (!Number.isInteger(intent.from) || to < 0 || to >= seats.length) {
    throw new Error("That person is already at the end of the order.");
  }
  const next = seats.slice();
  const hold = next[intent.from];
  next[intent.from] = next[to];
  next[to] = hold;
  return {
    calls: [encode(addresses.groups, groupAbi, "setPayoutOrder", [id, next])],
    intent: { ...intent, seen: next.join(","), submitted: true },
    done: false,
  };
}

async function planPhone(owner: Address, intent: Extract<Intent, { kind: "phone" }>): Promise<Plan> {
  const digits = intent.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 31) throw new Error("Add a phone number with the country code in Settings first.");
  const current = await publicClient.readContract({
    address: addresses.groups,
    abi: groupAbi,
    functionName: "memberPhone",
    args: [BigInt(intent.id), owner],
  });
  let shown = "";
  try {
    shown = readName(current as Hex);
  } catch {
    shown = "";
  }
  if (shown === digits) return done(intent, { href: `/groups/${intent.id}` });
  if (intent.submitted) return pending(intent);
  return {
    calls: [encode(addresses.groups, groupAbi, "setMemberPhone", [BigInt(intent.id), owner, toName(digits)])],
    intent: { ...intent, submitted: true },
    done: false,
  };
}

export async function planIntent(owner: Address, intent: Intent): Promise<Plan> {
  switch (intent.kind) {
    case "saving":
      return planSaving(owner, intent);
    case "stream":
      return planStream(owner, intent);
    case "lock":
      return planLock(owner, intent);
    case "deposit":
      return planDeposit(owner, intent);
    case "withdraw":
      return planWithdraw(owner, intent);
    case "send":
      return planSend(owner, intent);
    case "goal":
      return planGoal(owner, intent);
    case "lockAct":
      return planLockAct(owner, intent);
    case "group":
      return planGroup(owner, intent);
    case "groupCreate":
      return planGroupCreate(owner, intent);
    case "payout":
      return planPayout(owner, intent);
    case "phone":
      return planPhone(owner, intent);
  }
}
