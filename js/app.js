/* ============================================================
   app.js
   Núcleo da aplicação: estado global, navegação entre telas
   (SPA por troca de seções) e funções utilitárias reutilizadas
   pelos demais módulos.
   ============================================================ */

const App = {

    /* ============================================================
       1. ESTADO E CONSTANTES
       ============================================================ */

    state: {
        session: null,
        perfil: null,
        isAdm: false,
        funcoes: [],
        locais: [],
        tarefas: [],
        usuarios: [],
    },

    diasSemana: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
    diasSemanaAbrev: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],

    periodoLabel: { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' },
    statusLabel: { planejado: 'Planejado', concluido: 'Concluído' },

    views: {},

    /* ============================================================
       2. INICIALIZAÇÃO E CICLO DE VIDA
       ============================================================ */

    async init() {
        App.bindMenu();
        App.bindGlobalUI();

        const { data } = await HostingerAPI.auth.getSession();
        if (data.session) {
            await App.afterLogin(data.session);
        } else {
            App.showLogin();
        }

        HostingerAPI.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                App.showLogin();
            }
        });
    },

    async afterLogin(session) {
        App.state.session = session;

        const { data: perfil, error } = await HostingerAPI
            .from('usuarios')
            .select('id, nome, email, escopo, ativo, funcao_id, funcoes(nome)')
            .eq('id', session.user.id)
            .maybeSingle();

        if (error || !perfil) {
            Auth.mostrarErroLogin('Não foi possível carregar seu cadastro. Contate o administrador.');
            await HostingerAPI.auth.signOut();
            return;
        }

        if (!perfil.ativo) {
            Auth.mostrarErroLogin('Seu usuário está inativo. Contate o administrador.');
            await HostingerAPI.auth.signOut();
            return;
        }

        App.state.perfil = perfil;
        App.state.isAdm = perfil.escopo === 'adm';

        await App.carregarListasBase();

        App.montarMenu();
        App.preencherCabecalho();
        App.showApp();
        App.navegar('inicio');
    },

    async logout() {
        await HostingerAPI.auth.signOut();
        App.state = { session: null, perfil: null, isAdm: false, funcoes: [], locais: [], tarefas: [], usuarios: [] };
    },

    // ---- Navegação login ↔ app ----
    showLogin() {
        document.getElementById('tela-login').hidden = false;
        document.getElementById('tela-app').hidden = true;
    },

    showApp() {
        document.getElementById('tela-login').hidden = true;
        document.getElementById('tela-app').hidden = false;
    },

    /* ============================================================
       3. CARREGAMENTO DE DADOS BASE
       ============================================================ */

    async carregarListasBase() {
        const [funcoes, locais, tarefas] = await Promise.all([
            HostingerAPI.from('funcoes').select('*').eq('ativo', true).order('nome'),
            HostingerAPI.from('locais').select('*').eq('ativo', true).order('nome'),
            HostingerAPI.from('tarefas').select('*').eq('ativo', true).order('nome'),
        ]);
        App.state.funcoes = funcoes.data || [];
        App.state.locais = locais.data || [];
        App.state.tarefas = tarefas.data || [];
    },

    /* ============================================================
       4. MENU LATERAL E UI GLOBAL
       ============================================================ */

    montarMenu() {
        const itensUser = [
            { id: 'inicio',       label: 'Início',              icone: 'image/casa.png' },
            { id: 'agenda',       label: 'Agenda',              icone: 'image/caderno-alternativo.png' },
            { id: 'calendario',   label: 'Calendário',          icone: 'image/relogio-calendario.png' },
            { id: 'consolidado',  label: 'Consolidado Semanal', icone: 'image/semana-do-calendario.png' },
            { id: 'relatorio',    label: 'Relatório',           icone: 'image/relatorio-de-dados.png' },
            { id: 'indicadores',  label: 'Indicadores',         icone: 'image/calculadora.png' },
        ];
        const itensAdm = [
            { id: 'locais',          label: 'Locais',          icone: 'image/pin.png' },
            { id: 'tarefas',         label: 'Tarefas',         icone: 'image/tarefas.png' },
            { id: 'cadastro',        label: 'Cadastro',        icone: 'image/adicionar-usuario.png' },
            { id: 'relatorio-geral', label: 'Relatório Geral', icone: 'image/arquivo-excel.png' },
        ];

        // Ordem final: Início, Agenda, Calendário, Consolidado,
        // [Locais, Tarefas, Cadastro se ADM], Relatório,
        // [Relatório Geral se ADM], Indicadores
        let itens = [itensUser[0], itensUser[1], itensUser[2], itensUser[3]];
        if (App.state.isAdm) {
            itens.push(itensAdm[0]);
            itens.push(itensAdm[1]);
            itens.push(itensAdm[2]);
        }
        itens.push(itensUser[4]);
        if (App.state.isAdm) itens.push(itensAdm[3]);
        itens.push(itensUser[5]);

        const nav = document.getElementById('menu-nav');
        nav.innerHTML = itens.map(i => `
            <button class="menu-item" data-view="${i.id}">
                <img class="menu-icone" src="${i.icone}" alt="" aria-hidden="true" width="20" height="20">
                <span>${i.label}</span>
            </button>
        `).join('');

        nav.querySelectorAll('.menu-item').forEach(btn => {
            btn.addEventListener('click', () => App.navegar(btn.dataset.view));
        });
    },

    bindMenu() {
        document.getElementById('btn-sair').addEventListener('click', async () => {
            await App.logout();
        });
        document.getElementById('btn-menu-mobile').addEventListener('click', () => {
            document.getElementById('menu-lateral').classList.toggle('aberto');
        });
    },

    bindGlobalUI() {
        document.querySelectorAll('[data-fechar-modal]').forEach(el => {
            el.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-fundo');
                if (modal) modal.hidden = true;
            });
        });
    },

    preencherCabecalho() {
        const p = App.state.perfil;
        document.getElementById('cabecalho-nome').textContent = p.nome;
        document.getElementById('cabecalho-funcao').textContent =
            (p.funcoes && p.funcoes.nome ? p.funcoes.nome : '—') + ' · ' + (App.state.isAdm ? 'Administrador' : 'Usuário');
        document.getElementById('cabecalho-iniciais').textContent = App.iniciais(p.nome);
    },

    /* ============================================================
       5. ROTEAMENTO ENTRE VIEWS (SPA)
       ============================================================ */

    registrarView(id, handlers) {
        App.views[id] = handlers;
    },

    async navegar(viewId) {
        if (!App.views[viewId]) return;

        document.querySelectorAll('.view').forEach(v => v.hidden = true);
        document.querySelectorAll('.menu-item').forEach(b => b.classList.toggle('ativo', b.dataset.view === viewId));

        const secao = document.getElementById('view-' + viewId);
        if (secao) secao.hidden = false;

        document.getElementById('menu-lateral').classList.remove('aberto');

        if (App.views[viewId].onEnter) {
            await App.views[viewId].onEnter();
        }
    },

    /* ============================================================
       6. UTILITÁRIOS
       ============================================================ */

    // ---- Texto e formatação ----
    iniciais(nome) {
        return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
    },

    formatarData(dataISO) {
        if (!dataISO) return '—';
        const [ano, mes, dia] = String(dataISO).slice(0, 10).split('-');
        return `${dia}/${mes}/${ano}`;
    },

    formatarDataCurta(dataISO) {
        const [, mes, dia] = String(dataISO).slice(0, 10).split('-');
        return `${dia}/${mes}`;
    },

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    },

    // Normaliza qualquer formato (array, JSON, "manha,tarde", string) para
    // um array limpo, sem repetidos, na ordem manhã > tarde > noite.
    periodosArray(valor) {
        let arr = valor;
        if (typeof arr === 'string') {
            const txt = arr.trim();
            try {
                const dec = JSON.parse(txt);
                arr = Array.isArray(dec) ? dec : txt.split(',');
            } catch (e) {
                arr = txt.split(',');
            }
        }
        if (!Array.isArray(arr)) return [];
        arr = arr.map(p => String(p).trim().toLowerCase());
        return ['manha', 'tarde', 'noite'].filter(p => arr.includes(p));
    },

    // 'manha' -> "Manhã" | ['manha','tarde'] -> "Manhã / Tarde"
    rotuloPeriodos(periodos) {
        const arr = App.periodosArray(periodos);
        return arr.length ? arr.map(p => App.periodoLabel[p]).join(' / ') : '—';
    },

    // O registro pertence ao usuário logado? (compara como número: id pode vir string)
    ehDono(registro) {
        return !!(registro && App.state.perfil &&
            Number(registro.usuario_id) === Number(App.state.perfil.id));
    },

    podeEditar(registro) {
        return App.state.isAdm || App.ehDono(registro);
    },

    // ---- Datas ----

    // yyyy-mm-dd local, sem depender de fuso do toISOString()
    paraISO(date) {
        const ano = date.getFullYear();
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const dia = String(date.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    },

    // Segunda-feira da semana de "date"
    inicioDaSemana(date) {
        const d = new Date(date);
        const diaSemana = d.getDay();
        const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    },

    // ---- Componentes reutilizáveis ----

    badgeStatus(status) {
        const label = App.statusLabel[status] || status;
        const classe = status === 'concluido' ? 'badge-concluido' : 'badge-planejado';
        return `<span class="badge ${classe}">${label}</span>`;
    },

    toast(msg, tipo = 'ok') {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.className = 'toast visivel ' + (tipo === 'erro' ? 'toast-erro' : 'toast-ok');
        clearTimeout(App._toastTimer);
        App._toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
    },

    // ---- Modais ----

    abrirModal(id) {
        document.getElementById(id).hidden = false;
    },

    fecharModal(id) {
        document.getElementById(id).hidden = true;
    },

    // ---- Formulários ----

    // Preenche um <select> a partir de uma lista { id, nome }
    preencherSelect(select, lista, placeholder) {
        select.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
            lista.map(item => `<option value="${item.id}">${App.escapeHTML(item.nome)}</option>`).join('');
    },
};

document.addEventListener('DOMContentLoaded', App.init);
