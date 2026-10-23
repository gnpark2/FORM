// Versions are pinned. No image is sent to the model/CDN host.
const RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Ko033/isnet-general-use-onnx';
const REVISION = '5349b617911fd60c619b52f32e2b593517b78df3';
let segmenter, RawImage;
self.onmessage = async ({data: {id, width, height, pixels}}) => {
  const progress = message => self.postMessage({id, type: 'progress', message});
  try {
    if (!segmenter) {
      progress('AI를 준비하고 있어요. 첫 실행에는 모델 다운로드가 필요해요.');
      const runtime = await import(RUNTIME);
      RawImage = runtime.RawImage;
      runtime.env.allowLocalModels = false;
      runtime.env.backends.onnx.wasm.numThreads = 1;
      runtime.env.backends.onnx.wasm.proxy = false;
      segmenter = await runtime.pipeline('background-removal', MODEL, {
        revision: REVISION, dtype: 'q8', device: 'wasm',
        // This export labels its architecture 'custom'; v3's task loader needs ISNet.
        config: {model_type: 'isnet'},
        progress_callback: event => {
          if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
            progress('AI 모델 다운로드 중 · ' + Math.round(event.progress || 0) + '%');
          } else if (event.status === 'done' && event.file?.endsWith('.onnx')) {
            progress('모델을 준비하고 있어요. 잠시만 기다려 주세요.');
          }
        }
      });
    }
    progress('사진에서 배경을 분리하고 있어요. 기기에 따라 시간이 걸릴 수 있어요.');
    const [result] = await segmenter(new RawImage(pixels, width, height, 4));
    const output = result.rgba().data;
    // Never restore pixels that the user already erased or cropped to transparency.
    for (let i = 3; i < output.length; i += 4) output[i] = Math.round(output[i] * pixels[i] / 255);
    self.postMessage({id, type: 'result', width: result.width, height: result.height, pixels: output}, [output.buffer]);
  } catch {
    segmenter = null;
    self.postMessage({id, type: 'error'});
  }
};
