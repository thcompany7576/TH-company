(() => {
  'use strict';
  const $ = id => document.getElementById(id), api = window.TH_API;
  const form = $('order');
  const sales = new URLSearchParams(location.search).get('sales') || '';
  const memberApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let profile = null, partners = [], mode = null, settingsReady = false, thread = null, polling = false;
  let pendingMessage = null, orderAttempt = null, loadingSettings = null, unread = 0;
  $('compactService').onchange=()=>{const c=[...document.querySelectorAll('[data-choice="serviceType"]')].find(c=>c.value===$('compactService').value);if(c&&!c.disabled){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}};
  const memoryKey = 'th6:threads';
  let inbox = [], inboxLoading = null, inboxBaseline=false, inboxPage=0; const chatDrafts=new Map();
  const orderNumber=t=>String(t.orderNumber||'확인 중');
  const statusLabels={pending:'영업자 확인 중',approved:'관제 배정 대기',assigned:'기사 배정 완료',completed:'완료',held:'보류'};
  const account=()=>profile?.contactId||'guest:'+sales;
  function updateSalesCard() {
    if(!profile)return;
    const link=document.querySelector('main > a[href]');
    const target=new URL('index.html',location.href);
    target.searchParams.set('member','1');
    if(profile.sales?.slug)target.searchParams.set('sales',profile.sales.slug);
    link.href=target.href;
    $('salesRoute').textContent=profile.sales?profile.sales.name+' 담당 접수 · 주문과 문의가 담당자에게 전달됩니다.':'담당 영업자 확인이 필요합니다. 사무실에 문의해 주세요.';
  }
  const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
  function savedThreads() {
    try { return JSON.parse(localStorage.getItem(memoryKey) || '[]').filter(t => t?.id && /^[a-f0-9]{64}$/.test(t.token)); } catch { return []; }
  }
  function rememberThread() {
    const rows = savedThreads().filter(t => t.id !== thread.id);
    try { localStorage.setItem(memoryKey, JSON.stringify([thread, ...rows].slice(0, 100))); } catch {
      $('chatError').textContent = '이 기기에서는 문의 확인정보를 보관할 수 없습니다. 페이지를 닫기 전에 답변을 확인해 주세요.';
    }
    renderThreadSelector();
  }
  function randomToken() { return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join(''); }
  async function refreshSettings() {
    if (loadingSettings) return loadingSettings;
    loadingSettings = (async () => {
      const settings = await api.rpc('th6_public_settings');
      if (typeof settings?.nightEnabled !== 'boolean') throw Error('요금 설정을 불러오지 못했습니다.');
      const changed = window.TH_PORTAL.nightEnabled !== settings.nightEnabled || window.TH_PORTAL.nightRate !== settings.nightRate;
      window.TH_PORTAL.nightEnabled = settings.nightEnabled; window.TH_PORTAL.nightRate = settings.nightRate; settingsReady = true;
      for (const control of document.querySelectorAll('[data-choice="serviceType"]')) {
        if (control.value === '일반 배송') continue;
        control.disabled = !settings.services?.[control.value];
        const note = control.parentElement.querySelector('[data-service-state]');
        if (note) note.textContent = control.disabled ? '서비스 준비중' : '';
        const option=[...$('compactService').options].find(o=>o.value===control.value);if(option){option.disabled=control.disabled;option.textContent=control.value+(control.disabled?' · 준비 중':'');}
      }
      if (changed) { form.dispatchEvent(new Event('change', { bubbles: true })); if (!$('review').hidden) window.TH_FARE.renderReview(window.TH_MAP.getDistance()); }
      return settings;
    })();
    try { return await loadingSettings; } finally { loadingSettings = null; }
  }
  const loginDialog=document.createElement('dialog');loginDialog.className='chat-dialog';loginDialog.id='clientLoginDialog';
  const loginClose=text('button','닫기','secondary');loginClose.type='button';loginClose.onclick=()=>loginDialog.close();
  $('portalEntry').before(loginDialog);
  if (!memberApp) loginDialog.append(loginClose,$('portalEntry'));
  function requireMember() {
    if (memberApp && (!profile || !api.session)) {
      showEntry();
      throw Error('회원 로그인 후 이용해 주세요.');
    }
  }
  if (memberApp) {
    $('guestOrderButton').hidden=true;
    $('memberLoginOpen').hidden=true;
    $('chatOpen').hidden=true;
    $('soundChoose').hidden=true;
    $('customerLogout').textContent='로그아웃';
    $('portalEntry').querySelector('p').textContent='주문 앱은 회원 로그인 후 이용할 수 있습니다.';
  }
  $('memberLoginOpen').onclick=()=>{$('portalEntry').hidden=false;loginDialog.showModal();$('loginId').focus();};
  function paymentChoices(targetForm=form,doc=document){
    const select=targetForm.elements.paymentMethod;if(!select)return;select.replaceChildren();
    const blank=text('option','결제 방법을 선택해 주세요');blank.value='';blank.disabled=blank.selected=true;select.append(blank);
    for(const [value,label] of profile?[['신용','신용 · 의뢰자 결제'],['선불','선불 · 출발지 결제'],['착불','착불 · 도착지 결제']]:[['카드','카드'],['현금','현금']]){const option=text('option',label);option.value=value;select.append(option);}
    const split=doc.getElementById('splitPayment');if(split){split.checked=false;split.disabled=false;split.closest('label').hidden=false;}
    const pair=doc.getElementById('splitPair');if(pair){for(const option of pair.options){option.hidden=option.disabled=!profile&&option.value!=='from-to';}pair.value='from-to';}
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function showEntry() {
    window.TH_CONTRACT.load(null);profile=null;partners=[];thread=null;inbox=[];inboxBaseline=false;chatDrafts.clear();$('chatBody').value='';
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    $('chatLog').replaceChildren();$('partnerList').replaceChildren();
    orderAttempt=null;pendingMessage=null;
    if (memberApp) {
      mode=null;
      $('portalContent').hidden=true;$('accountActions').hidden=true;$('memberInstall').hidden=true;
      $('chatOpen').hidden=true;$('soundChoose').hidden=true;$('portalEntry').hidden=false;
      return;
    }
    enter('guest').catch(e=>$('entryError').textContent=e.message);
  }
  async function enter(nextMode) {
    if(memberApp && (!profile || !api.session)){showEntry();return;}
    await refreshSettings(); mode = nextMode;inbox=[];inboxBaseline=false;chatDrafts.clear();$('chatBody').value='';loginDialog.close();paymentChoices();
    const agencyDoc=$('agencyFrame').contentDocument;if(agencyDoc?.getElementById('order'))paymentChoices(agencyDoc.getElementById('order'),agencyDoc);
    $('memberInstall').hidden=!profile;$('memberLoginOpen').hidden=Boolean(profile);
    $('chatOpen').hidden=false;$('soundChoose').hidden=false;
    window.TH_SOUNDS.init(profile?.contactId||'customer-device');
    $('portalEntry').hidden = true; $('portalContent').hidden = false;
    $('accountActions').hidden = false; $('accountName').textContent = profile ? profile.company + ' · ' + profile.name : '로그인 없이 주문';
    $('partnerManagerButton').hidden = !profile;
    $('customerLogout').hidden=!profile;
    $('requesterProfile').hidden = !profile; $('requesterCard').hidden = !profile;
    if (profile) {
      await window.TH_CONTRACT.load(profile.clientId);updateSalesCard();
      $('profileCompany').textContent = profile.company; $('profileName').textContent = profile.name;
      $('profilePhone').textContent = profile.phone; $('profileAddress').textContent = (profile.address + ' ' + profile.detail).trim() || '등록 주소 없음';
      await loadPartners();
    }
    document.querySelectorAll('.partner-tools').forEach(el => el.hidden = !profile);
    thread = savedThreads().find(t => t.account === (profile?.contactId || 'guest:' + sales)) || null;
    renderThreadSelector();await refreshInbox();
  }
  function person(forOrder = false) {
    if (profile) return { name: profile.name, phone: profile.phone };
    if(!forOrder&&thread?.orderId)return {name:thread.name,phone:thread.phone};
    const sender = { name: form.elements.sender.value.trim(), phone: form.elements.senderPhone.value.trim() };
    return forOrder ? sender : {
      name: $('chatGuestName').value.trim() || thread?.name || sender.name,
      phone: $('chatGuestPhone').value.trim() || thread?.phone || sender.phone
    };
  }
  function formatMobile(value) {
    const v = value.replace(/\D/g, '').slice(0,11);
    return v.length<=3?v:v.length<=7?v.slice(0,3)+'-'+v.slice(3):v.slice(0,3)+'-'+v.slice(3,v.length===11?7:6)+'-'+v.slice(v.length===11?7:6);
  }
  for (const id of ['chatGuestPhone','partner_phone']) $(id).addEventListener('input', () => { $(id).value = formatMobile($(id).value); });
  async function ensureThread(forOrder = false) {
    requireMember();
    const who = person(forOrder);
    if (!who.name || !/^[0-9-]{9,14}$/.test(who.phone)) throw Error(forOrder ? '출발지 성명과 연락처를 입력해 주세요.' : '문의 성명과 연락처를 입력해 주세요.');
    if (!thread || thread.account !== (profile?.contactId || 'guest:' + sales) || (forOrder && thread.orderId) ||
        (!profile && (thread.name !== who.name || thread.phone !== who.phone))) {
      thread = { id: crypto.randomUUID(), token: randomToken(), account: profile?.contactId || 'guest:' + sales, time: Date.now(), name: who.name, phone: who.phone };
      rememberThread();
    }
    await api.rpc('th6_open_thread', { p_id: thread.id, p_token: thread.token, p_name: who.name, p_phone: who.phone, p_sales: sales || null });
    return thread;
  }
  async function readChat() {
    if (!thread) return;
    const stamp = thread.id;
    const data = await api.rpc('th6_read_thread', { p_thread: thread.id, p_token: thread.token });
    if (stamp !== thread?.id||!$('chatDialog').open) return;
    if (data.orderId) { thread.orderId = data.orderId;thread.orderNumber=data.orderNumber; rememberThread(); }
    const log = $('chatLog'), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    for (const message of data.messages || []) {
      const bubble = text('div', message.body, 'chat-bubble ' + message.sender);
      bubble.append(text('time', new Date(message.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })));
      log.append(bubble);
    }
    if (!log.children.length) log.append(text('p', '문의사항을 남겨 주세요. 사무실에서 확인 후 답변합니다.', 'muted'));
    if (atBottom) log.scrollTop = log.scrollHeight;
    $('chatStatus').textContent = data.orderId ? '주문 ' + orderNumber(data) + ' · ' + ({ pending: '영업자 확인 중', approved: '관제 배정 대기', assigned: '기사 배정 완료', completed: '완료', held: '보류', cancelled: '취소' }[data.status] || '문의') : '사무실 문의';
    $('chatForm').hidden=data.status==='completed';
    if(data.status==='completed')log.append(text('p','완료된 주문의 대화는 정리되었습니다. 추가 문의는 일반 이용문의를 이용해 주세요.'));
    unread = 0; $('chatUnread').hidden = true;
  }
  async function refreshInbox() {
    if(inboxLoading)return inboxLoading;
    const who=account();
    inboxLoading=(async()=>{
      const known=savedThreads().filter(t=>profile?t.account===who:String(t.account||'').startsWith('guest:'));
      const data=await api.rpc('th6_customer_threads',{p_threads:known.map(t=>({id:t.id,token:t.token}))});
      if(account()!==who)return;
      const live=new Set(data.map(t=>t.id)), checked=new Set(known.map(t=>t.id));
      try{localStorage.setItem(memoryKey,JSON.stringify(savedThreads().filter(t=>!checked.has(t.id)||live.has(t.id)).slice(0,100)));}catch{}
      if(inboxBaseline){
        const changed=data.filter(t=>{const old=inbox.find(r=>r.id===t.id);return old&&((Number(t.unread)>0&&t.updatedAt!==old.updatedAt)||t.status!==old.status||t.fare!==old.fare);});
        if(changed.length){const t=changed[0],old=inbox.find(r=>r.id===t.id);const kind=t.status!==old.status?({assigned:'assigned',completed:'completed',held:'held',approved:'approved',pending:'restored'}[t.status]||'reply'):t.fare!==old.fare?'fare':'reply';await window.TH_SOUNDS.play(kind);}
      }
      inboxBaseline=true;inbox=data;
      if($('chatDialog').open&&thread&&!inbox.some(t=>t.id===thread.id)){const removed=thread.id;$('chatDialog').close();chatDrafts.delete(removed);thread=null;$('chatLog').replaceChildren();$('customerInboxError').textContent='완료되거나 보관 기간이 지난 대화입니다.';}
      renderThreadSelector();renderInbox();renderActiveOrders();
      unread=inbox.reduce((sum,t)=>sum+Number(t.unread||0),0);$('chatUnread').textContent=unread;$('chatUnread').hidden=!unread;
    })();try{await inboxLoading;}finally{inboxLoading=null;}
  }
  function chooseThread(t) {
    const saved=savedThreads().find(r=>r.id===t.id&&(profile?r.account===account():String(r.account||'').startsWith('guest:')));
    if(!saved&&!profile)throw Error('이 기기의 문의 확인정보가 없습니다.');
    thread={...t,...saved,id:t.id,orderId:t.orderId,orderNumber:t.orderNumber,name:t.name,phone:t.phone,account:account(),token:saved?.token||randomToken(),time:saved?.time||new Date(t.time).getTime()};rememberThread();
    $('chatIdentity').hidden=true;$('chatGuestName').value=thread.name||'';$('chatGuestPhone').value=thread.phone||'';
  }
  function renderActiveOrders() {
    const root=$('activeOrderList');root.replaceChildren();
    const active=inbox.filter(t=>t.orderId&&['pending','approved','assigned','held'].includes(t.status));
    $('activeOrders').hidden=!active.length;
    $('activeOrderCount').textContent=active.length+'건';
    for(const t of active){
      const b=text('button','','customer-order-item inquiry-item'+(t.unread?' unread':''));b.type='button';b.setAttribute('aria-haspopup','dialog');
      const top=text('span','','inquiry-top');top.append(text('strong','주문 '+orderNumber(t)));
      if(t.unread)top.append(text('span',String(t.unread),'chat-unread'));
      b.append(top,text('strong',statusLabels[t.status]),text('small',Number.isFinite(t.fare)?'운행요금 '+t.fare.toLocaleString('ko-KR')+'원':'요금 확인 중'));
      const locations=Array.isArray(t.locations)?t.locations:[];
      if(locations.length)b.append(text('span',locations.map(p=>(p.label||'주소')+' · '+(p.address||'')).join(' → '),'inquiry-preview'));
      b.append(text('small','눌러서 주문 안내 · 대화 확인'));
      b.onclick=()=>openConversation(t).catch(e=>$('activeOrderError').textContent=e.message);root.append(b);
    }
    $('activeOrderError').textContent='';
  }
  function renderInbox() {
    const root=$('customerOrderList');root.replaceChildren();
    inboxPage=Math.min(inboxPage,Math.max(0,Math.ceil(inbox.length/14)-1));const start=inboxPage*14;
    for(const t of inbox.slice(start,start+14)){
      const b=text('button','','customer-order-item inquiry-item'+(t.unread?' unread':''));b.type='button';b.setAttribute('aria-haspopup','dialog');b.dataset.threadId=t.id;
      const top=text('span','','inquiry-top');top.append(text('strong',t.orderId?'주문 '+orderNumber(t):'일반 이용문의'));
      if(t.unread)top.append(text('span',String(t.unread),'chat-unread'));
      top.append(text('time',new Date(t.updatedAt||t.time).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false})));
      b.append(top,text('span',t.lastBody||'대화를 열어 내용을 확인하세요.','inquiry-preview'));
      b.append(text('small',t.orderId?(statusLabels[t.status]||'접수')+(Number.isFinite(t.fare)?' · '+t.fare.toLocaleString('ko-KR')+'원':''):'담당 영업자와 이용문의'));
      b.onclick=()=>openConversation(t).catch(e=>$('customerInboxError').textContent=e.message);root.append(b);
    }
    if(!inbox.length)root.append(text('p','접수한 주문이나 문의가 없습니다.'));
    $('customerThreadCount').textContent=inbox.length?(start+1)+'–'+Math.min(start+14,inbox.length)+' / '+inbox.length+'건':'';
    $('customerThreadPrev').disabled=inboxPage===0;$('customerThreadNext').disabled=start+14>=inbox.length;
  }
  $('customerThreadPrev').onclick=()=>{inboxPage--;renderInbox();};
  $('customerThreadNext').onclick=()=>{inboxPage++;renderInbox();};
  $('customerInboxClose').onclick=()=>$('customerInboxDialog').close();
  $('chatDialog').addEventListener('close',()=>{chatDrafts.set(thread?.id||'new',$('chatBody').value);});
  async function openConversation(t) {
    requireMember();
    if(t)chooseThread(t);else thread=null;
    $('chatError').textContent='';$('chatBody').value=chatDrafts.get(thread?.id||'new')||'';pendingMessage=null;
    $('customerChatTitle').textContent=t?.orderId?'주문 '+orderNumber(t)+' · 대화':'이용 문의사항';
    $('chatForm').hidden=Boolean(t?.closed);$('chatIdentity').hidden=Boolean(profile)||Boolean(thread);
    if(!profile){const who=person(true);$('chatGuestName').value=thread?.name||who.name;$('chatGuestPhone').value=thread?.phone||who.phone;}
    $('chatLog').replaceChildren();$('chatStatus').textContent=t?.orderId?(statusLabels[t.status]||'주문 문의'):'새 이용문의';
    if(!$('chatDialog').open)$('chatDialog').showModal();
    if(thread){try{await readChat();await refreshInbox();$('chatLog').scrollTop=$('chatLog').scrollHeight;}catch(e){$('chatError').textContent=e.message;}}
    if(!$('chatForm').hidden)$('chatBody').focus();
  }
  function renderThreadSelector() {
    const select = $('chatThread'); select.replaceChildren();
    const rows = inbox.length?inbox:savedThreads().filter(t => t.account === account());
    for (const t of rows) { const opt = text('option', (t.orderId ? '주문 ' + orderNumber(t) : '문의') + ' · ' + new Date(t.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })); opt.value = t.id; select.append(opt); }
    select.hidden = true; if (thread) select.value = thread.id;
  }
  async function openChat() {
    requireMember();
    $('customerInboxError').textContent='';
    if(!$('customerInboxDialog').open)$('customerInboxDialog').showModal();
    try{await refreshInbox();}catch(e){$('customerInboxError').textContent=e.message;}
  }
  $('chatClose').onclick=()=>$('chatDialog').close();
  $('chatOpen').onclick=openChat;
  document.querySelectorAll('[data-open-chat]').forEach(b=>b.onclick=openChat);
  $('chatThread').onchange=()=>{};
  $('chatNew').onclick=()=>openConversation(null);
  $('chatForm').onsubmit = async e => {
    e.preventDefault(); if (!$('chatBody').value.trim()) return;
    $('chatSend').disabled = true; $('chatError').textContent = '';
    try {
      const t = await ensureThread();
      const body = $('chatBody').value.trim();
      if (!pendingMessage || pendingMessage.body !== body || pendingMessage.thread !== t.id) pendingMessage = { id: crypto.randomUUID(), body, thread: t.id };
      await api.rpc('th6_send_message', { p_thread: t.id, p_token: t.token, p_body: body, p_message: pendingMessage.id });
      pendingMessage = null;chatDrafts.delete(t.id);chatDrafts.delete('new');if(thread?.id===t.id){$('chatBody').value='';$('chatIdentity').hidden=true;await readChat();}await refreshInbox();
    } catch (e) { $('chatError').textContent = e.message; }
    finally { $('chatSend').disabled = false; }
  };
  $('customerLogin').onsubmit = async e => {
    e.preventDefault(); $('customerLoginButton').disabled = true; $('entryError').textContent = '';
    try {
      const id = $('loginId').value.trim().toLowerCase();
      if (!/^[a-z0-9_]{4,32}$/.test(id)) throw Error('사무실에서 안내받은 아이디를 입력해 주세요.');
      await api.login(id + '@login.th-company.invalid', $('loginPassword').value, $('customerRemember').checked);
      profile = await api.rpc('th6_profile');
      if (!profile) { await api.logout(); throw Error('사용 가능한 등록 고객 계정이 아닙니다. 사무실에 문의해 주세요.'); }
      $('loginPassword').value = ''; await enter('member');
    } catch (e) { $('entryError').textContent = e.message; }
    finally { $('customerLoginButton').disabled = false; }
  };
  $('guestOrderButton').onclick = async () => {
    if(memberApp){showEntry();return;}
    $('entryError').textContent = ''; $('guestOrderButton').disabled = true;
    try { await api.logout(); profile = null; await enter('guest'); }
    catch (e) { $('entryError').textContent = e.message; }
    finally { $('guestOrderButton').disabled = false; }
  };
  $('customerLogout').onclick = async () => {
    await api.logout(); location.reload();
  };
  function extraPartnerChoice(box) {
    let wrap=box.querySelector('[data-extra-partner-wrap]');
    if(!wrap){wrap=document.createElement('label');wrap.dataset.extraPartnerWrap='';wrap.append(text('span','거래처 선택'));const select=document.createElement('select');select.dataset.extraPartner='';select.setAttribute('aria-label','경유지 거래처 선택');wrap.append(select);box.querySelector('legend').after(wrap);}
    wrap.hidden=!profile;const select=wrap.querySelector('select'),value=select.value;select.replaceChildren(new Option('저장한 거래처 선택',''));
    for(const p of partners)select.append(new Option(p.title,p.id));select.value=value;
    select.onchange=()=>{
      const p=partners.find(p=>p.id===select.value);if(!p||!profile)return;
      const address=box.querySelector('[data-searched-address]');address.value=p.address;
      Object.assign(address.dataset,p.address_meta||{});address.dataset.selectedAddress=p.address;address.dataset.businessName=p.title;address.dataset.businessAddress=p.address;address.dataset.businessDetail=p.detail||'';
      box.querySelector('[data-extra-detail]').value=p.detail||'';box.querySelector('[data-extra-person]').value=p.person||'';box.querySelector('[data-phone]').value=p.phone||'';
      address.dispatchEvent(new Event('input',{bubbles:true}));address.dispatchEvent(new Event('change',{bubbles:true}));
    };
  }
  window.addEventListener('th:extra-added',e=>extraPartnerChoice(e.detail));
  async function loadPartners() {
    if (!profile) return;
    partners = await api.api('/rest/v1/th6_partners?select=*&client_id=eq.' + profile.clientId + '&order=title.asc');
    for (const select of document.querySelectorAll('[data-partner-select]')) {
      const value = select.value; select.replaceChildren(); const blank = text('option', '저장한 거래처 선택'); blank.value = ''; select.append(blank);
      for (const p of partners) { const opt = text('option', p.title); opt.value = p.id; select.append(opt); }
      select.value = value;
    }
    document.querySelectorAll("fieldset.stop").forEach(extraPartnerChoice);
    renderPartners();
  }
  function fillLocation(prefix, location) {
    const from = prefix === 'from', address = form.elements[prefix];
    address.dataset.businessName=location.title||location.company||'';address.dataset.businessAddress=location.address||'';address.dataset.businessDetail=location.detail||'';
    address.value = location.address; for (const key of ['selectedAddress', 'areaCode', 'township', 'county']) delete address.dataset[key];
    Object.assign(address.dataset, location.address_meta || location.addressMeta || {}); address.dataset.selectedAddress = location.address;
    form.elements[prefix + 'Detail'].value = location.detail || '';
    form.elements[from ? 'sender' : 'receiver'].value = location.person || location.name || '';
    form.elements[from ? 'senderPhone' : 'receiverPhone'].value = location.phone || '';
    address.dispatchEvent(new Event('input', { bubbles: true })); address.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.querySelectorAll('[data-partner-select]').forEach(select => select.onchange = () => {
    const selected = partners.find(p => p.id === select.value); if (selected) fillLocation(select.dataset.partnerSelect, selected);
  });
  document.querySelectorAll('[data-same-profile]').forEach(check => check.onchange = () => {
    if (!check.checked || !profile) return;
    if (!profile.address) { check.checked = false; $('formError').textContent = '사무실에 의뢰자 주소 등록을 요청해 주세요.'; return; }
    fillLocation(check.dataset.sameProfile, profile);
  });
  document.querySelectorAll('[data-save-partner]').forEach(button => button.onclick = async () => {
    const prefix = button.dataset.savePartner, from = prefix === 'from', address = form.elements[prefix];
    if (!profile || !address.value || address.dataset.selectedAddress !== address.value.trim()) { $('formError').textContent = '주소를 검색해서 선택해 주세요.'; return; }
    const title = prompt('거래처 이름을 입력해 주세요.'); if (!title?.trim()) return;
    button.disabled = true;
    try {
      await api.api('/rest/v1/th6_partners', { method: 'POST', body: JSON.stringify({ client_id: profile.clientId, title: title.trim(),
        address: address.value, detail: form.elements[prefix + 'Detail'].value, person: form.elements[from ? 'sender' : 'receiver'].value,
        phone: form.elements[from ? 'senderPhone' : 'receiverPhone'].value, address_meta: addressMeta(address) }) });
      await loadPartners(); $('formError').textContent = '거래처에 저장했습니다.';
    } catch (e) { $('formError').textContent = e.message; }
    finally { button.disabled = false; }
  });
  function addressMeta(input) { return Object.fromEntries(['areaCode', 'township', 'county'].map(k => [k, input.dataset[k] || ''])); }
  function renderPartners() {
    const root = $('partnerList'); root.replaceChildren();
    for (const p of partners) {
      const card = text('div', '', 'partner-card'); card.append(text('strong', p.title), text('p', p.address + ' ' + p.detail), text('p', p.person + ' · ' + p.phone));
      const actions = text('div', '', 'actions'), edit = text('button', '수정', 'secondary'), remove = text('button', '삭제', 'secondary');
      edit.type = remove.type = 'button'; edit.onclick = () => editPartner(p);
      remove.onclick = async () => {
        if (!confirm(p.title + ' 거래처를 삭제할까요?')) return; remove.disabled = true;
        try { await api.api('/rest/v1/th6_partners?id=eq.' + p.id, { method: 'DELETE' }); await loadPartners(); }
        catch (e) { $('partnerError').textContent = e.message; remove.disabled = false; }
      };
      actions.append(edit, remove); card.append(actions); root.append(card);
    }
    if (!partners.length) root.append(text('p', '저장한 거래처가 없습니다. 출발지·도착지를 입력하고 거래처에 저장할 수 있습니다.', 'muted'));
  }
  let editingPartner = null;
  function editPartner(p) {
    editingPartner = p || { id: null }; $('partnerEditor').hidden = false;
    for (const key of ['title', 'address', 'detail', 'person', 'phone']) $('partner_' + key).value = p?.[key] || '';
    $('partner_address').dataset.meta = JSON.stringify(p?.address_meta || {});
    $('partner_title').focus();
  }
  $('partnerManagerButton').onclick = async () => { $('partnerError').textContent = ''; $('partnerEditor').hidden = true; $('partnerDialog').showModal(); try { await loadPartners(); } catch (e) { $('partnerError').textContent = e.message; } };
  $('partnerClose').onclick = () => $('partnerDialog').close();
  $('partnerAdd').onclick = () => editPartner(null);
  $('partnerEditorCancel').onclick = () => $('partnerEditor').hidden = true;
  $('partner_address').onclick = async () => {
    try { const chosen = await window.TH_ADDRESS.pick(); if (!chosen) return; $('partner_address').value = chosen.address; $('partner_address').dataset.meta = JSON.stringify(chosen.meta); }
    catch (e) { $('partnerError').textContent = e.message; }
  };
  $('partnerEditor').onsubmit = async e => {
    e.preventDefault(); $('partnerSave').disabled = true;
    try {
      const values = Object.fromEntries(['title', 'address', 'detail', 'person', 'phone'].map(k => [k, $('partner_' + k).value.trim()]));
      if (!values.address) throw Error('주소를 검색해서 선택해 주세요.');
      await api.api('/rest/v1/th6_partners' + (editingPartner.id ? '?id=eq.' + editingPartner.id : ''), { method: editingPartner.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...values, client_id: profile.clientId, address_meta: JSON.parse($('partner_address').dataset.meta || '{}') }) });
      $('partnerEditor').hidden = true; await loadPartners();
    } catch (e) { $('partnerError').textContent = e.message; }
    finally { $('partnerSave').disabled = false; }
  };
  function reviewCards(targetForm = form, targetDoc = document) {
    const summary = targetDoc.getElementById('summary');
    let cards = targetDoc.getElementById('reviewCards');
    if (!cards) { cards = targetDoc.createElement('div'); cards.id = 'reviewCards'; summary.before(cards); }
    cards.replaceChildren();
    const grid = text('div', '', 'review-locations');
    for (const prefix of ['from','to']) {
      const from = prefix === 'from', card = text('div', '', 'review-location');
      card.append(text('h3', from ? '출발지' : '도착지'));
      for (const field of [prefix, prefix + 'Detail']) { const v = targetForm.elements[field]?.value; if (v) card.append(text('p', v)); }
      card.append(text('p', [targetForm.elements[from ? 'sender' : 'receiver']?.value, targetForm.elements[from ? 'senderPhone' : 'receiverPhone']?.value].filter(Boolean).join(' · ')));
      if (targetDoc.getElementById(prefix + 'Scheduled')?.checked) card.append(text('p', targetDoc.getElementById(prefix + 'Date').value + ' ' + targetDoc.getElementById(prefix + 'Time').value));
      grid.append(card);
    }
    cards.append(grid);
    const details = text('div', '', 'review-details');
    const omitted = /^(출발:|도착:|출발지 성명:|도착지 성명:|출발 희망 시간:|도착 희망 시간:)/;
    for (const line of summary.textContent.split('\n').filter(s => s && !omitted.test(s))) details.append(text('p', line));
    cards.append(details); summary.hidden = true;
  }
  function payload(targetForm = form) {
    const values = Object.fromEntries(new FormData(targetForm).entries());
    if(targetForm===form){for(const id of ['paymentMethod','splitPair','splitRatio'])values[id]=$(id).value;values.splitPayment=$('splitPayment').checked?'on':'';}
    return { contract:targetForm===form?window.TH_CONTRACT.data():null,service: values.serviceType || '일반 배송', fields: values, nightEnabled: window.TH_PORTAL.nightEnabled, nightRate: window.TH_PORTAL.nightRate,
      quote: targetForm === form ? window.TH_FARE.quote(window.TH_MAP.getDistance()) : null,
      locations: targetForm === form ? window.TH_ORDER.routeLocations().map(p => ({ label: p.label, businessName: p.businessName||'', address: p.address.value, detail: p.detail.value, person: p.person.value, phone: p.phone.value })) : [] };
  }
  async function submit(targetForm, summaryText, targetDoc) {
    const button = targetDoc.getElementById('sms'), edit = targetDoc.getElementById('edit'), message = targetDoc.getElementById('message');
    button.disabled = edit.disabled = true;
    try {
      const previousContract=JSON.stringify(window.TH_CONTRACT.data());if(profile&&targetForm===form){await window.TH_CONTRACT.load(profile.clientId);if(previousContract!==JSON.stringify(window.TH_CONTRACT.data())){orderAttempt=null;window.TH_FARE.renderReview(window.TH_MAP.getDistance());throw Error('구간 약정요금이 변경되었습니다. 요금과 결제를 다시 확인해 주세요.');}}
      const previousNight = window.TH_PORTAL.nightRate; await refreshSettings();
      requireMember();
      if (targetForm === form && previousNight !== window.TH_PORTAL.nightRate) throw Error('야간요금 적용 시간이 바뀌었습니다. 최종 요금을 다시 확인하고 접수해 주세요.');
      const t = orderAttempt?.context || await ensureThread(true);
      if (!orderAttempt) orderAttempt = { id: crypto.randomUUID(), thread: t.id, context: { ...t }, summary: summaryText, payload: payload(targetForm) };
      message.textContent = '주문을 접수하고 있습니다…';
      const result = await api.rpc('th6_submit_request', { p_id: orderAttempt.id, p_thread: t.id, p_token: t.token, p_summary: orderAttempt.summary, p_payload: orderAttempt.payload });
      t.orderId = result.id;t.orderNumber=result.orderNumber; thread = t; rememberThread(); orderAttempt = null;await refreshInbox();
      message.textContent = '주문 요청이 접수되었습니다. 주문번호: ' + orderNumber(result) + ' · 이용 문의사항에서 답변과 배정 알림을 확인해 주세요.';
      button.textContent = '접수 완료'; targetDoc.getElementById('newOrder').hidden = false;
    } catch (e) {
      if(e.message.includes('야간요금 적용 시간이 변경되었습니다.')){orderAttempt=null;await refreshSettings().catch(()=>{});}
      message.textContent = e.message;
      button.disabled = false;
      // 전송 결과가 불확실한 경우 같은 주문번호로 재시도하도록 내용 수정은 잠근다.
      if (!orderAttempt) edit.disabled = false;
    }
  }
  $('sms').onclick = () => submit(form, window.TH_FARE.orderText(), document);
  const originalSubmit = form.onsubmit;
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      if (!mode) throw Error('주문 화면을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      requireMember();
      if (profile) { const fresh = await api.rpc('th6_profile'); if (!fresh) throw Error('계정이 비활성화되었습니다. 사무실에 문의해 주세요.'); profile = fresh; }
      await refreshSettings();if(profile)await window.TH_CONTRACT.load(profile.clientId); originalSubmit(e);
      if (!$('review').hidden) {
        const who = person(true); if (profile) $('summary').textContent = '[의뢰자] ' + profile.company + ' / ' + who.name + ' / ' + who.phone + '\n\n' + $('summary').textContent;
        reviewCards();
      }
    } catch (error) { $('formError').textContent = error.message; }
    finally { button.disabled = false; }
  };
  // 대행 화면은 기존 별도 양식/요금 안내를 유지하면서 접수와 문의만 새 경로로 연결한다.
  $('agencyFrame').addEventListener('load', () => {
    const doc = $('agencyFrame').contentDocument;
    if (!doc?.getElementById('order')) return;
    paymentChoices(doc.getElementById('order'),doc);
    const style = doc.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('portal.css', location.href).href; doc.head.append(style);
    doc.getElementById('sms').onclick = () => submit(doc.getElementById('order'), doc.getElementById('summary').textContent, doc);
    doc.querySelectorAll('a[href*="open.kakao.com"]').forEach(a => { a.textContent = '💬 이용 문의사항 💬'; a.removeAttribute('target'); a.href = '#'; a.onclick = e => { e.preventDefault(); openChat(); }; });
  });
  window.TH_PORTAL = { nightEnabled: false, nightRate: 0, get profile() { return profile; }, refreshSettings };
  async function tick() {
    if (document.hidden || polling || !mode) return; polling = true;
    try {
      await refreshSettings();
      await refreshInbox();
      if(profile){const current=await api.rpc('th6_profile');if(!current){await api.logout();return;}profile=current;updateSalesCard();}
      if ($('chatDialog').open && thread){await readChat();await refreshInbox();}
    } catch (e) { if ($('chatDialog').open) $('chatError').textContent = e.message; $('activeOrderError').textContent='주문 상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.'; }
    finally { polling = false; }
  }
  setInterval(tick, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('th:session', () => { if (!api.session && profile) showEntry(); });
  (async () => {
    if (sales) try {
      const route = await api.rpc('th6_public_route', { p_slug: sales });
      if (!route) throw Error('사용할 수 없는 영업자 링크입니다. 안내받은 주소를 확인해 주세요.');
      $('salesRoute').textContent = route.name + ' 담당 접수 · 주문과 문의가 담당자에게 전달됩니다.';
    } catch (e) { $('entryError').textContent = e.message; $('guestOrderButton').disabled = true; $('chatOpen').disabled = true; return; }
    await api.restore();
    try {
      await refreshSettings();
      if (api.session) { profile = await api.rpc('th6_profile');if(!profile)await api.logout(); }
      await enter(profile?'member':'guest');
    } catch (e) { $('entryError').textContent = e.message; }
  })();
})();
