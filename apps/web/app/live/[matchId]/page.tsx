import { Badge, DunaMark, Numeric } from "@duna/ui";
import { Radio, Share2 } from "lucide-react";

export const metadata = { title: "Live match" };

export default function PublicLiveMatchPage() {
  return (
    <main className="public-live">
      <header>
        <DunaMark />
        <Badge tone="live">
          <Radio size={12} /> Live
        </Badge>
        <button>
          <Share2 size={17} /> Share
        </button>
      </header>
      <section>
        <div className="public-live__meta">
          <span>Sunset Open · Quarterfinal</span>
          <strong>Manhattan Beach · Court 4</strong>
          <small>Set 3 · side switch at 15</small>
        </div>
        <div className="public-live__score">
          <article>
            <div>
              <span className="avatar">ML</span>
              <span className="avatar">TP</span>
            </div>
            <h1>Mara / Theo</h1>
            <Numeric>13</Numeric>
            <Badge tone="positive">Serving</Badge>
          </article>
          <span>VS</span>
          <article>
            <div>
              <span className="avatar">NW</span>
              <span className="avatar">ET</span>
            </div>
            <h1>Noa / Elena</h1>
            <Numeric>11</Numeric>
            <Badge>Receiving</Badge>
          </article>
        </div>
        <div className="public-live__sets">
          <span>
            <small>SET 1</small>
            <Numeric>21–17</Numeric>
          </span>
          <span>
            <small>SET 2</small>
            <Numeric>18–21</Numeric>
          </span>
          <span className="active">
            <small>SET 3</small>
            <Numeric>13–11</Numeric>
          </span>
        </div>
      </section>
      <footer>
        Live view updates automatically. Official scores come from the assigned
        scorekeeper’s device.
      </footer>
    </main>
  );
}
