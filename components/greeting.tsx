"use client";

export function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <h1 className="font-display text-[1.65rem] font-semibold leading-tight tracking-tight">
      {hello},
      <br />
      {name}
    </h1>
  );
}
