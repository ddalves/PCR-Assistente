// ESTADO GLOBAL
let perfilSelecionado = null;
let tempoInicio = null;
let tempoTermino = null;
let timerGeral = null;
let timerBipRitmo = null;
let tempoSegundos = 0;

let bipAtivo = true;
let somMasterAtivo = true;

let timerAdrenalinaLembrete = null;
let timerAmiodaronaLembrete = null;
let wakeLock = null;

let audioCtx = null;

let contadores = {
    Choque: 0,
    Adrenalina: 0,
    Amiodarona: 0
};

let eventosLinhaTempo = [];

// MANTER TELA ACESA (Screen Wake Lock API + Reativação ao voltar)
async function ativarWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log(`WakeLock erro: ${err.message}`);
    }
}

// Reativa WakeLock caso troque de aplicativo e volte
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await ativarWakeLock();
    }
});

// VOZ ALTA (Sintetizador)
function falar(texto) {
    if (!somMasterAtivo) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.1;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    iniciarRelogioHoraReal();
    document.getElementById('btn-toggle-bip').addEventListener('click', toggleBip);
    document.getElementById('btn-som-master').addEventListener('click', toggleSomMaster);
});

// SELEÇÃO EXPLÍCITA DE PERFIL
function selecionarPerfil(elemento, perfil) {
    document.querySelectorAll('.card-perfil').forEach(c => c.classList.remove('selecionado'));
    elemento.classList.add('selecionado');
    perfilSelecionado = perfil;

    const btnIniciar = document.getElementById('btn-iniciar-pcr');
    btnIniciar.disabled = false;
    btnIniciar.classList.add('ativo');
    btnIniciar.textContent = `INICIAR PCR (${perfil})`;
}

function iniciarRelogioHoraReal() {
    setInterval(() => {
        const agora = new Date();
        document.getElementById('relogio-agora').textContent = agora.toLocaleTimeString('pt-BR');
    }, 1000);
}

function formatarTempo(segundosTotais) {
    const hrs = Math.floor(segundosTotais / 3600).toString().padStart(2, '0');
    const mins = Math.floor((segundosTotais % 3600) / 60).toString().padStart(2, '0');
    const segs = (segundosTotais % 60).toString().padStart(2, '0');
    return hrs > 0 ? `${hrs}:${mins}:${segs}` : `${mins}:${segs}`;
}

function obterHoraAtual() {
    const agora = new Date();
    return agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function alternarTela(idTela) {
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    document.getElementById(idTela).classList.add('ativa');
}

// INICIAR ATENDIMENTO
function iniciarPCR() {
    if (!perfilSelecionado) return;

    ativarWakeLock();
    tempoInicio = new Date();
    tempoSegundos = 0;
    eventosLinhaTempo = [];
    contadores = { Choque: 0, Adrenalina: 0, Amiodarona: 0 };
    atualizarContadoresUI();

    alternarTela('tela-atendimento');
    falar("Iniciar compressões");

    registrarEvento(`Atendimento iniciado (${perfilSelecionado})`);

    iniciarCronometro();
    iniciarMetronomo();
}

function iniciarCronometro() {
    if (timerGeral) clearInterval(timerGeral);
    timerGeral = setInterval(() => {
        tempoSegundos++;
        document.getElementById('cronometro-geral').textContent = formatarTempo(tempoSegundos);

        if (tempoSegundos > 0 && tempoSegundos % 120 === 0) {
            falar("Atenção: dois minutos decorridos. Checar ritmo e pulso.");
        }
    }, 1000);
}

// METRÔNOMO E SINAL LUMINOSO
function iniciarMetronomo() {
    if (timerBipRitmo) clearInterval(timerBipRitmo);
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const led = document.getElementById('sinal-luminoso');

    timerBipRitmo = setInterval(() => {
        if (bipAtivo && somMasterAtivo) {
            try {
                // Áudio via Web Audio API (continua ativo em background)
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime); // Volume reforçado
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.06);

                // Piscar o LED luminoso
                if (led) {
                    led.classList.add('pulso');
                    setTimeout(() => led.classList.remove('pulso'), 100);
                }
            } catch (e) { }
        }
    }, 545); // ~110 bpm
}

function toggleBip() {
    bipAtivo = !bipAtivo;
    document.getElementById('btn-toggle-bip').textContent = bipAtivo ? "🔔 Bip LIGADO" : "🔕 Bip DESLIGADO";
}

function toggleSomMaster() {
    somMasterAtivo = !somMasterAtivo;
    document.getElementById('btn-som-master').textContent = somMasterAtivo ? "🔊" : "🔇";
}

// AÇÕES
function acaoVentilacao() {
    if (perfilSelecionado === 'CRIANCA' || perfilSelecionado === 'BEBE') {
        falar("Iniciar 15 por 2");
        registrarAcao("Ventilação iniciada (15:2)");
    } else {
        falar("Iniciar 30 por 2");
        registrarAcao("Ventilação iniciada (30:2)");
    }
}

function registrarIntubacao() {
    falar("Via aérea avançada estabelecida. Manter ventilação contínua 1 a cada 6 segundos.");
    registrarEvento("Via aérea avançada / Intubação");
}

function registrarAdrenalina() {
    contadores.Adrenalina++;
    atualizarContadoresUI();
    registrarEvento(`Adrenalina (${contadores.Adrenalina}ª dose)`);

    if (timerAdrenalinaLembrete) clearTimeout(timerAdrenalinaLembrete);
    timerAdrenalinaLembrete = setTimeout(() => {
        falar("Atenção: 3 minutos da última Adrenalina.");
    }, 180000);
}

function registrarAmiodarona() {
    contadores.Amiodarona++;
    atualizarContadoresUI();

    if (contadores.Amiodarona === 1) {
        registrarEvento("Amiodarona. (1ª dose - 300mg)");
        if (timerAmiodaronaLembrete) clearTimeout(timerAmiodaronaLembrete);
        timerAmiodaronaLembrete = setTimeout(() => {
            falar("Atenção: Avaliar segunda dose de Amiodarona. 150 miligramas se necessário.");
        }, 180000);
    } else {
        registrarEvento(`Amiodarona (${contadores.Amiodarona}ª dose - 150mg)`);
    }
}

function registrarRCE() {
    clearInterval(timerGeral);
    if (timerBipRitmo) clearInterval(timerBipRitmo);
    falar("Retorno da circulação espontânea registrado. Cronômetro pausado.");
    registrarEvento("RCE — Retorno da circulação espontânea");
}

function registrarAcao(descricao) {
    registrarEvento(descricao);
}

function registrarMedicacao(tipo) {
    contadores[tipo]++;
    atualizarContadoresUI();
    registrarEvento(`${tipo} (${contadores[tipo]}ª dose)`);
}

function atualizarContadoresUI() {
    document.getElementById('qtd-choque').textContent = contadores.Choque;
    document.getElementById('qtd-adrenalina').textContent = contadores.Adrenalina;
    document.getElementById('qtd-amiodarona').textContent = contadores.Amiodarona;
}

function registrarEvento(descricao) {
    const hora = obterHoraAtual();
    const tempoParada = formatarTempo(tempoSegundos);
    eventosLinhaTempo.push({ hora, tempoParada, descricao });
    atualizarLinhaTempoUI();
}

function atualizarLinhaTempoUI() {
    const feed = document.getElementById('feed-linha-tempo');
    feed.innerHTML = '';
    [...eventosLinhaTempo].reverse().forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="ponto-bullet">•</span> <span class="hora-feed">${ev.hora}</span> - <strong>${ev.descricao}</strong> - <span class="tempo-decorrido">${ev.tempoParada}</span>`;
        feed.appendChild(li);
    });
}

function reiniciarPCR() {
    if (confirm("Paciente apresentou nova parada? O cronômetro será zerado para iniciar um novo evento.")) {
        tempoSegundos = 0;
        if (timerAdrenalinaLembrete) clearTimeout(timerAdrenalinaLembrete);
        if (timerAmiodaronaLembrete) clearTimeout(timerAmiodaronaLembrete);

        registrarEvento("Nova PCR identificada — Reinício de manobras");
        falar("Nova PCR identificada. Reiniciando compressões.");
        iniciarCronometro();
        iniciarMetronomo();
    }
}

function finalizarAtendimento(status) {
    tempoTermino = new Date();
    clearInterval(timerGeral);
    if (timerBipRitmo) clearInterval(timerBipRitmo);
    if (wakeLock) wakeLock.release();

    registrarEvento(`Atendimento finalizado: ${status}`);

    document.getElementById('resumo-status').textContent = `Status: ${status}`;
    document.getElementById('resumo-inicio').textContent = tempoInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('resumo-termino').textContent = tempoTermino.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('resumo-duracao').textContent = formatarTempo(tempoSegundos);

    const feedResumo = document.getElementById('feed-resumo-completo');
    feedResumo.innerHTML = '';
    eventosLinhaTempo.forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="ponto-bullet">•</span> <span class="hora-feed">${ev.hora}</span> - <strong>${ev.descricao}</strong> - <span class="tempo-decorrido">${ev.tempoParada}</span>`;
        feedResumo.appendChild(li);
    });

    alternarTela('tela-resumo');
}

function novoAtendimento() {
    clearInterval(timerGeral);
    if (timerBipRitmo) clearInterval(timerBipRitmo);

    perfilSelecionado = null;
    document.querySelectorAll('.card-perfil').forEach(c => c.classList.remove('selecionado'));

    const btnIniciar = document.getElementById('btn-iniciar-pcr');
    btnIniciar.disabled = true;
    btnIniciar.classList.remove('ativo');
    btnIniciar.textContent = 'SELECIONE UM PERFIL';

    alternarTela('tela-setup');
}

function gerarTextoResumo() {
    let texto = `=== RELATÓRIO DE ATENDIMENTO PCR ===\n`;
    texto += `Perfil: ${perfilSelecionado}\n`;
    texto += `Início: ${tempoInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
    texto += `Término: ${tempoTermino.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
    texto += `Duração Total: ${formatarTempo(tempoSegundos)}\n\n`;
    texto += `--- LINHA DO TEMPO ---\n`;
    eventosLinhaTempo.forEach(ev => {
        texto += `• ${ev.hora} - ${ev.descricao} - ${ev.tempoParada}\n`;
    });
    return texto;
}

function copiarResumo() {
    navigator.clipboard.writeText(gerarTextoResumo()).then(() => {
        alert("Resumo copiado para a área de transferência!");
    });
}

function enviarEmail() {
    const texto = gerarTextoResumo();
    const assunto = encodeURIComponent(`Relatório de PCR - ${perfilSelecionado}`);
    window.location.href = `mailto:?subject=${assunto}&body=${encodeURIComponent(texto)}`;
}