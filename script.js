let state = {
  profile: null,
  running: false,
  totalSeconds: 0,
  timerInterval: null,
  beatActive: true,
  startTime: null,
  endTime: null,
  events: [],
  choqueCount: 0,
  adrenalinaCount: 0,
  amiodaronaCount: 0,
  isIntubated: false,
  equipamentoRitmo: 'NENHUM', // 'DEA' ou 'MONITOR'
  lastAdrenalinaTimestamp: null,
  lastAmiodaronaTimestamp: null,
  wakeLock: null
};

// --- MOTOR DE ÁUDIO DE ALTA PRECISÃO (WEB AUDIO SCHEDULER) ---
let audioCtx = null;
let nextNoteTime = 0.0;     // Quando o próximo bip deve tocar (em segundos do Web Audio)
let timerID = null;         // Timer da thread de agendamento
const tempo = 110.0;        // 110 BPM
const lookahead = 25.0;     // Frequência de checagem do agendador (em ms)
const scheduleAheadTime = 0.1; // Quanto tempo à frente agendar o áudio (em segundos)

// Desbloqueia o motor de áudio e a síntese de voz na interação do usuário
function unlockAudioEngine() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.resume();
  }
}

// Agenda o bip seco e agudo (estilo metrônomo médico)
function scheduleBeep(time) {
  if (!state.running) return;

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine'; // Onda senoidal pura
    osc.frequency.setValueAtTime(2200, time); // 2.200 Hz (Agudo/Alertante)

    // Volume mais alto e ataque instantâneo (Sem reverberação)
    gain.gain.setValueAtTime(0.7, time); // Volume aumentado (0.7)
    
    // Corte seco aos 100 ms (~0.1s) sem rabo de som
    gain.gain.setValueAtTime(0.7, time + 0.09);
    gain.gain.linearRampToValueAtTime(0.001, time + 0.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.1); // Duração exata de 100ms
  } catch (e) {
    console.error("Erro no agendador de áudio:", e);
  }
}

// Avança o tempo do próximo bip com base nos 110 BPM (60 / 110 = 0.5454...s)
function nextNote() {
  const secondsPerBeat = 60.0 / tempo;
  nextNoteTime += secondsPerBeat;
}

// Loop contínuo que roda em background agendando os sons futuros
function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    scheduleBeep(nextNoteTime);
    nextNote();
  }
  timerID = setTimeout(scheduler, lookahead);
}

function startMetronome() {
  unlockAudioEngine();
  if (!state.running) return;

  // Reseta a linha do tempo do agendador para o tempo atual do contexto
  nextNoteTime = audioCtx.currentTime + 0.05;
  scheduler();
}

function stopMetronome() {
  if (timerID) {
    clearTimeout(timerID);
    timerID = null;
  }
}

function toggleBeat() {
  state.beatActive = !state.beatActive;
  const btn = document.getElementById('btnToggleBeat');
  if (btn) {
    btn.innerText = state.beatActive ? "🎵 Bip On" : "🔇 Bip Off";
  }

  if (state.beatActive && state.running) {
    startMetronome();
  } else {
    stopMetronome();
  }
}

// Síntese Vocal Nativa (Não interfere no AudioContext do Metrônomo)
function speak(text) {
  unlockAudioEngine();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// Alerta Sonoro Duplo para Intervalos Clínicos (2 min, Adrenalina, etc)
function playBeepSound() {
  try {
    unlockAudioEngine();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(900, now + 0.15);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.log("Erro no sinal de alerta:", e);
  }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.log("Wake Lock indisponível:", err);
  }
}

function startWallClock() {
  setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('wallClock');
    if (clockEl) clockEl.innerText = now.toTimeString().substring(0, 8);
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

// --- FLUXO DA APLICAÇÃO ---

function selecionarPerfil(element, perfil) {
  unlockAudioEngine(); // Garante o destravamento já na seleção
  state.profile = perfil;
  document.querySelectorAll('.card-perfil').forEach(card => card.classList.remove('selecionado'));
  element.classList.add('selecionado');

  const btnIniciar = document.getElementById('btn-iniciar-pcr');
  btnIniciar.disabled = false;
  btnIniciar.innerText = `INICIAR ATENDIMENTO (${perfil})`;
}

function iniciarPCR() {
  if (!state.profile) return;
  unlockAudioEngine(); // Confirma ativação de áudio na transição de tela

  document.getElementById('tela-setup').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');

  requestWakeLock();
  startSession();
}

function startSession() {
  if (state.running) return;
  state.running = true;
  if (!state.startTime) state.startTime = getFormattedClock();

  registerEvent(`Início de PCR (${state.profile})`);
  
  // Dispara o agendador de alta precisão e a voz
  startMetronome();
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
  if (!list) return;
  const li = document.createElement('li');
  li.innerText = `• ${item.clock} - ${item.label} (${item.elapsed})`;
  list.insertBefore(li, list.firstChild);
}

// --- BOTÕES DE AÇÃO E REGISTRO DE EVENTOS ---

function handleDEA() {
  state.equipamentoRitmo = 'DEA';
  registerEvent('DEA instalado / analisando');
  speak("D E A instalado. Siga as instruções do aparelho.");
}

function handleMonitor() {
  state.equipamentoRitmo = 'MONITOR';
  registerEvent('Monitor cardíaco instalado');
  speak("Monitor cardíaco instalado.");
}

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
  speak("Paciente intubado. Transição para ventilação contínua: uma ventilação a cada 6 segundos e compressões ininterruptas.");
}

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
    speak("Amiodarona segunda dose de 150 miligramas administrada. Retornar ao ciclo de Adrenalina.");
    hideAlert();
  } else {
    alert("Dose máxima de Amiodarona (150mg) já administrada.");
  }
}

// --- CHECAGEM CONTINUA DE REGRAS ---

function checkIntervalRules() {
  const current = state.totalSeconds;

  // 1. Alerta de 2 Minutos (Diferenciação DEA vs Monitor)
  if (current > 0 && current % 120 === 0) {
    playBeepSound();
    
    if (state.equipamentoRitmo === 'DEA') {
      showAlert("⚠️ 2 MINUTOS: Pausar manobras e seguir orientações do DEA!");
      speak("Atenção: Dois minutos. Pausar manobras, trocar socorrista e seguir as orientações do D E A.");
    } else {
      showAlert("⚠️ 2 MINUTOS: Pausar, checar ritmo, pulso e trocar socorrista!");
      speak("Atenção: Dois minutos. Pausar manobras, checar ritmo e pulso, e trocar o socorrista.");
    }
  }

  // 2. Alerta de Ventilação a cada 6s quando intubado
  if (state.isIntubated && current > 0 && current % 6 === 0) {
    speak("Ventilar.");
  }

  // 3. Regra de Adrenalina (a cada 3 minutos)
  if (state.amiodaronaCount === 2 && state.lastAmiodaronaTimestamp) {
    const elapsedAmiodarona = current - state.lastAmiodaronaTimestamp;
    if (elapsedAmiodarona > 0 && elapsedAmiodarona % 180 === 0) {
      playBeepSound();
      showAlert("🔔 ALERTA: Aplicar Adrenalina (3 min pós 2ª Amiodarona)");
      speak("Atenção: Três minutos após segunda dose de Amiodarona. Aplicar Adrenalina.");
      return;
    }
  }

  if (state.lastAdrenalinaTimestamp) {
    const elapsedAdrenalina = current - state.lastAdrenalinaTimestamp;
    if (elapsedAdrenalina > 0 && elapsedAdrenalina % 180 === 0) {
      playBeepSound();
      showAlert("🔔 ALERTA: Avaliar/Aplicar Adrenalina (3 min)");
      speak("Atenção: Três minutos desde a última Adrenalina. Avaliar nova dose.");
    }
  }
}

function showAlert(msg) {
  const alertBox = document.getElementById('medAlertBox');
  if (alertBox) {
    document.getElementById('alertMessage').innerText = msg;
    alertBox.classList.remove('hidden');
  }
}

function hideAlert() {
  const alertBox = document.getElementById('medAlertBox');
  if (alertBox) alertBox.classList.add('hidden');
}

// --- FINALIZAÇÃO E REINÍCIO ---

function handleRCE() {
  if (state.running) {
    state.running = false;
    clearInterval(state.timerInterval);
    stopMetronome();
    registerEvent("RCE — Retorno da Circulação Espontânea (Cronômetro Pausado)");
    speak("Retorno da circulação espontânea confirmado. Cronômetro pausado. Iniciar cuidados pós-parada.");
  }
}

function handleNovaPCR() {
  registerEvent("Nova Parada Cardiorrespiratória — Reiniciando Cronômetro");
  speak("Nova parada cardiorrespiratória. Reiniciando cronômetro e compressões.");
  state.totalSeconds = 0;
  document.getElementById('mainTimer').innerText = "00:00:00";

  if (!state.running) {
    state.running = true;
    startMetronome();
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
  stopMetronome();
  state.endTime = getFormattedClock();

  if (state.wakeLock) {
    state.wakeLock.release().then(() => { state.wakeLock = null; });
  }

  registerEvent("Atendimento Finalizado");
  speak("Atendimento finalizado. Gerando relatório.");

  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('reportScreen').classList.remove('hidden');

  renderReport();
}

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