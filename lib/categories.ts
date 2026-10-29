export type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  image_url: string | null;
  sort_order: number;
};

export type CategoryNode = Category & { children: Category[] };

const bySortOrder = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Top-level categories with their subcategories, both sorted by sort_order then name. */
export function buildCategoryTree(categories: readonly Category[]): CategoryNode[] {
  return categories
    .filter((c) => c.parent_id === null)
    .sort(bySortOrder)
    .map((parent) => ({
      ...parent,
      children: categories.filter((c) => c.parent_id === parent.id).sort(bySortOrder),
    }));
}

/** The category's id plus the ids of its subcategories: what a category page lists products from. */
export function categoryAndChildIds(categories: readonly Category[], category: Category): string[] {
  return [category.id, ...categories.filter((c) => c.parent_id === category.id).map((c) => c.id)];
}

/** Ancestors from the top level down to the category itself, for breadcrumbs. */
export function categoryPath(categories: readonly Category[], category: Category): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [category];
  let parentId = category.parent_id;
  // The depth guard stops a bad parent loop in the data from hanging the page.
  while (parentId && path.length < 10) {
    const parent = byId.get(parentId);
    if (!parent) break;
    path.unshift(parent);
    parentId = parent.parent_id;
  }
  return path;
}
