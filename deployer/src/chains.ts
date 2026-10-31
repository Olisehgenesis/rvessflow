import { defineChain, zeroAddress, type Address } from "viem";

const cfa = "0xcfA132E353cB4E398080B9700609bb008eceB125" as const;
const gda = "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08" as const;

export type ChainId = 42220 | 11142220 | 8453 | 84532;

export type ProtocolChain = {
  id: ChainId;
  name: string;
  rpc: string;
  host: Address;
  cfa: Address;
  gda: Address;
  stable: { address: Address; kind: 0 | 1; name: string };
  eth: { address: Address; kind: 0 | 1; name: string };
  groups: Address;
  factory: Address;
  allowlist: Address;
  goodDollar: Address;
  mainnet: boolean;
  chain: ReturnType<typeof defineChain>;
};

const celo = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ankr.com/celo", "https://forno.celo.org"] } },
  blockExplorers: { default: { name: "Celoscan", url: "https://celoscan.io" } },
});

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://celo-sepolia.blockscout.com" } },
});

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

export const chains: Record<ChainId, ProtocolChain> = {
  42220: {
    id: 42220,
    name: "Celo",
    rpc: "https://rpc.ankr.com/celo",
    host: "0xA4Ff07cF81C02CFD356184879D953970cA957585",
    cfa,
    gda,
    stable: { address: "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e", kind: 0, name: "cUSDx" },
    eth: { address: "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240", kind: 1, name: "CELOx" },
    groups: "0xc9c9483ab7BB269Ce50Ff265A5b0583268e39F63",
    factory: "0x0060f57E447e5E2D310b61cAD372Ae83959aF3B7",
    allowlist: "0xfc48D9CaeBb63Ac94D1170E921E126d9722B6C4E",
    goodDollar: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
    mainnet: true,
    chain: celo,
  },
  // Superfluid metadata does not list this chain. The Celo host, forwarders, cUSDx, and CELOx have no code here.
  11142220: {
    id: 11142220,
    name: "Celo Sepolia",
    rpc: "https://forno.celo-sepolia.celo-testnet.org",
    host: zeroAddress,
    cfa,
    gda,
    stable: { address: zeroAddress, kind: 0, name: "cUSDx" },
    eth: { address: zeroAddress, kind: 1, name: "CELOx" },
    groups: zeroAddress,
    factory: zeroAddress,
    allowlist: zeroAddress,
    goodDollar: zeroAddress,
    mainnet: false,
    chain: celoSepolia,
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    host: "0x109412E3C84f0539b43d39dB691B08c90f58dC7c",
    cfa,
    gda,
    stable: { address: "0x1650581F573eAd727B92073B5Ef8B4f5B94D1648", kind: 0, name: "fUSDCx" },
    eth: { address: "0x143ea239159155B408e71CDbE836e8CFD6766732", kind: 1, name: "ETHx" },
    groups: "0x70f5CF80052E8a8E0e5e252d33cd15F059956E3D",
    factory: zeroAddress,
    allowlist: zeroAddress,
    goodDollar: zeroAddress,
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
    groups: "0x13008059FAd0348Fb8848A0737F9E826C82199fa",
    factory: "0xc21B7Bd68F8235b7DB2827334d2039fD8B3C118d",
    allowlist: "0x34e748f13c294ED3b8Cdd1dd65C45b58981dBe8b",
    goodDollar: zeroAddress,
    mainnet: true,
    chain: base,
  },
};

export function asProtocolChain(chainId: number): ProtocolChain | null {
  if (chainId === 42220 || chainId === 11142220 || chainId === 8453 || chainId === 84532) return chains[chainId];
  return null;
}
