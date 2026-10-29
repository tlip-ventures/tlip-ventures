"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { importBatch, type ImportRowResult } from "@/app/pos/(app)/import/actions";
import {
  autoMap,
  checkImport,
  findHeaderRow,
  IMPORT_FIELDS,
  IMPORT_KINDS,
  KIND_LABELS,
  missingFields,
  type CheckedImport,
  type ImportKind,
} from "@/lib/pos/import";
import type { ImportBatch } from "@/lib/pos/schemas";
import { readSpreadsheet, type Sheet } from "@/lib/pos/spreadsheet";
import { columnName } from "@/lib/pos/xlsx";
import { dialogInputClass, dialogLabelClass } from "./action-dialog";
import { buttonClass, Card, Notice, Pill, ScrollTable, StatCard, StatGrid, TableHead, Th } from "./ui";

type Outcome = ImportRowResult["action"] | "left-out";
type Line = { row: number; outcome: Outcome; message: string };

const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  new: { label: "New", className: "bg-pos-tint-green text-pos-green-ink" },
  update: { label: "Update", className: "bg-pos-tint-green text-pos-green-ink" },
  skip: { label: "Already in", className: "bg-pos-paper-deep text-pos-soft" },
  "left-out": { label: "Left out", className: "bg-pos-paper-deep text-pos-soft" },
  error: { label: "Problem", className: "bg-pos-tint-orange text-pos-rust" },
};

const BATCH: Record<ImportKind, number> = { products: 400, customers: 400, suppliers: 400, sales: 200, purchases: 200 };
const SHOWN = 300;
const FILTERS = ["all", "error", "new", "update", "skip"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = { all: "All", error: "Problems", new: "New", update: "Updates", skip: "Already in or left out" };
const AFTER: Record<ImportKind, { href: string; label: string }> = {
  products: { href: "/pos/products", label: "Products and stock" },
  customers: { href: "/pos/customers", label: "Customers" },
  suppliers: { href: "/pos/suppliers", label: "Suppliers" },
  sales: { href: "/pos/sales", label: "Sales" },
  purchases: { href: "/pos/purchases", label: "Purchases" },
};

function rowsOfCheck(c: CheckedImport): { row: number }[] {
  return c.result.rows;
}

/** The owner's import: choose a kind, a file, check it, then import it. runBatch is replaceable for previews. */
export function ImportScreen({ runBatch = importBatch }: { runBatch?: typeof importBatch }) {
  const [kind, setKind] = useState<ImportKind>("products");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<Record<string, number>>({});
  const [setStock, setSetStock] = useState(true);
  const [updatePrices, setUpdatePrices] = useState(false);
  const [checked, setChecked] = useState<CheckedImport | null>(null);
  const [dbResults, setDbResults] = useState<Map<number, ImportRowResult> | null>(null);
  const [busy, setBusy] = useState<{ what: "check" | "import"; done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [imported, setImported] = useState<{ new: number; update: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const headers = sheet?.[headerRow] ?? [];
  const sample = sheet?.[headerRow + 1] ?? [];
  const missing = sheet ? missingFields(kind, map) : [];

  const reset = () => {
    setChecked(null);
    setDbResults(null);
    setImported(null);
    setMessage(null);
    setFilter("all");
  };

  const chooseKind = (k: ImportKind) => {
    setKind(k);
    reset();
    if (sheet) {
      const h = findHeaderRow(k, sheet);
      setHeaderRow(h);
      setMap(autoMap(k, sheet[h] ?? []));
    }
  };

  const readFile = async (file: File | undefined) => {
    reset();
    setSheet(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const data = await readSpreadsheet(file.name, await file.arrayBuffer());
      if (data.length < 2) throw new Error("This file has no rows under its headings.");
      const h = findHeaderRow(kind, data);
      setSheet(data);
      setHeaderRow(h);
      setMap(autoMap(kind, data[h] ?? []));
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "This file couldn't be read." });
    }
  };

  const batchFor = (rows: unknown[], apply: boolean): ImportBatch =>
    kind === "products"
      ? ({ kind, apply, updatePrices, setStock, rows } as ImportBatch)
      : ({ kind, apply, rows } as ImportBatch);

  /** Sends rows in batches; stops at the first batch the server refuses. */
  const send = async (rows: { row: number }[], apply: boolean) => {
    const out = new Map<number, ImportRowResult>();
    setBusy({ what: apply ? "import" : "check", done: 0, total: rows.length });
    for (let i = 0; i < rows.length; i += BATCH[kind]) {
      const part = rows.slice(i, i + BATCH[kind]);
      const r = await runBatch(batchFor(part, apply));
      if (!r.ok) {
        setBusy(null);
        throw new Error(apply ? `${r.message} ${i ? `The first ${i.toLocaleString("en-US")} rows were saved; import the file again to finish (rows already in are skipped).` : ""}` : r.message);
      }
      for (const res of r.results) out.set(res.row, res);
      setBusy({ what: apply ? "import" : "check", done: Math.min(i + part.length, rows.length), total: rows.length });
    }
    setBusy(null);
    return out;
  };

  const check = async () => {
    if (!sheet) return;
    reset();
    const c = checkImport(kind, sheet, headerRow, map);
    setChecked(c);
    const rows = rowsOfCheck(c);
    if (!rows.length) return;
    try {
      setDbResults(await send(rows, false));
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "The check stopped. Try again." });
    }
  };

  const lines: Line[] = useMemo(() => {
    if (!checked) return [];
    const out: Line[] = [
      ...checked.result.errors.map((e) => ({ row: e.row, outcome: "error" as const, message: e.message })),
      ...checked.result.skipped.map((e) => ({ row: e.row, outcome: "left-out" as const, message: e.message })),
    ];
    if (dbResults) for (const r of dbResults.values()) out.push({ row: r.row, outcome: r.action, message: r.message });
    return out.sort((a, b) => a.row - b.row);
  }, [checked, dbResults]);

  const count = (o: Outcome) => lines.filter((l) => l.outcome === o).length;
  const toImport = checked && dbResults ? rowsOfCheck(checked).filter((r) => ["new", "update"].includes(dbResults.get(r.row)?.action ?? "")) : [];

  const runImport = async () => {
    if (!checked || !toImport.length) return;
    setMessage(null);
    try {
      const results = await send(toImport, true);
      const done = [...results.values()];
      setImported({ new: done.filter((r) => r.action === "new").length, update: done.filter((r) => r.action === "update").length });
      setDbResults((prev) => new Map([...(prev ?? []), ...results]));
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "The import stopped." });
    }
  };

  const shown = lines.filter((l) => filter === "all" || l.outcome === filter || (filter === "skip" && l.outcome === "left-out"));

  return (
    <div className="flex flex-col gap-5">
      <Card label="What are you importing?" className="flex flex-col gap-4 p-5">
        <h2 className="m-0 text-lg font-bold leading-6">1. What are you importing?</h2>
        <fieldset className="m-0 grid gap-2.5 border-0 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))" }}>
          <legend className="sr-only">Kind of file</legend>
          {IMPORT_KINDS.map((k) => (
            <label
              key={k}
              className="relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border border-pos-line bg-white p-3.5 has-[:checked]:border-pos-green has-[:checked]:bg-pos-tint-green has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pos-green"
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => chooseKind(k)} className="sr-only" />
              <span className="text-sm font-bold">{KIND_LABELS[k].title}</span>
              <span className="text-[13px] leading-[18px] text-pos-muted">{KIND_LABELS[k].body}</span>
            </label>
          ))}
        </fieldset>
        <p className="m-0 text-[13px] text-pos-muted">
          Best order: products, then customers and suppliers, then past sales and purchases. Importing a file twice is safe: what is already in is
          skipped.
        </p>
      </Card>

      <Card label="Choose the file" className="flex flex-col gap-4 p-5">
        <h2 className="m-0 text-lg font-bold leading-6">2. Choose the file</h2>
        <label className={dialogLabelClass}>
          <span>Excel (.xlsx) or CSV file exported from the old system</span>
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => readFile(e.target.files?.[0])}
            className="min-h-11 text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-pos-line file:bg-white file:px-4 file:text-sm file:font-semibold file:text-pos-ink"
          />
        </label>

        {sheet && (
          <>
            <p className="m-0 text-sm text-pos-soft">
              <strong className="text-pos-ink">{fileName}</strong>: {(sheet.length - headerRow - 1).toLocaleString("en-US")} rows under the headings.
              Check that each line below points at the right column.
            </p>
            <label className={`${dialogLabelClass} max-w-[260px]`}>
              <span>Headings are on row</span>
              <select
                value={headerRow}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setHeaderRow(h);
                  setMap(autoMap(kind, sheet[h] ?? []));
                  reset();
                }}
                className={dialogInputClass}
              >
                {sheet.slice(0, 10).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {r.filter(Boolean).slice(0, 3).join(", ").slice(0, 50) || "(empty)"}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
              {IMPORT_FIELDS[kind].map((f) => {
                const col = map[f.key] ?? -1;
                return (
                  <label key={f.key} className={dialogLabelClass}>
                    <span>
                      {f.label}
                      {f.required && <span className="text-pos-rust"> (needed)</span>}
                    </span>
                    <select
                      value={col}
                      onChange={(e) => {
                        setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }));
                        reset();
                      }}
                      className={`${dialogInputClass} ${f.required && col < 0 ? "border-pos-rust" : ""}`}
                    >
                      <option value={-1}>Not in this file</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {columnName(i)}: {h || "(no heading)"}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-normal text-pos-muted">
                      {col >= 0 && sample[col] ? `First row: ${sample[col].slice(0, 40)}` : (f.hint ?? "")}
                    </span>
                  </label>
                );
              })}
            </div>
            {kind === "products" && (
              <div className="flex flex-col gap-1">
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input type="checkbox" checked={setStock} onChange={(e) => { setSetStock(e.target.checked); reset(); }} className="mt-0.5 h-5 w-5 flex-none accent-pos-green" />
                  <span className="flex flex-col">
                    <span className="font-semibold">Set the shelf count from the stock column</span>
                    <span className="text-[13px] text-pos-muted">Each product&apos;s shelf count becomes the number in the file. Below zero shows as Recount.</span>
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input type="checkbox" checked={updatePrices} onChange={(e) => { setUpdatePrices(e.target.checked); reset(); }} className="mt-0.5 h-5 w-5 flex-none accent-pos-green" />
                  <span className="flex flex-col">
                    <span className="font-semibold">Update the selling price of products already on the website</span>
                    <span className="text-[13px] text-pos-muted">Off: products you already have keep their website price. New products always take the file&apos;s price.</span>
                  </span>
                </label>
              </div>
            )}
            {missing.length > 0 && <Notice tone="bad">Choose the column for: {missing.map((f) => f.label).join(", ")}.</Notice>}
            <div>
              <button type="button" onClick={check} disabled={missing.length > 0 || busy !== null} className={buttonClass("primary")}>
                {busy?.what === "check" ? "Checking…" : "Check the file"}
              </button>
            </div>
          </>
        )}
        {!sheet && message && <Notice tone={message.tone}>{message.text}</Notice>}
      </Card>

      {busy && (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm font-semibold">
            {busy.what === "check" ? "Checking" : "Importing"} {busy.done.toLocaleString("en-US")} of {busy.total.toLocaleString("en-US")}…
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-pos-paper-deep">
            <span className="block h-full bg-pos-green transition-[width]" style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} />
          </span>
        </div>
      )}

      {checked && (
        <Card label="Check">
          <div className="flex flex-col gap-4 p-5">
            <h2 className="m-0 text-lg font-bold leading-6">3. {imported ? "Done" : "Check, then import"}</h2>
            <StatGrid min={150}>
              <StatCard label="New" value={count("new").toLocaleString("en-US")} tone="good" />
              <StatCard label="Updates" value={count("update").toLocaleString("en-US")} />
              <StatCard label="Already in or left out" value={(count("skip") + count("left-out")).toLocaleString("en-US")} />
              <StatCard label="Problems" value={count("error").toLocaleString("en-US")} tone={count("error") ? "warn" : "plain"} />
            </StatGrid>
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            {imported ? (
              <Notice tone="good">
                Imported: {imported.new.toLocaleString("en-US")} new, {imported.update.toLocaleString("en-US")} updated.{" "}
                <Link href={AFTER[kind].href} className="text-pos-green-ink">
                  Open {AFTER[kind].label}
                </Link>
              </Notice>
            ) : (
              dbResults && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={runImport} disabled={!toImport.length || busy !== null} className={buttonClass("primary")}>
                    {busy?.what === "import" ? "Importing…" : `Import ${toImport.length.toLocaleString("en-US")} ${toImport.length === 1 ? "row" : "rows"}`}
                  </button>
                  <span className="text-[13px] text-pos-muted">
                    {count("error") ? "Rows with problems are left out: fix them in the file and import it again. " : ""}
                    {kind === "sales" || kind === "purchases" ? "Past records don't change the shelf count." : ""}
                  </span>
                </div>
              )
            )}
          </div>
          {lines.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 border-t border-pos-paper-deep px-5 py-3" role="group" aria-label="Show">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={`min-h-9 rounded-full border px-3.5 text-[13px] font-semibold ${
                      filter === f ? "border-pos-forest bg-pos-forest text-white" : "border-pos-line bg-white text-pos-ink"
                    }`}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
              <ScrollTable minWidth={560}>
                <TableHead>
                  <Th>Row</Th>
                  <Th>What happens</Th>
                  <Th>Details</Th>
                </TableHead>
                <tbody>
                  {shown.slice(0, SHOWN).map((l) => (
                    <tr key={`${l.row}-${l.outcome}`} className="border-t border-pos-paper-deep">
                      <td className="py-2.5 pl-[18px] pr-3 tabular-nums text-pos-soft">{l.row}</td>
                      <td className="px-3 py-2.5">
                        <Pill className={OUTCOME[l.outcome].className}>{OUTCOME[l.outcome].label}</Pill>
                      </td>
                      <td className="py-2.5 pl-3 pr-[18px]">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
              {shown.length > SHOWN && (
                <p className="m-0 border-t border-pos-paper-deep px-5 py-3 text-[13px] text-pos-muted">
                  Showing the first {SHOWN} of {shown.length.toLocaleString("en-US")}.
                </p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
