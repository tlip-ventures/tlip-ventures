import type { SVGProps } from "react";

// Line icons for the top-level categories, from the marketplace design. The
// database has no icon field, so they are matched by slug; new or renamed
// categories get the generic grid icon until one is added here.
const PATHS: Record<string, string> = {
  "kitchen-appliances": "M8 3h8l-1 9H9L8 3z M7 12h10v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8z",
  "cooking-baking": "M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6z M2 10h20 M9 6c0-1 1-2 3-2s3 1 3 2",
  "kitchen-storage-utensils":
    "M8 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M8 3h8v4H8z M6 12h12",
  "home-organization": "M4 4h16v16H4z M4 10h16 M4 15h16 M12 10v10",
  "laundry-cleaning": "M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c0 1.5-1.8 3-4 3S8 4.5 8 3z",
  bathroom: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  "kids-baby": "M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16z M9 14.5c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5",
  // Not categories, but shown alongside them.
  deals: "M3 12V4h8l10 10-8 8L3 12z M7.5 7a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z",
  "new-arrivals": "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};

const GRID = "M5.5 4h3.5a1.5 1.5 0 0 1 1.5 1.5V9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 9V5.5A1.5 1.5 0 0 1 5.5 4z M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9a1.5 1.5 0 0 1-1.5 1.5H15A1.5 1.5 0 0 1 13.5 9V5.5A1.5 1.5 0 0 1 15 4z M5.5 13.5h3.5a1.5 1.5 0 0 1 1.5 1.5v3.5A1.5 1.5 0 0 1 9 20H5.5A1.5 1.5 0 0 1 4 18.5V15a1.5 1.5 0 0 1 1.5-1.5z M15 13.5h3.5A1.5 1.5 0 0 1 20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15a1.5 1.5 0 0 1-1.5-1.5V15a1.5 1.5 0 0 1 1.5-1.5z";

type Props = SVGProps<SVGSVGElement> & { slug: string };

/** Decorative icon for a top-level category (or "deals" / "new-arrivals"). */
export function CategoryIcon({ slug, strokeWidth = 1.5, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={PATHS[slug] ?? GRID} />
    </svg>
  );
}

/** The grid icon on its own, for "Categories" buttons. */
export function CategoriesIcon(props: SVGProps<SVGSVGElement>) {
  return <CategoryIcon slug="" strokeWidth={1.75} {...props} />;
}
