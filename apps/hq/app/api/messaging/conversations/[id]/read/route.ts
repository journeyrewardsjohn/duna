import { postMessagingWatermark } from "../../../_watermark";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  return postMessagingWatermark(request, (await context.params).id, "read");
}
