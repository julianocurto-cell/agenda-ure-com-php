/* ============================================================
   usuarios.js
   Tela "Cadastro" (somente ADM).
   ============================================================ */

const Usuarios = {
    editando: true,   // true = edição; false = criação

    async render() {
        const container = document.getElementById('view-cadastro');
        container.innerHTML = `
            <div class="view-cabecalho view-cabecalho-acao">
                <div>
                    <h1>Cadastro de usuários</h1>
                    <p class="subtitulo">Crie e gerencie os usuários da rede.</p>
                </div>
                <button class="btn btn-primario" id="btn-novo-usuario">+ Novo usuário</button>
            </div>
            <div id="usu-lista"><div class="carregando">Carregando usuários...</div></div>
        `;

        document.getElementById('btn-novo-usuario').addEventListener('click', Usuarios.abrirNovo);
        await Usuarios.carregarLista();
    },

    async carregarLista() {
        const { data, error } = await HostingerAPI
            .from('usuarios')
            .select('id, nome, email, escopo, ativo, funcao_id, funcoes(nome)')
            .order('nome');

        const listaEl = document.getElementById('usu-lista');

        if (error) {
            listaEl.innerHTML = `<p class="vazio">Erro ao carregar usuários.</p>`;
            return;
        }

        Usuarios._cache = data || [];

        listaEl.innerHTML = `
            <div class="tabela-wrap">
                <table class="tabela">
                    <thead>
                        <tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Escopo</th><th>Ativo</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${(data || []).map(u => `
                            <tr>
                                <td>${App.escapeHTML(u.nome)}</td>
                                <td>${App.escapeHTML(u.email)}</td>
                                <td>${App.escapeHTML(u.funcoes?.nome || '—')}</td>
                                <td>${u.escopo === 'adm' ? 'ADM' : 'USER'}</td>
                                <td>${u.ativo ? '<span class="badge badge-concluido">Ativo</span>' : '<span class="badge badge-inativo">Inativo</span>'}</td>
                                <td class="acoes-linha">
                                    <button class="btn btn-link" data-editar="${u.id}">Editar</button>
                                    <button class="btn btn-link" data-senha="${u.id}">Senha</button>
                                    ${Number(u.id) === Number(App.state.perfil?.id) ? '' : `<button class="btn btn-link" style="color:#c0392b" data-excluir="${u.id}">Excluir</button>`}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        listaEl.querySelectorAll('[data-editar]').forEach(btn => {
            btn.addEventListener('click', () => Usuarios.abrirFormulario(btn.dataset.editar));
        });
        listaEl.querySelectorAll('[data-senha]').forEach(btn => {
            btn.addEventListener('click', () => Usuarios.abrirSenha(btn.dataset.senha));
        });
        listaEl.querySelectorAll('[data-excluir]').forEach(btn => {
            btn.addEventListener('click', () => Usuarios.excluir(btn.dataset.excluir));
        });
    },

    // ---------- CRIAR ----------
    abrirNovo() {
        Usuarios.editando = false;

        App.preencherSelect(document.getElementById('usu-funcao'), App.state.funcoes, 'Sem função definida');

        document.getElementById('modal-usuario-titulo').textContent = 'Novo usuário';
        document.getElementById('usu-grupo-senha').hidden = false;
        document.getElementById('usu-grupo-nova-senha').hidden = true;

        document.getElementById('usu-id').value = '';
        document.getElementById('usu-nome').value = '';
        document.getElementById('usu-email').value = '';
        document.getElementById('usu-senha').value = '';
        document.getElementById('usu-nova-senha').value = '';
        document.getElementById('usu-funcao').value = '';
        document.getElementById('usu-escopo').value = 'user';
        document.getElementById('usu-ativo').checked = true;

        document.getElementById('usu-senha').required = true;

        App.abrirModal('modal-usuario');
    },

    // ---------- EDITAR ----------
    abrirFormulario(id) {
        // Conversão numérica robusta para evitar falha de tipo (string vs int)
        const u = Usuarios._cache.find(x => Number(x.id) === Number(id));
        if (!u) {
            App.toast('Usuário não encontrado.', 'erro');
            return;
        }

        Usuarios.editando = true;

        App.preencherSelect(document.getElementById('usu-funcao'), App.state.funcoes, 'Sem função definida');

        document.getElementById('modal-usuario-titulo').textContent = 'Editar usuário';
        document.getElementById('usu-grupo-senha').hidden = true;
        document.getElementById('usu-grupo-nova-senha').hidden = false;

        document.getElementById('usu-id').value = u.id;
        document.getElementById('usu-nome').value = u.nome || '';
        document.getElementById('usu-email').value = u.email || '';
        document.getElementById('usu-nova-senha').value = '';
        document.getElementById('usu-funcao').value = u.funcao_id || '';
        document.getElementById('usu-escopo').value = u.escopo;
        document.getElementById('usu-ativo').checked = Boolean(u.ativo);

        document.getElementById('usu-senha').required = false;

        App.abrirModal('modal-usuario');
    },

    // ---------- SALVAR (roteia) ----------
    async salvar(e) {
        e.preventDefault();
        if (Usuarios.editando) {
            return Usuarios.salvarEdicao();
        }
        return Usuarios.salvarNovo();
    },

    // ---------- SALVAR: edição ----------
    async salvarEdicao() {
        const id = document.getElementById('usu-id').value;
        const btn = document.getElementById('usu-salvar');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const payload = {
            nome: document.getElementById('usu-nome').value.trim(),
            email: document.getElementById('usu-email').value.trim(),
            funcao_id: document.getElementById('usu-funcao').value || null,
            escopo: document.getElementById('usu-escopo').value,
            ativo: document.getElementById('usu-ativo').checked ? 1 : 0,
        };

        const { error } = await HostingerAPI.from('usuarios').update(payload).eq('id', id);

        if (error) {
            btn.disabled = false;
            btn.textContent = 'Salvar';
            App.toast('Erro ao salvar: ' + error.message, 'erro');
            return;
        }

        const novaSenha = document.getElementById('usu-nova-senha').value;
        if (novaSenha) {
            const r = await hostingerFetch('api/usuarios.php?action=senha', {
                method: 'POST',
                body: JSON.stringify({ usuario_id: Number(id), senha: novaSenha })
            });

            if (r.erro) {
                btn.disabled = false;
                btn.textContent = 'Salvar';
                App.toast('Dados salvos, mas a senha falhou: ' + r.erro, 'erro');
                await Usuarios.carregarLista();
                return;
            }
        }

        btn.disabled = false;
        btn.textContent = 'Salvar';
        App.toast(novaSenha ? 'Utilizador e palavra-passe atualizados.' : 'Utilizador atualizado com sucesso.');
        App.fecharModal('modal-usuario');
        await Usuarios.carregarLista();

        if (Number(id) === Number(App.state.perfil?.id)) {
            App.state.perfil.nome = payload.nome;
            App.state.perfil.email = payload.email;
            App.preencherCabecalho();
        }
    },

    // ---------- ALTERAR SENHA (ADM, qualquer usuário) ----------
    abrirSenha(id) {
        const u = Usuarios._cache.find(x => Number(x.id) === Number(id));
        if (!u) return;
        document.getElementById('sen-id').value = u.id;
        document.getElementById('sen-nova').value = '';
        document.getElementById('modal-senha-titulo').textContent = 'Alterar senha — ' + u.nome;
        App.abrirModal('modal-senha');
        document.getElementById('sen-nova').focus();
    },

    async salvarSenha(e) {
        e.preventDefault();
        const id = Number(document.getElementById('sen-id').value);
        const senha = document.getElementById('sen-nova').value;
        const btn = document.getElementById('sen-salvar');

        if (senha.length < 6) {
            App.toast('A senha deve ter no mínimo 6 caracteres.', 'erro');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Salvando...';
        const r = await hostingerFetch('api/usuarios.php?action=senha', {
            method: 'POST',
            body: JSON.stringify({ usuario_id: id, senha })
        });
        btn.disabled = false;
        btn.textContent = 'Salvar senha';

        if (r.erro) {
            App.toast('Erro ao alterar a senha: ' + r.erro, 'erro');
            return;
        }
        App.toast('Senha alterada com sucesso.');
        App.fecharModal('modal-senha');
    },

    // ---------- EXCLUIR (ADM) ----------
    async excluir(id) {
        const u = Usuarios._cache.find(x => Number(x.id) === Number(id));
        if (!u) return;

        if (!confirm(`Excluir o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return;

        let r = await hostingerFetch(`api/usuarios.php?action=excluir&id=${Number(id)}`, { method: 'POST', body: '{}' });

        // Tem visitas: pede segunda confirmação para apagar tudo junto
        if (r.status === 409 && r.data && r.data.visitas) {
            const ok = confirm(
                `${u.nome} possui ${r.data.visitas} visita(s) registrada(s).\n\n` +
                `Excluir o usuário E essas ${r.data.visitas} visita(s)?\n` +
                `(Para manter o histórico, cancele e apenas desative o usuário em "Editar".)`
            );
            if (!ok) return;
            r = await hostingerFetch(`api/usuarios.php?action=excluir&id=${Number(id)}&forcar=1`, { method: 'POST', body: '{}' });
        }

        if (r.erro) {
            App.toast('Erro ao excluir: ' + r.erro, 'erro');
            return;
        }
        App.toast('Usuário excluído.');
        await Usuarios.carregarLista();
    },

    // ---------- SALVAR: criação ----------
    async salvarNovo() {
        const btn = document.getElementById('usu-salvar');
        btn.disabled = true;
        btn.textContent = 'A criar...';

        const payload = {
            nome: document.getElementById('usu-nome').value.trim(),
            email: document.getElementById('usu-email').value.trim(),
            senha: document.getElementById('usu-senha').value,
            funcao_id: document.getElementById('usu-funcao').value || null,
            escopo: document.getElementById('usu-escopo').value,
            ativo: document.getElementById('usu-ativo').checked ? 1 : 0,
        };

        const { data, error } = await HostingerAPI.functions.invoke('criar-usuario', {
            body: payload,
        });

        btn.disabled = false;
        btn.textContent = 'Salvar';

        if (error || data?.error) {
            App.toast(error?.message || data?.error || 'Falha ao criar utilizador.', 'erro');
            return;
        }

        App.toast('Utilizador criado com sucesso.');
        App.fecharModal('modal-usuario');
        await Usuarios.carregarLista();
    },
};

document.addEventListener('DOMContentLoaded', () => {
    const formUsuario = document.getElementById('form-usuario');
    if (formUsuario) {
        formUsuario.addEventListener('submit', Usuarios.salvar);
    }
    const formSenha = document.getElementById('form-senha');
    if (formSenha) formSenha.addEventListener('submit', Usuarios.salvarSenha);
    const senCancelar = document.getElementById('sen-cancelar');
    if (senCancelar) senCancelar.addEventListener('click', () => App.fecharModal('modal-senha'));
    const btnCancelar = document.getElementById('usu-cancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => App.fecharModal('modal-usuario'));
    }
});

App.registrarView('cadastro', { onEnter: Usuarios.render });
