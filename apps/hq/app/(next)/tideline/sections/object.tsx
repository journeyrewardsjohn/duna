import {
  Button,
  ObjectHeader,
  SectionNav,
  SubNav,
  type SubNavItem,
} from "@duna/ui/tideline";
import { type GalleryExample, type GalleryGroup } from "../gallery";

const group: GalleryGroup = {
  id: "object",
  title: "Objects and sub-navigation",
  order: 560,
};

/** Fictional placeholders (board data is never real data). */
const areaTabs: SubNavItem[] = [
  { id: "overview", label: "Overview", href: "#overview" },
  { id: "transactions", label: "Transactions", href: "#transactions" },
  { id: "payouts", label: "Payouts", href: "#payouts" },
  { id: "disputes", label: "Disputes", href: "#disputes", count: 1 },
  { id: "refunds", label: "Refunds", href: "#refunds" },
  { id: "setup", label: "Duna Pay setup", href: "#setup" },
  { id: "holds", label: "Holds and reserves", href: "#holds" },
  { id: "tax", label: "Tax", href: "#tax" },
];

const examples: GalleryExample[] = [
  {
    group,
    order: 10,
    title: "SubNav · an area's tabs, the rest under More",
    wide: true,
    content: <SubNav current="payouts" items={areaTabs} label="Money" />,
  },
  {
    group,
    order: 20,
    title: "SubNav · the current tab is never hidden",
    wide: true,
    content: <SubNav current="tax" items={areaTabs} label="Money, Tax open" />,
  },
  {
    group,
    order: 30,
    title: "ObjectHeader · an open object",
    wide: true,
    content: (
      <ObjectHeader
        actions={
          <>
            <Button size="sm" variant="secondary">
              Message buyer
            </Button>
            <Button size="sm" variant="primary">
              Refund
            </Button>
          </>
        }
        back={{ href: "#transactions", label: "Transactions" }}
        description="[Buyer name] · paid by card"
        facts={[
          { label: "Paid", value: "$00.00", numeric: true },
          { label: "Duna fees", value: "$0.00", numeric: true },
          { label: "Club receives", value: "$00.00", numeric: true },
          { label: "Released", value: "Waiting for the session" },
        ]}
        status={{ label: "Waiting for the session", tone: "info" }}
        subnav={
          <SubNav
            current="sale"
            items={[
              { id: "sale", label: "Sale", href: "#sale" },
              { id: "release", label: "Release", href: "#release" },
              { id: "refunds", label: "Refunds", href: "#refunds" },
            ]}
            label="[Item name]"
          />
        }
        title="[Item name]"
      />
    ),
  },
  {
    group,
    order: 40,
    title: "SectionNav · a setup flow with marks",
    content: (
      <SectionNav
        current="verify"
        groups={[
          {
            label: "Duna Pay",
            items: [
              {
                id: "business",
                label: "Business details",
                href: "#business",
                mark: "done",
              },
              {
                id: "verify",
                label: "Verify identity",
                href: "#verify",
                mark: "attention",
                description: "One thing to fix",
              },
              {
                id: "payouts",
                label: "Payout bank",
                href: "#payouts",
                mark: "in-progress",
              },
              {
                id: "ready",
                label: "Ready to take payments",
                href: "#ready",
                mark: "not-started",
              },
            ],
          },
        ]}
        label="Duna Pay setup"
        showProgress
      />
    ),
  },
];

export default examples;
