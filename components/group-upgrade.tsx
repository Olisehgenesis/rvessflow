import { Notice } from "@/components/ui-bits";
import { groupUpgradeLine } from "@/lib/group-upgrade";
import { groupPlainStatus } from "@/lib/protocol";

export async function GroupUpgradeNote() {
  const line = groupUpgradeLine(await groupPlainStatus());
  if (!line) return null;
  return <Notice>{line}</Notice>;
}
