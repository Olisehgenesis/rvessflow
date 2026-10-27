import EthereumProvider from "@walletconnect/ethereum-provider";
import { clearInjectedConnection, peekInjectedConnection, showInjectedWallets, takeInjectedConnection } from "../../lib/wallet-injected";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hex } from "viem";
import { chains, type ProtocolChain } from "./chains";

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "fb48461bfb6043c40729e05706109f1a";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const baseWalletId = "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa";

export type ConnectedWallet = {
  address: Address;
  chainId: number;
  getChainId: () => Promise<number>;
  switchChain: (id: number) => Promise<void>;
  send: (args: { to?: Address; data: Hex; chain: ProtocolChain }) => Promise<Hex>;
  signTypedData: (parameters: {
    domain: { chainId: number; verifyingContract: Address };
    types: { readonly SafeTx: readonly { readonly name: string; readonly type: string }[] };
    primaryType: "SafeTx";
    message: {
      to: Address;
      value: bigint;
      data: Hex;
      operation: number;
      safeTxGas: bigint;
      baseGas: bigint;
      gasPrice: bigint;
      gasToken: Address;
      refundReceiver: Address;
      nonce: bigint;
    };
  }) => Promise<Hex>;
  getBytecode: (address: Address, chain: ProtocolChain) => Promise<Hex | undefined>;
  getTransactionCount: (address: Address, chain: ProtocolChain) => Promise<bigint>;
  wait: (hash: Hex, chain: ProtocolChain) => Promise<{ status: string; contractAddress: Address | null }>;
};

export async function connectWallet(chain: ProtocolChain): Promise<ConnectedWallet> {
  const source = await walletConnect(chain);
  const wallet = createWalletClient({ chain: chain.chain, transport: custom(source) });
  const [address] = await wallet.requestAddresses();
  if (!address) throw new Error("The wallet did not return an account.");
  const chainId = await wallet.getChainId();
  const reader = (selected: ProtocolChain) =>
    createPublicClient({ chain: selected.chain, transport: http(selected.rpc) });
  return {
    address,
    chainId,
    getChainId: () => wallet.getChainId(),
    switchChain: (id) => switchOrAddChain(source, wallet, id),
    send: (args) => wallet.sendTransaction({ account: address, to: args.to, data: args.data, chain: args.chain.chain }),
    signTypedData: (parameters) => wallet.signTypedData({ account: address, ...parameters }),
    getBytecode: (account, selected) => reader(selected).getBytecode({ address: account }),
    getTransactionCount: async (account, selected) => BigInt(await reader(selected).getTransactionCount({ address: account })),
    wait: async (hash, selected) => {
      const receipt = await reader(selected).waitForTransactionReceipt({ hash });
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
      name: "Rvess Protocol",
      description: "Sign a deployment from your wallet",
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.svg`],
    },
    rpcMap: { [chain.id]: chain.rpc },
    qrModalOptions: {
      themeMode: "light",
      enableExplorer: true,
      explorerRecommendedWalletIds: [baseWalletId],
    },
  });
  clearInjectedConnection();
  await showInjectedWallets((provider as { modal?: { close: () => void } }).modal);
  try {
    await provider.connect();
  } catch (error) {
    if (!peekInjectedConnection()) throw error;
  }
  return (takeInjectedConnection() ?? provider) as Eip1193;
}

async function switchOrAddChain(
  source: Eip1193,
  wallet: ReturnType<typeof createWalletClient>,
  id: number,
): Promise<void> {
  try {
    await wallet.switchChain({ id });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? Number(error.code) : 0;
    if (code === 4001) throw error;
    if (code !== 4902) throw error;
    const selected = id === 84532 || id === 8453 ? chains[id] : null;
    if (!selected) throw error;
    await source.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${id.toString(16)}`,
          chainName: selected.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [selected.rpc],
          blockExplorerUrls: [selected.chain.blockExplorers?.default.url ?? "https://basescan.org"],
        },
      ],
    });
  }
}

export async function ensureChain(current: ConnectedWallet, chain: ProtocolChain): Promise<void> {
  if ((await current.getChainId()) === chain.id) return;
  await current.switchChain(chain.id);
}

export async function sendCreate(current: ConnectedWallet, chain: ProtocolChain, data: Hex): Promise<Address> {
  await ensureChain(current, chain);
  const hash = await current.send({ data, chain });
  const receipt = await current.wait(hash, chain);
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("The signing contract was not created.");
  }
  return receipt.contractAddress;
}

export async function sendCall(current: ConnectedWallet, chain: ProtocolChain, to: Address, data: Hex): Promise<void> {
  await ensureChain(current, chain);
  const hash = await current.send({ to, data, chain });
  const receipt = await current.wait(hash, chain);
  if (receipt.status !== "success") throw new Error("The deployment transaction reverted.");
}
