"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { deleteCategory, saveCategory, type CategoryResult } from "@/app/admin/(panel)/categories/actions";
import { slugify } from "@/lib/slug";

type Values = { id: string | null; name: string; slug: string; parentId: string; sortOrder: string };

const input = "min-h-11 w-full rounded-lg border border-neutral-400 bg-white px-3 text-base aria-invalid:border-red-700";

export function CategoryForm({
  initial,
  parents,
  canHaveParent,
  productCount,
}: {
  initial: Values;
  parents: { id: string; name: string }[];
  canHaveParent: boolean;
  productCount: number;
}) {
  const router = useRouter();
  const uid = useId();
  const [form, setForm] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [result, setResult] = useState<CategoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result?.errors ?? {};

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await saveCategory(form);
      setResult(res);
      if (res.ok) {
        if (!form.id) {
          setForm(initial);
          setSlugTouched(false);
        }
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!form.id) return;
    const note = productCount ? ` Its ${productCount} products stay in the shop but leave this category.` : "";
    if (!window.confirm(`Delete “${initial.name}”?${note}`)) return;
    startTransition(async () => {
      const res = await deleteCategory(form.id!);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  const field = (key: keyof Values, label: string, el: (id: string, describedBy?: string) => ReactNode) => {
    const id = `${uid}-${key}`;
    const error = errors[key];
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
        </label>
        {el(id, error ? `${id}-error` : undefined)}
        {error && (
          <p id={`${id}-error`} className="text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Name", (id, d) => (
          <input
            id={id}
            className={input}
            value={form.name}
            maxLength={80}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={d}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })}
          />
        ))}
        {field("slug", "Web address", (id, d) => (
          <input
            id={id}
            className={input}
            value={form.slug}
            maxLength={80}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={d}
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: e.target.value.toLowerCase() });
            }}
          />
        ))}
        {canHaveParent &&
          field("parentId", "Inside", (id, d) => (
            <select
              id={id}
              className={input}
              value={form.parentId}
              aria-invalid={errors.parentId ? true : undefined}
              aria-describedby={d}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">Nothing (main category)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ))}
        {field("sortOrder", "Order", (id, d) => (
          <input
            id={id}
            className={input}
            inputMode="numeric"
            value={form.sortOrder}
            aria-invalid={errors.sortOrder ? true : undefined}
            aria-describedby={d}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-green px-5 font-bold text-white hover:bg-brand-green/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : form.id ? "Save" : "Add category"}
        </button>
        {form.id && (
          <button type="button" onClick={handleDelete} disabled={pending} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-red-700 underline">
            Delete
          </button>
        )}
        <p role="status" className={`text-sm font-semibold ${result?.ok ? "text-brand-green" : "text-red-700"}`}>
          {result?.message}
        </p>
      </div>
    </form>
  );
}
