import {originalUIText} from './ui-language.js';
import {taskURL} from './workspace-model.js';
import {workspaceToken} from './cloud.js';

const tabs=document.getElementById('task-tabs'),panels=document.getElementById('task-panels'),status=document.getElementById('task-status');
const tasks=[];let active=null,nextId=0;
const labels=new Map([...document.querySelectorAll('header a[href]')].map(a=>[a.getAttribute('href'),originalUIText(a).trim()]));
const api={open,token:workspaceToken,beforeLogout(){
 if(tasks.some(task=>task.dirty)&&!confirm('退出登录会关闭所有任务，请确认已保存需要的内容。继续退出？'))return false;
 window.onbeforeunload=null;return true;
}};
window.eurasiagoWorkspace=api;

function activate(task,history=true){
 active=task;
 for(const item of tasks){const selected=item===task;item.frame.hidden=!selected;item.tab.classList.toggle('active',selected);item.button.setAttribute('aria-selected',String(selected));item.button.tabIndex=selected?0:-1;}
 for(const link of document.querySelectorAll('header a[href]')){if(link.getAttribute('href')===task.url)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 const small=document.querySelector('.app-brand small');if(small)small.textContent=task.label;
 document.title=task.label+' · 多任务工作台';
 if(history){const url=new URL(location.href);if(url.searchParams.get('page')!==task.url){url.searchParams.set('page',task.url);window.history.pushState(null,'',url);}}
 task.button.scrollIntoView({block:'nearest',inline:'nearest'});
 status.textContent=`已打开 ${tasks.length} 个任务 · 切换保留输入、筛选和进度；刷新或关闭页面前请保存。`;
}
function markDirty(task){task.dirty=true;task.button.textContent=task.label+' ·';task.button.title='此页面有操作记录，请保存后再关闭';}
function close(task){
 if(!confirm(`关闭“${task.label}”？未保存的内容和页面内运行的操作会丢失，已提交到后台的任务继续执行。`))return;
 const index=tasks.indexOf(task);tasks.splice(index,1);task.frame.remove();task.tab.remove();
 if(active===task){if(tasks.length)activate(tasks[Math.min(index,tasks.length-1)]);else open('/hub.html');}else activate(active,false);
}
function open(value,history=true){
 const url=taskURL(value,location.origin);if(!url)return false;
 const existing=tasks.find(task=>task.url===url);if(existing){activate(existing,history);return true;}
 // Never evict a live task: the user explicitly chooses which page to close.
 if(tasks.length>=8){status.textContent='已打开 8 个任务，请保存并关闭不需要的任务后再打开。';return false;}
 const id='task-'+(++nextId),label=labels.get(url)||labels.get(url.split(/[?#]/)[0])||'业务任务';
 const tab=document.createElement('div');tab.className='task-tab';tab.setAttribute('role','presentation');
 const button=document.createElement('button');button.type='button';button.id=id;button.setAttribute('role','tab');button.setAttribute('aria-controls',id+'-panel');button.textContent=label;
 const remove=document.createElement('button');remove.type='button';remove.className='task-close';remove.textContent='×';remove.setAttribute('aria-label','关闭'+label);
 const frame=document.createElement('iframe');frame.id=id+'-panel';frame.title=label;frame.setAttribute('role','tabpanel');frame.setAttribute('aria-labelledby',id);
 const task={url,label,tab,button,frame,dirty:false};tasks.push(task);
 button.addEventListener('click',()=>activate(task));remove.addEventListener('click',()=>close(task));
 frame.addEventListener('load',()=>{
  // A server or API auth redirect must replace the whole workspace, not nest login.
  const child=frame.contentWindow;
  try{
   if(child.location.pathname==='/login.html'){window.onbeforeunload=null;location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search));return;}
   const doc=child.document;
   doc.addEventListener('input',()=>markDirty(task));doc.addEventListener('change',()=>markDirty(task));
   if(doc.title){task.label=labels.get(task.url)||doc.title;button.textContent=task.label+(task.dirty?' ·':'');frame.title=task.label;remove.setAttribute('aria-label','关闭'+task.label);if(active===task)activate(task,false);}
  }catch{status.textContent='任务页面暂时无法访问，请重新登录或稍后重试。';}
 });
 tab.append(button,remove);tabs.append(tab);panels.append(frame);frame.src=url;activate(task,history);return true;
}
document.addEventListener('click',event=>{
 const anchor=event.target.closest('a[href]');if(!anchor||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||anchor.hasAttribute('download')||anchor.target&&anchor.target!=='_self')return;
 if(taskURL(anchor.href,location.origin)){event.preventDefault();open(anchor.href);}
});
tabs.addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||event.target.getAttribute('role')!=='tab')return;
 event.preventDefault();const index=tasks.indexOf(active),last=tasks.length-1;
 const target=event.key==='Home'?0:event.key==='End'?last:(index+(event.key==='ArrowRight'?1:-1)+tasks.length)%tasks.length;
 activate(tasks[target]);tasks[target].button.focus();
});
document.getElementById('new-task').addEventListener('click',()=>open('/hub.html'));
window.addEventListener('popstate',()=>open(new URLSearchParams(location.search).get('page')||'/hub.html',false));
window.onbeforeunload=event=>{if(tasks.some(task=>task.dirty)){event.preventDefault();event.returnValue='';}};
open(new URLSearchParams(location.search).get('page')||'/hub.html',false)||open('/hub.html',false);
