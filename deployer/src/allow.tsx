import { useEffect, useMemo, useState } from "react";
import { createPublicClient, encodeFunctionData, getAddress, hashTypedData, http, isAddress, parseAbi, zeroAddress, type Address, type Hex } from "viem";
import type { ProtocolChain } from "./chains";
import { InstalledConnect } from "./connect";
import { sendCall, type ConnectedWallet } from "./wallet";

const PURE = 2;

const allowAbi = parseAbi([
  "function owner() view returns (address)",
  "function isAllowed(address superToken) view returns (bool)",
  "function setSuperToken(address superToken, bool allowed, uint8 kind)",
]);

const factoryAbi = parseAbi(["function owner() view returns (address)", "function allowlist() view returns (address)"]);

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
  owner: Address;
  allowlist: Address;
  allowed: boolean;
  canAdd: boolean;
};

type SafeInfo = { owners: Address[]; threshold: number; nonce: bigint };
type SavedSig = { owner: Address; signature: Hex };

function same(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function clientFor(chain: ProtocolChain) {
  return createPublicClient({ chain: chain.chain, transport: http(chain.rpc) });
}

function sigKey(chain: ProtocolChain, safe: Address, list: Address, token: Address, nonce: bigint) {
  return `rvessflow-allow-token:${chain.id}:${safe.toLowerCase()}:${list.toLowerCase()}:${token.toLowerCase()}:${nonce}`;
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

function safeMessage(to: Address, data: Hex, nonce: bigint) {
  return {
    to,
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

function fail(err: unknown) {
  return err instanceof Error ? err.message.split("\n")[0] ?? "The wallet did not sign." : "The wallet did not sign.";
}

function allowCall(token: Address): Hex {
  return encodeFunctionData({ abi: allowAbi, functionName: "setSuperToken", args: [token, true, PURE] });
}

async function readLive(chain: ProtocolChain, allowlistHint?: Address): Promise<Live> {
  const client = clientFor(chain);
  const fromFactory =
    chain.factory !== zeroAddress
      ? await client.readContract({ address: chain.factory, abi: factoryAbi, functionName: "allowlist" })
      : chain.allowlist;
  const allowlist = allowlistHint && allowlistHint !== zeroAddress ? allowlistHint : fromFactory;
  const [owner, allowed] = await Promise.all([
    client.readContract({ address: allowlist, abi: allowAbi, functionName: "owner" }),
    client.readContract({ address: allowlist, abi: allowAbi, functionName: "isAllowed", args: [chain.goodDollar] }),
  ]);
  let canAdd = allowed;
  if (!allowed) {
    try {
      await client.call({ account: owner, to: allowlist, data: allowCall(chain.goodDollar) });
      canAdd = true;
    } catch {
      canAdd = false;
    }
  }
  return { owner, allowlist, allowed, canAdd };
}

export function AllowGoodDollar({
  chain,
  allowlist: allowlistHint,
  wallet,
  wallets,
  onConnect,
}: {
  chain: ProtocolChain;
  allowlist?: Address;
  wallet: ConnectedWallet | null;
  wallets: { id: string; name: string }[];
  onConnect: (walletId: string) => void;
}) {
  const [live, setLive] = useState<Live | null>(null);
  const [safe, setSafe] = useState<SafeInfo | null>(null);
  const [sigs, setSigs] = useState<SavedSig[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLive(null);
    setSafe(null);
    setError("");
    setStatus("");
    if (chain.goodDollar === zeroAddress) return;
    readLive(chain, allowlistHint)
      .then(async (next) => {
        if (cancelled) return;
        setLive(next);
        setSafe(await readSafe(chain, next.owner));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The allowlist could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [chain, allowlistHint]);

  useEffect(() => {
    if (!live || !safe) return;
    setSigs(readSigs(sigKey(chain, live.owner, live.allowlist, chain.goodDollar, safe.nonce)));
  }, [chain, live, safe]);

  const data = useMemo(() => allowCall(chain.goodDollar), [chain.goodDollar]);
  const ownerIsWallet = Boolean(wallet && live && same(wallet.address, live.owner));
  const walletIsSigner = Boolean(wallet && safe && safe.owners.some((owner) => same(owner, wallet.address)));
  const alreadySigned = Boolean(wallet && sigs.some((item) => same(item.owner, wallet.address)));
  const enoughSigns = Boolean(safe && sigs.length >= safe.threshold);

  async function sign() {
    if (!wallet || !live || !safe) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the signature in your wallet. This does not send the allow yet.");
    try {
      const message = safeMessage(live.allowlist, data, safe.nonce);
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
      localStorage.setItem(sigKey(chain, live.owner, live.allowlist, chain.goodDollar, safe.nonce), JSON.stringify(next));
      setSigs(next);
      setStatus(next.length >= safe.threshold ? "Both signatures are in. Send the allow." : "Signed. Connect a second owner wallet and sign the same allow.");
    } catch (err) {
      setError(fail(err));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!wallet || !live || !safe) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the transaction that allows G$.");
    try {
      const message = safeMessage(live.allowlist, data, safe.nonce);
      const exec = encodeFunctionData({
        abi: safeAbi,
        functionName: "execTransaction",
        args: [message.to, message.value, message.data, message.operation, message.safeTxGas, message.baseGas, message.gasPrice, message.gasToken, message.refundReceiver, packSignatures(sigs)],
      });
      await sendCall(wallet, chain, live.owner, exec);
      setLive(await readLive(chain, live.allowlist));
      setStatus("G$ is allowed. No upgrade was needed.");
    } catch (err) {
      setError(fail(err));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function sendDirect() {
    if (!wallet || !live) return;
    setBusy(true);
    setError("");
    setStatus("Confirm the signature in your wallet.");
    try {
      await sendCall(wallet, chain, live.allowlist, data);
      setLive(await readLive(chain, live.allowlist));
      setStatus("G$ is allowed. No upgrade was needed.");
    } catch (err) {
      setError(fail(err));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  if (chain.goodDollar === zeroAddress) {
    return (
      <section className="upgrade">
        <h2>Allow a token</h2>
        <p className="lede">G$ lives on Celo. Open Celo to add it. The owner signs setSuperToken. That is not an upgrade.</p>
      </section>
    );
  }

  return (
    <section className="upgrade">
      <h2>Allow a token</h2>
      <p className="lede">
        {live?.allowed
          ? "G$ is already on this allowlist."
          : live && !live.canAdd
            ? "This allowlist is the old code, so it cannot record G$. Sign the new protocol first. After that, two owner wallets add a token here with no wait."
            : "Two of the three owner wallets sign here to allow G$. That updates the list. It does not upgrade the contract, so there is no wait."}
      </p>
      <dl className="addresses">
        <div>
          <dt>G$</dt>
          <dd>{chain.goodDollar}</dd>
        </div>
        {live && (
          <>
            <div>
              <dt>Allowlist</dt>
              <dd>{live.allowlist}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{live.owner}</dd>
            </div>
            <div>
              <dt>G$ allowed</dt>
              <dd>{live.allowed ? "Yes" : "No"}</dd>
            </div>
          </>
        )}
      </dl>

      {!wallet && <InstalledConnect wallets={wallets} busy={busy} onConnect={onConnect} />}
      {walletIsSigner && live && !live.allowed && live.canAdd && (
        <button className="sign" type="button" onClick={sign} disabled={busy || alreadySigned}>
          {alreadySigned ? "Allow signed" : "Sign allow G$"}
        </button>
      )}
      {walletIsSigner && enoughSigns && live && !live.allowed && live.canAdd && (
        <button className="sign" type="button" onClick={send} disabled={busy}>
          Send allow G$
        </button>
      )}
      {ownerIsWallet && live && !live.allowed && live.canAdd && (
        <button className="sign" type="button" onClick={sendDirect} disabled={busy}>
          Allow G$
        </button>
      )}
      {safe && live && !live.allowed && live.canAdd && (
        <p className="note">
          {sigs.length} of {safe.threshold} owner signatures. {safe.owners.map((owner) => (sigs.some((item) => same(item.owner, owner)) ? `${owner} signed` : owner)).join(". ")}.
        </p>
      )}
      {status && <p className="status">{status}</p>}
      {error && <p className="status warn">{error}</p>}
    </section>
  );
}
