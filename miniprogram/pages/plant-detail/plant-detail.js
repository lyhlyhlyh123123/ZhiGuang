const db = wx.cloud.database();

Page({
  data: {
    plantInfo: null,
    journalList: [],
    plantId: '',
    intimacy: 60,
    // ✨ 养护提醒
    nextWatering: {
      days: 0,
      date: '',
      isOverdue: false,
      text: ''
    },
    // ✨ 权限控制
    isOwner: false, // 是否为植物的主人
    adoptDays: 0, // ✨ 新增：已陪伴天数
  },

  onLoad(options) {
    this.setData({ plantId: options.id });
    // ✨ 极重要：确保静默登录后再检查权限
    const app = getApp();
    app.silentLogin().then(() => {
      this.checkOwnership();
      if (this.data.plantId) {
        this.fetchPlantDetail();
        this.fetchJournals();
      }
    });
  },

  // ✨ 检查当前访问者是否是植物的主人
  checkOwnership() {
    const app = getApp();
    const openid = app.globalData.openid;
    if (openid) {
      this.setData({ currentOpenid: openid });
    }
  },

  // ✨ 核心：每次页面显示都刷新，保证编辑/记录后立刻看到最新
  onShow() {
    if (this.data.plantId && this.data.currentOpenid) {
      this.fetchPlantDetail();
      this.fetchJournals();
    }
  },

  // 获取植物基础资料
  fetchPlantDetail() {
    db.collection('plants').doc(this.data.plantId).get().then(res => {
      const info = res.data;
      const isOwner = info._openid === this.data.currentOpenid;

      // ✨ 计算已陪伴天数
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const adoptDate = new Date(info.adoptDate).getTime();
      const diffTime = Math.max(0, today - adoptDate);
      const adoptDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      this.setData({ 
        plantInfo: info,
        isOwner,
        adoptDays
      });
      
      // 设置标题
      wx.setNavigationBarTitle({ title: info.nickname + '的成长' });
    });
  },

  // ✨ 新增：详情页图片加载失败处理
  onImageError() {
    console.warn('【植光】详情页大图加载失败，已应用兜底图');
    this.setData({
      'plantInfo.photoFileID': '/images/avatar.png'
    });
  },

  // ✨ 新增：日记图片加载失败处理
  onJournalImageError(e) {
    const { journalId, imgIdx } = e.currentTarget.dataset;
    console.warn('【植光】日记图片加载失败，ID:', journalId);
    
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

  // 获取日记时间轴
  fetchJournals() {
    db.collection('journals')
      .where({ plantId: this.data.plantId })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        const formattedList = res.data.map(item => {
          const dateObj = new Date(item.createTime);
          item.formatTime = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()} ${dateObj.getHours()}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
          
          // ✨ 核心：处理旧数据或新数据，确保图标正确渲染
          if (!item.selectedActions && item.actionDisplayName) {
            // 兼容旧的 "icon-Water浇水 / icon-sun晒太阳" 字符串格式
            const actions = item.actionDisplayName.split(' / ').map(str => {
              const match = str.match(/(icon-[\w-]+)(.*)/);
              if (match) {
                return { icon: match[1], label: match[2] };
              }
              return { icon: 'icon-jilu', label: str };
            });
            item.renderActions = actions;
          } else {
            item.renderActions = item.selectedActions || [];
          }
          
          return item;
        });

        // ✨ 动态计算亲密度：初始 60，每条日记 +5，封顶 99
        const intimacyScore = Math.min(60 + (res.data.length * 5), 99);

        this.setData({ 
          journalList: formattedList,
          intimacy: intimacyScore
        });

        // ✨ 计算下一次浇水提醒
        this.calculateNextWatering(formattedList);
      });
  },

  // ✨ 计算下次浇水时间
  calculateNextWatering(journals) {
    const { plantInfo } = this.data;
    if (!plantInfo) return;

    const interval = plantInfo.waterInterval || 7;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // 找到最近的一次“浇水”记录
    const lastWateringJournal = journals.find(j => 
      j.renderActions && j.renderActions.some(a => a.label === '浇水')
    );

    let lastTime;
    if (lastWateringJournal) {
      const d = new Date(lastWateringJournal.createTime);
      lastTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    } else {
      // 如果没有浇水记录，按领养日期算
      const d = new Date(plantInfo.adoptDate);
      lastTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    const nextTime = lastTime + (interval * oneDayMs);
    const diffDays = Math.ceil((nextTime - today) / oneDayMs);

    let text = '';
    let isOverdue = false;

    if (diffDays > 0) {
      text = `建议 ${diffDays} 天后浇水`;
    } else if (diffDays === 0) {
      text = `今天该浇水啦 💧`;
      isOverdue = true;
    } else {
      text = `已逾期 ${Math.abs(diffDays)} 天未浇水 ⚠️`;
      isOverdue = true;
    }

    const nextDate = new Date(nextTime);
    this.setData({
      nextWatering: {
        days: diffDays,
        date: `${nextDate.getMonth() + 1}月${nextDate.getDate()}日`,
        isOverdue,
        text
      }
    });
  },

  // ✨ 放大预览照片
  previewImage(e) {
    const { current, list } = e.currentTarget.dataset;
    wx.previewImage({
      current: current,
      urls: list
    });
  },

  // 跳转到综合记录页
  openJournalPage() {
    wx.navigateTo({
      url: `/pages/add-journal/add-journal?id=${this.data.plantId}&name=${this.data.plantInfo.nickname}`
    });
  },

  // 管理菜单
  managePlant() {
    wx.showActionSheet({
      itemList: ['编辑植物资料', '删除这盆植物'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({
            url: `/pages/edit-plant/edit-plant?id=${this.data.plantId}`
          });
        } else if (res.tapIndex === 1) {
          this.confirmDelete();
        }
      }
    });
  },

  confirmDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复，确定吗？',
      success: (res) => {
        if (res.confirm) {
          db.collection('plants').doc(this.data.plantId).remove().then(() => {
            wx.showToast({ title: '已删除' });
            setTimeout(() => wx.navigateBack(), 1500);
          });
        }
      }
    });
  },

  // 分享功能
  sharePlant() {
    // 触发系统分享菜单 (虽然有 onShareAppMessage，但手动触发更直观)
    wx.showActionSheet({
      itemList: ['分享给朋友', '分享到朋友圈'],
      success: (res) => {
        // 微信小程序在 button 以外触发分享通常需要配置，这里主要是引导
        wx.showToast({ title: '点击右上角三个点分享效果更佳哦', icon: 'none' });
      }
    });
  },

  /**
   * 用户点击右上角分享给朋友
   */
  onShareAppMessage() {
    const { plantInfo, intimacy } = this.data;
    return {
      title: `看看我养的${plantInfo.nickname}，亲密度已经 ${intimacy}% 啦！`,
      path: `/pages/plant-detail/plant-detail?id=${this.data.plantId}`,
      imageUrl: plantInfo.photoFileID // 使用植物照片作为分享卡片封面
    };
  },

  /**
   * 用户点击右上角分享到朋友圈
   */
  onShareTimeline() {
    const { plantInfo, intimacy } = this.data;
    return {
      title: `${plantInfo.nickname}的成长日记 | 亲密度 ${intimacy}%`,
      query: `id=${this.data.plantId}`,
      imageUrl: plantInfo.photoFileID
    };
  },

  // ✨ 跳转到编辑页面
  goToEditPlant() {
    wx.navigateTo({
      url: `/pages/edit-plant/edit-plant?id=${this.data.plantId}`
    });
  },

  // ✨ 预览日记图片
  previewJournalImg(e) {
    const { current, list } = e.currentTarget.dataset;
    wx.previewImage({
      current: current,
      urls: list
    });
  }
});