#!/usr/bin/env python3
"""Publish generated Overture NDJSON to the strictly scoped Supabase RPC.

Requires a one-purpose shared secret in GitHub Actions and matching SHA-256 hash in
lead_private.overture_ingest_credentials. Does not use service_role credentials.
"""
import argparse
import json
import os
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://hcorkkudgicarsmexnqf.supabase.co"
PUBLIC_KEY = "sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp"
UUID = re.compile(r"^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")
RELEASE = re.compile(r"^20\d{2}-\d{2}-\d{2}(?:\.\d+)?$")

def rpc(payload, secret, opener=urlopen):
    body = json.dumps({"p_secret": secret, **payload}, ensure_ascii=False).encode("utf8")
    req = Request(BASE + "/rest/v1/rpc/lead_overture_import_chunk",
                  body, method="POST",
                  headers={"apikey": PUBLIC_KEY, "Content-Type": "application/json",
                           "User-Agent": "EurasiagoOvertureImport/1.0"})
    last = None
    for attempt in range(3):
        try:
            with opener(req, timeout=35) as response:
                return json.loads(response.read().decode("utf8"))
        except HTTPError as exc:
            # Never retry bad credentials, permissions or malformed data.
            detail = exc.read(800).decode("utf8", "replace")
            if exc.code not in (500, 502, 503, 504, 429):
                raise RuntimeError(f"Import rejected (HTTP {exc.code}): {detail}") from exc
            last = RuntimeError(f"Backend temporarily unavailable HTTP {exc.code}")
        except (URLError, TimeoutError) as exc:
            last = exc
        if attempt < 2:
            time.sleep(2 * (attempt+1))
    raise RuntimeError("Import failed after retries") from last

def send_file(path, task_id, release, bbox, batch_key, secret, opener=urlopen):
    if not UUID.fullmatch(task_id):
        raise ValueError("task_id must be a UUID from an existing Overture task")
    if not RELEASE.fullmatch(release):
        raise ValueError("release must be YYYY-MM-DD or YYYY-MM-DD.1")
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,96}",batch_key):
        raise ValueError("batch key must be 10-96 safe characters")
    if len(secret) < 32:
        raise ValueError("Missing or invalid dedicated Overture import secret")
    raw = Path(path).read_text(encoding="utf8")
    records = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if not 0 <= len(records) <= 5000:
        raise ValueError("At most 5000 rows per batch")
    if not records:
        return rpc({"p_task_id":task_id,"p_release":release,"p_batch_key":batch_key,
                    "p_bbox":bbox,"p_expected":0,"p_chunk":0,"p_rows":[],
                    "p_final":True},secret,opener)
    total = (len(records)+49)//50
    for chunk in range(total):
        group = records[chunk*50:(chunk+1)*50]
        payload={"p_task_id":task_id,"p_release":release,"p_batch_key":batch_key,
                 "p_bbox":bbox,"p_expected":len(records),"p_chunk":chunk,
                 "p_rows":group,"p_final":chunk==total-1}
        result=rpc(payload,secret,opener)
        print(json.dumps({"chunk":chunk,"chunks":total,**result},ensure_ascii=False),flush=True)
    return {"status":"completed","processed":len(records)}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--file",required=True)
    parser.add_argument("--task-id",required=True)
    parser.add_argument("--release",required=True)
    parser.add_argument("--bbox",required=True)
    parser.add_argument("--batch-key",required=True)
    args=parser.parse_args()
    send_file(args.file,args.task_id,args.release,args.bbox,args.batch_key,
              os.environ.get("OVERTURE_INGEST_SECRET",""))

if __name__=="__main__":
    main()
