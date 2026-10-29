import type { Metadata } from "next";
import { parseRecordsParams, RecordsView } from "@/components/pos/records-view";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getRecordsSummary, listRecords, RECORDS_PAGE_SIZE } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage({ searchParams }: PageProps<"/pos/returns">) {
  const params = parseRecordsParams(await searchParams);
  const user = await requirePosUser();
  const [{ rows, total }, summary] = await Promise.all([
    listRecords("returns", { search: params.q, filter: params.filter, page: params.page }),
    getRecordsSummary("returns", params.q),
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
