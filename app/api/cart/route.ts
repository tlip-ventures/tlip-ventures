import { z } from "zod";
import { MAX_CART_LINES } from "@/lib/checkout";
import { getCartVariants } from "@/lib/server/catalogue";

const idsSchema = z.array(z.uuid()).min(1).max(MAX_CART_LINES);

/**
 * GET /api/cart?ids=<uuid>,<uuid>: current name, price and stock of the cart's
 * variants, so the cart shows what the order will really cost. Public
 * catalogue data only (read as the public, through RLS).
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = idsSchema.safeParse(raw.split(",").filter(Boolean));
  if (!ids.success) {
    return Response.json({ error: "Send 1 to 50 variant ids as ?ids=a,b,c" }, { status: 400 });
  }
  const variants = await getCartVariants([...new Set(ids.data)]);
  return Response.json({ variants }, { headers: { "Cache-Control": "no-store" } });
}
