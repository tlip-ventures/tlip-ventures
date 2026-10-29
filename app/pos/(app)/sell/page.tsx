import type { Metadata } from "next";
import { z } from "zod";
import { Register } from "@/components/pos/register/register";
import { requirePosUser } from "@/lib/server/pos/auth";
import { listSellTiles } from "@/lib/server/pos/sell";
import { listTopCategories } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Point of sale" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
  cat: z.preprocess(first, z.uuid()).optional().catch(undefined),
});

export default async function SellPage({ searchParams }: PageProps<"/pos/sell">) {
  const params = paramsSchema.parse(await searchParams);
  const user = await requirePosUser();
  const [{ tiles, total }, categories] = await Promise.all([
    listSellTiles({ search: params.q, topCategoryId: params.cat }),
    listTopCategories(),
  ]);

  return (
    <Register
      tiles={tiles}
      total={total}
      categories={categories}
      query={params.q}
      category={params.cat ?? null}
      canGiveDiscounts={user.canGiveDiscounts}
    />
  );
}
