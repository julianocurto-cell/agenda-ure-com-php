<?php
require_once __DIR__ . '/config.php';

$user = exigirLogin();
$pdo = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'listar';

if ($method === 'GET') {
    $apenasAtivos = !isset($_GET['todos']);
    $sql = 'SELECT * FROM tarefas';
    if ($apenasAtivos) {
        $sql .= ' WHERE ativo = 1';
    }
    $sql .= ' ORDER BY nome ASC';

    $stmt = $pdo->query($sql);
    jsonResponse($stmt->fetchAll());
}

if ($method === 'POST' && $action === 'criar') {
    exigirAdm();
    $input = lerJson();

    $nome      = trim($input['nome'] ?? '');
    $descricao = trim($input['descricao'] ?? '');

    if (!$nome) {
        jsonResponse(['erro' => 'Nome da tarefa é obrigatório'], 400);
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO tarefas (nome, descricao, ativo) VALUES (?, ?, 1)');
        $stmt->execute([$nome, $descricao ?: null]);
        jsonResponse(['ok' => true, 'id' => $pdo->lastInsertId()], 201);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            jsonResponse(['erro' => 'Já existe uma tarefa com esse nome'], 409);
        }
        jsonResponse(['erro' => 'Erro ao cadastrar tarefa'], 500);
    }
}

if (($method === 'PUT' || $method === 'POST') && $action === 'editar') {
    exigirAdm();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) jsonResponse(['erro' => 'ID inválido'], 400);

    $input = lerJson();
    $nome      = trim($input['nome'] ?? '');
    $descricao = trim($input['descricao'] ?? '');
    $ativo     = isset($input['ativo']) ? (int)$input['ativo'] : 1;

    if (!$nome) {
        jsonResponse(['erro' => 'Nome da tarefa é obrigatório'], 400);
    }

    $stmt = $pdo->prepare('UPDATE tarefas SET nome = ?, descricao = ?, ativo = ? WHERE id = ?');
    $stmt->execute([$nome, $descricao ?: null, $ativo, $id]);
    jsonResponse(['ok' => true]);
}

jsonResponse(['erro' => 'Ação não encontrada'], 404);
