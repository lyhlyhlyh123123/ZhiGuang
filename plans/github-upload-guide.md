# GitHub 代码上传指南 - dev2 分支

## 📋 目标

将当前代码上传到 GitHub 仓库的 dev2 分支：
- 仓库地址：https://github.com/lyhlyhlyh123123/ZhiGuang
- 目标分支：dev2

## 🔧 操作步骤

### 步骤 1：检查 Git 状态

```bash
# 查看当前 Git 状态
git status

# 查看当前分支
git branch

# 查看远程仓库配置
git remote -v
```

### 步骤 2：初始化仓库（如果还未初始化）

```bash
# 如果提示 "not a git repository"，需要先初始化
git init

# 添加远程仓库
git remote add origin https://github.com/lyhlyhlyh123123/ZhiGuang.git

# 验证远程仓库
git remote -v
```

### 步骤 3：创建并切换到 dev2 分支

```bash
# 方案A：如果本地没有 dev2 分支，创建新分支
git checkout -b dev2

# 方案B：如果远程已有 dev2 分支，拉取并切换
git fetch origin
git checkout -b dev2 origin/dev2

# 方案C：如果本地已有 dev2 分支，直接切换
git checkout dev2
```

### 步骤 4：添加文件到暂存区

```bash
# 添加所有文件（会自动忽略 .gitignore 中的文件）
git add .

# 或者选择性添加特定文件
git add miniprogram/
git add cloudfunctions/
git add *.md
git add *.json
git add *.js
```

### 步骤 5：提交代码

```bash
# 提交代码并添加提交信息
git commit -m "feat: 准备实施多图片上传功能

- 添加多图片功能设计方案文档
- 当前稳定版本备份
- 准备开始 dev2 分支开发
"
```

### 步骤 6：推送到远程仓库

```bash
# 首次推送到远程 dev2 分支
git push -u origin dev2

# 后续推送可以简化为
git push
```

## 🔍 常见问题处理

### 问题1：提示需要登录

如果推送时提示需要登录：

```bash
# 使用 HTTPS 方式（会提示输入用户名和密码）
git push -u origin dev2

# 或者配置 Git 凭证
git config --global user.name "你的GitHub用户名"
git config --global user.email "你的GitHub邮箱"
```

**推荐：使用 Personal Access Token (PAT)**

1. GitHub 上生成 Token：
   - 进入 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - 点击 "Generate new token"
   - 勾选 `repo` 权限
   - 生成并复制 Token

2. 推送时使用 Token（替代密码）：
   ```bash
   # 用户名：你的 GitHub 用户名
   # 密码：粘贴刚才生成的 Token
   git push -u origin dev2
   ```

### 问题2：文件太大无法推送

如果有大文件（如图片、视频）导致推送失败：

```bash
# 检查文件大小
git ls-files -z | xargs -0 du -h | sort -h -r | head -20

# 添加大文件到 .gitignore
echo "miniprogram/images/*.png" >> .gitignore
echo "miniprogram/images/*.jpg" >> .gitignore

# 重新提交
git add .gitignore
git commit --amend --no-edit
```

### 问题3：远程分支已存在且有冲突

```bash
# 先拉取远程更新
git pull origin dev2

# 如果有冲突，手动解决后
git add .
git commit -m "merge: 解决冲突"

# 再推送
git push origin dev2
```

### 问题4：想要强制覆盖远程分支（谨慎使用）

```bash
# 强制推送（会覆盖远程分支，请确认无重要代码）
git push -f origin dev2
```

## 📝 完整操作示例

### 场景：首次上传项目到 dev2 分支

```bash
# 1. 检查当前目录
cd e:/wxdevelop/projects/ZhiGuang

# 2. 初始化 Git（如果需要）
git init

# 3. 添加远程仓库
git remote add origin https://github.com/lyhlyhlyh123123/ZhiGuang.git

# 4. 创建 dev2 分支
git checkout -b dev2

# 5. 添加所有文件
git add .

# 6. 查看将要提交的文件
git status

# 7. 提交代码
git commit -m "feat: 初始化 dev2 开发分支

- 添加植物管理核心功能
- 添加日记功能
- 添加批量管理功能
- 添加反馈功能
- 准备实施多图片上传功能
"

# 8. 推送到远程
git push -u origin dev2
```

### 场景：已有 Git 仓库，只是切换到 dev2 分支

```bash
# 1. 确保在正确的目录
cd e:/wxdevelop/projects/ZhiGuang

# 2. 查看当前状态
git status

# 3. 如果有未提交的更改，先提交
git add .
git commit -m "chore: 保存当前进度"

# 4. 拉取最新的远程分支信息
git fetch origin

# 5. 切换到 dev2 分支（如果不存在则创建）
git checkout -b dev2 origin/dev2
# 或者如果远程没有 dev2，创建新分支
git checkout -b dev2

# 6. 推送到远程
git push -u origin dev2
```

## 🎯 推送前检查清单

在执行 `git push` 之前，请确认：

- [ ] 已添加 `.gitignore` 文件，排除了敏感信息
- [ ] 已删除或忽略了 `project.private.config.json`（包含个人配置）
- [ ] 已删除或忽略了云函数的 `node_modules/` 目录
- [ ] 代码中没有硬编码的密钥、Token 等敏感信息
- [ ] 所有必要的文件都已添加到暂存区
- [ ] commit 信息清晰明确

## 📦 建议的 .gitignore 配置

当前 `.gitignore` 已经包含了必要的配置，但请确认以下内容：

```gitignore
# 小程序编译文件
miniprogram_dist/
localsettings/*.json

# 开发工具配置（私有）
.vscode/
.idea/
*.swp
*.swo
*~
project.private.config.json

# 依赖包
node_modules/

# 日志文件
logs/
*.log
npm-debug.log*

# 系统文件
.DS_Store
Thumbs.db

# 临时文件
tmp/
temp/

# 云函数环境配置（可选）
cloudfunctions/**/node_modules/
cloudfunctions/**/.env
```

## 🔄 后续开发流程

上传成功后，后续开发流程：

```bash
# 1. 每次开始工作前，拉取最新代码
git pull origin dev2

# 2. 开发功能...

# 3. 提交更改
git add .
git commit -m "feat: 实现xxx功能"

# 4. 推送到远程
git push origin dev2

# 5. 功能完成后，可以合并到主分支
git checkout main
git merge dev2
git push origin main
```

## 🚀 使用 VSCode 进行 Git 操作（推荐）

VSCode 提供了可视化的 Git 操作界面：

### 方法1：使用源代码管理面板

1. 点击左侧 "源代码管理" 图标（或按 `Ctrl+Shift+G`）
2. 点击 "初始化存储库"（如果需要）
3. 在底部选择或创建 `dev2` 分支
4. 查看更改的文件列表
5. 点击 "+" 号将文件添加到暂存区
6. 在上方输入提交信息
7. 点击 "✓ 提交" 按钮
8. 点击 "..." → "推送" 推送到远程

### 方法2：使用 VSCode 终端

1. 打开终端：`` Ctrl+` ``
2. 执行上述 Git 命令

## ⚠️ 注意事项

1. **不要提交敏感信息**：
   - 微信小程序的 AppSecret
   - 云开发环境 ID（如果是私有的）
   - 个人隐私信息

2. **云函数的 node_modules**：
   - 不要提交 `cloudfunctions/*/node_modules/`
   - 只提交 `package.json`，部署时重新安装依赖

3. **提交信息规范**（建议遵循）：
   - `feat: 新功能`
   - `fix: 修复Bug`
   - `docs: 文档更新`
   - `style: 代码格式调整`
   - `refactor: 代码重构`
   - `test: 测试相关`
   - `chore: 构建/工具链相关`

4. **分支管理**：
   - `main/master`: 稳定的生产版本
   - `dev`: 开发主分支
   - `dev2`: 当前开发分支（多图片功能）
   - `feature/*`: 特性分支

## 📞 需要帮助？

如果遇到问题，请告诉我：
1. 执行的具体命令
2. 报错信息
3. 当前的 Git 状态（`git status` 的输出）

我会帮你解决！

---

**准备好了吗？请按照上述步骤操作，完成后告诉我结果！**
