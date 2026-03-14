# 章节生成中断与续写功能设计

## 问题

当前章节生成流程中，用户必须等待 SSE 流完全结束 + intel 提取完成才能编辑内容。无法中途停止、修改后继续生成。

## 设计方案

### 前端（ChapterEditor.tsx）

**AbortController 中断流：**
- 生成时创建 AbortController，传入 fetch 的 signal
- "停止生成"按钮调用 abort()，generating 立即设 false，textarea 可编辑

**按钮状态：**
- 无内容 → 「生成章节」
- 生成中 → 「停止生成」
- 有内容且未在生成 → 「继续生成」+「重新生成」

**续写 append 逻辑：**
- 「继续生成」时，fullContent 初始值设为当前 content（可能被用户编辑过）
- SSE 流返回的新内容 append 到末尾
- 「重新生成」保持现有逻辑（清空 content 从头来）

**intel 提取时机调整：**
- 生成完整结束（未被中断）→ 自动提取 intel
- 被中断 → 不提取
- 保存时 → 自动提取（已有逻辑，不变）

### 后端

**API 参数扩展（api/writing.py）：**
- `POST /novels/{id}/chapters/{cid}/generate` 请求体新增可选字段 `existing_content: str | None`

**Prompt 续写指令（chapter_generator.py）：**
- 当 existing_content 非空时，在 prompt 末尾追加续写指令块：告诉模型以下是已写好的内容，从末尾处继续写，保持风格和情节连贯
- 附上完整 existing_content 文本
- 模型只输出新内容，不重复已有部分

**流式输出（writing_engine.py）：**
- 只返回新生成的部分，前端负责拼接

### 不改的部分

- ContextBuilder / 记忆系统不变
- 保存逻辑不变
- 重新生成逻辑不变
