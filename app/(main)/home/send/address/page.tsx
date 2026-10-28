import { Suspense } from "react";
import Loading from "../../../loading";
import { SendScreen } from "@/components/send-screen";

export default function SendAddressPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SendScreen mode="address" title="To another address" lead="The same address holds tokens on Base and on Celo. Pick the token and the chain." />
    </Suspense>
  );
}
