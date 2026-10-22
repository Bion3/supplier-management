// Runs before page content. Server-side protection is enforced separately by proxy.js.
(()=>{
 const root=document.documentElement;
 function requireLogin(){
  let session=null;try{session=JSON.parse(sessionStorage.getItem('supplier-auth')||'null');}catch{}
  if(session?.user?.id&&session.access_token){root.classList.add('auth-user','auth-ready');return;}
  root.classList.remove('auth-user');
  location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search+location.hash));
 }
 requireLogin();
 window.addEventListener('pageshow',requireLogin);
 window.addEventListener('storage',event=>{if(event.key==='supplier-auth-signout'){try{sessionStorage.removeItem('supplier-auth');}catch{}requireLogin();}});
})();
