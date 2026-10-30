import "server-only";

import { contactIfReady, type Contact } from "@/lib/circle";
import { loadIdentity } from "@/lib/good-identity";
import { loadQuote } from "@/lib/rates";
import { addresses, explorer, loadPortfolio, networkName, stableLabel } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import { shortAddress } from "@/lib/display";

export function contactLine(contact: Contact) {
  if (contact.memberCode) return contact.memberCode;
  if (contact.phones[0]) return contact.phones[0];
  if (contact.email) return contact.email;
  return "Not set";
}

export async function loadSettings() {
  const who = await viewer();
  const [data, quote, directory, identity] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    contactIfReady(who.address),
    loadIdentity(who.address),
  ]);
  const signLabel = who.method === "passkey" ? "Passkey on this device" : who.method === "wallet" ? "Connected wallet" : "Signs on this machine";
  const upgrade = data.protocol.upgradeReadyAt ? new Date(data.protocol.upgradeReadyAt * 1000).toLocaleString() : "Not scheduled";
  const links = [
    { href: `https://basescan.org/address/${data.me.address}`, label: "This account on Base", chain: "base" as const },
    { href: `https://celoscan.io/address/${data.me.address}`, label: "This account on Celo", chain: "celo" as const },
    ...(explorer === "https://basescan.org" ? [] : [{ href: `${explorer}/address/${data.me.address}`, label: `This account on ${networkName}` }]),
    { href: `${explorer}/address/${addresses.factory}`, label: "Vault factory" },
    { href: `${explorer}/address/${addresses.locks}`, label: "Lock vault" },
    { href: `${explorer}/address/${addresses.groups}`, label: "Group rotation" },
  ];
  const feeNote =
    who.method === "passkey"
      ? networkName === "Celo"
        ? `${Number(data.eth).toFixed(4)} CELO in this account. This passkey pays the network fee in CELO.`
        : `${Number(data.eth).toFixed(4)} ETH on ${networkName}. This passkey pays the network fee in USDC. ETH pays it only when USDC is not there.`
      : who.method === "wallet"
        ? "A connected wallet on Celo pays the fee in USDT, then USDC, then USDm, when that token is in the account. CELO is used only if none of those cover it. On Base the wallet uses ETH."
        : "This machine signs payments for this account.";
  return {
    who,
    data,
    quote,
    directory,
    identity,
    signLabel,
    upgrade,
    links,
    feeNote,
    contactHint: directory.down ? "Directory unavailable" : contactLine(directory.contact),
    short: shortAddress(data.me.address),
  };
}

export type SettingsData = Awaited<ReturnType<typeof loadSettings>>;
