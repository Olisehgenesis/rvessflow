"use client";

import { useEffect, useState } from "react";

export function DeskHello({ name }: { name: string }) {
  const [hello, setHello] = useState("Hello");
  useEffect(() => {
    const hour = new Date().getHours();
    setHello(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.04em] text-[#141414]">
      {hello}, {name}
    </h1>
  );
}
