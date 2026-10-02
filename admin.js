(() => {
  'use strict';
  const $ = id => document.getElementById(id), api = window.TH_API;
  let staff = null, staffRows = [], rows = [], clients = [], threads = [], contacts = [], clientPartners = [];
  let status = 'pending', page = 'orders', offset = 0, generation = 0, currentThread = null, currentClient = null;
  let replyAttempt = null, resetContact = null, polling = false, seenOrders = new Map(), seenThreads = new Map(), baseline = false;
  let soundEnabled = false, audio;
  let creatingControl = false;
  let pollCursor = null;
  const labels = { pending: '미처리', assigned: '배정 완료', completed: '완료', cancelled: '취소' };
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  const button = (value, action, cls = 'secondary') => { const e = text('button', value, cls); e.type = 'button'; e.onclick = action; return e; };
  const notice = value => $('notice').textContent = value;
  const owner = () => staff?.role === 'owner';
  const koreaTime = value => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  async function accountAction(args) { return api.api('/functions/v1/manage-client-account', { method: 'POST', body: JSON.stringify(args) }); }
  async function enter() {
    const list = await api.api('/rest/v1/th6_staff?select=*&user_id=eq.' + api.session.user.id);
    staff = list[0]; if (!staff?.active) { await api.logout(); throw Error('관리 권한이 없거나 비활성화된 계정입니다.'); }
    $('login').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
    document.querySelectorAll('[data-owner-only]').forEach(e => e.hidden = !owner());
    await loadStaff(); await loadOrders(true); await loadThreads(); baseline = false; pollCursor = null; seenOrders.clear(); seenThreads.clear(); await poll();
  }
  $('loginForm').onsubmit = async e => {
    e.preventDefault(); $('loginButton').disabled = true;
    try {
      let email = $('email').value.trim(); if (!email.includes('@')) email = email.toLowerCase() + '@staff.th-company.invalid';
      await api.login(email, $('password').value, $('remember').checked); $('password').value = ''; await enter();
    } catch (e) { notice(e.message); }
    finally { $('loginButton').disabled = false; }
  };
  $('logout').onclick = async () => { await api.logout(); location.reload(); };
  window.addEventListener('th:session', () => {
    if (!api.session && staff) {
      staff = null; $('dashboard').hidden = true; $('login').hidden = false; $('logout').hidden = true;
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      $('orders').replaceChildren(); $('clientList').replaceChildren(); $('adminChatLog').replaceChildren(); $('threadList').replaceChildren();
    }
  });
  async function selectPage(value) {
    page = value;
    for (const b of document.querySelectorAll('[data-page]')) { const selected = b.dataset.page === page; if (selected) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    for (const value of ['orders', 'clients', 'chat', 'settings', 'staff']) $('page-' + value).hidden = value !== page;
    try {
      if (page === 'orders') await loadOrders(true);
      if (page === 'clients') await loadClients();
      if (page === 'chat') await loadThreads();
      if (page === 'settings' && owner()) await loadSettings();
      if (page === 'staff' && owner()) await loadStaff();
    } catch (e) { notice(e.message); }
  }
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => selectPage(b.dataset.page));
  function dateQuery() {
    const value = $('orderDate').value; if (!value) return '';
    const a = new Date(value + 'T00:00:00+09:00'), b = new Date(a.getTime() + 86400000);
    return '&and=' + encodeURIComponent('(created_at.gte.' + a.toISOString() + ',created_at.lt.' + b.toISOString() + ')');
  }
  async function loadOrders(reset = false) {
    const stamp = ++generation; $('refresh').disabled = $('more').disabled = true;
    if (reset) { rows = []; offset = 0; }
    try {
      const data = await api.api('/rest/v1/th6_requests?select=*&status=eq.' + status + dateQuery() + '&order=created_at.desc,id.desc&limit=50&offset=' + offset);
      if (stamp !== generation || !staff) return;
      const ids = new Set(rows.map(r => r.id)); rows.push(...data.filter(r => !ids.has(r.id))); offset += data.length;
      $('more').hidden = data.length < 50; renderOrders(); notice('주문을 확인했습니다.');
    } catch (e) { notice(e.message); }
    finally { if (stamp === generation) $('refresh').disabled = $('more').disabled = false; }
  }
  function renderOrders() {
    const q = $('search').value.trim().toLowerCase(), root = $('orders'); root.replaceChildren();
    $('count').textContent = labels[status] + ' ' + rows.length + '건 (불러온 목록) · 접수 후 48시간 보관';
    const selected = rows.filter(r => (r.summary + ' ' + r.id).toLowerCase().includes(q));
    if (!selected.length) root.append(text('p', q ? '검색 결과가 없습니다.' : labels[status] + ' 주문이 없습니다.'));
    for (const r of selected) {
      const card = text('article', '', 'order-card'), head = text('div', '', 'section-head');
      head.append(text('h3', '주문 ' + r.id.slice(0, 8)), text('span', labels[r.status], 'tag')); card.append(head);
      const who = r.payload?.requester;
      card.append(text('p', (r.payload?.company ? r.payload.company + ' · ' : '비로그인 고객 · ') + (who ? who.name + ' / ' + who.phone : '이전 주문')));
      card.append(text('p', koreaTime(r.created_at) + ' 접수', 'portal-note'));
      const locations = r.payload?.locations;
      if (locations?.length) {
        const grid = text('div', '', 'review-locations');
        for (const p of locations) {
          const item = text('div', '', 'review-location'); item.append(text('h3', p.label), text('p', p.address), text('p', p.detail || ''), text('p', p.person + ' · ' + p.phone)); grid.append(item);
        }
        card.append(grid);
      }
      const details = text('details', ''), summary = text('summary', '전체 주문 내용'), pre = text('pre', r.summary); details.append(summary, pre); card.append(details);
      const actions = text('div', '', 'actions');
      actions.append(button('코리아센터 입력용 내용 복사', async () => { try { await navigator.clipboard.writeText(r.summary); notice('복사했습니다. 코리아센터에 직접 입력해 주세요.'); } catch { notice('복사하지 못했습니다. 전체 주문 내용을 선택해서 복사해 주세요.'); } }));
      if (r.thread_id) actions.append(button('고객 문의 / 답변', async () => { await selectPage('chat'); await openThread(r.thread_id); }));
      for (const next of r.status === 'pending' ? ['assigned','completed','cancelled'] : r.status === 'assigned' ? ['completed','cancelled'] : []) {
        const b = button(next === 'assigned' ? '기사 배정 완료' : labels[next], async () => {
          const question = next === 'assigned' ? '코리아센터에서 기사 배정을 확인했나요? 고객 문의함으로 배정 알림을 보냅니다.' : next === 'cancelled' ? '이 주문을 취소 처리하고 고객 문의함에 알릴까요?' : '이 주문을 완료 처리할까요?';
          if (!confirm(question)) return; b.disabled = true;
          try { await api.rpc('th6_set_status', { p_id: r.id, p_status: next }); await loadOrders(true); notice('주문을 ' + labels[next] + ' 처리했습니다.'); }
          catch (e) { notice(e.message); b.disabled = false; }
        }, next === 'cancelled' ? 'danger' : next === 'assigned' ? '' : 'secondary'); actions.append(b);
      }
      card.append(actions); root.append(card);
    }
  }
  document.querySelectorAll('[data-status]').forEach(b => b.onclick = () => {
    status = b.dataset.status; $('search').value = '';
    document.querySelectorAll('[data-status]').forEach(other => { const active = other === b; other.className = active ? '' : 'secondary'; other.setAttribute('aria-pressed', String(active)); }); loadOrders(true);
  });
  $('refresh').onclick = () => loadOrders(true); $('more').onclick = () => loadOrders(false); $('search').oninput = renderOrders; $('orderDate').onchange = () => loadOrders(true);
  async function loadStaff() {
    staffRows = await api.api('/rest/v1/th6_staff?select=*&order=name.asc');
    $('clientStaff').replaceChildren(); $('staffList').replaceChildren();
    for (const r of staffRows) {
      const opt = text('option', r.name + (!r.active ? ' (비활성)' : '')); opt.value = r.user_id;
      if (r.role === 'sales' || staffRows.length === 1) $('clientStaff').append(opt);
      if (!owner()) continue;
      const card = text('article', '', 'staff-card'); card.append(text('strong', r.name + ' · ' + (r.role === 'owner' ? '대표' : '영업자')));
      if (r.link_slug) {
        const link = new URL('index.html', location.href); link.searchParams.set('sales', r.link_slug);
        card.append(text('p', link.href, 'link-preview')); card.append(button('홍보 링크 복사', async () => { try { await navigator.clipboard.writeText(link.href); notice('영업자 링크를 복사했습니다.'); } catch { notice('표시된 링크를 직접 복사해 주세요.'); } }));
      } else if (r.role !== 'owner') card.append(text('p', new URL('index.html', location.href).href, 'link-preview'));
      card.append(text('p', r.active ? '활성화' : '비활성화', 'portal-note'));
      if (r.role === 'sales') card.append(button('수정', () => editStaff(r))); $('staffList').append(card);
    }
    if (owner()) { const settings = await api.api('/rest/v1/th6_settings?select=control_ready'); $('newControl').hidden = Boolean(settings[0]?.control_ready); }
  }
  async function loadClients() {
    clients = await api.api('/rest/v1/th6_clients?select=*&order=company.asc'); renderClients();
  }
  function renderClients() {
    const root = $('clientList'); root.replaceChildren(); const q = $('clientSearch').value.toLowerCase();
    for (const c of clients.filter(c => c.company.toLowerCase().includes(q))) {
      const card = text('article', '', 'client-card'); card.append(text('h3', c.company), text('p', (c.address + ' ' + c.detail).trim() || '등록 주소 없음'), text('p', (c.active ? '활성화' : '비활성화') + ' · 담당: ' + (staffRows.find(s => s.user_id === c.staff_id)?.name || '담당 영업자'), 'portal-note'));
      card.append(button(owner() ? '의뢰자 · 계정 · 거래처 관리' : '등록 정보 · 거래처 확인', () => editClient(c))); root.append(card);
    }
    if (!root.children.length) root.append(text('p', '등록된 의뢰자가 없습니다.'));
  }
  $('clientSearch').oninput = renderClients;
  async function editClient(c) {
    currentClient = c || null; $('clientId').value = c?.id || ''; $('clientCompany').value = c?.company || '';
    $('clientAddress').value = c?.address || ''; $('clientAddress').dataset.meta = JSON.stringify(c?.address_meta || {});
    $('clientDetail').value = c?.detail || ''; $('clientStaff').value = c?.staff_id || staffRows.find(s => s.role==='sales')?.user_id || staff.user_id; $('clientActive').checked = c?.active ?? true;
    $('clientDialogTitle').textContent = c ? c.company : '의뢰자 등록'; $('clientNotice').textContent = '';
    $('clientAccounts').hidden = !c; $('clientSave').hidden = !owner(); $('clientDelete').hidden = !owner() || !c;
    for (const input of $('clientForm').querySelectorAll('input,select')) input.disabled = !owner();
    if (!$('clientDialog').open) $('clientDialog').showModal();
    if (c) try { await loadClientAccounts(); } catch (e) { $('clientNotice').textContent = e.message; }
  }
  $('newClient').onclick = () => editClient(null); $('clientClose').onclick = () => $('clientDialog').close();
  $('clientAddress').onclick = async () => { if (!owner()) return; try { const result = await window.TH_ADDRESS.pick(); if (result) { $('clientAddress').value = result.address; $('clientAddress').dataset.meta = JSON.stringify(result.meta); } } catch (e) { $('clientNotice').textContent = e.message; } };
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
      if (owner()) {
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
    creatingControl = control;
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
        loginId: $('staffLogin').value.trim(), password: $('staffPassword').value, active: $('staffActive').checked });
      if (creatingControl) {
        $('staffPassword').value = ''; $('staffDialog').close(); await api.logout();
        notice('관제 계정을 생성했습니다. 새 관제 아이디로 로그인하세요. 기존 계정은 첫 번째 영업자 권한입니다.'); return;
      }
      $('staffPassword').value = ''; $('staffDialog').close(); await loadStaff(); notice('영업자 정보를 저장했습니다.');
    } catch (e) { $('staffNotice').textContent = e.message; }
    finally { $('staffSave').disabled = false; }
  };
  async function loadSettings() {
    const settings = await api.rpc('th6_public_settings'); $('nightEnabled').checked = settings.nightEnabled;
    document.querySelectorAll('[data-service]').forEach(c => c.checked = Boolean(settings.services?.[c.dataset.service]));
  }
  $('nightEnabled').onchange = async () => {
    const c = $('nightEnabled'); c.disabled = true;
    try { await api.rpc('th6_set_night', { p_enabled: c.checked }); notice('야간요금을 ' + (c.checked ? '활성화' : '비활성화') + '했습니다.'); }
    catch(e) { c.checked=!c.checked; notice(e.message); } finally { c.disabled=false; }
  };
  document.querySelectorAll('[data-service]').forEach(c => c.onchange=async()=> {
    c.disabled=true; try { await api.rpc('th6_set_service',{p_service:c.dataset.service,p_enabled:c.checked}); notice('서비스 설정을 저장했습니다.'); }
    catch(e) { c.checked=!c.checked;notice(e.message); } finally { c.disabled=false; }
  });
  async function loadThreads() {
    threads=await api.api('/rest/v1/th6_threads?select=id,name,phone,updated_at,last_customer_at,admin_read_at&order=updated_at.desc&limit=100');
    $('threadList').replaceChildren();
    for(const t of threads) { const b=button(t.name+' · '+t.phone,()=>openThread(t.id),'thread-item secondary'); $('threadList').append(b); }
    if(!threads.length) $('threadList').append(text('p','문의가 없습니다.'));
  }
  async function openThread(id) {
    currentThread=id;$('adminChat').hidden=false;$('chatTitle').textContent=threads.find(t=>t.id===id)?.name||'고객 문의';
    $('chatPhone').textContent=threads.find(t=>t.id===id)?.phone||'';
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
  }
  $('replyForm').onsubmit=async e=> {
    e.preventDefault();if(!currentThread||!$('replyBody').value.trim())return;$('replySend').disabled=true;
    try { const body=$('replyBody').value.trim();if(!replyAttempt||replyAttempt.body!==body||replyAttempt.thread!==currentThread)replyAttempt={id:crypto.randomUUID(),body,thread:currentThread};
      await api.rpc('th6_admin_reply',{p_thread:replyAttempt.thread,p_body:body,p_message:replyAttempt.id});replyAttempt=null;$('replyBody').value='';await readAdminChat();
    } catch(e) { notice(e.message); } finally { $('replySend').disabled=false; }
  };
  async function beep() {
    audio ||= new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
    const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=880;
    gain.gain.setValueAtTime(.12,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.4);oscillator.start();oscillator.stop(audio.currentTime+.4);
  }
  $('soundToggle').onclick=async()=>{try { if(!soundEnabled)await beep();soundEnabled=!soundEnabled;$('soundToggle').textContent=soundEnabled?'알림 소리 끄기':'알림 소리 켜기'; }catch(e){notice('소리를 재생하지 못했습니다. 기기 음량을 확인해 주세요.');}};
  $('soundTest').onclick=()=>beep().catch(()=>notice('소리를 재생하지 못했습니다.'));
  async function poll() {
    if(!staff||document.hidden||polling)return;polling=true;
    try {
      const result=await api.rpc('th6_admin_events',{p_since:pollCursor});
      const orders=result.orders||[],incoming=result.threads||[];
      const newOrder=baseline&&orders.some(o=>!seenOrders.has(o.id));
      const newMessage=baseline&&incoming.some(t=>t.last_customer_at&&seenThreads.get(t.id)?.customer!==t.last_customer_at);
      const orderChanged=orders.some(o=>seenOrders.get(o.id)!==o.updated_at),chatChanged=incoming.some(t=>seenThreads.get(t.id)?.updated!==t.updated_at);
      for(const o of orders)seenOrders.set(o.id,o.updated_at);for(const t of incoming)seenThreads.set(t.id,{customer:t.last_customer_at,updated:t.updated_at});
      pollCursor=result.cursor;baseline=true;
      if(newOrder||newMessage){notice(newOrder?'새 주문이 도착했습니다.':'새 문의가 도착했습니다.');if(soundEnabled)await beep();}
      if(orderChanged&&page==='orders')await loadOrders(true);
      if(chatChanged&&page==='chat'){await loadThreads();if(currentThread)await readAdminChat();}
      $('unreadCount').textContent=result.unread||'';$('unreadCount').hidden=!result.unread;
    }catch(e){notice('새 주문 확인 중 연결 오류: '+e.message);}finally{polling=false;}
  }
  setInterval(poll,10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  (async()=>{await api.restore();if(api.session)try{await enter();}catch(e){notice(e.message);}})();
})();
