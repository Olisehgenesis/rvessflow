import { cyclePlan, spanLabel } from "@/lib/cycle";
import { labeledGroup, type GroupTokenKind } from "@/lib/group-token";

export type TurnShare = {
  turn: number;
  name: string;
  when: string;
  receives: string;
};

export function weiTimes(wei: string, n: number): string {
  if (!Number.isInteger(n) || n < 0) return wei;
  return (BigInt(wei) * BigInt(n)).toString();
}

export function humanTimes(amount: string, n: number): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || n < 0) return amount;
  const next = value * n;
  return Number.isInteger(next) ? String(next) : next.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function unitOf(token: GroupTokenKind): string {
  return token === "gdx" ? "G$" : "USD";
}

function whenTurnStarts(index: number, cycleSeconds: number): string {
  if (index <= 0) return "When the rotation starts";
  if (!cycleSeconds) return `Turn ${index + 1}`;
  return `After ${spanLabel(index * cycleSeconds)}`;
}

export function rotationPlan(input: {
  contribution: string;
  token: GroupTokenKind;
  cycles: number;
  cycleSeconds: number;
  members: { name: string; you?: boolean }[];
}): {
  youPost: string;
  othersPost: string;
  othersCount: number;
  eachTurn: string;
  turns: TurnShare[];
} {
  const unit = unitOf(input.token);
  const youPost = `${humanTimes(input.contribution, input.cycles)} ${unit}`;
  const eachTurn = `${humanTimes(input.contribution, Math.max(input.members.length, 1))} ${unit}`;
  const turns = Array.from({ length: Math.max(input.cycles, 0) }, (_, index) => {
    const member = input.members[index % Math.max(input.members.length, 1)];
    const name = member ? (member.you ? `${member.name} (you)` : member.name) : `Turn ${index + 1}`;
    return {
      turn: index + 1,
      name,
      when: whenTurnStarts(index, input.cycleSeconds),
      receives: eachTurn,
    };
  });
  return {
    youPost,
    othersPost: youPost,
    othersCount: Math.max(input.members.length - 1, 0),
    eachTurn,
    turns,
  };
}

export function liveRotationPlan(input: {
  contributionWei: string;
  token: string;
  cycles: number;
  cycleSeconds: number;
  members: { name: string; you?: boolean }[];
}) {
  const youPost = labeledGroup(weiTimes(input.contributionWei, input.cycles), input.token);
  const eachTurn = labeledGroup(weiTimes(input.contributionWei, Math.max(input.members.length, 1)), input.token);
  const turns = Array.from({ length: Math.max(input.cycles, 0) }, (_, index) => {
    const member = input.members[index % Math.max(input.members.length, 1)];
    const name = member ? (member.you ? `${member.name} (you)` : member.name) : `Turn ${index + 1}`;
    return {
      turn: index + 1,
      name,
      when: whenTurnStarts(index, input.cycleSeconds),
      receives: eachTurn,
    };
  });
  return {
    youPost,
    othersPost: youPost,
    othersCount: Math.max(input.members.length - 1, 0),
    eachTurn,
    turns,
  };
}

export function draftCycleSeconds(cycle: string, days: string): number {
  return cyclePlan(cycle, Number(days))?.cycle ?? 0;
}
