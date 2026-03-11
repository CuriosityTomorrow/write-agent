# AI 写实风图片生成模型调研

> 目标：生成高质量写实风亚洲人物肖像，尽量少内容限制

## 结论先行

| 推荐方案 | 适合场景 | 质量 | 限制 | 成本 |
|---------|---------|-----|------|-----|
| **本地 ComfyUI + Flux Dev** | 最佳方案，零限制+最高质量 | ★★★★★ | 无 | 硬件一次性投入 |
| **Midjourney V6.1** | 方便快捷，不想折腾 | ★★★★★ | 中等 | $30/月 |
| **Flux API (fal.ai)** | MJ被过滤时的备选 | ★★★★★ | 较低 | ~$0.05/张 |
| **Leonardo AI** | 免费额度+不错质量 | ★★★★ | 中等 | 免费150token/天 |

---

## Tier 1：最佳写实质量

### 1. Flux（Black Forest Labs）— 当前写实人像之王

**模型：** Flux.1 Pro / Flux.1 Dev / Flux.1 Schnell / Flux 1.1 Pro Ultra

- **质量：** 当前写实人像的**金标准**。皮肤质感、光影、眼睛细节、手部解剖全面领先。对亚洲面孔的处理极好，没有"恐怖谷"效应
- **如何使用：**
  - **API：** [api.bfl.ml](https://api.bfl.ml)（官方），也可通过 [fal.ai](https://fal.ai)、[Replicate](https://replicate.com) 使用
  - **本地部署：** Flux.1 Dev 和 Schnell 开源，可在 ComfyUI 中运行（Dev 需 12GB+ 显存，Schnell 量化后 8GB 可跑）
- **价格：** Pro ~$0.05/张，Dev ~$0.03/张，Schnell ~$0.003/张，本地免费
- **内容限制：** API 有中等过滤；**本地部署零限制**
- **提示词技巧：**
  - 用自然语言描述，不要关键词堆砌
  - 指定相机/镜头：`shot on Sony A7IV, 85mm f/1.4, shallow depth of field`
  - 光线关键词很重要：`golden hour`、`studio Rembrandt lighting`、`soft window light`

### 2. Midjourney V6.1

- **质量：** 优秀的写实能力，略偏"精修/时尚大片"风格。V6 后亚洲面孔表现很好
- **如何使用：**
  - Discord 机器人（主要界面）
  - Web UI：[alpha.midjourney.com](https://alpha.midjourney.com)
  - 官方 API 已上线
- **价格：** Basic $10/月(~200张) | Standard $30/月(~900张) | Pro $60/月
- **内容限制：** 中等偏严。禁止 NSFW，基于关键词过滤
- **提示词技巧：**
  - `--style raw` 更写实，减少"MJ美学"滤镜
  - `--ar 2:3` 竖版人像
  - `--no illustration, painting, cartoon, 3d render`
  - `--s 50-150` 低 stylize = 更写实

---

## Tier 2：强力替代

### 3. Leonardo AI

- **质量：** PhotoReal + Phoenix 模型组合，写实人像质量很好
- **如何使用：** [leonardo.ai](https://leonardo.ai)，有 Web 和 API
- **价格：** **免费 150 token/天**（约 15-30 张） | $12-60/月
- **内容限制：** 中等，部分套餐有 NSFW 开关
- **提示词技巧：** 用 PhotoReal v2 或 Phoenix 模型，开启 Alchemy 提升质量

### 4. 本地 Stable Diffusion（ComfyUI/Forge）

**推荐模型（按写实人像质量排序）：**
1. **RealVisXL V5.0** — 最佳全能写实
2. **JuggernautXL V9/V10** — 极佳皮肤质感
3. **Haveall XL** — 亚洲面孔特化
4. **CyberRealistic**（SD 1.5 系）— 人像出色

- **如何使用：** ComfyUI 或 WebUI Forge，本地 GPU 运行
- **硬件要求：** NVIDIA 12GB+ 显存（RTX 3060 12GB 起步，4070 Ti Super/4080 理想）；Mac M2 Pro+ 也可（较慢，需 16GB+ 统一内存）
- **内容限制：** **完全没有**
- **LoRA/ControlNet：** CivitAI 上有大量社区微调模型，可精确控制风格、姿势、面部特征

### 5. Ideogram V3

- **质量：** 写实人像不错但不如 Flux/MJ
- **如何使用：** [ideogram.ai](https://ideogram.ai)
- **价格：** 免费 ~25 张/天 | $8-60/月
- **内容限制：** 中等

### 6. DALL-E 3

- **质量：** 写实人像在主流模型中最弱，偏"干净/精修"
- **内容限制：** **商业平台中最严格**，甚至比豆包更激进
- **不推荐用于你的需求**

---

## 中国平台

所有中国平台均受《生成式人工智能服务管理暂行办法》约束，必须内容过滤+实名+正能量。

| 平台 | 质量 | 限制 | 备注 |
|-----|------|------|-----|
| 可灵 Kling（快手）| 很好 | 严格 | 国产最佳写实，但过滤严 |
| 通义万相（阿里）| 好 | 严格 | DashScope API 可用 |
| 文心一格（百度）| 好 | 极严格 | 过滤最激进 |
| **哩布哩布 LiblibAI** | 取决于模型 | **较低** | 中国版 CivitAI + 云推理，限制比大厂少 |
| **吐司 Tusi.art** | 取决于模型 | **较低** | 同上，社区模型云端运行 |

**重点推荐 LiblibAI (liblibai.com) 和 Tusi.art (tusi.art)**：可以在云端运行社区微调的 SD 模型（包括写实人像），限制比大厂平台低得多，不需要本地显卡。

---

## 内容限制对比（从宽到严）

| 排名 | 平台 | 限制程度 |
|------|------|---------|
| 1 | **本地 SD/Flux (ComfyUI)** | 无 |
| 2 | **LiblibAI / 吐司** | 低 |
| 3 | **Leonardo AI** | 中等 |
| 4 | **Flux API** | 中等 |
| 5 | **Midjourney** | 中等偏严 |
| 6 | **Ideogram** | 中等偏严 |
| 7 | **可灵/通义万相** | 严格 |
| 8 | **DALL-E 3** | 很严格 |
| 9 | **豆包** | 很严格 |
| 10 | **文心一格** | 极严格 |

---

## 写实亚洲女性人像通用提示词模板

```
A [age]-year-old Chinese woman, [具体五官描述: oval face, double eyelids, fair skin],
[表情], [服装], [场景/背景].

[光线]: soft natural window light / golden hour / studio Rembrandt lighting
[相机]: Shot on Sony A7RV, 85mm f/1.4, shallow depth of field, eye-level angle

[风格修饰]: RAW photograph, unedited, natural skin texture, no retouching,
8K UHD, hyperdetailed
```

**注意：** Flux/SD 喜欢技术细节（相机参数等），Midjourney 偏好简洁有画面感的描述，DALL-E 需要明确写 `photograph not illustration`。

---

## 针对你的提示词优化

你之前的豆包提示词问题：太多描述性文字，缺少技术参数，且部分措辞触发过滤。

**Flux/Midjourney 优化版（温以宁）：**

```
A 17-year-old Chinese girl, 170cm tall, dancer physique with long lean limbs
and slender waist. Side-parted shoulder-length black hair with natural shine
and volume, similar to Android 18 from Dragon Ball Z.

Oval face with a refined jawline, subtle brow arch, large eyes with thick
lashes and slightly upturned outer corners, straight nose bridge, full lips
with defined cupid's bow. Long elegant neck, visible collarbones. Very fair
skin, no makeup, natural beauty.

Wearing black leggings and a red sports crop top, showing toned legs and waist.
Quiet, gentle expression.

Shot on Sony A7RV, 85mm f/1.4, soft natural light, shallow depth of field.
RAW photograph, 8K, hyperdetailed skin texture. --ar 2:3
```

**本地 SD (RealVisXL) 优化版：**

```
正面提示词：
(best quality, masterpiece:1.2), RAW photo, 1girl, 17yo Chinese girl,
170cm tall, dancer body type, slender waist, long legs, side-parted
shoulder-length black hair, (Android 18 hairstyle:0.6), oval face,
refined jawline, large eyes, thick eyelashes, upturned eye corners,
straight nose, full lips, cupid's bow, long neck, collarbones visible,
very fair skin, no makeup, natural beauty, wearing black leggings and
red sports crop top, gentle expression, soft natural lighting,
85mm portrait, shallow depth of field, 8K UHD

反面提示词：
(worst quality:2), (low quality:2), illustration, 3d render, cartoon,
painting, anime, drawing, deformed, ugly, blurry, bad anatomy,
bad hands, extra fingers, watermark, text
```

---

## 最终建议

1. **如果你有 NVIDIA 显卡（12GB+）**：装 ComfyUI + Flux Dev，一劳永逸，零限制最高质量
2. **如果你用 Mac**：ComfyUI + Flux Schnell 也能跑，或者用 fal.ai 的 Flux API
3. **如果不想折腾本地部署**：Midjourney $30/月 最省心，或者 LiblibAI/吐司 云端跑 SD 模型
4. **免费方案**：Leonardo AI 每天 150 token 免费额度 + Ideogram 每天 25 张免费
