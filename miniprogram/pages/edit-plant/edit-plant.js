// pages/edit-plant/edit-plant.js
const db = wx.cloud.database();

Page({
  data: {
    plantId: '',
    nickname: '',
    species: '',
    location: '',
    source: '', // 来源（选填）
    remark: '', // 备注（选填）
    adoptDate: '',
    waterInterval: 7,
    tempImagePath: '',
    originalFileID: '',
    imgX: 0,      // 图片拖动偏移 X
    imgY: 0,      // 图片拖动偏移 Y
    imgScale: 1,  // 图片缩放比例
    imgNaturalWidth: 0,
    imgNaturalHeight: 0,
    imgW: 0,
    imgH: 0,
    showCropPreview: false,
    boxW: 0,
    boxH: 0,
  },

  onLoad(options) {
    const id = options.id;
    this.setData({ plantId: id });
    
    // 初始化裁剪框尺寸
    const info = wx.getSystemInfoSync();
    const boxW = info.windowWidth - 48; // 减去左右 padding（各24px）
    const boxH = Math.round(boxW * 3 / 4);
    this.setData({ boxW, boxH });
    
    // 等 silentLogin 完成后再拉数据，确保 openid 可用
    const app = getApp();
    app.silentLogin().then(() => {
      this.fetchOldData(id);
    }).catch(() => {
      this.fetchOldData(id); // 登录失败也尝试加载，权限校验会在 fetchOldData 里处理
    });
  },

  // 1. 拉取老数据填入表单
  fetchOldData(id) {
    wx.showLoading({ title: '加载资料...' });
    db.collection('plants').doc(id).get().then(res => {
      wx.hideLoading();
      const data = res.data;
      // 校验是否是本人的植物
      const app = getApp();
      const openid = app.globalData.openid;
      if (openid && data._openid && data._openid !== openid) {
        wx.showToast({ title: '无权编辑此植物', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({
        nickname: data.nickname,
        species: data.species,
        location: data.location || '',
        source: data.source || '', // 来源
        remark: data.remark || '', // 备注
        adoptDate: data.adoptDate,
        waterInterval: data.waterInterval || 7,
        tempImagePath: data.photoFileID,
        originalFileID: data.photoFileID
      });
      
      // 如果已有图片，初始化显示参数（云存储图片需要初始化为可显示状态）
      if (data.photoFileID) {
        wx.getImageInfo({
          src: data.photoFileID,
          success: info => {
            const { boxW, boxH } = this.data;
            const scaleW = boxW / info.width;
            const scaleH = boxH / info.height;
            const scale = Math.max(scaleW, scaleH);
            
            const imgW = Math.round(info.width * scale);
            const imgH = Math.round(info.height * scale);
            
            // 计算居中偏移：如果图片比容器大，让图片居中显示
            const imgX = imgW > boxW ? (boxW - imgW) / 2 : 0;
            const imgY = imgH > boxH ? (boxH - imgH) / 2 : 0;
            
            this.setData({
              imgX,
              imgY,
              imgScale: scale,
              imgNaturalWidth: info.width,
              imgNaturalHeight: info.height,
              imgW,
              imgH,
              showCropPreview: false // 加载已有图片时不进入裁剪模式
            });
          },
          fail: () => {
            // 图片加载失败，保持默认状态（静默处理）
          }
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('【植光】加载植物资料失败:', err);
      wx.showToast({ title: '加载失败，请返回重试', icon: 'none' });
    });
  },

  onDateChange(e) {
    this.setData({ adoptDate: e.detail.value });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onSpeciesInput(e) {
    this.setData({ species: e.detail.value });
  },

  // ✨ 新增：摆放位置输入处理
  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  // ✨ 新增：快捷设置位置
  quickSetLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
  },

  // ✨ 新增：来源输入处理
  onSourceInput(e) {
    this.setData({ source: e.detail.value });
  },

  // ✨ 新增：备注输入处理
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // ✨ 新增：步进器：减少天数
  minusInterval() {
    if (this.data.waterInterval > 1) {
      this.setData({ waterInterval: this.data.waterInterval - 1 });
    }
  },

  // ✨ 新增：步进器：增加天数
  addInterval() {
    if (this.data.waterInterval < 30) {
      this.setData({ waterInterval: this.data.waterInterval + 1 });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    }).then(res => {
      const path = res.tempFiles[0].tempFilePath;
      // 获取图片原始尺寸，计算初始缩放让图片填满框
      wx.getImageInfo({
        src: path,
        success: info => {
          const { boxW, boxH } = this.data;
          const scaleW = boxW / info.width;
          const scaleH = boxH / info.height;
          const scale = Math.max(scaleW, scaleH);
          
          const imgW = Math.round(info.width * scale);
          const imgH = Math.round(info.height * scale);
          
          // 计算居中偏移：如果图片比容器大，让图片居中显示
          const imgX = imgW > boxW ? (boxW - imgW) / 2 : 0;
          const imgY = imgH > boxH ? (boxH - imgH) / 2 : 0;
          
          this.setData({
            tempImagePath: path,
            imgX,
            imgY,
            imgScale: scale,
            imgNaturalWidth: info.width,
            imgNaturalHeight: info.height,
            imgW,
            imgH,
            showCropPreview: true
          });
        },
        fail: (err) => {
          console.error('【植光】获取图片信息失败:', err);
          wx.showToast({ title: '图片加载失败，请重试', icon: 'none' });
        }
      });
    }).catch(err => {
      console.error('【植光】选择照片失败:', err);
    });
  },

  onImgMove(e) {
    // 节流优化：避免频繁 setData
    if (this._moveTimer) return;
    this._moveTimer = setTimeout(() => {
      this.setData({ imgX: e.detail.x, imgY: e.detail.y });
      this._moveTimer = null;
    }, 16); // 60fps
  },

  onImgScale(e) {
    // 节流优化：避免频繁 setData
    if (this._scaleTimer) return;
    this._scaleTimer = setTimeout(() => {
      const newScale = this.data.imgScale * e.detail.scale;
      this.setData({
        imgScale: newScale,
        imgW: Math.round(this.data.imgNaturalWidth * newScale),
        imgH: Math.round(this.data.imgNaturalHeight * newScale)
      });
      this._scaleTimer = null;
    }, 16); // 60fps
  },

  // ✅ 修复：支持 Canvas 2D API，向后兼容旧版 API
  async confirmCrop() {
    const { tempImagePath, imgX, imgY, imgScale, imgNaturalWidth, imgNaturalHeight, boxW, boxH } = this.data;
    const dpr = wx.getSystemInfoSync().pixelRatio;

    return new Promise((resolve, reject) => {
      // 优先使用 Canvas 2D API
      const query = wx.createSelectorQuery().in(this);
      query.select('#cropCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            // 使用新版 Canvas 2D API
            this._cropWithCanvas2D(res[0].node, {
              tempImagePath, imgX, imgY, imgScale,
              imgNaturalWidth, imgNaturalHeight, boxW, boxH, dpr
            }).then(resolve).catch(() => {
              // 降级到旧版 API
              this._cropWithOldCanvas({
                tempImagePath, imgX, imgY, imgScale,
                imgNaturalWidth, imgNaturalHeight, boxW, boxH, dpr
              }).then(resolve).catch(reject);
            });
          } else {
            // 降级到旧版 API
            this._cropWithOldCanvas({
              tempImagePath, imgX, imgY, imgScale,
              imgNaturalWidth, imgNaturalHeight, boxW, boxH, dpr
            }).then(resolve).catch(reject);
          }
        });
    });
  },

  // Canvas 2D API 实现
  async _cropWithCanvas2D(canvas, params) {
    const { tempImagePath, imgX, imgY, imgScale, imgNaturalWidth, imgNaturalHeight, boxW, boxH, dpr } = params;
    
    return new Promise((resolve, reject) => {
      canvas.width = boxW * dpr;
      canvas.height = boxH * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      const img = canvas.createImage();
      img.onload = () => {
        ctx.drawImage(img, imgX, imgY, imgNaturalWidth * imgScale, imgNaturalHeight * imgScale);
        
        wx.canvasToTempFilePath({
          canvas,
          x: 0, y: 0,
          width: boxW, height: boxH,
          destWidth: boxW * dpr,
          destHeight: boxH * dpr,
          success: res => {
            this.setData({ tempImagePath: res.tempFilePath, showCropPreview: false });
            resolve(res.tempFilePath);
          },
          fail: reject
        }, this);
      };
      img.onerror = reject;
      img.src = tempImagePath;
    });
  },

  // 旧版 Canvas API 实现（兼容）
  async _cropWithOldCanvas(params) {
    const { tempImagePath, imgX, imgY, imgScale, imgNaturalWidth, imgNaturalHeight, boxW, boxH, dpr } = params;
    
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('cropCanvas', this);
      ctx.drawImage(
        tempImagePath,
        imgX, imgY,
        imgNaturalWidth * imgScale,
        imgNaturalHeight * imgScale
      );
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'cropCanvas',
          x: 0, y: 0,
          width: boxW, height: boxH,
          destWidth: boxW * dpr,
          destHeight: boxH * dpr,
          success: res => {
            this.setData({ tempImagePath: res.tempFilePath, showCropPreview: false });
            resolve(res.tempFilePath);
          },
          fail: reject
        }, this);
      });
    });
  },

  async submitPlant() {
    if (this._submitting) return;
    this._submitting = true;

    const { nickname, species, location, source, remark, adoptDate, waterInterval, tempImagePath, originalFileID, plantId } = this.data;

    if (!nickname || !species || !location || !tempImagePath) {
      this._submitting = false;
      wx.showToast({ title: '请填写昵称、品种、位置并上传照片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '更新中...' });

    try {
      // 如果还在预览拖动模式，先执行裁剪
      if (this.data.showCropPreview) {
        await this.confirmCrop();
      }
      
      let finalFileID = originalFileID; // 默认使用旧的图片 ID

      // 【核心难点】：判断用户有没有换新图片
      // 如果 tempImagePath 变成了 http 开头的本地路径，说明换了新图，需要上传
      if (!tempImagePath.startsWith('cloud://')) {
        const cloudPath = `plant-photos/${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: this.data.tempImagePath, // 使用最新的 tempImagePath
        });
        finalFileID = uploadRes.fileID; // 拿到新上传的云ID
      }

      // 用 update() 更新数据库中的这条记录
      await db.collection('plants').doc(plantId).update({
        data: {
          nickname,
          species,
          location,
          source, // 来源
          remark, // 备注
          adoptDate,
          waterInterval,
          photoFileID: finalFileID,
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '修改成功！', icon: 'success', duration: 1200 });
      // 缩短延迟时间，优化用户体验
      setTimeout(() => { wx.navigateBack({ delta: 1 }); }, 1200);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'error' });
      console.error(err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // ✅ 修复：页面卸载时清理定时器，防止内存泄漏
  onUnload() {
    if (this._moveTimer) {
      clearTimeout(this._moveTimer);
      this._moveTimer = null;
    }
    if (this._scaleTimer) {
      clearTimeout(this._scaleTimer);
      this._scaleTimer = null;
    }
  }
});