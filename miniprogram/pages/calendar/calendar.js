// pages/calendar/calendar.js
const db = wx.cloud.database();
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
    
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const _ = db.command;
    
    try {
      // ✅ 修复：使用分页查询避免数据遗漏
      const MAX_LIMIT = 100;
      let allJournals = [];
      let hasMore = true;
      let skip = 0;

      while (hasMore) {
        const res = await db.collection('journals')
          .where({ createTime: _.gte(start).and(_.lt(end)) })
          .skip(skip)
          .limit(MAX_LIMIT)
          .get();
        
        allJournals = allJournals.concat(res.data);
        hasMore = res.data.length === MAX_LIMIT;
        skip += MAX_LIMIT;
        
        // 安全上限：单月最多查500条（防止异常数据）
        if (skip >= 500) break;
      }
      
      const monthStats = {};
      allJournals
        .filter(j => j.plantName && j.plantName.trim())
        .forEach(j => {
          const d = new Date(j.createTime);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          monthStats[key] = (monthStats[key] || 0) + 1;
        });
      
      // 缓存月度统计数据
      if (!this._monthCache) this._monthCache = {};
      this._monthCache[cacheKey] = monthStats;
      
      this.setData({ monthStats });
    } catch(e) {
      console.error('【植光】日历数据加载失败:', e);
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
      days.push({ day: d, dateStr, isToday: dateStr === todayStr, count: monthStats[dateStr] || 0 });
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
    const parts = date.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0);
    const nextDay = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1, 0, 0, 0);
    const _ = db.command;
    
    try {
      const res = await db.collection('journals')
        .where({ createTime: _.gte(d).and(_.lt(nextDay)) })
        .orderBy('createTime', 'desc').get();

      // 批量拉取关联植物信息（种类、地点），优先用缓存
      const plantIds = [...new Set(res.data.map(j => j.plantId).filter(Boolean))];
      const uncachedIds = plantIds.filter(id => !this._plantCache[id]);
      if (uncachedIds.length > 0) {
        const plantRes = await db.collection('plants')
          .where({ _id: db.command.in(uncachedIds) })
          .field({ _id: true, species: true, location: true })
          .get();
        plantRes.data.forEach(p => { this._plantCache[p._id] = p; });
      }

      let dayJournals = res.data
        .filter(j => j.plantName && j.plantName.trim())
        .map(j => {
        const dt = new Date(j.createTime);
        j.formatTime = `${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}`;
        const plant = this._plantCache[j.plantId] || {};
        j.species = plant.species || '';
        j.location = plant.location || '';
        return j;
      });
      
      // ✅ 新增：批量获取日记图片的临时链接（带缓存）
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
          
          // 替换为临时链接
          dayJournals = dayJournals.map(j => ({
            ...j,
            photoList: (j.photoList || []).map(id => urlMap[id] || id)
          }));
        } catch (err) {
          console.warn('⚠️ 获取日记图片临时链接失败:', err);
        }
      }
      
      // 缓存当天数据
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
