import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { z } from "zod";
import { CancelExpenseButton, ExpenseButton, ExpenseCategoryButton } from "@/components/pos/expense-actions";
import { FilterChips, Pager } from "@/components/pos/list-controls";
import { ReportSection as Section } from "@/components/pos/report-section";
import { buttonClass, Card, PageHeader, PageShell, Pill, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { EXPENSE_METHOD_LABELS, realProfit } from "@/lib/pos/expenses";
import { formatDay } from "@/lib/pos/format";
import { REPORT_PERIOD_LABELS, REPORT_PERIODS, reportRange } from "@/lib/pos/reports";
import { requireOwner } from "@/lib/server/pos/auth";
import { EXPENSES_PAGE_SIZE, getExpenseSummary, listExpenseCategories, listExpenses } from "@/lib/server/pos/expenses";
import { getReportOverview } from "@/lib/server/pos/reports";

export const metadata: Metadata = { title: "Expenses" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  period: z.preprocess(first, z.enum(REPORT_PERIODS)).catch("month"),
  from: z.preprocess(first, z.string().max(10)).optional().catch(undefined),
  to: z.preprocess(first, z.string().max(10)).optional().catch(undefined),
  kind: z.preprocess(first, z.coerce.number().int().min(1).max(32767)).optional().catch(undefined),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

/** Owner: the shop's running costs, what they add up to, and the real profit. */
export default async function ExpensesPage({ searchParams }: PageProps<"/pos/expenses">) {
  await requireOwner();
  const params = paramsSchema.parse(await searchParams);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = reportRange(params.period, now, params.from, params.to);
  const [categories, summary, { rows, total }, overview] = await Promise.all([
    listExpenseCategories(),
    getExpenseSummary(range.from, range.to),
    listExpenses({ from: range.from, to: range.to, categoryId: params.kind, page: params.page }),
    getReportOverview(range.from, range.to),
  ]);
  const goodsProfit = overview.sales.profit;
  const real = realProfit(goodsProfit, summary.total);
  const kindName = categories.find((c) => c.id === params.kind)?.name;

  const href = (changes: Partial<{ period: (typeof REPORT_PERIODS)[number]; kind: number | undefined; page: number }>) => {
    const next = { period: range.period, kind: params.kind, page: 1, ...changes };
    const q = new URLSearchParams();
    if (next.period !== "month") q.set("period", next.period);
    if (next.period === "custom") {
      q.set("from", range.first);
      q.set("to", range.last);
    }
    if (next.kind) q.set("kind", String(next.kind));
    if (next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return `/pos/expenses${s ? `?${s}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="Buy" title="Expenses">
        <ExpenseButton categories={categories} today={today} label="Add expense" />
      </PageHeader>

      <div className="flex flex-col gap-3">
        <FilterChips
          label="Period"
          options={REPORT_PERIODS.map((p) => ({ value: p, name: REPORT_PERIOD_LABELS[p] }))}
          current={range.period}
          href={(period) => href({ period })}
        />
        {range.period === "custom" && (
          <Form action="/pos/expenses" className="flex flex-wrap items-end gap-2.5">
            <input type="hidden" name="period" value="custom" />
            {params.kind && <input type="hidden" name="kind" value={params.kind} />}
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-pos-soft">
              <span>From</span>
              <input type="date" name="from" defaultValue={range.first} className="min-h-11 rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-pos-soft">
              <span>To</span>
              <input type="date" name="to" defaultValue={range.last} className="min-h-11 rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink" />
            </label>
            <button type="submit" className={buttonClass("primary")}>
              Show
            </button>
          </Form>
        )}
        <p className="m-0 text-sm text-pos-soft">
          <strong className="text-pos-ink">{range.label}</strong> · by the day each expense was paid. Only you can see expenses.
        </p>
      </div>

      <StatGrid min={190}>
        <StatCard label="Spent" value={formatPesewas(summary.total)} dark />
        <StatCard label="Profit on goods" value={formatPesewas(goodsProfit)} />
        <StatCard label="Real profit" value={formatPesewas(real)} tone={real < 0 ? "warn" : "good"} />
        <StatCard label="Expenses recorded" value={summary.count.toLocaleString("en-US")} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Real profit"
          note={
            overview.sales.missing_costs
              ? "Some items sold had no cost price, so the profit on goods (and the real profit) shows higher than it really is."
              : "What the goods made, less the running costs paid in the same days."
          }
          href={range.period === "custom" ? `/pos/reports?period=custom&from=${range.first}&to=${range.last}` : `/pos/reports?period=${range.period}`}
          link="Open in Reports"
          rows={[
            ["Item sales", formatPesewas(overview.sales.items)],
            ["Profit on goods", formatPesewas(goodsProfit)],
            ["Expenses", `−${formatPesewas(summary.total)}`],
            ["Real profit", formatPesewas(real), real < 0 ? "warn" : "good"],
          ]}
        />
        <Section
          title="By kind and by how it was paid"
          rows={[
            ...summary.byCategory.map((c): [string, string] => [c.name, formatPesewas(c.total)]),
            ...(summary.byCategory.length === 0 ? ([["Nothing spent yet", "—", "muted"]] as [string, string, "muted"][]) : []),
            ["Paid in cash", formatPesewas(summary.byMethod.cash), "muted"],
            ["Paid by Mobile Money", formatPesewas(summary.byMethod.momo), "muted"],
            ["Paid by bank", formatPesewas(summary.byMethod.bank), "muted"],
          ]}
        />
      </div>

      <Card label="Expenses">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <h2 className="m-0 text-lg font-bold leading-6">{kindName ? `${kindName} expenses` : "Every expense"}</h2>
          <Form action="/pos/expenses" className="flex items-center gap-2">
            {range.period !== "month" && <input type="hidden" name="period" value={range.period} />}
            {range.period === "custom" && (
              <>
                <input type="hidden" name="from" value={range.first} />
                <input type="hidden" name="to" value={range.last} />
              </>
            )}
            <label htmlFor="ex-kind" className="sr-only">
              Kind of expense
            </label>
            <select id="ex-kind" name="kind" defaultValue={params.kind ?? ""} className="min-h-11 rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink md:min-h-10">
              <option value="">All kinds</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("outline", "sm")}>
              Show
            </button>
          </Form>
        </div>
        {rows.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-sm text-pos-soft">
            {params.kind ? "No expenses of this kind in these days." : "No expenses in these days yet. Use Add expense to record one."}
          </p>
        ) : (
          <>
            <ScrollTable minWidth={720}>
              <TableHead>
                <Th>Day</Th>
                <Th>Expense</Th>
                <Th>Paid by</Th>
                <Th align="right">Amount</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </TableHead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className={`pos-row border-t border-pos-paper-deep ${e.cancelled ? "text-pos-muted" : ""}`}>
                    <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDay(e.spentOn)}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-col">
                        <span className={`font-semibold ${e.cancelled ? "line-through" : ""}`}>{e.category}</span>
                        {(e.payee || e.note) && <span className="text-xs text-pos-muted">{[e.payee, e.note].filter(Boolean).join(" · ")}</span>}
                        <span className="text-xs text-pos-muted">Recorded by {e.by}</span>
                        {e.cancelled && (
                          <span className="mt-1">
                            <Pill className="bg-pos-paper-deep text-pos-soft">Cancelled{e.cancelled.reason ? `: ${e.cancelled.reason}` : ""}</Pill>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-pos-soft">{EXPENSE_METHOD_LABELS[e.method]}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${e.cancelled ? "line-through" : ""}`}>
                      {formatPesewas(e.amount)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 pr-[18px] text-right">
                      {!e.cancelled && (
                        <span className="inline-flex gap-1">
                          <ExpenseButton
                            categories={categories}
                            today={today}
                            expense={{ id: e.id, spentOn: e.spentOn, categoryId: e.categoryId, amount: e.amount, method: e.method, payee: e.payee, note: e.note }}
                            label="Edit"
                            kind="outline"
                            size="sm"
                          />
                          <CancelExpenseButton id={e.id} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            <Pager page={params.page} pageSize={EXPENSES_PAGE_SIZE} total={total} href={(page) => href({ page })} />
          </>
        )}
      </Card>

      <Card label="Kinds of expense">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-lg font-bold leading-6">Kinds of expense</h2>
            <span className="text-[13px] text-pos-muted">Rename them, hide the ones you don&apos;t use, or add your own.</span>
          </div>
          <ExpenseCategoryButton />
        </div>
        <ul className="m-0 grid list-none gap-x-6 border-t border-pos-paper-deep p-0 px-5 py-2 sm:grid-cols-2">
          {categories.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-pos-paper-deep last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
              <span className={c.isActive ? "" : "text-pos-muted"}>
                {c.name}
                {!c.isActive && <span className="text-xs"> (hidden)</span>}
              </span>
              <ExpenseCategoryButton category={c} />
            </li>
          ))}
        </ul>
      </Card>

      <p className="m-0 text-[13px] text-pos-soft">
        Supplier deliveries are not expenses here: record them under{" "}
        <Link href="/pos/purchases" className="font-bold">
          Purchases
        </Link>
        , so their cost is counted when the goods are sold.
      </p>
    </PageShell>
  );
}
