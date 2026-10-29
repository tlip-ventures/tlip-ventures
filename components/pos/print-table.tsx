import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { formatDay } from "@/lib/pos/format";
import type { XlsxCell } from "@/lib/pos/xlsx";
import type { ExportTable } from "@/lib/server/pos/exports";
import { AutoPrint } from "./auto-print";
import { PrintButton } from "./print-button";

function cellText(cell: XlsxCell): string {
  if (cell === null) return "";
  if (typeof cell === "object") return formatPesewas(cell.pesewas);
  return typeof cell === "number" ? cell.toLocaleString("en-US") : cell;
}

/** A downloaded list laid out for paper (A4) or "Save as PDF". */
export function PrintTable({ table, backHref }: { table: ExportTable; backHref: string }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <AutoPrint />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex min-h-11 items-center text-[13px] font-bold">
          ← Back to {table.title.toLowerCase()}
        </Link>
        <span className="flex items-center gap-3 text-[13px] text-pos-muted">
          Choose &ldquo;Save as PDF&rdquo; in the print window.
          <PrintButton />
        </span>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-pos-ink pb-2">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-pos-green print:text-pos-ink">Tlip Ventures</p>
          <h1 className="m-0 font-pos-display text-[28px] font-normal leading-tight">{table.title}</h1>
        </div>
        <p className="m-0 text-right text-[12px] text-pos-soft">
          {table.scope} · {table.rows.length.toLocaleString("en-US")} rows
          <br />
          Printed {formatDay(new Date())}
        </p>
      </header>
      {table.cut && (
        <p className="m-0 text-[13px] font-semibold text-pos-rust">Only the first {table.rows.length.toLocaleString("en-US")} rows are shown. Search or filter to narrow the list.</p>
      )}
      <div className="relative overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-[12px] leading-4 print:text-[10px]">
          <thead className="print:table-header-group">
            <tr className="border-b border-pos-line text-left uppercase tracking-[0.04em] text-pos-muted">
              {table.columns.map((c) => (
                <th key={c.label} scope="col" className={`whitespace-nowrap px-1.5 py-1.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="break-inside-avoid border-b border-pos-paper-deep">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-1.5 py-1 align-top ${table.columns[j].align === "right" ? "whitespace-nowrap text-right tabular-nums" : ""}`}
                  >
                    {cellText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.rows.length === 0 && <p className="m-0 text-sm text-pos-soft">Nothing in this list.</p>}
      {table.totals.length > 0 && (
        <dl className="m-0 ml-auto flex min-w-[260px] flex-col gap-1 text-[13px] tabular-nums">
          {table.totals.map(([label, amount]) => (
            <div key={label} className="flex justify-between gap-6">
              <dt>{label}</dt>
              <dd className="m-0 font-bold">{formatPesewas(amount)}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
