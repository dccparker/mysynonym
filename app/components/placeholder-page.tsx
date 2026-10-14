type PlaceholderPageProps = {
  title: string;
  description: string;
  sectionTitle: string;
  detail: string;
};

export function PlaceholderPage({
  title,
  description,
  sectionTitle,
  detail,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <header className="mb-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">
          MySynonym
        </p>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
          {title}
        </h1>
        <p className="mt-1.5 text-xs text-[#87938b]">{description}</p>
      </header>
      <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#748078]">
          Coming soon
        </p>
        <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-[#eef2ed]">
          {sectionTitle}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[#87938b]">{detail}</p>
      </section>
    </div>
  );
}
