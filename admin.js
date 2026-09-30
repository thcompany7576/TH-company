'use strict';
const $=id=>document.getElementById(id),cfg=window.TH_CONFIG||{};
let session=null,rows=[],offset=0,generation=0,remember=false,refreshing=null,authEpoch=0;
const storageKey='th-admin-session:'+cfg.url;
function clearStored(){try{localStorage.removeItem(storageKey);}catch{}}
function persist(){if(!remember||!session)return;try{localStorage.setItem(storageKey,JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at}));}catch{notice('이 브라우저에서는 로그인 유지 정보를 저장할 수 없습니다.');}}
function clearLocal(){authEpoch++;generation++;session=null;remember=false;clearStored();rows=[];offset=0;$('orders').replaceChildren();$('inbox').hidden=true;$('login').hidden=false;$('password').value='';}
async function checkAdmin(){const admin=await api('/rest/v1/th_admins?select=user_id');if(!admin.length){clearLocal();throw Error('이 계정에는 관리자 권한이 없습니다.');}}

function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url||'')&&Boolean(cfg.publicKey);}
function notice(t){$('notice').textContent=t;}
async function api(path,options={}){
 const res=await fetch(cfg.url+path,{...options,headers:{apikey:cfg.publicKey,...(session?{Authorization:'Bearer '+session.access_token}:{}),'Content-Type':'application/json',...options.headers},cache:'no-store'});
 if(!res.ok){if(res.status===401){await signout();throw Error('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.');}throw Error('요청에 실패했습니다. 로그인 정보와 관리자 권한, 연결 설정을 확인해 주세요.');}
 return res.status===204?null:res.json();
}
async function ensureSession(){
 if(!session||Date.now()/1000<session.expires_at-120)return;
 if(refreshing)return refreshing;
 const epoch=authEpoch,token=session.refresh_token;
 refreshing=(async()=>{const res=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.publicKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:token})});
 if(epoch!==authEpoch)return;
 if(!res.ok){if([400,401,403].includes(res.status)){clearLocal();throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');}throw Error('로그인 갱신에 실패했습니다. 잠시 후 다시 시도해 주세요.');}
 const data=await res.json();if(epoch!==authEpoch)return;session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};persist();
 })();try{await refreshing;}finally{refreshing=null;}
}
function render(){const q=$('search').value.toLowerCase();$('orders').replaceChildren();const filtered=rows.filter(r=>(r.summary+' '+r.id).toLowerCase().includes(q));$('count').textContent=`불러온 주문 ${rows.length}건`;if(!filtered.length){const p=document.createElement('p');p.textContent=q?'검색 결과가 없습니다.':'접수된 주문이 없습니다.';$('orders').append(p);}
 for(const r of filtered){const card=document.createElement('article'),title=document.createElement('h2'),time=document.createElement('p'),pre=document.createElement('pre'),copy=document.createElement('button');title.textContent='주문번호 '+r.id;title.style.overflowWrap='anywhere';time.textContent=new Date(r.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' 접수';pre.textContent=r.summary;copy.textContent='코리아센타 입력용 내용 복사';copy.onclick=async()=>{try{await navigator.clipboard.writeText(r.summary);notice('복사했습니다. 코리아센타에 붙여넣어 주세요.');}catch{notice('복사할 수 없습니다. 주문 내용을 선택해 직접 복사해 주세요.');}};card.append(title,time,pre,copy);$('orders').append(card);}
}
async function load(reset=false){const g=++generation;$('refresh').disabled=$('more').disabled=true;notice('주문을 불러오는 중입니다.');try{await ensureSession();if(reset){rows=[];offset=0;}const data=await api(`/rest/v1/th_orders?select=id,created_at,summary&order=created_at.desc,id.desc&limit=50&offset=${offset}`);if(g!==generation||!session)return;const ids=new Set(rows.map(r=>r.id));rows.push(...data.filter(r=>!ids.has(r.id)));offset+=data.length;$('more').hidden=data.length<50;render();notice('주문 목록을 확인했습니다.');}catch(e){notice(e.message);}finally{$('refresh').disabled=$('more').disabled=false;}}
async function signout(){const old=session;clearLocal();notice('로그아웃했습니다.');if(old)try{await fetch(cfg.url+'/auth/v1/logout',{method:'POST',headers:{apikey:cfg.publicKey,Authorization:'Bearer '+old.access_token}});}catch{}}
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!configured()){notice('주문 저장 서비스 연결 전입니다. config.js 설정이 필요합니다.');return;}$('loginButton').disabled=true;try{const data=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};await checkAdmin();remember=$('remember').checked;clearStored();persist();$('password').value='';$('login').hidden=true;$('inbox').hidden=false;await load(true);}catch(e){notice(e.message);}finally{$('loginButton').disabled=false;}};
$('logout').onclick=signout;$('refresh').onclick=()=>load(true);$('more').onclick=()=>load(false);$('search').oninput=render;
if(!configured())notice('연결 준비 중입니다. 데이터베이스와 관리자 계정 설정 후 사용할 수 있습니다.');

async function restore(){if(!configured())return;let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{clearStored();return;}if(!saved)return;
 if(typeof saved.access_token!=='string'||typeof saved.refresh_token!=='string'||!Number.isFinite(saved.expires_at)){clearStored();return;}
 session=saved;remember=true;$('remember').checked=true;$('loginButton').disabled=true;notice('저장된 로그인을 확인하고 있습니다.');
 try{await ensureSession();if(!session)return;await checkAdmin();$('login').hidden=true;$('inbox').hidden=false;await load(true);}catch(e){notice(e.message+' 연결을 확인하고 페이지를 새로고침해 주세요.');}finally{$('loginButton').disabled=false;}
}
window.addEventListener('storage',e=>{if(e.key===storageKey){if(!e.newValue){clearLocal();notice('다른 창에서 로그아웃했습니다.');}else if(remember){try{session=JSON.parse(e.newValue);}catch{}}}});
async function renew(){if(!session)return;try{await ensureSession();}catch(e){notice(e.message);}}
setInterval(renew,30000);
window.addEventListener('focus',renew);
restore();
