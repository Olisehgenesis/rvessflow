"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useSignedAction } from "@/components/sign-action";
import { VerifiedTick } from "@/components/verify-badge";
import { askCeloFaucet, claimUbi, linkWallet } from "@/lib/actions";
import { attachThisAccount, faceCheckHref, prepareFaceCheck } from "@/lib/good-fv-sign";
import { GOOD_IDENTITY_DOCS, WALLET_LINK_NOTICE } from "@/lib/good-fv";
import { money, shortAddress } from "@/lib/display";
import type { Address } from "viem";

const reasons = [
  { title: "A tick on your name", body: "A live unique person, shown next to this display name." },
  { title: "Celo when the balance is low", body: "If this verified wallet has less than 0.3 CELO, opening Profile or tapping Ask for CELO calls their faucet." },
  { title: "Daily G$", body: "GoodDollar pays a Universal Basic Income once a day to each verified person." },
  { title: "Link a verified wallet", body: "The original verified wallet signs once. Both share one face and one daily claim." },
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
  const [tone, setTone] = useState<"ok" | "info" | "error">("error");
  const [linkOpen, setLinkOpen] = useState(false);
  const [fvHref, setFvHref] = useState("");
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "fv" && params.get("verified") == null && params.get("isVerified") == null) return;
    const passed = params.get("isVerified") === "true" || params.get("verified") === "true";
    const reason = params.get("reason")?.trim();
    setOk(passed);
    setNote(passed ? "Face check finished. Refreshing this account…" : reason || "Come back here after the face check tab.");
    window.history.replaceState(null, "", "/settings/verify");
    if (passed) router.refresh();
  }, [router]);

  useEffect(() => {
    if (!fvHref) return;
    const tick = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(tick);
  }, [fvHref, router]);

  useEffect(() => {
    if (!fvHref || !verified) return;
    setFvHref("");
    setOk(true);
    setNote("Face check finished. Refreshing this account…");
  }, [verified, fvHref]);

  function verify() {
    const href = faceCheckHref({ address, method });
    setNote("");
    setBusy(true);
    void href
      .then(setFvHref)
      .catch((error) => setNote(error instanceof Error ? error.message : "Face verification did not start."))
      .finally(() => setBusy(false));
  }

  async function askFaucet() {
    setNote("");
    setOk(false);
    setBusy(true);
    try {
      const result = await askCeloFaucet();
      setOk(result.ok);
      setTone(result.tone);
      setNote(result.detail);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "GoodDollar did not send CELO.");
    } finally {
      setBusy(false);
    }
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
    <div>
      <div className="flex items-start gap-3 rounded-2xl bg-[#F7F8F4] p-4">
        <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-full ${verified ? "bg-[#E7F4C4]" : "bg-white ring-1 ring-[#E6EADF]"}`}>
          {verified ? <VerifiedTick className="size-6" /> : <span className="size-2.5 rounded-full bg-[#C5CBD3]" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#141414]">{verified ? (linked ? "Linked to a verified wallet" : "Verified with GoodDollar") : "Not verified yet"}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#5C6572]">
            {verified
              ? linked
                ? `This account uses the tick from ${shortAddress(root)}. One daily G$ claim is shared.`
                : until
                  ? `GoodDollar knows this account is a unique person. The tick lasts until ${until}.`
                  : "GoodDollar knows this account is a unique person."
              : "Daily G$, a Celo top-up when this account is short, and a tick on this name. Already verified on another wallet? Link it. This page stores no key."}
          </p>
        </div>
      </div>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending || !due}
                className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#141414] px-5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Claiming…" : due ? "Claim today's G$" : "Claimed today"}
              </button>
              <button
                type="button"
                onClick={() => void askFaucet()}
                disabled={busy}
                className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-[#E6EADF] bg-white px-5 text-sm font-semibold"
              >
                {busy ? "Asking GoodDollar…" : "Ask for CELO"}
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ask for CELO calls GoodDollar&apos;s faucet with this wallet. It only sends CELO when this account is verified and Celo CELO is below 0.3. It is not the daily G$.
            </p>
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
        <>
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
              New face check unlocks this phone&apos;s passkey, then opens GoodDollar in a new tab so the camera can run. Already have the tick on Valora or another wallet? Use I already verified.
            </p>
          ) : null}
          <ul className="mt-4 divide-y divide-[#E6EADF]">
            {reasons.map((row) => (
              <li key={row.title} className="py-3">
                <p className="text-sm font-medium text-[#141414]">{row.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[#5C6572]">{row.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {note || state?.error || linkState?.error ? (
        <p className={`mt-3 text-sm ${note && (ok || tone === "info") ? "text-[#5C6572]" : "text-destructive"}`}>{note || state?.error || linkState?.error}</p>
      ) : null}

      {fvHref ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-white px-5 pt-10">
          <p className="text-lg font-semibold tracking-[-0.03em]">Open face check</p>
          <p className="mt-2 text-sm leading-relaxed text-[#5C6572]">
            The camera cannot run inside this app on iPhone or Samsung. Continue in a new tab. Allow camera there. This page waits for you to come back.
          </p>
          <a
            href={fvHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-[#D6F34A] text-sm font-semibold text-[#141414]"
          >
            Open face check
          </a>
          <button
            type="button"
            onClick={() => setFvHref("")}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-[#5C6572]"
          >
            Close
          </button>
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
