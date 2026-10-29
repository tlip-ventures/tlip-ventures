"use client";

import { useSyncExternalStore } from "react";
import { closedMessage, replyStatus, type ReplyHours } from "@/lib/reply-hours";

type Props = {
  hours: ReplyHours;
  className?: string;
};

// The current minute, so the notice updates when the shop opens or closes.
function subscribeMinute(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);

/**
 * "We'll reply tomorrow from 7am" outside reply hours. Worked out in the
 * browser because shop pages are cached, so the server's "now" may be old.
 */
export function ReplyClosedNotice({ hours, className }: Props) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, () => null);
  if (minute === null) return null;
  const status = replyStatus(hours, new Date(minute * 60_000));
  if (!status || status.open) return null;
  return <p className={className}>{closedMessage(status)}</p>;
}
