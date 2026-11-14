import { expect, test } from '@playwright/test';

test.beforeEach(async ({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');
});
for(const key of ['Enter','Space'] as const){
  test(`menu.new-problem.opens-with-${key}`,async({page})=>{
    await page.getByRole('button',{name:'Exercise menu'}).click();
    const action=page.getByRole('menuitem',{name:'New Problem'});
    await action.focus();await page.keyboard.press(key);
    await expect(page.getByRole('region',{name:'New exercise'})).toBeVisible();
  });
  test(`menu.import-json.opens-with-${key}`,async({page})=>{
    await page.getByRole('button',{name:'Exercise menu'}).click();
    await page.getByRole('menuitem',{name:'Show more'}).click();
    await page.getByRole('menuitem',{name:'Data',exact:true}).hover();
    const action=page.getByRole('menuitem',{name:'Import session JSON'});
    if(key==='Enter'){
      await action.evaluate(element=>{
        const state={keydown:0,click:0,focus:0,blur:0};
        (window as Window & {__auditMenuEventTrace?:typeof state}).__auditMenuEventTrace=state;
        element.addEventListener('keydown',()=>state.keydown++,true);
        element.addEventListener('click',()=>state.click++,true);
        element.addEventListener('focus',()=>state.focus++,true);
        element.addEventListener('blur',()=>state.blur++,true);
      });
    }
    await action.scrollIntoViewIfNeeded();
    await action.focus();
    await expect(action).toBeFocused();
    const focusedBefore=await action.evaluate(element=>document.activeElement===element);
    await page.keyboard.press(key);
    if(key==='Enter'){
      const trace=await page.evaluate((focusedBefore)=>({
        ...(window as Window & {__auditMenuEventTrace?:{keydown:number;click:number;focus:number;blur:number}}).__auditMenuEventTrace,
        focusedBefore,
        activeText:document.activeElement?.textContent?.trim().slice(0,80),
        activeRole:document.activeElement?.getAttribute('role'),
      }),focusedBefore);
      console.log(`[AUDIT_MENU_KEYBOARD] ${JSON.stringify(trace)}`);
    }
    await expect(page.getByRole('region',{name:'Session backup'})).toBeVisible();
  });
}
test('menu.import-json.opens-with-locator-press-enter',async({page})=>{
  await page.getByRole('button',{name:'Exercise menu'}).click();
  await page.getByRole('menuitem',{name:'Show more'}).press('Enter');
  await page.getByRole('menuitem',{name:'Data',exact:true}).hover();
  const action=page.getByRole('menuitem',{name:'Import session JSON'});
  await action.scrollIntoViewIfNeeded();
  await action.press('Enter');
  await expect(page.getByRole('region',{name:'Session backup'})).toBeVisible();
});
test('menu.escape.closes-and-returns-focus',async({page})=>{
  const opener=page.getByRole('button',{name:'Exercise menu'});
  await opener.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem',{name:'New Problem'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem',{name:'New Problem'})).toBeHidden();
  await expect(opener).toBeFocused();
});
