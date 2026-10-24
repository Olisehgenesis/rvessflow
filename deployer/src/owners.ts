import {
  concat,
  encodeFunctionData,
  encodePacked,
  getAddress,
  getCreate2Address,
  isAddress,
  keccak256,
  pad,
  type Address,
  type Hex,
} from "viem";

export const SAFE_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as const;
export const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as const;
export const SAFE_FALLBACK = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as const;

/** Creation code returned by Safe Proxy Factory 1.4.1 `proxyCreationCode()`. */
const PROXY_CREATION_CODE =
  "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564" as Hex;

const setupAbi = [
  {
    type: "function",
    name: "setup",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
    ],
    outputs: [],
  },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export type OwnerContract = {
  address: Address;
  factory: Address;
  singleton: Address;
  initializer: Hex;
  saltNonce: bigint;
  owners: readonly Address[];
};

/** Three different wallets. Returns them in a stable order, or null while the fields are incomplete. */
export function parseOwners(fields: readonly string[]): Address[] | null {
  if (fields.length !== 3 || fields.some((field) => !isAddress(field.trim()))) return null;
  const owners = fields.map((field) => getAddress(field.trim()));
  if (new Set(owners.map((owner) => owner.toLowerCase())).size !== 3) return null;
  return [...owners].sort((left, right) => (left.toLowerCase() < right.toLowerCase() ? -1 : 1));
}

/** The 2-of-3 contract these wallets will control. Any two of them can act. */
export function ownerContract(owners: readonly Address[]): OwnerContract {
  const initializer = encodeFunctionData({
    abi: setupAbi,
    functionName: "setup",
    args: [owners, 2n, ZERO, "0x", SAFE_FALLBACK, ZERO, 0n, ZERO],
  });
  const salt = keccak256(encodePacked(["bytes32", "uint256"], [keccak256(initializer), 0n]));
  const initCode = concat([PROXY_CREATION_CODE, pad(SAFE_SINGLETON, { size: 32 })]);
  return {
    address: getCreate2Address({ from: SAFE_FACTORY, salt, bytecode: initCode }),
    factory: SAFE_FACTORY,
    singleton: SAFE_SINGLETON,
    initializer,
    saltNonce: 0n,
    owners,
  };
}
