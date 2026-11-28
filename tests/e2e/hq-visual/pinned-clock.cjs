/*
 * Test-only preload for the HQ visual-regression server.
 *
 *   node --require ./tests/e2e/hq-visual/pinned-clock.cjs next start
 *
 * Demo records are generated relative to "now", and HQ renders them relative
 * to "now" again (today's schedule, upcoming filters, month grids). Pinning
 * the server clock makes that server-rendered output identical on every run.
 *
 * The clock is pinned to the minute, not frozen. Each incoming HTTP request
 * moves it STEP_MS forward inside the first WINDOW_MS of the pinned minute,
 * then it wraps. Every rendered minute, hour, and date therefore resolves to
 * the pinned instant, while request time still advances.
 *
 * Request time has to advance because the in-memory rate limiter refills
 * from the time elapsed between calls and every demo request shares one
 * actor. With a frozen clock, or one that follows wall time, the route matrix
 * drains that bucket faster than it refills; calls then fail, some of them
 * silently, and pages render different content from one run to the next.
 * Stepping per request refills the bucket by a fixed amount for every
 * document, script, and stylesheet served, on any machine at any speed.
 *
 * Never load this outside the visual suite. It is inert unless
 * DUNA_VISUAL_NOW holds a valid ISO timestamp.
 */
const pinned = Date.parse(process.env.DUNA_VISUAL_NOW ?? "");

if (Number.isFinite(pinned)) {
  const http = require("node:http");

  const RealDate = Date;
  const WINDOW_MS = 50_000;
  const STEP_MS = 5_000;
  const minute = pinned - (pinned % 60_000);
  let requests = 0;
  const now = () => minute + ((requests * STEP_MS) % WINDOW_MS);

  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function emitWithClockStep(event, ...rest) {
    if (event === "request") requests += 1;
    return emit.call(this, event, ...rest);
  };

  globalThis.Date = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(
        target,
        args.length === 0 ? [now()] : args,
        newTarget,
      );
    },
    apply(target) {
      return new target(now()).toString();
    },
    get(target, property, receiver) {
      if (property === "now") return now;
      return Reflect.get(target, property, receiver);
    },
  });
}
