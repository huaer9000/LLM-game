// ============================================================
// ui.js — UI 渲染、流式文字显示、行动按钮解析
// ============================================================

class GameUI {
  constructor() {
    // 游戏屏元素
    this.outputInner   = document.getElementById('output-inner');
    this.outputArea    = document.getElementById('output-area');
    this.cursor        = document.getElementById('cursor');
    this.actionButtons = document.getElementById('action-buttons');
    this.playerInput   = document.getElementById('player-input');
    this.submitBtn     = document.getElementById('submit-btn');

    // 当前正在写入的消息块
    this._currentBlock = null;
    // 累积的完整流式文本
    this._streamBuffer = '';
  }

  // ── 消息追加 ─────────────────────────────────────────────

  /** 在输出区显示玩家输入（右侧风格） */
  appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg-user';
    div.textContent = '> ' + text;
    this.outputInner.appendChild(div);
    this.scrollToBottom();
  }

  /** 创建新的 AI 消息块（流式内容写入此块） */
  startAssistantBlock() {
    this._currentBlock = document.createElement('div');
    this._currentBlock.className = 'msg-ai';
    this.outputInner.appendChild(this._currentBlock);
    this._streamBuffer = '';
    // 游标移到块后
    this.outputInner.appendChild(this.cursor);
    this.cursor.style.display = 'inline';
    this.scrollToBottom();
    return this._currentBlock;
  }

  /** 向当前 AI 块追加文本片段（流式） */
  appendToken(token) {
    if (!this._currentBlock) this.startAssistantBlock();
    this._streamBuffer += token;
    this._currentBlock.innerHTML = this._formatGameText(this._streamBuffer);
    this.scrollToBottom();
  }

  /** 流结束后调用：隐藏游标、解析行动按钮 */
  onStreamEnd() {
    this.cursor.style.display = 'none';
    const fullText = this._streamBuffer;
    this._currentBlock = null;
    this._streamBuffer = '';

    const actions = this._parseActionButtons(fullText);
    this._renderActionButtons(actions);
    this.scrollToBottom();

    return fullText;
  }

  /** 显示系统提示/错误消息 */
  appendSystemMessage(text, isError = false) {
    const div = document.createElement('div');
    div.className = isError ? 'msg-system msg-error' : 'msg-system';
    div.textContent = text;
    this.outputInner.appendChild(div);
    this.scrollToBottom();
  }

  // ── 流式读取 ─────────────────────────────────────────────

  /**
   * 从 fetch Response 读取 SSE 流，逐 token 渲染。
   * 返回完整文本。
   */
  async streamResponse(response) {
    this.startAssistantBlock();

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let partial = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        // 最后一行可能不完整，留到下次
        partial = lines.pop();

        for (const line of lines) {
          const token = engine.parseSSELine(line.trim());
          if (token) this.appendToken(token);
        }
      }
      // 处理剩余
      if (partial.trim()) {
        const token = engine.parseSSELine(partial.trim());
        if (token) this.appendToken(token);
      }
    } catch (err) {
      this.appendSystemMessage('⚠️ 响应中断：' + err.message, true);
    }

    const fullText = this.onStreamEnd();
    engine.appendAssistantMessage(fullText);
    return fullText;
  }

  // ── 行动建议 ─────────────────────────────────────────────

  _parseActionButtons(text) {
    // 匹配 【行动建议】 段落，提取 A. B. C. D. 选项
    const sectionMatch = text.match(/【行动建议】[^\n]*\n([\s\S]*?)(?:——|$)/);
    if (!sectionMatch) return [];

    const sectionText = sectionMatch[1];
    const options = [];
    const lineRegex = /^([A-D])[.．、]\s*(.+)/gm;
    let match;
    while ((match = lineRegex.exec(sectionText)) !== null) {
      options.push({ key: match[1], text: match[2].trim() });
    }
    return options;
  }

  _renderActionButtons(options) {
    this.actionButtons.innerHTML = '';
    if (!options.length) {
      this.actionButtons.classList.add('hidden');
      return;
    }
    this.actionButtons.classList.remove('hidden');
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.innerHTML = `<span class="action-key">${opt.key}.</span> ${this._escapeHtml(opt.text)}`;
      btn.addEventListener('click', () => {
        this.playerInput.value = `${opt.key}. ${opt.text}`;
        this.playerInput.focus();
        // 直接提交
        document.getElementById('submit-btn').click();
      });
      this.actionButtons.appendChild(btn);
    });
  }

  // ── 文本格式化 ────────────────────────────────────────────

  /**
   * 将 LLM 输出中的 ——————【X】—————— 分隔行渲染为带样式的标题，
   * 其余内容保留换行。
   */
  _formatGameText(text) {
    // 先转义 HTML，再处理分隔线
    const escaped = this._escapeHtml(text);
    return escaped
      // 分隔线：——...——【标题】——...——
      .replace(
        /—{2,}【([^】]+)】—{2,}/g,
        '<span class="section-header">——【$1】——</span>'
      )
      // 换行转 <br>
      .replace(/\n/g, '<br>');
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 工具方法 ─────────────────────────────────────────────

  scrollToBottom() {
    this.outputArea.scrollTop = this.outputArea.scrollHeight;
  }

  /** 禁用/启用输入区（AI 思考期间） */
  setLoading(loading) {
    this.playerInput.disabled = loading;
    this.submitBtn.disabled = loading;
    this.submitBtn.textContent = loading ? 'AI思考中…' : '发送';
    if (!loading) this.playerInput.focus();
  }

  /** 清空历史渲染（读档后重绘） */
  clearOutput() {
    this.outputInner.innerHTML = '';
    this.actionButtons.innerHTML = '';
    this.actionButtons.classList.add('hidden');
    this.cursor.style.display = 'none';
  }

  /**
   * 将历史记录重新渲染到输出区（读档后调用）。
   * 只渲染 user/assistant 消息，跳过 system。
   */
  renderHistory(history) {
    this.clearOutput();
    history.forEach(msg => {
      if (msg.role === 'user') {
        this.appendUserMessage(msg.content);
      } else if (msg.role === 'assistant') {
        const div = document.createElement('div');
        div.className = 'msg-ai';
        div.innerHTML = this._formatGameText(msg.content);
        this.outputInner.appendChild(div);
      }
    });
    // 渲染最后一条 AI 消息的行动建议
    const lastAI = [...history].reverse().find(m => m.role === 'assistant');
    if (lastAI) {
      const actions = this._parseActionButtons(lastAI.content);
      this._renderActionButtons(actions);
    }
    this.scrollToBottom();
  }
}

// 全局单例（在 DOM ready 后初始化）
let ui;
