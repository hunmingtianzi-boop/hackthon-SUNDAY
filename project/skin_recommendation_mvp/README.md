# AI 肌肤分析与护肤产品推荐助手 MVP

这是一个可以直接跑通的 3 小时比赛 MVP：

- 上传肌肤图片
- 本地启发式图像分析，输出结构化肌肤状态报告
- 根据 `jd_skincare_products.json` 产品库做个性化推荐
- 展示推荐理由、成分提醒、早晚护肤流程
- 提供医疗免责与隐私提示

> 说明：为了保证无外部密钥也能演示，本项目默认使用本地图像特征分析。比赛现场如需接入多模态大模型，可以保持 `analyze_skin()` 的输出 schema 不变，把 `skin_analyzer.py` 内部逻辑替换为模型 API 调用。

## 目录结构

```text
skin_recommendation_mvp/
├── app.py                         # Gradio 前端与业务流程
├── skin_analyzer.py               # 肌肤图片分析模块
├── recommender.py                 # 产品推荐与流程生成模块
├── data/
│   └── jd_skincare_products.json  # 护肤品数据库
├── examples/                      # 测试图片
├── requirements.txt
└── README.md
```

## 本地运行

```bash
cd skin_recommendation_mvp
pip install -r requirements.txt
python app.py
```

浏览器打开：

```text
http://127.0.0.1:7860
```

## 魔搭 / ModelScope Studio 部署

1. 新建 ModelScope Studio。
2. 上传本项目所有文件。
3. 选择 Gradio 应用，入口文件为 `app.py`。
4. 依赖使用 `requirements.txt`。
5. 启动端口默认 `7860`。

## 推荐逻辑

每个产品会按以下维度打分：

1. `target_concerns` 是否匹配图片分析出的肌肤问题。
2. `suitable_skin_types` 是否匹配肤质。
3. 是否在用户预算内。
4. 京东评分 `rating`。
5. 成分方向是否与问题匹配，例如保湿修护、提亮淡斑、抗老。
6. 过敏/禁忌词命中会被过滤。

## 演示建议

三分钟路演可以按这个流程讲：

1. 我们把需求边界定义为“护肤建议助手”，不替代皮肤科诊断。
2. 用户上传测试图片，输入预算和过敏信息。
3. 系统输出肤质、主要问题、严重程度和区域提示。
4. 推荐算法从产品库中按问题、肤质、预算和评分匹配产品。
5. 页面展示推荐理由、早晚流程与成分冲突提醒。

## 免责声明

本工具仅供护肤参考，不构成医疗诊断或治疗建议；如有严重皮肤问题，请咨询皮肤科医生。
