// ============================================================
// main.js — 初始化入口，绑定所有事件
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // ── 初始化 UI ──────────────────────────────────────────────
  ui = new GameUI();

  // ── 元素引用 ──────────────────────────────────────────────
  const setupScreen    = document.getElementById('setup-screen');
  const gameScreen     = document.getElementById('game-screen');
  const apiUrlInput    = document.getElementById('api-url');
  const apiKeyInput    = document.getElementById('api-key');
  const modelSelect    = document.getElementById('model-select');
  const refreshBtn     = document.getElementById('refresh-models-btn');
  const startBtn       = document.getElementById('start-btn');
  const loadBtn        = document.getElementById('load-btn');
  const saveGameBtn    = document.getElementById('save-game-btn');
  const loadGameBtn    = document.getElementById('load-game-btn');
  const settingsBtn    = document.getElementById('settings-btn');
  const newGameBtn     = document.getElementById('new-game-btn');
  const settingsModal  = document.getElementById('settings-modal');
  const modalApiUrl    = document.getElementById('modal-api-url');
  const modalApiKey    = document.getElementById('modal-api-key');
  const modalModel     = document.getElementById('modal-model');
  const modalRefreshBtn= document.getElementById('modal-refresh-btn');
  const modalSaveBtn   = document.getElementById('modal-save-btn');
  const modalCloseBtn  = document.getElementById('modal-close-btn');
  const playerInput    = document.getElementById('player-input');
  const submitBtn      = document.getElementById('submit-btn');
  const toastEl        = document.getElementById('toast');

  // ── 恢复上次配置 ─────────────────────────────────────────
  const savedConfig = engine.loadConfig();
  if (savedConfig) {
    apiUrlInput.value = savedConfig.apiUrl || DEFAULT_API_URL;
    apiKeyInput.value = savedConfig.apiKey || '';
  } else {
    apiUrlInput.value = DEFAULT_API_URL;
  }

  // 如果有存档，显示"读取存档"按钮
  if (engine.hasSave()) {
    loadBtn.classList.remove('hidden');
  }

  // ── Toast 提示 ───────────────────────────────────────────
  function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (isError ? ' toast-error' : ' toast-ok');
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  // ── 刷新模型列表（设置屏） ────────────────────────────────
  async function refreshModels(urlInput, keyInput, selectEl, btnEl) {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    if (!url) { showToast('请先填写 API 地址', true); return; }

    btnEl.disabled = true;
    btnEl.textContent = '加载中…';
    selectEl.innerHTML = '<option value="">加载模型列表…</option>';

    try {
      const models = await engine.fetchModels(url, key);
      selectEl.innerHTML = '';
      if (models.length === 0) {
        selectEl.innerHTML = '<option value="">未找到模型</option>';
        showToast('未找到任何模型', true);
      } else {
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          selectEl.appendChild(opt);
        });
        // 还原上次选择的模型
        const cfg = engine.loadConfig();
        if (cfg?.model && models.includes(cfg.model)) {
          selectEl.value = cfg.model;
        }
        showToast(`已加载 ${models.length} 个模型`);
      }
    } catch (err) {
      selectEl.innerHTML = '<option value="">加载失败</option>';
      showToast('无法连接 LM Studio：' + err.message, true);
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = '刷新模型';
    }
  }

  refreshBtn.addEventListener('click', () => {
    refreshModels(apiUrlInput, apiKeyInput, modelSelect, refreshBtn);
  });

  // ── 切换屏幕 ─────────────────────────────────────────────
  function showGameScreen() {
    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');
    playerInput.focus();
  }

  function showSetupScreen() {
    gameScreen.classList.remove('active');
    setupScreen.classList.add('active');
  }

  // ── 开始新游戏 ────────────────────────────────────────────
  startBtn.addEventListener('click', async () => {
    const url   = apiUrlInput.value.trim();
    const key   = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!url)   { showToast('请填写 API 地址', true); return; }
    if (!model) { showToast('请先刷新并选择模型', true); return; }

    engine.configure(url, key, model);
    engine.saveConfig();
    engine.resetGame();
    showGameScreen();

    // 发送空消息触发 LLM 游戏介绍
    await sendToLLM('');
  });

  // ── 读取存档 ─────────────────────────────────────────────
  loadBtn.addEventListener('click', async () => {
    const url   = apiUrlInput.value.trim();
    const key   = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!url)   { showToast('请填写 API 地址', true); return; }
    if (!model) { showToast('请先刷新并选择模型', true); return; }

    const saveData = engine.loadGame();
    if (!saveData) {
      showToast('存档不存在或已损坏', true);
      loadBtn.classList.add('hidden');
      return;
    }

    engine.configure(url, key, model);
    engine.saveConfig();
    showGameScreen();
    ui.renderHistory(engine.conversationHistory);
    showToast('存档已读取');
  });

  // ── 游戏内存档 ───────────────────────────────────────────
  saveGameBtn.addEventListener('click', () => {
    if (engine.saveGame()) {
      showToast('游戏已存档');
    } else {
      showToast('存档失败', true);
    }
  });

  // ── 游戏内读档 ───────────────────────────────────────────
  loadGameBtn.addEventListener('click', () => {
    if (!engine.hasSave()) { showToast('没有存档', true); return; }
    const saveData = engine.loadGame();
    if (!saveData) { showToast('存档损坏', true); return; }
    ui.renderHistory(engine.conversationHistory);
    showToast('存档已读取');
  });

  // ── 新游戏（返回设置屏） ──────────────────────────────────
  newGameBtn.addEventListener('click', () => {
    if (!confirm('确定要开始新游戏吗？当前进度将丢失（请先存档）。')) return;
    engine.resetGame();
    ui.clearOutput();
    showSetupScreen();
  });

  // ── 设置弹窗 ─────────────────────────────────────────────
  const modalModelSelect = document.createElement('select');
  modalModelSelect.id = 'modal-model-select';

  settingsBtn.addEventListener('click', () => {
    modalApiUrl.value = engine.apiUrl;
    modalApiKey.value = engine.apiKey;
    settingsModal.classList.remove('hidden');
  });

  modalCloseBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  // 弹窗内刷新模型
  modalRefreshBtn.addEventListener('click', async () => {
    const url = modalApiUrl.value.trim();
    const key = modalApiKey.value.trim();
    if (!url) { showToast('请填写 API 地址', true); return; }

    modalRefreshBtn.disabled = true;
    modalRefreshBtn.textContent = '加载中…';
    modalModel.innerHTML = '<option value="">加载中…</option>';

    try {
      const models = await engine.fetchModels(url, key);
      modalModel.innerHTML = '';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modalModel.appendChild(opt);
      });
      if (engine.model && models.includes(engine.model)) {
        modalModel.value = engine.model;
      }
      showToast(`已加载 ${models.length} 个模型`);
    } catch (err) {
      modalModel.innerHTML = '<option value="">加载失败</option>';
      showToast('连接失败：' + err.message, true);
    } finally {
      modalRefreshBtn.disabled = false;
      modalRefreshBtn.textContent = '刷新模型';
    }
  });

  modalSaveBtn.addEventListener('click', () => {
    const url   = modalApiUrl.value.trim();
    const key   = modalApiKey.value.trim();
    const model = modalModel.value;
    if (!url)   { showToast('请填写 API 地址', true); return; }
    if (!model) { showToast('请先选择模型', true); return; }
    engine.configure(url, key, model);
    engine.saveConfig();
    settingsModal.classList.add('hidden');
    showToast('设置已保存');
  });

  // 点击遮罩关闭弹窗
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  // ── 发送消息逻辑 ──────────────────────────────────────────
  async function sendToLLM(text) {
    if (ui.isStreaming) return;
    ui.isStreaming = true;
    ui.setLoading(true);

    try {
      if (text && text.trim()) {
        ui.appendUserMessage(text);
      }
      const response = await engine.sendMessage(text);
      await ui.streamResponse(response);
    } catch (err) {
      ui.appendSystemMessage('❌ 错误：' + err.message, true);
    } finally {
      ui.isStreaming = false;
      ui.setLoading(false);
    }
  }

  submitBtn.addEventListener('click', () => {
    const text = playerInput.value.trim();
    if (!text || ui.isStreaming) return;
    playerInput.value = '';
    sendToLLM(text);
  });

  // Ctrl+Enter 或直接 Enter 发送（Shift+Enter 换行）
  playerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitBtn.click();
    }
  });
});
