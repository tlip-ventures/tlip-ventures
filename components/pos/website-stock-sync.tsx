"use client";

import { setWebsiteStockSync } from "@/app/pos/(app)/settings/actions";
import { ActionDialog } from "./action-dialog";

/** Settings: switch the website's "in stock" over to the shelf count, or back. */
export function WebsiteStockSyncButton({ on, outOfStock, total }: { on: boolean; outOfStock: number; total: number }) {
  return on ? (
    <ActionDialog label="Switch off" title="Set website stock by hand again?" kind="outline" size="md" action={setWebsiteStockSync} submitLabel="Switch off" tone="danger">
      <input type="hidden" name="on" value="false" />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        Products keep showing as they are now, but sales and deliveries here stop changing the website. You would tick &ldquo;In stock&rdquo;
        by hand in the website admin again.
      </p>
    </ActionDialog>
  ) : (
    <ActionDialog label="Switch on" title="Show stock from this app on the website?" kind="primary" size="md" action={setWebsiteStockSync} submitLabel="Switch on">
      <input type="hidden" name="on" value="true" />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        Every product with nothing on the shelf shows as sold out on the website straight away:{" "}
        <strong className="text-pos-ink">
          {outOfStock.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
        </strong>{" "}
        items right now. Import your stock or record deliveries first.
      </p>
    </ActionDialog>
  );
}
