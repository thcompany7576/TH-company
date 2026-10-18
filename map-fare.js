(()=>{
 'use strict';
 const form=document.getElementById('order'),review=document.getElementById('review'),base=document.getElementById('distanceFare'),panel=document.getElementById('fareReview');
 const map=base?.closest('section'),submit=form?.querySelector('button[type="submit"]');
 if(!map||!panel||!submit)return;
 map.id='orderMapSection';
 const oldEstimate=form.querySelector('.compact-fare-note > p:first-child');if(oldEstimate)oldEstimate.hidden=true;
 const actions=submit.closest('.actions')||submit;
 actions.before(map);
 const position=document.createComment('map position before order review');map.before(position);
 map.append(panel);panel.querySelector('h3').textContent='요금 안내';base.hidden=true;
 const hint=document.createElement('p');hint.className='portal-note';hint.id='mapFareHint';panel.before(hint);
 function render(){
  if(document.getElementById('sms').textContent==='접수 완료')return;
  const distance=window.TH_MAP?.getDistance();panel.hidden=!distance;
  hint.hidden=!distance;
  if(!distance)return;
  const quote=window.TH_FARE.quote(distance);
  hint.textContent=quote.total===null?'선택하지 않은 크기·무게 등 주문 항목을 확인해 주세요.':'선택한 주문 조건에 따른 요금입니다.';
  window.TH_FARE.renderReview(distance);
 }
 form.addEventListener('input',render);form.addEventListener('change',render);
 form.addEventListener('th:review',()=>{review.before(map);render();});
 document.getElementById('edit').addEventListener('click',()=>{position.after(map);render();});
 window.TH_MAP_FARE={render};render();
})();
