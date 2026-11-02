(()=>{
 'use strict';
 const api=window.TH_API,$=id=>document.getElementById(id),admin=document.documentElement.dataset.surface==='admin'&&!window.TH_DIRECT_MODE;
 const node=(tag,value)=>{const e=document.createElement(tag);if(value)e.textContent=value;return e;};
 const style=node('style');style.textContent='.hours-panel{padding:12px 16px;margin:12px 0;border:1px solid #998790;border-radius:12px}.hours-panel h2{font-size:18px;margin:0 0 8px}.hours-panel p{margin:6px 0}.hours-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 0}.hours-row strong{flex:1}.hours-closed{color:#a51e2d!important;font-weight:bold}.hours-panel button,.hours-panel a{padding:8px 12px;min-height:38px}.hours-panel input{padding:8px;margin:6px 0}.hours-panel [role=status]{font-size:14px}.hours-panel[hidden]{display:none!important}';document.head.append(style);
 let staff=null,busy=false,version=0,state=null;
 const panel=node('section');panel.className='hours-panel';panel.id='receptionPanel';panel.hidden=true;
 const heading=node('h2',admin?'업무 마감 관리':'접수 안내'),body=node('div'),note=node('p');note.setAttribute('role','status');panel.append(heading,body,note);
 if(admin)$('dashboard').before(panel);else $('order').before(panel);
 const globalText='오늘 업무가 종료되어 주문을 접수할 수 없습니다.';
 const individualText='담당 영업자의 업무가 마감되어 현재 주문을 접수할 수 없습니다.';
 async function change(closed,target,name){
  if(busy)return;
  const action=closed?'업무 마감':'접수 재개';
  if(!confirm(name+' '+action+'하시겠습니까?'+(closed?'\n해당 진행 중 주문에 취소 가능 안내를 보냅니다. 주문은 자동 취소되지 않습니다.':'')))return;
  busy=true;body.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await api.rpc('th6_set_reception',{p_closed:closed,p_staff:target,p_reason:closed?($('closingReason')?.value||''):''});renderAdmin(result);note.textContent=action+'했습니다.'+(closed?' 진행 중 주문 '+result.notified+'건에 안내를 남겼습니다.':'');}
  catch(e){note.textContent=e.message;}
  finally{busy=false;body.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 function adminRow(name,closed,target,global=false){
  const row=node('div');row.className='hours-row';const label=node('strong',name+' · '+(closed?'업무 마감':'접수 가능'));if(closed)label.className='hours-closed';
  const toggle=node('button',closed?'접수 재개':'업무 마감');toggle.type='button';toggle.className='secondary';toggle.onclick=()=>change(!closed,target,name);row.append(label,toggle);if(!global&&state.globalClosed)row.append(node('span','전체 업무 마감 적용 중'));return row;
 }
 function renderAdmin(data){
  const reasonDraft=$('closingReason')?.value||'';state=data;body.replaceChildren();panel.hidden=!staff;
  if(staff.role==='owner')body.append(adminRow('전체 업무',data.globalClosed,null,true));
  else if(data.globalClosed)body.append(node('p',globalText));
  const reason=node('input');reason.id='closingReason';reason.maxLength=200;reason.value=reasonDraft;reason.placeholder='마감 사유 (선택 · 고객에게 표시)';reason.setAttribute('aria-label','마감 사유');body.append(reason);
  for(const s of data.sales||[])body.append(adminRow(s.name,s.closed,s.id));
 }
 function renderCustomer(data){
  state=data;body.replaceChildren();panel.hidden=!data.closed;if(!data.closed)return;
  heading.textContent=data.globalClosed?'전체 업무 마감':'담당 영업자 업무 마감';body.append(node('p',data.globalClosed?globalText:individualText));
  if(data.reason)body.append(node('p','사유: '+data.reason));
  if(!data.globalClosed){body.append(node('p','예외 접수는 관제센터로 문의해 주세요. 업무 마감 후에는 운행요금이 크게 높아질 수 있으며, 접수 전에 정확한 요금을 안내드립니다.'));const call=node('a','📞 관제센터 전화하기 · 070-7576-3320');call.href='tel:07075763320';call.className='button';body.append(call);}
  body.append(node('p','이미 접수한 주문은 진행 중인 주문과 대화에서 처리 상태를 확인해 주세요.'));
 }
 async function refresh(){
  const stamp=version;
  if(admin){if(!staff||busy)return;const data=await api.rpc('th6_reception_admin');if(stamp===version&&JSON.stringify(state)!==JSON.stringify(data))renderAdmin(data);return data;}
  const data=await api.rpc('th6_reception_status',{p_slug:new URLSearchParams(location.search).get('sales'),p_staff:window.TH_DIRECT?.staff?.user_id||null});if(stamp===version)renderCustomer(data);return data;
 }
 async function ensure(){const data=await refresh();if(data?.closed)throw Error(data.globalClosed?globalText:individualText+' 예외 접수: 070-7576-3320 (요금 상승 가능)');}
 window.TH_HOURS={async init(account){version++;staff=account;await refresh().catch(e=>note.textContent=e.message);},refresh,ensure};
 if(!admin){
  // Runs before form review or submission. Server insert trigger is authoritative.
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!['sms','sendAgency'].includes(b.id)||!state?.closed)return;e.preventDefault();e.stopImmediatePropagation();panel.scrollIntoView({block:'center'});},true);
  document.addEventListener('submit',e=>{if(e.target.id!=='order'||!state?.closed)return;e.preventDefault();e.stopImmediatePropagation();panel.scrollIntoView({block:'center'});},true);
  const original=api.rpc;api.rpc=async(name,args)=>{if(['th6_submit_request','th6_sales_submit','th6_control_submit'].includes(name))await ensure();return original(name,args);};
  // Session restoration belongs to the existing portal; don't create or alter sessions here.
  setTimeout(()=>refresh().catch(()=>{}),0);
 }
 window.addEventListener('th:session',()=>{version++;if(admin&&!api.session){staff=null;panel.hidden=true;}else if(!admin)void refresh().catch(()=>{});});
 setInterval(()=>{if(!document.hidden)void refresh().catch(()=>{});},10000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh().catch(()=>{});});
})();

