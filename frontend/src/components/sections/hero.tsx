import { GlassFold } from "@/components/ui/glass-fold";

/**
 * The landing page: the glass, and one pair of lines on it.
 *
 * The pair sits low and left, both lines sharing one edge, so the name and the
 * line under it read as a single locked-up mark rather than two stacked
 * headings.
 */
export function Hero() {
  return (
    <section className="relative isolate h-dvh w-full overflow-hidden">
      <GlassFold
        color1="#2563eb"
        color2="#080f1f"
        color3="#60a5fa"
        speed={0.45}
        scale={1}
        noise={0.1}
        className="-z-10 absolute inset-0"
      />
      {/*
        Two scrims. The first is a soft wash over the whole field; the second
        is anchored under the pair, because a lit crease passing behind the
        type drops it to 2:1 and the words disappear. It follows the type, so
        the rest of the frame keeps the glass at full strength.
      */}
      <div
        aria-hidden
        className="-z-10 absolute inset-0 bg-gradient-to-tr from-[#080f1f]/70 via-[#080f1f]/22 to-transparent"
      />
      <div
        aria-hidden
        className="-z-10 absolute inset-0 bg-[radial-gradient(68rem_44rem_at_22%_84%,#080f1f_0%,rgba(8,15,31,0.94)_34%,rgba(8,15,31,0.6)_58%,transparent_80%)]"
      />

      <div className="flex h-full w-full items-end">
        <div className="w-full pb-[13vh] pl-[6vw] sm:pl-[6vw] lg:pl-[7vw]">
          <h1 className="w-fit font-display font-semibold text-[#f8fafc] text-[clamp(3.5rem,13vw,11rem)] leading-[0.84] tracking-[-0.04em]">
            Sableye
          </h1>
          <p className="mt-[clamp(1rem,1.6vw,1.75rem)] w-fit max-w-[22ch] text-balance font-display font-medium text-[#94a3b8] text-[clamp(1.0625rem,2.1vw,1.9rem)] leading-[1.25] tracking-[-0.012em] sm:max-w-none">
            One system for all, Junction of all payments
          </p>
        </div>
      </div>
    </section>
  );
}
