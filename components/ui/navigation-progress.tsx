"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const currentUrl = () => `${window.location.pathname}${window.location.search}`;

/**
 * A thin bar at the top of the screen while the next page loads, so taps feel
 * answered on slow mobile data. Pages render on the server and have no
 * loading.tsx (that would turn 404s into 200s), so this is the only feedback.
 * The bar shows from a link click or GET form submit until the URL changes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = `${pathname}${search ? `?${search}` : ""}`;
  // The URL the navigation started from; the bar shows only while we are still on it.
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const active = startedFrom !== null && startedFrom === url;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      setStartedFrom(currentUrl());
      clearTimeout(timer);
      // Give up after a while (failed or cancelled navigation).
      timer = setTimeout(() => setStartedFrom(null), 15_000);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      // Links that open something on the page instead of navigating (the category menu).
      if (link.hasAttribute("data-no-progress")) return;
      const to = new URL(link.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (`${to.pathname}${to.search}` === currentUrl()) return; // same page or #hash
      start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      // GET forms (search) navigate; POST forms are server actions with their own pending state.
      if (!event.defaultPrevented && form.method.toLowerCase() === "get") start();
    };
    // Capture phase: Next's <Link> and <Form> call preventDefault() to navigate
    // client-side, so by the bubbling phase every click would look cancelled.
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      clearTimeout(timer);
    };
  }, []);

  if (!active) return null;
  return (
    <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-brand-gold/30">
      <div className="h-full w-1/3 animate-[nav-progress_1.2s_ease-in-out_infinite] bg-brand-gold motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  );
}
