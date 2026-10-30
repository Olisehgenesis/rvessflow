import type { Address } from "viem";
import { CUSDx, GDX, USDCx } from "@/lib/assets";
import { money } from "@/lib/display";
import { recommendedGroupNet, type GroupNet, isGroupNet } from "@/lib/group-network";

export const groupTokens = ["usd", "gdx"] as const;
export type GroupTokenKind = (typeof groupTokens)[number];

export function isGroupToken(value: string): value is GroupTokenKind {
  return (groupTokens as readonly string[]).includes(value);
}

export function asGroupToken(value: unknown): GroupTokenKind {
  return typeof value === "string" && value === "gdx" ? "gdx" : "usd";
}

export function groupUnit(token: GroupTokenKind | Address | string): string {
  if (typeof token === "string" && token.startsWith("0x")) {
    return token.toLowerCase() === GDX.toLowerCase() ? "G$" : "USD";
  }
  return token === "gdx" ? "G$" : "USD";
}

export function groupTokenKindFromAddress(token: Address | string): GroupTokenKind {
  return token.toLowerCase() === GDX.toLowerCase() ? "gdx" : "usd";
}

export function groupTokenAddress(network: GroupNet, token: GroupTokenKind): Address {
  if (token === "gdx") return GDX;
  return network === "celo" ? CUSDx : USDCx;
}

export function groupTerms(network: string, token: string): { network: GroupNet; token: GroupTokenKind } {
  const kind = token === "gdx" ? "gdx" : "usd";
  if (kind === "gdx") return { network: "celo", token: "gdx" };
  return { network: isGroupNet(network) ? network : recommendedGroupNet, token: "usd" };
}

export function labeledGroup(wei: string | bigint, token: Address | GroupTokenKind | string): string {
  return `${money(wei)} ${groupUnit(token)}`;
}

export function draftAmount(contribution: string, token: GroupTokenKind): string {
  return `${contribution} ${groupUnit(token)}`;
}
