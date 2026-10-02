(() => {
 const sales=new URLSearchParams(location.search).get('sales');if(!sales)return;
 const phone=document.querySelector('.phone'),call=document.querySelector('a[href^="tel:"]'),kakao=document.querySelector('a.kakao'),order=document.querySelector('a[href="order.html"]'),hint=document.querySelector('.hint'),title=document.querySelector('.title');
 call.hidden=kakao.hidden=order.hidden=true;phone.textContent='담당 영업자 확인 중';
 const cfg=window.TH_CONFIG;
 fetch(cfg.url+'/rest/v1/rpc/th6_public_route',{method:'POST',headers:{apikey:cfg.publicKey,'Content-Type':'application/json'},body:JSON.stringify({p_slug:sales})})
 .then(async r=>{if(!r.ok)throw Error('담당 영업자를 확인하지 못했습니다.');return r.json();})
 .then(r=>{
  if(!r)throw Error('사용할 수 없는 영업자 링크입니다.');title.textContent='TH company · '+r.name;document.title='TH company · '+r.name;
  const target=new URL('order.html',location.href);target.searchParams.set('sales',sales);order.href=target.href;order.hidden=false;
  if(r.phone&&/^[0-9-]{9,14}$/.test(r.phone)){phone.textContent=r.phone;call.href='tel:'+r.phone.replace(/-/g,'');call.hidden=false;}else phone.textContent='전화번호 등록 준비 중';
  if(/^https:\/\/open\.kakao\.com\/(o|me)\/[A-Za-z0-9_-]+$/.test(r.kakaoUrl||'')){kakao.href=r.kakaoUrl;kakao.hidden=false;}
  hint.textContent=r.name+' 영업자에게 전화 또는 카카오톡으로 문의해 주세요.';
 }).catch(e=>{phone.textContent='담당 영업자 확인 필요';hint.textContent=e.message;});
})();
