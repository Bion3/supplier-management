import {packRich,editorHTML,safeStyle,safeURL,escapeHTML} from './mail-content.js';
export function createMailEditor(root,toolbar,onError){
 let range=null;
 const remember=()=>{const s=window.getSelection();if(s.rangeCount&&root.contains(s.anchorNode)&&root.contains(s.focusNode))range=s.getRangeAt(0).cloneRange();};
 document.addEventListener('selectionchange',remember);
 function restore(){root.focus();const s=window.getSelection();if(range&&root.contains(range.commonAncestorContainer)){s.removeAllRanges();s.addRange(range);}else{const r=document.createRange();r.selectNodeContents(root);r.collapse(false);s.removeAllRanges();s.addRange(r);}}
 function command(name,value=null){restore();document.execCommand(name,false,value);remember();}
 toolbar.addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault();});
 toolbar.addEventListener('click',e=>{const cmd=e.target.closest('[data-command]')?.dataset.command;if(cmd)command(cmd);});
 for(const control of toolbar.querySelectorAll('[data-format]'))control.addEventListener('change',()=>{command(control.dataset.format,control.value);});
 toolbar.querySelector('[data-action="link"]').addEventListener('click',()=>{const value=prompt('请输入链接地址（https://… 或 mailto:…）');if(value===null)return;const url=safeURL(value);if(!url){onError('请输入有效的链接地址。');return;}restore();if(window.getSelection().isCollapsed)command('insertHTML',`<a href="${escapeHTML(url)}">${escapeHTML(url)}</a>`);else command('createLink',url);});
 toolbar.querySelector('[data-action="image"]').addEventListener('click',()=>{const value=prompt('请输入公开可访问的 HTTPS 图片链接');if(value===null)return;const url=safeURL(value,true);if(!url){onError('图片需要公开的 HTTPS 链接。');return;}const alt=prompt('图片说明（可留空）','')||'图片';command('insertHTML',`<img src="${escapeHTML(url)}" alt="${escapeHTML(alt)}" width="${toolbar.querySelector('[data-image-width]').value}" style="max-width:100%;height:auto"><br>`);});
 root.addEventListener('paste',e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'));});
 root.addEventListener('drop',e=>{e.preventDefault();onError('请通过“插入图片”使用公开图片链接。');});
 function serialise(parent){return [...parent.childNodes].flatMap(n=>{if(n.nodeType===3)return [n.textContent];if(n.nodeType!==1)return [];let tag=n.tagName.toLowerCase();if(['script','style','iframe','object','svg'].includes(tag))return [];const style=safeStyle(Object.fromEntries(['fontFamily','fontSize','color','backgroundColor','textAlign','fontWeight','fontStyle','textDecoration'].map(k=>[k,n.style[k]?.replace(/^['"]|['"]$/g,'')||''])));if(tag==='font'){tag='span';Object.assign(style,safeStyle({fontFamily:n.getAttribute('face')||'',color:n.getAttribute('color')||'',fontSize:({1:'10px',2:'12px',3:'16px',4:'18px',5:'24px',6:'32px',7:'36px'})[n.getAttribute('size')]||''}));}if(!['p','div','span','b','strong','i','em','u','s','br','ul','ol','li','blockquote','a','img'].includes(tag))return serialise(n);if(tag==='img')return [{tag,src:n.getAttribute('src'),alt:n.getAttribute('alt'),width:Number(n.getAttribute('width'))}];return [{tag,style,...(tag==='a'?{href:n.getAttribute('href')} : {}),children:serialise(n)}];});}
 return {get:()=>packRich(serialise(root)),set:body=>{root.innerHTML=editorHTML(body);range=null;},focus:()=>{root.focus();},clear:()=>{root.replaceChildren();range=null;}};
}
