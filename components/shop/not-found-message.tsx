import Link from "next/link";

export function NotFoundMessage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-brand-green">Page not found</h1>
      <p className="max-w-md">This product or page may have moved or is no longer available.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-5 text-base font-bold text-white no-underline hover:bg-brand-orange-deep"
        >
          Browse products
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center px-3 font-semibold">
          Go to the home page
        </Link>
      </div>
    </section>
  );
}
