import { shouldSponsorCeloUserOp } from "@/lib/celo-sponsor";

type SponsorRequest = {
  type?: string;
  data?: {
    object?: {
      userOperation?: { callData?: string; initCode?: string };
      chainId?: number;
    };
  };
};

export async function POST(request: Request) {
  const event = (await request.json().catch(() => null)) as SponsorRequest | null;
  if (event?.type && event.type !== "user_operation.sponsorship.requested") {
    return Response.json({ sponsor: true });
  }
  const object = event?.data?.object;
  const sponsor = shouldSponsorCeloUserOp({
    chainId: object?.chainId,
    callData: object?.userOperation?.callData,
    initCode: object?.userOperation?.initCode,
  });
  return Response.json({ sponsor });
}
