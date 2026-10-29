import { TRANSFORM_SEGMENT } from "./cloudinary-url";

const UPLOAD_URL = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(.+)$/;

/**
 * A product photo sized for link previews (WhatsApp, Facebook): 1200×630 JPEG
 * on white. Only Cloudinary URLs can be resized; anything else returns null.
 */
export function cloudinaryShareImage(url: string): string | null {
  const match = UPLOAD_URL.exec(url);
  if (!match) return null;
  const [, cloud, rest] = match;
  const parts = rest.split("/");
  if (parts.length > 1 && TRANSFORM_SEGMENT.test(parts[0])) parts.shift();
  return `https://res.cloudinary.com/${cloud}/image/upload/c_pad,b_white,w_1200,h_630,f_jpg,q_auto/${parts.join("/")}`;
}
