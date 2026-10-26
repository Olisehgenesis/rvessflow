"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Check, ChevronLeft, ChevronRight, Fingerprint, Lock, Mail, Shield, Wallet, X } from "lucide-react";
import { IconMark } from "@/components/icons";
import { enterApp, lookUpEmail, noteTerms, openSession } from "@/lib/actions";
import { connectWallet, createPasskeyWallet, unlockPasskey } from "@/lib/auth-client";
import { shortAddress } from "@/lib/display";
import { readPasskeys, type SavedPasskey } from "@/lib/passkey-vault";

type Kind = "passkey" | "wallet";
type Attempt = "create" | "unlock" | "connect";
type Mode = "signin" | "create";
type Phase =
  | { name: "choose" }
  | { name: "name" }
  | { name: "email" }
  | { name: "help" }
  | { name: "absent" }
  | { name: "creating" }
  | { name: "created"; address: string; label: string }
  | { name: "connecting" }
  | { name: "confirming"; label: string }
  | { name: "cancelled"; kind: Kind; attempt: Attempt }
  | { name: "failed"; kind: Kind; attempt: Attempt };

function cancelled(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) return true;
  const text = error instanceof Error ? `${error.name} ${error.message}` : "";
  return /reject|reset|closed|cancel|dismiss|not allowed|timed out/i.test(text);
}

function redirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).includes("NEXT_REDIRECT")
  );
}

export function LoginPanel({ intent = "start" }: { intent?: "start" | "login" }) {
  const nameId = useId();
  const emailId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const picked = useRef(intent === "login");
  const [saved, setSaved] = useState<SavedPasskey[]>([]);
  const [checked, setChecked] = useState(false);
  const [onDevice, setOnDevice] = useState(false);
  const [canPasskey, setCanPasskey] = useState(true);
  const [mode, setMode] = useState<Mode>(intent === "login" ? "signin" : "create");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [email, setEmail] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [emailMatch, setEmailMatch] = useState<SavedPasskey | null>(null);
  const [emailWallet, setEmailWallet] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [vaultNote, setVaultNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "choose" });

  useEffect(() => {
    setCanPasskey(typeof window.PublicKeyCredential !== "undefined");
    let live = true;
    readPasskeys()
      .then((rows) => {
        if (!live) return;
        setSaved(rows);
        if (rows.length > 0) {
          setOnDevice(true);
          if (!picked.current) setMode("signin");
        }
        setChecked(true);
      })
      .catch(() => {
        if (!live) return;
        setVaultNote("A passkey saved in this browser could not be opened. Create it again on this device.");
        setChecked(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (phase.name === "name") nameRef.current?.focus();
  }, [phase.name]);

  function acceptTermsBox(next: boolean) {
    setAgreed(next);
    if (next) setTermsError("");
  }

  function choose(next: Mode) {
    picked.current = true;
    setMode(next);
    setTermsError("");
    setPhase({ name: "choose" });
  }

  async function agreeFirst() {
    if (!agreed) {
      setTermsError("Accept the terms before you sign.");
      return false;
    }
    setTermsError("");
    await noteTerms();
    return true;
  }

  async function startPasskey() {
    const label = name.trim().slice(0, 32);
    if (!label) {
      setNameError("Enter a name to continue.");
      setPhase({ name: "name" });
      return;
    }
    if (!(await agreeFirst())) return;
    setPhase({ name: "creating" });
    try {
      const made = await createPasskeyWallet(label);
      setPhase({ name: "created", address: made.address, label: made.label });
    } catch (error) {
      if (redirectError(error)) throw error;
      setPhase(cancelled(error) ? { name: "cancelled", kind: "passkey", attempt: "create" } : { name: "failed", kind: "passkey", attempt: "create" });
    }
  }

  async function startWallet() {
    if (!(await agreeFirst())) return;
    setPhase({ name: "connecting" });
    try {
      await connectWallet(name.trim());
    } catch (error) {
      if (redirectError(error)) throw error;
      setPhase(cancelled(error) ? { name: "cancelled", kind: "wallet", attempt: "connect" } : { name: "failed", kind: "wallet", attempt: "connect" });
    }
  }

  async function startUnlock(passkey: SavedPasskey) {
    if (!(await agreeFirst())) return;
    setPhase({ name: "confirming", label: passkey.label });
    try {
      await unlockPasskey(passkey);
    } catch (error) {
      if (redirectError(error)) throw error;
      setPhase(cancelled(error) ? { name: "cancelled", kind: "passkey", attempt: "unlock" } : { name: "failed", kind: "passkey", attempt: "unlock" });
    }
  }

  async function finish(address: string, label: string) {
    try {
      await openSession(address, "passkey", label);
    } catch (error) {
      if (redirectError(error)) throw error;
      setPhase({ name: "failed", kind: "passkey", attempt: "create" });
    }
  }

  async function checkEmail() {
    setEmailNote("");
    setEmailMatch(null);
    setEmailWallet(false);
    setEmailBusy(true);
    try {
      const hint = await lookUpEmail(email, saved.map((item) => item.address));
      if (hint.status === "invalid") setEmailNote("Enter the email you saved in Settings.");
      else if (hint.status === "down") setEmailNote("The member directory is unavailable, so this email cannot be checked. You can still sign in with a passkey or a wallet.");
      else if (hint.status === "none") setEmailNote("No account is using that email. Create an account with a passkey or a wallet, then add the email in Settings.");
      else if (hint.status === "wallet") {
        setEmailWallet(true);
        setEmailNote("That email is linked to a wallet. Connect the same wallet to sign in. A passkey only opens on the device that created it.");
      }
      else {
        const match = saved.find((item) => item.address.toLowerCase() === hint.address.toLowerCase()) ?? null;
        setEmailMatch(match);
        setEmailNote(match ? `That email belongs to ${match.label} on this device. Continue with that passkey.` : "That email matches a passkey, but this browser could not open it.");
      }
    } catch {
      setEmailNote("The member directory is unavailable, so this email cannot be checked. You can still sign in with a passkey or wallet.");
    } finally {
      setEmailBusy(false);
    }
  }

  function onPasskey() {
    if (!canPasskey) return;
    if (mode === "signin") {
      if (saved.length === 1) void startUnlock(saved[0]);
      else if (saved.length === 0) setPhase({ name: "absent" });
      return;
    }
    setPhase({ name: "name" });
  }

  const signingIn = mode === "signin";
  const lead = !checked
    ? "Checking this device for an account you already created."
    : signingIn && onDevice
      ? "An account is already on this device. Continue with the passkey you saved here, or the wallet you used before."
      : signingIn
        ? "Sign in with the method you already set up. A passkey opens on the device that created it."
        : "Create one account. A passkey stays on this device. A wallet works anywhere. Email is added in Settings after you sign in.";

  return (
    <div className="px-5 pt-4 pb-6 sm:px-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.03em]">
          <IconMark className="size-7 [--background:#ffffff]" />
          RvessFlow
        </p>
        <Dialog.Close className="grid size-8 place-items-center rounded-full text-[#141414] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </div>

      {phase.name === "choose" ? (
        <div className="mt-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F8EE] px-2.5 py-1 text-xs font-medium text-[#3D7A32]">
            <Lock className="size-3.5" />
            Secure & private
          </p>
          <Dialog.Title className="mt-4 text-[1.7rem] leading-[1.05] font-semibold tracking-[-0.04em]">Welcome to RvessFlow</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-[#5C6572]">{lead}</Dialog.Description>

          <div className="mt-5 grid grid-cols-2 rounded-full bg-[#F3F2EE] p-1" role="tablist" aria-label="Account">
            <Tab selected={signingIn} onClick={() => choose("signin")}>
              Sign in
            </Tab>
            <Tab selected={!signingIn} onClick={() => choose("create")}>
              Create account
            </Tab>
          </div>

          {checked ? (
            <div className="mt-4 space-y-2.5" role="tabpanel">
              <TermsBox checked={agreed} onChange={acceptTermsBox} />
              {termsError ? <p className="text-sm text-[#C5362B]">{termsError}</p> : null}

              {signingIn && saved.length > 0 ? (
                saved.map((passkey, index) => (
                  <MethodButton
                    key={passkey.address}
                    icon={<Fingerprint className="size-5" />}
                    title={`Continue as ${passkey.label}`}
                    body={`${shortAddress(passkey.address)}. Face ID, Touch ID, or the saved passkey on this device.`}
                    recommended={index === 0}
                    tone="accent"
                    onClick={() => void startUnlock(passkey)}
                  />
                ))
              ) : (
                <MethodButton
                  icon={<Fingerprint className="size-5" />}
                  title="Continue with a passkey"
                  body={
                    canPasskey
                      ? signingIn
                        ? "Use Face ID, Touch ID, or the passkey saved on the device where you created this account."
                        : "Use Face ID, Touch ID, or this device’s saved passkey. It is fast and stays on this device."
                      : "This browser cannot create a passkey. Continue with a wallet instead."
                  }
                  recommended={canPasskey}
                  tone={canPasskey ? "accent" : "plain"}
                  disabled={!canPasskey}
                  onClick={onPasskey}
                />
              )}

              {!signingIn && saved.length > 0 ? (
                <p className="px-1 text-[13px] leading-snug text-[#5C6572]">
                  {saved[0].label} is already on this device. A new passkey creates a second account. Sign in if this is you.
                </p>
              ) : null}

              <MethodButton
                icon={<Wallet className="size-5" />}
                title="Continue with a wallet"
                body="MetaMask, Coinbase Wallet, and other wallets on Base. The same wallet works on any device."
                onClick={() => void startWallet()}
              />
              <MethodButton
                icon={<Mail className="size-5" />}
                title="Continue with email"
                body={signingIn ? "Use the email you saved in Settings to find the passkey or wallet that owns it." : "An email does not create the account. Add it in Settings after you sign in."}
                onClick={() => {
                  setEmailNote("");
                  setEmailMatch(null);
                  setEmailWallet(false);
                  setTermsError("");
                  setPhase({ name: "email" });
                }}
              />

              {vaultNote ? <p className="text-sm text-[#C5362B]">{vaultNote}</p> : null}

              {signingIn ? (
                <button
                  type="button"
                  onClick={() => choose("create")}
                  className="mt-1 flex w-full items-center gap-3 rounded-2xl border border-[#E7EFE0] bg-[#F7FBF3] px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#3D7A32]">
                    <Shield className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">New to RvessFlow?</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-[#5C6572]">We’ll help you set up a secure account in a few steps.</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-[#8B919A]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => choose("signin")}
                  className="h-10 w-full text-sm font-medium text-[#4E5560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
                >
                  Already have an account? Sign in
                </button>
              )}

              <button
                type="button"
                onClick={() => setPhase({ name: "help" })}
                className="flex w-full items-center justify-center gap-1.5 pt-1 text-[13px] text-[#6B7280] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
              >
                <span aria-hidden="true">?</span>
                Need help? Learn about passkeys or account recovery.
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase.name === "name" ? (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void startPasskey();
          }}
        >
          <Back onClick={() => setPhase({ name: "choose" })} />
          <Dialog.Title className="mt-4 text-[1.55rem] leading-none font-semibold tracking-[-0.04em]">Name this account</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-[#5C6572]">
            This name is stored with the passkey on this device. It is the name people see inside RvessFlow.
          </Dialog.Description>
          <label className="mt-5 block text-sm font-medium" htmlFor={nameId}>
            What should we call you?
          </label>
          <input
            ref={nameRef}
            id={nameId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError("");
            }}
            placeholder="Enter your name"
            autoComplete="nickname"
            maxLength={32}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            className="mt-2 h-12 w-full rounded-xl border border-[#E4E2DC] bg-white px-3.5 text-[15px] outline-none placeholder:text-[#A3A8B0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
          />
          {nameError ? (
            <p id={`${nameId}-error`} className="mt-2 text-sm text-[#C5362B]">
              {nameError}
            </p>
          ) : null}
          <div className="mt-4">
            <TermsBox checked={agreed} onChange={acceptTermsBox} />
          </div>
          {termsError ? <p className="mt-2 text-sm text-[#C5362B]">{termsError}</p> : null}
          <button type="submit" className="mt-5 h-12 w-full rounded-full bg-[#171717] text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99]">
            Create passkey
          </button>
        </form>
      ) : null}

      {phase.name === "email" ? (
        <div className="mt-6">
          <Back onClick={() => setPhase({ name: "choose" })} />
          <Dialog.Title className="mt-4 text-[1.55rem] leading-none font-semibold tracking-[-0.04em]">
            {signingIn ? "Find your account" : "Email comes later"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-[#5C6572]">
            {signingIn
              ? "Email does not sign you in by itself. If you saved one in Settings, we can point you to the passkey or wallet that owns it."
              : "RvessFlow creates the account with a passkey or a wallet. After you sign in, Settings is where that email is saved so groups can find you."}
          </Dialog.Description>
          {signingIn ? (
            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void checkEmail();
              }}
            >
              <label className="block text-sm font-medium" htmlFor={emailId}>
                Email
              </label>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@email.com"
                className="mt-2 h-12 w-full rounded-xl border border-[#E4E2DC] bg-white px-3.5 text-[15px] outline-none placeholder:text-[#A3A8B0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
              />
              <div className="mt-4">
                <TermsBox checked={agreed} onChange={acceptTermsBox} />
              </div>
              {termsError ? <p className="mt-2 text-sm text-[#C5362B]">{termsError}</p> : null}
              <button
                type="submit"
                disabled={emailBusy}
                className="mt-4 h-12 w-full rounded-full bg-[#171717] text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-60"
              >
                {emailBusy ? "Checking…" : "Check email"}
              </button>
            </form>
          ) : (
            <div className="mt-5 space-y-2.5">
              <MethodButton icon={<Fingerprint className="size-5" />} title="Continue with a passkey" body="Recommended on this device." tone="accent" recommended onClick={() => setPhase({ name: "name" })} />
              <MethodButton icon={<Wallet className="size-5" />} title="Continue with a wallet" body="Use the wallet you already have." onClick={() => void startWallet()} />
            </div>
          )}
          {emailNote ? <p className="mt-3 text-sm leading-relaxed text-[#3A3F47]">{emailNote}</p> : null}
          {emailMatch ? (
            <button
              type="button"
              onClick={() => void startUnlock(emailMatch)}
              className="mt-3 h-11 w-full rounded-full bg-[#171717] text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
            >
              Unlock {emailMatch.label}
            </button>
          ) : null}
          {emailWallet ? (
            <button
              type="button"
              onClick={() => void startWallet()}
              className="mt-3 h-11 w-full rounded-full border border-[#E4E2DC] text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
            >
              Connect wallet
            </button>
          ) : null}
        </div>
      ) : null}

      {phase.name === "absent" ? (
        <div className="mt-6">
          <Back onClick={() => setPhase({ name: "choose" })} />
          <Dialog.Title className="mt-4 text-[1.55rem] leading-none font-semibold tracking-[-0.04em]">No passkey on this device</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-[#5C6572]">
            A passkey opens where you created it. This browser does not have one saved. Connect the wallet you used before, or create an account if you are new.
          </Dialog.Description>
          <div className="mt-5 space-y-2.5">
            <MethodButton icon={<Wallet className="size-5" />} title="Continue with a wallet" body="The same wallet works on any device." tone="accent" onClick={() => void startWallet()} />
            <MethodButton icon={<Fingerprint className="size-5" />} title="Create an account" body="This makes a new passkey. It does not open an old one." onClick={() => choose("create")} />
          </div>
        </div>
      ) : null}

      {phase.name === "help" ? (
        <div className="mt-6">
          <Back onClick={() => setPhase({ name: "choose" })} />
          <Dialog.Title className="mt-4 text-[1.55rem] leading-none font-semibold tracking-[-0.04em]">Passkeys and recovery</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-[#5C6572]">
            You get back in with the same method that created the account. There is no separate password for the account itself.
          </Dialog.Description>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[#3A3F47]">
            <li>A passkey stays on the device that created it. A new phone or browser will not see it.</li>
            <li>A wallet is the way back in on another device. Connect the same wallet you used before.</li>
            <li>An email saved in Settings helps groups find you. It does not replace the passkey or the wallet.</li>
          </ul>
          <form
            action={enterApp}
            className="mt-5"
            onSubmit={(event) => {
              if (agreed) return;
              event.preventDefault();
              setTermsError("Accept the terms before you sign.");
              setPhase({ name: "choose" });
            }}
          >
            <input type="hidden" name="terms" value={agreed ? "yes" : ""} />
            <button type="submit" className="h-10 w-full text-xs font-medium text-[#8B919A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
              Use a funded test account
            </button>
          </form>
          {termsError ? <p className="mt-2 text-sm text-[#C5362B]">{termsError}</p> : null}
        </div>
      ) : null}

      {phase.name === "creating" ? <Status title="Creating your account" body="Setting up your passkey. This may take a few seconds." mark={<WaitMark icon={<Fingerprint className="size-6" />} />} bar /> : null}
      {phase.name === "confirming" ? <Status title="Confirm your passkey" body={`Approve the prompt to unlock ${phase.label}.`} mark={<WaitMark icon={<Fingerprint className="size-6" />} />} bar /> : null}
      {phase.name === "connecting" ? <Status title="Connecting wallet" body="Confirm the connection in your wallet." mark={<WaitMark icon={<Wallet className="size-6" />} />} bar /> : null}
      {phase.name === "created" ? (
        <Status
          title="Passkey created"
          body="Your account is ready on this device."
          mark={
            <span className="grid size-14 place-items-center rounded-full bg-[#3C9A34] text-white">
              <Check className="size-7" strokeWidth={2.5} />
            </span>
          }
          action="Continue"
          onAction={() => void finish(phase.address, phase.label)}
        />
      ) : null}
      {phase.name === "cancelled" ? (
        <Status
          title="Setup cancelled"
          body={
            phase.attempt === "connect"
              ? "You closed the wallet prompt. You can try again anytime."
              : phase.attempt === "unlock"
                ? "You cancelled the passkey prompt. You can try again anytime."
                : "You cancelled the passkey setup. You can try again anytime."
          }
          mark={
            <span className="grid size-14 place-items-center rounded-full border border-[#E4E2DC] text-[#141414]">
              <X className="size-6" />
            </span>
          }
          action="Try again"
          quiet
          onAction={() => setPhase({ name: "choose" })}
        />
      ) : null}
      {phase.name === "failed" ? (
        <Status
          title="Something went wrong"
          body={
            phase.attempt === "connect"
              ? "We couldn't connect your wallet. Please try again."
              : phase.attempt === "unlock"
                ? "We couldn't open your passkey. Please try again."
                : "We couldn't create your passkey. Please try again."
          }
          mark={
            <span className="grid size-14 place-items-center rounded-full border border-[#F3C7C3] text-[#D64545]">
              <span className="text-lg leading-none font-semibold">!</span>
            </span>
          }
          action="Retry"
          onAction={() => setPhase({ name: "choose" })}
        />
      ) : null}
    </div>
  );
}

function Tab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`h-10 rounded-full text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] ${
        selected ? "bg-white text-[#141414] shadow-[0_1px_2px_rgba(20,20,20,0.08)]" : "text-[#5C6572]"
      }`}
    >
      {children}
    </button>
  );
}

function MethodButton({
  icon,
  title,
  body,
  onClick,
  recommended = false,
  tone = "plain",
  disabled = false,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  recommended?: boolean;
  tone?: "accent" | "plain";
  disabled?: boolean;
}) {
  const accent = tone === "accent";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:cursor-not-allowed disabled:opacity-70 ${
        accent ? "border-[#D7E7B0] bg-[#F7FBEA]" : "border-[#E8E6E1] bg-white"
      }`}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${accent ? "bg-white text-[#141414]" : "bg-[#F4F3F0] text-[#141414]"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {recommended ? <span className="rounded-full bg-[#E4F3C9] px-2 py-0.5 text-[11px] font-medium text-[#3E7A28]">Recommended</span> : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-[#5C6572]">{body}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[#8B919A]" />
    </button>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-medium text-[#4E5560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
      <ChevronLeft className="size-4" />
      Back
    </button>
  );
}

function Status({
  title,
  body,
  mark,
  action,
  onAction,
  quiet = false,
  bar = false,
}: {
  title: string;
  body: string;
  mark: ReactNode;
  action?: string;
  onAction?: () => void;
  quiet?: boolean;
  bar?: boolean;
}) {
  return (
    <div className="px-2 pt-10 pb-6 text-center">
      <div className="flex justify-center">{mark}</div>
      <Dialog.Title className="mt-5 text-lg font-semibold tracking-[-0.03em]">{title}</Dialog.Title>
      <Dialog.Description className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-relaxed text-[#6B7280]">{body}</Dialog.Description>
      {bar ? (
        <div className="mx-auto mt-7 h-1 w-44 overflow-hidden rounded-full bg-[#ECEAE6]" role="progressbar" aria-label={title}>
          <div className="auth-slide h-full rounded-full bg-[#7CB342]" />
        </div>
      ) : null}
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`mt-8 h-12 w-full rounded-full text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99] ${
            quiet ? "border border-[#E4E2DC] bg-white text-[#141414]" : "bg-[#171717] text-white"
          }`}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function WaitMark({ icon }: { icon: ReactNode }) {
  return (
    <span className="relative grid size-16 place-items-center text-[#141414]">
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-16" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="none" stroke="#ECEAE6" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="28" fill="none" stroke="#8BC34A" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="44 132" className="origin-center motion-safe:animate-spin" />
      </svg>
      {icon}
    </span>
  );
}

function TermsBox({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px] leading-snug text-[#3A3F47]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-[#171717]" />
      <span>
        I agree to the{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="font-medium underline">
          terms
        </a>{" "}
        before I sign.
      </span>
    </label>
  );
}
