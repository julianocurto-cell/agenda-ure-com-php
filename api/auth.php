<?php
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// LOGIN
// ============================================================
if ($action === 'login' && $method === 'POST') {
    $in = lerJson();
    $email = strtolower(trim($in['email'] ?? ''));
    $senha = $in['senha'] ?? '';

    if (!$email || !$senha) {
        jsonResponse(['erro' => 'Informe e-mail e senha'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['erro' => 'E-mail inválido'], 400);
    }

    $pdo = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    // Usuário inexistente — resposta genérica para não revelar e-mails
    if (!$u) {
        registrarAcesso(null, $email, false, 'usuario_inexistente');
        usleep(300000); // atrasa 300ms para dificultar enumeração
        jsonResponse(['erro' => 'E-mail ou senha inválidos'], 401);
    }

    // Bloqueio por tentativas
    if ($u['bloqueado_ate'] && strtotime($u['bloqueado_ate']) > time()) {
        $resta = ceil((strtotime($u['bloqueado_ate']) - time()) / 60);
        registrarAcesso($u['id'], $email, false, 'bloqueado');
        jsonResponse([
            'erro' => "Conta bloqueada. Tente novamente em {$resta} minuto(s).",
            'codigo' => 'BLOQUEADO',
        ], 429);
    }

    // Verifica senha
    if (!password_verify($senha, $u['senha_hash'])) {
        $tentativas = $u['tentativas_falhas'] + 1;
        $bloqueio = null;

        if ($tentativas >= MAX_TENTATIVAS_LOGIN) {
            $bloqueio = date('Y-m-d H:i:s', time() + BLOQUEIO_MINUTOS * 60);
            $tentativas = 0;
        }

        $stmt = $pdo->prepare(
            'UPDATE usuarios SET tentativas_falhas = ?, bloqueado_ate = ? WHERE id = ?'
        );
        $stmt->execute([$tentativas, $bloqueio, $u['id']]);

        registrarAcesso($u['id'], $email, false, 'senha_incorreta');

        if ($bloqueio) {
            jsonResponse([
                'erro' => 'Muitas tentativas. Conta bloqueada por ' . BLOQUEIO_MINUTOS . ' minutos.',
                'codigo' => 'BLOQUEADO',
            ], 429);
        }
        jsonResponse(['erro' => 'E-mail ou senha inválidos'], 401);
    }

    // Usuário inativo
    if (!$u['ativo']) {
        registrarAcesso($u['id'], $email, false, 'inativo');
        jsonResponse([
            'erro' => 'Usuário inativo. Procure o administrador.',
            'codigo' => 'USUARIO_INATIVO',
        ], 403);
    }

    // Sucesso — regenera ID da sessão
    iniciarSessao();
    session_regenerate_id(true);
    $_SESSION['usuario_id']        = (int)$u['id'];
    $_SESSION['usuario_nome']      = $u['nome'];
    $_SESSION['usuario_email']     = $u['email'];
    $_SESSION['usuario_escopo']    = $u['escopo'];
    $_SESSION['usuario_funcao_id'] = $u['funcao_id'];
    $_SESSION['ultima_atividade']  = time();

    // Zera tentativas e registra último login
    $stmt = $pdo->prepare(
        'UPDATE usuarios
         SET tentativas_falhas = 0, bloqueado_ate = NULL
         WHERE id = ?'
    );
    $stmt->execute([$u['id']]);

    registrarAcesso($u['id'], $email, true);

    // Gera CSRF para o frontend
    $csrf = gerarCsrfToken();

    jsonResponse([
        'id'        => (int)$u['id'],
        'nome'      => $u['nome'],
        'email'     => $u['email'],
        'escopo'    => $u['escopo'],
        'funcao_id' => $u['funcao_id'],
        'csrf_token' => $csrf,
    ]);
}

// ============================================================
// LOGOUT
// ============================================================
if ($action === 'logout') {
    iniciarSessao();
    $uid = $_SESSION['usuario_id'] ?? null;
    if ($uid) {
        registrarAcesso((int)$uid, $_SESSION['usuario_email'] ?? '', true, 'logout');
    }
    session_unset();
    session_destroy();
    jsonResponse(['ok' => true]);
}

// ============================================================
// ME (verificar sessão atual)
// ============================================================
if ($action === 'me') {
    $u = exigirLogin();
    jsonResponse([
        'id'         => (int)$u['id'],
        'nome'       => $u['nome'],
        'email'      => $u['email'],
        'escopo'     => $u['escopo'],
        'funcao_id'  => $u['funcao_id'],
        'csrf_token' => gerarCsrfToken(),
    ]);
}

// ============================================================
// CRIAR USUÁRIO (apenas ADM)
// ============================================================
if ($action === 'criar' && $method === 'POST') {
    exigirAdm();
    $in = lerJson();

    $nome      = trim($in['nome'] ?? '');
    $email     = strtolower(trim($in['email'] ?? ''));
    $senha     = $in['senha'] ?? '';
    $escopo    = in_array($in['escopo'] ?? '', ['adm','user']) ? $in['escopo'] : 'user';
    $funcao_id = !empty($in['funcao_id']) ? (int)$in['funcao_id'] : null;

    if (!$nome || !$email || !$senha) {
        jsonResponse(['erro' => 'Nome, e-mail e senha são obrigatórios'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['erro' => 'E-mail inválido'], 400);
    }
    if (strlen($senha) < 8) {
        jsonResponse(['erro' => 'A senha precisa ter ao menos 8 caracteres'], 400);
    }

    $pdo = getPDO();
    $hash = password_hash($senha, PASSWORD_DEFAULT);

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO usuarios (nome, email, senha_hash, escopo, funcao_id)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$nome, $email, $hash, $escopo, $funcao_id]);
        jsonResponse(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            jsonResponse(['erro' => 'Este e-mail já está cadastrado'], 409);
        }
        jsonResponse(['erro' => 'Erro ao criar usuário'], 500);
    }
}

// ============================================================
// ALTERAR SENHA (próprio usuário)
// ============================================================
if ($action === 'alterar-senha' && $method === 'POST') {
    $user = exigirLogin();
    $in = lerJson();

    $senhaAtual = $in['senha_atual'] ?? '';
    $novaSenha  = $in['nova_senha'] ?? '';

    if (!$senhaAtual || !$novaSenha) {
        jsonResponse(['erro' => 'Preencha todos os campos'], 400);
    }
    if (strlen($novaSenha) < 8) {
        jsonResponse(['erro' => 'A nova senha precisa ter ao menos 8 caracteres'], 400);
    }

    $pdo = getPDO();
    $stmt = $pdo->prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($senhaAtual, $row['senha_hash'])) {
        jsonResponse(['erro' => 'Senha atual incorreta'], 401);
    }

    $novoHash = password_hash($novaSenha, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?');
    $stmt->execute([$novoHash, $user['id']]);

    jsonResponse(['ok' => true]);
}

// ============================================================
// RESET DE SENHA — SOLICITAR (gera token)
// ============================================================
if ($action === 'reset-solicitar' && $method === 'POST') {
    $in = lerJson();
    $email = strtolower(trim($in['email'] ?? ''));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['erro' => 'E-mail inválido'], 400);
    }

    $pdo = getPDO();
    $stmt = $pdo->prepare('SELECT id, nome, ativo FROM usuarios WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    // Resposta sempre positiva para não revelar existência do e-mail
    if ($u && $u['ativo']) {
        $token = bin2hex(random_bytes(32));
        $expira = date('Y-m-d H:i:s', time() + TOKEN_RESET_MINUTOS * 60);

        // Invalida tokens anteriores do mesmo tipo
        $pdo->prepare('UPDATE tokens SET usado = 1 WHERE usuario_id = ? AND tipo = ?')
            ->execute([$u['id'], 'reset_senha']);

        $pdo->prepare(
            'INSERT INTO tokens (usuario_id, token_hash, tipo, expira_em) VALUES (?, ?, ?, ?)'
        )->execute([$u['id'], hash('sha256', $token), 'reset_senha', $expira]);

        // Aqui você enviaria por e-mail. Exemplo de link:
        $link = "https://seudominio.com/#reset?token={$token}";

        // Em produção, use mail() ou SMTP:
        // mail($email, 'Redefinição de senha', "Acesse: {$link}");

        // Para ambiente de teste/homolog, retornamos o link:
        $resp = ['ok' => true, 'mensagem' => 'Se o e-mail existir, enviaremos instruções.'];
        if (APP_DEBUG) $resp['debug_link'] = $link; // só em desenvolvimento
        jsonResponse($resp);
    }

    jsonResponse(['ok' => true, 'mensagem' => 'Se o e-mail existir, enviaremos instruções.']);
}

// ============================================================
// RESET DE SENHA — CONFIRMAR (usa token)
// ============================================================
if ($action === 'reset-confirmar' && $method === 'POST') {
    $in = lerJson();
    $token = trim($in['token'] ?? '');
    $novaSenha = $in['nova_senha'] ?? '';

    if (!$token || !$novaSenha) {
        jsonResponse(['erro' => 'Token e nova senha são obrigatórios'], 400);
    }
    if (strlen($novaSenha) < 8) {
        jsonResponse(['erro' => 'A senha precisa ter ao menos 8 caracteres'], 400);
    }

    $pdo = getPDO();
    $stmt = $pdo->prepare(
        'SELECT id, usuario_id FROM tokens
         WHERE token_hash = ? AND tipo = ? AND usado = 0 AND expira_em > NOW()
         LIMIT 1'
    );
    $stmt->execute([hash('sha256', $token), 'reset_senha']);
    $tk = $stmt->fetch();

    if (!$tk) {
        jsonResponse(['erro' => 'Token inválido ou expirado'], 400);
    }

    $novoHash = password_hash($novaSenha, PASSWORD_DEFAULT);

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE usuarios SET senha_hash = ?, tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?')
            ->execute([$novoHash, $tk['usuario_id']]);
        $pdo->prepare('UPDATE tokens SET usado = 1 WHERE id = ?')
            ->execute([$tk['id']]);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        jsonResponse(['erro' => 'Erro ao redefinir senha'], 500);
    }
}

// ============================================================
jsonResponse(['erro' => 'Ação não encontrada'], 404);