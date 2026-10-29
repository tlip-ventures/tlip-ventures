import { buildXlsx, XLSX_TYPE } from "@/lib/pos/xlsx";
import { buildExport, parseExportParams } from "@/lib/server/pos/exports";

/** Excel download of the sales, purchases, returns or stock list. */
export async function GET(request: Request, { params }: RouteContext<"/pos/export/[list]">) {
  const { list } = await params;
  const url = new URL(request.url);
  const table = await buildExport(list, parseExportParams((name) => url.searchParams.get(name)));
  if (!table) return new Response("Not found", { status: 404 });

  const file = buildXlsx(
    table.title,
    table.columns.map((c) => c.label),
    table.rows,
    table.columns.map((c) => c.width),
  );
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${table.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
