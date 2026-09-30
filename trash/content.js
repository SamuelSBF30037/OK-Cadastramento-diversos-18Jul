/**
 * CONTENT SCRIPT - EXECUTOR DE CADASTROS
 * 
 * Executa comandos de preenchimento e submissão na página web, incluindo:
 * - Preenchimento automático de formulários
 * - Submissão automática com verificação
 * - Detecção e fechamento de modais
 * - Aguardo de carregamento de dados
 * - Sistema robusto de retry e tratamento de erros
 * 
 * @author Claude.AI
 * @version 2.0
 */

class ExecutorCadastros {
    constructor() {
        // === ESTADO DO EXECUTOR ===
        this.processandoItem = false;           // Flag de processamento em andamento
        this.itemAtual = null;                  // Item sendo processado atualmente
        this.tentativasMaximas = 3;             // Máximo de tentativas por item
        this.timeoutProcessamento = 60000;      // Timeout geral de processamento (60s)
        this.timeoutSubmissao = 30000;          // Timeout para submissão (30s)
        this.timeoutModal = 15000;              // Timeout para aguardar modal (15s)
        
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
        
        // === INICIALIZAÇÃO ===
        this.setupMessageListener();
        this.setupModalHandler();
        this.setupFormObserver();
        
        console.log('🚀 Executor de Cadastros inicializado');
    }
    
    /**
     * CONFIGURAR LISTENER DE MENSAGENS
     * Define listener para comunicação com background script
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 Mensagem recebida no content script:', message);
            
            if (message.action === 'processarItem') {
                this.processarItem(message.identificador, message.conteudo, message.opcoes);
                sendResponse({ status: 'iniciado' });
            }
        });
    }
    
    /**
     * CONFIGURAR HANDLER DE MODAIS
     * Monitora e fecha modais automaticamente
     */
    setupModalHandler() {
        console.log('🔧 Configurando handler de modais...');
        
        // === OBSERVER PARA DETECTAR NOVOS MODAIS ===
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            this.verificarEFecharModais(node);
                        }
                    });
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // === VERIFICAÇÃO PERIÓDICA DE MODAIS ===
        setInterval(() => {
            this.verificarEFecharModais(document.body);
        }, 2000);
        
        console.log('✅ Handler de modais configurado');
    }
    
    /**
     * CONFIGURAR OBSERVER DE FORMULÁRIOS
     * Monitora mudanças em formulários para detectar carregamento
     */
    setupFormObserver() {
        // Observer específico para detectar quando formulários são atualizados/carregados
        const formObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    // Detectar se novos campos apareceram ou se valores mudaram
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
        // Lógica para detectar se formulário foi atualizado
        // Pode ser usado para saber quando dados carregaram após preencher identificador
    }
    
    // === PROCESSAMENTO PRINCIPAL ===
    
    /**
     * PROCESSAR ITEM
     * Função principal que processa um item completo
     */
    async processarItem(identificador, conteudo, opcoes) {
        console.log(`📝 Iniciando processamento do item: ${identificador}`);
        
        // === VERIFICAR SE JÁ ESTÁ PROCESSANDO ===
        if (this.processandoItem) {
            this.enviarResposta(identificador, false, 'Já existe outro item sendo processado');
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
            // === SEQUÊNCIA DE PROCESSAMENTO ===
            console.log('⏳ Iniciando sequência de processamento...');
            
            // 1. Preencher identificador
            console.log('📋 Etapa 1: Preenchendo identificador...');
            const sucessoIdentificador = await this.preencherIdentificador(identificador);
            if (!sucessoIdentificador) {
                throw new Error('Falha ao preencher identificador');
            }
            
            // 2. Aguardar carregamento de dados (se necessário)
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
                    console.log('🔄 Etapa 5: Aguardando e fechando modais...');
                    await this.aguardarEFecharModais();
                }
            }
            
            // === SUCESSO ===
            console.log(`✅ Item ${identificador} processado com sucesso!`);
            this.enviarResposta(identificador, true, 'Item cadastrado com sucesso');
            
        } catch (error) {
            // === TRATAMENTO DE ERRO ===
            console.error(`❌ Erro no processamento do item ${identificador}:`, error);
            
            // Tentar novamente se não atingiu máximo de tentativas
            this.itemAtual.tentativas++;
            if (this.itemAtual.tentativas < this.tentativasMaximas) {
                console.log(`🔄 Tentativa ${this.itemAtual.tentativas + 1}/${this.tentativasMaximas}...`);
                setTimeout(() => {
                    this.processarItem(identificador, conteudo, opcoes);
                }, 3000);
                return;
            }
            
            this.enviarResposta(identificador, false, error.message);
        } finally {
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
            // === ENCONTRAR IFRAME SE EXISTIR ===
            const iframe = this.encontrarIframe();
            let documento = document;
            
            if (iframe) {
                console.log('🖼️ Iframe detectado, aguardando carregamento...');
                await this.aguardarIframeCarregar(iframe);
                documento = iframe.contentDocument || iframe.contentWindow.document;
            }
            
            // === ENCONTRAR CAMPO DE IDENTIFICADOR ===
            const campoIdentificador = this.encontrarCampo(documento, this.seletoresIdentificador);
            if (!campoIdentificador) {
                throw new Error('Campo de identificador não encontrado');
            }
            
            // === LIMPAR E PREENCHER CAMPO ===
            campoIdentificador.focus();
            campoIdentificador.value = '';
            await this.aguardar(200);
            
            // Preencher valor caractere por caractere para simular digitação humana
            await this.digitarTexto(campoIdentificador, identificador);
            
            // === DISPARAR EVENTOS ===
            this.dispararEventos(campoIdentificador, ['input', 'change', 'blur', 'keyup']);
            
            // === VERIFICAR SE FOI PREENCHIDO ===
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
            // === ENCONTRAR IFRAME SE EXISTIR ===
            const iframe = this.encontrarIframe();
            let documento = document;
            
            if (iframe) {
                documento = iframe.contentDocument || iframe.contentWindow.document;
            }
            
            // === AGUARDAR CAMPO DE CONTEÚDO APARECER ===
            const campoConteudo = await this.aguardarElemento(
                () => this.encontrarCampo(documento, this.seletoresConteudo), 
                15000
            );
            
            if (!campoConteudo) {
                throw new Error('Campo de conteúdo não encontrado');
            }
            
            // === LIMPAR E PREENCHER CAMPO ===
            campoConteudo.focus();
            campoConteudo.value = '';
            await this.aguardar(300);
            
            // Preencher conteúdo
            campoConteudo.value = conteudo;
            
            // === DISPARAR EVENTOS ===
            this.dispararEventos(campoConteudo, ['input', 'change', 'keyup', 'paste']);
            
            // === EXECUTAR FUNÇÃO CONTAR SE EXISTIR ===
            try {
                const iframeWindow = iframe ? iframe.contentWindow : window;
                if (iframeWindow.Contar && typeof iframeWindow.Contar === 'function') {
                    iframeWindow.Contar(campoConteudo);
                    console.log('🔢 Função Contar executada');
                }
            } catch (e) {
                console.log('ℹ️ Função Contar não disponível ou erro:', e.message);
            }
            
            // === VERIFICAR SE FOI PREENCHIDO ===
            await this.aguardar(500);
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
            // === ENCONTRAR IFRAME SE EXISTIR ===
            const iframe = this.encontrarIframe();
            let documento = document;
            
            if (iframe) {
                documento = iframe.contentDocument || iframe.contentWindow.document;
            }
            
            // === AGUARDAR UM POUCO ANTES DE SUBMETER ===
            await this.aguardar(1000);
            
            // === ENCONTRAR BOTÃO DE SUBMIT ===
            const botaoSubmit = this.encontrarBotaoSubmit(documento);
            if (!botaoSubmit) {
                throw new Error('Botão de submissão não encontrado');
            }
            
            console.log('🎯 Botão de submissão encontrado:', botaoSubmit);
            
            // === VERIFICAR SE BOTÃO ESTÁ HABILITADO ===
            if (botaoSubmit.disabled) {
                console.log('⏳ Botão desabilitado, aguardando habilitação...');
                await this.aguardarElementoHabilitado(botaoSubmit, 10000);
            }
            
            // === SUBMETER FORMULÁRIO ===
            console.log('🚀 Clicando no botão de submissão...');
            botaoSubmit.focus();
            await this.aguardar(200);
            botaoSubmit.click();
            
            // === AGUARDAR PROCESSAMENTO ===
            console.log('⏳ Aguardando processamento da submissão...');
            await this.aguardar(2000);
            
            // === VERIFICAR SE SUBMISSÃO FOI BEM SUCEDIDA ===
            const sucessoSubmissao = await this.verificarSucessoSubmissao();
            if (!sucessoSubmissao) {
                throw new Error('Submissão pode não ter sido bem sucedida');
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
    encontrarBotaoSubmit(documento) {
        for (const seletor of this.seletoresSubmit) {
            const botao = documento.querySelector(seletor);
            if (botao && this.isBotaoVisivel(botao)) {
                return botao;
            }
        }
        
        // Procurar por texto em botões
        const todosBotoes = documento.querySelectorAll('button, input[type="button"], input[type="submit"]');
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
     */
    async verificarSucessoSubmissao() {
        // Aguardar um pouco para que a página processe
        await this.aguardar(3000);
        
        // Verificar indicadores de sucesso
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
        
        // Se não encontrou indicadores, assumir sucesso
        return true;
    }
    
    // === GERENCIAMENTO DE MODAIS ===
    
    /**
     * AGUARDAR E FECHAR MODAIS
     * Aguarda modais aparecerem e os fecha automaticamente
     */
    async aguardarEFecharModais() {
        console.log('🔄 Aguardando modais...');
        
        const tempoInicio = Date.now();
        const timeout = this.timeoutModal;
        
        return new Promise((resolve) => {
            const verificarModais = () => {
                // Verificar se passou do timeout
                if (Date.now() - tempoInicio > timeout) {
                    console.log('⏰ Timeout ao aguardar modais');
                    resolve();
                    return;
                }
                
                // Procurar e fechar modais
                const modalFechado = this.verificarEFecharModais(document.body);
                
                if (modalFechado) {
                    console.log('✅ Modal fechado, aguardando mais modais...');
                    // Aguardar um pouco mais para ver se aparecem outros modais
                    setTimeout(() => {
                        resolve();
                    }, 2000);
                } else {
                    // Continuar verificando
                    setTimeout(verificarModais, 500);
                }
            };
            
            verificarModais();
        });
    }
    
    /**
     * VERIFICAR E FECHAR MODAIS
     * Procura modais na página e tenta fechá-los
     */
    verificarEFecharModais(elemento) {
        let modalFechado = false;
        
        // === SELETORES DE MODAIS ===
        const seletoresModais = [
            '.modal',
            '.dialog',
            '.popup',
            '.overlay',
            '.alert',
            '.confirm',
            '.notification',
            '[role="dialog"]',
            '[role="alertdialog"]',
            'div[style*="position: fixed"]',
            'div[style*="position: absolute"]',
            'div[style*="z-index"]'
        ];
        
        // === PROCURAR MODAIS COM SELETORES ===
        seletoresModais.forEach(seletor => {
            const modais = elemento.querySelectorAll ? elemento.querySelectorAll(seletor) : [];
            modais.forEach(modal => {
                if (this.isModalVisivel(modal)) {
                    console.log('🔍 Modal detectado:', modal);
                    const fechou = this.fecharModal(modal);
                    if (fechou) modalFechado = true;
                }
            });
        });
        
        // === VERIFICAR SE O PRÓPRIO ELEMENTO É UM MODAL ===
        if (elemento.nodeType === 1 && this.isModalVisivel(elemento)) {
            console.log('🔍 Modal detectado (elemento raiz):', elemento);
            const fechou = this.fecharModal(elemento);
            if (fechou) modalFechado = true;
        }
        
        return modalFechado;
    }
    
    /**
     * VERIFICAR SE MODAL ESTÁ VISÍVEL
     * Determina se elemento é um modal visível
     */
    isModalVisivel(elemento) {
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
                elemento.classList.contains('popup') ||
                elemento.classList.contains('overlay') ||
                elemento.classList.contains('alert') ||
                elemento.classList.contains('confirm') ||
                elemento.getAttribute('role') === 'dialog' ||
                elemento.getAttribute('role') === 'alertdialog' ||
                elemento.tagName === 'DIALOG'
            )
        );
    }
    
    /**
     * FECHAR MODAL
     * Tenta fechar modal usando vários métodos
     */
    fecharModal(modal) {
        console.log('🔐 Tentando fechar modal:', modal);
        
        // === MÉTODO 1: PROCURAR BOTÕES DE FECHAR ===
        const seletoresFechamento = [
            'button[class*="close"]',
            'button[class*="cancel"]',
            'button[class*="ok"]',
            'button[onclick*="close"]',
            'button[onclick*="cancel"]',
            'button[onclick*="ok"]',
            'button[onclick*="fechar"]',
            '.close',
            '.cancel',
            '.ok',
            '.btn-close',
            '.btn-cancel',
            '.btn-ok',
            '[aria-label="Close"]',
            '[aria-label="Fechar"]',
            '[title="Fechar"]',
            '[title="Close"]',
            'input[type="button"][value*="OK"]',
            'input[type="button"][value*="Fechar"]',
            'input[type="button"][value*="Cancelar"]'
        ];
        
        for (const seletor of seletoresFechamento) {
            const botoes = modal.querySelectorAll(seletor);
            if (botoes.length > 0) {
                botoes[0].click();
                console.log(`✅ Modal fechado via seletor: ${seletor}`);
                return true;
            }
        }
        
        // === MÉTODO 2: PROCURAR POR TEXTO ===
        const todosBotoes = modal.querySelectorAll('button, input[type="button"], input[type="submit"]');
        for (const botao of todosBotoes) {
            const texto = (botao.textContent || botao.value || '').toLowerCase();
            
            if (texto.includes('ok') || texto.includes('fechar') || texto.includes('close') || 
                texto.includes('cancel') || texto.includes('sim') || texto.includes('continuar') ||
                texto.includes('confirmar') || texto.includes('aceitar')) {
                
                botao.click();
                console.log(`✅ Modal fechado via texto: ${texto}`);
                return true;
            }
        }
        
        // === MÉTODO 3: TECLAS ESC E ENTER ===
        const eventos = [
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })
        ];
        
        eventos.forEach(evento => {
            modal.dispatchEvent(evento);
            document.dispatchEvent(evento);
        });
        
        // === MÉTODO 4: OCULTAR FORÇADAMENTE ===
        setTimeout(() => {
            if (this.isModalVisivel(modal)) {
                modal.style.display = 'none';
                modal.style.visibility = 'hidden';
                modal.style.opacity = '0';
                console.log('🔒 Modal ocultado forçadamente');
            }
        }, 1000);
        
        return false; // Não confirmou fechamento imediato
    }
    
    // === UTILITÁRIOS ===
    
    /**
     * AGUARDAR CARREGAMENTO DE DADOS
     * Aguarda dados serem carregados após preencher identificador
     */
    async aguardarCarregamentoDados() {
        console.log('⏳ Aguardando carregamento de dados...');
        
        // Aguardar tempo padrão para carregamento
        await this.aguardar(7000);
        
        // Aqui poderia adicionar lógica específica para detectar quando dados carregaram
        // Por exemplo, aguardar um elemento específico aparecer ou campo ser habilitado
        
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
    encontrarCampo(documento, seletores) {
        for (const seletor of seletores) {
            const campo = documento.querySelector(seletor);
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
    async aguardarElemento(funcaoBusca, timeout = 10000) {
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
                    // Ignorar erros de acesso
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
    async aguardarElementoHabilitado(elemento, timeout = 10000) {
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
     * Simula digitação humana caractere por caractere
     */
    async digitarTexto(campo, texto) {
        for (let i = 0; i < texto.length; i++) {
            campo.value += texto[i];
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            await this.aguardar(50 + Math.random() * 100); // Delay aleatório entre 50-150ms
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
 * Garante inicialização única do executor
 */
let executor = null;

if (!executor) {
    executor = new ExecutorCadastros();
    console.log('🎯 Executor de Cadastros ativo na página');
}