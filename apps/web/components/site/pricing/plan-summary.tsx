import { ORGANIZATION_PLAN_IDS, ORGANIZATION_PLANS } from "@duna/core";
import { ArrowLink } from "../link-button";
import { siteLinks } from "../links";
import { dollars, organizationFeeLine } from "./pricing-data";

/**
 * The club plans in one line each (the clubs page's pricing teaser): name,
 * monthly price and the fee on sales, from the plan table. Details and the
 * calculator are on /pricing.
 */
export function ClubPlanSummary() {
  return (
    <div className="site-plan-strip">
      <ul>
        {ORGANIZATION_PLAN_IDS.map((id) => {
          const plan = ORGANIZATION_PLANS[id];
          return (
            <li data-plan={id} key={id}>
              <span className="site-plan-strip__name">{plan.name}</span>
              <span className="site-plan-strip__price">
                <span className="td-num">
                  {dollars(plan.monthlyPriceMinor)}
                </span>
                <span className="site-meta">a month</span>
              </span>
              <span className="site-plan-strip__fee">
                {organizationFeeLine(plan.defaultCommissionBps)}
              </span>
            </li>
          );
        })}
      </ul>
      <ArrowLink href={siteLinks.pricing}>
        Compare plans and see where every dollar goes
      </ArrowLink>
    </div>
  );
}
