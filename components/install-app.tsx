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
    const onInstalled = () => setDismissed(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
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
              : "Open the browser menu and choose Install Rvess."}
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
            ? "In Safari, tap Share, then Add to Home Screen. The icon is the Rvess mark."
            : "Open the browser menu and choose Install Rvess. It opens on its own, with the same mark."}
        </p>
      ) : null}
    </div>
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function PwaRegister() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const [storageTight, setStorageTight] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloaded = false;
    const onControl = () => {
      if (reloaded || sessionStorage.getItem("pwa-reloading") !== "1") return;
      reloaded = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControl);
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const saveData = connection?.saveData === true || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
    if (!saveData && navigator.storage?.persist) void navigator.storage.persist();
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then(({ usage, quota }) => {
        if (quota && usage !== undefined && usage / quota > 0.8) setStorageTight(true);
      });
    }
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const justUpdated = Number(localStorage.getItem("pwa-just-updated") || 0);
      const offer = (worker: ServiceWorker | null) => {
        if (!worker || Date.now() - justUpdated < 30_000) return;
        setUpdateWorker(worker);
      };
      if (registration.waiting) offer(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
        });
      });
    }).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControl);
  }, []);

  function applyUpdate() {
    if (!updateWorker) return;
    localStorage.setItem("pwa-just-updated", String(Date.now()));
    sessionStorage.setItem("pwa-reloading", "1");
    updateWorker.postMessage({ type: "SKIP_WAITING" });
    setUpdateWorker(null);
  }

  return (
    <>
      {online ? null : (
        <p role="status" className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 rounded-2xl border border-[#E6EADF] bg-[#F7FBF3] px-4 py-3 text-sm text-[#141414] shadow-[0_8px_24px_rgba(20,20,20,0.08)]">
          You are offline. Balances update when the connection returns.
        </p>
      )}
      {updateWorker ? (
        <div className="fixed inset-x-3 bottom-[max(5rem,env(safe-area-inset-bottom))] z-50 flex items-center justify-between gap-3 rounded-2xl border border-[#E6EADF] bg-white px-4 py-3 text-sm shadow-[0_8px_24px_rgba(20,20,20,0.08)]">
          <p>A new version of Rvess is ready.</p>
          <button type="button" onClick={applyUpdate} className="h-10 shrink-0 rounded-full bg-[#D6F34A] px-4 font-semibold text-[#17210C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
            Update
          </button>
        </div>
      ) : null}
      {storageTight ? (
        <p role="status" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-2xl bg-[#141414] px-4 py-3 text-sm text-white">
          This device is low on storage. Rvess may not keep the offline page.
        </p>
      ) : null}
    </>
  );
}
