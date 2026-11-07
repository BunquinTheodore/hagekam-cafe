import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Group, Mesh, InstancedMesh, Object3D,
  LatheGeometry, TorusGeometry, CircleGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry,
  MeshStandardMaterial, ShaderMaterial, AmbientLight, DirectionalLight, PointLight, HemisphereLight,
  TextureLoader, SRGBColorSpace, DoubleSide, MathUtils, BufferAttribute, Vector3,
} from 'three';

const PALETTE = {
  night: new Color('#140904'),
  espresso: new Color('#2b1409'),
  roast: new Color('#3b2313'),
  bean: new Color('#6b422e'),
  sand: new Color('#ac8460'),
  caramel: new Color('#c98a3a'),
  peach: new Color('#ffce93'),
  cream: new Color('#f1e9dc'),
  glaze: new Color('#e9dfd0'),
};

const isSmallScreen = () => window.innerWidth < 760;

/* The cup, saucer and orbiting beans span this many world units (before scaling): the box they are fitted into. */
const FIT = { width: 5.4, height: 4.3, centerY: 1.1, maxScale: 0.95 };
const BACKDROP_Z = -6;
/* How closely the cup follows the page as it scrolls (1 = locked to its box, less lags behind for depth). */
const SCROLL_FOLLOW = 0.92;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/* Cup profile points (radius, height), outer wall up to the rim then the inner wall down. */
const CUP_PROFILE = [
  [0, 0], [0.6, 0], [0.68, 0.04], [0.76, 0.22], [0.88, 0.75], [0.97, 1.22], [1.01, 1.4], [0.99, 1.45],
  [0.95, 1.43], [0.91, 1.24], [0.82, 0.78], [0.7, 0.32], [0.5, 0.16], [0, 0.15],
];
const SAUCER_PROFILE = [[0, 0], [1.5, 0.02], [1.72, 0.1], [1.78, 0.17], [1.7, 0.19], [1.25, 0.09], [0, 0.07]];
const toPoints = (profile) => profile.map(([r, y]) => new Vector2(r, y));

function createCup(material) {
  const group = new Group();
  const body = new Mesh(new LatheGeometry(toPoints(CUP_PROFILE), 72), material);
  const handle = new Mesh(new TorusGeometry(0.34, 0.085, 16, 40), material);
  handle.position.set(0.98, 0.78, 0);
  handle.scale.set(1, 1.12, 1);
  const saucer = new Mesh(new LatheGeometry(toPoints(SAUCER_PROFILE), 72), material);
  saucer.position.y = -0.07;
  group.add(body, handle, saucer);
  return group;
}

/** The crest printed on the cup: a curved patch that follows the cup's taper. */
function createCrestDecal(onReady) {
  const material = new MeshStandardMaterial({ transparent: true, roughness: 0.4, metalness: 0, depthWrite: false });
  const arc = 0.74;
  const geometry = new CylinderGeometry(0.965, 0.865, 0.66, 24, 1, true, -arc / 2, arc);
  const decal = new Mesh(geometry, material);
  decal.position.y = 0.86;
  new TextureLoader().load('/brand/logo-mark-256.webp', (texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    material.map = texture;
    material.needsUpdate = true;
    onReady?.();
  });
  return decal;
}

/** Espresso with crema and a latte art heart that swirls when the visitor stirs it. */
function createCoffeeSurface() {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uStir: { value: 0 },
      uDark: { value: PALETTE.roast }, uCrema: { value: PALETTE.caramel }, uFoam: { value: PALETTE.cream },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uStir; uniform vec3 uDark; uniform vec3 uCrema; uniform vec3 uFoam;
      varying vec2 vUv;
      ${NOISE_GLSL}
      float heart(vec2 p) {
        p.y -= 0.12; p.x = abs(p.x);
        float a = atan(p.x, p.y) / 3.14159; float r = length(p);
        float h = abs(a); float d = (13.0 * h - 22.0 * h * h + 10.0 * h * h * h) / (6.0 - 5.0 * h);
        return smoothstep(0.02, -0.02, r - d * 0.27);
      }
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float swirl = (0.6 + uStir * 3.0) * (0.5 - r) + uTime * (0.05 + uStir * 0.6);
        float s = sin(swirl), c = cos(swirl);
        vec2 q = mat2(c, -s, s, c) * p;
        float n = fbm(q * 7.0 + uTime * 0.05);
        vec3 col = mix(uCrema, uDark, smoothstep(0.1, 0.62, n + r * 0.6));
        vec2 hp = q + (vec2(fbm(q * 5.0 + 3.1), fbm(q * 5.0 - 1.7)) - 0.5) * (0.05 + uStir * 0.25);
        float art = heart(hp * 1.25);
        float rings = smoothstep(0.45, 0.5, sin((r * 46.0) - n * 4.0)) * smoothstep(0.34, 0.2, r) * (1.0 - art) * 0.35;
        col = mix(col, uFoam, clamp(art * 0.92 + rings, 0.0, 1.0));
        col = mix(col, uCrema * 0.8, smoothstep(0.42, 0.5, r));
        float spec = pow(max(0.0, 1.0 - length(p - vec2(-0.16, 0.18)) * 3.2), 6.0) * 0.35;
        gl_FragColor = vec4(col + spec, 1.0);
      }`,
  });
  const surface = new Mesh(new CircleGeometry(0.93, 64), material);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 1.3;
  return surface;
}

/** Soft curling steam ribbons. They always face the camera. */
function createSteam(count) {
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: PALETTE.cream } },
    vertexShader: /* glsl */ `
      uniform float uTime; attribute float aSeed; varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv; vSeed = aSeed; vec3 p = position;
        p.x += sin(p.y * 2.2 + uTime * 0.9 + aSeed * 6.0) * 0.16 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vSeed;
      ${NOISE_GLSL}
      void main() {
        float n = fbm(vec2(vUv.x * 2.4 + vSeed * 9.0, vUv.y * 2.0 - uTime * 0.35));
        float wisp = smoothstep(0.42, 0.8, n) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        wisp *= smoothstep(0.5, 0.15, abs(vUv.x - 0.5));
        gl_FragColor = vec4(uColor, wisp * 0.55);
      }`,
  });
  const group = new Group();
  for (let i = 0; i < count; i++) {
    const geometry = new PlaneGeometry(0.95, 2.6, 1, 24);
    geometry.translate(0, 1.3, 0);
    const seeds = new Float32Array(geometry.attributes.position.count).fill(i * 0.37 + 0.11);
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    const plume = new Mesh(geometry, material);
    plume.position.set((i - (count - 1) / 2) * 0.3, 1.42, (i % 2) * 0.12);
    group.add(plume);
  }
  return { group, material };
}

/** Warm morning light through the café window. */
function createBackdrop() {
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uGlow: { value: PALETTE.peach }, uWarm: { value: PALETTE.caramel } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uGlow; uniform vec3 uWarm; varying vec2 vUv;
      void main() {
        vec2 p = vUv - vec2(0.5, 0.55); float d = length(p * vec2(1.0, 1.25));
        float glow = pow(smoothstep(0.55, 0.0, d), 2.2);
        float ang = atan(p.y, p.x);
        float rays = pow(max(0.0, sin(ang * 9.0 + uTime * 0.06)), 18.0) * smoothstep(0.5, 0.08, d) * 0.1;
        vec3 col = mix(uWarm, uGlow, smoothstep(0.35, 0.0, d));
        gl_FragColor = vec4(col, clamp(glow * 0.42 + rays, 0.0, 1.0));
      }`,
  });
  const plane = new Mesh(new PlaneGeometry(14, 14), material);
  plane.position.set(0, 1.6, -6);
  return plane;
}

function createBeanGeometry() {
  const geometry = new SphereGeometry(1, 24, 18);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (z > 0) pos.setZ(i, z * (0.62 - Math.exp(-(x * x) / 0.012) * 0.38));
  }
  geometry.scale(0.62, 1, 0.78);
  geometry.computeVertexNormals();
  return geometry;
}

function createBeans(count) {
  const mesh = new InstancedMesh(createBeanGeometry(), new MeshStandardMaterial({ color: PALETTE.bean, roughness: 0.38, metalness: 0.05 }), count);
  const seeds = Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2,
    radius: 2.15 + ((i * 37) % 100) / 100 * 0.95,
    height: -0.2 + ((i * 53) % 100) / 100 * 2.6,
    scale: 0.07 + ((i * 29) % 100) / 100 * 0.06,
    speed: 0.12 + ((i * 17) % 100) / 100 * 0.16,
    spin: [0.7, 1.1, 0.5].map((k) => ((((i * 13 * (k * 10)) % 100) / 100) - 0.5) * 2 * k),
  }));
  return { mesh, seeds };
}

export async function startScene(canvas, state, { reducedMotion }) {
  const small = isSmallScreen();
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.6));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(small ? 40 : 34, 1, 0.1, 60);

  scene.add(new HemisphereLight(PALETTE.cream, PALETTE.espresso, 0.55));
  scene.add(new AmbientLight(PALETTE.sand, 0.25));
  const key = new DirectionalLight(PALETTE.peach, 1.5);
  key.position.set(-3, 5, 4);
  const rim = new PointLight(PALETTE.caramel, 26, 14);
  rim.position.set(2.5, 2.5, -2.5);
  scene.add(key, rim);

  // Declared before any async step: the crest texture can finish loading during an await below.
  let running = false;
  let ready = false;
  let rafId = 0;
  let lastSeconds = 0;

  await nextFrame();
  const glaze = new MeshStandardMaterial({ color: PALETTE.glaze, roughness: 0.32, metalness: 0.02, side: DoubleSide });
  const cup = createCup(glaze);
  const surface = createCoffeeSurface();
  const steam = createSteam(3);
  const crest = createCrestDecal(() => { if (ready && !running) render(lastSeconds); });
  cup.add(surface, steam.group, crest);
  cup.rotation.y = -0.5;

  await nextFrame();
  const backdrop = createBackdrop();
  const { mesh: beans, seeds } = createBeans(small ? 14 : 26);
  const stage = new Group();
  stage.add(cup, beans);
  scene.add(backdrop, stage);

  // The camera is fixed; the cup is placed and scaled to fill the hero's [data-scene-anchor] box.
  const layout = small
    ? { cam: [0, 3.6, 8.8], look: [0, 1.1, 0] }
    : { cam: [0, 3.4, 8.6], look: [0, 0.55, 0] };
  const anchor = document.querySelector('[data-scene-anchor]');
  const fit = { y: 0, backY: 0, unitsPerPx: 0, backUnitsPerPx: 0 };

  const dummy = new Object3D();
  const motion = { rx: 0, ry: 0, stir: 0, lastX: 0, lastY: 0 };

  /** Where the ray through a viewport point meets the plane z = planeZ, plus its depth in front of the camera. */
  function projectToPlane(clientX, clientY, planeZ) {
    const point = new Vector3((clientX / window.innerWidth) * 2 - 1, 1 - (clientY / window.innerHeight) * 2, 0.5).unproject(camera);
    const dir = point.sub(camera.position).normalize();
    const hit = camera.position.clone().addScaledVector(dir, (planeZ - camera.position.z) / dir.z);
    const depth = -hit.clone().applyMatrix4(camera.matrixWorldInverse).z;
    return { hit, depth };
  }

  /** Fits the cup group into the anchor box, measured as if the page were scrolled to the top. */
  function fitToAnchor() {
    camera.position.set(...layout.cam);
    camera.lookAt(...layout.look);
    camera.updateMatrixWorld();
    const rect = anchor?.getBoundingClientRect();
    const box = rect?.width
      ? { x: rect.left + rect.width / 2, y: rect.top + window.scrollY + rect.height / 2, w: rect.width, h: rect.height }
      : { x: window.innerWidth * 0.5, y: window.innerHeight * 0.4, w: window.innerWidth * 0.8, h: window.innerHeight * 0.5 };
    const { hit, depth } = projectToPlane(box.x, box.y, 0);
    const unitsPerPx = (2 * depth * Math.tan(MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
    const scale = Math.min(FIT.maxScale, (box.w * unitsPerPx) / FIT.width, (box.h * unitsPerPx) / FIT.height);
    fit.y = hit.y - FIT.centerY * scale;
    fit.unitsPerPx = unitsPerPx;
    stage.position.set(hit.x, fit.y, 0);
    stage.scale.setScalar(scale);
    const back = projectToPlane(box.x, box.y, BACKDROP_Z);
    fit.backY = back.hit.y;
    fit.backUnitsPerPx = (2 * back.depth * Math.tan(MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
    backdrop.position.set(back.hit.x, back.hit.y, BACKDROP_Z);
    backdrop.scale.setScalar(scale / 0.78);
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    fitToAnchor();
  }

  function render(seconds) {
    lastSeconds = seconds;
    const progress = MathUtils.clamp(state.scrollY / state.vh, 0, 1.4);

    // Moving the pointer stirs the coffee; the stir settles over time.
    const dx = state.pointerX - motion.lastX;
    const dy = state.pointerY - motion.lastY;
    motion.lastX = state.pointerX;
    motion.lastY = state.pointerY;
    motion.stir = Math.min(1, motion.stir * 0.96 + Math.hypot(dx, dy) * 2.2);
    motion.rx += (state.pointerY * 0.18 - motion.rx) * 0.06;
    motion.ry += (state.pointerX * 0.6 - motion.ry) * 0.06;

    surface.material.uniforms.uTime.value = seconds;
    surface.material.uniforms.uStir.value = motion.stir;
    steam.material.uniforms.uTime.value = seconds;
    backdrop.material.uniforms.uTime.value = seconds;

    cup.rotation.y = -0.5 + motion.ry + progress * 1.1 + Math.sin(seconds * 0.4) * 0.05;
    cup.rotation.x = 0.08 + motion.rx;
    cup.position.y = Math.sin(seconds * 0.8) * 0.04;
    stage.position.y = fit.y + state.scrollY * fit.unitsPerPx * SCROLL_FOLLOW;
    backdrop.position.y = fit.backY + state.scrollY * fit.backUnitsPerPx * SCROLL_FOLLOW;
    steam.group.quaternion.copy(cup.quaternion).invert().multiply(camera.quaternion);

    seeds.forEach((s, i) => {
      const a = s.angle + seconds * s.speed + progress * 0.8;
      const r = s.radius + progress * 0.9;
      dummy.position.set(Math.cos(a) * r, s.height + Math.sin(seconds * s.speed * 3 + i) * 0.12 , Math.sin(a) * r * 0.55);
      dummy.rotation.set(seconds * s.spin[0], seconds * s.spin[1], seconds * s.spin[2]);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      beans.setMatrixAt(i, dummy.matrix);
    });
    beans.instanceMatrix.needsUpdate = true;

    camera.position.set(layout.cam[0] + motion.ry * 0.4, layout.cam[1], layout.cam[2]);
    camera.lookAt(...layout.look);
    renderer.render(scene, camera);
  }

  resize();
  addEventListener('resize', () => { resize(); render(lastSeconds); });

  // Animate only while the hero is visible and the tab is in front.
  const isHeroVisible = () => state.scrollY < state.vh * 1.3;
  function loop(time) {
    render(time / 1000);
    if (!isHeroVisible() || document.hidden) { running = false; return; }
    rafId = requestAnimationFrame(loop);
  }
  // Reduced motion: no animation loop, but the cup still scrolls with its box, one frame per scroll.
  let pendingFrame = 0;
  let wasHeroVisible = true;
  function renderOnce() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; render(lastSeconds); });
  }
  function wake() {
    if (reducedMotion) {
      // Also draw once right after leaving the hero, so a jump past it never leaves the cup painted mid page.
      const visible = isHeroVisible();
      if (visible || wasHeroVisible) renderOnce();
      wasHeroVisible = visible;
      return;
    }
    if (running || document.hidden || !isHeroVisible()) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }
  ['scroll', 'wheel', 'touchmove', 'pointermove'].forEach((type) => addEventListener(type, wake, { passive: true }));
  document.addEventListener('visibilitychange', wake);

  await renderer.compileAsync(scene, camera);
  await nextFrame();
  ready = true;
  render(0);
  canvas.classList.add('is-ready');
  document.documentElement.classList.add('has-scene');
  wake();

  return () => {
    cancelAnimationFrame(rafId);
    renderer.dispose();
  };
}
