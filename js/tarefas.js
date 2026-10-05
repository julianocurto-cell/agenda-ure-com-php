/* ============================================================
   tarefas.js
   Tela "Tarefas" (somente ADM): cadastra e edita os tipos de
   tarefa usados nos agendamentos (public.tarefas).
   ============================================================ */

const Tarefas = {
    async render() {
        const container = document.getElementById('view-tarefas');
        container.innerHTML = `
            <div class="view-cabecalho view-cabecalho-acao">
                <div>
                    <h1>Tarefas</h1>
                    <p class="subtitulo">Tipos de tarefa disponíveis para os agendamentos.</p>
                </div>
                <button class="btn btn-primario" id="btn-nova-tarefa">+ Nova tarefa</button>
            </div>
            <div id="tar-lista"><div class="carregando">Carregando tarefas...</div></div>
        `;

        document.getElementById('btn-nova-tarefa').addEventListener('click', () => Tarefas.abrirFormulario());
        await Tarefas.carregarLista();
    },

    async carregarLista() {
        const { data, error } = await HostingerAPI
            .from('tarefas')
            .select('*')
            .order('nome');

        const listaEl = document.getElementById('tar-lista');

        if (error) {
            listaEl.innerHTML = `<p class="vazio">Erro ao carregar tarefas.</p>`;
            return;
        }
        if (!data || data.length === 0) {
            listaEl.innerHTML = `<p class="vazio">Nenhuma tarefa cadastrada ainda.</p>`;
            return;
        }

        Tarefas._cache = data;

        listaEl.innerHTML = `
            <div class="tabela-wrap">
                <table class="tabela">
                    <thead>
                        <tr><th>Nome</th><th>Descrição</th><th>Ativo</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${data.map(t => `
                            <tr>
                                <td>${App.escapeHTML(t.nome)}</td>
                                <td>${App.escapeHTML(t.descricao || '—')}</td>
                                <td>${t.ativo ? '<span class="badge badge-concluido">Ativo</span>' : '<span class="badge badge-inativo">Inativo</span>'}</td>
                                <td><button class="btn btn-link" data-editar="${t.id}">Editar</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        listaEl.querySelectorAll('[data-editar]').forEach(btn => {
            btn.addEventListener('click', () => Tarefas.abrirFormulario(btn.dataset.editar));
        });
    },

    // Tolerante a elementos ausentes: em vez de estourar TypeError,
    // ignora o campo faltante e loga no console.
    abrirFormulario(id) {
        const form = document.getElementById('form-tarefa');
        if (!form) {
            console.error('[Tarefas] form-tarefa não encontrado no DOM.');
            return;
        }
        form.reset();

        const cache = Tarefas._cache || [];
        const registro = id ? cache.find(t => String(t.id) === String(id)) : null;

        const setTxt = (elId, txt) => { const el = document.getElementById(elId); if (el) el.textContent = txt; };
        const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };

        setTxt('modal-tarefa-titulo', id ? 'Editar tarefa' : 'Nova tarefa');
        setVal('tar-id', id || '');

        if (registro) {
            setVal('tar-nome', registro.nome);
            setVal('tar-descricao', registro.descricao || '');
            const chk = document.getElementById('tar-ativo');
            if (chk) chk.checked = registro.ativo;
        } else {
            const chk = document.getElementById('tar-ativo');
            if (chk) chk.checked = true;
        }

        const modal = document.getElementById('modal-tarefa');
        if (!modal) {
            console.error('[Tarefas] modal-tarefa não encontrado no DOM.');
            return;
        }
        App.abrirModal('modal-tarefa');
    },

    async salvar(e) {
        e.preventDefault();
        const id = document.getElementById('tar-id').value;
        const btn = document.getElementById('tar-salvar');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const payload = {
            nome: document.getElementById('tar-nome').value.trim(),
            descricao: document.getElementById('tar-descricao').value.trim() || null,
            ativo: document.getElementById('tar-ativo').checked,
        };

        let error;
        if (id) {
            ({ error } = await HostingerAPI.from('tarefas').update(payload).eq('id', id));
        } else {
            ({ error } = await HostingerAPI.from('tarefas').insert(payload));
        }

        btn.disabled = false;
        btn.textContent = 'Salvar';

        if (error) {
            const msg = error.code === '23505'
                ? 'Já existe uma tarefa com esse nome.'
                : 'Erro ao salvar: ' + error.message;
            App.toast(msg, 'erro');
            return;
        }

        App.toast('Tarefa salva com sucesso.');
        App.fecharModal('modal-tarefa');
        await Tarefas.carregarLista();
        await App.carregarListasBase(); // atualiza os selects de Tarefa em Agenda e Consolidado
    },
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-tarefa');
    const btnCancelar = document.getElementById('tar-cancelar');
    if (form) form.addEventListener('submit', Tarefas.salvar);
    if (btnCancelar) btnCancelar.addEventListener('click', () => App.fecharModal('modal-tarefa'));
});

App.registrarView('tarefas', { onEnter: Tarefas.render });