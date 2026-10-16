'use client';

import {useLayoutEffect, useRef, useState, type CSSProperties} from 'react';
import {ArrowDown, ArrowUpRight, Bell, CalendarDays, Check, MessageCircle, Mic, Sparkles, Wallet} from 'lucide-react';
import {BrandOrb} from './Brand';
import {storyFrame, storyProgress, shouldSimplifyStory} from '@/lib/landing-motion';

const scenes = [
 {label: 'Você fala', title: 'Uma mensagem. E pronto.', text: 'Um gasto no mercado, uma conta para lembrar. É só falar ou escrever.'},
 {label: 'A IA entende', title: 'Cada coisa no seu lugar.', text: 'O Anotei separa o gasto de hoje da conta que ainda vai vencer.'},
 {label: 'Você confirma', title: 'O controle é sempre seu.', text: 'Confira o resumo. Confirmar salva; editar permite corrigir antes.'},
 {label: 'Tá organizado', title: 'Da conversa para o painel.', text: 'Gasto no saldo, conta no calendário e lembrete para não esquecer.'},
] as const;
const scenePositions = [.06, .33, .53, 1];
const initialStyle = {'--s3-progress': 0, '--s3-message': .35, '--s3-summary': 0, '--s3-confirmed': 0, '--s3-card': 0, '--s3-dashboard': 0, '--s3-dock': 0} as CSSProperties;

export default function SalesScrollStory() {
 const track = useRef<HTMLDivElement>(null), pin = useRef<HTMLDivElement>(null);
 const draw = useRef<(progress: number) => void>(() => {});
 const [mode, setMode] = useState<'scroll' | 'simple'>('scroll');
 const [stage, setStage] = useState(0);

 useLayoutEffect(() => {
  const root = track.current, panel = pin.current;
  if (!root || !panel) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shortScreen = window.matchMedia('(max-height: 679px)');
  const connection = (navigator as Navigator & {connection?: EventTarget & {saveData?: boolean}}).connection;
  let start = 0, distance = 1, frame = 0, simple = false, previousStage = -1, previousProgress = -1;
  const render = (progress: number) => {
   const values = storyFrame(progress);
   if (values.progress === previousProgress) return;
   previousProgress = values.progress;
   for (const key of ['progress', 'message', 'summary', 'confirmed', 'card', 'dashboard', 'dock'] as const) root.style.setProperty('--s3-' + key, String(values[key]));
   if (previousStage !== values.stage) {previousStage = values.stage; setStage(values.stage);}
  };
  draw.current = render;
  const update = () => {frame = 0; if (!simple && document.visibilityState === 'visible') render(storyProgress(window.scrollY, start, distance));};
  const schedule = () => {if (!simple && !frame) frame = requestAnimationFrame(update);};
  const measure = () => {
   // Geometry is cached on resize, never read during a scroll frame.
   const bounds = root.getBoundingClientRect();
   start = bounds.top + window.scrollY - parseFloat(getComputedStyle(panel).top || '0');
   distance = bounds.height - panel.offsetHeight;
   if (!Number.isFinite(start)) start = bounds.top + window.scrollY;
   schedule();
  };
  const configure = () => {
   simple = shouldSimplifyStory({reducedMotion: reduced.matches, saveData: Boolean(connection?.saveData), sticky: CSS.supports('position', 'sticky'), height: window.innerHeight, cores: navigator.hardwareConcurrency});
   root.dataset.mode = simple ? 'simple' : 'scroll';
   setMode(simple ? 'simple' : 'scroll');
   if (simple) {cancelAnimationFrame(frame); frame = 0; render(1);} else {measure(); cancelAnimationFrame(frame); update();}
  };
  configure();
  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
  resize?.observe(root); resize?.observe(panel);
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', measure, {passive: true});
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', configure); shortScreen.addEventListener('change', configure); connection?.addEventListener('change', configure);
  return () => {
   cancelAnimationFrame(frame); resize?.disconnect(); draw.current = () => {};
   window.removeEventListener('scroll', schedule); window.removeEventListener('resize', measure);
   document.removeEventListener('visibilitychange', schedule);
   reduced.removeEventListener('change', configure); shortScreen.removeEventListener('change', configure); connection?.removeEventListener('change', configure);
  };
 }, []);

 return <div className="s3-story" ref={track} data-mode={mode} style={initialStyle}>
  <div className="s3-pin" ref={pin}>
   <div className="s3-scene-heading"><span><Sparkles size={13}/>DE UMA CONVERSA À VIDA ORGANIZADA</span><a href="#planos">Ver planos <ArrowUpRight size={13}/></a></div>
   <div className="s3-art" aria-hidden="true">
    <div className="s3-light"/><div className="s3-orbit"/>
    <div className="s3-phone">
     <div className="s3-status"><span>9:41</span><i/><span>● ▰</span></div>
     <div className="s3-contact"><BrandOrb/><span><strong>Anotei na Hora</strong><small>Seu assistente pessoal</small></span><MessageCircle size={16}/></div>
     <div className="s3-chat"><small className="s3-date">CONVERSA DE EXEMPLO</small>
      <div className="s3-message"><span><Mic size={14}/>▂ ▄ ▆ ▃ ▇ ▅ ▂ ▆ ▄<small>0:08</small></span><p>Gastei R$ 85 no supermercado. E me lembra da internet: R$ 120, dia 15.</p></div>
      <div className="s3-summary"><strong><Sparkles size={12}/>Vamos conferir?</strong><p>Supermercado · R$ 85<br/><small>Hoje · Gasto pago</small></p><p>Internet · R$ 120<br/><small>Dia 15 · Conta a pagar</small></p><div><b>1 · Confirmar</b><span>2 · Editar</span></div></div>
      <div className="s3-confirmed">1 · Confirmar <Check size={13}/></div>
      <div className="s3-saved"><Check size={13}/>Prontinho! Tudo organizado.</div>
     </div>
     <div className="s3-phone-footer"><span>Mensagem</span><Mic size={14}/></div>
    </div>
    <div className="s3-dashboard">
     <div className="s3-board-top"><BrandOrb/><strong>Minha visão geral</strong><span>EXEMPLO</span></div>
     <small>Saldo na conta</small><strong className="s3-balance">R$ 915<span>,00</span></strong><span className="s3-start-balance">Saldo inicial: R$ 1.000 · gasto: R$ 85</span>
     <div className="s3-board-row"><Wallet size={15}/><span>Supermercado<small>Hoje · Pago</small></span><b>− R$ 85</b></div>
     <div className="s3-board-calendar"><CalendarDays size={16}/><strong>Agenda de compromissos</strong><div>{[13,14,15,16,17].map(day=><span key={day} className={day===15?'due':''}>{day}<i/></span>)}</div></div>
     <div className="s3-board-bill"><span>Internet<small>Dia 15 · A pagar</small></span><b>R$ 120</b></div>
     <div className="s3-reminder"><Bell size={15}/><span>Lembrete de vencimento<small>Internet · R$ 120 · Dia 15</small></span><Check size={13}/></div>
    </div>
    <div className="s3-transfer"><span><Check size={15}/></span><div><small>CONFIRMADO → ORGANIZADO</small><strong>Supermercado</strong></div><b>− R$ 85</b></div>
   </div>
   <div className="s3-caption" id="s3-story-caption"><span>{String(stage+1).padStart(2,'0')} / 04</span><h2>{scenes[stage].title}</h2><p>{scenes[stage].text}</p></div>
   <div className="s3-steps" role="group" aria-label="Etapas da demonstração ilustrativa">{scenes.map((scene,index)=><button key={scene.label} type="button" aria-pressed={stage===index} aria-controls="s3-story-caption" onClick={()=>draw.current(scenePositions[index])}><i>{index+1}</i>{scene.label}</button>)}</div>
   <div className="s3-footnote"><span>{mode==='scroll'?<><ArrowDown size={12}/>Role para transformar · ou toque nas etapas</>:'Toque nas etapas para conhecer'}</span><small>Simulação ilustrativa. Nenhum dado real.</small></div>
   <p className="s2-sr-only">Exemplo de funcionamento: uma mensagem informa um gasto de 85 reais no supermercado e uma conta de internet de 120 reais para o dia 15. A IA organiza o resumo. Depois da confirmação, o gasto reduz um saldo ilustrativo de mil para 915 reais. A conta futura entra no calendário com lembrete e só reduz o saldo quando paga. Use os quatro botões para explorar cada etapa.</p>
  </div>
  <noscript><style>{'.anotei-sales .s3-story{height:auto!important}.anotei-sales .s3-pin{position:relative!important}.anotei-sales .s3-story{--s3-message:1!important;--s3-summary:1!important;--s3-confirmed:1!important;--s3-card:1!important;--s3-dashboard:1!important;--s3-dock:1!important;--s3-progress:1!important}.anotei-sales .s3-steps,.anotei-sales .s3-footnote>span{display:none}'}</style></noscript>
 </div>;
}
