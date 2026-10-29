import Image from "next/image";
import { tileClass, tileCode } from "@/lib/pos/stock";

/**
 * The square in front of a product: its photo when it has one, otherwise its
 * code on the category's colour, as in the design.
 */
export function ProductTile({
  imageUrl,
  sku,
  name,
  category,
  size = 42,
}: {
  imageUrl: string | null;
  sku: string | null;
  name: string;
  category: string | null;
  size?: number;
}) {
  return (
    <span
      className={`relative flex flex-none items-center justify-center overflow-hidden rounded-md text-[10px] font-bold text-pos-forest ${tileClass(category)}`}
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={size} height={size} sizes={`${size}px`} className="h-full w-full object-contain mix-blend-multiply" />
      ) : (
        tileCode(sku, name)
      )}
    </span>
  );
}
