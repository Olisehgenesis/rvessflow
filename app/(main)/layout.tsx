import { Suspense } from "react";
import { redirect } from "next/navigation";
import { NameAsk } from "@/components/name-ask";
import { Shell } from "@/components/shell";
import { hasEntered, viewer } from "@/lib/session";
import Loading from "./loading";

async function Entered({ children }: { children: React.ReactNode }) {
  if (!(await hasEntered())) redirect("/");
  const who = await viewer();
  return (
    <>
      {who.needsName ? <NameAsk /> : null}
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
