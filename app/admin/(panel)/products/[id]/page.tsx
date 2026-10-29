import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductEditor } from "@/components/admin/product-editor";
import { buildCategoryTree } from "@/lib/categories";
import { publicEnv } from "@/lib/env";
import { getAdminProduct, productToForm } from "@/lib/server/admin-products";
import { getCategories } from "@/lib/server/catalogue";
import { getServerEnv } from "@/lib/server/env";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [product, categories] = await Promise.all([getAdminProduct(id.data), getCategories()]);
  if (!product) notFound();
  const justCreated = (await searchParams).saved === "1";
  const env = getServerEnv();
  const uploadsEnabled = Boolean(publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

  return (
    <div className="space-y-4">
      <Link href="/admin/products" className="inline-flex min-h-11 items-center text-sm font-semibold">
        ← All products
      </Link>
      <h1 className="text-3xl font-bold text-brand-green">{product.name}</h1>
      {justCreated && (
        <p role="status" className="rounded-lg bg-brand-green/10 px-3 py-2 font-semibold text-brand-green">
          Product created.
        </p>
      )}
      <ProductEditor
        key={product.id}
        initial={productToForm(product)}
        categories={buildCategoryTree(categories)}
        uploadsEnabled={uploadsEnabled}
      />
    </div>
  );
}
