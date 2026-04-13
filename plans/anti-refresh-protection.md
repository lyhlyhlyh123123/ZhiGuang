# 防刷新保护方案

## 🛡️ 防恶意刷新机制

为防止用户（恶意或误操作）通过频繁刷新页面消耗CDN流量和云函数调用次数，已实施以下保护措施：

---

## 📋 保护策略

### 1. 多维度限流

| 维度 | 限制 | 说明 |
|------|------|------|
| **节流时间** | 1秒 | 同一请求1秒内只能执行1次 |
| **每分钟请求** | 30次 | 每分钟最多30次请求 |
| **单会话总请求** | 200次 | 单次打开小程序最多200次请求 |
| **阻止时长** | 60秒 | 超限后阻止60秒 |

### 2. 异常行为监控

- ✅ 自动检测总请求次数（>500次警告）
- ✅ 监控被阻止的接口数量（≥3个警告）
- ✅ 每30秒自动巡检一次
- ✅ 异常行为上报（可扩展）

---

## 🔧 实施细节

### 核心文件

#### [`miniprogram/utils/antiRefresh.js`](miniprogram/utils/antiRefresh.js)
防刷新保护核心模块，提供：
- `checkRequestAllowed(key)` - 检查请求是否允许
- `logRequest(key)` - 记录请求
- `withAntiRefresh(fn, key)` - 装饰器模式包装函数
- `getRequestStats()` - 获取统计信息
- `resetRequestLog()` - 重置记录

### 已保护的页面

✅ **首页** ([`index.js`](miniprogram/pages/index/index.js))
```javascript
// fetchPlants() 方法已添加防刷新保护
const check = checkRequestAllowed('index_fetchPlants');
if (!check.allowed && !forceRefresh) return;
logRequest('index_fetchPlants');
```

✅ **日历页** ([`calendar.js`](miniprogram/pages/calendar/calendar.js))
```javascript
// loadMonthData() - 月度数据加载
// selectDay() - 日期选择
```

✅ **批量操作页** ([`batch.js`](miniprogram/pages/batch/batch.js))
```javascript
// loadPlants() - 植物列表加载
```

✅ **植物详情页** ([`plant-detail.js`](miniprogram/pages/plant-detail/plant-detail.js))
```javascript
// loadAll() - 详情数据加载
```

---

## 📊 工作原理

### 请求流程

```
用户操作 
  ↓
检查是否被阻止 → 是 → 拒绝请求，提示"请稍后再试"
  ↓ 否
检查节流时间 → 未到 → 静默拒绝
  ↓ 已到
检查每分钟次数 → 超限 → 拒绝并阻止60秒
  ↓ 未超
检查会话总次数 → 超限 → 拒绝并阻止60秒
  ↓ 未超
允许请求 → 记录日志 → 执行请求
```

### 示例：用户快速刷新10次

| 次数 | 时间 | 结果 | 说明 |
|------|------|------|------|
| 1 | 0s | ✅ 允许 | 正常请求 |
| 2 | 0.5s | ❌ 拒绝 | 节流保护（静默） |
| 3 | 1.5s | ✅ 允许 | 通过节流 |
| 4 | 2s | ❌ 拒绝 | 节流保护（静默） |
| ... | ... | ... | ... |
| 31 | 60s | ❌ 拒绝 | 每分钟超限，阻止60秒 |

---

## 🎯 配置参数

可在 [`antiRefresh.js`](miniprogram/utils/antiRefresh.js) 中调整：

```javascript
const CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 30,     // 每分钟最多30次
  MAX_REQUESTS_PER_SESSION: 200,   // 会话最多200次
  THROTTLE_DURATION: 1000,         // 节流1秒
  BLOCK_DURATION: 60000,           // 阻止60秒
  WARNING_THRESHOLD: 100,          // 100次时警告
  RESET_AFTER: 5 * 60 * 1000      // 5分钟重置
};
```

---

## 💡 使用建议

### 为新接口添加保护

**方法1：手动检查（推荐）**
```javascript
const { checkRequestAllowed, logRequest } = require('../../utils/antiRefresh.js');

function myDataFetch() {
  // 检查请求
  const check = checkRequestAllowed('myPage_myFunction');
  if (!check.allowed) {
    if (!check.silent) {
      console.warn('🛡️ 请求被限制');
    }
    return;
  }
  
  // 记录请求
  logRequest('myPage_myFunction');
  
  // 执行实际请求
  wx.cloud.callFunction({ name: 'xxx' })...
}
```

**方法2：装饰器模式**
```javascript
const { withAntiRefresh } = require('../../utils/antiRefresh.js');

// 原函数
function fetchData() {
  return wx.cloud.callFunction({ name: 'getData' });
}

// 包装后的函数（自动保护）
const protectedFetchData = withAntiRefresh(fetchData, 'myPage_fetch');

// 使用
protectedFetchData().then(res => {...});
```

### 查看统计信息

在控制台执行：
```javascript
const { getRequestStats } = require('../../utils/antiRefresh.js');

// 查看所有统计
console.log(getRequestStats());
// 输出: { 
//   details: { 
//     'index_fetchPlants': 15, 
//     'calendar_loadMonth': 8 
//   },
//   total: 23,
//   blocked: ['index_fetchPlants']
// }

// 查看单个统计
console.log(getRequestStats('index_fetchPlants'));
// 输出: { count: 15, firstTime: xxx, lastTime: xxx }
```

---

## ⚠️ 注意事项

### 1. 合理的用户操作不受影响

正常用户：
- 浏览页面 ✅
- 切换页面 ✅  
- 下拉刷新 ✅（间隔>1秒）
- 返回页面 ✅

### 2. 异常行为会被限制

恶意/误操作：
- 快速连续刷新 ❌
- 脚本自动请求 ❌
- 1分钟内刷新>30次 ❌

### 3. 用户体验友好

- 静默拒绝：节流时不显示提示
- 明确提示：超限时显示"请求过于频繁"
- 自动恢复：60秒后自动解除阻止

### 4. 不影响强制刷新

用户主动下拉刷新等操作仍可bypass限制：
```javascript
fetchPlants(forceRefresh = true) // 强制刷新跳过检查
```

---

## 📈 预期效果

### 防护前（假设有恶意刷新）
- 用户快速刷新100次 → 100次请求 → 消耗大量CDN流量

### 防护后
- 用户快速刷新100次 → 实际约30次请求 → **减少70%无效请求**
- 异常行为自动检测并阻止

---

## 🔍 监控与调试

### 控制台日志

正常请求：
```
（无日志或静默拒绝）
```

超限警告：
```
⚠️ 防刷新警告: index_fetchPlants 每分钟请求超限 (30次)
🛡️ 请求被拦截: index_fetchPlants - 请求过于频繁，请稍后再试
```

异常行为：
```
🚨 异常行为检测: 总请求次数过多 { total: 523, ... }
🚨 异常行为检测: 多个接口被阻止 { blocked: [...] }
```

### 用户提示

节流期间：
- 静默拒绝，无提示（避免打扰）

超限时：
- Toast提示："请求过于频繁，请稍后再试"
- 建议等待时间：60秒

---

## 🎁 额外收益

1. **减少云函数调用** - 降低费用
2. **减少CDN流量** - 降低费用
3. **保护服务器** - 防止过载
4. **改善用户体验** - 避免无效等待
5. **安全防护** - 抵御简单的DDoS攻击

---

## 🚀 后续优化方向

1. **IP级别限流**（需要后端支持）
2. **设备指纹识别**（识别同一设备）
3. **动态调整阈值**（根据服务器负载）
4. **用户行为分析**（区分正常用户和异常用户）
5. **黑白名单机制**（VIP用户更高配额）

---

**更新时间**: 2026-04-13  
**适用项目**: 植光 ZhiGuang 小程序  
**防护目标**: 防止恶意刷新消耗CDN流量和云函数调用次数
