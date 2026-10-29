import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountFrame } from "@/components/account-mark";
import { NameAsk } from "@/components/name-ask";
import { Shell } from "@/components/shell";
import { TermsAsk } from "@/components/terms-ask";
import { loadIdentity } from "@/lib/good-identity";
import { acceptedTerms, hasEntered, viewer } from "@/lib/session";
import Loading from "./loading";

async function Entered({ children }: { children: React.ReactNode }) {
  if (!(await hasEntered())) redirect("/");
  const [who, agreed] = await Promise.all([viewer(), acceptedTerms()]);
  const identity = await loadIdentity(who.address);
  return (
    <>
      <AccountFrame name={who.name} address={who.address} verified={identity.verified}>
        {agreed ? who.needsName ? <NameAsk /> : null : <TermsAsk />}
        {children}
      </AccountFrame>
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
