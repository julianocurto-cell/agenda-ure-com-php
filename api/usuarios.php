<?php
require_once __DIR__ . '/config.php';

$user   = exigirLogin();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'listar';

// LISTAR (qualquer usuário logado: as telas de agenda/consolidado precisam dos nomes)
if ($method === 'GET' && $action === 'listar') {
    $where  = [];
    $params = [];

    if (!empty($_GET['id'])) {
        $where[] = 'u.id = ?'; $params[] = (int)$_GET['id'];
    }
    if (isset($_GET['ativo']) && $_GET['ativo'] !== '') {
        $where[] = 'u.ativo = ?';
        $params[] = in_array(strtolower((string)$_GET['ativo']), ['1', 'true'], true) ? 1 : 0;
    }

    $sql = 'SELECT u.id, u.nome, u.email, u.escopo, u.funcao_id, u.ativo, u.created_at,
                   f.nome AS funcao_nome
            FROM usuarios u
            LEFT JOIN funcoes f ON f.id = u.funcao_id';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY u.nome ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $usuarios = $stmt->fetchAll();
    foreach ($usuarios as &$u) {
        $u['funcoes'] = ['nome' => $u['funcao_nome']];
    }
    unset($u);

    jsonResponse($usuarios);
}

// A partir daqui, apenas ADM
if ($method === 'POST' && ($action === 'criar' || $action === 'invoke')) {
    exigirAdm();
    $input = lerJson();

    // Redefinição de senha de um usuário existente
    if (!empty($input['usuario_id']) && !empty($input['senha'])) {
        if (strlen($input['senha']) < 6) erroJson('A senha deve ter no mínimo 6 caracteres.');
        $hash = password_hash($input['senha'], PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')
            ->execute([$hash, (int)$input['usuario_id']]);
        jsonResponse(['ok' => true]);
    }

    $nome      = trim($input['nome'] ?? '');
    $email     = strtolower(trim($input['email'] ?? ''));
    $senha     = $input['senha'] ?? '';
    $escopo    = in_array($input['escopo'] ?? '', ['adm', 'user'], true) ? $input['escopo'] : 'user';
    $funcao_id = !empty($input['funcao_id']) ? (int)$input['funcao_id'] : null;
    $ativo     = isset($input['ativo']) ? ((int)$input['ativo'] ? 1 : 0) : 1;

    if (!$nome || !$email || !$senha) erroJson('Preencha nome, e-mail e senha.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) erroJson('E-mail inválido.');
    if (strlen($senha) < 6) erroJson('A senha deve ter no mínimo 6 caracteres.');

    try {
        $pdo->prepare(
            'INSERT INTO usuarios (nome, email, senha_hash, escopo, funcao_id, ativo)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), $escopo, $funcao_id, $ativo]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') erroJson('Já existe um usuário com este e-mail.', 409);
        throw $e;
    }

    jsonResponse(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
}

if (($method === 'PUT' || $method === 'POST') && $action === 'editar') {
    $adm = exigirAdm();
    $id  = (int)($_GET['id'] ?? 0);
    if (!$id) erroJson('ID inválido.');

    $input     = lerJson();
    $nome      = trim($input['nome'] ?? '');
    $email     = strtolower(trim($input['email'] ?? ''));
    $escopo    = in_array($input['escopo'] ?? '', ['adm', 'user'], true) ? $input['escopo'] : 'user';
    $funcao_id = !empty($input['funcao_id']) ? (int)$input['funcao_id'] : null;
    $ativo     = isset($input['ativo']) ? ((int)$input['ativo'] ? 1 : 0) : 1;

    if (!$nome) erroJson('Nome é obrigatório.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) erroJson('E-mail inválido.');

    // Evita o ADM se trancar para fora do sistema
    if ($id === (int)$adm['id'] && ($escopo !== 'adm' || !$ativo)) {
        erroJson('Você não pode remover seu próprio acesso de administrador nem se desativar.');
    }

    try {
        if ($email !== '') {
            $pdo->prepare('UPDATE usuarios SET nome = ?, email = ?, escopo = ?, funcao_id = ?, ativo = ? WHERE id = ?')
                ->execute([$nome, $email, $escopo, $funcao_id, $ativo, $id]);
        } else { // e-mail vazio = mantém o atual
            $pdo->prepare('UPDATE usuarios SET nome = ?, escopo = ?, funcao_id = ?, ativo = ? WHERE id = ?')
                ->execute([$nome, $escopo, $funcao_id, $ativo, $id]);
        }
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') erroJson('Já existe um usuário com este e-mail.', 409);
        throw $e;
    }

    jsonResponse(['ok' => true]);
}

// ALTERAR SENHA DE QUALQUER USUÁRIO (ADM)  — POST ?action=senha  {usuario_id, senha}
if ($method === 'POST' && $action === 'senha') {
    exigirAdm();
    $input = lerJson();
    $alvo  = (int)($input['usuario_id'] ?? ($_GET['id'] ?? 0));
    $senha = (string)($input['senha'] ?? '');

    if (!$alvo) erroJson('Usuário não informado.');
    if (strlen($senha) < 6) erroJson('A senha deve ter no mínimo 6 caracteres.');

    $existe = $pdo->prepare('SELECT id FROM usuarios WHERE id = ?');
    $existe->execute([$alvo]);
    if (!$existe->fetch()) erroJson('Usuário não encontrado.', 404);

    // 1) a troca de senha em si
    $pdo->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')
        ->execute([password_hash($senha, PASSWORD_DEFAULT), $alvo]);

    // 2) desbloqueio da conta (não impede a troca caso essas colunas não existam)
    try {
        $pdo->prepare('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?')
            ->execute([$alvo]);
    } catch (Throwable $e) {
        error_log('[usuarios/senha] desbloqueio ignorado: ' . $e->getMessage());
    }
    jsonResponse(['ok' => true]);
}

// EXCLUIR USUÁRIO (ADM) — POST/DELETE ?action=excluir&id=N[&forcar=1]
// Se o usuário tiver visitas, responde 409 com a quantidade; com forcar=1 apaga as visitas junto.
if (($method === 'POST' || $method === 'DELETE') && $action === 'excluir') {
    $adm = exigirAdm();
    $id  = (int)($_GET['id'] ?? 0);
    if (!$id) erroJson('ID inválido.');
    if ($id === (int)$adm['id']) erroJson('Você não pode excluir o seu próprio usuário.');

    $existe = $pdo->prepare('SELECT id FROM usuarios WHERE id = ?');
    $existe->execute([$id]);
    if (!$existe->fetch()) erroJson('Usuário não encontrado.', 404);

    $cont = $pdo->prepare('SELECT COUNT(*) FROM agendamentos WHERE usuario_id = ?');
    $cont->execute([$id]);
    $visitas = (int)$cont->fetchColumn();

    if ($visitas > 0 && empty($_GET['forcar'])) {
        jsonResponse([
            'erro' => "Este usuário possui {$visitas} visita(s) registrada(s).",
            'error' => "Este usuário possui {$visitas} visita(s) registrada(s).",
            'visitas' => $visitas,
        ], 409);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM agendamentos WHERE usuario_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    jsonResponse(['ok' => true, 'visitas_removidas' => $visitas]);
}

erroJson('Ação não encontrada.', 404);
