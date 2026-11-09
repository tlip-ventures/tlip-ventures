import { Sidebar } from "@/components/pos/sidebar";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getDeliverySummary } from "@/lib/server/pos/deliveries";
import { countNeedingAttention } from "@/lib/server/pos/stock";
import { signOut } from "../login/actions";

export default async function PosAppLayout({ children }: LayoutProps<"/pos">) {
  const user = await requirePosUser();
  const [attention, deliveries] = await Promise.all([countNeedingAttention(), getDeliverySummary()]);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar name={user.name} isOwner={user.isOwner} attention={attention} deliveries={deliveries.toDeliver + deliveries.out} signOut={signOut} />
      {children}
    </div>
  );
}
