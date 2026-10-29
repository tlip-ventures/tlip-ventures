/** Orange/green block band from the shopfront, under the header and above the footer. Decorative only. */
export function BrandBand() {
  return (
    <div aria-hidden="true" className="flex h-1.5">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className={`flex-1 ${i % 2 === 0 ? "bg-brand-orange" : "bg-brand-green"}`} />
      ))}
    </div>
  );
}
