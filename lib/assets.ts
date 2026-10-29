export const USDCx = "0xD04383398dD2426297da660F9CCA3d439AF9ce1b" as const;
export const ETHx = "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93" as const;
export const CUSDx = "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e" as const;
export const CELOx = "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240" as const;

export type Asset = {
  address: `0x${string}`;
  symbol: string;
  name: string;
};

export const assets: Asset[] = [
  { address: USDCx, symbol: "USDCx", name: "USD Coin (x)" },
  { address: ETHx, symbol: "ETHx", name: "Ether (x)" },
  { address: CUSDx, symbol: "cUSDx", name: "Celo Dollar (x)" },
  { address: CELOx, symbol: "CELOx", name: "Celo (x)" },
];

export function assetByAddress(address: string): Asset {
  return (
    assets.find((item) => item.address.toLowerCase() === address.toLowerCase()) ?? {
      address: address as `0x${string}`,
      symbol: "Token",
      name: "Super Token",
    }
  );
}

export function assetKind(address: string): "usdcx" | "ethx" {
  const lower = address.toLowerCase();
  if (lower === ETHx.toLowerCase() || lower === CELOx.toLowerCase()) return "ethx";
  return "usdcx";
}
