/**
 * SISTEMA DE CADASTRAMENTO DE LISTA DE DIVERSOS
 * 
 * Esta classe gerencia a interface principal da extensão, incluindo:
 * - Wizard de 3 etapas para configuração
 * - Sistema de auto-salvamento em tempo real
 * - Controle de processamento em background
 * - Indicadores visuais de status
 * 
 * @author Claude.AI
 * @version 2.0
 */

class CadastroListaDiversosUI {
    constructor() {
        // === CONFIGURAÇÕES BÁSICAS ===
        this.currentStep = 1;           // Etapa atual do wizard (1-3)
        this.totalSteps = 3;            // Total de etapas do wizard
        this.isMinimized = false;       // Status da janela (minimizada/expandida)
        this.isProcessing = false;      // Status do processamento
        this.logExpanded = true;        // Status do log (expandido/recolhido)
        
        // === ESTADO DO PROCESSO ===
        this.estado = {
            processando: false,         // Se há processo em andamento
            identificadores: [],        // Lista de identificadores para processar
            conteudoPadrao: '',        // Conteúdo que será aplicado a todos
            indiceAtual: 0,            // Índice do item sendo processado
            contadores: {              // Contadores de resultado
                sucesso: 0,
                erro: 0, 
                pendente: 0
            },
            opcoes: {                  // Opções de processamento
                autoSubmit: true,      // Submeter automaticamente
                aguardarModal: true,   // Aguardar e fechar modais
                intervaloItens: true   // Intervalo entre itens
            }
        };
        
        // === SISTEMA DE SINCRONIZAÇÃO ===
        this.syncInterval = null;       // Intervalo de sincronização com background
        this.logItems = [];            // Items do log de execução
        
        // === SISTEMA DE AUTO-SALVAMENTO ===
        this.autoSaveQueue = new Set(); // Fila de itens para salvar
        this.saveInProgress = false;    // Flag de salvamento em progresso
        this.lastSaveData = null;       // Últimos dados salvos (para comparação)
        this.autoSaveTimeout = null;    // Timeout do auto-save
        
        // Inicializar sistema
        this.init();
    }
    
    /**
     * INICIALIZAÇÃO PRINCIPAL
     * Configura todos os sistemas necessários para funcionamento da extensão
     */
    async init() {
        console.log('🚀 Iniciando Cadastramento de Lista de Diversos...');
        
        try {
            // Carregar configurações salvas
            await this.carregarConfiguracao();
            
            // Sincronizar estado com background
            await this.sincronizarEstado();
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Iniciar sincronização periódica
            this.iniciarSincronizacao();
            
            // Verificar se há processamento em andamento
            this.verificarEstadoProcessamento();
            
            // Configurar sistema de auto-save
            this.setupAutoSaveSystem();
            
            console.log('✅ Inicialização concluída com sucesso');
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
            this.mostrarIndicadorSalvamento('❌ Erro na inicialização', 'error');
        }
    }
    
    /**
     * CONFIGURAÇÃO DE EVENT LISTENERS
     * Define todos os eventos da interface: cliques, digitação, etc.
     */
    setupEventListeners() {
        console.log('🔧 Configurando event listeners...');
        
        // === NAVEGAÇÃO DO WIZARD ===
        document.getElementById('nextStep1').addEventListener('click', () => this.proximaEtapa());
        document.getElementById('nextStep2').addEventListener('click', () => this.proximaEtapa());
        document.getElementById('prevStep2').addEventListener('click', () => this.etapaAnterior());
        document.getElementById('prevStep3').addEventListener('click', () => this.etapaAnterior());
        
        // === GERENCIAMENTO DE INPUTS ===
        const identifierTextarea = document.getElementById('identifierTextarea');
        const identifierInputArea = document.getElementById('identifierInputArea');
        const identifierPlaceholder = document.getElementById('identifierPlaceholder');
        
        // Clique na área do input
        identifierInputArea.addEventListener('click', (e) => {
            if (e.target === identifierInputArea) {
                identifierTextarea.focus();
            }
        });
        
        // Eventos de foco do textarea de identificadores
        identifierTextarea.addEventListener('focus', () => {
            identifierInputArea.classList.add('focused');
            identifierPlaceholder.classList.add('hidden');
        });
        
        identifierTextarea.addEventListener('blur', () => {
            identifierInputArea.classList.remove('focused');
            if (!identifierTextarea.value.trim()) {
                identifierPlaceholder.classList.remove('hidden');
            }
        });
        
        // === AUTO-SALVAMENTO IMEDIATO ===
        // Salvar identificadores imediatamente quando digitados
        identifierTextarea.addEventListener('input', () => {
            this.atualizarInputIdentificadores();
            this.salvarImediatamente('identificadores', identifierTextarea.value);
        });
        
        // Salvar conteúdo imediatamente quando digitado
        const contentInput = document.getElementById('contentInput');
        contentInput.addEventListener('input', () => {
            this.atualizarInputConteudo();
            this.salvarImediatamente('conteudo', contentInput.value);
        });
        
        // === EVENTOS DE COLA (PASTE) ===
        // Detectar quando usuário cola dados e salvar
        identifierTextarea.addEventListener('paste', () => {
            setTimeout(() => {
                this.atualizarInputIdentificadores();
                this.salvarImediatamente('identificadores', identifierTextarea.value);
            }, 100);
        });
        
        contentInput.addEventListener('paste', () => {
            setTimeout(() => {
                this.atualizarInputConteudo();
                this.salvarImediatamente('conteudo', contentInput.value);
            }, 100);
        });
        
        // === OPÇÕES DE SUBMISSÃO ===
        document.getElementById('autoSubmitOption').addEventListener('change', (e) => {
            this.estado.opcoes.autoSubmit = e.target.checked;
            this.salvarOpcoes();
        });
        
        document.getElementById('waitModalOption').addEventListener('change', (e) => {
            this.estado.opcoes.aguardarModal = e.target.checked;
            this.salvarOpcoes();
        });
        
        document.getElementById('delayBetweenOption').addEventListener('change', (e) => {
            this.estado.opcoes.intervaloItens = e.target.checked;
            this.salvarOpcoes();
        });
        
        // === BOTÕES DE AÇÃO ===
        document.getElementById('normalizeBtn').addEventListener('click', () => this.normalizarIdentificadores());
        document.getElementById('startProcess').addEventListener('click', () => this.iniciarProcessoCadastramento());
        document.getElementById('stopProcess').addEventListener('click', () => this.pararProcesso());
        
        // === CONTROLES DE INTERFACE ===
        document.getElementById('minimizeBtn').addEventListener('click', () => this.alternarMinimizacao());
        document.getElementById('header').addEventListener('click', () => {
            if (this.isMinimized) {
                this.alternarMinimizacao();
            }
        });
        
        document.getElementById('logHeader').addEventListener('click', () => this.alternarLog());
        
        // === ATALHOS DE TECLADO ===
        document.addEventListener('keydown', (e) => {
            // Ctrl+S para salvar manualmente
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.salvarForcado();
                this.mostrarIndicadorSalvamento('💾 Dados salvos manualmente');
                return;
            }
            
            // Ctrl+Enter para próxima etapa ou iniciar processo
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (this.currentStep < this.totalSteps) {
                    this.proximaEtapa();
                } else if (this.currentStep === this.totalSteps && !this.isProcessing) {
                    this.iniciarProcessoCadastramento();
                }
            }
        });
        
        // === COMUNICAÇÃO COM BACKGROUND ===
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'updatePopup') {
                this.handleAtualizacaoBackground(message);
            }
        });
        
        // === SALVAMENTO ANTES DE FECHAR ===
        window.addEventListener('beforeunload', () => {
            this.salvarForcado();
        });
        
        // Salvar quando janela perde foco
        window.addEventListener('blur', () => {
            this.salvarDadosAtuais();
        });
        
        console.log('✅ Event listeners configurados');
    }
    
    /**
     * SISTEMA DE AUTO-SALVAMENTO
     * Configura salvamento automático e indicadores visuais
     */
    setupAutoSaveSystem() {
        console.log('💾 Configurando sistema de auto-salvamento...');
        
        // Criar indicador visual de salvamento
        this.criarIndicadorSalvamento();
        
        // Backup periódico a cada 10 segundos
        setInterval(() => {
            this.backupDadosAtuais();
        }, 10000);
        
        // Recuperar dados não salvos se existirem
        this.recuperarDadosNaoSalvos();
        
        console.log('✅ Sistema de auto-save configurado');
    }
    
    /**
     * CRIAR INDICADOR VISUAL DE SALVAMENTO
     * Adiciona elemento visual que mostra status de salvamento
     */
    criarIndicadorSalvamento() {
        const indicator = document.createElement('div');
        indicator.id = 'saveIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: var(--success);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        indicator.textContent = '💾 Dados salvos automaticamente';
        document.body.appendChild(indicator);
    }
    
    /**
     * MOSTRAR INDICADOR DE SALVAMENTO
     * Exibe temporariamente o status de salvamento
     */
    mostrarIndicadorSalvamento(texto = '💾 Dados salvos automaticamente', tipo = 'success') {
        const indicator = document.getElementById('saveIndicator');
        const statusHeader = document.getElementById('saveStatus');
        
        if (indicator) {
            indicator.textContent = texto;
            indicator.style.opacity = '1';
            
            // Definir cor baseada no tipo
            switch(tipo) {
                case 'saving':
                    indicator.style.background = 'var(--warning)';
                    break;
                case 'error':
                    indicator.style.background = 'var(--error)';
                    break;
                default:
                    indicator.style.background = 'var(--success)';
            }
            
            setTimeout(() => {
                indicator.style.opacity = '0';
            }, 3000);
        }
        
        // Atualizar status no header
        if (statusHeader) {
            statusHeader.textContent = tipo === 'saving' ? 'Salvando...' : 
                                     tipo === 'error' ? 'Erro' : 'Salvo';
            statusHeader.className = `save-status ${tipo}`;
        }
    }
    
    /**
     * SALVAR DADOS IMEDIATAMENTE
     * Adiciona item à fila de salvamento e processa imediatamente
     */
    salvarImediatamente(tipo, valor) {
        console.log(`💾 Salvamento imediato solicitado: ${tipo}`);
        
        // Adicionar à fila de salvamento
        this.autoSaveQueue.add(tipo);
        
        // Processar fila se não há salvamento em progresso
        if (!this.saveInProgress) {
            this.processarFilaSalvamento();
        }
    }
    
    /**
     * PROCESSAR FILA DE SALVAMENTO
     * Processa todos os itens pendentes de salvamento
     */
    async processarFilaSalvamento() {
        if (this.saveInProgress || this.autoSaveQueue.size === 0) return;
        
        this.saveInProgress = true;
        this.mostrarIndicadorSalvamento('💾 Salvando dados...', 'saving');
        
        try {
            const dadosAtuais = this.obterDadosFormulario();
            
            // Verificar se realmente houve mudança
            if (this.dadosMudaram(dadosAtuais)) {
                await this.salvarParaBackground(dadosAtuais);
                await this.salvarBackupLocal(dadosAtuais);
                this.lastSaveData = { ...dadosAtuais };
                this.mostrarIndicadorSalvamento('💾 Dados salvos com sucesso');
                console.log('✅ Dados salvos com sucesso');
            }
            
        } catch (error) {
            console.error('❌ Erro no salvamento automático:', error);
            this.mostrarIndicadorSalvamento('❌ Erro ao salvar dados', 'error');
        } finally {
            this.autoSaveQueue.clear();
            this.saveInProgress = false;
        }
    }
    
    /**
     * OBTER DADOS DO FORMULÁRIO
     * Coleta todos os dados atuais dos campos do formulário
     */
    obterDadosFormulario() {
        return {
            listaIdentificadores: document.getElementById('identifierTextarea').value,
            conteudoPadrao: document.getElementById('contentInput').value,
            etapaAtual: this.currentStep,
            opcoes: {
                autoSubmit: document.getElementById('autoSubmitOption').checked,
                aguardarModal: document.getElementById('waitModalOption').checked,
                intervaloItens: document.getElementById('delayBetweenOption').checked
            },
            timestamp: Date.now()
        };
    }
    
    /**
     * VERIFICAR SE DADOS MUDARAM
     * Compara dados atuais com última versão salva
     */
    dadosMudaram(dadosAtuais) {
        if (!this.lastSaveData) return true;
        
        return (
            this.lastSaveData.listaIdentificadores !== dadosAtuais.listaIdentificadores ||
            this.lastSaveData.conteudoPadrao !== dadosAtuais.conteudoPadrao ||
            this.lastSaveData.etapaAtual !== dadosAtuais.etapaAtual ||
            JSON.stringify(this.lastSaveData.opcoes) !== JSON.stringify(dadosAtuais.opcoes)
        );
    }
    
    /**
     * SALVAR PARA BACKGROUND
     * Envia dados para o background script
     */
    async salvarParaBackground(dados) {
        await chrome.runtime.sendMessage({
            action: 'salvarConfiguracao',
            listaIdentificadores: dados.listaIdentificadores,
            conteudoPadrao: dados.conteudoPadrao,
            etapaAtual: dados.etapaAtual,
            opcoes: dados.opcoes
        });
    }
    
    /**
     * SALVAR BACKUP LOCAL
     * Cria backup local usando localStorage
     */
    async salvarBackupLocal(dados) {
        // Backup principal
        localStorage.setItem('cadastro_diversos_backup', JSON.stringify(dados));
        
        // Histórico dos últimos 5 saves
        const historico = JSON.parse(localStorage.getItem('cadastro_diversos_historico') || '[]');
        historico.unshift(dados);
        if (historico.length > 5) historico.pop();
        localStorage.setItem('cadastro_diversos_historico', JSON.stringify(historico));
    }
    
    /**
     * RECUPERAR DADOS NÃO SALVOS
     * Verifica se há dados não salvos e oferece recuperação
     */
    async recuperarDadosNaoSalvos() {
        try {
            const backup = localStorage.getItem('cadastro_diversos_backup');
            if (backup) {
                const dados = JSON.parse(backup);
                
                // Verificar se backup é recente (última hora)
                if (Date.now() - dados.timestamp < 3600000) {
                    const dadosAtuais = this.obterDadosFormulario();
                    
                    // Se há dados no backup que não estão no formulário atual
                    if ((dados.listaIdentificadores && !dadosAtuais.listaIdentificadores) || 
                        (dados.conteudoPadrao && !dadosAtuais.conteudoPadrao)) {
                        
                        if (confirm('Foram encontrados dados não salvos da sessão anterior. Deseja recuperá-los?')) {
                            this.restaurarDoBackup(dados);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Erro ao recuperar dados:', error);
        }
    }
    
    /**
     * RESTAURAR DO BACKUP
     * Restaura dados de um backup anterior
     */
    restaurarDoBackup(dados) {
        console.log('🔄 Restaurando dados do backup...');
        
        if (dados.listaIdentificadores) {
            document.getElementById('identifierTextarea').value = dados.listaIdentificadores;
            this.atualizarInputIdentificadores();
        }
        
        if (dados.conteudoPadrao) {
            document.getElementById('contentInput').value = dados.conteudoPadrao;
            this.atualizarInputConteudo();
        }
        
        if (dados.etapaAtual && dados.etapaAtual !== this.currentStep) {
            this.currentStep = dados.etapaAtual;
            this.atualizarEtapaWizard();
        }
        
        if (dados.opcoes) {
            document.getElementById('autoSubmitOption').checked = dados.opcoes.autoSubmit;
            document.getElementById('waitModalOption').checked = dados.opcoes.aguardarModal;
            document.getElementById('delayBetweenOption').checked = dados.opcoes.intervaloItens;
        }
        
        this.mostrarIndicadorSalvamento('🔄 Dados restaurados com sucesso');
        console.log('✅ Dados restaurados do backup');
    }
    
    /**
     * SALVAR DADOS ATUAIS
     * Salva estado atual dos dados
     */
    salvarDadosAtuais() {
        const dadosAtuais = this.obterDadosFormulario();
        this.salvarBackupLocal(dadosAtuais);
    }
    
    /**
     * BACKUP DOS DADOS ATUAIS
     * Realiza backup periódico se não há salvamento em progresso
     */
    backupDadosAtuais() {
        if (!this.saveInProgress) {
            this.salvarDadosAtuais();
        }
    }
    
    /**
     * SALVAMENTO FORÇADO
     * Força salvamento imediato de todos os dados
     */
    async salvarForcado() {
        console.log('💾 Salvamento forçado iniciado...');
        const dadosAtuais = this.obterDadosFormulario();
        
        try {
            await this.salvarParaBackground(dadosAtuais);
            await this.salvarBackupLocal(dadosAtuais);
            this.lastSaveData = { ...dadosAtuais };
            console.log('✅ Salvamento forçado concluído');
        } catch (error) {
            console.error('❌ Erro no salvamento forçado:', error);
        }
    }
    
    /**
     * SALVAR OPÇÕES
     * Salva as opções de submissão
     */
    async salvarOpcoes() {
        const opcoes = {
            autoSubmit: document.getElementById('autoSubmitOption').checked,
            aguardarModal: document.getElementById('waitModalOption').checked,
            intervaloItens: document.getElementById('delayBetweenOption').checked
        };
        
        this.estado.opcoes = opcoes;
        await chrome.runtime.sendMessage({
            action: 'salvarOpcoes',
            opcoes: opcoes
        });
        
        console.log('⚙️ Opções salvas:', opcoes);
    }
    
    /**
     * CARREGAR CONFIGURAÇÃO
     * Carrega configurações salvas do background
     */
    async carregarConfiguracao() {
        console.log('📥 Carregando configurações...');
        
        try {
            const response = await chrome.runtime.sendMessage({ action: 'carregarConfiguracao' });
            
            if (response.listaIdentificadores) {
                document.getElementById('identifierTextarea').value = response.listaIdentificadores;
                this.atualizarInputIdentificadores();
            }
            
            if (response.conteudoPadrao) {
                document.getElementById('contentInput').value = response.conteudoPadrao;
                this.atualizarInputConteudo();
            }
            
            if (response.etapaAtual && response.etapaAtual !== this.currentStep) {
                this.currentStep = response.etapaAtual;
                this.atualizarEtapaWizard();
            }
            
            if (response.opcoes) {
                document.getElementById('autoSubmitOption').checked = response.opcoes.autoSubmit !== false;
                document.getElementById('waitModalOption').checked = response.opcoes.aguardarModal !== false;
                document.getElementById('delayBetweenOption').checked = response.opcoes.intervaloItens !== false;
                this.estado.opcoes = response.opcoes;
            }
            
            // Definir dados carregados como baseline para comparação
            this.lastSaveData = this.obterDadosFormulario();
            
            console.log('✅ Configurações carregadas');
        } catch (error) {
            console.error('❌ Erro ao carregar configurações:', error);
        }
    }
    
    /**
     * SINCRONIZAR ESTADO
     * Sincroniza estado com o background script
     */
    async sincronizarEstado() {
        try {
            const estado = await chrome.runtime.sendMessage({ action: 'obterEstado' });
            this.estado = estado;
            this.atualizarInterface();
        } catch (error) {
            console.error('❌ Erro ao sincronizar estado:', error);
        }
    }
    
    /**
     * INICIAR SINCRONIZAÇÃO
     * Inicia sincronização periódica com background
     */
    iniciarSincronizacao() {
        this.syncInterval = setInterval(() => {
            this.sincronizarEstado();
        }, 1000);
        
        window.addEventListener('beforeunload', () => {
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
            }
        });
    }
    
    /**
     * VERIFICAR ESTADO DE PROCESSAMENTO
     * Verifica se há processo em andamento e ajusta interface
     */
    verificarEstadoProcessamento() {
        if (this.estado.processando) {
            this.mostrarVisualizacaoProcessamento();
        }
    }
    
    // === NAVEGAÇÃO DO WIZARD ===
    
    /**
     * PRÓXIMA ETAPA
     * Avança para próxima etapa do wizard
     */
    proximaEtapa() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.atualizarEtapaWizard();
            this.salvarImediatamente('etapa', this.currentStep);
        }
    }
    
    /**
     * ETAPA ANTERIOR
     * Retorna para etapa anterior do wizard
     */
    etapaAnterior() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.atualizarEtapaWizard();
            this.salvarImediatamente('etapa', this.currentStep);
        }
    }
    
    /**
     * ATUALIZAR ETAPA DO WIZARD
     * Atualiza interface para mostrar etapa atual
     */
    atualizarEtapaWizard() {
        console.log(`📋 Atualizando para etapa ${this.currentStep}`);
        
        // Atualizar indicadores de etapa
        const wizardSteps = document.getElementById('wizardSteps');
        wizardSteps.className = `wizard-steps step-${this.currentStep}`;
        
        // Atualizar elementos de etapa
        for (let i = 1; i <= this.totalSteps; i++) {
            const stepEl = document.getElementById(`step${i}`);
            const contentEl = document.getElementById(`stepContent${i}`);
            
            stepEl.classList.remove('active', 'completed');
            contentEl.classList.remove('active');
            
            if (i < this.currentStep) {
                stepEl.classList.add('completed');
                stepEl.innerHTML = '<span>✓</span>';
            } else if (i === this.currentStep) {
                stepEl.classList.add('active');
                stepEl.innerHTML = `<span>${i}</span>`;
                contentEl.classList.add('active');
            } else {
                stepEl.innerHTML = `<span>${i}</span>`;
            }
        }
        
        // Atualizar resumo na etapa 3
        if (this.currentStep === 3) {
            this.atualizarResumo();
        }
    }
    
    /**
     * ATUALIZAR RESUMO
     * Atualiza resumo das configurações na etapa final
     */
    atualizarResumo() {
        const contadorIds = this.processarListaIdentificadores(document.getElementById('identifierTextarea').value).length;
        const tamanhoConteudo = document.getElementById('contentInput').value.length;
        
        document.getElementById('summaryIdentifierCount').textContent = `${contadorIds} itens`;
        document.getElementById('summaryContentLength').textContent = `${tamanhoConteudo} caracteres`;
    }
    
    // === GERENCIAMENTO DE INPUTS ===
    
    /**
     * ATUALIZAR INPUT DE IDENTIFICADORES
     * Atualiza interface do campo de identificadores
     */
    atualizarInputIdentificadores() {
        const textarea = document.getElementById('identifierTextarea');
        const inputArea = document.getElementById('identifierInputArea');
        const placeholder = document.getElementById('identifierPlaceholder');
        
        const hasContent = textarea.value.trim().length > 0;
        
        if (hasContent) {
            inputArea.classList.add('has-content');
            placeholder.classList.add('hidden');
        } else {
            inputArea.classList.remove('has-content');
            if (document.activeElement !== textarea) {
                placeholder.classList.remove('hidden');
            }
        }
        
        this.atualizarContadorIdentificadores();
        this.validarEtapa1();
    }
    
    /**
     * ATUALIZAR CONTADOR DE IDENTIFICADORES
     * Atualiza contador e validação dos identificadores
     */
    atualizarContadorIdentificadores() {
        const identificadores = this.processarListaIdentificadores(document.getElementById('identifierTextarea').value);
        const contador = document.getElementById('identifierCount');
        const validacao = document.getElementById('identifierValidation');
        
        if (identificadores.length === 0) {
            contador.textContent = '0 identificadores detectados';
            contador.style.color = 'var(--gray-500)';
            validacao.textContent = '';
        } else {
            contador.textContent = `${identificadores.length} identificadores detectados`;
            contador.style.color = 'var(--success)';
            validacao.textContent = '✅ Válidos';
            validacao.style.color = 'var(--success)';
        }
    }
    
    /**
     * ATUALIZAR INPUT DE CONTEÚDO
     * Atualiza interface do campo de conteúdo
     */
    atualizarInputConteudo() {
        const contentInput = document.getElementById('contentInput');
        const hasContent = contentInput.value.trim().length > 0;
        
        if (hasContent) {
            contentInput.classList.add('has-content');
        } else {
            contentInput.classList.remove('has-content');
        }
        
        this.validarEtapa2();
    }
    
    /**
     * VALIDAR ETAPA 1
     * Valida se etapa 1 pode ser concluída
     */
    validarEtapa1() {
        const identificadores = this.processarListaIdentificadores(document.getElementById('identifierTextarea').value);
        const nextBtn = document.getElementById('nextStep1');
        nextBtn.disabled = identificadores.length === 0;
    }
    
    /**
     * VALIDAR ETAPA 2
     * Valida se etapa 2 pode ser concluída
     */
    validarEtapa2() {
        const temConteudo = document.getElementById('contentInput').value.trim().length > 0;
        const nextBtn = document.getElementById('nextStep2');
        nextBtn.disabled = !temConteudo;
    }
    
    /**
     * NORMALIZAR IDENTIFICADORES
     * Organiza e limpa lista de identificadores
     */
    normalizarIdentificadores() {
        console.log('🔧 Normalizando identificadores...');
        
        const textarea = document.getElementById('identifierTextarea');
        const identificadores = this.processarListaIdentificadores(textarea.value);
        
        if (identificadores.length === 0) {
            this.adicionarItemLog('Nenhum identificador válido para normalizar', 'error');
            return;
        }
        
        // Efeito visual de processamento
        textarea.style.opacity = '0.6';
        setTimeout(() => {
            textarea.value = identificadores.join('\n');
            textarea.style.opacity = '1';
            this.atualizarInputIdentificadores();
            this.salvarImediatamente('identificadores', textarea.value);
            this.adicionarItemLog(`${identificadores.length} identificadores normalizados`, 'success');
        }, 200);
    }
    
    // === GERENCIAMENTO DE PROCESSO ===
    
    /**
     * INICIAR PROCESSO DE CADASTRAMENTO
     * Inicia o processo principal de cadastramento
     */
    async iniciarProcessoCadastramento() {
        console.log('🚀 Iniciando processo de cadastramento...');
        
        const listaIdentificadores = this.processarListaIdentificadores(document.getElementById('identifierTextarea').value);
        const conteudoPadrao = document.getElementById('contentInput').value;
        
        // Validações
        if (listaIdentificadores.length === 0) {
            this.adicionarItemLog('Nenhum identificador para processar', 'error');
            return;
        }
        
        if (!conteudoPadrao.trim()) {
            this.adicionarItemLog('Conteúdo padrão não informado', 'error');
            return;
        }
        
        // Salvar antes de iniciar
        await this.salvarForcado();
        
        // Obter opções de submissão
        const opcoes = {
            autoSubmit: document.getElementById('autoSubmitOption').checked,
            aguardarModal: document.getElementById('waitModalOption').checked,
            intervaloItens: document.getElementById('delayBetweenOption').checked
        };
        
        try {
            await chrome.runtime.sendMessage({
                action: 'iniciarProcesso',
                identificadores: listaIdentificadores,
                conteudoPadrao: conteudoPadrao,
                opcoes: opcoes
            });
            
            this.mostrarVisualizacaoProcessamento();
            this.adicionarItemLog(`Processo iniciado com ${listaIdentificadores.length} itens`, 'success');
            
        } catch (error) {
            console.error('❌ Erro ao iniciar processo:', error);
            this.adicionarItemLog('Erro ao iniciar processo de cadastramento', 'error');
        }
    }
    
    /**
     * PARAR PROCESSO
     * Interrompe processo em andamento
     */
    async pararProcesso() {
        console.log('⏹️ Parando processo...');
        
        try {
            await chrome.runtime.sendMessage({ action: 'pararProcesso' });
            this.adicionarItemLog('Processo interrompido pelo usuário', 'error');
        } catch (error) {
            console.error('❌ Erro ao parar processo:', error);
            this.adicionarItemLog('Erro ao interromper processo', 'error');
        }
    }
    
    /**
     * MOSTRAR VISUALIZAÇÃO DE PROCESSAMENTO
     * Mostra tela de processamento
     */
    mostrarVisualizacaoProcessamento() {
        this.isProcessing = true;
        document.getElementById('wizardContainer').classList.add('hidden');
        document.getElementById('processingView').classList.add('active');
        this.atualizarVisualizacaoMinimizada();
    }
    
    /**
     * MOSTRAR VISUALIZAÇÃO DO WIZARD
     * Retorna para tela do wizard
     */
    mostrarVisualizacaoWizard() {
        this.isProcessing = false;
        document.getElementById('wizardContainer').classList.remove('hidden');
        document.getElementById('processingView').classList.remove('active');
        this.atualizarVisualizacaoMinimizada();
    }
    
    // === CONTROLES DE INTERFACE ===
    
    /**
     * ALTERNAR MINIMIZAÇÃO
     * Alterna entre janela minimizada e expandida
     */
    alternarMinimizacao() {
        this.isMinimized = !this.isMinimized;
        const container = document.getElementById('container');
        const header = document.getElementById('header');
        const mainContent = document.getElementById('mainContent');
        const minimizeIcon = document.getElementById('minimizeIcon');
        
        if (this.isMinimized) {
            container.classList.add('minimized');
            header.classList.add('minimized');
            mainContent.classList.add('hidden');
            minimizeIcon.textContent = '+';
            document.body.style.height = '40px';
        } else {
            container.classList.remove('minimized');
            header.classList.remove('minimized');
            mainContent.classList.remove('hidden');
            minimizeIcon.textContent = '−';
            document.body.style.height = 'auto';
        }
        
        this.atualizarVisualizacaoMinimizada();
    }
    
    /**
     * ATUALIZAR VISUALIZAÇÃO MINIMIZADA
     * Atualiza elementos visíveis quando minimizada
     */
    atualizarVisualizacaoMinimizada() {
        const progressMini = document.getElementById('progressMini');
        const progressText = document.getElementById('progressText');
        
        if (this.isMinimized && this.isProcessing) {
            progressMini.classList.remove('hidden');
            progressText.classList.remove('hidden');
            
            const total = this.estado.identificadores.length;
            const processados = this.estado.contadores.sucesso + this.estado.contadores.erro;
            const porcentagem = total > 0 ? (processados / total) * 100 : 0;
            
            document.getElementById('progressMiniFill').style.width = `${porcentagem}%`;
            progressText.textContent = `${processados}/${total}`;
        } else {
            progressMini.classList.add('hidden');
            progressText.classList.add('hidden');
        }
    }
    
    /**
     * ALTERNAR LOG
     * Expande/recolhe o log de execução
     */
    alternarLog() {
        this.logExpanded = !this.logExpanded;
        const logContent = document.getElementById('logContent');
        const logToggle = document.getElementById('logToggle');
        
        if (this.logExpanded) {
            logContent.style.display = 'block';
            logToggle.textContent = '▼';
        } else {
            logContent.style.display = 'none';
            logToggle.textContent = '▶';
        }
    }
    
    /**
     * ADICIONAR ITEM AO LOG
     * Adiciona entrada no log de execução
     */
    adicionarItemLog(mensagem, tipo = 'info') {
        const logContent = document.getElementById('logContent');
        const timestamp = new Date().toLocaleTimeString();
        
        const logItem = document.createElement('div');
        logItem.className = `log-item ${tipo}`;
        
        const icones = {
            'info': '💡',
            'success': '✅',
            'error': '❌',
            'processing': '🔄'
        };
        
        logItem.innerHTML = `
            <span>${icones[tipo] || '💡'}</span>
            <span>${timestamp}</span>
            <span>${mensagem}</span>
        `;
        
        logContent.appendChild(logItem);
        logContent.scrollTop = logContent.scrollHeight;
        
        // Manter apenas últimos 50 itens
        const logItems = logContent.querySelectorAll('.log-item');
        if (logItems.length > 50) {
            logItems[0].remove();
        }
        
        console.log(`📝 Log: [${tipo.toUpperCase()}] ${mensagem}`);
    }
    
    // === ATUALIZAÇÕES DO BACKGROUND ===
    
    /**
     * HANDLE ATUALIZAÇÃO DO BACKGROUND
     * Processa atualizações vindas do background script
     */
    handleAtualizacaoBackground(message) {
        console.log('📡 Recebida atualização do background:', message);
        
        if (message.estado) {
            this.estado = message.estado;
            this.atualizarInterface();
        }
        
        if (message.mensagem) {
            this.adicionarItemLog(message.mensagem, message.tipo);
        }
    }
    
    /**
     * ATUALIZAR INTERFACE
     * Atualiza toda a interface baseada no estado atual
     */
    atualizarInterface() {
        this.atualizarContadores();
        this.atualizarBarraProgresso();
        this.atualizarIndicadorStatus();
        this.atualizarVisualizacaoMinimizada();
        
        // Se processo terminou, mostrar wizard novamente após delay
        if (!this.estado.processando && this.isProcessing) {
            setTimeout(() => {
                this.mostrarVisualizacaoWizard();
                this.adicionarItemLog('Processo de cadastramento finalizado', 'success');
            }, 2000);
        }
    }
    
    /**
     * ATUALIZAR CONTADORES
     * Atualiza contadores de sucesso, erro e pendentes
     */
    atualizarContadores() {
        document.getElementById('successCount').textContent = this.estado.contadores.sucesso;
        document.getElementById('errorCount').textContent = this.estado.contadores.erro;
        document.getElementById('pendingCount').textContent = this.estado.contadores.pendente;
    }
    
    /**
     * ATUALIZAR BARRA DE PROGRESSO
     * Atualiza barras de progresso (completa e minimizada)
     */
    atualizarBarraProgresso() {
        const total = this.estado.identificadores.length;
        const processados = this.estado.contadores.sucesso + this.estado.contadores.erro;
        const porcentagem = total > 0 ? (processados / total) * 100 : 0;
        
        document.getElementById('progressFull').style.width = `${porcentagem}%`;
        
        if (this.isMinimized) {
            document.getElementById('progressMiniFill').style.width = `${porcentagem}%`;
            document.getElementById('progressText').textContent = `${processados}/${total}`;
        }
    }
    
    /**
     * ATUALIZAR INDICADOR DE STATUS
     * Atualiza indicador visual de status no header
     */
    atualizarIndicadorStatus() {
        const indicator = document.getElementById('statusIndicator');
        
        if (this.estado.processando) {
            indicator.style.background = 'var(--warning)';
            indicator.style.animation = 'pulse 1s infinite';
        } else {
            indicator.style.background = 'var(--success)';
            indicator.style.animation = 'pulse 2s infinite';
        }
    }
    
    // === UTILITÁRIOS ===
    
    /**
     * PROCESSAR LISTA DE IDENTIFICADORES
     * Processa e limpa lista de identificadores
     */
    processarListaIdentificadores(texto) {
        if (!texto || texto.trim() === '') {
            return [];
        }
        
        let identificadores = [];
        const linhas = texto.split('\n');
        
        // Processar cada linha
        for (let linha of linhas) {
            linha = linha.trim();
            if (linha === '') continue;
            
            // Se linha contém vírgulas, dividir
            if (linha.includes(',')) {
                const idsVirgula = linha.split(',')
                    .map(id => id.trim())
                    .filter(id => id.length > 0);
                identificadores = identificadores.concat(idsVirgula);
            } else {
                identificadores.push(linha);
            }
        }
        
        // Remover duplicatas e números inválidos
        const idsUnicos = [...new Set(identificadores)];
        const idsValidos = idsUnicos
            .map(id => id.replace(/\D/g, ''))  // Remover não-dígitos
            .filter(id => id.length >= 4 && id.length <= 10)  // Validar tamanho
            .sort((a, b) => parseInt(a) - parseInt(b));  // Ordenar numericamente
        
        return idsValidos;
    }
}

/**
 * INICIALIZAÇÃO
 * Inicializa a interface quando DOM estiver pronto
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM carregado, inicializando interface...');
    new CadastroListaDiversosUI();
});