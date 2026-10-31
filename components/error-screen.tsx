import Link from "next/link";

const marks = {
  lost: "/assets/groups/empty-group.jpg",
  broke: "/assets/groups/lock-vault.jpg",
} as const;

export function ErrorScreen({
  kind,
  title,
  body,
  action = "Go home",
  href = "/",
  onAction,
}: {
  kind: "lost" | "broke";
  title: string;
  body: string;
  action?: string;
  href?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <img src={marks[kind]} alt="" className="size-28 rounded-[1.6rem] object-contain" />
      <h1 className="mt-5 font-[family-name:var(--font-manrope)] text-2xl font-semibold tracking-[-0.04em] text-[#141414]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#5C6572]">{body}</p>
      <div className="mt-6 flex w-full flex-col items-center gap-2">
        {onAction ? (
          <button type="button" onClick={onAction} className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414]">
            {action}
          </button>
        ) : (
          <Link href={href} className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414]">
            {action}
          </Link>
        )}
        {onAction ? (
          <Link href="/" className="inline-flex h-11 items-center text-sm font-medium text-[#5C6572]">
            Go home
          </Link>
        ) : null}
      </div>
    </div>
  );
}
