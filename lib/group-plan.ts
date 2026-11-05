import { cyclePlan, MAX_GROUP_CYCLES, spanLabel } from "@/lib/cycle";
import { labeledGroup, type GroupTokenKind } from "@/lib/group-token";

export type TurnShare = {
  turn: number;
  /** 0 when the rotation is not a whole number of rounds. */
  round: number;
  name: string;
  when: string;
  /** Unix seconds this person starts receiving. Zero until a start time is known. */
  at: number;
  receives: string;
};

/** One round is one turn for every member. The contract stores that as turns. */
export function turnsInRounds(rounds: number, members: number): number {
  const count = Math.floor(rounds);
  const people = Math.floor(members);
  if (!Number.isInteger(count) || count < 1) throw new Error("Pick at least 1 round.");
  if (!Number.isInteger(people) || people < 1) throw new Error("Add the members before counting turns.");
  const turns = count * people;
  if (turns > MAX_GROUP_CYCLES) {
    throw new Error(
      `${count} ${count === 1 ? "round" : "rounds"} with ${people} people is ${turns} turns. The contract allows ${MAX_GROUP_CYCLES}.`,
    );
  }
  return turns;
}

export function fullRounds(cycles: number, members: number): boolean {
  const people = Math.max(Math.floor(members), 1);
  return cycles >= people && cycles % people === 0;
}

export function roundPhrase(rounds: number): string {
  return rounds === 1 ? "1 round" : `${rounds} rounds`;
}

export function turnHeading(cycleIndex: number, cycles: number, members: number): string {
  const turn = Math.min(cycleIndex + 1, Math.max(cycles, 1));
  const people = Math.max(Math.floor(members), 1);
  if (!fullRounds(cycles, people)) return `Turn ${turn} of ${cycles}`;
  const round = Math.floor(cycleIndex / people) + 1;
  const rounds = cycles / people;
  return `Turn ${turn} of ${cycles} · Round ${round} of ${rounds}`;
}

export function rotationLengthLabel(cycles: number, members: number): string {
  const people = Math.max(Math.floor(members), 1);
  if (fullRounds(cycles, people)) {
    const rounds = cycles / people;
    return rounds === 1
      ? `1 round · ${people} turns, one for each person`
      : `${rounds} rounds · ${cycles} turns, one for each person each round`;
  }
  if (cycles === 1) return "1 turn · one person receives the pot";
  return `${cycles} turns`;
}

function roundNumber(index: number, cycles: number, members: number): number {
  const people = Math.max(members, 1);
  if (!fullRounds(cycles, people)) return 0;
  return Math.floor(index / people) + 1;
}

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

export function receiveAt(startsAt: number, index: number, cycleSeconds: number): number {
  if (!startsAt || index < 0) return 0;
  return startsAt + index * cycleSeconds;
}

/** How long a full run lasts: every round, one turn per person. */
export function runDuration(rounds: number, members: number, cycleSeconds: number): string {
  return spanLabel(turnsInRounds(rounds, members) * cycleSeconds);
}

export function rotationPlan(input: {
  contribution: string;
  token: GroupTokenKind;
  cycles: number;
  cycleSeconds: number;
  startsAt?: number;
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
      round: roundNumber(index, input.cycles, input.members.length),
      name,
      when: whenTurnStarts(index, input.cycleSeconds),
      at: receiveAt(input.startsAt ?? 0, index, input.cycleSeconds),
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
  startsAt?: number;
  members: { name: string; you?: boolean }[];
}) {
  const youPost = labeledGroup(weiTimes(input.contributionWei, input.cycles), input.token);
  const eachTurn = labeledGroup(weiTimes(input.contributionWei, Math.max(input.members.length, 1)), input.token);
  const turns = Array.from({ length: Math.max(input.cycles, 0) }, (_, index) => {
    const member = input.members[index % Math.max(input.members.length, 1)];
    const name = member ? (member.you ? `${member.name} (you)` : member.name) : `Turn ${index + 1}`;
    return {
      turn: index + 1,
      round: roundNumber(index, input.cycles, input.members.length),
      name,
      when: whenTurnStarts(index, input.cycleSeconds),
      at: receiveAt(input.startsAt ?? 0, index, input.cycleSeconds),
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

/** Windows taken from the group start, the cycle length, and each member's offset. */
export function turnTimes(input: {
  startTime: number;
  cycle: number;
  cycles: number;
  cycleSeconds: number;
  windowSeconds: number;
  graceSeconds: number;
  offset: number;
}) {
  const cycleStart = input.startTime + input.cycle * input.cycleSeconds;
  const windowStart = cycleStart + input.offset;
  const onTimeEnd = windowStart + input.windowSeconds;
  const payUntil = onTimeEnd + input.graceSeconds;
  const turnEnds = cycleStart + input.cycleSeconds;
  const nextOpens = input.cycle + 1 < input.cycles ? input.startTime + (input.cycle + 1) * input.cycleSeconds + input.offset : 0;
  return { windowStart, onTimeEnd, payUntil, turnEnds, nextOpens };
}

/** One sentence for a live turn: everyone pays, some already have, and one person receives the pot. */
export function turnMoneyLine(input: { each: string; pot: string; recipient: string; paid: number; members: number }): string {
  const paid = `${input.paid} of ${input.members} ${input.paid === 1 ? "has" : "have"} paid`;
  return `Each person pays ${input.each} this turn. ${paid}. The ${input.pot} goes to ${input.recipient}.`;
}

export function draftCycleSeconds(cycle: string, days: string): number {
  return cyclePlan(cycle, Number(days))?.cycle ?? 0;
}
