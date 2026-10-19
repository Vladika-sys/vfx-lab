export function createCutoutClient({
  workerFactory = () => new Worker(new URL('./cutout-worker.js', import.meta.url), { type: 'module' }),
  timeoutMs = 60000,
} = {}) {
  let worker = null, nextId = 0, warmup = null;
  const requests = new Map();

  function destroy(error = new Error('Operație anulată.')) {
    const previous = worker;
    worker = null; warmup = null;
    previous?.terminate();
    for (const pending of requests.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    requests.clear();
  }

  function request(type, payload = {}, transfer = []) {
    if (!worker) {
      try { worker = workerFactory(); }
      catch (error) { return Promise.reject(error); }
      worker.onmessage = ({ data }) => {
        const pending = requests.get(data.id);
        if (!pending) return;
        clearTimeout(pending.timeout); requests.delete(data.id);
        data.error ? pending.reject(new Error(data.error)) : pending.resolve(data);
      };
      worker.onerror = () => destroy(new Error('Decuparea automată nu este disponibilă. Folosește Contur manual.'));
    }
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => destroy(new Error('Decuparea durează prea mult. Folosește Contur manual.')), timeoutMs);
      requests.set(id, { resolve, reject, timeout });
      try { worker.postMessage({ id, type, ...payload }, transfer); }
      catch (error) { destroy(error); }
    });
  }

  return {
    warmup() {
      if (!warmup) warmup = request('warmup').catch(error => { warmup = null; throw error; });
      return warmup;
    },
    prepare(image, imageId) { return request('prepare', { image, imageId }, [image]); },
    segment(strokes, imageId) { return request('segment', { strokes, imageId }); },
    dispose: destroy,
  };
}
