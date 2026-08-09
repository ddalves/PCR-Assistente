// Estado Global do Atendimento
let state = {
  profile: null,
  running: false,
  totalSeconds: 0,
  timerInterval: null,
  startTime: null,
  endTime: null,
  events: [],
  amiodaronaDoses: 0,
  amiodarona150Timestamp: null
};

// --- TELA 1: LÓGICA DE SELEÇÃO E INÍCIO ---

function selecionarPerfil(element, perfil) {
  state.profile = perfil;

  // Remove destaque dos outros cards
  document.querySelectorAll('.card-perfil').forEach(card => {
    card.classList.remove('selecionado');
  });

  // Destaca o card selecionado
  element.classList.add('selecionado');

  // Habilita o botão de iniciar
  const btnIniciar = document.getElementById('btn-iniciar-pcr');
  btnIniciar.disabled = false;
  btnIniciar.innerText = `INICIAR ATENDIMENTO (${perfil})`;
}

function iniciarPCR() {
  if (!state.profile) return;

  // Atualiza badge de perfil
  document.getElementById('selectedProfileBadge').innerText = `PACIENTE ${state.profile}`;

  // Transição de tela: Oculta Tela 1, Exibe Tela 2
  document.getElementById('tela-setup').classList.remove('ativa');
  document.getElementById('tela-setup').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');

  startSession();
}

// --- TELA 2: ATENDIMENTO E CRONÔMETRO ---

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

function startSession() {
  if (state.running) return;
  state.running = true;
  state.startTime = getFormattedClock();

  registerEvent(`Atendimento iniciado (${state.profile})`);

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

// Regras de Medicação (Amiodarona e Adrenalina)
function handleAmiodarona() {
  if (state.amiodaronaDoses === 0) {
    state.amiodaronaDoses = 1;
    registerEvent("Amiodarona (1ª dose - 300mg)");
  } else if (state.amiodaronaDoses === 1) {
    state.amiodaronaDoses = 2;
    state.amiodarona150Timestamp = state.totalSeconds;
    registerEvent("Amiodarona (2ª e última dose - 150mg)");
    hideAlert();
  } else {
    alert("Limite máximo de dose de Amiodarona (150mg) já atingido.");
  }
}

function handleAdrenalina() {
  registerEvent("Adrenalina (1mg)");
  hideAlert();
}

function checkMedicationRules() {
  if (state.amiodaronaDoses === 2 && state.amiodarona150Timestamp) {
    const elapsedSince150mg = state.totalSeconds - state.amiodarona150Timestamp;

    // Dispara o alerta após 3 min (180 seg) da 2ª dose de Amiodarona
    if (elapsedSince150mg >= 180) {
      showAlert("⚠️ Aplicar Adrenalina (3 min após a 2ª dose de Amiodarona)");
    }
  }
}

function showAlert(message) {
  const alertBox = document.getElementById('medAlertBox');
  document.getElementById('alertMessage').innerText = message;
  alertBox.classList.remove('hidden');
}

function hideAlert() {
  document.getElementById('medAlertBox').classList.add('hidden');
}

// --- TELA 3: RCE E RELATÓRIO FINAL ---

function finishRCE() {
  state.running = false;
  clearInterval(state.timerInterval);
  state.endTime = getFormattedClock();

  registerEvent("RCE atingido (Circulação Espontânea)");

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
  let text = `--- RELATÓRIO DE ATENDIMENTO (${state.profile}) ---\n`;
  text += `Início: ${state.startTime} | Término: ${state.endTime}\n`;
  text += `Duração Total: ${formatHHMMSS(state.totalSeconds)}\n\n`;
  text += `--- LINHA DO TEMPO ---\n`;

  state.events.forEach(ev => {
    text += `• ${ev.clock} - ${ev.label} (${ev.elapsed})\n`;
  });

  return text;
}

function copySummary() {
  const text = getPlainTextReport();
  navigator.clipboard.writeText(text).then(() => {
    alert("Resumo copiado com sucesso!");
  });
}

function sendEmail() {
  const text = getPlainTextReport();
  const subject = encodeURIComponent(`Relatório de Atendimento PCR / RCE - ${state.profile}`);
  const body = encodeURIComponent(text);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function resetApp() {
  location.reload();
}