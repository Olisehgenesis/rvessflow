import { parseAbi, type Address } from "viem";
import LZString from "lz-string";

/** GoodDollar IdentityV2, UBIScheme, and faucet on Celo production. */
export const CELO_IDENTITY = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as Address;
export const CELO_UBI = "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as Address;
export const CELO_FAUCET = "0x4F93Fa058b03953C851eFaA2e4FC5C34afDFAb84" as Address;
export const GOOD_ID_URL = "https://goodid.gooddollar.org";

export const identityAbi = parseAbi([
  "function getWhitelistedRoot(address account) view returns (address)",
  "function lastAuthenticated(address account) view returns (uint256)",
  "function authenticationPeriod() view returns (uint256)",
]);

export const ubiAbi = parseAbi([
  "function claim() returns (bool)",
  "function checkEntitlement(address _member) view returns (uint256)",
]);

/** Same text the GoodDollar Identity SDK signs. The first space is replaced with the account. */
export const FV_IDENTIFIER_MSG2 =
  "Sign this message to request verifying your account and to create your own secret unique identifier for your anonymized record.\nYou can use this identifier in the future to delete this anonymized record.\nWARNING: do not sign this message unless you trust the website/application requesting this signature.";

export function fvIdentifierMessage(account: Address) {
  return FV_IDENTIFIER_MSG2.replace(" ", account);
}

export function fvLink(input: {
  account: Address;
  nonce: string;
  signature: `0x${string}`;
  callback: string;
  popup: boolean;
}) {
  const url = new URL(GOOD_ID_URL);
  const params: Record<string, string | number> = {
    account: input.account,
    nonce: input.nonce,
    fvsig: input.signature,
    chain: 42220,
  };
  params[input.popup ? "cbu" : "rdu"] = input.callback;
  url.searchParams.set("lz", LZString.compressToEncodedURIComponent(JSON.stringify(params)));
  return url.toString();
}

export function identityExpiry(lastAuthenticated: bigint, authPeriodDays: bigint) {
  if (lastAuthenticated === 0n) return 0;
  return Number(lastAuthenticated + authPeriodDays * 86400n);
}
