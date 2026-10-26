/* Films and parallax follow scroll position. Section entrances play once on
   arrival; the original testimonial columns have their own pausable motion. */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const scenes=[...document.querySelectorAll('[data-scroll-scene]')].map(section=>({
    section, frame:section.querySelector('.hero, .pitch-cutout-media'),
    video:section.querySelector('video'), ready:false, target:0
  }));
  const clamp=n=>Math.max(0,Math.min(1,n));
  const inView=(node)=>{const r=node.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;};
  function seek(scene){
    if(!scene.ready||scene.video.seeking||Math.abs(scene.video.currentTime-scene.target)<1/96)return;
    scene.video.currentTime=scene.target;
  }
  function update(){
    const navHeight=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    document.getElementById('navbar')?.classList.toggle('scrolled',scrollY>20);
    for(const scene of scenes){
      if(scene.section.closest('#main-site')?.style.display==='none')continue;
      const rect=scene.section.getBoundingClientRect();
      const top=navHeight+(scene.section.dataset.scrollScene==='ground'?12:0);
      const distance=Math.max(1,scene.section.offsetHeight-scene.frame.offsetHeight);
      const p=reduced.matches?0:clamp((top-rect.top)/distance);
      scene.section.style.setProperty('--scene-p',p.toFixed(5));
      if(scene.section.dataset.scrollScene==='hero'){
        scene.section.style.setProperty('--copy-y',`${p*(innerWidth<641?-22:-65)}px`);
        scene.section.style.setProperty('--video-y',`${p*15}px`);
      }else scene.section.style.setProperty('--ground-radius',`${(1-p)*(innerWidth<641?100:160)}px`);
      if(scene.ready){scene.target=p*Math.max(0,scene.video.duration-1/24);seek(scene);}
    }
    const marquee=document.querySelector('.marquee-strip');
    if(marquee){const r=marquee.getBoundingClientRect();const p=clamp((innerHeight-r.top)/(innerHeight+r.height));marquee.style.setProperty('--marquee-x',`${reduced.matches?0:-20-p*250}px`);}
    for(const player of document.querySelectorAll('.about-player')){
      const section=player.closest('section'),r=section.getBoundingClientRect();
      const p=clamp((innerHeight-r.top)/(innerHeight+r.height));
      player.style.setProperty('--parallax-y',`${reduced.matches?0:12-50*p}px`);
    }
    for(const image of document.querySelectorAll('.gallery-item img')){
      const card=image.closest('.gallery-item');if(!inView(card))continue;
      const r=card.getBoundingClientRect(),p=clamp((innerHeight-r.top)/(innerHeight+r.height));
      image.style.setProperty('--parallax-y',`${reduced.matches?0:12-24*p}px`);
    }
  }
  let scheduled=false;
  function requestUpdate(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update();});}
  for(const scene of scenes){
    const video=scene.video;video.pause();
    video.addEventListener('loadedmetadata',()=>{scene.ready=Number.isFinite(video.duration);requestUpdate();});
    video.addEventListener('seeked',()=>seek(scene));
    video.addEventListener('play',()=>video.pause());
    if(video.readyState>=1){scene.ready=Number.isFinite(video.duration);}
  }
  addEventListener('scroll',requestUpdate,{passive:true});
  addEventListener('resize',requestUpdate,{passive:true});
  addEventListener('pageshow',requestUpdate);
  reduced.addEventListener('change',requestUpdate);
  const main=document.getElementById('main-site');
  new MutationObserver(requestUpdate).observe(main,{attributes:true,attributeFilter:['style']});
  const gallery=document.getElementById('gallery-scroll-container');
  if(gallery)new MutationObserver(requestUpdate).observe(gallery,{childList:true});
  // First-visit entrances: opposing sides, short staggers, then settled content.
  // Individual translate composes with existing parallax and sticky transforms.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('entered');
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.06, rootMargin: '0px 0px -5% 0px' });
    function entrance(selector, direction, stagger = 70) {
      document.querySelectorAll(selector).forEach((node, index) => {
        if (node.hasAttribute('data-enter')) return;
        node.dataset.enter = Array.isArray(direction) ? direction[index % direction.length] : direction;
        node.style.setProperty('--enter-delay', `${Math.min(index % 6 * stagger, 280)}ms`);
        revealObserver.observe(node);
      });
    }
    function registerEntrances() {
      entrance('.hero-badge,.hero h1>span,.hero-subtitle,.hero-ctas', ['left','left','right','left','up'], 65);
      entrance('.hero-footline', 'up');
      entrance('.about-visual', 'left');
      entrance('.about-content>.section-label,.about-content>.section-title,.about-content>p', ['right','right','left','right'], 70);
      entrance('.stat-box', ['up','up','up','up'], 65);
      entrance('.facilities-header>.section-label,.gallery-header>.section-label,.testimonials-header>.section-label,.pitch-kicker', 'left');
      entrance('.facilities-header>.section-title,.gallery-header>.section-title,.testimonials-header>.section-title,.pitch-pills', 'right');
      entrance('.facility-card', ['left','up','right'], 75);
      entrance('.pitch-card', ['left','up','right'], 75);
      entrance('.pitch-story-copy>.section-title', 'left');
      entrance('.pitch-copy-columns>p', ['left','right']);
      entrance('.pitch-side-note', 'right');
      entrance('.gallery-item', ['left','right','up'], 90);
      entrance('.testimonials-column', ['left','up','right'], 90);
      entrance('.testimonials-controls', 'up');
      entrance('.booking-inner>.section-label,.booking-inner>.section-title,.booking-inner>p', 'left', 75);
      entrance('.booking-tabs,.booking-form', 'right', 60);
      entrance('.booking-status-link-card', 'up');
      entrance('.contact-inner>div>.section-label,.contact-inner>div>.section-title', 'left');
      entrance('.contact-item', ['left','right'], 65);
      entrance('.social-row', 'up');
      entrance('.contact-inner>.reveal-right', 'right');
      entrance('.footer-wordmark', 'left');
      entrance('.footer-inner,.footer-bottom', 'up', 70);
      entrance('.tsec-header .section-label,.tsec-header .section-title', ['left','right']);
      entrance('.tournament-card', ['left','up','right'], 70);
    }
    registerEntrances();
    document.documentElement.classList.add('motion-ready');
    // CMS cards can arrive after the first page render.
    for (const node of document.querySelectorAll('#gallery-scroll-container,#testimonials-container,.tsec-content')) {
      new MutationObserver(registerEntrances).observe(node, { childList: true, subtree: true });
    }
    document.addEventListener('focusin', event => {
      const node = event.target.closest('[data-enter]');
      if (node) { node.classList.add('entered'); revealObserver.unobserve(node); }
    });
  }
  const testimonials = document.getElementById('testimonials');
  if (testimonials) {
    let visible = false;
    const syncTestimonials = () => testimonials.classList.toggle('testimonials-active', visible && !document.hidden);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncTestimonials();
    }, { threshold: 0.04 }).observe(testimonials);
    document.addEventListener('visibilitychange', syncTestimonials);
  }
  // Keep existing tab groups and their click behavior, with complete keyboard semantics.
  const groups=[
    {buttons:[...document.querySelectorAll('[data-booking-tab]')],attribute:'bookingTab',panel:key=>document.getElementById('booking-panel-'+key)},
    {buttons:[...document.querySelectorAll('[data-tournament-tab-button]')],attribute:'tournamentTabButton',panel:key=>document.getElementById('tsec-'+key)}
  ];
  for(const group of groups){
    group.buttons[0]?.parentElement.setAttribute('role','tablist');
    function sync(){for(const button of group.buttons){
      const key=button.dataset[group.attribute],panel=group.panel(key),active=button.classList.contains('active');
      button.id ||= 'tab-'+group.attribute+'-'+key;
      button.setAttribute('role','tab');button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      if(panel){button.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);}
    }}
    for(const [i,button] of group.buttons.entries()){
      new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['class']});
      button.addEventListener('keydown',event=>{
        const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;
        event.preventDefault();let next=event.key==='Home'?0:event.key==='End'?group.buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+group.buttons.length)%group.buttons.length;
        group.buttons[next].click();group.buttons[next].focus();
      });
    }
    sync();
  }
  // Trap focus only while an existing dialog is open, and restore it on dismissal.
  for(const overlay of document.querySelectorAll('.t-modal-overlay,.lightbox-overlay')){
    let previous=null;const dialog=overlay.querySelector('.t-modal,.lightbox-content');
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    if(dialog.classList.contains('lightbox-content'))dialog.setAttribute('aria-label','Gallery image');
    const focusables=()=>[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(el=>el.offsetParent!==null&&!el.disabled);
    new MutationObserver(()=>{
      const open=overlay.classList.contains('open');overlay.setAttribute('aria-hidden',String(!open));
      if(open){previous=document.activeElement;focusables()[0]?.focus({preventScroll:true});}
      else if(previous?.offsetParent!==null)previous?.focus({preventScroll:true});
    }).observe(overlay,{attributes:true,attributeFilter:['class']});
    overlay.setAttribute('aria-hidden','true');
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;const list=focusables();if(!list.length)return;
      const first=list[0],last=list.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
  }
  update();
})();
