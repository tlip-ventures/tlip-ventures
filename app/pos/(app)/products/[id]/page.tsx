import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackIcon, ExternalIcon } from "@/components/pos/icons";
import { ProductForm } from "@/components/pos/product-form";
import { ProductTile } from "@/components/pos/product-tile";
import { AdjustButton, RecountButton } from "@/components/pos/stock-dialogs";
import { ButtonLink, Card, Notice, PageHeader, PageShell, Pill, ScrollTable, TableHead, Th } from "@/components/pos/ui";
import { WebsiteSwitch } from "@/components/pos/website-switch";
import { formatPesewas, pesewasToInput } from "@/lib/money";
import { formatDayTime } from "@/lib/pos/format";
import { movementLabel, shelfText, signedQty, STOCK_PILLS } from "@/lib/pos/stock";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getStockProduct } from "@/lib/server/pos/stock";

export async function generateMetadata({ params }: PageProps<"/pos/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Product" };
  const product = await getStockProduct(id);
  return { title: product?.name ?? "Product" };
}

export default async function StockProductPage({ params, searchParams }: PageProps<"/pos/products/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requirePosUser();
  const product = await getStockProduct(id);
  if (!product) notFound();
  const added = (await searchParams).added === "1";
  const v = product.variant;
  const hasEarlier = product.earlier.size > 0;

  return (
    <PageShell>
      <Link href="/pos/products" className="inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-bold no-underline">
        <BackIcon size={16} />
        Products and stock
      </Link>
      <PageHeader eyebrow={product.categories.join(" · ") || "Stock"} title={product.name}>
        {user.isOwner && (
          <ButtonLink href={`/admin/products/${product.id}`} kind="outline">
            <ExternalIcon />
            <span>Photos and description</span>
          </ButtonLink>
        )}
      </PageHeader>

      {added && <Notice tone="good">Product added.</Notice>}

      <Card label="Stock">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <div className="flex items-center gap-3">
            <ProductTile imageUrl={product.imageUrl} sku={v?.sku ?? null} name={product.name} category={product.categories[0] ?? null} size={56} />
            <div className="flex flex-col">
              <span className="text-lg font-bold leading-6">On the shelf</span>
              <span className="text-[13px] text-pos-muted">{formatPesewas(product.price)} each</span>
              {product.choiceName && (
                <span className="text-[13px] text-pos-soft">
                  {product.choiceName}: {product.choices.join(", ")} (one stock number)
                </span>
              )}
            </div>
          </div>
          <WebsiteSwitch productId={product.id} productName={product.name} on={product.onWebsite} canEdit={user.isOwner} />
        </div>
        {v ? (
          <ScrollTable minWidth={user.isOwner ? 760 : 660}>
            <TableHead>
              <Th>Code</Th>
              <Th>Barcode</Th>
              {user.isOwner && <Th align="right">Cost</Th>}
              <Th align="right">Price</Th>
              <Th>On the shelf</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </TableHead>
            <tbody>
              <tr className="border-t border-pos-paper-deep">
                <td className="py-3 pl-[18px] pr-3 font-semibold">{v.sku ?? "No code"}</td>
                <td className="px-3 py-3 text-pos-soft">{v.barcode ?? "—"}</td>
                {user.isOwner && <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-pos-soft">{v.cost === null ? "—" : formatPesewas(v.cost)}</td>}
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(v.priceOverride ?? product.price)}</td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className={`font-bold tabular-nums ${v.onHand < 0 ? "text-pos-rust" : ""}`}>{shelfText(v.onHand, v.reorderLevel)}</span>
                    <Pill className={STOCK_PILLS[v.state].className}>{STOCK_PILLS[v.state].label}</Pill>
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pl-3 pr-[18px] text-right">
                  {user.canAdjustStock && (
                    <span className="inline-flex gap-1.5">
                      <RecountButton variantId={v.id} name={product.name} onHand={v.onHand} />
                      <AdjustButton variantId={v.id} name={product.name} />
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </ScrollTable>
        ) : (
          <p className="m-0 px-[18px] py-6 text-sm text-pos-soft">This product has no stock entry. Save it once in the website editor.</p>
        )}
      </Card>

      {user.isOwner && (
        <Card label="Details">
          <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
            <h2 className="m-0 text-lg font-bold leading-6">Details</h2>
            <span className="text-[13px] text-pos-muted">Codes, costs and when to warn you it&apos;s running low.</span>
          </div>
          <div className="p-5">
            <ProductForm
              initial={{
                id: product.id,
                name: product.name,
                price: pesewasToInput(product.price),
                onWebsite: product.onWebsite,
                categoryId: null,
                startingStock: "",
                choiceName: product.choiceName ?? "",
                choices: product.choices.join(", "),
                sku: v?.sku ?? "",
                barcode: v?.barcode ?? "",
                reorderLevel: String(v?.reorderLevel ?? 0),
                cost: pesewasToInput(v?.cost ?? null),
              }}
            />
          </div>
        </Card>
      )}

      <Card label="Stock history">
        <div className="flex flex-col gap-1 px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Stock history</h2>
          <span className="text-[13px] text-pos-muted">Every change to the shelf count, newest first. Changes are never edited; a correction is a new line.</span>
        </div>
        {product.movements.length === 0 ? (
          <p className="m-0 border-t border-pos-paper-deep px-5 py-8 text-center text-sm text-pos-soft">
            No stock recorded yet. Use Recount to set what is on the shelf.
          </p>
        ) : (
          <ScrollTable minWidth={720}>
            <TableHead>
              <Th>Date</Th>
              {hasEarlier && <Th>Entry</Th>}
              <Th>What</Th>
              <Th align="right">Change</Th>
              <Th align="right">Shelf after</Th>
              <Th>Reason</Th>
              <Th>By</Th>
            </TableHead>
            <tbody>
              {product.movements.map((m) => (
                <tr key={m.id} className="border-t border-pos-paper-deep">
                  <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDayTime(m.createdAt)}</td>
                  {hasEarlier && (
                    <td className="px-3 py-3 text-pos-soft">{product.earlier.has(m.variantId) ? `Earlier: ${product.earlier.get(m.variantId)}` : "In use"}</td>
                  )}
                  <td className="px-3 py-3 font-semibold">{movementLabel(m.kind)}</td>
                  <td className={`px-3 py-3 text-right font-bold tabular-nums ${m.change < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>
                    {signedQty(m.change)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{m.balanceAfter}</td>
                  <td className="px-3 py-3 text-pos-soft">{m.reason ?? "—"}</td>
                  <td className="py-3 pl-3 pr-[18px] text-pos-soft">{m.by}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Card>
    </PageShell>
  );
}
