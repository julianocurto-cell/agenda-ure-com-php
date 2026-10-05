<?php
require_once __DIR__ . '/config.php';

$user = exigirLogin();
$pdo = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'listar';

if ($method === 'GET') {
    $apenasAtivos = !isset($_GET['todos']);
    $sql = 'SELECT * FROM locais';
    if ($apenasAtivos) {
        $sql .= ' WHERE ativo = 1';
    }
    $sql .= ' ORDER BY nome ASC, cidade ASC';
    
    $stmt = $pdo->query($sql);
    jsonResponse($stmt->fetchAll());
}

if ($method === 'POST' && $action === 'criar') {
    exigirAdm();
    $input = lerJson();

    $nome   = trim($input['nome'] ?? '');
    $cidade = trim($input['cidade'] ?? '');

    if (!$nome || !$cidade) {
        jsonResponse(['erro' => 'Nome e cidade são obrigatórios'], 400);
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO locais (nome, cidade, ativo) VALUES (?, ?, 1)');
        $stmt->execute([$nome, $cidade]);
        jsonResponse(['ok' => true, 'id' => $pdo->lastInsertId()], 201);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            jsonResponse(['erro' => 'Já existe um local cadastrado com este nome nesta cidade'], 409);
        }
        jsonResponse(['erro' => 'Erro ao salvar local'], 500);
    }
}

if (($method === 'PUT' || $method === 'POST') && $action === 'editar') {
    exigirAdm();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) jsonResponse(['erro' => 'ID inválido'], 400);

    $input = lerJson();
    $nome   = trim($input['nome'] ?? '');
    $cidade = trim($input['cidade'] ?? '');
    $ativo  = isset($input['ativo']) ? (int)$input['ativo'] : 1;

    if (!$nome || !$cidade) {
        jsonResponse(['erro' => 'Nome e cidade são obrigatórios'], 400);
    }

    $stmt = $pdo->prepare('UPDATE locais SET nome = ?, cidade = ?, ativo = ? WHERE id = ?');
    $stmt->execute([$nome, $cidade, $ativo, $id]);
    jsonResponse(['ok' => true]);
}

jsonResponse(['erro' => 'Ação não encontrada'], 404);
