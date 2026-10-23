# Automatic photo background removal

The upload editor's **자동 배경 제거** button runs foreground segmentation in a
dedicated browser worker. It does not call a paid inference API or upload the
source image to an AI provider. Registering the edited garment still uploads it
to the existing private Supabase bucket.

## Runtime and model

- Transformers.js `3.8.1` (Apache-2.0), loaded on demand from jsDelivr:
  https://github.com/huggingface/transformers.js/tree/3.8.1
- ISNet general-use q8 ONNX conversion (model card: Apache-2.0):
  https://huggingface.co/Ko033/isnet-general-use-onnx
- Model revision: `5349b617911fd60c619b52f32e2b593517b78df3`.
- Original architecture and weights: Xuebin Qin et al., DIS / IS-Net:
  https://github.com/xuebinqin/DIS

The model conversion removes auxiliary outputs and uses dynamic int8 weights.
Its `custom` configuration is explicitly mapped to Transformers.js's supported
`isnet` architecture for the task loader. The original image colors and existing transparency are preserved. Inference
uses WebAssembly with one thread, so no WebGPU or cross-origin-isolation headers
are required. The model is downloaded only when the button is pressed; browser
cache availability determines whether later sessions need another download.
External code, WASM, and model downloads require access to jsDelivr and Hugging
Face (including its model CDN). There are no new server environment variables
or database migrations.

## Behavior and limitations

- Photo submission and editing controls are disabled while processing. Cancel,
  photo replacement, or closing the dialog terminates the worker.
- Failed/cancelled jobs leave the current photo untouched. Late results cannot
  overwrite a newly selected photo. A completed operation adds one undo step.
- The worker is reused within an editing session and released when it closes.
- First use downloads approximately 46 MB of model weights plus runtime/WASM assets. CPU time and memory requirements
  may be unsuitable for older phones; errors preserve the manual tools.
- This is general foreground segmentation, not clothing/body parsing. Use a
  photo of a single garment. People, hangers, or nearby foreground objects may
  remain. Fine straps, lace, shadows, and similar foreground/background colors
  require review and manual cleanup.
- A four-minute timeout prevents an indefinitely busy editor. Users can cancel
  earlier. The timeout includes the first download.

## Manual acceptance checks

1. Signed out: only the introduction, usage guide, and prominent Google signup /
   login links appear. A returning authenticated user sees the workspace after
   the verified account and library load. Failed connections offer retry.
2. Upload a garment photo, remove the background, inspect transparent edges,
   undo, re-run, save, and reload the garment from the server.
3. Cancel while downloading/inferencing; replace the photo during inference;
   close/reopen the upload dialog. Confirm no old result modifies the new image.
4. Disconnect during the first model download. Confirm a clear error, unchanged
   photo, enabled submit/manual tools, and a working retry after reconnecting.
5. Check narrow/mobile layouts and keyboard navigation on target browsers.

## Validation for this change

- 39 automated tests and Next.js production build passed.
- DOM integration checks covered guest/member/connection-error surfaces and
  editor success, undo, cancellation, and replacement-photo races (jsdom).
- Real q8 model inference was checked with the sample tee image using both the
  native runtime and the browser-compatible single-thread ONNX WASM engine in
  Node. WASM inference took about 10 seconds on the development host; this is
  not a user-device performance promise.
- Full browser visual/mobile QA remains outstanding: the managed preview
  launcher appends Vite CLI arguments that Next.js rejects. Live Google Auth
  and Supabase upload were not exercised in this development environment.
