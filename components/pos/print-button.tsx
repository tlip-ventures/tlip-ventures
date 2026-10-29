"use client";

import { buttonClass } from "./ui";

/** Opens the browser's print dialog (a receipt printer, A4, or "Save as PDF"). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "sm")}>
      Print
    </button>
  );
}
