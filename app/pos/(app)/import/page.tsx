import type { Metadata } from "next";
import { ImportScreen } from "@/components/pos/import-screen";
import { PageHeader, PageShell } from "@/components/pos/ui";
import { requireOwner } from "@/lib/server/pos/auth";

export const metadata: Metadata = { title: "Import data" };

export default async function ImportPage() {
  await requireOwner();
  return (
    <PageShell>
      <PageHeader eyebrow="Settings" title="Import your data." />
      <p className="m-0 max-w-[720px] text-sm leading-[22px] text-pos-soft">
        Bring in products, stock, customers, suppliers and past sales from the old system. Nothing is saved until you press Import, and
        every row is checked first.
      </p>
      <ImportScreen />
    </PageShell>
  );
}
