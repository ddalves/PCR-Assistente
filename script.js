/* ==========================================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ========================================================================== */
let tempoTotalSegundos = 0;
let cronometroGeral = null;
let perfilAtivo = 'adulto';
let somMutado = false;

let horaInicioStr = "";
let horaTerminoStr = "";

let contadores = {
    choque: 0,
    adrenalina: 0,
    amiodarona: 0
};

let historicoEventos = [];

/* ==========================================================================
   INICIALIZAÇÃO
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Relógio de topo
    setInterval(atualizarRelogioTopo, 1000);

    document.getElementById('btn-iniciar').addEventListener('click', iniciarAtendimento);
    document.getElementById('btn-mute').addEventListener('click', toggleMute);

    // Intervenções
    document.getElementById('btn-choque').addEventListener('click', registrarChoque);
    document.getElementById('btn-adrenalina').addEventListener('click', registrarAdrenalina);
    document.getElementById('btn-amiodarona').addEventListener('click', registrarAmiodarona);
    document.getElementById('btn-checar-pulso').addEventListener('click', () => {
        registrarEvento("Checagem de pulso realizada.");
    });

    // Controle de fluxo
    document.getElementById('btn-rce').addEventListener('click', () => concluirAtendimento("ROSC"));
    document.getElementById('btn-finalizar').addEventListener('click', () => concluirAtendimento("Finalizado"));
    document.getElementById('btn-nova-pcr').addEventListener('click', resetarNovaPCR);
    document.getElementById('btn-novo-atendimento').addEventListener('click', () => location.reload());
    document.getElementById('btn-copiar').addEventListener('click', copiarResumoTextual);
});

function atualizarRelogioTopo() {
    const agora = new Date();
    document.getElementById('relogio-atual').textContent = agora.toLocaleTimeString('pt-BR');
}

function toggleMute() {
    somMutado = !somMutado;
    document.getElementById('btn-mute').textContent = somMutado ? "🔇" : "🔊";
}

/* ==========================================================================
   FLUXO DE ATENDIMENTO
   ========================================================================== */
function iniciarAtendimento() {
    const radios = document.getElementsByName('perfil-paciente');
    for (const r of radios) {
        if (r.checked) perfilAtivo = r.value;
    }

    horaInicioStr = new Date().toLocaleTimeString('pt-BR');
    
    document.getElementById('tela-setup').style.display = 'none';
    document.getElementById('tela-atendimento').style.display = 'flex';

    iniciarCronometro();
    registrarEvento(`Atendimento iniciado. Perfil: ${perfilAtivo.toUpperCase()}`);
}

function iniciarCronometro() {
    cronometroGeral = setInterval(() => {
        tempoTotalSegundos++;
        
        const h = String(Math.floor(tempoTotalSegundos / 3600)).padStart(2, '0');
        const m = String(Math.floor((tempoTotalSegundos % 3600) / 60)).padStart(2, '0');
        const s = String(tempoTotalSegundos % 60).padStart(2, '0');

        document.getElementById('cronometro-geral').textContent = `${h}:${m}:${s}`;

        // Alerta de 2 minutos para checar pulso/ciclo
        if (tempoTotalSegundos > 0 && tempoTotalSegundos % 120 === 0) {
            emitirAlertaGeral("2 minutos. Checar pulso e trocar socorrista.");
        }
    }, 1000);
}

/* ==========================================================================
   REGISTROS E ALERTAS ENXUTOS
   ========================================================================== */
function registrarAdrenalina() {
    contadores.adrenalina++;
    document.getElementById('btn-adrenalina').textContent = `💉 Adrenalina (${contadores.adrenalina})`;
    
    registrarEvento(`Adrenalina 1mg administrada. Dose nº ${contadores.adrenalina}`);
    emitirAlertaGeral("Adrenalina registrada.");
}

function registrarChoque() {
    contadores.choque++;
    document.getElementById('btn-choque').textContent = `⚡ Choque (${contadores.choque})`;

    // Zera o contador visual do ciclo de 2 min
    tempoTotalSegundos = 0;

    registrarEvento(`Choque nº ${contadores.choque} aplicado.`);
    emitirAlertaGeral("Choque registrado.");
}

function registrarAmiodarona() {
    contadores.amiodarona++;
    document.getElementById('btn-amiodarona').textContent = `💊 Amiodarona (${contadores.amiodarona})`;

    const textoDose = contadores.amiodarona === 1 ? "1ª dose" : "2ª dose";
    registrarEvento(`Amiodarona ${textoDose} administrada.`);
    emitirAlertaGeral(`Amiodarona ${textoDose} registrada.`);
}

function resetarNovaPCR() {
    // Zera cronômetro sem apagar a linha do tempo
    tempoTotalSegundos = 0;
    registrarEvento("⚠️ Nova PCR identificada. Cronômetro reiniciado.");
    emitirAlertaGeral("Nova PCR. Cronômetro zerado.");
}

/* ==========================================================================
   GERAÇÃO DA LINHA DO TEMPO E RESUMO
   ========================================================================== */
function registrarEvento(descricao) {
    const hora = new Date().toLocaleTimeString('pt-BR');
    const evento = { hora, descricao };
    historicoEventos.unshift(evento);

    const lista = document.getElementById('lista-eventos-atendimento');
    const item = document.createElement('li');
    item.innerHTML = `<span>${descricao}</span> <small style="color: #64748b;">${hora}</small>`;
    lista.prepend(item);
}

function emitirAlertaGeral(mensagem) {
    if (!somMutado && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Cancela falas anteriores
        const fala = new SpeechSynthesisUtterance(mensagem);
        fala.lang = 'pt-BR';
        window.speechSynthesis.speak(fala);
    }
}

function concluirAtendimento(motivo) {
    clearInterval(cronometroGeral);
    horaTerminoStr = new Date().toLocaleTimeString('pt-BR');

    document.getElementById('tela-atendimento').style.display = 'none';
    document.getElementById('tela-resumo').style.display = 'flex';

    document.getElementById('subtitulo-resumo').textContent = `Atendimento finalizado com ${motivo}`;
    document.getElementById('resumo-inicio').textContent = horaInicioStr;
    document.getElementById('resumo-termino').textContent = horaTerminoStr;
    document.getElementById('resumo-duracao').textContent = document.getElementById('cronometro-geral').textContent;

    const listaResumo = document.getElementById('lista-eventos-resumo');
    listaResumo.innerHTML = "";

    // Renderiza a linha do tempo sem colchetes/chaves (estilo Imagem 3)
    historicoEventos.slice().reverse().forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${ev.descricao}</span> <span style="color: #64748b;">${ev.hora}</span>`;
        listaResumo.appendChild(li);
    });
}

function copiarResumoTextual() {
    let texto = `=== RESUMO DE ATENDIMENTO DE PCR ===\n`;
    texto += `Início: ${horaInicioStr} | Término: ${horaTerminoStr}\n`;
    texto += `Duração: ${document.getElementById('resumo-duracao').textContent}\n\n`;
    texto += `LINHA DO TEMPO:\n`;

    historicoEventos.slice().reverse().forEach(ev => {
        texto += `• ${ev.descricao} - ${ev.hora}\n`;
    });

    navigator.clipboard.writeText(texto);
    alert("Resumo copiado para a área de transferência!");
}