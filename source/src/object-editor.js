import { createCutoutClient } from './cutout-client.js';

export function createObjectEditor({ video, onAdd }) {
  const dialog = document.querySelector('#object-editor');
  const canvas = document.querySelector('#object-photo');
  const context = canvas.getContext('2d');
  const message = document.querySelector('#object-message');
  const useButton = document.querySelector('#use-object');
  const fileInput = document.querySelector('#object-file');
  const selection = document.querySelector('#selection-tool');
  const finishContour = document.querySelector('#finish-contour');
  const client = createCutoutClient();
  let original = null, cutout = null, strokes = [], points = [], busy = false, revision = 0, imageId = 0;
  let preparation = null, prepared = false;
  function draw() {
    if (!original) { context.clearRect(0, 0, canvas.width, canvas.height); return; }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(cutout || original, 0, 0);
    if (points.length) {
      context.strokeStyle = '#e0d7a7'; context.fillStyle = '#e0d7a7'; context.lineWidth = Math.max(2, canvas.width/250);
      context.beginPath(); points.forEach(([x,y],i) => i ? context.lineTo(x,y) : context.moveTo(x,y)); context.stroke();
      points.forEach(([x,y]) => { context.beginPath(); context.arc(x,y,canvas.width/170,0,Math.PI*2); context.fill(); });
    }
  }
  function reset() {
    revision++; busy = false; cutout = null; strokes = []; points = [];
    useButton.disabled = true; finishContour.hidden = selection.value !== 'contour';
    message.textContent = selection.value === 'contour' ? 'Marchează conturul prin atingeri, apoi închide-l.' : 'Atinge obiectul pe care vrei să-l adaugi.';
    draw();
  }
  function setImage(source) {
    const factor = Math.min(1, 1024 / Math.max(source.width || source.videoWidth, source.height || source.videoHeight));
    canvas.width = Math.round((source.videoWidth || source.width) * factor);
    canvas.height = Math.round((source.videoHeight || source.height) * factor);
    original = document.createElement('canvas'); original.width = canvas.width; original.height = canvas.height;
    original.getContext('2d').drawImage(source, 0, 0, original.width, original.height);
    selection.value = 'keep'; reset();
    prepareImage();
  }

  function prepareImage() {
    const source = original, currentImageId = ++imageId;
    prepared = false;
    message.textContent = 'Pregătesc fotografia. Poți atinge deja obiectul.';
    const factor = Math.min(1, 512 / Math.max(source.width, source.height));
    preparation = createImageBitmap(source, {
      resizeWidth: Math.round(source.width * factor), resizeHeight: Math.round(source.height * factor), resizeQuality: 'high',
    }).then(image => {
      if (currentImageId !== imageId) { image.close(); throw new Error('Fotografie înlocuită.'); }
      return client.prepare(image, currentImageId);
    }).then(result => {
      if (currentImageId === imageId) {
        prepared = true;
        if (!busy && !cutout && selection.value !== 'contour') message.textContent = 'Atinge obiectul pe care vrei să-l adaugi.';
      }
      return result;
    });
    preparation.catch(() => {
      if (currentImageId === imageId && !busy && selection.value !== 'contour') message.textContent = 'Decuparea automată nu este disponibilă. Poți folosi Contur manual.';
    });
    return preparation;
  }

  function close() {
    revision++; imageId++; busy = false;
    original = cutout = preparation = null; strokes = []; points = []; prepared = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    dialog.close();
  }
  async function segment() {
    if (busy || !original) return;
    busy = true; useButton.disabled = true;
    const current = revision;
    const currentImageId = imageId;
    message.textContent = prepared ? 'Decupare…' : 'Pregătesc fotografia. Prima folosire poate dura mai mult.';
    try {
      await preparation;
      if (current !== revision) return;
      const result = await client.segment(strokes, currentImageId);
      if (current !== revision) return;
      const mask = document.createElement('canvas'); mask.width = result.width; mask.height = result.height;
      const maskContext = mask.getContext('2d'), pixels = maskContext.createImageData(mask.width,mask.height);
      for (let i=0;i<result.values.length;i++) pixels.data[i*4+3] = Math.round(Math.max(0,Math.min(1,(result.values[i]-.35)/.3))*255);
      maskContext.putImageData(pixels,0,0);
      cutout = document.createElement('canvas'); cutout.width = original.width; cutout.height = original.height;
      const target = cutout.getContext('2d'); target.drawImage(original,0,0); target.globalCompositeOperation = 'destination-in'; target.drawImage(mask,0,0,cutout.width,cutout.height);
      useButton.disabled = false;
      message.textContent = 'Verifică decuparea. Poți păstra sau elimina alte zone prin atingeri.';
      draw();
    } catch (error) {
      if (current === revision) { preparation = null; prepared = false; message.textContent = 'Decuparea automată nu a reușit. Alege Contur pentru decupare manuală.'; }
    } finally { if (current === revision) busy = false; }
  }
  canvas.addEventListener('pointerdown', event => {
    if (!original || busy) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)), y = Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    if (selection.value === 'contour') { points.push([x*canvas.width,y*canvas.height]); draw(); return; }
    if (selection.value === 'erase' && !strokes.length) { message.textContent = 'Selectează întâi obiectul cu Păstrează.'; return; }
    if (!preparation) prepareImage();
    strokes.push({brushMode:selection.value === 'erase' ? 2 : 1,point:[{x,y}],isCompleted:true});
    segment();
  });
  finishContour.addEventListener('click', () => {
    if (!original || points.length < 3) { message.textContent = 'Marchează cel puțin trei puncte.'; return; }
    cutout = document.createElement('canvas'); cutout.width = original.width; cutout.height = original.height;
    const target = cutout.getContext('2d'); target.beginPath(); points.forEach(([x,y],i) => i ? target.lineTo(x,y) : target.moveTo(x,y)); target.closePath(); target.clip(); target.drawImage(original,0,0);
    points = []; draw(); useButton.disabled = false; message.textContent = 'Contur închis. Poți adăuga obiectul în horă.';
  });
  selection.addEventListener('change', () => {
    if (selection.value === 'contour') reset();
    finishContour.hidden = selection.value !== 'contour';
  });
  document.querySelector('#reset-cutout').addEventListener('click', () => { reset(); if (original && !preparation) prepareImage(); });
  document.querySelector('#retake-object').addEventListener('click', () => {
    if (video.readyState < 2) { message.textContent = 'Pornește camera AR sau alege o fotografie din telefon.'; return; }
    setImage(video);
  });
  document.querySelector('#choose-object-file').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]; if (!file) return;
    const current = ++revision;
    try { const image = await createImageBitmap(file); if (current === revision) setImage(image); image.close(); }
    catch { if (current === revision) { busy = false; message.textContent = 'Fotografia nu poate fi deschisă. Încearcă un fișier JPG sau PNG.'; } }
    fileInput.value = '';
  });
  useButton.addEventListener('click', () => {
    if (!cutout) return;
    const pixels = cutout.getContext('2d').getImageData(0,0,cutout.width,cutout.height).data;
    let left=cutout.width,top=cutout.height,right=0,bottom=0,total=0;
    for(let y=0;y<cutout.height;y++)for(let x=0;x<cutout.width;x++)if(pixels[(y*cutout.width+x)*4+3]>32){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);total++;}
    if(total<100){message.textContent='Decuparea este goală. Reia selecția.';return;}
    const crop=document.createElement('canvas');crop.width=right-left+1;crop.height=bottom-top+1;
    crop.getContext('2d').drawImage(cutout,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
    onAdd({canvas:crop}); close();
  });
  document.querySelector('#close-object-editor').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  return {
    open() { dialog.showModal(); client.warmup().catch(() => {}); if (video.readyState >= 2) setImage(video); else { message.textContent='Alege o fotografie sau pornește camera AR înainte de captură.'; } },
    warmup() { return client.warmup().catch(() => {}); },
    get isOpen() { return dialog.open; },
    dispose() { close(); client.dispose(); },
  };
}
