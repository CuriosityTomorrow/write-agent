# 2026-03-07 新角色自动检测 & UI 修复

## 新功能：Intel 新角色检测

### 背景
章节中出现的新角色（如校霸赵磊）无法自动发现，需要手动创建。本次实现让 intel extraction 自动检测新角色，在 ChapterEditor 侧边栏展示，一键添加到角色表。

### 改动

**Backend Model + Schema:**
- `ChapterIntel` 新增 `detected_new_characters` JSON 列
- `ChapterIntelResponse` 新增对应字段
- 执行了 `ALTER TABLE chapter_intels ADD COLUMN detected_new_characters JSON`

**Backend Prompt + Service:**
- `intel_extractor.py` — prompt 输出 schema 新增 `detected_new_characters` 数组，每个元素包含 `name/role/identity/first_appearance_context`
- 注意事项：仅输出不在已知角色列表中的新人物，路人甲/无名角色不输出，role 默认"龙套"
- `writing_engine.py` — `extract_chapter_intel` 保存新字段到 DB

**Frontend ChapterEditor:**
- 右侧 intel 面板新增"发现新角色"区块（emerald 绿色调）
- 按角色名过滤已存在的角色
- "添加到角色表"按钮 → `createCharacter` → invalidate characters query → 卡片消失
- import 了 `createCharacter`

**CreateWizard:**
- 角色 role 选择器新增 `<option value="龙套">龙套</option>`

## Bug 修复

### Intel 重复问题
`extract_chapter_intel` 每次创建新 ChapterIntel 但不删旧的，导致重新提取后查询仍返回旧数据。
- **修复**：提取前先查询并删除旧 intel（`db.delete(old_intel) + flush`）

### 章节删除后缓存残留
删除章节后 TanStack Query 缓存中 chapter 和 intel 数据仍在，重新创建同编号章节时可能看到旧内容。
- **修复**：`NovelDetail.tsx` 删除章节后调用 `queryClient.removeQueries` 清除对应 chapter 和 intel 缓存

### 伏笔"采纳/忽略"按钮无效
- "采纳"后端生效但卡片不消失；"忽略"按钮无 handler
- **修复**：用 `dismissedSuggestions` Set 跟踪已处理的建议，采纳/忽略后从渲染中过滤掉

## UI 改进

### 章节大纲可编辑
ChapterEditor 左侧面板的章节大纲从只读 `<p>` 改为 `<textarea>`（可拖拽调节高度）。
- 加了 `outlineEdited` 标记，只有用户实际编辑过才会在保存时发送，防止空状态覆盖数据库
- 保存时和 content、chapter_type 一起提交

### 伏笔编辑/删除
NovelDetail 伏笔追踪 tab：
- 每张伏笔卡片新增"编辑"和"删除"按钮
- 编辑：内联表单，可修改描述、类型（短/中/长线）、状态（埋设/推进中/已回收）
- 删除：确认后删除
- 后端新增 `DELETE /api/novels/{id}/foreshadowings/{fsId}` 端点

### 角色 AI 重新生成
NovelDetail 角色编辑表单新增"AI 重新生成"按钮：
- 输入修改意见 → 调用 `generateCharacter` API（带 `existing_character` 参数）
- AI 结果填充到编辑表单（不自动保存），用户检查后手动保存
- 生成后自动展开角色驱动设定区域

## 创作规划
- 新增 `docs/novel-drafts/延迟崩坏-前期剧情规划.md` — 第1-6章剧情规划、母亲之死安排
