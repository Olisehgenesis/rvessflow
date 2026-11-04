export type PickedWallet =
  | { kind: "injected"; provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> } }
  | { kind: "walletconnect" };

type WalletPicker = (network: "base" | "celo") => Promise<PickedWallet>;

let picker: WalletPicker | null = null;

export function registerWalletPicker(next: WalletPicker) {
  picker = next;
  return () => {
    if (picker === next) picker = null;
  };
}

export async function pickWallet(network: "base" | "celo"): Promise<PickedWallet> {
  const started = Date.now();
  while (!picker && Date.now() - started < 4000) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  if (!picker) throw new Error("The wallet list is not ready. Refresh and try again.");
  return picker(network);
}
