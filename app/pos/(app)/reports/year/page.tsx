import type { Metadata } from "next";
import Link from "next/link";
import { FilterChips } from "@/components/pos/list-controls";
import { buttonClass, PageHeader, PageShell } from "@/components/pos/ui";
import { YearSummary } from "@/components/pos/year-summary";
import { parseYear, yearChoices } from "@/lib/pos/year-param";
import { getYearSummary } from "@/lib/server/pos/year";

export const metadata: Metadata = { title: "Year summary" };

/** Owner: one calendar year on a page, to keep, print or send as Excel. */
export default async function YearSummaryPage({ searchParams }: PageProps<"/pos/reports/year">) {
  const now = new Date();
  const year = parseYear((await searchParams).year, now);
  const data = await getYearSummary(year);
  const current = year === now.getUTCFullYear();

  return (
    <PageShell>
      <PageHeader eyebrow="Reports" title={`Year ${year}`}>
        <Link href={`/pos/print/year?year=${year}`} className={buttonClass("outline")}>
          Print / PDF
        </Link>
        <a href={`/pos/export/year?year=${year}`} className={buttonClass("outline")} download>
          Excel
        </a>
      </PageHeader>

      <div className="flex flex-col gap-3">
        <FilterChips
          label="Year"
          options={yearChoices(now).map((y) => ({ value: String(y), name: String(y) }))}
          current={String(year)}
          href={(y) => (Number(y) === now.getUTCFullYear() ? "/pos/reports/year" : `/pos/reports/year?year=${y}`)}
        />
        <p className="m-0 text-sm text-pos-soft">
          <strong className="text-pos-ink">1 January to 31 December {year}</strong>
          {current ? " · so far this year" : ""}. Only you can see this.{" "}
          <Link href="/pos/reports" className="font-bold">
            Back to Reports
          </Link>
        </p>
      </div>

      <YearSummary data={data} />
    </PageShell>
  );
}
