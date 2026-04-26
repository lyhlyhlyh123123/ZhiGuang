// pages/feedback/feedback.js
Page({
  data: {
    content: '',
    submitting: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  onShareAppMessage() {
    return {
      title: '小植书 - 记录每一寸破土而出的生命',
      path: '/pages/index/index'
    };
  },

  onContentInput(e) { this.setData({ content: e.detail.value }); },

  async submit() {
    const { content, submitting } = this.data;
    if (submitting) return;
    if (!content.trim()) { wx.showToast({ title: '请填写反馈内容', icon: 'none' }); return; }
    
    // ✅ 修复：添加内容长度限制
    if (content.length > 500) {
      wx.showToast({ title: '反馈内容不能超过500字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'sendFeedback',
        data: { content }
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '感谢你的反馈！', icon: 'success' });
        this.setData({ content: '', submitting: false });
      } else {
        wx.showToast({ title: '提交失败，请重试', icon: 'none' });
        this.setData({ submitting: false });
      }
    } catch(err) {
      wx.hideLoading();
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
      this.setData({ submitting: false });
      console.error(err);
    }
  }
});
