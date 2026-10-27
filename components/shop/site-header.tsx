import Image from "next/image";
import Link from "next/link";
import { BrandBand } from "@/components/ui/brand-band";
import { ChatIcon, MenuIcon } from "@/components/ui/icons";
import { buildCategoryTree } from "@/lib/categories";
import { getCategories, getSettings } from "@/lib/server/catalogue";
import { whatsappUrl } from "@/lib/whatsapp";
import { CartLink } from "./cart-link";
import { MenuDisclosure } from "./menu-disclosure";
import { SearchForm } from "./search-form";

export async function SiteHeader() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const tree = buildCategoryTree(categories);
  const chatUrl = whatsappUrl(settings.whatsapp_number);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      {settings.announcement && (
        <p className="bg-ink px-4 py-2 text-center text-sm text-white">{settings.announcement}</p>
      )}

      {/* How ordering works, in one line. Phones get it lower on the home page. */}
      <div className="hidden border-b border-line bg-white md:block">
        <div className="mx-auto flex min-h-11 max-w-7xl items-center justify-between gap-4 px-8 text-[13px] leading-[18px] text-ink-soft">
          <p className="flex flex-wrap gap-x-3">
            <span>Order on WhatsApp</span>
            <span aria-hidden="true">·</span>
            <span>Pay the owner directly</span>
            <span aria-hidden="true">·</span>
            <span>Delivery arranged in the chat</span>
          </p>
          <a href={chatUrl} className="flex min-h-11 items-center gap-1.5 font-semibold no-underline">
            <ChatIcon className="h-4 w-4" />
            Chat with us
          </a>
        </div>
      </div>

      <header className="bg-brand-green text-white lg:sticky lg:top-0 lg:z-30">
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-1 gap-y-1.5 px-1 pb-3 pt-1.5 md:gap-x-3 md:px-6 lg:h-[76px] lg:flex-nowrap lg:gap-x-6 lg:px-8 lg:py-0">
          <MenuDisclosure
            summary={
              <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg text-sm font-semibold hover:bg-white/10 md:border md:border-white/40 md:pl-2.5 md:pr-3.5 [&::-webkit-details-marker]:hidden">
                <MenuIcon className="h-6 w-6 md:h-[22px] md:w-[22px]" />
                <span className="sr-only md:not-sr-only">Menu</span>
              </summary>
            }
          >
            <nav
              aria-label="Categories"
              className="absolute inset-x-0 top-full z-40 max-h-[75vh] overflow-y-auto border-t border-white/20 bg-brand-green px-4 pb-6 pt-2 shadow-lg"
            >
              <ul className="mx-auto grid max-w-7xl gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                {tree.map((parent) => (
                  <li key={parent.id} className="border-b border-white/15 py-2 last:border-0 sm:border-0">
                    <Link
                      href={`/categories/${parent.slug}`}
                      className="flex min-h-11 items-center text-lg font-bold text-white no-underline hover:text-white hover:underline"
                    >
                      {parent.name}
                    </Link>
                    {parent.children.length > 0 && (
                      <ul>
                        {parent.children.map((child) => (
                          <li key={child.id}>
                            <Link
                              href={`/categories/${child.slug}`}
                              className="flex min-h-11 items-center pl-3 text-white/95 no-underline hover:text-white hover:underline"
                            >
                              {child.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                <li className="py-2 sm:col-span-2 lg:col-span-4">
                  <Link
                    href="/products"
                    className="flex min-h-11 items-center font-semibold text-white underline underline-offset-4 hover:text-white"
                  >
                    Browse all products
                  </Link>
                </li>
              </ul>
            </nav>
          </MenuDisclosure>

          <Link
            href="/"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded text-white no-underline hover:text-white md:gap-2.5"
            aria-label={`${settings.store_name} home`}
          >
            <Image
              src="/brand/logo.webp"
              alt=""
              width={44}
              height={44}
              unoptimized
              preload
              className="h-[34px] w-[34px] rounded-full bg-white md:h-11 md:w-11"
            />
            <span className="whitespace-nowrap font-display text-2xl leading-none md:text-[30px]">
              {settings.store_name}
            </span>
          </Link>

          <div className="order-last w-full px-2 md:px-0 lg:order-none lg:min-w-0 lg:flex-1">
            <SearchForm id="header-search" variant="header" />
          </div>

          <div className="ml-auto flex shrink-0 items-center md:gap-2 lg:ml-0">
            <a
              href={chatUrl}
              aria-label="Chat with us on WhatsApp"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white hover:bg-white/10 hover:text-white lg:hidden"
            >
              <ChatIcon className="h-[22px] w-[22px]" />
            </a>
            <CartLink />
          </div>
        </div>
        <BrandBand />
      </header>
    </>
  );
}
