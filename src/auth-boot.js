// Runs before page content. Server-side protection is enforced separately by proxy.js.
(()=>{
 const root=document.documentElement;
 function requireLogin(){
  let session=null;try{session=JSON.parse(sessionStorage.getItem('supplier-auth')||'null');}catch{}
  if(session?.user?.id&&session.access_token&&session.expires_at>Date.now()){root.classList.add('auth-user','auth-ready');return;}
  root.classList.remove('auth-user');
  location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search+location.hash));
 }
 requireLogin();
 window.addEventListener('pageshow',async event=>{
  if(!event.persisted){requireLogin();return;}
  root.classList.remove('auth-user');
  try{const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(6000)});if(response.ok){requireLogin();return;}}catch{}
  location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search+location.hash));
 });
 window.addEventListener('storage',event=>{if(event.key==='supplier-auth-signout'){try{sessionStorage.removeItem('supplier-auth');}catch{}requireLogin();}});
})();
