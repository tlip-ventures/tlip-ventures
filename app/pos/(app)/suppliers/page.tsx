import type { Metadata } from "next";
import Link from "next/link";
import { NewSupplierButton } from "@/components/pos/supplier-dialog";
import { ButtonLink, Card, PageHeader, PageShell, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { phoneText, plural } from "@/lib/pos/format";
import { requireOwner } from "@/lib/server/pos/auth";
import { listSuppliers } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requireOwner();
  const suppliers = await listSuppliers();
  const owed = suppliers.reduce((n, s) => n + s.owed, 0);
  // Who you owe first, then A–Z.
  const rows = [...suppliers].sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));

  return (
    <PageShell>
      <PageHeader eyebrow="Buy" title="Suppliers">
        <ButtonLink href="/pos/purchases/new" kind="outline">
          New purchase
        </ButtonLink>
        <NewSupplierButton />
      </PageHeader>
      <StatGrid min={200}>
        <StatCard label="Suppliers" value={suppliers.length.toLocaleString("en-US")} />
        <StatCard label="You owe suppliers" value={formatPesewas(owed)} tone={owed > 0 ? "warn" : "plain"} />
      </StatGrid>
      <Card label="Suppliers">
        {rows.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-sm text-pos-soft">No suppliers yet. Add one here or while recording a purchase.</p>
        ) : (
          <ScrollTable minWidth={640}>
            <TableHead>
              <Th>Supplier</Th>
              <Th>Phone</Th>
              <Th align="right">Purchases</Th>
              <Th align="right">Bought</Th>
              <Th align="right">You owe</Th>
            </TableHead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="pos-row border-t border-pos-paper-deep">
                  <td className="py-3.5 pl-[18px] pr-3 font-semibold">
                    <Link href={`/pos/purchases?q=${encodeURIComponent(s.name)}`} className="text-pos-ink no-underline hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-pos-soft">{phoneText(s.phone) ?? "—"}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums">{plural(s.purchases, "purchase")}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatPesewas(s.total)}</td>
                  <td className={`whitespace-nowrap py-3.5 pl-3 pr-[18px] text-right tabular-nums ${s.owed ? "font-bold text-pos-rust" : "text-pos-muted"}`}>
                    {s.owed ? formatPesewas(s.owed) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Card>
    </PageShell>
  );
}
