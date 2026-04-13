/**
 * 防刷新保护 - 防止恶意刷新消耗CDN流量
 * 
 * 核心策略：
 * 1. 请求频率限制（节流）
 * 2. 单会话请求次数统计
 * 3. 异常行为检测和警告
 */

// 请求记录存储
const requestLog = {
  session: {}, // 当前会话的请求记录 { key: { count, firstTime, lastTime } }
  blocked: new Set() // 被阻止的key
};

// 配置参数
const CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 30,     // 每分钟最多请求次数
  MAX_REQUESTS_PER_SESSION: 200,   // 单会话最多请求次数
  THROTTLE_DURATION: 1000,         // 节流时间（毫秒）
  BLOCK_DURATION: 60000,           // 阻止时长（毫秒）
  WARNING_THRESHOLD: 100,          // 警告阈值
  RESET_AFTER: 5 * 60 * 1000      // 5分钟后重置计数
};

/**
 * 检查是否允许请求
 * @param {String} key - 请求标识（如页面名称、接口名称）
 * @returns {Object} { allowed, reason, waitTime }
 */
function checkRequestAllowed(key) {
  const now = Date.now();
  
  // 1. 检查是否被阻止
  if (requestLog.blocked.has(key)) {
    return {
      allowed: false,
      reason: '请求过于频繁，请稍后再试',
      waitTime: 60
    };
  }
  
  // 2. 获取或创建请求记录
  if (!requestLog.session[key]) {
    requestLog.session[key] = {
      count: 0,
      firstTime: now,
      lastTime: 0,
      minuteCount: 0,
      minuteStart: now
    };
  }
  
  const record = requestLog.session[key];
  
  // 3. 检查是否需要重置（超过5分钟）
  if (now - record.firstTime > CONFIG.RESET_AFTER) {
    record.count = 0;
    record.firstTime = now;
    record.minuteCount = 0;
    record.minuteStart = now;
  }
  
  // 4. 检查每分钟请求次数
  if (now - record.minuteStart > 60000) {
    // 重置分钟计数
    record.minuteCount = 0;
    record.minuteStart = now;
  }
  
  if (record.minuteCount >= CONFIG.MAX_REQUESTS_PER_MINUTE) {
    requestLog.blocked.add(key);
    setTimeout(() => requestLog.blocked.delete(key), CONFIG.BLOCK_DURATION);
    
    console.warn(`⚠️ 防刷新警告: ${key} 每分钟请求超限 (${record.minuteCount}次)`);
    
    return {
      allowed: false,
      reason: '请求过于频繁，请稍后再试',
      waitTime: 60
    };
  }
  
  // 5. 检查节流时间
  if (now - record.lastTime < CONFIG.THROTTLE_DURATION) {
    return {
      allowed: false,
      reason: '请求过快，请稍候',
      waitTime: Math.ceil((CONFIG.THROTTLE_DURATION - (now - record.lastTime)) / 1000),
      silent: true // 静默拒绝，不显示提示
    };
  }
  
  // 6. 检查会话总请求次数
  if (record.count >= CONFIG.MAX_REQUESTS_PER_SESSION) {
    requestLog.blocked.add(key);
    setTimeout(() => requestLog.blocked.delete(key), CONFIG.BLOCK_DURATION);
    
    console.warn(`⚠️ 防刷新警告: ${key} 会话请求超限 (${record.count}次)`);
    
    return {
      allowed: false,
      reason: '操作过于频繁，请稍后再试',
      waitTime: 60
    };
  }
  
  // 7. 警告检测
  if (record.count === CONFIG.WARNING_THRESHOLD) {
    console.warn(`⚠️ 防刷新警告: ${key} 请求次数较多 (${record.count}次)`);
  }
  
  return { allowed: true };
}

/**
 * 记录请求
 * @param {String} key - 请求标识
 */
function logRequest(key) {
  const now = Date.now();
  
  if (requestLog.session[key]) {
    requestLog.session[key].count++;
    requestLog.session[key].lastTime = now;
    requestLog.session[key].minuteCount++;
  }
}

/**
 * 获取请求统计
 * @param {String} key - 请求标识（可选）
 * @returns {Object} 统计信息
 */
function getRequestStats(key) {
  if (key) {
    return requestLog.session[key] || { count: 0 };
  }
  
  // 返回所有统计
  const stats = {};
  let totalCount = 0;
  
  Object.keys(requestLog.session).forEach(k => {
    stats[k] = requestLog.session[k].count;
    totalCount += requestLog.session[k].count;
  });
  
  return {
    details: stats,
    total: totalCount,
    blocked: Array.from(requestLog.blocked)
  };
}

/**
 * 重置请求记录
 * @param {String} key - 请求标识（可选，不传则重置全部）
 */
function resetRequestLog(key) {
  if (key) {
    delete requestLog.session[key];
    requestLog.blocked.delete(key);
  } else {
    requestLog.session = {};
    requestLog.blocked.clear();
  }
}

/**
 * 节流装饰器（用于包装数据请求函数）
 * @param {Function} fn - 原函数
 * @param {String} key - 请求标识
 * @returns {Function} 包装后的函数
 */
function withAntiRefresh(fn, key) {
  return function(...args) {
    // 检查是否允许请求
    const check = checkRequestAllowed(key);
    
    if (!check.allowed) {
      if (!check.silent) {
        wx.showToast({
          title: check.reason,
          icon: 'none',
          duration: 2000
        });
      }
      console.warn(`🛡️ 请求被拦截: ${key} - ${check.reason}`);
      return Promise.reject(new Error(check.reason));
    }
    
    // 记录请求
    logRequest(key);
    
    // 执行原函数
    return fn.apply(this, args);
  };
}

/**
 * 监控用户行为异常
 */
function monitorUserBehavior() {
  const stats = getRequestStats();
  
  // 检查总请求次数
  if (stats.total > 500) {
    console.error('🚨 异常行为检测: 总请求次数过多', stats);
    
    // 可以在这里上报到服务器或采取其他措施
    wx.reportMonitor('abnormal_behavior', 1);
  }
  
  // 检查是否有多个接口被阻止
  if (stats.blocked.length >= 3) {
    console.error('🚨 异常行为检测: 多个接口被阻止', stats);
  }
}

// 每30秒监控一次
setInterval(monitorUserBehavior, 30000);

module.exports = {
  checkRequestAllowed,
  logRequest,
  getRequestStats,
  resetRequestLog,
  withAntiRefresh,
  CONFIG // 导出配置，允许外部调整
};
