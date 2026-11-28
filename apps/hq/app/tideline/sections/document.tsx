import {
  DocumentProse,
  DocumentSectionList,
  DocumentTable,
  SectionHeading,
} from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";

const sections = [
  { id: "doc-demo-scope", title: "1. Scope" },
  {
    id: "doc-demo-payouts",
    title: "2. Payouts",
    children: [{ id: "doc-demo-timing", title: "Timing" }],
  },
];

const examples: GalleryExample[] = [
  {
    group: galleryGroups.feedback,
    order: 90,
    title: "Document: section list, linkable headings, scrolling table",
    wide: true,
    content: (
      <div className="td-gallery-document">
        <DocumentSectionList
          label="Sections of the sample policy"
          sections={sections}
        />
        <DocumentProse>
          <SectionHeading id="doc-demo-scope" title="1. Scope">
            1. Scope
          </SectionHeading>
          <p>
            This sample policy covers payouts to clubs. Headings carry a Copy
            link button; the section list marks the one you are reading.
          </p>
          <SectionHeading id="doc-demo-payouts" title="2. Payouts">
            2. Payouts
          </SectionHeading>
          <SectionHeading id="doc-demo-timing" level={3} title="Timing">
            Timing
          </SectionHeading>
          <DocumentTable label="Payout timing">
            <table>
              <thead>
                <tr>
                  <th>What was sold</th>
                  <th>When it is released</th>
                  <th>When it reaches the bank</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>A court booking or lesson</td>
                  <td>When the session ends</td>
                  <td>Within three business days of release</td>
                </tr>
              </tbody>
            </table>
          </DocumentTable>
        </DocumentProse>
      </div>
    ),
  },
];

export default examples;
