import Image from "next/image";
import Link from "next/link";
import type { BannerSlide } from "@/lib/server/catalogue";

// From 1280px: between the 236px category list and tiles (712px); below that, full width.
const SIZES = "(min-width: 1280px) 712px, (min-width: 768px) calc(100vw - 48px), calc(100vw - 24px)";

/** A banner uploaded in admin: 2:1 artwork, linking where the admin chose. */
export function ImageBanner({ banner, first }: { banner: BannerSlide; first: boolean }) {
  const image = (
    <Image
      src={banner.imageUrl}
      alt={banner.alt}
      fill
      sizes={SIZES}
      loading={first ? "eager" : "lazy"}
      fetchPriority={first ? "high" : undefined}
      className="object-cover"
    />
  );
  return banner.href ? (
    <Link href={banner.href} className="absolute inset-0 block">
      {image}
    </Link>
  ) : (
    image
  );
}
