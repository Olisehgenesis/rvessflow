import { FlowHeader } from "@/components/deposit-flow";
import { SendForm } from "@/components/send-form";
import { loadSendChoices } from "@/lib/send";
import { viewer } from "@/lib/session";

export async function SendScreen({
  mode,
  title,
  lead,
  back = "/goals/expense/now",
}: {
  mode: "address" | "friend";
  title: string;
  lead: string;
  back?: string;
}) {
  const who = await viewer();
  const choices = await loadSendChoices(who.address);
  return (
    <main className="px-4 pb-8">
      <FlowHeader title={title} back={back} />
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{lead}</p>
      <SendForm mode={mode} choices={choices} />
    </main>
  );
}
