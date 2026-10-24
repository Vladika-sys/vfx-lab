export async function createFaceTracker({ modelUrl, signal, onResult, onError,
  makeWorker = () => new Worker(new URL('./face-worker.js', import.meta.url), { type: 'module' }),
  bitmap = (source, options) => createImageBitmap(source, options),
}) {
  signal?.throwIfAborted();
  const worker = makeWorker();
  let closed = false, ready = false, busy = false, id = 0, timer, frameTimer, rejectReady;
  const close = () => {
    if (closed) return;
    closed = true; clearTimeout(timer); clearTimeout(frameTimer); worker.terminate();
    signal?.removeEventListener('abort', close);
    rejectReady?.(new DOMException('Oprit.', 'AbortError'));
  };
  signal?.addEventListener('abort', close, { once: true });
  try {
    await new Promise((resolve, reject) => {
      rejectReady = reject;
      const failure = error => {
        if (closed) return;
        if (!ready) reject(error); else onError(error);
        close();
      };
      worker.onmessage = ({ data }) => {
        if (closed) return;
        if (data.type === 'ready') { ready = true; clearTimeout(timer); resolve(); }
        else if (data.type === 'error') failure(new Error(data.error));
        else if (data.type === 'result' && data.id === id) { clearTimeout(frameTimer); busy = false; onResult(data); }
      };
      worker.onerror = () => failure(new Error('Urmărirea nu a putut porni în acest browser.'));
      timer = setTimeout(() => failure(new Error('Pregătirea a durat prea mult. Verifică legătura și reîncearcă.')), 45000);
      worker.postMessage({ type: 'init', modelUrl });
    });
    return {
      async submit(source, timestamp) {
        if (closed || busy) return false;
        busy = true;
        try {
          const factor = Math.min(1, 640 / Math.max(source.videoWidth, source.videoHeight));
          const image = await bitmap(source, { resizeWidth: Math.round(source.videoWidth * factor),
            resizeHeight: Math.round(source.videoHeight * factor), resizeQuality: 'low' });
          if (closed) { image.close(); return false; }
          try {
            frameTimer = setTimeout(() => { if (!closed) { onError(new Error('Urmărirea feței nu mai răspunde. Repornește camera.')); close(); } }, 12000);
            worker.postMessage({ type: 'frame', id: ++id, timestamp, image }, [image]);
          }
          catch (error) { image.close(); throw error; }
          return true;
        } catch (error) { busy = false; if (!closed) onError(error); return false; }
      }, close,
    };
  } catch (error) { close(); throw error; }
}
