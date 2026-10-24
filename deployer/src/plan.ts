import {
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { bytecode } from "./bytecode";
import type { ProtocolChain } from "./chains";
import type { OwnerContract } from "./owners";

export type Piece = {
  label: string;
  address: Address;
};

export type Deployment = {
  deployer: Address;
  calldata: Hex;
  pieces: Piece[];
  addresses: {
    safe: Address;
    allowlist: Address;
    conduit: Address;
    vaultImplementation: Address;
    factory: Address;
    locks: Address;
    groups: Address;
  };
};

const initializeAllowlist = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initialOwner", type: "address" },
      { name: "stable", type: "address" },
      { name: "stableKind", type: "uint8" },
      { name: "eth", type: "address" },
      { name: "ethKind", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

const initializeFactory = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initialOwner", type: "address" },
      { name: "allowlist_", type: "address" },
      { name: "implementation", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initialOwner", type: "address" },
      { name: "allowlist_", type: "address" },
      { name: "implementation", type: "address" },
      { name: "keeper_", type: "address" },
    ],
    outputs: [],
  },
] as const;

const initializeOwner = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [{ name: "initialOwner", type: "address" }],
    outputs: [],
  },
] as const;

const proxyAbi = [
  {
    type: "constructor",
    stateMutability: "payable",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "_data", type: "bytes" },
    ],
  },
] as const;

const deployAbi = [
  {
    type: "function",
    name: "deploy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "safeFactory", type: "address" },
      { name: "singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" },
      { name: "expectedSafe", type: "address" },
      { name: "initCodes", type: "bytes[]" },
    ],
    outputs: [{ name: "created", type: "address[]" }],
  },
] as const;

function proxy(implementation: Address, init: Hex): Hex {
  return encodeDeployData({ abi: proxyAbi, bytecode: bytecode.ERC1967Proxy, args: [implementation, init] });
}

export const deployerBytecode = bytecode.ProtocolDeployer;

/** Fresh deployment. `startNonce` is the ProtocolDeployer's next nonce, 1 on a new contract. */
export function buildDeployment(
  deployer: Address,
  startNonce: bigint,
  chain: ProtocolChain,
  keeper: string,
  safe: OwnerContract,
): Deployment {
  const owner = safe.address;
  let nonce = startNonce;
  const initCodes: Hex[] = [];
  const pieces: Piece[] = [];
  const place = (label: string, initCode: Hex) => {
    const address = getContractAddress({ from: deployer, nonce });
    nonce += 1n;
    initCodes.push(initCode);
    pieces.push({ label, address });
    return address;
  };

  const allowImpl = place(
    "Allowlist implementation",
    encodeDeployData({
      abi: [{ type: "constructor", stateMutability: "nonpayable", inputs: [{ name: "initialOwner", type: "address" }] }] as const,
      bytecode: bytecode.TokenAllowlist,
      args: [owner],
    }),
  );
  const allowlist = place(
    "Allowlist",
    proxy(
      allowImpl,
      encodeFunctionData({
        abi: initializeAllowlist,
        functionName: "initialize",
        args: [owner, chain.stable.address, chain.stable.kind, chain.eth.address, chain.eth.kind],
      }),
    ),
  );
  const conduit = place(
    "Conduit implementation",
    encodeDeployData({
      abi: [{ type: "constructor", stateMutability: "nonpayable", inputs: [{ name: "cfaForwarder_", type: "address" }] }] as const,
      bytecode: bytecode.FlowConduit,
      args: [chain.cfa],
    }),
  );
  const vaultImplementation = place(
    "Vault implementation",
    encodeDeployData({
      abi: [
        {
          type: "constructor",
          stateMutability: "nonpayable",
          inputs: [
            { name: "host_", type: "address" },
            { name: "cfa_", type: "address" },
            { name: "conduitImplementation_", type: "address" },
          ],
        },
      ] as const,
      bytecode: bytecode.FlowVault,
      args: [chain.host, chain.cfa, conduit],
    }),
  );
  const factoryImpl = place(
    "Factory implementation",
    encodeDeployData({
      abi: [
        {
          type: "constructor",
          stateMutability: "nonpayable",
          inputs: [
            { name: "initialOwner", type: "address" },
            { name: "allowlist_", type: "address" },
            { name: "implementation", type: "address" },
          ],
        },
      ] as const,
      bytecode: bytecode.VaultFactory,
      args: [owner, allowlist, vaultImplementation],
    }),
  );
  const keeperAddress = isAddress(keeper.trim()) ? (keeper.trim() as Address) : undefined;
  const factory = place(
    "Factory",
    proxy(
      factoryImpl,
      keeperAddress
        ? encodeFunctionData({
            abi: initializeFactory,
            functionName: "initialize",
            args: [owner, allowlist, vaultImplementation, keeperAddress],
          })
        : encodeFunctionData({
            abi: initializeFactory,
            functionName: "initialize",
            args: [owner, allowlist, vaultImplementation],
          }),
    ),
  );
  const lockImpl = place(
    "Lock vault implementation",
    encodeDeployData({
      abi: [
        {
          type: "constructor",
          stateMutability: "nonpayable",
          inputs: [
            { name: "initialOwner", type: "address" },
            { name: "allowlist_", type: "address" },
            { name: "host_", type: "address" },
            { name: "cfa_", type: "address" },
          ],
        },
      ] as const,
      bytecode: bytecode.LockVault,
      args: [owner, allowlist, chain.host, chain.cfa],
    }),
  );
  const locks = place(
    "Lock vault",
    proxy(lockImpl, encodeFunctionData({ abi: initializeOwner, functionName: "initialize", args: [owner] })),
  );
  const groupImpl = place(
    "Group implementation",
    encodeDeployData({
      abi: [
        {
          type: "constructor",
          stateMutability: "nonpayable",
          inputs: [
            { name: "allowlist_", type: "address" },
            { name: "host_", type: "address" },
            { name: "gda_", type: "address" },
          ],
        },
      ] as const,
      bytecode: bytecode.GroupRotation,
      args: [allowlist, chain.host, chain.gda],
    }),
  );
  const groups = place(
    "Group",
    proxy(groupImpl, encodeFunctionData({ abi: initializeOwner, functionName: "initialize", args: [owner] })),
  );

  return {
    deployer,
    calldata: encodeFunctionData({
      abi: deployAbi,
      functionName: "deploy",
      args: [safe.factory, safe.singleton, safe.initializer, safe.saltNonce, safe.address, initCodes],
    }),
    pieces,
    addresses: { safe: safe.address, allowlist, conduit, vaultImplementation, factory, locks, groups },
  };
}
