(() => {
  'use strict';
  const api=window.TH_API,$=id=>document.getElementById(id);
  let staff=null,epoch=0,work=null,gesture=null,requested=false;
  const capable=()=> 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const auto=()=>staff?.role==='sales';
  const current=stamp=>Boolean(staff&&stamp===epoch);
  const info=message=>$('pushStatus').textContent=message;
  async function server(path,body){return api.api('/functions/v1/staff-push'+path,body?{method:'POST',body:JSON.stringify(body)}:{});}
  async function registration(){await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});return navigator.serviceWorker.ready;}
  function bytes(key){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
  function disarm(){if(!gesture)return;document.removeEventListener('pointerdown',gesture,true);document.removeEventListener('keydown',gesture,true);gesture=null;}
  function supported(){
    if(ios()&&!installed()){info('아이폰: Safari에서 관리페이지를 홈 화면에 추가한 뒤 앱을 열어 알림을 허용해 주세요.');return false;}
    if(!capable()){info('이 브라우저는 푸시 알림을 지원하지 않습니다. 최신 Safari 또는 Chrome을 이용해 주세요.');return false;}
    if(Notification.permission==='denied'){info('알림이 차단되어 있습니다. 브라우저의 이 사이트 알림과 기기의 앱 알림을 허용한 뒤 다시 열어 주세요.');return false;}
    return true;
  }
  function arm(){
    if(!auto()||requested||gesture||!supported()||Notification.permission!=='default')return;
    info('이 화면을 한 번 누르면 알림 허용을 요청합니다. 허용하면 이 기기에 자동 연결됩니다.');
    gesture=event=>{if(!event.isTrusted||event.type==='keydown'&&['Shift','Control','Alt','Meta','Escape'].includes(event.key))return;disarm();void connect(true);};
    document.addEventListener('pointerdown',gesture,true);document.addEventListener('keydown',gesture,true);
  }
  async function perform(stamp,ask){
    try{
      if(Notification.permission!=='granted'){
        if(!ask){if(auto())arm();else info('알림을 허용하면 관리화면을 닫아도 주문과 문의를 받을 수 있습니다.');return;}
        requested=true;
        // Request directly from a trusted gesture, before any network await.
        const permission=await Notification.requestPermission();
        if(!current(stamp))return;
        if(permission!=='granted'){info(permission==='denied'?'알림이 차단되어 있습니다. 사이트·기기 설정에서 알림을 허용해 주세요.':'알림 권한이 아직 허용되지 않았습니다. 다음 로그인에서 허용하거나 사이트 설정에서 알림을 허용해 주세요.');return;}
      }
      const reg=await registration();if(!current(stamp))return;
      let sub=await reg.pushManager.getSubscription();if(!current(stamp))return;
      if(!sub){
        const {publicKey}=await server('/config');if(!current(stamp))return;
        sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});if(!current(stamp))return;
      }
      await server('/subscribe',{subscription:sub.toJSON()});if(!current(stamp))return;
      info('이 기기의 푸시 알림이 자동 연결되었습니다. 잠금 화면 표시는 기기 알림 설정을 따릅니다.');
    }catch(e){if(current(stamp))info('알림 자동 연결을 완료하지 못했습니다. 연결 상태를 확인해 주세요. '+e.message);}
  }
  function connect(ask=false){
    if(!staff||!supported())return Promise.resolve();
    if(work?.stamp===epoch)return work.promise;
    const stamp=epoch;disarm();$('pushEnable').disabled=true;
    const promise=perform(stamp,ask).finally(()=>{if(work?.stamp===stamp)work=null;if(current(stamp))$('pushEnable').disabled=false;});
    work={stamp,promise};return promise;
  }
  $('pushEnable').onclick=()=>connect(true);
  function resume(){if(auto()&&document.visibilityState!=='hidden'){if(capable()&&Notification.permission==='granted')void connect();else arm();}}
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  window.TH_PUSH={
    async init(account){
      disarm();epoch++;staff=account;requested=false;$('pushPanel').hidden=false;$('pushEnable').hidden=auto();$('pushEnable').disabled=false;
      if(!supported())return;
      if(auto()){
        if(Notification.permission==='granted')void connect();
        else if(navigator.userActivation?.isActive)void connect(true);
        else arm();
      }else if(Notification.permission==='granted')await connect();
      else info('알림을 허용하면 관리화면을 닫아도 주문과 문의를 받을 수 있습니다.');
    },
    async disconnect(){
      disarm();epoch++;staff=null;const pending=work?.promise;if(pending)await pending;
      if(capable()){const reg=await registration(),sub=await reg.pushManager.getSubscription();if(sub)await server('/unsubscribe',{endpoint:sub.endpoint});}
      $('pushPanel').hidden=true;
    },
    reset(){disarm();epoch++;staff=null;$('pushPanel').hidden=true;}
  };
})();
