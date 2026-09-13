#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""대기 지시(queue) → DeepSeek 마크다운 → src/content/software."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

REPO = Path(__file__).resolve().parents[1]
QUEUE_DIR = REPO / "src" / "content" / "queue"
SOFTWARE_DIR = REPO / "src" / "content" / "software"

CATEGORIES = {"utility", "office", "media", "security", "internet", "graphics"}
OS_FIELDS = (
    ("windows", "Windows 다운로드"),
    ("macos", "macOS 다운로드"),
    ("linux", "Linux 다운로드"),
    ("android", "Android 다운로드"),
    ("ios", "iOS 다운로드"),
)

logger = logging.getLogger("publish_software")


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


def yaml_scalar(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    if value is None:
        return '""'
    text = str(value)
    if text == "":
        return '""'
    if any(ch in text for ch in ":#{}[]&*!|>'\"%@`\n"):
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def dump_frontmatter(data: dict, body: str = "") -> str:
    lines = ["---"]
    for key, value in data.items():
        if value is None:
            lines.append(f"{key}:")
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                if isinstance(item, dict):
                    first = True
                    for nested_key, nested_value in item.items():
                        prefix = "  - " if first else "    "
                        lines.append(f"{prefix}{nested_key}: {yaml_scalar(nested_value)}")
                        first = False
                else:
                    lines.append(f"  - {yaml_scalar(item)}")
            continue
        lines.append(f"{key}: {yaml_scalar(value)}")
    lines.append("---")
    if body:
        lines.append("")
        lines.append(body.rstrip() + "\n")
    else:
        lines.append("")
    return "\n".join(lines)


def parse_frontmatter(text: str) -> tuple[dict, str]:
    stripped = text.lstrip("\ufeff")
    if not stripped.startswith("---"):
        return {}, stripped
    parts = stripped.split("---", 2)
    if len(parts) < 3:
        return {}, stripped
    raw, body = parts[1], parts[2].lstrip("\n")
    data: dict = {}
    current_list: str | None = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        if current_list and line.startswith("  - "):
            if not isinstance(data.get(current_list), list):
                data[current_list] = []
            data[current_list].append(line[4:].strip().strip('"').strip("'"))
            continue
        current_list = None
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value == "":
            data[key] = ""
            current_list = key
            continue
        if value in ("true", "false"):
            data[key] = value == "true"
            continue
        data[key] = value.strip('"').strip("'")
    return data, body


def write_markdown(path: Path, data: dict, body: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump_frontmatter(data, body), encoding="utf-8")


def iter_queue_files() -> list[Path]:
    if not QUEUE_DIR.exists():
        return []
    files = []
    for path in sorted(QUEUE_DIR.glob("*.md")):
        if path.name.startswith("_") or path.name.lower() == "readme.md":
            continue
        files.append(path)
    return files


def file_stem(name: str) -> str:
    cleaned = re.sub(r"[^\w가-힣.-]+", "-", name.strip())
    return cleaned.strip("-") or "software"


def entry_slug(name: str) -> str:
    return re.sub(r"\s+", "-", name.strip()).strip("-") or "software"


def software_key(name: str) -> str:
    key = re.sub(r"[^\w가-힣]+", "", name.lower())
    return key or "software"


def existing_slugs() -> set[str]:
    slugs: set[str] = set()
    if not SOFTWARE_DIR.exists():
        return slugs
    for path in SOFTWARE_DIR.glob("*.md"):
        meta, _ = parse_frontmatter(path.read_text(encoding="utf-8"))
        slug = str(meta.get("entrySlug") or "").strip()
        if slug:
            slugs.add(slug)
    return slugs


def queue_downloads(meta: dict) -> list[dict]:
    items = []
    for key, label in OS_FIELDS:
        url = str(meta.get(key) or "").strip()
        if url:
            items.append({"os": key, "label": label, "url": url})
    return items


def strip_download_links(body: str) -> str:
    cleaned = re.sub(
        r"\[(?:Windows|macOS|Mac|Linux|Android|iOS|공식)?\s*다운로드[^\]]*\]\([^)]+\)",
        "",
        body,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def clean_markdown(text: str) -> str:
    body = (text or "").strip()
    if body.startswith("```"):
        body = re.sub(r"^```(?:markdown|md)?\s*", "", body)
        body = re.sub(r"\s*```$", "", body)
    body = body.replace("```", "")
    body = re.sub(
        r"^(?:물론입니다|알겠습니다|아래에|다음과 같이).{0,40}\n+",
        "",
        body,
        flags=re.IGNORECASE,
    )
    return strip_download_links(body)


class DeepSeekSoftwareGenerator:
    def __init__(
        self,
        api_key: str,
        model_name: str = "deepseek-v4-flash",
        base_url: str = "https://api.deepseek.com",
        timeout: int = 180,
        max_tokens: int = 8000,
    ) -> None:
        if not api_key or api_key in ("YOUR_DEEPSEEK_API_KEY_HERE",):
            raise ValueError("DEEPSEEK_API_KEY 를 설정해 주세요.")
        self.model_name = model_name.strip() or "deepseek-v4-flash"
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            timeout=timeout,
        )
        self.max_tokens = max_tokens

    def generate(self, name: str, category: str, os_labels: list[str], note: str) -> dict:
        prompt = f"""마이 다운로드(mydownload.co.kr) 소프트웨어 자료실 글을 한국어로 작성하세요.
설치 파일은 호스팅하지 않고, 공식 사이트만 안내하는 자료실입니다.

프로그램 이름: {name}
카테고리: {category}
지원 OS: {", ".join(os_labels) or "미기재"}
작성 메모: {note or "없음"}

JSON만 출력하세요.
{{
  "title": "검색에 맞는 한국어 제목. 프로그램 이름과 다운로드를 자연스럽게 포함",
  "excerpt": "120자 안팎의 한 줄 소개",
  "developer": "개발사 또는 제작사. 모르면 빈 문자열",
  "license": "프리웨어, 셰어웨어, 오픈소스 등. 확실하지 않으면 공식 사이트에서 확인",
  "rating": 4.5,
  "tags": ["태그1", "태그2"],
  "body": "마크다운 본문"
}}

본문 규칙:
- 마크다운만 사용. 코드펜스, 다운로드 버튼, 설치 파일 URL, 평점 별, 사양 표를 넣지 마세요.
- 비공식·크랙·웨어즈·토렌트 주소는 절대 만들지 마세요. 제원표와 다운로드 버튼은 사이트가 따로 붙입니다.
- 다음 제목을 이 순서로만 사용하세요.
  ## 에디터 리뷰
  ## 주요 기능 및 특징
  ## 사용자 리뷰
  ## 장점과 단점
  ## 자주하는 질문
- 장점과 단점에는 Pros, Cons 같은 영어 단어를 쓰지 마세요. 장점 목록과 단점 목록을 나누세요.
- 자주하는 질문은 아래 HTML만 사용하세요. 한 줄로 이어 붙이지 마세요.
  <details class="faq-item"><summary>질문</summary><p>답변</p></details>
- 실용적이고 차분한 자료실 문체. 과장 광고 문구는 피하세요.
- 본문은 1200자 이상.
"""
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                logger.info("DeepSeek 호출 %s/3 (%s)", attempt, self.model_name)
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": "당신은 한국어 소프트웨어 자료실 에디터입니다. JSON만 출력합니다.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=self.max_tokens,
                    temperature=0.6,
                    response_format={"type": "json_object"},
                )
                raw = (response.choices[0].message.content or "").strip()
                if raw.startswith("```"):
                    raw = re.sub(r"^```(?:json)?\s*", "", raw)
                    raw = re.sub(r"\s*```$", "", raw)
                data = json.loads(raw)
                title = str(data.get("title") or "").strip()
                body = clean_markdown(str(data.get("body") or ""))
                excerpt = str(data.get("excerpt") or "").strip()
                if not title:
                    raise ValueError("제목이 비어 있습니다.")
                if len(re.sub(r"\s+", "", body)) < 800:
                    raise ValueError(f"본문이 너무 짧습니다 ({len(body)}자).")
                rating = data.get("rating", 4.5)
                try:
                    rating_value = float(rating)
                except (TypeError, ValueError) as exc:
                    raise ValueError("평점이 숫자가 아닙니다.") from exc
                rating_value = max(1.0, min(5.0, round(rating_value, 1)))
                tags = [
                    str(tag).strip()
                    for tag in (data.get("tags") or [])
                    if str(tag).strip()
                ][:8]
                return {
                    "title": title[:80],
                    "excerpt": excerpt[:180] or f"{name} 공식 다운로드와 사용 안내.",
                    "developer": str(data.get("developer") or "").strip(),
                    "license": str(data.get("license") or "공식 사이트에서 확인").strip(),
                    "rating": rating_value,
                    "tags": tags,
                    "body": body,
                }
            except Exception as exc:
                last_error = exc
                logger.warning("DeepSeek 실패: %s", exc)
                if attempt < 3:
                    time.sleep(4)
        raise RuntimeError(f"DeepSeek 콘텐츠 생성 실패: {last_error}")


def process_item(
    path: Path,
    llm: DeepSeekSoftwareGenerator,
    dry_run: bool,
    used_slugs: set[str],
) -> bool:
    raw = path.read_text(encoding="utf-8")
    meta, _body = parse_frontmatter(raw)
    status = str(meta.get("status") or "").strip().lower()
    if status != "pending":
        logger.info("건너뜀 (%s): status=%s", path.name, status or "없음")
        return False

    name = str(meta.get("name") or "").strip()
    category = str(meta.get("category") or "").strip()
    if not name:
        raise ValueError("프로그램 이름이 없습니다.")
    if category not in CATEGORIES:
        raise ValueError(f"카테고리가 올바르지 않습니다: {category}")

    downloads = queue_downloads(meta)
    if not downloads:
        raise ValueError("공식 다운로드 주소가 없습니다.")

    slug = entry_slug(name)
    if slug in used_slugs:
        raise FileExistsError(f"같은 URL 슬러그가 이미 있습니다: {slug}")

    dest = SOFTWARE_DIR / f"{file_stem(name)}.md"
    if dest.exists():
        raise FileExistsError(f"이미 발행된 글이 있습니다: {dest.name}")

    os_values = [item["os"] for item in downloads]
    generated = llm.generate(name, category, os_values, str(meta.get("note") or ""))
    icon = str(meta.get("icon") or "").strip()
    body = generated["body"]
    if icon and f"]({icon})" not in body:
        body = f"![{name}]({icon})\n\n{body}"

    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    post_meta = {
        "title": generated["title"],
        "name": name,
        "category": category,
        "os": os_values,
        "license": generated["license"],
        "rating": generated["rating"],
        "downloads": downloads,
        "excerpt": generated["excerpt"],
        "featured": bool(meta.get("featured")),
        "date": now,
        "updated": now,
        "tags": generated["tags"],
        "entrySlug": slug,
        "legacyPath": f"/entry/{slug}/",
        "softwareKey": software_key(name),
        "hiddenFromList": False,
    }
    if generated["developer"]:
        post_meta["developer"] = generated["developer"]
    if icon:
        post_meta["icon"] = icon

    if dry_run:
        logger.info("[DRY-RUN] 발행 건너뜀: %s (%s자)", generated["title"], len(body))
        return True

    write_markdown(dest, post_meta, body)
    meta["status"] = "done"
    meta["note"] = f"발행됨: /entry/{slug}/"
    write_markdown(path, meta, "")
    used_slugs.add(slug)
    logger.info("발행 완료: %s → %s", generated["title"], dest.relative_to(REPO))
    return True


def mark_error(path: Path, message: str, dry_run: bool) -> None:
    if dry_run:
        logger.error("[DRY-RUN] %s 오류: %s", path.name, message)
        return
    raw = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(raw)
    meta["status"] = "error"
    meta["note"] = message
    write_markdown(path, meta, body)
    logger.error("%s 오류로 표시: %s", path.name, message)


def main() -> int:
    parser = argparse.ArgumentParser(description="다운로드 글 지시를 마크다운으로 발행합니다.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-posts", type=int, default=1)
    parser.add_argument("--model", type=str, default=None)
    args = parser.parse_args()

    load_dotenv(REPO / ".env")
    setup_logging()
    logger.info("다운로드 Git 발행기 시작")

    pending = []
    for path in iter_queue_files():
        meta, _ = parse_frontmatter(path.read_text(encoding="utf-8"))
        if str(meta.get("status") or "").strip().lower() == "pending":
            pending.append(path)

    if not pending:
        logger.info("대기 중인 지시가 없습니다.")
        return 0

    try:
        llm = DeepSeekSoftwareGenerator(
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            model_name=args.model or os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        )
    except ValueError as exc:
        logger.error("DeepSeek 초기화 실패: %s", exc)
        return 1

    selected = pending[: max(1, args.max_posts)]
    logger.info("대기 %s건 중 %s건 처리", len(pending), len(selected))
    used_slugs = existing_slugs()

    ok = 0
    fail = 0
    for path in selected:
        try:
            if process_item(path, llm, dry_run=args.dry_run, used_slugs=used_slugs):
                ok += 1
        except Exception as exc:
            fail += 1
            logger.exception("처리 실패: %s", path.name)
            mark_error(path, str(exc), dry_run=args.dry_run)

    logger.info("완료: 성공 %s / 실패 %s", ok, fail)
    return 1 if fail and not ok else 0


if __name__ == "__main__":
    sys.exit(main())
