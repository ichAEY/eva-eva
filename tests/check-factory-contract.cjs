#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadSiteData,validateSiteData}=require('./validate-site-data.cjs');

const root=path.resolve(__dirname,'..');
const data=loadSiteData(path.join(root,'site-data.js'));
assert.deepEqual(validateSiteData(data,{rootDir:root}),[],'the distributed template must satisfy its schema');

const starter=loadSiteData(path.join(root,'site-data.blank.js'));
const agentRules=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
const chatEntry=fs.readFileSync(path.join(root,'START_HERE.md'),'utf8');
const mediaRules=fs.readFileSync(path.join(root,'RULES.md'),'utf8');
const factoryGuide=fs.readFileSync(path.join(root,'docs/FACTORY_GUIDE.md'),'utf8');
const inputChecklist=fs.readFileSync(path.join(root,'docs/INPUT_CHECKLIST.md'),'utf8');
const projectPrompt=fs.readFileSync(path.join(root,'docs/PROJECT_PROMPT.md'),'utf8');
for(const token of ['START_HERE.md','RULES.md','docs/FACTORY_GUIDE.md','docs/INPUT_CHECKLIST.md','site-data.blank.js']){
  assert(agentRules.includes(token),`AGENTS.md must direct a new agent to ${token}`);
}
for(const token of ['RULES.md','docs/INPUT_CHECKLIST.md','docs/FACTORY_GUIDE.md','salon.heroDescription','salon.about']){
  assert(chatEntry.includes(token),`START_HERE.md must preserve the ordinary Chat workflow token: ${token}`);
}
assert(projectPrompt.includes('START_HERE.md'),'the ordinary Chat project prompt must direct ChatGPT to START_HERE.md');
assert(projectPrompt.includes('одним сообщением'),'the ordinary Chat project prompt must request missing data in one consolidated message');
assert(inputChecklist.includes('Явный список услуг из чата является окончательным источником правды'),'the input contract must keep the explicit service list authoritative');
assert(factoryGuide.includes("country: 'RU'")&&factoryGuide.includes("locales: ['ru', 'en']"),'the factory guide must document the Russian RU/EN contract');
for(const token of ['logo.webp','master.00000.webp','masterpc.00000.webp','gallery.00000.webp','favicon-source.png']){
  assert(mediaRules.includes(token),`RULES.md must preserve canonical media token: ${token}`);
}
assert(Object.prototype.hasOwnProperty.call(starter.media,'heroDesktop'),'starter media must expose optional heroDesktop for masterpc.00000.webp');
assert.equal(starter.mode,'template','blank starter cannot be published by accident');
assert.deepEqual([...starter.services],[],'new customer sites must start without example services');
assert.equal(starter.salon.heroDescription.ru,'Ваша красота. Ваша уверенность.','blank starter must preserve the approved desktop slogan');
assert(starter.salon.about.ru.startsWith('В основе нашей работы — профессиональный подход'),'blank starter must preserve the approved universal About copy');
assert.deepEqual(validateSiteData(starter,{rootDir:root}),[],'blank starter must have valid schema');

// A client repository starts with the exact blank factory data and then moves
// to a validated production catalog. Only the factory preview has four demos.
if(data.mode==='template'){
  assert.equal(fs.readFileSync(path.join(root,'site-data.js'),'utf8'),fs.readFileSync(path.join(root,'site-data.blank.js'),'utf8'),'an unpublished client draft must be the exact blank starter');
}else{
  assert.equal(data.mode,'production','a populated client must explicitly enter production mode');
  assert(data.services.length>0,'production must have real services');
}
const unsafe=structuredClone(starter);
unsafe.mode='production';
const unsafeErrors=validateSiteData(unsafe,{rootDir:root});
assert(unsafeErrors.length>0,'the blank starter must never pass production validation');
assert(unsafeErrors.some(error=>error.includes('booking method')),'production mode must require a booking method');

const ready=loadSiteData(path.join(root,'tests/fixtures/site-data.production.js'));
assert.deepEqual(validateSiteData(ready,{rootDir:root,allowTestDomains:true}),[],'a complete production fixture must pass');
assert(validateSiteData(ready,{rootDir:root}).some(error=>error.includes('test domain')),'test domains must never pass a real client release');
// A Russian salon must not need Armenian; Uzbek and Tajik salons must supply their own third language.
for(const [country,locales] of Object.entries({RU:['ru','en'],AM:['ru','en','hy'],UZ:['ru','en','uz'],TJ:['ru','en','tg']})){
  const sample=structuredClone(ready);
  sample.country=country;sample.locales=locales;
  const augment=value=>{
    if(!value||typeof value!=='object')return;
    if(typeof value.ru==='string'&&typeof value.en==='string'){
      if(country==='UZ')value.uz=value.en;
      if(country==='TJ')value.tg=value.en;
      return;
    }
    if(Array.isArray(value))value.forEach(augment);
    else Object.values(value).forEach(augment);
  };
  augment(sample);
  assert.deepEqual(validateSiteData(sample,{rootDir:root,allowTestDomains:true}),[],`${country} locale schema should accept its supported languages`);
  const context={window:{TANEM_SITE_DATA:sample}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'site-regions.js'),'utf8'),context);
  assert.deepEqual(Array.from(context.window.TANEM_REGION.locales),locales,`${country} switcher languages`);
  assert.equal(context.window.TANEM_REGION.teamHeading('ru'),'Наша команда');
  assert.equal(context.window.TANEM_REGION.teamHeading(locales.at(-1)),locales.at(-1)==='ru'?'Наша команда':'Our Team');
  if(country==='RU'){
    const invalid=structuredClone(sample);invalid.locales=['ru','en','hy'];
    assert(validateSiteData(invalid,{rootDir:root,allowTestDomains:true}).some(e=>e.includes('exactly ru, en')),'Russia must not expose HY');
  }
  if(country==='UZ'||country==='TJ'){
    const invalid=structuredClone(sample);invalid.salon.name[locales[2]]='';
    assert(validateSiteData(invalid,{rootDir:root,allowTestDomains:true}).some(e=>e.includes(`salon.name.${locales[2]}`)),'Missing regional salon name must fail release');
  }
}
ready.reviews[0].rating=4;
assert(validateSiteData(ready,{rootDir:root,allowTestDomains:true}).some(error=>error.includes('only five-star reviews')),'non-five-star reviews must be rejected');

const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const desktop=fs.readFileSync(path.join(root,'desktop.js'),'utf8');
const mobile=fs.readFileSync(path.join(root,'mobile.js'),'utf8');
assert(index.indexOf('site-data.js')<index.indexOf("desktop?'desktop.js"),'site-data.js must load before either UI bundle');
assert(index.includes('site-runtime.js'),'the production hydration runtime must load');
assert(index.includes("matchMedia('(min-width:1024px)').matches"),'wide touch devices must use the desktop layout');
assert(index.includes('(hover:hover) and (pointer:fine), (min-width:1024px)'),'wide touch devices must receive desktop styles');
assert(desktop.includes('SITE.services.filter'),'desktop services must come from the unified source');
assert(desktop.includes('DESKTOP_SERVICE_TABS.length<=5'),'desktop must stretch All plus up to four real categories');
assert(mobile.includes('SITE.services.map'),'mobile services must come from the unified source');
assert(!mobile.includes('SERVICE_CATS.length>0&&SERVICE_CATS.length<=4'),'mobile must not force 1-4 categories into equal-width compact cells');
const mobileCategoryCSS=fs.readFileSync(path.join(root,'mobile-overrides.css'),'utf8');
assert(mobileCategoryCSS.includes('grid-template-columns:none!important')&&mobileCategoryCSS.includes('flex:0 0 auto!important')&&mobileCategoryCSS.includes('overflow-x:auto!important'),
  'mobile service categories must use natural Esmeralda pill widths with horizontal scrolling at any count');
assert(desktop.includes('В основе нашей работы — профессиональный подход'),'desktop About must contain the approved universal copy');
assert(!desktop.includes("locales:['ru','en','hy']"),'desktop fallback must not expose Armenian for the default template');
assert(!mobile.includes("locales:['ru','en','hy']"),'mobile fallback must not expose Armenian for the default template');

console.log('PASS: schema, release blockers, unified services, and wide-touch routing are enforced');
