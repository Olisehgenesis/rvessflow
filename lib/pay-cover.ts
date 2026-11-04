export type CoverChoice = {
  pay: string;
  label: string;
  balance: string;
  usd: string;
  network?: string;
  id?: string;
};

export function choiceKey(choice: { id?: string; network?: string; pay: string }) {
  return choice.id || `${choice.network ?? ""}-${choice.pay}`;
}

export function moneyOf(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function firstNumber(value: string) {
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

/** A token can pay this face amount. Dollars use the priced balance. G$ uses the token balance. */
export function holdingCovers(choice: CoverChoice, face: number): boolean {
  if (!(face > 0)) return true;
  if (choice.pay === "gdx") return moneyOf(choice.balance) + 1e-8 >= face * 1.003;
  return moneyOf(choice.usd) + 0.0001 >= face * 1.008;
}

export function richestChoice<T extends CoverChoice>(choices: T[]): T | undefined {
  const ranked = choices.reduce<T | undefined>((best, choice) => {
    if (!best || moneyOf(choice.usd) > moneyOf(best.usd)) return choice;
    return best;
  }, undefined);
  if (ranked && moneyOf(ranked.usd) > 0) return ranked;
  return choices.find((choice) => choice.pay === "usdcx") ?? choices[0];
}

/** Prefer a token that can pay the face amount. Otherwise keep the largest balance. */
export function pickCover<T extends CoverChoice>(choices: T[], face: number): T | undefined {
  return choices.find((choice) => face > 0 && holdingCovers(choice, face)) ?? richestChoice(choices);
}

export function tokenSpendGap(balance: string, spendValue: string | undefined) {
  if (!spendValue) return null;
  const need = firstNumber(spendValue);
  if (!(need > 0)) return { short: false, ask: "", unit: "", needText: spendValue.trim() };
  const have = moneyOf(balance);
  const unit = spendValue.replace(/^[\d,.\s]+/, "").trim();
  const short = have + 1e-8 < need;
  const digits = unit === "CELO" || unit === "G$" ? 4 : 3;
  const gap = Math.max(need - have, 0);
  const shown = gap.toLocaleString("en-US", { maximumFractionDigits: digits });
  return { short, ask: `Add ${shown} ${unit}`.trim(), unit, needText: spendValue.trim() };
}

export function coverStatus(input: {
  choices: CoverChoice[];
  picked?: CoverChoice;
  lines: { label: string; value: string }[];
  face: number;
  chainName: string;
}): { short: boolean; ask: string; note: string } {
  const spend = input.lines.find((line) => line.label === "You spend" || line.label === "You spend at most");
  const gap = input.picked ? tokenSpendGap(input.picked.balance, spend?.value) : null;
  const estimateShort = Boolean(input.picked) && input.face > 0 && !holdingCovers(input.picked!, input.face);
  const short = gap ? gap.short : estimateShort;
  if (!short) return { short: false, ask: "", note: "" };
  const need = input.face > 0 ? input.face * 1.008 : 0;
  const worth = input.choices.reduce((sum, choice) => sum + (choice.pay === "gdx" ? 0 : moneyOf(choice.usd)), 0);
  const allShort = need > 0 && input.picked?.pay !== "gdx" && worth + 0.005 < need;
  const note = allShort
    ? `Your ${input.chainName} tokens are worth $${worth.toFixed(2)}. This post needs about $${need.toFixed(2)}. Deposit the rest to your address.`
    : gap?.short
      ? `You have ${input.picked?.balance} ${gap.unit}. This needs ${gap.needText}. Deposit the rest to your address.`
      : `This needs about $${need.toFixed(2)}. Deposit the rest to your address.`;
  return { short: true, ask: gap?.ask || "Deposit to this address", note };
}
