import Link from "next/link";
import { BrandBand } from "@/components/ui/brand-band";
import { socialLabel } from "@/lib/admin-forms";
import { buildCategoryTree } from "@/lib/categories";
import { formatGhanaPhone } from "@/lib/phone";
import { getCategories, getSettings } from "@/lib/server/catalogue";
import { whatsappUrl } from "@/lib/whatsapp";
import { ReplyPromise } from "./reply-promise";

const linkClass = "flex min-h-11 items-center text-sm text-on-dark no-underline hover:text-white hover:underline";
const headingClass = "text-xs font-bold uppercase tracking-[0.14em] text-brand-gold";

export async function SiteFooter() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const topCategories = buildCategoryTree(categories);
  const socials = Object.entries(settings.social_links);
  // "Tlip Ventures" → "Tlip" + italic "Ventures", as in the logo lettering.
  const [firstWord, ...otherWords] = settings.store_name.split(" ");

  return (
    <footer className="mt-auto bg-brand-green-dark text-white">
      <BrandBand />
      {/* On phones the bottom padding also clears the fixed bottom bar (components/shop/bottom-bar.tsx). */}
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-8 md:gap-10 md:px-8 md:pb-7 md:pt-14">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] md:gap-10">
          <div className="col-span-2 space-y-3 md:col-span-1">
            <p className="font-display text-[32px] leading-none md:text-[34px]">
              {firstWord}
              {otherWords.length > 0 && (
                <>
                  {" "}
                  {/* Large text, so #e8641e on dark green passes (3.8:1). */}
                  <em className="text-brand-orange">{otherWords.join(" ")}</em>
                </>
              )}
            </p>
            <p className="max-w-72 text-sm leading-[22px] text-on-dark">
              Home and kitchen goods for Ghanaian homes. Ordered on WhatsApp, paid to the owner, delivered by
              arrangement.
            </p>
            {settings.tagline && <p className="text-sm text-on-dark">{settings.tagline}</p>}
          </div>

          <nav aria-labelledby="footer-shop" className="space-y-1">
            <h2 id="footer-shop" className={headingClass}>
              Shop
            </h2>
            <ul>
              <li>
                <Link href="/products" className={linkClass}>
                  All products
                </Link>
              </li>
              {topCategories.map((category) => (
                <li key={category.id}>
                  <Link href={`/categories/${category.slug}`} className={linkClass}>
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-help" className="space-y-1">
            <h2 id="footer-help" className={headingClass}>
              Help
            </h2>
            <ul>
              <li>
                <Link href="/how-to-order" className={linkClass}>
                  How ordering works
                </Link>
              </li>
              <li>
                <a href={whatsappUrl(settings.whatsapp_number)} className={linkClass}>
                  Chat on WhatsApp
                </a>
              </li>
              <li>
                <Link href="/wishlist" className={linkClass}>
                  Your wishlist
                </Link>
              </li>
              <li>
                <Link href="/about" className={linkClass}>
                  About and contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={linkClass}>
                  Privacy
                </Link>
              </li>
            </ul>
          </nav>

          <div className="col-span-2 space-y-1 text-sm text-on-dark md:col-span-1">
            <h2 className={headingClass}>Visit or call</h2>
            <div className="space-y-2 pt-2">
              {settings.shop_address && <p className="whitespace-pre-line">{settings.shop_address}</p>}
              {settings.opening_hours && <p className="whitespace-pre-line">{settings.opening_hours}</p>}
              <p>
                WhatsApp:{" "}
                <a
                  href={whatsappUrl(settings.whatsapp_number)}
                  className="inline-flex min-h-11 items-center font-semibold text-white underline underline-offset-4 hover:text-white"
                >
                  {formatGhanaPhone(settings.whatsapp_number)}
                </a>
              </p>
              <ReplyPromise settings={settings} variant="plain" />
              {settings.contact_email && (
                <p>
                  Email:{" "}
                  <a
                    href={`mailto:${settings.contact_email}`}
                    className="inline-flex min-h-11 items-center break-all font-semibold text-white underline underline-offset-4 hover:text-white"
                  >
                    {settings.contact_email}
                  </a>
                </p>
              )}
            </div>
            {socials.length > 0 && (
              <ul>
                {socials.map(([name, url]) => (
                  <li key={name}>
                    <a href={url} rel="noopener noreferrer" className={linkClass}>
                      {socialLabel(name)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-[#2c5a47] pt-4 text-xs leading-[18px] text-on-dark md:pt-5 md:text-[13px]">
          <p>
            © {new Date().getFullYear()} {settings.store_name}
          </p>
          <p>All prices in Ghana cedis (GH₵)</p>
        </div>
      </div>
    </footer>
  );
}
