"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { noteWalletChange, watchWallet } from "@/lib/actions";

const beatMs = 5000;

export function ReceiveWatch() {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    let last = "";
    let busy = false;
    let stop = false;

    async function tick() {
      if (stop || busy || document.hidden) return;
      busy = true;
      try {
        const next = await watchWallet();
        if (stop || !next.stamp) return;
        if (last && next.stamp !== last) {
          setArrived(true);
          await noteWalletChange();
        }
        last = next.stamp;
      } finally {
        busy = false;
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), beatMs);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (arrived) {
    return (
      <p className="rounded-2xl bg-[#d9ff38] px-4 py-3 text-sm leading-relaxed text-[#0b0f14]">
        A token just arrived.{" "}
        <Link href="/home" className="font-medium underline underline-offset-2">
          Open Home
        </Link>{" "}
        to see it.
      </p>
    );
  }

  return <p className="text-sm text-muted-foreground">This page looks for new tokens every 5 seconds. Streams do not count.</p>;
}
