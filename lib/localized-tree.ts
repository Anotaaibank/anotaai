import {cloneElement,Fragment,isValidElement,type ReactNode,type ReactElement} from 'react';
import {translatedText,type AppLocale} from './locale.ts';

const attributes=['title','placeholder','aria-label','aria-description','aria-valuetext','alt','data-label'] as const;
/** Translate only presentation. Never touch form values, URLs, IDs, callbacks,
 * validation constraints, payloads, or opaque component props. React retains
 * ownership of the DOM, so switching languages cannot detach its text nodes. */
export function localizedTree(node:ReactNode,locale:AppLocale):ReactNode {
 if(locale==='pt-BR')return node;
 if(typeof node==='string')return translatedText(node,locale);
 if(Array.isArray(node))return node.map(child=>localizedTree(child,locale));
 if(!isValidElement(node))return node;
 const element=node as ReactElement<Record<string,unknown>>;
 if(element.props.translate==='no'||element.props['data-no-translate']!==undefined)return node;
 if(typeof element.props.className==='string'&&element.props.className.split(' ').includes('commerce-preserve'))return node;
 if(typeof element.type!=='string'&&element.type!==Fragment)return node;
 if(['script','style'].includes(String(element.type)))return node;
 const props:Record<string,unknown>={};
 for(const key of attributes)if(typeof element.props[key]==='string')props[key]=translatedText(element.props[key] as string,locale);
 // An option without an explicit value submits its displayed label. Preserve
 // that original value before translating, including server-rendered selects.
 if(element.type==='option'&&element.props.value===undefined&&typeof element.props.children==='string')props.value=element.props.children;
 if(element.type==='textarea'&&typeof element.props.placeholder==='string')props.placeholder=translatedText(element.props.placeholder,locale);
 if(element.props.children!==undefined&&element.type!=='textarea'){
  const children=localizedTree(element.props.children as ReactNode,locale);
  // Pass static siblings as separate children, retaining their original keys.
  // Supplying a fresh array through props would reclassify them as an unkeyed
  // dynamic list in React's development checks.
  return Array.isArray(children)?cloneElement(element,props,...children):cloneElement(element,props,children);
 }
 return cloneElement(element,props);
}
