(() => {
'use strict';
let entries = new WeakMap();
let serial = 0;
function show(input, data = {}) {
  if (!input || !input.value.trim()) return;
  const key = input.value.trim();
  let entry = entries.get(input);
  if (!entry) {
    const box = document.createElement('div');
    box.id = 'dual-address-' + (++serial); box.className = 'dual-address';
    box.style.cssText = 'font-size:13px;line-height:1.6;margin:6px 0 10px;overflow-wrap:anywhere;font-weight:normal';
    box.setAttribute('aria-live', 'polite');
    input.insertAdjacentElement('afterend', box);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'),box.id].filter(Boolean).join(' '));
    entry = {box}; entries.set(input, entry);
  }
  if (entry.key !== key) { entry.road = ''; entry.jibun = ''; }
  entry.key = key;
  entry.road = data.roadAddress || entry.road || '';
  entry.jibun = data.jibunAddress || entry.jibun || '';
  entry.box.replaceChildren();
  for (const [label, value] of [['도로명주소',entry.road],['지번주소',entry.jibun]]) {
    const row = document.createElement('div'); row.textContent = label + ': ' + (value || '확인되지 않음'); entry.box.append(row);
  }
  entry.box.hidden = false;
}
document.addEventListener('input', e => {
  const entry = entries.get(e.target);
  if (entry && entry.key !== e.target.value.trim()) { entry.box.hidden = true; entry.key = ''; entry.road = ''; entry.jibun = ''; }
});
document.addEventListener('reset', () => setTimeout(() => document.querySelectorAll('input').forEach(input => {const entry=entries.get(input);if(entry){entry.box.hidden=true;entry.key='';entry.road='';entry.jibun='';}}), 0));
document.addEventListener('close',e=>{if(e.target.matches?.('dialog'))e.target.querySelectorAll('.dual-address').forEach(box=>{box.hidden=true;});},true);
const pending = new WeakMap();
function lookup(input, attempt = 0) {
  if (!input?.matches?.('[data-searched-address]') || !input.value.trim()) return;
  const key = input.value.trim(), entry = entries.get(input);
  if (entry?.key === key && entry.road && entry.jibun) return;
  if (!window.kakao?.maps?.services?.Geocoder) {
    if (attempt < 20) setTimeout(() => {if(input.isConnected && input.value.trim() === key)lookup(input,attempt+1);},500);
    return;
  }
  if(pending.get(input) === key)return;
  pending.set(input,key);
  new kakao.maps.services.Geocoder().addressSearch(key,(results,state)=>{
    if(pending.get(input) === key)pending.delete(input);
    if(!input.isConnected || input.value.trim() !== key || state !== kakao.maps.services.Status.OK || results.length !== 1)return;
    const point=results[0];
    show(input,{roadAddress:point.road_address?.address_name,jibunAddress:point.address?.address_name});
  },{analyze_type:kakao.maps.services.AnalyzeType.EXACT});
}
document.addEventListener('input',e=>lookup(e.target));
document.addEventListener('change',e=>lookup(e.target));
window.TH_DUAL_ADDRESS = {show};
})();
