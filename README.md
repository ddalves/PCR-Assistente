# 🚑 Assistente de PCR (Suporte Avançado de Vida)

Um assistente Web (PWA) projetado para auxiliar equipes de saúde em ambiente pré-hospitalar, com equipe reduzida,  na condução e registro de **Parada Cardiorrespiratória (PCR)** em tempo real. A ferramenta combina metrônomo visual/sonoro, motor de voz para temporizadores para ciclos e medicamentos, e geração de linha do tempo dos eventos para relatórios clínico.

---

## 📱 Demonstração & Acesso
> 🔗 **Acesse a aplicação:** [https://ddalves.github.io/PCR-Assistente](https://ddalves.github.io/PCR-Assistente)

---

## ✨ Principais Funcionalidades

* ⏱️ **Cronômetro e Ciclos de 2 Minutos:** Controle automático de ciclos com alertas visuais e sonoros para avaliação de ritmo, checagem de pulso e troca de socorrista.
* 🎵 **Metrônomo para Compressões:** Sinal sonoro calibrado a **110 BPM** (conforme diretrizes da AHA) para guiar o ritmo contínuo das compressões torácicas.
* 🗣️ **Instruções e Alertas por Voz:** Síntese de voz em português para avisos prioritários de tempo, sem necessidade de olhar fixamente para a tela.
* 💊 **Gestão de Medicações e Intervenções:**
  * Registro e cronometragem de intervalos de **Adrenalina** e **Amiodarona**.
  * Alertas de tempo para releitura de ritmos chocáveis/não chocáveis e troca de socorrista
  * Suporte a ventilação guiada (relação 30:2, 15:2 ou contínua para via aérea avançada).
* 🔄 **Tratamento de RCE e Recidiva:** Suporte a pausa no retorno da circulação espontânea (RCE) e reinício rápido do cronômetro mantendo o histórico de intervenções acumulado.
* 📋 **Relatório de Atendimento Completo:** Linha do tempo detalhada com timestamp de cada conduta tomada, pronto para cópia rápida ou envio por e-mail.
* 📱 **Foco em Mobile e Usabilidade de Emergência:** Interface com alto contraste, prevenção de bloqueio de tela (Wake Lock API).

---

## 🎯 Perfis de Atendimento Atendidos

1. **Adulto:** Protocolo 30:2 ou contínuo se intubado.
2. **Criança:** Protocolo 15:2 (com 2 socorristas) ou contínuo se intubado.
3. **Bebê/Neonatal:** Ajustes de ventilação e temporização específicos.

---

## 🛠️ Tecnologias Utilizadas

* **HTML5 / CSS3:** Interface responsiva voltada para uso em dispositivos móveis (Mobile-First) e modo escuro nativo.
* **JavaScript (Vanilla - ES6+):** Lógica assíncrona, gerenciamento de estado global e controle dos ciclos de atendimento.
* **Web Audio API:** Geração sintética do metrônomo de compressão e bips de alta frequência sem dependência de arquivos pesados.
* **Web Speech API (`speechSynthesis`):** Motor de áudio para orientações faladas em tempo real.
* **Screen Wake Lock API:** Impede que a tela do dispositivo apague durante o atendimento.

---
## ⚠️ Observações de Áudio (iOS / Safári)

No iOS (iPhone), devido a restrições do sistema operacional:
* O dispositivo **não deve estar no modo silencioso** (chave física lateral) para que o metrônomo e os bips de alerta soem corretamente.
* A síntese de voz opera nativamente independente do modo silencioso.

---

## 🚀 Visão do Produto & Próximos Passos (Roadmap)

Este projeto foi desenhado como um MVP (Produto Mínimo Viável) focado na assistência ativa durante a PCR. O roadmap de evolução prevê o alinhamento com inteligência artificial para otimização do fluxo de trabalho e governança de dados:

* **🎙️ Módulo de Reconhecimento de Voz Hands-Free (Speech-to-Text via IA):**
  * Transcrição automática de comandos de voz da equipe (ex: *"Administrado Adrenalina às 14:02"*, *"Realizada glicemia capilar"*, *"Intubação orotraquial com tubo 7,5"*).
  * Inserção preditiva e automática desses eventos na linha do tempo sem necessidade de toque na tela, mantendo o foco total da equipe na assistência ao paciente.

* **🔒 Privacy by Design & Conformidade LGPD:**
  * O assistente **não armazena nem processa Dados Pessoais Identificáveis (PII)** do paciente (como nome, CPF ou número de prontuário).
  * Todo o processamento de áudio é focado em eventos clínicos puramente operacionais.
  * O relatório final é gerado localmente (*client-side*), permitindo apenas a cópia/envio anônimo via e-mail.



---

## 📄 Licença

Este projeto é disponibilizado para fins educacionais e de apoio à tomada de decisão técnica. Verifique os protocolos institucionais locais antes de sua aplicação em ambiente prático.
