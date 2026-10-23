import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { hasEntered } from "@/lib/session";
import Loading from "./loading";

async function Entered({ children }: { children: React.ReactNode }) {
  if (!(await hasEntered())) redirect("/");
  return children;
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
