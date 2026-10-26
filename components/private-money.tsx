"use client";

import { useConceal } from "@/components/balance-card";

const hidden = "••••••";

export function PrivateUsd({ value }: { value: string }) {
  const conceal = useConceal();
  return <span className="tabular-nums">{conceal ? hidden : `$${value}`}</span>;
}

export function PrivateLine({ value }: { value: string }) {
  const conceal = useConceal();
  return <span className="tabular-nums">{conceal ? hidden : value}</span>;
}
