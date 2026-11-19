(() => {
'use strict';
const api=window.TH_API;let allowed=false,partners=[],routes=[],generation=0;
const make=(tag,value)=>{const el=document.createElement(tag);if(value)el.textContent=value;return el;};
const open=make('button','구간요금 관리');open.type='button';open.className='secondary';open.hidden=true;
document.getElementById('partnerImportOpen').before(open);
const dialog=make('dialog');dialog.className='admin-dialog';dialog.style.cssText='width:min(760px,94vw);max-height:90vh;overflow:auto';
const head=make('div');head.className='section-head';const close=make('button','닫기');close.type='button';close.className='secondary';head.append(make('h2','구간요금 관리'),close);dialog.append(head);
dialog.append(make('p','모든 등록 의뢰자에게 적용할 편도 구간요금입니다. 두 방향에 동일하게 적용되며 야간·급송·왕복 등 추가금은 기존 기준대로 별도 계산됩니다.'));
const form=make('form'),picks=[];
const searchKey=value=>String(value||'').toLocaleLowerCase().replace(/\s/g,'');
for(const title of ['출발 거래처','도착 거래처']){
 const label=make('label',title),input=make('input'),select=make('input'),results=make('div'),hint=make('p');
 input.type='search';input.placeholder='거래처명 또는 주소 입력';input.setAttribute('aria-label',title+' 검색');input.autocomplete='off';input.required=true;
 select.type='hidden';results.className='route-partner-results';hint.className='portal-note';hint.setAttribute('role','status');
 const update=()=>{results.replaceChildren();input.setCustomValidity(select.value?'':'검색 결과에서 거래처를 선택해 주세요.');const q=searchKey(input.value);if(select.value){hint.textContent='선택됨 · 변경하려면 검색어를 다시 입력해 주세요.';return;}if(!q){hint.textContent='거래처명이나 주소를 입력해 주세요.';return;}
 const found=partners.filter(p=>searchKey([p.title,p.address,p.detail].join(' ')).includes(q));
 hint.textContent=found.length?found.length+'곳 검색됨'+(found.length>30?' · 검색어를 더 입력하면 범위를 좁힐 수 있습니다.':''):'검색 결과가 없습니다.';
 for(const p of found.slice(0,30)){const button=make('button',p.title+' · '+p.address+(p.detail?' · '+p.detail:''));button.type='button';button.className='secondary';button.style.cssText='display:block;width:100%;text-align:left;margin:4px 0;white-space:normal';button.onclick=()=>{select.value=p.id;input.value=p.title+' · '+p.address+(p.detail?' · '+p.detail:'');update();input.focus();};results.append(button);}
 };
 input.oninput=()=>{select.value='';update();};input.onkeydown=e=>{if(e.key==='ArrowDown'&&results.firstElementChild){e.preventDefault();results.firstElementChild.focus();}if(e.key==='Enter'&&!select.value){e.preventDefault();if(results.childElementCount===1)results.firstElementChild.click();}};
 label.append(input,select);form.append(label,results,hint);picks.push({input,select,update});
}
const price=make('input');price.type='number';price.required=true;price.min='1000';price.max='2000000';price.step='1000';price.inputMode='numeric';const priceLabel=make('label','편도 구간요금 (원)');priceLabel.append(price);form.append(priceLabel);
const save=make('button','구간요금 저장');save.type='submit';form.append(save);dialog.append(form);
const note=make('p');note.setAttribute('role','status');dialog.append(note);
const filter=make('input');filter.type='search';filter.placeholder='저장된 구간 검색';filter.setAttribute('aria-label','저장된 구간 검색');dialog.append(make('h3','저장된 공용 구간요금'),filter);
const list=make('div');dialog.append(list);document.body.append(dialog);close.onclick=()=>{generation++;dialog.close();};
function render(){list.replaceChildren();const q=searchKey(filter.value);for(const r of routes.filter(r=>searchKey(r.label_a+' '+r.label_b).includes(q))){const card=make('div');card.className='partner-card';card.append(make('p',r.label_a+' ↔ '+r.label_b),make('strong',r.conflict?'요금 확인 필요':r.fare.toLocaleString('ko-KR')+'원'));
 const edit=make('button','요금 수정');edit.type='button';edit.className='secondary';edit.onclick=async()=>{const value=prompt('공용 편도요금 (1,000원 단위)',r.fare??'');if(value===null)return;const fare=Number(value);if(!Number.isInteger(fare)||fare<1000||fare>2000000||fare%1000){note.textContent='1,000원부터 2,000,000원까지 1,000원 단위로 입력해 주세요.';return;}edit.disabled=true;try{await api.rpc('th6_shared_route_save',{p_id:r.id,p_fare:fare});await reload();note.textContent='공용 구간요금을 수정했습니다.';}catch(e){note.textContent=e.message;}finally{edit.disabled=false;}};
 const disable=make('button','요금 해제');disable.type='button';disable.className='secondary';disable.onclick=async()=>{if(!confirm('이 공용 구간요금을 해제할까요? 모든 의뢰자에게 적용됩니다.'))return;disable.disabled=true;try{await api.rpc('th6_shared_route_disable',{p_id:r.id});await reload();note.textContent='구간요금을 해제했습니다.';}catch(e){note.textContent=e.message;}finally{disable.disabled=false;}};card.append(edit,disable);list.append(card);
 }if(!list.childElementCount)list.append(make('p',q?'검색 결과가 없습니다.':'저장된 구간이 없습니다.'));}
async function reload(){routes=await api.rpc('th6_route_manager_list',{});render();}
filter.oninput=render;
open.onclick=async()=>{if(!allowed)return;const stamp=++generation;form.reset();filter.value='';note.textContent='거래처와 구간요금을 불러오는 중입니다.';list.replaceChildren();save.disabled=true;dialog.showModal();try{const result=await Promise.all([api.rpc('th6_shared_partner_list',{}),api.rpc('th6_route_manager_list',{})]);if(stamp!==generation)return;[partners,routes]=result;picks.forEach(p=>p.update());render();note.textContent=partners.length<2?'먼저 공용 거래처를 두 곳 이상 등록해 주세요.':'';}catch(e){note.textContent=e.message;}finally{if(stamp===generation)save.disabled=false;}};
form.onsubmit=async event=>{event.preventDefault();if(!allowed||save.disabled||!form.reportValidity())return;save.disabled=true;note.textContent='저장 중입니다.';try{await api.rpc('th6_route_manager_save',{p_from:picks[0].select.value,p_to:picks[1].select.value,p_fare:Number(price.value)});await reload();note.textContent='공용 구간요금을 저장했습니다. 같은 주소·상세주소 구간의 다음 주문부터 적용됩니다.';}catch(e){note.textContent='저장 결과를 확인해 주세요. '+e.message;}finally{save.disabled=false;}};
window.TH_ROUTE_MANAGER={init(staff){allowed=staff?.role==='owner'&&staff.active;open.hidden=!allowed;if(!allowed){generation++;dialog.close();partners=[];routes=[];list.replaceChildren();}}};
})();
