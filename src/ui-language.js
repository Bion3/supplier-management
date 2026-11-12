import {translateUI} from './ui-terms.js';
const storageKey='eurasiago-ui-language';
let language='zh-CN';
try { language=localStorage.getItem(storageKey)==='en'?'en':'zh-CN'; } catch {}
const originals=new WeakMap();
const selector='header,nav,h1,h2,h3,h4,th,label,button,summary,option,[data-ui-text],.heading>div>p,.hub-heading,.pricing-groups,.workflow';
const excluded='script,style,textarea,input,[contenteditable],#source,[data-no-translate]';
function permitted(element) {
 if(element.closest(excluded))return false;
 // Names, addresses, raw source text and all other business data remain untouched.
 const option=element.closest('option');
 if(option){const select=option.closest('select');if(!select||/supplier|country|origin|destination/i.test(select.name+' '+select.id))return false;}
 if(element.closest('tbody')&&!element.closest('button,[data-ui-text]'))return false;
 return !!element.closest(selector);
}
function replace(target,key,current,set) {
 let entries=originals.get(target);if(!entries){entries={};originals.set(target,entries);}
 let entry=entries[key];
 if(!entry||current!==entry.rendered)entry=entries[key]={source:current,rendered:current};
 const translated=translateUI(entry.source,language);entry.rendered=translated;
 if(translated!==current)set(translated);
}
export function originalUIText(element){
 return [...element.childNodes].map(node=>node.nodeType===3?(originals.get(node)?.text?.source??node.textContent):originalUIText(node)).join('');
}
export function applyLanguage(){
 observer.disconnect();
 document.documentElement.lang=language;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode,element=node.parentElement;
  if(!element||!permitted(element)||!node.data.trim())continue;
  // An option without an explicit value derives its submitted value from its label.
  // Freeze that original value before translating the visible label.
  if(element.tagName==='OPTION'&&!element.hasAttribute('value'))element.setAttribute('value',element.value);
  replace(node,'text',node.data,value=>{node.data=value;});
 }
 for(const element of document.querySelectorAll('[placeholder],[aria-label],button[title]')){
  if(element.closest(excluded)&&!element.matches('input'))continue;
  for(const attribute of ['placeholder','aria-label','title'])if(element.hasAttribute(attribute))replace(element,attribute,element.getAttribute(attribute),value=>element.setAttribute(attribute,value));
 }
 replace(document,'title',document.title,value=>{document.title=value;});
 for(const select of document.querySelectorAll('[data-language-switch]'))select.value=language;
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
}
const observer=new MutationObserver(()=>applyLanguage());
export function setLanguage(value){
 language=value==='en'?'en':'zh-CN';try{localStorage.setItem(storageKey,language);}catch{}
 applyLanguage();
 // Storage events also synchronize already-open workspace iframes, without reload.
 window.dispatchEvent(new CustomEvent('ui-language-change',{detail:language}));
}
window.addEventListener('storage',event=>{if(event.key===storageKey){language=event.newValue==='en'?'en':'zh-CN';applyLanguage();}});
export function installLanguage(){
 if(!document.querySelector('[data-language-switch]')&&window.parent===window){
 const label=document.createElement('label');label.className='language-control';label.dataset.noTranslate='';label.textContent='语言 / Language';
 const select=document.createElement('select');select.dataset.languageSwitch='';select.setAttribute('aria-label','语言 / Language');
 select.innerHTML='<option value="zh-CN">简体中文</option><option value="en">English</option>';
 select.addEventListener('change',()=>setLanguage(select.value));label.append(select);
 (document.querySelector('.system-nav')||document.querySelector('header')||document.body).append(label);
 }
 applyLanguage();
}
