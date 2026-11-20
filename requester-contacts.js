(()=>{
 'use strict';let generation=0,rows=[],bound=null,client=null;
 const key=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'');
 const digits=v=>String(v||'').replace(/\D/g,'');
 function bind(name,phone){
  if(bound?.name===name)return;
  if(bound){bound.name.removeEventListener('input',bound.input);bound.name.removeEventListener('focus',bound.focus);bound.box.remove();}
  const box=document.createElement('div');box.className='requester-suggestions';box.hidden=true;box.setAttribute('aria-label','저장된 담당자');
  name.closest('label').append(box);name.autocomplete='off';
  const choose=row=>{name.value=row.name;phone.value=row.phone;bound.autoPhone=row.phone;phone.dispatchEvent(new Event('input',{bubbles:true}));name.dispatchEvent(new Event('change',{bubbles:true}));box.hidden=true;};
  const render=(autofill=false)=>{
   box.replaceChildren();const q=key(name.value),matches=q?rows.filter(r=>key(r.name).includes(q)).slice(0,8):[];
   const exact=rows.filter(r=>key(r.name)===q);
   if(autofill){
    if(bound.autoPhone&&digits(phone.value)===digits(bound.autoPhone)){phone.value='';phone.dispatchEvent(new Event('input',{bubbles:true}));bound.autoPhone=null;}
    if(q&&exact.length===1&&(!phone.value||bound.lastName!==q)){phone.value=exact[0].phone;bound.autoPhone=exact[0].phone;phone.dispatchEvent(new Event('input',{bubbles:true}));}
    bound.lastName=q;
   }
   for(const row of matches){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=row.name+' · '+row.phone;b.addEventListener('click',()=>choose(row));box.append(b);}
   box.hidden=!matches.length;
  };
  const input=()=>render(true),focus=()=>render(false);bound={name,phone,box,input,focus,lastName:key(name.value),autoPhone:null};name.addEventListener('input',input);name.addEventListener('focus',focus);
 }
 async function load(profile){
  const stamp=++generation;rows=[];client=profile?.clientId||null;if(bound)bound.box.hidden=true;
  if(!client)return;
  const name=document.getElementById(window.TH_DIRECT_MODE?'directName':'sharedRequesterName'),phone=document.getElementById(window.TH_DIRECT_MODE?'directPhone':'sharedRequesterPhone');if(!name||!phone)return;bind(name,phone);
  try{const list=await window.TH_API.rpc('th6_requester_contacts',{p_client:client});if(stamp!==generation)return;rows=Array.isArray(list)?list.filter(r=>r.name&&/^0\d{8,10}$/.test(r.phone)):[];}catch{if(stamp===generation)rows=[];}
 }
 document.addEventListener('click',e=>{if(bound&&!bound.name.closest('label').contains(e.target))bound.box.hidden=true;});
 window.TH_REQUESTERS={load,refresh:()=>load(window.TH_PORTAL?.profile)};
})();
