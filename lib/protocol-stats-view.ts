import { formatUnits, type Address } from "viem";

export type ChainStats = {
  name: string;
  explorer: string;
  factory: Address;
  locks: Address;
  groups: Address;
  vaults: number;
  groupsCreated: number;
  groupsStarted: number;
  locksOpened: number;
  txs: number;
  users: number;
  gdx: bigint;
};

export type ProtocolStats = {
  at: number;
  vaults: number;
  groupsCreated: number;
  groupsStarted: number;
  locksOpened: number;
  txs: number;
  users: number;
  gdx: bigint;
  chains: ChainStats[];
};

export type ChainStatsWire = Omit<ChainStats, "gdx"> & { gdx: string };
export type ProtocolStatsWire = Omit<ProtocolStats, "gdx" | "chains"> & { gdx: string; chains: ChainStatsWire[] };

export function toWire(data: ProtocolStats): ProtocolStatsWire {
  return {
    ...data,
    gdx: data.gdx.toString(),
    chains: data.chains.map((chain) => ({ ...chain, gdx: chain.gdx.toString() })),
  };
}

export function fromWire(data: ProtocolStatsWire): ProtocolStats {
  return {
    ...data,
    gdx: BigInt(data.gdx),
    chains: data.chains.map((chain) => ({ ...chain, gdx: BigInt(chain.gdx) })),
  };
}

export function sumStats(chains: ChainStats[]): Omit<ProtocolStats, "at" | "chains"> {
  return {
    vaults: chains.reduce((n, row) => n + row.vaults, 0),
    groupsCreated: chains.reduce((n, row) => n + row.groupsCreated, 0),
    groupsStarted: chains.reduce((n, row) => n + row.groupsStarted, 0),
    locksOpened: chains.reduce((n, row) => n + row.locksOpened, 0),
    txs: chains.reduce((n, row) => n + row.txs, 0),
    users: chains.reduce((n, row) => n + row.users, 0),
    gdx: chains.reduce((n, row) => n + row.gdx, 0n),
  };
}

export function formatGdx(amount: bigint): string {
  const n = Number(formatUnits(amount, 18));
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 0 : 2 });
}
