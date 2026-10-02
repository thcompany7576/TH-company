(() => {
  'use strict';
  const api = window.TH_API, $ = id => document.getElementById(id);
  let staff = null, busy = false;
  const capable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function info(message) { $('pushStatus').textContent = message; }
  async function server(path, body) { return api.api('/functions/v1/staff-push' + path, body ? {method:'POST',body:JSON.stringify(body)} : {}); }
  async function registration() { await navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}); return navigator.serviceWorker.ready; }
  function bytes(key) { const raw = atob(key.replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(raw, c=>c.charCodeAt(0)); }
  async function sync() {
    if (!staff) return;
    if (ios() && !installed()) { info('아이폰: Safari 공유 메뉴에서 관리페이지를 홈 화면에 추가한 뒤 알림을 허용해 주세요.'); return; }
    if (!capable()) { info('이 브라우저는 푸시 알림을 지원하지 않습니다. 최신 Safari 또는 Chrome을 이용해 주세요.'); return; }
    if (Notification.permission === 'denied') { info('휴대폰 설정에서 이 앱의 알림을 허용해 주세요.'); return; }
    if (Notification.permission !== 'granted') { info('알림을 허용하면 관리화면을 닫아도 주문과 문의를 받을 수 있습니다.'); return; }
    const reg = await registration(), sub = await reg.pushManager.getSubscription();
    if (!sub) { info('아래 버튼을 눌러 이 기기의 알림을 연결해 주세요.'); return; }
    await server('/subscribe', {subscription:sub.toJSON()});
    info('이 기기의 푸시 알림이 연결되었습니다. 잠금 화면에서는 휴대폰 알림 설정을 따릅니다.');
  }
  $('pushEnable').onclick = async () => {
    if (!staff || busy) return;
    if (ios() && !installed()) { await sync(); return; }
    if (!capable()) { await sync(); return; }
    busy = true; $('pushEnable').disabled = true;
    try {
      // Permission must be requested directly from the user's tap, before network waits.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { await sync(); return; }
      const {publicKey} = await server('/config'), reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
      await server('/subscribe',{subscription:sub.toJSON()}); await sync();
    } catch(e) { info('알림 연결을 완료하지 못했습니다. ' + e.message); }
    finally { busy = false; $('pushEnable').disabled = false; }
  };
  window.TH_PUSH = {
    async init(account) { staff = account; $('pushPanel').hidden = false; try { await sync(); } catch(e) { info('알림 연결 확인 중: ' + e.message); } },
    async disconnect() {
      if (capable()) { const reg = await registration(), sub = await reg.pushManager.getSubscription(); if (sub) await server('/unsubscribe',{endpoint:sub.endpoint}); }
      staff = null; $('pushPanel').hidden = true;
    },
    reset() { staff = null; $('pushPanel').hidden = true; }
  };
})();
