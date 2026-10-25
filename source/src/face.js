import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createFaceTracker } from './face-tracking.js';
import { fitFacePose } from './face-pose.js';
import { createMaskRig, solveJawFit } from './face-fit.js';
import { createFaceGlow } from './face-glow.js';
import { createMouthFire } from './face-fire.js';
import { createFaceAudio } from './face-audio.js';
import { createTrackedPose } from './image-pose.js';
import { fitCameraCover } from './camera-cover.js';
import './style.css';

const $ = selector => document.querySelector(selector);
const viewport = $('#face-viewport'), video = $('#face-video'), canvas = $('#face-stage');
const panel = $('#face-start'), toolbar = $('#face-controls'), status = $('#face-status');
const error = $('#face-error'), startButton = $('#start-face'), toggle = $('#face-toggle'), widthControl = $('#face-width');
const atmosphere = $('#face-atmosphere'), micButton = $('#face-mic'), fireButton = $('#face-fire'), soundButton = $('#face-sound');
let generation = 0, pending = null, session = null, showMask = true, manualFire = false, burstUntil = 0;
let notice = '', noticeUntil = 0;
const asset = name => `${import.meta.env.BASE_URL}assets/face/${name}`;

function disposeScene(scene) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  scene?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of object.material ? [object.material].flat() : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
  materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
}
function fit() {
  const s = session;
  if (!s || !video.videoWidth) return;
  s.fitCamera.aspect = video.videoWidth / video.videoHeight; s.fitCamera.updateProjectionMatrix();
  const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
  const cover = fitCameraCover({ videoWidth: video.videoWidth, videoHeight: video.videoHeight,
    width, height, projectionMatrix: s.fitCamera.projectionMatrix });
  video.style.width = `${cover.coverWidth}px`; video.style.height = `${cover.coverHeight}px`;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  s.camera.projectionMatrix.copy(cover.projectionMatrix);
  s.camera.projectionMatrixInverse.copy(cover.projectionMatrix).invert();
  s.renderer.setSize(width, height, false);
  s.glow.resize();
}
function stop() {
  generation++; pending?.abort(); pending = null;
  const s = session; session = null;
  if (s) {
    cancelAnimationFrame(s.frame); s.tracker.close(); s.pose.reset(); s.rig.reset(); s.glow.dispose();
    s.audio?.close(); s.fire.reset();
    disposeScene(s.scene); s.environment.dispose(); s.renderer.dispose();
  }
  video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null;
  manualFire = false; burstUntil = 0; atmosphere.hidden = true; video.classList.remove('horror-active');
  fireButton.setAttribute('aria-pressed', 'false'); micButton.disabled = false;
  video.hidden = canvas.hidden = toolbar.hidden = status.hidden = true;
  panel.hidden = false; startButton.disabled = false; startButton.textContent = 'Pornește camera';
}
function fail(failure) {
  stop();
  const messages = { NotAllowedError: 'Permite accesul la cameră și reîncearcă.',
    NotFoundError: 'Nu a fost găsită o cameră.', NotReadableError: 'Camera este ocupată de altă aplicație.' };
  error.textContent = messages[failure.name] || failure.message || 'Masca nu a putut porni.'; error.hidden = false;
}
async function start() {
  if (startButton.disabled || session) return;
  const attempt = ++generation, abort = new AbortController(); pending = abort;
  const current = () => attempt === generation && !abort.signal.aborted;
  startButton.disabled = true; startButton.textContent = 'Pregătire…'; error.hidden = true;
  let stream, tracker, renderer, scene, environment, glow, audio, owned = false;
  const cleanup = () => {
    tracker?.close(); audio?.close(); glow?.dispose(); disposeScene(scene); environment?.dispose(); renderer?.dispose();
    stream?.getTracks().forEach(track => track.stop());
  };
  abort.signal.addEventListener('abort', () => { if (!owned) cleanup(); }, { once: true });
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.Worker || !window.createImageBitmap)
      throw new Error('Deschide pagina prin HTTPS într-o versiune actuală de Chrome sau Safari.');
    try { audio = createFaceAudio({ src: asset('halloween-waltz.mp3') }); audio.unlock().catch(() => {}); }
    catch { audio?.close(); audio = null; }
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 },
    } });
    if (!current()) { cleanup(); return; }
    video.srcObject = stream; video.hidden = false; await video.play();
    if (!current()) { cleanup(); return; }
    if (!video.videoWidth) throw new Error('Camera nu furnizează imagini. Reîncearcă.');
    scene = new THREE.Scene();
    const camera = new THREE.Camera(), fitCamera = new THREE.PerspectiveCamera(55, video.videoWidth / video.videoHeight, 1, 1000);
    const anchor = new THREE.Group(), modelGroup = new THREE.Group(); anchor.add(modelGroup); scene.add(anchor);
    const fire = createMouthFire(); modelGroup.add(fire.group);
    const pose = createTrackedPose(anchor, { lossGraceMs: 100 });
    let lastResult = performance.now(), latestFit = null;
    const mouth = new THREE.Vector3(0, -4.2, 7.4), center = new THREE.Vector3(), edge = new THREE.Vector3();
    const referenceResponse = await fetch(asset('reference.json'), { signal: abort.signal });
    if (!referenceResponse.ok) throw new Error('Reperul facial nu a putut fi încărcat.');
    const reference = await referenceResponse.json();
    const modelResponse = await fetch(asset('masca_ritual.glb'), { signal: abort.signal });
    if (!modelResponse.ok) throw new Error('Masca nu a putut fi încărcată.');
    const modelData = await modelResponse.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(modelData, '');
    modelGroup.add(gltf.scene); gltf.scene.scale.setScalar(100);
    if (!current()) { cleanup(); return; }
    const rig = createMaskRig(gltf.scene);
    const occlusionGeometry = new THREE.BufferGeometry();
    occlusionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(reference.positions, 3));
    const upperIndices = [];
    for (let i = 0; i < reference.indices.length; i += 3) {
      const triangle = reference.indices.slice(i, i + 3);
      if (triangle.every(index => reference.positions[index * 3 + 1] > -2.7)) upperIndices.push(...triangle);
    }
    occlusionGeometry.setIndex(upperIndices);
    const depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });
    const occluder = new THREE.Mesh(occlusionGeometry, depthMaterial); occluder.renderOrder = -1; anchor.add(occluder);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 20), depthMaterial);
    skull.scale.set(6.2, 7.0, 5.2); skull.position.set(0, 2, -4.2); skull.renderOrder = -1; anchor.add(skull);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    glow = createFaceGlow(renderer);
    const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    environment = generator.fromScene(room, .04); room.dispose(); generator.dispose(); scene.environment = environment.texture;
    scene.add(new THREE.HemisphereLight(0xfff5e5, 0x555a5c, 1.3));
    const key = new THREE.DirectionalLight(0xfff5e9, 2.2); key.position.set(-15, 25, 35); scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9dcff, .7); fill.position.set(18, 8, 15); scene.add(fill);
    tracker = await createFaceTracker({ modelUrl: new URL(asset('face_landmarker.task'), document.baseURI).href,
      signal: abort.signal,
      onResult(result) {
        if (!current()) return;
        lastResult = performance.now();
        const matrix = fitFacePose(result.matrix, result.landmarks, reference, fitCamera);
        if (matrix) {
          const snap = !anchor.visible;
          pose.sample(matrix);
          latestFit = solveJawFit({ landmarks: result.landmarks, pose: matrix, reference, camera: fitCamera });
          rig.sample(latestFit, snap);
          if (latestFit?.mouth) mouth.copy(latestFit.mouth);
        } else pose.lose();
      },
      onError(failure) { if (current()) fail(failure); },
    });
    if (!current()) { cleanup(); return; }
    session = { renderer, scene, environment, tracker, pose, rig, glow, fire, audio, fitCamera, camera, frame: 0 };
    owned = true; pending = null; showMask = true;
    toggle.setAttribute('aria-pressed', 'true'); toggle.setAttribute('aria-label', 'Ascunde masca'); toggle.title = 'Ascunde masca';
    micButton.disabled = soundButton.disabled = !audio;
    micButton.setAttribute('aria-pressed', 'false'); micButton.title = 'Activează microfonul pentru suflat'; micButton.setAttribute('aria-label', micButton.title);
    soundButton.setAttribute('aria-pressed', 'true'); soundButton.title = 'Oprește muzica'; soundButton.setAttribute('aria-label', soundButton.title);
    notice = ''; noticeUntil = 0;
    panel.hidden = true; canvas.hidden = toolbar.hidden = status.hidden = false; fit();
    let previous = performance.now(), lastSubmitted = -Infinity, lastVideoTime = -1;
    const frame = now => {
      if (!session || !current()) return;
      session.frame = requestAnimationFrame(frame);
      const delta = Math.max(0, Math.min(.1, (now - previous) / 1000)); previous = now;
      if (now - lastSubmitted > 40 && video.currentTime !== lastVideoTime && video.readyState >= 2) {
        lastSubmitted = now; lastVideoTime = video.currentTime; tracker.submit(video, now);
      }
      if (now - lastResult > 350) pose.lose();
      pose.update();
      if (anchor.visible) rig.update(delta, now / 1000);
      modelGroup.scale.set(Number(widthControl.value) / 100, 1, 1);
      modelGroup.visible = showMask;
      const active = anchor.visible && showMask;
      const breath = audio?.update(delta, active && latestFit?.mouthRatio > .035) || { level: 0 };
      const desired = active ? Math.max(breath.level, manualFire || now < burstUntil ? 1 : 0) : 0;
      const power = fire.update(delta, now / 1000, desired, mouth);
      if (!active) { fire.reset(); manualFire = false; burstUntil = 0; }
      fire.prepare(camera);
      fireButton.setAttribute('aria-pressed', String(active && power > .12));
      audio?.setActive(active);
      if (audio?.musicError && soundButton.getAttribute('aria-pressed') === 'true') {
        soundButton.setAttribute('aria-pressed', 'false'); soundButton.title = 'Pornește muzica'; soundButton.setAttribute('aria-label', soundButton.title);
      }
      atmosphere.hidden = !active; video.classList.toggle('horror-active', active);
      if (active) {
        anchor.updateWorldMatrix(true, true);
        center.set(0, -.5, 4).applyMatrix4(anchor.matrixWorld).project(camera);
        edge.set(8, -.5, 4).applyMatrix4(anchor.matrixWorld).project(camera);
        const width = viewport.clientWidth, height = viewport.clientHeight, radius = Math.max(80, Math.abs(edge.x - center.x) * width * .85);
        atmosphere.style.setProperty('--horror-x', `${(1 - center.x) * width / 2}px`);
        atmosphere.style.setProperty('--horror-y', `${(1 - center.y) * height / 2}px`);
        atmosphere.style.setProperty('--horror-rx', `${radius * 1.3}px`); atmosphere.style.setProperty('--horror-ry', `${radius * 1.65}px`);
      }
      status.hidden = anchor.visible && now > noticeUntil;
      status.textContent = now < noticeUntil ? notice : 'Privește camera, într-un loc bine luminat.';
      if (anchor.visible && showMask) glow.render(scene, camera);
      else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
    };
    session.frame = requestAnimationFrame(frame);
  } catch (failure) {
    if (!owned) cleanup();
    if (attempt === generation) fail(failure);
  }
}
startButton.addEventListener('click', start);
$('#stop-face').addEventListener('click', stop);
toggle.addEventListener('click', () => {
  showMask = !showMask;
  const label = showMask ? 'Ascunde masca' : 'Arată masca';
  toggle.setAttribute('aria-pressed', String(showMask)); toggle.setAttribute('aria-label', label); toggle.title = label;
});
micButton.addEventListener('click', async () => {
  const s = session; if (!s?.audio) return;
  if (s.audio.microphoneActive) { s.audio.disableMicrophone(); micButton.setAttribute('aria-pressed', 'false'); micButton.title = 'Activează microfonul pentru suflat'; }
  else {
    micButton.disabled = true;
    try {
      await s.audio.enableMicrophone();
      if (session !== s) return;
      micButton.setAttribute('aria-pressed', String(s.audio.microphoneActive)); micButton.title = 'Oprește microfonul';
      notice = 'Stai o secundă în liniște, apoi suflă spre telefon.'; noticeUntil = performance.now() + 3500;
    } catch {
      if (session !== s) return;
      notice = 'Microfon indisponibil. Ține apăsat butonul cu flacără.'; noticeUntil = performance.now() + 4500;
    } finally { if (session === s) micButton.disabled = false; }
  }
  micButton.setAttribute('aria-label', micButton.title);
});
soundButton.addEventListener('click', async () => {
  const s = session; if (!s?.audio) return;
  const enabled = soundButton.getAttribute('aria-pressed') !== 'true';
  s.audio.setMuted(!enabled);
  if (enabled) { try { await s.audio.unlock(); } catch {} }
  if (session !== s) return;
  soundButton.setAttribute('aria-pressed', String(enabled)); soundButton.title = enabled ? 'Oprește muzica' : 'Pornește muzica'; soundButton.setAttribute('aria-label', soundButton.title);
});
const endFire = () => { if (manualFire) burstUntil = performance.now() + 250; manualFire = false; };
fireButton.addEventListener('pointerdown', event => {
  if (!session || !showMask) return;
  manualFire = true; fireButton.setPointerCapture(event.pointerId);
});
fireButton.addEventListener('pointerup', endFire); fireButton.addEventListener('pointercancel', endFire); fireButton.addEventListener('lostpointercapture', endFire);
fireButton.addEventListener('keydown', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); manualFire = true; } });
fireButton.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); endFire(); } });
fireButton.addEventListener('blur', endFire);
window.addEventListener('blur', () => { manualFire = false; burstUntil = 0; });
window.addEventListener('resize', fit); video.addEventListener('resize', fit);
window.addEventListener('pagehide', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
