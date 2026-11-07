import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog,
  BufferGeometry, BufferAttribute, Points, ShaderMaterial, AdditiveBlending,
  PlaneGeometry, Mesh, SphereGeometry, InstancedMesh, MeshStandardMaterial,
  AmbientLight, DirectionalLight, PointLight, Object3D, MathUtils,
} from 'three';

const PALETTE = {
  night: new Color('#140904'),
  roast: new Color('#3b2313'),
  sand: new Color('#ac8460'),
  peach: new Color('#ffce93'),
  sun: new Color('#c98a3a'),
  bean: new Color('#6b422e'),
};

const isSmallScreen = () => window.innerWidth < 760;

/** A field of points that ripples like the sea at Puerto Galera, lit by a sun path. */
function createSea(cols, rows) {
  const width = 46;
  const depth = 30;
  const positions = new Float32Array(cols * rows * 3);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions[i++] = (c / (cols - 1) - 0.5) * width;
      positions[i++] = 0;
      positions[i++] = -(r / (rows - 1)) * depth + 4;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uDeep: { value: PALETTE.roast },
      uGlow: { value: PALETTE.peach },
      uSunX: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uPixelRatio; uniform float uSunX;
      varying float vLight; varying float vFade;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * 0.42 + uTime * 0.9) * 0.22 + cos(p.z * 0.55 + uTime * 0.7) * 0.18 + sin((p.x + p.z) * 0.9 + uTime * 1.4) * 0.06;
        p.y += wave;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = (2.6 + wave * 2.0) * uPixelRatio * (11.0 / dist);
        float path = exp(-abs(p.x - uSunX) * (0.18 + (p.z + 26.0) * 0.012));
        vLight = clamp(path * smoothstep(-28.0, 2.0, -p.z * -1.0) + wave * 0.6, 0.0, 1.0);
        vFade = smoothstep(32.0, 8.0, dist) * smoothstep(1.0, 4.0, dist);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep; uniform vec3 uGlow;
      varying float vLight; varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.1, d) * vFade;
        vec3 color = mix(uDeep * 1.6, uGlow, vLight);
        gl_FragColor = vec4(color, alpha * (0.35 + vLight * 0.65));
      }`,
  });
  const points = new Points(geometry, material);
  points.position.y = -1.6;
  return points;
}

/** The crest's sunrise: a soft glowing disk on the horizon. */
function createSun() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uCore: { value: PALETTE.peach }, uEdge: { value: PALETTE.sun }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore; uniform vec3 uEdge; uniform float uTime; varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5; float d = length(c);
        float disk = smoothstep(0.205, 0.195, d);
        float halo = pow(smoothstep(0.5, 0.0, d), 2.6) * 0.55;
        float angle = atan(c.y, c.x);
        float rays = pow(max(0.0, sin(angle * 14.0 + uTime * 0.15)), 18.0) * smoothstep(0.48, 0.22, d) * step(0.0, c.y) * 0.18;
        vec3 color = mix(uEdge, uCore, smoothstep(0.2, 0.0, d));
        float alpha = disk * 0.95 + halo + rays;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
      }`,
  });
  const sun = new Mesh(new PlaneGeometry(16, 16), material);
  sun.position.set(0, 0.6, -24);
  return sun;
}

/** A coffee bean: an ellipsoid with a crease pressed into its flat side. */
function createBeanGeometry() {
  const geometry = new SphereGeometry(1, 28, 20);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (z > 0) {
      const crease = Math.exp(-(x * x) / 0.012) * 0.38;
      pos.setZ(i, z * (0.62 - crease));
    }
  }
  geometry.scale(0.62, 1, 0.78);
  geometry.computeVertexNormals();
  return geometry;
}

function createBeans(count) {
  const material = new MeshStandardMaterial({ color: PALETTE.bean, roughness: 0.42, metalness: 0.08 });
  const mesh = new InstancedMesh(createBeanGeometry(), material, count);
  const seeds = Array.from({ length: count }, (_, i) => {
    const golden = i * 2.39996;
    const radius = 3.2 + (i % 7) * 0.9;
    return {
      x: Math.cos(golden) * radius * 1.25 + 2,
      y: ((i * 37) % 100) / 100 * 7 - 1.4,
      z: -2 - ((i * 53) % 100) / 100 * 12,
      scale: 0.24 + ((i * 29) % 100) / 100 * 0.26,
      speed: 0.25 + ((i * 17) % 100) / 100 * 0.5,
      spin: new Array(3).fill(0).map((_, k) => (((i * (k + 3) * 13) % 100) / 100 - 0.5) * 1.4),
      phase: golden,
    };
  });
  return { mesh, seeds };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export async function startScene(canvas, state, { reducedMotion }) {
  const small = isSmallScreen();
  const renderer = new WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.6);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.fog = new Fog(PALETTE.night, 10, 34);
  const camera = new PerspectiveCamera(small ? 62 : 48, 1, 0.1, 80);
  camera.position.set(0, 1.1, 9);

  scene.add(new AmbientLight(PALETTE.sand, 1.1));
  const key = new DirectionalLight(PALETTE.peach, 2.2);
  key.position.set(0, 3, -12);
  scene.add(key);
  const fill = new PointLight(PALETTE.sun, 30, 30);
  fill.position.set(-4, 4, 6);
  scene.add(fill);

  await nextFrame();
  const sun = createSun();
  const sea = small ? createSea(90, 56) : createSea(170, 96);
  await nextFrame();
  const { mesh: beans, seeds } = createBeans(small ? 16 : 34);
  if (!small) sun.position.x = 7.5;
  scene.add(sun, sea, beans);
  sea.material.uniforms.uPixelRatio.value = pixelRatio;

  const dummy = new Object3D();
  const camTarget = { x: 0, y: 0 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  let lastSeconds = 0;
  // setSize clears the drawing buffer, so always redraw one frame after resizing.
  addEventListener('resize', () => { resize(); render(lastSeconds); });

  function render(seconds) {
    lastSeconds = seconds;
    const heroProgress = MathUtils.clamp(state.scrollY / state.vh, 0, 1.4);
    sea.material.uniforms.uTime.value = seconds;
    sun.material.uniforms.uTime.value = seconds;
    // Scrolling raises the sun, a sunrise over the port.
    sun.position.y = (small ? 3.4 : 0.6) + heroProgress * 3.4;
    sea.material.uniforms.uSunX.value = sun.position.x;

    camTarget.x += (state.pointerX * 0.9 - camTarget.x) * 0.05;
    camTarget.y += (-state.pointerY * 0.5 - camTarget.y) * 0.05;
    camera.position.x = camTarget.x;
    camera.position.y = 1.1 + camTarget.y - heroProgress * 0.6;
    camera.lookAt(0, 0.6 + heroProgress * 0.8, -12);

    seeds.forEach((s, i) => {
      const t = seconds * s.speed + s.phase;
      dummy.position.set(s.x + Math.sin(t * 0.6) * 0.3, s.y + Math.sin(t) * 0.35 + heroProgress * (2 + s.speed * 3), s.z);
      dummy.rotation.set(t * s.spin[0], t * s.spin[1], t * s.spin[2]);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      beans.setMatrixAt(i, dummy.matrix);
    });
    beans.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  // Only animate while the hero is on screen and the tab is visible.
  let running = false;
  let rafId = 0;
  const isHeroVisible = () => state.scrollY < state.vh * 1.3;
  function loop(time) {
    render(time / 1000);
    if (!isHeroVisible() || document.hidden) { running = false; return; }
    rafId = requestAnimationFrame(loop);
  }
  function wake() {
    if (reducedMotion || running || document.hidden || !isHeroVisible()) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }
  addEventListener('scroll', wake, { passive: true });
  addEventListener('wheel', wake, { passive: true });
  addEventListener('touchmove', wake, { passive: true });
  document.addEventListener('visibilitychange', wake);

  // Compile shaders off the critical path where the browser supports it.
  await renderer.compileAsync(scene, camera);
  await nextFrame();
  render(0);
  canvas.classList.add('is-ready');
  wake();

  return () => {
    cancelAnimationFrame(rafId);
    renderer.dispose();
  };
}
