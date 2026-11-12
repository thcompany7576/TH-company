(()=>{
'use strict';const api=window.TH_API,request=api.api,rpc=api.rpc;
api.api=async(path,options={})=>{
 if(!path.startsWith('/rest/v1/th6_partners'))return request(path,options);
 const method=(options.method||'GET').toUpperCase();
 if(method==='GET')return rpc('th6_shared_partner_list',{});
 const id=new URLSearchParams(path.split('?')[1]||'').get('id')?.replace(/^eq\./,'')||null;
 if(method==='DELETE')return rpc('th6_shared_partner_disable',{p_id:id});
 if(!['POST','PATCH'].includes(method))throw Error('지원하지 않는 거래처 작업입니다.');
 return rpc('th6_shared_partner_save',{p_id:id,p_values:JSON.parse(options.body||'{}')});
};
document.addEventListener('DOMContentLoaded',()=>{for(const id of ['adminPartnerPerson','adminPartner_person']){const el=document.getElementById(id);if(el)el.closest('label').hidden=true;}});
api.rpc=(name,args)=>rpc(name==='th6_contract_list'?'th6_shared_contract_list':name==='th6_contract_disable'?'th6_shared_route_disable':name,args);
})();
