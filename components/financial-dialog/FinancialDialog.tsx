'use client';
import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {Localize} from '@/components/Localization';
import {cancelFinancialDialog, mountFinancialDialog} from './lifecycle';
import './financial-dialog.css';

export default function FinancialDialog({children, labelledBy, onClose, busy = false, panelClassName = ''}: {
  children: ReactNode; labelledBy: string; onClose: () => void; busy?: boolean; panelClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return mountFinancialDialog(ref.current);
  }, []);
  return <Localize><dialog ref={ref} className="anota-modal-backdrop financial-dialog"
    aria-labelledby={labelledBy} aria-modal="true" aria-busy={busy}
    onCancel={event => cancelFinancialDialog(event, busy, onClose)}>
    <section className={'bank-panel anota-modal ' + panelClassName}>{children}</section>
  </dialog></Localize>;
}
