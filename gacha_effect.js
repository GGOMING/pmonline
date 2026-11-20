// ═══════════════════════════════════════════════════════════
// 가챠 연출 모듈 — index.html 에서 type="module" 로 로드
//
// 사용:
//   await window.gachaEffect.play(results)
//   results = [{ id, name, grade, iconPath, ... }]
//
// 의존: Three.js 0.160 (importmap 경유)
// 자산: assets/wallpaper/emblem.png (카드 뒷면)
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';

const EMBLEM_IMG = 'assets/wallpaper/emblem.png';
const GRADE_ORDER = ['normal', 'rare', 'unique', 'hero', 'legend'];
const GRADE_COLORS = {
  normal: new THREE.Color(0xaaaaaa),
  rare:   new THREE.Color(0x3399ff),
  unique: new THREE.Color(0xa335ee),
  hero:   new THREE.Color(0xdc143c),
  legend: new THREE.Color(0xffd700),
};

const QUALITY = {
  high:   { bgStars: 6000, explosionParticles: 600, trailLength: 20, bloomStrength: 1.8, motes: 80, dpr: window.devicePixelRatio || 1 },
  medium: { bgStars: 3000, explosionParticles: 350, trailLength: 12, bloomStrength: 1.5, motes: 50, dpr: 1 },
  low:    { bgStars: 1200, explosionParticles: 150, trailLength:  8, bloomStrength: 1.2, motes: 25, dpr: 1 },
};
const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let currentQuality = (localStorage.getItem('gachaEffectQuality'))
  || (isMobileUA ? 'medium' : 'high');
if (!QUALITY[currentQuality]) currentQuality = isMobileUA ? 'medium' : 'high';

// Three.js 셋업 ─────────────────────────────────────────────
const canvas = document.getElementById('gachaCanvas');
if (!canvas) {
  console.warn('[gacha-effect] #gachaCanvas not found — disabling');
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 12);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(QUALITY[currentQuality].dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  QUALITY[currentQuality].bloomStrength, 0.6, 0.15
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Glow 텍스처 ─────────────────────────────────────────────
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
const GLOW_TEX = makeGlowTexture();

// 성운 ─────────────────────────────────────────────────────
const nebulaMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(0x4020a0) },
    uColor2: { value: new THREE.Color(0x205080) },
    uIntensity: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor1; uniform vec3 uColor2; uniform float uIntensity;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
    }
    void main() {
      vec2 p = (vUv - 0.5) * 2.0; float d = length(p);
      vec2 uv = p * 2.0 + vec2(uTime * 0.05, uTime * 0.03);
      float n = noise(uv) * 0.5 + noise(uv * 2.0) * 0.25 + noise(uv * 4.0) * 0.125;
      vec3 col = mix(uColor1, uColor2, n);
      float vignette = smoothstep(1.4, 0.3, d);
      col *= vignette * uIntensity;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  depthWrite: false, transparent: true,
});
const nebula = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), nebulaMaterial);
nebula.position.z = -20;
scene.add(nebula);

// 배경 별 ─────────────────────────────────────────────────
let bgStars;
function buildBgStars() {
  if (bgStars) { scene.remove(bgStars); bgStars.geometry.dispose(); bgStars.material.dispose(); }
  const count = QUALITY[currentQuality].bgStars;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 15 + Math.random() * 25;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    positions[i*3]   = r * Math.cos(theta) * Math.cos(phi);
    positions[i*3+1] = r * Math.sin(phi) * 5;
    positions[i*3+2] = r * Math.sin(theta) * Math.cos(phi) - 15;
    sizes[i] = Math.random() * 0.1 + 0.02;
    const c = 0.7 + Math.random() * 0.3;
    colors[i*3] = c; colors[i*3+1] = c; colors[i*3+2] = Math.min(1, c + 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSize; varying vec3 vColor; varying float vTwinkle; uniform float uTime;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTwinkle = 0.5 + 0.5 * sin(uTime * 2.0 + position.x * 3.0 + position.y * 5.0);
        gl_PointSize = aSize * 300.0 / -mv.z * (0.6 + vTwinkle * 0.8);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor; varying float vTwinkle;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard;
        float alpha = (1.0 - d * 2.0) * (0.3 + vTwinkle * 0.7);
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  bgStars = new THREE.Points(g, m);
  scene.add(bgStars);
}
buildBgStars();

// 별똥별 ───────────────────────────────────────────────────
class ShootingStar {
  constructor(grade, startPos, endPos, duration) {
    const color = GRADE_COLORS[grade] || GRADE_COLORS.rare;
    this.start = startPos.clone(); this.end = endPos.clone();
    this.duration = duration; this.t = 0;
    const headMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.head = new THREE.Sprite(headMat); this.head.scale.set(0.8, 0.8, 0.8);
    this.head.position.copy(startPos); scene.add(this.head);
    const trailLen = QUALITY[currentQuality].trailLength;
    this.trailPositions = [];
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailLen * 3), 3));
    this.trail = new THREE.Line(trailGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    this.trailMaxLen = trailLen; scene.add(this.trail); this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const p = Math.min(1, this.t / this.duration);
    const eased = 1 - Math.pow(1 - p, 3);
    this.head.position.lerpVectors(this.start, this.end, eased);
    this.trailPositions.unshift(this.head.position.clone());
    if (this.trailPositions.length > this.trailMaxLen) this.trailPositions.pop();
    const arr = this.trail.geometry.attributes.position.array;
    for (let i = 0; i < this.trailMaxLen; i++) {
      const src = this.trailPositions[i] || this.head.position;
      arr[i*3] = src.x; arr[i*3+1] = src.y; arr[i*3+2] = src.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailPositions.length);
    if (p >= 1) this.destroy();
  }
  destroy() {
    scene.remove(this.head); scene.remove(this.trail);
    this.head.material.dispose(); this.trail.geometry.dispose(); this.trail.material.dispose();
    this.done = true;
  }
}
const shootingStars = [];

// 폭발 요소 ───────────────────────────────────────────────
class CoreFlash {
  constructor(center, color, size) {
    const mat = new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sprite = new THREE.Sprite(mat); this.sprite.position.copy(center); this.sprite.scale.setScalar(0.5);
    this.maxSize = size; scene.add(this.sprite); this.t = 0; this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const p = this.t / 0.6;
    if (p < 0.15) { const q = p / 0.15; this.sprite.scale.setScalar(0.5 + q * this.maxSize); this.sprite.material.opacity = 1; }
    else if (p < 1) { const q = (p - 0.15) / 0.85; this.sprite.scale.setScalar(0.5 + this.maxSize + q * this.maxSize * 0.3); this.sprite.material.opacity = 1 - q; }
    else { this.destroy(); }
  }
  destroy() { scene.remove(this.sprite); this.sprite.material.dispose(); this.done = true; }
}
class Shockwave {
  constructor(center, color, grade, delay = 0) {
    this.delay = delay; this.center = center.clone(); this.color = color; this.grade = grade;
    this.t = 0; this.done = false; this.started = false;
  }
  start() {
    const g = new THREE.TorusGeometry(0.3, 0.08, 8, 48);
    const m = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(g, m); this.ring.position.copy(this.center); this.ring.lookAt(camera.position);
    scene.add(this.ring); this.started = true;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (!this.started) { if (this.t >= this.delay) { this.t = 0; this.start(); } return; }
    const p = Math.min(1, this.t / 0.9);
    this.ring.scale.setScalar(1 + p * 20);
    this.ring.material.opacity = (1 - p) * 0.95;
    if (p >= 1) this.destroy();
  }
  destroy() {
    if (this.ring) { scene.remove(this.ring); this.ring.geometry.dispose(); this.ring.material.dispose(); }
    this.done = true;
  }
}
class Sparks {
  constructor(center, color, count, speed) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3] = center.x; positions[i*3+1] = center.y; positions[i*3+2] = center.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = speed * (0.5 + Math.random() * 1.0);
      velocities[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      velocities[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      velocities[i*3+2] = r * Math.cos(phi);
      sizes[i] = Math.random() * 0.5 + 0.15;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: color.clone() } },
      vertexShader: `
        attribute float aSize; varying float vAlpha; uniform float uTime;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 220.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
          vAlpha = clamp(1.0 - uTime * 0.55, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha; uniform vec3 uColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float d = length(c);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          float a = core * vAlpha;
          gl_FragColor = vec4(uColor * (0.8 + core * 0.8), a);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(g, m);
    this.velocities = velocities; this.life = 0; this.maxLife = 1.8; this.done = false;
    scene.add(this.points);
  }
  update(dt) {
    if (this.done) return;
    this.life += dt;
    this.points.material.uniforms.uTime.value = this.life;
    const pos = this.points.geometry.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i*3]   += this.velocities[i*3]   * dt;
      pos[i*3+1] += this.velocities[i*3+1] * dt - 0.4 * dt;
      pos[i*3+2] += this.velocities[i*3+2] * dt;
      this.velocities[i*3]   *= 0.96;
      this.velocities[i*3+1] *= 0.96;
      this.velocities[i*3+2] *= 0.96;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.life > this.maxLife) this.destroy();
  }
  destroy() { scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); this.done = true; }
}
class Streaks {
  constructor(center, color, count, length) {
    this.group = new THREE.Group(); this.streaks = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
      const g = new THREE.CylinderGeometry(0.03, 0.08, length, 6, 1, true);
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const streak = new THREE.Mesh(g, m);
      streak.position.copy(center);
      streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      streak.position.add(dir.clone().multiplyScalar(length * 0.5));
      streak.userData = { dir: dir.clone(), speed: 3 + Math.random() * 4 };
      this.group.add(streak); this.streaks.push(streak);
    }
    scene.add(this.group); this.t = 0; this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const p = Math.min(1, this.t / 0.9);
    for (const s of this.streaks) {
      s.position.add(s.userData.dir.clone().multiplyScalar(s.userData.speed * dt));
      s.material.opacity = Math.max(0, 1 - p);
      s.scale.y = 1 - p * 0.3;
    }
    if (p >= 1) this.destroy();
  }
  destroy() { for (const s of this.streaks) { s.geometry.dispose(); s.material.dispose(); } scene.remove(this.group); this.done = true; }
}
function epicExplode(center, grade) {
  const color = GRADE_COLORS[grade];
  const baseCount = QUALITY[currentQuality].explosionParticles;
  const flashSize = grade === 'legend' ? 10 : grade === 'hero' ? 7 : grade === 'unique' ? 5 : 3;
  activeFxList.push(new CoreFlash(center, color, flashSize));
  const sparkMult = grade === 'legend' ? 1.6 : grade === 'hero' ? 1.3 : grade === 'unique' ? 1.0 : 0.7;
  const sparkSpeed = grade === 'legend' ? 10 : grade === 'hero' ? 8 : grade === 'unique' ? 7 : 5;
  activeFxList.push(new Sparks(center, color, Math.floor(baseCount * sparkMult), sparkSpeed));
  if (grade === 'unique' || grade === 'hero' || grade === 'legend') {
    activeFxList.push(new Shockwave(center, color, grade, 0));
    activeFxList.push(new Streaks(center, color, grade === 'legend' ? 24 : grade === 'hero' ? 18 : 14, 6));
    activeFxList.push(new Shockwave(center, color, grade, 0.2));
  }
  if (grade === 'hero' || grade === 'legend') {
    activeFxList.push(new Shockwave(center, color, grade, 0.4));
    setTimeout(() => {
      if (skipRequested) return;
      activeFxList.push(new Sparks(center, color, Math.floor(baseCount * 0.5), sparkSpeed * 1.4));
      activeFxList.push(new CoreFlash(center, color, flashSize * 0.6));
    }, 250);
  }
  if (grade === 'legend') {
    activeFxList.push(new Shockwave(center, color, grade, 0.6));
    setTimeout(() => {
      if (skipRequested) return;
      activeFxList.push(new CoreFlash(center, new THREE.Color(0xffffff), 14));
      activeFxList.push(new Sparks(center, color, Math.floor(baseCount * 0.8), sparkSpeed * 1.6));
    }, 450);
  }
}
const activeFxList = [];

// 발광 구슬 ───────────────────────────────────────────────
class GlowOrb {
  constructor(grade) {
    const color = GRADE_COLORS[grade]; this.grade = grade;
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    const outerMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.outer = new THREE.Sprite(outerMat); this.outer.scale.set(5, 5, 5);
    this.group = new THREE.Group(); this.group.add(this.core); this.group.add(this.glow); this.group.add(this.outer);
    this.group.scale.set(0.01, 0.01, 0.01); scene.add(this.group);
    this.phase = 'grow'; this.t = 0; this.done = false;
  }
  startExpand() { this.phase = 'expand'; this.t = 0; }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.phase === 'grow') {
      const p = Math.min(1, this.t / 0.5);
      const s = 1 - Math.pow(1 - p, 3);
      this.group.scale.setScalar(s * 1.2);
      if (p >= 1) { this.phase = 'pulse'; this.t = 0; }
    } else if (this.phase === 'pulse') {
      const pulse = 1 + Math.sin(this.t * 4) * 0.12;
      this.group.scale.setScalar(1.2 * pulse);
      if (this.grade === 'legend') this.group.rotation.y += dt * 2;
    } else if (this.phase === 'expand') {
      const p = Math.min(1, this.t / 0.5);
      const s = 1.2 + p * p * 10;
      this.group.scale.setScalar(s);
      this.glow.material.opacity = 0.6 * (1 - p);
      this.outer.material.opacity = 0.7 * (1 - p);
      this.core.material.opacity = (1 - p);
      this.core.material.transparent = true;
      if (p >= 1) this.destroy();
    }
  }
  destroy() {
    scene.remove(this.group);
    this.core.geometry.dispose(); this.core.material.dispose();
    this.glow.geometry.dispose(); this.glow.material.dispose();
    this.outer.material.dispose();
    this.done = true;
  }
}
let currentOrb = null;

// 빛 무더기 ───────────────────────────────────────────────
class LightMotes {
  constructor(grade) {
    const baseColor = GRADE_COLORS[grade]; this.grade = grade;
    this.group = new THREE.Group();
    const count = QUALITY[currentQuality].motes * (grade === 'legend' ? 1.4 : grade === 'hero' ? 1.2 : 1.0);
    this.motes = [];
    for (let i = 0; i < Math.floor(count); i++) {
      const mix = Math.random();
      const col = baseColor.clone().lerp(new THREE.Color(0xffffff), mix * 0.5);
      const mat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      const scale = 0.3 + Math.random() * 0.7;
      sprite.scale.set(scale, scale, scale);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dist = 1.5 + Math.random() * 3.5;
      sprite.position.set(dist * Math.sin(phi) * Math.cos(theta), dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi));
      sprite.userData = {
        baseDist: dist, theta, phi,
        orbitSpeed: (Math.random() - 0.5) * 1.2,
        verticalSpeed: (Math.random() - 0.5) * 0.4,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.5 + Math.random() * 2.5,
        baseScale: scale,
        baseOpacity: 0.5 + Math.random() * 0.5,
        startDelay: Math.random() * 0.4,
      };
      this.group.add(sprite); this.motes.push(sprite);
    }
    scene.add(this.group); this.t = 0; this.phase = 'in'; this.phaseOutT = 0; this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    for (const m of this.motes) {
      const d = m.userData;
      d.theta += d.orbitSpeed * dt * 0.4;
      d.phi += d.verticalSpeed * dt * 0.1;
      const distMod = d.baseDist + Math.sin(this.t * 0.6 + d.twinklePhase) * 0.2;
      m.position.set(distMod * Math.sin(d.phi) * Math.cos(d.theta), distMod * Math.sin(d.phi) * Math.sin(d.theta), distMod * Math.cos(d.phi));
      const twinkle = 0.4 + 0.6 * (Math.sin(d.twinklePhase + d.twinkleSpeed * this.t) * 0.5 + 0.5);
      m.scale.setScalar(d.baseScale * (0.7 + twinkle * 0.5));
      let fadeFactor = 0;
      if (this.phase === 'in') fadeFactor = Math.max(0, Math.min(1, (this.t - d.startDelay) / 0.5));
      else if (this.phase === 'hold') fadeFactor = 1;
      else if (this.phase === 'out') fadeFactor = Math.max(0, 1 - (this.t - this.phaseOutT) / 0.5);
      m.material.opacity = d.baseOpacity * twinkle * fadeFactor;
    }
    if (this.phase === 'in' && this.t > 0.9) this.phase = 'hold';
    if (this.phase === 'out' && this.t - this.phaseOutT > 0.6) this.destroy();
  }
  startOut() { this.phaseOutT = this.t; this.phase = 'out'; }
  destroy() { for (const m of this.motes) { scene.remove(m); m.material.dispose(); } this.done = true; }
}
let currentMotes = null;

// 바닥 파동 ───────────────────────────────────────────────
class Ripple {
  constructor(grade) {
    const color = GRADE_COLORS[grade];
    const g = new THREE.RingGeometry(0.1, 0.15, 64);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, m); this.mesh.rotation.x = -Math.PI / 2.3; this.mesh.position.y = -3;
    scene.add(this.mesh); this.t = 0; this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.mesh.scale.setScalar(1 + this.t * 30);
    this.mesh.material.opacity = Math.max(0, 0.9 * (1 - this.t / 1.2));
    if (this.t > 1.2) this.destroy();
  }
  destroy() { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.done = true; }
}
const ripples = [];

// 카메라 shake ────────────────────────────────────────────
let cameraShake = 0;
function shakeCamera(intensity, duration) {
  cameraShake = intensity;
  setTimeout(() => cameraShake = 0, duration);
}

// 루프 ─────────────────────────────────────────────────────
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  nebulaMaterial.uniforms.uTime.value = t;
  if (bgStars) bgStars.material.uniforms.uTime.value = t;
  if (cameraShake > 0) {
    camera.position.x = (Math.random() - 0.5) * cameraShake;
    camera.position.y = (Math.random() - 0.5) * cameraShake;
  } else {
    camera.position.x *= 0.9;
    camera.position.y *= 0.9;
  }
  for (let i = shootingStars.length - 1; i >= 0; i--) { shootingStars[i].update(dt); if (shootingStars[i].done) shootingStars.splice(i, 1); }
  for (let i = activeFxList.length - 1; i >= 0; i--) { activeFxList[i].update(dt); if (activeFxList[i].done) activeFxList.splice(i, 1); }
  if (currentOrb) { currentOrb.update(dt); if (currentOrb.done) currentOrb = null; }
  if (currentMotes) { currentMotes.update(dt); if (currentMotes.done) currentMotes = null; }
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].update(dt); if (ripples[i].done) ripples.splice(i, 1); }
  composer.render();
  requestAnimationFrame(animate);
}
animate();

// 품질 전환 ───────────────────────────────────────────────
function setQuality(q) {
  if (!QUALITY[q]) return;
  currentQuality = q;
  renderer.setPixelRatio(QUALITY[q].dpr);
  bloomPass.strength = QUALITY[q].bloomStrength;
  buildBgStars();
  try { localStorage.setItem('gachaEffectQuality', q); } catch(e){}
}

// 헬퍼 ─────────────────────────────────────────────────────
function highestGrade(res) {
  let hi = 'normal';
  for (const r of res) if (GRADE_ORDER.indexOf(r.grade) > GRADE_ORDER.indexOf(hi)) hi = r.grade;
  return hi;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function buildCardHTML(r, i) {
  // 호스트(index.html)의 cardIcon() 사용 — renew/pmcards/wc3_icons/iconPath/SVG 5단계 폴백
  let iconHTML;
  if (typeof window.cardIcon === 'function') {
    try { iconHTML = window.cardIcon(r); }
    catch(e) { iconHTML = null; }
  }
  if (!iconHTML) {
    iconHTML = r.iconPath
      ? `<img src="${r.iconPath}" alt="${escapeHtml(r.name)}" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;">`
      : (r.icon || '❓');
  }
  return `
    <div class="fx-card" data-i="${i}" data-grade="${r.grade}">
      <div class="fx-card-inner">
        <div class="fx-card-face fx-card-back"><img class="emblem" src="${EMBLEM_IMG}" alt="" draggable="false"></div>
        <div class="fx-card-face fx-card-front g-${r.grade}">
          <div class="fx-icon">${iconHTML}</div>
          <div class="fx-name">${escapeHtml(r.name)}</div>
          <div class="fx-grade">${(r.grade || '').toUpperCase()}</div>
        </div>
      </div>
    </div>
  `;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function renderCardLayout(inner, results) {
  const count = results.length;
  if (count === 10) {
    const isMobile = window.innerWidth <= 600;
    const rows = isMobile
      ? [results.slice(0,3), results.slice(3,6), results.slice(6,10)]
      : [results.slice(0,5), results.slice(5,10)];
    let idx = 0;
    inner.innerHTML = rows.map(row =>
      `<div class="ge-card-row">${row.map(r => buildCardHTML(r, idx++)).join('')}</div>`
    ).join('');
  } else {
    inner.innerHTML = `<div class="ge-card-row">${results.map((r,i) => buildCardHTML(r, i)).join('')}</div>`;
  }
}

// 메인 시퀀스 ─────────────────────────────────────────────
let gachaRunning = false;
let skipRequested = false;

async function playGacha(results) {
  if (!Array.isArray(results) || !results.length) return;
  if (gachaRunning) return;
  gachaRunning = true;
  skipRequested = false;

  const count = results.length;
  const top = highestGrade(results);

  const canvasEl = document.getElementById('gachaCanvas');
  const cardOverlay = document.getElementById('gachaCardOverlay');
  const skipBtn = document.getElementById('gachaSkipBtn');
  if (!canvasEl || !cardOverlay || !skipBtn) {
    console.warn('[gacha-effect] required DOM missing');
    gachaRunning = false; return;
  }

  canvasEl.classList.add('active');
  cardOverlay.classList.remove('active');
  skipBtn.classList.add('active');

  // 1. 성운 배경
  if (top === 'legend')      { nebulaMaterial.uniforms.uColor1.value.setHex(0xa07020); nebulaMaterial.uniforms.uColor2.value.setHex(0x604010); }
  else if (top === 'hero')   { nebulaMaterial.uniforms.uColor1.value.setHex(0x801020); nebulaMaterial.uniforms.uColor2.value.setHex(0x400810); }
  else if (top === 'unique') { nebulaMaterial.uniforms.uColor1.value.setHex(0x502080); nebulaMaterial.uniforms.uColor2.value.setHex(0x301050); }
  else                       { nebulaMaterial.uniforms.uColor1.value.setHex(0x203050); nebulaMaterial.uniforms.uColor2.value.setHex(0x101830); }
  const nebulaIn = setInterval(() => {
    nebulaMaterial.uniforms.uIntensity.value = Math.min(1, nebulaMaterial.uniforms.uIntensity.value + 0.03);
    if (nebulaMaterial.uniforms.uIntensity.value >= 1) clearInterval(nebulaIn);
  }, 16);

  await sleep(600);
  if (skipRequested) return endGacha();

  // 2. 별똥별
  const starCount = count > 1 ? 20 : (top === 'legend' ? 10 : top === 'hero' ? 8 : top === 'unique' ? 6 : 5);
  for (let i = 0; i < starCount; i++) {
    setTimeout(() => {
      if (skipRequested) return;
      const sx = (Math.random() - 0.5) * 35;
      const sy = 15 + Math.random() * 12;
      const sz = -5 + Math.random() * 4;
      shootingStars.push(new ShootingStar(top, new THREE.Vector3(sx, sy, sz), new THREE.Vector3(0, 0, 0), 0.9));
    }, i * 55);
  }
  await sleep(700 + starCount * 55);
  if (skipRequested) return endGacha();

  // 3. 폭발
  epicExplode(new THREE.Vector3(0, 0, 0), top);
  if (top === 'legend') shakeCamera(0.5, 800);
  else if (top === 'hero') shakeCamera(0.35, 600);
  else if (top === 'unique') shakeCamera(0.2, 400);
  await sleep(350);

  // 4. 발광 구슬 + 빛 무더기
  currentOrb = new GlowOrb(top);
  if (top === 'unique' || top === 'hero' || top === 'legend') currentMotes = new LightMotes(top);
  const orbDwell = top === 'legend' ? 1800 : top === 'hero' ? 1100 : top === 'unique' ? 800 : 400;
  await sleep(orbDwell);
  if (skipRequested) return endGacha();

  // 5. 구슬 폭발 + 바닥 파동
  if (currentOrb) currentOrb.startExpand();
  if (currentMotes) currentMotes.startOut();
  ripples.push(new Ripple(top));
  if (top === 'legend') {
    setTimeout(() => ripples.push(new Ripple(top)), 300);
    shakeCamera(0.5, 700);
  } else if (top === 'hero') shakeCamera(0.25, 500);
  activeFxList.push(new CoreFlash(new THREE.Vector3(0,0,0), GRADE_COLORS[top], top === 'legend' ? 12 : 8));
  activeFxList.push(new Sparks(new THREE.Vector3(0,0,0), GRADE_COLORS[top], Math.floor(QUALITY[currentQuality].explosionParticles * 0.6), 9));
  await sleep(400);

  // 6. 카드 리빌
  const inner = document.getElementById('gachaCardOverlayInner');
  cardOverlay.className = 'ge-card-overlay active' + (count > 1 ? ' ten' : '');
  renderCardLayout(inner, results);

  await sleep(50);
  inner.querySelectorAll('.fx-card').forEach((el, i) => {
    setTimeout(() => el.classList.add('appear'), i * 80);
  });

  await sleep(600 + results.length * 80);
  if (skipRequested) {
    inner.querySelectorAll('.fx-card').forEach(el => el.classList.add('flipped'));
    await sleep(500);
    return endGacha();
  }

  // 플립
  const flipCards = inner.querySelectorAll('.fx-card');
  await new Promise(resolve => {
    let flippedCount = 0;
    let resolved = false;
    const total = flipCards.length;
    const checkDone = () => {
      if (flippedCount >= total && !resolved) {
        resolved = true;
        clearInterval(skipPoll);
        cardOverlay.removeEventListener('click', bgClickHandler);
        setTimeout(resolve, 1500);
      }
    };
    flipCards.forEach((el, i) => {
      const grade = results[i].grade;
      const doFlip = () => {
        if (el.dataset.flipping === '1' || el.classList.contains('flipped')) return;
        el.dataset.flipping = '1';
        if (grade === 'unique' || grade === 'hero' || grade === 'legend') {
          el.classList.add('pre-flip-' + grade);
          const flipOffset = grade === 'legend' ? 500 : grade === 'hero' ? 380 : 280;
          setTimeout(() => {
            el.classList.add('flip-' + grade);
            el.classList.add('flipped');
          }, flipOffset);
        } else {
          el.classList.add('flipped');
        }
        flippedCount++;
        checkDone();
      };
      el._doFlip = doFlip;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); doFlip(); });
    });
    let autoTriggered = false;
    const bgClickHandler = (e) => {
      if (autoTriggered) return;
      if (e.target.closest('.fx-card')) return;
      autoTriggered = true;
      let cumDelay = 0;
      flipCards.forEach((el, i) => {
        if (el.classList.contains('flipped') || el.dataset.flipping === '1') return;
        const grade = results[i].grade;
        setTimeout(() => el._doFlip(), cumDelay);
        const interval = grade === 'legend' ? 900 : grade === 'hero' ? 700 : grade === 'unique' ? 550 : 260;
        cumDelay += interval;
      });
    };
    cardOverlay.addEventListener('click', bgClickHandler);
    const skipPoll = setInterval(() => {
      if (skipRequested && !resolved) {
        clearInterval(skipPoll);
        cardOverlay.removeEventListener('click', bgClickHandler);
        flipCards.forEach(el => {
          if (!el.classList.contains('flipped')) {
            el.dataset.flipping = '1';
            el.classList.add('flipped');
          }
        });
        flippedCount = total;
        checkDone();
      }
    }, 100);
  });

  endGacha();
}

function endGacha() {
  gachaRunning = false;
  skipRequested = false;
  for (const s of shootingStars) s.destroy();
  shootingStars.length = 0;
  for (const fx of activeFxList) fx.destroy();
  activeFxList.length = 0;
  if (currentOrb) { currentOrb.destroy(); currentOrb = null; }
  if (currentMotes) { currentMotes.destroy(); currentMotes = null; }
  for (const r of ripples) r.destroy();
  ripples.length = 0;
  cameraShake = 0;
  camera.position.x = 0; camera.position.y = 0;
  nebulaMaterial.uniforms.uIntensity.value = 0;
  const canvasEl = document.getElementById('gachaCanvas');
  const cardOverlay = document.getElementById('gachaCardOverlay');
  const skipBtn = document.getElementById('gachaSkipBtn');
  if (canvasEl) canvasEl.classList.remove('active');
  if (cardOverlay) cardOverlay.classList.remove('active');
  if (skipBtn) skipBtn.classList.remove('active');
}

function skipGacha() { skipRequested = true; }

// 전역 API 노출 ────────────────────────────────────────────
window.gachaEffect = {
  play: playGacha,
  skip: skipGacha,
  setQuality,
  isReady: true,
};
console.log('[gacha-effect] ready · quality:', currentQuality);
