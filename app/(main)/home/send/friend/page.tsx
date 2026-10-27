import { Suspense } from "react";
import Loading from "../../../loading";
import { SendScreen } from "@/components/send-screen";

export default function SendFriendPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SendScreen
        mode="friend"
        title="To a friend"
        lead="Find someone by the email, phone, or member code they saved on their Rvess account."
      />
    </Suspense>
  );
}
