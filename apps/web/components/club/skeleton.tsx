/**
 * The detail pages' loading state, shaped like the page that is coming (the
 * hero's title, lead and action beside the photo frame, then a row of
 * cards), so nothing moves when it arrives. The shimmer rests under reduced
 * motion (the kit's `td-skel`).
 */
export function DetailSkeleton({ label }: { readonly label: string }) {
  return (
    <main
      aria-busy="true"
      className="club-page club-skeleton"
      id="main"
      tabIndex={-1}
    >
      <p className="td-sr" role="status">
        {label}
      </p>
      <section aria-hidden="true" className="site-wrap club-hero">
        <div className="club-hero__copy">
          <span className="td-skel club-skeleton__mark" />
          <span className="td-skel club-skeleton__title" />
          <span className="td-skel club-skeleton__line" />
          <span className="td-skel club-skeleton__line club-skeleton__line--short" />
          <span className="td-skel club-skeleton__button" />
        </div>
        <div className="club-hero__stage">
          <span className="td-skel club-skeleton__photo" />
        </div>
      </section>
      <div aria-hidden="true" className="site-wrap club-doors">
        <div className="club-doors__grid">
          {[0, 1, 2].map((index) => (
            <span className="td-skel club-skeleton__card" key={index} />
          ))}
        </div>
      </div>
    </main>
  );
}
