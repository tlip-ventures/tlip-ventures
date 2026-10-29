import Link from "next/link";
import type { ReactNode } from "react";

// Building blocks of the Stock & POS screens, with the design's exact sizes
// and colours (design/pos/). Server-safe: no client JavaScript.

/** Page content column: the design's 28/32/40 padding, 16px gutters on phones. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="min-w-0 flex-1 px-4 pb-10 pt-6 md:px-8 md:pt-7">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
        {children}
        <footer className="flex flex-wrap justify-between gap-3 border-t border-pos-line pt-[18px] text-[13px] text-pos-muted">
          <span>Tlip Ventures · Stock and sales · Prices in Ghana cedis (GH₵)</span>
        </footer>
      </div>
    </main>
  );
}

/** Green eyebrow, Gloock title, and the page's buttons on the right. */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase leading-4 tracking-[0.14em] text-pos-green">{eyebrow}</span>
        <h1 className="m-0 font-pos-display text-[32px] font-normal leading-[1.05] md:text-[40px]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

const button = {
  primary: "bg-pos-green px-[18px] font-bold text-white hover:bg-pos-forest",
  outline: "border border-pos-line bg-white px-4 font-semibold text-pos-ink hover:border-pos-muted",
  // Recount, Mark paid: green outline on white.
  green: "border border-pos-green bg-white px-3 font-bold text-pos-green-ink hover:bg-pos-tint-green",
  orange: "bg-pos-orange px-4 font-bold text-pos-ink hover:bg-[#d65a17]",
  dark: "bg-pos-ink px-3.5 font-bold text-white hover:bg-black",
  // Cancel sale and other actions that can't be undone: terracotta, white text.
  danger: "bg-pos-terracotta px-[18px] font-bold text-white hover:bg-[#963b0f]",
  quiet: "bg-transparent px-2 font-semibold text-pos-muted hover:text-pos-ink",
} as const;

export type ButtonKind = keyof typeof button;

/** Class names for a design button (links and buttons). 44px tall unless small. */
export function buttonClass(kind: ButtonKind = "primary", size: "md" | "sm" = "md"): string {
  const height = size === "md" ? "min-h-11 text-sm" : "min-h-9 text-[13px]";
  return `inline-flex items-center justify-center gap-2 rounded-md no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${height} ${button[kind]}`;
}

export function ButtonLink({
  href,
  kind = "primary",
  size = "md",
  children,
  className = "",
}: {
  href: string;
  kind?: ButtonKind;
  size?: "md" | "sm";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonClass(kind, size)} ${className}`}>
      {children}
    </Link>
  );
}

/** White summary card with a Gloock figure; dark = the forest card. */
export function StatCard({
  label,
  value,
  tone = "plain",
  dark = false,
}: {
  label: string;
  value: ReactNode;
  tone?: "plain" | "warn" | "good" | "gold";
  dark?: boolean;
}) {
  const valueColour = { plain: "", warn: "text-pos-rust", good: "text-pos-green-ink", gold: "text-pos-gold" }[tone];
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[10px] px-[18px] py-4 ${
        dark ? "bg-pos-forest text-pos-on-forest" : "border border-pos-card-line bg-white"
      }`}
    >
      <span className={`text-[13px] font-semibold ${dark ? "text-pos-on-forest-muted" : "text-pos-muted"}`}>{label}</span>
      <span className={`font-pos-display text-[30px] leading-none tabular-nums ${valueColour}`}>{value}</span>
    </div>
  );
}

export function StatGrid({ children, min = 210 }: { children: ReactNode; min?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}

/** Small status label on a tint. */
export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-[7px] py-px text-xs font-bold leading-[18px] ${className}`}>
      {children}
    </span>
  );
}

/** White card with the design's border. */
export function Card({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`overflow-hidden rounded-[10px] border border-pos-card-line bg-white ${className}`}>
      {children}
    </section>
  );
}

/** Uppercase column heading row of a design table. */
export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="bg-pos-paper text-left text-xs uppercase tracking-[0.06em] text-pos-muted">{children}</tr>
    </thead>
  );
}

export function Th({ children, align = "left", className = "" }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2.5 font-semibold first:pl-[18px] last:pr-[18px] ${align === "right" ? "text-right" : ""} ${className}`}>
      {children}
    </th>
  );
}

/** A table that scrolls sideways on narrow screens. */
export function ScrollTable({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    // relative: screen-reader-only text inside is positioned absolutely and
    // would otherwise escape the scroll box and widen the whole page on phones.
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/** Visually hidden text for screen readers. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/** Message shown after an action, read out by screen readers. */
export function Notice({ tone, children }: { tone: "good" | "bad"; children: ReactNode }) {
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={`m-0 rounded-md px-3 py-2.5 text-[13px] font-semibold leading-[19px] ${
        tone === "bad" ? "bg-pos-tint-orange text-pos-rust" : "bg-pos-tint-green text-pos-green-ink"
      }`}
    >
      {children}
    </p>
  );
}
