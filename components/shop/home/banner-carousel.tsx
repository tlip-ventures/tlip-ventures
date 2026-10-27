"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

export type BannerSlide = {
  id: string;
  /** 1440 × 720 (2:1) artwork from Cloudinary; the same image on phones and computers. */
  imageUrl: string;
  /** Describes the artwork, including any words in it. */
  alt: string;
  /** Where a tap goes; null for a banner that is only a picture. */
  href: string | null;
};

const AUTOPLAY_MS = 7000;
// From 1280px: between the 236px category list and tiles (712px); below that, full width.
const SIZES = "(min-width: 1280px) 712px, (min-width: 768px) calc(100vw - 48px), calc(100vw - 24px)";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** True when the customer has asked their phone or computer for less motion. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => true);
}

/**
 * Home page banners, 2:1. Built on CSS scroll snapping, so swiping works on
 * touch screens (even before JavaScript loads); arrows and dots move between
 * slides. Plays slowly on its own, pausing while the pointer or keyboard focus
 * is on it, when paused with its button, and never with reduced motion.
 */
export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const count = slides.length;
  const multiple = count > 1;

  const goTo = useCallback(
    (i: number) => {
      const track = trackRef.current;
      if (!track) return;
      const next = (i + count) % count;
      track.scrollTo({ left: next * track.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [count, reducedMotion],
  );

  // Autoplay: the timer restarts after every move, including the customer's own.
  const playing = multiple && !reducedMotion && !stopped && !hovered && !focused;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") goTo(index + 1);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, index, goTo]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offers"
      className="relative self-start overflow-hidden rounded-xl bg-brand-green"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
        }}
        className="flex aspect-[2/1] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => {
          const image = (
            <Image
              src={slide.imageUrl}
              alt={slide.alt}
              fill
              sizes={SIZES}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              className="object-cover"
            />
          );
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              // Slides out of view can't be tabbed to.
              inert={i !== index}
              className="relative h-full w-full shrink-0 snap-start"
            >
              {slide.href ? (
                <Link href={slide.href} className="absolute inset-0 block">
                  {image}
                </Link>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>

      {multiple && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white md:flex"
          >
            <ChevronLeftIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next banner"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white md:flex"
          >
            <ChevronRightIcon className="h-[18px] w-[18px]" />
          </button>
          {/* Phones swipe, so the dots only show where you are; from 768px they are buttons. */}
          <div aria-hidden="true" className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-ink/35 px-1.5 py-1 md:hidden">
            {slides.map((slide, i) => (
              <span key={slide.id} className={`block h-[5px] rounded-full ${i === index ? "w-4 bg-white" : "w-[5px] bg-white/60"}`} />
            ))}
          </div>
          <div className="absolute bottom-2.5 left-1/2 hidden -translate-x-1/2 items-center rounded-full bg-ink/35 px-1 md:flex">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show banner ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className="flex h-8 w-7 items-center justify-center"
              >
                <span className={`block h-1.5 rounded-full ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
              </button>
            ))}
          </div>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setStopped((s) => !s)}
              aria-label={stopped ? "Play banners" : "Pause banners"}
              className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center md:bottom-1 md:right-1"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/45 text-white">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                  {stopped ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
                </svg>
              </span>
            </button>
          )}
        </>
      )}
    </section>
  );
}
