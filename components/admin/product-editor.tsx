"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { deleteProduct, getUploadSignature, saveProduct } from "@/app/admin/(panel)/products/actions";
import type { ProductFormInput } from "@/lib/admin-product";
import type { CategoryNode } from "@/lib/categories";
import { slugify } from "@/lib/slug";

type Variant = ProductFormInput["variants"][number];
type Photo = ProductFormInput["images"][number];

const emptyVariant = (): Variant => ({
  id: null,
  option1Value: "",
  option2Value: "",
  sku: "",
  inStock: true,
  stockQty: "",
  priceOverride: "",
});

const input = "min-h-11 w-full rounded-lg border border-neutral-400 bg-white px-3 text-base aria-invalid:border-red-700";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Props = {
  initial: ProductFormInput;
  categories: CategoryNode[];
  uploadsEnabled: boolean;
  /** Website stock follows the Stock & POS shelf count: in stock and quantity are read-only. */
  stockFromShop?: boolean;
};

export function ProductEditor({ initial, categories, uploadsEnabled, stockFromShop = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductFormInput>(initial);
  const [hasOptions, setHasOptions] = useState(Boolean(initial.option1Name));
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ProductFormInput>(key: K, value: ProductFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setVariant = (i: number, changes: Partial<Variant>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...changes } : v)) }));

  function toggleOptions(on: boolean) {
    setHasOptions(on);
    setForm((f) =>
      on
        ? { ...f, option1Name: f.option1Name || "Colour" }
        : // Back to a single stock entry: keep the first variant's id and stock.
          { ...f, option1Name: "", option2Name: "", variants: [{ ...f.variants[0], option1Value: "", option2Value: "" }] },
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveProduct(form);
      if (result.ok) {
        setErrors({});
        if (form.id === null) {
          router.replace(`/admin/products/${result.id}?saved=1`);
        } else {
          setMessage({ kind: "success", text: "Saved." });
          router.refresh();
        }
      } else {
        setErrors(result.errors ?? {});
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  function handleDelete() {
    if (!form.id) return;
    if (!window.confirm(`Delete “${form.name}”? Past orders keep their details. To take it off the shop for now, untick “Show in shop” instead.`)) return;
    startTransition(async () => {
      const result = await deleteProduct(form.id!);
      if (result.ok) router.replace("/admin/products");
      else setMessage({ kind: "error", text: result.message ?? "Could not delete." });
    });
  }

  const err = (key: string) => errors[key];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Section title="Details">
        <Field label="Name" error={err("name")}>
          {(id, describedBy) => (
            <input
              id={id}
              className={input}
              value={form.name}
              maxLength={200}
              aria-invalid={err("name") ? true : undefined}
              aria-describedby={describedBy}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
              }}
            />
          )}
        </Field>
        <Field label="Web address" hint={`Shop link: /products/${form.slug || "…"}`} error={err("slug")}>
          {(id, describedBy) => (
            <input
              id={id}
              className={input}
              value={form.slug}
              maxLength={200}
              aria-invalid={err("slug") ? true : undefined}
              aria-describedby={describedBy}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
            />
          )}
        </Field>
        <Field label="Brand (optional)" error={err("brand")}>
          {(id, describedBy) => (
            <input id={id} className={input} value={form.brand} maxLength={80} aria-describedby={describedBy} onChange={(e) => set("brand", e.target.value)} />
          )}
        </Field>
        <Field label="Description (optional)" error={err("description")}>
          {(id, describedBy) => (
            <textarea
              id={id}
              rows={5}
              className={`${input} py-2`}
              value={form.description}
              maxLength={5000}
              aria-describedby={describedBy}
              onChange={(e) => set("description", e.target.value)}
            />
          )}
        </Field>
      </Section>

      <Section title="Price">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price (GH₵)" hint="For example 450 or 1250.50" error={err("price")}>
            {(id, describedBy) => (
              <input
                id={id}
                className={input}
                inputMode="decimal"
                value={form.price}
                aria-invalid={err("price") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => set("price", e.target.value)}
              />
            )}
          </Field>
          <Field label="“Was” price (GH₵, optional)" hint="Shows a discount badge (e.g. −16%) and lists the product under Deals" error={err("compareAtPrice")}>
            {(id, describedBy) => (
              <input
                id={id}
                className={input}
                inputMode="decimal"
                value={form.compareAtPrice}
                aria-invalid={err("compareAtPrice") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => set("compareAtPrice", e.target.value)}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="In the shop">
        <Checkbox checked={form.isActive} onChange={(v) => set("isActive", v)} label="Show in shop" hint="Untick to hide it without deleting." />
        <Checkbox checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} label="Featured on the home page" />
      </Section>

      <Section title="Categories">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((parent) => (
            <fieldset key={parent.id} className="space-y-1">
              <legend className="font-semibold">{parent.name}</legend>
              {[parent, ...parent.children].map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.id === parent.id ? `${c.name} (main)` : c.name}
                  checked={form.categoryIds.includes(c.id)}
                  onChange={(on) =>
                    set("categoryIds", on ? [...form.categoryIds, c.id] : form.categoryIds.filter((id) => id !== c.id))
                  }
                />
              ))}
            </fieldset>
          ))}
        </div>
      </Section>

      <Section title="Options and stock">
        <Checkbox
          checked={hasOptions}
          onChange={toggleOptions}
          label="This product comes in options (e.g. colours or sizes)"
        />
        {hasOptions && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Option name" hint="e.g. Colour" error={err("option1Name")}>
              {(id, describedBy) => (
                <input id={id} className={input} value={form.option1Name} maxLength={40} aria-describedby={describedBy} onChange={(e) => set("option1Name", e.target.value)} />
              )}
            </Field>
            <Field label="Second option name (optional)" hint="e.g. Size" error={err("option2Name")}>
              {(id, describedBy) => (
                <input id={id} className={input} value={form.option2Name} maxLength={40} aria-describedby={describedBy} onChange={(e) => set("option2Name", e.target.value)} />
              )}
            </Field>
          </div>
        )}
        {err("variants") && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {err("variants")}
          </p>
        )}
        <ul className="space-y-3">
          {form.variants.map((v, i) => (
            <li key={v.id ?? `new-${i}`} className="space-y-3 rounded-lg border border-neutral-200 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {hasOptions && (
                  <Field label={form.option1Name || "Option"} error={err(`variants.${i}.option1Value`)}>
                    {(id, describedBy) => (
                      <input
                        id={id}
                        className={input}
                        value={v.option1Value}
                        maxLength={60}
                        aria-invalid={err(`variants.${i}.option1Value`) ? true : undefined}
                        aria-describedby={describedBy}
                        onChange={(e) => setVariant(i, { option1Value: e.target.value })}
                      />
                    )}
                  </Field>
                )}
                {hasOptions && form.option2Name && (
                  <Field label={form.option2Name} error={err(`variants.${i}.option2Value`)}>
                    {(id, describedBy) => (
                      <input
                        id={id}
                        className={input}
                        value={v.option2Value}
                        maxLength={60}
                        aria-invalid={err(`variants.${i}.option2Value`) ? true : undefined}
                        aria-describedby={describedBy}
                        onChange={(e) => setVariant(i, { option2Value: e.target.value })}
                      />
                    )}
                  </Field>
                )}
                {hasOptions && (
                  <Field label="Own price (GH₵, optional)" hint="Empty = product price" error={err(`variants.${i}.priceOverride`)}>
                    {(id, describedBy) => (
                      <input
                        id={id}
                        className={input}
                        inputMode="decimal"
                        value={v.priceOverride}
                        aria-invalid={err(`variants.${i}.priceOverride`) ? true : undefined}
                        aria-describedby={describedBy}
                        onChange={(e) => setVariant(i, { priceOverride: e.target.value })}
                      />
                    )}
                  </Field>
                )}
                <Field label="SKU (optional)" error={err(`variants.${i}.sku`)}>
                  {(id, describedBy) => (
                    <input id={id} className={input} value={v.sku} maxLength={60} aria-describedby={describedBy} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                  )}
                </Field>
                {!stockFromShop && (
                  <Field label="Quantity on hand (optional)" hint="For your reference only" error={err(`variants.${i}.stockQty`)}>
                    {(id, describedBy) => (
                      <input
                        id={id}
                        className={input}
                        inputMode="numeric"
                        value={v.stockQty}
                        aria-invalid={err(`variants.${i}.stockQty`) ? true : undefined}
                        aria-describedby={describedBy}
                        onChange={(e) => setVariant(i, { stockQty: e.target.value })}
                      />
                    )}
                  </Field>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {stockFromShop ? (
                  <p className="text-sm text-neutral-700">
                    {v.inStock ? `In stock: ${v.stockQty || 0} on the shelf.` : "Sold out."} Stock comes from{" "}
                    <Link href="/pos/products">Stock and sales</Link>.
                  </p>
                ) : (
                  <Checkbox checked={v.inStock} onChange={(on) => setVariant(i, { inStock: on })} label="In stock (customers can order it)" />
                )}
                {hasOptions && form.variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set("variants", form.variants.filter((_, j) => j !== i))}
                    className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-red-700 underline"
                  >
                    Remove option
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {hasOptions && (
          <button
            type="button"
            onClick={() => set("variants", [...form.variants, emptyVariant()])}
            className="inline-flex min-h-11 items-center rounded-lg border-2 border-brand-green px-4 font-semibold text-brand-green"
          >
            Add option
          </button>
        )}
      </Section>

      <Section title="Photos">
        <Photos
          photos={form.images}
          onChange={(images) => set("images", images)}
          uploadsEnabled={uploadsEnabled}
          productName={form.name}
          error={Object.entries(errors).find(([k]) => k.startsWith("images"))?.[1]}
        />
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-white px-4 py-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-6 text-base font-bold text-white hover:bg-brand-orange-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : form.id ? "Save changes" : "Create product"}
        </button>
        {form.id && (
          <Link href={`/products/${form.slug}`} className="inline-flex min-h-11 items-center font-semibold">
            View in shop
          </Link>
        )}
        <p role="status" className={`text-sm font-semibold ${message?.kind === "error" ? "text-red-700" : "text-brand-green"}`}>
          {message?.text}
        </p>
        {form.id && (
          <button type="button" onClick={handleDelete} disabled={pending} className="ml-auto inline-flex min-h-11 items-center px-2 text-sm font-semibold text-red-700 underline">
            Delete product
          </button>
        )}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <h2 className="text-xl font-bold text-brand-green">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {children(id, describedBy)}
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
}

function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-brand-green" />
      <span>
        {label}
        {hint && <span className="block text-sm text-neutral-700">{hint}</span>}
      </span>
    </label>
  );
}

function Photos({
  photos,
  onChange,
  uploadsEnabled,
  productName,
  error,
}: {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  uploadsEnabled: boolean;
  productName: string;
  error?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const move = (i: number, by: number) => {
    const next = [...photos];
    const [photo] = next.splice(i, 1);
    next.splice(i + by, 0, photo);
    onChange(next);
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    const added: Photo[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 10 MB.`);
        const sig = await getUploadSignature();
        if (!sig.ok) throw new Error(sig.message);
        const body = new FormData();
        body.append("file", file);
        body.append("api_key", sig.apiKey);
        body.append("timestamp", String(sig.timestamp));
        body.append("folder", sig.folder);
        body.append("signature", sig.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body });
        const json = (await res.json()) as { secure_url?: string; public_id?: string; error?: { message: string } };
        if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? "Upload failed.");
        added.push({ url: json.secure_url, publicId: json.public_id ?? "", alt: productName });
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      if (added.length) onChange([...photos, ...added]);
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {photos.length === 0 && <p className="text-sm text-neutral-700">No photos yet. The first photo is the main one.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {photos.map((photo, i) => (
          <li key={`${photo.url}-${i}`} className="flex gap-3 rounded-lg border border-neutral-200 p-2">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-neutral-100">
              <Image src={photo.url} alt="" fill sizes="80px" className="object-contain" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block text-sm font-semibold">
                {i === 0 ? "Main photo: description" : "Description"}
                <input
                  className={`${input} mt-1 text-sm`}
                  value={photo.alt}
                  maxLength={200}
                  placeholder="What the photo shows"
                  onChange={(e) => onChange(photos.map((p, j) => (j === i ? { ...p, alt: e.target.value } : p)))}
                />
              </label>
              <div className="flex flex-wrap gap-1 text-sm">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="min-h-11 rounded border border-neutral-300 px-3 disabled:opacity-40">
                  ↑ Earlier
                </button>
                <button type="button" disabled={i === photos.length - 1} onClick={() => move(i, 1)} className="min-h-11 rounded border border-neutral-300 px-3 disabled:opacity-40">
                  ↓ Later
                </button>
                <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="min-h-11 px-3 font-semibold text-red-700 underline">
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {uploadsEnabled ? (
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border-2 border-brand-green px-4 font-semibold text-brand-green focus-within:outline-3 focus-within:outline-brand-gold">
          {uploading ? "Uploading…" : "Upload photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <p className="rounded-lg bg-brand-gold/15 px-3 py-2 text-sm">
          Photo uploads are off until the Cloudinary settings are added (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
          CLOUDINARY_API_SECRET).
        </p>
      )}
      {(uploadError || error) && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {uploadError ?? error}
        </p>
      )}
    </div>
  );
}
