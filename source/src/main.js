import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCinematicEffects } from './cinematic-effects.js';
import { buildWeatherScenes } from './weather-scenes.js';
import './style.css';

const canvas = document.querySelector('#stage');
const viewport = document.querySelector('#viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111d2b);
scene.fog = new THREE.FogExp2(0x111d2b, 0.025);

const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 130);
camera.position.set(0, 1.2, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 22;
controls.target.set(0, 0.3, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.52, 0.48, 0.58);
composer.addPass(bloomPass);
const filmPass = new FilmPass(0.055, false);
composer.addPass(filmPass);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
let paused = false;
let elapsed = 0;
let activeEffect = 'fire';
let effectEnabled = true;
let primary = 0.54;
let intensity = 0.72;

const hemisphere = new THREE.HemisphereLight(0xbfd3ff, 0x170d25, 1.8);
scene.add(hemisphere);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(5, 8, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1536, 1536);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 32;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.bias = -0.0008;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x7d8cff, 0.72);
fillLight.position.set(-6, 2, 5);
scene.add(fillLight);
const groups = {};
const animators = {};

const weather = await buildWeatherScenes({ groups, animators, camera, renderer, getState: () => ({ primary, intensity }) });
const effects = buildCinematicEffects({ groups, animators, camera, renderer, weather, getState: () => ({ primary, intensity }) });

Object.values(groups).forEach((group) => {
  group.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    if (object.material.isMeshStandardMaterial || object.material.isMeshPhysicalMaterial) {
      object.castShadow = object.userData.castShadow ?? true;
      object.receiveShadow = object.userData.receiveShadow ?? true;
    }
  });
  scene.add(group);
});

const EFFECTS = {
  fire: ['Foc', 'Turbulența flăcării', 55],
  smoke: ['Fum', 'Vânt', 48],
  rain: ['Ploaie', 'Vânt', 58],
  snow: ['Zăpadă', 'Vânt', 53],
  water: ['Apă', 'Frecvența undelor', 42],
  lightning: ['Fulgere', 'Instabilitatea descărcării', 50],
  portal: ['Portal', 'Viteză de rotație', 48],
  particles: ['Explozie', 'Faza exploziei', 0],
  tornado: ['Tornadă', 'Viteza vortexului', 45],
  dust: ['Praf', 'Derivă în aer', 42],
  dew: ['Rouă', 'Condens', 64],
  hologram: ['Hologramă', 'Interferențe', 38],
  distortion: ['Distorsiune', 'Turbulență', 46],
  compositing: ['Fundal verde', 'Separator înainte / după', 54],
};

const effectSelect = document.querySelector('#effect-select');
const primaryControl = document.querySelector('#primary-control');
const intensityControl = document.querySelector('#intensity-control');
const effectButton = document.querySelector('#toggle-effect');
effectSelect.innerHTML = Object.entries(EFFECTS).map(([id, [name]]) => `<option value="${id}">${name}</option>`).join('');

const RENDER_PROFILES = {
  fire: { bloom: .075, exposure: .95, fog: .012, grain: .008 },
  portal: { bloom: .015, exposure: .95, fog: .012, grain: .008 },
  lightning: { bloom: .12, exposure: .9, fog: .023, grain: .008 },
  snow: { bloom: 0, exposure: .98, fog: .02, grain: .008 },
  water: { bloom: .008, exposure: .95, fog: .012, grain: .008 },
  tornado: { bloom: 0, exposure: .95, fog: .016, grain: .008 },
  compositing: { bloom: 0, exposure: .95, fog: .012, grain: .008 },
  particles: { bloom: .06, exposure: .95, fog: .012, grain: .008 },
  distortion: { bloom: 0, exposure: .95, fog: .012, grain: .008 },
  hologram: { bloom: .025, exposure: .95, fog: .012, grain: .008 },
  smoke: { bloom: 0, exposure: .95, fog: .012, grain: .008 },
  rain: { bloom: .012, exposure: .9, fog: .018, grain: .008 },
  dust: { bloom: .008, exposure: .9, fog: .014, grain: .008 },
  dew: { bloom: 0, exposure: .95, fog: .012, grain: .008 },
};

function frameEffect() {
  if (activeEffect === 'rain' || activeEffect === 'smoke') {
    camera.fov = camera.aspect < .8 ? 65 : 50;
    controls.target.set(activeEffect === 'smoke' ? -1.1 : -.6, activeEffect === 'smoke' ? 4.5 : 2.05, -5.5);
    camera.position.set(activeEffect === 'smoke' ? 3.3 : 5.2, activeEffect === 'smoke' ? 3.2 : 2.25, activeEffect === 'smoke' ? 6.2 : 8.8);
    controls.minDistance = 3;
    controls.maxDistance = 21;
    controls.maxPolarAngle = Math.PI * .49;
  } else {
    const view = groups[activeEffect].userData.view;
    camera.fov = camera.aspect < .8 ? Math.max(view.fov, 60) : view.fov;
    camera.position.fromArray(view.position);
    controls.target.fromArray(view.target);
    controls.minDistance = activeEffect === 'dew' ? 1.3 : 2.5;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * .49;
  }
  camera.updateProjectionMatrix();
  controls.update();
}

function setEffectVisibility() {
  const group = groups[activeEffect];
  if (group.userData.effectLayer) group.userData.effectLayer.visible = effectEnabled;
  else group.visible = effectEnabled;
  group.userData.onToggle?.(effectEnabled);
  effectButton.setAttribute('aria-pressed', String(effectEnabled));
  const label = effectEnabled ? 'Ascunde efectul' : 'Arată efectul';
  effectButton.setAttribute('aria-label', label);
  effectButton.title = label;
}

function selectEffect(id) {
  if (!EFFECTS[id]) return;
  activeEffect = id;
  effectSelect.value = id;
  Object.entries(groups).forEach(([key, group]) => { group.visible = key === id; });
  const [, label, initialValue] = EFFECTS[id];
  primaryControl.setAttribute('aria-label', label);
  primaryControl.closest('label').title = label;
  primaryControl.value = String(initialValue);
  primary = initialValue / 100;
  effectEnabled = true;
  elapsed = 0;
  setEffectVisibility();
  const profile = RENDER_PROFILES[id];
  bloomPass.strength = profile.bloom * (.72 + intensity * .38);
  bloomPass.enabled = profile.bloom > 0;
  renderer.toneMappingExposure = profile.exposure;
  scene.fog.density = profile.fog;
  filmPass.uniforms.intensity.value = profile.grain;
  const lighting = groups[id].userData.lighting || {};
  scene.environment = weather.environment;
  scene.environmentIntensity = lighting.environment ?? .65;
  scene.background = weather.sky;
  scene.backgroundIntensity = lighting.sky ?? .8;
  scene.backgroundBlurriness = .3;
  scene.fog.color.setHex(id === 'snow' ? 0xb7c1c1 : 0x8b9698);
  hemisphere.color.setHex(0xe3e6e5);
  hemisphere.groundColor.setHex(0x444840);
  hemisphere.intensity = lighting.ambient ?? .6;
  keyLight.intensity = lighting.key ?? .85;
  keyLight.position.set(-6, 14, 3);
  keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -18;
  keyLight.shadow.camera.right = keyLight.shadow.camera.top = 18;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.shadow.normalBias = .03;
  fillLight.intensity = .12;
  fillLight.color.setHex(0xdae0df);
  frameEffect();
}

effectSelect.addEventListener('change', () => selectEffect(effectSelect.value));
primaryControl.addEventListener('input', () => { primary = Number(primaryControl.value) / 100; });
intensityControl.addEventListener('input', () => {
  intensity = Number(intensityControl.value) / 100;
  const profile = RENDER_PROFILES[activeEffect];
  bloomPass.strength = profile.bloom * (.72 + intensity * .38);
});

document.querySelector('#toggle-animation').addEventListener('click', event => {
  if (activeEffect === 'particles') {
    primary = ((elapsed + primary * 5.9) % 5.9) / 5.9;
    primaryControl.value = String(Math.round(primary * 100));
    elapsed = 0;
  }
  paused = !paused;
  const label = paused ? 'Continuă' : 'Pauză';
  event.currentTarget.setAttribute('aria-pressed', String(paused));
  event.currentTarget.setAttribute('aria-label', label);
  event.currentTarget.title = label;
  event.currentTarget.querySelector('path').setAttribute('d', paused ? 'M8 4l12 8-12 8Z' : 'M8 5v14M16 5v14');
});
document.querySelector('#reset-view').addEventListener('click', frameEffect);
effectButton.addEventListener('click', () => { effectEnabled = !effectEnabled; setEffectVisibility(); });
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { document.querySelector('#fullscreen').setAttribute('aria-pressed', 'false'); }
});
document.addEventListener('fullscreenchange', () => {
  document.querySelector('#fullscreen').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  if (!paused) elapsed += delta;
  controls.update();
  if ((effectEnabled || groups[activeEffect].userData.effectLayer) && animators[activeEffect]) animators[activeEffect](elapsed, paused || !effectEnabled ? 0 : delta);
  weather.prepareFrame(scene, activeEffect);
  effects.prepareFrame(scene, activeEffect);
  composer.render(paused ? 0 : delta);
}

function onResize() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  camera.aspect = width / height;
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  frameEffect();
}

window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(viewport);
selectEffect('rain');
animate();
