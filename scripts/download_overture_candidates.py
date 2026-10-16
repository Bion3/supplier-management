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
HIGH_CATEGORIES = ('freight_forwarding','freight_and_cargo','import_export','customs_broker','wholesale','wholesaler','distributor','supplier_or_distributor','trucking','motor_freight','supply_chain')
MEDIUM_CATEGORIES = ('storage_facility','warehouse','courier_and_delivery','shipping_center','transportation_service','logistics')
EXCLUDED_CATEGORIES = re.compile(r'place_of_worship|religious|car_wash|auto(motive)?_repair|taxi_service|warehouse_club_store|retail_store|travel_agency|restaurant|cafe|hotel|beauty|tire_shop|fuel_station|school|hospital|pharmacy|self_storage',re.I)
EXCLUDED_NAMES = re.compile(r'paket\\s*shop|paketstation|packstation|parcel\\s*shop|access\\s*point|pickup\\s*point|self\\s*storage|selfstorage|onlineshop|wein-?depot|kurier.?taxi',re.I)
STRONG_NAME = re.compile(r'\\b(spedition|spediteur|freight|forwarding|logistik|logistics?|shipping|cargo|container|international(e|er|es)?|import[ -]?export|großhandel|grosshandel|wholesale|customs|zoll)\\b',re.I)
MODERATE_NAME = re.compile(r'\\b(transport(e|es)?|transporte|trading|distribution|fulfillment|lager|handelsagentur|fuhrbetrieb)\\b',re.I)
THIRD_PARTY = ('gelbeseiten.de','dasoertliche.de','11880.com','google.com','google.de','facebook.com','instagram.com','linkedin.com','yelp.com','foursquare.com','myhermes.de','dhl.de','ups.com','bing.com','linktr.ee')

def clean(value, limit=500):
    return value.strip()[:limit] if isinstance(value, str) else ""

def host_of(site):
    try:
        from urllib.parse import urlparse
        parsed=urlparse(site)
        return (parsed.hostname or '').lower().removeprefix('www.') if parsed.scheme in ('http','https') else ''
    except ValueError: return ''

def is_platform(host):
    return bool(host) and any(host==v or host.endswith('.'+v) for v in THIRD_PARTY)

def assess_feature(obj):
    if not isinstance(obj,dict): return None,'invalid'
    x=obj.get('properties',obj)
    if not isinstance(x,dict): return None,'invalid'
    oid=clean(x.get('id') or obj.get('id'),50)
    names=x.get('names') or {}
    name=clean((names.get('primary') if isinstance(names,dict) else '') or x.get('name'),240)
    taxonomy=x.get('taxonomy') or {}
    category=clean((taxonomy.get('primary') if isinstance(taxonomy,dict) else '') or x.get('basic_category') or x.get('category'),120).lower()
    if not UUID.fullmatch(oid) or not name: return None,'invalid'
    if EXCLUDED_CATEGORIES.search(category) or EXCLUDED_NAMES.search(name): return None,'non_b2b_retail_or_infrastructure'
    high=any(v in category for v in HIGH_CATEGORIES)
    medium=any(v in category for v in MEDIUM_CATEGORIES)
    strong=bool(STRONG_NAME.search(name))
    moderate=bool(MODERATE_NAME.search(name))
    if not (high or (medium and (strong or moderate)) or strong): return None,'weak_industry_match'
    if category in ('freight_and_cargo_service','shipping_center','courier_and_delivery_service') and not (strong or moderate): return None,'generic_logistics_tag_only'
    if category in ('storage_facility','warehouse') and not (strong or moderate): return None,'non_target_storage'
    sites=x.get('websites') or ([x['website']] if x.get('website') else [])
    if not isinstance(sites,list):sites=[]
    raw=next((clean(v,500) for v in sites if isinstance(v,str) and host_of(v)),'')
    host=host_of(raw);website=raw if not is_platform(host) else ''
    addr=x.get('addresses') or ([{'freeform':x['address']}] if x.get('address') else [])
    if not isinstance(addr,list):addr=[]
    address=next((clean(v.get('freeform'),500) for v in addr if isinstance(v,dict) and v.get('freeform')),'')
    sources=x.get('sources') or []
    if not isinstance(sources,list):sources=[]
    score=42 if ('freight_forwarding' in category or 'import_export' in category) else 32 if high else 18 if medium else 10
    score+=22 if strong else 10 if moderate else 0
    score+=18 if website else 0
    score+=6 if address else 0
    score+=4 if len(sources)>=2 else 0
    score=min(100,score)
    reasons=[]
    if strong:reasons.append('企业名称与目标业务强匹配')
    if website:reasons.append('存在疑似独立企业官网，尚未核实')
    if host and is_platform(host):reasons.append('第三方目录链接，未认定为官网')
    if not website:reasons.append('缺少独立官网，需人工核实')
    return {'id':oid,'name':name,'category':category,'website':website,'address':address,
        'emails':[],'phones':[],
        'sources':[{'dataset':clean(v.get('dataset'),100),'license':clean(v.get('license'),80)}
            for v in sources[:8] if isinstance(v,dict)],
        'quality_score':score,'lead_tier':'high' if score>=65 else 'review' if score>=37 else 'low',
        'screening_reasons':reasons,'needs_review':True},'accepted'

def select_feature(obj):
    return assess_feature(obj)[0]

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

def normalized_name(value):
    return re.sub(r'[^\\w]+','',re.sub(r'\\b(gmbh|ug|ag|kg|e\\.?k\\.?|mbh|ltd|co|haftungsbeschränkt)\\b','',value.casefold()))

def convert(source, output, limit):
    from collections import Counter
    candidates={};rejected=Counter();total=0
    with open(source,'r',encoding='utf-8') as file:
        for line in file:
            line=line.strip().lstrip('\\x1e')
            if not line:continue
            total+=1
            row,reason=assess_feature(json.loads(line))
            if not row:rejected[reason]+=1;continue
            if row['id'] not in candidates or row['quality_score']>candidates[row['id']]['quality_score']:
                candidates[row['id']]=row
    # Rank across the entire city extract: do not stop at the first 100 geographic records.
    ranked=sorted(candidates.values(),key=lambda r:(-r['quality_score'],r['name'],r['id']))
    deduped=[];seen=set()
    for row in ranked:
        hostname=host_of(row['website'])
        addr=re.sub(r'\\W','',row['address'].casefold())
        key=('website',hostname) if hostname else ('name_address',normalized_name(row['name']),addr) if addr else ('id',row['id'])
        if key in seen:rejected['same_company_duplicate']+=1;continue
        seen.add(key);deduped.append(row)
    chosen=deduped[:limit]
    with open(output,'w',encoding='utf-8') as out:
        for row in chosen:out.write(json.dumps(row,ensure_ascii=False)+'\\n')
    return {'scanned':total,'matched':len(chosen),'qualified_pool':len(deduped),
        'high_priority':sum(v['lead_tier']=='high' for v in chosen),
        'review_priority':sum(v['lead_tier']=='review' for v in chosen),
        'rejected_reasons':dict(rejected),'limit':limit}

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
