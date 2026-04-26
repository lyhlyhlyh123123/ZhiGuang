const { getPlantPhotos } = require('../../utils/imageHelper.js');
const { checkRequestAllowed, logRequest } = require('../../utils/antiRefresh.js');
const { invalidateCache, getTempFileURLs } = require('../../utils/imageCache.js');
const { getPlantPhotosWithCache, getCoverPhotoWithCache } = require('../../utils/imageHelper.js');
const { parseCareTasksCompat, calcTaskCountdown } = require('../../utils/careHelper.js');

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
    loading: true,
    likeCount: 0,
    hasLiked: false,
    plantPhotos: [],
    currentPhotoIndex: 0,
    swiperHeight: 1000,
    imageHeights: {},
    careTasksDisplay: [],
    isDead: false
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
    // ✅ 防刷新保护（详情页允许更频繁的刷新，但仍需限制）
    
    const check = checkRequestAllowed('plantDetail_loadAll');
    if (!check.allowed) {
      if (!check.silent) {
        console.warn('🛡️ 防刷新: 植物详情加载被限制');
      }
      return;
    }
    
    // ✅ 记录请求
    logRequest('plantDetail_loadAll');
    
    // 只有首次加载（无数据）才显示骨架屏
    if (!this.data.plantInfo) {
      this.setData({ loading: true });
    }
    wx.cloud.callFunction({
      name: 'getPlantPublic',
      data: { plantId: this.data.plantId }
    }).then(async res => {
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

      // 处理点赞数据（支持匿名用户）
      const likes = plant.likes || [];
      const likeCount = likes.length;
      
      // 获取当前用户标识（包括匿名用户）
      let currentUserId = this.data.currentOpenid;
      if (!currentUserId) {
        currentUserId = wx.getStorageSync('anonymousUserId');
        if (!currentUserId) {
          currentUserId = `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          wx.setStorageSync('anonymousUserId', currentUserId);
        }
      }
      
      const hasLiked = likes.includes(currentUserId);

      // 获取图片列表（兼容新旧数据）
      const photos = await getPlantPhotosWithCache(plant);

      this.setData({
        plantInfo: plant,
        isOwner,
        adoptDays,
        loading: false,
        likeCount,
        hasLiked,
        plantPhotos: photos,
        careTasksDisplay: this.buildCareTasksDisplay(plant),
        isDead: plant.isDead || false
      });
      wx.setNavigationBarTitle({ title: plant.nickname + '的成长' });
      this._processJournals(journals || []);

      // 如果是访客（非所有者），且首次加载，显示点赞提示
      if (!isOwner && !this._hasShownLikeTip) {
        this._hasShownLikeTip = true;
        setTimeout(() => {
          wx.showModal({
            title: '温馨提示',
            content: `喜欢这株${plant.nickname}吗？点击右上角的爱心可以为TA点赞支持哦~`,
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#22C55E'
          });
        }, 800);
      }

      // ✅ 优化：使用缓存获取临时链接，供分享使用
      if (plant.photoFileID && plant.photoFileID.startsWith('cloud://')) {
        getCoverPhotoWithCache(plant).then(tempURL => {
        this._shareCoverUrl = tempURL;
        }).catch(() => {});
      }
    }).catch(err => {
      this.setData({ loading: false });
      console.error('【小植书】加载失败:', err);
      wx.showToast({ title: '加载失败，请返回重试', icon: 'none' });
    });
  },

  // 格式化日记数据
  async _processJournals(data) {
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
    // 🌟 新增逻辑：提取所有日记图的 fileID 走批量缓存链路
    const allFileIDs = [];
    formattedList.forEach(item => {
      if (item.photoList && item.photoList.length > 0) {
        allFileIDs.push(...item.photoList);
      } else if (item.photoFileID) {
        allFileIDs.push(item.photoFileID);
      }
    });

    // 过滤出真实的云存储 ID 并去重
    const cloudIDs = [...new Set(allFileIDs)].filter(id => id && id.startsWith('cloud://'));

    if (cloudIDs.length > 0) {
      try {
        // 调用统一的缓存转换工具
        const urlMap = await getTempFileURLs(cloudIDs);
        
        // 将转换后的 URL 赋给专门用来展示的 renderPhotoList
        formattedList.forEach(item => {
          item.renderPhotoList = [];
          if (item.photoList && item.photoList.length > 0) {
            item.renderPhotoList = item.photoList.map(id => urlMap[id] || id);
          } else if (item.photoFileID) {
            item.renderPhotoList = [urlMap[item.photoFileID] || item.photoFileID];
          }
        });
      } catch (err) {
        console.error('【小植书】日记图批量获取 tempURL 失败', err);
        // 降级处理：获取失败则回退使用原始 fileID
        this._fallbackRawPhotos(formattedList);
      }
    } else {
      // 如果没有云存储图片，直接沿用原始数组
      this._fallbackRawPhotos(formattedList);
    }

    const intimacyScore = this.calcIntimacy(formattedList);
    this.setData({ journalList: formattedList, intimacy: intimacyScore });
    this.calculateNextWatering(formattedList);
  },

  // 兜底方法：直接使用原始 ID
  _fallbackRawPhotos(list) {
    list.forEach(item => {
      item.renderPhotoList = item.photoList || (item.photoFileID ? [item.photoFileID] : []);
    });
  },


  buildCareTasksDisplay(plant) {
    if (plant.carePlanEnabled === false) return [];
    const tasks = parseCareTasksCompat(plant);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const colorMap = {
      water:     { iconColor: '#3B82F6', iconBg: '#EFF6FF' },
      fertilize: { iconColor: '#F59E0B', iconBg: '#FFF7ED' },
      repot:     { iconColor: '#22C55E', iconBg: '#F0FDF4' },
      prune:     { iconColor: '#10B981', iconBg: '#F0FDF4' },
      pesticide: { iconColor: '#EF4444', iconBg: '#FEF2F2' },
    };

    return tasks.filter(t => t.enabled).map(t => {
      const countdown = calcTaskCountdown(t);
      const nextDate = new Date(today.getTime() + countdown * 24 * 60 * 60 * 1000);
      const m = nextDate.getMonth() + 1;
      const d = nextDate.getDate();
      let nextDateStr = '';
      if (countdown > 0) nextDateStr = `${m}月${d}日`;
      else if (countdown === 0) nextDateStr = '今天';
      else nextDateStr = `已逾期${Math.abs(countdown)}天`;
      const color = colorMap[t.taskId] || { iconColor: '#22C55E', iconBg: '#F0FDF4' };
      return { name: t.name, icon: t.icon, interval: t.interval, countdown, isOverdue: countdown < 0, nextDateStr, iconColor: color.iconColor, iconBg: color.iconBg };
    });
  },

  // 亲密度计算
  calcIntimacy(journals) {
    const ACTION_SCORE = { '浇水': 3, '晒太阳': 2, '施肥': 5, '修剪': 4, '换盆': 8, '除虫': 4, '里程碑': 6, '自定义': 2 };
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

  // 轮播图切换事件
  onSwiperChange(e) {
    this.setData({
      currentPhotoIndex: e.detail.current
    });
  },

  // 预览植物图片
  previewImage(e) {
    const { current } = e.currentTarget.dataset;
    wx.previewImage({
      current,
      urls: this.data.plantPhotos
    });
  },

  // 图片加载完成 - 小红书逻辑: 全宽自适应 + 高度受限80vh
  onImageLoad(e) {
    const { width, height } = e.detail;
    const index = e.currentTarget.dataset.index;
    
    if (!width || !height) return;
    
    // 获取窗口信息（使用新API替代废弃的getSystemInfoSync）
    const windowInfo = wx.getWindowInfo();
    const screenWidth = windowInfo.windowWidth;
    const screenHeight = windowInfo.windowHeight;
    
    // 计算图片宽高比
    const ratio = height / width;
    
    // 全宽自适应: 容器宽度 = 屏幕宽度
    // 显示高度 = 容器宽度 × 宽高比
    let displayHeight = screenWidth * ratio;
    
    // 高度限制: 最大80vh
    const maxHeight = screenHeight * 0.8;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
    }
    
    // 最小高度限制: 40vh,避免过矮
    const minHeight = screenHeight * 0.4;
    if (displayHeight < minHeight) {
      displayHeight = minHeight;
    }
    
    // 转换为rpx (750rpx = screenWidth px)
    const displayHeightRpx = (displayHeight / screenWidth) * 750;
    
    // 存储每张图片的计算高度
    const imageHeights = this.data.imageHeights;
    imageHeights[index] = displayHeightRpx;
    
    // 更新当前轮播图高度(显示第一张图或当前图)
    if (index === this.data.currentPhotoIndex || index === 0) {
      this.setData({
        swiperHeight: displayHeightRpx,
        imageHeights
      });
    } else {
      this.setData({ imageHeights });
    }
  },

  // 轮播切换时更新高度
  onSwiperChange(e) {
    const currentIndex = e.detail.current;
    const imageHeights = this.data.imageHeights;
    
    // 如果当前图片已计算过高度,使用缓存
    const currentHeight = imageHeights[currentIndex] || this.data.swiperHeight;
    
    this.setData({
      currentPhotoIndex: currentIndex,
      swiperHeight: currentHeight
    });
  },

  previewJournalImg(e) {
    const { current, list } = e.currentTarget.dataset;
    wx.previewImage({ current, urls: list });
  },

  openJournalPage() {
    if (!this.data.plantInfo) return;
    if (this.data.isDead) {
      wx.showToast({ title: '该植物已结束陪伴，记录已锁定', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/add-journal/add-journal?id=${this.data.plantId}&name=${this.data.plantInfo.nickname}`
    });
  },

  goToEditPlant() {
    // ✅ 设置全局刷新标志，编辑后返回首页时刷新
    const app = getApp();
    app.globalData.needRefreshIndex = true;
    
    wx.navigateTo({
      url: `/pages/edit-plant/edit-plant?id=${this.data.plantId}`
    });
  },

  // 长按日记，显示操作菜单
  deleteJournal(e) {
    if (!this.data.isOwner) return;
    const { id, index } = e.currentTarget.dataset;
    
    wx.showActionSheet({
      itemList: ['编辑记录', '删除记录'],
      itemColor: '#1F2937',
      success: (res) => {
        if (res.tapIndex === 0) {
          // 编辑记录
          this.editJournal(id, index);
        } else if (res.tapIndex === 1) {
          // 删除记录
          this.confirmDeleteJournal(id, index);
        }
      }
    });
  },

  // 编辑日记
  editJournal(id, index) {
    const journal = this.data.journalList[index];
    if (!journal) return;
    
    // 将日记数据编码后传递
    const journalData = encodeURIComponent(JSON.stringify({
      _id: journal._id,
      selectedActions: journal.renderActions || journal.selectedActions || [],
      note: journal.note || '',
      photoList: journal.photoList || [],
      createTime: journal.createTime
    }));
    
    wx.navigateTo({
      url: `/pages/add-journal/add-journal?id=${this.data.plantId}&name=${this.data.plantInfo.nickname}&editMode=true&journalData=${journalData}`
    });
  },

  // 确认删除日记
  confirmDeleteJournal(id, index) {
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条养护记录吗？',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        const app = getApp();

        try {
          const result = await wx.cloud.callFunction({
            name: 'deleteJournal',
            data: { journalId: id }
          });

          if (!result.result.success) {
            throw new Error(result.result.message);
          }

          // 直接用云函数返回的原始 cloud:// fileID 失效缓存
          const deletedPhotos = result.result.deletedPhotos || [];
          if (deletedPhotos.length > 0) invalidateCache(deletedPhotos);

          app.globalData.needRefreshIndex = true;
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          const journalList = this.data.journalList.filter((_, i) => i !== index);
          const intimacyScore = this.calcIntimacy(journalList);
          this.setData({ journalList, intimacy: intimacyScore });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
          console.error('deleteJournal failed:', err);
        }
      }
    });
  },

  confirmMarkDead() {
    wx.showModal({
      title: '结束陪伴',
      content: '每一段陪伴都值得被记住。结束陪伴后，植物和所有日记将完整保留，随时可以回来看看。',
      confirmText: '好好告别',
      cancelText: '再陪一会',
      confirmColor: '#92400E',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '操作中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'markPlantDead',
            data: { plantId: this.data.plantId }
          });
          wx.hideLoading();
          if (!result.result.success) throw new Error(result.result.message);
          const app = getApp();
          app.globalData.needRefreshIndex = true;
          this.setData({ isDead: true, 'plantInfo.deadDate': result.result.deadDate });
          wx.showToast({ title: '已结束陪伴', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  confirmRevive() {
    wx.showModal({
      title: '恢复陪伴',
      content: '确定要重新开始陪伴这株植物吗？',
      confirmText: '继续陪伴',
      confirmColor: '#16A34A',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '操作中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'revivePlant',
            data: { plantId: this.data.plantId }
          });
          wx.hideLoading();
          if (!result.result.success) throw new Error(result.result.message);
          const app = getApp();
          app.globalData.needRefreshIndex = true;
          this.setData({ isDead: false });
          wx.showToast({ title: '已恢复陪伴', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  confirmDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后数据将无法恢复，确定吗？',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return;

        const app = getApp();
        app.globalData.needRefreshIndex = true;
        wx.showLoading({ title: '删除中...' });

        try {
          const result = await wx.cloud.callFunction({
            name: 'deletePlant',
            data: { plantId: this.data.plantId }
          });

          if (!result.result.success) {
            throw new Error(result.result.message);
          }

          // 云函数返回的是原始 cloud:// fileID，用于正确失效缓存
          const deletedPhotos = result.result.deletedPhotos || [];
          if (deletedPhotos.length > 0) {
            invalidateCache(deletedPhotos);
          }

          wx.hideLoading();
          wx.showToast({ title: '已删除' });
          setTimeout(() => wx.navigateBack(), 1500);
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败，请重试', icon: 'none' });
          console.error('deletePlant failed:', err);
        }
      }
    });
  },

  // 点击"分享植物卡片"按钮时触发（open-type="share" 会自动调用此方法）
  onShareAppMessage() {
    const { plantInfo, intimacy } = this.data;
    if (!plantInfo) return { title: '小植书 - 植物养护记录' };
    
    // 分享成功后显示提示
    setTimeout(() => {
      wx.showToast({
        title: '已分享，朋友可以点赞支持',
        icon: 'none',
        duration: 2500
      });
    }, 500);
    
    const shareObj = {
      title: `给你看看我养的${plantInfo.nickname}，喜欢就进入主页点点赞吧！`,
      path: `/pages/plant-detail/plant-detail?id=${this.data.plantId}`
    };
    // 使用提前缓存的临时链接作为封面，否则微信自动截图
    if (this._shareCoverUrl) {
      shareObj.imageUrl = this._shareCoverUrl;
    }
    return shareObj;
  },

  onShareTimeline() {
    const { plantInfo, intimacy } = this.data;
    if (!plantInfo) return { title: '小植书 - 植物养护记录' };
    
    // 分享到朋友圈后提示
    setTimeout(() => {
      wx.showToast({
        title: '已分享，朋友可以点赞',
        icon: 'none',
        duration: 2500
      });
    }, 500);
    
    const shareObj = {
      title: `${plantInfo.nickname}的成长日记 | 亲密度 ${intimacy}%`,
      query: `id=${this.data.plantId}`
    };
    if (this._shareCoverUrl) {
      shareObj.imageUrl = this._shareCoverUrl;
    }
    return shareObj;
  },

  // 点赞/取消点赞 - 使用云函数（支持匿名用户）
  toggleLike() {
    const { plantId, hasLiked, currentOpenid } = this.data;
    
    // 获取或生成用户标识（支持匿名）
    let userId = currentOpenid;
    if (!userId) {
      // 匿名用户：从本地存储获取或生成唯一标识
      userId = wx.getStorageSync('anonymousUserId');
      if (!userId) {
        userId = `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        wx.setStorageSync('anonymousUserId', userId);
      }
    }
    
    wx.showLoading({ title: hasLiked ? '取消中...' : '点赞中...' });

    // 调用云函数处理点赞
    wx.cloud.callFunction({
      name: 'toggleLike',
      data: {
        plantId,
        anonymousId: userId  // 传递用户标识（包括匿名用户）
      }
    }).then(res => {
      wx.hideLoading();
      
      if (!res.result) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        return;
      }
      
      const { success, hasLiked: newHasLiked, likeCount: newLikeCount, error } = res.result;
      
      if (!success) {
        console.error('【小植书】点赞失败:', error);
        wx.showToast({ title: '操作失败，请重试', icon: 'none' });
        return;
      }

      // 更新本地状态
      this.setData({
        hasLiked: newHasLiked,
        likeCount: newLikeCount
      });

      wx.showToast({
        title: newHasLiked ? '点赞成功 ❤️' : '已取消',
        icon: 'success',
        duration: 1500
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('【小植书】点赞失败:', err);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    });
  },

  // 显示植物详情(来源和备注)
  showPlantDetail() {
    const { plantInfo } = this.data;
    if (!plantInfo) return;

    const content = [];
    if (plantInfo.source) {
      content.push(`来源：${plantInfo.source}`);
    }
    if (plantInfo.remark) {
      content.push(`备注：${plantInfo.remark}`);
    }

    wx.showModal({
      title: '详细信息',
      content: content.join('\n\n'),
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#22C55E'
    });
  },

  // 显示完整备注
  showFullRemark() {
    const { plantInfo } = this.data;
    if (!plantInfo || !plantInfo.remark) return;
    
    wx.showModal({
      title: '备注信息',
      content: plantInfo.remark,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#22C55E'
    });
  },

  // 显示完整来源
  showFullSource() {
    const { plantInfo } = this.data;
    if (!plantInfo || !plantInfo.source) return;
    
    wx.showModal({
      title: '来源信息',
      content: plantInfo.source,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#22C55E'
    });
  }
});
