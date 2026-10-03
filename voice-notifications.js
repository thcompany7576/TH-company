(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const styles=[{name:'또렷한 안내',rate:1,pitch:1},{name:'밝은 안내',rate:1.12,pitch:1.15},{name:'차분한 안내',rate:.9,pitch:.9}];
  const phrases={order:'새 주문입니다.',approved:'배정 요청입니다.',message:'새 메시지입니다.',reply:'새 답변입니다.',assigned:'기사가 배정됐습니다.',fare:'요금이 변경됐습니다.',completed:'배송이 완료됐습니다.',held:'주문이 보류됐습니다.',restored:'주문을 다시 진행합니다.',notice:'새 알림입니다.'};
  let selected=0,user='',unlocked=false,lastPlay=0;
  const key=()=> 'th6:voice-style:'+(user||'device');
  function label(){if($('soundChoose'))$('soundChoose').textContent='음성: '+styles[selected].name;}
  function init(id){user=id||'';try{const n=Number(localStorage.getItem(key()));selected=Number.isInteger(n)&&n>=0&&n<3?n:0;}catch{selected=0;}label();}
  function prime(){if(unlocked)return;unlocked=true;try{const silent=new SpeechSynthesisUtterance(' ');silent.volume=0;speechSynthesis.speak(silent);}catch{}}
  document.addEventListener('pointerdown',prime,{capture:true});document.addEventListener('keydown',prime,{capture:true});
  async function play(kind='message',preview=false,index=selected){
    if(!unlocked||!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return false;
    if(!preview&&Date.now()-lastPlay<2500)return true;lastPlay=Date.now();
    const event=Object.hasOwn(phrases,kind)?kind:'notice';
    try{
      const utterance=new SpeechSynthesisUtterance(phrases[event]),style=styles[index];utterance.lang='ko-KR';utterance.rate=style.rate;utterance.pitch=style.pitch;utterance.volume=1;
      const korean=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('ko'));if(korean)utterance.voice=korean;
      utterance.onerror=()=>{if($('soundNote'))$('soundNote').textContent='기기의 한국어 음성·음량 설정을 확인해 주세요. 화면의 새 알림 표시는 계속 유지됩니다.';};
      speechSynthesis.cancel();speechSynthesis.resume();speechSynthesis.speak(utterance);return true;
    }catch{return false;}
  }
  if($('soundChoose'))$('soundChoose').onclick=()=>{
    prime();$('soundOptions').replaceChildren();
    styles.forEach((style,index)=>{
      const row=document.createElement('div');row.className='setting-card';const title=document.createElement('strong');title.textContent=style.name;
      const actions=document.createElement('div');actions.className='actions';
      const listen=document.createElement('button');listen.type='button';listen.className='secondary';listen.textContent='미리 듣기';listen.setAttribute('aria-label',style.name+' 미리 듣기');
      listen.onclick=async()=>{if(!await play('order',true,index))$('soundNote').textContent='기기 음량과 인터넷 연결을 확인해 주세요.';};
      const choose=document.createElement('button');choose.type='button';choose.textContent=index===selected?'선택됨':'이 안내로 선택';choose.setAttribute('aria-pressed',String(index===selected));
      choose.onclick=()=>{selected=index;try{localStorage.setItem(key(),String(index));}catch{}label();$('soundDialog').close();play('order',true,index);};
      actions.append(listen,choose);row.append(title,actions);$('soundOptions').append(row);
    });
    $('soundNote').textContent='화면이 열린 상태에서 짧게 안내합니다. 기기의 한국어 음성을 사용하므로 목소리는 기기마다 다를 수 있습니다.';$('soundDialog').showModal();
  };
  if($('soundClose'))$('soundClose').onclick=()=>$('soundDialog').close();
  window.TH_SOUNDS={init,play,prime};init('');
})();
