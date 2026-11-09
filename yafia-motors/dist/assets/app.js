const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.nav-links');
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu){menu.setAttribute('aria-expanded','false');nav?.classList.remove('open');}});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');}));
if('IntersectionObserver' in window){const ob=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');ob.unobserve(e.target);}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('will-reveal');ob.observe(el);});}
const dialog=document.querySelector('#photo-dialog');
document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{dialog.querySelector('img').src=button.dataset.photo;dialog.querySelector('img').alt=button.querySelector('img').alt;dialog.showModal();}));
dialog?.querySelector('button').addEventListener('click',()=>dialog.close());
dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
document.querySelector('#contact-form')?.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);const ar=document.documentElement.lang==='ar';const text=ar?`مرحباً يافا موتورز، اسمي ${data.get('name')}. السيارة: ${data.get('vehicle')}. الخدمة: ${data.get('service')}. ${data.get('message')}`:`שלום יפיע מוטורס, שמי ${data.get('name')}. רכב: ${data.get('vehicle')}. שירות מבוקש: ${data.get('service')}. ${data.get('message')}`;window.open('https://wa.me/972506520081?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');});
