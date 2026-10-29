"use client";

// Last-resort error page, used only when the root layout itself fails.
// It replaces the whole document, so it can't rely on the app's fonts or CSS.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-GH">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 16px", textAlign: "center", color: "#111" }}>
        <h1 style={{ color: "#0f6b43" }}>Something went wrong</h1>
        <p>We could not load Tlip Ventures. Please check your connection and try again.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ minHeight: 44, padding: "0 20px", border: 0, borderRadius: 8, background: "#b84a14", color: "#fff", fontSize: 16, fontWeight: 700 }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
