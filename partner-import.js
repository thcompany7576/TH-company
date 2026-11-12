(()=>{
 'use strict';
 const MAX=200,MAX_BYTES=2*1024*1024,inflateLimit=10*1024*1024;
 const columns=['거래처명','주소','상세위치','연락처'],keys=['title','address','detail','phone'];
 const clean=v=>String(v??'').trim(),norm=v=>clean(v).toLowerCase().replace(/\s/g,'');
 const identity=r=>norm(r.title)+'\n'+norm(r.address);
 function delimited(text){
  text=text.replace(/^\uFEFF/,'');const separator=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';
  const rows=[];let row=[],cell='',quoted=false,ended=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;ended=true;}}else cell+=c;}
   else if(c==='"'&&!cell&&!ended)quoted=true;
   else if(c===separator){row.push(cell);cell='';ended=false;}
   else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>clean(x)))rows.push(row);row=[];cell='';ended=false;}
   else if(ended&&!/\s/.test(c))throw Error('따옴표가 닫힌 뒤의 내용을 확인해 주세요.');
   else if(!ended)cell+=c;
  }
  if(quoted)throw Error('파일의 따옴표가 닫히지 않았습니다.');row.push(cell);if(row.some(x=>clean(x)))rows.push(row);return rows;
 }
 async function unzip(buffer){
  const data=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('엑셀 파일을 읽지 못했습니다. .xlsx로 다시 저장해 주세요.');
  const count=v.getUint16(end+10,true);let offset=v.getUint32(end+16,true);const entries=new Map();
  if(count>2000)throw Error('파일에 시트나 자료가 너무 많습니다. 등록할 시트만 새 파일로 저장해 주세요.');
  for(let i=0;i<count;i++){
   if(offset+46>data.length||v.getUint32(offset,true)!==0x02014b50)throw Error('손상된 엑셀 파일입니다.');
   const flags=v.getUint16(offset+8,true),method=v.getUint16(offset+10,true),size=v.getUint32(offset+20,true),expanded=v.getUint32(offset+24,true),nl=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true),local=v.getUint32(offset+42,true);
   const name=new TextDecoder().decode(data.slice(offset+46,offset+46+nl));entries.set(name,{flags,method,size,expanded,local});offset+=46+nl+extra+comment;
  }
  return async name=>{
   const e=entries.get(name);if(!e)return null;
   if(e.flags&1||![0,8].includes(e.method)||e.expanded>inflateLimit||e.local+30>data.length||v.getUint32(e.local,true)!==0x04034b50)throw Error('암호화되었거나 지원하지 않는 엑셀 파일입니다.');
   const start=e.local+30+v.getUint16(e.local+26,true)+v.getUint16(e.local+28,true);if(start+e.size>data.length)throw Error('손상된 엑셀 파일입니다.');
   let bytes=data.slice(start,start+e.size);
   if(e.method===8){const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks=[];let total=0;try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>inflateLimit)throw Error('엑셀 시트가 너무 큽니다. 필요한 행만 새 파일로 저장해 주세요.');chunks.push(value);}}finally{await reader.cancel();}bytes=new Uint8Array(total);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}}
   return new TextDecoder().decode(bytes);
  };
 }
 const elements=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
 function xml(text){if(!text)throw Error('엑셀의 첫 번째 시트를 찾을 수 없습니다.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('손상된 엑셀 문서입니다.');return doc;}
 async function xlsx(buffer){
  const read=await unzip(buffer),book=xml(await read('xl/workbook.xml')),rels=xml(await read('xl/_rels/workbook.xml.rels'));
  const first=elements(book,'sheet')[0];if(!first)throw Error('엑셀에 시트가 없습니다.');
  const rid=first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');const rel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);
  if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('첫 시트를 새 엑셀 파일로 저장해 주세요.');
  let target=rel.getAttribute('Target');if(!target||target.includes('..')||target.includes('\\'))throw Error('지원하지 않는 시트 경로입니다.');target=target.startsWith('/')?target.slice(1):'xl/'+target;
  const sharedText=await read('xl/sharedStrings.xml'),strings=sharedText?elements(xml(sharedText),'si').map(si=>elements(si,'t').map(t=>t.textContent).join('')):[];
  const sheet=xml(await read(target)),rows=[];
  for(const row of elements(sheet,'row')){
   const out=[];for(const c of elements(row,'c')){const ref=c.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0];if(!letters)throw Error('엑셀 셀 주소를 확인해 주세요.');let index=0;for(const l of letters)index=index*26+l.charCodeAt(0)-64;index--;if(index>100)throw Error('열이 너무 많습니다. 양식의 네 열만 사용해 주세요.');const t=c.getAttribute('t'),val=elements(c,'v')[0]?.textContent||'';out[index]=elements(c,'f').length?'[수식: 값으로 붙여넣어 주세요]':t==='s'?strings[Number(val)]??'':t==='inlineStr'?elements(c,'t').map(n=>n.textContent).join(''):val;}
   if(out.some(x=>clean(x)))rows.push(out);if(rows.length>MAX+1)throw Error('한 번에 200개까지 등록할 수 있습니다. 파일을 나누어 주세요.');
  }return {rows,sheet:first.getAttribute('name')||'첫 번째 시트'};
 }
 function prepare(rows,existing){
  if(rows.length<2)throw Error('제목 행 아래에 거래처를 입력해 주세요.');
  const headers=rows[0].map(clean),aliases=[['거래처명','상호명','거래처 이름'],['주소'],['상세위치','상세주소'],['연락처','전화번호']];
  const indexes=aliases.map(names=>headers.findIndex(h=>names.includes(h)));if(indexes.some(i=>i<0))throw Error('첫 행은 거래처명, 주소, 상세위치, 연락처로 작성해 주세요.');
  if(rows.length-1>MAX)throw Error('한 번에 200개까지 등록할 수 있습니다. 파일을 나누어 주세요.');
  const seen=new Set(existing.map(identity));return rows.slice(1).map((row,i)=>{
   const item=Object.fromEntries(keys.map((k,n)=>[k,clean(row[indexes[n]])]));item.phone=item.phone.replace(/[\s().]/g,'');let error='';
   if(!item.title||item.title.length>100)error='거래처명 확인';else if(!item.address||item.address.length>300)error='주소 확인';else if(item.detail.length>300)error='상세위치 300자 초과';else if(item.phone&&!/^0[0-9-]{8,13}$/.test(item.phone))error='연락처는 0으로 시작해야 합니다';
   if(Object.values(item).some(v=>v.startsWith('[수식:')))error='수식 대신 값으로 붙여넣기';
   const key=identity(item),duplicate=seen.has(key);if(!error)seen.add(key);return {item,line:i+2,error,duplicate,selected:!error&&!duplicate};
  });
 }
 // Expose only local parsers for tests; no data is transmitted before the explicit save action.
 window.TH_PARTNER_IMPORT={delimited,xlsx,prepare};
 const launch=document.getElementById('partnerImportOpen');if(!launch)return;
 const dialog=document.createElement('dialog');dialog.className='admin-dialog';dialog.id='partnerImportDialog';dialog.setAttribute('aria-labelledby','partnerImportTitle');
 dialog.innerHTML='<div class="section-head"><h2 id="partnerImportTitle">거래처 일괄등록</h2><button type="button" id="partnerImportClose" class="secondary">닫기</button></div><p>엑셀(.xlsx) 첫 번째 시트 또는 CSV 파일 · 한 번에 200개, 2MB까지</p><button type="button" id="partnerImportTemplate" class="secondary">엑셀용 양식 받기</button><label>거래처 목록 파일<input type="file" id="partnerImportFile" accept=".xlsx,.csv,.tsv"></label><details><summary>엑셀에서 복사해서 붙여넣기</summary><label>제목 행을 포함한 네 열<textarea id="partnerImportPaste" rows="4" placeholder="거래처명&#9;주소&#9;상세위치&#9;연락처"></textarea></label><button type="button" id="partnerImportRead">목록 확인</button></details><p>거래처명·주소는 필수입니다. 연락처는 앞자리 0이 없어지지 않도록 텍스트로 입력해 주세요. 같은 거래처명·주소는 중복으로 제외하며 기존 자료를 덮어쓰지 않습니다. 주소와 상세위치는 미리보기에서 확인해 주세요. 주소의 실제 존재 여부는 자동 확인하지 않습니다.</p><p id="partnerImportStatus" role="status"></p><div id="partnerImportPreview" style="overflow:auto;max-height:40vh"></div><label class="inline"><input type="checkbox" id="partnerImportConsent"> 선택한 거래처를 모든 등록 의뢰자의 공용 목록에 등록합니다.</label><button type="button" id="partnerImportSave" disabled>선택한 거래처 등록</button>';
 const style=document.createElement('style');style.textContent='#partnerImportDialog{width:min(1000px,94vw)}#partnerImportPreview table{min-width:800px;width:100%;border-collapse:collapse}#partnerImportPreview th,#partnerImportPreview td{padding:10px;text-align:left;border-bottom:1px solid #afa0aa;vertical-align:top;white-space:pre-wrap;word-break:normal}#partnerImportPreview th:nth-child(3){min-width:130px}#partnerImportPreview th:nth-child(4){min-width:180px}#partnerImportPreview th:nth-child(5){min-width:140px}#partnerImportPreview th:nth-child(6){min-width:120px}#partnerImportPreview th:nth-child(7){min-width:100px}';document.head.append(style);
 document.body.append(dialog);const $=id=>document.getElementById('partnerImport'+id);let preview=[],generation=0,busy=false;
 const status=text=>{$('Status').textContent=text;};
 function update(){$('File').disabled=$('Read').disabled=$('Paste').disabled=busy;const n=preview.filter(r=>r.selected).length;$('Save').disabled=busy||!n||!$('Consent').checked;$('Save').textContent=n?'선택한 '+n+'개 등록':'선택한 거래처 등록';}
 function draw(){const root=$('Preview');root.replaceChildren();const table=document.createElement('table');table.className='daily-table';const head=document.createElement('tr');for(const title of ['선택','행',...columns,'확인']){const th=document.createElement('th');th.textContent=title;th.scope='col';head.append(th);}const thead=document.createElement('thead');thead.append(head);table.append(thead);const body=document.createElement('tbody');
  for(const r of preview){const tr=document.createElement('tr'),td=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=r.selected;check.disabled=Boolean(r.error||r.duplicate);check.setAttribute('aria-label',r.line+'행 선택');check.onchange=()=>{r.selected=check.checked;update();};td.append(check);tr.append(td);for(const value of [r.line,...keys.map(k=>r.item[k]),r.error||(r.duplicate?'중복 제외':'등록 가능')]){const cell=document.createElement('td');cell.textContent=String(value);tr.append(cell);}body.append(tr);}table.append(body);root.append(table);update();}
 async function read(input){const stamp=++generation;preview=[];$('Preview').replaceChildren();$('Consent').checked=false;busy=true;update();status('목록을 확인하고 있습니다.');try{const parsed=await input(),existing=await window.TH_API.rpc('th6_shared_partner_list',{});if(stamp!==generation)return;preview=prepare(parsed.rows,existing);draw();status((parsed.sheet?'시트: '+parsed.sheet+' · ':'')+'총 '+preview.length+'개 · 등록 가능 '+preview.filter(r=>r.selected).length+'개 · 중복 '+preview.filter(r=>r.duplicate&&!r.error).length+'개 · 오류 '+preview.filter(r=>r.error).length+'개');}catch(e){if(stamp===generation)status(e.message);}finally{if(stamp===generation){busy=false;update();}}}
 launch.onclick=()=>{dialog.showModal();};$('Close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('Consent').onchange=update;
 $('Template').onclick=()=>{const a=document.createElement('a');a.href='partner-import-template.xlsx';a.download='TH-company-거래처등록양식.xlsx';a.click();};
 $('Read').onclick=()=>{if(busy)return;read(async()=>({rows:delimited($('Paste').value)}));};
 $('File').onchange=()=>{if(busy)return;const file=$('File').files[0];if(!file)return;read(async()=>{if(file.size>MAX_BYTES)throw Error('2MB 이하 파일을 선택해 주세요.');const buffer=await file.arrayBuffer();if(/\.xlsx$/i.test(file.name))return xlsx(buffer);if(!/\.(csv|tsv)$/i.test(file.name))throw Error('.xlsx 또는 CSV 파일을 선택해 주세요.');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('euc-kr').decode(buffer);}return {rows:delimited(text)};});};
 $('Save').onclick=async()=>{if(busy||!$('Consent').checked)return;const rows=preview.filter(r=>r.selected).map(r=>r.item);if(!rows.length)return;busy=true;update();status('등록 중입니다. 잠시 기다려 주세요.');try{const result=await window.TH_API.rpc('th6_shared_partner_import',{p_rows:rows});preview=[];$('Preview').replaceChildren();$('Consent').checked=false;status('등록 완료: '+result.inserted+'개 · 중복 제외: '+result.skipped+'개. 기존 거래처는 유지되었습니다.');document.dispatchEvent(new CustomEvent('th-partners-imported'));}catch(e){status('등록 결과를 확인하지 못했습니다. '+e.message+' 같은 목록으로 다시 시도해도 중복은 제외됩니다.');}finally{busy=false;update();}};
})();
