#!/usr/bin/env python3
"""Remove reviews from data/reviews.json. Usage: drop-reviews.py productId/outletId [...]"""
import json, sys
from pathlib import Path
f = Path(__file__).resolve().parent.parent / 'data/reviews.json'
reviews = json.loads(f.read_text())
drop = set(sys.argv[1:])
kept = [r for r in reviews if f"{r['productId']}/{r['outletId']}" not in drop]
print(f'dropped {len(reviews) - len(kept)}')
f.write_text(json.dumps(kept, indent=2, ensure_ascii=False) + '\n')
