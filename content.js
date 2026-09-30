/**
 * CONTENT SCRIPT - EXECUTOR DE CADASTROS SICAD (VERSÃO CORRIGIDA)
 * 
 * Executa comandos de preenchimento e submissão APENAS na página correta do SICAD
 * - Verificação de URL antes de executar
 * - Não inicia processamento automaticamente
 * - Aguarda comandos do background script
 * 
 * @author Claude.AI
 * @version 2.4 - Corrigido para URL específica
 */

// === VERIFICAÇÃO DE URL ===
const URL_PERMITIDA = 'https://sisp.ssp.go.gov.br/Sicad-Sicad-context-root/cadastrarItem.jsp';

if (!window.location.href.includes('cadastrarItem.jsp')) {
    console.log('⚠️ Content script carregado em página incorreta, desativando...');
    // Não executar nada se não estiver na página correta
} else {
    
    // === VERIFICAÇÃO PARA EVITAR MÚLTIPLAS INJEÇÕES ===
    if (typeof window.ExecutorCadastrosAtivo !== 'undefined') {
        console.log('⚠️ Executor já está ativo, ignorando nova injeção');
    } else {
        window.ExecutorCadastrosAtivo = true;

        class ExecutorCadastros {
            constructor() {
                // === ESTADO DO EXECUTOR ===
                this.processandoItem = false;           // Flag de processamento em andamento
                this.itemAtual = null;                  // Item sendo processado atualmente
                this.tentativasMaximas = 3;             // Máximo de tentativas por item
                this.timeoutProcessamento = 90000;      // Timeout geral (90s)
                this.timeoutSubmissao = 45000;          // Timeout para submissão (45s)
                this.timeoutModal = 30000;              // Timeout para aguardar modal (30s)
                this.modalDetectado = false;            // Flag para controlar detecção de modal
                
                // === CONFIGURAÇÕES DE ELEMENTOS ===
                this.seletoresIdentificador = [
                    '#rgMilitar',
                    'input[name="rgMilitar"]',
                    'input[id="rgMilitar"]',
                    'input[maxlength="6"]',
                    'input[maxlength="7"]',
                    'input[maxlength="8"]',
                    'input[tipo="numero"]',
                    'input.frm-obrigatorio[type="text"]',
                    'input[placeholder*="RG"]',
                    'input[placeholder*="identificador"]'
                ];
                
                this.seletoresConteudo = [
                    '#textoItem',
                    'textarea[name="textoItem"]',
                    'textarea[id="textoItem"]',
                    'textarea.form-control',
                    'textarea[rows]',
                    'textarea[placeholder*="texto"]',
                    'textarea[placeholder*="observação"]'
                ];
                
                this.seletoresSubmit = [
                    // Seletores específicos do SICAD
                    'input[type="button"][value="Incluir"]',
                    'input[type="button"][onclick*="validaFormu"]',
                    'input[type="button"][onclick*="insert"]',
                    'input[value="Incluir"]',
                    // Seletores genéricos
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button[onclick*="submit"]',
                    'button[onclick*="salvar"]',
                    'button[onclick*="gravar"]',
                    'button[value*="Salvar"]',
                    'button[value*="Gravar"]',
                    'button[value*="Incluir"]',
                    '.btn-primary',
                    '.btn-success',
                    '#btnSalvar',
                    '#btnGravar',
                    '#btnIncluir'
                ];
                
                // === SELETORES ESPECÍFICOS PARA MODAIS DO SICAD ===
                this.seletoresModaisSICAD = [
                    'div[id*="modal_dialog"]',              
                    'div[class="dialog"]',                  
                    'div[id*="modal_dialog"] .mac_os_x_close',
                    '.mac_os_x_close',                      
                    'div[onclick*="Windows.close"]',        
                    'div[onclick*="Dialog.closeInfo"]',     
                ];
                
                // === INICIALIZAÇÃO ===
                this.setupMessageListener();
                this.setupModalHandler();
                this.setupFormObserver();
                
                console.log('🚀 Executor de Cadastros SICAD inicializado (versão corrigida)');
                console.log('📍 URL atual:', window.location.href);
            }
            
            /**
             * CONFIGURAR LISTENER DE MENSAGENS
             * Define listener para comunicação com background script
             */
            setupMessageListener() {
                console.log('📡 Configurando listener de mensagens...');
                
                chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                    console.log('📨 Mensagem recebida no content script:', message);
                    
                    if (message.action === 'processarItem') {
                        console.log('🎯 Comando processarItem recebido:', {
                            identificador: message.identificador,
                            conteudo: message.conteudo?.substring(0, 50) + '...',
                            opcoes: message.opcoes,
                            processandoAtualmente: this.processandoItem
                        });
                        
                        // Verificar se já está processando
                        if (this.processandoItem) {
                            console.log('⚠️ Executor já processando item, rejeitando nova solicitação');
                            sendResponse({ status: 'rejeitado', motivo: 'Já processando outro item' });
                            return true;
                        }
                        
                        this.processarItem(message.identificador, message.conteudo, message.opcoes);
                        sendResponse({ status: 'aceito' });
                        return true;
                    }
                    
                    console.log('⚠️ Ação não reconhecida:', message.action);
                    sendResponse({ status: 'erro', motivo: 'Ação não reconhecida' });
                    return true;
                });
                
                console.log('✅ Listener de mensagens configurado');
            }
            
            /**
             * CONFIGURAR HANDLER DE MODAIS
             * Monitora e fecha modais automaticamente (APENAS durante processamento)
             */
            setupModalHandler() {
                console.log('🔧 Configurando handler de modais SICAD...');
                
                // Flag para controlar se modal foi detectado
                this.modalDetectado = false;
                
                // Observer para detectar novos modais (APENAS durante processamento)
                this.modalObserver = new MutationObserver((mutations) => {
                    // SÓ PROCESSAR SE ESTIVER PROCESSANDO UM ITEM
                    if (!this.processandoItem) return;
                    
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === 1) { // Element node
                                    // Verificar se é um modal SICAD
                                    if (node.id && node.id.includes('modal_dialog')) {
                                        console.log('🚨 Modal SICAD detectado pelo observer:', node.id);
                                        this.modalDetectado = true;
                                        // Tentar fechar imediatamente
                                        setTimeout(() => {
                                            this.fecharModalSICAD(node);
                                        }, 500);
                                    } else if (node.classList && node.classList.contains('dialog')) {
                                        console.log('🚨 Modal dialog detectado pelo observer');
                                        this.modalDetectado = true;
                                        setTimeout(() => {
                                            this.fecharModalSICAD(node);
                                        }, 500);
                                    }
                                }
                            });
                        }
                    });
                });
                
                this.modalObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                
                console.log('✅ Handler de modais SICAD configurado');
            }
            
            /**
             * CONFIGURAR OBSERVER DE FORMULÁRIOS
             * Monitora mudanças em formulários
             */
            setupFormObserver() {
                const formObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' || mutation.type === 'attributes') {
                            const forms = document.querySelectorAll('form');
                            forms.forEach(form => {
                                this.detectarMudancasFormulario(form);
                            });
                        }
                    });
                });
                
                formObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['value', 'disabled', 'readonly']
                });
            }
            
            /**
             * DETECTAR MUDANÇAS NO FORMULÁRIO
             * Detecta quando formulário é atualizado/carregado
             */
            detectarMudancasFormulario(form) {
                // Pode ser usado para detectar quando dados carregaram
            }
            
            // === PROCESSAMENTO PRINCIPAL ===
            
            /**
             * PROCESSAR ITEM
             * Função principal que processa um item completo
             */
            async processarItem(identificador, conteudo, opcoes) {
                console.log(`📝 Iniciando processamento do item: ${identificador}`);
                
                // Verificar se já está processando
                if (this.processandoItem) {
                    console.log('⚠️ Já está processando outro item');
                    this.enviarResposta(identificador, false, 'Executor ocupado processando outro item');
                    return;
                }
                
                this.processandoItem = true;
                this.itemAtual = {
                    identificador,
                    conteudo,
                    opcoes: opcoes || {},
                    tentativas: 0,
                    tempoInicio: Date.now()
                };
                
                try {
                    // Timeout geral para todo o processamento
                    const timeoutGeral = setTimeout(() => {
                        console.log('⏰ Timeout geral do processamento');
                        this.enviarResposta(identificador, false, 'Timeout geral - processamento interrompido');
                        this.processandoItem = false;
                        this.itemAtual = null;
                    }, this.timeoutProcessamento);
                    
                    // === SEQUÊNCIA DE PROCESSAMENTO ===
                    console.log('⏳ Iniciando sequência de processamento...');
                    
                    // 1. Preencher identificador
                    console.log('📋 Etapa 1: Preenchendo identificador...');
                    const sucessoIdentificador = await this.preencherIdentificador(identificador);
                    if (!sucessoIdentificador) {
                        throw new Error('Falha ao preencher identificador');
                    }
                    
                    // 2. Aguardar carregamento de dados
                    console.log('⏳ Etapa 2: Aguardando carregamento de dados...');
                    await this.aguardarCarregamentoDados();
                    
                    // 3. Preencher conteúdo
                    console.log('📝 Etapa 3: Preenchendo conteúdo...');
                    const sucessoConteudo = await this.preencherConteudo(conteudo);
                    if (!sucessoConteudo) {
                        throw new Error('Falha ao preencher conteúdo');
                    }
                    
                    // 4. Submeter formulário (se habilitado)
                    if (opcoes.autoSubmit !== false) {
                        console.log('📤 Etapa 4: Submetendo formulário...');
                        const sucessoSubmit = await this.submeterFormulario();
                        if (!sucessoSubmit) {
                            throw new Error('Falha ao submeter formulário');
                        }
                        
                        // 5. Aguardar e fechar modais (se habilitado)
                        if (opcoes.aguardarModal !== false) {
                            console.log('🔄 Etapa 5: Aguardando e fechando modais do SICAD...');
                            await this.aguardarEFecharModaisSICAD();
                        }
                    }
                    
                    // Limpar timeout
                    clearTimeout(timeoutGeral);
                    
                    // Sucesso
                    console.log(`✅ Item ${identificador} processado com sucesso!`);
                    console.log(`⏱️ Tempo total: ${Date.now() - this.itemAtual.tempoInicio}ms`);
                    this.enviarResposta(identificador, true, 'Item cadastrado com sucesso');
                    
                } catch (error) {
                    // Tratamento de erro
                    console.error(`❌ Erro no processamento do item ${identificador}:`, error);
                    
                    // Tentar novamente se não atingiu máximo de tentativas
                    this.itemAtual.tentativas++;
                    if (this.itemAtual.tentativas < this.tentativasMaximas) {
                        console.log(`🔄 Tentativa ${this.itemAtual.tentativas + 1}/${this.tentativasMaximas}...`);
                        this.processandoItem = false;
                        setTimeout(() => {
                            this.processarItem(identificador, conteudo, opcoes);
                        }, 5000);
                        return;
                    }
                    
                    this.enviarResposta(identificador, false, error.message);
                } finally {
                    // Sempre liberar recursos
                    this.processandoItem = false;
                    this.itemAtual = null;
                }
            }
            
            // === PREENCHIMENTO DE CAMPOS ===
            
            /**
             * PREENCHER IDENTIFICADOR
             * Preenche campo de identificador (RG, etc.)
             */
            async preencherIdentificador(identificador) {
                console.log(`📋 Preenchendo identificador: ${identificador}`);
                
                try {
                    // Encontrar iframe se existir
                    const iframe = this.encontrarIframe();
                    let doc = document;
                    
                    if (iframe) {
                        console.log('🖼️ Iframe detectado, aguardando carregamento...');
                        await this.aguardarIframeCarregar(iframe);
                        doc = iframe.contentDocument || iframe.contentWindow.document;
                    }
                    
                    // Encontrar campo de identificador
                    const campoIdentificador = this.encontrarCampo(doc, this.seletoresIdentificador);
                    if (!campoIdentificador) {
                        throw new Error('Campo de identificador não encontrado');
                    }
                    
                    // Limpar e preencher campo
                    campoIdentificador.focus();
                    campoIdentificador.value = '';
                    await this.aguardar(300);
                    
                    // Preencher valor caractere por caractere
                    await this.digitarTexto(campoIdentificador, identificador);
                    
                    // Disparar eventos
                    this.dispararEventos(campoIdentificador, ['input', 'change', 'blur', 'keyup']);
                    
                    // Verificar se foi preenchido
                    await this.aguardar(500);
                    if (campoIdentificador.value !== identificador) {
                        throw new Error('Identificador não foi preenchido corretamente');
                    }
                    
                    console.log(`✅ Identificador ${identificador} preenchido com sucesso`);
                    return true;
                    
                } catch (error) {
                    console.error('❌ Erro ao preencher identificador:', error);
                    return false;
                }
            }
            
            /**
             * PREENCHER CONTEÚDO
             * Preenche campo de conteúdo/texto
             */
            async preencherConteudo(conteudo) {
                console.log('📝 Preenchendo conteúdo...');
                
                try {
                    // Encontrar iframe se existir
                    const iframe = this.encontrarIframe();
                    let doc = document;
                    
                    if (iframe) {
                        doc = iframe.contentDocument || iframe.contentWindow.document;
                    }
                    
                    // Aguardar campo de conteúdo aparecer
                    const campoConteudo = await this.aguardarElemento(
                        () => this.encontrarCampo(doc, this.seletoresConteudo), 
                        20000
                    );
                    
                    if (!campoConteudo) {
                        throw new Error('Campo de conteúdo não encontrado');
                    }
                    
                    // Limpar e preencher campo
                    campoConteudo.focus();
                    campoConteudo.value = '';
                    await this.aguardar(500);
                    
                    // Preencher conteúdo
                    campoConteudo.value = conteudo;
                    
                    // Disparar eventos
                    this.dispararEventos(campoConteudo, ['input', 'change', 'keyup', 'paste']);
                    
                    // Executar função Contar se existir
                    try {
                        const iframeWindow = iframe ? iframe.contentWindow : window;
                        if (iframeWindow.Contar && typeof iframeWindow.Contar === 'function') {
                            iframeWindow.Contar(campoConteudo);
                            console.log('🔢 Função Contar executada');
                        }
                    } catch (e) {
                        console.log('ℹ️ Função Contar não disponível');
                    }
                    
                    // Verificar se foi preenchido
                    await this.aguardar(800);
                    if (campoConteudo.value.length === 0) {
                        throw new Error('Conteúdo não foi preenchido');
                    }
                    
                    console.log('✅ Conteúdo preenchido com sucesso');
                    return true;
                    
                } catch (error) {
                    console.error('❌ Erro ao preencher conteúdo:', error);
                    return false;
                }
            }
            
            // === SUBMISSÃO DE FORMULÁRIO ===
            
            /**
             * SUBMETER FORMULÁRIO
             * Submete o formulário após preenchimento
             */
            async submeterFormulario() {
                console.log('📤 Iniciando submissão do formulário...');
                
                try {
                    // Encontrar iframe se existir
                    const iframe = this.encontrarIframe();
                    let doc = document;
                    
                    if (iframe) {
                        doc = iframe.contentDocument || iframe.contentWindow.document;
                    }
                    
                    // Aguardar antes de submeter
                    await this.aguardar(1500);
                    
                    // Encontrar botão de submit
                    const botaoSubmit = this.encontrarBotaoSubmit(doc);
                    if (!botaoSubmit) {
                        throw new Error('Botão de submissão não encontrado');
                    }
                    
                    console.log('🎯 Botão de submissão encontrado:', botaoSubmit);
                    
                    // Verificar se botão está habilitado
                    if (botaoSubmit.disabled) {
                        console.log('⏳ Botão desabilitado, aguardando habilitação...');
                        await this.aguardarElementoHabilitado(botaoSubmit, 15000);
                    }
                    
                    // Submeter formulário
                    console.log('🚀 Clicando no botão de submissão...');
                    botaoSubmit.focus();
                    await this.aguardar(300);
                    botaoSubmit.click();
                    
                    // Aguardar processamento
                    console.log('⏳ Aguardando processamento da submissão...');
                    await this.aguardar(3000);
                    
                    // Verificar se submissão foi bem sucedida
                    const sucessoSubmissao = await this.verificarSucessoSubmissao();
                    if (!sucessoSubmissao) {
                        console.log('⚠️ Submissão pode não ter sido bem sucedida');
                    }
                    
                    console.log('✅ Formulário submetido com sucesso');
                    return true;
                    
                } catch (error) {
                    console.error('❌ Erro ao submeter formulário:', error);
                    return false;
                }
            }
            
            /**
             * ENCONTRAR BOTÃO DE SUBMIT
             * Procura botão de submissão no documento
             */
            encontrarBotaoSubmit(doc) {
                for (const seletor of this.seletoresSubmit) {
                    const botao = doc.querySelector(seletor);
                    if (botao && this.isBotaoVisivel(botao)) {
                        return botao;
                    }
                }
                
                // Procurar por texto em botões
                const todosBotoes = doc.querySelectorAll('button, input[type="button"], input[type="submit"]');
                for (const botao of todosBotoes) {
                    const texto = (botao.textContent || botao.value || '').toLowerCase();
                    if (texto.includes('salvar') || texto.includes('gravar') || 
                        texto.includes('incluir') || texto.includes('enviar') ||
                        texto.includes('submit') || texto.includes('cadastrar')) {
                        
                        if (this.isBotaoVisivel(botao)) {
                            return botao;
                        }
                    }
                }
                
                return null;
            }
            
            /**
             * VERIFICAR SE BOTÃO ESTÁ VISÍVEL
             * Verifica se botão está visível e clicável
             */
            isBotaoVisivel(botao) {
                const style = window.getComputedStyle(botao);
                const rect = botao.getBoundingClientRect();
                
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0' &&
                    rect.width > 0 &&
                    rect.height > 0
                );
            }
            
            /**
             * VERIFICAR SUCESSO DA SUBMISSÃO
             * Verifica se submissão foi bem sucedida
             * No SICAD, campos são limpos após submissão bem sucedida
             */
            async verificarSucessoSubmissao() {
                await this.aguardar(2000);
                
                // IMPORTANTE: No SICAD, quando a submissão é bem sucedida:
                // 1. Os campos são limpos automaticamente
                // 2. Um modal de sucesso aparece
                // 3. A página é recarregada/resetada
                
                // Verificar se campos foram limpos (indica sucesso no SICAD)
                const iframe = this.encontrarIframe();
                let doc = document;
                
                if (iframe) {
                    doc = iframe.contentDocument || iframe.contentWindow.document;
                }
                
                const campoIdentificador = this.encontrarCampo(doc, this.seletoresIdentificador);
                const campoConteudo = this.encontrarCampo(doc, this.seletoresConteudo);
                
                // Se os campos foram limpos, provavelmente foi sucesso
                if (campoIdentificador && campoIdentificador.value === '' && 
                    campoConteudo && campoConteudo.value === '') {
                    console.log('✅ Campos limpos - submissão bem sucedida');
                    return true;
                }
                
                // Verificar indicadores de sucesso visuais
                const indicadoresSucesso = [
                    '.alert-success',
                    '.success',
                    '.msg-success',
                    '[class*="success"]',
                    '.notification.success'
                ];
                
                for (const seletor of indicadoresSucesso) {
                    const elemento = document.querySelector(seletor);
                    if (elemento && this.isElementoVisivel(elemento)) {
                        console.log('✅ Indicador de sucesso encontrado:', elemento);
                        return true;
                    }
                }
                
                // Verificar se não há indicadores de erro
                const indicadoresErro = [
                    '.alert-error',
                    '.alert-danger',
                    '.error',
                    '.msg-error',
                    '[class*="error"]',
                    '.notification.error'
                ];
                
                for (const seletor of indicadoresErro) {
                    const elemento = document.querySelector(seletor);
                    if (elemento && this.isElementoVisivel(elemento)) {
                        console.log('❌ Indicador de erro encontrado:', elemento);
                        return false;
                    }
                }
                
                // Se não encontrou indicadores mas campos foram limpos, assumir sucesso
                return true;
            }
            
            // === GERENCIAMENTO DE MODAIS SICAD ===
            
            /**
             * AGUARDAR E FECHAR MODAIS DO SICAD
             * Aguarda modais específicos do SICAD aparecerem e os fecha
             */
            async aguardarEFecharModaisSICAD() {
                console.log('🔄 Aguardando modais específicos do SICAD...');
                
                // Resetar flag do observer
                this.modalDetectado = false;
                
                // AGUARDAR UM TEMPO INICIAL PARA O MODAL APARECER APÓS O SUBMIT
                console.log('⏳ Aguardando processamento do servidor (5 segundos)...');
                await this.aguardar(5000);
                
                // Se o observer já detectou e fechou o modal durante a espera
                if (this.modalDetectado) {
                    console.log('✅ Modal já foi detectado e processado pelo observer');
                    await this.aguardar(2000); // Aguardar estabilização
                    return;
                }
                
                const tempoInicio = Date.now();
                const timeout = this.timeoutModal;
                let modalFechado = false;
                let tentativas = 0;
                const maxTentativas = 15; // Máximo 15 tentativas (15 segundos após o delay inicial)
                
                return new Promise((resolve) => {
                    const verificarModais = () => {
                        tentativas++;
                        
                        // Se o observer detectou o modal durante nossa verificação
                        if (this.modalDetectado) {
                            console.log('✅ Modal detectado pelo observer durante verificação');
                            setTimeout(() => resolve(), 2000);
                            return;
                        }
                        
                        if (tentativas % 3 === 1) { // Logar apenas a cada 3 tentativas
                            console.log(`🔍 Verificação de modal ${tentativas}/${maxTentativas}...`);
                        }
                        
                        if (tentativas > maxTentativas) {
                            console.log(`⏰ Máximo de tentativas (${maxTentativas}) atingido`);
                            resolve();
                            return;
                        }
                        
                        modalFechado = this.procurarEFecharModalSICAD();
                        
                        if (modalFechado) {
                            console.log('✅ Modal SICAD fechado, aguardando estabilização...');
                            setTimeout(() => {
                                resolve();
                            }, 2000);
                        } else {
                            // Continuar verificando a cada segundo
                            setTimeout(verificarModais, 1000);
                        }
                    };
                    
                    verificarModais();
                });
            }
            
            /**
             * PROCURAR E FECHAR MODAL SICAD
             * Procura e fecha modal do SICAD
             */
            procurarEFecharModalSICAD() {
                // Procurar modal principal do SICAD por ID que contém "modal_dialog"
                const modaisDialog = document.querySelectorAll('div[id*="modal_dialog"]');
                for (const modal of modaisDialog) {
                    if (this.isModalVisivel(modal)) {
                        console.log('🎯 Modal principal SICAD encontrado:', modal.id);
                        return this.fecharModalSICAD(modal);
                    }
                }
                
                // Procurar por classe "dialog"
                const dialogsClasse = document.querySelectorAll('div.dialog');
                for (const modal of dialogsClasse) {
                    if (this.isModalVisivel(modal)) {
                        console.log('🎯 Modal dialog SICAD encontrado');
                        return this.fecharModalSICAD(modal);
                    }
                }
                
                // Procurar modais genéricos com z-index alto
                const todosElementos = document.querySelectorAll('div');
                for (const elemento of todosElementos) {
                    const style = window.getComputedStyle(elemento);
                    const zIndex = parseInt(style.zIndex);
                    
                    // Verificar se é um modal por características
                    if (zIndex > 1000 && this.isModalVisivel(elemento)) {
                        // Verificar se contém elementos típicos de modal SICAD
                        const temBotaoFechar = elemento.querySelector('.mac_os_x_close');
                        const temTextoIncluir = elemento.textContent && 
                            (elemento.textContent.includes('incluído com sucesso') ||
                             elemento.textContent.includes('Clique aqui') ||
                             elemento.textContent.includes('novo item'));
                        
                        if (temBotaoFechar || temTextoIncluir) {
                            console.log('🎯 Modal SICAD detectado por características');
                            return this.fecharModalSICAD(elemento);
                        }
                    }
                }
                
                // Não logar quando não encontrar (para evitar spam no console)
                return false;
            }

            
            /**
             * VERIFICAR SE MODAL ESTÁ VISÍVEL
             * Determina se elemento é um modal visível
             */
            isModalVisivel(elemento) {
                if (!elemento) return false;
                
                const style = window.getComputedStyle(elemento);
                const rect = elemento.getBoundingClientRect();
                
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0' &&
                    rect.width > 0 &&
                    rect.height > 0 &&
                    (
                        style.position === 'fixed' ||
                        style.position === 'absolute' ||
                        parseInt(style.zIndex) > 100 ||
                        elemento.classList.contains('modal') ||
                        elemento.classList.contains('dialog') ||
                        elemento.getAttribute('role') === 'dialog' ||
                        elemento.id.includes('modal_dialog')
                    )
                );
            }
            
            /**
             * FECHAR MODAL SICAD
             * Tenta fechar modal específico do SICAD
             */
            fecharModalSICAD(modal) {
                console.log('🔐 Tentando fechar modal SICAD');
                
                // Método 1: Botão X do modal SICAD
                const botaoFecharX = modal.querySelector('.mac_os_x_close');
                if (botaoFecharX) {
                    try {
                        console.log('🎯 Clicando botão X do modal');
                        botaoFecharX.click();
                        // Aguardar um pouco para verificar se fechou
                        setTimeout(() => {
                            if (!document.body.contains(modal) || !this.isModalVisivel(modal)) {
                                console.log('✅ Modal fechado com sucesso via botão X');
                            }
                        }, 500);
                        return true;
                    } catch (e) {
                        console.log('❌ Erro ao clicar botão X:', e);
                    }
                }
                
                // Método 2: Link "Clique aqui" específico do SICAD
                const linksClique = modal.querySelectorAll('a, div[onclick]');
                for (const link of linksClique) {
                    const texto = (link.textContent || '').toLowerCase();
                    const onclick = link.getAttribute('onclick') || '';
                    
                    if (texto.includes('clique aqui') || 
                        texto.includes('novo item') ||
                        onclick.includes('Dialog.closeInfo') ||
                        onclick.includes('Windows.close')) {
                        try {
                            console.log('🎯 Clicando link:', texto.substring(0, 30));
                            link.click();
                            return true;
                        } catch (e) {
                            console.log('❌ Erro ao clicar link:', e);
                        }
                    }
                }
                
                // Método 3: Windows.close (se disponível)
                try {
                    const modalId = modal.id;
                    if (modalId && window.Windows && typeof window.Windows.close === 'function') {
                        console.log('🎯 Executando Windows.close()');
                        window.Windows.close(modalId);
                        return true;
                    }
                } catch (e) {
                    console.log('ℹ️ Windows.close não disponível:', e.message);
                }
                
                // Método 4: Dialog.closeInfo (se disponível)
                try {
                    if (window.Dialog && typeof window.Dialog.closeInfo === 'function') {
                        console.log('🎯 Executando Dialog.closeInfo()');
                        window.Dialog.closeInfo();
                        return true;
                    }
                } catch (e) {
                    console.log('ℹ️ Dialog.closeInfo não disponível:', e.message);
                }
                
                // Método 5: Procurar qualquer botão de fechar
                const botoesFechar = modal.querySelectorAll(
                    'button, input[type="button"], input[type="submit"], a'
                );
                
                for (const botao of botoesFechar) {
                    const texto = (botao.textContent || botao.value || '').toLowerCase();
                    
                    if (texto === 'ok' || texto === 'fechar' || texto === 'close' ||
                        texto.includes('continuar') || texto.includes('prosseguir')) {
                        try {
                            console.log(`🎯 Clicando botão: ${texto}`);
                            botao.click();
                            return true;
                        } catch (e) {
                            console.log(`❌ Erro ao clicar botão:`, e);
                        }
                    }
                }
                
                // Método 6: Remover modal do DOM como último recurso
                setTimeout(() => {
                    if (document.body.contains(modal) && this.isModalVisivel(modal)) {
                        try {
                            console.log('🔒 Removendo modal do DOM');
                            modal.remove();
                            console.log('✅ Modal removido do DOM');
                            return true;
                        } catch (e) {
                            console.log('❌ Erro ao remover modal:', e);
                        }
                    }
                }, 3000);
                
                console.log('⚠️ Nenhum método de fechamento funcionou imediatamente');
                return false;
            }
            
            // === UTILITÁRIOS ===
            
            /**
             * AGUARDAR CARREGAMENTO DE DADOS
             * Aguarda dados serem carregados após preencher identificador
             */
            async aguardarCarregamentoDados() {
                console.log('⏳ Aguardando carregamento de dados...');
                await this.aguardar(8000);
                console.log('✅ Aguardo de carregamento concluído');
            }
            
            /**
             * ENCONTRAR IFRAME
             * Localiza iframe principal da página
             */
            encontrarIframe() {
                const tentativas = [
                    () => document.querySelector('iframe[name="iframeItem"]'),
                    () => document.querySelector('iframe#iframeItem'),
                    () => document.querySelector('iframe[id="iframeItem"]'),
                    () => document.querySelector('iframe[src*="item"]'),
                    () => document.querySelector('iframe')
                ];
                
                for (const tentativa of tentativas) {
                    const iframe = tentativa();
                    if (iframe) {
                        console.log('🖼️ Iframe encontrado:', iframe);
                        return iframe;
                    }
                }
                
                return null;
            }
            
            /**
             * ENCONTRAR CAMPO
             * Localiza campo usando lista de seletores
             */
            encontrarCampo(doc, seletores) {
                for (const seletor of seletores) {
                    const campo = doc.querySelector(seletor);
                    if (campo && this.isElementoVisivel(campo)) {
                        console.log(`🎯 Campo encontrado com seletor: ${seletor}`);
                        return campo;
                    }
                }
                
                return null;
            }
            
            /**
             * VERIFICAR SE ELEMENTO ESTÁ VISÍVEL
             * Verifica se elemento está visível e interagível
             */
            isElementoVisivel(elemento) {
                if (!elemento) return false;
                
                const style = window.getComputedStyle(elemento);
                const rect = elemento.getBoundingClientRect();
                
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0' &&
                    rect.width > 0 &&
                    rect.height > 0
                );
            }
            
            /**
             * AGUARDAR IFRAME CARREGAR
             * Aguarda iframe estar completamente carregado
             */
            async aguardarIframeCarregar(iframe) {
                return new Promise((resolve) => {
                    const verificar = () => {
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                            if (iframeDoc && iframeDoc.readyState === 'complete') {
                                console.log('✅ Iframe carregado');
                                resolve();
                            } else {
                                setTimeout(verificar, 300);
                            }
                        } catch (e) {
                            setTimeout(verificar, 300);
                        }
                    };
                    verificar();
                });
            }
            
            /**
             * AGUARDAR ELEMENTO
             * Aguarda elemento aparecer na página
             */
            async aguardarElemento(funcaoBusca, timeout = 15000) {
                return new Promise((resolve) => {
                    let tentativas = 0;
                    const maxTentativas = timeout / 300;
                    
                    const verificar = () => {
                        try {
                            const elemento = funcaoBusca();
                            if (elemento) {
                                console.log('✅ Elemento encontrado');
                                resolve(elemento);
                                return;
                            }
                        } catch (e) {
                            // Ignorar erros
                        }
                        
                        tentativas++;
                        if (tentativas < maxTentativas) {
                            setTimeout(verificar, 300);
                        } else {
                            console.log('⏰ Timeout ao aguardar elemento');
                            resolve(null);
                        }
                    };
                    
                    verificar();
                });
            }
            
            /**
             * AGUARDAR ELEMENTO HABILITADO
             * Aguarda elemento ficar habilitado
             */
            async aguardarElementoHabilitado(elemento, timeout = 15000) {
                return new Promise((resolve) => {
                    const tempoInicio = Date.now();
                    
                    const verificar = () => {
                        if (!elemento.disabled) {
                            console.log('✅ Elemento habilitado');
                            resolve(true);
                            return;
                        }
                        
                        if (Date.now() - tempoInicio < timeout) {
                            setTimeout(verificar, 300);
                        } else {
                            console.log('⏰ Timeout ao aguardar elemento ser habilitado');
                            resolve(false);
                        }
                    };
                    
                    verificar();
                });
            }
            
            /**
             * DIGITAR TEXTO
             * Simula digitação humana
             */
            async digitarTexto(campo, texto) {
                for (let i = 0; i < texto.length; i++) {
                    campo.value += texto[i];
                    campo.dispatchEvent(new Event('input', { bubbles: true }));
                    await this.aguardar(30 + Math.random() * 70);
                }
            }
            
            /**
             * DISPARAR EVENTOS
             * Dispara lista de eventos em um elemento
             */
            dispararEventos(elemento, eventos) {
                eventos.forEach(tipoEvento => {
                    const evento = new Event(tipoEvento, { bubbles: true });
                    elemento.dispatchEvent(evento);
                });
            }
            
            /**
             * AGUARDAR
             * Função utilitária para aguardar tempo específico
             */
            async aguardar(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
            
            /**
             * ENVIAR RESPOSTA
             * Envia resposta de volta para background script
             */
            enviarResposta(identificador, sucesso, detalhes) {
                try {
                    chrome.runtime.sendMessage({
                        action: 'itemProcessado',
                        identificador: identificador,
                        sucesso: sucesso,
                        erro: detalhes,
                        detalhes: detalhes
                    });
                    
                    console.log(`📤 Resposta enviada: ${sucesso ? 'SUCESSO' : 'ERRO'} - ${detalhes}`);
                } catch (error) {
                    console.error('❌ Erro ao enviar resposta:', error);
                }
            }
        }

        /**
         * INICIALIZAÇÃO DO CONTENT SCRIPT
         * Cria instância única do executor
         */
        const executor = new ExecutorCadastros();
        console.log('🎯 Executor de Cadastros SICAD ativo na página correta');
    }
}