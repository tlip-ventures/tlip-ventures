import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { FilterChips, Pager, SearchForm } from "@/components/pos/list-controls";
import { ButtonLink, Card, PageHeader, PageShell, Pill, ScrollTable, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatDay } from "@/lib/pos/format";
import { ghanaToday, INVOICE_FILTER_LABELS, INVOICE_FILTERS, invoicePill } from "@/lib/pos/invoices";
import { requirePosUser } from "@/lib/server/pos/auth";
import { INVOICES_PAGE_SIZE, listInvoices } from "@/lib/server/pos/invoices";

export const metadata: Metadata = { title: "Invoices" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  filter: z.preprocess(first, z.enum(INVOICE_FILTERS)).catch("open"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

/** Invoices given to customers before they buy: open, sold or cancelled. */
export default async function InvoicesPage({ searchParams }: PageProps<"/pos/invoices">) {
  const params = paramsSchema.parse(await searchParams);
  await requirePosUser();
  const { rows, total } = await listInvoices({ filter: params.filter, search: params.q, page: params.page });
  const today = ghanaToday(new Date());
  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const q = new URLSearchParams();
    if (next.filter !== "open") q.set("filter", next.filter);
    if (next.q) q.set("q", next.q);
    if (next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return `/pos/invoices${s ? `?${s}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="Sell" title="Invoices">
        <ButtonLink href="/pos/sell">New invoice</ButtonLink>
      </PageHeader>
      <p className="m-0 max-w-[640px] text-sm leading-[22px] text-pos-soft">
        To make an invoice, fill the basket at the till as for a sale, then press <strong>Make invoice instead</strong>. Nothing comes off
        the shelf until the customer buys.
      </p>

      <Card label="Invoices">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action="/pos/invoices"
            id="inv-q"
            label="Search invoices"
            placeholder="Invoice number, customer or phone"
            value={params.q}
            hidden={params.filter !== "open" ? { filter: params.filter } : {}}
          />
          <FilterChips
            label="Show"
            options={INVOICE_FILTERS.map((f) => ({ value: f, name: INVOICE_FILTER_LABELS[f] }))}
            current={params.filter}
            href={(filter) => href({ filter, page: 1 })}
          />
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-5 py-12 text-center text-sm text-pos-soft">
            {params.q || params.filter !== "open" ? "No invoices match." : "No open invoices."}
          </p>
        ) : (
          <ScrollTable minWidth={760}>
            <TableHead>
              <Th>Date</Th>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Prices held until</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
            </TableHead>
            <tbody>
              {rows.map((r) => {
                const pill = invoicePill(r.status, r.validUntil, today);
                return (
                  <tr key={r.id} className="pos-row border-t border-pos-paper-deep">
                    <td className="whitespace-nowrap py-3.5 pl-[18px] pr-3 text-pos-soft">{formatDay(r.createdAt)}</td>
                    <td className="px-3 py-3.5 font-bold">
                      <Link href={`/pos/invoice/${r.id}`} className="text-pos-ink no-underline hover:underline">
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="flex flex-col">
                        <span>{r.customer ?? "No customer chosen"}</span>
                        <span className="text-xs text-pos-muted">
                          {r.items} {r.items === 1 ? "item" : "items"}
                          {r.deliveryFee > 0 ? ` · delivery ${formatPesewas(r.deliveryFee)}` : ""}
                          {r.saleCode ? ` · sold as ${r.saleCode}` : ""}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">{formatDay(r.validUntil)}</td>
                    <td className="px-3 py-3.5">
                      <Pill className={pill.className}>{pill.label}</Pill>
                    </td>
                    <td className="whitespace-nowrap py-3.5 pl-3 pr-[18px] text-right font-semibold tabular-nums">{formatPesewas(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </ScrollTable>
        )}
        <Pager page={params.page} pageSize={INVOICES_PAGE_SIZE} total={total} href={(page) => href({ page })} />
      </Card>
    </PageShell>
  );
}
