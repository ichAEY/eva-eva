(function(global){
  'use strict';

  const data=global.TANEM_SITE_DATA;
  if(!data||data.mode!=='production'||data.salon?.name?.ru!=='EVA')return;

  // EVA uses a typographic wordmark. Keep the canonical logo asset in the
  // repository for validation, but do not substitute the header text with it.
  if(data.media)data.media.logo='';

  const locale=()=>{
    const raw=(document.body.dataset.brLang||document.documentElement.lang||data.defaultLocale||'ru').toLowerCase();
    return data.locales.includes(raw)?raw:(data.defaultLocale||'ru');
  };
  const localized=(value,lang=locale())=>{
    if(value==null)return '';
    if(typeof value==='string')return value;
    return value[lang]??value[data.defaultLocale||'ru']??value.ru??value.en??'';
  };

  function applyWordmark(lang){
    const name=localized(data.salon.name,lang);
    const desktop=document.querySelector('.std-header-brand-main');
    if(desktop){
      desktop.classList.remove('has-logo');
      desktop.removeAttribute('style');
      desktop.textContent=name;
    }
    const mobile=document.querySelector('#salon-mobile .tn22-brand');
    if(mobile){
      mobile.classList.remove('br-logo-brand');
      mobile.textContent=name;
      mobile.setAttribute('aria-label',name);
    }
  }

  function applyAddresses(lang){
    const hero=localized(data.salon.heroAddress,lang)||localized(data.salon.address,lang);
    const contact=localized(data.salon.contactAddress,lang)||localized(data.salon.address,lang);

    const desktopHero=document.querySelector('#salonDesktopTop .std-address');
    if(desktopHero)desktopHero.textContent=hero;

    const sticky=document.querySelector('#salonDesktopServices .dct-service-sticky-route');
    if(sticky){
      const title=sticky.querySelector('b');
      const sub=sticky.querySelector('small');
      if(title)title.textContent=localized(data.salon.city,lang);
      if(sub)sub.textContent=hero;
    }

    const desktopAddress=document.querySelector('#salonDesktopContacts .std-contact-list > .std-contact-card:first-child');
    if(desktopAddress){
      const title=desktopAddress.querySelector('.std-contact-card-title');
      const sub=desktopAddress.querySelector('.std-contact-card-sub');
      if(title)title.textContent=contact;
      if(sub)sub.textContent=hero;
    }

    const mobileHero=document.querySelector('#salon-mobile .tn37-location .tn37-info-copy');
    if(mobileHero)mobileHero.innerHTML='<strong>'+hero+'</strong>';

    const mobileAddress=document.querySelector('#salon-mobile #tn13Visit .tn22-contact-grid > .tn22-contact:first-child');
    if(mobileAddress){
      const title=mobileAddress.querySelector('strong');
      const sub=mobileAddress.querySelector('strong + span');
      if(title)title.textContent=contact;
      if(sub)sub.textContent=hero;
    }
  }

  function applyContacts(lang){
    const fullSchedule=localized(data.schedule.fallback,lang);
    const desktopCards=document.querySelectorAll('#salonDesktopContacts .std-contact-list > .std-contact-card');
    const mobileCards=document.querySelectorAll('#salon-mobile #tn13Visit .tn22-contact-grid > .tn22-contact');

    if(!data.contacts.messengerUrl){
      if(desktopCards[2])desktopCards[2].hidden=true;
      if(mobileCards[2])mobileCards[2].hidden=true;
    }

    const desktopHours=document.querySelector('#stdContactHoursSub');
    if(desktopHours)desktopHours.textContent=fullSchedule;
    const mobileHours=document.querySelector('#salon-mobile #tn13Visit .tn22-contact-grid > :last-child span:last-child span');
    if(mobileHours)mobileHours.textContent=fullSchedule;
  }

  function apply(){
    const lang=locale();
    applyWordmark(lang);
    applyAddresses(lang);
    applyContacts(lang);
  }

  global.addEventListener('salon-template:languagechange',()=>global.setTimeout(apply,0));
  apply();
  [100,350,850].forEach(delay=>global.setTimeout(apply,delay));
})(window);
