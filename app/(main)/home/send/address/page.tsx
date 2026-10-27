import { Suspense } from "react";
import Loading from "../../../loading";
import { SendScreen } from "@/components/send-screen";

export default function SendAddressPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SendScreen mode="address" title="To another address" lead="Send a token this wallet already holds." />
    </Suspense>
  );
}
