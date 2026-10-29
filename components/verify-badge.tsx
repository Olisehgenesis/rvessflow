export function VerifiedTick({ className = "size-5" }: { className?: string }) {
  return <img src="/marks/paid.png" alt="" className={`${className} inline-block object-contain`} />;
}

export function VerifiedName({ name, verified }: { name: string; verified: boolean }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <span className="truncate">{name}</span>
      {verified ? (
        <span className="inline-flex shrink-0" title="Verified with GoodDollar">
          <VerifiedTick className="size-[1.15em]" />
          <span className="sr-only">Verified</span>
        </span>
      ) : null}
    </span>
  );
}

export function AvatarTick({ verified, children }: { verified: boolean; children: React.ReactNode }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center">
      {children}
      {verified ? (
        <img
          src="/marks/paid.png"
          alt=""
          className="pointer-events-none absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-white object-contain shadow-sm ring-1 ring-white"
        />
      ) : null}
    </span>
  );
}
