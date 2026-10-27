import Image from "next/image";
import Link from "next/link";

/** The home page banner when no promotional banner is switched on. */
export function DefaultBanner() {
  return (
    <section
      aria-label="Welcome"
      className="relative grid aspect-[2/1] w-full self-start grid-cols-[1.2fr_0.8fr] overflow-hidden rounded-xl bg-brand-green text-white"
    >
      <div className="flex flex-col justify-center gap-2 py-4 pl-4 pr-1 sm:gap-3 md:gap-4 md:py-9 md:pl-10">
        <p className="text-[10px] font-bold uppercase leading-3 tracking-[0.14em] text-white/90 sm:text-xs sm:leading-4">
          Order on WhatsApp
        </p>
        <p className="font-display text-[23px] leading-[0.98] tracking-[-0.01em] sm:text-4xl md:text-[46px] md:tracking-[-0.02em]">
          Quality home and kitchen goods <em>in Ghana.</em>
        </p>
        <Link
          href="/products"
          className="inline-flex min-h-9 items-center self-start rounded-lg bg-white px-3.5 text-[13px] font-bold text-brand-green no-underline hover:bg-tint-green hover:text-brand-green-dark md:min-h-11 md:px-5 md:text-sm"
        >
          Shop now
        </Link>
      </div>
      {/* The round logo on a darker circle, cut off at the right like a shop sign. */}
      <div aria-hidden="true" className="relative">
        <div className="absolute left-[8%] top-1/2 aspect-square w-[118%] -translate-y-1/2 rounded-full bg-brand-green-dark" />
        <div className="absolute left-[20%] top-1/2 aspect-square w-[70%] -translate-y-1/2 rounded-full bg-white p-[4%] shadow-lg">
          <Image src="/brand/logo.png" alt="" width={512} height={512} unoptimized preload className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}
