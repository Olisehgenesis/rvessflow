"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Check, UserRound, Wallet, X } from "lucide-react";
import { IconMark } from "@/components/icons";
import { enterApp, noteTerms, openSession } from "@/lib/actions";
import { connectWallet, createPasskeyWallet, unlockPasskey } from "@/lib/auth-client";
import { shortAddress } from "@/lib/display";
import { readPasskeys, type SavedPasskey } from "@/lib/passkey-vault";

type Kind = "passkey" | "wallet";
type Attempt = "create" | "unlock" | "connect";
type Phase =
  | { name: "name" }
  | { name: "method" }
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
  const nameRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedPasskey[]>([]);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [vaultNote, setVaultNote] = useState("");
  const [returning, setReturning] = useState(intent === "login");
  const [agreed, setAgreed] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [phase, setPhase] = useState<Phase>(intent === "login" ? { name: "method" } : { name: "name" });

  useEffect(() => {
    readPasskeys()
      .then(setSaved)
      .catch(() => setVaultNote("A passkey saved in this browser could not be opened. Create it again on this device."));
  }, []);

  useEffect(() => {
    if (phase.name === "name") nameRef.current?.focus();
  }, [phase.name]);

  function requireName() {
    const next = name.trim().slice(0, 32);
    if (!next) {
      setNameError("Enter a name to continue.");
      setPhase({ name: "name" });
      return "";
    }
    setName(next);
    setNameError("");
    return next;
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
    if (!(await agreeFirst())) return;
    const label = requireName();
    if (!label) return;
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

  const welcome = name.trim() ? `Welcome, ${name.trim()}` : "Welcome back";

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

      {!returning && (phase.name === "name" || phase.name === "method") ? <Stepper done={phase.name === "method"} /> : null}

      {phase.name === "name" ? (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!requireName()) return;
            setPhase({ name: "method" });
          }}
        >
          <Dialog.Title className="text-[1.65rem] leading-none font-semibold tracking-[-0.04em]">Welcome to RvessFlow</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[#6B7280]">Your money, flowing your way.</Dialog.Description>
          <label className="mt-6 block text-sm font-medium" htmlFor={nameId}>
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
          <button
            type="submit"
            className="mt-5 h-12 w-full rounded-full bg-[#171717] text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99]"
          >
            Continue
          </button>
          <TermsBox checked={agreed} onChange={setAgreed} />
          {termsError ? <p className="mt-2 text-sm text-[#C5362B]">{termsError}</p> : null}
          <button
            type="button"
            onClick={() => {
              setReturning(true);
              setPhase({ name: "method" });
            }}
            className="mt-3 h-10 w-full text-sm font-medium text-[#4E5560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
          >
            Already have an account? Sign in
          </button>
          <button
            type="button"
            onClick={() => void startWallet()}
            className="h-10 w-full text-sm font-medium text-[#4E5560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
          >
            I already have a wallet
          </button>
        </form>
      ) : null}

      {phase.name === "method" ? (
        <div className="mt-6">
          <Dialog.Title className="text-[1.65rem] leading-none font-semibold tracking-[-0.04em]">
            {returning ? "Welcome back" : welcome}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[#6B7280]">
            {returning
              ? "Sign in with the passkey on this device, or the wallet you already use."
              : "How would you like to get started?"}
          </Dialog.Description>
          <TermsBox checked={agreed} onChange={setAgreed} />
          {termsError ? <p className="mt-2 text-sm text-[#C5362B]">{termsError}</p> : null}

          {saved.map((passkey, index) => (
            <div key={passkey.address} className={`${index === 0 ? "mt-5" : "mt-3"} rounded-2xl border border-[#E3EDD4] bg-[#F4F8EE] p-3.5`}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-white text-[#141414]">
                    <UserRound className="size-4" />
                  </span>
                  <span className="text-sm font-semibold">Continue as {passkey.label}</span>
                </span>
                {index === 0 ? <span className="rounded-full bg-[#E4F3C9] px-2 py-1 text-[11px] font-medium text-[#3E7A28]">On this device</span> : null}
              </div>
              <p className="mt-2 pl-[2.85rem] text-[13px] leading-snug text-[#5C6572]">{shortAddress(passkey.address)}</p>
              <button
                type="button"
                onClick={() => void startUnlock(passkey)}
                className="mt-3 h-11 w-full rounded-full bg-[#171717] text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99]"
              >
                Unlock passkey
              </button>
            </div>
          ))}

          {returning ? null : (
            <div className={`${saved.length > 0 ? "mt-3" : "mt-5"} rounded-2xl border border-[#E3EDD4] bg-[#F4F8EE] p-3.5`}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-white text-[#141414]">
                    <UserRound className="size-4" />
                  </span>
                  <span className="text-sm font-semibold">Create an account</span>
                </span>
                {saved.length === 0 ? <span className="rounded-full bg-[#E4F3C9] px-2 py-1 text-[11px] font-medium text-[#3E7A28]">Recommended</span> : null}
              </div>
              <p className="mt-2 pl-[2.85rem] text-[13px] leading-snug text-[#5C6572]">Secure your account with a passkey on this device.</p>
              <button
                type="button"
                onClick={() => void startPasskey()}
                className="mt-3 h-11 w-full rounded-full bg-[#171717] text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99]"
              >
                Continue with passkey
              </button>
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-[#E8E6E1] bg-white p-3.5">
            <span className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[#F6F5F2] text-[#141414]">
                <Wallet className="size-4" />
              </span>
              <span className="text-sm font-semibold">{returning ? "Use your wallet" : "Already have a wallet?"}</span>
            </span>
            <p className="mt-2 pl-[2.85rem] text-[13px] leading-snug text-[#5C6572]">
              {returning ? "Connect the same wallet you used before. It works on any device." : "Connect your existing wallet to get started."}
            </p>
            <button
              type="button"
              onClick={() => void startWallet()}
              className={`mt-3 h-11 w-full rounded-full text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99] ${
                returning && saved.length === 0 ? "bg-[#171717] text-white" : "border border-[#E4E2DC] bg-white"
              }`}
            >
              Connect wallet
            </button>
          </div>

          {returning && saved.length === 0 ? (
            <p className="mt-3 text-[13px] leading-snug text-[#6B7280]">A passkey opens on the device where you created it. On a new device, use your wallet.</p>
          ) : null}

          {vaultNote ? <p className="mt-3 text-sm text-[#C5362B]">{vaultNote}</p> : null}

          <div className="mt-4 flex items-center gap-3 text-[11px] font-medium tracking-[0.14em] text-[#B0B4BC]">
            <span className="h-px flex-1 bg-[#ECEAE6]" />
            OR
            <span className="h-px flex-1 bg-[#ECEAE6]" />
          </div>
          <p className="mt-3 text-center text-xs text-[#8B919A]">Continue with</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Soon name="Google" mark={<GoogleMark />} />
            <Soon name="X (Twitter)" mark={<XMark />} />
            <Soon name="GitHub" mark={<GitHubMark />} />
          </div>

          {returning ? (
            <button
              type="button"
              onClick={() => {
                setReturning(false);
                setPhase({ name: "name" });
              }}
              className="mt-4 h-10 w-full text-sm font-medium text-[#4E5560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
            >
              New here? Create an account
            </button>
          ) : null}

          <form
            action={enterApp}
            className="mt-1"
            onSubmit={(event) => {
              if (agreed) return;
              event.preventDefault();
              setTermsError("Accept the terms before you sign.");
            }}
          >
            <input type="hidden" name="terms" value={agreed ? "yes" : ""} />
            <button
              type="submit"
              className="h-10 w-full text-xs font-medium text-[#8B919A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
            >
              Use a funded test account
            </button>
          </form>
        </div>
      ) : null}

      {phase.name === "creating" ? (
        <Status
          title="Creating your account"
          body="Setting up your passkey. This may take a few seconds."
          mark={<WaitMark icon={<UserRound className="size-6" />} />}
          bar
        />
      ) : null}

      {phase.name === "confirming" ? (
        <Status
          title="Confirm your passkey"
          body={`Approve the prompt to unlock ${phase.label}.`}
          mark={<WaitMark icon={<UserRound className="size-6" />} />}
          bar
        />
      ) : null}

      {phase.name === "connecting" ? (
        <Status
          title="Connecting wallet"
          body="Please confirm the connection in your wallet."
          mark={<WaitMark icon={<Wallet className="size-6" />} />}
          bar
        />
      ) : null}

      {phase.name === "created" ? (
        <Status
          title="Passkey created!"
          body="Your account has been set up successfully."
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
          onAction={() => setPhase({ name: "method" })}
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
          onAction={() => setPhase({ name: "method" })}
        />
      ) : null}
    </div>
  );
}

function Stepper({ done }: { done: boolean }) {
  return (
    <ol className="mt-5 flex items-center gap-2 text-xs" aria-label="Setup progress">
      <li className="flex items-center gap-1.5 font-medium text-[#141414]">
        {done ? (
          <span className="grid size-5 place-items-center rounded-full bg-[#3C9A34] text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <span className="grid size-5 place-items-center rounded-full bg-[#171717] text-[11px] text-white">1</span>
        )}
        Name
      </li>
      <li className="h-px w-8 bg-[#E4E2DC]" aria-hidden="true" />
      <li className={`flex items-center gap-1.5 font-medium ${done ? "text-[#141414]" : "text-[#A3A8B0]"}`}>
        <span className={`grid size-5 place-items-center rounded-full text-[11px] ${done ? "bg-[#171717] text-white" : "bg-[#F1F0EC] text-[#8B919A]"}`}>2</span>
        Choose method
      </li>
    </ol>
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
      <Dialog.Description className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-[#6B7280]">{body}</Dialog.Description>
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
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="#8BC34A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="44 132"
          className="origin-center motion-safe:animate-spin"
        />
      </svg>
      {icon}
    </span>
  );
}

function TermsBox({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="mt-4 flex items-start gap-2.5 text-[13px] leading-snug text-[#3A3F47]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[#171717]"
      />
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

function Soon({ name, mark }: { name: string; mark: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="flex flex-col items-center gap-1 rounded-2xl border border-[#EEECE8] bg-[#FAFAF8] px-2 py-3 text-[#A3A8B0]"
    >
      <span className="grid size-8 place-items-center rounded-full bg-white text-[#8B919A]">{mark}</span>
      <span className="text-[11px] font-medium text-[#4E5560]">{name}</span>
      <span className="text-[10px]">Coming soon</span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.74-.06-1.28-.2-1.84H12v3.34h5.52c-.11.9-.72 2.26-2.08 3.17l-.02.12 2.94 2.23.2.02c1.86-1.68 2.94-4.16 2.94-7.04Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.87 6.62-2.37l-3.16-2.4c-.84.58-1.98.98-3.46.98-2.64 0-4.88-1.74-5.68-4.15l-.12.01-3.06 2.32-.04.11C4.72 19.98 8.09 22 12 22Z" />
      <path fill="#FBBC05" d="M6.32 14.06A6.18 6.18 0 0 1 6 12c0-.72.12-1.41.31-2.06l-.01-.14-3.1-2.36-.1.05A9.82 9.82 0 0 0 2 12c0 1.61.4 3.13 1.1 4.51l3.22-2.45Z" />
      <path fill="#EA4335" d="M12 5.8c1.88 0 3.14.8 3.86 1.46l2.82-2.7C16.95 2.96 14.7 2 12 2 8.09 2 4.72 4.02 3.1 7.49l3.21 2.45C7.12 7.53 9.36 5.8 12 5.8Z" />
    </svg>
  );
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
      <path fill="currentColor" d="M14.7 10.3 21.4 3h-1.6l-5.8 6.4L9.2 3H3.4l7 9.7L3.4 21h1.6l6.2-6.8 4.9 6.8h5.8l-7.2-10.7Zm-2.2 2.4-.7-1-5.7-7.8h2.5l4.6 6.3.7 1 6 8.2h-2.5l-4.9-6.7Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5 4-1.4 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2Z"
      />
    </svg>
  );
}
