# 前端说明

这是按项目接口结构设计的纯前端版本，不修改后端代码。

## 运行

```powershell
cd frontend
node .\server.mjs 5173
```

打开：

```text
http://localhost:5173/frontend/index.html
```

## 接口适配

前端内部按两个结构流转：

- `SkinAnalysisResult`：`isValidFace`、`skinType`、`issues[]`、`overallScore`、`summary`
- `ProductRecommendation[]`：`product`、`score`、`matchedConcerns`、`matchedSkinTypes`、`reason`、`warnings`、`routineStep`

如果设置 `window.SKINCARE_API_BASE` 或 `localStorage.SKINCARE_API_BASE`，前端会尝试调用：

```text
POST /api/analyze
```

请求体为 `FormData`，字段包括：

- `image`
- `user_skin_type`
- `age`
- `budget`
- `allergy_text`
- `selected_steps`

接口不可用时会自动使用前端 mock 分析，推荐逻辑仍基于项目产品库。
