import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/shop/category-icon";
import { BannerCarousel } from "@/components/shop/home/banner-carousel";
import { CategoryCirclesDesktop, CategoryCirclesPhone } from "@/components/shop/home/category-circles";
import { DefaultBanner } from "@/components/shop/home/default-banner";
import { HowOrdering } from "@/components/shop/home/how-ordering";
import { ProductSection } from "@/components/shop/home/product-section";
import { RecentlyViewed } from "@/components/shop/home/recently-viewed";
import { ChatIcon } from "@/components/ui/icons";
import { JsonLd } from "@/components/ui/json-ld";
import { buildCategoryTree, categoryAndChildIds, type Category } from "@/lib/categories";
import { listingQuery, PRICE_RANGES } from "@/lib/listing";
import { getActiveBanners, getCategories, getSettings, listProducts, NEW_BADGE_COUNT } from "@/lib/server/catalogue";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE_URL } from "@/lib/site";
import { storeJsonLd } from "@/lib/structured-data";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Home & kitchen goods in Ghana",
    description:
      "Blenders, kettles, cookware, storage, laundry and more for homes in Ghana. Browse online and order on WhatsApp.",
    path: "/",
  }),
  title: { absolute: "Tlip Ventures — Home & Kitchen Goods in Ghana" },
};

/** Categories with their own row of products on the home page, in this order. */
const FEATURED_CATEGORY_SLUGS = ["kitchen-appliances", "cooking-baking"];
const SECTION_SIZE = 6;

/** "Blenders, juicers, food processors and more", from a category's first subcategories. */
function categorySubtitle(categories: Category[], category: Category): string | undefined {
  const children = categories.filter((c) => c.parent_id === category.id).sort((a, b) => a.sort_order - b.sort_order);
  if (children.length === 0) return undefined;
  const names = children.slice(0, 3).map((c, i) => (i === 0 ? c.name : c.name.toLowerCase()));
  return children.length > 3 ? `${names.join(", ")} and more` : names.join(", ");
}

export default async function HomePage() {
  const [settings, categories, banners, deals, newest, featured] = await Promise.all([
    getSettings(),
    getCategories(),
    getActiveBanners(),
    listProducts({ deals: true, pageSize: SECTION_SIZE }),
    listProducts({ pageSize: NEW_BADGE_COUNT }),
    listProducts({ featured: true, pageSize: SECTION_SIZE }),
  ]);
  const topCategories = buildCategoryTree(categories);
  const categoryRows = await Promise.all(
    FEATURED_CATEGORY_SLUGS.flatMap((slug) => {
      const category = categories.find((c) => c.slug === slug && c.parent_id === null);
      if (!category) return [];
      return [
        listProducts({ categoryIds: categoryAndChildIds(categories, category), pageSize: SECTION_SIZE }).then((page) => ({
          category,
          products: page?.products ?? [],
        })),
      ];
    }),
  );
  const chatUrl = whatsappUrl(settings.whatsapp_number);

  return (
    <div className="flex-1 bg-page">
      <JsonLd
        data={storeJsonLd({
          name: settings.store_name,
          url: SITE_URL,
          logo: absoluteUrl("/brand/logo.png"),
          whatsappNumber: settings.whatsapp_number,
          email: settings.contact_email,
          address: settings.shop_address,
          socialLinks: Object.values(settings.social_links),
        })}
      />
      <h1 className="sr-only">{settings.store_name}: quality home and kitchen goods in Ghana</h1>

      <div className="mx-auto flex max-w-7xl flex-col gap-3 pb-6 pt-3 md:gap-5 md:px-6 md:pb-14 md:pt-5 lg:px-8">
        <CategoryCirclesPhone categories={topCategories} />

        {/* Hero row: category list · banner · two tiles. The list and tiles show from 1280px, where the banner column is 712px (2:1 with them). */}
        <div className="grid gap-4 px-3 md:px-0 xl:grid-cols-[236px_minmax(0,1fr)_236px]">
          <nav aria-label="Shop by category" className="hidden flex-col rounded-xl bg-white p-2 xl:flex">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-tint-green hover:text-brand-green"
              >
                <CategoryIcon slug={category.slug} className="h-5 w-5 shrink-0" />
                {category.name}
              </Link>
            ))}
            <Link
              href="/deals"
              className="flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-sm font-semibold text-brand-orange-dark no-underline hover:bg-tint-orange hover:text-brand-orange-deep"
            >
              <CategoryIcon slug="deals" className="h-5 w-5 shrink-0" />
              Deals
            </Link>
          </nav>

          {banners.length > 0 ? <BannerCarousel slides={banners} /> : <DefaultBanner />}

          <div className="hidden flex-col gap-4 xl:flex">
            <section aria-labelledby="steps-heading" className="flex flex-1 flex-col gap-3 rounded-xl bg-white p-5">
              <h2 id="steps-heading" className="text-base font-bold leading-[22px] text-ink">
                Order in 3 steps
              </h2>
              <ol className="flex flex-col gap-2.5 text-[13px] leading-[18px] text-ink-soft">
                {["Add items and see your total", "Send your cart on WhatsApp", "Pay the owner, arrange delivery"].map(
                  (step, i) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tint-green text-xs font-bold text-brand-green"
                      >
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ),
                )}
              </ol>
            </section>
            <section aria-labelledby="chat-heading" className="flex flex-1 flex-col justify-between gap-3 rounded-xl bg-white p-5">
              <div className="space-y-1">
                <h2 id="chat-heading" className="text-base font-bold leading-[22px] text-ink">
                  Chat with the shop
                </h2>
                <p className="text-[13px] leading-[18px] text-ink-soft">Ask about a product, stock or delivery before you order.</p>
              </div>
              <a
                href={chatUrl}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-orange-dark px-3 text-sm font-bold text-white no-underline hover:bg-brand-orange-deep hover:text-white"
              >
                <ChatIcon className="h-4 w-4" />
                Message us on WhatsApp
              </a>
            </section>
          </div>
        </div>

        {/* Category circles (from 768px) and the price chips. */}
        <section aria-label="Shop by category and price" className="md:space-y-5 md:rounded-xl md:bg-white md:p-6">
          <CategoryCirclesDesktop categories={topCategories} />
          <nav
            aria-labelledby="price-heading"
            className="flex items-center gap-2 overflow-x-auto whitespace-nowrap px-3 [scrollbar-width:none] md:flex-wrap md:gap-2.5 md:border-t md:border-line-soft md:px-0 md:pt-4 [&::-webkit-scrollbar]:hidden"
          >
            <h2 id="price-heading" className="sr-only text-sm font-bold text-ink md:not-sr-only md:mr-1.5">
              Shop by price
            </h2>
            {PRICE_RANGES.map((range) => (
              <Link
                key={range.label}
                href={`/products${listingQuery({ min: range.min, max: range.max })}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-chip bg-white px-3.5 text-[13px] text-ink no-underline hover:border-brand-green hover:text-ink md:px-4 md:text-sm"
              >
                {range.label}
              </Link>
            ))}
          </nav>
        </section>

        <ProductSection
          id="deals"
          title="Deals of the week"
          subtitle="Prices we have marked down"
          seeAllHref="/deals"
          products={deals?.products ?? []}
          phoneLayout="rail"
          tone="deals"
        />
        <ProductSection
          id="new"
          title="New arrivals"
          subtitle="Just in at the shop"
          seeAllHref="/products"
          products={newest?.products ?? []}
          phoneLayout="grid"
        />
        <ProductSection
          id="featured"
          title="Featured"
          subtitle="Picked by the shop"
          seeAllHref="/products"
          products={featured?.products ?? []}
          phoneLayout="rail"
        />
        {categoryRows.map(({ category, products }) => (
          <ProductSection
            key={category.id}
            id={category.slug}
            title={category.name}
            subtitle={categorySubtitle(categories, category)}
            seeAllHref={`/categories/${category.slug}`}
            products={products}
            phoneLayout="rail"
          />
        ))}

        <HowOrdering />
        <RecentlyViewed />
      </div>
    </div>
  );
}
