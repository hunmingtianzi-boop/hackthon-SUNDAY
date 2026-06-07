const ISSUE_TAGS = {
  痘痘: ["祛痘", "消炎"],
  干燥缺水: ["补水", "保湿"],
  暗沉: ["提亮", "美白"],
  毛孔粗大: ["清洁", "控油"],
  泛红敏感: ["舒缓", "修护"],
  出油: ["控油", "清洁"],
  色斑: ["淡斑", "防晒"],
  细纹: ["抗老", "紧致"],
  屏障受损: ["修护", "舒缓"],
};

const REGION_MAP = {
  痘痘: "两颊/T区",
  出油: "T区",
  毛孔粗大: "T区",
  干燥缺水: "两颊",
  泛红敏感: "两颊",
  屏障受损: "两颊",
  暗沉: "全脸",
  色斑: "两颊",
  细纹: "眼周/额头",
};

export async function analyzeImageMock(file, profile) {
  const metrics = file ? await readImageMetrics(file) : fallbackMetrics(profile);
  const concerns = inferConcerns(metrics, profile);
  const skinType = profile.skinType === "自动判断" ? inferSkinType(metrics, profile) : profile.skinType;
  const issues = concerns.slice(0, 5).map((type) => ({
    type,
    severity: severityFor(type, metrics, profile),
    area: REGION_MAP[type] || "全脸",
    description: buildIssueDescription(type, metrics),
    tags: ISSUE_TAGS[type] || [type],
  }));
  const overallScore = Math.max(4.8, Math.round((9.4 - issues.reduce((sum, issue) => sum + severityPenalty(issue.severity), 0)) * 10) / 10);

  return {
    isValidFace: true,
    skinType,
    issues,
    overallScore,
    summary: `初步判断为${skinType}肤质，主要关注${concerns.join("、")}。建议优先稳定屏障与补水，再针对重点问题选择精华和防晒。`,
    raw: {
      skin_type: skinType,
      concerns,
      severity: Object.fromEntries(issues.map((issue) => [issue.type, issue.severity])),
      region_hint: groupByRegion(issues),
      score: {
        brightness: metrics.brightness,
        redness: metrics.redness,
        texture: metrics.texture,
        highlight: metrics.highlight,
        contrast: metrics.contrast,
      },
      notes: [
        "该结果为前端演示 mock，字段结构与项目接口保持一致。",
        "接入真实多模态模型后，可直接替换分析来源并复用渲染层。",
      ],
    },
  };
}

function fallbackMetrics(profile) {
  return {
    brightness: profile.skinType === "干性" ? 0.7 : 0.52,
    redness: profile.skinType === "敏感性" ? 0.58 : 0.24,
    texture: profile.skinType === "油性" || profile.skinType === "混合性" ? 0.62 : 0.34,
    highlight: profile.skinType === "油性" ? 0.68 : 0.38,
    contrast: 0.42,
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

async function readImageMetrics(file) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const size = 112;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const luminance = [];
  let brightness = 0;
  let redness = 0;
  let highlight = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luminance.push(y);
    brightness += y;
    redness += Math.max(0, r - 0.82 * g - 0.18 * b);
    if (Math.max(r, g, b) > 0.82 && Math.abs(r - g) + Math.abs(g - b) < 0.24) highlight += 1;
  }

  brightness /= luminance.length;
  redness /= luminance.length;
  highlight /= luminance.length;

  let texture = 0;
  for (let i = 1; i < luminance.length; i += 1) {
    texture += Math.abs(luminance[i] - luminance[i - 1]);
  }
  texture /= luminance.length;

  let variance = 0;
  for (const value of luminance) variance += (value - brightness) ** 2;
  const contrast = Math.sqrt(variance / luminance.length);

  return {
    brightness: round(brightness),
    redness: round(Math.min(1, redness * 4)),
    texture: round(Math.min(1, texture * 5)),
    highlight: round(Math.min(1, highlight * 5)),
    contrast: round(Math.min(1, contrast * 3)),
  };
}

function inferSkinType(metrics, profile) {
  if (profile.allergyText.includes("敏感") || metrics.redness > 0.5) return "敏感性";
  if (metrics.highlight > 0.58 && metrics.texture > 0.45) return "油性";
  if (metrics.highlight > 0.42 && metrics.brightness < 0.64) return "混合性";
  if (metrics.brightness > 0.66 && metrics.highlight < 0.38) return "干性";
  return "中性";
}

function inferConcerns(metrics, profile) {
  const scored = [
    ["泛红敏感", metrics.redness + (profile.skinType === "敏感性" ? 0.28 : 0)],
    ["出油", metrics.highlight + (profile.skinType === "油性" || profile.skinType === "混合性" ? 0.18 : 0)],
    ["毛孔粗大", metrics.texture],
    ["暗沉", Math.max(0, 0.65 - metrics.brightness) + metrics.contrast * 0.25],
    ["干燥缺水", Math.max(0, metrics.brightness - 0.58) + (profile.skinType === "干性" ? 0.28 : 0)],
    ["痘痘", metrics.redness * 0.72 + metrics.texture * 0.28],
    ["色斑", metrics.contrast],
    ["细纹", profile.age >= 35 ? 0.58 : metrics.texture * 0.58],
    ["屏障受损", metrics.redness * 0.62 + Math.max(0, metrics.brightness - 0.7)],
  ];

  for (const concern of profile.manualConcerns) {
    const item = scored.find(([name]) => name === concern);
    if (item) item[1] += 0.55;
  }

  const selected = scored
    .sort((a, b) => b[1] - a[1])
    .filter(([, score], index) => score > 0.35 || index < 2)
    .slice(0, 4)
    .map(([name]) => name);

  return [...new Set(selected)];
}

function severityFor(type, metrics, profile) {
  const heavy =
    type === "泛红敏感"
      ? metrics.redness
      : type === "出油"
        ? metrics.highlight
        : type === "毛孔粗大"
          ? metrics.texture
          : type === "暗沉"
            ? 1 - metrics.brightness
            : type === "细纹"
              ? profile.age >= 35 ? 0.58 : metrics.texture
              : Math.max(metrics.redness, metrics.texture, metrics.contrast);

  if (heavy >= 0.68) return "严重";
  if (heavy >= 0.45) return "中等";
  return "轻微";
}

function buildIssueDescription(type, metrics) {
  const templates = {
    痘痘: "局部红区与纹理波动偏高，建议选择控油、舒缓和抗痘方向。",
    干燥缺水: "画面高亮与水润度代理指标提示可能存在干燥，建议加强补水保湿。",
    暗沉: "整体亮度或均匀度偏低，建议搭配提亮精华与白天防晒。",
    毛孔粗大: "纹理指数偏高，建议温和清洁并避免过度去角质。",
    泛红敏感: "红度指数偏高，建议优先修护屏障并降低刺激性成分。",
    出油: "高光区域比例偏高，建议选择控油洁面与清爽型护理。",
    色斑: "肤色均匀度存在波动，建议提亮淡斑和稳定防晒。",
    细纹: "纹理或年龄权重提示细纹护理需求，建议关注抗老紧致。",
    屏障受损: "红度与干燥代理指标叠加，建议先修护再功效进阶。",
  };
  return templates[type] || `当前 ${type} 指标为 ${JSON.stringify(metrics)}。`;
}

function groupByRegion(issues) {
  return issues.reduce((acc, issue) => {
    acc[issue.area] = acc[issue.area] || [];
    acc[issue.area].push(issue.type);
    return acc;
  }, {});
}

function severityPenalty(severity) {
  if (severity === "严重") return 1.1;
  if (severity === "中等") return 0.75;
  return 0.38;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
