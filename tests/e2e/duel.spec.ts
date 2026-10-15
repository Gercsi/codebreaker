import {test,expect,type Page} from '@playwright/test';
async function enter(page:Page,colors:string[]){for(const color of colors)await page.getByRole('button',{name:color,exact:true}).click();}
test('teljes kétjátékos mérkőzés, titkosítás, újratöltés és visszavágó',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 try{
  await a.goto('/');await a.getByLabel('Beceneved').fill('Anna');await a.getByRole('button',{name:'Szoba létrehozása'}).click();
  const code=await a.getByTestId('room-code').innerText();await b.goto(`/?room=${code}`);await b.getByLabel('Beceneved').fill('Bence');await b.getByRole('button',{name:'Csatlakozás a párbajhoz'}).click();
  await expect(a.getByText('Az ellenfeled megérkezett. Készen álltok!')).toBeVisible();await a.getByRole('button',{name:'Párbaj indítása'}).click();
  await enter(a,['Piros','Kék','Zöld','Sárga','Lila']);await a.getByRole('button',{name:'Kód rögzítése'}).click();
  await expect(a.getByText('A titkod biztonságban van.')).toBeVisible();await enter(b,['Lila','Sárga','Zöld','Kék','Piros']);await b.getByRole('button',{name:'Kód rögzítése'}).click();
  await enter(a,['Lila','Sárga','Zöld','Kék','Piros']);await a.getByRole('button',{name:'Tipp beküldése'}).click();
  await expect(a.getByText('5 pontos · 0 részleges')).toBeVisible();await expect(a.locator('.feedback-peg')).toHaveCount(0);await expect(b.getByText('5 pontos · 0 részleges')).toHaveCount(0);await expect(a.getByText('Tipp beküldve.',{exact:true})).toBeVisible();
  await a.reload();await expect(a.getByText('5 pontos · 0 részleges')).toBeVisible();
  await enter(b,['Piros','Kék','Zöld','Sárga','Lila']);await b.getByRole('button',{name:'Tipp beküldése'}).click();
  await expect(a.getByRole('heading',{name:'Döntetlen!'})).toBeVisible();await expect(b.getByRole('heading',{name:'Döntetlen!'})).toBeVisible();
  await expect(a.locator('.result-panel')).toHaveCount(2);await a.getByRole('button',{name:'Jöhet a visszavágó'}).click();await b.getByRole('button',{name:'Visszavágó elfogadása'}).click();
  await expect(a.getByRole('heading',{name:'Rejtsd el a kombinációd.'})).toBeVisible();await expect(a.locator('.slot .empty')).toHaveCount(5);
 }finally{await ca.close();await cb.close();}
});
test('mobil főmenü, szabályok és nehéz beállítás vízszintes túlcsordulás nélkül',async({browser})=>{
 const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'});const page=await context.newPage();
 try{await page.goto('/');await expect(page.getByRole('heading',{name:/Törd fel a kódot/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Hogyan játssz?'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Értem, jöhet a párbaj'}).click();
  await page.getByLabel('Beceneved').fill('Mobil');await page.getByRole('button',{name:'Szoba létrehozása'}).click();await page.getByRole('button',{name:'Nehéz'}).click();await expect(page.getByRole('button',{name:'Nehéz'})).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();}
});
test('mobil nehéz pálya, győzelem/vereség és asztali látvány',async({browser})=>{
 const ca=await browser.newContext({viewport:{width:414,height:896}}),cb=await browser.newContext({viewport:{width:1440,height:1050}});const a=await ca.newPage(),b=await cb.newPage();const errors:string[]=[];a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message));
 try{await a.goto('/');await b.goto('/');await b.screenshot({path:'test-results/desktop-home.png',fullPage:true});await a.screenshot({path:'test-results/mobile-home.png',fullPage:true});
  await a.getByLabel('Beceneved').fill('Mobil');await a.getByRole('button',{name:'Szoba létrehozása'}).click();await a.getByRole('button',{name:'Nehéz'}).click();await expect(a.getByRole('button',{name:'Nehéz'})).toHaveAttribute('aria-pressed','true');
  await a.getByLabel('Ismétlődő színek').click();await expect(a.getByLabel('Ismétlődő színek')).not.toBeChecked();const code=await a.getByTestId('room-code').innerText();await b.goto(`/?room=${code}`);await b.getByLabel('Beceneved').fill('Asztali');await b.getByRole('button',{name:'Csatlakozás a párbajhoz'}).click();await a.getByRole('button',{name:'Párbaj indítása'}).click();
  const colors=['Piros','Kék','Zöld','Sárga','Lila','Narancs'];await enter(a,colors);await a.screenshot({path:'test-results/mobile-hard-setup.png',fullPage:true});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await a.getByRole('button',{name:'Kód rögzítése'}).click();await enter(b,[...colors].reverse());await b.getByRole('button',{name:'Kód rögzítése'}).click();
  await enter(a,[...colors].reverse());await a.getByRole('button',{name:'Tipp beküldése'}).click();await b.screenshot({path:'test-results/desktop-game.png',fullPage:true});await enter(b,[...colors].reverse());await b.getByRole('button',{name:'Tipp beküldése'}).click();
  await expect(a.getByRole('heading',{name:'Győzelem!'})).toBeVisible();await expect(b.getByRole('heading',{name:'Most az ellenfeled nyert.'})).toBeVisible();expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:'test-results/mobile-result.png',fullPage:true});assertNoErrors();
 }finally{await ca.close();await cb.close();}
 function assertNoErrors(){expect(errors).toEqual([]);}
});


for(const repeats of [true,false])test(`segítő mód: mobil, fix helyek, paletta, frissítés és visszavágó (ismétlés: ${repeats})`,async({browser})=>{
 const ca=await browser.newContext({viewport:{width:375,height:900}}),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 const errors:string[]=[];a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message));
 try{
  await a.goto('/');await a.getByLabel('Beceneved').fill('Segítő');await a.getByRole('button',{name:'Szoba létrehozása'}).click();
  await expect(a.getByLabel('Segítő mód')).not.toBeChecked();await a.getByLabel('Segítő mód').click();await expect(a.getByLabel('Segítő mód')).toBeChecked();
  await a.getByRole('button',{name:'Nehéz'}).click();await expect(a.getByRole('button',{name:'Nehéz'})).toHaveAttribute('aria-pressed','true');
  if(!repeats){await a.getByLabel('Ismétlődő színek').click();await expect(a.getByLabel('Ismétlődő színek')).not.toBeChecked();}
  const code=await a.getByTestId('room-code').innerText();await b.goto(`/?room=${code}`);await b.getByLabel('Beceneved').fill('Partner');await b.getByRole('button',{name:'Csatlakozás a párbajhoz'}).click();
  await expect(b.getByLabel('Segítő mód')).toBeChecked();await expect(b.getByLabel('Segítő mód')).toBeDisabled();
  await a.getByRole('button',{name:'Párbaj indítása'}).click();
  const secret=['Piros','Kék','Zöld','Sárga','Lila','Narancs'];await enter(a,[...secret].reverse());await a.getByRole('button',{name:'Kód rögzítése'}).click();
  await enter(b,secret);await b.getByRole('button',{name:'Kód rögzítése'}).click();
  await expect(a.locator('.slot.confirmed-fixed')).toHaveCount(0);await expect(a.locator('.known-remaining')).toHaveCount(0);
  await enter(a,['Piros','Zöld','Rózsaszín','Kék',repeats?'Piros':'Narancs','Türkiz']);await a.getByRole('button',{name:'Tipp beküldése'}).click();
  await expect(a.locator('.feedback-exact')).toHaveCount(1);await expect(a.locator('.feedback-partial')).toHaveCount(repeats?2:3);
  await expect(a.locator('.feedback-peg').nth(2)).toHaveAttribute('aria-label','3. pozíció: Rózsaszín – Nincs benne');
  if(repeats)await expect(a.locator('.feedback-peg').nth(4)).toHaveAttribute('aria-label','5. pozíció: Piros – Többlet');
  await expect(b.locator('.feedback-peg')).toHaveCount(0);
  await enter(b,secret);await b.getByRole('button',{name:'Tipp beküldése'}).click();
  await expect(a.getByRole('button',{name:'1. pozíció: Piros – fix találat',exact:true})).toBeDisabled();
  await expect(a.locator('.slot .empty')).toHaveCount(5);
  await expect(a.getByRole('button',{name:'Kék',exact:true})).toHaveClass('known-remaining');
  await expect(a.getByRole('button',{name:'Rózsaszín',exact:true})).toHaveClass('known-absent');
  await expect(a.getByRole('button',{name:'Piros',exact:true})).toHaveClass('known-fixed');
  if(!repeats)await expect(a.getByRole('button',{name:'Piros',exact:true})).toBeDisabled();
  await a.getByRole('button',{name:'Kék',exact:true}).click();await a.getByRole('button',{name:'Törlés',exact:true}).click();await expect(a.locator('.slot.confirmed-fixed')).toHaveCount(1);await expect(a.locator('.slot .empty')).toHaveCount(5);
  await a.reload();await expect(a.locator('.slot.confirmed-fixed')).toHaveCount(1);await expect(a.getByRole('button',{name:'Kék',exact:true})).toHaveClass('known-remaining');
  expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await a.locator('.history').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const boxes=await a.locator('.slot').evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right})));for(let i=1;i<boxes.length;i++)expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i-1].right);
  await a.screenshot({path:`test-results/helper-mobile-${repeats}.png`,fullPage:true});
  await a.setViewportSize({width:1440,height:1050});await a.screenshot({path:`test-results/helper-desktop-${repeats}.png`,fullPage:true});
  await enter(a,secret.slice(1));await a.getByRole('button',{name:'Tipp beküldése'}).click();
  await enter(b,secret);await b.getByRole('button',{name:'Tipp beküldése'}).click();await expect(a.getByRole('heading',{name:'Győzelem!'})).toBeVisible();
  await a.getByRole('button',{name:'Jöhet a visszavágó'}).click();await b.getByRole('button',{name:'Visszavágó elfogadása'}).click();
  await expect(a.locator('.pill')).toContainText('Segítő mód');await expect(a.locator('.slot .empty')).toHaveCount(6);await expect(a.locator('.slot.confirmed-fixed')).toHaveCount(0);await expect(a.locator('.feedback-peg')).toHaveCount(0);
  expect(errors).toEqual([]);
 }finally{await ca.close();await cb.close();}
});
