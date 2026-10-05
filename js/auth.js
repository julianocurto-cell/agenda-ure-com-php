// ============================================================
// ESTADO GLOBAL
// ============================================================
let USUARIO_ATUAL = null;

// Usado por App.afterLogin quando o cadastro não pode ser carregado
const Auth = {
  mostrarErroLogin(msg) {
    const el = document.getElementById('login-erro');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  },
};

// ============================================================
// INICIALIZAÇÃO — verifica se já existe sessão ativa
// ============================================================
async function initAuth() {
  try {
    const res = await HostingerAPI.auth.getSession();
    if (res.data && res.data.session) {
      // Sessão ativa
    } else {
      mostrarLogin();
    }
  } catch (err) {
    mostrarLogin();
  }

  const hash = window.location.hash;
  if (hash.startsWith('#reset')) {
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const token = params.get('token');
    if (token) abrirTelaReset(token);
  }
}

// ============================================================
// LOGIN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-login');
      const erroEl = document.getElementById('login-erro');
      
      if (erroEl) {
        erroEl.textContent = '';
        erroEl.hidden = true;
      }

      const email = document.getElementById('login-email').value.trim();
      const senha = document.getElementById('login-senha').value;

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Entrando...';
      }

      try {
        const resp = await fetch('api/auth.php?action=login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha })
        });

        const textoResposta = await resp.text();
        let data = {};
        try {
          data = textoResposta ? JSON.parse(textoResposta) : {};
        } catch (e) {
          console.error("Resposta não-JSON do servidor:", textoResposta);
        }

        if (!resp.ok) {
          throw new Error(data.erro || 'E-mail ou palavra-passe inválidos');
        }

        location.reload();
      } catch (err) {
        if (erroEl) {
          erroEl.textContent = err.message;
          erroEl.hidden = false;
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Entrar';
        }
      }
    });
  }
});

// ============================================================
// MOSTRAR TELA DE LOGIN
// ============================================================
function mostrarLogin() {
  const telaApp = document.getElementById('tela-app');
  const telaLogin = document.getElementById('tela-login');
  if (telaApp) telaApp.hidden = true;
  if (telaLogin) telaLogin.hidden = false;
}
