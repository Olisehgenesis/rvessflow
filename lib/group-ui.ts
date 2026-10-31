export const MIN_GROUP_MEMBERS = 3;

export function liveGroupTabs(id: string) {
  const base = `/groups/${id}`;
  return [
    { href: base, label: "Overview" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/schedule`, label: "Schedule" },
    { href: `${base}/activity`, label: "Activity" },
    { href: `${base}/settings`, label: "Settings" },
  ];
}

export function draftGroupTabs(id: string) {
  const base = `/groups/draft/${id}`;
  return [
    { href: base, label: "Overview" },
    { href: `${base}/invite`, label: "Members" },
    { href: `${base}/rules`, label: "Rules" },
    { href: `${base}/activity`, label: "Activity" },
    { href: `${base}/settings`, label: "Settings" },
  ];
}
