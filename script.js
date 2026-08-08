/* ==========================================================================
   ESTADO DA APLICAÇÃO E VARIÁVEIS DE CONTROLE
   ========================================================================== */
let tempoTotalSegundos = 0;
let cronometroGeral = null;
let bipMetronomo = null;

let perfilAtivo = 'adulto'; // 'adulto', 'pediatrico', 'neonato'
let viaAereaAvançada = false; // Alterna a lógica de ventilação

/* Contadores de Intervenções */
let contadores = {
    choque: 0,
    adrenalina: 0,
    amiodarona: 0
};

/* ==========================================================================
   INICIALIZAÇÃO DE EVENTOS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btn-iniciar');
    const btnIntubacao = document.getElementById('btn-intubacao');
    const btnAdrenalina = document.getElementById('btn-adrenalina');
    const btnChoque = document.getElementById('btn-choque');

    // Transição da Tela 1 (Setup) para Tela 2 (Atendimento)
    if (btnIniciar) {
        btnIniciar.addEventListener('click', iniciarAtendimento);
    }

    // Alternância de Via Aérea Avançada (IOT)
    if (btnIntubacao) {
        btnIntubacao.addEventListener('click', toggleViaAereaAvançada);
    }
});

/* ==========================================================================
   FUNÇÕES DE FLUXO E CRONÔMETRO
   ========================================================================== */
function iniciarAtendimento() {
    // Capta o perfil selecionado
    const radiosPerfil = document.getElementsByName('perfil-paciente');
    for (const radio of radiosPerfil) {
        if (radio.checked) {
            perfilAtivo = radio.value;
            break;
        }
    }

    // Troca a exibição das telas
    document.getElementById('tela-setup').style.display = 'none';
    document.getElementById('tela-atendimento').style.display = 'flex';

    // Inicia cronômetro geral
    iniciarCronometroGeral();
    
    // Registra início na linha do tempo
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

        // Alerta periódico a cada 2 minutos (120 segundos)
        if (tempoTotalSegundos > 0 && tempoTotalSegundos % 120 === 0) {
            emitirAlertaGeral("2 minutos transcorridos: Checar pulso/ritmo e trocar socorrista!");
        }
    }, 1000);
}

function toggleViaAereaAvançada(e) {
    viaAereaAvançada = !viaAereaAvançada;
    const botao = e.target;

    if (viaAereaAvançada) {
        botao.classList.add('btn-ativo');
        registrarEvento("Via Aérea Avançada (IOT) instalada. Padrão alterado para compressão contínua.");
        emitirAlertaGeral("Via Aérea Avançada ativa. Ventilação 1 a cada 6 segundos.");
    } else {
        botao.classList.remove('btn-ativo');
        registrarEvento("Retornado para Ventilação com Ambu/Máscara.");
    }
}

function registrarEvento(descricao) {
    const lista = document.getElementById('lista-eventos');
    if (!lista) return;

    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR');
    
    const item = document.createElement('li');
    item.textContent = `[${horaFormatada}] ${descricao}`;
    lista.prepend(item); // Adiciona o registro mais recente no topo
}

function emitirAlertaGeral(mensagem) {
    // Utiliza a síntese de voz nativa do navegador (Web Speech API)
    if ('speechSynthesis' in window) {
        const fala = new SpeechSynthesisUtterance(mensagem);
        fala.lang = 'pt-BR';
        window.speechSynthesis.speak(fala);
    }
    registrarEvento(`ALERTA SONORO: ${mensagem}`);
}