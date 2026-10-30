import { getAddress, parseAbi, parseEther, type Address } from "viem";
import LZString from "lz-string";

/** GoodDollar IdentityV2, UBIScheme, and faucet on Celo production. */
export const CELO_IDENTITY = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as Address;
export const CELO_UBI = "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as Address;
export const CELO_FAUCET = "0x4F93Fa058b03953C851eFaA2e4FC5C34afDFAb84" as Address;
export const GOOD_ID_URL = "https://goodid.gooddollar.org";
export const GOOD_SERVER = "https://goodserver.gooddollar.org";
export const GOOD_IDENTITY_DOCS = "https://docs.gooddollar.org/user-guides/connect-another-wallet-address-to-identity";
export const CELO_CLAIM_GAS = 250_000n;

export const identityAbi = parseAbi([
  "function getWhitelistedRoot(address account) view returns (address)",
  "function lastAuthenticated(address account) view returns (uint256)",
  "function authenticationPeriod() view returns (uint256)",
  "function connectAccount(address account)",
  "function disconnectAccount(address account)",
]);

export const WALLET_LINK_NOTICE =
  "Only the original verified wallet can attach this account. After it signs, both wallets share one face and one daily G$ claim. Do not attach a wallet you do not own.";

export const ubiAbi = parseAbi([
  "function claim() returns (bool)",
  "function checkEntitlement(address _member) view returns (uint256)",
]);

export const faucetAbi = parseAbi([
  "function canTop(address _user) view returns (bool)",
  "function getToppingAmount() view returns (uint256)",
  "function minTopping() view returns (uint8)",
]);

/** Ask GoodDollar for CELO when this verified wallet holds less than this. */
export const CELO_TOP_WEI = parseEther("0.3");

export function belowCeloTopFloor(balance: bigint) {
  return balance < CELO_TOP_WEI;
}

/** True when native CELO is below the faucet's topping floor (GoodDollar minTopping). */
export function belowFaucetNeed(balance: bigint, toppingAmount: bigint, minTopping: number) {
  if (toppingAmount === 0n || balance >= toppingAmount) return false;
  return ((toppingAmount - balance) * 100n) / toppingAmount >= BigInt(minTopping);
}

/** Same text GoodID and /auth/fv2 verify. `<account>` is replaced with the checksum address. */
export const FV_IDENTIFIER_MSG2 =
  "Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.\nYou can use this identifier in the future to delete this anonymized record.\nWARNING: do not sign this message unless you trust the website/application requesting this signature.";

export function fvIdentifierMessage(account: Address) {
  return FV_IDENTIFIER_MSG2.replace("<account>", getAddress(account));
}

export function fvLink(input: {
  account: Address;
  nonce: string;
  signature: `0x${string}`;
  callback: string;
  popup: boolean;
}) {
  if (!input.popup && !input.callback) {
    throw new Error("A return URL is required for the face check.");
  }
  const url = new URL(GOOD_ID_URL);
  const params: Record<string, string | number> = {
    account: getAddress(input.account),
    nonce: input.nonce,
    fvsig: input.signature,
    chain: 42220,
  };
  if (input.callback) {
    params[input.popup ? "cbu" : "rdu"] = input.callback;
  }
  url.searchParams.append("lz", LZString.compressToEncodedURIComponent(JSON.stringify(params)));
  return url.toString();
}

export function identityExpiry(lastAuthenticated: bigint, authPeriodDays: bigint) {
  if (lastAuthenticated === 0n) return 0;
  return Number(lastAuthenticated + authPeriodDays * 86400n);
}
