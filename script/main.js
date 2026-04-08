// ============================================================
// main.js — 初始化入口，绑定所有事件
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  ui = new GameUI();

  const setupScreen = document.getElementById('setup-screen');
  const gameScreen = document.getElementById('game-screen');
  const gameConfigScreen = document.getElementById('game-config-screen');
  const configModalTitle = document.getElementById('config-modal-title');
  const cfgCloseBtn = document.getElementById('cfg-close-btn');
  const apiUrlInput = document.getElementById('api-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-select');
  const refreshBtn = document.getElementById('refresh-models-btn');
  const startBtn = document.getElementById('start-btn');
  const continueBtn = document.getElementById('continue-btn');
  const cfgStartBtn = document.getElementById('cfg-start-btn');
  const cfgBackBtn = document.getElementById('cfg-back-btn');
  const cfgRandomBtn = document.getElementById('cfg-random-btn');
  const addNpcBtn = document.getElementById('add-npc-btn-modal');
  const npcEditorList = document.getElementById('npc-editor-list-modal');
  const npcEmpty = document.getElementById('npc-empty-modal');
  const npcManageScreen = document.getElementById('npc-manage-screen');
  const npcManageCloseBtn = document.getElementById('npc-manage-close-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const gameSettingsBtn = document.getElementById('game-settings-btn');
  const newGameBtn = document.getElementById('new-game-btn');
  const restartGameBtn = document.getElementById('restart-game-btn');
  const backdoorBtn = document.getElementById('backdoor-btn');
  const debugIndicator = document.getElementById('debug-indicator');
  const settingsScreen = document.getElementById('settings-screen');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const promptModal = document.getElementById('prompt-modal');
  const modalApiUrl = document.getElementById('modal-api-url');
  const modalApiKey = document.getElementById('modal-api-key');
  const modalModel = document.getElementById('modal-model');
  const modalRefreshBtn = document.getElementById('modal-refresh-btn');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const promptCloseBtn = document.getElementById('prompt-close-btn');
  const npcEditorModal = document.getElementById('npc-editor-modal');
  const npcEditorTitle = document.getElementById('npc-editor-title');
  const npcEditorCloseBtn = document.getElementById('npc-editor-close-btn');
  const npcEditorSaveBtn = document.getElementById('npc-editor-save-btn');
  const npcEditorDeleteBtn = document.getElementById('npc-editor-delete-btn');
  const npcEditName = document.getElementById('npc-edit-name');
  const npcEditGender = document.getElementById('npc-edit-gender');
  const npcEditAge = document.getElementById('npc-edit-age');
  const npcEditJob = document.getElementById('npc-edit-job');
  const npcEditTraits = document.getElementById('npc-edit-traits');
  const npcEditAppearance = document.getElementById('npc-edit-appearance');
  const npcEditExtra = document.getElementById('npc-edit-extra');
  const npcEditEnabled = document.getElementById('npc-edit-enabled');
  const playerInput = document.getElementById('player-input');
  const submitBtn = document.getElementById('submit-btn');
  const toastEl = document.getElementById('toast');

  // 新游戏流程只需两步（玩家 → 世界观），NPC 由游戏后自动解析 + 角色管理入口维护
  const configSteps = ['tab-world', 'tab-player'];
  let configMode = 'new';
  let currentStepIndex = 0;
  let npcDrafts = [];
  let currentGameConfig = null;
  let editingNpcId = null;
  let npcEditorDraft = null;
  const debugState = {
    enabled: false,
    promptManagerVisible: false,
    splitView: false,
  };

  function createNpcDraft(overrides = {}) {
    return {
      id: overrides.id || `npc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      enabled: overrides.enabled ?? true,
      name: overrides.name || '',
      gender: overrides.gender || '女',
      age: overrides.age || '',
      job: overrides.job || '',
      traits: overrides.traits || '',
      appearance: overrides.appearance || '',
      extra: overrides.extra || '',
      source: overrides.source || 'custom',
    };
  }

  function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (isError ? ' toast-error' : ' toast-ok');
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  function applySavedModelOption(selectEl, model) {
    if (!model) return;
    selectEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model;
    selectEl.appendChild(opt);
    selectEl.value = model;
  }

  function syncSaveButtons() {
    continueBtn.classList.toggle('hidden', !engine.hasSave());
  }

  function saveGameState() {
    return engine.saveGame({ gameConfig: currentGameConfig });
  }

  function syncDebugUI() {
    debugIndicator?.classList.toggle('hidden', !debugState.enabled);
    backdoorBtn.classList.toggle('hidden', !(debugState.enabled && debugState.promptManagerVisible));
    ui.setDebugCompareMode(debugState.enabled && debugState.splitView);
  }

  function readInput(id) {
    return document.getElementById(id).value.trim();
  }

  // ── 自动高度工具 ──────────────────────────────────────────
  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  function initAutoResize(el) {
    if (!el) return;
    el.addEventListener('input', () => autoResize(el));
    autoResize(el);
  }
  // 初始化世界相关自动高度字段
  initAutoResize(document.getElementById('cfg-world-bg'));
  initAutoResize(document.getElementById('cfg-world-scene'));
  initAutoResize(npcEditAppearance);
  initAutoResize(npcEditExtra);

  function populatePlayerWorld(config) {
    document.getElementById('cfg-player-name').value = config?.player?.name || '';
    document.getElementById('cfg-player-gender').value = config?.player?.gender || '男';
    document.getElementById('cfg-player-traits').value = config?.player?.traits || '';
    document.getElementById('cfg-world-bg').value = config?.world?.background || '';
    document.getElementById('cfg-world-scene').value = config?.world?.scene || '';
    // 填值后重新计算高度
    autoResize(document.getElementById('cfg-world-bg'));
    autoResize(document.getElementById('cfg-world-scene'));
  }

  function collectPlayerWorld() {
    return {
      player: {
        name: readInput('cfg-player-name'),
        gender: document.getElementById('cfg-player-gender').value,
        traits: readInput('cfg-player-traits'),
      },
      world: {
        background: readInput('cfg-world-bg'),
        scene: readInput('cfg-world-scene'),
      },
    };
  }

  function validatePlayerStep() {
    const { player } = collectPlayerWorld();
    if (!player.name || !player.gender || !player.traits) {
      showToast('玩家姓名、性别、性格都必须填写', true);
      return false;
    }
    return true;
  }

  function validateWorldStep() {
    const { world } = collectPlayerWorld();
    if (!world.background || !world.scene) {
      showToast('世界背景和开场场景都必须填写', true);
      return false;
    }
    return true;
  }

  function validateNpcDrafts(showError = false) {
    const enabled = npcDrafts.filter(npc => npc.enabled);
    if (!enabled.length) return true; // NPCs are optional

    const requiredFields = ['name', 'gender', 'age', 'job', 'traits', 'appearance'];
    for (const npc of enabled) {
      const missing = requiredFields.find(field => !String(npc[field] || '').trim());
      if (missing) {
        if (showError) showToast(`角色「${npc.name || '未命名角色'}」还有未填写字段`, true);
        return false;
      }
    }

    return true;
  }

  function updateConfigActions() {
    const step = configSteps[currentStepIndex];
    const inNpcOnlyMode = configMode === 'edit-npc';

    cfgBackBtn.classList.toggle('hidden', currentStepIndex === 0 && !inNpcOnlyMode);
    cfgBackBtn.textContent = inNpcOnlyMode ? '取消' : (currentStepIndex === 0 ? '取消' : '上一步');
    cfgStartBtn.disabled = false;

    if (step === 'tab-world') {
      cfgRandomBtn.classList.remove('hidden');
      cfgStartBtn.textContent = '下一步';
    } else if (step === 'tab-player') {
      cfgRandomBtn.classList.add('hidden');
      cfgStartBtn.textContent = '开始游戏';
    } else {
      // NPC-only edit mode
      cfgRandomBtn.classList.add('hidden');
      cfgStartBtn.textContent = '应用设置';
      cfgStartBtn.disabled = !validateNpcDrafts(false);
    }
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });
    const idx = configSteps.indexOf(tabId);
    currentStepIndex = idx >= 0 ? idx : currentStepIndex;
    updateConfigActions();
  }

  function renderNpcDrafts() {
    if (!npcEditorList) return;
    npcEditorList.innerHTML = '';
    npcEmpty?.classList.toggle('hidden', npcDrafts.length > 0);

    npcDrafts.forEach((npc, index) => {
      const item = document.createElement('div');
      item.className = 'npc-editor-card npc-compact-card' + (npc.enabled ? '' : ' npc-disabled');
      item.innerHTML = `
        <div class="npc-compact-top">
          <div>
            <div class="npc-compact-name">${htmlEsc(npc.name || `角色 ${index + 1}`)}</div>
            <div class="npc-compact-meta">${htmlEsc(npc.gender || '未设定')} · ${htmlEsc(npc.age || '?')}岁 · ${htmlEsc(npc.job || '未填写职业')}</div>
          </div>
        </div>
        <div class="npc-compact-body" data-action="edit">
          <div class="npc-compact-row"><strong>性格：</strong>${htmlEsc(npc.traits || '未填写')}</div>
          <div class="npc-compact-row"><strong>外貌：</strong>${htmlEsc(npc.appearance || '未填写')}</div>
          <div class="npc-compact-row"><strong>补充：</strong>${htmlEsc(npc.extra || '未填写')}</div>
        </div>
        <div class="npc-compact-actions">
          <label class="npc-compact-toggle">
            <input type="checkbox" data-action="toggle" ${npc.enabled ? 'checked' : ''}>
            <span>${npc.enabled ? '已启用' : '已停用'}</span>
          </label>
          <div class="npc-compact-tools">
            <button type="button" class="btn btn-secondary btn-sm npc-editor-remove" data-action="remove">删除</button>
          </div>
        </div>
      `;

      item.dataset.id = npc.id;
      npcEditorList.appendChild(item);
    });

    updateConfigActions();
  }

  function getNpcDraftById(id) {
    return npcDrafts.find(npc => npc.id === id) || null;
  }

  function getEnabledNpcs() {
    return npcDrafts.filter(npc => npc.enabled);
  }

  function openSubScreen(screenEl) {
    gameScreen.classList.remove('active');
    screenEl.classList.add('active');
  }

  function closeSubScreen(screenEl) {
    screenEl.classList.remove('active');
    gameScreen.classList.add('active');
  }

  function fillNpcEditorForm(npc) {
    npcEditName.value = npc?.name || '';
    npcEditGender.value = npc?.gender || '女';
    npcEditAge.value = npc?.age || '';
    npcEditJob.value = npc?.job || '';
    npcEditTraits.value = npc?.traits || '';
    npcEditAppearance.value = npc?.appearance || '';
    npcEditExtra.value = npc?.extra || '';
    npcEditEnabled.checked = npc?.enabled ?? true;
    autoResize(npcEditAppearance);
    autoResize(npcEditExtra);
  }

  function openNpcEditor(npcId) {
    editingNpcId = npcId;
    const npc = getNpcDraftById(npcId);
    npcEditorDraft = npc ? createNpcDraft(npc) : createNpcDraft();
    npcEditorTitle.textContent = npc?.name ? `编辑角色：${npc.name}` : '新建角色';
    fillNpcEditorForm(npcEditorDraft);
    npcEditorDeleteBtn.classList.toggle('hidden', !npc);
    npcEditorModal.classList.remove('hidden');
  }

  function closeNpcEditor() {
    editingNpcId = null;
    npcEditorDraft = null;
    npcEditorModal.classList.add('hidden');
  }

  function persistNpcEditor() {
    if (!npcEditorDraft) return null;
    const npc = npcEditorDraft;
    npc.name = npcEditName.value.trim();
    npc.gender = npcEditGender.value;
    npc.age = npcEditAge.value.trim();
    npc.job = npcEditJob.value.trim();
    npc.traits = npcEditTraits.value.trim();
    npc.appearance = npcEditAppearance.value.trim();
    npc.extra = npcEditExtra.value.trim();
    npc.enabled = npcEditEnabled.checked;
    return npc;
  }

  function saveNpcEditor() {
    const npc = persistNpcEditor();
    if (!npc) return;
    const existingIndex = npcDrafts.findIndex(item => item.id === npc.id);
    if (existingIndex >= 0) {
      npcDrafts[existingIndex] = createNpcDraft(npc);
    } else {
      npcDrafts.unshift(createNpcDraft(npc));
    }
    renderNpcDrafts();
    closeNpcEditor();
  }

  function openConfigModal(mode = 'new') {
    configMode = mode;

    if (mode === 'edit-npc') {
      // 角色管理：打开独立页面
      renderNpcDrafts();
      openSubScreen(npcManageScreen);
    } else {
      // 新游戏：切到配置屏
      configModalTitle.textContent = '游戏设置';
      document.getElementById('tab-player').classList.remove('config-readonly');
      document.getElementById('tab-world').classList.remove('config-readonly');
      switchTab(configSteps[0]);
      setupScreen.classList.remove('active');
      gameConfigScreen.classList.add('active');
    }
  }

  function closeConfigModal() {
    if (configMode === 'edit-npc') {
      closeNpcEditor();
      closeSubScreen(npcManageScreen);
    } else {
      gameConfigScreen.classList.remove('active');
      setupScreen.classList.add('active');
    }
  }

  function htmlEsc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function refreshModels(urlInput, keyInput, selectEl, btnEl) {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    if (!url) {
      showToast('请先填写 API 地址', true);
      return;
    }

    btnEl.disabled = true;
    btnEl.textContent = '加载中…';
    selectEl.innerHTML = '<option value="">加载模型列表…</option>';

    try {
      const models = await engine.fetchModels(url, key);
      selectEl.innerHTML = '';
      if (!models.length) {
        selectEl.innerHTML = '<option value="">未找到模型</option>';
        showToast('未找到任何模型', true);
      } else {
        models.forEach(model => {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          selectEl.appendChild(opt);
        });
        const cfg = engine.loadConfig();
        if (cfg?.model && models.includes(cfg.model)) {
          selectEl.value = cfg.model;
        }
        showToast(`已加载 ${models.length} 个模型`);
      }
    } catch (err) {
      selectEl.innerHTML = '<option value="">加载失败</option>';
      showToast('无法连接：' + err.message, true);
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = '刷新模型';
    }
  }

  // 世界题材候选池，每次随机抽一个注入 prompt，避免模型重复选同一题材
  const WORLD_THEMES = [
    '穿越动漫作品', '穿越经典小说', '异世界转生', '时间停止', '催眠控制',
    '系统觉醒', '隐身透明人', '读心术', '身体交换', '男后宫', '女后宫',
    '末世求生', '恐怖灵异', '异能觉醒', '无限复活回档', '能力掠夺复制',
    '命运编辑器', '修仙仙侠', '卡牌召唤师', '记忆买卖商人', '情感欲望放大',
  ];

  async function fetchRandomConfig(target) {
    const headers = { 'Content-Type': 'application/json' };
    if (engine.apiKey) headers.Authorization = `Bearer ${engine.apiKey}`;
    let prompt = target === 'world' ? getActiveWorldGenPrompt() : getActiveNpcGenPrompt();

    // 世界生成：随机抽题材注入，防止每次生成雷同
    if (target === 'world') {
      const theme = WORLD_THEMES[Math.floor(Math.random() * WORLD_THEMES.length)];
      prompt += `\n\n本次必须使用「${theme}」题材，不得使用其他题材。`;
    }

    const resp = await fetch(`${engine.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: engine.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 1.1,
        max_tokens: 900,
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(jsonStr);
  }

  function applyRandomConfig(cfg) {
    const npcs = Array.isArray(cfg.npcs) ? cfg.npcs : [];
    if (npcs.length) {
      npcDrafts = npcs.map(npc => createNpcDraft({
        enabled: true,
        source: 'ai',
        name: npc.name,
        gender: npc.gender,
        age: npc.age,
        job: npc.job,
        traits: npc.traits,
        appearance: npc.appearance,
        extra: npc.extra,
      }));
      renderNpcDrafts();
    }

    if (cfg.world?.background) {
      const el = document.getElementById('cfg-world-bg');
      el.value = cfg.world.background;
      autoResize(el);
    }
    if (cfg.world?.scene) {
      const el = document.getElementById('cfg-world-scene');
      el.value = cfg.world.scene;
      autoResize(el);
    }
  }

  async function randomizeAll() {
    if (!engine.apiUrl || !engine.model) {
      showToast('请先在设置页配置 API 地址和模型', true);
      return;
    }

    cfgRandomBtn.disabled = true;
    cfgRandomBtn.classList.add('loading');
    cfgRandomBtn.textContent = '🎲 生成中…';

    try {
      const cfg = await fetchRandomConfig('world');
      const bgEl = document.getElementById('cfg-world-bg');
      const sceneEl = document.getElementById('cfg-world-scene');
      if (cfg.world?.background) { bgEl.value = cfg.world.background; autoResize(bgEl); }
      if (cfg.world?.scene)      { sceneEl.value = cfg.world.scene; autoResize(sceneEl); }
      showToast('世界观已随机生成');
    } catch (err) {
      showToast('生成失败：' + err.message, true);
    } finally {
      cfgRandomBtn.disabled = false;
      cfgRandomBtn.classList.remove('loading');
      cfgRandomBtn.textContent = '🎲 随机生成';
    }
  }

  /**
   * 根据配置对象拼装发给 AI 的配置文本，并同步到 engine.configMessage。
   * 供新游戏开始和 NPC 更新共用。
   */
  function buildConfigTextFromData(player, world, npcs) {
    const lines = [
      `[玩家设定]`,
      `姓名：${player.name}，性别：${player.gender}，性格：${player.traits}`,
      '',
      `[世界观]`,
      world.background,
      `开场场景：${world.scene}`,
    ];

    const enabledNpcs = (npcs || []).filter(n => n.enabled !== false);
    if (enabledNpcs.length) {
      lines.push('', '[角色设定]');
      enabledNpcs.forEach(npc => {
        lines.push(
          `• ${npc.name}：${npc.gender}，${npc.age}岁，${npc.job}，性格[${npc.traits}]，外貌[${npc.appearance}]${npc.extra ? `，补充[${npc.extra}]` : ''}`
        );
      });
    }

    lines.push('', `请根据以上设定直接生成开场剧情，输出完整面板和行动建议，无需介绍游戏规则。`);
    const text = lines.join('\n').trim();
    engine.setConfig(text);
    return text;
  }

  /** 从 DOM 表单收集数据，更新 currentGameConfig 并同步到 engine */
  function buildConfigMessage() {
    const data = collectPlayerWorld();
    const enabledNpcs = getEnabledNpcs();
    currentGameConfig = { player: data.player, world: data.world, npcs: enabledNpcs };
    return buildConfigTextFromData(data.player, data.world, enabledNpcs);
  }

  function populateNpcDrafts(npcs) {
    npcDrafts = (npcs || []).map(npc => createNpcDraft(npc));
    renderNpcDrafts();
  }

  function restoreSavedGame(savedGame) {
    if (!savedGame) {
      showToast('未找到可用存档', true);
      syncSaveButtons();
      return;
    }

    currentGameConfig = savedGame.gameConfig || null;
    if (currentGameConfig?.npcs) populateNpcDrafts(currentGameConfig.npcs);
    if (currentGameConfig) populatePlayerWorld(currentGameConfig);

    // 读档时恢复 configMessage：优先用存档里的，否则从 currentGameConfig 重建
    if (!engine.configMessage && currentGameConfig?.player) {
      buildConfigTextFromData(
        currentGameConfig.player,
        currentGameConfig.world || {},
        currentGameConfig.npcs || []
      );
    }

    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');

    const round = engine.getCurrentRound();
    if (round) ui.renderRound(round);
    else ui.renderHistory(engine.conversationHistory);

    updateRoundIndicator();
    syncSaveButtons();
    showToast('存档已读取');
  }

  async function sendToLLM(text, silent = false) {
    if (ui.isStreaming) return;
    ui.isStreaming = true;
    ui.setLoading(true);

    // 发送时立即清空回复建议，关闭回合历史面板
    ui.actionButtons.innerHTML = '';
    ui.actionButtons.classList.add('hidden');
    closeRoundHistory();

    // 若当前在查看历史回合，且后面还有内容，先征询确认
    if (engine.currentRoundIndex !== null) {
      const futureCount = engine.rounds.length - 1 - engine.currentRoundIndex;
      if (futureCount > 0) {
        const ok = confirm(`当前查看的是第 ${engine.currentRoundIndex + 1} 回，后面还有 ${futureCount} 个回合的内容。\n继续将丢弃这些内容，是否确认？`);
        if (!ok) {
          ui.isStreaming = false;
          ui.setLoading(false);
          return;
        }
      }
      engine.branchFromRound(engine.currentRoundIndex);
    }

    // 每回合独立显示
    ui.clearOutput();

    try {
      if (!silent && text && text.trim()) ui.appendUserMessage(text);
      const response = await engine.sendMessage(text);
      const fullText = await ui.streamResponse(response);

      // 每回合：从 AI 输出解析/更新角色库
      autoPopulateNpcsFromOutput(fullText);

      updateRoundIndicator();
      saveGameState();
      syncSaveButtons();
    } catch (err) {
      if (err.name !== 'AbortError') {
        ui.appendSystemMessage('❌ 错误：' + err.message, true);
      }
    } finally {
      engine.abortController = null;
      ui.isStreaming = false;
      ui.setLoading(false);
    }
  }

  function resetGameConfig() {
    currentGameConfig = null;
    npcDrafts = [];
    populatePlayerWorld(null);
    renderNpcDrafts();
    document.getElementById('cfg-player-gender').value = '男';
  }

  refreshBtn.addEventListener('click', () => {
    refreshModels(apiUrlInput, apiKeyInput, modelSelect, refreshBtn);
  });

  addNpcBtn?.addEventListener('click', () => {
    openNpcEditor(null);
  });

  // npcEditorList click 由下方统一代理（含 remove）

  // Tab 标签直接点击切换（自由跳转，无需按顺序）
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (!tabId || btn.classList.contains('hidden')) return;
      switchTab(tabId);
    });
  });

  cfgRandomBtn.addEventListener('click', randomizeAll);

  startBtn.addEventListener('click', () => {
    const url = apiUrlInput.value.trim();
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!url) {
      showToast('请填写 API 地址', true);
      return;
    }
    if (!model) {
      showToast('请先刷新并选择模型', true);
      return;
    }

    engine.configure(url, key, model);
    engine.saveConfig();
    resetGameConfig();
    openConfigModal('new');
  });

  continueBtn.addEventListener('click', () => {
    restoreSavedGame(engine.loadGame());
  });

  cfgBackBtn.addEventListener('click', () => {
    if (currentStepIndex === 0) {
      // 回到 setup-screen
      gameConfigScreen.classList.remove('active');
      setupScreen.classList.add('active');
      return;
    }
    switchTab(configSteps[currentStepIndex - 1]);
  });

  cfgCloseBtn?.addEventListener('click', () => {
    gameConfigScreen.classList.remove('active');
    setupScreen.classList.add('active');
  });

  cfgStartBtn.addEventListener('click', async () => {
    if (currentStepIndex === 0) {
      if (!validateWorldStep()) return;
      switchTab('tab-player');
      return;
    }

    // 玩家步骤 → 直接开始游戏（NPCs 可为空，游戏后自动解析）
    if (currentStepIndex === 1) {
      if (!validatePlayerStep()) return;
      engine.resetGame();
      buildConfigMessage();
      gameConfigScreen.classList.remove('active');
      gameScreen.classList.add('active');
      await sendToLLM('', true);
      return;
    }
  });

  // 角色管理页事件
  document.getElementById('npc-modal-save-btn')?.addEventListener('click', () => {
    if (!validateNpcDrafts(true)) return;
    buildConfigMessage();
    closeConfigModal();
    showToast('角色设置已更新，下一回合起生效');
  });
  npcManageCloseBtn?.addEventListener('click', closeConfigModal);
  npcEditorCloseBtn?.addEventListener('click', closeNpcEditor);
  npcEditorSaveBtn?.addEventListener('click', saveNpcEditor);
  npcEditorDeleteBtn?.addEventListener('click', () => {
    if (!editingNpcId) {
      closeNpcEditor();
      return;
    }
    npcDrafts = npcDrafts.filter(npc => npc.id !== editingNpcId);
    renderNpcDrafts();
    closeNpcEditor();
  });
  npcEditorModal?.addEventListener('click', (e) => {
    if (e.target === npcEditorModal) closeNpcEditor();
  });

  newGameBtn.addEventListener('click', () => {
    if (!confirm('确定要开始新游戏吗？当前进度将丢失。')) return;
    engine.resetGame();
    ui.clearOutput();
    resetGameConfig();
    gameScreen.classList.remove('active');
    openConfigModal('new');
  });

  gameSettingsBtn.addEventListener('click', () => {
    populateNpcDrafts(currentGameConfig?.npcs || npcDrafts);
    openConfigModal('edit-npc');
  });

  settingsBtn.addEventListener('click', () => {
    modalApiUrl.value = engine.apiUrl;
    modalApiKey.value = engine.apiKey;
    applySavedModelOption(modalModel, engine.model);
    openSubScreen(settingsScreen);
  });
  settingsCloseBtn?.addEventListener('click', () => closeSubScreen(settingsScreen));

  modalRefreshBtn.addEventListener('click', () => {
    refreshModels(modalApiUrl, modalApiKey, modalModel, modalRefreshBtn);
  });

  modalSaveBtn.addEventListener('click', () => {
    const url = modalApiUrl.value.trim();
    const key = modalApiKey.value.trim();
    const model = modalModel.value;
    if (!url) {
      showToast('请填写 API 地址', true);
      return;
    }
    if (!model) {
      showToast('请先选择模型', true);
      return;
    }
    engine.configure(url, key, model);
    engine.saveConfig();
    apiUrlInput.value = url;
    apiKeyInput.value = key;
    applySavedModelOption(modelSelect, model);
    closeSubScreen(settingsScreen);
    showToast('设置已保存');
  });

  // ── Prompt 管理器 ──────────────────────────────────────────

  const PM_CATEGORIES = {
    system:   { label: '系统 Prompt',  listId: 'pm-list-system',   addId: 'add-system-btn' },
    worldGen: { label: '世界生成',     listId: 'pm-list-worldGen', addId: 'add-worldGen-btn' },
    npcGen:   { label: 'NPC 生成',     listId: 'pm-list-npcGen',   addId: 'add-npcGen-btn' },
  };

  function pmSwitchTab(tabId) {
    promptModal.querySelectorAll('[data-pm-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pmTab === tabId);
    });
    promptModal.querySelectorAll('.pm-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pm-tab-${tabId}`);
    });
  }

  function pmBuildCard(category, entry, isOnly) {
    const card = document.createElement('div');
    card.className = 'pm-card' + (entry.active ? ' pm-card-active' : '');
    card.dataset.id = entry.id;

    // ── header ──
    const header = document.createElement('div');
    header.className = 'pm-card-header';

    const dot = document.createElement('span');
    dot.className = 'pm-dot' + (entry.active ? ' pm-dot-on' : '');
    dot.title = entry.active ? '已激活' : '未激活';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'pm-name-input';
    nameInput.value = entry.name;
    nameInput.placeholder = makeDefaultPromptName();
    nameInput.spellcheck = false;
    nameInput.addEventListener('blur', () => {
      const v = nameInput.value.trim() || makeDefaultPromptName();
      nameInput.value = v;
      updatePromptEntry(category, entry.id, { name: v });
    });

    const nameWrap = document.createElement('div');
    nameWrap.className = 'pm-name-wrap';
    nameWrap.appendChild(dot);
    nameWrap.appendChild(nameInput);

    const btns = document.createElement('div');
    btns.className = 'pm-card-btns';

    if (entry.active) {
      const lbl = document.createElement('span');
      lbl.className = 'pm-active-lbl';
      lbl.textContent = '✓ 已激活';
      btns.appendChild(lbl);
    } else {
      const activateBtn = document.createElement('button');
      activateBtn.className = 'btn btn-outline btn-sm';
      activateBtn.textContent = '激活';
      activateBtn.addEventListener('click', () => {
        activatePromptEntry(category, entry.id);
        pmRenderPane(category);
      });
      btns.appendChild(activateBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-outline btn-sm pm-edit-toggle';
    editBtn.textContent = '编辑';
    btns.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm pm-del-btn';
    delBtn.textContent = '删除';
    if (isOnly) { delBtn.disabled = true; delBtn.title = '至少保留一个'; }
    delBtn.addEventListener('click', () => {
      if (!confirm(`确定删除「${entry.name}」？`)) return;
      if (deletePromptEntry(category, entry.id)) pmRenderPane(category);
    });
    btns.appendChild(delBtn);

    header.appendChild(nameWrap);
    header.appendChild(btns);
    card.appendChild(header);

    // ── body (collapsed) ──
    const body = document.createElement('div');
    body.className = 'pm-card-body hidden';

    const textarea = document.createElement('textarea');
    textarea.className = 'pm-textarea';
    textarea.value = entry.content;
    textarea.spellcheck = false;
    body.appendChild(textarea);

    const footer = document.createElement('div');
    footer.className = 'pm-card-footer';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = '保存内容';
    saveBtn.addEventListener('click', () => {
      updatePromptEntry(category, entry.id, { content: textarea.value });
      entry.content = textarea.value;
      body.classList.add('hidden');
      editBtn.textContent = '编辑';
      showToast('已保存');
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-outline btn-sm';
    resetBtn.textContent = '恢复默认';
    resetBtn.addEventListener('click', () => {
      if (!confirm('确定将此 Prompt 内容恢复为默认值吗？')) return;
      textarea.value = getDefaultPromptContent(category);
      showToast('已填入默认内容，点「保存内容」生效');
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      textarea.value = entry.content;
      body.classList.add('hidden');
      editBtn.textContent = '编辑';
    });

    footer.appendChild(saveBtn);
    footer.appendChild(resetBtn);
    footer.appendChild(cancelBtn);
    body.appendChild(footer);
    card.appendChild(body);

    // wire edit toggle
    editBtn.addEventListener('click', () => {
      const open = !body.classList.contains('hidden');
      if (open) {
        textarea.value = entry.content;
        body.classList.add('hidden');
        editBtn.textContent = '编辑';
      } else {
        body.classList.remove('hidden');
        editBtn.textContent = '收起';
        textarea.focus();
      }
    });

    return card;
  }

  function pmRenderPane(category) {
    const cfg = PM_CATEGORIES[category];
    if (!cfg) return;
    const container = document.getElementById(cfg.listId);
    if (!container) return;
    container.innerHTML = '';
    const list = getPromptList(category);
    if (!list.length) {
      container.innerHTML = '<div class="pm-empty">暂无 Prompt，点击「新增」创建</div>';
      return;
    }
    list.forEach(entry => container.appendChild(pmBuildCard(category, entry, list.length <= 1)));
  }

  function pmRenderAll() {
    Object.keys(PM_CATEGORIES).forEach(cat => pmRenderPane(cat));
  }

  function pmAddNew(category) {
    const entry = addPromptEntry(category, '', getDefaultPromptContent(category));
    pmRenderPane(category);
    const card = document.querySelector(`#${PM_CATEGORIES[category].listId} [data-id="${entry.id}"]`);
    if (card) {
      const body = card.querySelector('.pm-card-body');
      const editBtn = card.querySelector('.pm-edit-toggle');
      const nameInput = card.querySelector('.pm-name-input');
      body?.classList.remove('hidden');
      if (editBtn) editBtn.textContent = '收起';
      nameInput?.focus();
      nameInput?.select();
    }
  }

  // Tab switching
  promptModal.querySelectorAll('[data-pm-tab]').forEach(btn => {
    btn.addEventListener('click', () => pmSwitchTab(btn.dataset.pmTab));
  });

  // Add buttons
  Object.keys(PM_CATEGORIES).forEach(cat => {
    document.getElementById(PM_CATEGORIES[cat].addId)
      ?.addEventListener('click', () => pmAddNew(cat));
  });

  backdoorBtn.addEventListener('click', () => {
    pmRenderAll();
    pmSwitchTab('system');
    promptModal.classList.remove('hidden');
  });

  // ── 显示设置 ──────────────────────────────────────────────

  const DISPLAY_KEY = 'llm_game_display_v1';
  const displayBtn   = document.getElementById('display-btn');
  const displayPanel = document.getElementById('display-panel');

  const FONT_FAMILIES = {
    mono:  "'STKaiti', 'KaiTi', 'Kaiti SC', 'DFKai-SB', serif",
    sans:  "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    serif: "'Songti SC', STSong, 'SimSun', Georgia, serif",
  };

  function loadDisplaySettings() {
    try {
      const raw = localStorage.getItem(DISPLAY_KEY);
      return raw ? JSON.parse(raw) : { theme: 'dark', size: 14, font: 'mono' };
    } catch { return { theme: 'dark', size: 14, font: 'mono' }; }
  }

  function saveDisplaySettings(s) {
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(s)); } catch {}
  }

  function applyDisplaySettings(s) {
    // 主题
    document.documentElement.setAttribute('data-theme', s.theme);
    // 字号
    document.documentElement.style.setProperty('--font-size', s.size + 'px');
    // 字体
    const fam = FONT_FAMILIES[s.font] || FONT_FAMILIES.mono;
    document.documentElement.style.setProperty('--font-family', fam);
    // 更新面板按钮高亮
    displayPanel.querySelectorAll('[data-theme]').forEach(b =>
      b.classList.toggle('dp-active', b.dataset.theme === s.theme));
    displayPanel.querySelectorAll('[data-size]').forEach(b =>
      b.classList.toggle('dp-active', String(b.dataset.size) === String(s.size)));
    displayPanel.querySelectorAll('[data-font]').forEach(b =>
      b.classList.toggle('dp-active', b.dataset.font === s.font));
  }

  let displaySettings = loadDisplaySettings();
  applyDisplaySettings(displaySettings);

  displayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    displayPanel.classList.toggle('hidden');
  });

  displayPanel.addEventListener('click', (e) => {
    const btn = e.target.closest('.dp-btn');
    if (!btn) return;
    if (btn.dataset.theme) {
      displaySettings.theme = btn.dataset.theme;
    } else if (btn.dataset.size) {
      displaySettings.size = Number(btn.dataset.size);
    } else if (btn.dataset.font) {
      displaySettings.font = btn.dataset.font;
    }
    saveDisplaySettings(displaySettings);
    applyDisplaySettings(displaySettings);
  });

  // 点击面板外部关闭
  document.addEventListener('click', (e) => {
    if (!displayPanel.classList.contains('hidden') &&
        !displayPanel.contains(e.target) &&
        e.target !== displayBtn) {
      displayPanel.classList.add('hidden');
    }
  });

  promptCloseBtn.addEventListener('click', () => promptModal.classList.add('hidden'));

  promptModal.addEventListener('click', (e) => {
    if (e.target === promptModal) promptModal.classList.add('hidden');
  });

  restartGameBtn?.addEventListener('click', () => {
    if (!confirm('重新开始游戏？当前进度将丢失。')) return;
    engine.resetGame();
    ui.clearOutput();
    if (currentGameConfig) {
      // 保留当前配置直接重开，buildConfigTextFromData 内部会同步 engine.configMessage
      buildConfigTextFromData(currentGameConfig.player, currentGameConfig.world, currentGameConfig.npcs || []);
      setupScreen.classList.remove('active');
      gameScreen.classList.add('active');
      sendToLLM('', true);
    } else {
      resetGameConfig();
      gameScreen.classList.remove('active');
      openConfigModal('new');
    }
  });

  submitBtn.addEventListener('click', () => {
    if (ui.isStreaming) {
      engine.stopStreaming();
      return;
    }
    const text = playerInput.value.trim();
    if (!text) return;
    playerInput.value = '';
    sendToLLM(text);
  });

  playerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (ui.isStreaming) return;
      submitBtn.click();
    }
  });

  // ── 语音输入（Whisper.js 本地推理，无需联网） ──────────────────
  (function () {
    const voiceTarget  = playerInput;
    const voiceOverlay = document.getElementById('voice-overlay');
    const voiceHint    = document.getElementById('voice-hint');
    const inputArea    = document.getElementById('input-area');
    if (!voiceTarget) return;

    // 检查 MediaRecorder 支持
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return;
    }

    // ── 状态变量 ──
    let worker       = null;   // Whisper Web Worker
    let workerReady  = false;  // 模型是否已加载完成
    let mediaRecorder = null;
    let audioChunks  = [];
    let stream       = null;
    let voiceMode    = false;  // 是否正在录音
    let voiceCancel  = false;  // 是否上划取消
    let processing   = false;  // 是否正在 Whisper 推理
    let startY       = 0;
    let pressTimer   = null;
    let activePointerId = null;

    // ── 初始化 Worker ──
    function initWorker() {
      if (worker) return;
      try {
        worker = new Worker('script/whisper-worker.js', { type: 'module' });
      } catch (_) {
        // 部分环境不支持 module worker，降级为纯文本输入
        return;
      }

      worker.onmessage = (e) => {
        const { type, text, progress, message } = e.data;

        if (type === 'loading') {
          if (voiceHint) voiceHint.textContent = '模型加载中…';
        } else if (type === 'progress') {
          // 展示下载进度（仅首次）
          if (progress?.status === 'progress' && voiceHint && processing) {
            const pct = Math.round(progress.progress ?? 0);
            voiceHint.textContent = `下载模型 ${pct}%`;
          }
        } else if (type === 'ready') {
          workerReady = true;
        } else if (type === 'transcribing') {
          if (voiceHint) voiceHint.textContent = '识别中…';
        } else if (type === 'result') {
          processing = false;
          voiceOverlay.classList.add('hidden');
          const trimmed = (text || '').trim();
          if (trimmed) {
            playerInput.value = trimmed;
            submitBtn.click();
          }
        } else if (type === 'error') {
          processing = false;
          voiceOverlay.classList.add('hidden');
          showToast('语音识别失败：' + (message || '未知错误'));
        }
      };

      worker.onerror = () => {
        processing = false;
        voiceOverlay.classList.add('hidden');
        showToast('语音模块加载失败');
      };

      // 页面加载后立即预热模型（后台下载缓存）
      worker.postMessage({ type: 'load' });
    }

    // ── 音频解码：Blob → 16 kHz Float32Array ──
    async function decodeAudioTo16k(blob) {
      const arrayBuffer = await blob.arrayBuffer();

      // 第一步：用原始采样率解码
      const rawCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await rawCtx.decodeAudioData(arrayBuffer);
      rawCtx.close();

      // 第二步：通过 OfflineAudioContext 重采样到 16 kHz 单声道
      const targetRate   = 16000;
      const targetFrames = Math.ceil(audioBuffer.duration * targetRate);
      if (targetFrames < 1600) return null; // 不足 0.1 秒，忽略

      const offCtx = new OfflineAudioContext(1, targetFrames, targetRate);
      const src    = offCtx.createBufferSource();
      src.buffer   = audioBuffer;
      src.connect(offCtx.destination);
      src.start(0);

      const rendered = await offCtx.startRendering();
      return rendered.getChannelData(0); // Float32Array
    }

    // ── 停止麦克风流 ──
    function stopStream() {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
    }

    // ── 进入录音模式 ──
    function enterVoiceMode() {
      if (!workerReady) {
        showToast('模型加载中，请稍候…');
        return;
      }
      voiceMode    = true;
      voiceCancel  = false;
      audioChunks  = [];
      playerInput.blur();

      voiceOverlay.classList.remove('hidden');
      voiceTarget.classList.add('voice-recording');
      inputArea.classList.remove('voice-cancel');
      if (voiceHint) voiceHint.textContent = '上划取消';

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(s => {
          if (!voiceMode) { s.getTracks().forEach(t => t.stop()); return; }
          stream = s;

          // 选择最佳支持的 MIME 类型
          const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
            .find(m => MediaRecorder.isTypeSupported(m)) || '';

          mediaRecorder = new MediaRecorder(s, mimeType ? { mimeType } : {});
          mediaRecorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) audioChunks.push(ev.data);
          };
          mediaRecorder.start();
        })
        .catch(() => {
          exitVoiceMode(true);
          showToast('无法访问麦克风，请检查权限');
        });
    }

    // ── 退出录音模式 ──
    function exitVoiceMode(cancelled) {
      if (!voiceMode) return;
      voiceMode = false;
      voiceTarget.classList.remove('voice-recording');
      inputArea.classList.remove('voice-cancel');

      if (cancelled) {
        voiceOverlay.classList.add('hidden');
        if (mediaRecorder?.state !== 'inactive') {
          mediaRecorder.ondataavailable = null;
          mediaRecorder.stop();
        }
        stopStream();
        audioChunks = [];
        return;
      }

      // 正常结束：停止录音并开始 Whisper 推理
      if (voiceHint) voiceHint.textContent = '处理中…';
      processing = true;

      const finalize = async () => {
        stopStream();
        if (!audioChunks.length) {
          voiceOverlay.classList.add('hidden');
          processing = false;
          return;
        }
        const mimeType = mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: mimeType });
        audioChunks = [];

        try {
          const float32 = await decodeAudioTo16k(blob);
          if (!float32) {
            voiceOverlay.classList.add('hidden');
            processing = false;
            showToast('录音太短，请重试');
            return;
          }
          // 转移 ArrayBuffer 所有权以避免内存拷贝
          worker.postMessage({ type: 'transcribe', audio: float32 }, [float32.buffer]);
        } catch (err) {
          voiceOverlay.classList.add('hidden');
          processing = false;
          showToast('音频处理失败：' + err.message);
        }
      };

      if (mediaRecorder?.state !== 'inactive') {
        mediaRecorder.onstop = finalize;
        mediaRecorder.stop();
      } else {
        finalize();
      }
    }

    function clearPressTimer() {
      if (!pressTimer) return false;
      clearTimeout(pressTimer);
      pressTimer = null;
      return true;
    }

    function beginPress(clientY) {
      if (processing || voiceMode) return;
      startY = clientY;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        enterVoiceMode();
      }, 400);
    }

    function updatePress(clientY) {
      if (!voiceMode) return;
      const dy = startY - clientY;
      voiceCancel = dy > 50;
      inputArea.classList.toggle('voice-cancel', voiceCancel);
      if (voiceHint) voiceHint.textContent = voiceCancel ? '松手取消' : '上划取消';
    }

    function endPress(cancelled = false) {
      if (clearPressTimer()) {
        return;
      }
      if (voiceMode) exitVoiceMode(cancelled || voiceCancel);
    }

    // ── 桌面和移动端统一用 Pointer 事件：按住输入框 400ms 进入录音 ──
    voiceTarget.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || activePointerId !== null) return;
      activePointerId = e.pointerId;
      try { voiceTarget.setPointerCapture(e.pointerId); } catch (_) {}
      beginPress(e.clientY);
    });

    voiceTarget.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId) return;
      updatePress(e.clientY);
    });

    function releasePointer(e, cancelled = false) {
      if (e.pointerId !== activePointerId) return;
      endPress(cancelled);
      try { voiceTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      activePointerId = null;
    }

    voiceTarget.addEventListener('pointerup', (e) => {
      releasePointer(e, false);
    });

    voiceTarget.addEventListener('pointercancel', (e) => {
      releasePointer(e, true);
    });

    voiceTarget.addEventListener('pointerleave', (e) => {
      if (e.pointerId !== activePointerId || voiceMode) return;
      releasePointer(e, true);
    });

    voiceTarget.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // 启动 Worker（预热）
    initWorker();
  })();

  // ── 回合历史系统 ─────────────────────────────────────────────

  const roundHistoryScreen = document.getElementById('round-history-screen');
  const itemsBtn = document.getElementById('items-btn');
  const rhCloseBtn = document.getElementById('rh-close-btn');

  function openRoundHistory() {
    renderRoundHistory();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    roundHistoryScreen?.classList.add('active');
  }

  function closeRoundHistory() {
    roundHistoryScreen?.classList.remove('active');
    gameScreen.classList.add('active');
  }

  /** 从正文提取预览片段（去 markdown，截断加省略号） */
  function extractStorySnippet(text) {
    // 优先取正文节内容
    const secRe = /[-—─]{2,}\s*[【\[](?:正文内容|正文)[】\]]\s*[-—─]{2,}([\s\S]*?)(?:[-—─]{2,}|$)/;
    const m = text.match(secRe);
    let content = m ? m[1].trim() : text.trim();
    // 去 markdown
    content = content
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();
    return content.length > 72 ? content.slice(0, 72) + '…' : content;
  }

  function updateRoundIndicator() {
    const el = document.getElementById('round-indicator');
    if (!el) return;
    const { current, total } = engine.getRoundInfo();
    if (!total) {
      el.classList.add('hidden');
      el.classList.remove('browsing');
      return;
    }
    el.classList.remove('hidden');
    const isBrowsing = engine.currentRoundIndex !== null;
    el.classList.toggle('browsing', isBrowsing);
    el.textContent = isBrowsing ? `第 ${current}/${total} 回` : `第 ${current} 回`;
  }

  function renderRoundHistory() {
    const list = document.getElementById('rh-list');
    if (!list) return;
    list.innerHTML = '';

    if (!engine.rounds.length) {
      list.innerHTML = '<div class="rh-empty">还没有任何回合记录</div>';
      return;
    }

    // 倒序显示（最新在上）
    [...engine.rounds].reverse().forEach((round, revIdx) => {
      const idx = engine.rounds.length - 1 - revIdx;
      const isCurrent = (engine.currentRoundIndex === null && idx === engine.rounds.length - 1) ||
                         idx === engine.currentRoundIndex;

      const item = document.createElement('div');
      item.className = 'rh-item' + (isCurrent ? ' rh-item-current' : '');

      const snippet = extractStorySnippet(round.assistantOutput);
      const userSnip = round.userInput
        ? `<span class="rh-user-input">${htmlEsc(round.userInput.slice(0, 36))}${round.userInput.length > 36 ? '…' : ''}</span>`
        : '';

      item.innerHTML = `
        <div class="rh-item-header">
          <span class="rh-round-num">第 ${idx + 1} 回</span>
          ${isCurrent ? '<span class="rh-current-badge">当前</span>' : ''}
          ${userSnip}
        </div>
        ${snippet ? `<div class="rh-story-snippet">${htmlEsc(snippet)}</div>` : ''}
      `;

      // 点击直接切换查看（不立即分支），提交时再处理分支逻辑
      item.addEventListener('click', () => {
        if (ui.isStreaming) {
          closeRoundHistory();
          if (!isCurrent) {
            showToast('流式输出中暂不支持切换历史回合', true);
          }
          return;
        }
        engine.currentRoundIndex = isCurrent ? null : idx;
        ui.renderRound(engine.rounds[idx]);
        closeRoundHistory();
        updateRoundIndicator();
      });

      list.appendChild(item);
    });
  }

  itemsBtn?.addEventListener('click', () => {
    if (!roundHistoryScreen?.classList.contains('active')) {
      openRoundHistory();
    } else {
      closeRoundHistory();
    }
  });

  rhCloseBtn?.addEventListener('click', closeRoundHistory);

  // 首次进入游戏页时触发教程脉冲动画
  if (!localStorage.getItem('items_tutorial_shown')) {
    setTimeout(() => {
      itemsBtn?.classList.add('items-tutorial');
    }, 1200);
  }

  // NPC 卡片：删除 按钮事件代理
  npcEditorList?.addEventListener('click', (e) => {
    const card = e.target.closest('.npc-editor-card');
    if (!card) return;
    const npcId = card.dataset.id;

    const removeBtn = e.target.closest('[data-action="remove"]');
    if (removeBtn) {
      e.stopPropagation();
      npcDrafts = npcDrafts.filter(npc => npc.id !== npcId);
      renderNpcDrafts();
      updateConfigActions();
      return;
    }

    if (e.target.closest('[data-action="edit"]') || e.target.closest('.npc-compact-name')) {
      openNpcEditor(npcId);
    }
  });

  npcEditorList?.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-action="toggle"]');
    if (!toggle) return;
    const card = e.target.closest('.npc-editor-card');
    const draft = getNpcDraftById(card?.dataset.id);
    if (!draft) return;
    draft.enabled = toggle.checked;
    renderNpcDrafts();
  });

  // ── 每回合从 AI 输出解析/更新角色库 ──────────────────────

  function autoPopulateNpcsFromOutput(text) {
    const delimRe = /[-—─]{2,}\s*[【\[]([^\]】]{1,30})[】\]]\s*[-—─]{2,}/g;
    const parts = [];
    let lastIndex = 0, lastTitle = null, match;
    while ((match = delimRe.exec(text)) !== null) {
      if (lastTitle !== null) {
        parts.push({ title: lastTitle, content: text.slice(lastIndex, match.index).trim() });
      }
      lastTitle = match[1].trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastTitle !== null) parts.push({ title: lastTitle, content: text.slice(lastIndex).trim() });

    let changed = false;
    for (const { title, content } of parts) {
      // 新格式 姓名（纯姓名节），兼容 NPC:姓名、姓名面板
      const isNpc = title.startsWith('NPC:') ||
        (title.endsWith('面板') && !/游戏|玩家/.test(title)) ||
        (/⚧️/.test(content) || /(好感度|警惕度|理智值)[：:]\s*\d/.test(content));
      if (!isNpc) continue;
      // 跳过游戏面板和记忆区（内容特征兜底保护）
      if (/^(游戏面板|记忆区|行动建议|建议|正文|正文内容)$/.test(title)) continue;
      const name = title.startsWith('NPC:')
        ? title.slice(4).trim()
        : title.replace(/面板$/, '').trim();
      if (!name) continue;

      // 从面板内容解析基础信息
      let gender = '', age = '', job = '', traits = '', appearance = '';
      const basicLine = content.split('\n').find(l => /⚧️/.test(l));
      if (basicLine) {
        const gm = basicLine.match(/⚧️\s*([男女其他])/); if (gm) gender = gm[1];
        const am = basicLine.match(/🎂\s*(\d+)/);        if (am) age = am[1];
        const jm = basicLine.match(/💼\s*([^|｜\n]+)/);  if (jm) job = jm[1].trim();
      }
      const traitsLine = content.split('\n').find(l => /性格[：:]/.test(l));
      if (traitsLine) { const tm = traitsLine.match(/性格[：:]\s*(.+)/); if (tm) traits = tm[1].trim(); }
      const appLine = content.split('\n').find(l => /外貌[：:]/.test(l));
      if (appLine) { const em = appLine.match(/外貌[：:]\s*(.+)/); if (em) appearance = em[1].trim(); }

      const existing = npcDrafts.find(n => n.name === name);
      if (existing) {
        // 已有角色：若为 AI 来源则更新 AI 可解析到的字段（手动编辑来源不覆盖）
        if (existing.source === 'ai') {
          if (gender)     existing.gender     = gender;
          if (age)        existing.age        = age;
          if (job)        existing.job        = job;
          if (traits)     existing.traits     = traits;
          if (appearance) existing.appearance = appearance;
          changed = true;
        }
      } else {
        // 新角色：追加到角色库
        npcDrafts.push(createNpcDraft({
          name, source: 'ai', enabled: true,
          gender: gender || '女', age, job, traits, appearance,
        }));
        changed = true;
      }
    }

    if (changed && currentGameConfig) {
      currentGameConfig.npcs = npcDrafts;
      buildConfigTextFromData(currentGameConfig.player, currentGameConfig.world, npcDrafts);
    }
  }

  // ── 移动端键盘检测（visualViewport） ───────────────────────
  if (window.visualViewport) {
    let lastVH = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
      const newVH = window.visualViewport.height;
      const diff = lastVH - newVH;
      // 高度缩减超过 100px 认为键盘弹出
      document.body.classList.toggle('keyboard-open', diff > 100);
      lastVH = newVH;
    });
  }

  // ── 隐藏入口：连按 10 次 Shift 进入/退出调试模式 ───────────
  (function () {
    let count = 0;
    let timer = null;
    document.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;

      if (e.key === 'Shift' && !e.repeat) {
        count++;
        clearTimeout(timer);
        timer = setTimeout(() => { count = 0; }, 2000);
        if (count >= 10) {
          count = 0;
          clearTimeout(timer);
          debugState.enabled = !debugState.enabled;
          debugState.promptManagerVisible = debugState.enabled;
          debugState.splitView = debugState.enabled;
          syncDebugUI();
          showToast(
            debugState.enabled
              ? '已进入调试模式，Prompt 管理和左右分屏已自动开启'
              : '已退出调试模式'
          );
        }
        return;
      }

      if (!editing && !['Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key) && !e.repeat) {
        count = 0;
        clearTimeout(timer);
      }
    });
  })();

  const savedConfig = engine.loadConfig();
  if (savedConfig) {
    apiUrlInput.value = savedConfig.apiUrl || DEFAULT_API_URL;
    apiKeyInput.value = savedConfig.apiKey || '';
    applySavedModelOption(modelSelect, savedConfig.model);
    engine.configure(
      savedConfig.apiUrl || DEFAULT_API_URL,
      savedConfig.apiKey || '',
      savedConfig.model || ''
    );
  } else {
    apiUrlInput.value = DEFAULT_API_URL;
  }

  syncSaveButtons();
  resetGameConfig();
  syncDebugUI();
});
