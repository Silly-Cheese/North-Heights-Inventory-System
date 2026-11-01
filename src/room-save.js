/**
 * Binds a room editor independently of global delegated form handlers.
 * A Save click is a plain button action, never a browser form navigation.
 * Enter-key submits are cancelled at the form itself.
 */
export function bindRoomSaveForm(form, {performSave, onSuccess, onFailure}) {
  if (!form) throw new Error('Room editor did not initialize.');
  const button = form.querySelector('[data-room-save]');
  const errorBox = form.querySelector('#roomFormError');
  if (!button) throw new Error('Room Save button is missing.');
  let saving = false;

  async function save(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (saving) return;
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;

    saving = true;
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Saving room…';
    if (errorBox) errorBox.textContent = '';
    const slowWarning = setTimeout(() => {
      if (saving && errorBox && !errorBox.textContent) {
        errorBox.textContent = 'Still saving. Check your internet connection; do not submit this room again.';
      }
    }, 12000);

    try {
      const outcome = await performSave(new FormData(form));
      await onSuccess(outcome);
    } catch (error) {
      console.error('North Heights room save failed:', error);
      if (errorBox) errorBox.textContent = error?.code === 'permission-denied'
        ? 'Firestore blocked the save (permission-denied). Verify that your current security rules are deployed and your account has an Owner or Inventory role.'
        : (error?.message || 'Could not save this room.');
      if (onFailure) onFailure(error);
    } finally {
      clearTimeout(slowWarning);
      saving = false;
      button.disabled = false;
      button.textContent = label;
    }
  }

  form.addEventListener('submit',save);
  button.addEventListener('click',save);
  return {save};
}
