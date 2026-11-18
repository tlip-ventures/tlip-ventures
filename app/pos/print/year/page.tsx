import type { Metadata } from "next";
import Link from "next/link";
import { AutoPrint } from "@/components/pos/auto-print";
import { PrintButton } from "@/components/pos/print-button";
import { YearSummary } from "@/components/pos/year-summary";
import { formatDay } from "@/lib/pos/format";
import { parseYear } from "@/lib/pos/year-param";
import { getYearSummary } from "@/lib/server/pos/year";

export const metadata: Metadata = { title: "Year summary PDF" };

/** The year summary laid out for A4; "Save as PDF" in the print window makes the PDF. */
export default async function PrintYearPage({ searchParams }: PageProps<"/pos/print/year">) {
  const year = parseYear((await searchParams).year);
  const data = await getYearSummary(year);
  return (
    <main id="main" className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-6 print:max-w-none print:gap-3 print:p-0 print:text-[11px]">
      <AutoPrint />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/pos/reports/year?year=${year}`} className="inline-flex min-h-11 items-center text-[13px] font-bold">
          ← Back to the year summary
        </Link>
        <span className="flex items-center gap-3 text-[13px] text-pos-muted">
          Choose &ldquo;Save as PDF&rdquo; in the print window.
          <PrintButton />
        </span>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-pos-ink pb-2">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-pos-green print:text-pos-ink">Tlip Ventures</p>
          <h1 className="m-0 font-pos-display text-[28px] font-normal leading-tight">Year summary {year}</h1>
        </div>
        <p className="m-0 text-right text-[12px] text-pos-soft">
          1 January to 31 December {year}
          <br />
          Printed {formatDay(new Date())}
        </p>
      </header>
      <YearSummary data={data} />
    </main>
  );
}
