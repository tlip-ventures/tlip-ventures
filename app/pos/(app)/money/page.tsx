import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Pager } from "@/components/pos/list-controls";
import { CancelMoneyMoveButton, CountMoneyButton, MoneyMoveButton } from "@/components/pos/money-actions";
import { Card, PageHeader, PageShell, Pill, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { countResult, flowLines, MONEY_ACCOUNT_LABELS, moveText } from "@/lib/pos/money";
import { formatDay, formatDayTime } from "@/lib/pos/format";
import { requireOwner } from "@/lib/server/pos/auth";
import { getMoneyOverview, listMoneyCounts, listMoneyMoves, MONEY_MOVES_PAGE_SIZE } from "@/lib/server/pos/money";

export const metadata: Metadata = { title: "Money" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({ page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1) });

const signed = (p: number) => (p < 0 ? `−${formatPesewas(-p)}` : `+${formatPesewas(p)}`);

/** Owner: what should be in cash, MoMo and the bank, counts, moves, and money taken out or put in. */
export default async function MoneyPage({ searchParams }: PageProps<"/pos/money">) {
  await requireOwner();
  const { page } = paramsSchema.parse(await searchParams);
  const today = new Date().toISOString().slice(0, 10);
  const [accounts, moves, counts] = await Promise.all([getMoneyOverview(), listMoneyMoves(page), listMoneyCounts()]);
  const counted = accounts.filter((a) => a.counted !== null);
  const total = counted.reduce((s, a) => s + a.expected, 0);

  return (
    <PageShell>
      <PageHeader eyebrow="Buy" title="Money">
        <MoneyMoveButton kind="transfer" today={today} />
        <MoneyMoveButton kind="owner_out" today={today} />
        <MoneyMoveButton kind="owner_in" today={today} />
      </PageHeader>

      <p className="m-0 max-w-3xl text-sm leading-[22px] text-pos-soft">
        Count each account once to start. After that the app adds every payment taken, refund, supplier payment, expense and move, so you can see what
        should be there. Count again (end of the day for cash) to check it: a difference shows as short or over. Only you can see this page.
      </p>

      <StatGrid min={200}>
        {accounts.map((a) => (
          <StatCard key={a.account} label={MONEY_ACCOUNT_LABELS[a.account]} value={a.counted === null ? "Not counted" : formatPesewas(a.expected)} tone={a.expected < 0 ? "warn" : "plain"} />
        ))}
        <StatCard label={counted.length === 3 ? "All together" : "Counted accounts together"} value={counted.length ? formatPesewas(total) : "—"} dark />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        {accounts.map((a) => {
          const lines = flowLines(a.flows);
          return (
            <Card key={a.account} label={MONEY_ACCOUNT_LABELS[a.account]}>
              <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
                <div className="flex flex-col gap-0.5">
                  <h2 className="m-0 text-lg font-bold leading-6">{MONEY_ACCOUNT_LABELS[a.account]}</h2>
                  <span className="text-[13px] text-pos-muted">
                    {a.countedAt ? `Last counted ${formatDayTime(a.countedAt)}` : "Not counted yet"}
                  </span>
                </div>
                <CountMoneyButton account={a.account} expected={a.expected} firstCount={a.counted === null} />
              </div>
              {a.counted === null ? (
                <p className="m-0 px-5 pb-5 pt-1 text-sm leading-[22px] text-pos-soft">
                  Count it once to start keeping track. Until then its payments still show in Reports.
                </p>
              ) : (
                <dl className="m-0 flex flex-col px-5 pb-3">
                  <div className="flex items-baseline justify-between gap-4 border-t border-pos-paper-deep py-2.5 text-sm">
                    <dt className="text-pos-soft">Counted</dt>
                    <dd className="m-0 tabular-nums">{formatPesewas(a.counted)}</dd>
                  </div>
                  {lines.length === 0 ? (
                    <div className="flex items-baseline justify-between gap-4 border-t border-pos-paper-deep py-2.5 text-sm">
                      <dt className="text-pos-muted">Nothing in or out since</dt>
                      <dd className="m-0 text-pos-muted">—</dd>
                    </div>
                  ) : (
                    lines.map(([label, amount]) => (
                      <div key={label} className="flex items-baseline justify-between gap-4 border-t border-pos-paper-deep py-2.5 text-sm">
                        <dt className="text-pos-soft">{label}</dt>
                        <dd className={`m-0 tabular-nums ${amount < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>{signed(amount)}</dd>
                      </div>
                    ))
                  )}
                  <div className="flex items-baseline justify-between gap-4 border-t border-pos-paper-deep py-2.5 text-sm font-bold">
                    <dt>Should be there now</dt>
                    <dd className={`m-0 tabular-nums ${a.expected < 0 ? "text-pos-rust" : ""}`}>{formatPesewas(a.expected)}</dd>
                  </div>
                </dl>
              )}
            </Card>
          );
        })}
      </div>

      <Card label="Moves, money taken out and put in">
        <div className="flex flex-col gap-0.5 border-b border-pos-paper-deep px-[18px] py-3.5">
          <h2 className="m-0 text-lg font-bold leading-6">Moves, money taken out and put in</h2>
          <span className="text-[13px] text-pos-muted">
            Money you take out isn&apos;t an expense: it doesn&apos;t lower the profit. Reports show it apart.
          </span>
        </div>
        {moves.rows.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-sm text-pos-soft">Nothing yet. Use Move money, Take money out or Put money in.</p>
        ) : (
          <>
            <ScrollTable minWidth={640}>
              <TableHead>
                <Th>Day</Th>
                <Th>What</Th>
                <Th align="right">Amount</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </TableHead>
              <tbody>
                {moves.rows.map((m) => (
                  <tr key={m.id} className={`pos-row border-t border-pos-paper-deep ${m.cancelled ? "text-pos-muted" : ""}`}>
                    <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDay(m.movedOn)}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-col">
                        <span className={`font-semibold ${m.cancelled ? "line-through" : ""}`}>{moveText(m.kind, m.from, m.to)}</span>
                        {m.note && <span className="text-xs text-pos-muted">{m.note}</span>}
                        <span className="text-xs text-pos-muted">Recorded by {m.by}</span>
                        {m.cancelled && (
                          <span className="mt-1">
                            <Pill className="bg-pos-paper-deep text-pos-soft">Cancelled{m.cancelled.reason ? `: ${m.cancelled.reason}` : ""}</Pill>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${m.cancelled ? "line-through" : ""}`}>
                      {formatPesewas(m.amount)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 pr-[18px] text-right">{!m.cancelled && <CancelMoneyMoveButton id={m.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            <Pager page={page} pageSize={MONEY_MOVES_PAGE_SIZE} total={moves.total} href={(p) => (p > 1 ? `/pos/money?page=${p}` : "/pos/money")} />
          </>
        )}
      </Card>

      <Card label="Latest counts">
        <div className="border-b border-pos-paper-deep px-[18px] py-3.5">
          <h2 className="m-0 text-lg font-bold leading-6">Latest counts</h2>
        </div>
        {counts.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-sm text-pos-soft">No counts yet. Count each account above to start.</p>
        ) : (
          <ScrollTable minWidth={640}>
            <TableHead>
              <Th>When</Th>
              <Th>Account</Th>
              <Th align="right">Counted</Th>
              <Th align="right">Expected</Th>
              <Th>Result</Th>
            </TableHead>
            <tbody>
              {counts.map((c) => {
                const r = countResult(c.counted, c.expected);
                return (
                  <tr key={c.id} className="pos-row border-t border-pos-paper-deep">
                    <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDayTime(c.at)}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-col">
                        <span className="font-semibold">{MONEY_ACCOUNT_LABELS[c.account]}</span>
                        {c.note && <span className="text-xs text-pos-muted">{c.note}</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(c.counted)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-pos-soft">{c.expected === null ? "—" : formatPesewas(c.expected)}</td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-[18px]">
                      {r.kind === "first" ? (
                        <Pill className="bg-pos-paper-deep text-pos-soft">First count</Pill>
                      ) : r.kind === "match" ? (
                        <Pill className="bg-pos-tint-green text-pos-green-ink">Matches</Pill>
                      ) : (
                        <Pill className={r.kind === "short" ? "bg-pos-tint-orange text-pos-rust" : "bg-pos-tint-green text-pos-green-ink"}>
                          {formatPesewas(r.amount)} {r.kind}
                        </Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ScrollTable>
        )}
      </Card>

      <p className="m-0 text-[13px] text-pos-soft">
        Running costs go under{" "}
        <Link href="/pos/expenses" className="font-bold">
          Expenses
        </Link>
        ; what is taken out and put in each month shows in{" "}
        <Link href="/pos/reports" className="font-bold">
          Reports
        </Link>
        .
      </p>
    </PageShell>
  );
}
