# 2026-03-02: AI 辅助编辑功能

## 背景

创建小说流程调试完毕后发现：大纲生成后无法逐字段修改、各步骤缺少 AI 辅助、新建章节无 AI 大纲、小说详情页大纲只读且角色不可编辑。

## 实现内容

### 1. 后端 - 新增带上下文的字段重新生成接口

**文件:** `backend/app/services/writing_engine.py`, `backend/app/api/writing.py`, `frontend/src/services/api.ts`

新增 `regenerate_novel_field()` 函数，区别于已有的无状态 `regenerate_single_field()`：
- 从 DB 加载小说设定、大纲、角色构建压缩上下文
- 上下文压缩策略：设定各取前80字，大纲各取前100字（排除当前字段），角色紧凑格式，总量控制800字
- 支持字段：`story_background`, `main_plot`, `plot_points`, `chapter_outline`
- `chapter_outline` 特殊处理：加载已有章节列表和对应情节点

端点: `POST /api/novels/{novel_id}/generate/regenerate-field`

### 2. 创建向导 - 大纲步骤可编辑

**文件:** `frontend/src/pages/CreateWizard.tsx`

Step 4 从只读预览改为可编辑：
- `story_background` / `main_plot` 改为 textarea
- `plot_points` 每项可编辑（支持字符串和 `{title, summary}` 对象两种格式）
- 每个字段旁「重新生成」按钮 + 建议输入
- 「确认大纲」按钮调用 `updateOutline()` 保存

### 3. 小说详情页 - 大纲标签页可编辑

**文件:** `frontend/src/pages/NovelDetail.tsx`

- 新增「编辑」按钮切换编辑模式
- 编辑模式下所有大纲字段可编辑 + AI 重新生成
- 模型选择器
- 保存/取消按钮

### 4. 小说详情页 - 新建章节 AI 辅助

**文件:** `frontend/src/pages/NovelDetail.tsx`

- 章节大纲旁新增「AI 生成」按钮
- 展开后可输入建议、选择模型
- 调用 `regenerateNovelField` 的 `chapter_outline` 字段
- 后端根据小说大纲+角色+已有章节自动生成

### 5. 小说详情页 - 角色编辑

**文件:** `frontend/src/pages/NovelDetail.tsx`

- 每个角色卡片新增「编辑」按钮
- 编辑模式下可修改：name, role, identity, personality, background, golden_finger
- 调用已有的 `PUT /api/novels/{id}/characters/{char_id}`

### 6. Bug 修复 - ChapterEditor 白屏

**文件:** `frontend/src/pages/ChapterEditor.tsx`

- `timeline_events` 数据为 `{time, event}` 对象，但代码当字符串渲染导致 React 报错白屏
- 修复：判断类型后格式化为 `时间: 事件`

## 变更文件清单

| 文件 | 变更类型 |
|------|----------|
| `backend/app/services/writing_engine.py` | 新增 `regenerate_novel_field()` |
| `backend/app/api/writing.py` | 新增 `RegenerateNovelFieldRequest` 和端点 |
| `frontend/src/services/api.ts` | 新增 `regenerateNovelField()` |
| `frontend/src/pages/CreateWizard.tsx` | Step 4 可编辑 + AI 辅助 |
| `frontend/src/pages/NovelDetail.tsx` | 大纲编辑 + 章节AI + 角色编辑 |
| `frontend/src/pages/ChapterEditor.tsx` | 修复 timeline_events 渲染白屏 |
