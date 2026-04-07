const cloud = require('wx-server-sdk');
const nodemailer = require('nodemailer');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { content, contact } = event;
  if (!content || !content.trim()) {
    return { success: false, error: '内容不能为空' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: '2971665141@qq.com',
      pass: 'fhrkdesqhqexdfee'
    }
  });

  try {
    await transporter.sendMail({
      from: '"植光反馈" <2971665141@qq.com>',
      to: '2971665141@qq.com',
      subject: '【植光】用户意见反馈',
      text: `反馈内容：\n${content}\n\n联系方式：${contact || '未填写'}\n\n时间：${new Date().toLocaleString('zh-CN')}`
    });
    return { success: true };
  } catch (err) {
    console.error('发送失败:', err);
    return { success: false, error: String(err) };
  }
};
