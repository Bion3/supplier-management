import {readRich,packRich} from './mail-content.js';
// Signature is frozen into the preview/draft, including randomly assigned content.
export function appendSignature(body,signature){
 const text=String(signature||'').trim();if(!text)return body;
 const nodes=readRich(body);
 return nodes===null?String(body)+'\n\n'+text:packRich([...nodes,{tag:'div',children:[{tag:'br'},text]}]);
}
