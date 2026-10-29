import type { Metadata } from "next";
import Link from "next/link";
import { CategoryForm } from "@/components/admin/category-form";
import { buildCategoryTree, type Category } from "@/lib/categories";
import { requireAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesAdminPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, image_url, sort_order, product_categories(count)")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load categories: ${error.message}`);

  const counts = new Map(data.map((c) => [c.id, c.product_categories[0]?.count ?? 0]));
  const categories: Category[] = data.map(({ id, name, slug, parent_id, image_url, sort_order }) => ({
    id,
    name,
    slug,
    parent_id,
    image_url,
    sort_order,
  }));
  const tree = buildCategoryTree(categories);
  const mains = tree.map(({ id, name }) => ({ id, name }));

  const row = (c: Category, hasChildren: boolean) => (
    <details className="group rounded-lg border border-neutral-200">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2">
        <span className="font-semibold">{c.name}</span>
        <span className="text-sm text-neutral-700">
          {counts.get(c.id)} {counts.get(c.id) === 1 ? "product" : "products"} · Edit
        </span>
      </summary>
      <div className="space-y-2 border-t border-neutral-200 p-3">
        <Link href={`/categories/${c.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold">
          View in shop
        </Link>
        <CategoryForm
          initial={{ id: c.id, name: c.name, slug: c.slug, parentId: c.parent_id ?? "", sortOrder: String(c.sort_order) }}
          parents={mains.filter((m) => m.id !== c.id)}
          canHaveParent={!hasChildren}
          productCount={counts.get(c.id) ?? 0}
        />
      </div>
    </details>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-brand-green">Categories</h1>

      <section aria-labelledby="add-heading" className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <h2 id="add-heading" className="text-xl font-bold text-brand-green">
          Add a category
        </h2>
        <CategoryForm
          initial={{ id: null, name: "", slug: "", parentId: "", sortOrder: "0" }}
          parents={mains}
          canHaveParent
          productCount={0}
        />
      </section>

      <section aria-labelledby="list-heading" className="space-y-3">
        <h2 id="list-heading" className="text-xl font-bold text-brand-green">
          All categories
        </h2>
        <p className="text-sm text-neutral-700">Lower “order” numbers come first in menus.</p>
        <ul className="space-y-3">
          {tree.map((main) => (
            <li key={main.id} className="space-y-2">
              {row(main, main.children.length > 0)}
              {main.children.length > 0 && (
                <ul className="space-y-2 border-l-4 border-brand-green/20 pl-4">
                  {main.children.map((child) => (
                    <li key={child.id}>{row(child, false)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
