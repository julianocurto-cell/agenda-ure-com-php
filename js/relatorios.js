/* ============================================================
   relatorios.js
   "Relatório" (individual, todo usuário vê os próprios dados)
   e "Relatório Geral" (somente ADM, vê todos com mais filtros).
   ============================================================ */

const Relatorios = {
    // ---------------- Relatório individual ----------------
    async renderIndividual() {
        const container = document.getElementById('view-relatorio');
        container.innerHTML = `
            <div class="view-cabecalho">
                <h1>Relatório</h1>
                <p class="subtitulo">Seus registros de visitas.</p>
            </div>

            <div class="filtros">
                <div class="campo"><label>De</label><input type="date" id="rel-inicio"></div>
                <div class="campo"><label>Até</label><input type="date" id="rel-fim"></div>
                <div class="campo">
                    <label>Local</label>
                    <select id="rel-local"><option value="">Todos</option></select>
                </div>
                <div class="campo">
                    <label>Tarefa</label>
                    <select id="rel-tarefa"><option value="">Todas</option></select>
                </div>
                <div class="campo">
                    <label>Status</label>
                    <select id="rel-status">
                        <option value="">Todos</option>
                        <option value="planejado">Planejado</option>
                        <option value="concluido">Concluído</option>
                    </select>
                </div>
                <button class="btn btn-secundario" id="rel-filtrar">Filtrar</button>
                <button class="btn btn-secundario" id="rel-exportar">⬇ Exportar Excel</button>
            </div>

            <div class="cards-grid" id="rel-totais"></div>
            <div id="rel-tabela"><div class="carregando">Carregando...</div></div>
        `;

        App.preencherSelect(document.getElementById('rel-local'), App.state.locais, 'Todos');
        App.preencherSelect(document.getElementById('rel-tarefa'), App.state.tarefas, 'Todas');
        document.getElementById('rel-filtrar').addEventListener('click', Relatorios.carregarIndividual);
        document.getElementById('rel-exportar').addEventListener('click', () => {
            Relatorios.exportarParaExcel(
                Relatorios._registrosIndividual,
                false,
                `relatorio-visitas_${App.paraISO(new Date())}.xlsx`
            );
        });

        await Relatorios.carregarIndividual();
    },

    async carregarIndividual() {
        let query = HostingerAPI
            .from('agendamentos')
            .select('id, data, periodo, status, objetivo, resumo, locais(nome, cidade), tarefas(nome)')
            .eq('usuario_id', App.state.perfil.id)
            .order('data', { ascending: false });

        const inicio = document.getElementById('rel-inicio').value;
        const fim = document.getElementById('rel-fim').value;
        const local = document.getElementById('rel-local').value;
        const tarefa = document.getElementById('rel-tarefa').value;
        const status = document.getElementById('rel-status').value;

        if (inicio) query = query.gte('data', inicio);
        if (fim) query = query.lte('data', fim);
        if (local) query = query.eq('local_id', local);
        if (tarefa) query = query.eq('tarefa_id', tarefa);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        const registros = data || [];
        Relatorios._registrosIndividual = registros;

        const total = registros.length;
        const planejadas = registros.filter(r => r.status === 'planejado').length;
        const concluidas = registros.filter(r => r.status === 'concluido').length;
        const localidades = new Set(registros.map(r => r.locais?.nome)).size;

        document.getElementById('rel-totais').innerHTML = `
            <div class="card-indicador"><span class="card-valor">${total}</span><span class="card-label">Total de visitas</span></div>
            <div class="card-indicador"><span class="card-valor status-planejado">${planejadas}</span><span class="card-label">Planejadas</span></div>
            <div class="card-indicador"><span class="card-valor status-concluido">${concluidas}</span><span class="card-label">Concluídas</span></div>
            <div class="card-indicador"><span class="card-valor">${localidades}</span><span class="card-label">Localidades visitadas</span></div>
        `;

        const tabelaEl = document.getElementById('rel-tabela');
        if (error || registros.length === 0) {
            tabelaEl.innerHTML = `<p class="vazio">Nenhum registro encontrado para os filtros selecionados.</p>`;
            return;
        }

        tabelaEl.innerHTML = Relatorios.montarTabela(registros, false);
    },

    // ---------------- Relatório geral (ADM) ----------------
    async renderGeral() {
        const container = document.getElementById('view-relatorio-geral');
        const { data: usuarios } = await HostingerAPI.from('usuarios').select('id, nome').order('nome');
        const cidades = [...new Set(App.state.locais.map(l => l.cidade))].sort();

        container.innerHTML = `
            <div class="view-cabecalho">
                <h1>Relatório Geral</h1>
                <p class="subtitulo">Registros de todos os usuários da rede.</p>
            </div>

            <div class="filtros">
                <div class="campo"><label>De</label><input type="date" id="relg-inicio"></div>
                <div class="campo"><label>Até</label><input type="date" id="relg-fim"></div>
                <div class="campo">
                    <label>Usuário</label>
                    <select id="relg-usuario"><option value="">Todos</option></select>
                </div>
                <div class="campo">
                    <label>Função</label>
                    <select id="relg-funcao"><option value="">Todas</option></select>
                </div>
                <div class="campo">
                    <label>Local</label>
                    <select id="relg-local"><option value="">Todos</option></select>
                </div>
                <div class="campo">
                    <label>Cidade</label>
                    <select id="relg-cidade">
                        <option value="">Todas</option>
                        ${cidades.map(c => `<option value="${App.escapeHTML(c)}">${App.escapeHTML(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="campo">
                    <label>Tarefa</label>
                    <select id="relg-tarefa"><option value="">Todas</option></select>
                </div>
                <div class="campo">
                    <label>Status</label>
                    <select id="relg-status">
                        <option value="">Todos</option>
                        <option value="planejado">Planejado</option>
                        <option value="concluido">Concluído</option>
                    </select>
                </div>
                <button class="btn btn-secundario" id="relg-filtrar">Filtrar</button>
                <button class="btn btn-secundario" id="relg-exportar">⬇ Exportar Excel</button>
            </div>

            <div class="cards-grid" id="relg-totais"></div>
            <div id="relg-tabela"><div class="carregando">Carregando...</div></div>
        `;

        App.preencherSelect(document.getElementById('relg-usuario'), usuarios || [], 'Todos');
        App.preencherSelect(document.getElementById('relg-funcao'), App.state.funcoes, 'Todas');
        App.preencherSelect(document.getElementById('relg-local'), App.state.locais, 'Todos');
        App.preencherSelect(document.getElementById('relg-tarefa'), App.state.tarefas, 'Todas');

        document.getElementById('relg-filtrar').addEventListener('click', Relatorios.carregarGeral);
        document.getElementById('relg-exportar').addEventListener('click', () => {
            Relatorios.exportarParaExcel(
                Relatorios._registrosGeral,
                true,
                `relatorio-geral-visitas_${App.paraISO(new Date())}.xlsx`
            );
        });
        Relatorios._ordemGeral = { campo: 'data', asc: false };

        await Relatorios.carregarGeral();
    },

    async carregarGeral() {
        let query = HostingerAPI
            .from('agendamentos')
            .select('id, data, periodo, status, objetivo, resumo, usuario_id, usuarios(nome, funcao_id), locais(nome, cidade), tarefas(nome)')
            .order('data', { ascending: false });

        const inicio = document.getElementById('relg-inicio').value;
        const fim = document.getElementById('relg-fim').value;
        const usuario = document.getElementById('relg-usuario').value;
        const funcao = document.getElementById('relg-funcao').value;
        const local = document.getElementById('relg-local').value;
        const cidade = document.getElementById('relg-cidade').value;
        const tarefa = document.getElementById('relg-tarefa').value;
        const status = document.getElementById('relg-status').value;

        if (inicio) query = query.gte('data', inicio);
        if (fim) query = query.lte('data', fim);
        if (usuario) query = query.eq('usuario_id', usuario);
        if (local) query = query.eq('local_id', local);
        if (tarefa) query = query.eq('tarefa_id', tarefa);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        let registros = data || [];

        if (cidade) registros = registros.filter(r => r.locais?.cidade === cidade);
        if (funcao) registros = registros.filter(r => String(r.usuarios?.funcao_id) === String(funcao));

        const total = registros.length;
        const planejadas = registros.filter(r => r.status === 'planejado').length;
        const concluidas = registros.filter(r => r.status === 'concluido').length;
        const usuariosComVisita = new Set(registros.map(r => r.usuario_id)).size;

        document.getElementById('relg-totais').innerHTML = `
            <div class="card-indicador"><span class="card-valor">${total}</span><span class="card-label">Total de visitas</span></div>
            <div class="card-indicador"><span class="card-valor status-planejado">${planejadas}</span><span class="card-label">Planejadas</span></div>
            <div class="card-indicador"><span class="card-valor status-concluido">${concluidas}</span><span class="card-label">Concluídas</span></div>
            <div class="card-indicador"><span class="card-valor">${usuariosComVisita}</span><span class="card-label">Usuários com visitas</span></div>
        `;

        Relatorios._registrosGeral = registros;
        Relatorios.renderTabelaGeral();
    },

    renderTabelaGeral() {
        const tabelaEl = document.getElementById('relg-tabela');
        const registros = Relatorios._registrosGeral || [];

        if (registros.length === 0) {
            tabelaEl.innerHTML = `<p class="vazio">Nenhum registro encontrado para os filtros selecionados.</p>`;
            return;
        }

        tabelaEl.innerHTML = Relatorios.montarTabela(registros, true);

        tabelaEl.querySelectorAll('[data-ordenar]').forEach(th => {
            th.addEventListener('click', () => {
                const campo = th.dataset.ordenar;
                if (Relatorios._ordemGeral.campo === campo) {
                    Relatorios._ordemGeral.asc = !Relatorios._ordemGeral.asc;
                } else {
                    Relatorios._ordemGeral = { campo, asc: true };
                }
                const { campo: c, asc } = Relatorios._ordemGeral;
                Relatorios._registrosGeral.sort((a, b) => {
                    const va = Relatorios.valorOrdenacao(a, c);
                    const vb = Relatorios.valorOrdenacao(b, c);
                    return (va > vb ? 1 : va < vb ? -1 : 0) * (asc ? 1 : -1);
                });
                Relatorios.renderTabelaGeral();
            });
        });
    },

    valorOrdenacao(r, campo) {
        switch (campo) {
            case 'data': return r.data;
            case 'usuario': return r.usuarios?.nome || '';
            case 'local': return r.locais?.nome || '';
            case 'status': return r.status;
            default: return '';
        }
    },

    // ---------------- Exportação para Excel (SheetJS) ----------------
    exportarParaExcel(registros, comUsuario, nomeArquivo) {
        if (!registros || registros.length === 0) {
            App.toast('Não há dados para exportar.', 'erro');
            return;
        }

        const linhas = registros.map(r => {
            const linha = { Data: App.formatarData(r.data) };

            if (comUsuario) {
                const funcao = App.state.funcoes.find(f => Number(f.id) === Number(r.usuarios?.funcao_id));
                linha['Usuário'] = r.usuarios?.nome || '—';
                linha['Função'] = funcao ? funcao.nome : '—';
            }

            linha['Local'] = r.locais?.nome || '—';
            if (comUsuario) linha['Cidade'] = r.locais?.cidade || '—';

            linha['Período'] = App.rotuloPeriodos(r.periodo);
            linha['Tarefa'] = r.tarefas?.nome || '—';
            linha['Status'] = App.statusLabel[r.status] || r.status;
            linha['Objetivo'] = r.objetivo || '—';
            linha['Resumo'] = r.resumo || '—';

            return linha;
        });

        const planilha = XLSX.utils.json_to_sheet(linhas);

        // Largura aproximada das colunas, para facilitar a leitura.
        planilha['!cols'] = Object.keys(linhas[0]).map(coluna => ({
            wch: coluna === 'Resumo' || coluna === 'Objetivo' ? 40 : Math.max(12, coluna.length + 4),
        }));

        const planilhaDeCalculo = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(planilhaDeCalculo, planilha, 'Relatório');
        XLSX.writeFile(planilhaDeCalculo, nomeArquivo);
    },

    montarTabela(registros, comUsuario) {
        return `
            <div class="tabela-wrap">
                <table class="tabela">
                    <thead>
                        <tr>
                            <th ${comUsuario ? 'class="ordenavel" data-ordenar="data"' : ''}>Data</th>
                            ${comUsuario ? '<th class="ordenavel" data-ordenar="usuario">Usuário</th><th>Função</th>' : ''}
                            <th ${comUsuario ? 'class="ordenavel" data-ordenar="local"' : ''}>Local</th>
                            ${comUsuario ? '<th>Cidade</th>' : ''}
                            <th>Período</th>
                            <th>Tarefa</th>
                            <th ${comUsuario ? 'class="ordenavel" data-ordenar="status"' : ''}>Status</th>
                            <th>Objetivo</th>
                            <th>Resumo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.map(r => `
                            <tr>
                                <td>${App.formatarData(r.data)}</td>
                                ${comUsuario ? `<td>${App.escapeHTML(r.usuarios?.nome || '—')}</td><td>${App.escapeHTML(App.state.funcoes.find(f => Number(f.id) === Number(r.usuarios?.funcao_id))?.nome || '—')}</td>` : ''}
                                <td>${App.escapeHTML(r.locais?.nome || '—')}</td>
                                ${comUsuario ? `<td>${App.escapeHTML(r.locais?.cidade || '—')}</td>` : ''}
                                <td>${App.rotuloPeriodos(r.periodo)}</td>
                                <td>${App.escapeHTML(r.tarefas?.nome || '—')}</td>
                                <td>${App.badgeStatus(r.status)}</td>
                                <td>${App.escapeHTML(r.objetivo || '—')}</td>
                                <td>${App.escapeHTML(r.resumo || '—')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
};

App.registrarView('relatorio', { onEnter: Relatorios.renderIndividual });
App.registrarView('relatorio-geral', { onEnter: Relatorios.renderGeral });
