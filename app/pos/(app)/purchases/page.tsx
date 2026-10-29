import type { Metadata } from "next";
import { parseRecordsParams, RecordsView } from "@/components/pos/records-view";
import { requireOwner } from "@/lib/server/pos/auth";
import { getRecordsSummary, listRecords, RECORDS_PAGE_SIZE } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage({ searchParams }: PageProps<"/pos/purchases">) {
  const params = parseRecordsParams(await searchParams);
  const user = await requireOwner();
  const [{ rows, total }, summary] = await Promise.all([
    listRecords("purchases", { search: params.q, filter: params.filter, page: params.page }),
    getRecordsSummary("purchases", params.q),
  ]);
  return (
    <RecordsView
      kind="purchases"
      params={params}
      rows={rows}
      total={total}
      pageSize={RECORDS_PAGE_SIZE}
      summary={summary}
      isOwner={user.isOwner}
    />
  );
}
