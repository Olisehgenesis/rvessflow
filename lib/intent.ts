import type { Address, Hex } from "viem";

export const frequencies = ["Once", "Daily", "Weekly", "Monthly", "Yearly"] as const;
export type Frequency = (typeof frequencies)[number];

export function isFrequency(value: string): value is Frequency {
  return (frequencies as readonly string[]).includes(value);
}

/** A label for the goal, stored beside the chain. Longer saves read as monthly. */
export function inferFrequency(duration: number): Frequency {
  const days = duration / 86400;
  if (days >= 300) return "Yearly";
  if (days >= 6 && days <= 8) return "Weekly";
  if (days <= 1.2) return "Daily";
  if (days > 8) return "Monthly";
  return "Once";
}

export type PreparedCall = {
  to: Address;
  data: Hex;
  value: string;
};

type Progress = {
  /** Stable id for the activity row written when this intent finishes. */
  ref: string;
  /** The final call was already handed to the wallet. A repeat must not send it again. */
  submitted?: boolean;
  /** A balance or order captured before the call, so a retry can see that it landed. */
  seen?: string;
  knownIds?: string[];
  groupId?: string;
  phonesQueued?: boolean;
};

export type Intent = (
  | {
      kind: "saving";
      name: string;
      amount: string;
      duration: number;
      description: string;
      frequency: Frequency;
      startedAt: number;
    }
  | {
      kind: "stream";
      name: string;
      amount: string;
      duration: number;
      flowKind: "flow" | "expense";
      recipient: string;
      startAt: number;
      description: string;
      frequency: Frequency;
      startedAt: number;
    }
  | {
      kind: "lock";
      token: string;
      name: string;
      amount: string;
      duration: number;
      earnYield: boolean;
      startedAt: number;
    }
  | { kind: "deposit"; token: string; amount: string }
  | { kind: "withdraw"; amount: string }
  | {
      kind: "goal";
      fn: "topup" | "release" | "pause" | "resume" | "cancel" | "settle";
      id: string;
      amount: string;
    }
  | { kind: "lockAct"; fn: "topup" | "break" | "mature"; id: string; amount: string }
  | {
      kind: "group";
      fn: "postCollateral" | "start" | "contribute" | "exitBeforeStart" | "cancelBeforeStart" | "claimCollateral";
      id: string;
    }
  | {
      kind: "groupCreate";
      draftId: string;
      contribution: string;
      members: string[];
      cycles: number;
      cycleSeconds: number;
      windowSeconds: number;
      graceSeconds: number;
      phones: { account: string; phone: string }[];
    }
  | { kind: "payout"; id: string; from: number; dir: -1 | 1 }
  | { kind: "phone"; id: string; phone: string }
) &
  Progress;

export type SignPayload = {
  nonce: string;
  calls: PreparedCall[];
  intent: Intent;
  method: "wallet" | "passkey";
  address: Address;
};

export type Plan = {
  calls: PreparedCall[];
  intent: Intent;
  done: boolean;
  /** The call was sent, but the new state is not visible yet. */
  pending?: boolean;
  id?: string;
  href?: string;
};
