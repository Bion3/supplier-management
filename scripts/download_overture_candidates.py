#!/usr/bin/env python3
"""Download bounded Overture Places data and export freight/business candidates as NDJSON.

Designed for GitHub Actions, not for the Vercel request runtime. No CRM writes.
"""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
LOGISTICS = re.compile(r"freight|forwarding|logistics?|logistik|spedition|shipping|cargo|transport|warehouse|fulfillment|distribut|wholesale|großhandel|grosshandel|import|export|zoll|customs|kurier|spediteur", re.I)
RELEVANT_CATEGORIES = re.compile(r"freight|forwarding|logistics?|transportation_service|trucking|cargo|courier|shipping|warehouse|storage_facility|fulfillment|wholesale|distribut|import_export|customs_broker|supply_chain", re.I)
EXCLUDED_CATEGORIES = re.compile(r"place_of_worship|car_wash|automotive_repair|auto_repair|taxi_service|travel_agency|parking|restaurant|cafe|hotel|beauty|religious|tire_shop|fuel_station|school|hospital", re.I)
NAME_RELEVANCE = re.compile(r"\\b(freight|forwarding|logistics?|logistik|spedition|spediteur|cargo|shipping|transport|transporte|warehouse|fulfillment|distribution|wholesale|grosshandel|großhandel|import[ -]?export|customs|zoll)\\b", re.I)

def clean(value, limit=500):
    return value.strip()[:limit] if isinstance(value, str) else ""

def select_feature(obj):
    if not isinstance(obj, dict):
        return None
    x = obj.get("properties", obj)
    if not isinstance(x, dict):
        return None
    oid = clean(x.get("id") or obj.get("id"), 50)
    names = x.get("names") or {}
    name = clean((names.get("primary") if isinstance(names, dict) else "") or x.get("name"), 240)
    taxonomy = x.get("taxonomy") or {}
    fields = [
        name,
        x.get("basic_category") or "",
        taxonomy.get("primary") if isinstance(taxonomy, dict) else "",
        " ".join(taxonomy.get("hierarchy", [])) if isinstance(taxonomy, dict) and isinstance(taxonomy.get("hierarchy"), list) else "",
    ]
    primary = clean(fields[2] or fields[1], 120)
    if not UUID.fullmatch(oid) or not name or EXCLUDED_CATEGORIES.search(primary):
        return None
    # Only category-verified sector matches or strong whole-word trade terminology in the company name.
    if not (RELEVANT_CATEGORIES.search(primary) or NAME_RELEVANCE.search(name)):
        return None
    sites = x.get("websites") or []
    addresses = x.get("addresses") or []
    return {
        "id": oid,
        "name": name,
        "category": clean(fields[2] or fields[1], 120),
        "website": clean(next((v for v in sites if isinstance(v, str) and v.startswith(("https://", "http://"))), ""), 500),
        "address": clean(next((a.get("freeform", "") for a in addresses if isinstance(a, dict) and a.get("freeform")), ""), 500),
        # Don't republish personal emails or phone numbers through a public repository artifact.
        # Contact enrichment is handled later in the authorized CRM.
        "emails": [],
        "phones": [],
        "sources": [{"dataset":clean(s.get("dataset"), 100), "license":clean(s.get("license"), 80)}
                    for s in (x.get("sources") or [])[:6] if isinstance(s, dict)]
    }

def validate_bbox(text):
    parts = [float(v) for v in text.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox requires west,south,east,north")
    west, south, east, north = parts
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("invalid bbox coordinates")
    if east - west > 0.6 or north - south > 0.6:
        raise ValueError("area too large; divide the city into smaller zones")
    return text

def convert(source, output, limit):
    seen = set()
    matched = total = 0
    with open(source, "r", encoding="utf-8") as file, open(output, "w", encoding="utf-8") as out:
        # Overture's geojsonseq can contain one GeoJSON Feature per line.
        for line in file:
            line = line.strip().lstrip("\x1e")
            if not line:
                continue
            obj = json.loads(line)
            total += 1
            item = select_feature(obj)
            if item and item["id"] not in seen:
                seen.add(item["id"])
                out.write(json.dumps(item, ensure_ascii=False) + "\n")
                matched += 1
                if matched >= limit:
                    break
    return {"scanned": total, "matched": matched, "limit": limit}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", default="9.75,53.40,10.33,53.72")
    parser.add_argument("--city", default="hamburg")
    parser.add_argument("--max", type=int, default=500)
    parser.add_argument("--output-dir", default="overture-output")
    args = parser.parse_args()
    bbox = validate_bbox(args.bbox)
    if not re.fullmatch(r"[a-zA-Z0-9_-]{2,40}", args.city):
        raise ValueError("invalid city slug")
    if not 1 <= args.max <= 5000:
        raise ValueError("max must be 1 to 5000")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "places.geojsonseq"
        subprocess.run(["overturemaps", "download", f"--bbox={bbox}", "-f", "geojsonseq", "--type=place", "-o", str(raw)], check=True, timeout=900)
        filename = output / f"{args.city}-freight-candidates.ndjson"
        metrics = convert(raw, filename, args.max)
        (output / f"{args.city}-manifest.json").write_text(json.dumps({"city": args.city, "bbox": bbox, **metrics, "source": "Overture Maps", "license_check": "Review upstream source licenses before reuse"}, indent=2), encoding="utf-8")
        print(json.dumps(metrics))

if __name__ == "__main__":
    main()
