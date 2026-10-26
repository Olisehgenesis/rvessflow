import { Suspense } from "react";
import Loading from "../loading";
import { HomeScreen } from "@/components/home-screen";
import { viewer } from "@/lib/session";

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeBody />
    </Suspense>
  );
}

async function HomeBody() {
  const who = await viewer();
  return <HomeScreen who={who} />;
}
