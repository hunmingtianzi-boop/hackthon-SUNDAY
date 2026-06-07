import { analyzeImageMock } from "./mock-analysis.js";

export async function analyzeSkin({ file, profile }) {
  const apiBase = window.SKINCARE_API_BASE || localStorage.getItem("SKINCARE_API_BASE") || "";
  if (!apiBase) return analyzeImageMock(file, profile);

  try {
    const form = new FormData();
    if (file) form.append("image", file);
    form.append("user_skin_type", profile.skinType);
    form.append("age", String(profile.age || ""));
    form.append("budget", String(profile.budget || ""));
    form.append("allergy_text", profile.allergyText || "");
    for (const step of profile.selectedSteps) form.append("selected_steps", step);

    const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/analyze`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const payload = await res.json();
    return normalizeAnalysisPayload(payload);
  } catch (error) {
    console.warn("Remote analysis failed, falling back to frontend mock.", error);
    return analyzeImageMock(file, profile);
  }
}

export function normalizeAnalysisPayload(payload) {
  if (payload?.isValidFace !== undefined && Array.isArray(payload?.issues)) return payload;
  const analysis = payload?.analysis || payload?.analysisResult || payload || {};
  const severity = analysis.severity || {};
  const issues = (analysis.concerns || Object.keys(severity || {})).map((type) => ({
    type,
    severity: severity[type] || "轻微",
    area: findArea(type, analysis.region_hint || {}),
    description: `${type}：${severity[type] || "轻微"}`,
    tags: [type],
  }));

  return {
    isValidFace: analysis.isValidFace ?? true,
    skinType: analysis.skinType || analysis.skin_type || "未知",
    issues,
    overallScore: analysis.overallScore || estimateOverallScore(issues),
    summary: analysis.summary || "已完成肌肤分析。",
    raw: analysis,
  };
}

function findArea(type, regionHint) {
  for (const [area, concerns] of Object.entries(regionHint)) {
    if (Array.isArray(concerns) && concerns.includes(type)) return area;
  }
  return "全脸";
}

function estimateOverallScore(issues) {
  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === "严重" || issue.severity === "重度") return sum + 1.1;
    if (issue.severity === "中等" || issue.severity === "中度") return sum + 0.75;
    return sum + 0.38;
  }, 0);
  return Math.max(4.8, Math.round((9.4 - penalty) * 10) / 10);
}
