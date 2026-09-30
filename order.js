'use strict';
const $=id=>document.getElementById(id), form=$('order');
const seoulParts=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
const today=()=>seoulParts(new Date()).slice(0,10);
function night(d){const h=Number(seoulParts(d).slice(11,13));return h>=20||h<5;}
function reservation(){return new Date(`${$('date').value}T${$('time').value}:00+09:00`);}
function update(){const reserved=$('pickup').value==='reserve';$('reservation').hidden=!reserved;$('date').required=reserved;$('time').required=reserved;$('date').min=today();
 const now=new Date(); for(const o of $('time').options)o.disabled=reserved&&new Date(`${$('date').value}T${o.value}:00+09:00`)<=now;
 const target=reserved?reservation():now, hours=(target-now)/3600000;
 const valid=Number.isFinite(hours)&&(!reserved||hours>0);
 const fee=reserved&&hours>1?3000:0,deposit=reserved&&hours>=3?10000:0;
 $('chargeInfo').textContent=valid?`예약 추가요금 ${fee.toLocaleString()}원 · 보증금 ${deposit.toLocaleString()}원${night(target)?' · 야간 70% 할증 적용':''}`:'예약 날짜와 시간을 확인해 주세요.';
 $('reservationInfo').textContent=reserved?$('chargeInfo').textContent:'';
 const round=$('trip').value==='round';$('returnField').hidden=!round;$('returnItem').required=round;
 const other=$('payer').selectedIndex===2;$('payerFields').hidden=!other;$('payerName').required=other;
 $('stopsSection').hidden=!$('hasStops').checked;for(const e of $('stops').querySelectorAll('input,select'))e.disabled=!$('hasStops').checked;
}
for(let h=0;h<24;h++)for(const m of ['00','30']){const o=document.createElement('option');o.value=`${String(h).padStart(2,'0')}:${m}`;o.textContent=o.value;$('time').append(o);}
$('date').value=today();const next=new Date(Math.ceil((Date.now()+1)/1800000)*1800000);$('date').value=seoulParts(next).slice(0,10);$('time').value=seoulParts(next).slice(11,16);
$('addStop').onclick=()=>{const box=document.createElement('fieldset');box.className='stop';box.innerHTML='<label>경유 업무<select><option>물품 픽업</option><option>물품 전달</option></select></label><label>주소·상세주소<input required></label><label>담당자·연락처<input required></label><button type="button" class="secondary">경유지 삭제</button>';box.querySelector('button').onclick=()=>box.remove();$('stops').append(box);update();};
$('hasStops').onchange=()=>{if($('hasStops').checked&&!$('stops').children.length)$('addStop').click();update();};
form.addEventListener('change',update);
form.onsubmit=e=>{e.preventDefault();update();const now=new Date(),reserved=$('pickup').value==='reserve';if(reserved&&(!(reservation()>now)||!/^\d{2}:(00|30)$/.test($('time').value))){$('time').setCustomValidity('현재 이후의 30분 단위 시간을 선택해 주세요.');$('time').reportValidity();$('time').setCustomValidity('');return;}
 const f=new FormData(form),v=k=>String(f.get(k)||'').trim();
 const lines=['[TH company 오토바이 주문 요청]',`작성 시간: ${seoulParts(now)} (한국 시간)`,`픽업: ${reserved?`${v('date')} ${v('time')} 예약`:'바로 픽업'}`,`출발: ${v('from')} ${v('fromDetail')}`,`픽업 담당자: ${v('sender')} / ${v('senderPhone')}`,`도착: ${v('to')} ${v('toDetail')}`,`받으실 분: ${v('receiver')} / ${v('receiverPhone')}`,`물품: ${v('item')} ${v('quantity')} / ${v('packing')}`,`배송: ${v('trip')==='round'?'왕복 / 돌아올 물품: '+v('returnItem'):'편도'}`];
 if($('hasStops').checked)[...$('stops').children].forEach((s,i)=>{const inputs=s.querySelectorAll('input');lines.push(`경유 ${i+1}: ${s.querySelector('select').value} / ${inputs[0].value} / ${inputs[1].value}`);});
 lines.push(`결제자: ${v('payer')}${$('payer').selectedIndex===2?' / '+v('payerName')+' / '+(v('payerPhone')||'연락처 미확인'):''}`,`요청사항: ${v('notes')||'없음'}`,'예상 운행요금: 거리 확인 후 안내',$('chargeInfo').textContent,'담당자 확인 후 접수 및 요금 확정 요청');
 $('summary').textContent=lines.join('\n');form.hidden=true;$('review').hidden=false;$('review').scrollIntoView({behavior:'smooth'});
};
$('edit').onclick=()=>{form.hidden=false;$('review').hidden=true;update();};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('summary').textContent);$('message').textContent='복사했습니다. 카카오톡 상담창에 붙여넣어 보내 주세요.';}catch{const r=document.createRange();r.selectNodeContents($('summary'));getSelection().removeAllRanges();getSelection().addRange(r);$('message').textContent='주문 내용을 길게 눌러 복사해 주세요.';}};
let submissionId=null;
$('sms').onclick=async()=>{
 const cfg=window.TH_CONFIG||{};
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url||'')||!cfg.publicKey){$('message').textContent='주문 저장 서비스 연결 전입니다. 아직 접수되지 않았습니다. 전화 또는 카카오톡으로 문의해 주세요.';return;}
 if(!submissionId)submissionId=crypto.randomUUID();
 $('sms').disabled=true;$('edit').disabled=true;$('message').textContent='주문을 접수하는 중입니다…';
 try{
 const res=await fetch(cfg.url+'/rest/v1/th_orders',{method:'POST',headers:{apikey:cfg.publicKey,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({id:submissionId,summary:$('summary').textContent})});
 if(res.status===409){$('message').textContent='동일한 주문번호로 저장된 요청이 있습니다. 중복 주문을 보내지 말고 담당자에게 확인해 주세요. 주문번호: '+submissionId;$('newOrder').hidden=false;return;}
 if(!res.ok)throw Error('접수하지 못했습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.');
 $('message').textContent='주문 요청이 접수되었습니다. 주문번호: '+submissionId+' · 담당자가 확인 후 연락드립니다. 요금과 배차는 아직 확정되지 않았습니다.';$('sms').textContent='접수 완료';$('newOrder').hidden=false;
 }catch(e){$('message').textContent='전송 결과를 확인하지 못했습니다. 같은 주문번호로 다시 시도하거나 담당자에게 확인해 주세요. 주문번호: '+submissionId;$('sms').disabled=false;}
};
update();
