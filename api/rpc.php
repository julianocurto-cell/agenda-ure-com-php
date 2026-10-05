<?php
require_once __DIR__ . '/config.php';

$user = exigirLogin();
$pdo = getPDO();
$func = $_GET['func'] ?? '';

if ($func === 'listar_usuarios_ativos') {
    $stmt = $pdo->query(
        'SELECT u.id, u.nome, u.email, u.funcao_id, f.nome AS funcao_nome
         FROM usuarios u
         LEFT JOIN funcoes f ON f.id = u.funcao_id
         WHERE u.ativo = 1
         ORDER BY u.nome ASC'
    );
    $usuarios = $stmt->fetchAll();
    foreach ($usuarios as &$u) {
        $u['funcoes'] = ['nome' => $u['funcao_nome']];
    }
    unset($u);

    jsonResponse($usuarios);
}

jsonResponse(['erro' => 'Função RPC não reconhecida'], 404);
