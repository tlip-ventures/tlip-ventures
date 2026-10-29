import type { Metadata } from "next";
import { ExternalIcon } from "@/components/pos/icons";
import { AddStaffForm, PersonForm } from "@/components/pos/people-forms";
import { ReceiptFooterForm } from "@/components/pos/receipt-footer-form";
import { ButtonLink, Card, PageHeader, PageShell, Pill } from "@/components/pos/ui";
import { WebsiteStockSyncButton } from "@/components/pos/website-stock-sync";
import { formatDay } from "@/lib/pos/format";
import { requireOwner } from "@/lib/server/pos/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, userId } = await requireOwner();
  const [{ data, error }, settings, all, empty] = await Promise.all([
    supabase.rpc("pos_list_users"),
    supabase.from("settings").select("website_stock_sync, receipt_footer").eq("id", 1).single(),
    supabase.from("stock_levels").select("variant_id", { count: "exact", head: true }),
    supabase.from("stock_levels").select("variant_id", { count: "exact", head: true }).lte("on_hand", 0),
  ]);
  if (error) throw new Error(`Could not load people: ${error.message}`);
  if (settings.error) throw new Error(`Could not load settings: ${settings.error.message}`);
  const syncOn = settings.data.website_stock_sync;

  return (
    <PageShell>
      <PageHeader eyebrow="Settings" title="People and settings.">
        <ButtonLink href="/admin/settings" kind="outline">
          <ExternalIcon />
          <span>Website settings</span>
        </ButtonLink>
      </PageHeader>

      <Card label="People">
        <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Who can use the app</h2>
          <span className="text-[13px] text-pos-muted">
            Staff can sell and see stock. Switch on what else each person may do. Only you see profit, costs and supplier bills.
          </span>
        </div>
        <ul className="m-0 list-none p-0">
          {data.map((p) => (
            <li key={p.user_id} className={`border-b border-pos-paper-deep px-5 py-4 last:border-b-0 ${p.is_active ? "" : "bg-pos-row-hover"}`}>
              <PersonForm
                isSelf={p.user_id === userId}
                person={{
                  userId: p.user_id,
                  email: p.email,
                  displayName: p.display_name,
                  role: p.role,
                  isActive: p.is_active,
                  canGiveDiscounts: p.can_give_discounts,
                  canAdjustStock: p.can_adjust_stock,
                  lastSignIn: p.last_sign_in_at ? formatDay(p.last_sign_in_at) : null,
                }}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card label="Website stock">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex max-w-[640px] flex-col gap-1">
            <h2 className="m-0 flex flex-wrap items-center gap-2 text-lg font-bold leading-6">
              Website stock from this app
              <Pill className={syncOn ? "bg-pos-tint-green text-pos-green-ink" : "bg-pos-paper-deep text-pos-soft"}>{syncOn ? "On" : "Off"}</Pill>
            </h2>
            <span className="text-[13px] leading-[19px] text-pos-muted">
              {syncOn
                ? "The website shows a product as in stock while there is at least one on the shelf here. Sales, deliveries and counts update it straight away."
                : "Off: you tick “In stock” by hand in the website admin. Switch it on once your stock is imported, so the website follows the shelf count."}{" "}
              Website orders arrive as Ordered sales either way; Mark as paid takes them off the shelf.
            </span>
          </div>
          <WebsiteStockSyncButton on={syncOn} outOfStock={empty.count ?? 0} total={all.count ?? 0} />
        </div>
      </Card>

      <Card label="Receipts">
        <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Receipts</h2>
          <span className="text-[13px] text-pos-muted">The shop name, address and WhatsApp number on receipts come from the website settings.</span>
        </div>
        <div className="max-w-[640px] p-5">
          <ReceiptFooterForm footer={settings.data.receipt_footer} />
        </div>
      </Card>

      <Card label="Add a staff member">
        <div className="flex flex-col gap-1 border-b border-pos-paper-deep px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Add a staff member</h2>
          <span className="text-[13px] text-pos-muted">They sign in at this same address. Tell them their password; they can&apos;t open the website admin.</span>
        </div>
        <div className="p-5">
          <AddStaffForm />
        </div>
      </Card>
    </PageShell>
  );
}
