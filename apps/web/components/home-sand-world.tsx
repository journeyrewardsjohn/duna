"use client";

import { useEffect, useRef } from "react";

const vertexShader = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_progress;
uniform float u_dark;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotation * p * 2.03 + 17.13;
    amplitude *= 0.48;
  }

  return value;
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float terrain(vec2 point) {
  float chapterTurn = mix(-0.22, 0.48, smoothstep(0.08, 0.92, u_progress));
  point = rotate2d(chapterTurn) * point;

  float broad = sin(point.x * 0.48 + point.y * 0.10) * 0.22;
  broad += sin(point.x * 0.19 - point.y * 0.31 + 1.8) * 0.16;
  float wind = sin(point.x * 3.35 + sin(point.y * 0.82)) * 0.025;
  float detail = (fbm(point * 0.62 + vec2(0.0, u_time * 0.008)) - 0.5) * 0.78;

  return broad + detail + wind - 0.10;
}

vec3 terrainNormal(vec2 point) {
  float epsilon = 0.012;
  float center = terrain(point);
  float x = terrain(point + vec2(epsilon, 0.0));
  float z = terrain(point + vec2(0.0, epsilon));
  return normalize(vec3(center - x, epsilon, center - z));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float progress = clamp(u_progress, 0.0, 1.0);
  float orbit = mix(-0.48, 0.58, smoothstep(0.02, 0.96, progress));
  orbit += u_pointer.x * 0.08;

  vec3 camera = vec3(
    sin(orbit) * 4.8,
    mix(2.45, 1.22, smoothstep(0.0, 0.88, progress)) + u_pointer.y * 0.18,
    -4.4 + cos(orbit) * 0.42
  );
  vec3 target = vec3(
    mix(-0.32, 0.48, progress),
    mix(0.08, -0.06, progress),
    mix(1.35, 2.72, progress)
  );
  vec3 forward = normalize(target - camera);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 ray = normalize(forward * 1.62 + right * uv.x + up * uv.y);

  float travel = 0.0;
  float distanceToSurface = 1.0;
  bool hit = false;

  for (int i = 0; i < 72; i++) {
    vec3 position = camera + ray * travel;
    distanceToSurface = position.y - terrain(position.xz);

    if (distanceToSurface < 0.006) {
      hit = true;
      break;
    }

    travel += clamp(distanceToSurface * 0.34, 0.018, 0.24);
    if (travel > 15.0) {
      break;
    }
  }

  vec3 lightBackground = mix(
    vec3(1.0),
    vec3(0.89, 0.94, 0.96),
    clamp(uv.y * 0.28 + 0.34, 0.0, 1.0)
  );
  vec3 darkBackground = mix(
    vec3(0.025, 0.034, 0.040),
    vec3(0.055, 0.082, 0.096),
    clamp(uv.y * 0.34 + 0.42, 0.0, 1.0)
  );
  vec3 background = mix(lightBackground, darkBackground, u_dark);
  vec3 color = background;

  if (hit) {
    vec3 position = camera + ray * travel;
    vec3 normal = terrainNormal(position.xz);
    vec3 sunDirection = normalize(vec3(-0.48, 0.76, -0.28));
    float diffuse = max(dot(normal, sunDirection), 0.0);
    float backlight = pow(max(dot(normal, -sunDirection), 0.0), 2.0);
    float heightTone = smoothstep(-0.52, 0.62, position.y);
    float grain = noise(position.xz * 16.0) * 0.055;

    vec3 sandLow = mix(vec3(0.80, 0.68, 0.49), vec3(0.105, 0.125, 0.135), u_dark);
    vec3 sandHigh = mix(vec3(0.985, 0.965, 0.91), vec3(0.31, 0.27, 0.21), u_dark);
    vec3 sand = mix(sandLow, sandHigh, heightTone * 0.72 + diffuse * 0.28);
    sand *= 0.72 + diffuse * 0.42 + backlight * 0.12 + grain;

    float contour = abs(fract(position.y * 12.0) - 0.5);
    float contourLine = 1.0 - smoothstep(0.465, 0.5, contour);
    sand = mix(sand, mix(vec3(0.70, 0.58, 0.38), vec3(0.40, 0.52, 0.56), u_dark), contourLine * 0.09);

    float courtPhase = smoothstep(0.27, 0.42, progress) * (1.0 - smoothstep(0.70, 0.84, progress));
    float sideline = 1.0 - smoothstep(0.025, 0.060, abs(abs(position.x) - 1.22));
    float baseline = 1.0 - smoothstep(0.025, 0.060, abs(position.z - 3.25));
    float courtLine = max(sideline * step(0.25, position.z) * step(position.z, 4.8), baseline * step(abs(position.x), 1.24));
    sand = mix(sand, mix(vec3(0.99), vec3(0.70, 0.80, 0.83), u_dark), courtLine * courtPhase * 0.72);

    float fog = 1.0 - exp(-travel * mix(0.15, 0.11, u_dark));
    fog = clamp(fog + smoothstep(0.0, 0.78, ray.y) * 0.14, 0.0, 0.94);
    color = mix(sand, background, fog);
  }

  float atmosphere = noise(uv * vec2(52.0, 18.0) + vec2(u_time * 0.018, 0.0));
  atmosphere = smoothstep(0.965, 1.0, atmosphere) * smoothstep(-0.55, 0.18, uv.y) * (1.0 - smoothstep(0.18, 0.82, uv.y));
  color += mix(vec3(0.40, 0.28, 0.12), vec3(0.18, 0.32, 0.38), u_dark) * atmosphere * 0.16;

  float vignette = smoothstep(1.55, 0.18, length(uv * vec2(0.62, 0.82)));
  color *= mix(0.94, 1.0, vignette);
  color = pow(color, vec3(0.96));

  gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

export function HomeSandWorld({ className }: { readonly className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest<HTMLElement>("[data-sand-world]");
    if (!canvas || !host) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      canvas.dataset.renderer = "fallback";
      return;
    }
    const renderCanvas = canvas;
    const renderContext = gl;

    const vertex = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();

    if (!vertex || !fragment || !program) {
      canvas.dataset.renderer = "fallback";
      return;
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.dataset.renderer = "fallback";
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }

    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const pointerLocation = gl.getUniformLocation(program, "u_pointer");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const progressLocation = gl.getUniformLocation(program, "u_progress");
    const darkLocation = gl.getUniformLocation(program, "u_dark");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { readonly saveData?: boolean };
      }
    ).connection;
    const pointer = { x: 0, y: 0 };
    const targetPointer = { x: 0, y: 0 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrame = 0;
    let visible = true;
    let disposed = false;

    const shouldAnimate = () => !reducedMotion.matches && !connection?.saveData;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(
        window.devicePixelRatio || 1,
        1440 / Math.max(bounds.width, 1),
        900 / Math.max(bounds.height, 1),
      );
      width = Math.max(1, Math.round(bounds.width * scale));
      height = Math.max(1, Math.round(bounds.height * scale));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const readProgress = () => {
      if (!shouldAnimate()) return 0.36;
      const bounds = host.getBoundingClientRect();
      const distance = Math.max(host.offsetHeight - window.innerHeight, 1);
      return Math.min(1, Math.max(0, -bounds.top / distance));
    };

    function scheduleRender() {
      if (disposed || !visible || frame) return;
      frame = window.requestAnimationFrame(render);
    }

    function render(timestamp: number) {
      frame = 0;
      if (disposed || !visible) return;
      if (timestamp - lastFrame < 32) {
        scheduleRender();
        return;
      }
      lastFrame = timestamp;

      resize();
      pointer.x += (targetPointer.x - pointer.x) * 0.055;
      pointer.y += (targetPointer.y - pointer.y) * 0.055;

      const isDark = document.documentElement.dataset.theme === "dark";
      const motionTime = shouldAnimate() ? timestamp / 1000 : 0;

      renderContext.uniform2f(resolutionLocation, width, height);
      renderContext.uniform2f(pointerLocation, pointer.x, pointer.y);
      renderContext.uniform1f(timeLocation, motionTime);
      renderContext.uniform1f(progressLocation, readProgress());
      renderContext.uniform1f(darkLocation, isDark ? 1 : 0);
      renderContext.drawArrays(renderContext.TRIANGLES, 0, 3);
      renderCanvas.dataset.renderer = "webgl";
      renderCanvas.dataset.motion = shouldAnimate() ? "animated" : "static";

      if (shouldAnimate()) scheduleRender();
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!shouldAnimate()) return;
      targetPointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      targetPointer.y = (0.5 - event.clientY / window.innerHeight) * 2;
    };

    const onMotionPreferenceChange = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      scheduleRender();
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) {
          scheduleRender();
        } else {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: "20% 0px" },
    );
    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (!shouldAnimate()) scheduleRender();
    });

    intersectionObserver.observe(host);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    reducedMotion.addEventListener("change", onMotionPreferenceChange);
    resize();
    scheduleRender();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      reducedMotion.removeEventListener("change", onMotionPreferenceChange);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <div
      className={className}
      data-testid="homepage-sand-world"
      role="presentation"
    >
      <canvas aria-hidden="true" data-sand-canvas ref={canvasRef} />
    </div>
  );
}
