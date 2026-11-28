/**
 * The 3D view of a drill: a calm low-poly court with the net to scale,
 * simple figures (round for side A, six-sided for side B, square for a
 * coach, as in the drawing), labels that always face the camera, the ball on
 * the same parabolas as the 2D view, and camera presets a coach understands.
 *
 * This module is the only one that imports three.js, and the player loads it
 * with a dynamic import when the 3D view is opened: nothing here is in the
 * page's first bundle. It renders frames from the shared timeline; it never
 * computes timing or flight itself.
 *
 * Floor metres (x along the net, y across, z up) map to three.js as
 * (x, z, -y).
 */
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { BALL_RADIUS, ease, sampleFlight } from "./flight";
import { attackLineOf } from "./geometry";
import type { SceneCameraPreset } from "./prepare";
import type { Frame, FramePerson, PoseKind, Timeline } from "./timeline";

/** Resolved colours (CSS colour strings) read from the family's tokens. */
export interface ScenePalette3D {
  readonly sky: string;
  readonly frame: string;
  readonly courtSand: string;
  readonly courtHard: string;
  readonly line: string;
  readonly net: string;
  readonly ink: string;
  readonly a: string;
  readonly b: string;
  readonly coach: string;
  readonly neutral: string;
  readonly ball: string;
  readonly kit: string;
  readonly zone: string;
  readonly skin: string;
}

export interface Stage3DOptions {
  readonly palette: ScenePalette3D;
  readonly reducedMotion: boolean;
  readonly camera: SceneCameraPreset;
  /** Called when the person drags or zooms (the preset no longer applies). */
  readonly onFreeCamera?: () => void;
}

export interface Stage3D {
  /** Draws a frame. `focusItem` decides which flight traces show. */
  render(frame: Frame): void;
  /** Advances camera motion; true while the camera is still moving. */
  update(seconds: number): boolean;
  setCamera(preset: SceneCameraPreset): void;
  /** Turns the free camera by keyboard: arrows orbit, +/- zoom. */
  nudge(dTheta: number, dPhi: number, zoom: number): void;
  resize(): void;
  dispose(): void;
}

/** Display only: the ball is drawn twice its real size so it can be found. */
const BALL_DISPLAY_SCALE = 2;
const FIGURE_SEGMENTS: Record<string, number> = {
  a: 16,
  b: 6,
  coach: 4,
  neutral: 16,
};

/** Arm angles (radians swung forward from hanging), [left, right]. */
const POSES: Record<PoseKind, readonly [number, number]> = {
  neutral: [0.25, 0.25],
  platform: [1.05, 1.05],
  "hands-high": [2.75, 2.75],
  "arm-up": [1.5, 3.05],
  block: [3.05, 3.05],
  underhand: [1.2, 1.2],
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v3 = (x: number, y: number, z = 0) => new Vector3(x, z, -y);

interface Figure {
  readonly root: Group;
  readonly lower: Mesh;
  readonly upper: Group;
  readonly arms: readonly Group[];
  readonly body: MeshLambertMaterial;
  readonly head: MeshLambertMaterial;
  readonly ring: Group;
  readonly shadow: Mesh;
  readonly tag: HTMLDivElement;
  readonly leader: HTMLDivElement;
}

interface BallView {
  readonly mesh: Mesh;
  readonly shadow: Mesh;
  readonly drop: Line;
}

interface Pose {
  position: Vector3;
  target: Vector3;
}

export function createStage3D(
  container: HTMLElement,
  timeline: Timeline,
  options: Stage3DOptions,
): Stage3D {
  const palette = options.palette;
  const { resolved } = timeline.scene;
  const court = resolved.court;
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.className = "td-scene__gl";
  container.appendChild(renderer.domElement);
  const labelLayer = document.createElement("div");
  labelLayer.className = "td-scene__tags";
  labelLayer.setAttribute("aria-hidden", "true");
  container.appendChild(labelLayer);

  const scene = new Scene();
  scene.background = new Color(palette.sky);
  const camera = new PerspectiveCamera(38, 1, 0.1, 220);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };
  const lambert = (
    color: string,
    extra: Partial<{ transparent: boolean; opacity: number }> = {},
  ) => track(new MeshLambertMaterial({ color: new Color(color), ...extra }));
  const basic = (color: string, opacity = 1) =>
    track(
      new MeshBasicMaterial({
        color: new Color(color),
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );

  scene.add(new HemisphereLight(0xffffff, 0x8a7a60, 1.6));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  const flat = (w: number, h: number, material: Material, y: number) => {
    const mesh = new Mesh(track(new PlaneGeometry(w, h)), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  };

  // ---- ground, court, lines ----
  const hard = court.surface === "hard";
  scene.add(flat(140, 140, lambert(palette.frame), 0));
  const hw = court.width / 2;
  const hl = court.length / 2;
  if (!court.noCourt) {
    const far = court.half ? 0 : hl;
    const courtMesh = flat(
      court.width,
      far + hl,
      lambert(hard ? palette.courtHard : palette.courtSand),
      0.004,
    );
    courtMesh.position.z = -(far - hl) / 2;
    scene.add(courtMesh);
    const lineMaterial = lambert(palette.line);
    const band = 0.08;
    const paint = (x0: number, y0: number, x1: number, y1: number) => {
      const length = Math.hypot(x1 - x0, y1 - y0) + band;
      const mesh = new Mesh(
        track(new BoxGeometry(length, 0.012, band)),
        lineMaterial,
      );
      mesh.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, 0.01));
      mesh.rotation.y = -Math.atan2(y1 - y0, x1 - x0);
      scene.add(mesh);
    };
    paint(-hw, -hl, hw, -hl);
    paint(-hw, -hl, -hw, far);
    paint(hw, -hl, hw, far);
    if (!court.half) paint(-hw, hl, hw, hl);
    const attack = attackLineOf(court);
    if (attack !== null) {
      paint(-hw, 0, hw, 0);
      paint(-hw, -attack, hw, -attack);
      if (!court.half) paint(-hw, attack, hw, attack);
    }
    // Net, posts and the white tape, to scale.
    const netHeight = court.netHeight;
    const postX = court.netLength / 2;
    const postMaterial = lambert(palette.net);
    for (const sign of [-1, 1]) {
      const post = new Mesh(
        track(new CylinderGeometry(0.05, 0.05, netHeight + 0.15, 10)),
        postMaterial,
      );
      post.position.copy(v3(sign * postX, 0, (netHeight + 0.15) / 2));
      scene.add(post);
      const antenna = new Mesh(
        track(new CylinderGeometry(0.012, 0.012, 1.8, 6)),
        postMaterial,
      );
      antenna.position.copy(v3(sign * hw, 0, netHeight - 1 + 0.9));
      scene.add(antenna);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.strokeStyle = palette.net;
      context.globalAlpha = 0.55;
      context.lineWidth = 1;
      const columns = Math.round(court.netLength / 0.1);
      for (let i = 0; i <= columns; i++) {
        const x = (i / columns) * 512;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 64);
        context.stroke();
      }
      for (let j = 0; j <= 10; j++) {
        const y = (j / 10) * 64;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(512, y);
        context.stroke();
      }
    }
    const texture = track(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    const netMesh = new Mesh(
      track(new PlaneGeometry(court.netLength, 1)),
      track(
        new MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    netMesh.position.copy(v3(0, 0, netHeight - 0.5));
    scene.add(netMesh);
    const tape = new Mesh(
      track(new BoxGeometry(court.netLength, 0.07, 0.02)),
      lambert(palette.ball),
    );
    tape.position.copy(v3(0, 0, netHeight - 0.035));
    scene.add(tape);
  }

  // ---- zones, equipment, carts ----
  for (const zone of resolved.zones) {
    if (!zone.rect) continue;
    const w = zone.rect.x1 - zone.rect.x0;
    const h = zone.rect.y1 - zone.rect.y0;
    const mesh = flat(w, h, basic(palette.zone, 0.18), 0.015);
    mesh.position.x = (zone.rect.x0 + zone.rect.x1) / 2;
    mesh.position.z = -(zone.rect.y0 + zone.rect.y1) / 2;
    scene.add(mesh);
  }
  const kitMaterial = lambert(palette.kit);
  const inkMaterial = lambert(palette.ink);
  for (const thing of resolved.equipment) {
    const group = new Group();
    if (thing.kind === "cone") {
      const cone = new Mesh(
        track(new CylinderGeometry(0.01, 0.14, 0.34, 12)),
        kitMaterial,
      );
      cone.position.y = 0.17;
      group.add(cone);
    } else if (thing.kind === "box") {
      const box = new Mesh(track(new BoxGeometry(0.6, 0.6, 0.6)), kitMaterial);
      box.position.y = 0.3;
      group.add(box);
    } else if (thing.kind === "hoop") {
      const hoop = new Mesh(
        track(new RingGeometry(0.38, 0.45, 32)),
        kitMaterial,
      );
      hoop.rotation.x = -Math.PI / 2;
      hoop.position.y = 0.02;
      group.add(hoop);
    } else {
      const disc = new Mesh(
        track(new CylinderGeometry(0.5, 0.5, 0.03, 32)),
        kitMaterial,
      );
      disc.position.y = 0.02;
      const dot = new Mesh(
        track(new CylinderGeometry(0.16, 0.16, 0.04, 20)),
        inkMaterial,
      );
      dot.position.y = 0.03;
      group.add(disc, dot);
    }
    group.position.copy(v3(thing.x, thing.y));
    scene.add(group);
  }
  const cartMaterial = lambert(palette.ink);
  const ballMaterial = lambert(palette.ball);
  for (const thing of resolved.supply) {
    const group = new Group();
    const cart = new Mesh(track(new BoxGeometry(0.8, 0.7, 0.5)), cartMaterial);
    cart.position.y = 0.35;
    group.add(cart);
    for (let i = 0; i < 4; i++) {
      const ball = new Mesh(
        track(new SphereGeometry(BALL_RADIUS, 12, 8)),
        ballMaterial,
      );
      ball.position.set(-0.27 + i * 0.18, 0.8, 0);
      group.add(ball);
    }
    group.position.copy(v3(thing.x, thing.y));
    scene.add(group);
  }

  // ---- figures ----
  const figures = new Map<string, Figure>();
  const lookOf = (person: FramePerson) =>
    person.kind === "coach"
      ? "coach"
      : person.side === "B"
        ? "b"
        : person.side === "A"
          ? "a"
          : "neutral";
  const colorOf = (look: string) =>
    look === "coach"
      ? palette.coach
      : look === "b"
        ? palette.b
        : look === "a"
          ? palette.a
          : palette.neutral;
  const makeFigure = (person: FramePerson): Figure => {
    const look = lookOf(person);
    const segments = FIGURE_SEGMENTS[look] ?? 16;
    const body = new MeshLambertMaterial({
      color: new Color(colorOf(look)),
      transparent: true,
    });
    track(body);
    const headMaterial = new MeshLambertMaterial({
      color: new Color(palette.skin),
      transparent: true,
    });
    track(headMaterial);
    const root = new Group();
    const lower = new Mesh(
      track(new CylinderGeometry(0.19, 0.2, 0.82, segments)),
      body,
    );
    lower.position.y = 0.41;
    const upper = new Group();
    const torso = new Mesh(
      track(new CylinderGeometry(0.24, 0.2, 0.6, segments)),
      body,
    );
    torso.position.y = 1.12;
    const head = new Mesh(
      track(new SphereGeometry(0.13, 16, 12)),
      headMaterial,
    );
    head.position.y = 1.58;
    upper.add(torso, head);
    const arms: Group[] = [];
    for (const sign of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(sign * 0.29, 1.36, 0);
      const arm = new Mesh(
        track(new CylinderGeometry(0.055, 0.05, 0.64, 8)),
        body,
      );
      arm.position.y = -0.32;
      pivot.add(arm);
      upper.add(pivot);
      arms.push(pivot);
    }
    root.add(lower, upper);
    const ring = new Group();
    const ringMaterial = basic(palette.ink, 0.6);
    for (let i = 0; i < 10; i++) {
      const piece = new Mesh(
        track(
          new RingGeometry(
            0.4,
            0.46,
            4,
            1,
            (i / 10) * Math.PI * 2,
            Math.PI / 10,
          ),
        ),
        ringMaterial,
      );
      ring.add(piece);
    }
    ring.rotation.x = -Math.PI / 2;
    const shadow = new Mesh(
      track(new CircleGeometry(0.36, 20)),
      basic("#000000", 0.16),
    );
    shadow.rotation.x = -Math.PI / 2;
    scene.add(root, ring, shadow);
    const tag = document.createElement("div");
    tag.className = `td-scene__tag td-scene__tag--${look}${person.waiting ? " td-scene__tag--waiting" : ""}`;
    tag.textContent = person.label;
    const leader = document.createElement("div");
    leader.className = "td-scene__leader";
    labelLayer.append(leader, tag);
    return {
      root,
      lower,
      upper,
      arms,
      body,
      head: headMaterial,
      ring,
      shadow,
      tag,
      leader,
    };
  };

  // ---- balls ----
  const balls = new Map<string, BallView>();
  for (const ball of resolved.balls) {
    const radius = BALL_RADIUS * BALL_DISPLAY_SCALE;
    const mesh = new Mesh(
      track(new SphereGeometry(radius, 20, 14)),
      lambert(palette.ball, { transparent: true }),
    );
    const shadow = new Mesh(
      track(new CircleGeometry(radius * 1.2, 20)),
      basic("#000000", 0.25),
    );
    shadow.rotation.x = -Math.PI / 2;
    const drop = new Line(
      track(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()])),
      track(
        new LineBasicMaterial({
          color: new Color(palette.ink),
          transparent: true,
          opacity: 0.35,
        }),
      ),
    );
    scene.add(mesh, shadow, drop);
    balls.set(ball.id, { mesh, shadow, drop });
  }

  // ---- flight traces and contact numbers, per rep ----
  interface Trace {
    readonly mesh: Mesh;
    readonly material: MeshBasicMaterial;
    readonly stepIndex: number;
    readonly t0: number;
    readonly badge: HTMLDivElement;
    readonly at: Vector3;
  }
  let traces: Trace[] = [];
  let tracesFor = -1;
  const traceGroup = new Group();
  scene.add(traceGroup);
  const buildTraces = (repIndex: number) => {
    for (const trace of traces) {
      trace.mesh.geometry.dispose();
      trace.material.dispose();
      trace.badge.remove();
    }
    traceGroup.clear();
    traces = [];
    tracesFor = repIndex;
    const rep = timeline.reps[repIndex];
    if (!rep) return;
    for (const contact of rep.contacts) {
      const count = Math.max(10, Math.round(contact.flight.distance * 2));
      const points: Vector3[] = [];
      for (let k = 0; k <= count; k++) {
        const at = sampleFlight(
          contact.flight,
          (k / count) * contact.flight.duration,
        );
        points.push(v3(at.x, at.y, at.z));
      }
      const geometry = new TubeGeometry(
        new CatmullRomCurve3(points),
        count * 2,
        0.025,
        5,
        false,
      );
      const material = new MeshBasicMaterial({
        color: new Color(palette.ink),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, material);
      traceGroup.add(mesh);
      const badge = document.createElement("div");
      badge.className = "td-scene__tag td-scene__tag--badge";
      badge.textContent = String(contact.number);
      labelLayer.appendChild(badge);
      traces.push({
        mesh,
        material,
        stepIndex: contact.stepIndex,
        t0: contact.t0,
        badge,
        at: v3(contact.from.x, contact.from.y, Math.max(contact.from.z, 0.2)),
      });
    }
  };

  // ---- camera ----
  let width = 1;
  let height = 1;
  let preset: SceneCameraPreset | "free" = options.camera;
  let current: Pose = {
    position: new Vector3(12, 12, 12),
    target: new Vector3(),
  };
  let tween: { from: Pose; to: SceneCameraPreset; elapsed: number } | null =
    null;
  const orbit = {
    theta: 0.9,
    phi: 1.0,
    radius: 22,
    target: new Vector3(0, 0.6, 0),
  };
  const followTarget = new Vector3(0, 1, 0);
  let lastFrame: Frame | undefined;

  const serveContact = () =>
    timeline.reps[0]?.contacts.find(
      (contact) => contact.verb === "serve" || contact.verb === "jumpserve",
    ) ?? timeline.reps[0]?.contacts[0];

  /** Everything a coach must see: the court, every slot (feet and head), carts, posts. */
  const framePoints: Vector3[] = (() => {
    const points: Vector3[] = [];
    if (!court.noCourt) {
      const far = court.half ? 0.5 : hl;
      for (const [x, y] of [
        [-hw, -hl],
        [hw, -hl],
        [-hw, far],
        [hw, far],
      ] as const) {
        points.push(v3(x, y, 0));
      }
      points.push(
        v3(-court.netLength / 2, 0, court.netHeight),
        v3(court.netLength / 2, 0, court.netHeight),
      );
    }
    for (const slot of resolved.slots) {
      if (!slot.occupant) continue;
      points.push(v3(slot.x, slot.y, 0), v3(slot.x, slot.y, 2.1));
    }
    for (const thing of resolved.supply) points.push(v3(thing.x, thing.y, 1));
    return points;
  })();

  const probe = new PerspectiveCamera(38, 1, 0.1, 220);
  const fit = (target: Vector3, direction: Vector3, up: Vector3): Pose => {
    probe.aspect = width / Math.max(height, 1);
    probe.updateProjectionMatrix();
    const unit = direction.clone().normalize();
    let distance = 6;
    for (let i = 0; i < 70; i++) {
      probe.position.copy(target).addScaledVector(unit, distance);
      probe.up.copy(up);
      probe.lookAt(target);
      probe.updateMatrixWorld();
      const fits = framePoints.every((point) => {
        const q = point.clone().project(probe);
        return Math.abs(q.x) < 0.9 && Math.abs(q.y) < 0.86 && q.z < 1;
      });
      if (fits) break;
      distance *= 1.05;
    }
    return { position: target.clone().addScaledVector(unit, distance), target };
  };

  const topUp = () =>
    width < height ? new Vector3(0, 0, -1) : new Vector3(-1, 0, 0);

  const presetPose = (name: SceneCameraPreset): Pose => {
    if (name === "top") {
      const centre = court.half ? v3(0, -hl / 2 - 0.5, 0) : new Vector3();
      return fit(centre, new Vector3(0, 1, 0.0001), topUp());
    }
    if (name === "sideline") {
      const centreY = court.half ? -hl / 2 : 0;
      return fit(
        v3(0, centreY, 0.6),
        new Vector3(1, 0.5, 0.12),
        new Vector3(0, 1, 0),
      );
    }
    if (name === "follow") {
      const aspect = width / Math.max(height, 1);
      const pull = aspect < 0.8 ? 1.6 : aspect < 1.3 ? 1.25 : 1;
      const target = followTarget.clone();
      return {
        position: target.clone().add(new Vector3(7.5 * pull, 5.2, 4.5 * pull)),
        target,
      };
    }
    // Behind the server, high enough to see over them to the receivers
    // (behind side A when nobody serves).
    const serve = serveContact();
    const from = serve ? serve.from : { x: 0, y: -hl - 1, z: 0 };
    const sign = Math.sign(from.y) || -1;
    const target = v3(from.x * 0.25, -sign * 1.5, 0.4);
    // Three.js z is minus floor y: "back from the net" on the server's side.
    return fit(
      target,
      new Vector3(from.x >= 0 ? 0.16 : -0.16, 0.8, -sign * 1),
      new Vector3(0, 1, 0),
    );
  };

  const apply = (pose: Pose) => {
    camera.position.copy(pose.position);
    camera.up.set(0, 1, 0);
    if (preset === "top") camera.up.copy(topUp());
    camera.lookAt(pose.target);
    current = { position: pose.position.clone(), target: pose.target.clone() };
  };

  const syncOrbit = () => {
    const offset = current.position.clone().sub(current.target);
    orbit.radius = offset.length();
    orbit.phi = Math.acos(Math.min(Math.max(offset.y / orbit.radius, -1), 1));
    orbit.theta = Math.atan2(offset.z, offset.x);
    orbit.target = current.target.clone();
  };

  const applyOrbit = () => {
    orbit.phi = Math.min(Math.max(orbit.phi, 0.15), 1.45);
    orbit.radius = Math.min(Math.max(orbit.radius, 6), 45);
    const position = new Vector3(
      orbit.target.x +
        orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z +
        orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    );
    apply({ position, target: orbit.target.clone() });
  };

  const goFree = () => {
    if (preset !== "free") {
      syncOrbit();
      preset = "free";
      tween = null;
      options.onFreeCamera?.();
    }
  };

  // ---- pointer: drag to orbit, pinch or ctrl + wheel to zoom ----
  const element = container;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const onDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    element.setPointerCapture?.(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const span = Math.hypot(p!.x - q!.x, p!.y - q!.y);
      if (pinch > 0) {
        goFree();
        orbit.radius *= pinch / Math.max(span, 1);
        applyOrbit();
      }
      pinch = span;
      return;
    }
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    goFree();
    orbit.theta += dx * 0.006;
    orbit.phi -= dy * 0.005;
    applyOrbit();
  };
  const onUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  const onWheel = (event: WheelEvent) => {
    // The page keeps scrolling; ctrl or a trackpad pinch zooms.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    goFree();
    orbit.radius *= 1 + Math.sign(event.deltaY) * 0.08;
    applyOrbit();
  };
  element.addEventListener("pointerdown", onDown);
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerup", onUp);
  element.addEventListener("pointercancel", onUp);
  element.addEventListener("wheel", onWheel, { passive: false });

  const project2d = (point: Vector3) => {
    const projected = point.clone().project(camera);
    return {
      x: ((projected.x + 1) / 2) * width,
      y: ((1 - projected.y) / 2) * height,
      behind: projected.z > 1,
    };
  };

  const stage: Stage3D = {
    render(frame: Frame) {
      lastFrame = frame;
      const flying =
        frame.balls.find((ball) => ball.inFlight) ??
        frame.balls.find((ball) => ball.visible);
      if (flying)
        followTarget.lerp(v3(flying.x, flying.y, Math.min(flying.z, 2.5)), 1);
      if (preset === "follow" && !tween) {
        const wanted = presetPose("follow");
        const k = options.reducedMotion ? 1 : 0.08;
        apply({
          position: current.position.clone().lerp(wanted.position, k),
          target: current.target.clone().lerp(wanted.target, k),
        });
      }
      // Traces of the current rep: done faint, now strong, later hidden.
      const repIndex = frame.rep;
      if (repIndex !== undefined && repIndex !== tracesFor)
        buildTraces(repIndex);
      traceGroup.visible = repIndex !== undefined;
      const item = timeline.items[frame.item];
      const focus = item?.kind === "step" ? (item.stepIndex ?? 0) : -1;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const trace of traces) {
        const visible = repIndex !== undefined && trace.stepIndex <= focus;
        trace.mesh.visible = visible;
        trace.material.opacity = trace.stepIndex === focus ? 0.85 : 0.28;
        const shown = visible && frame.local >= trace.t0 - 0.05;
        const spot = project2d(trace.at);
        trace.badge.style.visibility =
          shown && !spot.behind ? "visible" : "hidden";
        trace.badge.dataset.state = trace.stepIndex === focus ? "now" : "done";
        trace.badge.style.transform = `translate(-50%, -50%) translate(${spot.x + 14}px, ${spot.y}px)`;
        if (shown) placed.push({ x: spot.x + 14, y: spot.y, w: 22, h: 22 });
      }
      // Figures: nearest first so labels of nearer people win their spot.
      const seen = new Set<string>();
      const people = [...frame.people].sort(
        (a, b) => project2d(v3(b.x, b.y, 2)).y - project2d(v3(a.x, a.y, 2)).y,
      );
      for (const person of people) {
        let figure = figures.get(person.person);
        if (!figure) {
          figure = makeFigure(person);
          figures.set(person.person, figure);
        }
        seen.add(person.person);
        const look = lookOf(person);
        figure.body.color.set(colorOf(look));
        const opacity = person.waiting ? 0.6 : 1;
        figure.body.opacity = opacity;
        figure.head.opacity = opacity;
        const lift = person.z + person.onBox;
        figure.root.visible = true;
        figure.root.position.copy(v3(person.x, person.y, lift));
        figure.root.rotation.y = Math.atan2(
          Math.sin(person.facing),
          -Math.cos(person.facing),
        );
        const pose = POSES[person.pose.kind] ?? POSES.neutral;
        const w = person.pose.weight;
        figure.arms[0]!.rotation.x = -lerp(POSES.neutral[0], pose[0], w);
        figure.arms[1]!.rotation.x = -lerp(POSES.neutral[1], pose[1], w);
        const inward = person.pose.kind === "platform" ? 0.28 * w : 0;
        figure.arms[0]!.rotation.z = -inward;
        figure.arms[1]!.rotation.z = inward;
        const crouch = person.pose.kind === "platform" ? 0.2 * w : 0;
        figure.lower.scale.y = 1 - crouch;
        figure.lower.position.y = 0.41 * (1 - crouch);
        figure.upper.position.y = -0.82 * crouch;
        figure.ring.visible = person.waiting;
        figure.ring.position.copy(v3(person.x, person.y, 0.02));
        figure.shadow.position.copy(v3(person.x, person.y, 0.015));
        figure.tag.textContent = person.label;
        // The tag sits just above the head; if it must move up to stay
        // clear, a thin leader joins it to its person.
        const spot = project2d(v3(person.x, person.y, lift + 1.95));
        const tagW = figure.tag.offsetWidth || 30;
        const tagH = figure.tag.offsetHeight || 22;
        const x = Math.min(
          Math.max(spot.x, tagW / 2 + 2),
          width - tagW / 2 - 2,
        );
        let centre = spot.y - tagH / 2 - 2;
        for (let tries = 0; tries < 8; tries++) {
          const hit = placed.find(
            (box) =>
              Math.abs(box.x - x) * 2 < box.w + tagW + 4 &&
              Math.abs(box.y - centre) * 2 < box.h + tagH + 2,
          );
          if (!hit) break;
          centre = hit.y - (hit.h + tagH) / 2 - 2;
        }
        placed.push({ x, y: centre, w: tagW, h: tagH });
        figure.tag.style.transform = `translate(-50%, -50%) translate(${x}px, ${centre}px)`;
        figure.tag.style.visibility = spot.behind ? "hidden" : "visible";
        const bottom = centre + tagH / 2;
        const drop = spot.y - bottom;
        if (drop > 6 && !spot.behind) {
          figure.leader.style.visibility = "visible";
          figure.leader.style.height = `${drop}px`;
          figure.leader.style.transform = `translate(${spot.x}px, ${bottom}px)`;
        } else {
          figure.leader.style.visibility = "hidden";
        }
      }
      for (const [id, figure] of figures) {
        if (seen.has(id)) continue;
        figure.root.visible = false;
        figure.ring.visible = false;
        figure.tag.style.visibility = "hidden";
        figure.leader.style.visibility = "hidden";
      }
      for (const [id, view] of balls) {
        const ball = frame.balls.find((entry) => entry.id === id);
        const visible = Boolean(ball?.visible);
        view.mesh.visible = visible;
        view.shadow.visible = visible;
        view.drop.visible = false;
        if (!ball || !visible) continue;
        view.mesh.position.copy(v3(ball.x, ball.y, ball.z));
        (view.mesh.material as MeshLambertMaterial).opacity = ball.alpha;
        view.shadow.position.copy(v3(ball.x, ball.y, 0.02));
        (view.shadow.material as MeshBasicMaterial).opacity =
          0.28 * ball.alpha * Math.max(0.35, 1 - ball.z / 7);
        if (ball.z > 1.6) {
          view.drop.visible = true;
          view.drop.geometry.setFromPoints([
            v3(ball.x, ball.y, ball.z - 0.2),
            v3(ball.x, ball.y, 0.02),
          ]);
        }
      }
      renderer.render(scene, camera);
    },
    update(seconds: number) {
      if (!tween) return preset === "follow";
      tween.elapsed += seconds;
      const k = Math.min(tween.elapsed / 0.7, 1);
      const to = presetPose(tween.to);
      const e = ease(k);
      apply({
        position: tween.from.position.clone().lerp(to.position, e),
        target: tween.from.target.clone().lerp(to.target, e),
      });
      if (k >= 1) tween = null;
      return true;
    },
    setCamera(name: SceneCameraPreset) {
      preset = name;
      if (options.reducedMotion) {
        tween = null;
        apply(presetPose(name));
      } else {
        tween = {
          from: {
            position: current.position.clone(),
            target: current.target.clone(),
          },
          to: name,
          elapsed: 0,
        };
      }
      if (lastFrame) stage.render(lastFrame);
    },
    nudge(dTheta: number, dPhi: number, zoom: number) {
      goFree();
      orbit.theta += dTheta;
      orbit.phi += dPhi;
      orbit.radius *= zoom;
      applyOrbit();
      if (lastFrame) stage.render(lastFrame);
    },
    resize() {
      const box = container.getBoundingClientRect();
      width = Math.max(box.width, 10);
      height = Math.max(box.height, 10);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (preset !== "free" && !tween) apply(presetPose(preset));
      if (lastFrame) stage.render(lastFrame);
    },
    dispose() {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      element.removeEventListener("wheel", onWheel);
      for (const trace of traces) {
        trace.mesh.geometry.dispose();
        trace.material.dispose();
      }
      for (const thing of disposables) thing.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.remove();
    },
  };
  stage.resize();
  apply(presetPose(options.camera));
  return stage;
}
