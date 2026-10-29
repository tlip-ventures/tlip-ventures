import type { Metadata } from "next";
import { Notice } from "@/components/pos/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function PosLoginPage({ searchParams }: PageProps<"/pos/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const noAccess = params.error === "no-access";

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm overflow-hidden rounded-[10px] border border-pos-card-line bg-white">
        <div aria-hidden="true" className="flex h-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`flex-1 ${i % 2 ? "bg-pos-orange" : "bg-pos-green"}`} />
          ))}
        </div>
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-pos-green">Stock and sales</span>
            <h1 className="m-0 font-pos-display text-[36px] font-normal leading-[1.05]">Tlip Ventures</h1>
          </div>
          {noAccess && (
            <Notice tone="bad">The account you signed in with can&apos;t use the stock and sales app. Ask the owner.</Notice>
          )}
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
