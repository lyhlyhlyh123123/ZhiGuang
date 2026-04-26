// pages/calendar/calendar.js
const { checkRequestAllowed, logRequest } = require('../../utils/antiRefresh.js');

Page({
  data: {
    year: 0,
    month: 0,
    calendarDays: [],
    selectedDate: '',
    dayJournals: [],
    monthStats: {}
  },

  onLoad() {
    const now = new Date();
    this._plantCache = {}; // 植物信息本地缓存
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
    this.loadMonthData();
  },

  onShow() {
    // ✅ 修复：完全清除缓存，确保数据最新（避免显示过期数据）
    this._dayCache = null;
    this._monthCache = null;
    
    // 重新加载月度统计
    this.loadMonthData();
    
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async loadMonthData() {
    const { year, month } = this.data;
    
    // ✅ 防刷新保护
    const check = checkRequestAllowed('calendar_loadMonth');
    if (!check.allowed) {
      if (!check.silent) {
        console.warn('🛡️ 防刷新: 日历加载被限制');
      }
      return;
    }
    
    // 性能优化：缓存月度数据，避免重复查询
    const cacheKey = `${year}-${month}`;
    if (this._monthCache && this._monthCache[cacheKey]) {
      this.setData({ monthStats: this._monthCache[cacheKey] });
      this.buildCalendar();
      return;
    }
    
    // ✅ 记录请求
    logRequest('calendar_loadMonth');

    try {
      const app = getApp();
      await app.silentLogin();
      const res = await wx.cloud.callFunction({
        name: 'getCalendarMonthStats',
        data: { year, month }
      });

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.message) || '加载日历统计失败');
      }

      const daysWithRecord = res.result.daysWithRecord || [];
      const monthStats = daysWithRecord.reduce((map, dayKey) => {
        map[dayKey] = true;
        return map;
      }, {});
      if (!this._monthCache) this._monthCache = {};
      this._monthCache[cacheKey] = monthStats;
      this.setData({ monthStats });
    } catch(e) {
      console.error('【小植书】日历数据加载失败:', e);
    }
    this.buildCalendar();

    // 自动选中今天并加载当天数据
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const isCurrentMonth = now.getFullYear() === this.data.year && now.getMonth() + 1 === this.data.month;
    if (isCurrentMonth) {
      this.selectDay({ currentTarget: { dataset: { date: todayStr } } });
    }
  },

  buildCalendar() {
    const { year, month, monthStats } = this.data;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ empty: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      days.push({ day: d, dateStr, isToday: dateStr === todayStr, hasRecord: !!monthStats[dateStr] });
    }
    this.setData({ calendarDays: days });
  },

  prevMonth() {
    let { year, month } = this.data;
    month--; if (month < 1) { month = 12; year--; }
    this._lastLoadTime = 0;
    this.setData({ year, month, selectedDate: '', dayJournals: [] }, () => this.loadMonthData());
  },

  nextMonth() {
    let { year, month } = this.data;
    month++; if (month > 12) { month = 1; year++; }
    this._lastLoadTime = 0;
    this.setData({ year, month, selectedDate: '', dayJournals: [] }, () => this.loadMonthData());
  },

  async selectDay(e) {
    const { date } = e.currentTarget.dataset;
    if (!date) return;
    
    // ✅ 防刷新保护
    const check = checkRequestAllowed('calendar_selectDay');
    if (!check.allowed) {
      if (!check.silent) {
        console.warn('🛡️ 防刷新: 日期选择被限制');
      }
      return;
    }
    
    // 性能优化：缓存日期数据（但今天的数据不使用缓存，确保实时性）
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const isToday = date === todayStr;
    
    if (!isToday && this._dayCache && this._dayCache[date]) {
      this.setData({
        selectedDate: date,
        dayJournals: this._dayCache[date]
      });
      return;
    }
    
    // ✅ 记录请求
    logRequest('calendar_selectDay');
    
    this.setData({ selectedDate: date });

    try {
      const app = getApp();
      await app.silentLogin();
      const res = await wx.cloud.callFunction({
        name: 'getCalendarDayJournals',
        data: { date }
      });

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.message) || '加载当天日记失败');
      }

      const journals = res.result.journals || [];
      const plants = res.result.plants || [];
      plants.forEach(p => { this._plantCache[p._id] = p; });

      let dayJournals = journals
        .filter(j => j.plantName && j.plantName.trim())
        .map(j => {
          const dt = new Date(j.createTime);
          const formatted = `${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}`;
          const plant = this._plantCache[j.plantId] || {};
          return {
            ...j,
            formatTime: formatted,
            species: plant.species || '',
            location: plant.location || ''
          };
        });

      const { getTempFileURLs } = require('../../utils/imageCache.js');
      const photoIDs = dayJournals
        .flatMap(j => j.photoList || [])
        .filter(id => id && id.startsWith('cloud://'));

      if (photoIDs.length > 0) {
        try {
          const tempURLs = await getTempFileURLs(photoIDs);
          const urlMap = tempURLs.reduce((map, item) => {
            map[item.fileID] = item.tempFileURL;
            return map;
          }, {});

          dayJournals = dayJournals.map(j => ({
            ...j,
            photoList: (j.photoList || []).map(id => urlMap[id] || id)
          }));
        } catch (err) {
          console.warn('⚠️ 获取日记图片临时链接失败:', err);
        }
      }

      if (!this._dayCache) this._dayCache = {};
      this._dayCache[date] = dayJournals;
      this.setData({ dayJournals });
    } catch(e) {
      this.setData({ dayJournals: [] });
    }
  },

  goToDetail(e) {
    wx.navigateTo({ url: `/pages/plant-detail/plant-detail?id=${e.currentTarget.dataset.id}` });
  },

  previewImg(e) {
    const { src, list } = e.currentTarget.dataset;
    wx.previewImage({ current: src, urls: list });
  },

  // ✅ 修复：添加页面卸载时清理缓存，防止内存泄漏
  onUnload() {
    this._plantCache = null;
    this._dayCache = null;
    this._monthCache = null;
  }
});
