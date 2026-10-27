import { useEffect, useState } from "react";
import { getContractAddress, isAddress, type Address } from "viem";
import { asProtocolChain, chains, type ProtocolChain } from "./chains";
import { ownerContract, parseOwners } from "./owners";
import { buildDeployment, deployerBytecode, type Deployment } from "./plan";
import { UpgradeGroups } from "./upgrade";
import { connectWallet, sendCall, sendCreate, type ConnectedWallet } from "./wallet";

type Saved = {
  deployer: Address;
  addresses?: Deployment["addresses"];
};

const storageKey = (chainId: number, account: Address) => `rvessflow-deploy:${chainId}:${account.toLowerCase()}`;

function readSaved(chainId: number, account: Address): Saved | null {
  const raw = localStorage.getItem(storageKey(chainId, account));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Saved;
    if (!isAddress(parsed.deployer)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSaved(chainId: number, account: Address, saved: Saved) {
  localStorage.setItem(storageKey(chainId, account), JSON.stringify(saved));
}

function readableError(err: unknown): string {
  const message = err instanceof Error ? err.message : "The wallet did not sign.";
  const line = message.split("\n")[0] ?? message;
  if (line.includes("Request too large")) {
    return "The wallet refused that signature because it was too large. Refresh the page and sign again.";
  }
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}

export function App() {
  const [chainId, setChainId] = useState<84532 | 8453>(84532);
  const [wallets, setWallets] = useState(["", "", ""]);
  const [keeper, setKeeper] = useState("");
  const [mainnetOk, setMainnetOk] = useState(false);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [plan, setPlan] = useState<Deployment | null>(null);
  const [deployerReady, setDeployerReady] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const chain = chains[chainId];
  const owners = parseOwners(wallets);
  const ownerPreview = owners ? ownerContract(owners) : null;

  async function prepare(current: ConnectedWallet, selected: ProtocolChain) {
    const saved = readSaved(selected.id, current.address);
    if (saved?.addresses) {
      const code = await current.getBytecode(saved.addresses.groups, selected);
      if (code && code !== "0x") {
        return { deployment: null, deployer: saved.deployer, deployerReady: true, done: true, saved };
      }
    }

    let deployer: Address;
    let nonce = 1n;
    const savedCode = saved ? await current.getBytecode(saved.deployer, selected) : undefined;
    if (saved && savedCode && savedCode !== "0x") {
      deployer = saved.deployer;
      nonce = await current.getTransactionCount(deployer, selected);
    } else {
      const walletNonce = await current.getTransactionCount(current.address, selected);
      deployer = getContractAddress({ from: current.address, nonce: walletNonce });
    }
    const owners = parseOwners(wallets);
    if (!owners) {
      const deployerCode = await current.getBytecode(deployer, selected);
      return {
        deployment: null,
        deployer,
        deployerReady: Boolean(deployerCode && deployerCode !== "0x"),
        done: false,
        saved,
      };
    }
    const deployment = buildDeployment(deployer, 1n, selected, keeper, ownerContract(owners), Number(nonce - 1n));
    const created = await current.getBytecode(deployment.addresses.groups, selected);
    const deployerCode = await current.getBytecode(deployer, selected);
    return {
      deployment,
      deployer,
      deployerReady: Boolean(deployerCode && deployerCode !== "0x"),
      done: Boolean(created && created !== "0x"),
      saved,
    };
  }

  useEffect(() => {
    if (!wallet) return;
    let cancel = false;
    prepare(wallet, chain)
      .then((next) => {
        if (cancel) return;
        setPlan(next.deployment);
        setDeployerReady(next.deployerReady);
        setDone(next.done);
        if (next.done && next.saved?.addresses && !next.deployment) {
          setPlan({
            deployer: next.saved.deployer,
            calls: [],
            pieces: [],
            addresses: next.saved.addresses,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "The deployment could not be prepared.");
      });
    return () => {
      cancel = true;
    };
  }, [wallet, chain, keeper, wallets]);

  async function onConnect() {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const connected = await connectWallet(chain);
      const known = asProtocolChain(connected.chainId);
      if (known) setChainId(known.id);
      setWallet(connected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet did not connect.");
    } finally {
      setBusy(false);
    }
  }

  async function onSign() {
    if (!wallet || !plan) return;
    const owners = parseOwners(wallets);
    if (!owners) {
      setError("Enter three different wallet addresses.");
      return;
    }
    if (!owners.some((owner) => owner.toLowerCase() === wallet.address.toLowerCase())) {
      setError("Connect one of the three wallets.");
      return;
    }
    if (keeper.trim() && !isAddress(keeper.trim())) {
      setError("The keeper address is not an address.");
      return;
    }
    if (chain.mainnet && !mainnetOk) {
      setError("Confirm that this deployment is going to Base mainnet.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const fresh = await prepare(wallet, chain);
      if (fresh.done) {
        setDone(true);
        setDeployerReady(true);
        if (fresh.saved?.addresses) {
          setPlan({ deployer: fresh.saved.deployer, calls: [], pieces: [], addresses: fresh.saved.addresses });
        }
        setStatus("This wallet already deployed the Rvess Protocol on this chain.");
        return;
      }
      if (!fresh.deployment) throw new Error("The deployment could not be prepared.");
      if (plan.addresses.allowlist !== fresh.deployment.addresses.allowlist || plan.deployer !== fresh.deployment.deployer) {
        setPlan(fresh.deployment);
        setDeployerReady(fresh.deployerReady);
        setStatus("The account nonce moved. Review the new addresses, then sign again.");
        return;
      }

      if (!fresh.deployerReady) {
        setStatus("Confirm the first signature in your wallet.");
        const deployer = await sendCreate(wallet, chain, deployerBytecode);
        writeSaved(chain.id, wallet.address, { deployer });
        setDeployerReady(true);
        const next = await prepare(wallet, chain);
        if (next.deployment) setPlan(next.deployment);
        setStatus("First signature is in. The protocol takes a few more signatures. The addresses stay the same.");
        return;
      }

      const calls = fresh.deployment.calls;
      if (calls.length === 0) throw new Error("Nothing left to sign.");
      for (let index = 0; index < calls.length; index += 1) {
        setStatus(`Confirm signature ${index + 1} of ${calls.length} in your wallet.`);
        await sendCall(wallet, chain, fresh.deployment.deployer, calls[index]);
      }
      writeSaved(chain.id, wallet.address, {
        deployer: fresh.deployment.deployer,
        addresses: fresh.deployment.addresses,
      });
      setPlan(fresh.deployment);
      setDone(true);
      setStatus("The protocol is deployed. Any two of the three wallets can change it.");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  const shownAddresses = done ? plan?.addresses : null;

  return (
    <main className="page">
      <h1>Sign the deployment</h1>
      <p className="lede">
        Any two of these three wallets can upgrade, pause, change tokens, change fees, and name managers. One wallet is not enough. You connect one of them and sign. The first signature creates a small contract. The protocol takes a few more signatures, because a wallet cannot fit every contract into one transaction. The addresses stay the same. People using Rvess do not sign here. This page stores no key. A fresh deployment does not change contracts already on Base. The section below upgrades the group contract that is already live.
      </p>

      <div className="choices" role="group" aria-label="Network">
        <button type="button" aria-pressed={chainId === 84532} onClick={() => setChainId(84532)} disabled={busy}>
          Base Sepolia
        </button>
        <button type="button" aria-pressed={chainId === 8453} onClick={() => setChainId(8453)} disabled={busy}>
          Base
        </button>
      </div>

      {wallet && (
        <p className="note">
          {wallet.address}. {chain.name}.
        </p>
      )}

      {chain.mainnet && <p className="note quiet">Base mainnet. These contracts have not had an external audit.</p>}

      {ownerPreview && (
        <p className="note">
          Any two of these three control {ownerPreview.address}.
        </p>
      )}

      {(["First wallet", "Second wallet", "Third wallet"] as const).map((label, index) => (
        <label className="field" key={label}>
          {label}
          <input
            value={wallets[index]}
            onChange={(event) =>
              setWallets((current) => current.map((value, item) => (item === index ? event.target.value : value)))
            }
            spellCheck={false}
            autoCapitalize="off"
            placeholder="0x"
            aria-invalid={wallets[index].trim() !== "" && !isAddress(wallets[index].trim())}
          />
        </label>
      ))}

      <label className="field">
        Keeper, if you want one
        <input
          value={keeper}
          onChange={(event) => setKeeper(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          placeholder="Leave empty"
          aria-invalid={keeper.trim() !== "" && !isAddress(keeper.trim())}
        />
      </label>

      <ol>
        <li>
          {deployerReady ? "Signing contract, already deployed" : "First signature, the signing contract"}
          {plan && <span>{plan.deployer}</span>}
        </li>
        <li>
          {done ? "Protocol, deployed" : "Protocol signatures"}
          {plan && plan.pieces.length > 0 && (
            <ol className="pieces">
              {plan.pieces.map((piece) => (
                <li key={piece.label}>
                  {piece.label}
                  <span>{piece.address}</span>
                </li>
              ))}
            </ol>
          )}
        </li>
      </ol>

      {chain.mainnet && (
        <label className="confirm">
          <input type="checkbox" checked={mainnetOk} onChange={(event) => setMainnetOk(event.target.checked)} />
          <span>Deploy on Base mainnet.</span>
        </label>
      )}

      {!wallet && (
        <button className="connect" type="button" onClick={onConnect} disabled={busy}>
          Connect wallet
        </button>
      )}
      {wallet && !done && (
        <button className="sign" type="button" onClick={onSign} disabled={busy || !plan}>
          {deployerReady
            ? plan && plan.calls.length > 1
              ? `Sign the protocol, ${plan.calls.length} signatures`
              : "Sign the protocol"
            : "Sign the first transaction"}
        </button>
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="status warn">{error}</p>}

      {shownAddresses && (
        <dl className="addresses">
          <div><dt>Owner</dt><dd>{shownAddresses.safe}</dd></div>
          <div><dt>Allowlist</dt><dd>{shownAddresses.allowlist}</dd></div>
          <div><dt>Factory</dt><dd>{shownAddresses.factory}</dd></div>
          <div><dt>Lock vault</dt><dd>{shownAddresses.locks}</dd></div>
          <div><dt>Group</dt><dd>{shownAddresses.groups}</dd></div>
          <div><dt>Conduit</dt><dd>{shownAddresses.conduit}</dd></div>
          <div><dt>Vault code</dt><dd>{shownAddresses.vaultImplementation}</dd></div>
        </dl>
      )}
      <UpgradeGroups chain={chain} wallet={wallet} onConnect={onConnect} />
    </main>
  );
}
