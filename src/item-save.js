/**
 * Form-specific item save handling. Uses type="button" and an explicit
 * click listener so submitting cannot navigate the GitHub Pages URL.
 * One save at a time; errors remain visible in the open editor.
 */
export function bindItemSaveForm(form, {performSave,onSuccess,onFailure}) {
  if(!form)throw new Error('Item editor did not initialize.');
  const button=form.querySelector('[data-item-save]');
  const errorBox=form.querySelector('#itemFormError');
  if(!button || !errorBox)throw new Error('Item Save button or status field is missing.');
  let saving=false;
  async function save(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if(saving)return;
    if(typeof form.reportValidity==='function' && !form.reportValidity())return;
    saving=true;button.disabled=true;
    const previousText=button.textContent;
    button.textContent='Saving item…';errorBox.textContent='';
    const slow=setTimeout(()=>{
      if(saving && !errorBox.textContent)errorBox.textContent='Still saving. Check your connection; do not click Save again.';
    },12000);
    try{
      const result=await performSave(new FormData(form));
      await onSuccess(result);
    }catch(error){
      console.error('North Heights item save failed:',error);
      errorBox.textContent=error?.code==='permission-denied'||error?.code==='firestore/permission-denied'
        ? 'Firestore refused to save this item. Check that updated Firestore rules are deployed and your account has an Owner or Inventory role. The room must be active. ('+error.code+')'
        : (error?.message || 'Unable to save this item.');
      onFailure?.(error);
    }finally{
      clearTimeout(slow);
      saving=false;button.disabled=false;button.textContent=previousText;
    }
  }
  form.addEventListener('submit',save);
  button.addEventListener('click',save);
  return {save};
}
