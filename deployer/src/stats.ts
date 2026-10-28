import { createPublicClient, http, type Address, type Hex } from "viem";
import type { ProtocolChain } from "./chains";

export type ChainStats = {
  host: boolean;
  cfa: boolean;
  gda: boolean;
  stable: boolean;
  native: boolean;
};

function live(code: Hex | undefined): boolean {
  return Boolean(code && code !== "0x");
}

/** One parallel read of the Superfluid contracts this deployment needs. */
export async function loadChainStats(chain: ProtocolChain): Promise<ChainStats> {
  const client = createPublicClient({ chain: chain.chain, transport: http(chain.rpc) });
  const targets: Address[] = [chain.host, chain.cfa, chain.gda, chain.stable.address, chain.eth.address];
  const codes = await Promise.all(targets.map((address) => client.getCode({ address })));
  return {
    host: live(codes[0]),
    cfa: live(codes[1]),
    gda: live(codes[2]),
    stable: live(codes[3]),
    native: live(codes[4]),
  };
}
