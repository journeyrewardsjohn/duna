"use client";

import {
  CLUB_COLOUR_ART,
  cardArtPalette,
  dunaArtPiece,
  type CardArtPiece,
  type CardArtSource,
  type CardPalette,
  type CardPixels,
  type DunaArtKey,
} from "@duna/tideline-core";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { useReducedMotion } from "../interactions/kit-hooks";

/**
 * Painted stills and loops for a Duna art piece. When a piece has assets the
 * card shows the still first and plays the loop only when it is the selected
 * card and motion is allowed; without them the shader paints the piece.
 * See docs/design/wallet.md, "Art registry", for formats and sizes.
 */
export interface CardArtAssets {
  /** JPEG (or PNG) poster, 1116 × 704, ≤ 140 KB. */
  readonly poster: string;
  /** The same poster as AVIF (preferred where supported). */
  readonly posterAvif?: string;
  /** A 3–6 s seamless loop, muted: H.264 `.mp4`, optionally AV1 `.mp4`. */
  readonly loop?: { readonly mp4: string; readonly av1?: string };
}

/**
 * Generated stills and loops shipped with the library. Empty today: every
 * piece is painted by the shader. Add a line per piece to swap in painted
 * art (the files live in the app's `public/media/wallet/art/`).
 */
export const CARD_ART_ASSETS: Partial<Record<DunaArtKey, CardArtAssets>> = {};

const AssetsContext =
  createContext<Partial<Record<DunaArtKey, CardArtAssets>>>(CARD_ART_ASSETS);

/** Overrides or adds art assets for everything inside (an app, the gallery). */
export function CardArtProvider({
  assets,
  children,
}: {
  assets: Partial<Record<DunaArtKey, CardArtAssets>>;
  children: ReactNode;
}) {
  const inherited = useContext(AssetsContext);
  return (
    <AssetsContext.Provider value={{ ...inherited, ...assets }}>
      {children}
    </AssetsContext.Provider>
  );
}

// ---------------------------------------------------------------- shader

const RECIPE: Record<CardArtPiece["recipe"], number> = {
  field: 0,
  caustics: 1,
  dune: 2,
  lights: 3,
  grass: 4,
};

const VERTEX = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

// One fragment shader, five recipes. Time enters only as a point moving round
// a circle (L), so every loop is seamless. Grain is static.
const FRAGMENT = `precision highp float;
uniform vec2 R;uniform float T;uniform float S;uniform float SEED;
uniform vec3 C0;uniform vec3 C1;uniform vec3 C2;uniform vec3 C3;
#define TAU 6.2831853
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
vec3 pal(float x){x=clamp(x,0.,1.);if(x<.33)return mix(C0,C1,x/.33);if(x<.66)return mix(C1,C2,(x-.33)/.33);return mix(C2,C3,(x-.66)/.34);}
float beam(vec2 p,vec2 l,float w){float d=l.y-p.y;if(d<0.)return 0.;float x=(p.x-l.x)/(w*(d+.22));return exp(-x*x)*exp(-d*1.1);}
void main(){
 vec2 uv=gl_FragCoord.xy/R;vec2 v=vec2(uv.x,1.-uv.y);vec2 p=vec2(uv.x*1.586,uv.y);
 vec2 L=vec2(cos(TAU*T),sin(TAU*T));vec3 col;
 if(S<.5){
  vec2 q0=p*1.6+SEED;
  vec2 q=vec2(fbm(q0+.2*L),fbm(q0+vec2(5.2,1.3)-.2*L));
  vec2 r=vec2(fbm(q0+3.4*q+vec2(1.7,9.2)+.1*L),fbm(q0+3.4*q+vec2(8.3,2.8)));
  float f=fbm(q0+2.8*r);
  col=pal(f*1.35-.12+.2*q.y);
  col+=C3*pow(clamp(f*1.5-.55,0.,1.),2.)*.6;
  col*=.8+.38*r.x;
  vec2 lp=vec2(1.2,.66);col+=C3*.3*exp(-dot(p-lp,p-lp)*2.4);
 } else if(S<1.5){
  vec2 q0=p*3.+SEED;
  vec2 w=q0+.75*vec2(fbm(q0*.5+.3*L),fbm(q0*.5+3.1-.3*L));
  float k=pow(1.-abs(n(w*1.3+.4*L)-n(w*1.3+7.3-.4*L)),9.);
  float k2=pow(1.-abs(n(w*2.6-.55*L)-n(w*2.6+4.1+.55*L)),12.);
  float depth=fbm(p*1.3+SEED+.08*L);
  col=pal(.12+.6*depth+.15*uv.y);
  col+=C3*(k*.5+k2*.38)*(.4+.75*depth);
  col+=C2*.3*exp(-dot(p-vec2(1.3,.95),p-vec2(1.3,.95))*1.6);
 } else if(S<2.5){
  float d=dot(p,normalize(vec2(.75,.66)))*1.15+1.25*fbm(p*.85+SEED)+.18*fbm(p*3.+SEED);
  float fr=fract(d);float w=.03*L.y;
  float lit=smoothstep(.0,.7+w,fr)*(1.-smoothstep(.78+w,.9+w,fr));
  float tex=fbm(p*4.+SEED);
  col=pal(.08+.85*lit*(.85+.25*tex));
  col+=C3*smoothstep(.72+w,.8+w,fr)*(1.-smoothstep(.8+w,.83+w,fr))*.55;
  col*=1.-.06*lit*sin((p.x*.4+p.y)*90.+6.*tex);
  col+=C3*.22*exp(-dot(p-vec2(1.45,.95),p-vec2(1.45,.95))*1.4);
 } else if(S<3.5){
  float hz=fbm(p*1.5+SEED+.15*L);
  float mist=fbm(p*vec2(1.2,3.2)+vec2(.25*L.x,SEED+.25*L.y));
  col=pal(.05+.3*hz+.16*uv.y);
  vec2 l1=vec2(.42,1.12),l2=vec2(1.28,1.08);
  float c1=exp(-dot(p-l1,p-l1)*3.),c2=exp(-dot(p-l2,p-l2)*3.4);
  float beams=beam(p,l1,.3)+beam(p,l2,.3);
  col+=mix(C2,C3,.4)*beams*(.3+.7*mist)*.6;
  col+=C2*(c1+c2)*.65*(.65+.35*hz);col+=C3*(pow(c1,3.)+pow(c2,3.))*.7;
  col+=C2*.14*smoothstep(.42,.85,mist)*(.4+uv.y);
 } else {
  float hz=fbm(p*1.3+SEED+.12*L);
  col=pal(.42+.42*hz+.2*uv.y);
  col+=C3*.55*exp(-dot(p-vec2(1.25,.85),p-vec2(1.25,.85))*2.);
  col+=C3*.18*smoothstep(.5,.9,fbm(p*2.2+SEED-.1*L))*uv.y;
  float sway=.025*sin(TAU*T+v.x*5.)*v.y;
  float bl=smoothstep(.45,.85,n(vec2((v.x+sway)*55.,v.y*1.8+SEED)));
  col=mix(col,C1*.9+C2*.15,bl*smoothstep(.35,1.,v.y)*.7);
 }
 col*=1.-.16*length(v-vec2(.6,.45));
 col+=(h(floor(gl_FragCoord.xy)*.73+SEED)-.5)*.035;
 gl_FragColor=vec4(col,1.);
}`;

/** The paint width and height of every card canvas (2× a 320 px card). */
export const CARD_ART_SIZE = { width: 640, height: 404 } as const;

interface ArtRenderer {
  readonly canvas: HTMLCanvasElement;
  render(recipe: number, seed: number, palette: CardPalette, t: number): void;
}

let renderer: ArtRenderer | null | undefined;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** One shared WebGL context paints every card; `null` without WebGL. */
function artRenderer(): ArtRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_ART_SIZE.width;
    canvas.height = CARD_ART_SIZE.height;
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) return (renderer = null);
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("link");
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const attribute = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u("R"), canvas.width, canvas.height);
    const tones = [u("C0"), u("C1"), u("C2"), u("C3")];
    const uT = u("T");
    const uS = u("S");
    const uSeed = u("SEED");
    renderer = {
      canvas,
      render(recipe, seed, palette, t) {
        gl.uniform1f(uT, t);
        gl.uniform1f(uS, recipe);
        gl.uniform1f(uSeed, seed);
        palette.forEach((tone, i) => {
          const [r, g, b] = channels(tone);
          gl.uniform3f(tones[i]!, r / 255, g / 255, b / 255);
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  } catch {
    renderer = null;
  }
  return renderer;
}

interface Painted {
  readonly recipe: number;
  readonly seed: number;
  readonly period: number;
  readonly palette: CardPalette;
}

function painted(art: CardArtSource): Painted | null {
  const palette = cardArtPalette(art);
  if (!palette) return null;
  const piece = art.source === "set" ? dunaArtPiece(art.key) : CLUB_COLOUR_ART;
  return {
    recipe: RECIPE[piece.recipe],
    seed: piece.seed,
    period: piece.period,
    palette,
  };
}

/** Paints one frame into a 2D canvas: the shader, or a gradient without WebGL. */
function paint(target: HTMLCanvasElement, art: Painted, t: number) {
  const context = target.getContext("2d");
  if (!context) return;
  const gl = artRenderer();
  if (gl) {
    gl.render(art.recipe, art.seed, art.palette, t);
    context.drawImage(gl.canvas, 0, 0, target.width, target.height);
    return;
  }
  const { width, height } = target;
  const linear = context.createLinearGradient(0, height, width, 0);
  art.palette.forEach((tone, i) => linear.addColorStop(i / 3, tone));
  context.fillStyle = linear;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(
    width * 0.78,
    height * 0.3,
    0,
    width * 0.78,
    height * 0.3,
    width * 0.6,
  );
  glow.addColorStop(0, art.palette[3]);
  glow.addColorStop(1, "transparent");
  context.globalAlpha = 0.45;
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
}

/** A small RGBA sample of whatever is drawn (for the contrast measurement). */
function sample(source: CanvasImageSource): CardPixels | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 101;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(source, 0, 0, 160, 101);
    return context.getImageData(0, 0, 160, 101);
  } catch {
    // A cross-origin image without CORS cannot be read: keep the estimate.
    return null;
  }
}

// ---------------------------------------------------------------- the loop

interface Animator {
  readonly canvas: HTMLCanvasElement;
  readonly art: Painted;
  visible: number;
}

const animators = new Set<Animator>();
let frame = 0;
let last = 0;

/** One loop for the page, 30 fps, and only the most visible card moves. */
function tick(now: number) {
  frame = animators.size > 0 ? requestAnimationFrame(tick) : 0;
  if (document.hidden || now - last < 33) return;
  last = now;
  let best: Animator | null = null;
  for (const animator of animators)
    if (animator.visible > 0 && (!best || animator.visible > best.visible))
      best = animator;
  if (best) paint(best.canvas, best.art, (now / 1000 / best.art.period) % 1);
}

function startLoop(animator: Animator): () => void {
  animators.add(animator);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    animators.delete(animator);
    if (animators.size === 0 && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

interface NavigatorHints {
  connection?: { saveData?: boolean };
  getBattery?: () => Promise<{ charging: boolean; level: number }>;
}

/**
 * Whether card art may move: never under reduced motion, data saver,
 * "reduce data" or a battery below 20 % and not charging (the web's nearest
 * thing to Low Power Mode). False on the server and before hydration, so
 * posters always come first.
 */
export function useCardArtMotion(): boolean {
  const reduced = useReducedMotion();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    const hints = navigator as Navigator & NavigatorHints;
    const quiet =
      hints.connection?.saveData === true ||
      matchMedia("(prefers-reduced-data: reduce)").matches;
    setAllowed(!quiet);
    hints
      .getBattery?.()
      .then((battery) => {
        if (live && !battery.charging && battery.level < 0.2) setAllowed(false);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return allowed && !reduced;
}

/** A CSS gradient of a palette: the server-rendered poster before paint. */
export function paletteGradient(palette: CardPalette): string {
  return `radial-gradient(70% 90% at 82% 24%, ${palette[3]} 0%, transparent 62%), linear-gradient(28deg, ${palette[0]} 0%, ${palette[1]} 38%, ${palette[2]} 78%, ${palette[3]} 100%)`;
}

// ---------------------------------------------------------------- component

export interface CardArtProps {
  art: CardArtSource;
  /** Play the loop (only the selected card should). Stills otherwise. */
  animate?: boolean;
  /** Called with a sample of the poster once it shows (contrast measurement). */
  onPoster?: (pixels: CardPixels) => void;
  className?: string;
}

/**
 * A card's art layer: the poster first (painted by the shader, or the
 * club's / Duna's still), then, for the selected card where motion is
 * allowed, the loop. Paused off screen; still under reduced motion, data
 * saver and low battery.
 */
export function CardArt({
  art,
  animate = false,
  onPoster,
  className,
}: CardArtProps) {
  const assets = useContext(AssetsContext);
  const motion = useCardArtMotion();
  const still =
    art.source === "upload"
      ? { poster: art.poster, loop: art.loop }
      : art.source === "set"
        ? assets[art.key]
        : undefined;
  const shader = still ? null : painted(art);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reported = useRef(onPoster);
  reported.current = onPoster;
  const shaderKey = shader
    ? `${shader.recipe}:${shader.seed}:${shader.palette.join(",")}`
    : "";
  const play = animate && motion;

  // Paint the poster (t = 0) and report it; then loop while selected and seen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shader) return;
    paint(canvas, shader, 0);
    const pixels = sample(canvas);
    if (pixels) reported.current?.(pixels);
    if (!play) return;
    const animator: Animator = { canvas, art: shader, visible: 0 };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              animator.visible = entry?.isIntersecting
                ? entry.intersectionRatio || 0.01
                : 0;
              if (!animator.visible) paint(canvas, shader, 0);
            },
            { threshold: [0, 0.25, 0.5, 0.75, 1] },
          );
    if (observer) observer.observe(canvas);
    else animator.visible = 1;
    const stop = startLoop(animator);
    return () => {
      stop();
      observer?.disconnect();
      paint(canvas, shader, 0);
    };
    // The shader key stands in for the piece and its palette.
  }, [shaderKey, play]);

  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [play, still?.loop?.mp4]);

  if (still) {
    return (
      <span
        className={cx("td-cardart", className)}
        data-ready={ready || undefined}
      >
        <picture>
          {"posterAvif" in still && still.posterAvif ? (
            <source srcSet={still.posterAvif} type="image/avif" />
          ) : null}
          <img
            alt=""
            className="td-cardart__poster"
            decoding="async"
            onLoad={(event) => {
              const pixels = sample(event.currentTarget);
              if (pixels) reported.current?.(pixels);
            }}
            src={still.poster}
          />
        </picture>
        {play && still.loop ? (
          <video
            aria-hidden="true"
            autoPlay
            className="td-cardart__loop"
            loop
            muted
            onCanPlayThrough={() => setReady(true)}
            playsInline
            poster={still.poster}
            preload="auto"
            ref={videoRef}
          >
            {still.loop.av1 ? (
              <source
                src={still.loop.av1}
                type='video/mp4; codecs="av01.0.05M.08"'
              />
            ) : null}
            <source src={still.loop.mp4} type="video/mp4" />
          </video>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={cx("td-cardart", className)}
      style={
        shader
          ? ({ background: paletteGradient(shader.palette) } as CSSProperties)
          : undefined
      }
    >
      <canvas
        aria-hidden="true"
        className="td-cardart__canvas"
        data-art={art.source === "set" ? art.key : "club-colour"}
        height={CARD_ART_SIZE.height}
        ref={canvasRef}
        width={CARD_ART_SIZE.width}
      />
    </span>
  );
}
