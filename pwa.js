(() => {
  'use strict';
  let promptEvent;
  const buttons = document.querySelectorAll('[data-install]'), hints = document.querySelectorAll('[data-install-hint]');
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); promptEvent = event; buttons.forEach(b => b.hidden = false); });
  buttons.forEach(b => b.onclick = async () => {
    if (!promptEvent) return;
    const sales = new URLSearchParams(location.search).get('sales') || '';
    // 설치된 주문앱에서도 설치 당시 영업자 링크를 유지한다.
    if (document.documentElement.dataset.surface === 'customer') try { localStorage.setItem('th6:installed-sales', sales); } catch {}
    await promptEvent.prompt(); await promptEvent.userChoice; promptEvent = null; buttons.forEach(b => b.hidden = true);
  });
  window.addEventListener('appinstalled', () => { buttons.forEach(b => b.hidden = true); hints.forEach(h => h.textContent = '홈 화면에 설치했습니다.'); });
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) hints.forEach(h => h.textContent = 'Safari 공유 메뉴 → 홈 화면에 추가로 설치할 수 있습니다.');
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
      reg.update().catch(()=>{});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{});});
    }).catch(() => { hints.forEach(h => h.textContent = '설치 기능을 준비하지 못했습니다. 브라우저에서 계속 이용할 수 있습니다.'); });
  }
  const banner = document.createElement('div'); banner.className = 'offline-banner'; banner.hidden = navigator.onLine; banner.textContent = '인터넷 연결이 끊겼습니다. 로그인·주문 접수·문의 전송은 연결 후 이용해 주세요.'; document.body.prepend(banner);
  window.addEventListener('offline', () => banner.hidden = false); window.addEventListener('online', () => banner.hidden = true);
  // 영업자 링크를 온라인명함 → 주문화면 → 새 주문까지 유지한다.
  const sales = new URLSearchParams(location.search).get('sales');
  if (sales) for (const a of document.querySelectorAll('a[href]')) {
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && /\/(index|order)\.html$/.test(url.pathname)) { url.searchParams.set('sales', sales); a.href = url.href; }
  }
})();
