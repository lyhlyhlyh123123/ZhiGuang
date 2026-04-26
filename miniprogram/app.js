// miniprogram/app.js
App({
  onLaunch: function () {
    this.globalData = {
      // ⚠️ 极重要：将这里的环境ID填入你真实的云环境ID！
      env: "cloud1-3gbiiz9c591f7a10",
      openid: null, // 全局变量，存放当前用户的 openid
      userInfo: null, // 全局变量，存放用户信息（头像、昵称）
      // 类目数据
      speciesCategories: [], // 植物品种类目
      locationCategories: [], // 摆放位置类目
      // 页面刷新标志
      needRefreshIndex: false, // 首页是否需要刷新
      needRefreshBatch: false, // 批量页是否需要刷新
    };

    // 加载类目数据
    this.loadCategories();

    if (!wx.cloud) {
      console.error("【小植书】请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      // 1. 初始化云环境 (这是前端所有云调用生效的前提)
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true, // 开启用户访问记录
      });
    }

    // 1.5 加载自定义字体 (双重保险，确保图标显示)
    this.loadCustomFont();

    // 2. 环境部署就绪，立即触发静默登录逻辑
    this.silentLogin();
  },

  /**
   * 动态加载 iconfont 字体
   */
  loadCustomFont: function() {
    wx.loadFontFace({
      family: 'ZhiGuangIcon',
      source: 'url("https://at.alicdn.com/t/c/font_5145551_jxs5d9wb1xg.ttf?t=1774248023081")',
      fail: err => {
        console.error('【小植书】❌ 字体加载失败:', err);
      }
    });
  },

  /**
   * 封装静默获取 OpenID 的方法
   * 实现了本地缓存优先、调用云函数兜底的策略
   */
  silentLogin: function () {
    // 如果已经有正在进行的登录请求，返回该 Promise
    if (this.loginPromise) return this.globalData.openid ? Promise.resolve(this.globalData.openid) : this.loginPromise;

    this.loginPromise = new Promise((resolve, reject) => {
      // 步骤 A: 优先检查本地物理缓存
      const openid = wx.getStorageSync('openid');
      const userInfo = wx.getStorageSync('userInfo');
      
      if (openid) {
        this.globalData.openid = openid;
        if (userInfo) {
          this.globalData.userInfo = userInfo;
        }
        return resolve(openid);
      }

      wx.cloud.callFunction({
        name: 'login'
      }).then((res) => {
        const newOpenid = res.result.openid;
        this.globalData.openid = newOpenid;
        wx.setStorageSync('openid', newOpenid);

        const localUserInfo = wx.getStorageSync('userInfo');
        if (localUserInfo) {
          this.globalData.userInfo = localUserInfo;
        }

        this.loginPromise = null;
        resolve(newOpenid);
      }).catch(err => {
        console.error('【小植书】❌ 云端鉴权失败', err);
        this.loginPromise = null; // 失败也清除，允许重试
        reject(err);
      });
    });

    return this.loginPromise;
  },

  /**
   * 清理登录状态（退出登录时调用）
   */
  clearLoginState: function() {
    this.loginPromise = null;
    this.globalData.openid = null;
    this.globalData.userInfo = null;
    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');
  },

  /**
   * 全局错误处理
   */
  onError: function(err) {
    console.error('【小植书】全局错误:', err);
    wx.showToast({ title: '出错了，请重试', icon: 'none' });
  },

  /**
   * 页面未找到处理
   */
  onPageNotFound: function() {
    wx.redirectTo({
      url: '/pages/index/index',
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  /**
   * 加载类目数据（从本地缓存）
   */
  loadCategories: function() {
    // 加载植物品种类目
    let species = wx.getStorageSync('speciesCategories');
    if (!species || species.length === 0) {
      // 默认品种类目(只有3个)
      species = ['龟背竹', '多肉', '绿萝'];
      wx.setStorageSync('speciesCategories', species);
    }
    this.globalData.speciesCategories = species;

    // 加载摆放位置类目
    let locations = wx.getStorageSync('locationCategories');
    if (!locations || locations.length === 0) {
      // 默认位置类目(只有3个)
      locations = ['阳台', '客厅', '书房'];
      wx.setStorageSync('locationCategories', locations);
    }
    this.globalData.locationCategories = locations;
  },

  /**
   * 添加品种类目
   */
  addSpeciesCategory: function(name) {
    if (!name || name.trim() === '') return false;
    name = name.trim();
    
    if (this.globalData.speciesCategories.includes(name)) {
      return false; // 已存在
    }
    
    this.globalData.speciesCategories.push(name);
    wx.setStorageSync('speciesCategories', this.globalData.speciesCategories);
    return true;
  },

  /**
   * 删除品种类目
   */
  removeSpeciesCategory: function(name) {
    const index = this.globalData.speciesCategories.indexOf(name);
    if (index > -1) {
      this.globalData.speciesCategories.splice(index, 1);
      wx.setStorageSync('speciesCategories', this.globalData.speciesCategories);
      return true;
    }
    return false;
  },

  /**
   * 添加位置类目
   */
  addLocationCategory: function(name) {
    if (!name || name.trim() === '') return false;
    name = name.trim();
    
    if (this.globalData.locationCategories.includes(name)) {
      return false; // 已存在
    }
    
    this.globalData.locationCategories.push(name);
    wx.setStorageSync('locationCategories', this.globalData.locationCategories);
    return true;
  },

  /**
   * 删除位置类目
   */
  removeLocationCategory: function(name) {
    const index = this.globalData.locationCategories.indexOf(name);
    if (index > -1) {
      this.globalData.locationCategories.splice(index, 1);
      wx.setStorageSync('locationCategories', this.globalData.locationCategories);
      return true;
    }
    return false;
  }
});