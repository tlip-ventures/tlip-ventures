"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ShopError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-brand-green">Something went wrong</h1>
      <p className="max-w-md">We could not load this page. Please check your connection and try again.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-5 text-base font-bold text-white hover:bg-brand-orange-deep"
        >
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center px-3 font-semibold">
          Go to the home page
        </Link>
      </div>
    </section>
  );
}
