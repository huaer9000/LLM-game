// ============================================================
// engine.js — LLM API 调用 + 对话历史管理
// ============================================================

class Engine {
  constructor() {
    this.conversationHistory = [];
    this.apiUrl = DEFAULT_API_URL;
    this.apiKey = '';
    this.model = '';
    this.isStreaming = false;
  }

  // ── 配置 ────────────────────────────────────────────────

  configure(apiUrl, apiKey, model) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey || '';
    this.model = model || '';
  }

  saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
        model: this.model,
      }));
    } catch (e) {
      console.warn('配置保存失败:', e);
    }
  }

  loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // ── 模型列表 ─────────────────────────────────────────────

  async fetchModels(apiUrl, apiKey) {
    const base = (apiUrl || this.apiUrl).replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(`${base}/models`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // OpenAI /models 返回 { data: [{id, ...}] }
    const models = data.data || data.models || [];
    return models.map(m => m.id || m.name || String(m)).filter(Boolean);
  }

  // ── 对话发送 ─────────────────────────────────────────────

  /**
   * 发送玩家消息，返回 Response 对象（流式）。
   * 调用方负责读取流并调用 ui.streamResponse()。
   */
  async sendMessage(userText) {
    if (userText && userText.trim()) {
      this.conversationHistory.push({ role: 'user', content: userText.trim() });
    }
    this._trimHistory();

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.conversationHistory,
    ];

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const resp = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        temperature: 0.85,
        max_tokens: 2500,
      }),
    });

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try {
        const errData = await resp.json();
        errMsg = errData.error?.message || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    return resp;
  }

  /**
   * 将 AI 完整回复追加到历史记录（由 ui.js 在流结束后调用）。
   */
  appendAssistantMessage(text) {
    if (text && text.trim()) {
      this.conversationHistory.push({ role: 'assistant', content: text.trim() });
    }
  }

  // ── SSE 解析 ─────────────────────────────────────────────

  /**
   * 解析单行 SSE 数据，返回 delta 文本片段（或 null）。
   * 输入示例：'data: {"choices":[{"delta":{"content":"你好"}}]}'
   */
  parseSSELine(line) {
    if (!line.startsWith('data:')) return null;
    const jsonStr = line.slice(5).trim();
    if (jsonStr === '[DONE]') return null;
    try {
      const obj = JSON.parse(jsonStr);
      return obj?.choices?.[0]?.delta?.content ?? null;
    } catch (_) {
      return null;
    }
  }

  // ── 历史裁剪 ─────────────────────────────────────────────

  _trimHistory() {
    if (this.conversationHistory.length > MAX_HISTORY) {
      this.conversationHistory = this.conversationHistory.slice(-TRIM_TO);
    }
  }

  // ── 存档/读档 ────────────────────────────────────────────

  saveGame() {
    try {
      const data = {
        conversationHistory: this.conversationHistory,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('存档失败:', e);
      return false;
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.conversationHistory)) throw new Error('格式错误');
      this.conversationHistory = data.conversationHistory;
      return data;
    } catch (e) {
      console.warn('读档失败:', e);
      localStorage.removeItem(SAVE_KEY);
      return false;
    }
  }

  hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  deleteSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  resetGame() {
    this.conversationHistory = [];
  }
}

// 全局单例
const engine = new Engine();
