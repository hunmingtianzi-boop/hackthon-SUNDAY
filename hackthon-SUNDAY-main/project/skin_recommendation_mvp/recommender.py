"""Product matching and skincare routine generation."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

DEFAULT_DATA_PATH = Path(__file__).resolve().parent / "data" / "jd_skincare_products.json"

ROUTINE_ORDER = ["洁面", "化妆水", "精华", "乳液", "面霜", "防晒"]
MORNING_STEPS = ["洁面", "化妆水", "精华", "乳液", "面霜", "防晒"]
NIGHT_STEPS = ["卸妆", "洁面", "化妆水", "精华", "乳液", "面霜", "眼霜"]

CONFLICT_GROUPS = {
    "高刺激组合": ["A醇", "视黄醇", "果酸", "水杨酸", "酸", "维生素C"],
    "敏感肌慎用": ["果酸", "水杨酸", "A醇", "视黄醇", "烟酰胺 10%"],
}


def load_products(path: Path | str = DEFAULT_DATA_PATH) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("产品数据库格式错误：根节点应为列表。")
    return data


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _field_contains(values: Iterable[str], keywords: Iterable[str]) -> List[str]:
    values = [str(v) for v in values]
    hits = []
    for kw in keywords:
        if any(kw and kw in v for v in values):
            hits.append(kw)
    return hits


def _skin_match(product_skin_types: List[str], skin_type: str) -> float:
    if not skin_type or skin_type == "自动判断":
        return 0.4
    if skin_type in product_skin_types:
        return 1.0
    if "多种肤质" in product_skin_types:
        return 0.75
    # 混合性用户通常也可参考油性/中性或干性/中性的产品。
    if skin_type == "混合性" and any(t in product_skin_types for t in ["油性", "中性", "干性"]):
        return 0.55
    if skin_type == "敏感性" and any(t in product_skin_types for t in ["干性", "中性"]):
        return 0.45
    return 0.0


def _budget_score(price: float, budget: Optional[float]) -> float:
    if budget is None or budget <= 0:
        return 0.5
    if price <= budget:
        # Cheaper within budget gets a small boost, but not too much.
        return 1.0 - min(0.35, price / budget * 0.22)
    over_ratio = price / budget - 1.0
    return max(0.0, 0.45 - over_ratio * 0.7)


def _allergy_penalty(product: Dict[str, Any], allergy_text: str) -> Tuple[float, List[str]]:
    if not allergy_text:
        return 0.0, []
    ingredients = _as_list(product.get("key_ingredients"))
    contraindications = _as_list(product.get("contraindications"))
    searchable = ingredients + contraindications + [str(product.get("description", ""))]
    allergy_keywords = [x.strip() for x in allergy_text.replace("，", ",").replace("、", ",").split(",") if x.strip()]
    hits = _field_contains(searchable, allergy_keywords)
    return (2.8 if hits else 0.0), hits


def score_product(
    product: Dict[str, Any],
    concerns: List[str],
    skin_type: str,
    budget: Optional[float],
    allergy_text: str = "",
) -> Tuple[float, Dict[str, Any]]:
    target = _as_list(product.get("target_concerns"))
    p_skin = _as_list(product.get("suitable_skin_types"))
    ingredients = _as_list(product.get("key_ingredients"))
    matched_concerns = [c for c in concerns if c in target]
    concern_score = len(matched_concerns) * 4.5

    # Semantic fallback: brightening ingredients for dark spots/dullness, repair ingredients for barrier.
    semantic_hits = []
    if any(c in concerns for c in ["暗沉", "色斑"]) and any(i in "".join(ingredients) for i in ["烟酰胺", "维生素C", "熊果苷", "传明酸", "377"]):
        semantic_hits.append("提亮淡斑成分")
    if any(c in concerns for c in ["屏障受损", "泛红敏感", "干燥缺水"]) and any(i in "".join(ingredients) for i in ["透明质酸", "神经酰胺", "泛醇", "B5", "保湿"]):
        semantic_hits.append("保湿修护成分")
    if any(c in concerns for c in ["细纹", "松弛"]) and any(i in "".join(ingredients) for i in ["胶原", "抗皱", "玻色因"]):
        semantic_hits.append("抗老支撑成分")

    skin_score = _skin_match(p_skin, skin_type) * 2.8
    rating = float(product.get("rating") or 0)
    rating_score = rating * 0.65
    price = float(product.get("price") or 0)
    budget_score = _budget_score(price, budget) * 1.5
    semantic_score = len(semantic_hits) * 0.9
    penalty, allergy_hits = _allergy_penalty(product, allergy_text)

    score = concern_score + skin_score + rating_score + budget_score + semantic_score - penalty
    details = {
        "matched_concerns": matched_concerns,
        "semantic_hits": semantic_hits,
        "skin_match": round(_skin_match(p_skin, skin_type), 2),
        "within_budget": budget is None or budget <= 0 or price <= budget,
        "allergy_hits": allergy_hits,
        "score": round(score, 3),
    }
    return score, details


def _reason(product: Dict[str, Any], details: Dict[str, Any], skin_type: str, concerns: List[str]) -> str:
    parts = []
    if details["matched_concerns"]:
        parts.append("匹配肌肤问题：" + "、".join(details["matched_concerns"]))
    if details["semantic_hits"]:
        parts.append("成分方向：" + "、".join(details["semantic_hits"]))
    p_skin = _as_list(product.get("suitable_skin_types"))
    if skin_type in p_skin or "多种肤质" in p_skin:
        parts.append(f"适合{skin_type}或多种肤质使用")
    if product.get("rating"):
        parts.append(f"用户评分 {product.get('rating')}")
    if not parts:
        parts.append("作为基础护理补充，价格和口碑相对合适")
    return "；".join(parts) + "。"


def recommend_products(
    analysis: Dict[str, Any],
    budget: Optional[float] = None,
    allergy_text: str = "",
    preferred_steps: Optional[List[str]] = None,
    top_k_per_step: int = 2,
    data_path: Path | str = DEFAULT_DATA_PATH,
) -> Dict[str, Any]:
    products = load_products(data_path)
    concerns = analysis.get("concerns", []) or []
    skin_type = analysis.get("skin_type", "自动判断")
    preferred_steps = preferred_steps or ROUTINE_ORDER

    scored = []
    for product in products:
        score, details = score_product(product, concerns, skin_type, budget, allergy_text)
        product_step = product.get("usage_step") or product.get("category") or "其他"
        if product_step == "化妆水/乳液":
            product_step = "化妆水"
        if preferred_steps and product_step not in preferred_steps:
            # Still keep high-scoring eye cream etc. for display if it directly matches.
            if score < 8:
                continue
        if details["allergy_hits"]:
            # Allergic conflicts are displayed separately but not put into final recommendations.
            continue
        row = dict(product)
        row["usage_step"] = product_step
        row["recommend_score"] = round(score, 2)
        row["reason"] = _reason(product, details, skin_type, concerns)
        row["_details"] = details
        scored.append(row)

    scored.sort(key=lambda x: x["recommend_score"], reverse=True)

    by_step: Dict[str, List[Dict[str, Any]]] = {}
    used_ids = set()
    for step in preferred_steps:
        candidates = [p for p in scored if p.get("usage_step") == step and p.get("product_id") not in used_ids]
        if not candidates and step == "乳液":
            candidates = [p for p in scored if p.get("category") == "乳液" and p.get("product_id") not in used_ids]
        chosen = candidates[:top_k_per_step]
        if chosen:
            by_step[step] = chosen
            used_ids.update(p.get("product_id") for p in chosen)

    # Fill at least 5 products if some steps have no candidates.
    flat = [p for step in preferred_steps for p in by_step.get(step, [])]
    if len(flat) < 5:
        for p in scored:
            if p.get("product_id") not in used_ids:
                step = p.get("usage_step", "其他")
                by_step.setdefault(step, []).append(p)
                used_ids.add(p.get("product_id"))
                flat.append(p)
            if len(flat) >= 5:
                break

    conflicts = detect_conflicts(flat, skin_type)
    return {
        "skin_type": skin_type,
        "concerns": concerns,
        "recommendations_by_step": by_step,
        "flat_recommendations": flat,
        "conflicts": conflicts,
        "routine": build_routine(by_step, conflicts),
    }


def detect_conflicts(products: List[Dict[str, Any]], skin_type: str = "") -> List[str]:
    ingredients_text = "、".join(
        "、".join(_as_list(p.get("key_ingredients"))) for p in products
    )
    warnings: List[str] = []
    for group_name, keys in CONFLICT_GROUPS.items():
        hits = [k for k in keys if k in ingredients_text]
        if len(hits) >= 2 and group_name == "高刺激组合":
            warnings.append("检测到可能叠加刺激的活性成分：" + "、".join(sorted(set(hits))) + "；建议不要同一晚叠加，先建立耐受。")
        if skin_type == "敏感性" and hits and group_name == "敏感肌慎用":
            warnings.append("敏感肌慎用成分：" + "、".join(sorted(set(hits))) + "；建议局部测试，泛红刺痛时停用。")
    if not warnings:
        warnings.append("未发现明显成分冲突；首次使用新产品仍建议局部耐受测试。")
    return warnings


def build_routine(by_step: Dict[str, List[Dict[str, Any]]], conflicts: List[str]) -> Dict[str, List[str]]:
    def pick_names(steps: List[str]) -> List[str]:
        routine = []
        for step in steps:
            items = by_step.get(step, [])
            if items:
                routine.append(f"{step}：{items[0]['brand']}｜{items[0]['name'][:32]}")
        return routine

    morning = pick_names(MORNING_STEPS)
    night = pick_names(NIGHT_STEPS)
    if not any(s.startswith("防晒") for s in morning):
        morning.append("防晒：白天外出必须补充防晒；若无推荐产品，可先用现有耐受的防晒。")
    return {
        "早间流程": morning,
        "晚间流程": night,
        "使用提醒": conflicts,
    }
