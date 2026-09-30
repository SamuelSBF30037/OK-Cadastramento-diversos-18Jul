/**
 * BACKGROUND SCRIPT - CADASTRAMENTO DE LISTA DE DIVERSOS
 * 
 * Gerencia o processamento em background da extensão, incluindo:
 * - Controle de estado persistente
 * - Comunicação entre popup e content scripts
 * - Sistema de backup e recuperação
 * - Gerenciamento de abas e injeção de scripts
 * 
 * @author Claude.AI
 * @version 2.0
 */

class GerenciadorCadastroBackground {
    constructor() {
        // === ESTADO DO PROCESSO ===
        this.estadoProcesso = {
            processando: false,          // Se há processo em andamento
            identificadores: [],         // Lista de identificadores para processar
            conteudoPadrao: '',         // Conteúdo que será aplicado
            indiceAtual: 0,             // Índice do item sendo processado
            contadores: {               // Contadores de resultado
                sucesso: 0,
                erro: 0, 
                pendente: 0
            },
            opcoes: {                   // Opções de processamento
                autoSubmit: true,       // Submeter automaticamente após preenchimento
                aguardarModal: true,    // Aguardar e fechar modais
                intervaloItens: true    // Intervalo entre processamentos
            },
            tabId: null,               // ID da aba sendo usada
            tempoInicio: null          // Timestamp de início do processo
        };
        
        // === SISTEMA DE SALVAMENTO ===
        this.filaSalvamento = new Map();    // Fila de itens para salvar
        this.salvamentoEmProgresso = false; // Flag de salvamento em progresso
        this.debounceTimer = null;          // Timer para debounce de salvamento
        
        // === CONFIGURAÇÃO INICIAL ===
        this.setupListeners();
        this.carregarEstado();
        this.setupBackupAutomatico();
        
        console.log('🚀 Gerenciador de Cadastro Background inicializado');
    }
    
    /**
     * CONFIGURAR LISTENERS DE EVENTOS
     * Define todos os event listeners necessários
     */
    setupListeners() {
        console.log('🔧 Configurando listeners do background...');
        
        // === MENSAGENS DO POPUP E CONTENT SCRIPT ===
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
        
        // === INSTALAÇÃO DA EXTENSÃO ===
        chrome.runtime.onInstalled.addListener(() => {
            console.log('📦 Cadastramento de Lista de Diversos instalado');
            this.inicializarStorage();
        });
        
        // === MONITORAMENTO DE ABAS ===
        // Injetar content script quando aba carrega
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.injetarContentScript(tabId, tab.url);
            }
        });
        
        // Detectar quando aba do processo é fechada
        chrome.tabs.onRemoved.addListener((tabId) => {
            if (tabId === this.estadoProcesso.tabId && this.estadoProcesso.processando) {
                console.log('⚠️ Aba do processo foi fechada, procurando nova aba...');
                this.encontrarTabSistema();
            }
        });
        
        // === SALVAMENTO ANTES DE SUSPENSÃO ===
        // Salvar estado quando service worker for suspenso
        chrome.runtime.onSuspend.addListener(() => {
            console.log('💾 Service worker sendo suspenso, salvando estado...');
            this.salvarTudoForcado();
        });
        
        console.log('✅ Listeners configurados');
    }
    
    /**
     * PROCESSAR MENSAGENS
     * Processa mensagens recebidas do popup e content scripts
     */
    async handleMessage(message, sender, sendResponse) {
        console.log(`📨 Mensagem recebida: ${message.action}`, message);
        
        try {
            switch (message.action) {
                case 'obterEstado':
                    sendResponse(this.estadoProcesso);
                    break;
                    
                case 'iniciarProcesso':
                    await this.iniciarProcesso(message.identificadores, message.conteudoPadrao, message.opcoes);
                    sendResponse({ success: true });
                    break;
                    
                case 'pararProcesso':
                    await this.pararProcesso();
                    sendResponse({ success: true });
                    break;
                    
                case 'itemProcessado':
                    await this.handleItemProcessado(message);
                    break;
                    
                case 'salvarConfiguracao':
                    await this.salvarConfiguracao(
                        message.listaIdentificadores, 
                        message.conteudoPadrao, 
                        message.etapaAtual,
                        message.opcoes
                    );
                    sendResponse({ success: true });
                    break;
                    
                case 'carregarConfiguracao':
                    const config = await this.carregarConfiguracao();
                    sendResponse(config);
                    break;
                    
                case 'salvarOpcoes':
                    await this.salvarOpcoes(message.opcoes);
                    sendResponse({ success: true });
                    break;
                    
                case 'criarBackupDados':
                    await this.criarBackupDados(message.dados);
                    sendResponse({ success: true });
                    break;
                    
                case 'restaurarDados':
                    const dadosRestaurados = await this.restaurarDados();
                    sendResponse(dadosRestaurados);
                    break;
                    
                default:
                    console.log(`⚠️ Ação não reconhecida: ${message.action}`);
                    sendResponse({ error: 'Ação não reconhecida' });
            }
        } catch (error) {
            console.error(`❌ Erro ao processar mensagem ${message.action}:`, error);
            sendResponse({ error: error.message });
        }
    }
    
    /**
     * INICIALIZAR STORAGE
     * Cria estrutura inicial do storage se não existir
     */
    async inicializarStorage() {
        console.log('🗄️ Inicializando storage...');
        
        try {
            const result = await chrome.storage.local.get(['inicializado']);
            if (!result.inicializado) {
                await chrome.storage.local.set({
                    inicializado: true,
                    estadoProcesso: this.estadoProcesso,
                    listaIdentificadores: '',
                    conteudoPadrao: '',
                    etapaAtual: 1,
                    opcoes: {
                        autoSubmit: true,
                        aguardarModal: true,
                        intervaloItens: true
                    },
                    historicoBackup: [],
                    configuracaoUsuario: {
                        autoSave: true,
                        intervaloBackup: 30,
                        maxBackups: 10
                    }
                });
                console.log('✅ Storage inicializado com estrutura padrão');
            }
        } catch (error) {
            console.error('❌ Erro ao inicializar storage:', error);
        }
    }
    
    /**
     * CONFIGURAR BACKUP AUTOMÁTICO
     * Configura sistema de backup automático
     */
    setupBackupAutomatico() {
        console.log('💾 Configurando backup automático...');
        
        // Backup automático a cada 30 segundos
        setInterval(() => {
            this.backupAutomatico();
        }, 30000);
        
        // Backup mais frequente durante processamento
        setInterval(() => {
            if (this.estadoProcesso.processando) {
                this.salvarEstado();
            }
        }, 5000);
        
        console.log('✅ Backup automático configurado');
    }
    
    /**
     * BACKUP AUTOMÁTICO
     * Realiza backup automático das configurações
     */
    async backupAutomatico() {
        try {
            const config = await this.carregarConfiguracao();
            if (config.listaIdentificadores || config.conteudoPadrao) {
                await this.criarSnapshotBackup(config);
            }
        } catch (error) {
            console.error('❌ Erro no backup automático:', error);
        }
    }
    
    /**
     * CRIAR SNAPSHOT DE BACKUP
     * Cria snapshot das configurações atuais
     */
    async criarSnapshotBackup(dados) {
        try {
            const backup = {
                timestamp: Date.now(),
                dados: dados,
                estadoProcesso: this.estadoProcesso.processando ? this.estadoProcesso : null
            };
            
            const result = await chrome.storage.local.get(['historicoBackup']);
            const historico = result.historicoBackup || [];
            
            // Adicionar novo backup
            historico.unshift(backup);
            
            // Manter apenas os últimos 10 backups
            if (historico.length > 10) {
                historico.splice(10);
            }
            
            await chrome.storage.local.set({ historicoBackup: historico });
            console.log('📋 Snapshot de backup criado');
        } catch (error) {
            console.error('❌ Erro ao criar snapshot:', error);
        }
    }
    
    // === GERENCIAMENTO DE ESTADO ===
    
    /**
     * CARREGAR ESTADO
     * Carrega estado salvo e restaura processo se necessário
     */
    async carregarEstado() {
        console.log('📥 Carregando estado...');
        
        try {
            const result = await chrome.storage.local.get(['estadoProcesso']);
            if (result.estadoProcesso) {
                this.estadoProcesso = { ...this.estadoProcesso, ...result.estadoProcesso };
                
                // Se havia processo em andamento, tentar continuar
                if (this.estadoProcesso.processando) {
                    console.log('🔄 Processo em andamento detectado, tentando continuar...');
                    await this.continuarProcesso();
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar estado:', error);
        }
    }
    
    /**
     * SALVAR ESTADO
     * Salva estado atual no storage
     */
    async salvarEstado() {
        this.adicionarFilaSalvamento('estadoProcesso', this.estadoProcesso);
        await this.processarFilaSalvamento();
    }
    
    /**
     * ADICIONAR À FILA DE SALVAMENTO
     * Adiciona item à fila de salvamento com debounce
     */
    adicionarFilaSalvamento(chave, valor) {
        this.filaSalvamento.set(chave, {
            valor: valor,
            timestamp: Date.now()
        });
        
        // Processar fila com debounce para evitar muitas escritas
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.processarFilaSalvamento();
        }, 100);
    }
    
    /**
     * PROCESSAR FILA DE SALVAMENTO
     * Processa todos os itens pendentes na fila de salvamento
     */
    async processarFilaSalvamento() {
        if (this.salvamentoEmProgresso || this.filaSalvamento.size === 0) return;
        
        this.salvamentoEmProgresso = true;
        console.log('💾 Processando fila de salvamento...');
        
        try {
            const dadosSalvar = {};
            
            // Coletar todos os itens da fila
            for (const [chave, dados] of this.filaSalvamento) {
                dadosSalvar[chave] = dados.valor;
            }
            
            // Salvar tudo de uma vez
            await chrome.storage.local.set(dadosSalvar);
            
            console.log(`✅ ${this.filaSalvamento.size} itens salvos:`, Object.keys(dadosSalvar));
            this.filaSalvamento.clear();
            
        } catch (error) {
            console.error('❌ Erro ao processar fila de salvamento:', error);
            
            // Em caso de erro, tentar novamente em 5 segundos
            setTimeout(() => {
                this.processarFilaSalvamento();
            }, 5000);
            
        } finally {
            this.salvamentoEmProgresso = false;
        }
    }
    
    /**
     * SALVAR TUDO FORÇADO
     * Força salvamento imediato de tudo
     */
    async salvarTudoForcado() {
        try {
            clearTimeout(this.debounceTimer);
            await this.processarFilaSalvamento();
            
            // Salvar estado atual imediatamente
            await chrome.storage.local.set({ 
                estadoProcesso: this.estadoProcesso,
                ultimoSalvamento: Date.now()
            });
            
            console.log('✅ Salvamento forçado concluído');
        } catch (error) {
            console.error('❌ Erro no salvamento forçado:', error);
        }
    }
    
    // === GERENCIAMENTO DE CONFIGURAÇÕES ===
    
    /**
     * SALVAR CONFIGURAÇÃO
     * Salva configurações do usuário
     */
    async salvarConfiguracao(listaIdentificadores, conteudoPadrao, etapaAtual, opcoes) {
        console.log('💾 Salvando configuração...');
        
        try {
            const dadosSalvar = {
                listaIdentificadores: listaIdentificadores || '',
                conteudoPadrao: conteudoPadrao || '',
                etapaAtual: etapaAtual || 1,
                opcoes: opcoes || this.estadoProcesso.opcoes,
                ultimaConfigSalva: Date.now()
            };
            
            // Salvar imediatamente para configurações
            await chrome.storage.local.set(dadosSalvar);
            
            console.log('✅ Configuração salva:', Object.keys(dadosSalvar));
            
            // Criar backup se há dados importantes
            if (listaIdentificadores || conteudoPadrao) {
                await this.criarSnapshotBackup(dadosSalvar);
            }
            
        } catch (error) {
            console.error('❌ Erro ao salvar configuração:', error);
            throw error;
        }
    }
    
    /**
     * CARREGAR CONFIGURAÇÃO
     * Carrega configurações salvas
     */
    async carregarConfiguracao() {
        console.log('📥 Carregando configuração...');
        
        try {
            const result = await chrome.storage.local.get([
                'listaIdentificadores', 
                'conteudoPadrao', 
                'etapaAtual',
                'opcoes',
                'ultimaConfigSalva'
            ]);
            
            return {
                listaIdentificadores: result.listaIdentificadores || '',
                conteudoPadrao: result.conteudoPadrao || '',
                etapaAtual: result.etapaAtual || 1,
                opcoes: result.opcoes || {
                    autoSubmit: true,
                    aguardarModal: true,
                    intervaloItens: true
                },
                ultimaConfigSalva: result.ultimaConfigSalva
            };
        } catch (error) {
            console.error('❌ Erro ao carregar configuração:', error);
            return {};
        }
    }
    
    /**
     * SALVAR OPÇÕES
     * Salva opções de processamento
     */
    async salvarOpcoes(opcoes) {
        console.log('⚙️ Salvando opções:', opcoes);
        
        this.estadoProcesso.opcoes = opcoes;
        await chrome.storage.local.set({ opcoes: opcoes });
    }
    
    // === PROCESSAMENTO PRINCIPAL ===
    
    /**
     * INICIAR PROCESSO
     * Inicia o processo principal de cadastramento
     */
    async iniciarProcesso(identificadores, conteudoPadrao, opcoes) {
        console.log('🚀 Iniciando processo de cadastramento...');
        console.log(`📊 ${identificadores.length} itens para processar`);
        
        // === PREPARAR ESTADO ===
        this.estadoProcesso.processando = true;
        this.estadoProcesso.identificadores = identificadores.map(id => ({ 
            id, 
            status: 'pendente',
            tentativas: 0,
            tempoInicio: null,
            tempoFim: null
        }));
        this.estadoProcesso.conteudoPadrao = conteudoPadrao;
        this.estadoProcesso.indiceAtual = 0;
        this.estadoProcesso.contadores = { 
            sucesso: 0, 
            erro: 0, 
            pendente: identificadores.length 
        };
        this.estadoProcesso.opcoes = opcoes || {
            autoSubmit: true,
            aguardarModal: true,
            intervaloItens: true
        };
        this.estadoProcesso.tempoInicio = Date.now();
        
        // === ENCONTRAR ABA DO SISTEMA ===
        await this.encontrarTabSistema();
        
        if (!this.estadoProcesso.tabId) {
            this.estadoProcesso.processando = false;
            await this.salvarEstado();
            this.notificarPopup('erro', 'Nenhuma aba do sistema encontrada. Abra a página do sistema primeiro.');
            return;
        }
        
        // === SALVAR ESTADO E CRIAR BACKUP ===
        await this.salvarEstado();
        await this.criarSnapshotBackup({
            listaIdentificadores: identificadores.join('\n'),
            conteudoPadrao: conteudoPadrao,
            processoIniciado: Date.now(),
            opcoes: opcoes
        });
        
        this.notificarPopup('info', 'Processo de cadastramento iniciado');
        
        // === INICIAR PROCESSAMENTO ===
        await this.processarProximoItem();
    }
    
    /**
     * PARAR PROCESSO
     * Interrompe processo em andamento
     */
    async pararProcesso() {
        console.log('⏹️ Parando processo de cadastramento...');
        
        // Criar backup do estado atual antes de parar
        if (this.estadoProcesso.processando) {
            await this.criarSnapshotBackup({
                estadoProcesso: this.estadoProcesso,
                processoPareado: true,
                tempoPareado: Date.now()
            });
        }
        
        this.estadoProcesso.processando = false;
        await this.salvarEstado();
        this.notificarPopup('warning', 'Processo interrompido pelo usuário');
    }
    
    /**
     * CONTINUAR PROCESSO
     * Continua processo interrompido
     */
    async continuarProcesso() {
        if (!this.estadoProcesso.processando) return;
        
        console.log('🔄 Continuando processo...');
        
        // Verificar se aba ainda existe
        try {
            await chrome.tabs.get(this.estadoProcesso.tabId);
        } catch (error) {
            console.log('🔍 Aba anterior não existe, procurando nova...');
            await this.encontrarTabSistema();
        }
        
        if (this.estadoProcesso.tabId) {
            await this.processarProximoItem();
        } else {
            this.estadoProcesso.processando = false;
            await this.salvarEstado();
            this.notificarPopup('erro', 'Aba do sistema não encontrada para continuar processo');
        }
    }
    
    /**
     * ENCONTRAR ABA DO SISTEMA
     * Procura aba com sistema target (SICAD/SISP)
     */
    async encontrarTabSistema() {
        console.log('🔍 Procurando aba do sistema...');
        
        try {
            const tabs = await chrome.tabs.query({});
            const sistemaTab = tabs.find(tab => 
                tab.url && (
                    tab.url.includes('sicad') || 
                    tab.url.includes('sisp') ||
                    tab.url.includes('sistema') // Adicionar outros sistemas conforme necessário
                )
            );
            
            if (sistemaTab) {
                this.estadoProcesso.tabId = sistemaTab.id;
                await this.injetarContentScript(sistemaTab.id, sistemaTab.url);
                console.log(`✅ Aba do sistema encontrada: ${sistemaTab.id} (${sistemaTab.url})`);
            } else {
                this.estadoProcesso.tabId = null;
                console.log('❌ Nenhuma aba do sistema encontrada');
            }
        } catch (error) {
            console.error('❌ Erro ao procurar aba do sistema:', error);
            this.estadoProcesso.tabId = null;
        }
    }
    
    /**
     * INJETAR CONTENT SCRIPT
     * Injeta content script na aba se for do sistema
     */
    async injetarContentScript(tabId, url) {
        if (url && (url.includes('sicad') || url.includes('sisp') || url.includes('sistema'))) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });
                console.log(`✅ Content script injetado na aba ${tabId}`);
            } catch (error) {
                console.log('ℹ️ Content script já injetado ou erro:', error.message);
            }
        }
    }
    
    /**
     * PROCESSAR PRÓXIMO ITEM
     * Processa próximo item da lista
     */
    async processarProximoItem() {
        // Verificar se processo foi cancelado ou se chegou ao fim
        if (!this.estadoProcesso.processando || 
            this.estadoProcesso.indiceAtual >= this.estadoProcesso.identificadores.length) {
            await this.finalizarProcesso();
            return;
        }
        
        const item = this.estadoProcesso.identificadores[this.estadoProcesso.indiceAtual];
        console.log(`📝 Processando item ${this.estadoProcesso.indiceAtual + 1}/${this.estadoProcesso.identificadores.length}: ${item.id}`);
        
        // === MARCAR ITEM COMO PROCESSANDO ===
        item.status = 'processando';
        item.mensagem = 'Preenchendo formulário...';
        item.tempoInicio = Date.now();
        item.tentativas++;
        
        await this.salvarEstado();
        this.notificarPopup('info', 
            `Processando ${item.id} (${this.estadoProcesso.indiceAtual + 1}/${this.estadoProcesso.identificadores.length})`
        );
        
        try {
            // === VERIFICAR SE ABA AINDA EXISTE ===
            await chrome.tabs.get(this.estadoProcesso.tabId);
            
            // === ENVIAR COMANDO PARA CONTENT SCRIPT ===
            await chrome.tabs.sendMessage(this.estadoProcesso.tabId, {
                action: 'processarItem',
                identificador: item.id,
                conteudo: this.estadoProcesso.conteudoPadrao,
                opcoes: this.estadoProcesso.opcoes
            });
            
            // === TIMEOUT DE SEGURANÇA ===
            // Se não receber resposta em 60 segundos, marcar como erro
            setTimeout(() => {
                const itemAtual = this.estadoProcesso.identificadores[this.estadoProcesso.indiceAtual];
                if (itemAtual && itemAtual.status === 'processando') {
                    console.log('⏰ Timeout no processamento do item');
                    this.marcarErro(itemAtual, 'Timeout - item não processado em tempo hábil');
                }
            }, 60000);
            
        } catch (error) {
            console.error('❌ Erro ao processar item:', error);
            this.marcarErro(item, `Erro de comunicação: ${error.message}`);
        }
    }
    
    /**
     * HANDLE ITEM PROCESSADO
     * Processa resultado do item processado
     */
    async handleItemProcessado(message) {
        const item = this.estadoProcesso.identificadores[this.estadoProcesso.indiceAtual];
        
        if (item && item.id === message.identificador) {
            item.tempoFim = Date.now();
            item.duracao = item.tempoFim - (item.tempoInicio || item.tempoFim);
            
            if (message.sucesso) {
                await this.marcarSucesso(item, message.detalhes);
            } else {
                await this.marcarErro(item, message.erro || 'Erro desconhecido');
            }
        } else {
            console.log('⚠️ Resposta de item não corresponde ao item atual');
        }
    }
    
    /**
     * MARCAR SUCESSO
     * Marca item como processado com sucesso
     */
    async marcarSucesso(item, detalhes) {
        console.log(`✅ Item ${item.id} processado com sucesso`);
        
        item.status = 'sucesso';
        item.mensagem = detalhes || 'Cadastrado com sucesso';
        this.estadoProcesso.contadores.sucesso++;
        this.estadoProcesso.contadores.pendente--;
        
        await this.salvarEstado();
        this.notificarPopup('update', null);
        
        // === CONTINUAR PARA PRÓXIMO ITEM ===
        // Delay configurável entre itens
        const delay = this.estadoProcesso.opcoes.intervaloItens ? 3000 : 1000;
        setTimeout(() => {
            this.estadoProcesso.indiceAtual++;
            this.processarProximoItem();
        }, delay);
    }
    
    /**
     * MARCAR ERRO
     * Marca item como processado com erro
     */
    async marcarErro(item, mensagem) {
        console.log(`❌ Erro no item ${item.id}: ${mensagem}`);
        
        item.status = 'erro';
        item.mensagem = mensagem;
        this.estadoProcesso.contadores.erro++;
        this.estadoProcesso.contadores.pendente--;
        
        await this.salvarEstado();
        this.notificarPopup('update', null);
        
        // === CONTINUAR PARA PRÓXIMO ITEM ===
        // Delay maior em caso de erro
        setTimeout(() => {
            this.estadoProcesso.indiceAtual++;
            this.processarProximoItem();
        }, 5000);
    }
    
    /**
     * FINALIZAR PROCESSO
     * Finaliza processo e cria relatório
     */
    async finalizarProcesso() {
        const tempoFim = Date.now();
        const tempoTotal = tempoFim - this.estadoProcesso.tempoInicio;
        
        console.log('🏁 Finalizando processo de cadastramento...');
        
        // === CRIAR BACKUP FINAL ===
        await this.criarSnapshotBackup({
            processoCompleto: true,
            completadoEm: tempoFim,
            tempoTotal: tempoTotal,
            resultados: this.estadoProcesso.contadores,
            itensProcessados: this.estadoProcesso.identificadores
        });
        
        // === ATUALIZAR ESTADO ===
        this.estadoProcesso.processando = false;
        this.estadoProcesso.tempoFim = tempoFim;
        this.estadoProcesso.tempoTotal = tempoTotal;
        
        await this.salvarEstado();
        
        // === NOTIFICAR RESULTADO ===
        const mensagem = `Processo concluído! ✅ ${this.estadoProcesso.contadores.sucesso} sucessos, ❌ ${this.estadoProcesso.contadores.erro} erros`;
        const tipo = this.estadoProcesso.contadores.erro > 0 ? 'warning' : 'success';
        
        this.notificarPopup(tipo, mensagem);
        
        console.log('📊 Estatísticas finais:', {
            total: this.estadoProcesso.identificadores.length,
            sucessos: this.estadoProcesso.contadores.sucesso,
            erros: this.estadoProcesso.contadores.erro,
            tempoTotal: `${Math.round(tempoTotal / 1000)}s`
        });
    }
    
    // === BACKUP E RESTAURAÇÃO ===
    
    /**
     * CRIAR BACKUP DE DADOS
     * Cria backup manual de dados
     */
    async criarBackupDados(dados) {
        console.log('💾 Criando backup manual...');
        
        try {
            const backup = {
                timestamp: Date.now(),
                tipo: 'manual',
                dados: dados
            };
            
            const result = await chrome.storage.local.get(['backupsUsuario']);
            const backups = result.backupsUsuario || [];
            
            backups.unshift(backup);
            
            // Manter apenas os últimos 20 backups manuais
            if (backups.length > 20) {
                backups.splice(20);
            }
            
            await chrome.storage.local.set({ backupsUsuario: backups });
            console.log('✅ Backup manual criado');
            
        } catch (error) {
            console.error('❌ Erro ao criar backup manual:', error);
            throw error;
        }
    }
    
    /**
     * RESTAURAR DADOS
     * Retorna dados disponíveis para restauração
     */
    async restaurarDados() {
        console.log('🔄 Obtendo dados para restauração...');
        
        try {
            const result = await chrome.storage.local.get(['backupsUsuario', 'historicoBackup']);
            
            return {
                manuais: result.backupsUsuario || [],
                automaticos: result.historicoBackup || []
            };
        } catch (error) {
            console.error('❌ Erro ao obter dados para restauração:', error);
            return { manuais: [], automaticos: [] };
        }
    }
    
    // === COMUNICAÇÃO ===
    
    /**
     * NOTIFICAR POPUP
     * Envia notificação para popup se estiver aberto
     */
    notificarPopup(tipo, mensagem) {
        chrome.runtime.sendMessage({
            action: 'updatePopup',
            tipo: tipo,
            mensagem: mensagem,
            estado: this.estadoProcesso
        }).catch(() => {
            // Popup não está aberto, ignorar erro
        });
    }
}

/**
 * INICIALIZAÇÃO DO BACKGROUND SCRIPT
 * Cria instância do gerenciador quando script é carregado
 */
const gerenciador = new GerenciadorCadastroBackground();