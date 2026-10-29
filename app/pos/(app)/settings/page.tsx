import type { Metadata } from "next";
import { ExternalIcon } from "@/components/pos/icons";
import { AddStaffForm, PersonForm } from "@/components/pos/people-forms";
import { ButtonLink, Card, PageHeader, PageShell } from "@/components/pos/ui";
import { formatDay } from "@/lib/pos/format";
import { requireOwner } from "@/lib/server/pos/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.rpc("pos_list_users");
  if (error) throw new Error(`Could not load people: ${error.message}`);

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
