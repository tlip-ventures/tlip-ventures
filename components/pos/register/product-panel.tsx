"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { findProductByCode } from "@/app/pos/(app)/sell/actions";
import { formatPesewas } from "@/lib/money";
import { basketQty, tileStock } from "@/lib/pos/basket";
import { useBasket, useBasketHydrated } from "@/lib/pos/basket-store";
import { tileClass, tileCode } from "@/lib/pos/stock";
import type { SellTile } from "@/lib/server/pos/sell";
import { SearchIcon } from "../icons";

const STOCK_TONE = { out: "text-pos-muted", low: "text-pos-rust", ok: "text-pos-green-ink" } as const;

/**
 * Left side of the till: search or scan, category chips and the product
 * tiles. Search runs on the server (thousands of products), the basket here.
 */
export function ProductPanel({
  tiles,
  total,
  categories,
  query,
  category,
}: {
  tiles: SellTile[];
  total: number;
  categories: { id: string; name: string }[];
  query: string;
  category: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useBasketHydrated();
  const lines = useBasket((s) => s.lines);
  const add = useBasket((s) => s.add);
  const [text, setText] = useState(query);
  const [status, setStatus] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (q: string, cat: string | null) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cat) params.set("cat", cat);
    const s = params.toString();
    startSearch(() => router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false }));
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const addTile = (tile: SellTile) => {
    add({ variantId: tile.variantId, name: tile.name, sku: tile.sku, unitPrice: tile.price, maxQty: tile.onHand });
  };

  const onType = (value: string) => {
    setText(value);
    setStatus(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(value, category), 350);
  };

  // A barcode scanner types the code and presses Enter: add that item straight away.
  const onEnter = async () => {
    if (timer.current) clearTimeout(timer.current);
    const code = text.trim();
    if (!code) return;
    const tile = await findProductByCode(code);
    if (!tile) {
      go(code, category);
      return;
    }
    const inBasket = basketQty(useBasket.getState().lines, tile.variantId);
    if (!tileStock(tile.onHand, inBasket).canAdd) {
      setStatus(tile.onHand <= 0 ? `${tile.name} is out of stock.` : `All ${tile.onHand} of ${tile.name} are in the basket.`);
    } else {
      addTile(tile);
      setStatus(`Added ${tile.name}.`);
    }
    setText("");
    if (query) go("", category);
    input.current?.focus();
  };

  const catHref = (id: string | null) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (id) params.set("cat", id);
    const s = params.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };

  return (
    <section aria-labelledby="pos-title" className="box-border flex min-w-0 flex-[999_1_460px] flex-col gap-[18px] px-4 pb-8 pt-6 md:px-7">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase leading-4 tracking-[0.14em] text-pos-green">Point of sale</span>
          <h1 id="pos-title" className="m-0 font-pos-display text-[32px] font-normal leading-[1.05] md:text-[36px]">
            Ring up a sale.
          </h1>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void onEnter();
          }}
          className="box-border flex h-12 min-w-[220px] flex-[0_1_380px] items-center gap-2.5 rounded-md border border-pos-line bg-white px-3.5 text-pos-muted focus-within:border-pos-green"
        >
          <label htmlFor="pos-q" className="sr-only">
            Search or scan a product
          </label>
          <SearchIcon />
          <input
            ref={input}
            id="pos-q"
            type="search"
            value={text}
            onChange={(e) => onType(e.target.value)}
            placeholder="Search name or scan barcode"
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-pos-ink outline-none placeholder:text-pos-muted"
          />
          <span className="hidden whitespace-nowrap text-xs text-pos-muted sm:inline" aria-hidden="true">
            {searching ? "Searching…" : "Scanner ready"}
          </span>
        </form>
      </div>

      <p role="status" className={`m-0 text-[13px] font-semibold text-pos-green-ink ${status ? "" : "sr-only"}`}>
        {status}
      </p>

      <nav aria-label="Category" className="-mx-4 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0">
        <ul className="m-0 flex list-none gap-2 p-0">
          {[{ id: null, name: "All" }, ...categories].map((c) => {
            const on = (c.id ?? null) === category;
            return (
              <li key={c.id ?? "all"} className="flex-none">
                <Link
                  href={catHref(c.id)}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold no-underline md:min-h-10 ${
                    on
                      ? "border-pos-forest bg-pos-forest text-pos-on-forest hover:text-pos-on-forest"
                      : "border-pos-line bg-white text-pos-ink hover:border-pos-muted hover:text-pos-ink"
                  }`}
                >
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tiles.length === 0 ? (
        <p className="m-0 rounded-lg bg-pos-paper-deep p-6 text-sm text-pos-soft">
          No products match “{query}”. Check the spelling or add it under Products and stock.
        </p>
      ) : (
        // The design's 168px tiles on bigger screens; two across on a phone.
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(140px,100%),1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(min(168px,100%),1fr))]">
          {tiles.map((tile) => {
            const inBasket = hydrated ? basketQty(lines, tile.variantId) : 0;
            const stock = tileStock(tile.onHand, inBasket);
            const out = tile.onHand <= 0;
            return (
              <button
                key={tile.variantId}
                type="button"
                onClick={() => addTile(tile)}
                disabled={!stock.canAdd}
                aria-label={out ? `${tile.name}, out of stock` : `Add ${tile.name}, ${formatPesewas(tile.price)}`}
                className={`flex flex-col gap-2 rounded-lg border border-pos-card-line bg-white p-2.5 text-left text-pos-ink transition-colors enabled:hover:border-pos-green ${
                  out ? "cursor-not-allowed opacity-60" : stock.canAdd ? "cursor-pointer" : "cursor-not-allowed"
                }`}
              >
                <span
                  className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md text-xs font-bold tracking-[0.06em] text-pos-forest ${tileClass(tile.topCategory)}`}
                >
                  {tile.imageUrl ? (
                    <Image src={tile.imageUrl} alt="" fill sizes="(max-width: 640px) 45vw, 180px" className="object-contain mix-blend-multiply" />
                  ) : (
                    tileCode(tile.sku, tile.name)
                  )}
                  {inBasket > 0 && (
                    <span className="absolute right-1.5 top-1.5 box-border h-6 min-w-6 rounded-full bg-pos-green px-1.5 text-center text-xs leading-6 tracking-normal text-white">
                      {inBasket}
                      <span className="sr-only"> in basket</span>
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 min-h-[38px] text-sm font-semibold leading-[19px]">{tile.name}</span>
                <span className="flex w-full flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5">
                  <span className="whitespace-nowrap text-[15px] font-bold tabular-nums">{formatPesewas(tile.price)}</span>
                  <span className={`whitespace-nowrap text-xs font-semibold ${STOCK_TONE[stock.tone]}`}>{stock.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {total > tiles.length && (
        <p className="m-0 text-[13px] text-pos-muted">
          Showing {tiles.length} of {total.toLocaleString("en-US")}. Search or pick a category to find the rest.
        </p>
      )}
    </section>
  );
}
