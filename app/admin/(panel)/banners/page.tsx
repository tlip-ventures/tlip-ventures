import type { Metadata } from "next";
import { BannerManager } from "@/components/admin/banner-manager";
import { BANNER_HEIGHT, BANNER_WIDTH, MAX_ACTIVE_BANNERS } from "@/lib/banners";
import { requireAdmin } from "@/lib/server/admin";
import { uploadsEnabled } from "@/lib/server/cloudinary-upload";

export const metadata: Metadata = { title: "Banners" };

export default async function BannersAdminPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("banners")
    .select("id, image_url, public_id, alt, link_url, is_active")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(`Could not load banners: ${error.message}`);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-brand-green">Home page banners</h1>
        <p className="max-w-2xl">
          The home page shows up to {MAX_ACTIVE_BANNERS} switched-on banners, in this order, sliding slowly from one to the
          next. Make the artwork {BANNER_WIDTH} × {BANNER_HEIGHT} pixels. Phones show the same image smaller, so keep words
          large and away from the edges.
        </p>
      </div>
      <BannerManager
        banners={data.map((b) => ({
          id: b.id,
          imageUrl: b.image_url,
          publicId: b.public_id,
          alt: b.alt,
          linkUrl: b.link_url,
          isActive: b.is_active,
        }))}
        uploadsEnabled={uploadsEnabled()}
      />
    </div>
  );
}
