import Link from "next/link";

const STEPS = [
  "Add what you like to your cart and see your total.",
  "Send the cart to us as a ready-made WhatsApp message.",
  "Pay Tlip Ventures directly, then confirm your delivery details with us on WhatsApp.",
];

/** Dark green "How ordering works" panel: no card, no account, just WhatsApp. */
export function HowOrdering() {
  return (
    <section
      aria-labelledby="how-ordering-heading"
      className="mx-3 grid gap-3.5 rounded-xl bg-brand-green-dark p-5 text-white md:mx-0 md:gap-6 md:p-8 lg:grid-cols-[minmax(240px,1fr)_minmax(0,3fr)] lg:items-center"
    >
      <div className="space-y-1.5">
        <h2 id="how-ordering-heading" className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold md:text-xs">
          How ordering works
        </h2>
        <p className="font-display text-[30px] leading-none md:text-[34px] md:leading-[1.02]">
          No card, no account. <em>Just WhatsApp.</em>
        </p>
        <Link
          href="/how-to-order"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-on-dark-soft underline underline-offset-4 hover:text-white"
        >
          More about ordering
        </Link>
      </div>
      <ol className="grid gap-2.5 md:grid-cols-3 md:gap-6">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-3 md:gap-3.5">
            <span aria-hidden="true" className="font-bold text-brand-gold md:font-display md:text-[34px] md:font-normal md:leading-none">
              {i + 1}
            </span>
            <span className="text-sm leading-5 text-on-dark-soft md:text-[15px] md:leading-[22px]">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
