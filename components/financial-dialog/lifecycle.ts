/** Native modal dialogs put the rest of the document in the inert top layer. */
export function mountFinancialDialog(dialog: HTMLDialogElement) {
  const opener = dialog.ownerDocument.activeElement;
  dialog.showModal();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (dialog.open) dialog.close();
    if (opener?.isConnected && 'focus' in opener && typeof opener.focus === 'function') {
      opener.focus({preventScroll: true});
    }
  };
}

export function cancelFinancialDialog(event: {preventDefault: () => void}, busy: boolean, close: () => void) {
  event.preventDefault();
  if (!busy) close();
}
