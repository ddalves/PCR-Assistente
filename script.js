let state = {
  profile: null,
  running: false,
  totalSeconds: 0,
  timerInterval: null,
  startTime: null,
  endTime: null,
  events: [],
  choqueCount: 5,
  adrenalinaCount: 0,
  amiodaronaCount: 0,
  isIntubated: false,
  lastAdrenalinaTimestamp: null,
  lastAmiodaronaTimestamp: null,
  wakeLock: null
};

// ============================================================
// MOTOR DE VOZ E ÁUDIO (COM DESTRAVAMENTO ANTI-BUG)
// ============================================================
let selectedVoice = null;
let speechQueue = [];
let isSpeaking = false;
let speechTimeout = null;

function loadBestVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  const ptBR = voices.filter(v => v.lang && v.lang.toLowerCase() === 'pt-br');
  const pt = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('pt'));
  const available = ptBR.length ? ptBR : pt;

  if (!available.length) return;

  const preferred = available.find(v => {
    const name = v.name.toLowerCase();
    return (
      v.localService &&
      (name.includes('google') || name.includes('natural') || name.includes('neural') || name.includes('luciana') || name.includes('fernanda') || name.includes('daniel'))
    );
  });

  selectedVoice = preferred || available.find(v => v.localService) || available[0];
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadBestVoice;
  loadBestVoice();
}

function processSpeechQueue() {
  if (isSpeaking || !speechQueue.length || !('speechSynthesis' in window)) return;

  if (speechTimeout) clearTimeout(speechTimeout);

  const text = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  if (selectedVoice) utterance.voice = selectedVoice;

  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  isSpeaking = true;

  // Trava de segurança: Se o motor de voz travar por +5s, força a liberação
  speechTimeout = setTimeout(() => {
    console.warn("Voz travada detectada. Forçando reset.");
    window.speechSynthesis.cancel();
    isSpeaking = false;
    processSpeechQueue();
  }, 5000);

  utterance.onend = () => {
    clearTimeout(speechTimeout);
    isSpeaking = false;
    setTimeout(processSpeechQueue, 100);
  };

  utterance.onerror = (e) => {
    console.error("Erro na síntese de voz:", e);
    clearTimeout(speechTimeout);
    isSpeaking = false;
    setTimeout(processSpeechQueue, 100);
  };

  window.speechSynthesis.speak(utterance);
}

// Cancela áudios pendentes para dar prioridade imediata aos alertas vitais
function speakPriority(text) {
  if (!('speechSynthesis' in window)) return;
  
  speechQueue = [];
  window.speechSynthesis.cancel();
  isSpeaking = false;
  if (speechTimeout) clearTimeout(speechTimeout);

  speechQueue.push(text);
  processSpeechQueue();
}

function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  speechQueue.push(text);
  processSpeechQueue();
}

function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    console.log("Áudio Context não suportado");
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

// Tela 1
function selecionarPerfil(element, perfil) {
  state.profile = perfil;
  document.querySelectorAll('.card-perfil').forEach(card => card.classList.remove('selecionado'));
  element.classList.add('selecionado');

  const btnIniciar = document.getElementById('btn-iniciar-pcr');
  btnIniciar.disabled = false;
  btnIniciar.innerText = `INICIAR ATENDIMENTO (${perfil})`;
}

function iniciarPCR() {
  if (!state.profile) return;
  document.getElementById('tela-setup').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
  
  requestWakeLock();
  startSession();
}

// Sessão e Timer Principal
function startSession() {
  if (state.running) return;
  state.running = true;
  if (!state.startTime) state.startTime = getFormattedClock();

  registerEvent(`Início de PCR (${state.profile})`);
  speak(`Início de atendimento. Perfil ${state.profile}. Iniciar compressões.`);

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

// --- AÇÕES DO SUPORTE ---
function handleVentilacao() {
  registerEvent('Ventilação com bolsa-válvula-máscara');
  if (!state.isIntubated) {
    const ratio = state.profile === 'ADULTO' ? '30 para 2' : '15 para 2';
    speak(`Ventilação com máscara. Mantendo relação de ${ratio}.`);
  }
}

function handleIntubacao() {
  state.isIntubated = true;
  document.getElementById('ritmoPill').innerText = 'Ventilação 1 a cada 6s';
  registerEvent('Intubação / Via Aérea Avançada');
  speak("Paciente intubado. Ventilação contínua a cada 6 segundos.");
}

// --- INTERVENÇÕES ---
function handleChoque() {
  state.choqueCount++;
  document.getElementById('countChoque').innerText = state.choqueCount;
  registerEvent(`Choque aplicado (${state.choqueCount}º)`);
  speak(`Choque número ${state.choqueCount} aplicado. Reiniciar compressões imediatamente.`);
}

function handleAdrenalina() {
  state.adrenalinaCount++;
  state.lastAdrenalinaTimestamp = state.totalSeconds;
  document.getElementById('countAdrenalina').innerText = state.adrenalinaCount;
  registerEvent(`Adrenalina (${state.adrenalinaCount}ª dose)`);
  speak(`Adrenalina ${state.adrenalinaCount}ª dose administrada.`);
  hideAlert();
}

function handleAmiodarona() {
  if (state.amiodaronaCount === 0) {
    state.amiodaronaCount = 1;
    document.getElementById('countAmiodarona').innerText = 1;
    registerEvent("Amiodarona (1ª dose - 300mg)");
    speak("Amiodarona primeira dose de 300 miligramas administrada.");
  } else if (state.amiodaronaCount === 1) {
    state.amiodaronaCount = 2;
    state.lastAmiodaronaTimestamp = state.totalSeconds;
    document.getElementById('countAmiodarona').innerText = 2;
    registerEvent("Amiodarona (2ª dose - 150mg)");
    speak("Amiodarona segunda dose de 150 miligramas administrada. Atenção: Retornar ao ciclo de Adrenalina.");
    hideAlert();
  } else {
    alert("Dose máxima de Amiodarona (150mg) já administrada.");
  }
}

/// ============================================================
// TEMPORIZADOR DE CHECAGEM DE PULSO (10s AHA) & REGRAS DE TEMPO
// ============================================================
let pulseCheckTimeout = null;

// Corrigido: Atualização do timestamp da Amiodarona na 2ª dose
function handleAmiodarona() {
  if (state.amiodaronaCount === 0) {
    state.amiodaronaCount = 1;
    document.getElementById('countAmiodarona').innerText = 1;
    registerEvent("Amiodarona (1ª dose - 300mg)");
    speak("Amiodarona primeira dose de 300 miligramas administrada.");
  } else if (state.amiodaronaCount === 1) {
    state.amiodaronaCount = 2;
    state.lastAmiodaronaTimestamp = state.totalSeconds; // Guarda o segundo exato para iniciar a regra dos 3 min
    document.getElementById('countAmiodarona').innerText = 2;
    registerEvent("Amiodarona (2ª dose - 150mg)");
    speak("Amiodarona segunda dose de 150 miligramas administrada. Atenção: Retornar ao ciclo de Adrenalina.");
    hideAlert();
  } else {
    alert("Dose máxima de Amiodarona (150mg) já administrada.");
  }
}

// --- REGRAS DE TEMPO & ALERTAS POR VOZ ---
function checkIntervalRules() {
  const current = state.totalSeconds;

  // 1. Alerta de 2 minutos + Temporizador AHA de 10s para Checagem
  if (current > 0 && current % 120 === 0) {
    playBeepSound();
    showAlert("⚠️ 2 MINUTOS: Checar ritmo e pulso (máx 10s) e trocar socorrista!");
    speakPriority("Atenção: Dois minutos de manobras. Pausar para checar ritmo e pulso.");

    // Cancela o timeout anterior se houver
    if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout);

    // Contagem regressiva de 10 segundos da AHA
    pulseCheckTimeout = setTimeout(() => {
      if (state.running) {
        playBeepSound();
        showAlert("⚡ RETORNAR ÀS COMPRESSÕES!");
        speakPriority("Tempo limite de checagem atingido. Volte às compressões imediatamente e troque o socorrista.");
      }
    }, 10000); // 10 segundos cravados

    return;
  }

  // 2. Alerta de 3 Minutos para Adrenalina (pós 2ª Amiodarona)
  if (state.amiodaronaCount === 2 && state.lastAmiodaronaTimestamp) {
    const elapsedAmiodarona = current - state.lastAmiodaronaTimestamp;
    if (elapsedAmiodarona > 0 && elapsedAmiodarona % 180 === 0) {
      playBeepSound();
      showAlert("🔔 ALERTA: Aplicar Adrenalina (3 min pós 2ª Amiodarona)");
      speakPriority("Atenção: Três minutos após segunda dose de Amiodarona. Hora de aplicar Adrenalina.");
      return;
    }
  }

  // 3. Alerta de 3 Minutos para Adrenalina Contínua
  if (state.lastAdrenalinaTimestamp) {
    const elapsedAdrenalina = current - state.lastAdrenalinaTimestamp;
    if (elapsedAdrenalina > 0 && elapsedAdrenalina % 180 === 0) {
      playBeepSound();
      showAlert("🔔 ALERTA: Avaliar/Aplicar Adrenalina (intervalo de 3 min)");
      speakPriority("Atenção: Três minutos desde a última Adrenalina. Avaliar nova dose.");
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
}

// --- RESULTADOS ---
function handleRCE() {
  if (state.running) {
    state.running = false;
    clearInterval(state.timerInterval);
    if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout); // Cancela aviso de voltar a comprimir se voltar a circulação
    registerEvent("RCE — Retorno da Circulação Espontânea (Cronômetro Pausado)");
    speakPriority("Retorno da circulação espontânea confirmado. Cronômetro pausado.");
  }
}

function handleNovaPCR() {
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
}

function handleFinalizar() {
  state.running = false;
  clearInterval(state.timerInterval);
  if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout);
  state.endTime = getFormattedClock();

  if (state.wakeLock) {
    state.wakeLock.release().then(() => { state.wakeLock = null; });
  }

  registerEvent("Atendimento Finalizado");
  speakPriority("Atendimento finalizado. Gerando relatório.");

  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('reportScreen').classList.remove('hidden');

  renderReport();
}

// Tela 3 - Relatório
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