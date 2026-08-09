// Estado Global
let state = {
  running: false,
  totalSeconds: 0,
  timerInterval: null,
  startTime: null,
  endTime: null,
  events: [],
  amiodaronaDoses: 0, // 0: Nenhuma, 1: 300mg, 2: 150mg (Final)
  amiodarona150Timestamp: null
};

// Formatação HH:MM:SS
function formatHHMMSS(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Obter Hora Atual HH:MM
function getFormattedClock() {
  const now = new Date();
  return now.toTimeString().substring(0, 5);
}

// Inicialização Automática do Atendimento
function startSession() {
  if (state.running) return;
  state.running = true;
  state.startTime = getFormattedClock();
  
  registerEvent("Atendimento Iniciado");

  state.timerInterval = setInterval(() => {
    state.totalSeconds++;
    document.getElementById("mainTimer").innerText = formatHHMMSS(state.totalSeconds);
    checkMedicationRules();
  }, 1000);
}

// Registrar Eventos Gerais
function registerEvent(description) {
  if (!state.running) startSession();

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

// Renderiza a lista em tempo real
function renderLiveLog(item) {
  const list = document.getElementById("liveLogList");
  const li = document.createElement("li");
  li.innerText = `• ${item.clock} - ${item.label} (${item.elapsed})`;
  list.insertBefore(li, list.firstChild);
}

// Regra da Amiodarona (1ª Dose 300mg / 2ª Dose 150mg)
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

// Registro de Adrenalina
function handleAdrenalina() {
  registerEvent("Adrenalina (1mg)");
  hideAlert();
}

// Checagem Contínua das Regras de Medicação
function checkMedicationRules() {
  // Regra: Após a dose de 150mg de Amiodarona, aguarda 3 minutos (180 segundos) para solicitar Adrenalina
  if (state.amiodaronaDoses === 2 && state.amiodarona150Timestamp) {
    const elapsedSince150mg = state.totalSeconds - state.amiodarona150Timestamp;
    
    if (elapsedSince150mg >= 180) {
      showAlert("⚠️ Aplicar Adrenalina (3 min após a 2ª dose de Amiodarona)");
    }
  }
}

function showAlert(message) {
  const alertBox = document.getElementById("medAlertBox");
  document.getElementById("alertMessage").innerText = message;
  alertBox.classList.remove("hidden");
}

function hideAlert() {
  document.getElementById("medAlertBox").classList.add("hidden");
}

// Finalização por RCE
function finishRCE() {
  state.running = false;
  clearInterval(state.timerInterval);
  state.endTime = getFormattedClock();
  
  registerEvent("RCE atingido (Circulação Espontânea)");

  // Alterna as Telas
  document.getElementById("mainScreen").classList.add("hidden");
  document.getElementById("reportScreen").classList.remove("hidden");

  renderReport();
}

// Preenche a Tela de Relatório
function renderReport() {
  document.getElementById("startTimeDisplay").innerText = state.startTime;
  document.getElementById("endTimeDisplay").innerText = state.endTime;
  document.getElementById("totalDurationDisplay").innerText = formatHHMMSS(state.totalSeconds);

  const reportList = document.getElementById("reportLogList");
  reportList.innerHTML = "";

  state.events.forEach(ev => {
    const li = document.createElement("li");
    li.innerText = `• ${ev.clock} - ${ev.label} (${ev.elapsed})`;
    reportList.appendChild(li);
  });
}

// Formatação do Relatório em Texto Puro
function getPlainTextReport() {
  let text = `--- RELATÓRIO DE ATENDIMENTO ---\n`;
  text += `Início: ${state.startTime} | Término: ${state.endTime}\n`;
  text += `Duração Total: ${formatHHMMSS(state.totalSeconds)}\n\n`;
  text += `--- LINHA DO TEMPO ---\n`;

  state.events.forEach(ev => {
    text += `• ${ev.clock} - ${ev.label} (${ev.elapsed})\n`;
  });

  return text;
}

// Botão Copiar Resumo
function copySummary() {
  const text = getPlainTextReport();
  navigator.clipboard.writeText(text).then(() => {
    alert("Resumo copiado com sucesso!");
  });
}

// Botão Enviar por E-mail
function sendEmail() {
  const text = getPlainTextReport();
  const subject = encodeURIComponent("Relatório de Atendimento PCR / RCE");
  const body = encodeURIComponent(text);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

// Reiniciar Aplicação
function resetApp() {
  location.reload();
}