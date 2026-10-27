"use server";

import { createPublicClient, getAddress, http, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { passkeyFromCookie } from "@/lib/passkey-cookie";
import { passkeySignedBy, passkeySignedByHex, publicKeyHex } from "@/lib/passkey-match";
import type { PasskeyProof, PasskeyRecord } from "@/lib/passkey-proof";

const validator = "0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69" as Address;
const installedTopic = "0xac9eef70e30b05ba935b5092b39f4fe85762ee3a8853386ea1e9a224986976ef" as Hex;
const span = 49_000n;
const batch = 8;
const maxWindows = 48;

type Candidate = { address: Address; x: bigint; y: bigint };

const seen = new Map<string, Candidate>();
let scannedUntil: bigint | null = null;
let scanTail: Promise<void> = Promise.resolve();

function network() {
  const testnet = (process.env.RVESS_NETWORK || process.env.NEXT_PUBLIC_RVESS_NETWORK) === "sepolia";
  return testnet
    ? { chain: baseSepolia, url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org" }
    : { chain: base, url: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com" };
}

function remember(account: Address, x: bigint, y: bigint) {
  if (x <= 0n || y <= 0n) return;
  seen.set(account.toLowerCase(), { address: account, x, y });
}

async function pull(fromBlock: bigint, toBlock: bigint) {
  const { chain, url } = network();
  const client = createPublicClient({ chain, transport: http(url) });
  const logs = await client.request({
    method: "eth_getLogs",
    params: [{
      address: validator,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [installedTopic],
    }],
  });
  for (const log of logs) {
    const topic = log.topics[1];
    if (!topic || log.data.length < 130) continue;
    const account = getAddress(`0x${topic.slice(-40)}`);
    const x = BigInt(log.data.slice(0, 66));
    const y = BigInt(`0x${log.data.slice(66, 130)}`);
    remember(account, x, y);
  }
}

async function moreCandidates() {
  const { chain, url } = network();
  const client = createPublicClient({ chain, transport: http(url) });
  const latest = await client.getBlockNumber();
  const cursor = scannedUntil ?? latest;
  if (cursor <= 0n) return;
  const covered = latest - cursor;
  if (covered / span >= BigInt(maxWindows)) return;
  const windows: { from: bigint; to: bigint }[] = [];
  let end = cursor;
  for (let i = 0; i < batch && end > 0n; i += 1) {
    const from = end > span ? end - span + 1n : 0n;
    windows.push({ from, to: end });
    end = from - 1n;
  }
  await Promise.all(windows.map((window) => pull(window.from, window.to).catch(() => undefined)));
  scannedUntil = end;
}

function match(proof: PasskeyProof, rpId: string): Candidate | null {
  for (const candidate of seen.values()) {
    if (passkeySignedBy(candidate.x, candidate.y, proof, rpId)) return candidate;
  }
  return null;
}

function fromCandidate(proof: PasskeyProof, found: Candidate): PasskeyRecord {
  return {
    id: proof.id,
    publicKey: publicKeyHex(found.x, found.y),
    address: found.address,
    label: "Passkey",
  };
}

async function searchChain(proof: PasskeyProof, rpId: string): Promise<PasskeyRecord | null> {
  const run = scanTail.then(async () => {
    for (let round = 0; round < Math.ceil(maxWindows / batch); round += 1) {
      const found = match(proof, rpId);
      if (found) return fromCandidate(proof, found);
      const before = seen.size;
      const cursor = scannedUntil;
      try {
        await moreCandidates();
      } catch {
        break;
      }
      if (seen.size === before && scannedUntil === cursor) break;
      if (seen.size === before && scannedUntil !== null && scannedUntil <= 0n) break;
    }
    const found = match(proof, rpId);
    return found ? fromCandidate(proof, found) : null;
  });
  scanTail = run.then(() => undefined, () => undefined);
  return run;
}

/** The passkey prompt proved this key. Find the Kernel account that stored it on Base. */
export async function recoverPasskey(proof: PasskeyProof): Promise<PasskeyRecord | null> {
  if (!proof?.id || !proof.authenticatorData || !proof.clientDataJSON || !proof.signature) return null;
  let originHeader = "";
  let host = "";
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    originHeader = list.get("origin") ?? "";
    host = list.get("x-forwarded-host") ?? list.get("host") ?? "";
  } catch {
    return null;
  }
  let clientOrigin = "";
  try {
    clientOrigin = String((JSON.parse(proof.clientDataJSON) as { origin?: string }).origin ?? "");
  } catch {
    return null;
  }
  let rpId = "";
  try {
    const parsed = new URL(clientOrigin);
    if (originHeader) {
      if (clientOrigin !== originHeader) return null;
    } else if (!host || parsed.host !== host) {
      return null;
    }
    rpId = parsed.hostname;
  } catch {
    return null;
  }
  if (!rpId) return null;
  const saved = await passkeyFromCookie(proof.id);
  if (saved && passkeySignedByHex(saved.publicKey, proof, rpId)) return saved;
  return searchChain(proof, rpId);
}
