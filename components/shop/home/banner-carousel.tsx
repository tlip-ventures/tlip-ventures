"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

/** One slide: an uploaded banner, the green welcome panel or "Join our team", rendered on the server. */
export type CarouselSlide = { id: string; content: ReactNode };

const AUTOPLAY_MS = 7000;
const controlClass =
  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-white hover:text-ink";

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
 * touch screens (even before JavaScript loads); the arrows and dots under the
 * slides move between them. Plays slowly on its own, pausing while the pointer or keyboard focus
 * is on it, when paused with its button, and never with reduced motion.
 */
export function BannerCarousel({ slides }: { slides: CarouselSlide[] }) {
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
      className="self-start"
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
        className="flex aspect-[2/1] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl bg-brand-green [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            // Slides out of view can't be tabbed to.
            inert={i !== index}
            className="relative h-full w-full shrink-0 snap-start"
          >
            {slide.content}
          </div>
        ))}
      </div>

      {/* Controls sit under the slides, so they never cover a slide's words or products. */}
      {multiple && (
        <div className="mt-1.5 flex items-center justify-center text-ink-soft">
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous banner" className={controlClass}>
            <ChevronLeftIcon className="h-[18px] w-[18px]" />
          </button>
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show banner ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className="flex h-11 w-8 cursor-pointer items-center justify-center"
            >
              <span className={`block h-1.5 rounded-full ${i === index ? "w-5 bg-brand-green" : "w-1.5 bg-chip"}`} />
            </button>
          ))}
          <button type="button" onClick={() => goTo(index + 1)} aria-label="Next banner" className={controlClass}>
            <ChevronRightIcon className="h-[18px] w-[18px]" />
          </button>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setStopped((s) => !s)}
              aria-label={stopped ? "Play banners" : "Pause banners"}
              className={controlClass}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                {stopped ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
              </svg>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
