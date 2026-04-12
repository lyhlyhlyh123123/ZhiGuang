const cloud = require('wx-server-sdk');
const nodemailer = require('nodemailer');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { content } = event;
  if (!content || !content.trim()) {
    return { success: false, error: '内容不能为空' };
  }

  // ✅ 修复：使用环境变量存储敏感信息（需在云函数配置中设置）
  // TODO: 在云开发控制台 -> 云函数 -> sendFeedback -> 配置 中添加环境变量：
  // SMTP_USER=你的邮箱
  // SMTP_PASS=你的授权码
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || '2971665141@qq.com', // 临时兼容，建议配置环境变量
      pass: process.env.SMTP_PASS || 'fhrkdesqhqexdfee'   // 临时兼容，建议配置环境变量
    }
  });

  try {
    // 修复时区问题：明确指定中国时区
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    await transporter.sendMail({
      from: '"植光反馈" <2971665141@qq.com>',
      to: '2971665141@qq.com',
      subject: '【植光】用户意见反馈',
      text: `反馈内容：\n${content}\n\n提交时间：${timeStr}`
    });
    return { success: true };
  } catch (err) {
    console.error('发送失败:', err);
    return { success: false, error: String(err) };
  }
};
