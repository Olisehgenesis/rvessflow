import { fallback, http } from "viem";
import { base, baseSepolia, celo } from "viem/chains";

export const celoRpcAnkr = "https://rpc.ankr.com/celo";
export const celoRpcForno = "https://forno.celo.org";

/** Ankr first, Forno if Ankr fails. A custom env URL is tried before both. */
export function celoRpcUrls(): string[] {
  const extra = (process.env.CELO_RPC_URL || process.env.NEXT_PUBLIC_CELO_RPC_URL || "").trim();
  const urls = [celoRpcAnkr, celoRpcForno];
  if (extra && extra !== celoRpcAnkr && extra !== celoRpcForno) urls.unshift(extra);
  return urls;
}

export function celoTransport() {
  return fallback(celoRpcUrls().map((url) => http(url)));
}

export type AppNetwork = "base" | "sepolia" | "celo";

/** The network this app build is pointed at. Base stays the default. */
export function appNetwork(): AppNetwork {
  const raw = (process.env.NEXT_PUBLIC_RVESS_NETWORK || process.env.RVESS_NETWORK || "base").toLowerCase();
  if (raw === "sepolia" || raw === "base-sepolia") return "sepolia";
  if (raw === "celo") return "celo";
  return "base";
}

export function appChain() {
  const network = appNetwork();
  if (network === "celo") return celo;
  if (network === "sepolia") return baseSepolia;
  return base;
}

/** Server reads `BASE_` and `CELO_`. The browser reads the matching `NEXT_PUBLIC_` names. */
export function appRpc(): string {
  const network = appNetwork();
  if (network === "celo") return celoRpcUrls()[0];
  if (network === "sepolia") {
    return process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  }
  return process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";
}

export function explorerUrl(): string {
  const network = appNetwork();
  if (network === "celo") return "https://celoscan.io";
  if (network === "sepolia") return "https://sepolia.basescan.org";
  return "https://basescan.org";
}

export function networkLabel(): string {
  return appChain().name;
}

export function stableName(): string {
  const network = appNetwork();
  if (network === "celo") return "cUSDx";
  if (network === "sepolia") return "fUSDCx";
  return "USDCx";
}

/** Parameters for `wallet_addEthereumChain` on the app network. */
export function walletNetwork() {
  const chain = appChain();
  return {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: appNetwork() === "celo" ? celoRpcUrls() : [appRpc()],
    blockExplorerUrls: [explorerUrl()],
  };
}
