# Training scene: court drawings and the drill player

Work package DRILL-PLAYER, 28 November 2026. The design-system family that
draws a drill (`SceneDiagram`) and plays it in 2D and 3D (`ScenePlayer`), from
the drill scene model v2 in `@duna/core/training-scene` (`duna.drill/2`).
Library conventions are in [`tideline-components.md`](tideline-components.md);
the design contract is [`tideline-4.1.1/README.md`](tideline-4.1.1/README.md).

The animation is an illustration of the drill: positions, timing and ball
flight are tuned to read clearly, not measured. Never present it as
biomechanically exact.

## Use it

```tsx
import { SceneDiagram, ScenePlayer } from "@duna/ui/tideline/training-scene";

<SceneDiagram scene={drill.scene} label={drill.title} step={2} captions />
<ScenePlayer scene={drill.scene} label={drill.title} />
```

The family is also in the `@duna/ui/tideline` barrel. Both components render
inside a `Tideline` scope and take the stored document as is (`unknown`, or
its JSON text). It is validated by `validateTrainingScene` and resolved by
`resolveTrainingScene` before anything is drawn; a scene that does not
validate shows `SceneProblem` ("This drawing has a problem") with the
validator's own messages, errors first, at most six plus a count.

### `SceneDiagram` (server component, SVG)

| Prop          | Type                                  | Default  | Meaning                                                             |
| ------------- | ------------------------------------- | -------- | ------------------------------------------------------------------- |
| `scene`       | `unknown`                             | required | The `duna.drill/2` document. Untrusted.                             |
| `label`       | `string`                              | required | Accessible name, usually the drill title.                           |
| `step`        | `number`                              | none     | Step as a coach counts it (1 = first). Omitted or 0: the whole rep. |
| `orientation` | `"auto" \| "landscape" \| "portrait"` | `auto`   | `auto` turns portrait in containers under 560 px.                   |
| `captions`    | `boolean`                             | `false`  | The step-by-step list (caption plus generated sentence) below.      |
| `legend`      | `boolean`                             | `true`   | The key, built from what the scene contains.                        |
| `rotation`    | `boolean`                             | `false`  | Draw where people walk after the rep.                               |

Step mode fades earlier steps, emphasises the current one and hides later
ones; people and the ball stand where they are when the step starts.

### `ScenePlayer` (client component)

| Prop           | Type                                          | Default     | Meaning                                                 |
| -------------- | --------------------------------------------- | ----------- | ------------------------------------------------------- |
| `scene`        | `unknown`                                     | required    | As above.                                               |
| `label`        | `string`                                      | required    | Accessible name of the player region.                   |
| `step`         | `number`                                      | none        | Open on this step's still.                              |
| `view`         | `"2d" \| "3d"`                                | `"2d"`      | First view; 3D falls back to 2D where it cannot run.    |
| `camera`       | `"server" \| "sideline" \| "top" \| "follow"` | scene's own | First 3D camera.                                        |
| `autoPlay`     | `boolean`                                     | `false`     | Ignored under reduced motion.                           |
| `loop`         | `boolean`                                     | `true`      | Start again at the end.                                 |
| `rotation`     | `boolean`                                     | `true`      | Play the rotation and the next rep with the new people. |
| `onStepChange` | `(step) => void`                              | none        | `{ kind, number, rep }` when the shown step changes.    |

Controls: Previous step, Play / Pause, Next step, a scrub bar with a mark per
step (a square mark for the rotation), speed 0.5× / 1× / 2×, Loop (a toggle
button), 2D / 3D, and in 3D the cameras Behind server, Sideline, Top and
Follow ball (Server, Side, Top, Ball under 520 px). Next plays one step and
pauses on it; Previous replays the current step, or goes back one at its
start. Keyboard: Space or K plays, the arrows step, Home and End jump; the
scrub bar and the option groups keep their own arrow keys; in 3D the focused
view turns with the arrows and zooms with + and −. The caption shows the
coach's caption, the cue for that step and the generated sentence, announced
politely when paused.

Reduced motion: nothing plays on load, Play becomes "Play steps" (a still per
step, 2.6 s each), stepping jumps to stills, 3D cameras cut instead of
moving.

### Pure functions (shared with native)

`prepareTrainingScene`, `buildTimeline`, `sampleTimeline`, `itemIndexAt`,
`stillTime`, `sceneDescription`, `stepSentence`, `legendEntries`, plus the
modules `geometry.ts`, `flight.ts`, `timeline.ts`, `sentences.ts`,
`drawing.ts`. No DOM in any of them.

## How it is computed

- **Units.** Metres from the centre of the net on the floor, exactly as the
  core model: x along the net (side A's right hand is +x), y across it (side
  A is y < 0), z up. The court comes from the resolved scene (beach 16 × 8,
  indoor 18 × 9 with attack lines at 3 m, half courts, open space).
- **Flight** (`flight.ts`): a parabola between two contact points with no
  drag or spin, the same formulas the validator uses to check the net.
  Lofted verbs (pass, set, dig, toss, free ball, roll) fly to a peak height;
  driven verbs (serve, attack, hit, cut) fly at a ground speed. Contact
  heights come from the verb plus a coach's box; the landing height is the
  next contact's height on that ball, or the floor. An arc that would cross
  the net too low is raised the validator's way; an authored `arc` is kept.
  A test pins every example's apex to the validator's.
- **Time** (`timeline.ts`): a contact happens when its ball arrives;
  `after: "previous"` waits for everything before it plus `gap`; `delay`
  nudges one action. Players close on the ball at about 3.2 m/s, standing
  0.3 m behind the contact point; moves take the verb's speed or the
  authored `duration`; after the rep everyone walks back to base. Pepper
  (`ballsBetweenReps: "continuous"`) keeps the ball alive. The rotation walks
  people to their new slots (round the post when they change sides) and the
  same script replays with them; winner-stays shows the scene's `shown`
  outcome. Each step has an item with its start, its still and its sentences.
- **Sentences** (`sentences.ts`): who starts where, then one sentence per
  action ("P2 (left passer) passes the ball to the net on side A, in the
  middle, about 4.4 m high."), indoor zones 1–6, then the rotation.

## The visual language

| Mark                                     | Means                                                |
| ---------------------------------------- | ---------------------------------------------------- |
| Solid circle, Night Court (Salt in dark) | Side A player, label inside                          |
| Hexagon, Hardwood                        | Side B player                                        |
| Same shape, dashed outline, open fill    | Waiting to come in                                   |
| Rounded square, outlined                 | Coach or feeder (on a box when the sentence says so) |
| Heavy, nearly straight line              | Driven ball: serve, jump serve, attack, hit, cut     |
| Curved line                              | Lofted ball: pass, dig, free ball                    |
| Curved dotted line                       | Placed ball: set, toss, roll shot                    |
| Filled number on the path                | Order of the contacts                                |
| Dashed thin line, open arrowhead         | A player moves                                       |
| Dotted Hardwood line                     | Where people walk in the rotation                    |
| Bullseye, cone, square with a cross      | Target, cone, box                                    |
| Box of three balls                       | Ball cart                                            |
| Hatched, dashed rectangle                | Target area                                          |

Team is shape and tone, never colour alone; a path's kind is its weight,
curve and dash, so the drawing reads in black and white. Higher balls bow
more in the plan view; back-and-forth paths between the same two people fan
apart. Labels (roles, equipment, zones, the net height, side names) are
placed by simple collision nudging around dots, numbers and path samples. A
ball resting at a dot slides to the dot's edge so the label stays readable.
Solar is never used: nothing here is live. Colours are `--td-scene-*`
custom properties mapped to tokens in `training-scene.css` for light, dark
and print (white courts, black ink, grey hexagons, one page, portrait).

3D: a low-poly court to scale with the net, posts, antennae and tape; figures
whose bodies have the same shape language (round, six-sided, four-sided),
waiting players faded with a dashed ring, label tags always facing the
camera with a leader line when nudged, the ball drawn at twice its size with
a ground shadow and a drop line when high, flight traces per step and contact
numbers. Free orbit by drag, pinch or ctrl + wheel, with the camera kept
above the floor (about 9° to 83° from straight down) and between 6 and 45 m.

## Performance

- The 2D player renders the court once per step and moves people and balls
  by setting `transform` on refs inside one `requestAnimationFrame` loop: no
  React render per frame. The loop runs only while playing (or while a 3D
  camera moves).
- `scene-3d.ts` is the only module that imports `three` (pinned 0.187.0, the
  package's one new dependency; `@types/three` for types only). The player
  loads it with `import("./scene-3d")` when the 3D view opens, so it is a
  separate chunk: about 558 KB minified, 142 KB gzip (esbuild estimate of the
  same entry; almost all of it is three.js's WebGL renderer). The end-to-end
  spec checks that no script with the renderer loads before 3D is chosen.
- 3D is not offered without WebGL, with a data saver or reduced-data
  preference, or under 1 GB of device memory; a failure while loading falls
  back to 2D and logs `ui.scenePlayer.3d.failed`.
- Caps: the core validator bounds a scene (64 KB, 60 steps, 12 actions a
  step, 40 people and slots); the timeline drops anything after 600 s; label
  placement and flight sampling are bounded per path.

## Native (React Native) later

Everything except the SVG elements, the DOM labels and three.js is shared:
`prepareTrainingScene`, `buildTimeline` / `sampleTimeline` (positions, jumps,
facing, poses), `flight.ts`, `geometry.ts` (projection, court lines, place
words, label placement), `drawing.ts` (every shape in page units) and
`sentences.ts` (accessibility labels and captions). A React Native renderer
maps `Drawing` to `react-native-svg` elements one for one (the marks are
circles, polygons, rects, quadratic paths and text), drives `sampleTimeline`
from a Reanimated frame callback, and could render 3D with expo-gl and the
same `scene-3d.ts` logic. Reduced motion comes from `AccessibilityInfo`.

## Prototype ("Duna Drill Studio") versus the production model

The production module wins. Differences found:

1. The prototype's resolver produced timing, player tracks, recover walks and
   rotation paths; the production `resolveTrainingScene` returns places and
   per-contact apex only. The player's `timeline.ts` is that timing layer.
2. `physics.ts` (`planVerbFlight`, `sampleFlight`) is not exported by the
   core, so `flight.ts` carries the same formulas, pinned by a test.
3. The resolved scene drops authored details the player needs: step
   `after` / `gap`, action `duration` and `arc`, caption templates (captions
   arrive filled with the first rep's people), which slot a `to` named, the
   objective and cues, `view.camera` and `rep.ballsBetweenReps`.
   `prepare.ts` reads them from the validated document by index.
4. The validator measures a held ball's contact from the holder's slot and a
   cart ball's from the cart; the prototype used the player's position at
   that moment. The player follows the prototype for held and cart balls.
5. Timing rules (TELEPORT, SPEED, BALL_HELD, BALL_DEAD, BALL_DROPS,
   SUPPLY_FAR) are not checked in production yet; a scene that breaks them
   plays, with the ball waiting at its arrival point.
6. Winner-stays: production resolves every outcome; the player shows
   `shown` (as the prototype did).
7. Camera names: `three` and `server` open behind the server, `broadcast`
   is Sideline, `top` is Top; Follow ball is new.
8. The prototype coloured sides blue and marigold; production uses the brand
   (Night Court circles, Hardwood hexagons) with shape carrying the team.

## Needs core

Shapes that would remove the duplication above:

```ts
// index.ts
export { planVerbFlight, sampleFlight, netCrossing, clearanceNeeded } from "./physics";

// ResolvedSceneAction, contacts
flight?: { z0: number; z1: number; duration: number; vz0: number; adjusted: boolean; override: boolean };
targetSlot?: string;
// ResolvedSceneAction, moves and holds
duration?: number;

// ResolvedSceneStep
template: string;        // caption with {slot} placeholders
after?: boolean;
gap?: number;
cue?: string;

// ResolvedTrainingScene
objective?: string;
continuous: boolean;     // rep.ballsBetweenReps === "continuous"
camera?: "three" | "broadcast" | "server" | "top";
```

## Tests

- `packages/ui/src/tideline/training-scene/*.test.ts(x)`: geometry (place
  words, projection, court lines, nudging, no overlapping numbers), flight
  (lands on the contact points, raises low arcs, keeps overrides, matches the
  validator's apex, clears the net, verb shapes), timeline (ball waits,
  rotation replays the script with people moved on, winner-stays, pepper,
  `after`, stills), the text alternative of every example (snapshot),
  diagram rendering, step states, the problem state and size caps.
- `tests/e2e/tideline-training-scene.spec.ts` (gallery run in CI): every
  example draws, keyboard control, the 3D chunk loads only on demand,
  reduced-motion stills, no overflow at 320 px and accessibility basics
  (names, references, unique ids). The repository has no axe runner yet;
  adding `@axe-core/playwright` is a separate dependency change.
