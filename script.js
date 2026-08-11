// ============================================================
// ASSISTENTE PCR — ESTADO GLOBAL
// ============================================================
let state = {
  profile: null,
  running: false,
  totalSeconds: 0,
  timerInterval: null,
  startTime: null,
  endTime: null,
  events: [],
  choqueCount: 0,
  adrenalinaCount: 0,
  amiodaronaCount: 0,
  isIntubated: false,
  lastAdrenalinaTimestamp: null,
  lastAmiodaronaTimestamp: null,
  wakeLock: null
};

let audioCtx = null;
let pulseCheckTimeout = null;

// Debounce genérico: evita duplo-clique/duplo-toque disparando o mesmo evento 2x
const actionLocks = {};
function guarded(key, fn, cooldownMs = 600) {
  const now = Date.now();
  if (actionLocks[key] && now - actionLocks[key] < cooldownMs) return;
  actionLocks[key] = now;
  fn();
}

// Inicializa o AudioContext com toque humano para não ser bloqueado pelo navegador
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ============================================================
// MOTOR DE VOZ — FILA NORMAL + FILA PRIORITÁRIA (SEM SOBREPOSIÇÃO)
// ============================================================
let selectedVoice = null;
let speechQueue = [];
let isSpeaking = false;
let speechSafetyTimeout = null;

function loadBestVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  const ptBR = voices.filter(v => v.lang && v.lang.toLowerCase() === 'pt-br');
  const pt = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('pt'));
  const available = ptBR.length ? ptBR : pt;

  if (!available.length) return;

  // Prioriza vozes de rede (mais naturais) e depois vozes locais de qualidade conhecida
  const network = available.find(v => !v.localService);
  const localQuality = available.find(v => {
    const name = v.name.toLowerCase();
    return v.localService && (name.includes('google') || name.includes('natural') || name.includes('neural') || name.includes('luciana') || name.includes('fernanda') || name.includes('daniel'));
  });

  selectedVoice = network || localQuality || available.find(v => v.localService) || available[0];
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadBestVoice;
  loadBestVoice();
}

// Processa a fila normal (não crítica) — nunca interrompe uma fala em andamento
function processSpeechQueue() {
  if (isSpeaking || !speechQueue.length || !('speechSynthesis' in window)) return;

  if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);

  const text = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  if (selectedVoice) utterance.voice = selectedVoice;

  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  isSpeaking = true;

  // Trava de segurança: se o motor de voz do navegador travar (bug comum em iOS/Chrome
  // quando a tela bloqueia ou o app vai para 2º plano) e onend nunca disparar,
  // isso força a liberação em 6s — evita a fila entupir e "explodir" tudo de uma vez depois.
  speechSafetyTimeout = setTimeout(() => {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    processSpeechQueue();
  }, 6000);

  utterance.onend = () => {
    clearTimeout(speechSafetyTimeout);
    isSpeaking = false;
    setTimeout(processSpeechQueue, 100);
  };

  utterance.onerror = () => {
    clearTimeout(speechSafetyTimeout);
    isSpeaking = false;
    setTimeout(processSpeechQueue, 100);
  };

  window.speechSynthesis.speak(utterance);
}

// Fala não crítica: entra na fila, espera a vez, nunca corta a frase anterior
function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  speechQueue.push(text);
  processSpeechQueue();
}

// Fala CRÍTICA: cancela imediatamente qualquer fala em andamento e a fila,
// e assume a voz na hora. Usar apenas para eventos que mudam conduta clínica
// (choque, intubação, RCE, nova PCR, finalização).
function speakPriority(text) {
  if (!('speechSynthesis' in window)) return;

  speechQueue = [];
  window.speechSynthesis.cancel();
  isSpeaking = false;
  if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);

  speechQueue.push(text);
  processSpeechQueue();
}

// ============================================================
// METRÔNOMO DE COMPRESSÃO — PROTOCOLO AHA (100-120/min)
// Usa o clock do AudioContext (preciso, sem drift) em vez de setInterval puro
// ============================================================
const COMPRESSION_BPM = 110; // dentro da faixa AHA 100-120/min
const SECONDS_PER_BEAT = 60.0 / COMPRESSION_BPM;
const SCHEDULE_AHEAD_TIME = 0.15; // segundos agendados à frente
const LOOKAHEAD_MS = 25;          // frequência de checagem do agendador

let metronomeRunning = false;
let nextBeatTime = 0.0;
let metronomeSchedulerId = null;

function scheduleCompressionClick(time) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(1000, time); // clique seco, distinto do alarme
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + 0.06);
}

function metronomeScheduler() {
  while (nextBeatTime < audioCtx.currentTime + SCHEDULE_AHEAD_TIME) {
    scheduleCompressionClick(nextBeatTime);
    nextBeatTime += SECONDS_PER_BEAT;
  }
}

function startCompressionMetronome() {
  initAudio();
  if (metronomeRunning) return;
  metronomeRunning = true;
  nextBeatTime = audioCtx.currentTime + 0.05;
  metronomeSchedulerId = setInterval(metronomeScheduler, LOOKAHEAD_MS);
}

function stopCompressionMetronome() {
  metronomeRunning = false;
  if (metronomeSchedulerId) {
    clearInterval(metronomeSchedulerId);
    metronomeSchedulerId = null;
  }
}

function pauseCompressionMetronome() {
  // usado na checagem de pulso/ritmo (10s) — não faz sentido bipar ritmo de
  // compressão enquanto ninguém está comprimindo
  stopCompressionMetronome();
}

function resumeCompressionMetronome() {
  if (state.running) startCompressionMetronome();
}

// ============================================================
// ALARME DE ALERTA — AGUDO E CONTÍNUO (padrão monitor hospitalar)
// Repete até o evento ser reconhecido (hideAlert), diferente do
// clique do metrônomo — tom mais alto, cadência mais lenta.
// ============================================================
const ALERT_FREQ_HZ = 2400;   // agudo, tipo alarme de monitor multiparamétrico
const ALERT_BEEP_MS = 180;    // duração de cada bipe
const ALERT_REPEAT_MS = 700;  // intervalo entre bipes

let alertBeepInterval = null;

function playSingleAlertTone() {
  try {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(ALERT_FREQ_HZ, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ALERT_BEEP_MS / 1000);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + ALERT_BEEP_MS / 1000);
  } catch (e) {
    console.log("Erro ao tocar alarme", e);
  }
}

function startAlertBeepLoop() {
  stopAlertBeepLoop(); // evita duplicar loops simultâneos
  playSingleAlertTone();
  alertBeepInterval = setInterval(playSingleAlertTone, ALERT_REPEAT_MS);
}

function stopAlertBeepLoop() {
  if (alertBeepInterval) {
    clearInterval(alertBeepInterval);
    alertBeepInterval = null;
  }
}

// --- WAKE LOCK ---
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.log("Wake Lock não ativado:", err);
  }
}

// Relógio Barra Superior
function startWallClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('wallClock').innerText = now.toTimeString().substring(0, 8);
  }, 1000);
}
startWallClock();

function formatHHMMSS(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getFormattedClock() {
  const now = new Date();
  return now.toTimeString().substring(0, 5);
}

// ============================================================
// TELA 1 — SETUP
// ============================================================
function selecionarPerfil(element, perfil) {
  initAudio();
  state.profile = perfil;
  document.querySelectorAll('.card-perfil').forEach(card => card.classList.remove('selecionado'));
  element.classList.add('selecionado');

  const btnIniciar = document.getElementById('btn-iniciar-pcr');
  btnIniciar.disabled = false;
  btnIniciar.innerText = `INICIAR ATENDIMENTO (${perfil})`;
}

function iniciarPCR() {
  if (!state.profile) return;
  initAudio();
  document.getElementById('tela-setup').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');

  requestWakeLock();
  startSession();
}

// ============================================================
// SESSÃO E TIMER PRINCIPAL
// ============================================================
function startSession() {
  if (state.running) return;
  state.running = true;
  if (!state.startTime) state.startTime = getFormattedClock();

  registerEvent(`Início de PCR (${state.profile})`);
  speakPriority(`Início de atendimento. Perfil ${state.profile}. Iniciar compressões.`);
  startCompressionMetronome();

  state.timerInterval = setInterval(() => {
    state.totalSeconds++;
    document.getElementById('mainTimer').innerText = formatHHMMSS(state.totalSeconds);
    checkIntervalRules();
  }, 1000);
}

function registerEvent(description) {
  const timeClock = getFormattedClock();
  const timeElapsed = formatHHMMSS(state.totalSeconds);

  const eventItem = {
    clock: timeClock,
    label: description,
    elapsed: timeElapsed
  };

  state.events.push(eventItem);
  renderLiveLog(eventItem);
}

function renderLiveLog(item) {
  const list = document.getElementById('liveLogList');
  const li = document.createElement('li');
  li.innerText = `• ${item.clock} - ${item.label} (${item.elapsed})`;
  list.insertBefore(li, list.firstChild);
}

// ============================================================
// AÇÕES DE SUPORTE VENTILATÓRIO
// ============================================================
function handleVentilacao() {
  guarded('ventilacao', () => {
    initAudio();
    registerEvent('Ventilação com bolsa-válvula-máscara');
    if (!state.isIntubated) {
      const ratio = state.profile === 'PEDIÁTRICO' ? '15 para 2' : '30 para 2';
      speak(`Ventilação com máscara. Mantendo relação de ${ratio}.`);
    } else {
      speak("Ventilação em via aérea avançada. Uma ventilação a cada 6 segundos.");
    }
  });
}

function handleIntubacao() {
  guarded('intubacao', () => {
    initAudio();
    state.isIntubated = true;
    document.getElementById('ritmoPill').innerText = 'Ventilação 1 a cada 6s';
    registerEvent('Intubação / Via Aérea Avançada');
    // Evento crítico: interrompe qualquer fala em andamento (ex: alerta de 2 min)
    speakPriority("Paciente intubado. Transição para ventilação contínua de uma a cada 6 segundos, com compressões ininterruptas.");
  });
}

// ============================================================
// INTERVENÇÕES
// ============================================================
function handleChoque() {
  guarded('choque', () => {
    initAudio();
    state.choqueCount++;
    document.getElementById('countChoque').innerText = state.choqueCount;
    registerEvent(`Choque aplicado (${state.choqueCount}º)`);
    speakPriority(`Choque número ${state.choqueCount} aplicado. Reiniciar compressões imediatamente.`);
    resumeCompressionMetronome();
  });
}

function handleAdrenalina() {
  guarded('adrenalina', () => {
    initAudio();
    state.adrenalinaCount++;
    state.lastAdrenalinaTimestamp = state.totalSeconds;
    document.getElementById('countAdrenalina').innerText = state.adrenalinaCount;
    registerEvent(`Adrenalina (${state.adrenalinaCount}ª dose)`);
    speakPriority(`Adrenalina ${state.adrenalinaCount}ª dose administrada.`);
    hideAlert();
  });
}

function handleAmiodarona() {
  guarded('amiodarona', () => {
    initAudio();
    if (state.amiodaronaCount === 0) {
      state.amiodaronaCount = 1;
      document.getElementById('countAmiodarona').innerText = 1;
      registerEvent("Amiodarona (1ª dose - 300mg)");
      speakPriority("Amiodarona primeira dose de 300 miligramas administrada.");
    } else if (state.amiodaronaCount === 1) {
      state.amiodaronaCount = 2;
      state.lastAmiodaronaTimestamp = state.totalSeconds;
      document.getElementById('countAmiodarona').innerText = 2;
      registerEvent("Amiodarona (2ª dose - 150mg)");
      speakPriority("Amiodarona segunda dose de 150 miligramas administrada. Atenção: Retornar ao ciclo de Adrenalina.");
      hideAlert();
    } else {
      alert("Dose máxima de Amiodarona (150mg) já administrada.");
    }
  });
}

// ============================================================
// REGRAS DE TEMPO & ALERTAS POR VOZ (AHA)
// ============================================================
function checkIntervalRules() {
  const current = state.totalSeconds;

  // 1. Alerta de 2 minutos: pausa compressão, checa ritmo/pulso (máx 10s AHA)
  if (current > 0 && current % 120 === 0) {
    pauseCompressionMetronome();
    startAlertBeepLoop();
    showAlert("⚠️ 2 MINUTOS: Checar ritmo e pulso (máx 10s) e trocar socorrista!");
    speakPriority("Atenção: Dois minutos de manobras. Pausar para checar ritmo e pulso.");

    if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout);

    pulseCheckTimeout = setTimeout(() => {
      if (state.running) {
        stopAlertBeepLoop();
        hideAlert();
        speakPriority("Tempo limite atingido. Volte às compressões imediatamente.");
        resumeCompressionMetronome();
      }
    }, 10000);

    return;
  }

  // 2. Alerta de 3 minutos para Adrenalina (pós 2ª Amiodarona)
  if (state.amiodaronaCount === 2 && state.lastAmiodaronaTimestamp) {
    const elapsedAmiodarona = current - state.lastAmiodaronaTimestamp;
    if (elapsedAmiodarona > 0 && elapsedAmiodarona % 180 === 0) {
      startAlertBeepLoop();
      showAlert("🔔 ALERTA: Aplicar Adrenalina (3 min pós 2ª Amiodarona)");
      speak("Atenção: Três minutos após segunda dose de Amiodarona. Aplicar Adrenalina.");
      return;
    }
  }

  // 3. Alerta de 3 minutos para Adrenalina contínua
  if (state.lastAdrenalinaTimestamp) {
    const elapsedAdrenalina = current - state.lastAdrenalinaTimestamp;
    if (elapsedAdrenalina > 0 && elapsedAdrenalina % 180 === 0) {
      startAlertBeepLoop();
      showAlert("🔔 ALERTA: Avaliar/Aplicar Adrenalina (intervalo de 3 min)");
      speak("Atenção: Três minutos desde a última Adrenalina. Avaliar nova dose.");
    }
  }
}

function showAlert(msg) {
  const alertBox = document.getElementById('medAlertBox');
  document.getElementById('alertMessage').innerText = msg;
  alertBox.classList.remove('hidden');
}

function hideAlert() {
  document.getElementById('medAlertBox').classList.add('hidden');
  stopAlertBeepLoop();
}

// ============================================================
// RESULTADOS
// ============================================================
function handleRCE() {
  guarded('rce', () => {
    if (state.running) {
      state.running = false;
      clearInterval(state.timerInterval);
      if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout);
      stopCompressionMetronome();
      stopAlertBeepLoop();
      hideAlert();
      registerEvent("RCE — Retorno da Circulação Espontânea (Cronômetro Pausado)");
      speakPriority("Retorno da circulação espontânea confirmado. Cronômetro pausado.");
    }
  });
}

function handleNovaPCR() {
  guarded('novapcr', () => {
    registerEvent("Nova Parada Cardiorrespiratória — Reiniciando Cronômetro");
    speakPriority("Nova parada cardiorrespiratória. Reiniciando cronômetro.");
    state.totalSeconds = 0;
    document.getElementById('mainTimer').innerText = "00:00:00";

    if (!state.running) {
      state.running = true;
      state.timerInterval = setInterval(() => {
        state.totalSeconds++;
        document.getElementById('mainTimer').innerText = formatHHMMSS(state.totalSeconds);
        checkIntervalRules();
      }, 1000);
    }
    startCompressionMetronome();
  });
}

function handleFinalizar() {
  guarded('finalizar', () => {
    state.running = false;
    clearInterval(state.timerInterval);
    if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout);
    stopCompressionMetronome();
    stopAlertBeepLoop();
    state.endTime = getFormattedClock();

    if (state.wakeLock) {
      state.wakeLock.release().then(() => { state.wakeLock = null; });
    }

    registerEvent("Atendimento Finalizado");
    speakPriority("Atendimento finalizado. Gerando relatório.");

    document.getElementById('mainScreen').classList.add('hidden');
    document.getElementById('reportScreen').classList.remove('hidden');

    renderReport();
  });
}

// ============================================================
// TELA 3 — RELATÓRIO
// ============================================================
function renderReport() {
  document.getElementById('reportProfileDisplay').innerText = state.profile;
  document.getElementById('startTimeDisplay').innerText = state.startTime;
  document.getElementById('endTimeDisplay').innerText = state.endTime;
  document.getElementById('totalDurationDisplay').innerText = formatHHMMSS(state.totalSeconds);

  const reportList = document.getElementById('reportLogList');
  reportList.innerHTML = "";

  state.events.forEach(ev => {
    const li = document.createElement('li');
    li.innerText = `• ${ev.clock} - ${ev.label} (${ev.elapsed})`;
    reportList.appendChild(li);
  });
}

function getPlainTextReport() {
  let text = `--- RELATÓRIO DE ATENDIMENTO PCR (${state.profile}) ---\n`;
  text += `Início: ${state.startTime} | Término: ${state.endTime}\n`;
  text += `Duração Total: ${formatHHMMSS(state.totalSeconds)}\n\n`;
  text += `--- LINHA DO TEMPO ---\n`;

  state.events.forEach(ev => {
    text += `• ${ev.clock} - ${ev.label} (${ev.elapsed})\n`;
  });

  return text;
}

function copySummary() {
  navigator.clipboard.writeText(getPlainTextReport()).then(() => {
    alert("Resumo copiado com sucesso!");
  });
}

function sendEmail() {
  const subject = encodeURIComponent(`Relatório de Atendimento PCR - ${state.profile}`);
  const body = encodeURIComponent(getPlainTextReport());
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function resetApp() {
  location.reload();
}