
/**
 * StartLeveling — Gamified Productivity OS
 * V1 Client Core Engine
 */
document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // CONFIGURATION & CONSTANTS
  // ==========================================
  const RANKS = [
    { min: 2000, name: 'Infinity' },
    { min: 1500, name: 'Transcendent' },
    { min: 1000, name: 'Mythic' },
    { min: 700, name: 'Legend' },
    { min: 500, name: 'Grandmaster' },
    { min: 400, name: 'Master' },
    { min: 300, name: 'Champion' },
    { min: 200, name: 'Elite' },
    { min: 150, name: 'Veteran' },
    { min: 100, name: 'Warrior' },
    { min: 50, name: 'Disciple' },
    { min: 25, name: 'Adept' },
    { min: 10, name: 'Apprentice' },
    { min: 1, name: 'Novice' }
  ];

  const INITIAL_TASKS = [];

  const DEFAULT_PRAYERS = {
    bomdod: { completed: false, time: "03:45 AM", notes: "" },
    peshin: { completed: false, time: "12:30 PM", notes: "" },
    asr: { completed: false, time: "04:45 PM", notes: "" },
    shom: { completed: false, time: "07:50 PM", notes: "" },
    xufton: { completed: false, time: "09:30 PM", notes: "" }
  };

  const DEFAULT_ZIKR = {
    istighfar: { name: 'Istighfar', target: 100, completed: 0, sp: 25 },
    salawat: { name: 'Salawat', target: 100, completed: 0, sp: 25 },
    subhanallah: { name: 'Subhanallah', target: 33, completed: 0, sp: 25 },
    alhamdulillah: { name: 'Alhamdulillah', target: 33, completed: 0, sp: 25 }
  };

  const STORAGE_KEYS = {
    totalSp: 'sl_total_sp',
    level: 'sl_level',
    rank: 'sl_rank',
    dailyPurpose: 'sl_daily_purpose',
    taskState: 'sl_task_state',
    discipline: 'sl_discipline_score',
    consistency: 'sl_consistency_score',
    archive: 'sl_archive',
    history: 'sl_history',
    redoHistory: 'sl_redo_history',
    routine: 'sl_routine',
    prayers: 'sl_prayers',
    zikr: 'sl_zikr',
    lastResetDate: 'sl_last_reset_date'
  };

  function getStorageJSON(key, fallback) {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    try {
      return JSON.parse(item);
    } catch (e) {
      return fallback;
    }
  }

  function getTashkentDateString() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeDOMId(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_:.]/g, '');
  }

  function formatZikrLabel(key) {
    return String(key)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function normalizeZikrData(zikrRoot) {
    Object.keys(zikrRoot || {}).forEach(date => {
      const entry = zikrRoot[date];
      if (!entry || typeof entry !== 'object') return;
      Object.keys(entry).forEach(z => {
        if (!entry[z] || typeof entry[z] !== 'object') return;
        entry[z].name = entry[z].name || formatZikrLabel(z);
        entry[z].target = Number(entry[z].target) || 0;
        entry[z].completed = Number(entry[z].completed) || 0;
        entry[z].sp = Number(entry[z].sp) || 25;
      });
    });
  }

  // ==========================================
  // SYSTEM STATE
  // ==========================================
  let state = {
    totalSp: 0,
    currentDate: getTashkentDateString(),
    viewingDate: getTashkentDateString(),
    purpose: {},
    routines: {},
    tasks: {},
    prayers: {},
    zikr: {},
    disciplineScores: {},
    consistencyScores: {},
    archive: []
  };

  let undoStack = [];
  let redoStack = [];
  let editingTaskId = null;
  let editingZikrId = null;
  let toolbarActionHandler = null;
  let purposeHistorySnapshot = null;
  let suppressToastsOnInitialRender = true;

  // ==========================================
  // COMMON DOM REFERENCES
  // ==========================================
  const mainOverlay = document.getElementById('mainOverlay');
  const rightSidebar = document.getElementById('rightSidebar');
  const leftSidebar = document.getElementById('left-sidebar');
  const mobileMenuBtn = document.getElementById('btnMobileMenu');

  // ==========================================
  // STATE PERSISTENCE & INITIALIZATION
  // ==========================================
  function loadState() {
    const currentDate = getTashkentDateString();
    state.currentDate = currentDate;
    state.viewingDate = currentDate;

    const storedTotalSp = parseInt(localStorage.getItem(STORAGE_KEYS.totalSp), 10);
    if (!Number.isNaN(storedTotalSp)) state.totalSp = storedTotalSp;

    const storedArchive = getStorageJSON(STORAGE_KEYS.archive, []);
    state.archive = Array.isArray(storedArchive) ? storedArchive : [];

    const storedTasks = getStorageJSON(STORAGE_KEYS.taskState, {});
    if (storedTasks && typeof storedTasks === 'object') state.tasks = storedTasks;

    const storedPurpose = getStorageJSON(STORAGE_KEYS.dailyPurpose, {});
    if (storedPurpose && typeof storedPurpose === 'object') state.purpose = storedPurpose;

    const storedRoutines = getStorageJSON(STORAGE_KEYS.routine, {});
    if (storedRoutines && typeof storedRoutines === 'object') state.routines = storedRoutines;

    const storedPrayers = getStorageJSON(STORAGE_KEYS.prayers, {});
    if (storedPrayers && typeof storedPrayers === 'object') state.prayers = storedPrayers;

    const storedZikr = getStorageJSON(STORAGE_KEYS.zikr, {});
    if (storedZikr && typeof storedZikr === 'object') state.zikr = storedZikr;

    normalizeZikrData(state.zikr);

    const storedDiscipline = getStorageJSON(STORAGE_KEYS.discipline, {});
    if (storedDiscipline && typeof storedDiscipline === 'object') state.disciplineScores = storedDiscipline;

    const storedConsistency = getStorageJSON(STORAGE_KEYS.consistency, {});
    if (storedConsistency && typeof storedConsistency === 'object') state.consistencyScores = storedConsistency;

    const storedHistory = getStorageJSON(STORAGE_KEYS.history, []);
    if (Array.isArray(storedHistory)) undoStack = storedHistory;

    const storedRedo = getStorageJSON(STORAGE_KEYS.redoHistory, []);
    if (Array.isArray(storedRedo)) redoStack = storedRedo;

    if (!state.tasks[currentDate]) {
      state.tasks[currentDate] = deepClone(INITIAL_TASKS);
      state.prayers[currentDate] = deepClone(DEFAULT_PRAYERS);
      state.zikr[currentDate] = deepClone(DEFAULT_ZIKR);
      state.purpose[currentDate] = state.purpose[currentDate] || '';
      state.routines[currentDate] = state.routines[currentDate] || '';
    }

    normalizeZikrData({ [currentDate]: state.zikr[currentDate] });

    buildArchiveHistory();
  }

  function buildInitialState() {
    const currentDate = getTashkentDateString();
    state.totalSp = 380;
    state.currentDate = currentDate;
    state.viewingDate = currentDate;
    state.purpose[currentDate] = '';
    state.routines[currentDate] = '';
    state.tasks[currentDate] = deepClone(INITIAL_TASKS);
    state.prayers[currentDate] = deepClone(DEFAULT_PRAYERS);
    state.zikr[currentDate] = deepClone(DEFAULT_ZIKR);
    state.disciplineScores = {};
    state.consistencyScores = {};
    state.archive = [];
    undoStack = [];
    redoStack = [];
    persistAllState();
  }

  function saveState() {
    // Save to localStorage immediately (PRIMARY)
    localStorage.setItem(STORAGE_KEYS.totalSp, String(state.totalSp));
    localStorage.setItem(STORAGE_KEYS.taskState, JSON.stringify(state.tasks));
    localStorage.setItem(STORAGE_KEYS.dailyPurpose, JSON.stringify(state.purpose));
    localStorage.setItem(STORAGE_KEYS.routine, JSON.stringify(state.routines));
    localStorage.setItem(STORAGE_KEYS.prayers, JSON.stringify(state.prayers));
    localStorage.setItem(STORAGE_KEYS.zikr, JSON.stringify(state.zikr));
    localStorage.setItem(STORAGE_KEYS.discipline, JSON.stringify(state.disciplineScores));
    localStorage.setItem(STORAGE_KEYS.consistency, JSON.stringify(state.consistencyScores));
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(state.archive));
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(undoStack));
    localStorage.setItem(STORAGE_KEYS.redoHistory, JSON.stringify(redoStack));

    // Queue cloud sync if authenticated (SECONDARY - non-blocking)
    if (currentUserId) {
      queueCloudSync();
    }
  }

  function queueCloudSync() {
    if (!currentUserId) return;

    // Sync user stats
    if (userStatsSync) {
      userStatsSync.update({
        total_sp: state.totalSp,
        discipline_scores: state.disciplineScores,
        consistency_scores: state.consistencyScores
      }).catch(e => console.error('Failed to queue user stats sync:', e));
    }

    // Sync tasks
    if (tasksSync) {
      tasksSync.update(state.tasks).catch(e => console.error('Failed to queue tasks sync:', e));
    }

    // Sync task history
    if (taskHistorySync) {
      taskHistorySync.update(undoStack).catch(e => console.error('Failed to queue task history sync:', e));
    }

    // Sync daily purpose
    if (dailyPurposeSync) {
      dailyPurposeSync.update(state.purpose).catch(e => console.error('Failed to queue daily purpose sync:', e));
    }

    // Sync daily snapshots (archive)
    if (dailySnapshotsSync) {
      dailySnapshotsSync.update(state.archive).catch(e => console.error('Failed to queue daily snapshots sync:', e));
    }

    // Sync prayers and zikr as part of daily snapshots
    if (dailySnapshotsSync) {
      dailySnapshotsSync.update({
        prayers: state.prayers,
        zikr: state.zikr,
        routines: state.routines
      }).catch(e => console.error('Failed to queue prayers/zikr sync:', e));
    }
  }

  function persistAllState() {
    saveState();
  }

  function saveToHistory() {
    const snapshot = JSON.stringify({
      totalSp: state.totalSp,
      tasks: state.tasks,
      prayers: state.prayers,
      zikr: state.zikr,
      purpose: state.purpose,
      routines: state.routines
    });
    undoStack.push(snapshot);
    redoStack = [];
  }

  // ==========================================
  // TOAST NOTIFICATION UTILITY
  // ==========================================
  function showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '90px';
      container.style.right = '24px';
      container.style.zIndex = '11000';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.background = 'var(--bg-surface, #1e1e24)';
    toast.style.color = 'var(--text-main, #ffffff)';
    toast.style.border = '1px solid var(--border-color, #33333d)';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(16px)';
    toast.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    toast.textContent = message;

    container.appendChild(toast);
    toast.offsetHeight; // Force Layout reflow

    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-12px)';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  // ==========================================
  // SUPABASE SYNC INTEGRATION
  // ==========================================
  let currentUserId = null;
  let profileSync = null;
  let userStatsSync = null;
  let tasksSync = null;
  let taskHistorySync = null;
  let dailyPurposeSync = null;
  let dailySnapshotsSync = null;
  let habitTemplatesSync = null;
  let userSettingsSync = null;

  async function initializeSync() {
    try {
      const client = initSupabaseClient();
      if (!client) {
        console.log('Supabase client not available, running in local-only mode');
        return;
      }

      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        console.log('No authenticated user, running in local-only mode');
        return;
      }

      currentUserId = user.id;

      // Initialize sync managers
      profileSync = new ProfileSync(currentUserId);
      userStatsSync = new UserStatsSync(currentUserId);
      tasksSync = new TasksSync(currentUserId);
      taskHistorySync = new TaskHistorySync(currentUserId);
      dailyPurposeSync = new DailyPurposeSync(currentUserId);
      dailySnapshotsSync = new DailySnapshotsSync(currentUserId);
      habitTemplatesSync = new HabitTemplatesSync(currentUserId);
      userSettingsSync = new UserSettingsSync(currentUserId);

      console.log('Supabase sync initialized for user:', currentUserId);

      window.addEventListener(
        'profileUpdated',
        (event) => {
          applyProfileSnapshot(event.detail);
        }
      );

      await loadProfile(profileSync);

      window.addEventListener('focus', () => {
        if (profileSync) {
          loadProfile(profileSync);
        }
      });

    } catch (error) {
      console.error('Failed to initialize sync:', error);
    }
  }

  function applyProfileSnapshot(profile) {
    if (!profile) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(profile, 'display_name')) {
      userProfile.username = profile.display_name || 'Adventurer';
    }

    if (Object.prototype.hasOwnProperty.call(profile, 'avatar_url')) {
      userProfile.avatar = profile.avatar_url || '';
    }

    updateProfileSection();
  }

  // ==========================================
  // USER PROFILE MANAGEMENT
  // ==========================================
  const initialProfileCache = readProfileCache();
  let userProfile = {
    username: initialProfileCache?.display_name || 'Adventurer',
    avatar: initialProfileCache?.avatar_url || ''
  };

  function initializeProfile() {
    const sidebarProfileBtn = document.getElementById('sidebarProfileBtn');
    if (sidebarProfileBtn) {
      sidebarProfileBtn.addEventListener('click', openProfileModal);
    }

    const closeProfileBtn = document.getElementById('btnCloseProfileModal');
    if (closeProfileBtn) {
      closeProfileBtn.addEventListener('click', closeProfileModal);
    }

    const saveProfileBtn = document.getElementById('btnSaveProfile');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', saveProfileChanges);
    }

    const avatarInput = document.getElementById('inpAvatar');
    if (avatarInput) {
      avatarInput.addEventListener('change', handleAvatarUpload);
    }
    
    updateProfileSection();
  }

  function openProfileModal() {
    const modal = document.getElementById('profileModal');
    const usernameInput = document.getElementById('inpUsername');
    const avatarPreview = document.getElementById('avatarPreview');
    const fallback = document.getElementById('avatarPreviewFallback');

    if (!modal) return;

    if (usernameInput) usernameInput.value = userProfile.username;
    
    if (avatarPreview && userProfile.avatar) {
      avatarPreview.src = userProfile.avatar;
      avatarPreview.style.display = 'block';
      if (fallback) fallback.style.display = 'none';
    } else {
      if (avatarPreview) avatarPreview.style.display = 'none';
      if (fallback) fallback.style.display = 'block';
    }

    modal.setAttribute('aria-hidden', 'false');
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.style.transform = 'translate(-50%, -50%) scale(1)';
    
    if (mainOverlay) {
      mainOverlay.style.display = 'block';
      mainOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    modal.setAttribute('aria-hidden', 'true');
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    modal.style.transform = 'translate(-50%, -50%) scale(0.96)';

    if (mainOverlay) {
      mainOverlay.style.display = 'none';
      mainOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('⚠️ Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        userProfile.tempAvatar = dataUrl; // Store temporarily until save

        // Update preview
        const avatarPreview = document.getElementById('avatarPreview');
        const fallback = document.getElementById('avatarPreviewFallback');
        if (avatarPreview) {
          avatarPreview.src = dataUrl;
          avatarPreview.style.display = 'block';
          if (fallback) fallback.style.display = 'none';
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function saveProfileChanges() {
    const usernameInput = document.getElementById('inpUsername');
    if (usernameInput) {
      const newUsername = usernameInput.value.trim();
      if (newUsername) {
        userProfile.username = newUsername;
      }
    }

    if (userProfile.tempAvatar) {
      userProfile.avatar = userProfile.tempAvatar;
      delete userProfile.tempAvatar;
    }

    if (!profileSync || !currentUserId) {
      showToast('Profile sync is not ready');
      return;
    }

    const profileData = {
      display_name: userProfile.username
    };

    if (userProfile.avatar) {
      profileData.avatar_url = userProfile.avatar;
    }

    const success = await profileSync.updateProfile(profileData);

    if (!success) {
      showToast('Profile sync failed');
      return;
    }

    closeProfileModal();
    showToast('👤 Profile updated successfully');
  }

  function updateProfileSection() {
    const username = document.getElementById('profileUsername');
    const level = document.getElementById('profileLevel');
    const rank = document.getElementById('profileRank');
    const avatar = document.getElementById('profileAvatar');

    if (username) username.textContent = userProfile.username;
    
    const currentLevel = Math.floor(state.totalSp / 100) + 1;
    const currentRank = getRankForSp(state.totalSp);

    if (level) level.textContent = `Level ${currentLevel}`;
    if (rank) rank.textContent = currentRank;

    if (avatar && userProfile.avatar) {
      avatar.src = userProfile.avatar;
      avatar.style.display = 'block';
      const fallback = avatar.nextElementSibling;
      if (fallback) fallback.style.display = 'none';
    } else if (avatar) {
      avatar.removeAttribute('src');
      avatar.style.display = 'none';
      const fallback = avatar.nextElementSibling;
      if (fallback) fallback.style.display = 'block';
    }
  }

  // ==========================================
  // METRICS & SCORE COMPUTATION ENGINE
  // ==========================================
  function calculateMetrics() {
    const date = state.viewingDate;
    const dayTasks = state.tasks[date] || [];
    const dayPrayers = state.prayers[date] || {};
    const dayZikr = state.zikr[date] || {};

    const totalTasks = dayTasks.length;
    const completedTasks = dayTasks.filter(t => t.completed).length;

    const prayerKeys = Object.keys(dayPrayers);
    const completedPrayers = prayerKeys.filter(k => dayPrayers[k].completed).length;

    const zikrKeys = Object.keys(dayZikr);
    const completedZikr = zikrKeys.filter(k => dayZikr[k].completed >= dayZikr[k].target && dayZikr[k].target > 0).length;

    const totalObligations = totalTasks + prayerKeys.length + zikrKeys.length;
    const completedObligations = completedTasks + completedPrayers + completedZikr;

    const disciplineScore = totalObligations > 0 ? Math.round((completedObligations / totalObligations) * 100) : 0;

    // Consistency Score Core calculation (Successful Days / Recorded History)
    const allDates = Object.keys(state.tasks);
    let successfulDays = 0;
    allDates.forEach(d => {
      const dT = state.tasks[d] || [];
      const dP = state.prayers[d] || {};
      const dZ = state.zikr[d] || {};

      const obs = dT.length + Object.keys(dP).length + Object.keys(dZ).length;
      const comps = dT.filter(t => t.completed).length + Object.keys(dP).filter(k => dP[k].completed).length + Object.keys(dZ).filter(k => dZ[k].completed >= dZ[k].target).length;
      if (obs > 0 && (comps / obs) >= 0.7) {
        successfulDays++;
      }
    });
    const consistencyScore = allDates.length > 0 ? Math.round((successfulDays / allDates.length) * 100) : 100;

    // Streak engine calculations - FIXED: Use current date instead of hardcoded date
    let streak = 0;
    let streakDate = new Date(state.currentDate + 'T00:00:00');
    while (true) {
      const dateStr = streakDate.toISOString().split('T')[0];
      if (!state.tasks[dateStr]) break;
      const dT = state.tasks[dateStr] || [];
      const dP = state.prayers[dateStr] || {};
      const dZ = state.zikr[dateStr] || {};

      const obs = dT.length + Object.keys(dP).length + Object.keys(dZ).length;
      const comps = dT.filter(t => t.completed).length + Object.keys(dP).filter(k => dP[k].completed).length + Object.keys(dZ).filter(k => dZ[k].completed >= dZ[k].target).length;

      if (obs > 0 && (comps / obs) >= 0.7) {
        streak++;
        streakDate.setDate(streakDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Today's Earned SP
    let daySpEarned = 0;
    dayTasks.forEach(t => { if (t.completed) daySpEarned += (parseInt(t.sp) || 0); });
    prayerKeys.forEach(k => { if (dayPrayers[k].completed) daySpEarned += 50; });
    zikrKeys.forEach(k => { if (dayZikr[k].completed >= dayZikr[k].target) daySpEarned += 25; });

    // Maximum Available SP for Day
    const daySpMax = dayTasks.reduce((sum, t) => sum + (parseInt(t.sp) || 0), 0) + (prayerKeys.length * 50) + (zikrKeys.length * 25);
    const totalProgressPct = daySpMax > 0 ? Math.round((daySpEarned / daySpMax) * 100) : 0;

    // Push calculations out to DOM interfaces
    safeSetText('analyticsValTotalSp', state.totalSp);
    safeSetText('analyticsValDiscipline', `${disciplineScore}%`);
    safeSetText('analyticsValConsistency', `${consistencyScore}%`);
    safeSetText('analyticsValStreak', streak);

    safeSetText('statTodaySp', daySpEarned);
    safeSetText('statCompletedTasks', `${completedTasks} / ${totalTasks}`);
    safeSetText('statCurrentStreak', streak);

    const progressBar = document.getElementById('statusProgressBar');
    if (progressBar) progressBar.setAttribute('aria-valuenow', totalProgressPct);
    const progressFill = document.getElementById('statusProgressFill');
    if (progressFill) progressFill.style.width = `${totalProgressPct}%`;
    safeSetText('statProgressPct', `${totalProgressPct}%`);
  }

  // ==========================================
  // ANALYTICS RENDERING
  // ==========================================
  let _chartJsLoaded = false;
  let _chartsInitialized = false;
  let chartSpProgress = null;
  let chartDailyCompletion = null;
  let chartCategoryPerformance = null;
  let chartPrayerAnalytics = null;
  let chartQuestAnalytics = null;

  function loadChartJs(callback) {
    if (window.Chart) {
      _chartJsLoaded = true;
      return callback && callback();
    }
    if (_chartJsLoaded) return callback && callback();
    const src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => { _chartJsLoaded = true; callback && callback(); };
    s.onerror = () => { console.error('Failed to load Chart.js'); };
    document.head.appendChild(s);
  }

  function initAnalyticsCharts() {
    if (_chartsInitialized) return;
    loadChartJs(() => {
      try {
        const ctxSp = document.getElementById('chart-sp-progress');
        const ctxDaily = document.getElementById('chart-daily-completion');
        const ctxCat = document.getElementById('chart-category-performance');
        const ctxPrayer = document.getElementById('chart-prayer-analytics');
        const ctxQuest = document.getElementById('chart-quest-analytics');

        const commonOptions = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: 'var(--text-primary)' } } },
          scales: { x: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(255,255,255,0.03)' } }, y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(255,255,255,0.03)' } } }
        };

        if (ctxSp) {
          chartSpProgress = new Chart(ctxSp.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'SP', data: [], borderColor: '#60A5FA', backgroundColor: 'rgba(96,165,250,0.08)', tension: 0.3, pointRadius: 2, fill: true }] },
            options: Object.assign({}, commonOptions, { plugins: { legend: { display:false } } })
          });
        }

        if (ctxDaily) {
          chartDailyCompletion = new Chart(ctxDaily.getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label: '%', data: [], backgroundColor: '#34D399' }] },
            options: Object.assign({}, commonOptions, { scales: { y: { max: 100 } }, plugins: { legend: { display:false } } })
          });
        }

        if (ctxCat) {
          chartCategoryPerformance = new Chart(ctxCat.getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label: '%', data: [], backgroundColor: '#F59E0B' }] },
            options: Object.assign({}, commonOptions, { indexAxis: 'y', plugins: { legend: { display:false } }, scales: { x: { max: 100 } } })
          });
        }

        if (ctxPrayer) {
          chartPrayerAnalytics = new Chart(ctxPrayer.getContext('2d'), {
            type: 'bar',
            data: { labels: ['Bomdod','Peshin','Asr','Shom','Xufton'], datasets: [{ label: 'Completion %', data: [0,0,0,0,0], backgroundColor: ['#60A5FA','#60A5FA','#60A5FA','#60A5FA','#60A5FA'] }] },
            options: Object.assign({}, commonOptions, { indexAxis: 'y', plugins: { legend: { display:false } }, scales: { x: { max: 100 } } })
          });
        }

        if (ctxQuest) {
          chartQuestAnalytics = new Chart(ctxQuest.getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Completion %', data: [], backgroundColor: '#A78BFA' }] },
            options: Object.assign({}, commonOptions, { plugins: { legend: { display:false } }, scales: { x: { max: 100 } } })
          });
        }

        _chartsInitialized = true;
        // After charts are created, populate them with current archive data
        setTimeout(() => { try { updateAnalyticsCharts(); } catch (e) { /* ignore */ } }, 50);
      } catch (e) {
        console.error('Chart init error', e);
      }
    });
  }
  function renderAnalytics() {
    // Build date map from archive and tasks
    const entriesByDate = {};
    // Use archive entries first
    (state.archive || []).forEach(e => {
      entriesByDate[e.date] = {
        date: e.date,
        earnedSp: Number(e.earnedSp) || 0,
        completedTasks: Array.isArray(e.completedTasks) ? e.completedTasks.length : (e.completedTasks || 0),
        totalTasks: Array.isArray(e.tasks) ? e.tasks.length : (e.tasks || []).length,
        obligationsCompleted: 0,
        obligationsTotal: 0
      };
    });

    // Include dates present in state.tasks (may include current day)
    Object.keys(state.tasks || {}).forEach(date => {
      const dayTasks = state.tasks[date] || [];
      const dayPrayers = state.prayers[date] || {};
      const dayZikr = state.zikr[date] || {};

      const completedTasks = dayTasks.filter(t => t.completed).length;
      const earnedSp = dayTasks.filter(t => t.completed).reduce((s, t) => s + Number(t.sp || 0), 0) + (Object.keys(dayPrayers).filter(k => dayPrayers[k].completed).length * 50) + (Object.keys(dayZikr).filter(k => dayZikr[k].completed >= (dayZikr[k].target || 0)).length * 25);

      entriesByDate[date] = entriesByDate[date] || {};
      entriesByDate[date].date = date;
      entriesByDate[date].earnedSp = Number(entriesByDate[date].earnedSp || 0) + earnedSp;
      entriesByDate[date].completedTasks = Number(entriesByDate[date].completedTasks || 0) + completedTasks;
      entriesByDate[date].totalTasks = Number(entriesByDate[date].totalTasks || 0) || dayTasks.length;

      // obligations
      const totalOblig = dayTasks.length + Object.keys(dayPrayers).length + Object.keys(dayZikr).length;
      const completedOblig = completedTasks + Object.keys(dayPrayers).filter(k => dayPrayers[k].completed).length + Object.keys(dayZikr).filter(k => dayZikr[k].completed >= (dayZikr[k].target || 0)).length;
      entriesByDate[date].obligationsCompleted = completedOblig;
      entriesByDate[date].obligationsTotal = totalOblig;
    });

    // Convert to array sorted newest first
    const allDates = Object.keys(entriesByDate).sort((a,b) => b.localeCompare(a));

    // Overview: total SP, level, rank
    const totalSp = Number(state.totalSp) || 0;
    const level = Math.floor(totalSp / 100) + 1;
    const rank = getRankForSp(totalSp);
    safeSetText('analyticsValTotalSp', totalSp);
    safeSetText('analyticsValLevel', `Level ${level}`);
    safeSetText('analyticsValRank', rank);
    safeSetText('rankProgressRank', rank);
    safeSetText('rankProgressLevel', level);

    // Current/Best streak
    const streakInfo = computeStreaks();
    safeSetText('analyticsValStreak', streakInfo.current || 0);
    safeSetText('analyticsValBestStreak', streakInfo.best || 0);

    // Completed tasks lifetime
    let lifetimeCompletedTasks = 0;
    let lifetimeTotalTasks = 0;
    let lifetimeSpEarned = 0;
    Object.values(entriesByDate).forEach(e => {
      lifetimeCompletedTasks += Number(e.completedTasks || 0);
      lifetimeTotalTasks += Number(e.totalTasks || 0);
      lifetimeSpEarned += Number(e.earnedSp || 0);
    });
    safeSetText('analyticsValCompletedTasks', lifetimeCompletedTasks);

    // Productivity: today/week/month/avg/completion rate
    const today = state.currentDate;
    const todayEntry = entriesByDate[today] || { earnedSp: 0, completedTasks: 0, totalTasks: 0 };
    safeSetText('prodTodaySp', todayEntry.earnedSp || 0);

    // compute last 7 days and this month
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diffToMonday = ((day + 6) % 7); // 0..6 where 0=Monday
    startOfWeek.setDate(now.getDate() - diffToMonday);
    startOfWeek.setHours(0,0,0,0);

    let weekSp = 0;
    let monthSp = 0;
    Object.keys(entriesByDate).forEach(d => {
      const dt = new Date(d + 'T00:00:00');
      const e = entriesByDate[d];
      if (dt >= startOfWeek) weekSp += Number(e.earnedSp || 0);
      if (dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()) monthSp += Number(e.earnedSp || 0);
    });
    safeSetText('prodWeekSp', weekSp);
    safeSetText('prodMonthSp', monthSp);

    const avgDailySp = (state.archive && state.archive.length > 0) ? Math.round((state.archive.reduce((s,a) => s + (Number(a.earnedSp)||0),0) / state.archive.length)) : 0;
    safeSetText('prodAvgDailySp', avgDailySp);

    const completionRatePct = lifetimeTotalTasks > 0 ? Math.round((lifetimeCompletedTasks / lifetimeTotalTasks) * 100) : 0;
    safeSetText('prodCompletionRate', `${completionRatePct}%`);

    // Discipline: total obligations
    let totalObligations = 0;
    let completedObligations = 0;
    Object.values(entriesByDate).forEach(e => {
      totalObligations += Number(e.obligationsTotal || 0);
      completedObligations += Number(e.obligationsCompleted || 0);
    });
    const disciplinePct = totalObligations > 0 ? Math.round((completedObligations / totalObligations) * 100) : 0;
    safeSetText('analyticsValDiscipline', `${disciplinePct}%`);
    safeSetText('disciplineCompleted', completedObligations);
    safeSetText('disciplineTotal', totalObligations);

    // Consistency over last 30 days (successful days >=80%)
    const last30 = [];
    for (let i=0;i<30;i++) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      last30.push(d.toISOString().split('T')[0]);
    }
    let successful = 0;
    last30.forEach(d => {
      const e = entriesByDate[d];
      if (!e) return;
      const obligTotal = Number(e.obligationsTotal || 0);
      const obligCompleted = Number(e.obligationsCompleted || 0);
      if (obligTotal > 0 && (obligCompleted / obligTotal) >= 0.8) successful++;
    });
    const consistencyPct = Math.round((successful / 30) * 100);
    safeSetText('analyticsValConsistency', `${consistencyPct}%`);
    safeSetText('consistencySuccessful', successful);
    safeSetText('consistencyWindow', 30);

    // Category analytics
    const categories = {};
    Object.keys(entriesByDate).forEach(d => {
      const rawTasks = (state.tasks[d] || [])
        .concat((state.archive.find(a => a.date === d) ? (state.archive.find(a => a.date === d).tasks || []) : []));
      rawTasks.forEach(t => {
        const cat = (t.category || 'Uncategorized');
        categories[cat] = categories[cat] || { completed: 0, total: 0, sp: 0 };
        categories[cat].total += 1;
        if (t.completed) {
          categories[cat].completed += 1;
          categories[cat].sp += Number(t.sp || 0);
        }
      });
    });
    const catBody = document.getElementById('category-analytics-body');
    if (catBody) {
      catBody.innerHTML = '';
      Object.keys(categories).sort().forEach(cat => {
        const c = categories[cat];
        const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding:8px;">${cat}</td><td style="padding:8px;text-align:right;">${c.completed}</td><td style="padding:8px;text-align:right;">${c.total}</td><td style="padding:8px;text-align:right;">${pct}%</td><td style="padding:8px;text-align:right;">${c.sp}</td>`;
        catBody.appendChild(tr);
      });
      if (Object.keys(categories).length === 0) {
        catBody.innerHTML = '<tr><td colspan="5" style="padding:12px;color:var(--text-muted)">No category data yet.</td></tr>';
      }
    }

    // Rank progress
    const nextLevelSp = level * 100;
    const currentTowardsNext = totalSp - ((level - 1) * 100);
    const pct = Math.max(0, Math.min(100, Math.round((currentTowardsNext / 100) * 100)));
    const rankFill = document.getElementById('rankProgressBarFill');
    if (rankFill) rankFill.style.width = `${pct}%`;
    safeSetText('rankProgressCurrentSp', totalSp);
    safeSetText('rankProgressNextSp', nextLevelSp);

    // Daily history latest 30
    const historyBody = document.getElementById('daily-history-body');
    if (historyBody) {
      const rows = allDates.slice(0,30);
      if (rows.length === 0) {
        document.getElementById('daily-history-empty').style.display = 'block';
        historyBody.innerHTML = '';
      } else {
        document.getElementById('daily-history-empty').style.display = 'none';
        historyBody.innerHTML = '';
        rows.forEach(d => {
          const e = entriesByDate[d];
          const completed = Number(e.completedTasks || 0);
          const total = Number(e.totalTasks || 0);
          const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `<td style="padding:8px;">${d}</td><td style="padding:8px;text-align:right;">${e.earnedSp || 0}</td><td style="padding:8px;text-align:right;">${completed}</td><td style="padding:8px;text-align:right;">${rate}%</td>`;
          historyBody.appendChild(tr);
        });
      }
    }

    // Initialize charts and update them
    initAnalyticsCharts();
    updateAnalyticsCharts();

    // Render Rank progression list (left panel)
    try {
      const rankListEl = document.getElementById('rank-list') || document.getElementById('rank-progression-list');
      if (rankListEl) {
        rankListEl.innerHTML = '';
        const totalSp = Number(state.totalSp) || 0;
        const currentRank = getRankForSp(totalSp);
        const currentLevel = Math.floor(totalSp / 100) + 1;
        const ranks = RANKS.slice().reverse(); // ascending
        ranks.forEach(r => {
          const li = document.createElement('div');
          const unlocked = currentLevel >= r.min;
          const marker = unlocked ? '✓' : (r.name === currentRank ? '●' : '○');
          li.style.display = 'flex';
          li.style.justifyContent = 'space-between';
          li.style.padding = '6px 0';
          li.style.color = unlocked ? 'var(--text-main)' : 'var(--text-muted)';
          li.innerHTML = `<span>${marker} ${r.name}</span><span style="font-size:12px;color:var(--text-muted);">Lvl ${r.min}+</span>`;
          rankListEl.appendChild(li);
        });
        // left panel small labels
        const leftCur = document.getElementById('leftCurrentRank'); if (leftCur) leftCur.textContent = currentRank;
        const leftFill = document.getElementById('leftRankProgressFill'); if (leftFill) leftFill.style.width = `${Math.min(100, (totalSp % 100))}%`;
      }
    } catch (e) { console.error(e); }

    // Compute System Evaluation score and set grade
    try {
      const discipline = parseInt((document.getElementById('analyticsValDiscipline')||{textContent:'0%'}).textContent.replace('%','')) || 0;
      const consistency = parseInt((document.getElementById('analyticsValConsistency')||{textContent:'0%'}).textContent.replace('%','')) || 0;
      const streak = parseInt((document.getElementById('analyticsValStreak')||{textContent:'0'}).textContent) || 0;
      // Streak score: normalize to 0-100 by capping at 30 days
      const streakScore = Math.min(100, Math.round((streak / 30) * 100));
      const evalScore = Math.round((discipline * 0.4) + (consistency * 0.4) + (streakScore * 0.2));
      const gradeEl = document.getElementById('evalGrade');
      const scoreEl = document.getElementById('evalScore');
      const descEl = document.getElementById('evalDesc');
      if (scoreEl) scoreEl.textContent = `${evalScore} / 100`;
      // Grade mapping
      let grade = 'F';
      let desc = 'Needs improvement';
      if (evalScore >= 95) { grade = 'SSS'; desc = 'Legendary'; }
      else if (evalScore >= 90) { grade = 'SS'; desc = 'Outstanding'; }
      else if (evalScore >= 85) { grade = 'S'; desc = 'Excellent'; }
      else if (evalScore >= 80) { grade = 'A+'; desc = 'Very Good'; }
      else if (evalScore >= 75) { grade = 'A'; desc = 'Good'; }
      else if (evalScore >= 70) { grade = 'B+'; desc = 'Above Average'; }
      else if (evalScore >= 60) { grade = 'B'; desc = 'Average'; }
      else if (evalScore >= 50) { grade = 'C'; desc = 'Below Average'; }
      else if (evalScore >= 40) { grade = 'D'; desc = 'Poor'; }
      if (gradeEl) gradeEl.textContent = grade;
      if (descEl) descEl.textContent = desc;
    } catch (e) { console.error(e); }
  }

  function showChartEmptyStates(isEmpty) {
    const ids = ['chart-sp-empty','chart-daily-empty','chart-cat-empty','chart-prayer-empty','chart-quest-empty'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isEmpty ? 'flex' : 'none';
    });
  }

  function updateAnalyticsCharts() {
    const hasArchive = Array.isArray(state.archive) && state.archive.length > 0;
    showChartEmptyStates(!hasArchive);
    if (!hasArchive) return;
    // use last 30 archive entries (newest first)
    const entries = state.archive.slice(0).sort((a,b) => b.date.localeCompare(a.date)).slice(0,30).reverse();
    const labels = entries.map(e => e.date);
    const spData = entries.map(e => Number(e.earnedSp || 0));
    const completionData = entries.map(e => {
      const total = Array.isArray(e.tasks) ? e.tasks.length : (e.totalTasks || 0);
      const completed = Array.isArray(e.completedTasks) ? e.completedTasks.length : (e.completedTasks || 0);
      return total > 0 ? Math.round((completed / total) * 100) : 0;
    });

    if (chartSpProgress) {
      chartSpProgress.data.labels = labels;
      chartSpProgress.data.datasets[0].data = spData;
      chartSpProgress.update();
    }
    if (chartDailyCompletion) {
      chartDailyCompletion.data.labels = labels;
      chartDailyCompletion.data.datasets[0].data = completionData;
      chartDailyCompletion.update();
    }

    // Category performance across archive
    const categories = {};
    state.archive.forEach(e => {
      const tasks = Array.isArray(e.tasks) ? e.tasks : [];
      tasks.forEach(t => {
        const cat = t.category || 'Uncategorized';
        categories[cat] = categories[cat] || { total:0, completed:0 };
        categories[cat].total += 1;
        if (t.completed) categories[cat].completed += 1;
      });
    });
    const catLabels = Object.keys(categories);
    const catValues = catLabels.map(k => categories[k].total > 0 ? Math.round((categories[k].completed / categories[k].total) * 100) : 0);
    if (chartCategoryPerformance) {
      chartCategoryPerformance.data.labels = catLabels;
      chartCategoryPerformance.data.datasets[0].data = catValues;
      chartCategoryPerformance.update();
    }

    // Prayer analytics: count completion per prayer across archived dates
    const prayers = ['bomdod','peshin','asr','shom','xufton'];
    const prayerCounts = prayers.map(p => 0);
    const prayerTotals = prayers.map(p => 0);
    state.archive.forEach(e => {
      const dayPrayers = (e.prayers && typeof e.prayers === 'object') ? e.prayers : {};
      prayers.forEach((p, idx) => {
        if (dayPrayers && typeof dayPrayers[p] !== 'undefined') {
          prayerTotals[idx] += 1;
          if (dayPrayers[p].completed) prayerCounts[idx] += 1;
        }
      });
    });
    const prayerPct = prayerCounts.map((c, i) => prayerTotals[i] > 0 ? Math.round((c / prayerTotals[i]) * 100) : 0);
    if (chartPrayerAnalytics) {
      chartPrayerAnalytics.data.datasets[0].data = prayerPct;
      chartPrayerAnalytics.update();
    }

    // Quest (zikr) analytics: collect all custom quests across archive
    const questMap = {};
    state.archive.forEach(e => {
      const dayZikr = (e.zikr && typeof e.zikr === 'object') ? e.zikr : {};
      Object.keys(dayZikr || {}).forEach(k => {
        questMap[k] = questMap[k] || { total: 0, completed: 0, name: dayZikr[k].name || k };
        questMap[k].total += 1;
        if ((dayZikr[k].completed || 0) >= (dayZikr[k].target || 0) && (dayZikr[k].target || 0) > 0) questMap[k].completed += 1;
      });
    });
    const questLabels = Object.keys(questMap);
    const questValues = questLabels.map(k => questMap[k].total > 0 ? Math.round((questMap[k].completed / questMap[k].total) * 100) : 0);
    if (chartQuestAnalytics) {
      chartQuestAnalytics.data.labels = questLabels.map(k => questMap[k].name || k);
      chartQuestAnalytics.data.datasets[0].data = questValues;
      chartQuestAnalytics.update();
    }
  }

  function computeStreaks() {
    // compute current streak and best streak from available dates
    const dates = Object.keys(state.tasks || {}).sort();
    if (dates.length === 0) return { current: 0, best: 0 };
    // build boolean map of successful day (>=80% obligations completion)
    const successMap = {};
    dates.forEach(d => {
      const m = calculateMetricsForDate(d);
      const totalOb = m.totalTasks + (Object.keys(state.prayers[d] || {}).length) + (Object.keys(state.zikr[d] || {}).length);
      const completedOb = m.completedTasks + (Object.keys(state.prayers[d] || {}).filter(k => (state.prayers[d]||{})[k].completed).length) + (Object.keys(state.zikr[d] || {}).filter(k => (state.zikr[d]||{})[k].completed >= (state.zikr[d]||{})[k].target).length);
      successMap[d] = totalOb > 0 && (completedOb / totalOb) >= 0.8;
    });
    // compute current streak starting from latest date present (prefer currentDate)
    let current = 0;
    let cursor = state.currentDate;
    while (successMap[cursor]) {
      current++;
      const dt = new Date(cursor + 'T00:00:00');
      dt.setDate(dt.getDate() - 1);
      cursor = dt.toISOString().split('T')[0];
    }
    // compute best streak
    let best = 0;
    let running = 0;
    Object.keys(successMap).sort().forEach(d => {
      if (successMap[d]) {
        running++; if (running > best) best = running;
      } else {
        running = 0;
      }
    });
    return { current, best };
  }

  function getRankForSp(sp) {
    const level = Math.floor(sp / 100) + 1;
    for (const r of RANKS) {
      if (level >= r.min) {
        return r.name;
      }
    }
    return 'Novice';
  }

  function updateLevelsAndRanks() {
    const level = Math.floor(state.totalSp / 100) + 1;
    const rankName = getRankForSp(state.totalSp);

    const currentLevelLabel = document.getElementById('profileLevel');
    const oldLevel = currentLevelLabel ? (parseInt(currentLevelLabel.textContent.replace('Level ', '')) || 1) : 1;
    const currentRankLabel = document.getElementById('profileRank');
    const oldRank = currentRankLabel ? currentRankLabel.textContent : 'Novice';

    safeSetText('profileLevel', `Level ${level}`);
    safeSetText('profileRank', rankName);
    safeSetText('statCurrentRank', rankName);

    if (!suppressToastsOnInitialRender) {
      if (level > oldLevel) {
        showToast(`🎉 Level Up! You reached Level ${level}!`);
      }
      if (rankName !== oldRank) {
        showToast(`🛡️ Rank Up! Rank Status: ${rankName}`);
      }
    }
  }

  function createArchiveEntryForDate(date) {
    const dayTasks = deepClone(state.tasks[date] || []);
    const dayPrayers = deepClone(state.prayers[date] || {});
    const dayZikr = deepClone(state.zikr[date] || {});
    
    const completedTasks = dayTasks.filter(t => t.completed).map(t => ({ id: t.id, name: t.name, category: t.category, sp: t.sp, type: t.type }));
    
    // Calculate earned SP: tasks + prayers + quests
    let earnedSp = dayTasks.filter(t => t.completed).reduce((sum, t) => sum + Number(t.sp), 0);
    earnedSp += Object.keys(dayPrayers).filter(k => dayPrayers[k].completed).length * 50;
    earnedSp += Object.keys(dayZikr).filter(k => dayZikr[k].completed >= dayZikr[k].target && dayZikr[k].target > 0).length * 25;
    
    const discipline = calculateMetricsForDate(date).disciplineScore;
    const consistency = calculateConsistencyForDate(date);

    return {
      date,
      tasks: dayTasks,
      prayers: dayPrayers,
      zikr: dayZikr,
      completedTasks,
      earnedSp,
      dailyPurpose: state.purpose[date] || '',
      disciplineScore: discipline,
      consistencyScore: consistency,
      readOnly: true
    };
  }

  function calculateMetricsForDate(date) {
    const dayTasks = state.tasks[date] || [];
    const dayPrayers = state.prayers[date] || {};
    const dayZikr = state.zikr[date] || {};

    const totalTasks = dayTasks.length;
    const completedTasks = dayTasks.filter(t => t.completed).length;
    const prayerKeys = Object.keys(dayPrayers);
    const completedPrayers = prayerKeys.filter(k => dayPrayers[k].completed).length;
    const zikrKeys = Object.keys(dayZikr);
    const completedZikr = zikrKeys.filter(k => dayZikr[k].completed >= dayZikr[k].target && dayZikr[k].target > 0).length;

    const totalObligations = totalTasks + prayerKeys.length + zikrKeys.length;
    const completedObligations = completedTasks + completedPrayers + completedZikr;
    const disciplineScore = totalObligations > 0 ? Math.round((completedObligations / totalObligations) * 100) : 0;

    return { disciplineScore, completedTasks, totalTasks, completedPrayers, completedZikr };
  }

  function calculateConsistencyForDate(date) {
    const allDates = Object.keys(state.tasks);
    let successfulDays = 0;
    allDates.forEach(d => {
      const result = calculateMetricsForDate(d);
      const totalObligations = result.totalTasks + Object.keys(state.prayers[d] || {}).length + Object.keys(state.zikr[d] || {}).length;
      const completedObligations = result.completedTasks + (Object.keys(state.prayers[d] || {}).filter(k => (state.prayers[d] || {})[k].completed).length) + (Object.keys(state.zikr[d] || {}).filter(k => (state.zikr[d] || {})[k].completed >= (state.zikr[d] || {})[k].target && (state.zikr[d] || {})[k].target > 0).length);
      if (totalObligations > 0 && (completedObligations / totalObligations) >= 0.7) {
        successfulDays++;
      }
    });
    return allDates.length > 0 ? Math.round((successfulDays / allDates.length) * 100) : 100;
  }

  function buildArchiveHistory() {
    const existingDates = new Set(state.archive.map(entry => entry.date));
    Object.keys(state.tasks).forEach(date => {
      if (date !== state.currentDate && !existingDates.has(date)) {
        state.archive.push(createArchiveEntryForDate(date));
      }
    });
  }

  function archiveCurrentDay() {
    const currentDate = state.currentDate;
    const existingIndex = state.archive.findIndex(entry => entry.date === currentDate);
    const snapshot = createArchiveEntryForDate(currentDate);
    if (existingIndex !== -1) {
      state.archive[existingIndex] = snapshot;
    } else {
      state.archive.unshift(snapshot);
    }
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(state.archive));
    renderArchiveList();
    showToast('📦 Archive Created');
  }

  function renderArchiveList() {
    const archiveList = document.getElementById('archive-list');
    if (!archiveList) return;
    archiveList.innerHTML = '';

    state.archive.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'archive-item';
      const button = document.createElement('button');
      button.className = 'archive-btn';
      button.type = 'button';
      button.setAttribute('data-date', entry.date);
      button.setAttribute('aria-label', `View archive for ${entry.date}`);
      button.textContent = entry.date;
      li.appendChild(button);
      archiveList.appendChild(li);
    });
  }

  function performDailyResetIfNeeded() {
    const storedDate = localStorage.getItem(STORAGE_KEYS.lastResetDate);
    const today = getTashkentDateString();
    if (storedDate === today) return;

    if (storedDate && storedDate !== today) {
      if (state.tasks[storedDate]) {
        archiveCurrentDay();
      }
    }

    state.currentDate = today;
    state.viewingDate = today;
    state.purpose[today] = state.purpose[today] || '';
    state.routines[today] = state.routines[today] || '';
    state.tasks[today] = state.tasks[today] || deepClone(INITIAL_TASKS);
    state.prayers[today] = state.prayers[today] || deepClone(DEFAULT_PRAYERS);
    state.zikr[today] = state.zikr[today] || deepClone(DEFAULT_ZIKR);

    resetDailyProgress(today);
    localStorage.setItem(STORAGE_KEYS.lastResetDate, today);
    saveState();
  }

  function resetDailyProgress(date) {
    if (!state.tasks[date]) state.tasks[date] = deepClone(INITIAL_TASKS);
    state.tasks[date].forEach(task => task.completed = false);
    if (!state.prayers[date]) state.prayers[date] = deepClone(DEFAULT_PRAYERS);
    Object.keys(state.prayers[date]).forEach(key => {
      state.prayers[date][key].completed = false;
      state.prayers[date][key].time = DEFAULT_PRAYERS[key].time || '—';
      state.prayers[date][key].notes = state.prayers[date][key].notes || '';
    });
    if (!state.zikr[date]) state.zikr[date] = deepClone(DEFAULT_ZIKR);
    Object.keys(state.zikr[date]).forEach(key => {
      state.zikr[date][key].completed = 0;
    });
  }

  function recordDailyScores(date) {
    state.disciplineScores[date] = calculateMetricsForDate(date).disciplineScore;
    state.consistencyScores[date] = calculateConsistencyForDate(date);
    saveState();
  }

  // ==========================================
  // RENDERING PIPELINES
  // ==========================================
  function renderWorkbook() {
    const date = state.viewingDate;
    const isReadOnly = date !== state.currentDate;

    const dateObj = new Date(date + "T00:00:00");
    safeSetText('workbookDate', dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    safeSetText('workbookWeekday', dateObj.toLocaleDateString('en-US', { weekday: 'long' }));

    const purposeInput = document.getElementById('workbookPurpose');
    if (purposeInput) {
      purposeInput.value = state.purpose[date] || "";
      purposeInput.disabled = isReadOnly;
    }

    const categories = ["GYM", "Trading", "Education", "Deep Work", "Health", "Finance", "Islam"];
    categories.forEach(cat => {
      const cleanCatId = cat.toLowerCase().replace(/\s+/g, '-');
      const listEl = document.getElementById(`task-list-${cleanCatId}`);
      const countEl = document.getElementById(`task-count-${cleanCatId}`);
      if (!listEl) return;

      listEl.innerHTML = "";
      const catTasks = (state.tasks[date] || []).filter(t => t.category.toLowerCase() === cat.toLowerCase());
      
      const totalCount = catTasks.length;
      const completedCount = catTasks.filter(t => t.completed).length;
      const totalSp = catTasks.reduce((s, t) => s + Number(t.sp), 0);
      const earnedSp = catTasks.filter(t => t.completed).reduce((s, t) => s + Number(t.sp), 0);

      if (countEl) {
        countEl.textContent = `${completedCount}/${totalCount} | ${earnedSp}/${totalSp} SP`;
      }

      catTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'task-item--completed' : ''}`;
        li.id = task.id;
        li.setAttribute('data-task-id', task.id);
        li.setAttribute('data-category', task.category);

        li.innerHTML = `
          <div class="task-check-area">
            <input type="checkbox" class="task-checkbox" id="chk-${task.id}" ${task.completed ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
            <label for="chk-${task.id}" class="task-check-label" aria-hidden="true"></label>
          </div>
          <div class="task-body">
            <span class="task-name" id="name-${task.id}" style="${task.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${task.name}</span>
            <span class="task-description">${task.desc || ''}</span>
          </div>
          <div class="task-badges">
            <span class="task-type-badge task-type-badge--${task.type || 'task'}" data-type="${task.type || 'task'}">${task.type ? task.type.charAt(0).toUpperCase() + task.type.slice(1) : 'Task'}</span>
            <span class="task-sp-badge" data-sp="${task.sp}">${task.sp} SP</span>
          </div>
          <div class="task-actions" style="${isReadOnly ? 'display: none !important;' : ''}">
            <button class="task-menu-btn" aria-label="Open task menu" aria-haspopup="true" aria-expanded="false" data-task-id="${task.id}">
              <span class="icon-three-dot" aria-hidden="true"></span>
            </button>
            <ul class="task-dropdown-menu" id="task-menu-${task.id}" role="menu" data-task-id="${task.id}" style="display: none; right: 0; background: #1a1a1f; border: 1px solid #2d2d37; list-style: none; padding: 4px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
              <li role="none"><button class="task-dropdown-item" role="menuitem" data-action="edit" data-task-id="${task.id}" style="background: none; border: none; color: #fff; padding: 6px 12px; text-align: left; width: 100%; cursor: pointer; font-size:13px;">Edit Task</button></li>
              <li role="none"><button class="task-dropdown-item task-dropdown-item--duplicate" role="menuitem" data-action="duplicate" data-task-id="${task.id}" style="background: none; border: none; color: #fff; padding: 6px 12px; text-align: left; width: 100%; cursor: pointer; font-size:13px;">Duplicate</button></li>
              <li role="none"><button class="task-dropdown-item task-dropdown-item--delete" role="menuitem" data-action="delete" data-task-id="${task.id}" style="background: none; border: none; color: #ff5252; padding: 6px 12px; text-align: left; width: 100%; cursor: pointer; font-size:13px;">Delete</button></li>
            </ul>
          </div>
        `;
        listEl.appendChild(li);
      });
    });
  }

  function renderRoutine() {
    const date = state.viewingDate;
    const isReadOnly = date !== state.currentDate;
    const editor = document.getElementById('routine-editor');
    if (editor) {
      editor.innerHTML = state.routines[date] || "";
      editor.setAttribute('contenteditable', isReadOnly ? 'false' : 'true');
    }
  }

  function renderQuests() {
    const date = state.viewingDate;
    const isReadOnly = date !== state.currentDate;
    const dayPrayers = state.prayers[date] || JSON.parse(JSON.stringify(DEFAULT_PRAYERS));
    const dayZikr = state.zikr[date] || JSON.parse(JSON.stringify(DEFAULT_ZIKR));

    // Render Prayer interface rows
    let prayerEarned = 0;
    Object.keys(dayPrayers).forEach(p => {
      const entry = dayPrayers[p];
      const chk = document.getElementById(`chk-${p}`);
      const timeEl = document.getElementById(`time-${p}`);
      const notesEl = document.getElementById(`notes-${p}`);

      if (chk) {
        chk.checked = entry.completed;
        chk.disabled = isReadOnly;
      }
      if (timeEl) {
        timeEl.textContent = entry.completed ? (entry.time || "Done") : "—";
      }
      if (notesEl) {
        notesEl.value = entry.notes || "";
        notesEl.disabled = isReadOnly;
      }
      if (entry.completed) prayerEarned += 50;
    });
    safeSetText('prayers-sp-total', `${prayerEarned} / 250 SP`);

    // Render Zikr interface rows
    const zikrTableBody = document.getElementById('zikr-table-body');
    if (!zikrTableBody) return;

    zikrTableBody.innerHTML = '';
    let zikrEarned = 0;

    Object.keys(dayZikr).forEach(z => {
      const item = dayZikr[z];
      const rowId = `zikr-row-${sanitizeDOMId(z)}`;
      const targetId = `target-${sanitizeDOMId(z)}`;
      const completedId = `completed-${sanitizeDOMId(z)}`;
      const statusId = `status-${sanitizeDOMId(z)}`;
      const spId = `sp-${sanitizeDOMId(z)}`;

      const reached = item.completed >= item.target && item.target > 0;
      const reward = reached ? item.sp : 0;
      zikrEarned += reward;

      const row = document.createElement('tr');
      row.className = 'quest-row zikr-row';
      row.id = rowId;
      row.dataset.zikr = z;

      row.innerHTML = `
        <td class="quest-td quest-td--zikr-name" data-label="Quest">
          <span class="zikr-name">${item.name || formatZikrLabel(z)}</span>
        </td>
        <td class="quest-td quest-td--target" data-label="Target">
          <input
            type="number"
            class="zikr-target-input"
            id="${targetId}"
            min="0"
            value="${item.target}"
            ${isReadOnly ? 'disabled' : ''}
            aria-label="${item.name || formatZikrLabel(z)} target count"
          >
        </td>
        <td class="quest-td quest-td--completed" data-label="Completed">
          <input
            type="number"
            class="zikr-completed-input"
            id="${completedId}"
            min="0"
            value="${item.completed}"
            ${isReadOnly ? 'disabled' : ''}
            aria-label="${item.name || formatZikrLabel(z)} completed count"
          >
        </td>
        <td class="quest-td quest-td--status" data-label="Status">
          <span class="zikr-status-badge" id="${statusId}" data-status="${reached ? 'completed' : 'pending'}">${reached ? 'Completed' : 'Pending'}</span>
        </td>
        <td class="quest-td quest-td--sp" data-label="SP">
          <span class="zikr-sp-value" id="${spId}">${reward} SP</span>
        </td>
        <td class="quest-td quest-td--actions" data-label="Actions">
          <div class="task-actions" style="${isReadOnly ? 'display: none !important;' : ''}">
            <button class="task-menu-btn" aria-label="Open quest menu" aria-haspopup="true" aria-expanded="false" data-task-id="${sanitizeDOMId(z)}">
              <span class="icon-three-dot" aria-hidden="true"></span>
            </button>
            <ul class="task-dropdown-menu" id="task-menu-${sanitizeDOMId(z)}" role="menu" data-zikr="${z}" style="display: none; right: 0; background: #1a1a1f; border: 1px solid #2d2d37; list-style: none; padding: 4px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
              <li role="none"><button class="task-dropdown-item" role="menuitem" data-action="edit-zikr" data-zikr="${z}" style="background: none; border: none; color: #fff; padding: 6px 12px; text-align: left; width: 100%; cursor: pointer; font-size:13px;">Edit Quest</button></li>
              <li role="none"><button class="task-dropdown-item task-dropdown-item--delete" role="menuitem" data-action="delete-zikr" data-zikr="${z}" style="background: none; border: none; color: #ff5252; padding: 6px 12px; text-align: left; width: 100%; cursor: pointer; font-size:13px;">Delete Quest</button></li>
            </ul>
          </div>
        </td>
      `;

      const statusEl = row.querySelector(`#${statusId}`);
      if (statusEl) {
        statusEl.style.color = reached ? 'var(--accent-success, #4caf50)' : 'var(--text-muted, #888)';
      }

      zikrTableBody.appendChild(row);
    });

    safeSetText('zikr-sp-total', `${zikrEarned} SP`);
  }

  function getActiveViewName() {
    const activeNav = document.querySelector('.sidebar-nav-btn.sidebar-nav-btn--active');
    return activeNav ? activeNav.getAttribute('data-view') : 'daily-workbook';
  }

  function updateToolbarAction() {
    const button = document.getElementById('toolbarActionButton');
    if (!button) return;
    const icon = button.querySelector('span');
    const view = getActiveViewName();
    let label = 'Action';
    let aria = 'Perform action';
    let handler = () => showToast('Action unavailable');

    if (view === 'daily-workbook') {
      label = 'Add Task';
      aria = 'Open task creation panel';
      if (state.viewingDate !== state.currentDate) {
        handler = () => showToast('Read-only archive: cannot add tasks');
      } else {
        handler = openTaskSidebarPanel;
      }
    } else if (view === 'daily-routine') {
      label = 'Edit Routine';
      aria = 'Focus routine editor';
      handler = () => {
        const editor = document.getElementById('routine-editor');
        if (editor) editor.focus();
      };
    } else if (view === 'daily-quest') {
      label = 'Add Quest';
      aria = 'Open add quest modal';
      handler = () => openQuestModal();
    } else if (view === 'analytics') {
      // Hide toolbar action in Analytics view (analytics updates live)
      button.style.display = 'none';
      toolbarActionHandler = null;
      return;
    }

    const labelEl = button.querySelector('.toolbar-btn-label');
    if (labelEl) labelEl.textContent = label;
    button.setAttribute('aria-label', aria);
    toolbarActionHandler = handler;
    button.style.display = '';
    if (icon) icon.className = icon.className.replace(/icon-[a-z-]+/, '');
    if (icon) icon.classList.add(view === 'daily-workbook' || view === 'daily-quest' ? 'icon-plus' : view === 'daily-routine' ? 'icon-edit' : view === 'analytics' ? 'icon-refresh' : 'icon-generate');
  }

  function openQuestModal(questId = null) {
    if (state.viewingDate !== state.currentDate) {
      showToast('Read-only archive: cannot edit quests');
      return;
    }

    const modal = document.getElementById('questModal');
    const title = document.getElementById('questModalTitle');
    const nameInput = document.getElementById('inpZikrName');
    const targetInput = document.getElementById('inpZikrTarget');
    const spInput = document.getElementById('inpZikrSp');

    if (!modal || !nameInput || !targetInput || !spInput) return;

    editingZikrId = questId;
    if (editingZikrId && state.zikr[state.currentDate] && state.zikr[state.currentDate][editingZikrId]) {
      const item = state.zikr[state.currentDate][editingZikrId];
      title.textContent = 'Edit Zikr Quest';
      nameInput.value = item.name || '';
      targetInput.value = item.target || 0;
      spInput.value = item.sp || 25;
    } else {
      title.textContent = 'Add Zikr Quest';
      nameInput.value = '';
      targetInput.value = 0;
      spInput.value = 25;
    }

    modal.setAttribute('aria-hidden', 'false');
    modal.style.transform = 'translate(-50%, -50%) scale(1)';
    if (mainOverlay) {
      mainOverlay.style.display = 'block';
      mainOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeQuestModal() {
    const modal = document.getElementById('questModal');
    const nameInput = document.getElementById('inpZikrName');
    const targetInput = document.getElementById('inpZikrTarget');
    const spInput = document.getElementById('inpZikrSp');
    if (!modal) return;

    editingZikrId = null;
    modal.setAttribute('aria-hidden', 'true');
    modal.style.transform = 'translate(-50%, -50%) scale(0.96)';
    if (mainOverlay) {
      mainOverlay.style.display = 'none';
      mainOverlay.setAttribute('aria-hidden', 'true');
    }

    if (nameInput) nameInput.value = '';
    if (targetInput) targetInput.value = 0;
    if (spInput) spInput.value = 25;
  }

  function closeActivePanel() {
    closeTaskSidebarPanel();
    closeQuestModal();
    closeProfileModal();
    
    // Also close mobile sidebar
    if (leftSidebar) {
      leftSidebar.setAttribute('aria-expanded', 'false');
      if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  }

  // ==========================================
  // GLOBAL KEYBOARD SHORTCUTS
  // ==========================================
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeActivePanel();
    }
  });

  // Mobile Hamburger Menu Toggle
  if (mobileMenuBtn && leftSidebar) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = leftSidebar.getAttribute('aria-expanded') === 'true';
      leftSidebar.setAttribute('aria-expanded', !isExpanded);
      mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
      
      // Toggle overlay for sidebar too
      if (!isExpanded) {
        if (mainOverlay) {
          mainOverlay.style.display = 'block';
          mainOverlay.setAttribute('aria-hidden', 'false');
        }
      } else {
        // Only hide overlay if no other panel is open
        if (rightSidebar && rightSidebar.getAttribute('aria-hidden') === 'true') {
           if (mainOverlay) {
             mainOverlay.style.display = 'none';
             mainOverlay.setAttribute('aria-hidden', 'true');
           }
        }
      }
    });
  }

  function updateStatusBarVisibility() {
    const statusPanel = document.getElementById('bottom-status-panel');
    if (!statusPanel) return;

    const workbookView = document.getElementById('view-daily-workbook');
    const isWorkbookActive = workbookView && workbookView.classList.contains('view--active');
    const isArchiveView = state.viewingDate !== state.currentDate;

    statusPanel.style.display = (isWorkbookActive && !isArchiveView) ? 'flex' : 'none';
  }

  function updateUI() {
    updateProfileSection();
    updateLevelsAndRanks();
    renderWorkbook();
    renderRoutine();
    renderQuests();
    calculateMetrics();
    renderAnalytics();
    updateToolbarAction();
    updateReturnToTodayButton();
    updateStatusBarVisibility();
  }
  
  function updateReturnToTodayButton() {
    const returnBtn = document.getElementById('btnReturnToToday');
    if (!returnBtn) return;
    
    if (state.viewingDate !== state.currentDate) {
      returnBtn.style.display = 'flex';
      returnBtn.setAttribute('aria-hidden', 'false');
    } else {
      returnBtn.style.display = 'none';
      returnBtn.setAttribute('aria-hidden', 'true');
    }
  }

  // ==========================================
  // CORE INTERACTION EVENT HANDLERS
  // ==========================================
  
  // Navigation View Switching
  const navButtons = [
    document.getElementById('navDailyWorkbook'),
    document.getElementById('navDailyRoutine'),
    document.getElementById('navDailyQuest'),
    document.getElementById('navAnalytics')
  ];
  const views = [
    document.getElementById('view-daily-workbook'),
    document.getElementById('view-daily-routine'),
    document.getElementById('view-daily-quest'),
    document.getElementById('view-analytics')
  ];

  navButtons.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const titleLabel = btn.querySelector('.sidebar-nav-label');
      const viewTitle = titleLabel ? titleLabel.textContent : 'Daily Workbook';

      navButtons.forEach(b => {
        if (b) {
          b.classList.remove('sidebar-nav-btn--active');
          b.removeAttribute('aria-current');
        }
      });
      btn.classList.add('sidebar-nav-btn--active');
      btn.setAttribute('aria-current', 'page');

      views.forEach(v => { if (v) v.classList.remove('view--active'); });
      const currentView = document.getElementById(targetId);
      if (currentView) currentView.classList.add('view--active');

      safeSetText('currentViewTitle', state.viewingDate !== state.currentDate ? `Archive: ${state.viewingDate}` : viewTitle);
      updateToolbarAction();
      updateStatusBarVisibility();

      // Close sidebar on nav click (mobile)
      if (window.innerWidth <= 768) {
        closeActivePanel();
      }
    });
  });

  // Return to Today Button
  const returnToTodayBtn = document.getElementById('btnReturnToToday');
  if (returnToTodayBtn) {
    returnToTodayBtn.addEventListener('click', () => {
      state.viewingDate = state.currentDate;
      
      const workbookNavBtn = document.getElementById('navDailyWorkbook');
      if (workbookNavBtn) workbookNavBtn.click();
      
      showToast('📅 Returned to today view');
      updateUI();
      
      // Auto-close mobile sidebar
      if (leftSidebar && window.innerWidth <= 768) {
        leftSidebar.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const archiveList = document.getElementById('archive-list');
  if (archiveList) {
    archiveList.addEventListener('click', (e) => {
      const btn = e.target.closest('.archive-btn');
      if (!btn) return;
      const pickedDate = btn.getAttribute('data-date');
      if (!pickedDate) return;
      state.viewingDate = pickedDate;

      const workbookNavBtn = document.getElementById('navDailyWorkbook');
      if (workbookNavBtn) workbookNavBtn.click();

      showToast(`📂 Archive loaded: ${pickedDate} (Read-Only Mode)`);
      updateUI();
      
      // Auto-close mobile sidebar
      if (leftSidebar && window.innerWidth <= 768) {
        leftSidebar.setAttribute('aria-expanded', 'false');
        if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Daily Purpose Dynamic Persistence
  const purposeInput = document.getElementById('workbookPurpose');
  if (purposeInput) {
    purposeInput.addEventListener('input', (e) => {
      if (state.viewingDate !== state.currentDate) return;
      state.purpose[state.currentDate] = e.target.value;
    });
    purposeInput.addEventListener('blur', (e) => {
      if (state.viewingDate !== state.currentDate) return;
      saveToHistory();
      state.purpose[state.currentDate] = e.target.value;
      saveState();
      showToast("💾 Daily Purpose auto-saved");
    });
  }

  // Daily Routine Rich Editor Interaction
  const routineEditor = document.getElementById('routine-editor');
  if (routineEditor) {
    routineEditor.addEventListener('input', (e) => {
      if (state.viewingDate !== state.currentDate) return;
      state.routines[state.currentDate] = e.target.innerHTML;
      saveState();
    });
  }

  // Workbook Tasks Component Delegation Matrix
  const taskContainer = document.getElementById('task-container');
  if (taskContainer) {
    // Task Checklist Toggles
    taskContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('task-checkbox')) {
        if (state.viewingDate !== state.currentDate) {
          e.target.checked = !e.target.checked;
          return;
        }
        saveToHistory();
        const taskId = e.target.id.replace('chk-', '');
        const dayTasks = state.tasks[state.currentDate] || [];
        const task = dayTasks.find(t => t.id === taskId);
        
        if (task) {
          task.completed = e.target.checked;
          const points = parseInt(task.sp) || 0;
          if (task.completed) {
            state.totalSp += points;
            showToast(`✅ Task completed! +${points} SP`);
          } else {
            state.totalSp -= points;
            showToast(`❌ Task unchecked. -${points} SP`);
          }
          saveState();
          updateUI();
        }
      }
    });

    // Task Actions Dropdown Context Managers
    taskContainer.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.task-menu-btn');
      if (menuBtn) {
        e.stopPropagation();
        const taskId = menuBtn.getAttribute('data-task-id');
        const activeMenu = document.getElementById(`task-menu-${taskId}`);
        
        document.querySelectorAll('.task-dropdown-menu').forEach(m => {
          if (m.id !== `task-menu-${taskId}`) m.style.display = 'none';
        });

        if (activeMenu) {
          const isHidden = activeMenu.style.display === 'none';
          activeMenu.style.display = isHidden ? 'block' : 'none';
          menuBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        }
        return;
      }

      const actionBtn = e.target.closest('.task-dropdown-item');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        const taskId = actionBtn.getAttribute('data-task-id');
        executeTaskDropdownAction(action, taskId);
      }
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.task-dropdown-menu').forEach(m => m.style.display = 'none');
  });

  function executeTaskDropdownAction(action, taskId) {
    const dayTasks = state.tasks[state.currentDate] || [];
    const idx = dayTasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const task = dayTasks[idx];

    if (action === 'delete') {
      saveToHistory();
      if (task.completed) state.totalSp -= (parseInt(task.sp) || 0);
      dayTasks.splice(idx, 1);
      showToast("🗑️ Task successfully deleted");
      saveState();
      updateUI();
    } else if (action === 'duplicate') {
      saveToHistory();
      const clone = JSON.parse(JSON.stringify(task));
      clone.id = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      clone.name = `${clone.name} (Copy)`;
      clone.completed = false;
      dayTasks.push(clone);
      showToast("📋 Task duplicated");
      saveState();
      updateUI();
    } else if (action === 'edit') {
      editingTaskId = taskId;
      openTaskSidebarPanel();

      document.getElementById('inpTaskName').value = task.name;
      document.getElementById('inpDesc').value = task.desc || "";
      document.getElementById('inpSp').value = task.sp;
      document.getElementById('inpCategory').value = task.category;

      document.querySelectorAll('#taskTypeControl .segmented-btn').forEach(b => {
        const matching = b.getAttribute('data-type') === task.type;
        b.classList.toggle('segmented-btn--active', matching);
        b.setAttribute('aria-pressed', matching ? 'true' : 'false');
      });

      const submitBtn = document.getElementById('btnCreateTask');
      if (submitBtn) submitBtn.textContent = "Save Changes";
    }
  }

  // ==========================================
  // TASK CREATION MODAL / PANEL SYSTEM
  // ==========================================
  function openTaskSidebarPanel() {
    if (!rightSidebar || !mainOverlay) return;
    rightSidebar.setAttribute('aria-hidden', 'false');
    rightSidebar.style.transform = 'translateX(0)';
    mainOverlay.style.display = 'block';
    mainOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeTaskSidebarPanel() {
    if (!rightSidebar || !mainOverlay) return;
    rightSidebar.setAttribute('aria-hidden', 'true');
    rightSidebar.style.transform = 'translateX(100%)';
    mainOverlay.style.display = 'none';
    mainOverlay.setAttribute('aria-hidden', 'true');

    document.getElementById('inpTaskName').value = "";
    document.getElementById('inpDesc').value = "";
    document.getElementById('inpSp').value = "";
    document.getElementById('inpCategory').value = "";
    editingTaskId = null;
    
    const submitBtn = document.getElementById('btnCreateTask');
    if (submitBtn) submitBtn.textContent = "Create Task";
  }

  const openPanelBtn = document.getElementById('btnOpenTaskPanel');
  if (openPanelBtn) openPanelBtn.addEventListener('click', openTaskSidebarPanel);
  const closePanelBtn = document.getElementById('btnCloseTaskPanel');
  if (closePanelBtn) closePanelBtn.addEventListener('click', closeTaskSidebarPanel);
  if (mainOverlay) mainOverlay.addEventListener('click', closeActivePanel);

  const toolbarActionButton = document.getElementById('toolbarActionButton');
  if (toolbarActionButton) {
    toolbarActionButton.addEventListener('click', () => {
      if (typeof toolbarActionHandler === 'function') {
        toolbarActionHandler();
      }
    });
  }

  const addQuestButton = document.getElementById('btnAddQuest');
  if (addQuestButton) {
    addQuestButton.addEventListener('click', () => openQuestModal());
  }

  const closeQuestModalBtn = document.getElementById('btnCloseQuestModal');
  if (closeQuestModalBtn) {
    closeQuestModalBtn.addEventListener('click', closeQuestModal);
  }

  const saveQuestButton = document.getElementById('btnSaveQuest');
  if (saveQuestButton) {
    saveQuestButton.addEventListener('click', () => {
      if (state.viewingDate !== state.currentDate) {
        showToast('Read-only archive: cannot save quests');
        return;
      }

      const nameInput = document.getElementById('inpZikrName');
      const targetInput = document.getElementById('inpZikrTarget');
      const spInput = document.getElementById('inpZikrSp');

      if (!nameInput || !targetInput || !spInput) return;
      const name = nameInput.value.trim();
      const target = Math.max(0, Number(targetInput.value) || 0);
      const sp = Math.max(0, Number(spInput.value) || 25);

      if (!name) {
        showToast('⚠️ Zikr quest name is required');
        return;
      }

      saveToHistory();
      if (!state.zikr[state.currentDate]) {
        state.zikr[state.currentDate] = {};
      }

      let key = editingZikrId;
      if (!key) {
        // Generate unique key to prevent collisions
        key = sanitizeDOMId(name) || `zikr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        // Check if key already exists, append timestamp if collision
        if (state.zikr[state.currentDate][key]) {
          key = `${key}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }
      }
      
      const currentZikr = state.zikr[state.currentDate][key] || { completed: 0 };
      state.zikr[state.currentDate][key] = {
        name,
        target,
        completed: currentZikr.completed || 0,
        sp
      };

      if (editingZikrId && editingZikrId !== key && state.zikr[state.currentDate][editingZikrId]) {
        delete state.zikr[state.currentDate][editingZikrId];
      }

      saveState();
      updateUI();
      closeQuestModal();
      showToast(editingZikrId ? '✏️ Zikr quest updated' : '✅ Zikr quest added');
    });
  }

  const zikrActionTable = document.getElementById('zikr-table');
  if (zikrActionTable) {
    zikrActionTable.addEventListener('click', (e) => {
      // Handle shared task menu button toggles (reuse task dropdown behavior)
      const menuBtn = e.target.closest('.task-menu-btn');
      if (menuBtn) {
        e.stopPropagation();
        const taskId = menuBtn.getAttribute('data-task-id');
        const activeMenu = document.getElementById(`task-menu-${taskId}`);

        document.querySelectorAll('.task-dropdown-menu').forEach(m => {
          if (m.id !== `task-menu-${taskId}`) m.style.display = 'none';
        });

        if (activeMenu) {
          const isHidden = activeMenu.style.display === 'none' || activeMenu.style.display === '';
          activeMenu.style.display = isHidden ? 'block' : 'none';
          menuBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        }
        return;
      }

      const button = e.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const zikrId = button.getAttribute('data-zikr');
      if (!action || !zikrId) return;

      if (state.viewingDate !== state.currentDate) {
        showToast('Read-only archive: cannot modify quests');
        return;
      }

      if (action === 'edit-zikr') {
        openQuestModal(zikrId);
      } else if (action === 'delete-zikr') {
        saveToHistory();
        if (state.zikr[state.currentDate] && state.zikr[state.currentDate][zikrId]) {
          delete state.zikr[state.currentDate][zikrId];
          saveState();
          updateUI();
          showToast('🗑️ Zikr quest deleted');
        }
      }
    });
  }

  function configureSegmentedControls(controlContainerId) {
    const el = document.getElementById(controlContainerId);
    if (!el) return;
    el.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.segmented-btn');
      if (!targetBtn) return;
      el.querySelectorAll('.segmented-btn').forEach(b => {
        b.classList.remove('segmented-btn--active');
        b.setAttribute('aria-pressed', 'false');
      });
      targetBtn.classList.add('segmented-btn--active');
      targetBtn.setAttribute('aria-pressed', 'true');

      if (controlContainerId === 'scheduleTypeControl') {
        const scheduleMode = targetBtn.getAttribute('data-schedule');
        const customDaysGroup = document.getElementById('form-group-custom-days');
        if (customDaysGroup) {
          if (scheduleMode === 'custom') {
            customDaysGroup.setAttribute('aria-hidden', 'false');
            customDaysGroup.style.display = 'block';
          } else {
            customDaysGroup.setAttribute('aria-hidden', 'true');
            customDaysGroup.style.display = 'none';
          }
        }
      }
    });
  }
  configureSegmentedControls('taskTypeControl');
  configureSegmentedControls('scheduleTypeControl');

  const customDaysWrapper = document.getElementById('customDaysSelector');
  if (customDaysWrapper) {
    customDaysWrapper.addEventListener('click', (e) => {
      const btn = e.target.closest('.day-btn');
      if (!btn) return;
      const isPressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', !isPressed ? 'true' : 'false');
      btn.classList.toggle('day-btn--active', !isPressed);
    });
  }

  const submitTaskBtn = document.getElementById('btnCreateTask');
  if (submitTaskBtn) {
    submitTaskBtn.addEventListener('click', () => {
      const name = document.getElementById('inpTaskName').value.trim();
      const desc = document.getElementById('inpDesc').value.trim();
      let sp = parseInt(document.getElementById('inpSp').value) || 5;
      const category = document.getElementById('inpCategory').value;

      // Validate SP: must be positive integer
      if (sp < 0) {
        showToast("⚠️ SP must be positive");
        return;
      }
      if (sp > 500) {
        showToast("⚠️ SP cannot exceed 500");
        return;
      }
      sp = Math.max(1, sp);

      const activeTypeBtn = document.querySelector('#taskTypeControl .segmented-btn--active');
      const type = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'task';

      if (!name || !category) {
        showToast("⚠️ Missing Required Fields: Task Name & Category");
        return;
      }

      saveToHistory();
      const dayTasks = state.tasks[state.currentDate] || [];

      if (editingTaskId) {
        const task = dayTasks.find(t => t.id === editingTaskId);
        if (task) {
          const oldSp = parseInt(task.sp) || 0;
          const newSp = parseInt(sp) || 0;
          
          // If task is completed, recalculate SP difference
          if (task.completed) {
            // Undo old SP, apply new SP
            state.totalSp -= oldSp;
            state.totalSp += newSp;
          }
          
          task.name = name;
          task.desc = desc;
          task.sp = sp;
          task.category = category;
          task.type = type;
          showToast("✏️ Task updated successfully");
        }
      } else {
        const newTask = {
          id: `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name,
          desc,
          sp,
          category,
          type,
          completed: false
        };
        dayTasks.push(newTask);
        showToast("🆕 New Task created successfully");
      }

      saveState();
      closeTaskSidebarPanel();
      updateUI();
    });
  }

  // ==========================================
  // PRAYER QUESTS SYSTEM LOGIC
  // ==========================================
  const prayersTable = document.getElementById('prayers-table');
  if (prayersTable) {
    prayersTable.addEventListener('change', (e) => {
      if (e.target.classList.contains('prayer-checkbox')) {
        if (state.viewingDate !== state.currentDate) {
          e.target.checked = !e.target.checked;
          return;
        }
        saveToHistory();
        const prayerId = e.target.id.replace('chk-', '');
        const dayPrayers = state.prayers[state.currentDate];
        if (dayPrayers && dayPrayers[prayerId]) {
          dayPrayers[prayerId].completed = e.target.checked;
          if (e.target.checked) {
            const now = new Date();
            dayPrayers[prayerId].time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            state.totalSp += 50;
            showToast(`🙏 Prayer ${prayerId.charAt(0).toUpperCase() + prayerId.slice(1)} observed: +50 SP`);
          } else {
            dayPrayers[prayerId].time = "—";
            state.totalSp -= 50;
            showToast(`Prayer unchecked: -50 SP`);
          }
          saveState();
          updateUI();
        }
      }
    });

    prayersTable.addEventListener('input', (e) => {
      if (e.target.classList.contains('prayer-notes-input')) {
        if (state.viewingDate !== state.currentDate) return;
        const prayerId = e.target.id.replace('notes-', '');
        const dayPrayers = state.prayers[state.currentDate];
        if (dayPrayers && dayPrayers[prayerId]) {
          dayPrayers[prayerId].notes = e.target.value;
          saveState();
        }
      }
    });
  }

  // ==========================================
  // ZIKR QUESTS SYSTEM LOGIC
  // ==========================================
  const zikrTableMain = document.getElementById('zikr-table');
  if (zikrTableMain) {
    zikrTableMain.addEventListener('input', (e) => {
      if (state.viewingDate !== state.currentDate) return;

      const isTargetField = e.target.classList.contains('zikr-target-input');
      const isCompletedField = e.target.classList.contains('zikr-completed-input');

      if (isTargetField || isCompletedField) {
        const zikrId = e.target.id.replace('target-', '').replace('completed-', '');
        const dayZikr = state.zikr[state.currentDate];
        if (!dayZikr || !dayZikr[zikrId]) return;

        const previouslyMet = dayZikr[zikrId].completed >= dayZikr[zikrId].target && dayZikr[zikrId].target > 0;

        if (isTargetField) dayZikr[zikrId].target = Math.max(0, parseInt(e.target.value) || 0);
        if (isCompletedField) dayZikr[zikrId].completed = Math.max(0, parseInt(e.target.value) || 0);

        const currentlyMet = dayZikr[zikrId].completed >= dayZikr[zikrId].target && dayZikr[zikrId].target > 0;

        if (previouslyMet !== currentlyMet) {
          saveToHistory();
          if (currentlyMet) {
            state.totalSp += 25;
            showToast(`✨ Zikr target reached: +25 SP`);
          } else {
            state.totalSp -= 25;
            showToast(`Zikr metric reverted: -25 SP`);
          }
        }
        saveState();
        updateUI();
      }
    });
  }

  // ==========================================
  // UNDO & REDO CONTROLLER MATRIX
  // ==========================================
  const undoBtn = document.getElementById('btnUndo');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (undoStack.length === 0) {
        showToast("⚠️ State History Empty: Cannot Undo");
        return;
      }
      const snapshot = JSON.stringify({
        totalSp: state.totalSp,
        tasks: state.tasks,
        prayers: state.prayers,
        zikr: state.zikr,
        purpose: state.purpose,
        routines: state.routines
      });
      redoStack.push(snapshot);

      const past = JSON.parse(undoStack.pop());
      state.totalSp = past.totalSp;
      state.tasks = past.tasks;
      state.prayers = past.prayers;
      state.zikr = past.zikr;
      state.purpose = past.purpose;
      state.routines = past.routines;

      showToast("🔄 History Action Undone");
      saveState();
      updateUI();
    });
  }

  const redoBtn = document.getElementById('btnRedo');
  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      if (redoStack.length === 0) {
        showToast("⚠️ State History Terminal: Cannot Redo");
        return;
      }
      const snapshot = JSON.stringify({
        totalSp: state.totalSp,
        tasks: state.tasks,
        prayers: state.prayers,
        zikr: state.zikr,
        purpose: state.purpose,
        routines: state.routines
      });
      undoStack.push(snapshot);

      const future = JSON.parse(redoStack.pop());
      state.totalSp = future.totalSp;
      state.tasks = future.tasks;
      state.prayers = future.prayers;
      state.zikr = future.zikr;
      state.purpose = future.purpose;
      state.routines = future.routines;

      showToast("🔄 History Action Redone");
      saveState();
      updateUI();
    });
  }

  // ==========================================
  // DEFENSIVE HELPER WRAPPERS
  // ==========================================
  function safeSetText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // LifeOS Portal Navigation
  const PORTAL_URL = "https://lifeos-portal.netlify.app/portal.html";
  const btnBackToLifeOS = document.getElementById('btnBackToLifeOS');
  if (btnBackToLifeOS) {
    btnBackToLifeOS.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = PORTAL_URL;
    });
  }

  // ==========================================
  // INITIAL BOOTSTRAP EXECUTOR
  // ==========================================
  loadState();
  initializeProfile();
  updateProfileSection();
  
  // Initialize Supabase sync (non-blocking)
  initializeSync();
  
  performDailyResetIfNeeded();
  renderArchiveList();
  updateUI();
  suppressToastsOnInitialRender = false;
});
