import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const js=await readFile(new URL('../src/item-save.js',import.meta.url));
const {bindItemSaveForm}=await import('data:text/javascript;base64,'+js.toString('base64'));
function fakeForm(){
  const button={textContent:'Save item',disabled:false,events:{},
    addEventListener(type,fn){this.events[type]=fn}};
  const error={textContent:''};
  const form={events:{},reportValidity(){return true},
    addEventListener(type,fn){this.events[type]=fn},
    querySelector(key){return key==='[data-item-save]'?button:error}};
  return {form,button,error};
}
const event=()=>({prevented:false,preventDefault(){this.prevented=true},stopPropagation(){}});
test('item saves exactly once on double click',async()=>{
  const old=globalThis.FormData;globalThis.FormData=class{};
  try{
    const {form,button}=fakeForm();let calls=0,complete;
    bindItemSaveForm(form,{
      performSave:()=>{calls++;return new Promise(resolve=>complete=resolve)},
      onSuccess:async()=>{},onFailure:()=>{}
    });
    const click=event();button.events.click(click);button.events.click(event());
    assert.equal(click.prevented,true);
    assert.equal(calls,1);
    assert.equal(button.disabled,true);
    complete({id:'new-item'});
    await new Promise(setImmediate);
    assert.equal(button.disabled,false);
  }finally{globalThis.FormData=old;}
});
test('item Firestore denial is visible and dialog remains open',async()=>{
  const old=globalThis.FormData;globalThis.FormData=class{};
  try{
    const {form,error,button}=fakeForm();
    let closed=false,failed=false;
    const controller=bindItemSaveForm(form,{
      performSave:async()=>{throw Object.assign(new Error('Denied'),{code:'permission-denied'})},
      onSuccess:async()=>{closed=true},
      onFailure:()=>{failed=true}
    });
    const submit=event();await controller.save(submit);
    assert.equal(submit.prevented,true);
    assert.equal(closed,false);
    assert.equal(failed,true);
    assert.match(error.textContent,/Firestore refused to save/);
    assert.equal(button.disabled,false);
  }finally{globalThis.FormData=old;}
});
