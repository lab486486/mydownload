#!/usr/bin/env python3
from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SIZE = 48


def icons():
    found = set()
    for md in (ROOT / "src/content/software").glob("*.md"):
        match = re.search(r'^icon:\s*"([^"]+)"', md.read_text(), re.M)
        if match:
            found.add(match.group(1))
    return found


def convert(src: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as image:
        image = image.convert("RGBA")
        image.thumbnail((SIZE, SIZE), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        x = (SIZE - image.width) // 2
        y = (SIZE - image.height) // 2
        canvas.paste(image, (x, y), image)
        canvas.save(dest, "WEBP", quality=78, method=4)


def main():
    made = 0
    skipped = 0
    for href in sorted(icons()):
        if not href.startswith("/uploads/"):
            skipped += 1
            continue
        src = PUBLIC / href.lstrip("/")
        dest = PUBLIC / "thumbs" / href[len("/uploads/") :].rsplit(".", 1)[0]
        dest = dest.with_suffix(".webp")
        if not src.exists():
            print("missing", href)
            skipped += 1
            continue
        convert(src, dest)
        made += 1
    print(f"thumbs={made} skipped={skipped}")


if __name__ == "__main__":
    main()
