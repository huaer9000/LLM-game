// ============================================================
// engine.js — LLM API 调用 + 对话历史管理 + 回合快照
// ============================================================

class Engine {
  constructor() {
    this.conversationHistory = [];
    this.configMessage = '';    // 玩家设定+世界+NPC角色库，每次请求实时注入，不存入 history
    this.apiUrl = DEFAULT_API_URL;
    this.apiKey = '';
    this.model = '';
    this.isStreaming = false;
    this.abortController = null;

    // 回合快照：每完成一回合（user+assistant）追加一条
    // { userInput: string, assistantOutput: string, historySnapshot: [] }
    this.rounds = [];
    // 当前浏览的回合索引，null 表示最新回合
    this.currentRoundIndex = null;

  }

  /** 更新角色库/世界/玩家配置，下次请求时自动注入为第一条 user 消息 */
  setConfig(text) {
    this.configMessage = text || '';
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

  saveGame(extraData = {}) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        conversationHistory: this.conversationHistory,
        rounds: this.rounds,
        currentRoundIndex: this.currentRoundIndex,
        configMessage: this.configMessage,
        ...extraData,
        savedAt: Date.now(),
      }));
      return true;
    } catch (e) {
      console.warn('存档保存失败:', e);
      return false;
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.conversationHistory) || !Array.isArray(data?.rounds)) {
        return null;
      }

      this.conversationHistory = data.conversationHistory;
      this.rounds = data.rounds;
      this.currentRoundIndex =
        Number.isInteger(data.currentRoundIndex) ? data.currentRoundIndex : null;
      this.configMessage = data.configMessage || '';
      this._hydrateDisplayHistoryFromRounds();

      return data;
    } catch (e) {
      console.warn('存档读取失败:', e);
      return null;
    }
  }

  hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  clearSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  // ── 模型列表 ─────────────────────────────────────────────

  async fetchModels(apiUrl, apiKey) {
    const base = (apiUrl || this.apiUrl).replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(`${base}/models`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const models = data.data || data.models || [];
    return models.map(m => m.id || m.name || String(m)).filter(Boolean);
  }

  // ── 对话发送 ─────────────────────────────────────────────

  async sendMessage(userText) {
    const pendingUserText = userText && userText.trim() ? userText.trim() : '';
    if (pendingUserText) {
      this.conversationHistory.push({ role: 'user', content: pendingUserText });
    }
    this._trimHistory();

    const systemContent = getActiveSystemPrompt();
    const messages = [{ role: 'system', content: systemContent }];
    if (this.configMessage) {
      messages.push({ role: 'user', content: this.configMessage });
    }
    messages.push(...this._buildContextMessages(pendingUserText));

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    this.abortController = new AbortController();
    const resp = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: this.abortController.signal,
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

  _buildContextMessages(pendingUserText = '') {
    const messages = [];
    const recentRoundCount = 5;

    if (this.rounds.length) {
      const olderRounds = this.rounds.slice(0, -recentRoundCount);
      const recentRounds = this.rounds.slice(-recentRoundCount);

      if (olderRounds.length) {
        messages.push({
          role: 'system',
          content: this._buildHistorySummary(olderRounds),
        });
      }

      recentRounds.forEach(round => {
        if (round.userInput) {
          messages.push({ role: 'user', content: round.userInput });
        }
        if (round.assistantOutput) {
          messages.push({ role: 'assistant', content: round.assistantOutput });
        }
      });
    } else if (this.conversationHistory.length) {
      messages.push(...this.conversationHistory
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({ role: msg.role, content: msg.displayContent || msg.content })));
      return messages;
    }

    if (pendingUserText) {
      messages.push({ role: 'user', content: pendingUserText });
    }

    return messages;
  }

  _buildHistorySummary(rounds) {
    const roundSummaries = rounds.map((round, idx) => this._summarizeRound(round, idx + 1)).filter(Boolean);
    const npcMap = new Map();
    const anchorSet = new Set();

    rounds.forEach(round => {
      const sections = this._splitSections(round.assistantOutput || '');
      const memory = sections['记忆'] || sections['记忆区'] || '';
      memory.split('\n')
        .map(line => line.trim())
        .filter(line => /^📌/.test(line))
        .forEach(line => anchorSet.add(line));

      Object.entries(sections).forEach(([title, content]) => {
        const isNpcPanel = title.startsWith('NPC:') ||
          (title.endsWith('面板') && !['游戏面板', '玩家面板'].includes(title)) ||
          (/⚧️/.test(content) || /(好感度|警惕度|理智值)[：:]\s*-?\d+/u.test(content));
        if (!isNpcPanel) return;
        const name = title.startsWith('NPC:')
          ? title.slice(4).trim()
          : title.replace(/面板$/, '').trim();
        if (!name) return;
        const statsLine = content.split('\n').map(line => line.trim()).find(line =>
          /(?:📊\s*)?数值[：:]/u.test(line) || /(好感度|警惕度|理智值)[：:]\s*-?\d+\/\d+/u.test(line)
        );
        const emotionLine = content.split('\n').map(line => line.trim()).find(line => /💗\s*情绪[：:]/u.test(line));
        if (!statsLine && !emotionLine) return;
        npcMap.set(name, [emotionLine, statsLine].filter(Boolean).join(' | '));
      });
    });

    const summaryLines = [];
    const firstRound = rounds[0];
    const lastRound = rounds[rounds.length - 1];
    summaryLines.push(`[历史摘要]`);
    summaryLines.push(`摘要范围：第1回至第${rounds.length}回。以下内容是更早历史的压缩摘要，后面仍会附上最近5回合完整记录。`);

    if (roundSummaries.length) {
      summaryLines.push('', '主线回顾：');
      this._compressSummaryItems(roundSummaries, 8).forEach(item => {
        summaryLines.push(`- ${item}`);
      });
    }

    if (npcMap.size) {
      summaryLines.push('', `角色状态（摘要截止第${rounds.length}回）：`);
      [...npcMap.entries()].slice(0, 8).forEach(([name, value]) => {
        summaryLines.push(`- ${name}：${value}`);
      });
    }

    if (anchorSet.size) {
      summaryLines.push('', '关键锚点：');
      [...anchorSet].slice(-6).forEach(item => {
        summaryLines.push(`- ${item.replace(/^📌\s*/, '')}`);
      });
    }

    const firstScene = this._extractGameField(this._splitSections(firstRound?.assistantOutput || '')['游戏面板'] || '', '场所');
    const lastScene = this._extractGameField(this._splitSections(lastRound?.assistantOutput || '')['游戏面板'] || '', '场所');
    if (firstScene || lastScene) {
      summaryLines.push('', `场景迁移：${[firstScene, lastScene].filter(Boolean).join(' → ')}`);
    }

    return summaryLines.join('\n').trim();
  }

  _compressSummaryItems(items, maxItems = 8) {
    if (items.length <= maxItems) return items;
    const head = items.slice(0, 2);
    const tail = items.slice(-(maxItems - 3));
    return [...head, `……中间省略 ${items.length - head.length - tail.length} 回已压缩……`, ...tail];
  }

  _summarizeRound(round, roundNumber) {
    const sections = this._splitSections(round.assistantOutput || '');
    const gamePanel = sections['游戏面板'] || '';
    const plot = this._extractGameField(gamePanel, '情节');
    const place = this._extractGameField(gamePanel, '场所');
    const time = this._extractGameField(gamePanel, '时间');
    const body = this._extractBodySnippet(sections['正文'] || sections['正文内容'] || round.assistantOutput || '');

    const pieces = [];
    if (time) pieces.push(time);
    if (place) pieces.push(place);
    if (plot) pieces.push(plot);
    else if (body) pieces.push(body);
    return `第${roundNumber}回：${pieces.join('｜')}`;
  }

  _extractBodySnippet(text) {
    const clean = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return '';
    return clean.length > 42 ? clean.slice(0, 42) + '…' : clean;
  }

  _extractGameField(content, label) {
    const line = String(content || '')
      .split('\n')
      .map(item => item.trim())
      .find(item => new RegExp(`^[^\\n]*${label}[：:]`, 'u').test(item));
    if (!line) return '';
    const idx = line.search(/[：:]/);
    return idx >= 0 ? line.slice(idx + 1).trim() : '';
  }

  _splitSections(text) {
    const delimRe = /[-—─]{2,}\s*[【\[]([^\]】]{1,30})[】\]]\s*[-—─]{2,}/g;
    const sections = {};
    let lastIndex = 0;
    let lastTitle = null;
    let match;

    while ((match = delimRe.exec(text)) !== null) {
      if (lastTitle !== null) {
        sections[lastTitle] = text.slice(lastIndex, match.index).trim();
      }
      lastTitle = match[1].trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastTitle !== null) {
      sections[lastTitle] = text.slice(lastIndex).trim();
    }
    return sections;
  }

  stopStreaming() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 将 AI 回复追加到历史记录，并保存回合快照。
   * - conversationHistory 只存精简版（游戏面板+正文+NPC数值行+记忆区）
   * - round snapshot 存完整原文供 UI renderRound 渲染
   */
  appendAssistantMessage(fullText) {
    if (!fullText || !fullText.trim()) return;

    const lastUser = [...this.conversationHistory].reverse().find(m => m.role === 'user');
    const userInput = lastUser?.content || '';

    const displayText = fullText.trim();
    const slimText = this._extractSlim(displayText);
    this.conversationHistory.push({
      role: 'assistant',
      content: slimText,
      displayContent: displayText,
    });

    if (this.currentRoundIndex !== null) {
      this.rounds = this.rounds.slice(0, this.currentRoundIndex + 1);
      this.currentRoundIndex = null;
    }

    this.rounds.push({
      userInput,
      assistantOutput: displayText,
      historySnapshot: JSON.parse(JSON.stringify(this.conversationHistory)),
    });
  }

  /**
   * 从 AI 完整回复中提取精简版存入历史：
   * 保留：正文、游戏面板、NPC 面板（保留结构）、建议、记忆区
   * 去除：玩家面板
   * 目的：继续喂模型时仍保持完整分节结构，避免数回合后输出格式漂移。
   */
  _extractSlim(fullText) {
    const delimRe = /[-—─]{2,}\s*[【\[]([^\]】]{1,30})[】\]]\s*[-—─]{2,}/g;
    const parts = [];
    let lastIndex = 0;
    let lastTitle = null;
    let match;

    while ((match = delimRe.exec(fullText)) !== null) {
      if (lastTitle !== null) {
        parts.push({ title: lastTitle, content: fullText.slice(lastIndex, match.index).trim() });
      }
      lastTitle = match[1].trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastTitle !== null) {
      parts.push({ title: lastTitle, content: fullText.slice(lastIndex).trim() });
    }

    // 没有分节结构，原样返回（避免丢失内容）
    if (!parts.length) return fullText.trim();

    const result = [];
    for (const { title, content } of parts) {
      // 保留正文
      if (title === '正文' || title === '正文内容') {
        result.push(`——【正文】——\n${content}`);
        continue;
      }
      // 保留游戏面板
      if (title === '游戏面板') {
        result.push(`——【游戏面板】——\n${content}`);
        continue;
      }
      // 保留记忆（新节名"记忆"，兼容旧"记忆区"）
      if (title === '记忆' || title === '记忆区') {
        result.push(`——【记忆】——\n${content}`);
        continue;
      }
      // 保留建议，避免多轮后模型丢失 A/B/C/D 输出习惯
      if (title === '建议' || title === '行动建议') {
        result.push(`——【建议】——\n${content}`);
        continue;
      }
      // NPC 面板：保留结构化标题和关键字段，避免多轮后格式漂移
      if (
        title.startsWith('NPC:') ||
        (title.endsWith('面板') && !['游戏面板','玩家面板'].includes(title)) ||
        (/⚧️/.test(content) || /(好感度|警惕度|理智值)[：:]\s*-?\d+/u.test(content))
      ) {
        const lines = content
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .filter(line => (
            /⚧️|🎂|💼|💗\s*情绪|👔\s*外貌|🏷️\s*性格|^(?:📊\s*)?数值[：:]/u.test(line) ||
            /(好感度|警惕度|理智值)[：:]\s*-?\d+\/\d+/u.test(line) ||
            /👀\s*状态[：:]/u.test(line)
          ));
        if (lines.length) {
          const panelTitle = title.startsWith('NPC:') ? title : `NPC:${title.replace(/面板$/, '').trim()}`;
          result.push(`——【${panelTitle}】——\n${lines.join('\n')}`);
        }
        continue;
      }
      // 丢弃：玩家面板、其他
    }

    return result.join('\n\n') || fullText.trim();
  }

  // ── 回合导航 ─────────────────────────────────────────────

  /** 返回当前浏览的回合对象（null 时取最新） */
  getCurrentRound() {
    if (!this.rounds.length) return null;
    const idx = this.currentRoundIndex !== null
      ? this.currentRoundIndex
      : this.rounds.length - 1;
    return this.rounds[idx] || null;
  }

  /** 切换到上一回合，返回目标回合或 null */
  prevRound() {
    if (!this.rounds.length) return null;
    const current = this.currentRoundIndex !== null
      ? this.currentRoundIndex
      : this.rounds.length - 1;
    const target = current - 1;
    if (target < 0) return null;
    this.currentRoundIndex = target;
    return this.rounds[target];
  }

  /** 切换到下一回合，返回目标回合或 null */
  nextRound() {
    if (this.currentRoundIndex === null) return null; // 已在最新
    const target = this.currentRoundIndex + 1;
    if (target >= this.rounds.length) {
      this.currentRoundIndex = null;
      return this.rounds[this.rounds.length - 1];
    }
    this.currentRoundIndex = target;
    return this.rounds[target];
  }

  /** 从某回合分支：恢复历史快照，截断后续 */
  branchFromRound(roundIndex) {
    const round = this.rounds[roundIndex];
    if (!round) return;
    this.conversationHistory = JSON.parse(JSON.stringify(round.historySnapshot));
    this.rounds = this.rounds.slice(0, roundIndex + 1);
    this.currentRoundIndex = null;
  }

  /** 当前浏览的回合编号（1-based）和总回合数 */
  getRoundInfo() {
    const total = this.rounds.length;
    const current = this.currentRoundIndex !== null
      ? this.currentRoundIndex + 1
      : total;
    return { current, total };
  }

  // ── SSE 解析 ─────────────────────────────────────────────

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
      // 裁剪后若首条是 user，会与 configMessage(user) 形成连续 user 消息，导致模型失控
      // 去掉开头的 user 条目，确保 history 始终以 assistant 打头
      while (this.conversationHistory.length && this.conversationHistory[0].role === 'user') {
        this.conversationHistory.shift();
      }
    }
  }

  _hydrateDisplayHistoryFromRounds() {
    const assistantMessages = this.conversationHistory.filter(msg => msg.role === 'assistant');
    if (!assistantMessages.length || !this.rounds.length) return;

    const mappedRounds = this.rounds.slice(-assistantMessages.length);
    assistantMessages.forEach((msg, idx) => {
      if (!msg.displayContent && mappedRounds[idx]?.assistantOutput) {
        msg.displayContent = mappedRounds[idx].assistantOutput;
      }
    });
  }

  // ── 重置 ─────────────────────────────────────────────────

  resetGame() {
    this.stopStreaming();
    this.conversationHistory = [];
    this.configMessage = '';
    this.rounds = [];
    this.currentRoundIndex = null;
  }
}

// 全局单例
const engine = new Engine();
