import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPump } from './pump.js';
import { createProjectionMaterial } from './ar-projection.js';
import { createHora, pickDancer } from './hora.js';
import { createHoraMusic } from './hora-music.js';
import { createObjectEditor } from './object-editor.js';
import './style.css';

const viewport = document.querySelector('#ar-viewport');
const video = document.querySelector('#ar-video');
const canvas = document.querySelector('#ar-stage');
const startPanel = document.querySelector('#ar-start');
const startButton = document.querySelector('#start-camera');
const toolbar = document.querySelector('#ar-controls');
const status = document.querySelector('#ar-status');
const error = document.querySelector('#ar-error');
const effectSelect = document.querySelector('#ar-effect');
const scaleControl = document.querySelector('#ar-scale');
const assetRoot = `${import.meta.env.BASE_URL}assets/ar/`;
let generation = 0;
let session = null;
const entries = [];
let dancerCount = 6, bpm = 112, dancing = true, music = null, pendingMusic = null, playbackError = null;
const settings = document.querySelector('#hora-settings');
const musicButton = document.querySelector('#dance-music');
const pauseButton = document.querySelector('#dance-pause');
const editor = createObjectEditor({ video, onAdd(entry) {
  if (entries.length === 6) entries.shift();
  entries.push(entry);
  effectSelect.value = 'hora';
  rebuildHora();
  appearance();
} });

function updateCount() {
  document.querySelector('#add-object-start').textContent = entries.length ? `Mai adaugă un obiect · ${entries.length} în sesiune` : 'Adaugă un obiect din fotografie';
  document.querySelector('#dancer-count').textContent = `${dancerCount} dansatori`;
  document.querySelector('#fewer-dancers').disabled = dancerCount <= 3;
  document.querySelector('#more-dancers').disabled = dancerCount >= 10;
  document.querySelector('#remove-object').disabled = !entries.length;
}

function rebuildHora() {
  updateCount();
  if (!session) return;
  session.hora.dispose();
  session.hora = createHora(entries, dancerCount);
  session.tracker.anchor.add(session.hora.group);
  appearance();
}

function stop() {
  generation++;
  music?.close(); music = null;
  pendingMusic?.close(); pendingMusic = null; playbackError = null;
  musicButton.disabled = false;
  musicButton.setAttribute('aria-pressed', 'false');
  musicButton.setAttribute('aria-label', 'Pornește muzica'); musicButton.title = 'Pornește muzica';
  settings.hidden = true;
  document.querySelector('#dance-options').setAttribute('aria-expanded', 'false');
  if (session) {
    cancelAnimationFrame(session.frame);
    session.tracker.dispose();
    session.hora.dispose();
    const geometries = new Set(), materials = new Set();
    session.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
      if (object.userData.solidMaterial) materials.add(object.userData.solidMaterial);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    session.projection.dispose();
    session.environment.dispose();
    session.renderer.dispose();
    session = null;
  }
  video.srcObject?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  video.hidden = true;
  toolbar.hidden = true;
  status.hidden = true;
  startPanel.hidden = false;
  canvas.hidden = true;
  startButton.disabled = false;
  startButton.textContent = 'Pornește camera';
}

function fit() {
  if (!session || !video.videoWidth) return;
  const ratio = Math.max(viewport.clientWidth / video.videoWidth, viewport.clientHeight / video.videoHeight);
  const width = Math.round(video.videoWidth * ratio), height = Math.round(video.videoHeight * ratio);
  for (const element of [video, canvas]) {
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }
  session.renderer.setSize(width, height, false);
}

function appearance() {
  const isHora = effectSelect.value === 'hora';
  for (const id of ['dance-pause','dance-music','dance-options']) document.querySelector(`#${id}`).hidden = !isHora;
  if (!isHora) settings.hidden = true;
  if (!session) return;
  session.hora.group.visible = isHora;
  session.hora.group.scale.setScalar(Number(scaleControl.value) / 100);
  session.model.visible = !isHora;
  session.model.scale.setScalar(Number(scaleControl.value) / 100);
  session.model.traverse(object => {
    if (object.isMesh) object.material = effectSelect.value === 'hologram' ? session.projection : object.userData.solidMaterial;
  });
}

async function start() {
  if (startButton.disabled || session) return;
  const attempt = ++generation;
  error.hidden = true;
  startButton.disabled = true;
  startButton.textContent = 'Pornire…';
  let tracker, renderer, environment, pendingStream;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera necesită o adresă HTTPS și un browser compatibil. Deschide linkul în Safari sau Chrome.');
    }
    pendingStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (attempt !== generation) { pendingStream.getTracks().forEach(track => track.stop()); return; }
    video.srcObject = pendingStream;
    video.hidden = false;
    await video.play();
    if (attempt !== generation) { pendingStream.getTracks().forEach(track => track.stop()); return; }
    if (!video.videoWidth) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Camera nu furnizează imagini.')), 10000);
        video.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
    }
    const { createMarkerTracker } = await import('./ar-tracking.js');
    const frameScale = 640 / Math.max(video.videoWidth, video.videoHeight);
    const source = document.createElement('canvas');
    source.width = Math.round(video.videoWidth * frameScale);
    source.height = Math.round(video.videoHeight * frameScale);
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    tracker = await createMarkerTracker({ width: source.width, height: source.height, assetRoot });
    if (attempt !== generation) { tracker.dispose(); pendingStream.getTracks().forEach(track => track.stop()); return; }
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    camera.projectionMatrix.copy(tracker.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    const generator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = generator.fromScene(room, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .7;
    room.dispose();
    generator.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x59615b, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(-2, 4, 3);
    scene.add(light, tracker.anchor);
    const model = buildPump(tracker.anchor, [0, .01, 0], {
      steel: new THREE.MeshStandardMaterial({ color: 0x727975, metalness: .75, roughness: .38 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x292e2a, metalness: .55, roughness: .65 }),
    });
    const projection = createProjectionMaterial();
    const hora = createHora(entries, dancerCount);
    tracker.anchor.add(hora.group);
    model.traverse(object => { if (object.isMesh) object.userData.solidMaterial = object.material; });
    session = { tracker, renderer, environment, scene, camera, model, hora, projection, aspect: video.videoWidth / video.videoHeight, frame: 0 };
    appearance();
    canvas.hidden = false;
    startPanel.hidden = true;
    toolbar.hidden = false;
    status.hidden = false;
    status.textContent = 'Încadrează reperul Hiro.';
    fit();
    let previous = performance.now(), elapsed = 0;
    const animate = now => {
      if (!session || attempt !== generation) return;
      session.frame = requestAnimationFrame(animate);
      const delta = Math.min((now - previous) / 1000, .1);
      previous = now;
      elapsed += delta;
      if (editor.isOpen) {
        music?.update(0, bpm, false);
        return;
      }
      if (!editor.isOpen) sourceContext.drawImage(video, 0, 0, source.width, source.height);
      const tracked = !editor.isOpen && tracker.update(source, delta);
      status.hidden = tracked && !playbackError;
      status.textContent = playbackError || 'Încadrează reperul Hiro.';
      const isHora = effectSelect.value === 'hora';
      const beat = session.hora.update(tracked && !editor.isOpen ? delta : 0, { dancing: dancing && isHora, bpm });
      music?.update(beat, bpm, tracked && isHora && dancing && !editor.isOpen);
      if (music?.error) {
        const failedMusic = music; music = null; failedMusic.close();
        musicButton.setAttribute('aria-pressed', 'false');
        musicButton.setAttribute('aria-label', 'Pornește muzica'); musicButton.title = 'Pornește muzica';
        playbackError = 'Melodia nu a putut fi redată. Apasă din nou pe muzică.';
        status.hidden = false; status.textContent = playbackError;
      }
      projection.uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    };
    session.frame = requestAnimationFrame(animate);
    editor.warmup();
  } catch (failure) {
    if (attempt !== generation) {
      tracker?.dispose();
      pendingStream?.getTracks().forEach(track => track.stop());
      environment?.dispose();
      renderer?.dispose();
      return;
    }
    if (!session) { tracker?.dispose(); environment?.dispose(); renderer?.dispose(); }
    stop();
    const messages = {
      NotAllowedError: 'Accesul la cameră a fost refuzat. Permite camera în setările browserului și reîncearcă.',
      NotFoundError: 'Nu a fost găsită o cameră. Deschide aplicația pe telefon.',
      NotReadableError: 'Camera este folosită de altă aplicație. Închide-o și reîncearcă.',
    };
    error.textContent = messages[failure.name] || failure.message || 'Modul AR nu a putut porni.';
    error.hidden = false;
  }
}

canvas.hidden = true;
startButton.addEventListener('click', start);
document.querySelector('#stop-camera').addEventListener('click', stop);
effectSelect.addEventListener('change', appearance);
scaleControl.addEventListener('input', appearance);
document.querySelector('#add-object').addEventListener('click', () => editor.open());
document.querySelector('#add-object-start').addEventListener('click', () => editor.open());
document.querySelector('#hora-tempo').addEventListener('input', event => { bpm = Number(event.target.value); });
pauseButton.addEventListener('click', () => {
  dancing = !dancing;
  pauseButton.setAttribute('aria-pressed', String(!dancing));
  const label = dancing ? 'Pauză dans' : 'Continuă dansul';
  pauseButton.setAttribute('aria-label', label); pauseButton.title = label;
  pauseButton.querySelector('path').setAttribute('d', dancing ? 'M8 5v14M16 5v14' : 'M8 4l12 8-12 8Z');
});
musicButton.addEventListener('click', async () => {
  if (musicButton.disabled) return;
  if (music) { const previous = music; music = null; await previous.close(); }
  else {
    const attempt = generation;
    const candidate = createHoraMusic();
    pendingMusic = candidate; playbackError = null;
    musicButton.disabled = true;
    try {
      await candidate.resume();
      if (attempt !== generation) { await candidate.close(); return; }
      music = candidate;
    } catch {
      await candidate.close();
      if (attempt !== generation) return;
      playbackError = 'Melodia nu a putut fi redată. Verifică legătura la internet și reîncearcă.';
      status.hidden = false; status.textContent = playbackError;
    } finally { if (pendingMusic === candidate) pendingMusic = null; musicButton.disabled = false; }
  }
  const label = music ? 'Oprește muzica' : 'Pornește muzica';
  musicButton.setAttribute('aria-pressed', String(Boolean(music))); musicButton.setAttribute('aria-label', label); musicButton.title = label;
});
document.querySelector('#dance-options').addEventListener('click', event => {
  settings.hidden = !settings.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!settings.hidden));
});
document.querySelector('#more-dancers').addEventListener('click', () => { dancerCount = Math.min(10,dancerCount+1); rebuildHora(); });
document.querySelector('#fewer-dancers').addEventListener('click', () => { dancerCount = Math.max(3,dancerCount-1); rebuildHora(); });
document.querySelector('#remove-object').addEventListener('click', () => { entries.pop(); rebuildHora(); });
canvas.addEventListener('pointerdown', event => {
  if (!session || !session.tracker.anchor.visible || effectSelect.value !== 'hora') return;
  const rect = canvas.getBoundingClientRect();
  const index = pickDancer(session.hora.group,session.camera,(event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
  if(index>=0)session.hora.jump(index);
});
document.querySelector('#save-hora').addEventListener('click', () => {
  if (!session || !session.tracker.anchor.visible) { status.hidden=false;status.textContent='Încadrează reperul înainte de a salva.';return; }
  const photo = document.createElement('canvas'); photo.width=viewport.clientWidth;photo.height=viewport.clientHeight;
  const context=photo.getContext('2d'),rect=canvas.getBoundingClientRect();
  session.renderer.render(session.scene,session.camera);
  context.drawImage(video,rect.left,rect.top,rect.width,rect.height);
  context.drawImage(canvas,rect.left,rect.top,rect.width,rect.height);
  photo.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='hora-ar.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
});
window.addEventListener('resize', fit);
video.addEventListener('resize', () => {
  if (session && video.videoHeight && Math.abs(video.videoWidth / video.videoHeight - session.aspect) > .03) {
    stop();
    start();
  } else fit();
});
window.addEventListener('pagehide', () => { stop(); editor.dispose(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
appearance(); updateCount();
