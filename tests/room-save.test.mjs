import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bytes=await readFile(new URL('../src/room-save.js',import.meta.url));
const {bindRoomSaveForm}=await import('data:text/javascript;base64,'+bytes.toString('base64'));

function fakeForm(){
  const button={textContent:'Save room',disabled:false,handlers:{},
    addEventListener(name,fn){this.handlers[name]=fn}};
  const error={textContent:''};
  const form={handlers:{},reportValidity(){return true},
    addEventListener(name,fn){this.handlers[name]=fn},
    querySelector(sel){return sel==='[data-room-save]'?button:error}};
  return {form,button,error};
}
const event=()=>({defaultPrevented:false,propagationStopped:false,
  preventDefault(){this.defaultPrevented=true},
  stopPropagation(){this.propagationStopped=true}});
test('Save button blocks navigation and double-save',async()=>{
  const original=globalThis.FormData;
  globalThis.FormData=class {get(){return 'Sanctuary'}};
  try {
    const {form,button}=fakeForm();
    let saves=0,complete;
    bindRoomSaveForm(form,{performSave:()=>{saves++;return new Promise(resolve=>complete=resolve)},
      onSuccess:async()=>{},onFailure:()=>{}});
    const click=event();
    button.handlers.click(click);
    button.handlers.click(event());
    assert.equal(saves,1);
    assert.equal(button.disabled,true);
    assert.equal(click.defaultPrevented,true);
    complete({id:'room-1'});
    await new Promise(setImmediate);
    assert.equal(button.disabled,false);
  }finally{globalThis.FormData=original}
});
test('Firestore rejection stays visible in room editor',async()=>{
  const original=globalThis.FormData;
  globalThis.FormData=class {};
  try {
    const {form,error}=fakeForm();
    let failure=false,success=false;
    const handle=bindRoomSaveForm(form,{
      performSave:async()=>{throw Object.assign(new Error('Permission denied'),{code:'permission-denied'})},
      onSuccess:async()=>{success=true},onFailure:()=>{failure=true}
    });
    const ev=event();
    await handle.save(ev);
    assert.equal(ev.defaultPrevented,true);
    assert.equal(success,false);
    assert.equal(failure,true);
    assert.match(error.textContent,/Firestore blocked/);
  }finally{globalThis.FormData=original}
});
