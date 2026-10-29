import type { Metadata } from "next";
import Link from "next/link";
import { ProductEditor } from "@/components/admin/product-editor";
import { buildCategoryTree } from "@/lib/categories";
import { publicEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/server/admin";
import { EMPTY_PRODUCT } from "@/lib/server/admin-products";
import { getCategories } from "@/lib/server/catalogue";
import { getServerEnv } from "@/lib/server/env";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = buildCategoryTree(await getCategories());
  const env = getServerEnv();
  const uploadsEnabled = Boolean(publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

  return (
    <div className="space-y-4">
      <Link href="/admin/products" className="inline-flex min-h-11 items-center text-sm font-semibold">
        ← All products
      </Link>
      <h1 className="text-3xl font-bold text-brand-green">Add product</h1>
      <ProductEditor initial={EMPTY_PRODUCT} categories={categories} uploadsEnabled={uploadsEnabled} />
    </div>
  );
}
