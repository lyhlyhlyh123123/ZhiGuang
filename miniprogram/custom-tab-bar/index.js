Component({
  data: {
    selected: 0
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const pages = [
        '/pages/index/index',
        '/pages/calendar/calendar',
        '/pages/batch/batch',
        '/pages/feedback/feedback'
      ];
      this.setData({ selected: index });
      wx.switchTab({ url: pages[index] });
    },

    goAdd() {
      wx.navigateTo({ url: '/pages/add-plant/add-plant' });
    }
  }
});
