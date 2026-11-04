"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import QRCode from "qrcode";
import { ChevronLeft, X } from "lucide-react";
import { hasWalletConnectSession, pairWalletConnect } from "@/lib/auth-client";
import { connectAnnounced, listAnnouncedWallets, recentInjectedHint, type AnnouncedWallet } from "@/lib/wallet-injected";
import { dedupeConnectors, splitWalletSections, type ListedConnector } from "@/lib/wallet-list";
import { registerWalletPicker, type PickedWallet } from "@/lib/wallet-picker";
import "./connect-wallet-modal.css";

type Job = {
  network: "base" | "celo";
  resolve: (value: PickedWallet) => void;
  reject: (error: Error) => void;
};

const walletConnectRow: ListedConnector = {
  id: "walletconnect",
  name: "WalletConnect",
  icon: walletConnectIcon(),
  source: "walletconnect",
};

const coinbaseRow: ListedConnector = {
  id: "coinbase",
  name: "Coinbase Wallet",
  rdns: "com.coinbase.wallet",
  icon: coinbaseIcon(),
  source: "coinbase",
};

function walletConnectIcon() {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#3396FF"/><path fill="#fff" d="M10.2 13.4a7.6 7.6 0 0 1 11.6 0l.4.4.1.1-1.7 1.7-.1-.1-.4-.4a5.2 5.2 0 0 0-7.8 0l-.4.4-.1.1-1.7-1.7.1-.1zm13 3.3 1.7 1.7-.1.1-4.3 4.3-.1.1-.1.1a3.3 3.3 0 0 1-4.4 0l-.1-.1-2.9-2.9a.8.8 0 0 1 0-1.1l.1-.1 1.1-1.1.1-.1a.8.8 0 0 1 1.1 0l2.9 2.9a.8.8 0 0 0 1.1 0l4.3-4.3.1-.1z"/></svg>`,
  )}`;
}

function coinbaseIcon() {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0052FF"/><rect x="10" y="10" width="12" height="12" rx="3" fill="#fff"/></svg>`,
  )}`;
}

function rejected(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && Number(error.code) === 4001) return true;
  const text = error instanceof Error ? error.message : "";
  return /reject|reset|closed|cancel|dismiss|denied/i.test(text);
}

function errorText(error: unknown) {
  if (rejected(error)) return "The wallet declined the connection. Try again when you are ready.";
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The wallet could not connect.";
}

export function ConnectWalletHost() {
  const [open, setOpen] = useState(false);
  const job = useRef<Job | null>(null);

  useEffect(() => {
    return registerWalletPicker(
      (network) =>
        new Promise<PickedWallet>((resolve, reject) => {
          job.current?.reject(new Error("Connection request reset"));
          job.current = { network, resolve, reject };
          setOpen(true);
        }),
    );
  }, []);

  function finish(value: PickedWallet) {
    const current = job.current;
    job.current = null;
    setOpen(false);
    current?.resolve(value);
  }

  function abort() {
    const current = job.current;
    job.current = null;
    setOpen(false);
    current?.reject(new Error("Connection request reset"));
  }

  return (
    <ConnectWalletModal
      open={open}
      onOpenChange={(next) => {
        if (!next) abort();
      }}
      onPicked={finish}
    />
  );
}

export function ConnectWalletModal({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (value: PickedWallet) => void;
}) {
  const titleId = useId();
  const [view, setView] = useState<"list" | "qr">("list");
  const [wallets, setWallets] = useState<AnnouncedWallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [uri, setUri] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const pairing = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setView("list");
    setError("");
    setBusy(null);
    setUri("");
    setQr("");
    setCopied(false);
    void listAnnouncedWallets(250).then(setWallets);
  }, [open]);

  useEffect(() => {
    if (!uri) {
      setQr("");
      return;
    }
    let live = true;
    void QRCode.toDataURL(uri, { margin: 1, width: 280, color: { dark: "#0b0f14", light: "#ffffff" } }).then((data) => {
      if (live) setQr(data);
    });
    return () => {
      live = false;
    };
  }, [uri]);

  const listed = dedupeConnectors([
    ...wallets.map((wallet) => ({
      id: wallet.info.rdns || wallet.info.uuid,
      name: wallet.info.name,
      rdns: wallet.info.rdns,
      icon: wallet.info.icon || undefined,
      source: "announced" as const,
    })),
    walletConnectRow,
    coinbaseRow,
  ]);
  const sections = splitWalletSections(listed, recentInjectedHint()?.rdns);
  const announcedById = new Map(wallets.map((wallet) => [wallet.info.rdns || wallet.info.uuid, wallet]));

  async function connectInstalled(row: ListedConnector) {
    const wallet = announcedById.get(row.id) ?? wallets.find((item) => item.info.rdns === row.rdns);
    if (!wallet) {
      setError("That wallet is not available in this browser.");
      return;
    }
    setBusy(row.id);
    setError("");
    try {
      await connectAnnounced(wallet);
      onPicked({ kind: "injected", provider: wallet.provider });
    } catch (caught) {
      setError(errorText(caught));
      setBusy(null);
    }
  }

  async function connectScan(kind: "walletconnect" | "coinbase") {
    setView("qr");
    setBusy(kind);
    setError("");
    setUri("");
    pairing.current?.abort();
    const controller = new AbortController();
    pairing.current = controller;
    try {
      if (await hasWalletConnectSession()) {
        onPicked({ kind: "walletconnect" });
        return;
      }
      await pairWalletConnect((next) => {
        setUri(next);
        if (kind === "coinbase") {
          window.open(`https://go.cb-w.com/wc?uri=${encodeURIComponent(next)}`, "_blank", "noopener,noreferrer");
        }
      }, controller.signal);
      if (!controller.signal.aborted) onPicked({ kind: "walletconnect" });
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(errorText(caught));
      setBusy(null);
      setView("list");
    }
  }

  function backToList() {
    pairing.current?.abort();
    setView("list");
    setBusy(null);
    setUri("");
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="cw-overlay cw-root" />
        <Dialog.Content
          className="cw-card cw-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onEscapeKeyDown={(event) => {
            if (view !== "qr") return;
            event.preventDefault();
            pairing.current?.abort();
            setView("list");
            setBusy(null);
          }}
        >
          <div className="cw-head">
            {view === "qr" ? (
              <button type="button" className="cw-icon-btn" onClick={backToList} aria-label="Back">
                <ChevronLeft className="size-5" />
              </button>
            ) : (
              <span className="cw-icon-btn" aria-hidden />
            )}
            <Dialog.Title id={titleId} className="cw-title">
              {view === "qr" ? "Scan QR" : "Connect wallet"}
            </Dialog.Title>
            <Dialog.Close className="cw-icon-btn" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>

          {error ? <p className="cw-error" role="alert">{error}</p> : null}

          {view === "qr" ? (
            <div className="cw-qr">
              {qr ? <img src={qr} alt="WalletConnect QR code" /> : <span className="cw-spin" aria-hidden />}
              <p className="cw-hint">Scan this QR with your phone wallet.</p>
              {uri ? (
                <button
                  type="button"
                  className="cw-copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(uri).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {sections.recent.length ? (
                <section className="cw-section" aria-label="Recent">
                  <h3 className="cw-label">Recent</h3>
                  {sections.recent.map((row) => (
                    <WalletRow key={row.id} row={row} badge="Recent" busy={busy} onClick={() => void connectInstalled(row)} />
                  ))}
                </section>
              ) : null}
              {sections.installed.length ? (
                <section className="cw-section" aria-label="Installed">
                  <h3 className="cw-label">Installed</h3>
                  {sections.installed.map((row) => (
                    <WalletRow key={row.id} row={row} badge="Installed" kind="installed" busy={busy} onClick={() => void connectInstalled(row)} />
                  ))}
                </section>
              ) : null}
              <section className="cw-section" aria-label="Other wallets">
                <h3 className="cw-label">Other wallets</h3>
                {sections.other.map((row) => (
                  <WalletRow
                    key={row.id}
                    row={row}
                    busy={busy}
                    onClick={() => void connectScan(row.source === "coinbase" ? "coinbase" : "walletconnect")}
                  />
                ))}
              </section>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WalletRow({
  row,
  badge,
  kind,
  busy,
  onClick,
}: {
  row: ListedConnector;
  badge?: string;
  kind?: "installed";
  busy: string | null;
  onClick: () => void;
}) {
  const loading = busy === row.id;
  return (
    <button type="button" className="cw-row" onClick={onClick} disabled={Boolean(busy)} aria-busy={loading}>
      <span className="cw-mark">
        {row.icon ? <img src={row.icon} alt="" /> : <span className="cw-letter">{row.name.slice(0, 1)}</span>}
      </span>
      <span className="cw-name">{row.source === "walletconnect" ? "WalletConnect / Scan QR" : row.name}</span>
      {loading ? <span className="cw-spin" aria-hidden /> : badge ? <span className={`cw-pill${kind === "installed" ? " cw-pill-installed" : ""}`}>{badge}</span> : null}
    </button>
  );
}
