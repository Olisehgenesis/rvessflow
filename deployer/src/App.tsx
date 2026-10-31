import { useEffect, useMemo, useState } from "react";
import { getContractAddress, isAddress, zeroAddress, type Address } from "viem";
import { chains, type ChainId, type ProtocolChain } from "./chains";
import { ownerContract, parseOwners } from "./owners";
import { buildDeployment, deployerBytecode, type Deployment } from "./plan";
import { loadChainStats, type ChainStats } from "./stats";
import { AllowGoodDollar } from "./allow";
import { UpgradeGroups } from "./upgrade";
import { InstalledConnect } from "./connect";
import { installedWallets, type InstalledWallet } from "../../lib/wallet-injected";
import { connectWallet, sendCall, sendCreate, type ConnectedWallet } from "./wallet";

type Saved = {
  deployer: Address;
  addresses?: Deployment["addresses"];
};

type Anchor = {
  deployer: Address;
  alreadyCreated: number;
  deployerReady: boolean;
  saved: Saved | null;
};

const storageKey = (chainId: number, account: Address) => `rvessflow-deploy:${chainId}:${account.toLowerCase()}`;

const probeSafe = ownerContract([
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
]);

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

function clearSaved(chainId: number, account: Address) {
  localStorage.removeItem(storageKey(chainId, account));
}

function readableError(err: unknown): string {
  const message = err instanceof Error ? err.message : "The wallet did not sign.";
  const line = message.split("\n")[0] ?? message;
  if (line.includes("Request too large")) {
    return "The wallet refused that signature because it was too large. Refresh the page and sign again.";
  }
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}

function hasCode(code: string | undefined): boolean {
  return Boolean(code && code !== "0x");
}

/** Chain reads only. The signature list is built locally from this result. */
async function readAnchor(
  current: ConnectedWallet,
  selected: ProtocolChain,
  fresh = false,
): Promise<{ anchor: Anchor; done: boolean }> {
  const saved = readSaved(selected.id, current.address);
  const [savedGroups, savedDeployerCode, walletNonce] = await Promise.all([
    saved?.addresses ? current.getBytecode(saved.addresses.groups, selected) : Promise.resolve(undefined),
    saved ? current.getBytecode(saved.deployer, selected) : Promise.resolve(undefined),
    current.getTransactionCount(current.address, selected),
  ]);
  if (!fresh && saved?.addresses && hasCode(savedGroups)) {
    return {
      done: true,
      anchor: { deployer: saved.deployer, alreadyCreated: 0, deployerReady: true, saved },
    };
  }

  let deployer: Address;
  let alreadyCreated = 0;
  let deployerReady = false;
  if (saved && hasCode(savedDeployerCode)) {
    deployer = saved.deployer;
    const nonce = await current.getTransactionCount(deployer, selected);
    alreadyCreated = Number(nonce - 1n);
    deployerReady = true;
  } else {
    deployer = getContractAddress({ from: current.address, nonce: walletNonce });
    const deployerCode = await current.getBytecode(deployer, selected);
    deployerReady = hasCode(deployerCode);
    if (deployerReady) {
      const nonce = await current.getTransactionCount(deployer, selected);
      alreadyCreated = Number(nonce - 1n);
    }
  }

  const predicted = buildDeployment(deployer, 1n, selected, "", probeSafe, alreadyCreated);
  const groupsCode = await current.getBytecode(predicted.addresses.groups, selected);
  return {
    done: hasCode(groupsCode),
    anchor: { deployer, alreadyCreated, deployerReady, saved },
  };
}

const deployChains = [chains[42220], chains[8453], chains[11142220]] as const;
const baseOwners = [
  "0x9b6A52A88a1Ee029Bd14170fFb8fB15839Bd18cB",
  "0xf7dbD2867f55832E4A05E16Cd69cB57A70923cDD",
  "0x53eaF4CD171842d8144e45211308e5D90B4b0088",
] as const;

export function App() {
  const [chainId, setChainId] = useState<ChainId>(8453);
  const chain = chains[chainId];
  const [wallets, setWallets] = useState([...baseOwners]);
  const [keeper, setKeeper] = useState("");
  const [mainnetOk, setMainnetOk] = useState(false);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [facts, setFacts] = useState<ChainStats | null>(null);
  const [factsError, setFactsError] = useState("");
  const [done, setDone] = useState(false);
  const [installed, setInstalled] = useState<InstalledWallet[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false);

  const owners = parseOwners(wallets);
  const ownerPreview = owners ? ownerContract(owners) : null;

  const plan = useMemo(() => {
    if (!anchor) return null;
    if (done && anchor.saved?.addresses) {
      return {
        deployer: anchor.deployer,
        calls: [],
        pieces: [],
        addresses: anchor.saved.addresses,
      } satisfies Deployment;
    }
    const parsed = parseOwners(wallets);
    if (!parsed) return null;
    return buildDeployment(anchor.deployer, 1n, chain, keeper, ownerContract(parsed), anchor.alreadyCreated);
  }, [anchor, wallets, keeper, chain, done]);

  useEffect(() => {
    let cancel = false;
    installedWallets().then((next) => {
      if (!cancel) setInstalled(next);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    loadChainStats(chain)
      .then((next) => {
        if (!cancel) setFacts(next);
      })
      .catch(() => {
        if (!cancel) setFactsError(`${chain.name} could not be read.`);
      });
    return () => {
      cancel = true;
    };
  }, [chain]);

  useEffect(() => {
    if (!wallet) return;
    let cancel = false;
    readAnchor(wallet, chain, fresh)
      .then((next) => {
        if (cancel) return;
        setAnchor(next.anchor);
        setDone(next.done);
        if (next.done && !fresh) {
          setStatus("This wallet already deployed the protocol on Celo. Those contracts stay live. Sign a new protocol to get G$ and the six-hour wait. That creates new addresses.");
        }
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "The deployment could not be prepared.");
      });
    return () => {
      cancel = true;
    };
  }, [wallet, chain, fresh]);

  function chooseChain(next: ChainId) {
    if (next === chainId) return;
    setChainId(next);
    if (next === 8453) setWallets([...baseOwners]);
    setAnchor(null);
    setDone(false);
    setMainnetOk(false);
    setFacts(null);
    setFactsError("");
    setStatus("");
    setError("");
    setFresh(false);
  }

  async function onConnect(walletId: string) {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const connected = await connectWallet(chain, walletId);
      if ((await connected.getChainId()) !== chain.id) await connected.switchChain(chain.id);
      setWallet(connected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet did not connect.");
    } finally {
      setBusy(false);
    }
  }

  async function onSign() {
    if (!wallet || !plan || !anchor) return;
    const parsed = parseOwners(wallets);
    if (!parsed) {
      setError("Enter three different wallet addresses.");
      return;
    }
    if (!parsed.some((owner) => owner.toLowerCase() === wallet.address.toLowerCase())) {
      setError("Connect one of the three wallets.");
      return;
    }
    if (keeper.trim() && !isAddress(keeper.trim())) {
      setError("The keeper address is not an address.");
      return;
    }
    if (chain.mainnet && !mainnetOk) {
      setError(`Confirm that this deployment is going to ${chain.name}.`);
      return;
    }
    if (!superfluidReady) {
      setError(`Superfluid is not on ${chain.name}, so the protocol cannot be signed here yet.`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const nextAnchor = await readAnchor(wallet, chain, fresh);
      setAnchor(nextAnchor.anchor);
      if (nextAnchor.done) {
        setDone(true);
        setStatus("This wallet already deployed the Rvess Protocol on this chain.");
        return;
      }
      const deployment = buildDeployment(
        nextAnchor.anchor.deployer,
        1n,
        chain,
        keeper,
        ownerContract(parsed),
        nextAnchor.anchor.alreadyCreated,
      );
      if (plan.addresses.allowlist !== deployment.addresses.allowlist || plan.deployer !== deployment.deployer) {
        setStatus("The account nonce moved. Review the new addresses, then sign again.");
        return;
      }

      if (!nextAnchor.anchor.deployerReady) {
        setStatus("Confirm the first signature in your wallet.");
        const deployer = await sendCreate(wallet, chain, deployerBytecode);
        writeSaved(chain.id, wallet.address, { deployer });
        const next = await readAnchor(wallet, chain, fresh);
        setAnchor(next.anchor);
        setStatus("First signature is in. The protocol takes a few more signatures. The addresses stay the same.");
        return;
      }

      const calls = deployment.calls;
      if (calls.length === 0) throw new Error("Nothing left to sign.");
      for (let index = 0; index < calls.length; index += 1) {
        setStatus(`Confirm signature ${index + 1} of ${calls.length} in your wallet.`);
        await sendCall(wallet, chain, deployment.deployer, calls[index]);
      }
      writeSaved(chain.id, wallet.address, {
        deployer: deployment.deployer,
        addresses: deployment.addresses,
      });
      setAnchor({ ...nextAnchor.anchor, deployerReady: true, saved: { deployer: deployment.deployer, addresses: deployment.addresses } });
      setFresh(false);
      setDone(true);
      setStatus("The protocol is deployed. Any two of the three wallets can change it.");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  const shownAddresses = done ? plan?.addresses : null;
  const superfluidReady = facts ? facts.host && facts.cfa && facts.gda && facts.stable && facts.native : false;

  return (
    <main className="page">
      <h1>Sign the deployment</h1>
      <p className="lede">
        Any two of these three wallets can upgrade, pause, change tokens, change fees, and name managers. One wallet is not enough. You connect one of them and sign. Pick Base to upgrade the live group contract so a new group can pay each turn. That does not move Celo. Pick Celo only to sign a new Celo protocol. This page stores no key.
      </p>

      <div className="choices" role="group" aria-label="Network">
        {deployChains.map((option) => (
          <button key={option.id} type="button" aria-pressed={option.id === chain.id} onClick={() => chooseChain(option.id)}>
            {option.name}
          </button>
        ))}
      </div>

      {factsError ? <p className="status warn">{factsError}</p> : null}
      <dl className="addresses stats" aria-label={chain.name}>
        <div>
          <dt>Chain</dt>
          <dd>{chain.name} · {chain.id}</dd>
        </div>
        <div>
          <dt>Superfluid</dt>
          <dd>{facts ? (superfluidReady ? "Host and forwarders are live" : `Missing on ${chain.name}`) : "Checking"}</dd>
        </div>
        <div>
          <dt>{chain.stable.name}</dt>
          <dd>{facts ? (facts.stable ? chain.stable.address : `Not on ${chain.name}`) : "Checking"}</dd>
        </div>
        <div>
          <dt>{chain.eth.name}</dt>
          <dd>{facts ? (facts.native ? chain.eth.address : `Not on ${chain.name}`) : "Checking"}</dd>
        </div>
        <div>
          <dt>Signatures</dt>
          <dd>{plan ? (done ? "Deployed" : plan.calls.length === 0 ? "Signing contract is next" : `${plan.calls.length} left`) : "Connect a wallet"}</dd>
        </div>
      </dl>

      {wallet && (
        <p className="note">
          {wallet.address}. {chain.name}.
        </p>
      )}

      {chain.mainnet && <p className="note quiet">{chain.name}. These contracts have not had an external audit.</p>}

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
          {anchor?.deployerReady ? "Signing contract, already deployed" : "First signature, the signing contract"}
          {anchor && <span>{anchor.deployer}</span>}
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
          <span>Deploy on {chain.name}.</span>
        </label>
      )}

      {!wallet && <InstalledConnect wallets={installed} busy={busy} onConnect={onConnect} />}
      {facts && !superfluidReady && (
        <p className="status warn">Superfluid is not on {chain.name}, so the protocol cannot be signed here yet.</p>
      )}

      {wallet && !done && superfluidReady && !plan && (
        <p className="note">Enter the three owner wallets. Then this page can sign the protocol. G$ is included in that deploy. You do not allow G$ first.</p>
      )}

      {wallet && done && !fresh && (
        <button
          className="sign"
          type="button"
          onClick={() => {
            if (!wallet) return;
            clearSaved(chain.id, wallet.address);
            setDone(false);
            setAnchor(null);
            setError("");
            setStatus("This creates new addresses. The protocol already on Celo stays where it is. Confirm Deploy on Celo, then sign the first transaction.");
            setFresh(true);
          }}
          disabled={busy}
        >
          Sign a new protocol
        </button>
      )}

      {wallet && !done && superfluidReady && (
        <button className="sign" type="button" onClick={onSign} disabled={busy || !plan}>
          {anchor?.deployerReady
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
      {done && (
        <AllowGoodDollar chain={chain} allowlist={shownAddresses?.allowlist ?? chain.allowlist} wallet={wallet} wallets={installed} onConnect={onConnect} />
      )}
      {chain.groups !== zeroAddress && (
        <UpgradeGroups chain={chain} wallet={wallet} wallets={installed} onConnect={onConnect} />
      )}
    </main>
  );
}
