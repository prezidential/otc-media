export function PageHeader({
  title,
  description,
  variant = "default",
}: {
  title: string;
  description: string;
  /** Studio inner pages — Instrument Serif + warm subtext per design handoff. */
  variant?: "default" | "studio";
}) {
  if (variant === "studio") {
    return (
      <div className="mb-7 lg:mb-8">
        <h1 className="font-[family-name:var(--font-instrument-serif)] italic text-[2rem] sm:text-[2.625rem] font-normal tracking-tight text-[#1F1A14] leading-[1.05]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6B5F4E]">{description}</p>
      </div>
    );
  }
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
