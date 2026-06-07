"""Lightweight skin-image analyzer for the AI skin recommendation MVP.

This module intentionally has a no-key local fallback so the demo can always run.
In a production/competition version, you can replace `analyze_skin()` with a
multimodal model call while keeping the same output schema.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageFilter

CONCERNS = [
    "痘痘",
    "干燥缺水",
    "暗沉",
    "毛孔粗大",
    "泛红敏感",
    "出油",
    "色斑",
    "细纹",
    "屏障受损",
]

SKIN_TYPES = ["油性", "干性", "中性", "混合性", "敏感性"]


@dataclass
class SeverityRule:
    mild: float
    moderate: float
    severe: float


def _severity(value: float, rule: SeverityRule) -> str:
    if value >= rule.severe:
        return "重度"
    if value >= rule.moderate:
        return "中度"
    if value >= rule.mild:
        return "轻度"
    return "无明显"


def _to_rgb_array(image: Image.Image, max_side: int = 900) -> np.ndarray:
    img = image.convert("RGB")
    w, h = img.size
    scale = max(w, h) / max_side
    if scale > 1:
        img = img.resize((int(w / scale), int(h / scale)))
    return np.asarray(img).astype(np.float32) / 255.0


def _central_crop(arr: np.ndarray, ratio: float = 0.82) -> np.ndarray:
    h, w = arr.shape[:2]
    ch, cw = int(h * ratio), int(w * ratio)
    y0 = max(0, (h - ch) // 2)
    x0 = max(0, (w - cw) // 2)
    return arr[y0 : y0 + ch, x0 : x0 + cw]


def _skin_like_mask(arr: np.ndarray) -> np.ndarray:
    """Approximate skin-region mask without external dependencies.

    It is not a face detector. It simply reduces background influence for the
    hackathon demo and gracefully falls back to the central crop when the mask is
    too small.
    """
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    maxc = np.max(arr, axis=-1)
    minc = np.min(arr, axis=-1)
    mask = (
        (r > 0.22)
        & (g > 0.16)
        & (b > 0.10)
        & ((maxc - minc) > 0.035)
        & (r > b * 1.03)
        & (r > g * 0.84)
        & (maxc < 0.98)
        & (minc > 0.04)
    )
    if mask.mean() < 0.05:
        mask = np.ones(arr.shape[:2], dtype=bool)
    return mask


def _gradient_density(gray: np.ndarray) -> float:
    dx = np.abs(np.diff(gray, axis=1))
    dy = np.abs(np.diff(gray, axis=0))
    return float((dx.mean() + dy.mean()) / 2.0)


def _edge_density(gray: np.ndarray) -> float:
    gx = np.abs(np.diff(gray, axis=1))
    gy = np.abs(np.diff(gray, axis=0))
    dx = np.pad(gx, ((0, 0), (0, 1)), mode="edge")
    dy = np.pad(gy, ((0, 1), (0, 0)), mode="edge")
    edges = (dx + dy) > 0.11
    return float(edges.mean())


def _score_metrics(image: Image.Image) -> Tuple[Dict[str, float], Dict[str, Any]]:
    arr = _central_crop(_to_rgb_array(image))
    mask = _skin_like_mask(arr)
    pixels = arr[mask]
    if pixels.size == 0:
        pixels = arr.reshape(-1, 3)
        mask = np.ones(arr.shape[:2], dtype=bool)

    r, g, b = pixels[:, 0], pixels[:, 1], pixels[:, 2]
    maxc = np.max(pixels, axis=1)
    minc = np.min(pixels, axis=1)
    value = maxc
    saturation = (maxc - minc) / np.clip(maxc, 1e-6, None)
    gray_full = np.dot(arr, [0.299, 0.587, 0.114])
    gray = gray_full[mask]

    brightness = float(value.mean())
    sat_mean = float(saturation.mean())
    redness_index = float(np.mean(np.clip((r - 0.82 * g - 0.18 * b), 0, 1)))
    red_area_ratio = float(np.mean((r > g + 0.10) & (r > b + 0.13) & (saturation > 0.22)))
    highlight_ratio = float(np.mean((value > 0.86) & (saturation < 0.22)))
    low_moisture_proxy = float(np.mean((value < 0.48) & (saturation < 0.38)))
    tone_std = float(np.std(gray))
    grad = _gradient_density(gray_full)
    edges = _edge_density(gray_full)
    median_v = float(np.median(value))
    dark_spot_ratio = float(np.mean((value < median_v - 0.16) & (saturation > 0.16)))

    # Map low-level metrics into concern scores in [0, 1].
    metrics = {
        "痘痘": min(1.0, red_area_ratio * 18 + redness_index * 1.6),
        "泛红敏感": min(1.0, red_area_ratio * 10 + redness_index * 2.4),
        "出油": min(1.0, highlight_ratio * 9 + max(0, brightness - 0.68) * 1.2),
        "干燥缺水": min(1.0, low_moisture_proxy * 2.6 + max(0, 0.035 - highlight_ratio) * 4 + grad * 2.1),
        "暗沉": min(1.0, max(0, 0.62 - brightness) * 1.8 + max(0, 0.27 - sat_mean) * 0.8),
        "毛孔粗大": min(1.0, grad * 4.0 + tone_std * 1.7 + red_area_ratio * 2.0),
        "色斑": min(1.0, dark_spot_ratio * 7 + tone_std * 1.4),
        "细纹": min(1.0, edges * 3.0 + grad * 2.0),
        "屏障受损": min(1.0, red_area_ratio * 6 + redness_index * 1.6 + low_moisture_proxy * 0.9),
    }
    debug = {
        "brightness": round(brightness, 3),
        "saturation": round(sat_mean, 3),
        "red_area_ratio": round(red_area_ratio, 3),
        "redness_index": round(redness_index, 3),
        "highlight_ratio": round(highlight_ratio, 3),
        "texture_gradient": round(grad, 3),
        "tone_std": round(tone_std, 3),
        "skin_mask_ratio": round(float(mask.mean()), 3),
    }
    return metrics, debug


def _infer_skin_type(metrics: Dict[str, float], user_skin_type: str = "自动判断") -> str:
    if user_skin_type and user_skin_type != "自动判断":
        return user_skin_type
    if metrics.get("泛红敏感", 0) >= 0.42 or metrics.get("屏障受损", 0) >= 0.45:
        return "敏感性"
    if metrics.get("出油", 0) >= 0.48 and metrics.get("干燥缺水", 0) >= 0.43:
        return "混合性"
    if metrics.get("出油", 0) >= 0.48:
        return "油性"
    if metrics.get("干燥缺水", 0) >= 0.46:
        return "干性"
    return "中性"


def _main_concerns(metrics: Dict[str, float], max_items: int = 4) -> List[str]:
    ordered = sorted(metrics.items(), key=lambda kv: kv[1], reverse=True)
    selected = [name for name, value in ordered if value >= 0.34]
    # Always keep 2 concerns so the recommender has enough signal during demos.
    if len(selected) < 2:
        selected = [name for name, _ in ordered[:2]]
    return selected[:max_items]


def analyze_skin(
    image: Image.Image,
    user_skin_type: str = "自动判断",
    age: Optional[int] = None,
    allergy_text: str = "",
) -> Dict[str, Any]:
    """Analyze an uploaded face/skin image and return a structured report.

    The returned schema is designed to be compatible with an actual multimodal
    model response, so teams can replace the internal implementation later.
    """
    if image is None:
        raise ValueError("请先上传一张面部或局部肌肤图片。")

    metrics, debug = _score_metrics(image)
    if age is not None and age >= 35:
        metrics["细纹"] = min(1.0, metrics["细纹"] + 0.14)
    if allergy_text and any(word in allergy_text for word in ["敏感", "刺痛", "泛红", "过敏"]):
        metrics["泛红敏感"] = min(1.0, metrics["泛红敏感"] + 0.18)
        metrics["屏障受损"] = min(1.0, metrics["屏障受损"] + 0.12)

    skin_type = _infer_skin_type(metrics, user_skin_type)
    concerns = _main_concerns(metrics)

    rules = {
        "痘痘": SeverityRule(0.25, 0.48, 0.72),
        "干燥缺水": SeverityRule(0.30, 0.52, 0.74),
        "暗沉": SeverityRule(0.24, 0.46, 0.68),
        "毛孔粗大": SeverityRule(0.30, 0.52, 0.74),
        "泛红敏感": SeverityRule(0.24, 0.46, 0.70),
        "出油": SeverityRule(0.28, 0.50, 0.72),
        "色斑": SeverityRule(0.25, 0.48, 0.70),
        "细纹": SeverityRule(0.30, 0.52, 0.74),
        "屏障受损": SeverityRule(0.28, 0.50, 0.72),
    }
    severity = {name: _severity(metrics[name], rules[name]) for name in concerns}

    region_hint = {
        "T区": [c for c in concerns if c in ["出油", "毛孔粗大", "黑头"]],
        "两颊": [c for c in concerns if c in ["干燥缺水", "泛红敏感", "屏障受损", "色斑"]],
        "眼周/额头": [c for c in concerns if c in ["细纹", "暗沉"]],
    }
    region_hint = {k: v for k, v in region_hint.items() if v}

    summary = f"初步判断为{skin_type}肤质，主要关注：" + "、".join(concerns) + "。"
    notes = [
        "该分析基于上传图片的颜色、亮度、纹理和红区比例等特征生成，用于演示与护肤参考。",
        "拍摄光线、滤镜、妆容和压缩会影响结果；建议在自然光下素颜拍摄。",
    ]
    if debug["skin_mask_ratio"] < 0.12:
        notes.append("图片中可识别的肤色区域较少，建议更换更清晰、正对面部的照片。")

    return {
        "skin_type": skin_type,
        "concerns": concerns,
        "severity": severity,
        "region_hint": region_hint,
        "score": {k: round(float(v), 3) for k, v in metrics.items()},
        "summary": summary,
        "notes": notes,
        "debug_metrics": debug,
        "disclaimer": "本工具仅供护肤参考，不构成医疗诊断或治疗建议；如有严重皮肤问题，请咨询皮肤科医生。",
    }
