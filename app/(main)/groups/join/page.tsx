import { Suspense } from "react";
import Loading from "../../loading";
import { JoinForm } from "@/components/join-group";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";

export default function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <JoinBody searchParams={searchParams} />
    </Suspense>
  );
}

async function JoinBody({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <Page title="Join a group" back="/groups">
      <GroupLead src="/marks/invite.png" title="Use the organizer's code" body="Type it here, or scan the QR code they shared." />
      <JoinForm code={code ?? ""} />
    </Page>
  );
}
