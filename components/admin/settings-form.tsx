"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { saveSettings, type SettingsResult } from "@/app/admin/(panel)/settings/actions";
import { SOCIAL_LABELS, SOCIAL_NETWORKS, type SettingsInput } from "@/lib/admin-forms";

const input = "min-h-11 w-full rounded-lg border border-neutral-400 bg-white px-3 text-base aria-invalid:border-red-700";

type TextField = Exclude<keyof SettingsInput, "social" | "replyDays">;

const FIELDS: { key: TextField; label: string; hint?: string; multiline?: boolean; type?: "email" | "time" }[] = [
  { key: "storeName", label: "Shop name" },
  { key: "whatsappNumber", label: "WhatsApp number for orders", hint: "Orders are sent here. e.g. 024 123 4567" },
  { key: "tagline", label: "Tagline", hint: "Shown in the footer" },
  { key: "announcement", label: "Announcement bar", hint: "Short message at the top of every page. Leave empty to hide it." },
  { key: "shopAddress", label: "Shop address", multiline: true },
  { key: "openingHours", label: "Opening hours", multiline: true },
  { key: "contactEmail", label: "Contact email", hint: "Shown in the footer and on the About page", type: "email" },
  {
    key: "responsePromise",
    label: "Reply promise",
    hint: "Shown with your reply hours in the footer, the cart and after ordering, e.g. We reply within 30 minutes",
  },
  { key: "replyOpen", label: "Start replying at", hint: "Ghana time. Leave both times empty to hide the reply hours.", type: "time" },
  { key: "replyClose", label: "Stop replying at", type: "time" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result?.errors ?? {};

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await saveSettings(form);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {FIELDS.map(({ key, label, hint, multiline, type }) => {
        const id = `settings-${key}`;
        const error = errors[key];
        const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
        const common = {
          id,
          value: form[key],
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
          onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
        };
        return (
          <div key={key} className="space-y-1">
            <label htmlFor={id} className="block font-semibold">
              {label}
            </label>
            {multiline ? <textarea rows={2} className={`${input} py-2`} {...common} /> : <input type={type} className={input} {...common} />}
            {hint && (
              <p id={`${id}-hint`} className="text-sm text-neutral-700">
                {hint}
              </p>
            )}
            {error && (
              <p id={`${id}-error`} className="text-sm font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>
        );
      })}

      <fieldset
        className="space-y-2 rounded-lg border border-neutral-200 p-4"
        aria-describedby={errors.replyDays ? "settings-replyDays-error" : undefined}
      >
        <legend className="px-1 font-semibold">Days you reply to orders</legend>
        <p className="text-sm text-neutral-700">
          Outside these days and times, the site tells customers when you will reply.
        </p>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
          {DAYS.map((name, i) => {
            const day = i + 1;
            return (
              <label key={day} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand-green"
                  checked={form.replyDays.includes(day)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      replyDays: e.target.checked ? [...form.replyDays, day] : form.replyDays.filter((d) => d !== day),
                    })
                  }
                />
                {name}
              </label>
            );
          })}
        </div>
        {errors.replyDays && (
          <p id="settings-replyDays-error" className="text-sm font-semibold text-red-700">
            {errors.replyDays}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <legend className="px-1 font-semibold">Social media links (optional)</legend>
        {SOCIAL_NETWORKS.map((network) => {
          const id = `settings-social-${network}`;
          const error = errors[`social.${network}`];
          return (
            <div key={network} className="space-y-1">
              <label htmlFor={id} className="block text-sm font-semibold">
                {SOCIAL_LABELS[network]}
              </label>
              <input
                id={id}
                type="url"
                inputMode="url"
                placeholder="https://"
                className={input}
                value={form.social[network]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => setForm({ ...form, social: { ...form.social, [network]: e.target.value } })}
              />
              {error && (
                <p id={`${id}-error`} className="text-sm font-semibold text-red-700">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-6 text-base font-bold text-white hover:bg-brand-orange-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        <p role="status" className={`text-sm font-semibold ${result?.ok ? "text-brand-green" : "text-red-700"}`}>
          {result?.message}
        </p>
      </div>
    </form>
  );
}
