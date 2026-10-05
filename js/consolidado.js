/* ============================================================
   consolidado.js
   Tela "Consolidado Semanal" (ADM e USER).
   Clique numa célula vazia → abre modal de Nova visita com
   data e local já preenchidos.
   Clique num compromisso → abre modal de Detalhes.
   ============================================================ */

const Consolidado = {
    semanaAtual: null,
    cache: {},
    usuariosMap: {},

    async render() {
        const container = document.getElementById('view-consolidado');
        Consolidado.semanaAtual = App.inicioDaSemana(new Date());

        const cidades = [...new Set(App.state.locais.map(l => l.cidade))].sort();

        container.innerHTML = `
            <div class="view-cabecalho">
                <h1>Consolidado Semanal</h1>
                <p class="subtitulo">Clique numa célula para agendar uma visita naquele dia e local.</p>
            </div>

            <div class="semana-seletor">
                <button class="btn btn-secundario" id="cons-semana-anterior">‹ Semana anterior</button>
                <div class="semana-atual">
                    <input type="date" id="cons-data-ref">
                    <strong id="cons-label-semana"></strong>
                </div>
                <button class="btn btn-secundario" id="cons-semana-proxima">Próxima semana ›</button>
                <button class="btn btn-link" id="cons-semana-hoje">Semana atual</button>
            </div>

            <div class="filtros">
                <div class="campo">
                    <label>Localidade</label>
                    <select id="cons-filtro-local"><option value="">Todas</option></select>
                </div>
                <div class="campo">
                    <label>Cidade</label>
                    <select id="cons-filtro-cidade">
                        <option value="">Todas</option>
                        ${cidades.map(c => `<option value="${App.escapeHTML(c)}">${App.escapeHTML(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="campo">
                    <label>Usuário</label>
                    <select id="cons-filtro-usuario"><option value="">Todos</option></select>
                </div>
                <div class="campo">
                    <label>Período</label>
                    <select id="cons-filtro-periodo">
                        <option value="">Todos</option>
                        <option value="manha">Manhã</option>
                        <option value="tarde">Tarde</option>
                        <option value="noite">Noite</option>
                    </select>
                </div>
                <div class="campo">
                    <label>Tarefa</label>
                    <select id="cons-filtro-tarefa"><option value="">Todas</option></select>
                </div>
                <div class="campo">
                    <label>Status</label>
                    <select id="cons-filtro-status">
                        <option value="">Todos</option>
                        <option value="planejado">Planejado</option>
                        <option value="concluido">Concluído</option>
                    </select>
                </div>
                <button class="btn btn-secundario" id="cons-filtrar">Filtrar</button>
            </div>

            <div class="legenda">
                <span class="legenda-item"><span class="ponto ponto-planejado"></span> Planejado</span>
                <span class="legenda-item"><span class="ponto ponto-concluido"></span> Concluído</span>
            </div>

            <div id="cons-matriz"><div class="carregando">Carregando consolidado...</div></div>
        `;

        App.preencherSelect(document.getElementById('cons-filtro-local'), App.state.locais, 'Todas');
        App.preencherSelect(document.getElementById('cons-filtro-tarefa'), App.state.tarefas, 'Todas');

        await Consolidado.carregarUsuarios();
        App.preencherSelect(
            document.getElementById('cons-filtro-usuario'),
            Object.entries(Consolidado.usuariosMap).map(([id, nome]) => ({ id, nome })),
            'Todos'
        );

        document.getElementById('cons-semana-anterior').addEventListener('click', () => Consolidado.mudarSemana(-7));
        document.getElementById('cons-semana-proxima').addEventListener('click', () => Consolidado.mudarSemana(7));
        document.getElementById('cons-semana-hoje').addEventListener('click', () => Consolidado.irParaHoje());
        document.getElementById('cons-data-ref').addEventListener('change', (e) => {
            if (!e.target.value) return;
            Consolidado.semanaAtual = App.inicioDaSemana(new Date(e.target.value + 'T00:00:00'));
            Consolidado.atualizarSeletorSemana();
            Consolidado.carregarMatriz();
        });
        document.getElementById('cons-filtrar').addEventListener('click', Consolidado.carregarMatriz);

        Consolidado.atualizarSeletorSemana();
        await Consolidado.carregarMatriz();
    },

    async carregarUsuarios() {
        const { data, error } = await HostingerAPI.rpc('listar_usuarios_ativos');
        Consolidado.usuariosMap = {};
        if (error || !data) return;
        data.forEach(u => { Consolidado.usuariosMap[u.id] = u.nome; });
    },

    mudarSemana(dias) {
        const nova = new Date(Consolidado.semanaAtual);
        nova.setDate(nova.getDate() + dias);
        Consolidado.semanaAtual = nova;
        Consolidado.atualizarSeletorSemana();
        Consolidado.carregarMatriz();
    },

    irParaHoje() {
        Consolidado.semanaAtual = App.inicioDaSemana(new Date());
        Consolidado.atualizarSeletorSemana();
        Consolidado.carregarMatriz();
    },

    atualizarSeletorSemana() {
        const inicio = Consolidado.semanaAtual;
        const fim = new Date(inicio);
        fim.setDate(fim.getDate() + 6);
        document.getElementById('cons-data-ref').value = App.paraISO(inicio);
        document.getElementById('cons-label-semana').textContent =
            `Semana de ${App.formatarData(App.paraISO(inicio))} a ${App.formatarData(App.paraISO(fim))}`;
    },

    diasDaSemanaAtual() {
        const dias = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(Consolidado.semanaAtual);
            d.setDate(d.getDate() + i);
            dias.push(d);
        }
        return dias;
    },

    async carregarMatriz() {
        const matrizEl = document.getElementById('cons-matriz');
        if (!matrizEl) return;
        matrizEl.innerHTML = `<div class="carregando">Carregando consolidado...</div>`;

        // Se o usuário trocar de semana rápido, só a última resposta vale
        const reqId = (Consolidado._req = (Consolidado._req || 0) + 1);

        const dias = Consolidado.diasDaSemanaAtual();
        const inicioISO = App.paraISO(dias[0]);
        const fimISO = App.paraISO(dias[6]);

        const filtroLocal = document.getElementById('cons-filtro-local').value;
        const filtroCidade = document.getElementById('cons-filtro-cidade').value;
        const filtroUsuario = document.getElementById('cons-filtro-usuario').value;
        const filtroPeriodo = document.getElementById('cons-filtro-periodo').value;
        const filtroTarefa = document.getElementById('cons-filtro-tarefa').value;
        const filtroStatus = document.getElementById('cons-filtro-status').value;

        let query = HostingerAPI
            .from('agendamentos')
            .select('*')
            .gte('data', inicioISO)
            .lte('data', fimISO)
            .order('data', { ascending: true })
            .order('periodo', { ascending: true });

        if (filtroLocal) query = query.eq('local_id', filtroLocal);
        if (filtroUsuario) query = query.eq('usuario_id', filtroUsuario);
        if (filtroPeriodo) query = query.contains('periodo', [filtroPeriodo]);
        if (filtroTarefa) query = query.eq('tarefa_id', filtroTarefa);
        if (filtroStatus) query = query.eq('status', filtroStatus);

        const { data, error } = await query;
        if (reqId !== Consolidado._req) return;

        if (error) {
            matrizEl.innerHTML = `<p class="vazio">Erro ao carregar o consolidado: ${App.escapeHTML(error.message)}</p>`;
            return;
        }

        let agendamentos = data || [];
        if (filtroCidade) agendamentos = agendamentos.filter(a => a.locais?.cidade === filtroCidade);

        agendamentos.forEach(a => {
            // nome vem do registro (funciona também para usuários inativos)
            a.usuarios = { ...(a.usuarios || {}), nome: a.usuarios?.nome || Consolidado.usuariosMap[a.usuario_id] || '—' };
        });

        Consolidado.cache = {};
        agendamentos.forEach(a => { Consolidado.cache[a.id] = a; });

        let localidades = [...App.state.locais];
        if (filtroLocal) localidades = localidades.filter(l => String(l.id) === String(filtroLocal));
        if (filtroCidade) localidades = localidades.filter(l => l.cidade === filtroCidade);

        // Locais inativos que ainda têm visitas na semana também precisam de linha,
        // senão a visita "some" do consolidado.
        const ids = new Set(localidades.map(l => String(l.id)));
        agendamentos.forEach(a => {
            if (!ids.has(String(a.local_id))) {
                ids.add(String(a.local_id));
                localidades.push({ id: a.local_id, nome: (a.locais?.nome || '—') + ' (inativo)', cidade: a.locais?.cidade || '—' });
            }
        });

        matrizEl.innerHTML = Consolidado.montarTabela(localidades, dias, agendamentos);

        // Clique em compromisso: abre detalhes (não propaga para a célula)
        matrizEl.querySelectorAll('[data-agendamento]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                Consolidado.abrirDetalhes(el.dataset.agendamento);
            });
        });

        // Clique em célula: abre Nova visita com data + local
        matrizEl.querySelectorAll('td[data-local-id]').forEach(td => {
            td.addEventListener('click', () => {
                Consolidado.novaVisitaNaCelula(td.dataset.localId, td.dataset.data);
            });
        });
    },

    montarTabela(localidades, dias, agendamentos) {
        if (localidades.length === 0) {
            return `<p class="vazio">Nenhuma localidade encontrada para os filtros selecionados.</p>`;
        }

        const porLocalDia = {};
        agendamentos.forEach(a => {
            const periodos = App.periodosArray(a.periodo);
            porLocalDia[a.local_id] = porLocalDia[a.local_id] || {};
            porLocalDia[a.local_id][a.data] = porLocalDia[a.local_id][a.data] || { manha: [], tarde: [], noite: [] };
            periodos.forEach(p => {
                if (porLocalDia[a.local_id][a.data][p]) {
                    porLocalDia[a.local_id][a.data][p].push(a);
                }
            });
        });

        const cabecalho = dias.map(d => `<th>${App.diasSemanaAbrev[d.getDay()]}.<br>${App.formatarDataCurta(App.paraISO(d))}</th>`).join('');

        const linhas = localidades.map(local => {
            const celulas = dias.map(d => {
                const iso = App.paraISO(d);
                const doDia = (porLocalDia[local.id] || {})[iso];
                return `<td class="celula-dia" data-local-id="${local.id}" data-data="${iso}">${Consolidado.montarCelula(doDia)}</td>`;
            }).join('');
            return `<tr><th class="col-localidade">${App.escapeHTML(local.nome)}<span class="col-localidade-cidade">${App.escapeHTML(local.cidade)}</span></th>${celulas}</tr>`;
        }).join('');

        return `
            <div class="tabela-wrap">
                <table class="tabela tabela-matriz">
                    <thead><tr><th class="col-localidade">Localidade</th>${cabecalho}</tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    },

    montarCelula(doDia) {
        // Mesmo vazia, a célula é clicável (o <td> tem o listener).
        // O "—" só indica visualmente que não há compromisso ali.
        if (!doDia) return '<span class="celula-vazia">—</span>';

        const blocos = ['manha', 'tarde', 'noite']
            .filter(p => doDia[p] && doDia[p].length > 0)
            .map(p => `
                <div class="celula-periodo">
                    <span class="celula-periodo-label">${App.periodoLabel[p]}</span>
                    ${doDia[p].map(a => `
                        <button type="button" class="compromisso compromisso-${a.status}" data-agendamento="${a.id}">
                            ${App.escapeHTML(a.usuarios?.nome || '—')} — ${App.escapeHTML(a.tarefas?.nome || '—')}
                        </button>
                    `).join('')}
                </div>
            `);

        return blocos.length ? blocos.join('') : '<span class="celula-vazia">—</span>';
    },

    // Abre o modal de Nova visita preenchendo data e local da célula clicada.
    novaVisitaNaCelula(localId, dataISO) {
        // Garante que o modal-agendamento tem listeners e selects populados
        Agenda.abrirFormulario(); // form.reset(), editandoId = null, título "Nova visita"

        // Preenche data e local
        const elData = document.getElementById('ag-data');
        const elLocal = document.getElementById('ag-local');
        if (elData) elData.value = dataISO;
        if (elLocal) elLocal.value = localId;
    },

    abrirDetalhes(id) {
        const a = Consolidado.cache[id];
        if (!a) return;
        Calendario.mostrarDetalhes(a);
    },
};

App.registrarView('consolidado', { onEnter: Consolidado.render });