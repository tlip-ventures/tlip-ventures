import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./ui";

export type ReportRow = [label: string, value: ReactNode, tone?: "bold" | "good" | "warn" | "muted"];

/** A titled card of label / value lines. */
export function ReportSection({ title, note, href, link, rows }: { title: string; note?: string; href?: string; link?: string; rows: ReportRow[] }) {
  return (
    <Card label={title}>
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-lg font-bold leading-6">{title}</h2>
          {note && <p className="m-0 text-[13px] leading-[19px] text-pos-muted">{note}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold md:min-h-8">
            {link ?? "Open"}
          </Link>
        )}
      </div>
      <dl className="m-0 flex flex-col px-5 pb-3">
        {rows.map(([label, value, tone]) => (
          <div
            key={label}
            className={`flex items-baseline justify-between gap-4 border-t border-pos-paper-deep py-2.5 text-sm ${tone === "bold" ? "font-bold" : ""}`}
          >
            <dt className={`min-w-0 ${tone === "muted" ? "text-pos-muted" : "text-pos-soft"}`}>{label}</dt>
            <dd
              className={`m-0 shrink-0 whitespace-nowrap text-right tabular-nums ${
                tone === "good" ? "font-semibold text-pos-green-ink" : tone === "warn" ? "font-semibold text-pos-rust" : ""
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
