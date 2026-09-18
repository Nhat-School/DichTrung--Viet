import { TranslationEngine } from '../../lib/translator';
import { OcrEngine } from '../../lib/ocr';
import { AppError, errorMessage, type EngineRequest } from '../../lib/types';
const translator = new TranslationEngine();
const ocr = new OcrEngine();
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'offscreen') return;
  const request = message.request as EngineRequest;
  (async () => {
    switch (request.action) {
      case 'status': return translator.status();
      case 'translate': return translator.translate(request.text, request.direction);
      case 'translate-batch': return translator.translateBatch(request.texts, request.direction);
      case 'cancel-ocr': return ocr.cancel(request.jobId);
      case 'ocr': return ocr.recognize(request.image, request.crop, request.jobId, (progress, status) => {
        void chrome.runtime.sendMessage({ type: 'ocr-progress', jobId: request.jobId, progress, status }).catch(() => {});
      });
    }
  })().then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: errorMessage(error), code: error instanceof AppError ? error.code : 'ERROR' }));
  return true;
});
