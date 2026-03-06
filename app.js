/**
 * 小元拆书 · 核心应用逻辑 v2.0
 * Agent A (前端交互层) ↔ Agent B (内容导师) 通信协议实现
 * 新增：打字机效果、本地存储、用户观点填写、更丰富交互
 */

// ===== 全局状态 =====
const STATE = {
  currentBook: '',
  bookData: null,
  levels: [],
  currentLevel: 0,
  completedLevels: new Set(),
  orbs: [],
  messages: [],
  declaration: '',
  isTyping: false,
};

// ===== 协议标签解析器（Agent B → Agent A） =====
const ProtocolParser = {
  parse(text) {
    const actions = [];
    const levelInitMatch = text.match(/\[LEVEL_INIT:\s*({[\s\S]*?})\]/);
    if (levelInitMatch) {
      try { actions.push({ type: 'LEVEL_INIT', data: JSON.parse(levelInitMatch[1]) }); } catch(e) {}
    }
    if (text.includes('[UI_ACTION: FLY_ORB]')) actions.push({ type: 'FLY_ORB' });
    if (text.includes('[CMD: NEXT_CHAPTER]')) actions.push({ type: 'NEXT_CHAPTER' });
    return actions;
  }
};

// ===== DOM 工具 =====
const $ = id => document.getElementById(id);
const showScreen = id => {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  $(id).style.display = 'flex';
  $(id).classList.add('active');
};

// ===== 打字机效果 =====
async function typewriterEffect(el, text, speed = 18) {
  el.textContent = '';
  el.classList.add('typing');
  STATE.isTyping = true;
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    const container = $('chat-messages');
    container.scrollTop = container.scrollHeight;
    if (i % 3 === 0) await sleep(speed);
  }
  el.classList.remove('typing');
  STATE.isTyping = false;
}

// ===== 本地存储 =====
const Storage = {
  save() {
    try {
      const data = {
        currentBook: STATE.currentBook,
        currentLevel: STATE.currentLevel,
        completedLevels: [...STATE.completedLevels],
        orbs: STATE.orbs,
        declaration: STATE.declaration,
      };
      localStorage.setItem('xiaoyuan_state', JSON.stringify(data));
    } catch(e) {}
  },
  load() {
    try {
      const raw = localStorage.getItem('xiaoyuan_state');
      if (!raw) return null;
      const data = JSON.parse(raw);
      data.completedLevels = new Set(data.completedLevels || []);
      return data;
    } catch(e) { return null; }
  },
  clear() {
    localStorage.removeItem('xiaoyuan_state');
  }
};

// ===== 启动页逻辑 =====
function initLanding() {
  const searchInput = $('book-search-input');
  const searchBtn = $('search-btn');

  searchBtn.addEventListener('click', () => {
    const bookName = searchInput.value.trim();
    if (bookName) startBookSession(bookName);
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const bookName = searchInput.value.trim();
      if (bookName) startBookSession(bookName);
    }
  });

  document.querySelectorAll('.quick-book-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const book = btn.dataset.book;
      searchInput.value = book;
      startBookSession(book);
    });
  });

  // 检查是否有保存的进度
  const saved = Storage.load();
  if (saved && saved.currentBook) {
    showResumePrompt(saved);
  }
}

// ===== 显示继续阅读提示 =====
function showResumePrompt(saved) {
  const existingPrompt = document.querySelector('.resume-prompt');
  if (existingPrompt) existingPrompt.remove();

  const prompt = document.createElement('div');
  prompt.className = 'resume-prompt';
  prompt.innerHTML = `
    <div class="resume-card">
      <div class="resume-icon">📖</div>
      <div class="resume-info">
        <div class="resume-title">继续上次阅读？</div>
        <div class="resume-book">《${saved.currentBook}》· Level ${saved.currentLevel} / ${saved.completedLevels.size} 关已完成</div>
      </div>
      <div class="resume-actions">
        <button class="resume-continue-btn" id="resume-continue">继续阅读</button>
        <button class="resume-discard-btn" id="resume-discard">重新开始</button>
      </div>
    </div>
  `;

  const landingContent = document.querySelector('.landing-content');
  landingContent.appendChild(prompt);

  $('resume-continue').addEventListener('click', () => {
    prompt.remove();
    resumeSession(saved);
  });
  $('resume-discard').addEventListener('click', () => {
    Storage.clear();
    prompt.remove();
  });
}

// ===== 恢复上次会话 =====
async function resumeSession(saved) {
  STATE.currentBook = saved.currentBook;
  STATE.bookData = findBookData(saved.currentBook);
  STATE.levels = STATE.bookData.levels;
  STATE.currentLevel = saved.currentLevel;
  STATE.completedLevels = saved.completedLevels;
  STATE.orbs = saved.orbs || [];
  STATE.declaration = saved.declaration || '';

  showScreen('main-screen');
  initMainScreen(saved.currentBook, STATE.bookData, true);
}

// ===== 书籍初始化流程 =====
async function startBookSession(bookName) {
  // 重置加载步骤文字
  const stepTexts = ['📚 全书语料扫描', '🧩 逻辑结构拆解', '🗺️ 关卡地图生成', '⚡ 2026 实时补丁加载'];
  ['step1','step2','step3','step4'].forEach((id, i) => {
    const el = $(id);
    el.classList.remove('active', 'done');
    el.textContent = stepTexts[i];
  });
  await startBookSessionWithAgent(bookName);
}

// ===== 主界面初始化 =====
function initMainScreen(bookName, bookData, isResume) {
  $('nav-book-title').textContent = `《${bookName}》`;
  $('level-total').textContent = STATE.levels.length;
  updateLevelStatus();
  renderLevelMap();

  $('chat-messages').innerHTML = '';
  $('orb-gallery').innerHTML = '<div class="orb-empty">通关章节后，知识结晶将在这里闪耀✨</div>';
  $('declaration-display').style.display = 'none';
  $('declaration-input').style.display = 'block';
  $('save-declaration').textContent = '✍️ 立下宣言';
  $('save-declaration').style.background = '';

  if (isResume) {
    // 恢复结晶仓库
    STATE.orbs.forEach(orb => addOrbToGallery(orb, false));
    // 恢复宣言
    if (STATE.declaration) {
      showDeclarationDisplay(STATE.declaration);
    }
    appendSystemMsg(`📖 欢迎回来！继续《${bookName}》的知识冒险，当前进度：Level ${STATE.currentLevel}`);
    setTimeout(() => loadLevelContent(STATE.currentLevel, bookData), 600);
  } else {
    appendSystemMsg(`🎮 《${bookName}》已完成拆解！共 ${STATE.levels.length} 关，准备开始你的知识冒险！`);
    setTimeout(() => loadLevelContent(1, bookData), 600);
  }
}

// ===== 加载关卡内容 =====
function loadLevelContent(levelId, bookData) {
  const level = STATE.levels.find(l => l.id === levelId);
  if (!level) return;

  appendSystemMsg(`━━━ Level ${levelId}：${level.name} ━━━`);

  const content = bookData && bookData.levelContent && bookData.levelContent[levelId - 1];

  if (content) {
    setTimeout(() => appendAuthorCard(content.authorText, content.analogy), 400);
    setTimeout(() => appendAIPatchCard(content.aiPatch), 1400);
    setTimeout(() => appendThinkingField(content.thinking, levelId), 2400);
  } else {
    setTimeout(() => {
      appendAuthorCard(
        `这是《${STATE.currentBook}》第 ${levelId} 关的核心内容。作者在此章节深入探讨了本书的关键论点，通过层层递进的逻辑结构，引导读者建立完整的认知框架。`,
        `🌰 举个例子：就像学骑自行车，光看教程没用，必须亲自上车感受平衡。本章的知识也是如此——理论只是起点，实践才能真正内化。`
      );
    }, 400);
    setTimeout(() => {
      appendAIPatchCard(`⚡ 2026 年实证：本章涉及的概念在近两年有了新的发展。AI 技术的快速迭代让相关领域出现了全新的应用场景，作者当年的预测有些已经提前实现，有些则需要修正。`);
    }, 1400);
    setTimeout(() => {
      appendThinkingField({
        author: '作者在本章建立了核心论证框架，通过层层递进的逻辑，引导读者突破固有认知边界。',
        ai: '⚡ 2026 补丁：这一领域在过去两年发生了显著变化，新的研究和实践案例正在验证或挑战作者的核心论点。',
        userPrompt: '读完这一章，你有什么感受？有哪些观点让你觉得「原来如此」，又有哪些让你想反驳？'
      }, levelId);
    }, 2400);
  }
}

// ===== 消息渲染函数 =====
function appendAuthorCard(text, analogy) {
  const el = document.createElement('div');
  el.className = 'msg-card author-card';
  el.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">✍️</div>
      <span class="card-name">作者原意</span>
      <span class="card-tag">[作者原文]</span>
    </div>
    <div class="card-body">
      <p class="card-main-text"></p>
      ${analogy ? `<div class="analogy">${analogy}</div>` : ''}
    </div>
  `;
  appendMessage(el);
  // 打字机效果
  const textEl = el.querySelector('.card-main-text');
  typewriterEffect(textEl, text, 15);
}

function appendAIPatchCard(text) {
  const el = document.createElement('div');
  el.className = 'msg-card ai-patch-card';
  el.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">⚡</div>
      <span class="card-name">小元 AI</span>
      <span class="card-tag">[AI 观点]</span>
      <span class="patch-year-badge">2026 实时补丁</span>
    </div>
    <div class="card-body">
      <p class="card-main-text"></p>
    </div>
  `;
  appendMessage(el);
  const textEl = el.querySelector('.card-main-text');
  typewriterEffect(textEl, text, 12);
}

function appendThinkingField(thinking, levelId) {
  const el = document.createElement('div');
  el.className = 'msg-card author-card thinking-card';
  el.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">🧠</div>
      <span class="card-name">三方思维场</span>
      <span class="card-tag">[多维视角]</span>
    </div>
    <div class="thinking-field">
      <div class="thinking-field-title">💡 同一问题，三种视角</div>
      <div class="thinking-row">
        <div class="thinking-col col-author">
          <div class="col-label">📖 作者原意</div>
          <div class="col-text">${thinking.author}</div>
        </div>
        <div class="thinking-col col-ai">
          <div class="col-label">⚡ 2026 补丁</div>
          <div class="col-text">${thinking.ai}</div>
        </div>
        <div class="thinking-col col-user">
          <div class="col-label">💬 你的观点</div>
          <div class="col-text user-thinking-prompt">${thinking.userPrompt || thinking.user || '你怎么看？'}</div>
          <textarea class="user-thinking-input" placeholder="写下你的想法..." rows="2" data-level="${levelId}"></textarea>
          <button class="user-thinking-submit">💬 提交观点</button>
        </div>
      </div>
    </div>
  `;
  appendMessage(el);

  // 绑定用户观点提交
  const submitBtn = el.querySelector('.user-thinking-submit');
  const textarea = el.querySelector('.user-thinking-input');
  submitBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    textarea.style.display = 'none';
    submitBtn.style.display = 'none';
    const promptEl = el.querySelector('.user-thinking-prompt');
    promptEl.textContent = `"${text}"`;
    promptEl.style.color = '#a78bfa';
    promptEl.style.fontStyle = 'italic';
    appendAIReplyCard(`💬 你的观点很有意思！「${text.substring(0, 30)}${text.length > 30 ? '...' : ''}」\n\n这正是三方思维场的价值所在——每个读者都有独特的视角。你的思考已经超越了被动接受，开始主动构建自己的知识框架了！`);
  });
}

function appendUserCard(text) {
  const el = document.createElement('div');
  el.className = 'msg-card user-card';
  el.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">👤</div>
      <span class="card-name">我</span>
    </div>
    <div class="card-body"><p>${escapeHtml(text)}</p></div>
  `;
  appendMessage(el);
}

function appendAIReplyCard(text) {
  const el = document.createElement('div');
  el.className = 'msg-card ai-patch-card';
  el.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">⚡</div>
      <span class="card-name">小元 AI</span>
      <span class="card-tag">[回复]</span>
    </div>
    <div class="card-body"><p class="card-main-text"></p></div>
  `;
  appendMessage(el);
  const textEl = el.querySelector('.card-main-text');
  typewriterEffect(textEl, text, 12);
}

function appendSummaryOrb(orbData) {
  const el = document.createElement('div');
  el.className = 'msg-card summary-orb-card';
  el.innerHTML = `
    <div class="orb-card-icon">💎</div>
    <div class="orb-card-title">知识结晶 · ${orbData.title}</div>
    <div class="orb-card-content">${orbData.content}</div>
    <div class="orb-card-tags">
      ${orbData.tags.map(t => `<span class="orb-tag">${t}</span>`).join('')}
    </div>
  `;
  appendMessage(el);
  setTimeout(() => triggerFlyOrb(el), 400);
}

function appendSystemMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg-card system-card';
  el.innerHTML = `<div class="card-body">${text}</div>`;
  appendMessage(el);
}

function appendMessage(el) {
  const container = $('chat-messages');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ===== 关卡推进逻辑 =====
function completeCurrentLevel() {
  const levelId = STATE.currentLevel;
  if (STATE.completedLevels.has(levelId)) return;

  STATE.completedLevels.add(levelId);

  const content = STATE.bookData && STATE.bookData.levelContent && STATE.bookData.levelContent[levelId - 1];

  const orbData = content ? {
    title: content.orbTitle,
    content: content.orbContent,
    tags: content.orbTags,
    levelId,
    levelName: STATE.levels[levelId - 1]?.name || `Level ${levelId}`,
  } : {
    title: `Level ${levelId} · 知识结晶`,
    content: `完成了《${STATE.currentBook}》第 ${levelId} 关的学习。核心要点已内化，知识框架逐步成型。`,
    tags: [`Level ${levelId}`, STATE.currentBook.substring(0, 8)],
    levelId,
    levelName: STATE.levels[levelId - 1]?.name || `Level ${levelId}`,
  };

  appendSummaryOrb(orbData);
  STATE.orbs.push(orbData);
  addOrbToGallery(orbData, true);

  // 里程碑提示
  const completed = STATE.completedLevels.size;
  const total = STATE.levels.length;
  if (completed === Math.floor(total / 4)) appendMilestone(`🌟 已完成 25%！你已经入门了！`);
  else if (completed === Math.floor(total / 2)) appendMilestone(`🔥 已完成 50%！过半了，势不可挡！`);
  else if (completed === Math.floor(total * 3 / 4)) appendMilestone(`⚡ 已完成 75%！终点就在眼前！`);

  const nextLevel = levelId + 1;
  if (nextLevel <= STATE.levels.length) {
    STATE.currentLevel = nextLevel;
    updateLevelStatus();
    renderLevelMap();
    // 关卡完成闪光
    highlightJustCompleted(levelId);
    Storage.save();
    setTimeout(() => loadLevelContent(nextLevel, STATE.bookData), 1800);
  } else {
    // 全书通关！
    STATE.currentLevel = STATE.levels.length;
    updateLevelStatus();
    renderLevelMap();
    Storage.save();
    setTimeout(() => {
      triggerCompletionCelebration();
    }, 1200);
  }
}

// ===== 里程碑提示 =====
function appendMilestone(text) {
  const el = document.createElement('div');
  el.className = 'msg-card system-card milestone-card';
  el.innerHTML = `<div class="card-body">${text}</div>`;
  appendMessage(el);
}

// ===== 关卡完成闪光 =====
function highlightJustCompleted(levelId) {
  setTimeout(() => {
    const items = document.querySelectorAll('.level-item');
    items.forEach(item => {
      const dot = item.querySelector('.level-dot');
      if (dot && dot.textContent === '✓') {
        // 找到刚完成的那个
        const name = item.querySelector('.level-name')?.textContent;
        const level = STATE.levels.find(l => l.name === name && l.id === levelId);
        if (level) {
          item.classList.add('just-completed');
          setTimeout(() => item.classList.remove('just-completed'), 1000);
        }
      }
    });
  }, 100);
}

// ===== 全书通关庆祝 =====
function triggerCompletionCelebration() {
  // 烟花效果
  launchConfetti();
  // 通关横幅
  const el = document.createElement('div');
  el.className = 'msg-card completion-banner';
  el.innerHTML = `
    <div class="banner-icon">🎊</div>
    <div class="banner-title">恭喜通关！《${STATE.currentBook}》已完全拆解！</div>
    <div class="banner-sub">
      你已完成全部 ${STATE.levels.length} 关，收获了 ${STATE.orbs.length} 枚知识结晶。<br>
      知识已经液化，流入你的认知血液。<br><br>
      📜 现在，写下你的<strong style="color:var(--accent-purple)">生存宣言</strong>，让这次阅读留下永久印记。
    </div>
  `;
  appendMessage(el);
  // 滚动到宣言区域
  setTimeout(() => {
    const declSection = document.querySelector('.declaration-section');
    if (declSection) declSection.scrollIntoView({ behavior: 'smooth' });
  }, 1000);
}

// ===== 烟花特效 =====
function launchConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.8}s;
    `;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 4000);
}

// ===== 状态更新 =====
function updateLevelStatus() {
  const current = Math.min(STATE.currentLevel, STATE.levels.length);
  const total = STATE.levels.length;
  const completed = STATE.completedLevels.size;

  $('level-current').textContent = current;
  $('level-total').textContent = total;
  $('level-progress-fill').style.width = `${(completed / total) * 100}%`;
  $('completed-count').textContent = `${completed}/${total}`;
  $('orb-count').textContent = STATE.orbs.length;
  $('orb-gallery-count').textContent = STATE.orbs.length;
}

// ===== 关卡地图渲染 =====
function renderLevelMap() {
  const container = $('level-map');
  container.innerHTML = '';

  STATE.levels.forEach(level => {
    const isCompleted = STATE.completedLevels.has(level.id);
    const isCurrent = level.id === STATE.currentLevel;
    const isLocked = !isCompleted && !isCurrent;

    const el = document.createElement('div');
    el.className = `level-item ${isCompleted ? 'completed' : isCurrent ? 'current' : 'locked'}`;
    el.innerHTML = `
      <div class="level-dot">${isCompleted ? '✓' : level.id}</div>
      <div class="level-info">
        <div class="level-name">${level.name}</div>
        <div class="level-status-text">${isCompleted ? '✅ 已解锁' : isCurrent ? '▶ 进行中' : '🔒 未解锁'}</div>
      </div>
    `;

    if (isCurrent) {
      el.addEventListener('click', () => {
        $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
      });
    } else if (isCompleted) {
      el.addEventListener('click', () => {
        appendSystemMsg(`📖 跳转到 Level ${level.id}：${level.name}`);
        setTimeout(() => loadLevelContent(level.id, STATE.bookData), 300);
      });
    }

    container.appendChild(el);
  });
}

// ===== 结晶仓库 =====
function addOrbToGallery(orbData, animate) {
  const gallery = $('orb-gallery');
  const empty = gallery.querySelector('.orb-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'orb-item' + (animate ? ' orb-item-new' : '');
  el.innerHTML = `
    <div class="orb-item-icon">💎</div>
    <div class="orb-item-info">
      <div class="orb-item-title">${orbData.title}</div>
      <div class="orb-item-level">Level ${orbData.levelId} · ${orbData.levelName.substring(0, 14)}${orbData.levelName.length > 14 ? '...' : ''}</div>
    </div>
  `;
  el.addEventListener('click', () => showOrbModal(orbData));
  gallery.appendChild(el);
}

function showOrbModal(orbData) {
  const modal = $('orb-modal');
  const body = $('orb-modal-body');
  body.innerHTML = `
    <div class="orb-modal-item">
      <div class="orb-modal-item-title">💎 ${orbData.title}</div>
      <div class="orb-modal-item-level">Level ${orbData.levelId} · ${orbData.levelName}</div>
      <div class="orb-modal-item-content">${orbData.content}</div>
      <div class="orb-card-tags" style="margin-top:10px">
        ${orbData.tags.map(t => `<span class="orb-tag">${t}</span>`).join('')}
      </div>
    </div>
  `;
  modal.style.display = 'flex';
}

// ===== 飞入动画 =====
function triggerFlyOrb(sourceEl) {
  const flyOrb = $('fly-orb');
  const srcRect = sourceEl.getBoundingClientRect();
  const btnRect = $('orb-gallery-btn').getBoundingClientRect();

  flyOrb.style.left = `${srcRect.left + srcRect.width / 2}px`;
  flyOrb.style.top = `${srcRect.top + 20}px`;
  flyOrb.style.opacity = '1';
  flyOrb.classList.remove('flying');

  const deltaX = btnRect.left - srcRect.left;
  const deltaY = btnRect.top - srcRect.top;

  const styleId = 'fly-anim-style';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @keyframes flyToGallery {
      0% { opacity: 1; transform: translate(0, 0) scale(1.5); }
      100% { opacity: 0; transform: translate(${deltaX}px, ${deltaY}px) scale(0.2); }
    }
  `;

  void flyOrb.offsetWidth;
  flyOrb.classList.add('flying');
  setTimeout(() => {
    flyOrb.classList.remove('flying');
    flyOrb.style.opacity = '0';
  }, 900);
}

// ===== 用户输入处理 =====
function handleUserInput(text) {
  if (!text.trim()) return;
  appendUserCard(text);
  $('user-input').value = '';

  const passKeywords = ['懂了', '明白了', '理解了', '继续', '下一关', '过关', '知道了', '好的', 'ok', 'OK', '下一章', '继续吧', '明白', '懂', '会了', '学会了'];
  const isPass = passKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));

  if (isPass) {
    setTimeout(() => {
      appendAIReplyCard('👍 太棒了！你已掌握本关核心知识，正在为你生成知识结晶...');
      setTimeout(() => completeCurrentLevel(), 800);
    }, 300);
    return;
  }

  if (text.includes('举例') || text.includes('例子') || text.includes('案例') || text.includes('比喻') || text.includes('比如')) {
    setTimeout(() => generateExample(), 300);
    return;
  }

  if (text.includes('杠') || text.includes('不对') || text.includes('反驳') || text.includes('质疑') || text.includes('不同意') || text.includes('但是') || text.includes('不认同')) {
    setTimeout(() => generateArgueResponse(text), 300);
    return;
  }

  if (text.includes('总结') || text.includes('归纳') || text.includes('要点') || text.includes('核心')) {
    setTimeout(() => generateSummary(), 300);
    return;
  }

  setTimeout(() => generateAIReply(text), 300);
}

function generateExample() {
  const levelId = STATE.currentLevel;
  const level = STATE.levels[levelId - 1];
  const examples = [
    `🌰 再举一个更接地气的例子：想象你去超市买东西，传统方式是你把钱给收银员，收银员记账。而区块链的方式是：你和收银员的交易被广播给所有在场的顾客，每个人都在自己的本子上记下这笔账。想伪造？除非你能同时修改所有人的本子。`,
    `🌰 换个角度理解：就像微信朋友圈——你发的内容大家都能看到，而且有截图为证，你删了也没用。这个「不可删除」的特性，正是本章核心概念的生活化体现。`,
    `🌰 生活化类比：就像你在公证处公证了一份合同，全国各地都有备份，任何一方想单方面修改都不可能。本章的核心机制，就是把这个「公证」逻辑推向了极致。`,
    `🌰 更直白的说法：想象一个没有裁判的球赛，但规则写进了每个球员的基因里——违规就自动失效。本章讲的，就是如何把「规则」内化到系统本身，而不是依赖外部执行者。`,
  ];
  const reply = examples[Math.floor(Math.random() * examples.length)];
  appendAIReplyCard(`关于「${level?.name || '本关内容'}」，我再给你举个例子：\n\n${reply}`);
}

function generateArgueResponse(text) {
  const responses = [
    `⚔️ 好问题！你的质疑很有价值。确实，这个观点存在争议。反方的核心论点是：技术本身是中性的，但谁来控制技术、谁来制定规则，才是真正的权力博弈。作者的乐观预测建立在「技术理性主义」的假设上，但现实中，政治和资本往往比技术跑得更快。你的怀疑是健康的批判性思维！`,
    `⚔️ 我喜欢你的杠精精神！这正是「三方思维场」的意义所在——没有任何观点是绝对正确的。你说的矛盾点确实存在：理想与现实之间总有鸿沟。不过作者的论证逻辑是：即使实现路径曲折，方向本身是正确的。你怎么看待「方向正确但路径艰难」这个命题？`,
    `⚔️ 反驳得好！补充一个数据视角：很多技术预测在短期内都被高估，在长期内被低估（Gartner 炒作曲线）。你的质疑可能在短期内是对的，但 5-10 年后呢？`,
    `⚔️ 这个反驳触及了本书最核心的张力：「应然」vs「实然」。作者描述的是「应该怎样」，而你质疑的是「现实中能做到吗」。这两个维度都很重要，缺一不可。`,
  ];
  appendAIReplyCard(responses[Math.floor(Math.random() * responses.length)]);
}

function generateSummary() {
  const levelId = STATE.currentLevel;
  const level = STATE.levels[levelId - 1];
  appendAIReplyCard(`📌 **Level ${levelId}：${level?.name}** 核心要点总结：\n\n1️⃣ 核心概念：本关最重要的认知框架已建立\n2️⃣ 大白话版本：通过生活化比喻理解了晦涩概念\n3️⃣ 2026 实证：了解了当前最新的发展现状\n4️⃣ 批判视角：从三方思维场看到了多维观点\n\n如果你已经理解，点「🚀 快捷过关」进入下一关！`);
}

function generateAIReply(text) {
  const levelId = STATE.currentLevel;
  const level = STATE.levels[levelId - 1];
  const replies = [
    `关于你提到的「${text.substring(0, 20)}${text.length > 20 ? '...' : ''}」，这是个很好的思考点。在本关「${level?.name}」的语境下，核心是要建立一个系统性的认知框架——把抽象概念锚定到具体场景中。你还有什么疑问吗？`,
    `你的问题触及了本章的核心矛盾。作者在书中用了大量篇幅论证这一点，但 2026 年的现实是：理论进步比预期快，但社会接受度比预期慢。这种时间差，正是当下最大的机会窗口。`,
    `这个问题很深刻！简单回答：任何知识体系都有其边界和假设前提。本书的价值在于：它给了你一张「思维地图」，让你在面对复杂问题时有框架可依，而不是凭感觉乱猜。`,
    `好问题！让我换个角度来解释：${level?.name} 的本质，是在解决一个「信任」或「协调」问题。当你理解了这个底层逻辑，你会发现它在很多领域都有类似的应用。`,
  ];
  appendAIReplyCard(replies[Math.floor(Math.random() * replies.length)]);
}

// ===== 快捷按钮 =====
function initQuickActions() {
  $('quick-next').addEventListener('click', () => {
    appendUserCard('懂了，下一关！');
    setTimeout(() => {
      appendAIReplyCard('👍 太棒了！正在生成知识结晶...');
      setTimeout(() => completeCurrentLevel(), 600);
    }, 300);
  });

  $('quick-example').addEventListener('click', () => {
    appendUserCard('能再举个例子吗？');
    setTimeout(() => generateExample(), 300);
  });

  $('quick-argue').addEventListener('click', () => {
    appendUserCard('我要杠一下，这个说法我不太认同...');
    setTimeout(() => generateArgueResponse('我要杠一下'), 300);
  });

  $('quick-summary').addEventListener('click', () => {
    appendUserCard('总结一下本关的核心要点');
    setTimeout(() => generateSummary(), 300);
  });
}

// ===== 发送消息 =====
function initSendBtn() {
  $('send-btn').addEventListener('click', () => {
    const text = $('user-input').value.trim();
    if (text) handleUserInput(text);
  });

  $('user-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = $('user-input').value.trim();
      if (text) handleUserInput(text);
    }
  });
}

// ===== 弹窗控制 =====
function initModals() {
  $('orb-modal-close').addEventListener('click', () => {
    $('orb-modal').style.display = 'none';
  });
  $('orb-modal').addEventListener('click', e => {
    if (e.target === $('orb-modal')) $('orb-modal').style.display = 'none';
  });
  $('orb-gallery-btn').addEventListener('click', () => {
    if (STATE.orbs.length === 0) {
      appendSystemMsg('💎 还没有结晶哦，完成关卡后结晶会自动生成！');
      return;
    }
    const modal = $('orb-modal');
    const body = $('orb-modal-body');
    body.innerHTML = STATE.orbs.map(orb => `
      <div class="orb-modal-item">
        <div class="orb-modal-item-title">💎 ${orb.title}</div>
        <div class="orb-modal-item-level">Level ${orb.levelId} · ${orb.levelName}</div>
        <div class="orb-modal-item-content">${orb.content}</div>
        <div class="orb-card-tags" style="margin-top:10px">
          ${orb.tags.map(t => `<span class="orb-tag">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');
    modal.style.display = 'flex';
  });
}

// ===== 生存宣言 =====
function initDeclaration() {
  $('save-declaration').addEventListener('click', () => {
    const text = $('declaration-input').value.trim();
    if (!text) return;
    STATE.declaration = text;
    Storage.save();
    showDeclarationDisplay(text);
    appendSystemMsg(`📜 你的生存宣言已立下："${text.substring(0, 40)}${text.length > 40 ? '...' : ''}" 愿它指引你前行！`);
  });
}

function showDeclarationDisplay(text) {
  $('declaration-display').textContent = text;
  $('declaration-display').style.display = 'block';
  $('declaration-input').style.display = 'none';
  $('save-declaration').textContent = '✅ 宣言已立下';
  $('save-declaration').style.background = 'linear-gradient(135deg, #065f46, #10b981)';

  // 添加编辑按钮（避免重复添加）
  const existingEdit = document.querySelector('.declaration-edit-btn');
  if (existingEdit) existingEdit.remove();

  const editBtn = document.createElement('button');
  editBtn.className = 'declaration-edit-btn';
  editBtn.textContent = '✏️ 修改宣言';
  editBtn.addEventListener('click', () => {
    $('declaration-input').value = text;
    $('declaration-input').style.display = 'block';
    $('declaration-display').style.display = 'none';
    $('save-declaration').textContent = '✍️ 立下宣言';
    $('save-declaration').style.background = '';
    editBtn.remove();
  });

  const declArea = document.querySelector('.declaration-area');
  declArea.appendChild(editBtn);
}

// ===== 移动端抽屉侧边栏 =====
function initMobileDrawer() {
  const btn = $('mobile-sidebar-btn');
  const sidebar = $('asset-sidebar');
  const overlay = $('drawer-overlay');
  if (!btn) return;

  const openDrawer = () => {
    sidebar.classList.add('drawer-open');
    overlay.classList.add('show');
  };
  const closeDrawer = () => {
    sidebar.classList.remove('drawer-open');
    overlay.classList.remove('show');
  };

  btn.addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeDrawer);
}

// ===== 返回按钮 =====
function initBackBtn() {
  $('back-to-landing').addEventListener('click', () => {
    Storage.save();
    showScreen('landing-screen');
    // 重置加载步骤
    const stepTexts = ['📚 全书语料扫描', '🧩 逻辑结构拆解', '🗺️ 关卡地图生成', '⚡ 2026 实时补丁加载'];
    ['step1','step2','step3','step4'].forEach((id, i) => {
      const el = $(id);
      el.classList.remove('active', 'done');
      el.textContent = stepTexts[i];
    });
    // 重新检查是否有保存进度
    const saved = Storage.load();
    if (saved && saved.currentBook) showResumePrompt(saved);
  });
}

// ===== 工具函数 =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== OpenClaw Agent 配置管理 =====
const OpenClawConfig = {
  STORAGE_KEY: 'xiaoyuan_openclaw_config',

  defaults() {
    return {
      enabled: false,
      fallback: true,
      timeout: 30,
      agentB: { url: '', id: '', key: '', mode: 'search' },
      agentC: { url: '', id: '', key: '', style: 'socratic', granularity: 'chapter' },
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? { ...this.defaults(), ...JSON.parse(raw) } : this.defaults();
    } catch(e) { return this.defaults(); }
  },

  save(cfg) {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg)); } catch(e) {}
  },

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  isConfigured() {
    const cfg = this.load();
    return cfg.enabled && cfg.agentB.url && cfg.agentC.url;
  },

  // 调用 Agent B 检索书籍
  async callAgentB(bookName) {
    const cfg = this.load();
    if (!cfg.enabled || !cfg.agentB.url) return null;

    const endpoint = cfg.agentB.id
      ? `${cfg.agentB.url.replace(/\/$/, '')}/${cfg.agentB.id}`
      : cfg.agentB.url;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (cfg.timeout || 30) * 1000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.agentB.key ? { 'Authorization': `Bearer ${cfg.agentB.key}` } : {}),
        },
        body: JSON.stringify({ book: bookName, mode: cfg.agentB.mode }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch(e) {
      console.warn('[OpenClaw] Agent B 调用失败:', e.message);
      return null;
    }
  },

  // 调用 Agent C 拆书
  async callAgentC(bookName, bookContent) {
    const cfg = this.load();
    if (!cfg.enabled || !cfg.agentC.url) return null;

    const endpoint = cfg.agentC.id
      ? `${cfg.agentC.url.replace(/\/$/, '')}/${cfg.agentC.id}`
      : cfg.agentC.url;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (cfg.timeout || 30) * 1000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.agentC.key ? { 'Authorization': `Bearer ${cfg.agentC.key}` } : {}),
        },
        body: JSON.stringify({
          book: bookName,
          content: bookContent,
          style: cfg.agentC.style,
          granularity: cfg.agentC.granularity,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch(e) {
      console.warn('[OpenClaw] Agent C 调用失败:', e.message);
      return null;
    }
  },

  // 测试连接
  async testConnection(agent) {
    const cfg = this.load();
    const agentCfg = agent === 'B' ? cfg.agentB : cfg.agentC;
    if (!agentCfg.url) return { ok: false, msg: '请先填写服务地址' };

    const endpoint = agentCfg.id
      ? `${agentCfg.url.replace(/\/$/, '')}/${agentCfg.id}/ping`
      : `${agentCfg.url.replace(/\/$/, '')}/ping`;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: agentCfg.key ? { 'Authorization': `Bearer ${agentCfg.key}` } : {},
        signal: controller.signal,
      });
      if (resp.ok) return { ok: true, msg: `✅ 连接成功 (${resp.status})` };
      return { ok: false, msg: `❌ HTTP ${resp.status}` };
    } catch(e) {
      if (e.name === 'AbortError') return { ok: false, msg: '❌ 连接超时（8s）' };
      return { ok: false, msg: `❌ ${e.message}` };
    }
  }
};

// ===== OpenClaw 配置弹窗 UI =====
function initOpenClawModal() {
  const modal = $('openclaw-modal');
  if (!modal) return;

  // 打开弹窗（导航栏按钮）
  const settingsBtn = $('settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => openOpenClawModal());

  // 打开弹窗（启动页按钮）
  const landingBtn = $('landing-settings-btn');
  if (landingBtn) landingBtn.addEventListener('click', () => openOpenClawModal());

  // 关闭弹窗
  $('openclaw-modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });

  // 测试 Agent B
  $('test-agent-b').addEventListener('click', async () => {
    saveFormToConfig();
    const resultEl = $('test-b-result');
    resultEl.className = 'test-result loading';
    resultEl.textContent = '⏳ 正在测试连接...';
    const res = await OpenClawConfig.testConnection('B');
    resultEl.className = `test-result ${res.ok ? 'success' : 'error'}`;
    resultEl.textContent = res.msg;
    updateStatusBar();
  });

  // 测试 Agent C
  $('test-agent-c').addEventListener('click', async () => {
    saveFormToConfig();
    const resultEl = $('test-c-result');
    resultEl.className = 'test-result loading';
    resultEl.textContent = '⏳ 正在测试连接...';
    const res = await OpenClawConfig.testConnection('C');
    resultEl.className = `test-result ${res.ok ? 'success' : 'error'}`;
    resultEl.textContent = res.msg;
    updateStatusBar();
  });

  // 保存配置
  $('openclaw-save').addEventListener('click', () => {
    saveFormToConfig();
    modal.style.display = 'none';
    updateLandingSettingsBadge();
    appendSystemMsgIfInMain('⚙️ OpenClaw 配置已保存！下次拆书时将调用 Agent B/C。');
  });

  // 清除配置
  $('openclaw-reset').addEventListener('click', () => {
    if (!confirm('确定要清除所有 OpenClaw 配置吗？')) return;
    OpenClawConfig.clear();
    loadConfigToForm(OpenClawConfig.defaults());
    updateStatusBar();
    updateLandingSettingsBadge();
  });
}

function openOpenClawModal() {
  const modal = $('openclaw-modal');
  loadConfigToForm(OpenClawConfig.load());
  updateStatusBar();
  modal.style.display = 'flex';
}

function loadConfigToForm(cfg) {
  $('agent-b-url').value = cfg.agentB?.url || '';
  $('agent-b-id').value = cfg.agentB?.id || '';
  $('agent-b-key').value = cfg.agentB?.key || '';
  $('agent-b-mode').value = cfg.agentB?.mode || 'search';
  $('agent-c-url').value = cfg.agentC?.url || '';
  $('agent-c-id').value = cfg.agentC?.id || '';
  $('agent-c-key').value = cfg.agentC?.key || '';
  $('agent-c-style').value = cfg.agentC?.style || 'socratic';
  $('agent-c-granularity').value = cfg.agentC?.granularity || 'chapter';
  $('openclaw-enabled').checked = cfg.enabled || false;
  $('openclaw-fallback').checked = cfg.fallback !== false;
  $('openclaw-timeout').value = cfg.timeout || 30;
}

function saveFormToConfig() {
  const cfg = {
    enabled: $('openclaw-enabled').checked,
    fallback: $('openclaw-fallback').checked,
    timeout: parseInt($('openclaw-timeout').value) || 30,
    agentB: {
      url: $('agent-b-url').value.trim(),
      id: $('agent-b-id').value.trim(),
      key: $('agent-b-key').value.trim(),
      mode: $('agent-b-mode').value,
    },
    agentC: {
      url: $('agent-c-url').value.trim(),
      id: $('agent-c-id').value.trim(),
      key: $('agent-c-key').value.trim(),
      style: $('agent-c-style').value,
      granularity: $('agent-c-granularity').value,
    },
  };
  OpenClawConfig.save(cfg);
  return cfg;
}

function updateStatusBar() {
  const cfg = OpenClawConfig.load();
  const bDot = $('status-agent-b')?.querySelector('.status-dot');
  const cDot = $('status-agent-c')?.querySelector('.status-dot');
  const bLabel = $('status-b-label');
  const cLabel = $('status-c-label');

  if (bDot && bLabel) {
    if (!cfg.enabled) {
      bDot.className = 'status-dot dot-idle';
      bLabel.textContent = '未启用';
      bLabel.className = 'status-label';
    } else if (cfg.agentB.url) {
      bDot.className = 'status-dot dot-ok';
      bLabel.textContent = '已配置';
      bLabel.className = 'status-label ok';
    } else {
      bDot.className = 'status-dot dot-error';
      bLabel.textContent = '未配置';
      bLabel.className = 'status-label';
    }
  }
  if (cDot && cLabel) {
    if (!cfg.enabled) {
      cDot.className = 'status-dot dot-idle';
      cLabel.textContent = '未启用';
      cLabel.className = 'status-label';
    } else if (cfg.agentC.url) {
      cDot.className = 'status-dot dot-ok';
      cLabel.textContent = '已配置';
      cLabel.className = 'status-label ok';
    } else {
      cDot.className = 'status-dot dot-error';
      cLabel.textContent = '未配置';
      cLabel.className = 'status-label';
    }
  }
}

function updateLandingSettingsBadge() {
  const btn = $('landing-settings-btn');
  if (!btn) return;
  const cfg = OpenClawConfig.load();
  const existingBadge = btn.querySelector('.configured-badge');
  if (existingBadge) existingBadge.remove();
  if (cfg.enabled && cfg.agentB.url && cfg.agentC.url) {
    const badge = document.createElement('span');
    badge.className = 'configured-badge';
    badge.textContent = '✓ 已接入';
    btn.appendChild(badge);
  }
}

function appendSystemMsgIfInMain(text) {
  const mainScreen = $('main-screen');
  if (mainScreen && mainScreen.style.display !== 'none' && mainScreen.classList.contains('active')) {
    appendSystemMsg(text);
  }
}

// ===== 增强书籍初始化流程（接入 OpenClaw）=====
async function startBookSessionWithAgent(bookName) {
  STATE.currentBook = bookName;
  showScreen('loading-screen');
  $('loading-title').textContent = `正在拆解《${bookName}》...`;

  const cfg = OpenClawConfig.load();
  const useAgent = cfg.enabled && cfg.agentB.url && cfg.agentC.url;

  if (useAgent) {
    // 显示 Agent 调用状态
    $('loading-subtitle').textContent = '正在调用 OpenClaw Agent B/C...';
    await runAgentPipeline(bookName, cfg);
  } else {
    // 降级到内置流程
    $('loading-subtitle').textContent = 'Agent B 正在进行逻辑拆解，请稍候';
    await runBuiltinPipeline(bookName);
  }
}

async function runAgentPipeline(bookName, cfg) {
  const steps = ['step1', 'step2', 'step3', 'step4'];
  const stepTexts = [
    '📡 Agent B 检索书籍内容...',
    '🤖 Agent C 逻辑拆解中...',
    '🗺️ 关卡地图生成中...',
    '⚡ 2026 实时补丁注入...',
  ];
  const doneTexts = [
    '✅ Agent B 检索完成',
    '✅ Agent C 拆解完成',
    '✅ 关卡地图已生成',
    '✅ 2026 实时补丁加载完成',
  ];

  // Step 1: Agent B 检索
  $(steps[0]).textContent = stepTexts[0];
  $(steps[0]).classList.add('active');
  const bookContent = await OpenClawConfig.callAgentB(bookName);
  await sleep(400);
  $(steps[0]).classList.remove('active');
  $(steps[0]).classList.add('done');
  $(steps[0]).textContent = bookContent ? doneTexts[0] : '✅ 内置语料加载完成（Agent B 未响应）';

  // Step 2: Agent C 拆书
  $(steps[1]).textContent = stepTexts[1];
  $(steps[1]).classList.add('active');
  const agentBookData = bookContent ? await OpenClawConfig.callAgentC(bookName, bookContent) : null;
  await sleep(400);
  $(steps[1]).classList.remove('active');
  $(steps[1]).classList.add('done');
  $(steps[1]).textContent = agentBookData ? doneTexts[1] : '✅ 内置拆书数据加载完成（Agent C 未响应）';

  // Step 3-4: 生成关卡地图和补丁
  for (let i = 2; i < steps.length; i++) {
    await sleep(400 + Math.random() * 200);
    $(steps[i]).classList.add('active');
    await sleep(500);
    $(steps[i]).classList.remove('active');
    $(steps[i]).classList.add('done');
    $(steps[i]).textContent = doneTexts[i];
  }

  await sleep(300);

  // 优先使用 Agent 返回数据，否则降级到内置
  STATE.bookData = agentBookData || findBookData(bookName);
  STATE.levels = STATE.bookData.levels;
  STATE.currentLevel = 1;
  STATE.completedLevels = new Set();
  STATE.orbs = [];
  STATE.messages = [];
  STATE.declaration = '';

  showScreen('main-screen');
  initMainScreen(bookName, STATE.bookData, false);

  if (agentBookData) {
    appendSystemMsg(`🤖 OpenClaw Agent 已成功拆解《${bookName}》，共生成 ${STATE.levels.length} 关！`);
  } else if (cfg.fallback) {
    appendSystemMsg(`⚠️ OpenClaw Agent 未响应，已降级到内置数据。共 ${STATE.levels.length} 关。`);
  }
}

async function runBuiltinPipeline(bookName) {
  const steps = ['step1', 'step2', 'step3', 'step4'];
  for (let i = 0; i < steps.length; i++) {
    await sleep(500 + Math.random() * 300);
    if (i > 0) $(`step${i}`).classList.remove('active');
    $(steps[i]).classList.add('active');
    await sleep(600);
    $(steps[i]).classList.remove('active');
    $(steps[i]).classList.add('done');
    const doneTexts = ['✅ 全书语料扫描完成', '✅ 逻辑结构拆解完成', '✅ 关卡地图生成完成', '✅ 2026 实时补丁加载完成'];
    $(steps[i]).textContent = doneTexts[i];
  }
  await sleep(300);

  STATE.bookData = findBookData(bookName);
  STATE.levels = STATE.bookData.levels;
  STATE.currentLevel = 1;
  STATE.completedLevels = new Set();
  STATE.orbs = [];
  STATE.messages = [];
  STATE.declaration = '';

  showScreen('main-screen');
  initMainScreen(bookName, STATE.bookData, false);
}

// ===== 应用入口 =====
document.addEventListener('DOMContentLoaded', () => {
  initLanding();
  initQuickActions();
  initSendBtn();
  initModals();
  initDeclaration();
  initBackBtn();
  initMobileDrawer();
  initOpenClawModal();
  updateLandingSettingsBadge();
});
