# 数据库更新说明 - 点赞功能

## 更新日期
2026-04-11

## 更新内容

### 1. Plants 集合字段新增

在 `plants` 集合中添加以下字段:

```javascript
{
  // ... 原有字段 ...
  
  // 新增点赞字段
  likes: []  // 数组类型，存储点赞用户的 openid
}
```

### 2. 字段说明

- **likes**: `Array<String>`
  - 存储所有对该植物点赞的用户的 openid
  - 默认为空数组 `[]`
  - 使用数组确保每个用户只能点赞一次(通过 `addToSet` 操作)
  - 点赞数 = `likes.length`
  - 判断当前用户是否点赞 = `likes.includes(currentOpenid)`

### 3. 数据库操作

#### 点赞操作
```javascript
db.collection('plants').doc(plantId).update({
  data: {
    likes: _.addToSet(openid)  // 添加到数组,自动去重
  }
})
```

#### 取消点赞操作
```javascript
db.collection('plants').doc(plantId).update({
  data: {
    likes: _.pull(openid)  // 从数组中移除
  }
})
```

### 4. 数据库权限要求

确保 `plants` 集合的权限设置允许:
- 所有用户可以读取(查看点赞数)
- 所有用户可以更新 `likes` 字段(点赞/取消点赞)

建议权限设置:
```javascript
// 读取权限: 所有用户
"read": true

// 写入权限: 仅创建者可写,但 likes 字段所有人可写
// 在云开发控制台设置字段级权限
```

### 5. 现有数据迁移(可选)

如果数据库中已有植物数据,可以执行以下操作为所有植物添加 `likes` 字段:

```javascript
// 在云开发控制台或云函数中执行
db.collection('plants').where({
  likes: _.exists(false)  // 查找没有 likes 字段的记录
}).update({
  data: {
    likes: []  // 初始化为空数组
  }
})
```

或者:不需要特别迁移,代码中已做容错处理 `plant.likes || []`

### 6. 功能特性

✅ 每个用户对每个植物只能点赞一次
✅ 可以取消点赞
✅ 实时显示点赞数
✅ 点赞状态持久化保存
✅ 支持分享后他人点赞
✅ 动画效果和视觉反馈

### 7. 注意事项

1. 确保用户已登录才能点赞
2. 使用云数据库的原子操作确保数据一致性
3. likes 数组会随着点赞数增长,但一般不会很大
4. 如需统计功能,可定期分析 likes 数据
