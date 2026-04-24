/* --- CONFIGURAÇÕES DE ÁUDIO --- */
const somSirene = new Audio('som.mp3'); 
somSirene.loop = true; // Mantém a sirene tocando em loop até mandarmos parar

/* --- CONFIGURAÇÕES DO CLIENTE MQTT --- */
let clienteWeb = null;
const clienteId = "esp32MFO1" + Math.random().toString(16).substr(2, 8); 

clienteWeb = new Paho.MQTT.Client('broker.hivemq.com', 8884, clienteId);

/* --- FUNÇÃO DE ENVIO --- */
function enviarMensagem(topico) {
    if (clienteWeb && clienteWeb.isConnected()) {
        const msg = new Paho.MQTT.Message('1'); 
        msg.destinationName = topico;
        clienteWeb.send(msg);
        console.log(`%c MQTT SEND >> Tópico: ${topico} | Payload: 1`, "color: #ff0000; font-weight: bold;");
    } else {
        console.warn("Sistema Offline. Comando retido.");
    }
}

/* --- PARÂMETROS --- */
const chargeTime = 1000; // Tempo necessário segurando (1 segundo)
const ringLength = 301;  // Tamanho total do anel SVG

/* --- LÓGICA DOS ORBES (SEGURAR PARA ATIVAR) --- */
document.querySelectorAll('.energy-orb').forEach(orb => {
    let pressTimer;
    let isCharging = false;
    const ring = orb.querySelector('.ring-fill');
    const comodo = orb.id.replace('orb-', ''); 

    // Função que INICIA quando o usuário aperta (mouse ou dedo)
    const startPress = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return; 

        const isActive = orb.classList.contains('orb-active');

        // TOCA O SOM APENAS SE FOR O MODO PISCAR
        if (comodo === 'piscar' && !isActive) {
            somSirene.currentTime = 0;
            somSirene.play().catch(erro => console.log("Áudio bloqueado pelo navegador:", erro));
        }

        // DISPARA APENAS A VIBRAÇÃO FÍSICA IMEDIATA (MOBILE/TOUCH)
        if (e.type === 'touchstart') {
            if (navigator.vibrate) navigator.vibrate(50); 
        }

        isCharging = true;
        orb.classList.add('orb-charging');

        if (ring) {
            ring.style.transition = `stroke-dashoffset ${chargeTime}ms linear`;
            ring.style.strokeDashoffset = isActive ? ringLength : "0";
        }

        // Timer de carregamento da ação (1 segundo)
        pressTimer = setTimeout(() => {
            if(isCharging) {
                isCharging = false;
                orb.classList.remove('orb-charging');
                
                // Vibração de sucesso ao completar 1 segundo
                if (e.type === 'touchstart' && navigator.vibrate) {
                    navigator.vibrate([100, 50, 100]); 
                }
                
                triggerAction(orb, comodo, !isActive); 
            }
        }, chargeTime);
    };

    // Função que CANCELA a carga se soltar ou arrastar o mouse para fora antes de 1 segundo
    const cancelPress = () => {
        if (!isCharging) return; 
        
        isCharging = false;
        clearTimeout(pressTimer);
        orb.classList.remove('orb-charging'); 

        const isActive = orb.classList.contains('orb-active');

        if (ring) {
            ring.style.transition = "stroke-dashoffset 0.3s ease-out";
            ring.style.strokeDashoffset = isActive ? "0" : ringLength;
        }
    };

    // Função que lida com o momento em que o usuário SOLTA ou AFASTA o mouse
    const handleRelease = () => {
        if (isCharging && comodo === 'piscar') {
            somSirene.pause();
            somSirene.currentTime = 0;
        }
        
        cancelPress(); 
    };

    // Função que FAZ O ENVIO DO COMANDO após carregar 1 segundo
    const triggerAction = (orbRef, comodoName, vaiFicarAtivo) => {
        
        // --- 1. MODO PISCAR (ALARME) ---
        if (comodoName === 'piscar') {
            enviarMensagem('senai510/lampada/piscar');
            
            const orbesComuns = Array.from(document.querySelectorAll('.energy-orb'))
                .filter(o => !o.id.includes('geral') && !o.id.includes('piscar'));

            if (orbesComuns.length === 0) return;

            let currentIndex = 0;
            const tempoTotal = 5000; // 5 segundos totais para a ação acabar
            const tempoPiscar = 500; // Meio segundo (500ms) por lâmpada

            // Salva o tema que o usuário estava usando antes do alarme tocar
            const temaOriginalEraClaro = document.body.classList.contains('light-mode');

            // Funções auxiliares para ligar/desligar visualmente e enviar MQTT
            const acenderLampada = (o) => {
                const nome = o.id.replace('orb-', '');
                o.classList.add('orb-active');
                if(o.querySelector('.ring-fill')) o.querySelector('.ring-fill').style.strokeDashoffset = "0";
                enviarMensagem(`senai510/lampada/${nome}/ligar`);
            };

            const apagarLampada = (o) => {
                const nome = o.id.replace('orb-', '');
                o.classList.remove('orb-active');
                if(o.querySelector('.ring-fill')) o.querySelector('.ring-fill').style.strokeDashoffset = ringLength;
                enviarMensagem(`senai510/lampada/${nome}/desligar`);
            };

            // Acende a primeira lâmpada imediatamente
            acenderLampada(orbesComuns[currentIndex]);
            // Já inverte a tela na primeira batida do alarme
            document.body.classList.toggle('light-mode');

            // Cria um loop que roda a cada meio segundo
            const piscarInterval = setInterval(() => {
                // Apaga a lâmpada atual
                apagarLampada(orbesComuns[currentIndex]);

                // Pula para a próxima lâmpada
                currentIndex++;
                
                // Se chegou na última lâmpada, volta para a primeira (loop)
                if (currentIndex >= orbesComuns.length) {
                    currentIndex = 0;
                }

                // Acende a nova lâmpada
                acenderLampada(orbesComuns[currentIndex]);
                
                // ALTERNA O TEMA DA PÁGINA (EFEITO PISCAR TELA)
                document.body.classList.toggle('light-mode');

            }, tempoPiscar);

            // Relógio mestre que encerra toda a brincadeira após 5 segundos
            setTimeout(() => {
                // Para o loop de piscar
                clearInterval(piscarInterval);
                
                // Apaga a última lâmpada que ficou acesa
                apagarLampada(orbesComuns[currentIndex]);
                
                // Para a sirene
                somSirene.pause();
                somSirene.currentTime = 0;

                // Restaura o tema para o que o usuário escolheu antes do alarme
                if (temaOriginalEraClaro) {
                    document.body.classList.add('light-mode');
                } else {
                    document.body.classList.remove('light-mode');
                }

            }, tempoTotal);

            return;
        }

        // --- 2. GERAL ---
        if (comodoName === 'geral') {
            const acao = vaiFicarAtivo ? 'ligar' : 'desligar';
            enviarMensagem(`senai510/lampada/${acao}`);

            document.querySelectorAll('.energy-orb').forEach(o => {
                if (!o.id.includes('piscar')) {
                    vaiFicarAtivo ? o.classList.add('orb-active') : o.classList.remove('orb-active');
                    const r = o.querySelector('.ring-fill');
                    if(r) {
                        r.style.transition = "none";
                        r.style.strokeDashoffset = vaiFicarAtivo ? "0" : ringLength;
                    }
                }
            });
            return;
        }

        // --- 3. INDIVIDUAL ---
        vaiFicarAtivo ? orbRef.classList.add('orb-active') : orbRef.classList.remove('orb-active');
        const acaoIndiv = vaiFicarAtivo ? 'ligar' : 'desligar';
        
        enviarMensagem(`senai510/lampada/${comodoName}/${acaoIndiv}`);
        
        if(ring) {
            ring.style.transition = "none"; 
            ring.style.strokeDashoffset = vaiFicarAtivo ? "0" : ringLength;
        }
    };

    // --- EVENTOS (Incluindo afastar o mouse) ---
    orb.addEventListener('mousedown', startPress);
    orb.addEventListener('mouseup', handleRelease);
    orb.addEventListener('mouseleave', handleRelease); 

    orb.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        startPress(e);
    }, {passive: false});
    
    orb.addEventListener('touchend', handleRelease);
    orb.addEventListener('touchcancel', handleRelease); 
});

/* --- CONEXÃO COM O BROKER --- */
clienteWeb.connect({
    useSSL: true,
    onSuccess: function() {
        console.log('Conectado ao Broker MQTT');
        const header = document.querySelector('.main-header');
        if(header) header.style.borderBottomColor = "#ff0000";
        const statusDisplay = document.getElementById('status-display');
        if(statusDisplay) statusDisplay.innerText = "ONLINE";
    },
    onFailure: function(e) {
        console.error('Erro de Conexão:', e.errorMessage);
        const statusDisplay = document.getElementById('status-display');
        if(statusDisplay) statusDisplay.innerText = "OFFLINE";
    },
    keepAliveInterval: 30,
    cleanSession: true
});

/* --- ALTERNADOR DE TEMA --- */
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('light-mode');
        localStorage.setItem('nexus-theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    });
}
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('nexus-theme') === 'light' && themeToggle) {
        themeToggle.checked = true;
        document.body.classList.add('light-mode');
    }
});