"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ ms = 2500 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.refresh(), ms);
    return () => window.clearTimeout(timer);
  }, [ms, router]);
  return null;
}
