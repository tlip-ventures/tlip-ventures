import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { SOCIAL_NETWORKS, type SettingsInput } from "@/lib/admin-forms";
import { formatGhanaPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/server/admin";
import { getSettings } from "@/lib/server/catalogue";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  const initial: SettingsInput = {
    storeName: s.store_name,
    whatsappNumber: formatGhanaPhone(s.whatsapp_number),
    tagline: s.tagline ?? "",
    shopAddress: s.shop_address ?? "",
    openingHours: s.opening_hours ?? "",
    announcement: s.announcement ?? "",
    contactEmail: s.contact_email ?? "",
    responsePromise: s.response_promise ?? "",
    // Postgres returns "07:00:00"; the time input wants "07:00".
    replyOpen: s.reply_open?.slice(0, 5) ?? "",
    replyClose: s.reply_close?.slice(0, 5) ?? "",
    replyDays: s.reply_days,
    social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, s.social_links[n] ?? ""])) as SettingsInput["social"],
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold text-brand-green">Settings</h1>
      {s.whatsapp_number === "233200000000" && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-800">
          The WhatsApp number is still the placeholder. Orders will go nowhere until you set the shop’s real number.
        </p>
      )}
      <SettingsForm initial={initial} />
    </div>
  );
}
