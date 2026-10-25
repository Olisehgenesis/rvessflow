import { Suspense } from "react";
import { redirect } from "next/navigation";
import { NameAsk } from "@/components/name-ask";
import { Shell } from "@/components/shell";
import { TermsAsk } from "@/components/terms-ask";
import { acceptedTerms, hasEntered, viewer } from "@/lib/session";
import Loading from "./loading";

async function Entered({ children }: { children: React.ReactNode }) {
  if (!(await hasEntered())) redirect("/");
  const [who, agreed] = await Promise.all([viewer(), acceptedTerms()]);
  return (
    <>
      {agreed ? who.needsName ? <NameAsk /> : null : <TermsAsk />}
      {children}
    </>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Entered>{children}</Entered>
      </Suspense>
    </Shell>
  );
}
