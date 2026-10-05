/* ============================================================
   agenda.js
   Tela "Agenda": lista de agendamentos + formulário CRUD.
   Período agora é MÚLTIPLO (checkboxes manha/tarde/noite).
   ============================================================ */

const Agenda = {
    editandoId: null,
    _formularioBindado: false,

    async render() {
        const container = document.getElementById('view-agenda');
        const isAdm = App.state.isAdm;

        container.innerHTML = `
            <div class="view-cabecalho view-cabecalho-acao">
                <div>
                    <h1>Agenda</h1>
                    <p class="subtitulo">${isAdm ? 'Todos os agendamentos da rede.' : 'Seus agendamentos de visitas.'}</p>
                </div>
                <button class="btn btn-primario" id="btn-nova-visita">+ Nova visita</button>
            </div>

            <div class="filtros">
                <div class="campo">
                    <label>De</label>
                    <input type="date" id="ag-filtro-inicio">
                </div>
                <div class="campo">
                    <label>Até</label>
                    <input type="date" id="ag-filtro-fim">
                </div>
                <div class="campo">
                    <label>Local</label>
                    <select id="ag-filtro-local"><option value="">Todos</option></select>
                </div>
                <div class="campo">
                    <label>Período</label>
                    <select id="ag-filtro-periodo">
                        <option value="">Todos</option>
                        <option value="manha">Manhã</option>
                        <option value="tarde">Tarde</option>
                        <option value="noite">Noite</option>
                    </select>
                </div>
                <div class="campo">
                    <label>Status</label>
                    <select id="ag-filtro-status">
                        <option value="">Todos</option>
                        <option value="planejado">Planejado</option>
                        <option value="concluido">Concluído</option>
                    </select>
                </div>
                <button class="btn btn-secundario" id="ag-filtrar">Filtrar</button>
            </div>

            <div id="ag-lista"><div class="carregando">Carregando agendamentos...</div></div>
        `;

        App.preencherSelect(document.getElementById('ag-filtro-local'), App.state.locais, 'Todos');

        document.getElementById('btn-nova-visita').addEventListener('click', () => Agenda.abrirFormulario());
        document.getElementById('ag-filtrar').addEventListener('click', Agenda.carregarLista);

        Agenda.bindFormulario();
        await Agenda.carregarLista();
    },

    async carregarLista() {
        const listaEl = document.getElementById('ag-lista');
        listaEl.innerHTML = `<div class="carregando">Carregando agendamentos...</div>`;

        const inicio = document.getElementById('ag-filtro-inicio').value;
        const fim = document.getElementById('ag-filtro-fim').value;
        const local = document.getElementById('ag-filtro-local').value;
        const periodo = document.getElementById('ag-filtro-periodo').value;
        const status = document.getElementById('ag-filtro-status').value;

        let query = HostingerAPI
            .from('agendamentos')
            .select('id, data, periodo, status, objetivo, resumo, local_id, tarefa_id, usuario_id, locais(nome, cidade), tarefas(nome), usuarios(nome)')
            .order('data', { ascending: false })
            .order('periodo', { ascending: true });

        if (!App.state.isAdm) query = query.eq('usuario_id', App.state.perfil.id);
        if (inicio) query = query.gte('data', inicio);
        if (fim) query = query.lte('data', fim);
        if (local) query = query.eq('local_id', local);
        // Para array, usa contains: agendamento.periodo precisa conter o valor
        if (periodo) query = query.contains('periodo', [periodo]);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;

        if (error) {
            listaEl.innerHTML = `<p class="vazio">Erro ao carregar agendamentos.</p>`;
            return;
        }
        if (!data || data.length === 0) {
            listaEl.innerHTML = `<p class="vazio">Nenhum agendamento encontrado.</p>`;
            return;
        }

        listaEl.innerHTML = `
            <div class="tabela-wrap">
                <table class="tabela">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Período</th>
                            <th>Local</th>
                            <th>Tarefa</th>
                            ${App.state.isAdm ? '<th>Usuário</th>' : ''}
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(a => `
                            <tr data-id="${a.id}" class="linha-clicavel">
                                <td>${App.formatarData(a.data)}</td>
                                <td>${App.rotuloPeriodos(a.periodo)}</td>
                                <td>${App.escapeHTML(a.locais?.nome || '—')}</td>
                                <td>${App.escapeHTML(a.tarefas?.nome || '—')}</td>
                                ${App.state.isAdm ? `<td>${App.escapeHTML(a.usuarios?.nome || '—')}</td>` : ''}
                                <td>${App.badgeStatus(a.status)}</td>
                                <td><button class="btn btn-link" data-editar="${a.id}">Editar</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        Agenda._cache = data;
        listaEl.querySelectorAll('[data-editar]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Agenda.abrirFormulario(btn.dataset.editar);
            });
        });
        listaEl.querySelectorAll('.linha-clicavel').forEach(row => {
            row.addEventListener('click', () => Agenda.abrirFormulario(row.dataset.id));
        });
    },

    preencherSelects() {
        App.preencherSelect(document.getElementById('ag-local'), App.state.locais, 'Selecione...');
        App.preencherSelect(document.getElementById('ag-tarefa'), App.state.tarefas, 'Selecione...');
    },

    // Garante que o <select> tenha a opção (ex.: local/tarefa inativos de um registro antigo)
    garantirOpcao(selectId, id, nome) {
        const sel = document.getElementById(selectId);
        if (!sel || !id) return;
        if (!Array.from(sel.options).some(o => String(o.value) === String(id))) {
            const op = document.createElement('option');
            op.value = id;
            op.textContent = (nome || ('#' + id)) + ' (inativo)';
            sel.appendChild(op);
        }
    },

    bindFormulario() {
        Agenda.preencherSelects();

        if (Agenda._formularioBindado) return;
        Agenda._formularioBindado = true;

        const form = document.getElementById('form-agendamento');
        const statusSelect = document.getElementById('ag-status');

        statusSelect.addEventListener('change', Agenda.atualizarObrigatoriedadeResumo);
        form.addEventListener('submit', Agenda.salvar);
        document.getElementById('ag-cancelar').addEventListener('click', () => App.fecharModal('modal-agendamento'));

        const btnExcluir = document.getElementById('ag-excluir');
        if (btnExcluir) btnExcluir.addEventListener('click', Agenda.excluir);

        // Limpa o erro de período assim que o usuário marcar algum
        document.querySelectorAll('input[name="ag-periodo"]').forEach(chk => {
            chk.addEventListener('change', () => {
                const grupo = document.getElementById('ag-periodo-erro');
                if (grupo) grupo.hidden = true;
            });
        });
    },

    atualizarObrigatoriedadeResumo() {
        const status = document.getElementById('ag-status').value;
        const resumoLabel = document.getElementById('ag-resumo-label');
        const resumo = document.getElementById('ag-resumo');
        if (status === 'concluido') {
            resumoLabel.innerHTML = 'Resumo da visita <span class="obrigatorio">*</span>';
            resumo.required = true;
        } else {
            resumoLabel.textContent = 'Resumo da visita (opcional)';
            resumo.required = false;
        }
    },

    // Retorna os períodos marcados (array de strings)
    lerPeriodosSelecionados() {
        return Array.from(document.querySelectorAll('input[name="ag-periodo"]:checked'))
            .map(el => el.value);
    },

    // Marca os checkboxes de acordo com o array/string
    marcarPeriodos(valor) {
        const arr = App.periodosArray(valor);
        document.querySelectorAll('input[name="ag-periodo"]').forEach(chk => {
            chk.checked = arr.includes(chk.value);
        });
    },

    // Aceita tanto um ID (vindo da lista) quanto o objeto completo (vindo do calendário).
    // Versão tolerante a elementos faltantes: em vez de estourar TypeError,
    // apenas ignora o campo ausente (e loga no console).
    abrirFormulario(idOuRegistro) {
        Agenda.bindFormulario();
        const form = document.getElementById('form-agendamento');
        if (!form) {
            console.error('[Agenda] form-agendamento não encontrado no DOM.');
            return;
        }
        form.reset();

        let registro = null;
        let id = null;

        if (idOuRegistro && typeof idOuRegistro === 'object') {
            registro = idOuRegistro;
            id = registro.id;
        } else {
            id = idOuRegistro || null;
            if (id) {
                const cache = Agenda._cache || [];
                registro = cache.find(a => String(a.id) === String(id)) || null;
            }
        }

        Agenda.editandoId = id;

        const podeEditar = !registro || App.podeEditar(registro);

        // Helpers tolerantes a null
        const setTxt    = (elId, txt) => { const el = document.getElementById(elId); if (el) el.textContent = txt; };
        const setVal    = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        const setHidden = (elId, val) => { const el = document.getElementById(elId); if (el) el.hidden = val; };

        setTxt('modal-agendamento-titulo', id ? 'Editar visita' : 'Nova visita');

        if (registro) {
            Agenda.garantirOpcao('ag-local', registro.local_id, registro.locais?.nome);
            Agenda.garantirOpcao('ag-tarefa', registro.tarefa_id, registro.tarefas?.nome);
            setVal('ag-local', registro.local_id);
            setVal('ag-data', String(registro.data).slice(0, 10));
            Agenda.marcarPeriodos(App.periodosArray(registro.periodo));
            setVal('ag-tarefa', registro.tarefa_id);
            setVal('ag-objetivo', registro.objetivo || '');
            setVal('ag-status', registro.status);
            setVal('ag-resumo', registro.resumo || '');
        } else {
            setVal('ag-status', 'planejado');
            Agenda.marcarPeriodos(['manha']);
        }

        Agenda.atualizarObrigatoriedadeResumo();
        setHidden('ag-periodo-erro', true);

        document.querySelectorAll('#form-agendamento [data-somente-leitura]').forEach(el => el.disabled = !podeEditar);
        setHidden('ag-salvar', !podeEditar);
        setHidden('ag-excluir', !id || !podeEditar);

        App.abrirModal('modal-agendamento');
    },

    // Atalho para o calendário: abre o formulário em modo "Nova visita"
    // com a data já preenchida. Chamado por Calendario.aoClicarDia().
    novaVisitaComData(dataISO) {
        Agenda.abrirFormulario();
        const el = document.getElementById('ag-data');
        if (el) el.value = dataISO;
    },

    async salvar(e) {
        e.preventDefault();

        const periodos = Agenda.lerPeriodosSelecionados();
        if (periodos.length === 0) {
            const erroEl = document.getElementById('ag-periodo-erro');
            if (erroEl) erroEl.hidden = false;
            return;
        }

        const btn = document.getElementById('ag-salvar');
        if (btn.disabled) return; // evita duplo clique
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const payload = {
            local_id: Number(document.getElementById('ag-local').value),
            data: document.getElementById('ag-data').value,
            periodo: periodos,
            tarefa_id: Number(document.getElementById('ag-tarefa').value),
            objetivo: document.getElementById('ag-objetivo').value.trim() || null,
            status: document.getElementById('ag-status').value,
            resumo: document.getElementById('ag-resumo').value.trim() || null,
        };

        let error;
        if (Agenda.editandoId) {
            ({ error } = await HostingerAPI.from('agendamentos').update(payload).eq('id', Agenda.editandoId));
        } else {
            payload.usuario_id = App.state.perfil.id;
            ({ error } = await HostingerAPI.from('agendamentos').insert(payload));
        }

        btn.disabled = false;
        btn.textContent = 'Salvar';

        if (error) {
            App.toast('Erro ao salvar: ' + error.message, 'erro');
            return;
        }

        App.toast('Agendamento salvo com sucesso.');
        App.fecharModal('modal-agendamento');

        await Agenda.atualizarTelasAbertas();
    },

    async excluir() {
        const id = Agenda.editandoId;
        if (!id) return;

        if (!confirm('Tem certeza que deseja excluir esta visita? Esta ação não pode ser desfeita.')) {
            return;
        }

        const btn = document.getElementById('ag-excluir');
        if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }

        const { error } = await HostingerAPI
            .from('agendamentos')
            .delete()
            .eq('id', id);

        if (btn) { btn.disabled = false; btn.textContent = 'Excluir'; }

        if (error) {
            App.toast('Erro ao excluir: ' + error.message, 'erro');
            return;
        }

        App.toast('Visita excluída.');
        App.fecharModal('modal-agendamento');

        await Agenda.atualizarTelasAbertas();
    },

    // Recarrega as telas que estiverem montadas/visíveis após salvar ou excluir
    async atualizarTelasAbertas() {
        const visivel = (id) => { const el = document.getElementById(id); return el && !el.hidden; };

        if (visivel('view-agenda') && document.getElementById('ag-lista')) {
            await Agenda.carregarLista();
        }
        if (visivel('view-calendario') && typeof Calendario !== 'undefined') {
            await Calendario.recarregar();
        }
        if (visivel('view-consolidado') && document.getElementById('cons-matriz')) {
            await Consolidado.carregarMatriz();
        }
        if (visivel('view-inicio') && typeof Dashboard !== 'undefined') {
            await Dashboard.render();
        }
    },
};

App.registrarView('agenda', { onEnter: Agenda.render });