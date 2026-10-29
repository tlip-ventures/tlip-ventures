import type { Metadata } from "next";
import Link from "next/link";
import { Pager, SearchForm } from "@/components/pos/list-controls";
import { Card, PageHeader, PageShell, ScrollTable, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { phoneText, plural } from "@/lib/pos/format";
import { requirePosUser } from "@/lib/server/pos/auth";
import { listCustomers, RECORDS_PAGE_SIZE } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/pos/customers">) {
  await requirePosUser();
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(raw.q).trim().slice(0, 100);
  const pageNumber = Number(one(raw.page));
  const page = Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 10_000 ? pageNumber : 1;
  const { rows, total } = await listCustomers(q, page);
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    const text = s.toString();
    return `/pos/customers${text ? `?${text}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="People" title="Customers" />
      <p className="m-0 max-w-[640px] text-sm leading-[22px] text-pos-soft">
        Customers are added at the till (Customer, then New customer). Pick one there to sell on Pay later or send a receipt on WhatsApp.
      </p>
      <Card label="Customers">
        <div className="border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm action="/pos/customers" id="cu-q" label="Search customers" placeholder="Name or phone" value={q} />
        </div>
        {rows.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-sm text-pos-soft">{q ? "No customer matches that search." : "No customers yet."}</p>
        ) : (
          <>
            <ScrollTable minWidth={640}>
              <TableHead>
                <Th>Customer</Th>
                <Th>Phone</Th>
                <Th align="right">Sales</Th>
                <Th align="right">Bought</Th>
                <Th align="right">Still owes</Th>
              </TableHead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="pos-row border-t border-pos-paper-deep">
                    <td className="py-3.5 pl-[18px] pr-3 font-semibold">
                      <Link href={`/pos/sales?q=${encodeURIComponent(c.name)}`} className="text-pos-ink no-underline hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-pos-soft">{phoneText(c.phone) ?? "—"}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{plural(c.sales, "sale")}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatPesewas(c.total)}</td>
                    <td className={`whitespace-nowrap py-3.5 pl-3 pr-[18px] text-right tabular-nums ${c.owed ? "font-bold text-pos-rust" : "text-pos-muted"}`}>
                      {c.owed ? (
                        <Link href={`/pos/sales?filter=unpaid&q=${encodeURIComponent(c.name)}`} className="text-pos-rust">
                          {formatPesewas(c.owed)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            <Pager page={page} pageSize={RECORDS_PAGE_SIZE} total={total} href={href} />
          </>
        )}
      </Card>
    </PageShell>
  );
}
