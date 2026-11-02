import {cloudRequest,appRequest,currentUser} from './cloud.js';
import {hmrcSearchURL} from './hmrc-model.js';
const $=id=>document.getElementById(id),el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
let mode='saved',page=1,entries=[],more=false,generation=0,loading=false;
function options(){return {hs:$('customs-hs').value.trim(),year:$('customs-year').value,page};}
function safeLink(href,text){const a=el('a',text);try{const u=new URL(href,location.origin);if(u.protocol!=='https:'||u.username||u.password)return a;a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{}return a;}
function render(){
 const body=$('customs-rows');body.replaceChildren();
 for(const row of entries){const e=mode==='saved'?row.evidence:row,tr=el('tr'),name=el('td');name.append(el('strong',row.company_name),el('p',e.address||'地址未提供'));const goods=el('td');goods.append(el('p',(e.hs_codes||[]).join(' / ')),el('p',(e.products||[]).join('；')));const period=el('td');period.append(el('p','进口 · '+(e.latest_activity||'未知')),el('small',(e.activity_months||[]).join('、')));const state=el('td',mode==='saved'?row.contact_state:'待采集');state.append(el('p','中国采购 / 铁路需求：未确认'));const action=el('td');action.append(safeLink(row.source_url,'HMRC 来源'));if(mode==='saved'){action.append(el('p'));const a=el('a','打开客户 / 补全联系方式');a.href='/crm.html?company='+encodeURIComponent(row.company_id);action.append(a);}if(row.website)action.append(el('p'),safeLink(row.website,'企业官网'));tr.append(name,goods,period,state,action);body.append(tr);}
 $('customs-empty').hidden=entries.length>0;$('customs-page').textContent='第 '+page+' 页';$('customs-prev').disabled=loading||page<=1;$('customs-next').disabled=loading||!more;$('customs-import').hidden=mode!=='live';$('customs-import').disabled=loading||!entries.length;$('customs-name-label').hidden=mode!=='saved';
 for(const b of document.querySelectorAll('[data-customs-mode]'))b.setAttribute('aria-pressed',String(b.dataset.customsMode===mode));
}
async function load(){
 const g=++generation;loading=true;render();$('customs-notice').textContent=mode==='live'?'正在查询 HMRC 官方数据，请稍候…':'正在读取已采集企业…';
 try{const opts=options();$('hmrc-official-query').href=hmrcSearchURL(opts);
 if(mode==='live'){const data=await appRequest('/api/discovery-search',{method:'POST',body:JSON.stringify({source:'HMRC',...opts})});if(g!==generation)return;entries=data.entries;more=data.more;$('customs-notice').textContent='官方结果 '+data.total+' 家，本页 '+entries.length+' 家；'+data.notice;}
 else {const p=new URLSearchParams({select:'*',directory_code:'eq.HMRC',limit:'51',offset:String((page-1)*50),order:'company_name.asc,id.asc'});if(opts.year)p.set('evidence->>year','eq.'+opts.year);if(opts.hs){if(!/^\d{6}(\d{2})?$/.test(opts.hs))throw Error('请输入6位或8位商品编码');p.set('evidence->>commodity_code','like.'+opts.hs+'*');}const q=$('customs-name').value.trim();if(q)p.set('company_name','ilike.*'+q.replace(/[\\*%_]/g,'\\$&')+'*');const data=await cloudRequest('freight_directory_entries?'+p);if(g!==generation)return;entries=data.slice(0,50);more=data.length>50;$('customs-notice').textContent='本页 '+entries.length+' 家已关联 CRM；记录为月度进口活动，未提供货量或交易金额。';}
 }catch(e){if(g!==generation)return;entries=[];more=false;$('customs-notice').textContent=e.message;}
 finally{if(g===generation){loading=false;render();}}
}
for(const b of document.querySelectorAll('[data-customs-mode]'))b.onclick=()=>{if(loading)return;mode=b.dataset.customsMode;page=1;entries=[];more=false;load();};
$('customs-form').onsubmit=e=>{e.preventDefault();if(loading)return;page=1;load();};
$('customs-prev').onclick=()=>{page--;load();};$('customs-next').onclick=()=>{page++;load();};
$('customs-import').onclick=async()=>{if(loading||mode!=='live'||!entries.length)return;loading=true;render();$('customs-notice').textContent='正在去重并关联客户资源…';try{const result=await cloudRequest('rpc/freight_directory_ingest',{method:'POST',body:JSON.stringify({p_code:'HMRC',p_entries:entries})});$('customs-notice').textContent='已处理 '+result.scanned+' 家，新增客户 '+result.new_companies+' 家；已存在的企业补充来源。可切换“已采集企业”查看。';}catch(e){$('customs-notice').textContent='采集未完成：'+e.message;}finally{loading=false;render();}};
$('customs-year').value=String(new Date().getFullYear());if(currentUser())load();
