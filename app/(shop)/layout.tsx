import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";

// Shop pages are cached and refreshed in the background after 10 minutes, or at
// once when the admin saves a change. Same value as CATALOGUE_REVALIDATE
// (lib/supabase/public.ts); it must be a literal here.
export const revalidate = 600;

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
