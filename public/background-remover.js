// A dedicated worker keeps model loading and inference off the UI thread.
export function createBackgroundRemover({makeWorker = () => new Worker(new URL('./background-worker.js', import.meta.url), {type: 'module'}), timeoutMs = 240000} = {}) {
  let worker = null, active = null, sequence = 0;
  function stop(error) {
    worker?.terminate(); worker = null;
    if (active) { const task = active; active = null; clearTimeout(task.timer); task.reject(error); }
  }
  return {
    run(image, onProgress = () => {}) {
      if (active) return Promise.reject(new Error('이미 배경을 제거하고 있어요.'));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        active = {id, resolve, reject, timer: setTimeout(() => stop(new Error('처리가 오래 걸려 중단했어요. 다시 시도하거나 직접 편집해 주세요.')), timeoutMs)};
        try {
          worker ??= makeWorker();
          worker.onerror = () => stop(new Error('자동 배경 제거를 실행하지 못했어요. 연결을 확인하거나 다른 브라우저에서 다시 시도해 주세요.'));
          worker.onmessage = ({data}) => {
            if (!active || data.id !== active.id) return;
            if (data.type === 'progress') { onProgress(data.message); return; }
            if (data.type === 'error') { stop(new Error('배경 제거에 실패했어요. 원본은 유지됩니다. 다시 시도하거나 직접 편집해 주세요.')); return; }
            if (data.type !== 'result') return;
            const task = active; active = null; clearTimeout(task.timer); task.resolve(data);
          };
          // Keep the editor's snapshot intact for undo and cancellation.
          const pixels = image.data.slice();
          worker.postMessage({id, width: image.width, height: image.height, pixels}, [pixels.buffer]);
        } catch (error) { stop(error); }
      });
    },
    cancel() { stop(new DOMException('배경 제거를 취소했어요.', 'AbortError')); }
  };
}
