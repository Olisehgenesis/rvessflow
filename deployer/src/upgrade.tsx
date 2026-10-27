import { useEffect, useState } from "react";
import { createPublicClient, encodeDeployData, encodeFunctionData, getAddress, hashTypedData, http, isAddress, parseAbi, zeroAddress, type Address, type Hex } from "viem";
import { bytecode } from "./bytecode";
import type { ProtocolChain } from "./chains";
import { sendCall, sendCreate, type ConnectedWallet } from "./wallet";

const abi = parseAbi([
  "constructor(address allowlist_, address host_, address gda_)",
  "function allowlist() view returns (address)",
  "function host() view returns (address)",
  "function gda() view returns (address)",
  "function owner() view returns (address)",
  "function pendingImplementation() view returns (address)",
  "function upgradeReadyAt() view returns (uint64)",
  "function scheduleUpgrade(address newImplementation)",
  "function upgradeToAndCall(address newImplementation, bytes data)",
]);

const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
]);

const safeTypes = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

type Live = {
  allowlist: Address;
  host: Address;
  gda: Address;
  owner: Address;
  pending: Address;
  readyAt: bigint;
};

type SafeInfo = { owners: Address[]; threshold: number; nonce: bigint };
type SavedSig = { owner: Address; signature: Hex };

function same(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function when(readyAt: bigint) {
  if (readyAt === 0n) return "Not scheduled.";
  return new Date(Number(readyAt) * 1000).toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function scheduledSentence(chainName: string, pending: Address, readyAt: bigint) {
  return `Scheduled on ${chainName}. The new code is ${pending}. The group contract people use stays on the current code until ${when(readyAt)}.`;
}

async function readLive(chain: ProtocolChain): Promise<Live> {
  const client = createPublicClient({ chain: chain.chain, transport: http(chain.rpc) });
  const proxy = chain.groups;
  const [allowlist, host, gda, owner, pending, readyAt] = await Promise.all([
    client.readContract({ address: proxy, abi, functionName: "allowlist" }),
    client.readContract({ address: proxy, abi, functionName: "host" }),
    client.readContract({ address: proxy, abi, functionName: "gda" }),
    client.readContract({ address: proxy, abi, functionName: "owner" }),
    client.readContract({ address: proxy, abi, functionName: "pendingImplementation" }),
    client.readContract({ address: proxy, abi, functionName: "upgradeReadyAt" }),
  ]);
  return { allowlist, host, gda, owner, pending, readyAt };
}

function clientFor(chain: ProtocolChain) {
  return createPublicClient({ chain: chain.chain, transport: http(chain.rpc) });
}

function implKey(chain: ProtocolChain) {
  return `rvessflow-upgrade:${chain.id}:${chain.groups.toLowerCase()}`;
}

function readImpl(chain: ProtocolChain): Address | null {
  const raw = localStorage.getItem(implKey(chain));
  return raw && isAddress(raw) ? getAddress(raw) : null;
}

function sigKey(chain: ProtocolChain, safe: Address, impl: Address, nonce: bigint) {
  return `rvessflow-safe:${chain.id}:${safe.toLowerCase()}:${impl.toLowerCase()}:${nonce}`;
}

function readSigs(key: string): SavedSig[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedSig[];
    return parsed.flatMap((item) => (isAddress(item.owner) && item.signature.startsWith("0x") ? [{ owner: getAddress(item.owner), signature: item.signature }] : []));
  } catch {
    return [];
  }
}

async function readSafe(chain: ProtocolChain, owner: Address): Promise<SafeInfo | null> {
  try {
    const client = clientFor(chain);
    const [owners, threshold, nonce] = await Promise.all([
      client.readContract({ address: owner, abi: safeAbi, functionName: "getOwners" }),
      client.readContract({ address: owner, abi: safeAbi, functionName: "getThreshold" }),
      client.readContract({ address: owner, abi: safeAbi, functionName: "nonce" }),
    ]);
    return { owners: owners.map((item) => getAddress(item)), threshold: Number(threshold), nonce };
  } catch {
    return null;
  }
}

function safeMessage(chain: ProtocolChain, data: Hex, nonce: bigint) {
  return {
    to: chain.groups,
    value: 0n,
    data,
    operation: 0,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: zeroAddress,
    refundReceiver: zeroAddress,
    nonce,
  };
}

function packSignatures(sigs: SavedSig[]): Hex {
  const sorted = [...sigs].sort((left, right) => (left.owner.toLowerCase() < right.owner.toLowerCase() ? -1 : 1));
  return `0x${sorted.map((item) => item.signature.slice(2)).join("")}`;
}

export function UpgradeGroups({
  chain,
  wallet,
  onConnect,
}: {
  chain: ProtocolChain;
  wallet: ConnectedWallet | null;
  onConnect: () => void;
}) {
  const [live, setLive] = useState<Live | null>(null);
  const [implementation, setImplementation] = useState<Address | null>(() => readImpl(chain));
  const [safe, setSafe] = useState<SafeInfo | null>(null);
  const [sigs, setSigs] = useState<SavedSig[]>([]);
  const [finishSigs, setFinishSigs] = useState<SavedSig[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLive(null);
    setSafe(null);
    setImplementation(readImpl(chain));
    setError("");
    setStatus("");
    readLive(chain)
      .then(async (next) => {
        if (cancelled) return;
        setLive(next);
        setSafe(await readSafe(chain, next.owner));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The group contract could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  useEffect(() => {
    if (implementation) localStorage.setItem(implKey(chain), implementation);
  }, [chain, implementation]);

  useEffect(() => {
    if (!implementation || !safe) return;
    setSigs(readSigs(sigKey(chain, live?.owner ?? zeroAddress, implementation, safe.nonce)));
  }, [chain, implementation, live?.owner, safe]);

  useEffect(() => {
    if (live && live.pending !== zeroAddress) return;
    let cancelled = false;
    const pull = () => {
      readLive(chain)
        .then((next) => {
          if (cancelled) return;
          setLive((current) => (current && current.pending === next.pending && current.readyAt === next.readyAt ? current : next));
        })
        .catch(() => {});
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chain, live?.pending]);

  useEffect(() => {
    if (!live || live.pending === zeroAddress) return;
    setImplementation((current) => (current && same(current, live.pending) ? current : live.pending));
  }, [live]);

  useEffect(() => {
    if (!live || live.readyAt === 0n) return;
    const due = Number(live.readyAt) * 1000 - Date.now();
    if (due <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), due + 1000);
    return () => window.clearTimeout(timer);
  }, [live?.readyAt]);

  useEffect(() => {
    if (!implementation || !safe || !live || live.pending === zeroAddress) return;
    setFinishSigs(readSigs(`${sigKey(chain, live.owner, implementation, safe.nonce)}:finish`));
  }, [chain, implementation, live, safe]);

  const ownerIsWallet = Boolean(wallet && live && same(wallet.address, live.owner));
  const walletIsSigner = Boolean(wallet && safe?.owners.some((owner) => same(owner, wallet.address)));
  const alreadySigned = Boolean(wallet && sigs.some((item) => same(item.owner, wallet.address)));
  const enoughSigns = Boolean(safe && sigs.length >= safe.threshold);
  const scheduleData: Hex | null = implementation
    ? encodeFunctionData({ abi, functionName: "scheduleUpgrade", args: [implementation] })
    : null;
  const finishData: Hex | null = implementation
    ? encodeFunctionData({ abi, functionName: "upgradeToAndCall", args: [implementation, "0x"] })
    : null;
  const ready = Boolean(live && implementation && same(live.pending, implementation) && live.readyAt > 0n && BigInt(Math.floor(now / 1000)) >= live.readyAt);
  const finishSigned = Boolean(wallet && finishSigs.some((item) => same(item.owner, wallet.address)));
  const finishReadyToSend = Boolean(safe && finishSigs.length >= safe.threshold);
  const alreadyScheduled = Boolean(live && live.pending !== zeroAddress);

  async function deploy() {
    if (!wallet || !live) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the signature that deploys the new group code. This does not change the live contract yet.");
    try {
      const created = await sendCreate(
        wallet,
        chain,
        encodeDeployData({
          abi,
          bytecode: bytecode.GroupRotation,
          args: [live.allowlist, live.host, live.gda],
        }),
      );
      setImplementation(created);
      setStatus("The new code is deployed. Two owner wallets sign the schedule next. The live contract changes two days after that schedule is sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function signSchedule() {
    if (!wallet || !live || !safe || !scheduleData) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the signature in your wallet. This does not send the schedule yet.");
    try {
      const message = safeMessage(chain, scheduleData, safe.nonce);
      const local = hashTypedData({
        domain: { chainId: chain.id, verifyingContract: live.owner },
        types: safeTypes,
        primaryType: "SafeTx",
        message,
      });
      const remote = await clientFor(chain).readContract({
        address: live.owner,
        abi: safeAbi,
        functionName: "getTransactionHash",
        args: [message.to, message.value, message.data, message.operation, message.safeTxGas, message.baseGas, message.gasPrice, message.gasToken, message.refundReceiver, message.nonce],
      });
      if (local.toLowerCase() !== remote.toLowerCase()) throw new Error("This signature would not match the owner wallet.");
      const signature = await wallet.signTypedData({
        domain: { chainId: chain.id, verifyingContract: live.owner },
        types: safeTypes,
        primaryType: "SafeTx",
        message,
      });
      const next = [...sigs.filter((item) => !same(item.owner, wallet.address)), { owner: getAddress(wallet.address), signature }];
      localStorage.setItem(sigKey(chain, live.owner, implementation as Address, safe.nonce), JSON.stringify(next));
      setSigs(next);
      setStatus(next.length >= safe.threshold ? "Both signatures are in. Send the schedule." : "Signed. Connect a second owner wallet and sign the same schedule.");
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function sendSchedule() {
    if (!wallet || !live || !safe || !scheduleData || !implementation) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the transaction that sends the schedule. The new code waits two days after this.");
    try {
      const message = safeMessage(chain, scheduleData, safe.nonce);
      const data = encodeFunctionData({
        abi: safeAbi,
        functionName: "execTransaction",
        args: [message.to, message.value, message.data, message.operation, message.safeTxGas, message.baseGas, message.gasPrice, message.gasToken, message.refundReceiver, packSignatures(sigs)],
      });
      await sendCall(wallet, chain, live.owner, data);
      let next = await readLive(chain);
      for (let attempt = 0; attempt < 5 && next.pending === zeroAddress; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        next = await readLive(chain);
      }
      setLive(next);
      setStatus(next.pending === zeroAddress ? "The transaction was sent. This page is waiting for Base to show the schedule." : scheduledSentence(chain.name, next.pending, next.readyAt));
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function signFinish() {
    if (!wallet || !live || !safe || !finishData || !implementation || !ready) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the finish signature. This does not change the live contract until it is sent.");
    try {
      const message = safeMessage(chain, finishData, safe.nonce);
      const local = hashTypedData({
        domain: { chainId: chain.id, verifyingContract: live.owner },
        types: safeTypes,
        primaryType: "SafeTx",
        message,
      });
      const remote = await clientFor(chain).readContract({
        address: live.owner,
        abi: safeAbi,
        functionName: "getTransactionHash",
        args: [message.to, message.value, message.data, message.operation, message.safeTxGas, message.baseGas, message.gasPrice, message.gasToken, message.refundReceiver, message.nonce],
      });
      if (local.toLowerCase() !== remote.toLowerCase()) throw new Error("This signature would not match the owner wallet.");
      const signature = await wallet.signTypedData({
        domain: { chainId: chain.id, verifyingContract: live.owner },
        types: safeTypes,
        primaryType: "SafeTx",
        message,
      });
      const next = [...finishSigs.filter((item) => !same(item.owner, wallet.address)), { owner: getAddress(wallet.address), signature }];
      localStorage.setItem(`${sigKey(chain, live.owner, implementation, safe.nonce)}:finish`, JSON.stringify(next));
      setFinishSigs(next);
      setStatus(next.length >= safe.threshold ? "Both finish signatures are in. Send the finish." : "Signed. Connect a second owner wallet and sign the finish.");
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function sendFinish() {
    if (!wallet || !live || !safe || !finishData || !ready) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the transaction that puts the new code live.");
    try {
      const message = safeMessage(chain, finishData, safe.nonce);
      const data = encodeFunctionData({
        abi: safeAbi,
        functionName: "execTransaction",
        args: [message.to, message.value, message.data, message.operation, message.safeTxGas, message.baseGas, message.gasPrice, message.gasToken, message.refundReceiver, packSignatures(finishSigs)],
      });
      await sendCall(wallet, chain, live.owner, data);
      setLive(await readLive(chain));
      setStatus("The group contract is now running the new code.");
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function send(data: Hex, next: string) {
    if (!wallet) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the signature in your wallet.");
    try {
      await sendCall(wallet, chain, chain.groups, data);
      setLive(await readLive(chain));
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="upgrade">
      <h2>Upgrade the group contract</h2>
      <p className="lede">
        {alreadyScheduled && live
          ? `The schedule is already signed. Nothing else is signed until ${when(live.readyAt)}. After that, two of the three owner wallets sign the finish. One wallet is not enough.`
          : `This deploys the group code that can pay each turn as a transfer, then prepares the upgrade for the group contract already on ${chain.name}. When the owner is a group of wallets, two of them sign here. The new code waits two days after that schedule is sent.`}
      </p>
      <dl className="addresses">
        <div>
          <dt>Group contract</dt>
          <dd>{chain.groups}</dd>
        </div>
        {live && (
          <>
            <div>
              <dt>Owner</dt>
              <dd>{live.owner}</dd>
            </div>
            <div>
              <dt>Allowlist</dt>
              <dd>{live.allowlist}</dd>
            </div>
            <div>
              <dt>Scheduled code</dt>
              <dd>{live.pending === zeroAddress ? "None" : live.pending}</dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd>{when(live.readyAt)}</dd>
            </div>
          </>
        )}
        {implementation && (
          <div>
            <dt>New code</dt>
            <dd>{implementation}</dd>
          </div>
        )}
      </dl>
      {live && live.pending !== zeroAddress && <p className="status">{scheduledSentence(chain.name, live.pending, live.readyAt)}</p>}

      {!wallet && (
        <button className="connect" type="button" onClick={onConnect} disabled={busy}>
          Connect wallet
        </button>
      )}
      {wallet && live && isAddress(live.allowlist) && !alreadyScheduled && (
        <button className="sign" type="button" onClick={deploy} disabled={busy}>
          Deploy the new group code
        </button>
      )}
      {walletIsSigner && scheduleData && safe && !alreadyScheduled && (
        <button className="sign" type="button" onClick={signSchedule} disabled={busy || alreadySigned}>
          {alreadySigned ? "Schedule signed" : "Sign the schedule"}
        </button>
      )}
      {walletIsSigner && enoughSigns && !alreadyScheduled && (
        <button className="sign" type="button" onClick={sendSchedule} disabled={busy}>
          Send the schedule
        </button>
      )}
      {safe && implementation && !alreadyScheduled && (
        <p className="note">
          {sigs.length} of {safe.threshold} owner signatures. {safe.owners.map((owner) => (sigs.some((item) => same(item.owner, owner)) ? `${owner} signed` : owner)).join(". ")}.
        </p>
      )}
      {ownerIsWallet && scheduleData && (
        <button
          className="sign"
          type="button"
          onClick={() => send(scheduleData, "Scheduled. The upgrade can be finished two days from now.")}
          disabled={busy}
        >
          Schedule the upgrade
        </button>
      )}
      {walletIsSigner && finishData && ready && (
        <button className="sign" type="button" onClick={signFinish} disabled={busy || finishSigned}>
          {finishSigned ? "Finish signed" : "Sign the finish"}
        </button>
      )}
      {walletIsSigner && finishReadyToSend && ready && (
        <button className="sign" type="button" onClick={sendFinish} disabled={busy}>
          Send the finish
        </button>
      )}
      {ownerIsWallet && finishData && ready && (
        <button className="sign" type="button" onClick={() => send(finishData, "The group contract is now running the new code.")} disabled={busy}>
          Finish the upgrade
        </button>
      )}

      {scheduleData && !ownerIsWallet && !alreadyScheduled && (
        <div className="calldata">
          <p className="note">
            Two owner wallets sign above. The raw schedule call is below if you send it from the owner wallet yourself. Two days later, the second line finishes the upgrade.
          </p>
          <p className="mono">{scheduleData}</p>
          <p className="mono">{finishData}</p>
        </div>
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="status warn">{error}</p>}
    </section>
  );
}
