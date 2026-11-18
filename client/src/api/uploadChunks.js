const abortError = () => new DOMException('Upload paused', 'AbortError');

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason || abortError()); return; }
  const onAbort = () => { clearTimeout(timer); reject(signal.reason || abortError()); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, milliseconds);
  signal.addEventListener('abort', onAbort, { once: true });
});

const retryable = (error) => {
  if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') return false;
  const status = error.response?.status;
  return !status || status === 429 || status >= 500;
};

const retryDelay = (error, attempt) => {
  const value = error.response?.headers?.['retry-after'];
  const seconds = Number(value);
  const milliseconds = value && !Number.isFinite(seconds)
    ? Date.parse(value) - Date.now()
    : (seconds > 0 ? seconds : 2 ** attempt) * 1000;
  return Math.min(Math.max(Number.isFinite(milliseconds) ? milliseconds : 1000, 0), 30000);
};

/** Upload only missing chunks, and settle every worker before retry/resume. */
export const uploadChunks = async ({ file, chunkSize, totalChunks, receivedChunks = [], signal, postChunk, onProgress, delay = wait }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason || abortError());
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  const have = new Set(receivedChunks.filter((index) => Number.isInteger(index) && index >= 0 && index < totalChunks));
  const pending = Array.from({ length: totalChunks }, (_, index) => index).filter((index) => !have.has(index));
  let cursor = 0;
  let done = have.size;
  let failure;
  const worker = async () => {
    try {
      while (cursor < pending.length) {
        controller.signal.throwIfAborted();
        const index = pending[cursor++];
        const blob = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
        for (let attempt = 0; ; attempt++) {
          try {
            await postChunk(index, blob, controller.signal);
            break;
          } catch (error) {
            controller.signal.throwIfAborted();
            if (!retryable(error) || attempt >= 5) throw error;
            await delay(retryDelay(error, attempt), controller.signal);
          }
        }
        controller.signal.throwIfAborted();
        done += 1;
        onProgress?.((done / totalChunks) * 100);
      }
    } catch (error) {
      if (!failure) failure = error;
      controller.abort(error);
      throw error;
    }
  };
  try {
    await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, worker));
    if (failure) throw failure;
    controller.signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};
