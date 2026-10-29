"use client";

import { useState } from "react";

/** Copies text to the clipboard, with a fallback for browsers without the Clipboard API. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (!ok) throw new Error("copy failed");
      }
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center rounded-lg border-2 border-brand-green px-4 font-semibold text-brand-green hover:bg-brand-green hover:text-white"
      >
        {label}
      </button>
      <span role="status" className="text-sm font-semibold">
        {state === "copied" && <span className="text-brand-green">Copied. Paste it into WhatsApp.</span>}
        {state === "failed" && <span className="text-red-700">Could not copy. Select the text below instead.</span>}
      </span>
    </div>
  );
}
