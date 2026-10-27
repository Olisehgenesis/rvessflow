import type { Address, Hex } from "viem";
import type { PayAsset, ReceiveAsset } from "@/lib/pay-math";

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
      /** Unix seconds. `0` starts the hold now. A later time waits for `createFlow`. */
      startAt?: number;
      /** When set, `amount` is USD and the wallet pays with this asset. */
      pay?: PayAsset;
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
      pay?: PayAsset;
    }
  | {
      kind: "lock";
      token: string;
      name: string;
      amount: string;
      duration: number;
      earnYield: boolean;
      startedAt: number;
      pay?: PayAsset;
    }
  | { kind: "deposit"; token: string; amount: string; pay?: PayAsset }
  | { kind: "withdraw"; amount: string; receive?: ReceiveAsset }
  | {
      kind: "goal";
      fn: "topup" | "release" | "pause" | "resume" | "cancel" | "settle";
      id: string;
      amount: string;
      pay?: PayAsset;
    }
  | { kind: "lockAct"; fn: "topup" | "break" | "mature"; id: string; amount: string; pay?: PayAsset }
  | {
      kind: "group";
      fn: "postCollateral" | "start" | "contribute" | "exitBeforeStart" | "cancelBeforeStart" | "claimCollateral";
      id: string;
      pay?: PayAsset;
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
      plain?: boolean;
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
