'use client';
import {Localize} from '@/components/Localization';


import {useEffect, useState} from 'react';
import {Eye, EyeOff} from 'lucide-react';
import {minimumPasswordLength} from '@/lib/registration-password';

export default function PasswordInput({register, disabled, name='password', label='Senha'}: {register: boolean; disabled: boolean; name?:string; label?:string}) {
  const [visible, setVisible] = useState(false);
  const id='anotei-'+name;
  useEffect(() => setVisible(false), [register]);

  return <Localize><div className="login-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="login-password-control">
      <input id={id} name={name} type={visible ? 'text' : 'password'} required
        minLength={register ? minimumPasswordLength : 1} maxLength={128}
        autoComplete={register ? 'new-password' : 'current-password'} disabled={disabled}/>
      <button type="button" className="login-password-toggle" disabled={disabled}
        aria-label={(visible ? 'Ocultar ' : 'Mostrar ')+label.toLowerCase()} aria-pressed={visible}
        aria-controls={id} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}
      </button>
    </div>
  </div></Localize>;
}
