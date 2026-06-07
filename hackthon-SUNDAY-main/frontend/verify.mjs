import { spawn } from "node:child_process";

const port = Number(process.argv[2] || 5174);
const server = spawn(process.execPath, ["server.mjs", String(port)], {
  cwd: new URL(".", import.meta.url),
  stdio: "pipe",
});

async function waitFor(url, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ok(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}

try {
  const base = `http://localhost:${port}`;
  await waitFor(`${base}/frontend/index.html`);

  const html = await (await ok(`${base}/frontend/index.html`)).text();
  const css = await (await ok(`${base}/frontend/styles.css`)).text();
  const appJs = await (await ok(`${base}/frontend/js/app.js`)).text();
  const products = await (await ok(`${base}/src/data/jd_skincare_products.json`)).json();
  await ok(`${base}/project/skin_recommendation_mvp/examples/skin_01.png`);

  for (const text of ["开始分析并推荐", "SkinAnalysisResult", "ProductRecommendation", "早间流程"]) {
    if (!html.includes(text)) throw new Error(`Missing UI contract text: ${text}`);
  }
  for (const selector of [".hero", ".workspace", ".product-card", ".routine-section"]) {
    if (!css.includes(selector)) throw new Error(`Missing style selector: ${selector}`);
  }
  for (const token of ["matchProducts", "analyzeSkin", "renderProducts", "renderRoutine"]) {
    if (!appJs.includes(token)) throw new Error(`Missing app token: ${token}`);
  }
  if (products.length < 200) throw new Error(`Product data too small: ${products.length}`);

  console.log(
    JSON.stringify(
      {
        frontend: "ok",
        productCount: products.length,
        url: `${base}/frontend/index.html`,
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
}
