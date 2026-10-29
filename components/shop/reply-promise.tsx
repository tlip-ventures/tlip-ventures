import { formatReplyHours, settingsReplyHours } from "@/lib/reply-hours";
import type { Settings } from "@/lib/server/catalogue";
import { ReplyClosedNotice } from "./reply-closed-notice";

type Props = {
  settings: Settings;
  /** "panel": a box above the order form and after ordering; "plain": footer text. */
  variant?: "panel" | "plain";
};

/**
 * "We reply within 30 minutes · Mon–Sat, 7am–7:30pm", and outside those hours
 * when the shop will reply (worked out in the browser; pages are cached).
 */
export function ReplyPromise({ settings, variant = "panel" }: Props) {
  const hours = settingsReplyHours(settings);
  const promise = settings.response_promise;
  if (!promise && !hours) return null;

  const line = [promise, hours && formatReplyHours(hours)].filter(Boolean).join(" · ");

  if (variant === "plain") {
    return (
      <>
        <p>{line}</p>
        {hours && <ReplyClosedNotice hours={hours} className="font-semibold" />}
      </>
    );
  }

  return (
    <div className="rounded-lg border border-brand-green/30 bg-brand-green/5 px-4 py-3 text-sm text-ink">
      <p className="font-semibold text-brand-green">{line}</p>
      {hours && <ReplyClosedNotice hours={hours} className="mt-1" />}
    </div>
  );
}
