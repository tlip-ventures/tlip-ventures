import { CountIcon, PlusIcon } from "./icons";
import { ButtonLink, Card, PageHeader, PageShell } from "./ui";

/** A part of the app that isn't built yet, with a way to the parts that are. */
export function ComingSoon({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <PageShell>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="font-pos-display text-[26px] leading-[1.1]">Coming soon.</span>
          <span className="max-w-[420px] text-sm leading-[22px] text-pos-soft">{body}</span>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <ButtonLink href="/pos/products" kind="outline">
              <PlusIcon size={16} />
              Products and stock
            </ButtonLink>
            <ButtonLink href="/pos/count" kind="outline">
              <CountIcon />
              Stock count
            </ButtonLink>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
