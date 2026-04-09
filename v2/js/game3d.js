/* ══════════════════════════════════════════════════════
   NAMMA BENGALURU — Immersive 3D Portfolio
   InstancedMesh + Post-processing + Scroll-driven
══════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ─── CONSTANTS ────────────────────────────────── */
const PH = { SCROLL:0, GAME:1, OVER:2 };
const ROAD_W = 12, LANE_W = 4, LANE_X = [-LANE_W, 0, LANE_W];
const SCROLL_DEPTH = 800;
const NUM_SECTIONS = 6;

/* ─── STATE ────────────────────────────────────── */
let phase = PH.SCROLL, scrollPct = 0, prevScrollPct = 0;
let renderer, scene, camera, composer, clock;
let autoGroup, dustParticles, autoWheels = [];
let targetLane = 1, playerX = 0, speed = 0;
let score = 0, lives = 3, p2Time = 0, spawnT = 0, shakeAmt = 0;
let gameStartZ = 0, touchX = 0;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const tmpMat4 = new THREE.Matrix4();
const tmpVec3 = new THREE.Vector3();
let roadZs = []; // track road chunk Z positions for fast recycling

/* ─── INSTANCED MESH POOLS ─────────────────────── */
let IM = {}; // instanced meshes
// Position arrays for recycling
let bldgData = [], treeData = [], poleData = [];
let obstaclePool = [];
const BLDG_COUNT = 300, TREE_COUNT = 180, POLE_COUNT = 120;
const KERB_COUNT = 2000, DASH_COUNT = 1500;
const ROAD_PLANES = 18;
const GEO_DEPTH = SCROLL_DEPTH + 2200; // total Z range for static geometry

/* ─── PROCEDURAL TEXTURES ──────────────────────── */
function makeNoiseTex(w, h, base, noiseAmt) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const [r,g,b] = base;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (Math.random() - 0.5) * noiseAmt;
      ctx.fillStyle = `rgb(${r+n},${g+n},${b+n})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeAsphaltTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const v = 30 + Math.random() * 20;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
  }
  // Subtle crack lines
  ctx.strokeStyle = 'rgba(20,20,20,0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      x += (Math.random() - 0.5) * 40;
      y += Math.random() * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 80);
  return tex;
}

function makeGrassTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a4d1a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? '#1a5a1a' : '#164016';
    ctx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 80);
  return tex;
}

function makeSidewalkTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#555';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 1;
  // Tile grid
  for (let x = 0; x < 64; x += 16) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,64); ctx.stroke(); }
  for (let y = 0; y < 64; y += 16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(64,y); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 40);
  return tex;
}

/* ─── SKY ──────────────────────────────────────── */
function buildSky(night) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 512);
  if (night) {
    grd.addColorStop(0, '#050510');
    grd.addColorStop(0.6, '#0a0a20');
    grd.addColorStop(1, '#101025');
  } else {
    grd.addColorStop(0, '#1a3a66');
    grd.addColorStop(0.45, '#5588aa');
    grd.addColorStop(0.75, '#cc9966');
    grd.addColorStop(1, '#ddbb88');
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  if (scene.background?.dispose) scene.background.dispose();
  scene.background = tex;
  // Don't set scene.environment — it causes color shifts on physical materials during movement
  scene.fog.color.set(night ? 0x080818 : 0xccbb99);
}

/* ─── VIGNETTE + COLOR GRADING SHADER ──────────── */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.5 },
    offset: { value: 1.0 },
    tint: { value: new THREE.Vector3(1.05, 0.95, 0.85) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    uniform vec3 tint;
    varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      // Vignette
      vec2 uv=(vUv-0.5)*2.0;
      float v=1.0-smoothstep(offset,offset+0.6,length(uv));
      c.rgb*=mix(vec3(1.0-darkness),vec3(1.0),v);
      // Warm color grading
      c.rgb*=tint;
      gl_FragColor=c;
    }`,
};

/* ─── INIT ─────────────────────────────────────── */
function init() {
  const canvas = document.getElementById('world');
  clock = new THREE.Clock();

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xccbb99, 0.0006); // very subtle, neutral warm

  // Camera
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
  camera.position.set(0, 8, 14);

  // Lighting
  const hemi = new THREE.HemisphereLight(0xffddaa, 0x443322, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffeebb, 2.0);
  sun.position.set(-20, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  IM.sun = sun;

  // Fill light
  const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
  fill.position.set(15, 10, -10);
  scene.add(fill);
  IM.fill = fill;

  buildSky(false);

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.4, 0.85);
  composer.addPass(bloom);
  IM.bloom = bloom;
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  // Build world
  buildRoad();
  buildKerbs();
  buildDashes();
  buildBuildings();
  buildTrees();
  buildPoles();
  buildSignage();
  buildPedestrians();
  autoGroup = buildAuto();
  autoGroup.position.set(0, 0.15, 0);
  scene.add(autoGroup);
  buildDust();

  // Scroll driver
  const driver = document.getElementById('scroll-driver');
  driver.style.height = (innerHeight * NUM_SECTIONS * 1.5) + 'px';
  // Show panel 0 immediately
  document.querySelector('.panel[data-index="0"]')?.classList.add('visible');

  // Loader dismiss
  const loader = document.getElementById('loader');
  loader.querySelector('.loader-fill').style.width = '100%';
  setTimeout(() => {
    loader.classList.add('done');
    document.getElementById('topnav').classList.add('show');
    document.getElementById('progress').classList.add('show');
  }, 900);

  window.addEventListener('resize', onResize);
  onResize();
  clock.start();
  loop();
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ─── ROAD (instanced planes) ──────────────────── */
function buildRoad() {
  const CHUNK = 80;
  roadZs = [];
  for (let i = 0; i < ROAD_PLANES; i++) roadZs.push(-i * CHUNK);

  const asphalt = makeAsphaltTex();
  const roadGeo = new THREE.PlaneGeometry(ROAD_W, CHUNK);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, metalness: 0.05 });
  const roadIM = new THREE.InstancedMesh(roadGeo, roadMat, ROAD_PLANES);
  roadIM.receiveShadow = true;
  for (let i = 0; i < ROAD_PLANES; i++) {
    dummy.position.set(0, 0, roadZs[i]);
    dummy.rotation.set(-Math.PI/2, 0, 0);
    dummy.scale.set(1,1,1);
    dummy.updateMatrix();
    roadIM.setMatrixAt(i, dummy.matrix);
  }
  roadIM.instanceMatrix.needsUpdate = true;
  scene.add(roadIM);
  IM.road = roadIM;

  // Sidewalks
  const swTex = makeSidewalkTex();
  const swGeo = new THREE.PlaneGeometry(4, 80);
  const swMat = new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.8 });
  const swIM = new THREE.InstancedMesh(swGeo, swMat, ROAD_PLANES * 2);
  swIM.receiveShadow = true;
  for (let i = 0; i < ROAD_PLANES; i++) {
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      dummy.position.set(side * (ROAD_W/2 + 2.15), 0.005, -i * 80);
      dummy.rotation.set(-Math.PI/2, 0, 0);
      dummy.updateMatrix();
      swIM.setMatrixAt(i*2+s, dummy.matrix);
    }
  }
  swIM.instanceMatrix.needsUpdate = true;
  scene.add(swIM);
  IM.sidewalk = swIM;

  // Grass planes
  const grassTex = makeGrassTex();
  const grassGeo = new THREE.PlaneGeometry(80, 80);
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
  const grassIM = new THREE.InstancedMesh(grassGeo, grassMat, ROAD_PLANES * 2);
  grassIM.receiveShadow = true;
  for (let i = 0; i < ROAD_PLANES; i++) {
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      dummy.position.set(side * (ROAD_W/2 + 44), -0.02, -i * 80);
      dummy.rotation.set(-Math.PI/2, 0, 0);
      dummy.updateMatrix();
      grassIM.setMatrixAt(i*2+s, dummy.matrix);
    }
  }
  grassIM.instanceMatrix.needsUpdate = true;
  scene.add(grassIM);
  IM.grass = grassIM;

  IM.centerLine = null; // no center line; 3 lanes divided by dashes
}

/* ─── KERBS (instanced) ───────────────────────── */
function buildKerbs() {
  const geo = new THREE.BoxGeometry(0.3, 0.15, 1.4);
  // Orange kerbs
  const matO = new THREE.MeshStandardMaterial({ color: 0xff9933, roughness: 0.6 });
  const imO = new THREE.InstancedMesh(geo, matO, KERB_COUNT);
  // White kerbs
  const matW = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 });
  const imW = new THREE.InstancedMesh(geo, matW, KERB_COUNT);

  let oi = 0, wi = 0;
  for (let z = 0; z > -GEO_DEPTH && (oi < KERB_COUNT || wi < KERB_COUNT); z -= 1.5) {
    for (const side of [-1, 1]) {
      const isOrange = Math.abs(Math.floor(z / 1.5)) % 2 === 0;
      dummy.position.set(side * (ROAD_W/2 + 0.15), 0.075, z);
      dummy.rotation.set(0,0,0);
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      if (isOrange && oi < KERB_COUNT) { imO.setMatrixAt(oi++, dummy.matrix); }
      else if (!isOrange && wi < KERB_COUNT) { imW.setMatrixAt(wi++, dummy.matrix); }
    }
  }
  imO.count = oi; imW.count = wi;
  imO.instanceMatrix.needsUpdate = true;
  imW.instanceMatrix.needsUpdate = true;
  scene.add(imO); scene.add(imW);
  IM.kerbO = imO; IM.kerbW = imW;
}

/* ─── DASHES (instanced) ──────────────────────── */
function buildDashes() {
  const geo = new THREE.PlaneGeometry(0.1, 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const im = new THREE.InstancedMesh(geo, mat, DASH_COUNT);
  let di = 0;
  for (let z = 0; z > -GEO_DEPTH && di < DASH_COUNT; z -= 4) {
    for (const lx of [-LANE_W/2, LANE_W/2]) { // between lanes
      if (di >= DASH_COUNT) break;
      dummy.position.set(lx, 0.015, z);
      dummy.rotation.set(-Math.PI/2, 0, 0);
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      im.setMatrixAt(di++, dummy.matrix);
    }
  }
  im.count = di;
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);
  IM.dashes = im;
}

/* ─── BUILDINGS (instanced) ───────────────────── */
// Bengaluru building palette: cream lime-washed, turmeric yellow, terracotta, ochre, sage
const BLDG_COLORS = [0xf0e6cc, 0xedd580, 0xe8c870, 0xd4906a, 0xc87850, 0xe0d0b0, 0xb8d4c0, 0xd8c8a0, 0xf5f0e0, 0xd0b896, 0xa8c0b0, 0xe0d8c8];

function buildBuildings() {
  // Body instances
  const geo = new THREE.BoxGeometry(1, 1, 1); // unit cube, scaled per instance
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02 });
  const im = new THREE.InstancedMesh(geo, mat, BLDG_COUNT);
  im.castShadow = true; im.receiveShadow = true;

  bldgData = [];
  let idx = 0;
  for (let z = 5; z > -GEO_DEPTH && idx < BLDG_COUNT; z -= 6 + Math.random() * 5) {
    const side = idx % 2 === 0 ? -1 : 1;
    const w = 3 + Math.random() * 5;
    const h = 4 + Math.random() * 14;
    const d = 3 + Math.random() * 5;
    const x = side * (ROAD_W/2 + 5 + w/2 + Math.random() * 4);

    dummy.position.set(x, h/2, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    im.setMatrixAt(idx, dummy.matrix);

    const col = BLDG_COLORS[idx % BLDG_COLORS.length];
    tmpColor.set(col);
    // Slight variation
    tmpColor.r += (Math.random() - 0.5) * 0.05;
    tmpColor.g += (Math.random() - 0.5) * 0.05;
    tmpColor.b += (Math.random() - 0.5) * 0.05;
    im.setColorAt(idx, tmpColor);

    bldgData.push({ x, z, w, h, d, side, idx });
    idx++;
  }
  im.count = idx;
  im.instanceMatrix.needsUpdate = true;
  im.instanceColor.needsUpdate = true;
  scene.add(im);
  IM.buildings = im;

  // Window instances
  const winGeo = new THREE.PlaneGeometry(0.5, 0.7);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.15, metalness: 0.7 });
  const winIM = new THREE.InstancedMesh(winGeo, winMat, BLDG_COUNT * 12);
  let wi = 0;
  bldgData.forEach(b => {
    const rows = Math.floor(b.h / 2);
    const cols = Math.floor(b.w / 1.5);
    const faceZ = b.side > 0 ? b.z - b.d/2 - 0.01 : b.z + b.d/2 + 0.01;
    for (let r = 0; r < rows && r < 4; r++) {
      for (let c = 0; c < cols && c < 3; c++) {
        if (Math.random() > 0.6 || wi >= BLDG_COUNT * 12) continue;
        dummy.position.set(b.x - b.w/2 + 1 + c * 1.5, 1.5 + r * 2, faceZ);
        dummy.rotation.set(0, b.side < 0 ? Math.PI : 0, 0);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        winIM.setMatrixAt(wi++, dummy.matrix);
      }
    }
  });
  winIM.count = wi;
  winIM.instanceMatrix.needsUpdate = true;
  scene.add(winIM);
  IM.windows = winIM;
}

/* ─── TREES (instanced) ──────────────────────── */
function buildTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 2.8, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
  const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  trunkIM.castShadow = true;

  const canopyGeo = new THREE.SphereGeometry(1.5, 8, 6);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.75 });
  const canopyIM = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);
  canopyIM.castShadow = true;

  treeData = [];
  let idx = 0;
  for (let z = 3; z > -GEO_DEPTH && idx < TREE_COUNT; z -= 12 + Math.random() * 10) {
    const side = idx % 2 === 0 ? -1 : 1;
    const x = side * (ROAD_W/2 + 2.2 + Math.random() * 2);

    // Rain Tree style: taller trunk, flatter wide canopy
    dummy.position.set(x, 2.0, z);
    dummy.rotation.set(0,0,0);
    dummy.scale.set(1, 1.3, 1); // taller trunk
    dummy.updateMatrix();
    trunkIM.setMatrixAt(idx, dummy.matrix);

    // Wide, flat canopy (Rain Tree / Gulmohar style)
    const cSpread = 1.2 + Math.random() * 0.4; // width variation
    dummy.position.set(x, 4.5, z);
    dummy.scale.set(cSpread, 0.55, cSpread); // wide, flat
    dummy.updateMatrix();
    canopyIM.setMatrixAt(idx, dummy.matrix);

    // Bengaluru tree colors: deep greens, occasional seasonal variation
    const greenVariants = [0x1a6820, 0x237028, 0x156018, 0x2a7830, 0x1c5e1c];
    tmpColor.setHex(greenVariants[idx % greenVariants.length]);
    tmpColor.r += (Math.random() - 0.5) * 0.06;
    canopyIM.setColorAt(idx, tmpColor);

    treeData.push({ x, z, side, idx });
    idx++;
  }
  trunkIM.count = idx; canopyIM.count = idx;
  trunkIM.instanceMatrix.needsUpdate = true;
  canopyIM.instanceMatrix.needsUpdate = true;
  canopyIM.instanceColor.needsUpdate = true;
  scene.add(trunkIM); scene.add(canopyIM);
  IM.trunks = trunkIM; IM.canopies = canopyIM;
}

/* ─── POLES (instanced) ──────────────────────── */
function buildPoles() {
  const pGeo = new THREE.CylinderGeometry(0.05, 0.08, 7, 6);
  const pMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.3 });
  const pIM = new THREE.InstancedMesh(pGeo, pMat, POLE_COUNT);

  const lampGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffcc66, emissiveIntensity: 0.2 });
  const lampIM = new THREE.InstancedMesh(lampGeo, lampMat, POLE_COUNT);
  IM.lampMat = lampMat;

  poleData = [];
  let idx = 0;
  for (let z = 0; z > -GEO_DEPTH && idx < POLE_COUNT; z -= 25) {
    const side = idx % 2 === 0 ? -1 : 1;
    const x = side * (ROAD_W/2 + 0.6);

    dummy.position.set(x, 3.5, z);
    dummy.rotation.set(0,0,0);
    dummy.scale.set(1,1,1);
    dummy.updateMatrix();
    pIM.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(x + side * 1.2, 6.8, z);
    dummy.scale.set(1,1,1);
    dummy.updateMatrix();
    lampIM.setMatrixAt(idx, dummy.matrix);

    poleData.push({ x, z, side, idx });
    idx++;
  }
  pIM.count = idx; lampIM.count = idx;
  pIM.instanceMatrix.needsUpdate = true;
  lampIM.instanceMatrix.needsUpdate = true;
  scene.add(pIM); scene.add(lampIM);
  IM.poles = pIM; IM.lamps = lampIM;
}

/* ─── CANVAS SIGN TEXTURE RENDERER ───────────── */
function makeSignTex(lines, bg, fg, w, h) {
  const c = document.createElement('canvas');
  c.width = w || 512; c.height = h || 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = fg; ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, c.width - 10, c.height - 10);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lh = c.height / (lines.length + 1);
  lines.forEach((l, i) => {
    ctx.font = `bold ${l.size || 32}px Arial, sans-serif`;
    ctx.fillText(l.text, c.width / 2, lh * (i + 1), c.width - 24);
  });
  return new THREE.CanvasTexture(c);
}

/* ─── ROAD PAINTED TEXT ─────────────────────────── */
function makeRoadText(text, z, w, h) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 64, 240);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w || 4, h || 2), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.02, z);
  return m;
}

/* ─── BENGALURU STREETSCAPE ──────────────────── */
function buildSignage() {
  // ── DATA ──
  const SHOPS = [
    { lines: [{text:'ಬೆಂಗಳೂರು ದರ್ಶಿನಿ', size:38},{text:'DARSHINI', size:28}], bg:'#cc1100', fg:'#fff' },
    { lines: [{text:'MTR', size:54},{text:'SINCE 1924', size:18}], bg:'#006622', fg:'#fff' },
    { lines: [{text:'☕ CHAI POINT', size:36}], bg:'#ff6600', fg:'#fff' },
    { lines: [{text:'ಉಡುಪಿ ಹೋಟೆಲ್', size:34},{text:'UDUPI HOTEL', size:26}], bg:'#0044aa', fg:'#fff' },
    { lines: [{text:'MEDICAL STORE', size:28}], bg:'#ffffff', fg:'#008800' },
    { lines: [{text:'ನಮ್ಮ ಬೆಂಗಳೂರು', size:30},{text:'NAMMA BENGALURU', size:26}], bg:'#138808', fg:'#fff' },
    { lines: [{text:'COFFEE DAY', size:34}], bg:'#880000', fg:'#fff' },
    { lines: [{text:'ಬಟ್ಟೆ ಅಂಗಡಿ', size:34},{text:'TEXTILE SHOP', size:22}], bg:'#aa0066', fg:'#fff' },
    { lines: [{text:'SARAVANA BHAVAN', size:28}], bg:'#dd6600', fg:'#fff' },
    { lines: [{text:'ಮಿಠಾಯಿ', size:34},{text:'SWEET SHOP', size:24}], bg:'#993300', fg:'#ffd700' },
    { lines: [{text:'ಹೂವಿನ ಅಂಗಡಿ', size:32},{text:'FLOWER SHOP', size:22}], bg:'#dd0088', fg:'#fff' },
    { lines: [{text:'BANGALORE BOOKS', size:28}], bg:'#224488', fg:'#fff' },
  ];

  const OFFICES = [
    { lines: [{text:'TECH PARK', size:42},{text:'BLOCK A', size:22}], bg:'#1a2a4a', fg:'#00ccff' },
    { lines: [{text:'STARTUP HUB', size:38}], bg:'#222', fg:'#00ff88' },
    { lines: [{text:'EMBASSY', size:34},{text:'MANYATA', size:28}], bg:'#1a3355', fg:'#fff' },
    { lines: [{text:'ELECTRONIC CITY', size:30}], bg:'#112244', fg:'#55aaff' },
    { lines: [{text:'WHITEFIELD', size:34},{text:'IT PARK', size:28}], bg:'#2a1a3a', fg:'#cc88ff' },
    { lines: [{text:'KORAMANGALA', size:28},{text:'BUSINESS CENTER', size:20}], bg:'#1a2a2a', fg:'#00ddaa' },
  ];

  const shopWallMat = new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.82 });
  const awningMats = [0xcc1100, 0x006622, 0xff6600, 0x0044aa, 0x008800, 0x138808, 0x880000, 0xaa0066].map(
    c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })
  );

  // ── SHOP FRONTS (close to road so camera sees them) ──
  let si = 0;
  for (let z = -18; z > -GEO_DEPTH && si < 45; z -= 55 + Math.random() * 25) {
    const side = si % 2 === 0 ? -1 : 1;
    const x = side * (ROAD_W / 2 + 2.8 + Math.random() * 1.0);
    const sign = SHOPS[si % SHOPS.length];
    const g = new THREE.Group();

    // Shop body
    const sw = 3.8, sh = 3.8, sd = 3.2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), shopWallMat);
    wall.position.y = sh / 2; wall.castShadow = true; g.add(wall);

    // All shop detail faces +Z (toward the approaching camera)
    // Awning
    const aw = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.6, 0.1, 1.3), awningMats[si % awningMats.length]);
    aw.position.set(0, sh + 0.4, sd / 2 + 0.65); g.add(aw);
    // Awning support bars
    for (const bx of [-sw / 2 + 0.2, sw / 2 - 0.2]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 }));
      bar.rotation.x = -Math.PI / 3; bar.position.set(bx, sh + 0.1, sd / 2 + 0.3); g.add(bar);
    }

    // Sign board with canvas texture (faces +Z → visible to approaching camera)
    const tex = makeSignTex(sign.lines, sign.bg, sign.fg, 512, 256);
    const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.3, 1.6),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 }));
    signPlane.position.set(0, sh + 1.5, sd / 2 + 0.03); g.add(signPlane);

    // Door
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.6 }));
    door.position.set(0, 1.15, sd / 2 + 0.01); g.add(door);

    // Window (display)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4),
      new THREE.MeshPhysicalMaterial({ color: 0x88bbdd, transmission: 0.4, roughness: 0.05, ior: 1.4 }));
    win.position.set(-1.1, 1.6, sd / 2 + 0.01); g.add(win);

    // Steps
    const step = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 }));
    step.position.set(0, 0.06, sd / 2 + 0.25); g.add(step);

    g.position.set(x, 0, z);
    scene.add(g);
    si++;
  }

  // ── OFFICE / GLASS TOWERS ──
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x5599bb, roughness: 0.06, metalness: 0.55,
    transmission: 0.12, thickness: 0.5,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.28, metalness: 0.4 });

  let oi = 0;
  for (let z = -70; z > -GEO_DEPTH && oi < 22; z -= 100 + Math.random() * 50) {
    const side = oi % 2 === 0 ? 1 : -1;
    const x = side * (ROAD_W / 2 + 6 + Math.random() * 3);
    const sign = OFFICES[oi % OFFICES.length];
    const ow = 6 + Math.random() * 4, oh = 16 + Math.random() * 12, od = 5 + Math.random() * 3;
    const g = new THREE.Group();

    // Tower body (glass)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(ow, oh, od), glassMat);
    tower.position.y = oh / 2; tower.castShadow = true; g.add(tower);

    // Floor lines (horizontal mullions)
    for (let y = 2.5; y < oh; y += 2.8) {
      const fl = new THREE.Mesh(new THREE.BoxGeometry(ow + 0.05, 0.08, od + 0.05), frameMat);
      fl.position.y = y; g.add(fl);
    }
    // Vertical mullions (on +Z face, visible to camera)
    for (let mx = -ow / 2 + 2; mx < ow / 2; mx += 2) {
      const vl = new THREE.Mesh(new THREE.BoxGeometry(0.06, oh, 0.06), frameMat);
      vl.position.set(mx, oh / 2, od / 2 + 0.03); g.add(vl);
    }

    // Sign at top (+Z face)
    const stex = makeSignTex(sign.lines, sign.bg, sign.fg, 512, 256);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(ow * 0.75, 2.2),
      new THREE.MeshStandardMaterial({ map: stex, roughness: 0.35, emissive: 0x222222, emissiveIntensity: 0.3 }));
    sp.position.set(0, oh - 2, od / 2 + 0.03); g.add(sp);

    // Entrance canopy (+Z face)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(ow * 0.7, 0.12, 2),
      new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 }));
    canopy.position.set(0, 3.5, od / 2 + 1); g.add(canopy);

    g.position.set(x, 0, z);
    scene.add(g);
    oi++;
  }

  // ── BMTC BUS STOPS ──
  const bmtcTex = makeSignTex(
    [{text:'BMTC', size:40},{text:'ಬಸ್ ನಿಲ್ದಾಣ', size:28},{text:'BUS STOP', size:24}],
    '#006633', '#ffffff', 256, 256
  );
  for (let z = -50; z > -GEO_DEPTH; z -= 280 + Math.random() * 120) {
    const side = Math.random() > 0.5 ? -1 : 1;
    const x = side * (ROAD_W / 2 + 1.8);
    const g = new THREE.Group();
    const roofM = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.35, metalness: 0.6 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.6), roofM));
    g.children[0].position.y = 2.9;
    const postM = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.3 });
    for (const px of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9), postM);
      post.position.set(px, 1.45, 0); g.add(post);
    }
    // BMTC sign panel
    const bsign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0),
      new THREE.MeshStandardMaterial({ map: bmtcTex, roughness: 0.55 }));
    bsign.position.set(0, 3.6, 0); g.add(bsign);
    // Bench
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x994400, roughness: 0.8 })));
    g.children[g.children.length - 1].position.set(0, 0.5, 0.35);
    // Back wall (ad panel)
    const adSigns = [
      [{text:'MYSORE SANDAL', size:28},{text:'SOAP', size:36}],
      [{text:'ನಂದಿನಿ', size:38},{text:'NANDINI MILK', size:24}],
      [{text:'BIG BAZAAR', size:34}],
    ];
    const adData = adSigns[Math.floor(Math.random() * adSigns.length)];
    const adTex = makeSignTex(adData, '#224488', '#ffffff', 512, 256);
    const adPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4),
      new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.6 }));
    adPanel.position.set(0, 1.8, 0.75); g.add(adPanel);

    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ── TRAFFIC SIGNALS ──
  const sigPoleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.28, metalness: 0.45 });
  const sigBoxMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  for (let z = -80; z > -GEO_DEPTH; z -= 220 + Math.random() * 80) {
    const side = (Math.random() > 0.5 ? -1 : 1);
    const x = side * (ROAD_W / 2 + 0.6);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5), sigPoleMat));
    g.children[0].position.y = 2.75;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.35, 0.32), sigBoxMat));
    g.children[1].position.y = 5.6;
    [{c:0xff0000, y:6.05},{c:0xffaa00, y:5.6},{c:0x00ff00, y:5.15}].forEach(l => {
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshStandardMaterial({ color: l.c, emissive: l.c, emissiveIntensity: 0.6 }));
      lm.position.set(0, l.y, -0.18); g.add(lm);
    });
    g.position.set(x, 0, z); scene.add(g);
  }

  // ── ROAD PAINTED TEXT (SLOW, ನಿಧಾನ, SPEED BREAKER) ──
  const roadTexts = [
    {text:'SLOW', z:-90}, {text:'ನಿಧಾನ', z:-220}, {text:'SPEED BREAKER', z:-370},
    {text:'SLOW', z:-530}, {text:'ನಿಧಾನ', z:-680},
  ];
  roadTexts.forEach(rt => scene.add(makeRoadText(rt.text, rt.z)));

  // ── ZEBRA CROSSINGS ──
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-130, -330, -530, -730].forEach(cz => {
    for (let i = 0; i < 8; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), zebraMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(-ROAD_W/2 + 1.0 + i * 1.55, 0.018, cz);
      scene.add(stripe);
    }
  });

  // ── KM MARKERS on road ──
  for (let i = 1; i <= 5; i++) {
    scene.add(makeRoadText(`KM ${i}`, -(SCROLL_DEPTH / 5) * i, 2.5, 1.2));
  }

  // ── PARKED AUTO-RICKSHAWS (iconic Bengaluru touch) ──
  const autoYellow = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.35, metalness: 0.1 });
  const autoGreen = new THREE.MeshStandardMaterial({ color: 0x1a6630, roughness: 0.42 });
  const autoBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  for (let z = -35; z > -GEO_DEPTH; z -= 90 + Math.random() * 60) {
    const side = Math.random() > 0.5 ? -1 : 1;
    const x = side * (ROAD_W / 2 + 1.3 + Math.random() * 0.5);
    const g = new THREE.Group();
    // Lower body
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 1.3), autoGreen);
    lb.position.y = 0.42; g.add(lb);
    // Upper body
    const ub = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.45, 0.9), autoYellow);
    ub.position.set(0, 0.82, -0.08); g.add(ub);
    // Canopy
    const cn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.48, 1.0, 8, 1, false, 0, Math.PI),
      autoBlack);
    cn.rotation.x = Math.PI / 2; cn.position.set(0, 1.08, -0.08); g.add(cn);
    // Wheels (3)
    const wMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const wGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10);
    [[0, 0.16, -0.55], [-0.42, 0.16, 0.4], [0.42, 0.16, 0.4]].forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wGeo, wMat); w.rotation.z = Math.PI / 2;
      w.position.set(wx, wy, wz); g.add(w);
    });
    g.position.set(x, 0, z);
    g.rotation.y = side < 0 ? 0.15 : Math.PI - 0.15;
    g.scale.setScalar(0.65);
    scene.add(g);
  }

  // ── CHAI / FOOD STALLS ──
  const cartMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.82 });
  const umbrellaColors = [0xdd0000, 0x0000cc, 0x009900, 0xff6600];
  let ci = 0;
  for (let z = -65; z > -GEO_DEPTH && ci < 15; z -= 180 + Math.random() * 80) {
    const side = ci % 2 === 0 ? -1 : 1;
    const x = side * (ROAD_W / 2 + 2.2);
    const g = new THREE.Group();
    // Cart body
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.0), cartMat));
    g.children[0].position.y = 0.5;
    // Cart wheels
    for (const cx of [-0.55, 0.55]) {
      const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: 0x333333 }));
      cw.rotation.z = Math.PI / 2; cw.position.set(cx, 0.2, -0.35); g.add(cw);
    }
    // Umbrella
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: umbrellaColors[ci % umbrellaColors.length] }));
    umb.position.y = 2.3; g.add(umb);
    // Pole
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 })));
    g.children[g.children.length - 1].position.y = 1.45;

    g.position.set(x, 0, z); scene.add(g);
    ci++;
  }

  // ── SIDEWALK PLANTERS (no center median — it blocked center lane) ──
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x338833, roughness: 0.75 });
  for (let pz = -15; pz > -GEO_DEPTH; pz -= 30 + Math.random() * 15) {
    for (const ps of [-1, 1]) {
      const px = ps * (ROAD_W / 2 + 1.0);
      const planter = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), planterMat);
      planter.position.set(px, 0.45, pz);
      planter.scale.set(0.6, 0.65, 0.6);
      scene.add(planter);
    }
  }
}

/* ─── VINTAGE AMBASSADOR TAXI ─────────────────── */
function buildAuto() {
  const g = new THREE.Group();
  autoWheels = [];

  // Materials
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xfaf0e6, roughness: 0.28, metalness: 0.08,
    clearcoat: 1.0, clearcoatRoughness: 0.08,
  });
  const taxiYellow = new THREE.MeshPhysicalMaterial({
    color: 0xffd700, roughness: 0.25, metalness: 0.08, clearcoat: 0.9,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.04, metalness: 0.98 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.88 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x88bbdd, roughness: 0.04, transmission: 0.62, thickness: 0.12, ior: 1.5,
  });
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 2.2 });
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff2200, emissiveIntensity: 1.0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

  function add(mesh) { g.add(mesh); return mesh; }
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; return add(m);
  }

  // ── BODY: smooth ExtrudeGeometry from side profile ──
  // Shape defined in XY plane (X = car length, Y = height)
  // Positive X = rear (+Z in world), Negative X = front (-Z in world)
  const s = new THREE.Shape();
  s.moveTo(-1.95, 0.34);    // front bottom
  s.lineTo(-1.95, 0.68);    // front face
  s.lineTo(-1.55, 0.82);    // hood front
  s.lineTo(-0.98, 0.92);    // hood rear
  s.quadraticCurveTo(-0.78, 1.36, -0.52, 1.46); // windshield curve
  s.lineTo(0.55, 1.46);     // roof
  s.quadraticCurveTo(0.78, 1.36, 0.98, 0.94);   // rear window curve
  s.lineTo(1.55, 0.88);     // trunk
  s.lineTo(1.95, 0.68);     // rear face
  s.lineTo(1.95, 0.34);     // rear bottom
  s.lineTo(-1.95, 0.34);    // close

  const bodyGeo = new THREE.ExtrudeGeometry(s, {
    depth: 1.48, bevelEnabled: true,
    bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 5,
  });
  bodyGeo.translate(0, 0, -0.74); // center width
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.y = -Math.PI / 2; // orient: X→Z, extrudeZ→X
  body.castShadow = true; add(body);

  // Undercarriage / sills (below body profile)
  box(1.4, 0.34, 3.5, darkMat, 0, 0.17, 0);

  // ── Yellow stripe band (classic taxi) ──
  box(1.52, 0.1, 2.6, taxiYellow, 0, 0.44, -0.08);

  // ── TAXI sign on roof ──
  box(0.5, 0.18, 0.28, taxiYellow, 0, 1.56, -0.04);
  box(0.44, 0.05, 0.24, darkMat, 0, 1.6, -0.03);

  // ── Windshield ──
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.5), glassMat);
  ws.position.set(0, 1.1, -1.05); ws.rotation.x = -0.28; add(ws);

  // ── Rear window ──
  const rws = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.42), glassMat);
  rws.position.set(0, 1.1, 1.05); rws.rotation.x = 0.28; add(rws);

  // ── Side detail (left & right) ──
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.35, metalness: 0.3 });
  for (const sx of [-0.76, 0.76]) {
    const rot = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    const outX = sx > 0 ? sx + 0.01 : sx - 0.01; // just outside body surface

    // Front door window
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.4), glassMat);
    sw.position.set(outX, 1.14, -0.28); sw.rotation.y = rot; add(sw);
    // Rear door window
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), glassMat);
    rw.position.set(outX, 1.12, 0.42); rw.rotation.y = rot; add(rw);
    // Rear quarter window
    const qw = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32), glassMat);
    qw.position.set(outX, 1.1, 0.82); qw.rotation.y = rot; add(qw);

    // Window frames (chrome trim around each window)
    const frameMat = chromeMat;
    // Front window frame
    const fwf = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.46), frameMat);
    fwf.position.set(outX - (sx > 0 ? 0.005 : -0.005), 1.14, -0.28); fwf.rotation.y = rot; add(fwf);
    // Rear window frame
    const rwf = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.44), frameMat);
    rwf.position.set(outX - (sx > 0 ? 0.005 : -0.005), 1.12, 0.42); rwf.rotation.y = rot; add(rwf);

    // B-pillar (between front and rear windows)
    const bPillar = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.46), trimMat);
    bPillar.position.set(outX, 1.12, 0.08); bPillar.rotation.y = rot; add(bPillar);
    // C-pillar (behind rear window)
    const cPillar = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.4), trimMat);
    cPillar.position.set(outX, 1.1, 0.68); cPillar.rotation.y = rot; add(cPillar);

    // Door line (horizontal crease across body)
    const doorLine = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.02), trimMat);
    doorLine.position.set(outX, 0.74, 0.0); doorLine.rotation.y = rot; add(doorLine);

    // Front door handle
    box(0.16, 0.04, 0.05, chromeMat, sx, 0.92, -0.15);
    // Rear door handle
    box(0.16, 0.04, 0.05, chromeMat, sx, 0.92, 0.5);

    // Chrome side strip (belt line under windows)
    const beltLine = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.04), chromeMat);
    beltLine.position.set(outX, 0.92, 0.0); beltLine.rotation.y = rot; add(beltLine);

    // Lower body trim (rocker panel)
    const rocker = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.06), darkMat);
    rocker.position.set(outX, 0.38, 0.0); rocker.rotation.y = rot; add(rocker);
  }

  // ── Round headlights (Ambassador's signature) ──
  for (const sx of [-0.52, 0.52]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.034, 8, 16), chromeMat);
    ring.position.set(sx, 0.82, -1.98); add(ring);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), hlMat);
    bulb.position.set(sx, 0.82, -1.99); add(bulb);
  }

  // ── Taillights (large, prominent from rear) ──
  for (const sx of [-0.54, 0.54]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.05), tlMat);
    tl.position.set(sx, 0.84, 1.99); add(tl);
    // Chrome surround
    const tlRing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.04), chromeMat);
    tlRing.position.set(sx, 0.84, 1.97); add(tlRing);
  }

  // ── Chrome bumpers ──
  box(1.72, 0.15, 0.1, chromeMat, 0, 0.42, -1.99);
  box(1.72, 0.15, 0.1, chromeMat, 0, 0.42, 1.99);

  // ── Radiator grille (vertical bars + frame) ──
  const gFrame = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.32, 0.06), chromeMat);
  gFrame.position.set(0, 0.82, -1.99); add(gFrame);
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.08), darkMat);
    bar.position.set(i * 0.15, 0.82, -1.98); add(bar);
  }

  // ── License plate (rear) ──
  box(0.42, 0.14, 0.04, bodyMat, 0, 0.5, 2.0);

  // ── Arched fenders over all 4 wheels ──
  for (const zpos of [-1.34, 1.34]) {
    for (const sx of [-0.79, 0.79]) {
      const fGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.52, 14, 1, true, 0, Math.PI);
      const fender = new THREE.Mesh(fGeo, bodyMat);
      fender.rotation.set(0, 0, Math.PI); // open side down
      fender.position.set(sx, 0.44, zpos);
      fender.castShadow = true; add(fender);
    }
  }

  // ── Side mirrors ──
  for (const sx of [-0.78, 0.78]) {
    const mirArm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22), chromeMat);
    mirArm.rotation.z = Math.PI/2; mirArm.position.set(sx * 1.0, 1.12, -0.88); add(mirArm);
    const mirHead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), chromeMat);
    mirHead.position.set(sx > 0 ? sx + 0.12 : sx - 0.12, 1.12, -0.88); add(mirHead);
  }

  // ── 4 Wheels with chrome hubcaps ──
  const wGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 16);
  const hubCapGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12);
  const wheelPos = [[-0.79, 0.36, -1.34], [0.79, 0.36, -1.34], [-0.79, 0.36, 1.34], [0.79, 0.36, 1.34]];

  wheelPos.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wGeo, rubberMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    add(wheel);
    autoWheels.push(wheel);

    const hub = new THREE.Mesh(hubCapGeo, chromeMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, y, z);
    add(hub);
  });

  g.scale.setScalar(0.76);
  return g;
}

/* ─── PEDESTRIANS (instanced) ────────────────── */
let pedIM, pedHeadIM;
const PED_COUNT = 120;
const pedOffsets = []; // {z, phase} for walk animation

function buildPedestrians() {
  // Larger body + head so they're visible from camera distance
  const bGeo = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8); // wider, taller
  const bMat = new THREE.MeshStandardMaterial({ roughness: 0.65 });
  pedIM = new THREE.InstancedMesh(bGeo, bMat, PED_COUNT);
  pedIM.castShadow = true;

  const hGeo = new THREE.SphereGeometry(0.24, 8, 6);
  const hMat = new THREE.MeshStandardMaterial({ color: 0xd4a06a, roughness: 0.55 });
  pedHeadIM = new THREE.InstancedMesh(hGeo, hMat, PED_COUNT);

  // Bright saturated colors so they stand out
  const shirtColors = [0x2255dd, 0xdd2233, 0x22aa44, 0xee7700, 0x8833cc, 0xddaa00, 0xdd3388, 0x00aacc, 0xaa4400, 0x5544cc];

  let idx = 0;
  for (let z = -6; z > -GEO_DEPTH && idx < PED_COUNT; z -= 12 + Math.random() * 10) {
    const side = idx % 2 === 0 ? -1 : 1;
    // Place on the sidewalk between road edge and buildings
    const x = side * (ROAD_W / 2 + 1.5 + Math.random() * 1.2);
    const pz = z + Math.random() * 4;

    // Body — capsule centered at y, so position at half-height above ground
    dummy.position.set(x, 0.73, pz);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const hScale = 0.9 + Math.random() * 0.25; // height variation
    dummy.scale.set(1, hScale, 1);
    dummy.updateMatrix();
    pedIM.setMatrixAt(idx, dummy.matrix);

    tmpColor.setHex(shirtColors[idx % shirtColors.length]);
    pedIM.setColorAt(idx, tmpColor);

    // Head — just above body top
    dummy.position.set(x, 1.48 * hScale, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pedHeadIM.setMatrixAt(idx, dummy.matrix);

    pedOffsets.push({ z: pz, x, hScale, phase: Math.random() * Math.PI * 2 });
    idx++;
  }
  pedIM.count = idx; pedHeadIM.count = idx;
  pedIM.instanceMatrix.needsUpdate = true;
  pedIM.instanceColor.needsUpdate = true;
  pedHeadIM.instanceMatrix.needsUpdate = true;
  scene.add(pedIM); scene.add(pedHeadIM);
}

function animatePedestrians(t) {
  if (!pedIM) return;
  for (let i = 0; i < pedOffsets.length; i++) {
    const p = pedOffsets[i];
    const bob = Math.sin(t * 3.0 + p.phase) * 0.05;
    const sway = Math.sin(t * 3.0 + p.phase + 1.2) * 0.03;

    // Body
    dummy.position.set(p.x + sway, 0.73 + bob, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, p.hScale, 1);
    dummy.updateMatrix();
    pedIM.setMatrixAt(i, dummy.matrix);

    // Head follows body
    dummy.position.set(p.x + sway, 1.48 * p.hScale + bob, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pedHeadIM.setMatrixAt(i, dummy.matrix);
  }
  pedIM.instanceMatrix.needsUpdate = true;
  pedHeadIM.instanceMatrix.needsUpdate = true;
}

/* ─── DUST PARTICLES ──────────────────────────── */
function buildDust() {
  const count = 600;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random() - 0.5) * 40;
    pos[i*3+1] = Math.random() * 8;
    pos[i*3+2] = (Math.random() - 0.5) * 200;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.06, color: 0xffddaa, transparent: true, opacity: 0.4,
    sizeAttenuation: true, depthWrite: false,
  });
  dustParticles = new THREE.Points(geo, mat);
  scene.add(dustParticles);
}

/* ─── OBSTACLES (game mode, regular meshes—few) ── */
function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const r = Math.random();
  let geo, mat, y;
  if (r > 0.6) {
    // Traffic cone
    geo = new THREE.ConeGeometry(0.45, 1.1, 8);
    mat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.5 });
    y = 0.55;
  } else if (r > 0.3) {
    // Pothole / manhole cover
    geo = new THREE.CylinderGeometry(0.85, 0.85, 0.06, 14);
    mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 });
    y = 0.03;
  } else {
    // Parked auto-rickshaw obstacle
    geo = new THREE.BoxGeometry(1.2, 1.0, 1.6);
    mat = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.4 });
    y = 0.5;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LANE_X[lane], y, autoGroup.position.z - 140);
  mesh.castShadow = true;
  scene.add(mesh);
  obstaclePool.push(mesh);
}

/* ─── CAMERA CHOREOGRAPHY ─────────────────────── */
const CAM_POSES = [
  // Hero: wide establishing
  { pos: [0, 9, 16], look: [0, 1, -25] },
  // About: closer, side
  { pos: [-3, 5, 10], look: [0, 1.5, -20] },
  // Experience: tracking right
  { pos: [5, 5, 8], look: [-1, 1.5, -22] },
  // Projects: low dramatic
  { pos: [-2, 3, 9], look: [0, 2, -25] },
  // Skills: aerial
  { pos: [0, 14, 8], look: [0, 0, -20] },
  // Game launch: standard game cam
  { pos: [0, 7, 13], look: [0, 1.5, -20] },
];

function getCameraForScroll(pct) {
  const sectionF = pct * (NUM_SECTIONS - 1);
  const sectionI = Math.min(Math.floor(sectionF), NUM_SECTIONS - 2);
  const t = sectionF - sectionI;
  const smooth = t * t * (3 - 2 * t); // smoothstep

  const a = CAM_POSES[sectionI], b = CAM_POSES[sectionI + 1];
  return {
    pos: a.pos.map((v, i) => v + (b.pos[i] - v) * smooth),
    look: a.look.map((v, i) => v + (b.look[i] - v) * smooth),
  };
}

/* ─── SCROLL UPDATE ───────────────────────────── */
function updateScroll() {
  const driver = document.getElementById('scroll-driver');
  const maxScroll = driver.offsetHeight - innerHeight;
  if (maxScroll <= 0) return;
  prevScrollPct = scrollPct;
  scrollPct = Math.min(window.scrollY / maxScroll, 1);

  // Hide scroll prompt after first real scroll
  if (scrollPct > 0.005 && prevScrollPct === 0) {
    const prompt = document.getElementById('scroll-prompt');
    if (prompt) { prompt.style.opacity = '0'; prompt.style.pointerEvents = 'none'; }
  }

  // Auto position
  const autoZ = -scrollPct * SCROLL_DEPTH;
  const dz = (scrollPct - prevScrollPct) * SCROLL_DEPTH;
  autoGroup.position.z = autoZ;
  autoGroup.position.y = 0.15 + Math.sin(scrollPct * 60) * 0.012;
  autoGroup.position.x = Math.sin(scrollPct * 10) * 0.25;

  // Spin wheels proportional to distance travelled
  const spinDelta = dz * 3.0; // radians per unit
  autoWheels.forEach(w => { w.rotation.x += spinDelta; });

  // Camera choreography
  const cam = getCameraForScroll(scrollPct);
  camera.position.set(cam.pos[0] + autoGroup.position.x * 0.2, cam.pos[1], autoZ + cam.pos[2]);
  camera.lookAt(
    autoGroup.position.x * 0.3 + cam.look[0],
    cam.look[1],
    autoZ + cam.look[2]
  );

  // Panels — panel 0 visible from start, panel 5 stays visible at end
  const panels = document.querySelectorAll('.panel');
  const ss = 1 / NUM_SECTIONS;
  panels.forEach(p => {
    const idx = +p.dataset.index;
    let visible;
    if (idx === 0) {
      visible = scrollPct < ss * 0.95; // visible from scrollPct=0
    } else if (idx === NUM_SECTIONS - 1) {
      visible = scrollPct > 1 - ss * 0.95; // stays visible at scrollPct=1
    } else {
      const center = (idx + 0.5) * ss;
      visible = Math.abs(scrollPct - center) < ss * 0.45;
    }
    p.classList.toggle('visible', visible);
  });

  // Progress
  const activeIdx = Math.min(Math.floor(scrollPct * NUM_SECTIONS), NUM_SECTIONS - 1);
  document.querySelectorAll('.progress-dots span').forEach((d, i) => d.classList.toggle('active', i <= activeIdx));
  const pa = document.querySelector('.progress-auto');
  if (pa) pa.style.top = (scrollPct * 200) + 'px';

  // Dust follows camera
  if (dustParticles) {
    dustParticles.position.z = autoZ;
  }

  // Sun follows
  IM.sun.position.set(-20, 35, autoZ + 15);
  IM.sun.target.position.set(0, 0, autoZ);
  IM.sun.target.updateMatrixWorld();
  IM.fill.position.set(15, 10, autoZ - 10);

  // Road recycling
  recycleRoad(autoZ);
}

/* ─── GAME UPDATE ─────────────────────────────── */
function updateGame(dt) {
  if (phase === PH.OVER) return;

  autoGroup.position.z -= speed * dt * 60;
  const tx = LANE_X[targetLane];
  playerX += (tx - playerX) * 0.1;
  autoGroup.position.x = playerX;
  autoGroup.position.y = 0.15 + Math.sin(autoGroup.position.z * 2) * 0.015;
  autoGroup.rotation.z = (tx - playerX) * 0.04;

  // Spin wheels during game movement
  const gameSpin = speed * dt * 60 * 3.0;
  autoWheels.forEach(w => { w.rotation.x -= gameSpin; });

  camera.position.set(playerX * 0.3, 7, autoGroup.position.z + 13);
  camera.lookAt(playerX * 0.4, 1.5, autoGroup.position.z - 20);

  if (shakeAmt > 0) {
    camera.position.x += (Math.random()-0.5) * shakeAmt;
    camera.position.y += (Math.random()-0.5) * shakeAmt * 0.3;
    shakeAmt *= 0.87;
    if (shakeAmt < 0.01) shakeAmt = 0;
  }

  IM.sun.position.set(-20, 35, autoGroup.position.z + 15);
  IM.sun.target.position.set(0, 0, autoGroup.position.z);
  IM.sun.target.updateMatrixWorld();
  IM.fill.position.set(15, 10, autoGroup.position.z - 10);
  if (dustParticles) dustParticles.position.z = autoGroup.position.z;

  recycleRoad(autoGroup.position.z);

  if (phase === PH.GAME) {
    p2Time += dt;
    speed = 0.22 + p2Time * 0.004;
    score = Math.floor(p2Time * 10);
    spawnT += dt;
    if (spawnT > Math.max(0.5, 1.2 - p2Time * 0.015)) { spawnT = 0; spawnObstacle(); }

    for (let i = obstaclePool.length - 1; i >= 0; i--) {
      const o = obstaclePool[i];

      // Already hit — animate flying away
      if (o.userData.hit) {
        o.position.x += o.userData.vx * dt * 60;
        o.position.y += o.userData.vy * dt * 60;
        o.position.z += o.userData.vz * dt * 60;
        o.userData.vy -= 0.012; // gravity
        o.rotation.x += o.userData.spin * dt * 60;
        o.rotation.z += o.userData.spin * 0.7 * dt * 60;
        if (o.position.y < -3) {
          scene.remove(o); o.geometry.dispose(); obstaclePool.splice(i, 1);
        }
        continue;
      }

      // Collision check
      if (Math.abs(o.position.z - autoGroup.position.z) < 1.5 && Math.abs(o.position.x - autoGroup.position.x) < 1.3) {
        lives--; shakeAmt = 0.5;
        // Launch obstacle: fly sideways + up + spin
        const dir = o.position.x > autoGroup.position.x ? 1 : -1;
        o.userData.hit = true;
        o.userData.vx = dir * (0.15 + Math.random() * 0.12);
        o.userData.vy = 0.18 + Math.random() * 0.1;
        o.userData.vz = 0.08 + Math.random() * 0.06;
        o.userData.spin = (Math.random() - 0.5) * 0.3;
        if (lives <= 0) { phase = PH.OVER; speed = 0; showGameOver(); }
        updateHUD(); continue;
      }
      if (o.position.z > autoGroup.position.z + 30) {
        scene.remove(o); o.geometry.dispose(); obstaclePool.splice(i, 1);
      }
    }
    updateHUD();
  }
}

/* ─── ROAD RECYCLING (zero-alloc) ────────────── */
function recycleRoad(az) {
  const CHUNK = 80;
  let dirty = false;

  for (let i = 0; i < roadZs.length; i++) {
    if (roadZs[i] > az + CHUNK * 0.5) { // recycle sooner for smoother transitions
      // Find furthest-ahead chunk
      let minZ = Infinity;
      for (let j = 0; j < roadZs.length; j++) { if (roadZs[j] < minZ) minZ = roadZs[j]; }
      roadZs[i] = minZ - CHUNK;
      dirty = true;
    }
  }

  if (dirty) {
    // Update road instances
    for (let i = 0; i < ROAD_PLANES; i++) {
      dummy.position.set(0, 0, roadZs[i]);
      dummy.rotation.set(-Math.PI/2, 0, 0);
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      IM.road.setMatrixAt(i, dummy.matrix);
    }
    IM.road.instanceMatrix.needsUpdate = true;

    // Sidewalks mirror road Zs
    for (let i = 0; i < ROAD_PLANES; i++) {
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        dummy.position.set(side * (ROAD_W/2 + 2.15), 0.005, roadZs[i]);
        dummy.rotation.set(-Math.PI/2, 0, 0);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        IM.sidewalk.setMatrixAt(i*2+s, dummy.matrix);
      }
    }
    IM.sidewalk.instanceMatrix.needsUpdate = true;

    // Grass mirrors road Zs
    for (let i = 0; i < ROAD_PLANES; i++) {
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        dummy.position.set(side * (ROAD_W/2 + 44), -0.02, roadZs[i]);
        dummy.rotation.set(-Math.PI/2, 0, 0);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        IM.grass.setMatrixAt(i*2+s, dummy.matrix);
      }
    }
    IM.grass.instanceMatrix.needsUpdate = true;
  }

  // Center line follows auto
  if (IM.centerLine) IM.centerLine.position.z = az - (ROAD_PLANES * 80) / 2 + 40;
}

/* ─── HUD ─────────────────────────────────────── */
function updateHUD() {
  const le = document.getElementById('hud-lives');
  const se = document.getElementById('hud-score');
  if (le) le.innerHTML = '🛺'.repeat(lives) + '<span style="opacity:0.2">' + '🛺'.repeat(3-lives) + '</span>';
  if (se) se.textContent = `Score: ${score}`;
}

function showGameOver() {
  const best = +(localStorage.getItem('blr3d_best') || 0);
  if (score > best) localStorage.setItem('blr3d_best', score);
  document.getElementById('splash-score').textContent = `Score: ${score}  ·  Best: ${Math.max(score, best)}`;
  document.getElementById('splash').classList.remove('hidden');
}

/* ─── INPUT ───────────────────────────────────── */
function onKey(e) {
  if (phase === PH.SCROLL) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); targetLane = Math.max(0, targetLane - 1); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); targetLane = Math.min(2, targetLane + 1); }
  if ((e.code === 'Space' || e.code === 'Enter') && phase === PH.OVER) { e.preventDefault(); handleContinue(); }
  if (e.code === 'Escape') exitGame();
}
function onTS(e) { touchX = e.touches[0].clientX; }
function onTE(e) {
  if (phase === PH.SCROLL) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 30) { targetLane = dx < 0 ? Math.max(0, targetLane-1) : Math.min(2, targetLane+1); }
  else if (phase === PH.OVER) handleContinue();
}

/* ─── GAME FLOW ───────────────────────────────── */
function startGame() {
  phase = PH.GAME;
  gameStartZ = autoGroup.position.z;
  speed = 0.22; lives = 3; score = 0;
  p2Time = 0; spawnT = 0; targetLane = 1; playerX = 0; shakeAmt = 0;
  obstaclePool.forEach(o => scene.remove(o)); obstaclePool = [];
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
  document.getElementById('game-hud').classList.remove('hidden');
  document.getElementById('scroll-driver').style.pointerEvents = 'none';
  document.body.style.overflow = 'hidden';
  updateHUD();
}

function handleContinue() {
  if (phase === PH.OVER) {
    document.getElementById('splash').classList.add('hidden');
    obstaclePool.forEach(o => scene.remove(o)); obstaclePool = [];
    autoGroup.position.z = gameStartZ;
    phase = PH.GAME; speed = 0.22;
    lives = 3; score = 0; p2Time = 0; spawnT = 0; targetLane = 1; playerX = 0;
    updateHUD();
  }
}

function exitGame() {
  phase = PH.SCROLL;
  document.getElementById('game-hud').classList.add('hidden');
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('scroll-driver').style.pointerEvents = '';
  document.body.style.overflow = '';
  obstaclePool.forEach(o => scene.remove(o)); obstaclePool = [];
  updateScroll();
}

/* ─── RENDER LOOP ─────────────────────────────── */
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Animate dust
  if (dustParticles) {
    const arr = dustParticles.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += (Math.random() - 0.5) * 0.02;
      arr[i+1] += (Math.random() - 0.5) * 0.01;
      if (arr[i+1] > 8) arr[i+1] = 0;
      if (arr[i+1] < 0) arr[i+1] = 8;
    }
    dustParticles.geometry.attributes.position.needsUpdate = true;
  }

  // Animate pedestrians
  animatePedestrians(clock.elapsedTime);

  if (phase === PH.SCROLL) updateScroll();
  else updateGame(dt);

  composer.render(dt);
}

/* ─── WIRE UP ─────────────────────────────────── */
window.addEventListener('scroll', () => { if (phase === PH.SCROLL) updateScroll(); }, { passive: true });
document.addEventListener('keydown', onKey);
document.addEventListener('touchstart', onTS, { passive: true });
document.addEventListener('touchend', onTE);

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-play')?.addEventListener('click', startGame);
  document.getElementById('hud-exit')?.addEventListener('click', exitGame);
  document.getElementById('splash-retry')?.addEventListener('click', handleContinue);
  document.getElementById('splash-back')?.addEventListener('click', exitGame);

  // Set scroll prompt text based on input type
  const promptText = document.querySelector('.scroll-prompt-text');
  if (promptText && window.matchMedia('(pointer: coarse)').matches) {
    promptText.textContent = 'Swipe up to drive';
  }
});

init();
