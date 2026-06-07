const assert = require("node:assert/strict");
const test = require("node:test");
const { matchProducts, extractDemands, constants } = require("../src/recommendation");

function analysis(overrides) {
  return {
    isValidFace: true,
    skinType: "未知",
    issues: [],
    overallScore: 7,
    summary: "测试输入",
    ...overrides,
  };
}

function assertBasicRecommendations(results, topN = 6) {
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  assert.ok(results.length <= topN);

  for (const item of results) {
    assert.equal(typeof item.score, "number");
    assert.ok(item.score >= 0 && item.score <= 100);
    assert.ok(item.reason.length > 0);
    assert.ok(item.product.id);
    assert.ok(Array.isArray(item.warnings));
    assert.ok(item.routineStep);
  }

  for (let index = 1; index < results.length; index += 1) {
    assert.ok(results[index - 1].score >= results[index].score);
  }
}

test("油皮出油痘痘场景命中控油抗痘，并避免单一面霜霸榜", () => {
  const results = matchProducts({
    analysisResult: analysis({
      skinType: "油皮",
      issues: [
        { type: "出油", severity: "中等", tags: ["控油"] },
        { type: "痘痘", severity: "中等", tags: ["祛痘", "消炎"] },
      ],
    }),
  });

  assertBasicRecommendations(results);
  assert.ok(results.some((item) => item.matchedConcerns.some((tag) => ["出油", "痘痘", "闭口"].includes(tag))));
  assert.ok(results.some((item) => ["洁面", "精华液"].includes(item.product.category)));
  assert.ok(results.filter((item) => item.product.category === "面霜").length <= 2);
});

test("干皮干燥细纹场景推荐保湿抗老相关品类", () => {
  const results = matchProducts({
    analysisResult: analysis({
      skinType: "干皮",
      issues: [
        { type: "干燥", severity: "严重", tags: ["补水", "保湿"] },
        { type: "细纹", severity: "中等", tags: ["抗老", "紧致"] },
      ],
    }),
  });

  assertBasicRecommendations(results);
  assert.ok(results.some((item) => item.matchedConcerns.includes("干燥缺水")));
  assert.ok(results.some((item) => item.matchedConcerns.includes("细纹")));
  assert.ok(results.some((item) => ["面霜", "乳液", "精华液"].includes(item.product.category)));
});

test("敏感皮屏障受损场景每条结果都有耐受提醒", () => {
  const results = matchProducts({
    analysisResult: analysis({
      skinType: "敏感皮",
      issues: [
        { type: "泛红", severity: "中等", tags: ["舒缓"] },
        { type: "屏障受损", severity: "严重", tags: ["修护"] },
      ],
    }),
  });

  assertBasicRecommendations(results);
  assert.ok(results.some((item) => item.matchedConcerns.some((tag) => ["泛红敏感", "屏障受损"].includes(tag))));
  assert.ok(results.every((item) => item.warnings.includes(constants.SENSITIVE_WARNING)));
});

test("暗沉色斑防晒场景优先精华或防晒", () => {
  const results = matchProducts({
    analysisResult: analysis({
      skinType: "中性皮",
      issues: [
        { type: "暗沉", severity: "中等", tags: ["美白", "提亮"] },
        { type: "色斑", severity: "轻微", tags: ["淡斑", "防晒"] },
      ],
    }),
  });

  assertBasicRecommendations(results);
  assert.ok(results.some((item) => item.matchedConcerns.some((tag) => ["暗沉", "色斑", "日常护理"].includes(tag))));
  assert.ok(results.some((item) => ["防晒", "精华液"].includes(item.product.category)));
});

test("未知肤质和空标签不崩溃，并返回兜底推荐", () => {
  const results = matchProducts({
    analysisResult: analysis({
      skinType: "未知",
      issues: [],
    }),
  });

  assertBasicRecommendations(results);
  assert.ok(results.some((item) => item.warnings.includes(constants.FALLBACK_WARNING)));
});

test("预算过低时返回最接近预算的兜底推荐", () => {
  const results = matchProducts({
    budget: 1,
    analysisResult: analysis({
      skinType: "干皮",
      issues: [{ type: "干燥", severity: "中等", tags: ["补水"] }],
    }),
  });

  assertBasicRecommendations(results);
  assert.ok(results.some((item) => item.warnings.includes(constants.FALLBACK_WARNING)));
});

test("无效人脸不推荐产品", () => {
  const results = matchProducts({
    analysisResult: {
      isValidFace: false,
      invalidReason: "不是人脸",
    },
  });

  assert.deepEqual(results, []);
});

test("需求抽取覆盖 AI 标签映射和问题类型直连", () => {
  const demands = extractDemands(
    analysis({
      skinType: "混合皮",
      issues: [
        { type: "毛孔粗大", severity: "轻微", tags: ["清洁"] },
        { type: "暗沉", severity: "中等", tags: ["提亮"] },
      ],
    })
  );

  assert.equal(demands.skinType, "混合性");
  assert.ok(demands.concerns.includes("毛孔粗大"));
  assert.ok(demands.concerns.includes("黑头"));
  assert.ok(demands.concerns.includes("出油"));
  assert.ok(demands.concerns.includes("暗沉"));
  assert.ok(demands.concerns.includes("色斑"));
});
