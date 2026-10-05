/* ============================================================
   hostinger-api.js
   Cliente nativo de integração com a API PHP e MySQL da Hostinger.
   Substitui integralmente qualquer serviço em nuvem externo.
   ============================================================ */

/* Requisição JSON robusta: nunca quebra com resposta vazia/HTML e trata sessão expirada */
async function hostingerFetch(url, options = {}) {
    let resp;
    try {
        resp = await fetch(url, {
            credentials: 'same-origin',
            cache: 'no-store',
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
    } catch (err) {
        return { ok: false, status: 0, data: null, erro: 'Sem conexão com o servidor.' };
    }

    const texto = await resp.text();
    let data = null;
    try { data = texto ? JSON.parse(texto) : null; } catch (e) { data = null; }

    if (resp.status === 401 && typeof App !== 'undefined' && App.state && App.state.perfil) {
        // sessão expirou: volta para o login
        App.state.perfil = null;
        App.showLogin();
    }

    let erro = null;
    if (!resp.ok) {
        erro = (data && (data.erro || data.error)) ||
               `Erro do servidor (HTTP ${resp.status}). Verifique o log de erros do PHP.`;
    } else if (texto && data === null) {
        erro = 'Resposta inválida do servidor.';
    }
    return { ok: resp.ok && !erro, status: resp.status, data, erro };
}

class HostingerQueryBuilder {
    constructor(tabela) {
        this.tabela = tabela;
        this.filtros = {};
        this.ordenacoes = [];
        this.limite = null;
        this.updatePayload = null;
        this.isDelete = false;
        this.isCount = false;
    }

    select(campos = '*', options = {}) {
        if (options && options.count === 'exact') this.isCount = true;
        return this;
    }

    _valor(v) {
        if (v === true) return 1;
        if (v === false) return 0;
        return v;
    }

    eq(campo, valor) {
        this.filtros[campo] = this._valor(valor);
        if (this.updatePayload || this.isDelete) {
            return this.executeMutation();
        }
        return this;
    }

    gte(campo, valor) {
        this.filtros[campo === 'data' ? 'data_inicio' : campo + '_gte'] = valor;
        return this;
    }

    lte(campo, valor) {
        this.filtros[campo === 'data' ? 'data_fim' : campo + '_lte'] = valor;
        return this;
    }

    in(campo, valores) {
        this.filtros[campo + '_in'] = Array.isArray(valores) ? valores.join(',') : valores;
        return this;
    }

    // periodo: o servidor filtra por UM período por vez
    contains(campo, valores) {
        const val = Array.isArray(valores) ? (valores[0] || '') : valores;
        this.filtros[campo] = val;
        return this;
    }

    order(campo, { ascending = true } = {}) {
        this.ordenacoes.push(`${campo}:${ascending ? 'asc' : 'desc'}`);
        return this;
    }

    limit(n) {
        this.limite = n;
        return this;
    }

    async _executar() {
        const params = new URLSearchParams({ action: 'listar' });
        for (const [k, v] of Object.entries(this.filtros)) {
            if (v !== undefined && v !== null && v !== '') params.append(k, v);
        }
        if (this.ordenacoes.length) params.append('order', this.ordenacoes.join(','));
        if (this.limite) params.append('limit', this.limite);

        const r = await hostingerFetch(`api/${this.tabela}.php?${params.toString()}`);
        if (r.erro) return { data: null, count: 0, error: { message: r.erro } };

        const lista = Array.isArray(r.data) ? r.data : [];
        return { data: lista, count: lista.length, error: null };
    }

    then(resolve, reject) {
        return this._executar().then(resolve, reject);
    }

    async maybeSingle() {
        const res = await this._executar();
        if (res.error) return res;
        return { data: res.data.length > 0 ? res.data[0] : null, error: null };
    }

    async single() {
        const res = await this._executar();
        if (res.error) return res;
        if (res.data.length > 0) return { data: res.data[0], error: null };
        return { data: null, error: { message: 'Registro não encontrado' } };
    }

    async insert(payload) {
        const itens = Array.isArray(payload) ? payload : [payload];
        let ultimoId = null;

        for (const item of itens) {
            const r = await hostingerFetch(`api/${this.tabela}.php?action=criar`, {
                method: 'POST',
                body: JSON.stringify(item)
            });
            if (r.erro) return { data: null, error: { message: r.erro } };
            ultimoId = r.data && r.data.id;
        }
        return { data: [{ id: ultimoId }], error: null };
    }

    update(payload) {
        this.updatePayload = payload;
        return this;
    }

    delete() {
        this.isDelete = true;
        return this;
    }

    // Usa POST (em vez de PUT/DELETE), que passa em qualquer hospedagem compartilhada
    async executeMutation() {
        const id = this.filtros['id'];
        if (!id) return { data: null, error: { message: 'ID não informado' } };

        const acao = this.isDelete ? 'excluir' : 'editar';
        const url = `api/${this.tabela}.php?action=${acao}&id=${encodeURIComponent(id)}`;
        const body = JSON.stringify(this.isDelete ? {} : this.updatePayload);

        let r = await hostingerFetch(url, { method: 'POST', body });

        // Compatibilidade: se o servidor ainda tem um arquivo PHP antigo (que só
        // aceita PUT/DELETE), tenta de novo com o método clássico.
        if (r.status === 404 && /não encontrada/i.test(r.erro || '') && !/Agendamento/.test(r.erro)) {
            r = await hostingerFetch(url, { method: this.isDelete ? 'DELETE' : 'PUT', body: this.isDelete ? null : body });
        }
        if (r.erro) return { data: null, error: { message: r.erro } };
        return { data: r.data, error: null };
    }
}

const HostingerAPI = {
    from(tabela) {
        return new HostingerQueryBuilder(tabela);
    },

    async rpc(nomeFuncao) {
        const r = await hostingerFetch(`api/rpc.php?func=${encodeURIComponent(nomeFuncao)}`);
        if (r.erro) return { data: null, error: { message: r.erro } };
        return { data: r.data, error: null };
    },

    functions: {
        async invoke(nome, { body } = {}) {
            const r = await hostingerFetch('api/usuarios.php?action=invoke', {
                method: 'POST',
                body: JSON.stringify(body || {})
            });
            if (r.erro) return { data: null, error: { message: r.erro } };
            return { data: r.data, error: null };
        }
    },

    auth: {
        async getSession() {
            try {
                const resp = await fetch('api/auth.php?action=me', {
                    credentials: 'same-origin'
                });
                if (!resp.ok) return { data: { session: null }, error: null };
                const user = await resp.json();
                return {
                    data: {
                        session: {
                            user: { id: user.id, email: user.email }
                        }
                    },
                    error: null
                };
            } catch (e) {
                return { data: { session: null }, error: null };
            }
        },

        async signOut() {
            try {
                await fetch('api/auth.php?action=logout', { credentials: 'same-origin' });
            } catch (e) {}
            if (typeof App !== 'undefined' && App.showLogin) {
                App.showLogin();
            }
            return { error: null };
        },

        onAuthStateChange(callback) {
            // Sessão gerida nativamente por cookies HttpOnly no PHP
        }
    }
};
