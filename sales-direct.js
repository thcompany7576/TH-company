(()=>{
 if(!window.TH_DIRECT_MODE)return;
 const api=window.TH_API,$=id=>document.getElementById(id),params=new URLSearchParams(location.search),baseRpc=api.rpc,baseRestore=api.restore;
 let staff,profile=null,ready=null;const attempts=new Map();
 const section=document.createElement('section');section.id='directIdentity';section.innerHTML='<h2>영업자 직접 접수</h2><div class="grid"><label>의뢰자<select id="directClient"><option value="">일반 고객</option></select></label><label id="directContactLabel" hidden>의뢰자 담당자<select id="directContact"></select></label></div><div id="directGuest" class="grid"><label>고객 이름<input id="directName" maxlength="60" autocomplete="off"></label><label>고객 연락처<input id="directPhone" type="tel" maxlength="14" placeholder="010-0000-0000"></label></div><p id="directError" role="status"></p>';
 document.querySelector('main').prepend(section);
 const review=document.createElement('section');review.id='directReview';review.innerHTML='<h2>접수 처리</h2><label>처리 방식<select id="directAction"><option value="pending">영업자 확인 중으로 접수</option><option value="approved">접수·승인 후 관제로 전달</option></select></label><label>최종 운행요금 조정 (선택 · 원)<input id="directFare" type="number" min="1" max="2000000" step="1" placeholder="자동 계산 금액을 그대로 쓰려면 비워 두세요"></label><label>관제 전달 특이사항<textarea id="directNotes" rows="2" maxlength="2000" placeholder="없으면 비워 두세요"></textarea></label><label class="inline"><input id="directConfirmed" type="checkbox"> 고객과 주문 내용·최종 운행요금을 확인했습니다.</label><p id="directFareHint" class="portal-note"></p>';
 $('review').insertBefore(review,$('review').querySelector('.actions'));
 const hide=document.createElement('style');hide.textContent='main>a,#chatOpen,#soundChoose,#memberLoginOpen,#memberInstall,#accountActions,#activeOrders,#customerInbox,#requesterCard,#portalEntry,#agencyView,[data-save-partner],#partnerManagerButton{display:none!important}#directIdentity{margin-top:0}#directReview{padding:12px}';document.head.append(hide);
 function navigate(client,contact){if(($('order').elements.from.value||$('order').elements.to.value||$('order').elements.item.value)&&!confirm('고객을 바꾸면 작성 중인 주문 내용이 초기화됩니다. 바꿀까요?'))return;const url=new URL(location.href);url.searchParams.delete('client');url.searchParams.delete('contact');if(client)url.searchParams.set('client',client);if(contact)url.searchParams.set('contact',contact);location.href=url.href;}
 api.restore=()=>ready||(ready=(async()=>{await baseRestore();if(!api.session)throw Error('관리페이지에 영업자 계정으로 로그인해 주세요.');staff=(await api.api('/rest/v1/th6_staff?select=*&user_id=eq.'+api.session.user.id))[0];if(!staff?.active||staff.role!=='sales')throw Error('활성 영업자만 직접 접수할 수 있습니다.');
 const clients=await api.api('/rest/v1/th6_clients?select=*&active=eq.true&staff_id=eq.'+staff.user_id+'&order=company.asc');for(const c of clients){const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.company;$('directClient').append(opt);}
 const client=params.get('client');if(client){const c=clients.find(c=>c.id===client);if(!c)throw Error('담당하는 활성 의뢰자를 선택해 주세요.');const contacts=await api.api('/rest/v1/th6_contacts?select=*&active=eq.true&client_id=eq.'+client+'&order=name.asc');if(!contacts.length)throw Error('이 의뢰자의 활성 회원 계정을 먼저 등록해 주세요.');const who=contacts.find(x=>x.id===params.get('contact'))||(!params.has('contact')?contacts[0]:null);if(!who)throw Error('의뢰자 담당자를 다시 선택해 주세요.');
 profile={clientId:c.id,contactId:who.id,company:c.company,name:who.name,phone:who.phone,address:c.address,detail:c.detail,addressMeta:c.address_meta,sales:{name:staff.name,slug:staff.link_slug}};$('directClient').value=client;$('directGuest').hidden=true;$('directContactLabel').hidden=false;for(const x of contacts){const opt=document.createElement('option');opt.value=x.id;opt.textContent=x.name+' · '+x.phone;$('directContact').append(opt);}$('directContact').value=who.id;}
 $('directClient').onchange=()=>navigate($('directClient').value,null);$('directContact').onchange=()=>navigate(profile.clientId,$('directContact').value);$('salesRoute').textContent=staff.name+' 영업자 직접 접수';return api.session;
 })().catch(e=>{$('directError').textContent=e.message;$('portalContent').hidden=true;throw e;}));
 api.rpc=async(name,args={})=>{
 if(name==='th6_profile')return profile;
 if(name==='th6_customer_threads')return [];
 if(name==='th6_open_thread')return {id:args.p_id};
 if(name==='th6_submit_request'){
 let frozen=attempts.get(args.p_id);
 if(!frozen){const approve=$('directAction').value==='approved',stops=(args.p_payload.locations?.length||0)>2,fare=$('directFare').value===''?null:Number($('directFare').value),confirmed=$('directConfirmed').checked;
 if(approve&&!confirmed)throw Error('고객과 주문 내용·운행요금을 확인해 주세요.');if(approve&&stops&&fare===null)throw Error('경유 주문은 최종 운행요금을 확정해 입력해 주세요.');if(fare!==null&&(!Number.isInteger(fare)||fare<1||fare>2000000||!confirmed))throw Error('조정 운행요금과 고객 확인을 완료해 주세요.');
 const who=window.TH_DIRECT.person();if(!profile&&(!who.name||!/^0[0-9-]{8,13}$/.test(who.phone)))throw Error('일반 고객 이름과 연락처를 입력해 주세요.');
 frozen={...args,p_client:profile?.clientId||null,p_contact:profile?.contactId||null,p_name:who.name,p_phone:who.phone,p_approve:approve,p_fare:fare,p_notes:$('directNotes').value.trim(),p_confirmed:confirmed};attempts.set(args.p_id,frozen);document.querySelectorAll('#directReview input,#directReview select,#directReview textarea,#directIdentity input,#directIdentity select').forEach(x=>x.disabled=true);}
 const result=await baseRpc('th6_sales_submit',frozen);$('directFareHint').textContent=result.status==='approved'?'관제 배정 대기로 전달되었습니다.':'영업자 확인 중으로 접수되었습니다.';window.parent.postMessage({type:'th:direct-submitted',id:result.id,status:result.status},location.origin);return result;
 }
 return baseRpc(name,args);
 };
 window.TH_DIRECT={person:()=>profile?{name:profile.name,phone:profile.phone}:{name:$('directName').value.trim(),phone:$('directPhone').value.trim()}};
 $('newOrder').addEventListener('click',()=>location.reload());
})();
