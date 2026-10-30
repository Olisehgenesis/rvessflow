"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useSignedAction } from "@/components/sign-action";
import { VerifiedTick } from "@/components/verify-badge";
import { claimUbi, linkWallet } from "@/lib/actions";
import { attachThisAccount, faceCheckHref, prepareFaceCheck } from "@/lib/good-fv-sign";
import { GOOD_IDENTITY_DOCS, WALLET_LINK_NOTICE } from "@/lib/good-fv";
import { money, shortAddress } from "@/lib/display";
import type { Address } from "viem";

const reasons = [
  { src: "/marks/paid.png", title: "A tick on your name", body: "Same idea as the check next to a name on X. Here it is clay, and it means a live unique person." },
  { src: "/marks/crypto.png", title: "Celo when the balance is low", body: "If you are verified and CELO drops below GoodDollar's floor, the app calls their faucet. You stay here." },
  { src: "/marks/receive.png", title: "Daily free G$", body: "GoodDollar pays a Universal Basic Income once a day to each verified person." },
  { src: "/marks/friend.png", title: "Or link a wallet you already verified", body: "The original verified wallet signs once. Both share one face and one daily claim." },
];

export function VerifyPanel({
  address,
  method,
  verified,
  linked,
  root,
  claimable,
  expiresAt,
}: {
  address: Address;
  method: "passkey" | "wallet" | "tester";
  verified: boolean;
  linked: boolean;
  root: Address;
  claimable: string;
  expiresAt: number;
}) {
  const router = useRouter();
  const [state, run, pending] = useSignedAction(claimUbi);
  const [linkState, runLink, linking] = useSignedAction(linkWallet);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [ok, setOk] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [fvSrc, setFvSrc] = useState("");
  const [passkeyReady, setPasskeyReady] = useState(method !== "passkey");
  const due = Number(claimable) > 0;
  const until = expiresAt > 0 ? new Date(expiresAt * 1000).toLocaleDateString() : "";

  useEffect(() => {
    if (method !== "passkey" || verified) {
      setPasskeyReady(true);
      return;
    }
    setPasskeyReady(false);
    void prepareFaceCheck(address)
      .then(() => setPasskeyReady(true))
      .catch((error) => setNote(error instanceof Error ? error.message : "This phone could not prepare the passkey."));
  }, [address, method, verified]);

  useEffect(() => {
    if (!fvSrc) return;
    const tick = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(tick);
  }, [fvSrc, router]);

  useEffect(() => {
    if (!fvSrc || !verified) return;
    setFvSrc("");
    setOk(true);
    setNote("Face check finished. Refreshing this account…");
  }, [verified, fvSrc]);

  function verify() {
    const href = faceCheckHref({ address, method });
    setNote("");
    setBusy(true);
    void href
      .then(setFvSrc)
      .catch((error) => setNote(error instanceof Error ? error.message : "Face verification did not start."))
      .finally(() => setBusy(false));
  }

  async function attach() {
    setNote("");
    setBusy(true);
    try {
      await attachThisAccount(address);
      setLinkOpen(false);
      router.refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That wallet did not attach this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-start gap-3">
        <VerifiedTick className="size-14 shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-semibold">{verified ? (linked ? "Linked" : "Verified") : "Verify"}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {verified
              ? linked
                ? `This account uses the tick from ${shortAddress(root)}. One daily G$ claim is shared.`
                : until
                  ? `GoodDollar knows this account is a unique person. The tick lasts until ${until}.`
                  : "GoodDollar knows this account is a unique person."
              : "Why verify? Daily G$, a Celo top-up when this account is short, and a tick on this name. Already verified on another wallet? Link it. This page stores no key."}
          </p>
        </div>
      </div>
      {!verified ? (
        <ul className="mt-4 space-y-3">
          {reasons.map((row) => (
            <li key={row.title} className="flex items-start gap-3">
              <img src={row.src} alt="" className="size-11 shrink-0 object-contain" />
              <span className="min-w-0 pt-1">
                <span className="block text-sm font-medium">{row.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{row.body}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {verified ? (
        <>
          <form action={run} className="mt-4">
            {due ? (
              <p className="mb-3 text-sm">
                Today&apos;s UBI is <span className="font-semibold tabular-nums">{money(claimable)} G$</span>.
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">Today&apos;s G$ is already claimed. Come back tomorrow.</p>
            )}
            <button
              type="submit"
              disabled={pending || !due}
              className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#141414] px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Claiming…" : due ? "Claim today's G$" : "Claimed today"}
            </button>
          </form>
          {!linked ? (
            <form action={runLink} className="mt-5">
              <label className="block text-sm font-medium">Attach another wallet</label>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">This verified wallet signs. The other address then shares this tick and this daily claim.</p>
              <input
                name="target"
                placeholder="0x…"
                className="mt-2 h-12 w-full rounded-2xl border border-[#E6EADF] bg-white px-4 text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={linking}
                className="mt-3 inline-flex h-11 items-center justify-center rounded-full border border-[#E6EADF] bg-white px-4 text-sm font-semibold"
              >
                {linking ? "Linking…" : "Attach"}
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={verify}
            disabled={busy || !passkeyReady}
            className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414] disabled:opacity-40"
          >
            {busy ? "Sign to open the face check…" : passkeyReady ? "New face check" : "Preparing passkey…"}
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-[#E6EADF] bg-white px-5 text-sm font-semibold"
          >
            I already verified
          </button>
        </div>
        {method === "passkey" ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            New face check unlocks this phone&apos;s passkey. Use Chrome on www.rvess.xyz. Already have the tick on Valora or another wallet? Use I already verified — that one does not use the passkey.
          </p>
        ) : null}
      )}
      {note || state?.error || linkState?.error ? (
        <p className={`mt-3 text-sm ${ok && note ? "text-foreground" : "text-destructive"}`}>{note || state?.error || linkState?.error}</p>
      ) : null}

      {fvSrc ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-white">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E6EADF] px-3">
            <p className="text-sm font-semibold">Face check</p>
            <button
              type="button"
              onClick={() => setFvSrc("")}
              className="inline-flex h-9 items-center justify-center rounded-full px-3 text-sm font-medium text-[#5C6572]"
            >
              Close
            </button>
          </div>
          <iframe
            title="GoodDollar face verification"
            src={fvSrc}
            className="min-h-0 w-full flex-1 border-0"
            allow="camera *; microphone *; fullscreen *; publickey-credentials-get *"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}

      <Dialog.Root open={linkOpen} onOpenChange={setLinkOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#141414]/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[61] w-[min(100%-1.5rem,22.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] bg-white px-5 pt-4 pb-5 shadow-[0_28px_80px_-28px_rgba(20,20,20,0.45)] outline-none">
            <img src="/marks/friend.png" alt="" className="mx-auto size-20 object-contain" />
            <Dialog.Title className="mt-3 text-center text-lg font-semibold tracking-[-0.03em]">Already verified?</Dialog.Title>
            <Dialog.Description className="mt-2 text-center text-sm leading-relaxed text-[#5C6572]">
              Connect the wallet that already has the GoodDollar tick. That wallet signs once and attaches this account. You still get one G$ claim a day, not two.
            </Dialog.Description>
            <p className="mt-3 text-center text-xs leading-relaxed text-[#6B7280]">{WALLET_LINK_NOTICE}</p>
            <a
              href={GOOD_IDENTITY_DOCS}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-center text-xs font-medium text-[#141414] underline underline-offset-2"
            >
              Read the GoodDollar docs
            </a>
            {note ? <p className="mt-3 text-center text-sm text-destructive">{note}</p> : null}
            <button
              type="button"
              onClick={() => void attach()}
              disabled={busy}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-[#141414] text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Waiting for that wallet…" : "Connect the verified wallet"}
            </button>
            <Dialog.Close className="mt-2 flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-[#5C6572]">
              Not yet
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
