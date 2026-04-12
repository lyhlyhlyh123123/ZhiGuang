const db = wx.cloud.database();
const { getPlantPhotos } = require('../../utils/imageHelper.js');

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
    plantPhotos: [] // 植物图片数组
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
      const photos = getPlantPhotos(plant);

      this.setData({
        plantInfo: plant,
        isOwner,
        adoptDays,
        loading: false,
        likeCount,
        hasLiked,
        plantPhotos: photos
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

      // 提前转换封面图为临时链接，供分享使用
      if (plant.photoFileID && plant.photoFileID.startsWith('cloud://')) {
        wx.cloud.getTempFileURL({
          fileList: [plant.photoFileID]
        }).then(res => {
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            this._shareCoverUrl = res.fileList[0].tempFileURL;
          }
        }).catch(() => {});
      }
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

  // 预览植物图片
  previewImage(e) {
    const { current } = e.currentTarget.dataset;
    wx.previewImage({
      current,
      urls: this.data.plantPhotos
    });
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

  // 长按删除单条日记
  deleteJournal(e) {
    if (!this.data.isOwner) return;
    const { id, index } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条养护记录吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        db.collection('journals').doc(id).remove()
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            const journalList = this.data.journalList.filter((_, i) => i !== index);
            const intimacyScore = this.calcIntimacy(journalList);
            this.setData({ journalList, intimacy: intimacyScore });
          })
          .catch(err => {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
            console.error(err);
          });
      }
    });
  },

  confirmDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后数据将无法恢复，确定吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        
        // ✅ 修复：删除时同步清理云存储文件
        const fileIDs = [];
        
        db.collection('journals')
          .where({ plantId: this.data.plantId })
          .get()
          .then(journalRes => {
            // 收集日记中的所有图片文件ID
            journalRes.data.forEach(j => {
              if (j.photoList && Array.isArray(j.photoList)) {
                fileIDs.push(...j.photoList);
              }
              if (j.photoFileID && j.photoFileID.startsWith('cloud://')) {
                fileIDs.push(j.photoFileID);
              }
            });
            
            // 删除所有日记数据库记录
            const tasks = journalRes.data.map(j => db.collection('journals').doc(j._id).remove());
            return Promise.all(tasks);
          })
          .then(() => {
            // 收集植物的所有图片文件ID
            const { plantInfo } = this.data;
            if (plantInfo) {
              if (plantInfo.photoList && Array.isArray(plantInfo.photoList)) {
                fileIDs.push(...plantInfo.photoList);
              }
              if (plantInfo.photoFileID && plantInfo.photoFileID.startsWith('cloud://')) {
                fileIDs.push(plantInfo.photoFileID);
              }
            }
            
            // 删除植物数据库记录
            return db.collection('plants').doc(this.data.plantId).remove();
          })
          .then(() => {
            // 删除云存储文件（去重）
            const uniqueFileIDs = [...new Set(fileIDs)].filter(id => id && id.startsWith('cloud://'));
            if (uniqueFileIDs.length > 0) {
              return wx.cloud.deleteFile({
                fileList: uniqueFileIDs
              }).then(delRes => {
                console.log(`【植光】已清理 ${uniqueFileIDs.length} 个云存储文件`);
                return delRes;
              }).catch(err => {
                console.warn('【植光】云存储文件清理失败（不影响删除）:', err);
              });
            }
          })
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
    if (!plantInfo) return { title: '植光 - 植物养护记录' };
    
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
    
    console.log('【植光】点赞操作 - plantId:', plantId, 'hasLiked:', hasLiked, 'userId:', userId);
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
      
      console.log('【植光】云函数返回结果:', res);
      
      if (!res.result) {
        console.error('【植光】云函数返回结果为空');
        wx.showToast({ title: '云函数调用失败', icon: 'none' });
        return;
      }
      
      const { success, hasLiked: newHasLiked, likeCount: newLikeCount, error } = res.result;
      
      if (!success) {
        console.error('【植光】点赞失败 - 错误:', error);
        wx.showToast({ title: `操作失败: ${error || '未知错误'}`, icon: 'none', duration: 3000 });
        return;
      }

      // 更新本地状态
      this.setData({
        hasLiked: newHasLiked,
        likeCount: newLikeCount
      });

      console.log('【植光】点赞成功 - 新状态:', { hasLiked: newHasLiked, likeCount: newLikeCount });

      wx.showToast({
        title: newHasLiked ? '点赞成功 ❤️' : '已取消',
        icon: 'success',
        duration: 1500
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('【植光】点赞调用失败 - 完整错误:', err);
      wx.showToast({ title: `调用失败: ${err.errMsg || '请检查网络'}`, icon: 'none', duration: 3000 });
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
  }
});
