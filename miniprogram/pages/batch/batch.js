// pages/batch/batch.js
const db = wx.cloud.database();
const { checkRequestAllowed, logRequest } = require('../../utils/antiRefresh.js');

Page({
  data: {
    plantList: [],
    selectedIds: [],
    actions: [
      { label: '浇水', value: 'water', icon: 'icon-Water', selected: false },
      { label: '晒太阳', value: 'sun', icon: 'icon-sun', selected: false },
      { label: '施肥', value: 'fertilize', icon: 'icon-feiliao', selected: false },
      { label: '修剪', value: 'prune', icon: 'icon-Scissors', selected: false },
      { label: '换盆', value: 'repot', icon: 'icon-penzai', selected: false },
      { label: '除虫', value: 'debug', icon: 'icon-qingkong', selected: false },
      { label: '里程碑', value: 'milestone', icon: 'icon-lichengbei', selected: false },
      { label: '自定义', value: 'custom', icon: 'icon-qita', selected: false, isCustom: true }
    ],
    note: '',
    submitting: false,
    speciesList: [],
    locationList: [],
    filterSpecies: '',
    filterLocation: '',
    batchSearchKey: '',
    displayList: []
  },

  onShow() {
    // 节流：30秒内不重复加载
    const now = Date.now();
    if (!this._lastLoadTime || now - this._lastLoadTime > 30000) {
      this._lastLoadTime = now;
      this.loadPlants();
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  loadPlants() {
    // ✅ 防刷新保护
    const check = checkRequestAllowed('batch_loadPlants');
    if (!check.allowed) {
      if (!check.silent) {
        console.warn('🛡️ 防刷新: 批量操作加载被限制');
      }
      return;
    }
    
    // ✅ 记录请求
    logRequest('batch_loadPlants');
    
    const app = getApp();
    app.silentLogin().then(() => {
      wx.cloud.callFunction({ name: 'getMyPlants' })
        .then(res => {
          const plants = (res.result && res.result.plants) || [];
          // 提取品种和地点标签（去重）
          const speciesSet = new Set(plants.map(p => p.species).filter(Boolean));
          const locationSet = new Set(plants.map(p => p.location).filter(Boolean));
          this.setData({
            plantList: plants, displayList: plants, selectedIds: [],
            speciesList: [...speciesSet],
            locationList: [...locationSet],
            filterSpecies: '', filterLocation: '', batchSearchKey: ''
          });
        })
        .catch(() => {
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
  },

  onBatchSearch(e) {
    const key = e.detail.value.trim();
    this.setData({ batchSearchKey: key });
    this._applySearch(key);
  },

  clearBatchSearch() {
    const plantList = this.data.plantList.map(p => ({ ...p, _selected: false }));
    this.setData({ batchSearchKey: '', selectedIds: [], plantList, displayList: plantList });
  },

  // 支持 / 分隔的联合查询：多肉/客厅 → 品种含"多肉" AND 位置含"客厅"
  _applySearch(key) {
    const { plantList } = this.data;
    if (!key) {
      const resetList = plantList.map(p => ({ ...p, _selected: false }));
      this.setData({ selectedIds: [], plantList: resetList, displayList: resetList });
      return;
    }
    const parts = key.split('/').map(s => s.trim()).filter(Boolean);
    const matched = plantList.filter(p => {
      return parts.every(part => {
        const lp = part.toLowerCase();
        return (p.species || '').toLowerCase().includes(lp) ||
               (p.location || '').toLowerCase().includes(lp) ||
               (p.nickname || '').toLowerCase().includes(lp);
      });
    });
    const matchIds = matched.map(p => p._id);
    const newPlantList = plantList.map(p => ({ ...p, _selected: matchIds.includes(p._id) }));
    const displayList = matched.map(p => ({ ...p, _selected: true }));
    this.setData({ selectedIds: matchIds, plantList: newPlantList, displayList });
  },

  togglePlant(e) {
    const { id } = e.currentTarget.dataset;
    let { selectedIds, plantList, displayList } = this.data;
    selectedIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
    plantList = plantList.map(p => ({ ...p, _selected: selectedIds.includes(p._id) }));
    // 同步更新 displayList，确保界面显示正确
    displayList = displayList.map(p => ({ ...p, _selected: selectedIds.includes(p._id) }));
    this.setData({ selectedIds, plantList, displayList });
  },

  selectAll() {
    const allIds = this.data.plantList.map(p => p._id);
    const plantList = this.data.plantList.map(p => ({ ...p, _selected: true }));
    // ✅ 修复：同步更新 displayList，确保界面显示正确
    const displayList = this.data.displayList.map(p => ({ ...p, _selected: true }));
    this.setData({ selectedIds: allIds, plantList, displayList });
  },

  clearAll() {
    const plantList = this.data.plantList.map(p => ({ ...p, _selected: false }));
    // ✅ 修复：同步更新 displayList，确保界面显示正确
    const displayList = this.data.displayList.map(p => ({ ...p, _selected: false }));
    this.setData({ selectedIds: [], plantList, displayList });
  },

  toggleAction(e) {
    const { index } = e.currentTarget.dataset;
    const actions = this.data.actions;
    // 所有标签都可以点击切换选中状态
    actions[index].selected = !actions[index].selected;
    this.setData({ actions });
  },

  // 长按自定义标签
  longPressAction(e) {
    const { index } = e.currentTarget.dataset;
    const actions = this.data.actions;
    const action = actions[index];

    if (action.isCustom) {
      wx.showModal({
        title: '自定义操作',
        editable: true,
        placeholderText: '请输入操作名称',
        content: '',
        success: (res) => {
          if (res.confirm && res.content && res.content.trim()) {
            const customName = res.content.trim();
            // 只修改标签名，不自动选中
            actions[index].label = customName;
            this.setData({ actions });
          }
        }
      });
    }
  },

  onNoteInput(e) { this.setData({ note: e.detail.value }); },

  async submitBatch() {
    const { selectedIds, actions, note, submitting } = this.data;
    if (submitting) return;
    if (selectedIds.length === 0) { wx.showToast({ title: '请选择植物', icon: 'none' }); return; }
    const selectedActions = actions.filter(a => a.selected);
    if (selectedActions.length === 0) { wx.showToast({ title: '请选择操作', icon: 'none' }); return; }

    this.setData({ submitting: true });
    wx.showLoading({ title: '批量记录中...' });

    try {
      const selectedActionList = selectedActions.map(a => ({ label: a.label, icon: a.icon }));
      const hasWater = selectedActions.some(a => a.label === '浇水');
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const tasks = selectedIds.map(plantId => {
        const plant = this.data.plantList.find(p => p._id === plantId);
        const j = db.collection('journals').add({
          data: {
            plantId, plantName: plant ? plant.nickname : '',
            selectedActions: selectedActionList,
            note: note || '', photoList: [],
            createTime: db.serverDate(), updateTime: db.serverDate()
          }
        });
        return hasWater ? j.then(() => db.collection('plants').doc(plantId).update({
          data: { lastWaterDate: today, updateTime: db.serverDate() }
        })) : j;
      });

      await Promise.all(tasks);
      wx.hideLoading();
      wx.showToast({ title: `已记录 ${selectedIds.length} 株`, icon: 'success' });
      // 重置选中状态和备注，actions 恢复默认，自定义标签恢复原始文字
      const resetActions = this.data.actions.map(a => {
        if (a.isCustom) {
          return { ...a, label: '自定义', selected: false };
        }
        return { ...a, selected: false };
      });
      const resetPlantList = this.data.plantList.map(p => ({ ...p, _selected: false }));
      this.setData({ selectedIds: [], note: '', submitting: false, actions: resetActions, plantList: resetPlantList, displayList: resetPlantList, activeTag: '', filterSpecies: '', filterLocation: '', batchSearchKey: '' });
    } catch(err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      // ✅ 修复：统一使用 setData 管理状态，移除冗余的 this._submitting
      this.setData({ submitting: false });
      console.error('【植光】批量记录失败:', err);
    }
  }
});
