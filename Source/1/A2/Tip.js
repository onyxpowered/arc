// Arc 1 Tip: the status site's popup, ported from its app.js. Hover on desktop, tap on touch, focus for keyboards; the first open waits a beat,
// a close waits a beat, and once it is open, moving to another target glides straight there. The card springs out of the tail tip.
// Describe(target) answers {Title, Notes: [{Tone: ok|error|warning|info, Icon, Text, Detail}], Heading, Lines: [text]} or null for no popup.

const Pointer = '<div class="pointer-container"><svg width="16" height="15" viewBox="0 0 15.3 15" overflow="visible" aria-hidden="true"><g transform="matrix(1 0 0 -1 0 15)"><path class="tail-fill" d="M10.26 13.385C9.11 15.415 6.19 15.415 5.04 13.385L0 4.477C-1.13 2.477 .31 0 2.61 0H12.69C14.99 0 16.43 2.477 15.3 4.477L10.26 13.385Z"/><path class="tail-line" fill="none" d="M0 4.477L5.04 13.385C6.19 15.415 9.11 15.415 10.26 13.385L15.3 4.477"/></g></svg></div>';
const OpenDelay = 160, CloseDelay = 110;
const Clean = Text => String(Text).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');

export function Tip() {
  let Root = document.getElementById('uptime-tooltip');
  if (!Root) {
    Root = document.createElement('div');
    Root.id = 'uptime-tooltip';
    Root.innerHTML = Pointer + '<div class="tooltip-box"><div class="tooltip-content"></div></div>';
    document.body.appendChild(Root);
  }
  const Content = Root.querySelector('.tooltip-content');
  let OpenTimer = 0, CloseTimer = 0;
  const Clear = () => { clearTimeout(OpenTimer); clearTimeout(CloseTimer); OpenTimer = CloseTimer = 0; };
  const Hide = () => { Clear(); Root.classList.remove('open'); };

  function Fill(Info) {
    const Notes = (Info.Notes || []).map(Note => Note.Detail
      ? `<div class="outage-field note tone-${Note.Tone}"><span class="label"><i class="gi gi-${Note.Icon}"></i> ${Clean(Note.Text)}</span> <span class="duration">${Clean(Note.Detail)}</span></div>`
      : `<div class="no-outages-msg note tone-${Note.Tone}"><i class="gi gi-${Note.Icon}"></i><span class="text">${Clean(Note.Text)}</span></div>`).join('');
    const Lines = (Info.Lines || []).length ? `<div class="related-events"><h3 id="related-event-header">${Clean(Info.Heading || '')}</h3><ul>${Info.Lines.map(Line => `<li>${Clean(Line)}</li>`).join('')}</ul></div>` : '';
    Content.innerHTML = `<div class="date">${Clean(Info.Title)}</div><div class="outages">${Notes}</div>${Lines}`;
  }

  function Show(Target, Info) {
    Fill(Info);
    // the card springs out of the tail tip; moving between targets while it is open glides it across instead of closing and reopening
    const Was = Root.classList.contains('open');
    if (!Was) Root.classList.add('snap');
    const Box = Root.querySelector('.tooltip-box'), Tail = Root.querySelector('.pointer-container'), Rect = Target.getBoundingClientRect(), Wide = Box.offsetWidth;
    const Center = Rect.left + Rect.width / 2 + scrollX, Left = Math.max(8, Math.min(Center - Wide / 2, scrollX + document.documentElement.clientWidth - Wide - 8)), TipY = Rect.bottom + scrollY + 6;
    Tail.style.left = `${Center}px`; Tail.style.top = `${TipY}px`; Box.style.left = `${Left}px`; Box.style.top = `${TipY + 10}px`;
    Root.style.transformOrigin = `${Center}px ${TipY}px`;
    if (!Was) { void Root.offsetWidth; Root.classList.remove('snap'); }
    Root.classList.add('open');
  }

  function Bind(Container, Selector, Describe) {
    const Of = Event => (Event.target.closest ? Event.target.closest(Selector) : null);
    const Open = Target => { const Info = Describe(Target); if (Info) Show(Target, Info); else Hide(); };
    const Hover = Target => {
      clearTimeout(CloseTimer); CloseTimer = 0;
      if (Root.classList.contains('open')) { clearTimeout(OpenTimer); OpenTimer = 0; Open(Target); return; }
      clearTimeout(OpenTimer); OpenTimer = setTimeout(() => { OpenTimer = 0; Open(Target); }, OpenDelay);
    };
    const Leave = () => { clearTimeout(OpenTimer); OpenTimer = 0; clearTimeout(CloseTimer); CloseTimer = setTimeout(Hide, CloseDelay); };
    // after a scroll the browser re-fires hover on whatever is under a parked pointer; ignore that until the pointer really moves
    let Point = { x: -1, y: -1 }, Quiet = null;
    document.addEventListener('mousemove', Event => {
      Point = { x: Event.clientX, y: Event.clientY };
      if (Quiet && Math.hypot(Point.x - Quiet.x, Point.y - Quiet.y) > 3) { Quiet = null; const Target = Of(Event); if (Target) Hover(Target); }
    }, { passive: true });
    Container.addEventListener('mouseover', Event => { const Target = Of(Event); if (Target && !Quiet) Hover(Target); });
    Container.addEventListener('mouseout', Event => { if (Of(Event) && !(Event.relatedTarget && Event.relatedTarget.closest && Event.relatedTarget.closest(Selector))) Leave(); });
    Container.addEventListener('focusin', Event => { const Target = Of(Event); if (Target) { Clear(); Open(Target); } });
    Container.addEventListener('focusout', Hide);
    Container.addEventListener('click', Event => { const Target = Of(Event); if (Target && !matchMedia('(hover: hover) and (pointer: fine)').matches) { Clear(); Open(Target); } });
    document.addEventListener('click', Event => { if (!Of(Event)) Hide(); });
    addEventListener('scroll', () => { Hide(); Quiet = { x: Point.x, y: Point.y }; }, { passive: true });
    addEventListener('resize', Hide);
  }

  return { Bind, Hide };
}
