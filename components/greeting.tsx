"use client";

export function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <p className="text-sm text-muted-foreground">{hello},</p>
      <h1 className="font-display text-[1.7rem] font-semibold leading-tight tracking-tight">{name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your money, your way.</p>
    </div>
  );
}
