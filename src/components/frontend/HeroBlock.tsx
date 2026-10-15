import ContentImage from "./ContentImage";

/**
 * The hero / title band for a single post or page.
 *
 * Two layouts, both driven by the Customizer (`post_hero_layout` /
 * `page_hero_layout`):
 *
 * - `banner`: the featured image as a full-width band above the title area.
 * - `overlay`: the title area sits on top of the featured image, with a dark
 *   scrim whose opacity the Customizer controls (`post_hero_overlay`).
 *
 * The title area itself is passed as `children` (the usual PostTitleBlock),
 * so the hero never duplicates title/meta markup — it only changes where the
 * featured image lives and how the title sits on it.
 */
export default function HeroBlock({
  kind,
  layout,
  height,
  overlayOpacity,
  titleColor,
  image,
  imageAlt,
  sizes,
  children,
}: {
  kind: "post" | "page";
  /** banner | overlay */
  layout: string;
  /** small | medium | large */
  height: string;
  /** 0..90 */
  overlayOpacity: number;
  titleColor?: string | null;
  image: string;
  imageAlt: string;
  sizes?: string;
  children: React.ReactNode;
}) {
  const heightCls =
    height === "small" ? "min-h-[220px]" : height === "large" ? "min-h-[520px]" : "min-h-[360px]";

  if (layout === "overlay") {
    const scrim = Math.max(0, Math.min(90, overlayOpacity)) / 100;
    return (
      <section
        className={`doc-hero doc-hero-overlay relative -mx-4 sm:-mx-6 lg:-mx-8 mb-10 overflow-hidden ${heightCls} flex items-end`}
        data-hero={kind}
      >
        <div className="absolute inset-0">
          <ContentImage
            priority
            src={image}
            alt={imageAlt}
            sizes={sizes ?? "100vw"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        {/* Readability scrim under the title. */}
        <div className="absolute inset-0 bg-black" style={{ opacity: scrim }} aria-hidden="true" />
        <div
          className="doc-hero-content relative w-full px-4 sm:px-6 lg:px-8 py-10"
          style={titleColor ? { color: titleColor } : undefined}
        >
          {children}
        </div>
      </section>
    );
  }

  // banner
  return (
    <section className={`doc-hero doc-hero-banner -mx-4 sm:-mx-6 lg:-mx-8 mb-10 overflow-hidden ${heightCls}`} data-hero={kind}>
      <ContentImage
        priority
        src={image}
        alt={imageAlt}
        sizes={sizes ?? "100vw"}
        className="h-full w-full object-cover"
      />
      <div className="px-4 sm:px-6 lg:px-8 pt-8">{children}</div>
    </section>
  );
}
