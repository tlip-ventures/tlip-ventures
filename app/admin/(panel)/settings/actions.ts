"use server";

import { revalidatePath } from "next/cache";
import { firstErrors, settingsSchema, socialLinksJson, type SettingsInput } from "@/lib/admin-forms";
import { requireAdmin } from "@/lib/server/admin";

export type SettingsResult = { ok: boolean; message: string; errors?: Record<string, string> };

export async function saveSettings(input: SettingsInput): Promise<SettingsResult> {
  const { supabase } = await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", errors: firstErrors(parsed.error) };
  const s = parsed.data;

  const { data, error } = await supabase
    .from("settings")
    .update({
      store_name: s.storeName,
      whatsapp_number: s.whatsappNumber,
      tagline: s.tagline,
      shop_address: s.shopAddress,
      opening_hours: s.openingHours,
      announcement: s.announcement,
      contact_email: s.contactEmail,
      response_promise: s.responsePromise,
      reply_open: s.replyOpen,
      reply_close: s.replyClose,
      reply_days: s.replyDays,
      social_links: socialLinksJson(s.social),
    })
    .eq("id", 1)
    .select("id");
  if (error) return { ok: false, message: `Could not save: ${error.message}` };
  if (!data.length) return { ok: false, message: "Could not save: you are not allowed to change settings." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The shop shows the new details straight away." };
}
