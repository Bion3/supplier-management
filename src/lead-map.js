import {cloudRequest,currentUser,appRequest} from './cloud.js';
import {distance,normalize,parseGeoText,classify,contactChannels,contactPriority,contactFilterMatches} from './lead-map-model.js';
const $=id=>document.getElementById(id);
const CITIES={hamburg:{name:'Hamburg',country:'Germany',center:[53.5511,9.9937]},rotterdam:{name:'Rotterdam',country:'Netherlands',center:[51.9244,4.4777]},duisburg:{name:'Duisburg',country:'Germany',center:[51.4344,6.7623]},warsaw:{name:'Warsaw',country:'Poland',center:[52.2297,21.0122]},budapest:{name:'Budapest',country:'Hungary',center:[47.4979,19.0402]}};
let center=CITIES.hamburg.center.slice(),radius=50,dbRows=[],fileRows=[],rows=[],page=1,activeId=null,taskCountry='Germany',taskCity='Hamburg';
const chosen=new Set(),selectedVerify=new Set(),PAGE_SIZE=20;
let knownTasks=[];
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function ensureMap(){
 if(!window.L){$('map-search-status').textContent='地图组件加载失败。请检查网络访问；表格仍可用于筛选。';return null;}
 const m=L.map('lead-map',{zoomControl:true}).setView(center,10);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors',crossOrigin:true}).addTo(m);
 m.on('click',ev=>{center=[ev.latlng.lat,ev.latlng.lng];$('map-city').value='custom';search();});
 return m;
}
const map=ensureMap(),markers=map?L.layerGroup().addTo(map):null;
let circle=map?L.circle(center,{radius:radius*1000,color:'#2a82c5',weight:2,fillOpacity:.09}).addTo(map):null;
if(map){
 const target=$('lead-map');
 // Sidebar transition, font layout and browser zoom may change the map size after first paint.
 const refreshSize=()=>{map.invalidateSize({pan:false,animate:false});};
 if(typeof ResizeObserver!=='undefined'){
  const resizeObserver=new ResizeObserver(()=>requestAnimationFrame(refreshSize));
  resizeObserver.observe(target);
 }
 window.addEventListener('resize',refreshSize,{passive:true});
 window.addEventListener('load',()=>{requestAnimationFrame(refreshSize);setTimeout(refreshSize,250);},{once:true});
 map.whenReady(()=>requestAnimationFrame(refreshSize));
 let tileErrors=0;
 map.eachLayer(layer=>{
  if(layer instanceof L.TileLayer){
   layer.on('tileerror',()=>{tileErrors++;
    if(tileErrors>=4)$('map-search-status').textContent='地图底图加载受阻，请检查网络或浏览器扩展；企业筛选仍可使用。';
   });
   layer.on('tileload',()=>{tileErrors=0;});
  }
 });
}

function mapLocate(row){
 activeId=row.id;
 if(map){map.panTo([row.lat,row.lng]);map.setZoom(Math.max(map.getZoom(),11));}
 for(const tr of document.querySelectorAll('#map-results tr'))tr.classList.toggle('active',tr.dataset.id===row.id);
}
function setViewport(){
 if(!map)return;
 if(circle){circle.setLatLng(center);circle.setRadius(radius*1000);}
 map.fitBounds(circle.getBounds(),{padding:[18,18],maxZoom:12});
}
function validWebsite(u){try{const a=new URL(u);return ['https:','http:'].includes(a.protocol)?a.href:null;}catch{return null;}}
function render(){
 radius=Number($('map-radius').value);
 const query=$('map-keyword').value.toLowerCase().trim(),type=$('map-type').value;
 const combined=new Map([...dbRows,...fileRows].map(r=>[r.id,r]));
 const inRadius=[...combined.values()].map(r=>({...r,km:distance(center[0],center[1],r.lat,r.lng)}))
  .filter(r=>r.km<=radius&&(!type||r.type===type)&&(!query||[r.name,r.category,r.address].join(' ').toLowerCase().includes(query)));
 const channel=$('map-contact-filter').value,hideEmpty=$('map-hide-no-contact').checked,sort=$('map-sort').value;
 const counts={total:inRadius.length,email:0,phone:0,both:0,contactable:0};
 for(const r of inRadius){const c=contactChannels(r);if(c.email)counts.email++;if(c.phone)counts.phone++;if(c.email&&c.phone)counts.both++;if(c.email||c.phone)counts.contactable++;}
 $('map-contact-summary').textContent='区域内 '+counts.total+' 家 · 有邮箱 '+counts.email+' 家 · 有电话 '+counts.phone+' 家 · 两者都有 '+counts.both+' 家 · 暂无联系方式 '+(counts.total-counts.contactable)+' 家。无联系方式企业可隐藏，但不会删除。';
 rows=inRadius.filter(r=>contactFilterMatches(r,channel)&&(!hideEmpty||contactPriority(r)>0))
  .sort((a,b)=>sort==='distance'?a.km-b.km:sort==='email'?
    (Number(contactChannels(b).email)-Number(contactChannels(a).email)||contactPriority(b)-contactPriority(a)||a.km-b.km):
    (contactPriority(b)-contactPriority(a)||a.km-b.km));
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages);
 $('map-count').textContent=rows.length+' 家区域内企业 · 已有坐标 '+combined.size+' 家 · 新文件预览 '+fileRows.length+' 家。数据不等于已核实客户。';
 $('map-page').textContent=page+' / '+pages;
 $('map-prev').disabled=page<=1;$('map-next').disabled=page>=pages;
 const body=$('map-results');body.replaceChildren();
 if(markers)markers.clearLayers();
 for(const r of rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)){
  const tr=document.createElement('tr');tr.dataset.id=r.id;if(r.id===activeId)tr.classList.add('active');
  const td=document.createElement('td');const check=document.createElement('input');check.type='checkbox';const stored=r.source==='database';check.checked=stored?selectedVerify.has(r.dbId):chosen.has(r.id);check.title=stored?'选择官网核实':'选择保存到候选池';check.onchange=()=>{const collection=stored?selectedVerify:chosen,key=stored?r.dbId:r.id;if(check.checked)collection.add(key);else collection.delete(key);selectionStatus();};td.append(check);tr.append(td);
  for(const value of [r.name,r.category||'待分类',r.km.toFixed(1)+' km']){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  const site=document.createElement('td');if(validWebsite(r.website)){const a=document.createElement('a');a.href=validWebsite(r.website);a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看官网';site.append(a);}else site.textContent='待查';tr.append(site);
  const contacts=Array.isArray(r.contacts)?r.contacts:[];
  for(const kind of ['email','phone']){
   const td=document.createElement('td');
   const values=contacts.filter(c=>[kind,kind==='email'?'邮箱':'电话'].includes(c.type)).map(c=>String(c.value||'')).filter(Boolean);
   if(values.length){
    for(const value of values.slice(0,2)){const line=document.createElement('div');line.textContent=value;line.title='官网公开来源提取，未验证有效性';td.append(line);}
   }else td.textContent=r.source==='database'?'待核实':'尚未入库';
   tr.append(td);
  }
  const verification=document.createElement('td');verification.textContent=r.verificationStatus==='unverified'?'未核实':r.verificationStatus||'未核实';tr.append(verification);
  for(const value of [r.address||'—',r.source==='file'?'新文件 · 待保存':'现有候选']){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  tr.onclick=e=>{if(e.target.closest('input,a,button'))return;mapLocate(r);};body.append(tr);

 }
 if(markers){for(const r of rows.slice(0,1000)){
   const icon=L.divIcon({className:'',html:'<span class="map-marker '+r.type+'"></span>',iconSize:[19,19],iconAnchor:[9,9]});
   const marker=L.marker([r.lat,r.lng],{icon}).addTo(markers);
   const div=document.createElement('div');div.className='map-popup';const strong=document.createElement('strong');strong.textContent=r.name;div.append(strong);
   const info=document.createElement('small');info.textContent=(r.category||'待分类')+' · '+r.km.toFixed(1)+' km';div.append(info);
   const button=document.createElement('button');button.type='button';button.textContent='在表格中查看';button.onclick=()=>{const index=rows.findIndex(x=>x.id===r.id);page=Math.floor(index/PAGE_SIZE)+1;render();mapLocate(r);document.querySelector('#map-results tr.active')?.scrollIntoView({behavior:'smooth',block:'center'});};div.append(button);
   marker.bindPopup(div);marker.on('click',()=>{activeId=r.id;for(const tr of document.querySelectorAll('#map-results tr'))tr.classList.toggle('active',tr.dataset.id===r.id);});
  }}

 $('map-search-status').textContent=rows.length+' 家命中半径 '+radius+' 公里，当前显示 '+Math.min(PAGE_SIZE,rows.length)+' 家。';
 selectionStatus();
}
function selectionStatus(){$('map-selected').textContent='待保存 '+chosen.size+' 家 · 待官网核实 '+selectedVerify.size+' 家';$('map-save').disabled=!chosen.size;$('map-verify').disabled=!selectedVerify.size;}
function search(){setViewport();page=1;render();}
$('map-search-button').onclick=()=>{search();if(!rows.length&&CITIES[$('map-city').value]){$('map-search-status').textContent='本地区暂无匹配的已采集企业。可点击「采集新企业」创建后台任务。';}};
const MAP_JOB_TASK_CITY='hamburg';
async function loadMapJobs(){
 const list=$('map-job-list');if(!list)return;
 try{
  const jobs=await cloudRequest('lead_map_search_jobs?select=id,city,radius_km,keyword,customer_type,status,processed,inserted,located_existing,skipped,error_message,created_at&order=created_at.desc&limit=12');
  list.replaceChildren();
  if(!jobs.length){list.textContent='尚无后台采集任务。输入 Hamburg 区域、半径和关键词，点击「采集本区域新企业」。';return;}
  const statuses={queued:'等待后台执行',running:'正在采集',completed:'采集完成',failed:'失败'};
  for(const j of jobs){
   const row=document.createElement('div');row.className='map-job-row';
   const details=document.createElement('span');details.textContent=j.city+' · '+j.radius_km+'km · '+j.keyword+' · '+(statuses[j.status]||j.status);
   const stats=document.createElement('small');
   stats.textContent='扫描入库处理 '+j.processed+' 条 · 新增 '+j.inserted+' · 补坐标 '+j.located_existing+(j.error_message?' · 原因：'+j.error_message:'');
   row.append(details,stats);list.append(row);
  }
 }catch(e){list.textContent='读取采集任务失败：'+e.message;}
}
$('map-refresh-jobs').onclick=async()=>{await loadMapJobs();await loadDb();};
const normalizeSearchTerm=term=>term.trim().toLowerCase();
async function submitRegionCollection({prompt=true}={}){
 const status=$('map-search-status'),button=$('map-collect');
 const cityKey=$('map-city').value,km=Number($('map-radius').value),term=normalizeSearchTerm($('map-keyword').value);
 const city=CITIES[cityKey];
 if(!city){
   status.textContent='请先选择列表中的城市；地图选点可筛选已有企业，跨城市采集需要选择城市。';return false;
 }
 if(distance(center[0],center[1],city.center[0],city.center[1])>50){
  status.textContent='中心点已离开所选城市，请重新选择该城市后采集。';return false;
 }
 if(km>50){status.textContent='100 公里自动采集尚未开放，请先选择 10、25 或 50 公里。';return false;}
 if(term.length<2||term.length>80){status.textContent='请输入 2–80 字的行业关键词，例如 logistics、import、wholesale。';return false;}
 if(prompt&&!confirm('为 '+city.name+' 周边 '+km+' 公里采集「'+term+'」企业？后台异步处理，结果进入待核实候选池。'))return false;
 button.disabled=true;
 try{
  // Reuse a same-city Overture task when one exists; create it when exploring a new city.
  let task=knownTasks.find(t=>t.source==='overture'&&t.city.toLowerCase()===city.name.toLowerCase()&&t.country.toLowerCase()===city.country.toLowerCase());
  if(!task){
   const created=await cloudRequest('lead_discovery_tasks',{method:'POST',
    headers:{Prefer:'return=representation'},body:JSON.stringify({
    country:city.country,city:city.name,source:'overture',keywords:[term],target_count:500,status:'pending'})});
   task=Array.isArray(created)?created[0]:created;
   if(!task?.id)throw Error('城市任务创建失败');
   knownTasks.push(task);
  }
  const recent=await cloudRequest('lead_map_search_jobs?select=id,status,city,radius_km,keyword,customer_type,created_at&city=eq.'+encodeURIComponent(city.name)+'&order=created_at.desc&limit=10');
  const type=$('map-type').value||'all';
  const duplicate=recent.find(j=>j.radius_km===km&&j.keyword.toLowerCase()===term&&j.customer_type===type&&['queued','running'].includes(j.status));
  if(duplicate){status.textContent='同条件采集任务已在执行，无需重复提交。可以展开「采集任务与高级设置」查看状态。';return true;}
  await cloudRequest('lead_map_search_jobs',{method:'POST',body:JSON.stringify({
   task_id:task.id,city:city.name,center_lat:center[0],center_lng:center[1],
   radius_km:km,keyword:term,customer_type:type,status:'queued'})});
  status.textContent='已提交 '+city.name+' · '+km+' 公里 · '+term+' 采集任务。后台定时运行，完成后刷新结果。';
  await loadMapJobs();return true;
 }catch(e){status.textContent='提交采集失败：'+e.message;return false;}
 finally{button.disabled=false;}
}
$('map-collect').onclick=()=>submitRegionCollection();

$('map-contact-filter').onchange=search;
$('map-hide-no-contact').onchange=search;
$('map-sort').onchange=search;
$('map-radius').onchange=search;
$('map-type').onchange=search;
$('map-keyword').addEventListener('keydown',e=>{if(e.key==='Enter')search();});
$('map-city').onchange=()=>{const val=$('map-city').value;if(CITIES[val]){center=CITIES[val].center.slice();search();}else $('map-search-status').textContent='请在地图上点击设置搜索中心。';};
$('map-reset').onclick=()=>{$('map-city').value='hamburg';center=CITIES.hamburg.center.slice();$('map-radius').value='50';$('map-type').value='';$('map-keyword').value='';$('map-contact-filter').value='any';$('map-hide-no-contact').checked=false;$('map-sort').value='contact';search();};
$('map-prev').onclick=()=>{page=Math.max(1,page-1);render();};
$('map-next').onclick=()=>{page++;render();};
$('map-select-all').onclick=()=>{for(const r of rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE))if(r.source==='file')chosen.add(r.id);else if(r.dbId)selectedVerify.add(r.dbId);render();};
$('map-clear').onclick=()=>{chosen.clear();selectedVerify.clear();render();};
$('map-file').onchange=async()=>{
 const f=$('map-file').files?.[0];if(!f)return;
 try{const parsed=parseGeoText(await f.text(),f.name);fileRows=parsed.rows;chosen.clear();$('map-save-status').textContent='文件 '+parsed.original+' 条，'+parsed.rows.length+' 条包含有效坐标；'+parsed.missing+' 条缺失地点坐标或格式无效。请核对来源、区域与许可证。';search();}
 catch(e){$('map-save-status').textContent='读取文件失败：'+e.message;}
};
// One clear primary action: reuse outstanding research jobs first; otherwise
// enqueue a small batch from the current map-filtered region.
$('map-auto-contact').onclick=async()=>{
 const button=$('map-auto-contact'),notice=$('map-contact-status');
 button.disabled=true;
 try{
  let jobs=await cloudRequest('lead_enrich_jobs?select=id,lead_id&status=eq.queued&order=created_at.asc&limit=6');
  if(!jobs.length){
   const candidates=rows.filter(r=>r.source==='database'&&r.dbId&&
      r.website?.startsWith('https://')&&r.reviewStatus==='pending'&&
      contactPriority(r)===0).slice(0,6);
   if(!candidates.length){
    notice.textContent='当前区域没有待补全且支持 HTTPS 的企业。已有联系方式可直接筛选；其他企业需先确认官网。';
    return;
   }
   notice.textContent='正在为本区域 '+candidates.length+' 家企业建立核实任务…';
   const response=await appRequest('/api/lead-batch',{method:'POST',
     body:JSON.stringify({ids:candidates.map(r=>r.dbId)})});
   if(response.error&&!(response.queued>0))throw Error(response.error);
   jobs=await cloudRequest('lead_enrich_jobs?select=id,lead_id&status=eq.queued&order=created_at.asc&limit=6');
  }
  if(!jobs.length){notice.textContent='目前没有可执行的官网核实任务。';return;}
  let done=0,added=0,failed=0;
  for(let i=0;i<jobs.length;i+=2){
   const batch=jobs.slice(i,i+2);
   notice.textContent='官网检查中 '+(i+1)+'–'+Math.min(i+2,jobs.length)+' / '+jobs.length+' 家…';
   const result=await appRequest('/api/lead-enrich',{method:'POST',
      body:JSON.stringify({action:'drain',ids:batch.map(j=>j.id)})});
   done+=result.completed||0;
   added+=result.added||0;
   failed+=(result.results||[]).filter(v=>v.status==='failed').length;
  }
  notice.textContent='本批完成：官网检查成功 '+done+' 家，新增公开联系方式 '+added+' 条，失败 '+failed+' 家。联系方式仍需人工核实。';
  await loadDb();
 }catch(e){notice.textContent='自动补全中断：'+e.message+'；已完成的任务会保留，可再次尝试。';}
 finally{button.disabled=false;}
};
$('map-dispatch-queued').onclick=async()=>{
 const btn=$('map-dispatch-queued'),notice=$('map-contact-status');btn.disabled=true;
 try{
  const jobs=await cloudRequest('lead_enrich_jobs?select=id,lead_id&status=eq.queued&order=created_at.asc&limit=6');
  if(!jobs.length){notice.textContent='当前没有排队中的官网核实任务。';return;}
  notice.textContent='开始逐家访问官网，本次最多处理 '+jobs.length+' 家，请保持页面打开…';
  let completed=0,added=0,failed=0;
  for(let i=0;i<jobs.length;i+=2){
   const batch=jobs.slice(i,i+2);
   const result=await appRequest('/api/lead-enrich',{method:'POST',body:JSON.stringify({action:'drain',ids:batch.map(j=>j.id)})});
   completed+=result.completed||0;added+=result.added||0;
   failed+=(result.results||[]).filter(x=>x.status==='failed').length;
   notice.textContent='已处理 '+Math.min(i+2,jobs.length)+' / '+jobs.length+' 家：完成 '+completed+'，新增公开联系方式 '+added+'，失败 '+failed+'。';
  }
  notice.textContent+=' 本批已结束；未完成的任务可再次点击。联系方式仍需人工核实。';
  await loadDb();
 }catch(e){notice.textContent='执行中断：'+e.message+'。已经完成的记录会保留，可再次处理剩余任务。';}
 finally{btn.disabled=false;}
};

$('map-verify').onclick=async()=>{
 const selected=[...selectedVerify];
 const eligible=dbRows.filter(r=>selectedVerify.has(r.dbId)&&r.website.startsWith('https://'));
 const notice=$('map-contact-status');
 if(!eligible.length){notice.textContent='当前选中的企业没有 HTTPS 官网。请先核实 HTTP 网站能否安全升级到 HTTPS，或补充企业官网。';return;}
 if(!confirm('为 '+eligible.length+' 家 HTTPS 官网企业建立公开联系方式核实任务？提取结果不是邮箱有效性验证，也不会发送邮件。'))return;
 const btn=$('map-verify');btn.disabled=true;
 try{
  let queued=0,published=0;
  for(let i=0;i<eligible.length;i+=100){
   const response=await appRequest('/api/lead-batch',{method:'POST',body:JSON.stringify({ids:eligible.slice(i,i+100).map(r=>r.dbId)})});
   queued+=response.queued||0;published+=response.published||0;
   if(response.error)notice.textContent='部分任务派发失败：'+response.error;
  }
  notice.textContent='已选择 '+selected.length+' 家，符合 HTTPS 条件 '+eligible.length+' 家；新增核实任务 '+queued+'，已派发 '+published+'。请在候选审核的官网补全队列检查结果。';
  selectedVerify.clear();await loadDb();
 }catch(e){notice.textContent='官网核实启动失败：'+e.message;}
 finally{selectionStatus();}
};
async function loadDb(){
 try{
  const [leads,tasks]=await Promise.all([
   cloudRequest('lead_discovery_leads?select=id,provider_place_id,company_name,website,address,country,city,map_lat,map_lng,map_category,review_status,contacts,verification_status&map_lat=not.is.null&map_lng=not.is.null&order=created_at.desc&limit=1000'),
   cloudRequest('lead_discovery_tasks?select=id,country,city,source&source=eq.overture&order=created_at.desc&limit=100')]);
  dbRows=leads.map(x=>normalize({id:x.provider_place_id||x.id,dbId:x.id,company_name:x.company_name,website:x.website,address:x.address,category:x.map_category,lat:x.map_lat,lng:x.map_lng,review_status:x.review_status,contacts:x.contacts,verification_status:x.verification_status},'database')).filter(Boolean);
  const sel=$('map-task');sel.replaceChildren(new Option('请选择对应城市的 Overture 任务',''));for(const t of tasks)sel.append(new Option(t.country+' / '+t.city+' · '+t.id.slice(0,8),t.id));
  knownTasks=tasks;const active=CITIES[$('map-city').value];const match=tasks.find(t=>t.city.toLowerCase()===active?.name.toLowerCase());if(match)sel.value=match.id;
  search();
  await loadMapJobs();
  if(!dbRows.length)$('map-save-status').textContent='现有候选记录暂无地理坐标。请上传新版 Overture 地区文件生成点位并保存，之后地图会自动从数据库读取。';
 }catch(e){$('map-count').textContent='读取数据失败：'+e.message+'。请从客户资源页面登录。';}
}
$('map-save').onclick=async()=>{
 if(!currentUser()){$('map-save-status').textContent='请先登录后再入库';return;}
 const task=$('map-task').value,release=$('map-release').value.trim();
 if(!task){$('map-save-status').textContent='请先选对应城市的 Overture 任务';return;}
 if(!/^20\d{2}-\d{2}-\d{2}(\.\d+)?$/.test(release)){$('map-save-status').textContent='请输入数据发布版本，如2026-09-23.1';return;}
 const selected=fileRows.filter(x=>chosen.has(x.id));
 if(!selected.length)return;
 if(!confirm('确定将 '+selected.length+' 家带位置的企业存入待核实候选池吗？请确保文件来源地区与任务一致。'))return;
 const button=$('map-save');button.disabled=true;let inserted=0,located=0,skipped=0;
 try{
  for(let i=0;i<selected.length;i+=50){
   const result=await cloudRequest('rpc/lead_map_stage',{method:'POST',body:JSON.stringify({p_task_id:task,p_release:release,p_rows:selected.slice(i,i+50)})});
   inserted+=result.inserted||0;located+=result.located_existing||0;skipped+=result.skipped||0;
   $('map-save-status').textContent='保存中 '+Math.min(i+50,selected.length)+' / '+selected.length+'…';
  }
  $('map-save-status').textContent='完成：新增 '+inserted+' 家，补全已有位置 '+located+' 家，重复跳过 '+skipped+' 家。所有记录保持待核实，不发送邮件。';
  chosen.clear();fileRows=[];$('map-file').value='';await loadDb();
 }catch(e){$('map-save-status').textContent='入库失败：'+e.message;}finally{selectionStatus();}
};
loadDb();