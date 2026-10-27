export const terms = [
  {
    title: "Your signature",
    body: "You sign for your own vault, lock, and group. Rvess does not keep your key. A passkey stays on your device. A connected wallet signs in the wallet.",
  },
  {
    title: "Unaudited contracts",
    body: "These contracts have not had an external audit. Put in only money you can afford to lose.",
  },
  {
    title: "Savings and streams",
    body: "A saving goal holds tokens in your vault. An expense or a flow goal is a Superfluid stream. It keeps running until it is settled or protected. After the extra hour of cushion, Superfluid can liquidate the stream deposit.",
  },
  {
    title: "Locks",
    body: "A lock keeps principal until the date you choose. Breaking it early costs the penalty copied onto that lock. Yield, when it is on, is a separate stream and lasts only while the reward budget can pay it.",
  },
  {
    title: "Groups",
    body: "A group takes collateral before it starts. A missed payment can move that collateral into the pot and pass the stream to the next member.",
  },
  {
    title: "Who can change the protocol",
    body: "Upgrades, pause, tokens, fees, and managers take two of the three owner wallets. One person using the app cannot do those. Your own deposit and withdrawal stay your signature.",
  },
  {
    title: "Two chains",
    body: "This beta runs on Base. Base Sepolia is a separate deployment. A balance on one does not appear on the other.",
  },
] as const;
