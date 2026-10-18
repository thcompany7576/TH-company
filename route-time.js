(()=>{
 'use strict';
 const fare=document.getElementById('distanceFare'),form=document.getElementById('order');if(!fare||!form)return;
 const row=document.createElement('div');row.className='fare-route-summary';fare.before(row);row.append(fare);
 const time=document.createElement('span');time.id='routePlannedTime';time.className='fare-base';time.setAttribute('role','status');time.hidden=true;row.append(time);
 const note=document.createElement('p');note.className='muted';note.id='routeTimeNote';note.textContent='거리 기준 배송 목표시간이며, 배정·교통·대기 상황에 따라 달라질 수 있습니다.';note.hidden=true;row.after(note);
 const style=document.createElement('style');style.textContent='.fare-route-summary{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px 24px}.fare-route-summary #distanceFare{margin-bottom:0}#routeTimeNote{font-size:13px;margin-top:8px}';document.head.append(style);
 const minutes=(d,urgent)=>{const meters=d?.baseMeters??d?.outboundMeters;if(!Number.isFinite(meters)||meters<0)return null;return Math.max(60,Math.round(meters/1000)*(urgent?4:6));};
 const format=n=>n>=60?Math.floor(n/60)+'시간'+(n%60?' '+n%60+'분':''):n+'분';
 function current(){return minutes(window.TH_MAP?.getDistance(),document.getElementById('urgent').value==='yes');}
 function render(){const n=current();time.hidden=note.hidden=n===null;time.textContent=n===null?'':'배송 목표시간: '+format(n)+' 이내';window.TH_MAP_FARE?.render();}
 form.addEventListener('change',render);document.getElementById('urgentToggle').addEventListener('change',render);
 form.addEventListener('th:review',()=>{const n=current();if(n!==null)document.getElementById('summary').textContent+='\n배송 목표시간: '+format(n)+' 이내 (출발지→경유지→도착지 거리 기준)';});
 window.TH_ROUTE_TIME={minutes,format,render};render();
})();
