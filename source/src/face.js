import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createFaceTracker } from './face-tracking.js';
import { fitFacePose, jawAmount } from './face-pose.js';
import { createTrackedPose } from './image-pose.js';
import { fitCameraCover } from './camera-cover.js';
import './style.css';

const $ = selector => document.querySelector(selector);
const viewport = $('#face-viewport'), video = $('#face-video'), canvas = $('#face-stage');
const panel = $('#face-start'), toolbar = $('#face-controls'), status = $('#face-status');
const error = $('#face-error'), startButton = $('#start-face'), toggle = $('#face-toggle'), widthControl = $('#face-width');
let generation = 0, pending = null, session = null, showMask = true;
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
}
function stop() {
  generation++; pending?.abort(); pending = null;
  const s = session; session = null;
  if (s) {
    cancelAnimationFrame(s.frame); s.tracker.close(); s.pose.reset();
    disposeScene(s.scene); s.environment.dispose(); s.renderer.dispose();
  }
  video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null;
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
  let stream, tracker, renderer, scene, environment, owned = false;
  const cleanup = () => {
    tracker?.close(); disposeScene(scene); environment?.dispose(); renderer?.dispose();
    stream?.getTracks().forEach(track => track.stop());
  };
  abort.signal.addEventListener('abort', () => { if (!owned) cleanup(); }, { once: true });
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.Worker || !window.createImageBitmap)
      throw new Error('Deschide pagina prin HTTPS într-o versiune actuală de Chrome sau Safari.');
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
    const pose = createTrackedPose(anchor, { lossGraceMs: 100 });
    let targetJaw = 0, jawValue = 0, lastResult = performance.now();
    const referenceResponse = await fetch(asset('reference.json'), { signal: abort.signal });
    if (!referenceResponse.ok) throw new Error('Reperul facial nu a putut fi încărcat.');
    const reference = await referenceResponse.json();
    const modelResponse = await fetch(asset('masca_lemn.glb'), { signal: abort.signal });
    if (!modelResponse.ok) throw new Error('Masca nu a putut fi încărcată.');
    const modelData = await modelResponse.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(modelData, '');
    modelGroup.add(gltf.scene); gltf.scene.scale.setScalar(100);
    if (!current()) { cleanup(); return; }
    const jaw = gltf.scene.getObjectByName('JawPivot');
    if (!jaw) throw new Error('Articulația maxilarului lipsește din model.');
    const occlusionGeometry = new THREE.BufferGeometry();
    occlusionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(reference.positions, 3));
    occlusionGeometry.setIndex(reference.indices);
    const depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });
    const occluder = new THREE.Mesh(occlusionGeometry, depthMaterial); occluder.renderOrder = -1; anchor.add(occluder);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 20), depthMaterial);
    skull.scale.set(6.6, 8.8, 5.7); skull.position.set(0, .5, -3.8); skull.renderOrder = -1; anchor.add(skull);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
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
        if (matrix) { pose.sample(matrix); targetJaw = jawAmount(result.categories); }
        else { pose.lose(); targetJaw = 0; }
      },
      onError(failure) { if (current()) fail(failure); },
    });
    if (!current()) { cleanup(); return; }
    session = { renderer, scene, environment, tracker, pose, fitCamera, camera, frame: 0 };
    owned = true; pending = null; showMask = true;
    toggle.setAttribute('aria-pressed', 'true'); toggle.setAttribute('aria-label', 'Ascunde masca'); toggle.title = 'Ascunde masca';
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
      jawValue += (targetJaw - jawValue) * (1 - Math.exp(-20 * delta)); jaw.rotation.x = jawValue * .38397243544;
      modelGroup.scale.set(Number(widthControl.value) / 100, 1, 1);
      modelGroup.visible = showMask;
      status.hidden = anchor.visible;
      status.textContent = 'Privește camera, într-un loc bine luminat.';
      renderer.render(scene, camera);
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
window.addEventListener('resize', fit); video.addEventListener('resize', fit);
window.addEventListener('pagehide', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
