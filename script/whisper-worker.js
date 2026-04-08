// ============================================================
// whisper-worker.js — 浏览器端本地语音识别 Worker
// 使用 Transformers.js (@xenova/transformers) 运行 Whisper 模型
// 模型首次加载时从 CDN 下载并缓存到浏览器 IndexedDB，后续离线可用
// ============================================================

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// 只从 CDN 拉取，不使用本地路径
env.allowLocalModels = false;
env.useBrowserCache  = true;   // 利用浏览器缓存，避免重复下载

let transcriber = null;

// ── 加载模型 ─────────────────────────────────────────────────
// 默认使用 whisper-base，中文识别比 tiny 更稳
// 如需更高准确率可继续改为 'Xenova/whisper-small'
async function loadModel(modelId = 'Xenova/whisper-base') {
  transcriber = await pipeline(
    'automatic-speech-recognition',
    modelId,
    {
      quantized: true,
      progress_callback: (progress) => {
        self.postMessage({ type: 'progress', progress });
      },
    }
  );
}

// ── 消息处理 ─────────────────────────────────────────────────
self.addEventListener('message', async (e) => {
  const { type, audio, model } = e.data;

  // ── 加载模型 ──
  if (type === 'load') {
    try {
      self.postMessage({ type: 'loading' });
      await loadModel(model);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || '模型加载失败' });
    }
    return;
  }

  // ── 转录音频 ──
  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', message: '模型尚未加载' });
      return;
    }
    try {
      self.postMessage({ type: 'transcribing' });
      // audio 是 16 kHz 单声道 PCM，当前 transformers 版本要求直接传 TypedArray
      const result = await transcriber(audio, {
        language: 'zh',
        task: 'transcribe',
        sampling_rate: 16000,
      });
      self.postMessage({ type: 'result', text: (result.text || '').trim() });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || '识别失败' });
    }
    return;
  }
});
