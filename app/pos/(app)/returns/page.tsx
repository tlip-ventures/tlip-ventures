import type { Metadata } from "next";
import { parseRecordsParams, RecordsView } from "@/components/pos/records-view";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getRecordsSummary, listRecords, RECORDS_PAGE_SIZE } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage({ searchParams }: PageProps<"/pos/returns">) {
  const params = parseRecordsParams(await searchParams, "returns");
  const user = await requirePosUser();
  const [{ rows, total }, summary] = await Promise.all([
    listRecords("returns", { search: params.q, filter: params.filter, period: params.period, day: params.day, page: params.page }),
    getRecordsSummary("returns", params.q, params.period, undefined, "all", params.day),
  ]);
  return (
    <RecordsView
      kind="returns"
      params={params}
      rows={rows}
      total={total}
      pageSize={RECORDS_PAGE_SIZE}
      summary={summary}
      isOwner={user.isOwner}
    />
  );
}
