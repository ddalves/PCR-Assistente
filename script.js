/* ==========================================================================
   ESTADO DA APLICAÇÃO E VARIÁVEIS DE CONTROLE
   ========================================================================== */
let tempoTotalSegundos = 0;
let cronometroGeral = null;
let perfilAtivo = 'adulto'; // 'adulto', 'pediatrico', 'neonato'
let viaAereaAvançada = false;

/* Temporizadores e Contadores */
let tempoUltimaAdrenalina = 0;
let timerAdrenalina = null;

let contadores = {
    choque: 0,
    adrenalina: 0,
    amiodarona: 0
};

/* ==========================================================================
   INICIALIZAÇÃO DE EVENTOS (ÚNICO DOMContentLoaded)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Botão de início
    const btnIniciar = document.getElementById('btn-iniciar');
    if (btnIniciar) btnIniciar.addEventListener('click', iniciarAtendimento);

    // Botões de suporte
    const btnIntubacao = document.getElementById('btn-intubacao');
    if (btnIntubacao) btnIntubacao.addEventListener('click', toggleViaAereaAvançada);

    // Botões de intervenção rápida
    const btnAdrenalina = document.getElementById('btn-adrenalina');
    const btnChoque = document.getElementById('btn-choque');
    const btnAmiodarona = document.getElementById('btn-amiodarona');
    const btnRce = document.getElementById('btn-rce');

    if (btnAdrenalina) btnAdrenalina.addEventListener('click', registrarAdrenalina);
    if (btnChoque) btnChoque.addEventListener('click', registrarChoque);
    if (btnAmiodarona) btnAmiodarona.addEventListener('click', registrarAmiodarona);
    if (btnRce) btnRce.addEventListener('click', registrarRCE);
});

/* ==========================================================================
   FUNÇÕES DE FLUXO E CRONÔMETRO
   ========================================================================== */
function iniciarAtendimento() {
    const radiosPerfil = document.getElementsByName('perfil-paciente');
    for (const radio of radiosPerfil) {
        if (radio.checked) {
            perfilAtivo = radio.value;
            break;
        }
    }

    document.getElementById('tela-setup').style.display = 'none';
    document.getElementById('tela-atendimento').style.display = 'flex';

    iniciarCronometroGeral();
    registrarEvento(`Atendimento iniciado. Perfil: ${perfilAtivo.toUpperCase()}`);
}

function iniciarCronometroGeral() {
    const elementoRelogio = document.getElementById('cronometro-geral');
    
    cronometroGeral = setInterval(() => {
        tempoTotalSegundos++;
        
        const horas = String(Math.floor(tempoTotalSegundos / 3600)).padStart(2, '0');
        const minutos = String(Math.floor((tempoTotalSegundos % 3600) / 60)).padStart(2, '0');
        const segundos = String(tempoTotalSegundos % 60).padStart(2, '0');

        elementoRelogio.textContent = `${horas}:${minutos}:${segundos}`;

        // Alerta de 2 minutos para troca de socorrista / checar pulso
        if (tempoTotalSegundos > 0 && tempoTotalSegundos % 120 === 0) {
            emitirAlertaGeral("2 minutos transcorridos: Checar pulso e ritmo! Trocar socorrista.");
        }
    }, 1000);
}

function toggleViaAereaAvançada(e) {
    viaAereaAvançada = !viaAereaAvançada;
    const botao = e.target;

    if (viaAereaAvançada) {
        botao.classList.add('btn-ativo');
        registrarEvento("Via Aérea Avançada (IOT) instalada. Compressão contínua.");
        emitirAlertaGeral("Via Aérea Avançada ativa. Ventilação 1 a cada 6 segundos.");
    } else {
        botao.classList.remove('btn-ativo');
        registrarEvento("Retornado para Ventilação com Ambu/Máscara.");
    }
}

/* ==========================================================================
   LÓGICA DE INTERVENÇÕES (ADRENALINA, CHOQUE, AMIODARONA, RCE)
   ========================================================================== */
function registrarAdrenalina() {
    contadores.adrenalina++;
    const elementoBotao = document.getElementById('btn-adrenalina');
    elementoBotao.textContent = `💉 Adrenalina (${contadores.adrenalina})`;
    
    registrarEvento(`Adrenalina 1mg (EV/IO) administrada. [Dose nº ${contadores.adrenalina}]`);
    emitirAlertaGeral(`Adrenalina dose ${contadores.adrenalina} registrada. Cronômetro de 3 minutos iniciado.`);

    if (timerAdrenalina) clearInterval(timerAdrenalina);
    tempoUltimaAdrenalina = 0;

    timerAdrenalina = setInterval(() => {
        tempoUltimaAdrenalina++;
        if (tempoUltimaAdrenalina === 180) {
            emitirAlertaGeral("Atenção: 3 minutos da última Adrenalina. Providenciar próxima dose.");
        }
    }, 1000);
}

function registrarChoque() {
    contadores.choque++;
    const elementoBotao = document.getElementById('btn-choque');
    elementoBotao.textContent = `⚡ Choque (${contadores.choque})`;

    const btnDea = document.getElementById('btn-dea');
    const dispositivo = (btnDea && btnDea.classList.contains('btn-ativo')) ? "DEA" : "Desfibrilador Manual";

    registrarEvento(`Choque nº ${contadores.choque} aplicado via ${dispositivo}.`);
    
    let mensagemVoz = `Choque ${contadores.choque} registrado. Reiniciar compressões imediatamente!`;

    // Regras de Amiodarona conforme quantidade de choques
    if (contadores.choque === 2 && contadores.amiodarona === 0) {
        mensagemVoz += " Considerar primeira dose de Amiodarona.";
        if (perfilAtivo === 'pediatrico' || perfilAtivo === 'neonato') {
            mensagemVoz += " Atenção paciente infantil: checar dose de Amiodarona, 5 miligramas por quilo.";
        }
    } else if (contadores.choque >= 3 && contadores.amiodarona === 1) {
        mensagemVoz += " Considerar segunda dose de Amiodarona.";
        if (perfilAtivo === 'pediatrico' || perfilAtivo === 'neonato') {
            mensagemVoz += " Checar dose infantil: 5 miligramas por quilo.";
        }
    } else if (contadores.amiodarona >= 2) {
        mensagemVoz += " Manter foco nas compressões e ciclo de Adrenalina.";
    }

    emitirAlertaGeral(mensagemVoz);
}

function registrarAmiodarona() {
    contadores.amiodarona++;
    const elementoBotao = document.getElementById('btn-amiodarona');
    
    let textoDose = (perfilAtivo === 'adulto') ? (contadores.amiodarona === 1 ? "300mg" : "150mg") : "5mg/kg";
    elementoBotao.textContent = `💊 Amiodarona (${contadores.amiodarona})`;

    registrarEvento(`Amiodarona (${textoDose}) administrada. [Dose nº ${contadores.amiodarona}]`);
    
    if (perfilAtivo === 'adulto') {
        emitirAlertaGeral(`Amiodarona dose ${contadores.amiodarona} registrada: ${textoDose}.`);
    } else {
        emitirAlertaGeral(`Amiodarona infantil registrada. Confirmar dose de 5 miligramas por quilo.`);
    }

    if (contadores.amiodarona >= 2) {
        elementoBotao.disabled = true;
        elementoBotao.style.opacity = "0.5";
    }
}

function registrarRCE() {
    clearInterval(cronometroGeral);
    if (timerAdrenalina) clearInterval(timerAdrenalina);

    registrarEvento("🟢 RETORNO DA CIRCULAÇÃO ESPONTÂNEA (RCE) CONFIRMADO!");
    emitirAlertaGeral("Retorno da circulação espontânea confirmado. Parando cronômetros e gerando relatório.");

    document.getElementById('tela-atendimento').style.display = 'none';
    document.getElementById('tela-resumo').style.display = 'block';

    gerarRelatorioFinal();
}

/* ==========================================================================
   UTILITÁRIOS DE REGISTRO E VOZ
   ========================================================================== */
function registrarEvento(descricao) {
    const lista = document.getElementById('lista-eventos');
    if (!lista) return;

    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR');
    
    const item = document.createElement('li');
    item.textContent = `[${horaFormatada}] ${descricao}`;
    lista.prepend(item);
}

function emitirAlertaGeral(mensagem) {
    if ('speechSynthesis' in window) {
        const fala = new SpeechSynthesisUtterance(mensagem);
        fala.lang = 'pt-BR';
        window.speechSynthesis.speak(fala);
    }
    registrarEvento(`ALERTA SONORO: ${mensagem}`);
}

function gerarRelatorioFinal() {
    const campoTexto = document.getElementById('texto-evolucao');
    if (!campoTexto) return;

    const lista = document.getElementById('lista-eventos');
    const itens = Array.from(lista.querySelectorAll('li')).reverse();

    let relatorio = `=== RELATÓRIO DE ATENDIMENTO DE PCR ===\n`;
    relatorio += `Perfil: ${perfilAtivo.toUpperCase()}\n`;
    relatorio += `Tempo Total de Manobras: ${document.getElementById('cronometro-geral').textContent}\n`;
    relatorio += `Total de Choques: ${contadores.choque}\n`;
    relatorio += `Total de Adrenalina: ${contadores.adrenalina} mg\n`;
    relatorio += `Total de Amiodarona: ${contadores.amiodarona} dose(s)\n\n`;
    relatorio += `--- LINHA DO TEMPO DETALHADA ---\n`;

    itens.forEach(item => {
        relatorio += `${item.textContent}\n`;
    });

    campoTexto.value = relatorio;
}