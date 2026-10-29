// Shared by the image loader (client) and share images (server).

// A URL path segment made only of Cloudinary transformation parameters, e.g. "f_auto,q_auto,w_400".
export const TRANSFORM_SEGMENT = /^(?:(?:a|ar|b|bo|c|co|dpr|e|f|fl|g|h|l|o|q|r|t|u|w|x|y|z)_[^,/]+)(?:,(?:a|ar|b|bo|c|co|dpr|e|f|fl|g|h|l|o|q|r|t|u|w|x|y|z)_[^,/]+)*$/;

const UPLOAD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(.+)$/;

/** The public ID in a Cloudinary delivery URL: ".../upload/w_400/v17/tlip/products/a.jpg" → "tlip/products/a". */
export function cloudinaryPublicId(url: string): string | null {
  const match = UPLOAD.exec(url);
  if (!match) return null;
  const parts = match[1].split("/");
  if (parts.length > 1 && TRANSFORM_SEGMENT.test(parts[0])) parts.shift();
  if (parts.length > 1 && /^v\d+$/.test(parts[0])) parts.shift();
  return parts.join("/").replace(/\.[a-z0-9]+$/i, "") || null;
}
