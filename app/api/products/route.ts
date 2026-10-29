import { z } from "zod";
import { MAX_WISHLIST } from "@/lib/saved-ids";
import { getProductCards } from "@/lib/server/catalogue";

const idsSchema = z.array(z.uuid()).min(1).max(MAX_WISHLIST);

/**
 * GET /api/products?ids=<uuid>,<uuid>: product cards for the wishlist and
 * recently viewed lists, in the order given, with current prices and stock.
 * Hidden or deleted products are left out. Public catalogue data only (read
 * as the public, through RLS).
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = idsSchema.safeParse(raw.split(",").filter(Boolean));
  if (!ids.success) {
    return Response.json({ error: `Send 1 to ${MAX_WISHLIST} product ids as ?ids=a,b,c` }, { status: 400 });
  }
  const products = await getProductCards([...new Set(ids.data)]);
  return Response.json({ products }, { headers: { "Cache-Control": "no-store" } });
}
