"""Build the public illustrated guide from the same content used by /manual."""
import json, shutil, math
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'lib/user-manual.json').read_text(encoding='utf-8'))
OUT=ROOT/'output/pdf/Manual-ilustrado-Anotei-na-Hora.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,file in [('Guide','arial.ttf'),('GuideBold','arialbd.ttf')]:pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
W,H=A4; M=43; CW=W-2*M
INK=HexColor('#123F36'); FOREST=HexColor('#084B42'); MINT=HexColor('#EAF4E8'); GOLD=HexColor('#C9AD6C'); MUTED=HexColor('#48685B'); LINE=HexColor('#C7DBCA'); PAPER=HexColor('#FBFCF6')
C=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
C.setTitle(DATA['title']);C.setAuthor('Anotei na Hora');C.setSubject('Manual ilustrado para usuários: dinheiro, contas, agenda e WhatsApp')
TOTAL=len(DATA['sections'])+2
def txt(text,x,y,size=12,color=INK,bold=False):
 C.setFillColor(color);C.setFont('GuideBold' if bold else 'Guide',size);C.drawString(x,y,text)
def para(text,x,y,width=CW,size=13.2,leading=18.5,color=INK,bold=False):
 style=ParagraphStyle('p',fontName='GuideBold' if bold else 'Guide',fontSize=size,leading=leading,textColor=color,spaceAfter=0)
 p=Paragraph(escape(text).replace('\n','<br/>'),style);_,height=p.wrap(width,1000);p.drawOn(C,x,y-height);return y-height
def box(x,y,w,h,fill=MINT,stroke=None,r=12):
 C.setFillColor(fill);C.setStrokeColor(stroke or fill);C.roundRect(x,y,w,h,r,fill=1,stroke=bool(stroke))
def header(page,label='COMO USAR'):
 C.setFillColor(PAPER);C.rect(0,0,W,H,fill=1,stroke=0)
 C.setFillColor(FOREST);C.rect(0,H-58,W,58,fill=1,stroke=0)
 txt('Anotei na Hora',M,H-35,18,white,True);txt(label,W-M-95,H-34,9,GOLD,True)
 C.setStrokeColor(LINE);C.line(M,51,W-M,51)
 txt('Falou. Anotou. Organizou.',M,32,9,MUTED)
 label=f'{page:02d} / {TOTAL:02d}';C.setFont('Guide',9);C.setFillColor(MUTED);C.drawRightString(W-M,32,label)
 C.linkURL('https://icom-anotei.pqaykh.easypanel.host/manual',(M,24,M+240,45),relative=0,thickness=0)
def coin(x,y,r=21):
 C.setFillColor(GOLD);C.circle(x,y,r,fill=1,stroke=0);txt('R$',x-r*.65,y-5,15,FOREST,True)
def calendar(x,y,w=160,h=68):
 box(x,y,w,h,white,LINE,9);box(x,y+h-20,w,20,FOREST,r=5);txt('Vencimento / compromisso',x+10,y+h-14,8,white,True)
 for i,d in enumerate([19,20,21,22,23,24,25]):
  xx=x+12+i*20
  if d==22:box(xx-4,y+13,20,24,GOLD,r=5)
  txt(str(d),xx,y+21,9,FOREST,d==22)
def arrow(x,y):
 C.setStrokeColor(MUTED);C.setLineWidth(1.8);C.line(x,y,x+19,y);C.line(x+19,y,x+13,y+5);C.line(x+19,y,x+13,y-5)
def visual(kind,y):
 h=91;bottom=y-h;box(M,bottom,CW,h,MINT,LINE,13)
 txt('ILUSTRAÇÃO PARA APRENDER',M+16,bottom+9,7.5,MUTED,True)
 if kind in ['overview','income']:
  values=[('Saldo','R$ 1.200'),('Contas','R$ 500'),('Disponível','R$ 700')] if kind=='overview' else [('Recebido','R$ 80'),('Custo','R$ 25'),('Resultado','R$ 55')]
  width=123
  for i,(label,value) in enumerate(values):
   x=M+20+i*164;box(x,bottom+28,width,47,white,r=8);txt(label,x+10,bottom+61,9,MUTED);txt(value,x+10,bottom+40,15,INK,True)
   if i<2:txt('-' if i==0 else '=',x+width+14,bottom+43,17,MUTED,True)
 elif kind in ['calendar','bills','repeat','installments']:
  calendar(M+21,bottom+19,172,59)
  txt('Dia 22' if kind=='repeat' else 'Confira a data',M+225,bottom+60,16,INK,True)
  txt('Repete mensalmente' if kind=='repeat' else 'Conta prevista ainda não foi paga',M+225,bottom+38,10.5,MUTED)
 elif kind in ['chat','confirm','orb','feedback','expense']:
  box(M+20,bottom+37,275,39,white,LINE,9);txt('O valor certo é 1600 reais.' if kind=='confirm' else 'Qual é meu saldo?',M+34,bottom+52,12,INK)
  box(M+315,bottom+40,174,32,FOREST,r=8);txt('1  Confirmar    2  Editar' if kind=='confirm' else 'Sua IA está aqui',M+327,bottom+51,10,GOLD,True)
 elif kind=='menu':
  for i,name in enumerate(['Visão geral','Meu dinheiro','Contas a pagar','Agenda','WhatsApp','Como usar']):
   x=M+18+(i%3)*165; yy=bottom+49-(i//3)*27;box(x,yy,150,22,white,r=6);txt(name,x+9,yy+7,9,INK,i==5)
 elif kind=='start' or kind=='access':
  box(M+22,bottom+20,132,58,white,LINE,8);txt('Nome',M+34,bottom+62,10,MUTED);txt('E-mail',M+34,bottom+45,10,MUTED);txt('Senha + confirmação',M+34,bottom+29,8,MUTED);arrow(M+173,bottom+49);txt('Sua conta pessoal',M+218,bottom+54,16,INK,True);txt('Seu acesso, seus registros.',M+218,bottom+32,11,MUTED)
 elif kind=='reserve':
  coin(M+53,bottom+54);txt('Caixa',M+95,bottom+51,16,INK,True);arrow(M+205,bottom+54);coin(M+288,bottom+54);txt('Reserva',M+330,bottom+51,16,INK,True)
 elif kind=='travel':
  C.setStrokeColor(FOREST);C.setLineWidth(3);C.roundRect(M+26,bottom+27,72,44,7,fill=0,stroke=1);C.roundRect(M+45,bottom+71,33,10,3,fill=0,stroke=1);txt('Nome da viagem + categoria do gasto',M+125,bottom+55,13.5,INK,True);txt('Exemplo: Férias em Recife / Restaurante',M+125,bottom+34,10.5,MUTED)
 else:
  for i,name in enumerate(['Anote','Confira','Organize']):
   x=M+21+i*170;coin(x+15,bottom+55,17);txt(name,x+44,bottom+50,13,INK,True)
 return bottom-21

header(1,'GUIA ILUSTRADO')
C.bookmarkPage('inicio');C.addOutlineEntry('Comece por aqui','inicio',0,False)
txt('Um guia para começar',M,H-100,12,MUTED,True)
y=para(DATA['title'],M,H-120,CW,34,40,INK,True)
y=para(DATA['subtitle'],M,y-16,CW,17,24,MUTED)
img=ImageReader(str(ROOT/'public/anotei-na-hora.jpeg'));C.drawImage(img,(W-210)/2,327,210,210,mask='auto')
box(M,148,CW,130,MINT,LINE,15)
txt('Você pode usar do seu jeito',M+21,249,17,INK,True)
para('Pelas telas do aplicativo, escrevendo ou falando com a IA, e também pelo WhatsApp. Este manual explica cada ferramenta com passos curtos e exemplos.',M+21,233,CW-42,14,20,MUTED)
txt('Leia em ordem ou abra direto o assunto que precisa.',M+21,171,11,INK,True)
txt('Exemplos ilustrativos. Os seus valores são os que você cadastrar.',M,100,10.5,MUTED)
txt(DATA['version'],M,78,10,MUTED)
C.showPage()
for index,section in enumerate(DATA['sections'],start=2):
 header(index);C.bookmarkPage(section['id']);C.addOutlineEntry(section['menu'],section['id'],0,False)
 y=H-91;txt(section['menu'].upper(),M,y,9,HexColor('#896B30'),True)
 y=para(section['title'],M,y-13,CW,25,30,INK,True)-13
 y=para(section['intro'],M,y,CW,13.4,18.7,MUTED)-18
 y=visual(section['visual'],y)
 for i,step in enumerate(section['steps'],1):
  C.setFillColor(FOREST);C.circle(M+13,y-9,12,fill=1,stroke=0);txt(str(i),M+9,y-13,11,white,True)
  yy=para(step['title'],M+39,y+2,CW-39,14.3,18.6,INK,True)-5
  y=para(step['text'],M+39,yy,CW-39,13.2,18.2,MUTED)-16
 style=ParagraphStyle('measure',fontName='Guide',fontSize=12.2,leading=17)
 example=Paragraph(escape(section['example']),style);_,eh=example.wrap(CW-32,1000)
 height=eh+36;box(M,y-height,CW,height,MINT,r=10);txt('EXPERIMENTE ASSIM',M+16,y-16,8.5,HexColor('#34745C'),True);para(section['example'],M+16,y-26,CW-32,12.2,17,INK);y-=height+11
 tip=Paragraph(escape('Bom saber: '+section['tip']),style);_,th=tip.wrap(CW-32,1000)
 height=th+24;box(M,y-height,CW,height,HexColor('#F6EEDB'),r=10);para('Bom saber: '+section['tip'],M+16,y-12,CW-32,12.2,17,HexColor('#645332'));y-=height
 if y<64:raise RuntimeError(f"Page overflows: {section['id']} ends at {y:.1f}")
 C.showPage()
header(TOTAL,'PALAVRAS DO APP');C.bookmarkPage('palavras');C.addOutlineEntry('Palavras do aplicativo','palavras',0,False)
y=para('Palavras que ficam mais fáceis',M,H-88,CW,27,33,INK,True)-22
for item in DATA['glossary']:
 y=para(item['term'],M,y,CW,15,21,INK,True)-3;y=para(item['meaning'],M,y,CW,13.2,18.2,MUTED)-17
box(M,90,CW,86,MINT,LINE,12);txt('Dúvida? Pergunte à sua IA.',M+19,149,16,INK,True);para('Você também encontra este guia em Como usar no menu do aplicativo. Salve o PDF ou abra o manual online quando precisar.',M+19,135,CW-38,12.5,18,MUTED)
C.linkURL('https://icom-anotei.pqaykh.easypanel.host/manual',(M,90,W-M,176),relative=0,thickness=0)
C.save();shutil.copyfile(OUT,ROOT/'public/manual-anotei-na-hora.pdf')
print(json.dumps({'manualCreated':True,'pages':TOTAL,'output':str(OUT)},ensure_ascii=False))
