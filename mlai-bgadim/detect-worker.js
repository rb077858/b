/* עובד ברקע: טוען את מודל הזיהוי ומריץ אותו, כדי שהמסך לא ייתקע. */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = 'Xenova/owlv2-base-patch16-ensemble';
const DTYPE = 'q8';
let detector = null, device = null, loading = null, noGpu = false;

async function gpuOk() {
  if (noGpu) return false;
  try { return !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch (e) { return false; }
}

function load(id) {
  if (detector) return Promise.resolve();
  if (loading) return loading;
  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let l = 0, t = 0;
      Object.values(files).forEach(([a, b]) => { l += a; t += b; });
      self.postMessage({ type: 'progress', id, loaded: l, total: t });
    }
  };
  loading = (async () => {
    if (await gpuOk()) {
      try {
        detector = await pipeline('zero-shot-object-detection', MODEL, { dtype: DTYPE, device: 'webgpu', progress_callback });
        device = 'webgpu'; return;
      } catch (e) { noGpu = true; self.postMessage({ type: 'nogpu' }); }
    }
    detector = await pipeline('zero-shot-object-detection', MODEL, { dtype: DTYPE, device: 'wasm', progress_callback });
    device = 'wasm';
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

async function detect(url, labels) {
  try {
    return await detector(url, labels, { threshold: 0.08 });
  } catch (e) {
    if (device !== 'webgpu') throw e;
    noGpu = true; detector = null; loading = null;
    self.postMessage({ type: 'nogpu' });
    await load();
    return await detector(url, labels, { threshold: 0.08 });
  }
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.noGpu) noGpu = true;
    if (m.type === 'load') {
      await load(m.id);
      self.postMessage({ type: 'done', id: m.id, device });
    } else if (m.type === 'detect') {
      await load(m.id);
      const r = await detect(m.url, m.labels);
      self.postMessage({ type: 'done', id: m.id, result: r.map((d) => ({ label: d.label, score: d.score, box: d.box })) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
