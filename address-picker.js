(() => {
  let loading, busy = false;
  function sdk() {
    if (window.daum?.Postcode) return Promise.resolve();
    if (!loading) loading = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      const timer = setTimeout(() => reject(Error('주소 검색 연결 시간이 초과되었습니다.')), 15000);
      s.onload = () => { clearTimeout(timer); resolve(); }; s.onerror = () => { clearTimeout(timer); reject(Error('주소 검색을 불러오지 못했습니다.')); };
      document.head.append(s);
    }).catch(e => { loading = null; throw e; });
    return loading;
  }
  window.TH_ADDRESS = { async pick() {
    if (busy) return null;
    busy = true;
    try {
      await sdk();
      return await new Promise(resolve => {
        const dialog = document.createElement('dialog'); dialog.className = 'address-picker';
        dialog.style.cssText = 'width:min(480px,calc(100% - 24px));border:0;border-radius:14px;padding:12px;background:white;color:#111';
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
        const holder = document.createElement('div'); holder.style.height = 'min(520px,70dvh)'; dialog.append(close, holder); document.body.append(dialog);
        let result = null;
        dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true }); close.onclick = () => dialog.close();
        dialog.showModal(); new daum.Postcode({ width: '100%', height: '100%', oncomplete(data) {
          const address = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
          if (!address) return;
          result = { address, meta: { areaCode: String(data.sigunguCode || data.bcode?.slice(0,5) || ''),
            township: /[읍면]$/.test(data.bname1 || '') ? data.bname1 : /[읍면]$/.test(data.bname || '') ? data.bname : '',
            county: /군$/.test(data.sigungu || '') ? 'yes' : 'no' } }; dialog.close();
        }}).embed(holder);
      });
    } finally { busy = false; }
  }};
})();
