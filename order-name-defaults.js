(()=>{
'use strict';
const form=document.getElementById('order');if(!form)return;
function fill(){
 for(const el of form.querySelectorAll('[name=sender],[name=receiver],[data-extra-person]'))if(!el.disabled&&!el.value.trim())el.value='고객';
 const guest=document.getElementById('directGuest'),name=document.getElementById('directName');if(guest&&!guest.hidden&&name&&!name.disabled&&!name.value.trim())name.value='고객';
}
document.addEventListener('submit',event=>{if(event.target===form)fill();},true);
})();
