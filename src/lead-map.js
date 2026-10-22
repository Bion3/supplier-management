import {cloudRequest,currentUser} from './cloud.js';
import {distance,normalize,parseGeoText,classify} from './lead-map-model.js';
const $=id=>document.getElementById(id);
const CITIES={hamburg:[53.5511,9.9937],rotterdam:[51.9244,4.4777],duisburg:[51.4344,6.7623],warsaw:[52.2297,21.0122],budapest:[47.4979,19.0402]};
let center=CITIES.hamburg.slice(),radius=50,dbRows=[],fileRows=[],rows=[],page=1,activeId=null,taskCountry='Germany',taskCity='Hamburg';
const chosen=new Set(),PAGE_SIZE=20;
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
 rows=[...combined.values()].map(r=>({...r,km:distance(center[0],center[1],r.lat,r.lng)}))
  .filter(r=>r.km<=radius&&(!type||r.type===type)&&(!query||[r.name,r.category,r.address].join(' ').toLowerCase().includes(query)))
  .sort((a,b)=>a.km-b.km);
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages);
 $('map-count').textContent=rows.length+' 家区域内企业 · 已有坐标 '+combined.size+' 家 · 新文件预览 '+fileRows.length+' 家。数据不等于已核实客户。';
 $('map-page').textContent=page+' / '+pages;
 $('map-prev').disabled=page<=1;$('map-next').disabled=page>=pages;
 const body=$('map-results');body.replaceChildren();
 if(markers)markers.clearLayers();
 for(const r of rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)){
  const tr=document.createElement('tr');tr.dataset.id=r.id;if(r.id===activeId)tr.classList.add('active');
  const td=document.createElement('td');const check=document.createElement('input');check.type='checkbox';check.checked=chosen.has(r.id);check.disabled=r.source!=='file';check.title=r.source==='file'?'保存新文件的企业':'已存在候选池';check.onchange=()=>{if(check.checked)chosen.add(r.id);else chosen.delete(r.id);selectionStatus();};td.append(check);tr.append(td);
  for(const value of [r.name,r.category||'待分类',r.km.toFixed(1)+' km']){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  const site=document.createElement('td');if(validWebsite(r.website)){const a=document.createElement('a');a.href=validWebsite(r.website);a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看官网';site.append(a);}else site.textContent='待查';tr.append(site);
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
function selectionStatus(){$('map-selected').textContent='已选 '+chosen.size+' 家新企业';$('map-save').disabled=!chosen.size;}
function search(){setViewport();page=1;render();}
$('map-search-button').onclick=search;
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
$('map-collect').onclick=async()=>{
 const status=$('map-search-status'),button=$('map-collect');
 const city=$('map-city').value,km=Number($('map-radius').value);
 const term=$('map-keyword').value.trim();
 if(city!=='hamburg'&&city!=='custom'){status.textContent='自动采集试点仅支持 Hamburg，其他城市目前可筛选已保存数据。';return;}
 if(distance(center[0],center[1],CITIES.hamburg[0],CITIES.hamburg[1])>50){
  status.textContent='中心点距离 Hamburg 过远，请重新选择 Hamburg 附近的位置。';return;
 }
 if(km>50){status.textContent='100 公里暂不支持自动采集；请选 10、25 或 50 公里。';return;}
 if(term.length<2||term.length>80){status.textContent='请填写 2–80 字的行业关键词（例如 freight、import）。';return;}
 const jobsCountry=$('map-task');
 let id=jobsCountry.value;
 if(!id){status.textContent='尚无 Hamburg 的 Overture 任务，请先在候选审核页创建对应任务。';return;}
 if(!confirm('将 Hamburg 周边 '+km+' 公里的「'+term+'」采集任务加入后台队列？采集后自动进入待审核候选池，不会发送邮件。'))return;
 button.disabled=true;
 try{
  const type=$('map-type').value||'all';
  await cloudRequest('lead_map_search_jobs',{method:'POST',body:JSON.stringify({
   task_id:id,city:'Hamburg',center_lat:center[0],center_lng:center[1],
   radius_km:km,keyword:term,customer_type:type,status:'queued'})});
  status.textContent='已加入后台队列。GitHub Actions 约每30分钟检查一次任务，执行时间取决于地区数据量；可在下方刷新状态。';
  await loadMapJobs();
 }catch(e){status.textContent='提交采集任务失败：'+e.message;}
 finally{button.disabled=false;}
};

$('map-radius').onchange=search;
$('map-type').onchange=search;
$('map-keyword').addEventListener('keydown',e=>{if(e.key==='Enter')search();});
$('map-city').onchange=()=>{const val=$('map-city').value;if(CITIES[val]){center=CITIES[val].slice();search();}else $('map-search-status').textContent='请在地图上点击设置搜索中心。';};
$('map-reset').onclick=()=>{$('map-city').value='hamburg';center=CITIES.hamburg.slice();$('map-radius').value='50';$('map-type').value='';$('map-keyword').value='';search();};
$('map-prev').onclick=()=>{page=Math.max(1,page-1);render();};
$('map-next').onclick=()=>{page++;render();};
$('map-select-all').onclick=()=>{for(const r of rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE))if(r.source==='file')chosen.add(r.id);render();};
$('map-clear').onclick=()=>{chosen.clear();render();};
$('map-file').onchange=async()=>{
 const f=$('map-file').files?.[0];if(!f)return;
 try{const parsed=parseGeoText(await f.text(),f.name);fileRows=parsed.rows;chosen.clear();$('map-save-status').textContent='文件 '+parsed.original+' 条，'+parsed.rows.length+' 条包含有效坐标；'+parsed.missing+' 条缺失地点坐标或格式无效。请核对来源、区域与许可证。';search();}
 catch(e){$('map-save-status').textContent='读取文件失败：'+e.message;}
};
async function loadDb(){
 try{
  const [leads,tasks]=await Promise.all([
   cloudRequest('lead_discovery_leads?select=id,provider_place_id,company_name,website,address,country,city,map_lat,map_lng,map_category,review_status&map_lat=not.is.null&map_lng=not.is.null&order=created_at.desc&limit=1000'),
   cloudRequest('lead_discovery_tasks?select=id,country,city,source&source=eq.overture&order=created_at.desc&limit=100')]);
  dbRows=leads.map(x=>normalize({id:x.provider_place_id||x.id,company_name:x.company_name,website:x.website,address:x.address,category:x.map_category,lat:x.map_lat,lng:x.map_lng,review_status:x.review_status},'database')).filter(Boolean);
  const sel=$('map-task');for(const t of tasks)sel.append(new Option(t.country+' / '+t.city+' · '+t.id.slice(0,8),t.id));
  const match=tasks.find(t=>t.city.toLowerCase()==='hamburg');if(match)sel.value=match.id;
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