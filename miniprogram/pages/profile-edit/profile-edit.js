const app = getApp();
const { compressWithPreset } = require('../../utils/imageCompressor.js');

Page({
  data: {
    userInfo: null,
    tempAvatarUrl: '',
    tempNickname: '',
    canSubmit: false
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ 
        userInfo,
        tempNickname: userInfo.nickName,
        tempAvatarUrl: userInfo.avatarUrl
      });
    } else {
      this.setData({
        userInfo: { nickName: '见习', avatarUrl: '' }
      });
    }
    this.checkCanSubmit();
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
    this.checkCanSubmit();
  },

  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value });
    this.checkCanSubmit();
  },

  onNicknameBlur(e) {
    this.setData({ tempNickname: e.detail.value });
    this.checkCanSubmit();
  },

  checkCanSubmit() {
    const { tempAvatarUrl, tempNickname, userInfo } = this.data;
    const isChanged = tempAvatarUrl !== (userInfo && userInfo.avatarUrl) || 
                      tempNickname !== (userInfo && userInfo.nickName);
    
    this.setData({
      canSubmit: !!(tempAvatarUrl && tempNickname.trim() && isChanged)
    });
  },

  async saveUserProfile() {
    if (this._saving) return;
    this._saving = true;
    const { tempAvatarUrl, tempNickname } = this.data;
    wx.showLoading({ title: '资料同步中...' });

    try {
      let finalAvatarUrl = tempAvatarUrl;
      if (tempAvatarUrl.startsWith('http://tmp') || tempAvatarUrl.startsWith('wxfile://')) {
        const compressed = await compressWithPreset(tempAvatarUrl, 'avatar');
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: compressed });
        finalAvatarUrl = uploadRes.fileID;
      }

      const oldAvatarUrl = this.data.userInfo && this.data.userInfo.avatarUrl;

      const newUserInfo = { avatarUrl: finalAvatarUrl, nickName: tempNickname };
      app.globalData.userInfo = newUserInfo;
      wx.setStorageSync('userInfo', newUserInfo);

      // 删除旧头像云文件
      if (oldAvatarUrl && oldAvatarUrl.startsWith('cloud://') && oldAvatarUrl !== finalAvatarUrl) {
        wx.cloud.deleteFile({ fileList: [oldAvatarUrl] }).catch(() => {});
      }

      wx.hideLoading();
      wx.showToast({ title: '资料同步成功', icon: 'success' });
      setTimeout(() => { this._saving = false; wx.navigateBack(); }, 1500);
    } catch (err) {
      this._saving = false;
      wx.hideLoading();
      console.error('保存失败', err);
      wx.showToast({ title: '同步失败，请重试', icon: 'none' });
    }
  },

  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const oldAvatarUrl = this.data.userInfo && this.data.userInfo.avatarUrl;
          app.clearLoginState();
          // 退出时删除云存储头像
          if (oldAvatarUrl && oldAvatarUrl.startsWith('cloud://')) {
            wx.cloud.deleteFile({ fileList: [oldAvatarUrl] }).catch(() => {});
          }
          wx.showToast({ title: '已退出', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1000);
        }
      }
    });
  }
});