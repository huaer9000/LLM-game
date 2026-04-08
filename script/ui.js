// ============================================================
// ui.js — UI 渲染、流式、侧边栏结构化解析
// ============================================================

class GameUI {
  constructor() {
    this.outputInner   = document.getElementById('output-inner');
    this.outputArea    = document.getElementById('output-area');
    this.rawPanel      = document.getElementById('debug-raw-panel');
    this.rawInner      = document.getElementById('debug-raw-inner');
    this.cursor        = document.getElementById('cursor');
    this.actionButtons = document.getElementById('action-buttons');
    this.playerInput   = document.getElementById('player-input');
    this.submitBtn     = document.getElementById('submit-btn');
    this.sidebarInner  = document.getElementById('sidebar-inner');

    this.isStreaming   = false;
    this._currentBlock = null;
    this._streamBuffer = '';
    this._rawEntries   = [];
  }

  // ── 消息追加 ─────────────────────────────────────────────

  appendUserMessage(text) {
    const shouldStick = this._shouldStickToBottom();
    const div = document.createElement('div');
    div.className = 'msg-user';
    div.textContent = '> ' + text;
    this.outputInner.appendChild(div);
    this._rawEntries.push('> ' + text);
    this._syncRawPanel();
    this.scrollToBottom(shouldStick);
  }

  startAssistantBlock() {
    this._currentBlock = document.createElement('div');
    this._currentBlock.className = 'msg-ai';
    this.outputInner.appendChild(this._currentBlock);
    this._streamBuffer = '';
    this.outputInner.appendChild(this.cursor);
    this.cursor.style.display = 'inline';
    this._rawEntries.push('');
    this._syncRawStreamingBlock('');
    // 新回合滚到顶部，让用户从头阅读
    this.outputArea.scrollTop = 0;
    return this._currentBlock;
  }

  appendToken(token) {
    if (!this._currentBlock) this.startAssistantBlock();
    this._streamBuffer += token;
    this._currentBlock.innerHTML = this._formatGameText(this._streamBuffer);
    this._syncRawStreamingBlock(this._streamBuffer);
    // 流式输出期间不自动滚动
  }

  onStreamEnd() {
    this.cursor.style.display = 'none';
    const fullText = this._streamBuffer;
    const finishedBlock = this._currentBlock;
    this._currentBlock = null;
    this._streamBuffer = '';

    const sections = this._parseSections(fullText);

    if (finishedBlock) {
      finishedBlock.innerHTML = this._formatGameText(sections.main || fullText);
    }
    this._syncRawStreamingBlock(fullText);

    // 面板内联追加到输出区（正文之后）
    this._renderPanelsInline(sections.panels);
    this._renderActionButtons(this._parseActionButtons(fullText));

    this.scrollToBottom(this._shouldStickToBottom());
    return fullText;
  }

  appendSystemMessage(text, isError = false) {
    const shouldStick = this._shouldStickToBottom();
    const div = document.createElement('div');
    div.className = isError ? 'msg-system msg-error' : 'msg-system';
    div.textContent = text;
    this.outputInner.appendChild(div);
    this._rawEntries.push(text);
    this._syncRawPanel();
    this.scrollToBottom(shouldStick);
  }

  // ── 流式读取 ─────────────────────────────────────────────

  async streamResponse(response) {
    this.startAssistantBlock();
    const reader  = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let partial   = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop();
        for (const line of lines) {
          const tok = engine.parseSSELine(line.trim());
          if (tok) this.appendToken(tok);
        }
      }
      if (partial.trim()) {
        const tok = engine.parseSSELine(partial.trim());
        if (tok) this.appendToken(tok);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        this.appendSystemMessage('⚠️ 响应中断：' + err.message, true);
      }
    }

    const fullText = this.onStreamEnd();
    engine.appendAssistantMessage(fullText);
    return fullText;
  }

  // ── 分区解析 ──────────────────────────────────────────────
  // 支持多种分隔符：— (U+2014)、─ (U+2500)、- (U+002D)，2个或更多

  _sectionDelimRe() {
    return /[-—─]{2,}\s*[【\[]([^\]】]{1,30})[】\]]\s*[-—─]{2,}/g;
  }

  _sectionHeaderLineRe() {
    return /^\s*[【\[]([^\]】]{1,30})[】\]]\s*$/;
  }

  _shouldHideFromMain(line) {
    const t = (line || '').trim();
    if (!t) return false;
    if (/^(核心锚点|关键事件|长期记忆|短期记忆)\s*\d/u.test(t)) return true;
    if (/^[📌🔥📜🔸🔹◆]/u.test(t)) return true;
    if (/^\(暂无\)$|^（空）$/u.test(t)) return true;
    if (/^(?:📊\s*)?数值[：:]|^📖数值面板[：:]/u.test(t)) return true;
    if (/(好感度|警惕度|理智值)[：:]\s*-?\d+\/\d+/u.test(t)) return true;
    if (/👀\s*状态[：:]/u.test(t)) return true;
    return false;
  }

  _isGamePanelLine(line) {
    const t = (line || '').trim();
    return /^(📅\s*时间|🌏\s*世界|🏘️\s*场所|📖\s*情节|👥\s*在场)[：:]/u.test(t);
  }

  _isNpcPanelLine(line) {
    const t = (line || '').trim();
    if (!t) return false;
    if (/^NPC\s*[：:]/u.test(t)) return true;
    if (/⚧️|🎂|💼|💗\s*情绪|👔\s*外貌|🏷️\s*性格|^(?:📊\s*)?数值[：:]|^📖数值面板[：:]/u.test(t)) return true;
    if (/(好感度|警惕度|理智值)[：:]\s*-?\d+\/\d+/u.test(t)) return true;
    return false;
  }

  _recoverPanelsFromRaw(text) {
    const lines = text.split('\n');
    const panels = [];
    const consumed = new Set();

    const gameLines = [];
    lines.forEach((line, idx) => {
      if (this._isGamePanelLine(line)) {
        gameLines.push(line.trim());
        consumed.add(idx);
      }
    });
    if (gameLines.length) {
      panels.push({ title: '游戏面板', content: gameLines.join('\n') });
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!this._isNpcPanelLine(trimmed)) {
        i++;
        continue;
      }

      const block = [];
      let title = '';
      let j = i;
      while (j < lines.length) {
        const current = lines[j].trim();
        if (!current) {
          if (block.length) break;
          j++;
          continue;
        }
        if (this._isGamePanelLine(current)) break;
        if (j > i && /^NPC\s*[：:]/u.test(current)) break;
        if (j > i && /^[【\[]/.test(current)) break;
        if (this._shouldHideFromMain(current) || this._isNpcPanelLine(current)) {
          block.push(current);
          consumed.add(j);
          if (!title) {
            const npcTitleMatch = current.match(/^NPC\s*[：:]\s*(.+)$/u);
            if (npcTitleMatch) title = npcTitleMatch[1].trim();
            else {
              const basicNameMatch = current.match(/^([^｜|]+)[｜|]\s*⚧️/u);
              if (basicNameMatch) title = basicNameMatch[1].trim();
            }
          }
          j++;
          continue;
        }
        break;
      }

      if (block.length) {
        panels.push({ title: title || `角色${panels.filter(p => !p.title.includes('游戏面板')).length}`, content: block.join('\n') });
        i = j;
      } else {
        i++;
      }
    }

    const cleanedMain = lines
      .filter((_, idx) => !consumed.has(idx))
      .filter(line => !this._shouldHideFromMain(line))
      .join('\n')
      .trim();

    return { panels, main: cleanedMain };
  }

  _parseSections(text) {
    const delimRe = this._sectionDelimRe();
    const inlineHeaderRe = this._sectionHeaderLineRe();
    const parts   = [];
    let lastIndex = 0;
    let lastTitle = null;
    let match;

    while ((match = delimRe.exec(text)) !== null) {
      if (lastTitle !== null) {
        parts.push({ title: lastTitle, content: text.slice(lastIndex, match.index).trim() });
      }
      lastTitle = match[1].trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastTitle !== null) {
      parts.push({ title: lastTitle, content: text.slice(lastIndex).trim() });
    }

    if (parts.length === 0) {
      const lines = text.split('\n');
      let currentTitle = null;
      let buffer = [];
      const inlineParts = [];

      const pushCurrent = () => {
        if (!currentTitle) return;
        inlineParts.push({
          title: currentTitle,
          content: buffer.join('\n').trim(),
        });
        currentTitle = null;
        buffer = [];
      };

      lines.forEach(line => {
        const m = line.match(inlineHeaderRe);
        if (m) {
          pushCurrent();
          currentTitle = m[1].trim();
        } else if (currentTitle) {
          buffer.push(line);
        }
      });

      pushCurrent();

      if (!inlineParts.length) {
        const recovered = this._recoverPanelsFromRaw(text);
        return {
          main: recovered.main || text.split('\n').filter(l => !this._shouldHideFromMain(l)).join('\n').trim(),
          panels: recovered.panels,
        };
      }

      parts.push(...inlineParts);
    }

    // 跳过不渲染的节（建议/记忆相关全部跳过）
    const SKIP_TITLES = ['建议', '行动建议', '记忆', '核心锚点', '关键事件', '长期记忆', '短期记忆'];
    // 作为面板卡片渲染的节
    const PANEL_TITLES = ['游戏面板'];
    let main = '';
    const panels = [];

    for (const part of parts) {
      const t = part.title;
      // 跳过：建议、记忆（含区/区域等变体）
      if (SKIP_TITLES.some(s => t === s || t.startsWith(s))) continue;
      // 正文节
      if (t === '正文' || t === '正文内容') {
        main = part.content;
        continue;
      }
      // 游戏面板 → 作为卡片渲染
      if (PANEL_TITLES.some(s => t.includes(s))) {
        panels.push({ title: t, content: part.content });
        continue;
      }
      // NPC 面板：新格式 NPC:姓名，兼容旧格式
      if (t.startsWith('NPC:') || this._isNpcPanel(t, part.content)) {
        const displayTitle = t.startsWith('NPC:') ? t.slice(4).trim() : t;
        panels.push({ title: displayTitle, content: part.content });
        continue;
      }
      // 其余内容追加到正文区
      main += (main ? '\n\n' : '') + part.content;
    }

    // fallback：无【正文】节时取第一个非面板、非跳过节
    if (!main) {
      const fb = parts.find(p =>
        !SKIP_TITLES.some(s => p.title === s || p.title.startsWith(s)) &&
        !PANEL_TITLES.some(s => p.title.includes(s)) &&
        !p.title.startsWith('NPC:') &&
        !this._isNpcPanel(p.title, p.content)
      );
      if (fb) main = fb.content;
    }

    // 兜底清洗：过滤掉误入正文的记忆行
    if (main) {
      main = main.split('\n').filter(l => !this._shouldHideFromMain(l)).join('\n').trim();
    }

    if (!panels.length) {
      const recovered = this._recoverPanelsFromRaw(text);
      if (recovered.panels.length) {
        panels.push(...recovered.panels);
        if (recovered.main) main = recovered.main;
      }
    }

    return { main, panels };
  }

  _isNpcPanel(title, content) {
    if (title.endsWith('面板') && !['游戏面板', '玩家面板'].includes(title)) return true;
    const signals = [/⚧️/, /好感度[：:]\s*-?\d+/, /警惕度[：:]\s*-?\d+/, /理智值[：:]\s*-?\d+/];
    return signals.some(re => re.test(content));
  }

  // ── 侧边栏主渲染 ─────────────────────────────────────────

  _renderSidebar(panels) {
    if (!panels || !panels.length) return;
    this.sidebarInner.innerHTML = '';

    panels.forEach(({ title, content }) => {
      const section  = document.createElement('div');
      section.className = 'sidebar-section';
      const panelTheme = this._detectPanelTheme(title, content);
      if (panelTheme !== 'neutral') {
        section.classList.add(`sidebar-section-${panelTheme}`);
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'sidebar-section-title';
      titleEl.textContent = title;
      section.appendChild(titleEl);

      const body = document.createElement('div');
      body.className = 'sidebar-section-body';

      if (title.includes('记忆区')) {
        body.appendChild(this._renderMemory(content));
      } else {
        body.appendChild(this._renderFields(content, panelTheme));
      }

      section.appendChild(body);
      this.sidebarInner.appendChild(section);
    });
  }

  // ── 面板卡片渲染（正文后顺序追加） ──────────────────────
  _renderPanelsInline(panels) {
    if (!panels || !panels.length) return;
    // 渲染游戏面板 + NPC面板，过滤掉玩家面板和记忆
    const visiblePanels = panels.filter(({ title }) =>
      !['玩家面板', '记忆'].some(s => title.startsWith(s))
    );
    if (!visiblePanels.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'inline-panels';

    visiblePanels.forEach(({ title, content }) => {
      const section = document.createElement('div');
      section.className = 'sidebar-section';
      const panelTheme = this._detectPanelTheme(title, content);
      if (panelTheme !== 'neutral') section.classList.add(`sidebar-section-${panelTheme}`);

      const titleEl = document.createElement('div');
      titleEl.className = 'sidebar-section-title';
      titleEl.textContent = title;
      section.appendChild(titleEl);

      const body = document.createElement('div');
      body.className = 'sidebar-section-body';
      if (title.includes('记忆区')) {
        body.appendChild(this._renderMemory(content));
      } else {
        body.appendChild(this._renderFields(content, panelTheme));
      }
      section.appendChild(body);
      wrap.appendChild(section);
    });

    this.outputInner.appendChild(wrap);
  }

  _detectPanelTheme(title, content) {
    if (title.includes('玩家面板')) return 'neutral';
    if (/⚧️\s*男/.test(content)) return 'male';
    if (/⚧️\s*女/.test(content)) return 'female';
    return 'neutral';
  }

  // ── 结构化字段渲染 ───────────────────────────────────────

  _renderFields(content, panelTheme = 'neutral') {
    const wrap  = document.createElement('div');
    wrap.className = 'panel-fields';
    // 过滤掉混入的记忆区内容行（使用 u flag，避免 emoji 代理对误匹配）
    const MEMORY_RE = /^(关键事件|长期记忆|短期记忆)\s*[\d（(]|^[🔥📜🔸◆📌]/u;
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !MEMORY_RE.test(l));

    lines.forEach(line => {
      // ① 数值面板行  📖数值面板:❤️好感:75/100 | 📊 数值:💓好感度:80/100 | ...
      if (line.includes('数值面板') || /^📊\s*数值[：:]/.test(line)) {
        const inner = line.replace(/^.*?(?:数值面板|数值)[：:]\s*/, '');
        wrap.appendChild(this._renderStatRow(inner));
        return;
      }

      // ② 体能/精力  💪体能:75/100 | ⚡️精力:60/100
      if (/体能[：:]\d+\/\d+/.test(line) || /精力[：:]\d+\/\d+/.test(line)) {
        wrap.appendChild(this._renderStatRow(line));
        return;
      }

      // ③ 性格标签  🏷️ 性格:温柔、体贴、含羞
      if (/性格[：:]/.test(line)) {
        const idx = line.search(/[：:]/);
        const label = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (/[、,，]/.test(value)) {
          wrap.appendChild(this._renderBadgeRow(label, value));
          return;
        }
      }

      if (/亲近异性[：:]/.test(line)) {
        return;
      }

      // ④ 无冒号但有竖线（基本信息行）  ⚧️ 女 | 🎂 30岁 | 💼 全职主妇
      if (!/[：:]/.test(line) && /[|｜]/.test(line)) {
        wrap.appendChild(this._renderPillRow(line));
        return;
      }

      if (/身体特征[：:]/.test(line)) {
        wrap.appendChild(this._renderBodyFeatureRow(line, panelTheme));
        return;
      }

      // ⑤ 普通 标签:值 行
      wrap.appendChild(this._renderFieldRow(line));
    });

    return wrap;
  }

  // 普通字段行
  _renderFieldRow(line) {
    const row = document.createElement('div');
    row.className = 'panel-row';
    const m = line.match(/^(.+?)[：:]\s*(.+)$/s);
    if (m) {
      const lbl = document.createElement('span');
      lbl.className = 'panel-row-label';
      lbl.textContent = m[1];
      const val = document.createElement('span');
      val.className = 'panel-row-value';
      val.textContent = m[2];
      row.appendChild(lbl);
      row.appendChild(val);
    } else {
      row.textContent = line;
    }
    return row;
  }

  _renderBodyFeatureRow(line, panelTheme) {
    const wrap = document.createElement('div');
    wrap.className = `body-feature-row body-feature-${panelTheme}`;

    const idx = line.search(/[：:]/);
    const label = document.createElement('div');
    label.className = 'body-feature-label';
    label.textContent = idx >= 0 ? line.slice(0, idx).trim() : '身体特征';
    wrap.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'body-feature-grid';

    const raw = idx >= 0 ? line.slice(idx + 1).trim() : line;
    raw.split(/[|｜]/).map(part => part.trim()).filter(Boolean).forEach(part => {
      const item = document.createElement('div');
      item.className = 'body-feature-item';

      const m = part.match(/^(.+?)[：:]\s*(.+)$/);
      if (m) {
        const itemLabel = document.createElement('span');
        itemLabel.className = 'body-feature-item-label';
        itemLabel.textContent = m[1].trim();
        const itemValue = document.createElement('span');
        itemValue.className = 'body-feature-item-value';
        itemValue.textContent = m[2].trim();
        item.appendChild(itemLabel);
        item.appendChild(itemValue);
      } else {
        item.textContent = part;
      }

      grid.appendChild(item);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  // 竖线分隔的药丸行（基本信息）
  _renderPillRow(line) {
    const row = document.createElement('div');
    row.className = 'panel-pill-row';
    line.split(/[|｜]/).map(p => p.trim()).filter(Boolean).forEach(part => {
      const pill = document.createElement('span');
      pill.className = 'panel-pill';
      pill.textContent = part;
      row.appendChild(pill);
    });
    return row;
  }

  // 标签 badge 行（性格）
  _renderBadgeRow(label, value) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-badge-row';
    if (label) {
      const lbl = document.createElement('div');
      lbl.className = 'panel-badge-label';
      lbl.textContent = label;
      wrap.appendChild(lbl);
    }
    const badges = document.createElement('div');
    badges.className = 'panel-badges';
    value.split(/[、,，]/).map(t => t.trim()).filter(Boolean).forEach(tag => {
      const b = document.createElement('span');
      b.className = 'panel-badge';
      b.textContent = tag;
      badges.appendChild(b);
    });
    wrap.appendChild(badges);
    return wrap;
  }

  // 数值条行（解析 "❤️好感:75/100 | 🔥欲望:20/100 ｜💕阶段:暧昧"）
  _renderStatRow(text) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-stats';
    text.split(/[|｜]/).map(p => p.trim()).filter(Boolean).forEach(part => {
      const m = part.match(/(.+?)[：:]\s*(-?\d+)\/(\d+)/);
      if (m) {
        wrap.appendChild(this._renderStatBar(m[1].trim(), +m[2], +m[3]));
      } else {
        // 非数字部分，如 "💕阶段:暧昧"
        const sm = part.match(/(.+?)[：:]\s*(.+)/);
        if (sm) {
          const row = document.createElement('div');
          row.className = 'panel-stat-text';
          const lbl = document.createElement('span');
          lbl.className = 'stat-text-label';
          const labelText = sm[1].trim() === '💕阶段' ? '💕关系' : sm[1].trim();
          lbl.textContent = labelText;
          const val = document.createElement('span');
          val.className = 'stat-text-value';
          val.textContent = sm[2].trim();
          row.appendChild(lbl);
          row.appendChild(val);
          wrap.appendChild(row);
        }
      }
    });
    return wrap;
  }

  // 单条数值进度条
  _renderStatBar(label, val, max, colorHint) {
    if (!colorHint) colorHint = this._statColor(label);
    const pct = Math.min(100, Math.max(0, (val / (max || 100)) * 100));

    const row   = document.createElement('div');
    row.className = 'stat-row';

    const lbl   = document.createElement('span');
    lbl.className = 'stat-label';
    lbl.textContent = label;

    const track = document.createElement('div');
    track.className = 'stat-track';
    const fill  = document.createElement('div');
    fill.className = `stat-fill stat-${colorHint}`;
    fill.style.width = pct + '%';
    track.appendChild(fill);

    const num   = document.createElement('span');
    num.className = 'stat-value';
    num.textContent = val;

    row.appendChild(lbl);
    row.appendChild(track);
    row.appendChild(num);
    return row;
  }

  _statColor(label) {
    if (label.includes('好感') || label.includes('❤') || label.includes('💓')) return 'love';
    if (label.includes('欲望') || label.includes('🔥')) return 'desire';
    if (label.includes('警惕') || label.includes('⚠')) return 'warning';
    if (label.includes('理智') || label.includes('⚖')) return 'sanity';
    if (label.includes('体能') || label.includes('💪')) return 'stamina';
    if (label.includes('精力') || label.includes('⚡')) return 'energy';
    return 'default';
  }

  // ── 记忆区渲染 ────────────────────────────────────────────

  _renderMemory(content) {
    const wrap = document.createElement('div');
    wrap.className = 'memory-container';

    let currentHeader  = null;
    let currentEntries = [];

    const flush = () => {
      if (!currentHeader && !currentEntries.length) return;
      const group = document.createElement('div');
      group.className = 'memory-group';

      if (currentHeader) {
        const h = document.createElement('div');
        h.className = 'memory-group-header';
        h.textContent = currentHeader;
        group.appendChild(h);
      }

      currentEntries.forEach(entry => {
        const el = document.createElement('div');
        el.className = 'memory-entry';
        if (entry.startsWith('🔥'))      el.classList.add('memory-key');
        else if (entry.startsWith('📜')) el.classList.add('memory-long');
        else if (entry.startsWith('🔸')) el.classList.add('memory-short');
        el.textContent = entry;
        group.appendChild(el);
      });

      if (group.children.length) wrap.appendChild(group);
      currentHeader  = null;
      currentEntries = [];
    };

    content.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      // 分组标题：关键事件 X/50 / 长期记忆 X/8 / 短期记忆 X/7
      if (/^(关键事件|长期记忆|短期记忆)/.test(line)) {
        flush();
        currentHeader = line;
      } else if (line.startsWith('🔥') || line.startsWith('📜') || line.startsWith('🔸')) {
        currentEntries.push(line);
      } else {
        currentEntries.push(line);
      }
    });

    flush();

    if (!wrap.children.length) {
      const empty = document.createElement('div');
      empty.className = 'memory-empty';
      empty.textContent = '暂无记忆记录';
      wrap.appendChild(empty);
    }

    return wrap;
  }

  // ── 行动建议 ─────────────────────────────────────────────

  _parseActionButtons(text) {
    const sections = this._parseSections(text);
    let candidate = '';

    const delimRe = this._sectionDelimRe();
    const parts = [];
    let lastIndex = 0;
    let lastTitle = null;
    let match;
    while ((match = delimRe.exec(text)) !== null) {
      if (lastTitle !== null) {
        parts.push({ title: lastTitle, content: text.slice(lastIndex, match.index).trim() });
      }
      lastTitle = match[1].trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastTitle !== null) {
      parts.push({ title: lastTitle, content: text.slice(lastIndex).trim() });
    }

    const suggestionPart = parts.find(part => part.title === '建议' || part.title === '行动建议');
    if (suggestionPart) {
      candidate = suggestionPart.content;
    } else {
      const fallbackMatch = text.match(/(?:^|\n)\s*[A-D][\s).．、：:]+.+/m);
      if (fallbackMatch) {
        const start = fallbackMatch.index ?? 0;
        candidate = text.slice(start);
      }
    }

    if (!candidate && sections?.main) return [];

    const options  = [];
    const lineRe   = /^\s*(?:[-*]\s*)?([A-D])(?:\s*[\).．、：:]|\s+)\s*(.+)$/gm;
    let m;
    while ((m = lineRe.exec(candidate)) !== null) {
      const raw = m[2].trim();
      if (/^自定义行动/.test(raw)) continue;
      options.push({ key: m[1], text: raw });
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
    // 最多显示2条建议（A/B）
    const shown = options.slice(0, 2);
    shown.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      // 剥除 markdown 符号，保留纯文字
      const clean = opt.text
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1');
      btn.innerHTML = `<span class="action-key">${opt.key}.</span><span class="action-text">${this._escapeHtml(clean)}</span>`;
      btn.addEventListener('click', () => {
        this.playerInput.value = `${opt.key}. ${opt.text}`;
        // 不 focus() 避免移动端键盘弹起，直接触发发送
        document.getElementById('submit-btn').click();
      });
      this.actionButtons.appendChild(btn);
    });
  }

  // ── 文本格式化（支持 Markdown） ───────────────────────────

  /**
   * 渲染行内 Markdown：***加粗斜体*** / **加粗** / *斜体* / `代码`
   * 输入为普通文本（未转义），内部自行转义再处理
   */
  _renderInline(text) {
    let s = this._escapeHtml(text);
    s = s.replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g,       '<strong>$1</strong>');
    s = s.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    s = s.replace(/`([^`\n]+)`/g,         '<code class="md-code">$1</code>');
    return s;
  }

  /**
   * 把 LLM 输出的全文转换为 HTML，逐行处理：
   * - 只渲染【正文】节（或尚未遇到任何节分隔符时）的内容
   * - 其余节（游戏面板、NPC面板、建议、记忆等）的内容全部跳过，
   *   它们在流式结束后以卡片 / 按钮形式单独渲染
   */
  _formatGameText(text) {
    // null = 尚未遇到节分隔符，视为正文区
    const SHOW_SECTIONS = new Set(['正文', '正文内容']);
    let currentSection = null;

    const out = [];
    for (const line of text.split('\n')) {
      const t = line.trim();

      // 分隔线标题：——【X】——
      const dm = t.match(/^[-—─]{2,}\s*[【\[]([^\]】]{1,30})[】\]]\s*[-—─]{2,}$/);
      if (dm) {
        currentSection = dm[1].trim();
        continue; // 标题行本身不输出
      }

      // 只保留【正文】节（或首个分隔符出现前的内容）
      const inShowSection = currentSection === null || SHOW_SECTIONS.has(currentSection);
      if (!inShowSection) continue;

      // 行动建议选项行（A. / B. 等）由按钮渲染，这里跳过
      if (/^[A-D]\s*[.．、]/.test(t)) continue;

      // 裸露的记忆/数值行不要落到正文里
      if (this._shouldHideFromMain(t)) continue;

      // ATX 标题：# / ## / ###
      const hm = t.match(/^(#{1,3})\s+(.+)$/);
      if (hm) {
        out.push(`<span class="md-h${hm[1].length}">${this._renderInline(hm[2])}</span>`);
        continue;
      }

      // 横线：--- / *** / ___（3个以上相同字符）
      if (/^([-*_])\1{2,}$/.test(t)) {
        out.push('<span class="md-hr"></span>');
        continue;
      }

      // 无序列表：- item / * item（行首可有缩进）
      const lm = line.match(/^[ \t]*[-*]\s+(.+)$/);
      if (lm) {
        out.push(`<span class="md-li">${this._renderInline(lm[1])}</span>`);
        continue;
      }

      // 普通行
      out.push(this._renderInline(line));
    }

    return out.join('<br>');
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _syncRawStreamingBlock(text) {
    if (!this._rawEntries.length) this._rawEntries.push('');
    this._rawEntries[this._rawEntries.length - 1] = text || '';
    this._syncRawPanel();
  }

  _syncRawPanel() {
    if (!this.rawInner) return;
    this.rawInner.textContent = this._rawEntries.filter(Boolean).join('\n\n');
  }

  setDebugCompareMode(enabled) {
    if (this.rawPanel) {
      this.rawPanel.classList.toggle('hidden', !enabled);
    }
    document.getElementById('game-body')?.classList.toggle('debug-split', !!enabled);
  }

  // ── 回合重绘 ──────────────────────────────────────────────

  renderRound(round) {
    this.outputInner.innerHTML = '';
    this.actionButtons.innerHTML = '';
    this.actionButtons.classList.add('hidden');
    this.cursor.style.display = 'none';
    this._rawEntries = [];

    if (round.userInput) this.appendUserMessage(round.userInput);
    this._rawEntries.push(round.assistantOutput);

    const sections = this._parseSections(round.assistantOutput);

    const div = document.createElement('div');
    div.className = 'msg-ai';
    div.innerHTML = this._formatGameText(sections.main || round.assistantOutput);
    this.outputInner.appendChild(div);

    if (sections.panels.length) this._renderPanelsInline(sections.panels);
    this._renderActionButtons(this._parseActionButtons(round.assistantOutput));
    this._syncRawPanel();
    this.scrollToBottom();
  }

  // ── 工具方法 ─────────────────────────────────────────────

  _shouldStickToBottom() {
    const threshold = 36;
    return this.outputArea.scrollHeight - this.outputArea.scrollTop - this.outputArea.clientHeight < threshold;
  }

  scrollToBottom(force = false) {
    if (force) this.outputArea.scrollTop = this.outputArea.scrollHeight;
  }

  setLoading(loading) {
    this.submitBtn.disabled = false;
    this.submitBtn.classList.toggle('submit-stop', loading);
    this.submitBtn.innerHTML = loading ? '<span class="stop-icon" aria-hidden="true"></span>' : '发送';
    if (!loading) this.playerInput.focus();
  }

  clearOutput() {
    this.outputInner.innerHTML = '';
    this.actionButtons.innerHTML = '';
    this.actionButtons.classList.add('hidden');
    this.cursor.style.display = 'none';
    this._rawEntries = [];
    this._syncRawPanel();
  }

  renderHistory(history) {
    this.clearOutput();
    history.forEach(msg => {
      if (msg.role === 'user') {
        this.appendUserMessage(msg.content);
      } else if (msg.role === 'assistant') {
        this._rawEntries.push(msg.displayContent || msg.content);
        const assistantText = msg.displayContent || msg.content;
        const sections = this._parseSections(assistantText);
        const div = document.createElement('div');
        div.className = 'msg-ai';
        div.innerHTML = this._formatGameText(sections.main || assistantText);
        this.outputInner.appendChild(div);
        if (sections.panels.length) this._renderPanelsInline(sections.panels);
      }
    });
    this._syncRawPanel();
    const lastAI = [...history].reverse().find(m => m.role === 'assistant');
    if (lastAI) {
      this._renderActionButtons(this._parseActionButtons(lastAI.displayContent || lastAI.content));
    }
    this.scrollToBottom();
  }
}

let ui;
