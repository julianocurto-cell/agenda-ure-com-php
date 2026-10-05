<?php
/**
 * Carregador minimalista de arquivo .env
 * Não usa Composer. Funciona em qualquer PHP 7.4+.
 *
 * Uso:
 *   require_once __DIR__ . '/env-loader.php';
 *   carregarEnv(__DIR__ . '/../.env');
 */

function carregarEnv(string $caminho): void {
    static $carregado = false;
    if ($carregado) return;
    $carregado = true;

    if (!is_file($caminho) || !is_readable($caminho)) {
        // Em produção, não exponha o caminho. Apenas falhe.
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['erro' => 'Configuração indisponível']);
        exit;
    }

    $linhas = file($caminho, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($linhas === false) {
        http_response_code(500);
        echo json_encode(['erro' => 'Falha ao ler configuração']);
        exit;
    }

    foreach ($linhas as $linha) {
        $linha = trim($linha);

        // Ignora comentários e linhas vazias
        if ($linha === '' || $linha[0] === '#') continue;

        // Ignora linhas sem "="
        if (strpos($linha, '=') === false) continue;

        [$chave, $valor] = explode('=', $linha, 2);
        $chave = trim($chave);
        $valor = trim($valor);

        // Remove aspas externas (simples ou duplas)
        if (strlen($valor) >= 2) {
            $primeiro = $valor[0];
            $ultimo   = $valor[strlen($valor) - 1];
            if (($primeiro === '"' && $ultimo === '"') ||
                ($primeiro === "'" && $ultimo === "'")) {
                $valor = substr($valor, 1, -1);
            }
        }

        // Suporta \n dentro de aspas duplas
        $valor = str_replace(['\n', '\r', '\t'], ["\n", "\r", "\t"], $valor);

        // Não sobrescreve variáveis já definidas no ambiente real
        if (getenv($chave) === false) {
            putenv("{$chave}={$valor}");
            $_ENV[$chave] = $valor;
            $_SERVER[$chave] = $valor;
        }
    }
}

/**
 * Lê uma variável de ambiente com fallback
 */
function env(string $chave, $padrao = null) {
    $valor = $_ENV[$chave] ?? getenv($chave);
    if ($valor === false || $valor === null || $valor === '') {
        return $padrao;
    }
    return $valor;
}

/**
 * Lê variável booleana (true/false/1/0/yes/no)
 */
function envBool(string $chave, bool $padrao = false): bool {
    $v = env($chave);
    if ($v === null) return $padrao;
    return in_array(strtolower((string)$v), ['1', 'true', 'yes', 'on'], true);
}

/**
 * Lê variável inteira
 */
function envInt(string $chave, int $padrao = 0): int {
    $v = env($chave);
    return $v === null ? $padrao : (int)$v;
}