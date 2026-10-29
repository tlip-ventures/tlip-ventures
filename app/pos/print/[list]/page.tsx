import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintTable } from "@/components/pos/print-table";
import { buildExport, parseExportParams } from "@/lib/server/pos/exports";

export const metadata: Metadata = { title: "Download PDF" };

const BACK: Record<string, string> = { sales: "/pos/sales", purchases: "/pos/purchases", returns: "/pos/returns", stock: "/pos/products" };

/**
 * The list as a plain printable page. It opens the print dialog by itself;
 * "Save as PDF" there makes the PDF, on a phone or a computer.
 */
export default async function PrintListPage({ params, searchParams }: PageProps<"/pos/print/[list]">) {
  const { list } = await params;
  const raw = await searchParams;
  const one = (name: string) => {
    const v = raw[name];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  const table = await buildExport(list, parseExportParams(one));
  if (!table) notFound();
  const back = new URLSearchParams();
  for (const k of ["q", "filter"]) if (one(k)) back.set(k, one(k)!);

  return <PrintTable table={table} backHref={`${BACK[list]}${back.size ? `?${back}` : ""}`} />;
}
