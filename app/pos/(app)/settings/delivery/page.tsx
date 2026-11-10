import type { Metadata } from "next";
import { AddDeliveryAreaForm, DeliveryAreaList, DeliveryPricingForm } from "@/components/pos/delivery-settings";
import { ButtonLink, Card, PageHeader, PageShell } from "@/components/pos/ui";
import { deliveryFeeForKm, describePricing, formatKm } from "@/lib/delivery";
import { formatPesewas } from "@/lib/money";
import { plural } from "@/lib/pos/format";
import { requireOwner } from "@/lib/server/pos/auth";
import { loadDeliveryPriceList } from "@/lib/server/pos/delivery";

export const metadata: Metadata = { title: "Delivery prices" };

const EXAMPLES = [1, 3, 6, 10, 17, 25, 40];

export default async function DeliveryPricesPage() {
  const { supabase } = await requireOwner();
  const { pricing, shop, areas } = await loadDeliveryPriceList(supabase, { all: true });
  const inUse = areas.filter((a) => a.isActive).length;

  return (
    <PageShell>
      <PageHeader eyebrow="Settings" title="Delivery prices.">
        <ButtonLink href="/pos/settings" kind="outline">
          Back to settings
        </ButtonLink>
      </PageHeader>

      <Card label="The formula">
        <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">The formula</h2>
          <span className="max-w-[720px] text-[13px] leading-[19px] text-pos-muted">
            The fee depends only on the road distance from the shop. {describePricing(pricing)}
            {pricing.freeFrom !== null &&
              ` Orders of ${formatPesewas(pricing.freeFrom)} or more get ${formatPesewas(pricing.freeOff)} off delivery.`}{" "}
            At the till the fee fills itself in when an area is picked; staff can still type a different one.
          </span>
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums text-pos-soft">
            {EXAMPLES.map((km) => {
              const f = deliveryFeeForKm(km, pricing);
              return (
                <span key={km}>
                  {formatKm(km)}: <strong className="text-pos-ink">{f === null ? "WhatsApp" : formatPesewas(f)}</strong>
                </span>
              );
            })}
          </span>
        </div>
        <div className="p-5">
          <DeliveryPricingForm pricing={pricing} shop={shop} />
        </div>
      </Card>

      <Card label="Add an area">
        <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Add an area</h2>
          <span className="text-[13px] text-pos-muted">
            Find it on the map to measure the road from the shop, or type the km from Google Maps directions. Staff can also add places they find at the till.
          </span>
        </div>
        <div className="p-5">
          <AddDeliveryAreaForm pricing={pricing} />
        </div>
      </Card>

      <Card label="Areas">
        <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Areas</h2>
          <span className="text-[13px] text-pos-muted">
            {plural(inUse, "area")} on the list, nearest first, with the road km from the shop and today&apos;s fee. Untick “On the list” to hide one at the till.
          </span>
        </div>
        <DeliveryAreaList areas={areas} pricing={pricing} />
      </Card>
    </PageShell>
  );
}
