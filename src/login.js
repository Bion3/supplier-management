import {login,currentUser,restorePageSession} from './cloud.js';
import {loginDestination,loginError} from './login-model.js';
const $=id=>document.getElementById(id),button=$('login-submit');
const destination=loginDestination(new URLSearchParams(location.search).get('next'),location.origin);
let busy=false;
function pending(value){busy=value;button.disabled=value;$('login-email').disabled=value;$('login-password').disabled=value;button.textContent=value?'正在登录…':'登录';}
$('show-password').addEventListener('click',()=>{const visible=$('login-password').type==='password';$('login-password').type=visible?'text':'password';$('show-password').textContent=visible?'隐藏':'显示';$('show-password').setAttribute('aria-label',visible?'隐藏密码':'显示密码');$('show-password').setAttribute('aria-pressed',String(visible));});
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;pending(true);$('login-error').textContent='';
 try{await login($('login-email').value.trim(),$('login-password').value);$('login-password').value='';location.replace(destination);}
 catch(error){$('login-error').textContent=loginError(error);$('login-password').value='';pending(false);$('login-password').focus();}
});
if(currentUser()){
 pending(true);$('login-status').textContent='正在验证登录状态…';
 try{await restorePageSession();location.replace(destination);}catch{$('login-status').textContent='登录状态已失效，请重新登录。';pending(false);}
}
