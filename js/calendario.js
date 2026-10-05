/* ============================================================
   calendario.js
   Tela "Calendário": visão em FullCalendar dos agendamentos.
   USER vê só os próprios; ADM vê todos.
   Períodos múltiplos → um evento por período.
   Os eventos são buscados só do intervalo visível e o calendário
   continua no mesmo mês/visão depois de salvar ou excluir.
   ============================================================ */

const Calendario = {
    instancia: null,
    _cache: {},
    nomesCompletos: {},
    nomesExibicao: {},
    _mobile: null,

    async render() {
        const container = document.getElementById('view-calendario');
        const isAdm = App.state.isAdm;
        const isMobile = window.matchMedia('(max-width: 640px)').matches;
        Calendario._mobile = isMobile;

        container.innerHTML = `
            <div class="view-cabecalho">
                <h1>Calendário</h1>
                <p class="subtitulo">${isAdm ? 'Visitas agendadas da equipe.' : 'Suas visitas agendadas.'}</p>
            </div>
            <div class="legenda">
                <span class="legenda-item"><span class="ponto ponto-planejado"></span> Planejado</span>
                <span class="legenda-item"><span class="ponto ponto-concluido"></span> Concluído</span>
            </div>
            <div id="calendario-el" class="painel"></div>
        `;

        if (Calendario.instancia) {
            Calendario.instancia.destroy();
            Calendario.instancia = null;
        }

        // Nomes (para exibição abreviada no modo ADM)
        await Calendario.carregarNomes();

        const el = document.getElementById('calendario-el');

        const headerToolbar = isMobile
            ? { left: 'prev,next', center: 'title', right: 'today' }
            : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' };

        Calendario.instancia = new FullCalendar.Calendar(el, {
            locale: 'pt-br',
            height: 'auto',
            initialView: isMobile ? 'listWeek' : 'dayGridMonth',
            headerToolbar,
            buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', list: 'Lista' },
            dayMaxEvents: isMobile ? 3 : false,
            // Manhã, tarde, noite; depois por nome
            eventOrder: ['ordem', 'usuario'],
            events: (info, ok, falha) => {
                Calendario.buscarEventos(info.start, info.end).then(ok).catch(falha);
            },
            eventClick: (info) => Calendario.aoClicarEvento(info.event.extendedProps.agendamentoId),
            dateClick:  (info) => Calendario.aoClicarDia(info.dateStr),

            eventContent: (arg) => {
                const p = arg.event.extendedProps;
                const nomeBloco = App.state.isAdm
                    ? `<span class="evento-cal-usuario">${App.escapeHTML(p.usuario)}</span>`
                    : '';

                return {
                    html: `
                        <div class="evento-cal-wrap">
                            <div class="evento-cal-periodo">${App.periodoLabel[p.periodo] || ''}</div>
                            <div class="evento-cal-caixa">
                                <div class="evento-cal-local">${App.escapeHTML(p.local)}</div>
                                <div class="evento-cal-tarefa">${nomeBloco}${App.escapeHTML(p.tarefa)}</div>
                            </div>
                        </div>
                    `
                };
            },
        });

        Calendario.instancia.render();

        // Só refaz o calendário quando cruza o limite mobile/desktop.
        // (No celular o resize dispara ao rolar a página — não pode resetar o mês.)
        if (!Calendario._resizeBound) {
            Calendario._resizeBound = true;
            let t = null;
            window.addEventListener('resize', () => {
                clearTimeout(t);
                t = setTimeout(() => {
                    const calView = document.getElementById('view-calendario');
                    const agoraMobile = window.matchMedia('(max-width: 640px)').matches;
                    if (calView && !calView.hidden && agoraMobile !== Calendario._mobile) {
                        Calendario.render();
                    }
                }, 250);
            });
        }
    },

    // Atualiza os eventos sem sair do mês/visão em que o usuário está
    async recarregar() {
        if (Calendario.instancia) {
            Calendario.instancia.refetchEvents();
        }
    },

    async carregarNomes() {
        const { data, error } = await HostingerAPI.rpc('listar_usuarios_ativos');
        const mapa = {};
        if (!error && data) {
            data.forEach(u => { mapa[u.id] = u.nome; });
        }
        Calendario.nomesCompletos = mapa;
        Calendario.nomesExibicao = Calendario.montarMapaExibicao(mapa);
        return mapa;
    },

    montarMapaExibicao(mapaCompleto) {
        const contagem = {};
        Object.values(mapaCompleto).forEach(nomeCompleto => {
            const primeiro = (nomeCompleto || '').trim().split(/\s+/)[0] || '—';
            contagem[primeiro] = (contagem[primeiro] || 0) + 1;
        });

        const exibicao = {};
        Object.entries(mapaCompleto).forEach(([id, nomeCompleto]) => {
            const partes = (nomeCompleto || '').trim().split(/\s+/);
            const primeiro = partes[0] || '—';
            exibicao[id] = (contagem[primeiro] > 1 && partes.length > 1)
                ? `${primeiro} ${partes[1]}`
                : primeiro;
        });
        return exibicao;
    },

    // inicio/fim: Date (fim exclusivo, como o FullCalendar entrega)
    async buscarEventos(inicio, fim) {
        const ultimoDia = new Date(fim);
        ultimoDia.setDate(ultimoDia.getDate() - 1);

        let query = HostingerAPI
            .from('agendamentos')
            .select('*')
            .gte('data', App.paraISO(inicio))
            .lte('data', App.paraISO(ultimoDia));

        if (!App.state.isAdm) query = query.eq('usuario_id', App.state.perfil.id);

        const { data, error } = await query;
        if (error) {
            App.toast('Erro ao carregar o calendário: ' + error.message, 'erro');
            return [];
        }

        const ordem = { manha: 1, tarde: 2, noite: 3 };
        Calendario._cache = {};
        const eventos = [];

        (data || []).forEach(a => {
            // nome vem do próprio registro (inclui usuários inativos)
            const nomeCompleto = a.usuarios?.nome || Calendario.nomesCompletos[a.usuario_id] || '—';
            a.usuarios = { ...(a.usuarios || {}), nome: nomeCompleto };
            Calendario._cache[a.id] = a;

            const periodos = App.periodosArray(a.periodo);
            periodos.forEach(per => {
                eventos.push({
                    id: `${a.id}__${per}`,
                    title: `${a.locais?.nome || ''} — ${a.tarefas?.nome || ''}`,
                    start: String(a.data).slice(0, 10),
                    allDay: true,
                    classNames: [`evento-cal-${a.status}`],
                    extendedProps: {
                        agendamentoId: a.id,
                        periodo: per,
                        ordem: ordem[per],
                        local: a.locais?.nome || '—',
                        tarefa: a.tarefas?.nome || '—',
                        usuario: Calendario.nomesExibicao[a.usuario_id] || nomeCompleto.split(/\s+/)[0] || '—',
                        status: a.status,
                    },
                });
            });
        });

        return eventos;
    },

    aoClicarEvento(id) {
        const a = Calendario._cache[id];
        if (!a) return;

        if (a.status === 'planejado' && App.podeEditar(a)) {
            Agenda.abrirFormulario(a);
        } else {
            Calendario.mostrarDetalhes(a);
        }
    },

    aoClicarDia(dataISO) {
        Agenda.novaVisitaComData(dataISO);
    },

    // Modal de detalhes (também usado pelo Consolidado). Mostra "Editar" se permitido.
    mostrarDetalhes(a) {
        const conteudo = document.getElementById('detalhes-conteudo');
        conteudo.innerHTML = Calendario.montarDetalhes(a) + (App.podeEditar(a)
            ? `<div class="modal-rodape"><div class="modal-rodape-acoes">
                   <button type="button" class="btn btn-primario" id="detalhes-editar">Editar</button>
               </div></div>`
            : '');

        const btn = document.getElementById('detalhes-editar');
        if (btn) {
            btn.addEventListener('click', () => {
                App.fecharModal('modal-detalhes');
                Agenda.abrirFormulario(a);
            });
        }
        App.abrirModal('modal-detalhes');
    },

    abrirDetalhes(id) {
        const a = Calendario._cache[id];
        if (a) Calendario.mostrarDetalhes(a);
    },

    montarDetalhes(a) {
        return `
            <dl class="detalhes-lista">
                ${App.state.isAdm ? `<dt>Usuário</dt><dd>${App.escapeHTML(a.usuarios?.nome || '—')}</dd>` : ''}
                <dt>Local</dt><dd>${App.escapeHTML(a.locais?.nome || '—')}</dd>
                <dt>Cidade</dt><dd>${App.escapeHTML(a.locais?.cidade || '—')}</dd>
                <dt>Data</dt><dd>${App.formatarData(a.data)}</dd>
                <dt>Período</dt><dd>${App.rotuloPeriodos(a.periodo)}</dd>
                <dt>Tarefa</dt><dd>${App.escapeHTML(a.tarefas?.nome || '—')}</dd>
                <dt>Objetivo</dt><dd>${App.escapeHTML(a.objetivo || '—')}</dd>
                <dt>Status</dt><dd>${App.badgeStatus(a.status)}</dd>
                <dt>Resumo</dt><dd>${App.escapeHTML(a.resumo || '—')}</dd>
            </dl>
        `;
    },
};

App.registrarView('calendario', { onEnter: Calendario.render });
