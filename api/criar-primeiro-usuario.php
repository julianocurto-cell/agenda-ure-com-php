<?php
require_once __DIR__ . '/config.php';

// APAGUE ESTE ARQUIVO APÓS USAR!

$email = 'admin@seudominio.com';
$senha = 'Admin@2026!';
$nome  = 'Administrador';

$pdo = getPDO();

// Segurança: só funciona enquanto não existir nenhum usuário
if ((int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) {
    http_response_code(403);
    exit('Já existem usuários cadastrados. Apague este arquivo.');
}
$hash = password_hash($senha, PASSWORD_DEFAULT);

try {
    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (nome, email, senha_hash, escopo)
         VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$nome, $email, $hash, 'adm']);
    echo "✅ ADM criado: {$email} / {$senha}";
} catch (PDOException $e) {
    echo "❌ Erro: " . $e->getMessage();
}