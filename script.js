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

// --- WAKE LOCK (Impedir que a tela apague) ---
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.log("Wake Lock não ativado:", err);
  }
}

// --- SÍNTESE DE VOZ E BEEP ---
function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Cancela falas anteriores
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }
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
    console.log("Erro de áudio Context");
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
  speak("Paciente intubado. Transição para ventilação contínua: uma ventilação a cada 6 segundos e compressões ininterruptas.");
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

// --- REGRAS DE TEMPO & ALERTAS POR VOZ ---
function checkIntervalRules() {
  const current = state.totalSeconds;

  // 1. Alerta de 2 minutos (Checar pulso e ritmo)
  if (current > 0 && current % 120 === 0) {
    playBeepSound();
    showAlert("⚠️ 2 MINUTOS: Checar ritmo e trocar socorrista!");
    speak("Atenção: Dois minutos de manobras. Pausar para checar ritmo e trocar o socorrista.");
  }

  // 2. Alerta para Ventilação Contínua (a cada 6s se intubado)
  if (state.isIntubated && current % 6 === 0) {
    // Tom discreto opcional
  }

  // 3. Regra de 3 Minutos para Adrenalina (pós 2ª Amiodarona ou ciclo normal)
  if (state.amiodaronaCount === 2 && state.lastAmiodaronaTimestamp) {
    const elapsedAmiodarona = current - state.lastAmiodaronaTimestamp;
    if (elapsedAmiodarona > 0 && elapsedAmiodarona % 180 === 0) {
      playBeepSound();
      showAlert("🔔 ALERTA: Aplicar Adrenalina (3 min pós 2ª Amiodarona)");
      speak("Atenção: Três minutos após segunda dose de Amiodarona. Hora de aplicar Adrenalina.");
      return;
    }
  }

  if (state.lastAdrenalinaTimestamp) {
    const elapsedAdrenalina = current - state.lastAdrenalinaTimestamp;
    if (elapsedAdrenalina > 0 && elapsedAdrenalina % 180 === 0) {
      playBeepSound();
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
}

// --- RESULTADOS ---
function handleRCE() {
  if (state.running) {
    state.running = false;
    clearInterval(state.timerInterval);
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

// Tela 3
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