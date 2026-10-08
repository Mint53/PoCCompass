"""Write openapi.json (source for PocCompassFront/lib/api/schema.d.ts). Run via scripts/check.sh."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import app  # noqa: E402

out = Path(__file__).resolve().parents[1] / "openapi.json"
out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
print(f"wrote {out}")
