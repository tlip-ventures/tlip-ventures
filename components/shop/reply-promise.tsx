import { closedMessage, formatReplyHours, replyStatus, settingsReplyHours } from "@/lib/reply-hours";
import type { Settings } from "@/lib/server/catalogue";

type Props = {
  settings: Settings;
  /** "panel": a box above the order form and after ordering; "plain": footer text. */
  variant?: "panel" | "plain";
};

/**
 * "We reply within 30 minutes · Mon–Sat, 7am–7:30pm", and outside those hours
 * when the shop will reply. Pages are rendered per request, so "now" is current.
 */
export function ReplyPromise({ settings, variant = "panel" }: Props) {
  const hours = settingsReplyHours(settings);
  const promise = settings.response_promise;
  if (!promise && !hours) return null;

  const status = hours ? replyStatus(hours, new Date()) : null;
  const closed = status && !status.open ? closedMessage(status) : null;
  const line = [promise, hours && formatReplyHours(hours)].filter(Boolean).join(" · ");

  if (variant === "plain") {
    return (
      <>
        <p>{line}</p>
        {closed && <p className="font-semibold">{closed}</p>}
      </>
    );
  }

  return (
    <div className="rounded-lg border border-brand-green/30 bg-brand-green/5 px-4 py-3 text-sm text-ink">
      <p className="font-semibold text-brand-green">{line}</p>
      {closed && <p className="mt-1">{closed}</p>}
    </div>
  );
}
