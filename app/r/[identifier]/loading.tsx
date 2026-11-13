export default function ReceiveLoading() {
  return (
    <main className="min-h-dvh bg-[#F7F6F3] text-[#141414]">
      <div className="mx-auto max-w-[980px] px-4 py-5 sm:px-5">
        <div className="h-8 w-28 animate-pulse rounded-full bg-[#E6EADF]" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-[1.6rem] border border-[#E6EADF] bg-white" />
          <div className="h-[28rem] animate-pulse rounded-[1.6rem] border border-[#E6EADF] bg-white" />
        </div>
      </div>
    </main>
  );
}