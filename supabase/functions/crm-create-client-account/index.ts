import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"https://crm.eurasiago.com",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};

function temporaryPassword(){
  const bytes=crypto.getRandomValues(new Uint8Array(24));
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(bytes,b=>alphabet[b%alphabet.length]).join("");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  const send=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
    status,
    headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
  });
  if(req.method!=="POST")return send({error:"Method not allowed"},405);

  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!jwt)return send({error:"Authentication required"},401);

    const staff=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+jwt}}});
    const {error:checkError}=await staff.rpc("freight_portal_inquiry_companies");
    if(checkError)return send({error:"Administrator access required"},403);

    const {crm_company_id,email,mode="create"}=await req.json();
    const cleanEmail=typeof email==="string"?email.trim().toLowerCase():"";
    if(typeof crm_company_id!=="string"||!/^\S+@\S+\.\S+$/.test(cleanEmail))return send({error:"Invalid company or email"},400);
    if(!["create","reset"].includes(mode))return send({error:"Invalid operation"},400);

    const admin=createClient(url,secret);
    const {data:company,error:companyError}=await admin.from("freight_companies").select("id").eq("id",crm_company_id).maybeSingle();
    if(companyError||!company)return send({error:"CRM company not found"},404);
    const password=temporaryPassword();

    if(mode==="reset"){
      const {data:link,error:linkError}=await admin.from("freight_portal_crm_links").select("portal_company_id").eq("crm_company_id",crm_company_id).maybeSingle();
      if(linkError||!link)return send({error:"This customer has no client account"},404);
      const {data:member,error:memberError}=await admin.from("freight_portal_members").select("email").eq("company_id",link.portal_company_id).ilike("email",cleanEmail).maybeSingle();
      if(memberError||!member)return send({error:"Email is not assigned to this customer"},403);
      const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
      if(listError)return send({error:"Unable to read client account"},500);
      const user=list.users.find(item=>item.email?.toLowerCase()===cleanEmail);
      if(!user)return send({error:"Client account not found"},404);
      const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{password});
      if(updateError)return send({error:updateError.message},400);
      return send({email:cleanEmail,temporary_password:password,operation:"reset",notice:"Show password once and ask customer to change it immediately."});
    }

    const {data:created,error:createError}=await admin.auth.admin.createUser({email:cleanEmail,password,email_confirm:true});
    if(createError)return send({error:createError.message},409);
    const {error:linkError}=await staff.rpc("freight_crm_portal_assign",{p_crm_company_id:crm_company_id,p_email:cleanEmail});
    if(linkError){
      await admin.auth.admin.deleteUser(created.user.id);
      return send({error:"Company authorization failed: "+linkError.message},400);
    }
    return send({email:cleanEmail,temporary_password:password,operation:"create",notice:"Show password once and ask customer to change it immediately."});
  }catch{
    return send({error:"Unable to manage client account"},500);
  }
});
