import { decodeAbiParameters, decodeFunctionData, type Address, type Hex } from "viem";

/** Celo passkey gas: app contracts, Uniswap, tokens, Superfluid, Kernel. New wallets are not listed. */

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
    "0x0060f57E447e5E2D310b61cAD372Ae83959aF3B7",
    "0x0A55056218036f3396b00115e44569eb7D33e951",
    "0xfc48D9CaeBb63Ac94D1170E921E126d9722B6C4E",
    "0xc9c9483ab7BB269Ce50Ff265A5b0583268e39F63",
    "0x07575a67b20C7c8db0eBfB7369E6eDd30ED21134",
    "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
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
    "0x50c503DfFd9E8D0903bf33376f6ddd278209939A",
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

function rvessPaymasterContext(value: unknown) {
  const context =
    value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  delete context.sponsorshipPolicyId;
  delete context.skipSponsorshipPolicy;
  return context;
}

function dropEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropEmpty);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue;
    next[key] = dropEmpty(item);
  }
  return next;
}

function compactParams(params: unknown[]) {
  const next = params.map(dropEmpty);
  while (next.length && (next[next.length - 1] === null || next[next.length - 1] === undefined)) next.pop();
  return next;
}

export function withCeloSponsorshipPolicy(body: unknown) {
  if (!body || typeof body !== "object" || !("method" in body) || !("params" in body)) return body;
  const method = String((body as { method: unknown }).method);
  const params = (body as { params: unknown }).params;
  if (!Array.isArray(params) || params.length < 2) return body;
  if (method === "pm_sponsorUserOperation") {
    return { ...body, params: [params[0], params[1], rvessPaymasterContext(params[2])] };
  }
  if (method === "pm_getPaymasterData" || method === "pm_getPaymasterStubData") {
    const chainId = params[2];
    if (typeof chainId === "string" || typeof chainId === "number") {
      return { ...body, params: [params[0], params[1], chainId, rvessPaymasterContext(params[3])] };
    }
    return { ...body, params: [params[0], params[1], "0xa4ec", rvessPaymasterContext(typeof chainId === "object" ? chainId : params[3])] };
  }
  return body;
}

/** Strip null UserOp fields. Alto rejects `factory: null`. Paymaster calls go through Rvess, with no Pimlico policy id. */
export function prepareCeloBundlerBody(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(prepareCeloBundlerBody);
  if (!body || typeof body !== "object" || !("params" in body)) return withCeloSponsorshipPolicy(body);
  const params = (body as { params: unknown }).params;
  const cleaned = Array.isArray(params) ? { ...body, params: compactParams(params) } : body;
  return withCeloSponsorshipPolicy(cleaned);
}
