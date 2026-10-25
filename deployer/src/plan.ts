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
  calls: Hex[];
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

/** A wallet RPC rejects one transaction that carries every contract. Stay under that limit. */
const maxCallBytes = 48_000;

function encodeDeploy(safe: OwnerContract, initCodes: Hex[]): Hex {
  return encodeFunctionData({
    abi: deployAbi,
    functionName: "deploy",
    args: [safe.factory, safe.singleton, safe.initializer, safe.saltNonce, safe.address, initCodes],
  });
}

function chunkInitCodes(safe: OwnerContract, initCodes: Hex[], alreadyCreated: number): Hex[] {
  const batches: Hex[][] = [];
  let batch: Hex[] = [];
  for (const code of initCodes) {
    const next = [...batch, code];
    const size = (encodeDeploy(safe, next).length - 2) / 2;
    if (batch.length > 0 && size > maxCallBytes) {
      batches.push(batch);
      batch = [code];
    } else {
      batch = next;
    }
  }
  if (batch.length > 0) batches.push(batch);

  let skip = alreadyCreated;
  const calls: Hex[] = [];
  for (const item of batches) {
    if (skip >= item.length) {
      skip -= item.length;
      continue;
    }
    if (skip > 0) throw new Error("A signature stopped halfway. Review the addresses, then sign again.");
    calls.push(encodeDeploy(safe, item));
  }
  return calls;
}

/** Fresh deployment. Addresses are predicted from nonce 1. `alreadyCreated` skips finished signatures. */
export function buildDeployment(
  deployer: Address,
  startNonce: bigint,
  chain: ProtocolChain,
  keeper: string,
  safe: OwnerContract,
  alreadyCreated = 0,
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
    calls: chunkInitCodes(safe, initCodes, alreadyCreated),
    pieces,
    addresses: { safe: safe.address, allowlist, conduit, vaultImplementation, factory, locks, groups },
  };
}
