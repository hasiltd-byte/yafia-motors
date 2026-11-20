'use client';
import { useEffect } from 'react';
export default function PublicInteractions() {
  useEffect(() => {
    const controller = new AbortController(),
      options = { signal: controller.signal };
    const menu = document.querySelector<HTMLButtonElement>('.menu-toggle'),
      nav = document.querySelector('.nav-links');
    const close = () => {
      menu?.setAttribute('aria-expanded', 'false');
      nav?.classList.remove('open');
    };
    menu?.addEventListener(
      'click',
      () => {
        const open = menu.getAttribute('aria-expanded') !== 'true';
        menu.setAttribute('aria-expanded', String(open));
        nav?.classList.toggle('open', open);
      },
      options,
    );
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') close();
      },
      options,
    );
    nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', close, options));
    const ob = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            ob.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      document.querySelectorAll('.reveal').forEach((el) => {
        el.classList.add('will-reveal');
        ob.observe(el);
      });
    const dialog = document.querySelector<HTMLDialogElement>('#photo-dialog');
    document.querySelectorAll<HTMLElement>('[data-photo]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          const img = dialog?.querySelector('img');
          if (img) {
            img.src = button.dataset.photo!;
            img.alt = button.querySelector('img')?.alt || '';
            dialog?.showModal();
          }
        },
        options,
      ),
    );
    dialog?.querySelector('button')?.addEventListener('click', () => dialog.close(), options);
    dialog?.addEventListener(
      'click',
      (e) => {
        if (e.target === dialog) dialog.close();
      },
      options,
    );
    document.querySelector<HTMLFormElement>('#contact-form')?.addEventListener(
      'submit',
      (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget as HTMLFormElement);
        const ar = document.documentElement.lang === 'ar';
        const text = ar
          ? `مرحباً يافا موتورز، اسمي ${data.get('name')}. السيارة: ${data.get('vehicle')}. الخدمة: ${data.get('service')}. ${data.get('message')}`
          : `שלום יפיע מוטורס, שמי ${data.get('name')}. רכב: ${data.get('vehicle')}. שירות מבוקש: ${data.get('service')}. ${data.get('message')}`;
        window.open(
          'https://wa.me/972506520081?text=' + encodeURIComponent(text),
          '_blank',
          'noopener,noreferrer',
        );
      },
      options,
    );
    return () => {
      controller.abort();
      ob.disconnect();
    };
  }, []);
  return null;
}
