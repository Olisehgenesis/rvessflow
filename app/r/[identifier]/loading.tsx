export default function ReceiveLoading() {
  return (
    <main className="min-h-dvh bg-[#F5F2EB] text-[#202020]">
      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="h-8 w-28 animate-pulse rounded-full bg-[#202020]/10" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-[1.5rem] bg-white/70" />
            <div className="h-28 animate-pulse rounded-[1.5rem] bg-white/70" />
          </div>
          <div className="h-96 animate-pulse rounded-[1.5rem] bg-white/70" />
        </div>
        <p className="mt-6 text-sm text-[#202020]/60">Loading receive page…</p>
      </div>
    </main>
  );
}