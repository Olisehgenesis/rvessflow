import "server-only";

import { createPublicClient, http, toCoinType, type Address } from "viem";
import { base, mainnet } from "viem/chains";
import { chosenName } from "@/lib/display";

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum.publicnode.com", { timeout: 2_500 }),
});

/** A basename or ENS name already attached to this wallet. */
export async function onchainDisplayName(address: Address): Promise<string | null> {
  try {
    const basename = await client.getEnsName({ address, coinType: toCoinType(base.id) }).catch(() => null);
    const ens = basename || (await client.getEnsName({ address }).catch(() => null));
    if (!ens) return null;
    const text = await client.getEnsText({ name: ens, key: "name" }).catch(() => null);
    return chosenName(text) ?? chosenName(ens);
  } catch {
    return null;
  }
}
