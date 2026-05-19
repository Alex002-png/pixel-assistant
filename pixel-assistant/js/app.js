const mem = new PixelMemory();

let isListening = false;
let isSpeaking = false;
let recognition = null;
let activeTimer = null;
let ttsWarmedUp = false;

// DOM refs
const orb       = document.getElementById('orb');
const orbHint   = document.getElementById('orb-hint');
const userBubble  = document.getElementById('user-bubble');
const pixelBubble = document.getElementById('pixel-bubble');
const userText  = document.getElementById('user-text');
const pixelText = document.getElementById('pixel-text');
const statusEl  = document.getElementById('status');

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
  setupRecognition();
  setupUI();
  checkSetup();
}

function checkSetup() {
  const p = mem.getProfile();
  if (!p.apiKey) {
    document.getElementById('settings-modal').classList.remove('hidden');
  } else {
    greet();
  }
}

// ─── Speech Recognition ───────────────────────────────────────────────────────
function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus('Reconocimiento de voz no soportado');
    return;
  }

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    setOrbState('listening');
    setStatus('Escuchando...');
    orbHint.textContent = 'Toca para cancelar';
    showBubble('user', '...');
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript).join('');
    showBubble('user', transcript);

    if (e.results[e.results.length - 1].isFinal) {
      processInput(transcript);
    }
  };

  recognition.onerror = (e) => {
    isListening = false;
    setOrbState('idle');
    orbHint.textContent = 'Toca para hablar';
    if (e.error === 'not-allowed') {
      setStatus('Permiso de micrófono denegado');
      showBubble('pixel', 'Necesito permiso para usar el micrófono. Actívalo en Ajustes > Safari.');
    } else if (e.error === 'no-speech') {
      setStatus('Listo');
      hideBubbles();
    } else {
      setStatus('Error: ' + e.error);
    }
  };

  recognition.onend = () => {
    isListening = false;
    if (!isSpeaking) {
      setOrbState('idle');
      orbHint.textContent = 'Toca para hablar';
    }
  };
}

// ─── Orb Tap ─────────────────────────────────────────────────────────────────
orb.addEventListener('click', () => {
  if (!ttsWarmedUp) warmupTTS();

  if (isSpeaking) {
    stopSpeaking();
    return;
  }
  if (isListening) {
    recognition?.stop();
    return;
  }
  startListening();
});

function startListening() {
  if (!recognition) {
    showBubble('pixel', 'Tu navegador no soporta reconocimiento de voz. Usa Safari en iPhone.');
    return;
  }
  const p = mem.getProfile();
  if (!p.apiKey) {
    document.getElementById('settings-modal').classList.remove('hidden');
    return;
  }

  window.speechSynthesis.cancel();
  isListening = true;
  recognition.lang = p.voiceLang || 'es-MX';

  try {
    recognition.start();
  } catch {
    setTimeout(() => { try { recognition.start(); } catch {} }, 200);
  }
}

// ─── Process Input ────────────────────────────────────────────────────────────
async function processInput(input) {
  if (!input.trim()) return;
  setOrbState('thinking');
  setStatus('Procesando...');
  mem.pushHistory('user', input);

  const quick = await handleQuickAction(input);
  if (quick !== null) {
    mem.pushHistory('assistant', quick);
    respond(quick);
    return;
  }

  const ai = await askDeepSeek(input);
  mem.pushHistory('assistant', ai);
  respond(ai);
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
async function handleQuickAction(input) {
  const t = input.toLowerCase();

  // Time
  if (/qué hora|que hora|what time|dime la hora|hora (es|son)|son las/i.test(t)) {
    const h = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `Son las ${h}`;
  }

  // Date
  if (/qué (día|fecha)|que (dia|fecha)|what (day|date)|hoy es|fecha de hoy/i.test(t)) {
    const d = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `Hoy es ${d}`;
  }

  // Weather
  if (/clima|weather|temperatura|temperature|llueve|lluvia|va a llover|pronóstico/i.test(t)) {
    return await getWeather();
  }

  // Timer
  const timerMatch = t.match(/(\d+)\s*(minuto|minute|segundo|second|hora|hour)/i);
  if (timerMatch && /timer|temporizador|alarma|alarm|avísame|avisame|recuérdame|recuerdame|en \d/i.test(t)) {
    const n = parseInt(timerMatch[1]);
    const u = timerMatch[2].toLowerCase();
    const ms = /minuto|minute/.test(u) ? n * 60000 : /hora|hour/.test(u) ? n * 3600000 : n * 1000;
    setTimer(ms, n, u);
    return `Listo, te aviso en ${n} ${u}${n > 1 ? 's' : ''}.`;
  }

  // WhatsApp
  if (/abr(e|ir)\s*whatsapp|open whatsapp/i.test(t)) {
    setTimeout(() => { window.location.href = 'https://wa.me'; }, 1800);
    return 'Abriendo WhatsApp...';
  }

  // Gmail
  if (/abr(e|ir)\s*(gmail|correo|email)|open (gmail|email|mail)/i.test(t)) {
    setTimeout(() => { window.open('https://mail.google.com', '_blank'); }, 1800);
    return 'Abriendo Gmail...';
  }

  // Music
  const musicMatch = t.match(/reproduce\s+(.+)|pon\s+(.+)|play\s+(.+)|escuchar\s+(.+)/i);
  if (musicMatch && !/app|aplicacion|whatsapp|gmail/.test(t)) {
    const song = (musicMatch[1] || musicMatch[2] || musicMatch[3] || musicMatch[4]).trim();
    setTimeout(() => { window.open(`https://open.spotify.com/search/${encodeURIComponent(song)}`, '_blank'); }, 1800);
    return `Buscando "${song}" en Spotify...`;
  }
  if (/abr(e|ir)\s*spotify|open spotify/i.test(t)) {
    setTimeout(() => { window.open('https://open.spotify.com', '_blank'); }, 1800);
    return 'Abriendo Spotify...';
  }

  // Search / preguntas que necesitan internet
  const searchMatch = t.match(/busca\s+(.+)|googlea\s+(.+)|search for\s+(.+)|qué es\s+(.+)|que es\s+(.+)|quién es\s+(.+)|quien es\s+(.+)|cuéntame sobre\s+(.+)|cuentame sobre\s+(.+)|información sobre\s+(.+)|info sobre\s+(.+)/i);
  if (searchMatch) {
    const q = [searchMatch[1],searchMatch[2],searchMatch[3],searchMatch[4],searchMatch[5],searchMatch[6],searchMatch[7],searchMatch[8],searchMatch[9],searchMatch[10],searchMatch[11]].find(Boolean).trim();
    return await searchAndAnswer(q, input);
  }

  // Save note
  const noteMatch = t.match(/recuerda que\s+(.+)|anota\s+(.+)|nota[:\s]+(.+)|remember that\s+(.+)|note[:\s]+(.+)/i);
  if (noteMatch) {
    const note = (noteMatch[1] || noteMatch[2] || noteMatch[3] || noteMatch[4] || noteMatch[5]).trim();
    mem.addNote(note);
    return `Anotado: "${note}"`;
  }

  // Read notes
  if (/mis notas|ver notas|show notes|read notes/i.test(t)) {
    const notes = mem.getNotes();
    if (notes.length === 0) return 'No tienes notas guardadas.';
    openNotesModal();
    return `Tienes ${notes.length} nota${notes.length > 1 ? 's' : ''} guardada${notes.length > 1 ? 's' : ''}.`;
  }

  // Clear history
  if (/borra (el historial|la conversación|todo)|clear (history|conversation)/i.test(t)) {
    mem.clearHistory();
    return 'Historial borrado. Empezamos de nuevo.';
  }

  return null;
}

// ─── Weather ──────────────────────────────────────────────────────────────────
async function getWeather() {
  try {
    let url = 'https://wttr.in?format=j1';
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      url = `https://wttr.in/${pos.coords.latitude},${pos.coords.longitude}?format=j1`;
    } catch {}

    const r = await fetch(url);
    const d = await r.json();
    const cur = d.current_condition[0];
    const area = d.nearest_area[0]?.areaName[0]?.value || '';
    const temp = cur.temp_C;
    const feels = cur.FeelsLikeC;
    const desc = cur.lang_es?.[0]?.value || cur.weatherDesc[0].value;
    return `${area ? area + ': ' : ''}${temp}°C, ${desc}. Se siente como ${feels}°C.`;
  } catch {
    return 'No pude obtener el clima ahora. Verifica tu conexión.';
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function setTimer(ms, n, unit) {
  if (activeTimer) clearTimeout(activeTimer);
  activeTimer = setTimeout(() => {
    const msg = `¡Tu temporizador de ${n} ${unit}${n > 1 ? 's' : ''} terminó!`;
    respond(msg);
    if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
  }, ms);
}

// ─── Web Search ───────────────────────────────────────────────────────────────
async function searchAndAnswer(query, originalInput) {
  setStatus('Buscando en internet...');
  const p = mem.getProfile();
  let context = null;

  // 1. Try Brave Search (if key set)
  if (p.braveKey) {
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4&search_lang=es`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': p.braveKey
        }
      });
      if (res.ok) {
        const data = await res.json();
        const hits = data.web?.results?.slice(0, 4) || [];
        if (hits.length > 0) {
          context = hits.map((r, i) => `${i+1}. ${r.title}: ${r.description || ''}`).join('\n');
        }
      }
    } catch {}
  }

  // 2. Fallback: Wikipedia (free, no key)
  if (!context) {
    try {
      const lang = /[áéíóúñ]/.test(query) ? 'es' : 'en';
      const srRes = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`);
      const srData = await srRes.json();
      const hits = srData.query?.search || [];
      if (hits.length > 0) {
        const title = hits[0].title;
        const sumRes = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        const sumData = await sumRes.json();
        if (sumData.extract) {
          context = `Wikipedia — ${title}: ${sumData.extract.slice(0, 600)}`;
        }
      }
    } catch {}
  }

  if (!context) return null; // fall through to regular DeepSeek

  // Ask DeepSeek with the web context
  return await askDeepSeekWithContext(originalInput, context);
}

async function askDeepSeekWithContext(question, context) {
  const p = mem.getProfile();
  if (!p.apiKey) return 'Configura tu API key en los ajustes.';
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Eres Pixel, asistente de voz. Responde en 2 oraciones concisas basándote en el contexto dado. Sin markdown ni listas. Responde en el idioma de la pregunta.' },
          { role: 'user', content: `Contexto de internet:\n${context}\n\nPregunta: ${question}` }
        ],
        max_tokens: 150,
        temperature: 0.6
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices[0].message.content.trim();
  } catch { return null; }
}

// ─── DeepSeek API ─────────────────────────────────────────────────────────────
async function askDeepSeek(input) {
  const p = mem.getProfile();
  if (!p.apiKey) return 'Configura tu API key de DeepSeek en los ajustes (⚙).';

  const now = new Date();
  const name = p.name || 'amigo';
  const systemPrompt = `Eres Pixel, el asistente de voz personal de ${name}.
Fecha y hora actual: ${now.toLocaleString('es-MX')}.
Reglas:
- Responde SIEMPRE en el mismo idioma que habla el usuario (español o inglés).
- Sé conciso: máximo 2-3 oraciones, ya que tu respuesta se leerá en voz alta.
- No uses markdown, listas, asteriscos ni emojis en tus respuestas.
- Sé amigable, útil y directo.
- Si no sabes algo, dilo honestamente.`;

  const history = mem.getHistory().slice(-12);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ];

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 180,
        temperature: 0.75
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('DeepSeek:', err);
      if (res.status === 401) return 'API key incorrecta. Revisa tu configuración.';
      return 'Error al conectar con la IA. Intenta de nuevo.';
    }

    const data = await res.json();
    return data.choices[0].message.content.trim();
  } catch (e) {
    console.error(e);
    return 'Sin conexión. Verifica tu internet.';
  }
}

// ─── Text to Speech ───────────────────────────────────────────────────────────
function getMaleVoice(isSpanish) {
  const voices = window.speechSynthesis.getVoices();
  const maleES = ['Jorge', 'Diego', 'Juan', 'Carlos', 'Miguel', 'Rodrigo', 'Javier', 'Enrique', 'Álvaro', 'Alvaro'];
  const maleEN = ['Daniel', 'Aaron', 'Gordon', 'Arthur', 'Oliver', 'Thomas', 'Fred', 'Rishi', 'Eddy', 'Reed'];
  const names  = isSpanish ? maleES : maleEN;
  const lang   = isSpanish ? 'es' : 'en';

  // Try exact male name match in correct language
  for (const n of names) {
    const v = voices.find(v => v.name.includes(n) && v.lang.startsWith(lang));
    if (v) return v;
  }
  // Any male-sounding name in any language
  for (const n of names) {
    const v = voices.find(v => v.name.includes(n));
    if (v) return v;
  }
  // Fallback: any local voice in correct language
  return voices.find(v => v.lang.startsWith(lang) && v.localService)
      || voices.find(v => v.lang.startsWith(lang))
      || null;
}

function respond(text) {
  showBubble('pixel', text);
  setOrbState('speaking');
  setStatus('Respondiendo...');
  isSpeaking = true;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);

  const isSpanish = /[áéíóúñ¿¡]/.test(text) ||
    /\b(el|la|los|las|es|son|hay|para|con|por|pero|que|una?|si|no|muy|bien|hoy|tiene|tengo|puedo|este)\b/i.test(text);

  utter.lang   = isSpanish ? (mem.getProfile().voiceLang || 'es-MX') : 'en-US';
  utter.rate   = 0.95;   // ligeramente más lento = más natural
  utter.pitch  = 0.85;   // más grave = voz masculina
  utter.volume = 1.0;

  const voice = getMaleVoice(isSpanish);
  if (voice) utter.voice = voice;

  utter.onend = () => {
    isSpeaking = false;
    setOrbState('idle');
    setStatus('Listo');
    orbHint.textContent = 'Toca para hablar';
  };
  utter.onerror = () => {
    isSpeaking = false;
    setOrbState('idle');
    setStatus('Listo');
    orbHint.textContent = 'Toca para hablar';
  };

  setTimeout(() => window.speechSynthesis.speak(utter), 100);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  setOrbState('idle');
  setStatus('Listo');
  orbHint.textContent = 'Toca para hablar';
}

function warmupTTS() {
  ttsWarmedUp = true;
  const silent = new SpeechSynthesisUtterance(' ');
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

// ─── Greeting ─────────────────────────────────────────────────────────────────
function greet() {
  const p = mem.getProfile();
  const h = new Date().getHours();
  const name = p.name ? `, ${p.name}` : '';
  let g;
  if (h >= 5 && h < 12)       g = `Buenos días${name}. Soy Pixel, tu asistente. Toca el orbe para hablar.`;
  else if (h >= 12 && h < 19) g = `Buenas tardes${name}. Soy Pixel, listo para ayudarte.`;
  else                         g = `Buenas noches${name}. Soy Pixel. ¿En qué te puedo ayudar?`;
  setTimeout(() => respond(g), 600);
}

// ─── Settings UI ──────────────────────────────────────────────────────────────
function setupUI() {
  // Settings
  document.getElementById('settings-btn').addEventListener('click', () => {
    const p = mem.getProfile();
    document.getElementById('user-name').value = p.name || '';
    document.getElementById('api-key').value = p.apiKey || '';
    document.getElementById('voice-lang').value = p.voiceLang || 'es-MX';
    document.getElementById('brave-key').value = p.braveKey || '';
    document.getElementById('settings-modal').classList.remove('hidden');
  });

  document.getElementById('save-settings').addEventListener('click', () => {
    const name      = document.getElementById('user-name').value.trim();
    const apiKey    = document.getElementById('api-key').value.trim();
    const voiceLang = document.getElementById('voice-lang').value;
    const braveKey  = document.getElementById('brave-key').value.trim();
    if (!apiKey) { alert('Ingresa tu API key de DeepSeek.'); return; }
    mem.saveProfile({ name, apiKey, voiceLang, braveKey });
    document.getElementById('settings-modal').classList.add('hidden');
    respond(`Todo listo${name ? ', ' + name : ''}. Estoy listo para ayudarte.`);
  });

  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-modal'))
      document.getElementById('settings-modal').classList.add('hidden');
  });

  // Notes
  document.getElementById('notes-btn').addEventListener('click', openNotesModal);

  document.getElementById('close-notes').addEventListener('click', () => {
    document.getElementById('notes-modal').classList.add('hidden');
  });

  document.getElementById('notes-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('notes-modal'))
      document.getElementById('notes-modal').classList.add('hidden');
  });

  // Text input
  const textInput = document.getElementById('text-input');
  const sendBtn   = document.getElementById('send-btn');

  function submitText() {
    const val = textInput.value.trim();
    if (!val) return;
    if (!ttsWarmedUp) warmupTTS();
    textInput.value = '';
    textInput.blur();
    showBubble('user', val);
    processInput(val);
  }

  sendBtn.addEventListener('click', submitText);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitText();
  });

  // Load voices asynchronously (iOS lazy-loads them)
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

function openNotesModal() {
  const notes = mem.getNotes();
  const list = document.getElementById('notes-list');
  const empty = document.getElementById('no-notes-msg');
  list.innerHTML = '';
  if (notes.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    notes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'note-item';
      el.innerHTML = `<div class="note-text">${escapeHtml(n.text)}</div><div class="note-date">${n.date}</div>`;
      list.appendChild(el);
    });
  }
  document.getElementById('notes-modal').classList.remove('hidden');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showBubble(who, text) {
  if (who === 'user') {
    userBubble.classList.remove('hidden');
    userText.textContent = text;
  } else {
    pixelBubble.classList.remove('hidden');
    pixelText.textContent = text;
  }
}

function hideBubbles() {
  userBubble.classList.add('hidden');
  pixelBubble.classList.add('hidden');
}

function setOrbState(state) {
  orb.className = state;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Register Service Worker ──────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  );
}

window.addEventListener('load', init);
