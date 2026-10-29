import Image from "next/image";
import type { ProductImage as ProductImageData } from "@/lib/server/catalogue";

type Props = {
  image: ProductImageData | null;
  /** Passed to next/image so phones download a small file. */
  sizes: string;
  /** Load straight away: only for the main image above the fold. */
  eager?: boolean;
};

/** Square product photo from Cloudinary, or a "Photo coming soon" tile when there is none yet. */
export function ProductImage({ image, sizes, eager = false }: Props) {
  if (!image) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-tint-green p-3 text-center text-xs font-semibold leading-4 text-brand-green">
        <Image src="/brand/logo.webp" alt="" width={44} height={44} unoptimized className="h-9 w-9 opacity-90 md:h-11 md:w-11" />
        Photo coming soon
      </div>
    );
  }
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-well">
      <Image
        src={image.url}
        alt={image.alt}
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        // Multiply blends a photo's white background into the grey well.
        className="object-contain mix-blend-multiply"
      />
    </div>
  );
}
