export function InstalledConnect({
  wallets,
  busy,
  onConnect,
}: {
  wallets: { id: string; name: string }[];
  busy: boolean;
  onConnect: (walletId: string) => void;
}) {
  if (wallets.length === 0) {
    return <p className="note">Install a wallet in this browser to sign.</p>;
  }
  return (
    <div className="choices">
      {wallets.map((wallet) => (
        <button key={wallet.id} className="connect" type="button" onClick={() => onConnect(wallet.id)} disabled={busy}>
          {wallet.name}
        </button>
      ))}
    </div>
  );
}
