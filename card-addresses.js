(() => {
'use strict';
let loading,active=0;
const cache=new Map(),queue=[];
function sdk(){
 if(window.kakao?.maps?.services?.Geocoder)return Promise.resolve();
 if(!loading)loading=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('주소 조회 시간 초과')),15000);
  const ready=()=>{if(!window.kakao?.maps?.load){clearTimeout(timer);reject(Error('지도 서비스 확인 필요'));return;}
   kakao.maps.load(()=>{clearTimeout(timer);window.kakao.maps.services?.Geocoder?resolve():reject(Error('주소 서비스 확인 필요'));});};
  if(window.kakao?.maps?.load){ready();return;}
  const script=document.createElement('script');script.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey=3de9d55c96ae685b862f0296d08accb3&libraries=services&autoload=false';
  script.onload=ready;script.onerror=()=>{clearTimeout(timer);reject(Error('지도 연결 실패'));};document.head.append(script);
 }).catch(error=>{loading=null;throw error;});
 return loading;
}
function drain(){while(active<4&&queue.length){active++;queue.shift()().finally(()=>{active--;drain();});}}
function lookup(address){
 if(cache.has(address))return cache.get(address);
 const task=new Promise((resolve,reject)=>{queue.push(async()=>{try{
  await sdk();await new Promise((done)=>{
   const timer=setTimeout(()=>{reject(Error('주소 조회 시간 초과'));done();},10000);
   new kakao.maps.services.Geocoder().addressSearch(address,(results,status)=>{
    clearTimeout(timer);
    if(status!==kakao.maps.services.Status.OK||results.length!==1){reject(Error('주소를 한 곳으로 확인하지 못함'));done();return;}
    const point=results[0];resolve({road:point.road_address?.address_name||'',jibun:point.address?.address_name||''});done();
   },{analyze_type:kakao.maps.services.AnalyzeType.EXACT});
  });
 }catch(error){reject(error);}});});
 cache.set(address,task);if(cache.size>500)cache.delete(cache.keys().next().value);drain();task.catch(()=>cache.delete(address));return task;
}
function render(container,address){
 const box=document.createElement('span');box.className='order-dual-address';box.style.cssText='display:block;font-size:13px;line-height:1.65;margin-top:4px;overflow-wrap:anywhere';
 box.textContent='도로명·지번주소 확인 중…';container.append(box);
 lookup(address).then(data=>{
  if(!box.isConnected)return;
  box.replaceChildren();
  for(const [label,value] of [['도로명',data.road],['지번',data.jibun]]){
   const row=document.createElement('span');row.style.display='block';row.append(document.createTextNode(label+': '));
   if(value){const link=document.createElement('a');link.className='order-address';link.textContent=value;link.href='https://map.kakao.com/link/search/'+encodeURIComponent(value);link.target='_blank';link.rel='noopener noreferrer';row.append(link);}else row.append(document.createTextNode('확인되지 않음'));
   box.append(row);
  }
  const original=container.querySelector(':scope > a.order-address');if(original)original.hidden=true;
 }).catch(()=>{if(box.isConnected)box.textContent='도로명·지번주소 조회 불가 · 기존 주소로 확인해 주세요.';});
}
window.TH_CARD_ADDRESSES={render};
})();
