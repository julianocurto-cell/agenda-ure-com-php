/* ============================================================
   indicadores.js
   Tela "Indicadores": cards + barras simples (CSS) mostrando
   a distribuição das visitas. USER vê somente os próprios
   dados; ADM vê os indicadores gerais da rede.
   ============================================================ */

const Indicadores = {
    async render() {
        const container = document.getElementById('view-indicadores');
        const isAdm = App.state.isAdm;

        container.innerHTML = `
            <div class="view-cabecalho">
                <h1>Indicadores</h1>
                <p class="subtitulo">${isAdm ? 'Indicadores gerais da rede.' : 'Indicadores das suas visitas.'}</p>
            </div>
            <div class="filtros">
                <div class="campo"><label>De</label><input type="date" id="ind-inicio"></div>
                <div class="campo"><label>Até</label><input type="date" id="ind-fim"></div>
                <button class="btn btn-secundario" id="ind-filtrar">Filtrar</button>
            </div>
            <div class="cards-grid" id="ind-cards"></div>
            <div class="painel-grid" id="ind-graficos"></div>
        `;

        document.getElementById('ind-filtrar').addEventListener('click', Indicadores.carregar);
        await Indicadores.carregar();
    },

    async carregar() {
        const isAdm = App.state.isAdm;
        let query = HostingerAPI
            .from('agendamentos')
            .select('data, status, usuario_id, local_id, tarefa_id, locais(nome), tarefas(nome), usuarios(nome, funcao_id)');
        if (!isAdm) query = query.eq('usuario_id', App.state.perfil.id);

        const inicio = document.getElementById('ind-inicio').value;
        const fim = document.getElementById('ind-fim').value;
        if (inicio) query = query.gte('data', inicio);
        if (fim) query = query.lte('data', fim);

        const { data } = await query;
        const registros = data || [];

        Indicadores.renderCards(registros);
        Indicadores.renderGraficos(registros);
    },

    renderCards(registros) {
        const total = registros.length;
        const concluidas = registros.filter(r => r.status === 'concluido').length;
        const planejadas = registros.filter(r => r.status === 'planejado').length;
        const localidades = new Set(registros.map(r => r.local_id)).size;
        const usuariosComVisita = new Set(registros.map(r => r.usuario_id)).size;

        document.getElementById('ind-cards').innerHTML = `
            <div class="card-indicador"><span class="card-valor">${total}</span><span class="card-label">Total de visitas</span></div>
            <div class="card-indicador"><span class="card-valor status-concluido">${concluidas}</span><span class="card-label">Concluídas</span></div>
            <div class="card-indicador"><span class="card-valor status-planejado">${planejadas}</span><span class="card-label">Planejadas</span></div>
            <div class="card-indicador"><span class="card-valor">${localidades}</span><span class="card-label">Localidades visitadas</span></div>
            ${App.state.isAdm ? `<div class="card-indicador"><span class="card-valor">${usuariosComVisita}</span><span class="card-label">Usuários com visitas</span></div>` : ''}
        `;
    },

    renderGraficos(registros) {
        const graficosEl = document.getElementById('ind-graficos');
        const paineis = [];

        // Planejadas x concluídas
        const concluidas = registros.filter(r => r.status === 'concluido').length;
        const planejadas = registros.filter(r => r.status === 'planejado').length;
        paineis.push(Indicadores.painelBarras('Planejadas × Concluídas', [
            { label: 'Planejadas', valor: planejadas, classe: 'barra-planejado' },
            { label: 'Concluídas', valor: concluidas, classe: 'barra-concluido' },
        ]));

        // Por mês
        const porMes = {};
        registros.forEach(r => {
            const chave = r.data.slice(0, 7); // yyyy-mm
            porMes[chave] = (porMes[chave] || 0) + 1;
        });
        const mesesOrdenados = Object.keys(porMes).sort();
        paineis.push(Indicadores.painelBarras('Visitas por mês', mesesOrdenados.map(m => ({
            label: Indicadores.formatarMes(m), valor: porMes[m], classe: 'barra-neutra',
        }))));

        // Por localidade
        paineis.push(Indicadores.painelAgrupado('Visitas por localidade', registros, r => r.locais?.nome || '—'));

        // Por tarefa
        paineis.push(Indicadores.painelAgrupado('Visitas por tarefa', registros, r => r.tarefas?.nome || '—'));

        if (App.state.isAdm) {
            // Por usuário
            paineis.push(Indicadores.painelAgrupado('Visitas por usuário', registros, r => r.usuarios?.nome || '—'));

            // Por função
            paineis.push(Indicadores.painelAgrupado('Visitas por função', registros, r => {
                const f = App.state.funcoes.find(f => f.id === r.usuarios?.funcao_id);
                return f ? f.nome : 'Sem função';
            }));
        }

        graficosEl.innerHTML = paineis.join('');
    },

    painelAgrupado(titulo, registros, fnRotulo) {
        const contagem = {};
        registros.forEach(r => {
            const rotulo = fnRotulo(r);
            contagem[rotulo] = (contagem[rotulo] || 0) + 1;
        });
        const itens = Object.entries(contagem)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label, valor]) => ({ label, valor, classe: 'barra-neutra' }));
        return Indicadores.painelBarras(titulo, itens);
    },

    painelBarras(titulo, itens) {
        if (itens.length === 0) {
            return `<div class="painel"><h2>${titulo}</h2><p class="vazio">Sem dados no período.</p></div>`;
        }
        const max = Math.max(...itens.map(i => i.valor), 1);
        return `
            <div class="painel">
                <h2>${titulo}</h2>
                <div class="barras">
                    ${itens.map(i => `
                        <div class="barra-linha">
                            <span class="barra-rotulo">${App.escapeHTML(i.label)}</span>
                            <div class="barra-trilho">
                                <div class="barra-preenchida ${i.classe}" style="width:${(i.valor / max) * 100}%"></div>
                            </div>
                            <span class="barra-valor">${i.valor}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    formatarMes(chave) {
        const [ano, mes] = chave.split('-');
        const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return `${nomes[Number(mes) - 1]}/${ano}`;
    },
};

App.registrarView('indicadores', { onEnter: Indicadores.render });
