(()=>{
 'use strict';
 const key=v=>String(v||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 const digits=v=>String(v||'').replace(/\D/g,'');
 async function review(locations){
  for(const p of locations){
   delete p.address.dataset.savePartner;
   let saved;try{saved=JSON.parse(p.address.dataset.savedPartner||'null');}catch{}
   if(!saved||key(saved.address)!==key(p.address.value)||key(saved.detail)!==key(p.detail.value))continue;
   const person=p.person.value.trim()||p.person.dataset.requesterExample||'',phone=p.phone.value.trim()||p.phone.dataset.requesterExample||'';
   if(key(saved.person)===key(person)&&digits(saved.phone)===digits(phone))continue;
   const save=await choose(p.label||'거래처');p.address.dataset.savePartner=String(save);
  }
 }
 function choose(label){return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog');dialog.className='chat-dialog';
  const title=document.createElement('h2');title.textContent=label+' 수령인 정보 변경';
  const note=document.createElement('p');note.textContent='선택한 거래처와 성명 또는 연락처가 다릅니다. 기존 거래처는 그대로 유지됩니다.';dialog.append(title,note);
  const done=value=>{dialog.close();dialog.remove();if(value===null)reject(Error('주문 내용을 다시 확인해 주세요.'));else resolve(value);};
  for(const [label,value] of [['이번 주문에만 사용',false],['새 거래처로도 저장',true],['돌아가기',null]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>done(value);dialog.append(b);}
  dialog.addEventListener('cancel',e=>{e.preventDefault();done(null);});document.body.append(dialog);dialog.showModal();
 });}
 window.TH_PARTNER_CHOICE={review};
})();
