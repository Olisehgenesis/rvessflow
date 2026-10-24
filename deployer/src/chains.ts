import { defineChain, type Address } from "viem";

const cfa = "0xcfA132E353cB4E398080B9700609bb008eceB125" as const;
const gda = "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08" as const;

export type ProtocolChain = {
  id: 84532 | 8453;
  name: string;
  rpc: string;
  host: Address;
  cfa: Address;
  gda: Address;
  stable: { address: Address; kind: 0 | 1; name: string };
  eth: { address: Address; kind: 0 | 1; name: string };
  mainnet: boolean;
  chain: ReturnType<typeof defineChain>;
};

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
});

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
});

export const chains: Record<84532 | 8453, ProtocolChain> = {
  84532: {
    id: 84532,
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    host: "0x109412E3C84f0539b43d39dB691B08c90f58dC7c",
    cfa,
    gda,
    stable: { address: "0x1650581F573eAd727B92073B5Ef8B4f5B94D1648", kind: 0, name: "fUSDCx" },
    eth: { address: "0x143ea239159155B408e71CDbE836e8CFD6766732", kind: 1, name: "ETHx" },
    mainnet: false,
    chain: baseSepolia,
  },
  8453: {
    id: 8453,
    name: "Base",
    rpc: "https://mainnet.base.org",
    host: "0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74",
    cfa,
    gda,
    stable: { address: "0xD04383398dD2426297da660F9CCA3d439AF9ce1b", kind: 0, name: "USDCx" },
    eth: { address: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93", kind: 1, name: "ETHx" },
    mainnet: true,
    chain: base,
  },
};

export function asProtocolChain(chainId: number): ProtocolChain | null {
  if (chainId === 84532 || chainId === 8453) return chains[chainId];
  return null;
}
