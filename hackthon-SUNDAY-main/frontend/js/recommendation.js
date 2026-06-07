const KNOWN_CONCERNS = [
  "干燥缺水",
  "松弛",
  "细纹",
  "日常护理",
  "屏障受损",
  "色斑",
  "暗沉",
  "出油",
  "泛红敏感",
  "痘痘",
  "黑头",
  "毛孔粗大",
  "痘印",
  "闭口",
];

const DEMAND_CONCERN_MAP = {
  补水: ["干燥缺水"],
  保湿: ["干燥缺水"],
  干燥: ["干燥缺水"],
  控油: ["出油"],
  油脂: ["出油"],
  祛痘: ["痘痘", "闭口"],
  抗痘: ["痘痘", "闭口"],
  消炎: ["痘痘", "泛红敏感"],
  修护: ["屏障受损", "泛红敏感"],
  舒缓: ["屏障受损", "泛红敏感"],
  美白: ["暗沉", "色斑"],
  提亮: ["暗沉", "色斑"],
  淡斑: ["色斑"],
  抗老: ["细纹", "松弛"],
  抗皱: ["细纹", "松弛"],
  紧致: ["细纹", "松弛"],
  清洁: ["黑头", "毛孔粗大", "出油"],
  防晒: ["日常护理", "色斑", "暗沉"],
};

const SKIN_TYPE_MAP = {
  油皮: "油性",
  干皮: "干性",
  混合皮: "混合性",
  混油: "混合性",
  敏感皮: "敏感性",
  敏感肌: "敏感性",
  中性皮: "中性",
};

const SEVERITY_WEIGHT = {
  严重: 1.4,
  重度: 1.4,
  中等: 1.2,
  中度: 1.2,
  轻微: 1,
  轻度: 1,
};

const CATEGORY_PREFERENCES = {
  干燥缺水: ["化妆水", "乳液", "面霜", "面膜", "水乳套装"],
  细纹: ["精华液", "眼霜", "面霜"],
  松弛: ["精华液", "面霜", "眼霜"],
  出油: ["洁面", "精华液", "化妆水"],
  痘痘: ["洁面", "精华液", "化妆水"],
  闭口: ["洁面", "精华液", "化妆水"],
  黑头: ["洁面", "清洁护理", "精华液"],
  毛孔粗大: ["洁面", "精华液", "化妆水"],
  泛红敏感: ["乳液", "面霜", "精华液"],
  屏障受损: ["乳液", "面霜", "精华液"],
  暗沉: ["精华液", "防晒", "面霜"],
  色斑: ["精华液", "防晒", "面霜"],
  日常护理: ["防晒", "洁面", "乳液", "面霜"],
};

const FALLBACK_WARNING = "当前预算或标签下匹配商品较少，已补充高评分温和日常护理产品。";
const SENSITIVE_WARNING = "建议先做局部耐受测试，出现刺痛或泛红加重时暂停使用。";

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSkinType(skinType) {
  if (!skinType || skinType === "未知") return "未知";
  return SKIN_TYPE_MAP[skinType] || skinType;
}

function normalizeProduct(rawProduct) {
  return {
    id: String(rawProduct.product_id || rawProduct.id || ""),
    name: String(rawProduct.name || "未命名产品"),
    brand: String(rawProduct.brand || "未知品牌"),
    category: String(rawProduct.category || "其他"),
    price: Number.isFinite(Number(rawProduct.price)) ? Number(rawProduct.price) : 0,
    rating: Number.isFinite(Number(rawProduct.rating)) ? Number(rawProduct.rating) : 0,
    ingredients: toArray(rawProduct.key_ingredients || rawProduct.ingredients),
    concerns: toArray(rawProduct.target_concerns || rawProduct.concerns),
    skinTypes: toArray(rawProduct.suitable_skin_types || rawProduct.skinTypes),
    usageStep: String(rawProduct.usage_step || rawProduct.usageStep || rawProduct.category || "护肤"),
    usageTime: toArray(rawProduct.usage_time || rawProduct.usageTime),
    contraindications: toArray(rawProduct.contraindications),
    description: String(rawProduct.description || ""),
  };
}

function expandDemandLabel(label) {
  const normalized = String(label || "").trim();
  if (!normalized) return [];
  if (KNOWN_CONCERNS.includes(normalized)) return [normalized];
  return DEMAND_CONCERN_MAP[normalized] || [];
}

function extractDemands(analysisResult = {}) {
  const concernWeights = new Map();
  const issueTypes = [];

  for (const issue of toArray(analysisResult.issues)) {
    if (!issue || typeof issue !== "object") continue;
    const weight = SEVERITY_WEIGHT[issue.severity] || 1;
    const labels = uniq([issue.type, ...toArray(issue.tags)]);
    if (issue.type) issueTypes.push(issue.type);

    for (const label of labels) {
      for (const concern of expandDemandLabel(label)) {
        concernWeights.set(concern, Math.max(concernWeights.get(concern) || 0, weight));
      }
    }
  }

  const skinType = normalizeSkinType(analysisResult.skinType);
  return {
    skinType,
    concerns: [...concernWeights.keys()],
    concernWeights,
    issueTypes: uniq(issueTypes),
    isSensitive: skinType === "敏感性" || concernWeights.has("泛红敏感") || concernWeights.has("屏障受损"),
  };
}

function calculateConcernScore(product, demands) {
  if (demands.concerns.length === 0) return { score: 0, matchedConcerns: [] };
  const productConcerns = new Set(product.concerns);
  const totalWeight = [...demands.concernWeights.values()].reduce((sum, weight) => sum + weight, 0);
  let matchedWeight = 0;
  const matchedConcerns = [];

  for (const concern of demands.concerns) {
    if (!productConcerns.has(concern)) continue;
    matchedConcerns.push(concern);
    matchedWeight += demands.concernWeights.get(concern) || 1;
  }

  return {
    score: totalWeight > 0 ? matchedWeight / totalWeight : 0,
    matchedConcerns,
  };
}

function calculateSkinTypeScore(product, skinType) {
  if (!skinType || skinType === "未知") return { score: 0.5, matchedSkinTypes: [] };
  if (product.skinTypes.includes(skinType)) return { score: 1, matchedSkinTypes: [skinType] };
  if (product.skinTypes.includes("多种肤质")) return { score: 0.65, matchedSkinTypes: ["多种肤质"] };
  return { score: 0, matchedSkinTypes: [] };
}

function calculateCategoryScore(product, concerns) {
  if (concerns.length === 0) return product.concerns.includes("日常护理") ? 0.8 : 0.3;
  const preferredCategories = uniq(concerns.flatMap((concern) => CATEGORY_PREFERENCES[concern] || []));
  if (preferredCategories.length === 0) return 0.3;
  return preferredCategories.includes(product.category) ? 1 : 0.25;
}

function calculatePriceScore(product, budget) {
  if (!budget) {
    if (product.price <= 200) return 1;
    if (product.price <= 500) return 0.75;
    if (product.price <= 1000) return 0.45;
    return 0.2;
  }
  return clamp((budget - product.price) / Math.max(budget, 1), 0, 1);
}

function calculateRiskPenalty(product, demands, allergyWords) {
  const riskText = `${product.name} ${product.description} ${product.ingredients.join(" ")} ${product.contraindications.join(" ")}`;
  let penalty = 0;

  for (const word of allergyWords) {
    if (riskText.includes(word)) penalty += 24;
  }
  if (demands.isSensitive) {
    penalty += Math.min(product.contraindications.length * 2, 6);
    if (/酸|水杨酸|AHA|BHA|视黄醇|A醇|刷酸|剥脱/.test(riskText)) penalty += 5;
  }
  return penalty;
}

function scoreProduct(product, demands, options) {
  const concern = calculateConcernScore(product, demands);
  const skinType = calculateSkinTypeScore(product, demands.skinType);
  const categoryScore = calculateCategoryScore(product, demands.concerns);
  const ratingScore = clamp(product.rating / 5, 0, 1);
  const priceScore = calculatePriceScore(product, options.budget);
  const riskPenalty = calculateRiskPenalty(product, demands, options.allergyWords);

  const score = Math.round(
    concern.score * 55 + skinType.score * 20 + categoryScore * 10 + ratingScore * 10 + priceScore * 5 - riskPenalty,
  );

  return {
    score: clamp(score, 0, 100),
    matchedConcerns: concern.matchedConcerns,
    matchedSkinTypes: skinType.matchedSkinTypes,
  };
}

function generateReason(product, matchedConcerns, matchedSkinTypes, demands) {
  const issues = demands.issueTypes.length > 0 ? demands.issueTypes.join("、") : "日常护理";
  const concerns = matchedConcerns.length > 0 ? matchedConcerns.join("、") : "日常护理";
  const ingredients = product.ingredients.length > 0 ? product.ingredients.slice(0, 3).join("、") : "温和护肤成分";
  const skinTypes =
    matchedSkinTypes.length > 0
      ? matchedSkinTypes.join("、")
      : demands.skinType && demands.skinType !== "未知"
        ? demands.skinType
        : "多种肤质";

  return `针对你的${issues}问题，这款${product.category}命中了${concerns}需求，核心成分包含${ingredients}，适合${skinTypes}使用。`;
}

function generateWarnings(product, demands, isFallback, allergyWords) {
  const warnings = [...product.contraindications];
  const riskText = `${product.name} ${product.description} ${product.ingredients.join(" ")}`;
  const allergyHits = allergyWords.filter((word) => riskText.includes(word));

  if (allergyHits.length) warnings.unshift(`命中过敏/避雷词：${allergyHits.join("、")}，请谨慎选择。`);
  if (demands.isSensitive && !warnings.includes(SENSITIVE_WARNING)) warnings.push(SENSITIVE_WARNING);
  if (isFallback && !warnings.includes(FALLBACK_WARNING)) warnings.unshift(FALLBACK_WARNING);
  return uniq(warnings).slice(0, 3);
}

function toRecommendation(product, scoreInfo, demands, options, isFallback = false) {
  return {
    product,
    score: scoreInfo.score,
    matchedConcerns: scoreInfo.matchedConcerns,
    matchedSkinTypes: scoreInfo.matchedSkinTypes,
    reason: generateReason(product, scoreInfo.matchedConcerns, scoreInfo.matchedSkinTypes, demands),
    warnings: generateWarnings(product, demands, isFallback, options.allergyWords),
    routineStep: product.usageStep,
  };
}

function sortRecommendations(a, b) {
  return b.score - a.score || b.product.rating - a.product.rating || a.product.price - b.product.price;
}

function limitByCategory(recommendations, topN, categoryLimit) {
  const selected = [];
  const categoryCounts = new Map();

  for (const recommendation of recommendations) {
    const count = categoryCounts.get(recommendation.product.category) || 0;
    if (count >= categoryLimit) continue;
    selected.push(recommendation);
    categoryCounts.set(recommendation.product.category, count + 1);
    if (selected.length >= topN) return selected.sort(sortRecommendations);
  }

  for (const recommendation of recommendations) {
    if (selected.includes(recommendation)) continue;
    selected.push(recommendation);
    if (selected.length >= topN) break;
  }

  return selected.sort(sortRecommendations);
}

function buildFallbackRecommendations(products, demands, options) {
  const preferredConcerns = demands.isSensitive ? ["屏障受损", "泛红敏感", "日常护理"] : ["日常护理", ...demands.concerns];
  const fallbackProducts = products
    .map((product) => {
      const concernBoost = product.concerns.some((concern) => preferredConcerns.includes(concern)) ? 18 : 0;
      const skinBoost = product.skinTypes.includes(demands.skinType) || product.skinTypes.includes("多种肤质") ? 10 : 0;
      const budgetPenalty =
        options.budget && product.price > options.budget
          ? Math.min(((product.price - options.budget) / Math.max(options.budget, 1)) * 12, 12)
          : 0;
      const score = clamp(Math.round(product.rating * 12 + concernBoost + skinBoost - budgetPenalty), 0, 100);
      return toRecommendation(
        product,
        {
          score,
          matchedConcerns: product.concerns.filter((concern) => preferredConcerns.includes(concern)),
          matchedSkinTypes: product.skinTypes.filter((skinType) => skinType === demands.skinType || skinType === "多种肤质"),
        },
        demands,
        options,
        true,
      );
    })
    .sort(sortRecommendations);

  return limitByCategory(fallbackProducts, options.topN, options.categoryLimit);
}

export function matchProducts(input = {}) {
  const analysisResult = input.analysisResult || {};
  if (analysisResult.isValidFace === false) return [];

  const products = toArray(input.products).map(normalizeProduct);
  const topN = Number.isFinite(Number(input.topN)) ? Math.max(1, Number(input.topN)) : 6;
  const categoryLimit = Number.isFinite(Number(input.categoryLimit)) ? Math.max(1, Number(input.categoryLimit)) : 2;
  const budget = Number.isFinite(Number(input.budget)) && Number(input.budget) > 0 ? Number(input.budget) : undefined;
  const allergyWords = String(input.allergyText || "")
    .split(/[,\s，、/]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const options = { topN, categoryLimit, budget, allergyWords };
  const demands = extractDemands(analysisResult);
  const budgetProducts = budget ? products.filter((product) => product.price <= budget) : products;

  if (budgetProducts.length === 0) return buildFallbackRecommendations(products, demands, options);

  const scored = budgetProducts
    .map((product) => toRecommendation(product, scoreProduct(product, demands, options), demands, options))
    .filter((recommendation) => recommendation.score > 0)
    .sort(sortRecommendations);

  const hasConcernMatch = scored.some((recommendation) => recommendation.matchedConcerns.length > 0);
  if (!hasConcernMatch) return buildFallbackRecommendations(budgetProducts, demands, options);

  return limitByCategory(scored, topN, categoryLimit);
}
