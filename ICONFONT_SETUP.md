# Iconfont 集成指南

## 📌 当前状态

已完成：
- ✅ 所有页面的 emoji 已经替换为 iconfont class
- ✅ `iconfont.wxss` 已配置为 **Font Awesome Free CDN**
- ✅ `app.wxss` 已全局引入 iconfont 库
- ✅ **无需下载任何文件** — 图标库从 CDN 动态加载

## 🎯 现在就可用

### 特点：
1. **零配置** — 无需本地文件
2. **自动更新** — Font Awesome 官方维护的最新开源库
3. **轻量级** — CDN 加速，国际标准字体库
4. **700+ 免费图标** — 覆盖所有日常场景

### 使用方法

在任何地方使用图标，只需添加 class：

```wxml
<!-- 基础用法 -->
<text class="icon icon-water"></text>

<!-- 调整大小 -->
<text class="icon icon-water" style="font-size: 40rpx;"></text>

<!-- 使用颜色 -->
<text class="icon icon-water" style="color: #43A047;"></text>
```

## 📝 图标类名对照表

### 植物养护操作
```
.icon-water       → 浇水 (水滴)
.icon-sun         → 晒太阳 (太阳)
.icon-fertilize   → 施肥 (试管)
.icon-prune       → 修剪 (剪刀)
.icon-repot       → 换盆 (杯子)
.icon-bug         → 除虫 (虫子)
```

### 通用操作
```
.icon-calendar    → 日期 (日历)
.icon-edit        → 编辑 (笔)
.icon-delete      → 删除 (垃圾桶)
.icon-share       → 分享 (分享箭头)
.icon-back        → 返回 (左箭头)
.icon-add         → 添加 (加号)
.icon-search      → 搜索 (放大镜)
.icon-upload      → 上传 (上传箭头)
.icon-image       → 图片 (图片框)
.icon-close       → 关闭 (叉号)
.icon-heart       → 心形 (红心)
.icon-temperature → 温度 (温度计)
.icon-record      → 记录 (书写)
```

## 🚀 如果要添加新图标

1. 从 [Font Awesome Free](https://fontawesome.com/icons) 找到新图标
2. 在 `miniprogram/images/iconfont/iconfont.wxss` 中添加一行：
   ```wxss
   .icon-your-icon:before { content: "\f123"; }
   ```
   （Unicode 编码从 Font Awesome 官网查询）
3. 直接在页面中使用 `<text class="icon icon-your-icon"></text>`

## 💡 技术细节

- **数据源**：Font Awesome 6.4.0 (Solid)
- **加载方式**：CDN (cdnjs.cloudflare.com)
- **格式**：TTF 字体 (微信小程序最佳兼容性)
- **更新**：自动获取最新版本，无需手动更新

---

**现在立即可用，无需任何配置！** ✅
