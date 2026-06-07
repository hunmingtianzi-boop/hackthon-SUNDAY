import { analyzeSkin } from "./api-client.js";
import { matchProducts } from "./recommendation.js";

const PRODUCT_URL = "../src/data/jd_skincare_products.json";
const SAMPLE_IMAGES = [
  "../project/skin_recommendation_mvp/examples/skin_01.png",
  "../project/skin_recommendation_mvp/examples/skin_02.png",
  "../project/skin_recommendation_mvp/examples/skin_03.png",
  "../project/skin_recommendation_mvp/examples/skin_04.png",
];

const state = {
  products: [],
  selectedFile: null,
  selectedPreviewUrl: "",
  selectedConcerns: new Set(),
};

const els = {
  imageInput: document.querySelector("#imageInput"),
  sampleGrid: document.querySelector("#sampleGrid"),
  previewCard: document.querySelector("#previewCard"),
  previewImage: document.querySelector("#previewImage"),
  previewName: document.querySelector("#previewName"),
  clearImage: document.querySelector("#clearImage"),
  analyzeButton: document.querySelector("#analyzeButton"),
  statusText: document.querySelector("#statusText"),
  skinType: document.querySelector("#skinType"),
  age: document.querySelector("#age"),
  budget: document.querySelector("#budget"),
  topN: document.querySelector("#topN"),
  allergyText: document.querySelector("#allergyText"),
  emptyState: document.querySelector("#emptyState"),
  resultView: document.querySelector("#resultView"),
  analysisTitle: document.querySelector("#analysisTitle"),
  analysisSummary: document.querySelector("#analysisSummary"),
  overallScore: document.querySelector("#overallScore"),
  skinTypeResult: document.querySelector("#skinTypeResult"),
  validFaceResult: document.querySelector("#validFaceResult"),
  issueCountResult: document.querySelector("#issueCountResult"),
  budgetResult: document.querySelector("#budgetResult"),
  issueList: document.querySelector("#issueList"),
  productGrid: document.querySelector("#productGrid"),
  morningRoutine: document.querySelector("#morningRoutine"),
  nightRoutine: document.querySelector("#nightRoutine"),
  analysisJson: document.querySelector("#analysisJson"),
  recommendationJson: document.querySelector("#recommendationJson"),
};

init();

async function init() {
  renderSamples();
  bindEvents();
  await loadProducts();
}

function bindEvents() {
  els.imageInput.addEventListener("change", handleUpload);
  els.clearImage.addEventListener("click", clearImage);
  els.analyzeButton.addEventListener("click", runPipeline);

  document.querySelectorAll("[data-concern]").forEach((button) => {
    button.addEventListener("click", () => {
      const concern = button.dataset.concern;
      if (state.selectedConcerns.has(concern)) {
        state.selectedConcerns.delete(concern);
        button.classList.remove("is-selected");
      } else {
        state.selectedConcerns.add(concern);
        button.classList.add("is-selected");
      }
    });
  });
}

async function loadProducts() {
  els.analyzeButton.disabled = true;
  try {
    const res = await fetch(PRODUCT_URL);
    if (!res.ok) throw new Error(`产品库加载失败：${res.status}`);
    state.products = await res.json();
    els.statusText.textContent = `已加载 ${state.products.length} 条产品数据，可开始分析。`;
    els.analyzeButton.disabled = false;
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "产品库加载失败，请通过本地静态服务器打开 frontend/index.html。";
  }
}

function renderSamples() {
  els.sampleGrid.innerHTML = SAMPLE_IMAGES.map(
    (src, index) => `
      <button class="sample-button" type="button" data-src="${src}">
        <img src="${src}" alt="测试图片 ${index + 1}" />
        <span>样例 ${index + 1}</span>
      </button>
    `,
  ).join("");

  els.sampleGrid.querySelectorAll(".sample-button").forEach((button) => {
    button.addEventListener("click", () => useSample(button.dataset.src));
  });
}

async function useSample(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  state.selectedFile = new File([blob], src.split("/").at(-1), { type: blob.type || "image/png" });
  setPreview(src, `测试图片 ${src.match(/skin_(\d+)/)?.[1] || ""}`);
  els.statusText.textContent = "已选择样例图片，可以开始分析。";
}

function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.selectedFile = file;
  setPreview(URL.createObjectURL(file), file.name);
  els.statusText.textContent = "图片已上传，可以开始分析。";
}

function setPreview(src, name) {
  state.selectedPreviewUrl = src;
  els.previewImage.src = src;
  els.previewName.textContent = name || "已选择图片";
  els.previewCard.hidden = false;
}

function clearImage() {
  state.selectedFile = null;
  state.selectedPreviewUrl = "";
  els.imageInput.value = "";
  els.previewImage.removeAttribute("src");
  els.previewCard.hidden = true;
  els.statusText.textContent = `已加载 ${state.products.length} 条产品数据。`;
}

async function runPipeline() {
  if (!state.products.length) {
    els.statusText.textContent = "产品库尚未加载完成。";
    return;
  }

  els.analyzeButton.disabled = true;
  els.statusText.textContent = "正在生成 SkinAnalysisResult 与 ProductRecommendation...";

  try {
    const profile = readProfile();
    const analysisResult = await analyzeSkin({ file: state.selectedFile, profile });
    const recommendations = matchProducts({
      analysisResult,
      products: state.products,
      budget: profile.budget,
      allergyText: profile.allergyText,
      topN: profile.topN,
      categoryLimit: 2,
    });

    renderAnalysis(analysisResult, profile);
    renderIssues(analysisResult.issues);
    renderProducts(recommendations);
    renderRoutine(recommendations);
    renderJson(analysisResult, recommendations);

    els.emptyState.hidden = true;
    els.resultView.hidden = false;
    els.statusText.textContent = "分析完成，已按接口规范生成推荐结果。";
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "分析失败，请检查图片或刷新页面重试。";
  } finally {
    els.analyzeButton.disabled = false;
  }
}

function readProfile() {
  return {
    skinType: els.skinType.value,
    age: Number(els.age.value || 0),
    budget: Number(els.budget.value || 0),
    topN: Number(els.topN.value || 6),
    allergyText: els.allergyText.value.trim(),
    selectedSteps: [...document.querySelectorAll('input[name="step"]:checked')].map((input) => input.value),
    manualConcerns: [...state.selectedConcerns],
  };
}

function renderAnalysis(analysisResult, profile) {
  els.analysisTitle.textContent = `${analysisResult.skinType || "未知"}肤质状态报告`;
  els.analysisSummary.textContent = analysisResult.summary || "已完成肌肤分析。";
  els.overallScore.textContent = Number(analysisResult.overallScore || 0).toFixed(1);
  els.skinTypeResult.textContent = analysisResult.skinType || "未知";
  els.validFaceResult.textContent = analysisResult.isValidFace === false ? "否" : "是";
  els.issueCountResult.textContent = `${analysisResult.issues?.length || 0} 项`;
  els.budgetResult.textContent = profile.budget > 0 ? `¥${profile.budget}` : "不限";
}

function renderIssues(issues = []) {
  els.issueList.innerHTML = issues.length
    ? issues.map(renderIssueCard).join("")
    : `<article class="issue-card"><strong>暂无明显问题</strong><p>可按日常护理进行推荐。</p></article>`;
}

function renderIssueCard(issue) {
  return `
    <article class="issue-card">
      <div class="issue-top">
        <strong>${escapeHtml(issue.type)}</strong>
        <span class="severity">${escapeHtml(issue.severity || "轻微")}</span>
      </div>
      <span>区域：${escapeHtml(issue.area || "全脸")}</span>
      <p class="reason">${escapeHtml(issue.description || "")}</p>
      <div class="tag-row">${(issue.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function renderProducts(recommendations) {
  els.productGrid.innerHTML = recommendations.length
    ? recommendations.map(renderProductCard).join("")
    : `<article class="product-card"><h3>暂无推荐</h3><p class="reason">图片被判断为无效人脸或数据不足。</p></article>`;
}

function renderProductCard(item) {
  const product = item.product;
  return `
    <article class="product-card">
      <div class="product-top">
        <h3>${escapeHtml(product.brand)}｜${escapeHtml(product.name)}</h3>
        <span class="score-pill">${item.score} 分</span>
      </div>
      <div class="product-meta">
        <span>${escapeHtml(product.category)}</span>
        <span>${escapeHtml(item.routineStep)}</span>
        <span>¥${Number(product.price).toFixed(0)}</span>
        <span>评分 ${Number(product.rating || 0).toFixed(1)}</span>
      </div>
      <p class="reason">${escapeHtml(item.reason)}</p>
      <div class="tag-row">
        ${item.matchedConcerns.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        ${item.matchedSkinTypes.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
      ${renderWarnings(item.warnings)}
    </article>
  `;
}

function renderWarnings(warnings = []) {
  if (!warnings.length) return "";
  return `<div class="warning-row">${warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</div>`;
}

function renderRoutine(recommendations) {
  const byStep = new Map();
  for (const item of recommendations) {
    const step = normalizeStep(item.routineStep);
    if (!byStep.has(step)) byStep.set(step, item.product);
  }

  const morning = ["洁面", "化妆水", "精华", "乳液", "面霜", "防晒"];
  const night = ["洁面", "化妆水", "精华", "乳液", "面霜"];
  els.morningRoutine.innerHTML = morning.map((step) => routineItem(step, byStep.get(step))).join("");
  els.nightRoutine.innerHTML = night.filter((step) => byStep.has(step)).map((step) => routineItem(step, byStep.get(step))).join("");
}

function normalizeStep(step) {
  if (step === "精华液") return "精华";
  if (step === "化妆水/乳液") return "乳液";
  return step;
}

function routineItem(step, product) {
  const text = product ? `${step}：${product.brand} ${product.name}` : `${step}：按需选择温和产品`;
  return `<li>${escapeHtml(text)}</li>`;
}

function renderJson(analysisResult, recommendations) {
  els.analysisJson.textContent = JSON.stringify(analysisResult, null, 2);
  els.recommendationJson.textContent = JSON.stringify(recommendations, null, 2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
