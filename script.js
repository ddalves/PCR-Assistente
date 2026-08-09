// ESTADO GLOBAL DO APLICATIVO
let perfilSelecionado = 'ADULTO';
let tempoInicio = null;
let tempoTermino = null;
let timerGeral = null;
let timerBipRitmo = null;
let tempoSegundos = 0;

let bipAtivo = true;
let somMasterAtivo = true;

// Estado dos Equipamentos Conectados
let deaConectado = false;
let monitorConectado = false;

let contadores = {
    Choque: 0,
    Adrenalina: 0,
    Amiodarona: 0
};

let eventosLinhaTempo = [];

// SINTETIZADOR DE VOZ
function falar(texto) {
    if (!somMasterAtivo) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Cancela falas em andamento
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.1; // Velocidade ligeiramente rápida para emergência
        window.speechSynthesis.speak(utterance);
    }
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    iniciarRelogioHoraReal();

    document.getElementById('btn-iniciar-atendimento').addEventListener('click', iniciarPCR);
    document.getElementById('btn-toggle-bip').addEventListener('click', toggleBip);
    document.getElementById('btn-som-master').addEventListener('click', toggleSomMaster);
});

// RELÓGIO TOPO
function iniciarRelogioHoraReal() {
    setInterval(() => {
        const agora = new Date();
        document.getElementById('relogio-agora').textContent = agora.toLocaleTimeString('pt-BR');
    }, 1000);
}

// FORMATADORES DE TEMPO
function formatarTempo(segundosTotais) {
    const hrs = Math.floor(segundosTotais / 3600).toString().padStart(2, '0');
    const mins = Math.floor((segundosTotais % 3600) / 60).toString().padStart(2, '0');
    const segs = (segundosTotais % 60).toString().padStart(2, '0');
    
    // Retorna HH:MM:SS se durar mais de 1 hora, ou MM:SS para atendimentos normais
    return hrs > 0 ? `${hrs}:${mins}:${segs}` : `${mins}:${segs}`;
}

function obterHoraAtual() {
    const agora = new Date();
    // Retorna no formato HH:MM (ex: 12:01)
    return agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// CONTROLADOR DE NAVEGAÇÃO
function alternarTela(idTela) {
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    document.getElementById(idTela).classList.add('ativa');
}

// INICIAR ATENDIMENTO
function iniciarPCR() {
    const radioPerfil = document.querySelector('input[name="perfil-paciente"]:checked');
    if (radioPerfil) perfilSelecionado = radioPerfil.value;

    tempoInicio = new Date();
    tempoSegundos = 0;
    eventosLinhaTempo = [];
    deaConectado = false;
    monitorConectado = false;
    contadores = { Choque: 0, Adrenalina: 0, Amiodarona: 0 };
    atualizarContadoresUI();

    alternarTela('tela-atendimento');
    
    // Comando vocal inicial
    falar("Iniciar compressão");

    // Evento Inicial na Linha do Tempo
    registrarEvento(`Atendimento iniciado (${perfilSelecionado})`);

    // Cronômetro Principal
    timerGeral = setInterval(() => {
        tempoSegundos++;
        document.getElementById('cronometro-geral').textContent = formatarTempo(tempoSegundos);

        // ALERTA DE CICLO DE 2 MINUTOS (120 SEGUNDOS)
        if (tempoSegundos > 0 && tempoSegundos % 120 === 0) {
            dispararAlertaDoisMinutos();
        }
    }, 1000);

    iniciarMetronomo();
}

// ALERTA VOCAL DE 2 MINUTOS
function dispararAlertaDoisMinutos() {
    let mensagemAlerta = "Atenção: dois minutos decorridos. Trocar socorrista. ";

    if (monitorConectado) {
        mensagemAlerta += "Reavaliar ritmo no monitor e checar pulso.";
    } else if (deaConectado) {
        mensagemAlerta += "Reavaliar ritmo no DEA.";
    } else {
        mensagemAlerta += "Reavaliar paciente.";
    }

    falar(mensagemAlerta);
    registrarEvento(`⚠️ Ciclo 2 min concluído - Troca de socorrista`);
}

// METRÔNOMO (BIP + LUZ)
function iniciarMetronomo() {
    if (timerBipRitmo) clearInterval(timerBipRitmo);
    
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Intervalo de ~110 BPM (545ms)
    timerBipRitmo = setInterval(() => {
        // Flash na Luz Central
        const luz = document.getElementById('luz-ritmo');
        if (luz) {
            luz.classList.add('piscando');
            setTimeout(() => luz.classList.remove('piscando'), 120);
        }

        // Bip Sonoro
        if (bipAtivo && somMasterAtivo) {
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.05);
            } catch (e) { }
        }
    }, 545);
}

function toggleBip() {
    bipAtivo = !bipAtivo;
    const btn = document.getElementById('btn-toggle-bip');
    btn.textContent = bipAtivo ? "🔔 Bip LIGADO" : "🔕 Bip DESLIGADO";
}

function toggleSomMaster() {
    somMasterAtivo = !somMasterAtivo;
    document.getElementById('btn-som-master').textContent = somMasterAtivo ? "🔊" : "🔇";
}

// AÇÃO DE VENTILAÇÃO DIFERENCIADA POR PERFIL
function acaoVentilacao() {
    if (perfilSelecionado === 'CRIANCA' || perfilSelecionado === 'BEBE') {
        falar("Iniciar 15 por 2");
        registrarAcao("Ventilação iniciada (15:2)");
    } else {
        falar("Iniciar 30 por 2");
        registrarAcao("Ventilação iniciada (30:2)");
    }
}

// REGISTRO DE EVENTOS E SUPORTE
function registrarAcao(descricao) {
    if (descricao.includes('DEA')) {
        deaConectado = true;
    }
    if (descricao.includes('Monitor')) {
        monitorConectado = true;
    }
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
    const tempoDecorrito = formatarTempo(tempoSegundos);
    
    const evento = {
        hora: hora,
        tempoParada: tempoDecorrito,
        descricao: descricao
    };

    eventosLinhaTempo.push(evento);
    atualizarLinhaTempoUI();
}

// ATUALIZA A LINHA DO TEMPO EM TEMPO REAL (• HH:MM - Evento - MM:SS)
function atualizarLinhaTempoUI() {
    const feed = document.getElementById('feed-linha-tempo');
    feed.innerHTML = '';

    [...eventosLinhaTempo].reverse().forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>
                <span class="ponto-bullet">•</span> 
                <span class="hora-feed">${ev.hora}</span> - 
                <strong class="texto-evento">${ev.descricao}</strong> - 
                <span class="tempo-decorrido">${ev.tempoParada}</span>
            </span>
        `;
        feed.appendChild(li);
    });
}

// FINALIZAÇÃO
function finalizarAtendimento(status) {
    tempoTermino = new Date();
    clearInterval(timerGeral);
    if (timerBipRitmo) clearInterval(timerBipRitmo);

    registrarEvento(`Atendimento finalizado: ${status}`);

    document.getElementById('resumo-status').textContent = `Finalizado com ${status}`;
    document.getElementById('resumo-inicio').textContent = tempoInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('resumo-termino').textContent = tempoTermino.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('resumo-duracao').textContent = formatarTempo(tempoSegundos);

    const feedResumo = document.getElementById('feed-resumo-completo');
    feedResumo.innerHTML = '';
    
    eventosLinhaTempo.forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>
                <span class="ponto-bullet">•</span> 
                <span class="hora-feed">${ev.hora}</span> - 
                <strong>${ev.descricao}</strong> - 
                <span class="tempo-decorrido">${ev.tempoParada}</span>
            </span>
        `;
        feedResumo.appendChild(li);
    });

    alternarTela('tela-resumo');
}

function reiniciarPCR() {
    if (confirm("Deseja reiniciar a PCR? O histórico atual será zerado.")) {
        iniciarPCR();
    }
}

function novoAtendimento() {
    clearInterval(timerGeral);
    if (timerBipRitmo) clearInterval(timerBipRitmo);
    alternarTela('tela-setup');
}

// AÇÕES DA TELA DE RESUMO
function gerarTextoResumo() {
    let texto = `=== RESUMO DE ATENDIMENTO PCR ===\n`;
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
    const texto = gerarTextoResumo();
    navigator.clipboard.writeText(texto).then(() => {
        alert("Resumo copiado para a área de transferência!");
    });
}

function enviarEmail() {
    const texto = gerarTextoResumo();
    const assunto = encodeURIComponent(`Relatório de PCR - ${perfilSelecionado} (${tempoInicio.toLocaleDateString('pt-BR')})`);
    const corpo = encodeURIComponent(texto);
    
    window.location.href = `mailto:?subject=${assunto}&body=${corpo}`;
}