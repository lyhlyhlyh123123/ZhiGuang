const db = wx.cloud.database();

Page({
  data: {
    plantInfo: null,
    journalList: [],
    plantId: '',
    intimacy: 60,
    nextWatering: { days: 0, date: '', isOverdue: false, text: '' },
    isOwner: false,
    adoptDays: 0,
    currentOpenid: '',
    loading: true
  },

  onLoad(options) {
    this.setData({ plantId: options.id });
    const app = getApp();
    app.silentLogin().then(() => {
      const openid = app.globalData.openid || '';
      this.setData({ currentOpenid: openid });
      this._loginReady = true;
      if (this.data.plantId) {
        this.loadAll();
      }
    });
  },

  onShow() {
    if (this.data.plantId && this._loginReady) {
      this.loadAll();
    }
  },

  // 用云函数拉取植物 + 日记（绕过数据库权限，支持他人查看）
  loadAll() {
    // 只有首次加载（无数据）才显示骨架屏
    if (!this.data.plantInfo) {
      this.setData({ loading: true });
    }
    wx.cloud.callFunction({
      name: 'getPlantPublic',
      data: { plantId: this.data.plantId }
    }).then(res => {
      const { success, plant, journals } = res.result;
      if (!success || !plant) {
        this.setData({ loading: false });
        wx.showToast({ title: '植物不存在或已删除', icon: 'none' });
        return;
      }

      const isOwner = plant._openid === this.data.currentOpenid;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const adoptDate = new Date(plant.adoptDate).getTime();
      const adoptDays = Math.floor(Math.max(0, today - adoptDate) / (1000 * 60 * 60 * 24)) + 1;

      this.setData({ plantInfo: plant, isOwner, adoptDays, loading: false });
      wx.setNavigationBarTitle({ title: plant.nickname + '的成长' });
      this._processJournals(journals || []);
    }).catch(err => {
      this.setData({ loading: false });
      console.error('【植光】加载失败:', err);
      wx.showToast({ title: '加载失败，请返回重试', icon: 'none' });
    });
  },

  // 格式化日记数据
  _processJournals(data) {
    const formattedList = data.map(item => {
      const dateObj = new Date(item.createTime);
      item.formatTime = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()} ${dateObj.getHours()}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

      if (!item.selectedActions && item.actionDisplayName) {
        const actions = item.actionDisplayName.split(' / ').map(str => {
          const match = str.match(/(icon-[\w-]+)(.*)/);
          return match ? { icon: match[1], label: match[2] } : { icon: 'icon-jilu', label: str };
        });
        item.renderActions = actions;
      } else {
        item.renderActions = item.selectedActions || [];
      }
      return item;
    });

    const intimacyScore = this.calcIntimacy(formattedList);
    this.setData({ journalList: formattedList, intimacy: intimacyScore });
    this.calculateNextWatering(formattedList);
  },

  // 亲密度计算
  calcIntimacy(journals) {
    const ACTION_SCORE = { '浇水': 3, '晒太阳': 2, '施肥': 5, '修剪': 4, '换盆': 8, '除虫': 4 };
    const INIT_SCORE = 30;          // 初始分
    const DEFAULT_ACTION_SCORE = 2; // 未知动作默认分
    const STREAK_BONUS = 2;         // 每连续天数加成
    const DECAY_THRESHOLD = 5;      // 超过几天不打卡开始掉分
    const DECAY_PER_DAY = 2;        // 每天掉几分

    let base = INIT_SCORE;

    // 1. 按动作类型累加基础分
    journals.forEach(j => {
      (j.renderActions || []).forEach(a => {
        base += ACTION_SCORE[a.label] || DEFAULT_ACTION_SCORE;
      });
    });

    // 2. 连续打卡加成（按日期去重，连续天数 × STREAK_BONUS）
    const daySet = new Set(
      journals.map(j => {
        const d = new Date(j.createTime);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
      })
    );
    const days = [...daySet].sort();
    let streak = 1, maxStreak = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const curr = new Date(days[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 1;
      }
    }
    base += maxStreak * STREAK_BONUS;

    // 3. 时间衰减（距离最近一次日记超过 DECAY_THRESHOLD 天开始掉分）
    if (journals.length > 0) {
      const lastTime = new Date(journals[0].createTime).getTime();
      const daysSinceLast = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > DECAY_THRESHOLD) {
        base -= (daysSinceLast - DECAY_THRESHOLD) * DECAY_PER_DAY;
      }
    }

    return Math.min(Math.max(base, 1), 99);
  },

  // 计算下次浇水时间
  calculateNextWatering(journals) {
    const { plantInfo } = this.data;
    if (!plantInfo) return;

    const interval = plantInfo.waterInterval || 7;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const lastWateringJournal = journals.find(j =>
      j.renderActions && j.renderActions.some(a => a.label === '浇水')
    );

    let lastTime;
    if (lastWateringJournal) {
      const d = new Date(lastWateringJournal.createTime);
      lastTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    } else {
      const d = new Date(plantInfo.adoptDate);
      lastTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    const nextTime = lastTime + (interval * oneDayMs);
    const diffDays = Math.ceil((nextTime - today) / oneDayMs);

    const nextDate = new Date(nextTime);
    const dateStr = `${nextDate.getMonth() + 1}月${nextDate.getDate()}日`;

    let text = '', isOverdue = false;
    if (diffDays > 0) {
      text = `${dateStr}`;
    } else if (diffDays === 0) {
      text = `今天（${dateStr}）💧`;
    } else {
      text = `已逾期 ${Math.abs(diffDays)} 天 ⚠️`;
      isOverdue = true;
    }

    this.setData({
      nextWatering: {
        days: diffDays,
        date: dateStr,
        isOverdue,
        text
      }
    });
  },

  onImageError() {
    this.setData({ 'plantInfo.photoFileID': '/images/avatar.png' });
  },

  onJournalImageError(e) {
    const { journalId, imgIdx } = e.currentTarget.dataset;
    const journalList = this.data.journalList.map(item => {
      if (item._id === journalId) {
        if (imgIdx !== undefined && item.photoList) {
          item.photoList[imgIdx] = '/images/avatar.png';
        } else {
          item.photoFileID = '/images/avatar.png';
        }
      }
      return item;
    });
    this.setData({ journalList });
  },

  previewImage(e) {
    const { current, list } = e.currentTarget.dataset;
    wx.previewImage({ current, urls: list });
  },

  previewJournalImg(e) {
    const { current, list } = e.currentTarget.dataset;
    wx.previewImage({ current, urls: list });
  },

  openJournalPage() {
    if (!this.data.plantInfo) return;
    wx.navigateTo({
      url: `/pages/add-journal/add-journal?id=${this.data.plantId}&name=${this.data.plantInfo.nickname}`
    });
  },

  goToEditPlant() {
    wx.navigateTo({
      url: `/pages/edit-plant/edit-plant?id=${this.data.plantId}`
    });
  },

  confirmDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后数据将无法恢复，确定吗？',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        db.collection('journals')
          .where({ plantId: this.data.plantId })
          .get()
          .then(journalRes => {
            const tasks = journalRes.data.map(j => db.collection('journals').doc(j._id).remove());
            return Promise.all(tasks);
          })
          .then(() => db.collection('plants').doc(this.data.plantId).remove())
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已删除' });
            setTimeout(() => wx.navigateBack(), 1500);
          })
          .catch(err => {
            wx.hideLoading();
            console.error('【植光】删除失败:', err);
            wx.showToast({ title: '删除失败，请重试', icon: 'none' });
          });
      }
    });
  },

  // 点击"分享植物卡片"按钮时触发（open-type="share" 会自动调用此方法）
  onShareAppMessage() {
    const { plantInfo, intimacy } = this.data;
    if (!plantInfo) return { title: '植光 - 植物养护记录' };
    return {
      title: `看看我养的${plantInfo.nickname}，亲密度已经 ${intimacy}% 啦！`,
      path: `/pages/plant-detail/plant-detail?id=${this.data.plantId}`,
      imageUrl: plantInfo.photoFileID
    };
  },

  onShareTimeline() {
    const { plantInfo, intimacy } = this.data;
    if (!plantInfo) return { title: '植光 - 植物养护记录' };
    return {
      title: `${plantInfo.nickname}的成长日记 | 亲密度 ${intimacy}%`,
      query: `id=${this.data.plantId}`,
      imageUrl: plantInfo.photoFileID
    };
  }
});
