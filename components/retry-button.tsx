"use client";

import { useRouter } from "next/navigation";

export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="mt-3 inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium"
    >
      {label}
    </button>
  );
}
