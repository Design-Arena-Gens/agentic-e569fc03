"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getOpenState, HOURS_TEXT, NEXT_OPEN_TEXT } from "../lib/hours";
import { detectLanguage, t } from "../lib/i18n";
import { planResponse } from "../lib/bot";
import { createIcsFile, googleCalendarUrl } from "../lib/calendar";

function Bubble({ from, children }){
  return <div className={`bubble ${from === 'bot' ? 'bot' : 'user'}`}>{children}</div>;
}

function OpenBadge(){
  const { isOpen, today, now, nextOpen } = useMemo(() => getOpenState(), []);
  return (
    <div className="row small">
      <span className="badge">{isOpen ? 'Open now' : 'Closed now'}</span>
      <span>?</span>
      <span>{HOURS_TEXT(today)}</span>
      {!isOpen && (
        <>
          <span>?</span>
          <span>{NEXT_OPEN_TEXT(nextOpen)}</span>
        </>
      )}
    </div>
  );
}

const SERVICES = [
  { id: 'haircut', en: 'Haircut', ar: '?? ?????', mins: 30, price: 20 },
  { id: 'beard', en: 'Beard trim', ar: '????? ??????', mins: 20, price: 12 },
  { id: 'combo', en: 'Haircut + Beard', ar: '?? + ????', mins: 45, price: 28 },
  { id: 'fade', en: 'Skin fade', ar: '?????? ????', mins: 40, price: 25 },
  { id: 'kids', en: 'Kids haircut', ar: '?? ???????', mins: 25, price: 15 },
  { id: 'facial', en: 'Facial care', ar: '????? ?????', mins: 25, price: 18 },
  { id: 'dye', en: 'Hair dye', ar: '???? ?????', mins: 60, price: 40 }
];

const DEFAULT_SLOTS = ["10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

function getSlotsForDate(dateStr){
  // Simple demo: same slots every day, but disable past times if today
  const today = new Date();
  const chosen = new Date(dateStr + 'T00:00');
  const isToday = today.toDateString() === chosen.toDateString();
  if(!isToday) return DEFAULT_SLOTS;
  const nowMinutes = today.getHours()*60 + today.getMinutes();
  return DEFAULT_SLOTS.filter(t => {
    const [h,m] = t.split(":").map(Number);
    return (h*60+m) - nowMinutes >= 45; // need at least a buffer
  });
}

function useLocalAppointments(){
  const key = 'barberai_appointments_v1';
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  };
  const [items, setItems] = useState([]);
  useEffect(() => { setItems(read()); }, []);
  const save = (next) => {
    setItems(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return { items, save };
}

export default function Page(){
  const [messages, setMessages] = useState([]); // {from:'bot'|'user', text, meta}
  const [input, setInput] = useState("");
  const [lang, setLang] = useState('en');
  const [pending, setPending] = useState(false);
  const { items, save } = useLocalAppointments();
  const scroller = useRef(null);

  // seed greeting
  useEffect(() => {
    const systemLang = typeof navigator !== 'undefined' ? (navigator.language || 'en').startsWith('ar') ? 'ar' : 'en' : 'en';
    setLang(systemLang);
    const greeting = systemLang === 'ar'
      ? '?????! ??? BarberAI. ??? ???? ?????? ?????? ??\n\n- ??? ????\n- ????????? ?? ??????? ????????\n- ????? ???? ??? ??????\n- ?????? ?????'
      : 'Hey! I\'m BarberAI. How can I help today? ??\n\n- Book an appointment\n- Ask about prices/services\n- Haircut style advice\n- Opening hours';
    setMessages([{ from:'bot', text: greeting }]);
  }, []);

  useEffect(() => {
    if(!scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight + 1000;
  }, [messages, pending]);

  const send = async (text) => {
    if(!text.trim()) return;
    const detected = detectLanguage(text);
    const currentLang = detected || lang;
    setLang(currentLang);
    setMessages(prev => [...prev, { from:'user', text }]);
    setInput("");
    setPending(true);

    const ctx = { services: SERVICES, items, lang: currentLang };
    const plan = await planResponse(text, ctx);

    // Side-effects: booking create/update
    if (plan?.action === 'createBooking'){
      const id = Math.random().toString(36).slice(2);
      const booking = { id, ...plan.data, createdAt: Date.now() };
      save([ ...items, booking ]);
      plan.booking = booking;
    }
    if (plan?.action === 'updateBooking'){
      const next = items.map(it => it.id === plan.data.id ? { ...it, ...plan.data } : it);
      save(next);
    }

    const botMsgs = Array.isArray(plan?.messages) ? plan.messages : [{ type:'text', text: plan?.text || '' }];

    const rendered = botMsgs.flatMap((m) => {
      if(m.type === 'text') return [{ from:'bot', text: m.text }];
      if(m.type === 'options') return [{ from:'bot', text: m.text, options: m.options }];
      if(m.type === 'bookingConfirm') return [{ from:'bot', text: m.text, booking: plan.booking || m.booking }];
      return [];
    });

    setMessages(prev => [...prev, ...rendered]);
    setPending(false);
  };

  const quick = lang === 'ar'
    ? ["??? ????", "??????? ????????", "????? ??? ???", "?????? ?????"]
    : ["Book appointment", "Prices & services", "Style advice", "Opening hours"];

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">BarberAI Assistant</div>
        <OpenBadge />
      </div>
      <div className="card-body">
        <div className="chat">
          <div ref={scroller} className="messages">
            {messages.map((m, i) => (
              <div key={i}>
                <Bubble from={m.from}>
                  <div>{m.text}</div>
                  {m.options && (
                    <div className="quick">
                      {m.options.map((o, idx) => (
                        <button key={idx} onClick={() => send(o)}>{o}</button>
                      ))}
                    </div>
                  )}
                  {m.booking && <BookingCard lang={lang} booking={m.booking} />}
                </Bubble>
              </div>
            ))}
            {pending && <Bubble from="bot">{t(lang,'typing')}</Bubble>}
          </div>
          <div className="input">
            <input
              className="textbox"
              placeholder={lang==='ar' ? '???? ??????...' : 'Type your message...'}
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'){ send(input); } }}
            />
            <button className="send" onClick={()=>send(input)} disabled={!input.trim()}>
              {lang==='ar' ? '?????' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingCard({ lang, booking }){
  const serviceName = (id) => {
    const svc = SERVICES.find(s=>s.id===id);
    if(!svc) return id;
    return lang==='ar' ? `${svc.ar} ? ${svc.price}$ ? ${svc.mins}?` : `${svc.en} ? $${svc.price} ? ${svc.mins}m`;
  };

  const dtStr = `${booking.date} ${booking.time}`;
  const start = new Date(`${booking.date}T${booking.time}:00`);
  const dur = (SERVICES.find(s=>s.id===booking.service)?.mins) || 30;
  const end = new Date(start.getTime() + dur*60000);
  const ics = createIcsFile({
    title: lang==='ar' ? '???? ?????' : 'Barber Appointment',
    description: `${serviceName(booking.service)} ? ${booking.name} (${booking.phone})`,
    start, end, location: 'BarberAI Shop',
  });

  const gcal = googleCalendarUrl({ title: lang==='ar' ? '???? ?????' : 'Barber Appointment', details: serviceName(booking.service), start, end, location: 'BarberAI Shop' });

  const waMsg = encodeURIComponent(
    lang==='ar'
      ? `?? ????? ?????:\n?????: ${booking.name}\n??????: ${serviceName(booking.service)}\n???????: ${booking.date}\n?????: ${booking.time}.\n????? ??? ???! ??`
      : `Your appointment is confirmed:\nName: ${booking.name}\nService: ${serviceName(booking.service)}\nDate: ${booking.date}\nTime: ${booking.time}.\nSee you soon! ??`
  );
  const waLink = `https://wa.me/${booking.phone.replace(/[^\d]/g,'')}?text=${waMsg}`;

  const downloadIcs = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'barber-appointment.ics';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div>
      <div className="hr" />
      <div className="small" style={{marginBottom:6}}>{lang==='ar' ? '?????? ??????:' : 'Booking details:'}</div>
      <div className="formgrid">
        <div><span className="small">{lang==='ar'?'?????':'Name'}</span><div>{booking.name}</div></div>
        <div><span className="small">{lang==='ar'?'??????':'Phone'}</span><div>{booking.phone}</div></div>
        <div><span className="small">{lang==='ar'?'??????':'Service'}</span><div>{serviceName(booking.service)}</div></div>
        <div><span className="small">{lang==='ar'?'?????':'When'}</span><div>{booking.date} @ {booking.time}</div></div>
      </div>
      <div className="actions">
        <button className="action good" onClick={downloadIcs}>{lang==='ar' ? '????? ??????? (ICS)' : 'Add to Calendar (ICS)'}</button>
        <a className="action alt" href={gcal} target="_blank" rel="noreferrer">{lang==='ar' ? 'Google Calendar' : 'Google Calendar'}</a>
        <a className="action warn" href={waLink} target="_blank" rel="noreferrer">{lang==='ar' ? '????? ??? ??????' : 'WhatsApp reminder'}</a>
      </div>
    </div>
  );
}
