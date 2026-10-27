import Link from "next/link";
import type { Category } from "@/lib/categories";
import { CategoryIcon } from "../category-icon";

// Short names for the small phone circles; other categories use their full name.
const SHORT_NAMES: Record<string, string> = {
  "kitchen-appliances": "Appliances",
  "cooking-baking": "Cooking",
  "kitchen-storage-utensils": "Storage",
  "home-organization": "Home",
  "laundry-cleaning": "Laundry",
};

type Circle = { key: string; href: string; name: string; short: string; iconSlug: string; deal: boolean };

function circles(categories: Category[]): { phone: Circle[]; desktop: Circle[] } {
  const items: Circle[] = categories.map((c) => ({
    key: c.id,
    href: `/categories/${c.slug}`,
    name: c.name,
    short: SHORT_NAMES[c.slug] ?? c.name,
    iconSlug: c.slug,
    deal: false,
  }));
  const deals: Circle = { key: "deals", href: "/deals", name: "Deals", short: "Deals", iconSlug: "deals", deal: true };
  // Deals fourth on phones, so it shows without swiping; last on computers.
  return { phone: [...items.slice(0, 3), deals, ...items.slice(3)], desktop: [...items, deals] };
}

const ring = (deal: boolean) => (deal ? "bg-tint-orange text-brand-orange-dark" : "bg-tint-green text-brand-green");

/** Swipeable row of category circles for phones (hidden from 768px). */
export function CategoryCirclesPhone({ categories }: { categories: Category[] }) {
  return (
    <nav aria-label="Categories" className="md:hidden">
      <ul className="flex gap-3.5 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {circles(categories).phone.map((c) => (
          <li key={c.key} className="w-[72px] shrink-0">
            <Link href={c.href} className="flex flex-col items-center gap-1.5 text-center text-ink no-underline hover:text-ink">
              <span className={`flex h-16 w-16 items-center justify-center rounded-full ${ring(c.deal)}`}>
                <CategoryIcon slug={c.iconSlug} strokeWidth={1.4} className="h-7 w-7" />
              </span>
              <span className="text-[11px] font-semibold leading-[14px]">{c.short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Grid of category circles from 768px. */
export function CategoryCirclesDesktop({ categories }: { categories: Category[] }) {
  return (
    <nav aria-label="Categories" className="hidden md:block">
      <ul className="grid grid-cols-4 gap-x-3 gap-y-5 lg:grid-cols-8">
        {circles(categories).desktop.map((c) => (
          <li key={c.key}>
            <Link
              href={c.href}
              className="group/circle flex flex-col items-center gap-2.5 text-center text-ink no-underline hover:text-brand-green"
            >
              <span
                className={`flex h-24 w-24 items-center justify-center rounded-full transition-shadow group-hover/circle:shadow-[0_0_0_2px_var(--color-brand-green)] ${ring(c.deal)}`}
              >
                <CategoryIcon slug={c.iconSlug} strokeWidth={1.3} className="h-[38px] w-[38px]" />
              </span>
              <span className="text-[13px] font-semibold leading-[18px]">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
