import Form from "next/form";
import Link from "next/link";
import { SearchIcon } from "./icons";

// Search, filter chips and Previous/Next for the design's list cards. Plain
// links and GET forms: they work before (and without) JavaScript.

export function SearchForm({
  action,
  id,
  label,
  placeholder,
  value,
  hidden = {},
}: {
  action: string;
  id: string;
  label: string;
  placeholder: string;
  value: string;
  /** Other query values to keep, e.g. the current filter. */
  hidden?: Record<string, string>;
}) {
  return (
    <Form action={action} className="flex min-w-[200px] flex-[0_1_320px]" role="search">
      {Object.entries(hidden).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="box-border flex h-[42px] w-full items-center gap-2.5 rounded-md border border-pos-line px-3 text-pos-muted focus-within:border-pos-green">
        <SearchIcon size={16} />
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={value}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-pos-ink outline-none placeholder:text-pos-muted"
        />
      </div>
    </Form>
  );
}

export function FilterChips<T extends string>({
  label,
  options,
  current,
  href,
}: {
  label: string;
  options: readonly { value: T; name: string }[];
  current: T;
  href: (value: T) => string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {options.map((o) => {
          const on = o.value === current;
          return (
            <li key={o.value}>
              <Link
                href={href(o.value)}
                aria-current={on ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-semibold no-underline md:min-h-[38px] ${
                  on
                    ? "border-pos-forest bg-pos-forest text-pos-on-forest hover:text-pos-on-forest"
                    : "border-pos-line bg-white text-pos-ink hover:border-pos-muted hover:text-pos-ink"
                }`}
              >
                {o.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Showing 31–60 of 152" with Previous and Next. */
export function Pager({
  page,
  pageSize,
  total,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const hasPrev = page > 1;
  const hasNext = last < total;
  const link = "inline-flex min-h-11 items-center rounded-md border border-pos-card-line bg-white px-3 text-[13px] no-underline md:min-h-9";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-pos-paper-deep px-[18px] py-3 text-[13px] text-pos-muted">
      <span>
        Showing {first === last ? first : `${first}–${last}`} of {total.toLocaleString("en-US")}
      </span>
      <nav aria-label="Pages" className="flex gap-1.5">
        {hasPrev ? (
          <Link href={href(page - 1)} className={`${link} text-pos-ink hover:text-pos-ink`} rel="prev">
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={`${link} text-pos-faint`}>
            Previous
          </span>
        )}
        {hasNext ? (
          <Link href={href(page + 1)} className={`${link} text-pos-ink hover:text-pos-ink`} rel="next">
            Next
          </Link>
        ) : (
          <span aria-disabled="true" className={`${link} text-pos-faint`}>
            Next
          </span>
        )}
      </nav>
    </div>
  );
}
