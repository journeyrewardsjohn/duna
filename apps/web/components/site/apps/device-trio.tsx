import { Reveal } from "../reveal";

/**
 * One app, every size (docs/design/tideline-4.1.1/adaptive.md): layouts by
 * width, drawn as plain frames so the idea reads without a screenshot. A
 * phone is one column; the iPhone Duo open is two panes side by side; the
 * iPad keeps a sidebar beside the content. No function lives on only one
 * size. The frames Rally in once.
 */
export function DeviceTrio() {
  return (
    <Reveal as="ul" className="site-devices" rally>
      <li>
        <div aria-hidden="true" className="site-device" data-device="phone">
          <span className="site-device__bar" />
          <span className="site-device__card" data-tall="" />
          <span className="site-device__card" />
          <span className="site-device__card" />
          <span className="site-device__tabs" />
        </div>
        <p className="site-device__name">iPhone</p>
        <p className="site-meta">One column, the tab bar at your thumb.</p>
      </li>
      <li>
        <div aria-hidden="true" className="site-device" data-device="duo">
          <span className="site-device__pane">
            <span className="site-device__card" />
            <span className="site-device__card" />
            <span className="site-device__card" />
          </span>
          <span className="site-device__hinge" />
          <span className="site-device__pane">
            <span className="site-device__card" data-tall="" />
            <span className="site-device__card" />
          </span>
        </div>
        <p className="site-device__name">The foldable, open</p>
        <p className="site-meta">
          The list on one side, the detail on the other.
        </p>
      </li>
      <li>
        <div aria-hidden="true" className="site-device" data-device="ipad">
          <span className="site-device__side" />
          <span className="site-device__pane">
            <span className="site-device__card" data-tall="" />
            <span className="site-device__row">
              <span className="site-device__card" />
              <span className="site-device__card" />
            </span>
          </span>
        </div>
        <p className="site-device__name">iPad</p>
        <p className="site-meta">
          A sidebar beside the page, full screen or split.
        </p>
      </li>
    </Reveal>
  );
}
