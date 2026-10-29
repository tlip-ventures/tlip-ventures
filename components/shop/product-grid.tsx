import { getNewestProductIds, type ProductCardData } from "@/lib/server/catalogue";
import { PRODUCT_GRID_CLASS, ProductCard } from "./product-card";

type GridProps = {
  products: ProductCardData[];
  sizes?: string;
};

/** A grid of product cards; the shop's newest products get a "New" badge. */
export async function ProductGrid({ products, sizes }: GridProps) {
  const newest = await getNewestProductIds();
  return (
    <ul className={PRODUCT_GRID_CLASS}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} isNew={newest.has(product.id)} sizes={sizes} />
        </li>
      ))}
    </ul>
  );
}
