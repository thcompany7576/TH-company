(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const tones=[
  {name:'산뜻한 벨',notes:[784,1046,1318],step:.27,length:.34,type:'sine'},
  {name:'경쾌한 실로폰',notes:[1046,1318,1568,1318],step:.21,length:.25,type:'triangle'},
  {name:'밝은 차임',notes:[659,880,1174],step:.31,length:.42,type:'sine'},
  {name:'톡톡 알림',notes:[1046,1046,1568],step:.24,length:.23,type:'triangle'},
  {name:'도레미 멜로디',notes:[784,880,988,1174],step:.22,length:.28,type:'sine'}
 ];
 let audio,selected=0,user='',lastPlay=0;const playing=new Set();
 const key=()=> 'th6:alert-sound:'+ (user||'device');
 function label(){ $('soundChoose').textContent='알림음: '+tones[selected].name; }
 function init(id){user=id||'';try{const n=Number(localStorage.getItem(key()));selected=Number.isInteger(n)&&n>=0&&n<tones.length?n:0;}catch{selected=0;}label();}
 function prime(){
  try{audio ||=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}
 }
 document.addEventListener('pointerdown',prime,{capture:true});document.addEventListener('keydown',prime,{capture:true});
 async function play(index=selected,preview=false){
  prime();if(!audio||audio.state!=='running')return false;
  if(!preview&&Date.now()-lastPlay<3000)return true;lastPlay=Date.now();
  if(preview){for(const osc of playing){try{osc.stop();}catch{}}playing.clear();}
  const t=tones[index],start=audio.currentTime+.04;
  for(let repeat=0;repeat<3;repeat++)for(let n=0;n<t.notes.length;n++){
   const at=start+repeat*(t.notes.length*t.step+.3)+n*t.step,osc=audio.createOscillator(),gain=audio.createGain();
   osc.type=t.type;osc.frequency.value=t.notes[n];osc.connect(gain);gain.connect(audio.destination);
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.35,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+t.length);
   playing.add(osc);osc.start(at);osc.stop(at+t.length+.02);osc.onended=()=>{playing.delete(osc);osc.disconnect();gain.disconnect();};
  }
  return true;
 }
 $('soundChoose').onclick=()=>{
  prime();$('soundOptions').replaceChildren();
  tones.forEach((tone,index)=>{
   const row=document.createElement('div');row.className='setting-card';
   const name=document.createElement('strong');name.textContent=tone.name;row.append(name);
   const actions=document.createElement('div');actions.className='actions';actions.style.marginTop='10px';
   const listen=document.createElement('button');listen.type='button';listen.className='secondary';listen.textContent='미리 듣기';listen.setAttribute('aria-label',tone.name+' 미리 듣기');listen.onclick=async()=>{prime();await new Promise(resolve=>setTimeout(resolve,60));if(!await play(index,true))$('soundNote').textContent='소리가 나지 않으면 기기 음량을 확인하고 다시 눌러 주세요.';};
   const choose=document.createElement('button');choose.type='button';choose.textContent=index===selected?'선택됨':'이 소리로 선택';choose.setAttribute('aria-label',tone.name+' 선택');choose.setAttribute('aria-pressed',String(index===selected));
   choose.onclick=()=>{selected=index;try{localStorage.setItem(key(),String(index));}catch{}label();$('soundDialog').close();prime();setTimeout(()=>play(index,true),60);};actions.append(listen,choose);row.append(actions);$('soundOptions').append(row);
  });$('soundNote').textContent='선택한 소리는 이 기기에서 유지됩니다. 알림은 항상 켜져 있습니다.';$('soundDialog').showModal();
 };
 $('soundClose').onclick=()=> $('soundDialog').close();
 window.TH_SOUNDS={init,play,prime};init('');
})();
