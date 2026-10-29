import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/shop/listing-controls";
import { buildCategoryTree } from "@/lib/categories";
import { getCategories } from "@/lib/server/catalogue";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Categories",
  description: "Kitchen appliances, cooking and baking, storage, home organisation, laundry and more.",
  path: "/categories",
});

export default async function CategoriesPage() {
  const tree = buildCategoryTree(await getCategories());

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-4">
      <Breadcrumbs
        trail={[
          { name: "Home", href: "/" },
          { name: "Categories", href: "/categories" },
        ]}
      />
      <h1 className="text-3xl font-bold text-brand-green">Categories</h1>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((parent) => (
          <li key={parent.id} className="rounded-lg border border-neutral-200 p-4">
            <h2 className="text-xl font-bold">
              <Link href={`/categories/${parent.slug}`} className="inline-flex min-h-11 items-center text-brand-green">
                {parent.name}
              </Link>
            </h2>
            {parent.children.length > 0 && (
              <ul>
                {parent.children.map((child) => (
                  <li key={child.id}>
                    <Link href={`/categories/${child.slug}`} className="inline-flex min-h-11 items-center">
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
