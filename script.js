// ============================================================
// ASSISTENTE PCR — 
// ============================================================
let state = {
  profile: null,
  running: false,
  deviceMode: 'NENHUM', 
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
  amiodaronaFirstDoseTimestamp: null,
  amiodarona2ndReminderFired: false,
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

// Inicializa o AudioContext com interação do usuário para evitar bloqueio do navegador
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ============================================================
// MOTOR DE VOZ — FILA NORMAL + FILA PRIORITÁRIA
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

function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  speechQueue.push(text);
  processSpeechQueue();
}

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
// ============================================================
const COMPRESSION_BPM = 110;
const SECONDS_PER_BEAT = 60.0 / COMPRESSION_BPM;
const SCHEDULE_AHEAD_TIME = 0.15;
const LOOKAHEAD_MS = 25;

let metronomeRunning = false;
let nextBeatTime = 0.0;
let metronomeSchedulerId = null;

function scheduleCompressionClick(time) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(1000, time);
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
  stopCompressionMetronome();
}

function resumeCompressionMetronome() {
  if (state.running) startCompressionMetronome();
}

// ============================================================
// ALARME DE ALERTA (2400Hz)
// ============================================================
const ALERT_FREQ_HZ = 2400;
const ALERT_BEEP_MS = 180;
const ALERT_REPEAT_MS = 700;

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
  stopAlertBeepLoop();
  playSingleAlertTone();
  alertBeepInterval = setInterval(playSingleAlertTone, ALERT_REPEAT_MS);
}

function stopAlertBeepLoop() {
  if (alertBeepInterval) {
    clearInterval(alertBeepInterval);
    alertBeepInterval = null;
  }
}

// ============================================================
// WAKE LOCK & RELÓGIO
// ============================================================
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        console.log("Wake Lock liberado pelo sistema — será readquirido automaticamente.");
      });
    }
  } catch (err) {
    console.log("Wake Lock não ativado:", err);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.running) {
    await requestWakeLock();
  }
});

setInterval(() => {
  if (state.running && (!state.wakeLock || state.wakeLock.released)) {
    requestWakeLock();
  }
}, 15000);

function startWallClock() {
  setInterval(() => {
    const now = new Date();
    const wallClockEl = document.getElementById('wallClock');
    if (wallClockEl) wallClockEl.innerText = now.toTimeString().substring(0, 8);
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
// SETUP & SESSÃO
// ============================================================
function selecionarPerfil(element, perfil) {
  initAudio();
  state.profile = perfil;
  document.querySelectorAll('.card-perfil').forEach(card => card.classList.remove('selecionado'));
  element.classList.add('selecionado');

  const btnIniciar = document.getElementById('btn-iniciar-pcr');
  if (btnIniciar) {
    btnIniciar.disabled = false;
    btnIniciar.innerText = `INICIAR ATENDIMENTO (${perfil})`;
  }
}

function iniciarPCR() {
  if (!state.profile) return;
  initAudio();
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
  speakPriority(`Início de atendimento. Perfil ${state.profile}. Iniciar compressões.`);
  startCompressionMetronome();

  state.timerInterval = setInterval(() => {
    state.totalSeconds++;
    const timerEl = document.getElementById('mainTimer');
    if (timerEl) timerEl.innerText = formatHHMMSS(state.totalSeconds);
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
  if (list) {
    const li = document.createElement('li');
    li.innerText = `• ${item.clock} - ${item.label} (${item.elapsed})`;
    list.insertBefore(li, list.firstChild);
  }
}

// ============================================================
// SUPORTE VENTILATÓRIO
// ============================================================
function handleVentilacao() {
  guarded('ventilacao', () => {
    initAudio();
    registerEvent('Ventilação com bolsa-válvula-máscara');

    if (!state.isIntubated) {
      const profUpper = (state.profile || '').toUpperCase();
      const isPediatric = profUpper.includes('CRIANÇA') || profUpper.includes('BEBÊ') || profUpper.includes('BEBE') || profUpper.includes('PEDIÁTRICO') || profUpper.includes('PEDIATRICO') || profUpper.includes('NEONATAL');

      if (isPediatric) {
        speak("Ventilação com máscara. Se dois socorristas, manter 15 para 2.");
      } else {
        speak("Ventilação com máscara. Mantendo relação de 30 para 2.");
      }
    } else {
      speak("Ventilação em via aérea avançada. Uma ventilação a cada 6 segundos.");
    }
  });
}

function handleIntubacao() {
  guarded('intubacao', () => {
    initAudio();
    state.isIntubated = true;
    const ritmoPill = document.getElementById('ritmoPill');
    if (ritmoPill) ritmoPill.innerText = 'Ventilação 1 a cada 6s';
    registerEvent('Intubação / Via Aérea Avançada');
    speakPriority("Paciente intubado. Transição para ventilação contínua de uma a cada 6 segundos, com compressões ininterruptas.");
  });
}

// ============================================================
// DISPOSITIVOS — DEA E MONITOR
// ============================================================
// DEA: o aparelho analisa ritmo sozinho e fala suas próprias instruções.
// O app NÃO tenta acompanhar isso — só avisa pra você prestar atenção
// no que o DEA está dizendo, e continua pedindo checagem de pulso
// (que o DEA não faz) a cada 2 minutos.
function handleDEA() {
  guarded('dea', () => {
    initAudio();
    state.deviceMode = 'DEA';
    registerEvent('DEA instalado / em uso');
    speakPriority("DEA instalado. Preste atenção às orientações do aparelho.");
  });
}

// Monitor/desfibrilador manual: ritmo fica visível continuamente na tela
// do aparelho, então checar ritmo e pulso volta a ser seguro e direto.
function handleMonitor() {
  guarded('monitor', () => {
    initAudio();
    state.deviceMode = 'MONITOR';
    registerEvent('Monitor / Desfibrilador manual conectado');
    speakPriority("Monitor conectado. Ritmo visível continuamente no aparelho.");
  });
}

// ============================================================
// INTERVENÇÕES
// ============================================================
function handleChoque() {
  guarded('choque', () => {
    initAudio();
    state.choqueCount++;
    const countChoque = document.getElementById('countChoque');
    if (countChoque) countChoque.innerText = state.choqueCount;
    registerEvent(`Choque aplicado (${state.choqueCount}º)`);
    speakPriority("Choque aplicado. Reiniciar compressões imediatamente.");
    resumeCompressionMetronome();
  });
}

function handleAdrenalina() {
  guarded('adrenalina', () => {
    initAudio();
    state.adrenalinaCount++;
    state.lastAdrenalinaTimestamp = state.totalSeconds;
    const countAdrenalina = document.getElementById('countAdrenalina');
    if (countAdrenalina) countAdrenalina.innerText = state.adrenalinaCount;
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
      state.amiodaronaFirstDoseTimestamp = state.totalSeconds;
      state.amiodarona2ndReminderFired = false;
      const countAmio = document.getElementById('countAmiodarona');
      if (countAmio) countAmio.innerText = 1;
      registerEvent("Amiodarona");
      speakPriority("Amiodarona primeira dose administrada.");
    } else if (state.amiodaronaCount === 1) {
      state.amiodaronaCount = 2;
      state.lastAmiodaronaTimestamp = state.totalSeconds;
      const countAmio = document.getElementById('countAmiodarona');
      if (countAmio) countAmio.innerText = 2;
      registerEvent("Amiodarona");
      speakPriority("Amiodarona segunda dose administrada. Atenção: Retornar ao ciclo de Adrenalina.");
      hideAlert();
    } else {
      alert("Dose máxima de Amiodarona já administrada.");
    }
  });
}

// ============================================================
// REGRAS DE TEMPO & ALERTAS (CORRIGIDO)
// ============================================================
function checkIntervalRules() {
  const current = state.totalSeconds;

  // 1. Ciclos de 2 Minutos (Troca de socorrista e avaliação de ritmo)
  if (current > 0 && current % 120 === 0) {
    pauseCompressionMetronome();
    startAlertBeepLoop();

    if (state.deviceMode === 'DEA') {
      showAlert("⚠️ 2 MINUTOS: Atenção aos comandos de voz do DEA e troque o socorrista!");
      speakPriority("Atenção: Dois minutos. Pause e preste atenção nos comandos do DEA. Trocar socorrista.");
    } else if (state.deviceMode === 'MONITOR') {
      showAlert("⚠️ 2 MINUTOS: Avaliar ritmo no monitor, checar pulso (máx 10s) e trocar socorrista!");
      speakPriority("Atenção: Dois minutos. Checar ritmo no monitor e pulso central. Trocar socorrista.");
    } else {
      showAlert("⚠️ 2 MINUTOS: Checar ritmo/pulso (máx 10s) e trocar socorrista!");
      speakPriority("Atenção: Dois minutos de manobras. Pausar para checar ritmo e pulso.");
    }

    if (pulseCheckTimeout) clearTimeout(pulseCheckTimeout);

    pulseCheckTimeout = setTimeout(() => {
      if (state.running) {
        stopAlertBeepLoop();
        hideAlert();
        speak("Tempo limite atingido. Volte às compressões imediatamente.");
        resumeCompressionMetronome();
      }
    }, 10000);
  }

  // 2. Lembrete de 2ª dose de Amiodarona (3 minutos após a 1ª dose)
  if (state.amiodaronaCount === 1 && state.amiodaronaFirstDoseTimestamp !== null && !state.amiodarona2ndReminderFired) {
    const elapsedAmio = current - state.amiodaronaFirstDoseTimestamp;
    if (elapsedAmio >= 180) {
      state.amiodarona2ndReminderFired = true;
      playSingleAlertTone();
      showAlert("💊 3 MIN: Considerar 2ª dose de Amiodarona");
      speak("Atenção: três minutos desde a primeira dose de Amiodarona. Considere a segunda dose.");
    }
  }

  // 3. Intervalo de Adrenalina (A cada 3 a 5 minutos)
  if (state.lastAdrenalinaTimestamp !== null) {
    const elapsedAdrenalina = current - state.lastAdrenalinaTimestamp;
    if (elapsedAdrenalina > 0 && elapsedAdrenalina % 180 === 0) {
      playSingleAlertTone();
      showAlert("🔔 3 MIN: Avaliar/Aplicar Adrenalina");
      speak("Atenção: três minutos desde a última Adrenalina. Avaliar nova dose.");
    }
  }
}

function showAlert(msg) {
  const alertBox = document.getElementById('medAlertBox');
  const alertMsg = document.getElementById('alertMessage');
  if (alertMsg) alertMsg.innerText = msg;
  if (alertBox) alertBox.classList.remove('hidden');
}

function hideAlert() {
  const alertBox = document.getElementById('medAlertBox');
  if (alertBox) alertBox.classList.add('hidden');
  stopAlertBeepLoop();
}

// ============================================================
// RESULTADOS E RELATÓRIO
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
    initAudio();
    registerEvent("Nova Parada Cardiorrespiratória — Reiniciando Cronômetro e Ciclos de Tempo");
    speakPriority("Nova parada cardiorrespiratória. Reiniciando cronômetro e ciclos de tempo.");

    // 1. Para temporizadores ativos para evitar múltiplos intervalos rodando em paralelo
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    if (pulseCheckTimeout) {
      clearTimeout(pulseCheckTimeout);
      pulseCheckTimeout = null;
    }

    // 2. Reseta o cronômetro do ciclo atual para zero
    state.totalSeconds = 0;

    // 3. Reseta APENAS os relógios/timestamps dos lembretes (PRESERVA os contadores totais)
    state.lastAdrenalinaTimestamp = null;
    state.lastAmiodaronaTimestamp = null;
    state.amiodaronaFirstDoseTimestamp = null;
    state.amiodarona2ndReminderFired = false;

    // 4. Atualiza o relógio principal na tela
    const timerEl = document.getElementById('mainTimer');
    if (timerEl) timerEl.innerText = "00:00:00";

    // 5. Reinicia a contagem de tempo (ciclo de 2 minutos recomeça do zero)
    state.running = true;
    state.timerInterval = setInterval(() => {
      state.totalSeconds++;
      if (timerEl) timerEl.innerText = formatHHMMSS(state.totalSeconds);
      checkIntervalRules();
    }, 1000);

    // 6. Limpa alertas na tela e retoma o metrônomo
    hideAlert();
    resumeCompressionMetronome();
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

function renderReport() {
  document.getElementById('reportProfileDisplay').innerText = state.profile || 'Não especificado';
  document.getElementById('startTimeDisplay').innerText = state.startTime || '--:--';
  document.getElementById('endTimeDisplay').innerText = state.endTime || '--:--';
  document.getElementById('totalDurationDisplay').innerText = formatHHMMSS(state.totalSeconds);

  const reportList = document.getElementById('reportLogList');
  if (reportList) {
    reportList.innerHTML = "";
    state.events.forEach(ev => {
      const li = document.createElement('li');
      li.innerText = `• ${ev.clock} - ${ev.label} (${ev.elapsed})`;
      reportList.appendChild(li);
    });
  }
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