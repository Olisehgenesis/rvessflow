import { Suspense } from "react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { AccountFrame } from "@/components/account-mark";
import { NameAsk } from "@/components/name-ask";
import { Shell } from "@/components/shell";
import { TermsAsk } from "@/components/terms-ask";
import { topCeloFaucet } from "@/lib/good-faucet";
import { loadIdentity } from "@/lib/good-identity";
import { knownDisplayName } from "@/lib/known-name";
import { acceptedTerms, hasEntered, nameSkipped, viewer } from "@/lib/session";
import Loading from "./loading";

async function Entered({ children }: { children: React.ReactNode }) {
  if (!(await hasEntered())) redirect("/");
  const [found, agreed, skipped] = await Promise.all([viewer(), acceptedTerms(), nameSkipped()]);
  let who = found;
  if (who.needsName) {
    const known = await knownDisplayName(who.address);
    if (known) who = { ...who, name: known, needsName: false };
  }
  const identity = await loadIdentity(who.address);
  if (identity.verified) after(() => topCeloFaucet(who.address));
  return (
    <>
      <AccountFrame name={who.name} address={who.address} verified={identity.verified}>
        {agreed ? who.needsName && !skipped ? <NameAsk /> : null : <TermsAsk />}
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
