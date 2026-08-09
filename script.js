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
  lastAdrenalinaTimestamp: null,
  lastAmiodaronaTimestamp: null
};

// Emissor de Alerta Sonoro
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Tom A5
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
  } catch (e) {
    console.log("AudioContext não ativado");
  }
}

// Relógio da Barra Superior
function startWallClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('wallClock').innerText = now.toTimeString().substring(0, 8);
  }, 1000);
}
startWallClock();

// Formatação HH:MM:SS
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
  startSession();
}

// Sessão e Timer Principal
function startSession() {
  if (state.running) return;
  state.running = true;
  if (!state.startTime) state.startTime = getFormattedClock();

  registerEvent(`Início de PCR (${state.profile})`);

  state.timerInterval = setInterval(() => {
    state.totalSeconds++;
    document.getElementById('mainTimer').innerText = formatHHMMSS(state.totalSeconds);
    checkMedicationRules();
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

// Intervenções
function handleChoque() {
  state.choqueCount++;
  document.getElementById('countChoque').innerText = state.choqueCount;
  registerEvent(`Choque aplicado (${state.choqueCount}º)`);
}

function handleAdrenalina() {
  state.adrenalinaCount++;
  state.lastAdrenalinaTimestamp = state.totalSeconds;
  document.getElementById('countAdrenalina').innerText = state.adrenalinaCount;
  registerEvent(`Adrenalina (${state.adrenalinaCount}ª dose)`);
}

function handleAmiodarona() {
  if (state.amiodaronaCount === 0) {
    state.amiodaronaCount = 1;
    document.getElementById('countAmiodarona').innerText = 1;
    registerEvent("Amiodarona (1ª dose - 300mg)");
  } else if (state.amiodaronaCount === 1) {
    state.amiodaronaCount = 2;
    state.lastAmiodaronaTimestamp = state.totalSeconds;
    document.getElementById('countAmiodarona').innerText = 2;
    registerEvent("Amiodarona (2ª dose - 150mg)");
  } else {
    alert("Dose máxima de Amiodarona (150mg) já administrada.");
  }
}

// Regra de Alerta Sonoro a cada 3 minutos (180s)
function checkMedicationRules() {
  // Alerta de Adrenalina 3 min após a 2ª dose de Amiodarona
  if (state.amiodaronaCount === 2 && state.lastAmiodaronaTimestamp) {
    const elapsedAmiodarona = state.totalSeconds - state.lastAmiodaronaTimestamp;
    if (elapsedAmiodarona > 0 && elapsedAmiodarona % 180 === 0) {
      playBeepSound();
      return;
    }
  }

  // Alerta de Adrenalina a cada 3 min
  if (state.lastAdrenalinaTimestamp) {
    const elapsedAdrenalina = state.totalSeconds - state.lastAdrenalinaTimestamp;
    if (elapsedAdrenalina > 0 && elapsedAdrenalina % 180 === 0) {
      playBeepSound();
    }
  }
}

// Resultados
function handleRCE() {
  if (state.running) {
    state.running = false;
    clearInterval(state.timerInterval);
    registerEvent("RCE — Retorno da Circulação Espontânea (Cronômetro Pausado)");
  }
}

function handleNovaPCR() {
  registerEvent("Nova Parada Cardiorrespiratória — Reiniciando Cronômetro");
  state.totalSeconds = 0;
  document.getElementById('mainTimer').innerText = "00:00:00";
  
  if (!state.running) {
    state.running = true;
    state.timerInterval = setInterval(() => {
      state.totalSeconds++;
      document.getElementById('mainTimer').innerText = formatHHMMSS(state.totalSeconds);
      checkMedicationRules();
    }, 1000);
  }
}

function handleFinalizar() {
  state.running = false;
  clearInterval(state.timerInterval);
  state.endTime = getFormattedClock();

  registerEvent("Atendimento Finalizado");

  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('reportScreen').classList.remove('hidden');

  renderReport();
}

// Tela 3: Relatório Final
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