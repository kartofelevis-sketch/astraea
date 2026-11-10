import * as THREE from 'three';

const $ = id => document.getElementById(id);
const DATA = JSON.parse($('data').textContent);

/* ---------- 1. Assets ---------- */
const P = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_';
const A = Object.assign({
  MAP:   P + '20261031_030432_a1948696-c1d5-4468-845e-7d1291f80943.png&w=2688&q=92',
  LAND:  P + '20261031_030420_da39d0cf-af67-4e33-a487-6469549cfbff.png&w=2400&q=88',
  FORE:  P + '20261031_030420_fe406b69-3e6f-4b7c-a17e-ef09db0d270b.png&w=2400&q=88',
  CARDS: P + '20261031_030420_e222aa05-c121-4f31-a466-0321badc0e28.png&w=1400&q=85'
}, DATA.assets || {});
const SHEET = {w: 2336, h: 1744};
const SITES = DATA.sites;
const THARSIS = DATA.tharsis;

/* ---------- helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, k) => a + (b - a) * k;
const seg = (p, a, b) => clamp((p - a) / (b - a));
const io = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const out = k => 1 - Math.pow(1 - k, 3);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dirOf = (u, v) => {
  const ph = 2 * Math.PI * u, th = Math.PI * v;
  return [-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)];
};
const faceYaw = d => Math.atan2(-d[0], d[2]);
const faceLat = d => Math.asin(d[1]);

/* ---------- DOM ---------- */
const hero = $('hero'), gl = $('gl'), dust = $('dust');
const word0 = $('word0'), eyebrow = $('eyebrow'), flare = $('flare');
const pin = $('pin'), word1 = $('word1'), sitesEl = $('sites'), card = $('card');
const region = $('region'), land = $('land'), fore = $('fore'), dest = $('dest');
const destName = $('destName'), fog = $('fog'), scrim = $('scrim'), bar = $('bar'), more = $('more');
const decks = {A: $('deckA')};
const railBtns = [...document.querySelectorAll('#rail button')];

land.style.backgroundImage = `url("${A.LAND}")`;
fore.style.backgroundImage = `url("${A.FORE}")`;

/* ---------- sites ---------- */
SITES.forEach((s, i) => {
  const li = document.createElement('li');
  li.dataset.i = i; li.textContent = s.name;
  sitesEl.appendChild(li);
});
const lis = [...sitesEl.children];
let cur = 0;
function placeCard() {
  const r = lis[cur].getBoundingClientRect();
  card.style.top = (r.top + r.height / 2 - card.offsetHeight / 2) + 'px';
}
function fitDest() {
  const b = destName; b.style.fontSize = '';
  const was = dest.style.display; dest.style.display = 'block';
  b.style.display = 'inline-block';
  const max = innerWidth * .92, w = b.offsetWidth;
  b.style.display = '';
  if (w > max) b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * max / w) + 'px';
  dest.style.display = was;
}
function pick(i) {
  cur = i;
  lis.forEach((li, k) => li.classList.toggle('on', k === i));
  const s = SITES[i];
  if (s.photo) {
    card.style.backgroundImage = `url("${s.photo}")`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = '50% 50%';
  } else {
    const [x, y, w, h] = s.box;
    card.style.backgroundImage = `url("${A.CARDS}")`;
    card.style.backgroundSize = `${SHEET.w / w * 100}% ${SHEET.h / h * 100}%`;
    card.style.backgroundPosition = `${x / (SHEET.w - w) * 100}% ${y / (SHEET.h - h) * 100}%`;
  }
  destName.textContent = s.name; fitDest(); region.textContent = s.name.toUpperCase();
  const d2 = $('d2'); if (d2) d2.value = s.name;
  placeCard(); setTimeout(placeCard, 320);
}
lis.forEach((li, i) => {
  li.addEventListener('mouseenter', () => pick(i));
  li.addEventListener('click', () => { pick(i); go(2); });
});
$('explore').addEventListener('click', e => { e.preventDefault(); go(2); });
railBtns.forEach((b, i) => b.addEventListener('click', () => navTo(i)));

/* ---------- three.js ---------- */
const renderer = new THREE.WebGLRenderer({canvas: gl, alpha: true, antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2e5, 2e5);

const planet = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group();
scene.add(planet); planet.add(tilt); tilt.add(spin);

const sunV = new THREE.Vector3(.62, .5, .6).normalize();
const U = {
  map: {value: null}, ready: {value: 0}, texel: {value: new THREE.Vector2(1 / 2688, 1 / 1344)},
  sun: {value: sunV}, hiDir: {value: new THREE.Vector3(...dirOf(THARSIS.u, THARSIS.v))},
  hi: {value: 0}, hiR: {value: .62}
};
const mat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `
    varying vec2 vUv; varying vec3 vObj; varying vec3 vN;
    void main(){ vUv = uv; vObj = normalize(position); vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D map; uniform vec2 texel; uniform vec3 sun, hiDir; uniform float hi, hiR, ready;
    varying vec2 vUv; varying vec3 vObj; varying vec3 vN;
    float luma(vec2 u){ return dot(texture2D(map, u).rgb, vec3(.3,.6,.1)); }
    void main(){
      vec3 col = texture2D(map, vUv).rgb; col = pow(col, vec3(2.6)) * vec3(1.18,.74,.56);
      // relief from the map's own brightness
      vec3 n = normalize(vN);
      vec3 t = normalize(cross(vec3(0.,1.,0.), n)), b = cross(n, t);
      float dx = luma(vUv + vec2(texel.x*2.,0.)) - luma(vUv - vec2(texel.x*2.,0.));
      float dy = luma(vUv + vec2(0.,texel.y*2.)) - luma(vUv - vec2(0.,texel.y*2.));
      n = normalize(n - (t*dx + b*dy) * 1.9);
      float diff = max(dot(n, sun), 0.);
      vec3 lit = col * (vec3(1.5,1.32,1.18) * pow(diff, .85) + vec3(.2,.09,.06));
      // highlighted region with a rough edge, like a territory on a map
      float d = acos(clamp(dot(normalize(vObj), hiDir), -1., 1.)) + (luma(vUv) - .45) * .22;
      float m = smoothstep(hiR, hiR - .03, d), edge = smoothstep(.03, .0, abs(d - hiR + .01));
      lit = mix(lit, mix(lit, vec3(.62,.012,.07) * (.25 + diff * 1.05) * (.5 + luma(vUv) * 1.1), .9), m * hi) + vec3(1.,.42,.4) * edge * hi * .22;
      float fres = pow(1. - max(vN.z, 0.), 3.2);
      lit += vec3(1.,.5,.26) * fres * (.05 + diff * .5);
      lit = lit / (lit * .3 + 1.) * 1.3;
      gl_FragColor = vec4(pow(lit, vec3(1./2.2)), 1.) * ready;
    }`
});
spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat));

const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 48), new THREE.ShaderMaterial({
  uniforms: {sun: {value: sunV}, ready: U.ready},
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform vec3 sun; uniform float ready; varying vec3 vN;
    void main(){ float z = clamp(-vN.z, 0., 1.), a = smoothstep(.0, .55, z);
      float s = .55 + .6 * max(dot(-vN * vec3(1.,1.,0.), normalize(sun * vec3(1.,1.,0.))), 0.);
      a = pow(a, 2.6) * s * .7; gl_FragColor = vec4(vec3(1.,.64,.36), a * ready); }`
}));
planet.add(atmo);

/* ---------- map texture (fix seam + poles) ---------- */
let loadedAt = -1;
function buildTexture(src) {
  const W = 2688, H = 1344;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0, W, H);
  const fw = Math.round(W * .07);
  const t = document.createElement('canvas'); t.width = fw; t.height = H;
  const tg = t.getContext('2d');
  tg.drawImage(c, 0, 0, fw, H, 0, 0, fw, H);
  tg.globalCompositeOperation = 'destination-in';
  const gr = tg.createLinearGradient(0, 0, fw, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  tg.fillStyle = gr; tg.fillRect(0, 0, fw, H);
  g.drawImage(t, W - fw, 0);
  const ph = H * .035;
  let v = g.createLinearGradient(0, 0, 0, ph);
  v.addColorStop(0, '#e9dfd2'); v.addColorStop(1, 'rgba(233,223,210,0)');
  g.fillStyle = v; g.fillRect(0, 0, W, ph);
  v = g.createLinearGradient(0, H, 0, H - ph);
  v.addColorStop(0, '#e9dfd2'); v.addColorStop(1, 'rgba(233,223,210,0)');
  g.fillStyle = v; g.fillRect(0, H - ph, W, ph);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  U.map.value = tex; U.ready.value = 1; loadedAt = performance.now();
}
// запасная карта, если картинка не загрузилась (чтобы планета всё равно появилась)
function proceduralMap() {
  const c = document.createElement('canvas'); c.width = 1344; c.height = 672;
  const g = c.getContext('2d');
  g.fillStyle = '#d6b08a'; g.fillRect(0, 0, c.width, c.height);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 420; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, r = 10 + rnd() * rnd() * 150;
    const dark = rnd() < .55;
    for (const ox of [-c.width, 0, c.width]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, dark ? 'rgba(96,62,40,.38)' : 'rgba(250,226,196,.3)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  return c;
}
const img = new Image();
img.crossOrigin = 'anonymous';
img.onload = () => buildTexture(img);
img.onerror = () => buildTexture(proceduralMap());
img.src = A.MAP;

/* ---------- layout ---------- */
let W = 0, H = 0, portrait = false, R0 = 0, wordW = 0, wordH = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2;
  camera.updateProjectionMatrix();
  portrait = H > W * 1.05;
  R0 = portrait ? W * .36 : Math.min(H * .3, W * .19);
  wordW = word0.offsetWidth; wordH = word0.offsetHeight;
  const dpr = Math.min(devicePixelRatio, 1.5);
  dust.width = W * dpr; dust.height = H * dpr;
  placeCard(); fitDest();
}
addEventListener('resize', resize);
resize();
if (document.fonts) document.fonts.ready.then(resize);

/* ---------- state ---------- */
let st = 0, from = 0, to = 0, t0 = 0, dur = 1, nowMs = 0, lockUntil = 0;
function span(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return Math.max(0, Math.min(hi, 1) - Math.max(lo, 0)) * 1300 + Math.max(0, Math.min(hi, 2) - Math.max(lo, 1)) * 2500;
}
function go(n) {
  if (n === to) return;
  from = st; to = n; t0 = nowMs || performance.now();
  dur = reduced ? 1 : Math.max(1, span(from, to));
}

/* ---------- decks: A — о городе, B — районы и итоги ---------- */
let deckOpen = null, deckSettled = false, settleT = 0, lastDeckWheel = 0;
function openDeck(k, atEnd) {
  if (deckOpen && deckOpen !== k) decks[deckOpen].classList.remove('open');
  deckOpen = k; deckSettled = false;
  const d = decks[k]; d.classList.add('open');
  d.scrollTop = atEnd ? d.scrollHeight : 0;
  lockUntil = performance.now() + 1400; lastDeckWheel = performance.now();
  clearTimeout(settleT); settleT = setTimeout(() => { deckSettled = true; }, 1050);
}
function closeDeck() {
  if (!deckOpen) return;
  decks[deckOpen].classList.remove('open');
  deckOpen = null; deckSettled = false; clearTimeout(settleT);
  lockUntil = performance.now() + 1400;
}
// порядок экранов: обложка → районы → посадка → слайды
function deckPrev() { closeDeck(); go(2); }
function deckNext() {}
function heroNext() { if (to < 2) go(to + 1); else openDeck('A'); }
function heroPrev() { if (to > 0) go(to - 1); }
function navTo(i) {
  if (i === 3) return openDeck('A');
  closeDeck(); go(i);
}
$('next').addEventListener('click', () => openDeck('A'));
$('home').addEventListener('click', e => { e.preventDefault(); navTo(0); });

// появление блоков при прокрутке
for (const k in decks) {
  const d = decks[k], rv = [...d.querySelectorAll('.rv')];
  if ('IntersectionObserver' in window) {
    const ob = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ob.unobserve(e.target); } }),
      {root: d, threshold: .12});
    rv.forEach(el => ob.observe(el));
  } else rv.forEach(el => el.classList.add('in'));
  // свайп на телефоне: у края слайдов — к предыдущему/следующему экрану
  let y0 = 0, top0 = false, end0 = false;
  const edges = () => [d.scrollTop <= 0, d.scrollTop + d.clientHeight >= d.scrollHeight - 3];
  d.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; [top0, end0] = edges(); }, {passive: true});
  d.addEventListener('touchend', e => {
    if (performance.now() < lockUntil) return;
    const dy = e.changedTouches[0].clientY - y0, [t1, e1] = edges();
    if (dy > 90 && top0 && t1) deckPrev(); else if (dy < -90 && end0 && e1) deckNext();
  }, {passive: true});
}

/* ---------- input ---------- */
let mouseX = 0, mouseY = 0, tmx = 0, tmy = 0;
addEventListener('pointermove', e => { tmx = e.clientX / W - .5; tmy = e.clientY / H - .5; });

addEventListener('wheel', e => {
  const n = performance.now();
  if (deckOpen) {
    const d = decks[deckOpen];
    const atTop = d.scrollTop <= 0, atEnd = d.scrollTop + d.clientHeight >= d.scrollHeight - 2;
    if (((e.deltaY < -8 && atTop) || (e.deltaY > 8 && atEnd)) && n - lastDeckWheel > 450 && n > lockUntil)
      e.deltaY < 0 ? deckPrev() : deckNext();
    lastDeckWheel = n; return;
  }
  if (n < lockUntil || Math.abs(e.deltaY) <= 8) return;
  lockUntil = n + 1400;
  e.deltaY > 0 ? heroNext() : heroPrev();
}, {passive: true});
addEventListener('keydown', e => {
  if (e.key === 'Escape') { deckOpen ? deckPrev() : heroPrev(); return; }
  if (deckOpen) return;
  if (['ArrowDown', 'PageDown'].includes(e.key)) heroNext();
  if (['ArrowUp', 'PageUp'].includes(e.key)) heroPrev();
});

/* ---------- rotation / drag ---------- */
let yaw = faceYaw(dirOf(.4, .5)), pitch = .16, vy = 0, lastDrag = -1e9, drag = null;
gl.addEventListener('pointerdown', e => {
  drag = {x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now()};
  gl.setPointerCapture(e.pointerId); gl.classList.add('drag');
});
gl.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 1.1 / R0;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  yaw += dx * k; pitch = clamp(pitch + dy * k, -1, 1); vy = dx * k; lastDrag = performance.now();
});
const endDrag = e => {
  if (!drag) return;
  const d = drag; drag = null; gl.classList.remove('drag');
  const tot = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
  if (e.pointerType === 'touch' && performance.now() - d.t < 600 && Math.abs(e.clientY - d.sy) > 80 && Math.abs(e.clientX - d.sx) < 50) {
    vy = 0; // вертикальный свайп = шаг вперёд/назад
    if (e.clientY < d.sy) heroNext(); else heroPrev();
    return;
  }
  if (tot < 6 && to < 2 && Math.hypot(e.clientX - cxNow, e.clientY - cyNow) < Rnow) heroNext();
};
gl.addEventListener('pointerup', endDrag);
gl.addEventListener('pointercancel', () => { drag = null; gl.classList.remove('drag'); });

/* ---------- dust ---------- */
const dctx = dust.getContext('2d');
const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
{
  const g = sprite.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,214,170,.95)'); gr.addColorStop(.4, 'rgba(255,180,120,.42)'); gr.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const motes = Array.from({length: 34}, () => { const x = rnd(), y = rnd(), q = rnd(); return {x, y, r: 3 + q * q * 34, s: .004 + rnd() * .012, p: rnd() * 6.28}; });
function drawDust(t, landing) {
  const dpr = Math.min(devicePixelRatio, 1.5);
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dctx.clearRect(0, 0, W, H);
  for (const m of motes) {
    const x = ((m.x + t * m.s + 2) % 1.1 - .05) * W, y = (m.y + Math.sin(t * .3 + m.p) * .02) * H;
    const al = (.3 + .35 * Math.pow(Math.sin(t * .7 + m.p), 2)) * (landing ? .7 : 1);
    dctx.globalAlpha = al; dctx.drawImage(sprite, x - m.r, y - m.r, m.r * 2, m.r * 2);
  }
  dctx.globalAlpha = 1;
}

/* ---------- render ---------- */
let last = performance.now(), cxNow = 0, cyNow = 0, Rnow = 1;
const shortest = d => Math.atan2(Math.sin(d), Math.cos(d));
const set = (el, o, vis = true) => { el.style.opacity = o; if (vis) el.style.visibility = o < .01 ? 'hidden' : 'visible'; };

function render(now) {
  requestAnimationFrame(render);
  nowMs = now;
  if (deckOpen && deckSettled) { last = now; return; } // слайды закрыли сцену — не тратим GPU
  const dt = Math.min((now - last) / 1000, .05); last = now;
  const t = now / 1000, f = r => 1 - Math.exp(-dt * r);

  st = mix(from, to, io(seg(now, t0, t0 + dur)));
  const a = clamp(st), b = clamp(st - 1);
  mouseX += (tmx - mouseX) * f(6); mouseY += (tmy - mouseY) * f(6);

  // intro
  const age = loadedAt < 0 ? 0 : (performance.now() - loadedAt) / 1000;
  const grow = out(seg(age, 0, 1.5)), iw = out(seg(age, .75, 1.7));

  // planet
  const bz = io(seg(b, 0, .62));
  const px = portrait ? .5 * W : mix(.5 * W, .36 * W, a);
  const py = portrait ? mix(.4 * H, .33 * H, a) : .5 * H;
  const R = R0 * mix(.03, 1, grow) * (1 + a * .04) * Math.exp(bz * 2.5);
  const cx = mix(px, .5 * W, bz), cy = mix(py, .5 * H, bz);
  cxNow = cx; cyNow = cy; Rnow = R;

  // rotation
  if (st < .02 && !drag && now - lastDrag > 1500) yaw += dt * (.08 + (1 - grow) * 2.4);
  if (!drag) { yaw += vy; vy *= Math.exp(-dt * 4); }
  if (st > .02) {
    if (!drag) {
      const tgt = b > 0 ? dirOf(SITES[cur].u, SITES[cur].v) : dirOf(THARSIS.u, THARSIS.v);
      yaw += shortest(faceYaw(tgt) - yaw) * f(3.6);
      pitch += (faceLat(tgt) - pitch) * f(3.6);
    }
  } else if (!drag) pitch += (.16 - pitch) * f(1.2);

  planet.position.set(cx - W / 2, H / 2 - cy, 0);
  planet.scale.setScalar(R);
  tilt.rotation.x = pitch; spin.rotation.y = yaw;

  // highlight
  const hd = b > .02 ? dirOf(SITES[cur].u, SITES[cur].v) : dirOf(THARSIS.u, THARSIS.v);
  U.hiDir.value.set(hd[0], hd[1], hd[2]);
  U.hiR.value = b > .02 ? mix(.62, .3, seg(b, 0, .1)) : .62;
  U.hi.value = clamp(seg(a, .15, .6) + (b > 0 ? 1 : 0));
  renderer.render(scene, camera);

  // word0
  const wx = portrait ? 0 : -a * .08 * W;
  const wy = portrait ? H * -.1 + R * 1.08 + wordH * .5 : mouseY * -6;
  word0.style.transform = `translate(-50%,-50%) translate(${wx}px,${wy}px)`;
  const I = (1 - iw) * 50;
  word0.style.clipPath = `inset(-10% ${I}% -10% ${I}%)`;
  word0.style.opacity = 1 - seg(a, .1, .5);

  // девиз: всегда ниже планеты (или под словом на узком экране), никогда не заходит за неё
  const ey = portrait ? H / 2 + wy + wordH / 2 + 18 : cy + R * 1.14 + 16;
  eyebrow.style.transform = `translate(-50%,${ey}px)`;
  eyebrow.style.opacity = iw * (1 - seg(a, .05, .35));

  // flare
  flare.style.transform = `translate(${cx + R * .74}px,${cy - R * .62}px)`;
  flare.style.left = '0'; flare.style.top = '0';
  flare.style.opacity = grow * (.88 + .12 * Math.sin(t * 1.3)) * (1 - seg(bz, 0, .35));

  // pin
  {
    const d = dirOf(THARSIS.u, THARSIS.v), cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = d[0] * cy_ + d[2] * sy_, z1 = -d[0] * sy_ + d[2] * cy_;
    const y2 = d[1] * cp - z1 * sp, z2 = d[1] * sp + z1 * cp;
    pin.style.transform = `translate(${cx + x1 * R - 6}px,${cy - y2 * R - 8}px)`;
    pin.style.opacity = seg(z2, .22, .42) * seg(age, 1.6, 2.1) * (1 - seg(a, 0, .3));
  }

  // word1
  const ka = seg(a, .45, 1);
  word1.style.opacity = ka * (1 - seg(b, .02, .16));
  word1.style.transform = `translate(-50%,0) translate(${portrait ? 0 : .02 * W + (1 - out(ka)) * 40}px,${(portrait ? .46 : .56) * H}px)`;

  // sites + card
  const so = seg(a, .55, 1) * (1 - seg(b, 0, .14));
  for (const el of [sitesEl, card]) {
    el.style.opacity = so; el.style.visibility = so < .01 ? 'hidden' : 'visible';
    el.style.pointerEvents = so < .6 ? 'none' : 'auto';
  }
  card.style.transform = `translateX(${(1 - out(seg(a, .6, 1))) * 26}px)`;

  gl.style.pointerEvents = st < 1.02 ? 'auto' : 'none';

  // region
  region.style.opacity = seg(b, .14, .26) * (1 - seg(b, .42, .52));

  // fog
  const fi = seg(b, .36, .54), fo = seg(b, .62, .96);
  fog.style.opacity = fi * (1 - fo);

  // landing layers
  const on = b > .5, disp = on ? 'block' : 'none';
  land.style.display = fore.style.display = dest.style.display = disp;
  if (on) {
    const lk = out(seg(b, .5, 1)), fk = out(seg(b, .58, 1)), dk = out(seg(b, .66, .98));
    const drift = 1 + .02 * Math.sin(t * .18);
    land.style.transform = `translate(${mouseX * -14}px,${mix(.2 * H, mouseY * -8, lk)}px) scale(${mix(1.3, 1.05, lk) * drift})`;
    fore.style.transform = `translate(${mouseX * -46}px,${mix(.42 * H, 0, fk)}px) scale(1.06)`;
    dest.style.transform = `translate(${mouseX * -26}px,${mix(.62 * H, portrait ? .3 * H : .27 * H, dk)}px)`;
    dest.firstElementChild.style.opacity = seg(b, .8, 1) * .92;
  }

  // bar, scrim, more
  const bk = seg(b, .86, 1);
  bar.style.opacity = bk; bar.style.visibility = bk < .01 ? 'hidden' : 'visible';
  bar.style.pointerEvents = bk < .6 ? 'none' : 'auto';
  bar.style.transform = `translate(-50%,${(1 - out(bk)) * 34}px)`;
  more.style.opacity = bk * .8;
  scrim.style.opacity = seg(b, .6, .9);

  // rail
  const ri = deckOpen ? 3 : Math.round(st);
  railBtns.forEach((d, i) => d.classList.toggle('on', i === ri));

  drawDust(t, b > .5);
}

pick(0);
requestAnimationFrame(render);
