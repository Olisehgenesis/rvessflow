export const idStatuses = ["none", "submitted", "checked"] as const;
export type IdStatus = (typeof idStatuses)[number];

export const poolKinds = ["club", "joint"] as const;
export type PoolKind = (typeof poolKinds)[number];

export const pledgeModes = ["fixed", "individual"] as const;
export type PledgeMode = (typeof pledgeModes)[number];

export const releaseRules = ["unanimous", "treasurer"] as const;
export type ReleaseRule = (typeof releaseRules)[number];

export const subjectKinds = ["saving", "lock", "flow", "joint", "pool"] as const;
export type SubjectKind = (typeof subjectKinds)[number];

/** Mirrors `SavingsPool.CreateParams`. Amounts are token base units, as strings. */
export type PoolDraft = {
  kind: PoolKind;
  pledgeMode: PledgeMode;
  releaseRule: ReleaseRule;
  token: string;
  beneficiary: string;
  treasurer: string;
  fixedPledge: string;
  lateFine: string;
  waiveCap: string;
  twoAdminAt: string;
  loanMultipleBps: number;
  interestBps: number;
  reserveBps: number;
  periodSeconds: number;
  loanTermSeconds: number;
  target: string;
};

export type GroupProfile = {
  ref: string;
  creator: string;
  name: string;
  purpose: string;
  rules: string;
  requireId: boolean;
};

export type Milestone = {
  id: string;
  owner: string;
  subjectKind: SubjectKind;
  subjectRef: string;
  position: number;
  label: string;
  /** Checkpoint balance. Empty when this checkpoint is a rate. */
  amount: string;
  /** Promised flow per day, such as 100000. Empty when this checkpoint is an amount. */
  ratePerDay: string;
  /** Days the rate has to hold. Zero on an amount checkpoint. */
  days: number;
  reached: boolean;
};
