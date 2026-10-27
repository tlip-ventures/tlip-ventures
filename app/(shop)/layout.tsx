import { BottomBar } from "@/components/shop/bottom-bar";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { getSettings } from "@/lib/server/catalogue";
import { whatsappUrl } from "@/lib/whatsapp";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings();
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <BottomBar chatUrl={whatsappUrl(settings.whatsapp_number)} />
    </>
  );
}
