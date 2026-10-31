export type TourStep = {
  id: string;
  title: string;
  body: string;
  target?: string;
  where?: "any" | "desktop" | "mobile";
};

const steps: TourStep[] = [
  {
    id: "welcome",
    title: "This is your money",
    body: "Same address on Celo and Base. What you see is USD. Streams, locks, and groups use Super Tokens behind that.",
  },
  {
    id: "balance",
    title: "Your balance",
    body: "Available is idle. Streaming is already paying out. Locked is held until a date.",
    target: "home-balance",
  },
  {
    id: "add",
    title: "Add money",
    body: "Top up with crypto, a card, or mobile money. A vault is created when you first save or deposit.",
    target: "home-add",
  },
  {
    id: "save",
    title: "Save",
    body: "A saving holds money in your vault until a goal. Nothing streams out until you set that up.",
    target: "nav-save",
  },
  {
    id: "stream",
    title: "Stream",
    body: "A flow pays someone every second, or pays you. Expenses can pay now or as a stream.",
    target: "nav-stream",
    where: "desktop",
  },
  {
    id: "lock",
    title: "Lock",
    body: "A lock keeps funds until the end date. Breaking early takes the penalty shown before you sign.",
    target: "nav-lock",
    where: "desktop",
  },
  {
    id: "groups",
    title: "Groups",
    body: "A rotating pot. You need three people, including you. On Celo the pot can be dollars or G$.",
    target: "nav-groups",
  },
  {
    id: "create",
    title: "Create",
    body: "Top up, a saving, a stream, a lock, or a group starts here.",
    target: "nav-create",
    where: "mobile",
  },
  {
    id: "account",
    title: "Account",
    body: "Name, currency, passkeys, and GoodDollar verification live under Account. You can replay this tour in Preferences.",
    target: "nav-account",
  },
  {
    id: "finish",
    title: "You are set",
    body: "Add money when you are ready. Replay the tour any time from Preferences.",
  },
];

export function tourSteps(desktop: boolean): TourStep[] {
  return steps.filter((step) => {
    if (!step.where || step.where === "any") return true;
    return desktop ? step.where === "desktop" : step.where === "mobile";
  });
}
