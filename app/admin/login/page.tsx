import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const notAdmin = params.error === "not-admin";

  return (
    <main id="main" className="flex flex-1 items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Image src="/brand/logo.webp" alt="" width={44} height={44} unoptimized className="h-11 w-11" />
          <h1 className="text-2xl font-bold text-brand-green">Shop admin</h1>
        </div>
        {notAdmin && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            The account you are signed in with does not have admin access.
          </p>
        )}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
