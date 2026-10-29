"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import {
  deleteBanner,
  getBannerUploadSignature,
  moveBanner,
  saveBanner,
  setBannerActive,
  type BannerResult,
} from "@/app/admin/(panel)/banners/actions";
import { BANNER_HEIGHT, BANNER_WIDTH, bannerShapeWarning, MAX_ACTIVE_BANNERS } from "@/lib/banners";

export type AdminBanner = {
  id: string;
  imageUrl: string;
  publicId: string | null;
  alt: string;
  linkUrl: string | null;
  isActive: boolean;
};

const input = "min-h-11 w-full rounded-lg border border-neutral-400 bg-white px-3 text-base aria-invalid:border-red-700";
const smallButton = "min-h-11 rounded border border-neutral-300 px-3 text-sm disabled:opacity-40";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Banner preview at the home page's 2:1 shape. */
function Preview({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative aspect-[2/1] overflow-hidden rounded-lg bg-neutral-100 ${className}`}>
      <Image src={src} alt={alt} fill sizes="(min-width: 640px) 320px, 100vw" className="object-cover" />
    </div>
  );
}

function BannerForm({
  initial,
  uploadsEnabled,
  onDone,
}: {
  initial: AdminBanner | null;
  uploadsEnabled: boolean;
  onDone: () => void;
}) {
  const uid = useId();
  const router = useRouter();
  const [form, setForm] = useState({
    imageUrl: initial?.imageUrl ?? "",
    publicId: initial?.publicId ?? null,
    alt: initial?.alt ?? "",
    linkUrl: initial?.linkUrl ?? "",
    isActive: initial?.isActive ?? true,
  });
  const [uploading, setUploading] = useState(false);
  const [shapeNote, setShapeNote] = useState<string | null>(null);
  const [result, setResult] = useState<BannerResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result?.errors ?? {};

  async function upload(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setShapeNote(null);
    if (!file.type.startsWith("image/")) return setResult({ ok: false, message: `${file.name} is not an image.` });
    if (file.size > MAX_UPLOAD_BYTES) return setResult({ ok: false, message: `${file.name} is larger than 10 MB.` });
    setUploading(true);
    try {
      const sig = await getBannerUploadSignature();
      if (!sig.ok) throw new Error(sig.message);
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", sig.apiKey);
      body.append("timestamp", String(sig.timestamp));
      body.append("folder", sig.folder);
      body.append("signature", sig.signature);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body });
      const json = (await res.json()) as {
        secure_url?: string;
        public_id?: string;
        width?: number;
        height?: number;
        error?: { message: string };
      };
      if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? "Upload failed.");
      setForm((f) => ({ ...f, imageUrl: json.secure_url!, publicId: json.public_id ?? null }));
      setShapeNote(bannerShapeWarning(json.width ?? 0, json.height ?? 0));
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await saveBanner(initial?.id ?? null, form);
      setResult(res);
      if (res.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <p className="font-semibold">Image</p>
        {form.imageUrl ? (
          <Preview src={form.imageUrl} alt="" className="max-w-md" />
        ) : (
          <p className="text-sm text-neutral-700">
            No image yet. Use artwork {BANNER_WIDTH} × {BANNER_HEIGHT} pixels.
          </p>
        )}
        {uploadsEnabled ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border-2 border-brand-green px-4 font-semibold text-brand-green focus-within:outline-3 focus-within:outline-brand-gold">
            {uploading ? "Uploading…" : form.imageUrl ? "Upload a different image" : "Upload image"}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              className="sr-only"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <p className="rounded-lg bg-brand-gold/15 px-3 py-2 text-sm">
            Uploads are off until the Cloudinary settings are added. You can paste a Cloudinary image address below instead.
          </p>
        )}
        {shapeNote && <p className="rounded-lg bg-brand-gold/15 px-3 py-2 text-sm">{shapeNote}</p>}
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">Or paste an image address</summary>
          <label htmlFor={`${uid}-url`} className="sr-only">
            Cloudinary image address
          </label>
          <input
            id={`${uid}-url`}
            className={input}
            value={form.imageUrl}
            placeholder="https://res.cloudinary.com/…"
            aria-invalid={errors.imageUrl ? true : undefined}
            aria-describedby={errors.imageUrl ? `${uid}-url-error` : undefined}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value.trim(), publicId: null }))}
          />
        </details>
        {errors.imageUrl && (
          <p id={`${uid}-url-error`} className="text-sm font-semibold text-red-700">
            {errors.imageUrl}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${uid}-alt`} className="block font-semibold">
          Description
        </label>
        <p id={`${uid}-alt-hint`} className="text-sm text-neutral-700">
          What the banner shows and says, for people who can’t see it. For example: “Christmas in the kitchen: up to 20% off
          cookware”.
        </p>
        <input
          id={`${uid}-alt`}
          className={input}
          value={form.alt}
          maxLength={300}
          aria-invalid={errors.alt ? true : undefined}
          aria-describedby={`${uid}-alt-hint${errors.alt ? ` ${uid}-alt-error` : ""}`}
          onChange={(e) => setForm((f) => ({ ...f, alt: e.target.value }))}
        />
        {errors.alt && (
          <p id={`${uid}-alt-error`} className="text-sm font-semibold text-red-700">
            {errors.alt}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${uid}-link`} className="block font-semibold">
          Link (optional)
        </label>
        <p id={`${uid}-link-hint`} className="text-sm text-neutral-700">
          Where a tap goes: a page on this site like /deals or /categories/blenders, or a full https:// address. Leave empty
          for a picture only.
        </p>
        <input
          id={`${uid}-link`}
          className={input}
          value={form.linkUrl}
          maxLength={500}
          placeholder="/deals"
          aria-invalid={errors.linkUrl ? true : undefined}
          aria-describedby={`${uid}-link-hint${errors.linkUrl ? ` ${uid}-link-error` : ""}`}
          onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
        />
        {errors.linkUrl && (
          <p id={`${uid}-link-error`} className="text-sm font-semibold text-red-700">
            {errors.linkUrl}
          </p>
        )}
      </div>

      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="h-5 w-5 accent-brand-green"
        />
        Show on the home page
      </label>

      {result && !result.ok && result.message && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {result.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-green px-5 font-bold text-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {pending ? "Saving…" : initial ? "Save banner" : "Add banner"}
        </button>
        {initial && (
          <button type="button" onClick={onDone} className="inline-flex min-h-11 items-center px-3 font-semibold underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function BannerRow({
  banner,
  index,
  count,
  shown,
  uploadsEnabled,
}: {
  banner: AdminBanner;
  index: number;
  count: number;
  /** Whether it is one of the first MAX_ACTIVE_BANNERS switched-on banners. */
  shown: boolean;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<BannerResult>) {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setMessage(res.message ?? "Something went wrong.");
      router.refresh();
    });
  }

  const status = !banner.isActive
    ? "Off"
    : shown
      ? "Showing on the home page"
      : `On, but only the first ${MAX_ACTIVE_BANNERS} switched-on banners show`;

  return (
    <li className="space-y-3 rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Preview src={banner.imageUrl} alt="" className={`w-full shrink-0 sm:w-64 ${banner.isActive ? "" : "opacity-50"}`} />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold text-ink">{banner.alt}</p>
          <p className="text-neutral-700">Link: {banner.linkUrl ?? "none (picture only)"}</p>
          <p className={banner.isActive && shown ? "font-semibold text-brand-green" : "text-neutral-700"}>{status}</p>
          <div className="flex flex-wrap gap-1 pt-1" aria-busy={pending}>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setBannerActive(banner.id, !banner.isActive))}
              className={smallButton}
            >
              {banner.isActive ? "Switch off" : "Switch on"}
            </button>
            <button type="button" disabled={pending || index === 0} onClick={() => run(() => moveBanner(banner.id, -1))} className={smallButton}>
              ↑ Earlier
            </button>
            <button
              type="button"
              disabled={pending || index === count - 1}
              onClick={() => run(() => moveBanner(banner.id, 1))}
              className={smallButton}
            >
              ↓ Later
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing((e) => !e)} className={smallButton}>
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Delete this banner? This can’t be undone.")) run(() => deleteBanner(banner.id));
              }}
              className="min-h-11 px-3 text-sm font-semibold text-red-700 underline"
            >
              Delete
            </button>
          </div>
          {message && (
            <p role="alert" className="font-semibold text-red-700">
              {message}
            </p>
          )}
        </div>
      </div>
      {editing && (
        <div className="border-t border-neutral-200 pt-3">
          <BannerForm initial={banner} uploadsEnabled={uploadsEnabled} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}

/** Add, edit, reorder, switch on and off, and delete the home page banners. */
export function BannerManager({ banners, uploadsEnabled }: { banners: AdminBanner[]; uploadsEnabled: boolean }) {
  const [formKey, setFormKey] = useState(0);
  const shownIds = new Set(banners.filter((b) => b.isActive).slice(0, MAX_ACTIVE_BANNERS).map((b) => b.id));

  return (
    <div className="space-y-8">
      <section aria-labelledby="banner-list-heading" className="space-y-3">
        <h2 id="banner-list-heading" className="text-xl font-bold text-brand-green">
          Banners, in order
        </h2>
        {banners.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-4 py-6 text-sm">
            No banners yet. The home page shows the green “Quality home and kitchen goods in Ghana” panel until you add one.
          </p>
        ) : (
          <ul className="space-y-3">
            {banners.map((banner, i) => (
              <BannerRow
                key={banner.id}
                banner={banner}
                index={i}
                count={banners.length}
                shown={shownIds.has(banner.id)}
                uploadsEnabled={uploadsEnabled}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="banner-add-heading" className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <h2 id="banner-add-heading" className="text-xl font-bold text-brand-green">
          Add a banner
        </h2>
        {/* A new key empties the form after each banner is added. */}
        <BannerForm key={formKey} initial={null} uploadsEnabled={uploadsEnabled} onDone={() => setFormKey((k) => k + 1)} />
      </section>
    </div>
  );
}
