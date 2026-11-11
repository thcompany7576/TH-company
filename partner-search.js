/* Local partner-name search. The existing scoped select remains the selection source. */
(()=>{
 'use strict';
 const selector='select[data-partner-select],select[data-extra-partner]';
 const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'');
 const style=document.createElement('style');style.textContent='.partner-search{position:relative;min-width:0;width:100%}.partner-search input{width:100%;margin:0}.partner-results{position:absolute;z-index:20;top:100%;left:0;right:0;max-height:270px;overflow:auto;background:var(--th-surface-soft,#fff);border:1px solid var(--th-line,#aaa);border-radius:10px;box-shadow:0 5px 15px #0002}.partner-results button{display:block;width:100%;text-align:left;border:0;border-radius:0;background:transparent;color:var(--th-ink,#222);padding:10px 12px;margin:0;min-height:44px}.partner-results button[aria-selected=true],.partner-results button:hover{background:var(--th-yellow,#f3d442)}.partner-results small{display:block;font-size:12px;font-weight:normal}.partner-results p{padding:10px 12px;margin:0;font-size:13px}';document.head.append(style);
 let serial=0;
 function attach(select){
  if(select.dataset.searchBound)return;select.dataset.searchBound='1';
  const oldLabel=select.closest('label'),wrap=document.createElement('div');wrap.className='partner-search';
  const input=document.createElement('input');input.type='search';input.autocomplete='off';input.placeholder='거래처 이름 검색';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-label',(select.getAttribute('aria-label')||'거래처 선택').replace('선택','검색'));
  const list=document.createElement('div');list.className='partner-results';list.id='partner-search-'+(++serial);list.setAttribute('role','listbox');list.hidden=true;input.setAttribute('aria-controls',list.id);wrap.append(input,list);(oldLabel||select).after(wrap);select.hidden=true;if(oldLabel)oldLabel.hidden=true;
  let choices=[],active=-1;
  const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
  const update=()=>{if(oldLabel)oldLabel.hidden=true;wrap.hidden=select.options.length<2;input.disabled=select.disabled;const option=[...select.options].find(o=>o.value===select.value);input.value=option?.value?option.textContent:'';close();};
  const pick=option=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));input.value=option.textContent;close();input.focus();};
  function render(){
   list.replaceChildren();active=-1;input.removeAttribute('aria-activedescendant');const query=normalize(input.value);if(!query){close();return;}
   const matches=[...select.options].filter(o=>o.value&&!o.disabled&&normalize(o.textContent).includes(query));choices=matches.slice(0,8);
   for(const [index,option] of choices.entries()){const button=document.createElement('button');button.type='button';button.id=list.id+'-'+index;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.textContent=option.textContent;if(option.dataset.address){const small=document.createElement('small');small.textContent=option.dataset.address;button.append(small);}button.onmousedown=e=>e.preventDefault();button.onclick=()=>pick(option);list.append(button);}
   if(!matches.length||matches.length>8){const note=document.createElement('p');note.textContent=matches.length?'검색어를 더 입력하면 범위를 줄일 수 있습니다.':'일치하는 거래처가 없습니다.';list.append(note);}
   list.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',()=>{select.value='';render();});input.addEventListener('focus',()=>{if(input.value)render();});input.addEventListener('blur',()=>setTimeout(close,150));
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){close();return;}if(event.key==='Enter'){event.preventDefault();if(!list.hidden&&active>=0)pick(choices[active]);return;}if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;event.preventDefault();if(list.hidden)render();if(!choices.length||list.hidden)return;active=active<0?(event.key==='ArrowDown'?0:choices.length-1):(active+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;[...list.querySelectorAll('[role=option]')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',list.id+'-'+active);});
  select.addEventListener('change',update);new MutationObserver(update).observe(select,{childList:true,subtree:true});update();
 }
 document.getElementById('order').addEventListener('change',event=>{if(event.target.matches('[data-same-profile],[data-extra-same-profile]')&&event.target.checked){const scope=event.target.closest('fieldset.stop')||event.target.closest('section');scope?.querySelectorAll('.partner-search input').forEach(input=>{input.value='';input.dispatchEvent(new Event('blur'));});}});
 const scan=()=>document.querySelectorAll(selector).forEach(attach);scan();new MutationObserver(scan).observe(document.getElementById('order'),{childList:true,subtree:true});
})();
