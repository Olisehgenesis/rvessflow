import { Notice } from "@/components/ui-bits";
import { groupUpgradeLine } from "@/lib/group-upgrade";

export function GroupUpgradeNote() {
  return <Notice>{groupUpgradeLine}</Notice>;
}
