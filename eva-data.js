(function(global){
  'use strict';
  const data=global.TANEM_SITE_DATA;
  const salonName=data?.salon?.name?.ru||data?.salon?.name;
  if(data?.mode!=='production'||salonName!=='EVA')return;

  data.salon.heroAddress={ru:'Павлино, 69',en:'Pavlino, 69'};
  data.salon.contactAddress={ru:'Балашиха, Павлино, 69',en:'Balashikha, Pavlino, 69'};
  data.schedule.fallback={
    ...(data.schedule.fallback||{}),
    ru:'Ежедневно, 10:00–21:00',
    en:'Daily, 10:00–21:00'
  };
  data.media.logo='';
  data.media.about='gallery.00000.webp';
  data.team=[1,2,3,4].map(number=>({
    id:`master-${number}`,
    name:{ru:`Мастер ${number}`,en:`Specialist ${number}`},
    role:{ru:'Специалист салона',en:'Salon specialist'},
    about:{ru:'',en:''},
    categories:[],
    work:[],
    reviewIds:[]
  }));
})(window);
