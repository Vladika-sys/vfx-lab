import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createImageTracker } from './image-tracking.js';
import { createCoffeeEffect } from './coffee-effect.js';
import { createTargetSound } from './target-sound.js';
import { fitCameraCover } from './camera-cover.js';
import './style.css';

const viewport = document.querySelector('#target-viewport');
const video = document.querySelector('#target-video');
const canvas = document.querySelector('#target-stage');
const panel = document.querySelector('#target-start');
const toolbar = document.querySelector('#target-controls');
const status = document.querySelector('#target-status');
const error = document.querySelector('#target-error');
const startButton = document.querySelector('#start-target');
const soundButton = document.querySelector('#target-sound');
const pauseButton = document.querySelector('#target-pause');
const scale = document.querySelector('#target-scale');
let generation = 0, session = null, pending = null, paused = false, muted = false;

function fit() {
  if (!session || !video.videoWidth) return;
  const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
  const fitted = fitCameraCover({ videoWidth: video.videoWidth, videoHeight: video.videoHeight,
    width, height, projectionMatrix: session.tracker.projectionMatrix });
  video.style.width = `${fitted.coverWidth}px`; video.style.height = `${fitted.coverHeight}px`;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  session.camera.projectionMatrix.copy(fitted.projectionMatrix);
  session.camera.projectionMatrixInverse.copy(fitted.projectionMatrix).invert();
  session.renderer.setSize(width, height, false);
}

function stop() {
  generation++;
  pending?.abort(); pending = null;
  const previous = session; session = null;
  if (previous) {
    cancelAnimationFrame(previous.frame);
    previous.sound?.close(); previous.tracker.dispose(); previous.effect.dispose();
    previous.environment.dispose(); previous.renderer.dispose();
  }
  video.srcObject?.getTracks().forEach(track => track.stop());
  video.srcObject = null; video.hidden = canvas.hidden = toolbar.hidden = status.hidden = true;
  panel.hidden = false; startButton.disabled = false; startButton.textContent = 'Pornește camera';
}

async function start() {
  if (startButton.disabled || session) return;
  const attempt = ++generation, abort = new AbortController();
  pending = abort;
  startButton.disabled = true; startButton.textContent = 'Pregătire…'; error.hidden = true;
  let stream, tracker, renderer, effect, environment, sound, owned = false;
  const current = () => attempt === generation && !abort.signal.aborted;
  const cleanup = () => {
    sound?.close(); tracker?.dispose(); effect?.dispose(); environment?.dispose(); renderer?.dispose();
    stream?.getTracks().forEach(track => track.stop());
  };
  abort.signal.addEventListener('abort', () => { if (!owned) cleanup(); }, { once: true });
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Deschide pagina prin HTTPS în Safari sau Chrome.');
    try { sound = createTargetSound(); await sound.unlock(); }
    catch { sound?.close(); sound = null; }
    if (!current()) { cleanup(); return; }
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
    if (!current()) { cleanup(); return; }
    video.srcObject = stream; video.hidden = false;
    await video.play();
    if (!current()) { cleanup(); return; }
    if (!video.videoWidth) throw new Error('Camera nu furnizează imagini. Reîncearcă.');
    const factor = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    video.width = Math.round(video.videoWidth * factor); video.height = Math.round(video.videoHeight * factor);
    const timeout = setTimeout(() => abort.abort(), 45000);
    try {
      tracker = await createImageTracker({ width: video.width, height: video.height, source: video,
        signal: abort.signal, targetUrl: `${import.meta.env.BASE_URL}assets/target/cafea.mind` });
    } finally { clearTimeout(timeout); }
    if (!current()) { cleanup(); return; }
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    camera.projectionMatrix.copy(tracker.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    environment = generator.fromScene(room, .04); room.dispose(); generator.dispose();
    scene.environment = environment.texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x615b47, 2));
    const light = new THREE.DirectionalLight(0xfff4db, 2.6); light.position.set(1, 3, 4); scene.add(light);
    effect = createCoffeeEffect({ pixelRatio: renderer.getPixelRatio() }); tracker.anchor.add(effect.group); scene.add(tracker.anchor);
    session = { tracker, renderer, effect, environment, sound, camera, frame: 0, aspect: video.videoWidth / video.videoHeight };
    owned = true; pending = null;
    paused = false;
    pauseButton.setAttribute('aria-pressed', 'false');
    pauseButton.setAttribute('aria-label', 'Pauză efect'); pauseButton.title = 'Pauză efect';
    soundButton.disabled = !sound; soundButton.setAttribute('aria-pressed', String(!muted));
    panel.hidden = true; canvas.hidden = toolbar.hidden = status.hidden = false;
    status.textContent = 'Încadrează fotografia cu ceașca de cafea.';
    fit();
    let previous = performance.now(), wasTracked = false;
    const frame = now => {
      if (!session || !current()) return;
      session.frame = requestAnimationFrame(frame);
      const delta = Math.min(.1, (now - previous) / 1000); previous = now;
      let tracked;
      try { tracked = tracker.update(); }
      catch (failure) { stop(); error.textContent = failure.message; error.hidden = false; return; }
      if (tracked && !wasTracked) effect.found();
      wasTracked = tracked;
      status.hidden = tracked;
      if (!tracked) status.textContent = tracker.processedFrames === 0
        ? 'Se pornește recunoașterea imaginii…'
        : 'Încadrează fotografia întreagă, bine luminată.';
      effect.group.scale.setScalar(Math.min(1, 1 / tracker.targetAspect) * Number(scale.value) / 100);
      if (tracked && !paused) effect.update(delta);
      sound?.setActive(tracked && !paused && !muted);
      sound?.update();
      renderer.render(scene, camera);
    };
    session.frame = requestAnimationFrame(frame);
  } catch (failure) {
    if (!owned) cleanup();
    if (attempt !== generation) return;
    stop();
    const messages = {
      NotAllowedError: 'Permite accesul la cameră și reîncearcă.',
      NotFoundError: 'Nu a fost găsită o cameră.',
      NotReadableError: 'Camera este ocupată de altă aplicație.',
      AbortError: 'Pregătirea a durat prea mult. Verifică legătura și reîncearcă.',
    };
    error.textContent = messages[failure.name] || failure.message || 'Efectul nu a putut porni.'; error.hidden = false;
  }
}

startButton.addEventListener('click', start);
document.querySelector('#stop-target').addEventListener('click', stop);
soundButton.addEventListener('click', async () => {
  muted = !muted;
  if (!muted) { try { await session?.sound?.unlock(); } catch { muted = true; } }
  const label = muted ? 'Pornește sunetul' : 'Oprește sunetul';
  soundButton.setAttribute('aria-pressed', String(!muted)); soundButton.setAttribute('aria-label', label); soundButton.title = label;
});
pauseButton.addEventListener('click', () => {
  paused = !paused; pauseButton.setAttribute('aria-pressed', String(paused));
  const label = paused ? 'Continuă efectul' : 'Pauză efect'; pauseButton.setAttribute('aria-label', label); pauseButton.title = label;
});
canvas.addEventListener('pointerdown', event => {
  if (!session?.tracker.anchor.visible || paused) return;
  const rect = canvas.getBoundingClientRect();
  const point = new THREE.Vector3((event.clientX - rect.left) / rect.width * 2 - 1,
    1 - (event.clientY - rect.top) / rect.height * 2, .5).unproject(session.camera);
  const origin = new THREE.Vector3().setFromMatrixPosition(session.camera.matrixWorld);
  session.tracker.anchor.updateWorldMatrix(true, true);
  if (new THREE.Raycaster(origin, point.sub(origin).normalize()).intersectObject(session.effect.group, true).length) session.effect.react();
});
window.addEventListener('resize', fit);
video.addEventListener('resize', () => {
  if (session && video.videoHeight && Math.abs(video.videoWidth / video.videoHeight - session.aspect) > .03) { stop(); start(); }
  else fit();
});
window.addEventListener('pagehide', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
