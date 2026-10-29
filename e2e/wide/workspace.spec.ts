import { expect, test, type Page } from '../support/test';
import AxeBuilder from '@axe-core/playwright';
import { openCompletion, startBatch } from '../support/mobile-journey';
const box = async (page:Page, selector:string) => (await page.locator(selector).boundingBox())!;
async function inView(page:Page,name:string){const c=page.getByRole('button',{name,exact:true});await c.scrollIntoViewIfNeeded();expect(await c.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit)})).toBe(true);}
test('WIDE-01: question, work and navigator follow the approved columns',async({page})=>{
 await startBatch(page);const width=page.viewportSize()!.width;
 const q=await box(page,'.question-context'),w=await box(page,'.work-pane');
 expect(q.x+q.width).toBeLessThanOrEqual(w.x);expect(q.width).toBeGreaterThanOrEqual(width<1100?220:260);expect(w.width).toBeGreaterThanOrEqual(480);
 if(width>=1600){const n=await box(page,'.question-navigator');expect(n.x+n.width).toBeLessThanOrEqual(q.x);await expect(page.getByRole('navigation',{name:'Questions',exact:true})).toBeVisible();}
 else if(width>=900) await expect(page.getByRole('navigation',{name:'Questions',exact:true})).toBeVisible();
 else await expect(page.getByRole('navigation',{name:'Questions',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('WIDE-02: fresh batch uses a physical keyboard and an explicit virtual-key toggle',async({page})=>{
 await startBatch(page);await expect(page.getByRole('group',{name:'Numeric keys'})).toHaveCount(0);
 await page.getByRole('button',{name:/Show Keyboard/}).click();await expect(page.getByRole('group',{name:'Numeric keys'})).toBeVisible();
 await page.getByRole('button',{name:/Hide Keyboard/}).click();await expect(page.getByRole('group',{name:'Numeric keys'})).toHaveCount(0);
});
test('WIDE-03: quick tools are above the first step, Add step below the last step',async({page})=>{
 await startBatch(page);const tools=await box(page,'.math-tools-row'),steps=await box(page,'.steps'),add=(await page.getByRole('button',{name:'Add step',exact:true}).boundingBox())!;
 expect(tools.y+tools.height).toBeLessThanOrEqual(steps.y);expect(add.y).toBeGreaterThanOrEqual(steps.y+steps.height);
});
test('WIDE-04: visible question context stays available while a long notebook scrolls',async({page})=>{
 await startBatch(page);for(let i=0;i<7;i++)await page.getByRole('button',{name:'Add step',exact:true}).click();
 await expect(page.getByLabel('Step 8 expression')).toBeInViewport();await expect(page.getByRole('region',{name:'Current problem'})).toBeInViewport();
 const ctx=await box(page,'.question-context');expect(ctx.y).toBeGreaterThanOrEqual(0);
 await inView(page,'Next question →');
});
test('WIDE-05: resizing phone/laptop/desktop preserves typing and restores the right layout',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('123');
 for(const [width,layout] of [[899,'phone'],[900,'laptop'],[1599,'laptop'],[1600,'desktop'],[1920,'desktop']] as const){
  await page.setViewportSize({width,height:900});await expect(page.getByRole('main')).toHaveAttribute('data-layout',layout);await expect(page.getByLabel('Step 1 expression')).toContainText('123');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('WIDE-06: desktop navigation focus does not activate, Enter does',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await startBatch(page);
 const second=page.getByRole('button',{name:'Question 2 Not started',exact:true});await second.focus();
 await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible();
 await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Question 2',exact:true})).toBeVisible();
 await expect(second).toHaveAttribute('aria-current','page');
});
test('WIDE-07: navigator switches questions without deleting drafts or fabricating confidence',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('456');
 await page.getByRole('button',{name:'Question 2 Not started',exact:true}).click();await page.getByRole('button',{name:'Question 1 Draft',exact:true}).click();
 await expect(page.getByLabel('Step 1 expression')).toContainText('456');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('WIDE-08: slash chooser accepts keyboard selection and returns to work',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.press('/');const d=page.getByRole('dialog',{name:'Insert Math Element'});
 await expect(d).toBeVisible();await page.keyboard.press('Enter');await expect(d).toBeHidden();await page.keyboard.type('42');await expect(page.getByLabel('Step 1 expression')).toContainText('42');
});
test('WIDE-09: focused numbers respect digit boundaries before moving fields',async({page})=>{
 await page.goto('/');const numerator=page.getByRole('button',{name:/Step 1.*Numerator number 2/}).first();await numerator.click();await page.keyboard.type('34');
 await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('Backspace');
 await expect(page.getByLabel('Step 1 expression')).toContainText('34');await page.keyboard.press('Control+z');await expect(page.getByLabel('Step 1 expression')).toContainText('234');
});
test('WIDE-10: toolbar undo/redo restore math and focus without opening the keypad',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('7');await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(page.getByRole('main')).toBeFocused();await expect(page.getByLabel('Step 1 expression')).toContainText('7');await expect(page.getByRole('group',{name:'Numeric keys'})).toHaveCount(0);
});
test('WIDE-11: deleting a named middle step preserves neighboring work and first-step protection',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('11');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.keyboard.type('22');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.keyboard.type('33');
 await page.getByRole('button',{name:'Delete Step 2'}).click();await expect(page.getByLabel('Step 1 expression')).toContainText('11');await expect(page.getByLabel('Step 2 expression')).toContainText('33');await expect(page.getByRole('button',{name:'Delete Step 1'})).toBeDisabled();
});
test('WIDE-12: resetting a different step targets that step and Undo restores it',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('11');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.keyboard.type('22');await page.getByRole('button',{name:'Reset Step 1'}).click();
 await expect(page.getByLabel('Step 2 expression')).toContainText('22');await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('Step 1 expression')).toContainText('11');
});
test('WIDE-13: shortcut dialog traps focus, Escape restores the trigger, and work stays unchanged',async({page})=>{
 await startBatch(page);await page.getByRole('button',{name:'Exercise menu'}).click();await page.getByRole('menuitem',{name:'Show more'}).click();const trigger=page.getByRole('menuitem',{name:'Keyboard shortcuts',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'Keyboard shortcuts'});await expect(dialog).toBeVisible();
 for(let i=0;i<5;i++)await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Exercise menu'})).toBeFocused();await expect(page.getByRole('group',{name:'Numeric keys'})).toHaveCount(0);
});
test('WIDE-14: next-question decision still requires confidence and cancellation preserves work',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('88');const next=page.getByRole('button',{name:/Next question/});await next.click();
 await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(next).toBeFocused();await expect(page.getByLabel('Step 1 expression')).toContainText('88');
});
test('WIDE-15: a committed answer advances, updates status and is retained on return',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('9');await page.getByRole('button',{name:/Next question/}).click();await page.getByRole('radio',{name:'Medium',exact:true}).check();await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Question 2',exact:true})).toBeVisible();await page.getByRole('button',{name:/Previous/}).click();await expect(page.getByLabel('Step 1 expression')).toContainText('9');
});
test('WIDE-16: final completion keeps JSON copy explicit',async({page})=>{
 const dialog=await openCompletion(page);await expect(dialog.getByRole('button',{name:'Copy full session JSON',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:/Copy for Review/})).toBeVisible();
});
test('WIDE-17: menu JSON export includes all questions and ordered steps',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked')}}});document.execCommand=()=>false;});
 await startBatch(page);await page.getByRole('button',{name:'Add step',exact:true}).click();await page.keyboard.type('12');await page.getByRole('button',{name:'Exercise menu'}).click();await page.getByRole('menuitem',{name:'Show more'}).click();await page.getByRole('menuitem',{name:/^Copy full session JSON/}).click();
 const raw=await page.getByRole('textbox',{name:'Copy or paste session JSON'}).inputValue();const saved=JSON.parse(raw);expect(saved.doc.exercises).toHaveLength(20);expect(saved.doc.exercises[0].steps).toHaveLength(2);
});
test('WIDE-18: 200 percent text sizing and long math avoid document overflow',async({page})=>{
 await startBatch(page);await page.addStyleTag({content:'html {font-size:200% !important}'});await page.getByRole('main').focus();await page.keyboard.type('12345678901234567890123456789012345678901234567890');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await inView(page,'Add step');await inView(page,'Next question →');
});
test('WIDE-19: native zoom-like reflow retains all functionality at 320 CSS pixels',async({page})=>{
 await startBatch(page);await page.setViewportSize({width:320,height:800});await expect(page.getByRole('main')).toHaveAttribute('data-layout','phone');await inView(page,'Add step');await inView(page,'Next question →');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('WIDE-20: reduced motion and forced colors retain focus and controls',async({page})=>{
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await startBatch(page);await inView(page,'Add step');const add=page.getByRole('button',{name:'Add step',exact:true});await add.focus();await expect(add).toBeFocused();expect(await add.evaluate(el=>getComputedStyle(el).forcedColorAdjust)).not.toBe('none');
});
test('WIDE-21: shortcut help has no automated WCAG violations',async({page},info)=>{
 await startBatch(page);await page.getByRole('button',{name:'Exercise menu'}).click();await page.getByRole('menuitem',{name:'Show more'}).click();await page.getByRole('menuitem',{name:'Keyboard shortcuts'}).click();const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();await info.attach('axe-shortcuts',{body:JSON.stringify(result),contentType:'application/json'});expect(result.violations).toEqual([]);
});
test('WIDE-22: narrow-height landscape keeps dialog controls reachable',async({page})=>{
 await page.setViewportSize({width:1024,height:480});await startBatch(page);await page.getByRole('button',{name:/Next question/}).click();await inView(page,'Continue');await inView(page,'Cancel');
});
test('WIDE-23: clicking between specific digits deletes the intended digit and Undo restores it',async({page})=>{
 await startBatch(page);await page.getByRole('main').focus();await page.keyboard.type('1234');
 const digit=page.getByLabel('Step 1 expression').locator('[data-digit="1"]');const r=(await digit.boundingBox())!;
 await page.mouse.click(r.x+r.width*.2,r.y+r.height/2);await page.keyboard.press('Delete');await expect(page.getByLabel('Step 1 expression')).toContainText('134');
 await page.keyboard.press('Control+z');await expect(page.getByLabel('Step 1 expression')).toContainText('1234');
});
test('WIDE-24: the last navigator row is reachable and Home returns focus without activating',async({page})=>{
 await page.setViewportSize({width:1920,height:900});await startBatch(page);
 const first=page.getByRole('button',{name:'Question 1 Not started',exact:true}),last=page.getByRole('button',{name:'Question 20 Not started',exact:true});
 await first.focus();await page.keyboard.press('End');await expect(last).toBeFocused();await expect(last).toBeInViewport();
 await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible();await page.keyboard.press('Home');await expect(first).toBeFocused();
});
test('WIDE-25: the initial notebook fits the viewport without empty page scrolling',async({page})=>{
 await startBatch(page);expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize()!.height+1);
 await expect(page.getByRole('button',{name:/Next question/})).toBeInViewport();
});
test('WIDE-26: advanced notation is available without a numeric keyboard',async({page})=>{
 await startBatch(page);await page.getByRole('button',{name:'More math tools'}).click();const dialog=page.getByRole('dialog',{name:'Insert Math Element'});
 await dialog.getByRole('button',{name:/نمایش بیشتر/}).click();await dialog.getByRole('button',{name:'Integral',exact:true}).click();await expect(dialog).toBeHidden();await page.keyboard.type('7');
 await expect(page.getByLabel('Step 1 expression')).toContainText('7');await expect(page.getByRole('group',{name:'Numeric keys'})).toHaveCount(0);
});
test('WIDE-27: End and Home keep the full notation catalog focus visible',async({page})=>{
 await startBatch(page);const trigger=page.getByRole('button',{name:'More math tools'});await trigger.click();const options=page.getByRole('dialog',{name:'Insert Math Element'}).locator('[data-insert-kind]');
 await page.keyboard.press('End');await expect(options.last()).toBeFocused();await expect(options.last()).toBeInViewport();
 await page.keyboard.press('Home');await expect(options.first()).toBeFocused();await expect(options.first()).toBeInViewport();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
for(const state of ['single','batch','multi-step','shortcuts'] as const)test(`WIDE-VISUAL ${state}: reviewed layout baseline`,async({page})=>{
 if(state==='single')await page.goto('/');else await startBatch(page);
 if(state==='multi-step'){await page.getByRole('main').focus();await page.keyboard.press('/');await page.keyboard.press('Enter');await page.keyboard.type('12');await page.keyboard.press('ArrowDown');await page.keyboard.type('7');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.keyboard.type('42');}
 if(state==='shortcuts'){await page.getByRole('button',{name:'Exercise menu'}).click();await page.getByRole('menuitem',{name:'Show more'}).click();await page.getByRole('menuitem',{name:'Keyboard shortcuts'}).click();}
 await expect(page).toHaveScreenshot(`${state}.png`,{fullPage:true,animations:'disabled',caret:'hide',maxDiffPixelRatio:0.005});
});
test('WIDE-KB-13: virtual keyboard is closed by default on desktop and an explicit choice survives reload',async({page})=>{
 await page.addInitScript(()=>{ const k='math-scratchpad-redux-v2'; if(!sessionStorage.getItem('seeded')){ sessionStorage.setItem('seeded','1'); const raw=localStorage.getItem(k); if(raw){ const d=JSON.parse(raw); d.keyboardOpen=true; localStorage.setItem(k,JSON.stringify(d)); } } });
 await startBatch(page);const toggle=page.locator('.keyboard-toggle');
 await expect(toggle).toHaveText(/Show Keyboard/);await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();await expect(toggle).toHaveText(/Hide Keyboard/);
 expect(await page.evaluate(()=>localStorage.getItem('math-scratchpad-ui-v1:virtual-keyboard'))).toBe('1');
 await page.reload();await expect(page.locator('.keyboard-toggle')).toHaveText(/Hide Keyboard/);
 await page.locator('.keyboard-toggle').click();await page.reload();await expect(page.locator('.keyboard-toggle')).toHaveText(/Show Keyboard/);
});
