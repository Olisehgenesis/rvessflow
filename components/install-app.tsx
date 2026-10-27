"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function alreadyInstalled() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function subscribeInstall() {
  return () => undefined;
}

export function InstallButton({ className = "", row = false }: { className?: string; row?: boolean }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [help, setHelp] = useState(false);
  const installed = useSyncExternalStore(subscribeInstall, alreadyInstalled, () => true);
  const ios = useSyncExternalStore(
    subscribeInstall,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );

  useEffect(() => {
    if (installed) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [installed]);

  if (installed || dismissed) return null;

  async function install() {
    if (!prompt) {
      setHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setDismissed(true);
  }

  if (row) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="block w-full py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Install the app
        {help ? (
          <span className="mt-1 block text-sm font-normal leading-snug text-muted-foreground">
            {ios
              ? "In Safari, tap Share, then Add to Home Screen."
              : "Open the browser menu and choose Install RvessFlow."}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <img src="/icon-192.png" alt="" width={22} height={22} className="size-[22px] rounded-md" />
        Install
      </button>
      {help ? (
        <p className="mt-2 text-sm leading-snug text-muted-foreground">
          {ios
            ? "In Safari, tap Share, then Add to Home Screen. The icon is the RvessFlow mark."
            : "Open the browser menu and choose Install RvessFlow. It opens on its own, with the same mark."}
        </p>
      ) : null}
    </div>
  );
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
