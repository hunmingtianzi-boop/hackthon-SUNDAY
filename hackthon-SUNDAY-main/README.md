# AI 肌肤推荐模块

这是护肤产品推荐部分的独立实现，负责把 `SkinAnalysisResult` 转成前端可直接渲染的产品推荐列表。

## 使用方式

```js
const { matchProducts } = require("./src/recommendation");

const recommendations = matchProducts({
  analysisResult: {
    isValidFace: true,
    skinType: "油皮",
    issues: [
      {
        type: "痘痘",
        severity: "中等",
        area: "T区",
        description: "局部有痘痘和出油问题",
        tags: ["控油", "祛痘", "消炎"],
      },
    ],
    overallScore: 7,
    summary: "存在轻中度出油和痘痘问题。",
  },
  topN: 6,
  categoryLimit: 2,
});
```

## 返回结构

每条推荐包含：

```js
{
  product: {
    id,
    name,
    brand,
    category,
    price,
    rating,
    ingredients,
    concerns,
    skinTypes,
    usageStep,
    usageTime,
    contraindications,
    description
  },
  score,
  matchedConcerns,
  matchedSkinTypes,
  reason,
  warnings,
  routineStep
}
```

## 开发验证

```bash
npm test
```

测试覆盖油皮痘痘、干皮细纹、敏感修护、暗沉色斑、空标签兜底、预算过低兜底和无效人脸场景。
