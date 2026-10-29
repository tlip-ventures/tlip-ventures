import type { Metadata } from "next";
import Link from "next/link";
import { BackIcon } from "@/components/pos/icons";
import { ProductForm } from "@/components/pos/product-form";
import { Card, PageHeader, PageShell } from "@/components/pos/ui";
import { requireOwner } from "@/lib/server/pos/auth";
import { listCategoryGroups } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireOwner();
  const categories = await listCategoryGroups();

  return (
    <PageShell>
      <Link href="/pos/products" className="inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-bold no-underline">
        <BackIcon size={16} />
        Products and stock
      </Link>
      <PageHeader eyebrow="Stock" title="Add a product." />
      <Card>
        <div className="p-5">
          <p className="mb-5 mt-0 max-w-[640px] text-sm leading-[22px] text-pos-soft">
            Products added here start hidden from the website unless you tick the box. For colours or sizes, photos and a description,
            open the product in the website editor after adding it.
          </p>
          <ProductForm
            categories={categories}
            hasOptions={false}
            initial={{
              id: null,
              name: "",
              price: "",
              onWebsite: false,
              categoryId: null,
              startingStock: "",
              variants: [{ id: null, label: null, sku: "", barcode: "", reorderLevel: "2", priceOverride: "", cost: "" }],
            }}
          />
        </div>
      </Card>
    </PageShell>
  );
}
