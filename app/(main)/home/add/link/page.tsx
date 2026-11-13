import { redirect } from "next/navigation";
import { contactOf } from "@/lib/circle";
import { viewer } from "@/lib/session";

/** Top up → Receive via link opens the public /r page for this account. */
export default async function ReceiveViaLinkPage() {
  const who = await viewer();
  const contact = await contactOf(who.address).catch(() => null);
  const slug = contact?.memberCode || who.address;
  redirect(`/r/${encodeURIComponent(slug)}`);
}
