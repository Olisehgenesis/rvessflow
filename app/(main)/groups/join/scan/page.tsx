import { QrScan } from "@/components/qr-scan";
import { Page } from "@/components/ui-bits";

export default function ScanPage() {
  return (
    <Page title="Scan group QR code" back="/groups/join">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Point the camera at the code from the organizer. The code opens the join page.</p>
      <QrScan />
    </Page>
  );
}
