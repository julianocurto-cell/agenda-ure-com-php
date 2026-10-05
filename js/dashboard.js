/* ============================================================
   dashboard.js
   Tela "Início": cards de resumo + próximas visitas.
   USER vê só os próprios agendamentos; ADM vê todos.
   ============================================================ */

const Dashboard = {
    async render() {
        const container = document.getElementById('view-inicio');
        const isAdm = App.state.isAdm;

        container.innerHTML = `
            <div class="view-cabecalho">
                <h1>Olá, ${App.escapeHTML(App.state.perfil.nome.split(' ')[0])}</h1>
                <p class="subtitulo">${isAdm
                    ? 'Visão geral de todas as visitas da rede.'
                    : 'Aqui está o resumo das suas visitas.'}</p>
            </div>
            <div class="cards-grid" id="dash-cards"><div class="carregando">Carregando indicadores...</div></div>
            <div class="painel">
                <h2>Próximas visitas</h2>
                <div id="dash-proximas"><div class="carregando">Carregando...</div></div>
            </div>
        `;

        // USER vê só os próprios; ADM vê todos
        let queryCards = HostingerAPI.from('agendamentos').select('status');
        if (!isAdm) queryCards = queryCards.eq('usuario_id', App.state.perfil.id);

        const { data: todos } = await queryCards;

        const total = todos?.length || 0;
        const planejadas = (todos || []).filter(a => a.status === 'planejado').length;
        const concluidas = (todos || []).filter(a => a.status === 'concluido').length;

        let cardsHTML = `
            <div class="card-indicador">
                <span class="card-valor">${total}</span>
                <span class="card-label">Total de visitas</span>
            </div>
            <div class="card-indicador">
                <span class="card-valor status-planejado">${planejadas}</span>
                <span class="card-label">Planejadas</span>
            </div>
            <div class="card-indicador">
                <span class="card-valor status-concluido">${concluidas}</span>
                <span class="card-label">Concluídas</span>
            </div>
        `;

        if (isAdm) {
            const [{ count: usuariosAtivos }, { count: localidades }] = await Promise.all([
                HostingerAPI.from('usuarios').select('*', { count: 'exact', head: true }).eq('ativo', true),
                HostingerAPI.from('locais').select('*', { count: 'exact', head: true }).eq('ativo', true),
            ]);
            cardsHTML += `
                <div class="card-indicador">
                    <span class="card-valor">${usuariosAtivos ?? 0}</span>
                    <span class="card-label">Usuários ativos</span>
                </div>
                <div class="card-indicador">
                    <span class="card-valor">${localidades ?? 0}</span>
                    <span class="card-label">Localidades</span>
                </div>
            `;
        }

        document.getElementById('dash-cards').innerHTML = cardsHTML;

        // Próximas visitas (a partir de hoje, ordenadas)
        const hoje = App.paraISO(new Date());
        let proxQuery = HostingerAPI
            .from('agendamentos')
            .select('id, data, periodo, status, objetivo, locais(nome, cidade), tarefas(nome), usuarios(nome)')
            .gte('data', hoje)
            .order('data', { ascending: true })
            .order('periodo', { ascending: true })
            .limit(8);

        // USER vê só as próprias; ADM vê todas
        if (!isAdm) proxQuery = proxQuery.eq('usuario_id', App.state.perfil.id);

        const { data: proximas, error } = await proxQuery;
        const proxEl = document.getElementById('dash-proximas');

        if (error || !proximas || proximas.length === 0) {
            proxEl.innerHTML = `<p class="vazio">Nenhuma visita agendada para os próximos dias.</p>`;
            return;
        }

        proxEl.innerHTML = `
            <ul class="lista-proximas">
                ${proximas.map(a => `
                    <li>
                        <div class="lista-proximas-data">
                            <strong>${App.formatarData(a.data)}</strong>
                            <span>${App.rotuloPeriodos(a.periodo)}</span>
                        </div>
                        <div class="lista-proximas-info">
                            <strong>${App.escapeHTML(a.locais?.nome || '—')}</strong>
                            <span>${App.escapeHTML(a.tarefas?.nome || '—')}${isAdm ? ' · ' + App.escapeHTML(a.usuarios?.nome || '—') : ''}</span>
                        </div>
                        ${App.badgeStatus(a.status)}
                    </li>
                `).join('')}
            </ul>
        `;
    },
};

App.registrarView('inicio', { onEnter: Dashboard.render });