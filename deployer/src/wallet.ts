import EthereumProvider from "@walletconnect/ethereum-provider";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hex } from "viem";
import type { ProtocolChain } from "./chains";

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "fb48461bfb6043c40729e05706109f1a";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export type ConnectedWallet = {
  address: Address;
  chainId: number;
  getChainId: () => Promise<number>;
  switchChain: (id: number) => Promise<void>;
  send: (args: { to?: Address; data: Hex }) => Promise<Hex>;
  getBytecode: (address: Address) => Promise<Hex | undefined>;
  getTransactionCount: (address: Address) => Promise<bigint>;
  wait: (hash: Hex) => Promise<{ status: string; contractAddress: Address | null }>;
};

export async function connectWallet(chain: ProtocolChain): Promise<ConnectedWallet> {
  const injected = window.ethereum;
  const source: Eip1193 = injected ?? (await walletConnect(chain));
  const wallet = createWalletClient({ chain: chain.chain, transport: custom(source) });
  const [address] = await wallet.requestAddresses();
  if (!address) throw new Error("The wallet did not return an account.");
  const chainId = await wallet.getChainId();
  const client = createPublicClient({ chain: chain.chain, transport: http(chain.rpc) });
  return {
    address,
    chainId,
    getChainId: () => wallet.getChainId(),
    switchChain: (id) => wallet.switchChain({ id }),
    send: (args) => wallet.sendTransaction({ account: address, chain: chain.chain, ...args }),
    getBytecode: (account) => client.getBytecode({ address: account }),
    getTransactionCount: async (account) => BigInt(await client.getTransactionCount({ address: account })),
    wait: async (hash) => {
      const receipt = await client.waitForTransactionReceipt({ hash });
      return { status: receipt.status, contractAddress: receipt.contractAddress };
    },
  };
}

async function walletConnect(chain: ProtocolChain): Promise<Eip1193> {
  const provider = await EthereumProvider.init({
    projectId,
    chains: [chain.id],
    showQrModal: true,
    metadata: {
      name: "RvessFlow Protocol",
      description: "Sign a deployment from your wallet",
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.svg`],
    },
    rpcMap: { [chain.id]: chain.rpc },
  });
  await provider.connect();
  return provider as Eip1193;
}

export async function ensureChain(current: ConnectedWallet, chain: ProtocolChain): Promise<void> {
  if ((await current.getChainId()) === chain.id) return;
  await current.switchChain(chain.id);
}

export async function sendCreate(current: ConnectedWallet, chain: ProtocolChain, data: Hex): Promise<Address> {
  await ensureChain(current, chain);
  const hash = await current.send({ data });
  const receipt = await current.wait(hash);
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("The signing contract was not created.");
  }
  return receipt.contractAddress;
}

export async function sendCall(current: ConnectedWallet, chain: ProtocolChain, to: Address, data: Hex): Promise<void> {
  await ensureChain(current, chain);
  const hash = await current.send({ to, data });
  const receipt = await current.wait(hash);
  if (receipt.status !== "success") throw new Error("The deployment transaction reverted.");
}
