"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function alreadyInstalled() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function InstallButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (alreadyInstalled()) return;
    setVisible(true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  async function install() {
    if (!prompt) {
      setHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setVisible(false);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E4E2DC] bg-white px-3.5 text-sm font-medium text-[#141414] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.98]"
      >
        <img src="/icon-192.png" alt="" width={22} height={22} className="size-[22px] rounded-md" />
        Install
      </button>
      {help ? (
        <p className="mt-2 max-w-xs text-[13px] leading-snug text-[#5C6572]">
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
