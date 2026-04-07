// pages/batch/batch.js
const db = wx.cloud.database();

Page({
  data: {
    plantList: [],
    selectedIds: [],
    actions: [
      { label: '浇水', value: 'water', icon: 'icon-Water', selected: true },
      { label: '晒太阳', value: 'sun', icon: 'icon-sun', selected: false },
      { label: '施肥', value: 'fertilize', icon: 'icon-feiliao', selected: false },
      { label: '修剪', value: 'prune', icon: 'icon-Scissors', selected: false },
      { label: '换盆', value: 'repot', icon: 'icon-penzai', selected: false },
      { label: '除虫', value: 'debug', icon: 'icon-qingkong', selected: false }
    ],
    note: '',
    submitting: false
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
    const app = getApp();
    app.silentLogin().then(openid => {
      db.collection('plants')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(100).get()
        .then(res => this.setData({ plantList: res.data || [], selectedIds: [] }));
    });
  },

  togglePlant(e) {
    const { id } = e.currentTarget.dataset;
    let { selectedIds, plantList } = this.data;
    selectedIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
    plantList = plantList.map(p => ({ ...p, _selected: selectedIds.includes(p._id) }));
    this.setData({ selectedIds, plantList });
  },

  selectAll() {
    const allIds = this.data.plantList.map(p => p._id);
    const plantList = this.data.plantList.map(p => ({ ...p, _selected: true }));
    this.setData({ selectedIds: allIds, plantList });
  },

  clearAll() {
    const plantList = this.data.plantList.map(p => ({ ...p, _selected: false }));
    this.setData({ selectedIds: [], plantList });
  },

  toggleAction(e) {
    const actions = this.data.actions;
    actions[e.currentTarget.dataset.index].selected = !actions[e.currentTarget.dataset.index].selected;
    this.setData({ actions });
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
            note: note || '批量养护', photoList: [],
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
      // 重置选中状态和备注，actions 恢复默认只选浇水
      const actions = this.data.actions.map((a, i) => ({ ...a, selected: i === 0 }));
      this.setData({ selectedIds: [], note: '', submitting: false, actions });
      this._submitting = false;
    } catch(err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      this.setData({ submitting: false });
      console.error(err);
    }
  }
});
