import { CreateGroup } from "@/components/create-group";
import { Page } from "@/components/ui-bits";
import { groupPlainOn } from "@/lib/group-site";
import { viewer } from "@/lib/session";

export default async function NewGroupPage() {
  const who = await viewer();
  const [celo, base] = await Promise.all([groupPlainOn("celo"), groupPlainOn("base")]);
  return (
    <Page title="Create group" back="/groups">
      <p className="mb-4 text-sm leading-relaxed text-[#5C6572]">Set the terms, save a draft, then add people. You need three members, including you, to start on-chain.</p>
      <CreateGroup live={{ celo: celo.live, base: base.live }} organizer={who.name} />
    </Page>
  );
}
