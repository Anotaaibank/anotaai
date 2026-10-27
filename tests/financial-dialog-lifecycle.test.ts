import test from 'node:test';
import assert from 'node:assert/strict';
import {mountFinancialDialog, cancelFinancialDialog} from '../components/financial-dialog/lifecycle.ts';

test('financial modal opens through showModal and restores the connected opener once on disposal', () => {
  let shown = 0, closed = 0, focused = 0;
  const opener = {isConnected: true, focus: (options: unknown) => {assert.deepEqual(options, {preventScroll: true}); focused++;}};
  const dialog = {open: false, ownerDocument: {activeElement: opener},
    showModal() {shown++; this.open = true;}, close() {closed++; this.open = false;}};
  const dispose = mountFinancialDialog(dialog as unknown as HTMLDialogElement);
  assert.equal(shown, 1); assert.equal(dialog.open, true);
  dispose(); dispose();
  assert.equal(closed, 1); assert.equal(focused, 1);
});

test('unmount does not try to restore a removed trigger', () => {
  let focused = false;
  const dialog = {open: false, ownerDocument: {activeElement: {isConnected: false, focus: () => {focused = true;}}},
    showModal() {this.open = true;}, close() {this.open = false;}};
  mountFinancialDialog(dialog as unknown as HTMLDialogElement)();
  assert.equal(focused, false);
});

test('Escape is prevented during a write and closes only after the modal is idle', () => {
  let prevented = 0, closed = 0;
  const event = {preventDefault: () => {prevented++;}};
  cancelFinancialDialog(event, true, () => {closed++;});
  assert.equal(prevented, 1); assert.equal(closed, 0);
  cancelFinancialDialog(event, false, () => {closed++;});
  assert.equal(prevented, 2); assert.equal(closed, 1);
});
