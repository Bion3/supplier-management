#!/usr/bin/env python3
"""One bounded region-search job from the CRM queue, using Overture official CLI.

GitHub Actions scheduled runner. No CRM customer import and no email sending.
Only stages candidates as unverified; the Supabase RPC validates geographic radius.
"""
import concurrent.futures
import json
import math
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from scripts.download_overture_candidates import convert
from scripts.publish_overture_candidates import BASE, PUBLIC_KEY

SECRET = os.environ.get("OVERTURE_INGEST_SECRET", "")
def rpc(name, arguments):
    if len(SECRET) < 32:
        raise RuntimeError("Missing OVERTURE_INGEST_SECRET")
    payload=json.dumps({"p_secret":SECRET,**arguments}).encode()
    req=Request(BASE+"/rest/v1/rpc/"+name,data=payload,method="POST",
                headers={"apikey":PUBLIC_KEY,"Content-Type":"application/json",
                         "User-Agent":"EurasiagoMapBackground/1.0"})
    for attempt in range(3):
        try:
            with urlopen(req,timeout=45) as response:
                return json.loads(response.read().decode("utf8"))
        except HTTPError as error:
            detail=error.read(800).decode("utf8","replace")
            if error.code not in (429,500,502,503,504):
                raise RuntimeError(f"{name} rejected HTTP {error.code}: {detail}") from error
            if attempt==2:raise
        except (URLError,TimeoutError):
            if attempt==2:raise
        time.sleep(2*(attempt+1))

def tiles(lat,lon,radius):
    # Entire circle covered by rectangular 0.48-degree tiles (CLI max = 0.6 degrees).
    north=min(90,lat+radius/111.2)
    south=max(-90,lat-radius/111.2)
    longitude_span=radius/(111.2*max(.2,math.cos(math.radians(lat))))
    west=max(-180,lon-longitude_span)
    east=min(180,lon+longitude_span)
    lat_count=max(1,math.ceil((north-south)/.48))
    lon_count=max(1,math.ceil((east-west)/.48))
    if lat_count*lon_count>16:
        raise ValueError("区域过大，需要分片处理：当前自动采集最多16个片区，请缩小至50公里内")
    result=[]
    for y in range(lat_count):
        for x in range(lon_count):
            a=west+x*(east-west)/lon_count
            b=south+y*(north-south)/lat_count
            c=west+(x+1)*(east-west)/lon_count
            d=south+(y+1)*(north-south)/lat_count
            result.append(f"{a:.6f},{b:.6f},{c:.6f},{d:.6f}")
    return result

def download_tile(item):
    bbox,index,output=item
    raw=output/f"region-{index}.geojsonseq"
    subprocess.run(["overturemaps","download",f"--bbox={bbox}","-f","geojsonseq",
        "--type=place","-o",str(raw)],check=True,timeout=900)
    candidates=output/f"candidates-{index}.ndjson"
    metrics=convert(raw,candidates,1000)
    raw.unlink(missing_ok=True)
    return candidates,metrics

def process(job):
    jobid=job["id"]
    try:
        r=int(job["radius_km"])
        if r>50:raise ValueError("自动采集目前支持10/25/50公里，100公里可筛选已保存的企业")
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)
            boxes=tiles(float(job["center_lat"]),float(job["center_lng"]),r)
            # Sequential to avoid placing high concurrent load on Overture public cloud.
            candidates=[];scanned=0
            # Two downloads maximum, to balance latency and public S3 load.
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                for path,metric in executor.map(download_tile,[(bbox,ix,base) for ix,bbox in enumerate(boxes)]):
                    scanned+=metric["scanned"]
                    for line in path.read_text(encoding="utf8").splitlines():
                        if line.strip():candidates.append(json.loads(line))
            dedup={}
            type_keywords={
                "freight":("freight","forward","spedition","logisti","transport","shipping","cargo","container","zoll"),
                "trade":("import","export","trading","handel"),
                "wholesale":("wholesal","distribut","großhandel","grosshandel")
            }
            customer_type=job["customer_type"]
            query=job["keyword"].casefold()
            for row in candidates:
                text=(row.get("name","")+" "+row.get("category","")).casefold()
                if customer_type!="all" and not any(w in text for w in type_keywords.get(customer_type,())):
                    continue
                # Keyword search intentionally ANDs the user phrase as one normalized substring,
                # to avoid broad "any token" matching from unrelated POIs.
                if query not in text:continue
                if not isinstance(row.get("lat"),(int,float)) or not isinstance(row.get("lng"),(int,float)):continue
                key=row.get("id")
                if key and (key not in dedup or row.get("quality_score",0)>dedup[key].get("quality_score",0)):
                    dedup[key]=row
            selected=sorted(dedup.values(),key=lambda p:(-p.get("quality_score",0),p["name"]))[:500]
            print(json.dumps({"tiles":len(boxes),"scanned":scanned,"filtered":len(selected),
                              "job_id":jobid}),flush=True)
            for i in range(0,len(selected),50):
                result=rpc("lead_map_worker_ingest",{"p_job_id":jobid,"p_rows":selected[i:i+50]})
                print(json.dumps({"chunk":i//50,**result}),flush=True)
        outcome=rpc("lead_map_worker_finish",{"p_job_id":jobid})
        print(json.dumps(outcome),flush=True)
    except Exception as error:
        reason=str(error)[:400]
        print(f"Map lead job failed ({jobid}): {reason}",flush=True)
        rpc("lead_map_worker_finish",{"p_job_id":jobid,"p_error":reason})
        raise

def main():
    job=rpc("lead_map_worker_claim",{})
    if not job or not job.get("id"):
        print("No queued map searches.")
        return
    process(job)

if __name__=="__main__":
    main()
