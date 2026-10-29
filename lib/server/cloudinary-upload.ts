import "server-only";
import { cloudinarySignature } from "@/lib/cloudinary-sign";
import { publicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/server/env";

export type UploadSignature =
  | { ok: true; cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }
  | { ok: false; message: string };

/**
 * Lets the admin's browser upload one image straight to Cloudinary, into
 * `folder`. The API secret stays on the server; only a short-lived signature
 * is sent. Callers must check the admin first (requireAdmin()).
 */
export async function signUpload(folder: string): Promise<UploadSignature> {
  const cloudName = publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const { CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = getServerEnv();
  if (!cloudName || !apiKey || !apiSecret) {
    return { ok: false, message: "Photo uploads need the Cloudinary settings (see .env.example)." };
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await cloudinarySignature({ folder, timestamp }, apiSecret);
  return { ok: true, cloudName, apiKey, timestamp, folder, signature };
}

/** Whether the Cloudinary settings for uploads are present. */
export function uploadsEnabled(): boolean {
  const env = getServerEnv();
  return Boolean(publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}
