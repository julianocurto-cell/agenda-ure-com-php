// ============================================================
// API BASE — chama os endpoints PHP
// ============================================================
const API_BASE = 'api'; // caminho relativo

async function apiFetch(url, options = {}) {
  const resp = await fetch(API_BASE + '/' + url, {
    credentials: 'same-origin', // envia cookies de sessão
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.erro || 'Erro na requisição');
  }
  return data;
}

// ============================================================
// AUTH
// ============================================================
const Auth = {
  async login(email, senha) {
    return apiFetch('auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    });
  },
  async logout() {
    return apiFetch('auth.php?action=logout');
  },
  async me() {
    return apiFetch('auth.php?action=me');
  },
};

// ============================================================
// AGENDAMENTOS
// ============================================================
const Agendamentos = {
  async listar(filtros = {}) {
    const params = new URLSearchParams({ action: 'listar', ...filtros });
    return apiFetch('agendamentos.php?' + params.toString());
  },
  async criar(dados) {
    return apiFetch('agendamentos.php?action=criar', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
  },
  async editar(id, dados) {
    return apiFetch('agendamentos.php?action=editar&id=' + id, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
  },
  async excluir(id) {
    return apiFetch('agendamentos.php?action=excluir&id=' + id, { method: 'DELETE' });
  },
};

// ============================================================
// USUÁRIOS
// ============================================================
const Usuarios = {
  async listar() {
    return apiFetch('usuarios.php?action=listar');
  },
  async editar(id, dados) {
    return apiFetch('usuarios.php?action=editar&id=' + id, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
  },
};

// ============================================================
// AUXILIARES
// ============================================================
const Locais = {
  async listar() { return apiFetch('locais.php?action=listar'); },
};
const Tarefas = {
  async listar() { return apiFetch('tarefas.php?action=listar'); },
};
const Funcoes = {
  async listar() { return apiFetch('funcoes.php?action=listar'); },
};