// Lapis Road API - Cloudflare Worker
// Needs: KV binding "DB"; secrets BOT_TOKEN, CHAT_ID, ADMIN_KEY
const H={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-admin-key","access-control-allow-methods":"GET,POST,OPTIONS"};
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:H});
const c=(s,n=200)=>String(s==null?"":s).trim().slice(0,n);
const esc=s=>String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const tg=(env,text)=>fetch("https://api.telegram.org/bot"+env.BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.CHAT_ID,text,disable_web_page_preview:true})});
const all=async(env,pre)=>{const l=await env.DB.list({prefix:pre,limit:500});return (await Promise.all(l.keys.map(k=>env.DB.get(k.name,"json")))).filter(Boolean)};

export default{async fetch(req,env){
 const u=new URL(req.url),p=u.pathname;
 if(req.method==="OPTIONS")return J({});
 try{
  // Partner registers (guide, hotel, guesthouse, homestay, dacha)
  if(p==="/partner"&&req.method==="POST"){
   const b=await req.json(),id=crypto.randomUUID().slice(0,8);
   const d={id,type:c(b.type,20),name:c(b.name,80),owner:c(b.owner,80),region:c(b.region,40),place:c(b.place,80),
    price:c(b.price,20),langs:c(b.langs,60),about:c(b.about,400),lat:Math.abs(+b.lat)<=90?+b.lat||0:0,lng:Math.abs(+b.lng)<=180?+b.lng||0:0,wa:c(b.wa,24),tg:c(b.tg,40),status:"pending",t:Date.now()};
   if(!d.name||!d.wa||!d.region||!d.type)return J({error:"missing"},400);
   await env.DB.put("p:"+id,JSON.stringify(d));
   await tg(env,"New partner request\n"+d.type+": "+d.name+"\n"+d.region+", "+d.place+"\nPrice: "+d.price+"\nWhatsApp: "+d.wa+"\n\nReview:\n"+u.origin+"/review?id="+id+"&key="+env.ADMIN_KEY);
   return J({ok:true,id});
  }
  // Public list: approved partners WITHOUT contact numbers
  if(p==="/partners"&&req.method==="GET"){
   const r=u.searchParams.get("region"),list=(await all(env,"p:")).filter(x=>x.status==="approved"&&(!r||x.region===r));
   return J(list.map(({wa,tg,owner,...pub})=>pub));
  }
  // Owner review page (approve / reject)
  if(p==="/review"&&req.method==="GET"){
   if(u.searchParams.get("key")!==env.ADMIN_KEY)return new Response("No",{status:403});
   const d=await env.DB.get("p:"+u.searchParams.get("id"),"json");
   if(!d)return new Response("Not found",{status:404});
   const rows=["type","name","owner","region","place","price","langs","about","wa","tg","status"].map(k=>"<p><b>"+k+":</b> "+esc(d[k])+"</p>").join("");
   const k=esc(env.ADMIN_KEY);
   return new Response("<meta name=viewport content='width=device-width,initial-scale=1'><body style='font:18px Arial;padding:20px'>"+rows+
    "<button style='font-size:20px;padding:12px 20px' onclick=\"go(true)\">Approve</button> <button style='font-size:20px;padding:12px 20px' onclick=\"go(false)\">Reject</button><p id=m></p><script>function go(ok){fetch('/decide',{method:'POST',body:JSON.stringify({id:'"+d.id+"',key:'"+k+"',ok:ok})}).then(r=>r.json()).then(()=>document.getElementById('m').textContent=ok?'Approved':'Rejected')}</script>",{headers:{"content-type":"text/html;charset=utf-8"}});
  }
  if(p==="/decide"&&req.method==="POST"){
   const b=await req.json();if(b.key!==env.ADMIN_KEY)return J({error:"no"},403);
   const d=await env.DB.get("p:"+c(b.id,12),"json");if(!d)return J({error:"nf"},404);
   d.status=b.ok?"approved":"rejected";await env.DB.put("p:"+d.id,JSON.stringify(d));return J({ok:true});
  }
  // Tourist sign-up (no passport here; passport details are asked privately later, at booking)
  if(p==="/register"&&req.method==="POST"){
   const b=await req.json(),id=crypto.randomUUID().slice(0,8);
   const d={id,name:c(b.name,80),phone:c(b.phone,40),country:c(b.country,60),t:Date.now()};
   if(!d.name||!d.phone||!d.country)return J({error:"missing"},400);
   await env.DB.put("u:"+id,JSON.stringify(d));
   await tg(env,"New tourist\n"+d.name+", "+d.country+"\nContact: "+d.phone);
   return J({ok:true});
  }
  // Tourist trip registration
  if(p==="/trip"&&req.method==="POST"){
   const b=await req.json(),id=crypto.randomUUID().slice(0,8);
   const d={id,name:c(b.name,80),country:c(b.country,60),contact:c(b.contact,60),entry:c(b.entry,60),date:c(b.date,12),people:c(b.people,4),
    places:(Array.isArray(b.places)?b.places:[]).slice(0,12).map(x=>c(x,40)),picks:(Array.isArray(b.picks)?b.picks:[]).slice(0,12).map(x=>c(x,12)),t:Date.now()};
   if(!d.name||!d.contact||!d.date)return J({error:"missing"},400);
   await env.DB.put("t:"+id,JSON.stringify(d));
   const ps=await all(env,"p:"),picked=ps.filter(x=>d.picks.includes(x.id)).map(x=>"- "+x.name+" ("+x.type+") WhatsApp "+x.wa).join("\n");
   await tg(env,"New tourist trip\n"+d.name+", "+d.country+"\nContact: "+d.contact+"\nEntry: "+d.entry+"\nArrival: "+d.date+", people: "+d.people+"\nPlaces: "+d.places.join(", ")+"\nChosen:\n"+(picked||"-"));
   return J({ok:true});
  }
  const adm=req.headers.get("x-admin-key")===env.ADMIN_KEY;
  const EM=["👍","❤️","🙏","😊","🤔","👎"];
  // Admin writes a post (all partners, or one region)
  if(p==="/admin/post"&&req.method==="POST"){
   if(!adm)return J({error:"no"},403);
   const b=await req.json(),id=Date.now().toString(36)+crypto.randomUUID().slice(0,3);
   const d={id,text:c(b.text,1000),region:c(b.region,40),t:Date.now()};
   if(!d.text)return J({error:"missing"},400);
   await env.DB.put("m:"+id,JSON.stringify(d));return J({ok:true});
  }
  if(p==="/admin/delete"&&req.method==="POST"){
   if(!adm)return J({error:"no"},403);
   const b=await req.json();await env.DB.delete("m:"+c(b.id,20));return J({ok:true});
  }
  // Partner feed with sticker counts
  if(p==="/feed"&&req.method==="GET"){
   const pid=c(u.searchParams.get("pid"),12),me=await env.DB.get("p:"+pid,"json");
   if(!me)return J({error:"unknown"},404);
   const ms=(await all(env,"m:")).filter(m=>!m.region||m.region===me.region).sort((a,b)=>b.t-a.t).slice(0,40),out=[];
   for(const m of ms){const r=(await env.DB.get("r:"+m.id,"json"))||{},counts={};
    for(const k in r)counts[r[k]]=(counts[r[k]]||0)+1;
    out.push({id:m.id,text:m.text,t:m.t,counts,mine:r[pid]||""})}
   return J({posts:out});
  }
  if(p==="/react"&&req.method==="POST"){
   const b=await req.json(),pid=c(b.pid,12),post=c(b.post,20);
   if(!EM.includes(b.emoji)||!(await env.DB.get("p:"+pid))||!(await env.DB.get("m:"+post)))return J({error:"bad"},400);
   const r=(await env.DB.get("r:"+post,"json"))||{};r[pid]=b.emoji;
   await env.DB.put("r:"+post,JSON.stringify(r));return J({ok:true});
  }
  // Everything for the admin site
  if(p==="/admin/data"&&req.method==="GET"){
   if(!adm)return J({error:"no"},403);
   const ps=await all(env,"p:"),nm={};ps.forEach(x=>nm[x.id]=x.name);
   const ms=(await all(env,"m:")).sort((a,b)=>b.t-a.t).slice(0,30);
   for(const m of ms){const r=(await env.DB.get("r:"+m.id,"json"))||{};m.reacts=Object.keys(r).map(k=>({name:nm[k]||"?",emoji:r[k]}))}
   const by=(a,b)=>b.t-a.t;
   return J({partners:ps.sort(by),users:(await all(env,"u:")).sort(by),trips:(await all(env,"t:")).sort(by),posts:ms});
  }
  return J({error:"not found"},404);
 }catch(e){return J({error:"server"},500)}
}};
