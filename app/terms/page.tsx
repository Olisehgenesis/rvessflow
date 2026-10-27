import Link from "next/link";
import { terms } from "@/lib/terms";

export const metadata = { title: "Terms · Rvess" };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-full max-w-xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#4E5560]">
        Rvess
      </Link>
      <h1 className="mt-6 text-[2rem] leading-none font-semibold tracking-[-0.04em]">Terms</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
        You agree to these before you sign. This page stores no key.
      </p>
      <ol className="mt-8 space-y-6">
        {terms.map((item, index) => (
          <li key={item.title}>
            <h2 className="text-base font-semibold">
              {index + 1}. {item.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#3A3F47]">{item.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
