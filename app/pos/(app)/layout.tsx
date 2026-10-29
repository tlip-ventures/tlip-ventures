import { Sidebar } from "@/components/pos/sidebar";
import { requirePosUser } from "@/lib/server/pos/auth";
import { countNeedingAttention } from "@/lib/server/pos/stock";
import { signOut } from "../login/actions";

export default async function PosAppLayout({ children }: LayoutProps<"/pos">) {
  const user = await requirePosUser();
  const attention = await countNeedingAttention();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar name={user.name} isOwner={user.isOwner} attention={attention} signOut={signOut} />
      {children}
    </div>
  );
}
