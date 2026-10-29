import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/server/admin";
import { signOut } from "../login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();

  return (
    <>
      <header className="bg-brand-green text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3">
          <Link href="/admin" className="inline-flex min-h-11 items-center font-heading text-lg font-bold text-white no-underline">
            Tlip Ventures admin
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {admin.email && <span className="hidden text-white/90 sm:inline">{admin.email}</span>}
            <Link href="/" className="inline-flex min-h-11 items-center text-white underline underline-offset-4">
              View shop
            </Link>
            <form action={signOut}>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-white/60 px-3 font-semibold hover:bg-white/10">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <AdminNav />
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">
        {children}
      </main>
    </>
  );
}
