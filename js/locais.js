/* ============================================================
   locais.js
   Tela "Locais" (somente ADM): cadastra e edita as localidades
   usadas nos agendamentos (public.locais).

   Blindado: se o modal não existir no DOM (cache antigo do HTML),
   ele é criado dinamicamente antes de ser aberto.
   ============================================================ */

const Locais = {
    async render() {
        Locais.garantirModal();

        const container = document.getElementById('view-locais');
        container.innerHTML = `
            <div class="view-cabecalho view-cabecalho-acao">
                <div>
                    <h1>Locais</h1>
                    <p class="subtitulo">Localidades disponíveis para os agendamentos.</p>
                </div>
                <button class="btn btn-primario" id="btn-novo-local">+ Novo local</button>
            </div>
            <div id="loc-lista"><div class="carregando">Carregando locais...</div></div>
        `;

        document.getElementById('btn-novo-local').addEventListener('click', () => Locais.abrirFormulario());
        await Locais.carregarLista();
    },

    async carregarLista() {
        const { data, error } = await HostingerAPI
            .from('locais')
            .select('*')
            .order('nome');

        const listaEl = document.getElementById('loc-lista');

        if (error) {
            listaEl.innerHTML = `<p class="vazio">Erro ao carregar locais.</p>`;
            return;
        }
        if (!data || data.length === 0) {
            listaEl.innerHTML = `<p class="vazio">Nenhum local cadastrado ainda.</p>`;
            return;
        }

        Locais._cache = data;

        listaEl.innerHTML = `
            <div class="tabela-wrap">
                <table class="tabela">
                    <thead>
                        <tr><th>Nome</th><th>Cidade</th><th>Ativo</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${data.map(l => `
                            <tr>
                                <td>${App.escapeHTML(l.nome)}</td>
                                <td>${App.escapeHTML(l.cidade)}</td>
                                <td>${l.ativo ? '<span class="badge badge-concluido">Ativo</span>' : '<span class="badge badge-inativo">Inativo</span>'}</td>
                                <td><button class="btn btn-link" data-editar="${l.id}">Editar</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        listaEl.querySelectorAll('[data-editar]').forEach(btn => {
            btn.addEventListener('click', () => Locais.abrirFormulario(btn.dataset.editar));
        });
    },

    // Cria o modal dinamicamente se não existir no DOM (cache do HTML).
    // Também anexa os listeners uma única vez.
    garantirModal() {
        if (Locais._modalGarantido) return;
        Locais._modalGarantido = true;

        let modal = document.getElementById('modal-local');
        if (!modal) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <div class="modal-fundo" id="modal-local" hidden>
                    <div class="modal-caixa">
                        <div class="modal-cabecalho">
                            <h2 id="modal-local-titulo">Novo local</h2>
                            <button class="modal-fechar" data-fechar-modal aria-label="Fechar">×</button>
                        </div>
                        <form id="form-local">
                            <div class="modal-corpo">
                                <input type="hidden" id="loc-id">
                                <div class="campo">
                                    <label for="loc-nome">Nome</label>
                                    <input type="text" id="loc-nome" required>
                                </div>
                                <div class="campo">
                                    <label for="loc-cidade">Cidade</label>
                                    <input type="text" id="loc-cidade" required>
                                </div>
                                <label class="chk-linha">
                                    <input type="checkbox" id="loc-ativo">
                                    Local ativo
                                </label>
                            </div>
                            <div class="modal-corpo" style="padding-top:0;">
                                <div class="modal-rodape">
                                    <button type="button" class="btn btn-secundario" id="loc-cancelar">Cancelar</button>
                                    <button type="submit" class="btn btn-primario" id="loc-salvar">Salvar</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            modal = wrapper.firstElementChild;

            const toast = document.getElementById('toast');
            if (toast) {
                toast.parentNode.insertBefore(modal, toast);
            } else {
                document.body.appendChild(modal);
            }
            console.log('[Locais] modal-local criado dinamicamente.');
        }

        // Anexa listeners (o DOMContentLoaded original não terá rodado se o modal foi criado agora)
        const form = document.getElementById('form-local');
        const btnCancelar = document.getElementById('loc-cancelar');
        const btnFechar = modal.querySelector('[data-fechar-modal]');

        if (form && !form._bind) {
            form._bind = true;
            form.addEventListener('submit', Locais.salvar);
        }
        if (btnCancelar && !btnCancelar._bind) {
            btnCancelar._bind = true;
            btnCancelar.addEventListener('click', () => App.fecharModal('modal-local'));
        }
        if (btnFechar && !btnFechar._bind) {
            btnFechar._bind = true;
            btnFechar.addEventListener('click', () => App.fecharModal('modal-local'));
        }
    },

    abrirFormulario(id) {
        Locais.garantirModal();

        const form = document.getElementById('form-local');
        form.reset();

        const cache = Locais._cache || [];
        const registro = id ? cache.find(l => String(l.id) === String(id)) : null;

        document.getElementById('modal-local-titulo').textContent = id ? 'Editar local' : 'Novo local';
        document.getElementById('loc-id').value = id || '';

        if (registro) {
            document.getElementById('loc-nome').value = registro.nome;
            document.getElementById('loc-cidade').value = registro.cidade;
            document.getElementById('loc-ativo').checked = registro.ativo;
        } else {
            document.getElementById('loc-ativo').checked = true;
        }

        App.abrirModal('modal-local');
    },

    async salvar(e) {
        e.preventDefault();
        const id = document.getElementById('loc-id').value;
        const btn = document.getElementById('loc-salvar');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const payload = {
            nome: document.getElementById('loc-nome').value.trim(),
            cidade: document.getElementById('loc-cidade').value.trim(),
            ativo: document.getElementById('loc-ativo').checked,
        };

        let error;
        if (id) {
            ({ error } = await HostingerAPI.from('locais').update(payload).eq('id', id));
        } else {
            ({ error } = await HostingerAPI.from('locais').insert(payload));
        }

        btn.disabled = false;
        btn.textContent = 'Salvar';

        if (error) {
            const msg = error.code === '23505'
                ? 'Já existe um local com esse nome nesta cidade.'
                : 'Erro ao salvar: ' + error.message;
            App.toast(msg, 'erro');
            return;
        }

        App.toast('Local salvo com sucesso.');
        App.fecharModal('modal-local');
        await Locais.carregarLista();
        await App.carregarListasBase();
    },
};

document.addEventListener('DOMContentLoaded', () => {
    // Cria o modal (se ainda não existir) e anexa os listeners
    Locais.garantirModal();
});

App.registrarView('locais', { onEnter: Locais.render });