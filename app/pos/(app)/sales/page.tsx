import type { Metadata } from "next";
import { parseRecordsParams, RecordsView } from "@/components/pos/records-view";
import { requirePosUser } from "@/lib/server/pos/auth";
import { recordPeriodRange } from "@/lib/pos/records";
import { getRiderSummary } from "@/lib/server/pos/deliveries";
import { getRecordsSummary, listRecords, RECORDS_PAGE_SIZE } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: PageProps<"/pos/sales">) {
  const params = parseRecordsParams(await searchParams);
  const user = await requirePosUser();
  // Makes any website basket whose sale wasn't made at checkout (normally none).
  await user.supabase.rpc("pos_sync_website_orders");
  const [{ rows, total }, summary, riders] = await Promise.all([
    listRecords("sales", { search: params.q, filter: params.filter, period: params.period, rider: params.rider, type: params.type, page: params.page }),
    getRecordsSummary("sales", params.q, params.period, params.rider, params.type),
    getRiderSummary(recordPeriodRange(params.period, new Date())),
  ]);
  return (
    <RecordsView
      kind="sales"
      params={params}
      rows={rows}
      total={total}
      pageSize={RECORDS_PAGE_SIZE}
      summary={summary}
      isOwner={user.isOwner}
      riders={riders}
    />
  );
}
