import { decodeAbiParameters, decodeFunctionData, type Address, type Hex } from "viem";

/** Celo passkey gas: app contracts, Uniswap, tokens, Superfluid, Kernel. New wallets are not listed. */
export const celoSponsorPolicyId = "sp_small_tusk";

const executeAbi = [
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "execMode", type: "bytes32" },
      { name: "executionCalldata", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

const allowed = new Set(
  [
    "0xeC9f5717593f66BA703e9bdB871B24014642F3cB",
    "0x1a48b3d9f38ea0B905F4731c5D3bdA081078b5ef",
    "0x3627815B99D045A40a189000FBf7dAE729cEF9eB",
    "0xe98361A2D733783b20371ed6b03e93c7be7A3285",
    "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e",
    "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240",
    "0xcfA132E353cB4E398080B9700609bb008eceB125",
    "0xA4Ff07cF81C02CFD356184879D953970cA957585",
    "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    "0x471EcE3750Da237f93B8E339c536989b8978a438",
    "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72",
    "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    "0xD221812de1BD094f35587EE8E174B07B6167D9Af",
    "0x5615CDAb10dc425a742d643d949a7F474C01abc4",
    "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8",
    "0xAfE208a311B21f13EF87E33A90049fC17A7acDEc",
    "0xcb695bc5d3aa22cad1e6df07801b061a05a0233a",
    "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419",
    "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
    "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D",
    "0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69",
    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "0x50c503dFFd9e8d0903Bf33376F6DdD278209939A",
  ].map((item) => item.toLowerCase()),
);

function allowedAddress(value: string) {
  return allowed.has(value.toLowerCase());
}

function factoryFromInit(initCode: string | undefined) {
  const raw = (initCode || "0x").replace(/^0x/i, "");
  if (raw.length < 40) return null;
  return `0x${raw.slice(0, 40)}`;
}

function targetsFromCallData(callData: Hex): Address[] {
  const decoded = decodeFunctionData({ abi: executeAbi, data: callData });
  const packed = decoded.args[1];
  try {
    const [batch] = decodeAbiParameters(
      [
        {
          type: "tuple[]",
          components: [
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "callData", type: "bytes" },
          ],
        },
      ],
      packed,
    );
    return batch.map((item) => item.target);
  } catch {
    return [`0x${packed.slice(2, 42)}` as Address];
  }
}

export function shouldSponsorCeloUserOp(input: { chainId?: number; callData?: string; initCode?: string }) {
  if (Number(input.chainId) !== 42220) return false;
  const factory = factoryFromInit(input.initCode);
  if (factory && !allowedAddress(factory)) return false;
  if (!input.callData || input.callData === "0x") return true;
  try {
    const targets = targetsFromCallData(input.callData as Hex);
    if (targets.length === 0) return false;
    return targets.every((target) => allowedAddress(target));
  } catch {
    return false;
  }
}

export function withCeloSponsorshipPolicy(body: unknown) {
  if (!body || typeof body !== "object" || !("method" in body) || !("params" in body)) return body;
  const method = String((body as { method: unknown }).method);
  if (!/^pm_(sponsorUserOperation|getPaymasterData|getPaymasterStubData)$/.test(method)) return body;
  const params = (body as { params: unknown }).params;
  if (!Array.isArray(params) || params.length < 2) return body;
  const context = params[2] && typeof params[2] === "object" ? { ...(params[2] as object) } : {};
  return {
    ...body,
    params: [params[0], params[1], { ...context, sponsorshipPolicyId: celoSponsorPolicyId }],
  };
}
