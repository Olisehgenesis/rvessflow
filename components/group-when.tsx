"use client";

import { useEffect, useState } from "react";

function LocalTime({ at }: { at: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(new Date(at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  }, [at]);
  return <time dateTime={new Date(at * 1000).toISOString()}>{text || "…"}</time>;
}

export function GroupWhen({
  paidAt,
  youReceive,
  onTimeEnd,
  payUntil,
  turnEnds,
  nextOpens,
}: {
  paidAt: number;
  youReceive: boolean;
  onTimeEnd: number;
  payUntil: number;
  turnEnds: number;
  nextOpens: number;
}) {
  const rows = [
    { label: paidAt ? "You paid" : "Your payment", value: paidAt ? <LocalTime at={paidAt} /> : "Not yet" },
    { label: "Pay on time until", value: <LocalTime at={onTimeEnd} /> },
    { label: "Payment closes", value: <LocalTime at={payUntil} /> },
    { label: youReceive ? "You receive until" : "This turn ends", value: <LocalTime at={turnEnds} /> },
    {
      label: "Next payment",
      value: nextOpens ? <LocalTime at={nextOpens} /> : "None. This is the only turn.",
    },
  ];
  return (
    <dl className="mt-3 divide-y divide-[#E6EADF] overflow-hidden rounded-2xl bg-[#F7F8F4] text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 px-3 py-2.5">
          <dt className="text-[#5C6572]">{row.label}</dt>
          <dd className="text-right font-medium text-[#141414]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
