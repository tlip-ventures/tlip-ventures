import Form from "next/form";
import { SearchIcon } from "@/components/ui/icons";

type Props = {
  defaultValue?: string;
  /** Unique per page, since the header and the search page both have a search box. */
  id: string;
  /** "header": white field on the green header; "page": bordered field on a white page. */
  variant?: "header" | "page";
};

/** GET form to /search?q=…; works without JavaScript. */
export function SearchForm({ defaultValue = "", id, variant = "page" }: Props) {
  const header = variant === "header";
  return (
    <Form
      action="/search"
      role="search"
      className={`flex w-full overflow-hidden rounded-lg bg-white focus-within:ring-3 focus-within:ring-brand-gold ${
        header ? "h-11 lg:h-12" : "h-12 border border-chip"
      }`}
    >
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search blenders, kettles, stools"
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        // The form shows the focus ring, so the field doesn't need its own.
        className="w-full min-w-0 border-0 bg-transparent px-4 text-base text-ink placeholder:text-ink-muted focus-visible:shadow-none focus-visible:outline-none"
      />
      {/* Ink icon on brand orange: white on #e8641e is too faint. */}
      <button
        type="submit"
        className="inline-flex w-12 shrink-0 items-center justify-center bg-brand-orange text-ink hover:bg-[#d4561a] focus-visible:-outline-offset-4 lg:w-16"
      >
        <SearchIcon className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
        <span className="sr-only">Search</span>
      </button>
    </Form>
  );
}
