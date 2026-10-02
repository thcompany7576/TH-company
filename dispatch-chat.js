(() => {
 'use strict';
 const $=id=>document.getElementById(id),api=window.TH_API;
 const time=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 const node=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 let staff=null,rooms=[],selected=null,visible=false,attempt=null,baseline=false,seen=new Map(),notify=()=>{},refreshing=false;
 function reset(){staff=null;rooms=[];selected=null;visible=false;attempt=null;baseline=false;seen.clear();$('dispatchList').replaceChildren();$('dispatchLog').replaceChildren();$('dispatchBody').value='';$('dispatchConversation').hidden=true;$('dispatchUnread').hidden=true;}
 function draw(){
  const q=$('dispatchSearch').value.trim().toLowerCase();$('dispatchList').replaceChildren();
  for(const r of rooms.filter(r=>(r.name+' '+r.link_slug).toLowerCase().includes(q))){
   const b=node('button','', 'thread-item secondary');b.type='button';b.setAttribute('aria-current',String(r.sales_id===selected));
   b.append(node('strong',staff.role==='owner'?r.name+' · 영업자':'관제센터'));
   if(r.unread)b.append(node('span',' '+r.unread,'badge'));
   b.append(node('small',r.last_body||'메시지를 보내 대화를 시작하세요.'));
   if(r.last_at)b.append(node('small',time(r.last_at)));
   b.onclick=()=>open(r.sales_id).catch(e=>{$('dispatchNotice').textContent=e.message;});$('dispatchList').append(b);
  }
  if(!$('dispatchList').children.length)$('dispatchList').append(node('p','대화 상대가 없습니다.'));
  const count=rooms.reduce((n,r)=>n+Number(r.unread||0),0);$('dispatchUnread').textContent=count;$('dispatchUnread').hidden=!count;
 }
 async function inbox(){
  const me=staff;if(!me)return;const data=await api.rpc('th6_dispatch_inbox');if(staff!==me)return;
  const incoming=baseline&&data.some(r=>r.last_sender!==me.user_id&&Number(r.last_seq||0)>Number(seen.get(r.sales_id)||0));
  for(const r of data)seen.set(r.sales_id,r.last_seq||0);baseline=true;rooms=data;draw();
  if(incoming)await notify();
 }
 async function read(){
  const id=selected,me=staff;if(!id||!me)return;
  const data=await api.rpc('th6_dispatch_read',{p_sales:id});if(selected!==id||staff!==me||!visible)return;
  const log=$('dispatchLog'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<100;
  log.replaceChildren();
  for(const m of data){const b=node('div','', 'chat-bubble '+(m.sender_id===me.user_id?'customer':'admin'));
   b.append(node('strong',m.sender_role==='owner'?'관제 · '+m.sender_name:m.sender_name+' · 영업자'),node('p',m.body),node('time',time(m.created_at)));log.append(b);
  }
  if(!data.length)log.append(node('p','아직 메시지가 없습니다.'));
  if(nearBottom)log.scrollTop=log.scrollHeight;
  const r=rooms.find(r=>r.sales_id===id);if(r){const max=data.reduce((n,m)=>Math.max(n,Number(m.seq)),0);if(Number(r.last_seq||0)<=max)r.unread=0;}draw();
 }
 async function open(id){
  if(selected!==id){$('dispatchBody').value='';attempt=null;$('dispatchLog').replaceChildren();}
  selected=id;$('dispatchConversation').hidden=false;const r=rooms.find(r=>r.sales_id===id);
  $('dispatchTitle').textContent=staff.role==='owner'?(r?.name||'영업자')+' ↔ 관제센터':'관제센터 ↔ '+staff.name;
  $('dispatchNotice').textContent='';draw();await read();
 }
 $('dispatchSearch').oninput=draw;
 $('dispatchRefresh').onclick=()=>window.TH_DISPATCH.poll().catch(e=>{$('dispatchNotice').textContent=e.message;});
 $('dispatchForm').onsubmit=async e=>{
  e.preventDefault();const body=$('dispatchBody').value.trim(),id=selected,me=staff;if(!body||!id||!me)return;
  $('dispatchSend').disabled=true;
  try{
   if(!attempt||attempt.body!==body||attempt.sales!==id)attempt={id:crypto.randomUUID(),body,sales:id};
   await api.rpc('th6_dispatch_send',{p_sales:id,p_message:attempt.id,p_body:body});
   if(staff!==me||selected!==id)return;attempt=null;$('dispatchBody').value='';$('dispatchNotice').textContent='메시지를 보냈습니다.';await inbox();await read();$('dispatchLog').scrollTop=$('dispatchLog').scrollHeight;
  }catch(e){$('dispatchNotice').textContent=e.message;}finally{$('dispatchSend').disabled=false;}
 };
 window.TH_DISPATCH={
  async init(me,onIncoming){reset();staff=me;notify=onIncoming;$('dispatchSearchLabel').hidden=me.role!=='owner';$('dispatchMenuLabel').textContent=me.role==='owner'?'영업자 메시지함':'관제센터 메시지함';await inbox();},
  async show(show){visible=show;if(!show)return;await inbox();if(staff.role!=='owner'&&!selected)selected=staff.user_id;if(selected)await open(selected);},
  async poll(){if(!staff||refreshing)return;refreshing=true;try{await inbox();if(visible&&selected)await read();}finally{refreshing=false;}},
  reset
 };
})();
