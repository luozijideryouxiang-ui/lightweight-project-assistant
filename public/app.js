'use strict';

(function () {
  var VIEW_ORDER = ['focus', 'list', 'board', 'calendar', 'timeline', 'matrix', 'ai', 'all'];
  var BOARD_COLUMNS = [
    { id: 'notStarted', label: '未开始', dot: '' },
    { id: 'inProgress', label: '进行中', dot: 'in-progress' },
    { id: 'waitingOnOthers', label: '等待他人', dot: 'waiting' },
    { id: 'deferred', label: '已延期', dot: 'deferred' },
    { id: 'completed', label: '已完成', dot: 'completed' }
  ];
  var STATUS_LABELS = {
    notStarted: '未开始',
    inProgress: '进行中',
    waitingOnOthers: '等待他人',
    deferred: '已延期',
    completed: '已完成'
  };
  var BOARD_AUTO_SCROLL_EDGE_PX = 72;
  var BOARD_AUTO_SCROLL_MAX_PX_PER_SECOND = 720;
  var BOARD_SCALE_DEFAULT = 1;
  var BOARD_SCALE_MIN = 0.8;
  var BOARD_SCALE_MAX = 1.2;
  var PREF_STORE_KEY = 'todo-console-ui-prefs';
  var AI_CHAT_STORE_KEY = 'todo-console-ai-chat';
  var SYNC_INTERVAL_MS = 180000;
  var SYNC_THROTTLE_MS = 60000;
  var LAYOUT_DEFAULTS = {
    sidebarWidth: 284,
    aiLogHeight: null,
    focusRatio: 64,
    timelineRatio: 65
  };
  var LAYOUT_LIMITS = {
    sidebarWidth: { min: 220, max: 360 },
    aiLogHeight: { min: 170, max: 620 },
    focusRatio: { min: 25, max: 75 },
    timelineRatio: { min: 25, max: 75 }
  };
  var MOBILE_NAV_TABS = [
    { id: 'focus', label: '今日', icon: 'focus' },
    { id: 'list', label: '列表', icon: 'list' },
    { id: 'board', label: '看板', icon: 'board' },
    { id: 'calendar', label: '日历', icon: 'calendar' },
    { id: 'ai', label: 'AI', icon: 'ai' }
  ];
  var ICONS = {
    focus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="3.2"></circle><path d="M12 2.5v3M21.5 12h-3M12 21.5v-3M2.5 12h3"></path></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5h13M6.5 12h13M6.5 17.5h13"></path><path d="M3.2 6.5h.1M3.2 12h.1M3.2 17.5h.1"></path></svg>',
    board: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1"></rect><rect x="10" y="4" width="5" height="11" rx="1"></rect><rect x="17" y="4" width="4" height="7" rx="1"></rect></svg>',
    timeline: '<svg viewBox="0 0 24 24"><path d="M6 5v14M6 5h13M6 11h10M6 17h13"></path><circle cx="6" cy="5" r="1.7"></circle><circle cx="6" cy="11" r="1.7"></circle><circle cx="6" cy="17" r="1.7"></circle></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M8.3 3.5 9.8 7l3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5L6.8 7l1.5-3.5Z"></path><path d="m17.1 12.1.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3ZM16.5 3.5v2M21 6h-2"></path></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"></path><path d="m19.3 13.3 1.3 1-.9 1.6-1.6-.6a7.7 7.7 0 0 1-1.8 1.1l-.2 1.7h-1.8l-.5-1.6a7.8 7.8 0 0 1-2.1 0l-.5 1.6h-1.8l-.2-1.7a7.7 7.7 0 0 1-1.8-1.1l-1.6.6-.9-1.6 1.3-1a7 7 0 0 1 0-2.6l-1.3-1 .9-1.6 1.6.6a7.7 7.7 0 0 1 1.8-1.1l.2-1.7h1.8l.5 1.6a7.8 7.8 0 0 1 2.1 0l.5-1.6h1.8l.2 1.7a7.7 7.7 0 0 1 1.8 1.1l1.6-.6.9 1.6-1.3 1a7 7 0 0 1 0 2.6Z"></path></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8.2 8.2 0 0 0-14.4-4L4 9"></path><path d="M4 4v5h5"></path><path d="M4 13a8.2 8.2 0 0 0 14.4 4L20 15"></path><path d="M20 20v-5h-5"></path></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>',
    microphone: '<svg viewBox="0 0 24 24"><rect x="8.5" y="3" width="7" height="12" rx="3.5"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"></path></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19.5 6.7"></path></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m4 16.8-.7 3.9 3.9-.7L19 8.2 15.8 5 4 16.8Z"></path><path d="m14.5 6.3 3.2 3.2"></path></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M5.5 7h13M9 7V4.5h6V7M7.2 7l.7 12.5h8.2L16.8 7M10 10.5v6M14 10.5v6"></path></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3 2"></path></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="15" rx="2"></rect><path d="M8 3.5v4M16 3.5v4M4 10h16"></path></svg>',
    matrix: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"></rect><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"></rect><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"></rect><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"></rect></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="m12 4 8 15H4L12 4Z"></path><path d="M12 9v4M12 16.5v.1"></path></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="m13.5 3-8 10h6l-1 8 8-10h-6l1-8Z"></path></svg>',
    database: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5.5" rx="7.5" ry="3"></ellipse><path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"></path></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 10.5v5M12 7.5v.1"></path></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"></path><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"></path></svg>'
  };

  var prefs = readPreferences();
  var activeRecognition = null;
  var authPollTimer = 0;
  var authPollBusy = false;
  var appState = {
    workspace: null,
    loading: true,
    error: null,
    health: { ok: false, mode: 'rules', message: '正在连接' },
    auth: { status: 'unknown', supported: false, authenticated: true, message: '正在检查 Microsoft To Do 登录状态。' },
    activeListId: prefs.activeListId || '',
    view: VIEW_ORDER.indexOf(prefs.view) >= 0 ? (prefs.view === 'all' ? 'list' : prefs.view) : 'focus',
    lowDistraction: prefs.lowDistraction !== false,
    reducedMotion: Boolean(prefs.reducedMotion),
    listFilter: 'all',
    scope: prefs.scope === 'all' || prefs.view === 'all' ? 'all' : 'list',
    boardScale: clampBoardScale(prefs.boardScale),
    calendarMode: prefs.calendarMode || 'month',
    calendarAnchor: new Date(),
    expandedCalendarDays: {},
    modal: null,
    drag: null,
    boardAutoScroll: {
      board: null,
      vertical: null,
      pointerX: null,
      pointerY: null,
      rafId: 0,
      lastTimestamp: 0
    },
    noteDraft: '',
    quickDraft: '',
    notesByList: {},
    syncing: false,
    lastSyncAt: 0,
    focusAfterRender: '',
    modalFocusDone: false,
    pendingTasks: {},
    layout: normalizeLayoutPreferences(prefs.layout),
    layoutDrag: null,
    settings: {
      loading: false,
      saving: false,
      loaded: false,
      error: '',
      draft: null,
      apiKey: '',
      logoutBusy: false,
      models: [],
      modelsError: ''
    },
    projectPlan: {
      loading: false,
      applying: false,
      error: '',
      preview: null,
      applyResult: null
    },
    ai: newAiConversation('')
  };

  // 底部导航会随每次 render 重建，胶囊的 presentation state 必须留在 DOM 之外。
  // 这样切换或静默同步发生在动画中间时，下一次渲染仍从当前位置和速度继续。
  var mobileNavMotion = {
    nav: null,
    capsule: null,
    mediaQuery: null,
    initialized: false,
    settled: true,
    reducedMotion: false,
    targetIndex: -1,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    velocityX: 0,
    width: 0,
    height: 0,
    navWidth: 0,
    originX: 0,
    stepX: 0,
    rafId: 0,
    lastTime: 0
  };
  // 月视图按日期保留展开态，普通 render 不会把用户已经展开的任务折回去。
  var calendarExpandedDays = {};

  function newAiConversation(listId) {
    return {
      listId: listId,
      messages: [],
      contextPreviewId: '',
      confirmAttempted: false,
      needsClarification: false,
      scrollToEnd: true,
      input: '',
      loading: false,
      applying: false,
      listening: false,
      voiceMessage: '',
      lastMessage: '',
      lastError: '',
      lastMode: '',
      lastModel: '',
      affectedCount: null,
      preview: null,
      applyResult: null,
      opSelection: [],
      opEdits: {},
      completedOps: []
    };
  }

  function saveAiConversation(ai) {
    if (!ai.listId) return;
    try {
      var saved = JSON.parse(window.localStorage.getItem(AI_CHAT_STORE_KEY) || '{}');
      if (!isObject(saved)) saved = {};
      saved[ai.listId] = { input: ai.input, messages: ai.messages.slice(-40), contextPreviewId: ai.contextPreviewId,
        preview: ai.preview, applyResult: ai.applyResult, confirmAttempted: ai.confirmAttempted,
        needsClarification: ai.needsClarification, opSelection: ai.opSelection, opEdits: ai.opEdits, completedOps: ai.completedOps, updatedAt: Date.now() };
      var keys = Object.keys(saved).sort(function (a, b) { return saved[b].updatedAt - saved[a].updatedAt; });
      keys.slice(8).forEach(function (key) { delete saved[key]; });
      window.localStorage.setItem(AI_CHAT_STORE_KEY, JSON.stringify(saved));
    } catch (error) { /* Storage may be unavailable; the current conversation stays in memory. */ }
  }

  function selectAiConversation(listId) {
    if (appState.ai.listId === listId) return;
    saveAiConversation(appState.ai);
    var ai = newAiConversation(listId);
    try {
      var saved = JSON.parse(window.localStorage.getItem(AI_CHAT_STORE_KEY) || '{}')[listId];
      if (isObject(saved)) {
        ai.input = typeof saved.input === 'string' ? saved.input.slice(0, 2000) : '';
        ai.messages = Array.isArray(saved.messages) ? saved.messages.filter(function (m) {
          return m && ['user', 'assistant'].indexOf(m.role) >= 0 && typeof m.content === 'string';
        }).slice(-40) : [];
        ai.contextPreviewId = typeof saved.contextPreviewId === 'string' ? saved.contextPreviewId : '';
        ai.preview = isObject(saved.preview) ? saved.preview : null;
        ai.applyResult = isObject(saved.applyResult) ? saved.applyResult : null;
        ai.confirmAttempted = Boolean(saved.confirmAttempted);
        ai.needsClarification = Boolean(saved.needsClarification);
        ai.opSelection = Array.isArray(saved.opSelection) ? saved.opSelection : [];
        ai.opEdits = isObject(saved.opEdits) ? saved.opEdits : {};
        ai.completedOps = Array.isArray(saved.completedOps) ? saved.completedOps : [];
      }
    } catch (error) { /* Ignore malformed local conversation data. */ }
    appState.ai = ai;
  }

  function readPreferences() {
    var defaults = { view: 'focus', lowDistraction: true, reducedMotion: false, activeListId: '', scope: 'list', boardScale: BOARD_SCALE_DEFAULT, calendarMode: 'month', layout: LAYOUT_DEFAULTS };
    try {
      var raw = window.localStorage.getItem(PREF_STORE_KEY);
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      var merged = {};
      Object.keys(defaults).forEach(function (key) {
        merged[key] = parsed && parsed[key] !== undefined ? parsed[key] : defaults[key];
      });
      return merged;
    } catch (error) {
      return defaults;
    }
  }

  function clampBoardScale(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return BOARD_SCALE_DEFAULT;
    return Math.round(Math.max(BOARD_SCALE_MIN, Math.min(BOARD_SCALE_MAX, numeric)) * 100) / 100;
  }

  function boardScaleText(value) {
    return Math.round(clampBoardScale(value) * 100) + '%';
  }

  function applyBoardScale(value) {
    var next = clampBoardScale(value);
    appState.boardScale = next;
    if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      var board = document.querySelector('.board');
      if (board && board.style) board.style.setProperty('--board-scale', String(next));
    }
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('[data-board-scale-output]').forEach(function (output) {
        output.textContent = boardScaleText(next);
      });
    }
    return next;
  }

  var boardScaleGesture = { board: null, startScale: 1 };
  var boardScaleSaveTimer = 0;

  function persistBoardScaleSoon() {
    if (boardScaleSaveTimer && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') window.clearTimeout(boardScaleSaveTimer);
    if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
      savePreferences();
      return;
    }
    boardScaleSaveTimer = window.setTimeout(function () {
      boardScaleSaveTimer = 0;
      savePreferences();
    }, 180);
  }

  function handleBoardWheel(event) {
    var board = getBoardFromTarget(event.target);
    if (!board || (!event.ctrlKey && !event.metaKey)) return;
    var delta = Number(event.deltaY);
    if (!Number.isFinite(delta) || delta === 0) return;
    event.preventDefault();
    var factor = Math.exp(Math.max(-0.08, Math.min(0.08, -delta * 0.01)));
    applyBoardScale(appState.boardScale * factor);
    persistBoardScaleSoon();
  }

  function handleBoardGestureStart(event) {
    var board = getBoardFromTarget(event.target);
    if (!board) return;
    boardScaleGesture.board = board;
    boardScaleGesture.startScale = appState.boardScale;
    event.preventDefault();
  }

  function handleBoardGestureChange(event) {
    var board = getBoardFromTarget(event.target);
    if (!board || boardScaleGesture.board !== board) return;
    var gestureScale = Number(event.scale);
    if (!Number.isFinite(gestureScale) || gestureScale <= 0) return;
    event.preventDefault();
    applyBoardScale(boardScaleGesture.startScale * gestureScale);
    // 某些 WebKit 场景在窗口失焦时不会派发 gestureend；拖动过程中也做一次
    // 防抖保存，避免看板缩放在意外中断后丢失。
    persistBoardScaleSoon();
  }

  function handleBoardGestureEnd(event) {
    if (!boardScaleGesture.board) return;
    if (event && event.target) {
      var board = getBoardFromTarget(event.target);
      if (board && board !== boardScaleGesture.board) return;
    }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    boardScaleGesture.board = null;
    boardScaleGesture.startScale = appState.boardScale;
    savePreferences();
  }

  function clampLayoutValue(key, value) {
    var limits = LAYOUT_LIMITS[key];
    var fallback = LAYOUT_DEFAULTS[key];
    if (!limits) return fallback;
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.round(Math.max(limits.min, Math.min(limits.max, numeric)));
  }

  function normalizeLayoutPreferences(value) {
    var source = isObject(value) ? value : {};
    return {
      sidebarWidth: clampLayoutValue('sidebarWidth', source.sidebarWidth),
      aiLogHeight: source.aiLogHeight === null || source.aiLogHeight === undefined || source.aiLogHeight === ''
        ? LAYOUT_DEFAULTS.aiLogHeight
        : clampLayoutValue('aiLogHeight', source.aiLogHeight),
      focusRatio: clampLayoutValue('focusRatio', source.focusRatio),
      timelineRatio: clampLayoutValue('timelineRatio', source.timelineRatio)
    };
  }

  function layoutDescriptor(type) {
    var descriptors = {
      sidebar: { key: 'sidebarWidth', orientation: 'vertical', unit: 'px', label: '导航宽度' },
      chat: { key: 'aiLogHeight', orientation: 'horizontal', unit: 'px', label: '对话区高度' },
      focus: { key: 'focusRatio', orientation: 'vertical', unit: '%', label: '今日焦点栏比例' },
      timeline: { key: 'timelineRatio', orientation: 'vertical', unit: '%', label: '时间线栏比例' }
    };
    return descriptors[type] || null;
  }

  function layoutValue(type) {
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return null;
    var value = appState.layout[descriptor.key];
    if (value === null || value === undefined) value = LAYOUT_DEFAULTS[descriptor.key];
    return clampLayoutValue(descriptor.key, value);
  }

  function layoutValueText(type, value) {
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return '';
    return value + (descriptor.unit === '%' ? '%' : ' 像素');
  }

  function renderLayoutResizer(type) {
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return '';
    var value = layoutValue(type);
    var limits = LAYOUT_LIMITS[descriptor.key];
    return '<div class="layout-resizer layout-resizer-' + type + '" role="separator" aria-orientation="' + descriptor.orientation + '" aria-valuemin="' + limits.min + '" aria-valuemax="' + limits.max + '" aria-valuenow="' + value + '" aria-valuetext="' + escapeAttribute(layoutValueText(type, value)) + '" tabindex="0" data-layout-resizer="' + type + '" title="拖动调整' + descriptor.label + '"></div>';
  }

  function hasPendingAiEdits(ai) {
    return pendingAiEdits(ai).length > 0;
  }

  function pendingAiEdits(ai) {
    if (!ai || !isObject(ai.opEdits)) return [];
    var completed = Array.isArray(ai.completedOps) ? ai.completedOps : [];
    return Object.keys(ai.opEdits).map(function (key) {
      var index = Number(key);
      var edit = ai.opEdits[key];
      return Number.isInteger(index) && completed.indexOf(index) === -1 && isObject(edit) && Object.keys(edit).length > 0
        ? Object.assign({ index: index }, edit)
        : null;
    }).filter(function (edit) { return edit !== null; });
  }

  function savePreferences() {
    // 仅保存界面偏好（视图、开关、当前清单）。任务与项目数据永远只存在于 Microsoft To Do。
    try {
      window.localStorage.setItem(PREF_STORE_KEY, JSON.stringify({
        view: appState.view,
        lowDistraction: appState.lowDistraction,
        reducedMotion: appState.reducedMotion,
        activeListId: appState.activeListId,
        scope: appState.scope,
        boardScale: clampBoardScale(appState.boardScale),
        calendarMode: appState.calendarMode,
        layout: {
          sidebarWidth: layoutValue('sidebar'),
          aiLogHeight: appState.layout.aiLogHeight === null || appState.layout.aiLogHeight === undefined ? null : layoutValue('chat'),
          focusRatio: layoutValue('focus'),
          timelineRatio: layoutValue('timeline')
        }
      }));
    } catch (error) {
      // 隐私模式或 file:// 协议下不可用时静默跳过，不影响功能。
    }
  }

  function icon(name, extraClass) {
    return '<span class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true">' + (ICONS[name] || '') + '</span>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function normalizeMode(value) {
    var mode = String(value || '').toLowerCase().replace(/_/g, '-');
    if (mode.indexOf('openrouter') >= 0) return 'openrouter-deepseek';
    if (mode.indexOf('deepseek') >= 0) return 'deepseek';
    if (mode.indexOf('openai') >= 0) return 'openai-compatible';
    if (mode.indexOf('ollama') >= 0) return 'ollama';
    if (mode.indexOf('rule') >= 0 || mode === 'local') return 'rules';
    return mode || 'rules';
  }

  function modeLabel(mode) {
    var normalized = normalizeMode(mode);
    if (normalized === 'rules') return '规则整理（不是 AI）';
    if (normalized === 'deepseek') return 'DeepSeek AI';
    if (normalized === 'openrouter-deepseek') return 'DeepSeek 免费线路';
    if (normalized === 'ollama') return 'Ollama AI';
    if (normalized === 'openai-compatible') return 'OpenAI-compatible AI';
    return normalized || '未识别模式';
  }

  function modeClass(mode) {
    return normalizeMode(mode).replace(/[^a-z0-9-]/g, '');
  }

  function normalizeStatus(value) {
    var status = String(value || '').replace(/-/g, '').toLowerCase();
    if (status === 'completed' || status === 'done' || status === 'complete') return 'completed';
    if (status === 'inprogress' || status === 'doing' || status === 'active') return 'inProgress';
    if (status === 'waitingonothers' || status === 'waiting' || status === 'blocked') return 'waitingOnOthers';
    if (status === 'deferred' || status === 'postponed') return 'deferred';
    return 'notStarted';
  }

  function normalizeRecurrence(value) {
    var pattern = isObject(value) && isObject(value.pattern) ? value.pattern : (isObject(value) ? value : {});
    var range = isObject(value) && isObject(value.range) ? value.range : null;
    var interval = Number(pattern.interval);
    if ((Number.isFinite(interval) && interval !== 1) || (range && (range.endDate || range.numberOfOccurrences || (range.type && range.type !== 'noEnd')))) return 'existing';
    var raw = isObject(value) ? (pattern.type || value.type || value.recurrence) : value;
    raw = String(raw || '').toLowerCase();
    if (!raw) return 'none';
    if (raw === 'daily' || raw === 'day') return 'daily';
    if (raw === 'weekly' || raw === 'week') return 'weekly';
    if (raw === 'monthly' || raw === 'month') return 'monthly';
    return raw;
  }

  function normalizeDateValue(value) {
    if (!value) return '';
    var dateTime = typeof value === 'string' ? value : (isObject(value) ? (value.dateTime || value.date || '') : '');
    if (!dateTime) return '';
    var normalized = String(dateTime).trim();
    normalized = normalized.replace(/(\.\d{3})\d+(?=(?:Z|[+-]\d{2}:?\d{2})?$)/, '$1');
    var timeZone = isObject(value) ? String(value.timeZone || '').toUpperCase() : '';
    if (timeZone && /(?:UTC|ETC\/UTC)$/.test(timeZone) && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)) normalized += 'Z';
    return normalized;
  }

  function normalizeTask(task) {
    var source = isObject(task) ? task : {};
    var rawImportance = String(source.importance || 'normal').toLowerCase();
    return {
      id: String(source.id || source.taskId || ''),
      title: String(source.title || source.subject || '未命名任务'),
      status: normalizeStatus(source.status || source.graphStatus),
      importance: rawImportance === 'high' ? 'important' : rawImportance,
      dueDateTime: normalizeDateValue(source.dueDateTime || source.dueDate),
      reminderDateTime: normalizeDateValue(source.reminderDateTime),
      isReminderOn: source.isReminderOn !== false,
      recurrence: normalizeRecurrence(source.recurrence || source.recurrenceType),
      lastModifiedDateTime: normalizeDateValue(source.lastModifiedDateTime || source.updatedAt || source.updated_at),
      createdDateTime: normalizeDateValue(source.createdDateTime || source.createdAt || source.created_at),
      body: isObject(source.body) ? String(source.body.content || '') : String(source.body || source.description || ''),
      linkedResource: source.linkedResource || null
    };
  }

  function normalizeList(list) {
    var source = isObject(list) ? list : {};
    var wellKnown = String(source.wellknownListName || source.wellKnownListName || '').toLowerCase();
    return {
      id: String(source.id || source.listId || ''),
      name: String(source.displayName || source.name || source.title || '未命名清单'),
      isOwner: source.isOwner !== false,
      wellknownListName: wellKnown,
      isFlaggedEmails: wellKnown === 'flaggedemails'
    };
  }

  function defaultProjectTemplate() {
    return {
      name: '项目排期模板',
      steps: [
        { title: '确认需求', offsetDays: 0, reminderTime: '09:00' },
        { title: '催付款', offsetDays: 2, reminderTime: '09:00' },
        { title: '确认收货', offsetDays: 3, reminderTime: '09:00' },
        { title: '安排发货', offsetDays: 5, reminderTime: '09:00' }
      ]
    };
  }

  function cloneProjectTemplate(template) {
    var source = isObject(template) ? template : {};
    var steps = Array.isArray(source.steps) ? source.steps : [];
    return {
      name: String(source.name || '项目排期模板'),
      steps: steps.map(function (step) {
        var item = isObject(step) ? step : {};
        var offset = Number(item.offsetDays);
        return {
          title: String(item.title || '').trim(),
          offsetDays: Number.isFinite(offset) ? offset : 0,
          reminderTime: /^\d{2}:\d{2}$/.test(String(item.reminderTime || '')) ? String(item.reminderTime) : '09:00'
        };
      }).filter(function (step) { return step.title; })
    };
  }

  function normalizeSettings(payload) {
    var source = isObject(payload) ? payload : {};
    var ai = isObject(source.ai) ? source.ai : {};
    var fallback = defaultProjectTemplate();
    var template = cloneProjectTemplate(source.projectTemplate || fallback);
    if (!template.steps.length) template.steps = fallback.steps;
    return {
      ai: {
        configured: Boolean(ai.configured),
        model: String(ai.model || 'deepseek-flash')
      },
      projectTemplate: template
    };
  }

  function normalizeAuth(payload, fallback) {
    var source = isObject(payload) ? payload : {};
    var base = isObject(fallback) ? fallback : {};
    var supported = source.supported !== undefined ? Boolean(source.supported) : (base.supported !== undefined ? Boolean(base.supported) : false);
    var rawStatus = String(source.status || base.status || (source.authenticated || base.authenticated ? 'signed_in' : 'unknown')).toLowerCase().replace(/[-\s]/g, '_');
    var statusMap = {
      signedin: 'signed_in',
      signed_in: 'signed_in',
      signedout: 'signed_out',
      signed_out: 'signed_out',
      pending: 'pending',
      expired: 'expired',
      error: 'error',
      unknown: 'unknown'
    };
    var status = statusMap[rawStatus] || 'unknown';
    var authenticated = source.authenticated !== undefined
      ? Boolean(source.authenticated)
      : (base.authenticated !== undefined ? Boolean(base.authenticated) : status === 'signed_in' || !supported);
    // 旧服务端没有认证路由时，保持兼容并继续使用原有工作区流程。
    if (!supported) authenticated = true;
    var account = isObject(source.account) ? {
      username: String(source.account.username || ''),
      name: String(source.account.name || '')
    } : (isObject(base.account) ? base.account : null);
    var expiresAt = Number(source.expiresAt || base.expiresAt || 0);
    return {
      status: status,
      supported: supported,
      authenticated: authenticated,
      message: String(source.message || base.message || (authenticated ? 'Microsoft To Do 已连接。' : '请登录 Microsoft To Do。')),
      verificationUri: String(source.verificationUri || base.verificationUri || 'https://microsoft.com/devicelogin'),
      verificationUriComplete: String(source.verificationUriComplete || base.verificationUriComplete || ''),
      userCode: String(source.userCode || base.userCode || ''),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      account: account,
      error: String(source.error || base.error || '')
    };
  }

  function settingsDraft() {
    return appState.settings.draft || normalizeSettings({});
  }

  function copySettingsDraft(value) {
    var normalized = normalizeSettings(value);
    return {
      ai: { configured: normalized.ai.configured, model: normalized.ai.model },
      projectTemplate: cloneProjectTemplate(normalized.projectTemplate)
    };
  }

  function parseProgressLog(content) {
    return String(content || '').split(/\r?\n/).map(function (line) {
      var match = line.match(/^\s*\[([^\]]+)\]\s*(.+?)\s*$/);
      if (!match) return null;
      return { createdAt: match[1], content: match[2] };
    }).filter(Boolean).reverse();
  }

  function normalizeWorkspace(payload) {
    var source = isObject(payload) ? payload : {};
    var rawLists = Array.isArray(source.lists) ? source.lists : [];
    var lists = rawLists.map(normalizeList).filter(function (list) { return list.id; });
    var rawMap = isObject(source.tasksByList) ? source.tasksByList : {};
    var progressTaskPrefix = String(source.progressTaskPrefix || '【项目日志】');
    var notesByList = {};
    var tasksByList = {};
    lists.forEach(function (list) {
      var rawTasks = Array.isArray(rawMap[list.id]) ? rawMap[list.id] : [];
      var normalizedTasks = rawTasks.map(normalizeTask).filter(function (task) { return task.id; });
      var progressTask = normalizedTasks.find(function (task) {
        return task.title === progressTaskPrefix || task.title.indexOf(progressTaskPrefix) === 0;
      });
      if (progressTask && progressTask.body) notesByList[list.id] = parseProgressLog(progressTask.body);
      tasksByList[list.id] = normalizedTasks.filter(function (task) {
        return !(task.title === progressTaskPrefix || task.title.indexOf(progressTaskPrefix) === 0);
      });
    });
    return { lists: lists, tasksByList: tasksByList, progressTaskPrefix: progressTaskPrefix, notesByList: notesByList };
  }

  function getLists() {
    return appState.workspace ? appState.workspace.lists : [];
  }

  function getTasks(listId) {
    if (!appState.workspace || !appState.workspace.tasksByList) return [];
    return appState.workspace.tasksByList[listId] || [];
  }

  function getAllTaskRecords() {
    var records = [];
    getLists().forEach(function (list) {
      getTasks(list.id).forEach(function (task) {
        records.push({ list: list, task: task });
      });
    });
    return records;
  }

  // 全局范围统一入口：'all' 跨清单汇总，'list' 只看当前清单。
  // 所有视图都必须走这里，避免各写一套聚合逻辑导致「视图 × 范围」组合出错。
  function getScopeRecords() {
    if (appState.scope === 'all') return getAllTaskRecords();
    var active = getActiveList();
    if (!active) return [];
    return getTasks(active.id).map(function (task) { return { list: active, task: task }; });
  }

  function isScopeAll() {
    return appState.scope === 'all';
  }

  function renderScopeToggle() {
    if (appState.view === 'ai') return '';
    var all = isScopeAll();
    var active = getActiveList();
    return '<div class="scope-toggle" role="group" aria-label="查看范围">' +
      '<button type="button" class="scope-option' + (all ? '' : ' is-active') + '" data-action="set-scope" data-scope="list"' + (active ? '' : ' disabled') + '>当前清单</button>' +
      '<button type="button" class="scope-option' + (all ? ' is-active' : '') + '" data-action="set-scope" data-scope="all">全部待办</button>' +
      '</div>';
  }

  function isProjectList(list) {
    return !list.isFlaggedEmails;
  }

  function getProjectTaskRecords() {
    return getAllTaskRecords().filter(function (record) { return isProjectList(record.list); });
  }

  function getProjectLists() {
    return getLists().filter(isProjectList);
  }

  function getActiveList() {
    return getLists().find(function (list) { return list.id === appState.activeListId; }) || getLists()[0] || null;
  }

  function getTask(listId, taskId) {
    return getTasks(listId).find(function (task) { return task.id === taskId; }) || null;
  }

  function taskCount(listId, includeCompleted) {
    return getTasks(listId).filter(function (task) {
      return includeCompleted || task.status !== 'completed';
    }).length;
  }

  function allTaskCount(includeCompleted) {
    return getAllTaskRecords().filter(function (record) {
      return includeCompleted || record.task.status !== 'completed';
    }).length;
  }

  function progressForTasks(tasks) {
    if (!tasks.length) return 0;
    return Math.round(tasks.filter(function (task) { return task.status === 'completed'; }).length / tasks.length * 100);
  }

  function progressForList(listId) {
    return progressForTasks(getTasks(listId));
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function dateObject(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    var normalized = normalizeDateValue(value);
    if (!normalized) return null;
    var date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateKey(value) {
    var date = dateObject(value);
    if (!date) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function todayKey() {
    // 修复原版 bug：原实现先转 UTC 再取日期，东八区每天 16:00 后“今天”会变成“昨天”。
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function isOverdue(task) {
    return task.status !== 'completed' && Boolean(task.dueDateTime) && dateKey(task.dueDateTime) < todayKey();
  }

  function isToday(task) {
    return Boolean(task.dueDateTime) && dateKey(task.dueDateTime) === todayKey();
  }

  function isReminderToday(task) {
    return task.isReminderOn !== false && Boolean(task.reminderDateTime) && dateKey(task.reminderDateTime) === todayKey();
  }

  function isTodayTask(task) {
    return isToday(task) || isReminderToday(task);
  }

  function formatDate(value, withTime) {
    var date = dateObject(value);
    if (!date) return '';
    var output = (date.getMonth() + 1) + '月' + date.getDate() + '日';
    if (withTime && (date.getHours() || date.getMinutes())) output += ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    return output;
  }

  function relativeDate(value) {
    if (!value) return '未设置日期';
    if (isOverdue({ status: 'notStarted', dueDateTime: value })) return '已逾期 · ' + formatDate(value);
    if (dateKey(value) === todayKey()) {
      var todayLabel = formatDate(value, true);
      return todayLabel.indexOf(' ') >= 0 ? '今天 · ' + todayLabel.split(' ')[1] : '今天';
    }
    var date = dateObject(value);
    if (!date) return '日期待确认';
    var dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return formatDate(value) + ' · ' + dayNames[date.getDay()];
  }

  function formatDateTime(value) {
    var date = dateObject(value);
    if (!date) return '刚刚';
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function statusOptions(selected) {
    return BOARD_COLUMNS.map(function (column) {
      return '<option value="' + column.id + '"' + (column.id === selected ? ' selected' : '') + '>' + column.label + '</option>';
    }).join('');
  }

  function recurrenceOptions(selected) {
    var supported = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月' };
    var options = '';
    if (selected !== 'none' && !supported[selected]) options += '<option value="__existing" selected>保留现有重复规则</option>';
    Object.keys(supported).forEach(function (key) {
      options += '<option value="' + key + '"' + (selected === key ? ' selected' : '') + '>' + supported[key] + '</option>';
    });
    return options;
  }

  function isTaskBusy(taskId) {
    return Boolean(appState.pendingTasks[taskId]);
  }

  // ---- 渲染时保留焦点、光标与滚动位置，避免每次同步后输入被打断 ----
  function captureUiState() {
    var state = { scrollY: window.scrollY || 0, navScroll: 0, focus: null };
    var chat = document.querySelector('.ai-chat-log');
    if (chat) state.chatScroll = chat.scrollTop;
    var nav = document.querySelector('.list-nav');
    if (nav) state.navScroll = nav.scrollTop;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      state.focus = {
        id: el.id || '',
        form: el.closest && el.closest('[data-form]') ? el.closest('[data-form]').getAttribute('data-form') : '',
        name: el.getAttribute('name') || '',
        selStart: el.selectionStart,
        selEnd: el.selectionEnd
      };
    }
    return state;
  }

  function restoreUiState(state) {
    if (!state) return;
    window.scrollTo(0, state.scrollY || 0);
    var nav = document.querySelector('.list-nav');
    if (nav) nav.scrollTop = state.navScroll || 0;
    if (state.focus) {
      var el = null;
      if (state.focus.id) el = document.getElementById(state.focus.id);
      if (!el && state.focus.name && state.focus.form) {
        el = document.querySelector('[data-form="' + state.focus.form + '"] [name="' + state.focus.name + '"]');
      }
      if (el) {
        try {
          el.focus();
          if (el.setSelectionRange && state.focus.selStart != null && el.tagName !== 'SELECT') {
            el.setSelectionRange(state.focus.selStart, state.focus.selEnd);
          }
        } catch (error) { /* 某些 input 类型不支持选区 */ }
      }
    }
  }

  function renderTaskMeta(task, listName, showList) {
    var parts = [];
    if (task.importance === 'important') parts.push('<span class="priority-dot high" title="重要"></span>');
    if (showList && listName) parts.push('<span class="list-context">' + escapeHtml(listName) + '</span>');
    if (task.dueDateTime) {
      var dateClass = isOverdue(task) ? 'is-overdue' : (isToday(task) ? 'is-today' : '');
      parts.push('<span class="due-date ' + dateClass + '">' + icon(isOverdue(task) ? 'warning' : 'calendar') + escapeHtml(task.status === 'completed' ? formatDate(task.dueDateTime) : relativeDate(task.dueDateTime)) + '</span>');
    }
    if (task.reminderDateTime) parts.push('<span class="reminder-marker" title="提醒 ' + escapeAttribute(formatDateTime(task.reminderDateTime)) + '" aria-label="提醒 ' + escapeAttribute(formatDateTime(task.reminderDateTime)) + '">' + icon('clock') + '</span>');
    if (task.recurrence && task.recurrence !== 'none') {
      var recurrenceLabels = { daily: '每天', weekly: '每周', monthly: '每月' };
      parts.push('<span class="task-recurrence">' + escapeHtml(recurrenceLabels[task.recurrence] || '重复任务') + '</span>');
    }
    if (!parts.length) parts.push('<span>无到期日</span>');
    return parts.join('<span aria-hidden="true">·</span>');
  }

  function renderTaskRow(task, listId, showList) {
    var list = getLists().find(function (item) { return item.id === listId; });
    var completed = task.status === 'completed';
    var busy = isTaskBusy(task.id);
    return '<div class="task-row simple-task-row' + (completed ? ' is-completed' : '') + (busy ? ' is-pending' : '') + '" data-task-row="' + escapeAttribute(task.id) + '">' +
      '<button class="task-check' + (completed ? ' is-done' : '') + '" type="button" data-action="toggle-task" data-list-id="' + escapeAttribute(listId) + '" data-task-id="' + escapeAttribute(task.id) + '"' + (busy ? ' disabled' : '') + ' aria-label="' + (completed ? '标记为未完成：' : '完成任务：') + escapeAttribute(task.title) + '">' + (completed ? icon('check') : '') + '</button>' +
      '<button class="task-main task-detail-link" type="button" data-action="edit-task" data-list-id="' + escapeAttribute(listId) + '" data-task-id="' + escapeAttribute(task.id) + '"' + (busy ? ' disabled' : '') + '><span class="task-title">' + escapeHtml(task.title) + '</span><span class="task-meta">' + renderTaskMeta(task, list ? list.name : '', showList) + '</span></button>' +
      '<div class="row-quick-actions"><select class="status-select" data-task-status data-list-id="' + escapeAttribute(listId) + '" data-task-id="' + escapeAttribute(task.id) + '" aria-label="更新任务状态：' + escapeAttribute(task.title) + '"' + (busy ? ' disabled' : '') + '>' + statusOptions(task.status) + '</select><button class="task-action-button row-edit" type="button" data-action="edit-task" data-list-id="' + escapeAttribute(listId) + '" data-task-id="' + escapeAttribute(task.id) + '" aria-label="编辑任务：' + escapeAttribute(task.title) + '" title="编辑任务"' + (busy ? ' disabled' : '') + '>' + icon('edit') + '</button></div>' +
      (busy ? '<span class="row-loader" aria-label="正在同步"></span>' : '') + '</div>';
  }

  function renderBoardTask(task, listId, listName) {
    var busy = isTaskBusy(task.id);
    return '<article class="board-task' + (busy ? ' is-pending' : '') + '" draggable="true" tabindex="0" role="button" data-action="edit-task" data-board-task data-list-id="' + escapeAttribute(listId) + '" data-task-id="' + escapeAttribute(task.id) + '" aria-label="查看任务：' + escapeAttribute(task.title) + '">' +
      '<div class="task-title">' + escapeHtml(task.title) + '</div><div class="task-meta">' + renderTaskMeta(task, listName || '', Boolean(listName)) + '</div>' +
      (busy ? '<span class="row-loader" aria-label="正在同步"></span>' : '') + '</article>';
  }

  function renderConnectionDot() {
    var auth = appState.auth || {};
    var className = auth.supported && !auth.authenticated
      ? (auth.status === 'pending' ? '' : 'is-error')
      : (appState.health.ok ? 'is-connected' : (appState.error ? 'is-error' : ''));
    return '<span class="connection-dot ' + className + '" aria-hidden="true"></span>';
  }

  function renderSidebar() {
    var active = appState.activeListId;
    var listItems = getLists().map(function (list) {
      // “全部待办”和具体清单是互斥范围；全部模式下不要让上次清单继续亮起。
      var isActive = appState.scope !== 'all' && list.id === active && appState.view !== 'focus' && appState.view !== 'all';
      var item = '<button class="list-nav-item' + (list.isFlaggedEmails ? ' is-other' : '') + '" type="button" data-action="open-list" data-list-id="' + escapeAttribute(list.id) + '" aria-current="' + (isActive ? 'true' : 'false') + '" title="' + escapeAttribute(list.name) + '">' +
        '<span class="nav-icon">' + icon('list') + '</span><span class="list-name">' + escapeHtml(list.name) + '</span><span class="count">' + taskCount(list.id, false) + '</span></button>';
      var isSystemList = list.wellknownListName && list.wellknownListName !== 'none';
      var remove = isSystemList
        ? ''
        : '<button class="list-delete-btn" type="button" data-action="delete-list" data-list-id="' + escapeAttribute(list.id) + '" data-list-name="' + escapeAttribute(list.name) + '" title="删除清单" aria-label="删除清单 ' + escapeAttribute(list.name) + '">&times;</button>';
      return '<div class="list-nav-row">' + item + remove + '</div>';
    }).join('');
    if (!listItems) listItems = '<div class="mode-note" style="padding: 5px 10px;">还没有可用清单</div>';
    var allSelected = appState.scope === 'all';
    var allTasksItem = '<button class="list-nav-item sidebar-all-tasks" type="button" data-action="set-scope" data-scope="all" aria-current="' + (allSelected ? 'true' : 'false') + '" title="跨清单查看所有任务（保持当前视图）">' +
      '<span class="nav-icon">' + icon('check') + '</span><span class="list-name">全部待办</span><span class="count">' + allTaskCount(true) + '</span></button>';
    return '<aside class="sidebar" aria-label="项目导航">' +
      '<div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><div><h1>轻量项目助理</h1><p>TO DO CONTROL DESK</p></div></div>' +
      '<div class="connection-pill">' + renderConnectionDot() + '<span>' + ((appState.auth && appState.auth.supported && !appState.auth.authenticated) ? (appState.auth.status === 'pending' ? '等待登录' : '需要登录') : (appState.health.ok ? 'To Do 已连接' : (appState.error ? '连接失败' : '正在连接'))) + '</span></div>' +
      '<p class="side-label">我的工作</p>' +
      '<nav class="list-nav">' +
      allTasksItem + listItems +
      '</nav>' +
      '<button class="list-nav-item sidebar-new-project" type="button" data-action="create-list"><span class="nav-icon">' + icon('plus') + '</span><span class="list-name">新建项目</span></button>' +
      '<div class="sidebar-spacer"></div>' +
      '<div class="sidebar-tools"><button class="list-nav-item" type="button" data-action="open-settings"><span class="nav-icon">' + icon('settings') + '</span><span class="list-name">设置</span></button></div>' +
      '</aside>';
  }

  function pageHeading() {
    if (appState.view === 'focus') return { title: '今日任务', subtitle: '所有清单中今天到期或提醒的任务。' };
    if (appState.view === 'all') return { title: '全部待办', subtitle: '跨清单查看所有任务，完成项排在最后。' };
    if (appState.view === 'ai') return { title: 'AI 助理', subtitle: '一起整理下一步，确认后写入日程。' };
    var active = getActiveList();
    var scopeLabel = isScopeAll() ? '全部待办' : (active ? active.name : '');
    if (appState.view === 'board') return { title: scopeLabel || '任务看板', subtitle: '拖动任务卡更新状态。' };
    if (appState.view === 'calendar') return { title: scopeLabel || '项目日历', subtitle: '按到期时间查看工作安排。' };
    if (appState.view === 'timeline') return { title: scopeLabel || '时间线', subtitle: '回看任务和进展记录。' };
    if (appState.view === 'matrix') return { title: scopeLabel || '四象限', subtitle: '按重要性和紧急程度安排任务。' };
    return { title: scopeLabel || '任务清单', subtitle: '查看并整理当前任务。' };
  }

  function renderTopbar(animateView) {
    var heading = pageHeading();
    var active = getActiveList();
    var aiActions = appState.view === 'ai' ? '<button class="button quiet" type="button" data-action="new-ai-chat"' + (appState.ai.loading || appState.ai.applying || appState.ai.listening ? ' disabled' : '') + '>新对话</button>' : '';
    var context = appState.view === 'ai' ? '<span class="ai-list-context">' + escapeHtml(active ? active.name : '请选择清单') + ' · ' + escapeHtml(modeLabel(appState.health.mode)) + '</span>' : '';
    return '<header class="topbar"><div><h2>' + escapeHtml(heading.title) + '</h2>' + context + '</div><div class="topbar-actions">' + renderScopeToggle() + renderTabs(animateView) + aiActions + '<button class="sync-status" type="button" data-action="sync" aria-label="立即同步" title="立即同步"' + (appState.syncing ? ' disabled' : '') + '>' + icon('refresh') + '<span aria-live="polite">' + (appState.syncing ? '同步中…' : (appState.health.ok ? '已同步' : '未连接')) + '</span></button><button class="button quiet" type="button" data-action="create-project-schedule">' + icon('calendar') + '项目排期</button></div></header>';
  }

  function renderTabs(animateView) {
    if (appState.view === 'focus' || appState.view === 'ai' || appState.view === 'all') return '';
    var primary = [['timeline', '时间线'], ['matrix', '四象限']];
    return '<div class="view-switcher"><div class="view-tabs" role="tablist" aria-label="工作视图">' + primary.map(function (item) {
      var selected = appState.view === item[0];
      return '<button class="view-tab' + (animateView && selected ? ' is-view-selected' : '') + '" type="button" data-view="' + item[0] + '" role="tab" aria-selected="' + selected + '">' + item[1] + '</button>';
    }).join('') + '</div></div>';
  }

  function renderCapture() {
    var active = getActiveList();
    if (!active) return '';
    return '<section class="capture-compact" aria-label="快速添加"><form class="capture-form" data-form="quick-add"><label class="sr-only" for="quick-title">任务内容</label><input class="capture-input" id="quick-title" name="title" maxlength="180" autocomplete="off" placeholder="＋ 添加待办到 ' + escapeAttribute(active.name) + '" value="' + escapeAttribute(appState.quickDraft) + '" required><input type="hidden" name="listId" value="' + escapeAttribute(active.id) + '"><button class="button primary" type="submit" aria-label="添加任务">' + icon('plus') + '</button><button class="button quiet" type="button" data-action="open-ai">一句话安排</button></form></section>';
  }
  function renderMetricGrid() {
    var records = getScopeRecords();
    var done = records.filter(function (record) { return record.task.status === 'completed'; }).length;
    var overdue = records.filter(function (record) { return isOverdue(record.task); }).length;
    var dueToday = records.filter(function (record) { return isTodayTask(record.task) && record.task.status !== 'completed'; }).length;
    return '<div class="metric-grid metric-strip" aria-label="任务统计">' +
      '<div class="metric"><span class="metric-value">' + records.length + '</span><span class="metric-label">全部任务</span></div>' +
      '<div class="metric"><span class="metric-value">' + done + '</span><span class="metric-label">已完成</span></div>' +
      '<div class="metric' + (overdue ? ' is-alert' : '') + '"><span class="metric-value">' + (overdue || dueToday) + '</span><span class="metric-label">' + (overdue ? '逾期任务' : '今日待办') + '</span></div>' +
      '</div>';
  }

  function focusSort(a, b) {
    var overdueA = isOverdue(a.task) ? 0 : 1;
    var overdueB = isOverdue(b.task) ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    var dueA = dateObject(a.task.dueDateTime);
    var dueB = dateObject(b.task.dueDateTime);
    if (dueA && dueB) return dueA.getTime() - dueB.getTime();
    if (dueA) return -1;
    if (dueB) return 1;
    return (dateObject(b.task.lastModifiedDateTime) || new Date(0)).getTime() - (dateObject(a.task.lastModifiedDateTime) || new Date(0)).getTime();
  }

  function getFocusTasks() {
    return getScopeRecords().filter(function (record) {
      return isTodayTask(record.task);
    }).sort(focusSort);
  }

  function renderTodayGroup(title, records) {
    if (!records.length) return '';
    return '<section class="today-task-group"><h4>' + title + ' <span>' + records.length + '</span></h4><div class="task-list">' + records.map(function (record) {
      return renderTaskRow(record.task, record.list.id, true);
    }).join('') + '</div></section>';
  }

  function renderFocusView() {
    var today = getFocusTasks();
    var pending = today.filter(function (record) { return record.task.status !== 'completed'; });
    var completed = today.filter(function (record) { return record.task.status === 'completed'; });
    var overdue = getScopeRecords().filter(function (record) { return isOverdue(record.task) && !isTodayTask(record.task); }).sort(focusSort);
    var progressList = getProjectLists();
    return renderMetricGrid() +
      '<div class="focus-grid"><section class="card focus-card"><div class="section-heading"><div><h3>今天的全部任务 · ' + today.length + '</h3></div><button class="button quiet" type="button" data-action="set-scope" data-scope="all">全部待办' + icon('arrow') + '</button></div>' +
      renderTodayGroup('待完成', pending) +
      (today.length ? '' : '<div class="empty-state"><div><strong>今天没有安排</strong><p>无日期任务和未来任务可在“全部待办”中查看。</p></div></div>') +
      renderTodayGroup('今天安排 · 已完成', completed) + renderTodayGroup('此前逾期', overdue) +
      '</section>' + renderLayoutResizer('focus') + '<section class="card progress-card"><div class="section-heading"><h3>项目进度</h3></div>' + renderOverallProgress() + '<div class="mini-progress-list">' + (progressList.length ? progressList.map(renderMiniProgress).join('') : '<div class="empty-state"><strong>暂无项目</strong></div>') + '</div></section></div>';
  }

  function renderOverallProgress() {
    var records = getProjectTaskRecords();
    var progress = progressForTasks(records.map(function (record) { return record.task; }));
    var done = records.filter(function (record) { return record.task.status === 'completed'; }).length;
    return '<div class="progress-highlight"><div class="progress-copy"><strong>' + progress + '% 已完成</strong><span>' + done + ' / ' + records.length + ' 件任务</span><div class="progress-bar" data-progress="' + progress + '%"><span></span></div></div></div>';
  }

  function renderMiniProgress(list) {
    var tasks = getTasks(list.id);
    var progress = progressForTasks(tasks);
    return '<div class="mini-progress-item"><div class="mini-progress-head"><span>' + escapeHtml(list.name) + '</span><span>' + progress + '%</span></div><div class="progress-bar" data-progress="' + progress + '%"><span></span></div></div>';
  }

  function renderListView() {
    var aggregate = isScopeAll();
    var active = getActiveList();
    if (!active && !aggregate) return renderNoListCard();
    var records = getScopeRecords();
    var total = records.length;
    if (appState.listFilter !== 'all') records = records.filter(function (record) { return record.task.status === appState.listFilter; });
    records.sort(function (a, b) {
      if (a.task.status === 'completed' && b.task.status !== 'completed') return 1;
      if (a.task.status !== 'completed' && b.task.status === 'completed') return -1;
      return focusSort(a, b);
    });
    return '<section class="card list-card"><div class="list-toolbar"><div class="section-heading"><div><h3>' + (aggregate ? '所有清单' : '任务列表') + '</h3><p>' + records.length + ' / ' + total + ' 件任务' + (aggregate ? ' · 包含默认清单和标记邮件' : '') + '</p></div></div><div class="toolbar-actions"><label class="sr-only" for="task-filter">筛选状态</label><select class="filter-select" id="task-filter" data-action="filter" aria-label="筛选任务状态"><option value="all"' + (appState.listFilter === 'all' ? ' selected' : '') + '>全部状态</option>' + BOARD_COLUMNS.map(function (column) { return '<option value="' + column.id + '"' + (appState.listFilter === column.id ? ' selected' : '') + '>' + column.label + '</option>'; }).join('') + '</select></div></div>' +
      (records.length ? '<div class="task-list dense">' + records.map(function (record) { return renderTaskRow(record.task, record.list.id, aggregate); }).join('') + '</div>' : '<div class="empty-state"><div><strong>没有符合条件的任务</strong><p>可切换“全部状态”，或用上方输入框添加待办。</p></div></div>') + '</section>';
  }

  function renderNoListCard() {
    return '<section class="card error-state"><div><div class="error-icon">' + icon('database') + '</div><h3>没有可显示的 To Do 清单</h3><p>任务数据只来自 Microsoft To Do API。请确认服务端连接和账号权限后重试。</p><button class="button primary" type="button" data-action="refresh">' + icon('refresh') + '重新连接</button></div></section>';
  }

  function renderBoardView() {
    var aggregate = isScopeAll();
    var active = getActiveList();
    if (!active && !aggregate) return renderNoListCard();
    var records = getScopeRecords();
    var scopeLabel = aggregate ? '所有清单' : (active ? active.name : '');
    return '<section class="card list-card"><div class="list-toolbar"><div class="section-heading" style="margin:0"><div><h3>状态看板</h3><p>' + (aggregate ? '跨清单汇总，拖动任务卡调整进度。' : '拖动任务卡，快速调整进度。') + ' 触控板双指可缩放。</p></div></div><div class="toolbar-actions"><span class="board-scale-readout" title="触控板双指缩放">看板 <output data-board-scale-output>' + boardScaleText(appState.boardScale) + '</output></span>' + (scopeLabel ? '<span class="tag">' + escapeHtml(scopeLabel) + '</span>' : '') + '</div></div><div class="board">' + BOARD_COLUMNS.map(function (column) {
      var columnRecords = records.filter(function (record) { return record.task.status === column.id; });
      return '<section class="board-column" data-board-status="' + column.id + '" aria-label="' + column.label + '"><div class="board-column-head"><div class="board-column-title"><span class="column-dot ' + column.dot + '"></span>' + column.label + '</div><span class="board-column-count">' + columnRecords.length + '</span></div><div class="board-task-list">' + (columnRecords.length ? columnRecords.map(function (record) { return renderBoardTask(record.task, record.list.id, aggregate ? record.list.name : ''); }).join('') : '<div class="drop-hint">把任务拖到这里</div>') + '</div></section>';
    }).join('') + '</div></section>';
  }

  function dayStart(value) {
    var date = value instanceof Date ? new Date(value.getTime()) : dateObject(value);
    if (!date) date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addCalendarDays(value, amount) {
    var date = dayStart(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function mondayOfWeek(value) {
    var date = dayStart(value);
    var offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return date;
  }

  function calendarRecords() {
    return getScopeRecords().filter(function (record) {
      return Boolean(dateObject(record.task.dueDateTime));
    }).sort(function (a, b) {
      return dateObject(a.task.dueDateTime).getTime() - dateObject(b.task.dueDateTime).getTime();
    });
  }

  function calendarTaskChip(record) {
    var completed = record.task.status === 'completed';
    return '<button class="calendar-task' + (completed ? ' is-completed' : '') + '" type="button" data-action="edit-task" data-list-id="' + escapeAttribute(record.list.id) + '" data-task-id="' + escapeAttribute(record.task.id) + '" title="' + escapeAttribute(record.list.name + ' · ' + record.task.title) + '"><span>' + escapeHtml(record.task.title) + '</span><small>' + escapeHtml(record.list.name) + '</small></button>';
  }

  function renderMonthCalendar(records, anchor) {
    var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var start = addCalendarDays(first, -((first.getDay() + 6) % 7));
    var cells = [];
    for (var index = 0; index < 42; index += 1) {
      var date = addCalendarDays(start, index);
      var key = dateKey(date);
      var matches = records.filter(function (record) { return dateKey(record.task.dueDateTime) === key; });
      var expanded = Boolean(appState.expandedCalendarDays[key]);
      var classes = ['calendar-day'];
      if (date.getMonth() !== anchor.getMonth()) classes.push('is-outside');
      if (key === todayKey()) classes.push('is-today');
      cells.push('<section class="' + classes.join(' ') + '" aria-label="' + escapeAttribute((date.getMonth() + 1) + '月' + date.getDate() + '日') + '"><div class="calendar-day-head"><span>' + date.getDate() + '</span>' + (matches.length ? '<small>' + matches.length + ' 件</small>' : '') + '</div><div class="calendar-day-tasks">' + (expanded ? matches : matches.slice(0, 3)).map(calendarTaskChip).join('') + (matches.length > 3 ? '<button class="calendar-more" type="button" data-action="toggle-calendar-day" data-date="' + key + '" aria-expanded="' + expanded + '">' + (expanded ? '收起' : '展开全部（共 ' + matches.length + ' 条）') + '</button>' : '') + '</div></section>');
    }
    return '<div class="calendar-weekdays" aria-hidden="true"><span>周一</span><span>周二</span><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>周日</span></div><div class="calendar-month">' + cells.join('') + '</div>';
  }

  function renderWeekCalendar(records, anchor) {
    var start = mondayOfWeek(anchor);
    var days = [];
    for (var index = 0; index < 7; index += 1) {
      var date = addCalendarDays(start, index);
      var key = dateKey(date);
      var matches = records.filter(function (record) { return dateKey(record.task.dueDateTime) === key; });
      days.push('<section class="calendar-week-day' + (key === todayKey() ? ' is-today' : '') + '"><div class="calendar-week-head"><span>周' + '一二三四五六日'[index] + '</span><strong>' + (date.getMonth() + 1) + '/' + date.getDate() + '</strong></div><div class="calendar-week-tasks">' + (matches.length ? matches.map(calendarTaskChip).join('') : '<span class="calendar-empty-note">没有到期任务</span>') + '</div></section>');
    }
    return '<div class="calendar-week">' + days.join('') + '</div>';
  }

  function renderAgendaCalendar(records) {
    if (!records.length) return '<div class="empty-state"><div><div class="empty-icon">' + icon('calendar') + '</div><strong>还没有日程</strong><p>给 Microsoft To Do 任务设置到期时间后，会自动出现在这里。</p></div></div>';
    var groups = {};
    records.forEach(function (record) {
      var key = dateKey(record.task.dueDateTime);
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });
    return '<div class="agenda-list">' + Object.keys(groups).sort().map(function (key) {
      var date = dateObject(key + 'T12:00:00');
      var label = key < todayKey() ? '已逾期 · ' : (key === todayKey() ? '今天 · ' : '');
      label += date ? (date.getMonth() + 1) + '月' + date.getDate() + '日' : key;
      return '<section class="agenda-group"><div class="agenda-date"><strong>' + escapeHtml(label) + '</strong><span>' + groups[key].length + ' 件</span></div><div class="agenda-tasks">' + groups[key].map(calendarTaskChip).join('') + '</div></section>';
    }).join('') + '</div>';
  }

  function renderYearCalendar(records, anchor) {
    var months = [];
    for (var month = 0; month < 12; month += 1) {
      var matching = records.filter(function (record) {
        var due = dateObject(record.task.dueDateTime);
        return due && due.getFullYear() === anchor.getFullYear() && due.getMonth() === month;
      });
      var done = matching.filter(function (record) { return record.task.status === 'completed'; }).length;
      months.push('<section class="year-month"><div><strong>' + (month + 1) + '月</strong><span>' + matching.length + ' 件任务</span></div><div class="progress-bar" data-progress="' + progressForTasks(matching.map(function (record) { return record.task; })) + '%"><span></span></div><small>' + done + ' 件已完成</small></section>');
    }
    return '<div class="calendar-year">' + months.join('') + '</div>';
  }

  function calendarTitle(anchor, mode) {
    if (mode === 'year') return anchor.getFullYear() + ' 年';
    if (mode === 'week') {
      var start = mondayOfWeek(anchor);
      var end = addCalendarDays(start, 6);
      return (start.getMonth() + 1) + '月' + start.getDate() + '日 — ' + (end.getMonth() + 1) + '月' + end.getDate() + '日';
    }
    if (mode === 'agenda') return '全部到期任务';
    return anchor.getFullYear() + ' 年 ' + (anchor.getMonth() + 1) + ' 月';
  }

  function renderCalendarView() {
    var records = calendarRecords();
    var anchor = appState.calendarAnchor instanceof Date ? appState.calendarAnchor : new Date();
    var mode = appState.calendarMode;
    var body = mode === 'year' ? renderYearCalendar(records, anchor) : (mode === 'week' ? renderWeekCalendar(records, anchor) : (mode === 'agenda' ? renderAgendaCalendar(records) : renderMonthCalendar(records, anchor)));
    var modes = [['year', '年'], ['month', '月'], ['week', '周'], ['agenda', '日程']];
    return '<section class="card calendar-card"><div class="calendar-toolbar"><div><h3>' + escapeHtml(calendarTitle(anchor, mode)) + '</h3><p>按任务到期时间查看安排。</p></div><div class="calendar-controls"><div class="calendar-nav"><button class="icon-button" type="button" data-action="calendar-prev" aria-label="上一段时间">‹</button><button class="button ghost" type="button" data-action="calendar-today">今天</button><button class="icon-button" type="button" data-action="calendar-next" aria-label="下一段时间">›</button></div><div class="calendar-modes" aria-label="日历视图">' + modes.map(function (item) { return '<button type="button" data-calendar-mode="' + item[0] + '" aria-pressed="' + (mode === item[0] ? 'true' : 'false') + '">' + item[1] + '</button>'; }).join('') + '</div></div></div>' + body + '</section>';
  }

  function isMatrixUrgent(task) {
    if (!task.dueDateTime || task.status === 'completed') return false;
    var due = dayStart(task.dueDateTime);
    var horizon = addCalendarDays(new Date(), 3);
    return due.getTime() <= horizon.getTime();
  }

  function renderMatrixTask(task, listId) {
    return '<button class="matrix-task" type="button" data-action="edit-task" data-list-id="' + escapeAttribute(listId) + '" data-task-id="' + escapeAttribute(task.id) + '"><span class="task-title">' + escapeHtml(task.title) + '</span><span class="task-meta">' + (task.dueDateTime ? escapeHtml(relativeDate(task.dueDateTime)) : '无到期日') + '</span></button>';
  }

  function renderMatrixView() {
    var aggregate = isScopeAll();
    var active = getActiveList();
    if (!active && !aggregate) return renderNoListCard();
    var scopeRecords = getScopeRecords().filter(function (record) { return record.task.status !== 'completed'; });
    var quadrants = [
      { id: 'do', title: '立即处理', subtitle: '重要且紧急', test: function (task) { return task.importance === 'important' && isMatrixUrgent(task); } },
      { id: 'plan', title: '安排时间', subtitle: '重要但不紧急', test: function (task) { return task.importance === 'important' && !isMatrixUrgent(task); } },
      { id: 'quick', title: '快速清理', subtitle: '紧急但不重要', test: function (task) { return task.importance !== 'important' && isMatrixUrgent(task); } },
      { id: 'later', title: '稍后考虑', subtitle: '不重要且不紧急', test: function (task) { return task.importance !== 'important' && !isMatrixUrgent(task); } }
    ];
    return '<section class="card matrix-card"><div class="section-heading"><div><h3>艾森豪威尔四象限</h3><p>根据重要性和到期时间自动归类。</p></div><span class="tag">' + escapeHtml(aggregate ? '所有清单' : (active ? active.name : '')) + '</span></div><div class="matrix-grid">' + quadrants.map(function (quadrant) {
      var matching = scopeRecords.filter(function (record) { return quadrant.test(record.task); });
      return '<section class="matrix-quadrant ' + quadrant.id + '"><div class="matrix-heading"><div><strong>' + quadrant.title + '</strong><span>' + quadrant.subtitle + '</span></div><b>' + matching.length + '</b></div><div class="matrix-task-list">' + (matching.length ? matching.map(function (record) { return renderMatrixTask(record.task, record.list.id); }).join('') : '<div class="matrix-empty">这里暂时没有任务</div>') + '</div></section>';
    }).join('') + '</div></section>';
  }

  function timelineSort(a, b) {
    var aDate = dateObject(a.value);
    var bDate = dateObject(b.value);
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.getTime() - bDate.getTime();
  }

  function getNotes(listId) {
    var source = appState.notesByList[listId];
    if (!Array.isArray(source)) return [];
    return source;
  }

  function renderTimelineView() {
    var aggregate = isScopeAll();
    var active = getActiveList();
    if (!active && !aggregate) return renderNoListCard();
    var records = getScopeRecords().map(function (record) {
      return { kind: 'task', task: record.task, list: record.list, value: record.task.dueDateTime || record.task.lastModifiedDateTime || record.task.createdDateTime };
    });
    var scopeNotes = [];
    (aggregate ? getLists() : [active]).forEach(function (list) {
      getNotes(list.id).forEach(function (note) {
        records.push({ kind: 'note', note: note, value: note.createdAt || note.createdDateTime });
        scopeNotes.push(note);
      });
    });
    records.sort(timelineSort);
    return '<div class="timeline-layout"><section class="card timeline-card"><div class="section-heading"><div><h3>任务时间线</h3><p>按日期回看任务和进展。</p></div><span class="tag">' + records.length + ' 条</span></div>' +
      (records.length ? '<div class="timeline">' + records.map(function (record) {
        if (record.kind === 'note') {
          return '<div class="timeline-item is-note"><span class="timeline-date">进展 · ' + escapeHtml(formatDateTime(record.value)) + '</span><span class="timeline-title">' + escapeHtml(record.note.content || record.note.body || '') + '</span><span class="timeline-subtitle">项目日志</span></div>';
        }
        var task = record.task;
        return '<div class="timeline-item' + (isOverdue(task) ? ' is-overdue' : '') + '"><span class="timeline-date">' + escapeHtml(record.value ? (task.dueDateTime ? '到期 · ' : '更新 · ') + formatDateTime(record.value) : '暂无日期') + '</span><span class="timeline-title">' + escapeHtml(task.title) + '</span><span class="timeline-subtitle">' + (record.list ? escapeHtml(record.list.name) + ' · ' : '') + escapeHtml(STATUS_LABELS[task.status]) + (task.status === 'completed' ? ' · 已完成' : '') + '</span></div>';
      }).join('') + '</div>' : '<div class="empty-state"><div><div class="empty-icon">' + icon('timeline') + '</div><strong>还没有时间线</strong><p>给任务添加到期日或开始记录进展后，这里会更有参考价值。</p></div></div>') + '</section>' + renderLayoutResizer('timeline') +
      '<aside class="card timeline-note-card"><div class="section-heading"><div><h3>记录进展</h3><p>把一段可追溯的工作摘要留在当前清单。</p></div></div><form class="timeline-note-form" data-form="progress-note"><label class="sr-only" for="progress-note">进展内容</label><textarea class="field" id="progress-note" name="content" maxlength="1000" placeholder="例如：已完成首页文案初稿，等待设计确认。" required>' + escapeHtml(appState.noteDraft) + '</textarea><button class="button primary" type="submit">' + icon('plus') + '保存记录</button></form>' +
      (scopeNotes.length ? '<div class="note-list">' + scopeNotes.map(function (note) { return '<div class="note-item"><p>' + escapeHtml(note.content || note.body || '') + '</p><time>' + escapeHtml(formatDateTime(note.createdAt || note.createdDateTime)) + '</time></div>'; }).join('') + '</div>' : '<div class="empty-state" style="min-height:120px;padding-right:0;padding-left:0"><div><strong>还没有进展记录</strong><p>一次只记一个可回看的事实。</p></div></div>') + '</aside></div>';
  }

  function displayDateTime(value) {
    return dateObject(value) ? formatDateTime(value) : (value ? String(value) : '待定');
  }

  // 计算指定 "YYYY-MM-DD" 相对今天的整数天数（今天=0，明天=1）。
  function dayOffsetFromToday(dateKey) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dateKey)) return null;
    var t = todayKey();
    return (Date.parse(dateKey + 'T12:00:00') - Date.parse(t + 'T12:00:00')) / 86400000 | 0;
  }

  // 给指定日期加 N 天（本地历法），返回 YYYY-MM-DD。
  function shiftDayKey(dateKey, days) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dateKey)) return null;
    var d = new Date(dateKey + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // 候选项以本地 "YYYY-MM-DDTHH:mm:ss" 展示：今天/明天/后天 显示文字，其他显示 M/D HH:mm；空值显示“未设置”。
  function formatTimeLabel(localValue) {
    if (!localValue) return '未设置';
    var date = localValue.slice(0, 10);
    var time = localValue.slice(11, 16);
    var off = dayOffsetFromToday(date);
    if (off === 0) return '今天 ' + time;
    if (off === 1) return '明天 ' + time;
    if (off === 2) return '后天 ' + time;
    return (Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10))) + ' ' + time;
  }

  var TIME_SLOTS = (function () {
    var slots = [];
    for (var h = 0; h < 24; h++) for (var m = 0; m < 60; m += 30) {
      slots.push((h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m));
    }
    return slots;
  })();

  // 把 "今天/明天/后天" + 钟点拼成 "YYYY-MM-DDTHH:mm:ss"；钟点不在 30 分钟刻度上会四舍五入到最近。
  function composeLocal(dateKey, time) {
    var slot = TIME_SLOTS[0];
    for (var i = 0; i < TIME_SLOTS.length; i++) {
      if (TIME_SLOTS[i] === time) { slot = time; break; }
      // 找最近
      var a = TIME_SLOTS[i], b = time;
      if (Math.abs((parseInt(a.slice(0, 2)) * 60 + parseInt(a.slice(3))) - (parseInt(b.slice(0, 2)) * 60 + parseInt(b.slice(3)))) < 15) { slot = a; break; }
    }
    return dateKey + 'T' + slot + ':00';
  }

  function renderTimePill(index, field, current, ai) {
    var open = ai.openPicker && ai.openPicker.index === index && ai.openPicker.field === field;
    var pill = '<button type="button" class="op-time-pill' + (current ? '' : ' is-empty') + '" data-action="open-time-picker" data-op-index="' + index + '" data-op-field="' + field + '">' +
      '<span class="op-time-pill-label">' + escapeHtml(field === 'dueDateTime' ? '到期' : '提醒') + '</span>' +
      '<span class="op-time-pill-value">' + escapeHtml(formatTimeLabel(current)) + '</span>' +
      '<span class="op-time-pill-caret">▾</span></button>';
    if (!open) return pill;
    var nowKey = todayKey();
    var curDate = current ? current.slice(0, 10) : nowKey;
    var curTime = current ? current.slice(11, 16) : '09:00';
    var curOff = dayOffsetFromToday(curDate);
    var chips = [
      { label: '今天', off: 0 },
      { label: '明天', off: 1 },
      { label: '后天', off: 2 },
      { label: '3 天后', off: 3 },
      { label: '一周后', off: 7 },
    ];
    var chipsHtml = chips.map(function (c) {
      var sel = curOff === c.off;
      return '<button type="button" class="op-date-chip' + (sel ? ' is-selected' : '') + '" data-op-time-action="set-offset" data-op-time-value="' + c.off + '" data-op-index="' + index + '" data-op-field="' + field + '">' + escapeHtml(c.label) + '</button>';
    }).join('') + '<button type="button" class="op-date-chip op-date-chip-clear" data-op-time-action="set-offset" data-op-time-value="clear" data-op-index="' + index + '" data-op-field="' + field + '">清除</button>';
    var wheelHtml = TIME_SLOTS.map(function (t) {
      return '<div class="op-time-wheel-item' + (t === curTime ? ' is-selected' : '') + '" data-op-time-value="' + t + '">' + t + '</div>';
    }).join('');
    return pill +
      '<div class="op-time-panel" data-op-index="' + index + '" data-op-field="' + field + '">' +
      '<div class="op-date-chips">' + chipsHtml + '</div>' +
      '<div class="op-time-wheel" data-op-index="' + index + '" data-op-field="' + field + '">' + wheelHtml + '</div>' +
      '<div class="op-time-panel-foot"><button type="button" class="button quiet small" data-action="close-time-picker" data-op-index="' + index + '" data-op-field="' + field + '">完成</button></div>' +
      '</div>';
  }

  function operationLabel(operation) {
    var type = String(operation && operation.type || '').toLowerCase();
    if (type === 'create') return '新建任务';
    if (type === 'status' || type === 'update') return '更新任务';
    if (type === 'delete') return '删除任务';
    if (type === 'progressnote' || type === 'progress-note') return '记录进展';
    return operation && operation.type ? String(operation.type) : '待处理';
  }

  function renderProjectSteps(project) {
    var steps = project && Array.isArray(project.steps) ? project.steps : [];
    return '<div class="project-plan"><div class="project-plan-head"><div><strong>' + escapeHtml(project && project.projectName || project && project.name || '项目排期') + '</strong><span>从 ' + escapeHtml(project && project.startDate || '接入日期') + ' 开始</span></div></div>' +
      (steps.length ? '<div class="project-step-list">' + steps.map(function (step, index) {
        var item = isObject(step) ? step : {};
        return '<div class="project-step"><span class="project-step-index">' + (index + 1) + '</span><div><strong>' + escapeHtml(item.title || '未命名节点') + '</strong><span>到期 ' + escapeHtml(displayDateTime(item.dueDateTime || item.dueDate)) + ' · 提醒 ' + escapeHtml(displayDateTime(item.reminderDateTime)) + '</span></div></div>';
      }).join('') + '</div>' : '<p class="quick-hint">没有可预览的排期节点。</p>') +
      ((project && Array.isArray(project.warnings) && project.warnings.length) ? '<div class="plan-warnings" role="status">' + icon('warning') + '<div>' + project.warnings.map(function (warning) { return '<span>' + escapeHtml(warning) + '</span>'; }).join('') + '</div></div>' : '') +
      '</div>';
  }

  function resultSucceeded(result) {
    if (!isObject(result)) return true;
    return result.ok !== false && result.success !== false && !result.error && result.status !== 'failed';
  }

  function renderApplyResults(result) {
    if (!result || !Array.isArray(result.results)) return '';
    var complete = result.complete === true;
    var hasError = Boolean(result.error);
    var succeeded = result.results.filter(resultSucceeded).length;
    var headText = complete ? '已执行' : (hasError ? '有操作未完成' : '已执行选中项');
    var countText = complete ? succeeded + ' / ' + (Array.isArray(result.operations) ? result.operations.length : result.results.length) + ' 项' : succeeded + ' 项已写入';
    return '<div class="apply-results"><div class="ai-result-head"><strong>' + headText + '</strong><span>' + countText + '</span></div><div class="apply-result-list">' + result.results.map(function (item) {
      var ok = resultSucceeded(item);
      var label = item && (item.title || (item.task && item.task.title) || item.taskTitle || item.message || item.error || (item.type === 'createdProject' ? '项目已创建' : '')) || '操作已返回';
      return '<span class="apply-result-item ' + (ok ? 'is-ok' : 'is-failed') + '">' + (ok ? '✓' : '×') + ' ' + escapeHtml(label) + '</span>';
    }).join('') + '</div>' + (result.error ? '<p class="inline-error" role="alert">' + escapeHtml(result.error) + '</p>' : '') + '</div>';
  }

  function ensureAiPlanState(preview) {
    var ai = appState.ai;
    var operations = preview && Array.isArray(preview.operations) ? preview.operations : [];
    if (!Array.isArray(ai.opSelection) || ai.opSelection.length !== operations.length) {
      ai.opSelection = operations.map(function () { return true; });
    }
    if (!isObject(ai.opEdits)) ai.opEdits = {};
    if (!Array.isArray(ai.completedOps)) {
      ai.completedOps = preview && Array.isArray(preview.completed) ? preview.completed.slice() : [];
    }
    if (!isObject(ai.openPicker)) ai.openPicker = null;
  }

  function editedOperation(item, index) {
    var edit = appState.ai.opEdits && appState.ai.opEdits[index];
    return edit ? Object.assign({}, item, edit) : item;
  }

  // 写回单个操作的时间编辑：保留学到的 “当前日期来源”，优先用刚选中的芯片偏移，再用现有 edit。
  function applyTimeSelection(index, field, time) {
    var ai = appState.ai;
    if (!isObject(ai.opEdits)) ai.opEdits = {};
    var edit = isObject(ai.opEdits[index]) ? ai.opEdits[index] : {};
    // 决定日期来源：若当前 edit 已有 field 的日期，保持；否则沿用原 op 的日期；都没有则用今天。
    var opValue = (appState.ai && appState.ai.preview && appState.ai.preview.operations && appState.ai.preview.operations[index]) || {};
    var source = edit[field] || opValue[field];
    var dateKey = source ? String(source).slice(0, 10) : todayKey();
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dateKey)) dateKey = todayKey();
    var local = composeLocal(dateKey, time);
    if (field === 'reminderDateTime' && opValue.reminderDateTime === null) {
      // 原 op 显式清除了提醒，再次清除。
      edit.clearReminder = true;
      delete edit.reminderDateTime;
    } else {
      edit[field] = local;
      if (field === 'reminderDateTime') edit.clearReminder = false;
    }
    if (Object.keys(edit).length) ai.opEdits[index] = edit; else delete ai.opEdits[index];
    updateTimePillDisplay(index, field, local);
    saveAiConversation(ai);
  }

  // 只更新触发器胶囊的显示文案，不触发全量渲染，保持面板的滚动和动画连续。
  function updateTimePillDisplay(index, field, local) {
    var panel = document.querySelector('.op-time-panel[data-op-index="' + index + '"][data-op-field="' + field + '"]');
    if (panel) {
      var pill = panel.parentNode ? panel.parentNode.querySelector('.op-time-pill[data-op-index="' + index + '"][data-op-field="' + field + '"]') : null;
      if (pill) {
        var valueEl = pill.querySelector('.op-time-pill-value');
        if (valueEl) valueEl.textContent = formatTimeLabel(local);
        pill.classList.remove('is-empty');
      }
    }
  }

  function applyTimeOffset(index, field, value) {
    var ai = appState.ai;
    if (!isObject(ai.opEdits)) ai.opEdits = {};
    var edit = isObject(ai.opEdits[index]) ? ai.opEdits[index] : {};
    if (value === 'clear') {
      var op = (ai.preview && ai.preview.operations && ai.preview.operations[index]) || {};
      if (field === 'reminderDateTime' && op.reminderDateTime) edit.clearReminder = true;
      delete edit[field];
    } else {
      var off = Number(value);
      var newDate = shiftDayKey(todayKey(), off);
      var current = edit[field] || (ai.preview && ai.preview.operations && ai.preview.operations[index] && ai.preview.operations[index][field]) || '';
      var time = current ? current.slice(11, 16) : '09:00';
      var local = composeLocal(newDate, time);
      edit[field] = local;
      if (field === 'reminderDateTime') edit.clearReminder = false;
    }
    if (Object.keys(edit).length) ai.opEdits[index] = edit; else delete ai.opEdits[index];
    updateTimePillDisplay(index, field, edit[field] || '');
    // 更新轮上的选中态
    var panel = document.querySelector('.op-time-panel[data-op-index="' + index + '"][data-op-field="' + field + '"]');
    if (panel) {
      var wheel = panel.querySelector('.op-time-wheel');
      if (wheel) {
        var items = wheel.querySelectorAll('.op-time-wheel-item');
        var cur = edit[field] ? edit[field].slice(11, 16) : '';
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle('is-selected', items[i].getAttribute('data-op-time-value') === cur);
        }
        if (cur) {
          var target = wheel.querySelector('.op-time-wheel-item.is-selected');
          if (target) wheel.scrollTop = target.offsetTop - (wheel.clientHeight / 2) + target.offsetHeight / 2;
        }
      }
    }
    saveAiConversation(ai);
  }

  // 面板刚渲染时让轮滚到当前时间刻度。
  function restoreTimeWheelScroll() {
    if (typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(function () {
      var wheels = document.querySelectorAll('.op-time-wheel');
      for (var i = 0; i < wheels.length; i++) {
        var wheel = wheels[i];
        var sel = wheel.querySelector('.op-time-wheel-item.is-selected');
        if (sel) wheel.scrollTop = sel.offsetTop - (wheel.clientHeight / 2) + sel.offsetHeight / 2;
      }
    });
  }

  function renderOperationRow(item, index, completedOps, total) {
    var ai = appState.ai;
    var isDone = completedOps.indexOf(index) !== -1;
    var clarificationLocked = Boolean(ai.needsClarification && !completedOps.length);
    var hasTimeFields = item.type === 'create' || item.type === 'update';
    var editable = hasTimeFields && !isDone && !item.clearReminder;
    var selected = ai.opSelection[index] !== false;
    var details = [operationLabel(item)];
    var edit = isObject(ai.opEdits[index]) ? ai.opEdits[index] : {};
    if (item.status) details.push(STATUS_LABELS[normalizeStatus(item.status)] || item.status);
    if (item.recurrence) details.push('重复：' + ({ none: '不重复', daily: '每天', weekly: '每周', monthly: '每月' }[item.recurrence] || item.recurrence));
    if (item.clearDueDate) details.push('清除到期时间');
    if (item.clearReminder) details.push('关闭提醒');
    if (item.clearRecurrence) details.push('关闭重复');
    if (item.importance && item.importance !== 'normal') details.push(item.importance === 'high' ? '重要' : '低优先级');
    if (item.text || item.body) details.push(item.text || item.body);
    if (item.taskTitle && item.title && item.taskTitle !== item.title) details.unshift('原任务：' + item.taskTitle);
    if (!editable) {
      if (item.dueDateTime) details.push('到期 ' + displayDateTime(item.dueDateTime));
      if (item.reminderDateTime) details.push('提醒 ' + displayDateTime(item.reminderDateTime));
    }
    var timeControls = '';
    if (editable) {
      var reminderValue = String(edit.reminderDateTime || item.reminderDateTime || '');
      var dueValue = String(edit.dueDateTime || item.dueDateTime || '');
      timeControls = '<div class="op-time-row">' +
        renderTimePill(index, 'reminderDateTime', reminderValue, ai) +
        (item.dueDateTime || edit.dueDateTime ? renderTimePill(index, 'dueDateTime', dueValue, ai) : '') +
        (item.estimatedReminder && !edit.reminderDateTime ? '<span class="op-estimate">预估·可调</span>' : '') +
        '</div>';
    }
    var marker = isDone
      ? '<span class="operation-type is-done-mark">✓</span>'
      : (total > 1 ? '<input type="checkbox" class="op-check" data-action="toggle-op" data-op-index="' + index + '"' + (selected ? ' checked' : '') + ' aria-label="选择此项">' : '<span class="operation-type"></span>');
    return '<div class="operation-item' + (isDone ? ' is-done' : '') + (!isDone && !selected ? ' is-skipped' : '') + '">' + marker +
      '<div><strong>' + escapeHtml(item.title || item.taskTitle || item.taskId || item.text || '未命名操作') + '</strong>' + (details.length ? '<span>' + escapeHtml(details.join(' · ')) + '</span>' : '') + timeControls + '</div>' +
      (!isDone ? '<button class="button quiet small op-apply" type="button" data-action="apply-op" data-op-index="' + index + '"' + (ai.applying || ai.loading || clarificationLocked ? ' disabled' : '') + '>安排此项</button>' : '') +
      '</div>';
  }

  function renderAiPreview(preview) {
    if (!preview) return '';
    var ai = appState.ai;
    var operations = Array.isArray(preview.operations) ? preview.operations : [];
    var applyResult = ai.applyResult;
    ensureAiPlanState(preview);
    var completedOps = ai.completedOps;
    return '<section class="ai-preview" aria-labelledby="ai-preview-heading"><div class="ai-preview-head"><div><h4 id="ai-preview-heading">日程草案</h4></div><button class="button quiet small" type="button" data-action="ai-quick-split" title="让 AI 把内容拆成多个独立任务"' + (ai.loading || ai.applying || ai.listening || Boolean(ai.input.trim()) ? ' disabled' : '') + '>任务拆分</button></div>' +
      (preview.project ? renderProjectSteps(preview.project) : '') +
      (!preview.project && operations.length ? '<div class="operation-list">' + operations.map(function (operation, index) {
        return renderOperationRow(isObject(operation) ? operation : {}, index, completedOps, operations.length);
      }).join('') + '</div>' : (!preview.project ? '<p class="quick-hint">没有可执行的操作。</p>' : '')) +
      (Array.isArray(preview.assumptions) && preview.assumptions.length ? '<div class="ai-assumptions"><strong>建议采用</strong><ul>' + preview.assumptions.map(function (value) { return '<li>' + escapeHtml(value) + '</li>'; }).join('') + '</ul></div>' : '') +
      (applyResult && applyResult.complete ? '<p class="preview-state">' + completedOps.length + ' 项已写入 Microsoft To Do</p>' : renderApplyResults(applyResult)) + '</section>';
  }

  function renderAiConfirmation() {
    var ai = appState.ai;
    if (!ai.preview || !ai.preview.previewId) return '';
    var complete = ai.applyResult && ai.applyResult.complete === true;
    var operations = Array.isArray(ai.preview.operations) ? ai.preview.operations : [];
    var completedOps = Array.isArray(ai.completedOps) ? ai.completedOps : [];
    var pendingCount = 0;
    var selectedCount = 0;
    operations.forEach(function (_, index) {
      if (completedOps.indexOf(index) !== -1) return;
      pendingCount += 1;
      if (ai.opSelection[index] !== false) selectedCount += 1;
    });
    var allSelected = selectedCount === pendingCount;
    var clarificationLocked = Boolean(ai.needsClarification && !completedOps.length);
    var disabled = ai.loading || ai.applying || complete || Boolean(ai.input.trim()) || ai.listening || clarificationLocked || (!pendingCount && !complete) || (!selectedCount && !complete);
    var hint = complete ? '已写入 Microsoft To Do' : (clarificationLocked ? '请先回答上面的澄清问题，再确认这份日程' : (ai.input.trim() ? '先发送补充内容，再确认新版日程' : (allSelected ? '确认后写入 To Do' : ('将只执行勾选的 ' + selectedCount + ' 项，其余保持待确认'))));
    var label = complete ? '已确认日程' : (clarificationLocked ? '请先回答问题' : (ai.applying ? '正在确认…' : (ai.confirmAttempted ? '重试未完成项' : (allSelected ? '确认日程' : '执行选中项（' + selectedCount + '）'))));
    return '<div class="ai-confirm-bar"><span class="preview-state" title="' + escapeAttribute(hint) + '">' + hint + '</span><button class="button primary" type="button" data-action="apply-ai-preview" title="' + escapeAttribute(hint) + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button></div>';
  }

  function renderAiView() {
    var active = getActiveList();
    var supportsVoice = supportsVoiceInput();
    var ai = appState.ai;
    var busy = ai.loading || ai.applying;
    // 按项执行后剩余项待确认是正常状态；只有真正报错才锁定输入要求重试。
    var unresolved = ai.confirmAttempted && Boolean(ai.lastError);
    var aiLogHeight = appState.layout.aiLogHeight;
    return '<section class="card ai-card is-primary ai-chat' + (aiLogHeight === null || aiLogHeight === undefined ? '' : ' has-custom-log-height') + '" aria-label="AI 对话">' +
      '<div class="ai-chat-log" role="log" aria-label="对话记录" aria-live="polite" aria-relevant="additions" tabindex="0">' +
      (ai.messages.length ? ai.messages.map(function (message) {
        return '<div class="ai-chat-message is-' + message.role + (message.isError ? ' is-error' : '') + '"><span class="ai-chat-author sr-only">' + (message.role === 'user' ? '你' : 'AI 助理') + '</span><div class="ai-chat-bubble">' + escapeHtml(message.content) + '</div></div>';
      }).join('') : '<div class="ai-chat-welcome"><h4>从你想完成的事开始</h4><p>不用先想好每一步。我会拆成具体任务，需要时只追问关键信息。</p><div class="command-example"><button type="button" data-example="帮我设计一下我的工作流程">帮我设计一下我的工作流程</button><button type="button" data-example="明天下午提醒我催付款">明天下午提醒我催付款</button></div></div>') +
      (ai.loading ? '<div class="ai-chat-thinking" role="status">正在整理下一步…</div>' : '') + renderAiPreview(ai.preview) + '</div>' +
      renderLayoutResizer('chat') + '<form class="ai-command-box" data-form="ai-command"><div class="ai-input-wrap"><label class="sr-only" for="ai-command-input">给 AI 发消息</label><textarea class="field" id="ai-command-input" data-ai-input maxlength="2000" rows="2" placeholder="说说你要做的事，或继续调整上面的安排…"' + (busy || unresolved ? ' disabled' : '') + '>' + escapeHtml(ai.input) + '</textarea>' +
      (supportsVoice ? '<button class="voice-button' + (ai.listening ? ' is-listening' : '') + '" type="button" data-action="start-voice" aria-label="' + (ai.listening ? '停止语音输入' : '开始中文语音输入') + '"' + (busy || unresolved ? ' disabled' : '') + '>' + icon('microphone') + '</button>' : '') +
      '<button class="button primary ai-send" type="submit" title="⌘↩ 发送"' + (busy || !active || unresolved || ai.listening ? ' disabled' : '') + '>' + (ai.loading ? '整理中…' : '发送') + '</button>' + renderAiConfirmation() + '</div>' +
      (ai.voiceMessage ? '<div class="voice-status" aria-live="polite">' + escapeHtml(ai.voiceMessage) + '</div>' : '') +
      (unresolved && !ai.applying ? '<p class="inline-error" role="alert">' + escapeHtml(ai.lastError || '请先重试未完成项；结果不确定时先同步核对。') + '</p>' : '') + '</form></section>';
  }

  function modeDescription(mode) {
    var normalized = normalizeMode(mode);
    if (normalized === 'rules') return '服务端规则整理模式，会把中文指令拆成任务；它不是 AI。';
    if (normalized === 'deepseek') return '通过服务端连接 DeepSeek 官方 API，语音先转成文字再处理。';
    if (normalized === 'openrouter-deepseek') return '通过 OpenRouter 的免费 DeepSeek 模型处理；有每日限额且可用性会波动。';
    if (normalized === 'ollama') return '通过服务端连接本地 Ollama 模型，处理后写回 To Do。';
    if (normalized === 'openai-compatible') return '通过服务端配置的 OpenAI-compatible Chat Completions API 处理。';
    return '等待服务端报告实际处理模式。';
  }

  function renderMainView() {
    if (appState.view === 'focus') return renderFocusView();
    if (appState.view === 'list' || appState.view === 'all') return renderListView();
    if (appState.view === 'board') return renderBoardView();
    if (appState.view === 'calendar') return renderCalendarView();
    if (appState.view === 'timeline') return renderTimelineView();
    if (appState.view === 'matrix') return renderMatrixView();
    return renderAiView();
  }

  function mobileNavCurrentView() {
    return appState.view === 'timeline' || appState.view === 'matrix' || appState.view === 'all' ? 'list' : appState.view;
  }

  function mobileNavTargetIndex() {
    var current = mobileNavCurrentView();
    for (var i = 0; i < MOBILE_NAV_TABS.length; i++) {
      if (MOBILE_NAV_TABS[i].id === current) return i;
    }
    return 0;
  }

  function mobileNavShouldReduceMotion() {
    if (appState.reducedMotion) return true;
    if (typeof window.matchMedia === 'function') {
      // Read the current media query so a runtime preference change (including
      // WebKit automation and macOS settings changes) takes effect immediately.
      return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    return false;
  }

  function mobileNavPx(value) {
    var rounded = Math.round((Number(value) || 0) * 100) / 100;
    return rounded + 'px';
  }

  function cancelMobileNavMotion() {
    if (mobileNavMotion.rafId && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(mobileNavMotion.rafId);
    }
    mobileNavMotion.rafId = 0;
    mobileNavMotion.lastTime = 0;
  }

  function measureMobileNav(nav) {
    if (!nav || typeof nav.getBoundingClientRect !== 'function' || !nav.querySelectorAll) return null;
    var navRect = nav.getBoundingClientRect();
    var navWidth = Number(navRect.width) || Number(nav.offsetWidth) || 0;
    var borderLeft = Number(nav.clientLeft) || 0;
    var borderTop = Number(nav.clientTop) || 0;
    var buttons = nav.querySelectorAll('button[data-view]');
    var targets = [];
    var first = null;
    var second = null;
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (!button || typeof button.getBoundingClientRect !== 'function') continue;
      var rect = button.getBoundingClientRect();
      var target = {
        x: Number(rect.left) - Number(navRect.left) - borderLeft,
        y: Number(rect.top) - Number(navRect.top) - borderTop,
        width: Number(rect.width) || Number(button.offsetWidth) || 0,
        height: Number(rect.height) || Number(button.offsetHeight) || 0
      };
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) continue;
      targets[i] = target;
      if (!first) first = target;
      else if (!second) second = target;
    }
    if (!first) return null;
    return {
      width: navWidth,
      originX: first.x,
      stepX: second ? second.x - first.x : 0,
      targets: targets
    };
  }

  function applyMobileNavFrame(settled) {
    var capsule = mobileNavMotion.capsule;
    var nav = mobileNavMotion.nav;
    if (!capsule || !nav) return;
    capsule.style.width = mobileNavPx(mobileNavMotion.width);
    capsule.style.height = mobileNavPx(mobileNavMotion.height);
    capsule.style.transform = 'translate3d(' + mobileNavPx(mobileNavMotion.x) + ', ' + mobileNavPx(mobileNavMotion.y) + ', 0)';
    nav.classList.toggle('is-capsule-settled', Boolean(settled));
  }

  function runMobileNavMotionFrame(timestamp) {
    mobileNavMotion.rafId = 0;
    if (!mobileNavMotion.nav || !mobileNavMotion.capsule) return;
    if (mobileNavShouldReduceMotion()) {
      mobileNavMotion.reducedMotion = true;
      cancelMobileNavMotion();
      mobileNavMotion.x = mobileNavMotion.targetX;
      mobileNavMotion.velocityX = 0;
      mobileNavMotion.settled = true;
      applyMobileNavFrame(true);
      return;
    }
    mobileNavMotion.reducedMotion = false;
    var previousTime = mobileNavMotion.lastTime || timestamp;
    var deltaTime = Math.min(Math.max((timestamp - previousTime) / 1000, 0), 0.05);
    mobileNavMotion.lastTime = timestamp;

    // Slightly under-damped spring: enough travel and overshoot to show direction,
    // without leaving the selected item for more than a few frames.
    var stiffness = 420;
    var damping = 30;
    var distance = mobileNavMotion.targetX - mobileNavMotion.x;
    mobileNavMotion.velocityX += distance * stiffness * deltaTime;
    mobileNavMotion.velocityX *= Math.exp(-damping * deltaTime);
    mobileNavMotion.x += mobileNavMotion.velocityX * deltaTime;

    if (Math.abs(distance) < 0.1 && Math.abs(mobileNavMotion.velocityX) < 3) {
      mobileNavMotion.x = mobileNavMotion.targetX;
      mobileNavMotion.velocityX = 0;
      mobileNavMotion.settled = true;
      mobileNavMotion.lastTime = 0;
      applyMobileNavFrame(true);
      return;
    }
    mobileNavMotion.settled = false;
    applyMobileNavFrame(false);
    if (typeof window.requestAnimationFrame === 'function') {
      mobileNavMotion.rafId = window.requestAnimationFrame(runMobileNavMotionFrame);
    }
  }

  function startMobileNavMotion() {
    if (mobileNavMotion.rafId || mobileNavMotion.settled || mobileNavMotion.reducedMotion) return;
    if (typeof window.requestAnimationFrame !== 'function') {
      mobileNavMotion.x = mobileNavMotion.targetX;
      mobileNavMotion.velocityX = 0;
      mobileNavMotion.settled = true;
      applyMobileNavFrame(true);
      return;
    }
    mobileNavMotion.rafId = window.requestAnimationFrame(runMobileNavMotionFrame);
  }

  function syncMobileNavMotion() {
    var nav = document.querySelector('.mobile-bottom-nav');
    var reducedMotion = mobileNavShouldReduceMotion();
    mobileNavMotion.reducedMotion = reducedMotion;
    if (!nav) {
      cancelMobileNavMotion();
      mobileNavMotion.nav = null;
      mobileNavMotion.capsule = null;
      return;
    }
    var measured = measureMobileNav(nav);
    var targetIndex = mobileNavTargetIndex();
    var target = measured && measured.targets[targetIndex];
    if (!target) return;

    var wasInitialized = mobileNavMotion.initialized;
    var targetChanged = !wasInitialized || mobileNavMotion.targetIndex !== targetIndex;
    var oldStep = mobileNavMotion.stepX;
    var oldOrigin = mobileNavMotion.originX;
    var oldNavWidth = mobileNavMotion.navWidth;
    var geometryChanged = wasInitialized && (
      Math.abs(oldNavWidth - measured.width) > 0.5 ||
      Math.abs(oldStep - measured.stepX) > 0.5 ||
      Math.abs(oldOrigin - measured.originX) > 0.5
    );

    // Keep the same point in the tab track when a resize changes button widths.
    // Velocity is scaled with the track so an in-flight transition stays smooth.
    if (geometryChanged && Math.abs(oldStep) > 0.5 && Math.abs(measured.stepX) > 0.5) {
      var trackProgress = (mobileNavMotion.x - oldOrigin) / oldStep;
      var trackScale = measured.stepX / oldStep;
      mobileNavMotion.x = measured.originX + trackProgress * measured.stepX;
      mobileNavMotion.velocityX *= trackScale;
    } else if (geometryChanged && oldNavWidth > 0 && measured.width > 0) {
      var widthScale = measured.width / oldNavWidth;
      mobileNavMotion.x *= widthScale;
      mobileNavMotion.velocityX *= widthScale;
    }

    mobileNavMotion.nav = nav;
    mobileNavMotion.capsule = nav.querySelector('.mobile-nav-capsule');
    mobileNavMotion.navWidth = measured.width;
    mobileNavMotion.originX = measured.originX;
    mobileNavMotion.stepX = measured.stepX;
    mobileNavMotion.targetIndex = targetIndex;
    mobileNavMotion.targetX = target.x;
    mobileNavMotion.targetY = target.y;
    mobileNavMotion.y = target.y;
    mobileNavMotion.width = target.width;
    mobileNavMotion.height = target.height;
    mobileNavMotion.initialized = true;

    if (!wasInitialized) {
      mobileNavMotion.x = target.x;
      mobileNavMotion.velocityX = 0;
      mobileNavMotion.settled = true;
    } else if (reducedMotion) {
      cancelMobileNavMotion();
      mobileNavMotion.x = target.x;
      mobileNavMotion.velocityX = 0;
      mobileNavMotion.settled = true;
    } else if (targetChanged) {
      mobileNavMotion.settled = false;
    }

    applyMobileNavFrame(mobileNavMotion.settled);
    if (!reducedMotion && !mobileNavMotion.settled) startMobileNavMotion();
  }

  function setupMobileNavMotion() {
    if (typeof window.matchMedia === 'function') {
      mobileNavMotion.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      var handleMediaChange = function () { syncMobileNavMotion(); };
      if (typeof mobileNavMotion.mediaQuery.addEventListener === 'function') mobileNavMotion.mediaQuery.addEventListener('change', handleMediaChange);
      else if (typeof mobileNavMotion.mediaQuery.addListener === 'function') mobileNavMotion.mediaQuery.addListener(handleMediaChange);
    }
    window.addEventListener('resize', syncMobileNavMotion);
  }

  function renderMobileNav(animateView) {
    var current = mobileNavCurrentView();
    return '<nav class="mobile-bottom-nav" aria-label="底部导航"><span class="mobile-nav-capsule" aria-hidden="true"></span>' + MOBILE_NAV_TABS.map(function (tab) {
      var selected = current === tab.id;
      return '<button type="button" data-view="' + tab.id + '" aria-current="' + (selected ? 'true' : 'false') + '">' + icon(tab.icon) + '<span>' + tab.label + '</span></button>';
    }).join('') + '</nav>';
  }
  function renderModal() {
    if (!appState.modal) return '';
    if (appState.modal.type === 'settings') return renderSettingsModal();
    if (appState.modal.type === 'confirm') return renderConfirmModal(appState.modal);
    if (appState.modal.type === 'newList') return renderNewListModal();
    if (appState.modal.type === 'projectPreview') return renderProjectPreviewModal();
    return renderTaskModal(appState.modal);
  }

  // 模型选择：下拉列出账号下可用的模型；当前值不在列表中时以「自定义」条目保留。
  function renderModelPicker(draft) {
    var models = appState.settings.models || [];
    var current = String(draft.ai.model || 'deepseek-flash');
    var custom = models.length > 0 && models.indexOf(current) < 0;
    var picker = models.length
      ? '<label class="field-label">可选模型<select class="field" data-settings-field="modelPicker" aria-label="选择 AI 模型">' +
          (custom ? '<option value="" selected>自定义：' + escapeHtml(current) + '</option>' : '') +
          models.map(function (name) {
            return '<option value="' + escapeAttribute(name) + '"' + (name === current ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
          }).join('') +
        '</select></label>'
      : '';
    var hint = appState.settings.modelsError
      ? '<p class="settings-copy">' + escapeHtml(appState.settings.modelsError) + '</p>'
      : '';
    return picker + '<label class="field-label">模型名<input class="field" type="text" name="model" data-settings-field="model" value="' + escapeAttribute(current) + '" placeholder="deepseek-flash"></label>' + hint;
  }

  // 设置面板里的账户区块：显示当前登录账号，并提供退出登录入口。
  function renderAccountRow() {
    var auth = appState.auth || {};
    if (!auth.supported) {
      return '<div class="settings-account"><span class="connection-dot" aria-hidden="true"></span><div><strong>当前版本未启用登录</strong><p>认证状态由运行环境管理。</p></div></div>';
    }
    if (!auth.authenticated) {
      return '<div class="settings-account"><span class="connection-dot" aria-hidden="true"></span><div><strong>未登录</strong><p>登录后才能同步你的清单与任务。</p></div><button class="button primary" type="button" data-action="start-auth">登录</button></div>';
    }
    var account = auth.account || {};
    var name = account.name || account.username || 'Microsoft 账号';
    return '<div class="settings-account"><span class="connection-dot is-connected" aria-hidden="true"></span><div><strong>' + escapeHtml(name) + '</strong><p>' + escapeHtml(account.username || '已连接') + '</p></div><button class="button ghost" type="button" data-action="auth-logout"' + (appState.settings.logoutBusy ? ' disabled' : '') + '>' + (appState.settings.logoutBusy ? '退出中…' : '退出登录') + '</button></div>';
  }

  function renderSettingsModal() {
    var health = appState.health;
    var draft = settingsDraft();
    if (appState.settings.loading && !appState.settings.loaded) {
      return '<div class="modal-backdrop" data-modal-backdrop><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-heading"><div class="modal-header"><div><h3 id="settings-heading">设置</h3><p>正在读取设置。</p></div><button class="icon-button small" type="button" data-action="close-modal" aria-label="关闭设置">' + icon('close') + '</button></div><div class="loading-state settings-loading"><div class="loader" aria-hidden="true"></div><p>请稍候</p></div></section></div>';
    }
    return '<div class="modal-backdrop" data-modal-backdrop><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-heading"><div class="modal-header"><div><h3 id="settings-heading">设置</h3><p>调整偏好、AI 和项目排期模板。</p></div><button class="icon-button small" type="button" data-action="close-modal" aria-label="关闭设置">' + icon('close') + '</button></div><form class="modal-body" data-form="settings"><section class="settings-section"><h4>连接状态</h4><div class="connection-status-large">' + renderConnectionDot() + '<div><strong>' + (health.ok ? '已同步' : (appState.error ? '连接失败' : '连接检查中')) + '</strong><p>' + escapeHtml(health.message || '稍后可重新检查。') + '</p></div></div><button class="button ghost" type="button" data-action="refresh">' + icon('refresh') + '重新检查</button></section><section class="settings-section"><h4>Microsoft 账户</h4>' + renderAccountRow() + '</section><section class="settings-section"><h4>DeepSeek</h4><p class="settings-copy">密钥保存在本机，留空表示不修改。使用 AI 时，指令与当前清单的必要任务信息会发送到 DeepSeek。</p><label class="field-label">API key<input class="field" type="password" autocomplete="new-password" name="apiKey" data-settings-field="apiKey" value="' + escapeAttribute(appState.settings.apiKey || '') + '" placeholder="输入新的 API key"></label>' + renderModelPicker(draft) + '<div class="settings-key-status"><span class="connection-dot ' + (draft.ai.configured ? 'is-connected' : '') + '" aria-hidden="true"></span>' + (draft.ai.configured ? '已配置，执行指令时验证连接' : '尚未配置密钥') + '</div></section><section class="settings-section"><h4>项目排期模板</h4><label class="field-label">模板名称<input class="field" type="text" name="templateName" data-settings-field="templateName" value="' + escapeAttribute(draft.projectTemplate.name) + '" maxlength="80"></label><div class="template-step-list">' + draft.projectTemplate.steps.map(function (step, index) {
      return '<div class="template-step-row"><span class="template-step-number">' + (index + 1) + '</span><label class="field-label">节点标题<input class="field" type="text" data-settings-field="stepTitle" data-template-index="' + index + '" value="' + escapeAttribute(step.title) + '" maxlength="120"></label><label class="field-label">相对天数<input class="field" type="number" data-settings-field="stepOffset" data-template-index="' + index + '" value="' + escapeAttribute(step.offsetDays) + '" min="0" max="3650"></label><label class="field-label">提醒时间<input class="field" type="time" data-settings-field="stepReminder" data-template-index="' + index + '" value="' + escapeAttribute(step.reminderTime) + '"></label><button class="icon-button small" type="button" data-action="remove-template-step" data-template-index="' + index + '" aria-label="删除第 ' + (index + 1) + ' 个节点">' + icon('trash') + '</button></div>';
    }).join('') + '</div><button class="button quiet template-add" type="button" data-action="add-template-step">' + icon('plus') + '添加节点</button></section><section class="settings-section"><h4>专注偏好</h4><label class="setting-row"><span><strong>降低动效</strong><p>减少非必要的过渡效果。</p></span><span class="switch"><input type="checkbox" data-pref="reducedMotion" ' + (appState.reducedMotion ? 'checked' : '') + '><span class="switch-track"></span></span></label></section>' + (appState.settings.error ? '<div class="inline-error" role="alert">' + escapeHtml(appState.settings.error) + '</div>' : '') + '<div class="modal-footer"><button class="button ghost" type="button" data-action="close-modal">取消</button><button class="button primary" type="submit"' + (appState.settings.saving ? ' disabled' : '') + '>' + (appState.settings.saving ? '保存中…' : '保存设置') + '</button></div></form></section></div>';
  }

  function renderConfirmModal(modal) {
    return '<div class="modal-backdrop" data-modal-backdrop><section class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-heading"><div class="modal-header confirm-header"><span class="confirm-icon' + (modal.danger ? ' is-danger' : '') + '">' + icon(modal.danger ? 'warning' : 'info') + '</span><div><h3 id="confirm-heading">' + escapeHtml(modal.title || '请确认') + '</h3><p>' + escapeHtml(modal.message || '') + '</p></div></div><div class="modal-footer"><button class="button ghost" type="button" data-action="close-modal">取消</button><button class="button' + (modal.danger ? ' danger' : ' primary') + '" type="button" data-action="confirm-yes"' + (modal.busy ? ' disabled' : '') + '>' + (modal.busy ? '处理中…' : escapeHtml(modal.confirmLabel || '确定')) + '</button></div></section></div>';
  }

  function renderNewListModal() {
    var mode = appState.modal.mode || 'direct';
    return '<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="new-list-heading"><div class="modal-header"><div><h3 id="new-list-heading">新建项目</h3><p>' + (mode === 'schedule' ? '先检查排期，再一次创建。' : '创建一个空项目，稍后添加任务。') + '</p></div><button class="icon-button small" type="button" data-action="close-modal" aria-label="关闭">' + icon('close') + '</button></div><div class="modal-switch" role="tablist" aria-label="新建项目方式"><button type="button" class="' + (mode === 'direct' ? 'is-active' : '') + '" data-action="new-list-mode" data-mode="direct">空项目</button><button type="button" class="' + (mode === 'schedule' ? 'is-active' : '') + '" data-action="new-list-mode" data-mode="schedule">按模板排期</button></div><form class="modal-body" data-form="new-list"><input type="hidden" name="mode" value="' + escapeAttribute(mode) + '"><label class="field-label">项目名称<input class="field" name="displayName" id="new-list-name" maxlength="80" value="' + escapeAttribute(appState.newListDraft || '') + '" placeholder="例如：新品发布冲刺" required autofocus></label>' + (mode === 'schedule' ? '<label class="field-label">接入日期<input class="field" type="date" name="startDate" id="project-start-date" value="' + escapeAttribute(appState.projectStartDateDraft || todayKey()) + '" required></label><p class="quick-hint">排期节点来自设置中的模板，创建前会显示每个日期。</p>' : '') + '<div class="modal-footer"><button class="button ghost" type="button" data-action="close-modal">取消</button><button class="button primary" type="submit"' + (appState.projectPlan.loading ? ' disabled' : '') + '>' + (appState.projectPlan.loading ? '<span class="loader" style="width:16px;height:16px;border-width:2px"></span>生成中…' : (mode === 'schedule' ? icon('calendar') + '生成排期预览' : icon('plus') + '创建项目')) + '</button></div></form></section></div>';
  }

  function renderProjectPreviewModal() {
    var plan = appState.projectPlan.preview || {};
    var result = appState.projectPlan.applyResult;
    return '<div class="modal-backdrop" data-modal-backdrop><section class="modal project-preview-modal" role="dialog" aria-modal="true" aria-labelledby="project-preview-heading"><div class="modal-header"><div><h3 id="project-preview-heading">排期预览</h3><p>确认日期后一次创建。</p></div><button class="icon-button small" type="button" data-action="close-modal" aria-label="关闭">' + icon('close') + '</button></div><div class="modal-body">' + renderProjectSteps(plan) + renderApplyResults(result) + (appState.projectPlan.error ? '<div class="inline-error" role="alert">' + escapeHtml(appState.projectPlan.error) + '</div>' : '') + '</div><div class="modal-footer"><button class="button ghost" type="button" data-action="close-modal">取消</button><button class="button primary" type="button" data-action="apply-project-preview"' + (appState.projectPlan.applying || (result && result.complete === true) ? ' disabled' : '') + '>' + (appState.projectPlan.applying ? '<span class="loader" style="width:16px;height:16px;border-width:2px"></span>创建中…' : (result && result.complete === true ? '已创建' : (result ? '重试创建' : '创建项目'))) + '</button></div></section></div>';
  }

  function toInputDate(value) {
    var date = dateObject(value);
    if (!date) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function renderTaskModal(modal) {
    var task = modal.draft || modal.task || { title: '', status: 'notStarted', importance: 'normal', dueDateTime: '', reminderDateTime: '', recurrence: 'none', body: '' };
    var active = getLists().find(function (list) { return list.id === modal.listId; }) || getActiveList();
    var isEdit = Boolean(modal.task);
    var recurrence = normalizeRecurrence(task.recurrence);
    if (isEdit && !modal.draft && recurrence !== 'none') recurrence = '__existing';
    return '<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-heading"><div class="modal-header"><div><h3 id="task-modal-heading">' + (isEdit ? '编辑任务' : '添加任务') + '</h3><p>' + escapeHtml(active ? active.name : '当前清单') + '</p></div><button class="icon-button small" type="button" data-action="close-modal" aria-label="关闭">' + icon('close') + '</button></div><form class="modal-body" data-form="task-editor"><input type="hidden" name="listId" value="' + escapeAttribute(modal.listId || (active ? active.id : '')) + '"><input type="hidden" name="taskId" value="' + escapeAttribute(task.id || '') + '"><label class="field-label">任务名称<input class="field" name="title" id="task-editor-title" maxlength="180" value="' + escapeAttribute(task.title) + '" required autofocus></label><div class="field-grid"><label class="field-label">状态<select class="field" name="status">' + statusOptions(task.status) + '</select></label><label class="field-label">重要性<select class="field" name="importance"><option value="normal"' + (task.importance === 'normal' ? ' selected' : '') + '>普通</option><option value="important"' + (task.importance === 'important' ? ' selected' : '') + '>重要</option><option value="low"' + (task.importance === 'low' ? ' selected' : '') + '>低优先级</option></select></label></div><div class="field-grid"><label class="field-label">到期时间<input class="field" type="datetime-local" name="dueDateTime" value="' + escapeAttribute(toInputDate(task.dueDateTime)) + '"></label><label class="field-label">提醒时间<input class="field" type="datetime-local" name="reminderDateTime" value="' + escapeAttribute(toInputDate(task.reminderDateTime)) + '"></label></div><label class="field-label">重复<select class="field" name="recurrence">' + recurrenceOptions(recurrence) + '</select></label><label class="field-label">备注<textarea class="field" name="body" maxlength="2000" placeholder="可选">' + escapeHtml(task.body) + '</textarea></label><div class="modal-footer">' + (isEdit ? '<button class="button quiet delete-in-detail" type="button" data-action="delete-task" data-list-id="' + escapeAttribute(modal.listId) + '" data-task-id="' + escapeAttribute(task.id) + '">删除任务</button>' : '') + '<button class="button ghost" type="button" data-action="close-modal">取消</button><button class="button primary" type="submit">' + (isEdit ? '保存修改' : '创建任务') + '</button></div></form></section></div>';
  }

  function renderLoading() {
    return '<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><div><h1>轻量项目助理</h1><p>TO DO CONTROL DESK</p></div></div><div class="connection-pill">' + renderConnectionDot() + '<span>正在连接</span></div></aside>' + renderLayoutResizer('sidebar') + '<main class="main"><div class="main-inner"><header class="topbar"><div><p class="eyebrow">PROJECT ASSISTANT / CONNECTING</p><h2>正在读取你的工作区</h2><p class="topbar-subtitle">只从 Microsoft To Do API 获取任务，请稍候。</p></div></header><section class="card loading-state"><div class="loader" aria-hidden="true"></div><p>连接 /api/workspace</p></section></div></main></div>';
  }

  function authTimeText(auth) {
    var expiresAt = Number(auth && auth.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return '验证码生成后会显示有效时间。';
    var remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000));
    return remaining ? '验证码有效约 ' + remaining + ' 分钟。' : '验证码已过期，请重新获取。';
  }

  function renderAuth() {
    var auth = normalizeAuth(appState.auth, { supported: true, authenticated: false, status: 'signed_out' });
    var pending = auth.status === 'pending';
    var expired = auth.status === 'expired';
    var failed = auth.status === 'error';
    var title = pending ? '正在连接 Microsoft To Do' : '连接 Microsoft To Do';
    var description = pending
      ? '在浏览器完成一次登录，回来后会自动打开你的任务。'
      : '登录后才能读取和更新你的清单、任务与日程。令牌只保存在这台电脑上。';
    var status = '';
    if (pending) {
      var code = auth.userCode || '等待验证码…';
      var uri = auth.verificationUriComplete || auth.verificationUri || 'https://microsoft.com/devicelogin';
      status = '<div class="auth-device"><div class="auth-device-step"><span class="auth-step-number">1</span><span>打开登录页</span><a class="auth-link" href="' + escapeAttribute(uri) + '" target="_blank" rel="noreferrer">打开 Microsoft 登录页</a></div><div class="auth-device-step"><span class="auth-step-number">2</span><span>输入验证码</span><button class="auth-code" type="button" data-action="copy-auth-code" data-auth-code="' + escapeAttribute(auth.userCode || '') + '"' + (auth.userCode ? '' : ' disabled') + '><code>' + escapeHtml(code) + '</code><span>复制</span></button></div><p class="auth-hint">' + escapeHtml(authTimeText(auth)) + ' 登录完成后此窗口会自动继续。</p></div>';
    } else {
      var actionLabel = expired || failed ? '重新登录' : '登录 Microsoft To Do';
      var error = expired || failed ? '<p class="auth-error" role="alert">' + escapeHtml(auth.message || '登录未完成，请重试。') + '</p>' : '';
      status = error + '<button class="button primary auth-primary-action" type="button" data-action="start-auth">' + icon('arrow') + '<span>' + actionLabel + '</span></button>';
    }
    return '<div class="auth-app-shell"><aside class="auth-rail"><div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><div><h1>轻量项目助理</h1><p>TO DO CONTROL DESK</p></div></div><div class="auth-rail-note"><span class="auth-rail-dot" aria-hidden="true"></span><span>' + (pending ? '等待 Microsoft 登录' : '需要登录后继续') + '</span></div><div class="auth-rail-footer">Microsoft To Do<br><span>本机安全连接</span></div></aside><main class="auth-main"><section class="auth-card" aria-labelledby="auth-heading"><div class="auth-icon">' + icon('check') + '</div><p class="eyebrow">MICROSOFT TODO / FIRST RUN</p><h2 id="auth-heading">' + title + '</h2><p class="auth-description">' + description + '</p>' + status + '</section></main></div>';
  }

  function renderError() {
    return '<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><div><h1>轻量项目助理</h1><p>TO DO CONTROL DESK</p></div></div><div class="connection-pill">' + renderConnectionDot() + '<span>连接失败</span></div><div class="sidebar-spacer"></div><div class="sidebar-footer"><div class="mode-note"><strong>任务数据源</strong>Microsoft To Do API</div></div></aside>' + renderLayoutResizer('sidebar') + '<main class="main"><div class="main-inner"><header class="topbar"><div><p class="eyebrow">PROJECT ASSISTANT / OFFLINE</p><h2>暂时连接不上工作区</h2><p class="topbar-subtitle">页面没有使用本地任务缓存，避免显示过期数据。</p></div><div class="topbar-actions"><button class="button ghost" type="button" data-action="open-settings">' + icon('settings') + '<span>设置</span></button></div></header><section class="card error-state"><div><div class="error-icon">' + icon('warning') + '</div><h3>API 连接失败</h3><p>' + escapeHtml(appState.error || '请确认服务端已启动，并检查 /api/health 与 /api/workspace。') + '</p><button class="button primary" type="button" data-action="refresh">' + icon('refresh') + '重试连接</button></div></section></div></main></div>' + renderModal();
  }

  var aiInputOwner = null;

  function rememberAiInputHeight() {
    var input = document.getElementById('ai-command-input');
    if (!input || !input.getBoundingClientRect || aiInputOwner !== appState.ai) return;
    var height = input.offsetHeight;
    var fitted = Number(input.dataset.fittedHeight);
    if (fitted && Math.abs(height - fitted) > 2) appState.ai.inputMinHeight = height;
  }

  function fitAiInput(resetEmpty) {
    var input = document.getElementById('ai-command-input');
    if (!input || !input.style || !input.getBoundingClientRect) return;
    rememberAiInputHeight();
    aiInputOwner = appState.ai;
    if (resetEmpty && !input.value) appState.ai.inputMinHeight = 48;
    var chat = input.closest('.ai-chat');
    var available = chat ? chat.clientHeight - 100 : 220;
    var maximum = Math.max(48, Math.min(220, available, window.innerHeight * 0.35));
    var minimum = Math.min(maximum, appState.ai.inputMinHeight || 48);
    input.style.maxHeight = maximum + 'px';
    input.style.height = '48px';
    var height = Math.min(maximum, Math.max(minimum, input.scrollHeight + 2));
    input.style.height = height + 'px';
    input.dataset.fittedHeight = String(height);
  }

  function getBoardFromTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;
    try {
      var board = target.closest('.board');
      return board && typeof board.getBoundingClientRect === 'function' ? board : null;
    } catch (error) {
      return null;
    }
  }

  function boardAutoScrollDelta(board, pointerX) {
    if (!board || typeof board.getBoundingClientRect !== 'function') return 0;
    var scrollWidth = Number(board.scrollWidth);
    var clientWidth = Number(board.clientWidth);
    if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth) || scrollWidth <= clientWidth) return 0;
    var rect;
    try { rect = board.getBoundingClientRect(); } catch (error) { return 0; }
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return 0;
    var relativeX = pointerX - rect.left;
    var edge = Math.min(BOARD_AUTO_SCROLL_EDGE_PX, Math.max(1, clientWidth / 2));
    var proximity = 0;
    var direction = 0;
    if (relativeX < edge) {
      proximity = (edge - relativeX) / edge;
      direction = -1;
    } else if (relativeX > clientWidth - edge) {
      proximity = (relativeX - (clientWidth - edge)) / edge;
      direction = 1;
    }
    if (!direction) return 0;
    proximity = Math.max(0, Math.min(1, proximity));
    return direction * BOARD_AUTO_SCROLL_MAX_PX_PER_SECOND * proximity * proximity;
  }

  function boardVerticalScrollTarget(board) {
    if (!board || typeof document === 'undefined') return null;
    var node = board.parentElement;
    while (node && node !== document.body) {
      var scrollHeight = Number(node.scrollHeight);
      var clientHeight = Number(node.clientHeight);
      var overflowY = '';
      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        try { overflowY = String(window.getComputedStyle(node).overflowY || ''); } catch (error) { overflowY = ''; }
      }
      if (Number.isFinite(scrollHeight) && Number.isFinite(clientHeight) && scrollHeight > clientHeight + 1 && /auto|scroll|overlay/i.test(overflowY)) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement || document.body || null;
  }

  function boardVerticalAutoScrollDelta(target, pointerY) {
    if (!target || !Number.isFinite(pointerY)) return 0;
    var scrollHeight = Number(target.scrollHeight);
    var clientHeight = Number(target.clientHeight);
    if (!Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight) || scrollHeight <= clientHeight + 1) return 0;
    var top = 0;
    var bottom = 0;
    var isRoot = target === document.scrollingElement || target === document.documentElement || target === document.body;
    if (isRoot) {
      var viewportHeight = typeof window !== 'undefined' && Number(window.innerHeight) > 0
        ? Number(window.innerHeight)
        : Number(document.documentElement && document.documentElement.clientHeight);
      if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
      bottom = viewportHeight;
    } else if (typeof target.getBoundingClientRect === 'function') {
      var rect;
      try { rect = target.getBoundingClientRect(); } catch (error) { rect = null; }
      if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return 0;
      top = rect.top;
      bottom = rect.bottom;
    } else {
      return 0;
    }
    var height = bottom - top;
    if (!Number.isFinite(height) || height <= 0) return 0;
    var edge = Math.min(BOARD_AUTO_SCROLL_EDGE_PX, Math.max(1, height / 2));
    var relativeY = pointerY - top;
    var proximity = 0;
    var direction = 0;
    if (relativeY < edge) {
      proximity = (edge - relativeY) / edge;
      direction = -1;
    } else if (relativeY > height - edge) {
      proximity = (relativeY - (height - edge)) / edge;
      direction = 1;
    }
    if (!direction) return 0;
    proximity = Math.max(0, Math.min(1, proximity));
    return direction * BOARD_AUTO_SCROLL_MAX_PX_PER_SECOND * proximity * proximity;
  }

  function stopBoardAutoScroll() {
    var state = appState.boardAutoScroll;
    if (!state) return;
    if (state.rafId && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(state.rafId);
    }
    state.board = null;
    state.vertical = null;
    state.pointerX = null;
    state.pointerY = null;
    state.rafId = 0;
    state.lastTimestamp = 0;
  }

  function runBoardAutoScroll(timestamp) {
    var state = appState.boardAutoScroll;
    var board = state && state.board;
    if (!state || !board || !appState.drag) {
      stopBoardAutoScroll();
      return;
    }
    state.rafId = 0;
    var pointerX = Number(state.pointerX);
    var pointerY = Number(state.pointerY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      stopBoardAutoScroll();
      return;
    }
    var rect;
    try { rect = board.getBoundingClientRect(); } catch (error) { rect = null; }
    var horizontalSpeed = rect && pointerY >= rect.top && pointerY <= rect.bottom
      ? boardAutoScrollDelta(board, pointerX)
      : 0;
    var verticalTarget = state.vertical || boardVerticalScrollTarget(board);
    var verticalSpeed = boardVerticalAutoScrollDelta(verticalTarget, pointerY);
    if (!horizontalSpeed && !verticalSpeed) {
      stopBoardAutoScroll();
      return;
    }
    var now = Number(timestamp);
    if (!Number.isFinite(now)) now = Date.now();
    var elapsed = state.lastTimestamp ? Math.min(50, Math.max(0, now - state.lastTimestamp)) : 16;
    state.lastTimestamp = now;
    var moved = false;
    if (horizontalSpeed) {
      var scrollWidth = Number(board.scrollWidth);
      var clientWidth = Number(board.clientWidth);
      var maxScroll = Math.max(0, scrollWidth - clientWidth);
      var beforeX = Number(board.scrollLeft) || 0;
      var afterX = Math.max(0, Math.min(maxScroll, beforeX + horizontalSpeed * elapsed / 1000));
      if (afterX !== beforeX) {
        board.scrollLeft = afterX;
        moved = true;
      }
    }
    if (verticalSpeed && verticalTarget) {
      var verticalMax = Math.max(0, Number(verticalTarget.scrollHeight) - Number(verticalTarget.clientHeight));
      var beforeY = Number(verticalTarget.scrollTop) || 0;
      var afterY = Math.max(0, Math.min(verticalMax, beforeY + verticalSpeed * elapsed / 1000));
      if (afterY !== beforeY) {
        verticalTarget.scrollTop = afterY;
        moved = true;
      }
    }
    if (!moved) {
      stopBoardAutoScroll();
      return;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      stopBoardAutoScroll();
      return;
    }
    state.rafId = window.requestAnimationFrame(runBoardAutoScroll);
  }

  function updateBoardAutoScroll(board, event) {
    if (!board || !appState.drag) return;
    var pointerX = Number(event && event.clientX);
    var pointerY = Number(event && event.clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      stopBoardAutoScroll();
      return;
    }
    var state = appState.boardAutoScroll;
    if (!state) return;
    if (state.board && state.board !== board) stopBoardAutoScroll();
    state = appState.boardAutoScroll;
    state.board = board;
    state.vertical = boardVerticalScrollTarget(board);
    state.pointerX = pointerX;
    state.pointerY = pointerY;
    var rect;
    try { rect = board.getBoundingClientRect(); } catch (error) { rect = null; }
    var horizontalSpeed = rect && pointerY >= rect.top && pointerY <= rect.bottom
      ? boardAutoScrollDelta(board, pointerX)
      : 0;
    var verticalSpeed = boardVerticalAutoScrollDelta(state.vertical, pointerY);
    if (!horizontalSpeed && !verticalSpeed) {
      stopBoardAutoScroll();
      return;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      stopBoardAutoScroll();
      return;
    }
    if (!state.rafId) {
      state.lastTimestamp = 0;
      state.rafId = window.requestAnimationFrame(runBoardAutoScroll);
    }
  }

  function render(options) {
    options = options || {};
    var animateView = options.viewTransition === true && !appState.reducedMotion;
    stopBoardAutoScroll();
    var app = document.getElementById('app');
    if (!app) return;
    rememberAiInputHeight();
    document.body.classList.toggle('reduced-motion', appState.reducedMotion);
    if (appState.loading) {
      app.innerHTML = renderLoading();
      updateLayoutDom('sidebar');
      syncMobileNavMotion();
      return;
    }
    if (appState.auth && appState.auth.supported && !appState.auth.authenticated && !appState.workspace) {
      app.innerHTML = renderAuth();
      syncMobileNavMotion();
      return;
    }
    if (appState.error && !appState.workspace) {
      app.innerHTML = renderError();
      updateLayoutDom('sidebar');
      syncMobileNavMotion();
      return;
    }
    var ui = captureUiState();
    app.innerHTML = '<div class="app-shell">' + renderSidebar() + renderLayoutResizer('sidebar') + '<main class="main"><div class="main-inner">' + renderTopbar(animateView) + (appState.view === 'ai' ? '' : renderCapture()) + '<div class="view-stage' + (animateView ? ' is-view-entering' : '') + '" data-view-stage data-view-name="' + escapeAttribute(appState.view) + '">' + renderMainView() + '</div></div></main></div>' + renderMobileNav(animateView) + renderModal();
    // CSSOM properties survive the strict style-src policy; HTML style attributes do not.
    ['sidebar', 'focus', 'timeline', 'chat'].forEach(updateLayoutDom);
    applyBoardScale(appState.boardScale);
    fitAiInput(!appState.ai.input);
    syncMobileNavMotion();
    app.querySelectorAll('[data-progress]').forEach(function (element) {
      var progress = Math.max(0, Math.min(100, parseFloat(element.getAttribute('data-progress')) || 0));
      element.style.setProperty('--progress', progress + '%');
    });
    restoreUiState(ui);
    var chat = app.querySelector('.ai-chat-log');
    if (chat) {
      chat.scrollTop = appState.ai.scrollToEnd ? chat.scrollHeight : (ui.chatScroll || 0);
      appState.ai.scrollToEnd = false;
    }
    if (appState.modal && !appState.modalFocusDone) {
      focusModal();
      appState.modalFocusDone = true;
    }
    if (appState.focusAfterRender) {
      var target = document.getElementById(appState.focusAfterRender);
      if (target) {
        try { target.focus(); if (target.select) target.select(); } catch (error) { /* ignore */ }
      }
      appState.focusAfterRender = '';
    }
  }

  function focusModal() {
    var modal = document.querySelector('.modal [autofocus]') || document.querySelector('.modal .modal-header h3');
    if (modal && document.activeElement === document.body) modal.focus();
  }

  function showToast(message, isError) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    toast.classList.toggle('is-error', Boolean(isError));
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3000);
  }

  function apiError(response, payload) {
    var message = '';
    if (isObject(payload)) message = payload.message || payload.error || payload.detail || '';
    if (!message && typeof payload === 'string') message = payload;
    var error = new Error(message || ('请求失败（HTTP ' + response.status + '）'));
    error.status = response.status;
    if (isObject(payload) && isObject(payload.auth)) error.auth = payload.auth;
    return error;
  }

  function stopAuthPolling() {
    if (authPollTimer && typeof window !== 'undefined' && typeof window.clearInterval === 'function') window.clearInterval(authPollTimer);
    authPollTimer = 0;
    authPollBusy = false;
  }

  function scheduleAuthPolling() {
    stopAuthPolling();
    if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return;
    authPollTimer = window.setInterval(pollMicrosoftAuth, 1500);
  }

  async function pollMicrosoftAuth() {
    if (authPollBusy || !appState.auth || appState.auth.status !== 'pending') return;
    authPollBusy = true;
    try {
      var next = await apiRequest('/api/auth/status');
      appState.auth = normalizeAuth(next, appState.auth);
      if (appState.auth.authenticated) {
        stopAuthPolling();
        appState.error = null;
        await loadWorkspace();
        return;
      }
      if (['error', 'expired'].indexOf(appState.auth.status) >= 0) stopAuthPolling();
      render();
    } catch (error) {
      // 登录轮询期间短暂断网不应丢掉验证码；下一次轮询继续尝试。
    } finally {
      authPollBusy = false;
    }
  }

  async function startMicrosoftAuth() {
    if (appState.auth && appState.auth.status === 'pending') return;
    stopAuthPolling();
    appState.error = null;
    appState.auth = normalizeAuth({ status: 'pending', supported: true, authenticated: false, message: '正在准备 Microsoft 登录…' }, appState.auth);
    render();
    try {
      var next = await apiRequest('/api/auth/start', { method: 'POST', body: {} });
      appState.auth = normalizeAuth(next, appState.auth);
      if (appState.auth.authenticated) {
        await loadWorkspace();
        return;
      }
      if (appState.auth.status === 'pending') scheduleAuthPolling();
      render();
    } catch (error) {
      appState.auth = normalizeAuth(error.auth || { status: 'error', supported: true, authenticated: false, message: error.message }, appState.auth);
      appState.error = error.message || '登录失败，请重试。';
      stopAuthPolling();
      render();
    }
  }

  // 退出登录：清除本机令牌并回到登录页，便于换账号或强制重新登录。
  function signOutMicrosoftAuth() {
    // 必须用应用内确认弹窗：WKWebView 不实现 window.confirm，直接调用会静默返回 false 导致「点了没反应」。
    openModal({
      type: 'confirm',
      danger: true,
      title: '退出登录',
      message: '本机会清除 Microsoft 登录令牌，需要重新登录才能继续同步任务。',
      confirmLabel: '退出登录',
      onConfirm: async function () {
        var next = await apiRequest('/api/auth/logout', { method: 'POST', body: {} });
        appState.auth = normalizeAuth(next, appState.auth);
        stopAuthPolling();
        appState.workspace = null;
        appState.error = null;
        render();
        showToast('已退出登录。');
        await loadWorkspace();
      }
    });
  }

  function copyAuthCode() {
    var code = appState.auth && appState.auth.userCode;
    if (!code) return;
    var done = function () { showToast('验证码已复制'); };
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(code).then(done).catch(function () { copyAuthCodeFallback(code, done); });
      return;
    }
    copyAuthCodeFallback(code, done);
  }

  function copyAuthCodeFallback(code, done) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    var input = document.createElement('textarea');
    input.value = code;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); done(); } catch (error) { showToast('请手动复制验证码', true); }
    document.body.removeChild(input);
  }

  async function apiRequest(path, options) {
    var requestOptions = Object.assign({}, options || {});
    requestOptions.headers = Object.assign({ Accept: 'application/json' }, requestOptions.headers || {});
    if (requestOptions.body && typeof requestOptions.body !== 'string') {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(requestOptions.body);
    }
    var response;
    try {
      response = await fetch(path, requestOptions);
    } catch (error) {
      throw new Error('无法连接服务端，请确认本地 API 已启动。');
    }
    var text = await response.text();
    var payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = text;
    }
    if (!response.ok) throw apiError(response, payload);
    return payload;
  }

  // ---- 同步策略 ----
  // 首次加载显示整屏 loading；之后的刷新为“静默同步”：
  // 保留当前界面（焦点、滚动、草稿都不动），仅在顶栏显示同步指示，完成后局部刷新数据。
  async function loadWorkspace(options) {
    var opts = options || {};
    var silent = Boolean(opts.silent) && Boolean(appState.workspace);
    if (silent) {
      if (appState.syncing) return;
      if (appState.drag) return; // 正在拖动任务卡时跳过静默同步，避免 DOM 重建让卡片跳回原位。
      appState.syncing = true;
      render();
    } else {
      appState.loading = true;
      appState.error = null;
      appState.health = { ok: false, mode: appState.health.mode || 'rules', message: '正在连接' };
      render();
    }
    var results = await Promise.allSettled([apiRequest('/api/health'), apiRequest('/api/workspace')]);
    var healthResult = results[0];
    var workspaceResult = results[1];
    var authRequired = false;
    if (healthResult.status === 'fulfilled' && isObject(healthResult.value)) {
      var health = healthResult.value;
      appState.health = {
        ok: health.ok !== false,
        mode: normalizeMode(health.mode || health.provider || health.engine || health.aiMode),
        message: String(health.message || health.status || '连接正常')
      };
      appState.auth = normalizeAuth(health.auth, {
        supported: health.auth && health.auth.supported !== undefined ? health.auth.supported : false,
        authenticated: health.connected !== false && health.ok !== false,
        status: health.connected === false ? 'signed_out' : 'signed_in',
        message: health.message || '连接正常'
      });
    } else if (!appState.workspace) {
      appState.health = { ok: false, mode: 'rules', message: '健康检查失败' };
    }
    if (workspaceResult.status === 'rejected') {
      var workspaceError = workspaceResult.reason;
      if (workspaceError && workspaceError.auth) appState.auth = normalizeAuth(workspaceError.auth, appState.auth);
      authRequired = Boolean(appState.auth && appState.auth.supported && !appState.auth.authenticated);
      appState.workspace = authRequired ? null : (silent ? appState.workspace : null);
      appState.error = authRequired ? null : (workspaceError ? workspaceError.message : '工作区读取失败');
    } else {
      authRequired = Boolean(appState.auth && appState.auth.supported && !appState.auth.authenticated);
      if (authRequired) {
        appState.workspace = null;
        appState.error = null;
      } else {
        appState.workspace = normalizeWorkspace(workspaceResult.value);
        Object.keys(appState.workspace.notesByList || {}).forEach(function (listId) {
          appState.notesByList[listId] = appState.workspace.notesByList[listId];
        });
        var lists = getLists();
        var fallbackList = getProjectLists()[0] || lists[0];
        if (!lists.some(function (list) { return list.id === appState.activeListId; })) appState.activeListId = fallbackList ? fallbackList.id : '';
        selectAiConversation(appState.activeListId);
        appState.error = null;
      }
    }
    appState.loading = false;
    appState.syncing = false;
    appState.lastSyncAt = Date.now();
    render();
    if (workspaceResult.status === 'rejected' && !silent && !authRequired && appState.error) showToast(appState.error, true);
  }

  function maybeAutoSync() {
    if (appState.loading || appState.syncing || appState.modal || appState.ai.loading) return;
    if (Date.now() - appState.lastSyncAt < SYNC_THROTTLE_MS) return;
    loadWorkspace({ silent: true });
  }

  function datePayload(value) {
    if (!value) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  async function createTask(listId, values) {
    if (!listId) throw new Error('没有可用的 To Do 清单。');
    var payload = { title: values.title, status: values.status || 'notStarted' };
    if (values.importance) payload.importance = values.importance === 'important' ? 'high' : values.importance;
    if (values.body) payload.body = values.body;
    if (values.dueDateTime) payload.dueDateTime = datePayload(values.dueDateTime);
    if (values.reminderDateTime) payload.reminderDateTime = datePayload(values.reminderDateTime);
    if (values.recurrence && values.recurrence !== 'none') payload.recurrence = values.recurrence;
    await apiRequest('/api/lists/' + encodeURIComponent(listId) + '/tasks', { method: 'POST', body: payload });
    await loadWorkspace({ silent: true });
  }

  async function createList(displayName) {
    var response = await apiRequest('/api/lists', { method: 'POST', body: { displayName: displayName } });
    if (response && response.list && response.list.id) appState.activeListId = String(response.list.id);
    await loadWorkspace({ silent: true });
  }

  async function deleteList(listId) {
    var result = await apiRequest('/api/lists/' + encodeURIComponent(listId), { method: 'DELETE' });
    if (appState.activeListId === listId) appState.activeListId = '';
    await loadWorkspace({ silent: true });
    return result;
  }

  async function updateTask(listId, taskId, values) {
    await apiRequest('/api/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId), { method: 'PATCH', body: values });
    await loadWorkspace({ silent: true });
  }

  async function deleteTask(listId, taskId) {
    await apiRequest('/api/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId), { method: 'DELETE' });
    await loadWorkspace({ silent: true });
  }

  async function addProgressNote(listId, content) {
    var response = await apiRequest('/api/lists/' + encodeURIComponent(listId) + '/progress-notes', { method: 'POST', body: { text: content } });
    var note = isObject(response) ? (response.note || response.progressNote || response) : { content: content };
    if (!isObject(note)) note = { content: content };
    if (!note.content && !note.body) note.content = content;
    if (!note.createdAt && !note.createdDateTime) note.createdAt = new Date().toISOString();
    appState.notesByList[listId] = [note].concat(getNotes(listId));
    await loadWorkspace({ silent: true });
  }

  // ---- 乐观更新：状态变更立即生效，失败自动回滚 ----
  async function patchTaskStatus(listId, taskId, nextStatus, successMessage) {
    var task = getTask(listId, taskId);
    if (!task || task.status === nextStatus || isTaskBusy(taskId)) return;
    var previousStatus = task.status;
    task.status = nextStatus;
    appState.pendingTasks[taskId] = true;
    render();
    try {
      await apiRequest('/api/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId), { method: 'PATCH', body: { status: nextStatus } });
      showToast(successMessage || '状态已更新。');
    } catch (error) {
      task.status = previousStatus;
      showToast(error.message || '状态更新失败', true);
    } finally {
      delete appState.pendingTasks[taskId];
      await loadWorkspace({ silent: true });
    }
  }

  async function openSettings() {
    appState.settings.loading = true;
    appState.settings.loaded = false;
    appState.settings.error = '';
    appState.settings.apiKey = '';
    appState.settings.draft = normalizeSettings({});
    appState.settings.models = [];
    appState.settings.modelsError = '';
    openModal({ type: 'settings' });
    try {
      // 模型列表单独拉取：失败不影响设置面板使用，只是退回手动输入。
      var results = await Promise.allSettled([apiRequest('/api/settings'), apiRequest('/api/models')]);
      var result = results[0].status === 'fulfilled' ? results[0].value : null;
      if (results[0].status === 'rejected') throw results[0].reason;
      var modelsResult = results[1].status === 'fulfilled' ? results[1].value : null;
      if (modelsResult && Array.isArray(modelsResult.models)) {
        appState.settings.models = modelsResult.models;
        appState.settings.modelsError = String(modelsResult.error || '');
      }
      appState.settings.draft = copySettingsDraft(result && result.settings ? result.settings : result);
      appState.settings.loaded = true;
      appState.settings.loading = false;
      render();
    } catch (error) {
      appState.settings.loaded = true;
      appState.settings.loading = false;
      appState.settings.error = error.message || '设置读取失败';
      render();
    }
  }

  async function saveSettings() {
    if (appState.settings.saving) return;
    var draft = settingsDraft();
    var template = cloneProjectTemplate(draft.projectTemplate);
    var payload = {
      model: String(draft.ai.model || 'deepseek-flash').trim() || 'deepseek-flash',
      projectTemplate: template
    };
    if (String(appState.settings.apiKey || '').trim()) payload.apiKey = String(appState.settings.apiKey).trim();
    appState.settings.saving = true;
    appState.settings.error = '';
    render();
    try {
      var result = await apiRequest('/api/settings', { method: 'POST', body: payload });
      var returned = result && result.settings ? result.settings : result;
      var next = copySettingsDraft(draft);
      if (returned && isObject(returned.ai)) {
        next.ai.configured = returned.ai.configured !== undefined ? Boolean(returned.ai.configured) : next.ai.configured;
        next.ai.model = String(returned.ai.model || next.ai.model || 'deepseek-flash');
      } else if (payload.apiKey) {
        next.ai.configured = true;
      }
      if (returned && isObject(returned.projectTemplate)) next.projectTemplate = cloneProjectTemplate(returned.projectTemplate);
      appState.settings.draft = next;
      appState.settings.apiKey = '';
      appState.settings.saving = false;
      appState.settings.loaded = true;
      render();
      showToast('设置已保存。');
    } catch (error) {
      appState.settings.saving = false;
      appState.settings.error = error.message || '设置保存失败';
      render();
      showToast(appState.settings.error, true);
    }
  }

  async function createProjectPreview(projectName, startDate) {
    if (appState.projectPlan.loading) return;
    appState.projectPlan.loading = true;
    appState.projectPlan.error = '';
    appState.projectPlan.preview = null;
    appState.projectPlan.applyResult = null;
    render();
    try {
      var result = await apiRequest('/api/projects/preview', {
        method: 'POST',
        body: { projectName: projectName, startDate: startDate }
      });
      if (!result || !result.previewId) throw new Error('服务端没有返回排期预览。');
      appState.projectPlan.preview = result;
      appState.modal = { type: 'projectPreview' };
      appState.modalFocusDone = false;
    } catch (error) {
      appState.projectPlan.error = error.message || '排期预览生成失败';
    } finally {
      appState.projectPlan.loading = false;
      render();
    }
  }

  async function applyProjectPreview() {
    var preview = appState.projectPlan.preview;
    if (!preview || !preview.previewId || appState.projectPlan.applying) return;
    appState.projectPlan.applying = true;
    appState.projectPlan.error = '';
    appState.projectPlan.applyResult = null;
    render();
    try {
      var result = await apiRequest('/api/projects/apply', { method: 'POST', body: { previewId: preview.previewId } });
      appState.projectPlan.applyResult = result;
      if (result && result.complete === true) {
        if (result.listId) appState.activeListId = String(result.listId);
        await loadWorkspace({ silent: true });
        appState.projectPlan.applying = false;
        appState.modal = null;
        appState.view = 'list';
        savePreferences();
        render();
        showToast('项目已创建。');
      } else {
        appState.projectPlan.applying = false;
        appState.projectPlan.error = result && result.error || '部分步骤未完成，可以重试。';
        render();
        showToast(appState.projectPlan.error, true);
      }
    } catch (error) {
      appState.projectPlan.applying = false;
      appState.projectPlan.error = error.message || '项目创建失败，可以重试。';
      render();
      showToast(appState.projectPlan.error, true);
    }
  }

  function extractAffectedCount(result) {
    if (!isObject(result)) return null;
    var candidates = [result.affectedCount, result.createdCount, result.updatedCount, result.tasksCreated, result.count];
    for (var i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === 'number') return candidates[i];
    }
    if (Array.isArray(result.tasks)) return result.tasks.length;
    if (Array.isArray(result.changes)) return result.changes.length;
    if (Array.isArray(result.results)) return result.results.filter(function (item) { return item && item.type !== 'projectLog'; }).length;
    return null;
  }

  async function runAiCommand() {
    var active = getActiveList();
    var ai = appState.ai;
    var input = ai.input.trim();
    if (!input) {
      showToast('先输入一句要处理的指令。', true);
      return;
    }
    if (!active) {
      showToast('当前没有可用的 To Do 清单。', true);
      return;
    }
    if (ai.loading || ai.applying || ai.listening || (ai.confirmAttempted && Boolean(ai.lastError))) return;
    // 只携带最近少量对话（每条截短），完整上下文靠 pendingPlanContext 与任务数据，不把全部聊天记录发给模型。
    // 已确认执行的摘要消息（skipContext）不再进入上下文，避免旧计划影响后续安排。
    var history = ai.messages.filter(function (message) { return !message.isError && !message.skipContext; }).slice(-4).map(function (message) {
      var limit = message.role === 'user' ? 2000 : 600;
      return { role: message.role, content: message.content.slice(0, limit) };
    });
    var hadPendingPreview = Boolean(ai.preview && ai.preview.previewId && ai.contextPreviewId && !(ai.applyResult && ai.applyResult.complete === true));
    if (!hadPendingPreview) {
      // A completed preview must disappear before a new request, otherwise a failed
      // follow-up could expose the old plan as an executable confirmation again.
      ai.preview = null;
      ai.opSelection = [];
      ai.opEdits = {};
      ai.completedOps = [];
    }
    ai.loading = true;
    ai.lastError = '';
    ai.applyResult = null;
    ai.confirmAttempted = false;
    ai.messages.push({ role: 'user', content: input });
    ai.messages = ai.messages.slice(-40);
    ai.input = '';
    ai.scrollToEnd = true;
    saveAiConversation(ai);
    render();
    try {
      var result = await apiRequest('/api/ai/commands', {
        method: 'POST',
        body: { instruction: input, listId: active.id, messages: history, previewId: ai.contextPreviewId || undefined, previewEdits: pendingAiEdits(ai) }
      });
      var resultMode = result && (result.mode || result.provider || result.engine || result.aiMode);
      if (resultMode) appState.health.mode = normalizeMode(resultMode);
      ai.lastMode = appState.health.mode;
      ai.lastModel = result && result.model ? String(result.model) : '';
      ai.affectedCount = extractAffectedCount(result);
      ai.lastMessage = String(result.message || result.clarification || (result.previewId ? '已整理好。你可以继续调整，或确认这份日程。' : '请补充你想完成的事。'));
      if (isObject(result) && !result.project && (result.projectName || Array.isArray(result.steps))) {
        result.project = {
          projectName: result.projectName,
          startDate: result.startDate,
          steps: result.steps,
          warnings: result.warnings
        };
      }
      ai.messages.push({ role: 'assistant', content: ai.lastMessage });
      if (result.previewId) {
        ai.preview = result;
        ai.contextPreviewId = result.previewId;
        ai.needsClarification = false;
        // 新预览：勾选、时间修改与已执行标记全部重新开始。
        ai.opSelection = Array.isArray(result.operations) ? result.operations.map(function () { return true; }) : [];
        ai.opEdits = {};
        ai.completedOps = [];
      } else if (!hadPendingPreview) {
        // 澄清或普通建议没有新的可执行计划；已存在的待确认预览只在有替换预览时更新。
        ai.preview = null;
        ai.contextPreviewId = '';
        ai.opSelection = [];
        ai.opEdits = {};
        ai.completedOps = [];
        ai.needsClarification = false;
      } else {
        // 保留待确认预览与手工修改；澄清锁只由有效新预览或新对话解除。
        ai.needsClarification = Boolean(ai.needsClarification || (result && result.clarification));
      }
    } catch (error) {
      ai.lastError = error.message || '消息发送失败，请重试。';
      // The failed turn must not become duplicate context when the user retries.
      ai.messages.pop();
      ai.messages.push({ role: 'assistant', content: ai.lastError, isError: true });
      ai.input = input;
    } finally {
      ai.loading = false;
      ai.scrollToEnd = true;
      saveAiConversation(ai);
      if (appState.ai === ai) appState.focusAfterRender = 'ai-command-input';
      render();
    }
  }

  async function applyAiPreview(indices) {
    var ai = appState.ai;
    var preview = ai.preview;
    if (!preview || !preview.previewId || ai.applying || ai.loading || ai.input.trim() || ai.listening || (ai.applyResult && ai.applyResult.complete)) return;
    if (ai.needsClarification && (!Array.isArray(ai.completedOps) || !ai.completedOps.length)) {
      showToast('请先回答上面的澄清问题，再确认这份日程。', true);
      return;
    }
    var selected = Array.isArray(indices)
      ? indices.filter(function (index) { return Number.isInteger(index) && index >= 0; })
      : (Array.isArray(ai.opSelection) ? ai.opSelection.map(function (on, index) { return on ? index : -1; }).filter(function (index) { return index >= 0; }) : undefined);
    if (Array.isArray(selected) && !selected.length) {
      ai.lastError = '请先勾选要执行的项目，或逐项点击“安排此项”。';
      render();
      return;
    }
    var completedOps = Array.isArray(ai.completedOps) ? ai.completedOps : [];
    var edits = Object.keys(ai.opEdits || {}).map(function (key) {
      var edit = ai.opEdits[key];
      return isObject(edit) && Object.keys(edit).length ? Object.assign({ index: Number(key) }, edit) : null;
    }).filter(function (edit) { return edit && completedOps.indexOf(edit.index) === -1; });
    ai.applying = true;
    ai.confirmAttempted = true;
    ai.lastError = '';
    saveAiConversation(ai);
    render();
    try {
      var result = await apiRequest('/api/ai/apply', { method: 'POST', body: { previewId: preview.previewId, indices: selected, edits: edits } });
      ai.applyResult = result;
      if (result && Array.isArray(result.completed)) ai.completedOps = result.completed;
      var resultMode = result && (result.mode || result.provider || result.engine || result.aiMode);
      if (resultMode) appState.health.mode = normalizeMode(resultMode);
      if (result && Array.isArray(result.completed)) ai.completedOps = result.completed;
      var doneNow = result && Array.isArray(result.completed) ? result.completed.length - completedOps.length : 0;
      if (result && result.complete === true) {
        ai.lastError = '';
        ai.confirmAttempted = false;
        // 已确认的摘要只用于展示，不进入后续上下文；同时不再引用这个已完成的预览。
        ai.messages.forEach(function (message) {
          if (!message.isError) message.skipContext = true;
        });
        ai.messages.push({ role: 'assistant', content: '已确认日程，已写入 Microsoft To Do：' + (preview.project ? preview.project.projectName + '，' : '') + (preview.operations || []).filter(function (item) { return item.type !== 'createProject'; }).map(function (item) { return item.title || item.taskTitle || item.text; }).filter(Boolean).join('、') + '。', skipContext: true });
        ai.contextPreviewId = '';
        ai.needsClarification = false;
        saveAiConversation(ai);
        await loadWorkspace({ silent: true });
        showToast('日程已确认。');
      } else if (result && !result.error) {
        // 按项执行：选中项已成功写入，剩余项继续待确认，不算失败。
        ai.lastError = '';
        ai.confirmAttempted = false;
        ai.needsClarification = false;
        saveAiConversation(ai);
        await loadWorkspace({ silent: true });
        showToast('已安排 ' + Math.max(doneNow, 1) + ' 项，剩余项仍可继续调整和确认。');
      } else {
        ai.lastError = result && result.error || '部分操作未完成，可以重试未完成项。';
      }
    } catch (error) {
      ai.lastError = error.message || '确认未完成，请先同步核对，再重试未完成项。';
    } finally {
      ai.applying = false;
      ai.scrollToEnd = true;
      saveAiConversation(ai);
      render();
    }
  }

  function nativeSpeechHandler() {
    return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeSpeech;
  }

  function supportsVoiceInput() {
    return Boolean(nativeSpeechHandler() || window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startVoiceInput() {
    var nativeHandler = nativeSpeechHandler();
    if (nativeHandler) {
      appState.ai.listening = !appState.ai.listening;
      appState.ai.voiceMessage = appState.ai.listening ? '正在听，请说出要处理的任务……' : '正在停止语音输入……';
      render();
      nativeHandler.postMessage({ action: 'toggle' });
      return;
    }
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      appState.ai.voiceMessage = '当前浏览器不支持 SpeechRecognition，可直接键盘输入。';
      render();
      return;
    }
    if (appState.ai.listening && activeRecognition) {
      activeRecognition.stop();
      appState.ai.voiceMessage = '正在停止语音输入……';
      return;
    }
    var recognition = new Recognition();
    activeRecognition = recognition;
    appState.ai.listening = true;
    appState.ai.voiceMessage = '正在听，请说出要处理的任务……';
    render();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (event) {
      var result = event.results && event.results[0] && event.results[0][0];
      if (result && result.transcript) {
        appState.ai.input = (appState.ai.input ? appState.ai.input + ' ' : '') + result.transcript.trim();
        appState.ai.voiceMessage = '已写入指令框，可以继续修改。';
      }
    };
    recognition.onerror = function (event) {
      var errorText = event && event.error === 'not-allowed' ? '麦克风权限未开启，请允许浏览器使用麦克风。' : '语音输入没有完成，请重试或直接键盘输入。';
      appState.ai.voiceMessage = errorText;
    };
    recognition.onend = function () {
      activeRecognition = null;
      appState.ai.listening = false;
      saveAiConversation(appState.ai);
      render();
    };
    try {
      recognition.start();
    } catch (error) {
      activeRecognition = null;
      appState.ai.listening = false;
      appState.ai.voiceMessage = '语音输入启动失败，请重试或直接键盘输入。';
      render();
    }
  }

  window.__nativeSpeechUpdate = function (payload) {
    var update = isObject(payload) ? payload : {};
    if (typeof update.transcript === 'string' && update.transcript.trim() && update.final !== false) {
      appState.ai.input = (appState.ai.input ? appState.ai.input + ' ' : '') + update.transcript.trim();
    }
    appState.ai.listening = update.state === 'listening';
    if (typeof update.message === 'string' && update.message) appState.ai.voiceMessage = update.message;
    else if (update.error) appState.ai.voiceMessage = String(update.error);
    else if (update.state === 'finished') appState.ai.voiceMessage = '已写入指令框，可以继续修改。';
    saveAiConversation(appState.ai);
    render();
  };

  function openModal(modal) {
    appState.modal = modal;
    appState.modalFocusDone = false;
    render();
  }

  function closeModal() {
    if (appState.modal && appState.modal.type === 'settings') appState.settings.apiKey = '';
    appState.modal = null;
    appState.modalFocusDone = false;
    render();
  }

  function setView(view, options) {
    if (VIEW_ORDER.indexOf(view) < 0) return;
    var changed = appState.view !== view;
    appState.view = view;
    if (appState.modal && (appState.modal.type === 'confirm' || appState.modal.type === 'newList')) appState.modal = null;
    savePreferences();
    if (!options || options.render !== false) render({ viewTransition: changed });
    return changed;
  }

  function layoutRange(type, resizer) {
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return null;
    var limits = LAYOUT_LIMITS[descriptor.key];
    var range = { min: limits.min, max: limits.max };
    if (type === 'chat' && resizer && resizer.closest) {
      var chat = resizer.closest('.ai-chat');
      if (chat && chat.getBoundingClientRect) {
        // Keep the fixed command row reachable while resizing the conversation log.
        var reserved = 8;
        var command = chat.querySelector ? chat.querySelector('.ai-command-box') : null;
        if (command && command.getBoundingClientRect) reserved += command.getBoundingClientRect().height;
        else reserved += 70;
        var maxByCard = Math.round(chat.getBoundingClientRect().height - reserved);
        range.max = Math.min(range.max, Math.max(range.min, maxByCard));
      }
    }
    return range;
  }

  function applyLayoutValue(type, value, range) {
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return null;
    var limits = range || LAYOUT_LIMITS[descriptor.key];
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) numeric = layoutValue(type);
    numeric = Math.round(Math.max(limits.min, Math.min(limits.max, numeric)));
    appState.layout[descriptor.key] = numeric;
    updateLayoutDom(type);
    return numeric;
  }

  function updateLayoutDom(type) {
    var value = layoutValue(type);
    var descriptor = layoutDescriptor(type);
    if (!descriptor || !value) return;
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('[data-layout-resizer="' + type + '"]').forEach(function (resizer) {
        var limits = LAYOUT_LIMITS[descriptor.key];
        resizer.setAttribute('aria-valuemin', String(limits.min));
        resizer.setAttribute('aria-valuemax', String(limits.max));
        resizer.setAttribute('aria-valuenow', String(value));
        resizer.setAttribute('aria-valuetext', layoutValueText(type, value));
      });
    }
    if (typeof document.querySelector !== 'function') return;
    if (type === 'sidebar') {
      var shell = document.querySelector('.app-shell');
      if (shell && shell.style) shell.style.setProperty('--sidebar-width', value + 'px');
    } else if (type === 'chat') {
      var chat = document.querySelector('.ai-chat');
      if (chat && chat.style) {
        var custom = appState.layout.aiLogHeight != null;
        chat.classList.toggle('has-custom-log-height', custom);
        if (custom) chat.style.setProperty('--ai-log-height', value + 'px');
        else chat.style.removeProperty('--ai-log-height');
      }
    } else {
      var grid = document.querySelector('.' + (type === 'focus' ? 'focus-grid' : 'timeline-layout'));
      if (grid && grid.style) grid.style.setProperty('--' + (type === 'focus' ? 'focus' : 'timeline') + '-ratio', value + '%');
    }
  }

  function resetLayout(type) {
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return;
    appState.layout[descriptor.key] = LAYOUT_DEFAULTS[descriptor.key];
    if (type === 'chat') appState.layout.aiLogHeight = null;
    savePreferences();
    if (type === 'chat' && typeof document.querySelector === 'function') {
      var chat = document.querySelector('.ai-chat');
      if (chat && chat.style) chat.style.removeProperty('--ai-log-height');
    }
    updateLayoutDom(type);
  }

  function layoutStep(type) {
    return type === 'chat' || type === 'sidebar' ? 8 : 4;
  }

  function handleLayoutKeydown(event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-layout-resizer]') : null;
    if (!target) return false;
    var type = target.getAttribute('data-layout-resizer');
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return false;
    var key = event.key;
    var range = layoutRange(type, target);
    if (key === 'Home') {
      applyLayoutValue(type, range.min, range);
    } else if (key === 'End') {
      applyLayoutValue(type, range.max, range);
    } else {
      var delta = layoutStep(type);
      if (descriptor.orientation === 'horizontal') {
        if (key === 'ArrowUp') delta = -delta;
        else if (key === 'ArrowDown') delta = delta;
        else return false;
      } else {
        if (key === 'ArrowLeft' || key === 'ArrowUp') delta = -delta;
        else if (key === 'ArrowRight' || key === 'ArrowDown') delta = delta;
        else return false;
      }
      var current = layoutValue(type);
      if (type === 'chat' && appState.layout.aiLogHeight == null) {
        var log = document.querySelector('.ai-chat-log');
        if (log) current = log.getBoundingClientRect().height;
      }
      applyLayoutValue(type, current + delta, range);
    }
    savePreferences();
    event.preventDefault();
    return true;
  }

  function handleLayoutPointerDown(event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-layout-resizer]') : null;
    if (!target || (target.offsetParent === null && target.getAttribute('data-layout-resizer') !== 'sidebar')) return;
    var type = target.getAttribute('data-layout-resizer');
    var descriptor = layoutDescriptor(type);
    if (!descriptor) return;
    var range = layoutRange(type, target);
    var startValue = layoutValue(type);
    if (type === 'chat' && appState.layout.aiLogHeight === null && typeof document.querySelector === 'function') {
      var log = document.querySelector('.ai-chat-log');
      if (log && log.getBoundingClientRect) startValue = Math.round(log.getBoundingClientRect().height);
    }
    appState.layoutDrag = { type: type, target: target, startX: event.clientX, startY: event.clientY, startValue: startValue, range: range };
    target.classList.add('is-dragging');
    if (document.body) {
      document.body.classList.add('is-layout-resizing');
      document.body.classList.toggle('is-layout-resizing-row', type === 'chat');
    }
    if (target.setPointerCapture && event.pointerId !== undefined) {
      try { target.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    }
    event.preventDefault();
  }

  function handleLayoutPointerMove(event) {
    var drag = appState.layoutDrag;
    if (!drag) return;
    var type = drag.type;
    var delta;
    if (type === 'chat') {
      delta = event.clientY - drag.startY;
    } else if (type === 'sidebar') {
      delta = event.clientX - drag.startX;
    } else {
      var grid = drag.target.closest ? drag.target.closest('.' + (type === 'focus' ? 'focus-grid' : 'timeline-layout')) : null;
      var width = grid && grid.getBoundingClientRect ? grid.getBoundingClientRect().width : 0;
      delta = width ? ((event.clientX - drag.startX) / width) * 100 : 0;
    }
    applyLayoutValue(type, drag.startValue + delta, drag.range);
    event.preventDefault();
  }

  function handleLayoutPointerUp() {
    var drag = appState.layoutDrag;
    if (!drag) return;
    if (drag.target && drag.target.classList) drag.target.classList.remove('is-dragging');
    if (document.body) {
      document.body.classList.remove('is-layout-resizing', 'is-layout-resizing-row');
    }
    appState.layoutDrag = null;
    savePreferences();
  }

  function handleLayoutDoubleClick(event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-layout-resizer]') : null;
    if (!target) return;
    resetLayout(target.getAttribute('data-layout-resizer'));
    event.preventDefault();
  }

  function handleClick(event) {
    var target = event.target.closest ? event.target.closest('[data-action], [data-view], [data-example], [data-calendar-mode]') : null;
    if (!target) {
      if (event.target.matches && event.target.matches('[data-modal-backdrop]')) closeModal();
      return;
    }
    if (target.matches('[data-view]')) {
      var view = target.getAttribute('data-view');
      if (view === 'list' || view === 'board' || view === 'timeline' || view === 'matrix') {
        if (!getActiveList()) {
          showToast('还没有可用的 To Do 清单。', true);
          return;
        }
      }
      if (view === 'all') appState.listFilter = 'all';
      setView(view);
      return;
    }
    if (target.matches('[data-calendar-mode]')) {
      appState.calendarMode = target.getAttribute('data-calendar-mode') || 'month';
      savePreferences();
      render();
      return;
    }
    if (target.matches('[data-example]')) {
      appState.ai.input = target.getAttribute('data-example') || '';
      setView('ai', { render: false });
      appState.focusAfterRender = 'ai-command-input';
      render({ viewTransition: true });
      return;
    }
    var action = target.getAttribute('data-action');
    if (action === 'toggle-calendar-day') {
      var day = target.getAttribute('data-date');
      appState.expandedCalendarDays[day] = !appState.expandedCalendarDays[day];
      render();
    } else if (action === 'open-list') {
      if (appState.ai.loading || appState.ai.applying || appState.ai.listening) {
        showToast('请等当前 AI 操作结束后再切换清单。');
        return;
      }
      appState.activeListId = target.getAttribute('data-list-id') || '';
      selectAiConversation(appState.activeListId);
      appState.listFilter = 'all';
      // 点击具体清单 = 明确要看这一个：范围切回「当前清单」；
      // 视图类型保持不变（在看板就留在看板，在日历就留在日历），只有今日/AI 这类无清单视图才回到列表。
      appState.scope = 'list';
      savePreferences();
      var listScopedViews = ['list', 'board', 'calendar', 'timeline', 'matrix'];
      setView(listScopedViews.indexOf(appState.view) >= 0 ? appState.view : 'list');
    } else if (action === 'create-list') {
      openModal({ type: 'newList' });
    } else if (action === 'delete-list') {
      var delId = target.getAttribute('data-list-id') || '';
      var delName = target.getAttribute('data-list-name') || '该清单';
      if (!delId) return;
      // 用应用内确认弹窗（WKWebView 不支持 window.confirm）。
      openModal({
        type: 'confirm',
        danger: true,
        title: '删除清单',
        message: '「' + delName + '」及其中的任务会被永久删除，并直接写入 Microsoft To Do。此操作无法撤销。',
        confirmLabel: '删除清单',
        onConfirm: function () {
          return deleteList(delId).then(function (result) {
            showToast('已删除「' + delName + '」' + (result && result.removedTasks ? '，含 ' + result.removedTasks + ' 个任务' : ''));
            setView('list');
          });
        }
      });
    } else if (action === 'set-scope') {
      var nextScope = target.getAttribute('data-scope') === 'all' ? 'all' : 'list';
      if (nextScope === 'list' && !getActiveList()) {
        showToast('请先在左侧选择一个清单。');
        return;
      }
      appState.scope = nextScope;
      savePreferences();
      render();
    } else if (action === 'start-auth') {
      startMicrosoftAuth();
    } else if (action === 'auth-logout') {
      signOutMicrosoftAuth();
    } else if (action === 'copy-auth-code') {
      copyAuthCode();
    } else if (action === 'refresh') {
      appState.modal = null;
      loadWorkspace();
    } else if (action === 'sync') {
      loadWorkspace({ silent: true });
    } else if (action === 'open-settings') {
      openSettings();
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'confirm-yes') {
      runConfirmAction();
    } else if (action === 'open-task') {
      openModal({ type: 'task', listId: target.getAttribute('data-list-id') || appState.activeListId });
    } else if (action === 'create-project-schedule') {
      appState.newListDraft = '';
      appState.projectStartDateDraft = todayKey();
      appState.projectPlan.error = '';
      openModal({ type: 'newList', mode: 'schedule' });
    } else if (action === 'new-list-mode') {
      if (appState.modal && appState.modal.type === 'newList') {
        appState.modal.mode = target.getAttribute('data-mode') === 'schedule' ? 'schedule' : 'direct';
        appState.projectPlan.error = '';
        render();
      }
    } else if (action === 'add-template-step') {
      var addDraft = settingsDraft();
      addDraft.projectTemplate.steps.push({ title: '新节点', offsetDays: 0, reminderTime: '09:00' });
      appState.settings.draft = addDraft;
      render();
    } else if (action === 'remove-template-step') {
      var removeDraft = settingsDraft();
      var removeIndex = Number(target.getAttribute('data-template-index'));
      if (Number.isInteger(removeIndex) && removeIndex >= 0 && removeIndex < removeDraft.projectTemplate.steps.length) {
        removeDraft.projectTemplate.steps.splice(removeIndex, 1);
        appState.settings.draft = removeDraft;
        render();
      }
    } else if (action === 'open-time-picker') {
      appState.ai.openPicker = { index: Number(target.getAttribute('data-op-index')), field: target.getAttribute('data-op-field') };
      render();
      restoreTimeWheelScroll();
    } else if (action === 'close-time-picker') {
      appState.ai.openPicker = null;
      render();
    } else if (action === 'apply-project-preview') {
      applyProjectPreview();
    } else if (action === 'ai-quick-split') {
      var splitState = appState.ai;
      if (splitState.loading || splitState.applying || splitState.listening || splitState.input.trim()) return;
      // 一键“任务拆分”：把当前预览内容按动作拆成多个独立任务后重新生成预览。
      splitState.input = '把上面的内容按动作拆分成多个独立任务：一个动作一个任务，不要把几件事合并成一条；保持原有的时间安排，逐项给出预估提醒时间，方便我单独调整和确认。';
      saveAiConversation(splitState);
      render();
      runAiCommand();
    } else if (action === 'toggle-op') {
      var toggleIndex = Number(target.getAttribute('data-op-index'));
      var selection = appState.ai.opSelection;
      if (Array.isArray(selection) && Number.isInteger(toggleIndex) && toggleIndex >= 0 && toggleIndex < selection.length) {
        selection[toggleIndex] = target.checked;
        saveAiConversation(appState.ai);
        render();
      }
    } else if (target.matches('[data-op-time-action="set-offset"]')) {
      var offsetIdx = Number(target.getAttribute('data-op-index'));
      var offsetField = target.getAttribute('data-op-field');
      var offsetVal = target.getAttribute('data-op-time-value');
      applyTimeOffset(offsetIdx, offsetField, offsetVal);
      // 选中态动画：直接给目标加一个类以触发 CSS 弹动
      var panel = target.closest('.op-time-panel');
      if (panel) {
        var chips = panel.querySelectorAll('.op-date-chip');
        for (var ci = 0; ci < chips.length; ci++) {
          chips[ci].classList.toggle('is-selected', chips[ci] === target);
        }
        target.classList.remove('is-popped');
        // 强制重排后重新添加以重启动画
        void target.offsetWidth;
        target.classList.add('is-popped');
      }
    } else if (action === 'apply-op') {
      var applyIndex = Number(target.getAttribute('data-op-index'));
      if (Number.isInteger(applyIndex) && applyIndex >= 0) applyAiPreview([applyIndex]);
    } else if (action === 'apply-ai-preview') {
      applyAiPreview();
    } else if (action === 'new-ai-chat') {
      if (appState.ai.loading || appState.ai.applying || appState.ai.listening) return;
      appState.ai = newAiConversation(appState.activeListId);
      saveAiConversation(appState.ai);
      appState.focusAfterRender = 'ai-command-input';
      render();
    } else if (action === 'edit-task') {
      var editListId = target.getAttribute('data-list-id');
      var editTask = getTask(editListId, target.getAttribute('data-task-id'));
      if (editTask) openModal({ type: 'task', listId: editListId, task: editTask });
    } else if (action === 'delete-task') {
      handleDeleteTask(target.getAttribute('data-list-id'), target.getAttribute('data-task-id'));
    } else if (action === 'toggle-task') {
      handleToggleTask(target.getAttribute('data-list-id'), target.getAttribute('data-task-id'));
    } else if (action === 'start-voice') {
      startVoiceInput();
    } else if (action === 'open-ai') {
      setView('ai', { render: false });
      appState.focusAfterRender = 'ai-command-input';
      render({ viewTransition: true });
    } else if (action === 'calendar-today') {
      appState.calendarAnchor = new Date();
      render();
    } else if (action === 'calendar-prev' || action === 'calendar-next') {
      var direction = action === 'calendar-prev' ? -1 : 1;
      var anchor = dayStart(appState.calendarAnchor);
      if (appState.calendarMode === 'year') anchor.setFullYear(anchor.getFullYear() + direction);
      else if (appState.calendarMode === 'week') anchor.setDate(anchor.getDate() + direction * 7);
      else anchor.setMonth(anchor.getMonth() + direction);
      appState.calendarAnchor = anchor;
      render();
    }
  }

  function runConfirmAction() {
    var modal = appState.modal;
    if (!modal || modal.type !== 'confirm' || typeof modal.onConfirm !== 'function') return;
    modal.busy = true;
    render();
    Promise.resolve(modal.onConfirm()).then(function () {
      appState.modal = null;
      render();
    }).catch(function (error) {
      appState.modal = null;
      render();
      showToast(error.message || '操作失败', true);
    });
  }

  function handleToggleTask(listId, taskId) {
    var task = getTask(listId, taskId);
    if (!task) return;
    var next = task.status === 'completed' ? 'notStarted' : 'completed';
    patchTaskStatus(listId, taskId, next, next === 'completed' ? '任务已完成。' : '任务已重新打开。');
  }

  function handleDeleteTask(listId, taskId) {
    var task = getTask(listId, taskId);
    if (!task) return;
    openModal({
      type: 'confirm',
      danger: true,
      title: '删除任务',
      message: '“' + task.title + '”将被永久删除，并直接写入 Microsoft To Do。此操作无法撤销。',
      confirmLabel: '删除',
      onConfirm: function () {
        return deleteTask(listId, taskId).then(function () {
          showToast('任务已删除。');
        });
      }
    });
  }

  function handleChange(event) {
    var target = event.target;
    if (target.matches('[data-op-field]')) {
      var aiState = appState.ai;
      var editIndex = Number(target.getAttribute('data-op-index'));
      var editField = target.getAttribute('data-op-field');
      var rawValue = target.value;
      if (!isObject(aiState.opEdits)) aiState.opEdits = {};
      var opEdit = isObject(aiState.opEdits[editIndex]) ? aiState.opEdits[editIndex] : {};
      if (rawValue) opEdit[editField] = rawValue.length === 16 ? rawValue + ':00' : rawValue;
      else delete opEdit[editField];
      if (Object.keys(opEdit).length) aiState.opEdits[editIndex] = opEdit;
      else delete aiState.opEdits[editIndex];
      saveAiConversation(aiState);
      render();
      return;
    }
    // 模型下拉切换：选中即更新草稿里的模型名，下方输入框同步显示。
    if (target.matches('[data-settings-field="modelPicker"]')) {
      var pickedModel = String(target.value || '').trim();
      if (pickedModel) {
        var modelDraft = settingsDraft();
        modelDraft.ai.model = pickedModel;
        appState.settings.draft = modelDraft;
        render();
      }
      return;
    }
    if (target.matches('[data-task-status]')) {
      var listId = target.getAttribute('data-list-id');
      var taskId = target.getAttribute('data-task-id');
      var nextStatus = target.value;
      patchTaskStatus(listId, taskId, nextStatus, '已移到“' + (STATUS_LABELS[nextStatus] || nextStatus) + '”。');
      return;
    }
    if (target.matches('[data-action="filter"]')) {
      appState.listFilter = target.value;
      render();
      return;
    }
    if (target.matches('[data-pref]')) {
      var preference = target.getAttribute('data-pref');
      if (preference === 'lowDistraction') appState.lowDistraction = target.checked;
      if (preference === 'reducedMotion') appState.reducedMotion = target.checked;
      savePreferences();
      document.body.classList.toggle('reduced-motion', appState.reducedMotion);
      if (preference === 'lowDistraction') render();
      if (preference === 'reducedMotion') syncMobileNavMotion();
    }
  }

  function handleInput(event) {
    var target = event.target;
    if (target.matches('.op-time-wheel')) {
      // 钟点轮滚动结束后读取居中项，更新时间（不触发全量渲染以保持滚动顺滑）。
      var wheel = target;
      var index = Number(wheel.getAttribute('data-op-index'));
      var field = wheel.getAttribute('data-op-field');
      var item = wheel.querySelector('.op-time-wheel-item.is-selected');
      if (item) item.classList.remove('is-selected');
      var center = wheel.scrollTop + wheel.clientHeight / 2;
      var nearest = null;
      var nodes = wheel.querySelectorAll('.op-time-wheel-item');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var mid = n.offsetTop + n.offsetHeight / 2;
        if (!nearest || Math.abs(mid - center) < Math.abs(nearest.offsetTop + nearest.offsetHeight / 2 - center)) nearest = n;
      }
      if (nearest) {
        nearest.classList.add('is-selected');
        applyTimeSelection(index, field, nearest.getAttribute('data-op-time-value'));
      }
    }
    if (target.matches('[data-ai-input]')) {
      appState.ai.input = target.value;
      fitAiInput(true);
      saveAiConversation(appState.ai);
      var confirmBar = document.querySelector('.ai-confirm-bar');
      if (confirmBar) confirmBar.outerHTML = renderAiConfirmation();
    }
    if (target.matches('#progress-note')) appState.noteDraft = target.value;
    if (target.matches('#quick-title')) appState.quickDraft = target.value;
    if (target.matches('#new-list-name')) appState.newListDraft = target.value;
    if (target.matches('#project-start-date')) appState.projectStartDateDraft = target.value;
    if (target.matches('[data-settings-field]')) {
      var draft = settingsDraft();
      var field = target.getAttribute('data-settings-field');
      var index = Number(target.getAttribute('data-template-index'));
      if (field === 'apiKey') appState.settings.apiKey = target.value;
      if (field === 'model') draft.ai.model = target.value;
      if (field === 'templateName') draft.projectTemplate.name = target.value;
      if (Number.isInteger(index) && draft.projectTemplate.steps[index]) {
        if (field === 'stepTitle') draft.projectTemplate.steps[index].title = target.value;
        if (field === 'stepOffset') draft.projectTemplate.steps[index].offsetDays = Number(target.value || 0);
        if (field === 'stepReminder') draft.projectTemplate.steps[index].reminderTime = target.value;
      }
      appState.settings.draft = draft;
    }
  }

  function handleSubmit(event) {
    var form = event.target;
    if (!form.matches('[data-form]')) return;
    event.preventDefault();
    var data = new FormData(form);
    if (form.getAttribute('data-form') === 'quick-add') {
      var quickTitle = String(data.get('title') || '').trim();
      var quickList = String(data.get('listId') || '');
      if (!quickTitle) return;
      if (isTaskBusy('__quickadd')) return;
      appState.pendingTasks['__quickadd'] = true;
      var quickButton = form.querySelector('button[type="submit"]');
      if (quickButton) quickButton.disabled = true;
      createTask(quickList, { title: quickTitle }).then(function () {
        appState.quickDraft = '';
        delete appState.pendingTasks['__quickadd'];
        showToast('任务已添加。');
        appState.focusAfterRender = 'quick-title';
        render();
      }).catch(function (error) {
        delete appState.pendingTasks['__quickadd'];
        showToast(error.message || '任务添加失败', true);
        render();
      });
      return;
    }
    if (form.getAttribute('data-form') === 'new-list') {
      var displayName = String(data.get('displayName') || '').trim();
      if (!displayName) return;
      var newListMode = String(data.get('mode') || 'direct');
      if (newListMode === 'schedule') {
        var startDate = String(data.get('startDate') || '').trim();
        if (!startDate) return;
        appState.newListDraft = displayName;
        appState.projectStartDateDraft = startDate;
        createProjectPreview(displayName, startDate);
        return;
      }
      var listButton = form.querySelector('button[type="submit"]');
      if (listButton) listButton.disabled = true;
      createList(displayName).then(function () {
        appState.newListDraft = '';
        appState.modal = null;
        appState.view = 'list';
        savePreferences();
        render();
        showToast('项目已创建。');
      }).catch(function (error) {
        if (listButton) listButton.disabled = false;
        appState.modal = null;
        showToast(error.message || '项目创建失败', true);
        render();
      });
      return;
    }
    if (form.getAttribute('data-form') === 'task-editor') {
      var listId = String(data.get('listId') || '');
      var taskId = String(data.get('taskId') || '');
      var values = {
        title: String(data.get('title') || '').trim(),
        status: String(data.get('status') || 'notStarted'),
        importance: String(data.get('importance') || 'normal'),
        dueDateTime: String(data.get('dueDateTime') || ''),
        reminderDateTime: String(data.get('reminderDateTime') || ''),
        recurrence: String(data.get('recurrence') || 'none'),
        body: String(data.get('body') || '').trim()
      };
      if (!values.title) return;
      var taskPatch = { title: values.title, status: values.status, importance: values.importance === 'important' ? 'high' : values.importance, body: values.body };
      if (values.dueDateTime) taskPatch.dueDateTime = datePayload(values.dueDateTime);
      else taskPatch.clearDueDate = true;
      if (values.reminderDateTime) taskPatch.reminderDateTime = datePayload(values.reminderDateTime);
      else taskPatch.clearReminder = true;
      if (values.recurrence && values.recurrence !== 'none' && values.recurrence !== '__existing') taskPatch.recurrence = values.recurrence;
      else if (values.recurrence === 'none') taskPatch.clearRecurrence = true;
      var saveButton = form.querySelector('button[type="submit"]');
      if (saveButton) saveButton.disabled = true;
      var request = taskId ? updateTask(listId, taskId, taskPatch) : createTask(listId, values);
      request.then(function () {
        appState.modal = null;
        render();
        showToast(taskId ? '任务已更新。' : '任务已创建。');
      }).catch(function (error) {
        if (saveButton) saveButton.disabled = false;
        if (appState.modal) appState.modal.draft = Object.assign({}, values, { id: taskId });
        showToast(error.message || '任务保存失败', true);
        render();
      });
      return;
    }
    if (form.getAttribute('data-form') === 'settings') {
      saveSettings();
      return;
    }
    if (form.getAttribute('data-form') === 'progress-note') {
      var noteList = getActiveList();
      var content = String(data.get('content') || '').trim();
      if (!noteList || !content) return;
      var noteButton = form.querySelector('button[type="submit"]');
      if (noteButton) noteButton.disabled = true;
      addProgressNote(noteList.id, content).then(function () {
        appState.noteDraft = '';
        showToast('进展已记录。');
        render();
      }).catch(function (error) {
        if (noteButton) noteButton.disabled = false;
        showToast(error.message || '进展记录失败', true);
        render();
      });
      return;
    }
    if (form.getAttribute('data-form') === 'ai-command') {
      runAiCommand();
    }
  }

  function handleDragStart(event) {
    var card = event.target.closest ? event.target.closest('[data-board-task]') : null;
    if (!card) return;
    stopBoardAutoScroll();
    appState.drag = { listId: card.getAttribute('data-list-id'), taskId: card.getAttribute('data-task-id') };
    card.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify(appState.drag));
    }
    showToast('已抓取任务，拖到新的状态列。');
  }

  function handleDragOver(event) {
    var target = event.target;
    var board = getBoardFromTarget(target);
    var column = target && target.closest ? target.closest('[data-board-status]') : null;
    if (!board && !column) return;
    event.preventDefault();
    if (board) updateBoardAutoScroll(board, event);
    if (column) column.classList.add('is-over');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function handleDragLeave(event) {
    var target = event.target;
    var column = target && target.closest ? target.closest('[data-board-status]') : null;
    if (column && !column.contains(event.relatedTarget)) column.classList.remove('is-over');
    var state = appState.boardAutoScroll;
    var board = getBoardFromTarget(target) || (state && state.board);
    if (board && (!event.relatedTarget || !board.contains || !board.contains(event.relatedTarget))) stopBoardAutoScroll();
  }

  // 指针已经越过 .board 的可视边界时，事件目标可能变成 main/body；
  // 仍保留一次窗口级 dragover，让用户把卡片贴到窗口边缘继续滚动。
  function handleWindowDragOver(event) {
    if (!appState.drag || typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    if (getBoardFromTarget(event.target)) return;
    var board = document.querySelector('.board');
    if (!board || typeof board.getBoundingClientRect !== 'function') return;
    var rect;
    try { rect = board.getBoundingClientRect(); } catch (error) { return; }
    var pointerY = Number(event.clientY);
    var viewportHeight = typeof window !== 'undefined' && Number(window.innerHeight) > 0
      ? Number(window.innerHeight)
      : Number(document.documentElement && document.documentElement.clientHeight);
    var nearViewportEdge = Number.isFinite(viewportHeight) && viewportHeight > 0 &&
      (pointerY <= BOARD_AUTO_SCROLL_EDGE_PX || pointerY >= viewportHeight - BOARD_AUTO_SCROLL_EDGE_PX);
    var insideBoard = rect && Number.isFinite(pointerY) && pointerY >= rect.top && pointerY <= rect.bottom;
    if (!rect || !Number.isFinite(pointerY) || (!insideBoard && !nearViewportEdge)) return;
    event.preventDefault();
    updateBoardAutoScroll(board, event);
  }

  function handleDrop(event) {
    stopBoardAutoScroll();
    var target = event.target;
    var column = target && target.closest ? target.closest('[data-board-status]') : null;
    if (!column) return;
    event.preventDefault();
    column.classList.remove('is-over');
    var drag = appState.drag;
    if (!drag && event.dataTransfer) {
      try { drag = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (error) { drag = null; }
    }
    appState.drag = null;
    if (!drag) return;
    // 看板的「全部待办」模式下任务来自不同清单，不能按 activeListId 过滤，否则跨清单拖动会被丢弃。
    var aggregateBoard = appState.view === 'board' && appState.scope === 'all';
    if (!aggregateBoard && drag.listId !== appState.activeListId) return;
    var targetStatus = column.getAttribute('data-board-status');
    var task = getTask(drag.listId, drag.taskId);
    if (!task || task.status === targetStatus) return;
    patchTaskStatus(drag.listId, drag.taskId, targetStatus, '任务已移到“' + STATUS_LABELS[targetStatus] + '”。');
  }

  function handleDragEnd(event) {
    var target = event.target;
    var card = target && target.closest ? target.closest('[data-board-task]') : null;
    if (card) card.classList.remove('is-dragging');
    if (document && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.board-column.is-over').forEach(function (column) { column.classList.remove('is-over'); });
    }
    stopBoardAutoScroll();
    appState.drag = null;
  }

  function handleDragCancel() {
    stopBoardAutoScroll();
    if (document && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.board-task.is-dragging').forEach(function (card) { card.classList.remove('is-dragging'); });
    }
    appState.drag = null;
  }

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && appState.modal) {
      closeModal();
      return;
    }
    if (handleLayoutKeydown(event)) return;
    if (!event.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && event.target.matches && event.target.matches('[data-ai-input]')) {
      event.preventDefault();
      runAiCommand();
      return;
    }
    if (event.key === 'Enter' && event.target.matches && event.target.matches('[data-board-task]')) {
      event.preventDefault();
      event.target.click();
      return;
    }
    if (isTypingTarget(event.target) || appState.modal) return;
    if (event.key >= '1' && event.key <= '7' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      var nextView = VIEW_ORDER[Number(event.key) - 1];
      if (nextView) {
        if ((nextView === 'list' || nextView === 'board' || nextView === 'timeline' || nextView === 'matrix') && !getActiveList()) {
          showToast('还没有可用的 To Do 清单。', true);
          return;
        }
        event.preventDefault();
        setView(nextView);
      }
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      if (appState.view === 'ai') {
        appState.focusAfterRender = 'ai-command-input';
        render();
      } else {
        appState.focusAfterRender = 'quick-title';
        render();
      }
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      var active = getActiveList();
      if (active) {
        event.preventDefault();
        openModal({ type: 'task', listId: active.id });
      }
    }
  }

  function boot() {
    var app = document.getElementById('app');
    if (!app) return;
    // 原生菜单直接调用已有动作，避免快捷键依赖某个视图是否渲染按钮。
    window.__todoNativeCommand = function (action, value) {
      if (action === 'view' && VIEW_ORDER.indexOf(value) >= 0) setView(value);
      if (action === 'new-task' && getActiveList()) openModal({ type: 'task', listId: getActiveList().id });
      if (action === 'sync') loadWorkspace({ silent: true });
    };
    app.addEventListener('click', handleClick);
    app.addEventListener('change', handleChange);
    app.addEventListener('input', handleInput);
    app.addEventListener('submit', handleSubmit);
    app.addEventListener('dragstart', handleDragStart);
    app.addEventListener('dragover', handleDragOver);
    app.addEventListener('dragleave', handleDragLeave);
    app.addEventListener('drop', handleDrop);
    app.addEventListener('dragend', handleDragEnd);
    app.addEventListener('keydown', handleKeydown);
    app.addEventListener('wheel', handleBoardWheel, { passive: false });
    app.addEventListener('gesturestart', handleBoardGestureStart, { passive: false });
    app.addEventListener('gesturechange', handleBoardGestureChange, { passive: false });
    app.addEventListener('gestureend', handleBoardGestureEnd, { passive: false });
    app.addEventListener('pointerdown', handleLayoutPointerDown);
    app.addEventListener('dblclick', handleLayoutDoubleClick);
    window.addEventListener('pointermove', handleLayoutPointerMove);
    window.addEventListener('pointerup', handleLayoutPointerUp);
    window.addEventListener('pointerup', rememberAiInputHeight);
    window.addEventListener('resize', function () { fitAiInput(false); });
    window.addEventListener('pointercancel', handleLayoutPointerUp);
    window.addEventListener('pointercancel', handleDragCancel);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', handleDragCancel);
    window.addEventListener('blur', handleDragCancel);
    setupMobileNavMotion();
    render();
    loadWorkspace();
    // 后台自动同步：每 3 分钟静默刷新；窗口重新聚焦时（至少间隔 60 秒）也会同步。
    window.setInterval(function () {
      if (document.hidden || appState.modal || appState.ai.loading || appState.syncing) return;
      if (Date.now() - appState.lastSyncAt >= SYNC_INTERVAL_MS) loadWorkspace({ silent: true });
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) handleDragCancel();
      if (!document.hidden) maybeAutoSync();
    });
    window.addEventListener('focus', maybeAutoSync);
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // 离线外壳是增强能力，失败不影响 Microsoft To Do 在线读写。
      });
    }
  }

  window.addEventListener('online', function () {
    if (appState.error) loadWorkspace();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
