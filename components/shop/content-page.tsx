import type { ReactNode } from "react";
import { Breadcrumbs } from "./listing-controls";

/** Layout for text pages (how to order, about, privacy): readable line length, simple prose styles. */
export function ContentPage({ title, path, intro, children }: { title: string; path: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-4">
      <Breadcrumbs
        trail={[
          { name: "Home", href: "/" },
          { name: title, href: path },
        ]}
      />
      <h1 className="text-3xl font-bold text-brand-green">{title}</h1>
      {intro && <div className="text-lg leading-relaxed">{intro}</div>}
      <div className="space-y-8 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-brand-green [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_p]:mt-2 [&_section>*:first-child]:mt-0 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        {children}
      </div>
    </div>
  );
}

/** A big WhatsApp chat button for content pages. */
export function WhatsAppButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-5 text-base font-bold text-white no-underline hover:bg-brand-orange-deep"
    >
      {children}
    </a>
  );
}
