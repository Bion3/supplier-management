"""Collect public EUROPUR company profiles. Emits evidence JSON; never writes CRM directly."""
import concurrent.futures,gzip,html,json,re,sys,urllib.request

def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'EurasiagoDirectoryResearch/1.0','Accept-Encoding':'gzip'})
 with urllib.request.urlopen(req,timeout=20) as r:
  b=r.read(2500000)
  if b[:2]==b'\x1f\x8b':b=gzip.decompress(b)
  s=b.decode('utf-8','replace')
 if any(x in s.lower() for x in ['verify you are human','cf-chl-','captcha challenge']):raise ValueError('robot verification: skipped')
 return s

def text(s):return html.unescape(re.sub(r'\s+',' ',re.sub('<[^>]*>',' ',s))).strip()

def parse_profile(s,url):
 title=re.search(r'<h1\b[^>]*>(.*?)</h1>',s,re.S|re.I)
 if not title:raise ValueError('profile title missing')
 # Only labelled company paragraphs; association footer must never become a contact.
 fields={}
 for k,v in re.findall(r'<p[^>]*>\s*<strong[^>]*>(.*?)</strong>\s*:?\s*(.*?)</p>',s,re.S|re.I):fields[text(k).rstrip(':').lower()]=text(v)
 name=text(title.group(1));contacts=[]
 for email in re.findall(r'[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',fields.get('general email','')):
  if email.lower().endswith('@europur.org'):continue
  contacts.append({'channel':'邮箱','value':email.lower(),'source_url':url})
 phone=fields.get('general telephone','')
 if phone:contacts.append({'channel':'电话','value':phone,'source_url':url})
 web=fields.get('website','');web=('https://'+web) if web and not web.startswith(('http://','https://')) else web
 if not fields.get('country of headquarters'):raise ValueError('not a company profile')
 return {'company_name':name,'country':fields.get('country of headquarters',''),'industry':'聚氨酯与家具材料','website':web,'source_url':url,'contacts':contacts,'contact_checked':bool(contacts)}

if __name__=='__main__':
 limit=min(100,int(sys.argv[1])) if len(sys.argv)>1 else 20
 offset=max(0,int(sys.argv[2])) if len(sys.argv)>2 else 0
 urls=list(dict.fromkeys(re.findall(r'href=[\"\x27](https://europur.org/member/[^\"\x27]+)[\"\x27]',fetch('https://europur.org/our-members/'))))
 results=[];errors=[]
 def collect(url):return parse_profile(fetch(url),url)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  futures={pool.submit(collect,u):u for u in urls[offset:offset+limit]}
  for future in concurrent.futures.as_completed(futures):
   try:results.append(future.result())
   except Exception as e:errors.append({'url':futures[future],'error':str(e)})
 print(json.dumps({'entries':results,'errors':errors,'total_profiles':len(urls)},ensure_ascii=False))
