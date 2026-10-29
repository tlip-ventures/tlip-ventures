import { NotFoundMessage } from "@/components/shop/not-found-message";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";

// URLs that match no route. These skip the (shop) layout, so add the header and footer here.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <NotFoundMessage />
      </main>
      <SiteFooter />
    </>
  );
}
