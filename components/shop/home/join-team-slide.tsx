import Image from "next/image";
import { ChatIcon } from "@/components/ui/icons";

/** Opens the shop's WhatsApp with this message ready to send. */
export const JOIN_TEAM_MESSAGE = "Hi Tlip Ventures, I'd like to join your team. My name is ";

/**
 * "Join our team" slide in the home page banner: dark green, with a WhatsApp
 * button that opens a ready-made message to the shop.
 */
export function JoinTeamSlide({ applyUrl }: { applyUrl: string }) {
  return (
    <div className="relative grid h-full w-full grid-cols-[1.2fr_0.8fr] overflow-hidden bg-brand-green-dark text-white">
      <div className="flex flex-col justify-center gap-2 py-4 pl-4 pr-1 sm:gap-3 md:gap-4 md:py-9 md:pl-10">
        {/* Gold on dark green only (brand rule). */}
        <p className="text-[10px] font-bold uppercase leading-3 tracking-[0.14em] text-brand-gold sm:text-xs sm:leading-4">
          We’re hiring
        </p>
        <p className="font-display text-[23px] leading-[0.98] tracking-[-0.01em] sm:text-4xl md:text-[46px] md:tracking-[-0.02em]">
          Join the Tlip Ventures <em>team.</em>
        </p>
        <p className="hidden max-w-sm text-sm leading-5 text-on-dark-soft sm:block md:text-base md:leading-6">
          Love home and kitchen goods? Tell us about yourself on WhatsApp.
        </p>
        <a
          href={applyUrl}
          className="inline-flex min-h-9 items-center gap-2 self-start rounded-lg bg-brand-orange-dark px-3.5 text-[13px] font-bold text-white no-underline hover:bg-brand-orange-deep hover:text-white md:min-h-11 md:px-5 md:text-sm"
        >
          <ChatIcon className="h-4 w-4" />
          Join our team
        </a>
      </div>
      {/* The round logo on a lighter circle, cut off at the right like a shop sign. */}
      <div aria-hidden="true" className="relative">
        <div className="absolute left-[8%] top-1/2 aspect-square w-[118%] -translate-y-1/2 rounded-full bg-brand-green" />
        <div className="absolute left-[20%] top-1/2 aspect-square w-[70%] -translate-y-1/2 rounded-full bg-white p-[4%] shadow-lg">
          <Image src="/brand/logo.png" alt="" width={512} height={512} unoptimized className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
