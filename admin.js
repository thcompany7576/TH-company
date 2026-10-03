(() => {
  'use strict';
  const $ = id => document.getElementById(id), api = window.TH_API;
  let staff = null, staffRows = [], rows = [], clients = [], threads = [], contacts = [], clientPartners = [];
  let status = 'pending', page = 'orders', offset = 0, generation = 0, currentThread = null, currentClient = null;
  let replyAttempt = null, resetContact = null, polling = false, seenOrders = new Map(), seenThreads = new Map(), baseline = false;
  
  let creatingControl = false;
  let pollCursor = null;
  const labels = { pending: '영업자 확인 중', approved: '관제 배정 대기', assigned: '배정 완료', completed: '완료', held: '보류', cancelled: '취소' };
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  const button = (value, action, cls = 'secondary') => { const e = text('button', value, cls); e.type = 'button'; e.onclick = action; return e; };
  const notice = value => $('notice').textContent = value;
  const owner = () => staff?.role === 'owner';
  const representative = () => Boolean(staff?.is_representative);
  const clientManager = () => representative() || staff?.role === 'sales';
  const koreaTime = value => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  async function accountAction(args) { return api.api('/functions/v1/manage-client-account', { method: 'POST', body: JSON.stringify(args) }); }
  function showOwnCard() {
    const enabled=staff?.active&&staff.role==='sales';$('ownCard').hidden=!enabled;
    if(!enabled){$('ownCardLink').removeAttribute('href');$('ownCardLink').textContent='';return;}
    const link=new URL('index.html',location.href);link.searchParams.set('v','brand2');if(staff.link_slug)link.searchParams.set('sales',staff.link_slug);
    $('ownCardTitle').textContent=staff.name+'님의 온라인명함';$('ownCardLink').href=link.href;$('ownCardLink').textContent=link.href;
  }
  $('ownCardCopy').onclick=async()=>{
    if(!staff?.active||staff.role!=='sales')return;
    try{await navigator.clipboard.writeText($('ownCardLink').href);$('ownCardNotice').textContent='명함 링크를 복사했습니다.';}
    catch{$('ownCardNotice').textContent='아래 링크를 선택해서 복사해 주세요.';const selection=getSelection(),range=document.createRange();range.selectNodeContents($('ownCardLink'));selection.removeAllRanges();selection.addRange(range);}
  };
  async function enter() {
    const list = await api.api('/rest/v1/th6_staff?select=*&user_id=eq.' + api.session.user.id);
    staff = list[0]; if (!staff?.active) { await api.logout(); throw Error('관리 권한이 없거나 비활성화된 계정입니다.'); }
    window.TH_SOUNDS.init(staff.user_id);
    await window.TH_PUSH.init(staff);
    $('adminTitle').textContent = 'TH company-' + (owner() ? '관제' : staff.name);
    $('ownCardNotice').textContent='';showOwnCard();
    status = owner() ? 'approved' : 'pending';
    document.querySelector('[data-page=chat]').hidden = owner();
    document.querySelectorAll('[data-status]').forEach(b=>{b.hidden=owner()&&b.dataset.status==='pending';b.className=b.dataset.status===status?'':'secondary';b.setAttribute('aria-pressed',String(b.dataset.status===status));});
    $('login').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
    document.querySelectorAll('[data-owner-only]').forEach(e => e.hidden = !owner());
    document.querySelectorAll('[data-representative-only]').forEach(e => e.hidden = !representative());
    document.querySelector('[data-page=clients]').hidden = !clientManager();
    document.querySelectorAll('[data-client-manager-only]').forEach(e => e.hidden = !clientManager());
    await window.TH_DISPATCH.init(staff,async()=>{notice('새 영업자·관제 메시지가 도착했습니다.');await beep();});
    await loadStaff(); await loadOrders(true); await loadThreads(); baseline = false; pollCursor = null; seenOrders.clear(); seenThreads.clear(); await poll();
    const target=new URLSearchParams(location.search);
    if(target.get('thread')&&!owner()){
      await selectPage('chat');if(threads.some(t=>t.id===target.get('thread')))await openThread(target.get('thread'));
    } else if(target.get('order')){
      const found=await api.api('/rest/v1/th6_requests?select=*&id=eq.'+encodeURIComponent(target.get('order')));
      if(found[0]){
        status=found[0].status;
        document.querySelectorAll('[data-status]').forEach(b=>{const active=b.dataset.status===status;b.className=active?'':'secondary';b.setAttribute('aria-pressed',String(active));});
        await loadOrders(true);if(!rows.some(r=>r.id===found[0].id)){rows.unshift(found[0]);renderOrders();}
        const card=[...$('orders').children].find(e=>e.dataset.orderId===found[0].id);if(card){card.classList.add('order-focus');card.scrollIntoView({block:'center'});}
      }
    }
  }
  $('loginForm').onsubmit = async e => {
    e.preventDefault(); $('loginButton').disabled = true;
    try {
      let email = $('email').value.trim(); if (!email.includes('@')) email = email.toLowerCase() + '@staff.th-company.invalid';
      await api.login(email, $('password').value, $('remember').checked); $('password').value = ''; await enter();
    } catch (e) { notice(e.message); }
    finally { $('loginButton').disabled = false; }
  };
  $('logout').onclick = async () => { try { await window.TH_PUSH.disconnect(); await api.logout(); location.reload(); } catch(e) { notice('로그아웃 전 알림 해제가 필요합니다. 인터넷 연결을 확인해 주세요. ' + e.message); } };
  window.addEventListener('th:session', () => {
    if (!api.session && staff) {
      window.TH_DISPATCH.reset(); window.TH_PUSH.reset(); staff = null; showOwnCard(); $('dashboard').hidden = true; $('login').hidden = false; $('logout').hidden = true;
      $('adminTitle').textContent = 'TH company';
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      $('orders').replaceChildren(); $('clientList').replaceChildren(); $('adminChatLog').replaceChildren(); $('threadList').replaceChildren();
    }
  });
  async function selectPage(value) {
    page = value;
    for (const b of document.querySelectorAll('[data-page]')) { const selected = b.dataset.page === page; if (selected) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    for (const value of ['orders', 'clients', 'chat', 'dispatch', 'settings', 'staff']) $('page-' + value).hidden = value !== page;
    try {
      await window.TH_DISPATCH.show(page === 'dispatch');
      if (page === 'orders') await loadOrders(true);
      if (page === 'clients') await loadClients();
      if (page === 'chat') await loadThreads();
      if (page === 'settings' && owner()) await loadSettings();
      if (page === 'staff' && representative()) await loadStaff();
    } catch (e) { notice(e.message); }
  }
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => selectPage(b.dataset.page));
  async function loadOrders(reset = false) {
    const stamp = ++generation; $('refresh').disabled = $('more').disabled = true;
    if (reset) { rows = []; offset = 0; }
    try {
      const data = await api.api('/rest/v1/th6_requests?select=*&status=eq.' + status + '&order=created_at.desc,id.desc&limit=50&offset=' + offset);
      if (stamp !== generation || !staff) return;
      const ids = new Set(rows.map(r => r.id)); rows.push(...data.filter(r => !ids.has(r.id))); offset += data.length;
      $('more').hidden = data.length < 50; renderOrders(); notice('주문을 확인했습니다.');
    } catch (e) { notice(e.message); }
    finally { if (stamp === generation) $('refresh').disabled = $('more').disabled = false; }
  }
  function officeOrderText(r) {
    let body=r.summary;
    if(r.agreed_fare!==null&&r.agreed_fare!==undefined){body=body.replace(/최종 요금:([^\n]*)/g,'접수 시 예상요금:$1');body+='\n\n[조정 운행요금] '+r.agreed_fare.toLocaleString('ko-KR')+'원'+(r.fare_reason?'\n조정 사유: '+r.fare_reason:'')+'\n관제 확인: '+(r.fare_checked_at?'완료':'대기');}
    return body+(r.sales_notes?'\n\n[영업자 전달 특이사항]\n'+r.sales_notes:'');
  }
  function renderOrders() {
    $('orderSearch').hidden = !['completed','held'].includes(status);
    const q = $('orderSearch').hidden ? '' : $('search').value.trim().toLowerCase(), root = $('orders'); root.replaceChildren();
    $('count').textContent = labels[status] + ' ' + rows.length + '건 (불러온 목록) · '+(status==='held'?'보류 후 48시간 내 복구 가능':'48시간 보관 · 복구 시 보관 시간 갱신');
    const selected = rows.filter(r => (r.summary + ' ' + r.id).toLowerCase().includes(q));
    if (!selected.length) root.append(text('p', q ? '검색 결과가 없습니다.' : labels[status] + ' 주문이 없습니다.'));
    for (const r of selected) {
      const card = text('article', '', 'order-card'), head = text('div', '', 'section-head');
      card.dataset.orderId=r.id;
      head.append(text('h3', (r.payload?.requester?.name||r.payload?.company||'고객')+' · 주문 ' + r.id.slice(0, 8)), text('span', labels[r.status], 'tag')); card.append(head);
      const who = r.payload?.requester;
      const extra=text('details','','order-extra');extra.append(text('summary','상세 보기 · 연락처 / 주문 내용'));
      extra.append(text('p', (r.payload?.company ? r.payload.company + ' · ' : '비로그인 고객 · ') + (who ? who.name + ' / ' + who.phone : '이전 주문')));
      extra.append(text('p', koreaTime(r.created_at) + ' 접수', 'portal-note'));
      if(r.status==='held')extra.append(text('p','자동 취소·삭제 예정: '+koreaTime(r.expires_at),'portal-note'));
      const locations = r.payload?.locations;
      if (locations?.length) {
        const grid = text('div', '', 'order-route');
        for (const p of locations) {
          grid.append(text('p',p.label+'　'+p.address));extra.append(text('p',p.label+' · '+[p.address,p.detail,p.person,p.phone].filter(Boolean).join(' · ')));
        }
        card.append(grid);
      }
      const details = text('details', ''), summary = text('summary', '전체 주문 내용'), pre = text('pre', r.summary); details.append(summary, pre); extra.append(details);
      const autoFare=r.payload?.quote?.total;
      if(Number.isFinite(autoFare))extra.append(text('p','접수 시 예상 운행요금: '+autoFare.toLocaleString('ko-KR')+'원','portal-note'));
      const displayFare=r.agreed_fare??autoFare;
      if(Number.isFinite(displayFare))card.append(text('h3','운행요금 '+displayFare.toLocaleString('ko-KR')+'원'+(r.agreed_fare!=null&&!r.fare_checked_at?' · 관제 확인 필요':''),'order-fare'));
      if(r.fare_reason)extra.append(text('p','조정 사유: '+r.fare_reason));
      if(!owner()&&r.staff_id===staff.user_id&&Number.isFinite(displayFare))extra.append(text('p',(r.agreed_fare!=null&&r.fare_checked_at||r.status==='assigned'||r.status==='completed'?'내 수익':'내 예상 수익')+': '+Math.round(displayFare*0.04).toLocaleString('ko-KR')+'원 (영업자 4% · 별도 보증금 제외)','portal-note'));
      const actions = text('div', '', 'actions');
      const secondaryActions=text('div','','actions');
      secondaryActions.append(button('코리아센터 입력용 내용 복사', async () => { try { await navigator.clipboard.writeText(officeOrderText(r)); notice('복사했습니다. 코리아센터에 직접 입력해 주세요.'); } catch { notice('복사하지 못했습니다. 전체 주문 내용을 선택해서 복사해 주세요.'); } }));
      if(owner()&&r.status==='approved'&&r.agreed_fare!=null&&!r.fare_checked_at){
        const check=button('조정 요금 확인 · 배정 승인',async()=>{if(!confirm('운행요금 '+r.agreed_fare.toLocaleString('ko-KR')+'원을 확인했나요? 확인 후 기사 배정이 가능합니다.'))return;check.disabled=true;try{await api.rpc('th6_confirm_fare',{p_id:r.id,p_fare:r.agreed_fare});await loadOrders(true);notice('조정 요금을 확인했습니다. 기사 배정을 진행해 주세요.');}catch(e){notice(e.message);check.disabled=false;}},'');actions.append(check);
      }
      if (r.thread_id && !owner()) actions.append(button('고객 문의 / 답변', async () => { await selectPage('chat'); await openThread(r.thread_id); }));
      for (const next of owner() ? (r.status==='approved'?['assigned','held']:r.status==='assigned'?['completed','held']:r.status==='held'?['restore']:[]) : (r.status==='pending'?['held']:r.status==='held'&&r.held_from==='pending'?['restore']:[])) {
        const b = button(next === 'restore' ? '다시 진행' : next === 'assigned' ? '기사 배정 완료' : labels[next], async () => {
          const question = next === 'assigned' ? '코리아센터에서 기사 배정을 확인했나요? 고객 문의함으로 배정 알림을 보냅니다.' : next === 'restore' ? '주문을 다시 진행할까요? 승인된 주문은 관제 배정 대기로 돌아가며 기사 배정을 다시 확인해야 합니다.' : next === 'held' ? '이 주문을 보류할까요? 보류 후 48시간 내에 복구하지 않으면 자동 취소·삭제됩니다.' : '이 주문을 완료 처리할까요?';
          if (!confirm(question)) return; b.disabled = true;
          try { await api.rpc('th6_set_status', { p_id: r.id, p_status: next }); await loadOrders(true); notice('주문을 ' + (next==='restore'?'다시 진행':labels[next]) + ' 처리했습니다.'); }
          catch (e) { notice(e.message); b.disabled = false; }
        }, next === 'held' ? 'secondary' : next === 'assigned' ? '' : 'secondary'); if(next==='assigned'&&r.agreed_fare!=null&&!r.fare_checked_at){b.disabled=true;b.title='조정 요금을 먼저 확인해 주세요.';} (next==='held'?secondaryActions:actions).append(b);
      }
      if(r.approved_at)extra.append(text('p','영업자 승인: '+koreaTime(r.approved_at),'portal-note'));
      if(r.sales_notes)card.append(text('p','특이사항 · '+r.sales_notes,'order-note'));
      if(r.status==='pending'&&!owner()){
        const label=text('label','관제 전달 특이사항'),notes=document.createElement('textarea');notes.maxLength=2000;notes.placeholder='관제·기사에게 전달할 내용을 적어 주세요. 없으면 비워 두세요.';label.append(notes);extra.append(label);
        const adjustment=text('details',''),title=text('summary','예외 지역 · 요금 조정 (필요한 경우)');adjustment.append(title);
        const enabled=document.createElement('input');enabled.type='checkbox';const toggle=text('label','');toggle.className='inline';toggle.append(enabled,text('span','운행요금 조정'));adjustment.append(toggle);
        const fields=document.createElement('fieldset');fields.hidden=true;fields.disabled=true;
        const price=document.createElement('input');price.type='number';price.min='1';price.max='2000000';price.step='1';price.inputMode='numeric';price.required=true;if(Number.isFinite(autoFare))price.value=autoFare;
        const priceLabel=text('label','고객과 확인한 총 운행요금 (원 · 보증금 제외)');priceLabel.append(price);
        const reason=document.createElement('textarea');reason.maxLength=2000;reason.placeholder='고객 합의';const reasonLabel=text('label','요금 조정 사유 (선택)');reasonLabel.append(reason);
        const consent=document.createElement('input');consent.type='checkbox';consent.required=true;const consentLabel=text('label','');consentLabel.className='inline';consentLabel.append(consent,text('span','고객과 조정 운행요금을 확인했습니다.'));
        fields.append(priceLabel,reasonLabel,consentLabel);adjustment.append(fields);extra.append(adjustment);
        enabled.onchange=()=>{fields.hidden=fields.disabled=!enabled.checked;};
        const approve=button('주문 승인 · 관제로 전달',async()=>{
          if(enabled.checked&&(!price.reportValidity()||!consent.checked)){notice('조정 요금을 입력하고 고객 확인에 체크해 주세요.');return;}
          if(!confirm('주문 내용과 요청 방식을 확인했나요? 승인하면 관제에 전달됩니다.'))return;
          approve.disabled=true;try{await api.rpc('th6_approve_with_fare',{p_id:r.id,p_notes:notes.value,p_fare:enabled.checked?Number(price.value):null,p_reason:enabled.checked?reason.value:'',p_customer_confirmed:enabled.checked&&consent.checked});await loadOrders(true);notice('승인한 주문을 관제로 전달했습니다.');}catch(e){notice(e.message);approve.disabled=false;}
        },'');actions.prepend(approve);
      }
      extra.append(secondaryActions);card.append(actions,extra); root.append(card);
    }
  }
  document.querySelectorAll('[data-status]').forEach(b => b.onclick = () => {
    status = b.dataset.status; $('search').value = '';
    document.querySelectorAll('[data-status]').forEach(other => { const active = other === b; other.className = active ? '' : 'secondary'; other.setAttribute('aria-pressed', String(active)); }); loadOrders(true);
  });
  $('refresh').onclick = () => loadOrders(true); $('more').onclick = () => loadOrders(false); $('search').oninput = renderOrders;
  async function loadStaff() {
    staffRows = await api.api('/rest/v1/th6_staff?select=*&deleted_at=is.null&order=name.asc');
    $('clientStaff').replaceChildren(); $('staffList').replaceChildren();
    for (const r of staffRows) {
      const opt = text('option', r.name + (!r.active ? ' (비활성)' : '')); opt.value = r.user_id;
      if (r.role === 'sales' || staffRows.length === 1) $('clientStaff').append(opt);
      if (!representative()) continue;
      const card = text('article', '', 'staff-card'); card.append(text('strong', r.name + ' · ' + (r.is_representative ? '대표' : r.role === 'owner' ? '관제' : '영업자')));
      if (r.link_slug) {
        const link = new URL('index.html', location.href); link.searchParams.set('v','brand2'); link.searchParams.set('sales', r.link_slug);
        card.append(text('p', link.href, 'link-preview')); card.append(button('홍보 링크 복사', async () => { try { await navigator.clipboard.writeText(link.href); notice('영업자 링크를 복사했습니다.'); } catch { notice('표시된 링크를 직접 복사해 주세요.'); } }));
      } else if (r.role !== 'owner') card.append(text('p', new URL('index.html', location.href).href, 'link-preview'));
      card.append(text('p', r.active ? '활성화' : '비활성화', 'portal-note'));
      if (r.role === 'sales' && !r.is_representative) {
        const actions=text('div','','actions');
        actions.append(button('영업자 수정',()=>editStaff(r)),button('영업자 삭제',async()=>{
          if(!confirm(r.name+' 영업자를 삭제할까요? 로그인·전용 링크 이용이 중단됩니다. 담당 의뢰자와 주문·고객 문의는 대표님에게 이관됩니다.'))return;
          try{await api.rpc('th6_remove_sales',{p_staff:r.user_id});await loadStaff();await loadOrders(true);notice(r.name+' 영업자를 삭제하고 담당 업무를 대표님에게 이관했습니다.');}catch(e){notice(e.message);}
        },'danger'));card.append(actions);
      } else card.append(text('p','대표·관제 계정은 영업자 수정·삭제 대상이 아닙니다.','portal-note'));
      $('staffList').append(card);
    }
    $('newControl').hidden = true;
    if(representative()&&!staffRows.some(r=>r.role==='sales'&&!r.is_representative))$('staffList').append(text('p','아직 등록된 일반 영업자가 없습니다. 영업자를 등록하면 이 목록에 수정·삭제 버튼이 표시됩니다.','portal-note'));
  }
  $('staffRefresh').onclick=()=>loadStaff().catch(e=>notice(e.message));
  async function loadClients() {
    clients = await api.api('/rest/v1/th6_clients?select=*&order=company.asc'); renderClients();
  }
  function renderClients() {
    const root = $('clientList'); root.replaceChildren(); const q = $('clientSearch').value.toLowerCase();
    for (const c of clients.filter(c => c.company.toLowerCase().includes(q))) {
      const card = text('article', '', 'client-card'); card.append(text('h3', c.company), text('p', (c.address + ' ' + c.detail).trim() || '등록 주소 없음'), text('p', (c.active ? '활성화' : '비활성화') + ' · 담당: ' + (staffRows.find(s => s.user_id === c.staff_id)?.name || '담당 영업자'), 'portal-note'));
      card.append(button(clientManager() ? '의뢰자 · 계정 · 거래처 관리' : '등록 정보 · 거래처 확인', () => editClient(c))); root.append(card);
    }
    if (!root.children.length) root.append(text('p', '등록된 의뢰자가 없습니다.'));
  }
  $('clientSearch').oninput = renderClients;
  async function editClient(c) {
    currentClient = c || null; $('clientId').value = c?.id || ''; $('clientCompany').value = c?.company || '';
    $('clientAddress').value = c?.address || ''; $('clientAddress').dataset.meta = JSON.stringify(c?.address_meta || {});
    $('clientDetail').value = c?.detail || ''; $('clientStaff').value = c?.staff_id || staffRows.find(s => s.role==='sales')?.user_id || staff.user_id; $('clientActive').checked = c?.active ?? true;
    $('clientDialogTitle').textContent = c ? c.company : '의뢰자 등록'; $('clientNotice').textContent = '';
    $('clientAccounts').hidden = !c; $('clientSave').hidden = !clientManager(); $('clientDelete').hidden = !clientManager() || !c;
    for (const input of $('clientForm').querySelectorAll('input,select')) input.disabled = !clientManager();
    $('clientStaff').disabled = !representative();
    if (!$('clientDialog').open) $('clientDialog').showModal();
    if (c) try { await loadClientAccounts(); } catch (e) { $('clientNotice').textContent = e.message; }
  }
  $('newClient').onclick = () => editClient(null); $('clientClose').onclick = () => $('clientDialog').close();
  $('clientAddress').onclick = async () => { if (!clientManager()) return; try { const result = await window.TH_ADDRESS.pick(); if (result) { $('clientAddress').value = result.address; $('clientAddress').dataset.meta = JSON.stringify(result.meta); } } catch (e) { $('clientNotice').textContent = e.message; } };
  $('clientForm').onsubmit = async e => {
    e.preventDefault(); $('clientSave').disabled = true;
    try {
      const data = { company: $('clientCompany').value.trim(), address: $('clientAddress').value, detail: $('clientDetail').value.trim(), staff_id: $('clientStaff').value, active: $('clientActive').checked, address_meta: JSON.parse($('clientAddress').dataset.meta || '{}') };
      const id = $('clientId').value;
      const saved = await api.api('/rest/v1/th6_clients' + (id ? '?id=eq.' + id : ''), { method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data) });
      if (saved?.length !== 1) throw Error('저장 결과를 확인하지 못했습니다.');
      await loadClients(); await editClient(saved[0]); $('clientNotice').textContent = '의뢰자를 저장했습니다. 아래에서 로그인 계정을 등록해 주세요.';
    } catch (e) { $('clientNotice').textContent = e.message; }
    finally { $('clientSave').disabled = false; }
  };
  $('clientDelete').onclick = async () => {
    if (!currentClient || !confirm('의뢰자와 모든 계정·거래처를 삭제할까요? 기존 주문은 48시간 보관됩니다.')) return;
    $('clientDelete').disabled = true;
    try { await accountAction({ action: 'deleteClient', clientId: currentClient.id }); $('clientDialog').close(); await loadClients(); notice('의뢰자를 삭제했습니다.'); }
    catch (e) { $('clientNotice').textContent = e.message; }
    finally { $('clientDelete').disabled = false; }
  };
  async function loadClientAccounts() {
    const id = currentClient.id;
    [contacts, clientPartners] = await Promise.all([
      api.api('/rest/v1/th6_contacts?select=id,client_id,login_id,name,phone,active&client_id=eq.' + id + '&order=name.asc'),
      api.api('/rest/v1/th6_partners?select=*&client_id=eq.' + id + '&order=title.asc')
    ]);
    const root = $('contactList'); root.replaceChildren();
    for (const c of contacts) {
      const card = text('div', '', 'contact-card'); card.append(text('strong', c.name), text('p', c.phone + ' · 아이디: ' + c.login_id + ' · ' + (c.active ? '활성' : '비활성')));
      if (clientManager()) {
        const actions = text('div', '', 'actions'); actions.append(button('수정', () => editContact(c)), button('비밀번호 재설정', () => { resetContact = c.id; $('resetPassword').value = ''; $('resetNotice').textContent = ''; $('resetDialog').showModal(); }), button('삭제', async () => {
          if (!confirm(c.name + ' 계정을 삭제할까요?')) return;
          try { await accountAction({ action: 'delete', contactId: c.id }); await loadClientAccounts(); }
          catch (e) { $('clientNotice').textContent = e.message; }
        }, 'danger')); card.append(actions);
      }
      root.append(card);
    }
    if (!contacts.length) root.append(text('p', '등록된 로그인 계정이 없습니다.', 'portal-note'));
    const pRoot = $('clientPartners'); pRoot.replaceChildren();
    for (const p of clientPartners) {
      const card = text('div', '', 'partner-card'); card.append(text('strong', p.title), text('p', p.address + ' ' + p.detail), text('p', p.person + ' · ' + p.phone));
      const actions = text('div', '', 'actions'); actions.append(button('수정', () => editPartner(p)), button('삭제', async () => {
        if (!confirm(p.title + ' 거래처를 삭제할까요?')) return;
        try { await api.api('/rest/v1/th6_partners?id=eq.' + p.id, { method: 'DELETE' }); await loadClientAccounts(); } catch (e) { $('clientNotice').textContent = e.message; }
      }, 'danger')); card.append(actions); pRoot.append(card);
    }
  }
  function editContact(c) {
    $('contactId').value = c?.id || ''; $('contactName').value = c?.name || ''; $('contactPhone').value = c?.phone || '';
    $('contactLogin').value = c?.login_id || ''; $('contactLogin').disabled = Boolean(c); $('contactPassword').value = '';
    $('contactPassword').required = !c; $('accountPasswordLabel').hidden = Boolean(c); $('contactActive').checked = c?.active ?? true;
    $('accountTitle').textContent = c ? '계정 정보 수정' : '계정 등록'; $('accountNotice').textContent = ''; $('accountDialog').showModal();
  }
  $('addAccount').onclick = () => editContact(null); $('accountClose').onclick = () => { $('contactPassword').value = ''; $('accountDialog').close(); };
  $('accountForm').onsubmit = async e => {
    e.preventDefault(); $('accountSave').disabled = true;
    try {
      const id = $('contactId').value, values = { name: $('contactName').value.trim(), phone: $('contactPhone').value.trim(), active: $('contactActive').checked };
      if (id) await api.api('/rest/v1/th6_contacts?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(values) });
      else {
        const result = await accountAction({ action: 'create', clientId: currentClient.id, loginId: $('contactLogin').value.trim(), password: $('contactPassword').value, name: values.name, phone: values.phone });
        if (!values.active) await api.api('/rest/v1/th6_contacts?id=eq.' + result.contact.id, { method: 'PATCH', body: JSON.stringify({ active: false }) });
      }
      $('contactPassword').value = ''; $('accountDialog').close(); await loadClientAccounts(); $('clientNotice').textContent = '계정을 저장했습니다. 아이디와 비밀번호는 고객에게 직접 안내해 주세요.';
    } catch (e) { $('accountNotice').textContent = e.message; }
    finally { $('accountSave').disabled = false; }
  };
  $('resetClose').onclick = () => { $('resetPassword').value = ''; $('resetDialog').close(); };
  $('resetForm').onsubmit = async e => {
    e.preventDefault(); $('resetSave').disabled = true;
    try { await accountAction({ action: 'resetPassword', contactId: resetContact, password: $('resetPassword').value }); $('resetPassword').value = ''; $('resetDialog').close(); $('clientNotice').textContent = '비밀번호를 변경했습니다. 고객에게 직접 안내해 주세요.'; }
    catch (e) { $('resetNotice').textContent = e.message; }
    finally { $('resetSave').disabled = false; }
  };
  function editPartner(p) {
    $('adminPartnerId').value = p?.id || '';
    for (const k of ['title','address','detail','person','phone']) $('adminPartner_' + k).value = p?.[k] || '';
    $('adminPartner_address').dataset.meta = JSON.stringify(p?.address_meta || {}); $('adminPartnerNotice').textContent = ''; $('adminPartnerDialog').showModal();
  }
  $('adminAddPartner').onclick = () => editPartner(null); $('adminPartnerClose').onclick = () => $('adminPartnerDialog').close();
  $('adminPartner_address').onclick = async () => { try { const result = await window.TH_ADDRESS.pick(); if (result) { $('adminPartner_address').value = result.address; $('adminPartner_address').dataset.meta = JSON.stringify(result.meta); } } catch (e) { $('adminPartnerNotice').textContent = e.message; } };
  $('adminPartnerForm').onsubmit = async e => {
    e.preventDefault(); $('adminPartnerSave').disabled = true;
    try {
      const id = $('adminPartnerId').value, values = Object.fromEntries(['title','address','detail','person','phone'].map(k => [k, $('adminPartner_' + k).value.trim()]));
      if (!values.address) throw Error('주소를 검색해서 선택해 주세요.');
      await api.api('/rest/v1/th6_partners' + (id ? '?id=eq.' + id : ''), { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ ...values, client_id: currentClient.id, address_meta: JSON.parse($('adminPartner_address').dataset.meta || '{}') }) });
      $('adminPartnerDialog').close(); await loadClientAccounts();
    } catch (e) { $('adminPartnerNotice').textContent = e.message; }
    finally { $('adminPartnerSave').disabled = false; }
  };
  function editStaff(r, control = false) {
    $('staffPhone').value=r?.phone||'';$('staffKakao').value=r?.kakao_url||'';
    creatingControl = control; $('staffDialogTitle').textContent = control ? '관제 계정 생성' : '영업자 등록 / 수정';
    $('staffId').value = r?.user_id || ''; $('staffName').value = r?.name || ''; $('staffSlug').value = r?.link_slug || '';
    $('staffLogin').value = $('staffPassword').value = ''; $('staffActive').checked = r?.active ?? true;
    $('staffLoginLabel').hidden = $('staffPasswordLabel').hidden = Boolean(r); $('staffLogin').required = $('staffPassword').required = !r;
    $('staffSlug').parentElement.hidden = control; $('staffSlug').required = !control;
    $('staffActive').parentElement.hidden = control;
    $('staffNotice').textContent = ''; $('staffDialog').showModal();
  }
  $('newStaff').onclick = () => editStaff(null); $('staffClose').onclick = () => { $('staffPassword').value = ''; $('staffDialog').close(); };
  $('newControl').onclick = () => editStaff(null, true);
  $('staffForm').onsubmit = async e => {
    e.preventDefault(); $('staffSave').disabled = true;
    try {
      const id = $('staffId').value;
      await accountAction({ action: creatingControl ? 'createControl' : id ? 'updateStaff' : 'createStaff', staffId: id || undefined, name: $('staffName').value.trim(), slug: $('staffSlug').value.trim(),
        phone:$('staffPhone').value.trim(),kakaoUrl:$('staffKakao').value.trim(),loginId: $('staffLogin').value.trim(), password: $('staffPassword').value, active: $('staffActive').checked });
      if (creatingControl) {
        $('staffPassword').value = ''; $('staffDialog').close(); await api.logout();
        notice('관제 계정을 생성했습니다. 새 관제 아이디로 로그인하세요. 기존 계정은 첫 번째 영업자 권한입니다.'); return;
      }
      $('staffPassword').value = ''; $('staffDialog').close(); await loadStaff(); notice('영업자 정보를 저장했습니다.');
    } catch (e) { $('staffNotice').textContent = e.message; }
    finally { $('staffSave').disabled = false; }
  };
  async function loadSettings() {
    const settings = await api.rpc('th6_public_settings'); $('nightStatus').textContent = settings.nightEnabled?'현재 야간요금 적용 중 ('+Math.round(settings.nightRate*100)+'% 추가)' :'현재 주간요금 적용 중';
    document.querySelectorAll('[data-service]').forEach(c => c.checked = Boolean(settings.services?.[c.dataset.service]));
  }

  document.querySelectorAll('[data-service]').forEach(c => c.onchange=async()=> {
    c.disabled=true; try { await api.rpc('th6_set_service',{p_service:c.dataset.service,p_enabled:c.checked}); notice('서비스 설정을 저장했습니다.'); }
    catch(e) { c.checked=!c.checked;notice(e.message); } finally { c.disabled=false; }
  });
  async function loadThreads() {
    threads=await api.rpc('th6_sales_inbox');
    $('threadList').replaceChildren();
    for(const t of threads) {
      const r=t.order,loc=r?.payload?.locations||[];
      const b=button(t.name+' · '+(r?'주문 '+r.id.slice(0,8):'일반 이용문의'),()=>openThread(t.id),'thread-item secondary');
      b.dataset.threadId=t.id;
      if(r)b.append(text('small',loc.map(p=>p.address).join(' → ')||labels[r.status]));
      if(t.unread)b.append(text('span','새 알림 '+t.unread,'badge'));
      $('threadList').append(b);
    }
    if(!threads.length) $('threadList').append(text('p','문의가 없습니다.'));
  }
  async function openThread(id) {
    currentThread=id;$('adminChat').hidden=false;$('chatTitle').textContent=threads.find(t=>t.id===id)?.name||'고객 문의';
    const selected=threads.find(t=>t.id===id);if(selected?.order)$('chatTitle').textContent+=' · 주문 '+selected.order.id.slice(0,8);
    $('chatPhone').textContent=selected?.phone||'';
    await readAdminChat();
  }
  $('chatRefresh').onclick = () => loadThreads().catch(e => notice(e.message));
  async function readAdminChat() {
    if(!currentThread)return;const id=currentThread;
    const data=await api.api('/rest/v1/th6_messages?select=*&thread_id=eq.'+id+'&order=created_at.asc,id.asc');
    if(currentThread!==id||!staff)return;
    $('adminChatLog').replaceChildren();
    for(const m of data) { const b=text('div',m.body,'chat-bubble '+m.sender);b.append(text('time',koreaTime(m.created_at)));$('adminChatLog').append(b); }
    await api.rpc('th6_admin_read',{p_thread:id});
    const t=threads.find(t=>t.id===id);if(t)t.unread=0;
    const item=[...$('threadList').children].find(e=>e.dataset.threadId===id);if(item?.querySelector('.badge'))item.querySelector('.badge').hidden=true;
    const remaining=threads.filter(t=>t.unread).length;$('unreadCount').textContent=remaining||'';$('unreadCount').hidden=!remaining;
  }
  $('replyForm').onsubmit=async e=> {
    e.preventDefault();if(!currentThread||!$('replyBody').value.trim())return;$('replySend').disabled=true;
    try { const body=$('replyBody').value.trim();if(!replyAttempt||replyAttempt.body!==body||replyAttempt.thread!==currentThread)replyAttempt={id:crypto.randomUUID(),body,thread:currentThread};
      await api.rpc('th6_admin_reply',{p_thread:replyAttempt.thread,p_body:body,p_message:replyAttempt.id});replyAttempt=null;$('replyBody').value='';await readAdminChat();
    } catch(e) { notice(e.message); } finally { $('replySend').disabled=false; }
  };
  async function beep(){await window.TH_SOUNDS.play();}
  async function poll() {
    if(!staff||document.hidden||polling)return;polling=true;
    try {
      await window.TH_DISPATCH.poll();
      const result=await api.rpc('th6_admin_events',{p_since:pollCursor});
      const orders=result.orders||[],incoming=result.threads||[];
      const newOrder=baseline&&orders.some(o=>!seenOrders.has(o.id));
      const newMessage=baseline&&incoming.some(t=>(t.last_customer_at&&seenThreads.get(t.id)?.customer!==t.last_customer_at)||(t.last_staff_event_at&&seenThreads.get(t.id)?.progress!==t.last_staff_event_at));
      const orderChanged=orders.some(o=>seenOrders.get(o.id)!==o.updated_at),chatChanged=incoming.some(t=>seenThreads.get(t.id)?.updated!==t.updated_at);
      for(const o of orders)seenOrders.set(o.id,o.updated_at);for(const t of incoming)seenThreads.set(t.id,{customer:t.last_customer_at,progress:t.last_staff_event_at,updated:t.updated_at});
      pollCursor=result.cursor;baseline=true;
      if(newOrder||newMessage){notice(newOrder?'새 주문이 도착했습니다.':'새 문의가 도착했습니다.');await beep();}
      if(page==='settings'&&owner())await loadSettings();
      if(orderChanged&&page==='orders')await loadOrders(true);
      if(chatChanged&&page==='chat'){await loadThreads();if(currentThread)await readAdminChat();}
      $('orderUnread').textContent=result.pending||'';$('orderUnread').hidden=!result.pending;
      $('unreadCount').textContent=result.unread||'';$('unreadCount').hidden=!result.unread;
    }catch(e){notice('새 주문 확인 중 연결 오류: '+e.message);}finally{polling=false;}
  }
  setInterval(poll,10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  (async()=>{await api.restore();if(api.session)try{await enter();}catch(e){notice(e.message);}})();
})();
