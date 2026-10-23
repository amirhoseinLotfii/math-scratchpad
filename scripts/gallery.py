"""Build the source-native SVG feature gallery; no external assets or fonts."""
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'images'
OUT.mkdir(parents=True, exist_ok=True)
FG, MUTED, MINT, BORDER = '#f2f6f3', '#b8c5bf', '#d0f5e2', '#424d47'
items = []
parts = []

def text(x, y, value, size=28, color=FG, weight=400, anchor='start'):
    parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')

def rect(x, y, w, h, fill='#202624', stroke=BORDER, radius=24):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

def line(x1, y1, x2, y2, color=MINT, width=3):
    parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>')

def button(x, y, w, label, selected=False, h=64):
    rect(x, y, w, h, '#254c3d' if selected else '#2b302f', MINT if selected else BORDER, 16)
    text(x+w/2, y+h/2+10, label, min(28, (w-24)/max(1,len(label)*.6)), MINT if selected else FG, 500, 'middle')

def badge(x, y, label, warning=False):
    w = 24 + len(label)*14
    rect(x, y, w, 42, '#402e17' if warning else '#254c3d', '#8c6936' if warning else '#719b85', 10)
    text(x+12, y+29, label, 23, '#f4c16f' if warning else MINT, 500)

def frac(x, y, numerator, denominator, width=100, size=58, active=False):
    if active:
        rect(x+8, y-68, width-16, 72, '#254c3d', MINT, 12)
    text(x+width/2, y-12, numerator, size, MINT if active else FG, 400, 'middle')
    line(x, y+6, x+width, y+6, FG, 3)
    text(x+width/2, y+66, denominator, size, FG, 400, 'middle')

def equation(x, y, values=('2','3','1','4'), active=False, size=58):
    frac(x,y,values[0],values[1],100,size,active)
    text(x+135,y+24,'+',size,FG,400,'middle')
    frac(x+180,y,values[2],values[3],100,size)

def label_lines(x, y, lines, size=27, color=MUTED):
    for i, value in enumerate(lines): text(x,y+i*40,value,size,color)

def start(slug, title, subtitle, desc):
    global parts
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-labelledby="title desc" direction="ltr"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>',
      '<defs><radialGradient id="bg" cx="0" cy="0" r="1"><stop stop-color="#244d3b"/><stop offset="1" stop-color="#101916"/></radialGradient></defs>',
      '<rect width="1600" height="1000" fill="url(#bg)"/>',
      '<g font-family="DejaVu Sans,Arial,sans-serif">']
    text(64,64,'Math Scratchpad',27,MINT,500)
    text(64,142,title,52,FG,600)
    text(64,194,subtitle,28,MUTED)
    items.append((slug,title,subtitle))

def finish():
    parts.append('</g></svg>')
    (OUT/(items[-1][0]+'.svg')).write_text('\n'.join(parts)+'\n')

start('01-overview','Math inside the conversation.','A touch-first notebook for equations and your reasoning.', 'Feature illustration of the math editor and its manual review workflow.')
rect(64,250,650,670)
text(100,310,'Write. Think. Take the next step.',30,MINT,500)
for y,title,desc in [(405,'Edit the expression itself','Numbers, fractions and nested templates.'),(545,'Keep every step','Independent lines with an explicit Final.'),(685,'Review on your terms','Check copies; you paste and send.')]:
    text(104,y,title,34,FG,600);text(104,y+46,desc,25,MUTED)
button(104,805,220,'Symbols');button(344,805,220,'Check',True)
rect(752,250,784,670)
text(790,310,'Exercise 1 · In progress',28,MUTED)
text(790,380,'Step 1',30,FG,600);button(1360,340,132,'Final')
equation(940,500,active=True)
text(790,635,'1   2   3   ÷',38);text(790,700,'4   5   6   ×',38);text(790,765,'7   8   9   −',38)
button(790,817,310,'+ New step');button(1124,817,365,'Check',True)
finish()

start('02-fractions-ltr','Fractions in the right direction.','Left-to-right math. Separate numerator and denominator targets.', 'Two vertical fractions, 2 over 3 plus 1 over 4, with the first numerator selected.')
rect(64,260,1472,650)
equation(610,555,active=True,size=72)
badge(140,350,'First numerator');line(390,370,640,505)
badge(140,730,'First denominator');line(420,750,650,625)
badge(1090,350,'Second numerator');line(1090,390,840,510)
badge(1060,730,'Second denominator');line(1070,730,840,625)
text(800,850,'Visual order and editing order stay aligned.',29,MINT,500,'middle')
finish()

start('03-caret-insertion','Place the cursor where you need it.','Edit a digit, or insert on the main line beside a fraction.', 'Number insertion changes 123 to 1923; main-line insertion adds an empty fraction without changing the existing denominator.')
rect(64,265,720,630);rect(812,265,724,630)
text(106,330,'Inside a number',32,MINT,600)
text(140,505,'123',92);line(201,425,201,520);text(420,492,'→',62,MINT);text(520,505,'1923',78);line(620,430,620,520)
button(135,620,210,'Insert 9');label_lines(110,760,['Choose the boundary after 1.','The remaining digits stay in place.'])
text(852,330,'Outside a fraction',32,MINT,600)
frac(895,470,'2','3');text(1040,500,'→',54,MINT);frac(1135,470,'2','3');text(1270,495,'+',54);frac(1330,470,'□','□',95,50,True)
label_lines(855,760,['Tap the dot beside a fraction.','Add an operator and a blank template.'])
finish()

start('04-mobile-keyboard','Start at the top-left.','Ascending numbers and Backspace beside the quick templates.', 'The current LTR keyboard starts with 1 2 3 and places Backspace in the top-right quick-key slot.')
rect(64,250,920,690)
for i,v in enumerate(['Symbols','Compact','Hide keys']):button(92+i*294,275,278,v,i==1,58)
for row,values in enumerate([['a/b','xⁿ','√','⌫'],['1','2','3','÷'],['4','5','6','×'],['7','8','9','−'],['0','.','=','+']]):
    for col,v in enumerate(values):button(92+col*220,350+row*88,204,v,col==3,74)
for i,v in enumerate(['←','→','Next']):button(92+i*294,800,278,v,False,58)
text(1040,365,'1 → 2 → 3',42,MINT,600)
label_lines(1040,445,['Numbers increase','from the upper left.'])
text(1040,600,'⌫',72,MINT)
label_lines(1040,670,['Delete without reaching','below the number grid.'])
finish()

start('05-solution-steps','Keep the whole solution in view.','Revising an earlier line preserves later work and marks it for review.', 'Three ordered solution steps show 2/3+1/4, then 8/12+3/12, then 11/12 explicitly marked Final.')
for i,y in enumerate([260,465,670]):
    rect(64,y,1472,185);text(100,y+58,f'Step {i+1}',31,FG,600)
    badge(270,y+23,'Edited' if i==0 else 'Needs review',i>0)
    if i<2:equation(720,y+80,('2','3','1','4') if i==0 else ('8','12','3','12'),size=46)
    else:frac(800,y+80,'11','12',110,46);button(1310,y+56,170,'Final',True)
text(100,923,'+ New step',30,MINT,500);text(420,923,'Each new line starts empty.',27,MUTED)
finish()

start('06-symbols-favorites','Find symbols by topic.','Favorites, recent symbols and a preview before insertion.', 'Symbol topics include Numbers, Algebra, Functions, Calculus, Matrices and Probability and statistics.')
rect(64,255,1472,680)
for i,v in enumerate(['Numbers','Algebra','Functions','Calculus','Matrices','Probability & stats']):button(88+i*240,280,226,v,i==3,64)
text(105,406,'Favorites',24,MUTED)
for i,v in enumerate(['∫','a/b','√']):button(250+i*100,363,88,v)
text(685,406,'Recent',24,MUTED)
for i,v in enumerate(['Σ','xⁿ']):button(790+i*100,363,88,v)
for i,(glyph,label) in enumerate([('d/dx','Derivative'),('∫','Integral'),('lim','Limit'),('Σ','Sum')]):
    button(100,470+i*96,725,glyph+'     '+label);text(775,514+i*96,'★' if i==1 else '☆',28,MINT)
rect(865,470,620,390,'#1b2721','#719b85')
text(900,525,'Editable template',31,MINT,500);text(935,690,'∫',132)
text(1020,585,'□',39);text(1000,735,'□',39);text(1050,655,'□  d □',57)
button(900,765,550,'Insert template',True)
finish()

start('07-template-navigation','Fill the fields. Keep moving.','Next walks through template fields and returns to the main line.', 'Integral field order is lower bound, upper bound, integrand, variable, then outside the template.')
rect(64,260,1472,340)
text(200,490,'∫',180);text(315,345,'□',48);text(285,540,'□',48);text(420,445,'□',86);text(600,445,'d',74);text(700,445,'□',86)
for x,y,t in [(855,330,'1  Lower bound'),(855,395,'2  Upper bound'),(855,460,'3  Integrand'),(855,525,'4  Variable')]:text(x,y,t,34,MINT)
for i,v in enumerate(['Lower','Upper','Body','Variable','Main line']):
    button(64+i*298,660,270,v,i==0,74)
    if i<4:text(348+i*298,712,'→',28,MINT,400,'middle')
text(100,845,'Also available',26,MUTED);text(100,905,'a/b       xⁿ       √       ( )       lim       Σ',46,FG)
finish()

start('08-matrices-statistics','Go beyond arithmetic.','Editable matrix, probability and statistics notation.', 'A 2 by 2 matrix and probability/statistics symbols are notation templates, not calculations.')
rect(64,265,720,640);rect(812,265,724,640)
text(110,335,'Matrices',34,MINT,600)
line(190,405,170,405);line(170,405,170,670);line(170,670,190,670)
line(640,405,660,405);line(660,405,660,670);line(660,670,640,670)
for x,y,v in [(300,490,'1'),(510,490,'2'),(300,620,'3'),(510,620,'4')]:text(x,y,v,72,FG,400,'middle')
label_lines(110,785,['2 × 2 and 3 × 3 templates','Independent editable cells.'])
text(860,335,'Probability & stats',34,MINT,600)
for i,(a,b) in enumerate([('P(A)','Probability'),('n!','Factorial'),('nCk','Binomial coefficient'),('x̄','Mean'),('σ','Sigma')]):
    text(875,430+i*82,a,46);text(1070,430+i*82,b,27,MUTED)
finish()

start('09-structure-editing','Select the whole structure.','Copy, cut, duplicate or paste while keeping nested fields together.', 'Whole fraction selection uses the internal mathematical clipboard, distinct from the review clipboard.')
rect(64,265,1472,350)
rect(125,320,330,240,'#254c3d',MINT,18);frac(155,432,'x + 1','x − 1',270,58)
text(535,350,'Whole structure selected',36,MINT,500)
for i,v in enumerate(['Copy','Cut','Duplicate','Delete','Paste']):button(535+i*186,420,172,v)
text(535,565,'Internal math clipboard',28,MUTED)
rect(64,655,1472,260)
text(100,712,'Duplicate',31,MINT,600)
frac(375,775,'x + 1','x − 1',210,44);text(690,808,'→',60,MINT);frac(865,775,'x + 1','x − 1',210,44);frac(1210,775,'x + 1','x − 1',210,44)
finish()

start('10-undo-redo','Try an edit. Keep a way back.','Undo and Redo restore document history, including structured math.', 'Inserting 9 into 123 gives 1923; Undo restores 123 and Redo returns to 1923.')
for x,title,value in [(64,'Before','123'),(565,'After inserting 9','1923'),(1066,'After Undo','123')]:
    rect(x,285,470,390);text(x+35,355,title,29,MINT,500);text(x+235,535,value,90,FG,400,'middle')
text(548,510,'→',38,MINT,400,'middle');text(1049,510,'→',38,MINT,400,'middle')
button(210,750,475,'Undo');button(915,750,475,'Redo',True)
text(800,900,'Undo restores the prior edit. Redo reapplies it.',30,MUTED,400,'middle')
finish()

start('11-exercises-backup','Start fresh. Pick up your work.','Math / LaTeX input, Persian problem text and portable session backups.', 'Exercise management and a text-based JSON backup workflow; storage depends on the host.')
for x in [64,565,1066]:rect(x,265,470,650)
text(100,335,'Enter a problem',32,MINT,600)
button(95,385,408,'Math / LaTeX',True);button(95,465,408,'Persian text')
rect(95,565,408,150,'#252b28');text(120,625,'\\frac{2}{3}',30);text(120,675,'+ \\frac{1}{4}',30)
button(95,785,408,'Start',True)
text(600,335,'Switch exercises',32,MINT,600)
button(595,385,408,'Exercise 1',True);text(625,500,'In progress',28,MUTED)
button(595,555,408,'Exercise 2');text(625,670,'Final marked',28,MUTED)
text(600,820,'Resume a saved draft.',26,MUTED)
text(1100,335,'Session backup',32,MINT,600)
button(1096,385,408,'Copy session',True);button(1096,465,408,'Restore')
label_lines(1100,615,['Copy session text.','Save it externally.','Paste it to restore.'])
label_lines(1100,795,['Draft recovery depends','on local storage.'],24)
finish()

start('12-review-workflow','Your work. Your review request.','Check copies the problem and steps; you paste and send in the chat.', 'Manual review workflow with Copied and Changed since copy states and a selectable fallback if copying is blocked.')
for x,title in [(64,'1  Copy'),(565,'2  Paste'),(1066,'3  Send')]:rect(x,270,470,350);text(x+40,340,title,33,MINT,600)
button(115,405,368,'Check',True);text(300,560,'Copied',27,MINT,400,'middle')
label_lines(610,430,['Original problem','All ordered steps','Explicit final answer'],30,FG)
label_lines(1110,430,['Paste into this chat.','Send it yourself.','Ask for a review.'],29,FG)
rect(64,665,1472,240)
badge(100,710,'Changed since copy',True)
text(460,742,'Edit after copying? Press Check again.',32,FG)
text(100,838,'Clipboard blocked? Select the fallback text and copy it manually.',28,MUTED)
finish()

gallery = ['# Feature gallery', '', 'Twelve vector feature illustrations for the current editor. These explain implemented behavior; they are not captured app screens or pixel-perfect layout evidence. The editable product remains the source of truth. Math notation templates are not a local solver. Check copies text for manual pasting and sending.', '', 'SVG text and shapes remain sharp when enlarged. All images are self-contained, with no external scripts, fonts, images or services.', '']
for slug,title,subtitle in items:
    gallery += [f'## {title}', '', subtitle, '', f'![{title}](images/{slug}.svg)', '']
(ROOT/'docs/gallery.md').write_text('\n'.join(gallery))
for filename,heading,copy,link in [
    ('README.md','## Feature gallery','Explore the current keyboard, direct fraction editing, steps, notation templates and review workflow in [12 vector feature illustrations](docs/gallery.md). These are explanatory artwork, not captured app screens.','View all 12 features'),
    ('README.fa.md','## گالری قابلیت‌ها','[۱۲ تصویر برداری از قابلیت‌ها](docs/gallery.md): صفحه‌کلید جدید، کسر، مراحل، نمادها و بررسی. تصاویر برای توضیح قابلیت‌ها طراحی شده‌اند و اسکرین‌شات واقعی برنامه نیستند.','مشاهدهٔ هر ۱۲ تصویر')]:
    p=ROOT/filename
    s=p.read_text()
    section=f'{heading}\n\n{copy}\n\n![Math Scratchpad overview](docs/images/01-overview.svg)\n\n[{link}](docs/gallery.md)\n\n'
    marker='## What makes it useful' if filename=='README.md' else '## امکانات این نسخه'
    if heading not in s:s=s.replace(marker,section+marker,1)
    p.write_text(s)
print(f'Created {len(items)} SVG images and bilingual README gallery links.')
