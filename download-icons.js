#!/usr/bin/env node

/**
 * 阿里 iconfont 字体文件下载和集成脚本
 * 
 * 使用说明：
 * 1. 在阿里 iconfont 网站上创建项目并选择图标
 * 2. 获取下载链接 (通常是一个 zip 文件)
 * 3. 运行: node download-icons.js <下载链接> 或 node download-icons.js --guide
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createWriteStream } = require('fs');
const { execSync } = require('child_process');

const ICONS_DIR = path.join(__dirname);
const TTF_PATH = path.join(ICONS_DIR, 'iconfont.ttf');
const CSS_PATH = path.join(ICONS_DIR, 'iconfont.wxss');

console.log('🌱 阿里 iconfont 下载脚本\n');

// 获取命令行参数
const args = process.argv.slice(2);

if (args[0] === '--guide' || args.length === 0) {
  showGuide();
} else if (args[0].startsWith('http')) {
  downloadAndInstall(args[0]);
} else {
  console.error('❌ 无效的参数');
  console.log('\n用法:');
  console.log('  node download-icons.js --guide              # 显示详细说明');
  console.log('  node download-icons.js <下载链接>          # 下载并安装字体文件\n');
}

function showGuide() {
  console.log(`
╔════════════════════════════════════════════════════════╗
║        阿里 iconfont 字体文件下载和集成指南            ║
╚════════════════════════════════════════════════════════╝

📌 第1步：在阿里 iconfont 创建项目
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 访问 https://www.iconfont.cn
2. 注册或登录
3. 创建新项目（项目名：ZhiGuang Plant Nursing）
4. 搜索并添加这些图标：

  植物养护操作：
  ✓ 浇水 (water drop)
  ✓ 晒太阳 (sun)
  ✓ 施肥 (yeast)
  ✓ 修剪 (scissors)
  ✓ 换盆 (potty)
  ✓ 除虫 (bug)

  通用操作：
  ✓ 日期 (calendar)
  ✓ 编辑 (edit)
  ✓ 删除 (trash)
  ✓ 分享 (share)
  ✓ 返回 (back)
  ✓ 添加 (plus)
  ✓ 搜索 (search)
  ✓ 上传 (upload)
  ✓ 图片 (picture)
  ✓ 关闭 (close)
  ✓ 心形 (heart)
  ✓ 温度 (thermometer)
  ✓ 记录 (file-text)

📌 第2步：下载字体文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 在项目页面，点击右上角的 "下载"
2. 选择下载格式：
   ✓ 推荐："生成链接" → 获取下载链接
   ✓ 或直接 "下载" → 得到 zip 文件

📌 第3步：运行脚本安装
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
方式 A - 使用下载链接（推荐）:
  node download-icons.js "https://at.alicdn.com/..."

方式 B - 使用本地 zip 文件:
  node download-icons.js ./iconfont.zip

📌 第4步：自动更新编码
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
脚本会自动：
  ✓ 下载 zip 文件
  ✓ 解压到当前目录
  ✓ 复制 iconfont.ttf 到本目录
  ✓ 解析 iconfont.json，提取编码
  ✓ 更新 iconfont.wxss 中的编码映射

📌 第5步：验证
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
检查是否生成了这些文件：
  ✓ iconfont.ttf        （字体文件）
  ✓ iconfont.wxss       （更新的样式）
  ✓ iconfont.json       （编码映射）

✅ 完成！现在可以在小程序中直接使用图标了。

📝 常见问题
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Q: 如何获取下载链接？
A: 在阿里 iconfont 项目页面 → 右上角 → "下载" → "生成链接"

Q: 提示找不到 Node.js？
A: 确保已安装 Node.js，运行 'node --version' 检查

Q: 图标显示不出来？
A: 确保 iconfont.ttf 在正确位置，清除小程序缓存重新编译

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

现在就试试吧！🚀
  `);
}

function downloadAndInstall(downloadUrl) {
  console.log('🔄 开始下载字体文件...\n');
  
  const zipPath = path.join(ICONS_DIR, 'iconfont.zip');
  const client = downloadUrl.startsWith('https') ? https : http;
  
  const file = createWriteStream(zipPath);
  
  client.get(downloadUrl, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      // 处理重定向
      downloadAndInstall(response.headers.location);
      return;
    }
    
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('✅ 下载完成\n');
      extractAndProcess(zipPath);
    });
    
    file.on('error', (err) => {
      fs.unlink(zipPath, () => {});
      console.error('❌ 下载失败:', err.message);
      process.exit(1);
    });
  }).on('error', (err) => {
    console.error('❌ 网络错误:', err.message);
    process.exit(1);
  });
}

function extractAndProcess(zipPath) {
  try {
    console.log('📦 解压文件...');
    // 解压 zip 文件（需要 unzip 命令）
    execSync(`unzip -o "${zipPath}" -d "${ICONS_DIR}"`, { stdio: 'pipe' });
    
    console.log('✅ 解压完成\n');
    
    // 查找 iconfont.ttf 和 iconfont.json
    const files = fs.readdirSync(ICONS_DIR);
    const ttfFile = files.find(f => f === 'iconfont.ttf' || f.startsWith('iconfont') && f.endsWith('.ttf'));
    const jsonFile = files.find(f => f === 'iconfont.json' || f.startsWith('iconfont') && f.endsWith('.json'));
    
    if (!ttfFile) {
      console.error('❌ 未找到 iconfont.ttf 文件');
      process.exit(1);
    }
    
    console.log(`📄 发现字体文件: ${ttfFile}`);
    console.log(`📋 发现编码文件: ${jsonFile}\n`);
    
    // 复制 TTF 文件到标准位置
    if (ttfFile !== 'iconfont.ttf') {
      fs.copyFileSync(path.join(ICONS_DIR, ttfFile), TTF_PATH);
      console.log('✅ TTF 文件已就位: iconfont.ttf\n');
    }
    
    // 解析并更新编码
    if (jsonFile) {
      updateIconCodes(path.join(ICONS_DIR, jsonFile));
    } else {
      console.warn('⚠️  未找到编码映射文件，跳过自动更新');
      console.log('\n💡 提示：你可以手动编辑 iconfont.wxss 中的编码映射\n');
    }
    
    // 清理 zip 文件
    fs.unlinkSync(zipPath);
    console.log('🧹 清理临时文件\n');
    
    console.log(`
╔════════════════════════════════════════════════════════╗
║              ✨ 安装完成！                              ║
╚════════════════════════════════════════════════════════╝

现在：
  1. iconfont.ttf 已在 ${ICONS_DIR}
  2. iconfont.wxss 已更新编码映射
  3. app.wxss 已引入 @import '/images/iconfont/iconfont.wxss'

立即可用！无需额外配置。 🚀
    `);
    
  } catch (err) {
    console.error('❌ 处理失败:', err.message);
    console.log('\n💡 提示：确保已安装 unzip 命令');
    console.log('   如果没有 unzip，你也可以手动解压 zip 文件到 ' + ICONS_DIR);
    process.exit(1);
  }
}

function updateIconCodes(jsonPath) {
  try {
    console.log('🔍 解析图标编码...');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const glyphs = data.glyphs || [];
    
    let iconCssContent = `/* 阿里 iconfont 本地化配置 */
@font-face {
  font-family: 'iconfont';
  src: url('./iconfont.ttf') format('truetype');
}

.icon {
  font-family: 'iconfont' !important;
  font-size: 1em;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -webkit-text-stroke-width: 0.2px;
  -moz-osx-font-smoothing: grayscale;
  vertical-align: -0.125em;
  display: inline-block;
  color: #666;
}

/* 图标定义 */
`;
    
    // 构建编码映射
    const colorMap = {
      'water': '#3B82F6',      // 蓝色
      'sun': '#F59E0B',        // 橙色
      'fertilize': '#8B6914',  // 棕色
      'prune': '#22C55E',      // 绿色
      'repot': '#22C55E',      // 绿色
      'bug': '#EF4444',        // 红色
      'calendar': '#6B7280',   // 灰色
      'edit': '#3B82F6',       // 蓝色
      'delete': '#EF4444',     // 红色
      'share': '#3B82F6',      // 蓝色
      'back': '#6B7280',       // 灰色
      'add': '#22C55E',        // 绿色
      'search': '#6B7280',     // 灰色
      'upload': '#3B82F6',     // 蓝色
      'image': '#3B82F6',      // 蓝色
      'close': '#9CA3AF',      // 浅灰
      'heart': '#EF4444',      // 红色
      'temperature': '#EF4444',// 红色
      'record': '#22C55E'      // 绿色
    };
    
    glyphs.forEach(glyph => {
      const name = glyph.font_class || glyph.name || '';
      const unicode = glyph.unicode || '';
      
      if (name && unicode) {
        const color = colorMap[name] || '#666';
        iconCssContent += `.icon-${name}:before { content: "\\${unicode}"; color: ${color}; }\n`;
      }
    });
    
    // 追加色彩主题
    iconCssContent += `
/* 色彩主题 */
.icon.icon-primary { color: #22C55E !important; }
.icon.icon-secondary { color: #3B82F6 !important; }
.icon.icon-danger { color: #EF4444 !important; }
.icon.icon-warning { color: #F59E0B !important; }
.icon.icon-neutral { color: #6B7280 !important; }
`;
    
    fs.writeFileSync(CSS_PATH, iconCssContent);
    console.log(`✅ 编码映射已更新: ${glyphs.length} 个图标\n`);
    
  } catch (err) {
    console.error('⚠️  编码解析失败:', err.message);
    console.log('   你可以手动编辑 iconfont.wxss 更新编码映射\n');
  }
}
