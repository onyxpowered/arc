// Arc 1 Loading: the loading screen, shared by the app window and the exported client.
// The logo over a progress track; "Designed & Built by Onyx" bottom-left; "Powered by <your Firebase project>" bottom-right,
// whose Console button opens a QR that sends you to that project in the Firebase console.
import { Mark } from '../Mark.js';
import { Qr } from '../Qr.js';

const Sheet = `
#brand-load { --ease: cubic-bezier(.22, 1, .36, 1); position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; flex-direction: column; background: #000; color: #e8eaed; user-select: none; font: 400 12px/1.3 Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; transition: opacity .55s ease; }
#brand-load .ld-logo { position: absolute; left: 50%; bottom: calc(50% + 24px); transform: translateX(-50%); width: min(120px, 34vw); display: flex; justify-content: center; opacity: 0; transition: opacity .55s ease; color: #fff; }
#brand-load .ld-logo svg { width: 100%; height: auto; display: block; }
#brand-load .ld-track { position: absolute; left: 50%; top: calc(50% + 8px); transform: translateX(-50%); width: min(210px, 50vw); height: 7px; background: #0F0F0F; border-radius: 999px; overflow: hidden; opacity: 0; transition: opacity .55s ease; }
#brand-load .ld-track i { display: block; height: 5px; width: 0; margin: 1px; background: #fff; border-radius: 999px; max-width: calc(100% - 2px); transition: width .35s var(--ease); }
#brand-load.ld-in .ld-logo, #brand-load.ld-in .ld-track { opacity: 1; }
#brand-load.ld-done { opacity: 0; pointer-events: none; }
#brand-load .ld-foot { position: absolute; opacity: 0; color: #878787; transition: opacity .35s ease; }
#brand-load.ld-in .ld-foot { opacity: 1; }
#brand-load .ld-foot-l { left: 17px; bottom: 17px; display: flex; flex-direction: column; gap: 3px; }
#brand-load .ld-foot-l b { font-weight: 500; }
#brand-load .ld-foot-r { right: 20px; bottom: 16px; display: flex; align-items: center; gap: 6px; }
#brand-load .ld-foot-r b { font-weight: 500; color: #b5b5b5; }
#brand-load .ld-status { font: inherit; color: inherit; background: none; border: 0; border-radius: 0; padding: 0 0 1px; border-bottom: 1px solid currentColor; cursor: pointer; transition: color .25s ease; outline: none; -webkit-tap-highlight-color: transparent; }
#brand-load .ld-foot-r.ld-open .ld-status, #brand-load .ld-status:hover, #brand-load .ld-status:focus-visible { color: #fff; }
#brand-load .ld-qr { position: absolute; right: -6px; bottom: 30px; width: 196px; padding: 11px; border-radius: 10px; background: #0F0F0F; display: block; transform-origin: calc(100% - 40px) 100%; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(18px) scale(.5); filter: blur(6px); will-change: transform, opacity, filter; transition: opacity .2s cubic-bezier(.4, 0, .6, 1), transform .26s cubic-bezier(.5, 0, .75, 0), filter .2s ease, visibility 0s .26s; }
#brand-load .ld-qr::after { content: ''; position: absolute; right: 34px; bottom: -6px; width: 14px; height: 14px; background: #0F0F0F; transform: rotate(45deg); border-radius: 3px; }
#brand-load .ld-qr svg { display: block; width: 174px; height: 174px; position: relative; z-index: 1; }
#brand-load .ld-qr small { display: block; position: relative; z-index: 1; margin-top: 8px; text-align: center; color: #878787; word-break: break-all; }
#brand-load .ld-foot-r.ld-open .ld-qr { opacity: 1; visibility: visible; pointer-events: auto; transform: none; filter: blur(0); transition: opacity .22s cubic-bezier(.22, 1, .36, 1), transform .55s cubic-bezier(.34, 1.45, .5, 1), filter .3s ease, visibility 0s; }
@media (prefers-reduced-motion: reduce) { #brand-load .ld-qr, #brand-load .ld-foot-r.ld-open .ld-qr { transition: opacity .1s linear, visibility 0s; transform: none; filter: none; } #brand-load .ld-track i { transition: none; } }
`;

const Escape = Text => String(Text).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');

function Code(Link) {
  const Grid = Qr(Link);
  if (!Grid) return '';
  const Cell = 6;
  let Draw = '';
  Grid.forEach((Row, Y) => Row.forEach((On, X) => { if (On) Draw += `M${X * Cell} ${Y * Cell}h${Cell}v${Cell}h-${Cell}z`; }));
  return `<svg viewBox="-12 -12 ${Grid.length * Cell + 24} ${Grid.length * Cell + 24}" shape-rendering="crispEdges" role="img" aria-label="QR code"><path fill="#fff" d="${Draw}"/></svg>`;
}

export const Console = Id => (Id ? `https://console.firebase.google.com/project/${encodeURIComponent(Id)}/overview` : 'https://console.firebase.google.com/');

// Id: the Firebase project id (or empty before one is chosen)
export function Loading(Id) {
  const Style = document.createElement('style');
  Style.textContent = Sheet;
  document.head.appendChild(Style);
  const Root = document.createElement('div');
  Root.id = 'brand-load';
  Root.innerHTML = `<div class="ld-logo"><svg viewBox="${Mark.Box}" role="img" aria-label="Arc"><path fill="currentColor" d="${Mark.Shape}"/></svg></div>
<div class="ld-track"><i id="ld-fill"></i></div>
<div class="ld-foot ld-foot-l"><b>Arc 1</b><span>Designed &amp; Built by Onyx.</span></div>
<div class="ld-foot ld-foot-r"><span>Powered by <b class="ld-project"></b></span><button class="ld-status" type="button" aria-expanded="false">Console</button><a class="ld-qr" target="_blank" rel="noopener"></a></div>`;
  document.body.appendChild(Root);

  const Foot = Root.querySelector('.ld-foot-r'), Button = Root.querySelector('.ld-status'), Card = Root.querySelector('.ld-qr');
  const Open = On => { Foot.classList.toggle('ld-open', On); Button.setAttribute('aria-expanded', On ? 'true' : 'false'); };
  Button.addEventListener('pointerdown', Event => { if (Event.button) return; Event.preventDefault(); Event.stopPropagation(); Open(!Foot.classList.contains('ld-open')); });
  Root.addEventListener('click', Event => { if (!Foot.contains(Event.target)) Open(false); });
  document.addEventListener('keydown', function Escape_(Event) { if (!Root.isConnected) return document.removeEventListener('keydown', Escape_); if (Event.key === 'Escape') Open(false); });

  const Name = Next => {
    const Link = Console(Next);
    Root.querySelector('.ld-project').textContent = Next || 'Firebase';
    Card.href = Link;
    Card.innerHTML = Code(Link) + `<small>${Escape(Link.replace('https://', ''))}</small>`;
  };
  Name(Id);
  setTimeout(() => Root.classList.add('ld-in'), 150);

  return {
    Name,
    Step: Fraction => { Root.querySelector('#ld-fill').style.width = Math.max(0, Math.min(1, Fraction)) * 100 + '%'; },
    Finish: () => { Root.classList.add('ld-done'); setTimeout(() => { Root.remove(); Style.remove(); }, 700); },
  };
}
