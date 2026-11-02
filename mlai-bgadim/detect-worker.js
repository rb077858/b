/* עובד ברקע: טוען את מודל הזיהוי ומריץ אותו, כדי שהמסך לא ייתקע. */
let pipeline, env;
const MODEL = 'Xenova/owlv2-base-patch16-ensemble';
const DTYPE = 'q8';
let detector = null, loading = null;

function post(m) { self.postMessage(m); }
self.addEventListener('unhandledrejection', (e) => {
  post({ type: 'fatal', message: String((e.reason && e.reason.message) || e.reason || 'שגיאה') });
});

const libReady = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm').then((m) => {
  pipeline = m.pipeline; env = m.env;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  post({ type: 'hello' });
}).catch((e) => { post({ type: 'fatal', message: 'לא הצלחנו לטעון את ספריית הזיהוי: ' + (e && e.message) }); });

function load(id, safe) {
  if (detector) return Promise.resolve();
  if (loading) return loading;
  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let l = 0, t = 0;
      Object.values(files).forEach(([a, b]) => { l += a; t += b; });
      post({ type: 'progress', id, loaded: l, total: t });
    } else if (p.status === 'ready' || p.status === 'done') {
      post({ type: 'progress', id, stage: p.status });
    }
  };
  loading = (async () => {
    await libReady;
    // כשהדף מבודד אפשר לרוץ על כמה ליבות במקביל. במצב בטוח – ליבה אחת.
    const cores = self.navigator.hardwareConcurrency || 4;
    env.backends.onnx.wasm.numThreads = (!safe && self.crossOriginIsolated) ? Math.max(1, Math.min(cores, 6)) : 1;
    detector = await pipeline('zero-shot-object-detection', MODEL, { dtype: DTYPE, device: 'wasm', progress_callback });
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      await load(m.id, m.safe);
      post({ type: 'done', id: m.id, threads: env.backends.onnx.wasm.numThreads, isolated: self.crossOriginIsolated });
    } else if (m.type === 'detect') {
      await load(m.id, m.safe);
      const r = await detector(m.url, m.labels, { threshold: 0.05 });
      post({ type: 'done', id: m.id, result: r.map((d) => ({ label: d.label, score: d.score, box: d.box })) });
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
