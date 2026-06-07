from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import gradio as gr
from PIL import Image

from recommender import ROUTINE_ORDER, recommend_products
from skin_analyzer import analyze_skin

BASE_DIR = Path(__file__).resolve().parent
EXAMPLE_DIR = BASE_DIR / "examples"
DISCLAIMER = "本工具仅供护肤参考，不构成医疗诊断或治疗建议；如有严重皮肤问题，请咨询皮肤科医生。"


def _safe_age(age_value: Any) -> int | None:
    try:
        if age_value in (None, ""):
            return None
        age = int(float(age_value))
        return age if 1 <= age <= 120 else None
    except Exception:
        return None


def _render_analysis_md(analysis: Dict[str, Any]) -> str:
    severity_lines = "\n".join(
        f"- **{k}**：{v}（分数 {analysis.get('score', {}).get(k, '-') }）" for k, v in analysis.get("severity", {}).items()
    )
    region = analysis.get("region_hint") or {}
    if region:
        region_lines = "\n".join(f"- **{area}**：" + "、".join(items) for area, items in region.items())
    else:
        region_lines = "- 暂无明显区域提示"
    notes = "\n".join(f"- {n}" for n in analysis.get("notes", []))
    return f"""
## 肌肤状态报告

**结论**：{analysis.get('summary', '')}

**肤质判断**：{analysis.get('skin_type', '未知')}

**主要问题与程度**：
{severity_lines}

**区域提示**：
{region_lines}

**说明**：
{notes}

> {DISCLAIMER}
"""


def _product_card_md(product: Dict[str, Any]) -> str:
    ingredients = "、".join(product.get("key_ingredients", [])[:6]) or "未标注"
    concerns = "、".join(product.get("target_concerns", [])[:6]) or "基础护理"
    skins = "、".join(product.get("suitable_skin_types", [])[:6]) or "未标注"
    contra = "、".join(product.get("contraindications", [])[:2]) or "无特别禁忌"
    return f"""
### {product.get('brand', '')}｜{product.get('name', '')}

- **品类/步骤**：{product.get('category', '')} / {product.get('usage_step', '')}
- **价格**：¥{product.get('price', 0):.2f}　**评分**：{product.get('rating', '-') }　**推荐分**：{product.get('recommend_score', '-')}
- **适用肤质**：{skins}
- **目标问题**：{concerns}
- **核心成分**：{ingredients}
- **推荐理由**：{product.get('reason', '')}
- **注意事项**：{contra}
"""


def _render_recommendation_md(result: Dict[str, Any]) -> str:
    sections = ["## 推荐产品组合"]
    by_step = result.get("recommendations_by_step", {})
    for step in ROUTINE_ORDER:
        items = by_step.get(step, [])
        if not items:
            continue
        sections.append(f"\n## {step}")
        for product in items:
            sections.append(_product_card_md(product))

    sections.append("\n## 早晚护肤流程")
    routine = result.get("routine", {})
    for title, steps in routine.items():
        sections.append(f"\n### {title}")
        for idx, step in enumerate(steps, 1):
            sections.append(f"{idx}. {step}")
    sections.append(f"\n> {DISCLAIMER}")
    return "\n".join(sections)


def run_pipeline(
    image: Image.Image,
    user_skin_type: str,
    age: float,
    budget: float,
    allergy_text: str,
    selected_steps: List[str],
):
    if image is None:
        raise gr.Error("请先上传一张肌肤图片。")
    selected_steps = selected_steps or ROUTINE_ORDER
    budget_value = float(budget) if budget and budget > 0 else None
    analysis = analyze_skin(
        image=image,
        user_skin_type=user_skin_type,
        age=_safe_age(age),
        allergy_text=allergy_text or "",
    )
    rec = recommend_products(
        analysis=analysis,
        budget=budget_value,
        allergy_text=allergy_text or "",
        preferred_steps=selected_steps,
        top_k_per_step=2,
    )
    return _render_analysis_md(analysis), _render_recommendation_md(rec), analysis, rec


examples = []
if EXAMPLE_DIR.exists():
    for img in sorted(EXAMPLE_DIR.glob("skin_*.png"))[:6]:
        examples.append([str(img), "自动判断", 25, 500, "", ROUTINE_ORDER])

with gr.Blocks(title="AI 肌肤分析与护肤推荐助手", theme=gr.themes.Soft()) as demo:
    gr.Markdown(
        """
# AI 肌肤分析与护肤产品推荐助手

上传肌肤/面部图片后，系统会输出结构化肌肤报告，并从本地护肤品数据库中推荐产品组合。

**演示流程**：上传图片 → 选择预算/肤质/过敏信息 → 点击分析 → 查看推荐理由与早晚流程。
"""
    )
    with gr.Row():
        with gr.Column(scale=1):
            image = gr.Image(type="pil", label="上传面部或局部肌肤图片")
            user_skin_type = gr.Dropdown(
                choices=["自动判断", "油性", "干性", "中性", "混合性", "敏感性"],
                value="自动判断",
                label="已知肤质",
            )
            age = gr.Number(value=25, label="年龄（可选，用于细纹/抗老权重）")
            budget = gr.Number(value=500, label="单品预算上限 / 元（0 表示不限制）")
            allergy_text = gr.Textbox(
                value="",
                label="过敏/禁忌成分（可选，用逗号分隔，如：酒精,果酸）",
                placeholder="例如：酒精,果酸,烟酰胺",
            )
            selected_steps = gr.CheckboxGroup(
                choices=ROUTINE_ORDER,
                value=ROUTINE_ORDER,
                label="希望推荐的护理步骤",
            )
            btn = gr.Button("开始分析并推荐", variant="primary")
        with gr.Column(scale=2):
            analysis_md = gr.Markdown(label="肌肤分析结果")
            recommendation_md = gr.Markdown(label="推荐方案")

    with gr.Accordion("调试/结构化 JSON 输出", open=False):
        analysis_json = gr.JSON(label="Analysis JSON")
        rec_json = gr.JSON(label="Recommendation JSON")

    if examples:
        gr.Examples(
            examples=examples,
            inputs=[image, user_skin_type, age, budget, allergy_text, selected_steps],
            label="测试图片示例",
        )

    btn.click(
        fn=run_pipeline,
        inputs=[image, user_skin_type, age, budget, allergy_text, selected_steps],
        outputs=[analysis_md, recommendation_md, analysis_json, rec_json],
    )

    gr.Markdown(f"---\n{DISCLAIMER}\n\n数据隐私提示：演示建议使用赛题提供的测试图片，避免上传真实用户敏感面部照片。")

if __name__ == "__main__":
    # server_name=0.0.0.0 works for local network, Docker, and ModelScope Studio.
    demo.launch(server_name="0.0.0.0", server_port=7860)
