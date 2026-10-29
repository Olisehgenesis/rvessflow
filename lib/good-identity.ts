import "server-only";

import { cache } from "react";
import { createPublicClient, zeroAddress, type Address } from "viem";
import { celo } from "viem/chains";
import { celoTransport } from "@/lib/network";
import { CELO_IDENTITY, CELO_UBI, identityAbi, identityExpiry, ubiAbi } from "@/lib/good-fv";

export type GoodIdentity = {
  verified: boolean;
  root: Address;
  lastAuthenticated: bigint;
  authPeriodDays: bigint;
  expiresAt: number;
  claimable: bigint;
};

const empty: GoodIdentity = {
  verified: false,
  root: zeroAddress,
  lastAuthenticated: 0n,
  authPeriodDays: 0n,
  expiresAt: 0,
  claimable: 0n,
};

const reader = createPublicClient({ chain: celo, transport: celoTransport() });

export const loadIdentity = cache(async (account: Address): Promise<GoodIdentity> => {
  try {
    const [root, lastAuthenticated, authPeriodDays] = await Promise.all([
      reader.readContract({ address: CELO_IDENTITY, abi: identityAbi, functionName: "getWhitelistedRoot", args: [account] }),
      reader.readContract({ address: CELO_IDENTITY, abi: identityAbi, functionName: "lastAuthenticated", args: [account] }),
      reader.readContract({ address: CELO_IDENTITY, abi: identityAbi, functionName: "authenticationPeriod" }),
    ]);
    const verified = root !== zeroAddress;
    const claimable = verified
      ? await reader.readContract({ address: CELO_UBI, abi: ubiAbi, functionName: "checkEntitlement", args: [root] })
      : 0n;
    return {
      verified,
      root,
      lastAuthenticated,
      authPeriodDays,
      expiresAt: identityExpiry(lastAuthenticated, authPeriodDays),
      claimable,
    };
  } catch {
    return empty;
  }
});
