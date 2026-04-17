const cloud = require('wx-server-sdk');
const nodemailer = require('nodemailer');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { content } = event;
  if (!content || !content.trim()) {
    return { success: false, error: '内容不能为空' };
  }

  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const FEEDBACK_TO = process.env.FEEDBACK_TO || SMTP_USER;

  if (!SMTP_USER || !SMTP_PASS) {
    console.error('sendFeedback 配置缺失: SMTP_USER/SMTP_PASS');
    return { success: false, error: '服务配置缺失，请联系管理员' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  try {
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
      from: `"植光反馈" <${SMTP_USER}>`,
      to: FEEDBACK_TO,
      subject: '【植光】用户意见反馈',
      text: `反馈内容：\n${content}\n\n提交时间：${timeStr}`
    });
    return { success: true };
  } catch (err) {
    console.error('发送失败:', err);
    return { success: false, error: String(err) };
  }
};
