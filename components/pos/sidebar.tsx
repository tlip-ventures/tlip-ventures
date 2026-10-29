"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { initials } from "@/lib/pos/format";
import { CloseIcon, MenuIcon, NavIcon, PlusIcon, type NavIconName } from "./icons";

type NavItem = { icon: NavIconName; name: string; href: string; badge?: number; ownerOnly?: boolean };

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ icon: "dash", name: "Dashboard", href: "/pos" }] },
  {
    label: "Sell",
    items: [
      { icon: "pos", name: "Point of sale", href: "/pos/sell" },
      { icon: "sales", name: "Sales", href: "/pos/sales" },
      { icon: "returns", name: "Returns", href: "/pos/returns" },
    ],
  },
  {
    label: "Stock",
    items: [
      { icon: "products", name: "Products and stock", href: "/pos/products" },
      { icon: "count", name: "Stock count", href: "/pos/count" },
    ],
  },
  {
    label: "Buy",
    items: [
      { icon: "purchases", name: "Purchases", href: "/pos/purchases", ownerOnly: true },
      { icon: "suppliers", name: "Suppliers", href: "/pos/suppliers", ownerOnly: true },
    ],
  },
  {
    label: "People",
    items: [
      { icon: "customers", name: "Customers", href: "/pos/customers" },
      { icon: "reports", name: "Reports", href: "/pos/reports", ownerOnly: true },
      { icon: "import", name: "Import data", href: "/pos/import", ownerOnly: true },
      { icon: "settings", name: "Settings", href: "/pos/settings", ownerOnly: true },
    ],
  },
];

function isCurrent(pathname: string, href: string): boolean {
  return href === "/pos" ? pathname === "/pos" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The forest sidebar from the design. On phones it stacks above the page:
 * the name and "New sale" stay in view and the menu opens with a button.
 */
export function Sidebar({
  name,
  isOwner,
  attention,
  signOut,
}: {
  name: string;
  isOwner: boolean;
  /** Items to restock or recount: the badge on "Products and stock". */
  attention: number;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => isOwner || !it.ownerOnly) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <aside className="pos-side flex flex-col bg-pos-forest text-pos-on-forest md:min-h-screen md:w-[248px] md:shrink-0">
      <div aria-hidden="true" className="flex h-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`flex-1 ${i % 2 ? "bg-pos-orange" : "bg-pos-green"}`} />
        ))}
      </div>

      <div className="flex items-start justify-between gap-3 px-5 pb-[18px] pt-[22px]">
        <Link href="/pos" className="flex flex-col gap-1 text-pos-on-forest no-underline hover:text-pos-on-forest">
          <span className="font-pos-display text-[26px] leading-none">Tlip Ventures</span>
          <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-pos-gold">Stock and sales</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="pos-menu"
          className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-pos-on-forest hover:bg-pos-on-forest/10 md:hidden"
        >
          {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
          <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
        </button>
      </div>

      <div className="px-4 pb-2">
        <Link
          href="/pos/sell"
          className="flex min-h-[46px] items-center justify-center gap-2 rounded-md bg-pos-orange text-sm font-bold text-pos-ink no-underline hover:bg-[#d65a17] hover:text-pos-ink"
        >
          <PlusIcon />
          <span>New sale</span>
        </Link>
      </div>

      <div id="pos-menu" className={`${open ? "flex" : "hidden"} flex-1 flex-col md:flex`}>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3 pb-4 pt-2">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5 pt-3">
              <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-pos-nav-label">
                {g.label}
              </span>
              {g.items.map((it) => {
                const current = isCurrent(pathname, it.href);
                const badge = it.href === "/pos/products" && attention > 0 ? attention : null;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-[42px] items-center gap-3 rounded-md px-2.5 text-sm no-underline ${
                      current
                        ? "bg-pos-green font-bold text-pos-on-forest hover:text-pos-on-forest"
                        : "font-medium text-pos-on-forest-muted hover:bg-pos-on-forest/[0.08] hover:text-pos-on-forest"
                    }`}
                  >
                    <NavIcon name={it.icon} />
                    <span className="flex-1">{it.name}</span>
                    {badge !== null && (
                      <span className="box-border h-5 min-w-[22px] rounded-full bg-pos-gold px-1.5 text-center text-xs font-bold leading-5 text-pos-ink">
                        {badge > 99 ? "99+" : badge}
                        <span className="sr-only"> need attention</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mx-3 mb-4 flex items-center gap-2.5 rounded-md bg-pos-on-forest/[0.06] p-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pos-on-forest text-[13px] font-bold text-pos-forest">
            {initials(name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-xs text-pos-on-forest-muted">Accra shop</span>
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 rounded-md px-2 text-xs font-semibold text-pos-on-forest-muted hover:bg-pos-on-forest/10 hover:text-pos-on-forest"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
